'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
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

// Hooks
import { useDeliveriesMonitor } from '@/modules/operations/hooks/useDeliveriesMonitor';

// Subcomponents
import { EvidencePhotoViewer } from '@/modules/operations/components/EvidencePhotoViewer';
import { ContingencyReportDialog } from '@/modules/operations/components/ContingencyReportDialog';
import { ActiveDeliveriesTab } from '@/modules/operations/components/ActiveDeliveriesTab';
import { HistoricalDeliveriesTab } from '@/modules/operations/components/HistoricalDeliveriesTab';
import { TelegramLogsTab } from '@/modules/operations/components/TelegramLogsTab';
import { LogisticsMetricsTab } from '@/modules/operations/components/LogisticsMetricsTab';

interface CountdownBadgeProps {
    refreshIntervalSec: number;
    silentRefresh: (includeCompleted: boolean) => Promise<void>;
    showCompletedToday: boolean;
    refreshing: boolean;
}

function CountdownBadge({ refreshIntervalSec, silentRefresh, showCompletedToday, refreshing }: CountdownBadgeProps) {
    const [secondsLeft, setSecondsLeft] = useState(refreshIntervalSec);

    useEffect(() => {
        if (refreshIntervalSec === 0) return;
        setSecondsLeft(refreshIntervalSec);

        const timer = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    silentRefresh(showCompletedToday);
                    return refreshIntervalSec;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [refreshIntervalSec, silentRefresh, showCompletedToday]);

    if (refreshIntervalSec === 0) {
        return <span className="text-[10px] font-extrabold">Refresco</span>;
    }

    return (
        <span className="text-[10px] text-emerald-500 font-extrabold animate-pulse">
            🔴 EN VIVO ({secondsLeft}s)
        </span>
    );
}

export default function DeliveriesDashboardPage() {
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
        settings,
        showCompletedToday,
        sortedAssignments,
        silentRefresh,
        toggleShowCompletedToday
    } = useDeliveriesMonitor();

    // Utility for local calendar date without UTC offset issues
    const getLocalDateStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // Tabs and Historical State
    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'telegram' | 'metrics'>('active');
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
    const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);
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

    // Sync tvMode changes back to URL search parameters
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (tvMode) {
            params.set('tv', 'true');
        } else {
            params.delete('tv');
        }
        const newRelativePathQuery = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState(window.history.state, '', newRelativePathQuery);
        window.dispatchEvent(new Event('locationchange'));
    }, [tvMode]);

    // Fetch history whenever date or history tab is selected
    useEffect(() => {
        if (activeTab === 'history') {
            loadHistoryData(historyDate);
        }
    }, [activeTab, historyDate, loadHistoryData]);

    // Helper to proceed with opening manual delivery contingency modal after confirmation
    async function proceedWithManualDelivery(doc: any) {
        setSelectedDoc(doc);
        setModalOpen(true);
    }

    // Opens manual delivery contingency modal
    async function handleOpenManualDelivery(doc: any) {
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

        await proceedWithManualDelivery(doc);
    }

    async function handleRevertDelivery(doc: any) {
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
    }

    const handleConfirmManualReport = async (data: {
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
    };

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
            textMuted: 'text-slate-505',
            border: 'border-slate-200',
            controlBg: 'border-slate-200 bg-white text-slate-700',
            btnOutline: 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900',
            selectContent: 'bg-white border-slate-200 text-slate-800'
        }
    };

    const themeStyles = tvMode ? themes[tvTheme] : null;

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse">
                <div className="text-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                    <p className="text-muted-foreground font-medium">Cargando monitor en tiempo real...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`space-y-6 ${tvMode ? `${themeStyles?.bg} transition-colors duration-300` : ''}`}>
            
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                    <h2 className={`text-xl font-extrabold tracking-tight ${tvMode ? themeStyles?.textTitle : ''}`}>
                        Trazabilidad Logística en Tiempo Real
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
                            <RefreshCw className={`w-3.5 h-3.5 ${refreshIntervalSec > 0 ? 'animate-spin text-emerald-500' : (tvMode ? (tvTheme === 'light' ? 'text-slate-500' : 'text-slate-400') : 'text-muted-foreground')}`} style={{ animationDuration: refreshIntervalSec > 0 ? '3s' : undefined }} />
                            <CountdownBadge 
                                refreshIntervalSec={refreshIntervalSec} 
                                silentRefresh={silentRefresh} 
                                showCompletedToday={showCompletedToday} 
                                refreshing={refreshing} 
                            />
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
                        <Link href="/dashboard/operations/logistics/deliveries/map">
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
                        <Link href="/dashboard/operations/logistics/deliveries/route-sheets">
                            <FileText className="w-3.5 h-3.5" />
                            Hojas de Ruta 📋
                        </Link>
                    </Button>

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
                    onClick={() => setActiveTab('metrics')}
                    className={`pb-3 px-3 sm:px-6 text-xs sm:text-sm font-extrabold transition-all border-b-2 shrink-0 ${
                        activeTab === 'metrics'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : `border-transparent ${tvMode ? (tvTheme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200') : 'text-muted-foreground hover:text-foreground'}`
                    }`}
                >
                    📊 Rendimiento en Ruta
                </button>
            </div>

            {/* Tab contents */}
            {activeTab === 'active' ? (
                <ActiveDeliveriesTab 
                    assignments={assignments}
                    deliveries={deliveries}
                    displayedDeliveries={displayedDeliveries}
                    sortedAssignments={sortedAssignments}
                    tvMode={tvMode}
                    themeStyles={themeStyles}
                    hasPermission={hasPermission}
                    handleOpenManualDelivery={handleOpenManualDelivery}
                    handleRevertDelivery={handleRevertDelivery}
                    setSelectedPhoto={setSelectedPhoto}
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
                />
            ) : activeTab === 'telegram' ? (
                <TelegramLogsTab tvMode={tvMode} />
            ) : (
                <LogisticsMetricsTab 
                    assignments={assignments}
                    deliveries={deliveries}
                />
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
