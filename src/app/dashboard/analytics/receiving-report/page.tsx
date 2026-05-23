/**
 * @fileoverview Page for the Receiving Report.
 * This component visualizes receiving events recorded via the receiving wizard.
 */
'use client';

import React from 'react';
import { useReceivingReport } from '@/modules/analytics/hooks/useReceivingReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CalendarIcon, Search, FileDown, FileSpreadsheet, FilterX, Columns3 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

export default function ReceivingReportPage() {
    const {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    } = useReceivingReport();

    const { isLoading, dateRange, searchTerm, userFilter, locationFilter, visibleColumns } = state;
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

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <Card>
                 <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Reporte de Recepciones y Movimientos</CardTitle>
                            <CardDescription>Audita las recepciones de mercadería y movimientos de inventario registrados en el sistema.</CardDescription>
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
                                    {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y", { locale: es })} - ${format(dateRange.to, "LLL dd, y", { locale: es })}`) : format(dateRange.from, "LLL dd, y", { locale: es })) : (<span>Rango de Fechas</span>)}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={actions.setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                        </Popover>
                        <SearchInput
                            options={[]}
                            value={searchTerm}
                            onValueChange={actions.setSearchTerm}
                            placeholder="Buscar por producto, lote, documento..."
                            open={false}
                            onOpenChange={()=>{}}
                            onSelect={()=>{}}
                            className="w-full sm:w-auto flex-1"
                        />
                        <MultiSelectFilter title="Usuario" options={selectors.userOptions} selectedValues={userFilter} onSelectedChange={actions.setUserFilter} className="w-full sm:w-auto" />
                        <MultiSelectFilter title="Ubicación" options={selectors.locationOptions} selectedValues={locationFilter} onSelectedChange={actions.setLocationFilter} className="w-full sm:w-auto" />
                        <Button variant="ghost" onClick={actions.handleClearFilters} className="flex-shrink-0"><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                     <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Resultados</CardTitle>
                            <CardDescription>Se encontraron {sortedData.length} registros que coinciden con tus filtros.</CardDescription>
                        </div>
                         <div className="flex items-center gap-2">
                             <DialogColumnSelector
                                allColumns={availableColumns}
                                visibleColumns={visibleColumns}
                                onColumnChange={actions.handleColumnVisibilityChange}
                                onSave={actions.handleSavePreferences}
                            />
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
                                        <TableHead key={col.id}>{col.label}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={visibleColumns.length} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : sortedData.length > 0 ? (
                                    sortedData.map(item => (
                                        <TableRow key={item.id} className={cn(item.quantity === 0 && 'bg-destructive/10 text-destructive')}>
                                             {visibleColumns.map(colId => {
                                                 const { content, className, type, variant } = selectors.getColumnContent(item, colId);
                                                 return (
                                                     <TableCell key={colId} className={cn(className, item.quantity === 0 && 'text-destructive')}>
                                                         {type === 'badge' ? (
                                                             <Badge variant={variant as any}>{content}</Badge>
                                                         ) : type === 'multiline' && Array.isArray(content) ? (
                                                             <div className="flex flex-col">
                                                                 {content.map((line: any, idx: number) => (
                                                                     <span key={idx} className={line.className || ''}>
                                                                         {line.text}
                                                                     </span>
                                                                 ))}
                                                             </div>
                                                         ) : (
                                                             content
                                                         )}
                                                     </TableCell>
                                                 )
                                             })}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={visibleColumns.length} className="h-24 text-center">No hay datos para los filtros seleccionados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </main>
    );
}