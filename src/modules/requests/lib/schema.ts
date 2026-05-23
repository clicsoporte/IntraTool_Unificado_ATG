import { Database } from 'better-sqlite3';

export const REQUESTS_TABLES = {
    settings: 'req_settings',
    requests: 'req_requests',
    history: 'req_history'
} as const;

export async function initializeRequestsSchema(db: Database) {
    // Check current version
    db.exec(`
        CREATE TABLE IF NOT EXISTS _req_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            installed_at TEXT NOT NULL
        )
    `);

    const row = db.prepare('SELECT MAX(version) as version FROM _req_migrations').get() as { version: number | null };
    const currentVersion = row?.version || 0;

    if (currentVersion < 1) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${REQUESTS_TABLES.settings} (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ${REQUESTS_TABLES.requests} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consecutive TEXT UNIQUE NOT NULL,
                purchaseOrder TEXT,
                requestDate TEXT NOT NULL,
                requiredDate TEXT NOT NULL,
                arrivalDate TEXT,
                receivedDate TEXT,
                clientId TEXT NOT NULL,
                clientName TEXT NOT NULL,
                clientTaxId TEXT,
                itemId TEXT NOT NULL,
                itemDescription TEXT NOT NULL,
                quantity REAL NOT NULL,
                deliveredQuantity REAL,
                inventory REAL,
                inventoryErp REAL,
                priority TEXT DEFAULT 'medium',
                purchaseType TEXT DEFAULT 'single',
                unitSalePrice REAL,
                salePriceCurrency TEXT DEFAULT 'CRC',
                requiresCurrency BOOLEAN DEFAULT FALSE,
                erpOrderNumber TEXT,
                erpOrderLine INTEGER,
                erpEntryNumber TEXT,
                manualSupplier TEXT,
                route TEXT,
                shippingMethod TEXT,
                status TEXT NOT NULL,
                pendingAction TEXT DEFAULT 'none',
                notes TEXT,
                requestedBy TEXT NOT NULL,
                approvedBy TEXT,
                receivedInWarehouseBy TEXT,
                lastStatusUpdateBy TEXT,
                lastStatusUpdateNotes TEXT,
                reopened BOOLEAN DEFAULT FALSE,
                previousStatus TEXT,
                lastModifiedBy TEXT,
                lastModifiedAt TEXT,
                hasBeenModified BOOLEAN DEFAULT FALSE,
                sourceOrders TEXT,
                involvedClients TEXT,
                analysis TEXT
            );

            CREATE TABLE IF NOT EXISTS ${REQUESTS_TABLES.history} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                requestId INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT,
                updatedBy TEXT NOT NULL,
                FOREIGN KEY (requestId) REFERENCES ${REQUESTS_TABLES.requests}(id) ON DELETE CASCADE
            );

            -- Production Indexes
            CREATE INDEX IF NOT EXISTS idx_req_requests_consecutive ON ${REQUESTS_TABLES.requests}(consecutive);
            CREATE INDEX IF NOT EXISTS idx_req_requests_clientId ON ${REQUESTS_TABLES.requests}(clientId);
            CREATE INDEX IF NOT EXISTS idx_req_requests_status ON ${REQUESTS_TABLES.requests}(status);
            CREATE INDEX IF NOT EXISTS idx_req_history_requestId ON ${REQUESTS_TABLES.history}(requestId);
        `);

        // Seed initial settings
        const seedSettings = [
            ['requestPrefix', 'SC-'],
            ['nextRequestNumber', '1'],
            ['routes', '["Ruta GAM", "Fuera de GAM"]'],
            ['shippingMethods', '["Mensajer\u00EDa", "Encomienda", "Transporte Propio"]'],
            ['useWarehouseReception', 'false'],
            ['useErpEntry', 'false'],
            ['showCustomerTaxId', 'true'],
            ['pdfTopLegend', ''],
            ['pdfPaperSize', 'letter'],
            ['pdfOrientation', 'portrait'],
            ['pdfExportColumns', JSON.stringify(['consecutive', 'itemDescription', 'quantity', 'clientName', 'requiredDate', 'status'])]
        ];

        const insertSetting = db.prepare(`INSERT OR IGNORE INTO ${REQUESTS_TABLES.settings} (key, value) VALUES (?, ?)`);
        for (const [key, value] of seedSettings) {
            insertSetting.run(key, value);
        }

        db.prepare('INSERT INTO _req_migrations (version, installed_at) VALUES (?, ?)').run(1, new Date().toISOString());
    }

    console.log('Requests schema initialized at version', currentVersion < 1 ? 1 : currentVersion);
}
