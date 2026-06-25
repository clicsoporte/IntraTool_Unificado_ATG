'use client';

import React from 'react';
import { useInvoiceReporter } from '@/modules/invoices/hooks/useInvoiceReporter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { UploadCloud, Loader2, FileSpreadsheet, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO, isValid } from 'date-fns';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export default function InvoiceReporterClient() {
    const { state, actions, selectors } = useInvoiceReporter();

    const renderDetailedTable = () => (
        <div className="w-full overflow-x-auto rounded-md border">
            <Table className="w-full">
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12">
                            <Checkbox 
                                checked={selectors.areAllDetailedSelected}
                                onCheckedChange={(checked) => actions.toggleAllSelected(!!checked)}
                                aria-label="Marcar/desmarcar todos para exportar"
                            />
                        </TableHead>
                        <TableHead className="min-w-[200px]">Nº Factura</TableHead>
                        <TableHead className="min-w-[250px]">Proveedor</TableHead>
                        <TableHead className="min-w-[120px]">Fecha</TableHead>
                        <TableHead className="min-w-[150px]">Código</TableHead>
                        <TableHead className="min-w-[300px]">Descripción</TableHead>
                        <TableHead className="text-right min-w-[100px]">Cantidad</TableHead>
                        <TableHead className="text-right min-w-[100px]">Imp. %</TableHead>
                        <TableHead className="text-right min-w-[150px]">Unit. s/IVA</TableHead>
                        <TableHead className="text-right min-w-[150px]">Unit. c/IVA</TableHead>
                        <TableHead className="text-right min-w-[150px]">Total s/IVA</TableHead>
                        <TableHead className="text-right min-w-[150px]">Total c/IVA</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {selectors.detailedLines.length > 0 ? selectors.detailedLines.map(line => (
                        <TableRow key={line.id}>
                            <TableCell className="w-12"><Checkbox checked={line.isSelected} onCheckedChange={(checked) => actions.toggleSelected(line.id, !!checked)} /></TableCell>
                            <TableCell className="min-w-[200px] font-mono">{line.invoiceNumber}</TableCell>
                            <TableCell className="min-w-[250px]">{line.supplierName}</TableCell>
                            <TableCell className="min-w-[120px]">{isValid(parseISO(line.invoiceDate)) ? format(parseISO(line.invoiceDate), 'dd/MM/yyyy') : 'Inválida'}</TableCell>
                            <TableCell className="min-w-[150px]"><Input value={line.itemCode} onChange={e => actions.updateLine(line.id, { itemCode: e.target.value })} className="h-auto p-1 border-0" /></TableCell>
                            <TableCell className="min-w-[300px]"><Input value={line.itemDescription} onChange={e => actions.updateLine(line.id, { itemDescription: e.target.value })} className="h-auto p-1 border-0" /></TableCell>
                            <TableCell className="text-right min-w-[100px]"><Input type="number" value={line.quantity} onChange={e => actions.updateLine(line.id, { quantity: Number(e.target.value) })} className="h-auto p-1 border-0 text-right hide-number-arrows" /></TableCell>
                            <TableCell className="text-right min-w-[100px]">{line.taxRate !== undefined ? `${(line.taxRate * 100).toFixed(0)}%` : '-'}</TableCell>
                            <TableCell className="text-right min-w-[150px]"><Input type="number" value={line.unitPrice} onChange={e => actions.updateLine(line.id, { unitPrice: Number(e.target.value) })} className="h-auto p-1 border-0 text-right hide-number-arrows" /></TableCell>
                            <TableCell className="text-right min-w-[150px]"><Input type="number" value={line.unitPriceWithTax} onChange={e => actions.updateLine(line.id, { unitPriceWithTax: Number(e.target.value) })} className="h-auto p-1 border-0 text-right hide-number-arrows" /></TableCell>
                            <TableCell className="text-right min-w-[150px]"><Input type="number" value={line.totalLine} onChange={e => actions.updateLine(line.id, { totalLine: Number(e.target.value) })} className="h-auto p-1 border-0 text-right hide-number-arrows" /></TableCell>
                            <TableCell className="text-right min-w-[150px]"><Input type="number" value={line.totalLineWithTax} onChange={e => actions.updateLine(line.id, { totalLineWithTax: Number(e.target.value) })} className="h-auto p-1 border-0 text-right hide-number-arrows" /></TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={12} className="h-48 text-center text-muted-foreground">
                                Carga uno o más archivos XML para empezar.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
    const renderSummaryTable = () => (
         <div className="w-full overflow-x-auto rounded-md border">
            <Table className="w-full">
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12">
                             <Checkbox 
                                checked={selectors.areAllSummarySelected}
                                onCheckedChange={(checked) => actions.toggleAllSelected(!!checked)}
                                aria-label="Marcar/desmarcar todos para exportar"
                            />
                        </TableHead>
                        <TableHead className="min-w-[200px]">Nº Factura</TableHead>
                        <TableHead className="min-w-[300px]">Proveedor</TableHead>
                        <TableHead className="min-w-[120px]">Fecha</TableHead>
                        <TableHead className="text-right min-w-[200px]">Venta Neta</TableHead>
                        <TableHead className="text-right min-w-[200px]">Impuesto</TableHead>
                        <TableHead className="text-right min-w-[200px]">Total</TableHead>
                    </TableRow>
                </TableHeader>
                 <TableBody>
                    {selectors.summaryLines.length > 0 ? selectors.summaryLines.map(summary => (
                        <TableRow key={summary.id}>
                            <TableCell className="w-12"><Checkbox checked={summary.isSelected} onCheckedChange={(checked) => actions.toggleSelected(summary.id, !!checked)} /></TableCell>
                            <TableCell className="min-w-[200px] font-mono">{summary.invoiceNumber}</TableCell>
                            <TableCell className="min-w-[300px]">{summary.supplierName}</TableCell>
                            <TableCell className="min-w-[120px]">{isValid(parseISO(summary.invoiceDate)) ? format(parseISO(summary.invoiceDate), 'dd/MM/yyyy') : 'Inválida'}</TableCell>
                            <TableCell className="text-right min-w-[200px] font-mono">{`¢${summary.totalVentaNeta.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`}</TableCell>
                            <TableCell className="text-right min-w-[200px] font-mono">{`¢${summary.totalImpuesto.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`}</TableCell>
                            <TableCell className="text-right min-w-[200px] font-bold text-base font-mono">{`¢${summary.totalComprobante.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`}</TableCell>
                        </TableRow>
                    )) : (
                          <TableRow>
                             <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                                 Carga uno o más archivos XML para empezar.
                             </TableCell>
                          </TableRow>
                      )}
                 </TableBody>
            </Table>
        </div>
    );

    return (
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
                <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <CardTitle>Reporteador de Facturas</CardTitle>
                        <CardDescription>Carga facturas XML para analizar, editar y exportar a Excel.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" onClick={actions.openFileDialog} disabled={state.isProcessing}>
                            {state.isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                            Cargar Facturas XML
                        </Button>
                        <Button onClick={actions.handleExport} disabled={state.processedData.length === 0}>
                            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel
                        </Button>
                        <Button variant="destructive" onClick={actions.handleClear} disabled={state.processedData.length === 0}>
                            <Trash2 className="mr-2 h-4 w-4" /> Limpiar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="item-1">
                            <AccordionTrigger>
                                Ver Resumen de Facturas Procesadas ({state.statusReport.length})
                            </AccordionTrigger>
                            <AccordionContent>
                                <ScrollArea className="h-48 mt-4">
                                    <ul className="space-y-3 text-sm pr-4">
                                        {state.statusReport.map((invoice, index) => (
                                            <li key={`${invoice.invoiceNumber}-${index}`} className="border-b pb-2">
                                                <div className="flex items-center gap-2">
                                                    {invoice.status === 'success' ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                                                    <div className="flex-1">
                                                        <p className="font-semibold truncate">{invoice.supplierName}</p>
                                                        <p className="text-xs text-muted-foreground">{invoice.invoiceNumber}</p>
                                                    </div>
                                                </div>
                                                {invoice.status === 'error' && <p className="text-xs text-red-500 mt-1">{invoice.errorMessage}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                </ScrollArea>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>

                    <div className="space-y-4">
                         <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div className="space-y-2">
                                <Label className="text-lg font-semibold">Vista de Reporte</Label>
                                <RadioGroup value={state.viewMode} onValueChange={(value) => actions.setViewMode(value as any)} className="flex items-center gap-4">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="detailed" id="mode-detailed" />
                                        <Label htmlFor="mode-detailed">Detallada (por Artículo)</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="summary" id="mode-summary" />
                                        <Label htmlFor="mode-summary">Resumida (por Factura)</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>
                        
                        <ScrollArea className="w-full whitespace-nowrap">
                            {state.viewMode === 'detailed' ? renderDetailedTable() : renderSummaryTable()}
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
