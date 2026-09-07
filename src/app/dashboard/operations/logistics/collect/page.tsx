'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useToast } from '@/modules/core/hooks/use-toast';
import { 
    getSystemUsers, 
    createCollectRequestAction, 
    getCostaRicaGeography,
    getUserCollectRequests,
    cancelCollectRequestAction,
    reinjectCollectToGeneralQueueAction,
    getSuppliersAction
} from '@/modules/operations/lib/actions';
import { searchProductsAction } from '@/modules/core/lib/actions';
import { EvidencePhotoViewer, SelectedPhoto } from '@/modules/operations/components/EvidencePhotoViewer';
import { parsePhotoUrls } from '@/modules/operations/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { Package, User, Phone, Mail, Building, Clock, FileText, ArrowLeft, RefreshCw, MapPin, Trash2, XCircle, CheckCircle2, AlertCircle, Calendar, FileImage, Plus, Search, MessageSquare, Truck } from 'lucide-react';
import Link from 'next/link';
import { useDebounce } from 'use-debounce';

interface SystemUser {
    id: number;
    name: string;
    email: string;
    phone: string;
}

interface ProductItemLine {
    codigo: string;
    descripcion: string;
    cantidad: number;
    unidad: string;
}

export default function CollectRequestPage() {
    const { setTitle } = usePageTitle();
    const { user, companyData } = useAuth();
    const { isAuthorized, isLoading: authLoading } = useAuthorization(['deliveries:collect']);
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Form fields state
    const [proveedor, setProveedor] = useState('');
    const [selectedSupplierObj, setSelectedSupplierObj] = useState<{ id: string; name: string; alias?: string; email?: string; phone?: string; address?: string } | null>(null);
    const [debouncedProveedor] = useDebounce(proveedor, companyData?.searchDebounceTime ?? 500);
    const [suppliersList, setSuppliersList] = useState<{ id: string; name: string; alias?: string; email?: string; phone?: string; address?: string }[]>([]);
    const [ordenCompra, setOrdenCompra] = useState('');
    const [factura, setFactura] = useState('');
    const [metodoPago, setMetodoPago] = useState<'pagar_al_retirar' | 'ya_esta_pago' | 'credito'>('ya_esta_pago');
    const [contactoNombre, setContactoNombre] = useState('');
    const [contactoTelefono, setContactoTelefono] = useState('');
    const [enNombreDeCompanero, setEnNombreDeCompanero] = useState(false);
    const [companeroId, setCompaneroId] = useState<string>('');
    const [horarioProveedor, setHorarioProveedor] = useState('Lunes a Viernes 8:00 AM - 5:00 PM');
    const [lugarEntrega, setLugarEntrega] = useState('');
    const [detalleAdicional, setDetalleAdicional] = useState('');

    // Product Line Items State (Cotizador style)
    const [lines, setLines] = useState<ProductItemLine[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [debouncedProductSearch] = useDebounce(productSearch, companyData?.searchDebounceTime ?? 500);
    const [searchResults, setSearchResults] = useState<{ id: string; description: string; unit?: string }[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [tempCode, setTempCode] = useState('');
    const [tempDesc, setTempDesc] = useState('');
    const [tempQty, setTempQty] = useState('1');
    const [tempUnit, setTempUnit] = useState('UN');

    // Geography states (Costa Rica)
    const [geographyData, setGeographyData] = useState<any>(null);
    const [selectedProvince, setSelectedProvince] = useState('');
    const [selectedCanton, setSelectedCanton] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState('');
    const [direccionDetalle, setDireccionDetalle] = useState('');

    // My own collect requests state
    const [myRequests, setMyRequests] = useState<any[]>([]);
    const [loadingRequests, setLoadingRequests] = useState(true);

    // Pagination & Filters State
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null);

    const loadRequests = React.useCallback(() => {
        setLoadingRequests(true);
        getUserCollectRequests({
            page,
            pageSize,
            startDate: startDate || undefined,
            endDate: endDate || undefined
        })
            .then(res => {
                setMyRequests(res?.requests || []);
                setTotalCount(res?.totalCount || 0);
                setTotalPages(res?.totalPages || 1);
            })
            .catch(err => {
                console.error("Error loading user collect requests:", err);
            })
            .finally(() => {
                setLoadingRequests(false);
            });
    }, [page, pageSize, startDate, endDate]);

    useEffect(() => {
        if (isAuthorized) {
            loadRequests();
        }
    }, [isAuthorized, loadRequests]);

    // System users state
    const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Load Costa Rica geography & suppliers
    useEffect(() => {
        getCostaRicaGeography()
            .then(data => {
                if (data) setGeographyData(data);
            })
            .catch(err => console.error("Error loading geography data:", err));

        getSuppliersAction()
            .then(data => {
                if (data && Array.isArray(data)) setSuppliersList(data);
            })
            .catch(err => console.error("Error loading suppliers:", err));
    }, []);

    // Autocompletar datos de contacto, teléfono y dirección del proveedor
    useEffect(() => {
        if (!debouncedProveedor || suppliersList.length === 0) return;
        const val = debouncedProveedor.trim().toLowerCase();
        const match = suppliersList.find(s => 
            s.name.toLowerCase() === val || 
            s.id.toLowerCase() === val
        );
        if (match) {
            setSelectedSupplierObj(match);
            if (match.phone) setContactoTelefono(match.phone);
            if (match.alias || match.name) setContactoNombre(match.alias || match.name);
            if (match.address) setDireccionDetalle(match.address);
        } else {
            setSelectedSupplierObj(null);
        }
    }, [debouncedProveedor, suppliersList]);

    // Search ERP Products
    useEffect(() => {
        if (!debouncedProductSearch || debouncedProductSearch.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        setLoadingProducts(true);
        searchProductsAction(debouncedProductSearch)
            .then(res => setSearchResults(res || []))
            .catch(err => console.error("Error searching products:", err))
            .finally(() => setLoadingProducts(false));
    }, [debouncedProductSearch]);

    const handleSelectProductFromCatalog = (prod: { id: string; description: string; unit?: string }) => {
        setTempCode(prod.id);
        setTempDesc(prod.description);
        if (prod.unit) setTempUnit(prod.unit);
        setProductSearch(prod.id);
        setSearchResults([]);
    };

    const handleAddManualLine = () => {
        if (!tempDesc.trim()) {
            toast({ variant: "destructive", title: "Descripción requerida", description: "Ingrese la descripción o seleccione un producto a retirar." });
            return;
        }
        const qty = parseFloat(tempQty) || 1;
        setLines(prev => [
            ...prev,
            {
                codigo: tempCode.trim().toUpperCase() || 'MANUAL',
                descripcion: tempDesc.trim(),
                cantidad: qty,
                unidad: tempUnit.trim().toUpperCase() || 'UN'
            }
        ]);
        setTempCode('');
        setTempDesc('');
        setProductSearch('');
        setTempQty('1');
        toast({ title: "Línea agregada", description: `${tempDesc.trim()} (Cant: ${qty})` });
    };

    const handleRemoveLine = (index: number) => {
        setLines(prev => prev.filter((_, i) => i !== index));
    };

    const handleProvinceChange = (val: string) => {
        setSelectedProvince(val);
        setSelectedCanton('');
        setSelectedDistrict('');
    };

    const handleCantonChange = (val: string) => {
        setSelectedCanton(val);
        setSelectedDistrict('');
    };

    useEffect(() => {
        setTitle("Crear Solicitud de Recolecta");
    }, [setTitle]);

    useEffect(() => {
        if (companyData?.name && !lugarEntrega) {
            setLugarEntrega(companyData.name);
        }
    }, [companyData, lugarEntrega]);

    useEffect(() => {
        if (enNombreDeCompanero && systemUsers.length === 0) {
            setLoadingUsers(true);
            getSystemUsers()
                .then((users) => {
                    setSystemUsers(users || []);
                })
                .catch((err) => {
                    console.error("Error fetching system users:", err);
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: "No se pudo cargar la lista de compañeros."
                    });
                })
                .finally(() => {
                    setLoadingUsers(false);
                });
        }
    }, [enNombreDeCompanero, systemUsers, toast]);

    const handlePaymentChange = (type: 'pagar_al_retirar' | 'ya_esta_pago' | 'credito') => {
        setMetodoPago(type);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!proveedor.trim()) {
            toast({ variant: "destructive", title: "Error de validación", description: "El nombre o código del proveedor es requerido." });
            return;
        }

        if (!contactoNombre.trim() || !contactoTelefono.trim()) {
            toast({ variant: "destructive", title: "Error de validación", description: "El nombre y teléfono de contacto del proveedor son requeridos." });
            return;
        }

        if (enNombreDeCompanero && !companeroId) {
            toast({ variant: "destructive", title: "Error de validación", description: "Seleccione el compañero a nombre de quien realiza la solicitud." });
            return;
        }

        if (lines.length === 0) {
            toast({ variant: "destructive", title: "Artículos requeridos", description: "Debe agregar al menos un producto o artículo a la lista de retiro." });
            return;
        }

        const selectedCompanero = systemUsers.find(u => String(u.id) === companeroId);

        const payload = {
            supplier_id: selectedSupplierObj?.id || 'PROV_MANUAL',
            orden_compra: ordenCompra.trim() || undefined,
            factura: factura.trim() || undefined,
            metodo_pago: metodoPago,
            proveedor_contacto_nombre: contactoNombre.trim(),
            proveedor_contacto_telefono: contactoTelefono.trim(),
            solicitante_usuario_id: user?.id || 0,
            solicitante_nombre: user?.name || 'Usuario',
            solicitante_email: user?.email || '',
            solicitante_telefono: user?.phone || '',
            en_nombre_de_companero: enNombreDeCompanero,
            companero_usuario_id: enNombreDeCompanero && selectedCompanero ? selectedCompanero.id : null,
            companero_nombre: enNombreDeCompanero && selectedCompanero ? selectedCompanero.name : null,
            companero_email: enNombreDeCompanero && selectedCompanero ? selectedCompanero.email : null,
            companero_telefono: enNombreDeCompanero && selectedCompanero ? selectedCompanero.phone : null,
            horario_proveedor: horarioProveedor.trim(),
            lugar_entrega: lugarEntrega.trim(),
            detalle_adicional: detalleAdicional.trim() || undefined,
            provincia_id: selectedProvince || undefined,
            provincia_nombre: selectedProvince && geographyData?.provincias?.[selectedProvince]?.nombre || undefined,
            canton_id: selectedCanton || undefined,
            canton_nombre: selectedProvince && selectedCanton && geographyData?.provincias?.[selectedProvince]?.cantones?.[selectedCanton]?.nombre || undefined,
            distrito_id: selectedDistrict || undefined,
            distrito_nombre: selectedProvince && selectedCanton && selectedDistrict && geographyData?.provincias?.[selectedProvince]?.cantones?.[selectedCanton]?.distritos?.[selectedDistrict] || undefined,
            direccion_detalle: direccionDetalle.trim() || undefined
        };

        startTransition(async () => {
            const res = await createCollectRequestAction(proveedor.trim(), payload, lines);
            if (res.success) {
                toast({
                    title: "Solicitud registrada con éxito 🎉",
                    description: `Se ha generado el consecutivo #${res.consecutive}`,
                });
                
                // Clear fields
                setProveedor('');
                setSelectedSupplierObj(null);
                setOrdenCompra('');
                setFactura('');
                setMetodoPago('ya_esta_pago');
                setContactoNombre('');
                setContactoTelefono('');
                setEnNombreDeCompanero(false);
                setCompaneroId('');
                setDetalleAdicional('');
                setLines([]);
                setLugarEntrega(companyData?.name || '');
                setSelectedProvince('');
                setSelectedCanton('');
                setSelectedDistrict('');
                setDireccionDetalle('');
                
                loadRequests();
            } else {
                toast({
                    variant: "destructive",
                    title: "Error al registrar",
                    description: res.error || "Ocurrió un error inesperado al procesar la solicitud."
                });
            }
        });
    };

    const handleCancelRequest = (requestId: number) => {
        if (!confirm("¿Está seguro de que desea cancelar esta solicitud de recolecta?")) {
            return;
        }
        startTransition(async () => {
            const res = await cancelCollectRequestAction(requestId);
            if (res.success) {
                toast({
                    title: "Solicitud cancelada",
                    description: "La solicitud de recolecta ha sido cancelada exitosamente."
                });
                loadRequests();
            } else {
                toast({
                    variant: "destructive",
                    title: "Error al cancelar",
                    description: res.error || "Ocurrió un error inesperado al intentar cancelar la solicitud."
                });
            }
        });
    };

    const handleReinjectCollect = (requestId: number, consecutivo: string) => {
        if (!confirm(`¿Deseas devolver la recolecta #${consecutivo} a la Cola General para que pueda ser asignada a otra ruta?`)) {
            return;
        }
        startTransition(async () => {
            const res = await reinjectCollectToGeneralQueueAction(requestId);
            if (res.success) {
                toast({
                    title: "Recolecta Reactivada",
                    description: `La solicitud #${consecutivo} ha sido reingresada a la Cola General de Logística.`
                });
                loadRequests();
            } else {
                toast({
                    variant: "destructive",
                    title: "Error al reactivar",
                    description: res.error || "No se pudo reactivar la recolecta."
                });
            }
        });
    };

    if (authLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse max-w-7xl mx-auto">
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-600" />
                        <p className="text-muted-foreground font-medium">Cargando módulo de recolección...</p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
                <Button asChild variant="ghost" className="gap-2">
                    <Link href="/dashboard/operations/logistics">
                        <ArrowLeft className="w-4 h-4" /> Volver a Logística
                    </Link>
                </Button>
            </div>

            <Card className="shadow-xl border-purple-100 dark:border-purple-900/30 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 dark:from-purple-950/20 dark:via-indigo-950/20 dark:to-purple-950/20 border-b border-purple-100 dark:border-purple-900/30">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-600 text-white rounded-xl shadow-md">
                            <Package className="w-6 h-6" />
                        </div>
                        <div>
                            <CardTitle className="text-xl font-black text-purple-950 dark:text-purple-100">
                                Registro de Solicitud de Retiro
                            </CardTitle>
                            <CardDescription className="text-sm">
                                Complete los datos del proveedor y especifique los artículos a retirar.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        
                        {/* Section 1: Datos del Proveedor y Facturación */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                                <Building className="w-4 h-4" /> Datos de la Recolecta y Proveedor
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="proveedor" className="text-xs font-black uppercase text-muted-foreground tracking-wider">
                                        Nombre / Razón Social del Proveedor *
                                    </Label>
                                    <Input 
                                        id="proveedor" 
                                        list="suppliers-list-options"
                                        placeholder="Busque o digite el proveedor..." 
                                        value={proveedor}
                                        onChange={(e) => setProveedor(e.target.value)}
                                        className="h-10 text-sm focus-visible:ring-purple-500"
                                        required
                                    />
                                    <datalist id="suppliers-list-options">
                                        {suppliersList.map((s) => (
                                            <option key={s.id} value={s.name}>
                                                {s.alias && s.alias !== s.name ? `${s.name} (${s.alias})` : s.name}
                                            </option>
                                        ))}
                                    </datalist>
                                    {selectedSupplierObj && selectedSupplierObj.address && (
                                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                            ✓ Dirección guardada: {selectedSupplierObj.address}
                                        </p>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="ordenCompra" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Orden de Compra (Opcional)</Label>
                                        <Input 
                                            id="ordenCompra" 
                                            placeholder="Ej. OC-12345" 
                                            value={ordenCompra}
                                            onChange={(e) => setOrdenCompra(e.target.value)}
                                            className="h-10 text-sm focus-visible:ring-purple-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="factura" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Factura del Proveedor (Opcional)</Label>
                                        <Input 
                                            id="factura" 
                                            placeholder="Ej. F-98765" 
                                            value={factura}
                                            onChange={(e) => setFactura(e.target.value)}
                                            className="h-10 text-sm focus-visible:ring-purple-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Método de Pago */}
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase text-muted-foreground tracking-wider">Método de Pago Seleccionado *</Label>
                                <div className="flex flex-wrap gap-4 pt-1">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id="pagar_al_retirar" 
                                            checked={metodoPago === 'pagar_al_retirar'}
                                            onCheckedChange={() => handlePaymentChange('pagar_al_retirar')}
                                            className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                        />
                                        <Label htmlFor="pagar_al_retirar" className="text-xs font-medium cursor-pointer">Pagar al Retirar</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id="ya_esta_pago" 
                                            checked={metodoPago === 'ya_esta_pago'}
                                            onCheckedChange={() => handlePaymentChange('ya_esta_pago')}
                                            className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                        />
                                        <Label htmlFor="ya_esta_pago" className="text-xs font-medium cursor-pointer">Ya está Pago (Crédito/Transferencia)</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id="credito" 
                                            checked={metodoPago === 'credito'}
                                            onCheckedChange={() => handlePaymentChange('credito')}
                                            className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                        />
                                        <Label htmlFor="credito" className="text-xs font-medium cursor-pointer">Crédito a Cuenta</Label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <hr className="border-muted" />

                        {/* Section 2: Contacto del Proveedor */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                <Phone className="w-4 h-4" /> Datos de Contacto del Proveedor
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="contactoNombre" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Nombre del Vendedor / Contacto *</Label>
                                    <Input 
                                        id="contactoNombre" 
                                        placeholder="Ej. Roberto Gómez" 
                                        value={contactoNombre}
                                        onChange={(e) => setContactoNombre(e.target.value)}
                                        className="h-10 text-sm focus-visible:ring-purple-500"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="contactoTelefono" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Teléfono de Contacto * (WhatsApp)</Label>
                                    <Input 
                                        id="contactoTelefono" 
                                        placeholder="Ej. 88887777" 
                                        value={contactoTelefono}
                                        onChange={(e) => setContactoTelefono(e.target.value)}
                                        className="h-10 text-sm focus-visible:ring-purple-500"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <hr className="border-muted" />

                        {/* Geographic Location Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                                <MapPin className="w-4 h-4 animate-bounce" /> Ubicación y Dirección del Proveedor (Opcional)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="provinceSelect" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Provincia</Label>
                                    <Select value={selectedProvince} onValueChange={handleProvinceChange}>
                                        <SelectTrigger id="provinceSelect" className="w-full h-10 bg-white dark:bg-zinc-950 border-purple-100">
                                            <SelectValue placeholder="Seleccione provincia..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {geographyData?.provincias && Object.entries(geographyData.provincias).map(([id, p]: any) => (
                                                <SelectItem key={id} value={id}>
                                                    {p.nombre}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="cantonChange" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Cantón</Label>
                                    <Select 
                                        value={selectedCanton} 
                                        onValueChange={handleCantonChange}
                                        disabled={!selectedProvince}
                                    >
                                        <SelectTrigger id="cantonChange" className="w-full h-10 bg-white dark:bg-zinc-950 border-purple-100">
                                            <SelectValue placeholder="Seleccione cantón..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {selectedProvince && geographyData?.provincias?.[selectedProvince]?.cantones && 
                                                Object.entries(geographyData.provincias[selectedProvince].cantones).map(([id, c]: any) => (
                                                    <SelectItem key={id} value={id}>
                                                        {c.nombre}
                                                    </SelectItem>
                                                ))
                                            }
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="districtChange" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Distrito</Label>
                                    <Select 
                                        value={selectedDistrict} 
                                        onValueChange={setSelectedDistrict}
                                        disabled={!selectedCanton}
                                    >
                                        <SelectTrigger id="districtChange" className="w-full h-10 bg-white dark:bg-zinc-950 border-purple-100">
                                            <SelectValue placeholder="Seleccione distrito..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {selectedProvince && selectedCanton && geographyData?.provincias?.[selectedProvince]?.cantones?.[selectedCanton]?.distritos && 
                                                Object.entries(geographyData.provincias[selectedProvince].cantones[selectedCanton].distritos).map(([id, name]: any) => (
                                                    <SelectItem key={id} value={id}>
                                                        {name}
                                                    </SelectItem>
                                                ))
                                            }
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="direccionDetalle" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Dirección Exacta / Detalles de Ubicación</Label>
                                <Textarea 
                                    id="direccionDetalle" 
                                    placeholder="Ej. De la iglesia 200m norte, frente a Bodega #3..." 
                                    value={direccionDetalle}
                                    onChange={(e) => setDireccionDetalle(e.target.value)}
                                    className="min-h-[70px] text-sm focus-visible:ring-purple-500"
                                />
                            </div>
                        </div>

                        <hr className="border-muted" />

                        {/* Solicitante section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                                <User className="w-4 h-4" /> Datos del Solicitante (Compras)
                            </h3>

                            <div className="flex items-center space-x-2 pb-2">
                                <Checkbox 
                                    id="enNombreDeCompanero" 
                                    checked={enNombreDeCompanero}
                                    onCheckedChange={(checked) => setEnNombreDeCompanero(!!checked)}
                                    className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                />
                                <Label 
                                    htmlFor="enNombreDeCompanero" 
                                    className="text-xs font-semibold cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Realizar esta solicitud en nombre de un compañero de trabajo
                                </Label>
                            </div>

                            {enNombreDeCompanero ? (
                                <div className="space-y-2 bg-purple-50/50 dark:bg-purple-950/20 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
                                    <Label htmlFor="companeroSelect" className="text-xs font-black uppercase text-purple-900 dark:text-purple-200 tracking-wider">
                                        Seleccionar Compañero Solicitante *
                                    </Label>
                                    {loadingUsers ? (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando lista de compañeros...
                                        </div>
                                    ) : (
                                        <Select value={companeroId} onValueChange={setCompaneroId}>
                                            <SelectTrigger id="companeroSelect" className="w-full h-10 bg-white dark:bg-zinc-950 border-purple-200">
                                                <SelectValue placeholder="Seleccione un compañero..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {systemUsers.map((u) => (
                                                    <SelectItem key={u.id} value={String(u.id)}>
                                                        {u.name} ({u.email})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-muted/30 p-4 rounded-xl border border-muted/50">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Nombre</span>
                                        <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 text-purple-600" /> {user?.name || 'Cargando...'}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Correo Electrónico</span>
                                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                            <Mail className="w-3.5 h-3.5 text-purple-600" /> {user?.email || 'N/D'}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Teléfono / Ext.</span>
                                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5 text-purple-600" /> {user?.phone || 'N/D'}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <hr className="border-muted" />

                        {/* Section 4: Detalles Adicionales y Notas */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                                <FileText className="w-4 h-4" /> Detalles Adicionales y Notas
                            </h3>

                            <div className="space-y-2">
                                <Label htmlFor="horarioProveedor" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Horario de Atención del Proveedor</Label>
                                <Input 
                                    id="horarioProveedor" 
                                    placeholder="Ej. Lunes a Viernes 8:00 AM - 5:00 PM" 
                                    value={horarioProveedor}
                                    onChange={(e) => setHorarioProveedor(e.target.value)}
                                    className="h-10 text-sm focus-visible:ring-purple-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="lugarEntrega" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Lugar de Destino (Donde llevar el producto en la empresa)</Label>
                                <Input 
                                    id="lugarEntrega" 
                                    placeholder="Ej. Bodega Principal Alajuela, Recepción Central..." 
                                    value={lugarEntrega}
                                    onChange={(e) => setLugarEntrega(e.target.value)}
                                    className="h-10 text-sm focus-visible:ring-purple-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="detalleAdicional" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Notas Especiales / Instrucciones para el Chofer</Label>
                                <Textarea 
                                    id="detalleAdicional" 
                                    placeholder="Ej. Preguntar por Don Carlos en portón #2. Llevar tarimas o factura física..." 
                                    value={detalleAdicional}
                                    onChange={(e) => setDetalleAdicional(e.target.value)}
                                    className="min-h-[80px] text-sm focus-visible:ring-purple-500"
                                />
                            </div>
                        </div>

                        <hr className="border-muted" />

                        {/* SECTION: PRODUCT ITEM BUILDER TABLE (Cotizador Style) */}
                        <div className="space-y-4 bg-purple-50/40 dark:bg-purple-950/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
                            <h3 className="text-sm font-bold text-purple-900 dark:text-purple-300 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <Package className="w-4 h-4 text-purple-600" /> Artículos / Productos a Recolectar ({lines.length})
                                </span>
                                <span className="text-xs font-normal text-muted-foreground">Busque en catálogo del ERP o añada líneas manuales</span>
                            </h3>

                            {/* Product Search / Manual Line Entry Form */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white dark:bg-zinc-950 p-3 rounded-lg border shadow-sm">
                                {/* 1. Búsqueda Catálogo ERP */}
                                <div className="md:col-span-4 space-y-1">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Búsqueda ERP / Código</Label>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground z-10" />
                                        <Input 
                                            placeholder="Buscar en catálogo..." 
                                            value={productSearch}
                                            onChange={(e) => setProductSearch(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualLine(); } }}
                                            className="pl-8 h-9 text-xs font-mono"
                                        />
                                        {loadingProducts && (
                                            <div className="absolute right-2 top-2 z-10">
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600" />
                                            </div>
                                        )}
                                        {searchResults.length > 0 && (
                                            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-800 rounded-lg shadow-2xl max-h-60 overflow-y-auto w-full min-w-[280px] p-1 border-t-2 border-t-purple-600">
                                                <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold border-b">
                                                    Seleccione un producto para autocompletar:
                                                </div>
                                                {searchResults.map(p => (
                                                    <div 
                                                        key={p.id}
                                                        onClick={() => handleSelectProductFromCatalog(p)}
                                                        className="p-2 text-xs hover:bg-purple-50 dark:hover:bg-zinc-800 cursor-pointer rounded border-b border-slate-100 dark:border-zinc-800 last:border-0 transition-colors"
                                                    >
                                                        <div className="font-bold font-mono text-purple-700 dark:text-purple-400">{p.id}</div>
                                                        <div className="text-slate-800 dark:text-slate-200 font-medium truncate">{p.description}</div>
                                                        {p.unit && <div className="text-[10px] text-muted-foreground">Unidad: {p.unit}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 2. Descripción / Detalle */}
                                <div className="md:col-span-4 space-y-1">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Descripción / Detalle *</Label>
                                    <Input 
                                        placeholder="Ej: Caja de conectores PVC 2 pulgadas..." 
                                        value={tempDesc}
                                        onChange={(e) => setTempDesc(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualLine(); } }}
                                        className="h-9 text-xs"
                                    />
                                </div>

                                {/* 3. Cantidad (Al lado de Unidad) */}
                                <div className="md:col-span-2 space-y-1">
                                    <Label className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-400">Cantidad *</Label>
                                    <Input 
                                        type="number"
                                        min="1"
                                        step="any"
                                        placeholder="Ej: 5" 
                                        value={tempQty}
                                        onChange={(e) => setTempQty(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualLine(); } }}
                                        className="h-9 text-xs font-bold border-purple-200 focus-visible:ring-purple-500"
                                    />
                                </div>

                                {/* 4. Unidad */}
                                <div className="md:col-span-1 space-y-1">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Unidad</Label>
                                    <Input 
                                        placeholder="UN..." 
                                        value={tempUnit}
                                        onChange={(e) => setTempUnit(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualLine(); } }}
                                        className="h-9 text-xs font-mono text-center"
                                    />
                                </div>

                                {/* 5. Botón + */}
                                <div className="md:col-span-1 flex items-end">
                                    <Button 
                                        type="button" 
                                        onClick={handleAddManualLine}
                                        className="w-full h-9 bg-purple-600 hover:bg-purple-700 text-white p-0 font-bold"
                                        title="Agregar a la lista"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Added Lines Table */}
                            {lines.length === 0 ? (
                                <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-white/60 dark:bg-zinc-900/60">
                                    No ha agregado productos a esta recolecta. Busque un producto del ERP arriba o agregue una línea manual.
                                </div>
                            ) : (
                                <div className="overflow-x-auto bg-white dark:bg-zinc-950 rounded-lg border shadow-sm">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-purple-100/60 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200 uppercase text-[10px]">
                                            <tr>
                                                <th className="p-2.5">Código</th>
                                                <th className="p-2.5">Descripción / Artículo</th>
                                                <th className="p-2.5 text-center">Cantidad</th>
                                                <th className="p-2.5 text-center">Unidad</th>
                                                <th className="p-2.5 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                            {lines.map((line, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900">
                                                    <td className="p-2.5 font-mono font-bold text-purple-700">{line.codigo}</td>
                                                    <td className="p-2.5 text-slate-800 dark:text-slate-200 font-medium">{line.descripcion}</td>
                                                    <td className="p-2.5 text-center font-bold">{line.cantidad}</td>
                                                    <td className="p-2.5 text-center text-muted-foreground">{line.unidad}</td>
                                                    <td className="p-2.5 text-right">
                                                        <Button 
                                                            type="button" 
                                                            variant="ghost" 
                                                            size="sm"
                                                            onClick={() => handleRemoveLine(idx)}
                                                            className="h-6 w-6 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-muted">
                            <Button 
                                type="button" 
                                variant="outline"
                                onClick={() => router.push('/dashboard/operations/logistics')}
                                disabled={isPending}
                            >
                                Cancelar
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={isPending}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2 min-w-[160px]"
                            >
                                {isPending ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" /> Guardando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4" /> Registrar Recolecta
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* SECTION: MY COLLECT REQUESTS TABLE WITH DRIVER ASSIGNMENT & WHATSAPP BUTTON */}
            <Card className="shadow-lg border-purple-100 dark:border-purple-900/30">
                <CardHeader className="bg-purple-50/50 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg font-bold text-purple-950 dark:text-purple-100 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-purple-600" /> Mis Solicitudes de Recolecta
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Monitoree el estado de sus recolectas solicitadas y el chofer asignado a la ruta.
                        </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={loadRequests} 
                            disabled={loadingRequests}
                            className="h-8 gap-1 text-xs border-purple-200 text-purple-700"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingRequests ? 'animate-spin' : ''}`} /> Actualizar
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {loadingRequests ? (
                        <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-purple-600" /> Cargando solicitudes...
                        </div>
                    ) : myRequests.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            No se encontraron solicitudes de recolecta registradas.
                        </div>
                    ) : (
                        <div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-purple-100/50 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200 uppercase text-[10px]">
                                        <tr>
                                            <th className="p-4">Consecutivo</th>
                                            <th className="p-4">Proveedor</th>
                                            <th className="p-4">OC / Factura</th>
                                            <th className="p-4">Chofer Asignado & Ruta</th>
                                            <th className="p-4">Estado</th>
                                            <th className="p-4">Evidencia</th>
                                            <th className="p-4 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                        {myRequests.map((req) => {
                                            let details: any = {};
                                            try {
                                                details = JSON.parse(req.comentario || '{}');
                                            } catch (e) {}

                                            const isColleague = details.companero_email === user?.email;
                                            const isAssigned = !!req.asignacion_id && req.estado !== 'cancelado' && req.estado !== 'descartado' && req.estado !== 'entregado';

                                            // Status styling
                                            let statusColor = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30";
                                            let statusLabel = "Pendiente Asignación";

                                            if (isAssigned) {
                                                statusColor = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30";
                                                statusLabel = "ASIGNADO A RUTA 🚚";
                                            } else if (req.estado === 'transito') {
                                                statusColor = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30";
                                                statusLabel = "En Ruta / Tránsito";
                                            } else if (req.estado === 'entregado') {
                                                statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30";
                                                statusLabel = "Completado / Retirado 👍";
                                            } else if (req.estado === 'descartado') {
                                                statusColor = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30";
                                                statusLabel = "Descartado";
                                            } else if (req.estado === 'cancelado') {
                                                statusColor = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700";
                                                statusLabel = "Cancelado";
                                            }

                                            const cleanDriverPhone = (req.chofer_telefono || '').replace(/\D/g, '');
                                            const driverWhatsapp = cleanDriverPhone.length === 8 ? '506' + cleanDriverPhone : cleanDriverPhone;

                                            return (
                                                <tr key={req.id} className="hover:bg-muted/10 transition-colors">
                                                    <td className="p-4 whitespace-nowrap">
                                                        <div className="font-bold text-purple-700 dark:text-purple-400">
                                                            {req.documento_numero}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                                            <Calendar className="w-3 h-3" /> {req.fecha_registro}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 font-semibold text-foreground">
                                                        <div>{req.cliente_nombre}</div>
                                                        {details.en_nombre_de_companero && (
                                                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                                                {isColleague ? (
                                                                    <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 px-1.5 py-0.5 rounded font-medium border border-indigo-100 dark:border-indigo-900/20">
                                                                        Para usted (Pedida por {details.solicitante_nombre})
                                                                    </span>
                                                                ) : (
                                                                    <span className="bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 px-1.5 py-0.5 rounded font-medium border border-purple-100 dark:border-purple-900/20">
                                                                        En nombre de: {details.companero_nombre}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-4 whitespace-nowrap">
                                                        <div className="font-medium text-foreground">OC: {details.orden_compra || 'N/D'}</div>
                                                        <div className="text-muted-foreground mt-0.5">FAC: {details.factura || 'N/D'}</div>
                                                    </td>

                                                    {/* Driver Assignment & WhatsApp Button Column */}
                                                    <td className="p-4 min-w-[200px]">
                                                        {req.chofer_nombre ? (
                                                            <div className="space-y-1">
                                                                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                                                                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                                                                    {req.chofer_nombre}
                                                                </div>
                                                                <div className="text-[11px] text-muted-foreground">
                                                                    Ruta: <b>{req.ruta_nombre || 'Asignada'}</b>
                                                                </div>
                                                                {req.chofer_telefono && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        type="button"
                                                                        onClick={() => window.open(`https://wa.me/${driverWhatsapp}?text=${encodeURIComponent(`Hola ${req.chofer_nombre}, consulto sobre la recolecta #${req.documento_numero} del proveedor ${req.cliente_nombre}.`)}`)}
                                                                        className="h-6 px-2 text-[10px] gap-1 font-bold border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                                    >
                                                                        <MessageSquare className="w-3 h-3" /> WhatsApp Chofer
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground text-[11px] italic">Sin chofer asignado aún</span>
                                                        )}
                                                    </td>

                                                    <td className="p-4 whitespace-nowrap">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}`}>
                                                            {statusLabel}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 whitespace-nowrap">
                                                        <div className="flex gap-2">
                                                            {req.foto_factura && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const urls = parsePhotoUrls(req.foto_factura);
                                                                        setSelectedPhoto({ 
                                                                            urls,
                                                                            url: urls[0], 
                                                                            title: `Factura Firmada - Consecutivo #${req.documento_numero} ${urls.length > 1 ? `(${urls.length} fotos)` : ''}` 
                                                                        });
                                                                    }}
                                                                    className="h-8 gap-1 text-[10px] font-bold border-purple-200 text-purple-700 hover:bg-purple-50"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5" /> Factura
                                                                </Button>
                                                            )}
                                                            {req.foto_evidencia && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const urls = parsePhotoUrls(req.foto_evidencia);
                                                                        setSelectedPhoto({ 
                                                                            urls,
                                                                            url: urls[0], 
                                                                            title: `Evidencia - Consecutivo #${req.documento_numero} ${urls.length > 1 ? `(${urls.length} fotos)` : ''}` 
                                                                        });
                                                                    }}
                                                                    className="h-8 gap-1 text-[10px] font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                                >
                                                                    <FileImage className="w-3.5 h-3.5" /> Evidencia
                                                                </Button>
                                                            )}
                                                            {!req.foto_factura && !req.foto_evidencia && (
                                                                <span className="text-muted-foreground">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 whitespace-nowrap text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {req.estado !== 'completo' && req.estado !== 'cancelado' && (
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    type="button" 
                                                                    onClick={() => handleReinjectCollect(req.id, req.documento_numero)} 
                                                                    className="h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg" 
                                                                    title="Reingresar a Cola General de Logística"
                                                                >
                                                                    <RefreshCw className="w-4 h-4" />
                                                                </Button>
                                                            )}
                                                            {req.estado === 'pendiente' && (
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    type="button" 
                                                                    onClick={() => handleCancelRequest(req.id)} 
                                                                    className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg" 
                                                                    title="Cancelar Solicitud"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            )}
                                                            {req.estado === 'completo' && (
                                                                <span className="text-xs text-muted-foreground font-medium">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Row */}
                            {totalCount > 0 && (
                                <div className="p-4 bg-muted/20 border-t border-muted flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Mostrar</span>
                                        <Select 
                                            value={String(pageSize)} 
                                            onValueChange={(val) => {
                                                setPageSize(Number(val));
                                                setPage(1);
                                            }}
                                        >
                                            <SelectTrigger className="w-16 h-8 text-xs bg-white dark:bg-zinc-950 border-purple-100">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="5">5</SelectItem>
                                                <SelectItem value="10">10</SelectItem>
                                                <SelectItem value="20">20</SelectItem>
                                                <SelectItem value="50">50</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-xs text-muted-foreground">registros por página</span>
                                    </div>
                                    
                                    <div className="text-xs text-muted-foreground font-medium">
                                        Mostrando {totalCount === 0 ? 0 : (page - 1) * pageSize + 1} a {Math.min(page * pageSize, totalCount)} de {totalCount} registros
                                    </div>

                                    {totalPages > 1 && (
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => setPage(p => Math.max(p - 1, 1))}
                                                disabled={page === 1}
                                                className="h-8 text-xs border-purple-100 hover:bg-purple-50 text-purple-700"
                                            >
                                                Anterior
                                            </Button>
                                            <div className="text-xs px-3 font-bold text-purple-700">
                                                Página {page} de {totalPages}
                                            </div>
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                                                disabled={page === totalPages}
                                                className="h-8 text-xs border-purple-100 hover:bg-purple-50 text-purple-700"
                                            >
                                                Siguiente
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <EvidencePhotoViewer 
                selectedPhoto={selectedPhoto} 
                onClose={() => setSelectedPhoto(null)} 
            />
        </main>
    );
}
