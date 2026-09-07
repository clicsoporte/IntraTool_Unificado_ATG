'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { 
    RefreshCw, 
    Tv, 
    Monitor, 
    MapPin, 
    Eye,
    HelpCircle,
    FileText
} from 'lucide-react';
import { 
    updateDeliveryStatus, 
    revertDeliveryStatus,
    getHistoricalAssignments
} from '@/modules/operations/lib/actions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getLocalDateStr } from '@/modules/core/lib/time-utils';

// Hooks
import { useDeliveriesMonitor } from '@/modules/operations/hooks/useDeliveriesMonitor';

import dynamic from 'next/dynamic';

// Subcomponents
import { EvidencePhotoViewer } from '@/modules/operations/components/EvidencePhotoViewer';
import { IncompleteDeliveryModal, IncompleteDocData } from '@/modules/operations/components/IncompleteDeliveryModal';
import { ContingencyReportDialog } from '@/modules/operations/components/ContingencyReportDialog';
import { ActiveDeliveriesTab } from '@/modules/operations/components/ActiveDeliveriesTab';

const HistoricalDeliveriesTab = dynamic(
    () => import('@/modules/operations/components/HistoricalDeliveriesTab').then(m => m.HistoricalDeliveriesTab),
    { ssr: false, loading: () => <div className="p-8 text-center text-xs font-semibold text-muted-foreground animate-pulse">Cargando Historial de Entregas...</div> }
);

const TelegramLogsTab = dynamic(
    () => import('@/modules/operations/components/TelegramLogsTab').then(m => m.TelegramLogsTab),
    { ssr: false, loading: () => <div className="p-8 text-center text-xs font-semibold text-muted-foreground animate-pulse">Cargando Auditoría Telegram...</div> }
);

const ApkLogsTab = dynamic(
    () => import('@/modules/operations/components/ApkLogsTab').then(m => m.ApkLogsTab),
    { ssr: false, loading: () => <div className="p-8 text-center text-xs font-semibold text-muted-foreground animate-pulse">Cargando Logs de APK...</div> }
);

export default function DeliveriesDashboardPage() {
    const router = useRouter();
    const isFirstRender = useRef(true);
    const { toast } = useToast();
    const { hasPermission } = useAuthorization(['deliveries:read']);
    const [tvMode, setTvMode] = useState(false);
    const [tvTheme, setTvTheme] = useState<'slate' | 'navy' | 'light'>('slate');
    const [hideDelivered, setHideDelivered] = useState(false);

    // Consume the custom hook
    const {
        loading,
        refreshing,
        refreshIntervalSec,
        setRefreshIntervalSec,
        assignments,
        deliveries,
        telemetryMap,
        settings,
        showCompletedToday,
        sortedAssignments,
        silentRefresh,
        toggleShowCompletedToday
    } = useDeliveriesMonitor();

    // Tabs and Historical State
    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'telegram' | 'apk' | 'metrics'>('active');
    const [historyDate, setHistoryDate] = useState<string>(getLocalDateStr());
    const [historicalAssignments, setHistoricalAssignments] = useState<any[]>([]);
    const [historicalDeliveries, setHistoricalDeliveries] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Dynamic confirmation dialog state (v4.1)
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void | Promise<void>;
        actionLabel?: string;
        cancelLabel?: string;
        isDestructive?: boolean;
    }>({
        isOpen: false,
        title: '',
        description: '',
        onConfirm: () => {},
    });

    // Contingency Modal & Evidence states
    const [modalOpen, setModalOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [selectedPhoto, setSelectedPhoto] = useState<import('@/modules/operations/components/EvidencePhotoViewer').SelectedPhoto | null>(null);
    const [selectedIncompleteDoc, setSelectedIncompleteDoc] = useState<IncompleteDocData | null>(null);
    const [selectedDoc, setSelectedDoc] = useState<any>(null);

    // Load historical assignments & deliveries
    const loadHistoryData = useCallback(async (date: string) => {
        setLoadingHistory(true);
        try {
            const { assignments: a, deliveries: d } = await getHistoricalAssignments(date);
            setHistoricalAssignments(a);
            setHistoricalDeliveries(d);
        } catch (e) {
            toast({
                title: 'Error de carga de historial',
                description: 'No se pudo recuperar el historial de entregas.',
                variant: 'destructive'
            });
        } finally {
            setLoadingHistory(false);
        }
    }, [toast]);

    // Sync tvMode from URL query parameters on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('tv') === 'true') {
            setTvMode(true);
        }
    }, []);

    // Sync tvMode changes back to URL search parameters only when user toggles it
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const currentTvInUrl = params.get('tv') === 'true';
        if (tvMode !== currentTvInUrl) {
            if (tvMode) {
                params.set('tv', 'true');
            } else {
                params.delete('tv');
            }
            const query = params.toString() ? `?${params.toString()}` : '';
            const newUrl = `${window.location.pathname}${query}`;
            window.history.replaceState(null, '', newUrl);
        }
    }, [tvMode]);

    // Fetch history whenever date or history tab is selected
    useEffect(() => {
        if (activeTab === 'history') {
            loadHistoryData(historyDate);
        }
    }, [activeTab, historyDate, loadHistoryData]);

    // Helper to proceed with opening manual delivery contingency modal after confirmation
    const proceedWithManualDelivery = useCallback((doc: any) => {
        setSelectedDoc(doc);
        setModalOpen(true);
    }, []);

    // Opens manual delivery contingency modal
    const handleOpenManualDelivery = useCallback(async (doc: any) => {
        const isLocked = doc.telegram_lock_at && (new Date().getTime() - new Date(doc.telegram_lock_at).getTime() < 5 * 60 * 1000);
        if (isLocked) {
            setConfirmConfig({
                isOpen: true,
                title: '🚨 ADVERTENCIA DE CONCURRENCIA 🚨',
                description: 'Un chofer de Telegram está reportando este pedido actualmente (Bloqueo iniciado hace poco).\n\n¿Está seguro de forzar el reporte manual desde la web y sobrescribir sus datos?',
                onConfirm: () => proceedWithManualDelivery(doc),
                actionLabel: 'Sí, forzar reporte',
                cancelLabel: 'Cancelar',
                isDestructive: true
            });
            return;
        }

        proceedWithManualDelivery(doc);
    }, [proceedWithManualDelivery]);

    const handleRevertDelivery = useCallback(async (doc: any) => {
        setConfirmConfig({
            isOpen: true,
            title: '⚠️ ¿REVERTIR ENTREGA A PENDIENTE? ⚠️',
            description: `¿Está seguro de que desea revertir el documento #${doc.documento_numero} a estado PENDIENTE?\n\nEsto eliminará la foto de factura firmada, evidencia, ubicación GPS y cualquier reporte parcial (-PARTIAL o -RETRY) asociado.`,
            onConfirm: async () => {
                try {
                    const res = await revertDeliveryStatus(doc.id);
                    if (res.success) {
                        toast({
                            title: 'Entrega Revertida',
                            description: 'La entrega se restableció a pendiente y se limpiaron los registros correctamente.',
                        });
                        silentRefresh(showCompletedToday);
                        if (activeTab === 'history') {
                            setLoadingHistory(true);
                            try {
                                const histData = await getHistoricalAssignments(historyDate);
                                setHistoricalAssignments(histData.assignments);
                                setHistoricalDeliveries(histData.deliveries);
                            } catch (e) {
                                console.error(e);
                            } finally {
                                setLoadingHistory(false);
                            }
                        }
                    } else {
                        throw new Error(res.error);
                    }
                } catch (e: any) {
                    toast({
                        title: 'Error al revertir',
                        description: e.message || 'No se pudo revertir la entrega.',
                        variant: 'destructive'
                    });
                }
            },
            actionLabel: 'Sí, revertir',
            cancelLabel: 'Cancelar',
            isDestructive: true
        });
    }, [activeTab, historyDate, showCompletedToday, silentRefresh, toast]);

    const handleConfirmManualReport = useCallback(async (data: {
        estado: 'completo' | 'incompleto' | 'rechazado';
        comentario: string;
        lines?: any[];
    }) => {
        if (!selectedDoc) return false;
        try {
            const res = await updateDeliveryStatus(selectedDoc.id, {
                estado: data.estado,
                comentario: data.comentario,
                canal: 'web',
                gestionadoPor: 'Coordinador Web',
                lines: data.lines
            });
            if (res.success) {
                toast({
                    title: 'Entrega registrada',
                    description: 'La entrega manual se guardó y procesó correctamente.',
                });
                silentRefresh(showCompletedToday);
                return true;
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al reportar',
                description: e.message || 'No se pudo guardar el reporte de entrega.',
                variant: 'destructive'
            });
            return false;
        }
    }, [selectedDoc, showCompletedToday, silentRefresh, toast]);

    // UI filters
    const displayedDeliveries = useMemo(() => {
        return (deliveries || []).filter(d => {
            if (hideDelivered && d.estado === 'completo') return false;
            return true;
        });
    }, [deliveries, hideDelivered]);

    const themes = {
        slate: {
            bg: 'bg-slate-950 p-4 rounded-xl text-slate-100 border border-slate-800 shadow-2xl w-full',
            cardBg: 'bg-slate-900/60 border border-slate-800/80 shadow-md',
            textTitle: 'text-white',
            textMuted: 'text-slate-400',
            border: 'border-slate-800',
            controlBg: 'border-slate-800 bg-slate-900/60 text-slate-300',
            btnOutline: 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white',
            selectContent: 'bg-slate-900 border-slate-800 text-slate-100'
        },
        navy: {
            bg: 'bg-[#080d1a] p-4 rounded-xl text-slate-100 border border-blue-950/80 shadow-2xl w-full',
            cardBg: 'bg-[#0d162a]/80 border border-blue-900/40 shadow-md',
            textTitle: 'text-slate-50',
            textMuted: 'text-slate-400',
            border: 'border-blue-900/40',
            controlBg: 'border-blue-900/40 bg-[#0d162a]/60 text-slate-300',
            btnOutline: 'bg-[#0d162a] border-blue-900/40 text-slate-300 hover:bg-blue-950 hover:text-white',
            selectContent: 'bg-[#0d162a] border-blue-900/40 text-slate-100'
        },
        light: {
            bg: 'bg-slate-100 p-4 rounded-xl text-slate-800 border border-slate-200 shadow-md w-full',
            cardBg: 'bg-white border border-slate-200/85 shadow-sm',
            textTitle: 'text-slate-900',
            textMuted: 'text-slate-500',
            border: 'border-slate-200',
            controlBg: 'border-slate-200 bg-white text-slate-700',
            btnOutline: 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900',
            selectContent: 'bg-white border-slate-200 text-slate-800'
        }
    };

    const themeStyles = tvMode ? themes[tvTheme] : null;

    return (
        <div className={`space-y-6 ${tvMode ? `${themeStyles?.bg}` : ''}`}>
            
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                    <h2 className={`text-xl font-extrabold tracking-tight flex items-center gap-2 ${tvMode ? themeStyles?.textTitle : ''}`}>
                        Trazabilidad Logística en Tiempo Real
                        {loading && (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 px-2.5 py-0.5 rounded-full animate-pulse">
                                <RefreshCw className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
                                Cargando en segundo plano...
                            </span>
                        )}
                    </h2>
                    <p className={`text-xs font-medium ${tvMode ? themeStyles?.textMuted : 'text-muted-foreground'}`}>
                        Monitoree la flota en ruta y resuelva incidencias o registre contingencias manuales.
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* TV Theme Selector Buttons */}
                    {tvMode && (
                        <div className={`flex items-center gap-1 border p-1 rounded-xl shadow-sm h-9 ${
                            tvTheme === 'light' 
                                ? 'border-slate-200 bg-white' 
                                : (tvTheme === 'navy' ? 'border-blue-900/40 bg-[#0d162a]/60' : 'border-slate-800 bg-slate-900/60')
                        }`}>
                            <button
                                onClick={() => setTvTheme('slate')}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                                    tvTheme === 'slate' 
                                        ? 'bg-slate-800 text-white shadow-sm' 
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Pizarra
                            </button>
                            <button
                                onClick={() => setTvTheme('navy')}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                                    tvTheme === 'navy' 
                                        ? 'bg-blue-600 text-white shadow-sm' 
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Navy
                            </button>
                            <button
                                onClick={() => setTvTheme('light')}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                                    tvTheme === 'light' 
                                        ? 'bg-slate-200 text-slate-800 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                Claro
                            </button>
                        </div>
                    )}

                    {/* Auto-Refresh Control */}
                    <div className={`flex items-center gap-2 border px-2.5 py-1 rounded-xl text-xs font-bold shadow-sm h-9 ${
                        tvMode 
                            ? themeStyles?.controlBg 
                            : 'border-muted bg-background/50 backdrop-blur text-muted-foreground'
                    }`}>
                        <span className="flex items-center gap-1.5 shrink-0">
                            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-500' : refreshIntervalSec > 0 ? 'text-emerald-500' : (tvMode ? (tvTheme === 'light' ? 'text-slate-500' : 'text-slate-400') : 'text-muted-foreground')}`} />
                            {refreshing ? (
                                <span className="text-[10px] text-blue-500 font-extrabold animate-pulse">
                                    ↻ Actualizando...
                                </span>
                            ) : refreshIntervalSec > 0 ? (
                                <span className="text-[10px] text-emerald-500 font-extrabold">
                                    🔴 EN VIVO
                                </span>
                            ) : (
                                <span className="text-[10px] text-muted-foreground font-extrabold">
                                    ⏸ Pausado
                                </span>
                            )}
                        </span>
                        <Select 
                            value={String(refreshIntervalSec)} 
                            onValueChange={(val) => setRefreshIntervalSec(Number(val))}
                        >
                            <SelectTrigger className={`h-6 w-20 rounded-lg font-bold text-[10px] bg-transparent border-none shadow-none focus:ring-0 p-0 ${
                                tvMode 
                                    ? (tvTheme === 'light' ? 'text-slate-800 hover:text-slate-950' : 'text-slate-200 hover:text-white') 
                                    : 'text-foreground'
                            }`}>
                                <SelectValue placeholder="Intervalo" />
                            </SelectTrigger>
                            <SelectContent className={tvMode ? themeStyles?.selectContent : ''}>
                                <SelectItem value="0">Apagado</SelectItem>
                                <SelectItem value="10">Cada 10s</SelectItem>
                                <SelectItem value="30">Cada 30s</SelectItem>
                                <SelectItem value="60">Cada 1m</SelectItem>
                                <SelectItem value="300">Cada 5m</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Hide delivered switch toggle */}
                    <TooltipProvider>
                        <Tooltip delayDuration={150}>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setHideDelivered(!hideDelivered)}
                                    className={`rounded-lg font-bold text-xs gap-1.5 border-muted/80 shadow-sm h-9 ${tvMode ? themeStyles?.btnOutline : ''}`}
                                >
                                    <Eye className="w-3.5 h-3.5" />
                                    {hideDelivered ? 'Mostrar Completos' : 'Filtrar Mermas/En Ruta'}
                                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground opacity-60" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px] p-3 text-xs bg-slate-900 text-slate-100 border border-slate-800 rounded-xl shadow-xl">
                                <p className="font-semibold mb-1">Filtrar Mermas/En Ruta</p>
                                <p className="text-slate-400 font-normal leading-relaxed">
                                    Oculta los documentos que ya fueron entregados 100% completos. Permite enfocarse únicamente en pedidos con incidencias (Mermas, Rechazos) o que aún siguen en ruta.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {/* Switch: Mostrar completadas hoy */}
                    <TooltipProvider>
                        <Tooltip delayDuration={150}>
                            <TooltipTrigger asChild>
                                <div className={`flex items-center gap-2 border px-3 py-1 rounded-xl text-xs font-bold shadow-sm h-9 cursor-help ${
                                    tvMode 
                                        ? themeStyles?.controlBg 
                                        : 'border-muted bg-background/50 backdrop-blur text-muted-foreground'
                                }`}>
                                    <div className="flex items-center space-x-2">
                                        <Switch 
                                            id="show-completed-routes"
                                            checked={showCompletedToday}
                                            onCheckedChange={toggleShowCompletedToday}
                                        />
                                        <Label htmlFor="show-completed-routes" className={`text-xs font-bold cursor-pointer select-none ${tvMode ? (tvTheme === 'light' ? 'text-slate-700' : 'text-slate-300') : 'text-foreground'} flex items-center gap-1`}>
                                            Mostrar Completadas
                                            <HelpCircle className="w-3 h-3 text-muted-foreground opacity-60" />
                                        </Label>
                                    </div>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px] p-3 text-xs bg-slate-900 text-slate-100 border border-slate-800 rounded-xl shadow-xl">
                                <p className="font-semibold mb-1">Mostrar Completadas</p>
                                <p className="text-slate-400 font-normal leading-relaxed">
                                    Muestra u oculta las rutas de camiones que ya finalizaron su jornada y fueron cerradas hoy. Las rutas completadas se visualizan con un contorno verde suave y la etiqueta &quot;COMPLETADA&quot;.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {/* Monitoreo Satelital Link Button */}
                    <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="rounded-lg font-bold text-xs gap-1.5 border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 shadow-sm h-9 hover:bg-blue-100 dark:hover:bg-blue-950/40"
                    >
                        <Link href="/dashboard/operations/logistics/deliveries/map" prefetch={false}>
                            <MapPin className="w-3.5 h-3.5" />
                            Monitoreo Satelital 🗺️
                        </Link>
                    </Button>

                    {/* Hojas de Ruta Link Button */}
                    <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="rounded-lg font-bold text-xs gap-1.5 border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 shadow-sm h-9 hover:bg-purple-100 dark:hover:bg-purple-950/40"
                    >
                        <Link href="/dashboard/operations/logistics/deliveries/route-sheets" prefetch={false}>
                            <FileText className="w-3.5 h-3.5" />
                            Hojas de Ruta 📋
                        </Link>
                    </Button>

                    {/* Botón y Modal de Ayuda Operativa */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHelpOpen(true)}
                        className="rounded-lg font-bold text-xs gap-1.5 border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 shadow-sm h-9 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                    >
                        <HelpCircle className="w-3.5 h-3.5" />
                        Ayuda ❓
                    </Button>

                    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
                        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6">
                            <DialogHeader>
                                <DialogTitle className="text-lg font-extrabold flex items-center gap-2 text-primary">
                                    ❓ Guía Operativa de Tiempos y Optimización de Rutas
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground">
                                    Manual rápido para la interpretación de estados GPS, cálculo de duraciones y gestión de entregas en tiempo real.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 text-xs pt-2">
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-900 dark:text-emerald-200 font-medium leading-relaxed">
                                    🎯 <b>Objetivo de Optimización Logística:</b> Este monitor apoya a los equipos de transportes, despacho y bodega para coordinar la llegada de vehículos, agilizar la carga/descarga y brindar visibilidad en tiempo real del avance en ruta de las entregas.
                                </div>

                                <h4 className="font-extrabold text-sm text-foreground pt-1">⏱️ ¿Cómo se calcula y qué significa cada tiempo?</h4>

                                <div className="space-y-3">
                                    <div className="p-3 bg-card border-l-4 border-emerald-500 rounded-lg shadow-sm space-y-1">
                                        <div className="flex items-center justify-between">
                                            <b className="text-emerald-600 dark:text-emerald-400 text-xs uppercase tracking-wide">🟢 EN MOVIMIENTO</b>
                                            <span className="text-[10px] text-muted-foreground">(En trayecto fuera de la empresa a &gt; 5 km/h)</span>
                                        </div>
                                        <p className="text-muted-foreground leading-relaxed">
                                            • <b>¿Qué significa?</b> El camión se desplaza activamente hacia su destino o cliente.<br />
                                            • <b>Cálculo del tiempo:</b> Tiempo continuo transcurrido desde que el vehículo inició el viaje actual (registro de cambio de estado en movimiento).
                                        </p>
                                    </div>

                                    <div className="p-3 bg-card border-l-4 border-orange-500 rounded-lg shadow-sm space-y-1">
                                        <div className="flex items-center justify-between">
                                            <b className="text-orange-600 dark:text-orange-400 text-xs uppercase tracking-wide">🏢 EN LA EMPRESA</b>
                                            <span className="text-[10px] text-muted-foreground">(En predio o parqueo principal)</span>
                                        </div>
                                        <p className="text-muted-foreground leading-relaxed">
                                            • <b>¿Qué significa?</b> El camión está dentro del radio delimitado de la empresa en proceso de alistamiento, carga o retorno.<br />
                                            • <b>Cálculo del tiempo:</b> Tiempo transcurrido desde que el vehículo ingresó al perímetro GPS configurado de la empresa.
                                        </p>
                                    </div>

                                    <div className="p-3 bg-card border-l-4 border-yellow-500 rounded-lg shadow-sm space-y-1">
                                        <div className="flex items-center justify-between">
                                            <b className="text-yellow-600 dark:text-yellow-400 text-xs uppercase tracking-wide">🔑 DETENIDO (Motor ON / Ralentí)</b>
                                            <span className="text-[10px] text-muted-foreground">(Detención temporal fuera de empresa)</span>
                                        </div>
                                        <p className="text-muted-foreground leading-relaxed">
                                            • <b>¿Qué significa?</b> El vehículo está detenido (0 km/h) pero mantiene el motor encendido (atención en semáforo, maniobra o descarga corta).<br />
                                            • <b>Cálculo del tiempo:</b> Minutos transcurridos desde que la velocidad bajó a 0 km/h manteniendo la ignición activada.
                                        </p>
                                    </div>

                                    <div className="p-3 bg-card border-l-4 border-purple-500 rounded-lg shadow-sm space-y-1">
                                        <div className="flex items-center justify-between">
                                            <b className="text-purple-600 dark:text-purple-400 text-xs uppercase tracking-wide">🅿️ ESTACIONADO (Motor OFF)</b>
                                            <span className="text-[10px] text-muted-foreground">(Atención a cliente o parqueo)</span>
                                        </div>
                                        <p className="text-muted-foreground leading-relaxed">
                                            • <b>¿Qué significa?</b> El vehículo está parqueado fuera de la empresa con el motor apagado (entrega en cliente, almuerzo o fin de jornada).<br />
                                            • <b>Cálculo del tiempo:</b> Diferencia exacta de tiempo desde que se registró el apagado de la llave del motor.
                                        </p>
                                    </div>

                                    <div className="p-3 bg-card border-l-4 border-slate-400 rounded-lg shadow-sm space-y-1">
                                        <div className="flex items-center justify-between">
                                            <b className="text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wide">📡 SIN SEÑAL GPS</b>
                                            <span className="text-[10px] text-muted-foreground">(Sin cobertura temporal)</span>
                                        </div>
                                        <p className="text-muted-foreground leading-relaxed">
                                            • <b>¿Qué significa?</b> El módem GPS perdió conexión celular o satelital temporalmente.<br />
                                            • <b>Cálculo del tiempo:</b> Tiempo transcurrido desde la última transmisión válida recibida.
                                        </p>
                                    </div>
                                </div>

                                <h4 className="font-extrabold text-sm text-foreground pt-2 border-t">📋 Elementos de Apoyo en Pantalla:</h4>
                                <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                                    <li><b>👤 Chofer &amp; 🛣️ Ruta:</b> Asignación operativa configurada para el día.</li>
                                    <li><b>📅 Indicador de Asignación:</b> 🟢 <b>Hoy</b> (ruta al día) | ⚠️ <b>Desactualizada</b> (asignación previa pendiente de renovar).</li>
                                    <li><b>⚡ Velocidad Instantánea:</b> Velocidad de avance reportada en tiempo real por el sensor Navixy.</li>
                                </ul>

                                <div className="pt-3 flex justify-end">
                                    <Button onClick={() => setHelpOpen(false)} className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                                        👍 Entendido
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* TV Mode Toggle Button */}
                    <Button
                        variant={tvMode ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTvMode(!tvMode)}
                        className={`rounded-lg font-bold text-xs gap-1.5 shadow-sm h-9 ${tvMode ? 'bg-blue-600 hover:bg-blue-700 text-white border-none' : 'border-muted/80'}`}
                    >
                        {tvMode ? <Monitor className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                        {tvMode ? 'Modo Escritorio' : 'Modo TV Despacho'}
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => silentRefresh(showCompletedToday)}
                        className={`p-2 rounded-lg h-9 ${tvMode ? (tvTheme === 'light' ? 'text-slate-600 hover:bg-slate-200' : 'text-slate-400 hover:bg-slate-900 hover:text-white') : 'text-muted-foreground'}`}
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Tabs Selector */}
            <div className={`flex border-b ${tvMode ? themeStyles?.border : 'border-muted'} mb-4 overflow-x-auto scrollbar-none flex-nowrap`}>
                <button
                    onClick={() => setActiveTab('active')}
                    className={`pb-3 px-3 sm:px-6 text-xs sm:text-sm font-extrabold transition-all border-b-2 shrink-0 ${
                        activeTab === 'active'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : `border-transparent ${tvMode ? (tvTheme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200') : 'text-muted-foreground hover:text-foreground'}`
                    }`}
                >
                    Monitoreo Activo ({assignments.length})
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`pb-3 px-3 sm:px-6 text-xs sm:text-sm font-extrabold transition-all border-b-2 shrink-0 ${
                        activeTab === 'history'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : `border-transparent ${tvMode ? (tvTheme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200') : 'text-muted-foreground hover:text-foreground'}`
                    }`}
                >
                    Historial de Entregas
                </button>
                <button
                    onClick={() => setActiveTab('telegram')}
                    className={`pb-3 px-3 sm:px-6 text-xs sm:text-sm font-extrabold transition-all border-b-2 shrink-0 ${
                        activeTab === 'telegram'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : `border-transparent ${tvMode ? (tvTheme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200') : 'text-muted-foreground hover:text-foreground'}`
                    }`}
                >
                    Registros Bot Telegram
                </button>
                <button
                    onClick={() => setActiveTab('apk')}
                    className={`pb-3 px-3 sm:px-6 text-xs sm:text-sm font-extrabold transition-all border-b-2 shrink-0 ${
                        activeTab === 'apk'
                            ? 'border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400'
                            : `border-transparent ${tvMode ? (tvTheme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200') : 'text-muted-foreground hover:text-foreground'}`
                    }`}
                >
                    📱 Registros APK
                </button>
            </div>

            {/* Tab contents */}
            {activeTab === 'active' ? (
                <ActiveDeliveriesTab 
                    loading={loading}
                    assignments={assignments}
                    deliveries={deliveries}
                    displayedDeliveries={displayedDeliveries}
                    sortedAssignments={sortedAssignments}
                    telemetryMap={telemetryMap}
                    tvMode={tvMode}
                    themeStyles={themeStyles}
                    hasPermission={hasPermission}
                    handleOpenManualDelivery={handleOpenManualDelivery}
                    handleRevertDelivery={handleRevertDelivery}
                    setSelectedPhoto={setSelectedPhoto}
                    setSelectedIncompleteDoc={setSelectedIncompleteDoc}
                />
            ) : activeTab === 'history' ? (
                <HistoricalDeliveriesTab 
                    historyDate={historyDate}
                    setHistoryDate={setHistoryDate}
                    loadHistoryData={loadHistoryData}
                    loadingHistory={loadingHistory}
                    historicalAssignments={historicalAssignments}
                    historicalDeliveries={historicalDeliveries}
                    tvMode={tvMode}
                    hasPermission={hasPermission}
                    handleRevertDelivery={handleRevertDelivery}
                    setSelectedPhoto={setSelectedPhoto}
                    setSelectedIncompleteDoc={setSelectedIncompleteDoc}
                />
            ) : activeTab === 'telegram' ? (
                <TelegramLogsTab tvMode={tvMode} />
            ) : (
                <ApkLogsTab tvMode={tvMode} />
            )}

            {/* Modals & Dialogs */}
            <ContingencyReportDialog 
                isOpen={modalOpen}
                onOpenChange={setModalOpen}
                selectedDoc={selectedDoc}
                settings={settings}
                onConfirm={handleConfirmManualReport}
            />

            <EvidencePhotoViewer 
                selectedPhoto={selectedPhoto}
                onClose={() => setSelectedPhoto(null)}
            />

            <IncompleteDeliveryModal 
                doc={selectedIncompleteDoc}
                onClose={() => setSelectedIncompleteDoc(null)}
            />

            {/* Dynamic Confirmation Dialog (v4.1) */}
            <AlertDialog 
                open={confirmConfig.isOpen} 
                onOpenChange={(open) => setConfirmConfig(prev => ({ ...prev, isOpen: open }))}
            >
                <AlertDialogContent className="rounded-2xl border border-muted bg-background">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-md font-extrabold flex items-center gap-2">
                            {confirmConfig.title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs font-semibold leading-relaxed whitespace-pre-line text-muted-foreground">
                            {confirmConfig.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex gap-2 justify-end">
                        <AlertDialogCancel className="rounded-xl font-bold text-xs">
                            {confirmConfig.cancelLabel || 'Cancelar'}
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={async () => {
                                await confirmConfig.onConfirm();
                            }}
                            className={`rounded-xl font-black text-xs ${
                                confirmConfig.isDestructive 
                                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                        >
                            {confirmConfig.actionLabel || 'Confirmar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
