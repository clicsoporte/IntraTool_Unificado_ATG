'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, Navigation, CheckCircle2, Clock, AlertTriangle, 
  Truck, UserCheck, Users, HelpCircle, ChevronLeft, ChevronRight, RefreshCw 
} from 'lucide-react';
import { LogisticsMetricsTab } from './LogisticsMetricsTab';
import { AnalyticsFilterBar, FilterState } from './AnalyticsFilterBar';
import { getLogisticsAnalyticsDataAction } from '../lib/actions';
import { getLocalDateStr } from '../lib/utils';

interface AnalyticsViewTabsProps {
  initialQueueDocs: any[];
  initialAssignments: any[];
  driversList: string[];
  routesList: { id: number; name: string }[];
  vehiclesList: string[];
}

export function AnalyticsViewTabs({
  initialQueueDocs,
  initialAssignments,
  driversList,
  routesList,
  vehiclesList
}: AnalyticsViewTabsProps) {
  const [activeTab, setActiveTab] = useState<'kpis' | 'metrics' | 'breaks'>('kpis');
  const [isPending, startTransition] = useTransition();
  const [breakEvents, setBreakEvents] = useState<any[]>([]);

  // Initial Filter State (Default: This Month - Zona horaria comercial de Costa Rica)
  const [filters, setFilters] = useState<FilterState>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      preset: 'thisMonth',
      startDate: getLocalDateStr(firstDay),
      endDate: getLocalDateStr(now),
      choferName: 'all',
      rutaId: 'all',
      vehiculoPlaca: 'all',
      searchClient: ''
    };
  });

  const [queueDocs, setQueueDocs] = useState<any[]>(initialQueueDocs);
  const [assignments, setAssignments] = useState<any[]>(initialAssignments);
  const [hasLoaded, setHasLoaded] = useState<boolean>(initialQueueDocs.length > 0 || initialAssignments.length > 0);

  // Pagination states (5 items per page)
  const PAGE_SIZE = 5;
  const [driverPage, setDriverPage] = useState(1);
  const [vehiclePage, setVehiclePage] = useState(1);
  const [clientPage, setClientPage] = useState(1);

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setHasLoaded(true);
    startTransition(async () => {
      try {
        const [res, breaksRes] = await Promise.all([
          getLogisticsAnalyticsDataAction(newFilters),
          fetch('/api/fleet/break-events').then(r => r.json()).catch(() => ({ events: [] }))
        ]);
        if (res.success) {
          setQueueDocs(res.queueDocs);
          setAssignments(res.assignments);
          if (breaksRes?.events) {
            setBreakEvents(breaksRes.events);
          }
          // Reset pagination on filter change
          setDriverPage(1);
          setVehiclePage(1);
          setClientPage(1);
        }
      } catch (e) {
        console.error("Error updating analytics filters:", e);
      }
    });
  };

  // 1. KPI Calculations (Matemática Estricta Auditada)
  const totalDocs = queueDocs.length;
  const completedDocs = queueDocs.filter((d: any) => d.estado === 'completo');
  const incompleteDocs = queueDocs.filter((d: any) => d.estado === 'incompleto');
  const rejectedDocs = queueDocs.filter((d: any) => d.estado === 'rechazado');
  const processedDocs = queueDocs.filter((d: any) => ['completo', 'incompleto', 'rechazado'].includes(d.estado));

  // Tasa OTIF estricta sobre documentos procesados en calle (no distorsiona en la mañana)
  const otifRate = processedDocs.length > 0 
    ? ((completedDocs.length / processedDocs.length) * 100).toFixed(1) 
    : '100.0';

  // Usar prioridad de tiempo de estancia satelital (tiempo_estadia_min) o fallback a descarga reportada
  const docsWithEstadia = queueDocs.filter((d: any) => (d.tiempo_estadia_min || d.tiempo_descarga_min) > 0);
  const avgDescargaMin = docsWithEstadia.length > 0
    ? Math.round(docsWithEstadia.reduce((acc: number, curr: any) => acc + (curr.tiempo_estadia_min || curr.tiempo_descarga_min || 0), 0) / docsWithEstadia.length)
    : 0;

  // 2. Client Retention & Dwell Map
  const clientRetentionMap: Record<string, { name: string; count: number; totalDescarga: number; totalRalenti: number }> = {};
  queueDocs.forEach((d: any) => {
    const clientName = d.cliente_nombre || d.cliente_nombre_core || d.cliente_id || 'Cliente Desconocido';
    if (!clientRetentionMap[clientName]) {
      clientRetentionMap[clientName] = { name: clientName, count: 0, totalDescarga: 0, totalRalenti: 0 };
    }
    clientRetentionMap[clientName].count += 1;
    const est = d.tiempo_estadia_min || d.tiempo_descarga_min || 0;
    if (est > 0) {
      clientRetentionMap[clientName].totalDescarga += est;
    }
    if (d.ralenti_cliente_minutos) {
      clientRetentionMap[clientName].totalRalenti += d.ralenti_cliente_minutos;
    }
  });

  const clientRetentionList = Object.values(clientRetentionMap)
    .map(c => ({
      ...c,
      avgDescarga: c.count > 0 && c.totalDescarga > 0 ? Math.round(c.totalDescarga / c.count) : 0
    }))
    .sort((a, b) => b.avgDescarga - a.avgDescarga);

  // 3. Driver Performance Map
  const driverMap: Record<string, { name: string; total: number; completed: number; incomplete: number; rejected: number; totalDescarga: number; descargaCount: number }> = {};
  queueDocs.forEach((d: any) => {
    const driverName = (d.chofer_nombre || d.gestionado_por || 'Sin Chofer Asignado').trim();
    if (!driverMap[driverName]) {
      driverMap[driverName] = { name: driverName, total: 0, completed: 0, incomplete: 0, rejected: 0, totalDescarga: 0, descargaCount: 0 };
    }
    driverMap[driverName].total += 1;
    if (d.estado === 'completo') driverMap[driverName].completed += 1;
    if (d.estado === 'incompleto') driverMap[driverName].incomplete += 1;
    if (d.estado === 'rechazado') driverMap[driverName].rejected += 1;
    const est = d.tiempo_estadia_min || d.tiempo_descarga_min || 0;
    if (est > 0) {
      driverMap[driverName].totalDescarga += est;
      driverMap[driverName].descargaCount += 1;
    }
  });

  const driverList = Object.values(driverMap)
    .map(dr => {
      const processed = dr.completed + dr.incomplete + dr.rejected;
      return {
        ...dr,
        otifRate: processed > 0 ? Math.round((dr.completed / processed) * 100) : 100,
        avgDescarga: dr.descargaCount > 0 ? Math.round(dr.totalDescarga / dr.descargaCount) : 0
      };
    })
    .sort((a, b) => b.total - a.total);

  // 4. Vehicle Performance Map
  const vehicleMap: Record<string, { plate: string; total: number; completed: number; incomplete: number; rejected: number }> = {};
  queueDocs.forEach((d: any) => {
    const plate = (d.vehiculo_placa || d.vehiculo_id || 'Sin Asignar').trim().toUpperCase();
    if (!vehicleMap[plate]) {
      vehicleMap[plate] = { plate, total: 0, completed: 0, incomplete: 0, rejected: 0 };
    }
    vehicleMap[plate].total += 1;
    if (d.estado === 'completo') vehicleMap[plate].completed += 1;
    if (d.estado === 'incompleto') vehicleMap[plate].incomplete += 1;
    if (d.estado === 'rechazado') vehicleMap[plate].rejected += 1;
  });

  const vehicleList = Object.values(vehicleMap)
    .map(v => ({
      ...v,
      otifRate: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 100
    }))
    .sort((a, b) => b.total - a.total);

  // Pagination Slicing
  const pagedDrivers = driverList.slice((driverPage - 1) * PAGE_SIZE, driverPage * PAGE_SIZE);
  const totalDriverPages = Math.ceil(driverList.length / PAGE_SIZE) || 1;

  const pagedVehicles = vehicleList.slice((vehiclePage - 1) * PAGE_SIZE, vehiclePage * PAGE_SIZE);
  const totalVehiclePages = Math.ceil(vehicleList.length / PAGE_SIZE) || 1;

  const pagedClients = clientRetentionList.slice((clientPage - 1) * PAGE_SIZE, clientPage * PAGE_SIZE);
  const totalClientPages = Math.ceil(clientRetentionList.length / PAGE_SIZE) || 1;

  return (
    <div className="space-y-6">
      {/* 2 Navigation Cards Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: KPIs Gerenciales OTIF */}
        <div
          onClick={() => setActiveTab('kpis')}
          className={`cursor-pointer transition-all rounded-2xl border p-4 sm:p-5 flex items-start gap-4 ${
            activeTab === 'kpis'
              ? 'bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/5 ring-2 ring-emerald-500/30'
              : 'bg-card border-border hover:bg-muted/40 hover:border-slate-300'
          }`}
        >
          <div className={`p-3 rounded-xl ${activeTab === 'kpis' ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}>
            <BarChart3 className="w-6 h-6" />
          </div>
          <div className="space-y-1 min-w-0">
            <h3 className={`text-base font-extrabold flex items-center gap-2 ${activeTab === 'kpis' ? 'text-emerald-900 dark:text-emerald-300' : 'text-foreground'}`}>
              <span>📈 Logística & KPIs Gerenciales (OTIF)</span>
              {activeTab === 'kpis' && <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full">Activo</span>}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Indicador global OTIF, entregas a tiempo, retención en clientes, efectividad de choferes y uso de camiones.
            </p>
          </div>
        </div>

        {/* Card 2: Rendimiento en Ruta & Tiempos de Ciclo */}
        <div
          onClick={() => setActiveTab('metrics')}
          className={`cursor-pointer transition-all rounded-2xl border p-4 sm:p-5 flex items-start gap-4 ${
            activeTab === 'metrics'
              ? 'bg-blue-500/10 border-blue-500 shadow-md shadow-blue-500/5 ring-2 ring-blue-500/30'
              : 'bg-card border-border hover:bg-muted/40 hover:border-slate-300'
          }`}
        >
          <div className={`p-3 rounded-xl ${activeTab === 'metrics' ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'}`}>
            <Navigation className="w-6 h-6" />
          </div>
          <div className="space-y-1 min-w-0">
            <h3 className={`text-base font-extrabold flex items-center gap-2 ${activeTab === 'metrics' ? 'text-blue-900 dark:text-blue-300' : 'text-foreground'}`}>
              <span>📊 Rendimiento en Ruta & Tiempos de Ciclo</span>
              {activeTab === 'metrics' && <span className="text-[10px] bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full">Activo</span>}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tiempos promedio en cliente, duración de retorno a bodega, tiempos de ciclo completo y promedios por camión.
            </p>
          </div>
        </div>

        {/* Tab 3: Pausas & Telemetría */}
        <div
          onClick={() => setActiveTab('breaks')}
          className={`flex-1 p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3 shadow-sm hover:shadow-md ${
            activeTab === 'breaks'
              ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-amber-100 dark:shadow-none'
              : 'border-muted bg-card hover:border-amber-300'
          }`}
        >
          <div className={`p-3 rounded-xl ${activeTab === 'breaks' ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground'}`}>
            <Clock className="w-6 h-6" />
          </div>
          <div className="space-y-1 min-w-0">
            <h3 className={`text-base font-extrabold flex items-center gap-2 ${activeTab === 'breaks' ? 'text-amber-900 dark:text-amber-300' : 'text-foreground'}`}>
              <span>⏱️ Pausas & Telemetría Choferes</span>
              {activeTab === 'breaks' && <span className="text-[10px] bg-amber-600 text-white font-bold px-2 py-0.5 rounded-full">Activo</span>}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Control de almuerzo y meriendas, exceso de tiempos y motor anti-fraude por GPS del vehículo.
            </p>
          </div>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <AnalyticsFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        driversList={driversList}
        routesList={routesList}
        vehiclesList={vehiclesList}
        exportDocs={queueDocs}
        loading={isPending}
      />

      {!hasLoaded && queueDocs.length === 0 && (
        <Card className="border-dashed border-2 border-purple-300 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 p-8 text-center space-y-4 shadow-sm">
          <div className="mx-auto w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center text-purple-600 dark:text-purple-300">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-foreground">Carga de Analítica bajo demanda</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Defina el rango de fechas, chofer, ruta, vehículo o número de documento deseado y presione el botón para consultar y calcular los KPIs.
            </p>
          </div>
          <Button
            onClick={() => handleFilterChange(filters)}
            disabled={isPending}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-6 py-2 rounded-xl gap-2 shadow-md"
          >
            {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            📊 Consultar y Calcular Analítica
          </Button>
        </Card>
      )}

      {/* Main Content Area */}
      {activeTab === 'kpis' ? (
        <div className="space-y-6">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* OTIF */}
            <Card className="border-l-4 border-l-emerald-500 shadow-sm relative overflow-hidden">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Efectividad OTIF Global</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </CardDescription>
                <CardTitle className="text-3xl font-extrabold text-emerald-600">
                  {otifRate}%
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">
                  {completedDocs.length} de {totalDocs} pedidos sin novedad.
                </p>
                <div className="bg-emerald-50 border border-emerald-200/60 rounded-md p-1.5 text-[10px] text-emerald-800 leading-tight flex items-start gap-1">
                  <HelpCircle className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>¿Qué es OTIF?</strong> (Entregas Completas y a Tiempo): Porcentaje de despacho entregado 100% sin mermas ni reclamos.
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Avg Descarga Time */}
            <Card className="border-l-4 border-l-blue-500 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  Promedio Tiempo Descarga
                  <Clock className="h-4 w-4 text-blue-500" />
                </CardDescription>
                <CardTitle className="text-3xl font-extrabold text-blue-600">
                  {avgDescargaMin > 0 ? `${avgDescargaMin} min` : 'N/A'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Minutos promedio desde arribo a entrega efectiva.
                </p>
              </CardContent>
            </Card>

            {/* Incidencias / Incompletos */}
            <Card className="border-l-4 border-l-amber-500 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  Pedidos con Incidencia
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </CardDescription>
                <CardTitle className="text-3xl font-extrabold text-amber-600">
                  {incompleteDocs.length}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Entregas parciales o mermas reportadas.
                </p>
              </CardContent>
            </Card>

            {/* Rechazos */}
            <Card className="border-l-4 border-l-rose-500 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  Pedidos Rechazados
                  <Truck className="h-4 w-4 text-rose-500" />
                </CardDescription>
                <CardTitle className="text-3xl font-extrabold text-rose-600">
                  {rejectedDocs.length}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Devoluciones totales reinyectadas a cola.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Drivers & Trucks Analysis Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Driver Performance Card */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Users className="h-5 w-5 text-indigo-600" />
                    Desempeño y Efectividad por Chofer
                  </CardTitle>
                  <CardDescription>
                    Evaluación de volumen de entregas, efectividad OTIF y tiempo promedio.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {driverList.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground italic">
                    No se registran asignaciones en el período.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50 font-semibold uppercase text-muted-foreground">
                            <th className="py-2.5 px-3">Chofer</th>
                            <th className="py-2.5 px-3 text-center">Entregas</th>
                            <th className="py-2.5 px-3 text-center">OTIF %</th>
                            <th className="py-2.5 px-3 text-center">Incidencias</th>
                            <th className="py-2.5 px-3 text-right">T. Promedio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedDrivers.map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-600">{item.total}</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                                  item.otifRate >= 90 ? 'bg-emerald-100 text-emerald-700' :
                                  item.otifRate >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                                }`}>
                                  {item.otifRate}%
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {item.incomplete + item.rejected > 0 ? (
                                  <Badge variant="destructive" className="text-[10px]">
                                    {item.incomplete + item.rejected}
                                  </Badge>
                                ) : (
                                  <span className="text-slate-400">0</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                                {item.avgDescarga > 0 ? `${item.avgDescarga} min` : 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalDriverPages > 1 && (
                      <div className="flex items-center justify-between pt-2 border-t text-xs">
                        <span className="text-muted-foreground font-medium">Página {driverPage} de {totalDriverPages}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs rounded-lg gap-1"
                            disabled={driverPage <= 1}
                            onClick={() => setDriverPage(p => p - 1)}
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs rounded-lg gap-1"
                            disabled={driverPage >= totalDriverPages}
                            onClick={() => setDriverPage(p => p + 1)}
                          >
                            Siguiente <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Truck / Vehicle Performance Card */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Navigation className="h-5 w-5 text-blue-600" />
                    Utilización y Cumplimiento por Camión (Placa)
                  </CardTitle>
                  <CardDescription>
                    Total de envíos atendidos y efectividad por unidad vehicular.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {vehicleList.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground italic">
                    No hay vehículos registrados en el período.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50 font-semibold uppercase text-muted-foreground">
                            <th className="py-2.5 px-3">Placa / Vehículo</th>
                            <th className="py-2.5 px-3 text-center">Envíos</th>
                            <th className="py-2.5 px-3 text-center">Completos</th>
                            <th className="py-2.5 px-3 text-center">Mermas / Rechazos</th>
                            <th className="py-2.5 px-3 text-right">Efectividad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedVehicles.map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="py-2.5 px-3 font-bold text-blue-700">{item.plate}</td>
                              <td className="py-2.5 px-3 text-center font-semibold text-slate-700">{item.total}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-600 font-bold">{item.completed}</td>
                              <td className="py-2.5 px-3 text-center text-rose-600 font-semibold">
                                {item.incomplete + item.rejected}
                              </td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-slate-800">
                                {item.otifRate}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalVehiclePages > 1 && (
                      <div className="flex items-center justify-between pt-2 border-t text-xs">
                        <span className="text-muted-foreground font-medium">Página {vehiclePage} de {totalVehiclePages}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs rounded-lg gap-1"
                            disabled={vehiclePage <= 1}
                            onClick={() => setVehiclePage(p => p - 1)}
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs rounded-lg gap-1"
                            disabled={vehiclePage >= totalVehiclePages}
                            onClick={() => setVehiclePage(p => p + 1)}
                          >
                            Siguiente <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Retention Table Card (Top Clients) */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  Top Clientes con Mayor Tiempo de Descarga y Maniobra
                </CardTitle>
                <CardDescription>
                  Identificación de clientes que presentan mayores tiempos de atención para optimizar ventanas logísticas.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {clientRetentionList.length === 0 ? (
                <p className="text-center py-8 text-sm text-muted-foreground italic">
                  No hay suficientes datos de entregas evaluados.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                          <th className="py-2.5 px-3">Cliente</th>
                          <th className="py-2.5 px-3 text-center">Entregas Evaluadas</th>
                          <th className="py-2.5 px-3 text-right">Tiempo Promedio Descarga</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedClients.map((item, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-foreground">{item.name}</td>
                            <td className="py-2.5 px-3 text-center">
                              <Badge variant="outline">{item.count}</Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-blue-600">
                              {item.avgDescarga > 0 ? `${item.avgDescarga} minutos` : 'Medición en curso'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {totalClientPages > 1 && (
                    <div className="flex items-center justify-between pt-2 border-t text-xs">
                      <span className="text-muted-foreground font-medium">Página {clientPage} de {totalClientPages}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs rounded-lg gap-1"
                          disabled={clientPage <= 1}
                          onClick={() => setClientPage(p => p - 1)}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs rounded-lg gap-1"
                          disabled={clientPage >= totalClientPages}
                          onClick={() => setClientPage(p => p + 1)}
                        >
                          Siguiente <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : activeTab === 'breaks' ? (
        <Card className="border-amber-200 dark:border-amber-900 shadow-md">
          <CardHeader className="bg-amber-950/10 border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-amber-900 dark:text-amber-300 flex items-center gap-2">
                  <span>⏱️</span> Historial de Pausas, Tiempos de Descanso y Telemetría
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Registros de almuerzo y meriendas por chofer, comparativa de tiempo asignado vs real y banderas anti-fraude.
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {breakEvents.length} Evento(s)
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {breakEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-xs border border-dashed rounded-xl">
                No hay registros de pausas en el rango de fechas seleccionado.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-muted/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3">Chofer / Celular</th>
                      <th className="p-3">Tipo Pausa</th>
                      <th className="p-3">Hora Inicio</th>
                      <th className="p-3">Hora Fin</th>
                      <th className="p-3">Duración Estipulada vs Real</th>
                      <th className="p-3 text-center">Estado / Anti-Fraude</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted/30">
                    {breakEvents.map((b: any) => {
                      const isOverdue = b.overdue_minutes > 0;
                      const isFraud = b.fraud_flag === 1 || b.status === 'fraud_detected';

                      return (
                        <tr key={b.id} className="hover:bg-muted/20">
                          <td className="p-3 font-medium">
                            <div className="flex flex-col">
                              <span className="font-bold">{b.driver_name}</span>
                              {b.hardware_id && <span className="font-mono text-[10px] text-muted-foreground">{b.hardware_id}</span>}
                            </div>
                          </td>
                          <td className="p-3 font-semibold capitalize">
                            {b.break_type === 'lunch' ? '🍱 Almuerzo' : b.break_type === 'breakfast' ? '🥐 Merienda Mañana' : '☕ Merienda Tarde'}
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">
                            {b.start_time ? new Date(b.start_time).toLocaleTimeString() : 'N/D'}
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">
                            {b.end_time ? new Date(b.end_time).toLocaleTimeString() : 'En curso...'}
                          </td>
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              <span>{b.duration_minutes || 0}m real / {b.allowed_minutes || 45}m límite</span>
                              {isOverdue && (
                                <span className="text-[10px] bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 font-bold px-1.5 py-0.5 rounded">
                                  +{b.overdue_minutes}m exceso
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            {isFraud ? (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-red-600 text-white font-bold px-2 py-0.5 rounded-full animate-pulse">
                                ⚠️ Falsa Pausa / Fraude
                              </span>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
                                🟠 Pausa Excedida
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                                🟢 Normal (OK)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="bg-card rounded-2xl border p-4 sm:p-6 shadow-sm">
          <LogisticsMetricsTab assignments={assignments} deliveries={queueDocs} />
        </div>
      )}
    </div>
  );
}
