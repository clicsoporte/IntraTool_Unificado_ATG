'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
    CheckCircle2,
    Mail,
    Truck
} from 'lucide-react';
import { 
    getPaginatedCustomersAction, 
    getCustomerShipmentAddressesAction, 
    updateShipmentAddressCoordinatesAction,
    getPaginatedSuppliersAction,
    updateSupplierCoordinatesAction
} from '@/modules/core/lib/actions';
import { Customer } from '@/modules/core/types';

export default function ClientesPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized, isLoading: authLoading } = useAuthorization(['deliveries:customers']);
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const [activeTab, setActiveTab] = useState<'clientes' | 'proveedores'>('clientes');

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

    // Customer Coordinate & Email Editor State
    const [editingAddress, setEditingAddress] = useState<any | null>(null);
    const [tempLat, setTempLat] = useState('');
    const [tempLng, setTempLng] = useState('');
    const [tempEmailNotificacion, setTempEmailNotificacion] = useState('');

    // Suppliers State
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [supplierSearch, setSupplierSearch] = useState('');
    const [supplierPage, setSupplierPage] = useState(1);
    const [supplierTotalCount, setSupplierTotalCount] = useState(0);
    const [supplierTotalPages, setSupplierTotalPages] = useState(0);
    const [supplierHasLocationOnly, setSupplierHasLocationOnly] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
    const [isEditingSupplierGps, setIsEditingSupplierGps] = useState(false);
    const [supplierTempLat, setSupplierTempLat] = useState('');
    const [supplierTempLng, setSupplierTempLng] = useState('');

    useEffect(() => {
        setTitle("Clientes y Proveedores");
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

    const loadSuppliers = useCallback(() => {
        startTransition(async () => {
            try {
                const res = await getPaginatedSuppliersAction(supplierSearch, supplierPage, 10, supplierHasLocationOnly);
                setSuppliers(res.suppliers);
                setSupplierTotalCount(res.totalCount);
                setSupplierTotalPages(res.totalPages);
            } catch (err: any) {
                toast({
                    title: "Error al cargar proveedores",
                    description: err.message,
                    variant: "destructive"
                });
            }
        });
    }, [supplierSearch, supplierPage, supplierHasLocationOnly, toast]);

    useEffect(() => {
        if (activeTab === 'clientes') {
            loadCustomers();
        } else {
            loadSuppliers();
        }
    }, [activeTab, loadCustomers, loadSuppliers]);

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
        setTempLat(addr.latitude !== null && addr.latitude !== undefined ? String(addr.latitude) : '');
        setTempLng(addr.longitude !== null && addr.longitude !== undefined ? String(addr.longitude) : '');
        setTempEmailNotificacion(addr.email_notificacion || '');
    };

    const handleSaveCoordinates = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomer || !editingAddress) return;

        const lat = tempLat.trim() !== '' ? parseFloat(tempLat) : null;
        const lng = tempLng.trim() !== '' ? parseFloat(tempLng) : null;
        const emailNotif = tempEmailNotificacion.trim() !== '' ? tempEmailNotificacion.trim() : null;

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
                    lng,
                    emailNotif
                );
                toast({
                    title: "Datos de dirección actualizados",
                    description: `Ubicación y correo de notificación guardados para la dirección ${editingAddress.direccion_id}.`
                });
                
                const addresses = await getCustomerShipmentAddressesAction(selectedCustomer.id);
                setShipmentAddresses(addresses);
                setEditingAddress(null);
            } catch (err: any) {
                toast({
                    title: "Error al guardar dirección",
                    description: err.message,
                    variant: "destructive"
                });
            }
        });
    };

    const handleStartEditSupplierGps = (supp: any) => {
        setSelectedSupplier(supp);
        setIsEditingSupplierGps(true);
        setSupplierTempLat(supp.latitude !== null && supp.latitude !== undefined ? String(supp.latitude) : '');
        setSupplierTempLng(supp.longitude !== null && supp.longitude !== undefined ? String(supp.longitude) : '');
    };

    const handleSaveSupplierGps = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSupplier) return;

        const lat = supplierTempLat.trim() !== '' ? parseFloat(supplierTempLat) : null;
        const lng = supplierTempLng.trim() !== '' ? parseFloat(supplierTempLng) : null;

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
                await updateSupplierCoordinatesAction(selectedSupplier.id, lat, lng);
                toast({
                    title: "Geolocalización de Proveedor Actualizada",
                    description: `Ubicación GPS guardada para el proveedor ${selectedSupplier.name}.`
                });
                setIsEditingSupplierGps(false);
                loadSuppliers();
            } catch (err: any) {
                toast({
                    title: "Error al guardar ubicación de proveedor",
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
            <Tabs value={activeTab} onValueChange={(val: any) => {
                setActiveTab(val);
                setSelectedCustomer(null);
                setSelectedSupplier(null);
            }} className="w-full">
                <div className="flex items-center justify-between border-b pb-3 mb-4">
                    <TabsList className="bg-slate-100 p-1">
                        <TabsTrigger value="clientes" className="gap-2 text-xs font-bold px-4">
                            <Building2 className="w-4 h-4 text-indigo-600" /> 👥 Clientes y Direcciones de Embarque
                        </TabsTrigger>
                        <TabsTrigger value="proveedores" className="gap-2 text-xs font-bold px-4">
                            <Truck className="w-4 h-4 text-amber-600" /> 🏭 Proveedores y Recolectas (GPS)
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* TAB 1: CLIENTES */}
                <TabsContent value="clientes" className="m-0 space-y-6">
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
                                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
                                                        <th className="px-4 py-3">Código</th>
                                                        <th className="px-4 py-3">Nombre Comercial</th>
                                                        <th className="px-4 py-3">Teléfono</th>
                                                        <th className="px-4 py-3 text-right">Acción</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {customers.map((cust) => {
                                                        const isSelected = selectedCustomer?.id === cust.id;
                                                        return (
                                                            <tr 
                                                                key={cust.id} 
                                                                onClick={() => handleSelectCustomer(cust)}
                                                                className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-indigo-50/60 font-semibold' : ''}`}
                                                            >
                                                                <td className="px-4 py-3 font-mono text-xs text-indigo-950 font-bold">{cust.id}</td>
                                                                <td className="px-4 py-3 text-slate-800">{cust.name}</td>
                                                                <td className="px-4 py-3 text-slate-500 text-xs">{cust.phone || 'N/D'}</td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-600 font-bold">
                                                                        Ver Direcciones ➔
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Pagination */}
                                    <div className="flex items-center justify-between p-4 border-t border-slate-100 text-xs">
                                        <span className="text-muted-foreground">
                                            Mostrando {customers.length} de {totalCount} clientes
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={page <= 1 || isPending}
                                                onClick={() => setPage(p => Math.max(p - 1, 1))}
                                                className="h-8 text-xs"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </Button>
                                            <span className="font-semibold text-slate-700">Pág. {page} de {totalPages || 1}</span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={page >= totalPages || isPending}
                                                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                                                className="h-8 text-xs"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Customer Shipment Addresses Detail Panel */}
                        {selectedCustomer && (
                            <div className="space-y-4">
                                <Card className="shadow-lg border-indigo-100 bg-white">
                                    <CardHeader className="bg-indigo-50/40 pb-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-lg font-bold text-indigo-950 flex items-center gap-2">
                                                    <Building2 className="w-5 h-5 text-indigo-600" />
                                                    {selectedCustomer.name}
                                                </CardTitle>
                                                <CardDescription className="text-xs font-mono">
                                                    Código ERP: {selectedCustomer.id} | {selectedCustomer.phone || 'Sin Teléfono'}
                                                </CardDescription>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)} className="h-7 w-7 p-0 text-slate-400">
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4 space-y-4">
                                        {/* General Customer Address */}
                                        {selectedCustomer.address && (
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                                                <span className="font-bold text-slate-700 block mb-1">📍 Dirección General de Expediente:</span>
                                                <p className="text-slate-600">{selectedCustomer.address}</p>
                                            </div>
                                        )}

                                        {/* Shipment Addresses List */}
                                        <div className="space-y-2">
                                            <h4 className="font-bold text-xs text-slate-800 flex items-center justify-between">
                                                <span>🚚 Direcciones de Embarque Softland:</span>
                                                <span className="text-[10px] text-indigo-600 font-mono">({shipmentAddresses.length} registradas)</span>
                                            </h4>

                                            {loadingAddresses ? (
                                                <div className="flex h-24 items-center justify-center">
                                                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                                                </div>
                                            ) : shipmentAddresses.length === 0 ? (
                                                <div className="p-4 text-center text-xs text-muted-foreground bg-slate-50 rounded-lg">
                                                    Sin direcciones de embarque específicas. Se utiliza la dirección general.
                                                </div>
                                            ) : (
                                                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                                                    {shipmentAddresses.map((addr) => (
                                                        <div key={addr.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 text-xs">
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-bold font-mono text-indigo-900 bg-indigo-100/70 px-2 py-0.5 rounded text-[11px]">
                                                                    Código: {addr.direccion_id}
                                                                </span>
                                                                {addr.latitude !== null && (
                                                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                                        ✓ GPS Activo
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-slate-800 font-medium">{addr.detalle_direccion || addr.descripcion || 'Sin detalle de dirección'}</p>

                                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                                                <div className="flex items-center gap-1">
                                                                    <MapPin className={`w-3.5 h-3.5 ${addr.latitude !== null ? 'text-emerald-500' : 'text-slate-300'}`} />
                                                                    <span className="text-[10px] font-semibold text-slate-500 font-mono">
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
                                                                        Editar GPS & Email
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Coordinate & Email Editor Form */}
                                        {editingAddress && (
                                            <form onSubmit={handleSaveCoordinates} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in duration-200">
                                                <div className="flex items-center justify-between">
                                                    <h5 className="text-xs font-bold text-slate-800">
                                                        Editar Dirección: <b>{editingAddress.direccion_id}</b>
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
                                                            className="h-8 text-xs bg-white font-mono"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor="lng-input" className="text-[10px] text-muted-foreground">Longitud</Label>
                                                        <Input 
                                                            id="lng-input"
                                                            placeholder="Ej: -84.0907" 
                                                            value={tempLng}
                                                            onChange={(e) => setTempLng(e.target.value)}
                                                            className="h-8 text-xs bg-white font-mono"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label htmlFor="email-notif-input" className="text-[10px] text-muted-foreground">Correo Notificación de Arribo a Bodega</Label>
                                                    <Input 
                                                        id="email-notif-input"
                                                        type="email"
                                                        placeholder="recepcion@cliente.com, logistica@cliente.com" 
                                                        value={tempEmailNotificacion}
                                                        onChange={(e) => setTempEmailNotificacion(e.target.value)}
                                                        className="h-8 text-xs bg-white"
                                                    />
                                                </div>
                                                <div className="flex justify-end gap-1.5 pt-1">
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
                                                        className="h-7 text-xs gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
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
                </TabsContent>

                {/* TAB 2: PROVEEDORES */}
                <TabsContent value="proveedores" className="m-0 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Suppliers List Section */}
                        <div className={`lg:col-span-2 space-y-4 ${selectedSupplier ? 'hidden lg:block' : ''}`}>
                            <Card className="shadow-lg border-amber-100">
                                <CardHeader className="bg-amber-50/40">
                                    <CardTitle className="text-xl font-bold text-amber-950 flex items-center gap-2">
                                        <Truck className="w-5 h-5 text-amber-600" />
                                        Catálogo de Proveedores (Recolectas)
                                    </CardTitle>
                                    <CardDescription>Consulta direcciones de Softland y gestiona la geolocalización GPS para retiros de mercadería.</CardDescription>
                                    
                                    <div className="flex flex-col sm:flex-row gap-4 mt-4 items-center">
                                        <div className="relative flex-1 w-full">
                                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Buscar por código, nombre de proveedor o correo..."
                                                value={supplierSearch}
                                                onChange={(e) => { setSupplierSearch(e.target.value); setSupplierPage(1); }}
                                                className="pl-9 bg-white"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 select-none">
                                            <input
                                                id="supplier-has-location-toggle"
                                                type="checkbox"
                                                checked={supplierHasLocationOnly}
                                                onChange={(e) => {
                                                    setSupplierHasLocationOnly(e.target.checked);
                                                    setSupplierPage(1);
                                                }}
                                                className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                            />
                                            <Label htmlFor="supplier-has-location-toggle" className="text-sm font-bold text-amber-900 cursor-pointer">
                                                Solo con ubicación GPS
                                            </Label>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {isPending && suppliers.length === 0 ? (
                                        <div className="flex h-40 items-center justify-center">
                                            <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                                        </div>
                                    ) : suppliers.length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground">
                                            No se encontraron proveedores registrados.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs uppercase bg-amber-50/80 text-amber-900 border-y border-amber-100">
                                                    <tr>
                                                        <th className="px-4 py-3">Cód. Proveedor</th>
                                                        <th className="px-4 py-3">Nombre Comercial</th>
                                                        <th className="px-4 py-3">Teléfono / Email</th>
                                                        <th className="px-4 py-3 text-right">Acción</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {suppliers.map((supp) => {
                                                        const isSelected = selectedSupplier?.id === supp.id;
                                                        const hasGps = supp.latitude !== null && supp.latitude !== undefined;
                                                        return (
                                                            <tr 
                                                                key={supp.id} 
                                                                onClick={() => {
                                                                    setSelectedSupplier(supp);
                                                                    setIsEditingSupplierGps(false);
                                                                }}
                                                                className={`cursor-pointer hover:bg-amber-50/50 transition-colors ${isSelected ? 'bg-amber-100/60 font-semibold' : ''}`}
                                                            >
                                                                <td className="px-4 py-3 font-mono text-xs text-amber-950 font-bold">{supp.id}</td>
                                                                <td className="px-4 py-3 text-slate-800">
                                                                    <div>{supp.name}</div>
                                                                    {supp.alias && supp.alias !== supp.name && (
                                                                        <div className="text-[11px] text-muted-foreground italic">Alias: {supp.alias}</div>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-slate-500 text-xs">
                                                                    <div>{supp.phone || 'Sin Teléfono'}</div>
                                                                    <div className="text-[11px] text-slate-400 truncate max-w-[150px]">{supp.email || ''}</div>
                                                                </td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-700 font-bold gap-1">
                                                                        {hasGps && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />} Ver Detalle ➔
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Pagination */}
                                    <div className="flex items-center justify-between p-4 border-t border-slate-100 text-xs">
                                        <span className="text-muted-foreground">
                                            Mostrando {suppliers.length} de {supplierTotalCount} proveedores
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={supplierPage <= 1 || isPending}
                                                onClick={() => setSupplierPage(p => Math.max(p - 1, 1))}
                                                className="h-8 text-xs"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </Button>
                                            <span className="font-semibold text-slate-700">Pág. {supplierPage} de {supplierTotalPages || 1}</span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={supplierPage >= supplierTotalPages || isPending}
                                                onClick={() => setSupplierPage(p => Math.min(p + 1, supplierTotalPages))}
                                                className="h-8 text-xs"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Selected Supplier Detail & GPS Panel */}
                        {selectedSupplier && (
                            <div className="space-y-4">
                                <Card className="shadow-lg border-amber-200 bg-white">
                                    <CardHeader className="bg-amber-50/60 pb-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-lg font-bold text-amber-950 flex items-center gap-2">
                                                    <Truck className="w-5 h-5 text-amber-600" />
                                                    {selectedSupplier.name}
                                                </CardTitle>
                                                <CardDescription className="text-xs font-mono">
                                                    Proveedor ERP: #{selectedSupplier.id}
                                                </CardDescription>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedSupplier(null)} className="h-7 w-7 p-0 text-slate-400">
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4 space-y-4">
                                        {/* Softland Supplier Address */}
                                        <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 text-xs space-y-1">
                                            <span className="font-bold text-amber-900 block">📍 Dirección de Despacho (Softland ERP):</span>
                                            <p className="text-slate-800 font-medium">
                                                {selectedSupplier.address || 'Sin dirección registrada en catálogo ERP.'}
                                            </p>
                                        </div>

                                        {/* Contact Data */}
                                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border text-xs">
                                            <div>
                                                <span className="text-muted-foreground font-semibold block text-[10px]">Teléfono:</span>
                                                <span className="font-bold">{selectedSupplier.phone || 'N/D'}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground font-semibold block text-[10px]">Email:</span>
                                                <span className="font-bold truncate block">{selectedSupplier.email || 'N/D'}</span>
                                            </div>
                                        </div>

                                        {/* GPS Location Data */}
                                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-slate-800">📡 Ubicación Satelital GPS de Retiro:</span>
                                                {selectedSupplier.latitude !== null && selectedSupplier.latitude !== undefined && (
                                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                        ✓ GPS Confirmado
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between pt-1">
                                                <div className="flex items-center gap-1 font-mono">
                                                    <MapPin className={`w-4 h-4 ${selectedSupplier.latitude !== null && selectedSupplier.latitude !== undefined ? 'text-emerald-500' : 'text-slate-300'}`} />
                                                    <span className="text-xs font-semibold text-slate-700">
                                                        {selectedSupplier.latitude !== null && selectedSupplier.latitude !== undefined
                                                            ? `${Number(selectedSupplier.latitude).toFixed(5)}, ${Number(selectedSupplier.longitude).toFixed(5)}`
                                                            : 'Sin geolocalización'}
                                                    </span>
                                                </div>
                                                <div className="flex gap-1">
                                                    {selectedSupplier.latitude !== null && selectedSupplier.latitude !== undefined && (
                                                        <>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                type="button"
                                                                onClick={() => window.open(`https://waze.com/ul?ll=${selectedSupplier.latitude},${selectedSupplier.longitude}&navigate=yes`)}
                                                                className="h-7 px-2 text-[10px] gap-1 text-blue-600 border-blue-200 font-bold"
                                                            >
                                                                Waze
                                                            </Button>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                type="button"
                                                                onClick={() => window.open(`https://maps.google.com/?q=${selectedSupplier.latitude},${selectedSupplier.longitude}`)}
                                                                className="h-7 px-2 text-[10px] gap-1 text-emerald-600 border-emerald-200 font-bold"
                                                            >
                                                                Maps
                                                            </Button>
                                                        </>
                                                    )}
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        type="button"
                                                        onClick={() => handleStartEditSupplierGps(selectedSupplier)}
                                                        className="h-7 px-2 text-[10px] border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 font-bold"
                                                    >
                                                        Editar GPS
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Supplier GPS Edit Form */}
                                        {isEditingSupplierGps && (
                                            <form onSubmit={handleSaveSupplierGps} className="p-4 rounded-lg bg-amber-50/80 border border-amber-200 space-y-3 animate-in fade-in duration-200">
                                                <div className="flex items-center justify-between">
                                                    <h5 className="text-xs font-bold text-amber-950">
                                                        Editar Coordenadas GPS Proveedor:
                                                    </h5>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        type="button"
                                                        onClick={() => setIsEditingSupplierGps(false)}
                                                        className="h-5 w-5 p-0"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                        <Label htmlFor="supplier-lat-input" className="text-[10px] text-muted-foreground">Latitud</Label>
                                                        <Input 
                                                            id="supplier-lat-input"
                                                            placeholder="Ej: 10.0166" 
                                                            value={supplierTempLat}
                                                            onChange={(e) => setSupplierTempLat(e.target.value)}
                                                            className="h-8 text-xs bg-white font-mono"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor="supplier-lng-input" className="text-[10px] text-muted-foreground">Longitud</Label>
                                                        <Input 
                                                            id="supplier-lng-input"
                                                            placeholder="Ej: -84.2167" 
                                                            value={supplierTempLng}
                                                            onChange={(e) => setSupplierTempLng(e.target.value)}
                                                            className="h-8 text-xs bg-white font-mono"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex justify-end gap-1.5 pt-1">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        type="button"
                                                        onClick={() => setIsEditingSupplierGps(false)}
                                                        className="h-7 text-xs"
                                                    >
                                                        Cancelar
                                                    </Button>
                                                    <Button 
                                                        type="submit" 
                                                        size="sm"
                                                        disabled={isPending}
                                                        className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                                                    >
                                                        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar GPS
                                                    </Button>
                                                </div>
                                            </form>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </main>
    );
}
