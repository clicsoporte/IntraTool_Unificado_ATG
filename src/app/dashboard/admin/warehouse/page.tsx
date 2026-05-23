/**
 * @fileoverview Page for managing warehouse structure and settings.
 * This component allows administrators to define the hierarchical levels of a warehouse
 * (e.g., Building, Aisle, Rack) and then create the actual physical locations
 * based on that hierarchy. It also controls global warehouse settings.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getWarehouseSettings, saveWarehouseSettings, getLocations, addLocation, deleteLocation, updateLocation, addBulkLocations, getStockSettings, saveStockSettings } from '@/modules/warehouse/lib/actions';
import { Save, PlusCircle, Trash2, Palette, Mail } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { WarehouseSettings, StockSettings, Warehouse } from '@/modules/core/types';
import { Separator } from '@/components/ui/separator';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const defaultColors = [ '#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#ff7300', '#0088fe', '#00c49f', '#ffbb28', '#F44336', '#9C27B0', '#3F51B5', '#009688' ];

export default function WarehouseSettingsPage() {
    const { isAuthorized, isLoading: isAuthLoading } = useAuthorization(['admin:settings:warehouse', 'admin:settings:stock']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const router = useRouter();
    
    const [warehouseSettings, setWarehouseSettings] = useState<WarehouseSettings | null>(null);
    const [stockSettings, setStockSettings] = useState<StockSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [newWarehouse, setNewWarehouse] = useState<Warehouse>({ id: "", name: "", isDefault: false, isVisible: true, color: '#CCCCCC' });

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [wSettings, sSettings] = await Promise.all([
                getWarehouseSettings(),
                getStockSettings()
            ]);
            setWarehouseSettings(wSettings);
            if (!sSettings.warehouses) {
                sSettings.warehouses = [];
            }
            // Ensure every warehouse has a color
            sSettings.warehouses = sSettings.warehouses.map(w => ({...w, color: w.color || '#CCCCCC'}));
            setStockSettings(sSettings);
        } catch (error) {
            logError('Failed to fetch warehouse/stock config data', { error });
            toast({ title: "Error", description: "No se pudieron cargar los datos de configuración.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        setTitle("Configuración de Almacenes e Inventario");
        if (isAuthorized) {
            fetchAllData();
        }
    }, [setTitle, fetchAllData, isAuthorized]);

    const handleSaveAllSettings = async () => {
        if (!warehouseSettings || !stockSettings) return;
        try {
            await Promise.all([
                saveWarehouseSettings(warehouseSettings),
                saveStockSettings(stockSettings)
            ]);
            toast({ title: "Configuración Guardada", description: "Los ajustes de almacenes e inventario han sido guardados." });
            logInfo("Warehouse and Stock settings updated");
            router.refresh();
        } catch (error: any) {
            logError("Failed to save warehouse/stock settings", { error: error.message });
            toast({ title: "Error", description: "No se pudieron guardar los ajustes.", variant: "destructive" });
        }
    };
    
    const handleAddWarehouse = () => {
        if (!stockSettings || !newWarehouse.id || !newWarehouse.name) {
            toast({ title: "Datos incompletos", description: "El ID y el Nombre de la bodega son requeridos.", variant: "destructive" });
            return;
        }
        if (stockSettings.warehouses.some(w => w.id === newWarehouse.id)) {
            toast({ title: "ID Duplicado", description: "Ya existe una bodega con ese ID.", variant: "destructive" });
            return;
        }
         
        let warehouses = [...stockSettings.warehouses, newWarehouse];
        if (newWarehouse.isDefault) {
            warehouses = warehouses.map(w => w.id === newWarehouse.id ? w : { ...w, isDefault: false });
        }
        
        setStockSettings(prev => prev ? { ...prev, warehouses } : null);
        setNewWarehouse({ id: "", name: "", isDefault: false, isVisible: true, color: '#CCCCCC' });
    };
    
    const handleWarehouseChange = (id: string, field: keyof Warehouse, value: any) => {
        if (!stockSettings) return;
        let warehouses = stockSettings.warehouses.map(w => {
            if (w.id === id) {
                return { ...w, [field]: value };
            }
            return w;
        });

        if (field === 'isDefault' && value === true) {
            warehouses = warehouses.map(w => w.id === id ? w : { ...w, isDefault: false });
        }

        setStockSettings(prev => prev ? { ...prev, warehouses } : null);
    };

    const handleDeleteWarehouse = (id: string) => {
        if (!stockSettings) return;
        setStockSettings(prev => prev ? { ...prev, warehouses: prev.warehouses.filter(w => w.id !== id) } : null);
    };

    if (isAuthLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-4xl space-y-6">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </main>
        );
    }

    if (!isAuthorized) {
        return (
             <main className="flex flex-col items-center justify-center min-h-[60vh] p-4 md:p-6 lg:p-8">
                <div className="text-center max-w-md p-6 bg-card border rounded-xl shadow-lg space-y-4">
                    <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold">Acceso Denegado</h2>
                    <p className="text-sm text-muted-foreground">
                        No tienes los permisos necesarios para acceder a la configuración de almacenes e inventario.
                    </p>
                </div>
            </main>
        );
    }

    if (isLoading || !warehouseSettings || !stockSettings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-4xl space-y-6">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>Configuración de Almacenes e Inventario</CardTitle>
                        <CardDescription>Ajustes globales para los módulos de almacenes, unidades de inventario y desglose de existencias.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-4 rounded-lg border p-4">
                            <h3 className="font-semibold">Consecutivos de Documentos de Inventario</h3>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="unitPrefix">Prefijo de Unidad Física (Etiqueta)</Label>
                                    <Input
                                        id="unitPrefix"
                                        value={warehouseSettings.unitPrefix || 'U-'}
                                        onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, unitPrefix: e.target.value } : null)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="nextUnitNumber">Próximo Nº de Unidad</Label>
                                    <Input
                                        id="nextUnitNumber"
                                        type="number"
                                        value={warehouseSettings.nextUnitNumber || 1}
                                        onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, nextUnitNumber: Number(e.target.value) } : null)}
                                    />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="receptionPrefix">Prefijo de Recepción (Ingreso)</Label>
                                    <Input
                                        id="receptionPrefix"
                                        value={warehouseSettings.receptionPrefix || 'ING-'}
                                        onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, receptionPrefix: e.target.value } : null)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="nextReceptionNumber">Próximo Nº de Recepción</Label>
                                    <Input
                                        id="nextReceptionNumber"
                                        type="number"
                                        value={warehouseSettings.nextReceptionNumber || 1}
                                        onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, nextReceptionNumber: Number(e.target.value) } : null)}
                                    />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="correctionPrefix">Prefijo de Corrección (Anulación)</Label>
                                    <Input
                                        id="correctionPrefix"
                                        value={warehouseSettings.correctionPrefix || 'COR-'}
                                        onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, correctionPrefix: e.target.value } : null)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="nextCorrectionNumber">Próximo Nº de Corrección</Label>
                                    <Input
                                        id="nextCorrectionNumber"
                                        type="number"
                                        value={warehouseSettings.nextCorrectionNumber || 1}
                                        onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, nextCorrectionNumber: Number(e.target.value) } : null)}
                                    />
                                </div>
                            </div>
                         </div>
                        <Separator />
                        <Accordion type="multiple" className="w-full space-y-6">
                             <Card className="border-0 shadow-none p-0">
                                <AccordionItem value="pdf-legend" className="border-b-0">
                                    <AccordionTrigger className="p-4 rounded-lg border hover:no-underline">
                                        <h3 className="font-semibold">Configuración de Boletas PDF</h3>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-4 pt-4 border rounded-b-lg">
                                        <div className="space-y-2">
                                            <Label htmlFor="pdfTopLegend">Leyenda Superior del PDF (Opcional)</Label>
                                            <Input
                                                id="pdfTopLegend"
                                                value={warehouseSettings.pdfTopLegend || ''}
                                                onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, pdfTopLegend: e.target.value } : null)}
                                                placeholder="Ej: Documento Controlado - ISO9001"
                                            />
                                            <p className="text-xs text-muted-foreground">Este texto aparecerá en la parte superior de todas las boletas de ingreso y corrección.</p>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                             </Card>
                            <Card className="border-0 shadow-none">
                                <AccordionItem value="warehouses" className="border-b-0">
                                    <AccordionTrigger className="p-4 rounded-lg border hover:no-underline">
                                        <h3 className="font-semibold">Gestión de Bodegas (para desglose de stock ERP)</h3>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-4 pt-4 border rounded-b-lg">
                                        <CardDescription className="mb-4">
                                            Define las bodegas que existen en tu ERP para que el sistema pueda mostrar el desglose de inventario correctamente. Asigna un color para una fácil identificación visual.
                                        </CardDescription>
                                        <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                                        {stockSettings.warehouses.map(wh => (
                                                <div key={wh.id} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-lg border p-3">
                                                    <div>
                                                        <p className="font-medium flex items-center gap-2">
                                                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: wh.color }}></span>
                                                            {wh.name} (<span className="font-mono">{wh.id}</span>)
                                                        </p>
                                                        <div className="flex items-center gap-4 mt-2">
                                                            <div className="flex items-center space-x-2">
                                                                <Checkbox id={`default-${wh.id}`} checked={wh.isDefault} onCheckedChange={(checked) => handleWarehouseChange(wh.id, 'isDefault', checked as boolean)} />
                                                                <Label htmlFor={`default-${wh.id}`} className="text-xs">Predeterm.</Label>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <Checkbox id={`visible-${wh.id}`} checked={wh.isVisible} onCheckedChange={(checked) => handleWarehouseChange(wh.id, 'isVisible', checked as boolean)} />
                                                                <Label htmlFor={`visible-${wh.id}`} className="text-xs">Visible</Label>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            type="text"
                                                            value={wh.color}
                                                            onChange={(e) => handleWarehouseChange(wh.id, 'color', e.target.value)}
                                                            className="w-24 h-8"
                                                        />
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <Button variant="outline" size="icon" className="h-8 w-8"><Palette className="h-4 w-4" /></Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-48 p-2">
                                                                <div className="grid grid-cols-4 gap-2">
                                                                    {defaultColors.map(color => (
                                                                        <button
                                                                            key={color}
                                                                            className={cn("h-8 w-8 rounded-full border", color === wh.color && "ring-2 ring-ring")}
                                                                            style={{ backgroundColor: color }}
                                                                            onClick={() => handleWarehouseChange(wh.id, 'color', color)}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteWarehouse(wh.id)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <Separator />
                                        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 pt-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="warehouse-id">ID Bodega (desde ERP)</Label>
                                                <Input id="warehouse-id" value={newWarehouse.id} onChange={(e) => setNewWarehouse(prev => ({ ...prev, id: e.target.value }))} placeholder="Ej: 01" />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="warehouse-name">Nombre Bodega</Label>
                                                <Input id="warehouse-name" value={newWarehouse.name} onChange={(e) => setNewWarehouse(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Bodega Principal" />
                                            </div>
                                            <Button size="icon" onClick={handleAddWarehouse}>
                                                <PlusCircle className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Card>
                             <Card className="border-0 shadow-none">
                                <AccordionItem value="notifications" className="border-b-0">
                                     <AccordionTrigger className="p-4 rounded-lg border hover:no-underline">
                                        <h3 className="font-semibold">Notificaciones Automáticas de Despacho</h3>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-4 pt-4 border rounded-b-lg">
                                        <div className="space-y-2">
                                            <Label htmlFor="dispatch-notification-emails">Correos para Notificación de Despacho</Label>
                                            <Textarea
                                                id="dispatch-notification-emails"
                                                value={warehouseSettings.dispatchNotificationEmails || ''}
                                                onChange={(e) => setWarehouseSettings(prev => prev ? { ...prev, dispatchNotificationEmails: e.target.value } : null)}
                                                placeholder="ejemplo@correo.com, otro@correo.com"
                                            />
                                            <p className="text-sm text-muted-foreground">
                                                Ingresa una lista de correos separados por comas. Cada vez que un despacho sea finalizado, se enviará una copia del comprobante a estas direcciones.
                                            </p>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                             </Card>
                        </Accordion>
                    </CardContent>
                    <CardFooter>
                         <Button onClick={handleSaveAllSettings}><Save className="mr-2"/> Guardar Configuración</Button>
                    </CardFooter>
                </Card>
            </div>
        </main>
    );
}

    
