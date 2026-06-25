'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import {
    getItAssets,
    saveItAsset,
    deleteItAsset,
    getItBranches,
    getItLicensesCatalog,
    assignItAsset,
    returnItAsset,
    addItAssetComponent,
    removeItAssetComponent,
    addItAssetLicense,
    removeItAssetLicense,
    getItHrAlerts,
    getSystemUsersList,
    getPayrollEmployeesList,
    getItAssetById,
    getItAssetCategories
} from '@/modules/it-tools/lib/actions';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
    Cpu,
    Search,
    Plus,
    UserCheck,
    Pencil,
    Trash2,
    Calendar,
    DollarSign,
    ShieldAlert,
    Info,
    Laptop,
    CheckCircle,
    HelpCircle,
    Loader2,
    Undo2,
    SlidersHorizontal,
    KeyRound,
    Tag,
    X,
    FileText,
    Smartphone,
    Phone
} from 'lucide-react';

export default function ItAssetsPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized } = useAuthorization();
    const { exchangeRateData } = useAuth();
    const { toast } = useToast();

    // Data lists
    const [loading, setLoading] = useState(true);
    const [assets, setAssets] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [licensesCatalog, setLicensesCatalog] = useState<any[]>([]);
    const [hrAlerts, setHrAlerts] = useState<any[]>([]);
    const [systemUsers, setSystemUsers] = useState<any[]>([]);
    const [payrollEmployees, setPayrollEmployees] = useState<any[]>([]);
    const [categories, setCategories] = useState<string[]>([]);

    // Search and filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterBranch, setFilterBranch] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    // Selected asset detail view
    const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Modal forms toggles
    const [showAssetForm, setShowAssetForm] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showComponentsModal, setShowComponentsModal] = useState(false);
    const [showLicensesModal, setShowLicensesModal] = useState(false);

    // Form states
    const [tiInventoryItems, setTiInventoryItems] = useState<any[]>([]);
    
    const [assetForm, setAssetForm] = useState<any>({
        id: undefined,
        item_id: '',
        category: 'Laptop',
        brand: '',
        model: '',
        serial_number: '',
        status: 'active',
        purchase_date: '',
        purchase_cost: '',
        currency: 'CRC',
        exchange_rate: 1.0,
        warranty_expiration: '',
        branch_id: '',
        notes: '',
        imei: '',
        phone_number: '',
        telephony_provider: '',
        data_plan_start: '',
        data_plan_end: '',
        data_plan_renewal: 'monthly'
    });

    const [assignmentForm, setAssignmentForm] = useState({
        collaboratorId: ''
    });

    const unifiedCollaborators = useMemo(() => {
        const list: any[] = [];
        const linkedUserIds = new Set<number>();

        // 1. Add all payroll employees
        payrollEmployees.forEach((emp: any) => {
            const linkedUser = systemUsers.find((u: any) => u.employeeId === emp.id);
            if (linkedUser) {
                linkedUserIds.add(linkedUser.id);
            }
            list.push({
                id: `emp-${emp.id}`,
                value: emp.id,
                type: 'payroll_employee',
                name: emp.name,
                detail: linkedUser ? `Usuario: ${linkedUser.name} (${linkedUser.email})` : 'Planilla',
                linkedUserId: linkedUser ? linkedUser.id : null,
                linkedEmployeeCode: emp.id,
                active: emp.active === 'S'
            });
        });

        // 2. Add remaining system users who are not linked to any employee
        systemUsers.forEach((u: any) => {
            if (!linkedUserIds.has(u.id)) {
                list.push({
                    id: `usr-${u.id}`,
                    value: u.id,
                    type: 'system_user',
                    name: u.name,
                    detail: `Usuario Sistema (${u.email})`,
                    linkedUserId: u.id,
                    linkedEmployeeCode: u.employeeId || null,
                    active: true
                });
            }
        });

        return list.sort((a, b) => a.name.localeCompare(b.name));
    }, [systemUsers, payrollEmployees]);

    const [newComponent, setNewComponent] = useState({
        component_name: '',
        brand: '',
        model: '',
        serial_number: ''
    });

    const [newLicense, setNewLicense] = useState({
        license_catalog_id: '',
        license_key: '',
        expiration_date: ''
    });

    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setTitle("Gestión de Activos (ITAM)");
    }, [setTitle]);

    const loadAllData = useCallback(async () => {
        setLoading(true);
        try {
            const { getInventoryItems } = await import('@/modules/inventory/lib/actions');
            const [assetsData, branchesData, catalogData, alertsData, usersData, employeesData, categoriesData, inventoryItemsData] = await Promise.all([
                getItAssets(),
                getItBranches(),
                getItLicensesCatalog(),
                getItHrAlerts(),
                getSystemUsersList(),
                getPayrollEmployeesList(),
                getItAssetCategories(),
                getInventoryItems(2)
            ]);
            setAssets(assetsData);
            setBranches(branchesData);
            setLicensesCatalog(catalogData);
            setHrAlerts(alertsData);
            setSystemUsers(usersData);
            setPayrollEmployees(employeesData);
            setCategories(categoriesData);
            setTiInventoryItems(inventoryItemsData.filter((item: any) => item.status === 'active'));

            if (branchesData.length > 0 && !assetForm.branch_id) {
                setAssetForm((prev: any) => ({ ...prev, branch_id: branchesData[0].id }));
            }
        } catch (error) {
            console.error("Error loading ITAM data", error);
            toast({
                variant: "destructive",
                title: "Error de carga",
                description: "No se pudieron obtener los activos o los catálogos."
            });
        } finally {
            setLoading(false);
        }
    }, [assetForm.branch_id, toast]);

    useEffect(() => {
        if (isAuthorized) {
            loadAllData();
        }
    }, [isAuthorized, loadAllData]);

    // Fill current exchange rate when currency changes
    useEffect(() => {
        if (assetForm.currency === 'USD') {
            setAssetForm((prev: any) => ({ ...prev, exchange_rate: 1.0 }));
        } else if (exchangeRateData?.rate) {
            setAssetForm((prev: any) => ({ ...prev, exchange_rate: exchangeRateData.rate }));
        }
    }, [assetForm.currency, exchangeRateData]);

    const handleLoadAssetDetails = async (id: number) => {
        setLoadingDetails(true);
        try {
            const details = await getItAssetById(id);
            setSelectedAsset(details);
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error de detalles",
                description: "No se pudo cargar la información completa del activo."
            });
        } finally {
            setLoadingDetails(false);
        }
    };

    // Asset CRUD
    const handleSaveAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assetForm.brand.trim() || !assetForm.model.trim() || !assetForm.serial_number.trim() || !assetForm.branch_id) {
            toast({
                variant: "destructive",
                title: "Campos vacíos",
                description: "Complete la marca, modelo, número de serie y sede del equipo."
            });
            return;
        }

        setSubmitting(true);
        try {
            const saved = await saveItAsset(assetForm);
            toast({
                title: assetForm.id ? "Activo actualizado" : "Activo registrado",
                description: `El activo ${saved.brand} ${saved.model} se guardó correctamente.`
            });
            setShowAssetForm(false);
            loadAllData();
            if (selectedAsset && selectedAsset.id === saved.id) {
                handleLoadAssetDetails(saved.id);
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al guardar activo",
                description: error.message || "Asegúrese de que el número de serie sea único."
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditAsset = (asset: any) => {
        setAssetForm({
            id: asset.id,
            item_id: asset.item_id || '',
            category: asset.category,
            brand: asset.brand,
            model: asset.model,
            serial_number: asset.serial_number,
            status: asset.status,
            purchase_date: asset.purchase_date || '',
            purchase_cost: asset.purchase_cost || '',
            currency: asset.currency || 'CRC',
            exchange_rate: asset.exchange_rate || 1.0,
            warranty_expiration: asset.warranty_expiration || '',
            branch_id: asset.branch_id,
            notes: asset.notes || '',
            imei: asset.imei || '',
            phone_number: asset.phone_number || '',
            telephony_provider: asset.telephony_provider || '',
            data_plan_start: asset.data_plan_start || '',
            data_plan_end: asset.data_plan_end || '',
            data_plan_renewal: asset.data_plan_renewal || 'monthly'
        });
        setShowAssetForm(true);
    };

    const handleDeleteAsset = async (id: number) => {
        if (!confirm("¿Está seguro de que desea eliminar este activo? Se borrarán todos sus accesorios, historial de asignaciones y licencias vinculadas.")) return;
        try {
            await deleteItAsset(id);
            toast({
                title: "Activo eliminado",
                description: "El activo ha sido retirado del inventario."
            });
            setSelectedAsset(null);
            loadAllData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al eliminar",
                description: error.message || "Ocurrió un error inesperado."
            });
        }
    };

    // Assignments operations
    const handleOpenAssignModal = (asset: any) => {
        setSelectedAsset(asset);
        setAssignmentForm({
            collaboratorId: ''
        });
        setShowAssignModal(true);
        if (asset?.id) {
            handleLoadAssetDetails(asset.id);
        }
    };

    const handleAssignAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        const selectedCollab = unifiedCollaborators.find(c => c.id === assignmentForm.collaboratorId);
        if (!selectedCollab) {
            toast({
                variant: "destructive",
                title: "Seleccione un colaborador",
                description: "Seleccione el colaborador para asignar el equipo."
            });
            return;
        }

        setSubmitting(true);
        try {
            await assignItAsset(selectedAsset.id, selectedCollab.type, selectedCollab.value);
            toast({
                title: "Activo asignado",
                description: "La asignación ha sido guardada en el historial."
            });
            setShowAssignModal(false);
            loadAllData();
            handleLoadAssetDetails(selectedAsset.id);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al asignar",
                description: error.message || "Ocurrió un error."
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleReturnAsset = async (asset: any) => {
        if (!confirm(`¿Registrar la devolución de este activo?`)) return;
        try {
            await returnItAsset(asset.id);
            toast({
                title: "Activo devuelto",
                description: "El equipo ahora está marcado como disponible (sin asignación activa)."
            });
            loadAllData();
            if (selectedAsset && selectedAsset.id === asset.id) {
                handleLoadAssetDetails(asset.id);
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al devolver",
                description: error.message
            });
        }
    };

    // Accessories/Components
    const handleAddComponent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComponent.component_name.trim()) return;

        try {
            await addItAssetComponent({
                parent_asset_id: selectedAsset.id,
                ...newComponent
            });
            toast({
                title: "Accesorio agregado",
                description: "El periférico ha sido vinculado al equipo principal."
            });
            setNewComponent({ component_name: '', brand: '', model: '', serial_number: '' });
            handleLoadAssetDetails(selectedAsset.id);
            loadAllData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al agregar componente",
                description: error.message
            });
        }
    };

    const handleRemoveComponent = async (id: number) => {
        if (!confirm("¿Desea desvincular este accesorio?")) return;
        try {
            await removeItAssetComponent(id);
            toast({
                title: "Accesorio removido",
                description: "Se eliminó el periférico del equipo."
            });
            handleLoadAssetDetails(selectedAsset.id);
            loadAllData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al eliminar componente",
                description: error.message
            });
        }
    };

    // Licenses assignments
    const handleAddLicense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLicense.license_catalog_id) return;

        try {
            await addItAssetLicense({
                asset_id: selectedAsset.id,
                license_catalog_id: Number(newLicense.license_catalog_id),
                license_key: newLicense.license_key,
                expiration_date: newLicense.expiration_date
            });
            toast({
                title: "Licencia asignada",
                description: "La licencia de software ha sido asociada correctamente."
            });
            setNewLicense({ license_catalog_id: '', license_key: '', expiration_date: '' });
            handleLoadAssetDetails(selectedAsset.id);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al vincular licencia",
                description: error.message
            });
        }
    };

    const handleRemoveLicense = async (id: number) => {
        if (!confirm("¿Desvincular esta licencia del equipo?")) return;
        try {
            await removeItAssetLicense(id);
            toast({
                title: "Licencia removida",
                description: "Se desasoció la licencia de este equipo."
            });
            handleLoadAssetDetails(selectedAsset.id);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al remover licencia",
                description: error.message
            });
        }
    };

    // Filters and statistics computations
    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            const matchesSearch = searchTerm === '' ||
                `${asset.brand} ${asset.model}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                asset.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (asset.employee_name && asset.employee_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (asset.user_name && asset.user_name.toLowerCase().includes(searchTerm.toLowerCase()));

            const matchesCategory = filterCategory === 'all' || asset.category === filterCategory;
            const matchesBranch = filterBranch === 'all' || asset.branch_id === Number(filterBranch);
            const matchesStatus = filterStatus === 'all' || asset.status === filterStatus;

            return matchesSearch && matchesCategory && matchesBranch && matchesStatus;
        });
    }, [assets, searchTerm, filterCategory, filterBranch, filterStatus]);

    const stats = useMemo(() => {
        let active = 0, repair = 0, retired = 0, eol = 0;
        let totalCostCRC = 0;

        assets.forEach(a => {
            if (a.status === 'active') active++;
            else if (a.status === 'repair') repair++;
            else if (a.status === 'retired') retired++;
            else if (a.status === 'eol') eol++;

            if (a.purchase_cost) {
                // If it is in CRC, use cost directly. If in USD, convert using exchange_rate of the asset
                if (a.currency === 'USD') {
                    const rate = a.exchange_rate || exchangeRateData?.rate || 1.0;
                    totalCostCRC += a.purchase_cost * rate;
                } else {
                    totalCostCRC += a.purchase_cost;
                }
            }
        });

        const usdRate = exchangeRateData?.rate || 1.0;

        return {
            total: assets.length,
            active,
            repair,
            retired,
            eol,
            totalCostCRC,
            totalCostUSD: totalCostCRC / usdRate
        };
    }, [assets, exchangeRateData]);

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground text-sm font-medium">Cargando inventario de TI (ITAM)...</span>
            </div>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Inventario de TI (ITAM)</h1>
                    <p className="text-muted-foreground mt-1">Gestión centralizada de infraestructura, computadoras, accesorios y licencias.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => {
                        setAssetForm({
                            id: undefined,
                            item_id: '',
                            category: categories[0] || 'Laptop',
                            brand: '',
                            model: '',
                            serial_number: '',
                            status: 'active',
                            purchase_date: '',
                            purchase_cost: '',
                            currency: 'CRC',
                            exchange_rate: exchangeRateData?.rate || 1.0,
                            warranty_expiration: '',
                            branch_id: branches.length > 0 ? branches[0].id : '',
                            notes: '',
                            imei: '',
                            phone_number: '',
                            telephony_provider: '',
                            data_plan_start: '',
                            data_plan_end: '',
                            data_plan_renewal: 'monthly'
                        });
                        setShowAssetForm(true);
                    }}>
                        <Plus className="h-4 w-4 mr-2" /> Registrar Activo
                    </Button>
                </div>
            </div>

            {/* HR Alert banners */}
            {hrAlerts.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-sm space-y-3">
                    <div className="flex items-start">
                        <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                            <h3 className="font-bold text-amber-800 dark:text-amber-300 text-sm">Alerta de Personal Inactivo con Equipos Asignados</h3>
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                Se detectaron {hrAlerts.length} colaborador(es) que han sido dados de baja (Inactivos en planilla) pero conservan activos de TI asignados:
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-2 max-h-40 overflow-y-auto pl-8">
                        {hrAlerts.map((alert) => (
                            <div key={alert.assignment_id} className="flex flex-wrap items-center justify-between text-xs bg-background/50 p-2.5 rounded border border-amber-200/50 gap-2">
                                <div>
                                    <span className="font-semibold text-foreground">{alert.employee_name}</span> 
                                    <span className="text-muted-foreground"> (Cód: {alert.employee_code})</span>
                                    <span className="mx-1.5">•</span>
                                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{alert.category} {alert.brand} {alert.model}</span>
                                    <span className="text-muted-foreground"> (Serie: {alert.serial_number})</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs text-amber-700 hover:text-amber-800" onClick={() => handleReturnAsset(alert)}>
                                        <Undo2 className="h-3 w-3 mr-1" /> Devolver a Bodega
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs text-muted-foreground" onClick={() => handleOpenAssignModal(alert)}>
                                        Reasignar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="p-4 flex flex-col justify-between">
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Total Equipos</span>
                    <span className="text-2xl font-bold mt-1">{stats.total}</span>
                </Card>
                <Card className="p-4 flex flex-col justify-between border-green-500/20 bg-green-500/[0.02]">
                    <span className="text-xs text-green-600 dark:text-green-400 font-semibold uppercase">Activos / Disponibles</span>
                    <span className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{stats.active}</span>
                </Card>
                <Card className="p-4 flex flex-col justify-between border-amber-500/20 bg-amber-500/[0.02]">
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase">En Reparación</span>
                    <span className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{stats.repair}</span>
                </Card>
                <Card className="p-4 flex flex-col justify-between border-red-500/20 bg-red-500/[0.02]">
                    <span className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase">EOL / Obsoletos</span>
                    <span className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{stats.eol}</span>
                </Card>
                <Card className="p-4 flex flex-col justify-between col-span-2 md:col-span-1">
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Valor Inventario</span>
                    <div className="mt-1">
                        <span className="text-sm font-bold block">₡{stats.totalCostCRC.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</span>
                        <span className="text-xs text-muted-foreground">${stats.totalCostUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</span>
                    </div>
                </Card>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-muted/40 p-4 rounded-xl">
                <div className="relative w-full md:max-w-md">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por marca, modelo, serie o responsable..."
                        className="pl-9 bg-background"
                    />
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="bg-background border rounded px-3 py-1.5 text-xs font-semibold"
                    >
                        <option value="all">Todas las Categorías</option>
                        {categories.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>

                    <select
                        value={filterBranch}
                        onChange={(e) => setFilterBranch(e.target.value)}
                        className="bg-background border rounded px-3 py-1.5 text-xs font-semibold"
                    >
                        <option value="all">Todas las Sedes</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>

                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-background border rounded px-3 py-1.5 text-xs font-semibold"
                    >
                        <option value="all">Todos los Estados</option>
                        <option value="active">Activo</option>
                        <option value="repair">En Soporte / Taller</option>
                        <option value="retired">Retirado</option>
                        <option value="eol">EOL / Desecho</option>
                    </select>
                </div>
            </div>

            {/* Layout content catalog and details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Assets table */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50 text-xs font-bold uppercase text-muted-foreground">
                                        <th className="p-4">Categoría / Equipo</th>
                                        <th className="p-4">Serie</th>
                                        <th className="p-4">Sede</th>
                                        <th className="p-4">Asignado a</th>
                                        <th className="p-4">Estado</th>
                                        <th className="p-4 text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredAssets.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                                No se encontraron activos con los filtros aplicados.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAssets.map((asset) => {
                                            const assignee = (asset.user_name && asset.employee_name)
                                                ? `${asset.employee_name} (Usuario: ${asset.user_name})`
                                                : (asset.assignee_type === 'system_user' ? asset.user_name : asset.employee_name);
                                            const isAlert = asset.assignee_type === 'payroll_employee' && asset.employee_status === 'N';

                                            return (
                                                <tr
                                                    key={asset.id}
                                                    onClick={() => handleLoadAssetDetails(asset.id)}
                                                    className={`hover:bg-muted/30 cursor-pointer transition ${
                                                        selectedAsset?.id === asset.id ? 'bg-muted/60' : ''
                                                    } ${isAlert ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''}`}
                                                >
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                                                {['celular', 'móvil', 'movil', 'tablet', 'phone', 'smartphone'].includes(asset.category?.toLowerCase()) ? (
                                                                    <Smartphone className="h-4 w-4" />
                                                                ) : (
                                                                    <Laptop className="h-4 w-4" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-foreground block">{asset.brand} {asset.model}</span>
                                                                <span className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                                                                    <span>{asset.category}</span>
                                                                    {asset.phone_number && (
                                                                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono bg-indigo-50 dark:bg-indigo-950/40 px-1 py-0.2 rounded">
                                                                            {asset.phone_number}
                                                                        </span>
                                                                    )}
                                                                    {asset.data_plan_end && (() => {
                                                                        const isExpired = new Date(asset.data_plan_end) < new Date();
                                                                        const diffDays = Math.ceil((new Date(asset.data_plan_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                                                        const isClose = diffDays <= 30 && diffDays >= 0;
                                                                        if (isExpired) {
                                                                            return (
                                                                                <span className="text-[9px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded font-bold animate-pulse">
                                                                                    Plan Vencido
                                                                                </span>
                                                                            );
                                                                        } else if (isClose) {
                                                                            return (
                                                                                <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                                                                                    Plan vence en {diffDays}d
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 font-mono text-xs">{asset.serial_number}</td>
                                                    <td className="p-4">
                                                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium text-muted-foreground">
                                                            {asset.branch_code || 'S-01'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4">
                                                        {assignee ? (
                                                            <div className="flex flex-col">
                                                                <span className={`font-semibold text-xs ${isAlert ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}`}>
                                                                    {assignee}
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {asset.assignee_type === 'system_user' ? 'Sistema' : 'Planilla'}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Disponible</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                            asset.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                            asset.status === 'repair' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                                                            'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                        }`}>
                                                            {asset.status === 'active' ? 'Activo' :
                                                             asset.status === 'repair' ? 'Soporte' :
                                                             asset.status === 'retired' ? 'Retirado' : 'EOL'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => handleEditAsset(asset)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            {assignee ? (
                                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600" onClick={() => handleReturnAsset(asset)}>
                                                                    <Undo2 className="h-4 w-4" />
                                                                </Button>
                                                            ) : (
                                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleOpenAssignModal(asset)}>
                                                                    <UserCheck className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </div>

                {/* Details pane */}
                <div className="lg:col-span-1">
                    {loadingDetails ? (
                        <Card className="flex items-center justify-center p-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
                            <span className="text-sm text-muted-foreground">Cargando detalles...</span>
                        </Card>
                    ) : selectedAsset ? (
                        <Card className="shadow-lg border-primary/20 sticky top-4">
                            <CardHeader className="pb-4 border-b">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-bold">{selectedAsset.brand} {selectedAsset.model}</CardTitle>
                                        <CardDescription>{selectedAsset.category} • Serie {selectedAsset.serial_number}</CardDescription>
                                    </div>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedAsset(null)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-5 space-y-6 text-sm">
                                {/* Assignment section */}
                                <div className="bg-muted/40 p-3.5 rounded-lg border">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Responsable Actual</h4>
                                        {!selectedAsset.assignments?.[0] || selectedAsset.assignments[0].returned_date ? (
                                            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => handleOpenAssignModal(selectedAsset)}>
                                                Asignar
                                            </Button>
                                        ) : (
                                            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs text-red-600 border-red-200" onClick={() => handleReturnAsset(selectedAsset)}>
                                                Devolver
                                            </Button>
                                        )}
                                    </div>
                                    {selectedAsset.assignments?.[0] && !selectedAsset.assignments[0].returned_date ? (
                                        <div className="space-y-1">
                                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                                                <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                                                {selectedAsset.assignments[0].user_name && selectedAsset.assignments[0].employee_name
                                                    ? `${selectedAsset.assignments[0].employee_name} (Usuario: ${selectedAsset.assignments[0].user_name})`
                                                    : (selectedAsset.assignments[0].assignee_type === 'system_user' ? selectedAsset.assignments[0].user_name : selectedAsset.assignments[0].employee_name)
                                                }
                                            </div>
                                            <div className="text-xs text-muted-foreground pl-5">
                                                Asignado el {selectedAsset.assignments[0].assigned_date ? new Date(selectedAsset.assignments[0].assigned_date).toLocaleDateString() : ''} por {selectedAsset.assignments[0].assigned_by}
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-green-600 dark:text-green-400 font-semibold flex items-center gap-1.5">
                                            <CheckCircle className="h-4 w-4" /> Disponible en bodega
                                        </span>
                                    )}
                                </div>

                                {/* Financial catalog & specs */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-xs font-semibold text-muted-foreground block">Sede / Ubicación</span>
                                        <span className="font-semibold block mt-0.5">{selectedAsset.branch_name} ({selectedAsset.branch_code})</span>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-muted-foreground block">Costo de Adquisición</span>
                                        <span className="font-semibold block mt-0.5">
                                            {selectedAsset.currency === 'USD' ? `$${selectedAsset.purchase_cost}` : `₡${selectedAsset.purchase_cost?.toLocaleString()}`}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-muted-foreground block">Fecha de Compra</span>
                                        <span className="font-semibold block mt-0.5">{selectedAsset.purchase_date ? new Date(selectedAsset.purchase_date).toLocaleDateString() : 'N/A'}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-muted-foreground block">Vencimiento Garantía</span>
                                        <span className={`font-semibold block mt-0.5 ${
                                            selectedAsset.warranty_expiration && new Date(selectedAsset.warranty_expiration) < new Date() ? 'text-red-500 font-bold' : ''
                                        }`}>
                                            {selectedAsset.warranty_expiration ? new Date(selectedAsset.warranty_expiration).toLocaleDateString() : 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                {/* Mobile data and carrier plan info */}
                                {(selectedAsset.imei || selectedAsset.phone_number || selectedAsset.telephony_provider || ['celular', 'móvil', 'movil', 'tablet', 'phone', 'smartphone'].includes(selectedAsset.category?.toLowerCase())) && (
                                    <div className="border-t pt-4 space-y-3">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                                            <Smartphone className="h-3.5 w-3.5 text-blue-500" /> Dispositivo Móvil & Plan
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 bg-blue-50/10 dark:bg-blue-950/5 p-3 rounded-lg border border-blue-100/50 dark:border-blue-900/30 text-xs">
                                            <div>
                                                <span className="text-[10px] font-semibold text-muted-foreground block">IMEI</span>
                                                <span className="font-medium block mt-0.5">{selectedAsset.imei || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-muted-foreground block">Número Asociado</span>
                                                <span className="font-medium block mt-0.5">{selectedAsset.phone_number || 'N/A'}</span>
                                            </div>
                                            <div className="col-span-2 grid grid-cols-2 gap-2 mt-1 border-t pt-2 border-dashed">
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Operadora / Proveedor</span>
                                                    <span className="font-medium block mt-0.5">{selectedAsset.telephony_provider || 'N/A'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Renovación de Plan</span>
                                                    <span className="font-medium block mt-0.5 capitalize">
                                                        {selectedAsset.data_plan_renewal === 'annual' ? 'Anual' : selectedAsset.data_plan_renewal === 'monthly' ? 'Mensual' : 'N/A'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="col-span-2 grid grid-cols-2 gap-2 mt-1 border-t pt-2 border-dashed">
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Inicio del Plan</span>
                                                    <span className="font-medium block mt-0.5">
                                                        {selectedAsset.data_plan_start ? new Date(selectedAsset.data_plan_start).toLocaleDateString() : 'N/A'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Vencimiento del Plan</span>
                                                    <span className={`font-semibold block mt-0.5 ${
                                                        selectedAsset.data_plan_end && new Date(selectedAsset.data_plan_end) < new Date() ? 'text-red-500 font-bold' : ''
                                                    }`}>
                                                        {selectedAsset.data_plan_end ? new Date(selectedAsset.data_plan_end).toLocaleDateString() : 'N/A'}
                                                        {selectedAsset.data_plan_end && new Date(selectedAsset.data_plan_end) < new Date() && ' (Vencido)'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Components linked */}
                                <div className="border-t pt-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Accesorios y Periféricos ({selectedAsset.components?.length || 0})</h4>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowComponentsModal(true)}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="space-y-1.5">
                                        {selectedAsset.components?.length === 0 ? (
                                            <span className="text-xs text-muted-foreground italic">Sin accesorios agregados.</span>
                                        ) : (
                                            selectedAsset.components.map((c: any) => (
                                                <div key={c.id} className="flex items-center justify-between text-xs bg-muted/60 px-2 py-1.5 rounded">
                                                    <span>{c.component_name} {c.brand ? `(${c.brand})` : ''} - Serie: {c.serial_number || 'N/A'}</span>
                                                    <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500" onClick={() => handleRemoveComponent(c.id)}>
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Software licenses */}
                                <div className="border-t pt-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Licencias de Software ({selectedAsset.licenses?.length || 0})</h4>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowLicensesModal(true)}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="space-y-1.5">
                                        {selectedAsset.licenses?.length === 0 ? (
                                            <span className="text-xs text-muted-foreground italic">Sin licencias vinculadas.</span>
                                        ) : (
                                            selectedAsset.licenses.map((l: any) => (
                                                <div key={l.id} className="flex items-center justify-between text-xs bg-muted/60 px-2 py-1.5 rounded">
                                                    <div>
                                                        <span className="font-semibold">{l.license_name}</span>
                                                        {l.license_key && <span className="block text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">Clave: {l.license_key}</span>}
                                                    </div>
                                                    <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500" onClick={() => handleRemoveLicense(l.id)}>
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Historial de Tickets */}
                                <div className="border-t pt-4 space-y-2">
                                    <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Historial de Soporte ({selectedAsset.tickets?.length || 0})</h4>
                                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                                        {selectedAsset.tickets?.length === 0 ? (
                                            <span className="text-xs text-muted-foreground italic">Sin tickets de soporte registrados.</span>
                                        ) : (
                                            selectedAsset.tickets.map((t: any) => (
                                                <div key={t.id} className="flex flex-col gap-1 text-xs bg-muted/60 p-2 rounded border border-muted-foreground/10">
                                                    <div className="flex items-center justify-between font-bold">
                                                        <span className="text-blue-600 font-mono">{t.consecutive}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-extrabold ${
                                                            t.status === 'open' ? 'bg-slate-100 text-slate-800' :
                                                            t.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                                            t.status === 'on_hold' ? 'bg-amber-100 text-amber-800' :
                                                            t.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                                                            'bg-red-100 text-red-800'
                                                        }`}>
                                                            {t.status === 'open' ? 'Abierto' :
                                                             t.status === 'in_progress' ? 'Progreso' :
                                                             t.status === 'on_hold' ? 'Espera' :
                                                             t.status === 'completed' ? 'Cerrado' : 'Cancelado'}
                                                        </span>
                                                    </div>
                                                    <p className="font-semibold text-slate-700 dark:text-slate-300 truncate">{t.subject}</p>
                                                    <span className="text-[10px] text-muted-foreground">Creado el {new Date(t.created_at).toLocaleDateString()} por {t.created_by}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="border-t pt-4 flex gap-2 justify-end">
                                    <Button variant="outline" size="sm" onClick={() => handleEditAsset(selectedAsset)}>
                                        Editar Ficha
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleDeleteAsset(selectedAsset.id)}>
                                        Eliminar
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border-dashed">
                            <Info className="h-8 w-8 mb-2" />
                            <h3 className="font-semibold text-sm">Ficha del Activo</h3>
                            <p className="text-xs mt-1 max-w-[200px]">Seleccione un activo de la tabla para ver componentes, licencias e historial de asignaciones.</p>
                        </Card>
                    )}
                </div>
            </div>

            {/* Asset registration / edit modal */}
            {showAssetForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        <CardHeader>
                            <CardTitle>{assetForm.id ? 'Modificar Activo' : 'Registrar Nuevo Activo de TI'}</CardTitle>
                            <CardDescription>Ingrese las características físicas y comerciales del activo.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSaveAsset} className="space-y-4">
                                <div className="space-y-1.5 border-b pb-3 mb-2">
                                    <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block">Vincular a Producto del Inventario de TI (Opcional)</label>
                                    <select
                                        value={assetForm.item_id || ''}
                                        onChange={(e) => {
                                            const itemId = e.target.value;
                                            if (itemId) {
                                                const matched = tiInventoryItems.find(item => item.id === itemId);
                                                if (matched) {
                                                    setAssetForm((prev: any) => ({
                                                        ...prev,
                                                        item_id: itemId,
                                                        brand: matched.brand || prev.brand,
                                                        model: matched.model || prev.model,
                                                        serial_number: matched.serial_number || prev.serial_number,
                                                        notes: `${matched.name} ${matched.part_number ? `(Parte: ${matched.part_number})` : ''}`
                                                    }));
                                                }
                                            } else {
                                                setAssetForm((prev: any) => ({ ...prev, item_id: '' }));
                                            }
                                        }}
                                        className="w-full bg-background border rounded px-3 py-2 text-sm font-semibold border-indigo-200"
                                    >
                                        <option value="">-- No vincular a producto físico --</option>
                                        {tiInventoryItems.map(item => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} {item.brand ? `[${item.brand}]` : ''} - Cant. Disponible: {item.quantity} {item.unit}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="text-[10px] text-muted-foreground block">
                                        Vincular a un equipo existente en el Inventario de TI para asegurar trazabilidad. Auto-completa marca, modelo y serie.
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Categoría</label>
                                        <select
                                            value={assetForm.category}
                                            onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}
                                            className="w-full bg-background border rounded px-3 py-2 text-sm"
                                        >
                                            {categories.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Sede / Sucursal</label>
                                        <select
                                            value={assetForm.branch_id}
                                            onChange={(e) => setAssetForm({ ...assetForm, branch_id: Number(e.target.value) })}
                                            className="w-full bg-background border rounded px-3 py-2 text-sm"
                                        >
                                            {branches.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Marca</label>
                                        <Input
                                            value={assetForm.brand}
                                            onChange={(e) => setAssetForm({ ...assetForm, brand: e.target.value })}
                                            placeholder="Ej: HP, Dell, Cisco"
                                            maxLength={50}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Modelo</label>
                                        <Input
                                            value={assetForm.model}
                                            onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })}
                                            placeholder="Ej: ProBook 450, EliteDisplay"
                                            maxLength={50}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Número de Serie (Único)</label>
                                        <Input
                                            value={assetForm.serial_number}
                                            onChange={(e) => setAssetForm({ ...assetForm, serial_number: e.target.value })}
                                            placeholder="Código de fábrica"
                                            maxLength={50}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Estado Operativo</label>
                                        <select
                                            value={assetForm.status}
                                            onChange={(e) => setAssetForm({ ...assetForm, status: e.target.value })}
                                            className="w-full bg-background border rounded px-3 py-2 text-sm"
                                        >
                                            <option value="active">Activo / Disponible</option>
                                            <option value="repair">En Reparación</option>
                                            <option value="retired">Retirado</option>
                                            <option value="eol">EOL / Desecho</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4 border p-3 rounded-lg bg-muted/30">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Moneda</label>
                                        <select
                                            value={assetForm.currency}
                                            onChange={(e) => setAssetForm({ ...assetForm, currency: e.target.value })}
                                            className="w-full bg-background border rounded px-3 py-2 text-sm"
                                        >
                                            <option value="CRC">Colones (₡)</option>
                                            <option value="USD">Dólares ($)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Costo Compra</label>
                                        <Input
                                            type="number"
                                            value={assetForm.purchase_cost}
                                            onChange={(e) => setAssetForm({ ...assetForm, purchase_cost: e.target.value })}
                                            placeholder="Monto de adquisición"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">T. Cambio Ref.</label>
                                        <Input
                                            type="number"
                                            value={assetForm.exchange_rate}
                                            onChange={(e) => setAssetForm({ ...assetForm, exchange_rate: e.target.value })}
                                            placeholder="Ej: 520"
                                            disabled={assetForm.currency === 'USD'}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Fecha de Compra</label>
                                        <Input
                                            type="date"
                                            value={assetForm.purchase_date}
                                            onChange={(e) => setAssetForm({ ...assetForm, purchase_date: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Fecha Vence Garantía</label>
                                        <Input
                                            type="date"
                                            value={assetForm.warranty_expiration}
                                            onChange={(e) => setAssetForm({ ...assetForm, warranty_expiration: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {(() => {
                                    const isMobileCategory = ['celular', 'móvil', 'movil', 'tablet', 'phone', 'smartphone', 'dispositivo movil', 'dispositivo móvil'].includes(assetForm.category?.toLowerCase());
                                    const showMobileFields = isMobileCategory || assetForm.imei || assetForm.phone_number;
                                    if (!showMobileFields) return null;
                                    return (
                                        <div className="border border-indigo-100 dark:border-indigo-900/40 p-4 rounded-lg bg-indigo-50/10 dark:bg-indigo-950/5 space-y-4">
                                            <div className="flex items-center gap-2 border-b border-indigo-100 dark:border-indigo-900/40 pb-2">
                                                <Smartphone className="h-4 w-4 text-indigo-500" />
                                                <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                                                    Datos del Dispositivo Móvil & Plan
                                                </h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-muted-foreground">IMEI (Código Único)</label>
                                                    <Input
                                                        value={assetForm.imei || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, imei: e.target.value })}
                                                        placeholder="Ej: 861234567890123"
                                                        maxLength={50}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-muted-foreground">Número de Teléfono</label>
                                                    <Input
                                                        value={assetForm.phone_number || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, phone_number: e.target.value })}
                                                        placeholder="Ej: 8888-8888"
                                                        maxLength={30}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="space-y-1.5 col-span-2">
                                                    <label className="text-xs font-semibold text-muted-foreground">Operadora / Proveedor</label>
                                                    <Input
                                                        value={assetForm.telephony_provider || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, telephony_provider: e.target.value })}
                                                        placeholder="Ej: Liberty, Kölbi, Claro"
                                                        maxLength={50}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-muted-foreground">Renovación de Plan</label>
                                                    <select
                                                        value={assetForm.data_plan_renewal || 'monthly'}
                                                        onChange={(e) => setAssetForm({ ...assetForm, data_plan_renewal: e.target.value })}
                                                        className="w-full bg-background border rounded px-3 py-2 text-sm"
                                                    >
                                                        <option value="monthly">Mensual</option>
                                                        <option value="annual">Anual</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-muted-foreground">Inicio del Plan</label>
                                                    <Input
                                                        type="date"
                                                        value={assetForm.data_plan_start || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, data_plan_start: e.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-muted-foreground">Vencimiento del Plan</label>
                                                    <Input
                                                        type="date"
                                                        value={assetForm.data_plan_end || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, data_plan_end: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">Notas / Especificaciones</label>
                                    <Textarea
                                        value={assetForm.notes}
                                        onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
                                        placeholder="Características técnicas, RAM, almacenamiento, etc."
                                        rows={3}
                                    />
                                </div>

                                <div className="flex gap-2 justify-end pt-4 border-t">
                                    <Button type="button" variant="ghost" onClick={() => setShowAssetForm(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={submitting}>
                                        {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                                        Guardar
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Assignment modal */}
            {showAssignModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-md shadow-2xl">
                        <CardHeader>
                            <CardTitle>Asignar Activo de TI</CardTitle>
                            <CardDescription>
                                Vincule el activo a un usuario del sistema o colaborador de planilla.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAssignAsset} className="space-y-4">
                                <div className="bg-muted p-2.5 rounded border mb-2 text-xs">
                                    <span className="font-semibold block">Equipo seleccionado:</span>
                                    <span className="text-muted-foreground">{selectedAsset.brand} {selectedAsset.model} (Serie: {selectedAsset.serial_number})</span>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">Seleccionar Colaborador</label>
                                    <select
                                        value={assignmentForm.collaboratorId}
                                        onChange={(e) => setAssignmentForm({ ...assignmentForm, collaboratorId: e.target.value })}
                                        className="w-full bg-background border rounded px-3 py-2 text-sm"
                                        required
                                    >
                                        <option value="">Seleccione...</option>
                                        {unifiedCollaborators.map(c => (
                                            <option key={c.id} value={c.id} disabled={!c.active}>
                                                {c.name} ({c.detail}){!c.active ? ' [INACTIVO]' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex gap-2 justify-end pt-4 border-t">
                                    <Button type="button" variant="ghost" onClick={() => setShowAssignModal(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={submitting}>
                                        {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                                        Asignar
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Components modal */}
            {showComponentsModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-lg shadow-2xl">
                        <CardHeader>
                            <CardTitle>Accesorios y Periféricos</CardTitle>
                            <CardDescription>Vincule cargadores, monitores, o expansiones al equipo.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <form onSubmit={handleAddComponent} className="space-y-3 p-3 bg-muted/40 rounded-lg border">
                                <span className="text-xs font-bold block">Agregar Accesorio</span>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        placeholder="Nombre (ej: Cargador HP, Pantalla)"
                                        value={newComponent.component_name}
                                        onChange={(e) => setNewComponent({ ...newComponent, component_name: e.target.value })}
                                        required
                                    />
                                    <Input
                                        placeholder="Número de Serie"
                                        value={newComponent.serial_number}
                                        onChange={(e) => setNewComponent({ ...newComponent, serial_number: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        placeholder="Marca"
                                        value={newComponent.brand}
                                        onChange={(e) => setNewComponent({ ...newComponent, brand: e.target.value })}
                                    />
                                    <Input
                                        placeholder="Modelo"
                                        value={newComponent.model}
                                        onChange={(e) => setNewComponent({ ...newComponent, model: e.target.value })}
                                    />
                                </div>
                                <Button type="submit" size="sm" className="w-full">
                                    Vincular Accesorio
                                </Button>
                            </form>

                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Vinculados actualmente</span>
                                {selectedAsset.components?.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">No hay accesorios.</p>
                                ) : (
                                    selectedAsset.components?.map((c: any) => (
                                        <div key={c.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                                            <div>
                                                <span className="font-bold">{c.component_name}</span> 
                                                {c.brand && <span className="text-muted-foreground"> ({c.brand} {c.model})</span>}
                                                {c.serial_number && <span className="block text-[10px] text-muted-foreground font-mono">S/N: {c.serial_number}</span>}
                                            </div>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => handleRemoveComponent(c.id)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex justify-end border-t pt-3">
                                <Button type="button" variant="outline" size="sm" onClick={() => setShowComponentsModal(false)}>
                                    Cerrar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Licenses modal */}
            {showLicensesModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-lg shadow-2xl">
                        <CardHeader>
                            <CardTitle>Licencias de Software</CardTitle>
                            <CardDescription>Asocie claves y plazos de software al equipo.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <form onSubmit={handleAddLicense} className="space-y-3 p-3 bg-muted/40 rounded-lg border">
                                <span className="text-xs font-bold block">Vincular Nueva Licencia</span>
                                <div className="space-y-2">
                                    <select
                                        value={newLicense.license_catalog_id}
                                        onChange={(e) => setNewLicense({ ...newLicense, license_catalog_id: e.target.value })}
                                        className="w-full bg-background border rounded px-3 py-2 text-sm"
                                        required
                                    >
                                        <option value="">Seleccione Software...</option>
                                        {licensesCatalog.map(lic => (
                                            <option key={lic.id} value={lic.id}>{lic.name}</option>
                                        ))}
                                    </select>

                                    <Input
                                        placeholder="Clave de Licencia (Key)"
                                        value={newLicense.license_key}
                                        onChange={(e) => setNewLicense({ ...newLicense, license_key: e.target.value })}
                                    />

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-muted-foreground uppercase">Fecha de Expiración</label>
                                        <Input
                                            type="date"
                                            value={newLicense.expiration_date}
                                            onChange={(e) => setNewLicense({ ...newLicense, expiration_date: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <Button type="submit" size="sm" className="w-full">
                                    Asignar Licencia
                                </Button>
                            </form>

                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Licencias asignadas</span>
                                {selectedAsset.licenses?.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">No hay licencias asignadas.</p>
                                ) : (
                                    selectedAsset.licenses?.map((l: any) => (
                                        <div key={l.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                                            <div>
                                                <span className="font-bold">{l.license_name}</span>
                                                {l.license_key && <span className="block text-[10px] text-muted-foreground font-mono">Key: {l.license_key}</span>}
                                                {l.expiration_date && <span className="block text-[10px] text-red-500 font-semibold">Vence: {new Date(l.expiration_date).toLocaleDateString()}</span>}
                                            </div>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => handleRemoveLicense(l.id)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex justify-end border-t pt-3">
                                <Button type="button" variant="outline" size="sm" onClick={() => setShowLicensesModal(false)}>
                                    Cerrar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </main>
    );
}
