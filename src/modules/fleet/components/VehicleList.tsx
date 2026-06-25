'use client';

import { useState } from 'react';
import { Truck, Search, Plus, MapPin, Gauge, AlertCircle, FileText, Wrench, ShieldAlert, Clock, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useToast } from '@/modules/core/hooks/use-toast';
import { restoreDeletedLogAction } from '../lib/actions';
import { useLoading } from '@/modules/core/hooks/useLoading';

export default function VehicleList({ vehicles, deletedVehicles = [] }: { vehicles: any[], deletedVehicles?: any[] }) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'taller' | 'mechanical' | 'legal'>('all');
    const [showDeleted, setShowDeleted] = useState(false);
    const [restoringId, setRestoringId] = useState<number | null>(null);
    const { toast } = useToast();
    const router = useRouter();
    const { showLoading, hideLoading } = useLoading();

    async function handleRestoreVehicle(archiveId: number) {
        setRestoringId(archiveId);
        showLoading("Restaurando ficha técnica del vehículo...");
        try {
            const res = await restoreDeletedLogAction(archiveId);
            if (res.success) {
                toast({
                    title: "Vehículo Restaurado",
                    description: "La ficha técnica del vehículo ha sido restaurada con éxito.",
                });
                router.refresh();
            } else {
                toast({
                    title: "Error al restaurar",
                    description: res.error || "No se pudo restaurar el vehículo.",
                    variant: "destructive",
                });
            }
        } catch (error: any) {
            toast({
                title: "Error inesperado",
                description: error.message || "Se produjo un error al restaurar.",
                variant: "destructive",
            });
        } finally {
            setRestoringId(null);
            hideLoading();
        }
    }

    // Summary stats calculated reactively from vehicles
    const totalVehicles = vehicles.length;
    const inTaller = vehicles.filter((v: any) => v.status !== 'active').length;
    const needsOilChange = vehicles.filter((v: any) => v.currentMileage >= v.lastOilChangeMileage + v.oilChangeInterval).length;
    
    const expiringLegal = vehicles.filter((v: any) => {
        const rtvDate = v.rtvExpiration ? new Date(v.rtvExpiration) : null;
        const rtvNear = rtvDate && (rtvDate.getTime() - new Date().getTime() < 30 * 24 * 60 * 60 * 1000);
        return rtvNear || (v.expiringPermitsCount > 0);
    }).length;

    // Filter vehicles reactively
    const filtered = vehicles.filter(v => {
        const matchesSearch = v.plate.toLowerCase().includes(search.toLowerCase()) ||
            v.brand?.toLowerCase().includes(search.toLowerCase()) ||
            v.model?.toLowerCase().includes(search.toLowerCase());
            
        if (!matchesSearch) return false;
        
        if (filter === 'taller') {
            return v.status !== 'active';
        }
        if (filter === 'mechanical') {
            return v.currentMileage >= v.lastOilChangeMileage + v.oilChangeInterval;
        }
        if (filter === 'legal') {
            const rtvDate = v.rtvExpiration ? new Date(v.rtvExpiration) : null;
            const rtvNear = rtvDate && (rtvDate.getTime() - new Date().getTime() < 30 * 24 * 60 * 60 * 1000);
            return rtvNear || (v.expiringPermitsCount > 0);
        }
        
        return true;
    });

    return (
        <div className="space-y-6">
            {/* Interactive Summary Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card 
                    className={`border-l-4 border-l-blue-500 shadow-sm cursor-pointer transition-all duration-200 hover:scale-[1.02] ${filter === 'all' ? 'ring-2 ring-blue-500 ring-offset-1 bg-blue-50/10' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Flota Total</CardTitle>
                        <Truck className="w-4 h-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-900">{totalVehicles}</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Unidades registradas</p>
                    </CardContent>
                </Card>

                <Card 
                    className={`border-l-4 border-l-amber-500 shadow-sm cursor-pointer transition-all duration-200 hover:scale-[1.02] ${filter === 'taller' ? 'ring-2 ring-amber-500 ring-offset-1 bg-amber-50/10' : ''}`}
                    onClick={() => setFilter('taller')}
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Fuera de Servicio</CardTitle>
                        <Wrench className="w-4 h-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-amber-800">{inTaller}</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">En mantenimiento</p>
                    </CardContent>
                </Card>

                <Card 
                    className={`border-l-4 border-l-rose-500 shadow-sm cursor-pointer transition-all duration-200 hover:scale-[1.02] ${filter === 'mechanical' ? 'ring-2 ring-rose-500 ring-offset-1 bg-rose-50/10' : ''}`}
                    onClick={() => setFilter('mechanical')}
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Alertas Mecánicas</CardTitle>
                        <ShieldAlert className="w-4 h-4 text-rose-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-rose-800">{needsOilChange}</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Requieren cambio de aceite</p>
                    </CardContent>
                </Card>

                <Card 
                    className={`border-l-4 border-l-purple-500 shadow-sm cursor-pointer transition-all duration-200 hover:scale-[1.02] ${filter === 'legal' ? 'ring-2 ring-purple-500 ring-offset-1 bg-purple-50/10' : ''}`}
                    onClick={() => setFilter('legal')}
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Alertas Legales</CardTitle>
                        <ShieldAlert className="w-4 h-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-purple-800">{expiringLegal}</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Vencimientos próximos</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filter controls and count banner */}
            <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full sm:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input 
                            placeholder="Buscar placa, marca o modelo..." 
                            className="pl-10 h-11 sm:h-10"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                        {deletedVehicles.length > 0 && (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className={`text-xs gap-1.5 h-11 sm:h-10 shrink-0 font-bold ${
                                    showDeleted ? 'bg-rose-50 hover:bg-rose-100 border-rose-250 text-rose-700' : 'text-slate-650 hover:text-slate-850'
                                }`}
                                onClick={() => setShowDeleted(!showDeleted)}
                            >
                                <Trash2 className={`w-4 h-4 ${showDeleted ? 'text-rose-500 animate-pulse' : ''}`} />
                                Papelera ({deletedVehicles.length})
                            </Button>
                        )}
                        {filter !== 'all' && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-xs text-muted-foreground"
                                onClick={() => setFilter('all')}
                            >
                                Limpiar filtro
                            </Button>
                        )}
                        <Link href="/dashboard/fleet/new" className="w-full sm:w-auto">
                            <Button className="bg-blue-600 hover:bg-blue-700 w-full h-11 sm:h-10">
                                <Plus className="w-4 h-4 mr-2" /> Registrar Activo
                            </Button>
                        </Link>
                    </div>
                </div>

                {filter !== 'all' && (
                    <div className="text-xs text-muted-foreground bg-slate-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 font-medium border border-slate-200">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        Mostrando {filtered.length} de {vehicles.length} activos (Filtro: {
                            filter === 'taller' ? 'Fuera de Servicio' :
                            filter === 'mechanical' ? 'Alertas Mecánicas' :
                            filter === 'legal' ? 'Alertas Legales' : ''
                        })
                    </div>
                )}
            </div>

            {showDeleted && deletedVehicles.length > 0 && (
                <div className="bg-rose-50/30 border border-rose-100 rounded-xl p-4 space-y-4 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                        <h4 className="font-bold text-rose-900 flex items-center gap-1.5 text-sm sm:text-base">
                            <Clock className="w-4 h-4 text-rose-500 animate-pulse" />
                            Vehículos Eliminados (Fichas Técnicas en Papelera)
                        </h4>
                        <span className="text-xs text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full font-bold">
                            Total: {deletedVehicles.length}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {deletedVehicles.map((archived: any) => {
                            const payload = JSON.parse(archived.payload);
                            return (
                                <Card key={archived.id} className="border-l-4 border-l-rose-500 bg-white/80 hover:shadow-md transition-shadow relative">
                                    <CardContent className="p-4 flex gap-4">
                                        <div className="w-20 h-20 rounded-lg bg-rose-50 border border-rose-150 flex items-center justify-center overflow-hidden shrink-0">
                                            {payload.photoUrl ? (
                                                <Image 
                                                    src={`/api/fleet/files/${payload.photoUrl}`} 
                                                    alt={payload.plate} 
                                                    className="w-full h-full object-cover opacity-60 grayscale"
                                                    width={80}
                                                    height={80}
                                                    unoptimized
                                                />
                                            ) : (
                                                <Truck className="w-8 h-8 text-rose-400 opacity-60" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1">
                                                <h3 className="text-lg font-bold text-rose-950 truncate">{payload.plate}</h3>
                                                <Badge className="bg-rose-100 text-rose-700 border-none font-bold text-[9px] px-1.5 py-0.5 shrink-0">
                                                    Eliminado
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-slate-500 font-medium truncate">
                                                {payload.brand} {payload.model} ({payload.year})
                                            </p>
                                            <div className="mt-2 text-[10px] text-rose-900 bg-rose-50/50 p-1.5 rounded border border-rose-100">
                                                <div className="font-semibold truncate">Por: {archived.deletedBy}</div>
                                                <div>El: {new Date(archived.deletedAt).toLocaleString()}</div>
                                            </div>
                                            
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="w-full mt-3 h-8 text-xs font-black text-emerald-600 border-emerald-200 hover:bg-emerald-50 bg-emerald-50/10 flex items-center justify-center gap-1 shrink-0 rounded-lg shadow-sm"
                                                onClick={() => handleRestoreVehicle(archived.id)}
                                            >
                                                <Clock className="w-3.5 h-3.5 rotate-180" />
                                                Restaurar Ficha
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Vehicles Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((vehicle) => {
                    const isTaller = vehicle.status !== 'active';
                    const hasOilAlert = vehicle.currentMileage >= vehicle.lastOilChangeMileage + vehicle.oilChangeInterval;
                    
                    const rtvDate = vehicle.rtvExpiration ? new Date(vehicle.rtvExpiration) : null;
                    const hasRtvAlert = rtvDate && (rtvDate.getTime() - new Date().getTime() < 30 * 24 * 60 * 60 * 1000);
                    
                    const hasPermitAlert = vehicle.expiringPermitsCount > 0;

                    // Calculate days since last update/activity
                    const lastActive = vehicle.lastActivityDate ? new Date(vehicle.lastActivityDate) : null;
                    const today = new Date();
                    const lastActiveDateOnly = lastActive ? new Date(lastActive.getFullYear(), lastActive.getMonth(), lastActive.getDate()) : null;
                    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const daysSinceActive = lastActiveDateOnly 
                        ? Math.floor((todayDateOnly.getTime() - lastActiveDateOnly.getTime()) / (1000 * 60 * 60 * 24)) 
                        : null;

                    let lastActiveLabel = '';
                    let lastActiveColorClass = '';
                    let lastActiveDotColor = '';

                    if (daysSinceActive === null) {
                        lastActiveLabel = 'Sin actividad registrada';
                        lastActiveColorClass = 'bg-slate-100 text-slate-600 border-slate-200';
                        lastActiveDotColor = 'bg-slate-400';
                    } else if (daysSinceActive === 0) {
                        lastActiveLabel = 'Actividad hoy';
                        lastActiveColorClass = 'bg-emerald-50 text-emerald-700 border-emerald-250';
                        lastActiveDotColor = 'bg-emerald-500 animate-pulse';
                    } else if (daysSinceActive === 1) {
                        lastActiveLabel = 'Actividad ayer';
                        lastActiveColorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        lastActiveDotColor = 'bg-emerald-400';
                    } else if (daysSinceActive < 15) {
                        lastActiveLabel = `Actividad hace ${daysSinceActive} días`;
                        lastActiveColorClass = 'bg-green-50 text-green-700 border-green-200';
                        lastActiveDotColor = 'bg-green-500';
                    } else if (daysSinceActive < 30) {
                        lastActiveLabel = `Sin cambios hace ${daysSinceActive} días`;
                        lastActiveColorClass = 'bg-amber-50 text-amber-700 border-amber-200';
                        lastActiveDotColor = 'bg-amber-500 animate-pulse';
                    } else {
                        lastActiveLabel = `Crítico: Inactivo hace ${daysSinceActive} días`;
                        lastActiveColorClass = 'bg-rose-50 text-rose-700 border-rose-300 ring-1 ring-rose-200';
                        lastActiveDotColor = 'bg-rose-500 animate-ping';
                    }

                    let borderClass = "border-t-blue-500";
                    if (isTaller) {
                        borderClass = "border-t-slate-400";
                    } else if (daysSinceActive !== null && daysSinceActive >= 30) {
                        borderClass = "border-t-rose-600 animate-pulse";
                    } else if (hasOilAlert) {
                        borderClass = "border-t-amber-500 animate-pulse";
                    } else if (hasRtvAlert || hasPermitAlert) {
                        borderClass = "border-t-rose-500 animate-pulse";
                    }

                    return (
                        <Card key={vehicle.id} className={`overflow-hidden hover:shadow-lg transition-shadow border-t-4 ${borderClass}`}>
                            <CardContent className="p-0">
                                <div className="p-4 flex gap-4">
                                    <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
                                        {vehicle.photoUrl ? (
                                            <Image 
                                                src={`/api/fleet/files/${vehicle.photoUrl}`} 
                                                alt={vehicle.plate} 
                                                className="w-full h-full object-cover"
                                                width={96}
                                                height={96}
                                                unoptimized
                                            />
                                        ) : (
                                            <Truck className="w-10 h-10 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="text-xl font-bold truncate">{vehicle.plate}</h3>
                                            <Badge variant={vehicle.status === 'active' ? 'outline' : 'secondary'} className={vehicle.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : ''}>
                                                {vehicle.status === 'active' ? 'Activo' : 'En Taller'}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground font-medium">
                                            {vehicle.brand} {vehicle.model} ({vehicle.year})
                                        </p>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Gauge className="w-3.5 h-3.5" />
                                                <span>{vehicle.currentMileage.toLocaleString()} {vehicle.odometerUnit || 'km'}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <MapPin className="w-3.5 h-3.5" />
                                                <span>{vehicle.branchId || 'Sin sede'}</span>
                                            </div>
                                        </div>
                                        {/* Last Activity Badge */}
                                        <div className="mt-3 flex items-center gap-1.5">
                                            <Badge variant="outline" className={`text-[10px] py-0.5 px-2 font-semibold tracking-wide rounded-full flex items-center gap-1.5 shadow-sm transition-all duration-300 ${lastActiveColorClass}`}>
                                                <Clock className="w-3 h-3 text-muted-foreground/85" />
                                                <span className={`w-1.5 h-1.5 rounded-full ${lastActiveDotColor}`}></span>
                                                {lastActiveLabel}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-4 py-3 bg-muted/30 border-t flex flex-wrap gap-2">
                                    {hasOilAlert && (
                                        <Badge variant="destructive" className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
                                            <AlertCircle className="w-3 h-3 mr-1" /> Aceite
                                        </Badge>
                                    )}
                                    {hasRtvAlert && (
                                        <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
                                            <FileText className="w-3 h-3 mr-1" /> RTV
                                        </Badge>
                                    )}
                                    {hasPermitAlert && (
                                        <Badge variant="destructive" className="bg-purple-100 text-purple-850 border-purple-200 hover:bg-purple-100">
                                            <FileText className="w-3 h-3 mr-1" /> Permiso ({vehicle.expiringPermitsCount})
                                        </Badge>
                                    )}
                                    {!hasOilAlert && !hasRtvAlert && !hasPermitAlert && (
                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50">
                                            Vigente
                                        </Badge>
                                    )}
                                </div>

                                <div className="p-4 pt-0">
                                    <Link href={`/dashboard/fleet/vehicles/${vehicle.id}`}>
                                        <Button variant="outline" className="w-full text-blue-600 border-blue-200 hover:bg-blue-600 hover:text-white transition-all duration-200">
                                            Ver Historial y Métricas
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="col-span-full py-20 text-center space-y-3">
                        <Truck className="w-16 h-16 text-muted-foreground/30 mx-auto" />
                        <h3 className="text-xl font-medium text-muted-foreground">No se encontraron vehículos</h3>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">
                            Ajuste su búsqueda o restablezca sus filtros para comenzar la gestión.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
