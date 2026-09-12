'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    FileSignature,
    PlusCircle,
    Search,
    Printer,
    CheckCircle2,
    ArrowLeft,
    RefreshCw,
    Trash2,
    FileText,
    Gift,
    PackageCheck,
    RotateCcw,
    Layers,
    Edit3,
    Save,
    MapPin,
    Sparkles,
    Building2
} from 'lucide-react';
import Link from 'next/link';
import {
    createBoletaOperativaAction,
    updateBoletaOperativaAction,
    getBoletasOperativasAction,
    approveBoletaOperativaAction,
    getBoletaPrintHtmlAction,
    searchErpInvoicesAction,
    getErpInvoiceDetailAction,
    searchCustomersAction,
    getCustomerShipmentAddressesAction,
    searchProductsAction
} from '@/modules/operations/lib/actions';

export default function VouchersPage() {
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { hasPermission, isLoading: authLoading } = useAuthorization([
        'operations:access', 
        'operations:vouchers:read', 
        'operations:vouchers:create', 
        'operations:vouchers:approve',
        'deliveries:admin'
    ]);

    const canCreate = hasPermission('operations:vouchers:create') || hasPermission('operations:access') || hasPermission('deliveries:admin');
    const canApprove = hasPermission('operations:vouchers:approve') || hasPermission('operations:approve') || hasPermission('deliveries:admin');

    const [loading, setLoading] = useState(true);
    const [boletas, setBoletas] = useState<any[]>([]);
    const [filterMotivo, setFilterMotivo] = useState<string>('all');
    const [filterEstado, setFilterEstado] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Dynamic system debounce time from admin config
    const [searchDebounceMs, setSearchDebounceMs] = useState<number>(300);

    useEffect(() => {
        import('@/modules/core/lib/actions').then(({ getCompanySettingsAction }) => {
            getCompanySettingsAction().then(settings => {
                if (settings?.searchDebounceTime) {
                    setSearchDebounceMs(Number(settings.searchDebounceTime) || 300);
                }
            });
        });
    }, []);

    // Modal state for Nueva Boleta Operativa
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState({
        clienteId: '',
        clienteNombre: '',
        motivoSalida: 'faltante' as 'faltante' | 'devolucion' | 'muestra' | 'regalia' | 'otro',
        referenciaDoc: '',
        comentario: '',
        direccionEmbarqueId: '',
        medioEnvio: 'camion' as 'camion' | 'encomienda' | 'vendedor_mostrador'
    });

    // Reference Document search state
    const [refDocSearch, setRefDocSearch] = useState('');
    const [debouncedRefDocSearch] = useDebounce(refDocSearch, searchDebounceMs);
    const [refDocResults, setRefDocResults] = useState<any[]>([]);
    const [showRefDocDropdown, setShowRefDocDropdown] = useState(false);
    const [loadingRefDoc, setLoadingRefDoc] = useState(false);
    const [preloadPromptInvoice, setPreloadPromptInvoice] = useState<any | null>(null);

    // Customer search state
    const [customerSearch, setCustomerSearch] = useState('');
    const [debouncedCustomerSearch] = useDebounce(customerSearch, searchDebounceMs);
    const [customerResults, setCustomerResults] = useState<any[]>([]);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [loadingCustomer, setLoadingCustomer] = useState(false);

    // Shipment addresses for selected customer
    const [shipmentAddresses, setShipmentAddresses] = useState<any[]>([]);
    const [loadingAddresses, setLoadingAddresses] = useState(false);

    // Product search per line item state
    const [items, setItems] = useState<Array<{ codigo: string; descripcion: string; cantidad: number }>>([
        { codigo: '', descripcion: '', cantidad: 1 }
    ]);
    const [activeProductIndex, setActiveProductIndex] = useState<number | null>(null);
    const [productSearchInputs, setProductSearchInputs] = useState<Record<number, string>>({});
    const [debouncedProductInput] = useDebounce(
        activeProductIndex !== null ? (productSearchInputs[activeProductIndex] || '') : '',
        searchDebounceMs
    );
    const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
    const [showProductDropdown, setShowProductDropdown] = useState(false);

    // Preview / Printing
    const [printHtml, setPrintHtml] = useState<string | null>(null);
    const [isPrintOpen, setIsPrintOpen] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getBoletasOperativasAction({
                motivo: filterMotivo,
                estado: filterEstado,
                search: searchQuery
            });
            setBoletas(data);
        } catch (e) {
            toast({ title: 'Error de carga', description: 'No se pudieron cargar las boletas.', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [filterMotivo, filterEstado, searchQuery, toast]);

    useEffect(() => {
        setTitle('Boletas Operativas (Salidas de Bodega)');
        loadData();
    }, [setTitle, loadData]);

    // Load customer shipment addresses when customerId changes
    const loadCustomerAddresses = useCallback(async (cliId: string) => {
        if (!cliId) {
            setShipmentAddresses([]);
            return;
        }
        setLoadingAddresses(true);
        try {
            const addrs = await getCustomerShipmentAddressesAction(cliId);
            setShipmentAddresses(addrs);
        } catch (e) {
            setShipmentAddresses([]);
        } finally {
            setLoadingAddresses(false);
        }
    }, []);

    // Debounced search for reference document
    useEffect(() => {
        if (!debouncedRefDocSearch || debouncedRefDocSearch.trim().length < 2) {
            setRefDocResults([]);
            setShowRefDocDropdown(false);
            return;
        }
        let isMounted = true;
        setLoadingRefDoc(true);
        searchErpInvoicesAction(debouncedRefDocSearch).then(results => {
            if (isMounted) {
                setRefDocResults(results);
                setShowRefDocDropdown(true);
                setLoadingRefDoc(false);
            }
        });
        return () => { isMounted = false; };
    }, [debouncedRefDocSearch]);

    // Debounced search for customers
    useEffect(() => {
        if (!debouncedCustomerSearch || debouncedCustomerSearch.trim().length < 2) {
            setCustomerResults([]);
            setShowCustomerDropdown(false);
            return;
        }
        let isMounted = true;
        setLoadingCustomer(true);
        searchCustomersAction(debouncedCustomerSearch).then(results => {
            if (isMounted) {
                setCustomerResults(results);
                setShowCustomerDropdown(true);
                setLoadingCustomer(false);
            }
        });
        return () => { isMounted = false; };
    }, [debouncedCustomerSearch]);

    // Debounced search for products
    useEffect(() => {
        if (!debouncedProductInput || debouncedProductInput.trim().length < 2) {
            setProductSearchResults([]);
            setShowProductDropdown(false);
            return;
        }
        let isMounted = true;
        searchProductsAction(debouncedProductInput).then(results => {
            if (isMounted) {
                setProductSearchResults(results);
                setShowProductDropdown(true);
            }
        });
        return () => { isMounted = false; };
    }, [debouncedProductInput]);

    const handleSelectCustomer = (cust: any) => {
        setFormData(prev => ({
            ...prev,
            clienteId: cust.id,
            clienteNombre: cust.nombre,
            direccionEmbarqueId: ''
        }));
        setCustomerSearch(`${cust.id} - ${cust.nombre}`);
        setShowCustomerDropdown(false);
        loadCustomerAddresses(cust.id);
    };

    const handleSelectRefDoc = (inv: any) => {
        setFormData(prev => ({
            ...prev,
            referenciaDoc: inv.factura,
            clienteId: inv.clienteId || prev.clienteId,
            clienteNombre: inv.clienteNombre || prev.clienteNombre
        }));
        setRefDocSearch(inv.factura);
        setShowRefDocDropdown(false);
        setPreloadPromptInvoice(inv);
    };

    const handlePreloadInvoiceData = async (facturaNum: string) => {
        setLoading(true);
        try {
            const detail = await getErpInvoiceDetailAction(facturaNum);
            if (detail.success && detail.header) {
                setFormData(prev => ({
                    ...prev,
                    clienteId: detail.header.clienteId || prev.clienteId,
                    clienteNombre: detail.header.clienteNombre || prev.clienteNombre,
                    direccionEmbarqueId: detail.header.direccionEmbarque || '',
                    referenciaDoc: detail.header.factura
                }));
                if (detail.header.clienteId) {
                    setCustomerSearch(`${detail.header.clienteId} - ${detail.header.clienteNombre}`);
                    if (detail.shipmentAddresses && detail.shipmentAddresses.length > 0) {
                        setShipmentAddresses(detail.shipmentAddresses);
                    } else {
                        loadCustomerAddresses(detail.header.clienteId);
                    }
                }
                if (detail.lines && detail.lines.length > 0) {
                    setItems(detail.lines);
                }
                toast({
                    title: 'Datos Precargados',
                    description: `Se cargaron ${detail.lines?.length || 0} productos y los datos de ${detail.header.clienteNombre} desde la Factura #${facturaNum}.`
                });
            } else {
                toast({ title: 'Error', description: detail.error || 'No se pudieron precargar los datos.', variant: 'destructive' });
            }
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setLoading(false);
            setPreloadPromptInvoice(null);
        }
    };

    const handleAddItem = () => {
        setItems(prev => [...prev, { codigo: '', descripcion: '', cantidad: 1 }]);
    };

    const handleRemoveItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        setItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleSelectProduct = (prod: any) => {
        if (activeProductIndex !== null) {
            setItems(prev => {
                const next = [...prev];
                next[activeProductIndex] = {
                    ...next[activeProductIndex],
                    codigo: prod.codigo,
                    descripcion: prod.descripcion
                };
                return next;
            });
            setShowProductDropdown(false);
            setActiveProductIndex(null);
        }
    };

    const handleCreateBoletaWithParams = async (e: React.FormEvent, sendToApprovalImmediate = true) => {
        e.preventDefault();
        if (!formData.clienteNombre.trim()) {
            toast({ title: 'Campo Requerido', description: 'Ingrese el cliente o destinatario.', variant: 'destructive' });
            return;
        }

        const validItems = items.filter(i => i.codigo.trim() && i.cantidad > 0);
        if (validItems.length === 0) {
            toast({ title: 'Sin Productos', description: 'Agregue al menos un producto a la boleta.', variant: 'destructive' });
            return;
        }

        setCreating(true);
        try {
            const res = await createBoletaOperativaAction({
                ...formData,
                sendToApprovalImmediate,
                items: validItems
            });

            if (res.success) {
                toast({
                    title: sendToApprovalImmediate ? 'Boleta Enviada a Aprobación' : 'Borrador Guardado',
                    description: `Se ha generado la Boleta #${res.boletaNumero} exitosamente.`,
                });
                setIsCreateOpen(false);
                setFormData({ clienteId: '', clienteNombre: '', motivoSalida: 'faltante', referenciaDoc: '', comentario: '', direccionEmbarqueId: '', medioEnvio: 'camion' });
                setRefDocSearch('');
                setCustomerSearch('');
                setShipmentAddresses([]);
                setItems([{ codigo: '', descripcion: '', cantidad: 1 }]);
                loadData();
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({ title: 'Error al crear', description: e.message, variant: 'destructive' });
        } finally {
            setCreating(false);
        }
    };

    // Modal state for Editar Boleta
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingBoleta, setEditingBoleta] = useState<any | null>(null);
    const [editFormData, setEditFormData] = useState({
        clienteId: '',
        clienteNombre: '',
        referenciaDoc: '',
        comentario: '',
        direccionEmbarqueId: ''
    });
    const [editShipmentAddresses, setEditShipmentAddresses] = useState<any[]>([]);
    const [editItems, setEditItems] = useState<Array<{ codigo: string; descripcion: string; cantidad: number }>>([]);
    const [savingEdit, setSavingEdit] = useState(false);

    const handleOpenEdit = async (boleta: any) => {
        setEditingBoleta(boleta);
        const cliId = boleta.cliente_id || '';
        setEditFormData({
            clienteId: cliId,
            clienteNombre: boleta.cliente_nombre || '',
            referenciaDoc: boleta.referencia_doc || (boleta.documento_numero && boleta.documento_numero.includes('-PARTIAL') ? boleta.documento_numero.replace('-PARTIAL', '').replace('-RETRY', '') : ''),
            comentario: boleta.comentario || '',
            direccionEmbarqueId: boleta.direccion_embarque_id || ''
        });

        if (cliId) {
            try {
                const addrs = await getCustomerShipmentAddressesAction(cliId);
                setEditShipmentAddresses(addrs);
            } catch (e) {
                setEditShipmentAddresses([]);
            }
        } else {
            setEditShipmentAddresses([]);
        }

        const currentItems = boleta.items && boleta.items.length > 0
            ? boleta.items.map((it: any) => ({ codigo: it.codigo, descripcion: it.descripcion, cantidad: it.cantidad }))
            : [{ codigo: '', descripcion: '', cantidad: 1 }];
        setEditItems(currentItems);
        setIsEditOpen(true);
    };

    const handleAddEditItem = () => {
        setEditItems(prev => [...prev, { codigo: '', descripcion: '', cantidad: 1 }]);
    };

    const handleRemoveEditItem = (index: number) => {
        setEditItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleEditItemChange = (index: number, field: string, value: any) => {
        setEditItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingBoleta) return;

        const validItems = editItems.filter(i => i.codigo.trim() && i.cantidad > 0);
        if (validItems.length === 0) {
            toast({ title: 'Sin Productos', description: 'La boleta debe tener al menos un producto.', variant: 'destructive' });
            return;
        }

        setSavingEdit(true);
        try {
            const res = await updateBoletaOperativaAction(editingBoleta.id, {
                clienteNombre: editFormData.clienteNombre,
                clienteId: editFormData.clienteId,
                direccionEmbarqueId: editFormData.direccionEmbarqueId,
                referenciaDoc: editFormData.referenciaDoc,
                comentario: editFormData.comentario,
                items: validItems
            });

            if (res.success) {
                toast({ title: 'Boleta Actualizada', description: 'Los cambios han sido guardados exitosamente.' });
                setIsEditOpen(false);
                loadData();
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({ title: 'Error al actualizar', description: e.message, variant: 'destructive' });
        } finally {
            setSavingEdit(false);
        }
    };

    const handleApprove = async (id: number) => {
        try {
            const { approveBoletaOperativaAction } = await import('@/modules/operations/lib/actions');
            const res = await approveBoletaOperativaAction(id);
            if (res.success) {
                toast({ 
                    title: 'Boleta Autorizada por Jefatura', 
                    description: 'La boleta ahora tiene validez oficial para alistamiento y salida de bodega.' 
                });
                loadData();
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({ title: 'Error al autorizar', description: e.message, variant: 'destructive' });
        }
    };

    const handleSendToApproval = async (id: number) => {
        try {
            const { sendBoletaToApprovalAction } = await import('@/modules/operations/lib/actions');
            const res = await sendBoletaToApprovalAction(id);
            if (res.success) {
                toast({ title: 'Enviado a Aprobación', description: 'La boleta ha pasado a revisión de Jefatura / Supervisión.' });
                loadData();
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({ title: 'Error al enviar', description: e.message, variant: 'destructive' });
        }
    };

    const handleDispatch = async (id: number, customMedio?: 'camion' | 'encomienda' | 'vendedor_mostrador') => {
        try {
            const { dispatchBoletaAction } = await import('@/modules/operations/lib/actions');
            const res = await dispatchBoletaAction(id, customMedio);
            if (res.success) {
                toast({ 
                    title: 'Despacho Procesado', 
                    description: customMedio === 'camion' || (!customMedio && selectedApproveBoleta?.medio_envio === 'camion')
                        ? 'Se ha enviado a la Cola General de Despacho (Camiones).'
                        : 'Se ha procesado como Salida Directa (Encomienda / Vendedor).'
                });
                setSelectedApproveBoleta(null);
                loadData();
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({ title: 'Error al procesar despacho', description: e.message, variant: 'destructive' });
        }
    };

    const handlePrintPreview = async (id: number) => {
        try {
            const res = await getBoletaPrintHtmlAction(id);
            if (res.success && res.html) {
                setPrintHtml(res.html);
                setIsPrintOpen(true);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({ title: 'Error de impresión', description: e.message, variant: 'destructive' });
        }
    };

    const handleExecutePrint = () => {
        if (!printHtml) return;
        const w = window.open('', '_blank');
        if (w) {
            w.document.write(printHtml);
            w.document.close();
            w.onload = () => {
                w.print();
                w.close();
            };
        }
    };

    const motivoBadges: Record<string, { label: string; icon: any; color: string }> = {
        faltante: { label: 'Faltante ERP', icon: PackageCheck, color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300' },
        devolucion: { label: 'Devolución', icon: RotateCcw, color: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300' },
        muestra: { label: 'Muestra Promo', icon: FileText, color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300' },
        regalia: { label: 'Regalía', icon: Gift, color: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300' },
        otro: { label: 'Salida Bodega', icon: Layers, color: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900 dark:text-slate-300' }
    };

    if (authLoading) {
        return (
            <main className="flex-1 p-6 flex justify-center items-center">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/operations">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-500/10">
                        <FileSignature className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">Boletas Operativas (Salidas de Bodega)</h1>
                        <p className="text-xs text-muted-foreground font-medium">
                            Gestión de alistamiento y salida física de productos sin factura (Muestras, Faltantes, Regalías).
                        </p>
                    </div>
                </div>

                {canCreate && (
                    <Button onClick={() => setIsCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md">
                        <PlusCircle className="mr-2 h-4 w-4" /> Nueva Boleta de Salida
                    </Button>
                )}
            </div>

            {/* Filtros */}
            <Card className="border-muted shadow-sm">
                <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por N° Boleta, cliente o doc..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && loadData()}
                            className="pl-9 rounded-xl text-xs font-medium"
                        />
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Select value={filterMotivo} onValueChange={(val) => { setFilterMotivo(val); loadData(); }}>
                            <SelectTrigger className="w-[160px] text-xs font-bold rounded-xl">
                                <SelectValue placeholder="Motivo de Salida" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                <SelectItem value="all">Todos los motivos</SelectItem>
                                <SelectItem value="faltante">📦 Faltante ERP</SelectItem>
                                <SelectItem value="devolucion">🔄 Devolución</SelectItem>
                                <SelectItem value="muestra">📄 Muestra Promo</SelectItem>
                                <SelectItem value="regalia">🎁 Regalía</SelectItem>
                                <SelectItem value="otro">⚙️ Otro</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filterEstado} onValueChange={(val) => { setFilterEstado(val); loadData(); }}>
                            <SelectTrigger className="w-[160px] text-xs font-bold rounded-xl">
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                <SelectItem value="all">Todos los estados</SelectItem>
                                <SelectItem value="pendiente_autorizacion">⏳ Pendiente Autorización</SelectItem>
                                <SelectItem value="pendiente">✅ Lista en Despacho</SelectItem>
                                <SelectItem value="en_ruta">🚚 En Ruta</SelectItem>
                                <SelectItem value="completo">🏁 Entregada</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button variant="outline" size="icon" onClick={loadData} className="rounded-xl">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Tabla de Boletas */}
            <Card className="border-muted shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead className="font-bold text-xs">Boleta / Ref</TableHead>
                                <TableHead className="font-bold text-xs">Motivo</TableHead>
                                <TableHead className="font-bold text-xs">Cliente / Destinatario</TableHead>
                                <TableHead className="font-bold text-xs">Solicitado Por</TableHead>
                                <TableHead className="font-bold text-xs text-center">Ítems</TableHead>
                                <TableHead className="font-bold text-xs text-center">Estado</TableHead>
                                <TableHead className="font-bold text-xs text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        Cargando boletas operativas...
                                    </TableCell>
                                </TableRow>
                            ) : boletas.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-medium">
                                        No se encontraron boletas registradas.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                boletas.map((b) => {
                                    const motivoInfo = motivoBadges[b.motivo_salida || 'otro'] || motivoBadges.otro;
                                    const MotivoIcon = motivoInfo.icon;
                                    return (
                                        <TableRow key={b.id} className="hover:bg-muted/20 transition-colors">
                                            <TableCell>
                                                <div className="font-mono font-black text-sm text-blue-600 dark:text-blue-400">
                                                    #{b.boleta_numero || b.documento_numero}
                                                </div>
                                                {b.referencia_doc ? (
                                                    <span className="text-[10px] text-sky-700 dark:text-sky-300 block font-mono font-bold">
                                                        Doc Orig: #{b.referencia_doc}
                                                    </span>
                                                ) : (b.documento_numero && b.documento_numero.includes('-PARTIAL')) ? (
                                                    <span className="text-[10px] text-sky-700 dark:text-sky-300 block font-mono font-bold">
                                                        Doc Orig: #{b.documento_numero.replace('-PARTIAL', '')}
                                                    </span>
                                                ) : null}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`text-[10px] font-bold flex items-center gap-1 w-fit ${motivoInfo.color}`}>
                                                    <MotivoIcon className="w-3 h-3" />
                                                    {motivoInfo.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-bold text-xs text-foreground">{b.cliente_nombre}</div>
                                                <div className="text-[10px] text-muted-foreground font-mono">ID: {b.cliente_id}</div>
                                                {b.direccion_embarque_id && (
                                                    <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-0.5 mt-0.5">
                                                        <MapPin className="w-3 h-3 text-blue-500" /> Dir. Embarque: #{b.direccion_embarque_id}
                                                    </div>
                                                )}
                                                {b.comentario && (
                                                    <div className="text-[10px] text-amber-900 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 mt-1 max-w-[220px] truncate" title={b.comentario}>
                                                        💬 {b.comentario}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs font-medium text-muted-foreground">
                                                <div><span className="text-[10px] uppercase font-bold text-muted-foreground/80">Sol:</span> <strong className="text-foreground">{b.creado_por}</strong></div>
                                                {b.autorizado_por ? (
                                                    <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                                                        <CheckCircle2 className="w-2.5 h-2.5" /> {b.autorizado_por}
                                                    </div>
                                                ) : (
                                                    <div className="text-[9.5px] text-amber-600 font-medium">Sin autorizar</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center font-bold text-xs">
                                                {b.total_items || (b.items?.length || 0)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {(!b.estado || b.estado === 'borrador') ? (
                                                    <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-extrabold">
                                                        ✏️ Borrador
                                                    </Badge>
                                                ) : b.estado === 'pendiente_autorizacion' ? (
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] font-extrabold">
                                                        ⏳ Por Autorizar
                                                    </Badge>
                                                ) : b.estado === 'aprobado' ? (
                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-[10px] font-extrabold">
                                                        ✅ Aprobado (Bodega)
                                                    </Badge>
                                                ) : b.estado === 'pendiente' ? (
                                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] font-extrabold">
                                                        🚛 Cola Despacho
                                                    </Badge>
                                                ) : b.estado === 'aprobado_fuera_de_ruta' ? (
                                                    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300 text-[10px] font-extrabold">
                                                        📦 Salida Directa
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] font-extrabold capitalize">
                                                        {b.estado}
                                                    </Badge>
                                                )}
                                                {b.medio_envio && (
                                                    <div className="text-[9px] text-muted-foreground mt-0.5 font-bold uppercase tracking-wider">
                                                        {b.medio_envio === 'camion' ? '🚚 Chofer / Camión' : b.medio_envio === 'encomienda' ? '📦 Encomienda' : '👤 Vendedor/Bodega'}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                {(!b.estado || b.estado === 'borrador') && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleOpenEdit(b)}
                                                            className="h-8 text-xs font-bold text-slate-700 hover:bg-slate-100"
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5 mr-1" /> Editar
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleSendToApproval(b.id)}
                                                            className="h-8 text-xs font-bold text-amber-700 border-amber-300 hover:bg-amber-50"
                                                        >
                                                            🚀 Enviar a Aprobación
                                                        </Button>
                                                    </>
                                                )}
                                                {b.estado === 'pendiente_autorizacion' && canApprove && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleApprove(b.id)}
                                                        className="h-8 text-xs font-bold text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Autorizar
                                                    </Button>
                                                )}
                                                {(b.estado === 'aprobado' || b.estado === 'pendiente' || b.estado === 'aprobado_fuera_de_ruta') && (
                                                    <>
                                                        {b.estado === 'aprobado' && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleDispatch(b.id)}
                                                                className="h-8 text-xs font-bold text-blue-600 border-blue-300 hover:bg-blue-50"
                                                            >
                                                                {b.medio_envio === 'camion' ? '🚚 Enviar a Ruta' : '📦 Confirmar Salida Directa'}
                                                            </Button>
                                                        )}
                                                        {b.estado === 'pendiente' && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleDispatch(b.id, 'encomienda')}
                                                                className="h-8 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                                                                title="Sacar de cola de camiones y pasar a Salida Directa"
                                                            >
                                                                📦 Mover a Salida Directa
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handlePrintPreview(b.id)}
                                                    className="h-8 text-xs font-bold text-blue-600 hover:bg-blue-50"
                                                >
                                                    <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Modal para Crear Nueva Boleta Operativa */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <FileSignature className="w-5 h-5 text-blue-600" /> Nueva Boleta de Salida de Bodega
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Registre una autorización de alistamiento y salida de mercancía sin factura.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleCreateBoleta} className="space-y-4 pt-2">
                        {/* Motivo y Documento Referencia */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Motivo de Salida</Label>
                                <Select
                                    value={formData.motivoSalida}
                                    onValueChange={(val: any) => setFormData(prev => ({ ...prev, motivoSalida: val }))}
                                >
                                    <SelectTrigger className="rounded-xl text-xs font-bold h-9">
                                        <SelectValue placeholder="Seleccione motivo" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="faltante">📦 Entrega Incompleta / Faltante ERP</SelectItem>
                                        <SelectItem value="devolucion">🔄 Devolución / Reposición</SelectItem>
                                        <SelectItem value="muestra">📄 Muestra Promocional</SelectItem>
                                        <SelectItem value="regalia">🎁 Regalía / Patrocinio</SelectItem>
                                        <SelectItem value="otro">⚙️ Otro Movimiento Interno</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Doc Referencia Autocomplete */}
                            <div className="space-y-1.5 relative">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                    <span>Doc Referencia ERP (Opcional)</span>
                                    {loadingRefDoc && <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />}
                                </Label>
                                <Input
                                    placeholder="Buscar N° Factura (Ej. 00100...)"
                                    value={refDocSearch}
                                    onChange={(e) => {
                                        setRefDocSearch(e.target.value);
                                        setFormData(prev => ({ ...prev, referenciaDoc: e.target.value }));
                                    }}
                                    className="rounded-xl text-xs font-medium h-9 font-mono"
                                />

                                {showRefDocDropdown && refDocResults.length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border border-muted rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                        {refDocResults.map((inv) => (
                                            <div
                                                key={inv.factura}
                                                onClick={() => handleSelectRefDoc(inv)}
                                                className="p-2 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer text-xs border-b border-muted/50 last:border-0 flex items-center justify-between"
                                            >
                                                <div>
                                                    <span className="font-mono font-bold text-blue-600">{inv.factura}</span>
                                                    <span className="text-[11px] text-muted-foreground ml-2">{inv.clienteNombre}</span>
                                                </div>
                                                <Badge variant="outline" className="text-[9px] font-mono">{inv.fecha?.substring(0, 10)}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Banner de Confirmación para Precargar Datos de la Factura */}
                        {preloadPromptInvoice && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs text-blue-900 dark:text-blue-200">
                                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                                    <div>
                                        <strong>Factura N° {preloadPromptInvoice.factura} encontrada.</strong>
                                        <div className="text-[11px] text-muted-foreground">¿Desea precargar automáticamente el Cliente, Dirección y Líneas de Productos?</div>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handlePreloadInvoiceData(preloadPromptInvoice.factura)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 rounded-lg shrink-0"
                                >
                                    Precargar Datos
                                </Button>
                            </div>
                        )}

                        {/* Búsqueda de Cliente y Selección de Dirección */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5 relative">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ID Cliente / Cédula</Label>
                                <Input
                                    placeholder="CLI-00123"
                                    value={formData.clienteId}
                                    onChange={(e) => setFormData(prev => ({ ...prev, clienteId: e.target.value }))}
                                    className="rounded-xl text-xs font-medium h-9 font-mono"
                                />
                            </div>

                            <div className="md:col-span-2 space-y-1.5 relative">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                    <span>Cliente / Destinatario *</span>
                                    {loadingCustomer && <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />}
                                </Label>
                                <Input
                                    placeholder="Nombre del cliente o busque aquí..."
                                    value={customerSearch || formData.clienteNombre}
                                    onChange={(e) => {
                                        setCustomerSearch(e.target.value);
                                        setFormData(prev => ({ ...prev, clienteNombre: e.target.value }));
                                    }}
                                    className="rounded-xl text-xs font-bold h-9"
                                    required
                                />

                                {showCustomerDropdown && customerResults.length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border border-muted rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                        {customerResults.map((cust) => (
                                            <div
                                                key={cust.id}
                                                onClick={() => handleSelectCustomer(cust)}
                                                className="p-2 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer text-xs border-b border-muted/50 last:border-0"
                                            >
                                                <div className="font-bold">{cust.nombre}</div>
                                                <div className="text-[10px] text-muted-foreground font-mono">ID: {cust.id} {cust.cedula ? `| Céd: ${cust.cedula}` : ''}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Selector de Dirección de Embarque (Múltiples Direcciones por Cliente) */}
                        {(shipmentAddresses.length > 0 || formData.direccionEmbarqueId) && (
                            <div className="space-y-1.5 p-3 bg-muted/20 border border-muted/80 rounded-xl">
                                <Label className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                                    <Building2 className="w-4 h-4 text-blue-500" /> Dirección de Embarque / Destino en Ruta
                                    {loadingAddresses && <RefreshCw className="w-3 h-3 animate-spin ml-1" />}
                                </Label>
                                <Select
                                    value={formData.direccionEmbarqueId}
                                    onValueChange={(val) => setFormData(prev => ({ ...prev, direccionEmbarqueId: val }))}
                                >
                                    <SelectTrigger className="rounded-xl text-xs font-medium h-9">
                                        <SelectValue placeholder="Seleccione dirección de envío..." />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        {shipmentAddresses.map((addr) => (
                                            <SelectItem key={addr.id} value={addr.id}>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-blue-600">#{addr.id}</span>
                                                    <span>{addr.descripcion || addr.detalle || 'Dirección de Entrega'}</span>
                                                    {addr.latitude && addr.longitude ? (
                                                        <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-300">
                                                            <MapPin className="w-2.5 h-2.5 mr-0.5" /> GPS
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <Separator />

                        {/* Lista de Productos con Búsqueda Integrada */}
                        <div className="space-y-3 relative">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-extrabold uppercase tracking-wider text-blue-600">Productos a Despachar</Label>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="h-7 text-xs font-bold rounded-lg border-dashed">
                                    + Agregar Producto
                                </Button>
                            </div>

                            {items.map((item, idx) => (
                                <div key={idx} className="flex gap-2 items-center relative">
                                    <Input
                                        placeholder="Código"
                                        value={item.codigo}
                                        onChange={(e) => {
                                            handleItemChange(idx, 'codigo', e.target.value);
                                            setActiveProductIndex(idx);
                                            setProductSearchInputs(prev => ({ ...prev, [idx]: e.target.value }));
                                        }}
                                        onFocus={() => setActiveProductIndex(idx)}
                                        className="w-32 rounded-lg text-xs font-mono font-bold h-8"
                                    />
                                    <Input
                                        placeholder="Descripción del Producto (o busque aquí...)"
                                        value={item.descripcion}
                                        onChange={(e) => {
                                            handleItemChange(idx, 'descripcion', e.target.value);
                                            setActiveProductIndex(idx);
                                            setProductSearchInputs(prev => ({ ...prev, [idx]: e.target.value }));
                                        }}
                                        onFocus={() => setActiveProductIndex(idx)}
                                        className="flex-1 rounded-lg text-xs font-medium h-8"
                                    />
                                    <Input
                                        type="number"
                                        min="1"
                                        value={item.cantidad}
                                        onChange={(e) => handleItemChange(idx, 'cantidad', parseInt(e.target.value, 10) || 1)}
                                        className="w-20 rounded-lg text-xs font-bold text-center h-8"
                                    />
                                    {items.length > 1 && (
                                        <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveItem(idx)} className="h-8 w-8 text-rose-500 hover:bg-rose-50 rounded-lg">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}

                            {showProductDropdown && activeProductIndex !== null && productSearchResults.length > 0 && (
                                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border border-muted rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                    {productSearchResults.map((prod) => (
                                        <div
                                            key={prod.codigo}
                                            onClick={() => handleSelectProduct(prod)}
                                            className="p-2 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer text-xs border-b border-muted/50 last:border-0 flex items-center justify-between"
                                        >
                                            <div>
                                                <span className="font-mono font-bold text-blue-600">{prod.codigo}</span>
                                                <span className="ml-2 font-medium">{prod.descripcion}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Selector de Método / Medio de Envío */}
                        <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-2xl space-y-2">
                            <Label className="text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                                🚚 Método / Medio de Envío Solicitado *
                            </Label>
                            <Select
                                value={formData.medioEnvio}
                                onValueChange={(val: any) => setFormData(prev => ({ ...prev, medioEnvio: val }))}
                            >
                                <SelectTrigger className="rounded-xl text-xs font-bold bg-background h-10 border-blue-200">
                                    <SelectValue placeholder="Seleccione medio de envío..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    <SelectItem value="camion">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold">🚚 Chofer / Camión en Ruta</span>
                                            <span className="text-[10px] text-muted-foreground">(Ingresa a la Cola General de Transporte tras aprobación)</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="encomienda">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold">📦 Encomienda / Transporte Externo</span>
                                            <span className="text-[10px] text-muted-foreground">(Salida directa por bodega sin ocupar camiones)</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="vendedor_mostrador">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold">👤 Vendedor / Retiro en Mostrador</span>
                                            <span className="text-[10px] text-muted-foreground">(Entrega física directa en instalaciones)</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5 pt-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notas / Instrucciones de Alistamiento</Label>
                            <Textarea
                                rows={2}
                                placeholder="Observaciones especiales para la bodega o chofer..."
                                value={formData.comentario}
                                onChange={(e) => setFormData(prev => ({ ...prev, comentario: e.target.value }))}
                                className="rounded-xl text-xs font-medium"
                            />
                        </div>

                        <DialogFooter className="pt-4 flex flex-col sm:flex-row gap-2">
                            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-xl font-bold text-xs">
                                Cancelar
                            </Button>
                            <Button 
                                type="button" 
                                variant="secondary"
                                disabled={creating} 
                                onClick={(e) => {
                                    handleCreateBoletaWithParams(e, false);
                                }}
                                className="rounded-xl font-bold text-xs border"
                            >
                                ✏️ Guardar Borrador
                            </Button>
                            <Button 
                                type="button" 
                                disabled={creating} 
                                onClick={(e) => {
                                    handleCreateBoletaWithParams(e, true);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/20"
                            >
                                {creating ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}
                                🚀 Guardar y Enviar a Aprobación
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal para Editar Boleta Operativa */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Edit3 className="w-5 h-5 text-blue-600" /> Editar Boleta Operativa #{editingBoleta?.boleta_numero || editingBoleta?.documento_numero}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Modifique el documento de origen, notas del chofer/supervisor y cantidades físicas de los productos antes de su salida.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold">Cliente / Destinatario</Label>
                                <Input
                                    value={editFormData.clienteNombre}
                                    onChange={(e) => setEditFormData(prev => ({ ...prev, clienteNombre: e.target.value }))}
                                    placeholder="Nombre del cliente..."
                                    className="rounded-xl text-xs font-semibold"
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold">Doc. Origen / Referencia ERP</Label>
                                <Input
                                    value={editFormData.referenciaDoc}
                                    onChange={(e) => setEditFormData(prev => ({ ...prev, referenciaDoc: e.target.value }))}
                                    placeholder="Ej. 00100001010000201838 o REM-002232"
                                    className="rounded-xl font-mono text-xs font-bold text-sky-700 dark:text-sky-300"
                                />
                            </div>
                        </div>

                        {/* Dirección de Embarque en Edición */}
                        {editShipmentAddresses.length > 0 && (
                            <div className="space-y-1.5 p-3 bg-muted/20 border border-muted/80 rounded-xl">
                                <Label className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                                    <Building2 className="w-4 h-4 text-blue-500" /> Dirección de Embarque
                                </Label>
                                <Select
                                    value={editFormData.direccionEmbarqueId}
                                    onValueChange={(val) => setEditFormData(prev => ({ ...prev, direccionEmbarqueId: val }))}
                                >
                                    <SelectTrigger className="rounded-xl text-xs font-medium h-9">
                                        <SelectValue placeholder="Seleccione dirección de envío..." />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        {editShipmentAddresses.map((addr) => (
                                            <SelectItem key={addr.id} value={addr.id}>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-blue-600">#{addr.id}</span>
                                                    <span>{addr.descripcion || addr.detalle || 'Dirección de Entrega'}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold flex items-center gap-1">
                                💬 Observaciones / Notas del Chofer o Alistamiento
                            </Label>
                            <Textarea
                                value={editFormData.comentario}
                                onChange={(e) => setEditFormData(prev => ({ ...prev, comentario: e.target.value }))}
                                placeholder="Notas del chofer o instrucciones de alistamiento..."
                                rows={2}
                                className="rounded-xl text-xs"
                            />
                        </div>

                        {/* Líneas de productos a despachar */}
                        <div className="space-y-2 border border-muted p-3.5 rounded-xl bg-muted/10">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                                    Detalle de Productos a Alistar
                                </Label>
                                <Button type="button" size="sm" variant="outline" onClick={handleAddEditItem} className="h-7 text-xs font-bold rounded-lg border-dashed">
                                    <PlusCircle className="w-3 h-3 mr-1 text-blue-600" /> Añadir Fila
                                </Button>
                            </div>

                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {editItems.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-background p-2 rounded-lg border border-muted/80 shadow-xs">
                                        <div className="w-32">
                                            <Input
                                                placeholder="Código Art."
                                                value={item.codigo}
                                                onChange={(e) => handleEditItemChange(idx, 'codigo', e.target.value)}
                                                className="h-8 font-mono text-xs font-bold rounded-lg"
                                                required
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <Input
                                                placeholder="Descripción del producto..."
                                                value={item.descripcion}
                                                onChange={(e) => handleEditItemChange(idx, 'descripcion', e.target.value)}
                                                className="h-8 text-xs rounded-lg"
                                            />
                                        </div>
                                        <div className="w-20">
                                            <Input
                                                type="number"
                                                min="1"
                                                placeholder="Cant"
                                                value={item.cantidad}
                                                onChange={(e) => handleEditItemChange(idx, 'cantidad', parseInt(e.target.value, 10) || 1)}
                                                className="h-8 text-xs font-bold text-center rounded-lg"
                                                required
                                            />
                                        </div>
                                        {editItems.length > 1 && (
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => handleRemoveEditItem(idx)}
                                                className="h-8 w-8 text-rose-500 hover:bg-rose-50 rounded-lg"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)} className="rounded-xl text-xs font-bold">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={savingEdit} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md">
                                {savingEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                                Guardar Cambios
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal de Previsualización e Impresión */}
            <Dialog open={isPrintOpen} onOpenChange={setIsPrintOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center justify-between">
                            <span>Vista Previa de Boleta Operativa</span>
                            <Button onClick={handleExecutePrint} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs">
                                <Printer className="w-4 h-4 mr-1.5" /> Imprimir Documento
                            </Button>
                        </DialogTitle>
                    </DialogHeader>

                    {printHtml && (
                        <div className="border border-muted rounded-xl p-4 bg-white text-black min-h-[400px]">
                            <iframe
                                srcDoc={printHtml}
                                className="w-full h-[550px] border-none"
                                title="Boleta Preview"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </main>
    );
}
