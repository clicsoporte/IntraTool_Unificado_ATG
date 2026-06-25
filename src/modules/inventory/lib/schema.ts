import { Database } from 'better-sqlite3';
export const INVENTORY_SCHEMA_VERSION = 1;

export const INVENTORY_TABLES = {
    departments: 'inv_departments',
    items: 'inv_items',
    transactions: 'inv_transactions',
    tickets: 'repair_tickets',
    ticketParts: 'ticket_parts',
    settings: 'ticket_settings',
    maintenanceTypes: 'inv_maintenance_types',
    ticketConsumables: 'inv_ticket_consumables'
} as const;

export async function initializeInventorySchema(db: Database) {
    // 1. Departments (Isolated instances from 1 to 10)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${INVENTORY_TABLES.departments} (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
    `);

    // Seed the 10 static department instances if they don't exist
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM ${INVENTORY_TABLES.departments}`).get() as { count: number } | undefined;
    if (!countRow || countRow.count === 0) {
        console.log('[Inventory Schema Seeder] Seeding 10 isolated department instances...');
        const now = new Date().toISOString();
        const insertDept = db.prepare(`INSERT INTO ${INVENTORY_TABLES.departments} (id, name, description, is_active, created_at) VALUES (?, ?, ?, 1, ?)`);
        
        db.transaction(() => {
            insertDept.run(1, 'Taller de Flota (Repuestos)', 'Control de repuestos para el taller de vehículos y flotilla.', now);
            insertDept.run(2, 'Tecnología (TI)', 'Control de equipo informático, laptops, servidores, redes y hardware de oficina.', now);
            insertDept.run(3, 'Mantenimiento Industrial', 'Repuestos para maquinaria industrial, motores, sensores y bandas.', now);
            insertDept.run(4, 'Departamento de Operaciones', 'Herramientas y consumibles generales de operaciones.', now);
            insertDept.run(5, 'Departamento 5 (Libre)', 'Instancia de inventario libre preconfigurada para su asignación.', now);
            insertDept.run(6, 'Departamento 6 (Libre)', 'Instancia de inventario libre preconfigurada para su asignación.', now);
            insertDept.run(7, 'Departamento 7 (Libre)', 'Instancia de inventario libre preconfigurada para su asignación.', now);
            insertDept.run(8, 'Departamento 8 (Libre)', 'Instancia de inventario libre preconfigurada para su asignación.', now);
            insertDept.run(9, 'Departamento 9 (Libre)', 'Instancia de inventario libre preconfigurada para su asignación.', now);
            insertDept.run(10, 'Departamento 10 (Libre)', 'Instancia de inventario libre preconfigurada para su asignación.', now);
        })();
    }

    // 2. Items Catalog
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${INVENTORY_TABLES.items} (
            id TEXT PRIMARY KEY,
            department_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            serial_number TEXT,
            part_number TEXT,
            batch_number TEXT,
            category TEXT,
            quantity REAL NOT NULL DEFAULT 0,
            unit TEXT NOT NULL DEFAULT 'unidades',
            location TEXT,
            min_stock REAL NOT NULL DEFAULT 0,
            price REAL NOT NULL DEFAULT 0,
            datasheet_url TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            is_consumable INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (department_id) REFERENCES ${INVENTORY_TABLES.departments}(id) ON DELETE CASCADE
        )
    `);

    // 3. Transactions History
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${INVENTORY_TABLES.transactions} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT NOT NULL,
            quantity REAL NOT NULL,
            type TEXT NOT NULL, -- 'ENTRY', 'EXIT', 'REPAIR_CONSUMPTION'
            reason TEXT NOT NULL,
            reference_id TEXT,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            FOREIGN KEY (item_id) REFERENCES ${INVENTORY_TABLES.items}(id) ON DELETE CASCADE
        )
    `);

    // 4. Support and Repair Tickets
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${INVENTORY_TABLES.tickets} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            consecutive TEXT UNIQUE NOT NULL,
            department_id INTEGER NOT NULL,
            subject TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'on_hold', 'completed', 'canceled'
            priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
            equipment_name TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            serial_number TEXT,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            assignee_id INTEGER, -- user id assigned
            closed_at TEXT,
            closed_by TEXT,
            linked_asset_id INTEGER,
            requester_name TEXT,
            FOREIGN KEY (department_id) REFERENCES ${INVENTORY_TABLES.departments}(id) ON DELETE CASCADE
        )
    `);

    // 5. Ticket Parts Consumption
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${INVENTORY_TABLES.ticketParts} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            item_id TEXT NOT NULL,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            FOREIGN KEY (ticket_id) REFERENCES ${INVENTORY_TABLES.tickets}(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES ${INVENTORY_TABLES.items}(id) ON DELETE CASCADE
        )
    `);

    // 6. Ticket Instance Settings
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${INVENTORY_TABLES.settings} (
            department_id INTEGER PRIMARY KEY,
            ticket_prefix TEXT NOT NULL DEFAULT 'TKT-',
            next_ticket_number INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (department_id) REFERENCES ${INVENTORY_TABLES.departments}(id) ON DELETE CASCADE
        )
    `);

    // 7. Department Technicians Mapping (Isolated assignees)
    db.exec(`
        CREATE TABLE IF NOT EXISTS inv_department_technicians (
            department_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            PRIMARY KEY (department_id, user_id),
            FOREIGN KEY (department_id) REFERENCES ${INVENTORY_TABLES.departments}(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES core_users(id) ON DELETE CASCADE
        )
    `);

    // Seed Ticket Settings for the 10 departments if they don't exist
    const settingsCountRow = db.prepare(`SELECT COUNT(*) as count FROM ${INVENTORY_TABLES.settings}`).get() as { count: number } | undefined;
    if (!settingsCountRow || settingsCountRow.count === 0) {
        console.log('[Inventory Schema Seeder] Seeding 10 isolated ticket settings...');
        const insertSettings = db.prepare(`INSERT INTO ${INVENTORY_TABLES.settings} (department_id, ticket_prefix, next_ticket_number) VALUES (?, ?, 1)`);
        
        db.transaction(() => {
            insertSettings.run(1, 'TKT_FLOT_');
            insertSettings.run(2, 'TKT_TI_');
            insertSettings.run(3, 'TKT_IND_');
            insertSettings.run(4, 'TKT_OPER_');
            insertSettings.run(5, 'TKT_D5_');
            insertSettings.run(6, 'TKT_D6_');
            insertSettings.run(7, 'TKT_D7_');
            insertSettings.run(8, 'TKT_D8_');
            insertSettings.run(9, 'TKT_D9_');
            insertSettings.run(10, 'TKT_D10_');
        })();
    }

    // Add maintenance_type column to repair_tickets if it doesn't exist
    try {
        const columns = db.prepare("PRAGMA table_info(repair_tickets)").all() as { name: string }[];
        const hasMaintenanceType = columns.some(col => col.name === 'maintenance_type');
        if (!hasMaintenanceType) {
            console.log('[Inventory Schema Seeder] Adding maintenance_type column to repair_tickets...');
            db.exec('ALTER TABLE repair_tickets ADD COLUMN maintenance_type TEXT DEFAULT "corrective"');
        }
        const hasLinkedAssetId = columns.some(col => col.name === 'linked_asset_id');
        if (!hasLinkedAssetId) {
            console.log('[Inventory Schema Seeder] Adding linked_asset_id column to repair_tickets...');
            db.exec('ALTER TABLE repair_tickets ADD COLUMN linked_asset_id INTEGER');
        }
        const hasRequesterName = columns.some(col => col.name === 'requester_name');
        if (!hasRequesterName) {
            console.log('[Inventory Schema Seeder] Adding requester_name column to repair_tickets...');
            db.exec('ALTER TABLE repair_tickets ADD COLUMN requester_name TEXT');
        }
    } catch (e: any) {
        console.error("Error adding columns to repair_tickets", e);
    }

    // Add is_consumable column to inv_items if it doesn't exist
    try {
        const columns = db.prepare("PRAGMA table_info(inv_items)").all() as { name: string }[];
        const hasIsConsumable = columns.some(col => col.name === 'is_consumable');
        if (!hasIsConsumable) {
            console.log('[Inventory Schema Seeder] Adding is_consumable column to inv_items...');
            db.exec('ALTER TABLE inv_items ADD COLUMN is_consumable INTEGER DEFAULT 0');
        }
    } catch (e: any) {
        console.error("Error adding is_consumable to inv_items", e);
    }

    // Create inv_ticket_consumables table
    db.exec(`
        CREATE TABLE IF NOT EXISTS inv_ticket_consumables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            inventory_item_id TEXT NOT NULL,
            quantity REAL NOT NULL,
            registered_at TEXT NOT NULL,
            FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (inventory_item_id) REFERENCES inv_items(id) ON DELETE CASCADE
        )
    `);

    // 8. Custom Maintenance Types Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS inv_maintenance_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            department_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (department_id) REFERENCES ${INVENTORY_TABLES.departments}(id) ON DELETE CASCADE
        )
    `);

    // Seed default maintenance types for departments if empty
    const mTypesCountRow = db.prepare(`SELECT COUNT(*) as count FROM inv_maintenance_types`).get() as { count: number } | undefined;
    if (!mTypesCountRow || mTypesCountRow.count === 0) {
        console.log('[Inventory Schema Seeder] Seeding default maintenance types per department...');
        const now = new Date().toISOString();
        const insertMType = db.prepare(`INSERT INTO inv_maintenance_types (department_id, name, created_at) VALUES (?, ?, ?)`);
        
        db.transaction(() => {
            // Department 1: Flota/Taller (standard types)
            for (const t of ['Correctivo', 'Preventivo', 'Predictivo', 'Instalación', 'Upgrade']) {
                insertMType.run(1, t, now);
            }
            // Department 2: Tecnología (TI)
            for (const t of ['Soporte Técnico', 'Mantenimiento de PC', 'Infraestructura / Redes', 'Instalación de Software', 'Configuración de Servidor', 'Backup / Respaldo']) {
                insertMType.run(2, t, now);
            }
            // Department 3: Mantenimiento Industrial
            for (const t of ['Correctivo Mecánico', 'Correctivo Eléctrico', 'Preventivo Cíclico', 'Calibración / Instrumentación', 'Mejora de Maquinaria']) {
                insertMType.run(3, t, now);
            }
            // Departments 4 to 10
            for (let dId = 4; dId <= 10; dId++) {
                for (const t of ['Correctivo (Falla)', 'Preventivo', 'Instalación / Configuración', 'Mejora / Actualización']) {
                    insertMType.run(dId, t, now);
                }
            }
        })();
    }

    // Create repair_ticket_history table
    db.exec(`
        CREATE TABLE IF NOT EXISTS repair_ticket_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            description TEXT NOT NULL,
            performed_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (ticket_id) REFERENCES repair_tickets(id) ON DELETE CASCADE
        )
    `);

    // Add default_assignee_id column to inv_maintenance_types if it doesn't exist
    try {
        const columns = db.prepare("PRAGMA table_info(inv_maintenance_types)").all() as { name: string }[];
        const hasDefaultAssignee = columns.some(col => col.name === 'default_assignee_id');
        if (!hasDefaultAssignee) {
            console.log('[Inventory Schema Seeder] Adding default_assignee_id column to inv_maintenance_types...');
            db.exec('ALTER TABLE inv_maintenance_types ADD COLUMN default_assignee_id INTEGER');
        }
    } catch (e: any) {
        console.error("Error adding default_assignee_id to inv_maintenance_types", e);
    }

    // Add default_assignee_id column to fleet_settings if it doesn't exist
    try {
        const columns = db.prepare("PRAGMA table_info(fleet_settings)").all() as { name: string }[];
        const hasDefaultAssignee = columns.some(col => col.name === 'default_assignee_id');
        if (!hasDefaultAssignee) {
            console.log('[Inventory Schema Seeder] Adding default_assignee_id column to fleet_settings...');
            db.exec('ALTER TABLE fleet_settings ADD COLUMN default_assignee_id INTEGER');
        }
    } catch (e: any) {
        console.error("Error adding default_assignee_id to fleet_settings", e);
    }
}
