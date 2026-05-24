import { Database } from 'better-sqlite3';

export const FLEET_SCHEMA_VERSION = 1;

export const FLEET_TABLES = {
    vehicles: 'fleet_vehicles',
    fuelLogs: 'fleet_fuel_logs',
    maintenanceLogs: 'fleet_maintenance_logs',
    permits: 'fleet_permits',
    settings: 'fleet_settings',
    fuelPriceHistory: 'fleet_fuel_price_history',
    migrations: '_fleet_migrations',
    telegramStates: 'fleet_telegram_bot_states',
    telegramLinkages: 'fleet_telegram_linkages',
    telegramBotLogs: 'fleet_telegram_bot_logs'
} as const;

export async function initializeFleetSchema(db: Database) {
    // 1. Vehicles
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.vehicles} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plate TEXT UNIQUE NOT NULL,
            brand TEXT,
            model TEXT,
            year INTEGER,
            fuelType TEXT,
            loadCapacity TEXT,
            axes INTEGER,
            currentMileage REAL DEFAULT 0,
            lastOilChangeMileage REAL DEFAULT 0,
            oilChangeInterval REAL DEFAULT 5000,
            rtvExpiration TEXT,
            photoUrl TEXT,
            branchId TEXT,
            status TEXT DEFAULT 'active'
        )
    `);

    // Auto-migrate new columns if they are missing
    const tableInfo = db.prepare(`PRAGMA table_info(${FLEET_TABLES.vehicles})`).all() as any[];
    const existingColumns = tableInfo.map(c => c.name);
    
    const newColumns = [
        { name: 'serialNumber', type: 'TEXT' },
        { name: 'vin', type: 'TEXT' },
        { name: 'chassisNumber', type: 'TEXT' },
        { name: 'bodyType', type: 'TEXT' },
        { name: 'traction', type: 'TEXT' },
        { name: 'capacity', type: 'INTEGER' },
        { name: 'engineNumber', type: 'TEXT' },
        { name: 'engineBrand', type: 'TEXT' },
        { name: 'engineSerial', type: 'TEXT' },
        { name: 'engineModel', type: 'TEXT' },
        { name: 'engineCylinders', type: 'INTEGER' },
        { name: 'engineDisplacement', type: 'TEXT' },
        { name: 'enginePower', type: 'TEXT' },
        { name: 'engineManufacturer', type: 'TEXT' },
        { name: 'origin', type: 'TEXT' },
        { name: 'ownerName', type: 'TEXT' },
        { name: 'ownerId', type: 'TEXT' },
        { name: 'odometerUnit', type: 'TEXT DEFAULT "km"' },
        { name: 'lastOilChangeAlertThreshold', type: 'INTEGER DEFAULT 0' },
        { name: 'currentHours', type: 'REAL DEFAULT 0' },
        { name: 'color', type: 'TEXT' }
    ];

    for (const col of newColumns) {
        if (!existingColumns.includes(col.name)) {
            try {
                db.exec(`ALTER TABLE ${FLEET_TABLES.vehicles} ADD COLUMN ${col.name} ${col.type}`);
            } catch (error) {
                console.error(`[Fleet Migration] Error adding column ${col.name}:`, error);
            }
        }
    }

    // 2. Fuel Logs

    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.fuelLogs} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicleId INTEGER NOT NULL,
            date TEXT NOT NULL,
            mileageBefore REAL NOT NULL,
            liters REAL NOT NULL,
            cost REAL,
            driverId TEXT,
            fuelTypeId INTEGER,
            notes TEXT,
            createdBy TEXT,
            FOREIGN KEY (vehicleId) REFERENCES ${FLEET_TABLES.vehicles}(id) ON DELETE CASCADE,
            FOREIGN KEY (fuelTypeId) REFERENCES ${FLEET_TABLES.settings}(id)
        )
    `);

    // Auto-migrate fuel_logs columns
    const fuelLogsInfo = db.prepare(`PRAGMA table_info(${FLEET_TABLES.fuelLogs})`).all() as any[];
    const existingFuelLogsColumns = fuelLogsInfo.map(c => c.name);
    if (!existingFuelLogsColumns.includes('fuelTypeId')) {
        db.exec(`ALTER TABLE ${FLEET_TABLES.fuelLogs} ADD COLUMN fuelTypeId INTEGER`);
    }

    // 3. Maintenance Logs
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.maintenanceLogs} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicleId INTEGER NOT NULL,
            date TEXT NOT NULL,
            mileage REAL NOT NULL,
            type TEXT NOT NULL, -- 'oil_change', 'parts', 'rtv', 'general'
            description TEXT,
            cost REAL,
            performedBy TEXT,
            createdBy TEXT,
            FOREIGN KEY (vehicleId) REFERENCES ${FLEET_TABLES.vehicles}(id) ON DELETE CASCADE
        )
    `);

    // 4. Permits
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.permits} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicleId INTEGER NOT NULL,
            type TEXT NOT NULL, -- 'pesos_dimensiones', 'material_peligroso', 'seguro', etc.
            expirationDate TEXT NOT NULL,
            documentUrl TEXT,
            FOREIGN KEY (vehicleId) REFERENCES ${FLEET_TABLES.vehicles}(id) ON DELETE CASCADE
        )
    `);

    // 4b. Preventative Plans
    db.exec(`
        CREATE TABLE IF NOT EXISTS fleet_preventative_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicleId INTEGER NOT NULL,
            maintenanceType TEXT NOT NULL,
            intervalValue REAL NOT NULL,
            intervalUnit TEXT NOT NULL DEFAULT 'km',
            lastPerformedValue REAL DEFAULT 0,
            lastAlertThreshold INTEGER DEFAULT 0,
            FOREIGN KEY (vehicleId) REFERENCES ${FLEET_TABLES.vehicles}(id) ON DELETE CASCADE
        )
    `);

    // 5. Settings (Catalogs)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.settings} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL, -- 'brand', 'fuel_type', 'permit_type'
            value TEXT NOT NULL,
            price REAL DEFAULT 0,
            UNIQUE(category, value)
        )
    `);

    // Auto-migrate fleet_settings columns
    const settingsInfo = db.prepare(`PRAGMA table_info(${FLEET_TABLES.settings})`).all() as any[];
    const existingSettingsColumns = settingsInfo.map(c => c.name);
    if (!existingSettingsColumns.includes('price')) {
        db.exec(`ALTER TABLE ${FLEET_TABLES.settings} ADD COLUMN price REAL DEFAULT 0`);
    }

    // 6. Migrations table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.migrations} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            appliedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 7. Fuel Price History
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.fuelPriceHistory} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fuelTypeId INTEGER NOT NULL,
            price REAL NOT NULL,
            date TEXT NOT NULL,
            createdBy TEXT,
            FOREIGN KEY (fuelTypeId) REFERENCES ${FLEET_TABLES.settings}(id) ON DELETE CASCADE
        )
    `);

    // 8. Telegram Bot States
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.telegramStates} (
            chatId TEXT PRIMARY KEY,
            currentFlow TEXT,
            step TEXT,
            tempData TEXT,
            updatedAt TEXT
        )
    `);

    // 9. Telegram Linkages
    try {
        const tableSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${FLEET_TABLES.telegramLinkages}'`).get() as { sql: string } | undefined;
        if (tableSql && tableSql.sql && !tableSql.sql.includes('employeeId TEXT UNIQUE')) {
            console.log('[Fleet Schema] Detectada tabla fleet_telegram_linkages heredada sin restricción UNIQUE. Recreando tabla...');
            db.exec(`DROP TABLE IF EXISTS ${FLEET_TABLES.telegramLinkages}`);
        }
    } catch (e) {
        console.error('[Fleet Schema] Error al verificar consistencia en tabla fleet_telegram_linkages:', e);
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.telegramLinkages} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chatId TEXT UNIQUE,
            employeeId TEXT UNIQUE NOT NULL,
            username TEXT,
            activationCode TEXT UNIQUE,
            createdAt TEXT
        )
    `);

    // 10. Telegram Bot Logs (Dedicated Table - Immune to Admin Logs Deletion)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${FLEET_TABLES.telegramBotLogs} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicleId INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            actionType TEXT NOT NULL, -- 'fuel', 'maintenance', 'rtv'
            driverName TEXT NOT NULL,
            message TEXT NOT NULL,
            details TEXT, -- JSON blob with additional data
            FOREIGN KEY (vehicleId) REFERENCES ${FLEET_TABLES.vehicles}(id) ON DELETE CASCADE
        )
    `);

    // Initial Data for Settings (Excluding Fuel Types)
    const initialSettings = [
        { category: 'permit_type', value: 'Tarjeta Pesos y Dimensiones' },
        { category: 'permit_type', value: 'Material Peligroso' },
        { category: 'permit_type', value: 'Seguro Obligatorio' },
        { category: 'permit_type', value: 'Seguro Voluntario' },
        { category: 'maintenance_type', value: 'Cambio de Aceite' },
        { category: 'maintenance_type', value: 'Cambio de Llantas' },
        { category: 'maintenance_type', value: 'Frenos' },
        { category: 'maintenance_type', value: 'RTV' },
        { category: 'preventative_milestone', value: '90' },
        { category: 'preventative_milestone', value: '95' },
        { category: 'preventative_milestone', value: '100' },
        { category: 'preventative_milestone', value: '110' },
        { category: 'preventative_milestone', value: '120' },
        { category: 'preventative_milestone', value: '130' },
        { category: 'preventative_milestone', value: '140' },
        { category: 'preventative_milestone', value: '150' }
    ];

    const insertSetting = db.prepare(`INSERT OR IGNORE INTO ${FLEET_TABLES.settings} (category, value) VALUES (?, ?)`);
    for (const setting of initialSettings) {
        insertSetting.run(setting.category, setting.value);
    }

    // Clean up preloaded fuel types if they exist in the database (one-time removal)
    try {
        db.exec(`DELETE FROM ${FLEET_TABLES.settings} WHERE category = 'fuel_type' AND value IN ('Diesel', 'Gasolina', 'GLP', 'Eléctrico')`);
    } catch (e) {
        console.error('[Fleet Schema] Error deleting preloaded fuel types:', e);
    }
}
