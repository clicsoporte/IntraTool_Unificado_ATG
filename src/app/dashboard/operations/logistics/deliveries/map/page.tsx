'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/modules/core/hooks/use-toast';
import { getDeliveryGPSData } from '@/modules/operations/lib/actions';
import { RefreshCw, MapPin, Truck, ArrowLeft, Loader2, Compass, Activity, Navigation, CheckCircle, Calendar } from 'lucide-react';
import { useLoading } from '@/modules/core/hooks/useLoading';

interface GPSData {
  activeTrucks: any[];
  gpsPaths: Record<number, any[]>;
  deliveryMarkers: any[];
}

// Dynamically import MapTracker since it relies on window/browser APIs (Leaflet)
const MapTracker = dynamic(
  () => import('@/modules/operations/components/MapTracker'),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center bg-slate-950 border border-slate-900 rounded-2xl space-y-4 p-8">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <p className="text-slate-400 font-bold text-sm animate-pulse tracking-wide uppercase">Iniciando Consola Cartográfica Satelital...</p>
        <span className="text-[11px] text-slate-500 max-w-xs text-center font-medium">Cargando dependencias de geolocalización y renderizado de mapas Leaflet.</span>
      </div>
    )
  }
);

export default function DeliveryMapPage() {
  const { toast } = useToast();
  const { showLoading, hideLoading } = useLoading();

  // Utility for local calendar date without UTC offset issues
  const getLocalDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [gpsData, setGpsData] = useState<GPSData>({
    activeTrucks: [],
    gpsPaths: {},
    deliveryMarkers: []
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (loading) {
      showLoading("Estableciendo enlace y descargando trazas satelitales...");
    } else if (refreshing) {
      showLoading("Actualizando coordenadas de la flota en tiempo real...");
    } else {
      hideLoading();
    }
    return () => {
      hideLoading();
    };
  }, [loading, refreshing, showLoading, hideLoading]);

  const fetchGPSData = useCallback(async (isManual = false, targetDate?: string) => {
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const dateToQuery = targetDate || selectedDate;
      const data = await getDeliveryGPSData(dateToQuery);
      
      if (data) setGpsData(data);
      setLastUpdated(new Date());

      if (isManual) {
        toast({
          title: "🗺️ Coordenadas Sincronizadas",
          description: `La traza satelital y la flota del día ${dateToQuery} se actualizaron correctamente.`,
          variant: "default"
        });
      }
    } catch (err: any) {
      console.error("Error fetching GPS data for map:", err);
      toast({
        title: "❌ Error de Conexión",
        description: "No se pudieron obtener las coordenadas satelitales del servidor local.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, toast]);

  // Load when selectedDate or component mounts
  useEffect(() => {
    fetchGPSData(false, selectedDate);
  }, [selectedDate, fetchGPSData]);

  const totalActiveTrucks = gpsData?.activeTrucks?.length || 0;
  const totalDeliveries = gpsData?.deliveryMarkers?.length || 0;
  const completedDeliveries = (gpsData?.deliveryMarkers || []).filter(m => m.estado === 'completo').length;
  const incompleteDeliveries = (gpsData?.deliveryMarkers || []).filter(m => m.estado === 'incompleto').length;
  const rejectedDeliveries = (gpsData?.deliveryMarkers || []).filter(m => m.estado === 'rechazado').length;

  return (
    <div className="w-full space-y-6">
      {/* Premium Header Panel */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900 dark:bg-slate-950/40 p-4 sm:p-6 border border-slate-800 rounded-2xl shadow-xl">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400 font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5">
              Live Sat-Tracking Enabled
            </Badge>
            {lastUpdated && (
              <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Actualizado hace unos segundos
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2 text-white">
            <Compass className="w-6 h-6 text-blue-500 animate-spin-slow" />
            Consola de Monitoreo Geográfico y Trazado Satelital 🗺️
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            Visualización espacial de rutas de despacho, posiciones de camiones en vivo y georreferenciación de entregas en tiempo real.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-3 w-full lg:w-auto shrink-0 justify-end">
          {/* Beautiful Glassmorphic Date Selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto bg-slate-950/80 p-1.5 px-3 border border-slate-800 rounded-xl">
            <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0 select-none">Consultar Día:</span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-white text-xs font-bold focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-6 px-1 w-[125px] rounded cursor-pointer dark:[color-scheme:dark]"
              style={{ colorScheme: 'dark' }}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
            <Link href="/dashboard/operations/logistics/deliveries">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-extrabold gap-1.5 h-10 px-3.5 transition-all duration-200"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver a Entregas 🚚
              </Button>
            </Link>

            <Button
              onClick={() => fetchGPSData(true)}
              disabled={refreshing || loading}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs gap-1.5 h-10 px-4 shadow-lg shadow-blue-500/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualizando...' : 'Actualizar Ubicaciones 🔄'}
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800/80 rounded-2xl shadow-md overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Flota en Ruta</span>
              <h3 className="text-2xl font-black text-white">{totalActiveTrucks}</h3>
            </div>
            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 group-hover:scale-110 transition-transform">
              <Truck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800/80 rounded-2xl shadow-md overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entregas Completas</span>
              <h3 className="text-2xl font-black text-emerald-400">{completedDeliveries}</h3>
            </div>
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 group-hover:scale-110 transition-transform">
              <CheckCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800/80 rounded-2xl shadow-md overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mermas / Incompletas</span>
              <h3 className="text-2xl font-black text-amber-500">{incompleteDeliveries}</h3>
            </div>
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500 group-hover:scale-110 transition-transform">
              <MapPin className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800/80 rounded-2xl shadow-md overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rechazos Hoy</span>
              <h3 className="text-2xl font-black text-rose-500">{rejectedDeliveries}</h3>
            </div>
            <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-400 group-hover:scale-110 transition-transform">
              <Activity className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Map Container */}
      <div className="relative w-full h-[calc(100vh-270px)] min-h-[550px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
        {loading ? (
          <div className="w-full h-full flex flex-col items-center justify-center space-y-4 p-8">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-slate-400 font-bold text-sm animate-pulse tracking-wide">Sincronizando trazas satelitales...</p>
          </div>
        ) : (
          <>
            <MapTracker
              activeTrucks={gpsData.activeTrucks}
              gpsPaths={gpsData.gpsPaths}
              deliveryMarkers={gpsData.deliveryMarkers}
            />

            {/* Floating Control Center HUD */}
            <div className="absolute top-4 right-4 z-[1000] bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl p-4 shadow-2xl max-w-sm pointer-events-auto text-slate-100 hidden sm:block">
              <div className="flex items-center gap-2 pb-2 mb-2 border-b border-slate-800">
                <Navigation className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">Panel de Control Satelital</h4>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs gap-4">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                    Vehículos Conectados:
                  </span>
                  <span className="font-extrabold text-blue-400">{totalActiveTrucks}</span>
                </div>
                <div className="flex items-center justify-between text-xs gap-4">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    Clientes Reportados:
                  </span>
                  <span className="font-extrabold text-emerald-400">{totalDeliveries}</span>
                </div>
                <div className="h-px bg-slate-800 my-2" />
                <div className="text-[10px] text-slate-500 flex items-center justify-between gap-2">
                  <span>Último Reporte:</span>
                  <span className="font-medium text-slate-400">
                    {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Sin datos'}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
