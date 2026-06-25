/**
 * @fileoverview New page for the dedicated warehouse cleanup tools.
 */
'use client';

import React from 'react';
import { useWarehouseExplorer } from '@/modules/warehouse/hooks/useWarehouseExplorer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Search, Trash2, Box, Building, Waypoints, Layers, Archive, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// Helper to render an icon for a location type
const LocationIcon = ({ type }: { type: string }) => {
    switch (type) {
        case 'building': return <Building className="h-5 w-5 text-muted-foreground" />;
        case 'zone': return <Waypoints className="h-5 w-5 text-muted-foreground" />;
        case 'rack': return <Box className="h-5 w-5 text-muted-foreground" />;
        case 'shelf': return <Layers className="h-5 w-5 text-muted-foreground" />;
        case 'bin': return <Archive className="h-5 w-5 text-muted-foreground" />;
        default: return <Box className="h-5 w-5 text-muted-foreground" />;
    }
};


export default function WarehouseExplorerPage() {
    const { state, actions, selectors } = useWarehouseExplorer();

    if (state.isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 h-[80vh]">
                    <Skeleton className="col-span-1 h-full" />
                    <Skeleton className="col-span-1 h-full" />
                    <Skeleton className="col-span-1 h-full" />
                    <Skeleton className="col-span-2 h-full" />
                </div>
            </main>
        );
    }

    return (
        <main className="flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b">
                <div className="flex items-center gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar ubicación por nombre o código..."
                            value={state.searchTerm}
                            onChange={(e) => actions.setSearchTerm(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>
            </div>             {(state.selectedBuildingId !== null) && (
                  <div className="p-4 border-b bg-muted/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                     <div>
                         <h3 className="font-semibold text-lg">{selectors.details.title}</h3>
                         <p className="text-sm text-muted-foreground">{selectors.details.description}</p>
                     </div>
                     <div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={state.selectedAssignmentIds.size === 0 || state.isSubmitting}>
                                    {state.isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Trash2 className="mr-2"/>}
                                    Limpiar {state.selectedAssignmentIds.size} Asignacion(es)
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>¿Confirmar Limpieza?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Se eliminarán permanentemente las <strong>{state.selectedAssignmentIds.size}</strong> asignaciones seleccionadas. Esta acción no se puede deshacer.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={actions.handleCleanup}>Sí, limpiar</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                     </div>
                 </div>
             )}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden w-full">
                {/* Column 1: Buildings */}
                <ScrollArea className="border-r w-full md:w-[16%] md:min-w-[160px]">
                    <div className="p-2">
                        <h3 className="font-semibold px-2 py-1">Bodegas / Zonas</h3>
                        {selectors.buildings.map(building => (
                            <button
                                key={building.id}
                                onClick={() => actions.selectBuilding(building.id)}
                                className={cn(
                                    "w-full text-left p-2 rounded-md flex items-center gap-2",
                                    state.selectedBuildingId === building.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                                    selectors.isHighlighted(building.id) && "ring-2 ring-blue-500"
                                )}
                            >
                                <LocationIcon type={building.type} />
                                <span className="flex-1 truncate">{building.name}</span>
                            </button>
                        ))}
                    </div>
                </ScrollArea>
                
                {/* Column 2: Racks */}
                <ScrollArea className="border-r bg-muted/20 w-full md:w-[12%] md:min-w-[120px]">
                    <div className="p-2">
                        <h3 className="font-semibold px-2 py-1">Racks</h3>
                        {selectors.racks.map(rack => (
                            <button
                                key={rack.id}
                                onClick={() => actions.selectRack(rack.id)}
                                className={cn(
                                    "w-full text-left p-2 rounded-md flex items-center gap-2",
                                    state.selectedRackId === rack.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                                    selectors.isHighlighted(rack.id) && "ring-2 ring-blue-500"
                                )}
                            >
                                <LocationIcon type={rack.type} />
                                <span className="flex-1 truncate">{rack.name}</span>
                            </button>
                        ))}
                    </div>
                </ScrollArea>

                {/* Column 3: Levels */}
                <ScrollArea className="border-r w-full md:w-[12%] md:min-w-[120px]">
                     <div className="p-2">
                        <h3 className="font-semibold px-2 py-1">Niveles</h3>
                        {selectors.levels.map(level => (
                            <button
                                key={level.id}
                                onClick={() => actions.selectLevel(level.id)}
                                className={cn(
                                    "w-full text-left p-2 rounded-md flex items-center gap-2",
                                    state.selectedLevelId === level.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                                    selectors.isHighlighted(level.id) && "ring-2 ring-blue-500"
                                )}
                            >
                                <LocationIcon type={level.type} />
                                <span className="flex-1 truncate">{level.name}</span>
                            </button>
                        ))}
                    </div>
                </ScrollArea>

                {/* Column 4: Ocupación */}
                 <ScrollArea className="p-4 space-y-4 w-full md:w-[30%] md:min-w-[250px] md:flex-1">
                     {state.selectedBuildingId === null ? (
                        <div className="flex h-full items-center justify-center">
                            <p className="text-muted-foreground text-center p-8">Selecciona una bodega para empezar.</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <h4 className="font-semibold">Ocupación ({selectors.details.items.length})</h4>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar en esta selección..."
                                        value={state.detailsSearchTerm}
                                        onChange={(e) => actions.setDetailsSearchTerm(e.target.value)}
                                        className="pl-8"
                                    />
                                </div>
                                <div className="flex items-center space-x-2 pt-2">
                                    <Checkbox
                                        id="select-all-items"
                                        checked={selectors.areAllSelected}
                                        onCheckedChange={(checked) => actions.handleSelectAllAssignments(!!checked)}
                                        disabled={selectors.details.items.length === 0}
                                    />
                                    <Label htmlFor="select-all-items">Seleccionar todo</Label>
                                </div>
                                <ScrollArea className="h-60 border rounded-md">
                                        <div className="p-2 space-y-1">
                                        {selectors.details.items.length > 0 ? (
                                            selectors.details.items.map(item => (
                                                <div key={item.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-background">
                                                    <Checkbox 
                                                        id={`item-${item.id}`}
                                                        checked={state.selectedAssignmentIds.has(item.id)}
                                                        onCheckedChange={() => actions.handleToggleAssignmentSelection(item.id)}
                                                    />
                                                    <Label htmlFor={`item-${item.id}`} className="flex flex-col flex-1 cursor-pointer">
                                                        <span className="font-medium">[{item.itemId}] {item.productName}</span>
                                                        <span className="text-xs text-muted-foreground">{item.locationPath}</span>
                                                    </Label>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center text-sm text-muted-foreground py-4">No hay productos asignados en la selección actual.</div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        </>
                    )}
                </ScrollArea>

                {/* Column 5: Ubicaciones Libres */}
                 <ScrollArea className="border-l p-4 bg-muted/20 w-full md:w-[30%] md:min-w-[250px] md:flex-1">
                      {state.selectedBuildingId !== null && (
                         <div className="space-y-2">
                            <h4 className="font-semibold">Ubicaciones Libres ({selectors.details.emptyLocations.length})</h4>
                            {selectors.details.emptyLocations.length > 0 ? (
                                <div className="space-y-1 pr-2">
                                    {selectors.details.emptyLocations.map(loc => (
                                        <div key={loc.id} className="p-1 text-sm text-muted-foreground truncate" title={loc.path}>{loc.path}</div>
                                    ))}
                                </div>
                            ) : (
                                    <p className="text-sm text-muted-foreground pt-4">No hay ubicaciones libres en la selección actual.</p>
                            )}
                        </div>
                      )}
                 </ScrollArea>
            </div>
        </main>
    );
}
