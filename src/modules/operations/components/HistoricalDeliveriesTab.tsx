'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
    Calendar, 
    Search, 
    RefreshCw, 
    MapPin, 
    MapPinOff, 
    User, 
    Truck, 
    Camera, 
    FileText, 
    RotateCcw 
} from 'lucide-react';
import { formatFechaEntrega } from '@/modules/operations/lib/utils';

interface HistoricalDeliveriesTabProps {
    historyDate: string;
    setHistoryDate: (date: string) => void;
    loadHistoryData: (date: string) => Promise<void>;
    loadingHistory: boolean;
    historicalAssignments: any[];
    historicalDeliveries: any[];
    tvMode: boolean;
    hasPermission: (permission: string) => boolean;
    handleRevertDelivery: (doc: any) => void;
    setSelectedPhoto: (photo: { url: string; title: string } | null) => void;
}

export function HistoricalDeliveriesTab({
    historyDate,
    setHistoryDate,
    loadHistoryData,
    loadingHistory,
    historicalAssignments,
    historicalDeliveries,
    tvMode,
    hasPermission,
    handleRevertDelivery,
    setSelectedPhoto
}: HistoricalDeliveriesTabProps) {
    return (
        <div className="space-y-6">
            {/* Historical Controls */}
            <div className={`p-4 border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                tvMode ? 'bg-slate-900/60 border-slate-800' : 'bg-card'
            }`}>
                <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-blue-500" />
                    <div className="space-y-0.5">
                        <h3 className="text-sm font-bold">Consultar Historial de Entregas</h3>
                        <p className="text-[10px] text-muted-foreground font-medium">Seleccione una fecha para revisar el desglose y trazabilidad de los despachos cerrados.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Input
                        type="date"
                        value={historyDate}
                        onChange={(e) => setHistoryDate(e.target.value)}
                        className={`h-9 w-40 rounded-xl font-bold text-xs ${
                            tvMode ? 'bg-slate-950 border-slate-800 text-white' : ''
                        }`}
                    />
                    <Button
                        size="sm"
                        onClick={() => loadHistoryData(historyDate)}
                        className="rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-9"
                        disabled={loadingHistory}
                    >
                        <Search className="w-3.5 h-3.5" />
                        Buscar
                    </Button>
                </div>
            </div>

            {/* Historical Content */}
            {loadingHistory ? (
                <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse">
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                        <p className="text-muted-foreground font-medium">Consultando registros históricos en base de datos...</p>
                    </div>
                </div>
            ) : historicalAssignments.length === 0 ? (
                <div className={`text-center p-12 border rounded-2xl text-xs font-semibold shadow-sm ${
                    tvMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-card text-muted-foreground'
                }`}>
                    No se encontraron rutas ni despachos asignados para la fecha seleccionada: <span className="font-extrabold text-blue-500">{historyDate}</span>.
                </div>
            ) : (
                <div className={`grid grid-cols-1 ${tvMode ? 'md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-3'} gap-6`}>
                    {historicalAssignments.map((ass) => {
                        const docsForAss = historicalDeliveries.filter(d => d.asignacion_id === ass.id || d.devolucion_asignacion_id === ass.id);
                        
                        // Calculate assignment stats
                        const total = docsForAss.length;
                        const complete = docsForAss.filter(d => d.estado === 'completo').length;
                        const incomplete = docsForAss.filter(d => d.estado === 'incompleto').length;
                        const rejected = docsForAss.filter(d => d.estado === 'rechazado').length;
                        const pending = docsForAss.filter(d => d.devolucion_asignacion_id !== ass.id && (d.estado === 'en_ruta' || d.estado === 'pendiente')).length;
                        const returnedCount = docsForAss.filter(d => d.devolucion_asignacion_id === ass.id).length;

                        return (
                            <Card 
                                key={ass.id} 
                                className={`border-none shadow-md overflow-hidden relative flex flex-col border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-950/20`}
                            >
                                <div className={`p-4 border-b flex items-start justify-between bg-emerald-500/5 border-emerald-100 dark:border-emerald-950/30`}>
                                    <div className="space-y-1">
                                        <span className="text-sm font-black flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                            <MapPin className="w-4 h-4 text-emerald-500" />
                                            {ass.ruta_nombre}
                                            <Badge className="bg-emerald-500 text-white font-extrabold text-[9px] px-1.5 py-0 border-none shrink-0">
                                                CERRADA
                                            </Badge>
                                        </span>
                                        <div className="space-y-0.5 text-xs font-bold text-foreground/80 dark:text-slate-300">
                                            <div className="flex items-center gap-1">
                                                <User className="w-3.5 h-3.5 text-muted-foreground dark:text-slate-400" />
                                                {ass.chofer_nombre}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Truck className="w-3.5 h-3.5 text-muted-foreground dark:text-slate-400" />
                                                {ass.vehiculo_placa}
                                            </div>
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
                                        <div className="text-center p-6 text-xs font-semibold italic text-muted-foreground">
                                            Sin pedidos asignados en esta ruta.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {docsForAss.map((doc) => (
                                                <div 
                                                    key={doc.id}
                                                    className="p-3 rounded-xl border flex flex-col gap-2.5 transition-all bg-muted/10 border-muted/50 dark:bg-slate-900/40 dark:border-slate-800"
                                                >
                                                    {/* Doc header row */}
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="min-w-0">
                                                            <span className="text-xs font-black font-mono tracking-tight leading-none block text-foreground dark:text-slate-200">
                                                                {doc.documento_numero}
                                                            </span>
                                                            <p className="text-[10px] font-bold truncate pt-0.5 text-foreground/70 dark:text-slate-300">
                                                                {doc.cliente_nombre}
                                                            </p>
                                                        </div>

                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <Badge className={`text-[8px] font-extrabold uppercase px-1.5 py-0 border-none ${
                                                                doc.devolucion_asignacion_id === ass.id ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                                                                doc.estado === 'completo' ? 'bg-emerald-500/10 text-emerald-500' :
                                                                doc.estado === 'incompleto' ? 'bg-amber-500/10 text-amber-500' :
                                                                doc.estado === 'rechazado' ? 'bg-red-500/10 text-red-500' :
                                                                'bg-blue-500/10 text-blue-500'
                                                            }`}>
                                                                {doc.devolucion_asignacion_id === ass.id ? 'DEVUELTA ❌' : doc.estado} {doc.fecha_entrega ? ` | ${formatFechaEntrega(doc.fecha_entrega)}` : ''}
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
                                                    </div>

                                                    {/* Document comments / logs if exist */}
                                                    {doc.comentario && (
                                                        <p className="text-[10px] border rounded px-2 py-1 font-medium italic bg-muted/35 dark:bg-slate-900/60 border-muted/40 text-muted-foreground">
                                                            &quot;{doc.comentario}&quot;
                                                        </p>
                                                    )}

                                                    {/* Support photos and action row */}
                                                    {(doc.foto_evidencia || doc.foto_factura || (['completo', 'incompleto', 'rechazado'].includes(doc.estado) && hasPermission('deliveries:write'))) && (
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                            {doc.foto_evidencia && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => setSelectedPhoto({ url: `/api/fleet/files/${doc.foto_evidencia}`, title: "Evidencia de Entrega" })}
                                                                    className="rounded-lg h-7 text-[10px] font-extrabold gap-1.5 border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                                                                >
                                                                    <Camera className="w-3.5 h-3.5" />
                                                                    Ver Evidencia
                                                                </Button>
                                                            )}
                                                            {doc.foto_factura && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => setSelectedPhoto({ url: `/api/fleet/files/${doc.foto_factura}`, title: "Factura Firmada" })}
                                                                    className="rounded-lg h-7 text-[10px] font-extrabold gap-1.5 border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5" />
                                                                    Factura Firmada
                                                                </Button>
                                                            )}
                                                            {['completo', 'incompleto', 'rechazado'].includes(doc.estado) && hasPermission('deliveries:write') && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleRevertDelivery(doc)}
                                                                    className="rounded-lg h-7 text-[10px] font-extrabold gap-1 border-muted/80 shadow-sm text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                                                >
                                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                                    Revertir a Pendiente
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
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
