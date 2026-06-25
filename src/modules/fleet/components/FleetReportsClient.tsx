'use client';

import { useState, useMemo } from 'react';
import { 
    FileBarChart, Search, Filter, Download, 
    Calendar, Truck, Fuel, TrendingUp, DollarSign, Activity, SlidersHorizontal,
    Camera, Pin, Check
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
} from "@/components/ui/dialog";
import { saveUserPreferenceAction } from '@/modules/core/lib/auth';
import { useToast } from '@/modules/core/hooks/use-toast';

const parseLogPhoto = (text: string | null | undefined) => {
    if (!text) return { cleanText: "", photoFilename: null };
    const match = text.match(/\[Foto:\s*([^\]]+)\]/);
    if (match) {
        const photoFilename = match[1];
        const cleanText = text.replace(match[0], "").trim();
        return { cleanText, photoFilename };
    }
    return { cleanText: text, photoFilename: null };
};

const calculatePresetDates = (preset: string) => {
    const today = new Date();
    const format = (d: Date) => d.toISOString().split('T')[0];
    
    if (preset === 'current_month') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: format(firstDay), to: format(today) };
    } else if (preset === '3_months') {
        const dateFrom = new Date();
        dateFrom.setMonth(today.getMonth() - 3);
        return { from: format(dateFrom), to: format(today) };
    } else if (preset === '6_months') {
        const dateFrom = new Date();
        dateFrom.setMonth(today.getMonth() - 6);
        return { from: format(dateFrom), to: format(today) };
    } else if (preset === 'all') {
        return { from: '', to: '' };
    }
    return null;
};

export default function FleetReportsClient({ 
    vehicles, 
    fuelLogs,
    defaultRange = 'current_month',
    currentUser
}: { 
    vehicles: any[], 
    fuelLogs: any[],
    defaultRange?: string,
    currentUser?: any
}) {
    const { toast } = useToast();
    const [currentDefaultRange, setCurrentDefaultRange] = useState(defaultRange);
    const [presetRange, setPresetRange] = useState(defaultRange);

    const initialDates = useMemo(() => {
        return calculatePresetDates(defaultRange) || { from: '', to: '' };
    }, [defaultRange]);

    const [filterPlate, setFilterPlate] = useState('all');
    const [filterBrand, setFilterBrand] = useState('all');
    const [dateFrom, setDateFrom] = useState(initialDates.from);
    const [dateTo, setDateTo] = useState(initialDates.to);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
    const [isSavingPref, setIsSavingPref] = useState(false);

    const handlePresetChange = (preset: string) => {
        setPresetRange(preset);
        const dates = calculatePresetDates(preset);
        if (dates) {
            setDateFrom(dates.from);
            setDateTo(dates.to);
        }
    };

    const handleManualDateFromChange = (val: string) => {
        setDateFrom(val);
        setPresetRange('custom');
    };

    const handleManualDateToChange = (val: string) => {
        setDateTo(val);
        setPresetRange('custom');
    };

    const getPresetLabel = (preset: string) => {
        switch (preset) {
            case 'current_month': return 'Mes Actual';
            case '3_months': return 'Últimos 3 Meses';
            case '6_months': return 'Últimos 6 Meses';
            case 'all': return 'Todo el Historial';
            default: return 'Personalizado';
        }
    };

    const brands = useMemo(() => Array.from(new Set(vehicles.map(v => v.brand).filter(Boolean))), [vehicles]);

    const filteredLogs = useMemo(() => {
        return fuelLogs.filter(log => {
            const vehicle = vehicles.find(v => v.id === log.vehicleId);
            if (!vehicle) return false;

            const matchesPlate = filterPlate === 'all' || vehicle.plate === filterPlate;
            const matchesBrand = filterBrand === 'all' || vehicle.brand === filterBrand;
            
            const logDate = new Date(log.date);
            const matchesFrom = !dateFrom || logDate >= new Date(dateFrom);
            const matchesTo = !dateTo || logDate <= new Date(dateTo);

            return matchesPlate && matchesBrand && matchesFrom && matchesTo;
        });
    }, [fuelLogs, vehicles, filterPlate, filterBrand, dateFrom, dateTo]);

    const stats = useMemo(() => {
        const totalLiters = filteredLogs.reduce((acc, log) => acc + (log.liters || 0), 0);
        const totalCost = filteredLogs.reduce((acc, log) => acc + (log.cost || 0), 0);
        const avgCostPerLiter = totalLiters > 0 ? totalCost / totalLiters : 0;

        // Efficiency calculation: Group by vehicle and find min/max mileage
        const vehicleGroups: Record<number, number[]> = {};
        filteredLogs.forEach(log => {
            if (!vehicleGroups[log.vehicleId]) vehicleGroups[log.vehicleId] = [];
            vehicleGroups[log.vehicleId].push(log.mileageBefore);
        });

        let totalDistance = 0;
        Object.values(vehicleGroups).forEach(mileages => {
            if (mileages.length > 1) {
                const max = Math.max(...mileages);
                const min = Math.min(...mileages);
                totalDistance += (max - min);
            }
        });

        const avgEfficiency = totalLiters > 0 ? totalDistance / totalLiters : 0;

        return { totalLiters, totalCost, avgCostPerLiter, avgEfficiency };
    }, [filteredLogs]);

    const exportToExcel = () => {
        const data = filteredLogs.map(log => {
            const vehicle = vehicles.find(v => v.id === log.vehicleId);
            return {
                Fecha: log.date,
                Placa: vehicle?.plate,
                Marca: vehicle?.brand,
                Modelo: vehicle?.model,
                Kilometraje: log.mileageBefore,
                Litros: log.liters,
                Costo: log.cost,
                Conductor: log.driverId,
                Notas: log.notes
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Historial Combustible");
        XLSX.writeFile(workbook, `Reporte_Combustible_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Filtros en Escritorio */}
            <Card className="hidden md:block border-none shadow-md bg-slate-50/50">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Filter className="w-4 h-4 text-blue-600" /> Filtros de Reporte
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Vehículo (Placa)</label>
                        <Select value={filterPlate} onValueChange={setFilterPlate}>
                            <SelectTrigger>
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los vehículos</SelectItem>
                                {vehicles.map(v => (
                                    <SelectItem key={v.id} value={v.plate}>{v.plate}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Marca</label>
                        <Select value={filterBrand} onValueChange={setFilterBrand}>
                            <SelectTrigger>
                                <SelectValue placeholder="Todas" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las marcas</SelectItem>
                                {brands.map(b => (
                                    <SelectItem key={b} value={b}>{b}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 flex flex-col justify-between">
                        <div>
                            <label className="text-xs font-bold uppercase text-muted-foreground">Rango Rápido</label>
                            <Select value={presetRange} onValueChange={handlePresetChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="current_month">Mes Actual</SelectItem>
                                    <SelectItem value="3_months">Últimos 3 Meses</SelectItem>
                                    <SelectItem value="6_months">Últimos 6 Meses</SelectItem>
                                    <SelectItem value="all">Todo el Historial</SelectItem>
                                    {presetRange === 'custom' && (
                                        <SelectItem value="custom">Personalizado</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        {presetRange !== 'custom' && currentUser && (
                            <div className="mt-1 flex items-center justify-start">
                                {presetRange === currentDefaultRange ? (
                                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold flex items-center gap-1">
                                        <Check className="w-3 h-3 text-emerald-600" /> Predeterminado
                                    </span>
                                ) : (
                                    <button 
                                        type="button"
                                        disabled={isSavingPref}
                                        onClick={async () => {
                                            setIsSavingPref(true);
                                            try {
                                                await saveUserPreferenceAction(currentUser.id, 'fleet_reports_default_range', presetRange);
                                                setCurrentDefaultRange(presetRange);
                                                toast({
                                                    title: "Preferencia guardada",
                                                    description: `Se estableció "${getPresetLabel(presetRange)}" como rango por defecto.`,
                                                });
                                            } catch (e) {
                                                console.error(e);
                                            } finally {
                                                setIsSavingPref(false);
                                            }
                                        }}
                                        className="text-[10px] text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200 font-bold flex items-center gap-1 transition-all"
                                    >
                                        <Pin className="w-2.5 h-2.5" /> Guardar por Defecto
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Desde</label>
                        <Input type="date" value={dateFrom} onChange={(e) => handleManualDateFromChange(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Hasta</label>
                        <Input type="date" value={dateTo} onChange={(e) => handleManualDateToChange(e.target.value)} />
                    </div>

                    <div className="flex items-end">
                        <Button onClick={exportToExcel} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                            <Download className="w-4 h-4 mr-2" /> Exportar Excel
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Filtros en Celulares (Estilo Premium Standard) */}
            <div className="md:hidden flex flex-col gap-3">
                <Button 
                    variant="outline" 
                    onClick={() => setMobileFiltersOpen(true)} 
                    className="w-full h-14 rounded-2xl flex items-center justify-between px-4 bg-white border-slate-200 shadow-sm text-slate-700 font-semibold hover:bg-slate-50 transition-all active:scale-[0.98]"
                >
                    <span className="flex items-center gap-2">
                        <SlidersHorizontal className="h-5 w-5 text-blue-600" />
                        Configurar Filtros de Reporte
                    </span>
                    <span className="text-xs font-normal text-slate-400">
                        {filterPlate !== 'all' || filterBrand !== 'all' || dateFrom || dateTo ? "Activos" : "Todos"} ➔
                    </span>
                </Button>

                {(filterPlate !== 'all' || filterBrand !== 'all' || dateFrom || dateTo) && (
                    <div className="bg-slate-100/85 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600 flex flex-col gap-1.5 shadow-inner">
                        {filterPlate !== 'all' && <p><strong>Placa:</strong> {filterPlate}</p>}
                        {filterBrand !== 'all' && <p><strong>Marca:</strong> {filterBrand}</p>}
                        {(dateFrom || dateTo) && (
                            <p><strong>Rango:</strong> {dateFrom ? dateFrom : 'Inicio'} al {dateTo ? dateTo : 'Fin'}</p>
                        )}
                        <Button 
                            variant="ghost" 
                            onClick={() => {
                                setFilterPlate('all');
                                setFilterBrand('all');
                                handlePresetChange(currentDefaultRange);
                            }}
                            className="w-full h-8 mt-1 text-red-500 font-semibold rounded-lg text-xs"
                        >
                            Limpiar Filtros
                        </Button>
                    </div>
                )}

                <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                    <SheetContent side="bottom" className="h-[92vh] rounded-t-[2rem] bg-slate-50 p-0 overflow-hidden flex flex-col">
                        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-3 shrink-0" />
                        <SheetHeader className="px-6 pb-4 border-b bg-white">
                            <SheetTitle className="text-xl font-bold text-slate-800 text-left">
                                Filtros de Reporte
                            </SheetTitle>
                        </SheetHeader>
                        <div className="flex-1 overflow-y-auto px-6 py-6 pb-24 space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Vehículo (Placa)</label>
                                <Select value={filterPlate} onValueChange={setFilterPlate}>
                                    <SelectTrigger className="w-full h-12 rounded-xl">
                                        <SelectValue placeholder="Todos los vehículos" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los vehículos</SelectItem>
                                        {vehicles.map(v => (
                                            <SelectItem key={v.id} value={v.plate}>{v.plate}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Marca</label>
                                <Select value={filterBrand} onValueChange={setFilterBrand}>
                                    <SelectTrigger className="w-full h-12 rounded-xl">
                                        <SelectValue placeholder="Todas las marcas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas las marcas</SelectItem>
                                        {brands.map(b => (
                                            <SelectItem key={b} value={b}>{b}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Rango Rápido</label>
                                <Select value={presetRange} onValueChange={handlePresetChange}>
                                    <SelectTrigger className="w-full h-12 rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="current_month">Mes Actual</SelectItem>
                                        <SelectItem value="3_months">Últimos 3 Meses</SelectItem>
                                        <SelectItem value="6_months">Últimos 6 Meses</SelectItem>
                                        <SelectItem value="all">Todo el Historial</SelectItem>
                                        {presetRange === 'custom' && (
                                            <SelectItem value="custom">Personalizado</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                {presetRange !== 'custom' && currentUser && (
                                    <div className="mt-1 flex items-center justify-start">
                                        {presetRange === currentDefaultRange ? (
                                            <span className="text-xs text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 font-bold flex items-center gap-1">
                                                <Check className="w-3.5 h-3.5 text-emerald-600" /> Predeterminado
                                            </span>
                                        ) : (
                                            <button 
                                                type="button"
                                                disabled={isSavingPref}
                                                onClick={async () => {
                                                    setIsSavingPref(true);
                                                    try {
                                                        await saveUserPreferenceAction(currentUser.id, 'fleet_reports_default_range', presetRange);
                                                        setCurrentDefaultRange(presetRange);
                                                        toast({
                                                            title: "Preferencia guardada",
                                                            description: `Se estableció "${getPresetLabel(presetRange)}" como rango por defecto.`,
                                                        });
                                                    } catch (e) {
                                                        console.error(e);
                                                    } finally {
                                                        setIsSavingPref(false);
                                                    }
                                                }}
                                                className="text-xs text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full border border-blue-200 font-bold flex items-center gap-1 transition-all"
                                            >
                                                <Pin className="w-3 h-3" /> Guardar por Defecto
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Desde</label>
                                <Input type="date" value={dateFrom} onChange={(e) => handleManualDateFromChange(e.target.value)} className="w-full h-12 rounded-xl border-slate-200" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Hasta</label>
                                <Input type="date" value={dateTo} onChange={(e) => handleManualDateToChange(e.target.value)} className="w-full h-12 rounded-xl border-slate-200" />
                            </div>

                            <div className="pt-4 border-t flex flex-col gap-3">
                                <Button 
                                    onClick={() => setMobileFiltersOpen(false)} 
                                    className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 shadow-lg"
                                >
                                    Aplicar Filtros
                                </Button>
                                <Button 
                                    onClick={() => { exportToExcel(); setMobileFiltersOpen(false); }}
                                    className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 shadow-lg"
                                >
                                    <Download className="w-5 h-5" /> Exportar a Excel
                                </Button>
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500 bg-white shadow-sm rounded-xl">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Litros</p>
                                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{stats.totalLiters.toLocaleString(undefined, { minimumFractionDigits: 1 })} L</h3>
                            </div>
                            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                <Fuel className="w-5 h-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-emerald-500 bg-white shadow-sm rounded-xl">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Inversión</p>
                                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">¢{stats.totalCost.toLocaleString()}</h3>
                            </div>
                            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600 font-bold text-xs">
                                CRC
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-amber-500 bg-white shadow-sm rounded-xl">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Costo Prom. L</p>
                                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">¢{stats.avgCostPerLiter.toLocaleString(undefined, { maximumFractionDigits: 1 })}</h3>
                            </div>
                            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-indigo-500 bg-white shadow-sm rounded-xl">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Rendimiento</p>
                                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{stats.avgEfficiency.toFixed(2)} <span className="text-xs text-muted-foreground font-medium">Km/L</span></h3>
                            </div>
                            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                <Activity className="w-5 h-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Historial de Repostaje */}
            <Card className="shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="border-b bg-white">
                    <CardTitle className="text-xl font-bold text-slate-800">Historial de Repostaje</CardTitle>
                    <CardDescription>Mostrando {filteredLogs.length} registros según filtros aplicados.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {/* Tabla en Escritorio */}
                    <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-muted">
                        <table className="w-full text-sm text-left min-w-[700px]">
                            <thead className="bg-slate-50 text-muted-foreground uppercase text-[10px] font-bold border-b">
                                <tr>
                                    <th className="px-5 py-4">Fecha</th>
                                    <th className="px-5 py-4">Vehículo</th>
                                    <th className="px-5 py-4">Marca / Estilo</th>
                                    <th className="px-5 py-4 text-right">Odómetro (km)</th>
                                    <th className="px-5 py-4 text-right">Litros</th>
                                    <th className="px-5 py-4 text-right">Costo</th>
                                    <th className="px-5 py-4">Soporte</th>
                                    <th className="px-5 py-4">Conductor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredLogs.map((log) => {
                                    const vehicle = vehicles.find(v => v.id === log.vehicleId);
                                    const parsed = parseLogPhoto(log.notes);
                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-5 py-4 whitespace-nowrap">{new Date(log.date).toLocaleDateString()}</td>
                                            <td className="px-5 py-4 font-bold text-slate-800">{vehicle?.plate}</td>
                                            <td className="px-5 py-4 text-muted-foreground">{vehicle?.brand} {vehicle?.model}</td>
                                            <td className="px-5 py-4 text-right font-medium text-slate-700">{log.mileageBefore.toLocaleString()}</td>
                                            <td className="px-5 py-4 text-right text-blue-600 font-bold">{log.liters.toFixed(2)}</td>
                                            <td className="px-5 py-4 text-right font-bold text-slate-800">¢{log.cost?.toLocaleString()}</td>
                                            <td className="px-5 py-4">
                                                {parsed.photoFilename ? (
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => setSelectedPhoto(parsed.photoFilename)}
                                                        className="h-8 flex items-center gap-1.5 bg-blue-50/50 hover:bg-blue-50 text-blue-600 border-blue-100 font-semibold"
                                                    >
                                                        <Camera className="w-3.5 h-3.5" /> Ver Ticket
                                                    </Button>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">Sin soporte</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-xs font-semibold text-slate-600">{log.driverId}</td>
                                        </tr>
                                    );
                                })}
                                {filteredLogs.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground italic bg-slate-50/20">
                                            No se encontraron registros para los filtros seleccionados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Tarjetas en Móvil (Estilo Premium Standard) */}
                    <div className="md:hidden flex flex-col gap-3 p-4 bg-slate-50">
                        {filteredLogs.map((log) => {
                            const vehicle = vehicles.find(v => v.id === log.vehicleId);
                            const parsed = parseLogPhoto(log.notes);
                            return (
                                <div key={log.id} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col gap-2 transition-all active:scale-[0.99]">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="font-mono text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-md text-slate-600">{vehicle?.plate}</span>
                                            <h4 className="font-bold text-slate-800 mt-2 text-sm leading-snug">{vehicle?.brand} {vehicle?.model}</h4>
                                        </div>
                                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap bg-slate-50 px-2 py-0.5 rounded border border-slate-200/50">
                                            {new Date(log.date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 border-t pt-3 mt-2 text-xs">
                                        <div>
                                            <p className="text-slate-400">Litros</p>
                                            <p className="font-bold text-blue-600 text-sm mt-0.5">{log.liters.toFixed(2)} L</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-400">Inversión</p>
                                            <p className="font-bold text-slate-800 text-sm mt-0.5">¢{log.cost?.toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-slate-400 font-medium">Odómetro</p>
                                            <p className="font-semibold text-slate-700 text-sm mt-0.5">{log.mileageBefore.toLocaleString()} km</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-dashed border-slate-100 text-xs">
                                        <span className="text-[10px] text-slate-400 font-medium">Conductor:</span>
                                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-semibold">{log.driverId}</span>
                                    </div>
                                    {parsed.cleanText && (
                                        <div className="text-xs bg-slate-50/50 p-2.5 rounded-xl text-slate-500 border border-dashed border-slate-200 mt-1">
                                            <strong>Notas:</strong> {parsed.cleanText}
                                        </div>
                                    )}
                                    {parsed.photoFilename && (
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => setSelectedPhoto(parsed.photoFilename)}
                                            className="w-full h-10 mt-2 flex items-center justify-center gap-2 bg-blue-50/50 hover:bg-blue-50 text-blue-600 border-blue-100 font-bold rounded-xl active:scale-[0.98] transition-all"
                                        >
                                            <Camera className="w-4 h-4" /> Ver Ticket de Combustible
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                        {filteredLogs.length === 0 && (
                            <div className="py-12 text-center text-muted-foreground text-sm italic bg-white border border-dashed rounded-2xl">
                                No se encontraron registros para los filtros seleccionados.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Modal de Previsualización Premium de Ticket / Comprobante */}
            <Dialog open={!!selectedPhoto} onOpenChange={(open) => { if (!open) setSelectedPhoto(null); }}>
                <DialogContent className="sm:max-w-[500px] border-none bg-slate-950/95 backdrop-blur-md text-white shadow-2xl p-6 rounded-3xl">
                    <DialogHeader className="space-y-1.5">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
                            <Camera className="h-5 w-5 text-blue-400" />
                            Comprobante Digital
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-400">
                            Ticket de combustible adjunto a este registro desde Telegram.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedPhoto && (
                        <div className="relative mt-4 w-full h-[480px] bg-black/60 rounded-2xl overflow-hidden flex items-center justify-center border border-white/10 group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                                src={`/api/fleet/files/${selectedPhoto}`} 
                                alt="Comprobante de repostaje" 
                                className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
                            />
                        </div>
                    )}
                    <div className="mt-4 flex gap-3">
                        <Button 
                            variant="secondary" 
                            className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-xl h-11 font-semibold"
                            onClick={() => setSelectedPhoto(null)}
                        >
                            Cerrar Vista
                        </Button>
                        {selectedPhoto && (
                            <a 
                                href={`/api/fleet/files/${selectedPhoto}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1"
                            >
                                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-semibold flex items-center justify-center gap-2">
                                    Abrir Original
                                </Button>
                            </a>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
