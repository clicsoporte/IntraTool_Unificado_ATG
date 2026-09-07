'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import { 
    Search, 
    Download, 
    ShieldCheck, 
    FileText, 
    Clock, 
    MapPin, 
    User, 
    Truck, 
    Calendar, 
    Camera, 
    CheckCircle2, 
    AlertTriangle, 
    XCircle, 
    ExternalLink, 
    Printer, 
    RefreshCw,
    Filter,
    ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import jsPDF from 'jspdf';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { searchDeliveryAuditLogs, exportDeliveryAuditLogsToCsv, getDeliveryDocumentDetail, AuditFilterParams } from '@/modules/operations/lib/audit-actions';
import { EvidencePhotoViewer, SelectedPhoto } from '@/modules/operations/components/EvidencePhotoViewer';
import { getBoletaThermalPrintHtml, sendBoletaManualEmail } from '@/modules/operations/lib/actions';
import { parsePhotoUrls } from '@/modules/operations/lib/utils';

export default function LogisticsAuditPage() {
    const { toast } = useToast();
    const { isAuthorized, isLoading: authLoading } = useAuthorization(['deliveries:audit:read', 'deliveries:admin']);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [results, setResults] = useState<any[]>([]);

    // Thermal Print & Email Modals
    const [thermalHtml, setThermalHtml] = useState<string | null>(null);
    const [thermalOpen, setThermalOpen] = useState(false);
    const [emailModalDoc, setEmailModalDoc] = useState<any | null>(null);
    const [targetEmail, setTargetEmail] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    
    // Pagination State
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(25);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [totalCount, setTotalCount] = useState<number>(0);

    // Filter State
    const [filters, setFilters] = useState<AuditFilterParams>({
        documentoNumero: '',
        fechaDesde: '',
        fechaHasta: '',
        clienteNombre: '',
        choferNombre: '',
        vehiculoPlaca: '',
        estado: 'procesados'
    });

    // Expediente Modal State
    const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
    const [expedienteOpen, setExpedienteOpen] = useState(false);
    const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = useCallback(async (targetPage = page, targetSize = pageSize) => {
        setLoading(true);
        setHasSearched(true);
        try {
            const res = await searchDeliveryAuditLogs({
                ...filters,
                page: targetPage,
                pageSize: targetSize
            });
            if (res.success && res.data) {
                setResults(res.data);
                setTotalPages(res.totalPages || 1);
                setTotalCount(res.totalCount || 0);
            } else {
                toast({ variant: 'destructive', title: 'Error de búsqueda', description: res.error || 'No se pudieron cargar los registros.' });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setLoading(false);
        }
    }, [filters, page, pageSize, toast]);

    // Pagination change trigger (only after initial explicit search)
    useEffect(() => {
        if (hasSearched) {
            handleSearch(page, pageSize);
        }
    }, [page, pageSize, hasSearched, handleSearch]);

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            const res = await searchDeliveryAuditLogs({ ...filters, page: 1, pageSize: 10000 });
            if (res.success && res.data) {
                const headers = [
                    'Documento',
                    'Tipo Documento',
                    'Estado',
                    'Fecha Factura ERP',
                    'Fecha Asignación Ruta',
                    'Fecha Entrega Efectiva',
                    'Fecha Registro Cola',
                    'Fecha Promesa ERP',
                    'Cliente ID',
                    'Nombre Cliente',
                    'Chofer',
                    'Vehículo / Placa',
                    'Ruta',
                    'Vendedor ERP',
                    'Creador ERP',
                    'Hora Arribo Bodega',
                    'Hora Entrega Efectiva',
                    'Hora Salida Bodega',
                    'Minutos Descarga',
                    'Minutos Espera',
                    'Minutos Permanencia Total',
                    'Evidencias (Fotos)',
                    'Tiene Foto Factura',
                    'Tiene Foto Paquetes',
                    'Observación o Comentario de Calle',
                    'Dirección Embarque (EMB)',
                    'Coordenadas Lat/Lng'
                ];

                const excelRows = res.data.map(item => {
                    const hasPhotos = item.foto_factura || item.foto_evidencia ? 'Sí' : 'No';
                    const vehiculoStr = item.vehiculo_placa ? `${item.vehiculo_marca || ''} (${item.vehiculo_placa})` : '';
                    const direccionStr = item.direccion_embarque_erp || item.cliente_direccion || item.direccion_factura_erp || '';

                    return [
                        item.documento_numero || '',
                        item.tipo_documento || '',
                        item.estado || '',
                        item.fecha_factura_erp || '',
                        item.fecha_asignacion_ruta || item.asignacion_fecha || '',
                        item.hora_entrega_efectiva || item.fecha_entrega || '',
                        item.fecha_registro || '',
                        item.fecha_promesa_erp || '',
                        item.cliente_id || '',
                        item.cliente_nombre || '',
                        item.chofer_nombre || 'No asignado',
                        vehiculoStr,
                        item.ruta_nombre || '',
                        item.vendedor || '',
                        item.creado_por || '',
                        item.hora_ingreso_geocerca || '',
                        item.hora_entrega_efectiva || item.fecha_entrega || '',
                        item.hora_salida_geocerca || '',
                        item.tiempo_descarga_min || 0,
                        item.tiempo_espera_post_entrega_min || 0,
                        item.tiempo_total_permanencia_min || 0,
                        hasPhotos,
                        item.foto_factura ? 'Sí' : 'No',
                        item.foto_evidencia ? 'Sí' : 'No',
                        item.comentario || '',
                        direccionStr,
                        item.latitud && item.longitud ? `${item.latitud},${item.longitud}` : ''
                    ];
                });

                exportToExcel({
                    fileName: 'Reporte_Auditoria_Entregas',
                    sheetName: 'Auditoría Entregas',
                    headers,
                    data: excelRows
                });

                toast({ title: 'Exportación Exitosa (.xlsx)', description: `Se descargó el libro de Excel con ${res.data.length} registros.` });
            } else {
                toast({ variant: 'destructive', title: 'Error al Exportar', description: res.error || 'No se pudo generar el archivo Excel.' });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setExporting(false);
        }
    };

    const handleOpenExpediente = (doc: any) => {
        setSelectedDoc(doc);
        setExpedienteOpen(true);
    };

    const handlePrintThermalReceipt = async (docId: number) => {
        try {
            const res = await getBoletaThermalPrintHtml(docId);
            if (res.success && res.html) {
                setThermalHtml(res.html);
                setThermalOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Error de Formato', description: res.error || 'No se pudo generar la boleta.' });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    const handleDownloadThermalPdf = async (docTarget: any) => {
        if (!docTarget) return;
        try {
            // Obtener datos detallados con líneas de productos y datos fiscales de la empresa
            const detailRes = await getDeliveryDocumentDetail(docTarget.id);
            const docData = detailRes.success && detailRes.data?.doc ? detailRes.data.doc : docTarget;
            const docLines = detailRes.success && detailRes.data?.lines ? detailRes.data.lines : [];
            const company = detailRes.success && detailRes.data?.company ? detailRes.data.company : null;

            // Formato de rollo: 80mm de ancho con altura dinámica calculada
            const widthMm = 80;
            const marginX = 4;
            const printableWidth = widthMm - (marginX * 2); // 72mm

            // Cálculo dinámico de altura en base a líneas de productos y notas
            let estimatedHeight = 190 + (docLines.length * 10);
            if (docData.comentario) estimatedHeight += 15;
            if (docData.cliente_direccion) estimatedHeight += 12;

            const doc = new jsPDF({ 
                orientation: 'portrait', 
                unit: 'mm', 
                format: [widthMm, Math.max(220, estimatedHeight)] 
            });

            let currentY = 6;
            doc.setFont('courier', 'bold');
            doc.setFontSize(10.5);
            doc.setTextColor(0, 0, 0);
            
            // Encabezado Fiscal / Membrete
            const companyName = company?.name || 'INDUSTRIAS GAREND S.A';
            doc.text(companyName.toUpperCase(), widthMm / 2, currentY, { align: 'center' });
            currentY += 4;
            
            doc.setFontSize(7.5);
            doc.setFont('courier', 'normal');
            if (company?.taxId) {
                doc.text(`Cedula Juridica: ${company.taxId}`, widthMm / 2, currentY, { align: 'center' });
                currentY += 3.5;
            }
            if (company?.address) {
                const addrLines = doc.splitTextToSize(company.address, printableWidth);
                doc.text(addrLines, widthMm / 2, currentY, { align: 'center' });
                currentY += (addrLines.length * 3.2);
            }
            if (company?.phone || company?.email) {
                doc.text(`${company?.phone || ''} | ${company?.email || ''}`.trim(), widthMm / 2, currentY, { align: 'center' });
                currentY += 3.5;
            }

            doc.setFontSize(8.5);
            doc.setFont('courier', 'bold');
            doc.text("Boleta de Entrega (80mm)", widthMm / 2, currentY, { align: 'center' });
            currentY += 3.8;

            doc.setDrawColor(0, 0, 0);
            doc.setLineDashPattern([1, 1], 0);
            doc.line(marginX, currentY, widthMm - marginX, currentY);
            currentY += 4;

            // Información del Documento
            doc.setFontSize(7.5);
            doc.setFont('courier', 'normal');
            doc.text(`Boleta: #${docData.boleta_numero || docData.documento_numero}`, marginX, currentY);
            currentY += 3.5;
            doc.text(`Doc ERP: #${docData.documento_numero}`, marginX, currentY);
            currentY += 3.5;
            doc.text(`Estado: [ ${docData.estado?.toUpperCase() || 'COMPLETO'} ]`, marginX, currentY);
            currentY += 3.5;
            doc.text(`Fecha: ${docData.fecha_entrega ? docData.fecha_entrega.replace('T', ' ').slice(0, 16) : new Date().toLocaleString('es-CR')}`, marginX, currentY);
            currentY += 3.5;
            doc.text(`Ruta: ${docData.ruta_nombre || 'Sin Asignar'}`, marginX, currentY);
            currentY += 3.5;
            doc.text(`Camion: ${docData.vehiculo_marca || ''} ${docData.vehiculo_placa ? `(${docData.vehiculo_placa})` : 'N/D'}`.trim(), marginX, currentY);
            currentY += 3.5;
            doc.text(`Chofer: ${docData.chofer_nombre || 'No asignado'}`, marginX, currentY);
            currentY += 4;

            doc.line(marginX, currentY, widthMm - marginX, currentY);
            currentY += 4;

            // Datos del Cliente
            doc.setFont('courier', 'bold');
            doc.text("CLIENTE:", marginX, currentY);
            currentY += 3.5;
            doc.setFont('courier', 'normal');
            doc.text(`Codigo: ${docData.cliente_id || 'N/D'}`, marginX, currentY);
            currentY += 3.5;
            const clientNameLines = doc.splitTextToSize(`Nombre: ${docData.cliente_nombre || docData.cliente_id || ''}`, printableWidth);
            doc.text(clientNameLines, marginX, currentY);
            currentY += (clientNameLines.length * 3.2);

            const direccionFinal = docData.direccion_embarque_erp || docData.direccion_factura_erp || docData.cliente_direccion;
            if (direccionFinal) {
                const dirLines = doc.splitTextToSize(`Destino (EMB): ${direccionFinal}`, printableWidth);
                doc.text(dirLines, marginX, currentY);
                currentY += (dirLines.length * 3.2);
            }
            currentY += 1;

            // Tabla de Artículos / Discrepancias / Faltantes
            if (docLines && docLines.length > 0) {
                doc.line(marginX, currentY, widthMm - marginX, currentY);
                currentY += 3.5;

                doc.setFont('courier', 'bold');
                doc.setFontSize(8);
                doc.text("DISCREPANCIAS / FALTANTES", widthMm / 2, currentY, { align: 'center' });
                currentY += 3.5;

                // Encabezados de Columna
                doc.setFontSize(7);
                doc.text("Cód", marginX, currentY);
                doc.text("Producto", marginX + 16, currentY);
                doc.text("Ped", marginX + 50, currentY, { align: 'right' });
                doc.text("Ent", marginX + 60, currentY, { align: 'right' });
                doc.text("Fal", marginX + 70, currentY, { align: 'right' });
                currentY += 2.5;

                doc.line(marginX, currentY, widthMm - marginX, currentY);
                currentY += 3.5;

                doc.setFont('courier', 'normal');
                for (const line of docLines) {
                    const codStr = String(line.codigo || '').substring(0, 7);
                    const descRaw = String(line.desc || line.codigo || '');
                    const descLines = doc.splitTextToSize(descRaw, 32);

                    doc.text(codStr, marginX, currentY);
                    doc.text(descLines, marginX + 16, currentY);
                    doc.text(String(line.pedida ?? 0), marginX + 50, currentY, { align: 'right' });
                    doc.text(String(line.entregada ?? 0), marginX + 60, currentY, { align: 'right' });
                    doc.text(String(line.faltante ?? 0), marginX + 70, currentY, { align: 'right' });

                    currentY += Math.max(descLines.length * 3.2, 4) + 1;
                }
            }

            // Observaciones / Notas
            if (docData.comentario) {
                doc.line(marginX, currentY, widthMm - marginX, currentY);
                currentY += 3.5;
                const commLines = doc.splitTextToSize(`Notas: ${docData.comentario}`, printableWidth);
                doc.text(commLines, marginX, currentY);
                currentY += (commLines.length * 3.2) + 1;
            }

            doc.line(marginX, currentY, widthMm - marginX, currentY);
            currentY += 4.5;

            // Recibido y Firma Digital
            doc.setFont('courier', 'bold');
            doc.setFontSize(7.5);
            doc.text(`Recibido Por: ${docData.nombre_recibe || '___________________'}`, marginX, currentY);
            currentY += 3.8;
            doc.text("Firma Digital del Cliente:", marginX, currentY);
            currentY += 2;

            if (docData.firma_cliente) {
                try {
                    let sigBase64 = docData.firma_cliente;
                    if (!sigBase64.startsWith('data:image/')) {
                        const sigUrl = sigBase64.startsWith('http') ? sigBase64 : `/api/fleet/files/${sigBase64}`;
                        const resp = await fetch(sigUrl);
                        const blob = await resp.blob();
                        sigBase64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });
                    }
                    if (sigBase64 && sigBase64.startsWith('data:image/')) {
                        doc.addImage(sigBase64, 'PNG', marginX + 6, currentY, 60, 20);
                        currentY += 21;
                        doc.setFontSize(7);
                        doc.setFont('courier', 'bold');
                        doc.text("(Firma Digital Táctil)", widthMm / 2, currentY, { align: 'center' });
                        currentY += 3.5;
                    }
                } catch (_) {
                    currentY += 12;
                }
            } else {
                currentY += 8;
                doc.setFontSize(7.5);
                doc.text("__________________________________", widthMm / 2, currentY, { align: 'center' });
                currentY += 4;
            }

            doc.line(marginX, currentY, widthMm - marginX, currentY);
            currentY += 4;

            doc.setFontSize(7.5);
            doc.setFont('courier', 'bold');
            doc.text("¡Gracias por preferirnos!", widthMm / 2, currentY, { align: 'center' });
            currentY += 3.5;

            if (docData.latitud && docData.longitud) {
                doc.setFontSize(6);
                doc.setFont('courier', 'normal');
                doc.text(`GPS: Lat ${docData.latitud}, Lng ${docData.longitud}`, widthMm / 2, currentY, { align: 'center' });
                currentY += 3;
            }

            doc.save(`Boleta_Termica_80mm_${docData.documento_numero}.pdf`);
            toast({ title: 'PDF Térmico 80mm Descargado', description: `Se descargó la boleta térmica #${docData.documento_numero}.pdf con desglose de artículos y firma.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el PDF térmico.' });
        }
    };

    const handleSendEmailSubmit = async () => {
        if (!emailModalDoc || !targetEmail.trim()) return;
        setSendingEmail(true);
        try {
            const res = await sendBoletaManualEmail(emailModalDoc.id, targetEmail.trim());
            if (res.success) {
                toast({ title: 'Correo Enviado', description: `Se envió la boleta de entrega a ${targetEmail.trim()}` });
                setEmailModalDoc(null);
                setTargetEmail('');
            } else {
                toast({ variant: 'destructive', title: 'Error al Enviar', description: res.error });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setSendingEmail(false);
        }
    };

    const handleDownloadExpedientePdf = async (docTarget: any) => {
        if (!docTarget) return;
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
            const marginX = 14;
            let currentY = 15;

            // Banner Header
            doc.setFillColor(30, 58, 138); // Deep Blue
            doc.rect(marginX, currentY, 188, 16, 'F');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(255, 255, 255);
            doc.text("EXPEDIENTE DIGITAL DE EVIDENCIA DE ENTREGA", marginX + 6, currentY + 10.5);

            currentY += 22;

            // Doc Ref & State
            doc.setFontSize(10.5);
            doc.setTextColor(15, 23, 42);
            doc.text(`Documento / Factura N°: ${docTarget.documento_numero || 'N/A'}`, marginX, currentY);
            doc.text(`Estado: ${docTarget.estado?.toUpperCase() || 'PENDIENTE'}`, marginX + 130, currentY);

            currentY += 6;
            doc.setDrawColor(226, 232, 240);
            doc.line(marginX, currentY, marginX + 188, currentY);
            currentY += 6;

            // Details Table Box
            doc.setFillColor(248, 250, 252);
            doc.rect(marginX, currentY, 188, 38, 'F');
            doc.setDrawColor(203, 213, 225);
            doc.rect(marginX, currentY, 188, 38, 'S');

            doc.setFontSize(9);
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(71, 85, 105);

            doc.text("Cliente / Razón Social:", marginX + 4, currentY + 7);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(15, 23, 42);
            doc.text(`${docTarget.cliente_nombre || docTarget.cliente_id}`, marginX + 45, currentY + 7);

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(71, 85, 105);
            doc.text("Dirección (EMB):", marginX + 4, currentY + 14);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(15, 23, 42);
            const dirTruncated = (docTarget.cliente_direccion || 'Sin dirección').slice(0, 70);
            doc.text(dirTruncated, marginX + 45, currentY + 14);

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(71, 85, 105);
            doc.text("Chofer Asignado:", marginX + 4, currentY + 21);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(15, 23, 42);
            doc.text(`${docTarget.chofer_nombre || 'No asignado'}`, marginX + 45, currentY + 21);

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(71, 85, 105);
            doc.text("Vehículo / Placa:", marginX + 4, currentY + 28);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(15, 23, 42);
            doc.text(`${docTarget.vehiculo_marca || ''} (${docTarget.vehiculo_placa || 'N/A'})`, marginX + 45, currentY + 28);

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(71, 85, 105);
            doc.text("Vendedor / Creador ERP:", marginX + 4, currentY + 35);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(15, 23, 42);
            doc.text(`${docTarget.vendedor || 'N/A'} / ${docTarget.creado_por || 'N/A'}`, marginX + 45, currentY + 35);

            currentY += 44;

            // Timeline Box
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(30, 58, 138);
            doc.text("CRONOLOGÍA DE TIEMPOS Y GEOCERCA GPS", marginX, currentY);
            currentY += 5;

            doc.setFillColor(241, 245, 249);
            doc.rect(marginX, currentY, 188, 18, 'F');
            doc.setFontSize(8.5);

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(37, 99, 235);
            doc.text("1. Arribo Geocerca Bodega", marginX + 4, currentY + 6);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(15, 23, 42);
            doc.text(docTarget.hora_ingreso_geocerca ? docTarget.hora_ingreso_geocerca.replace('T', ' ').slice(0, 19) : 'Sin Arribo', marginX + 4, currentY + 12);

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(16, 185, 129);
            doc.text("2. Entrega Efectiva (Firma)", marginX + 68, currentY + 6);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(15, 23, 42);
            doc.text(docTarget.hora_entrega_efectiva ? docTarget.hora_entrega_efectiva.replace('T', ' ').slice(0, 19) : (docTarget.fecha_entrega || 'N/A'), marginX + 68, currentY + 12);

            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(147, 51, 234);
            doc.text("3. Salida de Bodega Cliente", marginX + 132, currentY + 6);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(15, 23, 42);
            doc.text(docTarget.hora_salida_geocerca ? docTarget.hora_salida_geocerca.replace('T', ' ').slice(0, 19) : 'En sitio / N/A', marginX + 132, currentY + 12);

            currentY += 24;

            // GPS Box
            if (docTarget.latitud && docTarget.longitud) {
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${docTarget.latitud},${docTarget.longitud}`;
                doc.setFillColor(236, 253, 245);
                doc.rect(marginX, currentY, 188, 10, 'F');
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(4, 120, 87);
                doc.text(`Ubicacion GPS: Lat ${docTarget.latitud}, Lng ${docTarget.longitud} (Abrir en Google Maps)`, marginX + 4, currentY + 6.5);
                doc.link(marginX + 4, currentY + 1, 180, 8, { url: mapsUrl });
                currentY += 14;
            }

            // Comment Box
            if (docTarget.comentario) {
                doc.setFillColor(254, 243, 199);
                doc.rect(marginX, currentY, 188, 12, 'F');
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(180, 83, 9);
                doc.text("Observacion de Calle:", marginX + 4, currentY + 5);
                doc.setFont('Helvetica', 'italic');
                doc.setTextColor(146, 64, 14);
                doc.text(`"${docTarget.comentario.slice(0, 95)}"`, marginX + 40, currentY + 5);
                currentY += 16;
            }

            // Signature & Receiver Box in PDF
            doc.setFillColor(248, 250, 252);
            doc.rect(marginX, currentY, 188, 32, 'F');
            doc.setDrawColor(203, 213, 225);
            doc.rect(marginX, currentY, 188, 32, 'S');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(30, 58, 138);
            doc.text("FIRMA Y RECEPTOR DE LA ENTREGA", marginX + 4, currentY + 6);

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text(`Recibido Por: ${docTarget.nombre_recibe || 'Sin registrar'}`, marginX + 4, currentY + 14);

            if (docTarget.firma_cliente) {
                try {
                    let sigBase64 = docTarget.firma_cliente;
                    if (!sigBase64.startsWith('data:image/')) {
                        const sigUrl = sigBase64.startsWith('http') ? sigBase64 : `/api/fleet/files/${sigBase64}`;
                        const resp = await fetch(sigUrl);
                        const blob = await resp.blob();
                        sigBase64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });
                    }
                    if (sigBase64 && sigBase64.startsWith('data:image/')) {
                        doc.addImage(sigBase64, 'PNG', marginX + 110, currentY + 4, 70, 24);
                    }
                } catch (_) {}
            }

            // Footer Notice
            currentY = 250;
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(`Documento generado automaticamente por Clic-Tools - Fecha: ${new Date().toLocaleString('es-CR')}`, marginX, currentY);
            doc.text("Este expediente digital sirve como comprobante oficial de entrega y trazabilidad satelital GPS.", marginX, currentY + 4);

            doc.save(`Expediente_Entrega_${docTarget.documento_numero}.pdf`);
            toast({ title: 'PDF Generado', description: `Se descargó el expediente #${docTarget.documento_numero}.pdf` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error PDF', description: 'No se pudo generar el expediente en PDF.' });
        }
    };

    if (!authLoading && !isAuthorized) {
        return (
            <div className="p-8 max-w-md mx-auto my-12 bg-card border border-rose-200 rounded-3xl text-center space-y-4 shadow-lg">
                <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl w-fit mx-auto border border-rose-200">
                    <ShieldAlert className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-bold text-rose-800">Acceso Restringido</h2>
                    <p className="text-xs text-muted-foreground font-medium">
                        No posees el permiso <code className="text-amber-600 font-mono">deliveries:audit:read</code> para acceder al Centro de Auditoría y Evidencias.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 w-full max-w-[1750px] mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <ShieldCheck className="h-7 w-7 text-indigo-600" />
                        Centro de Auditoría & Evidencias 360°
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Búsqueda avanzada de entregas, expediente digital de fotos/GPS y exportación a Excel para supervisores.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleExportExcel}
                        disabled={exporting || results.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5"
                    >
                        <Download className="w-4 h-4" />
                        {exporting ? 'Generando Excel...' : 'Exportar a Excel (.csv)'}
                    </Button>
                    <Link
                        href="/dashboard/operations/logistics"
                        className="inline-flex items-center justify-center rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                    >
                        ⬅ Volver a Logística
                    </Link>
                </div>
            </div>

            {/* Multicriteria Search Form */}
            <Card className="shadow-sm border border-muted">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Filter className="w-4 h-4 text-indigo-600" />
                        Filtros de Búsqueda Multicriterio
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Combine cualquier criterio de factura, cliente, chofer, placa o rango de fechas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {/* Factura / Documento */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Factura / Documento</Label>
                            <Input
                                placeholder="Ej: FAC-84920"
                                value={filters.documentoNumero}
                                onChange={(e) => setFilters(prev => ({ ...prev, documentoNumero: e.target.value }))}
                                className="h-9 text-xs"
                            />
                        </div>

                        {/* Cliente */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Cliente / Razón Social</Label>
                            <Input
                                placeholder="Ej: El Ángel / Auto Mercado"
                                value={filters.clienteNombre}
                                onChange={(e) => setFilters(prev => ({ ...prev, clienteNombre: e.target.value }))}
                                className="h-9 text-xs"
                            />
                        </div>

                        {/* Chofer */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Chofer</Label>
                            <Input
                                placeholder="Nombre del chofer"
                                value={filters.choferNombre}
                                onChange={(e) => setFilters(prev => ({ ...prev, choferNombre: e.target.value }))}
                                className="h-9 text-xs"
                            />
                        </div>

                        {/* Placa Camión */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Placa Vehículo</Label>
                            <Input
                                placeholder="Ej: CL-2231"
                                value={filters.vehiculoPlaca}
                                onChange={(e) => setFilters(prev => ({ ...prev, vehiculoPlaca: e.target.value }))}
                                className="h-9 text-xs font-mono uppercase"
                            />
                        </div>

                        {/* Fecha Desde */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Fecha Desde</Label>
                            <Input
                                type="date"
                                value={filters.fechaDesde}
                                onChange={(e) => setFilters(prev => ({ ...prev, fechaDesde: e.target.value }))}
                                className="h-9 text-xs"
                            />
                        </div>

                        {/* Fecha Hasta */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Fecha Hasta</Label>
                            <Input
                                type="date"
                                value={filters.fechaHasta}
                                onChange={(e) => setFilters(prev => ({ ...prev, fechaHasta: e.target.value }))}
                                className="h-9 text-xs"
                            />
                        </div>

                        {/* Estado */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Estado de Entrega</Label>
                            <Select
                                value={filters.estado}
                                onValueChange={(val) => setFilters(prev => ({ ...prev, estado: val }))}
                            >
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Solo Procesados (Por Defecto)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="procesados">⚡ Solo Procesados (Excluir Pendientes)</SelectItem>
                                    <SelectItem value="completo">🟢 Completado</SelectItem>
                                    <SelectItem value="incompleto">⚠️ Incompleto / Parcial</SelectItem>
                                    <SelectItem value="rechazado">❌ Rechazado</SelectItem>
                                    <SelectItem value="descartado">🗑️ Descartado</SelectItem>
                                    <SelectItem value="todos">🌐 Todos (Incluir Pendientes en Cola)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Botón Buscar */}
                        <div className="flex items-end">
                            <Button
                                onClick={() => {
                                    setPage(1);
                                    handleSearch(1, pageSize);
                                }}
                                disabled={loading}
                                className="w-full h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5"
                            >
                                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                Buscar Entregas
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Results Table Card */}
            <Card className="shadow-sm border border-muted">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-base font-semibold">Resultados de Auditoría</CardTitle>
                        <CardDescription className="text-xs">
                            Se encontraron <span className="font-bold text-indigo-600">{results.length}</span> registros de entrega coincidentes.
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center p-12 animate-pulse">
                            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mr-3" />
                            <span className="text-sm font-semibold text-muted-foreground">Consultando base de datos de auditoría...</span>
                        </div>
                    ) : !hasSearched ? (
                        <div className="text-center py-12 px-4 space-y-3">
                            <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center mx-auto text-indigo-600">
                                <Search className="w-6 h-6" />
                            </div>
                            <h3 className="text-sm font-bold text-foreground">Búsqueda de Auditoría bajo demanda</h3>
                            <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                Seleccione el número de documento, cliente, chofer, placa o rango de fechas arriba y presione el botón <strong>&quot;Buscar Entregas&quot;</strong> para cargar los registros.
                            </p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="text-center py-12 text-sm text-muted-foreground italic">
                            No se encontraron entregas que coincidan con los filtros aplicados.
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b bg-muted/50 font-semibold uppercase text-muted-foreground">
                                            <th className="py-2.5 px-3">Documento</th>
                                            <th className="py-2.5 px-3">Estado</th>
                                            <th className="py-2.5 px-3">Cliente</th>
                                            <th className="py-2.5 px-3">Chofer / Camión</th>
                                            <th className="py-2.5 px-3">Fecha Factura ERP</th>
                                            <th className="py-2.5 px-3">Fecha / Hora Entrega</th>
                                            <th className="py-2.5 px-3 text-center">Tiempos</th>
                                            <th className="py-2.5 px-3">Nota Chofer</th>
                                            <th className="py-2.5 px-3 text-center">Evidencias</th>
                                            <th className="py-2.5 px-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((doc) => (
                                            <tr key={doc.id} className="border-b hover:bg-muted/30 transition-colors">
                                                <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                                                    {doc.documento_numero}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    {doc.estado === 'completo' && <Badge variant="default" className="bg-emerald-500 text-white">🟢 Completado</Badge>}
                                                    {doc.estado === 'incompleto' && <Badge variant="default" className="bg-amber-500 text-white">⚠️ Incompleto</Badge>}
                                                    {doc.estado === 'rechazado' && <Badge variant="destructive">❌ Rechazado</Badge>}
                                                    {doc.estado === 'descartado' && <Badge variant="outline" className="text-gray-500">🗑️ Descartado</Badge>}
                                                    {doc.estado === 'pendiente' && <Badge variant="outline" className="text-blue-500">⏳ Pendiente</Badge>}
                                                </td>
                                                <td className="py-2.5 px-3 font-medium">
                                                    <div>{doc.cliente_nombre || doc.cliente_id}</div>
                                                    <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{doc.cliente_direccion || 'Sin dirección'}</div>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <div className="font-semibold">{doc.chofer_nombre || 'No asignado'}</div>
                                                    <div className="text-[10px] text-muted-foreground font-mono">{doc.vehiculo_placa ? `${doc.vehiculo_marca || ''} (${doc.vehiculo_placa})` : '--'}</div>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <div className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                                                        {doc.fecha_factura_erp ? doc.fecha_factura_erp.slice(0, 10) : (doc.fecha_registro ? doc.fecha_registro.slice(0, 10) : '--')}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">Emisión ERP</div>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    {doc.hora_entrega_efectiva || doc.fecha_entrega ? (
                                                        <>
                                                            <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                                                                {(doc.hora_entrega_efectiva || doc.fecha_entrega).replace('T', ' ').slice(0, 16)}
                                                            </div>
                                                            <div className="text-[10px] text-blue-600 font-medium">
                                                                {doc.hora_ingreso_geocerca ? `Arribo: ${doc.hora_ingreso_geocerca.split('T')[1]?.slice(0,5)}` : 'Geocerca N/D'}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200 text-[10px]">
                                                            Pendiente de entrega
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                                                    {doc.tiempo_descarga_min ? (
                                                        <span className="font-bold text-blue-600">{doc.tiempo_descarga_min} min</span>
                                                    ) : (
                                                        <span className="text-muted-foreground">--</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 max-w-[200px]">
                                                    {doc.comentario ? (
                                                        <div className="text-[11px] text-slate-700 font-medium truncate" title={doc.comentario}>
                                                            💬 {doc.comentario}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 italic">Sin comentarios</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                     <div className="flex items-center justify-center gap-1 flex-wrap">
                                                         {doc.firma_cliente && (
                                                              <button
                                                                  type="button"
                                                                  onClick={() => {
                                                                      const urls = parsePhotoUrls(doc.firma_cliente);
                                                                      setSelectedPhoto({
                                                                          urls,
                                                                          url: urls[0],
                                                                          title: `Firma Digital - Documento #${doc.documento_numero}`
                                                                      });
                                                                  }}
                                                              >
                                                                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer hover:bg-emerald-100 transition-colors">✍️ Firma</Badge>
                                                              </button>
                                                          )}
                                                          {doc.foto_factura && (
                                                              <button
                                                                  type="button"
                                                                  onClick={() => {
                                                                      const urls = parsePhotoUrls(doc.foto_factura);
                                                                      setSelectedPhoto({
                                                                          urls,
                                                                          url: urls[0],
                                                                          title: `Foto Factura - Documento #${doc.documento_numero} ${urls.length > 1 ? `(${urls.length} fotos)` : ''}`
                                                                      });
                                                                  }}
                                                              >
                                                                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors">📷 Factura</Badge>
                                                              </button>
                                                          )}
                                                          {doc.foto_evidencia && (
                                                              <button
                                                                  type="button"
                                                                  onClick={() => {
                                                                      const urls = parsePhotoUrls(doc.foto_evidencia);
                                                                      setSelectedPhoto({
                                                                          urls,
                                                                          url: urls[0],
                                                                          title: `Foto Paquetes - Documento #${doc.documento_numero} ${urls.length > 1 ? `(${urls.length} fotos)` : ''}`
                                                                      });
                                                                  }}
                                                              >
                                                                  <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-600 border-purple-200 cursor-pointer hover:bg-purple-100 transition-colors">📦 Cajas</Badge>
                                                              </button>
                                                          )}
                                                         {!doc.firma_cliente && !doc.foto_factura && !doc.foto_evidencia && (
                                                             <span className="text-muted-foreground text-[10px] italic">Sin foto</span>
                                                         )}
                                                     </div>
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleOpenExpediente(doc)}
                                                        className="h-7 text-[11px] font-semibold gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                                    >
                                                        <FileText className="w-3 h-3" />
                                                        Expediente 360°
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Footer Bar */}
                            <div className="pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                                <div className="text-muted-foreground">
                                    Mostrando <span className="font-bold text-foreground">{results.length}</span> de <span className="font-bold text-foreground">{totalCount}</span> registros. (Página <span className="font-bold text-indigo-600">{page}</span> de <span className="font-bold text-indigo-600">{totalPages}</span>)
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground font-medium">Items por página:</span>
                                        <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setPage(1); }}>
                                            <SelectTrigger className="h-8 w-16 text-xs font-bold">
                                                <SelectValue placeholder="25" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="10">10</SelectItem>
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
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Expediente 360° Modal */}
            <Dialog open={expedienteOpen} onOpenChange={setExpedienteOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    {selectedDoc && (
                        <div className="space-y-6">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-bold flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                        <ShieldCheck className="w-6 h-6 text-indigo-600" />
                                        Expediente de Entrega: #{selectedDoc.documento_numero}
                                    </span>
                                    <Badge variant={selectedDoc.estado === 'completo' ? 'default' : 'destructive'}>
                                        {selectedDoc.estado.toUpperCase()}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription className="text-xs">
                                    Expediente completo de trazabilidad, evidencias fotográficas, timestamps de geocerca y coordenadas de entrega.
                                </DialogDescription>
                            </DialogHeader>

                            {/* Section 1: Data Summary */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-muted/40 p-3 rounded-xl border text-xs">
                                <div>
                                    <span className="text-muted-foreground font-semibold block">Cliente:</span>
                                    <span className="font-bold text-foreground">{selectedDoc.cliente_nombre || selectedDoc.cliente_id}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold block">Chofer:</span>
                                    <span className="font-bold text-foreground">{selectedDoc.chofer_nombre || 'No asignado'}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold block">Vehículo / Placa:</span>
                                    <span className="font-bold text-foreground font-mono">{selectedDoc.vehiculo_placa || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold block">Ruta:</span>
                                    <span className="font-bold text-foreground">{selectedDoc.ruta_nombre || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold block">Vendedor ERP:</span>
                                    <span className="font-bold text-foreground">{selectedDoc.vendedor || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground font-semibold block">Creador ERP:</span>
                                    <span className="font-bold text-foreground">{selectedDoc.creado_por || 'N/A'}</span>
                                </div>
                                <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg border">
                                    <span className="text-slate-600 dark:text-slate-400 font-semibold block text-[10px]">📅 Fecha Factura ERP</span>
                                    <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">{selectedDoc.fecha_factura_erp ? selectedDoc.fecha_factura_erp.slice(0, 10) : (selectedDoc.fecha_registro ? selectedDoc.fecha_registro.slice(0, 10) : 'N/A')}</span>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-950/30 p-2 rounded-lg border border-blue-200">
                                    <span className="text-blue-600 font-semibold block text-[10px]">🚛 Fecha Asignación Ruta</span>
                                    <span className="font-bold text-blue-900 dark:text-blue-100 font-mono">{selectedDoc.fecha_asignacion_ruta ? selectedDoc.fecha_asignacion_ruta.slice(0, 10) : (selectedDoc.asignacion_fecha ? selectedDoc.asignacion_fecha.slice(0, 10) : 'N/A')}</span>
                                </div>
                                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-lg border border-emerald-200">
                                    <span className="text-emerald-600 font-semibold block text-[10px]">✅ Fecha / Hora Entrega Efectiva</span>
                                    <span className="font-bold text-emerald-900 dark:text-emerald-100 font-mono">
                                        {selectedDoc.hora_entrega_efectiva ? selectedDoc.hora_entrega_efectiva.replace('T', ' ').slice(0, 16) : (selectedDoc.fecha_entrega ? selectedDoc.fecha_entrega.replace('T', ' ').slice(0, 16) : 'Pendiente de entrega')}
                                    </span>
                                </div>
                                {selectedDoc.nombre_recibe && (
                                    <div className="col-span-2 sm:col-span-3 bg-indigo-50/50 dark:bg-indigo-950/20 p-2 rounded-lg border border-indigo-100 dark:border-indigo-900">
                                        <span className="text-indigo-600 font-semibold block text-[10px] uppercase tracking-wider">✍️ Persona que Recibe en Destino:</span>
                                        <span className="font-extrabold text-sm text-indigo-950 dark:text-indigo-200">{selectedDoc.nombre_recibe}</span>
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Timestamps Timeline */}
                            <div className="space-y-2 border-l-2 border-indigo-500 pl-4 py-1 text-xs">
                                <h4 className="font-bold uppercase tracking-wider text-indigo-600 text-[11px]">⏱️ Cronología de Atención en Bodega Cliente</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                                    <div className="bg-blue-50 dark:bg-blue-950/30 p-2 rounded-lg border border-blue-200">
                                        <span className="text-blue-600 font-semibold block text-[10px]">1. Arribo a Geocerca</span>
                                        <span className="font-bold">{selectedDoc.hora_ingreso_geocerca ? selectedDoc.hora_ingreso_geocerca.replace('T', ' ').slice(0, 19) : 'No capturado'}</span>
                                    </div>
                                    <div className="bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-lg border border-emerald-200">
                                        <span className="text-emerald-600 font-semibold block text-[10px]">2. Entrega Efectiva (Firma)</span>
                                        <span className="font-bold">{selectedDoc.hora_entrega_efectiva ? selectedDoc.hora_entrega_efectiva.replace('T', ' ').slice(0, 19) : selectedDoc.fecha_entrega || 'N/A'}</span>
                                        {selectedDoc.tiempo_descarga_min && <span className="text-[10px] text-emerald-700 block mt-0.5">⏱️ Descarga: {selectedDoc.tiempo_descarga_min} min</span>}
                                    </div>
                                    <div className="bg-purple-50 dark:bg-purple-950/30 p-2 rounded-lg border border-purple-200">
                                        <span className="text-purple-600 font-semibold block text-[10px]">3. Salida de Bodega</span>
                                        <span className="font-bold">{selectedDoc.hora_salida_geocerca ? selectedDoc.hora_salida_geocerca.replace('T', ' ').slice(0, 19) : 'En sitio / N/A'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: GPS Coordinates & Maps */}
                            {selectedDoc.latitud && selectedDoc.longitud && (
                                <div className="flex items-center justify-between bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 p-3 rounded-xl border border-emerald-200 text-xs">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-5 h-5 text-emerald-600" />
                                        <div>
                                            <span className="font-bold block">Ubicación GPS de Descarga Confirmada:</span>
                                            <span className="font-mono text-[11px]">{selectedDoc.latitud}, {selectedDoc.longitud}</span>
                                        </div>
                                    </div>
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${selectedDoc.latitud},${selectedDoc.longitud}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline text-xs"
                                    >
                                        Abrir en Google Maps <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                            )}

                            {/* Section 4: Comment / Calle Notes */}
                            {selectedDoc.comentario && (
                                <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200 text-xs">
                                    <span className="font-bold text-amber-800 dark:text-amber-300 block mb-1">💬 Observación o Comentario de Calle:</span>
                                    <p className="italic text-amber-900 dark:text-amber-100">&quot;{selectedDoc.comentario}&quot;</p>
                                </div>
                            )}

                            {/* Section 5: Photos Evidence */}
                            <div className="space-y-2">
                                <h4 className="font-bold text-xs flex items-center gap-2">
                                    <Camera className="w-4 h-4 text-indigo-600" />
                                    Evidencias Fotográficas Adjuntas
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {/* Boleta Térmica Oficial 80mm con Firma Digital */}
                                    <div className="space-y-1 sm:col-span-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                                <Printer className="w-3.5 h-3.5" /> Boleta Digital Oficial (80mm):
                                            </span>
                                            <button 
                                                type="button"
                                                onClick={() => handlePrintThermalReceipt(selectedDoc.id)}
                                                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-bold flex items-center gap-0.5"
                                            >
                                                🔍 Ver / Imprimir
                                            </button>
                                        </div>
                                        <div 
                                            onClick={() => handlePrintThermalReceipt(selectedDoc.id)}
                                            className="bg-amber-500/[0.04] p-3 rounded-xl border border-amber-500/30 hover:border-amber-500 shadow-sm h-48 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group relative overflow-hidden text-left"
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between border-b border-amber-500/20 pb-1">
                                                    <span className="font-mono font-bold text-[10px] text-amber-900 dark:text-amber-200">
                                                        BOLETA #{selectedDoc.boleta_numero || selectedDoc.documento_numero}
                                                    </span>
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300">
                                                        80mm
                                                    </Badge>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground truncate">
                                                    <strong>Cliente:</strong> {selectedDoc.cliente_nombre || 'N/D'}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground truncate">
                                                    <strong>Chofer:</strong> {selectedDoc.chofer_nombre || 'No asignado'} ({selectedDoc.vehiculo_placa || '--'})
                                                </p>
                                                <p className="text-[10px] text-muted-foreground truncate">
                                                    <strong>Receptor:</strong> {selectedDoc.nombre_recibe || 'Registrado en ruta'}
                                                </p>
                                            </div>

                                            {/* Preview de la Firma Digital dentro del comprobante */}
                                            <div className="bg-white dark:bg-slate-900 rounded-lg p-1 border border-amber-500/20 flex flex-col items-center justify-center min-h-[50px] relative">
                                                {selectedDoc.firma_cliente ? (
                                                    <Image
                                                        src={selectedDoc.firma_cliente.startsWith('http') || selectedDoc.firma_cliente.startsWith('data:') ? selectedDoc.firma_cliente : `/api/fleet/files/${selectedDoc.firma_cliente}`}
                                                        alt="Firma Digital"
                                                        width={180}
                                                        height={50}
                                                        unoptimized
                                                        className="max-h-[44px] w-auto object-contain"
                                                    />
                                                ) : (
                                                    <span className="text-[9px] text-muted-foreground italic">Sin firma digital registrada</span>
                                                )}
                                                <span className="text-[8px] font-mono text-muted-foreground mt-0.5">
                                                    {selectedDoc.firma_cliente ? '✓ Firma Táctil Registrada' : 'Sin firma en pantalla'}
                                                </span>
                                            </div>

                                            <div className="absolute inset-0 bg-amber-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="bg-amber-600 text-white text-[11px] font-bold px-3 py-1 rounded-lg shadow-lg flex items-center gap-1">
                                                    <Printer className="w-3.5 h-3.5" /> Abrir Boleta 80mm
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {selectedDoc.foto_factura ? (() => {
                                        let invoicePhotos: string[] = [];
                                        const raw = selectedDoc.foto_factura.trim();
                                        if (raw.startsWith('[') && raw.endsWith(']')) {
                                            try {
                                                const parsed = JSON.parse(raw);
                                                if (Array.isArray(parsed)) {
                                                    invoicePhotos = parsed.map((item: string) => item.startsWith('http') || item.startsWith('data:') ? item : `/api/fleet/files/${item}`);
                                                }
                                            } catch (_) {}
                                        }
                                        if (invoicePhotos.length === 0) {
                                            invoicePhotos = [raw.startsWith('http') || raw.startsWith('data:') ? raw : `/api/fleet/files/${raw}`];
                                        }
                                        const firstPhoto = invoicePhotos[0];

                                        return (
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-semibold text-muted-foreground block flex items-center gap-1">
                                                        📄 Factura Firmada {invoicePhotos.length > 1 && (
                                                            <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-bold">
                                                                {invoicePhotos.length} Hojas
                                                            </Badge>
                                                        )}:
                                                    </span>
                                                    <span className="text-[10px] text-blue-600 font-medium">🔍 Ampliar / Hojas</span>
                                                </div>
                                                <div
                                                    onClick={() => setSelectedPhoto({
                                                        urls: invoicePhotos,
                                                        title: `Factura Firmada - Doc #${selectedDoc.documento_numero}`
                                                    })}
                                                    className="relative h-48 rounded-xl border border-slate-200 hover:border-blue-400 shadow-sm cursor-pointer transition-all hover:shadow-md group overflow-hidden bg-slate-900"
                                                >
                                                    <Image
                                                        src={firstPhoto}
                                                        alt="Foto Factura"
                                                        fill
                                                        unoptimized
                                                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                                                    />
                                                    {invoicePhotos.length > 1 && (
                                                        <div className="absolute top-2 right-2 bg-blue-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow">
                                                            1 de {invoicePhotos.length} hojas
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-blue-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <span className="bg-blue-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg shadow">Ver {invoicePhotos.length > 1 ? `${invoicePhotos.length} Hojas` : 'en Grande'} 🔍</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })() : (
                                        <div className="h-48 bg-muted/30 border border-dashed rounded-xl flex items-center justify-center text-xs text-muted-foreground italic">
                                            Sin foto de factura firmada.
                                        </div>
                                    )}

                                    {selectedDoc.foto_evidencia ? (() => {
                                        let evidencePhotos: string[] = [];
                                        const rawEv = String(selectedDoc.foto_evidencia).trim();
                                        if (rawEv.startsWith('[') && rawEv.endsWith(']')) {
                                            try {
                                                const parsed = JSON.parse(rawEv);
                                                if (Array.isArray(parsed)) {
                                                    evidencePhotos = parsed.map((item: string) => item.startsWith('http') || item.startsWith('data:') ? item : `/api/fleet/files/${item}`);
                                                }
                                            } catch (_) {}
                                        }
                                        if (evidencePhotos.length === 0) {
                                            evidencePhotos = [rawEv.startsWith('http') || rawEv.startsWith('data:') ? rawEv : `/api/fleet/files/${rawEv}`];
                                        }
                                        const firstEvPhoto = evidencePhotos[0];

                                        return (
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-semibold text-muted-foreground block flex items-center gap-1">
                                                        📦 Mercadería {evidencePhotos.length > 1 && (
                                                            <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-bold">
                                                                {evidencePhotos.length} Fotos
                                                            </Badge>
                                                        )}:
                                                    </span>
                                                    <span className="text-[10px] text-purple-600 font-medium">🔍 Ampliar / Galería</span>
                                                </div>
                                                <div
                                                    onClick={() => setSelectedPhoto({
                                                        urls: evidencePhotos,
                                                        title: `Mercadería Descargada - Doc #${selectedDoc.documento_numero}`
                                                    })}
                                                    className="relative h-48 rounded-xl border border-slate-200 hover:border-purple-400 shadow-sm cursor-pointer transition-all hover:shadow-md group overflow-hidden bg-slate-900"
                                                >
                                                    <Image
                                                        src={firstEvPhoto}
                                                        alt="Foto Mercadería"
                                                        fill
                                                        unoptimized
                                                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                                                    />
                                                    {evidencePhotos.length > 1 && (
                                                        <div className="absolute top-2 right-2 bg-purple-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow">
                                                            1 de {evidencePhotos.length} fotos
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-purple-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <span className="bg-purple-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg shadow">Ver {evidencePhotos.length > 1 ? `${evidencePhotos.length} Fotos` : 'en Grande'} 🔍</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })() : (
                                        <div className="h-48 bg-muted/30 border border-dashed rounded-xl flex items-center justify-center text-xs text-muted-foreground italic">
                                            Sin foto de mercadería.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <DialogFooter className="pt-4 border-t flex-wrap gap-2 justify-between">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                        variant="outline"
                                        onClick={() => handlePrintThermalReceipt(selectedDoc.id)}
                                        className="gap-1.5 text-xs text-amber-800 border-amber-300 hover:bg-amber-50 font-semibold"
                                    >
                                        <Printer className="w-4 h-4 text-amber-600" /> Reimprimir Boleta Térmica (80mm)
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setEmailModalDoc(selectedDoc);
                                            setTargetEmail('');
                                        }}
                                        className="gap-1.5 text-xs text-blue-700 border-blue-200 hover:bg-blue-50 font-semibold"
                                    >
                                        <FileText className="w-4 h-4 text-blue-600" /> Reenviar por Correo
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleDownloadExpedientePdf(selectedDoc)}
                                        className="gap-1.5 text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50 font-semibold"
                                    >
                                        <Download className="w-4 h-4 text-indigo-600" /> Descargar PDF Carta con Firma
                                    </Button>
                                </div>
                                <Button onClick={() => setExpedienteOpen(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">
                                    Cerrar Expediente
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Thermal Print Modal */}
            <Dialog open={thermalOpen} onOpenChange={setThermalOpen}>
                <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <Printer className="w-5 h-5 text-amber-600" /> Reimprimir Boleta de Entrega
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Vista previa del formato térmico oficial con firma digital del cliente y productos.
                        </DialogDescription>
                    </DialogHeader>

                    {thermalHtml && (
                        <div 
                            className="bg-white p-4 border rounded-xl shadow-inner text-black font-mono text-xs overflow-x-auto my-2 border-slate-300"
                            dangerouslySetInnerHTML={{ __html: thermalHtml }}
                        />
                    )}

                    <DialogFooter className="pt-3 border-t flex flex-wrap gap-2 justify-between items-center">
                        <Button 
                            variant="outline"
                            size="sm"
                            onClick={() => setThermalOpen(false)}
                            className="text-xs"
                        >
                            Cerrar
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadThermalPdf(selectedDoc)}
                                className="bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-bold text-xs gap-1.5 shadow-sm"
                            >
                                <Download className="w-4 h-4 text-emerald-600" /> Descargar PDF Térmico (80mm)
                            </Button>
                            <Button 
                                size="sm"
                                onClick={() => {
                                    const printWindow = window.open('', '_blank');
                                    if (printWindow && thermalHtml) {
                                        printWindow.document.write(`
                                            <html>
                                                <head>
                                                    <title>Boleta de Entrega</title>
                                                    <style>
                                                        body { font-family: monospace; padding: 10px; margin: 0; }
                                                        @media print { body { width: 80mm; } }
                                                    </style>
                                                </head>
                                                <body>${thermalHtml}</body>
                                            </html>
                                        `);
                                        printWindow.document.close();
                                        printWindow.focus();
                                        setTimeout(() => printWindow.print(), 300);
                                    }
                                }} 
                                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 shadow-sm"
                            >
                                <Printer className="w-4 h-4" /> Mandar a Imprimir
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Send Email Modal */}
            <Dialog open={!!emailModalDoc} onOpenChange={(open) => { if (!open) setEmailModalDoc(null); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" /> Reenviar Boleta por Correo
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Indica el correo electrónico del cliente para transmitir el comprobante oficial con la firma.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        <Label htmlFor="auditTargetEmail" className="text-xs font-semibold">Correo Electrónico Destino:</Label>
                        <Input
                            id="auditTargetEmail"
                            type="email"
                            placeholder="ejemplo@cliente.com"
                            value={targetEmail}
                            onChange={(e) => setTargetEmail(e.target.value)}
                            className="h-10 text-xs"
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setEmailModalDoc(null)}
                            disabled={sendingEmail}
                            className="text-xs"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSendEmailSubmit}
                            disabled={sendingEmail || !targetEmail.trim()}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5"
                        >
                            {sendingEmail ? 'Enviando...' : 'Enviar Correo'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* High-Resolution Evidence Photo Viewer Modal */}
            <EvidencePhotoViewer
                selectedPhoto={selectedPhoto}
                onClose={() => setSelectedPhoto(null)}
            />
        </div>
    );
}
