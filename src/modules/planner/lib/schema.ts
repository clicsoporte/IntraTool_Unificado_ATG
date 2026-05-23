/**
 * @fileoverview Defines the expected database schema for the Planner module and its initialization.
 */

import { Database } from 'better-sqlite3';
import { CustomStatus, PlannerShift } from '@/modules/core/types';

export const PLANNER_TABLES = {
    settings: 'planner_settings',
    orders: 'planner_orders',
    history: 'planner_order_history',
} as const;

export function initializePlannerSchema(db: Database) {
    // 1. Check current version
    const migrationTable = '_core_migrations';
    const result = db.prepare(`SELECT version FROM ${migrationTable} WHERE module = 'planner'`).get() as { version: number } | undefined;
    const currentVersion = result ? result.version : 0;

    // 2. Define schema for version 1
    if (currentVersion < 1) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${PLANNER_TABLES.settings} (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ${PLANNER_TABLES.orders} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consecutive TEXT UNIQUE NOT NULL,
                purchaseOrder TEXT,
                requestDate TEXT NOT NULL,
                deliveryDate TEXT NOT NULL,
                scheduledStartDate TEXT,
                scheduledEndDate TEXT,
                customerId TEXT NOT NULL,
                customerName TEXT NOT NULL,
                customerTaxId TEXT,
                productId TEXT NOT NULL,
                productDescription TEXT NOT NULL,
                quantity REAL NOT NULL,
                inventory REAL,
                inventoryErp REAL,
                priority TEXT NOT NULL,
                status TEXT NOT NULL,
                pendingAction TEXT DEFAULT 'none',
                notes TEXT,
                requestedBy TEXT NOT NULL,
                approvedBy TEXT,
                lastStatusUpdateBy TEXT,
                lastStatusUpdateNotes TEXT,
                lastModifiedBy TEXT,
                lastModifiedAt TEXT,
                hasBeenModified BOOLEAN DEFAULT FALSE,
                deliveredQuantity REAL,
                defectiveQuantity REAL,
                erpPackageNumber TEXT,
                erpTicketNumber TEXT,
                reopened BOOLEAN DEFAULT FALSE,
                machineId TEXT,
                shiftId TEXT,
                previousStatus TEXT,
                erpOrderNumber TEXT
            );

            CREATE TABLE IF NOT EXISTS ${PLANNER_TABLES.history} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                orderId INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT,
                updatedBy TEXT NOT NULL,
                FOREIGN KEY (orderId) REFERENCES ${PLANNER_TABLES.orders}(id)
            );

            -- Production Indexes
            CREATE INDEX IF NOT EXISTS idx_plan_orders_consecutive ON ${PLANNER_TABLES.orders}(consecutive);
            CREATE INDEX IF NOT EXISTS idx_plan_orders_customerId ON ${PLANNER_TABLES.orders}(customerId);
            CREATE INDEX IF NOT EXISTS idx_plan_orders_productId ON ${PLANNER_TABLES.orders}(productId);
            CREATE INDEX IF NOT EXISTS idx_plan_orders_status ON ${PLANNER_TABLES.orders}(status);
            CREATE INDEX IF NOT EXISTS idx_plan_history_orderId ON ${PLANNER_TABLES.history}(orderId);
        `);

        // Initial Defaults
        const defaultCustomStatuses: CustomStatus[] = [
            { id: 'custom-1', label: '', color: '#8884d8', isActive: false },
            { id: 'custom-2', label: '', color: '#82ca9d', isActive: false },
            { id: 'custom-3', label: '', color: '#ffc658', isActive: false },
            { id: 'custom-4', label: '', color: '#ff8042', isActive: false },
        ];
        
        const defaultShifts: PlannerShift[] = [
            { id: 'turno-a', name: 'Turno A' },
            { id: 'turno-b', name: 'Turno B' },
        ];

        const defaultPdfColumns = ['consecutive', 'customerName', 'productDescription', 'quantity', 'deliveryDate', 'status'];
        const defaultFieldsToTrack = ['quantity', 'deliveryDate', 'customerId', 'productId'];

        const insertSetting = db.prepare(`INSERT OR IGNORE INTO ${PLANNER_TABLES.settings} (key, value) VALUES (?, ?)`);
        
        insertSetting.run('orderPrefix', 'OP-');
        insertSetting.run('nextOrderNumber', '1');
        insertSetting.run('useWarehouseReception', 'false');
        insertSetting.run('showCustomerTaxId', 'true');
        insertSetting.run('machines', '[]');
        insertSetting.run('shifts', JSON.stringify(defaultShifts));
        insertSetting.run('requireMachineForStart', 'false');
        insertSetting.run('requireShiftForCompletion', 'false');
        insertSetting.run('assignmentLabel', 'Máquina Asignada');
        insertSetting.run('shiftLabel', 'Turno');
        insertSetting.run('customStatuses', JSON.stringify(defaultCustomStatuses));
        insertSetting.run('pdfPaperSize', 'letter');
        insertSetting.run('pdfOrientation', 'portrait');
        insertSetting.run('pdfExportColumns', JSON.stringify(defaultPdfColumns));
        insertSetting.run('pdfTopLegend', '');
        insertSetting.run('fieldsToTrackChanges', JSON.stringify(defaultFieldsToTrack));

        db.prepare(`INSERT OR REPLACE INTO ${migrationTable} (module, version) VALUES ('planner', 1)`).run();
        console.log("Planner schema initialized to version 1.");
    }

    // Future migrations go here (if currentVersion < 2, etc.)
}
