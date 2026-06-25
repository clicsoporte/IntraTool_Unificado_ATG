/**
 * @fileoverview Page for the Transits Report.
 * This component visualizes active ERP Purchase Orders.
 */
'use client';

import React from 'react';
import { useTransitsReport, type SortKey } from '@/modules/analytics/hooks/useTransitsReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Loader2, CalendarIcon, Search, FileDown, FileSpreadsheet, FilterX, ArrowUp, ArrowDown, Columns3 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { Badge } from '@/components/ui/badge';
import type { TransitReportItem } from '@/modules/analytics/hooks/useTransitsReport';
import { DialogColumnSelector } from '@/components/ui/dialog-column-selector';

export default function TransitsReportPage() {
    const {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    } = useTransitsReport();

    const { isLoading, dateRange, searchTerm, supplierFilter, statusFilter, visibleColumns } = state;
    const { sortedData, availableColumns, visibleColumnsData } = selectors;

    if (isInitialLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader><Skeleton className="h-8 w-64" /><Skeleton className="h-5 w-96 mt-2" /></CardHeader>
                    <CardContent className="space-y-4"><Skeleton className="h-10 w-full max-w-sm" /><Skeleton className="h-48 w-full" /></CardContent>
                </Card>
            </main>
        );
    }
    
    if (isAuthorized === false) return null;
    
    const renderSortIcon = (key: SortKey) => {
        if (state.sortKey !== key) return null;
        return state.sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
    };

    const getColumnContent = (item: TransitReportItem, colId: string): React.ReactNode => {
        switch (colId) {
            case 'ordenCompra': return <span className="font-mono">{item.ORDEN_COMPRA}</span>;
            case 'proveedor': return item.proveedorName;
            case 'fecha': return format(new Date(item.FECHA_HORA), 'dd/MM/yyyy');
            case 'estado': 
                const statusInfo = selectors.statusConfig[item.ESTADO];
                return <Badge style={statusInfo ? { backgroundColor: statusInfo.color } : {}} className="text-white">{statusInfo?.label || item.ESTADO}</Badge>;
            case 'articulo': return <><p className="font-medium">{item.productDescription}</p><p className="text-xs text-muted-foreground">{item.ARTICULO}</p></>;
            case 'cantidad': return item.CANTIDAD_ORDENADA.toLocaleString();
            case 'stock': return (item.currentStock ?? 0).toLocaleString();
            case 'creadoPor': return item.CreatedBy;
            default: return null;
        }
    };

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Reporte de Tránsitos (Órdenes de Compra ERP)</CardTitle>
                            <CardDescription>Analiza las órdenes de compra activas en el ERP para monitorear el inventario en tránsito.</CardDescription>
                        </div>
                         <Button onClick={actions.handleAnalyze} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Analizar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-4">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button id="date" variant={"outline"} className={cn("w-full sm:w-auto sm:min-w-[260px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y", { locale: es })} - ${format(dateRange.to, "LLL dd, y", { locale: es })}`) : format(dateRange.from, "LLL dd, y", { locale: es })) : (<span>Seleccionar fecha</span>)}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={actions.setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                        </Popover>
                        <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar por OC, artículo, proveedor..." value={searchTerm} onChange={(e) => actions.setSearchTerm(e.target.value)} className="pl-8 w-full" /></div>
                        <MultiSelectFilter title="Proveedor" options={selectors.supplierOptions} selectedValues={supplierFilter} onSelectedChange={actions.setSupplierFilter} className="w-full sm:w-auto" />
                        <MultiSelectFilter title="Estado" options={selectors.statusOptions} selectedValues={statusFilter} onSelectedChange={actions.setStatusFilter} className="w-full sm:w-auto" />
                        <Button variant="ghost" onClick={actions.handleClearFilters} className="flex-shrink-0"><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div><CardTitle>Detalle de Tránsitos ({sortedData.length})</CardTitle></div>
                        <div className="flex items-center gap-2">
                             <DialogColumnSelector
                                allColumns={availableColumns}
                                visibleColumns={visibleColumns}
                                onColumnChange={actions.handleColumnVisibilityChange}
                                onSave={actions.handleSaveColumnVisibility}
                            />
                            <Button onClick={actions.handleExportExcel} variant="outline" disabled={isLoading || sortedData.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar a Excel</Button>
                            <Button onClick={actions.handleExportPDF} variant="outline" disabled={isLoading || sortedData.length === 0}><FileDown className="mr-2 h-4 w-4" />Exportar a PDF</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="h-[60vh] border rounded-md">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    {visibleColumnsData.map(col => (
                                        <TableHead key={col.id} className={cn(col.align === 'right' && 'text-right', col.sortable && 'cursor-pointer hover:bg-muted')} onClick={() => col.sortable && actions.handleSort(col.id as SortKey)}>
                                            <div className="flex items-center gap-2">
                                                {col.label} {renderSortIcon(col.id as SortKey)}
                                            </div>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? Array.from({ length: 10 }).map((_, i) => (<TableRow key={i}><TableCell colSpan={visibleColumns.length}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)) : sortedData.length > 0 ? (
                                    sortedData.map((item: TransitReportItem) => (
                                        <TableRow key={`${item.ORDEN_COMPRA}-${item.ARTICULO}`}>
                                            {visibleColumns.map(colId => (
                                                <TableCell key={colId} className={cn(availableColumns.find(c => c.id === colId)?.align === 'right' && 'text-right')}>
                                                    {getColumnContent(item, colId)}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                ) : (<TableRow><TableCell colSpan={visibleColumns.length} className="h-32 text-center"><p className="text-muted-foreground">No se encontraron tránsitos para los filtros seleccionados.</p></TableCell></TableRow>)}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </main>
    );
}
