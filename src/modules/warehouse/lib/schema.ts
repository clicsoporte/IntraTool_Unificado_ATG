import { Database } from 'better-sqlite3';

export const WAREHOUSE_SCHEMA_VERSION = 2;

export const WAREHOUSE_TABLES = {
    locations: 'wh_locations',
    inventory: 'wh_inventory',
    item_locations: 'wh_item_locations',
    inventory_units: 'wh_inventory_units',
    movements: 'wh_movements',
    config: 'wh_config'
};

export function initializeWarehouseSchema(db: Database) {
    // 1. Locations
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${WAREHOUSE_TABLES.locations} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL, -- 'building', 'zone', 'rack', 'shelf', 'bin'
            parentId INTEGER,
            isLocked INTEGER DEFAULT 0,
            lockedBy TEXT,
            lockedBySessionId TEXT,
            population_status TEXT DEFAULT 'P', -- 'P' for Pending, 'O' for Occupied, 'S' for Skipped, 'F' for Finished
            is_mixed INTEGER DEFAULT 0, -- 0 for false, 1 for true
            cached_full_path TEXT,
            FOREIGN KEY (parentId) REFERENCES ${WAREHOUSE_TABLES.locations}(id) ON DELETE CASCADE
        )
    `);

    // 2. Inventory (Current simplified inventory)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${WAREHOUSE_TABLES.inventory} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL, -- Corresponds to core_products['id']
            locationId INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 0,
            lastUpdated TEXT NOT NULL,
            updatedBy TEXT,
            FOREIGN KEY (locationId) REFERENCES ${WAREHOUSE_TABLES.locations}(id) ON DELETE CASCADE,
            UNIQUE (itemId, locationId)
        )
    `);

    // 3. Item Locations (Assignments)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${WAREHOUSE_TABLES.item_locations} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL,
            locationId INTEGER NOT NULL,
            clientId TEXT,
            isExclusive INTEGER DEFAULT 0,
            requiresCertificate INTEGER DEFAULT 0,
            updatedBy TEXT,
            updatedAt TEXT,
            FOREIGN KEY (locationId) REFERENCES ${WAREHOUSE_TABLES.locations}(id) ON DELETE CASCADE
        )
    `);

    // 4. Inventory Units (LPN / Pallet tracking)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${WAREHOUSE_TABLES.inventory_units} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unitCode TEXT UNIQUE,
            receptionConsecutive TEXT,
            correctionConsecutive TEXT,
            correctedFromUnitId INTEGER,
            productId TEXT NOT NULL,
            humanReadableId TEXT,
            documentId TEXT,
            erpDocumentId TEXT,
            locationId INTEGER,
            quantity REAL DEFAULT 1,
            notes TEXT,
            createdAt TEXT NOT NULL,
            createdBy TEXT NOT NULL,
            status TEXT,
            appliedAt TEXT,
            appliedBy TEXT,
            annulledAt TEXT,
            annulledBy TEXT,
            FOREIGN KEY (locationId) REFERENCES ${WAREHOUSE_TABLES.locations}(id) ON DELETE CASCADE,
            FOREIGN KEY (correctedFromUnitId) REFERENCES ${WAREHOUSE_TABLES.inventory_units}(id) ON DELETE SET NULL
        )
    `);

    // 5. Movements (Log)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${WAREHOUSE_TABLES.movements} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL,
            quantity REAL NOT NULL,
            fromLocationId INTEGER,
            toLocationId INTEGER,
            timestamp TEXT NOT NULL,
            userId INTEGER NOT NULL,
            notes TEXT,
            FOREIGN KEY (fromLocationId) REFERENCES ${WAREHOUSE_TABLES.locations}(id) ON DELETE CASCADE,
            FOREIGN KEY (toLocationId) REFERENCES ${WAREHOUSE_TABLES.locations}(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS ${WAREHOUSE_TABLES.config} (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

    // Production Indexes for Warehouse
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wh_inventory_itemId ON ${WAREHOUSE_TABLES.inventory}(itemId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wh_movements_itemId ON ${WAREHOUSE_TABLES.movements}(itemId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wh_movements_timestamp ON ${WAREHOUSE_TABLES.movements}(timestamp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wh_inventory_units_productId ON ${WAREHOUSE_TABLES.inventory_units}(productId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wh_inventory_units_status ON ${WAREHOUSE_TABLES.inventory_units}(status)`);

    // Initialize default config if empty
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${WAREHOUSE_TABLES.config}`).get() as { count: number };
    if (count.count === 0) {
        const defaultSettings = {
            locationLevels: [
                { type: 'building', name: 'Edificio' },
                { type: 'zone', name: 'Zona' },
                { type: 'rack', name: 'Rack' },
                { type: 'shelf', name: 'Estante' },
                { type: 'bin', name: 'Casilla' }
            ],
            unitPrefix: 'U-',
            nextUnitNumber: 1,
            receptionPrefix: 'ING-',
            nextReceptionNumber: 1,
            correctionPrefix: 'COR-',
            nextCorrectionNumber: 1,
            dispatchNotificationEmails: '',
            populationSupervisorEmails: '',
            pdfTopLegend: 'Documento de Control Interno',
            lastLegacyMigration: null,
            lastPopulationInit: null,
            lastCleanup: null,
        };
        db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.config} (key, value) VALUES ('settings', ?)`).run(JSON.stringify(defaultSettings));
    }
}

export async function runWarehouseMigrations(db: Database) {
    const currentVersion = getVersion(db);
    
    if (currentVersion < 1) {
        // Initial version already handled by initializeWarehouseSchema
        setVersion(db, 1);
    }
    
    // Future migrations go here:
    if (currentVersion < 2) {
        try {
            db.exec(`ALTER TABLE ${WAREHOUSE_TABLES.locations} ADD COLUMN cached_full_path TEXT`);
            console.log("Migration (v2): Added cached_full_path to wh_locations");
        } catch (e) {
            console.warn("Migration (v2) warning: cached_full_path might already exist.");
        }
        setVersion(db, 2);
    }
}

function getVersion(db: Database): number {
    try {
        const row = db.prepare("SELECT version FROM _core_migrations WHERE module = 'wh'").get() as { version: number };
        return row ? row.version : 0;
    } catch {
        return 0;
    }
}

function setVersion(db: Database, version: number) {
    db.prepare("INSERT OR REPLACE INTO _core_migrations (module, version) VALUES ('wh', ?)").run(version);
}