'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { 
    getAssignedDeliveriesToday, 
    getActiveAssignmentsToday, 
    getDeliverySettings 
} from '@/modules/operations/lib/actions';
import { getLiveTelemetryAction } from '@/modules/fleet/lib/gps-actions';
import { getCurrentUser, getUserPreferenceAction, saveUserPreferenceAction } from '@/modules/core/lib/auth';

function areEqualArrays(a: any[], b: any[]): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

function areEqualObjects(a: Record<string, any>, b: Record<string, any>): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

export function useDeliveriesMonitor() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(30); // Default 30s

    // Operational State
    const [assignments, setAssignments] = useState<any[]>([]);
    const [deliveries, setDeliveries] = useState<any[]>([]);
    const [telemetryMap, setTelemetryMap] = useState<Record<string, any>>({});
    const [settings, setSettings] = useState<any>({
        delivery_mode: 'sencillo',
        release_codes_enabled: 'false'
    });

    const [showCompletedToday, setShowCompletedToday] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Refs for in-flight protection and stable values
    const isRefreshingRef = useRef(false);
    const showCompletedTodayRef = useRef(showCompletedToday);
    const assignmentsRef = useRef(assignments);
    const deliveriesRef = useRef(deliveries);
    const telemetryMapRef = useRef(telemetryMap);

    useEffect(() => {
        showCompletedTodayRef.current = showCompletedToday;
    }, [showCompletedToday]);

    useEffect(() => {
        assignmentsRef.current = assignments;
    }, [assignments]);

    useEffect(() => {
        deliveriesRef.current = deliveries;
    }, [deliveries]);

    useEffect(() => {
        telemetryMapRef.current = telemetryMap;
    }, [telemetryMap]);

    // Sort assignments: active (activa === 1) first, completed (activa === 0) last
    const sortedAssignments = useMemo(() => {
        return [...(assignments || [])].sort((a, b) => b.activa - a.activa);
    }, [assignments]);

    // Full load (with skeleton or full refresh spinner)
    const loadData = useCallback(async (includeCompleted: boolean, showSkeleton = false) => {
        if (isRefreshingRef.current) return;
        isRefreshingRef.current = true;

        if (showSkeleton) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        try {
            const [a, d, s, tRes] = await Promise.all([
                getActiveAssignmentsToday(includeCompleted),
                getAssignedDeliveriesToday(includeCompleted),
                getDeliverySettings(),
                getLiveTelemetryAction()
            ]);

            setAssignments(a || []);
            setDeliveries(d || []);
            if (s) setSettings(s);

            const map: Record<string, any> = {};
            if (tRes && tRes.telemetry) {
                for (const t of tRes.telemetry) {
                    const cleanP = t.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    map[cleanP] = t;
                }
            }
            setTelemetryMap(map);
        } catch (e: any) {
            toast({
                title: 'Error de carga',
                description: 'No se pudieron recuperar las entregas activas.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
            isRefreshingRef.current = false;
        }
    }, [toast]);

    // Silent background refresh (no settings fetch, no unnecessary re-renders)
    const silentRefresh = useCallback(async (includeCompleted: boolean) => {
        if (isRefreshingRef.current) return;
        isRefreshingRef.current = true;
        setRefreshing(true);

        try {
            const [a, d, tRes] = await Promise.all([
                getActiveAssignmentsToday(includeCompleted),
                getAssignedDeliveriesToday(includeCompleted),
                getLiveTelemetryAction()
            ]);

            const newAssignments = a || [];
            const newDeliveries = d || [];

            if (!areEqualArrays(assignmentsRef.current, newAssignments)) {
                setAssignments(newAssignments);
            }

            if (!areEqualArrays(deliveriesRef.current, newDeliveries)) {
                setDeliveries(newDeliveries);
            }

            if (tRes && tRes.telemetry) {
                const map: Record<string, any> = {};
                for (const t of tRes.telemetry) {
                    const cleanP = t.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    map[cleanP] = t;
                }
                if (!areEqualObjects(telemetryMapRef.current, map)) {
                    setTelemetryMap(map);
                }
            }
        } catch (e) {
            console.error('Silent refresh failed:', e);
        } finally {
            setRefreshing(false);
            isRefreshingRef.current = false;
        }
    }, []);

    // Automatic Polling Timer & Tab Visibility Handler
    useEffect(() => {
        if (refreshIntervalSec <= 0) return;

        const intervalId = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            silentRefresh(showCompletedTodayRef.current);
        }, refreshIntervalSec * 1000);

        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && !document.hidden) {
                silentRefresh(showCompletedTodayRef.current);
            }
        };

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return () => {
            clearInterval(intervalId);
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [refreshIntervalSec, silentRefresh]);

    // Load User Preferences on Mount and initialize data once
    useEffect(() => {
        let isMounted = true;
        async function fetchUserAndPreferences() {
            try {
                const user = await getCurrentUser();
                if (!isMounted) return;
                let includeCompleted = false;
                if (user) {
                    setCurrentUser(user);
                    const pref = await getUserPreferenceAction(user.id, 'deliveries_show_completed');
                    if (pref !== null) {
                        includeCompleted = !!pref;
                        setShowCompletedToday(includeCompleted);
                    }
                }
                // Initial load with the resolved user preference
                loadData(includeCompleted, false);
            } catch (err) {
                console.error("Error loading user preferences:", err);
                if (isMounted) {
                    loadData(false, false);
                }
            }
        }
        fetchUserAndPreferences();
        return () => { isMounted = false; };
    }, [loadData]);

    const toggleShowCompletedToday = useCallback(async (checked: boolean) => {
        setShowCompletedToday(checked);
        // Load data with the new toggle setting
        loadData(checked, false);
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
    }, [currentUser, loadData, toast]);

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
        telemetryMap,
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
