/**
 * @fileoverview Pure schema definition for the Core module.
 * This file contains ONLY SQL strings and migration logic.
 * It does NOT import the database connection to avoid circular dependencies.
 */

import type { Role, Company, TransitStatusAlias } from '@/modules/core/types';
import { initialRoles, initialCompany } from './data';

export const CORE_SCHEMA_VERSION = 9;

export const CORE_TABLE_NAMES = {
    users: 'core_users',
    roles: 'core_roles',
    companySettings: 'core_company_settings',
    logs: 'core_logs',
    apiSettings: 'core_api_settings',
    aiSettings: 'core_ai_settings',
    analyticsSettings: 'core_analytics_settings',
    customers: 'core_customers',
    products: 'core_products',
    exemptions: 'core_exemptions',
    exemptionLaws: 'core_exemption_laws',
    quoteDrafts: 'core_quote_drafts',
    cabysCatalog: 'core_cabys_catalog',
    stock: 'core_stock',
    sqlConfig: 'core_sql_config',
    importQueries: 'core_import_queries',
    suggestions: 'core_suggestions',
    notifications: 'core_notifications',
    userPreferences: 'core_user_preferences',
    emailSettings: 'core_email_settings',
    suppliers: 'core_suppliers',
    erpOrderHeaders: 'core_erp_order_headers',
    erpOrderLines: 'core_erp_order_lines',
    erpPurchaseOrderHeaders: 'core_erp_purchase_order_headers',
    erpPurchaseOrderLines: 'core_erp_purchase_order_lines',
    erpInvoiceHeaders: 'core_erp_invoice_headers',
    erpInvoiceLines: 'core_erp_invoice_lines',
    stockSettings: 'core_stock_settings',
    notificationRules: 'notification_rules',
    notificationTemplates: 'notification_templates',
    notificationScheduledTasks: 'notification_scheduled_tasks',
    notificationConfigs: 'notification_configs',
    geographyData: 'core_geography_data',
    customerShipmentAddresses: 'core_customer_shipment_addresses',
    migrations: '_core_migrations'
};

/**
 * All tables for the Core module with the 'core_' prefix.
 */
export const CORE_TABLES = `
    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.users} (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        whatsapp TEXT,
        erpAlias TEXT,
        avatar TEXT,
        role TEXT,
        recentActivity TEXT,
        securityQuestion TEXT,
        securityAnswer TEXT,
        forcePasswordChange BOOLEAN DEFAULT FALSE,
        activeWizardSession TEXT,
        employeeId TEXT,
        is_active INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_core_users_email ON ${CORE_TABLE_NAMES.users}(email);

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.roles} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        permissions TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.companySettings} (
        id INTEGER PRIMARY KEY,
        name TEXT, taxId TEXT, address TEXT, phone TEXT, email TEXT, logoUrl TEXT,
        systemName TEXT, publicUrl TEXT, systemVersion TEXT, quotePrefix TEXT, nextQuoteNumber INTEGER, decimalPlaces INTEGER, quoterShowTaxId BOOLEAN,
        searchDebounceTime INTEGER, syncWarningHours REAL, lastSyncTimestamp TEXT,
        importMode TEXT, customerFilePath TEXT, productFilePath TEXT, exemptionFilePath TEXT, stockFilePath TEXT, locationFilePath TEXT, cabysFilePath TEXT, supplierFilePath TEXT,
        erpPurchaseOrderHeaderFilePath TEXT, erpPurchaseOrderLineFilePath TEXT,
        erpInvoiceHeaderFilePath TEXT, erpInvoiceLineFilePath TEXT,
        timeZone TEXT DEFAULT 'America/Costa_Rica'
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.logs} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.apiSettings} (
        id INTEGER PRIMARY KEY,
        exchangeRateApi TEXT,
        haciendaExemptionApi TEXT,
        haciendaTributariaApi TEXT,
        recopeApi TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.aiSettings} (
        id INTEGER PRIMARY KEY,
        aiEnabled INTEGER DEFAULT 0,
        provider TEXT DEFAULT 'ollama',
        ollamaHost TEXT DEFAULT 'http://localhost:11434',
        ollamaModel TEXT DEFAULT 'llama3.2:3b',
        geminiApiKey TEXT DEFAULT '',
        geminiModel TEXT DEFAULT 'gemini-1.5-flash',
        deepseekApiKey TEXT DEFAULT '',
        deepseekModel TEXT DEFAULT 'deepseek-v4-flash',
        systemPrompt TEXT DEFAULT 'Eres un asistente experto en usabilidad. Tu objetivo es guiar al usuario a completar el flujo del bot.'
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.analyticsSettings} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.customers} (
        id TEXT PRIMARY KEY,
        name TEXT,
        address TEXT,
        phone TEXT,
        taxId TEXT,
        currency TEXT,
        creditLimit REAL,
        paymentCondition TEXT,
        salesperson TEXT,
        active TEXT,
        email TEXT,
        electronicDocEmail TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.products} (
        id TEXT PRIMARY KEY,
        description TEXT,
        classification TEXT,
        lastEntry TEXT,
        active TEXT,
        notes TEXT,
        unit TEXT,
        isBasicGood TEXT,
        cabys TEXT,
        barcode TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.exemptions} (
        code TEXT PRIMARY KEY,
        description TEXT,
        customer TEXT,
        authNumber TEXT,
        startDate TEXT,
        endDate TEXT,
        percentage REAL,
        docType TEXT,
        institutionName TEXT,
        institutionCode TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.quoteDrafts} (
        id TEXT PRIMARY KEY,
        createdAt TEXT NOT NULL,
        userId INTEGER,
        customerId TEXT,
        customerDetails TEXT,
        lines TEXT,
        totals TEXT,
        notes TEXT,
        currency TEXT,
        exchangeRate REAL,
        purchaseOrderNumber TEXT,
        deliveryAddress TEXT,
        deliveryDate TEXT,
        sellerName TEXT,
        sellerType TEXT,
        quoteDate TEXT,
        validUntilDate TEXT,
        paymentTerms TEXT,
        creditDays INTEGER,
        FOREIGN KEY (userId) REFERENCES ${CORE_TABLE_NAMES.users}(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.exemptionLaws} (
        docType TEXT PRIMARY KEY,
        institutionName TEXT,
        authNumber TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.cabysCatalog} (
        code TEXT PRIMARY KEY,
        description TEXT,
        taxRate REAL
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.stock} (
        itemId TEXT PRIMARY KEY,
        stockByWarehouse TEXT,
        totalStock REAL,
        FOREIGN KEY (itemId) REFERENCES ${CORE_TABLE_NAMES.products}(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.sqlConfig} (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.importQueries} (
        type TEXT PRIMARY KEY,
        query TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.suggestions} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        userId INTEGER,
        userName TEXT,
        isRead INTEGER DEFAULT 0,
        timestamp TEXT,
        FOREIGN KEY (userId) REFERENCES ${CORE_TABLE_NAMES.users}(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.userPreferences} (
        userId INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (userId, key),
        FOREIGN KEY (userId) REFERENCES ${CORE_TABLE_NAMES.users}(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.notifications} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        message TEXT NOT NULL,
        href TEXT,
        isRead INTEGER DEFAULT 0,
        timestamp TEXT NOT NULL,
        entityId INTEGER,
        entityType TEXT,
        taskType TEXT,
        FOREIGN KEY (userId) REFERENCES ${CORE_TABLE_NAMES.users}(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.emailSettings} (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.suppliers} (
        id TEXT PRIMARY KEY,
        name TEXT,
        alias TEXT,
        email TEXT,
        phone TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.erpOrderHeaders} (
        PEDIDO TEXT PRIMARY KEY,
        ESTADO TEXT,
        CLIENTE TEXT,
        FECHA_PEDIDO TEXT,
        FECHA_PROMETIDA TEXT,
        ORDEN_COMPRA TEXT,
        TOTAL_UNIDADES REAL,
        MONEDA_PEDIDO TEXT,
        USUARIO TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.erpOrderLines} (
        PEDIDO TEXT,
        PEDIDO_LINEA INTEGER,
        ARTICULO TEXT,
        CANTIDAD_PEDIDA REAL,
        PRECIO_UNITARIO REAL,
        PRIMARY KEY (PEDIDO, PEDIDO_LINEA),
        FOREIGN KEY (PEDIDO) REFERENCES ${CORE_TABLE_NAMES.erpOrderHeaders}(PEDIDO) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.erpPurchaseOrderHeaders} (
        ORDEN_COMPRA TEXT PRIMARY KEY,
        PROVEEDOR TEXT,
        FECHA_HORA TEXT,
        ESTADO TEXT,
        CreatedBy TEXT
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.erpPurchaseOrderLines} (
        ORDEN_COMPRA TEXT,
        ARTICULO TEXT,
        CANTIDAD_ORDENADA REAL,
        PRIMARY KEY(ORDEN_COMPRA, ARTICULO),
        FOREIGN KEY (ORDEN_COMPRA) REFERENCES ${CORE_TABLE_NAMES.erpPurchaseOrderHeaders}(ORDEN_COMPRA) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.erpInvoiceHeaders} (
        FACTURA TEXT PRIMARY KEY,
        CLIENTE TEXT,
        NOMBRE_CLIENTE TEXT,
        TIPO_DOCUMENTO TEXT,
        PEDIDO TEXT,
        FACTURA_ORIGINAL TEXT,
        FECHA TEXT,
        FECHA_ENTREGA TEXT,
        ANULADA TEXT,
        DIREC_EMBARQUE TEXT,
        EMBARCAR_A TEXT,
        DIRECCION_FACTURA TEXT,
        OBSERVACIONES TEXT,
        RUTA TEXT,
        USUARIO TEXT,
        USUARIO_ANULA TEXT,
        ZONA TEXT,
        VENDEDOR TEXT,
        REIMPRESO INTEGER
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.erpInvoiceLines} (
        FACTURA TEXT,
        TIPO_DOCUMENTO TEXT,
        LINEA INTEGER,
        BODEGA TEXT,
        PEDIDO TEXT,
        ARTICULO TEXT,
        ANULADA TEXT,
        FECHA_FACTURA TEXT,
        CANTIDAD REAL,
        PRECIO_UNITARIO REAL,
        TOTAL_IMPUESTO1 REAL,
        PRECIO_TOTAL REAL,
        DESCRIPCION TEXT,
        DOCUMENTO_ORIGEN TEXT,
        CANT_DESPACHADA REAL,
        ES_CANASTA_BASICA TEXT,
        PRIMARY KEY (FACTURA, TIPO_DOCUMENTO, LINEA),
        FOREIGN KEY (FACTURA) REFERENCES ${CORE_TABLE_NAMES.erpInvoiceHeaders}(FACTURA) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.stockSettings} (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    -- Notifications Engine Tables
    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.notificationRules} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        event TEXT NOT NULL,
        action TEXT NOT NULL, -- 'sendEmail', 'sendTelegram'
        recipients TEXT NOT NULL, -- JSON array
        subject TEXT, -- Optional override
        enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.notificationTemplates} (
        eventId TEXT PRIMARY KEY,
        subject TEXT,
        body TEXT, -- HTML
        telegram TEXT, -- Markdown/HTML for Telegram
        internal TEXT -- Text for internal bell icon
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.notificationScheduledTasks} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL, -- Cron expression
        taskId TEXT NOT NULL, -- Function identifier
        lastRun TEXT,
        enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.notificationConfigs} (
        service TEXT PRIMARY KEY, -- 'telegram', 'smtp', etc.
        config TEXT NOT NULL -- JSON blob
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.geographyData} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${CORE_TABLE_NAMES.customerShipmentAddresses} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id TEXT NOT NULL,
        direccion_id TEXT NOT NULL,
        detalle_direccion TEXT,
        descripcion TEXT,
        contacto TEXT,
        cargo TEXT,
        telefono1 TEXT,
        telefono2 TEXT,
        latitude REAL,
        longitude REAL,
        UNIQUE(cliente_id, direccion_id)
    );

    -- Production Indexes for Core
    CREATE INDEX IF NOT EXISTS idx_core_logs_timestamp ON ${CORE_TABLE_NAMES.logs}(timestamp);
    CREATE INDEX IF NOT EXISTS idx_core_notifications_user_unread ON ${CORE_TABLE_NAMES.notifications}(userId, isRead);
    CREATE INDEX IF NOT EXISTS idx_erp_invoice_headers_cliente ON ${CORE_TABLE_NAMES.erpInvoiceHeaders}(CLIENTE);
    CREATE INDEX IF NOT EXISTS idx_erp_invoice_headers_fecha ON ${CORE_TABLE_NAMES.erpInvoiceHeaders}(FECHA);
    CREATE INDEX IF NOT EXISTS idx_erp_order_headers_cliente ON ${CORE_TABLE_NAMES.erpOrderHeaders}(CLIENTE);
    CREATE INDEX IF NOT EXISTS idx_erp_purchase_order_headers_proveedor ON ${CORE_TABLE_NAMES.erpPurchaseOrderHeaders}(PROVEEDOR);
    CREATE INDEX IF NOT EXISTS idx_erp_invoice_lines_articulo ON ${CORE_TABLE_NAMES.erpInvoiceLines}(ARTICULO);
    CREATE INDEX IF NOT EXISTS idx_cust_ship_addr_client_dir ON ${CORE_TABLE_NAMES.customerShipmentAddresses}(cliente_id, direccion_id);
`;

/**
 * Initial data for the Core module.
 */
export function initializeCoreData(db: any) {
    // Roles - Ensure admin role is always overwritten to get the latest allAdminPermissions
    const insertRole = db.prepare(`INSERT OR IGNORE INTO ${CORE_TABLE_NAMES.roles} (id, name, permissions) VALUES (@id, @name, @permissions)`);
    for (const role of initialRoles) {
        if (role.id === 'admin') {
            db.prepare(`INSERT OR REPLACE INTO ${CORE_TABLE_NAMES.roles} (id, name, permissions) VALUES ('admin', 'Admin', ?)`).run(JSON.stringify(role.permissions));
        } else {
            insertRole.run({ ...role, permissions: JSON.stringify(role.permissions) });
        }
    }

    // Company Settings
    const insertCompany = db.prepare(`
        INSERT OR IGNORE INTO ${CORE_TABLE_NAMES.companySettings} (
            id, name, taxId, address, phone, email, systemName, publicUrl, systemVersion, 
            quotePrefix, nextQuoteNumber, decimalPlaces, quoterShowTaxId, searchDebounceTime, 
            syncWarningHours, importMode
        ) VALUES (
            1, @name, @taxId, @address, @phone, @email, @systemName, @publicUrl, @systemVersion, 
            @quotePrefix, @nextQuoteNumber, @decimalPlaces, @quoterShowTaxId, @searchDebounceTime, 
            @syncWarningHours, @importMode
        )
    `);
    insertCompany.run({ 
        ...initialCompany, 
        publicUrl: null, 
        quoterShowTaxId: initialCompany.quoterShowTaxId ? 1 : 0 
    });

    db.prepare(`
        INSERT OR IGNORE INTO ${CORE_TABLE_NAMES.apiSettings} (
            id, exchangeRateApi, haciendaExemptionApi, haciendaTributariaApi, recopeApi
        ) VALUES (
            1, 'https://api.hacienda.go.cr/indicadores/tc/dolar', 
            'https://api.hacienda.go.cr/fe/ex?autorizacion=', 
            'https://api.hacienda.go.cr/fe/ae?identificacion=',
            ''
        )
    `).run();

    // AI Settings
    db.prepare(`
        INSERT OR IGNORE INTO ${CORE_TABLE_NAMES.aiSettings} (
            id, aiEnabled, provider, ollamaHost, ollamaModel, geminiApiKey, geminiModel, deepseekApiKey, deepseekModel, systemPrompt
        ) VALUES (
            1, 0, 'ollama', 'http://localhost:11434', 'llama3.2:3b', '', 'gemini-1.5-flash', '', 'deepseek-v4-flash', 'Eres un asistente experto en usabilidad. Tu objetivo es guiar al usuario a completar el flujo del bot.'
        )
    `).run();

    // Analytics Settings
    const defaultTransitAliases: TransitStatusAlias[] = [
        { id: 'A', name: 'Activa', color: '#22c55e' },
        { id: 'E', name: 'Enviada', color: '#3b82f6' },
        { id: 'O', name: 'Ordenada', color: '#f97316' },
        { id: 'R', name: 'Recibida', color: '#14b8a6' },
        { id: 'U', name: 'Urgente', color: '#ef4444' },
        { id: 'N', name: 'Anulada', color: '#64748b' },
    ];
    db.prepare(`INSERT OR IGNORE INTO ${CORE_TABLE_NAMES.analyticsSettings} (key, value) VALUES ('transitStatusAliases', ?)`).run(JSON.stringify(defaultTransitAliases));
}

/**
 * Migrations for the Core module.
 */
export const CORE_MIGRATIONS: ((db: any) => void)[] = [
    // Version 1 is the initial state (already handled by CORE_TABLES)
    (db: any) => {
        // Any migration logic for version 1 if needed
    },
    // Version 2 (previous migration if any, keeping schema version matched)
    (db: any) => {
        // Migration logic for version 2 if needed
    },
    // Version 3: Add employeeId to core_users
    (db: any) => {
        try {
            db.exec(`ALTER TABLE core_users ADD COLUMN employeeId TEXT;`);
            console.log("[Migration] Columna 'employeeId' agregada exitosamente a 'core_users'.");
        } catch (e: any) {
            console.warn("[Migration] Columna 'employeeId' ya existe o hubo un error menor:", e.message);
        }
    },
    // Version 4: Add core_geography_data table
    (db: any) => {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS core_geography_data (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log("[Migration] Tabla 'core_geography_data' creada exitosamente.");
        } catch (e: any) {
            console.warn("[Migration] Error creando la tabla 'core_geography_data':", e.message);
        }
    },
    // Version 5: Add timeZone to core_company_settings (Safe migration)
    (db: any) => {
        try {
            const tableInfo = db.prepare("PRAGMA table_info('core_company_settings')").all();
            const columnExists = tableInfo.some((col: any) => col.name === 'timeZone');
            
            if (!columnExists) {
                db.exec(`ALTER TABLE core_company_settings ADD COLUMN timeZone TEXT DEFAULT 'America/Costa_Rica';`);
                console.log("[Migration v5] ✅ Columna 'timeZone' agregada exitosamente a 'core_company_settings'.");
            } else {
                console.log("[Migration v5] ℹ️ Columna 'timeZone' ya existe, omitiendo.");
            }
        } catch (e: any) {
            console.error("[Migration v5] ❌ Error inesperado en migración v5:", e);
            throw e;
        }
    },
    // Version 6: Add is_active to core_users and additional payroll fields to core_employees
    (db: any) => {
        try {
            // 1. core_users.is_active
            const userTableInfo = db.prepare("PRAGMA table_info('core_users')").all();
            const userIsActiveExists = userTableInfo.some((col: any) => col.name === 'is_active');
            if (!userIsActiveExists) {
                db.exec(`ALTER TABLE core_users ADD COLUMN is_active INTEGER DEFAULT 1;`);
                console.log("[Migration v6] ✅ Columna 'is_active' agregada a 'core_users'.");
            }

            // 2. core_employees fields
            const empTableInfo = db.prepare("PRAGMA table_info('core_employees')").all();
            const columnsToAdd = [
                'IDENTIFICACION',
                'DIRECCION_HAB',
                'PASAPORTE',
                'PAIS',
                'PERMISO_CONDUCIR',
                'FECHA_INGRESO',
                'FECHA_SALIDA'
            ];

            for (const col of columnsToAdd) {
                const exists = empTableInfo.some((c: any) => c.name === col);
                if (!exists) {
                    db.exec(`ALTER TABLE core_employees ADD COLUMN ${col} TEXT;`);
                    console.log(`[Migration v6] ✅ Columna '${col}' agregada a 'core_employees'.`);
                }
            }
        } catch (e: any) {
            console.error("[Migration v6] ❌ Error inesperado en migración v6:", e);
            throw e;
        }
    },
    // Version 7: Add core_customer_shipment_addresses table
    (db: any) => {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS core_customer_shipment_addresses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cliente_id TEXT NOT NULL,
                    direccion_id TEXT NOT NULL,
                    detalle_direccion TEXT,
                    descripcion TEXT,
                    contacto TEXT,
                    cargo TEXT,
                    telefono1 TEXT,
                    telefono2 TEXT,
                    latitude REAL,
                    longitude REAL,
                    UNIQUE(cliente_id, direccion_id)
                );
                CREATE INDEX IF NOT EXISTS idx_cust_ship_addr_client_dir ON core_customer_shipment_addresses(cliente_id, direccion_id);
            `);
            console.log("[Migration v7] ✅ Tabla 'core_customer_shipment_addresses' e índices creados exitosamente.");
        } catch (e: any) {
            console.error("[Migration v7] ❌ Error inesperado en migración v7:", e);
            throw e;
        }
    },
    // Version 8: Add DIREC_EMBARQUE to core_erp_invoice_headers
    (db: any) => {
        try {
            const tableInfo = db.prepare("PRAGMA table_info('core_erp_invoice_headers')").all();
            const exists = tableInfo.some((col: any) => col.name === 'DIREC_EMBARQUE');
            if (!exists) {
                db.exec(`ALTER TABLE core_erp_invoice_headers ADD COLUMN DIREC_EMBARQUE TEXT;`);
                console.log("[Migration v8] ✅ Columna 'DIREC_EMBARQUE' agregada a 'core_erp_invoice_headers'.");
            }
        } catch (e: any) {
            console.error("[Migration v8] ❌ Error en migración v8:", e);
            throw e;
        }
    },
    // Version 9: Add core_ai_settings table
    (db: any) => {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS core_ai_settings (
                    id INTEGER PRIMARY KEY,
                    aiEnabled INTEGER DEFAULT 0,
                    provider TEXT DEFAULT 'ollama',
                    ollamaHost TEXT DEFAULT 'http://localhost:11434',
                    ollamaModel TEXT DEFAULT 'llama3.2:3b',
                    geminiApiKey TEXT DEFAULT '',
                    geminiModel TEXT DEFAULT 'gemini-1.5-flash',
                    deepseekApiKey TEXT DEFAULT '',
                    deepseekModel TEXT DEFAULT 'deepseek-v4-flash',
                    systemPrompt TEXT DEFAULT 'Eres un asistente experto en usabilidad. Tu objetivo es guiar al usuario a completar el flujo del bot.'
                );
            `);
            db.prepare(`
                INSERT OR IGNORE INTO core_ai_settings (
                    id, aiEnabled, provider, ollamaHost, ollamaModel, geminiApiKey, geminiModel, deepseekApiKey, deepseekModel, systemPrompt
                ) VALUES (
                    1, 0, 'ollama', 'http://localhost:11434', 'llama3.2:3b', '', 'gemini-1.5-flash', '', 'deepseek-v4-flash', 'Eres un asistente experto en usabilidad. Tu objetivo es guiar al usuario a completar el flujo del bot.'
                )
            `).run();
            console.log("[Migration v9] ✅ Tabla 'core_ai_settings' creada y sembrada.");
        } catch (e: any) {
            console.error("[Migration v9] ❌ Error en migración v9:", e);
            throw e;
        }
    }
];

export function initializeCoreSchema(db: any) {
    db.exec(CORE_TABLES);
    initializeCoreData(db);
}

export async function runCoreMigrations(db: any) {
    const currentVersion = getVersion(db);
    
    if (currentVersion < CORE_SCHEMA_VERSION) {
        for (let v = currentVersion + 1; v <= CORE_SCHEMA_VERSION; v++) {
            const migrationIndex = v - 1;
            if (CORE_MIGRATIONS[migrationIndex]) {
                CORE_MIGRATIONS[migrationIndex](db);
                setVersion(db, v);
            }
        }
    }
}

function getVersion(db: any): number {
    try {
        const row = db.prepare(`SELECT version FROM ${CORE_TABLE_NAMES.migrations} WHERE module = 'core'`).get() as { version: number };
        return row ? row.version : 0;
    } catch {
        return 0;
    }
}

function setVersion(db: any, version: number) {
    db.prepare(`INSERT OR REPLACE INTO ${CORE_TABLE_NAMES.migrations} (module, version) VALUES ('core', ?)`).run(version);
}
