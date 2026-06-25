import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { auditDatabaseInstance, repairDatabaseInstance } from './db-integrity';
import { logInfo, logWarn, logError } from './logger';
import { CORE_SCHEMA_VERSION, initializeCoreSchema, runCoreMigrations } from './schema';
import { initializeWarehouseSchema, runWarehouseMigrations } from '../../warehouse/lib/schema';
import { initializePlannerSchema } from '../../planner/lib/schema';
import { initializeRequestsSchema } from '../../requests/lib/schema';
import { initializeConsignmentsSchema } from '../../consignments/lib/schema';
import { initializeItToolsSchema } from '../../it-tools/lib/schema';
import { initializeCostAssistantSchema } from '../../cost-assistant/lib/schema';
import { initializeOperationsSchema } from '../../operations/lib/schema';
import { initializeFleetSchema } from '../../fleet/lib/schema';
import { initializeInventorySchema } from '../../inventory/lib/schema';
import { initializeNotificationDefaults } from '../../notifications/lib/db';

export const DB_FILE = 'clic_tools.db';
export const dbDirectory = path.join(process.cwd(), 'dbs');

let unifiedDbInstance: Database.Database | null = null;
let initializationPromise: Promise<Database.Database> | null = null;

export function closeDbConnection(): void {
    if (unifiedDbInstance && unifiedDbInstance.open) {
        try {
            unifiedDbInstance.pragma('wal_checkpoint(TRUNCATE)');
            unifiedDbInstance.close();
            console.log("[DB Connection] Closed successfully via helper.");
        } catch (err) {
            console.error("[DB Connection] Error closing connection:", err);
        }
        unifiedDbInstance = null;
        initializationPromise = null;
    }
}

function autoLinkEmployeesAndUsers(db: Database.Database): void {
    try {
        const users = db.prepare("SELECT id, name, employeeId FROM core_users WHERE employeeId IS NULL").all() as any[];
        const employees = db.prepare("SELECT EMPLEADO as id, NOMBRE as name FROM core_employees").all() as any[];

        if (users.length === 0 || employees.length === 0) return;

        const normalize = (str: string) => {
            return str.toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9 ]/g, "")
                .trim();
        };

        const updateStmt = db.prepare("UPDATE core_users SET employeeId = ? WHERE id = ?");
        
        db.transaction(() => {
            for (const user of users) {
                const uNorm = normalize(user.name);
                const uWords = uNorm.split(/\s+/).filter(w => w.length > 2);

                if (uWords.length === 0) continue;

                let bestMatch = null;
                let maxMatches = 0;

                for (const emp of employees) {
                    const eNorm = normalize(emp.name);
                    const eWords = eNorm.split(/\s+/);

                    let matchCount = 0;
                    for (const w of uWords) {
                        if (eWords.includes(w)) {
                            matchCount++;
                        }
                    }

                    if (matchCount > maxMatches) {
                        maxMatches = matchCount;
                        bestMatch = emp;
                    }
                }

                const threshold = Math.min(uWords.length, 2);
                if (bestMatch && maxMatches >= threshold) {
                    updateStmt.run(bestMatch.id, user.id);
                }
            }
        })();
    } catch (e: any) {
        console.error("[DB Self-Healing] Error auto-linking employees and users:", e.message);
    }
}

export async function initializeAllModuleSchemas(db: Database.Database) {
    try {
        initializeCoreSchema(db);
        await runCoreMigrations(db);

        try {
            const tableInfo = db.prepare("PRAGMA table_info('core_company_settings')").all();
            const columnExists = tableInfo.some((col: any) => col.name === 'timeZone');
            if (!columnExists) {
                db.exec(`ALTER TABLE core_company_settings ADD COLUMN timeZone TEXT DEFAULT 'America/Costa_Rica';`);
                console.log("[DB Self-Healing] Added missing 'timeZone' column to 'core_company_settings'.");
            }
        } catch (e: any) {
            console.error("[DB Self-Healing] Failed to ensure timeZone column:", e.message);
        }
        
        autoLinkEmployeesAndUsers(db);

        await initializeWarehouseSchema(db);
        await runWarehouseMigrations(db);
        await initializePlannerSchema(db);
        await initializeRequestsSchema(db);
        await initializeConsignmentsSchema(db);
        await initializeItToolsSchema(db);
        await initializeCostAssistantSchema(db);
        await initializeOperationsSchema(db);
        await initializeFleetSchema(db);
        await initializeInventorySchema(db);
        await initializeNotificationDefaults(db);
        
        console.log('All module schemas initialized successfully.');
    } catch (error: any) {
        console.error("❌ Schema synchronization failed:", error.message);
        throw error;
    }
}

async function runSelfHealing(db: Database.Database) {
    try {
        const currentVersionRow = db.prepare(`SELECT version FROM _core_migrations WHERE module = 'core'`).get() as { version: number } | undefined;
        const currentVersion = currentVersionRow ? currentVersionRow.version : 0;

        if (currentVersion > 0 && currentVersion < CORE_SCHEMA_VERSION) {
            console.log(`[DB] Detectada nueva versión de software (${currentVersion} -> ${CORE_SCHEMA_VERSION}). Iniciando auto-reparación de esquema...`);
            
            const results = auditDatabaseInstance(db);
            const { fixed, errors } = await repairDatabaseInstance(db, results);
            
            if (fixed.length > 0) {
                console.log(`[DB] Auto-reparación completada. Se aplicaron ${fixed.length} cambios:`, fixed);
            }
            
            if (errors.length > 0) {
                console.error(`[DB] Errores durante la auto-reparación:`, errors);
            }

            db.prepare(`INSERT OR REPLACE INTO _core_migrations (module, version) VALUES ('core', ?)`).run(CORE_SCHEMA_VERSION);
            console.log(`[DB] Versión de base de datos actualizada a ${CORE_SCHEMA_VERSION}`);
        }
    } catch (e: any) {
        console.error("[DB] No se pudo ejecutar la auto-reparación:", e.message);
    }
}

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

            db.pragma('journal_mode = WAL');
            db.pragma('synchronous = NORMAL');
            db.pragma('foreign_keys = ON');
            db.pragma('busy_timeout = 10000');
            db.pragma('journal_size_limit = 67108864');

            try {
                const check = db.pragma('integrity_check(1)') as any[];
                if (check && check.length > 0 && check[0].integrity_check !== 'ok') {
                    console.error("⚠️ Database integrity check failed:", check);
                }
            } catch (e) {
                console.error("Failed to run integrity check:", e);
            }

            db.exec(`
                CREATE TABLE IF NOT EXISTS _core_migrations (
                    module TEXT PRIMARY KEY,
                    version INTEGER NOT NULL,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await runSelfHealing(db);
            await initializeAllModuleSchemas(db);

            unifiedDbInstance = db;

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
            initializationPromise = null;
            console.error("❌ Failed to initialize database:", error.message);
            throw error;
        }
    })();

    return initializationPromise;
}

export function getDbSync(): Database.Database {
    if (!unifiedDbInstance || !unifiedDbInstance.open) {
        const dbPath = path.join(dbDirectory, DB_FILE);
        unifiedDbInstance = new Database(dbPath);
        unifiedDbInstance.pragma('journal_mode = WAL');
        unifiedDbInstance.pragma('synchronous = NORMAL');
        unifiedDbInstance.pragma('foreign_keys = ON');
        unifiedDbInstance.pragma('busy_timeout = 10000');
    }
    return unifiedDbInstance;
}

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
