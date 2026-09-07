'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Search, Filter, Download, RefreshCw } from 'lucide-react';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { getLocalDateStr } from '../lib/utils';

export interface FilterState {
  preset: string;
  startDate: string;
  endDate: string;
  choferName: string;
  rutaId: string;
  vehiculoPlaca: string;
  searchClient: string;
  documentoNumero?: string;
}

interface AnalyticsFilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  driversList: string[];
  routesList: { id: number; name: string }[];
  vehiclesList: string[];
  exportDocs: any[];
  loading?: boolean;
}

export function AnalyticsFilterBar({
  filters,
  onFilterChange,
  driversList,
  routesList,
  vehiclesList,
  exportDocs,
  loading
}: AnalyticsFilterBarProps) {

  const handlePresetSelect = (preset: string) => {
    const now = new Date();
    let start = '';
    let end = getLocalDateStr(now);

    if (preset === 'today') {
      start = end;
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      start = getLocalDateStr(d);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      start = getLocalDateStr(firstDay);
    } else if (preset === 'lastMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      start = getLocalDateStr(firstDay);
      end = getLocalDateStr(lastDay);
    }

    onFilterChange({
      ...filters,
      preset,
      startDate: start,
      endDate: end
    });
  };

  const handleExportExcel = () => {
    if (!exportDocs || exportDocs.length === 0) return;

    const headers = [
      'Documento', 'Tipo', 'Estado', 'Cliente ID', 'Cliente Nombre', 
      'Ruta', 'Vehículo/Placa', 'Chofer', 'Nombre Recibe', 
      'Fecha Registro', 'Fecha Entrega', 'Comentario / Observaciones'
    ];

    const data = exportDocs.map(d => [
      d.documento_numero || '',
      d.tipo_documento || 'factura',
      d.estado || 'pendiente',
      d.cliente_id || '',
      d.cliente_nombre || '',
      d.ruta_nombre || '',
      d.vehiculo_placa || '',
      d.chofer_nombre || d.gestionado_por || '',
      d.nombre_recibe || '',
      d.created_at || '',
      d.fecha_entrega || '',
      d.comentario || ''
    ]);

    exportToExcel({
      fileName: `Reporte_Analitica_Logistica_${filters.startDate}_al_${filters.endDate}`,
      sheetName: 'Analítica OTIF',
      headers,
      data
    });
  };

  return (
    <div className="bg-card rounded-2xl border p-4 shadow-sm space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Filter className="w-4 h-4 text-primary" />
          <span>Filtros Avanzados de Analítica</span>
        </div>

        {/* Date Presets */}
        <div className="flex items-center flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={filters.preset === 'today' ? 'default' : 'outline'}
            className="h-8 text-xs font-semibold rounded-lg"
            onClick={() => handlePresetSelect('today')}
          >
            Hoy
          </Button>
          <Button
            size="sm"
            variant={filters.preset === '7days' ? 'default' : 'outline'}
            className="h-8 text-xs font-semibold rounded-lg"
            onClick={() => handlePresetSelect('7days')}
          >
            Últimos 7 días
          </Button>
          <Button
            size="sm"
            variant={filters.preset === 'thisMonth' ? 'default' : 'outline'}
            className="h-8 text-xs font-semibold rounded-lg"
            onClick={() => handlePresetSelect('thisMonth')}
          >
            Este Mes
          </Button>
          <Button
            size="sm"
            variant={filters.preset === 'lastMonth' ? 'default' : 'outline'}
            className="h-8 text-xs font-semibold rounded-lg"
            onClick={() => handlePresetSelect('lastMonth')}
          >
            Mes Anterior
          </Button>
        </div>
      </div>

      {/* Filter Inputs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
        {/* Start Date */}
        <div className="space-y-1">
          <label className="font-bold text-muted-foreground block">Fecha Inicio</label>
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => onFilterChange({ ...filters, preset: 'custom', startDate: e.target.value })}
              className="h-9 text-xs pl-8 font-medium rounded-lg"
            />
          </div>
        </div>

        {/* End Date */}
        <div className="space-y-1">
          <label className="font-bold text-muted-foreground block">Fecha Fin</label>
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => onFilterChange({ ...filters, preset: 'custom', endDate: e.target.value })}
              className="h-9 text-xs pl-8 font-medium rounded-lg"
            />
          </div>
        </div>

        {/* Chofer Filter */}
        <div className="space-y-1">
          <label className="font-bold text-muted-foreground block">Chofer</label>
          <Select
            value={filters.choferName}
            onValueChange={(val) => onFilterChange({ ...filters, choferName: val })}
          >
            <SelectTrigger className="h-9 text-xs font-medium rounded-lg">
              <SelectValue placeholder="Todos los choferes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los choferes</SelectItem>
              {driversList.map((d, i) => (
                <SelectItem key={i} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Ruta Filter */}
        <div className="space-y-1">
          <label className="font-bold text-muted-foreground block">Ruta Logística</label>
          <Select
            value={filters.rutaId}
            onValueChange={(val) => onFilterChange({ ...filters, rutaId: val })}
          >
            <SelectTrigger className="h-9 text-xs font-medium rounded-lg">
              <SelectValue placeholder="Todas las rutas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las rutas</SelectItem>
              {routesList.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Vehicle Placa Filter */}
        <div className="space-y-1">
          <label className="font-bold text-muted-foreground block">Camión / Placa</label>
          <Select
            value={filters.vehiculoPlaca}
            onValueChange={(val) => onFilterChange({ ...filters, vehiculoPlaca: val })}
          >
            <SelectTrigger className="h-9 text-xs font-medium rounded-lg">
              <SelectValue placeholder="Todos los vehículos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los vehículos</SelectItem>
              {vehiclesList.map((v, i) => (
                <SelectItem key={i} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Document Number Search */}
        <div className="space-y-1">
          <label className="font-bold text-muted-foreground block">N° Documento / Factura</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Ej: FAC-10024..."
              value={filters.documentoNumero || ''}
              onChange={(e) => onFilterChange({ ...filters, documentoNumero: e.target.value })}
              className="h-9 text-xs pl-8 font-medium rounded-lg font-mono"
            />
          </div>
        </div>

        {/* Client Search */}
        <div className="space-y-1">
          <label className="font-bold text-muted-foreground block">Buscar Cliente</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Nombre o ID..."
              value={filters.searchClient}
              onChange={(e) => onFilterChange({ ...filters, searchClient: e.target.value })}
              className="h-9 text-xs pl-8 font-medium rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Export Action Row */}
      <div className="flex items-center justify-between pt-2 border-t text-xs">
        <span className="text-muted-foreground font-medium flex items-center gap-1.5">
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />}
          <span>Encontrados <strong>{exportDocs.length}</strong> registros evaluados</span>
        </span>

        <Button
          size="sm"
          onClick={handleExportExcel}
          disabled={exportDocs.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 gap-1.5 rounded-lg"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar Excel (.xlsx)</span>
        </Button>
      </div>
    </div>
  );
}
