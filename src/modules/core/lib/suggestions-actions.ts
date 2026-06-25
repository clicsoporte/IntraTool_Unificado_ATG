/**
 * @fileoverview Server Actions specifically for handling user suggestions.
 * This file isolates the database logic for suggestions to prevent bundling issues.
 */
"use server";

import { revalidatePath } from 'next/cache';
import { 
    getSuggestions as dbGetSuggestions, 
    markSuggestionAsRead as dbMarkSuggestionAsRead, 
    deleteSuggestion as dbDeleteSuggestion, 
    getUnreadSuggestions as dbGetUnreadSuggestions,
    getUnreadSuggestionsCount as dbGetUnreadSuggestionsCount,
    getDb,
    addLog,
} from '@/modules/core/lib/db';
import type { Suggestion } from '@/modules/core/types';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { createNotificationForPermission } from '@/modules/core/lib/notifications-actions';

/**
 * Retrieves all suggestions from the database.
 * @returns {Promise<Suggestion[]>} A promise that resolves to an array of suggestion entries.
 */
export async function getSuggestions(): Promise<Suggestion[]> {
  return dbGetSuggestions();
}

/**
 * Marks a suggestion as read.
 * @param {number} id - The ID of the suggestion to mark as read.
 */
export async function markSuggestionAsRead(id: number): Promise<void> {
  await dbMarkSuggestionAsRead(id);
  revalidatePath('/dashboard/admin/suggestions');
}

/**
 * Deletes a suggestion from the database.
 * @param {number} id - The ID of the suggestion to delete.
 */
export async function deleteSuggestion(id: number): Promise<void> {
  await dbDeleteSuggestion(id);
  revalidatePath('/dashboard/admin/suggestions');
}

/**
 * Retrieves all unread suggestions from the database.
 * @returns {Promise<Suggestion[]>} A promise that resolves to an array of unread suggestion entries.
 */
export async function getUnreadSuggestions(): Promise<Suggestion[]> {
    return dbGetUnreadSuggestions();
}

/**
 * Retrieves the count of all unread suggestions.
 * @returns {Promise<number>} A promise that resolves to the number of unread suggestions.
 */
export async function getUnreadSuggestionsCount(): Promise<number> {
    return dbGetUnreadSuggestionsCount();
}

/**
 * Inserts a new suggestion into the database.
 * @param content - The text of the suggestion.
 * @param userId - The ID of the user submitting the suggestion.
 * @param userName - The name of the user submitting the suggestion.
 */
export async function addSuggestion(content: string, userId: number | null | undefined, userName: string): Promise<void> {
    const db = await getDb();
    let newSuggestionId;
    try {
        const dbUserId = (userId && userId !== 0) ? userId : null;
        const info = db.prepare(`
            INSERT INTO core_suggestions (content, userId, userName, isRead, timestamp)
            VALUES (?, ?, ?, 0, ?)
        `).run(content, dbUserId, userName, new Date().toISOString());
        newSuggestionId = info.lastInsertRowid;
        
        await logInfo('New suggestion submitted', { user: userName });
        
        revalidatePath('/dashboard/admin/suggestions');

    } catch (error: any) {
        logError("Failed to add suggestion to DB", { error: error.message });
        throw error;
    }

    if (newSuggestionId) {
        try {
            await createNotificationForPermission(
                'admin:suggestions:read',
                `Nueva sugerencia enviada por ${userName}`,
                '/dashboard/admin/suggestions',
                Number(newSuggestionId),
                'suggestion',
                'new-suggestion'
            );
        } catch (notificationError: any) {
            logError("Failed to create notification for new suggestion", { error: notificationError.message, suggestionId: newSuggestionId });
        }
    }
}

/**
 * Logs a global dashboard crash to both core_logs and core_suggestions.
 * @param errorMessage - The message of the error.
 * @param errorStack - The stack trace of the error.
 */
export async function logDashboardErrorAction(errorMessage: string, errorStack?: string): Promise<void> {
    try {
        // 1. Add to database logs (Visible in /dashboard/admin/logs)
        await addLog({
            type: 'ERROR',
            message: `⚠️ CRASH: Dashboard Error Boundary triggered`,
            details: {
                errorMessage,
                errorStack: errorStack || 'No stack trace provided'
            }
        });

        // 2. Submit as an automatic suggestion (Visible in /dashboard/admin/suggestions)
        const content = `🚨 [REPORTE AUTOMÁTICO DE ERROR]\nSe ha detectado un fallo inesperado en el dashboard.\n\n` +
            `• Error: ${errorMessage}\n` +
            `• Detalles: ${errorStack ? errorStack.substring(0, 500) + '...' : 'No hay detalles de pila.'}\n\n` +
            `Por favor, revise el Visor de Eventos en /dashboard/admin/logs para ver los detalles completos.`;
            
        await addSuggestion(content, null, 'Sistema (Fallo de Dashboard)');
        
        logInfo('Dashboard crash logged successfully to DB and Suggestions.', { error: errorMessage });
    } catch (e: any) {
        logError('Failed to log dashboard crash boundary:', { error: e.message });
    }
}
