'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar, Search, RefreshCw, MapPin } from 'lucide-react';
import { getTelegramDeliveryBotLogsAction } from '@/modules/operations/lib/actions';
import { formatFechaEntrega } from '@/modules/operations/lib/utils';

interface TelegramLogsTabProps {
    tvMode?: boolean;
}

const ITEMS_PER_PAGE = 10;

export function TelegramLogsTab({ tvMode = false }: TelegramLogsTabProps) {
    // Utility for local calendar date without UTC offset issues
    const getLocalDateStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const [telegramDate, setTelegramDate] = useState<string>(getLocalDateStr());
    const [botLogs, setBotLogs] = useState<any[]>([]);
    const [botLogsLoading, setBotLogsLoading] = useState(false);
    const [botPage, setBotPage] = useState(1);

    const paginatedBotLogs = React.useMemo(() => {
        const startIndex = (botPage - 1) * ITEMS_PER_PAGE;
        return botLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [botLogs, botPage]);

    const fetchBotLogs = useCallback(async (dateToQuery?: string) => {
        setBotLogsLoading(true);
        try {
            const queryDate = dateToQuery || telegramDate;
            const logs = await getTelegramDeliveryBotLogsAction(queryDate);
            setBotLogs(logs || []);
            setBotPage(1); // Reset to page 1 on fresh query
        } catch (error) {
            console.error("Error fetching Telegram delivery logs:", error);
        } finally {
            setBotLogsLoading(false);
        }
    }, [telegramDate]);

    useEffect(() => {
        fetchBotLogs();
    }, [fetchBotLogs]);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className={`p-4 border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                tvMode ? 'bg-slate-900/60 border-slate-800' : 'bg-card'
            }`}>
                <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-sky-500" />
                    <div className="space-y-0.5">
                        <h3 className="text-sm font-bold">Bitácora del Bot de Telegram</h3>
                        <p className="text-[10px] text-muted-foreground font-medium">Consulte los despachos, RTVs y eventos reportados en tiempo real por los choferes filtrando por fecha.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                    <Input
                        type="date"
                        value={telegramDate}
                        onChange={(e) => setTelegramDate(e.target.value)}
                        className={`h-9 w-40 rounded-xl font-bold text-xs ${
                            tvMode ? 'bg-slate-950 border-slate-800 text-white' : ''
                        }`}
                    />
                    <Button
                        size="sm"
                        onClick={() => fetchBotLogs(telegramDate)}
                        className="rounded-xl font-bold text-xs bg-sky-600 hover:bg-sky-700 text-white gap-1.5 h-9"
                        disabled={botLogsLoading}
                    >
                        <Search className="w-3.5 h-3.5" />
                        Buscar
                    </Button>
                </div>
            </div>

            {botLogsLoading ? (
                <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse">
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-sky-500" />
                        <p className="text-muted-foreground font-medium">Cargando registros del Bot...</p>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {paginatedBotLogs.map((log: any) => {
                        let actionEmoji = '📦';
                        let actionColor = 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-800/30';
                        let actionLabel = 'Entrega';
                        
                        if (log.actionType === 'rtv') {
                            actionEmoji = '🚙';
                            actionColor = 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-800/30';
                            actionLabel = 'RTV / Trámite';
                        }

                        return (
                            <div key={log.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border gap-3 transition-all duration-150 ${
                                tvMode ? 'bg-slate-950 border-slate-800/60 hover:bg-slate-900/40' : 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/50'
                            }`}>
                                <div className="space-y-1 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="outline" className={`${actionColor} font-extrabold rounded-lg px-2 py-0.5 text-[10px]`}>
                                            {actionEmoji} {actionLabel}
                                        </Badge>
                                        {log.vehiclePlate && (
                                            <Badge className="bg-blue-600/10 text-blue-600 dark:text-blue-400 border-none font-black font-mono text-[10px] px-1.5 py-0.5">
                                                🚚 {log.vehiclePlate}
                                            </Badge>
                                        )}
                                        {log.latitud && log.longitud && (
                                            <a 
                                                href={`https://www.google.com/maps/search/?api=1&query=${log.latitud},${log.longitud}`}
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-500 hover:text-emerald-400 hover:underline shrink-0 bg-emerald-500/10 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-500/20 transition-all"
                                            >
                                                <MapPin className="w-2.5 h-2.5 text-emerald-500" />
                                                GPS 🗺️
                                            </a>
                                        )}
                                        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 font-mono">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {formatFechaEntrega(log.timestamp)}
                                        </span>
                                    </div>
                                    <p className={`text-xs font-semibold mt-1.5 leading-relaxed ${tvMode ? 'text-slate-200' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {log.message}
                                    </p>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 shrink-0">
                                    <span className="text-[10px] bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-400 border border-sky-100 dark:border-sky-900/30 px-2 py-0.5 rounded-lg font-bold">
                                        👤 Chofer: {log.driverName}
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {botLogs.length === 0 && (
                        <div className={`text-center p-12 border rounded-2xl text-xs font-semibold shadow-sm ${
                            tvMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-card text-muted-foreground'
                        }`}>
                            No se encontraron registros del bot de Telegram para la fecha seleccionada: <span className="font-extrabold text-sky-500">{telegramDate}</span>.
                        </div>
                    )}

                    {botLogs.length > ITEMS_PER_PAGE && (
                        <div className={`flex items-center justify-between pt-4 border-t border-dashed ${tvMode ? 'border-slate-800' : 'border-slate-200'}`}>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setBotPage(prev => Math.max(1, prev - 1))}
                                disabled={botPage === 1}
                                className={`text-xs h-8 rounded-lg font-bold ${tvMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : ''}`}
                            >
                                Anterior
                            </Button>
                            <span className="text-xs text-muted-foreground font-semibold">
                                Pág. {botPage} de {Math.ceil(botLogs.length / ITEMS_PER_PAGE)}
                            </span>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setBotPage(prev => Math.min(Math.ceil(botLogs.length / ITEMS_PER_PAGE), prev + 1))}
                                disabled={botPage === Math.ceil(botLogs.length / ITEMS_PER_PAGE)}
                                className={`text-xs h-8 rounded-lg font-bold ${tvMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : ''}`}
                            >
                                Siguiente
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
