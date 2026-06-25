'use client';

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    User, 
    Truck, 
    MapPin, 
    MapPinOff, 
    Camera, 
    FileText, 
    AlertTriangle, 
    RotateCcw, 
    Lock 
} from 'lucide-react';
import { 
    formatTimeElapsed, 
    getTvGridCols, 
    formatFechaEntrega 
} from '@/modules/operations/lib/utils';

interface ActiveDeliveriesTabProps {
    assignments: any[];
    deliveries: any[];
    displayedDeliveries: any[];
    sortedAssignments: any[];
    tvMode: boolean;
    themeStyles: any;
    hasPermission: (permission: string) => boolean;
    handleOpenManualDelivery: (doc: any) => void;
    handleRevertDelivery: (doc: any) => void;
    setSelectedPhoto: (photo: { url: string; title: string } | null) => void;
}

function renderComentario(comentario: string, tvMode: boolean) {
    if (!comentario) return null;
    
    const isJson = comentario.trim().startsWith('{') && comentario.trim().endsWith('}');
    if (isJson) {
        try {
            const data = JSON.parse(comentario);
            
            let paymentMethod = data.metodo_pago || '';
            if (paymentMethod === 'ya_esta_pago') paymentMethod = 'Ya está pago';
            else if (paymentMethod === 'contra_entrega') paymentMethod = 'Contra entrega';
            else if (paymentMethod === 'credito') paymentMethod = 'Crédito';
            else if (paymentMethod === 'por_cobrar') paymentMethod = 'Por cobrar';

            const labelClass = tvMode ? "text-slate-400" : "text-slate-600 dark:text-slate-400";
            const valueClass = tvMode ? "text-slate-200" : "text-slate-950 dark:text-slate-100";

            return (
                <div className="space-y-1 text-[10px] text-left not-italic font-normal">
                    <div className="font-extrabold text-amber-500 dark:text-amber-400 uppercase tracking-wider text-[9px] mb-1">
                        📦 Detalles de Recolecta
                    </div>
                    {data.proveedor_contacto_nombre && (
                        <div>
                            <span className={`font-semibold ${labelClass}`}>Contacto: </span>
                            <span className={`font-bold ${valueClass}`}>
                                {data.proveedor_contacto_nombre} {data.proveedor_contacto_telefono ? `(${data.proveedor_contacto_telefono})` : ''}
                            </span>
                        </div>
                    )}
                    {(data.orden_compra || data.factura) && (
                        <div className="flex flex-wrap gap-x-2">
                            {data.orden_compra && (
                                <div>
                                    <span className={`font-semibold ${labelClass}`}>OC: </span>
                                    <span className={`font-bold ${valueClass} font-mono`}>{data.orden_compra}</span>
                                </div>
                            )}
                            {data.factura && (
                                <div>
                                    <span className={`font-semibold ${labelClass}`}>Factura: </span>
                                    <span className={`font-bold ${valueClass} font-mono`}>{data.factura}</span>
                                </div>
                            )}
                        </div>
                    )}
                    {paymentMethod && (
                        <div>
                            <span className={`font-semibold ${labelClass}`}>Pago: </span>
                            <span className={`font-bold ${valueClass}`}>{paymentMethod}</span>
                        </div>
                    )}
                    {data.horario_proveedor && (
                        <div>
                            <span className={`font-semibold ${labelClass}`}>Horario: </span>
                            <span className={`font-bold ${valueClass}`}>{data.horario_proveedor}</span>
                        </div>
                    )}
                    {data.detalle_adicional && (
                        <div>
                            <span className={`font-semibold ${labelClass}`}>Detalle: </span>
                            <span className={`font-bold ${valueClass} italic`}>&quot;{data.detalle_adicional}&quot;</span>
                        </div>
                    )}
                    {data.solicitante_nombre && (
                        <div>
                            <span className={`font-semibold ${labelClass}`}>Solicitante: </span>
                            <span className={`font-bold ${valueClass}`}>{data.solicitante_nombre}</span>
                        </div>
                    )}
                </div>
            );
        } catch (e) {
            // fallback
        }
    }
    
    return <span className="leading-normal">&quot;{comentario}&quot;</span>;
}

export function ActiveDeliveriesTab({
    assignments,
    deliveries,
    displayedDeliveries,
    sortedAssignments,
    tvMode,
    themeStyles,
    hasPermission,
    handleOpenManualDelivery,
    handleRevertDelivery,
    setSelectedPhoto
}: ActiveDeliveriesTabProps) {
    return (
        <div className="space-y-6">
            {assignments.length === 0 ? (
                <div className={`text-center p-12 border rounded-2xl text-xs font-semibold shadow-sm ${
                    tvMode ? `${themeStyles?.cardBg} ${themeStyles?.textMuted}` : 'bg-card text-muted-foreground'
                }`}>
                    No hay camiones ni rutas activas el día de hoy. Configure despachos en &quot;Operación y Despacho&quot;.
                </div>
            ) : tvMode ? (
                <div className="flex flex-col xl:flex-row gap-4 w-full items-stretch animate-in fade-in duration-500">
                    {/* Left Column: Grid of trucks */}
                    <div className="flex-1 min-w-0">
                        <div className={`grid ${getTvGridCols(sortedAssignments.length)} gap-4`}>
                            {sortedAssignments.map((ass) => {
                                const allDocsForAss = deliveries.filter(d => d.asignacion_id === ass.id || d.devolucion_asignacion_id === ass.id);
                                
                                // Calculate assignment stats
                                const total = allDocsForAss.length;
                                const complete = allDocsForAss.filter(d => d.estado === 'completo').length;
                                const incomplete = allDocsForAss.filter(d => d.estado === 'incompleto').length;
                                const rejected = allDocsForAss.filter(d => d.estado === 'rechazado').length;
                                const pending = allDocsForAss.filter(d => d.devolucion_asignacion_id !== ass.id && (d.estado === 'en_ruta' || d.estado === 'pendiente')).length;
                                const returnedCount = allDocsForAss.filter(d => d.devolucion_asignacion_id === ass.id).length;

                                const deliveredCount = complete + incomplete + rejected;
                                const pct = total > 0 ? Math.round((deliveredCount / total) * 100) : 0;

                                // Color semáforo logic
                                let borderTheme = 'border-l-blue-500';
                                let progressColor = 'bg-blue-500';
                                let statusText = 'En Progreso';
                                let pulseClass = '';

                                if (returnedCount > 0 && ass.activa === 0) {
                                    borderTheme = 'border-l-red-500/80';
                                    progressColor = 'bg-amber-500';
                                    statusText = 'Incompleta ❌';
                                } else if (rejected > 0) {
                                    borderTheme = 'border-l-red-600 dark:border-l-red-500';
                                    progressColor = 'bg-red-500';
                                    statusText = 'Rechazo ✗';
                                    pulseClass = 'animate-pulse border-red-500/30';
                                } else if (incomplete > 0) {
                                    borderTheme = 'border-l-amber-500';
                                    progressColor = 'bg-amber-500';
                                    statusText = 'Mermas ⚠';
                                } else if (total > 0 && complete === total) {
                                    borderTheme = 'border-l-emerald-500';
                                    progressColor = 'bg-emerald-500';
                                    statusText = 'Completado ✓';
                                } else {
                                    borderTheme = 'border-l-indigo-500 dark:border-l-indigo-400';
                                    progressColor = 'bg-indigo-500';
                                    statusText = 'En Ruta';
                                }

                                // Active theme tokens
                                const cardBgClass = themeStyles?.cardBg;
                                const textTitleClass = themeStyles?.textTitle;
                                const textMutedClass = themeStyles?.textMuted;

                                return (
                                    <div 
                                        key={ass.id} 
                                        className={`relative flex flex-col justify-between p-4.5 sm:p-5 rounded-xl border-l-4 ${borderTheme} ${cardBgClass} ${pulseClass} transition-all duration-300 min-h-[145px] md:min-h-[155px] group hover:scale-[1.02] shadow-md`}
                                        style={{ animationDuration: '2.5s' }}
                                    >
                                        {/* Card Header plate & status */}
                                        <div className="flex justify-between items-start gap-1">
                                            <div className="min-w-0 flex-1">
                                                <span className={`text-base sm:text-lg font-black font-mono tracking-wide leading-none block uppercase ${textTitleClass}`}>
                                                    {ass.vehiculo_placa}
                                                </span>
                                                <p className={`text-xs font-black truncate pt-1 ${textMutedClass} uppercase tracking-wider`}>
                                                    {ass.ruta_nombre}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className={`text-sm sm:text-base font-black font-mono leading-none ${
                                                    rejected > 0 ? 'text-red-500' :
                                                    incomplete > 0 ? 'text-amber-500' :
                                                    complete === total && total > 0 ? 'text-emerald-500' :
                                                    'text-indigo-500 dark:text-indigo-400'
                                                }`}>
                                                    {pct}%
                                                </span>
                                                <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest pt-1">
                                                    {deliveredCount}/{total}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Driver short info */}
                                        <div className="flex items-center justify-between text-xs font-bold text-slate-500 pt-2 border-t border-slate-800/10 dark:border-slate-800/20 mt-1">
                                            <span className="truncate max-w-[120px] text-left">
                                                👤 {ass.chofer_nombre.split(' ')[0]} {ass.chofer_nombre.split(' ')[1] || ''}
                                            </span>
                                            <span className="shrink-0 font-black text-[9px] sm:text-[10px] tracking-widest uppercase">
                                                {statusText}
                                            </span>
                                        </div>

                                        {ass.siguiente_cliente && (
                                            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-emerald-400 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg truncate max-w-full leading-none animate-pulse">
                                                <span className="shrink-0">➔ 📍 Hacia:</span>
                                                <span className="truncate flex-1">{ass.siguiente_cliente}</span>
                                                {ass.siguiente_cliente_fecha && (
                                                    <span className="shrink-0 text-[8px] sm:text-[9px] font-mono text-emerald-400/80 bg-emerald-500/20 px-1 py-0.5 rounded-md">
                                                        {formatTimeElapsed(ass.siguiente_cliente_fecha)}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Quick chips breakdown */}
                                        <div className="flex items-center gap-1.5 pt-2">
                                            {complete > 0 && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[9px] sm:text-[10px] font-black">
                                                    {complete}✓
                                                </span>
                                            )}
                                            {incomplete > 0 && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] sm:text-[10px] font-black">
                                                    {incomplete}⚠
                                                </span>
                                            )}
                                            {rejected > 0 && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 text-[9px] sm:text-[10px] font-black animate-pulse">
                                                    {rejected}✗
                                                </span>
                                            )}
                                            {pending > 0 && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400 text-[9px] sm:text-[10px] font-black">
                                                    {pending}🕒
                                                </span>
                                            )}
                                            {returnedCount > 0 && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 text-[9px] sm:text-[10px] font-black border border-red-500/20">
                                                    {returnedCount} Devueltas ❌
                                                </span>
                                            )}
                                        </div>

                                        {/* Thin progress bar */}
                                        <div className="w-full bg-slate-500/10 h-2 rounded-full overflow-hidden mt-3.5 shrink-0 shadow-inner">
                                            <div 
                                                className={`h-full ${progressColor} transition-all duration-500 rounded-full`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Column: Live Delivered Panel */}
                    {(() => {
                        const recentlyDelivered = [...displayedDeliveries]
                            .filter(d => d.entregado === 1 || ['completo', 'incompleto', 'rechazado'].includes(d.estado))
                            .sort((a, b) => {
                                const timeA = a.fecha_entrega ? new Date(a.fecha_entrega).getTime() : 0;
                                const timeB = b.fecha_entrega ? new Date(b.fecha_entrega).getTime() : 0;
                                if (timeA && timeB) return timeB - timeA;
                                const fallbackA = timeA || new Date(a.fecha_registro || a.updatedAt || 0).getTime();
                                const fallbackB = timeB || new Date(b.fecha_registro || b.updatedAt || 0).getTime();
                                return fallbackB - fallbackA;
                            });

                        return (
                            <div className={`w-full xl:w-80 shrink-0 flex flex-col p-4 rounded-xl border ${themeStyles?.cardBg} h-[600px] xl:h-[calc(100vh-140px)] min-h-[450px]`}>
                                <div className="flex items-center justify-between border-b pb-2 mb-3 border-slate-800/80 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                        <h3 className={`text-sm font-extrabold tracking-tight ${themeStyles?.textTitle}`}>
                                            📦 Entregas Recientes
                                        </h3>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-500">
                                        {recentlyDelivered.length} hoy
                                    </span>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                                    {recentlyDelivered.length === 0 ? (
                                        <div className="h-full flex items-center justify-center text-center p-4">
                                            <p className="text-[10px] font-semibold italic text-slate-500">
                                                Esperando transmisiones en vivo del bot de la calle...
                                            </p>
                                        </div>
                                    ) : (
                                        recentlyDelivered.map((d, idx) => {
                                            const date = new Date(d.fecha_entrega || d.fecha_registro || d.updatedAt || 0);
                                            const timeStr = !isNaN(date.getTime())
                                                ? date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false })
                                                : '--:--';

                                            const isLocked = d.telegram_lock_at && (new Date().getTime() - new Date(d.telegram_lock_at).getTime() < 5 * 60 * 1000);
                                            const isMostRecent = idx === 0;

                                            let statusColor = 'border-l-emerald-500';
                                            let badgeBg = 'bg-emerald-500/10 text-emerald-500';
                                            let statusLabel = 'completo';

                                            if (d.estado === 'rechazado') {
                                                statusColor = 'border-l-red-500';
                                                badgeBg = 'bg-red-500/10 text-red-500';
                                                statusLabel = 'rechazado';
                                            } else if (d.estado === 'incompleto') {
                                                statusColor = 'border-l-amber-500';
                                                badgeBg = 'bg-amber-500/10 text-amber-500';
                                                statusLabel = 'incompleto';
                                            }

                                            return (
                                                <div 
                                                    key={d.id}
                                                    className={`p-3 rounded-xl border flex flex-col gap-2.5 transition-all text-left text-xs ${
                                                        isLocked 
                                                            ? 'bg-cyan-500/5 border-cyan-500/30 shadow-md shadow-cyan-500/5' 
                                                            : 'bg-slate-950 border-slate-800/60'
                                                    } border-l-4 ${statusColor} ${
                                                        isMostRecent ? 'animate-in fade-in slide-in-from-top-3 duration-500' : ''
                                                    }`}
                                                >
                                                    {/* Header row with Plate and time */}
                                                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                                                        <span className="font-black font-mono text-indigo-400 flex items-center gap-1">
                                                            🚚 {d.vehiculo_placa || 'PLACA'}
                                                        </span>
                                                        <span className="flex items-center gap-1 font-mono text-[9px]">
                                                            🕒 {timeStr}
                                                        </span>
                                                    </div>

                                                    {/* Doc number and Client Name */}
                                                    <div className="min-w-0">
                                                        <span className="text-xs font-black font-mono tracking-tight leading-none block text-slate-100">
                                                            {d.documento_numero}
                                                        </span>
                                                        <p className="text-[10px] font-bold truncate pt-1 text-slate-300">
                                                            {d.cliente_nombre}
                                                        </p>
                                                    </div>

                                                    {/* Status and lock badges row */}
                                                    <div className="flex flex-col gap-1 items-start pt-0.5">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {isLocked && (
                                                                <Badge className="bg-cyan-500 text-white font-extrabold text-[8px] px-1.5 py-0.5 animate-pulse border-none gap-1 flex items-center shrink-0">
                                                                    <Lock className="w-2 h-2" />
                                                                    Chofer...
                                                                </Badge>
                                                            )}

                                                            <Badge className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 border-none shrink-0 ${badgeBg}`}>
                                                                {statusLabel}
                                                            </Badge>

                                                            {d.estado !== 'pendiente' && d.estado !== 'en_ruta' && (!d.latitud || !d.longitud) ? (
                                                                <Badge className="bg-red-500/10 text-red-500 border border-red-500/30 text-[8px] font-extrabold px-1.5 py-0.5 shrink-0 flex items-center gap-1">
                                                                    <MapPinOff className="w-2.5 h-2.5" />
                                                                    Sin GPS 🔴
                                                                </Badge>
                                                            ) : d.estado !== 'pendiente' && d.estado !== 'en_ruta' && (
                                                                <a 
                                                                    href={`https://www.google.com/maps/search/?api=1&query=${d.latitud},${d.longitud}`}
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] font-extrabold px-1.5 py-0.5 shrink-0 flex items-center gap-1 rounded transition-all hover:underline cursor-pointer"
                                                                >
                                                                    <MapPin className="w-2.5 h-2.5" />
                                                                    Con GPS 🟢
                                                                </a>
                                                            )}
                                                        </div>
                                                        {d.fecha_entrega && (
                                                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-400 font-mono mt-0.5">
                                                                ⏱️ {formatFechaEntrega(d.fecha_entrega)}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Document comments */}
                                                    {d.comentario && (
                                                        <p className="text-[9px] border rounded px-2 py-1 font-medium italic bg-slate-950/80 border-slate-900 text-slate-400 leading-normal">
                                                            {renderComentario(d.comentario, true)}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            ) : (
                /* Standard Matrix Grid (Modo Escritorio) */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedAssignments.map((ass) => {
                        const allDocsForAss = deliveries.filter(d => d.asignacion_id === ass.id || d.devolucion_asignacion_id === ass.id);
                        const docsForAss = displayedDeliveries.filter(d => d.asignacion_id === ass.id || d.devolucion_asignacion_id === ass.id);
                        
                        // Calculate assignment stats
                        const total = allDocsForAss.length;
                        const complete = allDocsForAss.filter(d => d.estado === 'completo').length;
                        const incomplete = allDocsForAss.filter(d => d.estado === 'incompleto').length;
                        const rejected = allDocsForAss.filter(d => d.estado === 'rechazado').length;
                        const pending = allDocsForAss.filter(d => d.devolucion_asignacion_id !== ass.id && (d.estado === 'en_ruta' || d.estado === 'pendiente')).length;
                        const returnedCount = allDocsForAss.filter(d => d.devolucion_asignacion_id === ass.id).length;

                        return (
                            <Card 
                                key={ass.id} 
                                className={`border-none shadow-md overflow-hidden relative flex flex-col ${
                                    ass.activa === 0
                                        ? (tvMode 
                                            ? 'bg-emerald-950/30 border border-emerald-800/50 border-l-4 border-l-emerald-500' 
                                            : 'bg-emerald-50/60 dark:bg-emerald-950/15 border border-emerald-200 dark:border-emerald-800/30 border-l-4 border-l-emerald-500')
                                        : (tvMode ? themeStyles?.cardBg : 'bg-card')
                                }`}
                            >
                                <div className={`p-4 border-b flex items-start justify-between ${
                                    ass.activa === 0
                                        ? 'bg-emerald-500/5 border-emerald-100 dark:border-emerald-950/30'
                                        : (tvMode ? 'bg-slate-950/40 border-slate-800' : 'bg-muted/40 border-b border-muted/50')
                                }`}>
                                    <div className="space-y-1">
                                        <span className={`text-sm font-black flex flex-wrap items-center gap-1.5 ${
                                            ass.activa === 0 
                                                ? 'text-emerald-600 dark:text-emerald-400' 
                                                : (tvMode ? 'text-indigo-400' : 'text-indigo-600')
                                        }`}>
                                            <MapPin className={`w-4 h-4 ${
                                                ass.activa === 0 
                                                    ? 'text-emerald-500' 
                                                    : (tvMode ? 'text-indigo-400' : 'text-indigo-500')
                                            }`} />
                                            {ass.ruta_nombre}
                                            {ass.activa === 0 && (
                                                <>
                                                    <Badge className="bg-emerald-500 text-white font-extrabold text-[9px] px-1.5 py-0 border-none shrink-0">
                                                        COMPLETADA
                                                    </Badge>
                                                    {ass.fecha_completada && (
                                                        <span className="text-[10px] font-bold text-muted-foreground dark:text-slate-400 font-mono">
                                                            ({formatFechaEntrega(ass.fecha_completada)})
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </span>
                                        <div className={`space-y-0.5 text-xs font-bold ${
                                            ass.activa === 0 
                                                ? 'text-foreground/80 dark:text-slate-300' 
                                                : (tvMode ? 'text-slate-300' : 'text-foreground/80')
                                        }`}>
                                            <div className="flex items-center gap-1">
                                                <User className={`w-3.5 h-3.5 ${
                                                    ass.activa === 0 
                                                        ? 'text-emerald-600/70 dark:text-slate-400' 
                                                        : (tvMode ? 'text-slate-400' : 'text-muted-foreground')
                                                }`} />
                                                {ass.chofer_nombre}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Truck className={`w-3.5 h-3.5 ${
                                                    ass.activa === 0 
                                                        ? 'text-emerald-600/70 dark:text-slate-400' 
                                                        : (tvMode ? 'text-slate-400' : 'text-muted-foreground')
                                                }`} />
                                                {ass.vehiculo_placa}
                                            </div>

                                            {ass.siguiente_cliente && (
                                                <div className="mt-2 flex items-center gap-1.5 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/5 px-2 py-1 rounded-lg border border-indigo-500/10 animate-pulse max-w-xs truncate">
                                                    <span className="shrink-0 flex h-2 w-2 relative">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                                    </span>
                                                    <span className="font-semibold text-[10px] uppercase text-slate-500 dark:text-slate-400 shrink-0">Siguiente parada:</span>
                                                    <span className="truncate flex-1">{ass.siguiente_cliente}</span>
                                                    {ass.siguiente_cliente_fecha && (
                                                        <span className="shrink-0 text-[9px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/25 px-1 py-0.5 rounded ml-1">
                                                            {formatTimeElapsed(ass.siguiente_cliente_fecha)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stats Badge chips */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Badge className="bg-emerald-500/10 text-emerald-500 border-none text-[10px] font-extrabold px-1.5 py-0">{complete}✓</Badge>
                                        <Badge className="bg-amber-500/10 text-amber-500 border-none text-[10px] font-extrabold px-1.5 py-0">{incomplete}⚠</Badge>
                                        <Badge className="bg-red-500/10 text-red-500 border-none text-[10px] font-extrabold px-1.5 py-0">{rejected}✗</Badge>
                                        <Badge className="bg-blue-500/10 text-blue-500 border-none text-[10px] font-extrabold px-1.5 py-0">{pending}🕒</Badge>
                                        {returnedCount > 0 && (
                                            <Badge className="bg-red-500/10 text-red-500 border-none text-[10px] font-extrabold px-1.5 py-0">
                                                {returnedCount} Devueltas ❌
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                <CardContent className="p-4 flex-1 space-y-3.5">
                                    {docsForAss.length === 0 ? (
                                        <div className={`text-center p-6 text-xs font-semibold italic ${tvMode ? 'text-slate-500' : 'text-muted-foreground'}`}>
                                            Sin pedidos asignados el día de hoy.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {docsForAss.map((doc) => {
                                                const isLocked = doc.telegram_lock_at && (new Date().getTime() - new Date(doc.telegram_lock_at).getTime() < 5 * 60 * 1000);
                                                return (
                                                    <div 
                                                        key={doc.id}
                                                        className={`p-3 rounded-xl border flex flex-col gap-2.5 transition-all ${
                                                            isLocked 
                                                                ? 'bg-cyan-500/5 border-cyan-500/30 shadow-md shadow-cyan-500/5' 
                                                                : tvMode 
                                                                    ? 'bg-slate-950 border-slate-800' 
                                                                    : 'bg-muted/10 border-muted/50'
                                                        }`}
                                                    >
                                                        {/* Doc header row */}
                                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                                                            <div className="min-w-0">
                                                                <span className={`text-xs font-black font-mono tracking-tight leading-none block ${tvMode ? 'text-slate-100' : 'text-foreground'}`}>
                                                                    {doc.documento_numero}
                                                                </span>
                                                                <p className={`text-[10px] font-bold truncate pt-0.5 ${tvMode ? 'text-slate-300' : 'text-foreground/70'}`}>
                                                                    {doc.cliente_nombre}
                                                                </p>
                                                            </div>

                                                            <div className="flex flex-col gap-1 items-end shrink-0 sm:justify-end">
                                                                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                                                                    {isLocked && (
                                                                        <Badge className="bg-cyan-500 text-white font-extrabold text-[9px] px-1.5 py-0 animate-pulse border-none gap-1 flex items-center">
                                                                            <Lock className="w-2.5 h-2.5" />
                                                                            Chofer reportando...
                                                                        </Badge>
                                                                    )}

                                                                    <Badge className={`text-[8px] font-extrabold uppercase px-1.5 py-0 border-none ${
                                                                        doc.devolucion_asignacion_id === ass.id ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                                                                        doc.estado === 'completo' ? 'bg-emerald-500/10 text-emerald-500' :
                                                                        doc.estado === 'incompleto' ? 'bg-amber-500/10 text-amber-500' :
                                                                        doc.estado === 'rechazado' ? 'bg-red-500/10 text-red-500' :
                                                                        'bg-blue-500/10 text-blue-500'
                                                                    }`}>
                                                                        {doc.devolucion_asignacion_id === ass.id ? 'DEVUELTA ❌' : doc.estado}
                                                                    </Badge>

                                                                    {doc.estado !== 'pendiente' && doc.estado !== 'en_ruta' && (!doc.latitud || !doc.longitud) ? (
                                                                        <Badge className="bg-red-500/10 text-red-500 border border-red-500/30 text-[8px] font-extrabold px-1.5 py-0 shrink-0 flex items-center gap-1">
                                                                            <MapPinOff className="w-2.5 h-2.5" />
                                                                            Sin GPS 🔴
                                                                        </Badge>
                                                                    ) : doc.estado !== 'pendiente' && doc.estado !== 'en_ruta' && (
                                                                        <a 
                                                                            href={`https://www.google.com/maps/search/?api=1&query=${doc.latitud},${doc.longitud}`}
                                                                            target="_blank" 
                                                                            rel="noopener noreferrer"
                                                                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] font-extrabold px-1.5 py-0 shrink-0 flex items-center gap-1 rounded transition-all hover:underline cursor-pointer"
                                                                        >
                                                                            <MapPin className="w-2.5 h-2.5" />
                                                                            Con GPS 🟢
                                                                        </a>
                                                                    )}
                                                                </div>
                                                                {doc.fecha_entrega && (
                                                                    <span className="text-[8px] font-bold text-slate-400 dark:text-slate-400 font-mono">
                                                                        {formatFechaEntrega(doc.fecha_entrega)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Document comments / logs if exist */}
                                                        {doc.comentario && (
                                                            <p className={`text-[10px] border rounded px-2 py-1 font-medium italic ${
                                                                tvMode 
                                                                    ? 'bg-slate-950 border-slate-800 text-slate-400' 
                                                                    : 'bg-muted/35 dark:bg-slate-900 border-muted/40 text-muted-foreground'
                                                            }`}>
                                                                {renderComentario(doc.comentario, tvMode)}
                                                            </p>
                                                        )}

                                                        {/* Support photos row */}
                                                        {(doc.foto_evidencia || doc.foto_factura) && (
                                                            <div className="flex flex-wrap gap-2 pt-1">
                                                                {doc.foto_evidencia && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => setSelectedPhoto({ url: `/api/fleet/files/${doc.foto_evidencia}`, title: "Evidencia de Entrega" })}
                                                                        className={`rounded-lg h-7 text-[10px] font-extrabold gap-1.5 border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 ${
                                                                            tvMode ? 'border-slate-800' : ''
                                                                        }`}
                                                                    >
                                                                        <Camera className="w-3.5 h-3.5" />
                                                                        Ver Evidencia
                                                                    </Button>
                                                                )}
                                                                {doc.foto_factura && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => setSelectedPhoto({ 
                                                                            url: `/api/fleet/files/${doc.foto_factura}`, 
                                                                            title: doc.tipo_documento === 'recoger' ? "Comprobante Firmado" : "Factura Firmada" 
                                                                        })}
                                                                        className={`rounded-lg h-7 text-[10px] font-extrabold gap-1.5 border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 ${
                                                                            tvMode ? 'border-slate-800' : ''
                                                                        }`}
                                                                    >
                                                                        <FileText className="w-3.5 h-3.5" />
                                                                        {doc.tipo_documento === 'recoger' ? 'Comprobante Firmado' : 'Factura Firmada'}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Contingency report trigger */}
                                                        {doc.estado !== 'completo' && doc.estado !== 'incompleto' && doc.estado !== 'rechazado' && hasPermission('deliveries:write') && (
                                                            <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleOpenManualDelivery(doc)}
                                                                    className={`rounded-lg h-7 text-[10px] font-extrabold gap-1 border-muted/80 shadow-sm ${
                                                                        tvMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white' : ''
                                                                    }`}
                                                                >
                                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                                                    {doc.tipo_documento === 'recoger' ? 'Recolecta Manual' : 'Entrega Manual'}
                                                                </Button>
                                                            )}

                                                            {/* Revert delivery trigger */}
                                                            {['completo', 'incompleto', 'rechazado'].includes(doc.estado) && hasPermission('deliveries:write') && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleRevertDelivery(doc)}
                                                                    className={`rounded-lg h-7 text-[10px] font-extrabold gap-1 border-muted/80 shadow-sm text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 ${
                                                                        tvMode ? 'bg-slate-900 border-slate-800 hover:bg-slate-800' : ''
                                                                    }`}
                                                                >
                                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                                    Revertir a Pendiente
                                                                </Button>
                                                            )}
                                                        </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
