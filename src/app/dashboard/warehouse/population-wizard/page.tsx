
/**
 * @fileoverview Page component for the guided rack population wizard.
 * This component consumes the `usePopulationWizard` hook to render the UI.
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SearchInput } from '@/components/ui/search-input';
import { Loader2, CheckCircle, Play, ArrowRight, ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { usePopulationWizard } from '@/modules/warehouse/hooks/usePopulationWizard';

export default function PopulationWizardPage() {
    const { state, actions, selectors } = usePopulationWizard();
    const {
        isLoading, wizardStep, rackLevels, selectedLevelIds, rackSearchTerm,
        isRackSearchOpen, locationsToPopulate, currentIndex, productSearch,
        isProductSearchOpen, lastAssignment, existingSession
    } = state;

    if (isLoading && wizardStep === 'setup') {
        return <main className="flex-1 p-4 md:p-6 lg:p-8"><Skeleton className="h-80 w-full max-w-2xl mx-auto"/></main>
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
            {wizardStep === 'setup' && (
                 <Card className="w-full max-w-2xl">
                    <CardHeader>
                        <CardTitle>Asistente de Poblado de Racks</CardTitle>
                        <CardDescription>Selecciona el rack y los niveles que deseas poblar de forma guiada.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label>1. Selecciona el Rack</Label>
                            <SearchInput
                                options={selectors.rackOptions}
                                onSelect={(option) => actions.handleSelectRack(option.value)}
                                placeholder="Busca un rack por nombre o código..."
                                value={rackSearchTerm}
                                onValueChange={actions.setRackSearchTerm}
                                open={isRackSearchOpen}
                                onOpenChange={actions.setIsRackSearchOpen}
                            />
                        </div>
                        {rackLevels.length > 0 && (
                            <div className="space-y-2">
                                <Label>2. Selecciona los Niveles a Poblar</Label>
                                <div className="p-4 border rounded-md max-h-60 overflow-y-auto space-y-2">
                                    {rackLevels.map(level => (
                                        <div key={level.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`level-${level.id}`}
                                                onCheckedChange={() => actions.handleToggleLevel(level.id)}
                                                checked={selectedLevelIds.has(level.id)}
                                                disabled={!!level.isLocked}
                                            />
                                            <Label htmlFor={`level-${level.id}`} className={`font-normal ${!!level.isLocked ? 'text-muted-foreground italic' : ''}`}>
                                                {level.name}
                                                {level.isCompleted && <span className="ml-2 text-xs text-green-600 font-semibold">(Finalizado)</span>}
                                                {!!level.isLocked && <span className="ml-2 text-xs text-destructive font-semibold">(En uso por {level.lockedBy || 'otro usuario'})</span>}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button onClick={actions.handleStartWizard} disabled={selectedLevelIds.size === 0 || isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            <Play className="mr-2 h-4 w-4"/>
                            Comenzar Poblado Guiado
                        </Button>
                    </CardFooter>
                 </Card>
            )}

            {wizardStep === 'resume' && (
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Sesión en Progreso</CardTitle>
                        <CardDescription>
                            Tienes una sesión de poblado sin terminar.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p>¿Deseas continuar donde la dejaste o abandonarla para empezar de nuevo?</p>
                    </CardContent>
                    <CardFooter className="justify-between">
                        <Button variant="destructive" onClick={actions.abandonSession}>Abandonar</Button>
                        <Button onClick={actions.resumeSession}>Continuar Sesión</Button>
                    </CardFooter>
                </Card>
            )}

            {wizardStep === 'populating' && (
                <Card className="w-full max-w-lg">
                    <CardHeader>
                        <CardTitle>Poblando Ubicaciones...</CardTitle>
                        <Progress value={((currentIndex + 1) / locationsToPopulate.length) * 100} className="mt-2" />
                        <CardDescription className="text-center pt-2">
                            Ubicación {currentIndex + 1} de {locationsToPopulate.length}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 text-center">
                        <div>
                            <Label className="text-muted-foreground">Ubicación Actual</Label>
                            <p className="text-2xl font-bold">{selectors.renderLocationPathAsString(locationsToPopulate[currentIndex]?.id)}</p>
                        </div>
                         <div className="flex flex-col gap-4">
                            <SearchInput
                                options={selectors.productOptions}
                                onSelect={(option) => actions.handleProductSelect(option.value)}
                                value={productSearch}
                                onValueChange={actions.setProductSearch}
                                placeholder="Escanear o buscar producto..."
                                onKeyDown={actions.handleKeyDown}
                                open={isProductSearchOpen}
                                onOpenChange={actions.setIsProductSearchOpen}
                                className="text-lg h-14"
                            />
                             <div className="flex justify-center gap-2">
                                <Button className="w-1/2" variant="outline" onClick={actions.handlePrevious} disabled={currentIndex === 0}><ArrowLeft className="mr-2"/> Anterior</Button>
                                <Button className="w-1/2" variant="secondary" onClick={actions.handleSkip}>Omitir <ArrowRight className="ml-2"/></Button>
                            </div>
                        </div>
                        {lastAssignment && (
                             <Alert variant="default">
                                <AlertTitle className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500"/>Asignación Anterior</AlertTitle>
                                <AlertDescription className="text-xs text-left">
                                    <span className="font-semibold">[{lastAssignment.code}]</span> {lastAssignment.product} en <span className="italic">{lastAssignment.location}</span>
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardFooter className="justify-center">
                        <Button variant="destructive" onClick={actions.handleFinishWizard}>Finalizar Sesión</Button>
                    </CardFooter>
                </Card>
            )}
            
            {wizardStep === 'finished' && (
                 <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CheckCircle className="mx-auto h-16 w-16 text-green-500"/>
                        <CardTitle className="mt-4 text-2xl">Sesión Finalizada</CardTitle>
                        <CardDescription>
                            El poblado guiado ha terminado y los niveles han sido liberados.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {lastAssignment && (
                             <p className="text-sm text-muted-foreground">Última asignación: [{lastAssignment.code}] {lastAssignment.product} en {lastAssignment.location}.</p>
                        )}
                    </CardContent>
                    <CardFooter className="justify-center">
                        <Button onClick={actions.resetWizard}>Iniciar Nuevo Poblado</Button>
                    </CardFooter>
                </Card>
            )}
        </main>
    );
}
