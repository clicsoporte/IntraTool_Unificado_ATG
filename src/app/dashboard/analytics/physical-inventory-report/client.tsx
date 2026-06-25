/**
 * @fileoverview Page for the Physical Inventory Comparison Report.
 * This component visualizes the differences between physically counted inventory
 * and the stock levels recorded in the ERP system.
 */
'use client';

import React from 'react';
import { usePhysicalInventoryReport, type SortKey } from '@/modules/analytics/hooks/usePhysicalInventoryReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, FileSpreadsheet, Search, FilterX, ArrowUp, ArrowDown, FileDown, CalendarIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DialogColumnSelector } from '@/components/ui/dialog-column-selector';

export default function PhysicalInventoryReportPage() {
    const {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    } = usePhysicalInventoryReport();
    
    const { isLoading, dateRange, searchTerm, classificationFilter, differenceFilter, sortKey, sortDirection, visibleColumns } = state;
    const { sortedData, classifications, availableColumns, visibleColumnsData } = selectors;

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
        if (sortKey !== key) return null;
        return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
    };

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Reporte de Comparación de Inventario</CardTitle>
                            <CardDescription>Compara las cantidades contadas físicamente con el stock registrado en el ERP.</CardDescription>
                        </div>
                        <Button onClick={actions.fetchData} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Generar Reporte
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button id="date" variant={"outline"} className={cn("w-full sm:w-auto sm:min-w-[260px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y", { locale: es })} - ${format(dateRange.to, "LLL dd, y", { locale: es })}`) : format(dateRange.from, "LLL dd, y", { locale: es })) : (<span>Rango de Fechas del Conteo</span>)}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={actions.setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                        </Popover>
                        <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar por producto, ubicación o usuario..." value={searchTerm} onChange={(e) => actions.setSearchTerm(e.target.value)} className="pl-8 w-full" /></div>
                        <Select value={differenceFilter} onValueChange={actions.setDifferenceFilter}>
                            <SelectTrigger className="w-full sm:w-auto min-w-[200px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Mostrar Todo</SelectItem>
                                <SelectItem value="with-difference">Solo con Diferencias</SelectItem>
                                <SelectItem value="shortage">Solo Faltantes (Físico &lt; ERP)</SelectItem>
                                <SelectItem value="surplus">Solo Sobrantes (Físico &gt; ERP)</SelectItem>
                                <SelectItem value="empty-locations">Solo Ubicaciones Vacías</SelectItem>
                            </SelectContent>
                        </Select>
                        <MultiSelectFilter title="Clasificación" options={classifications.map(c => ({ value: c, label: c }))} selectedValues={classificationFilter} onSelectedChange={actions.setClassificationFilter} className="w-full sm:w-auto" />
                        <Button variant="ghost" onClick={actions.handleClearFilters} className="flex-shrink-0"><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                     <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Resultados del Conteo</CardTitle>
                            <CardDescription>Se encontraron {sortedData.length} registros que coinciden con tus filtros.</CardDescription>
                        </div>
                         <div className="flex items-center gap-2">
                            <DialogColumnSelector allColumns={availableColumns} visibleColumns={visibleColumns} onColumnChange={actions.handleColumnVisibilityChange} onSave={actions.savePreferences} />
                            <Button variant="outline" onClick={actions.handleExportPDF} disabled={isLoading || sortedData.length === 0}><FileDown className="mr-2"/>Exportar PDF</Button>
                            <Button variant="outline" onClick={actions.handleExportExcel} disabled={isLoading || sortedData.length === 0}><FileSpreadsheet className="mr-2"/>Exportar Excel</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="h-[60vh] border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {visibleColumnsData.map(col => (
                                        <TableHead key={col.id} className={cn("cursor-pointer", col.align === 'right' && 'text-right')} onClick={() => col.sortable && actions.handleSort(col.id as SortKey)}>
                                            <div className="flex items-center gap-2">
                                                {col.align === 'right' && <div className="flex-1" />}
                                                {col.label} {renderSortIcon(col.id as SortKey)}
                                            </div>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={visibleColumns.length} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : sortedData.length > 0 ? (
                                    sortedData.map(item => (
                                        <TableRow key={`${item.productId}-${item.locationId}`}>
                                            {visibleColumnsData.map(col => {
                                                const cellData = selectors.getColumnContent(item, col.id);
                                                let content: React.ReactNode;
                                                switch (cellData.type) {
                                                    case 'product':
                                                        content = (
                                                            <>
                                                                <div className="font-medium">{cellData.data.description}</div>
                                                                <div className="text-sm text-muted-foreground">{cellData.data.id}</div>
                                                            </>
                                                        );
                                                        break;
                                                    case 'number':
                                                        content = (cellData.data as number).toLocaleString();
                                                        break;
                                                    case 'difference':
                                                        const diff = cellData.data as number;
                                                        content = `${diff > 0 ? '+' : ''}${diff.toLocaleString()}`;
                                                        break;
                                                    case 'date':
                                                        const dateContent = cellData.data as string;
                                                        content = dateContent ? format(parseISO(dateContent), 'dd/MM/yy HH:mm') : 'N/A';
                                                        break;
                                                    default:
                                                        content = cellData.data;
                                                }
                                                return <TableCell key={col.id} className={cn(col.align === 'right' && 'text-right', cellData.className)}>{content}</TableCell>;
                                            })}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={visibleColumns.length} className="h-24 text-center">No hay datos de conteo para los filtros seleccionados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </main>
    );
}
