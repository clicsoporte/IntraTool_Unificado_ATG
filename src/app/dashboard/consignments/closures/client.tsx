'use client';

import React from 'react';
import { useConsignmentsClosures } from '@/modules/consignments/hooks/useConsignmentsClosures';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, FileSignature, Loader2, RefreshCw, Info, Trash2, Link as LinkIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PeriodClosure } from '@/modules/core/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { InventoryCountForm } from '@/components/consignments/inventory-count-form';
import { Checkbox } from '@/components/ui/checkbox';

export default function ClosuresClient() {
    const { products } = useAuth();
    const { state, actions, selectors } = useConsignmentsClosures();

    if (state.isInitialLoading) {
        return <main className="flex-1 p-4 md:p-6 lg:p-8"><Loader2 className="animate-spin" /></main>;
    }
    
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Card className="max-w-6xl mx-auto">
                 <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Gestión de Cierres de Periodo</CardTitle>
                            <CardDescription>
                                Administra los cierres de facturación para los clientes de consignación.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={() => actions.loadData(true)} disabled={state.isRefreshing}>
                                {state.isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Refrescar
                            </Button>
                            {selectors.hasPermission('consignments:closures:create') && (
                                <Button onClick={actions.handleInitiateClosure}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Cierre
                                </Button>
                            )}
                        </div>
                    </div>
                 </CardHeader>
                 <CardContent>
                      <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Consecutivo</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Fecha Creación</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Factura ERP</TableHead>
                                <TableHead>Tipo / Vínculo</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {state.closures.map((closure: PeriodClosure & { client_name: string; client_id: string; is_initial_inventory: boolean; previous_closure_consecutive?: string; }) => (
                                <TableRow key={closure.id}>
                                    <TableCell className="font-mono font-bold text-primary">{closure.consecutive}</TableCell>
                                    <TableCell>{closure.client_name}</TableCell>
                                    <TableCell>{format(parseISO(closure.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}</TableCell>
                                    <TableCell>
                                        <Badge variant={closure.status === 'approved' ? 'default' : (closure.status === 'rejected' || closure.status === 'annulled' ? 'destructive' : 'secondary')}>
                                            {selectors.getStatusLabel(closure.status)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono">{closure.erp_invoice_number}</TableCell>
                                    <TableCell>
                                        {closure.is_initial_inventory ? (
                                            <Badge variant="outline" className="border-green-600 text-green-700">
                                                Inventario Inicial
                                            </Badge>
                                        ) : closure.previous_closure_consecutive ? (
                                            <div className="text-xs text-muted-foreground">
                                                <span>Inicia desde:</span><br/>
                                                <span className="font-mono">{closure.previous_closure_consecutive}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">No vinculado</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right space-x-1">
                                        {closure.status === 'approved' && selectors.hasPermission('consignments:boleta:invoice') && (
                                            <Button variant="outline" size="sm" onClick={() => actions.openLinkInvoiceModal(closure)}>
                                                <LinkIcon className="mr-2 h-4 w-4" /> Ligar Factura
                                            </Button>
                                        )}
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => actions.handleViewClosure(closure)}
                                        >
                                            {closure.status === 'pending' ? 'Revisar y Aprobar' : 'Ver Detalles'}
                                        </Button>
                                         {closure.status === 'approved' && selectors.hasPermission('consignments:closures:annul') && (
                                            <AlertDialog open={state.closureToAnnul?.id === closure.id} onOpenChange={(open) => !open && actions.setClosureToAnnul(null)}>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="sm" onClick={() => actions.setClosureToAnnul(closure)}>Anular</Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Anular Cierre Aprobado?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Estás a punto de anular el cierre <strong>{closure.consecutive}</strong>. Esta acción es irreversible y solo debe realizarse para corregir un error grave (ej. un conteo inicial incorrecto).
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                     <div className="py-4 space-y-4">
                                                        <div className="flex items-center space-x-2">
                                                            <Input
                                                                id="annul-confirmation-text"
                                                                value={state.annulConfirmationText}
                                                                onChange={(e) => actions.setAnnulConfirmationText(e.target.value.toUpperCase())}
                                                                placeholder='Escribe "ANULAR" para confirmar'
                                                            />
                                                        </div>
                                                    </div>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={actions.handleAnnul}
                                                            disabled={state.isSubmitting || state.annulConfirmationText !== 'ANULAR'}
                                                        >
                                                            {state.isSubmitting ? <Loader2 className="mr-2 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4"/>}
                                                            Sí, Anular
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                 </CardContent>
            </Card>

            <Dialog open={state.isDetailsModalOpen} onOpenChange={actions.setDetailsModalOpen}>
                <DialogContent className="sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{state.selectedClosure?.status === 'pending' ? 'Revisar y Aprobar Cierre' : 'Detalles del Cierre'}: {state.selectedClosure?.consecutive}</DialogTitle>
                        <DialogDescription>
                             {state.selectedClosure?.status === 'pending' ? 'Verifica el conteo y aprueba el cierre para habilitar la facturación.' : 'Detalles del cierre y su estado actual.'}
                        </DialogDescription>
                    </DialogHeader>
                    {state.isDetailsLoading ? (
                        <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin" /></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                            <div className="space-y-4">
                                <h4 className="font-semibold text-lg">Conteo Físico Registrado</h4>
                                <ScrollArea className="h-72 border rounded-md p-2">
                                    {state.physicalCountLines.length > 0 ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Producto</TableHead>
                                                    <TableHead className="text-right">Cantidad</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {state.physicalCountLines.map(line => {
                                                    const product = products.find(p => p.id === line.product_id);
                                                    return (
                                                        <TableRow key={line.id}>
                                                            <TableCell>
                                                                <p className="font-medium">{product?.description || 'Desconocido'}</p>
                                                                <p className="text-xs text-muted-foreground font-mono">{line.product_id}</p>
                                                            </TableCell>
                                                            <TableCell className="text-right font-bold">{line.quantity}</TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted-foreground">
                                            <p>No se encontraron datos de conteo.</p>
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                            <div className="space-y-4">
                                {state.selectedClosure?.status === 'pending' && (
                                    <>
                                        {state.selectedClosure?.is_initial_inventory ? (
                                            <Alert variant="default" className="bg-green-50 border-green-200">
                                                <Info className="h-4 w-4" />
                                                <AlertTitle>Estableciendo Inventario Inicial</AlertTitle>
                                                <AlertDescription>
                                                    Al no vincular un cierre anterior, estás estableciendo el <strong>inventario inicial oficial</strong> para este cliente. Asegúrate de que esto sea correcto.
                                                </AlertDescription>
                                            </Alert>
                                        ) : (
                                            <div className="space-y-2">
                                                <Label>Vincular con Cierre Anterior</Label>
                                                <Select value={state.previousClosureId?.toString() || 'none'} onValueChange={(val) => actions.setPreviousClosureId(val === 'none' ? null : Number(val))}>
                                                    <SelectTrigger><SelectValue placeholder="Seleccionar cierre anterior..." /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">No vincular (Esto establecerá el Inventario Inicial)</SelectItem>
                                                        {state.availablePreviousClosures.map(pc => (
                                                            <SelectItem key={pc.id} value={String(pc.id)}>
                                                                {pc.consecutive} - {format(parseISO(pc.created_at), 'dd/MM/yy')}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground">
                                                    El inventario final de este cierre se usará como inventario inicial para el nuevo período.
                                                </p>
                                            </div>
                                        )}
                                        
                                        <div className="space-y-2">
                                            <Label htmlFor="rejection-notes">Notas para Rechazo (Opcional)</Label>
                                            <Textarea id="rejection-notes" value={state.notes} onChange={(e) => actions.setNotes(e.target.value)} placeholder="Indica por qué se rechaza el cierre..." />
                                        </div>
                                    </>
                                )}
                                {state.selectedClosure?.status === 'rejected' && (
                                    <Alert variant="destructive">
                                        <AlertTitle>Cierre Rechazado</AlertTitle>
                                        <AlertDescription>
                                            <p className="mb-2"><strong>Rechazado por:</strong> {state.selectedClosure.approved_by}</p>
                                            <p><strong>Motivo:</strong> {state.selectedClosure.notes || 'No se especificó un motivo.'}</p>
                                        </AlertDescription>
                                    </Alert>
                                )}
                                {state.selectedClosure?.status === 'approved' && (
                                    <Alert variant="default" className="bg-green-50 border-green-200">
                                        <AlertTitle>Cierre Aprobado</AlertTitle>
                                        <AlertDescription>
                                            <p className="mb-2"><strong>Aprobado por:</strong> {state.selectedClosure.approved_by}</p>
                                            <p>Ya puedes generar el reporte de facturación para este período.</p>
                                        </AlertDescription>
                                    </Alert>
                                )}
                                {state.selectedClosure?.status === 'invoiced' && (
                                    <Alert variant="default" className="bg-blue-50 border-blue-200">
                                        <AlertTitle>Cierre Facturado</AlertTitle>
                                        <AlertDescription>
                                            <p className="mb-2"><strong>Factura ERP:</strong> {state.selectedClosure.erp_invoice_number}</p>
                                            <p>Este cierre ya ha sido procesado y vinculado a una factura del ERP.</p>
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </div>
                    )}
                    <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between sm:items-center">
                        <div className="flex-1 sm:flex-grow-0">
                           {state.selectedClosure?.status === 'pending' && (
                                <Button variant="destructive" onClick={() => actions.handleReject(state.notes)} disabled={state.isSubmitting}>
                                    Rechazar Cierre
                                </Button>
                           )}
                        </div>
                        <div className="flex gap-2">
                            <DialogClose asChild><Button variant="ghost">Cerrar</Button></DialogClose>
                            {state.selectedClosure?.status === 'pending' && (
                                <Button onClick={actions.handleApprove} disabled={state.isSubmitting}>
                                    {state.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                    Aprobar Cierre
                                </Button>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={state.isNewClosureModalOpen} onOpenChange={actions.handleNewClosureModalOpenChange}>
                <DialogContent className="sm:max-w-4xl">
                     <DialogHeader>
                        <DialogTitle>Asistente para Nuevo Cierre</DialogTitle>
                     </DialogHeader>
                    {state.newClosureStep === 'select_client' && (
                        <div className="py-4 space-y-4">
                            <Label>Paso 1: Selecciona un Cliente</Label>
                            <SearchInput
                                options={selectors.agreementOptions}
                                onSelect={(option) => actions.handleSelectAgreementForClosure(option.value)}
                                value={state.newClosureClientSearch}
                                onValueChange={actions.setNewClosureClientSearch}
                                open={state.isNewClosureClientSearchOpen}
                                onOpenChange={actions.setIsNewClosureClientSearchOpen}
                                placeholder="Buscar cliente de consignación..."
                            />
                        </div>
                    )}
                    {state.newClosureStep === 'select_action' && state.selectedAgreementForClosure && (
                        <div className="py-4 space-y-4">
                           {state.selectedAgreementForClosure.has_initial_inventory === 0 ? (
                            <>
                                <Alert variant="destructive">
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>Acción Requerida: Establecer Inventario Inicial</AlertTitle>
                                    <AlertDescription>
                                        Este acuerdo no tiene un inventario inicial aprobado. Debes ingresar las cantidades físicas actuales para poder continuar.
                                    </AlertDescription>
                                </Alert>
                                <InventoryCountForm
                                    products={state.initialInventoryProducts}
                                    counts={state.initialInventoryData}
                                    onQuantityChange={actions.handleInitialInventoryDataChange}
                                    getProductName={selectors.getProductName}
                                    height="h-[40vh]"
                                />
                                <DialogFooter>
                                     <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                                    <Button variant="destructive" onClick={actions.handleCreateInitialInventoryClosure} disabled={state.isSubmitting}>
                                        {state.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Establecer Inventario y Crear Cierre
                                    </Button>
                                </DialogFooter>
                            </>
                           ) : (
                            <>
                                <Label>Paso 2: Usa un Conteo Informativo para Generar el Cierre</Label>
                                <p className="text-sm text-muted-foreground">Selecciona uno de los conteos preliminares guardados por el equipo de campo.</p>
                                <ScrollArea className="h-64 border rounded-md p-2">
                                    {state.availablePhysicalCounts.length > 0 ? (
                                        <div className="space-y-2">
                                            {state.availablePhysicalCounts.map(pc => (
                                                <div key={pc.counted_at} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                                    <div>
                                                        <p className="font-semibold">Conteo del {format(parseISO(pc.counted_at), 'dd/MM/yyyy HH:mm:ss', { locale: es })}</p>
                                                        <p className="text-xs text-muted-foreground">Realizado por: {pc.counted_by}</p>
                                                    </div>
                                                    <Button size="sm" onClick={() => actions.handleCreateClosureFromCount(pc.counted_at)} disabled={state.isSubmitting}>
                                                        {state.isSubmitting && state.selectedPhysicalCountRef === pc.counted_at ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                        Usar este conteo
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted-foreground">
                                            <p>No se encontraron conteos informativos recientes para este cliente.</p>
                                        </div>
                                    )}
                                </ScrollArea>
                            </>
                           )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            
            <Dialog open={state.isLinkInvoiceModalOpen} onOpenChange={actions.setLinkInvoiceModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Vincular Factura ERP</DialogTitle>
                        <DialogDescription>
                            Busca la factura en tu ERP y vincúlala a este cierre ({state.closureToLinkInvoice?.consecutive}) para marcarlo como facturado.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="space-y-2">
                                <Label>Buscar Factura (por Nº o cliente)</Label>
                                <SearchInput 
                                    options={state.searchedInvoices.map(inv => ({ value: inv.FACTURA, label: `[${inv.FACTURA}] - ${inv.NOMBRE_CLIENTE}` }))}
                                    onSelect={(option) => actions.handleLinkInvoice(option.value)}
                                    value={state.invoiceSearchTerm}
                                    onValueChange={actions.setInvoiceSearchTerm}
                                    open={state.searchedInvoices.length > 0 && state.invoiceSearchTerm.length > 2}
                                    onOpenChange={() => {}} // Managed by search term
                                    placeholder="Escribe para buscar facturas..." 
                                />
                            </div>
                            <div className="flex items-center space-x-2 pt-6">
                                <Checkbox
                                    id="limit-days"
                                    checked={state.limitInvoiceSearchTo30Days}
                                    onCheckedChange={(checked) => actions.setLimitInvoiceSearchTo30Days(checked as boolean)}
                                />
                                <Label htmlFor="limit-days">Últimos 30 días</Label>
                            </div>
                        </div>
                        {state.isInvoiceLoading && (
                            <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </main>
    );
}
