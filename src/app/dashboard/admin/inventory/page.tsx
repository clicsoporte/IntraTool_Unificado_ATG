'use client';

import React, { useState, useEffect } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
    getDepartments, 
    getTicketSettings, 
    updateTicketSettings, 
    updateDepartmentName,
    getDepartmentTechnicians,
    setDepartmentTechnicians,
    getMaintenanceTypesByDept,
    addMaintenanceType,
    deleteMaintenanceType,
    updateMaintenanceTypeAssignee
} from '@/modules/inventory/lib/actions';
import { Wrench, Settings, Users, Save, Check, Plus, Trash2 } from 'lucide-react';

interface Department {
    id: number;
    name: string;
    description: string | null;
    is_active: number;
}

interface Technician {
    id: number;
    name: string;
    is_assigned: number;
}

export default function AdminInventorySettingsPage() {
    const { isAuthorized } = useAuthorization(['admin:settings:general']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();

    // States
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDeptId, setSelectedDeptId] = useState<number>(1);
    const [isLoading, setIsLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Edit forms state
    const [deptForm, setDeptForm] = useState({
        name: '',
        description: '',
        is_active: 1
    });

    const [settingsForm, setSettingsForm] = useState({
        prefix: '',
        nextNumber: 1
    });
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [selectedTechIds, setSelectedTechIds] = useState<number[]>([]);
    const [deptMaintTypes, setDeptMaintTypes] = useState<{ id: number; name: string; default_assignee_id?: number | null }[]>([]);
    const [newMaintTypeName, setNewMaintTypeName] = useState('');
    const [addingMaintType, setAddingMaintType] = useState(false);
    useEffect(() => {
        setTitle("Configuración de Inventarios y Tickets");
    }, [setTitle]);

    // Load static departments
    const loadDepartmentsData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const depts = await getDepartments();
            setDepartments(depts);
            if (depts.length > 0) {
                // Try to preserve selection if available
                const existing = depts.find((d: Department) => d.id === selectedDeptId);
                if (existing) {
                    setSelectedDeptId(existing.id);
                } else {
                    setSelectedDeptId(depts[0].id);
                }
            }
        } catch (err) {
            console.error("Error loading departments", err);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDeptId]);

    useEffect(() => {
        if (isAuthorized) {
            loadDepartmentsData();
        }
    }, [isAuthorized, loadDepartmentsData]);

    // Load settings and technicians when selectedDeptId changes
    useEffect(() => {
        if (!selectedDeptId || !isAuthorized) return;
        
        async function loadDeptSettings() {
            try {
                // 1. Load department details
                const current = departments.find(d => d.id === selectedDeptId);
                if (current) {
                    setDeptForm({
                        name: current.name,
                        description: current.description || '',
                        is_active: current.is_active
                    });
                }

                // 2. Load ticket settings
                const settings = await getTicketSettings(selectedDeptId);
                if (settings) {
                    setSettingsForm({
                        prefix: settings.ticket_prefix,
                        nextNumber: settings.next_ticket_number
                    });
                }
                // 3. Load eligible technicians mapping
                const techs = await getDepartmentTechnicians(selectedDeptId);
                setTechnicians(techs);
                setSelectedTechIds(techs.filter(t => t.is_assigned === 1).map(t => t.id));

                // 4. Load custom maintenance types
                const mTypes = await getMaintenanceTypesByDept(selectedDeptId);
                setDeptMaintTypes(mTypes);
            } catch (err) {
                console.error("Error loading department settings", err);
            }
        }
        loadDeptSettings();
    }, [selectedDeptId, departments, isAuthorized]);

    // Handle form submit for current department settings
    const handleSaveChanges = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validate ticket prefix format: only alphanumeric, '-' and '_' are allowed
        const prefixRegex = /^[A-Z0-9_-]+$/i;
        if (!prefixRegex.test(settingsForm.prefix)) {
            toast({
                title: "Prefijo Inválido",
                description: "El prefijo solo puede contener letras, números, guiones medios '-' y guiones bajos '_'. No se admiten espacios ni otros símbolos especiales.",
                variant: "destructive"
            });
            return;
        }

        setSaving(true);
        try {
            // 1. Save Department Name, Description and active status
            await updateDepartmentName(selectedDeptId, deptForm.name, deptForm.description, deptForm.is_active);

            // 2. Save Ticket Prefixes and Consecutive Settings
            await updateTicketSettings(selectedDeptId, settingsForm.prefix, settingsForm.nextNumber);

            // 3. Save Eligible Technicians
            await setDepartmentTechnicians(selectedDeptId, selectedTechIds);

            toast({
                title: "Cambios Guardados",
                description: `Configuraciones para la instancia [${deptForm.name}] guardadas correctamente.`
            });

            // Reload departments list to refresh UI select
            const depts = await getDepartments();
            setDepartments(depts);

        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Ocurrió un error al guardar los cambios.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };
    // Toggle technician selection
    const handleToggleTech = (techId: number) => {
        setSelectedTechIds(prev => 
            prev.includes(techId) 
                ? prev.filter(id => id !== techId)
                : [...prev, techId]
        );
    };

    const handleAddMaintType = async () => {
        if (!newMaintTypeName.trim()) return;
        setAddingMaintType(true);
        try {
            const res = await addMaintenanceType(selectedDeptId, newMaintTypeName.trim());
            if (res.success) {
                setNewMaintTypeName('');
                toast({
                    title: "Tipo Agregado",
                    description: "Se agregó el tipo de mantenimiento correctamente."
                });
                const updated = await getMaintenanceTypesByDept(selectedDeptId);
                setDeptMaintTypes(updated);
            } else {
                toast({
                    title: "Error",
                    description: res.error || "No se pudo agregar.",
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setAddingMaintType(false);
        }
    };

    const handleDeleteMaintType = async (id: number) => {
        try {
            const res = await deleteMaintenanceType(id, selectedDeptId);
            if (res.success) {
                toast({
                    title: "Tipo Eliminado",
                    description: "El tipo de mantenimiento ha sido removido."
                });
                const updated = await getMaintenanceTypesByDept(selectedDeptId);
                setDeptMaintTypes(updated);
            } else {
                toast({
                    title: "Error",
                    description: res.error || "No se pudo eliminar.",
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive"
            });
        }
    };
    if (isAuthorized === false) {
        return null;
    }

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
                <Skeleton className="h-12 w-64 rounded-xl" />
                <Skeleton className="h-48 w-full rounded-2xl" />
                <Skeleton className="h-96 w-full rounded-2xl" />
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-2xl text-white shadow-lg">
                        <Wrench className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Administración de Inventarios e Instancias</h1>
                        <p className="text-sm md:text-base text-muted-foreground font-medium">Gestiona prefijos, consecutivos y técnicos asignados a cada taller o departamento de forma independiente.</p>
                    </div>
                </div>

                {/* Instance selector */}
                <div className="flex items-center gap-3">
                    <Label htmlFor="dept-admin-selector" className="font-bold text-sm text-slate-700 dark:text-slate-300">Seleccionar Instancia:</Label>
                    <select
                        id="dept-admin-selector"
                        value={selectedDeptId}
                        onChange={(e) => setSelectedDeptId(Number(e.target.value))}
                        className="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold shadow-sm focus:outline-none ring-offset-background"
                    >
                        {departments.map((dept) => (
                            <option key={dept.id} value={dept.id}>
                                {dept.id}. {dept.name} {!dept.is_active ? '(Inactiva)' : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <form onSubmit={handleSaveChanges} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left side: General details & Ticket setting consecutive values */}
                <div className="lg:col-span-2 space-y-8">
                    {/* General Settings */}
                    <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg font-bold">
                                <Settings className="w-5 h-5 text-purple-600" />
                                Ajustes de la Instancia
                            </CardTitle>
                            <CardDescription>Edita el nombre y el objetivo operativo de esta instancia de inventario.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="dept-name">Nombre de Instancia / Departamento *</Label>
                                <Input 
                                    id="dept-name"
                                    value={deptForm.name}
                                    onChange={(e) => setDeptForm({...deptForm, name: e.target.value})}
                                    required
                                    placeholder="Ej: Taller Mecánico, TI, etc."
                                    className="bg-white dark:bg-slate-950 font-semibold"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="dept-description">Descripción de Objetivo / Bodega</Label>
                                <Input 
                                    id="dept-description"
                                    value={deptForm.description}
                                    onChange={(e) => setDeptForm({...deptForm, description: e.target.value})}
                                    placeholder="Detalles sobre qué repuestos u activos se administran aquí..."
                                    className="bg-white dark:bg-slate-950"
                                />
                            </div>
                            <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50/50 dark:bg-slate-900/50">
                                <div className="space-y-0.5">
                                    <Label htmlFor="dept-status" className="font-bold">Estatus de la Instancia</Label>
                                    <p className="text-xs text-muted-foreground">Desactivar para ocultarla del sistema general de soporte e inventarios.</p>
                                </div>
                                <Switch 
                                    id="dept-status"
                                    checked={deptForm.is_active === 1}
                                    onCheckedChange={(checked) => setDeptForm({...deptForm, is_active: checked ? 1 : 0})}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Ticket prefix consecutive settings */}
                    <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg font-bold">
                                <Wrench className="w-5 h-5 text-indigo-500" />
                                Prefijos y Consecutivos de Tickets
                            </CardTitle>
                            <CardDescription>Define la nomenclatura secuencial de los tickets de reparación asociados a esta área.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="ticket-prefix">Prefijo de Ticket</Label>
                                <Input 
                                    id="ticket-prefix"
                                    value={settingsForm.prefix}
                                    onChange={(e) => setSettingsForm({...settingsForm, prefix: e.target.value.toUpperCase()})}
                                    placeholder="Ej: TKT-FLOT-"
                                    required
                                    className="bg-white dark:bg-slate-950 font-mono"
                                />
                                <p className="text-xs text-muted-foreground pt-1">Este prefijo precederá al número de ticket (ej: TKT_FLOT_000001). Solo se permiten letras, números, guiones medios <code>-</code> y guiones bajos <code>_</code>. <b>Se recomiendan guiones bajos <code>_</code></b> para compatibilidad con el bot de Telegram.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="next-ticket">Próximo Consecutivo</Label>
                                <Input 
                                    id="next-ticket"
                                    type="number"
                                    value={settingsForm.nextNumber}
                                    onChange={(e) => setSettingsForm({...settingsForm, nextNumber: Number(e.target.value)})}
                                    required
                                    className="bg-white dark:bg-slate-950 font-mono"
                                />
                                <p className="text-xs text-muted-foreground pt-1">Número incremental secuencial para el siguiente ticket.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right side: Assignee mapping grid */}
                <div className="space-y-8">
                    <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg font-bold">
                                <Users className="w-5 h-5 text-blue-500" />
                                Técnicos Asignados
                            </CardTitle>
                            <CardDescription>
                                Marca qué usuarios del sistema son elegibles como técnicos/mecánicos **únicamente en esta instancia**.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg max-h-[350px] overflow-y-auto bg-white dark:bg-slate-950">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50 dark:bg-slate-900">
                                            <TableHead className="font-bold">Usuario</TableHead>
                                            <TableHead className="font-bold text-center w-20">Permitido</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {technicians.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-center py-8 text-muted-foreground text-sm font-medium">
                                                    No se encontraron usuarios en el sistema.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            technicians.map((tech) => {
                                                const isSelected = selectedTechIds.includes(tech.id);
                                                return (
                                                    <TableRow key={tech.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <TableCell className="font-medium text-sm text-slate-800 dark:text-slate-200">
                                                            {tech.name}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="flex items-center justify-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleTech(tech.id)}
                                                                    className={`flex items-center justify-center w-6 h-6 rounded-md border transition-all ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100'}`}
                                                                >
                                                                    {isSelected && <Check className="w-4 h-4" />}
                                                                </button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                        <CardFooter className="border-t px-6 py-4 flex justify-end">
                            <Button type="submit" disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg">
                                <Save className="w-4 h-4 mr-2" />
                                {saving ? "Guardando..." : "Guardar Cambios"}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Maintenance Types Manager Card */}
                    <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg font-bold">
                                <Wrench className="w-5 h-5 text-purple-600" />
                                Tipos de Mantenimiento
                            </CardTitle>
                            <CardDescription>
                                Administra los tipos de incidentes o clasificaciones de soporte para esta instancia.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* List of current maintenance types */}
                            <div className="border rounded-lg max-h-[200px] overflow-y-auto bg-white dark:bg-slate-950 p-2 space-y-1.5">
                                {deptMaintTypes.length === 0 ? (
                                    <p className="text-xs text-muted-foreground font-medium text-center py-4">No hay tipos registrados. Se usarán tipos por defecto.</p>
                                ) : (
                                    deptMaintTypes.map((type) => (
                                        <div key={type.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-900/50 rounded-lg transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-800 gap-2">
                                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex-1 truncate">
                                                🔧 {type.name}
                                            </span>
                                            
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={type.default_assignee_id || ""}
                                                    onChange={async (e) => {
                                                        const val = e.target.value ? Number(e.target.value) : null;
                                                        const res = await updateMaintenanceTypeAssignee(type.id, val, selectedDeptId);
                                                        if (res.success) {
                                                            toast({
                                                                title: "Técnico Asignado",
                                                                description: "Se actualizó el técnico automático por defecto."
                                                            });
                                                            setDeptMaintTypes(prev => prev.map(t => t.id === type.id ? { ...t, default_assignee_id: val } : t));
                                                        } else {
                                                            toast({
                                                                title: "Error",
                                                                description: "No se pudo actualizar la asignación.",
                                                                variant: "destructive"
                                                            });
                                                        }
                                                    }}
                                                    className="text-[11px] h-7 px-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none"
                                                >
                                                    <option value="">(Sin asignación automática)</option>
                                                    {technicians.filter(t => selectedTechIds.includes(t.id)).map(tech => (
                                                        <option key={tech.id} value={tech.id}>{tech.name}</option>
                                                    ))}
                                                </select>

                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteMaintType(type.id)}
                                                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Add type input */}
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Ej: Falla de Red, Cambio Aceite..."
                                    value={newMaintTypeName}
                                    onChange={(e) => setNewMaintTypeName(e.target.value)}
                                    className="bg-white dark:bg-slate-950 text-xs"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddMaintType();
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    onClick={handleAddMaintType}
                                    disabled={addingMaintType || !newMaintTypeName.trim()}
                                    className="bg-purple-600 hover:bg-purple-700 text-white shadow-md text-xs font-semibold px-3 h-10"
                                >
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </form>
        </main>
    );
}
