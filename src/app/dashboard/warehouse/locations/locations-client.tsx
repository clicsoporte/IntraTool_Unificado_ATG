

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError, logInfo, logWarn } from '@/modules/core/lib/logger';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getWarehouseSettings, saveWarehouseSettings, getLocations, addLocation, deleteLocation, updateLocation, addBulkLocations, addLevelsToRack } from '@/modules/warehouse/lib/actions';
import { PlusCircle, Trash2, Edit2, Save, ChevronDown, ChevronRight, Info, Wand2, Copy, List, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { WarehouseSettings, WarehouseLocation } from '@/modules/core/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { useDebounce } from 'use-debounce';

const emptyLocation: Omit<WarehouseLocation, 'id'> = { name: '', code: '', type: 'building', parentId: null };
const initialWizardState = { name: '', prefix: '', levels: '', positions: '', depth: '', parentId: null as number | null };
const initialCloneState = { sourceRackId: '', newName: '', newPrefix: '' };

const renderLocationPathAsString = (locationId: number, locations: WarehouseLocation[]): string => {
    if (!locationId) return '';
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
    
    while (current) {
        path.unshift(current);
        const parentId = current.parentId;
        if (!parentId) break;
        current = locations.find(l => l.id === parentId);
    }
    return path.map(l => l.name).join(' > ');
};


interface LocationFormProps {
    initialLocation: Partial<WarehouseLocation>;
    allLocations: WarehouseLocation[];
    settings: WarehouseSettings;
    onSave: (location: Partial<WarehouseLocation>) => void;
    onCancel: () => void;
    isEditing: boolean;
}

function LocationForm({ initialLocation, allLocations, settings, onSave, onCancel, isEditing }: LocationFormProps) {
    const { companyData } = useAuth();
    const [formData, setFormData] = useState(initialLocation);
    const [parentSearchTerm, setParentSearchTerm] = useState('');
    const [isParentSearchOpen, setIsParentSearchOpen] = useState(false);
    const [debouncedParentSearch] = useDebounce(parentSearchTerm, companyData?.searchDebounceTime ?? 500);

    useEffect(() => {
        setFormData(initialLocation);
        const parentLocation = allLocations.find(l => l.id === initialLocation.parentId);
        if (parentLocation) {
            setParentSearchTerm(renderLocationPathAsString(parentLocation.id, allLocations));
        } else {
            setParentSearchTerm('');
        }
    }, [initialLocation, allLocations]);

    const handleChange = (field: keyof WarehouseLocation, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSelectParent = (value: string) => {
        const parentId = Number(value);
        handleChange('parentId', parentId);
        const parentLocation = allLocations.find(l => l.id === parentId);
        if (parentLocation) {
            setParentSearchTerm(renderLocationPathAsString(parentLocation.id, allLocations));
        }
        setIsParentSearchOpen(false);
    };

    const parentLocationOptions = useMemo(() => {
        const searchLower = debouncedParentSearch.trim().toLowerCase();
        
        // Find the types that CANNOT be parents (the last level in the hierarchy)
        const hierarchyLevels = settings.locationLevels || [];
        const leafNodeTypes = new Set<string>();
        if (hierarchyLevels.length > 0) {
            const lastLevel = hierarchyLevels[hierarchyLevels.length - 1];
            leafNodeTypes.add(lastLevel.type);
        }

        const filtered = allLocations.filter(l => 
            l.id !== formData?.id && // Can't be its own parent
            !leafNodeTypes.has(l.type) && // Exclude leaf node types
            renderLocationPathAsString(l.id, allLocations).toLowerCase().includes(searchLower)
        );

        return filtered.map(l => ({
            value: String(l.id),
            label: renderLocationPathAsString(l.id, allLocations)
        }));
    }, [allLocations, debouncedParentSearch, formData?.id, settings.locationLevels]);


    return (
        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }}>
            <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="loc-name">Nombre</Label>
                        <Input id="loc-name" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="loc-code">Código Único</Label>
                        <Input id="loc-code" value={formData.code || ''} onChange={e => handleChange('code', e.target.value)} required />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="loc-type">Tipo de Ubicación (Nivel)</Label>
                    <Select value={formData.type || ''} onValueChange={(val) => handleChange('type', val)}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                            {settings.locationLevels?.map((level, index) => (
                                <SelectItem key={level.type} value={level.type}>Nivel {index+1}: {level.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="loc-parent">Ubicación Padre (Opcional)</Label>
                    <div className="flex items-center gap-2">
                        <SearchInput 
                            options={parentLocationOptions}
                            onSelect={(option) => handleSelectParent(option.value)}
                            value={parentSearchTerm}
                            onValueChange={setParentSearchTerm}
                            placeholder="Buscar ubicación padre..."
                            open={isParentSearchOpen}
                            onOpenChange={setIsParentSearchOpen}
                        />
                         <Button type="button" variant="outline" size="icon" onClick={() => {setParentSearchTerm(''); handleChange('parentId', null);}}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="ghost" type="button" onClick={onCancel}>Cancelar</Button>
                <Button type="submit"><Save className="mr-2"/> Guardar</Button>
            </DialogFooter>
        </form>
    );
}

function LocationTree({ 
    locations, 
    onEdit, 
    onDelete, 
    onAddLevels 
}: { 
    locations: WarehouseLocation[], 
    onEdit: (loc: WarehouseLocation) => void, 
    onDelete: (loc: WarehouseLocation) => void,
    onAddLevels?: (loc: WarehouseLocation) => void
}) {
    const [openNodes, setOpenNodes] = useState<Set<number>>(() => {
        const rootIds = locations.filter(l => !l.parentId).map(l => l.id);
        const secondLevelIds = locations.filter(l => l.parentId && rootIds.includes(l.parentId)).map(l => l.id);
        return new Set([...rootIds, ...secondLevelIds]);
    });

    const toggleNode = (id: number) => {
        setOpenNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const renderNode = (location: WarehouseLocation, level = 0) => {
        const children = locations.filter(l => l.parentId === location.id);
        const hasChildren = children.length > 0;
        const isOpen = openNodes.has(location.id);

        return (
            <div key={location.id} className="relative">
                 {level > 0 && <span className="absolute -left-2 top-1/2 w-4 h-px bg-muted-foreground/30"></span>}
                <div className={`flex items-center justify-between p-2 rounded-md hover:bg-muted/50`}>
                    <div className="flex items-center gap-2">
                        <div style={{ paddingLeft: `${level * 24}px` }} className="flex items-center gap-2">
                            {hasChildren ? (
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => toggleNode(location.id)}>
                                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                            ) : (
                                <span className="w-6 shrink-0"></span> // Placeholder to align items
                            )}
                            <span className="font-medium">{location.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">({location.code})</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {location.type === 'rack' && onAddLevels && (
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7" 
                                title="Agregar niveles adicionales"
                                onClick={() => onAddLevels(location)}
                            >
                                <PlusCircle className="h-4 w-4 text-primary" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(location)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(location)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                </div>
                {isOpen && hasChildren && (
                    <div className="relative pl-6 border-l-2 border-muted-foreground/10 ml-5">{children.map(child => renderNode(child, level + 1))}</div>
                )}
            </div>
        );
    };

    const rootLocations = locations.filter(l => !l.parentId);
    return (
        <div className="space-y-1">
            {rootLocations.map(loc => renderNode(loc))}
        </div>
    );
}

export default function ManageLocationsClient() {
    const { isAuthorized } = useAuthorization(['warehouse:locations:update', 'warehouse:locations:delete']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [settings, setSettings] = useState<WarehouseSettings | null>(null);
    const [locations, setLocations] = useState<WarehouseLocation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [newLevelName, setNewLevelName] = useState('');
    
    const [isLocationFormOpen, setLocationFormOpen] = useState(false);
    const [currentLocation, setCurrentLocation] = useState<Partial<WarehouseLocation>>(emptyLocation);
    const [isEditingLocation, setIsEditingLocation] = useState(false);
    const [locationToDelete, setLocationToDelete] = useState<WarehouseLocation | null>(null);

    const [isWizardOpen, setWizardOpen] = useState(false);
    const [wizardData, setWizardData] = useState(initialWizardState);
    const [cloneData, setCloneData] = useState(initialCloneState);

    const [isAddLevelsOpen, setAddLevelsOpen] = useState(false);
    const [rackForAddingLevels, setRackForAddingLevels] = useState<WarehouseLocation | null>(null);
    const [numLevelsToAdd, setNumLevelsToAdd] = useState('1');
    const [isSubmittingLevels, setIsSubmittingLevels] = useState(false);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [settingsData, locationsData] = await Promise.all([
                getWarehouseSettings(),
                getLocations(),
            ]);
            setSettings(settingsData);
            setLocations(locationsData);
        } catch (error) {
            logError('Failed to fetch warehouse config data', { error });
            toast({ title: "Error", description: "No se pudieron cargar los datos de configuración del almacén.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        setTitle("Gestión de Ubicaciones de Almacén");
        if(isAuthorized){
            fetchAllData();
        }
    }, [setTitle, fetchAllData, isAuthorized]);

    const handleAddLevel = () => {
        if (!settings || !newLevelName.trim()) return;
        const newLevels = [...(settings.locationLevels || []), { type: `level${(settings.locationLevels?.length || 0) + 1}`, name: newLevelName.trim() }];
        setSettings({ ...settings, locationLevels: newLevels });
        setNewLevelName('');
    };
    
    const handleDeleteLevel = useCallback((index: number) => {
        if (!settings) return;
        const newLevels = settings.locationLevels?.filter((_, i) => i !== index);
        setSettings({ ...settings, locationLevels: newLevels });
    }, [settings]);

    const handleSaveHierarchy = async () => {
        if (!settings) return;
        try {
            await saveWarehouseSettings(settings);
            toast({ title: "Jerarquía Guardada", description: "Los niveles del almacén han sido guardados." });
            logInfo("Warehouse hierarchy settings updated", { settings });
        } catch (error: any) {
            logError("Failed to save warehouse settings", { error: error.message });
            toast({ title: "Error", description: "No se pudieron guardar los ajustes de jerarquía.", variant: "destructive" });
        }
    };

    const handleSaveLocation = async (locationData: Partial<WarehouseLocation>) => {
        if (!locationData.name || !locationData.code || !locationData.type) {
            toast({ title: "Datos incompletos", variant: "destructive" });
            return;
        }

        try {
            if (isEditingLocation && locationData.id) {
                const updatedLoc = await updateLocation(locationData as WarehouseLocation);
                setLocations(prev => prev.map(l => l.id === updatedLoc.id ? updatedLoc : l));
                toast({ title: "Ubicación Actualizada" });
            } else {
                const newLoc = await addLocation(locationData as Omit<WarehouseLocation, 'id'>);
                setLocations(prev => [...prev, newLoc]);
                toast({ title: "Ubicación Creada" });
            }
            setLocationFormOpen(false);
        } catch (error: any) {
            logError("Failed to save location", { error: error.message });
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };
    
    const handleDeleteLocationAction = useCallback(async () => {
        if (!locationToDelete || !user) return;
        try {
            await deleteLocation(locationToDelete.id, user.name);
            const locationsData = await getLocations();
            setLocations(locationsData);
            toast({ title: "Ubicación Eliminada" });
            setLocationToDelete(null);
        } catch (error: any) {
             logError("Failed to delete location", { error: error.message });
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    }, [locationToDelete, toast, user]);
    
    const openLocationForm = (loc?: WarehouseLocation) => {
        if (loc) {
            setCurrentLocation(loc);
            setIsEditingLocation(true);
        } else {
            setCurrentLocation(emptyLocation);
            setIsEditingLocation(false);
        }
        setLocationFormOpen(true);
    };

    const handleGenerateFromWizard = async () => {
        if (!wizardData.name || !wizardData.prefix || !wizardData.levels || !wizardData.positions || !wizardData.depth) {
            toast({ title: 'Datos Incompletos', description: 'Todos los campos del asistente son requeridos.', variant: 'destructive' });
            return;
        }
        try {
            const params = {
                name: wizardData.name,
                prefix: wizardData.prefix,
                levels: Number(wizardData.levels),
                positions: Number(wizardData.positions),
                depth: Number(wizardData.depth),
                parentId: wizardData.parentId
            };
            await addBulkLocations({ type: 'rack', params });
            toast({ title: '¡Rack Creado!', description: `Se generaron las ubicaciones para ${wizardData.name}.` });
            setWizardOpen(false);
            setWizardData(initialWizardState);
            await fetchAllData(); // Refresh the location list
        } catch (error: any) {
            logError('Failed to generate from wizard', { error: error.message });
            toast({ title: 'Error al Generar', description: error.message, variant: 'destructive' });
        }
    };

    const handleCloneRack = async () => {
        if (!cloneData.sourceRackId || !cloneData.newName || !cloneData.newPrefix) {
            toast({ title: 'Datos Incompletos', description: 'Debes seleccionar un rack de origen y proporcionar un nuevo nombre y prefijo.', variant: 'destructive' });
            return;
        }
        try {
            await addBulkLocations({ type: 'clone', params: cloneData });
            toast({ title: '¡Rack Clonado!', description: `La estructura de ${cloneData.newName} ha sido creada.` });
            setWizardOpen(false);
            setCloneData(initialCloneState);
            await fetchAllData(); // Refresh the location list
        } catch (error: any) {
            logError('Failed to clone rack', { error: error.message });
            toast({ title: 'Error al Clonar', description: error.message, variant: 'destructive' });
        }
    };

    const handleOpenAddLevels = (rack: WarehouseLocation) => {
        setRackForAddingLevels(rack);
        setNumLevelsToAdd('1');
        setAddLevelsOpen(true);
    };

    const handleAddLevelsSubmit = async () => {
        const num = Number(numLevelsToAdd);
        if (!rackForAddingLevels || isNaN(num) || num < 1) {
            toast({ title: 'Entrada inválida', description: 'Por favor ingresa un número de niveles válido (mínimo 1).', variant: 'destructive' });
            return;
        }
        setIsSubmittingLevels(true);
        try {
            await addLevelsToRack(rackForAddingLevels.id, num);
            toast({ title: '¡Niveles Agregados!', description: `Se agregaron ${num} niveles a ${rackForAddingLevels.name}.` });
            setAddLevelsOpen(false);
            setNumLevelsToAdd('1');
            await fetchAllData(); // Refresh the locations list
        } catch (error: any) {
            logError('Failed to add levels to rack', { error: error.message });
            toast({ title: 'Error al agregar niveles', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmittingLevels(false);
        }
    };
    
    const rackOptions = locations
        .filter(l => l.type === 'rack')
        .map(l => ({ value: String(l.id), label: `${l.name} (${l.code})` }));

    if (isLoading || !settings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-4xl space-y-6">
                    <Skeleton className="h-64 w-full" />
                </div>
            </main>
        );
    }
    
    if (!isAuthorized) {
        return null;
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-6">
                 <Accordion type="multiple" defaultValue={['item-1', 'item-2']} className="w-full space-y-6">
                    <Card>
                        <AccordionItem value="item-1">
                            <AccordionTrigger className="p-6">
                                <CardTitle>Paso 1: Definir Jerarquía del Almacén (El Molde)</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                <CardDescription className="mb-4">
                                    Define los <strong>nombres</strong> para cada nivel de tu organización. Esto crea la plantilla para construir tu almacén. Por ejemplo: <code>Bodega</code>, <code>Pasillo</code>, <code>Rack</code>, <code>Estante</code>, <code>Casilla</code>.
                                </CardDescription>
                                <div className="space-y-4">
                                    {settings.locationLevels?.map((level, index) => (
                                        <div key={index} className="flex items-center justify-between rounded-lg border p-3">
                                            <p className="font-medium">Nivel {index + 1}: {level.name}</p>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteLevel(index)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Separator />
                                    <div className="flex items-end gap-2 pt-2">
                                        <div className="grid flex-1 gap-2">
                                            <Label htmlFor="new-level-name">Nombre del Nuevo Nivel</Label>
                                            <Input id="new-level-name" value={newLevelName} onChange={(e) => setNewLevelName(e.target.value)} placeholder="Ej: Tarima" />
                                        </div>
                                        <Button size="icon" onClick={handleAddLevel}>
                                            <PlusCircle className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <Button onClick={handleSaveHierarchy}><Save className="mr-2"/> Guardar Niveles</Button>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>
                    <Card>
                        <AccordionItem value="item-2">
                            <AccordionTrigger className="p-6">
                            <CardTitle>Paso 2: Crear Ubicaciones Reales (El Árbol)</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
                                    <CardDescription>
                                        Usa los niveles que definiste para construir la estructura de tu almacén.
                                    </CardDescription>
                                    <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                                        <Button onClick={() => openLocationForm()} className="flex-1 sm:flex-grow-0">
                                            <PlusCircle className="mr-2"/> Añadir Manual
                                        </Button>
                                        <Button variant="secondary" onClick={() => setWizardOpen(true)} className="flex-1 sm:flex-grow-0">
                                            <Wand2 className="mr-2"/> Asistente
                                        </Button>
                                    </div>
                                </div>
                                <div>
                                    <LocationTree 
                                        locations={locations} 
                                        onEdit={openLocationForm} 
                                        onDelete={setLocationToDelete} 
                                        onAddLevels={handleOpenAddLevels}
                                    />
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>
                </Accordion>

                 <Dialog open={isLocationFormOpen} onOpenChange={setLocationFormOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{isEditingLocation ? "Editar" : "Añadir"} Ubicación</DialogTitle>
                            <DialogDescription>
                                {isEditingLocation ? "Modifica los detalles de esta ubicación." : "Crea una nueva ubicación en tu almacén."}
                            </DialogDescription>
                        </DialogHeader>
                         <LocationForm 
                            initialLocation={currentLocation}
                            allLocations={locations}
                            settings={settings}
                            onSave={handleSaveLocation}
                            onCancel={() => setLocationFormOpen(false)}
                            isEditing={isEditingLocation}
                         />
                    </DialogContent>
                 </Dialog>

                 <Dialog open={isWizardOpen} onOpenChange={setWizardOpen}>
                    <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Asistente de Creación de Racks</DialogTitle>
                            <DialogDescription>Genera o clona rápidamente la estructura completa de un rack.</DialogDescription>
                        </DialogHeader>
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="item-1">
                                <AccordionTrigger>Crear Nuevo Rack desde Cero</AccordionTrigger>
                                <AccordionContent className="pt-4 space-y-4">
                                     <div className="space-y-2">
                                        <Label htmlFor="wiz-parent">Ubicación Padre (Bodega/Zona)</Label>
                                        <Select value={wizardData.parentId ? String(wizardData.parentId) : 'none'} onValueChange={val => setWizardData(p => ({...p, parentId: val === 'none' ? null : Number(val)}))}>
                                            <SelectTrigger><SelectValue placeholder="Seleccionar (opcional, si es raíz)"/></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">(Ninguno - Nivel Raíz)</SelectItem>
                                                {locations.filter(l => l.type !== 'shelf' && l.type !== 'bin').map(opt => (
                                                    <SelectItem key={opt.id} value={String(opt.id)}>{opt.name} ({opt.code})</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="wiz-name">Nombre Base del Rack</Label>
                                            <Input id="wiz-name" value={wizardData.name} onChange={e => setWizardData(p => ({...p, name: e.target.value}))} placeholder="Ej: Rack 01" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="wiz-prefix">Prefijo de Código</Label>
                                            <Input id="wiz-prefix" value={wizardData.prefix} onChange={e => setWizardData(p => ({...p, prefix: e.target.value}))} placeholder="Ej: R01" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="wiz-levels">Nº de Niveles (Alto)</Label>
                                            <Input id="wiz-levels" type="number" value={wizardData.levels} onChange={e => setWizardData(p => ({...p, levels: e.target.value}))} placeholder="ej: 4" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="wiz-positions">Nº de Posiciones (Ancho)</Label>
                                            <Input id="wiz-positions" type="number" value={wizardData.positions} onChange={e => setWizardData(p => ({...p, positions: e.target.value}))} placeholder="ej: 10" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="wiz-depth">Nº de Fondos</Label>
                                            <Input id="wiz-depth" type="number" value={wizardData.depth} onChange={e => setWizardData(p => ({...p, depth: e.target.value}))} placeholder="1 o 2" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Ejemplo de código generado: {wizardData.prefix || 'R01'}-A-01-F</p>
                                    <Button onClick={handleGenerateFromWizard}>
                                        <Wand2 className="mr-2"/> Generar Estructura
                                    </Button>
                                </AccordionContent>
                            </AccordionItem>
                             <AccordionItem value="item-2">
                                <AccordionTrigger>Clonar Estructura de Rack Existente</AccordionTrigger>
                                <AccordionContent className="pt-4 space-y-4">
                                     <div className="space-y-2">
                                        <Label htmlFor="clone-source">Rack de Origen a Clonar</Label>
                                        <Select value={cloneData.sourceRackId} onValueChange={val => setCloneData(p => ({...p, sourceRackId: val}))}>
                                            <SelectTrigger><SelectValue placeholder="Busca un rack de origen para clonar (ej: 'Rack 01')"/></SelectTrigger>
                                            <SelectContent>
                                                {rackOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="clone-name">Nuevo Nombre Base</Label>
                                            <Input id="clone-name" value={cloneData.newName} onChange={e => setCloneData(p => ({...p, newName: e.target.value}))} placeholder="Ej: Rack 02"/>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="clone-prefix">Nuevo Prefijo de Código</Label>
                                            <Input id="clone-prefix" value={cloneData.newPrefix} onChange={e => setCloneData(p => ({...p, newPrefix: e.target.value}))} placeholder="Ej: R02"/>
                                        </div>
                                    </div>
                                     <Button onClick={handleCloneRack}>
                                        <Copy className="mr-2"/> Clonar Rack
                                    </Button>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </DialogContent>
                 </Dialog>

                  <AlertDialog open={!!locationToDelete} onOpenChange={(open) => !open && setLocationToDelete(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{`¿Eliminar "${locationToDelete?.name}"?`}</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará la ubicación y TODAS las ubicaciones hijas que contenga. 
                                El inventario asociado no se eliminará, pero quedará sin ubicación.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setLocationToDelete(null)}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteLocationAction}>Sí, Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Dialog open={isAddLevelsOpen} onOpenChange={(open) => !open && !isSubmittingLevels && setAddLevelsOpen(false)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Agregar Niveles Adicionales</DialogTitle>
                            <DialogDescription>
                                Agrega nuevos niveles a la estructura del rack <strong>{rackForAddingLevels?.name} ({rackForAddingLevels?.code})</strong>.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
                                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                    Los nuevos niveles respetarán de forma automática la estructura actual del rack: cantidad de posiciones, distribución de fondo/frente y tipos de ubicación, continuando la secuencia. El inventario actual no se verá afectado.
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="num-levels">Cantidad de niveles a añadir</Label>
                                <Input 
                                    id="num-levels" 
                                    type="number" 
                                    min="1" 
                                    max="20"
                                    value={numLevelsToAdd} 
                                    onChange={e => setNumLevelsToAdd(e.target.value)} 
                                    disabled={isSubmittingLevels}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" type="button" onClick={() => setAddLevelsOpen(false)} disabled={isSubmittingLevels}>
                                Cancelar
                            </Button>
                            <Button onClick={handleAddLevelsSubmit} disabled={isSubmittingLevels}>
                                {isSubmittingLevels ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Agregando...
                                    </>
                                ) : (
                                    "Agregar Niveles"
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                  </Dialog>
            </div>
        </main>
    );
}
