'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    Search, 
    MapPin, 
    Phone, 
    User, 
    FileText, 
    Navigation, 
    Save, 
    ChevronLeft, 
    ChevronRight, 
    Loader2, 
    X,
    Building2,
    DollarSign,
    CheckCircle2,
    XCircle
} from 'lucide-react';
import { 
    getPaginatedCustomersAction, 
    getCustomerShipmentAddressesAction, 
    updateShipmentAddressCoordinatesAction 
} from '@/modules/core/lib/actions';
import { Customer } from '@/modules/core/types';

export default function ClientesPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized, isLoading: authLoading } = useAuthorization(['deliveries:customers']); // Permissions mapping
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    // Customers State
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [hasLocationOnly, setHasLocationOnly] = useState(false);

    // Selected Customer Details
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [shipmentAddresses, setShipmentAddresses] = useState<any[]>([]);
    const [loadingAddresses, setLoadingAddresses] = useState(false);

    // Coordinate Editor State
    const [editingAddress, setEditingAddress] = useState<any | null>(null);
    const [tempLat, setTempLat] = useState('');
    const [tempLng, setTempLng] = useState('');

    useEffect(() => {
        setTitle("Clientes y Direcciones");
    }, [setTitle]);

    const loadCustomers = useCallback(() => {
        startTransition(async () => {
            try {
                const res = await getPaginatedCustomersAction(search, false, page, pageSize, hasLocationOnly);
                setCustomers(res.customers);
                setTotalCount(res.totalCount);
                setTotalPages(res.totalPages);
            } catch (err: any) {
                toast({
                    title: "Error al cargar clientes",
                    description: err.message,
                    variant: "destructive"
                });
            }
        });
    }, [search, page, pageSize, hasLocationOnly, toast]);

    useEffect(() => {
        loadCustomers();
    }, [loadCustomers]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handleSelectCustomer = async (cust: Customer) => {
        setSelectedCustomer(cust);
        setEditingAddress(null);
        setLoadingAddresses(true);
        try {
            const addresses = await getCustomerShipmentAddressesAction(cust.id);
            setShipmentAddresses(addresses);
        } catch (err: any) {
            toast({
                title: "Error al cargar direcciones",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setLoadingAddresses(false);
        }
    };

    const handleStartEditCoordinates = (addr: any) => {
        setEditingAddress(addr);
        setTempLat(addr.latitude !== null ? String(addr.latitude) : '');
        setTempLng(addr.longitude !== null ? String(addr.longitude) : '');
    };

    const handleSaveCoordinates = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomer || !editingAddress) return;

        const lat = tempLat.trim() !== '' ? parseFloat(tempLat) : null;
        const lng = tempLng.trim() !== '' ? parseFloat(tempLng) : null;

        if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) {
            toast({ title: "Coordenadas inválidas", description: "La latitud debe ser un número entre -90 y 90.", variant: "destructive" });
            return;
        }
        if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) {
            toast({ title: "Coordenadas inválidas", description: "La longitud debe ser un número entre -180 y 180.", variant: "destructive" });
            return;
        }

        startTransition(async () => {
            try {
                await updateShipmentAddressCoordinatesAction(
                    selectedCustomer.id,
                    editingAddress.direccion_id,
                    lat,
                    lng
                );
                toast({
                    title: "Coordenadas actualizadas",
                    description: `Ubicación guardada con éxito para la dirección ${editingAddress.direccion_id}.`
                });
                
                // Refresh address list
                const addresses = await getCustomerShipmentAddressesAction(selectedCustomer.id);
                setShipmentAddresses(addresses);
                setEditingAddress(null);
            } catch (err: any) {
                toast({
                    title: "Error al guardar coordenadas",
                    description: err.message,
                    variant: "destructive"
                });
            }
        });
    };

    const handleClearCoordinates = (addr: any) => {
        if (!selectedCustomer) return;
        startTransition(async () => {
            try {
                await updateShipmentAddressCoordinatesAction(
                    selectedCustomer.id,
                    addr.direccion_id,
                    null,
                    null
                );
                toast({
                    title: "Geolocalización eliminada",
                    description: `Se han borrado las coordenadas de la dirección ${addr.direccion_id}.`
                });
                
                // Refresh address list
                const addresses = await getCustomerShipmentAddressesAction(selectedCustomer.id);
                setShipmentAddresses(addresses);
                setEditingAddress(null);
            } catch (err: any) {
                toast({
                    title: "Error al eliminar ubicación",
                    description: err.message,
                    variant: "destructive"
                });
            }
        });
    };

    if (authLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Customers List Section */}
                <div className={`lg:col-span-2 space-y-4 ${selectedCustomer ? 'hidden lg:block' : ''}`}>
                    <Card className="shadow-lg border-slate-100">
                        <CardHeader className="bg-slate-50/50">
                            <CardTitle className="text-xl font-bold text-slate-800">Catálogo de Clientes</CardTitle>
                            <CardDescription>Visualiza y gestiona las ubicaciones de entrega de los clientes del ERP.</CardDescription>
                            
                            <div className="flex flex-col sm:flex-row gap-4 mt-4 items-center">
                                <div className="relative flex-1 w-full">
                                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar por código, nombre o cédula..."
                                        value={search}
                                        onChange={handleSearchChange}
                                        className="pl-9 bg-white"
                                    />
                                </div>
                                <div className="flex items-center gap-2 shrink-0 select-none">
                                    <input
                                        id="has-location-toggle"
                                        type="checkbox"
                                        checked={hasLocationOnly}
                                        onChange={(e) => {
                                            setHasLocationOnly(e.target.checked);
                                            setPage(1);
                                        }}
                                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                                    />
                                    <Label htmlFor="has-location-toggle" className="text-sm font-bold text-slate-700 cursor-pointer">
                                        Solo con ubicación GPS
                                    </Label>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isPending && customers.length === 0 ? (
                                <div className="flex h-40 items-center justify-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                </div>
                            ) : customers.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                    No se encontraron clientes.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-y border-slate-100">
                                            <tr>
                                                <th className="p-4 font-semibold">Código</th>
                                                <th className="p-4 font-semibold">Nombre</th>
                                                <th className="p-4 font-semibold">Identificación</th>
                                                <th className="p-4 font-semibold">Moneda</th>
                                                <th className="p-4 font-semibold">Condición</th>
                                                <th className="p-4 font-semibold">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {customers.map((cust) => (
                                                <tr 
                                                    key={cust.id} 
                                                    onClick={() => handleSelectCustomer(cust)}
                                                    className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${selectedCustomer?.id === cust.id ? 'bg-primary/5 hover:bg-primary/5' : ''}`}
                                                >
                                                    <td className="p-4 font-medium text-slate-700">{cust.id}</td>
                                                    <td className="p-4 font-semibold text-slate-900">{cust.name}</td>
                                                    <td className="p-4 text-slate-500">{cust.taxId || '-'}</td>
                                                    <td className="p-4 text-slate-600">{cust.currency}</td>
                                                    <td className="p-4 text-slate-500 text-xs">{cust.paymentCondition || '-'}</td>
                                                    <td className="p-4">
                                                        {cust.active === 'S' ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                                                <CheckCircle2 className="w-3 h-3" /> Activo
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                                                                <XCircle className="w-3 h-3" /> Inactivo
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                        
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-slate-100 p-4">
                                <div className="text-xs text-muted-foreground">
                                    Mostrando página <b>{page}</b> de {totalPages} ({totalCount} clientes)
                                </div>
                                <div className="flex gap-2">
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        disabled={page === 1} 
                                        onClick={() => setPage(p => p - 1)}
                                    >
                                        <ChevronLeft className="h-4 w-4" /> Anterior
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        disabled={page === totalPages} 
                                        onClick={() => setPage(p => p + 1)}
                                    >
                                        Siguiente <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Detail View Section */}
                {selectedCustomer && (
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="shadow-lg border-primary/10 overflow-hidden">
                            <CardHeader className="bg-primary/5 text-primary-950 border-b border-primary/10 relative">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => setSelectedCustomer(null)}
                                    className="absolute right-4 top-4 text-slate-500 lg:hidden"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                                <CardTitle className="text-lg font-bold flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-primary" /> Detalles del Cliente
                                </CardTitle>
                                <CardDescription className="text-slate-600">
                                    Código: <b>{selectedCustomer.id}</b>
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                {/* Basic Info */}
                                <div className="space-y-3">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Nombre Comercial</Label>
                                        <p className="text-sm font-semibold text-slate-800">{selectedCustomer.name}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Identificación</Label>
                                            <p className="text-sm font-medium text-slate-700">{selectedCustomer.taxId || '-'}</p>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Teléfono</Label>
                                            <p className="text-sm font-medium text-slate-700">{selectedCustomer.phone || '-'}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Dirección General</Label>
                                        <p className="text-sm text-slate-600 text-xs leading-relaxed">{selectedCustomer.address || '-'}</p>
                                    </div>
                                </div>

                                <hr className="border-slate-100" />

                                {/* Shipment Addresses Header */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold text-slate-800">Direcciones de Embarque (Softland)</h4>
                                        {loadingAddresses && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                    </div>

                                    {shipmentAddresses.length === 0 && !loadingAddresses ? (
                                        <div className="p-4 text-center rounded-lg border border-dashed border-slate-200 text-xs text-muted-foreground">
                                            Sin direcciones de embarque importadas. Las entregas por defecto se vincularán al código &quot;ND&quot;.
                                        </div>
                                    ) : (
                                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                                            {shipmentAddresses.map((addr) => (
                                                <div 
                                                    key={addr.direccion_id} 
                                                    className={`p-3 rounded-lg border text-xs transition-colors ${editingAddress?.direccion_id === addr.direccion_id ? 'border-primary bg-primary/5' : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'}`}
                                                >
                                                    <div className="flex items-center justify-between font-bold text-slate-700 mb-1">
                                                        <span>Código: {addr.direccion_id}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase">{addr.descripcion || 'Sin descripción'}</span>
                                                    </div>
                                                    <p className="text-slate-600 leading-normal mb-2">{addr.detalle_direccion || 'Dirección sin detalle'}</p>
                                                    
                                                    {addr.contacto && (
                                                        <div className="flex items-center gap-1 text-slate-500 mb-2">
                                                            <User className="w-3.5 h-3.5" /> <span>{addr.contacto} {addr.cargo ? `(${addr.cargo})` : ''}</span>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                                        <div className="flex items-center gap-1">
                                                            <MapPin className={`w-3.5 h-3.5 ${addr.latitude !== null ? 'text-emerald-500' : 'text-slate-300'}`} />
                                                            <span className="text-[10px] font-semibold text-slate-500">
                                                                {addr.latitude !== null ? `${addr.latitude.toFixed(5)}, ${addr.longitude.toFixed(5)}` : 'Sin geolocalización'}
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            {addr.latitude !== null && (
                                                                <>
                                                                    <Button 
                                                                        variant="outline" 
                                                                        size="sm" 
                                                                        type="button"
                                                                        onClick={() => window.open(`https://waze.com/ul?ll=${addr.latitude},${addr.longitude}&navigate=yes`)}
                                                                        className="h-6 px-1.5 text-[9px] gap-0.5 text-blue-600 hover:text-blue-700 border-blue-200"
                                                                    >
                                                                        Waze
                                                                    </Button>
                                                                    <Button 
                                                                        variant="outline" 
                                                                        size="sm" 
                                                                        type="button"
                                                                        onClick={() => window.open(`https://maps.google.com/?q=${addr.latitude},${addr.longitude}`)}
                                                                        className="h-6 px-1.5 text-[9px] gap-0.5 text-emerald-600 hover:text-emerald-700 border-emerald-200"
                                                                    >
                                                                        Maps
                                                                    </Button>
                                                                </>
                                                            )}
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                type="button"
                                                                onClick={() => handleStartEditCoordinates(addr)}
                                                                className="h-6 px-1.5 text-[9px] border-slate-200 hover:bg-slate-100"
                                                            >
                                                                Editar GPS
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Coordinate Editor Form */}
                                {editingAddress && (
                                    <form onSubmit={handleSaveCoordinates} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in duration-200">
                                        <div className="flex items-center justify-between">
                                            <h5 className="text-xs font-bold text-slate-800">
                                                Editar GPS: <b>{editingAddress.direccion_id}</b>
                                            </h5>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                type="button"
                                                onClick={() => setEditingAddress(null)}
                                                className="h-5 w-5 p-0"
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label htmlFor="lat-input" className="text-[10px] text-muted-foreground">Latitud</Label>
                                                <Input 
                                                    id="lat-input"
                                                    placeholder="Ej: 9.9281" 
                                                    value={tempLat}
                                                    onChange={(e) => setTempLat(e.target.value)}
                                                    className="h-8 text-xs bg-white"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="lng-input" className="text-[10px] text-muted-foreground">Longitud</Label>
                                                <Input 
                                                    id="lng-input"
                                                    placeholder="Ej: -84.0907" 
                                                    value={tempLng}
                                                    onChange={(e) => setTempLng(e.target.value)}
                                                    className="h-8 text-xs bg-white"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-1.5 pt-1">
                                            {editingAddress.latitude !== null && (
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    type="button"
                                                    disabled={isPending}
                                                    onClick={() => handleClearCoordinates(editingAddress)}
                                                    className="h-7 text-xs mr-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                                >
                                                    Eliminar GPS
                                                </Button>
                                            )}
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                type="button"
                                                onClick={() => setEditingAddress(null)}
                                                className="h-7 text-xs"
                                            >
                                                Cancelar
                                            </Button>
                                            <Button 
                                                type="submit" 
                                                size="sm"
                                                disabled={isPending}
                                                className="h-7 text-xs gap-1"
                                            >
                                                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar
                                            </Button>
                                        </div>
                                    </form>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </main>
    );
}
