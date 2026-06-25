/**
 * @fileoverview Page for the new Consignment Inventory Monitor.
 */
'use client';

import React from 'react';
import { useInventoryMonitor } from '@/modules/analytics/hooks/useInventoryMonitor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Box, BookOpenCheck, History, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ConsignmentAgreement } from '@/modules/core/types';


export default function InventoryMonitorPage() {
    const { state, actions, isAuthorized } = useInventoryMonitor();
    const { isLoading, agreements, selectedAgreementId, monitorData } = state;

    if (!isAuthorized) return null;

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex justify-center items-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </main>
        );
    }
    
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Monitor de Inventario en Consignación</CardTitle>
                    <CardDescription>Consulta el inventario teórico y el último conteo físico registrado para un cliente.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4 items-center">
                    <Select value={selectedAgreementId || ''} onValueChange={actions.setSelectedAgreementId}>
                        <SelectTrigger className="w-full sm:w-[300px]"><SelectValue placeholder="Selecciona un cliente..." /></SelectTrigger>
                        <SelectContent>
                            {agreements.map((agreement) => (
                                <SelectItem key={agreement.id} value={String(agreement.id)}>
                                    {agreement.client_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={actions.handleFetchData} disabled={isLoading || !selectedAgreementId}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Consultar
                    </Button>
                </CardContent>
            </Card>

            {monitorData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Box className="text-primary"/> Inventario Teórico</CardTitle>
                            <CardDescription>Calculado como (Último Cierre Oficial) + (Entregas Posteriores).</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <ScrollArea className="h-72 border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Producto</TableHead>
                                            <TableHead className="text-right">Cantidad Teórica</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {Object.entries(monitorData.theoreticalInventory).map(([productId, data]) => (
                                            <TableRow key={productId}>
                                                <TableCell>
                                                    <p className="font-medium">{data.description}</p>
                                                    <p className="text-xs text-muted-foreground">{productId}</p>
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-lg">{data.quantity}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             </ScrollArea>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><BookOpenCheck className="text-green-600"/> Último Conteo Físico</CardTitle>
                             <CardDescription>
                                {monitorData.lastPhysicalCount ? `Realizado por ${monitorData.lastPhysicalCount.counted_by} el ${format(parseISO(monitorData.lastPhysicalCount.counted_at), 'dd/MM/yyyy HH:mm', { locale: es })}` : 'No hay conteos preliminares registrados.'}
                            </CardDescription>
                        </CardHeader>
                         <CardContent>
                             <ScrollArea className="h-72 border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Producto</TableHead>
                                            <TableHead className="text-right">Cantidad Contada</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                    {monitorData.lastPhysicalCount?.lines.map((line) => (
                                        <TableRow key={line.productId}>
                                            <TableCell>
                                                <p className="font-medium">{line.productDescription}</p>
                                                <p className="text-xs text-muted-foreground">{line.productId}</p>
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-lg">{line.quantity}</TableCell>
                                        </TableRow>
                                    ))}
                                    </TableBody>
                                </Table>
                             </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            )}
             {monitorData && monitorData.countHistory && monitorData.countHistory.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><History/> Historial de Conteos Preliminares</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha del Conteo</TableHead>
                                    <TableHead>Realizado Por</TableHead>
                                </TableRow>
                            </TableHeader>
                             <TableBody>
                                {monitorData.countHistory.map((hist) => (
                                    <TableRow key={hist.counted_at}>
                                        <TableCell>{format(parseISO(hist.counted_at), 'dd/MM/yyyy HH:mm:ss', { locale: es })}</TableCell>
                                        <TableCell>{hist.counted_by}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </main>
    );
}
