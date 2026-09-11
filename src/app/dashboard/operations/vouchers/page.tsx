'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
    Clock,
    AlertCircle,
    ArrowLeft,
    RefreshCw,
    Trash2,
    FileText,
    Gift,
    PackageCheck,
    RotateCcw,
    Layers,
    Edit3,
    Save
} from 'lucide-react';
import Link from 'next/link';
import {
    createBoletaOperativaAction,
    updateBoletaOperativaAction,
    getBoletasOperativasAction,
    approveBoletaOperativaAction,
    getBoletaPrintHtmlAction
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

    // Modal para Nueva Boleta Operativa
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState({
        clienteId: '',
        clienteNombre: '',
        motivoSalida: 'faltante' as 'faltante' | 'devolucion' | 'muestra' | 'regalia' | 'otro',
        referenciaDoc: '',
        comentario: ''
    });

    const [items, setItems] = useState<Array<{ codigo: string; descripcion: string; cantidad: number }>>([
        { codigo: '', descripcion: '', cantidad: 1 }
    ]);

    // Preview / Printing
    const [printHtml, setPrintHtml] = useState<string | null>(null);
    const [isPrintOpen, setIsPrintOpen] = useState(false);
    const [loadingPrint, setLoadingPrint] = useState(false);

    useEffect(() => {
        setTitle('Boletas Operativas (Salidas de Bodega)');
        loadData();
    }, [setTitle]);

    async function loadData() {
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
    }

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

    const handleCreateBoleta = async (e: React.FormEvent) => {
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
                items: validItems
            });

            if (res.success) {
                toast({
                    title: 'Boleta Creada',
                    description: `Se ha generado la Boleta #${res.boletaNumero} exitosamente.`,
                });
                setIsCreateOpen(false);
                setFormData({ clienteId: '', clienteNombre: '', motivoSalida: 'faltante', referenciaDoc: '', comentario: '' });
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

    // Modal para Editar Boleta
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingBoleta, setEditingBoleta] = useState<any | null>(null);
    const [editFormData, setEditFormData] = useState({
        clienteNombre: '',
        referenciaDoc: '',
        comentario: ''
    });
    const [editItems, setEditItems] = useState<Array<{ codigo: string; descripcion: string; cantidad: number }>>([]);
    const [savingEdit, setSavingEdit] = useState(false);

    const handleOpenEdit = (boleta: any) => {
        setEditingBoleta(boleta);
        setEditFormData({
            clienteNombre: boleta.cliente_nombre || '',
            referenciaDoc: boleta.referencia_doc || (boleta.documento_numero && boleta.documento_numero.includes('-PARTIAL') ? boleta.documento_numero.replace('-PARTIAL', '').replace('-RETRY', '') : ''),
            comentario: boleta.comentario || ''
        });
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

    const [selectedApproveBoleta, setSelectedApproveBoleta] = useState<any | null>(null);

    const handleApprove = async (id: number, sendToQueue: boolean) => {
        try {
            const res = await approveBoletaOperativaAction(id, sendToQueue);
            if (res.success) {
                toast({ 
                    title: 'Boleta Autorizada', 
                    description: sendToQueue 
                        ? 'La boleta se ha enviado a la Cola General de Despacho.' 
                        : 'La boleta ha sido autorizada para entrega directa / encomienda (fuera de ruta de camión).' 
                });
                setSelectedApproveBoleta(null);
                loadData();
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({ title: 'Error al autorizar', description: e.message, variant: 'destructive' });
        }
    };

    const handlePrintPreview = async (id: number) => {
        setLoadingPrint(true);
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
        } finally {
            setLoadingPrint(false);
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
                                                {b.estado === 'pendiente_autorizacion' ? (
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] font-extrabold">
                                                        ⏳ Por Autorizar
                                                    </Badge>
                                                ) : b.estado === 'pendiente' ? (
                                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] font-extrabold">
                                                        ✅ Cola Despacho
                                                    </Badge>
                                                ) : b.estado === 'aprobado_fuera_de_ruta' ? (
                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-[10px] font-extrabold">
                                                        📦 Salida Directa
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] font-extrabold capitalize">
                                                        {b.estado}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                {(b.estado === 'pendiente_autorizacion' || b.estado === 'pendiente') && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleOpenEdit(b)}
                                                        className="h-8 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300"
                                                        title="Editar líneas, cantidades y notas"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5 mr-1" /> Editar
                                                    </Button>
                                                )}
                                                {b.estado === 'pendiente_autorizacion' && canApprove && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setSelectedApproveBoleta(b)}
                                                        className="h-8 text-xs font-bold text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Autorizar
                                                    </Button>
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
                <DialogContent className="max-w-2xl rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <FileSignature className="w-5 h-5 text-blue-600" /> Nueva Boleta de Salida de Bodega
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Registre una autorización de alistamiento y salida de mercancía sin factura.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleCreateBoleta} className="space-y-4 pt-2">
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

                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Doc Referencia (Opcional)</Label>
                                <Input
                                    placeholder="Ej. Factura #001000... u Orden"
                                    value={formData.referenciaDoc}
                                    onChange={(e) => setFormData(prev => ({ ...prev, referenciaDoc: e.target.value }))}
                                    className="rounded-xl text-xs font-medium h-9"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ID Cliente / Cédula</Label>
                                <Input
                                    placeholder="CLI-00123"
                                    value={formData.clienteId}
                                    onChange={(e) => setFormData(prev => ({ ...prev, clienteId: e.target.value }))}
                                    className="rounded-xl text-xs font-medium h-9 font-mono"
                                />
                            </div>
                            <div className="md:col-span-2 space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cliente / Destinatario *</Label>
                                <Input
                                    placeholder="Nombre de la Empresa o Cliente final"
                                    value={formData.clienteNombre}
                                    onChange={(e) => setFormData(prev => ({ ...prev, clienteNombre: e.target.value }))}
                                    className="rounded-xl text-xs font-bold h-9"
                                    required
                                />
                            </div>
                        </div>

                        <Separator />

                        {/* Lista de Productos */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-extrabold uppercase tracking-wider text-blue-600">Productos a Despachar</Label>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="h-7 text-xs font-bold rounded-lg">
                                    + Agregar Producto
                                </Button>
                            </div>

                            {items.map((item, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <Input
                                        placeholder="Código"
                                        value={item.codigo}
                                        onChange={(e) => handleItemChange(idx, 'codigo', e.target.value)}
                                        className="w-28 rounded-lg text-xs font-mono font-bold h-8"
                                    />
                                    <Input
                                        placeholder="Descripción del Producto"
                                        value={item.descripcion}
                                        onChange={(e) => handleItemChange(idx, 'descripcion', e.target.value)}
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
                                        <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveItem(idx)} className="h-8 w-8 text-rose-500">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
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

                        <DialogFooter className="pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-xl font-bold text-xs">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs">
                                {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Generar Boleta de Salida'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal de Opciones de Autorización */}
            <Dialog open={!!selectedApproveBoleta} onOpenChange={(open) => !open && setSelectedApproveBoleta(null)}>
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2 text-emerald-600">
                            <CheckCircle2 className="w-5 h-5" /> Autorizar Boleta #{selectedApproveBoleta?.boleta_numero || selectedApproveBoleta?.documento_numero}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Seleccione el destino de entrega para esta boleta autorizada.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        <div className="p-3 bg-muted/40 rounded-xl border border-muted text-xs space-y-1">
                            <div><strong className="text-foreground">Cliente:</strong> {selectedApproveBoleta?.cliente_nombre}</div>
                            <div><strong className="text-foreground">Motivo:</strong> {selectedApproveBoleta?.motivo_salida || 'Salida de Bodega'}</div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 pt-2">
                            <Button
                                onClick={() => handleApprove(selectedApproveBoleta.id, true)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs h-12 flex flex-col items-center justify-center gap-0.5"
                            >
                                <span>🚛 Enviar a Cola General de Despacho</span>
                                <span className="text-[10px] font-normal opacity-90">Asignar a chofer / camión en ruta diaria</span>
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => handleApprove(selectedApproveBoleta.id, false)}
                                className="border-blue-300 text-blue-700 hover:bg-blue-50 font-bold rounded-xl text-xs h-12 flex flex-col items-center justify-center gap-0.5"
                            >
                                <span>📦 Salida Directa (Encomienda / Vendedor)</span>
                                <span className="text-[10px] text-muted-foreground font-normal">Alistar en bodega sin ocupar cupo en camiones</span>
                            </Button>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSelectedApproveBoleta(null)} className="rounded-xl text-xs font-bold">
                            Cancelar
                        </Button>
                    </DialogFooter>
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
