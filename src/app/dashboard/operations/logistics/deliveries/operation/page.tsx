'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
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
import { 
    RefreshCw, 
    User, 
    Truck, 
    Route, 
    Plus, 
    MapPin, 
    Send, 
    XOctagon, 
    ArrowRightLeft, 
    ChevronRight,
    Users,
    Search,
    CheckSquare,
    Trash2,
    AlertTriangle,
    Calendar,
    SlidersHorizontal,
    Settings2,
    ExternalLink,
    Filter
} from 'lucide-react';
import {
    getGeneralQueue,
    getAssignedDeliveriesToday,
    getActiveAssignmentsToday,
    getDrivers,
    getVehicles,
    getDeliveryRoutes,
    createAssignment,
    closeAssignment,
    assignDocumentsToRoute,
    reassignDocument,
    populateDeliveryQueueFromERP,
    autoRouteQueueToday,
    unlockDocumentTelegram,
    markDocumentsAsDeliveredBulkAction,
    purgeGeneralQueueBeforeDateAction,
    discardQueueDocument,
    sendBoletaManualEmail,
    getBoletaPreviewHtml,
    getClientEmails,
    saveClientEmail,
    unassignDocument,
    releasePendingDocuments
} from '@/modules/operations/lib/actions';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import jsPDF from 'jspdf';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { syncAllData } from '@/modules/core/lib/actions';
import { getLocalDateStr } from '@/modules/operations/lib/utils';


export default function OperationDispatchPage() {
    const { toast } = useToast();
    const { isAuthorized, isLoading: authLoading } = useAuthorization(['deliveries:write']);
    const { companyData } = useAuth();
    const [loading, setLoading] = useState(true);
    const [syncingERP, setSyncingERP] = useState(false);
    const [autoRouting, setAutoRouting] = useState(false);
    const [creatingAssignment, setCreatingAssignment] = useState(false);

    // Backend state
    const [queue, setQueue] = useState<any[]>([]);
    const [assignedDocs, setAssignedDocs] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [routes, setRoutes] = useState<any[]>([]);

    // Form inputs
    const [selectedRoute, setSelectedRoute] = useState<string>('');
    const [selectedDriver, setSelectedDriver] = useState<string>('');
    const [selectedVehicle, setSelectedVehicle] = useState<string>('');

    // Selection & filter state
    const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [destinationAssignment, setDestinationAssignment] = useState<string>('');
    const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(30); // Default 30s

    // Sync Date Slicing States (v2.3)
    const [syncFilterType, setSyncFilterType] = useState<'none' | 'days' | 'range'>('days');
    const [syncLookbackDays, setSyncLookbackDays] = useState<number>(5);
    const [syncStartDate, setSyncStartDate] = useState<string>('');
    const [syncEndDate, setSyncEndDate] = useState<string>('');
    const [omitCreditNotes, setOmitCreditNotes] = useState<boolean>(true);
    const [showOnlyCollect, setShowOnlyCollect] = useState<boolean>(false);
    const [showOnlyIncompleteWithBoleta, setShowOnlyIncompleteWithBoleta] = useState<boolean>(false);

    const [visibleCount, setVisibleCount] = useState<number>(100);

    useEffect(() => {
        setVisibleCount(100);
    }, [searchQuery, omitCreditNotes, showOnlyCollect, showOnlyIncompleteWithBoleta]);

    // Purging and bulk delivering states (v4.0)
    const [purgingDialogOpen, setPurgingDialogOpen] = useState<boolean>(false);
    const [purgeCutoffDate, setPurgeCutoffDate] = useState<string>(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return getLocalDateStr(yesterday);
    });
    const [processingPurge, setProcessingPurge] = useState<boolean>(false);
    const [processingBatchDeliver, setProcessingBatchDeliver] = useState<boolean>(false);

    // States for Boleta Modal and Discard Modal (Task 5)
    const [selectedBoletaDoc, setSelectedBoletaDoc] = useState<any>(null);
    const [selectedDiscardDoc, setSelectedDiscardDoc] = useState<any>(null);
    const [boletaHtml, setBoletaHtml] = useState<string>('');
    const [clientEmails, setClientEmails] = useState<string[]>([]);
    const [emailTarget, setEmailTarget] = useState<string>('');
    const [discardReason, setDiscardReason] = useState<string>('');
    const [sendingBoletaEmail, setSendingBoletaEmail] = useState<boolean>(false);
    const [discardingDoc, setDiscardingDoc] = useState<boolean>(false);

    // Responsive mobile view and sheet/dialog states
    const [mobileTab, setMobileTab] = useState<'queue' | 'routes'>('queue');
    const [mobileRouteModalOpen, setMobileRouteModalOpen] = useState<boolean>(false);
    const [mobileToolsSheetOpen, setMobileToolsSheetOpen] = useState<boolean>(false);

    // Dynamic confirmation dialog state (v4.1)
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void | Promise<void>;
        actionLabel?: string;
        cancelLabel?: string;
        isDestructive?: boolean;
    }>({
        isOpen: false,
        title: '',
        description: '',
        onConfirm: () => {},
    });



    // Silent background refresh
    const backgroundRefresh = React.useCallback(async () => {
        try {
            const [q, ad, a, d, v, r] = await Promise.all([
                getGeneralQueue(),
                getAssignedDeliveriesToday(),
                getActiveAssignmentsToday(),
                getDrivers(),
                getVehicles(),
                getDeliveryRoutes()
            ]);
            const newQueue = q || [];
            setQueue(newQueue);
            setSelectedDocIds(prev => {
                const validIds = new Set(newQueue.map((item: any) => item.id));
                return prev.filter(id => validIds.has(id));
            });
            setAssignedDocs(ad || []);
            setAssignments(a || []);
            setDrivers(d || []);
            setVehicles(v || []);
            setRoutes((r || []).filter(route => route.active === 1));
        } catch (e) {
            console.error('Silent background refresh failed:', e);
        }
    }, []);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                await backgroundRefresh();
            } catch (e: any) {
                toast({
                    title: 'Error de carga',
                    description: 'No se pudieron recuperar los datos operativos.',
                    variant: 'destructive'
                });
            } finally {
                setLoading(false);
            }
        }
        if (!authLoading && isAuthorized) {
            loadData();
        }
    }, [toast, backgroundRefresh, authLoading, isAuthorized]);

    // Timer effect for Auto-Refresh (Optimizado: refresca cada X segundos sin forzar re-render de 1s en toda la página)
    useEffect(() => {
        if (refreshIntervalSec === 0 || !isAuthorized) return;

        const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            backgroundRefresh();
        }, refreshIntervalSec * 1000);

        return () => clearInterval(timer);
    }, [refreshIntervalSec, backgroundRefresh, isAuthorized]);

    // Load Boleta Preview and Client Emails on selection
    useEffect(() => {
        if (!selectedBoletaDoc) {
            setBoletaHtml('');
            setClientEmails([]);
            setEmailTarget('');
            return;
        }

        async function loadBoletaData() {
            try {
                const [previewRes, emailsRes] = await Promise.all([
                    getBoletaPreviewHtml(selectedBoletaDoc.id),
                    getClientEmails(selectedBoletaDoc.cliente_id)
                ]);

                if (previewRes.success && previewRes.html) {
                    setBoletaHtml(previewRes.html);
                } else {
                    toast({
                        title: 'Error de plantilla',
                        description: previewRes.error || 'No se pudo generar el HTML de la boleta.',
                        variant: 'destructive'
                    });
                }

                if (emailsRes && emailsRes.length > 0) {
                    setClientEmails(emailsRes);
                    setEmailTarget(emailsRes[0]); // Autocomplete with first found email
                } else {
                    setEmailTarget('');
                }
            } catch (e: any) {
                console.error('Error loading boleta details:', e);
            }
        }

        loadBoletaData();
    }, [selectedBoletaDoc, toast]);

    const handleDownloadPdf = () => {
        if (!selectedBoletaDoc) return;

        const targetAssignmentId = selectedBoletaDoc.asignacion_id || selectedBoletaDoc.devolucion_asignacion_id;
        const assignment = assignments.find(a => a.id === targetAssignmentId);
        const routeName = assignment?.ruta_nombre || assignment?.name || 'Sin Asignar';
        const driverName = assignment?.chofer_nombre || assignment?.driver_name || 'Sin Asignar';

        const dateStr = new Date(selectedBoletaDoc.created_at || Date.now()).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
        
        let parsedDetails: any = {};
        if (selectedBoletaDoc.comentario) {
            try {
                const parsed = JSON.parse(selectedBoletaDoc.comentario);
                if (parsed && typeof parsed === 'object') {
                    parsedDetails = parsed;
                }
            } catch (e) {}
        }

        const isCollect = selectedBoletaDoc.tipo_documento === 'recoger';
        const docTitle = isCollect ? "SOLICITUD DE RECOLECTA A PROVEEDOR" : "DEVOLUCIÓN DE ENTREGA";
        const docId = selectedBoletaDoc.documento_numero.replace('-RETRY', '').replace('-PARTIAL', '');
        const topLegend = isCollect ? "ORDEN DE RETIRO DE MERCANCÍA" : "MERCANCÍA DEVUELTA AL TALLER / BODEGA";

        const notes = isCollect 
            ? "Este documento autoriza al transportista asignado a retirar la mercancía del proveedor detallado para su posterior entrega en el punto de destino indicado."
            : "Este documento registra el retorno físico de la mercancía correspondiente al pedido a nuestras bodegas de origen. Se procederá con la anulación del despacho y/o la generación de la nota de crédito respectiva según políticas vigentes.";

        const companyDataToUse = {
            name: companyData?.name || 'Compañía Emisora',
            taxId: companyData?.taxId || 'N/D',
            address: companyData?.address || '',
            phone: companyData?.phone || '',
            email: companyData?.email || ''
        };

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        // Margins
        const marginX = 12;
        let currentY = 15;
        const pageWidth = 210;
        const contentWidth = pageWidth - (marginX * 2); // 186mm

        // --- 1. HEADER (Italic top text & Main Title) ---
        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105); // slate-600 for high visibility print
        doc.text(topLegend.toUpperCase(), marginX, currentY);
        currentY += 5;

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(26, 54, 93); // Dark blue #1a365d
        
        // Wrap title to avoid overlapping the badge box (which starts at X = 120)
        const wrappedTitle = doc.splitTextToSize(docTitle, 105);
        wrappedTitle.forEach((line: string) => {
            doc.text(line, marginX, currentY);
            currentY += 5.5;
        });
        currentY += 2;

        const leftColWidth = 105;
        // Company info left side
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0); // Pure black for print visibility
        doc.text(companyDataToUse.name, marginX, currentY);
        currentY += 5;

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0); // Pure black for print visibility
        doc.text(`Cédula: ${companyDataToUse.taxId}`, marginX, currentY);
        currentY += 4;

        const splitAddress = doc.splitTextToSize(companyDataToUse.address, leftColWidth);
        splitAddress.forEach((line: string) => {
            doc.text(line, marginX, currentY);
            currentY += 4;
        });

        doc.text(`Tel: ${companyDataToUse.phone}`, marginX, currentY);
        currentY += 4;
        doc.text(`Email: ${companyDataToUse.email}`, marginX, currentY);

        // --- 2. BADGE BOX (Right Side Info) ---
        const badgeBoxX = 120;
        const badgeBoxY = 15;
        const badgeBoxWidth = 78;
        const badgeBoxHeight = 35;

        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setFillColor(248, 250, 252); // slate-50
        doc.roundedRect(badgeBoxX, badgeBoxY, badgeBoxWidth, badgeBoxHeight, 2, 2, 'FD');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text(isCollect ? "BOLETA DE RECOLECTA" : "BOLETA DE LOGÍSTICA", badgeBoxX + 4, badgeBoxY + 5);

        doc.setFontSize(13);
        doc.setTextColor(26, 54, 93);
        doc.text(docId, badgeBoxX + 4, badgeBoxY + 11);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85); // slate-700
        doc.text("Fecha Emisión:", badgeBoxX + 4, badgeBoxY + 18);
        doc.text("Ruta Activa:", badgeBoxX + 4, badgeBoxY + 23);
        doc.text("Chofer Asignado:", badgeBoxX + 4, badgeBoxY + 28);

        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(0, 0, 0); // Pure black
        doc.text(dateStr, badgeBoxX + badgeBoxWidth - 4, badgeBoxY + 18, { align: 'right' });
        doc.text(routeName, badgeBoxX + badgeBoxWidth - 4, badgeBoxY + 23, { align: 'right' });
        doc.text(driverName, badgeBoxX + badgeBoxWidth - 4, badgeBoxY + 28, { align: 'right' });

        currentY = Math.max(currentY + 10, badgeBoxY + badgeBoxHeight + 8);

        // Helper to draw section header
        const drawSectionHeader = (title: string) => {
            doc.setFillColor(43, 108, 176); // accent blue
            doc.rect(marginX, currentY, 1, 5, 'F');
            
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(26, 54, 93);
            doc.text(title, marginX + 3, currentY + 3.8);
            currentY += 7;
        };

        // Helper to draw a card box with fields
        const drawCard = (fields: { label: string; value: string; isBold?: boolean; isHighlight?: boolean }[][]) => {
            const cardY = currentY;
            const cardPadding = 4;
            const rowHeight = 9;
            
            let totalRowHeights = 0;
            const rowHeightList: number[] = [];
            fields.forEach((row) => {
                let maxLines = 1;
                const colWidth = contentWidth / row.length;
                row.forEach((col) => {
                    const wrappedVal = doc.splitTextToSize(col.value || "N/D", colWidth - 6);
                    if (wrappedVal.length > maxLines) {
                        maxLines = wrappedVal.length;
                    }
                });
                const rHeight = rowHeight + (maxLines - 1) * 3.5;
                rowHeightList.push(rHeight);
                totalRowHeights += rHeight;
            });

            const cardHeight = totalRowHeights + (cardPadding * 2);
            
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.roundedRect(marginX, cardY, contentWidth, cardHeight, 1.5, 1.5, 'FD');
            
            let fieldY = cardY + cardPadding;
            fields.forEach((row, rowIdx) => {
                const colWidth = contentWidth / row.length;
                row.forEach((col, colIdx) => {
                    const colX = marginX + (colIdx * colWidth) + 3;
                    
                    // Label
                    doc.setFont('Helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.setTextColor(71, 85, 105); // slate-600 (darker and readable)
                    doc.text(col.label, colX, fieldY + 2.5);
                    
                    // Value
                    const isHighlight = col.isHighlight;
                    doc.setFont('Helvetica', (col.isBold || isHighlight) ? 'bold' : 'normal');
                    doc.setFontSize(9);
                    doc.setTextColor(isHighlight ? 26 : 0, isHighlight ? 54 : 0, isHighlight ? 93 : 0);
                    
                    const wrappedVal = doc.splitTextToSize(col.value || "N/D", colWidth - 6);
                    let textY = fieldY + 6.5;
                    wrappedVal.forEach((line: string) => {
                        doc.text(line, colX, textY);
                        textY += 3.5;
                    });
                });
                
                fieldY += rowHeightList[rowIdx];
            });
            
            currentY += cardHeight + 5;
        };

        // --- 3. SECTIONS ---
        if (isCollect) {
            drawSectionHeader("1. Información del Proveedor");
            drawCard([
                [
                    { label: "Proveedor (Nombre/Razón Social)", value: `${selectedBoletaDoc.cliente_nombre || 'N/D'} (${selectedBoletaDoc.cliente_id || 'N/D'})`, isHighlight: true },
                    { label: "Contacto Vendedor", value: parsedDetails.proveedor_contacto_nombre || 'N/D' }
                ],
                [
                    { label: "Lugar de Entrega / Destino", value: parsedDetails.lugar_entrega || selectedBoletaDoc.lugar_entrega || 'N/D' },
                    { label: "Teléfono Vendedor", value: parsedDetails.proveedor_contacto_telefono || 'N/D' }
                ]
            ]);

            drawSectionHeader("2. Detalles de la Recolecta");
            const methodText = (parsedDetails.metodo_pago === 'pagar_al_retirar') ? 'PAGAR AL RETIRAR'
                : (parsedDetails.metodo_pago === 'ya_esta_pago') ? 'YA ESTÁ PAGO'
                : (parsedDetails.metodo_pago === 'credito') ? 'CRÉDITO'
                : (parsedDetails.metodo_pago || '').toUpperCase();

            drawCard([
                [
                    { label: "Orden de Compra", value: parsedDetails.orden_compra || 'N/D', isBold: true },
                    { label: "Factura Relacionada", value: parsedDetails.factura || 'N/D', isBold: true },
                    { label: "Método de Pago", value: methodText, isBold: true }
                ],
                [
                    { label: "Solicitante", value: `${parsedDetails.solicitante_nombre || 'N/D'} (${parsedDetails.solicitante_email || 'N/D'})` },
                    { label: "Horario del Proveedor", value: parsedDetails.horario_proveedor || 'N/D' },
                    { label: " ", value: " " }
                ],
                [
                    { label: "Detalle Adicional / Comentarios", value: parsedDetails.detalle_adicional || 'Ninguno' }
                ]
            ]);
        } else {
            drawSectionHeader("1. Información del Cliente");
            drawCard([
                [
                    { label: "Cliente", value: `${selectedBoletaDoc.cliente_nombre || 'N/D'} (${selectedBoletaDoc.cliente_id || 'N/D'})`, isHighlight: true },
                    { label: "Contacto", value: parsedDetails.contacto_nombre || selectedBoletaDoc.cliente_nombre || 'N/D' }
                ],
                [
                    { label: "Dirección de Entrega", value: selectedBoletaDoc.lugar_entrega || 'N/D' },
                    { label: "Teléfono Contacto", value: parsedDetails.contacto_telefono || 'N/D' }
                ]
            ]);

            drawSectionHeader("2. Detalle y Motivo de la Devolución");
            drawCard([
                [
                    { label: "Motivo / Comentarios del Conductor", value: selectedBoletaDoc.comentario || 'Ninguno' }
                ]
            ]);
        }

        // --- 4. NOTES ---
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(45, 55, 72);
        doc.text("Notas:", marginX, currentY);
        currentY += 4;
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85); // slate-700 (darker print)
        
        const splitNotes = doc.splitTextToSize(notes, contentWidth);
        splitNotes.forEach((line: string) => {
            doc.text(line, marginX, currentY);
            currentY += 4.5;
        });
        currentY += 6;

        // --- 5. SIGNATURES ---
        const sigCardHeight = 22;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.roundedRect(marginX, currentY, contentWidth, sigCardHeight, 1.5, 1.5, 'FD');

        const sigWidth = contentWidth / 2;
        const leftSigX = marginX + 5;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text(isCollect ? 'FIRMA DEL PROVEEDOR (DESPACHA)' : 'FIRMA DE DEVOLUCIÓN DEL CLIENTE', leftSigX, currentY + 4);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0); // Pure black
        doc.text("Nombre: ____________________________", leftSigX, currentY + 11);
        doc.text("Cédula: ____________________________", leftSigX, currentY + 16);

        const rightSigX = marginX + sigWidth + 5;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text(isCollect ? 'RECIBIDO POR (CHOFER / TRANSPORTISTA)' : 'RECIBIDO EN BODEGA / CHOFER', rightSigX, currentY + 4);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0); // Pure black
        doc.text(`Nombre: ${driverName}`, rightSigX, currentY + 11);
        doc.text("Identificación: N/D", rightSigX, currentY + 16);

        doc.save(`boleta_${docId}.pdf`);
        toast({
            title: 'PDF Descargado',
            description: `La boleta ${docId} se ha descargado correctamente con el formato oficial.`,
        });
    };

    async function handleSyncERP() {
        setSyncingERP(true);
        try {
            // 1. Sync ERP Data first (Cache sync)
            const syncRes = await syncAllData();
            
            // 2. Build options and populate delivery queue from ERP cache
            let options: any = { excludeCreditNotes: omitCreditNotes };
            if (syncFilterType === 'days') {
                options.daysLookback = syncLookbackDays;
            } else if (syncFilterType === 'range') {
                options.startDate = syncStartDate || null;
                options.endDate = syncEndDate || null;
            }

            const res = await populateDeliveryQueueFromERP(options);
            if (res.success) {
                toast({
                    title: 'ERP Sincronizado y Cola Actualizada',
                    description: `Se han importado y cargado nuevos documentos desde el ERP.`,
                });
                const [q, ad] = await Promise.all([getGeneralQueue(), getAssignedDeliveriesToday()]);
                setQueue(q);
                setAssignedDocs(ad);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error de sincronización',
                description: e.message,
                variant: 'destructive'
            });
        } finally {
            setSyncingERP(false);
        }
    }

    async function handleAutoRoute() {
        setAutoRouting(true);
        try {
            const res = await autoRouteQueueToday();
            if (res.success) {
                toast({
                    title: 'Auto-Ruteo completado',
                    description: `Se auto-asignaron ${res.count} documentos basándose en la RUTA del ERP.`,
                });
                const [q, ad] = await Promise.all([getGeneralQueue(), getAssignedDeliveriesToday()]);
                setQueue(q);
                setAssignedDocs(ad);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error de Auto-Ruteo',
                description: e.message,
                variant: 'destructive'
            });
        } finally {
            setAutoRouting(false);
        }
    }

    async function handleCreateAssignment(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedRoute || !selectedDriver || !selectedVehicle) {
            toast({
                title: 'Formulario incompleto',
                description: 'Por favor complete la ruta, el chofer y el vehículo.',
                variant: 'warning'
            } as any);
            return;
        }

        setCreatingAssignment(true);
        try {
            const res = await createAssignment(
                Number(selectedRoute),
                Number(selectedDriver),
                Number(selectedVehicle)
            );
            if (res.success) {
                toast({
                    title: 'Asignación creada',
                    description: 'La ruta ya está disponible para asociar entregas.',
                });
                setSelectedRoute('');
                setSelectedDriver('');
                setSelectedVehicle('');
                const [a, d, v] = await Promise.all([
                    getActiveAssignmentsToday(),
                    getDrivers(),
                    getVehicles()
                ]);
                setAssignments(a);
                setDrivers(d);
                setVehicles(v);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al asignar',
                description: e.message,
                variant: 'destructive'
            });
        } finally {
            setCreatingAssignment(false);
        }
    }

    async function proceedCloseAssignment(assignmentId: number) {
        try {
            const res = await closeAssignment(assignmentId, 'Coordinador Web');
            if (res.success) {
                toast({
                    title: 'Ruta cerrada',
                    description: 'La ruta y camión han sido liberados y las entregas regresaron a cola.',
                });
                const [q, ad, a] = await Promise.all([
                    getGeneralQueue(),
                    getAssignedDeliveriesToday(),
                    getActiveAssignmentsToday()
                ]);
                setQueue(q);
                setAssignedDocs(ad);
                setAssignments(a);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error de cierre',
                description: e.message,
                variant: 'destructive'
            });
        }
    }

    async function handleCloseAssignment(assignmentId: number) {
        setConfirmConfig({
            isOpen: true,
            title: '¿Forzar cierre de ruta?',
            description: '¿Está seguro de forzar el cierre de esta ruta? Las entregas no gestionadas volverán a la cola general.',
            onConfirm: () => proceedCloseAssignment(assignmentId),
            actionLabel: 'Sí, cerrar ruta',
            cancelLabel: 'Cancelar',
            isDestructive: true
        });
    }

    async function proceedReleasePendingDocuments(assignmentId: number) {
        try {
            const res = await releasePendingDocuments(assignmentId);
            if (res.success) {
                toast({
                    title: 'Documentos liberados',
                    description: 'Todos los documentos pendientes han regresado a la cola general.',
                });
                const [q, ad] = await Promise.all([
                    getGeneralQueue(),
                    getAssignedDeliveriesToday()
                ]);
                setQueue(q);
                setAssignedDocs(ad);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al liberar',
                description: e.message,
                variant: 'destructive'
            });
        }
    }

    async function handleReleasePendingDocuments(assignmentId: number) {
        setConfirmConfig({
            isOpen: true,
            title: '¿Liberar todos los documentos pendientes?',
            description: '¿Está seguro de regresar todas las entregas no gestionadas de esta ruta a la cola general? La ruta y el vehículo seguirán activos.',
            onConfirm: () => proceedReleasePendingDocuments(assignmentId),
            actionLabel: 'Sí, liberar pendientes',
            cancelLabel: 'Cancelar',
            isDestructive: false
        });
    }

    async function handleAssignSelected() {
        if (selectedDocIds.length === 0 || !destinationAssignment) return;

        try {
            const res = await assignDocumentsToRoute(selectedDocIds, Number(destinationAssignment));
            if (res.success) {
                toast({
                    title: 'Entregas asignadas',
                    description: `Se asignaron ${selectedDocIds.length} documentos a la ruta seleccionada.`,
                });
                setSelectedDocIds([]);
                setDestinationAssignment('');
                const [q, ad] = await Promise.all([getGeneralQueue(), getAssignedDeliveriesToday()]);
                setQueue(q);
                setAssignedDocs(ad);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al asociar',
                description: e.message,
                variant: 'destructive'
            });
        }
    }

    async function handleReassign(docId: number, target: string) {
        try {
            let res;
            if (target === 'unassign') {
                res = await unassignDocument(docId);
            } else {
                res = await reassignDocument(docId, Number(target));
            }
            
            if (res.success) {
                toast({
                    title: target === 'unassign' ? 'Pedido desasignado' : 'Pedido reasignado',
                    description: target === 'unassign' 
                        ? 'Se ha regresado el pedido a la cola general.' 
                        : 'Se ha cambiado de ruta el pedido con éxito.',
                });
                const ad = await getAssignedDeliveriesToday();
                setAssignedDocs(ad);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al reasignar',
                description: e.message,
                variant: 'destructive'
            });
        }
    }

    async function proceedBatchMarkAsDelivered() {
        setProcessingBatchDeliver(true);
        try {
            const res = await markDocumentsAsDeliveredBulkAction(selectedDocIds, 'Coordinador Web');
            if (res.success) {
                toast({
                    title: 'Procesamiento en lote exitoso',
                    description: `Se marcaron ${selectedDocIds.length} documentos como entregados con éxito.`,
                });
                setSelectedDocIds([]);
                const q = await getGeneralQueue();
                setQueue(q);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al procesar lote',
                description: e.message,
                variant: 'destructive'
            });
        } finally {
            setProcessingBatchDeliver(false);
        }
    }

    async function handleBatchMarkAsDelivered() {
        if (selectedDocIds.length === 0) return;
        setConfirmConfig({
            isOpen: true,
            title: '¿Confirmar entrega masiva?',
            description: `¿Está seguro de marcar los ${selectedDocIds.length} documentos seleccionados como entregados (históricos)? Esta acción los removerá de la cola activa de pendientes.`,
            onConfirm: proceedBatchMarkAsDelivered,
            actionLabel: 'Sí, marcar entregados',
            cancelLabel: 'Cancelar',
            isDestructive: false
        });
    }

    async function proceedPurgeQueueBeforeDate() {
        setProcessingPurge(true);
        try {
            const res = await purgeGeneralQueueBeforeDateAction(purgeCutoffDate, 'Depuración Inicial / Pre-Sistema');
            if (res.success) {
                toast({
                    title: 'Depuración Completada',
                    description: `Se procesaron y limpiaron ${res.count} facturas antiguas de la cola general.`,
                });
                setPurgingDialogOpen(false);
                const q = await getGeneralQueue();
                setQueue(q);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error de depuración',
                description: e.message,
                variant: 'destructive'
            });
        } finally {
            setProcessingPurge(false);
        }
    }

    async function handlePurgeQueueBeforeDate() {
        if (!purgeCutoffDate) {
            toast({
                title: 'Fecha no válida',
                description: 'Por favor seleccione una fecha de corte correcta.',
                variant: 'warning'
            } as any);
            return;
        }

        setConfirmConfig({
            isOpen: true,
            title: '🚨 ADVERTENCIA DE SEGURIDAD 🚨',
            description: `¿Está totalmente seguro de marcar como ENTREGADAS todas las facturas no asignadas de la Cola General registradas antes del ${purgeCutoffDate}?\n\nEsta acción es irreversible y afectará a todos los registros históricos coincidentes.`,
            onConfirm: proceedPurgeQueueBeforeDate,
            actionLabel: 'Confirmar Depuración',
            cancelLabel: 'Cancelar',
            isDestructive: true
        });
    }

    async function proceedUnlockDocument(docId: number) {
        const res = await unlockDocumentTelegram(docId);
        if (res.success) {
            toast({ title: 'Pedido desbloqueado', description: 'El candado de Telegram ha sido removido.' });
            const [q, ad] = await Promise.all([getGeneralQueue(), getAssignedDeliveriesToday()]);
            setQueue(q);
            setAssignedDocs(ad);
        } else {
            toast({ title: 'Error al desbloquear', description: res.error, variant: 'destructive' });
        }
    }

    async function handleUnlockDocument(doc: any) {
        setConfirmConfig({
            isOpen: true,
            title: '¿Desbloquear pedido de Telegram?',
            description: `¿Desbloquear pedido ${doc.documento_numero} de Telegram?\n\nEsta acción liberará el candado y permitirá que otros choferes o el despachador manual tomen el control del documento.`,
            onConfirm: () => proceedUnlockDocument(doc.id),
            actionLabel: 'Sí, desbloquear',
            cancelLabel: 'Cancelar',
            isDestructive: true
        });
    }


    const pendingCollectCount = (queue || []).filter(
        doc => doc?.tipo_documento === 'recoger' && !doc?.entregado && !doc?.asignacion_id
    ).length;

    const filteredQueue = (queue || []).filter(doc => {
        if (omitCreditNotes && doc?.tipo_documento_erp === 'D') {
            return false;
        }
        if (showOnlyCollect && doc?.tipo_documento !== 'recoger') {
            return false;
        }
        const docNum = doc?.documento_numero || '';
        const isRetry = docNum.endsWith('-RETRY');
        const isPartial = docNum.endsWith('-PARTIAL');
        const hasBoletaOrReinjection = isRetry || isPartial || !!doc?.devolucion_asignacion_id || !!doc?.boleta_numero;

        if (showOnlyIncompleteWithBoleta && !hasBoletaOrReinjection) {
            return false;
        }
        
        const matchesQuery = searchQuery.toLowerCase();
        let matchesStatus = false;
        if (isRetry && ('devolución'.includes(matchesQuery) || 'devolucion'.includes(matchesQuery) || 'reintento'.includes(matchesQuery) || 'reintentar'.includes(matchesQuery) || 'retry'.includes(matchesQuery) || 'dev'.includes(matchesQuery))) {
            matchesStatus = true;
        }
        if (isPartial && ('parcial'.includes(matchesQuery) || 'reentrega'.includes(matchesQuery) || 'partial'.includes(matchesQuery))) {
            matchesStatus = true;
        }

        return (
            docNum.toLowerCase().includes(matchesQuery) ||
            (doc?.cliente_nombre || '').toLowerCase().includes(matchesQuery) ||
            (doc?.cliente_id || '').toLowerCase().includes(matchesQuery) ||
            matchesStatus
        );
    }).sort((a, b) => {
        // Los pedidos incompletos / reintentos con boleta se muestran de primero siempre en la lista
        const aDocNum = a?.documento_numero || '';
        const bDocNum = b?.documento_numero || '';
        const aIsPriority = aDocNum.endsWith('-PARTIAL') || aDocNum.endsWith('-RETRY') || !!a?.devolucion_asignacion_id;
        const bIsPriority = bDocNum.endsWith('-PARTIAL') || bDocNum.endsWith('-RETRY') || !!b?.devolucion_asignacion_id;

        if (aIsPriority && !bIsPriority) return -1;
        if (!aIsPriority && bIsPriority) return 1;
        return 0;
    });

    const displayedQueue = filteredQueue.slice(0, visibleCount);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse">
                <div className="text-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                    <p className="text-muted-foreground font-medium">Verificando credenciales logísticas...</p>
                </div>
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <div className="text-center text-red-500 font-bold p-12 bg-rose-50 border border-rose-200 rounded-2xl max-w-7xl mx-auto space-y-2 shadow-sm">
                <h3 className="text-lg font-black text-rose-700">Acceso Denegado</h3>
                <p className="text-xs text-rose-600 font-medium">Se requiere el permiso de despacho y registro (deliveries:write) para acceder a esta sección.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse">
                <div className="text-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                    <p className="text-muted-foreground font-medium">Cargando despacho operativo...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* DESKTOP ONLY: Sync & Automations Panel (100% INTACTO para computadoras) */}
            <div className="hidden lg:block p-5 bg-blue-600/5 dark:bg-blue-500/5 rounded-2xl border border-blue-500/10 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h3 className="text-sm font-extrabold flex items-center gap-2 text-foreground">
                            <Users className="w-4 h-4 text-blue-600" />
                            Acciones de Carga y Ruteo de Cola
                        </h3>
                        <p className="text-xs text-muted-foreground font-medium">
                            Cargue facturas del ERP local a la cola general o ejecute el ruteo automático basado en parámetros del sistema.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Auto-Refresh Control */}
                        <div className="flex items-center gap-2 border border-muted bg-background/50 dark:bg-muted/10 backdrop-blur px-2.5 py-1 rounded-xl text-xs font-bold shadow-sm h-9">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                                <RefreshCw className={`w-3 h-3 ${refreshIntervalSec > 0 ? 'animate-spin text-emerald-500' : 'text-muted-foreground'}`} style={{ animationDuration: refreshIntervalSec > 0 ? '3s' : undefined }} />
                                {refreshIntervalSec > 0 ? (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold animate-pulse">🔴 EN VIVO ({refreshIntervalSec}s)</span>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground font-extrabold">Refresco</span>
                                )}
                            </span>
                            <Select 
                                value={String(refreshIntervalSec)} 
                                onValueChange={(val) => setRefreshIntervalSec(Number(val))}
                            >
                                <SelectTrigger className="h-6 w-20 rounded-lg font-bold text-[10px] bg-transparent border-none shadow-none focus:ring-0 p-0 text-foreground">
                                    <SelectValue placeholder="Intervalo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">Apagado</SelectItem>
                                    <SelectItem value="10">Cada 10s</SelectItem>
                                    <SelectItem value="30">Cada 30s</SelectItem>
                                    <SelectItem value="60">Cada 1m</SelectItem>
                                    <SelectItem value="300">Cada 5m</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            disabled={syncingERP}
                            onClick={handleSyncERP}
                            className="rounded-lg font-bold gap-2 text-xs border-muted/80 shadow-sm"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${syncingERP ? 'animate-spin' : ''}`} />
                            {syncingERP ? 'Actualizando...' : 'Actualizar Cola ERP'}
                        </Button>
                        
                        <Button
                            variant="default"
                            size="sm"
                            disabled={autoRouting || assignments.length === 0}
                            onClick={handleAutoRoute}
                            className="rounded-lg font-bold gap-2 text-xs bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-100 dark:shadow-none"
                        >
                            <Send className="w-3.5 h-3.5" />
                            {autoRouting ? 'Procesando...' : 'Auto-Ruteo ERP'}
                        </Button>

                        <Dialog open={purgingDialogOpen} onOpenChange={setPurgingDialogOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg font-bold gap-2 text-xs border-red-200 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:border-red-950/40 dark:bg-red-950/20 dark:text-red-400 shadow-sm"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Depurar Cola
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px] rounded-2xl border border-muted bg-background">
                                <DialogHeader className="space-y-1.5">
                                    <DialogTitle className="text-md font-extrabold flex items-center gap-2 text-red-600">
                                        <AlertTriangle className="w-5 h-5 text-red-600 animate-bounce" />
                                        Depuración Histórica por Fecha
                                    </DialogTitle>
                                    <DialogDescription className="text-xs font-semibold leading-relaxed">
                                        Marque de forma masiva como **ENTREGADAS** todas las facturas no asignadas de la cola general registradas antes de la fecha seleccionada. Útil al implementar el sistema por primera vez para limpiar facturas viejas.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="cutoff-date" className="text-xs font-extrabold text-muted-foreground flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5" />
                                            Fecha de Corte (Documentos anteriores a esta fecha)
                                        </Label>
                                        <Input
                                            id="cutoff-date"
                                            type="date"
                                            value={purgeCutoffDate}
                                            onChange={(e) => setPurgeCutoffDate(e.target.value)}
                                            className="rounded-xl font-bold text-xs"
                                        />
                                    </div>
                                    <div className="p-3 bg-red-500/5 dark:bg-red-950/20 border border-red-500/10 rounded-xl space-y-1">
                                        <span className="text-[10px] font-black text-red-600 uppercase flex items-center gap-1">
                                            ⚠️ Advertencia Importante
                                        </span>
                                        <p className="text-[10px] font-bold text-muted-foreground leading-normal">
                                            Esta acción marcará las facturas antiguas como <strong className="text-foreground">entregadas completas</strong>, ocultándolas de la Cola de Pendientes pero manteniéndolas en el Historial con la firma <em className="text-foreground">&quot;Depuración Inicial / Pre-Sistema&quot;</em>.
                                        </p>
                                    </div>
                                </div>
                                <DialogFooter className="flex gap-2 justify-end">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPurgingDialogOpen(false)}
                                        className="rounded-xl font-bold text-xs"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        disabled={processingPurge}
                                        onClick={handlePurgeQueueBeforeDate}
                                        className="rounded-xl font-black text-xs gap-1.5"
                                    >
                                        {processingPurge ? (
                                            <>
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                Procesando...
                                            </>
                                        ) : (
                                            'Confirmar Depuración'
                                        )}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                    </div>
                </div>

                <Separator className="border-blue-500/10" />

                {/* Filter configurations (v2.3) */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-1 text-xs">
                    <div className="md:col-span-3 space-y-1">
                        <span className="font-extrabold text-foreground/90 uppercase tracking-wider text-[10px]">Filtro de Sincronización</span>
                        <Select 
                            value={syncFilterType} 
                            onValueChange={(val: any) => setSyncFilterType(val)}
                        >
                            <SelectTrigger className="h-8 rounded-lg font-bold text-xs bg-background">
                                <SelectValue placeholder="Tipo de Filtro" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Sin filtro (Importar Todo)</SelectItem>
                                <SelectItem value="days">Por días relativos</SelectItem>
                                <SelectItem value="range">Por rango de fechas</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {syncFilterType === 'days' && (
                        <div className="md:col-span-9 space-y-1">
                            <span className="font-extrabold text-foreground/90 uppercase tracking-wider text-[10px]">Rango de Días Relativos</span>
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {[
                                    { label: 'Solo Hoy', val: 0 },
                                    { label: 'Último 1 día', val: 1 },
                                    { label: 'Últimos 2 días', val: 2 },
                                    { label: 'Últimos 3 días', val: 3 },
                                    { label: 'Últimos 4 días', val: 4 },
                                    { label: 'Últimos 5 días', val: 5 }
                                ].map((opt) => (
                                    <Button
                                        key={opt.val}
                                        type="button"
                                        variant={syncLookbackDays === opt.val ? 'default' : 'outline'}
                                        onClick={() => setSyncLookbackDays(opt.val)}
                                        className={`h-7 px-2.5 rounded-lg text-[10px] font-bold ${
                                            syncLookbackDays === opt.val 
                                                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                                : 'bg-background hover:bg-muted/10'
                                        }`}
                                    >
                                        {opt.label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}

                    {syncFilterType === 'range' && (
                        <div className="md:col-span-9 flex flex-col sm:flex-row gap-3 items-end">
                            <div className="flex-1 space-y-1 w-full">
                                <span className="font-extrabold text-foreground/90 uppercase tracking-wider text-[10px]">Fecha Inicio</span>
                                <Input
                                    type="date"
                                    value={syncStartDate}
                                    onChange={(e) => setSyncStartDate(e.target.value)}
                                    className="h-8 rounded-lg font-bold text-xs bg-background w-full"
                                />
                            </div>
                            <div className="flex-1 space-y-1 w-full">
                                <span className="font-extrabold text-foreground/90 uppercase tracking-wider text-[10px]">Fecha Fin</span>
                                <Input
                                    type="date"
                                    value={syncEndDate}
                                    onChange={(e) => setSyncEndDate(e.target.value)}
                                    className="h-8 rounded-lg font-bold text-xs bg-background w-full"
                                />
                            </div>
                        </div>
                    )}

                    {syncFilterType === 'none' && (
                        <div className="md:col-span-9 text-muted-foreground text-xs italic font-medium pt-3 sm:pt-0">
                            💡 Al sincronizar sin filtro, se analizará todo el historial activo del ERP. Esto puede demorar unos minutos y consumir más recursos en bases de datos masivas.
                        </div>
                    )}
                </div>
            </div>

            {/* MOBILE ONLY: Compact Bar + Sheet HUB de Herramientas & Opciones */}
            <div className="block lg:hidden space-y-3">
                <div className="p-3 bg-card border rounded-2xl flex items-center justify-between shadow-sm gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
                            <Truck className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xs font-black truncate text-foreground">Despacho Operativo</h2>
                            <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5">
                                <span>{queue.length} en cola</span>
                                <span>•</span>
                                <span>{assignments.length} rutas</span>
                                {refreshIntervalSec > 0 && (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        {refreshIntervalSec}s
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={syncingERP}
                            onClick={handleSyncERP}
                            className="h-8 px-2.5 rounded-xl font-bold text-[11px] gap-1 border-muted/80 shadow-sm"
                            title="Sincronizar Cola ERP"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${syncingERP ? 'animate-spin text-blue-600' : ''}`} />
                            <span className="hidden sm:inline">Sync</span>
                        </Button>

                        {/* Sheet Trigger Button */}
                        <Sheet open={mobileToolsSheetOpen} onOpenChange={setMobileToolsSheetOpen}>
                            <SheetTrigger asChild>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="h-8 px-2.5 rounded-xl font-bold text-[11px] gap-1.5 bg-blue-600 hover:bg-blue-700 shadow-sm text-white"
                                >
                                    <Settings2 className="w-3.5 h-3.5" />
                                    <span>Herramientas</span>
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-[88vw] sm:max-w-md p-0 flex flex-col justify-between overflow-y-auto">
                                <div className="p-5 space-y-6">
                                    <SheetHeader className="text-left border-b pb-4">
                                        <SheetTitle className="text-base font-black flex items-center gap-2">
                                            <SlidersHorizontal className="w-5 h-5 text-blue-600" />
                                            Herramientas y Opciones
                                        </SheetTitle>
                                        <SheetDescription className="text-xs">
                                            Controles de sincronización ERP, monitoreo y acciones automáticas de cola.
                                        </SheetDescription>
                                    </SheetHeader>

                                    {/* 1. Sincronización ERP */}
                                    <div className="space-y-3 bg-muted/30 p-3.5 rounded-2xl border border-muted/60">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black uppercase text-foreground/80 tracking-wider">
                                                Sincronización ERP
                                            </span>
                                            <Badge variant="outline" className="text-[10px] font-bold">
                                                {syncFilterType === 'days' ? `${syncLookbackDays}d lookback` : syncFilterType}
                                            </Badge>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-[11px] font-bold text-muted-foreground">Filtro de búsqueda ERP</Label>
                                            <Select 
                                                value={syncFilterType} 
                                                onValueChange={(val: any) => setSyncFilterType(val)}
                                            >
                                                <SelectTrigger className="h-8 rounded-lg font-bold text-xs bg-background">
                                                    <SelectValue placeholder="Tipo de Filtro" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Sin filtro (Importar Todo)</SelectItem>
                                                    <SelectItem value="days">Por días relativos</SelectItem>
                                                    <SelectItem value="range">Por rango de fechas</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {syncFilterType === 'days' && (
                                            <div className="space-y-1.5 pt-1">
                                                <Label className="text-[10px] font-bold text-muted-foreground">Días anteriores a consultar</Label>
                                                <div className="grid grid-cols-3 gap-1.5">
                                                    {[
                                                        { label: 'Solo Hoy', val: 0 },
                                                        { label: '1 Día', val: 1 },
                                                        { label: '2 Días', val: 2 },
                                                        { label: '3 Días', val: 3 },
                                                        { label: '4 Días', val: 4 },
                                                        { label: '5 Días', val: 5 }
                                                    ].map((opt) => (
                                                        <Button
                                                            key={opt.val}
                                                            type="button"
                                                            variant={syncLookbackDays === opt.val ? 'default' : 'outline'}
                                                            onClick={() => setSyncLookbackDays(opt.val)}
                                                            className={`h-7 text-[10px] font-bold rounded-lg ${
                                                                syncLookbackDays === opt.val 
                                                                    ? 'bg-blue-600 text-white' 
                                                                    : 'bg-background'
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {syncFilterType === 'range' && (
                                            <div className="space-y-2 pt-1">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] font-bold text-muted-foreground">Fecha Inicio</Label>
                                                    <Input
                                                        type="date"
                                                        value={syncStartDate}
                                                        onChange={(e) => setSyncStartDate(e.target.value)}
                                                        className="h-8 rounded-lg font-bold text-xs bg-background"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] font-bold text-muted-foreground">Fecha Fin</Label>
                                                    <Input
                                                        type="date"
                                                        value={syncEndDate}
                                                        onChange={(e) => setSyncEndDate(e.target.value)}
                                                        className="h-8 rounded-lg font-bold text-xs bg-background"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <Button
                                            disabled={syncingERP}
                                            onClick={async () => {
                                                await handleSyncERP();
                                            }}
                                            className="w-full h-9 rounded-xl font-bold text-xs gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm mt-1"
                                        >
                                            <RefreshCw className={`w-3.5 h-3.5 ${syncingERP ? 'animate-spin' : ''}`} />
                                            {syncingERP ? 'Sincronizando...' : 'Ejecutar Sincronización ERP'}
                                        </Button>
                                    </div>

                                    {/* 2. Auto-Refresco en Vivo */}
                                    <div className="space-y-2 bg-muted/30 p-3.5 rounded-2xl border border-muted/60">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black uppercase text-foreground/80 tracking-wider flex items-center gap-1.5">
                                                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                                                Monitoreo en Vivo
                                            </span>
                                            {refreshIntervalSec > 0 ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[10px] font-bold">
                                                    Activo ({refreshIntervalSec}s)
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground">
                                                    Apagado
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            Actualiza automáticamente los estados de choferes y pedidos sin recargar la página.
                                        </p>
                                        <Select 
                                            value={String(refreshIntervalSec)} 
                                            onValueChange={(val) => setRefreshIntervalSec(Number(val))}
                                        >
                                            <SelectTrigger className="h-8 rounded-lg font-bold text-xs bg-background">
                                                <SelectValue placeholder="Seleccionar intervalo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="0">Apagado (Manual)</SelectItem>
                                                <SelectItem value="10">Cada 10 segundos</SelectItem>
                                                <SelectItem value="30">Cada 30 segundos</SelectItem>
                                                <SelectItem value="60">Cada 1 minuto</SelectItem>
                                                <SelectItem value="300">Cada 5 minutos</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* 3. Acciones de Despacho Masivo */}
                                    <div className="space-y-2 bg-muted/30 p-3.5 rounded-2xl border border-muted/60">
                                        <span className="text-xs font-black uppercase text-foreground/80 tracking-wider flex items-center gap-1.5">
                                            <Send className="w-3.5 h-3.5 text-blue-600" />
                                            Automatizaciones
                                        </span>
                                        <Button
                                            variant="outline"
                                            disabled={autoRouting || assignments.length === 0}
                                            onClick={() => {
                                                setMobileToolsSheetOpen(false);
                                                handleAutoRoute();
                                            }}
                                            className="w-full h-9 rounded-xl font-bold text-xs gap-2 justify-start bg-background border-muted/80 shadow-sm"
                                        >
                                            <Send className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                            <span>{autoRouting ? 'Ruteando...' : 'Auto-Ruteo Inteligente'}</span>
                                        </Button>

                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setMobileToolsSheetOpen(false);
                                                setPurgingDialogOpen(true);
                                            }}
                                            className="w-full h-9 rounded-xl font-bold text-xs gap-2 justify-start bg-red-500/5 text-red-600 border-red-200 hover:bg-red-500/10 dark:border-red-950/40 shadow-sm"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                            <span>Depurar Cola Histórica</span>
                                        </Button>
                                    </div>

                                    {/* 4. Enlaces a Módulos Relacionados */}
                                    <div className="space-y-2 pt-2">
                                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                                            Módulos Relacionados
                                        </span>
                                        <div className="grid grid-cols-1 gap-1.5">
                                            <a 
                                                href="/dashboard/operations/logistics/deliveries/route-sheets"
                                                className="flex items-center justify-between p-2.5 bg-muted/20 hover:bg-muted/40 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-muted/50"
                                            >
                                                <span className="flex items-center gap-2">📄 Hojas de Ruta</span>
                                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                                            </a>
                                            <a 
                                                href="/dashboard/operations/logistics/deliveries/fleet"
                                                className="flex items-center justify-between p-2.5 bg-muted/20 hover:bg-muted/40 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-muted/50"
                                            >
                                                <span className="flex items-center gap-2">🚛 Flota & Choferes</span>
                                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                                            </a>
                                            <a 
                                                href="/dashboard/operations/logistics/deliveries/routes"
                                                className="flex items-center justify-between p-2.5 bg-muted/20 hover:bg-muted/40 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-muted/50"
                                            >
                                                <span className="flex items-center gap-2">🗺️ Rutas Maestras</span>
                                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>

                {/* Segmentador táctil para móvil: Cola vs Rutas + Botón Nueva Ruta (abre modal) */}
                <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-8 grid grid-cols-2 p-1 bg-muted/40 rounded-xl border border-muted/60">
                        <Button
                            type="button"
                            variant={mobileTab === 'queue' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setMobileTab('queue')}
                            className={`h-8 rounded-lg text-xs font-black transition-all ${
                                mobileTab === 'queue' 
                                    ? 'bg-blue-600 text-white shadow-sm' 
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            📦 Cola ({filteredQueue.length})
                        </Button>
                        <Button
                            type="button"
                            variant={mobileTab === 'routes' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setMobileTab('routes')}
                            className={`h-8 rounded-lg text-xs font-black transition-all ${
                                mobileTab === 'routes' 
                                    ? 'bg-indigo-600 text-white shadow-sm' 
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            🚚 Rutas ({assignments.length})
                        </Button>
                    </div>

                    <div className="col-span-4">
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => setMobileRouteModalOpen(true)}
                            className="w-full h-10 rounded-xl font-black text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        >
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span>Ruta</span>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* General Queue Left Column (En móvil visible si mobileTab === 'queue', en Desktop siempre visible) */}
                <div className={`lg:col-span-1 space-y-6 ${mobileTab === 'queue' ? 'block' : 'hidden lg:block'}`}>
                    <Card className="border-none shadow-md bg-card flex flex-col h-[calc(100dvh-220px)] lg:h-[750px]">
                        <CardHeader className="p-3 sm:p-4 pb-2 space-y-2.5">
                            <CardTitle className="text-base sm:text-lg flex items-center justify-between">
                                <span>Cola General de Pendientes</span>
                                <Badge className="bg-muted text-muted-foreground border-none font-bold">
                                    {filteredQueue.length}
                                </Badge>
                            </CardTitle>
                            <CardDescription className="text-[11px] sm:text-xs line-clamp-1">
                                Pedidos y facturas importadas del ERP a la espera de camión.
                            </CardDescription>

                            {pendingCollectCount > 0 && !showOnlyCollect && (
                                <div 
                                    onClick={() => setShowOnlyCollect(true)}
                                    className="p-2.5 bg-purple-500/10 dark:bg-purple-950/20 border border-purple-500/20 rounded-xl flex items-center justify-between cursor-pointer hover:bg-purple-500/15 transition-all animate-pulse"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 bg-purple-600 dark:bg-purple-400 rounded-full shrink-0" />
                                        <span className="text-[11px] font-black text-purple-700 dark:text-purple-300">
                                            ¡Hay {pendingCollectCount} recolectas pendientes!
                                        </span>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-purple-700 dark:text-purple-300 shrink-0" />
                                </div>
                            )}

                            <div className="relative">
                                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                                <Input
                                    placeholder="Buscar documento o cliente..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 h-9 rounded-xl font-bold text-xs"
                                />
                            </div>

                            {/* Píldoras / Chips horizontales de filtros en móvil y escritorio */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={omitCreditNotes ? "default" : "outline"}
                                    onClick={() => setOmitCreditNotes(prev => !prev)}
                                    className={`h-7 px-2.5 rounded-lg text-[10px] font-bold shrink-0 transition-all ${
                                        omitCreditNotes 
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                            : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {omitCreditNotes ? '✓ Sin Devoluciones (D)' : 'Devoluciones: Sí'}
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    variant={showOnlyCollect ? "default" : "outline"}
                                    onClick={() => {
                                        setShowOnlyCollect(prev => {
                                            const next = !prev;
                                            if (next) setShowOnlyIncompleteWithBoleta(false);
                                            return next;
                                        });
                                    }}
                                    className={`h-7 px-2.5 rounded-lg text-[10px] font-bold shrink-0 transition-all ${
                                        showOnlyCollect 
                                            ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                                            : 'bg-purple-500/5 text-purple-700 dark:text-purple-400 border-purple-200/50 hover:bg-purple-500/10'
                                    }`}
                                >
                                    📦 Solo Recolectas
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    variant={showOnlyIncompleteWithBoleta ? "default" : "outline"}
                                    onClick={() => {
                                        setShowOnlyIncompleteWithBoleta(prev => {
                                            const next = !prev;
                                            if (next) setShowOnlyCollect(false);
                                            return next;
                                        });
                                    }}
                                    className={`h-7 px-2.5 rounded-lg text-[10px] font-bold shrink-0 transition-all ${
                                        showOnlyIncompleteWithBoleta 
                                            ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                                            : 'bg-amber-500/5 text-amber-700 dark:text-amber-400 border-amber-200/50 hover:bg-amber-500/10'
                                    }`}
                                >
                                    ↩️ Reentregas
                                </Button>
                            </div>

                            {/* Fila Seleccionar Todos + Contador */}
                            <div className="flex items-center justify-between pt-1.5 px-0.5 border-t border-muted/50">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-queue"
                                        checked={
                                            displayedQueue.length > 0 &&
                                            displayedQueue.filter(d => d.tipo_documento_erp !== 'D').length > 0 &&
                                            displayedQueue.filter(d => d.tipo_documento_erp !== 'D').every(d => selectedDocIds.includes(d.id))
                                        }
                                        onCheckedChange={(checked) => {
                                            const eligibleIds = displayedQueue
                                                .filter(d => d.tipo_documento_erp !== 'D')
                                                .map(d => d.id);
                                            
                                            if (checked) {
                                                setSelectedDocIds(prev => {
                                                    const combined = [...prev, ...eligibleIds];
                                                    return Array.from(new Set(combined));
                                                });
                                            } else {
                                                setSelectedDocIds(prev => 
                                                    prev.filter(id => !eligibleIds.includes(id))
                                                );
                                            }
                                        }}
                                    />
                                    <Label 
                                        htmlFor="select-all-queue" 
                                        className="text-[11px] font-black text-foreground cursor-pointer select-none leading-none flex items-center gap-1"
                                    >
                                        Seleccionar Todos ({displayedQueue.filter(d => d.tipo_documento_erp !== 'D').length})
                                    </Label>
                                </div>
                                {selectedDocIds.length > 0 && (
                                    <span className="text-[10px] font-black text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full">
                                        {selectedDocIds.length} selec.
                                    </span>
                                )}
                            </div>

                        </CardHeader>

                        {/* Queue Documents list (con padding inferior responsivo para no ser tapado por la barra flotante) */}
                        <CardContent className="flex-1 overflow-y-auto space-y-2 p-3 sm:p-4 pb-28 lg:pb-4">
                            {filteredQueue.length > visibleCount && (
                                <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl text-center text-[10px] font-black border border-amber-500/20 leading-snug mb-1">
                                    ⚠️ Mostrando primeros {visibleCount} de {filteredQueue.length} documentos. Utilice la barra de búsqueda o el botón &quot;Mostrar más&quot; al final.
                                </div>
                            )}

                            {displayedQueue.length === 0 ? (
                                <div className="text-center p-8 bg-muted/10 rounded-xl border border-dashed text-xs text-muted-foreground font-semibold">
                                    No hay documentos en la cola.
                                </div>
                            ) : (
                                displayedQueue.map((doc) => {
                                    const isSelected = selectedDocIds.includes(doc.id);
                                    const isReturn = doc.tipo_documento_erp === 'D';
                                    const isRetry = doc.documento_numero.endsWith('-RETRY');
                                    const isPartial = doc.documento_numero.endsWith('-PARTIAL');
                                    const cleanDocNum = doc.documento_numero.replace('-RETRY', '').replace('-PARTIAL', '');
                                    return (
                                        <div 
                                            key={doc.id}
                                            className={`flex items-start gap-3 p-3 border rounded-xl transition-colors ${
                                                isReturn 
                                                    ? 'border-red-200/50 bg-red-500/5 dark:bg-red-950/10 opacity-90' 
                                                    : isSelected 
                                                        ? 'border-blue-500/50 bg-blue-500/5' 
                                                        : 'border-muted/50 hover:bg-muted/30'
                                            }`}
                                        >
                                            <Checkbox
                                                checked={isSelected}
                                                disabled={isReturn}
                                                onCheckedChange={(checked) => {
                                                    if (isReturn) return;
                                                    setSelectedDocIds(prev => 
                                                        checked 
                                                            ? [...prev, doc.id] 
                                                            : prev.filter(id => id !== doc.id)
                                                    );
                                                }}
                                                className="mt-0.5"
                                            />
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-black font-mono leading-none tracking-tight">{cleanDocNum}</span>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {isRetry && (
                                                            <Badge className="text-[9px] font-extrabold px-1.5 py-0 border-none bg-rose-500 text-white dark:bg-rose-600">
                                                                Devolución ↩️
                                                            </Badge>
                                                        )}
                                                        {isPartial && (
                                                            <Badge className="text-[9px] font-extrabold px-1.5 py-0 border-none bg-amber-500 text-white dark:bg-amber-600">
                                                                Parcial 📦
                                                            </Badge>
                                                        )}
                                                        {isReturn ? (
                                                            <Badge className="text-[9px] font-extrabold px-1.5 py-0 border-none bg-red-500/10 text-red-600 dark:bg-red-500/20">
                                                                Nota de Crédito ↩️
                                                            </Badge>
                                                        ) : doc.tipo_documento === 'recoger' ? (
                                                            <Badge className="text-[9px] font-extrabold uppercase px-1.5 py-0 border-none bg-purple-500/10 text-purple-600 dark:bg-purple-500/20">
                                                                Recoger 📦
                                                            </Badge>
                                                        ) : (
                                                            <Badge className={`text-[9px] font-extrabold uppercase px-1.5 py-0 border-none ${doc.tipo_documento === 'factura' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-amber-500/10 text-amber-600'}`}>
                                                                {doc.tipo_documento}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-xs font-bold truncate text-foreground/80">{doc.cliente_nombre}</p>
                                                
                                                {isReturn && doc.factura_original && (
                                                    <div className="pt-0.5">
                                                        <span className="text-[9px] font-extrabold text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-500/20 px-2 py-0.5 rounded border border-red-500/20">
                                                            Ref: Fac {doc.factura_original}
                                                        </span>
                                                    </div>
                                                )}

                                                {doc.tipo_documento === 'recoger' && (
                                                    (() => {
                                                        try {
                                                            const details = JSON.parse(doc.comentario);
                                                            const metodoPagoLabel = details.metodo_pago === 'pagar_al_retirar' ? 'Pagar al retirar' : details.metodo_pago === 'ya_esta_pago' ? 'Ya está pago' : 'Crédito';
                                                            return (
                                                                <div className="mt-1.5 p-2 rounded-lg bg-purple-50/50 dark:bg-purple-950/10 border border-purple-100/30 text-[10px] space-y-1 text-muted-foreground font-semibold">
                                                                    <div><span className="font-bold text-purple-700 dark:text-purple-400">Contacto:</span> {details.proveedor_contacto_nombre} ({details.proveedor_contacto_telefono})</div>
                                                                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                                                                        <div><span className="font-bold text-purple-700 dark:text-purple-400">OC:</span> {details.orden_compra || 'N/D'}</div>
                                                                        <div><span className="font-bold text-purple-700 dark:text-purple-400">FAC:</span> {details.factura || 'N/D'}</div>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-1">
                                                                        <div><span className="font-bold text-purple-700 dark:text-purple-400">Pago:</span> {metodoPagoLabel}</div>
                                                                        <div><span className="font-bold text-purple-700 dark:text-purple-400">Horario:</span> {details.horario_proveedor || 'N/D'}</div>
                                                                    </div>
                                                                    <div><span className="font-bold text-purple-700 dark:text-purple-400">Entrega en:</span> {details.lugar_entrega}</div>
                                                                    {details.detalle_adicional && (
                                                                        <div className="italic text-[9px] border-t border-purple-100/20 pt-1 mt-1 text-muted-foreground/80">
                                                                            &ldquo;{details.detalle_adicional}&rdquo;
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        } catch (e) {
                                                            return <div className="text-[10px] text-red-500">Error parsing details</div>;
                                                        }
                                                    })()
                                                )}

                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold pt-1">
                                                    <span>ERP: {doc.creado_por}</span>
                                                    <span>{doc.fecha_registro}</span>
                                                </div>

                                                {(isRetry || isPartial || doc.tipo_documento === 'recoger') && (
                                                    <div className="flex items-center gap-2 pt-2 border-t border-muted/20">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 px-2.5 rounded-lg text-[10px] font-bold gap-1 border-blue-200 bg-blue-500/5 text-blue-600 hover:bg-blue-500/10"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedBoletaDoc(doc);
                                                            }}
                                                        >
                                                            📄 Boleta
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 px-2.5 rounded-lg text-[10px] font-bold gap-1 border-rose-200 bg-rose-500/5 text-rose-600 hover:bg-rose-500/10"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedDiscardDoc(doc);
                                                            }}
                                                        >
                                                            🗑️ Descartar
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            {filteredQueue.length > visibleCount && (
                                <div className="pt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full text-xs font-bold py-2 hover:bg-muted/50 rounded-xl border border-muted/80 gap-1.5"
                                        onClick={() => setVisibleCount(prev => prev + 100)}
                                    >
                                        Mostrar más (+100)
                                    </Button>
                                </div>
                            )}
                        </CardContent>

                        {/* Batch assign trigger */}
                        {selectedDocIds.length > 0 && (
                            <div className="p-4 bg-muted/40 border-t border-muted/50 space-y-3 rounded-b-2xl">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-blue-600">
                                        {selectedDocIds.length} seleccionados
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <Select 
                                            value={destinationAssignment} 
                                            onValueChange={setDestinationAssignment}
                                        >
                                            <SelectTrigger className="rounded-lg font-bold text-xs h-9 flex-1 bg-background">
                                                <SelectValue placeholder="Asignar a..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {assignments.length === 0 ? (
                                                    <SelectItem disabled value="none">No hay rutas activas hoy (cree una a la derecha)</SelectItem>
                                                ) : (
                                                    assignments.map((ass) => (
                                                        <SelectItem key={ass.id} value={String(ass.id)}>
                                                            {ass.ruta_nombre} - {ass.vehiculo_placa} ({ass.chofer_nombre})
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                        
                                        <Button
                                            onClick={handleAssignSelected}
                                            disabled={!destinationAssignment}
                                            className="h-9 rounded-lg font-black text-xs px-3 shadow"
                                        >
                                            Asignar
                                        </Button>
                                    </div>

                                    <Button
                                        variant="outline"
                                        disabled={processingBatchDeliver}
                                        onClick={handleBatchMarkAsDelivered}
                                        className="w-full h-9 rounded-lg font-extrabold text-xs gap-1.5 border-green-200 bg-green-500/5 hover:bg-green-500/10 text-green-600 dark:border-green-950/40 dark:bg-green-950/20 dark:text-green-400 shadow-sm"
                                    >
                                        {processingBatchDeliver ? (
                                            <>
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                Procesando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckSquare className="w-3.5 h-3.5" />
                                                Marcar como Entregados (Historial)
                                            </>
                                        )}
                                    </Button>
                                </div>

                            </div>
                        )}
                    </Card>
                </div>

                {/* Assignments & Dispatch Right Column (En móvil visible si mobileTab === 'routes', en Desktop siempre visible) */}
                <div className={`lg:col-span-2 space-y-6 ${mobileTab === 'routes' ? 'block' : 'hidden lg:block'}`}>
                    {/* Create Assignment Form (Visible intacto en Desktop, en móvil se abre por modal emergente) */}
                    <Card className="hidden lg:block border-none shadow-md bg-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Plus className="w-5 h-5 text-blue-600" />
                                Nueva Asignación Diaria (Despacho)
                            </CardTitle>
                            <CardDescription>
                                Asocie una ruta logística a un chofer de Telegram y su vehículo para el día de hoy.
                            </CardDescription>
                        </CardHeader>
                        
                        <CardContent>
                            <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-muted-foreground">Ruta Logística</Label>
                                    <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                                        <SelectTrigger className="rounded-lg font-bold text-xs">
                                            <SelectValue placeholder="Seleccione ruta" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {routes.map(r => (
                                                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-muted-foreground">Chofer (Telegram)</Label>
                                    <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                                        <SelectTrigger className="rounded-lg font-bold text-xs">
                                            <SelectValue placeholder="Seleccione chofer" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {drivers.map(d => (
                                                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-muted-foreground">Vehículo (Placa)</Label>
                                    <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                        <SelectTrigger className="rounded-lg font-bold text-xs">
                                            <SelectValue placeholder="Seleccione camión" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {vehicles.map(v => (
                                                <SelectItem key={v.id} value={String(v.id)}>
                                                    {v.plate} ({v.brand} {v.model})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button 
                                    type="submit" 
                                    disabled={creatingAssignment}
                                    className="rounded-lg font-bold text-xs gap-2 h-10 w-full"
                                >
                                    <Plus className="w-4 h-4" />
                                    Crear Asignación
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Active Daily Assignments and Documents inside them */}
                    <div className="space-y-4">
                        <h3 className="text-md font-extrabold flex items-center gap-2">
                            <Route className="w-5 h-5 text-indigo-600" />
                            Rutas y Asignaciones Activas para Hoy
                        </h3>
                        
                        {assignments.length === 0 ? (
                            <div className="text-center p-12 bg-card border rounded-2xl text-xs text-muted-foreground font-semibold shadow-sm">
                                No se han creado asignaciones para hoy. Registre una arriba para iniciar.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {assignments.map((ass) => {
                                    const docsForAss = assignedDocs.filter(d => d.asignacion_id === ass.id);
                                    return (
                                        <Card key={ass.id} className="border-none shadow-md bg-card overflow-hidden">
                                            <div className="p-4 bg-muted/40 border-b border-muted/50 flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <span className="text-sm font-black text-indigo-600 flex items-center gap-1.5">
                                                        <MapPin className="w-4 h-4" />
                                                        {ass.ruta_nombre}
                                                    </span>
                                                    <div className="space-y-0.5 text-xs text-foreground/80 font-bold">
                                                        <div className="flex items-center gap-1">
                                                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                                                            {ass.chofer_nombre}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                                                            {ass.vehiculo_placa}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleReleasePendingDocuments(ass.id)}
                                                        className="rounded-lg h-7 px-2 text-[10px] font-black border-amber-500/20 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 bg-amber-500/5 transition-colors gap-1 shrink-0"
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                        Liberar Pendientes
                                                    </Button>

                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleCloseAssignment(ass.id)}
                                                        className="rounded-lg h-7 px-2 text-[10px] font-black border-red-500/20 text-red-600 hover:bg-red-500/10 hover:text-red-700 bg-red-500/5 transition-colors gap-1 shrink-0"
                                                    >
                                                        <XOctagon className="w-3.5 h-3.5" />
                                                        Forzar Cierre
                                                    </Button>
                                                </div>
                                            </div>

                                            <CardContent className="p-4 space-y-2">
                                                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">
                                                    Entregas en esta Ruta ({docsForAss.length})
                                                </span>
                                                {docsForAss.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground font-semibold italic p-3 text-center bg-muted/10 border border-dashed rounded-xl">
                                                        Sin entregas asignadas aún.
                                                    </p>
                                                ) : (
                                                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                                        {docsForAss.map((doc) => {
                                                            const isRetry = doc.documento_numero.endsWith('-RETRY');
                                                            const isPartial = doc.documento_numero.endsWith('-PARTIAL');
                                                            const cleanDocNum = doc.documento_numero.replace('-RETRY', '').replace('-PARTIAL', '');
                                                            return (
                                                                <div 
                                                                    key={doc.id}
                                                                    className="flex items-center justify-between p-2.5 bg-muted/20 border border-muted/50 rounded-xl hover:bg-muted/30 transition-colors gap-3"
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="text-xs font-black font-mono leading-none">{cleanDocNum}</span>
                                                                            {isRetry && (
                                                                                <Badge className="text-[8px] font-extrabold px-1 py-0.5 border-none bg-rose-500 text-white dark:bg-rose-600">
                                                                                    Devolución ↩️
                                                                                </Badge>
                                                                            )}
                                                                            {isPartial && (
                                                                                <Badge className="text-[8px] font-extrabold px-1 py-0.5 border-none bg-amber-500 text-white dark:bg-amber-600">
                                                                                    Parcial 📦
                                                                                </Badge>
                                                                            )}
                                                                            <Badge className={`text-[8px] font-extrabold uppercase px-1 py-0.5 border-none ${
                                                                                doc.estado === 'completo' ? 'bg-emerald-500/10 text-emerald-600' :
                                                                                doc.estado === 'incompleto' ? 'bg-amber-500/10 text-amber-600' :
                                                                                doc.estado === 'rechazado' ? 'bg-red-500/10 text-red-600' :
                                                                                'bg-blue-500/10 text-blue-600'
                                                                            }`}>
                                                                                {doc.estado}
                                                                            </Badge>
                                                                        
                                                                        {doc.tipo_documento === 'recoger' && (
                                                                            <Badge className="text-[8px] font-extrabold uppercase px-1 py-0.5 border-none bg-purple-500/15 text-purple-600 dark:bg-purple-500/25">
                                                                                Recoger 📦
                                                                            </Badge>
                                                                        )}

                                                                        {doc.telegram_lock_at && (
                                                                            <Badge className="text-[8px] font-extrabold px-1 py-0.5 border-none bg-amber-500/15 text-amber-600 dark:bg-amber-500/25 flex items-center gap-0.5 animate-pulse">
                                                                                🔒 Telegram
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[10px] font-bold text-foreground/80 truncate pt-0.5">{doc.cliente_nombre}</p>
                                                                    
                                                                    {doc.tipo_documento === 'recoger' && (
                                                                        (() => {
                                                                            try {
                                                                                const details = JSON.parse(doc.comentario);
                                                                                const metodoPagoLabel = details.metodo_pago === 'pagar_al_retirar' ? 'Pagar al retirar' : details.metodo_pago === 'ya_esta_pago' ? 'Ya está pago' : 'Crédito';
                                                                                return (
                                                                                    <div className="mt-1 p-1.5 rounded bg-purple-50/50 dark:bg-purple-950/10 border border-purple-100/30 text-[9px] space-y-0.5 text-muted-foreground font-semibold">
                                                                                        <div><span className="font-bold text-purple-700 dark:text-purple-400">Contacto:</span> {details.proveedor_contacto_nombre} ({details.proveedor_contacto_telefono})</div>
                                                                                        <div className="grid grid-cols-2 gap-1">
                                                                                            <div><span className="font-bold text-purple-700 dark:text-purple-400">OC:</span> {details.orden_compra || 'N/D'}</div>
                                                                                            <div><span className="font-bold text-purple-700 dark:text-purple-400">Pago:</span> {metodoPagoLabel}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            } catch (e) {
                                                                                return null;
                                                                            }
                                                                        })()
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    {doc.telegram_lock_at && (
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            title="Desbloquear de Telegram"
                                                                            onClick={() => handleUnlockDocument(doc)}
                                                                            className="w-7 h-7 p-0 rounded-lg border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-600 transition-colors"
                                                                        >
                                                                            🔒
                                                                        </Button>
                                                                    )}

                                                                    <Select 
                                                                        onValueChange={(val) => handleReassign(doc.id, val)}
                                                                    >
                                                                        <SelectTrigger className="w-9 h-7 p-0 rounded-lg border-muted/80 bg-background flex items-center justify-center">
                                                                            <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="unassign" className="text-red-600 focus:text-red-700 font-bold">
                                                                                ⚠️ Regresar a Cola General (Desasignar)
                                                                            </SelectItem>
                                                                            {assignments.filter(a => a.id !== ass.id).map((otherAss) => (
                                                                                <SelectItem key={otherAss.id} value={String(otherAss.id)}>
                                                                                    Mover a {otherAss.ruta_nombre}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Dynamic Confirmation Dialog (v4.1) */}
            <AlertDialog 
                open={confirmConfig.isOpen} 
                onOpenChange={(open) => setConfirmConfig(prev => ({ ...prev, isOpen: open }))}
            >
                <AlertDialogContent className="rounded-2xl border border-muted bg-background">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-md font-extrabold flex items-center gap-2">
                            {confirmConfig.title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs font-semibold leading-relaxed whitespace-pre-line text-muted-foreground">
                            {confirmConfig.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex gap-2 justify-end">
                        <AlertDialogCancel className="rounded-xl font-bold text-xs">
                            {confirmConfig.cancelLabel || 'Cancelar'}
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={async () => {
                                await confirmConfig.onConfirm();
                            }}
                            className={`rounded-xl font-black text-xs ${
                                confirmConfig.isDestructive 
                                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                        >
                            {confirmConfig.actionLabel || 'Confirmar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Boleta de Incidencia Dialog (Task 5) */}
            <Dialog open={!!selectedBoletaDoc} onOpenChange={(open) => !open && setSelectedBoletaDoc(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-muted bg-background flex flex-col p-6">
                    <DialogHeader>
                        <DialogTitle className="text-md font-extrabold flex items-center gap-2">
                            📄 Boleta de Incidencia / Solicitud: {selectedBoletaDoc?.documento_numero}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-medium text-muted-foreground">
                            Visualice la boleta con formato de impresión, imprímala nativamente en tamaño carta o envíela al cliente.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Actions bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-muted/20 border border-muted/50 rounded-xl mt-4">
                        <div className="flex-1 space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Enviar a Correo Electrónico</Label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        type="email"
                                        placeholder="correo@cliente.com"
                                        value={emailTarget}
                                        onChange={(e) => setEmailTarget(e.target.value)}
                                        className="h-9 rounded-lg font-semibold text-xs focus-visible:ring-blue-500"
                                    />
                                    {clientEmails.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {clientEmails.map((em) => (
                                                <button
                                                    key={em}
                                                    type="button"
                                                    onClick={() => setEmailTarget(em)}
                                                    className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 transition-colors"
                                                >
                                                    {em}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <Button
                                    size="sm"
                                    onClick={async () => {
                                        if (!emailTarget || !emailTarget.includes('@')) {
                                            toast({ title: 'Correo inválido', description: 'Por favor ingrese un correo válido.', variant: 'warning' } as any);
                                            return;
                                        }
                                        setSendingBoletaEmail(true);
                                        try {
                                            const res = await sendBoletaManualEmail(selectedBoletaDoc.id, emailTarget);
                                            if (res.success) {
                                                await saveClientEmail(selectedBoletaDoc.cliente_id, emailTarget);
                                                toast({ title: 'Correo enviado', description: `Se ha enviado la boleta a ${emailTarget} con éxito.` });
                                                const updatedEmails = await getClientEmails(selectedBoletaDoc.cliente_id);
                                                setClientEmails(updatedEmails);
                                            } else {
                                                throw new Error(res.error);
                                            }
                                        } catch (e: any) {
                                            toast({ title: 'Error al enviar correo', description: e.message, variant: 'destructive' });
                                        } finally {
                                            setSendingBoletaEmail(false);
                                        }
                                    }}
                                    disabled={sendingBoletaEmail}
                                    className="h-9 rounded-lg font-bold text-xs gap-1 px-3 bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {sendingBoletaEmail ? 'Enviando...' : 'Enviar Correo'}
                                </Button>
                            </div>
                        </div>

                        <div className="flex items-end shrink-0 pt-2 sm:pt-0">
                            <Button
                                size="sm"
                                onClick={handleDownloadPdf}
                                className="h-9 rounded-lg font-bold text-xs gap-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
                            >
                                📥 Descargar PDF
                            </Button>
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div className="flex-1 min-h-[400px] border border-muted/80 rounded-xl overflow-hidden bg-white mt-4 p-4 shadow-inner">
                        {boletaHtml ? (
                            <iframe
                                srcDoc={boletaHtml}
                                className="w-full h-[500px] border-none"
                                title="Vista Previa de Boleta"
                            />
                        ) : (
                            <div className="h-full flex items-center justify-center text-xs font-bold text-muted-foreground animate-pulse">
                                <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
                                Generando vista previa de la boleta...
                            </div>
                        )}
                    </div>

                    <DialogFooter className="mt-4">
                        <Button
                            variant="outline"
                            onClick={() => setSelectedBoletaDoc(null)}
                            className="rounded-xl font-bold text-xs"
                        >
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Descartar Documento Dialog (Task 5) */}
            <Dialog open={!!selectedDiscardDoc} onOpenChange={(open) => !open && setSelectedDiscardDoc(null)}>
                <DialogContent className="sm:max-w-[425px] rounded-2xl border border-muted bg-background">
                    <DialogHeader>
                        <DialogTitle className="text-md font-extrabold flex items-center gap-2 text-rose-600">
                            🚨 Descartar Documento de la Cola
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-muted-foreground">
                            El documento {selectedDiscardDoc?.documento_numero} será marcado como &quot;Descartado&quot; y ya no aparecerá en la cola de despacho activa ni de Telegram.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-extrabold text-muted-foreground">Motivo del Descarte</Label>
                            <Input
                                placeholder="Ej. Cliente retiró en sucursal, OC cancelada..."
                                value={discardReason}
                                onChange={(e) => setDiscardReason(e.target.value)}
                                className="rounded-xl font-bold text-xs"
                            />
                        </div>
                    </div>

                    <DialogFooter className="flex gap-2 justify-end">
                        <Button
                            variant="outline"
                            onClick={() => setSelectedDiscardDoc(null)}
                            className="rounded-xl font-bold text-xs"
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!discardReason.trim()) {
                                    toast({ title: 'Motivo requerido', description: 'Por favor escriba el motivo del descarte.', variant: 'warning' } as any);
                                    return;
                                }
                                setDiscardingDoc(true);
                                try {
                                    const res = await discardQueueDocument(selectedDiscardDoc.id, selectedDiscardDoc.documento_numero, discardReason.trim());
                                    if (res.success) {
                                        toast({ title: 'Documento descartado', description: `El documento ${selectedDiscardDoc.documento_numero} fue descartado.` });
                                        setSelectedDiscardDoc(null);
                                        setDiscardReason('');
                                        const [q, ad] = await Promise.all([getGeneralQueue(), getAssignedDeliveriesToday()]);
                                        setQueue(q);
                                        setAssignedDocs(ad);
                                    } else {
                                        throw new Error(res.error);
                                    }
                                } catch (e: any) {
                                    toast({ title: 'Error al descartar', description: e.message, variant: 'destructive' });
                                } finally {
                                    setDiscardingDoc(false);
                                }
                            }}
                            disabled={discardingDoc}
                            className="rounded-xl font-black text-xs gap-1.5"
                        >
                            {discardingDoc ? 'Descartando...' : 'Confirmar Descarte'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* MOBILE ONLY: Modal Emergente (Dialog) de Nueva Asignación Diaria */}
            <Dialog open={mobileRouteModalOpen} onOpenChange={setMobileRouteModalOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl border bg-background">
                    <DialogHeader>
                        <DialogTitle className="text-base font-black flex items-center gap-2">
                            <Plus className="w-5 h-5 text-emerald-600" />
                            Nueva Asignación Diaria
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Asocie una ruta a un chofer de Telegram y vehículo para operar hoy.
                        </DialogDescription>
                    </DialogHeader>

                    <form 
                        onSubmit={async (e) => {
                            await handleCreateAssignment(e);
                            setMobileRouteModalOpen(false);
                            setMobileTab('routes');
                        }} 
                        className="space-y-4 py-2"
                    >
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Ruta Logística</Label>
                            <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                                <SelectTrigger className="rounded-xl font-bold text-xs h-10">
                                    <SelectValue placeholder="Seleccione ruta" />
                                </SelectTrigger>
                                <SelectContent>
                                    {routes.map(r => (
                                        <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Chofer (Telegram)</Label>
                            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                                <SelectTrigger className="rounded-xl font-bold text-xs h-10">
                                    <SelectValue placeholder="Seleccione chofer" />
                                </SelectTrigger>
                                <SelectContent>
                                    {drivers.map(d => (
                                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground">Vehículo (Placa)</Label>
                            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                <SelectTrigger className="rounded-xl font-bold text-xs h-10">
                                    <SelectValue placeholder="Seleccione vehículo" />
                                </SelectTrigger>
                                <SelectContent>
                                    {vehicles.map(v => (
                                        <SelectItem key={v.id} value={String(v.id)}>
                                            {v.plate} ({v.brand} {v.model})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <DialogFooter className="flex gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setMobileRouteModalOpen(false)}
                                className="rounded-xl font-bold text-xs flex-1"
                            >
                                Cancelar
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={creatingAssignment}
                                className="rounded-xl font-black text-xs gap-1.5 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                {creatingAssignment ? 'Creando...' : 'Crear Asignación'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MOBILE ONLY: Sticky Floating Action Bar al seleccionar pedidos en la cola */}
            {selectedDocIds.length > 0 && mobileTab === 'queue' && (
                <div className="fixed bottom-0 inset-x-0 p-3 pb-5 bg-background/95 dark:bg-background/95 backdrop-blur-md border-t border-border z-40 lg:hidden shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
                    <div className="max-w-md mx-auto space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                                ⚡ {selectedDocIds.length} pedidos seleccionados
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDocIds([])}
                                className="h-6 px-2 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                            >
                                Desmarcar todos
                            </Button>
                        </div>

                        <div className="flex gap-2">
                            <Select 
                                value={destinationAssignment} 
                                onValueChange={setDestinationAssignment}
                            >
                                <SelectTrigger className="rounded-xl font-bold text-xs h-9 flex-1 bg-card">
                                    <SelectValue placeholder="Asignar a ruta..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {assignments.length === 0 ? (
                                        <SelectItem disabled value="none">Sin rutas activas hoy</SelectItem>
                                    ) : (
                                        assignments.map((ass) => (
                                            <SelectItem key={ass.id} value={String(ass.id)}>
                                                {ass.ruta_nombre} - {ass.vehiculo_placa}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>

                            <Button
                                onClick={handleAssignSelected}
                                disabled={!destinationAssignment}
                                className="h-9 rounded-xl font-black text-xs px-3.5 bg-blue-600 hover:bg-blue-700 text-white shadow shrink-0"
                            >
                                Asignar
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                disabled={processingBatchDeliver}
                                onClick={handleBatchMarkAsDelivered}
                                title="Marcar como Entregados (Historial)"
                                className="h-9 px-2.5 rounded-xl font-extrabold text-[10px] gap-1 border-green-200 bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-400 shrink-0"
                            >
                                {processingBatchDeliver ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <>
                                        <CheckSquare className="w-3.5 h-3.5" />
                                        <span>Entregados</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
