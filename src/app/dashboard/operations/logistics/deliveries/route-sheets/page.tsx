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
    getRouteSheetEmailRecipientsAction,
    getDeliverySettings,
    getDrivers,
    getDeliveryRoutes
} from '@/modules/operations/lib/actions';
import { getCompanySettingsAction } from '@/modules/core/lib/actions';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import jsPDF from 'jspdf';

export default function RouteSheetsReportPage() {
    const { toast } = useToast();
    const { isAuthorized, isLoading: authLoading } = useAuthorization(['deliveries:route-sheets', 'deliveries:admin']);
    const [loading, setLoading] = useState(true);
    const [routesReport, setRoutesReport] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [routes, setRoutes] = useState<any[]>([]);
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [deliverySettings, setDeliverySettings] = useState<Record<string, string>>({});

    // Pagination State
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(15);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [totalCount, setTotalCount] = useState<number>(0);

    // On Demand Search State
    const [hasSearched, setHasSearched] = useState<boolean>(false);

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

    // Resend Confirmation Dialog State
    const [isResendDialogOpen, setIsResendDialogOpen] = useState<boolean>(false);
    const [targetRecipients, setTargetRecipients] = useState<string[]>([]);
    const [loadingRecipients, setLoadingRecipients] = useState<boolean>(false);

    // Initial metadata load (drivers, routes, settings & company info)
    useEffect(() => {
        if (!authLoading && isAuthorized) {
            Promise.all([getDrivers(), getDeliveryRoutes(), getCompanySettingsAction(), getDeliverySettings()])
                .then(([drvs, rts, comp, setts]) => {
                    setDrivers(drvs || []);
                    setRoutes((rts || []).filter(r => r.active === 1));
                    if (comp) setCompanyInfo(comp);
                    if (setts) setDeliverySettings(setts);
                })
                .finally(() => setLoading(false));
        }
    }, [authLoading, isAuthorized]);

    const loadData = useCallback(async (targetPage = page, targetSize = pageSize) => {
        setLoading(true);
        setHasSearched(true);
        try {
            const repRes = await getFinalizedRoutesReport({
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                routeId: selectedRoute === 'all' ? undefined : selectedRoute,
                driverId: selectedDriver === 'all' ? undefined : selectedDriver,
                query: searchQuery || undefined,
                page: targetPage,
                pageSize: targetSize
            });

            if (repRes && typeof repRes === 'object' && 'data' in repRes) {
                setRoutesReport(repRes.data || []);
                setTotalPages(repRes.totalPages || 1);
                setTotalCount(repRes.totalCount || 0);
            } else {
                setRoutesReport(Array.isArray(repRes) ? repRes : []);
                setTotalPages(1);
                setTotalCount(Array.isArray(repRes) ? repRes.length : 0);
            }
        } catch (e: any) {
            toast({
                title: 'Error de carga',
                description: 'No se pudieron recuperar las hojas de ruta.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, selectedRoute, selectedDriver, searchQuery, page, pageSize, toast]);

    const handleApplyFilters = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        loadData(1, pageSize);
    };

    const handleResetFilters = () => {
        setStartDate('');
        setEndDate('');
        setSelectedRoute('all');
        setSelectedDriver('all');
        setSearchQuery('');
        setHasSearched(false);
        setRoutesReport([]);
        setPage(1);
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

    const handlePromptResendEmail = async () => {
        if (!previewDoc) return;
        setLoadingRecipients(true);
        try {
            const res = await getRouteSheetEmailRecipientsAction();
            if (res.success && res.emails) {
                setTargetRecipients(res.emails);
            } else {
                setTargetRecipients(['logistica@empresa.com']);
            }
            setIsResendDialogOpen(true);
        } catch (e) {
            setTargetRecipients(['logistica@empresa.com']);
            setIsResendDialogOpen(true);
        } finally {
            setLoadingRecipients(false);
        }
    };

    const handleConfirmResendEmail = async () => {
        if (!previewDoc) return;
        setIsResendDialogOpen(false);
        setResendingEmail(true);
        try {
            const res = await resendRouteSheetEmail(previewDoc.id);
            if (res.success) {
                toast({
                    title: 'Correo Reenviado',
                    description: `La hoja de ruta ${previewDoc.consecutivo} ha sido enviada con éxito a: ${targetRecipients.join(', ')}.`,
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
            printWindow.onload = () => {
                printWindow.print();
                printWindow.close();
            };
        }
    };

    const handleDownloadPdf = () => {
        if (!previewDoc) return;

        // Formato Horizontal (Letter Landscape): Ancho 279.4mm, Alto 215.9mm
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
        
        const marginX = 12;
        const pageWidth = 279.4;
        const pageHeight = 215.9;
        const contentWidth = pageWidth - (marginX * 2); // 255.4mm

        const companyName = companyInfo?.name || "INDUSTRIAS GAREND S.A.";
        const companyTaxId = companyInfo?.taxId ? `Cédula Jurídica: ${companyInfo.taxId}` : "Cédula Jurídica: 3-101-133082";
        const companyContact = `Tel: ${companyInfo?.phone || '+506 2458-4343'} | Email: ${companyInfo?.email || 'ventas@industriasgarend.com'}`;
        const companyAddress = `Dirección: ${companyInfo?.address || 'Alajuela, Poás, Carrillos bajo, del EBAIS 700 oeste.'}`;
        const isoText = deliverySettings.route_sheet_iso_text || "DOC-LOG-04 | Ver. 02 | Sistema de Gestión de Calidad ISO 9001:2015";
        const dateStr = new Date(previewDoc.fecha_completada || previewDoc.fecha).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
        const timeStr = new Date(previewDoc.fecha_completada || previewDoc.fecha).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' });

        // Función reusable para dibujar el membrete superior y control ISO 9001 en cada página
        const drawHeader = (pageNumber: number, totalPagesCount?: number) => {
            let y = 14;

            // Datos de Empresa
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(30, 58, 138); // Dark Blue
            doc.text(companyName.toUpperCase(), marginX, y);
            
            doc.setFontSize(8.5);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            doc.text(`${companyTaxId} | ${companyContact}`, marginX, y + 4.5);
            doc.text(companyAddress, marginX, y + 8.5);

            // Badge Box Superior Derecho con Consecutivo y Código ISO 9001
            const badgeW = 98;
            const badgeH = 19;
            const badgeX = pageWidth - marginX - badgeW;
            const badgeY = 9;

            doc.setFillColor(239, 246, 255);
            doc.setDrawColor(147, 197, 253);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'FD');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(30, 64, 175);
            doc.text("HOJA DE RUTA", badgeX + 4, badgeY + 4.5);

            doc.setFontSize(12);
            doc.setTextColor(29, 78, 216);
            doc.text(previewDoc.consecutivo, badgeX + 40, badgeY + 4.8);

            // Cuadro ISO 9001
            doc.setFillColor(224, 242, 254);
            doc.setDrawColor(186, 230, 253);
            doc.roundedRect(badgeX + 3, badgeY + 7, badgeW - 6, 5, 1, 1, 'FD');
            doc.setFontSize(6.5);
            doc.setTextColor(2, 132, 199);
            doc.text(isoText, badgeX + 5, badgeY + 10.5);

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(71, 85, 105);
            const pageStr = totalPagesCount ? `Hoja ${pageNumber} de ${totalPagesCount}` : `Hoja ${pageNumber}`;
            doc.text(`Fecha: ${dateStr} ${timeStr}`, badgeX + 4, badgeY + 16.5);
            
            // Badge de Paginación 'Hoja X de Y'
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(30, 58, 138);
            doc.text(pageStr, badgeX + badgeW - 24, badgeY + 16.5);

            y += 13;
            doc.setDrawColor(226, 232, 240);
            doc.line(marginX, y, marginX + contentWidth, y);
            y += 3.5;

            // Datos del Viaje en Una Sola Fila Compacta Horizontal
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(marginX, y, contentWidth, 8, 1, 1, 'FD');

            doc.setFontSize(7.5);
            doc.setTextColor(71, 85, 105);
            doc.text("Ruta:", marginX + 3, y + 5.2);
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(previewDoc.ruta_nombre || 'N/A', marginX + 13, y + 5.2);

            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            doc.text("Chofer:", marginX + 80, y + 5.2);
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(previewDoc.chofer_nombre || 'N/A', marginX + 92, y + 5.2);

            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            doc.text("Vehículo:", marginX + 165, y + 5.2);
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(`${previewDoc.vehiculo_marca || ''} ${previewDoc.vehiculo_modelo || ''} (${previewDoc.vehiculo_placa || 'N/A'})`, marginX + 180, y + 5.2);

            return y + 12;
        };

        // Encabezados de la Tabla Horizontal
        const drawTableHeaders = (y: number) => {
            doc.setFillColor(241, 245, 249);
            doc.rect(marginX, y, contentWidth, 7, 'F');
            doc.setDrawColor(203, 213, 225);
            doc.line(marginX, y + 7, marginX + contentWidth, y + 7);

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(51, 65, 85);

            // Columnas Horizontales con Firma Digital y Anchos Precisos sin Solapamiento
            doc.text("Hora", marginX + 2, y + 4.8);                // x: 14mm  (ancho: 14mm)
            doc.text("Cliente / Destino", marginX + 16, y + 4.8);   // x: 28mm  (ancho: 52mm)
            doc.text("N° Doc", marginX + 70, y + 4.8);              // x: 82mm  (ancho: 28mm)
            doc.text("Dirección (EMB)", marginX + 100, y + 4.8);    // x: 112mm (ancho: 64mm)
            doc.text("Recibido Por", marginX + 166, y + 4.8);       // x: 178mm (ancho: 36mm)
            doc.text("Estado", marginX + 204, y + 4.8);             // x: 216mm (ancho: 24mm)
            doc.text("Firma Digital", marginX + 230, y + 4.8);      // x: 242mm (ancho: 25mm)

            return y + 7;
        };

        let currentPage = 1;
        let currentY = drawHeader(currentPage);
        currentY = drawTableHeaders(currentY);

        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(previewHtml, 'text/html');
        // Extraer las filas de entregas exclusivamente de la tabla de entregas
        const deliveryTableTrs = Array.from(htmlDoc.querySelectorAll('#route-sheet-deliveries-table tbody tr'));
        const fallbackTrs = Array.from(htmlDoc.querySelectorAll('tbody tr'));
        const candidateTrs = deliveryTableTrs.length > 0 ? deliveryTableTrs : fallbackTrs;
        const rows = candidateTrs.filter(tr => {
            const tds = tr.querySelectorAll('td');
            // La fila de entregas tiene 7 columnas y no contiene las etiquetas de encabezado de datos generales
            const text = tr.textContent || '';
            const isMetadataRow = text.includes('Ruta:') || text.includes('Chofer:') || text.includes('Vehículo:');
            return tds.length >= 6 && !isMetadataRow;
        });

        if (rows.length === 0 || (rows.length === 1 && rows[0].textContent?.includes('No se registraron'))) {
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text("No se registraron entregas procesadas en esta ruta.", marginX + 4, currentY + 6);
            currentY += 10;
        } else {
            rows.forEach((row) => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 6) {
                    const hora = cols[0]?.textContent?.trim() || '';
                    const clienteRaw = cols[1]?.textContent?.trim() || '';
                    const clienteLines = clienteRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    const cliente = clienteLines[0] || '';
                    const docNum = cols[2]?.textContent?.trim() || '';
                    const direccion = cols[3]?.textContent?.trim() || '';
                    const recibidoPor = cols[4]?.textContent?.trim() || '';
                    const estado = cols[5]?.textContent?.trim() || '';
                    const imgEl = cols[6]?.querySelector('img');
                    const firmaSrc = imgEl ? imgEl.getAttribute('src') : null;

                    const rowHeight = 12.5; // Altura estándar para acomodar la firma digital

                    // Salto de página para entregas si supera el límite de página
                    if (currentY + rowHeight > pageHeight - 15) {
                        doc.addPage();
                        currentPage++;
                        currentY = drawHeader(currentPage);
                        currentY = drawTableHeaders(currentY);
                    }

                    doc.setDrawColor(241, 245, 249);
                    doc.line(marginX, currentY, marginX + contentWidth, currentY);

                    // 1. Hora
                    doc.setFont('Helvetica', 'normal');
                    doc.setFontSize(7.5);
                    doc.setTextColor(30, 41, 59);
                    doc.text(hora, marginX + 2, currentY + 7);

                    // 2. Cliente (max 52mm de ancho)
                    const splitClient = doc.splitTextToSize(cliente, 52);
                    doc.setFont('Helvetica', 'bold');
                    doc.text(splitClient[0], marginX + 16, currentY + 5.5);
                    if (clienteLines[1]) {
                        doc.setFont('Helvetica', 'normal');
                        doc.setFontSize(6.5);
                        doc.setTextColor(100, 116, 139);
                        doc.text(clienteLines[1], marginX + 16, currentY + 9.5);
                    }

                    // 3. N° Doc y Boleta asociada (Factura / Boleta / Devolución ajustado a 27mm max)
                    const docCellRaw = cols[2]?.textContent?.trim() || '';
                    const docLines = docCellRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    const primaryDocNum = docLines[0] || docNum;
                    const boletaLine = docLines.find(l => l.includes('Boleta:')) || '';

                    doc.setFont('Helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.setTextColor(15, 23, 42);
                    doc.text(primaryDocNum, marginX + 70, boletaLine ? currentY + 5.2 : currentY + 7);

                    if (boletaLine) {
                        doc.setFont('Helvetica', 'bold');
                        doc.setFontSize(6.2);
                        doc.setTextColor(2, 132, 199); // #0284c7 (Sky Blue)
                        const cleanBoleta = boletaLine.replace('📄', '').trim();
                        doc.text(cleanBoleta, marginX + 70, currentY + 9.5);
                    }

                    // 4. Dirección EMB (ancho 63mm max)
                    doc.setFont('Helvetica', 'normal');
                    doc.setFontSize(7);
                    doc.setTextColor(71, 85, 105);
                    const splitAddress = doc.splitTextToSize(direccion, 63);
                    doc.text(splitAddress[0] || '', marginX + 100, currentY + 5.5);
                    if (splitAddress[1]) {
                        doc.text(splitAddress[1], marginX + 100, currentY + 9);
                    }

                    // 5. Recibido Por (ancho 35mm max)
                    const splitRecibido = doc.splitTextToSize(recibidoPor || '-', 35);
                    doc.text(splitRecibido[0] || '-', marginX + 166, currentY + 7);

                    // 6. Color y Texto de Estado (ancho 22mm max)
                    if (estado.toLowerCase().includes('completo')) {
                        doc.setTextColor(5, 150, 105);
                    } else if (estado.toLowerCase().includes('no entregado')) {
                        doc.setTextColor(180, 83, 9); // ámbar #b45309
                    } else if (estado.toLowerCase().includes('incompleto')) {
                        doc.setTextColor(217, 119, 6);
                    } else {
                        doc.setTextColor(220, 38, 38);
                    }
                    doc.setFont('Helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.text(estado, marginX + 204, currentY + 7);

                    // 7. Renderizado de Firma Digital en Recuadro Uniforme
                    const sigBoxX = marginX + 228;
                    const sigBoxY = currentY + 1.2;
                    const sigBoxW = 24;
                    const sigBoxH = 10;

                    doc.setDrawColor(203, 213, 225);
                    doc.setFillColor(255, 255, 255);
                    doc.roundedRect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 1, 1, 'FD');

                    if (firmaSrc && firmaSrc.startsWith('data:image')) {
                        try {
                            doc.addImage(firmaSrc, 'PNG', sigBoxX + 1, sigBoxY + 0.8, sigBoxW - 2, sigBoxH - 1.6);
                        } catch (imgErr) {
                            console.warn("No se pudo insertar la firma en PDF", imgErr);
                            doc.setFont('Helvetica', 'italic');
                            doc.setFontSize(5.5);
                            doc.setTextColor(148, 163, 184);
                            doc.text("Firma Registrada", sigBoxX + 2, sigBoxY + 5.5);
                        }
                    } else {
                        doc.setFont('Helvetica', 'italic');
                        doc.setFontSize(5.5);
                        doc.setTextColor(148, 163, 184);
                        doc.text("Sin Firma Digital", sigBoxX + 2.5, sigBoxY + 5.5);
                    }

                    currentY += rowHeight;
                }
            });
        }

        // Helper para renderizar el Bloque Estándar de Firmas de Cierre en cualquier página
        const drawSignaturesBlock = (startY: number) => {
            const sigColW = contentWidth * 0.42;
            const sigColSpacing = contentWidth * 0.16;

            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.4);
            // Línea firma chofer
            doc.line(marginX + 10, startY + 12, marginX + 10 + sigColW, startY + 12);
            // Línea firma logística
            doc.line(marginX + 10 + sigColW + sigColSpacing, startY + 12, marginX + contentWidth - 10, startY + 12);

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(51, 65, 85);
            doc.text("FIRMA CHOFER / TRANSPORTISTA", marginX + 10 + (sigColW / 2) - 26, startY + 17);
            doc.text("RECIBIDO / VERIFICADO LOGÍSTICA", marginX + 10 + sigColW + sigColSpacing + (sigColW / 2) - 26, startY + 17);

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text(previewDoc.chofer_nombre || 'Transportista', marginX + 10 + (sigColW / 2) - 15, startY + 22);
            doc.text("Firma de Conforme", marginX + 10 + sigColW + sigColSpacing + (sigColW / 2) - 15, startY + 22);
        };

        // Renderizar firmas de cierre al final de la Hoja 1
        const page1SigY = Math.min(currentY + 6, pageHeight - 35);
        drawSignaturesBlock(page1SigY);

        // PÁGINA 2 OBLIGATORIA: ANEXO DE LIMPIEZA E INSPECCIÓN DE VEHÍCULOS ISO 9001
        doc.addPage();
        currentPage++;
        let finalPageY = drawHeader(currentPage);

        // Título de sección de Control de Calidad
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(marginX, finalPageY, contentWidth, 7, 1, 1, 'F');
        doc.setFillColor(29, 78, 216); // Azul acento #1d4ed8
        doc.rect(marginX, finalPageY, 2.5, 7, 'F');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 58, 138); // #1e3a8a
        doc.text("ANEXO: CONTROL DE CALIDAD E INSPECCIÓN PRE-OPERACIONAL DEL VEHÍCULO", marginX + 6, finalPageY + 4.8);

        finalPageY += 10;

        // Tabla de Checklist ISO 9001
        const isoTableW = contentWidth;
        const col1W = 210;

        // Cabecera de la tabla ISO
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(marginX, finalPageY, isoTableW, 7, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text("LIMPIEZA E INSPECCIÓN DE VEHÍCULOS (X) - CONTROL DE CALIDAD ISO 9001", marginX + 4, finalPageY + 4.8);
        doc.text("ESTADO", marginX + col1W + 8, finalPageY + 4.8);
        finalPageY += 7;

        const checklistItems = [
            { item: "* Pisos libres de humedad:", val: "SI" },
            { item: "* Pisos y esquinas libres de residuos:", val: "SI" },
            { item: "* Libre de plagas o insectos:", val: "SI" },
            { item: "* Paredes y puertas libres de humedad o suciedad:", val: "SI" },
            { item: "* Cabina libre de suciedad o basura:", val: "SI" },
            { item: "* Nivel de combustible:", val: "Revisado" }
        ];

        doc.setDrawColor(203, 213, 225);
        doc.setFontSize(7.5);

        checklistItems.forEach((chk, idx) => {
            // Fondo alterno
            if (idx % 2 === 1) {
                doc.setFillColor(248, 250, 252);
                doc.rect(marginX, finalPageY, isoTableW, 7, 'F');
            }
            doc.line(marginX, finalPageY + 7, marginX + isoTableW, finalPageY + 7);
            doc.line(marginX + col1W, finalPageY, marginX + col1W, finalPageY + 7);

            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(30, 41, 59);
            doc.text(chk.item, marginX + 4, finalPageY + 4.8);

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(chk.val, marginX + col1W + 10, finalPageY + 4.8);

            finalPageY += 7;
        });

        // Fila de Responsable de Inspección
        doc.setFillColor(241, 245, 249);
        doc.rect(marginX, finalPageY, isoTableW, 7.5, 'F');
        doc.line(marginX, finalPageY + 7.5, marginX + isoTableW, finalPageY + 7.5);
        doc.line(marginX + col1W, finalPageY, marginX + col1W, finalPageY + 7.5);

        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Realizado por: ${previewDoc.chofer_nombre || 'Chofer Asignado'}`, marginX + 4, finalPageY + 5);

        doc.setTextColor(71, 85, 105);
        doc.text("CONFORME", marginX + col1W + 7, finalPageY + 5);
        finalPageY += 10;

        // Renderizar firmas de cierre en Hoja 2
        drawSignaturesBlock(finalPageY);

        // Pie de página ISO 9001
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text("Documento de control logístico emitido bajo las directrices del Sistema de Gestión de Calidad ISO 9001:2015.", marginX + (contentWidth / 2) - 55, pageHeight - 10);

        // =========================================================================
        // SEGUNDA PASADA: ESTAMPAR 'Hoja X de Y' EN TODAS LAS PÁGINAS PARA TRAZABILIDAD
        // =========================================================================
        const totalPages = doc.getNumberOfPages();
        const badgeW = 98;
        const badgeX = pageWidth - marginX - badgeW;
        const badgeY = 9;

        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            // Cubrir zona de paginación previa para un renderizado nítido
            doc.setFillColor(239, 246, 255);
            doc.rect(badgeX + badgeW - 32, badgeY + 13, 29, 5, 'F');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(30, 64, 175);
            doc.text(`Hoja ${p} de ${totalPages}`, badgeX + badgeW - 24, badgeY + 16.5);
        }

        // Guardar archivo PDF
        doc.save(`hoja_de_ruta_${previewDoc.consecutivo}.pdf`);
        toast({
            title: 'PDF Descargado',
            description: `Hoja de ruta ${previewDoc.consecutivo} descargada (${totalPages} páginas con anexo ISO 9001 y trazabilidad).`,
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
                    <form onSubmit={handleApplyFilters} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
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

                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-muted-foreground">Buscar por Consecutivo</Label>
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder="Ej: RUT-000004..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 rounded-lg font-semibold"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-muted/50">
                            <Button type="button" variant="outline" onClick={handleResetFilters} className="rounded-xl font-bold h-9 text-xs px-4">
                                Limpiar Filtros
                            </Button>
                            <Button type="submit" disabled={loading} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 text-xs gap-1.5 px-5">
                                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                Buscar Hojas de Ruta
                            </Button>
                        </div>
                    </form>
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
                                {!hasSearched ? (
                                    <tr>
                                        <td colSpan={6} className="p-12 text-center text-muted-foreground">
                                            <Search className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                                            <p className="font-bold text-foreground text-sm">Búsqueda de Hojas de Ruta Bajo Demanda</p>
                                            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                                                Seleccione sus criterios de búsqueda (fechas, chofer, ruta o consecutivo) y presione el botón <strong>&quot;Buscar Hojas de Ruta&quot;</strong> para consultar los registros.
                                            </p>
                                        </td>
                                    </tr>
                                ) : routesReport.length === 0 ? (
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

                    {/* Pagination Footer Bar */}
                    <div className="p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/10 text-xs">
                        <div className="text-muted-foreground">
                            Mostrando <span className="font-bold text-foreground">{routesReport.length}</span> de <span className="font-bold text-foreground">{totalCount}</span> hojas de ruta. (Página <span className="font-bold text-indigo-600">{page}</span> de <span className="font-bold text-indigo-600">{totalPages}</span>)
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                                <span className="text-muted-foreground font-medium">Items por página:</span>
                                <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setPage(1); }}>
                                    <SelectTrigger className="h-8 w-16 text-xs font-bold">
                                        <SelectValue placeholder="15" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="15">15</SelectItem>
                                        <SelectItem value="25">25</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="100">100</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1 || loading}
                                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                                    className="h-8 text-xs font-bold"
                                >
                                    ◀ Anterior
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= totalPages || loading}
                                    onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                                    className="h-8 text-xs font-bold"
                                >
                                    Siguiente ▶
                                </Button>
                            </div>
                        </div>
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
                            onClick={handlePromptResendEmail}
                            disabled={loadingPreview || resendingEmail || loadingRecipients}
                            className="rounded-xl font-bold text-xs gap-1.5"
                        >
                            <Mail className="w-4 h-4" />
                            {loadingRecipients ? 'Consultando...' : resendingEmail ? 'Reenviando...' : 'Reenviar Correo'}
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

            {/* Confirm Resend Email Dialog */}
            <AlertDialog open={isResendDialogOpen} onOpenChange={setIsResendDialogOpen}>
                <AlertDialogContent className="rounded-2xl border border-muted bg-background max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base font-extrabold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                            <Mail className="w-5 h-5 text-blue-600" />
                            ¿Reenviar Hoja de Ruta por Correo?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-muted-foreground pt-1">
                            Se enviará el reporte oficial de la hoja de ruta <strong>{previewDoc?.consecutivo}</strong> (Ruta: {previewDoc?.ruta_nombre}) en formato PDF/HTML a las siguientes direcciones configuradas:
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl p-3 my-2">
                        <span className="text-[11px] font-bold text-sky-800 dark:text-sky-300 block mb-1.5">
                            Destinatarios Registrados:
                        </span>
                        <ul className="space-y-1">
                            {targetRecipients.map((email, idx) => (
                                <li key={idx} className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                    {email}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel className="rounded-xl font-bold text-xs">
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmResendEmail}
                            className="rounded-xl font-black text-xs bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            Confirmar y Enviar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
