/**
 * @fileoverview Main warehouse search page.
 * This component allows users to search for products or customers and see a consolidated
 * view of their assigned physical locations (from the warehouse module) and their
 * stock levels from the ERP system. This version is mobile-first and uses a hierarchical display.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from "jspdf";
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { addInventoryUnit } from '@/modules/warehouse/lib/actions';
import { syncAllData } from '@/modules/core/lib/actions';
import type { WarehouseLocation, WarehouseInventoryItem, Product, StockInfo, StockSettings, ItemLocation, Customer, InventoryUnit, Warehouse } from '@/modules/core/types';
import { Search, MapPin, Package, Building, Waypoints, Box, Layers, Warehouse as WarehouseIcon, RefreshCw, Loader2, Info, User, ChevronRight, Printer, Filter, Archive, FilterX } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Button } from '@/components/ui/button';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { Separator } from '@/components/ui/separator';
import { SearchInput } from '@/components/ui/search-input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { format, parseISO } from 'date-fns';
import { cn } from "@/lib/utils";
import { Badge } from '@/components/ui/badge';

type SearchResultItem = {
    product: Product;
    physicalLocations: {
        path: React.ReactNode;
        quantity?: number;
        clientId?: string;
        location: WarehouseLocation | undefined;
    }[];
    erpStock: StockInfo | null;
    client?: Customer | null;
    requiresCertificate?: boolean;
}

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const renderLocationPathAsString = (locationId: number, locations: WarehouseLocation[]): string => {
    if (!locationId) return "N/A";
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
    while (current) {
        path.unshift(current);
        const parentId = current.parentId;
        current = parentId ? locations.find(l => l.id === parentId) : undefined;
    }
    return path.map(l => l.name).join(' > ');
};

const LocationIcon = ({ type }: { type: WarehouseLocation['type'] }) => {
    switch (type) {
        case 'building': return <Building className="h-5 w-5 text-muted-foreground" />;
        case 'zone': return <Waypoints className="h-5 w-5 text-muted-foreground" />;
        case 'rack': return <Box className="h-5 w-5 text-muted-foreground" />;
        case 'shelf': return <Layers className="h-5 w-5 text-muted-foreground" />;
        case 'bin': return <Archive className="h-5 w-5 text-muted-foreground" />;
        default: return <MapPin className="h-5 w-5 text-muted-foreground" />;
    }
};

export default function WarehouseSearchPage() {
    useAuthorization(['warehouse:access']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const router = useRouter();
    const { 
        user, 
        companyData, 
        products, 
        customers, 
        isAuthReady,
        allLocations: locations,
        allInventory: inventory,
        allItemLocations,
        stockLevels: stock,
        stockSettings,
        refreshAuth
    } = useAuth();

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    
    const [debouncedSearchTerm] = useDebounce(searchTerm, companyData?.searchDebounceTime ?? 500);
    
    const [classificationFilter, setClassificationFilter] = useState<string[]>([]);
    const [warehouseFilter, setWarehouseFilter] = useState<string[]>([]);
    const [locationFilter, setLocationFilter] = useState<string[]>([]);

    const mixedLocationIds = useMemo(() => {
        const counts = new Map<number, number>();
        allItemLocations.forEach(il => {
            if (il.locationId) {
                counts.set(il.locationId, (counts.get(il.locationId) || 0) + 1);
            }
        });
        return new Set(
            Array.from(counts.entries())
                .filter(([_, count]) => count > 1)
                .map(([locationId]) => locationId)
        );
    }, [allItemLocations]);

    const renderLocationPath = useCallback((locationId: number | null | undefined, locations: WarehouseLocation[]) => {
        if (!locationId) return <span className="text-muted-foreground italic">Sin ubicación</span>;
        const path: WarehouseLocation[] = [];
        let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
        
        while (current) {
            path.unshift(current);
            const parentId = current.parentId;
            current = parentId ? locations.find(l => l.id === parentId) : undefined;
        }

        const isMixed = mixedLocationIds.has(locationId);

        return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {path.map((loc, index) => (
                    <React.Fragment key={loc.id}>
                        <div className="flex items-center gap-1">
                            <LocationIcon type={loc.type} />
                            <span>{loc.name}</span>
                        </div>
                        {index < path.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
                    </React.Fragment>
                ))}
                {isMixed && <Badge variant="destructive" className="ml-2">Mixta</Badge>}
            </div>
        );
    }, [mixedLocationIds]);
    
    const handleClearFilters = () => {
        setSearchTerm('');
        setClassificationFilter([]);
        setWarehouseFilter([]);
        setLocationFilter([]);
    };
    
    useEffect(() => {
        setTitle("Búsqueda en Almacén");
    }, [setTitle]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await syncAllData();
            await refreshAuth();
            toast({
                title: "Datos Actualizados",
                description: `Los datos del ERP se han sincronizado exitosamente.`
            });
        } catch (error: any) {
            logError("Error during manual data refresh", { error: error.message });
            toast({
                title: "Error al Refrescar",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsRefreshing(false);
        }
    };

    const hasActiveFilters = useMemo(() => 
        debouncedSearchTerm.length > 0 ||
        classificationFilter.length > 0 ||
        warehouseFilter.length > 0 ||
        locationFilter.length > 0,
        [debouncedSearchTerm, classificationFilter, warehouseFilter, locationFilter]
    );

    const filteredItems = useMemo((): SearchResultItem[] => {
        if (!hasActiveFilters || !isAuthReady) return [];

        const searchLower = normalizeText(debouncedSearchTerm);
        
        // QR Code detection
        if (searchLower.includes('>')) {
            const parts = searchLower.split('>');
            const productId = parts[1];
            if (productId) {
                const product = products.find(p => p.id.toLowerCase() === productId);
                if (product) {
                    const productInventory = inventory.filter(inv => inv.itemId === product.id);
                    const productItemLocations = allItemLocations.filter(il => il.itemId === product.id);
                    const requiresCertificate = productItemLocations.some(il => il.requiresCertificate === 1);
                    const physicalLocations = [
                        ...productInventory.map(inv => ({ path: renderLocationPath(inv.locationId, locations), quantity: inv.quantity, location: locations.find(l => l.id === inv.locationId) })),
                        ...productItemLocations.map(il => ({ path: renderLocationPath(il.locationId, locations), clientId: il.clientId || undefined, location: locations.find(l => l.id === il.locationId) }))
                    ];
                    const uniqueLocations = Array.from(new Map(physicalLocations.map(item => [item.location?.id, item])).values());
                    const client = customers.find(c => productItemLocations.some(il => il.clientId === c.id));
                    return [{
                        product: product,
                        physicalLocations: uniqueLocations,
                        erpStock: stock.find(s => s.itemId === product.id) || null,
                        client: client,
                        requiresCertificate: requiresCertificate,
                    }];
                }
                return [];
            }
        }
        
        let results: Product[] = [...products];
        if (debouncedSearchTerm) {
            const customerItemIds = new Set(
                allItemLocations
                    .filter(il => customers.some(c => c.id === il.clientId && normalizeText(c.name).includes(searchLower)))
                    .map(il => il.itemId)
            );
            results = results.filter(p =>
                normalizeText(`${p.id} ${p.description} ${p.barcode}`).includes(searchLower) ||
                customerItemIds.has(p.id)
            );
        }

        if (classificationFilter.length > 0) {
            results = results.filter(p => classificationFilter.includes(p.classification));
        }

        let searchResultItems = results.map(product => {
            const productInventory = inventory.filter(inv => inv.itemId === product.id);
            const productItemLocations = allItemLocations.filter(il => il.itemId === product.id);
            const requiresCertificate = productItemLocations.some(il => il.requiresCertificate === 1);
            const physicalLocations = [
                ...productInventory.map(inv => ({ path: renderLocationPath(inv.locationId, locations), quantity: inv.quantity, location: locations.find(l => l.id === inv.locationId) })),
                ...productItemLocations.map(il => ({ path: renderLocationPath(il.locationId, locations), clientId: il.clientId || undefined, location: locations.find(l => l.id === il.locationId) }))
            ];
            const uniqueLocations = Array.from(new Map(physicalLocations.map(item => [item.location?.id, item])).values());
            const client = customers.find(c => productItemLocations.some(il => il.clientId === c.id));
            
            return {
                product: product,
                physicalLocations: uniqueLocations,
                erpStock: stock.find(s => s.itemId === product.id) || null,
                client: client,
                requiresCertificate: requiresCertificate,
            };
        });

        if (warehouseFilter.length > 0) {
            searchResultItems = searchResultItems.filter(item => 
                item.erpStock && Object.keys(item.erpStock.stockByWarehouse).some(whId => warehouseFilter.includes(whId) && item.erpStock!.stockByWarehouse[whId] > 0)
            );
        }

        if (locationFilter.length > 0) {
            searchResultItems = searchResultItems.filter(item => 
                item.physicalLocations.some(loc => loc.location && locationFilter.includes(String(loc.location.id)))
            );
        }
        
        return searchResultItems.sort((a, b) => a.product.id.localeCompare(b.product.id));

    }, [hasActiveFilters, products, allItemLocations, customers, inventory, stock, locations, debouncedSearchTerm, classificationFilter, warehouseFilter, locationFilter, isAuthReady, renderLocationPath]);
    
    const handlePrintUnitLabel = async (product: Product, location: WarehouseLocation) => {
        if (!user || !companyData) return;
        setIsPrinting(true);
        try {
            const newUnit = await addInventoryUnit({ productId: product.id, locationId: location.id, createdBy: user.name, notes: 'Etiqueta generada desde búsqueda.', quantity: 1 });

            const qrCodeDataUrl = await QRCode.toDataURL(newUnit.unitCode!, { errorCorrectionLevel: 'H', width: 200 });

            const barcodeCanvas = document.createElement('canvas');
            JsBarcode(barcodeCanvas, newUnit.unitCode!, { format: 'CODE128', displayValue: false });
            const barcodeDataUrl = barcodeCanvas.toDataURL('image/png');

            const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [4, 3] });
            const margin = 0.2;
            const contentWidth = 4 - (margin * 2);
            
            const leftColX = margin;
            const leftColWidth = 1.2;
            doc.addImage(qrCodeDataUrl, 'PNG', leftColX, margin, leftColWidth, leftColWidth);
            doc.addImage(barcodeDataUrl, 'PNG', leftColX, margin + leftColWidth + 0.1, leftColWidth, 0.4);
            doc.setFontSize(10).text(newUnit.unitCode!, leftColX + leftColWidth / 2, margin + leftColWidth + 0.1 + 0.4 + 0.15, { align: 'center' });

            const rightColX = leftColX + leftColWidth + 0.2;
            const rightColWidth = contentWidth - leftColWidth - 0.2;

            let currentY = margin + 0.1;
            doc.setFontSize(14).setFont('Helvetica', 'bold').text(`Producto: ${product.id}`, rightColX, currentY);
            currentY += 0.2;
            
            doc.setFontSize(9).setFont('Helvetica', 'normal');
            const descLines = doc.splitTextToSize(product.description, rightColWidth);
            doc.text(descLines, rightColX, currentY);
            currentY += (descLines.length * 0.15) + 0.2;
            
            doc.setFontSize(10).setFont('Helvetica', 'bold').text(`Ubicación:`, rightColX, currentY);
            currentY += 0.15;
            
            doc.setFontSize(9).setFont('Helvetica', 'normal');
            const locLines = doc.splitTextToSize(renderLocationPathAsString(location.id, locations), rightColWidth);
            doc.text(locLines, rightColX, currentY);
            
            const footerY = 3 - margin;
            doc.setFontSize(8).setTextColor(150);
            doc.text(`Creado: ${format(new Date(), 'dd/MM/yyyy')} por ${user?.name || 'Sistema'}`, 4 - margin, footerY, { align: 'right' });

            doc.save(`etiqueta_unidad_${newUnit.unitCode}.pdf`);
            
            toast({ title: "Etiqueta Generada", description: `Se creó la unidad ${newUnit.unitCode} y se generó el PDF.` });

        } catch (err: any) {
            logError("Failed to generate and print label", { error: err.message, productId: product.id });
            toast({ title: 'Error al Imprimir', description: err.message, variant: 'destructive' });
        } finally {
            setIsPrinting(false);
        }
    };
    
    const handlePrintProductLocationLabel = async (product: Product, location: WarehouseLocation) => {
        if (!companyData || !user) return;
        setIsPrinting(true);
        try {
            const qrContent = `${location.id}>${product.id}`;
            const qrCodeDataUrl = await QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'M', width: 200 });
            
            const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
            const margin = 40;
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            doc.addImage(qrCodeDataUrl, 'PNG', margin, margin, 100, 100);

            doc.setFontSize(9);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor('#666');
            doc.text(`Creado: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin, { align: 'right' });
            if (user) {
                doc.text(`por ${user.name}`, pageWidth - margin, margin + 12, { align: 'right' });
            }

            doc.setTextColor('#000');
            
            doc.setFontSize(150);
            doc.setFont('Helvetica', 'bold');
            doc.text(product.id, pageWidth / 2, pageHeight / 2 - 40, { align: 'center'});

            doc.setFontSize(52);
            doc.setFont('Helvetica', 'normal');
            const descLines = doc.splitTextToSize(product.description, pageWidth - margin * 2);
            doc.text(descLines, pageWidth / 2, pageHeight / 2 + 50, { align: 'center' });

            const footerText = renderLocationPathAsString(location.id, locations);
            doc.setFontSize(24);
            doc.setFont('Helvetica', 'bold');
            doc.text('Ubicación:', margin, pageHeight - 80);
            doc.setFontSize(28);
            doc.setFont('Helvetica', 'normal');
            const footerLines = doc.splitTextToSize(footerText, pageWidth - margin * 2);
            doc.text(footerLines, margin, pageHeight - 50);

            doc.save(`etiqueta_escaner_${product.id}_${location.code}.pdf`);
            toast({ title: "Etiqueta para Escáner Generada" });
        } catch (err: any) {
            logError("Failed to generate scanner label", { error: err.message, productId: product.id, locationId: location.id });
            toast({ title: 'Error al Imprimir', description: err.message, variant: 'destructive' });
        } finally {
            setIsPrinting(false);
        }
    };
    
    const classifications = useMemo(() => Array.from(new Set(products.map(p => p.classification).filter(Boolean))), [products]);
    const warehouseOptions = useMemo(() => stockSettings?.warehouses.map((w: Warehouse) => ({ value: w.id, label: w.name })) || [], [stockSettings]);
    const locationOptions = useMemo(() => locations.map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, locations) })), [locations]);


    if (!isAuthReady) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card className="max-w-5xl mx-auto">
                    <CardHeader>
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-6 w-full max-w-md mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-40 w-full" />
                    </CardContent>
                </Card>
            </main>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm p-4 border-b">
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 max-w-5xl mx-auto">
                    <div className="w-full flex-1">
                        <SearchInput
                            options={[]} // No popover for global search
                            onSelect={() => {}}
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                            onOpenChange={setIsSearchOpen}
                            open={false}
                            placeholder="Buscar por artículo, cliente, código, etc..."
                            className="text-lg h-12"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                         <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="outline" className="w-full sm:w-auto">
                                    <Filter className="mr-2 h-4 w-4" /> Filtros Avanzados
                                </Button>
                            </SheetTrigger>
                            <SheetContent>
                                <SheetHeader>
                                    <SheetTitle>Filtros Avanzados</SheetTitle>
                                    <SheetDescription>Refina tu búsqueda con estas opciones.</SheetDescription>
                                </SheetHeader>
                                <div className="py-4 space-y-4">
                                     <MultiSelectFilter
                                        title="Clasificación"
                                        options={classifications.map(c => ({ value: c, label: c }))}
                                        selectedValues={classificationFilter}
                                        onSelectedChange={setClassificationFilter}
                                    />
                                    <MultiSelectFilter
                                        title="Bodega (ERP)"
                                        options={warehouseOptions}
                                        selectedValues={warehouseFilter}
                                        onSelectedChange={setWarehouseFilter}
                                    />
                                     <MultiSelectFilter
                                        title="Ubicación Física"
                                        options={locationOptions}
                                        selectedValues={locationFilter}
                                        onSelectedChange={setLocationFilter}
                                    />
                                    <Separator />
                                     <Button variant="ghost" onClick={handleClearFilters} className="w-full justify-start">
                                        <FilterX className="mr-2 h-4 w-4" />Limpiar Todos los Filtros
                                    </Button>
                                    <Button onClick={handleRefresh} disabled={isRefreshing} className="w-full">
                                        {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                        Refrescar Datos del ERP
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </div>
            <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
                <div className="max-w-5xl mx-auto space-y-4">
                    {!isAuthReady ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="animate-spin h-8 w-8 text-muted-foreground"/>
                        </div>
                    ) : filteredItems.length > 0 ? (
                        filteredItems.map((item, itemIndex) => {
                            const warehouseEntries = (item.erpStock?.stockByWarehouse) 
                                ? Object.entries(item.erpStock.stockByWarehouse)
                                    .filter(([, qty]) => qty > 0)
                                    .map(([whId, qty]) => ({
                                        whId,
                                        qty,
                                        warehouse: stockSettings?.warehouses.find((w: Warehouse) => w.id === whId)
                                    }))
                                    .filter(entry => entry.warehouse?.isVisible)
                                    .sort((a, b) => (a.warehouse?.id || '').localeCompare(b.warehouse?.id || '')) // Sort by warehouse ID
                                : [];

                            return (
                                <Card key={item.product.id} className="w-full">
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-xl flex items-center gap-2">
                                                    <Package className="h-6 w-6 text-primary" />
                                                    {item.product?.description || 'Producto no encontrado'}
                                                </CardTitle>
                                                <CardDescription>
                                                    Código: {item.product?.id}
                                                </CardDescription>
                                            </div>
                                             <div className="flex flex-col items-end gap-1">
                                                <Badge variant={item.product.active === 'S' ? 'default' : 'destructive'} className={item.product.active === 'S' ? 'bg-green-600' : ''}>
                                                    {item.product.active === 'S' ? 'Activo' : 'Inactivo'}
                                                </Badge>
                                                <Badge variant="secondary">{item.product?.classification}</Badge>
                                                {item.requiresCertificate && <Badge className="bg-orange-500 text-white font-semibold">Certificado</Badge>}
                                            </div>
                                        </div>
                                         <div className="text-sm text-muted-foreground pt-2 space-y-1">
                                            <p><strong>Unidad de Venta:</strong> {item.product.unit}</p>
                                            {item.product.barcode && <p><strong>Código de Barras:</strong> {item.product.barcode}</p>}
                                            {item.product.notes && <p><strong>Notas:</strong> {item.product.notes}</p>}
                                        </div>
                                         {item.client && (
                                            <div className="text-sm text-muted-foreground flex items-center gap-2 pt-1">
                                                <User className="h-4 w-4"/>
                                                <span>Inventario de Cliente: <strong>{item.client.name}</strong> ({item.client.id})</span>
                                            </div>
                                        )}
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                        <div>
                                            <h4 className="font-semibold mb-2">Ubicaciones y Cantidades Físicas</h4>
                                            <div className="space-y-2">
                                            {item.physicalLocations.length > 0 ? item.physicalLocations.map((loc, index) => (
                                                <div key={index} className="flex justify-between items-center p-2 border rounded-md">
                                                    <div>
                                                        {loc.path}
                                                        {loc.clientId && <p className="text-xs text-blue-600 font-medium">Cliente: {customers.find(c => c.id === loc.clientId)?.name || loc.clientId}</p>}
                                                    </div>
                                                    <div className='flex items-center gap-1'>
                                                        {loc.quantity !== undefined && (
                                                            <span className="font-bold text-lg">{loc.quantity.toLocaleString()}</span>
                                                        )}
                                                        {item.product && loc.location && (
                                                            <>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700" onClick={() => handlePrintUnitLabel(item.product!, loc.location!)} title="Imprimir Etiqueta de Unidad">
                                                                    <Printer className="h-4 w-4" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-600 hover:text-orange-700" onClick={() => handlePrintProductLocationLabel(item.product!, loc.location!)} title="Imprimir Etiqueta de Escáner">
                                                                    <Printer className="h-4 w-4" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )) : <p className="text-sm text-muted-foreground">Sin ubicaciones físicas registradas.</p>}
                                            </div>
                                        </div>
                                        <div>
                                             <h4 className="font-semibold mb-2">Existencias por Bodega (ERP)</h4>
                                             {warehouseEntries.length > 0 ? (
                                                 <div className="space-y-2">
                                                    {warehouseEntries.map(entry => (
                                                        <div key={entry.whId} className="flex justify-between items-center p-2 border rounded-md">
                                                            <span className="flex items-center gap-2">
                                                                <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: entry.warehouse?.color || '#CCCCCC' }}></span>
                                                                {entry.warehouse?.name} ({entry.whId})
                                                            </span>
                                                            <span className="font-bold text-lg">{entry.qty.toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                     <Separator />
                                                     <div className="flex justify-between items-center p-2 font-bold">
                                                        <span>Total ERP</span>
                                                        <span className="text-xl">{item.erpStock?.totalStock.toLocaleString()}</span>
                                                     </div>
                                                 </div>
                                             ) : (
                                                 <p className="text-sm text-muted-foreground">Sin datos de existencias en el ERP.</p>
                                             )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })
                    ) : (
                        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                             <div className="flex flex-col items-center gap-2 text-center">
                                {hasActiveFilters ? (
                                    <>
                                        <h3 className="text-2xl font-bold tracking-tight">Sin Resultados</h3>
                                        <p className="text-sm text-muted-foreground">No se encontraron productos o clientes para los filtros aplicados.</p>
                                    </>
                                ) : (
                                    <>
                                        <Search className="h-12 w-12 text-muted-foreground" />
                                        <h3 className="text-2xl font-bold tracking-tight">Realiza una Búsqueda</h3>
                                        <p className="text-sm text-muted-foreground max-w-md">Usa la barra de búsqueda superior para encontrar productos por código, descripción o código de barras, o para localizar un cliente.</p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>
            {isPrinting && (
                 <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-primary p-3 text-primary-foreground shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Generando PDF...</span>
                </div>
            )}
        </div>
    );
}
