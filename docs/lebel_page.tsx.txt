/**
 * @fileoverview Page for the Label Center tool.
 * Allows users to generate and print labels for warehouse locations or products in locations.
 */
'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { Loader2, Printer, List, Tags } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useLabelCenter } from '@/modules/warehouse/hooks/useLabelCenter';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';


export default function LabelCenterPage() {
    const { isAuthorized } = useAuthorization(['warehouse:labels:generate']);
    const { setTitle } = usePageTitle();
    
    useEffect(() => {
        setTitle("Centro de Etiquetas");
    }, [setTitle]);
    
    const { state, actions, selectors } = useLabelCenter();

    if (!isAuthorized) {
        return <p>Acceso denegado.</p>;
    }

    if (state.isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                 <Skeleton className="h-96 w-full max-w-3xl mx-auto" />
            </main>
        )
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-3xl space-y-8">
                 <Card>
                    <CardHeader>
                        <div className="flex items-center gap-4">
                             <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500 text-white">
                                <Tags className="h-6 w-6" />
                            </div>
                            <div>
                                <CardTitle>Centro de Etiquetas de Almacén</CardTitle>
                                <CardDescription>Genera etiquetas por lotes para ubicaciones o productos en ubicaciones específicas.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label className="font-semibold text-lg">Paso 1: Selecciona un Rack Raíz</Label>
                             <SearchInput
                                options={selectors.rackOptions}
                                onSelect={actions.handleSelectRack}
                                value={state.rackSearchTerm}
                                onValueChange={actions.setRackSearchTerm}
                                open={state.isRackSearchOpen}
                                onOpenChange={actions.setIsRackSearchOpen}
                                placeholder="Busca un rack por nombre o código..."
                            />
                        </div>

                        {state.selectedRack && (
                            <>
                                <div className="space-y-4">
                                    <Label className="font-semibold text-lg">Paso 2: Filtra las Ubicaciones (Opcional)</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <MultiSelectFilter
                                            title="Filtrar por Nivel"
                                            options={selectors.levelOptions}
                                            selectedValues={state.levelFilter}
                                            onSelectedChange={actions.setLevelFilter}
                                        />
                                        <MultiSelectFilter
                                            title="Filtrar por Posición"
                                            options={selectors.positionOptions}
                                            selectedValues={state.positionFilter}
                                            onSelectedChange={actions.setPositionFilter}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <Label className="font-semibold text-lg">Paso 3: Elige el Tipo de Etiqueta</Label>
                                    <RadioGroup value={state.labelType} onValueChange={(v) => actions.setLabelType(v as 'location' | 'product_location')}>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="location" id="type-location" />
                                            <Label htmlFor="type-location" className="font-normal">Etiqueta de Ubicación (para rotular estantes)</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="product_location" id="type-product-location" />
                                            <Label htmlFor="type-product-location" className="font-normal">Etiqueta de Producto en Ubicación (para modo escáner)</Label>
                                        </div>
                                    </RadioGroup>
                                </div>
                            </>
                        )}
                    </CardContent>
                    {state.selectedRack && (
                        <CardFooter className="flex-col items-start gap-4 border-t pt-6">
                             <div className="text-sm text-muted-foreground">
                                Se generarán <strong>{selectors.filteredLocations.length}</strong> etiqueta(s) según los filtros seleccionados.
                            </div>
                            <Button onClick={actions.handleGeneratePdf} disabled={state.isSubmitting || selectors.filteredLocations.length === 0}>
                                {state.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Printer className="mr-2 h-4 w-4"/>
                                Generar PDF
                            </Button>
                        </CardFooter>
                    )}
                 </Card>
            </div>
        </main>
    );
}
