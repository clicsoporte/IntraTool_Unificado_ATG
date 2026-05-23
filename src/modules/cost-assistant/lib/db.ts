/**
 * @fileoverview Server-side functions for the cost assistant database.
 * This file handles all direct interactions with the unified database.
 */
"use server";

import { getDb } from '@/modules/core/lib/db';
import type { CostAnalysisDraft, CostAssistantSettings } from '@/modules/core/types';
import { COST_ASSISTANT_TABLES } from './schema';
import { authorizeAction } from '@/modules/core/lib/auth-guard';

// Unified DB configuration

export async function getAllDrafts(userId: number): Promise<CostAnalysisDraft[]> {
    const db = await getDb();
    try {
        const rows = db.prepare(`SELECT * FROM ${COST_ASSISTANT_TABLES.drafts} WHERE userId = ? ORDER BY createdAt DESC`).all(userId) as any[];
        return rows.map(row => {
            const data = JSON.parse(row.data);
            return {
                id: row.id,
                userId: row.userId,
                name: row.name,
                createdAt: row.createdAt,
                ...data
            };
        });
    } catch (error) {
        console.error("Failed to get cost assistant drafts:", error);
        return [];
    }
}

export async function saveDraft(draft: Omit<CostAnalysisDraft, 'id' | 'createdAt'>, draftPrefix: string, nextDraftNumber: number): Promise<CostAnalysisDraft> {
    await authorizeAction('cost-assistant:drafts:read-write');
    const db = await getDb();
    const id = `${draftPrefix}${String(nextDraftNumber).padStart(5, '0')}`;
    const createdAt = new Date().toISOString();
    
    const { userId, name, ...dataToStore } = draft;

    db.prepare(`
        INSERT OR REPLACE INTO ${COST_ASSISTANT_TABLES.drafts} (id, userId, name, data, createdAt)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, name, JSON.stringify(dataToStore), createdAt);

    // Increment the draft number
    db.prepare(`UPDATE ${COST_ASSISTANT_TABLES.settings} SET value = ? WHERE key = 'nextDraftNumber'`).run(nextDraftNumber + 1);
    
    return { id, createdAt, ...draft };
}

export async function deleteDraft(id: string): Promise<void> {
    await authorizeAction('cost-assistant:drafts:read-write');
    const db = await getDb();
    db.prepare(`DELETE FROM ${COST_ASSISTANT_TABLES.drafts} WHERE id = ?`).run(id);
}


export async function getNextDraftNumber(): Promise<number> {
    const settings = await getCostAssistantDbSettings();
    return settings.nextDraftNumber || 1;
}

export async function getCostAssistantDbSettings(): Promise<Partial<CostAssistantSettings>> {
    const db = await getDb();
    const settings: Partial<CostAssistantSettings> = {};
    try {
        const rows = db.prepare(`SELECT key, value FROM ${COST_ASSISTANT_TABLES.settings}`).all() as {key: string, value: string}[];
        for (const row of rows) {
            if (row.key === 'draftPrefix') {
                settings.draftPrefix = row.value;
            } else if (row.key === 'nextDraftNumber') {
                settings.nextDraftNumber = Number(row.value);
            }
        }
    } catch (error) {
        console.error("Error fetching cost assistant DB settings:", error);
        // Return default values if reading fails, but the table should now exist.
        return { draftPrefix: 'AC-', nextDraftNumber: 1 };
    }
    return settings;
}

export async function saveCostAssistantDbSettings(settings: Partial<CostAssistantSettings>): Promise<void> {
    await authorizeAction('admin:settings:cost-assistant');
    const db = await getDb();
    const transaction = db.transaction(() => {
        if (settings.draftPrefix !== undefined) {
            db.prepare(`INSERT OR REPLACE INTO ${COST_ASSISTANT_TABLES.settings} (key, value) VALUES ('draftPrefix', ?)`).run(settings.draftPrefix);
        }
        if (settings.nextDraftNumber !== undefined) {
            db.prepare(`INSERT OR REPLACE INTO ${COST_ASSISTANT_TABLES.settings} (key, value) VALUES ('nextDraftNumber', ?)`).run(settings.nextDraftNumber);
        }
    });
    transaction();
}
