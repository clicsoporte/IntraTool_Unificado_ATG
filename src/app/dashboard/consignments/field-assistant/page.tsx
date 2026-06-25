
/**
 * @fileoverview Page component for the new unified Consignment Field Assistant.
 * This component guides the user through client selection, action selection, and counting.
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, CheckCircle, Play, Save, FileSignature, AlertTriangle, Wand2, FileInput, ClipboardCheck } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import { useFieldAssistant } from '@/modules/consignments/hooks/useFieldAssistant';
import { useLoading } from '@/modules/core/hooks/useLoading';
import { InventoryCountForm } from '@/components/consignments/inventory-count-form';

export default function FieldAssistantPage() {
    const { state, actions, selectors } = useFieldAssistant();
    const { step, isLoading, isSubmitting, clientSearchTerm, isClientSearchOpen, selectedAgreement, productsToCount, counts, lastCreatedEntity } = state;
    const { showLoading, hideLoading } = useLoading();

    React.useEffect(() => {
        if (isLoading && step !== 'select_client') {
            showLoading("Cargando información del acuerdo...");
        } else if (isSubmitting) {
            showLoading("Procesando conteo y generando boletas...");
        } else {
            hideLoading();
        }
        return () => {
            hideLoading();
        };
    }, [isLoading, step, isSubmitting, showLoading, hideLoading]);

    if (isLoading && step === 'select_client') {
        return (
             <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <Skeleton className="h-64 w-full max-w-xl" />
            </main>
        )
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
            {step === 'select_client' && (
                <Card className="w-full max-w-md">
                     <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Wand2 /> Asistente de Campo</CardTitle>
                        <CardDescription>
                            Selecciona un cliente para iniciar una tarea de consignación.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 items-center w-full max-w-sm mx-auto">
                        <SearchInput
                            options={selectors.agreementOptions}
                            onSelect={(option) => actions.handleSelectClient(option.value)}
                            value={clientSearchTerm}
                            onValueChange={actions.setClientSearchTerm}
                            open={isClientSearchOpen}
                            onOpenChange={actions.setIsClientSearchOpen}
                            placeholder="Buscar cliente..."
                        />
                    </CardContent>
                </Card>
            )}

            {step === 'select_action' && selectedAgreement && (
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>{selectedAgreement.client_name}</CardTitle>
                        <CardDescription>Selecciona la tarea que deseas realizar.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                         {selectedAgreement.has_initial_inventory === 1 ? (
                            <>
                                {selectedAgreement.operation_mode === 'manual' && (
                                    <Button className="w-full justify-start h-14 text-base" onClick={() => actions.handleSelectAction('REPOSITION_REQUEST')}>
                                        <FileInput className="mr-4" /> Solicitar Reposición
                                    </Button>
                                )}
                                {selectedAgreement.operation_mode === 'auto' && (
                                    <Button className="w-full justify-start h-14 text-base" onClick={() => actions.handleSelectAction('REPOSITION_BOLETA')}>
                                        <ClipboardCheck className="mr-4" /> Generar Boleta por Conteo
                                    </Button>
                                )}
                                <Button variant="secondary" className="w-full justify-start h-14 text-base" onClick={() => actions.handleSelectAction('INFORMATIONAL_COUNT')}>
                                    <Save className="mr-4" /> Conteo Preliminar de Inventario
                                </Button>
                                <Button variant="destructive" className="w-full justify-start h-14 text-base" onClick={() => actions.handleSelectAction('CLOSURE_REQUEST')}>
                                    <FileSignature className="mr-4" /> Iniciar Conteo para Cierre
                                </Button>
                            </>
                         ) : (
                            <Button variant="destructive" className="w-full justify-start h-14 text-base" onClick={() => actions.handleSelectAction('CLOSURE_REQUEST')}>
                                <FileSignature className="mr-4" /> Establecer Inventario Inicial
                            </Button>
                         )}
                    </CardContent>
                    <CardFooter>
                        <Button variant="ghost" onClick={actions.reset}>Cancelar</Button>
                    </CardFooter>
                </Card>
            )}
            
            {step === 'counting' && (
                <Card className="w-full max-w-xl">
                    <CardHeader>
                        <CardTitle>Contando en: {selectedAgreement?.client_name}</CardTitle>
                        <CardDescription>
                            Ingresa las cantidades físicas para cada producto. Tu progreso se guarda automáticamente.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <InventoryCountForm
                            products={productsToCount}
                            counts={counts}
                            onQuantityChange={actions.handleQuantityChange}
                            getProductName={selectors.getProductName}
                        />
                    </CardContent>
                    <CardFooter className="justify-between">
                         <Button variant="outline" onClick={actions.cancelAndReleaseLock}>Cancelar y Salir</Button>
                         <Button onClick={actions.handleFinishCount} disabled={isSubmitting || !selectors.hasCounts}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Finalizar Conteo
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {step === 'finished' && (
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CheckCircle className="mx-auto h-16 w-16 text-green-500"/>
                        <CardTitle className="mt-4 text-2xl">¡Tarea Completada!</CardTitle>
                        {lastCreatedEntity ? (
                             <CardDescription>
                                Se ha generado la <strong>{lastCreatedEntity.type} {lastCreatedEntity.consecutive}</strong>. La sesión ha sido finalizada y el acuerdo liberado.
                            </CardDescription>
                        ) : (
                            <CardDescription>
                               La acción se ha registrado correctamente y el acuerdo ha sido liberado.
                            </CardDescription>
                        )}
                    </CardHeader>
                    <CardFooter className="justify-center">
                        <Button onClick={actions.reset}>Iniciar Nueva Tarea</Button>
                    </CardFooter>
                </Card>
            )}

             <AlertDialog open={state.lockStatus === 'locked-by-other'}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-orange-500"/>Acuerdo en Uso</AlertDialogTitle>
                        <AlertDialogDescription>
                            El acuerdo para <strong>{state.selectedAgreement?.client_name}</strong> está siendo usado por <strong>{state.lockConflictUser}</strong>.
                            <br/><br/>
                            Si estás seguro que el otro usuario abandonó la sesión (ej. se quedó sin batería), puedes forzar el relevo. De lo contrario, contacta al usuario o espera.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={actions.reset}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={actions.handleForceRelayLock}>Forzar y Tomar Control</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
