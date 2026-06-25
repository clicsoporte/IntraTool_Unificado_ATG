
/**
 * @fileoverview Page for production reporting and analysis.
 * It allows users to filter completed production orders by a date range and
 * view summarized totals and detailed breakdowns of production performance.
 */
'use client';

import React from 'react';
import { useProductionReport } from '@/modules/analytics/hooks/useProductionReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CalendarIcon, Search, FileDown, FileSpreadsheet, Package, PackageCheck, AlertCircle, Trash2, Columns3, FilterX } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { SearchInput } from '@/components/ui/search-input';
import { DialogColumnSelector } from '@/components/ui/dialog-column-selector';

export default function ProductionReportPage() {
    const {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    } = useProductionReport();

    const { isLoading, dateRange, visibleColumns, productSearchTerm, isProductSearchOpen } = state;
    const { details } = state.reportData;

    if (isInitialLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-5 w-96 mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full max-w-sm" />
                        <Skeleton className="h-48 w-full" />
                    </CardContent>
                </Card>
            </main>
        );
    }
    
    if (isAuthorized === false) {
        return null;
    }
    
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Reporte de Producción</CardTitle>
                            <CardDescription>Analiza el rendimiento de las órdenes de producción completadas en un rango de fechas.</CardDescription>
                        </div>
                        <Button onClick={actions.handleAnalyze} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Generar Reporte
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4 items-center">
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                "w-full sm:w-auto sm:min-w-[260px] justify-start text-left font-normal",
                                !dateRange && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                dateRange.to ? (
                                    <>
                                    {format(dateRange.from, "LLL dd, y", { locale: es })} -{" "}
                                    {format(dateRange.to, "LLL dd, y", { locale: es })}
                                    </>
                                ) : (
                                    format(dateRange.from, "LLL dd, y", { locale: es })
                                )
                                ) : (
                                <span>Seleccionar fecha</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={actions.setDateRange}
                                numberOfMonths={2}
                                locale={es}
                            />
                        </PopoverContent>
                    </Popover>
                    <SearchInput
                        options={selectors.productOptions}
                        onSelect={(option) => actions.setProductFilter(option.value)}
                        value={productSearchTerm}
                        onValueChange={actions.setProductSearchTerm}
                        placeholder="Filtrar por producto..."
                        open={isProductSearchOpen}
                        onOpenChange={actions.setProductSearchOpen}
                        className="w-full md:w-64"
                    />
                    <MultiSelectFilter
                        title="Clasificación"
                        options={selectors.classifications.map(c => ({ value: c, label: c }))}
                        selectedValues={state.classificationFilter}
                        onSelectedChange={actions.setClassificationFilter}
                    />
                    <MultiSelectFilter
                        title="Máquina"
                        options={selectors.machines.map(m => ({ value: m.id, label: m.name }))}
                        selectedValues={state.machineFilter}
                        onSelectedChange={actions.setMachineFilter}
                    />
                     <Button variant="ghost" onClick={actions.handleClearFilters}>
                        <FilterX className="mr-2 h-4 w-4" />
                        Limpiar Filtros
                    </Button>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Detalle de Órdenes</CardTitle>
                         <div className="flex items-center gap-2">
                            <DialogColumnSelector
                                allColumns={selectors.availableColumns}
                                visibleColumns={visibleColumns}
                                onColumnChange={actions.handleColumnVisibilityChange}
                                onSave={actions.handleSaveColumnVisibility}
                            />
                            <Button variant="outline" onClick={() => actions.handleExportPDF('landscape')} disabled={isLoading || details.length === 0}><FileDown className="mr-2"/>Exportar PDF</Button>
                            <Button variant="outline" onClick={actions.handleExportExcel} disabled={isLoading || details.length === 0}><FileSpreadsheet className="mr-2"/>Exportar Excel</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[60vh] border rounded-md">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    {selectors.visibleColumnsData.map(col => (
                                        <TableHead key={col.id} className={cn(col.align === 'right' && 'text-right')}>{col.label}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={visibleColumns.length}><Skeleton className="h-8 w-full" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : details.length > 0 ? (
                                    details.map(item => (
                                        <TableRow key={item.id}>
                                            {visibleColumns.map(colId => {
                                                const colData = selectors.getColumnContent(item, colId);
                                                return (
                                                    <TableCell key={colId} className={cn(colData.className)}>
                                                        {colData.content}
                                                    </TableCell>
                                                )
                                            })}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={visibleColumns.length} className="h-32 text-center">
                                            No se encontraron datos de producción para los filtros seleccionados.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </main>
    );
}
