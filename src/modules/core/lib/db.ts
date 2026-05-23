/**
 * @fileoverview This file handles the SQLite database connection and provides
 * server-side functions for all database operations. It includes initialization,
 * schema creation, data access, and a centralized migration system for all application modules.
 */
"use server";

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { auditDatabaseInstance, repairDatabaseInstance } from './db-integrity';

import { initialCompany, initialRoles } from './data';
import { DB_MODULES } from './db-modules';
import type { Company, LogEntry, ApiSettings, User, Product, Customer, Role, QuoteDraft, DatabaseModule, Exemption, ExemptionLaw, StockInfo, StockSettings, ImportQuery, ItemLocation, UpdateBackupInfo, Suggestion, DateRange, Supplier, ErpOrderHeader, ErpOrderLine, Notification, UserPreferences, ErpPurchaseOrderHeader, ErpPurchaseOrderLine, SqlConfig, ProductionOrder, WizardSession, AnalyticsSettings, TransitStatusAlias, WarehouseLocation, WarehouseInventoryItem, WarehouseSettings, ErpInvoiceHeader, ErpInvoiceLine } from '@/modules/core/types';
import bcrypt from 'bcryptjs';
import Papa from 'papaparse';
import { executeQuery } from './sql-service';
import { logInfo, logWarn, logError } from './logger';
import { headers, cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getExchangeRate, getEmailSettings } from './api-actions';
import { NewUserSchema, UserSchema } from './auth-schemas';
import { authorizeAction, authorizeSession, authorizeActionAny } from './auth-guard';
import { CORE_SCHEMA_VERSION, CORE_TABLE_NAMES, CORE_TABLES, initializeCoreSchema, runCoreMigrations } from './schema';
import { initializeWarehouseSchema, runWarehouseMigrations, WAREHOUSE_TABLES } from '../../warehouse/lib/schema';
import { initializePlannerSchema, PLANNER_TABLES } from '../../planner/lib/schema';
import { initializeRequestsSchema, REQUESTS_TABLES } from '../../requests/lib/schema';
import { initializeConsignmentsSchema, CONSIGNMENTS_TABLES } from '../../consignments/lib/schema';
import { initializeItToolsSchema, IT_TOOLS_TABLES } from '../../it-tools/lib/schema';
import { initializeCostAssistantSchema, COST_ASSISTANT_TABLES } from '../../cost-assistant/lib/schema';
import { initializeOperationsSchema, OPERATIONS_TABLES } from '../../operations/lib/schema';
import { initializeFleetSchema, FLEET_TABLES } from '../../fleet/lib/schema';
import { initializeNotificationDefaults } from '../../notifications/lib/db';

const DB_FILE = 'clic_tools.db';
const SALT_ROUNDS = 10;
const UPDATE_BACKUP_DIR = 'update_backups';
const VERSION_FILE_PATH = path.join(process.cwd(), 'package.json');
const dbDirectory = path.join(process.cwd(), 'dbs');

let unifiedDbInstance: Database.Database | null = null;
let initializationPromise: Promise<Database.Database> | null = null;

/**
 * Orchestrates the initialization and migration of all module schemas into the single DB.
 */
async function initializeAllModuleSchemas(db: Database.Database) {
    try {
        // 1. Core (always first)
        initializeCoreSchema(db);
        await runCoreMigrations(db);

        // 2. Warehouse
        await initializeWarehouseSchema(db);
        await runWarehouseMigrations(db);
        await initializePlannerSchema(db);
        await initializeRequestsSchema(db);
        await initializeConsignmentsSchema(db);
        await initializeItToolsSchema(db);
        await initializeCostAssistantSchema(db);
        await initializeOperationsSchema(db);
        await initializeFleetSchema(db);
        await initializeNotificationDefaults(db);
        
        console.log('All module schemas initialized successfully.');
    } catch (error: any) {
        console.error("❌ Schema synchronization failed:", error.message);
        throw error;
    }
}

/**
 * Automatically detects schema differences and applies missing columns/tables 
 * if the software version is ahead of the database version.
 */
async function runSelfHealing(db: Database.Database) {
    try {
        const currentVersionRow = db.prepare(`SELECT version FROM _core_migrations WHERE module = 'core'`).get() as { version: number } | undefined;
        const currentVersion = currentVersionRow ? currentVersionRow.version : 0;

        if (currentVersion < CORE_SCHEMA_VERSION) {
            console.log(`[DB] Detectada nueva versión de software (${currentVersion} -> ${CORE_SCHEMA_VERSION}). Iniciando auto-reparación de esquema...`);
            
            const results = auditDatabaseInstance(db);
            const { fixed, errors } = await repairDatabaseInstance(db, results);
            
            if (fixed.length > 0) {
                console.log(`[DB] Auto-reparación completada. Se aplicaron ${fixed.length} cambios:`, fixed);
            }
            
            if (errors.length > 0) {
                console.error(`[DB] Errores durante la auto-reparación:`, errors);
            }

            // Actualizar la versión en la DB para que no vuelva a correr hasta el próximo cambio de código
            db.prepare(`INSERT OR REPLACE INTO _core_migrations (module, version) VALUES ('core', ?)`).run(CORE_SCHEMA_VERSION);
            console.log(`[DB] Versión de base de datos actualizada a ${CORE_SCHEMA_VERSION}`);
        }
    } catch (e: any) {
        console.error("[DB] No se pudo ejecutar la auto-reparación:", e.message);
        // No bloqueamos el arranque, intentamos seguir con la inicialización normal
    }
}

/**
 * Centralized function to get the unified database instance.
 * Implements a thread-safe Singleton pattern to avoid locks and multiple connections.
 * 
 * @returns {Database.Database} Active better-sqlite3 instance
 */
export async function getDb(): Promise<Database.Database> {
    if (unifiedDbInstance && unifiedDbInstance.open) {
        return unifiedDbInstance;
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {
            if (!fs.existsSync(dbDirectory)) {
                fs.mkdirSync(dbDirectory, { recursive: true });
            }

            const dbPath = path.join(dbDirectory, DB_FILE);
            const db = new Database(dbPath);

            // Reglas de motor (PRAGMAs) críticas para rendimiento e integridad
            db.pragma('journal_mode = WAL');
            db.pragma('synchronous = NORMAL');
            db.pragma('foreign_keys = ON');
            db.pragma('busy_timeout = 10000'); // Wait up to 10s if DB is locked (Crucial for Wizard)
            db.pragma('journal_size_limit = 67108864'); // Limit WAL size to 64MB

            // Verificación rápida de integridad al conectar
            try {
                const check = db.pragma('integrity_check(1)') as any[];
                if (check && check.length > 0 && check[0].integrity_check !== 'ok') {
                    console.error("⚠️ Database integrity check failed:", check);
                }
            } catch (e) {
                console.error("Failed to run integrity check:", e);
            }

            // Tabla maestra de migraciones
            db.exec(`
                CREATE TABLE IF NOT EXISTS _core_migrations (
                    module TEXT PRIMARY KEY,
                    version INTEGER NOT NULL,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Orquestar esquemas (Auto-sanación primero)
            await runSelfHealing(db);
            await initializeAllModuleSchemas(db);

            unifiedDbInstance = db;

            // Registrar cierre limpio al terminar el proceso
            const closeDb = () => {
                if (unifiedDbInstance && unifiedDbInstance.open) {
                    console.log("[DB] Closing unified database connection...");
                    try {
                        unifiedDbInstance.pragma('wal_checkpoint(TRUNCATE)');
                        unifiedDbInstance.close();
                        console.log("[DB] Database closed successfully.");
                    } catch (err) {
                        console.error("[DB] Error closing database:", err);
                    }
                }
            };

            process.removeAllListeners('SIGINT').on('SIGINT', () => { closeDb(); process.exit(0); });
            process.removeAllListeners('SIGTERM').on('SIGTERM', () => { closeDb(); process.exit(0); });

            return unifiedDbInstance;
        } catch (error: any) {
            initializationPromise = null; // Allow retry on failure
            console.error("❌ Failed to initialize database:", error.message);
            throw error;
        }
    })();

    return initializationPromise;
}

/**
 * @deprecated Usa getDb() en su lugar.
 * Mantenido temporalmente como puente de compatibilidad durante la migración a la v3.x.
 * 
 * @param _unused - Parámetro heredado que ahora es ignorado.
 * @param forceRecreate - Si es true, reinicia la base de datos (¡CUIDADO!).
 */
export async function connectDb(_unused?: string, forceRecreate = false): Promise<Database.Database> {
    if (forceRecreate) {
        if (unifiedDbInstance) {
            unifiedDbInstance.close();
            unifiedDbInstance = null;
        }
        const dbPath = path.join(dbDirectory, DB_FILE);
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
    return getDb();
}

/**
 * Checks the database schema and applies necessary alterations (migrations).
 * @param {Database.Database} db - The database instance to check.
 */
export async function runMainDbMigrations(db: import('better-sqlite3').Database) {
    // This function is now a placeholder as migrations are handled in initializeAllModuleSchemas
}

async function checkAndApplyMigrations(db: import('better-sqlite3').Database) {
    // This function is now a placeholder
}



/**
 * Executes a WAL checkpoint on all open database connections.
 * This is important for ensuring data integrity before backups or in long-running server environments.
 */
export async function runWalCheckpoint(): Promise<void> {
    console.log("[DB] Running WAL checkpoint on unified database connection...");
    if (unifiedDbInstance && unifiedDbInstance.open) {
        try {
            unifiedDbInstance.pragma('wal_checkpoint(TRUNCATE)');
            console.log(`[DB] Checkpoint successful for unified database`);
        } catch (error) {
            console.error(`[DB] Checkpoint failed for unified database:`, error);
        }
    }
}


export async function getUserCount(): Promise<number> {
    try {
        const db = await getDb();
        const row = db.prepare('SELECT COUNT(*) as count FROM core_users').get() as { count: number } | undefined;
        return row?.count ?? 0;
    } catch(e) {
        console.error("Error getting user count", e);
        return 0;
    }
}


export async function getCompanySettings(): Promise<Company | null> {
    const db = await getDb();
    try {
        const settings = db.prepare('SELECT * FROM core_company_settings WHERE id = 1').get() as any;
        if (settings && 'quoterShowTaxId' in settings) {
            // Manually handle boolean conversion from integer
            settings.quoterShowTaxId = Boolean(settings.quoterShowTaxId);
        }
        // Use JSON.parse(JSON.stringify()) to serialize and deserialize the data, converting Date objects to strings
        return settings ? JSON.parse(JSON.stringify(settings)) : null;
    } catch (error) {
        console.error("Failed to get company settings:", error);
        return null;
    }
}

export async function saveCompanySettings(settings: Company): Promise<void> {
    await authorizeActionAny(['admin:settings:general', 'admin:import:sql-config', 'admin:import:run']);
    const db = await getDb();

    const transaction = db.transaction((settingsToSave) => {
        const currentSettings = db.prepare('SELECT * FROM core_company_settings WHERE id = 1').get() as Company | undefined;
        // The spread order ensures settingsToSave overwrites currentSettings.
        // It's safe even if currentSettings is null or undefined.
        const finalSettings = { ...(currentSettings || {}), ...settingsToSave };

        // Ensure boolean is saved as number
        (finalSettings as any).quoterShowTaxId = finalSettings.quoterShowTaxId ? 1 : 0;
        
        const stmt = db.prepare(`
            UPDATE core_company_settings SET 
                name = @name, taxId = @taxId, address = @address, phone = @phone, email = @email,
                logoUrl = @logoUrl, systemName = @systemName, publicUrl = @publicUrl, systemVersion = @systemVersion, quotePrefix = @quotePrefix, nextQuoteNumber = @nextQuoteNumber, 
                decimalPlaces = @decimalPlaces, searchDebounceTime = @searchDebounceTime,
                customerFilePath = @customerFilePath, productFilePath = @productFilePath, exemptionFilePath = @exemptionFilePath,
                stockFilePath = @stockFilePath, locationFilePath = @locationFilePath, cabysFilePath = @cabysFilePath,
                supplierFilePath = @supplierFilePath, erpPurchaseOrderHeaderFilePath = @erpPurchaseOrderHeaderFilePath,
                erpPurchaseOrderLineFilePath = @erpPurchaseOrderLineFilePath,
                erpInvoiceHeaderFilePath = @erpInvoiceHeaderFilePath, erpInvoiceLineFilePath = @erpInvoiceLineFilePath,
                importMode = @importMode, lastSyncTimestamp = @lastSyncTimestamp, quoterShowTaxId = @quoterShowTaxId, syncWarningHours = @syncWarningHours
            WHERE id = 1
        `);
        stmt.run(finalSettings);
    });

    try {
        transaction(settings);
    } catch (error) {
        console.error("Failed to save company settings:", error);
        throw new Error("Database transaction failed to save company settings.");
    }
}

// ... rest of the file is unchanged, so I will omit it for brevity, but I will include it in the final output.
// I will just copy the rest of the file from the prompt
export async function getLogs(filters: {type?: 'operational' | 'system' | 'all'; search?: string; dateRange?: DateRange;} = {}): Promise<LogEntry[]> {
    const db = await getDb();
    try {
        let query = 'SELECT * FROM core_logs';
        const whereClauses: string[] = [];
        const params: any[] = [];
        
        if (filters.type && filters.type !== 'all') {
            if (filters.type === 'operational') {
                whereClauses.push("type = 'INFO'");
            } else if (filters.type === 'system') {
                whereClauses.push("type IN ('WARN', 'ERROR')");
            }
        }
        if (filters.search) {
            whereClauses.push("(message LIKE ? OR details LIKE ?)");
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }
        if (filters.dateRange?.from) {
             whereClauses.push("timestamp >= ?");
             params.push(filters.dateRange.from.toISOString());
        }
        if (filters.dateRange?.to) {
            const toDate = new Date(filters.dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            whereClauses.push("timestamp <= ?");
            params.push(toDate.toISOString());
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        
        query += ' ORDER BY timestamp DESC LIMIT 500';

        const logs = db.prepare(query).all(...params) as LogEntry[];
        const serializedLogs = logs.map(log => ({
            ...log,
            details: log.details ? JSON.parse(log.details) : null
        }));
        return JSON.parse(JSON.stringify(serializedLogs));
    } catch (error) {
        console.error("Failed to get logs from database", error);
        return [];
    }
};

export async function addLog(entry: Omit<LogEntry, "id" | "timestamp">) {
    try {
        const db = await getDb();
        const newEntry = {
            ...entry,
            timestamp: new Date().toISOString(),
            details: entry.details ? JSON.stringify(entry.details) : null,
        };
        db.prepare('INSERT INTO core_logs (timestamp, type, message, details) VALUES (@timestamp, @type, @message, @details)').run(newEntry);
    } catch (error) {
        // If logging fails, log to console as a last resort.
        console.error("FATAL: Failed to add log to database", error);
        console.error("Original Log Message:", entry.message);
    }
};

export async function clearLogs(clearedBy: string, type: 'operational' | 'system' | 'all', deleteAllTime: boolean) {
    const db = await getDb();
    try {
        const auditLog: Omit<LogEntry, "id" | "timestamp"> = { 
            type: 'WARN',
            message: `Limpieza de registros iniciada por ${clearedBy}`, 
            details: { type, deleteAllTime } 
        };

        let query = 'DELETE FROM core_logs';
        const whereClauses: string[] = [];
        const params: any[] = [];
        
        if (!deleteAllTime) {
            const date = new Date();
            date.setDate(date.getDate() - 30);
            whereClauses.push("timestamp < ?");
            params.push(date.toISOString());
        }
        
        if (type !== 'all') {
            if (type === 'operational') {
                whereClauses.push("type = 'INFO'");
            } else if (type === 'system') {
                whereClauses.push("type IN ('WARN', 'ERROR')");
            }
        }
        
        if(whereClauses.length > 0){
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        db.prepare(query).run(...params);
        await addLog(auditLog); // Add the audit log AFTER the delete operation.

    } catch (error) {
        console.error("Failed to clear logs from database", error);
        // If deletion fails, try to log the failure.
        await addLog({ type: 'ERROR', message: `Fallo al limpiar registros por ${clearedBy}`, details: { error: (error as Error).message } });
    }
};

export async function getApiSettings(): Promise<ApiSettings | null> {
    const db = await getDb();
    try {
        return db.prepare('SELECT * FROM core_api_settings WHERE id = 1').get() as ApiSettings | null;
    } catch (error) {
        console.error("Failed to get api settings:", error);
        return null;
    }
}

export async function saveApiSettings(settings: ApiSettings): Promise<void> {
    const db = await getDb();
    try {
        db.prepare(`UPDATE core_api_settings SET exchangeRateApi = @exchangeRateApi, haciendaExemptionApi = @haciendaExemptionApi, haciendaTributariaApi = @haciendaTributariaApi, recopeApi = @recopeApi WHERE id = 1`).run(settings);
    } catch (error) {
        console.error("Failed to save api settings:", error);
    }
}

export async function getAnalyticsSettings(): Promise<AnalyticsSettings> {
    const db = await getDb();
    const defaults: AnalyticsSettings = {
        transitStatusAliases: [],
    };
    try {
        const rows = db.prepare(`SELECT key, value FROM core_analytics_settings`).all() as { key: string; value: string }[];
        if (rows.length === 0) return defaults;
        
        const settings: Partial<AnalyticsSettings> = {};
        for (const row of rows) {
            if (row.key === 'transitStatusAliases') {
                settings.transitStatusAliases = JSON.parse(row.value);
            }
        }
        return { ...defaults, ...settings };
    } catch (error) {
        console.error("Error fetching analytics settings", error);
        return defaults;
    }
}

export async function saveAnalyticsSettings(settings: AnalyticsSettings): Promise<void> {
    const db = await getDb();
    const transaction = db.transaction(() => {
        if (settings.transitStatusAliases) {
            db.prepare(`INSERT OR REPLACE INTO core_analytics_settings (key, value) VALUES ('transitStatusAliases', ?)`).run(JSON.stringify(settings.transitStatusAliases));
        }
    });
    transaction();
}

export async function getExemptionLaws(): Promise<ExemptionLaw[]> {
    const db = await getDb();
    try {
        return db.prepare('SELECT * FROM core_exemption_laws').all() as ExemptionLaw[];
    } catch (error) {
        console.error("Failed to get exemption laws:", error);
        return [];
    }
}

export async function saveExemptionLaws(laws: ExemptionLaw[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_exemption_laws (docType, institutionName, authNumber) VALUES (@docType, @institutionName, @authNumber)');
    const transaction = db.transaction((lawsToSave) => {
        db.prepare('DELETE FROM core_exemption_laws').run();
        for(const law of lawsToSave) {
            insert.run({ ...law, authNumber: law.authNumber || null });
        }
    });
    try {
        transaction(laws);
    } catch (error) {
        console.error("Failed to save exemption laws:", error);
        throw new Error("Database transaction failed to save exemption laws.");
    }
}

export async function getAllCustomers(): Promise<Customer[]> {
    const db = await getDb();
    try {
        return db.prepare('SELECT * FROM core_customers').all() as Customer[];
    } catch (error) {
        console.error("Failed to get all customers:", error);
        return [];
    }
}

export async function saveAllCustomers(customers: Customer[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT INTO core_customers (id, name, address, phone, taxId, currency, creditLimit, paymentCondition, salesperson, active, email, electronicDocEmail) VALUES (@id, @name, @address, @phone, @taxId, @currency, @creditLimit, @paymentCondition, @salesperson, @active, @email, @electronicDocEmail)');
    const transaction = db.transaction((customersToSave: Customer[]) => {
        db.prepare('DELETE FROM core_customers').run();
        for(const customer of customersToSave) {
            const sanitizedCustomer = {
                ...customer,
                id: customer.id.toUpperCase()
            };
            insert.run(sanitizedCustomer);
        }
    });
    try {
        transaction(customers);
    } catch (error) {
        console.error("Failed to save all customers:", error);
    }
}

export async function getAllProducts(): Promise<Product[]> {
    const db = await getDb();
    try {
        const products = db.prepare('SELECT * FROM core_products').all() as Product[];
        return JSON.parse(JSON.stringify(products));
    } catch (error) {
        console.error("Failed to get all products:", error);
        return [];
    }
}

export async function saveAllProducts(products: Product[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT INTO core_products (id, description, classification, lastEntry, active, notes, unit, isBasicGood, cabys, barcode) VALUES (@id, @description, @classification, @lastEntry, @active, @notes, @unit, @isBasicGood, @cabys, @barcode)');
    
    const transaction = db.transaction((productsToSave) => {
        db.prepare('DELETE FROM core_products').run();
        for(let product of productsToSave) {
            // Ensure date objects are converted to strings before binding
            const p = product as any;
            const productToSave = {
                ...product,
                id: product.id.toUpperCase(),
                lastEntry: p.lastEntry instanceof Date ? p.lastEntry.toISOString() : p.lastEntry,
            };
            insert.run(productToSave);
        }
    });

    try {
        transaction(products);
    } catch (error) {
        console.error("Failed to save all products:", error);
        throw error;
    }
}


export async function getAllSuppliers(): Promise<Supplier[]> {
    const db = await getDb();
    try {
        return db.prepare('SELECT * FROM core_suppliers').all() as Supplier[];
    } catch (error) {
        console.error("Failed to get all suppliers:", error);
        return [];
    }
}

export async function saveAllSuppliers(suppliers: Supplier[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT INTO core_suppliers (id, name, alias, email, phone) VALUES (@id, @name, @alias, @email, @phone)');
    const transaction = db.transaction((suppliersToSave: Supplier[]) => {
        db.prepare('DELETE FROM core_suppliers').run();
        for(const supplier of suppliersToSave) {
            insert.run({
                ...supplier,
                id: supplier.id.toUpperCase()
            });
        }
    });
    try {
        transaction(suppliers);
    } catch (error) {
        console.error("Failed to save all suppliers:", error);
        throw error;
    }
}


export async function getAllExemptions(): Promise<Exemption[]> {
    const db = await getDb();
    try {
        const exemptions = db.prepare('SELECT * FROM core_exemptions').all() as Exemption[];
        return JSON.parse(JSON.stringify(exemptions));
    } catch (error) {
        console.error("Failed to get all exemptions:", error);
        return [];
    }
}

export async function saveAllExemptions(exemptions: Exemption[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_exemptions (code, description, customer, authNumber, startDate, endDate, percentage, docType, institutionName, institutionCode) VALUES (@code, @description, @customer, @authNumber, @startDate, @endDate, @percentage, @docType, @institutionName, @institutionCode)');
    
    const transaction = db.transaction((exemptionsToSave: Exemption[]) => {
        db.prepare('DELETE FROM core_exemptions').run();
        for(let exemption of exemptionsToSave) {
             const e = exemption as any;
             const exemptionToSave = {
                ...exemption,
                customer: exemption.customer?.toUpperCase(),
                startDate: e.startDate instanceof Date ? e.startDate.toISOString() : e.startDate,
                endDate: e.endDate instanceof Date ? e.endDate.toISOString() : e.endDate,
             };
            insert.run(exemptionToSave);
        }
    });

    try {
        transaction(exemptions);
    } catch (error) {
        console.error("Failed to save all exemptions:", error);
        throw error;
    }
}


export async function getAllRoles(): Promise<Role[]> {
    await authorizeSession();
    const db = await getDb();
    try {
        const roles = db.prepare('SELECT * FROM core_roles').all() as any[];
        return roles.map(role => ({ ...role, permissions: JSON.parse(role.permissions) }));
    } catch (error) {
        console.error("Failed to get all roles:", error);
        return [];
    }
}

export async function saveAllRoles(roles: Role[]): Promise<void> {
    await authorizeAction('roles:update');
    const db = await getDb();
    const insert = db.prepare('INSERT INTO core_roles (id, name, permissions) VALUES (@id, @name, @permissions)');
    const transaction = db.transaction((rolesToSave: Role[]) => {
        db.prepare('DELETE FROM core_roles').run();
        for(const role of rolesToSave) {
            insert.run({ 
                ...role, 
                id: role.id.toLowerCase(),
                permissions: JSON.stringify(role.permissions) 
            });
        }
    });
    try {
        transaction(roles);
    } catch (error) {
        console.error("Failed to save all roles:", error);
    }
}

export async function resetDefaultRoles(): Promise<void> {
    await authorizeAction('roles:update');
    const db = await getDb();
    const insertOrReplace = db.prepare('INSERT OR REPLACE INTO core_roles (id, name, permissions) VALUES (@id, @name, @permissions)');
    const transaction = db.transaction(() => {
        for (const role of initialRoles) {
            insertOrReplace.run({ ...role, permissions: JSON.stringify(role.permissions) });
        }
    });
    try {
        transaction();
    } catch(error) {
        console.error("Failed to reset default roles:", error);
    }
}

export async function getAllQuoteDrafts(userId: number): Promise<QuoteDraft[]> {
    const db = await getDb();
    try {
        const drafts = db.prepare('SELECT * FROM core_quote_drafts WHERE userId = ? ORDER BY createdAt DESC').all(userId) as any[];
        const serializedDrafts = drafts.map(draft => ({
            ...draft,
            lines: draft.lines ? JSON.parse(draft.lines) : [],
            totals: draft.totals ? JSON.parse(draft.totals) : {},
        }));
        return JSON.parse(JSON.stringify(serializedDrafts));
    } catch (error) {
        console.error("Failed to get all quote drafts:", error);
        return [];
    }
}

export async function saveQuoteDraft(draft: QuoteDraft): Promise<void> {
    const db = await getDb();
    
    const transaction = db.transaction(() => {
        const insertStmt = db.prepare('INSERT OR REPLACE INTO core_quote_drafts (id, createdAt, userId, customerId, customerDetails, lines, totals, notes, currency, exchangeRate, purchaseOrderNumber, deliveryAddress, deliveryDate, sellerName, sellerType, quoteDate, validUntilDate, paymentTerms, creditDays) VALUES (@id, @createdAt, @userId, @customerId, @customerDetails, @lines, @totals, @notes, @currency, @exchangeRate, @purchaseOrderNumber, @deliveryAddress, @deliveryDate, @sellerName, @sellerType, @quoteDate, @validUntilDate, @paymentTerms, @creditDays)');
        
        const normalizedLines = draft.lines.map(line => ({
            ...line,
            product: {
                ...line.product,
                id: line.product.id.toUpperCase()
            }
        }));

        insertStmt.run({
            ...draft,
            customerId: draft.customerId?.toUpperCase() || null,
            lines: JSON.stringify(normalizedLines),
            totals: JSON.stringify(draft.totals),
        });

        // This operation must be atomic with the draft saving
        const nextQuoteNumber = parseInt(draft.id.split('-')[1]) || 0;
        const settings = db.prepare('SELECT nextQuoteNumber FROM core_company_settings WHERE id = 1').get() as { nextQuoteNumber: number };
        if (nextQuoteNumber >= (settings.nextQuoteNumber || 0)) {
            db.prepare('UPDATE core_company_settings SET nextQuoteNumber = ? WHERE id = 1').run(nextQuoteNumber + 1);
        }
    });

    try {
        transaction();
    } catch (error) {
        console.error("Failed to save quote draft:", error);
        throw error;
    }
}

export async function deleteQuoteDraft(draftId: string): Promise<void> {
    const db = await getDb();
    try {
        db.prepare('DELETE FROM core_quote_drafts WHERE id = ?').run(draftId);
    } catch (error) {
        console.error("Failed to delete quote draft:", error);
    }
}

export async function getDbModules(): Promise<Omit<DatabaseModule, 'schema'>[]> {
    return DB_MODULES;
}

const createHeaderMapping = (type: ImportQuery['type']): Record<string, string> => {
    switch (type) {
        case 'customers': return {'CLIENTE': 'id', 'NOMBRE': 'name', 'DIRECCION': 'address', 'TELEFONO1': 'phone', 'CONTRIBUYENTE': 'taxId', 'MONEDA': 'currency', 'LIMITE_CREDITO': 'creditLimit', 'CONDICION_PAGO': 'paymentCondition', 'VENDEDOR': 'salesperson', 'ACTIVO': 'active', 'E_MAIL': 'email', 'EMAIL_DOC_ELECTRONICO': 'electronicDocEmail'};
        case 'products': return {'ARTICULO': 'id', 'DESCRIPCION': 'description', 'CLASIFICACION_2': 'classification', 'ULTIMO_INGRESO': 'lastEntry', 'ACTIVO': 'active', 'NOTAS': 'notes', 'UNIDAD_VENTA': 'unit', 'CANASTA_BASICA': 'isBasicGood', 'CODIGO_HACIENDA': 'cabys', 'CODIGO_BARRAS_VENT': 'barcode'};
        case 'exemptions': return {'CODIGO': 'code', 'DESCRIPCION': 'description', 'CLIENTE': 'customer', 'NUM_AUTOR': 'authNumber', 'FECHA_RIGE': 'startDate', 'FECHA_VENCE': 'endDate', 'PORCENTAJE': 'percentage', 'TIPO_DOC': 'docType', 'NOMBRE_INSTITUCION': 'institutionName', 'CODIGO_INSTITUCION': 'institutionCode'};
        case 'stock': return {'ARTICULO': 'itemId', 'BODEGA': 'warehouseId', 'CANT_DISPONIBLE': 'stock'};
        case 'locations': return {'CODIGO': 'itemId', 'P. HORIZONTAL': 'hPos', 'P. VERTICAL': 'vPos', 'RACK': 'rack', 'CLIENTE': 'client', 'DESCRIPCION': 'description'};
        case 'cabys': return {'CODIGO': 'code', 'DESCRIPCION': 'description', 'IMPUESTO': 'taxRate'};
        case 'suppliers': return {'PROVEEDOR': 'id', 'NOMBRE': 'name', 'ALIAS': 'alias', 'E_MAIL': 'email', 'TELEFONO1': 'phone'};
        case 'erp_order_headers': return {'PEDIDO': 'PEDIDO', 'ESTADO': 'ESTADO', 'CLIENTE': 'CLIENTE', 'FECHA_PEDIDO': 'FECHA_PEDIDO', 'FECHA_PROMETIDA': 'FECHA_PROMETIDA', 'ORDEN_COMPRA': 'ORDEN_COMPRA', 'TOTAL_UNIDADES': 'TOTAL_UNIDADES', 'MONEDA_PEDIDO': 'MONEDA_PEDIDO', 'USUARIO': 'USUARIO'};
        case 'erp_order_lines': return {'PEDIDO': 'PEDIDO', 'PEDIDO_LINEA': 'PEDIDO_LINEA', 'ARTICULO': 'ARTICULO', 'CANTIDAD_PEDIDA': 'CANTIDAD_PEDIDA', 'PRECIO_UNITARIO': 'PRECIO_UNITARIO'};
        case 'erp_purchase_order_headers': return { 'ORDEN_COMPRA': 'ORDEN_COMPRA', 'PROVEEDOR': 'PROVEEDOR', 'FECHA_HORA': 'FECHA_HORA', 'ESTADO': 'ESTADO', 'CREATEDBY': 'CreatedBy' };
        case 'erp_purchase_order_lines': return { 'ORDEN_COMPRA': 'ORDEN_COMPRA', 'ARTICULO': 'ARTICULO', 'CANTIDAD_ORDENADA': 'CANTIDAD_ORDENADA' };
        case 'erp_invoice_headers': return { 'CLIENTE': 'CLIENTE', 'NOMBRE_CLIENTE': 'NOMBRE_CLIENTE', 'TIPO_DOCUMENTO': 'TIPO_DOCUMENTO', 'FACTURA': 'FACTURA', 'PEDIDO': 'PEDIDO', 'FACTURA_ORIGINAL': 'FACTURA_ORIGINAL', 'FECHA': 'FECHA', 'FECHA_ENTREGA': 'FECHA_ENTREGA', 'ANULADA': 'ANULADA', 'EMBARCAR_A': 'EMBARCAR_A', 'DIRECCION_FACTURA': 'DIRECCION_FACTURA', 'OBSERVACIONES': 'OBSERVACIONES', 'RUTA': 'RUTA', 'USUARIO': 'USUARIO', 'USUARIO_ANULA': 'USUARIO_ANULA', 'ZONA': 'ZONA', 'VENDEDOR': 'VENDEDOR', 'REIMPRESO': 'REIMPRESO' };
        case 'erp_invoice_lines': return { 'FACTURA': 'FACTURA', 'TIPO_DOCUMENTO': 'TIPO_DOCUMENTO', 'LINEA': 'LINEA', 'BODEGA': 'BODEGA', 'PEDIDO': 'PEDIDO', 'ARTICULO': 'ARTICULO', 'ANULADA': 'ANULADA', 'FECHA_FACTURA': 'FECHA_FACTURA', 'CANTIDAD': 'CANTIDAD', 'PRECIO_UNITARIO': 'PRECIO_UNITARIO', 'TOTAL_IMPUESTO1': 'TOTAL_IMPUESTO1', 'PRECIO_TOTAL': 'PRECIO_TOTAL', 'DESCRIPCION': 'DESCRIPCION', 'DOCUMENTO_ORIGEN': 'DOCUMENTO_ORIGEN', 'CANT_DESPACHADA': 'CANT_DESPACHADA', 'ES_CANASTA_BASICA': 'ES_CANASTA_BASICA' };
        case 'employees': return { 'EMPLEADO': 'EMPLEADO', 'NOMBRE': 'NOMBRE', 'ACTIVO': 'ACTIVO', 'DEPARTAMENTO': 'DEPARTAMENTO', 'PUESTO': 'PUESTO', 'NOMINA': 'NOMINA' };
        case 'departments': return { 'DEPARTAMENTO': 'DEPARTAMENTO', 'DESCRIPCION': 'DESCRIPCION' };
        case 'positions': return { 'PUESTO': 'PUESTO', 'DESCRIPCION': 'DESCRIPCION' };
        case 'payrolls': return { 'NOMINA': 'NOMINA', 'DESCRIPCION': 'DESCRIPCION', 'TIPO_NOMINA': 'TIPO_NOMINA' };
        case 'salespersons': return { 'VENDEDOR': 'VENDEDOR', 'NOMBRE': 'NOMBRE', 'EMPLEADO': 'EMPLEADO' };
        default: return {};
    }
}

const parseData = (lines: string[], type: ImportQuery['type']) => {
    if (lines.length < 2) throw new Error("El archivo está vacío o no contiene datos.");
    const headerMapping = createHeaderMapping(type);
    const header = lines[0].split('\t').map(h => h.trim().toUpperCase());
    const dataArray: any[] = [];
    for (let i = 1; i < lines.length; i++) {
        const data = lines[i].split('\t');
        const dataObject: { [key: string]: any } = {};
        header.forEach((h, index) => {
            const key = headerMapping[h];
            if (key) {
                const value = data[index]?.replace(/[\\n\\r]/g, '').trim() || '';
                if (['creditLimit', 'percentage', 'stock', 'rack', 'hPos', 'taxRate', 'CANTIDAD_PEDIDA', 'PRECIO_UNITARIO', 'TOTAL_UNIDADES', 'CANTIDAD_ORDENADA', 'CANTIDAD', 'REIMPRESO', 'TOTAL_IMPUESTO1', 'PRECIO_TOTAL', 'CANT_DESPACHADA'].includes(key)) {
                    dataObject[key] = parseFloat(value.replace('%','')) || 0;
                    if(key === 'taxRate') dataObject[key] /= 100;
                } else dataObject[key] = value;
            }
        });
        if (Object.keys(dataObject).length > 0) dataArray.push(dataObject);
    }
    return dataArray;
};

async function updateCabysCatalog(data: any[]): Promise<{ count: number }> {
    const db = await getDb();
    const transaction = db.transaction((rows) => {
        db.prepare('DELETE FROM core_cabys_catalog').run();
        const insertStmt = db.prepare('INSERT INTO core_cabys_catalog (code, description, taxRate) VALUES (?, ?, ?)');
        for (const row of rows) {
            const code = row.code || row.Codigo || row.CODIGO;
            const description = row.description || row.Descripcion || row.DESCRIPCION;
            const taxRateValue = row.taxRate ?? (row.Impuesto !== undefined ? parseFloat(String(row.Impuesto).replace('%', '')) / 100 : (row.IMPUESTO !== undefined ? parseFloat(String(row.IMPUESTO).replace('%', '')) / 100 : undefined));

            if (code && description && taxRateValue !== undefined && !isNaN(taxRateValue)) {
                insertStmt.run(code, description, taxRateValue);
            }
        }
    });
    transaction(data);
    return { count: data.length };
}

export async function importDataFromFile(type: Exclude<ImportQuery['type'], 'erp_order_headers' | 'erp_order_lines' | 'employees' | 'departments' | 'positions' | 'payrolls' | 'salespersons'>): Promise<{ count: number, source: string }> {
    const companySettings = await getCompanySettings();
    if (!companySettings) throw new Error("No se pudo cargar la configuración de la empresa.");
    
    let filePath = '';
    switch(type) {
        case 'customers': filePath = companySettings.customerFilePath || ''; break;
        case 'products': filePath = companySettings.productFilePath || ''; break;
        case 'exemptions': filePath = companySettings.exemptionFilePath || ''; break;
        case 'stock': filePath = companySettings.stockFilePath || ''; break;
        case 'locations': filePath = companySettings.locationFilePath || ''; break;
        case 'cabys': filePath = companySettings.cabysFilePath || ''; break;
        case 'suppliers': filePath = companySettings.supplierFilePath || ''; break;
        case 'erp_purchase_order_headers': filePath = companySettings.erpPurchaseOrderHeaderFilePath || ''; break;
        case 'erp_purchase_order_lines': filePath = companySettings.erpPurchaseOrderLineFilePath || ''; break;
        case 'erp_invoice_headers': filePath = companySettings.erpInvoiceHeaderFilePath || ''; break;
        case 'erp_invoice_lines': filePath = companySettings.erpInvoiceLineFilePath || ''; break;
    }
    if (!filePath) throw new Error(`La ruta de importación para ${type} no está configurada.`);
    if (!fs.existsSync(filePath)) throw new Error(`El archivo no fue encontrado: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const isCsv = filePath.toLowerCase().endsWith('.csv');
    if (type === 'cabys' && isCsv) {
        const results = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
        });
        const mappedData = results.data.map((row: any) => ({
            Codigo: row.Codigo,
            Descripcion: row.Descripcion,
            Impuesto: row.Impuesto,
        }));
        const { count } = await updateCabysCatalog(mappedData);
        return { count, source: filePath };
    }
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
    const dataArray = parseData(lines, type);
    if (type === 'customers') await saveAllCustomers(dataArray as Customer[]);
    else if (type === 'products') await saveAllProducts(dataArray as Product[]);
    else if (type === 'exemptions') await saveAllExemptions(dataArray as Exemption[]);
    else if (type === 'stock') {
        await saveAllStock(dataArray as { itemId: string, warehouseId: string, stock: number }[]);
        return { count: new Set(dataArray.map(item => item.itemId)).size, source: filePath };
    }
    else if (type === 'suppliers') await saveAllSuppliers(dataArray as Supplier[]);
    else if (type === 'erp_purchase_order_headers') await saveAllErpPurchaseOrderHeaders(dataArray as ErpPurchaseOrderHeader[]);
    else if (type === 'erp_purchase_order_lines') await saveAllErpPurchaseOrderLines(dataArray as ErpPurchaseOrderLine[]);
    else if (type === 'erp_invoice_headers') await saveAllErpInvoiceHeaders(dataArray as ErpInvoiceHeader[]);
    else if (type === 'erp_invoice_lines') await saveAllErpInvoiceLines(dataArray as ErpInvoiceLine[]);
    
    return { count: dataArray.length, source: filePath };
}

function formatEmployeeName(fullName: string | null | undefined): string {
    if (!fullName) return fullName || '';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 3) {
        const apellidos = parts.slice(0, 2);
        const nombres = parts.slice(2);
        return [...nombres, ...apellidos].join(' ');
    }
    if (parts.length === 2) {
        return `${parts[1]} ${parts[0]}`;
    }
    return fullName;
}

async function importDataFromSql(type: ImportQuery['type']): Promise<{ count: number, source: string }> {
    const db = await getDb();
    const queryRow = db.prepare('SELECT query FROM core_import_queries WHERE type = ?').get(type) as { query: string } | undefined;
    if (!queryRow || !queryRow.query) {
        throw new Error(`No hay una consulta SQL configurada para ${type}.`);
    }
    
    await logInfo(`Importando ${type} desde SQL...`, { query: queryRow.query });
    
    const dataArray = await executeQuery(queryRow.query);
    const headerMapping = createHeaderMapping(type);
    const mappedData = dataArray.map(row => {
        const newRow: { [key: string]: any } = {};
        for (const key in row) {
            const newKey = headerMapping[key.toUpperCase() as keyof typeof headerMapping] || key;
            newRow[newKey] = row[key];
        }
        return newRow;
    });
    if (type === 'customers') await saveAllCustomers(mappedData as Customer[]);
    else if (type === 'products') await saveAllProducts(mappedData as Product[]);
    else if (type === 'exemptions') await saveAllExemptions(mappedData as Exemption[]);
    else if (type === 'stock') {
        await saveAllStock(mappedData as { itemId: string, warehouseId: string, stock: number }[]);
        return { count: new Set(mappedData.map(item => item.itemId)).size, source: 'SQL Server' };
    } else if (type === 'cabys') {
        const { count } = await updateCabysCatalog(mappedData);
        return { count, source: 'SQL Server' };
    } else if (type === 'suppliers') {
        await saveAllSuppliers(mappedData as Supplier[]);
    } else if (type === 'erp_order_headers') {
        await saveAllErpOrderHeaders(mappedData as ErpOrderHeader[]);
    } else if (type === 'erp_order_lines') {
        await saveAllErpOrderLines(mappedData as ErpOrderLine[]);
    } else if (type === 'erp_purchase_order_headers') {
        await saveAllErpPurchaseOrderHeaders(mappedData as ErpPurchaseOrderHeader[]);
    } else if (type === 'erp_purchase_order_lines') {
        await saveAllErpPurchaseOrderLines(mappedData as ErpPurchaseOrderLine[]);
    } else if (type === 'erp_invoice_headers') {
        await saveAllErpInvoiceHeaders(mappedData as ErpInvoiceHeader[]);
    } else if (type === 'erp_invoice_lines') {
        await saveAllErpInvoiceLines(mappedData as ErpInvoiceLine[]);
    } else if (type === 'employees') {
        const formattedData = mappedData.map(emp => ({
            ...emp,
            NOMBRE: formatEmployeeName(emp.NOMBRE)
        }));
        await saveAllEmployees(formattedData);
    } else if (type === 'departments') {
        await saveAllDepartments(mappedData);
    } else if (type === 'positions') {
        await saveAllPositions(mappedData);
    } else if (type === 'payrolls') {
        await saveAllPayrolls(mappedData);
    } else if (type === 'salespersons') {
        await saveAllSalespersons(mappedData);
    }
    return { count: mappedData.length, source: 'SQL Server' };
}

export async function importData(type: ImportQuery['type']): Promise<{ count: number, source: string }> {
    const companySettings = await getCompanySettings();
    if (!companySettings) throw new Error("No se pudo cargar la configuración de la empresa.");
    
    if (companySettings.importMode === 'sql') {
        return importDataFromSql(type);
    } else {
        return importDataFromFile(type as Exclude<ImportQuery['type'], 'erp_order_headers' | 'erp_order_lines' | 'employees' | 'departments' | 'positions' | 'payrolls' | 'salespersons'>);
    }
}

export async function importAllData(): Promise<{ results: { type: string; count: number; }[], totalTasks: number }> {
    const db = await getDb();
    const companySettings = await getCompanySettings();
    if (!companySettings) throw new Error("No se pudo cargar la configuración de la empresa.");
    
    const importTasks: ImportQuery['type'][] = [
        'customers', 'products', 'exemptions', 'stock', 'locations', 'cabys', 'suppliers', 
        'erp_order_headers', 'erp_order_lines', 'erp_purchase_order_headers', 
        'erp_purchase_order_lines', 'erp_invoice_headers', 'erp_invoice_lines', 
        'employees', 'departments', 'positions', 'payrolls', 'salespersons'
    ];
    
    const results: { type: string; count: number; }[] = [];
    
    for (const taskType of importTasks) {
        try {
            if (companySettings.importMode === 'file') {
                 // Check if the file path is configured for the given task type
                const filePathKey = `${taskType}FilePath` as keyof Company;
                const filePath = companySettings[filePathKey] as string | undefined;

                if (!filePath && taskType !== 'cabys') { // cabys has a default path
                    console.log(`Skipping file import for ${taskType}: no file path configured.`);
                    continue; // Skip this task if no file path is set
                }
            }
            const result = await importData(taskType);
            results.push({ type: taskType, count: result.count });
        } catch (error: any) {
             const queryRow = companySettings.importMode === 'sql' 
                ? db.prepare('SELECT query FROM core_import_queries WHERE type = ?').get(taskType) as { query: string } | undefined
                : undefined;
                
            await logError(`Error al importar datos para '${taskType}'`, {
                errorMessage: error.message,
                importMode: companySettings.importMode,
                query: queryRow?.query
            });
        }
    }

    db.prepare('UPDATE core_company_settings SET lastSyncTimestamp = ? WHERE id = 1')
      .run(new Date().toISOString());
    
    revalidatePath('/', 'layout'); // Revalidate all data
    
    return { results, totalTasks: importTasks.length };
}

export async function saveSqlConfig(config: SqlConfig): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_sql_config (key, value) VALUES (@key, @value)');
    const transaction = db.transaction((cfg: any) => {
        for(const key in cfg) if (cfg[key as keyof SqlConfig] !== undefined) insert.run({ key, value: cfg[key as keyof SqlConfig] });
    });
    try {
        transaction(config);
    } catch (error) {
        console.error("Failed to save SQL config:", error);
    }
}

export async function getImportQueries(): Promise<ImportQuery[]> {
    const db = await getDb();
    try {
        return db.prepare('SELECT * FROM core_import_queries').all() as ImportQuery[];
    } catch (error) {
        console.error("Failed to get import queries:", error);
        return [];
    }
}

export async function saveImportQueries(queries: ImportQuery[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_import_queries (type, query) VALUES (@type, @query)');
    const transaction = db.transaction((qs) => { for (const q of qs) insert.run(q); });
    try {
        transaction(queries);
    } catch (error) {
        console.error("Failed to save import queries:", error);
    }
}

export async function testSqlConnection(): Promise<void> {
    await executeQuery("SELECT 1"); 
}

export async function getCabysCatalog(): Promise<{ code: string; description: string; taxRate: number; }[]> {
    const db = await getDb();
    return db.prepare('SELECT * FROM core_cabys_catalog').all() as { code: string; description: string; taxRate: number; }[];
}

export async function getSuggestions(): Promise<Suggestion[]> {
  const db = await getDb();
  const suggestions = db.prepare('SELECT * FROM core_suggestions ORDER BY timestamp DESC').all() as Suggestion[];
  return JSON.parse(JSON.stringify(suggestions));
}

export async function getUnreadSuggestions(): Promise<Suggestion[]> {
    const db = await getDb();
    const suggestions = db.prepare('SELECT * FROM core_suggestions WHERE isRead = 0 ORDER BY timestamp DESC').all() as Suggestion[];
    return JSON.parse(JSON.stringify(suggestions));
}

export async function getUnreadSuggestionsCount(): Promise<number> {
  const db = await getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM core_suggestions WHERE isRead = 0').get() as { count: number };
  return result.count;
}

export async function markSuggestionAsRead(id: number): Promise<void> {
  const db = await getDb();
  db.prepare('UPDATE core_suggestions SET isRead = 1 WHERE id = ?').run(id);
}

export async function deleteSuggestion(id: number): Promise<void> {
  const db = await getDb();
  db.prepare('DELETE FROM core_suggestions WHERE id = ?').run(id);
}

// --- Stock Functions ---

export async function getAllStock(): Promise<StockInfo[]> {
  const db = await getDb();
  try {
    const rows = db.prepare('SELECT * FROM core_stock').all() as { itemId: string; stockByWarehouse: string; totalStock: number }[];
    return rows.map(row => ({
      ...row,
      stockByWarehouse: JSON.parse(row.stockByWarehouse),
    }));
  } catch (error) {
    console.error("Failed to get all stock:", error);
    return [];
  }
}

export async function saveAllStock(stockData: { itemId: string, warehouseId: string, stock: number }[]): Promise<void> {
    const db = await getDb();
    const validProductIds = new Set(db.prepare('SELECT id FROM core_products').all().map((p: any) => p.id));
    const stockMap = new Map<string, { itemId: string, stockByWarehouse: { [key: string]: number }, totalStock: number }>();

    for (const item of stockData) {
        const normalizedItemId = item.itemId.toUpperCase();
        if (!validProductIds.has(normalizedItemId)) continue;
        
        if (!stockMap.has(normalizedItemId)) {
            stockMap.set(normalizedItemId, { itemId: normalizedItemId, stockByWarehouse: {}, totalStock: 0 });
        }
        const current = stockMap.get(normalizedItemId)!;
        current.stockByWarehouse[item.warehouseId] = item.stock;
        current.totalStock += item.stock;
    }

    const insert = db.prepare('INSERT OR REPLACE INTO core_stock (itemId, stockByWarehouse, totalStock) VALUES (?, ?, ?)');
    const transaction = db.transaction((data) => {
        db.prepare('DELETE FROM core_stock').run();
        for (const [itemId, info] of data.entries()) {
            insert.run(itemId, JSON.stringify(info.stockByWarehouse), info.totalStock);
        }
    });

    try {
        transaction(stockMap);
    } catch (error) {
        console.error("Failed to save all stock:", error);
        throw error;
    }
}

export async function getStockSettings(): Promise<StockSettings> {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT * FROM core_stock_settings').all() as { key: string; value: string }[];
        const settings: StockSettings = { warehouses: [] };
        for (const row of rows) {
            if (row.key === 'warehouses') {
                settings.warehouses = JSON.parse(row.value);
            }
        }
        return JSON.parse(JSON.stringify(settings));
    } catch (error) {
        console.error("Error getting stock settings:", error);
        return { warehouses: [] }; // Return default on error
    }
}

export async function saveStockSettings(settings: StockSettings): Promise<void> {
    await authorizeAction('admin:settings:stock');
    const db = await getDb();
    db.prepare('INSERT OR REPLACE INTO core_stock_settings (key, value) VALUES (?, ?)')
      .run('warehouses', JSON.stringify(settings.warehouses));
}

// --- Versioning ---
export async function getCurrentVersion(): Promise<string | null> {
    try {
        if (fs.existsSync(VERSION_FILE_PATH)) {
            const packageJsonContent = fs.readFileSync(VERSION_FILE_PATH, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            return packageJson.version || null;
        }
        return null;
    } catch (error) {
        console.error("Could not read package.json for version", error);
        return null;
    }
}

// --- Maintenance Functions ---

const backupDir = path.join(dbDirectory, UPDATE_BACKUP_DIR);

export async function backupAllForUpdate(): Promise<void> {
    // Run checkpoint BEFORE creating the backup.
    await runWalCheckpoint();
    
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    // Create a Windows-compatible timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const version = await getCurrentVersion() || 'unknown';
    
    const dbPath = path.join(dbDirectory, DB_FILE);
    if (fs.existsSync(dbPath)) {
        const backupPath = path.join(backupDir, `${timestamp}_v${version}_${DB_FILE}`);
        fs.copyFileSync(dbPath, backupPath);
    }
}

export async function listAllUpdateBackups(): Promise<UpdateBackupInfo[]> {
    if (!fs.existsSync(backupDir)) return [];
    const files = fs.readdirSync(backupDir).filter(f => f.includes('_v') && f.endsWith('.db'));
    const backupInfo = files.map(file => {
        const parts = file.split('_');
        const date = parts[0];
        const version = parts[1]?.startsWith('v') ? parts[1].substring(1) : 'unknown';
        const dbFile = version !== 'unknown' ? parts.slice(2).join('_') : parts.slice(1).join('_');
        
        const dbModule = DB_MODULES.find(m => m.dbFile === dbFile);
        return {
            moduleId: dbModule?.id || 'unknown',
            moduleName: dbModule?.name || 'Base de Datos Desconocida',
            fileName: file,
            date: date,
            version: version
        };
    }).sort((a, b) => b.date.localeCompare(a.date));
    return JSON.parse(JSON.stringify(backupInfo));
}

export async function restoreDatabase(moduleId: string, backupFile: File): Promise<void> {
    if (!moduleId || !backupFile) {
        throw new Error("Module ID and backup file are required.");
    }
    
    const dbModule = DB_MODULES.find(m => m.id === moduleId);
    if (!dbModule) throw new Error("Module not found");

    if (unifiedDbInstance && unifiedDbInstance.open) {
        unifiedDbInstance.close();
        unifiedDbInstance = null;
    }

    const dbPath = path.join(dbDirectory, dbModule.dbFile);
    const buffer = Buffer.from(await backupFile.arrayBuffer());
    fs.writeFileSync(dbPath, buffer);
    await getDb(); // Reconnect to validate
}

export async function restoreAllFromUpdateBackup(timestamp: string): Promise<void> {
    const backups = await listAllUpdateBackups();
    const backupsToRestore = backups.filter(b => b.date === timestamp);

    if (backupsToRestore.length === 0) {
        throw new Error("No se encontraron archivos de backup para la fecha y hora seleccionada.");
    }
    
    // First, close the active database connection
    if (unifiedDbInstance && unifiedDbInstance.open) {
        console.log(`Closing unified database connection before restore...`);
        unifiedDbInstance.close();
        unifiedDbInstance = null;
    }

    // Now, perform the file copy operations
    for (const backup of backupsToRestore) {
        const dbModule = DB_MODULES.find(m => m.id === backup.moduleId);
        if (dbModule) {
            const backupPath = path.join(backupDir, backup.fileName);
            const targetDbPath = path.join(dbDirectory, dbModule.dbFile);
            fs.copyFileSync(backupPath, targetDbPath);
            console.log(`Restored ${dbModule.dbFile} from ${backup.fileName}`);
        }
    }
}


export async function deleteOldUpdateBackups(): Promise<number> {
    const backups = await listAllUpdateBackups();
    const uniqueTimestamps = [...new Set(backups.map(b => b.date))].sort((a,b) => b.localeCompare(a));
    if (uniqueTimestamps.length <= 1) return 0;
    
    const timestampsToDelete = uniqueTimestamps.slice(1);
    let deletedCount = 0;
    for (const timestamp of timestampsToDelete) {
        const filesToDelete = fs.readdirSync(backupDir).filter(file => file.startsWith(timestamp));
        for (const file of filesToDelete) {
            fs.unlinkSync(path.join(backupDir, file));
            deletedCount++;
        }
    }
    return deletedCount;
}

export async function factoryReset(moduleId: string): Promise<void> {
    await addLog({ type: 'WARN', message: `FACTORY RESET triggered for module: ${moduleId}` });
    const db = await getDb();

    try {
        db.pragma('foreign_keys = OFF');
        
        const transaction = db.transaction(() => {
            if (moduleId === '__all__') {
                // Delete all core tables
                const coreTables = [
                    'core_users', 'core_roles', 'core_company_settings', 'core_logs', 'core_api_settings',
                    'core_analytics_settings', 'core_customers', 'core_products', 'core_exemptions',
                    'core_quote_drafts', 'core_exemption_laws', 'core_cabys_catalog', 'core_stock',
                    'core_sql_config', 'core_import_queries', 'core_suggestions', 'core_user_preferences',
                    'core_notifications', 'core_email_settings', 'core_suppliers', 'core_erp_order_headers',
                    'core_erp_order_lines', 'core_erp_purchase_order_headers', 'core_erp_purchase_order_lines',
                    'core_erp_invoice_headers', 'core_erp_invoice_lines', 'core_stock_settings',
                    'core_employees', 'core_departments', 'core_positions', 'core_payrolls', 'core_salespersons'
                ];
                for (const table of coreTables) {
                    db.prepare(`DELETE FROM ${table}`).run();
                }

                // Delete all warehouse tables
                Object.values(WAREHOUSE_TABLES).forEach(table => {
                    db.prepare(`DELETE FROM ${table}`).run();
                });

                // Clear Planner tables
                Object.values(PLANNER_TABLES).forEach(table => {
                    db.prepare(`DELETE FROM ${table}`).run();
                });

                // Clear Requests tables
                Object.values(REQUESTS_TABLES).forEach(table => {
                    db.prepare(`DELETE FROM ${table}`).run();
                });

                // Clear Consignments tables
                Object.values(CONSIGNMENTS_TABLES).forEach(table => {
                    db.prepare(`DELETE FROM ${table}`).run();
                });

                // Clear IT Tools tables
                Object.values(IT_TOOLS_TABLES).forEach(table => {
                    db.prepare(`DELETE FROM ${table}`).run();
                });

                // Clear Cost Assistant tables
                Object.values(COST_ASSISTANT_TABLES).forEach(table => {
                    db.prepare(`DELETE FROM ${table}`).run();
                });

                // Clear Operations tables
                Object.values(OPERATIONS_TABLES).forEach(table => {
                    db.prepare(`DELETE FROM ${table}`).run();
                });

                // Reset migrations
                db.prepare(`DELETE FROM _core_migrations`).run();
                db.prepare(`DELETE FROM _wh_migrations`).run();
                db.prepare(`DELETE FROM _planner_migrations`).run();
                db.prepare(`DELETE FROM _req_migrations`).run();
                db.prepare(`DELETE FROM _cs_migrations`).run();
                db.prepare(`DELETE FROM _it_migrations`).run();
                db.prepare(`DELETE FROM _cost_migrations`).run();
                db.prepare(`DELETE FROM _ops_migrations`).run();
            } else if (moduleId === 'core') {
                const coreTables = [
                    'core_users', 'core_roles', 'core_company_settings', 'core_logs', 'core_api_settings',
                    'core_analytics_settings', 'core_customers', 'core_products', 'core_exemptions',
                    'core_quote_drafts', 'core_exemption_laws', 'core_cabys_catalog', 'core_stock',
                    'core_sql_config', 'core_import_queries', 'core_suggestions', 'core_user_preferences',
                    'core_notifications', 'core_email_settings', 'core_suppliers', 'core_erp_order_headers',
                    'core_erp_order_lines', 'core_erp_purchase_order_headers', 'core_erp_purchase_order_lines',
                    'core_erp_invoice_headers', 'core_erp_invoice_lines', 'core_stock_settings',
                    'core_employees', 'core_departments', 'core_positions', 'core_payrolls', 'core_salespersons'
                ];
                for (const table of coreTables) {
                    db.prepare(`DELETE FROM ${table}`).run();
                }
                db.prepare('DELETE FROM _core_migrations WHERE module = ?').run('core');
            } else if (moduleId === 'warehouse') {
                 const warehouseTables = Object.values(WAREHOUSE_TABLES);
                for (const table of warehouseTables) {
                    db.prepare(`DELETE FROM ${table}`).run();
                }
                db.prepare('DELETE FROM _core_migrations WHERE module = ?').run('wh');
            }
            // Add other modules here as they are migrated
        });

        transaction();
        db.pragma('foreign_keys = ON');
        db.exec('VACUUM');
        
        // After reset, re-initialize
        await initializeAllModuleSchemas(db);
        
    } catch (e) {
        console.error(`Error during factory reset for module ${moduleId}`, e);
        db.pragma('foreign_keys = ON');
        throw e;
    }
}

// --- ERP Order Import ---
export async function saveAllErpOrderHeaders(headers: ErpOrderHeader[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_erp_order_headers (PEDIDO, ESTADO, CLIENTE, FECHA_PEDIDO, FECHA_PROMETIDA, ORDEN_COMPRA, TOTAL_UNIDADES, MONEDA_PEDIDO, USUARIO) VALUES (@PEDIDO, @ESTADO, @CLIENTE, @FECHA_PEDIDO, @FECHA_PROMETIDA, @ORDEN_COMPRA, @TOTAL_UNIDADES, @MONEDA_PEDIDO, @USUARIO)');
    
    const transaction = db.transaction((headersToSave: ErpOrderHeader[]) => {
        db.prepare('DELETE FROM core_erp_order_headers').run();
        for(const header of headersToSave) {
            // Sanitize data to ensure it's in a format SQLite can handle.
            const sanitizedHeader = {
                PEDIDO: String(header.PEDIDO),
                ESTADO: String(header.ESTADO),
                CLIENTE: String(header.CLIENTE).toUpperCase(),
                FECHA_PEDIDO: header.FECHA_PEDIDO instanceof Date ? header.FECHA_PEDIDO.toISOString() : String(header.FECHA_PEDIDO),
                FECHA_PROMETIDA: header.FECHA_PROMETIDA instanceof Date ? header.FECHA_PROMETIDA.toISOString() : String(header.FECHA_PROMETIDA),
                ORDEN_COMPRA: header.ORDEN_COMPRA || null,
                TOTAL_UNIDADES: header.TOTAL_UNIDADES || null,
                MONEDA_PEDIDO: header.MONEDA_PEDIDO || null,
                USUARIO: header.USUARIO || null
            };
            insert.run(sanitizedHeader);
        }
    });

    try {
        transaction(headers);
    } catch (error) {
        console.error("Failed to save ERP order headers:", error);
        throw error;
    }
}

export async function saveAllErpOrderLines(lines: ErpOrderLine[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_erp_order_lines (PEDIDO, PEDIDO_LINEA, ARTICULO, CANTIDAD_PEDIDA, PRECIO_UNITARIO) VALUES (@PEDIDO, @PEDIDO_LINEA, @ARTICULO, @CANTIDAD_PEDIDA, @PRECIO_UNITARIO)');
    const transaction = db.transaction((linesToSave) => {
        db.prepare('DELETE FROM core_erp_order_lines').run();
        for(const line of linesToSave) {
            const sanitizedLine = {
                ...line,
                ARTICULO: line.ARTICULO.toUpperCase()
            };
            insert.run(sanitizedLine);
        }
    });
    try {
        transaction(lines);
    } catch (error) {
        console.error("Failed to save ERP order lines:", error);
        throw error;
    }
}

export async function saveAllErpPurchaseOrderHeaders(headers: ErpPurchaseOrderHeader[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_erp_purchase_order_headers (ORDEN_COMPRA, PROVEEDOR, FECHA_HORA, ESTADO, CreatedBy) VALUES (@ORDEN_COMPRA, @PROVEEDOR, @FECHA_HORA, @ESTADO, @CreatedBy)');
    const transaction = db.transaction((headersToSave: ErpPurchaseOrderHeader[]) => {
        db.prepare('DELETE FROM core_erp_purchase_order_headers').run();
        for(const header of headersToSave) {
            const fechaHora = header.FECHA_HORA;
            const fechaHoraString = typeof fechaHora === 'object' && fechaHora !== null && 'toISOString' in fechaHora ? (fechaHora as Date).toISOString() : String(fechaHora);
            insert.run({
                ORDEN_COMPRA: header.ORDEN_COMPRA,
                PROVEEDOR: String(header.PROVEEDOR).toUpperCase(),
                FECHA_HORA: fechaHoraString,
                ESTADO: header.ESTADO,
                CreatedBy: header.CreatedBy || null
            });
        }
    });
    try {
        transaction(headers);
    } catch (error) {
        console.error("Failed to save ERP purchase order headers:", error);
        throw error;
    }
}

export async function saveAllErpPurchaseOrderLines(lines: ErpPurchaseOrderLine[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_erp_purchase_order_lines (ORDEN_COMPRA, ARTICULO, CANTIDAD_ORDENADA) VALUES (@ORDEN_COMPRA, @ARTICULO, @CANTIDAD_ORDENADA)');
    const transaction = db.transaction((linesToSave: ErpPurchaseOrderLine[]) => {
        db.prepare('DELETE FROM core_erp_purchase_order_lines').run();
        for(const line of linesToSave) {
            const sanitizedLine = {
                ...line,
                ARTICULO: line.ARTICULO.toUpperCase()
            };
            insert.run(sanitizedLine);
        }
    });
    try {
        transaction(lines);
    } catch (error) {
        console.error("Failed to save ERP purchase order lines:", error);
        throw error;
    }
}

export async function saveAllErpInvoiceHeaders(headers: ErpInvoiceHeader[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_erp_invoice_headers (FACTURA, CLIENTE, NOMBRE_CLIENTE, TIPO_DOCUMENTO, PEDIDO, FACTURA_ORIGINAL, FECHA, FECHA_ENTREGA, ANULADA, EMBARCAR_A, DIRECCION_FACTURA, OBSERVACIONES, RUTA, USUARIO, USUARIO_ANULA, ZONA, VENDEDOR, REIMPRESO) VALUES (@FACTURA, @CLIENTE, @NOMBRE_CLIENTE, @TIPO_DOCUMENTO, @PEDIDO, @FACTURA_ORIGINAL, @FECHA, @FECHA_ENTREGA, @ANULADA, @EMBARCAR_A, @DIRECCION_FACTURA, @OBSERVACIONES, @RUTA, @USUARIO, @USUARIO_ANULA, @ZONA, @VENDEDOR, @REIMPRESO)');
    const transaction = db.transaction((data: ErpInvoiceHeader[]) => {
        db.prepare('DELETE FROM core_erp_invoice_headers').run();
        for(const header of data) {
            const sanitizedHeader = {
                ...header,
                CLIENTE: String(header.CLIENTE).toUpperCase(),
                FECHA: header.FECHA instanceof Date ? header.FECHA.toISOString() : String(header.FECHA),
                FECHA_ENTREGA: header.FECHA_ENTREGA instanceof Date ? header.FECHA_ENTREGA.toISOString() : String(header.FECHA_ENTREGA),
            };
            insert.run(sanitizedHeader);
        }
    });
    transaction(headers);
}

export async function saveAllErpInvoiceLines(lines: ErpInvoiceLine[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_erp_invoice_lines (FACTURA, TIPO_DOCUMENTO, LINEA, BODEGA, PEDIDO, ARTICULO, ANULADA, FECHA_FACTURA, CANTIDAD, PRECIO_UNITARIO, TOTAL_IMPUESTO1, PRECIO_TOTAL, DESCRIPCION, DOCUMENTO_ORIGEN, CANT_DESPACHADA, ES_CANASTA_BASICA) VALUES (@FACTURA, @TIPO_DOCUMENTO, @LINEA, @BODEGA, @PEDIDO, @ARTICULO, @ANULADA, @FECHA_FACTURA, @CANTIDAD, @PRECIO_UNITARIO, @TOTAL_IMPUESTO1, @PRECIO_TOTAL, @DESCRIPCION, @DOCUMENTO_ORIGEN, @CANT_DESPACHADA, @ES_CANASTA_BASICA)');
    const transaction = db.transaction((data: ErpInvoiceLine[]) => {
        db.prepare('DELETE FROM core_erp_invoice_lines').run();
        for(const line of data) {
            const sanitizedLine = {
                ...line,
                ARTICULO: line.ARTICULO.toUpperCase(),
                FECHA_FACTURA: line.FECHA_FACTURA instanceof Date ? line.FECHA_FACTURA.toISOString() : String(line.FECHA_FACTURA),
            };
            insert.run(sanitizedLine);
        }
    });
    transaction(lines);
}

export async function saveAllEmployees(data: any[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_employees (EMPLEADO, NOMBRE, ACTIVO, DEPARTAMENTO, PUESTO, NOMINA) VALUES (@EMPLEADO, @NOMBRE, @ACTIVO, @DEPARTAMENTO, @PUESTO, @NOMINA)');
    const transaction = db.transaction((rows: any[]) => {
        db.prepare('DELETE FROM core_employees').run();
        for(const row of rows) insert.run(row);
    });
    transaction(data);
}


export async function saveAllDepartments(data: any[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_departments (DEPARTAMENTO, DESCRIPCION) VALUES (@DEPARTAMENTO, @DESCRIPCION)');
    const transaction = db.transaction((rows: any[]) => {
        db.prepare('DELETE FROM core_departments').run();
        for(const row of rows) insert.run(row);
    });
    transaction(data);
}

export async function saveAllPositions(data: any[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_positions (PUESTO, DESCRIPCION) VALUES (@PUESTO, @DESCRIPCION)');
    const transaction = db.transaction((rows: any[]) => {
        db.prepare('DELETE FROM core_positions').run();
        for(const row of rows) insert.run(row);
    });
    transaction(data);
}

export async function saveAllPayrolls(data: any[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_payrolls (NOMINA, DESCRIPCION, TIPO_NOMINA) VALUES (@NOMINA, @DESCRIPCION, @TIPO_NOMINA)');
    const transaction = db.transaction((rows: any[]) => {
        db.prepare('DELETE FROM core_payrolls').run();
        for(const row of rows) insert.run(row);
    });
    transaction(data);
}

export async function saveAllSalespersons(data: any[]): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_salespersons (VENDEDOR, NOMBRE, EMPLEADO) VALUES (@VENDEDOR, @NOMBRE, @EMPLEADO)');
    const transaction = db.transaction((rows: any[]) => {
        db.prepare('DELETE FROM core_salespersons').run();
        for(const row of rows) insert.run(row);
    });
    transaction(data);
}

export async function getAllErpPurchaseOrderHeaders(): Promise<ErpPurchaseOrderHeader[]> {
    const db = await getDb();
    try {
        const headers = db.prepare('SELECT * FROM core_erp_purchase_order_headers').all() as ErpPurchaseOrderHeader[];
        return JSON.parse(JSON.stringify(headers));
    } catch (error) {
        console.error("Failed to get all ERP purchase order headers:", error);
        return [];
    }
}

export async function getAllErpPurchaseOrderLines(): Promise<ErpPurchaseOrderLine[]> {
    const db = await getDb();
    try {
        return db.prepare('SELECT * FROM core_erp_purchase_order_lines').all() as ErpPurchaseOrderLine[];
    } catch (error) {
        console.error("Failed to get all ERP purchase order lines:", error);
        return [];
    }
}

export async function getErpInvoiceDetails(invoiceNumber: string): Promise<{ header: ErpInvoiceHeader, lines: ErpInvoiceLine[] } | null> {
    const db = await getDb();
    const header = db.prepare('SELECT * FROM core_erp_invoice_headers WHERE FACTURA = ?').get(invoiceNumber) as ErpInvoiceHeader | undefined;

    if (!header) {
        return null;
    }

    const lines = db.prepare('SELECT * FROM core_erp_invoice_lines WHERE FACTURA = ?').all(invoiceNumber) as ErpInvoiceLine[];

    return JSON.parse(JSON.stringify({ header, lines }));
}


// --- Notification Functions ---
export async function createNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>): Promise<void> {
  const db = await getDb();
  db.prepare('INSERT INTO core_notifications (userId, message, href, isRead, timestamp, entityId, entityType, taskType) VALUES (?, ?, ?, 0, ?, ?, ?, ?)')
    .run(notification.userId, notification.message, notification.href, new Date().toISOString(), notification.entityId, notification.entityType, notification.taskType);
}

export async function getNotifications(userId: number): Promise<Notification[]> {
  const db = await getDb();
  const notifications = db.prepare('SELECT * FROM core_notifications WHERE userId = ? ORDER BY timestamp DESC').all(userId) as Notification[];
  return JSON.parse(JSON.stringify(notifications));
}

export async function markNotificationsAsRead(notificationIds: number[], userId: number): Promise<void> {
  const db = await getDb();
  if (notificationIds.length === 0) return;
  const ids = notificationIds.map(() => '?').join(',');
  db.prepare(`UPDATE core_notifications SET isRead = 1 WHERE id IN (${ids}) AND userId = ?`).run(...notificationIds, userId);
}

export async function getNotificationById(id: number): Promise<Notification | null> {
    const db = await getDb();
    const notification = db.prepare('SELECT * FROM core_notifications WHERE id = ?').get(id) as Notification | null;
    return notification ? JSON.parse(JSON.stringify(notification)) : null;
}

export async function deleteNotificationById(id: number): Promise<void> {
    const db = await getDb();
    db.prepare('DELETE FROM core_notifications WHERE id = ?').run(id);
}


// --- User Preferences ---
export async function getUserPreferences(userId: number, key: string): Promise<any | null> {
    const db = await getDb();
    const row = db.prepare('SELECT value FROM core_user_preferences WHERE userId = ? AND key = ?').get(userId, key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
}

export async function saveUserPreferences(userId: number, key: string, value: any): Promise<void> {
    const db = await getDb();
    db.prepare('INSERT OR REPLACE INTO core_user_preferences (userId, key, value) VALUES (?, ?, ?)').run(userId, key, JSON.stringify(value));
}



export async function saveWizardSession(userId: number, sessionData: WizardSession): Promise<void> {
    const db = await getDb();
    db.prepare(`UPDATE core_users SET activeWizardSession = ? WHERE id = ?`).run(JSON.stringify(sessionData), userId);
}

export async function clearWizardSession(userId: number): Promise<void> {
    const db = await getDb();
    db.prepare(`UPDATE core_users SET activeWizardSession = NULL WHERE id = ?`).run(userId);
}

export async function getActiveWizardSession(userId: number): Promise<WizardSession | null> {
    const db = await getDb();
    const row = db.prepare(`SELECT activeWizardSession FROM core_users WHERE id = ?`).get(userId) as { activeWizardSession: string | null } | undefined;
    return row?.activeWizardSession ? JSON.parse(row.activeWizardSession) : null;
}

/**
 * Forces a WAL checkpoint on all open databases to consolidate data.
 * This is a server action intended to be called from the UI.
 */
export async function forceWalCheckpoint(): Promise<void> {
    await logInfo("Manual WAL checkpoint initiated by admin.");
    await runWalCheckpoint();
}

/**
 * Retrieves all warehouse-related data in a single batch.
 * This function is defined in `core` but fetches from the warehouse DB.
 * It's a temporary solution to a circular dependency problem and should be refactored.
 */
export async function getWarehouseData(): Promise<{ locations: WarehouseLocation[], inventory: WarehouseInventoryItem[], itemLocations: ItemLocation[], warehouseSettings: WarehouseSettings, stockSettings: StockSettings }> {
    // This is a temporary forwarder to the real function in the warehouse module
    // to avoid circular dependencies that were breaking the build.
    // The ideal solution is a more robust service locator or dependency injection pattern.
    const { getWarehouseData: getWarehouseDataFromModule } = await import('@/modules/warehouse/lib/db');
    return getWarehouseDataFromModule();
}

/**
 * Searches ERP invoices by client ID and a search term (invoice number or client name).
 */
export async function searchErpInvoices(clientId: string, searchTerm: string, limitToLast30Days: boolean): Promise<ErpInvoiceHeader[]> {
    const db = await getDb();
    let query = `
        SELECT FACTURA, CLIENTE, NOMBRE_CLIENTE, FECHA 
        FROM core_erp_invoice_headers 
        WHERE CLIENTE = ? AND (FACTURA LIKE ? OR NOMBRE_CLIENTE LIKE ?)
    `;
    const params: any[] = [clientId, `%${searchTerm}%`, `%${searchTerm}%`];

    if (limitToLast30Days) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query += ' AND FECHA >= ?';
        params.push(thirtyDaysAgo.toISOString());
    }

    query += ' ORDER BY FECHA DESC LIMIT 10';

    const results = db.prepare(query).all(...params) as ErpInvoiceHeader[];
    return JSON.parse(JSON.stringify(results));
}
