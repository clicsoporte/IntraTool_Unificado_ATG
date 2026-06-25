'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { 
    getAssignedDeliveriesToday, 
    getActiveAssignmentsToday, 
    getDeliverySettings 
} from '@/modules/operations/lib/actions';
import { getCurrentUser, getUserPreferenceAction, saveUserPreferenceAction } from '@/modules/core/lib/auth';

export function useDeliveriesMonitor() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(30); // Default 30s

    // Operational State
    const [assignments, setAssignments] = useState<any[]>([]);
    const [deliveries, setDeliveries] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>({
        delivery_mode: 'sencillo',
        release_codes_enabled: 'false'
    });

    const [showCompletedToday, setShowCompletedToday] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Sort assignments: active (activa === 1) first, completed (activa === 0) last
    const sortedAssignments = useMemo(() => {
        return [...(assignments || [])].sort((a, b) => b.activa - a.activa);
    }, [assignments]);

    // Load active/completed daily data
    const loadData = useCallback(async (includeCompleted: boolean, showSkeleton = false) => {
        if (showSkeleton) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        try {
            const [a, d, s] = await Promise.all([
                getActiveAssignmentsToday(includeCompleted),
                getAssignedDeliveriesToday(includeCompleted),
                getDeliverySettings(),
            ]);
            setAssignments(a || []);
            setDeliveries(d || []);
            if (s) setSettings(s);
        } catch (e: any) {
            toast({
                title: 'Error de carga',
                description: 'No se pudieron recuperar las entregas activas.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [toast]);

    const silentRefresh = useCallback(async (includeCompleted: boolean) => {
        setRefreshing(true);
        try {
            const [a, d, s] = await Promise.all([
                getActiveAssignmentsToday(includeCompleted),
                getAssignedDeliveriesToday(includeCompleted),
                getDeliverySettings(),
            ]);
            setAssignments(a || []);
            setDeliveries(d || []);
            if (s) setSettings(s);
        } catch (e) {
            console.error('Silent refresh failed:', e);
        } finally {
            setRefreshing(false);
        }
    }, []);

    // Load User Preferences on Mount
    useEffect(() => {
        async function fetchUserAndPreferences() {
            try {
                const user = await getCurrentUser();
                if (user) {
                    setCurrentUser(user);
                    const pref = await getUserPreferenceAction(user.id, 'deliveries_show_completed');
                    if (pref !== null) {
                        setShowCompletedToday(!!pref);
                    }
                }
            } catch (err) {
                console.error("Error loading user preferences:", err);
            }
        }
        fetchUserAndPreferences();
    }, []);

    // Load active data reactively when switch state changes
    useEffect(() => {
        loadData(showCompletedToday, false);
    }, [loadData, showCompletedToday]);

    const toggleShowCompletedToday = useCallback(async (checked: boolean) => {
        setShowCompletedToday(checked);
        if (currentUser) {
            try {
                await saveUserPreferenceAction(currentUser.id, 'deliveries_show_completed', checked);
                toast({
                    title: 'Preferencia guardada',
                    description: checked 
                        ? 'Ahora se muestran las rutas completadas.' 
                        : 'Se ocultaron las rutas completadas.',
                });
            } catch (err) {
                console.error("Failed to save preference:", err);
            }
        }
    }, [currentUser, toast]);

    return {
        loading,
        setLoading,
        refreshing,
        setRefreshing,
        refreshIntervalSec,
        setRefreshIntervalSec,
        assignments,
        setAssignments,
        deliveries,
        setDeliveries,
        settings,
        setSettings,
        showCompletedToday,
        setShowCompletedToday,
        currentUser,
        setCurrentUser,
        sortedAssignments,
        loadData,
        silentRefresh,
        toggleShowCompletedToday
    };
}
