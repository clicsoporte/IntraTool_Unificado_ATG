'use client';

import React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Truck, MapPin, MapPinOff } from 'lucide-react';
import { calculateAssignmentDurations } from '@/modules/operations/lib/utils';

interface LogisticsMetricsTabProps {
    assignments: any[];
    deliveries: any[];
}

export function LogisticsMetricsTab({ assignments, deliveries }: LogisticsMetricsTabProps) {
    // Tarjetas de KPI Promedios
    const activeOrCompleted = assignments || [];
    let totalDeliveryMins = 0;
    let countDelivery = 0;
    let totalReturnMins = 0;
    let countReturn = 0;
    let totalCycleMins = 0;
    let countCycle = 0;
    
    let totalDocs = 0;
    let completedDocsCount = 0;

    activeOrCompleted.forEach(ass => {
        const docsForAss = (deliveries || []).filter(d => d.asignacion_id === ass.id);
        totalDocs += docsForAss.length;
        completedDocsCount += docsForAss.filter(d => d.entregado === 1).length;

        const metrics = calculateAssignmentDurations(ass, docsForAss);
        if (metrics.activeDeliveryMins > 0) {
            totalDeliveryMins += metrics.activeDeliveryMins;
            countDelivery++;
        }
        if (metrics.returnMins > 0) {
            totalReturnMins += metrics.returnMins;
            countReturn++;
        }
        if (metrics.totalMins > 0) {
            totalCycleMins += metrics.totalMins;
            countCycle++;
        }
    });

    const avgDeliveryTime = countDelivery > 0 
        ? `${Math.floor((totalDeliveryMins / countDelivery) / 60)}h ${Math.round((totalDeliveryMins / countDelivery) % 60)}m`
        : 'N/A';
        
    const avgReturnTime = countReturn > 0 
        ? `${Math.floor((totalReturnMins / countReturn) / 60)}h ${Math.round((totalReturnMins / countReturn) % 60)}m`
        : 'N/A';

    const avgCycleTime = countCycle > 0 
        ? `${Math.floor((totalCycleMins / countCycle) / 60)}h ${Math.round((totalCycleMins / countCycle) % 60)}m`
        : 'N/A';
        
    const successRate = totalDocs > 0 
        ? `${Math.round((completedDocsCount / totalDocs) * 100)}%`
        : 'N/A';

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Tarjetas de KPI Promedios */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-none shadow bg-card relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 rounded-full bg-blue-500/10" />
                    <CardContent className="p-4 flex flex-col justify-between h-24">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Promedio en Despacho 🚚</span>
                        <span className="text-2xl font-black font-mono tracking-tight text-blue-600 dark:text-blue-400">{avgDeliveryTime}</span>
                    </CardContent>
                </Card>
                <Card className="border-none shadow bg-card relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 rounded-full bg-indigo-500/10" />
                    <CardContent className="p-4 flex flex-col justify-between h-24">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Promedio de Retorno 🚀</span>
                        <span className="text-2xl font-black font-mono tracking-tight text-indigo-600 dark:text-indigo-400">{avgReturnTime}</span>
                    </CardContent>
                </Card>
                <Card className="border-none shadow bg-card relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 rounded-full bg-emerald-500/10" />
                    <CardContent className="p-4 flex flex-col justify-between h-24">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Ciclo Logístico Promedio ⏱️</span>
                        <span className="text-2xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400">{avgCycleTime}</span>
                    </CardContent>
                </Card>
                <Card className="border-none shadow bg-card relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 rounded-full bg-purple-500/10" />
                    <CardContent className="p-4 flex flex-col justify-between h-24">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Tasa de Completitud 📦</span>
                        <span className="text-2xl font-black font-mono tracking-tight text-purple-600 dark:text-purple-400">
                            {successRate} <span className="text-[10px] text-muted-foreground font-bold">({completedDocsCount}/{totalDocs})</span>
                        </span>
                    </CardContent>
                </Card>
            </div>

            {/* Lista Expandible de Rutas */}
            <div className="space-y-4">
                {assignments.length === 0 ? (
                    <div className="text-center p-12 bg-card border rounded-2xl text-xs font-semibold text-muted-foreground">
                        No hay rutas activas registradas el día de hoy para analizar tiempos.
                    </div>
                ) : (
                    assignments.map((ass) => {
                        const docsForAss = (deliveries || []).filter(d => d.asignacion_id === ass.id);
                        const metrics = calculateAssignmentDurations(ass, docsForAss);
                        
                        const totalCount = docsForAss.length;
                        const successCount = docsForAss.filter(d => d.estado === 'completo').length;
                        const incompleteCount = docsForAss.filter(d => d.estado === 'incompleto').length;
                        const rejectedCount = docsForAss.filter(d => d.estado === 'rechazado').length;

                        return (
                            <Card key={ass.id} className="border border-muted/70 shadow-sm bg-card hover:shadow-md transition-shadow duration-300 rounded-2xl overflow-hidden">
                                <CardHeader className="p-5 pb-3 bg-muted/20 border-b border-muted/50">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-base font-extrabold text-foreground">{ass.ruta_nombre}</span>
                                                <Badge variant={ass.activa === 1 ? 'default' : 'secondary'} className="rounded-full text-[9px] font-black tracking-widest uppercase">
                                                    {ass.activa === 1 ? 'En Ruta ⚡' : 'Cerrada 🏁'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
                                                <div className="flex items-center gap-1">
                                                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                                                    <span>{ass.chofer_nombre}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                                                    <span>{ass.vehiculo_placa}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:flex items-center gap-3 md:gap-6 font-mono text-center shrink-0">
                                            <div className="flex flex-col bg-background/50 border border-muted/65 p-2 rounded-xl w-24">
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase">Despacho</span>
                                                <span className="text-xs font-black text-blue-600 dark:text-blue-400">{metrics.activeDeliveryTime}</span>
                                            </div>
                                            <div className="flex flex-col bg-background/50 border border-muted/65 p-2 rounded-xl w-24">
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase">Retorno</span>
                                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{metrics.returnTime}</span>
                                            </div>
                                            <div className="flex flex-col bg-background/50 border border-muted/65 p-2 rounded-xl w-24 col-span-2 md:col-span-1">
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase">Ciclo Total</span>
                                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{metrics.totalTime}</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                
                                <CardContent className="p-5 space-y-5">
                                    {/* Conteo de entregas */}
                                    <div className="flex items-center justify-between text-xs border-b border-muted/50 pb-3">
                                        <span className="font-bold text-muted-foreground">Rendimiento Operativo de Entregas:</span>
                                        <div className="flex items-center gap-2 font-bold font-mono">
                                            <span className="text-emerald-500">{successCount}✓</span>
                                            <span className="text-amber-500">{incompleteCount}⚠</span>
                                            <span className="text-red-500">{rejectedCount}✗</span>
                                            <span className="text-muted-foreground font-sans">| Total:</span>
                                            <span className="text-foreground">{successCount + incompleteCount + rejectedCount} / {totalCount}</span>
                                        </div>
                                    </div>

                                    {/* Línea de Tiempo de Paradas */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Línea de Tiempo de Paradas y Tránsito</h4>
                                        
                                        <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 pl-6 space-y-6 pt-2">
                                            {/* Punto de Inicio */}
                                            <div className="relative">
                                                <span className="absolute -left-[38px] top-0.5 flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 border-2 border-blue-500 text-blue-500 text-xs shadow-sm bg-card shrink-0">
                                                    🌅
                                                </span>
                                                <div className="space-y-0.5">
                                                    <p className="text-xs font-extrabold text-foreground">Salida de Empresa (Inicio de Ruta)</p>
                                                    <p className="text-[10px] text-muted-foreground font-mono font-bold">
                                                        {ass.fecha_creacion ? new Date(ass.fecha_creacion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Paradas de Clientes */}
                                            {metrics.stops.map((stop: any, idx: number) => {
                                                const docStateColor = stop.estado === 'completo' 
                                                    ? 'text-emerald-500 border-emerald-500 bg-emerald-500/10' 
                                                    : stop.estado === 'incompleto' 
                                                        ? 'text-amber-500 border-amber-500 bg-amber-500/10' 
                                                        : 'text-red-500 border-red-500 bg-red-500/10';

                                                const emoji = stop.estado === 'completo' ? '✅' : stop.estado === 'incompleto' ? '⚠️' : '❌';

                                                return (
                                                    <div key={idx} className="relative">
                                                        {/* Indicador de Tránsito Inter-Cliente */}
                                                        <div className="absolute -left-[38px] -top-6 flex items-center justify-center w-[48px] h-4 rounded bg-muted/60 dark:bg-slate-800 text-[9px] font-extrabold text-slate-500 font-mono shadow-sm border border-muted/50">
                                                            {stop.transit}
                                                        </div>

                                                        <span className={`absolute -left-[38px] top-0.5 flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs shadow-sm bg-card shrink-0 ${docStateColor}`}>
                                                            {emoji}
                                                        </span>
                                                        <div className="space-y-0.5">
                                                            <p className="text-xs font-extrabold text-foreground">📍 {stop.cliente_nombre}</p>
                                                            <p className="text-[10px] text-muted-foreground font-mono font-bold">
                                                                Hora Reporte: {new Date(stop.dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (Doc: #{stop.docNum})
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Inicio Retorno */}
                                            {ass.fecha_inicio_retorno && (
                                                <div className="relative">
                                                    {/* Tránsito inter-cliente al inicio de retorno */}
                                                    <div className="absolute -left-[38px] -top-6 flex items-center justify-center w-[48px] h-4 rounded bg-muted/60 dark:bg-slate-800 text-[9px] font-extrabold text-slate-500 font-mono shadow-sm border border-muted/50">
                                                        {metrics.returnTransit}
                                                    </div>

                                                    <span className="absolute -left-[38px] top-0.5 flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/10 border-2 border-indigo-500 text-indigo-500 text-xs shadow-sm bg-card shrink-0">
                                                        🚀
                                                    </span>
                                                    <div className="space-y-0.5">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <p className="text-xs font-extrabold text-foreground">Inicio de Retorno a la Empresa</p>
                                                            {ass.latitud_retorno && ass.longitud_retorno ? (
                                                                <a 
                                                                    href={`https://www.google.com/maps/search/?api=1&query=${ass.latitud_retorno},${ass.longitud_retorno}`}
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] font-extrabold px-1.5 py-0.5 shrink-0 flex items-center gap-1 rounded transition-all hover:underline cursor-pointer"
                                                                >
                                                                    <MapPin className="w-2.5 h-2.5" />
                                                                    Con GPS 🟢
                                                                </a>
                                                            ) : (
                                                                <Badge className="bg-red-500/10 text-red-500 border border-red-500/30 text-[8px] font-extrabold px-1.5 py-0.5 shrink-0 flex items-center gap-1">
                                                                    <MapPinOff className="w-2.5 h-2.5" />
                                                                    Sin GPS 🔴
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-muted-foreground font-mono font-bold">
                                                            Hora Reporte: {new Date(ass.fecha_inicio_retorno).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Llegada a Empresa */}
                                            {ass.fecha_completada && (
                                                <div className="relative">
                                                    {/* Tránsito del retorno */}
                                                    <div className="absolute -left-[38px] -top-6 flex items-center justify-center w-[48px] h-4 rounded bg-muted/60 dark:bg-slate-800 text-[9px] font-extrabold text-slate-500 font-mono shadow-sm border border-muted/50">
                                                        {metrics.returnTime}
                                                    </div>

                                                    <span className="absolute -left-[38px] top-0.5 flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 text-xs shadow-sm bg-card shrink-0">
                                                        🏁
                                                    </span>
                                                    <div className="space-y-0.5">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <p className="text-xs font-extrabold text-foreground">Llegada a Empresa (Ruta Finalizada)</p>
                                                            {ass.latitud_llegada && ass.longitud_llegada ? (
                                                                <a 
                                                                    href={`https://www.google.com/maps/search/?api=1&query=${ass.latitud_llegada},${ass.longitud_llegada}`}
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] font-extrabold px-1.5 py-0.5 shrink-0 flex items-center gap-1 rounded transition-all hover:underline cursor-pointer"
                                                                >
                                                                    <MapPin className="w-2.5 h-2.5" />
                                                                    Con GPS 🟢
                                                                </a>
                                                            ) : (
                                                                <Badge className="bg-red-500/10 text-red-500 border border-red-500/30 text-[8px] font-extrabold px-1.5 py-0.5 shrink-0 flex items-center gap-1">
                                                                    <MapPinOff className="w-2.5 h-2.5" />
                                                                    Sin GPS 🔴
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-muted-foreground font-mono font-bold">
                                                            Hora Reporte: {new Date(ass.fecha_completada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}
