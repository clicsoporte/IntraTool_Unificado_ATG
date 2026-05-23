import { MASTER_SCHEMA } from "./master-schema";
import { logInfo, logError } from "./logger";

export type AuditResult = {
    table: string;
    status: 'ok' | 'missing_table' | 'missing_columns';
    missingColumns: string[];
};

/**
 * Runs a database integrity audit on a raw DB instance.
 */
export function auditDatabaseInstance(db: any): AuditResult[] {
    const results: AuditResult[] = [];

    for (const [tableName, expectedColumns] of Object.entries(MASTER_SCHEMA)) {
        try {
            const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
            
            if (tableInfo.length === 0) {
                results.push({ 
                    table: tableName, 
                    status: 'missing_table', 
                    missingColumns: expectedColumns 
                });
                continue;
            }

            const actualColumns = new Set(tableInfo.map((c: any) => c.name));
            const missing = expectedColumns.filter(col => !actualColumns.has(col));

            if (missing.length > 0) {
                results.push({ 
                    table: tableName, 
                    status: 'missing_columns', 
                    missingColumns: missing 
                });
            } else {
                results.push({ 
                    table: tableName, 
                    status: 'ok', 
                    missingColumns: [] 
                });
            }
        } catch (error: any) {
            results.push({ 
                table: tableName, 
                status: 'missing_table', 
                missingColumns: expectedColumns 
            });
        }
    }
    return results;
}

/**
 * Repairs missing columns and tables on a raw DB instance.
 */
export async function repairDatabaseInstance(db: any, results: AuditResult[]): Promise<{ fixed: string[], errors: string[] }> {
    const fixed: string[] = [];
    const errors: string[] = [];

    const columnIssues = results.filter(r => r.status === 'missing_columns');
    const tableIssues = results.filter(r => r.status === 'missing_table');
    
    // 1. Fix missing tables
    for (const issue of tableIssues) {
        try {
            const columnsDef = issue.missingColumns.map(col => `${col} TEXT`).join(', ');
            db.prepare(`CREATE TABLE IF NOT EXISTS ${issue.table} (${columnsDef})`).run();
            fixed.push(`${issue.table} (New Table)`);
        } catch (error: any) {
            errors.push(`Table ${issue.table}: ${error.message}`);
        }
    }

    // 2. Fix missing columns
    for (const issue of columnIssues) {
        for (const col of issue.missingColumns) {
            try {
                db.prepare(`ALTER TABLE ${issue.table} ADD COLUMN ${col} TEXT`).run();
                fixed.push(`${issue.table}.${col}`);
            } catch (error: any) {
                errors.push(`${issue.table}.${col}: ${error.message}`);
            }
        }
    }

    return { fixed, errors };
}
