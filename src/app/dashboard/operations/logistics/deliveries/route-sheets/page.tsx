'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    ArrowLeft,
    Search,
    Printer,
    Download,
    Mail,
    RefreshCw,
    Calendar,
    FileText,
    User,
    Route,
    Truck
} from 'lucide-react';
import {
    getFinalizedRoutesReport,
    getRouteSheetPreviewHtml,
    resendRouteSheetEmail,
    getDrivers,
    getDeliveryRoutes
} from '@/modules/operations/lib/actions';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import jsPDF from 'jspdf';

export default function RouteSheetsReportPage() {
    const { toast } = useToast();
    const { isAuthorized, isLoading: authLoading } = useAuthorization(['deliveries:read', 'deliveries:route-sheets']);
    const [loading, setLoading] = useState(true);
    const [routesReport, setRoutesReport] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [routes, setRoutes] = useState<any[]>([]);

    // Filters state
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [selectedRoute, setSelectedRoute] = useState<string>('all');
    const [selectedDriver, setSelectedDriver] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Preview state
    const [previewDoc, setPreviewDoc] = useState<any>(null);
    const [previewHtml, setPreviewHtml] = useState<string>('');
    const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
    const [resendingEmail, setResendingEmail] = useState<boolean>(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [rep, drvs, rts] = await Promise.all([
                getFinalizedRoutesReport({
                    startDate: startDate || undefined,
                    endDate: endDate || undefined,
                    routeId: selectedRoute === 'all' ? undefined : selectedRoute,
                    driverId: selectedDriver === 'all' ? undefined : selectedDriver,
                    query: searchQuery || undefined
                }),
                getDrivers(),
                getDeliveryRoutes()
            ]);
            setRoutesReport(rep || []);
            setDrivers(drvs || []);
            setRoutes((rts || []).filter(r => r.active === 1));
        } catch (e: any) {
            toast({
                title: 'Error de carga',
                description: 'No se pudieron recuperar las hojas de ruta.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, selectedRoute, selectedDriver, searchQuery, toast]);

    useEffect(() => {
        if (!authLoading && isAuthorized) {
            loadData();
        }
    }, [authLoading, isAuthorized, loadData]);

    const handleApplyFilters = (e: React.FormEvent) => {
        e.preventDefault();
        loadData();
    };

    const handleResetFilters = () => {
        setStartDate('');
        setEndDate('');
        setSelectedRoute('all');
        setSelectedDriver('all');
        setSearchQuery('');
        // We delay calling loadData to allow state updates to register
        setTimeout(() => {
            getFinalizedRoutesReport({}).then(rep => setRoutesReport(rep || []));
        }, 50);
    };

    const handleOpenPreview = async (doc: any) => {
        setPreviewDoc(doc);
        setLoadingPreview(true);
        try {
            const res = await getRouteSheetPreviewHtml(doc.id);
            if (res.success && res.html) {
                setPreviewHtml(res.html);
            } else {
                toast({
                    title: 'Error de previsualización',
                    description: res.error || 'No se pudo generar el preview.',
                    variant: 'destructive'
                });
            }
        } catch (e) {
            toast({
                title: 'Error de carga',
                description: 'Ocurrió un error al cargar la vista previa.',
                variant: 'destructive'
            });
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleResendEmail = async () => {
        if (!previewDoc) return;
        setResendingEmail(true);
        try {
            const res = await resendRouteSheetEmail(previewDoc.id);
            if (res.success) {
                toast({
                    title: 'Correo Reenviado',
                    description: 'La hoja de ruta ha sido reenviada con éxito a los correos configurados.',
                });
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al reenviar',
                description: e.message || 'No se pudo completar el reenvío.',
                variant: 'destructive'
            });
        } finally {
            setResendingEmail(false);
        }
    };

    const handlePrint = () => {
        if (!previewHtml) return;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(previewHtml);
            printWindow.document.close();
            // Allow resources to load before printing
            printWindow.onload = () => {
                printWindow.print();
                printWindow.close();
            };
        }
    };

    const handleDownloadPdf = () => {
        if (!previewDoc) return;

        // Fetch finalized route deliveries directly using window fetch or simple jsPDF layout
        // We can draw a clean, professional PDF matching the style of collects sheets
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
        
        const marginX = 15;
        let currentY = 20;
        const pageWidth = 215.9; // letter width in mm
        const contentWidth = pageWidth - (marginX * 2);

        // Cabecera
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(30, 58, 138); // Dark Blue
        doc.text("INDUSTRIAS GAREND S.A.", marginX, currentY);
        
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        doc.text("Cédula Jurídica: 3-101-133082", marginX, currentY + 5);
        doc.text("Tel: +506 2458-4343 | Email: ventas@industriasgarend.com", marginX, currentY + 9);
        doc.text("Dirección: Alajuela, Poás, Carrillos bajo, del EBAIS 700 oeste.", marginX, currentY + 13);

        // Badge Box para Consecutivo
        const badgeX = 145;
        const badgeY = 15;
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(191, 219, 254);
        doc.roundedRect(badgeX, badgeY, 55, 20, 2, 2, 'FD');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 64, 175);
        doc.text("HOJA DE RUTA", badgeX + 4, badgeY + 6);
        doc.setFontSize(14);
        doc.setTextColor(29, 78, 216);
        doc.text(previewDoc.consecutivo, badgeX + 4, badgeY + 13);
        
        currentY += 22;
        doc.setDrawColor(226, 232, 240);
        doc.line(marginX, currentY, marginX + contentWidth, currentY);
        currentY += 8;

        // Datos del Viaje
        doc.setFontSize(11);
        doc.setTextColor(30, 58, 138);
        doc.text("INFORMACIÓN DEL VIAJE", marginX, currentY);
        currentY += 5;

        // Card Box para datos generales
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, currentY, contentWidth, 22, 1.5, 1.5, 'FD');

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text("Ruta:", marginX + 4, currentY + 6);
        doc.text("Chofer:", marginX + 4, currentY + 11);
        doc.text("Vehículo/Placa:", marginX + 4, currentY + 16);

        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(previewDoc.ruta_nombre || 'N/A', marginX + 30, currentY + 6);
        doc.text(previewDoc.chofer_nombre || 'N/A', marginX + 30, currentY + 11);
        doc.text(`${previewDoc.vehiculo_marca || ''} ${previewDoc.vehiculo_modelo || ''} (${previewDoc.vehiculo_placa || 'N/A'})`, marginX + 30, currentY + 16);

        // Fecha en la derecha del cuadro
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text("Fecha Cierre:", marginX + 110, currentY + 6);
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        const dateStr = new Date(previewDoc.fecha_completada || previewDoc.fecha).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
        doc.text(dateStr, marginX + 135, currentY + 6);

        currentY += 30;

        // Tabla de Entregas
        doc.setFontSize(11);
        doc.setTextColor(30, 58, 138);
        doc.text("RESUMEN DE ENTREGAS REALIZADAS", marginX, currentY);
        currentY += 5;

        // Headers
        doc.setFillColor(241, 245, 249);
        doc.rect(marginX, currentY, contentWidth, 8, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        
        doc.text("Hora", marginX + 3, currentY + 5.5);
        doc.text("Cliente / Nombre", marginX + 20, currentY + 5.5);
        doc.text("N° Documento", marginX + 90, currentY + 5.5);
        doc.text("Dirección (EMB)", marginX + 120, currentY + 5.5);
        doc.text("Estado", marginX + 170, currentY + 5.5);

        currentY += 8;

        // We fetch the processed deliveries directly from the preview HTML rows or query a temporary JSON
        // For standard client-side implementation, we can extract details from database or a quick parse, or just render a clean mock list of deliveries matching the assignment
        // Since we are inside the page, we will use a quick layout.
        // Let's call standard fetch or render details
        // To be extremely precise, we can query deliveries dynamically.
        // Let's write a quick client helper to read the rows or render the table rows cleanly
        // Since jsPDF is running in the client, let's make it draw from previewHtml if available or simply query previewDoc
        
        // Since we don't have the full deliveries list in previewDoc directly, let's load them or parse them from previewHtml
        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(previewHtml, 'text/html');
        const rows = htmlDoc.querySelectorAll('tbody tr');

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);

        if (rows.length === 0 || (rows.length === 1 && rows[0].textContent?.includes('No se registraron'))) {
            doc.text("No se registraron entregas procesadas en esta ruta.", marginX + 3, currentY + 6);
            currentY += 10;
        } else {
            rows.forEach((row) => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 5) {
                    const hora = cols[0].textContent?.trim() || '';
                    // Clean client name (remove duplicate spacings)
                    const clienteRaw = cols[1].textContent?.trim() || '';
                    const clienteLines = clienteRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    const cliente = clienteLines[0] || '';
                    const docNum = cols[2].textContent?.trim() || '';
                    const direccion = cols[3].textContent?.trim() || '';
                    const estado = cols[4].textContent?.trim() || '';

                    doc.line(marginX, currentY, marginX + contentWidth, currentY);

                    doc.setFont('Helvetica', 'normal');
                    doc.text(hora, marginX + 3, currentY + 5);
                    
                    const splitClient = doc.splitTextToSize(cliente, 65);
                    doc.setFont('Helvetica', 'bold');
                    doc.text(splitClient[0], marginX + 20, currentY + 5);
                    
                    doc.setFont('Helvetica', 'bold');
                    doc.text(docNum, marginX + 90, currentY + 5);
                    
                    const splitAddress = doc.splitTextToSize(direccion, 45);
                    doc.setFont('Helvetica', 'normal');
                    doc.text(splitAddress[0] || '', marginX + 120, currentY + 5);
                    
                    // State coloring
                    if (estado.toLowerCase().includes('completo')) {
                        doc.setTextColor(16, 185, 129); // green
                    } else if (estado.toLowerCase().includes('incompleto')) {
                        doc.setTextColor(217, 119, 6); // amber
                    } else {
                        doc.setTextColor(220, 38, 38); // red
                    }
                    doc.setFont('Helvetica', 'bold');
                    doc.text(estado, marginX + 170, currentY + 5);
                    
                    doc.setTextColor(51, 65, 85); // reset color
                    currentY += 7.5;
                }
            });
        }

        currentY += 15;
        doc.line(marginX, currentY, marginX + contentWidth, currentY);
        currentY += 15;

        // Firmas
        const sigWidth = contentWidth / 2;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text("Firma Chofer", marginX + 20, currentY);
        doc.text("Recibido Transportes", marginX + sigWidth + 20, currentY);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(previewDoc.chofer_nombre || '__________________________', marginX + 20, currentY + 8);
        doc.text("Firma y Sello", marginX + sigWidth + 20, currentY + 8);

        doc.save(`hoja_de_ruta_${previewDoc.consecutivo}.pdf`);
        toast({
            title: 'PDF Descargado',
            description: `Hoja de ruta ${previewDoc.consecutivo} descargada con éxito.`,
        });
    };

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse m-6">
                <div className="text-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                    <p className="text-muted-foreground font-medium">Cargando reportes...</p>
                </div>
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <div className="p-6 text-center text-red-500 font-bold">
                No tiene permiso para acceder a este reporte.
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" asChild className="rounded-xl h-9">
                    <Link href="/dashboard/operations/logistics/deliveries">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Monitor de Entregas
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">Historial de Hojas de Ruta</h1>
                    <p className="text-muted-foreground text-sm">
                        Busque, visualice, imprima y descargue las Hojas de Ruta finalizadas.
                    </p>
                </div>
            </div>

            {/* Filters panel */}
            <Card className="border-none shadow-md bg-card">
                <CardContent className="p-4">
                    <form onSubmit={handleApplyFilters} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Fecha Inicio</Label>
                            <div className="relative">
                                <Calendar className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="pl-9 rounded-lg font-bold"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Fecha Fin</Label>
                            <div className="relative">
                                <Calendar className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="pl-9 rounded-lg font-bold"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Chofer</Label>
                            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                                <SelectTrigger className="rounded-lg font-bold">
                                    <SelectValue placeholder="Todos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="font-semibold text-slate-500">Todos los choferes</SelectItem>
                                    {drivers.map((d) => (
                                        <SelectItem key={d.id} value={String(d.id)} className="font-semibold">
                                            {d.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Ruta</Label>
                            <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                                <SelectTrigger className="rounded-lg font-bold">
                                    <SelectValue placeholder="Todas" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="font-semibold text-slate-500">Todas las rutas</SelectItem>
                                    {routes.map((r) => (
                                        <SelectItem key={r.id} value={String(r.id)} className="font-semibold">
                                            {r.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex gap-2">
                            <Button type="submit" className="rounded-xl flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold h-10">
                                <Search className="w-4 h-4 mr-2" />
                                Filtrar
                            </Button>
                            <Button type="button" variant="outline" onClick={handleResetFilters} className="rounded-xl font-bold h-10">
                                Limpiar
                            </Button>
                        </div>
                    </form>

                    <div className="mt-4">
                        <Label className="text-xs font-bold text-muted-foreground">Buscar por Consecutivo o Nombre</Label>
                        <div className="relative mt-1">
                            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Ej: RUT-000004 o Chofer..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 rounded-lg font-semibold"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Results Grid */}
            <Card className="border-none shadow-md bg-card">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="border-b border-muted bg-muted/20">
                                    <th className="p-4 font-bold text-xs text-muted-foreground uppercase">Consecutivo</th>
                                    <th className="p-4 font-bold text-xs text-muted-foreground uppercase">Fecha Cierre</th>
                                    <th className="p-4 font-bold text-xs text-muted-foreground uppercase">Ruta / Camión</th>
                                    <th className="p-4 font-bold text-xs text-muted-foreground uppercase">Chofer / Placa</th>
                                    <th className="p-4 font-bold text-xs text-muted-foreground uppercase text-center">Entregas</th>
                                    <th className="p-4 font-bold text-xs text-muted-foreground uppercase text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {routesReport.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-12 text-center text-muted-foreground italic">
                                            No se encontraron Hojas de Ruta finalizadas con los filtros establecidos.
                                        </td>
                                    </tr>
                                ) : (
                                    routesReport.map((rep) => {
                                        const dateStr = new Date(rep.fecha_completada || rep.fecha).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
                                        const timeStr = new Date(rep.fecha_completada || rep.fecha).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' });
                                        return (
                                            <tr key={rep.id} className="border-b border-muted/50 hover:bg-muted/10 transition-all">
                                                <td className="p-4">
                                                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                                        {rep.consecutivo}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-sm">{dateStr}</span>
                                                        <span className="text-xs text-muted-foreground">{timeStr}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-1.5">
                                                        <Route className="w-3.5 h-3.5 text-sky-500" />
                                                        <span className="font-semibold text-sm">{rep.ruta_nombre}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-sm flex items-center gap-1"><User className="w-3 h-3 text-slate-400" /> {rep.chofer_nombre}</span>
                                                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3 text-slate-400" /> {rep.vehiculo_marca} ({rep.vehiculo_placa})</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <Badge variant="outline" className="font-bold border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400">
                                                        {rep.total_entregas} Docs
                                                    </Badge>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleOpenPreview(rep)}
                                                        className="rounded-xl font-bold gap-1 text-xs hover:bg-blue-600 hover:text-white transition-all border-blue-500/20"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" />
                                                        Detalle / Imprimir
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Preview Sheet Modal */}
            <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
                <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-muted bg-background">
                    <DialogHeader className="pb-2">
                        <DialogTitle className="text-md font-extrabold flex items-center gap-2">
                            📄 Previsualización de Hoja de Ruta
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold">
                            Revisión e impresión para el consecutivo {previewDoc?.consecutivo}.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Report Preview Body */}
                    <div className="flex-1 overflow-y-auto border border-muted rounded-xl bg-slate-50 dark:bg-slate-900/20 p-4">
                        {loadingPreview ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                                <span className="font-bold">Generando documento...</span>
                            </div>
                        ) : (
                            <div
                                className="bg-white text-slate-900 p-6 rounded-lg shadow-sm border border-slate-200"
                                dangerouslySetInnerHTML={{ __html: previewHtml }}
                            />
                        )}
                    </div>

                    <DialogFooter className="pt-4 flex flex-col sm:flex-row gap-2 justify-end">
                        <Button
                            variant="outline"
                            onClick={handleResendEmail}
                            disabled={loadingPreview || resendingEmail}
                            className="rounded-xl font-bold text-xs gap-1.5"
                        >
                            <Mail className="w-4 h-4" />
                            {resendingEmail ? 'Reenviando...' : 'Reenviar Correo'}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handlePrint}
                            disabled={loadingPreview}
                            className="rounded-xl font-bold text-xs gap-1.5"
                        >
                            <Printer className="w-4 h-4" />
                            Imprimir
                        </Button>
                        <Button
                            onClick={handleDownloadPdf}
                            disabled={loadingPreview}
                            className="rounded-xl font-black text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            <Download className="w-4 h-4" />
                            Descargar PDF
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setPreviewDoc(null)}
                            className="rounded-xl font-bold text-xs"
                        >
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
