import { Database } from 'better-sqlite3';

export const CONSIGNMENTS_TABLES = {
    agreements: 'cs_agreements',
    products: 'cs_products',
    boletas: 'cs_boletas',
    boletaLines: 'cs_boleta_lines',
    boletaHistory: 'cs_boleta_history',
    settings: 'cs_settings',
    counts: 'cs_counts',
    closures: 'cs_closures',
    adjustments: 'cs_adjustments'
} as const;

export async function initializeConsignmentsSchema(db: Database) {
    // Check current version
    db.exec(`
        CREATE TABLE IF NOT EXISTS _cs_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            installed_at TEXT NOT NULL
        )
    `);

    const row = db.prepare('SELECT MAX(version) as version FROM _cs_migrations').get() as { version: number | null };
    const currentVersion = row?.version || 0;

    if (currentVersion < 1) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${CONSIGNMENTS_TABLES.agreements} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT UNIQUE NOT NULL,
                client_name TEXT NOT NULL,
                erp_warehouse_id TEXT,
                next_boleta_number INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                has_initial_inventory BOOLEAN NOT NULL DEFAULT 0,
                product_code_display_mode TEXT NOT NULL DEFAULT 'erp_only',
                notification_user_ids TEXT,
                operation_mode TEXT NOT NULL DEFAULT 'auto',
                locked_by TEXT,
                locked_by_user_id INTEGER,
                locked_at TEXT
            );

            CREATE TABLE IF NOT EXISTS ${CONSIGNMENTS_TABLES.products} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agreement_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                client_product_code TEXT,
                max_stock REAL NOT NULL,
                price REAL NOT NULL,
                FOREIGN KEY (agreement_id) REFERENCES ${CONSIGNMENTS_TABLES.agreements}(id) ON DELETE CASCADE,
                UNIQUE(agreement_id, product_id)
            );

            CREATE TABLE IF NOT EXISTS ${CONSIGNMENTS_TABLES.boletas} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consecutive TEXT UNIQUE NOT NULL,
                agreement_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'REPOSITION',
                created_by TEXT,
                submitted_by TEXT,
                created_at TEXT,
                approved_by TEXT,
                approved_at TEXT,
                erp_invoice_number TEXT,
                erp_movement_id TEXT,
                delivery_date TEXT,
                notes TEXT,
                previousStatus TEXT,
                FOREIGN KEY (agreement_id) REFERENCES ${CONSIGNMENTS_TABLES.agreements}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ${CONSIGNMENTS_TABLES.boletaLines} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                boleta_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                client_product_code TEXT,
                product_description TEXT NOT NULL,
                counted_quantity REAL NOT NULL,
                replenish_quantity REAL NOT NULL,
                max_stock REAL NOT NULL,
                price REAL NOT NULL,
                is_manually_edited BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (boleta_id) REFERENCES ${CONSIGNMENTS_TABLES.boletas}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ${CONSIGNMENTS_TABLES.boletaHistory} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                boleta_id INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT,
                updatedBy TEXT NOT NULL,
                FOREIGN KEY (boleta_id) REFERENCES ${CONSIGNMENTS_TABLES.boletas}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ${CONSIGNMENTS_TABLES.settings} (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ${CONSIGNMENTS_TABLES.counts} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agreement_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                quantity REAL NOT NULL,
                counted_at TEXT NOT NULL,
                counted_by TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ${CONSIGNMENTS_TABLES.closures} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consecutive TEXT UNIQUE NOT NULL,
                agreement_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                is_initial_inventory BOOLEAN NOT NULL DEFAULT 0,
                closure_boleta_id INTEGER,
                physical_count_ref TEXT,
                previous_closure_id INTEGER,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL,
                approved_at TEXT,
                approved_by TEXT,
                notes TEXT,
                erp_invoice_number TEXT,
                invoiced_at TEXT,
                FOREIGN KEY (agreement_id) REFERENCES ${CONSIGNMENTS_TABLES.agreements}(id),
                FOREIGN KEY (closure_boleta_id) REFERENCES ${CONSIGNMENTS_TABLES.boletas}(id),
                FOREIGN KEY (previous_closure_id) REFERENCES ${CONSIGNMENTS_TABLES.closures}(id)
            );

            CREATE TABLE IF NOT EXISTS ${CONSIGNMENTS_TABLES.adjustments} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agreement_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                reason TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL,
                FOREIGN KEY (agreement_id) REFERENCES ${CONSIGNMENTS_TABLES.agreements}(id)
            );

            -- Production Indexes
            CREATE INDEX IF NOT EXISTS idx_cs_agreements_client_id ON ${CONSIGNMENTS_TABLES.agreements}(client_id);
            CREATE INDEX IF NOT EXISTS idx_cs_products_agreement_id ON ${CONSIGNMENTS_TABLES.products}(agreement_id);
            CREATE INDEX IF NOT EXISTS idx_cs_products_product_id ON ${CONSIGNMENTS_TABLES.products}(product_id);
            CREATE INDEX IF NOT EXISTS idx_cs_boletas_agreement_id ON ${CONSIGNMENTS_TABLES.boletas}(agreement_id);
            CREATE INDEX IF NOT EXISTS idx_cs_boletas_status ON ${CONSIGNMENTS_TABLES.boletas}(status);
            CREATE INDEX IF NOT EXISTS idx_cs_boleta_lines_boleta_id ON ${CONSIGNMENTS_TABLES.boletaLines}(boleta_id);
            CREATE INDEX IF NOT EXISTS idx_cs_closures_agreement_id ON ${CONSIGNMENTS_TABLES.closures}(agreement_id);
            CREATE INDEX IF NOT EXISTS idx_cs_counts_agreement_id ON ${CONSIGNMENTS_TABLES.counts}(agreement_id);
        `);

        // Seed initial settings
        const defaultPdfColumns = ['product_id', 'product_description', 'counted_quantity', 'max_stock', 'replenish_quantity'];
        const seedSettings = [
            ['pdfTopLegend', 'Documento de Reposición'],
            ['pdfExportColumns', JSON.stringify(defaultPdfColumns)],
            ['next_closure_number', '1'],
            ['next_adjustment_number', '1']
        ];

        const insertSetting = db.prepare(`INSERT OR IGNORE INTO ${CONSIGNMENTS_TABLES.settings} (key, value) VALUES (?, ?)`);
        for (const [key, value] of seedSettings) {
            insertSetting.run(key, value);
        }

        db.prepare('INSERT INTO _cs_migrations (version, installed_at) VALUES (?, ?)').run(1, new Date().toISOString());
    }

    console.log('Consignments schema initialized at version', currentVersion < 1 ? 1 : currentVersion);
}
