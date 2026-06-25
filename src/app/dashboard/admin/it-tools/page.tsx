'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { 
    getItBranches, 
    saveItBranch, 
    deleteItBranch, 
    getItLicensesCatalog, 
    saveItLicenseCatalog, 
    deleteItLicenseCatalog,
    getItAssetCategories,
    saveItAssetCategories
} from '@/modules/it-tools/lib/actions';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
    MapPin, 
    Tag, 
    Plus, 
    Pencil, 
    Trash2, 
    Loader2, 
    Check, 
    X,
    FileLock
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function ItToolsAdminPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized } = useAuthorization();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<'branches' | 'licenses' | 'categories'>('branches');

    // Loading & state
    const [loading, setLoading] = useState(true);
    const [branches, setBranches] = useState<any[]>([]);
    const [licenses, setLicenses] = useState<any[]>([]);
    const [categories, setCategories] = useState<string[]>([]);

    // Form states
    const [branchId, setBranchId] = useState<number | undefined>(undefined);
    const [branchName, setBranchName] = useState('');
    const [branchCode, setBranchCode] = useState('');
    const [branchActive, setBranchActive] = useState(true);
    const [showBranchForm, setShowBranchForm] = useState(false);

    const [licenseId, setLicenseId] = useState<number | undefined>(undefined);
    const [licenseName, setLicenseName] = useState('');
    const [licenseDescription, setLicenseDescription] = useState('');
    const [showLicenseForm, setShowLicenseForm] = useState(false);

    const [saving, setSaving] = useState(false);
    const [newCategory, setNewCategory] = useState('');

    useEffect(() => {
        setTitle("Configuración de TI");
    }, [setTitle]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [branchesData, licensesData, categoriesData] = await Promise.all([
                getItBranches(),
                getItLicensesCatalog(),
                getItAssetCategories()
            ]);
            setBranches(branchesData);
            setLicenses(licensesData);
            setCategories(categoriesData);
        } catch (error) {
            console.error("Error loading IT admin catalogs", error);
            toast({
                variant: "destructive",
                title: "Error al cargar datos",
                description: "No se pudieron obtener las sucursales, el catálogo de licencias o las categorías."
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (isAuthorized) {
            loadData();
        }
    }, [isAuthorized, loadData]);

    // Branch operations
    const handleSaveBranch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!branchName.trim() || !branchCode.trim()) {
            toast({
                variant: "destructive",
                title: "Campos requeridos",
                description: "Por favor complete el nombre y código de la sucursal."
            });
            return;
        }

        setSaving(true);
        try {
            await saveItBranch({
                id: branchId,
                name: branchName,
                code: branchCode,
                is_active: branchActive ? 1 : 0
            });
            toast({
                title: "Sucursal guardada",
                description: "La sede ha sido registrada/actualizada exitosamente."
            });
            setBranchId(undefined);
            setBranchName('');
            setBranchCode('');
            setBranchActive(true);
            setShowBranchForm(false);
            loadData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al guardar sucursal",
                description: error.message || "Ocurrió un error inesperado."
            });
        } finally {
            setSaving(false);
        }
    };

    const handleEditBranch = (branch: any) => {
        setBranchId(branch.id);
        setBranchName(branch.name);
        setBranchCode(branch.code);
        setBranchActive(branch.is_active === 1);
        setShowBranchForm(true);
    };

    const handleDeleteBranch = async (id: number) => {
        if (!confirm("¿Está seguro de que desea eliminar esta sucursal? Esta acción podría fallar si la sucursal tiene activos asociados.")) return;
        try {
            await deleteItBranch(id);
            toast({
                title: "Sucursal eliminada",
                description: "La sede ha sido eliminada correctamente."
            });
            loadData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al eliminar sucursal",
                description: error.message || "Por favor, desasocie los activos vinculados a esta sede antes de eliminarla."
            });
        }
    };

    // License catalog operations
    const handleSaveLicense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!licenseName.trim()) {
            toast({
                variant: "destructive",
                title: "Campos requeridos",
                description: "Por favor complete el nombre de la licencia."
            });
            return;
        }

        setSaving(true);
        try {
            await saveItLicenseCatalog({
                id: licenseId,
                name: licenseName,
                description: licenseDescription
            });
            toast({
                title: "Licencia guardada",
                description: "El tipo de licencia ha sido guardado exitosamente."
            });
            setLicenseId(undefined);
            setLicenseName('');
            setLicenseDescription('');
            setShowLicenseForm(false);
            loadData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al guardar licencia",
                description: error.message || "Ocurrió un error inesperado."
            });
        } finally {
            setSaving(false);
        }
    };

    const handleEditLicense = (license: any) => {
        setLicenseId(license.id);
        setLicenseName(license.name);
        setLicenseDescription(license.description || '');
        setShowLicenseForm(true);
    };

    const handleDeleteLicense = async (id: number) => {
        if (!confirm("¿Está seguro de que desea eliminar este tipo de licencia? Se desasociará de todos los equipos.")) return;
        try {
            await deleteItLicenseCatalog(id);
            toast({
                title: "Licencia eliminada",
                description: "El tipo de licencia ha sido eliminado del catálogo."
            });
            loadData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al eliminar licencia",
                description: error.message || "Ocurrió un error inesperado."
            });
        }
    };

    const handleAddCategory = async () => {
        if (!newCategory.trim()) return;
        if (categories.includes(newCategory.trim())) {
            toast({
                variant: "destructive",
                title: "Categoría ya existe",
                description: "Esa categoría ya se encuentra registrada."
            });
            return;
        }
        setSaving(true);
        try {
            const updated = [...categories, newCategory.trim()];
            await saveItAssetCategories(updated);
            setCategories(updated);
            setNewCategory('');
            toast({
                title: "Categoría agregada",
                description: "La categoría se guardó exitosamente."
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al agregar categoría",
                description: error.message || "Ocurrió un error inesperado."
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteCategory = async (categoryToDelete: string) => {
        if (!confirm(`¿Está seguro de que desea eliminar la categoría "${categoryToDelete}"?`)) return;
        setSaving(true);
        try {
            const updated = categories.filter(c => c !== categoryToDelete);
            await saveItAssetCategories(updated);
            setCategories(updated);
            toast({
                title: "Categoría eliminada",
                description: "La categoría se eliminó exitosamente."
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al eliminar categoría",
                description: error.message || "Ocurrió un error inesperado."
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Cargando catálogos de TI...</span>
            </div>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Configuraciones de TI</h1>
                    <p className="text-muted-foreground mt-1">Administración de Sedes/Sucursales y Catálogo de Licencias de Software.</p>
                </div>

                <div className="flex gap-2 bg-muted p-1 rounded-lg self-start">
                    <button
                        onClick={() => setActiveTab('branches')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition ${
                            activeTab === 'branches' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <MapPin className="h-4 w-4" />
                        Sedes / Sucursales
                    </button>
                    <button
                        onClick={() => setActiveTab('licenses')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition ${
                            activeTab === 'licenses' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <FileLock className="h-4 w-4" />
                        Catálogo de Licencias
                    </button>
                    <button
                        onClick={() => setActiveTab('categories')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition ${
                            activeTab === 'categories' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Tag className="h-4 w-4" />
                        Categorías de Activos
                    </button>
                </div>
            </div>

            {activeTab === 'branches' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* List of branches */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold tracking-tight">Sedes Registradas</h2>
                            {!showBranchForm && (
                                <Button size="sm" onClick={() => {
                                    setBranchId(undefined);
                                    setBranchName('');
                                    setBranchCode('');
                                    setBranchActive(true);
                                    setShowBranchForm(true);
                                }}>
                                    <Plus className="h-4 w-4 mr-2" /> Nueva Sede
                                </Button>
                            )}
                        </div>

                        <Card>
                            <CardContent className="p-0">
                                <div className="divide-y">
                                    {branches.length === 0 ? (
                                        <div className="p-6 text-center text-muted-foreground">
                                            No hay sedes registradas. Cree una para comenzar.
                                        </div>
                                    ) : (
                                        branches.map((branch) => (
                                            <div key={branch.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm bg-muted px-2 py-0.5 rounded text-muted-foreground">
                                                            {branch.code}
                                                        </span>
                                                        <span className="font-semibold text-foreground">{branch.name}</span>
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                                            branch.is_active === 1 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                        }`}>
                                                            {branch.is_active === 1 ? 'Activa' : 'Inactiva'}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground mt-1 block">
                                                        Creado el: {new Date(branch.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => handleEditBranch(branch)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => handleDeleteBranch(branch.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Branch form */}
                    {showBranchForm && (
                        <Card className="self-start lg:col-span-1 shadow-lg border-primary/20">
                            <CardHeader>
                                <CardTitle>{branchId ? 'Editar Sede' : 'Nueva Sede'}</CardTitle>
                                <CardDescription>Ingrese los detalles de la sucursal u oficina.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSaveBranch} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Código de Sede (ej: S-01, OF-CEN)</label>
                                        <Input 
                                            value={branchCode} 
                                            onChange={(e) => setBranchCode(e.target.value.toUpperCase())} 
                                            placeholder="Código abreviado" 
                                            maxLength={10}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Nombre Comercial / Sucursal</label>
                                        <Input 
                                            value={branchName} 
                                            onChange={(e) => setBranchName(e.target.value)} 
                                            placeholder="Nombre de la sede" 
                                        />
                                    </div>
                                    <div className="flex items-center space-x-2 pt-2">
                                        <input 
                                            type="checkbox" 
                                            id="branchActive" 
                                            checked={branchActive} 
                                            onChange={(e) => setBranchActive(e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <label htmlFor="branchActive" className="text-sm font-medium text-foreground">Sede activa para asignación de equipos</label>
                                    </div>

                                    <div className="flex gap-2 justify-end pt-4 border-t">
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowBranchForm(false)}>
                                            Cancelar
                                        </Button>
                                        <Button type="submit" size="sm" disabled={saving}>
                                            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                                            Guardar
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {activeTab === 'licenses' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* List of licenses catalog */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold tracking-tight">Catálogo de Licencias</h2>
                            {!showLicenseForm && (
                                <Button size="sm" onClick={() => {
                                    setLicenseId(undefined);
                                    setLicenseName('');
                                    setLicenseDescription('');
                                    setShowLicenseForm(true);
                                }}>
                                    <Plus className="h-4 w-4 mr-2" /> Nueva Licencia
                                </Button>
                            )}
                        </div>

                        <Card>
                            <CardContent className="p-0">
                                <div className="divide-y">
                                    {licenses.length === 0 ? (
                                        <div className="p-6 text-center text-muted-foreground">
                                            No hay tipos de licencia definidos. Agregue una para comenzar.
                                        </div>
                                    ) : (
                                        licenses.map((lic) => (
                                            <div key={lic.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition">
                                                <div className="flex-1 mr-4">
                                                    <div className="flex items-center gap-2">
                                                        <Tag className="h-4 w-4 text-indigo-500" />
                                                        <span className="font-semibold text-foreground">{lic.name}</span>
                                                    </div>
                                                    {lic.description && (
                                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                            {lic.description}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => handleEditLicense(lic)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => handleDeleteLicense(lic.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* License Form */}
                    {showLicenseForm && (
                        <Card className="self-start lg:col-span-1 shadow-lg border-primary/20">
                            <CardHeader>
                                <CardTitle>{licenseId ? 'Editar Licencia' : 'Nueva Licencia'}</CardTitle>
                                <CardDescription>Defina el tipo de software que se podrá asociar a los equipos.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSaveLicense} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Nombre de Software / Licencia (ej: Microsoft 365, Adobe CC)</label>
                                        <Input 
                                            value={licenseName} 
                                            onChange={(e) => setLicenseName(e.target.value)} 
                                            placeholder="Nombre de software" 
                                            maxLength={100}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-muted-foreground">Descripción o Notas de licenciamiento</label>
                                        <Textarea 
                                            value={licenseDescription} 
                                            onChange={(e) => setLicenseDescription(e.target.value)} 
                                            placeholder="Detalles sobre renovación, soporte, etc." 
                                            rows={3}
                                        />
                                    </div>

                                    <div className="flex gap-2 justify-end pt-4 border-t">
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowLicenseForm(false)}>
                                            Cancelar
                                        </Button>
                                        <Button type="submit" size="sm" disabled={saving}>
                                            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                                            Guardar
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {activeTab === 'categories' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* List of categories */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold tracking-tight">Categorías de Activos</h2>
                            <div className="flex gap-2">
                                <Input 
                                    value={newCategory} 
                                    onChange={(e) => setNewCategory(e.target.value)} 
                                    placeholder="Nueva categoría (ej: Tablet, Impresora)" 
                                    className="max-w-xs"
                                />
                                <Button onClick={handleAddCategory} disabled={saving}>
                                    <Plus className="h-4 w-4 mr-2" /> Agregar
                                </Button>
                            </div>
                        </div>

                        <Card>
                            <CardContent className="p-0">
                                <div className="divide-y">
                                    {categories.length === 0 ? (
                                        <div className="p-6 text-center text-muted-foreground">
                                            No hay categorías registradas.
                                        </div>
                                    ) : (
                                        categories.map((category, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-4 hover:bg-muted/50 transition">
                                                <div className="flex items-center gap-2">
                                                    <Tag className="h-4 w-4 text-indigo-500" />
                                                    <span className="font-semibold text-foreground">{category}</span>
                                                </div>
                                                <Button 
                                                    size="icon" 
                                                    variant="ghost" 
                                                    className="h-8 w-8 text-red-500" 
                                                    onClick={() => handleDeleteCategory(category)}
                                                    disabled={saving}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </main>
    );
}
