
'use client';

import React, { useState } from 'react';
import { useConsignmentsReport, type ConsignmentsReportSortKey } from '@/modules/analytics/hooks/useConsignmentsReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CalendarIcon, Search, FileDown, FileSpreadsheet, AlertTriangle, ArrowUp, ArrowDown, FilterX, SlidersHorizontal, ListChecks, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DialogColumnSelector } from '@/components/ui/dialog-column-selector';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function ConsignmentsReportPage() {
    const { state, actions, selectors, isAuthorized } = useConsignmentsReport();
    const { isLoading, hasRun, dateRange, agreements, selectedAgreementId, reportData, processedBoletas, sortKey, sortDirection, visibleColumns, boletaFilter, closureFilter } = state;
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

    if (!isAuthorized) return null;

    const renderSortIcon = (key: ConsignmentsReportSortKey) => {
        if (sortKey !== key) return null;
        return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />;
    };

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
             <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300">
                <AlertTriangle className="h-4 w-4 !text-blue-600" />
                <AlertTitle>Modo de Análisis Flexible</AlertTitle>
                <AlertDescription>
                    Este reporte permite un análisis flexible de las consignaciones por mes. Para la <strong>facturación oficial</strong>, por favor utiliza la herramienta <strong>&quot;Gestión de Cierres&quot;</strong> en el módulo de Consignaciones.
                </AlertDescription>
            </Alert>
            
            {/* Filtros en Desktop */}
            <Card className="hidden md:block">
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Reporte de Cierre de Consignaciones (Analítico)</CardTitle>
                            <CardDescription>Genera el reporte de consumo mensual para un cliente de consignación específico.</CardDescription>
                        </div>
                        <Button onClick={actions.handleGenerateReport} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Generar Reporte
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4 items-center">
                    <Select value={selectedAgreementId || ''} onValueChange={actions.setSelectedAgreementId}>
                        <SelectTrigger className="w-full sm:w-[250px]"><SelectValue placeholder="Selecciona un cliente..." /></SelectTrigger>
                        <SelectContent>
                            {agreements.map((agreement) => (
                                <SelectItem key={agreement.id} value={String(agreement.id)}>
                                    {agreement.client_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button id="date" variant={"outline"} className={cn("w-full sm:w-auto sm:min-w-[260px] justify-start text-left font-normal", (!dateRange?.from || closureFilter) && "text-muted-foreground")} disabled={!!closureFilter}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y", { locale: es })} - ${format(dateRange.to, "LLL dd, y", { locale: es })}`) : format(dateRange.from, "LLL dd, y", { locale: es })) : (<span>Seleccionar rango</span>)}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={actions.setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                    </Popover>
                     <Select value={closureFilter || 'none'} onValueChange={actions.setClosureFilter} disabled={!selectedAgreementId}>
                        <SelectTrigger className="w-full sm:w-[250px]"><SelectValue placeholder="O filtrar por Cierre de Periodo..." /></SelectTrigger>
                        <SelectContent>
                             <SelectItem value="none">-- Sin Filtro por Cierre --</SelectItem>
                            {selectors.closureOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                     <MultiSelectFilter
                        title="Filtrar por Boleta(s)"
                        options={selectors.boletaOptions}
                        selectedValues={boletaFilter}
                        onSelectedChange={actions.setBoletaFilter}
                        disabled={!selectedAgreementId}
                    />
                     <Button variant="ghost" onClick={actions.handleClearFilters}>
                        <FilterX className="mr-2 h-4 w-4" />
                        Limpiar Filtros
                     </Button>
                </CardContent>
            </Card>

            {/* Filtros en Móvil (Estilo Premium Standard) */}
            <div className="md:hidden flex flex-col gap-3">
                <Button 
                    variant="outline" 
                    onClick={() => setMobileFiltersOpen(true)} 
                    className="w-full h-14 rounded-2xl flex items-center justify-between px-4 bg-white border-slate-200 shadow-sm text-slate-700 font-semibold hover:bg-slate-50 transition-all active:scale-[0.98]"
                >
                    <span className="flex items-center gap-2">
                        <SlidersHorizontal className="h-5 w-5 text-primary" />
                        Configurar Filtros de Análisis
                    </span>
                    <span className="text-xs font-normal text-slate-400">
                        {selectedAgreementId ? "Configurado" : "Sin cliente"} ➔
                    </span>
                </Button>

                {selectedAgreementId && (
                    <div className="bg-slate-100/85 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600 flex flex-col gap-2 shadow-inner">
                        <p><strong>Cliente:</strong> {agreements.find(a => String(a.id) === selectedAgreementId)?.client_name || 'N/A'}</p>
                        <p><strong>Período:</strong> {dateRange?.from ? `${format(dateRange.from, 'dd/MM/yyyy')} al ${dateRange.to ? format(dateRange.to, 'dd/MM/yyyy') : ''}` : closureFilter ? 'Filtrado por cierre' : 'Sin rango'}</p>
                        <Button 
                            onClick={actions.handleGenerateReport} 
                            disabled={isLoading}
                            className="w-full h-11 mt-1 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Actualizar Reporte
                        </Button>
                    </div>
                )}

                <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                    <SheetContent side="bottom" className="h-[92vh] rounded-t-[2rem] bg-slate-50 p-0 overflow-hidden flex flex-col">
                        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-3 shrink-0" />
                        <SheetHeader className="px-6 pb-4 border-b bg-white">
                            <SheetTitle className="text-xl font-bold text-slate-800 text-left">
                                Filtros de Análisis
                            </SheetTitle>
                        </SheetHeader>
                        <div className="flex-1 overflow-y-auto px-6 py-6 pb-24 space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Cliente de Consignación</label>
                                <Select value={selectedAgreementId || ''} onValueChange={actions.setSelectedAgreementId}>
                                    <SelectTrigger className="w-full h-12 rounded-xl"><SelectValue placeholder="Selecciona un cliente..." /></SelectTrigger>
                                    <SelectContent>
                                        {agreements.map((agreement) => (
                                            <SelectItem key={agreement.id} value={String(agreement.id)}>
                                                {agreement.client_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 block">Rango de Fechas</label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button id="mobile-date" variant={"outline"} className={cn("w-full h-12 rounded-xl justify-start text-left font-normal", (!dateRange?.from || closureFilter) && "text-muted-foreground")} disabled={!!closureFilter}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y", { locale: es })} - ${format(dateRange.to, "LLL dd, y", { locale: es })}`) : format(dateRange.from, "LLL dd, y", { locale: es })) : (<span>Seleccionar rango</span>)}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={actions.setDateRange} numberOfMonths={1} locale={es} />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Cierre de Periodo (Opcional)</label>
                                <Select value={closureFilter || 'none'} onValueChange={actions.setClosureFilter} disabled={!selectedAgreementId}>
                                    <SelectTrigger className="w-full h-12 rounded-xl"><SelectValue placeholder="O filtrar por Cierre de Periodo..." /></SelectTrigger>
                                    <SelectContent>
                                         <SelectItem value="none">-- Sin Filtro por Cierre --</SelectItem>
                                        {selectors.closureOptions.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 block">Filtro de Boletas Específicas</label>
                                <MultiSelectFilter
                                    title="Filtrar por Boleta(s)"
                                    options={selectors.boletaOptions}
                                    selectedValues={boletaFilter}
                                    onSelectedChange={actions.setBoletaFilter}
                                    disabled={!selectedAgreementId}
                                />
                            </div>

                            <div className="pt-4 border-t flex flex-col gap-3">
                                <Button 
                                    onClick={() => { actions.handleGenerateReport(); setMobileFiltersOpen(false); }} 
                                    disabled={isLoading || !selectedAgreementId}
                                    className="w-full h-12 rounded-xl bg-primary text-white font-bold flex items-center justify-center gap-2 shadow-lg"
                                >
                                    <Search className="h-5 w-5" />
                                    Generar Reporte
                                </Button>
                                <Button 
                                    variant="outline" 
                                    onClick={() => { actions.handleClearFilters(); setMobileFiltersOpen(false); }} 
                                    className="w-full h-12 rounded-xl border-slate-200 text-slate-600 font-semibold"
                                >
                                    <FilterX className="mr-2 h-4 w-4" />
                                    Limpiar Filtros
                                </Button>
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <CardTitle>Resultados del Cierre</CardTitle>
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                            <DialogColumnSelector
                                allColumns={selectors.availableColumns}
                                visibleColumns={visibleColumns}
                                onColumnChange={actions.handleColumnVisibilityChange}
                                onSave={actions.savePreferences}
                            />
                            <Button variant="outline" className="flex-1 sm:flex-none h-10 px-3 py-2 text-xs sm:text-sm" onClick={actions.handleExportPDF} disabled={isLoading || reportData.length === 0}>
                                <FileDown className="h-4 w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Exportar PDF</span>
                                <span className="sm:hidden">PDF</span>
                            </Button>
                            <Button variant="outline" className="flex-1 sm:flex-none h-10 px-3 py-2 text-xs sm:text-sm" onClick={actions.handleExportExcel} disabled={isLoading || reportData.length === 0}>
                                <FileSpreadsheet className="h-4 w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Exportar Excel</span>
                                <span className="sm:hidden">Excel</span>
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {processedBoletas.length > 0 && (
                        <div className="mb-4 p-4 border rounded-lg bg-muted/50">
                            <h4 className="font-semibold mb-2">Boletas Incluidas en este Reporte</h4>
                            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                                {processedBoletas.map(boleta => (
                                    <li key={boleta.id}>
                                        <strong>{boleta.consecutive}</strong>
                                        {boleta.status === 'invoiced' && boleta.erp_invoice_number && <span className="text-red-600 font-semibold">{` (Factura: ${boleta.erp_invoice_number})`}</span>}
                                        {boleta.approved_by && ` - Aprobada por: ${boleta.approved_by}`}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    
                    {/* Tabla en Escritorio */}
                    <ScrollArea className="hidden md:block h-[60vh] border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {selectors.visibleColumnsData.map(col => (
                                        <TableHead 
                                            key={col.id} 
                                            className={cn(col.sortable && "cursor-pointer hover:bg-muted", col.align === 'right' && 'text-right')}
                                            onClick={() => col.sortable && actions.handleSort(col.id as ConsignmentsReportSortKey)}
                                        >
                                            <div className={cn("flex items-center", col.align === 'right' && 'justify-end')}>
                                                {col.label} {col.sortable && renderSortIcon(col.id as ConsignmentsReportSortKey)}
                                            </div>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                     <TableRow><TableCell colSpan={selectors.availableColumns.length} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                                ) : !hasRun ? (
                                    <TableRow><TableCell colSpan={selectors.availableColumns.length} className="h-32 text-center text-muted-foreground">Selecciona un cliente y un rango de fechas y haz clic en &quot;Generar Reporte&quot;.</TableCell></TableRow>
                                ) : reportData.length > 0 ? (
                                    reportData.map(row => (
                                        <TableRow key={row.productId}>
                                            {selectors.visibleColumnsData.map(col => {
                                                const content = selectors.getColumnContent(row, col.id);
                                                return <TableCell key={col.id} className={cn(col.align === 'right' && 'text-right', content.className)}>{content.content}</TableCell>
                                            })}
                                        </TableRow>
                                    ))
                                ) : (
                                     <TableRow><TableCell colSpan={selectors.availableColumns.length} className="h-32 text-center text-muted-foreground">No se encontraron datos de consumo para el período seleccionado.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>

                    {/* Tarjetas en Móvil (Estilo Premium Standard) */}
                    <div className="md:hidden flex flex-col gap-3">
                        {isLoading ? (
                            <div className="py-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
                        ) : !hasRun ? (
                            <div className="py-12 text-center text-muted-foreground text-sm">Selecciona un cliente y haz clic en &quot;Generar Reporte&quot;.</div>
                        ) : reportData.length > 0 ? (
                            reportData.map(row => (
                                <div key={row.productId} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col gap-2 transition-all active:scale-[0.99]">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="font-mono text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-md text-slate-600">{row.productId}</span>
                                            <h4 className="font-bold text-slate-800 mt-2 text-sm leading-snug">{row.productDescription}</h4>
                                            {row.clientProductCode && <p className="text-xs text-slate-400 mt-0.5">Alias: {row.clientProductCode}</p>}
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => actions.openDetailsModal(row)} 
                                            className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white shadow-md active:scale-95 transition-all shrink-0"
                                        >
                                            <ListChecks className="h-5 w-5 stroke-[2.5]" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 border-t pt-3 mt-2 text-xs">
                                        <div>
                                            <p className="text-slate-400">Consumo</p>
                                            <p className="font-bold text-slate-700 text-sm mt-0.5">{row.consumption.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-400">Precio Unit.</p>
                                            <p className="font-semibold text-slate-700 mt-0.5">¢{row.price.toLocaleString('es-CR')}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-slate-400">Valor Total</p>
                                            <p className="font-bold text-primary text-sm mt-0.5">¢{row.totalValue.toLocaleString('es-CR')}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 text-center text-muted-foreground text-sm">No se encontraron datos de consumo para el período seleccionado.</div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Modal/Sheet de Desglose de Transacciones del Producto */}
            <Sheet open={state.isDetailsOpen} onOpenChange={actions.setIsDetailsOpen}>
                <SheetContent side="bottom" className="h-[92vh] rounded-t-[2rem] bg-slate-50 p-0 overflow-hidden flex flex-col">
                    <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-3 shrink-0" />
                    <SheetHeader className="px-6 pb-4 border-b bg-white">
                        <div className="flex flex-col gap-1 text-left">
                            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 bg-slate-100 rounded-md text-slate-600 w-max">
                                {state.detailsForProduct?.productId}
                            </span>
                            <SheetTitle className="text-lg font-bold text-slate-800">
                                {state.detailsForProduct?.productDescription}
                            </SheetTitle>
                            {state.detailsForProduct?.clientProductCode && (
                                <p className="text-xs text-slate-500">
                                    Alias de Cliente: <strong className="text-slate-700">{state.detailsForProduct.clientProductCode}</strong>
                                </p>
                            )}
                        </div>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto px-4 py-4 pb-20">
                        {state.detailsForProduct?.transactions && state.detailsForProduct.transactions.length > 0 ? (
                            <div className="space-y-4">
                                <h4 className="font-semibold text-slate-700 text-sm">Historial de Transacciones</h4>
                                <div className="flex flex-col gap-3">
                                    {state.detailsForProduct.transactions.map((tx, idx) => (
                                        <div key={idx} className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col gap-2">
                                            <div className="flex justify-between items-center">
                                                <span className={cn(
                                                    "text-[10px] font-bold px-2.5 py-1 rounded-full",
                                                    tx.type === 'Restock' ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                                    tx.type === 'Adjustment' ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                                    "bg-slate-50 text-slate-700 border border-slate-200"
                                                )}>
                                                    {tx.type === 'Restock' ? 'Reposición' : tx.type === 'Adjustment' ? 'Ajuste' : tx.type}
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    {format(parseISO(tx.date), 'dd/MM/yyyy HH:mm')}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-2 mt-1">
                                                <div>
                                                    <p className="text-slate-400">Documento / Motivo</p>
                                                    <p className="font-semibold text-slate-700">{tx.document}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-slate-400">Cantidad</p>
                                                    <p className="font-bold text-slate-700 text-sm">{tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity}</p>
                                                </div>
                                            </div>
                                            {tx.notes && (
                                                <div className="text-xs bg-slate-50 p-2 rounded-lg text-slate-500 border border-dashed border-slate-200 mt-1">
                                                    <strong>Notas:</strong> {tx.notes}
                                                </div>
                                            )}
                                            <div className="text-[10px] text-slate-400 mt-1">
                                                Registrado por: <strong>{tx.user}</strong>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-400">
                                No se encontraron transacciones detalladas para este período.
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </main>
    );
}
