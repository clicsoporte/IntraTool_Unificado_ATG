/**
 * @fileoverview Simplified warehouse search page, optimized for mobile devices and scanners.
 * This component provides a minimal UI for warehouse workers to quickly look up items
 * by their exact code.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { addInventoryUnit } from '@/modules/warehouse/lib/actions';
import type { WarehouseLocation, WarehouseInventoryItem, Product, StockInfo, StockSettings, ItemLocation, Customer, InventoryUnit, Warehouse } from '@/modules/core/types';
import { Search, MapPin, Package, Building, Waypoints, Box, Layers, Warehouse as WarehouseIcon, RefreshCw, Loader2, Info, User, ChevronRight, Printer, LogOut, Archive } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Button } from '@/components/ui/button';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import jsPDF from "jspdf";
import QRCode from 'qrcode';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import JsBarcode from 'jsbarcode';

type SearchResultItem = {
    product: Product | null;
    physicalLocations: {
        path: React.ReactNode;
        quantity?: number;
        clientId?: string;
        location: WarehouseLocation | undefined;
    }[];
    erpStock: StockInfo | null;
    requiresCertificate?: boolean;
}

const renderLocationPathAsString = (locationId: number | null | undefined, locations: WarehouseLocation[]): string => {
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




export default function SimpleWarehouseSearchPage() {
    useAuthorization(['warehouse:access']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { 
        user, 
        companyData, 
        products, 
        customers, 
        logout, 
        isAuthReady,
        allLocations: locations,
        allInventory: inventory,
        allItemLocations,
        stockLevels: stock,
        stockSettings
    } = useAuth();
    
    const inputRef = useRef<HTMLInputElement>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [lastSearchedItem, setLastSearchedItem] = useState<Product | null>(null);

    const [debouncedSearchTerm] = useDebounce(searchTerm, 300); // Shorter debounce for faster scanner response

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
    
    useEffect(() => {
        setTitle("Búsqueda Rápida de Almacén");
    }, [setTitle]);

    // Effect to auto-focus input on page load/reload
    useEffect(() => {
        if (isAuthReady) {
            inputRef.current?.focus();
        }
    }, [isAuthReady]);

    // This effect triggers the automatic search when the debounced term changes.
    useEffect(() => {
        if (debouncedSearchTerm) {
            const trimmedSearch = debouncedSearchTerm.trim();
            const searchLower = trimmedSearch.toLowerCase();
            
            let exactMatch: Product | undefined;

            if (searchLower.includes('>')) {
                // QR Code Format: LOCATION_ID>PRODUCT_ID
                const parts = searchLower.split('>');
                const productId = parts[1];
                exactMatch = products.find(p => p.id.toLowerCase() === productId);
            } else {
                // Normal search by product ID or barcode
                exactMatch = products.find(p => 
                    p.id.toLowerCase() === searchLower || 
                    p.barcode?.toLowerCase() === searchLower
                );
            }
            
            if (exactMatch) {
                setLastSearchedItem(exactMatch);
                // Clear input after search to prepare for next scan
                setTimeout(() => {
                    setSearchTerm('');
                    inputRef.current?.focus();
                }, 500);
            } else {
                setLastSearchedItem(null);
            }
        }
    }, [debouncedSearchTerm, products]);
    
    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // The useEffect with debouncedSearchTerm will handle the logic.
            // This just ensures enter key can also trigger it if needed.
            const searchLower = searchTerm.trim().toLowerCase();
            let exactMatch: Product | undefined;

            if (searchLower.includes('>')) {
                const parts = searchLower.split('>');
                const productId = parts[1];
                exactMatch = products.find(p => p.id.toLowerCase() === productId);
            } else {
                 exactMatch = products.find(p => 
                    p.id.toLowerCase() === searchLower || 
                    p.barcode?.toLowerCase() === searchLower
                );
            }
            if (exactMatch) {
                setLastSearchedItem(exactMatch);
            }
            setTimeout(() => {
                setSearchTerm('');
                inputRef.current?.focus();
            }, 100);
        }
    };

    const searchResult = useMemo((): SearchResultItem | null => {
        if (!lastSearchedItem) return null;

        const erpStock = stock.find(s => s.itemId.toUpperCase() === lastSearchedItem.id.toUpperCase()) || null;
        
        const physicalLocations = inventory
            .filter(inv => inv.itemId === lastSearchedItem.id)
            .map(inv => ({
                path: renderLocationPath(inv.locationId, locations),
                quantity: inv.quantity,
                location: locations.find(l => l.id === inv.locationId),
            }));

        const designatedLocations = allItemLocations
            .filter(itemLoc => itemLoc.itemId === lastSearchedItem.id)
            .map(itemLoc => ({
                path: renderLocationPath(itemLoc.locationId, locations),
                clientId: itemLoc.clientId || undefined,
                location: locations.find(l => l.id === itemLoc.locationId),
            }));

        const allPhysical = [...physicalLocations, ...designatedLocations];
        const uniqueLocations = Array.from(new Map(allPhysical.map(item => [item.location?.id, item])).values());
        
        const requiresCertificate = allItemLocations.some(il => il.itemId === lastSearchedItem.id && il.requiresCertificate === 1);

        return {
            product: lastSearchedItem,
            physicalLocations: uniqueLocations,
            erpStock: erpStock,
            requiresCertificate: requiresCertificate,
        };
    }, [lastSearchedItem, inventory, allItemLocations, stock, locations, renderLocationPath]);

    const handlePrintUnitLabel = async (product: Product, location: WarehouseLocation) => {
        if (!user || !companyData) return;
        setIsPrinting(true);
        try {
            const newUnit = await addInventoryUnit({ productId: product.id, locationId: location.id, createdBy: user.name, notes: 'Etiqueta de unidad generada desde búsqueda simple.', quantity: 1 });
            
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
            
            toast({ title: "Etiqueta de Unidad Generada", description: `Se creó la unidad ${newUnit.unitCode} y se generó el PDF.` });

        } catch (err: any) {
            logError("Failed to generate and print unit label", { error: err.message, productId: product.id });
            toast({ title: 'Error al Imprimir', description: err.message, variant: 'destructive' });
        } finally {
            setIsPrinting(false);
        }
    };
    
    const handlePrintProductLocationLabel = async (product: Product, location: WarehouseLocation) => {
        if (!companyData || !user) return;
        setIsPrinting(true);
        try {
            const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
            const qrContent = `${location.id}>${product.id}`;
            const qrCodeDataUrl = await QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'M', width: 200 });

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

    if (!isAuthReady || !stockSettings) {
        return <div className="flex h-screen w-full items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
    }

    return (
        <div className="flex flex-col min-h-screen bg-muted p-2 md:p-4">
            <header className="flex justify-between items-center p-2 mb-4">
                 <div className="flex items-center gap-2">
                    <WarehouseIcon className="h-8 w-8 text-primary" />
                    <h1 className="text-xl font-bold">Búsqueda Rápida</h1>
                 </div>
                 <Button variant="ghost" size="icon" onClick={logout}><LogOut className="h-5 w-5 text-destructive"/></Button>
            </header>
            <main className="flex-1 overflow-y-auto">
                <div className="space-y-4">
                    <div className="relative w-full">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            ref={inputRef}
                            placeholder="Escanear o buscar código de producto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            className="text-lg h-14 pl-10"
                            autoFocus
                        />
                    </div>
                    
                    <div className="space-y-4 pt-4">
                         {searchResult && searchResult.product ? (
                            <Card className="w-full">
                                <CardHeader>
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1">
                                            <CardTitle className="text-lg flex flex-wrap items-center gap-2">
                                                <Package className="h-5 w-5 text-primary" />
                                                <span>{searchResult.product.description}</span>
                                            </CardTitle>
                                            <CardDescription>Código: {searchResult.product.id}</CardDescription>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <Badge variant={searchResult.product.active === 'S' ? 'default' : 'destructive'} className={searchResult.product.active === 'S' ? 'bg-green-600' : ''}>
                                                {searchResult.product.active === 'S' ? 'Activo' : 'Inactivo'}
                                            </Badge>
                                            <Badge variant="secondary">{searchResult.product.classification}</Badge>
                                            {searchResult.requiresCertificate && <Badge className="bg-orange-500 text-white font-semibold">Certificado</Badge>}
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground pt-2 space-y-1">
                                        <p><strong>Unidad de Venta:</strong> {searchResult.product.unit}</p>
                                        {searchResult.product.barcode && <p><strong>Código de Barras:</strong> {searchResult.product.barcode}</p>}
                                        {searchResult.product.notes && <p><strong>Notas:</strong> {searchResult.product.notes}</p>}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold mb-2">Ubicaciones Físicas</h4>
                                        <div className="space-y-2">
                                            {searchResult.physicalLocations.length > 0 ? searchResult.physicalLocations.map((loc, index) => (
                                                <div key={index} className="flex justify-between items-center p-2 border rounded-md">
                                                    <div>
                                                        {loc.path}
                                                        {loc.clientId && <p className="text-xs text-blue-600 font-medium">Cliente: {customers.find(c => c.id === loc.clientId)?.name || loc.clientId}</p>}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {loc.quantity !== undefined && <span className="font-bold text-lg">{loc.quantity}</span>}
                                                        {searchResult.product && loc.location && (
                                                            <>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700" onClick={() => handlePrintUnitLabel(searchResult.product!, loc.location!)} title="Imprimir Etiqueta de Unidad">
                                                                    <Printer className="h-4 w-4" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-600 hover:text-orange-700" onClick={() => handlePrintProductLocationLabel(searchResult.product!, loc.location!)} title="Imprimir Etiqueta de Escáner">
                                                                    <Printer className="h-4 w-4" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )) : <p className="text-sm text-muted-foreground">Sin ubicaciones físicas registradas.</p>}
                                        </div>
                                    </div>
                                    <Separator />
                                    <div>
                                        <h4 className="font-semibold mb-2">Existencias por Bodega (ERP)</h4>
                                         {(searchResult.erpStock?.stockByWarehouse && Object.keys(searchResult.erpStock.stockByWarehouse).length > 0) ? (
                                             <div className="space-y-2">
                                                {Object.entries(searchResult.erpStock.stockByWarehouse)
                                                    .filter(([, qty]) => qty > 0)
                                                    .map(([whId, qty]) => {
                                                        const warehouse = stockSettings?.warehouses.find((w: Warehouse) => w.id === whId);
                                                        if (!warehouse?.isVisible) return null;
                                                        return (
                                                            <div key={whId} className="flex justify-between items-center p-2 border rounded-md">
                                                                <span className="flex items-center gap-2">
                                                                    <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: warehouse?.color || '#CCCCCC' }}></span>
                                                                    {warehouse?.name} ({whId})
                                                                </span>
                                                                <span className="font-bold text-lg">{qty.toLocaleString()}</span>
                                                            </div>
                                                        );
                                                    })}
                                                 <Separator />
                                                 <div className="flex justify-between items-center p-2 font-bold">
                                                    <span>Total ERP</span>
                                                    <span className="text-xl">{searchResult.erpStock?.totalStock.toLocaleString()}</span>
                                                 </div>
                                             </div>
                                         ) : (
                                             <p className="text-sm text-muted-foreground">Sin datos de existencias en el ERP.</p>
                                         )}
                                    </div>
                                </CardContent>
                            </Card>
                        ) : debouncedSearchTerm ? (
                            <div className="text-center py-10 text-muted-foreground">
                                <p>No se encontraron resultados para &quot;{debouncedSearchTerm}&quot;.</p>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">
                                <p>Escanea un código o ingresa un código de producto para empezar.</p>
                            </div>
                        )}
                    </div>
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
