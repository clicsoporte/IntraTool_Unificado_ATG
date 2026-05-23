/**
 * @fileoverview Page for the new Warehouse Occupancy Report.
 */
'use client';

import React from 'react';
import { useOccupancyReport, type SortKey, type OccupancyReportRow } from '@/modules/analytics/hooks/useOccupancyReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Loader2, Search, FilterX, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, FileSpreadsheet, ChevronDown, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DialogColumnSelector } from '@/components/ui/dialog-column-selector';
import { 
    Dialog, 
    DialogContent, 
    DialogDescription,
    DialogFooter, 
    DialogHeader, 
    DialogTitle, 
    DialogClose 
} from '@/components/ui/dialog';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// This new component handles rendering the tooltip for mixed items.
const ItemsTooltipContent = ({ items }: { items: OccupancyReportRow['items'] }) => {
    return (
        <div className="p-2">
            <p className="font-bold mb-2">Artículos en esta ubicación:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
                {items.map((item: OccupancyReportRow['items'][0]) => (
                    <li key={item.productId}>
                        <span className="font-semibold">{item.productDescription}</span>
                        <span className="text-muted-foreground"> ({item.productId})</span>
                        {item.quantity !== undefined && <span className="font-bold ml-2">Cant: {item.quantity}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
};


export default function OccupancyReportPage() {
    const {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    } = useOccupancyReport();

    const [selectedLocationForDetails, setSelectedLocationForDetails] = React.useState<OccupancyReportRow | null>(null);
    const [isDetailsDialogOpen, setIsDetailsDialogOpen] = React.useState(false);

    const { isLoading, searchTerm, sortKey, sortDirection, statusFilter, classificationFilter, clientFilter, rackFilter, levelFilter, rowsPerPage, currentPage, visibleColumns, hasRun } = state;
    const { paginatedData, classifications, clients, rackOptions, levelOptions } = selectors;

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
                            <CardTitle>Reporte de Ocupación de Almacén</CardTitle>
                            <CardDescription>
                                Visualiza el estado de cada ubicación final (Libre, Ocupado, Mixto) y su contenido.
                            </CardDescription>
                        </div>
                        <Button onClick={actions.fetchData} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Generar Reporte
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                     <div className="flex flex-wrap gap-4 items-center">
                        <div className="relative flex-1 min-w-[240px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Buscar por ubicación, producto, cliente..." 
                                value={searchTerm} 
                                onChange={(e) => actions.setSearchTerm(e.target.value)} 
                                className="pl-8 w-full"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(value) => actions.setStatusFilter(value as any)}>
                            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los Estados</SelectItem>
                                <SelectItem value="Libre">Solo Libres</SelectItem>
                                <SelectItem value="Ocupado">Solo Ocupados</SelectItem>
                                <SelectItem value="Mixto">Solo Mixtos</SelectItem>
                            </SelectContent>
                        </Select>
                         <MultiSelectFilter
                            title="Clasificación"
                            options={classifications.map((c: string) => ({ value: c, label: c }))}
                            selectedValues={classificationFilter}
                            onSelectedChange={actions.setClassificationFilter}
                        />
                         <MultiSelectFilter
                            title="Cliente"
                            options={clients.map((c: { id: string, name: string }) => ({ value: String(c.id), label: c.name }))}
                            selectedValues={clientFilter}
                            onSelectedChange={actions.setClientFilter}
                        />
                        <MultiSelectFilter
                            title="Rack"
                            options={rackOptions}
                            selectedValues={rackFilter}
                            onSelectedChange={actions.setRackFilter}
                        />
                        <MultiSelectFilter
                            title="Nivel"
                            options={levelOptions}
                            selectedValues={levelFilter}
                            onSelectedChange={actions.setLevelFilter}
                            disabled={rackFilter.length === 0}
                        />
                         <Button variant="ghost" onClick={actions.handleClearFilters}>
                            <FilterX className="mr-2 h-4 w-4" />
                            Limpiar
                        </Button>
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Listado de Ubicaciones ({selectors.filteredData.length})</CardTitle>
                         <div className="flex items-center gap-2">
                             <DialogColumnSelector
                                allColumns={selectors.availableColumns}
                                visibleColumns={visibleColumns}
                                onColumnChange={actions.handleColumnVisibilityChange}
                                onSave={actions.savePreferences}
                            />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" disabled={isLoading || paginatedData.length === 0}>
                                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                                        Exportar Excel
                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onClick={actions.handleExportExcel} className="cursor-pointer">
                                        <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                                        <span>Resumen (por Ubicación)</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={actions.handleExportDetailedExcel} className="cursor-pointer">
                                        <FileSpreadsheet className="mr-2 h-4 w-4 text-sky-600" />
                                        <span>Detalle (por Artículo)</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[60vh] border rounded-md">
                         <TooltipProvider>
                            <Table>
                                <TableHeader className="sticky top-0 bg-background z-10">
                                    <TableRow>
                                        {selectors.visibleColumnsData.map((col) => (
                                            <TableHead key={col.id} className="cursor-pointer hover:bg-muted" onClick={() => actions.handleSort(col.id as SortKey)}>
                                                <div className="flex items-center gap-2">{col.label} {renderSortIcon(col.id as SortKey)}</div>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array.from({ length: rowsPerPage }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={visibleColumns.length}><Skeleton className="h-8 w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : !hasRun ? (
                                        <TableRow>
                                            <TableCell colSpan={visibleColumns.length} className="h-32 text-center">
                                                Ajusta los filtros y haz clic en &quot;Generar Reporte&quot; para empezar.
                                            </TableCell>
                                        </TableRow>
                                    ) : paginatedData.length > 0 ? (
                                        paginatedData.map((item: OccupancyReportRow) => (
                                            <TableRow key={item.locationId}>
                                                {selectors.visibleColumnsData.map((col) => {
                                                     const { content, className } = selectors.renderCellContent(item, col.id);
                                                    return (
                                                        <TableCell 
                                                            key={col.id} 
                                                            className={cn(
                                                                className,
                                                                (col.id === 'items' || col.id === 'clients') && item.items.length > 0 && "cursor-pointer hover:bg-muted/80 transition-colors"
                                                            )}
                                                            onClick={() => {
                                                                if ((col.id === 'items' || col.id === 'clients') && item.items.length > 0) {
                                                                    setSelectedLocationForDetails(item);
                                                                    setIsDetailsDialogOpen(true);
                                                                }
                                                            }}
                                                        >
                                                            {col.id === 'items' && item.status === 'Mixto' ? (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <div className="flex items-center gap-1">
                                                                            {content}
                                                                        </div>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <ItemsTooltipContent items={item.items} />
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            ) : (
                                                                content
                                                            )}
                                                        </TableCell>
                                                    )
                                                })}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={visibleColumns.length} className="h-32 text-center">
                                                No se encontraron ubicaciones con los filtros aplicados.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                         </TooltipProvider>
                    </ScrollArea>
                </CardContent>
                 <CardFooter className="flex w-full items-center justify-end pt-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="rows-per-page">Filas por página:</Label>
                            <Select value={String(rowsPerPage)} onValueChange={(value) => actions.setRowsPerPage(Number(value))}>
                                <SelectTrigger id="rows-per-page" className="w-20"><SelectValue /></SelectTrigger>
                                <SelectContent>{[10, 25, 50, 100].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <span className="text-sm text-muted-foreground">Página {currentPage + 1} de {selectors.totalPages}</span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => actions.setCurrentPage(currentPage - 1)} disabled={currentPage === 0}><ChevronLeft className="h-4 w-4" /></Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => actions.setCurrentPage(currentPage + 1)} disabled={currentPage >= selectors.totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                    </div>
                </CardFooter>
            </Card>

            {/* Modal de Detalle de Ubicación */}
            <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                            <span>📦 Detalle de Contenido</span>
                            <Badge variant={selectedLocationForDetails?.status === 'Libre' ? 'secondary' : (selectedLocationForDetails?.status === 'Ocupado' ? 'default' : 'destructive')}>
                                {selectedLocationForDetails?.status}
                            </Badge>
                        </DialogTitle>
                        <DialogDescription>
                            Ubicación: <strong className="text-foreground">{selectedLocationForDetails?.locationPath}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4 space-y-6">
                        <div className="rounded-md border overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-bold">Código</TableHead>
                                        <TableHead className="font-bold">Descripción</TableHead>
                                        <TableHead className="font-bold">Clasificación</TableHead>
                                        <TableHead className="text-right font-bold">Cantidad</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedLocationForDetails?.items && selectedLocationForDetails.items.length > 0 ? (
                                        selectedLocationForDetails.items.map((prod) => (
                                            <TableRow key={prod.productId}>
                                                <TableCell className="font-mono text-xs font-bold text-muted-foreground">{prod.productId}</TableCell>
                                                <TableCell className="text-xs font-semibold">{prod.productDescription}</TableCell>
                                                <TableCell className="text-xs">{prod.classification || "-"}</TableCell>
                                                <TableCell className="text-right font-bold text-primary">{prod.quantity !== undefined ? prod.quantity : 0}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                                                No hay artículos en esta ubicación.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        
                        <div className="space-y-2">
                            <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Clientes Asignados a la Ubicación</h4>
                            <div className="flex flex-wrap gap-2 pt-1">
                                {selectedLocationForDetails?.clients && selectedLocationForDetails.clients.length > 0 ? (
                                    selectedLocationForDetails.clients.map((c) => (
                                        <Badge key={c.clientId} variant="outline" className="px-2.5 py-1 text-xs">
                                            {c.clientName} <span className="ml-1 text-[10px] text-muted-foreground">({c.clientId})</span>
                                        </Badge>
                                    ))
                                ) : (
                                    <Badge variant="outline" className="px-2.5 py-1 text-xs text-muted-foreground">
                                        Venta General (Sin restricción de cliente)
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cerrar</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );
}
