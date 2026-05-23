"use server";

import { getDb } from "./db";
import { MASTER_SCHEMA } from "./master-schema";
import { logInfo, logError } from "./logger";
import { auditDatabaseInstance, repairDatabaseInstance, AuditResult } from "./db-integrity";

export type { AuditResult };

/**
 * Runs a full database integrity audit comparing the physical SQLite schema 
 * against the MASTER_SCHEMA definition.
 */
export async function runDatabaseAudit(): Promise<AuditResult[]> {
    try {
        const db = await getDb();
        const results = auditDatabaseInstance(db);

        await logInfo("Auditoría de integridad de base de datos completada", { 
            totalTables: Object.keys(MASTER_SCHEMA).length,
            issues: results.filter(r => r.status !== 'ok').length 
        });

        return JSON.parse(JSON.stringify(results));
    } catch (error: any) {
        await logError("Fallo crítico en la auditoría de base de datos", { error: error.message });
        throw error;
    }
}

/**
 * Attempts to repair missing columns in the database.
 * NOTE: This only adds columns, it doesn't delete or modify existing ones.
 */
export async function repairDatabaseSchema(results: AuditResult[]): Promise<{ success: boolean, fixed: string[], errors: string[] }> {
    const db = await getDb();
    const { fixed, errors } = await repairDatabaseInstance(db, results);

    if (fixed.length > 0) {
        await logInfo("Reparación de esquema completada", { fixed, errors });
    }

    return { 
        success: errors.length === 0, 
        fixed, 
        errors 
    };
}
