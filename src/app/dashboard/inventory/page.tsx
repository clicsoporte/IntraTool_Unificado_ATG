'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { 
    getDepartments, 
    getInventoryItems, 
    createInventoryItem, 
    updateInventoryItem, 
    adjustInventoryStock, 
    getInventoryTransactions,
    InventoryItem,
    InventoryTransaction,
    uploadInventoryFileAction
} from '@/modules/inventory/lib/actions';
import { 
    Card, CardContent, CardDescription, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle 
} from '@/components/ui/dialog';
import { 
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
    Search, Plus, ArrowUpDown, History, ShieldAlert, FileText, ArrowUpRight, ArrowDownLeft, SlidersHorizontal, Eye, Warehouse, Wrench, Upload, Loader2
} from 'lucide-react';

interface Department {
    id: number;
    name: string;
    description: string | null;
    is_active: number;
}

import { useAuthorization } from '@/modules/core/hooks/useAuthorization';

export default function InventoryDashboardPage() {
    const { setTitle } = usePageTitle();
    const { user, isAuthReady } = useAuth();
    const { hasPermission } = useAuthorization();
    
    // Core State
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDeptId, setSelectedDeptId] = useState<number | undefined>(undefined);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(true);
    const [loadingDepts, setLoadingDepts] = useState(true);
    
    // Filters & Search
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    // Modals state
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isAdjustOpen, setIsAdjustOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
    const [loadingTx, setLoadingTx] = useState(false);

    // Form inputs
    const [newItem, setNewItem] = useState({
        id: '',
        name: '',
        brand: '',
        model: '',
        serialNumber: '',
        partNumber: '',
        batchNumber: '',
        category: '',
        quantity: 0,
        unit: 'unidades',
        location: '',
        minStock: 0,
        price: 0,
        datasheetUrl: ''
    });
    
    const [adjustForm, setAdjustForm] = useState({
        quantityChange: 1,
        type: 'ENTRY' as 'ENTRY' | 'EXIT',
        reason: ''
    });

    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [uploadingFile, setUploadingFile] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        setErrorMsg('');
        setSuccessMsg('');
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const res = await uploadInventoryFileAction(formData);
            if (res.success && res.url) {
                setNewItem(prev => ({ ...prev, datasheetUrl: res.url! }));
                setSuccessMsg('Ficha técnica subida y enlazada con éxito.');
            } else {
                setErrorMsg(res.error || 'Error al subir el archivo.');
            }
        } catch (err: any) {
            setErrorMsg('Error al subir el archivo: ' + err.message);
        } finally {
            setUploadingFile(false);
        }
    };

    useEffect(() => {
        setTitle("Gestión de Inventarios");
    }, [setTitle]);

    // Load departments dynamic based on permissions
    useEffect(() => {
        if (!isAuthReady) return;
        async function loadDepts() {
            try {
                const depts = await getDepartments();
                // Filter only active departments
                let filtered = depts.filter((d: Department) => Number(d.is_active) === 1);
                
                // If the user is not super administrator, filter departments where they have read permissions
                if (!hasPermission('admin:access')) {
                    filtered = filtered.filter((d: Department) => {
                        // Check custom department permission or if they have permission to read this specific instance
                        return hasPermission(`inventory:read:${d.id}`) || hasPermission('inventory:read') || d.id === 1; // Default fallback to taller for legacy roles
                    });
                }

                setDepartments(filtered);
                // Do not preselect any department automatically to show the welcome screen
                setSelectedDeptId(undefined);
            } catch (err) {
                console.error("Error loading departments", err);
            } finally {
                setLoadingDepts(false);
            }
        }
        loadDepts();
    }, [isAuthReady, hasPermission]);

    // Load inventory items
    const loadItems = useCallback(async () => {
        if (!selectedDeptId) return;
        setLoadingItems(true);
        try {
            const data = await getInventoryItems(selectedDeptId, search, categoryFilter);
            setItems(data);
        } catch (err) {
            console.error("Error loading inventory items", err);
        } finally {
            setLoadingItems(false);
        }
    }, [selectedDeptId, search, categoryFilter]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    // Handle create item
    const handleCreateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        if (!newItem.id.trim() || !newItem.name.trim()) {
            setErrorMsg('El código y el nombre son campos obligatorios.');
            return;
        }

        if (!selectedDeptId) {
            setErrorMsg('Por favor seleccione un departamento.');
            return;
        }

        try {
            const result = await createInventoryItem({
                ...newItem,
                departmentId: selectedDeptId,
                user: user?.name || 'Sistema'
            });

            if (result.success) {
                setSuccessMsg('Repuesto registrado correctamente.');
                setIsAddOpen(false);
                setNewItem({
                    id: '',
                    name: '',
                    brand: '',
                    model: '',
                    serialNumber: '',
                    partNumber: '',
                    batchNumber: '',
                    category: '',
                    quantity: 0,
                    unit: 'unidades',
                    location: '',
                    minStock: 0,
                    price: 0,
                    datasheetUrl: ''
                });
                loadItems();
            } else {
                setErrorMsg(result.error || 'Ocurrió un error inesperado.');
            }
        } catch (err: any) {
            setErrorMsg(err.message);
        }
    };

    // Handle adjust stock
    const handleAdjustStock = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        if (!selectedItem) return;

        try {
            const result = await adjustInventoryStock(
                selectedItem.id,
                adjustForm.type === 'ENTRY' ? adjustForm.quantityChange : -adjustForm.quantityChange,
                adjustForm.type,
                adjustForm.reason || (adjustForm.type === 'ENTRY' ? 'Entrada manual' : 'Salida manual'),
                user?.name || 'Sistema'
            );

            if (result.success) {
                setSuccessMsg('Inventario ajustado correctamente.');
                setIsAdjustOpen(false);
                setAdjustForm({
                    quantityChange: 1,
                    type: 'ENTRY',
                    reason: ''
                });
                loadItems();
            } else {
                setErrorMsg(('error' in result ? result.error : null) || 'Ocurrió un error al ajustar stock.');
            }
        } catch (err: any) {
            setErrorMsg(err.message);
        }
    };

    // Show transaction history
    const showHistory = async (item: InventoryItem) => {
        setSelectedItem(item);
        setLoadingTx(true);
        setIsHistoryOpen(true);
        try {
            const txs = await getInventoryTransactions(item.id);
            setTransactions(txs);
        } catch (err) {
            console.error("Error loading transactions", err);
        } finally {
            setLoadingTx(false);
        }
    };

    // Derived statistics
    const totalItemsCount = items.length;
    const lowStockItems = items.filter(item => item.quantity <= item.min_stock);
    const lowStockCount = lowStockItems.length;
    const totalInventoryValue = items.reduce((acc, item) => acc + (item.quantity * item.price), 0);

    const categories = Array.from(new Set(items.map(item => item.category).filter(Boolean))) as string[];

    if (!isAuthReady || loadingDepts) {
        return (
            <div className="p-4 md:p-6 space-y-6">
                <Skeleton className="h-12 w-64 rounded-xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-96 w-full rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6 animate-in fade-in duration-500">
            {/* Header section with department selector */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-2xl text-white shadow-lg shadow-emerald-200 dark:shadow-none">
                        <SlidersHorizontal className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Control de Inventario y Repuestos</h1>
                        <p className="text-sm md:text-base text-muted-foreground font-medium">Gestión centralizada de stock, repuestos y activos por departamento.</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Label htmlFor="dept-selector" className="sr-only">Seleccionar Departamento</Label>
                    <select
                        id="dept-selector"
                        value={selectedDeptId || ''}
                        onChange={(e) => setSelectedDeptId(e.target.value ? Number(e.target.value) : undefined)}
                        className="flex h-10 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="" disabled>-- Seleccionar Departamento --</option>
                        {departments.map((dept) => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                    </select>

                    <Button 
                        onClick={() => setIsAddOpen(true)} 
                        disabled={!selectedDeptId}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Registrar Artículo / Activo
                    </Button>
                </div>
            </div>

            {!selectedDeptId ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="p-6 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-3xl text-white shadow-xl shadow-emerald-200 dark:shadow-none animate-pulse">
                        <Warehouse className="w-16 h-16 animate-bounce" style={{ animationDuration: '4s' }} />
                    </div>
                    <div className="space-y-4">
                        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">¡Bienvenido al Control de Inventarios!</h2>
                        <p className="text-lg text-muted-foreground font-medium max-w-2xl">
                            Para poder registrar repuestos, consultar fichas técnicas, ajustar stock o auditar movimientos de activos, por favor selecciona el almacén o departamento en el que deseas operar.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full pt-6">
                        {departments.map((dept) => (
                            <button
                                key={dept.id}
                                onClick={() => setSelectedDeptId(dept.id)}
                                className="group p-6 text-left border rounded-2xl bg-white dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-emerald-500 transition-all duration-300 transform hover:-translate-y-1"
                            >
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl w-fit text-emerald-600 dark:text-emerald-400 font-bold mb-4">
                                    📦 Bodega {dept.id}
                                </div>
                                <h3 className="font-bold text-lg group-hover:text-emerald-600 transition-colors">{dept.name}</h3>
                                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                                    {dept.description || 'Haga clic para ingresar al control de inventario de esta bodega.'}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* Quick Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-bold text-muted-foreground">Catálogo Único</CardTitle>
                                <SlidersHorizontal className="w-4 h-4 text-emerald-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-extrabold">{totalItemsCount}</div>
                                <p className="text-xs text-muted-foreground mt-1">Repuestos/activos activos registrados.</p>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-bold text-muted-foreground">Alertas de Stock Mínimo</CardTitle>
                                <ShieldAlert className="w-4 h-4 text-amber-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-extrabold text-amber-600">{lowStockCount}</div>
                                <p className="text-xs text-muted-foreground mt-1">Ítems que requieren reabastecimiento.</p>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-bold text-muted-foreground">Valor del Inventario</CardTitle>
                                <ArrowUpDown className="w-4 h-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-extrabold">
                                    ₡{totalInventoryValue.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Valorización del stock actual.</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Filter and Table Card */}
                    <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50 animate-in fade-in slide-in-from-bottom-6 duration-500">
                <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg font-bold">Listado de Inventario</CardTitle>
                        <CardDescription>Consulta y administra los repuestos asignados a esta instancia.</CardDescription>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar en OmniSearch..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 bg-white dark:bg-slate-950"
                            />
                        </div>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="flex h-10 w-full sm:w-48 rounded-md border border-input bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                        >
                            <option value="all">Todas las categorías</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </CardHeader>
                <CardContent>
                    {loadingItems ? (
                        <div className="space-y-3 py-6">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground font-medium">
                            No se encontraron repuestos en este departamento con los filtros seleccionados.
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50 dark:bg-slate-900">
                                        <TableHead className="font-bold">Código</TableHead>
                                        <TableHead className="font-bold">Nombre / Ficha</TableHead>
                                        <TableHead className="font-bold">Marca / Modelo</TableHead>
                                        <TableHead className="font-bold">N° Parte / Lote</TableHead>
                                        <TableHead className="font-bold text-center">Stock</TableHead>
                                        <TableHead className="font-bold">Ubicación</TableHead>
                                        <TableHead className="font-bold text-right">Costo Unit.</TableHead>
                                        <TableHead className="font-bold text-center">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item) => {
                                        const isLow = item.quantity <= item.min_stock;
                                        return (
                                            <TableRow key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                                                <TableCell className="font-mono text-xs font-bold">{item.id}</TableCell>
                                                <TableCell>
                                                    <div className="font-bold text-slate-800 dark:text-slate-200">{item.name}</div>
                                                    {item.datasheet_url && (
                                                        <a href={item.datasheet_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs text-emerald-600 hover:text-emerald-700 font-semibold mt-1">
                                                            <FileText className="w-3. h-3 mr-1" /> Ver Ficha Técnica
                                                        </a>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {item.brand || '-'} {item.model ? `/ ${item.model}` : ''}
                                                </TableCell>
                                                <TableCell className="text-sm font-mono text-xs">
                                                    <div>P: {item.part_number || '-'}</div>
                                                    {item.batch_number && <div className="text-muted-foreground text-[10px]">Lote: {item.batch_number}</div>}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge className={`font-bold px-2 py-1 ${isLow ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                                                        {item.quantity} {item.unit}
                                                    </Badge>
                                                    {isLow && <div className="text-[10px] text-amber-600 font-bold mt-1">¡Reorden! ({item.min_stock})</div>}
                                                </TableCell>
                                                <TableCell className="text-sm font-medium">{item.location || '-'}</TableCell>
                                                <TableCell className="text-right font-mono font-bold text-sm">
                                                    ₡{item.price.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="text-center space-x-2">
                                                    <Button size="sm" variant="outline" onClick={() => {
                                                        setSelectedItem(item);
                                                        setIsAdjustOpen(true);
                                                    }} className="h-8 hover:bg-slate-100 font-semibold">
                                                        Ajustar Stock
                                                    </Button>
                                                    <Button size="icon" variant="ghost" onClick={() => showHistory(item)} title="Ver Historial" className="h-8 w-8 text-muted-foreground hover:text-slate-900">
                                                        <History className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
                </>
            )}

            {/* Modal Register Item */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Registrar Artículo / Activo</DialogTitle>
                        <DialogDescription>Completa la información técnica del nuevo artículo o activo en esta bodega.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateItem} className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="item-id">Código Único (ID) *</Label>
                            <Input
                                id="item-id"
                                placeholder="Ej: ART-TI-0023 o LAPTOP-JONA"
                                value={newItem.id}
                                onChange={(e) => setNewItem({...newItem, id: e.target.value.toUpperCase()})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-name">Nombre de Artículo / Activo *</Label>
                            <Input
                                id="item-name"
                                placeholder="Ej: Laptop Lenovo ThinkPad L14 o Filtro Aceite"
                                value={newItem.name}
                                onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-brand">Marca</Label>
                            <Input
                                id="item-brand"
                                placeholder="Ej: Bosch"
                                value={newItem.brand}
                                onChange={(e) => setNewItem({...newItem, brand: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-model">Modelo</Label>
                            <Input
                                id="item-model"
                                placeholder="Ej: Premium Brake Series"
                                value={newItem.model}
                                onChange={(e) => setNewItem({...newItem, model: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-part">Número de Parte</Label>
                            <Input
                                id="item-part"
                                placeholder="Ej: 0-986-494-012"
                                value={newItem.partNumber}
                                onChange={(e) => setNewItem({...newItem, partNumber: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-batch">Número de Lote (Grease, screws...)</Label>
                            <Input
                                id="item-batch"
                                placeholder="Ej: LOTE-2026-X"
                                value={newItem.batchNumber}
                                onChange={(e) => setNewItem({...newItem, batchNumber: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-qty">Stock Inicial</Label>
                            <Input
                                id="item-qty"
                                type="number"
                                step="any"
                                value={newItem.quantity}
                                onChange={(e) => setNewItem({...newItem, quantity: Number(e.target.value)})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-unit">Unidad de Medida</Label>
                            <select
                                id="item-unit"
                                value={newItem.unit}
                                onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <option value="unidades">Unidades (und)</option>
                                <option value="metros">Metros (m)</option>
                                <option value="litros">Litros (l)</option>
                                <option value="galones">Galones (gal)</option>
                                <option value="pulgadas">Pulgadas (in)</option>
                                <option value="kilogramos">Kilogramos (kg)</option>
                                <option value="gramos">Gramos (g)</option>
                                <option value="cajas">Cajas (box)</option>
                                <option value="rollos">Rollos (roll)</option>
                                <option value="juegos">Juegos / Sets (set)</option>
                                <option value="paquetes">Paquetes (pkg)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-min">Stock Mínimo Alerta</Label>
                            <Input
                                id="item-min"
                                type="number"
                                step="any"
                                value={newItem.minStock}
                                onChange={(e) => setNewItem({...newItem, minStock: Number(e.target.value)})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-price">Costo Unitario (₡) *</Label>
                            <Input
                                id="item-price"
                                type="number"
                                step="any"
                                value={newItem.price}
                                onChange={(e) => setNewItem({...newItem, price: Number(e.target.value)})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-loc">Ubicación Física</Label>
                            <Input
                                id="item-loc"
                                placeholder="Ej: Estante A - Fila 3"
                                value={newItem.location}
                                onChange={(e) => setNewItem({...newItem, location: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-cat">Categoría</Label>
                            <Input
                                id="item-cat"
                                placeholder="Ej: Frenos, Eléctrico, Motor"
                                value={newItem.category}
                                onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                            />
                        </div>
                        <div className="col-span-full border-t pt-4 mt-2">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Documentación y Ficha Técnica</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="item-file-upload" className="cursor-pointer font-semibold">Subir Documento (PDF, Img, Doc)</Label>
                                    <div className="relative flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                        <Input
                                            id="item-file-upload"
                                            type="file"
                                            accept=".pdf,image/*,.doc,.docx"
                                            onChange={handleFileUpload}
                                            disabled={uploadingFile}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <div className="text-center space-y-1">
                                            {uploadingFile ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                                                    <span className="text-xs font-semibold text-muted-foreground">Subiendo a /uploads/inventory...</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <Upload className="w-6 h-6 text-emerald-600" />
                                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Seleccionar o soltar archivo</span>
                                                    <span className="text-[10px] text-muted-foreground">PDF, JPG, PNG, DOC (Máx. 20MB)</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="item-datasheet" className="font-semibold">Enlace del Documento / Ficha</Label>
                                    <Input
                                        id="item-datasheet"
                                        placeholder="Ej: /api/inventory/files/auto-uuid.pdf"
                                        value={newItem.datasheetUrl}
                                        onChange={(e) => setNewItem({...newItem, datasheetUrl: e.target.value})}
                                        className="font-mono text-xs"
                                    />
                                    <p className="text-[10px] text-muted-foreground">Generado automáticamente al subir archivo, o puedes ingresar una URL externa.</p>
                                </div>
                            </div>
                        </div>
                        
                        {errorMsg && <p className="text-sm font-bold text-red-500 col-span-full">{errorMsg}</p>}
                        
                        <DialogFooter className="col-span-full pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Registrar</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal Adjust Stock */}
            <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Ajustar Stock Manual</DialogTitle>
                        <DialogDescription>Registra una entrada o salida manual para el repuesto: <span className="font-bold">{selectedItem?.name}</span></DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAdjustStock} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="adjust-type">Tipo de Operación</Label>
                            <select
                                id="adjust-type"
                                value={adjustForm.type}
                                onChange={(e) => setAdjustForm({...adjustForm, type: e.target.value as 'ENTRY' | 'EXIT'})}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="ENTRY">Entrada (+)</option>
                                <option value="EXIT">Salida (-)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="adjust-qty">Cantidad a Ajustar</Label>
                            <Input
                                id="adjust-qty"
                                type="number"
                                step="any"
                                min="0.01"
                                value={adjustForm.quantityChange}
                                onChange={(e) => setAdjustForm({...adjustForm, quantityChange: Number(e.target.value)})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="adjust-reason">Motivo / Justificación *</Label>
                            <Input
                                id="adjust-reason"
                                placeholder="Ej: Compra directa, Pérdida, Reajuste anual..."
                                value={adjustForm.reason}
                                onChange={(e) => setAdjustForm({...adjustForm, reason: e.target.value})}
                                required
                            />
                        </div>

                        {errorMsg && <p className="text-sm font-bold text-red-500">{errorMsg}</p>}

                        <DialogFooter className="pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsAdjustOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Aplicar Ajuste</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal Transactions History */}
            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-950">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center">
                            <History className="w-5 h-5 mr-2 text-emerald-600" />
                            Historial de Transacciones
                        </DialogTitle>
                        <DialogDescription>
                            Registro completo de auditoría para el ítem: <span className="font-bold">{selectedItem?.name}</span>
                        </DialogDescription>
                    </DialogHeader>
                    {loadingTx ? (
                        <div className="space-y-3 py-6">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No se registran movimientos ni transacciones para este repuesto.
                        </div>
                    ) : (
                        <div className="border rounded-lg overflow-hidden mt-4">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50 dark:bg-slate-900">
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Operación</TableHead>
                                        <TableHead className="text-center">Cant.</TableHead>
                                        <TableHead>Justificación</TableHead>
                                        <TableHead>Responsable</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((tx) => {
                                        const isEntry = tx.type === 'ENTRY';
                                        const isExit = tx.type === 'EXIT';
                                        return (
                                            <TableRow key={tx.id}>
                                                <TableCell className="text-xs font-mono">
                                                    {new Date(tx.created_at).toLocaleDateString('es-CR', {
                                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                                        hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </TableCell>
                                                <TableCell>
                                                    {isEntry ? (
                                                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                                            <ArrowDownLeft className="w-3 h-3 mr-1 text-emerald-600" /> Entrada
                                                        </Badge>
                                                    ) : tx.type === 'REPAIR_CONSUMPTION' ? (
                                                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                                                            <ArrowUpRight className="w-3 h-3 mr-1 text-blue-600" /> Reparación
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                                                            <ArrowUpRight className="w-3 h-3 mr-1 text-amber-600" /> Salida
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className={`text-center font-mono font-bold ${isEntry ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {isEntry ? '+' : ''}{tx.quantity}
                                                </TableCell>
                                                <TableCell className="text-sm font-medium">{tx.reason}</TableCell>
                                                <TableCell className="text-xs font-medium text-muted-foreground">{tx.created_by}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsHistoryOpen(false)}>Cerrar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
