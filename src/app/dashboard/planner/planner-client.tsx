

'use client';

import React from 'react';
import { usePlanner } from '@/modules/planner/hooks/usePlanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { FilePlus, Loader2, FilterX, CalendarIcon, ChevronLeft, ChevronRight, RefreshCcw, MoreVertical, History, Undo2, Check, PackageCheck, XCircle, Pencil, AlertTriangle, User as UserIcon, MessageSquarePlus, FileDown, Play, Pause, Wrench, Hourglass, FileSpreadsheet, Send, ShoppingBag, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ProductionOrder, ProductionOrderPriority, PlannerNotePayload, AdministrativeActionPayload } from '@/modules/core/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { DialogColumnSelector } from '@/components/ui/dialog-column-selector';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLoading } from '@/modules/core/hooks/useLoading';


/**
 * @fileoverview This is the main UI component for the Production Planner page.
 * It is responsible for rendering the layout, filters, and order cards.
 * All business logic, state management, and data fetching are handled by the `usePlanner` hook.
 */
export default function PlannerClient() {
    const {
        state,
        actions,
        selectors,
        isAuthorized,
    } = usePlanner();
    const { isAuthReady } = useAuth();
    const { showLoading, hideLoading } = useLoading();
    
    const {
        isLoading, isSubmitting, isRefreshing, isNewOrderDialogOpen, isEditOrderDialogOpen, orders, viewingArchived,
        currentPage, pageSize, plannerSettings, newOrder, orderToEdit,
        searchTerm, statusFilter, classificationFilter, showOnlyMyOrders, dateFilter,
        customerSearchTerm, isCustomerSearchOpen, productSearchTerm, isProductSearchOpen,
        isStatusDialogOpen, orderToUpdate, newStatus, statusUpdateNotes, deliveredQuantity,
        defectiveQuantity, erpPackageNumber, erpTicketNumber, isHistoryDialogOpen, historyOrder,
        history, isHistoryLoading, isReopenDialogOpen, reopenStep, reopenConfirmationText,
        dynamicStatusConfig, isAddNoteDialogOpen, notePayload, isActionDialogOpen,
        activeOrdersForSelectedProduct, visibleColumns, orderToConfirmModification
    } = state;

    React.useEffect(() => {
        if (isLoading && !isRefreshing) {
            showLoading("Cargando órdenes de producción...");
        } else if (isSubmitting) {
            showLoading("Procesando solicitud...");
        } else {
            hideLoading();
        }
        // Cleanup on unmount
        return () => {
            hideLoading();
        };
    }, [isLoading, isRefreshing, isSubmitting, showLoading, hideLoading]);

    if (!isAuthReady) {
        return (
            <main className="flex-1 p-4 md:p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Órdenes de Producción</h1>
                    <Skeleton className="h-10 w-32" />
                </div>
                <Card>
                    <CardContent className="p-4 space-y-4">
                        <div className="flex flex-col md:flex-row gap-4">
                           <Skeleton className="h-10 w-full max-w-sm" />
                           <Skeleton className="h-10 w-full md:w-[180px]" />
                           <Skeleton className="h-10 w-full md:w-[240px]" />
                           <Skeleton className="h-10 w-full md:w-[240px]" />
                        </div>
                    </CardContent>
                </Card>
                 <div className="space-y-4 mt-6">
                    <Skeleton className="h-56 w-full" />
                    <Skeleton className="h-56 w-full" />
                    <Skeleton className="h-56 w-full" />
                </div>
            </main>
        )
    }

    if(isAuthorized === false) {
        return null;
    }

    const renderOrderCard = (order: ProductionOrder) => {
        const permissions = selectors.getOrderPermissions(order);

        const daysRemaining = selectors.getDaysRemaining(order.deliveryDate);
        const scheduledDaysRemaining = selectors.getScheduledDaysRemaining(order);
        const netDifference = (order.deliveredQuantity ?? 0) - (order.defectiveQuantity ?? 0) - order.quantity;
        
        const changeStatusActions = [
            { check: permissions.canSendToReview.allowed, action: () => actions.openStatusDialog(order, 'pending-review'), label: 'Enviar a Revisión', icon: <Send className="mr-2"/>, className: 'text-cyan-600' },
            { check: permissions.canGoBackToPending.allowed, action: () => actions.openStatusDialog(order, 'pending'), label: 'Devolver a Pendiente', icon: <Undo2 className="mr-2"/>, className: 'text-orange-600' },
            { check: permissions.canSendToApproval.allowed, action: () => actions.openStatusDialog(order, 'pending-approval'), label: 'Enviar a Aprobación', icon: <ShoppingBag className="mr-2"/>, className: 'text-orange-600' },
            { check: permissions.canGoBackToReview.allowed, action: () => actions.openStatusDialog(order, 'pending-review'), label: 'Devolver a Revisión', icon: <Undo2 className="mr-2"/>, className: 'text-orange-600' },
            { check: permissions.canConfirmModification.allowed, action: () => actions.setOrderToConfirmModification(order), label: 'Confirmar Modificación', icon: <Check className="mr-2"/>, className: 'text-green-600 font-bold' },
            { check: permissions.canApprove.allowed, action: () => actions.openStatusDialog(order, 'approved'), label: 'Aprobar', icon: <Check className="mr-2"/>, className: 'text-green-600' },
            { check: permissions.canQueue.allowed, action: () => actions.openStatusDialog(order, 'in-queue'), label: 'Poner en Cola', icon: <Hourglass className="mr-2"/>, className: 'text-cyan-600' },
            { check: permissions.canStart.allowed, action: () => actions.openStatusDialog(order, 'in-progress'), label: 'Iniciar Progreso', icon: <Play className="mr-2"/>, className: 'text-blue-600' },
            { check: permissions.canResumeFromHold.allowed, action: () => actions.openStatusDialog(order, 'in-progress'), label: 'Reanudar Progreso', icon: <Play className="mr-2"/>, className: 'text-blue-600' },
            { check: permissions.canHold.allowed, action: () => actions.openStatusDialog(order, 'on-hold'), label: 'Poner en Espera', icon: <Pause className="mr-2"/>, className: 'text-gray-600' },
            { check: permissions.canMaintain.allowed, action: () => actions.openStatusDialog(order, 'in-maintenance'), label: 'Poner en Mantenimiento', icon: <Wrench className="mr-2"/>, className: 'text-gray-600' },
            { check: permissions.canComplete.allowed, action: () => actions.openStatusDialog(order, 'completed'), label: 'Marcar como Completada', icon: <PackageCheck className="mr-2"/>, className: 'text-indigo-600' },
            { check: permissions.canReceive.allowed, action: () => actions.openStatusDialog(order, 'received-in-warehouse'), label: 'Recibir en Bodega', icon: <PackageCheck className="mr-2"/>, className: 'text-gray-700' },
            { check: permissions.canRequestUnapproval.allowed, action: () => actions.openAdminActionDialog(order, 'unapproval-request'), label: 'Solicitar Desaprobación', icon: <AlertTriangle className="mr-2"/>, className: 'text-orange-600 font-bold' },
            { check: permissions.canCancelPending.allowed, action: () => actions.openStatusDialog(order, 'canceled'), label: 'Cancelar Orden', icon: <XCircle className="mr-2"/>, className: 'text-red-600' },
            { check: permissions.canRequestCancel.allowed, action: () => actions.openAdminActionDialog(order, 'cancellation-request'), label: 'Solicitar Cancelación', icon: <XCircle className="mr-2"/>, className: 'text-red-600' },
            { check: permissions.canReopen.allowed, action: () => { actions.setOrderToUpdate(order); actions.setReopenDialogOpen(true); }, label: 'Reabrir', icon: <Undo2 className="mr-2"/>, className: 'text-orange-600' }
        ];

        return (
            <Card key={order.id} className="w-full flex flex-col">
                <CardHeader className="p-4">
                    <div className="flex justify-between items-start gap-2">
                        <div>
                            <CardTitle className="text-lg">{order.consecutive} - [{order.productId}] {order.productDescription}</CardTitle>
                            <CardDescription>Cliente: {order.customerName} {plannerSettings?.showCustomerTaxId ? `(${order.customerTaxId})` : ''}</CardDescription>
                        </div>
                        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                            {!!order.reopened && <Badge variant="destructive"><RefreshCcw className="mr-1 h-3 w-3" /> Reabierta</Badge>}
                            {!!order.hasBeenModified && <Badge variant="destructive" className="animate-pulse"><AlertTriangle className="mr-1 h-3 w-3" /> Modificado</Badge>}
                             <Button variant="ghost" size="icon" onClick={() => actions.handleOpenHistory(order)}><History className="h-4 w-4" /></Button>
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Acciones de Orden</DropdownMenuLabel>
                                    <DropdownMenuSeparator/>
                                    <DropdownMenuItem onSelect={() => { actions.setOrderToEdit(order); actions.setEditOrderDialogOpen(true); }} disabled={!permissions.canEdit.allowed}>
                                        <Pencil className="mr-2"/> Editar Orden
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => actions.openAddNoteDialog(order)}><MessageSquarePlus className="mr-2" /> Añadir Nota</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => actions.handleExportSingleOrderPDF(order)}><FileDown className="mr-2"/> Exportar a PDF</DropdownMenuItem>
                                    <DropdownMenuSeparator/>
                                    <DropdownMenuLabel>Cambio de Estado</DropdownMenuLabel>
                                    <DropdownMenuSeparator/>
                                    {changeStatusActions.filter(a => a.check).length > 0 ? (
                                        changeStatusActions.filter(a => a.check).map((action, index) => (
                                            <DropdownMenuItem key={index} onSelect={action.action} className={action.className}>
                                                {action.icon} {action.label}
                                            </DropdownMenuItem>
                                        ))
                                    ) : (
                                        <DropdownMenuItem disabled>No hay acciones disponibles</DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex-grow">
                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-6 text-sm">
                        <div className="space-y-1">
                            <p className="font-semibold text-muted-foreground">Estado Actual</p>
                            <div className="flex items-center gap-2">
                                <span className={cn("h-3 w-3 rounded-full", selectors.statusConfig[order.status]?.color)}></span>
                                <span className="font-medium">{selectors.statusConfig[order.status]?.label || order.status}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="font-semibold text-muted-foreground">Prioridad</p>
                             <Select value={order.priority} onValueChange={(value) => actions.handleDetailUpdate(order.id, { priority: value as ProductionOrderPriority })}>
                                <SelectTrigger className={cn("h-8 w-32 border-0 focus:ring-0", selectors.priorityConfig[order.priority]?.className)}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                     {Object.entries(selectors.priorityConfig).map(([key, config]) => (
                                        <SelectItem key={key} value={key} disabled={!selectors.hasPermission('planner:priority:update')}>{config.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                             <p className={cn("font-semibold text-muted-foreground", !order.machineId && "text-destructive")}>{plannerSettings?.assignmentLabel || 'Máquina'}</p>
                            <Select value={order.machineId || 'none'} onValueChange={(value) => actions.handleDetailUpdate(order.id, { machineId: value })}>
                                <SelectTrigger className={cn("h-8 w-40 border-0 focus:ring-0", !order.machineId && "border-destructive focus:ring-destructive/50")}>
                                    <SelectValue placeholder="Sin Asignar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sin Asignar</SelectItem>
                                    {plannerSettings?.machines.map(machine => (
                                        <SelectItem key={machine.id} value={machine.id} disabled={!selectors.hasPermission('planner:machine:assign')}>{machine.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <p className={cn("font-semibold text-muted-foreground", !order.shiftId && "text-destructive")}>{plannerSettings?.shiftLabel || 'Turno'}</p>
                            <Select value={order.shiftId || 'none'} onValueChange={(value) => actions.handleDetailUpdate(order.id, { shiftId: value })}>
                                <SelectTrigger className={cn("h-8 w-40 border-0 focus:ring-0", !order.shiftId && "border-destructive focus:ring-destructive/50")}>
                                    <SelectValue placeholder="Sin Asignar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sin Asignar</SelectItem>
                                    {plannerSettings?.shifts.map(shift => (
                                        <SelectItem key={shift.id} value={shift.id}>{shift.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-1">
                            <p className={cn("font-semibold text-muted-foreground", !order.scheduledStartDate && "text-destructive")}>Fecha Prog.</p>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button size="sm" variant="outline" className={cn("h-8 w-48 justify-start text-left font-normal", !order.scheduledStartDate && "border-destructive focus:ring-destructive/50")} disabled={!selectors.hasPermission('planner:schedule')}><CalendarIcon className="mr-2 h-4 w-4" />{order.scheduledStartDate ? `${format(parseISO(order.scheduledStartDate), 'dd/MM/yy')} - ${order.scheduledEndDate ? format(parseISO(order.scheduledEndDate), 'dd/MM/yy') : ''}` : 'No programada'}</Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="range" selected={{ from: order.scheduledStartDate ? parseISO(order.scheduledStartDate) : undefined, to: order.scheduledEndDate ? parseISO(order.scheduledEndDate) : undefined }} onSelect={(range) => actions.handleDetailUpdate(order.id, { scheduledDateRange: range })} /></PopoverContent>
                                </Popover>
                                <span className={cn('text-xs font-semibold', scheduledDaysRemaining.color)}>({scheduledDaysRemaining.label})</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="font-semibold text-muted-foreground">Fecha Requerida</p>
                            <div className="flex items-center gap-2">
                                <span>{format(parseISO(order.deliveryDate), 'dd/MM/yyyy')}</span>
                                <span className={cn('text-xs font-semibold', daysRemaining.color)}>({daysRemaining.label})</span>
                            </div>
                        </div>
                        <div className="space-y-1"><p className="font-semibold text-muted-foreground">Cant. Solicitada</p><p className="font-bold text-lg">{order.quantity.toLocaleString()}</p></div>
                        
                        {(order.deliveredQuantity !== null && order.deliveredQuantity !== undefined) && (
                             <>
                                <div className="space-y-1"><p className="font-semibold text-muted-foreground">Cant. Producida</p><p className="font-bold text-lg text-green-600">{order.deliveredQuantity.toLocaleString()}</p></div>
                                <div className="space-y-1"><p className="font-semibold text-muted-foreground">Cant. Defectuosa</p><p className="font-bold text-lg text-red-600">{(order.defectiveQuantity ?? 0).toLocaleString()}</p></div>
                                <div className="space-y-1">
                                    <p className="font-semibold text-muted-foreground">Diferencia Neta</p>
                                    <p className={cn("font-bold text-lg", netDifference > 0 && "text-blue-600", netDifference < 0 && "text-destructive")}>
                                        {netDifference.toLocaleString()}
                                    </p>
                                </div>
                            </>
                        )}
                        
                        {order.purchaseOrder && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Nº OC Cliente</p><p>{order.purchaseOrder}</p></div>}
                        
                        {order.inventory !== null && order.inventory !== undefined && (
                            <div className="space-y-1"><p className="font-semibold text-muted-foreground">Inv. Manual (Creación)</p><p>{order.inventory.toLocaleString()}</p></div>
                        )}
                        {order.inventoryErp !== null && order.inventoryErp !== undefined && (
                            <div className="space-y-1"><p className="font-semibold text-muted-foreground">Inv. ERP (Creación)</p><p>{order.inventoryErp.toLocaleString()}</p></div>
                        )}

                        {order.erpPackageNumber && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Nº Paquete ERP</p><p>{order.erpPackageNumber}</p></div>}
                        {order.erpTicketNumber && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Nº Boleta ERP</p><p>{order.erpTicketNumber}</p></div>}
                    </div>
                     {order.pendingAction !== 'none' && (
                        <div className="mt-4">
                            <AlertDialog open={state.isActionDialogOpen && state.orderToUpdate?.id === order.id} onOpenChange={(open) => { if (!open) actions.setActionDialogOpen(false); }}>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" className="border-yellow-500 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700 w-full" onClick={() => { actions.setOrderToUpdate(order); actions.setActionDialogOpen(true); }}>
                                        <AlertTriangle className="mr-2 h-4 w-4 animate-pulse" />
                                        Solicitud Pendiente: {order.pendingAction === 'unapproval-request' ? 'Desaprobación' : 'Cancelación'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Gestionar Solicitud Pendiente</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            La orden tiene una solicitud de &quot;{order.pendingAction === 'unapproval-request' ? 'Desaprobación' : 'Cancelación'}&quot; pendiente. Puedes aprobar o rechazar esta solicitud.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <div className="py-4 space-y-2">
                                        <Label htmlFor="admin-action-notes">Notas (Requerido para aprobar o rechazar)</Label>
                                        <Textarea id="admin-action-notes" value={statusUpdateNotes} onChange={e => actions.setStatusUpdateNotes(e.target.value)} placeholder="Motivo de la acción..."/>
                                    </div>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cerrar</AlertDialogCancel>
                                        <Button variant="secondary" onClick={() => actions.handleAdminAction(false)} disabled={!statusUpdateNotes.trim() || isSubmitting}>Rechazar Solicitud</Button>
                                        <Button onClick={() => actions.handleAdminAction(true)} className={order.pendingAction === 'cancellation-request' ? 'bg-destructive hover:bg-destructive/90' : ''} disabled={!statusUpdateNotes.trim() || isSubmitting}>Aprobar Solicitud</Button>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                     {order.notes && (<div className="mt-4 text-xs bg-muted p-2 rounded-md"><p className="font-semibold">Notas de la Orden:</p><p className="text-muted-foreground">&quot;{order.notes}&quot;</p></div>)}
                     {order.lastStatusUpdateNotes && (<div className="mt-2 text-xs bg-muted p-2 rounded-md"><p className="font-semibold">Última nota de estado:</p><p className="text-muted-foreground">&quot;{order.lastStatusUpdateNotes}&quot; - <span className="italic">{order.lastStatusUpdateBy}</span></p></div>)}
                     {!!order.hasBeenModified && order.lastModifiedBy && (<div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded-md"><p className="font-semibold">Última Modificación por:</p><p className="">{order.lastModifiedBy} el {format(parseISO(order.lastModifiedAt as string), "dd/MM/yy 'a las' HH:mm")}</p></div>)}
                </CardContent>
                <CardFooter className="p-4 pt-0 text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
                    <span>Solicitado por: {order.requestedBy} el {format(parseISO(order.requestDate), 'dd/MM/yyyy')}</span>
                    {order.approvedBy && <span>Aprobado por: {order.approvedBy}</span>}
                </CardFooter>
            </Card>
        );
    }
    
    const renderFilters = () => (
        <div className="flex flex-col md:flex-row gap-4 items-center">
            <Input placeholder="Buscar por Nº orden, cliente o producto..." value={searchTerm} onChange={(e) => actions.setSearchTerm(e.target.value)} className="w-full md:w-64" />
            <MultiSelectFilter
                title="Estado"
                options={Object.entries(selectors.statusConfig).map(([key, { label }]) => ({ value: key, label }))}
                selectedValues={statusFilter}
                onSelectedChange={actions.setStatusFilter}
                className="w-full md:w-auto"
            />
            <MultiSelectFilter
                title="Clasificación"
                options={selectors.classifications.map(c => ({ value: c, label: c }))}
                selectedValues={classificationFilter}
                onSelectedChange={actions.setClassificationFilter}
                className="w-full md:w-auto"
            />
            <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full md:w-auto justify-start text-left font-normal", !dateFilter && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateFilter?.from ? (dateFilter.to ? (`${format(dateFilter.from, "LLL dd, y")} - ${format(dateFilter.to, "LLL dd, y")}`) : (format(dateFilter.from, "LLL dd, y"))) : (<span>Filtrar por fecha</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="range" selected={dateFilter} onSelect={actions.setDateFilter} /></PopoverContent></Popover>
            <DialogColumnSelector
                allColumns={selectors.availableColumns}
                visibleColumns={visibleColumns}
                onColumnChange={actions.handleColumnVisibilityChange}
                onSave={actions.handleSaveColumnVisibility}
            />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full md:w-auto"><FileDown className="mr-2 h-4 w-4"/>Exportar</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => actions.handleExportPDF('portrait')}><FileDown className="mr-2 h-4 w-4" /> Exportar a PDF</DropdownMenuItem>
                    <DropdownMenuItem onSelect={actions.handleExportExcel}><FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" onClick={() => { actions.setSearchTerm(''); actions.setStatusFilter([]); actions.setClassificationFilter([]); actions.setDateFilter(undefined); actions.setShowOnlyMyOrders(true); }} className="w-full md:w-auto">
                <FilterX className="mr-2 h-4 w-4" />Limpiar
            </Button>
        </div>
    );
    
    return (
        <main className="flex-1 flex flex-col p-4 md:p-6">
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm -mx-4 -mt-4 px-4 pt-4 pb-4 md:-mx-6 md:-mt-6 md:px-6 md:pt-6 md:pb-6 space-y-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <h1 className="text-lg font-semibold md:text-2xl">Órdenes de Producción</h1>
                    <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                        <Button variant="outline" onClick={() => actions.loadInitialData(true)} disabled={isRefreshing || isLoading}>{isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}Refrescar</Button>
                        <div className="flex items-center gap-1">
                            <Button variant={viewingArchived ? "outline" : "secondary"} onClick={() => actions.setViewingArchived(false)}>Activas ({selectors.totalActiveCount})</Button>
                            <Button variant={viewingArchived ? "secondary" : "outline"} onClick={() => actions.setViewingArchived(true)}>Archivadas ({selectors.totalArchivedCount})</Button>
                        </div>
                        {selectors.hasPermission('planner:create') && (
                            <Dialog open={isNewOrderDialogOpen} onOpenChange={actions.setNewOrderDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button><FilePlus className="mr-2"/> Nueva Orden</Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-3xl">
                                    <form onSubmit={(e) => { e.preventDefault(); actions.handleCreateOrder(); }}>
                                        <DialogHeader>
                                            <DialogTitle>Crear Nueva Orden de Producción</DialogTitle>
                                            <DialogDescription>Complete los detalles para enviar una nueva orden a producción.</DialogDescription>
                                        </DialogHeader>
                                        <ScrollArea className="h-[60vh] md:h-auto">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="customer-search">Cliente</Label>
                                                    <SearchInput
                                                        options={selectors.customerOptions}
                                                        onSelect={(option) => actions.handleSelectCustomer(option.value)}
                                                        value={customerSearchTerm}
                                                        onValueChange={actions.setCustomerSearchTerm}
                                                        placeholder="Buscar cliente..."
                                                        onKeyDown={actions.handleCustomerInputKeyDown}
                                                        open={isCustomerSearchOpen}
                                                        onOpenChange={actions.setCustomerSearchOpen}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="product-search">Producto</Label>
                                                    <SearchInput
                                                        options={selectors.productOptions}
                                                        onSelect={(option) => actions.handleSelectProduct(option.value)}
                                                        value={productSearchTerm}
                                                        onValueChange={actions.setProductSearchTerm}
                                                        placeholder="Buscar producto..."
                                                        onKeyDown={actions.handleProductInputKeyDown}
                                                        open={isProductSearchOpen}
                                                        onOpenChange={actions.setProductSearchOpen}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="new-order-purchase-order">Nº Orden de Compra (Opcional)</Label>
                                                    <Input id="new-order-purchase-order" placeholder="Ej: OC-12345" value={newOrder.purchaseOrder || ''} onChange={(e) => actions.setNewOrder({ purchaseOrder: e.target.value })} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="new-order-quantity">Cantidad Solicitada</Label>
                                                    <Input id="new-order-quantity" type="number" placeholder="0.00" value={newOrder.quantity || ''} onChange={e => actions.setNewOrder({ quantity: Number(e.target.value) })} required />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="new-order-inventory">Inventario Actual (Manual)</Label>
                                                    <Input id="new-order-inventory" type="number" placeholder="0.00" value={newOrder.inventory || ''} onChange={e => actions.setNewOrder({ inventory: Number(e.target.value) })} />
                                                </div>
                                                 <div className="space-y-2">
                                                    <Label htmlFor="new-order-inventory-erp">Inventario Actual (ERP)</Label>
                                                    <Input id="new-order-inventory-erp" value={(selectors.stockLevels.find(s => s.itemId === newOrder.productId)?.totalStock ?? 0).toLocaleString()} disabled />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="new-order-delivery-date">Fecha de Entrega Requerida</Label>
                                                    <Input id="new-order-delivery-date" type="date" value={newOrder.deliveryDate} onChange={e => actions.setNewOrder({ deliveryDate: e.target.value })} required />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="new-order-priority">Prioridad</Label>
                                                    <Select value={newOrder.priority} onValueChange={(value: typeof newOrder.priority) => actions.setNewOrder({priority: value})}>
                                                        <SelectTrigger id="new-order-priority"><SelectValue placeholder="Seleccione una prioridad" /></SelectTrigger>
                                                        <SelectContent>
                                                            {Object.entries(selectors.priorityConfig).map(([key, config]) => (<SelectItem key={key} value={key}>{config.label}</SelectItem>))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2 col-span-1 md:col-span-2">
                                                    <Label htmlFor="new-order-notes">Notas Adicionales</Label>
                                                    <Textarea id="new-order-notes" placeholder="Instrucciones especiales, detalles del pedido, etc." value={newOrder.notes || ''} onChange={e => actions.setNewOrder({ notes: e.target.value })} />
                                                </div>
                                            </div>
                                        </ScrollArea>
                                        <DialogFooter>
                                            <DialogClose asChild><Button type="button" variant="ghost">Cancelar</Button></DialogClose>
                                            <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Crear Orden</Button>
                                        </DialogFooter>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </div>
                {/* Desktop Filters */}
                <Card className="hidden md:block">
                    <CardContent className="p-4">
                        {renderFilters()}
                    </CardContent>
                </Card>
                 {/* Mobile Filters */}
                 <div className="md:hidden">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" className="w-full">
                                <Filter className="mr-2 h-4 w-4"/>
                                Filtros y Acciones
                            </Button>
                        </SheetTrigger>
                        <SheetContent>
                            <SheetHeader>
                                <SheetTitle>Filtros y Acciones</SheetTitle>
                                <SheetDescription>
                                    Aplica filtros para refinar tu búsqueda de órdenes.
                                </SheetDescription>
                            </SheetHeader>
                            <div className="py-4 space-y-4">
                               {renderFilters()}
                               <Separator />
                                <div className="flex items-center space-x-2 pt-4">
                                    <Checkbox 
                                        id="show-only-my-orders" 
                                        checked={showOnlyMyOrders} 
                                        onCheckedChange={(checked) => actions.setShowOnlyMyOrders(checked as boolean)}
                                        disabled={!showOnlyMyOrders && !selectors.hasPermission('planner:read:all')}
                                    />
                                    <Label htmlFor="show-only-my-orders" className="font-normal">Mostrar solo mis órdenes</Label>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                 </div>
            </div>
            
            <div className="flex-1 overflow-auto space-y-4 pt-2">
                {(isLoading && !state.isRefreshing) ? (
                    Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)
                ) : selectors.filteredOrders.length > 0 ? (
                    <TooltipProvider>
                        {selectors.filteredOrders.map(renderOrderCard)}
                    </TooltipProvider>
                ) : (
                    <div className="col-span-full flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                        <div className="flex flex-col items-center gap-2 text-center">
                            <h3 className="text-2xl font-bold tracking-tight">No se encontraron órdenes.</h3>
                            <p className="text-sm text-muted-foreground">Intenta ajustar los filtros de búsqueda o crea una nueva orden.</p>
                        </div>
                    </div>
                )}
            </div>

            {selectors.totalItems > pageSize && (
                 <div className="flex items-center justify-center space-x-2 py-4">
                    <Button variant="outline" size="sm" onClick={() => actions.setCurrentPage(p => p - 1)} disabled={currentPage === 0}>
                        <ChevronLeft className="mr-2 h-4 w-4" />Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Página {currentPage + 1} de {Math.ceil(selectors.totalItems / pageSize)}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => actions.setCurrentPage(p => p + 1)} disabled={(currentPage + 1) * pageSize >= selectors.totalItems}>
                        Siguiente<ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            )}
            
            <Dialog open={isEditOrderDialogOpen} onOpenChange={actions.setEditOrderDialogOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <form onSubmit={actions.handleEditOrder}>
                        <DialogHeader>
                            <DialogTitle>Editar Orden de Producción - {orderToEdit?.consecutive}</DialogTitle>
                            <DialogDescription>Modifique los campos necesarios y guarde los cambios.</DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-[60vh] md:h-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                                <div className="space-y-2">
                                    <Label>Cliente</Label>
                                    <Input value={orderToEdit?.customerName || ''} disabled />
                                </div>
                                <div className="space-y-2">
                                    <Label>Producto</Label>
                                    <Input value={orderToEdit?.productDescription || ''} disabled />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-order-quantity">Cantidad</Label>
                                    <Input id="edit-order-quantity" type="number" value={orderToEdit?.quantity || ''} onChange={e => { if(orderToEdit) actions.setOrderToEdit({ ...orderToEdit, quantity: Number(e.target.value) })}} required />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="edit-order-delivery-date">Fecha de Entrega</Label>
                                    <Input id="edit-order-delivery-date" type="date" value={orderToEdit?.deliveryDate ? format(parseISO(orderToEdit.deliveryDate), 'yyyy-MM-dd') : ''} onChange={e => { if(orderToEdit) actions.setOrderToEdit({ ...orderToEdit, deliveryDate: e.target.value })}} required />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="edit-order-purchase-order">Nº OC Cliente</Label>
                                    <Input id="edit-order-purchase-order" value={orderToEdit?.purchaseOrder || ''} onChange={e => { if(orderToEdit) actions.setOrderToEdit({ ...orderToEdit, purchaseOrder: e.target.value })}} />
                                </div>
                                <div className="space-y-2 col-span-1 md:col-span-2">
                                    <Label htmlFor="edit-order-notes">Notas</Label>
                                    <Textarea id="edit-order-notes" value={orderToEdit?.notes || ''} onChange={e => { if(orderToEdit) actions.setOrderToEdit({ ...orderToEdit, notes: e.target.value })}} />
                                </div>
                            </div>
                        </ScrollArea>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="ghost">Cancelar</Button></DialogClose>
                            <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Guardar Cambios</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isStatusDialogOpen} onOpenChange={actions.setStatusDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Actualizar Estado de la Orden</DialogTitle>
                        <DialogDescription>Estás a punto de cambiar el estado a &quot;{newStatus ? selectors.statusConfig[newStatus]?.label : ''}&quot;.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        {newStatus === 'completed' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="status-delivered-quantity">Cantidad Producida</Label>
                                    <Input id="status-delivered-quantity" type="number" value={deliveredQuantity} onChange={(e) => actions.setDeliveredQuantity(e.target.value)} placeholder={`Solicitada: ${state.orderToUpdate?.quantity.toLocaleString()}`} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="status-defective-quantity">Cantidad Defectuosa</Label>
                                    <Input id="status-defective-quantity" type="number" value={defectiveQuantity} onChange={(e) => actions.setDefectiveQuantity(e.target.value)} placeholder="0" />
                                </div>
                            </div>
                        )}
                        {newStatus === 'received-in-warehouse' && (
                            <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-2">
                                    <Label htmlFor="status-erp-package">Nº Paquete ERP</Label>
                                    <Input id="status-erp-package" value={erpPackageNumber} onChange={(e) => actions.setErpPackageNumber(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="status-erp-ticket">Nº Boleta ERP</Label>
                                    <Input id="status-erp-ticket" value={erpTicketNumber} onChange={(e) => actions.setErpTicketNumber(e.target.value)} />
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="status-notes">Notas (Opcional)</Label>
                            <Textarea id="status-notes" value={statusUpdateNotes} onChange={e => actions.setStatusUpdateNotes(e.target.value)} placeholder="Ej: Aprobado por Gerencia..." />
                        </div>
                    </div>
                     <DialogFooter>
                        <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                        <Button onClick={() => actions.handleStatusUpdate(state.newStatus || undefined)} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Actualizar Estado</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             <Dialog open={isReopenDialogOpen} onOpenChange={(isOpen) => { actions.setReopenDialogOpen(isOpen); if (!isOpen) { actions.setReopenStep(0); actions.setReopenConfirmationText(''); }}}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive" /> Reabrir Orden Finalizada</DialogTitle>
                        <DialogDescription>Estás a punto de reabrir la orden {orderToUpdate?.consecutive}. Esta acción es irreversible y moverá la orden de nuevo a &quot;Pendiente&quot;.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox id="reopen-confirm-checkbox" onCheckedChange={(checked) => actions.setReopenStep(checked ? 1 : 0)} />
                            <Label htmlFor="reopen-confirm-checkbox" className="font-medium text-destructive">Entiendo que esta acción no se puede deshacer.</Label>
                        </div>
                        {reopenStep > 0 && (
                            <div className="space-y-2">
                                <Label htmlFor="reopen-confirmation-text">Para confirmar, escribe &quot;REABRIR&quot; en el campo de abajo:</Label>
                                <Input id="reopen-confirmation-text" value={reopenConfirmationText} onChange={(e) => { actions.setReopenConfirmationText(e.target.value.toUpperCase()); if (e.target.value.toUpperCase() === 'REABRIR') {actions.setReopenStep(2);} else {actions.setReopenStep(1);}}} className="border-destructive focus-visible:ring-destructive" />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                        <Button onClick={actions.handleReopenOrder} disabled={reopenStep !== 2 || reopenConfirmationText !== 'REABRIR' || isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Reabrir Orden</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!orderToConfirmModification} onOpenChange={(open) => { if (!open) actions.setOrderToConfirmModification(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Modificación</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta orden fue modificada después de ser aprobada. Al confirmar, la alerta visual será eliminada.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => actions.setOrderToConfirmModification(null)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={actions.handleConfirmModification}>Sí, Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isHistoryDialogOpen} onOpenChange={actions.setHistoryDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Historial de Cambios - Orden {historyOrder?.consecutive}</DialogTitle>
                        <DialogDescription>Registro de todos los cambios de estado para esta orden.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {isHistoryLoading ? (
                            <div className="flex justify-center items-center h-40"><Loader2 className="animate-spin" /></div>
                        ) : history.length > 0 ? (
                            <ScrollArea className="h-96">
                                <Table><TableHeader><TableRow><TableHead>Fecha y Hora</TableHead><TableHead>Estado</TableHead><TableHead>Usuario</TableHead><TableHead>Notas</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {history.map(entry => (
                                            <TableRow key={entry.id}>
                                                <TableCell>{format(parseISO(entry.timestamp), 'dd/MM/yyyy HH:mm:ss')}</TableCell>
                                                <TableCell><Badge style={{ backgroundColor: selectors.statusConfig[entry.status]?.color }} className="text-white">{selectors.statusConfig[entry.status]?.label || entry.status}</Badge></TableCell>
                                                <TableCell>{entry.updatedBy}</TableCell>
                                                <TableCell>{entry.notes || '-'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No hay historial de cambios para esta orden.</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddNoteDialogOpen} onOpenChange={actions.setAddNoteDialogOpen}>
                <DialogContent>
                     <DialogHeader>
                        <DialogTitle>Añadir Nota a la Orden {notePayload?.orderId}</DialogTitle>
                        <DialogDescription>Agrega una nota o actualización a la orden sin cambiar su estado actual.</DialogDescription>
                    </DialogHeader>
                     <div className="py-4 space-y-2">
                        <Label htmlFor="add-note-textarea">Nota</Label>
                        <Textarea id="add-note-textarea" value={notePayload?.notes || ''} onChange={e => actions.setNotePayload({ ...state.notePayload, notes: e.target.value } as PlannerNotePayload)} placeholder="Añade aquí una nota o actualización..." />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                        <Button onClick={actions.handleAddNote} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Añadir Nota</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </main>
    );
}
