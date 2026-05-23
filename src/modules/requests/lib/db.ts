/**
 * @fileoverview Server-side functions for the purchase requests database.
 */
"use server";

import { getDb, getAllRoles as getAllRolesFromMain } from '../../core/lib/db';
import { getAllUsers as getAllUsersFromMain } from '../../core/lib/auth';
import { logInfo, logError, logWarn } from '../../core/lib/logger';
import type { PurchaseRequest, RequestSettings, UpdateRequestStatusPayload, PurchaseRequestHistoryEntry, UpdatePurchaseRequestPayload, RejectCancellationPayload, PurchaseRequestStatus, DateRange, AdministrativeAction, AdministrativeActionPayload, StockInfo, ErpOrderHeader, ErpOrderLine, User, PurchaseSuggestion, PurchaseRequestPriority, ErpPurchaseOrderHeader, ErpPurchaseOrderLine } from '../../core/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { executeQuery } from '@/modules/core/lib/sql-service';
import { getAllProducts, getAllStock, getAllCustomers } from '@/modules/core/lib/db';
import { REQUESTS_TABLES } from './schema';
import { authorizeAction } from '@/modules/core/lib/auth-guard';

// Unified DB configuration

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};


// Helper function to ensure complex fields are in the correct format (array).
const sanitizeRequest = (request: any): PurchaseRequest => {
  const sanitized = { ...request };
  if (sanitized.sourceOrders && typeof sanitized.sourceOrders === 'string') {
    try {
      sanitized.sourceOrders = JSON.parse(sanitized.sourceOrders);
    } catch {
      sanitized.sourceOrders = [];
    }
  } else if (!Array.isArray(sanitized.sourceOrders)) {
      sanitized.sourceOrders = [];
  }
  
  if (sanitized.involvedClients && typeof sanitized.involvedClients === 'string') {
    try {
      sanitized.involvedClients = JSON.parse(sanitized.involvedClients);
    } catch {
      sanitized.involvedClients = [];
    }
  } else if (!Array.isArray(sanitized.involvedClients)) {
      sanitized.involvedClients = [];
  }

  try {
      if (sanitized.analysis && typeof sanitized.analysis === 'string') {
          sanitized.analysis = JSON.parse(sanitized.analysis);
      } else if (typeof sanitized.analysis !== 'object') { // Allow null, but not other non-object types
          sanitized.analysis = undefined;
      }
  } catch {
      sanitized.analysis = undefined;
  }

  return sanitized as PurchaseRequest;
};


// Database initialization is now handled by the central orchestrator in core/lib/db.ts


export async function getSettings(): Promise<RequestSettings> {
    const db = await getDb();
    const settingsRows = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.settings}`).all() as { key: string; value: string }[];
    
    const settings: RequestSettings = {
        requestPrefix: 'SC-',
        nextRequestNumber: 1,
        showCustomerTaxId: true,
        routes: [],
        shippingMethods: [],
        useWarehouseReception: false,
        useErpEntry: false,
        pdfTopLegend: '',
        pdfExportColumns: [],
        pdfPaperSize: 'letter',
        pdfOrientation: 'portrait',
    };

    for (const row of settingsRows) {
        if (row.key === 'nextRequestNumber') settings.nextRequestNumber = Number(row.value);
        else if (row.key === 'requestPrefix') settings.requestPrefix = row.value;
        else if (row.key === 'routes') settings.routes = JSON.parse(row.value);
        else if (row.key === 'shippingMethods') settings.shippingMethods = JSON.parse(row.value);
        else if (row.key === 'useWarehouseReception') settings.useWarehouseReception = row.value === 'true';
        else if (row.key === 'useErpEntry') settings.useErpEntry = row.value === 'true';
        else if (row.key === 'showCustomerTaxId') settings.showCustomerTaxId = row.value === 'true';
        else if (row.key === 'pdfTopLegend') settings.pdfTopLegend = row.value;
        else if (row.key === 'pdfExportColumns') settings.pdfExportColumns = JSON.parse(row.value);
        else if (row.key === 'pdfPaperSize') settings.pdfPaperSize = row.value as 'letter' | 'legal';
        else if (row.key === 'pdfOrientation') settings.pdfOrientation = row.value as 'portrait' | 'landscape';
    }
    return settings;
}

export async function saveSettings(settings: RequestSettings): Promise<void> {
    await authorizeAction('admin:settings:requests');
    const db = await getDb();
    
    const transaction = db.transaction((settingsToUpdate) => {
        const keys: (keyof RequestSettings)[] = ['requestPrefix', 'nextRequestNumber', 'routes', 'shippingMethods', 'useWarehouseReception', 'useErpEntry', 'showCustomerTaxId', 'pdfTopLegend', 'pdfExportColumns', 'pdfPaperSize', 'pdfOrientation'];
        for (const key of keys) {
             if (settingsToUpdate[key] !== undefined) {
                const value = typeof settingsToUpdate[key] === 'object' ? JSON.stringify(settingsToUpdate[key]) : String(settingsToUpdate[key]);
                db.prepare(`INSERT OR REPLACE INTO ${REQUESTS_TABLES.settings} (key, value) VALUES (?, ?)`).run(key, value);
            }
        }
    });

    transaction(settings);
}


export async function getRequests(options: {
    page: number;
    pageSize: number;
    isArchived: boolean;
    filters: {
        searchTerm?: string;
        status?: string[];
        classification?: string;
        showOnlyMy?: string;
        dateRange?: DateRange;
    };
}): Promise<{ requests: PurchaseRequest[], totalActive: number, totalArchived: number }> {
    const db = await getDb();
    const { page, pageSize, isArchived, filters } = options;

    const settings = await getSettings();
    const finalStatus = settings.useErpEntry ? 'entered-erp' : (settings.useWarehouseReception ? 'received-in-warehouse' : 'ordered');
    const archivedStatuses = [`'${finalStatus}'`, `'canceled'`];
    
    const buildQueryParts = async (isArchivedQuery: boolean) => {
        let whereClauses: string[] = [];
        let queryParams: any[] = [];
        let itemIdsFromBarcode: string[] = [];

        if (filters.searchTerm) {
            const productResults = db.prepare(`
                SELECT id FROM core_products WHERE barcode LIKE ?
            `).all(`%${filters.searchTerm}%`);
            itemIdsFromBarcode = productResults.map((p: any) => p.id);
        }

        if (isArchivedQuery) {
            whereClauses.push(`status IN (${archivedStatuses.join(',')})`);
        } else {
            whereClauses.push(`status NOT IN (${archivedStatuses.join(',')})`);
        }

        if (filters.searchTerm) {
            let searchClause = `(consecutive LIKE ? OR clientName LIKE ? OR itemDescription LIKE ? OR itemId LIKE ? OR erpOrderNumber LIKE ?)`;
            const searchTermParam = `%${filters.searchTerm}%`;
            queryParams.push(searchTermParam, searchTermParam, searchTermParam, searchTermParam, searchTermParam);
            if (itemIdsFromBarcode.length > 0) {
                searchClause = `(${searchClause} OR itemId IN (${itemIdsFromBarcode.map(() => '?').join(',')}))`;
                queryParams.push(...itemIdsFromBarcode);
            }
            whereClauses.push(searchClause);
        }

        if (filters.status && filters.status.length > 0) {
            whereClauses.push(`status IN (${filters.status.map(() => '?').join(',')})`);
            queryParams.push(...filters.status);
        }
        
        if (filters.showOnlyMy) {
            whereClauses.push(`requestedBy = ?`);
            queryParams.push(filters.showOnlyMy);
        }

        if (filters.dateRange?.from) {
            whereClauses.push("requestDate >= ?");
            queryParams.push(filters.dateRange.from.toISOString());
        }
        if (filters.dateRange?.to) {
            const toDate = new Date(filters.dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            whereClauses.push("requestDate <= ?");
            queryParams.push(toDate.toISOString());
        }

        if (filters.classification && filters.classification !== 'all') {
            const productIds = db.prepare(`SELECT id FROM core_products WHERE classification = ?`).all(filters.classification).map((p: any) => p.id);
            if (productIds.length > 0) {
                whereClauses.push(`itemId IN (${productIds.map(() => '?').join(',')})`);
                queryParams.push(...productIds);
            } else {
                whereClauses.push('1 = 0');
            }
        }

        return { whereClause: whereClauses.join(' AND '), params: queryParams };
    };

    const activeQueryParts = await buildQueryParts(false);
    const archivedQueryParts = await buildQueryParts(true);

    const totalActive = (db.prepare(`SELECT COUNT(*) as count FROM ${REQUESTS_TABLES.requests} WHERE ${activeQueryParts.whereClause || '1=1'}`).get(...activeQueryParts.params) as { count: number }).count;
    const totalArchived = (db.prepare(`SELECT COUNT(*) as count FROM ${REQUESTS_TABLES.requests} WHERE ${archivedQueryParts.whereClause || '1=1'}`).get(...archivedQueryParts.params) as { count: number }).count;
    
    const targetQueryParts = isArchived ? archivedQueryParts : activeQueryParts;
    let finalQuery = `SELECT * FROM ${REQUESTS_TABLES.requests} WHERE ${targetQueryParts.whereClause || '1=1'} ORDER BY requestDate DESC LIMIT ? OFFSET ?`;
    let finalParams = [...targetQueryParts.params, pageSize, page * pageSize];
    
    const requestsRaw = db.prepare(finalQuery).all(...finalParams) as any[];
    const requests = requestsRaw.map(sanitizeRequest);
    
    return { requests, totalActive, totalArchived };
}

export async function addRequest(request: Omit<PurchaseRequest, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'deliveredQuantity' | 'receivedInWarehouseBy' | 'receivedDate' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'>, requestedBy: string): Promise<PurchaseRequest> {
    await authorizeAction('requests:create');
    const db = await getDb();
    
    const settings = await getSettings();
    const nextNumber = settings.nextRequestNumber || 1;
    const prefix = settings.requestPrefix || 'SC-';

    const newRequest: Omit<PurchaseRequest, 'id'> = {
        ...request,
        clientId: request.clientId.toUpperCase(),
        itemId: request.itemId.toUpperCase(),
        requestedBy: requestedBy,
        consecutive: `${prefix}${nextNumber.toString().padStart(5, '0')}`,
        requestDate: new Date().toISOString(),
        status: 'pending',
        reopened: false,
    };
    
    const preparedRequest = {
        ...newRequest,
        unitSalePrice: newRequest.unitSalePrice ?? null,
        salePriceCurrency: newRequest.salePriceCurrency || 'CRC',
        requiresCurrency: newRequest.requiresCurrency ? 1 : 0,
        erpOrderNumber: newRequest.erpOrderNumber || null,
        erpOrderLine: newRequest.erpOrderLine || null,
        manualSupplier: newRequest.manualSupplier || null,
        route: newRequest.route || null,
        shippingMethod: newRequest.shippingMethod || null,
        purchaseOrder: newRequest.purchaseOrder || null,
        notes: newRequest.notes || null,
        inventory: newRequest.inventory ?? null,
        inventoryErp: newRequest.inventoryErp ?? null,
        reopened: newRequest.reopened ? 1 : 0,
        purchaseType: newRequest.purchaseType || 'single',
        arrivalDate: newRequest.arrivalDate || null,
        clientTaxId: newRequest.clientTaxId || null,
        sourceOrders: JSON.stringify(newRequest.sourceOrders || []),
        involvedClients: JSON.stringify(newRequest.involvedClients || []),
        analysis: newRequest.analysis ? JSON.stringify(newRequest.analysis) : null,
    };

    try {
        const transaction = db.transaction(() => {
            const insertStmt = db.prepare(`
                INSERT INTO ${REQUESTS_TABLES.requests} (
                    consecutive, requestDate, requiredDate, clientId, clientName, clientTaxId,
                    itemId, itemDescription, quantity, unitSalePrice, salePriceCurrency, requiresCurrency,
                    erpOrderNumber, erpOrderLine, manualSupplier, route, shippingMethod, purchaseOrder,
                    status, pendingAction, notes, requestedBy, reopened, inventory, inventoryErp, priority, purchaseType, arrivalDate,
                    sourceOrders, involvedClients, analysis
                ) VALUES (
                    @consecutive, @requestDate, @requiredDate, @clientId, @clientName, @clientTaxId,
                    @itemId, @itemDescription, @quantity, @unitSalePrice, @salePriceCurrency, @requiresCurrency,
                    @erpOrderNumber, @erpOrderLine, @manualSupplier, @route, @shippingMethod, @purchaseOrder,
                    @status, @pendingAction, @notes, @requestedBy, @reopened, @inventory, @inventoryErp, @priority, @purchaseType, @arrivalDate,
                    @sourceOrders, @involvedClients, @analysis
                )
            `);
            
            const info = insertStmt.run(preparedRequest);
            const newRequestId = info.lastInsertRowid as number;

            db.prepare(`UPDATE ${REQUESTS_TABLES.settings} SET value = ? WHERE key = 'nextRequestNumber'`).run(nextNumber + 1);
            
            const historyStmt = db.prepare(`INSERT INTO ${REQUESTS_TABLES.history} (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
            historyStmt.run(newRequestId, new Date().toISOString(), 'pending', newRequest.requestedBy, 'Solicitud creada');
            
            return newRequestId;
        });

        const newId = transaction();
        const createdRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(newId) as any;
        return sanitizeRequest(createdRequest);
    } catch (error: any) {
        logError("Failed to create request in DB", { context: 'addRequest DB transaction', error: error.message, details: preparedRequest });
        throw error;
    }
}

export async function updateRequest(payload: UpdatePurchaseRequestPayload): Promise<PurchaseRequest> {
    const db = await getDb();
    const { requestId, updatedBy, ...dataToUpdate } = payload;
    
    const currentRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(requestId) as PurchaseRequest | undefined;
    if (!currentRequest) {
        throw new Error("Request not found.");
    }
    
    let hasBeenModified = currentRequest.hasBeenModified;
    if (['approved', 'ordered'].includes(currentRequest.status)) {
        hasBeenModified = true;
    }

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE ${REQUESTS_TABLES.requests} SET
                requiredDate = @requiredDate,
                clientId = @clientId,
                clientName = @clientName,
                clientTaxId = @clientTaxId,
                itemId = @itemId,
                itemDescription = @itemDescription,
                quantity = @quantity,
                unitSalePrice = @unitSalePrice,
                salePriceCurrency = @salePriceCurrency,
                requiresCurrency = @requiresCurrency,
                erpOrderNumber = @erpOrderNumber,
                erpOrderLine = @erpOrderLine,
                manualSupplier = @manualSupplier,
                route = @route,
                shippingMethod = @shippingMethod,
                purchaseOrder = @purchaseOrder,
                notes = @notes,
                inventory = @inventory,
                priority = @priority,
                purchaseType = @purchaseType,
                arrivalDate = @arrivalDate,
                lastModifiedBy = @updatedBy,
                lastModifiedAt = @lastModifiedAt,
                hasBeenModified = @hasBeenModified,
                sourceOrders = @sourceOrders,
                involvedClients = @involvedClients,
                analysis = @analysis
            WHERE id = @requestId
        `).run({ 
            requestId, 
            ...dataToUpdate,
            clientId: dataToUpdate.clientId?.toUpperCase(),
            itemId: dataToUpdate.itemId?.toUpperCase(),
            requiresCurrency: dataToUpdate.requiresCurrency ? 1 : 0,
            salePriceCurrency: dataToUpdate.salePriceCurrency || 'CRC',
            updatedBy,
            lastModifiedAt: new Date().toISOString(),
            hasBeenModified: hasBeenModified ? 1 : 0,
            sourceOrders: JSON.stringify(dataToUpdate.sourceOrders || []),
            involvedClients: JSON.stringify(dataToUpdate.involvedClients || []),
            analysis: dataToUpdate.analysis ? JSON.stringify(dataToUpdate.analysis) : null,
        });

        if (hasBeenModified) {
            const historyStmt = db.prepare(`INSERT INTO ${REQUESTS_TABLES.history} (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
            historyStmt.run(requestId, new Date().toISOString(), currentRequest.status, updatedBy, 'Solicitud editada después de aprobación.');
        }
    });

    transaction();
    const updatedRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}

export async function updateStatus(payload: UpdateRequestStatusPayload): Promise<PurchaseRequest> {
    const { requestId, status, notes, updatedBy, reopen, manualSupplier, erpOrderNumber, erpEntryNumber, deliveredQuantity, arrivalDate } = payload;
    
    // Dynamic permission check based on target status
    const permissionMap: Record<string, any> = {
        'purchasing-review': 'requests:status:review',
        'pending-approval': 'requests:status:pending-approval',
        'approved': 'requests:status:approve',
        'ordered': 'requests:status:ordered',
        'received-in-warehouse': 'requests:status:received-in-warehouse',
        'entered-erp': 'requests:status:entered-erp',
        'canceled': 'requests:status:cancel',
    };

    if (permissionMap[status]) {
        await authorizeAction(permissionMap[status]);
    } else {
        await authorizeAction('requests:read');
    }

    const db = await getDb();

    const currentRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(requestId) as PurchaseRequest | undefined;
    if (!currentRequest) {
        throw new Error("Request not found.");
    }
    
    let approvedBy = currentRequest.approvedBy;
    if (status === 'approved' && !currentRequest.approvedBy) {
        approvedBy = updatedBy;
    }

    let receivedInWarehouseBy = currentRequest.receivedInWarehouseBy;
    if (status === 'received-in-warehouse') {
        receivedInWarehouseBy = updatedBy;
    }

    let receivedDate = currentRequest.receivedDate;
    if(status === 'received-in-warehouse'){
        receivedDate = new Date().toISOString();
    }
    
    let previousStatus = currentRequest.previousStatus;
    // Store the current status as 'previousStatus' if we're moving backwards in the flow
    if (status === 'purchasing-review' && currentRequest.status === 'pending-approval') {
        previousStatus = currentRequest.status;
    } else if (status === 'pending' && currentRequest.status === 'purchasing-review') {
        previousStatus = currentRequest.status;
    } else if (status === 'approved' && currentRequest.status === 'ordered') { // Reverting from ordered
        previousStatus = currentRequest.status;
    } else {
        previousStatus = null; // Clear it for forward movements
    }

    const transaction = db.transaction(() => {
        const stmt = db.prepare(`
            UPDATE ${REQUESTS_TABLES.requests} SET
                status = @status,
                lastStatusUpdateNotes = @notes,
                lastStatusUpdateBy = @updatedBy,
                approvedBy = @approvedBy,
                reopened = @reopened,
                manualSupplier = @manualSupplier,
                erpOrderNumber = @erpOrderNumber,
                erpEntryNumber = @erpEntryNumber,
                deliveredQuantity = @deliveredQuantity,
                receivedInWarehouseBy = @receivedInWarehouseBy,
                receivedDate = @receivedDate,
                arrivalDate = @arrivalDate,
                previousStatus = @previousStatus,
                pendingAction = 'none'
            WHERE id = @requestId
        `);

        stmt.run({
            status,
            notes: notes || null,
            updatedBy,
            approvedBy,
            requestId,
            reopened: reopen ? 1 : (currentRequest.reopened ? 1 : 0),
            manualSupplier: manualSupplier !== undefined ? manualSupplier : currentRequest.manualSupplier,
            erpOrderNumber: erpOrderNumber !== undefined ? erpOrderNumber : currentRequest.erpOrderNumber,
            erpEntryNumber: erpEntryNumber !== undefined ? erpEntryNumber : currentRequest.erpEntryNumber,
            deliveredQuantity: deliveredQuantity !== undefined ? deliveredQuantity : currentRequest.deliveredQuantity,
            receivedInWarehouseBy: receivedInWarehouseBy !== undefined ? receivedInWarehouseBy : currentRequest.receivedInWarehouseBy,
            receivedDate: receivedDate,
            arrivalDate: arrivalDate !== undefined ? arrivalDate : currentRequest.arrivalDate,
            previousStatus: previousStatus
        });
        
        const historyStmt = db.prepare(`INSERT INTO ${REQUESTS_TABLES.history} (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
        historyStmt.run(requestId, new Date().toISOString(), status, updatedBy, notes);
    });

    transaction();
    const updatedRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}

export async function getRequestHistory(requestId: number): Promise<PurchaseRequestHistoryEntry[]> {
    const db = await getDb();
    return db.prepare(`SELECT * FROM ${REQUESTS_TABLES.history} WHERE requestId = ? ORDER BY timestamp DESC`).all(requestId) as PurchaseRequestHistoryEntry[];
}

export async function updatePendingAction(payload: AdministrativeActionPayload): Promise<PurchaseRequest> {
    const db = await getDb();
    const { entityId, action, notes, updatedBy } = payload;

    const currentRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(entityId) as PurchaseRequest | undefined;
    if (!currentRequest) throw new Error("Request not found.");

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE ${REQUESTS_TABLES.requests} SET
                pendingAction = @action,
                previousStatus = CASE WHEN @action != 'none' THEN status ELSE previousStatus END
            WHERE id = @entityId
        `).run({ action, entityId });
        
        const historyStmt = db.prepare(`INSERT INTO ${REQUESTS_TABLES.history} (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
        const historyNote = action === 'none' 
            ? 'Acción administrativa rechazada/cancelada' 
            : `Solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} iniciada`;
        historyStmt.run(entityId, new Date().toISOString(), currentRequest.status, updatedBy, `${historyNote}: ${notes}`);
    });
    
    transaction();
    const updatedRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(entityId) as any;
    return sanitizeRequest(updatedRequest);
}

export async function getErpOrderData(identifier: string | DateRange): Promise<{headers: ErpOrderHeader[], lines: ErpOrderLine[], inventory: StockInfo[]}> {
    const db = await getDb();
    
    let headers: ErpOrderHeader[] = [];

    if (typeof identifier === 'string') {
        logInfo("Buscando pedido ERP en DB local por número", { searchTerm: identifier });
        headers = db.prepare('SELECT * FROM core_erp_order_headers WHERE PEDIDO LIKE ?').all(`%${identifier}%`) as ErpOrderHeader[];
    } else {
        const { from, to } = identifier;
        if (!from) throw new Error('Date "from" is required for range search.');
        
        const toDate = to || new Date();
        logInfo("Buscando pedidos ERP en DB local por rango de fecha", { from: from.toISOString(), to: toDate.toISOString() });
        headers = db.prepare('SELECT * FROM core_erp_order_headers WHERE FECHA_PEDIDO BETWEEN ? AND ?').all(from.toISOString(), toDate.toISOString()) as ErpOrderHeader[];
    }

    if (headers.length === 0) {
        logWarn("No se encontraron pedidos ERP para el criterio", { identifier });
        return { headers: [], lines: [], inventory: [] };
    }

    const orderNumbers: string[] = headers.map(h => h.PEDIDO);
    const sanitizedOrderNumbers = orderNumbers.map(n => `'${n.replace(/'/g, "''")}'`).join(',');

    if (!sanitizedOrderNumbers) {
        return { headers, lines: [], inventory: [] };
    }

    const lines: ErpOrderLine[] = db.prepare(`SELECT * FROM core_erp_order_lines WHERE PEDIDO IN (${sanitizedOrderNumbers})`).all() as ErpOrderLine[];
    
    if (lines.length === 0) {
         return { headers, lines: [], inventory: [] };
    }

    const itemIds = [...new Set(lines.map(line => line.ARTICULO))];
    const inventory: StockInfo[] = db.prepare(`SELECT * FROM core_stock WHERE itemId IN (${itemIds.map(() => '?').join(',')})`).all(...itemIds) as StockInfo[];
    const relevantInventory = inventory.filter(inv => itemIds.includes(inv.itemId));

    return JSON.parse(JSON.stringify({ headers, lines, inventory: relevantInventory }));
}

export async function updateRequestDetails(payload: { requestId: number; priority: PurchaseRequestPriority, updatedBy: string }): Promise<PurchaseRequest> {
    const db = await getDb();
    const { requestId, priority, updatedBy } = payload;
    
    const currentRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(requestId) as PurchaseRequest | undefined;
    if (!currentRequest) throw new Error("Request not found.");

    const transaction = db.transaction(() => {
        db.prepare(`UPDATE ${REQUESTS_TABLES.requests} SET priority = ? WHERE id = ?`).run(priority, requestId);
        
        const historyNote = `Prioridad cambiada a: ${priority}`;
        const historyStmt = db.prepare(`INSERT INTO ${REQUESTS_TABLES.history} (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
        historyStmt.run(requestId, new Date().toISOString(), currentRequest.status, updatedBy, historyNote);
    });

    transaction();
    const updatedRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}

export async function getUserByName(name: string): Promise<User | null> {
    const users = await getAllUsersFromMain();
    return users.find((u: User) => u.name === name) || null;
}

export async function getRolesWithPermission(permission: string): Promise<string[]> {
    const roles = await getAllRolesFromMain();
    return roles.filter(role => role.id === 'admin' || role.permissions.includes(permission)).map(role => role.id);
}

export async function addNote(payload: { requestId: number; notes: string; updatedBy: string; }): Promise<PurchaseRequest> {
    const db = await getDb();
    const { requestId, notes, updatedBy } = payload;

    const currentRequest = db.prepare(`SELECT status FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(requestId) as PurchaseRequest | undefined;
    if (!currentRequest) {
        throw new Error("Request not found.");
    }

    db.prepare(`INSERT INTO ${REQUESTS_TABLES.history} (requestId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(requestId, new Date().toISOString(), currentRequest.status, updatedBy, `Nota agregada: ${notes}`);

    const updatedRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}


export async function saveCostAnalysis(requestId: number, cost: number, salePrice: number): Promise<PurchaseRequest> {
    const db = await getDb();
    
    if (cost <= 0) {
        throw new Error('El costo debe ser mayor a cero para calcular el margen.');
    }
    
    const margin = (salePrice - cost) / cost;
    const analysis = { cost, salePrice, margin };

    db.prepare(`UPDATE ${REQUESTS_TABLES.requests} SET analysis = ?, unitSalePrice = ? WHERE id = ?`).run(JSON.stringify(analysis), salePrice, requestId);

    const updatedRequest = db.prepare(`SELECT * FROM ${REQUESTS_TABLES.requests} WHERE id = ?`).get(requestId) as any;
    return sanitizeRequest(updatedRequest);
}
