'use client';

import { useCostAssistant, type ColumnVisibility } from '@/modules/cost-assistant/hooks/useCostAssistant';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UploadCloud, Loader2, Percent, Calculator, Trash2, Settings2, FilePlus, Save, Briefcase, CheckCircle, XCircle, FolderClock, FileDown, Download, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetClose, SheetTrigger } from '@/components/ui/sheet';
import { format, parseISO, isValid } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CostAnalysisDraft } from '@/modules/core/types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { DialogColumnSelector } from '@/components/ui/dialog-column-selector';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useEffect } from 'react';
import { useLoading } from '@/modules/core/hooks/useLoading';

export default function CostAssistantClient() {
    const { isAuthorized } = useAuthorization(['cost-assistant:access']);
    const {
        state,
        actions,
        selectors,
    } = useCostAssistant();
    
    const { isAuthReady } = useAuth();
    const { showLoading, hideLoading } = useLoading();

    useEffect(() => {
        if (state.isProcessing) {
            showLoading("Analizando facturas XML de Hacienda...");
        } else if (state.isSubmitting) {
            showLoading("Guardando borrador de costos...");
        } else if (state.exportStatus === 'generating') {
            showLoading("Generando reporte Excel...");
        } else {
            hideLoading();
        }
        return () => {
            hideLoading();
        };
    }, [state.isProcessing, state.isSubmitting, state.exportStatus, showLoading, hideLoading]);
    
    if (!isAuthReady || isAuthorized === null) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
                <Skeleton className="h-40 w-full" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Skeleton className="h-64 lg:col-span-1" />
                    <Skeleton className="h-64 lg:col-span-2" />
                </div>
                <Skeleton className="h-96 w-full" />
            </main>
        );
    }
    
    if (isAuthorized === false) {
      return null;
    }

    return (
        <TooltipProvider>
            <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
                <input
                    type="file"
                    ref={state.fileInputRef}
                    onChange={actions.onFileSelected}
                    className="hidden"
                    accept=".xml"
                    multiple
                />
                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4">
                            <div>
                                <CardTitle>Asistente de Costos y Precios</CardTitle>
                                <CardDescription>Carga facturas XML para extraer artículos, añadir costos y calcular precios de venta.</CardDescription>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline"><FilePlus className="mr-2 h-4 w-4"/>Nueva Operación</Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>¿Iniciar una nueva operación?</DialogTitle>
                                            <DialogDescription>
                                                Esta acción limpiará todos los artículos, costos y facturas cargadas. ¿Deseas continuar?
                                            </DialogDescription>
                                        </DialogHeader>
                                        <DialogFooter>
                                            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                                            <DialogClose asChild><Button onClick={actions.handleClear}>Sí, limpiar todo</Button></DialogClose>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                                <Button variant="outline" onClick={actions.openFileDialog} disabled={state.isProcessing}>
                                    {state.isProcessing ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <UploadCloud className="mr-2 h-4 w-4" />
                                    )}
                                    Cargar Facturas XML
                                </Button>
                                <Sheet onOpenChange={(open) => open && actions.loadDrafts()}>
                                    <SheetTrigger asChild>
                                        <Button variant="outline"><FolderClock className="mr-2 h-4 w-4"/>Cargar Borradores</Button>
                                    </SheetTrigger>
                                    <SheetContent className="sm:max-w-2xl">
                                        <SheetHeader>
                                            <SheetTitle>Borradores Guardados</SheetTitle>
                                            <SheetDescription>Selecciona un análisis guardado para continuar trabajando en él.</SheetDescription>
                                        </SheetHeader>
                                        <div className="py-4">
                                            <ScrollArea className="h-[80vh]">
                                                {state.drafts && state.drafts.length > 0 ? (
                                                    <div className="space-y-3 pr-4">
                                                        {state.drafts.map((draft) => (
                                                            <Card key={draft.id}>
                                                                <CardHeader>
                                                                    <CardTitle className="text-lg flex items-center gap-2">
                                                                        <span className="font-mono text-base bg-muted px-2 py-1 rounded">{draft.id}</span>
                                                                        <span>{draft.name}</span>
                                                                    </CardTitle>
                                                                    <CardDescription>Guardado el {isValid(parseISO(draft.createdAt)) ? format(parseISO(draft.createdAt), 'dd/MM/yyyy HH:mm') : 'Fecha inválida'}</CardDescription>
                                                                </CardHeader>
                                                                <CardFooter className="flex justify-end gap-2">
                                                                    <AlertDialog>
                                                                        <AlertDialogTrigger asChild><Button variant="destructive" size="sm">Eliminar</Button></AlertDialogTrigger>
                                                                        <AlertDialogContent>
                                                                            <AlertDialogHeader>
                                                                                <AlertDialogTitle>¿Eliminar Borrador?</AlertDialogTitle>
                                                                                <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                                                                            </AlertDialogHeader>
                                                                            <AlertDialogFooter>
                                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                                <AlertDialogAction onClick={() => actions.deleteDraft(draft.id)}>Sí, eliminar</AlertDialogAction>
                                                                            </AlertDialogFooter>
                                                                        </AlertDialogContent>
                                                                    </AlertDialog>
                                                                    <SheetClose asChild>
                                                                        <Button size="sm" onClick={() => actions.loadDraft(draft)}>Cargar</Button>
                                                                    </SheetClose>
                                                                </CardFooter>
                                                            </Card>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-center text-muted-foreground py-8">No hay borradores guardados.</p>
                                                )}
                                            </ScrollArea>
                                        </div>
                                    </SheetContent>
                                </Sheet>
                                <Button onClick={actions.saveDraft}><Save className="mr-2 h-4 w-4"/>Guardar Borrador</Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                            {/* --- Left Column: Merged Card --- */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Configuración y Resumen</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="transport-cost">Costo de Transporte (Total)</Label>
                                        <Input 
                                            id="transport-cost" 
                                            type="number" 
                                            value={state.transportCost || ''}
                                            onChange={(e) => actions.setTransportCost(Number(e.target.value))}
                                            placeholder="Ej: 5000"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="other-costs">Otros Costos (Total)</Label>
                                        <Input 
                                            id="other-costs" 
                                            type="number" 
                                            value={state.otherCosts || ''}
                                            onChange={(e) => actions.setOtherCosts(Number(e.target.value))}
                                            placeholder="Ej: 10000"
                                        />
                                    </div>
                                    <Separator/>
                                    <div className="space-y-3">
                                        <Label>Manejo de Descuentos en Factura</Label>
                                        <RadioGroup value={state.discountHandling} onValueChange={(value) => actions.setDiscountHandling(value as 'customer' | 'company')}>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="customer" id="disc-customer" />
                                                <Label htmlFor="disc-customer" className="font-normal">Trasladar descuento al costo (beneficia al cliente)</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="company" id="disc-company" />
                                                <Label htmlFor="disc-company" className="font-normal">Trasladar descuento a la ganancia (beneficia a la empresa)</Label>
                                            </div>
                                        </RadioGroup>
                                    </div>
                                </CardContent>
                                <Separator className="my-4" />
                                <CardHeader className="pt-0">
                                    <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5"/>Resumen General</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-0">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Costo Total de Compra:</span>
                                        <span className="font-medium">{actions.formatCurrency(state.totals.totalPurchaseCost)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Costos Adicionales Totales:</span>
                                        <span className="font-medium">{actions.formatCurrency(state.totals.totalAdditionalCosts)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold border-t pt-2">
                                        <span>Costo Total Final:</span>
                                        <span>{actions.formatCurrency(state.totals.totalFinalCost)}</span>
                                    </div>
                                    <div className="flex justify-between text-green-600 font-bold">
                                        <span>Ingreso Total Estimado (Venta):</span>
                                        <span>{actions.formatCurrency(state.totals.totalSellValue)}</span>
                                    </div>
                                    <div className="flex justify-between text-blue-700 font-bold text-lg border-t pt-2">
                                        <span>Ganancia Bruta Estimada:</span>
                                        <span>{actions.formatCurrency(state.totals.estimatedGrossProfit)}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* --- Right Column: Processed Invoices Card --- */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" />Facturas Procesadas</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ScrollArea className="h-96">
                                        {state.processedInvoices.length > 0 ? (
                                            <ul className="space-y-3 text-sm">
                                                {state.processedInvoices.map((invoice, index) => (
                                                    <li key={index} className="border-b pb-2">
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex-1">
                                                                <p className="font-semibold text-muted-foreground">{invoice.invoiceNumber}</p>
                                                                <p className="truncate">{invoice.supplierName}</p>
                                                                <p className="text-xs text-muted-foreground">{isValid(parseISO(invoice.invoiceDate)) ? format(parseISO(invoice.invoiceDate), 'dd/MM/yyyy') : 'Fecha Inválida'}</p>
                                                            </div>
                                                            <div className={cn("flex items-center gap-1 text-xs font-medium", invoice.status === 'success' ? 'text-green-600' : 'text-red-600')}>
                                                                {invoice.status === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                                                                <span>{invoice.status === 'success' ? 'Éxito' : 'Error'}</span>
                                                            </div>
                                                        </div>
                                                        {invoice.status === 'error' && <p className="text-xs text-red-500 mt-1">{invoice.errorMessage}</p>}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-center text-muted-foreground h-full flex items-center justify-center">Aún no se han cargado facturas.</p>
                                        )}
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                         </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                             <div>
                                <CardTitle>Artículos Extraídos</CardTitle>
                                <CardDescription>Ajusta los datos y márgenes de ganancia para calcular el precio de venta final.</CardDescription>
                             </div>
                             <div className="flex items-center gap-2">
                                 <DialogColumnSelector
                                    allColumns={selectors.columns}
                                    visibleColumns={Object.keys(state.columnVisibility).filter(k => state.columnVisibility[k as keyof ColumnVisibility])}
                                    onColumnChange={(columnId, checked) => actions.setColumnVisibility(columnId, checked)}
                                    onSave={actions.handleSaveColumnVisibility}
                                />
                                {state.exportStatus === 'idle' && (
                                    <Button onClick={actions.handleExportToERP} disabled={state.lines.length === 0}>
                                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                                        Exportar a Excel
                                    </Button>
                                )}
                                {state.exportStatus === 'generating' && (
                                    <Button disabled>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Generando...
                                    </Button>
                                )}
                                {state.exportStatus === 'ready' && state.exportFileName && (
                                    <div className="flex gap-2">
                                        <a href={`/routes/temp-exports?file=${state.exportFileName}`} download={state.exportFileName}>
                                            <Button>
                                                <Download className="mr-2 h-4 w-4" />
                                                Descargar Archivo
                                            </Button>
                                        </a>
                                        <Button variant="outline" onClick={actions.handleFinalizeExport}>Finalizar</Button>
                                    </div>
                                )}
                             </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {selectors.columns.map((col) => state.columnVisibility[col.id as keyof ColumnVisibility] && (
                                            <TableHead key={col.id} className={cn(col.className)}>
                                                <Tooltip>
                                                    <TooltipTrigger className="cursor-help underline decoration-dotted">{col.label}</TooltipTrigger>
                                                    <TooltipContent><p>{col.tooltip}</p></TooltipContent>
                                                </Tooltip>
                                            </TableHead>
                                        ))}
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {state.lines.length > 0 ? state.lines.map((line) => (
                                        <TableRow key={line.id}>
                                            {state.columnVisibility.cabysCode && <TableCell className={cn(selectors.columns.find(c => c.id === 'cabysCode')?.className)}>{line.cabysCode}</TableCell>}
                                            {state.columnVisibility.supplierCode && <TableCell className={cn(selectors.columns.find(c => c.id === 'supplierCode')?.className)}>{line.supplierCode}</TableCell>}
                                            {state.columnVisibility.description && <TableCell className={cn(selectors.columns.find(c => c.id === 'description')?.className)}><Input value={line.description} onChange={e => actions.updateLine(line.id, { description: e.target.value })} className="h-auto p-1 border-0 bg-transparent"/></TableCell>}
                                            {state.columnVisibility.originalQuantity && <TableCell className={cn(selectors.columns.find(c => c.id === 'originalQuantity')?.className)}>{line.originalQuantity}</TableCell>}
                                            {state.columnVisibility.unitsPerPack && <TableCell className={cn(selectors.columns.find(c => c.id === 'unitsPerPack')?.className)}><Input type="text" value={line.displayUnitsPerPack} onChange={e => actions.updateLine(line.id, { displayUnitsPerPack: e.target.value })} onBlur={e => actions.handleUnitsPerPackBlur(line.id, e.target.value)} className="h-auto p-1 border-0 bg-transparent text-right"/></TableCell>}
                                            {state.columnVisibility.quantity && <TableCell className={cn(selectors.columns.find(c => c.id === 'quantity')?.className)}>{line.quantity}</TableCell>}
                                            {state.columnVisibility.discountAmountUnit && <TableCell className={cn(selectors.columns.find(c => c.id === 'discountAmountUnit')?.className, "font-mono")}>{actions.formatCurrency(line.discountAmountUnit)}</TableCell>}
                                            {state.columnVisibility.discountPercentage && <TableCell className={cn(selectors.columns.find(c => c.id === 'discountPercentage')?.className, "font-mono")}>{`${(line.discountPercentage * 100).toFixed(2)}%`}</TableCell>}
                                            {state.columnVisibility.xmlGrossPackCost && <TableCell className={cn(selectors.columns.find(c => c.id === 'xmlGrossPackCost')?.className, "font-mono")}>{actions.formatCurrency(line.xmlGrossPackCost)}</TableCell>}
                                            {state.columnVisibility.xmlPackCost && <TableCell className={cn(selectors.columns.find(c => c.id === 'xmlPackCost')?.className, "font-mono")}>{actions.formatCurrency(line.xmlPackCost)}</TableCell>}
                                            {state.columnVisibility.unitCostWithoutTax && <TableCell className={cn(selectors.columns.find(c => c.id === 'unitCostWithoutTax')?.className, "font-mono")}>{actions.formatCurrency(line.unitCostWithoutTax)}</TableCell>}
                                            {state.columnVisibility.taxRate && <TableCell className={cn(selectors.columns.find(c => c.id === 'taxRate')?.className)}>
                                                    <div className="relative">
                                                        <Input 
                                                            type="text" 
                                                            value={line.displayTaxRate}
                                                            onChange={(e) => actions.updateLine(line.id, { displayTaxRate: e.target.value })}
                                                            onBlur={(e) => actions.handleTaxRateBlur(line.id, e.target.value)}
                                                            className="h-auto p-1 border-0 bg-transparent text-right pr-6" 
                                                        />
                                                        <Percent className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                                                    </div>
                                                </TableCell>}
                                            {state.columnVisibility.margin && 
                                                <TableCell className={cn(selectors.columns.find(c => c.id === 'margin')?.className)}>
                                                    <div className="relative">
                                                        <Input 
                                                            type="text" 
                                                            value={line.displayMargin}
                                                            onChange={(e) => actions.updateLine(line.id, { displayMargin: e.target.value })}
                                                            onBlur={(e) => actions.handleMarginBlur(line.id, e.target.value)}
                                                            className="h-auto p-1 border-0 bg-transparent text-right pr-6" 
                                                        />
                                                        <Percent className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                                                    </div>
                                                </TableCell>
                                            }
                                            {state.columnVisibility.sellPriceWithoutTax && <TableCell className={cn(selectors.columns.find(c => c.id === 'sellPriceWithoutTax')?.className, "font-mono")}>{actions.formatCurrency(line.sellPriceWithoutTax || 0)}</TableCell>}
                                            {state.columnVisibility.finalSellPrice && <TableCell className={cn(selectors.columns.find(c => c.id === 'finalSellPrice')?.className, "font-bold text-base text-primary")}>{actions.formatCurrency(line.finalSellPrice)}</TableCell>}
                                            {state.columnVisibility.profitPerLine && <TableCell className={cn(selectors.columns.find(c => c.id === 'profitPerLine')?.className, "font-bold text-base text-blue-600")}>{actions.formatCurrency(line.profitPerLine || 0)}</TableCell>}
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => actions.removeLine(line.id)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={selectors.columns.length + 1} className="h-24 text-center">
                                                Carga un archivo XML para ver los artículos.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </TooltipProvider>
    );
}
