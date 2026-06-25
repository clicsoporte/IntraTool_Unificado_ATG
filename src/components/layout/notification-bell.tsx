/**
 * @fileoverview A component for displaying a notification bell icon with a badge
 * and a dropdown list of recent notifications.
 */
"use client";

import { useAuth } from "@/modules/core/hooks/useAuth";
import { markNotificationAsRead, markAllNotificationsAsRead, executeNotificationAction, clearAllNotificationsAction, clearReadNotificationsAction } from "@/modules/core/lib/notifications-actions";
import { markSuggestionAsRead } from "@/modules/core/lib/suggestions-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, CheckCheck, MessageSquare, ThumbsUp, ThumbsDown, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Notification, ProductionOrderStatus, PurchaseRequestStatus } from "@/modules/core/types";
import { useToast } from "@/modules/core/hooks/use-toast";
import React, { useState } from "react";
import { Badge } from "../ui/badge";

const statusTranslations: { [key: string]: string } = {
  'canceled': 'Cancelada',
  'completed': 'Completada',
  'received-in-warehouse': 'En Bodega',
  'entered-erp': 'Ingresada ERP'
};

export function NotificationBell() {
    const { user, unreadNotificationsCount, notifications, fetchUnreadNotifications, unreadSuggestionsCount, updateUnreadSuggestionsCount } = useAuth();
    const { toast } = useToast();
    const [isActionLoading, setIsActionLoading] = useState<number | null>(null);
    const totalUnread = unreadNotificationsCount;

    const handleMarkAsRead = async (notification: Notification) => {
        if (!user || notification.isRead) return;
        // Simplified logic: only notifications from the main DB (with a number ID) can be marked as read this way.
        // Suggestion notifications are handled implicitly when the suggestions page is visited.
        if (typeof notification.id === 'number') {
            await markNotificationAsRead(notification.id, user.id);
        }
        await fetchUnreadNotifications();
    };

    const handleMarkAllAsRead = async () => {
        if (!user || unreadNotificationsCount === 0) return;
        await markAllNotificationsAsRead(user.id);
        await fetchUnreadNotifications();
    };

    const handleClearAll = async () => {
        if (!user || notifications.length === 0) return;
        if (confirm("¿Estás seguro de que deseas eliminar todas las notificaciones?")) {
            await clearAllNotificationsAction(user.id);
            await fetchUnreadNotifications();
            toast({ title: 'Notificaciones eliminadas', description: 'Se han borrado todas tus notificaciones.' });
        }
    };

    const handleClearRead = async () => {
        if (!user) return;
        await clearReadNotificationsAction(user.id);
        await fetchUnreadNotifications();
        toast({ title: 'Notificaciones leídas eliminadas', description: 'Se han borrado las notificaciones que ya habías leído.' });
    };

    const handleActionClick = async (e: React.MouseEvent, notification: Notification, action: 'approve' | 'reject') => {
        e.preventDefault(); // Prevent link navigation
        e.stopPropagation(); // Prevent parent onClick
        if (!user || typeof notification.id !== 'number') return;
        
        setIsActionLoading(notification.id);
        const result = await executeNotificationAction(notification.id, action, user.name, user.id);
        if (result.success) {
            toast({ title: 'Acción Realizada', description: result.message });
            await fetchUnreadNotifications(); // Refresh notifications
        } else {
            toast({ title: 'Error', description: result.message, variant: 'destructive' });
        }
        setIsActionLoading(null);
    };

    const renderActionButtons = (notification: Notification) => {
        if (notification.isRead || !notification.taskType || isActionLoading === notification.id) {
            return null;
        }

        if (notification.taskType.includes('cancellation-request')) {
            return (
                 <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={(e) => handleActionClick(e, notification, 'approve')}>
                        <ThumbsUp className="mr-1 h-3 w-3" /> Aprobar Cancelación
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={(e) => handleActionClick(e, notification, 'reject')}>
                        <ThumbsDown className="mr-1 h-3 w-3" /> Rechazar
                    </Button>
                 </div>
            );
        }
        return null;
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className={cn("h-5 w-5", totalUnread > 0 && "animate-pulse fill-yellow-400 text-yellow-600")} />
                    {totalUnread > 0 && (
                        <div className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                            {totalUnread}
                        </div>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0">
                <div className="p-4 border-b flex justify-between items-start">
                    <div>
                        <h4 className="font-medium leading-none">Notificaciones</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                            Tienes {totalUnread} {totalUnread === 1 ? 'notificación' : 'notificaciones'} sin leer.
                        </p>
                    </div>
                    {notifications.length > 0 && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" 
                            onClick={handleClearAll}
                            title="Eliminar todas las notificaciones"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                <ScrollArea className="h-80">
                    <div className="p-2 space-y-1">
                        {notifications.length > 0 ? notifications.map(n => (
                             <Link key={n.id} href={n.href} passHref>
                                <div className="p-2 rounded-md hover:bg-muted cursor-pointer" onClick={() => handleMarkAsRead(n)}>
                                    <div className="flex items-start gap-2">
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <p className={cn("text-sm", n.isRead === 0 && "font-bold")}>{n.message}</p>
                                                {n.entityStatus && ['canceled', 'completed', 'received-in-warehouse', 'entered-erp'].includes(n.entityStatus) && (
                                                    <Badge variant="secondary" className="ml-2 whitespace-nowrap">{statusTranslations[n.entityStatus] || n.entityStatus}</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true, locale: es })}
                                            </p>
                                            {isActionLoading === n.id ? (
                                                <div className="flex justify-center mt-2"><Loader2 className="h-5 w-5 animate-spin" /></div>
                                            ) : renderActionButtons(n)}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        )) : (
                            <p className="text-center text-sm text-muted-foreground py-8">No hay notificaciones.</p>
                        )}
                    </div>
                </ScrollArea>
                {notifications.length > 0 && (
                    <div className="p-2 border-t flex items-center justify-between text-xs">
                        {unreadNotificationsCount > 0 ? (
                            <Button variant="link" size="sm" onClick={handleMarkAllAsRead} className="h-8 px-2">
                                <CheckCheck className="mr-1 h-4 w-4" />
                                Marcar leídas
                            </Button>
                        ) : (
                            <span />
                        )}
                        {notifications.some(n => n.isRead) && (
                            <Button variant="ghost" size="sm" onClick={handleClearRead} className="h-8 px-2 text-muted-foreground hover:text-foreground">
                                Limpiar leídas
                            </Button>
                        )}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
