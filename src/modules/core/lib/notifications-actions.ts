/**
 * @fileoverview Server Actions for the notification system.
 */
"use server";

import { revalidatePath } from 'next/cache';
import { getNotifications as dbGetNotifications, markNotificationsAsRead as dbMarkAsRead, createNotification as dbCreateNotification, getNotificationById, deleteNotificationById, getAllRoles as getAllRolesFromDb, clearAllNotifications as dbClearAllNotifications, clearReadNotifications as dbClearReadNotifications } from './db';
import { getAllUsers as dbGetAllUsers } from './auth';
import type { Notification, User, ProductionOrderStatus, PurchaseRequestStatus } from '../types';
import { updateStatus as updatePlannerStatus, confirmModification } from '@/modules/planner/lib/db';
import { updateStatus as updateRequestStatus, updatePendingAction } from '@/modules/requests/lib/db';
import { logError } from './logger';

export async function clearAllNotificationsAction(userId: number): Promise<void> {
    await dbClearAllNotifications(userId);
    revalidatePath('/dashboard');
}

export async function clearReadNotificationsAction(userId: number): Promise<void> {
    await dbClearReadNotifications(userId);
    revalidatePath('/dashboard');
}



/**
 * Creates a new notification for a single user.
 * @param notificationData - The data for the notification.
 */
export async function createNotification(notificationData: Omit<Notification, 'id' | 'timestamp' | 'isRead'>): Promise<void> {
    await dbCreateNotification(notificationData);
}

/**
 * Creates a notification for all users who have a specific permission.
 * @param permission - The permission string required to receive the notification.
 * @param message - The notification message.
 * @param href - An optional URL for the notification to link to.
 * @param entityId - The ID of the entity this notification relates to (e.g., order ID).
 * @param entityType - The type of entity (e.g., 'production-order').
 * @param taskType - A specific identifier for the task (e.g., 'approve').
 */
export async function createNotificationForPermission(
    permission: string, 
    message: string, 
    href: string,
    entityId: number,
    entityType: string,
    taskType: string
): Promise<void> {
    const [allUsers, allRoles] = await Promise.all([dbGetAllUsers(), getAllRolesFromDb()]);
    
    // Get roles that have this permission.
    const relevantRoleIds = allRoles
        .filter(role => role.id === 'admin' || role.permissions.includes(permission))
        .map(role => role.id);
    
    // Find all users who have one of the relevant roles.
    const targetUsers = allUsers.filter((user: User) => 
        relevantRoleIds.includes(user.role)
    );

    for (const user of targetUsers) {
        await dbCreateNotification({ 
            userId: user.id, 
            message, 
            href,
            entityId,
            entityType,
            taskType,
        });
    }
}


/**
 * Fetches all unread notifications for a specific user.
 * @param userId - The ID of the user.
 * @returns A promise that resolves to an array of notifications.
 */
export async function getNotificationsForUser(userId: number): Promise<Notification[]> {
    return dbGetNotifications(userId);
}

/**
 * Marks a specific notification as read.
 * @param notificationId - The ID of the notification to mark as read.
 * @param userId - The ID of the user who owns the notification, for security.
 */
export async function markNotificationAsRead(notificationId: number, userId: number): Promise<void> {
    await dbMarkAsRead([notificationId], userId);
    revalidatePath('/dashboard');
}

/**
 * Marks all of a user's notifications as read.
 * @param userId - The ID of the user whose notifications should be marked as read.
 */
export async function markAllNotificationsAsRead(userId: number): Promise<void> {
    const notifications = await dbGetNotifications(userId);
    const unreadIds = notifications.filter(n => !n.isRead && typeof n.id === 'number').map(n => n.id as number);
    if (unreadIds.length > 0) {
        await dbMarkAsRead(unreadIds, userId);
        revalidatePath('/dashboard');
    }
}

/**
 * Executes a specific action related to a notification, like approving or rejecting a request.
 * @param notificationId - The ID of the notification triggering the action.
 * @param actionType - The action to perform ('approve' or 'reject').
 * @param updatedBy - The name of the user performing the action.
 * @param userId - The ID of the user performing the action (for validation).
 */
export async function executeNotificationAction(notificationId: number, actionType: 'approve' | 'reject', updatedBy: string, userId: number): Promise<{ success: boolean, message: string }> {
    const notification = await getNotificationById(notificationId);

    if (!notification || notification.userId !== userId) {
        return { success: false, message: 'Notificación no encontrada o no autorizada.' };
    }
    
    if (!notification.entityId || !notification.entityType || !notification.taskType) {
        return { success: false, message: 'La notificación no es accionable.' };
    }

    try {
        let originalRequester: User | null = null;
        let targetStatus: ProductionOrderStatus | PurchaseRequestStatus;

        if (notification.entityType === 'production-order') {
            const currentOrder = await confirmModification(notification.entityId, updatedBy); // Dummy call to get order, should be a get function
            originalRequester = await getUserByName(currentOrder.requestedBy);

            if (notification.taskType === 'cancellation-request') {
                await updatePendingAction({
                    entityId: notification.entityId,
                    action: 'none',
                    notes: `Solicitud de cancelación ${actionType === 'approve' ? 'aprobada' : 'rechazada'} por ${updatedBy} desde notificación.`,
                    updatedBy,
                });
                
                if (actionType === 'approve') {
                     await updatePlannerStatus({
                        orderId: notification.entityId,
                        status: 'canceled',
                        notes: `Cancelación aprobada por ${updatedBy}.`,
                        updatedBy,
                        reopen: false
                    });
                }
            }
        } else if (notification.entityType === 'purchase-request') {
            const currentRequest = await updatePendingAction({ entityId: notification.entityId, action: 'none', notes: '', updatedBy }); // Dummy call to get order details
            originalRequester = await getUserByName(currentRequest.requestedBy);

             if (notification.taskType === 'cancellation-request') {
                await updatePendingAction({
                    entityId: notification.entityId,
                    action: 'none',
                    notes: `Solicitud de cancelación ${actionType === 'approve' ? 'aprobada' : 'rechazada'} por ${updatedBy} desde notificación.`,
                    updatedBy,
                });

                if (actionType === 'approve') {
                    await updateRequestStatus({
                        requestId: notification.entityId,
                        status: 'canceled',
                        notes: `Cancelación aprobada por ${updatedBy}.`,
                        updatedBy,
                        reopen: false
                    });
                }
            }
        }

        if (actionType === 'reject' && originalRequester && originalRequester.id !== userId) {
            await createNotification({
                userId: originalRequester.id,
                message: `Tu solicitud para la entidad #${notification.entityId} fue rechazada por ${updatedBy}.`,
                href: notification.href,
            });
        }

        // Action was successful, delete the notification as it's been handled.
        await deleteNotificationById(notificationId);
        revalidatePath('/dashboard'); // Revalidate to update UI everywhere
        return { success: true, message: 'Acción completada.' };

    } catch (error: any) {
        logError('Error executing notification action', { error: error.message, notificationId, actionType });
        return { success: false, message: 'Error al procesar la acción.' };
    }
}


async function getUserByName(name: string): Promise<User | null> {
    const allUsers = await dbGetAllUsers();
    return allUsers.find(u => u.name === name) || null;
}
