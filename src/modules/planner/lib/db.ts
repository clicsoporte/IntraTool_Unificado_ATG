/**
 * @fileoverview Server-side functions for the planner database.
 */
"use server";

import { getDb } from '../../core/lib/db';
import { getAllRoles as getAllRolesFromMain } from '../../core/lib/db';
import { getAllUsers as getAllUsersFromMain } from '../../core/lib/auth';
import type { ProductionOrder, PlannerSettings, UpdateStatusPayload, UpdateOrderDetailsPayload, ProductionOrderHistoryEntry, RejectCancellationPayload, ProductionOrderStatus, UpdateProductionOrderPayload, CustomStatus, DateRange, PlannerNotePayload, AdministrativeActionPayload, User, PlannerShift, Product } from '../../core/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { logError } from '../../core/lib/logger';
import { getAllProducts } from '@/modules/core/lib/db';
import { PLANNER_TABLES } from './schema';
import { authorizeAction } from '@/modules/core/lib/auth-guard';

// Local initialization logic removed. Schema is now managed centrally in schema.ts


export async function getPlannerSettings(): Promise<PlannerSettings> {
    const db = await getDb();
    const settingsRows = db.prepare(`SELECT * FROM ${PLANNER_TABLES.settings}`).all() as { key: string; value: string }[];
    
    const settings: PlannerSettings = {
        orderPrefix: 'OP-',
        nextOrderNumber: 1,
        useWarehouseReception: false,
        showCustomerTaxId: true,
        machines: [],
        shifts: [],
        requireMachineForStart: false,
        requireShiftForCompletion: false,
        assignmentLabel: 'Máquina Asignada',
        shiftLabel: 'Turno',
        customStatuses: [],
        pdfPaperSize: 'letter',
        pdfOrientation: 'portrait',
        pdfExportColumns: [],
        pdfTopLegend: '',
        fieldsToTrackChanges: [],
    };

    for (const row of settingsRows) {
        if (row.key === 'nextOrderNumber') settings.nextOrderNumber = Number(row.value);
        else if (row.key === 'orderPrefix') settings.orderPrefix = row.value;
        else if (row.key === 'useWarehouseReception') settings.useWarehouseReception = row.value === 'true';
        else if (row.key === 'showCustomerTaxId') settings.showCustomerTaxId = row.value === 'true';
        else if (row.key === 'machines') settings.machines = JSON.parse(row.value);
        else if (row.key === 'shifts') settings.shifts = JSON.parse(row.value);
        else if (row.key === 'requireMachineForStart') settings.requireMachineForStart = row.value === 'true';
        else if (row.key === 'requireShiftForCompletion') settings.requireShiftForCompletion = row.value === 'true';
        else if (row.key === 'assignmentLabel') settings.assignmentLabel = row.value;
        else if (row.key === 'shiftLabel') settings.shiftLabel = row.value;
        else if (row.key === 'customStatuses') settings.customStatuses = JSON.parse(row.value);
        else if (row.key === 'pdfPaperSize') settings.pdfPaperSize = row.value as 'letter' | 'legal';
        else if (row.key === 'pdfOrientation') settings.pdfOrientation = row.value as 'portrait' | 'landscape';
        else if (row.key === 'pdfExportColumns') settings.pdfExportColumns = JSON.parse(row.value);
        else if (row.key === 'pdfTopLegend') settings.pdfTopLegend = row.value;
        else if (row.key === 'fieldsToTrackChanges') settings.fieldsToTrackChanges = JSON.parse(row.value);
    }
    return settings;
}

export async function saveSettings(settings: PlannerSettings): Promise<void> {
    await authorizeAction('admin:settings:planner');
    const db = await getDb();
    
    const transaction = db.transaction((settingsToUpdate) => {
        const keys: (keyof PlannerSettings)[] = ['orderPrefix', 'nextOrderNumber', 'useWarehouseReception', 'showCustomerTaxId', 'machines', 'shifts', 'requireMachineForStart', 'requireShiftForCompletion', 'assignmentLabel', 'shiftLabel', 'customStatuses', 'pdfPaperSize', 'pdfOrientation', 'pdfExportColumns', 'pdfTopLegend', 'fieldsToTrackChanges'];
        for (const key of keys) {
            if (settingsToUpdate[key] !== undefined) {
                const value = typeof settingsToUpdate[key] === 'object' ? JSON.stringify(settingsToUpdate[key]) : String(settingsToUpdate[key]);
                db.prepare(`INSERT OR REPLACE INTO ${PLANNER_TABLES.settings} (key, value) VALUES (?, ?)`).run(key, value);
            }
        }
    });

    transaction(settings);
}


export async function getOrders(options: {
    page: number;
    pageSize: number;
    isArchived: boolean;
    filters: {
        searchTerm?: string;
        status?: string[];
        classification?: string[];
        showOnlyMy?: string;
        dateRange?: DateRange;
    };
}): Promise<{ activeOrders: ProductionOrder[]; archivedOrders: ProductionOrder[]; totalActiveCount: number; totalArchivedCount: number; }> {
    const db = await getDb();
    const { page, pageSize, isArchived, filters } = options;

    const settings = await getPlannerSettings();
    const finalStatus = settings.useWarehouseReception ? 'received-in-warehouse' : 'completed';
    const archivedStatuses = [`'${finalStatus}'`, `'canceled'`];

    const buildQueryParts = async (isArchivedQuery: boolean) => {
        let whereClauses: string[] = [];
        let queryParams: any[] = [];
        
        if (isArchivedQuery) {
            whereClauses.push(`po.status IN (${archivedStatuses.join(',')})`);
        } else {
            whereClauses.push(`po.status NOT IN (${archivedStatuses.join(',')})`);
        }

        if (filters.searchTerm) {
            whereClauses.push(`(po.consecutive LIKE ? OR po.customerName LIKE ? OR po.productDescription LIKE ? OR po.productId LIKE ?)`);
            const searchTermParam = `%${filters.searchTerm}%`;
            queryParams.push(searchTermParam, searchTermParam, searchTermParam, searchTermParam);
        }

        if (filters.status && filters.status.length > 0) {
            whereClauses.push(`po.status IN (${filters.status.map(() => '?').join(',')})`);
            queryParams.push(...filters.status);
        }
        
        if (filters.showOnlyMy) {
            whereClauses.push(`po.requestedBy = ?`);
            queryParams.push(filters.showOnlyMy);
        }

        if (filters.dateRange?.from) {
            whereClauses.push("po.requestDate >= ?");
            queryParams.push(filters.dateRange.from.toISOString());
        }
        if (filters.dateRange?.to) {
            const toDate = new Date(filters.dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            whereClauses.push("po.requestDate <= ?");
            queryParams.push(toDate.toISOString());
        }

        if (filters.classification && filters.classification.length > 0) {
            const mainDb = await getDb();
            const productIds = mainDb.prepare(`SELECT id FROM core_products WHERE classification IN (${filters.classification.map(() => '?').join(',')})`).all(...filters.classification).map((p: any) => p.id);
            if (productIds.length > 0) {
                whereClauses.push(`po.productId IN (${productIds.map(() => '?').join(',')})`);
                queryParams.push(...productIds);
            } else {
                whereClauses.push('1 = 0');
            }
        }

        return { whereClause: whereClauses.join(' AND '), params: queryParams };
    };

    const activeQueryParts = await buildQueryParts(false);
    const archivedQueryParts = await buildQueryParts(true);

    const totalActiveCount = (db.prepare(`SELECT COUNT(*) as count FROM ${PLANNER_TABLES.orders} po WHERE ${activeQueryParts.whereClause}`).get(...activeQueryParts.params) as { count: number }).count;
    const totalArchivedCount = (db.prepare(`SELECT COUNT(*) as count FROM ${PLANNER_TABLES.orders} po WHERE ${archivedQueryParts.whereClause}`).get(...archivedQueryParts.params) as { count: number }).count;
    
    const targetQueryParts = isArchived ? archivedQueryParts : activeQueryParts;
    let finalQuery = `SELECT * FROM ${PLANNER_TABLES.orders} po WHERE ${targetQueryParts.whereClause} ORDER BY requestDate DESC LIMIT ? OFFSET ?`;
    let finalParams = [...targetQueryParts.params, pageSize, page * pageSize];
    
    const ordersRaw = db.prepare(finalQuery).all(...finalParams) as any[];
    const orders = ordersRaw.map(o => JSON.parse(JSON.stringify(o)));
    
    return {
        activeOrders: !isArchived ? orders : [],
        archivedOrders: isArchived ? orders : [],
        totalActiveCount,
        totalArchivedCount,
    };
}


export async function addOrder(order: Omit<ProductionOrder, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'erpPackageNumber' | 'erpTicketNumber' | 'machineId' | 'previousStatus' | 'scheduledStartDate' | 'scheduledEndDate' | 'requestedBy' | 'hasBeenModified' | 'lastModifiedBy' | 'lastModifiedAt' | 'shiftId'>, requestedBy: string): Promise<ProductionOrder> {
    await authorizeAction('planner:create');
    const db = await getDb();
    
    const settings = await getPlannerSettings();
    const nextNumber = settings.nextOrderNumber || 1;
    const prefix = settings.orderPrefix || 'OP-';

    const newOrder: Omit<ProductionOrder, 'id'> = {
        ...order,
        customerId: order.customerId.toUpperCase(),
        productId: order.productId.toUpperCase(),
        requestedBy: requestedBy,
        consecutive: `${prefix}${nextNumber.toString().padStart(5, '0')}`,
        requestDate: new Date().toISOString(),
        status: 'pending',
        reopened: false,
    };
    
    const preparedOrder = {
        ...newOrder,
        purchaseOrder: newOrder.purchaseOrder || null,
        notes: newOrder.notes || null,
        inventory: newOrder.inventory ?? null,
        inventoryErp: newOrder.inventoryErp ?? null,
        reopened: newOrder.reopened ? 1 : 0,
        customerTaxId: newOrder.customerTaxId || null,
    };

    try {
        const transaction = db.transaction(() => {
            const insertStmt = db.prepare(`
                INSERT INTO ${PLANNER_TABLES.orders} (
                    consecutive, requestDate, deliveryDate, customerId, customerName, customerTaxId,
                    productId, productDescription, quantity, priority, status, pendingAction, notes,
                    requestedBy, inventory, inventoryErp, purchaseOrder
                ) VALUES (
                    @consecutive, @requestDate, @deliveryDate, @customerId, @customerName, @customerTaxId,
                    @productId, @productDescription, @quantity, @priority, @status, @pendingAction, @notes,
                    @requestedBy, @inventory, @inventoryErp, @purchaseOrder
                )
            `);
            
            const info = insertStmt.run(preparedOrder);
            const newOrderId = info.lastInsertRowid as number;

            db.prepare(`UPDATE ${PLANNER_TABLES.settings} SET value = ? WHERE key = 'nextOrderNumber'`).run(nextNumber + 1);
            
            const historyStmt = db.prepare(`INSERT INTO ${PLANNER_TABLES.history} (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
            historyStmt.run(newOrderId, new Date().toISOString(), 'pending', newOrder.requestedBy, 'Orden creada');
            
            return newOrderId;
        });

        const newId = transaction();
        const createdOrder = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(newId) as ProductionOrder;
        return createdOrder;
    } catch (error: any) {
        logError("Failed to create order in DB", { context: 'addOrder DB transaction', error: error.message, details: preparedOrder });
        throw error;
    }
}

export async function updateOrder(payload: UpdateProductionOrderPayload): Promise<ProductionOrder> {
    const db = await getDb();
    const { orderId, updatedBy, ...dataToUpdate } = payload;
    
    const currentOrder = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(orderId) as ProductionOrder | undefined;
    if (!currentOrder) {
        throw new Error("Order not found.");
    }
    
    let hasBeenModified = currentOrder.hasBeenModified;
    if (['approved', 'in-queue', 'in-progress'].includes(currentOrder.status)) {
        hasBeenModified = true;
    }

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE ${PLANNER_TABLES.orders} SET
                deliveryDate = @deliveryDate,
                customerId = @customerId,
                customerName = @customerName,
                customerTaxId = @customerTaxId,
                productId = @productId,
                productDescription = @productDescription,
                quantity = @quantity,
                inventory = @inventory,
                notes = @notes,
                purchaseOrder = @purchaseOrder,
                lastModifiedBy = @updatedBy,
                lastModifiedAt = @lastModifiedAt,
                hasBeenModified = @hasBeenModified
            WHERE id = @orderId
        `).run({ 
            ...dataToUpdate,
            orderId, 
            customerId: dataToUpdate.customerId ? dataToUpdate.customerId.toUpperCase() : undefined,
            productId: dataToUpdate.productId ? dataToUpdate.productId.toUpperCase() : undefined,
            updatedBy,
            lastModifiedAt: new Date().toISOString(),
            hasBeenModified: hasBeenModified ? 1 : 0
        });

        if (hasBeenModified) {
            const historyStmt = db.prepare(`INSERT INTO ${PLANNER_TABLES.history} (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
            historyStmt.run(orderId, new Date().toISOString(), currentOrder.status, updatedBy, 'Orden editada después de aprobación.');
        }
    });

    transaction();
    const updatedOrder = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(orderId) as ProductionOrder;
    return updatedOrder;
}

export async function confirmModification(orderId: number, updatedBy: string): Promise<ProductionOrder> {
    const db = await getDb();
    
    const currentOrder = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(orderId) as ProductionOrder | undefined;
    if (!currentOrder) {
        throw new Error("Order not found.");
    }

    const transaction = db.transaction(() => {
        db.prepare(`UPDATE ${PLANNER_TABLES.orders} SET hasBeenModified = 0, lastModifiedBy = ?, lastModifiedAt = ? WHERE id = ?`).run(updatedBy, new Date().toISOString(), orderId);
        
        const historyStmt = db.prepare(`INSERT INTO ${PLANNER_TABLES.history} (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
        historyStmt.run(orderId, new Date().toISOString(), currentOrder.status, updatedBy, 'Modificación confirmada y alerta eliminada.');
    });

    transaction();
    const updated = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(orderId) as ProductionOrder;
    if (!updated) {
        throw new Error("Failed to retrieve updated order after confirmation.");
    }
    return updated;
}

export async function updateStatus(payload: UpdateStatusPayload): Promise<ProductionOrder> {
    const { orderId, status, notes, updatedBy, reopen, deliveredQuantity, defectiveQuantity, erpPackageNumber, erpTicketNumber } = payload;
    
    // Dynamic permission check based on target status
    const permissionMap: Record<string, any> = {
        'approved': 'planner:status:approve',
        'in-progress': 'planner:status:in-progress',
        'on-hold': 'planner:status:on-hold',
        'completed': 'planner:status:completed',
        'canceled': 'planner:status:cancel',
        'review': 'planner:status:review',
    };
    
    if (permissionMap[status]) {
        await authorizeAction(permissionMap[status]);
    } else {
        await authorizeAction('planner:read'); // Fallback to basic read/access
    }

    const db = await getDb();

    const currentOrder = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(orderId) as ProductionOrder | undefined;
    if (!currentOrder) throw new Error("Order not found.");
    
    let approvedBy = currentOrder.approvedBy;
    if (status === 'approved' && !currentOrder.approvedBy) {
        approvedBy = updatedBy;
    }

    let previousStatus = currentOrder.previousStatus;
    if (status === 'pending' || status === 'pending-review') {
        previousStatus = currentOrder.status;
    } else {
        previousStatus = null;
    }

    const transaction = db.transaction(() => {
        const stmt = db.prepare(`
            UPDATE ${PLANNER_TABLES.orders} SET
                status = @status,
                lastStatusUpdateNotes = @notes,
                lastStatusUpdateBy = @updatedBy,
                approvedBy = @approvedBy,
                reopened = @reopened,
                deliveredQuantity = @deliveredQuantity,
                defectiveQuantity = @defectiveQuantity,
                erpPackageNumber = @erpPackageNumber,
                erpTicketNumber = @erpTicketNumber,
                previousStatus = @previousStatus,
                pendingAction = 'none',
                hasBeenModified = CASE WHEN @reopened = 1 THEN 0 ELSE hasBeenModified END
            WHERE id = @orderId
        `);
        
        const booleanReopened = reopen ? 1 : (currentOrder.reopened ? 1 : 0);

        stmt.run({
            status,
            notes: notes || null,
            updatedBy,
            approvedBy,
            orderId,
            reopened: booleanReopened,
            deliveredQuantity: deliveredQuantity !== undefined ? deliveredQuantity : currentOrder.deliveredQuantity,
            defectiveQuantity: defectiveQuantity !== undefined ? defectiveQuantity : currentOrder.defectiveQuantity,
            erpPackageNumber: erpPackageNumber !== undefined ? erpPackageNumber : currentOrder.erpPackageNumber,
            erpTicketNumber: erpTicketNumber !== undefined ? erpTicketNumber : currentOrder.erpTicketNumber,
            previousStatus,
        });
        
        const historyStmt = db.prepare(`INSERT INTO ${PLANNER_TABLES.history} (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
        historyStmt.run(orderId, new Date().toISOString(), status, updatedBy, notes);
    });

    transaction();
    const updatedOrder = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(orderId) as ProductionOrder;
    return updatedOrder;
}


export async function updateDetails(payload: UpdateOrderDetailsPayload): Promise<ProductionOrder> {
    const db = await getDb();
    const { orderId, updatedBy, priority, machineId, scheduledDateRange, shiftId } = payload;
    
    const transaction = db.transaction(() => {
        if (priority) {
            db.prepare(`UPDATE ${PLANNER_TABLES.orders} SET priority = ? WHERE id = ?`).run(priority, orderId);
        }
        if (machineId !== undefined) {
             db.prepare(`UPDATE ${PLANNER_TABLES.orders} SET machineId = ? WHERE id = ?`).run(machineId, orderId);
        }
        if (shiftId !== undefined) {
             db.prepare(`UPDATE ${PLANNER_TABLES.orders} SET shiftId = ? WHERE id = ?`).run(shiftId, orderId);
        }
        if (scheduledDateRange) {
             db.prepare(`UPDATE ${PLANNER_TABLES.orders} SET scheduledStartDate = ?, scheduledEndDate = ? WHERE id = ?`).run(
                scheduledDateRange.from?.toISOString(), 
                scheduledDateRange.to?.toISOString(), 
                orderId
            );
        }
    });

    transaction();
    const updatedOrder = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(orderId) as ProductionOrder;
    return updatedOrder;
}

export async function getOrderHistory(orderId: number): Promise<ProductionOrderHistoryEntry[]> {
    const db = await getDb();
    return db.prepare(`SELECT * FROM ${PLANNER_TABLES.history} WHERE orderId = ? ORDER BY timestamp DESC`).all(orderId) as ProductionOrderHistoryEntry[];
}

export async function addNote(payload: PlannerNotePayload): Promise<ProductionOrder> {
    const db = await getDb();
    const { orderId, notes, updatedBy } = payload;
    const currentOrder = db.prepare(`SELECT status FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(orderId) as { status: ProductionOrderStatus };

    if (!currentOrder) throw new Error("Order not found");

    db.prepare(`INSERT INTO ${PLANNER_TABLES.history} (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(orderId, new Date().toISOString(), currentOrder.status, updatedBy, `Nota agregada: ${notes}`);

    return db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(orderId) as ProductionOrder;
}

export async function updatePendingAction(payload: AdministrativeActionPayload): Promise<ProductionOrder> {
    const db = await getDb();
    const { entityId, action, notes, updatedBy } = payload;

    const currentOrder = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(entityId) as ProductionOrder | undefined;
    if (!currentOrder) throw new Error("Order not found.");

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE ${PLANNER_TABLES.orders} SET
                pendingAction = @action,
                previousStatus = CASE WHEN @action != 'none' THEN status ELSE previousStatus END
            WHERE id = @entityId
        `).run({ action, entityId });
        
        const historyStmt = db.prepare(`INSERT INTO ${PLANNER_TABLES.history} (orderId, timestamp, status, updatedBy, notes) VALUES (?, ?, ?, ?, ?)`);
        const historyNote = action === 'none' 
            ? 'Acción administrativa rechazada/cancelada' 
            : `Solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} iniciada`;
        historyStmt.run(entityId, new Date().toISOString(), currentOrder.status, updatedBy, `${historyNote}: ${notes}`);
    });
    
    transaction();
    const updatedOrder = db.prepare(`SELECT * FROM ${PLANNER_TABLES.orders} WHERE id = ?`).get(entityId) as ProductionOrder;
    return updatedOrder;
}

export async function getUserByName(name: string): Promise<User | null> {
    const users = await getAllUsersFromMain();
    return users.find(u => u.name === name) || null;
}

export async function getRolesWithPermission(permission: string): Promise<string[]> {
    const roles = await getAllRolesFromMain();
    return roles.filter(role => role.id === 'admin' || role.permissions.includes(permission)).map(role => role.id);
}

export async function getCompletedOrdersByDateRange(dateRange: DateRange): Promise<(ProductionOrder & { history: ProductionOrderHistoryEntry[] })[]> {
    const db = await getDb();
    if (!dateRange.from) {
        throw new Error("Date 'from' is required.");
    }
    const toDate = dateRange.to || new Date();
    toDate.setHours(23, 59, 59, 999);

    const finalStatuses = ['completed', 'received-in-warehouse'];
    const finalStatusPlaceholders = finalStatuses.map(() => '?').join(',');
    
    const completedOrders = db.prepare(`
        SELECT DISTINCT p.* 
        FROM ${PLANNER_TABLES.orders} p
        JOIN ${PLANNER_TABLES.history} h ON p.id = h.orderId
        WHERE h.status IN (${finalStatusPlaceholders})
        AND h.timestamp BETWEEN ? AND ?
    `).all(...finalStatuses, dateRange.from.toISOString(), toDate.toISOString()) as ProductionOrder[];

    if (completedOrders.length === 0) {
        return [];
    }

    const orderIds = completedOrders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    const allHistory = db.prepare(`
        SELECT * FROM ${PLANNER_TABLES.history} WHERE orderId IN (${placeholders}) ORDER BY timestamp ASC
    `).all(...orderIds) as ProductionOrderHistoryEntry[];

    const historyMap = new Map<number, ProductionOrderHistoryEntry[]>();
    allHistory.forEach(h => {
        if (!historyMap.has(h.orderId)) {
            historyMap.set(h.orderId, []);
        }
        historyMap.get(h.orderId)!.push(h);
    });

    const result = completedOrders.map(order => ({
        ...order,
        history: historyMap.get(order.id) || []
    }));

    return JSON.parse(JSON.stringify(result));
}
