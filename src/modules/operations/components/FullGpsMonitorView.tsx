'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RefreshCw, Truck, Play, Pause, Navigation, Search, Map, Layers, Clock, ShieldCheck, MapPin, ShieldAlert } from 'lucide-react';
import { getLiveTelemetryAction } from '@/modules/fleet/lib/gps-actions';
import { getApiSettings } from '@/modules/core/lib/db';
import VehicleTelemetryBadge from './VehicleTelemetryBadge';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import dynamic from 'next/dynamic';
import Image from 'next/image';

const LiveTelemetryMap = dynamic(() => import('./LiveTelemetryMap'), { ssr: false });

type GpsMonitorProps = {
    embedded?: boolean;
};

export default function FullGpsMonitorView({ embedded = false }: GpsMonitorProps) {
    const { isAuthorized, isLoading: authLoading } = useAuthorization(['deliveries:gps:read', 'deliveries:admin']);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [telemetry, setTelemetry] = useState<any[]>([]);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [cartoApiKey, setCartoApiKey] = useState<string>('');
    const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>('');
    
    // Filtros y Modo Tour
    const [filterState, setFilterState] = useState<string>('en_ruta'); // 'en_ruta', 'todos', 'moving', 'parked', 'stopped', 'offline'
    const [searchQuery, setSearchQuery] = useState('');
    const [tourActive, setTourActive] = useState(false);
    const [currentTourIndex, setCurrentTourIndex] = useState(0);
    const [selectedTrackerId, setSelectedTrackerId] = useState<number | null>(null);

    // Opciones del Mapa
    const [mapStyle, setMapStyle] = useState<'osm' | 'carto-light' | 'carto-dark' | 'google-maps'>('osm');
    const [showLabels, setShowLabels] = useState(true);
    const [showTime, setShowTime] = useState(true);
    const [autoFit, setAutoFit] = useState(false);

    useEffect(() => {
        getApiSettings().then(apiCfg => {
            if (apiCfg?.cartoApiKey) setCartoApiKey(apiCfg.cartoApiKey);
            if (apiCfg?.googleMapsApiKey) setGoogleMapsApiKey(apiCfg.googleMapsApiKey);
        }).catch(() => {});
    }, []);

    // Inicialización dinámica según preferencias del sistema de administración
    useEffect(() => {
        if (settings.gps_modo_predeterminado === 'modoTour') {
            setTourActive(true);
            setAutoFit(false);
        } else if (settings.gps_modo_predeterminado === 'autoAjuste') {
            setAutoFit(true);
            setTourActive(false);
        }
    }, [settings.gps_modo_predeterminado]);

    const tourIntervalMs = useMemo(() => {
        const sec = parseInt(settings.gps_tour_tiempo_sec || '10', 10);
        return Math.max(3, sec) * 1000;
    }, [settings.gps_tour_tiempo_sec]);

    const tourZoomLevel = useMemo(() => {
        return parseInt(settings.gps_tour_zoom_level || '17', 10);
    }, [settings.gps_tour_zoom_level]);

    const apiQueryIntervalMs = useMemo(() => {
        const sec = parseInt(settings.intervalo_consulta_gps || '12', 10);
        return Math.max(12, sec) * 1000;
    }, [settings.intervalo_consulta_gps]);

    const loadTelemetry = React.useCallback(async () => {
        setRefreshing(true);
        try {
            const data = await getLiveTelemetryAction();
            setTelemetry(data.telemetry || []);
            setSettings(data.settings || {});
        } catch (e) {
            console.error('Error cargando telemetría GPS:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadTelemetry();
        const interval = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            loadTelemetry();
        }, apiQueryIntervalMs);
        return () => clearInterval(interval);
    }, [loadTelemetry, apiQueryIntervalMs]);

    // Filtrar vehículos de acuerdo al estado seleccionado
    const filteredTelemetry = useMemo(() => {
        return telemetry.filter(t => {
            if (filterState === 'en_ruta' && (t.movementStatus === 'parked' || t.connectionStatus === 'offline')) return false;
            if (filterState === 'moving' && t.movementStatus !== 'moving') return false;
            if (filterState === 'stopped' && t.movementStatus !== 'stopped') return false;
            if (filterState === 'parked' && t.movementStatus !== 'parked') return false;
            if (filterState === 'offline' && t.connectionStatus !== 'offline') return false;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchLabel = t.label.toLowerCase().includes(q);
                const matchPlate = t.plate.toLowerCase().includes(q);
                const matchLoc = (t.locationText || '').toLowerCase().includes(q);
                if (!matchLabel && !matchPlate && !matchLoc) return false;
            }

            return true;
        });
    }, [telemetry, filterState, searchQuery]);

    // Reordenar Lista Lateral: Ordenar de MAYOR a MENOR duración transcurrida + Mover camión TOUR de PRIMERO en la Cima
    const sortedSidebarTelemetry = useMemo(() => {
        const list = [...filteredTelemetry];
        
        // 1. Ordenar por tiempo transcurrido en segundos (Descendente)
        list.sort((a, b) => (b.timeInStateSeconds || 0) - (a.timeInStateSeconds || 0));

        // 2. Si el Modo Tour está activo, mover el camión en foco AL PRINCIPIO DE LA LISTA (Índice 0)
        if (tourActive && selectedTrackerId) {
            const idx = list.findIndex(c => c.id === selectedTrackerId);
            if (idx > 0) {
                const [focusedCamion] = list.splice(idx, 1);
                list.unshift(focusedCamion);
            }
        }

        return list;
    }, [filteredTelemetry, tourActive, selectedTrackerId]);

    // Bucle Modo Tour Animado
    useEffect(() => {
        if (!tourActive || filteredTelemetry.length === 0) return;

        const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            setCurrentTourIndex(prev => {
                const nextIdx = (prev + 1) % filteredTelemetry.length;
                const nextCamion = filteredTelemetry[nextIdx];
                if (nextCamion) {
                    setSelectedTrackerId(nextCamion.id);
                }
                return nextIdx;
            });
        }, tourIntervalMs);

        return () => clearInterval(timer);
    }, [tourActive, filteredTelemetry, tourIntervalMs]);

    // Establecer el primer vehículo al iniciar el Tour
    useEffect(() => {
        if (tourActive && filteredTelemetry.length > 0) {
            setSelectedTrackerId(filteredTelemetry[0].id);
            setCurrentTourIndex(0);
        }
    }, [tourActive, filteredTelemetry]);

    const activeVehicle = useMemo(() => {
        if (selectedTrackerId) {
            return telemetry.find(t => t.id === selectedTrackerId) || null;
        }
        return sortedSidebarTelemetry[0] || null;
    }, [selectedTrackerId, telemetry, sortedSidebarTelemetry]);

    const stats = useMemo(() => {
        const total = telemetry.length;
        const enRuta = telemetry.filter(t => t.movementStatus !== 'parked').length;
        const moving = telemetry.filter(t => t.movementStatus === 'moving').length;
        const stopped = telemetry.filter(t => t.movementStatus === 'stopped').length;
        const parked = telemetry.filter(t => t.movementStatus === 'parked').length;
        const offline = telemetry.filter(t => t.connectionStatus === 'offline').length;
        return { total, enRuta, moving, stopped, parked, offline };
    }, [telemetry]);

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center p-12 bg-slate-950 rounded-2xl border border-slate-800 text-slate-200">
                <div className="text-center space-y-3">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
                    <p className="text-sm font-medium">Cargando Monitor de Estados GPS...</p>
                </div>
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <div className="p-8 max-w-md mx-auto my-12 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-4 shadow-2xl text-slate-100">
                <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl w-fit mx-auto border border-red-500/30">
                    <ShieldAlert className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-bold text-white">Acceso Restringido</h2>
                    <p className="text-xs text-slate-400 font-medium">
                        No posees el permiso <code className="text-amber-400 font-mono">deliveries:gps:read</code> para visualizar el Monitor Satelital GPS.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3 bg-slate-950 p-3 md:p-4 rounded-2xl text-slate-100 border border-slate-900 shadow-2xl w-full">
            
            {/* Cabecera Principal de Control y Filtros Leyenda */}
            <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                            🎯 Monitor - Estados GPS
                        </h1>
                    </div>

                    {/* Botones de Control de Navegación del Mapa */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                        <Button
                            variant={tourActive ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                                const nextTour = !tourActive;
                                setTourActive(nextTour);
                                if (nextTour) setAutoFit(false);
                            }}
                            className={`rounded-xl font-bold text-xs gap-1.5 h-8.5 ${
                                tourActive ? 'bg-sky-600 hover:bg-sky-700 text-white border-none animate-pulse' : 'border-slate-800 bg-slate-900 text-slate-300'
                            }`}
                        >
                            {tourActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            {tourActive ? '🔄 Modo Tour (10s)' : '🔄 Modo Tour'}
                        </Button>

                        <button
                            onClick={() => {
                                const nextAutoFit = !autoFit;
                                setAutoFit(nextAutoFit);
                                if (nextAutoFit) setTourActive(false);
                            }}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold transition-all ${
                                autoFit ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-900/80 text-slate-300 border-slate-800'
                            }`}
                        >
                            🎯 Auto Ajuste
                        </button>

                        <button
                            onClick={() => setShowLabels(!showLabels)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold transition-all ${
                                showLabels ? 'bg-slate-800 text-sky-400 border-sky-500/40' : 'bg-slate-900/80 text-slate-400 border-slate-800'
                            }`}
                        >
                            🏷️ Nombres
                        </button>

                        <button
                            onClick={() => setShowTime(!showTime)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold transition-all ${
                                showTime ? 'bg-slate-800 text-amber-400 border-amber-500/40' : 'bg-slate-900/80 text-slate-400 border-slate-800'
                            }`}
                        >
                            ⏱️ Tiempo
                        </button>
                        <select
                            value={mapStyle}
                            onChange={(e) => setMapStyle(e.target.value as any)}
                            className="bg-slate-900 text-slate-200 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none"
                        >
                            <option value="osm">🌍 OpenStreetMap</option>
                            <option value="carto-light">☀️ CartoDB Claro</option>
                            <option value="carto-dark">🌙 CartoDB Oscuro</option>
                            <option value="google-maps">🛰️ Google Maps</option>
                        </select>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadTelemetry}
                            className="p-1.5 rounded-xl h-8 text-slate-400 hover:bg-slate-900 hover:text-white"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
                        </Button>
                    </div>
                </div>

                {/* Filtros Rápido Leyenda con Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setFilterState('en_ruta')}
                        className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                            filterState === 'en_ruta' ? 'bg-sky-600 border-white text-white shadow-lg shadow-sky-600/30' : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                        🚚 En Ruta <span className="bg-slate-950/60 px-1.5 py-0.5 rounded-full text-[10px]">{stats.enRuta}</span>
                    </button>

                    <button
                        onClick={() => setFilterState('all')}
                        className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                            filterState === 'all' ? 'bg-slate-700 border-white text-white' : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                        Todos <span className="bg-slate-950/60 px-1.5 py-0.5 rounded-full text-[10px]">{stats.total}</span>
                    </button>

                    <button
                        onClick={() => setFilterState('moving')}
                        className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                            filterState === 'moving' ? 'bg-emerald-600 border-white text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        En Movimiento <span className="bg-slate-950/60 px-1.5 py-0.5 rounded-full text-[10px]">{stats.moving}</span>
                    </button>

                    <button
                        onClick={() => setFilterState('parked')}
                        className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                            filterState === 'parked' ? 'bg-orange-600 border-white text-white shadow-lg shadow-orange-600/30' : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                        En Empresa <span className="bg-slate-950/60 px-1.5 py-0.5 rounded-full text-[10px]">{stats.parked}</span>
                    </button>

                    <button
                        onClick={() => setFilterState('stopped')}
                        className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                            filterState === 'stopped' ? 'bg-amber-600 border-white text-white shadow-lg shadow-amber-600/30' : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        🔑 Detenido (Motor ON) <span className="bg-slate-950/60 px-1.5 py-0.5 rounded-full text-[10px]">{stats.stopped}</span>
                    </button>

                    <button
                        onClick={() => setFilterState('offline')}
                        className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                            filterState === 'offline' ? 'bg-slate-600 border-white text-white' : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                        🔴 Fuera de Línea <span className="bg-slate-950/60 px-1.5 py-0.5 rounded-full text-[10px]">{stats.offline}</span>
                    </button>
                </div>
            </div>

            {/* Layout Principal Grid Split-Screen (Mapa 1fr + Sidebar 380px) */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-stretch h-[calc(100vh-180px)] min-h-[550px]">
                
                {/* Panel Izquierdo: Mapa de Pantalla Completa con Tarjeta de Foto Flotante `#header-vehicle-card` */}
                <div className="relative w-full h-full min-h-[450px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
                    <LiveTelemetryMap
                        telemetry={filteredTelemetry}
                        selectedTrackerId={selectedTrackerId}
                        zoom={tourZoomLevel}
                        mapStyle={mapStyle}
                        showLabels={showLabels}
                        showTime={showTime}
                        autoFit={autoFit}
                        onSelectVehicle={(tId) => setSelectedTrackerId(tId)}
                        depotLat={parseFloat(settings.parqueo_latitud || '10.025541')}
                        depotLng={parseFloat(settings.parqueo_longitud || '-84.273252')}
                        depotRadius={parseFloat(settings.parqueo_radio_metros || '500')}
                        cartoApiKey={cartoApiKey}
                        googleMapsApiKey={googleMapsApiKey}
                    />

                    {/* RECUADRO FOTO VEHÍCULO ACTIVO (FLOTANTE SOBRE EL MAPA - CUADRADO PERFECTO 92px x 92px) */}
                    <div className="absolute top-3 right-3 z-20 flex flex-col items-center justify-center bg-slate-900/95 border border-sky-500/60 p-1 rounded-xl w-[92px] h-[92px] shadow-2xl backdrop-blur-md">
                        <div className="w-[82px] h-[64px] rounded-lg overflow-hidden bg-slate-950 flex items-center justify-center border border-white/10 relative">
                            {activeVehicle && activeVehicle.photoUrl ? (
                                <Image
                                    src={`/api/fleet/files/${activeVehicle.photoUrl}`}
                                    alt={activeVehicle.label}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            ) : (
                                <div className="text-3xl text-sky-400">🚚</div>
                            )}
                        </div>
                        <span className="text-[10px] font-black text-sky-400 mt-1 w-full truncate text-center uppercase tracking-wide">
                            {activeVehicle ? activeVehicle.plate : 'SELECCIONAR'}
                        </span>
                    </div>
                </div>

                {/* Panel Derecho: Lista de Vehículos Lateral (Ordenada por Tiempo + Cima en Modo Tour) */}
                <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col h-full overflow-hidden shadow-2xl">
                    
                    {/* Header Sidebar con buscador */}
                    <div className="space-y-3 pb-3 border-b border-slate-800 shrink-0">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-sky-400 flex items-center gap-1.5">
                                🚚 Lista de Vehículos
                            </h3>
                            <Badge variant="outline" className="bg-slate-800 text-slate-200 border-slate-700 font-mono text-xs font-bold">
                                {sortedSidebarTelemetry.length}
                            </Badge>
                        </div>

                        <div className="relative w-full">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                            <Input
                                placeholder="Buscar por placa o camión..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-slate-950 border-slate-800 text-slate-200 text-xs rounded-xl h-8.5"
                            />
                        </div>
                    </div>

                    {/* Contenedor de Tarjetas con Scroll */}
                    <div className="flex-1 overflow-y-auto space-y-3 pt-3 pr-1">
                        {sortedSidebarTelemetry.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-xs font-semibold bg-slate-950/40 rounded-xl border border-slate-800/60">
                                No hay vehículos registrados en este estado.
                            </div>
                        ) : (
                            sortedSidebarTelemetry.map((item, idx) => {
                                const isFocused = selectedTrackerId === item.id;
                                const isTourLeader = tourActive && isFocused && idx === 0;

                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedTrackerId(item.id)}
                                        className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 relative overflow-hidden ${
                                            isFocused
                                                ? 'bg-slate-950 border-sky-500 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/50'
                                                : 'bg-slate-950/50 border-slate-800/80 hover:bg-slate-950/80 hover:border-slate-700'
                                        }`}
                                    >
                                        {/* Badge Tour Actual si está en la cima */}
                                        {isTourLeader && (
                                            <div className="bg-sky-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full w-fit animate-pulse mb-1">
                                                🎯 EN TOUR ACTUAL
                                            </div>
                                        )}

                                        {/* Ubicación Texto arriba */}
                                        {item.locationText && (
                                            <div className="text-[10.5px] font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md truncate">
                                                🏙️ {item.locationText}
                                            </div>
                                        )}

                                        {/* Título de Camión y Velocidad */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-white flex items-center gap-1">
                                                🚚 {item.label}
                                            </span>
                                            <span className="text-[11px] font-bold text-sky-400 font-mono">
                                                ⚡ {item.speed || 0} km/h
                                            </span>
                                        </div>

                                        {/* Placa y Enlace a Google Maps */}
                                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                                            <span>Placa: <b className="text-slate-200">{item.plate}</b></span>
                                            {item.lat && item.lng && (
                                                <a
                                                    href={`https://www.google.com/maps?q=${item.lat},${item.lng}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-sky-400 hover:underline font-bold bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 text-[10px]"
                                                >
                                                    🗺️ Google Maps ↗
                                                </a>
                                            )}
                                        </div>

                                        {/* Badge de Telemetría */}
                                        <VehicleTelemetryBadge
                                            connectionStatus={item.connectionStatus}
                                            movementStatus={item.movementStatus}
                                            speed={item.speed}
                                            timeInStateFormatted={item.timeInStateFormatted}
                                            timeInStateSeconds={item.timeInStateSeconds}
                                            locationText={item.locationText}
                                            maxClientStayMinutes={Number(settings.tiempo_maximo_cliente_min) || 20}
                                        />
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
