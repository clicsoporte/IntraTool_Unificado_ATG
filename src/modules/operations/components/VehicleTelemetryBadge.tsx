'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Truck, MapPin, AlertTriangle, Clock, Signal, WifiOff } from 'lucide-react';

export type VehicleTelemetryBadgeProps = {
    connectionStatus?: 'active' | 'offline';
    movementStatus?: 'moving' | 'stopped' | 'parked';
    speed?: number;
    timeInStateFormatted?: string;
    timeInStateSeconds?: number;
    locationText?: string;
    maxClientStayMinutes?: number;
    compact?: boolean;
};

export default function VehicleTelemetryBadge({
    connectionStatus = 'active',
    movementStatus = 'stopped',
    speed = 0,
    timeInStateFormatted = '',
    timeInStateSeconds = 0,
    locationText = '',
    maxClientStayMinutes = 20,
    compact = false
}: VehicleTelemetryBadgeProps) {
    const isOffline = connectionStatus === 'offline';
    const isOverstay = !isOffline && movementStatus === 'stopped' && (timeInStateSeconds / 60) > maxClientStayMinutes;

    if (compact) {
        if (isOffline) {
            return (
                <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[10px] gap-1 font-bold">
                    <WifiOff className="w-3 h-3" /> Sin Señal
                </Badge>
            );
        }
        if (movementStatus === 'parked') {
            return (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px] gap-1 font-bold">
                    <Truck className="w-3 h-3" /> En Parqueo ({timeInStateFormatted})
                </Badge>
            );
        }
        if (movementStatus === 'moving') {
            return (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] gap-1 font-bold">
                    <Truck className="w-3 h-3 animate-pulse" /> En Ruta ({speed} km/h)
                </Badge>
            );
        }
        if (isOverstay) {
            return (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px] gap-1 font-black animate-bounce">
                    <AlertTriangle className="w-3 h-3" /> Exceso Cliente ({timeInStateFormatted})
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] gap-1 font-bold">
                <Clock className="w-3 h-3" /> Detenido ({timeInStateFormatted})
            </Badge>
        );
    }

    return (
        <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-200">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-extrabold">
                    {isOffline ? (
                        <span className="flex items-center gap-1 text-slate-400">
                            <WifiOff className="w-3.5 h-3.5" /> GPS Offline
                        </span>
                    ) : movementStatus === 'parked' ? (
                        <span className="flex items-center gap-1 text-blue-400">
                            <Truck className="w-3.5 h-3.5" /> En Parqueo Sede
                        </span>
                    ) : movementStatus === 'moving' ? (
                        <span className="flex items-center gap-1 text-emerald-400">
                            <Truck className="w-3.5 h-3.5 animate-pulse" /> En Movimiento ({speed} km/h)
                        </span>
                    ) : isOverstay ? (
                        <span className="flex items-center gap-1 text-amber-400 font-black animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Alerta de Estadía en Cliente
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-amber-300">
                            <Clock className="w-3.5 h-3.5" /> Detenido en Punto
                        </span>
                    )}
                </div>

                <Badge variant="secondary" className="text-[10px] font-mono bg-slate-800 text-slate-300">
                    {timeInStateFormatted || 'N/A'}
                </Badge>
            </div>

            {locationText && (
                <div className="flex items-center gap-1 text-[11px] text-slate-400 truncate">
                    <MapPin className="w-3 h-3 shrink-0 text-indigo-400" />
                    <span className="truncate">{locationText}</span>
                </div>
            )}
        </div>
    );
}
