
// This file was restored to its stable version.
// The previous content was causing compilation issues.
'use client';

import React from 'react';
import { useRequests } from '@/modules/requests/hooks/useRequests';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilePlus, Loader2, Check, MoreVertical, History, RefreshCcw, AlertTriangle, Undo2, PackageCheck, Truck, XCircle, Home, Pencil, FilterX, CalendarIcon, Users, User as UserIcon, ChevronLeft, ChevronRight, Layers, Lightbulb, FileDown, FileSpreadsheet, Info, Send, ShoppingBag, DollarSign, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { PurchaseRequest, PurchaseRequestHistoryEntry, RequestNotePayload, PurchaseRequestPriority, ErpOrderHeader, ErpOrderLine, User, ErpPurchaseOrderLine, ErpPurchaseOrderHeader as ErpPOHeader, PurchaseRequestStatus } from '@/modules/core/types';
import Link from 'next/link';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useLoading } from '@/modules/core/hooks/useLoading';
import { Separator } from '@/components/ui/separator';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';


const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) => {
    if (!highlight) {
        return <span>{text}</span>;
    }
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="text-green-600 font-bold">
                        {part}
                    </span>
                ) : (
                    part
                )
            )}
        </span>
    );
};


export default function RequestsClient() {
    const { state, actions, selectors, isAuthorized } = useRequests();
    const { isAuthReady } = useAuth();

    const {
        isLoading, isSubmitting, isNewRequestDialogOpen, isEditRequestDialogOpen, viewingArchived,
        currentPage, requestSettings, newRequest, requestToEdit,
        searchTerm, statusFilter, classificationFilter, showOnlyMyRequests, dateFilter,
        clientSearchTerm, isClientSearchOpen, itemSearchTerm, isItemSearchOpen,
        isStatusDialogOpen, requestToUpdate, newStatus, statusUpdateNotes, deliveredQuantity,
        isHistoryDialogOpen, historyRequest, history, isHistoryLoading,
        isReopenDialogOpen, reopenStep, reopenConfirmationText, arrivalDate,
        isActionDialogOpen, isErpOrderModalOpen, isErpItemsModalOpen, erpOrderNumber, erpOrderHeaders, selectedErpOrderHeader, erpOrderLines, isErpLoading,
        showOnlyShortageItems,
        isContextInfoOpen,
        contextInfoData,
        isAddNoteDialogOpen,
        notePayload,
        isTransitsDialogOpen,
        activeTransits,
        isCostAnalysisDialogOpen,
        analysisCost,
        analysisSalePrice,
        rowsPerPage,
    } = state;

    const { showLoading, hideLoading } = useLoading();

    React.useEffect(() => {
        if (isLoading && !state.isRefreshing) {
            showLoading("Cargando solicitudes de compra...");
        } else if (isSubmitting) {
            showLoading("Procesando solicitud...");
        } else {
            hideLoading();
        }
        // Cleanup on unmount
        return () => {
            hideLoading();
        };
    }, [isLoading, state.isRefreshing, isSubmitting, showLoading, hideLoading]);


    if (!isAuthReady) {
        return (
            <main className="flex-1 p-4 md:p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Solicitudes de Compra</h1>
                    <Skeleton className="h-10 w-32" />
                </div>
                 <div className="space-y-4">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
            </main>
        )
    }

    if(isAuthorized === false) {
        return null;
    }

    const renderRequestCard = (request: PurchaseRequest) => {
        const permissions = selectors.getRequestPermissions(request);
        const daysRemaining = selectors.getDaysRemaining(request.requiredDate);
        
        const changeStatusActions = [
            { check: permissions.canSendToReview.allowed, action: () => actions.openStatusDialog(request, 'purchasing-review'), label: 'Enviar a Revisión', icon: <Send className="mr-2"/>, className: 'text-cyan-600' },
            { check: permissions.canGoBackToPending.allowed, action: () => actions.openStatusDialog(request, 'pending'), label: 'Devolver a Pendiente', icon: <Undo2 className="mr-2"/>, className: 'text-orange-600' },
            { check: permissions.canSendToApproval.allowed, action: () => actions.openStatusDialog(request, 'pending-approval'), label: 'Enviar a Aprobación', icon: <ShoppingBag className="mr-2"/>, className: 'text-orange-600' },
            { check: permissions.canGoBackToReview.allowed, action: () => actions.openStatusDialog(request, 'purchasing-review'), label: 'Devolver a Revisión', icon: <Undo2 className="mr-2"/>, className: 'text-orange-600' },
            { check: permissions.canApprove.allowed, action: () => actions.openStatusDialog(request, 'approved'), label: 'Aprobar', icon: <Check className="mr-2"/>, className: 'text-green-600' },
            { check: permissions.canOrder.allowed, action: () => actions.openStatusDialog(request, 'ordered'), label: 'Marcar como Ordenada', icon: <Truck className="mr-2"/>, className: 'text-blue-600' },
            { check: permissions.canRevertToApproved.allowed, action: () => actions.openStatusDialog(request, 'approved'), label: 'Revertir a Aprobada', icon: <Undo2 className="mr-2"/>, className: 'text-orange-600' },
            { check: permissions.canReceiveInWarehouse.allowed, action: () => actions.openStatusDialog(request, 'received-in-warehouse'), label: 'Recibir en Bodega', icon: <Home className="mr-2"/>, className: 'text-teal-600' },
            { check: permissions.canEnterToErp.allowed, action: () => actions.openStatusDialog(request, 'entered-erp'), label: 'Ingresar a ERP', icon: <PackageCheck className="mr-2"/>, className: 'text-indigo-600' },
            { check: permissions.canRequestUnapproval.allowed, action: () => actions.openAdminActionDialog(request, 'unapproval-request'), label: 'Solicitar Desaprobación', icon: <AlertTriangle className="mr-2"/>, className: 'text-orange-600 font-bold' },
            { check: permissions.canCancelPending.allowed, action: () => actions.openStatusDialog(request, 'canceled'), label: 'Cancelar Solicitud', icon: <XCircle className="mr-2"/>, className: 'text-red-600' },
            { check: permissions.canRequestCancel.allowed, action: () => actions.openAdminActionDialog(request, 'cancellation-request'), label: 'Solicitar Cancelación', icon: <XCircle className="mr-2"/>, className: 'text-red-600' },
            { check: permissions.canReopen.allowed, action: () => { actions.setRequestToUpdate(request); actions.setReopenDialogOpen(true); }, label: 'Reabrir', icon: <Undo2 className="mr-2"/>, className: 'text-orange-600' }
        ];

        return (
            <Card key={request.id} className="w-full">
                <CardHeader className="p-4">
                    <div className="flex justify-between items-start gap-2">
                        <div>
                            <CardTitle className="text-lg">{request.consecutive} - [{request.itemId}] {request.itemDescription}</CardTitle>
                            <CardDescription>Cliente: {request.clientName} {requestSettings?.showCustomerTaxId ? `(${request.clientTaxId})` : ''}</CardDescription>
                        </div>
                         <TooltipProvider>
                            <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                                {request.erpOrderNumber && (
                                     <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" onClick={() => actions.setContextInfoOpen(request)}><Info className="h-4 w-4 text-blue-600"/></Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Ver Información de Contexto</p></TooltipContent>
                                    </Tooltip>
                                )}
                                {!!request.reopened && <Badge variant="destructive"><RefreshCcw className="mr-1 h-3 w-3" /> Reabierta</Badge>}
                                {!!request.hasBeenModified && <Badge variant="destructive" className="animate-pulse"><AlertTriangle className="mr-1 h-3 w-3" /> Modificado</Badge>}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={() => actions.handleOpenTransits(request)}><Truck className="h-4 w-4"/></Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Ver Tránsitos del Producto</p></TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={() => actions.handleOpenHistory(request)}><History className="h-4 w-4" /></Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Ver Historial de Cambios</p></TooltipContent>
                                </Tooltip>
                                <DropdownMenu>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Más Acciones</p></TooltipContent>
                                    </Tooltip>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Acciones de Solicitud</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onSelect={() => { actions.setRequestToEdit(request); actions.setEditRequestDialogOpen(true); }} disabled={!permissions.canEdit.allowed}>
                                            <Pencil className="mr-2"/> Editar Solicitud
                                        </DropdownMenuItem>
                                        {selectors.hasPermission('requests:notes:add') && <DropdownMenuItem onSelect={() => actions.openAddNoteDialog(request)}><Pencil className="mr-2"/> Añadir Nota</DropdownMenuItem>}
                                        {selectors.hasPermission('requests:view:cost') && <DropdownMenuItem onSelect={() => actions.openCostAnalysisDialog(request)}><DollarSign className="mr-2" /> Analizar Costo</DropdownMenuItem>}
                                        <DropdownMenuItem onSelect={() => actions.handleExportSingleRequestPDF(request)}><FileDown className="mr-2"/> Exportar a PDF</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel>Cambio de Estado</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
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
                        </TooltipProvider>
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6 text-sm">
                         <div className="space-y-1">
                            <p className="font-semibold text-muted-foreground">Estado Actual</p>
                            <div className="flex items-center gap-2">
                                <span className={cn("h-3 w-3 rounded-full", selectors.statusConfig[request.status]?.color)}></span>
                                <span className="font-medium">{selectors.statusConfig[request.status]?.label || request.status}</span>
                            </div>
                        </div>
                         <div className="space-y-1">
                            <p className="font-semibold text-muted-foreground">Prioridad</p>
                            <Select value={request.priority} onValueChange={(value: PurchaseRequestPriority) => actions.handleDetailUpdate(request.id, { priority: value })}>
                                <SelectTrigger className={cn("h-8 w-32 border-0 focus:ring-0", selectors.priorityConfig[request.priority]?.className)}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(selectors.priorityConfig).map(([key, {label}]) => <SelectItem key={key} value={key} disabled={!selectors.hasPermission('requests:edit:pending')}>{label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <p className="font-semibold text-muted-foreground">Fecha Requerida</p>
                            <div className="flex items-center gap-2">
                                <span>{format(parseISO(request.requiredDate), 'dd/MM/yyyy')}</span>
                                <span className={cn('text-xs font-semibold', daysRemaining.color)}>({daysRemaining.label})</span>
                            </div>
                        </div>
                        {request.arrivalDate && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Llegada Estimada</p><p>{format(parseISO(request.arrivalDate), 'dd/MM/yyyy')}</p></div>}
                        {request.receivedDate && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Fecha Recibida</p><p>{format(parseISO(request.receivedDate), 'dd/MM/yyyy HH:mm')}</p></div>}
                         <div className="space-y-1">
                            <p className="font-semibold text-muted-foreground">Cant. Solicitada</p>
                            <p className="font-bold text-lg">{request.quantity.toLocaleString()}</p>
                        </div>
                         {request.deliveredQuantity !== null && request.deliveredQuantity !== undefined && (
                            <><div className="space-y-1"><p className="font-semibold text-muted-foreground">Cant. Recibida</p><p className="font-bold text-lg text-green-600">{request.deliveredQuantity.toLocaleString()}</p></div>
                                 <div className="space-y-1"><p className="font-semibold text-muted-foreground">Diferencia</p><p className={cn("font-bold text-lg",(request.deliveredQuantity - request.quantity) > 0 && "text-blue-600",(request.deliveredQuantity - request.quantity) < 0 && "text-destructive")}>{(request.deliveredQuantity - request.quantity).toLocaleString()}</p></div></>
                         )}
                         {selectors.hasPermission('requests:view:sale-price') && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Precio Venta (s/IVA)</p><p>{request.unitSalePrice ? `${request.salePriceCurrency || 'CRC'} ${request.unitSalePrice.toLocaleString()}` : 'N/A'}</p></div>}
                         {selectors.hasPermission('requests:view:cost') && request.analysis && typeof request.analysis === 'object' && 'cost' in request.analysis && request.analysis.cost !== undefined && (
                            <div className="space-y-1"><p className="font-semibold text-muted-foreground">Costo (Análisis)</p><p className='font-mono text-sm'>{request.analysis.cost ? request.analysis.cost.toLocaleString() : 'N/A'}</p></div>
                         )}
                         {selectors.hasPermission('requests:view:margin') && request.analysis && typeof request.analysis === 'object' && 'margin' in request.analysis && request.analysis.margin !== undefined && (
                            <div className="space-y-1"><p className="font-semibold text-muted-foreground">Margen (Análisis)</p><p className={cn(request.analysis.margin < 0 && 'text-destructive font-bold')}>{(request.analysis.margin * 100).toFixed(2)}%</p></div>
                         )}
                        {request.purchaseOrder && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Nº OC Cliente</p><p>{request.purchaseOrder}</p></div>}
                        {request.manualSupplier && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Proveedor</p><p>{request.manualSupplier}</p></div>}
                        {request.erpOrderNumber && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Pedido ERP</p><p>{request.erpOrderNumber} (L{request.erpOrderLine})</p></div>}
                        {request.route && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Ruta de Entrega</p><p>{request.route}</p></div>}
                         {request.shippingMethod && <div className="space-y-1"><p className="font-semibold text-muted-foreground">Método de Envío</p><p>{request.shippingMethod}</p></div>}
                        <div className="space-y-1"><p className="font-semibold text-muted-foreground">Tipo de Compra</p><div className="flex items-center gap-2">{request.purchaseType === 'multiple' ? <Users className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}<span>{request.purchaseType === 'multiple' ? 'Múltiples Proveedores' : 'Proveedor Único'}</span></div></div>
                        {request.inventory !== null && request.inventory !== undefined && (
                            <div className="space-y-1"><p className="font-semibold text-muted-foreground">Inv. Manual (Creación)</p><p>{request.inventory.toLocaleString()}</p></div>
                        )}
                        {request.inventoryErp !== null && request.inventoryErp !== undefined && (
                            <div className="space-y-1"><p className="font-semibold text-muted-foreground">Inv. ERP (Creación)</p><p>{request.inventoryErp.toLocaleString()}</p></div>
                        )}
                    </div>
                    {request.pendingAction !== 'none' && (
                        <div className="mt-4">
                            <AlertDialog open={state.isActionDialogOpen && state.requestToUpdate?.id === request.id} onOpenChange={(open) => { if (!open) actions.setActionDialogOpen(false); }}>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" className="border-yellow-500 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700 w-full" onClick={() => { actions.setRequestToUpdate(request); actions.setActionDialogOpen(true); }}>
                                        <AlertTriangle className="mr-2 h-4 w-4 animate-pulse" />
                                        Solicitud Pendiente: {request.pendingAction === 'unapproval-request' ? 'Desaprobación' : 'Cancelación'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Gestionar Solicitud Pendiente</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta solicitud tiene una petición de &quot;{request.pendingAction === 'unapproval-request' ? 'Desaprobación' : 'Cancelación'}&quot; pendiente. Puedes aprobar o rechazar esta acción.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <div className="py-4 space-y-2">
                                        <Label htmlFor="admin-action-notes-req">Notas (Requerido)</Label>
                                        <Textarea id="admin-action-notes-req" value={statusUpdateNotes} onChange={e => actions.setStatusUpdateNotes(e.target.value)} placeholder="Motivo de la aprobación o rechazo..." />
                                    </div>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cerrar</AlertDialogCancel>
                                        <Button variant="secondary" onClick={() => actions.handleAdminAction(false)} disabled={!statusUpdateNotes.trim() || isSubmitting}>Rechazar Solicitud</Button>
                                        <Button onClick={() => actions.handleAdminAction(true)} className={request.pendingAction === 'cancellation-request' ? 'bg-destructive hover:bg-destructive/90' : ''} disabled={!statusUpdateNotes.trim() || isSubmitting}>Aprobar Solicitud</Button>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                     {request.notes && (<div className="mt-4 text-xs bg-muted p-2 rounded-md"><p className="font-semibold">Notas de la Solicitud:</p><p className="text-muted-foreground">&quot;{request.notes}&quot;</p></div>)}
                     {request.lastStatusUpdateNotes && (<div className="mt-2 text-xs bg-muted p-2 rounded-md"><p className="font-semibold">Última nota de estado:</p><p className="text-muted-foreground">&quot;{request.lastStatusUpdateNotes}&quot; - <span className="italic">{request.lastStatusUpdateBy}</span></p></div>)}
                     {!!request.hasBeenModified && request.lastModifiedBy && (<div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded-md"><p className="font-semibold">Última Modificación por:</p><p className="">{request.lastModifiedBy} el {format(parseISO(request.lastModifiedAt as string), "dd/MM/yy 'a las' HH:mm")}</p></div>)}
                </CardContent>
                <CardFooter className="p-4 pt-0 text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
                    <span>Solicitado por: {request.requestedBy} el {format(parseISO(request.requestDate), 'dd/MM/yyyy')}</span>
                    {request.approvedBy && <span>Aprobado por: {request.approvedBy}</span>}
                </CardFooter>
            </Card>
        );
    }
    
    const renderFilters = () => (
        <div className="flex flex-col md:flex-row gap-4 items-center">
            <Input placeholder="Buscar por Nº solicitud, cliente, producto o pedido ERP..." value={searchTerm} onChange={(e) => actions.setSearchTerm(e.target.value)} className="w-full md:w-64" />
            <MultiSelectFilter
                title="Estado"
                options={Object.entries(selectors.statusConfig).map(([key, { label }]) => ({ value: key, label }))}
                selectedValues={state.statusFilter}
                onSelectedChange={actions.setStatusFilter}
                className="w-full md:w-auto"
            />
            <Select value={classificationFilter} onValueChange={actions.setClassificationFilter}><SelectTrigger className="w-full md:w-[240px]"><SelectValue placeholder="Filtrar por clasificación..." /></SelectTrigger><SelectContent><SelectItem value="all">Todas las Clasificaciones</SelectItem>{selectors.classifications.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full md:w-auto justify-start text-left font-normal", !dateFilter && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{dateFilter?.from ? (dateFilter.to ? (`${format(dateFilter.from, "LLL dd, y")} - ${format(dateFilter.to, "LLL dd, y")}`) : (format(dateFilter.from, "LLL dd, y"))) : (<span>Filtrar por fecha</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="range" selected={dateFilter} onSelect={actions.setDateFilter} /></PopoverContent></Popover>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full md:w-auto"><FileDown className="mr-2 h-4 w-4"/>Exportar</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => actions.handleExportPDF('portrait')}><FileDown className="mr-2 h-4 w-4" /> Exportar a PDF</DropdownMenuItem>
                    <DropdownMenuItem onSelect={actions.handleExportExcel}><FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" onClick={() => { actions.setSearchTerm(''); actions.setStatusFilter([]); actions.setClassificationFilter('all'); actions.setDateFilter(undefined); actions.setShowOnlyMyRequests(true); }} className="w-full md:w-auto"><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
        </div>
    );

    return (
        <main className="flex-1 flex flex-col p-4 md:p-6">
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm -mx-4 -mt-4 px-4 pt-4 pb-4 md:-mx-6 md:-mt-6 md:px-6 md:pt-6 md:pb-6 space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <h1 className="text-lg font-semibold md:text-2xl">Solicitudes de Compra</h1>
                    <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                        <Button variant="outline" onClick={() => actions.loadInitialData(true)} disabled={isLoading || state.isRefreshing}>{state.isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}Refrescar</Button>
                        <div className="flex items-center gap-1">
                            <Button variant={viewingArchived ? "outline" : "secondary"} onClick={() => actions.setViewingArchived(false)}>Activas ({selectors.totalActive})</Button>
                            <Button variant={viewingArchived ? "secondary" : "outline"} onClick={() => actions.setViewingArchived(true)}>Archivadas ({selectors.totalArchived})</Button>
                        </div>
                        <Dialog open={isErpOrderModalOpen} onOpenChange={actions.setErpOrderModalOpen}>
                            <DialogTrigger asChild>
                                <Button variant="secondary"><Layers className="mr-2"/>Crear desde Pedido ERP</Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader><DialogTitle>Buscar Pedido en ERP</DialogTitle><DialogDescription>Ingresa el número de pedido del ERP para cargar sus artículos.</DialogDescription></DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <Label htmlFor="erp-order-number">Nº de Pedido ERP</Label>
                                    <Input id="erp-order-number" value={erpOrderNumber} onChange={e => actions.setErpOrderNumber(e.target.value)} onKeyDown={e => e.key === 'Enter' && actions.handleFetchErpOrder()} placeholder="Ej: PE0000123456" />
                                </div>
                                {isErpLoading && <div className="flex justify-center"><Loader2 className="animate-spin" /></div>}
                                {erpOrderHeaders.length > 0 && !isErpLoading && (
                                    <div className="space-y-2">
                                        <p className="font-semibold">Múltiples pedidos encontrados. Por favor, selecciona uno:</p>
                                        <ScrollArea className="h-60">
                                            <div className="space-y-2 pr-4">
                                                {erpOrderHeaders.map((header: any) => (
                                                    <Card key={header.PEDIDO} className="cursor-pointer hover:bg-muted" onClick={() => actions.handleSelectErpOrderHeader(header)}>
                                                        <CardContent className="p-3">
                                                            <p className="font-bold"><HighlightedText text={header.PEDIDO} highlight={erpOrderNumber} /></p>
                                                            <p className="text-sm">{header.CLIENTE_NOMBRE}</p>
                                                            <p className="text-xs text-muted-foreground">Fecha: {format(new Date(header.FECHA_PEDIDO), 'dd/MM/yyyy')}</p>
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                )}
                                <DialogFooter>
                                    <Button variant="ghost" onClick={() => actions.handleCancelErpFetch()}>Cancelar</Button>
                                    <Button onClick={actions.handleFetchErpOrder} disabled={isErpLoading || !erpOrderNumber}>{isErpLoading && <Loader2 className="mr-2 animate-spin"/>}Cargar Pedido</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        {selectors.hasPermission('analytics:purchase-suggestions:read') && (
                            <Button asChild variant="secondary" className="bg-blue-600 text-white hover:bg-blue-700">
                                <Link href="/dashboard/analytics/purchase-suggestions" prefetch={false}>
                                    <Lightbulb className="mr-2" />
                                    Sugerencias de Compra
                                </Link>
                            </Button>
                        )}
                        {selectors.hasPermission('requests:create') && (
                            <Dialog open={isNewRequestDialogOpen} onOpenChange={actions.setNewRequestDialogOpen}><DialogTrigger asChild><Button><FilePlus className="mr-2"/> Nueva Solicitud</Button></DialogTrigger>
                            <DialogContent className="sm:max-w-4xl">
                                <form onSubmit={(e) => { e.preventDefault(); actions.handleCreateRequest(); }}>
                                    <DialogHeader>
                                        <DialogTitle>Crear Nueva Solicitud de Compra</DialogTitle>
                                        <DialogDescription>Complete los detalles para crear una nueva solicitud.</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                                        <div className="space-y-2"><Label htmlFor="client-search">Cliente</Label><SearchInput options={selectors.clientOptions} onSelect={(option) => actions.handleSelectClient(option.value)} value={clientSearchTerm} onValueChange={(val) => { actions.setClientSearchTerm(val); if(!val) actions.handleSelectClient(''); }} placeholder="Buscar cliente..." open={isClientSearchOpen} onOpenChange={actions.setClientSearchOpen} /></div>
                                        <div className="space-y-2"><Label htmlFor="item-search">Artículo / Servicio</Label><SearchInput options={selectors.itemOptions} onSelect={(option) => actions.handleSelectItem(option.value)} value={itemSearchTerm} onValueChange={(val) => { actions.setItemSearchTerm(val); if(!val) actions.handleSelectItem(''); }} placeholder="Buscar artículo..." open={isItemSearchOpen} onOpenChange={actions.setItemSearchOpen} /></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-quantity">Cantidad</Label><Input id="new-request-quantity" type="number" placeholder="0.00" value={newRequest.quantity || ''} onChange={e => actions.setNewRequest((prev: any) => ({ ...prev, quantity: Number(e.target.value) }))} required /></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-required-date">Fecha Requerida</Label><Input id="new-request-required-date" type="date" value={newRequest.requiredDate} onChange={e => actions.setNewRequest((prev: any) => ({ ...prev, requiredDate: e.target.value }))} required /></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-supplier">Proveedor (Manual)</Label><Input id="new-request-supplier" value={newRequest.manualSupplier || ''} onChange={e => actions.setNewRequest((prev: any) => ({ ...prev, manualSupplier: e.target.value }))} /></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-po">Nº OC Cliente</Label><Input id="new-request-po" value={newRequest.purchaseOrder || ''} onChange={e => actions.setNewRequest((prev: any) => ({ ...prev, purchaseOrder: e.target.value }))} /></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-inventory-manual">Inventario Actual (Manual)</Label><Input id="new-request-inventory-manual" type="number" placeholder="0.00" value={newRequest.inventory || ''} onChange={e => actions.setNewRequest((prev: any) => ({ ...prev, inventory: Number(e.target.value) }))} /></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-inventory-erp">Inventario Actual (ERP)</Label><Input id="new-request-inventory-erp" value={(selectors.stockLevels.find((s: any) => s.itemId === newRequest.itemId)?.totalStock ?? 0).toLocaleString()} disabled /></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-priority">Prioridad</Label><Select value={newRequest.priority} onValueChange={(value: typeof newRequest.priority) => actions.setNewRequest((prev: any) => ({...prev, priority: value}))}><SelectTrigger id="new-request-priority"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(selectors.priorityConfig).map(([key, {label}]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-route">Ruta</Label><Select value={newRequest.route} onValueChange={(value) => actions.setNewRequest((prev: any) => ({...prev, route: value}))}><SelectTrigger id="new-request-route"><SelectValue placeholder="Seleccione una ruta" /></SelectTrigger><SelectContent>{requestSettings?.routes.map((route: string) => (<SelectItem key={route} value={route}>{route}</SelectItem>))}</SelectContent></Select></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-shipping-method">Método de Envío</Label><Select value={newRequest.shippingMethod} onValueChange={(value) => actions.setNewRequest((prev: any) => ({...prev, shippingMethod: value}))}><SelectTrigger id="new-request-shipping-method"><SelectValue placeholder="Seleccione un método" /></SelectTrigger><SelectContent>{requestSettings?.shippingMethods.map((method: string) => (<SelectItem key={method} value={method}>{method}</SelectItem>))}</SelectContent></Select></div>
                                        <div className="space-y-2"><Label htmlFor="new-request-erp">Número de Pedido ERP</Label><Input id="new-request-erp" value={newRequest.erpOrderNumber || ''} onChange={e => actions.setNewRequest((prev: any) => ({ ...prev, erpOrderNumber: e.target.value }))} /></div>
                                        
                                        <div className="space-y-2 md:col-span-3">
                                            <div className="flex items-center space-x-2"><Label>Tipo de Compra</Label></div>
                                            <RadioGroup value={newRequest.purchaseType} onValueChange={(value: 'single' | 'multiple') => actions.setNewRequest((prev: any) => ({ ...prev, purchaseType: value }))} className="flex items-center gap-4 pt-2"><div className="flex items-center space-x-2"><RadioGroupItem value="single" id="r-single" /><Label htmlFor="r-single">Proveedor Único</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="multiple" id="r-multiple" /><Label htmlFor="r-multiple">Múltiples Proveedores</Label></div></RadioGroup>
                                        </div>

                                        <div className="space-y-2 md:col-span-3 pt-4 border-t">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox id="requiresCurrency" checked={newRequest.requiresCurrency} onCheckedChange={(checked) => actions.setNewRequest((prev: any) => ({ ...prev, requiresCurrency: !!checked }))} />
                                                <Label htmlFor="requiresCurrency">Registrar Precio de Venta (Opcional)</Label>
                                            </div>
                                        </div>
                                        {newRequest.requiresCurrency && (
                                            <>
                                                <div className="space-y-2">
                                                    <Label htmlFor="new-request-unit-sale-price">Precio de Venta Unitario (sin IVA)</Label>
                                                    <Input id="new-request-unit-sale-price" type="number" placeholder="0.00" value={newRequest.unitSalePrice || ''} onChange={e => actions.setNewRequest((prev: any) => ({ ...prev, unitSalePrice: Number(e.target.value) }))} />
                                                </div>
                                                <div className="space-y-2 md:col-span-2">
                                                    <Label>Moneda del Precio de Venta</Label>
                                                    <RadioGroup value={newRequest.salePriceCurrency} onValueChange={(value: 'CRC' | 'USD') => actions.setNewRequest((prev: any) => ({ ...prev, salePriceCurrency: value }))} className="flex items-center gap-4 pt-2">
                                                        <div className="flex items-center space-x-2"><RadioGroupItem value="CRC" id="r-crc" /><Label htmlFor="r-crc">CRC</Label></div>
                                                        <div className="flex items-center space-x-2"><RadioGroupItem value="USD" id="r-usd" /><Label htmlFor="r-usd">USD</Label></div>
                                                    </RadioGroup>
                                                </div>
                                            </>
                                        )}
                                        <div className="space-y-2 md:col-span-3"><Label htmlFor="new-request-notes">Notas Adicionales</Label><Textarea id="new-request-notes" placeholder="Justificación, detalles del proveedor, etc." value={newRequest.notes || ''} onChange={e => actions.setNewRequest((prev: any) => ({ ...prev, notes: e.target.value }))} /></div>
                                    </div>
                                <DialogFooter><DialogClose asChild><Button type="button" variant="ghost">Cancelar</Button></DialogClose><Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Crear Solicitud</Button></DialogFooter></form>
                            </DialogContent>
                        </Dialog>
                     )}
                    </div>
                </div>
                {/* Desktop Filters */}
                <Card className="hidden md:block">
                    <CardContent className="p-4">
                        <div className="flex flex-wrap gap-4 items-center">
                            {renderFilters()}
                        </div>
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
                                    Aplica filtros para refinar tu búsqueda de solicitudes.
                                </SheetDescription>
                            </SheetHeader>
                            <div className="py-4 space-y-4">
                               {renderFilters()}
                               <Separator />
                                <div className="flex items-center space-x-2 pt-4">
                                    <Checkbox id="show-only-my-requests" checked={showOnlyMyRequests} onCheckedChange={(checked) => actions.setShowOnlyMyRequests(checked as boolean)} disabled={!showOnlyMyRequests && !selectors.hasPermission('requests:read:all')}/>
                                    <Label htmlFor="show-only-my-requests" className="font-normal">Mostrar solo mis solicitudes</Label>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                 </div>
            </div>
            
            <div className="flex-1 overflow-auto pt-2 space-y-4">
                {(isLoading && !state.isRefreshing) ? (
                    Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)
                ) : selectors.filteredRequests.length > 0 ? (
                    selectors.filteredRequests.map(renderRequestCard)
                ) : (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                        <div className="flex flex-col items-center gap-2 text-center">
                            <h3 className="text-2xl font-bold tracking-tight">No se encontraron solicitudes.</h3>
                            <p className="text-sm text-muted-foreground">Intenta ajustar los filtros de búsqueda o crea una nueva solicitud.</p>
                        </div>
                    </div>
                )}
            </div>

             {selectors.totalItems > state.rowsPerPage && (
                 <div className="flex items-center justify-center space-x-2 py-4">
                    <Button variant="outline" size="sm" onClick={() => actions.setCurrentPage((p: number) => p - 1)} disabled={currentPage === 0}>
                        <ChevronLeft className="mr-2 h-4 w-4" />Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Página {currentPage + 1} de {Math.ceil(selectors.totalItems / state.rowsPerPage)}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => actions.setCurrentPage((p: number) => p + 1)} disabled={(currentPage + 1) * state.rowsPerPage >= selectors.totalItems}>
                        Siguiente<ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            )}
            <Dialog open={isEditRequestDialogOpen} onOpenChange={actions.setEditRequestDialogOpen}><DialogContent className="sm:max-w-3xl"><form onSubmit={actions.handleEditRequest}><DialogHeader><DialogTitle>Editar Solicitud - {requestToEdit?.consecutive}</DialogTitle><DialogDescription>Modifique los detalles de la solicitud.</DialogDescription></DialogHeader><ScrollArea className="h-[60vh] md:h-auto"><div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                <div className="space-y-2"><Label>Cliente</Label><Input value={requestToEdit?.clientName} disabled /></div>
                <div className="space-y-2"><Label>Artículo / Servicio</Label><Input value={`[${requestToEdit?.itemId}] ${requestToEdit?.itemDescription}`} disabled /></div>
                <div className="space-y-2"><Label htmlFor="edit-request-quantity">Cantidad</Label><Input id="edit-request-quantity" type="number" value={requestToEdit?.quantity || ''} onChange={e => { if (requestToEdit) actions.setRequestToEdit({ ...requestToEdit, quantity: Number(e.target.value) }); }} required /></div>
                <div className="space-y-2"><Label htmlFor="edit-request-required-date">Fecha Requerida</Label><Input id="edit-request-required-date" type="date" value={requestToEdit?.requiredDate ? format(parseISO(requestToEdit.requiredDate), 'yyyy-MM-dd') : ''} onChange={e => { if (requestToEdit) actions.setRequestToEdit({ ...requestToEdit, requiredDate: e.target.value }); }} required /></div>
                <div className="space-y-2"><Label htmlFor="edit-request-priority">Prioridad</Label><Select value={requestToEdit?.priority} onValueChange={(value: PurchaseRequestPriority) => { if (requestToEdit) actions.setRequestToEdit({ ...requestToEdit, priority: value }); }}><SelectTrigger id="edit-request-priority"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(selectors.priorityConfig).map(([key, {label}]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Tipo de Compra</Label><RadioGroup value={requestToEdit?.purchaseType} onValueChange={(value: 'single' | 'multiple') => { if (requestToEdit) actions.setRequestToEdit({ ...requestToEdit, purchaseType: value }); }} className="flex items-center gap-4 pt-2"><div className="flex items-center space-x-2"><RadioGroupItem value="single" id="r-edit-single" /><Label htmlFor="r-edit-single">Proveedor Único</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="multiple" id="r-edit-multiple" /><Label htmlFor="r-edit-multiple">Múltiples Proveedores</Label></div></RadioGroup></div>
                <div className="space-y-2"><Label htmlFor="edit-request-supplier">Proveedor Manual</Label><Input id="edit-request-supplier" value={requestToEdit?.manualSupplier || ''} onChange={(e) => { if (requestToEdit) actions.setRequestToEdit({ ...requestToEdit, manualSupplier: e.target.value }); }} disabled={!['pending', 'purchasing-review'].includes(requestToEdit?.status || '')} /></div>
                <div className="space-y-2"><Label htmlFor="edit-request-erp-order">Pedido ERP</Label><Input id="edit-request-erp-order" value={requestToEdit?.erpOrderNumber || ''} onChange={(e) => { if (requestToEdit) actions.setRequestToEdit({ ...requestToEdit, erpOrderNumber: e.target.value }); }} disabled={!['pending', 'purchasing-review'].includes(requestToEdit?.status || '')} /></div>
                <div className="space-y-2 col-span-1 md:col-span-2"><Label htmlFor="edit-request-notes">Notas</Label><Textarea id="edit-request-notes" value={requestToEdit?.notes || ''} onChange={e => { if (requestToEdit) actions.setRequestToEdit({ ...requestToEdit, notes: e.target.value }); }} /></div>
            </div></ScrollArea><DialogFooter><DialogClose asChild><Button type="button" variant="ghost">Cancelar</Button></DialogClose><Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Guardar Cambios</Button></DialogFooter></form></DialogContent></Dialog>
            <Dialog open={isStatusDialogOpen} onOpenChange={actions.setStatusDialogOpen}><DialogContent><DialogHeader><DialogTitle>Actualizar Estado de la Solicitud</DialogTitle><DialogDescription>Estás a punto de cambiar el estado de la solicitud {requestToUpdate?.consecutive} a &quot;{newStatus ? selectors.statusConfig[newStatus]?.label : ''}&quot;.</DialogDescription></DialogHeader><div className="space-y-4 py-4">{newStatus === 'received-in-warehouse' && (<div className="space-y-2"><Label htmlFor="status-delivered-quantity">Cantidad Recibida</Label><Input id="status-delivered-quantity" type="number" value={deliveredQuantity} onChange={(e) => actions.setDeliveredQuantity(e.target.value)} placeholder={`Cantidad solicitada: ${requestToUpdate?.quantity.toLocaleString()}`} /> <p className="text-xs text-muted-foreground">Introduce la cantidad final que se recibió del proveedor.</p></div>)} {newStatus === 'ordered' && (<div className="space-y-2"><Label htmlFor="status-arrival-date">Fecha Estimada de Llegada</Label><Input id="status-arrival-date" type="date" value={arrivalDate} onChange={(e) => actions.setArrivalDate(e.target.value)} /><p className="text-xs text-muted-foreground">Opcional: Fecha en que se espera recibir el producto.</p></div>)} {newStatus === 'entered-erp' && (<div className="space-y-2"><Label htmlFor="erp-entry-number">Número de Consecutivo ERP</Label><Input id="erp-entry-number" value={state.erpEntryNumber} onChange={(e) => actions.setErpEntryNumber(e.target.value)} placeholder="Ej: ENTR-12345" /></div>)}<div className="space-y-2"><Label htmlFor="status-notes">Notas (Opcional)</Label><Textarea id="status-notes" value={statusUpdateNotes} onChange={(e) => actions.setStatusUpdateNotes(e.target.value)} placeholder="Ej: Aprobado por Gerencia, Orden de compra #1234" /></div></div><DialogFooter><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={() => actions.handleStatusUpdate()} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Actualizar Estado</Button></DialogFooter></DialogContent></Dialog>
            <Dialog open={isReopenDialogOpen} onOpenChange={(isOpen) => { actions.setReopenDialogOpen(isOpen); if (!isOpen) { actions.setReopenStep(0); actions.setReopenConfirmationText(''); }}}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive" />Reabrir Solicitud Finalizada</DialogTitle><DialogDescription>Estás a punto de reabrir la solicitud {requestToUpdate?.consecutive}. Esta acción es irreversible y moverá la solicitud de nuevo a &quot;Pendiente&quot;.</DialogDescription></DialogHeader><div className="py-4 space-y-4"><div className="flex items-center space-x-2"><Checkbox id="reopen-confirm-checkbox" onCheckedChange={(checked) => actions.setReopenStep(checked ? 1 : 0)} /><Label htmlFor="reopen-confirm-checkbox" className="font-medium text-destructive">Entiendo que esta acción no se puede deshacer.</Label></div>{reopenStep > 0 && (<div className="space-y-2"><Label htmlFor="reopen-confirmation-text">Para confirmar, escribe &quot;REABRIR&quot; en el campo de abajo:</Label><Input id="reopen-confirmation-text" value={reopenConfirmationText} onChange={(e) => { actions.setReopenConfirmationText(e.target.value.toUpperCase()); if (e.target.value.toUpperCase() === 'REABRIR') {actions.setReopenStep(2);} else {actions.setReopenStep(1);}}} className="border-destructive focus-visible:ring-destructive" /></div>)}</div><DialogFooter><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={actions.handleReopenRequest} disabled={reopenStep !== 2 || reopenConfirmationText !== 'REABRIR' || isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Reabrir Solicitud</Button></DialogFooter></DialogContent></Dialog>
            <Dialog open={isHistoryDialogOpen} onOpenChange={actions.setHistoryDialogOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Historial de Cambios - Solicitud {historyRequest?.consecutive}</DialogTitle><DialogDescription>Registro de todos los cambios de estado para esta solicitud.</DialogDescription></DialogHeader><div className="py-4">{isHistoryLoading ? (<div className="flex justify-center items-center h-40"><Loader2 className="animate-spin" /></div>) : history.length > 0 ? (<div className="max-h-96 overflow-y-auto"><Table><TableHeader><TableRow><TableHead>Fecha y Hora</TableHead><TableHead>Estado</TableHead><TableHead>Usuario</TableHead><TableHead>Notas</TableHead></TableRow></TableHeader><TableBody>{history.map((entry: PurchaseRequestHistoryEntry) => (<TableRow key={entry.id}><TableCell>{format(parseISO(entry.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: es })}</TableCell><TableCell><Badge style={{backgroundColor: selectors.statusConfig[entry.status]?.color}} className="text-white">{selectors.statusConfig[entry.status]?.label || entry.status}</Badge></TableCell><TableCell>{entry.updatedBy}</TableCell><TableCell>{entry.notes || '-'}</TableCell></TableRow>))}</TableBody></Table></div>) : (<p className="text-center text-muted-foreground py-8">No hay historial de cambios para esta solicitud.</p>)}</div></DialogContent></Dialog>
            <Dialog open={isErpItemsModalOpen} onOpenChange={actions.setErpItemsModalOpen}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Artículos del Pedido ERP: {erpOrderNumber}</DialogTitle><DialogDescription>Cliente: {selectedErpOrderHeader?.CLIENTE_NOMBRE}</DialogDescription></DialogHeader><div className="flex items-center space-x-2 my-4"><Checkbox id="show-only-shortage" checked={showOnlyShortageItems} onCheckedChange={(checked) => actions.setShowOnlyShortageItems(checked as boolean)} /><Label htmlFor="show-only-shortage" className="font-normal">Mostrar solo artículos con faltante</Label></div><ScrollArea className="max-h-[60vh]"><Table><TableHeader><TableRow><TableHead className="w-10"><Checkbox onCheckedChange={(checked) => actions.handleErpLineChange(-1, 'selected', !!checked)}/></TableHead><TableHead>Artículo</TableHead><TableHead>Cant. Pedida</TableHead><TableHead>Inv. Actual</TableHead><TableHead>Cant. a Solicitar</TableHead><TableHead>Precio Venta</TableHead></TableRow></TableHeader><TableBody>{selectors.visibleErpOrderLines.map((line: any, index: number) => (<TableRow key={line.PEDIDO_LINEA} className={cn(!line.selected && 'text-muted-foreground', line.CANTIDAD_PEDIDA > (line.stock?.totalStock || 0) ? 'bg-red-50 hover:bg-red-100/60 dark:bg-red-900/20' : 'bg-green-50 hover:bg-green-100/60 dark:bg-green-900/20')}><TableCell><Checkbox checked={line.selected} onCheckedChange={(checked) => actions.handleErpLineChange(index, 'selected', !!checked)} /></TableCell><TableCell><p className="font-medium">{line.product.description}</p><p className="text-xs text-muted-foreground">{line.ARTICULO}</p></TableCell><TableCell>{line.CANTIDAD_PEDIDA}</TableCell><TableCell>{line.stock?.totalStock || 0}</TableCell><TableCell><Input value={line.displayQuantity} onChange={e => actions.handleErpLineChange(index, 'displayQuantity', e.target.value)} className="w-24" /></TableCell><TableCell><Input value={line.displayPrice} onChange={e => actions.handleErpLineChange(index, 'displayPrice', e.target.value)} className="w-28" /></TableCell></TableRow>))}</TableBody></Table></ScrollArea><DialogFooter><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={actions.handleCreateRequestsFromErp} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Crear Solicitudes</Button></DialogFooter></DialogContent></Dialog>
            <Dialog open={isContextInfoOpen} onOpenChange={(open) => actions.setContextInfoOpen(open ? contextInfoData : null)}><DialogContent><DialogHeader><DialogTitle>Información de Contexto de la Solicitud</DialogTitle><DialogDescription>Esta solicitud fue generada a partir de los siguientes datos del ERP.</DialogDescription></DialogHeader><div className="py-4 space-y-4">{contextInfoData?.sourceOrders && Array.isArray(contextInfoData.sourceOrders) && contextInfoData.sourceOrders.length > 0 && (<div><h4 className="font-semibold mb-2">Pedidos de Origen</h4><p className="text-sm text-muted-foreground">{contextInfoData.sourceOrders.join(', ')}</p></div>)}{contextInfoData?.involvedClients && Array.isArray(contextInfoData.involvedClients) && contextInfoData.involvedClients.length > 0 && (<div><h4 className="font-semibold mb-2">Clientes Involucrados</h4><ul className="list-disc list-inside space-y-1 text-sm">{contextInfoData.involvedClients.map((c: any) => <li key={c.id}>{c.name} ({c.id})</li>)}</ul></div>)}{contextInfoData?.itemId && (<div><h4 className="font-semibold mb-2">Tránsito OC (ERP)</h4><p className="text-sm text-muted-foreground">{selectors.getInTransitStock(contextInfoData.itemId)}</p></div>)}</div></DialogContent></Dialog>
            <Dialog open={isAddNoteDialogOpen} onOpenChange={actions.setAddNoteDialogOpen}><DialogContent><DialogHeader><DialogTitle>Añadir Nota a la Solicitud {notePayload?.requestId}</DialogTitle><DialogDescription>Agrega una nota o actualización a la solicitud sin cambiar su estado actual.</DialogDescription></DialogHeader><div className="py-4 space-y-2"><Label htmlFor="add-note-textarea">Nota</Label><Textarea id="add-note-textarea" value={notePayload?.notes || ''} onChange={e => actions.setNotePayload({ ...state.notePayload, notes: e.target.value } as RequestNotePayload)} placeholder="Añade aquí una nota o actualización..." /></div><DialogFooter><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={actions.handleAddNote} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin"/>}Añadir Nota</Button></DialogFooter></DialogContent></Dialog>
            <Dialog open={isTransitsDialogOpen} onOpenChange={actions.setTransitsDialogOpen}><DialogContent><DialogHeader><DialogTitle>Tránsitos para el Producto</DialogTitle><DialogDescription>Órdenes de compra activas en el ERP para el artículo: <strong>{activeTransits?.itemDescription}</strong> ({activeTransits?.itemId})</DialogDescription></DialogHeader><div className="py-4">{activeTransits && activeTransits.transits.length > 0 ? (<ScrollArea className="h-60"><Table><TableHeader><TableRow><TableHead>Nº OC</TableHead><TableHead>Proveedor</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow></TableHeader><TableBody>{activeTransits.transits.map((transit: ErpPOHeader & { quantity: number, supplierName: string }) => (<TableRow key={transit.ORDEN_COMPRA}><TableCell>{transit.ORDEN_COMPRA}</TableCell><TableCell>{transit.supplierName}</TableCell><TableCell>{format(new Date(transit.FECHA_HORA), 'dd/MM/yyyy')}</TableCell><TableCell className="text-right font-medium">{transit.quantity}</TableCell></TableRow>))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-8">No se encontraron tránsitos activos para este artículo.</p>)}</div></DialogContent></Dialog>
            <Dialog open={isCostAnalysisDialogOpen} onOpenChange={actions.setCostAnalysisDialogOpen}><DialogContent><DialogHeader><DialogTitle>Análisis de Costo y Venta</DialogTitle><DialogDescription>Calcula el margen de ganancia para esta solicitud.</DialogDescription></DialogHeader><div className="grid gap-4 py-4"><div className="space-y-2"><Label htmlFor="analysis-cost">Costo del Artículo</Label><Input id="analysis-cost" type="number" value={state.analysisCost || ''} onChange={e => actions.setAnalysisCost(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="analysis-sale-price">Precio de Venta</Label><Input id="analysis-sale-price" type="number" value={state.analysisSalePrice || ''} onChange={e => actions.setAnalysisSalePrice(e.target.value)} /></div><div className="mt-4 flex justify-between items-center text-sm font-medium"><p>Margen de Ganancia:</p><p className={cn(selectors.costAnalysis?.margin < 0 && 'text-red-500')}>{selectors.costAnalysis?.margin?.toFixed(2)}%</p></div>{selectors.costAnalysis?.margin < 0 && (<div className="text-xs text-red-500 text-center flex items-center gap-2 justify-center"><AlertTriangle className="h-4 w-4" />Estás vendiendo este artículo con pérdidas.</div>)}</div><DialogFooter><DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose><Button onClick={actions.handleSaveCostAnalysis} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 animate-spin" />}Guardar Análisis</Button></DialogFooter></DialogContent></Dialog>
        </main>
    );
}
