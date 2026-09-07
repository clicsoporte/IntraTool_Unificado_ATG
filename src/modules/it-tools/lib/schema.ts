import { Database } from 'better-sqlite3';

export const IT_TOOLS_TABLES = {
    notes: 'it_notes',
    settings: 'it_settings',
    branches: 'it_branches',
    assets: 'it_assets',
    assetAssignments: 'it_asset_assignments',
    licensesCatalog: 'it_licenses_catalog',
    assetLicenses: 'it_asset_licenses',
    assetComponents: 'it_asset_components',
    assetDocuments: 'it_asset_documents',
    agentTelemetry: 'it_asset_telemetry',
    agentCommands: 'it_agent_commands',
    installedSoftware: 'it_asset_installed_software',
    agentOtaVersions: 'it_agent_ota_versions'
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
            { name: 'data_plan_renewal', type: 'TEXT' },
            { name: 'hardware_id', type: 'TEXT' }
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

    if (currentVersion < 3) {
        // Reparación: activos auto-registrados desde la APK quedaron con `id` NULL
        // porque la tabla `it_assets` en algunos entornos se creó con la columna `id`
        // como TEXT nullable en lugar de INTEGER PRIMARY KEY AUTOINCREMENT. Sin id,
        // la Ficha del Activo, asignaciones, componentes y licencias no funcionan.
        // Backfillear asignando el rowid de SQLite (idempotente).
        try {
            const info = db.prepare(`
                UPDATE it_assets
                SET id = CAST(rowid AS INTEGER)
                WHERE id IS NULL OR TRIM(CAST(id AS TEXT)) = ''
            `).run();
            if (info.changes > 0) {
                console.log(`[ITAM Schema Seeder] Reparados ${info.changes} activo(s) con id NULL (backfill rowid).`);
            }
        } catch (e: any) {
            console.error("[ITAM Schema Seeder] Error reparando ids NULL en it_assets", e);
        }
        db.prepare('INSERT INTO _it_migrations (version, installed_at) VALUES (?, ?)').run(3, new Date().toISOString());
    }

    // Reparación de Integridad de Clave Primaria en it_assets si no tiene id como PRIMARY KEY (pk = 1)
    try {
        const assetsCols = db.prepare("PRAGMA table_info(it_assets)").all() as { name: string; pk: number }[];
        const idCol = assetsCols.find(c => c.name === 'id');
        if (assetsCols.length > 0 && (!idCol || idCol.pk === 0)) {
            console.log('[ITAM Schema Seeder] Reconstruyendo it_assets para establecer PRIMARY KEY en id...');
            db.exec('PRAGMA foreign_keys = OFF');
            db.exec(`
                BEGIN TRANSACTION;
                CREATE TABLE it_assets_rebuilt (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id TEXT NULL,
                    category TEXT NOT NULL DEFAULT 'General',
                    brand TEXT NOT NULL DEFAULT 'N/D',
                    model TEXT NOT NULL DEFAULT 'N/D',
                    serial_number TEXT NOT NULL DEFAULT '',
                    hardware_id TEXT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    purchase_date TEXT,
                    purchase_cost REAL,
                    currency TEXT NOT NULL DEFAULT 'CRC',
                    exchange_rate REAL NOT NULL DEFAULT 1.0,
                    warranty_expiration TEXT,
                    invoice_url TEXT,
                    warranty_cert_url TEXT,
                    branch_id INTEGER NOT NULL DEFAULT 1,
                    notes TEXT,
                    imei TEXT,
                    phone_number TEXT,
                    telephony_provider TEXT,
                    data_plan_start TEXT,
                    data_plan_end TEXT,
                    data_plan_renewal TEXT,
                    processor TEXT,
                    ram_memory TEXT,
                    storage_capacity TEXT,
                    bitlocker_id TEXT,
                    bitlocker_key TEXT,
                    standard_accessories_json TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                INSERT INTO it_assets_rebuilt (
                    id, item_id, category, brand, model, serial_number, hardware_id, status,
                    purchase_date, purchase_cost, currency, exchange_rate, warranty_expiration,
                    invoice_url, warranty_cert_url, branch_id, notes, imei, phone_number,
                    telephony_provider, data_plan_start, data_plan_end, data_plan_renewal,
                    processor, ram_memory, storage_capacity, bitlocker_id, bitlocker_key,
                    standard_accessories_json, created_at
                )
                SELECT 
                    CAST(COALESCE(id, rowid) AS INTEGER),
                    item_id,
                    COALESCE(category, 'General'),
                    COALESCE(brand, 'N/D'),
                    COALESCE(model, 'N/D'),
                    COALESCE(serial_number, 'SN-' || rowid),
                    hardware_id,
                    COALESCE(status, 'active'),
                    purchase_date,
                    purchase_cost,
                    COALESCE(currency, 'CRC'),
                    COALESCE(exchange_rate, 1.0),
                    warranty_expiration,
                    invoice_url,
                    warranty_cert_url,
                    COALESCE(branch_id, 1),
                    notes,
                    imei,
                    phone_number,
                    telephony_provider,
                    data_plan_start,
                    data_plan_end,
                    data_plan_renewal,
                    processor,
                    ram_memory,
                    storage_capacity,
                    bitlocker_id,
                    bitlocker_key,
                    standard_accessories_json,
                    COALESCE(created_at, datetime('now'))
                FROM it_assets;

                DROP TABLE it_assets;
                ALTER TABLE it_assets_rebuilt RENAME TO it_assets;
                COMMIT;
            `);
            db.exec('PRAGMA foreign_keys = ON');
            console.log('[ITAM Schema Seeder] Tabla it_assets reparada con exito.');
        }
    } catch (e: any) {
        try { db.exec('ROLLBACK;'); } catch (_) {}
        try { db.exec('PRAGMA foreign_keys = ON;'); } catch (_) {}
        console.error('[ITAM Schema Seeder] Error al verificar/reparar PRIMARY KEY de it_assets:', e.message);
    }

    if (currentVersion < 4) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.agentTelemetry} (
                asset_id INTEGER PRIMARY KEY,
                hostname TEXT,
                os_version TEXT,
                os_build TEXT,
                logged_in_user TEXT,
                domain TEXT,
                cpu_name TEXT,
                cpu_usage REAL DEFAULT 0,
                ram_total_gb REAL DEFAULT 0,
                ram_used_percent REAL DEFAULT 0,
                disk_primary_free_gb REAL DEFAULT 0,
                disk_primary_total_gb REAL DEFAULT 0,
                disk_smart_status TEXT,
                battery_percent INTEGER,
                is_charging INTEGER DEFAULT 0,
                is_laptop INTEGER DEFAULT 0,
                bitlocker_status TEXT,
                antivirus_status TEXT,
                ip_address_local TEXT,
                ip_address_public TEXT,
                mac_address TEXT,
                monitors_json TEXT,
                agent_version TEXT,
                last_seen TEXT NOT NULL,
                FOREIGN KEY(asset_id) REFERENCES ${IT_TOOLS_TABLES.assets}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.agentCommands} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id INTEGER NOT NULL,
                command_type TEXT NOT NULL,
                payload_json TEXT,
                priority INTEGER DEFAULT 5,
                status TEXT NOT NULL DEFAULT 'pending',
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                executed_at TEXT,
                result_output TEXT,
                FOREIGN KEY(asset_id) REFERENCES ${IT_TOOLS_TABLES.assets}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.installedSoftware} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                version TEXT,
                publisher TEXT,
                install_date TEXT,
                last_scanned_at TEXT NOT NULL,
                FOREIGN KEY(asset_id) REFERENCES ${IT_TOOLS_TABLES.assets}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.agentOtaVersions} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_name TEXT UNIQUE NOT NULL,
                version_code INTEGER UNIQUE NOT NULL,
                file_url TEXT NOT NULL,
                file_size INTEGER DEFAULT 0,
                sha256_hash TEXT NOT NULL,
                release_notes TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            );
        `);

        db.prepare('INSERT INTO _it_migrations (version, installed_at) VALUES (?, ?)').run(4, new Date().toISOString());
        console.log('[ITAM Schema Seeder] Migración v4 (Tablas de Agente Windows, Telemetría, Comandos y OTA) ejecutada.');
    }

    console.log('IT Tools schema initialized at version', currentVersion < 4 ? 4 : currentVersion);
}

