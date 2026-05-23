'use server';

import { getDb } from '@/modules/core/lib/db';
import { CORE_TABLE_NAMES } from '@/modules/core/lib/schema';
import { sendEmail } from '@/modules/core/lib/email-service';
import { sendTelegramMessage } from './telegram-service';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { checkPermissionInTree } from '@/modules/core/lib/permissions';
import { getAllNotificationRules, createInternalNotification } from './db';
import type { NotificationEventId } from '@/modules/core/types';

/**
 * Replaces placeholders in a template string using data from a payload.
 * Syntax: {{field}}
 * Supports simple {{#if field}}...{{/if}} logic for presence of fields.
 */
function applyTemplate(template: string, payload: Record<string, unknown>): string {
    if (!template) return '';
    
    // 1. Process IF blocks: {{#if field}}content{{/if}}
    const processed = template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, field, content) => {
        return !!payload[field] ? content : '';
    });

    // 2. Process standard placeholders: {{field}}
    return processed.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const val = payload[key];
        if (val === undefined || val === null) return match;
        
        // Format numbers if they look like currency or mileage
        if (typeof val === 'number') {
            return val.toLocaleString();
        }
        
        return String(val);
    });
}

/**
 * Determines which permission is required to be notified about an event.
 */
function getRequiredPermissionForEvent(eventId: string): string {
    if (eventId.startsWith('onTicket')) return 'tickets:read:all';
    if (eventId.startsWith('onProject')) return 'planner:read';
    if (eventId.startsWith('onLicense')) return 'licenses:read';
    if (eventId.startsWith('onFleet')) return 'fleet:access';
    if (eventId === 'onNewSuggestion') return 'admin:suggestions:read';
    return 'dashboard:access';
}

/**
 * Main entry point to trigger a notification flow.
 */
export async function triggerNotificationEvent(eventId: NotificationEventId, payload: Record<string, unknown>) {
    try {
        const db = await getDb();
        
        // 1. Get Template
        const template = db.prepare(`SELECT * FROM ${CORE_TABLE_NAMES.notificationTemplates} WHERE eventId = ?`).get(eventId) as {
            subject: string;
            body: string;
            telegram: string;
            internal: string;
        } | undefined;

        if (!template) {
            console.warn(`No template found for event: ${eventId}`);
            return;
        }

        // 2. Get Rules
        const allRules = await getAllNotificationRules();
        const matchingRules = allRules.filter(rule => rule.event === eventId && rule.enabled);

        // 3. Process Templates
        const subject = applyTemplate(template.subject, payload);
        const body = applyTemplate(template.body, payload);
        const telegram = applyTemplate(template.telegram, payload);
        const internal = applyTemplate(template.internal, payload);

        // 4. --- Internal App Notifications (Bell icon) ---
        const roles = db.prepare(`SELECT id, permissions FROM ${CORE_TABLE_NAMES.roles}`).all() as { id: string, permissions: string }[];
        const roleMap = new Map(roles.map(r => [r.id, JSON.parse(r.permissions)]));
        
        const allSystemUsers = db.prepare(`SELECT id, role FROM ${CORE_TABLE_NAMES.users}`).all() as { id: number, role: string }[];
        const requiredPerm = getRequiredPermissionForEvent(eventId);

        for (const targetUser of allSystemUsers) {
            const userPermissions = roleMap.get(targetUser.role) || [];
            if (checkPermissionInTree(userPermissions, requiredPerm)) {
                await createInternalNotification({
                    userId: targetUser.id,
                    message: internal,
                    href: getHrefForEvent(eventId, payload),
                    entityId: typeof payload.id === 'number' ? payload.id : undefined,
                    entityType: getEntityTypeForEvent(eventId)
                });
            }
        }

        // 5. --- External/Rule-Based Notifications ---
        if (matchingRules.length === 0) return;

        for (const rule of matchingRules) {
            const finalSubject = rule.subject || subject;
            const processedRecipients = rule.recipients.filter(Boolean);

            if (rule.action === 'sendEmail' && processedRecipients.length > 0) {
                await sendEmail({
                    to: processedRecipients,
                    subject: finalSubject,
                    html: body
                });
            } else if (rule.action === 'sendTelegram' && processedRecipients.length > 0) {
                for (const chatId of processedRecipients) {
                    await sendTelegramMessage(telegram, chatId);
                }
            }
        }

        await logInfo(`Notification Engine: Event '${eventId}' processed.`);
    } catch (error: any) {
        await logError('Notification Engine Error', { event: eventId, error: error.message });
    }
}

function getHrefForEvent(eventId: string, p: Record<string, unknown>): string {
    const v = p as Record<string, string | number>;
    switch (eventId) {
        case 'onFleetMaintenanceDue':
        case 'onFleetPermitExpiring':
        case 'onFleetOdometerAnomaly': return `/dashboard/fleet/vehicles/${v.vehicleId || v.id}`;
        case 'onNewSuggestion': return '/dashboard/admin/suggestions';
        default: return '/dashboard';
    }
}

function getEntityTypeForEvent(eventId: string): string {
    if (eventId.startsWith('onFleet')) return 'fleet';
    if (eventId === 'onNewSuggestion') return 'suggestion';
    return 'system';
}
