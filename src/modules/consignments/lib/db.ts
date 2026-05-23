
/**
 * @fileoverview Server-side functions for the consignments module database.
 */
"use server";

import { getDb, getCompanySettings, getAllProducts as getAllProductsFromMainDb } from '@/modules/core/lib/db';
import { getAllUsers as getAllUsersFromMain } from '@/modules/core/lib/auth';
import type { ConsignmentAgreement, ConsignmentProduct, RestockBoleta, BoletaLine, BoletaHistory, User, Product, RestockBoletaStatus, ConsignmentSettings, PeriodClosure, PhysicalCount, BoletaType, ConsignmentAdjustment, ConsignmentAdjustmentReason, ConsignmentReportRow, PeriodClosureStatus, ErpInvoiceHeader, ErpInvoiceLine } from '@/modules/core/types';
import { logError, logInfo, logWarn } from '@/modules/core/lib/logger';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import { createNotification, createNotificationForPermission } from '@/modules/core/lib/notifications-actions';
import { sendEmail } from '@/modules/core/lib/email-service';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAllUsers } from '@/modules/core/lib/auth-client';
import { CONSIGNMENTS_TABLES } from './schema';


// Unified DB configuration


// Database initialization is now handled by the central orchestrator in core/lib/db.ts
// Keep other functions from original file
export async function getSettings(): Promise<ConsignmentSettings> {
    const db = await getDb();
    const defaults: ConsignmentSettings = {
        pdfTopLegend: 'Documento de Reposición',
        pdfExportColumns: ['product_id', 'product_description', 'counted_quantity', 'max_stock', 'replenish_quantity'],
        notificationUserIds: [],
        additionalNotificationEmails: '',
        next_closure_number: 1,
        next_adjustment_number: 1,
    };
    try {
        const rows = db.prepare(`SELECT key, value FROM ${CONSIGNMENTS_TABLES.settings}`).all() as { key: string; value: string }[];
        if (rows.length === 0) return defaults;
        
        const settings: Partial<ConsignmentSettings> = {};
        for (const row of rows) {
            const key = row.key as keyof ConsignmentSettings;
            try {
                (settings as any)[key] = JSON.parse(row.value);
            } catch {
                (settings as any)[key] = row.value;
            }
        }
        return { ...defaults, ...settings };
    } catch (error) {
        console.error("Error fetching consignment settings", error);
        return defaults;
    }
}

export async function saveSettings(settings: ConsignmentSettings): Promise<void> {
    await authorizeAction('admin:settings:consignments');
    const db = await getDb();
    const transaction = db.transaction((settingsToUpdate: ConsignmentSettings) => {
        const keys: (keyof ConsignmentSettings)[] = ['pdfTopLegend', 'pdfExportColumns', 'notificationUserIds', 'additionalNotificationEmails', 'next_closure_number', 'next_adjustment_number'];
        for (const key of keys) {
            if (settingsToUpdate[key] !== undefined) {
                const value = typeof settingsToUpdate[key] === 'object' ? JSON.stringify(settingsToUpdate[key]) : String(settingsToUpdate[key]);
                db.prepare(`INSERT OR REPLACE INTO ${CONSIGNMENTS_TABLES.settings} (key, value) VALUES (?, ?)`).run(key, value);
            }
        }
    });
    transaction(settings);
}

export async function getAgreements(): Promise<(ConsignmentAgreement & { product_count?: number; boleta_count?: number })[]> {
    const db = await getDb();
    const agreements = db.prepare(`
        SELECT 
            ca.*, 
            COUNT(DISTINCT cp.id) as product_count,
            (SELECT COUNT(*) FROM ${CONSIGNMENTS_TABLES.boletas} rb WHERE rb.agreement_id = ca.id) as boleta_count
        FROM ${CONSIGNMENTS_TABLES.agreements} ca
        LEFT JOIN ${CONSIGNMENTS_TABLES.products} cp ON ca.id = cp.agreement_id
        GROUP BY ca.id
        ORDER BY ca.client_name
    `).all() as (ConsignmentAgreement & { product_count?: number; boleta_count?: number })[];
    return JSON.parse(JSON.stringify(agreements));
}


export async function saveAgreement(agreement: Omit<ConsignmentAgreement, 'id' | 'next_boleta_number'> & { id?: number }, products: Omit<ConsignmentProduct, 'id' | 'agreement_id'>[]) {
    await authorizeAction('consignments:setup');
    const db = await getDb();
    const transaction = db.transaction(() => {
        let agreementId = agreement.id;
        const notificationUserIdsJson = JSON.stringify(agreement.notification_user_ids || []);
        const clientId = agreement.client_id.toUpperCase();
        if (agreementId) { // Update
            db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.agreements} SET client_id = ?, client_name = ?, erp_warehouse_id = ?, notes = ?, is_active = ?, product_code_display_mode = ?, notification_user_ids = ?, operation_mode = ? WHERE id = ?`)
              .run(clientId, agreement.client_name, agreement.erp_warehouse_id, agreement.notes, agreement.is_active, agreement.product_code_display_mode, notificationUserIdsJson, agreement.operation_mode || 'auto', agreementId);
        } else { // Create
            const info = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.agreements} (client_id, client_name, erp_warehouse_id, notes, is_active, product_code_display_mode, notification_user_ids, operation_mode, has_initial_inventory) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`)
              .run(clientId, agreement.client_name, agreement.erp_warehouse_id, agreement.notes, agreement.is_active, agreement.product_code_display_mode, notificationUserIdsJson, agreement.operation_mode || 'auto');
            agreementId = info.lastInsertRowid as number;
        }

        if (products && products.length >= 0) {
            db.prepare(`DELETE FROM ${CONSIGNMENTS_TABLES.products} WHERE agreement_id = ?`).run(agreementId);
            const insertProduct = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.products} (agreement_id, product_id, max_stock, price, client_product_code) VALUES (@agreement_id, @product_id, @max_stock, @price, @client_product_code)`);
            for (const product of products) {
                insertProduct.run({
                    agreement_id: agreementId,
                    product_id: product.product_id.toUpperCase(),
                    max_stock: product.max_stock,
                    price: product.price,
                    client_product_code: product.client_product_code || null,
                });
            }
        }
        return db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.agreements} WHERE id = ?`).get(agreementId) as ConsignmentAgreement;
    });
    return transaction();
}

export async function deleteAgreement(agreementId: number): Promise<{ success: boolean; message: string }> {
    await authorizeAction('consignments:setup');
    const db = await getDb();
    try {
        const boletaCount = db.prepare(`SELECT COUNT(*) as count FROM ${CONSIGNMENTS_TABLES.boletas} WHERE agreement_id = ?`).get(agreementId) as { count: number };
        if (boletaCount.count > 0) {
            return { success: false, message: `No se puede eliminar. El acuerdo tiene ${boletaCount.count} boleta(s) asociada(s). Por favor, elimínelas primero.` };
        }

        const deleteResult = db.prepare(`DELETE FROM ${CONSIGNMENTS_TABLES.agreements} WHERE id = ?`).run(agreementId);
        
        if (deleteResult.changes === 0) {
            return { success: false, message: 'No se encontró el acuerdo a eliminar.' };
        }

        logInfo(`Consignment agreement with ID ${agreementId} was deleted.`);
        return { success: true, message: 'Acuerdo eliminado con éxito.' };

    } catch (error: any) {
        logError('Failed to delete consignment agreement', { error: error.message, agreementId });
        return { success: false, message: 'Ocurrió un error inesperado en la base de datos.' };
    }
}


export async function getAgreementDetails(agreementId: number): Promise<{ agreement: ConsignmentAgreement, products: ConsignmentProduct[] } | null> {
    const db = await getDb();
    const agreement = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.agreements} WHERE id = ?`).get(agreementId) as ConsignmentAgreement | undefined;
    if (!agreement) return null;
    if (agreement.notification_user_ids && typeof agreement.notification_user_ids === 'string') {
        agreement.notification_user_ids = JSON.parse(agreement.notification_user_ids);
    } else {
        agreement.notification_user_ids = [];
    }
    const products = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.products} WHERE agreement_id = ?`).all(agreementId) as ConsignmentProduct[];
    return JSON.parse(JSON.stringify({ agreement, products }));
}

export async function getBoletas(filters: {
    status: string[],
    dateRange?: { from?: Date, to?: Date },
    type?: BoletaType,
    agreementId?: number
}) {
    const db = await getDb();
    let query = `
        SELECT 
            rb.*,
            SUM(bl.replenish_quantity) as total_replenish_quantity
        FROM ${CONSIGNMENTS_TABLES.boletas} rb
        LEFT JOIN ${CONSIGNMENTS_TABLES.boletaLines} bl ON rb.id = bl.boleta_id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];
    
    if (filters.status && filters.status.length > 0) {
        whereClauses.push(`rb.status IN (${filters.status.map(() => '?').join(',')})`);
        params.push(...filters.status);
    }
    
    if (filters.type) {
        whereClauses.push(`rb.type = ?`);
        params.push(filters.type);
    }

    if (filters.agreementId) {
        whereClauses.push(`rb.agreement_id = ?`);
        params.push(filters.agreementId);
    }

    if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    query += ' GROUP BY rb.id ORDER BY rb.created_at DESC';

    const boletas = db.prepare(query).all(...params) as RestockBoleta[];
    return JSON.parse(JSON.stringify(boletas));
}

export async function updateBoletaStatus(payload: { boletaId: number, status: string, notes: string, updatedBy: string, erpInvoiceNumber?: string, erpMovementId?: string }): Promise<RestockBoleta> {
    const { boletaId, status, notes, updatedBy, erpInvoiceNumber, erpMovementId } = payload;

    // Dynamic permission check based on target status
    const permissionMap: Record<string, any> = {
        'pending': 'consignments:boleta:send',
        'approved': 'consignments:boleta:approve',
        'sent': 'consignments:boleta:send',
        'invoiced': 'consignments:boleta:invoice',
        'canceled': 'consignments:boleta:cancel',
    };

    if (permissionMap[status]) {
        await authorizeAction(permissionMap[status]);
    } else {
        await authorizeAction('consignments:access');
    }

    const db = await getDb();
    
    const transaction = db.transaction(() => {
        const currentBoleta = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletas} WHERE id = ?`).get(boletaId) as RestockBoleta | undefined;
        if (!currentBoleta) {
            throw new Error("La boleta que intentas actualizar no fue encontrada. Es posible que haya sido eliminada.");
        }
        
        if (status === 'pending' && (!erpMovementId || !erpMovementId.trim())) {
            throw new Error("El número de movimiento de inventario del ERP es requerido para poder enviar a aprobación.");
        }
        const lines = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletaLines} WHERE boleta_id = ?`).all(boletaId) as BoletaLine[];
        const totalReplenish = lines.reduce((sum, line) => sum + line.replenish_quantity, 0);

        if (status === 'pending' && totalReplenish <= 0) {
             throw new Error("La boleta no puede ser enviada a aprobación porque la cantidad total a reponer es cero o negativa.");
        }
        const hasUntouchedManualLines = lines.some(line => line.max_stock === 0 && line.is_manually_edited === 0);
        if (status === 'pending' && hasUntouchedManualLines) {
            throw new Error("Existen productos de reposición manual que no tienen una cantidad asignada. Por favor, edita la boleta, asigna una cantidad a reponer (incluso 0) a todas las líneas marcadas y vuelve a intentarlo.");
        }
        
        let approvedBy = currentBoleta.approved_by;
        if (status === 'approved' && !currentBoleta.approved_by) {
            approvedBy = updatedBy;
        }

        let submitted_by = currentBoleta.submitted_by;
        if (status === 'pending') {
            submitted_by = updatedBy;
        }

        let previousStatus = currentBoleta.previousStatus;
        if (status === 'review') {
            previousStatus = currentBoleta.status;
        } else {
            previousStatus = null; // Clear it for forward movements
        }

        const updateParams: any = {
            status,
            id: boletaId,
            approvedBy: approvedBy,
            submitted_by,
            previousStatus,
        };

        let setClauses = [
            'status = @status',
            'approved_by = @approvedBy',
            'submitted_by = @submitted_by',
            'previousStatus = @previousStatus',
        ];

        if (status === 'approved') {
            setClauses.push('approved_at = datetime(\'now\')');
        } else if (status === 'pending') {
            if (erpMovementId) {
                setClauses.push('erp_movement_id = @erpMovementId');
                updateParams.erpMovementId = erpMovementId;
            }
        } else if (status === 'invoiced') {
            if (!erpInvoiceNumber?.trim()) {
                throw new Error("El número de factura del ERP es requerido para marcar como facturada.");
            }
            setClauses.push('erp_invoice_number = @erpInvoiceNumber');
            updateParams.erpInvoiceNumber = erpInvoiceNumber;
        } else if (currentBoleta.status === 'invoiced' && status === 'sent') {
            setClauses.push('erp_invoice_number = NULL');
        }
        
        const updateQuery = `UPDATE ${CONSIGNMENTS_TABLES.boletas} SET ${setClauses.join(', ')} WHERE id = @id`;
        db.prepare(updateQuery).run(updateParams);
        
        db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.boletaHistory} (boleta_id, timestamp, status, updatedBy, notes) VALUES (?, datetime('now'), ?, ?, ?)`)
          .run(boletaId, status, updatedBy, notes);
        
        return db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletas} WHERE id = ?`).get(boletaId) as RestockBoleta;
    });

    return transaction();
}

// ... rest of the file remains unchanged. I'll include it in the final output.
export async function getBoletaDetails(boletaId: number): Promise<{ boleta: RestockBoleta, lines: BoletaLine[], history: BoletaHistory[] } | null> {
    const db = await getDb();
    const boleta = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletas} WHERE id = ?`).get(boletaId) as RestockBoleta | undefined;
    if (!boleta) return null;

    const lines = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletaLines} WHERE boleta_id = ?`).all(boletaId) as BoletaLine[];
    const history = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletaHistory} WHERE boleta_id = ? ORDER BY timestamp DESC`).all(boletaId) as BoletaHistory[];

    return JSON.parse(JSON.stringify({ boleta, lines, history }));
}

export async function updateBoleta(boleta: RestockBoleta, lines: BoletaLine[], updatedBy: string): Promise<RestockBoleta> {
    const db = await getDb();
    
    const transaction = db.transaction(() => {
        db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.boletas} SET notes = ?, delivery_date = ?, erp_movement_id = ? WHERE id = ?`).run(boleta.notes, boleta.delivery_date, boleta.erp_movement_id, boleta.id);
        
        const updateLineStmt = db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.boletaLines} SET replenish_quantity = ?, max_stock = ?, price = ?, is_manually_edited = ? WHERE id = ?`);
        for (const line of lines) {
            updateLineStmt.run(line.replenish_quantity, line.max_stock, line.price, line.is_manually_edited ? 1 : 0, line.id);
        }
        
        db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.boletaHistory} (boleta_id, timestamp, status, updatedBy, notes) VALUES (?, datetime('now'), ?, ?, ?)`)
          .run(boleta.id, boleta.status, updatedBy, 'Líneas de boleta editadas y recalculadas.');

        return db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletas} WHERE id = ?`).get(boleta.id) as RestockBoleta;
    });
    
    return transaction();
}

export async function getBoletasByDateRange(agreementId: string, dateRange: { from: Date; to: Date }, statuses?: RestockBoletaStatus[], type?: BoletaType): Promise<(RestockBoleta & { lines: BoletaLine[]; history: BoletaHistory[]; })[]> {
    const db = await getDb();
    
    let query = `SELECT * FROM ${CONSIGNMENTS_TABLES.boletas} WHERE agreement_id = ?`;
    const params: any[] = [agreementId];

    if (dateRange?.from && dateRange.to) {
        query += ' AND created_at BETWEEN ? AND ?';
        params.push(dateRange.from.toISOString(), dateRange.to.toISOString());
    }

    if (statuses && statuses.length > 0) {
        query += ` AND status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
    }
    
    if (type) {
        query += ' AND type = ?';
        params.push(type);
    }
    
    query += ' ORDER BY created_at ASC'; // Order by oldest to newest to process chronologically

    const boletas = db.prepare(query).all(...params) as RestockBoleta[];
    
    if (boletas.length === 0) return [];

    const boletaIds = boletas.map(b => b.id);
    const placeholders = boletaIds.map(() => '?').join(',');

    const allLines = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletaLines} WHERE boleta_id IN (${placeholders})`).all(...boletaIds) as BoletaLine[];
    const allHistory = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletaHistory} WHERE boleta_id IN (${placeholders})`).all(...boletaIds) as BoletaHistory[];

    const historyMap = new Map<number, BoletaHistory[]>();
    allHistory.forEach(h => {
        if (!historyMap.has(h.boleta_id)) {
            historyMap.set(h.boleta_id, []);
        }
        historyMap.get(h.boleta_id)!.push(h);
    });

    const boletasWithDetails = boletas.map(b => ({
        ...b,
        lines: allLines.filter(l => l.boleta_id === b.id),
        history: historyMap.get(b.id) || []
    }));

    return JSON.parse(JSON.stringify(boletasWithDetails));
}


export async function getLatestBoletaBeforeDate(agreementId: number, date: Date): Promise<(RestockBoleta & { lines: BoletaLine[] }) | null> {
    const db = await getDb();
    const boleta = db.prepare(`
        SELECT * FROM ${CONSIGNMENTS_TABLES.boletas}
        WHERE agreement_id = ? AND created_at < ? AND type = 'INVENTORY_COUNT'
        ORDER BY created_at DESC
        LIMIT 1
    `).get(agreementId, date.toISOString()) as RestockBoleta | undefined;

    if (!boleta) return null;

    const lines = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletaLines} WHERE boleta_id = ?`).all(boleta.id) as BoletaLine[];

    return JSON.parse(JSON.stringify({ ...boleta, lines }));
}


export async function savePhysicalCount(agreementId: number, lines: { productId: string; quantity: number }[], userName: string) {
    const db = await getDb();
    const transaction = db.transaction(() => {
        // Here we just save, we don't delete. The "last" is determined by timestamp.
        const stmt = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.counts} (agreement_id, product_id, quantity, counted_at, counted_by) VALUES (?, ?, ?, ?, ?)`);
        const now = new Date().toISOString();
        for (const line of lines) {
            stmt.run(agreementId, line.productId.toUpperCase(), line.quantity, now, userName);
        }
    });
    transaction();
}

function getSettingsTx(db: import('better-sqlite3').Database): ConsignmentSettings {
     const defaults: ConsignmentSettings = {
        pdfTopLegend: 'Documento de Reposición',
        pdfExportColumns: ['product_id', 'product_description', 'counted_quantity', 'max_stock', 'replenish_quantity'],
        notificationUserIds: [],
        additionalNotificationEmails: '',
        next_closure_number: 1,
        next_adjustment_number: 1,
    };
    try {
        const rows = db.prepare(`SELECT key, value FROM ${CONSIGNMENTS_TABLES.settings}`).all() as { key: string; value: string }[];
        if (rows.length === 0) return defaults;
        
        const settings: Partial<ConsignmentSettings> = {};
        for (const row of rows) {
            const key = row.key as keyof ConsignmentSettings;
            try {
                (settings as any)[key] = JSON.parse(row.value);
            } catch {
                (settings as any)[key] = row.value;
            }
        }
        return { ...defaults, ...settings };
    } catch (error) {
        console.error("Error fetching consignment settings in TX, returning default.", error);
        return defaults;
    }
}

export async function createClosureFromCount(agreementId: number, lines: { productId: string; quantity: number }[], userName: string): Promise<PeriodClosure> {
    await authorizeAction('consignments:closures:create');
    const db = await getDb();
    
    return db.transaction(() => {
        const existingPending = db.prepare(`SELECT id FROM ${CONSIGNMENTS_TABLES.closures} WHERE agreement_id = ? AND status = 'pending'`).get(agreementId);
        if (existingPending) {
            throw new Error(`Ya existe un cierre pendiente para este cliente.`);
        }

        const agreement = db.prepare(`SELECT has_initial_inventory FROM ${CONSIGNMENTS_TABLES.agreements} WHERE id = ?`).get(agreementId) as { has_initial_inventory: 0 | 1 };
        if (!agreement) {
            throw new Error("El acuerdo de consignación para este cliente no fue encontrado o está inactivo.");
        }

        const isInitial = agreement.has_initial_inventory === 0;

        const settings = getSettingsTx(db);
        const nextClosureNumber = settings.next_closure_number || 1;
        const closureConsecutive = `CIERRE-${String(nextClosureNumber).padStart(6, '0')}`;
        
        const countRef = new Date().toISOString();

        // Save this count to physical_counts table, which will be used if approved
        const stmt = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.counts} (agreement_id, product_id, quantity, counted_at, counted_by) VALUES (?, ?, ?, ?, ?)`);
        for (const line of lines) {
            stmt.run(agreementId, line.productId.toUpperCase(), line.quantity, countRef, userName);
        }

        const closureInfo = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.closures} (consecutive, agreement_id, status, is_initial_inventory, physical_count_ref, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(closureConsecutive, agreementId, 'pending', isInitial ? 1 : 0, countRef, new Date().toISOString(), userName);
        
        db.prepare(`INSERT OR REPLACE INTO ${CONSIGNMENTS_TABLES.settings} (key, value) VALUES ('next_closure_number', ?)`).run(nextClosureNumber + 1);

        return db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(closureInfo.lastInsertRowid) as PeriodClosure;
    })();
}

export async function createBoletaFromCount(agreementId: number, counts: Record<string, string>, userName: string): Promise<RestockBoleta> {
    await authorizeAction('consignments:count');
    const db = await getDb();

    return db.transaction(() => {
        const agreement = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.agreements} WHERE id = ?`).get(agreementId) as ConsignmentAgreement;
        if (!agreement) throw new Error("Acuerdo de consignación no encontrado.");

        const consecutive = `${agreement.client_id}-${String(agreement.next_boleta_number).padStart(4, '0')}`;
        const boletaInfo = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.boletas} (consecutive, agreement_id, status, created_by, submitted_by, created_at, type) VALUES (?, ?, 'review', ?, ?, datetime('now'), 'REPOSITION')`)
            .run(consecutive, agreement.id, userName, userName);
        const boletaId = boletaInfo.lastInsertRowid as number;

        const allProducts = db.prepare('SELECT * FROM core_products').all() as Product[];
        const agreementProducts = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.products} WHERE agreement_id = ?`).all(agreementId) as ConsignmentProduct[];
        const insertLine = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.boletaLines} (boleta_id, product_id, product_description, client_product_code, counted_quantity, replenish_quantity, max_stock, price, is_manually_edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`);
        
        let hasLinesToReplenish = false;

        for (const ap of agreementProducts) {
            const countedQuantity = Number(counts[ap.product_id] || 0);
            
            const replenishQuantity = ap.max_stock > 0 
                ? Math.max(0, ap.max_stock - countedQuantity) 
                : 0;

            if (replenishQuantity > 0) {
                hasLinesToReplenish = true;
            }

            const productDescription = allProducts.find(p => p.id === ap.product_id)?.description || 'Desconocido';
            
            insertLine.run(boletaId, ap.product_id, productDescription, ap.client_product_code, countedQuantity, replenishQuantity, ap.max_stock, ap.price);
        }

        if (!hasLinesToReplenish) {
            throw new Error("No hay productos que necesiten reposición según el conteo y los stocks máximos.");
        }

        db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.agreements} SET next_boleta_number = ? WHERE id = ?`).run(agreement.next_boleta_number + 1, agreement.id);
        
        const historyStmt = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.boletaHistory} (boleta_id, timestamp, status, updatedBy, notes) VALUES (?, datetime('now'), ?, ?, ?)`);
        historyStmt.run(boletaId, 'review', userName, 'Boleta generada desde conteo de campo.');
        
        return db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletas} WHERE id = ?`).get(boletaId) as RestockBoleta;
    })();
}

export async function getLatestPhysicalCount(agreementId: number): Promise<PhysicalCount[] | null> {
    const db = await getDb();
    const latestTimestamp = db.prepare(`SELECT MAX(counted_at) as last_date FROM ${CONSIGNMENTS_TABLES.counts} WHERE agreement_id = ?`).get(agreementId) as { last_date: string | null };
    if (!latestTimestamp.last_date) return null;
    
    const counts = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.counts} WHERE agreement_id = ? AND counted_at = ?`).all(agreementId, latestTimestamp.last_date) as PhysicalCount[];
    return counts.length > 0 ? counts : null;
}

export async function getPhysicalCountByRef(agreementId: number, countedAt: string): Promise<PhysicalCount[]> {
    const db = await getDb();
    const counts = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.counts} WHERE agreement_id = ? AND counted_at = ?`).all(agreementId, countedAt) as PhysicalCount[];
    return JSON.parse(JSON.stringify(counts));
}

export async function getPeriodClosures(filters: { agreementId?: number } = {}): Promise<(PeriodClosure & { client_name: string; client_id: string; is_initial_inventory: boolean; })[]> {
    const db = await getDb();
    let query = `SELECT pc.*, ca.client_name, ca.client_id FROM ${CONSIGNMENTS_TABLES.closures} pc JOIN ${CONSIGNMENTS_TABLES.agreements} ca ON pc.agreement_id = ca.id`;
    const params: any[] = [];
    if (filters.agreementId) {
        query += ' WHERE pc.agreement_id = ?';
        params.push(filters.agreementId);
    }
    
    query += ' ORDER BY pc.created_at DESC';
    
    const closures = db.prepare(query).all(...params) as any[];
    
    const result = closures.map((c: any) => ({
        ...c,
        is_initial_inventory: c.is_initial_inventory === 1,
    }));
    
    return JSON.parse(JSON.stringify(result));
}

export async function getPeriodClosureDetails(closureId: number): Promise<PeriodClosure | null> {
    const db = await getDb();
    const closure = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(closureId) as PeriodClosure | undefined;
    return closure ? JSON.parse(JSON.stringify(closure)) : null;
}

export async function approvePeriodClosure(closureId: number, previousClosureId: number | null, updatedBy: string): Promise<PeriodClosure> {
    await authorizeAction('consignments:boleta:approve'); // Closure approval linked to boleta approval
    const db = await getDb();

    return db.transaction(() => {
        const closure = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(closureId) as PeriodClosure | undefined;
        if (!closure || !closure.physical_count_ref) throw new Error("El cierre es inválido o no tiene un conteo físico de referencia para poder ser aprobado.");
        
        const counts = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.counts} WHERE agreement_id = ? AND counted_at = ?`).all(closure.agreement_id, closure.physical_count_ref) as PhysicalCount[];
        if (counts.length === 0) throw new Error("Error de consistencia: Los datos del conteo físico para este cierre se han perdido o están corruptos.");
        
        const agreement = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.agreements} WHERE id = ?`).get(closure.agreement_id) as ConsignmentAgreement;

        // Create the official boleta from the physical counts
        const boletaConsecutive = `CIERRE-B-${closure.consecutive}`;
        const boletaInfo = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.boletas} (consecutive, agreement_id, status, created_by, created_at, type) VALUES (?, ?, 'approved', ?, ?, 'INVENTORY_COUNT')`)
            .run(boletaConsecutive, closure.agreement_id, updatedBy, closure.created_at);
        const boletaId = boletaInfo.lastInsertRowid as number;

        const allProducts = db.prepare('SELECT * FROM core_products').all() as Product[];
        const agreementProducts = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.products} WHERE agreement_id = ?`).all(closure.agreement_id) as ConsignmentProduct[];
        const insertLine = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.boletaLines} (boleta_id, product_id, product_description, client_product_code, counted_quantity, replenish_quantity, max_stock, price, is_manually_edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`);
        
        for (const count of counts) {
            const agreementProduct = agreementProducts.find(p => p.product_id === count.product_id);
            if (!agreementProduct) continue;
            
            const productDescription = allProducts.find(p => p.id === count.product_id)?.description || 'Desconocido';
            insertLine.run(boletaId, count.product_id, productDescription, agreementProduct.client_product_code, count.quantity, 0, agreementProduct.max_stock, agreementProduct.price);
        }
        
        // Update the closure to link it to the newly created boleta
        db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.closures} SET status = ?, previous_closure_id = ?, approved_at = ?, approved_by = ?, closure_boleta_id = ? WHERE id = ?`)
          .run('approved', previousClosureId, new Date().toISOString(), updatedBy, boletaId, closureId);

        // **CRITICAL LOGIC**: If this is an initial inventory closure, update the agreement flag.
        if (closure.is_initial_inventory) {
            db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.agreements} SET has_initial_inventory = 1 WHERE id = ?`).run(closure.agreement_id);
        }

        return db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(closureId) as PeriodClosure;
    })();
}

export async function rejectPeriodClosure(closureId: number, notes: string, updatedBy: string): Promise<PeriodClosure> {
    const db = await getDb();
    db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.closures} SET status = ?, notes = ?, approved_by = ?, approved_at = ? WHERE id = ?`)
      .run('rejected', notes, updatedBy, new Date().toISOString(), closureId);
    return db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(closureId) as PeriodClosure;
}

export async function annulPeriodClosure(closureId: number, updatedBy: string): Promise<PeriodClosure> {
    await authorizeAction('consignments:closures:annul');
    const db = await getDb();

    return db.transaction(() => {
        const closureToAnnul = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(closureId) as (Omit<PeriodClosure, 'is_initial_inventory'> & { is_initial_inventory: 0 | 1; }) | undefined;

        if (!closureToAnnul) {
            throw new Error("El cierre que intentas anular no fue encontrado.");
        }
        if (closureToAnnul.status !== 'approved') {
            throw new Error("Acción no permitida: Solo se pueden anular cierres que se encuentren en estado 'Aprobado'.");
        }

        const isUsed = db.prepare('SELECT id FROM period_closures WHERE previous_closure_id = ?').get(closureId);
        if (isUsed) {
            throw new Error("Anulación bloqueada: Este cierre no se puede anular porque ya fue utilizado como el punto de partida para el siguiente período de facturación.");
        }
        
        const newNotes = `Anulado por ${updatedBy} el ${new Date().toISOString()}`;
        db.prepare(`UPDATE period_closures SET status = 'annulled', notes = ? WHERE id = ?`).run(newNotes, closureId);

        if (closureToAnnul.is_initial_inventory === 1) {
            db.prepare('UPDATE consignment_agreements SET has_initial_inventory = 0 WHERE id = ?').run(closureToAnnul.agreement_id);
            logWarn(`Initial inventory flag reset for agreement ${closureToAnnul.agreement_id} due to closure annulment.`);
        }
        
        const updatedClosure: PeriodClosure = {
            ...(closureToAnnul as any), // This cast is to satisfy TS, we know the shape is correct
            is_initial_inventory: closureToAnnul.is_initial_inventory === 1,
            status: 'annulled',
            notes: newNotes,
        };
        return updatedClosure;
    })();
}

export async function getConsignmentsBillingReportData(closureId: number): Promise<{ reportRows: ConsignmentReportRow[], boletas: (RestockBoleta & { lines: BoletaLine[]; history: BoletaHistory[]; })[], currentClosure: (PeriodClosure & { client_name: string; }), previousClosure: PeriodClosure | null; } | { error: string; }> {
    const db = await getDb();

    const currentClosure = db.prepare(`
        SELECT pc.*, ca.client_name 
        FROM ${CONSIGNMENTS_TABLES.closures} pc
        JOIN ${CONSIGNMENTS_TABLES.agreements} ca ON pc.agreement_id = ca.id
        WHERE pc.id = ? AND pc.status IN ('approved', 'invoiced')
    `).get(closureId) as (PeriodClosure & { client_name: string }) | undefined;

    if (!currentClosure) {
        return { error: "Cierre no encontrado o no está en estado 'Aprobado' o 'Facturado'." };
    }

    const previousClosure = currentClosure.previous_closure_id 
        ? db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(currentClosure.previous_closure_id) as PeriodClosure
        : null;

    const startDate = previousClosure ? parseISO(previousClosure.created_at) : new Date(0);
    const endDate = parseISO(currentClosure.created_at);

    const boletasInPeriod = await getBoletasByDateRange(String(currentClosure.agreement_id), { from: startDate, to: endDate }, ['approved', 'sent', 'invoiced'], 'REPOSITION');
    const adjustmentsInPeriod = await getAdjustmentsInPeriod(currentClosure.agreement_id, { from: startDate, to: endDate });
    const agreementDetails = await getAgreementDetails(currentClosure.agreement_id);
    const allProducts = db.prepare('SELECT * FROM core_products').all() as Product[];
    const productMap = new Map(allProducts.map(p => [p.id, p.description]));

    const getStockFromClosure = (closure: PeriodClosure | null): Map<string, number> => {
        const stockMap = new Map<string, number>();
        if (closure?.physical_count_ref) {
            const counts = db.prepare(`SELECT product_id, quantity FROM ${CONSIGNMENTS_TABLES.counts} WHERE agreement_id = ? AND counted_at = ?`).all(closure.agreement_id, closure.physical_count_ref) as { product_id: string, quantity: number }[];
            counts.forEach(c => stockMap.set(c.product_id, c.quantity));
        }
        return stockMap;
    };
    
    const initialStockMap = getStockFromClosure(previousClosure);
    const finalStockMap = getStockFromClosure(currentClosure);

    const replenishedMap = new Map<string, number>();
    boletasInPeriod.forEach(boleta => {
        boleta.lines.forEach(line => {
            replenishedMap.set(line.product_id, (replenishedMap.get(line.product_id) || 0) + line.replenish_quantity);
        });
    });
    
    const adjustmentsMap = new Map<string, number>();
    adjustmentsInPeriod.forEach(adj => {
        adjustmentsMap.set(adj.product_id, (adjustmentsMap.get(adj.product_id) || 0) + adj.quantity);
    });

    const reportRows: ConsignmentReportRow[] = (agreementDetails?.products || []).map(product => {
        const initialStock = initialStockMap.get(product.product_id) || 0;
        const totalReplenished = replenishedMap.get(product.product_id) || 0;
        const totalAdjustments = adjustmentsMap.get(product.product_id) || 0;
        const finalStock = finalStockMap.get(product.product_id) || 0;
        const consumption = (initialStock + totalReplenished + totalAdjustments) - finalStock;

        // Create transaction history for details
        const transactions: ConsignmentReportRow['transactions'] = [];
        boletasInPeriod.forEach(boleta => {
            boleta.lines.forEach(line => {
                if (line.product_id === product.product_id && line.replenish_quantity > 0) {
                    transactions.push({ date: boleta.created_at, type: 'Entrega', document: boleta.consecutive, quantity: line.replenish_quantity, user: boleta.approved_by || boleta.created_by, notes: boleta.notes });
                }
            });
        });
        adjustmentsInPeriod.forEach(adj => {
            if (adj.product_id === product.product_id) {
                transactions.push({ date: adj.created_at, type: `Ajuste: ${adj.reason}`, document: `AJUSTE-${adj.id}`, quantity: adj.quantity, user: adj.created_by, notes: adj.notes });
            }
        });
        transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {
            productId: product.product_id,
            productDescription: productMap.get(product.product_id) || 'Producto Desconocido',
            clientProductCode: product.client_product_code || '',
            initialStock,
            totalReplenished,
            finalStock,
            consumption: consumption > 0 ? consumption : 0,
            price: product.price,
            totalValue: consumption > 0 ? consumption * product.price : 0,
            adjustments: totalAdjustments,
            transactions,
            boletaConsecutives: '', 
            creationDates: '', 
            deliveryDates: '', 
            erpInvoices: '', 
            erpMovementIds: '', 
            approvers: '',
        };
    }).filter(row => row.consumption > 0 || row.initialStock > 0 || row.totalReplenished > 0 || row.finalStock > 0 || row.adjustments !== 0);

    return {
        reportRows: JSON.parse(JSON.stringify(reportRows)),
        boletas: JSON.parse(JSON.stringify(boletasInPeriod)),
        currentClosure: JSON.parse(JSON.stringify(currentClosure)),
        previousClosure: JSON.parse(JSON.stringify(previousClosure)),
    };
}


export async function getConsignmentsReportData(
    agreementId: string,
    dateRange: { from: Date; to: Date },
    filters: { boletaIds?: string[]; closureId?: string }
): Promise<{
    reportRows: ConsignmentReportRow[];
    boletas: (RestockBoleta & { lines: BoletaLine[]; history: BoletaHistory[] })[];
    allBoletasForClient: RestockBoleta[];
    allClosuresForClient: (PeriodClosure & { client_name: string; is_initial_inventory: boolean; previous_closure_consecutive?: string; })[];
}> {
    const db = await getDb();
    const agreementIdNum = Number(agreementId);

    const [allClosuresForClient, allBoletasForClient] = await Promise.all([
        (db.prepare(`SELECT pc.*, ca.client_name FROM ${CONSIGNMENTS_TABLES.closures} pc JOIN ${CONSIGNMENTS_TABLES.agreements} ca ON pc.agreement_id = ca.id WHERE pc.agreement_id = ? AND pc.status = 'approved' ORDER BY pc.created_at DESC`).all(agreementIdNum) as (PeriodClosure & {client_name: string})[]),
        (db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletas} WHERE agreement_id = ? ORDER BY created_at DESC`).all(agreementIdNum) as RestockBoleta[])
    ]);

    let effectiveStartDate: Date, effectiveEndDate: Date;
    let initialStockClosure: PeriodClosure | null = null;
    let finalStockClosure: PeriodClosure | null = null;

    if (filters.closureId) {
        finalStockClosure = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(filters.closureId) as PeriodClosure;
        if (!finalStockClosure) throw new Error('Cierre final no encontrado');
        
        initialStockClosure = finalStockClosure.previous_closure_id
            ? db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(finalStockClosure.previous_closure_id) as PeriodClosure
            : null;
        
        effectiveStartDate = initialStockClosure ? parseISO(initialStockClosure.created_at) : new Date(0);
        effectiveEndDate = parseISO(finalStockClosure.created_at);
    } else {
        effectiveStartDate = dateRange.from;
        effectiveEndDate = dateRange.to;
        initialStockClosure = db.prepare(`
            SELECT * FROM period_closures 
            WHERE agreement_id = ? AND status = 'approved' AND created_at < ? 
            ORDER BY created_at DESC LIMIT 1
        `).get(agreementIdNum, effectiveStartDate.toISOString()) as PeriodClosure | null;
    }

    const boletaFilter = filters.boletaIds && filters.boletaIds.length > 0 ? filters.boletaIds.map(Number) : null;
    let boletasInPeriod = await getBoletasByDateRange(agreementId, { from: effectiveStartDate, to: effectiveEndDate }, ['approved', 'sent', 'invoiced'], 'REPOSITION');

    if (boletaFilter) {
        boletasInPeriod = boletasInPeriod.filter(b => boletaFilter.includes(b.id));
    }

    const adjustmentsInPeriod = await getAdjustmentsInPeriod(agreementIdNum, { from: effectiveStartDate, to: effectiveEndDate });
    const agreementDetails = await getAgreementDetails(agreementIdNum);
    const allProducts = await getAllProductsFromMainDb();
    const productMap = new Map(allProducts.map(p => [p.id, p.description]));

    const getStockFromClosure = (closure: PeriodClosure | null): Map<string, number> => {
        const stockMap = new Map<string, number>();
        if (closure?.physical_count_ref) {
            const counts = db.prepare('SELECT product_id, quantity FROM physical_counts WHERE agreement_id = ? AND counted_at = ?').all(closure.agreement_id, closure.physical_count_ref) as { product_id: string, quantity: number }[];
            counts.forEach(c => stockMap.set(c.product_id, c.quantity));
        }
        return stockMap;
    };
    
    const initialStockMap = getStockFromClosure(initialStockClosure);
    const finalStockMap = getStockFromClosure(finalStockClosure);

    const replenishedMap = new Map<string, number>();
    boletasInPeriod.forEach(boleta => boleta.lines.forEach(line => replenishedMap.set(line.product_id, (replenishedMap.get(line.product_id) || 0) + line.replenish_quantity)));
    
    const adjustmentsMap = new Map<string, number>();
    adjustmentsInPeriod.forEach(adj => adjustmentsMap.set(adj.product_id, (adjustmentsMap.get(adj.product_id) || 0) + adj.quantity));

    const reportRows: ConsignmentReportRow[] = (agreementDetails?.products || []).map(product => {
        const initialStock = initialStockMap.get(product.product_id) || 0;
        const totalReplenished = replenishedMap.get(product.product_id) || 0;
        const totalAdjustments = adjustmentsMap.get(product.product_id) || 0;
        const finalStock = finalStockClosure ? (finalStockMap.get(product.product_id) || 0) : 0;
        const consumption = finalStockClosure ? (initialStock + totalReplenished + totalAdjustments) - finalStock : (initialStock + totalReplenished + totalAdjustments);


        const transactions: ConsignmentReportRow['transactions'] = [];
        boletasInPeriod.forEach(boleta => {
            boleta.lines.forEach(line => {
                if (line.product_id === product.product_id && line.replenish_quantity > 0) {
                    transactions.push({ date: boleta.created_at, type: 'Entrega', document: boleta.consecutive, quantity: line.replenish_quantity, user: boleta.approved_by || boleta.created_by, notes: boleta.notes });
                }
            });
        });
        adjustmentsInPeriod.forEach(adj => {
            if (adj.product_id === product.product_id) {
                transactions.push({ date: adj.created_at, type: `Ajuste: ${adj.reason}`, document: `AJUSTE-${adj.id}`, quantity: adj.quantity, user: adj.created_by, notes: adj.notes });
            }
        });
        transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        return {
            productId: product.product_id,
            productDescription: productMap.get(product.product_id) || 'Producto Desconocido',
            clientProductCode: product.client_product_code || '',
            initialStock,
            totalReplenished,
            finalStock,
            consumption: consumption > 0 ? consumption : 0,
            price: product.price,
            totalValue: consumption > 0 ? consumption * product.price : 0,
            adjustments: totalAdjustments,
            transactions,
            boletaConsecutives: '', 
            creationDates: '', 
            deliveryDates: '', 
            erpInvoices: '', 
            erpMovementIds: '', 
            approvers: '',
        };
    }).filter(row => row.consumption !== 0 || row.initialStock !== 0 || row.totalReplenished !== 0 || row.finalStock !== 0 || row.adjustments !== 0);

    return {
        reportRows: JSON.parse(JSON.stringify(reportRows)),
        boletas: JSON.parse(JSON.stringify(boletasInPeriod)),
        allBoletasForClient: JSON.parse(JSON.stringify(allBoletasForClient)),
        allClosuresForClient: JSON.parse(JSON.stringify(allClosuresForClient))
    };
}


export async function saveReplenishmentBoleta(agreementId: number, lines: { productId: string; quantity: number }[], userName: string): Promise<RestockBoleta> {
    const db = await getDb();
    
    return db.transaction(() => {
        const agreement = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.agreements} WHERE id = ?`).get(agreementId) as ConsignmentAgreement;
        if (!agreement) throw new Error("El acuerdo de consignación no fue encontrado. No se puede crear la solicitud de reposición.");

        const consecutive = `${agreement.client_id}-${String(agreement.next_boleta_number).padStart(4, '0')}`;
        const boletaInfo = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.boletas} (consecutive, agreement_id, status, created_by, submitted_by, created_at, type) VALUES (?, ?, 'review', ?, ?, datetime('now'), 'REPOSITION')`)
            .run(consecutive, agreement.id, userName, userName);
        const boletaId = boletaInfo.lastInsertRowid as number;

        const allProducts = db.prepare('SELECT * FROM core_products').all() as Product[];
        const agreementProducts = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.products} WHERE agreement_id = ?`).all(agreementId) as ConsignmentProduct[];
        const insertLine = db.prepare(`INSERT INTO ${CONSIGNMENTS_TABLES.boletaLines} (boleta_id, product_id, product_description, client_product_code, counted_quantity, replenish_quantity, max_stock, price, is_manually_edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`);
        
        for (const line of lines) {
            const normalizedProductId = line.productId.toUpperCase();
            const agreementProduct = agreementProducts.find(p => p.product_id === normalizedProductId);
            if (!agreementProduct) continue;
            
            const productDescription = allProducts.find(p => p.id === normalizedProductId)?.description || 'Desconocido';
            
            insertLine.run(boletaId, normalizedProductId, productDescription, agreementProduct.client_product_code, 0, line.quantity, agreementProduct.max_stock, agreementProduct.price);
        }

        db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.agreements} SET next_boleta_number = ? WHERE id = ?`).run(agreement.next_boleta_number + 1, agreement.id);
        
        return db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.boletas} WHERE id = ?`).get(boletaId) as RestockBoleta;
    })();
}

export async function getLatestApprovedClosure(agreementId: number): Promise<PeriodClosure | null> {
    const db = await getDb();
    const closure = db.prepare(`
        SELECT * FROM ${CONSIGNMENTS_TABLES.closures}
        WHERE agreement_id = ? AND status = 'approved'
        ORDER BY created_at DESC
        LIMIT 1
    `).get(agreementId) as PeriodClosure | undefined;
    return closure ? JSON.parse(JSON.stringify(closure)) : null;
}

export async function getAdjustmentsInPeriod(agreementId: number, dateRange: { from: Date; to: Date }): Promise<ConsignmentAdjustment[]> {
    const db = await getDb();
    const adjustments = db.prepare(`
        SELECT * FROM ${CONSIGNMENTS_TABLES.adjustments} 
        WHERE agreement_id = ? AND created_at BETWEEN ? AND ?
        ORDER BY created_at ASC
    `).all(agreementId, dateRange.from.toISOString(), dateRange.to.toISOString()) as ConsignmentAdjustment[];
    return JSON.parse(JSON.stringify(adjustments));
}

export async function saveAdjustment(payload: {
    agreementId: number;
    productId: string;
    quantity: number;
    reason: ConsignmentAdjustmentReason;
    notes?: string;
    userName: string;
}): Promise<void> {
    const db = await getDb();
    const { agreementId, productId: rawProductId, quantity, reason, notes, userName } = payload;
    const productId = rawProductId.toUpperCase();
    
    db.prepare(`
        INSERT INTO ${CONSIGNMENTS_TABLES.adjustments} (agreement_id, product_id, quantity, reason, notes, created_at, created_by) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
    `).run(agreementId, productId, quantity, reason, notes || null, userName);
    
    logInfo('Consignment adjustment saved', { ...payload });
}

export async function getPhysicalCountHistory(agreementId: number): Promise<{ counted_at: string, counted_by: string }[]> {
    const db = await getDb();
    const history = db.prepare(`
        SELECT counted_at, counted_by
        FROM ${CONSIGNMENTS_TABLES.counts}
        WHERE agreement_id = ?
        GROUP BY counted_at, counted_by
        ORDER BY counted_at DESC
        LIMIT 10
    `).all(agreementId) as { counted_at: string; counted_by: string }[];
    return JSON.parse(JSON.stringify(history));
}

export async function getRecentPhysicalCounts(agreementId: number): Promise<{ counted_at: string; counted_by: string }[]> {
    const db = await getDb();
    const counts = db.prepare(`
        SELECT counted_at, counted_by 
        FROM ${CONSIGNMENTS_TABLES.counts} 
        WHERE agreement_id = ? 
        GROUP BY counted_at, counted_by
        ORDER BY counted_at DESC 
        LIMIT 5
    `).all(agreementId) as { counted_at: string; counted_by: string }[];
    return JSON.parse(JSON.stringify(counts));
}

export async function lockAgreement(agreementId: number, userId: number, userName: string): Promise<{ success: boolean, locked: boolean, message: string }> {
    const db = await getDb();
    const agreement = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.agreements} WHERE id = ?`).get(agreementId) as (ConsignmentAgreement & { locked_by?: string });
    if (!agreement) {
        return { success: false, locked: false, message: 'Acuerdo no encontrado.' };
    }
    if (agreement.locked_by && agreement.locked_by !== userName) {
        return { success: false, locked: true, message: `El acuerdo está siendo usado por ${agreement.locked_by}.` };
    }
    db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.agreements} SET locked_by = ?, locked_by_user_id = ?, locked_at = datetime('now') WHERE id = ?`).run(userName, userId, agreementId);
    return { success: true, locked: false, message: 'Acuerdo bloqueado para ti.' };
}

export async function forceRelayLock(agreementId: number, userId: number, userName: string): Promise<void> {
    const db = await getDb();
    logWarn(`Lock for agreement ${agreementId} was force-relayed to ${userName}.`);
    db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.agreements} SET locked_by = ?, locked_by_user_id = ?, locked_at = datetime('now') WHERE id = ?`).run(userName, userId, agreementId);
}

export async function releaseAgreementLock(agreementId: number, userId: number): Promise<void> {
    const db = await getDb();
    // Only release locks that belong to the current user's session
    db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.agreements} SET locked_by = NULL, locked_by_user_id = NULL, locked_at = NULL WHERE id = ? AND locked_by_user_id = ?`).run(agreementId, userId);
}


export async function linkInvoiceToClosure(closureId: number, invoiceNumber: string, userName: string): Promise<void> {
    await authorizeAction('consignments:boleta:invoice');
    const db = await getDb();

    db.transaction(() => {
        const closure = db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(closureId) as PeriodClosure | undefined;
        if (!closure || closure.status !== 'approved') {
            throw new Error("El cierre no fue encontrado o no está aprobado.");
        }

        const previousClosure = closure.previous_closure_id 
            ? db.prepare(`SELECT * FROM ${CONSIGNMENTS_TABLES.closures} WHERE id = ?`).get(closure.previous_closure_id) as PeriodClosure
            : null;

        const startDate = previousClosure ? parseISO(previousClosure.created_at) : new Date(0);
        const endDate = parseISO(closure.created_at);

        const boletasToUpdate = db.prepare(`
            SELECT id FROM ${CONSIGNMENTS_TABLES.boletas}
            WHERE agreement_id = ? 
            AND created_at > ? 
            AND created_at <= ?
            AND status IN ('approved', 'sent', 'invoiced')
        `).all(closure.agreement_id, startDate.toISOString(), endDate.toISOString()) as { id: number }[];

        if (boletasToUpdate.length > 0) {
            const boletaIds = boletasToUpdate.map(b => b.id);
            const placeholders = boletaIds.map(() => '?').join(',');
            db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.boletas} SET erp_invoice_number = ? WHERE id IN (${placeholders})`).run(invoiceNumber, ...boletaIds);
        }

        db.prepare(`UPDATE ${CONSIGNMENTS_TABLES.closures} SET erp_invoice_number = ?, invoiced_at = datetime('now'), status = 'invoiced' WHERE id = ?`)
            .run(invoiceNumber, closureId);

        logInfo(`Linked invoice ${invoiceNumber} to closure ${closure.consecutive}`, { user: userName, closureId, boletasUpdated: boletasToUpdate.length });
    })();
}
