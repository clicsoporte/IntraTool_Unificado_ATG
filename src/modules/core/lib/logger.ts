
/**
 * @fileoverview Centralized logging functions that interact with the database logger.
 * These server-side functions abstract away the direct database calls, providing a clean API
 * for logging different types of events (Info, Warn, Error), and automatically enrich logs
 * with user and request context.
 */
"use server";

import { addLog as dbAddLog, getLogs as dbGetLogs, clearLogs as dbClearLogs } from '@/modules/core/lib/db';
import type { LogEntry, DateRange } from "@/modules/core/types";
import { headers } from 'next/headers';
import { getCurrentUser } from './auth';
import { authorizeAction } from './auth-guard';


/**
 * Enriches log details with user and request context.
 * This is an internal helper function.
 * @param details The original details object.
 * @returns The enriched details object.
 */
async function enrichLogDetails(details?: any): Promise<Record<string, any>> {
    let normalizedDetails: Record<string, any> = {};
    if (details) {
        if (typeof details === 'string') {
            normalizedDetails = { errorMsg: details };
        } else if (details instanceof Error) {
            normalizedDetails = { errorMsg: details.message, stack: details.stack };
        } else if (typeof details === 'object') {
            normalizedDetails = { ...details };
        } else {
            normalizedDetails = { value: String(details) };
        }
    }
    const enrichedDetails = normalizedDetails;
    
    try {
        const user = await getCurrentUser();
        if (user) {
            enrichedDetails.user = { id: user.id, name: user.name, role: user.role };
        }
    } catch (e) {
        // Ignore errors, as logging might happen outside a user session
    }

    try {
        const headerList = headers();
        enrichedDetails.request = {
            ip: headerList.get("x-forwarded-for") || "N/A",
            host: headerList.get("host") || "N/A",
            userAgent: headerList.get("user-agent") || "N/A",
        };
    } catch (e) {
        // Ignore errors, as headers() might not be available in all contexts
    }

    return enrichedDetails;
}


/**
 * Logs an informational message.
 * @param message The main message to log.
 * @param details Optional structured data to include.
 */
export async function logInfo(message: string, details?: Record<string, any>) {
    const enrichedDetails = await enrichLogDetails(details);
    await dbAddLog({ type: "INFO", message, details: enrichedDetails });
}

/**
 * Logs a warning message.
 * @param message The warning message to log.
 * @param details Optional structured data to include.
 */
export async function logWarn(message: string, details?: Record<string, any>) {
    const enrichedDetails = await enrichLogDetails(details);
    await dbAddLog({ type: "WARN", message, details: enrichedDetails });
}

/**
 * Logs an error message.
 * @param context A string describing the context where the error occurred.
 * @param details Optional structured data, often including the error object.
 */
export async function logError(context: string, details?: Record<string, any>) {
    const enrichedDetails = await enrichLogDetails(details);
    // Ensure error objects are properly serialized to capture message and stack
    if (enrichedDetails.error && typeof enrichedDetails.error === 'object') {
        enrichedDetails.error = {
            message: enrichedDetails.error.message,
            stack: enrichedDetails.error.stack,
            ...enrichedDetails.error
        };
    }
    await dbAddLog({ type: "ERROR", message: context, details: enrichedDetails });
}

/**
 * Retrieves logs from the database based on specified filters.
 * @param filters Optional filters for log type, search term, and date range.
 * @returns A promise that resolves to an array of log entries.
 */
export async function getLogs(filters: {
    type?: 'operational' | 'system' | 'all';
    search?: string;
    dateRange?: DateRange;
} = {}): Promise<LogEntry[]> {
  // This is a read action, but we still protect it to ensure only authorized users can view logs.
  await authorizeAction('admin:logs:read');
  return await dbGetLogs(filters);
}

/**
 * Clears logs from the database based on specified criteria.
 * This is a protected server action that requires 'admin:logs:clear' permission.
 * @param {'operational' | 'system' | 'all'} type - The type of logs to clear.
 * @param {boolean} deleteAllTime - If true, ignores the 30-day retention period and deletes all specified logs.
 */
export async function clearLogs(userName: string, type: 'operational' | 'system' | 'all', deleteAllTime: boolean) {
    const user = await authorizeAction('admin:logs:clear');
    return await dbClearLogs(user.name, type, deleteAllTime);
}
