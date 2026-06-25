/**
 * @fileoverview Page for the new Consignments Billing Report.
 * This is the official report generated from a specific Period Closure.
 */
'use client';

import React from 'react';
import { useBillingReport } from '@/modules/analytics/hooks/useBillingReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileDown, FileSpreadsheet, ArrowLeft, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";


export default function BillingReportPage() {
    const { state, actions, selectors, isAuthorized } = useBillingReport();
    const { isLoading, reportData, closureInfo, previousClosure, boletasInPeriod } = state;

    if (!isAuthorized) return null;

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex justify-center items-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </main>
        );
    }
    
    if (!reportData) {
         return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card className="max-w-4xl mx-auto">
                    <CardHeader>
                        <CardTitle>ID de cierre no encontrado</CardTitle>
                        <CardDescription>No se especificó un cierre para generar el reporte. Por favor, accede a este reporte desde la página de &quot;Gestión de Cierres&quot;.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Button asChild variant="outline">
                            <Link href="/dashboard/consignments/cierres" prefetch={false}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Volver a Gestión de Cierres
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <Card className="max-w-6xl mx-auto">
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-4">
                                <CardTitle className="text-2xl">Reporte de Facturación: {closureInfo?.consecutive}</CardTitle>
                                {!state.previousClosure && (
                                    <Badge variant="outline" className="border-green-600 text-green-700 font-bold text-base py-1 px-3">
                                        INVENTARIO INICIAL
                                    </Badge>
                                )}
                            </div>
                            <CardDescription>
                                Consolidado de consumo para el cliente <strong>{closureInfo?.client_name}</strong> entre el 
                                {previousClosure ? ` ${format(parseISO(previousClosure.created_at), 'dd/MM/yy HH:mm')}` : ' inicio'} y el {format(parseISO(closureInfo!.created_at), 'dd/MM/yy HH:mm')}.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button asChild variant="outline">
                                <Link href="/dashboard/consignments/cierres" prefetch={false}><ArrowLeft className="mr-2 h-4 w-4" />Volver</Link>
                            </Button>
                            <Button variant="outline" onClick={actions.handleExportExcel} disabled={reportData.length === 0}><FileSpreadsheet className="mr-2"/>Exportar Excel</Button>
                            <Button onClick={actions.handleExportPDF} disabled={reportData.length === 0}><FileDown className="mr-2"/>Exportar PDF</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                     <Alert className="mb-6">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Información del Cálculo</AlertTitle>
                        <AlertDescription>
                            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                                <li><strong>Inventario Inicial:</strong> Basado en el conteo del cierre anterior ({previousClosure?.consecutive || 'Ninguno'}).</li>
                                <li>
                                    <div className="flex items-center">
                                        <strong>Entregas en el Período:</strong>
                                        <Dialog open={state.isBoletasDialogOpen} onOpenChange={actions.setIsBoletasDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="link" className="p-0 h-auto ml-1 text-blue-600 text-sm">
                                                    Se incluyeron {boletasInPeriod.length} boleta(s) de reposición.
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[625px]">
                                                <DialogHeader>
                                                    <DialogTitle>Boletas Incluidas en el Cierre</DialogTitle>
                                                    <DialogDescription>
                                                        Estas son las boletas de reposición cuyas entregas se consideraron para calcular el consumo de este período.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <ScrollArea className="max-h-[60vh] mt-4">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Consecutivo</TableHead>
                                                                <TableHead>Fecha</TableHead>
                                                                <TableHead>Usuario</TableHead>
                                                                <TableHead>Movimiento ERP</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {boletasInPeriod.map(boleta => (
                                                                <TableRow key={boleta.id}>
                                                                    <TableCell className="font-mono">{boleta.consecutive}</TableCell>
                                                                    <TableCell>{format(parseISO(boleta.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}</TableCell>
                                                                    <TableCell>{boleta.created_by}</TableCell>
                                                                    <TableCell>{boleta.erp_movement_id || '-'}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </ScrollArea>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </li>
                                <li><strong>Inventario Final:</strong> Basado en el conteo de este cierre ({closureInfo?.consecutive}).</li>
                            </ul>
                        </AlertDescription>
                    </Alert>

                    <ScrollArea className="h-[60vh] border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código Artículo</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead className="text-right">A Facturar</TableHead>
                                    <TableHead className="text-right">Precio Unit.</TableHead>
                                    <TableHead className="text-right font-bold">Valor Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.length > 0 ? (
                                    reportData.map(row => (
                                        <TableRow key={row.productId}>
                                            <TableCell className="font-mono">{row.productId}</TableCell>
                                            <TableCell>{row.productDescription}</TableCell>
                                            <TableCell className="text-right font-bold text-lg">{row.consumption.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{row.price.toLocaleString('es-CR', { style: 'currency', currency: 'CRC' })}</TableCell>
                                            <TableCell className="text-right font-bold text-primary text-lg">{row.totalValue.toLocaleString('es-CR', { style: 'currency', currency: 'CRC' })}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                     <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No se encontró consumo para este período de facturación.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </main>
    );
}
