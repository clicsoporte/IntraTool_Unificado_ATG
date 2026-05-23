
/**
 * @fileoverview New page for physical inventory counting.
 * This component allows users to select a product and location, and input the physically counted quantity.
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Save, List, ScanLine, CheckCircle, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useInventoryCount, CountMode } from '@/modules/warehouse/hooks/useInventoryCount';
import { SearchInput } from '@/components/ui/search-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const ManualMode = () => {
    const { state, actions, selectors } = useInventoryCount();
    const { 
        isSubmitting, keepLocation, locationSearchTerm, isLocationSearchOpen, 
        productSearchTerm, isProductSearchOpen, countedQuantity 
    } = state;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Toma de Inventario Físico</CardTitle>
                <CardDescription>Selecciona un producto y una ubicación para registrar la cantidad contada físicamente.</CardDescription>
                <div className="flex items-center space-x-2 pt-4">
                    <Switch id="keep-location" checked={keepLocation} onCheckedChange={actions.setKeepLocation} />
                    <Label htmlFor="keep-location">Mantener Ubicación Seleccionada</Label>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label>1. Seleccione una Ubicación</Label>
                    <div className="flex items-center gap-2">
                        <SearchInput options={selectors.locationOptions} onSelect={(option) => actions.handleSelectLocation(option.value)} value={locationSearchTerm} onValueChange={actions.setLocationSearchTerm} placeholder="Buscar... ('*' o vacío para ver todas)" open={isLocationSearchOpen} onOpenChange={actions.setLocationSearchOpen} />
                        <Button type="button" variant="outline" size="icon" onClick={() => { actions.setLocationSearchTerm('*'); actions.setLocationSearchOpen(true); }}>
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>2. Seleccione un Producto</Label>
                    <SearchInput options={selectors.productOptions} onSelect={(option) => actions.handleSelectProduct(option.value)} value={productSearchTerm} onValueChange={actions.setProductSearchTerm} placeholder="Buscar producto..." open={isProductSearchOpen} onOpenChange={actions.setProductSearchOpen} />
                </div>
                <div className="space-y-2">
                    <Label>3. Ingrese la Cantidad Contada</Label>
                    <Input type="number" value={countedQuantity} onChange={(e) => actions.setCountedQuantity(e.target.value)} placeholder="0" className="text-lg h-12" />
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={actions.handleSaveManualCount} disabled={isSubmitting || !state.selectedProductId || !state.selectedLocationId || countedQuantity === ''}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    Guardar Conteo
                </Button>
            </CardFooter>
        </Card>
    );
};

const ScannerMode = () => {
    const { state, actions, refs, selectors } = useInventoryCount();
    const { isSubmitting, scanInput, scannerQuantityInput, scannerLoadedData, lastCountInfo } = state;
    return (
        <Card className="w-full max-w-lg">
            <CardHeader>
                <CardTitle>Modo Escáner</CardTitle>
                <CardDescription>Escanea una etiqueta QR de producto en ubicación para cargar los datos automáticamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="scan-input" className="text-lg font-semibold">1. Escanear Etiqueta</Label>
                     <Input
                        ref={refs.scanInputRef}
                        id="scan-input"
                        placeholder="Esperando escaneo de QR..."
                        value={scanInput}
                        onChange={(e) => actions.handleScanInput(e.target.value)}
                        onKeyDown={actions.handleScanKeyDown}
                        className="text-lg h-14"
                        autoFocus
                    />
                </div>
                {scannerLoadedData && (
                    <div className="space-y-4 rounded-md border p-4 bg-muted/50">
                        <div>
                            <Label className="text-xs text-muted-foreground">Producto</Label>
                            <p className="font-semibold">[{scannerLoadedData.product.id}] {scannerLoadedData.product.description}</p>
                        </div>
                         <div>
                            <Label className="text-xs text-muted-foreground">Ubicación</Label>
                            <p className="font-semibold">{selectors.getLocationPathString(scannerLoadedData.location.id)}</p>
                        </div>
                        <div className="space-y-2 pt-2">
                             <Label htmlFor="scanner-quantity" className="text-lg font-semibold">2. Ingresar Cantidad</Label>
                             <Input
                                ref={refs.quantityInputRef}
                                id="scanner-quantity"
                                type="number"
                                value={scannerQuantityInput}
                                onChange={(e) => actions.setScannerQuantityInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && actions.handleSaveScannerCount()}
                                placeholder="0"
                                className="text-2xl h-16 hide-number-arrows"
                            />
                        </div>
                    </div>
                )}
                 {lastCountInfo && (
                    <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertTitle>Último Conteo Guardado</AlertTitle>
                        <AlertDescription className="text-xs">
                           Se registraron <strong>{lastCountInfo.quantity}</strong> unidades de <strong>{lastCountInfo.product}</strong> en <strong>{lastCountInfo.location}</strong>.
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
            <CardFooter>
                 <Button onClick={actions.handleSaveScannerCount} disabled={isSubmitting || !scannerLoadedData || !scannerQuantityInput} className="w-full">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4"/>
                    Guardar Conteo
                </Button>
            </CardFooter>
        </Card>
    )
}

export default function InventoryCountPage() {
    const { state, actions, isAuthorized } = useInventoryCount();
    const { isLoading, mode } = state;

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <Skeleton className="h-96 w-full max-w-2xl" />
            </main>
        );
    }
    
    if (isAuthorized === false) {
        return null;
    }
    
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-2xl space-y-4">
                 <div className="flex items-center justify-center space-x-2 mb-6">
                    <Label htmlFor="mode-switch" className={mode === 'manual' ? 'font-bold' : ''}>Modo Manual</Label>
                    <Switch
                        id="mode-switch"
                        checked={mode === 'scanner'}
                        onCheckedChange={(checked) => actions.setMode(checked ? 'scanner' : 'manual')}
                    />
                    <Label htmlFor="mode-switch" className={mode === 'scanner' ? 'font-bold' : ''}>Modo Escáner</Label>
                </div>

                <div className="flex justify-end pb-4">
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={actions.handleClearAllCounts}
                        disabled={state.isSubmitting}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Borrar Toda la Toma Actual
                    </Button>
                </div>
                 <div className="flex items-center justify-center">
                    {mode === 'manual' ? <ManualMode /> : <ScannerMode />}
                </div>
            </div>
        </main>
    );
}
