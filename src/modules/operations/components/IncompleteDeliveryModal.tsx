'use client';

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    AlertTriangle, 
    FileText, 
    MapPin, 
    Truck, 
    User, 
    Clock, 
    Package, 
    ExternalLink, 
    Loader2, 
    AlertCircle,
    Briefcase
} from 'lucide-react';
import { getDeliveryLinesByDocIdAction } from '@/modules/operations/lib/actions';

export interface IncompleteDocData {
    id: number;
    documento_numero: string;
    boleta_numero?: string;
    cliente_nombre?: string;
    cliente_id?: string;
    vehiculo_placa?: string;
    chofer_nombre?: string;
    ruta_nombre?: string;
    estado: string;
    fecha_entrega?: string;
    comentario?: string;
    latitud?: number;
    longitud?: number;
}

interface IncompleteDeliveryModalProps {
    doc: IncompleteDocData | null;
    onClose: () => void;
}

interface DeliveryLine {
    id: number;
    codigo: string;
    desc: string;
    pedida: number;
    entregada: number;
    faltante: number;
}

interface SalespersonInfo {
    codigo: string;
    nombre: string;
    email?: string;
    telefono?: string;
}

export function IncompleteDeliveryModal({ doc, onClose }: IncompleteDeliveryModalProps) {
    const [lines, setLines] = useState<DeliveryLine[]>([]);
    const [vendedor, setVendedor] = useState<SalespersonInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!doc) {
            setLines([]);
            setVendedor(null);
            setError(null);
            return;
        }

        let isMounted = true;
        setLoading(true);
        setError(null);

        getDeliveryLinesByDocIdAction(doc.id)
            .then(res => {
                if (!isMounted) return;
                if (res.success) {
                    setLines(res.lines || []);
                    setVendedor(res.vendedor || null);
                } else {
                    setError(res.error || 'No se pudieron obtener los artículos del documento.');
                }
            })
            .catch(err => {
                if (!isMounted) return;
                setError(err?.message || 'Error de comunicación.');
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [doc]);

    if (!doc) return null;

    const totalFaltantes = lines.reduce((acc, l) => acc + (l.faltante > 0 ? l.faltante : 0), 0);
    const totalLineasAfectadas = lines.filter(l => l.faltante > 0).length;

    const formatFecha = (f?: string) => {
        if (!f) return 'N/D';
        try {
            return new Date(f).toLocaleString('es-CR', {
                timeZone: 'America/Costa_Rica',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return f;
        }
    };

    return (
        <Dialog open={!!doc} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-slate-950 text-slate-100 border-slate-800 shadow-2xl p-0 overflow-hidden">
                {/* Header institucional */}
                <DialogHeader className="p-5 pb-4 bg-slate-900/90 border-b border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-black font-mono tracking-tight text-white flex items-center gap-2">
                                    {doc.boleta_numero ? `📄 ${doc.boleta_numero}` : doc.documento_numero}
                                    {doc.boleta_numero && doc.boleta_numero !== doc.documento_numero && (
                                        <span className="text-xs font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                                            Doc. ERP: #{doc.documento_numero}
                                        </span>
                                    )}
                                    <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-black uppercase px-2 py-0.5">
                                        {doc.estado}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-400 font-semibold truncate max-w-md">
                                    {doc.cliente_nombre || 'Cliente no especificado'}
                                </DialogDescription>
                            </div>
                        </div>

                        {/* Metadatos Rápidos */}
                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                            {doc.vehiculo_placa && (
                                <span className="bg-slate-800/80 px-2 py-1 rounded border border-slate-700/80 font-bold text-indigo-300 flex items-center gap-1">
                                    <Truck className="w-3.5 h-3.5" />
                                    {doc.vehiculo_placa}
                                </span>
                            )}
                            {doc.chofer_nombre && (
                                <span className="bg-slate-800/80 px-2 py-1 rounded border border-slate-700/80 font-semibold text-slate-300 flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" />
                                    {doc.chofer_nombre}
                                </span>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {/* Contenido scrolleable */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
                    {/* Barra de Datos Operativos */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-900/50 border border-slate-800/80">
                        <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hora Entrega</span>
                            <span className="font-mono font-bold text-slate-200 flex items-center gap-1 mt-0.5">
                                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {formatFecha(doc.fecha_entrega)}
                            </span>
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vendedor Asignado</span>
                            <span className="font-bold text-cyan-300 flex items-center gap-1 mt-0.5 truncate" title={vendedor ? `${vendedor.codigo} - ${vendedor.nombre}` : 'Sin vendedor'}>
                                <Briefcase className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                {vendedor ? (
                                    <span className="truncate">
                                        <strong className="font-mono text-cyan-400 font-black">{vendedor.codigo}</strong> - {vendedor.nombre}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 font-normal">N/D</span>
                                )}
                            </span>
                        </div>
                        {doc.ruta_nombre && (
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ruta Asignada</span>
                                <span className="font-bold text-slate-200 truncate block mt-0.5">
                                    🗺️ {doc.ruta_nombre}
                                </span>
                            </div>
                        )}
                        <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Confirmación GPS</span>
                            {doc.latitud && doc.longitud ? (
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${doc.latitud},${doc.longitud}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 mt-0.5 hover:underline"
                                >
                                    <MapPin className="w-3.5 h-3.5" />
                                    Ver en Maps 🟢
                                </a>
                            ) : (
                                <span className="text-red-400 font-bold flex items-center gap-1 mt-0.5">
                                    <MapPin className="w-3.5 h-3.5" />
                                    Sin GPS 🔴
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Tabla de Artículos / Faltantes */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                                <Package className="w-4 h-4 text-amber-400" />
                                Desglose de Artículos y Faltantes
                            </span>
                            {lines.length > 0 && totalFaltantes > 0 && (
                                <Badge className="bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-bold">
                                    {totalLineasAfectadas} {totalLineasAfectadas === 1 ? 'producto afectado' : 'productos afectados'} • {totalFaltantes} {totalFaltantes === 1 ? 'und faltante' : 'unds faltantes'}
                                </Badge>
                            )}
                        </div>

                        {loading ? (
                            <div className="p-8 flex flex-col items-center justify-center gap-2 bg-slate-900/40 rounded-xl border border-slate-800">
                                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                                <span className="text-xs text-slate-400 font-medium">Cargando desglose de productos...</span>
                            </div>
                        ) : error ? (
                            <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-xs">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        ) : lines.length === 0 ? (
                            <div className="p-6 text-center bg-slate-900/40 border border-slate-800 rounded-xl space-y-1">
                                <p className="text-slate-300 font-bold">No hay desglose por línea registrado.</p>
                                <p className="text-[11px] text-slate-400">
                                    Esta entrega fue reportada de forma global sin selección individual de ítems. Revise las observaciones del chofer a continuación.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-slate-800 overflow-hidden shadow-inner bg-slate-900/60">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                            <th className="p-2.5 pl-3">Código</th>
                                            <th className="p-2.5">Descripción</th>
                                            <th className="p-2.5 text-center">Pedida</th>
                                            <th className="p-2.5 text-center">Entregada</th>
                                            <th className="p-2.5 text-center pr-3 text-red-400">Faltante</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 text-xs">
                                        {lines.map((item) => {
                                            const hasFaltante = item.faltante > 0;
                                            return (
                                                <tr 
                                                    key={item.id} 
                                                    className={`transition-colors ${hasFaltante ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-slate-800/40'}`}
                                                >
                                                    <td className="p-2.5 pl-3 font-mono font-bold text-slate-200">
                                                        {item.codigo}
                                                    </td>
                                                    <td className="p-2.5 font-medium text-slate-300 leading-snug">
                                                        {item.desc}
                                                    </td>
                                                    <td className="p-2.5 text-center font-mono font-semibold text-slate-400">
                                                        {item.pedida}
                                                    </td>
                                                    <td className="p-2.5 text-center font-mono font-bold text-emerald-400">
                                                        {item.entregada}
                                                    </td>
                                                    <td className="p-2.5 text-center font-mono font-black pr-3">
                                                        {hasFaltante ? (
                                                            <span className="inline-block px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                                                                {item.faltante}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Observaciones del Chofer */}
                    {doc.comentario && (
                        <div className="space-y-1.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                💬 Observaciones / Motivo del Chofer
                            </span>
                            <p className="text-xs text-amber-200/90 italic font-medium leading-relaxed">
                                &quot;{doc.comentario}&quot;
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer con acciones */}
                <DialogFooter className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/api/fleet/boleta-html?id=${doc.id}`, '_blank')}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 font-bold gap-1.5 text-xs w-full sm:w-auto"
                    >
                        <FileText className="w-3.5 h-3.5 text-indigo-400" />
                        Ver Boleta Digital
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                    </Button>

                    <Button
                        type="button"
                        size="sm"
                        onClick={onClose}
                        className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs px-5 w-full sm:w-auto"
                    >
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
