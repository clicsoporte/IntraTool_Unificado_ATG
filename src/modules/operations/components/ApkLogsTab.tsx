'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
    Search, 
    RefreshCw, 
    Smartphone, 
    User, 
    Truck, 
    MapPin, 
    AlertTriangle, 
    Info, 
    AlertCircle, 
    Clock, 
    Phone,
    RotateCcw,
    CheckCircle2,
    Printer,
    FileText,
    ShieldAlert,
    Coffee,
    Wrench,
    Check
} from 'lucide-react';
import { getApkDriverLogsAction } from '@/modules/operations/lib/actions';
import { formatFechaEntrega, getLocalDateStr } from '@/modules/operations/lib/utils';

interface ApkLogsTabProps {
    tvMode?: boolean;
}

const ITEMS_PER_PAGE = 15;

export function ApkLogsTab({ tvMode = false }: ApkLogsTabProps) {
    const [apkDate, setApkDate] = useState<string>(getLocalDateStr());
    const [apkLogs, setApkLogs] = useState<any[]>([]);
    const [apkLogsLoading, setApkLogsLoading] = useState(false);
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [apkPage, setApkPage] = useState(1);

    const fetchLogs = useCallback(async (dateToQuery?: string) => {
        setApkLogsLoading(true);
        try {
            const queryDate = dateToQuery || apkDate;
            const logs = await getApkDriverLogsAction(queryDate);
            setApkLogs(logs || []);
            setApkPage(1);
        } catch (error) {
            console.error("Error fetching APK driver logs:", error);
        } finally {
            setApkLogsLoading(false);
        }
    }, [apkDate]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    // Identificar el tipo de acción para categorización y conteos
    const getLogActionType = (log: any): 'carga_facturas' | 'entrega' | 'reversion' | 'bateria' | 'espera' | 'recolecta' | 'pausa' | 'averia' | 'cierre' | 'reimpresion' | 'otro' => {
        const cat = (log.category || '').toLowerCase();
        const msg = (log.message || '').toLowerCase();

        if (cat.includes('carga_facturas') || msg.includes('carga de facturas')) {
            return 'carga_facturas';
        }
        if (msg.includes('batería') || msg.includes('bateria') || msg.includes('apagado') || cat === 'bateria') {
            return 'bateria';
        }
        if (msg.includes('en espera') || msg.includes('esperando') || cat === 'en_espera') {
            return 'espera';
        }
        if (cat === 'recolecta' || msg.includes('recolecta') || msg.includes('recoger') || msg.includes('retiro')) {
            return 'recolecta';
        }
        if (cat === 'reversion' || msg.includes('reversó') || msg.includes('reversion') || msg.includes('revertir')) {
            return 'reversion';
        }
        if (cat === 'cierre' || msg.includes('finalizó la ruta') || msg.includes('ruta completada') || msg.includes('cierre de ruta')) {
            return 'cierre';
        }
        if (cat === 'reimpresion' || msg.includes('reimprimió') || msg.includes('reimpresion')) {
            return 'reimpresion';
        }
        if (cat === 'pausa' || msg.includes('pausa') || msg.includes('almuerzo') || msg.includes('merienda')) {
            return 'pausa';
        }
        if (cat === 'averia' || msg.includes('avería') || msg.includes('averia') || msg.includes('mecánica')) {
            return 'averia';
        }
        if (cat === 'entrega' || msg.includes('entrega #') || msg.includes('procesada como') || msg.includes('entregado') || msg.includes('rechazado')) {
            return 'entrega';
        }
        return 'otro';
    };

    // Conteos rápidos de auditoría para el supervisor
    const auditStats = useMemo(() => {
        let cargas = 0;
        let entregas = 0;
        let reversiones = 0;
        let esperas = 0;
        let alertasBateria = 0;
        let pausasAverias = 0;

        apkLogs.forEach((log) => {
            const t = getLogActionType(log);
            if (t === 'carga_facturas') cargas++;
            else if (t === 'entrega') entregas++;
            else if (t === 'reversion') reversiones++;
            else if (t === 'espera') esperas++;
            else if (t === 'bateria') alertasBateria++;
            else if (t === 'pausa' || t === 'averia') pausasAverias++;
        });

        return { cargas, entregas, reversiones, esperas, alertasBateria, pausasAverias };
    }, [apkLogs]);

    const filteredLogs = useMemo(() => {
        return apkLogs.filter((log: any) => {
            const actType = getLogActionType(log);

            if (actionFilter !== 'all') {
                if (actionFilter === 'carga_facturas' && actType !== 'carga_facturas') return false;
                if (actionFilter === 'entrega' && actType !== 'entrega') return false;
                if (actionFilter === 'reversion' && actType !== 'reversion') return false;
                if (actionFilter === 'espera' && actType !== 'espera') return false;
                if (actionFilter === 'bateria' && actType !== 'bateria') return false;
                if (actionFilter === 'pausa' && actType !== 'pausa' && actType !== 'averia') return false;
            }

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const matchMsg = (log.message || '').toLowerCase().includes(term);
                const matchUser = (log.chofer_nombre || log.user_name || '').toLowerCase().includes(term);
                const matchPlate = (log.placa_vehiculo || '').toLowerCase().includes(term);
                const matchRoute = (log.ruta_nombre || '').toLowerCase().includes(term);
                if (!matchMsg && !matchUser && !matchPlate && !matchRoute) return false;
            }

            return true;
        });
    }, [apkLogs, actionFilter, searchTerm]);

    const paginatedLogs = useMemo(() => {
        const startIndex = (apkPage - 1) * ITEMS_PER_PAGE;
        return filteredLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredLogs, apkPage]);

    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE) || 1;

    // Extrae enlace de Google Maps si el log contiene coordenadas
    const extractMapsLink = (text: string) => {
        const regex = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/;
        const match = (text || '').match(regex);
        if (match) {
            return `https://www.google.com/maps/search/?api=1&query=${match[1]},${match[2]}`;
        }
        return null;
    };

    const renderActionBadge = (log: any) => {
        const type = getLogActionType(log);

        switch (type) {
            case 'carga_facturas':
                return (
                    <Badge variant="outline" className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/40 gap-1.5 font-extrabold text-[11px] shadow-sm">
                        <FileText className="w-3.5 h-3.5" /> CARGA DE FACTURAS
                    </Badge>
                );
            case 'entrega':
                return (
                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40 gap-1.5 font-bold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> ENTREGA PROCESADA
                    </Badge>
                );
            case 'reversion':
                return (
                    <Badge variant="outline" className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40 gap-1.5 font-extrabold text-[11px] shadow-sm animate-pulse">
                        <RotateCcw className="w-3.5 h-3.5" /> REVERSIÓN DE ENTREGA
                    </Badge>
                );
            case 'bateria':
                return (
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40 gap-1.5 font-bold text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5" /> ALERTA DE BATERÍA
                    </Badge>
                );
            case 'espera':
                return (
                    <Badge variant="outline" className="bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/40 gap-1.5 font-bold text-[11px]">
                        <Clock className="w-3.5 h-3.5" /> CHOFER EN ESPERA
                    </Badge>
                );
            case 'recolecta':
                return (
                    <Badge variant="outline" className="bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/40 gap-1.5 font-bold text-[11px]">
                        <Truck className="w-3.5 h-3.5" /> RECOLECTA PROVEEDOR
                    </Badge>
                );
            case 'cierre':
                return (
                    <Badge variant="outline" className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/40 gap-1.5 font-bold text-[11px]">
                        <Check className="w-3.5 h-3.5" /> FIN DE RUTA
                    </Badge>
                );
            case 'pausa':
                return (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1.5 font-bold text-[11px]">
                        <Coffee className="w-3.5 h-3.5" /> DESCANSO / ALMUERZO
                    </Badge>
                );
            case 'averia':
                return (
                    <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40 gap-1.5 font-bold text-[11px]">
                        <Wrench className="w-3.5 h-3.5" /> AVERÍA VEHÍCULO
                    </Badge>
                );
            case 'reimpresion':
                return (
                    <Badge variant="outline" className="bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/40 gap-1.5 font-bold text-[11px]">
                        <Printer className="w-3.5 h-3.5" /> REIMPRESIÓN TÉRMICA
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30 gap-1.5 font-bold text-[11px]">
                        <Info className="w-3.5 h-3.5" /> EVENTO CHOFER
                    </Badge>
                );
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header and Controls */}
            <div className={`p-4 border rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${
                tvMode ? 'bg-slate-900/60 border-slate-800' : 'bg-card shadow-sm'
            }`}>
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-sm">
                        <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold tracking-tight">Bitácora Operativa de Rutas & Choferes</h3>
                            <Badge className="bg-purple-600 text-white font-mono text-[10px] uppercase">Despacho</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-medium">
                            Historial operativo de campo: cargas de facturas, entregas, esperas, alertas de batería y fin de ruta.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
                    {/* Date Input */}
                    <div className="flex items-center gap-1.5 bg-muted/30 p-1 rounded-xl border border-muted/50">
                        <Input
                            type="date"
                            value={apkDate}
                            onChange={(e) => setApkDate(e.target.value)}
                            className={`h-9 w-36 rounded-lg font-bold text-xs border-0 bg-transparent shadow-none ${
                                tvMode ? 'text-white' : ''
                            }`}
                        />
                        <Button
                            size="sm"
                            onClick={() => fetchLogs(apkDate)}
                            className="rounded-lg font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5 h-8 px-3"
                            disabled={apkLogsLoading}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${apkLogsLoading ? 'animate-spin' : ''}`} />
                            Actualizar
                        </Button>
                    </div>
                </div>
            </div>

            {/* Quick Audit Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <button
                    onClick={() => { setActionFilter('all'); setApkPage(1); }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                        actionFilter === 'all' 
                            ? 'bg-purple-500/10 border-purple-500/40 ring-2 ring-purple-500/20' 
                            : 'bg-card border-muted/60 hover:border-muted'
                    }`}
                >
                    <span className="text-[11px] font-bold text-muted-foreground block">Total Eventos</span>
                    <span className="text-xl font-extrabold text-foreground">{apkLogs.length}</span>
                </button>

                <button
                    onClick={() => { setActionFilter('carga_facturas'); setApkPage(1); }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                        actionFilter === 'carga_facturas' 
                            ? 'bg-indigo-500/10 border-indigo-500/40 ring-2 ring-indigo-500/20' 
                            : 'bg-card border-muted/60 hover:border-muted'
                    }`}
                >
                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block">📋 Carga Facturas</span>
                    <span className="text-xl font-extrabold text-foreground">{auditStats.cargas}</span>
                </button>

                <button
                    onClick={() => { setActionFilter('entrega'); setApkPage(1); }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                        actionFilter === 'entrega' 
                            ? 'bg-emerald-500/10 border-emerald-500/40 ring-2 ring-emerald-500/20' 
                            : 'bg-card border-muted/60 hover:border-muted'
                    }`}
                >
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">✓ Entregas</span>
                    <span className="text-xl font-extrabold text-foreground">{auditStats.entregas}</span>
                </button>

                <button
                    onClick={() => { setActionFilter('espera'); setApkPage(1); }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                        actionFilter === 'espera' 
                            ? 'bg-sky-500/10 border-sky-500/40 ring-2 ring-sky-500/20' 
                            : 'bg-card border-muted/60 hover:border-muted'
                    }`}
                >
                    <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 block">⏳ En Espera</span>
                    <span className="text-xl font-extrabold text-foreground">{auditStats.esperas}</span>
                </button>

                <button
                    onClick={() => { setActionFilter('bateria'); setApkPage(1); }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                        actionFilter === 'bateria' 
                            ? 'bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500/20' 
                            : 'bg-card border-muted/60 hover:border-muted'
                    }`}
                >
                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 block">🔋 Batería / Apagado</span>
                    <span className="text-xl font-extrabold text-foreground">{auditStats.alertasBateria}</span>
                </button>

                <button
                    onClick={() => { setActionFilter('reversion'); setApkPage(1); }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                        actionFilter === 'reversion' 
                            ? 'bg-rose-500/10 border-rose-500/40 ring-2 ring-rose-500/20' 
                            : 'bg-card border-muted/60 hover:border-muted'
                    }`}
                >
                    <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 block">↺ Reversiones</span>
                    <span className="text-xl font-extrabold text-foreground">{auditStats.reversiones}</span>
                </button>
            </div>

            {/* Search Input Filter */}
            <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                    type="text"
                    placeholder="Buscar por chofer, factura, cliente (#FAC-123), ruta o placa..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setApkPage(1); }}
                    className="pl-9 h-10 rounded-xl bg-card border-muted font-medium text-xs shadow-sm"
                />
            </div>

            {apkLogsLoading ? (
                <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse">
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-500" />
                        <p className="text-muted-foreground font-medium text-xs">Cargando bitácora operativa de choferes...</p>
                    </div>
                </div>
            ) : filteredLogs.length === 0 ? (
                <div className="p-12 text-center bg-card rounded-2xl border border-muted/50 space-y-3">
                    <Smartphone className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                    <h4 className="text-sm font-bold text-foreground">No se encontraron eventos operativos</h4>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        No hay reportes de campo registrados para los filtros seleccionados en esta fecha.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {paginatedLogs.map((log: any, index: number) => {
                        const actType = getLogActionType(log);
                        const isReversion = actType === 'reversion';
                        const isCarga = actType === 'carga_facturas';
                        const isBateria = actType === 'bateria';
                        const mapsLink = extractMapsLink(log.message);
                        
                        return (
                            <div 
                                key={log.id ? `log-${log.id}` : `log-idx-${index}-${log.timestamp || ''}`} 
                                className={`p-4 rounded-2xl border transition-all duration-200 hover:shadow-md ${
                                    isReversion
                                        ? 'bg-rose-500/[0.04] border-rose-500/40 dark:border-rose-900/60'
                                        : isCarga
                                        ? 'bg-indigo-500/[0.03] border-indigo-500/30 dark:border-indigo-900/50'
                                        : isBateria
                                        ? 'bg-amber-500/[0.04] border-amber-500/40 dark:border-amber-900/60'
                                        : tvMode ? 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700' : 'bg-card border-muted/50 hover:border-border'
                                }`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-muted/30">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {renderActionBadge(log)}
                                        
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground bg-muted/30 px-2 py-0.5 rounded-md">
                                            <User className="w-3.5 h-3.5 text-primary" />
                                            <span>{log.chofer_nombre || log.user_name || 'Chofer'}</span>
                                        </div>

                                        {log.chofer_telefono && (
                                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                <Phone className="w-3 h-3 text-emerald-500" />
                                                <span>{log.chofer_telefono}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-medium shrink-0 flex-wrap sm:flex-nowrap">
                                        {log.ruta_nombre && (
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded-md">
                                                <MapPin className="w-3 h-3 text-amber-500" />
                                                {log.ruta_nombre}
                                            </div>
                                        )}
                                        {log.placa_vehiculo && (
                                            <div className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold">
                                                <Truck className="w-3 h-3 text-sky-500" />
                                                {log.placa_vehiculo}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1 font-mono text-[11px] bg-muted/40 px-2 py-0.5 rounded-md font-bold text-foreground">
                                            <Clock className="w-3 h-3 text-primary" />
                                            {formatFechaEntrega(log.timestamp)}
                                        </div>
                                    </div>
                                </div>

                                <div className={`text-xs font-sans p-3 rounded-xl border leading-relaxed ${
                                    isReversion
                                        ? 'bg-rose-500/10 text-rose-950 dark:text-rose-200 border-rose-500/30 font-medium'
                                        : isCarga
                                        ? 'bg-indigo-500/10 text-indigo-950 dark:text-indigo-200 border-indigo-500/20 font-medium'
                                        : isBateria
                                        ? 'bg-amber-500/10 text-amber-950 dark:text-amber-200 border-amber-500/30 font-medium'
                                        : 'bg-muted/20 text-foreground border-muted/30'
                                }`}>
                                    <div className="whitespace-pre-line">
                                        {log.message}
                                    </div>

                                    {mapsLink && (
                                        <div className="mt-2 pt-2 border-t border-muted/40 flex items-center justify-end">
                                            <a 
                                                href={mapsLink} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:underline bg-sky-500/10 px-2.5 py-1 rounded-lg transition-colors"
                                            >
                                                <MapPin className="w-3.5 h-3.5 text-sky-500" />
                                                Ver ubicación en Google Maps ↗
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2 px-1 text-xs text-muted-foreground">
                            <span>
                                Mostrando página <strong>{apkPage}</strong> de <strong>{totalPages}</strong> ({filteredLogs.length} eventos operativos)
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={apkPage <= 1}
                                    onClick={() => setApkPage(p => Math.max(1, p - 1))}
                                    className="rounded-xl h-8 text-xs font-bold"
                                >
                                    Anterior
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={apkPage >= totalPages}
                                    onClick={() => setApkPage(p => Math.min(totalPages, p + 1))}
                                    className="rounded-xl h-8 text-xs font-bold"
                                >
                                    Siguiente
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
