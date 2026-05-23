
/**
 * @fileoverview This file contains server-side functions specifically for reading
 * configuration from the database. It is separated to avoid circular dependencies.
 * ALL FUNCTIONS IN THIS FILE ARE SERVER-ONLY.
 */
"use server";

import { getDb } from '@/modules/core/lib/db';
import type { SqlConfig } from '@/modules/core/types';

/**
 * Retrieves the SQL Server connection configuration from the database.
 * @returns {Promise<SqlConfig | null>} The SQL configuration object, or null if not found.
 */
export async function getSqlConfig(): Promise<SqlConfig | null> {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT key, value FROM core_sql_config').all() as {key: string, value: string}[];
        if (!rows || rows.length === 0) {
            // If there's no config in the DB, it hasn't been saved yet.
            return null;
        }
        const config: Partial<SqlConfig> = {};
        for (const row of rows) {
            const key = row.key as keyof SqlConfig;
            if (key === 'port') {
                config[key] = Number(row.value);
            } else {
                config[key] = row.value;
            }
        }
        return config as SqlConfig;
    } catch (error) {
        console.error("Failed to get SQL config:", error);
        return null;
    }
}
