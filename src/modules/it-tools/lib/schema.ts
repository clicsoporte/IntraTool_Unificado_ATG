import { Database } from 'better-sqlite3';

export const IT_TOOLS_TABLES = {
    notes: 'it_notes',
    settings: 'it_settings',
    branches: 'it_branches',
    assets: 'it_assets',
    assetAssignments: 'it_asset_assignments',
    licensesCatalog: 'it_licenses_catalog',
    assetLicenses: 'it_asset_licenses',
    assetComponents: 'it_asset_components'
} as const;

export async function initializeItToolsSchema(db: Database) {
    // Check current version
    db.exec(`
        CREATE TABLE IF NOT EXISTS _it_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            installed_at TEXT NOT NULL
        )
    `);

    const row = db.prepare('SELECT MAX(version) as version FROM _it_migrations').get() as { version: number | null };
    const currentVersion = row?.version || 0;

    if (currentVersion < 1) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.notes} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT,
                tags TEXT,
                linkedModule TEXT,
                createdBy TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.settings} (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        db.prepare('INSERT INTO _it_migrations (version, installed_at) VALUES (?, ?)').run(1, new Date().toISOString());
    }

    if (currentVersion < 2) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.branches} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                code TEXT UNIQUE NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.assets} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NULL,
                category TEXT NOT NULL,
                brand TEXT NOT NULL,
                model TEXT NOT NULL,
                serial_number TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                purchase_date TEXT,
                purchase_cost REAL,
                currency TEXT NOT NULL DEFAULT 'CRC',
                exchange_rate REAL NOT NULL DEFAULT 1.0,
                warranty_expiration TEXT,
                invoice_url TEXT,
                warranty_cert_url TEXT,
                branch_id INTEGER NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(branch_id) REFERENCES ${IT_TOOLS_TABLES.branches}(id)
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.assetAssignments} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id INTEGER NOT NULL,
                assignee_type TEXT NOT NULL,
                user_id INTEGER NULL,
                employee_code TEXT NULL,
                assigned_date TEXT NOT NULL,
                returned_date TEXT,
                assigned_by TEXT NOT NULL,
                FOREIGN KEY(asset_id) REFERENCES ${IT_TOOLS_TABLES.assets}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.licensesCatalog} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.assetLicenses} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id INTEGER NOT NULL,
                license_catalog_id INTEGER NOT NULL,
                license_key TEXT,
                expiration_date TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                FOREIGN KEY(asset_id) REFERENCES ${IT_TOOLS_TABLES.assets}(id) ON DELETE CASCADE,
                FOREIGN KEY(license_catalog_id) REFERENCES ${IT_TOOLS_TABLES.licensesCatalog}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.assetComponents} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_asset_id INTEGER NOT NULL,
                component_name TEXT NOT NULL,
                brand TEXT,
                model TEXT,
                serial_number TEXT,
                status TEXT DEFAULT 'active',
                FOREIGN KEY(parent_asset_id) REFERENCES ${IT_TOOLS_TABLES.assets}(id) ON DELETE CASCADE
            );
        `);

        // Seed a default branch if empty
        const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM ${IT_TOOLS_TABLES.branches}`).get() as { cnt: number };
        if (countRow.cnt === 0) {
            db.prepare(`INSERT INTO ${IT_TOOLS_TABLES.branches} (name, code, is_active, created_at) VALUES (?, ?, ?, ?)`).run(
                'Oficina Central', 'S-01', 1, new Date().toISOString()
            );
        }

        db.prepare('INSERT INTO _it_migrations (version, installed_at) VALUES (?, ?)').run(2, new Date().toISOString());
    }

    // Add cellular fields to it_assets if they don't exist
    try {
        const columns = db.prepare("PRAGMA table_info(it_assets)").all() as { name: string }[];
        const fieldsToAdd = [
            { name: 'imei', type: 'TEXT' },
            { name: 'phone_number', type: 'TEXT' },
            { name: 'telephony_provider', type: 'TEXT' },
            { name: 'data_plan_start', type: 'TEXT' },
            { name: 'data_plan_end', type: 'TEXT' },
            { name: 'data_plan_renewal', type: 'TEXT' }
        ];
        for (const field of fieldsToAdd) {
            if (!columns.some(col => col.name === field.name)) {
                console.log(`[ITAM Schema Seeder] Adding column ${field.name} to it_assets...`);
                db.exec(`ALTER TABLE it_assets ADD COLUMN ${field.name} ${field.type}`);
            }
        }
    } catch (e: any) {
        console.error("Error adding cellular fields to it_assets", e);
    }

    console.log('IT Tools schema initialized at version', currentVersion < 2 ? 2 : currentVersion);
}

