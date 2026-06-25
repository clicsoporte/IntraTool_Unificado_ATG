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
    cancelCollectRequestAction
} from '@/modules/operations/lib/actions';
import { EvidencePhotoViewer } from '@/modules/operations/components/EvidencePhotoViewer';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
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
import { Package, User, Phone, Mail, Building, Clock, FileText, ArrowLeft, RefreshCw, MapPin, Trash2, XCircle, CheckCircle2, AlertCircle, Calendar, Eye, FileImage } from 'lucide-react';
import Link from 'next/link';

interface SystemUser {
    id: number;
    name: string;
    email: string;
    phone: string;
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
    const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);

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

    // Load requests on auth success or parameter changes
    useEffect(() => {
        if (isAuthorized) {
            loadRequests();
        }
    }, [isAuthorized, loadRequests]);

    // System users state
    const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Load Costa Rica geography
    useEffect(() => {
        getCostaRicaGeography()
            .then(data => {
                if (data) setGeographyData(data);
            })
            .catch(err => console.error("Error loading geography data:", err));
    }, []);

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

    // Initialize default delivery location
    useEffect(() => {
        if (companyData?.name && !lugarEntrega) {
            setLugarEntrega(companyData.name);
        }
    }, [companyData, lugarEntrega]);

    // Fetch system users when "en nombre de compañero" is checked
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

    if (authLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse max-w-4xl mx-auto">
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-600" />
                        <p className="text-muted-foreground font-medium">Cargando módulo de recolección...</p>
                    </div>
                </div>
            </main>
        );
    }

    if (!isAuthorized) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="text-center text-red-500 font-bold p-12 bg-rose-50 border border-rose-200 rounded-2xl max-w-4xl mx-auto space-y-2 shadow-sm">
                    <h3 className="text-lg font-black text-rose-700">Acceso Denegado</h3>
                    <p className="text-xs text-rose-600 font-medium">Se requiere el permiso de recolección (deliveries:collect) para acceder a este formulario.</p>
                    <div className="pt-4">
                        <Button asChild variant="outline">
                            <Link href="/dashboard/operations/logistics">
                                Volver a Logística
                            </Link>
                        </Button>
                    </div>
                </div>
            </main>
        );
    }

    const handlePaymentChange = (type: 'pagar_al_retirar' | 'ya_esta_pago' | 'credito') => {
        setMetodoPago(type);
    };

    const selectedCompanero = systemUsers.find(u => String(u.id) === companeroId);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validations
        if (!proveedor.trim()) {
            toast({
                variant: "destructive",
                title: "Campo requerido",
                description: "Por favor ingrese el nombre del proveedor."
            });
            return;
        }

        if (!contactoNombre.trim() || !contactoTelefono.trim()) {
            toast({
                variant: "destructive",
                title: "Campos requeridos",
                description: "Debe ingresar el nombre y teléfono de contacto del proveedor."
            });
            return;
        }

        if (enNombreDeCompanero && !companeroId) {
            toast({
                variant: "destructive",
                title: "Campo requerido",
                description: "Debe seleccionar el compañero en nombre de quien realiza la solicitud."
            });
            return;
        }

        if (!horarioProveedor.trim()) {
            toast({
                variant: "destructive",
                title: "Campo requerido",
                description: "Debe especificar el horario de atención del proveedor."
            });
            return;
        }

        if (!lugarEntrega.trim()) {
            toast({
                variant: "destructive",
                title: "Campo requerido",
                description: "Debe indicar el lugar de entrega."
            });
            return;
        }

        // Prepare data package
        const payload = {
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
            const res = await createCollectRequestAction(proveedor.trim(), payload);
            if (res.success) {
                toast({
                    title: "Solicitud registrada con éxito 🎉",
                    description: `Se ha generado el consecutivo #${res.consecutive}`,
                });
                
                // Clear fields
                setProveedor('');
                setOrdenCompra('');
                setFactura('');
                setMetodoPago('ya_esta_pago');
                setContactoNombre('');
                setContactoTelefono('');
                setEnNombreDeCompanero(false);
                setCompaneroId('');
                setDetalleAdicional('');
                setLugarEntrega(companyData?.name || '');
                setSelectedProvince('');
                setSelectedCanton('');
                setSelectedDistrict('');
                setDireccionDetalle('');
                
                // Refresh list of requests
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

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <Button asChild variant="ghost" className="gap-2">
                    <Link href="/dashboard/operations/logistics">
                        <ArrowLeft className="w-4 h-4" /> Volver a Logística
                    </Link>
                </Button>
                <div className="flex items-center gap-2">
                    <Package className="w-6 h-6 text-purple-600" />
                    <span className="text-sm font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full dark:bg-purple-950/30">
                        Compras a Proveedores
                    </span>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <Card className="border-none shadow-xl bg-card overflow-hidden">
                    <div className="h-2 bg-gradient-to-r from-purple-500 to-indigo-600" />
                    <CardHeader className="pb-4">
                        <CardTitle className="text-2xl font-extrabold text-foreground flex items-center gap-2">
                            Registro de Solicitud de Retiro
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Complete los datos de recolección. Esta solicitud se enviará a la cola general para ser asignada a una ruta de transporte.
                        </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="space-y-6">
                        {/* Section 1: Proveedor y Documentos */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2 md:col-span-3">
                                <Label htmlFor="proveedor" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Nombre del Proveedor *</Label>
                                <Input 
                                    id="proveedor" 
                                    placeholder="Ej. Importaciones Industriales S.A." 
                                    value={proveedor}
                                    onChange={(e) => setProveedor(e.target.value)}
                                    className="h-10 text-sm focus-visible:ring-purple-500"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="ordenCompra" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Orden de Compra</Label>
                                <Input 
                                    id="ordenCompra" 
                                    placeholder="Ej. OC-25412" 
                                    value={ordenCompra}
                                    onChange={(e) => setOrdenCompra(e.target.value)}
                                    className="h-10 text-sm focus-visible:ring-purple-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="factura" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Factura del Proveedor</Label>
                                <Input 
                                    id="factura" 
                                    placeholder="Ej. FAC-9985" 
                                    value={factura}
                                    onChange={(e) => setFactura(e.target.value)}
                                    className="h-10 text-sm focus-visible:ring-purple-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase text-muted-foreground tracking-wider">Método de Pago *</Label>
                                <div className="flex flex-col gap-2 pt-1">
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
                                    <Label htmlFor="districtSelect" className="text-xs font-black uppercase text-muted-foreground tracking-wider">Distrito</Label>
                                    <Select 
                                        value={selectedDistrict} 
                                        onValueChange={setSelectedDistrict}
                                        disabled={!selectedCanton}
                                    >
                                        <SelectTrigger id="districtSelect" className="w-full h-10 bg-white dark:bg-zinc-950 border-purple-100">
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
                                    placeholder="Ej. De la iglesia 100 metros norte y 50 oeste, bodega portón gris." 
                                    value={direccionDetalle}
                                    onChange={(e) => setDireccionDetalle(e.target.value)}
                                    className="min-h-16 text-sm focus-visible:ring-purple-500 border-purple-100"
                                />
                            </div>
                        </div>

                        <hr className="border-muted" />

                        {/* Section 3: Datos del Solicitante y Nombre de Otro Compañero */}
                        <div className="space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                    <User className="w-4 h-4" /> Datos del Solicitante (Compras)
                                </h3>
                                <div className="flex items-center space-x-2">
                                    <Checkbox 
                                        id="en_nombre_de_companero" 
                                        checked={enNombreDeCompanero}
                                        onCheckedChange={(checked) => setEnNombreDeCompanero(!!checked)}
                                        className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                    />
                                    <Label htmlFor="en_nombre_de_companero" className="text-xs font-semibold text-muted-foreground cursor-pointer">
                                        Pedir en nombre de otro compañero
                                    </Label>
                                </div>
                            </div>

                            {/* Solicitor Profile Card (Autocompleted) */}
                            <div className="p-4 rounded-xl bg-muted/40 border border-muted grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-muted-foreground">Nombre</div>
                                        <div className="text-sm font-semibold">{user?.name || '...'}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-muted-foreground">Correo</div>
                                        <div className="text-sm font-semibold">{user?.email || '...'}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <div className="text-[10px] uppercase font-bold text-muted-foreground">Teléfono</div>
                                        <div className="text-sm font-semibold">{user?.phone || '...'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Colleague Selector Dropdown */}
                            {enNombreDeCompanero && (
                                <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-100 space-y-4 animate-in slide-in-from-top duration-300 dark:bg-purple-950/10 dark:border-purple-900/30">
                                    <div className="space-y-2">
                                        <Label htmlFor="companeroSelect" className="text-xs font-black uppercase text-purple-700 tracking-wider dark:text-purple-400">Seleccionar Compañero *</Label>
                                        <Select value={companeroId} onValueChange={setCompaneroId}>
                                            <SelectTrigger id="companeroSelect" className="w-full h-10 bg-white dark:bg-zinc-950 border-purple-200">
                                                <SelectValue placeholder="Seleccione un compañero..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {loadingUsers ? (
                                                    <div className="p-2 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando usuarios...
                                                    </div>
                                                ) : systemUsers.length === 0 ? (
                                                    <div className="p-2 text-center text-xs text-muted-foreground">No se encontraron usuarios activos.</div>
                                                ) : (
                                                    systemUsers.map((u) => (
                                                        <SelectItem key={u.id} value={String(u.id)}>
                                                            {u.name} ({u.email || 'Sin Correo'})
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {selectedCompanero && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-white/70 p-3 rounded-lg dark:bg-zinc-950/70 border">
                                            <div>
                                                <span className="font-bold text-muted-foreground">Correo del Compañero:</span>{' '}
                                                <span className="font-medium">{selectedCompanero.email || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span className="font-bold text-muted-foreground">Teléfono del Compañero:</span>{' '}
                                                <span className="font-medium">{selectedCompanero.phone || 'N/A'}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <hr className="border-muted" />

                        {/* Section 4: Horario y Lugar de Entrega */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="horario" className="text-xs font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" /> Horario del Proveedor *
                                </Label>
                                <Input 
                                    id="horario" 
                                    placeholder="Ej. Lunes a Viernes 8:00 AM - 5:00 PM" 
                                    value={horarioProveedor}
                                    onChange={(e) => setHorarioProveedor(e.target.value)}
                                    className="h-10 text-sm focus-visible:ring-purple-500"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="lugarEntrega" className="text-xs font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                                    <Building className="w-3.5 h-3.5" /> Lugar de Entrega *
                                </Label>
                                <Input 
                                    id="lugarEntrega" 
                                    placeholder="Ej. Planta Principal Clic Soporte" 
                                    value={lugarEntrega}
                                    onChange={(e) => setLugarEntrega(e.target.value)}
                                    className="h-10 text-sm focus-visible:ring-purple-500"
                                    required
                                />
                            </div>
                        </div>

                        {/* Section 5: Detalle adicional */}
                        <div className="space-y-2">
                            <Label htmlFor="detalle" className="text-xs font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5" /> Detalles Adicionales y Notas
                            </Label>
                            <Textarea 
                                id="detalle" 
                                placeholder="Escriba aquí cualquier especificación adicional para el transportista (peso, volumen, requerimientos especiales del producto)..." 
                                value={detalleAdicional}
                                onChange={(e) => setDetalleAdicional(e.target.value)}
                                className="min-h-24 text-sm focus-visible:ring-purple-500"
                            />
                        </div>
                    </CardContent>
                    
                    <CardFooter className="bg-muted/30 border-t border-muted p-4 flex justify-between items-center">
                        <span className="text-xs text-muted-foreground font-medium">* Campos obligatorios</span>
                        <Button 
                            type="submit" 
                            disabled={isPending}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 h-10 gap-2 shrink-0 shadow-lg shadow-purple-100 dark:shadow-none"
                        >
                            {isPending ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" /> Guardando...
                                </>
                            ) : (
                                'Registrar Solicitud'
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </form>

            {/* My Collect Requests Queue Panel */}
            <Card className="border-none shadow-xl bg-card overflow-hidden mt-6">
                <CardHeader className="pb-4 border-b border-muted flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl font-extrabold text-foreground flex items-center gap-2">
                            Mis Solicitudes de Recolecta
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Historial de solicitudes de retiro a proveedores creadas por usted o en su nombre.
                        </CardDescription>
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={loadRequests} 
                        disabled={loadingRequests}
                        type="button"
                        className="h-8 gap-1.5 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingRequests ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    {/* Date Filters Row */}
                    <div className="p-4 bg-muted/20 border-b border-muted grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" /> Fecha Inicio
                            </Label>
                            <Input 
                                type="date" 
                                value={startDate} 
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setPage(1);
                                }}
                                className="h-9 text-xs focus-visible:ring-purple-500 bg-white dark:bg-zinc-950 border-purple-100"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" /> Fecha Fin
                            </Label>
                            <Input 
                                type="date" 
                                value={endDate} 
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setPage(1);
                                }}
                                className="h-9 text-xs focus-visible:ring-purple-500 bg-white dark:bg-zinc-950 border-purple-100"
                            />
                        </div>
                        <div className="flex gap-2">
                            {(startDate || endDate) && (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => {
                                        setStartDate('');
                                        setEndDate('');
                                        setPage(1);
                                    }}
                                    className="h-9 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                >
                                    Limpiar Filtros
                                </Button>
                            )}
                        </div>
                    </div>

                    {loadingRequests ? (
                        <div className="flex items-center justify-center p-12">
                            <div className="text-center space-y-2">
                                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-600" />
                                <p className="text-sm text-muted-foreground font-medium">Cargando sus solicitudes...</p>
                            </div>
                        </div>
                    ) : myRequests.length === 0 ? (
                        <div className="text-center p-12 space-y-3">
                            <Package className="w-12 h-12 mx-auto text-muted-foreground/50 stroke-[1.5]" />
                            <h3 className="text-sm font-bold text-foreground">
                                {startDate || endDate ? "No se encontraron resultados" : "No hay solicitudes registradas"}
                            </h3>
                            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                {startDate || endDate 
                                    ? "Intente ajustando el rango de fechas para encontrar su solicitud de recolecta." 
                                    : "Las solicitudes de recolección que cree aparecerán en esta lista para que pueda darles seguimiento o cancelarlas si lo requiere."}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="bg-muted/40 border-b border-muted uppercase tracking-wider text-[10px] font-bold text-muted-foreground">
                                            <th className="p-4">Consecutivo / Fecha</th>
                                            <th className="p-4">Proveedor</th>
                                            <th className="p-4">Orden / Factura</th>
                                            <th className="p-4">Detalles</th>
                                            <th className="p-4">Estado</th>
                                            <th className="p-4">Evidencias</th>
                                            <th className="p-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-muted">
                                        {myRequests.map((req) => {
                                            let details: any = {};
                                            try {
                                                details = JSON.parse(req.comentario || '{}');
                                            } catch (e) {}

                                            const isColleague = details.companero_email === user?.email;

                                            // Status styling
                                            let statusColor = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30";
                                            let statusLabel = "Pendiente";
                                            if (req.estado === 'transito') {
                                                statusColor = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30";
                                                statusLabel = "En Tránsito";
                                            } else if (req.estado === 'entregado') {
                                                statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30";
                                                statusLabel = "Completado";
                                            } else if (req.estado === 'descartado') {
                                                statusColor = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30";
                                                statusLabel = "Descartado";
                                            } else if (req.estado === 'cancelado') {
                                                statusColor = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700";
                                                statusLabel = "Cancelado";
                                            }

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
                                                    <td className="p-4 max-w-xs truncate">
                                                        <div className="font-medium text-foreground">Contacto: {details.proveedor_contacto_nombre || 'N/D'} ({details.proveedor_contacto_telefono})</div>
                                                        <div className="text-muted-foreground mt-0.5 truncate">Destino: {details.lugar_entrega || 'N/D'}</div>
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
                                                                    onClick={() => setSelectedPhoto({ 
                                                                        url: `/api/fleet/files/${req.foto_factura}`, 
                                                                        title: `Factura Firmada - Consecutivo #${req.documento_numero}` 
                                                                    })}
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
                                                                    onClick={() => setSelectedPhoto({ 
                                                                        url: `/api/fleet/files/${req.foto_evidencia}`, 
                                                                        title: `Evidencia - Consecutivo #${req.documento_numero}` 
                                                                    })}
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
                                                        {req.estado === 'pendiente' ? (
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
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground font-medium">-</span>
                                                        )}
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
