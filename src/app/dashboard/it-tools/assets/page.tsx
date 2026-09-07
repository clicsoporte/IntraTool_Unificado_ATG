'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useAuth } from '@/modules/core/hooks/useAuth';
import {
    getItAssets,
    saveItAsset,
    deleteItAsset,
    getItBranches,
    getItLicensesCatalog,
    assignItAsset,
    returnItAsset,
    sendAssetAssignmentEmail,
    addItAssetComponent,
    removeItAssetComponent,
    addItAssetLicense,
    removeItAssetLicense,
    getItHrAlerts,
    getItPlanExpirationAlerts,
    getSystemUsersList,
    getItAssetById,
    getItAssetCategories,
    getItStandardAccessories,
    uploadAssetDocument,
    deleteAssetDocument,
    sendAgentCommandAction
} from '@/modules/it-tools/lib/actions';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
    Cpu,
    Search,
    Plus,
    UserCheck,
    Pencil,
    Trash2,
    Calendar,
    DollarSign,
    ShieldAlert,
    AlertTriangle,
    Bell,
    Info,
    Laptop,
    CheckCircle,
    HelpCircle,
    Loader2,
    Undo2,
    SlidersHorizontal,
    KeyRound,
    Tag,
    X,
    FileText,
    Smartphone,
    Phone,
    Download,
    Printer,
    FileDown,
    FileUp,
    Paperclip,
    ExternalLink,
    History,
    Clock,
    ArrowRightLeft,
    UserX
} from 'lucide-react';
import jsPDF from 'jspdf';
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

export default function ItAssetsPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized } = useAuthorization();
    const { exchangeRateData } = useAuth();
    const { toast } = useToast();

    // Data lists
    const [loading, setLoading] = useState(true);
    const [assets, setAssets] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [licensesCatalog, setLicensesCatalog] = useState<any[]>([]);
    const [hrAlerts, setHrAlerts] = useState<any[]>([]);
    const [planAlerts, setPlanAlerts] = useState<any[]>([]);
    const [systemUsers, setSystemUsers] = useState<any[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [standardAccessoriesCatalog, setStandardAccessoriesCatalog] = useState<string[]>([]);
    const [tiInventoryItems, setTiInventoryItems] = useState<any[]>([]);

    // Search and filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterBranch, setFilterBranch] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    // Selected asset detail view
    const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Modal forms toggles
    const [showAssetForm, setShowAssetForm] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showComponentsModal, setShowComponentsModal] = useState(false);
    const [showLicensesModal, setShowLicensesModal] = useState(false);
    const [showAgentGuide, setShowAgentGuide] = useState(false);
    const [docToDelete, setDocToDelete] = useState<number | null>(null);
    const [executingCmd, setExecutingCmd] = useState<string | null>(null);

    const handleSendRemoteCommand = async (assetId: number, commandType: string, payload: any = {}) => {
        setExecutingCmd(commandType);
        try {
            const res = await sendAgentCommandAction(assetId, commandType, payload);
            if (res.success) {
                toast({
                    title: 'Comando Remoto Enviado',
                    description: `El comando '${commandType}' fue enviado al agente del equipo (ID #${assetId}).`,
                });
            } else {
                toast({
                    title: 'Error al enviar comando',
                    description: res.error || 'No se pudo registrar la orden remota.',
                    variant: 'destructive'
                });
            }
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.message,
                variant: 'destructive'
            });
        } finally {
            setExecutingCmd(null);
        }
    };

    const downloadSilentScript = () => {
        const scriptContent = `# Script de Instalación Silenciosa 1-Clic para ClicToolsAgent
$ServerUrl = "http://192.168.1.14:9003"
$DownloadUrl = "$ServerUrl/downloads/Agente/ClicToolsAgent-Setup.exe"
$DestPath = "$env:TEMP\\ClicToolsAgent-Setup.exe"

Write-Host "Descargando ClicToolsAgent..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $DownloadUrl -OutFile $DestPath

Write-Host "Instalando servicio ClicToolsAgent..." -ForegroundColor Green
Start-Process -FilePath $DestPath -ArgumentList "/S /SERVERURL=$ServerUrl" -Wait

Write-Host "¡Instalación completada exitosamente!" -ForegroundColor Green
`;
        const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'Instalar-ClicToolsAgent.ps1');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Form states
    const [assetForm, setAssetForm] = useState<any>({
        id: undefined,
        item_id: '',
        category: 'Laptop',
        brand: '',
        model: '',
        serial_number: '',
        hardware_id: '',
        status: 'active',
        purchase_date: '',
        purchase_cost: '',
        currency: 'CRC',
        exchange_rate: 1.0,
        warranty_expiration: '',
        branch_id: '',
        notes: '',
        imei: '',
        phone_number: '',
        telephony_provider: '',
        data_plan_start: '',
        data_plan_end: '',
        data_plan_renewal: 'monthly',
        processor: '',
        ram_memory: '',
        storage_capacity: '',
        bitlocker_id: '',
        bitlocker_key: '',
        standard_accessories: {
            charger: true,
            mouse: true,
            bag: true,
            kensington: true,
            monitor: false,
            keyboard: false,
            headset: false,
            usb_adapter: false
        },
        selected_software_ids: [] as number[]
    });

    const [assignmentForm, setAssignmentForm] = useState({
        collaboratorId: ''
    });

    const unifiedCollaborators = useMemo(() => {
        const isInactive = (u: any) =>
            u.is_active === 0 || u.is_active === '0' || u.is_active === '0.0';

        return (systemUsers || [])
            .filter((u: any) => !isInactive(u))
            .map((u: any) => ({
                id: `usr-${u.id}`,
                value: u.id,
                type: 'system_user' as const,
                name: u.name,
                detail: u.email,
                linkedUserId: u.id,
                linkedEmployeeCode: u.employeeId || null,
                active: true
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [systemUsers]);

    const [newComponent, setNewComponent] = useState({
        component_name: '',
        brand: '',
        model: '',
        serial_number: ''
    });

    const [newLicense, setNewLicense] = useState({
        license_catalog_id: '',
        license_key: '',
        expiration_date: ''
    });

    const [showDocumentsModal, setShowDocumentsModal] = useState(false);
    const [documentForm, setDocumentForm] = useState<{ title: string; document_type: string; file: File | null }>({
        title: '',
        document_type: 'invoice',
        file: null
    });
    const [uploadingDoc, setUploadingDoc] = useState(false);

    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setTitle("Gestión de Activos (ITAM)");
    }, [setTitle]);

    const loadAllData = useCallback(async () => {
        setLoading(true);
        try {
            const { getInventoryItems } = await import('@/modules/inventory/lib/actions');
            const [assetsData, branchesData, catalogData, alertsData, planAlertsData, usersData, categoriesData, inventoryItemsData, accessoriesData] = await Promise.all([
                getItAssets(),
                getItBranches(),
                getItLicensesCatalog(),
                getItHrAlerts(),
                getItPlanExpirationAlerts(),
                getSystemUsersList(),
                getItAssetCategories(),
                getInventoryItems(2),
                getItStandardAccessories()
            ]);
            setAssets(assetsData);
            setBranches(branchesData);
            setLicensesCatalog(catalogData);
            setHrAlerts(alertsData);
            setPlanAlerts(planAlertsData);
            setSystemUsers(usersData);
            setCategories(categoriesData);
            setTiInventoryItems(inventoryItemsData.filter((item: any) => item.status === 'active'));
            setStandardAccessoriesCatalog(accessoriesData);

            setAssetForm((prev: any) => {
                if (branchesData.length > 0 && !prev.branch_id) {
                    return { ...prev, branch_id: branchesData[0].id };
                }
                return prev;
            });
        } catch (error) {
            console.error("Error loading ITAM data", error);
            toast({
                variant: "destructive",
                title: "Error de carga",
                description: "No se pudieron obtener los activos o los catálogos."
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (isAuthorized) {
            loadAllData();
        }
    }, [isAuthorized, loadAllData]);

    // Fill current exchange rate when currency changes
    useEffect(() => {
        if (assetForm.currency === 'USD') {
            setAssetForm((prev: any) => ({ ...prev, exchange_rate: 1.0 }));
        } else if (exchangeRateData?.rate) {
            setAssetForm((prev: any) => ({ ...prev, exchange_rate: exchangeRateData.rate }));
        }
    }, [assetForm.currency, exchangeRateData]);

    const handleLoadAssetDetails = async (id: number) => {
        // Optimistic display to prevent layout bouncing and flashing
        const localAsset = assets.find(a => a.id === id);
        if (localAsset && (!selectedAsset || selectedAsset.id !== id)) {
            setSelectedAsset((prev: any) => ({
                ...(localAsset || {}),
                components: prev?.id === id ? prev.components : [],
                licenses: prev?.id === id ? prev.licenses : [],
                assignments: prev?.id === id ? prev.assignments : [],
                tickets: prev?.id === id ? prev.tickets : [],
                documents: prev?.id === id ? prev.documents : []
            }));
        }

        if (!selectedAsset) {
            setLoadingDetails(true);
        }

        try {
            const details = await getItAssetById(id);
            setSelectedAsset(details);
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error de detalles",
                description: "No se pudo cargar la información completa del activo."
            });
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleDownloadAssetHandoverPdf = async (assetTarget: any) => {
        if (!assetTarget) return;
        try {
            // Ensure we have full details including components and licenses
            let fullAsset = assetTarget;
            if (!fullAsset.components || !fullAsset.licenses) {
                try {
                    fullAsset = await getItAssetById(assetTarget.id);
                } catch (_) {
                    fullAsset = assetTarget;
                }
            }

            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
            const pageWidth = 215.9;
            const marginX = 14;
            const contentWidth = pageWidth - (marginX * 2); // 187.9 mm
            let currentY = 12;

            // Header Banner: REGISTRO / ENTREGA DE EQUIPOS / R-INFO-002
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.setFillColor(255, 255, 255);
            doc.rect(marginX, currentY, contentWidth, 18);

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);
            doc.text("REGISTRO", pageWidth / 2, currentY + 5, { align: 'center' });
            doc.setFontSize(10);
            doc.text("ENTREGA DE EQUIPOS", pageWidth / 2, currentY + 10, { align: 'center' });
            doc.setFontSize(9);
            doc.text("R-INFO-002", pageWidth / 2, currentY + 15, { align: 'center' });
            currentY += 18;

            // Metadata row: Fecha de Emision, Edicion, Aprobó
            doc.rect(marginX, currentY, contentWidth, 6);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(7.5);
            const emitDate = "Fecha de Emisión: 13/05/2019";
            const edicionStr = "Edición: 03   Fecha de Edición: 22/03/2023";
            const aproboStr = "Aprobó: Gerencia General";
            doc.text(emitDate, marginX + 3, currentY + 4.2);
            doc.text(edicionStr, pageWidth / 2 - 15, currentY + 4.2);
            doc.text(aproboStr, marginX + contentWidth - 38, currentY + 4.2);
            currentY += 8;

            // 1. DATOS DEL COLABORADOR
            doc.setFillColor(240, 240, 240);
            doc.rect(marginX, currentY, contentWidth, 5, 'FD');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.text("DATOS DEL COLABORADOR", pageWidth / 2, currentY + 3.8, { align: 'center' });
            currentY += 5;

            // Assignee details resolution (Auto-fill with real data, otherwise leave blank for manual handwriting)
            const assigneeName = fullAsset.employee_name || fullAsset.user_name || '';
            const assigneeEmail = fullAsset.user_email || (fullAsset.employee_name ? `${fullAsset.employee_name.toLowerCase().replace(/\s+/g, '.')}@industriasgarend.com` : '');
            const assigneeCode = fullAsset.employee_tax_id || fullAsset.employee_code || (fullAsset.user_id ? `USR-${fullAsset.user_id}` : '');
            const assigneePosition = fullAsset.employee_position_name || fullAsset.employee_position || fullAsset.employee_dept || '';
            const assigneePhone = fullAsset.phone_number || fullAsset.user_phone || fullAsset.dev_driver_phone || '';
            const branchName = fullAsset.branch_name ? `${fullAsset.branch_name} (${fullAsset.branch_code || ''})` : '';

            // Table 1: Colaborador (Rows)
            doc.setFontSize(7.5);
            // Row 1: Nombre | Cargo | Usuario de Red
            doc.rect(marginX, currentY, 60, 6);
            doc.rect(marginX + 60, currentY, 65, 6);
            doc.rect(marginX + 125, currentY, contentWidth - 125, 6);
            doc.setFont('Helvetica', 'bold');
            doc.text("Nombre:", marginX + 2, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            if (assigneeName) doc.text(assigneeName.slice(0, 32), marginX + 16, currentY + 4.2);

            doc.setFont('Helvetica', 'bold');
            doc.text("Cargo:", marginX + 62, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            if (assigneePosition) doc.text(assigneePosition.slice(0, 30), marginX + 74, currentY + 4.2);

            doc.setFont('Helvetica', 'bold');
            doc.text("Usuario de Red:", marginX + 127, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            if (fullAsset.user_name) doc.text(fullAsset.user_name.toLowerCase(), marginX + 152, currentY + 4.2);
            currentY += 6;

            // Row 2: Correo | Cedula | Telefono - Ext
            doc.rect(marginX, currentY, 60, 6);
            doc.rect(marginX + 60, currentY, 65, 6);
            doc.rect(marginX + 125, currentY, contentWidth - 125, 6);
            doc.setFont('Helvetica', 'bold');
            doc.text("Correo:", marginX + 2, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            if (assigneeEmail) doc.text(assigneeEmail.slice(0, 30), marginX + 14, currentY + 4.2);

            doc.setFont('Helvetica', 'bold');
            doc.text("Cédula/Cód:", marginX + 62, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            if (assigneeCode) doc.text(String(assigneeCode), marginX + 80, currentY + 4.2);

            doc.setFont('Helvetica', 'bold');
            doc.text("Teléfono/Ext:", marginX + 127, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            if (assigneePhone) doc.text(assigneePhone, marginX + 148, currentY + 4.2);
            currentY += 6;

            // Row 3: Sede / Departamento
            doc.rect(marginX, currentY, 60, 6);
            doc.rect(marginX + 60, currentY, 65, 6);
            doc.rect(marginX + 125, currentY, contentWidth - 125, 6);
            doc.setFont('Helvetica', 'bold');
            doc.text("Sede / Sucursal:", marginX + 2, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            if (branchName) doc.text(branchName, marginX + 24, currentY + 4.2);

            doc.setFont('Helvetica', 'bold');
            doc.text("Departamento:", marginX + 62, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            if (fullAsset.employee_dept) doc.text(fullAsset.employee_dept, marginX + 84, currentY + 4.2);

            doc.setFont('Helvetica', 'bold');
            doc.text("Fecha Asig.:", marginX + 127, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            const asgDate = fullAsset.assigned_date ? new Date(fullAsset.assigned_date).toLocaleDateString('es-CR') : new Date().toLocaleDateString('es-CR');
            doc.text(asgDate, marginX + 146, currentY + 4.2);
            currentY += 8;

            // 2. HARDWARE & SEGURIDAD
            doc.setFillColor(240, 240, 240);
            doc.rect(marginX, currentY, contentWidth, 5, 'FD');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.text("ESPECIFICACIONES DE HARDWARE, SEGURIDAD Y FINANZAS", pageWidth / 2, currentY + 3.8, { align: 'center' });
            currentY += 5;

            // Hardware Row 1: Tipo Checkboxes, Red, Marca, Modelo, Serie
            doc.rect(marginX, currentY, 40, 6);
            doc.rect(marginX + 40, currentY, 35, 6);
            doc.rect(marginX + 75, currentY, 35, 6);
            doc.rect(marginX + 110, currentY, 40, 6);
            doc.rect(marginX + 150, currentY, contentWidth - 150, 6);

            doc.setFontSize(7);
            doc.setFont('Helvetica', 'bold');
            doc.text("TIPO", marginX + 15, currentY + 4.2);
            doc.text("NOMBRE DE RED", marginX + 43, currentY + 4.2);
            doc.text("MARCA", marginX + 85, currentY + 4.2);
            doc.text("MODELO", marginX + 120, currentY + 4.2);
            doc.text("NUMERO SERIE", marginX + 155, currentY + 4.2);
            currentY += 6;

            const isDesktop = fullAsset.category?.toLowerCase().includes('desktop') || fullAsset.category?.toLowerCase().includes('escritorio');
            const isLaptop = fullAsset.category?.toLowerCase().includes('laptop') || fullAsset.category?.toLowerCase().includes('portatil') || fullAsset.category?.toLowerCase().includes('notebook');
            const isMobile = ['celular', 'móvil', 'movil', 'tablet', 'phone', 'smartphone'].includes(fullAsset.category?.toLowerCase());

            doc.rect(marginX, currentY, 40, 7);
            doc.rect(marginX + 40, currentY, 35, 7);
            doc.rect(marginX + 75, currentY, 35, 7);
            doc.rect(marginX + 110, currentY, 40, 7);
            doc.rect(marginX + 150, currentY, contentWidth - 150, 7);

            doc.setFontSize(6.5);
            doc.setFont('Helvetica', 'normal');
            doc.text(`${isDesktop ? '[X]' : '[ ]'} DESKTOP  ${isLaptop ? '[X]' : '[ ]'} LAPTOP`, marginX + 2, currentY + 3.2);
            doc.text(`${isMobile ? '[X]' : '[ ]'} DISP. MOVIL  ${(!isDesktop && !isLaptop && !isMobile) ? '[X]' : '[ ]'} OTRO`, marginX + 2, currentY + 6);

            doc.setFontSize(7.5);
            if (fullAsset.serial_number && !isMobile) doc.text(`PC-${fullAsset.serial_number.slice(0, 8).toUpperCase()}`, marginX + 42, currentY + 4.5);
            if (fullAsset.brand) doc.text(fullAsset.brand.toUpperCase(), marginX + 77, currentY + 4.5);
            if (fullAsset.model) doc.text(fullAsset.model.toUpperCase(), marginX + 112, currentY + 4.5);
            if (fullAsset.serial_number) doc.text(String(fullAsset.serial_number).toUpperCase(), marginX + 152, currentY + 4.5);
            currentY += 7;

            // Hardware Specs (Processor, RAM, Disk, BitLocker, Valor, Garantía)
            doc.rect(marginX, currentY, 45, 6);
            doc.rect(marginX + 45, currentY, 35, 6);
            doc.rect(marginX + 80, currentY, 40, 6);
            doc.rect(marginX + 120, currentY, 40, 6);
            doc.rect(marginX + 160, currentY, contentWidth - 160, 6);

            doc.setFontSize(6.5);
            doc.setFont('Helvetica', 'bold');
            doc.text("PROCESADOR (CPU)", marginX + 8, currentY + 4);
            doc.text("MEMORIA RAM", marginX + 50, currentY + 4);
            doc.text("ALMACENAMIENTO (DISCO)", marginX + 82, currentY + 4);
            doc.text("VALOR CONTABLE", marginX + 126, currentY + 4);
            doc.text("VENCE GARANTÍA", marginX + 163, currentY + 4);
            currentY += 6;

            const cpuVal = fullAsset.processor || (isMobile ? 'OCTA-CORE ARM' : '');
            const ramVal = fullAsset.ram_memory || (fullAsset.components || []).find((c: any) => c.component_name?.toLowerCase().includes('ram'))?.serial_number || (isMobile ? '4 GB' : '');
            const diskVal = fullAsset.storage_capacity || (fullAsset.components || []).find((c: any) => c.component_name?.toLowerCase().includes('disco') || c.component_name?.toLowerCase().includes('ssd'))?.serial_number || (isMobile ? '64 GB' : '');
            const costVal = fullAsset.purchase_cost ? `${fullAsset.currency === 'USD' ? '$' : 'CRC '}${Number(fullAsset.purchase_cost).toLocaleString('es-CR')}` : '';
            const warrantyVal = fullAsset.warranty_expiration ? new Date(fullAsset.warranty_expiration).toLocaleDateString('es-CR') : 'Vigente Fábrica';

            doc.rect(marginX, currentY, 45, 6);
            doc.rect(marginX + 45, currentY, 35, 6);
            doc.rect(marginX + 80, currentY, 40, 6);
            doc.rect(marginX + 120, currentY, 40, 6);
            doc.rect(marginX + 160, currentY, contentWidth - 160, 6);

            doc.setFontSize(7);
            doc.setFont('Helvetica', 'normal');
            if (cpuVal) doc.text(cpuVal.slice(0, 26), marginX + 2, currentY + 4.2);
            if (ramVal) doc.text(ramVal, marginX + 48, currentY + 4.2);
            if (diskVal) doc.text(diskVal, marginX + 83, currentY + 4.2);
            if (costVal) doc.text(costVal, marginX + 124, currentY + 4.2);
            if (warrantyVal) doc.text(warrantyVal, marginX + 164, currentY + 4.2);
            currentY += 6;

            // BitLocker Line
            doc.rect(marginX, currentY, contentWidth, 6);
            doc.setFontSize(6.8);
            doc.setFont('Helvetica', 'bold');
            doc.text("Seguridad BitLocker / Bóveda TI:", marginX + 2, currentY + 4.2);
            doc.setFont('Helvetica', 'normal');
            const bitlockerText = fullAsset.bitlocker_id 
                ? `ID: ${fullAsset.bitlocker_id}    Clave: [CUSTODIADA EN BÓVEDA TI GAREND]`
                : (fullAsset.serial_number && !isMobile 
                    ? `ID: {${fullAsset.serial_number.toUpperCase()}}    Clave: [CUSTODIADA EN BÓVEDA TI GAREND]`
                    : "ID: _____________________________    Clave: _____________________________");
            doc.text(bitlockerText, marginX + 48, currentY + 4.2);
            currentY += 8;

            // 3. ACCESORIOS Y PERIFÉRICOS (Opción A Híbrida)
            doc.setFillColor(240, 240, 240);
            doc.rect(marginX, currentY, contentWidth, 5, 'FD');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.text("ACCESORIOS, PERIFÉRICOS Y COMPONENTES ENTREGADOS", pageWidth / 2, currentY + 3.8, { align: 'center' });
            currentY += 5;

            // Parse standard accessories
            let accState: Record<string, boolean> = {};
            if (fullAsset.standard_accessories_json) {
                try {
                    const parsed = typeof fullAsset.standard_accessories_json === 'string'
                        ? JSON.parse(fullAsset.standard_accessories_json)
                        : fullAsset.standard_accessories_json;
                    if (parsed && typeof parsed === 'object') {
                        accState = parsed;
                    }
                } catch (_) {}
            }

            // Lista dinámica de accesorios del catálogo
            const accessoriesListToRender = (standardAccessoriesCatalog.length > 0)
                ? standardAccessoriesCatalog
                : [
                    'Cargador Original',
                    'Mouse Óptico',
                    'Maletín / Bolso',
                    'Candado Kensington',
                    'Monitor Externo',
                    'Teclado Externo',
                    'Manos Libres / Diadema',
                    'Adaptador USB-C / HDMI'
                ];

            const accW = contentWidth / 4;
            const accRows = Math.max(2, Math.ceil(accessoriesListToRender.length / 4));
            doc.setFontSize(6.8);
            doc.setFont('Helvetica', 'normal');

            for (let r = 0; r < accRows; r++) {
                // Dibujar 4 celdas por fila
                for (let c = 0; c < 4; c++) {
                    doc.rect(marginX + (c * accW), currentY, accW, 5.5);
                    const itemIdx = (r * 4) + c;
                    if (itemIdx < accessoriesListToRender.length) {
                        const accName = accessoriesListToRender[itemIdx];
                        // Comprobar si está marcado tanto por nombre exacto como por legacy key
                        const isChecked = Boolean(
                            accState[accName] ||
                            (accName.toLowerCase().includes('cargador') && accState.charger) ||
                            (accName.toLowerCase().includes('mouse') && accState.mouse) ||
                            (accName.toLowerCase().includes('malet') && accState.bag) ||
                            (accName.toLowerCase().includes('candado') && accState.kensington) ||
                            (accName.toLowerCase().includes('monitor') && accState.monitor) ||
                            (accName.toLowerCase().includes('teclado') && accState.keyboard) ||
                            (accName.toLowerCase().includes('manos libres') && accState.headset) ||
                            (accName.toLowerCase().includes('adaptador') && accState.usb_adapter)
                        );
                        doc.text(`${isChecked ? '[X]' : '[ ]'} ${accName.slice(0, 22)}`, marginX + (c * accW) + 2, currentY + 3.8);
                    }
                }
                currentY += 5.5;
            }
            currentY += 2;

            // 4. SOFTWARE Y LICENCIAMIENTO DEL CATÁLOGO
            doc.setFillColor(240, 240, 240);
            doc.rect(marginX, currentY, contentWidth, 5, 'FD');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.text("SOFTWARE INSTALADO Y LICENCIAMIENTO ASIGNADO", pageWidth / 2, currentY + 3.8, { align: 'center' });
            currentY += 5;

            // Obtener software vinculado al activo
            const activeLicNames = new Set((fullAsset.licenses || []).map((l: any) => (l.license_name || l.name || '').trim().toLowerCase()));
            
            // Catálogo base de software
            const allCatalogSoftware = licensesCatalog.length > 0
                ? licensesCatalog.map(l => l.name)
                : ["Microsoft Windows 11 Pro", "Microsoft 365 Business (Office)", "Google Chrome Enterprise", "Adobe Acrobat Reader", "Antivirus Centralizado Garend"];
            
            const softwareToShow = allCatalogSoftware.length > 0 ? allCatalogSoftware : ["Microsoft Windows 11 Pro", "Microsoft 365 Business (Office)", "Google Chrome Enterprise", "Adobe Acrobat Reader", "Antivirus Centralizado Garend"];
            
            // Repartir en 3 columnas
            const colW = contentWidth / 3;
            const rowCount = Math.max(3, Math.ceil(softwareToShow.length / 3));
            const totalSwHeight = rowCount * 4.5;

            doc.rect(marginX, currentY, colW, totalSwHeight);
            doc.rect(marginX + colW, currentY, colW, totalSwHeight);
            doc.rect(marginX + (colW * 2), currentY, colW, totalSwHeight);

            doc.setFontSize(6.5);
            doc.setFont('Helvetica', 'normal');
            for (let i = 0; i < softwareToShow.length; i++) {
                const swName = softwareToShow[i];
                const isSwActive = activeLicNames.has(swName.trim().toLowerCase()) || 
                                   (fullAsset.licenses || []).some((l: any) => l.license_catalog_id && licensesCatalog.find(c => c.id === l.license_catalog_id)?.name === swName);
                
                const colIdx = i % 3;
                const rowIdx = Math.floor(i / 3);
                const xPos = marginX + (colIdx * colW) + 2;
                const yPos = currentY + (rowIdx * 4.5) + 3.4;
                doc.text(`${isSwActive ? '[X]' : '[ ]'} ${swName.slice(0, 30)}`, xPos, yPos);
            }
            currentY += totalSwHeight + 3;

            // 5. OBSERVACIONES Y CLÁUSULAS LEGALES DE CUSTODIA (Texto oficial ISO 9001 / OIJ)
            doc.setFillColor(240, 240, 240);
            doc.rect(marginX, currentY, contentWidth, 4.5, 'FD');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.text("CLÁUSULA DE CUSTODIA, USO ACEPTABLE Y DENUNCIA O.I.J.", pageWidth / 2, currentY + 3.2, { align: 'center' });
            currentY += 4.5;

            const legalText = "Certifico que los elementos y licencias detallados en el presente documento me han sido entregados en perfecto estado para mi cuidado y custodia, con el único propósito de cumplir con las tareas propias de mi cargo en Industrias Garend S.A., siendo estos de mi única y exclusiva responsabilidad durante la vigencia de la asignación. Me comprometo a dar un uso ético y estrictamente laboral a los recursos, a no instalar software no autorizado por el Departamento de Tecnología (TI), y a no alterar el cifrado BitLocker ni medidas de seguridad.\nEn caso de pérdida, robo o hurto, es mi obligación reportarlo inmediatamente a mi jefatura y a TI, interponer la denuncia formal ante el Organismo de Investigación Judicial (O.I.J.) en un plazo máximo de 24 horas y entregar copia física a la empresa.";

            doc.rect(marginX, currentY, contentWidth, 19);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(6.1);
            const legalLines = doc.splitTextToSize(legalText, contentWidth - 4);
            doc.text(legalLines, marginX + 2, currentY + 3.2);
            currentY += 21;

            // 6. ENTREGA DE EQUIPO - FIRMAS
            doc.setFillColor(240, 240, 240);
            doc.rect(marginX, currentY, contentWidth, 4.5, 'FD');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.text("REGISTRO DE FIRMAS DE ENTREGA Y RECEPCIÓN CONFORME", pageWidth / 2, currentY + 3.2, { align: 'center' });
            currentY += 4.5;

            const halfW = contentWidth / 2;
            doc.rect(marginX, currentY, halfW, 19);
            doc.rect(marginX + halfW, currentY, halfW, 19);

            // Left: RECIBE (Colaborador)
            doc.setFontSize(7.5);
            doc.setFont('Helvetica', 'bold');
            doc.text("RECIBE CONFORME (COLABORADOR)", marginX + 14, currentY + 3.8);
            doc.text("ENTREGA (RESPONSABLE TI)", marginX + halfW + 16, currentY + 3.8);

            doc.setFont('Helvetica', 'normal');
            doc.text(`Nombre: ${assigneeName ? assigneeName : '___________________________'}`, marginX + 2, currentY + 7.8);
            doc.text("Firma: ___________________________", marginX + 2, currentY + 13);
            doc.text(`Fecha: ${new Date().toLocaleDateString('es-CR')}`, marginX + 2, currentY + 17.5);

            // Right: ENTREGA (TI)
            doc.text("Nombre: Jonathan Ugalde González", marginX + halfW + 2, currentY + 7.8);
            doc.text("Firma: ___________________________", marginX + halfW + 2, currentY + 13);
            doc.text(`Fecha: ${new Date().toLocaleDateString('es-CR')}`, marginX + halfW + 2, currentY + 17.5);
            currentY += 20.5;

            // 7. Reemplazo o Retiro
            doc.rect(marginX, currentY, contentWidth, 5.5);
            doc.setFontSize(6.8);
            doc.setFont('Helvetica', 'bold');
            doc.text("Control de Retiro / Reemplazo:", marginX + 2, currentY + 3.8);
            doc.setFont('Helvetica', 'normal');
            doc.text("Devolución Cese [ ]      Reemplazo/Mantenimiento [ ]      Fecha: _______________    Firma Recibe TI: ________________", marginX + 42, currentY + 3.8);
            currentY += 6.5;

            // Bitácora Footer
            doc.setFontSize(5.5);
            doc.setTextColor(100, 100, 100);
            doc.text("R-INFO-002 | Edición 04: Sistema de Gestión de Calidad ISO 9001:2015 | Industrias Garend S.A.", marginX, currentY + 3);
            doc.text("Página 1 de 1", pageWidth - marginX - 15, currentY + 3);

            doc.save(`Boleta_Entrega_Activo_${fullAsset.serial_number || fullAsset.id}.pdf`);
            toast({
                title: "Boleta PDF Generada",
                description: `Se descargó la boleta oficial R-INFO-002 del activo ${fullAsset.brand} ${fullAsset.model}.`
            });
        } catch (err: any) {
            console.error("Error generating handover PDF:", err);
            toast({
                variant: "destructive",
                title: "Error al generar PDF",
                description: "No se pudo generar la boleta de entrega del activo."
            });
        }
    };

    // Asset CRUD
    const handleSaveAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assetForm.brand.trim() || !assetForm.model.trim() || !assetForm.serial_number.trim() || !assetForm.branch_id) {
            toast({
                variant: "destructive",
                title: "Campos vacíos",
                description: "Complete la marca, modelo, número de serie y sede del equipo."
            });
            return;
        }

        setSubmitting(true);
        try {
            const saved = await saveItAsset(assetForm);
            const brandLabel = saved?.brand || assetForm.brand || 'Equipo';
            const modelLabel = saved?.model || assetForm.model || '';
            const targetId = saved?.id || assetForm.id;

            toast({
                title: assetForm.id ? "Activo actualizado" : "Activo registrado",
                description: `El activo ${brandLabel} ${modelLabel} se guardó correctamente.`
            });
            setShowAssetForm(false);
            loadAllData();
            if (targetId && selectedAsset && selectedAsset.id === targetId) {
                handleLoadAssetDetails(targetId);
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al guardar activo",
                description: error.message || "Asegúrese de que el número de serie sea único."
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditAsset = async (asset: any) => {
        let full = asset;
        if (!full.licenses) {
            try {
                const fetched = await getItAssetById(asset.id);
                if (fetched) full = fetched;
            } catch (_) {}
        }

        let parsedAcc = {
            charger: true,
            mouse: true,
            bag: true,
            kensington: true,
            monitor: false,
            keyboard: false,
            headset: false,
            usb_adapter: false
        };
        if (full.standard_accessories_json) {
            try {
                parsedAcc = typeof full.standard_accessories_json === 'string'
                    ? JSON.parse(full.standard_accessories_json)
                    : full.standard_accessories_json;
            } catch (_) {}
        }

        // Extraer software IDs actualmente vinculados
        const softwareIds = Array.isArray(full.licenses)
            ? full.licenses.map((l: any) => Number(l.license_catalog_id))
            : [];

        // Si el número de serie anterior guardó el HWID por auto-registro, inicializar el campo con valor limpio o N/D
        const effectiveHwid = full.hardware_id || full.dev_hardware_id || '';
        let effectiveSerial = full.serial_number || '';
        if (effectiveSerial.startsWith('CLIC-HWID') || (effectiveHwid && effectiveSerial === effectiveHwid)) {
            effectiveSerial = '';
        }

        setAssetForm({
            id: full.id,
            item_id: full.item_id || '',
            category: full.category,
            brand: full.brand,
            model: full.model,
            serial_number: effectiveSerial,
            hardware_id: effectiveHwid,
            status: full.status,
            purchase_date: full.purchase_date || '',
            purchase_cost: full.purchase_cost || '',
            currency: full.currency || 'CRC',
            exchange_rate: full.exchange_rate || 1.0,
            warranty_expiration: full.warranty_expiration || '',
            branch_id: full.branch_id,
            notes: full.notes || '',
            imei: full.imei || '',
            phone_number: full.phone_number || '',
            telephony_provider: full.telephony_provider || '',
            data_plan_start: full.data_plan_start || '',
            data_plan_end: full.data_plan_end || '',
            data_plan_renewal: full.data_plan_renewal || 'monthly',
            processor: full.processor || '',
            ram_memory: full.ram_memory || '',
            storage_capacity: full.storage_capacity || '',
            bitlocker_id: full.bitlocker_id || '',
            bitlocker_key: full.bitlocker_key || '',
            standard_accessories: parsedAcc,
            selected_software_ids: softwareIds
        });
        setShowAssetForm(true);
    };

    const handleDeleteAsset = async (id: number) => {
        if (!confirm("¿Está seguro de que desea eliminar este activo? Se borrarán todos sus accesorios, historial de asignaciones y licencias vinculadas.")) return;
        try {
            await deleteItAsset(id);
            toast({
                title: "Activo eliminado",
                description: "El activo ha sido retirado del inventario."
            });
            setSelectedAsset(null);
            loadAllData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al eliminar",
                description: error.message || "Ocurrió un error inesperado."
            });
        }
    };

    // Assignments operations
    const handleOpenAssignModal = (asset: any) => {
        const assetId = asset?.id ?? asset?.asset_id;
        setSelectedAsset({ ...asset, id: assetId });
        setAssignmentForm({
            collaboratorId: ''
        });
        setShowAssignModal(true);
        if (assetId) {
            handleLoadAssetDetails(assetId);
        }
    };

    const handleAssignAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        const selectedCollab = unifiedCollaborators.find(c => c.id === assignmentForm.collaboratorId);
        if (!selectedCollab) {
            toast({
                variant: "destructive",
                title: "Seleccione un colaborador",
                description: "Seleccione el colaborador para asignar el equipo."
            });
            return;
        }

        setSubmitting(true);
        try {
            const assignRes = await assignItAsset(selectedAsset.id, selectedCollab.type, selectedCollab.value);
            toast({
                title: "Activo asignado",
                description: "La asignación ha sido guardada en el historial."
            });
            setShowAssignModal(false);
            loadAllData();
            handleLoadAssetDetails(selectedAsset.id);

            // Enviar comprobante de entrega digital al colaborador por email de forma transparente
            if (assignRes?.assignmentId) {
                try {
                    const mailRes = await sendAssetAssignmentEmail(assignRes.assignmentId);
                    if (mailRes?.success) {
                        toast({
                            title: "Comprobante enviado 📧",
                            description: "Se envió el acta digital de entrega del equipo al colaborador."
                        });
                    }
                } catch (_) {}
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al asignar",
                description: error.message || "Ocurrió un error."
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleReturnAsset = async (asset: any) => {
        if (!confirm(`¿Registrar la devolución de este activo?`)) return;
        const assetId = asset?.id ?? asset?.asset_id;
        try {
            await returnItAsset(assetId);
            toast({
                title: "Activo devuelto",
                description: "El equipo ahora está marcado como disponible (sin asignación activa)."
            });
            loadAllData();
            if (selectedAsset && selectedAsset.id === assetId) {
                handleLoadAssetDetails(assetId);
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al devolver",
                description: error.message
            });
        }
    };

    // Accessories/Components
    const handleAddComponent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComponent.component_name.trim()) return;

        try {
            await addItAssetComponent({
                parent_asset_id: selectedAsset.id,
                ...newComponent
            });
            toast({
                title: "Accesorio agregado",
                description: "El periférico ha sido vinculado al equipo principal."
            });
            setNewComponent({ component_name: '', brand: '', model: '', serial_number: '' });
            handleLoadAssetDetails(selectedAsset.id);
            loadAllData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al agregar componente",
                description: error.message
            });
        }
    };

    const handleRemoveComponent = async (id: number) => {
        if (!confirm("¿Desea desvincular este accesorio?")) return;
        try {
            await removeItAssetComponent(id);
            toast({
                title: "Accesorio removido",
                description: "Se eliminó el periférico del equipo."
            });
            handleLoadAssetDetails(selectedAsset.id);
            loadAllData();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al eliminar componente",
                description: error.message
            });
        }
    };

    // Licenses assignments
    const handleAddLicense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLicense.license_catalog_id) return;

        try {
            await addItAssetLicense({
                asset_id: selectedAsset.id,
                license_catalog_id: Number(newLicense.license_catalog_id),
                license_key: newLicense.license_key,
                expiration_date: newLicense.expiration_date
            });
            toast({
                title: "Licencia asignada",
                description: "La licencia de software ha sido asociada correctamente."
            });
            setNewLicense({ license_catalog_id: '', license_key: '', expiration_date: '' });
            handleLoadAssetDetails(selectedAsset.id);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al vincular licencia",
                description: error.message
            });
        }
    };

    const handleRemoveLicense = async (id: number) => {
        if (!confirm("¿Desvincular esta licencia del equipo?")) return;
        try {
            await removeItAssetLicense(id);
            toast({
                title: "Licencia removida",
                description: "Se desasoció la licencia de este equipo."
            });
            handleLoadAssetDetails(selectedAsset.id);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al remover licencia",
                description: error.message
            });
        }
    };

    // Asset Documents & Attachments (Invoices, Warranties, Manuals)
    const handleUploadDocument = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!documentForm.file || !selectedAsset?.id) {
            toast({
                variant: "destructive",
                title: "Archivo requerido",
                description: "Seleccione un archivo de su equipo para adjuntar."
            });
            return;
        }

        setUploadingDoc(true);
        try {
            const formData = new FormData();
            formData.append('file', documentForm.file);
            formData.append('asset_id', String(selectedAsset.id));
            formData.append('document_type', documentForm.document_type || 'other');
            formData.append('title', documentForm.title.trim() || documentForm.file.name);

            const res = await uploadAssetDocument(formData);
            if (!res.success) {
                throw new Error(res.error || 'Error al guardar el archivo en el servidor.');
            }

            toast({
                title: "Documento adjuntado",
                description: "El archivo se guardó físicamente en el servidor de forma segura."
            });
            setDocumentForm({ title: '', document_type: 'invoice', file: null });
            setShowDocumentsModal(false);
            handleLoadAssetDetails(selectedAsset.id);
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Error al adjuntar",
                description: err.message
            });
        } finally {
            setUploadingDoc(false);
        }
    };

    const handleDeleteDocument = (docId: number) => {
        setDocToDelete(docId);
    };

    const confirmDeleteDocument = async () => {
        if (!docToDelete || !selectedAsset) return;
        try {
            const res = await deleteAssetDocument(docToDelete);
            if (!res.success) throw new Error(res.error);
            toast({
                title: "Documento eliminado",
                description: "El archivo físico ha sido borrado del servidor."
            });
            handleLoadAssetDetails(selectedAsset.id);
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Error al eliminar documento",
                description: err.message
            });
        } finally {
            setDocToDelete(null);
        }
    };

    // Filters and statistics computations
    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            const matchesSearch = searchTerm === '' ||
                `${asset.brand} ${asset.model}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                asset.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (asset.employee_name && asset.employee_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (asset.user_name && asset.user_name.toLowerCase().includes(searchTerm.toLowerCase()));

            const matchesCategory = filterCategory === 'all' || asset.category === filterCategory;
            const matchesBranch = filterBranch === 'all' || asset.branch_id === Number(filterBranch);
            const matchesStatus = filterStatus === 'all' || asset.status === filterStatus;

            return matchesSearch && matchesCategory && matchesBranch && matchesStatus;
        });
    }, [assets, searchTerm, filterCategory, filterBranch, filterStatus]);

    const stats = useMemo(() => {
        let active = 0, repair = 0, retired = 0, eol = 0;
        let totalCostCRC = 0;

        assets.forEach(a => {
            if (a.status === 'active') active++;
            else if (a.status === 'repair') repair++;
            else if (a.status === 'retired') retired++;
            else if (a.status === 'eol') eol++;

            if (a.purchase_cost) {
                // If it is in CRC, use cost directly. If in USD, convert using exchange_rate of the asset
                if (a.currency === 'USD') {
                    const rate = a.exchange_rate || exchangeRateData?.rate || 1.0;
                    totalCostCRC += a.purchase_cost * rate;
                } else {
                    totalCostCRC += a.purchase_cost;
                }
            }
        });

        const usdRate = exchangeRateData?.rate || 1.0;

        return {
            total: assets.length,
            active,
            repair,
            retired,
            eol,
            totalCostCRC,
            totalCostUSD: totalCostCRC / usdRate
        };
    }, [assets, exchangeRateData]);

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground text-sm font-medium">Cargando inventario de TI (ITAM)...</span>
            </div>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Inventario de TI (ITAM)</h1>
                    <p className="text-muted-foreground mt-1">Gestión centralizada de infraestructura, computadoras, accesorios y licencias.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setShowAgentGuide(true)}
                        className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 gap-1.5 shadow-sm"
                        title="Ver Manual de Instalación, IPs Fallback y Despliegue GPO/Intune"
                    >
                        <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Manual del Agente
                    </Button>
                    <a 
                        href="/downloads/Agente/ClicToolsAgent-Setup.exe" 
                        download
                        className="inline-flex items-center justify-center rounded-md text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-3.5 py-2 text-indigo-600 dark:text-indigo-400 gap-1.5 shadow-sm"
                        title="Descargar Instalador Asistido / Setup con GUI (.exe)"
                    >
                        <Download className="h-4 w-4 text-indigo-500" /> Setup (.exe)
                    </a>
                    <Button 
                        variant="outline"
                        onClick={downloadSilentScript}
                        className="text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 gap-1.5 shadow-sm"
                        title="Descargar Script 1-Clic para despliegue silencioso por GPO / Intune / PowerShell"
                    >
                        <FileDown className="h-4 w-4 text-emerald-500" /> Script GPO (.ps1)
                    </Button>
                    <Button onClick={() => {
                        setAssetForm({
                            id: undefined,
                            item_id: '',
                            category: categories[0] || 'Laptop',
                            brand: '',
                            model: '',
                            serial_number: '',
                            status: 'active',
                            purchase_date: '',
                            purchase_cost: '',
                            currency: 'CRC',
                            exchange_rate: exchangeRateData?.rate || 1.0,
                            warranty_expiration: '',
                            branch_id: branches.length > 0 ? branches[0].id : '',
                            notes: '',
                            imei: '',
                            phone_number: '',
                            telephony_provider: '',
                            data_plan_start: '',
                            data_plan_end: '',
                            data_plan_renewal: 'monthly',
                            processor: '',
                            ram_memory: '',
                            storage_capacity: '',
                            bitlocker_id: '',
                            bitlocker_key: '',
                            standard_accessories: {
                                charger: true,
                                mouse: true,
                                bag: true,
                                kensington: true,
                                monitor: false,
                                keyboard: false,
                                headset: false,
                                usb_adapter: false
                            },
                            selected_software_ids: []
                        });
                        setShowAssetForm(true);
                    }}>
                        <Plus className="h-4 w-4 mr-2" /> Registrar Activo
                    </Button>
                </div>
            </div>

            {/* HR Alert banners */}
            {hrAlerts.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-sm space-y-3">
                    <div className="flex items-start">
                        <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                            <h3 className="font-bold text-amber-800 dark:text-amber-300 text-sm">Alerta de Colaborador Inactivo con Equipos Asignados</h3>
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                Se detectaron {hrAlerts.length} colaborador(es) que han sido dados de baja o inactivados en el sistema/ERP pero conservan activos de TI asignados:
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-2 max-h-40 overflow-y-auto pl-8">
                        {hrAlerts.map((alert) => (
                            <div key={alert.assignment_id} className="flex flex-wrap items-center justify-between text-xs bg-background/50 p-2.5 rounded border border-amber-200/50 gap-2">
                                <div>
                                    <span className="font-semibold text-foreground">{alert.employee_name}</span> 
                                    <span className="text-muted-foreground"> (Cód: {alert.employee_code})</span>
                                    <span className="mx-1.5">•</span>
                                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{alert.category} {alert.brand} {alert.model}</span>
                                    <span className="text-muted-foreground"> (Serie: {alert.serial_number})</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs text-amber-700 hover:text-amber-800" onClick={() => handleReturnAsset(alert)}>
                                        <Undo2 className="h-3 w-3 mr-1" /> Devolver a Bodega
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs text-muted-foreground" onClick={() => handleOpenAssignModal(alert)}>
                                        Reasignar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Plan Expiration Alerts (Planes Móviles / Celulares) */}
            {planAlerts.length > 0 && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border-l-4 border-rose-500 p-4 rounded-r-lg shadow-sm space-y-3">
                    <div className="flex items-start">
                        <Smartphone className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                            <h3 className="font-bold text-rose-800 dark:text-rose-300 text-sm flex items-center gap-2">
                                <span>Alerta de Vencimiento de Planes Celulares / Datos</span>
                                <span className="bg-rose-200 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {planAlerts.length} {planAlerts.length === 1 ? 'Línea' : 'Líneas'}
                                </span>
                            </h3>
                            <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">
                                Las siguientes líneas celulares y planes de datos móviles requieren renovación inmediata con el operador:
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-2 max-h-48 overflow-y-auto pl-8">
                        {planAlerts.map((alert) => (
                            <div key={alert.asset_id} className="flex flex-wrap items-center justify-between text-xs bg-background/60 p-2.5 rounded border border-rose-200/60 gap-2">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-foreground">{alert.phone_number || 'Sin Número'}</span>
                                        <span className="text-muted-foreground">({alert.telephony_provider || 'Operador N/A'})</span>
                                        <span className="mx-1">•</span>
                                        <span className="font-medium text-indigo-600 dark:text-indigo-400">{alert.brand} {alert.model}</span>
                                        <span className="text-muted-foreground">(Serie: {alert.serial_number})</span>
                                        <span className="mx-1">•</span>
                                        <span className="text-foreground font-medium">Custodio: {alert.current_holder}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px]">
                                        <span className="text-muted-foreground">Vence: <strong className="text-foreground">{alert.data_plan_end ? new Date(alert.data_plan_end).toLocaleDateString('es-CR') : 'N/A'}</strong></span>
                                        {alert.isExpired ? (
                                            <span className="text-rose-700 dark:text-rose-400 font-bold bg-rose-100 dark:bg-rose-900/40 px-1.5 py-0.5 rounded">
                                                🚨 Vencido hace {Math.abs(alert.diffDays)} días
                                            </span>
                                        ) : (
                                            <span className="text-amber-700 dark:text-amber-400 font-semibold bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                                                ⚠️ Vence en {alert.diffDays} días
                                            </span>
                                        )}
                                        {alert.data_plan_renewal && (
                                            <span className="text-muted-foreground capitalize">({alert.data_plan_renewal === 'annual' ? 'Ciclo Anual' : alert.data_plan_renewal === 'monthly' ? 'Ciclo Mensual' : alert.data_plan_renewal})</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="h-7 px-2.5 text-xs text-rose-700 hover:text-rose-800 border-rose-200 bg-rose-50/50" 
                                        onClick={() => {
                                            const targetAsset = assets.find(a => a.id === alert.asset_id);
                                            if (targetAsset) handleEditAsset(targetAsset);
                                        }}
                                    >
                                        <Pencil className="h-3 w-3 mr-1" /> Renovar Plan
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="p-4 flex flex-col justify-between">
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Total Equipos</span>
                    <span className="text-2xl font-bold mt-1">{stats.total}</span>
                </Card>
                <Card className="p-4 flex flex-col justify-between border-green-500/20 bg-green-500/[0.02]">
                    <span className="text-xs text-green-600 dark:text-green-400 font-semibold uppercase">Activos / Disponibles</span>
                    <span className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{stats.active}</span>
                </Card>
                <Card className="p-4 flex flex-col justify-between border-amber-500/20 bg-amber-500/[0.02]">
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase">En Reparación</span>
                    <span className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{stats.repair}</span>
                </Card>
                <Card className="p-4 flex flex-col justify-between border-red-500/20 bg-red-500/[0.02]">
                    <span className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase">EOL / Obsoletos</span>
                    <span className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{stats.eol}</span>
                </Card>
                <Card className="p-4 flex flex-col justify-between col-span-2 md:col-span-1">
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Valor Inventario</span>
                    <div className="mt-1">
                        <span className="text-sm font-bold block">₡{stats.totalCostCRC.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</span>
                        <span className="text-xs text-muted-foreground">${stats.totalCostUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</span>
                    </div>
                </Card>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-muted/40 p-4 rounded-xl">
                <div className="relative w-full md:max-w-md">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por marca, modelo, serie o responsable..."
                        className="pl-9 bg-background"
                    />
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="bg-background border rounded px-3 py-1.5 text-xs font-semibold"
                    >
                        <option value="all">Todas las Categorías</option>
                        {categories.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>

                    <select
                        value={filterBranch}
                        onChange={(e) => setFilterBranch(e.target.value)}
                        className="bg-background border rounded px-3 py-1.5 text-xs font-semibold"
                    >
                        <option value="all">Todas las Sedes</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>

                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-background border rounded px-3 py-1.5 text-xs font-semibold"
                    >
                        <option value="all">Todos los Estados</option>
                        <option value="active">Activo</option>
                        <option value="repair">En Soporte / Taller</option>
                        <option value="retired">Retirado</option>
                        <option value="eol">EOL / Desecho</option>
                    </select>
                </div>
            </div>

            {/* Layout content catalog and details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Assets table */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50 text-xs font-bold uppercase text-muted-foreground">
                                        <th className="p-4">Categoría / Equipo</th>
                                        <th className="p-4">Serie</th>
                                        <th className="p-4">Sede</th>
                                        <th className="p-4">Asignado a</th>
                                        <th className="p-4">Estado</th>
                                        <th className="p-4 text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredAssets.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                                No se encontraron activos con los filtros aplicados.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAssets.map((asset) => {
                                            const assignee = (asset.user_name && asset.employee_name)
                                                ? `${asset.employee_name} (Usuario: ${asset.user_name})`
                                                : (asset.assignee_type === 'system_user' ? asset.user_name : asset.employee_name);
                                            const isAlert = asset.assignee_type === 'payroll_employee' && asset.employee_status === 'N';

                                            return (
                                                <tr
                                                    key={asset.id}
                                                    onClick={() => handleLoadAssetDetails(asset.id)}
                                                    className={`hover:bg-muted/30 cursor-pointer transition ${
                                                        selectedAsset?.id === asset.id ? 'bg-muted/60' : ''
                                                    } ${isAlert ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''}`}
                                                >
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                                                {['celular', 'móvil', 'movil', 'tablet', 'phone', 'smartphone'].includes(asset.category?.toLowerCase()) ? (
                                                                    <Smartphone className="h-4 w-4" />
                                                                ) : (
                                                                    <Laptop className="h-4 w-4" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-foreground block">{asset.brand} {asset.model}</span>
                                                                <span className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                                                                    <span>{asset.category}</span>
                                                                    {asset.phone_number && (
                                                                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono bg-indigo-50 dark:bg-indigo-950/40 px-1 py-0.2 rounded">
                                                                            {asset.phone_number}
                                                                        </span>
                                                                    )}
                                                                    {asset.data_plan_end && (() => {
                                                                        const isExpired = new Date(asset.data_plan_end) < new Date();
                                                                        const diffDays = Math.ceil((new Date(asset.data_plan_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                                                        const isClose = diffDays <= 30 && diffDays >= 0;
                                                                        if (isExpired) {
                                                                            return (
                                                                                <span className="text-[9px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded font-bold animate-pulse">
                                                                                    Plan Vencido
                                                                                </span>
                                                                            );
                                                                        } else if (isClose) {
                                                                            return (
                                                                                <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                                                                                    Plan vence en {diffDays}d
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 font-mono text-xs">
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span>{asset.serial_number}</span>
                                                                {(asset.dev_hardware_id || asset.serial_number?.startsWith('CLIC-HWID')) && (
                                                                    <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                                                                        📱 APK
                                                                    </span>
                                                                )}
                                                                {asset.agent_last_seen && (() => {
                                                                    const diffMinutes = (new Date().getTime() - new Date(asset.agent_last_seen).getTime()) / (1000 * 60);
                                                                    const isOnline = diffMinutes <= 5;
                                                                    return (
                                                                        <span 
                                                                            title={`Agente Windows v${asset.agent_version || '1.0'}\nCPU: ${asset.agent_cpu_usage || 0}%\nRAM: ${asset.agent_ram_used_percent || 0}%\nDisco C: ${asset.agent_disk_primary_free_gb || 0} GB libres\nUsuario: ${asset.agent_logged_in_user || 'Sin sesión'}\nÚltimo contacto: ${new Date(asset.agent_last_seen).toLocaleTimeString('es-CR')}`}
                                                                            className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                                                                isOnline 
                                                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 ring-1 ring-emerald-500/30' 
                                                                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                                                            }`}
                                                                        >
                                                                            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                                                            💻 {isOnline ? 'Online' : 'Agente'}
                                                                            {asset.agent_battery_percent !== null && asset.agent_battery_percent !== undefined && (
                                                                                <span className="font-mono text-[8.5px] opacity-80">
                                                                                    {asset.agent_is_charging ? '⚡' : '🔋'}{asset.agent_battery_percent}%
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </div>
                                                            {asset.imei && (
                                                                <div className="text-[10px] text-indigo-700 dark:text-indigo-300 font-semibold">
                                                                    IMEI: {asset.imei}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium text-muted-foreground">
                                                            {asset.branch_code || 'S-01'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4">
                                                        {assignee ? (
                                                            <div className="flex flex-col">
                                                                <span className={`font-semibold text-xs ${isAlert ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}`}>
                                                                    {assignee}
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {asset.assignee_type === 'system_user' ? 'Sistema' : 'Planilla'}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Disponible</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                            asset.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                            asset.status === 'repair' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                                                            'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                        }`}>
                                                            {asset.status === 'active' ? 'Activo' :
                                                             asset.status === 'repair' ? 'Soporte' :
                                                             asset.status === 'retired' ? 'Retirado' : 'EOL'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Button 
                                                                size="icon" 
                                                                variant="outline" 
                                                                className="h-8 w-8 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200" 
                                                                onClick={() => handleDownloadAssetHandoverPdf(asset)}
                                                                title="Descargar Boleta de Entrega Oficial R-INFO-002 (PDF)"
                                                            >
                                                                <FileDown className="h-4 w-4" />
                                                            </Button>
                                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => handleEditAsset(asset)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            {assignee ? (
                                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600" onClick={() => handleReturnAsset(asset)} title="Devolver Activo a Bodega">
                                                                    <Undo2 className="h-4 w-4" />
                                                                </Button>
                                                            ) : (
                                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleOpenAssignModal(asset)} title="Asignar Activo a Colaborador">
                                                                    <UserCheck className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:bg-rose-50" onClick={() => handleDeleteAsset(asset.id)} title="Eliminar Activo del Inventario">
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </div>

                {/* Details pane */}
                <div className="lg:col-span-1">
                    {selectedAsset ? (
                        <Card className="shadow-lg border-primary/20 sticky top-4 relative overflow-hidden">
                            {loadingDetails && (
                                <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 overflow-hidden z-10">
                                    <div className="h-full bg-primary animate-pulse w-full"></div>
                                </div>
                            )}
                            <CardHeader className="pb-4 border-b">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-bold">{selectedAsset.brand} {selectedAsset.model}</CardTitle>
                                        <CardDescription>{selectedAsset.category} • Serie {selectedAsset.serial_number}</CardDescription>
                                    </div>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedAsset(null)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-5 space-y-6 text-sm">
                                {/* Assignment section */}
                                <div className="bg-muted/40 p-3.5 rounded-lg border">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Responsable Actual</h4>
                                        {!selectedAsset.assignments?.[0] || selectedAsset.assignments[0].returned_date ? (
                                            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => handleOpenAssignModal(selectedAsset)}>
                                                Asignar
                                            </Button>
                                        ) : (
                                            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs text-red-600 border-red-200" onClick={() => handleReturnAsset(selectedAsset)}>
                                                Devolver
                                            </Button>
                                        )}
                                    </div>
                                    {selectedAsset.assignments?.[0] && !selectedAsset.assignments[0].returned_date ? (
                                        <div className="space-y-1">
                                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                                                <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                                                {selectedAsset.assignments[0].user_name && selectedAsset.assignments[0].employee_name
                                                    ? `${selectedAsset.assignments[0].employee_name} (Usuario: ${selectedAsset.assignments[0].user_name})`
                                                    : (selectedAsset.assignments[0].assignee_type === 'system_user' ? selectedAsset.assignments[0].user_name : selectedAsset.assignments[0].employee_name)
                                                }
                                            </div>
                                            <div className="text-xs text-muted-foreground pl-5">
                                                Asignado el {selectedAsset.assignments[0].assigned_date ? new Date(selectedAsset.assignments[0].assigned_date).toLocaleDateString() : ''} por {selectedAsset.assignments[0].assigned_by}
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-green-600 dark:text-green-400 font-semibold flex items-center gap-1.5">
                                            <CheckCircle className="h-4 w-4" /> Disponible en bodega
                                        </span>
                                    )}
                                </div>

                                {/* Financial catalog & specs */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-xs font-semibold text-muted-foreground block">Sede / Ubicación</span>
                                        <span className="font-semibold block mt-0.5">{selectedAsset.branch_name || 'Oficina Central'} ({selectedAsset.branch_code || 'S-01'})</span>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-muted-foreground block">Costo de Adquisición</span>
                                        <span className="font-semibold block mt-0.5">
                                            {selectedAsset.purchase_cost !== null && selectedAsset.purchase_cost !== undefined && selectedAsset.purchase_cost !== ''
                                                ? (selectedAsset.currency === 'USD' ? `$${Number(selectedAsset.purchase_cost).toLocaleString('en-US')}` : `₡${Number(selectedAsset.purchase_cost).toLocaleString('es-CR')}`)
                                                : 'N/A'
                                            }
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-muted-foreground block">Fecha de Compra</span>
                                        <span className="font-semibold block mt-0.5">{selectedAsset.purchase_date ? new Date(selectedAsset.purchase_date).toLocaleDateString() : 'N/A'}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-muted-foreground block">Vencimiento Garantía</span>
                                        <span className={`font-semibold block mt-0.5 ${
                                            selectedAsset.warranty_expiration && new Date(selectedAsset.warranty_expiration) < new Date() ? 'text-red-500 font-bold' : ''
                                        }`}>
                                            {selectedAsset.warranty_expiration ? new Date(selectedAsset.warranty_expiration).toLocaleDateString() : 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                {/* Live Windows Agent Telemetry & Remote Control Card */}
                                {selectedAsset.agent_last_seen && (() => {
                                    const diffMinutes = (new Date().getTime() - new Date(selectedAsset.agent_last_seen).getTime()) / (1000 * 60);
                                    const isOnline = diffMinutes <= 5;
                                    let monitorsList = [];
                                    try {
                                        if (selectedAsset.agent_monitors_json) monitorsList = JSON.parse(selectedAsset.agent_monitors_json);
                                    } catch (_) {}

                                    return (
                                        <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-700 shadow-md space-y-3.5 text-xs">
                                            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-slate-500'}`}></span>
                                                    <span className="font-bold text-sm tracking-wide flex items-center gap-1.5">
                                                        💻 Telemetría Windows {isOnline ? <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded">ONLINE</span> : <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">OFFLINE</span>}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-slate-400 font-mono">v{selectedAsset.agent_version || '1.0'}</span>
                                            </div>

                                            {/* Metrics Grid */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                                                <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60 flex flex-col justify-between">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Host / Sesión</span>
                                                        <span className="font-bold text-slate-100 block mt-0.5" title={selectedAsset.agent_hostname}>{selectedAsset.agent_hostname || 'N/A'}</span>
                                                    </div>
                                                    <span className="text-[10px] text-indigo-300 font-mono block mt-1 break-all" title={selectedAsset.agent_logged_in_user}>{selectedAsset.agent_logged_in_user || 'Sin sesión activa'}</span>
                                                </div>
                                                <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60 flex flex-col justify-between">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Sistema Operativo</span>
                                                        <span className="font-bold text-slate-100 block mt-0.5 leading-snug break-words" title={selectedAsset.agent_os_version}>
                                                            {selectedAsset.agent_os_version || 'Windows'}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-300 font-mono block mt-1">IP: {selectedAsset.agent_ip_address_local || 'N/A'}</span>
                                                </div>
                                            </div>

                                            {/* Bars for CPU, RAM, Disk */}
                                            <div className="space-y-2 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                                                <div>
                                                    <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                                                        <span>Uso de RAM ({selectedAsset.agent_ram_total_gb ? `${selectedAsset.agent_ram_total_gb} GB` : ''})</span>
                                                        <span className="font-bold text-indigo-300">{selectedAsset.agent_ram_used_percent || 0}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                                        <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, selectedAsset.agent_ram_used_percent || 0)}%` }}></div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                                                        <span>Disco C: ({selectedAsset.agent_disk_primary_free_gb || 0} GB libres de {selectedAsset.agent_disk_primary_total_gb || 0} GB)</span>
                                                        <span className="font-bold text-emerald-400">{selectedAsset.agent_disk_smart_status || 'SMART: OK'}</span>
                                                    </div>
                                                    <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                                        <div 
                                                            className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                                                            style={{ 
                                                                width: `${selectedAsset.agent_disk_primary_total_gb ? Math.min(100, Math.round(((selectedAsset.agent_disk_primary_total_gb - (selectedAsset.agent_disk_primary_free_gb || 0)) / selectedAsset.agent_disk_primary_total_gb) * 100)) : 0}%` 
                                                            }}
                                                        ></div>
                                                    </div>
                                                </div>
                                                {selectedAsset.agent_battery_percent !== null && selectedAsset.agent_battery_percent !== undefined && (
                                                    <div className="flex items-center justify-between text-[11px] pt-1 text-slate-300">
                                                        <span>Batería: <strong className="text-amber-300">{selectedAsset.agent_battery_percent}%</strong> {selectedAsset.agent_is_charging ? '⚡ (Cargando AC)' : '🔋 (Batería)'}</span>
                                                        <span className="text-[10px] text-slate-400">BitLocker: <strong className="text-emerald-400">{selectedAsset.agent_bitlocker_status || 'Activo'}</strong></span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Monitores Detectados por EDID */}
                                            {monitorsList.length > 0 && (
                                                <div className="border-t border-slate-800 pt-2 text-[10px]">
                                                    <span className="text-slate-400 block mb-1 font-semibold">🖥️ Pantallas Detectadas (EDID Parser):</span>
                                                    <div className="space-y-1">
                                                        {monitorsList.map((m: any, idx: number) => (
                                                            <div key={idx} className="bg-slate-800 px-2 py-1 rounded text-slate-200 flex items-center justify-between">
                                                                <span>{m.manufacturer || m.model || 'Monitor'} {m.size_inches ? `(${m.size_inches}")` : ''} - {m.resolution || ''}</span>
                                                                <span className="font-mono text-slate-400 text-[9px]">{m.serial || 'S/N Auto'}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Remote Commands Action Toolbar */}
                                            <div className="border-t border-slate-800 pt-2.5 flex items-center justify-between gap-1.5 flex-wrap">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Acciones TI:</span>
                                                <div className="flex items-center gap-1.5">
                                                    <Button 
                                                        size="sm" 
                                                        variant="secondary" 
                                                        className="h-6 px-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200"
                                                        onClick={async () => {
                                                            try {
                                                                const { queueAgentCommand } = await import('@/modules/it-tools/lib/db');
                                                                const res = await queueAgentCommand(selectedAsset.id, 'sync_inventory', {}, 10);
                                                                if (res.success) {
                                                                    toast({ title: "Orden de escaneo enviada", description: "El agente actualizará inventario en su próximo contacto." });
                                                                }
                                                            } catch (e: any) {
                                                                toast({ variant: "destructive", title: "Error", description: e.message });
                                                            }
                                                        }}
                                                    >
                                                        🔍 Escanear Ahora
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        variant="secondary" 
                                                        className="h-6 px-2 text-[10px] bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 border border-amber-800/40"
                                                        onClick={async () => {
                                                            try {
                                                                const { queueAgentCommand } = await import('@/modules/it-tools/lib/db');
                                                                const res = await queueAgentCommand(selectedAsset.id, 'reboot', { delay_seconds: 60, message: "Reinicio solicitado por el Administrador de TI" }, 2);
                                                                if (res.success) {
                                                                    toast({ title: "Orden de reinicio enviada", description: "El equipo se reiniciará con aviso previo de 60 segundos." });
                                                                }
                                                            } catch (e: any) {
                                                                toast({ variant: "destructive", title: "Error", description: e.message });
                                                            }
                                                        }}
                                                    >
                                                        🔄 Reiniciar
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        variant="secondary" 
                                                        className="h-6 px-2 text-[10px] bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border border-rose-800/40"
                                                        onClick={async () => {
                                                            try {
                                                                const { queueAgentCommand } = await import('@/modules/it-tools/lib/db');
                                                                const res = await queueAgentCommand(selectedAsset.id, 'lock', {}, 1);
                                                                if (res.success) {
                                                                    toast({ title: "Orden de bloqueo enviada", description: "La sesión del equipo se bloqueará de inmediato." });
                                                                }
                                                            } catch (e: any) {
                                                                toast({ variant: "destructive", title: "Error", description: e.message });
                                                            }
                                                        }}
                                                    >
                                                        🔒 Bloquear
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Hardware & Security Card */}
                                {(selectedAsset.processor || selectedAsset.ram_memory || selectedAsset.storage_capacity || selectedAsset.bitlocker_id) && (
                                    <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                                        <span className="font-bold text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                                            ⚙️ Hardware & Seguridad TI
                                        </span>
                                        <div className="grid grid-cols-3 gap-2">
                                            {selectedAsset.processor && (
                                                <div>
                                                    <span className="text-[10px] text-muted-foreground block">CPU</span>
                                                    <span className="font-semibold">{selectedAsset.processor}</span>
                                                </div>
                                            )}
                                            {selectedAsset.ram_memory && (
                                                <div>
                                                    <span className="text-[10px] text-muted-foreground block">RAM</span>
                                                    <span className="font-semibold">{selectedAsset.ram_memory}</span>
                                                </div>
                                            )}
                                            {selectedAsset.storage_capacity && (
                                                <div>
                                                    <span className="text-[10px] text-muted-foreground block">Disco</span>
                                                    <span className="font-semibold">{selectedAsset.storage_capacity}</span>
                                                </div>
                                            )}
                                        </div>
                                        {selectedAsset.bitlocker_id && (
                                            <div className="border-t pt-1.5 border-dashed">
                                                <span className="text-[10px] text-muted-foreground block">ID BitLocker</span>
                                                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold select-all">
                                                    {selectedAsset.bitlocker_id}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Mobile data and carrier plan info */}
                                {(selectedAsset.imei || selectedAsset.phone_number || selectedAsset.telephony_provider || ['celular', 'móvil', 'movil', 'tablet', 'phone', 'smartphone'].includes(selectedAsset.category?.toLowerCase())) && (
                                    <div className="border-t pt-4 space-y-3">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                                            <Smartphone className="h-3.5 w-3.5 text-blue-500" /> Dispositivo Móvil & Plan
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 bg-blue-50/10 dark:bg-blue-950/5 p-3 rounded-lg border border-blue-100/50 dark:border-blue-900/30 text-xs">
                                            <div>
                                                <span className="text-[10px] font-semibold text-muted-foreground block">IMEI</span>
                                                <span className="font-medium block mt-0.5">{selectedAsset.imei || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-muted-foreground block">Número Asociado</span>
                                                <span className="font-medium block mt-0.5">{selectedAsset.phone_number || 'N/A'}</span>
                                            </div>
                                            <div className="col-span-2 grid grid-cols-2 gap-2 mt-1 border-t pt-2 border-dashed">
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Operadora / Proveedor</span>
                                                    <span className="font-medium block mt-0.5">{selectedAsset.telephony_provider || 'N/A'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Renovación de Plan</span>
                                                    <span className="font-medium block mt-0.5 capitalize">
                                                        {selectedAsset.data_plan_renewal === 'annual' ? 'Anual' : selectedAsset.data_plan_renewal === 'monthly' ? 'Mensual' : 'N/A'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="col-span-2 grid grid-cols-2 gap-2 mt-1 border-t pt-2 border-dashed">
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Inicio del Plan</span>
                                                    <span className="font-medium block mt-0.5">
                                                        {selectedAsset.data_plan_start ? new Date(selectedAsset.data_plan_start).toLocaleDateString() : 'N/A'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Vencimiento del Plan</span>
                                                    <span className={`font-semibold block mt-0.5 ${
                                                        selectedAsset.data_plan_end && new Date(selectedAsset.data_plan_end) < new Date() ? 'text-red-500 font-bold' : ''
                                                    }`}>
                                                        {selectedAsset.data_plan_end ? new Date(selectedAsset.data_plan_end).toLocaleDateString() : 'N/A'}
                                                        {selectedAsset.data_plan_end && new Date(selectedAsset.data_plan_end) < new Date() && ' (Vencido)'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* APK Hardware ID & Device Sync Panel (Solo si es dispositivo móvil / flota con datos APK) */}
                                {(selectedAsset.dev_hardware_id || (selectedAsset.hardware_id && selectedAsset.category?.toLowerCase() === 'celular') || selectedAsset.dev_driver_name || selectedAsset.serial_number?.startsWith('CLIC-HWID')) && (
                                    <div className="border-t pt-4 space-y-3">
                                        <h4 className="font-bold text-xs uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5">
                                            <span className="text-sm">📱</span> Identificador de Dispositivo Móvil / CLIC-HWID APK
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 bg-emerald-950/10 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-500/20 text-xs">
                                            <div className="col-span-2">
                                                <span className="text-[10px] font-semibold text-muted-foreground block">CLIC-HWID (Hardware ID)</span>
                                                <span className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300 block mt-0.5 select-all">
                                                    {selectedAsset.hardware_id || selectedAsset.dev_hardware_id || selectedAsset.serial_number}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-muted-foreground block">Usuario / Conductor Móvil</span>
                                                <span className="font-medium block mt-0.5">
                                                    {selectedAsset.dev_driver_name || selectedAsset.user_name || 'Sin Asignar'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-muted-foreground block">Teléfono de Contacto</span>
                                                <span className="font-medium block mt-0.5">
                                                    {selectedAsset.dev_driver_phone || selectedAsset.phone_number || 'N/D'}
                                                </span>
                                            </div>
                                            <div className="col-span-2 grid grid-cols-2 gap-2 mt-1 border-t pt-2 border-dashed border-emerald-500/20">
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Impresora Bluetooth MAC</span>
                                                    <span className="font-mono text-xs font-medium block mt-0.5">
                                                        {selectedAsset.dev_printer_mac || 'No Configurada'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground block">Última Sincronización</span>
                                                    <span className="font-medium text-xs block mt-0.5">
                                                        {selectedAsset.dev_last_seen ? new Date(selectedAsset.dev_last_seen).toLocaleString() : 'N/D'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Components linked */}
                                <div className="border-t pt-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Accesorios y Periféricos ({selectedAsset.components?.length || 0})</h4>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowComponentsModal(true)}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="space-y-1.5">
                                        {(!selectedAsset.components || selectedAsset.components.length === 0) ? (
                                            <span className="text-xs text-muted-foreground italic">Sin accesorios agregados.</span>
                                        ) : (
                                            (selectedAsset.components || []).map((c: any) => (
                                                <div key={c.id} className="flex items-center justify-between text-xs bg-muted/60 px-2 py-1.5 rounded">
                                                    <span>{c.component_name} {c.brand ? `(${c.brand})` : ''} - Serie: {c.serial_number || 'N/A'}</span>
                                                    <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500" onClick={() => handleRemoveComponent(c.id)}>
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Software licenses */}
                                <div className="border-t pt-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Licencias de Software ({selectedAsset.licenses?.length || 0})</h4>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowLicensesModal(true)}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="space-y-1.5">
                                        {(!selectedAsset.licenses || selectedAsset.licenses.length === 0) ? (
                                            <span className="text-xs text-muted-foreground italic">Sin licencias vinculadas.</span>
                                        ) : (
                                            (selectedAsset.licenses || []).map((l: any) => (
                                                <div key={l.id} className="flex items-center justify-between text-xs bg-muted/60 px-2 py-1.5 rounded">
                                                    <div>
                                                        <span className="font-semibold">{l.license_name}</span>
                                                        {l.license_key && <span className="block text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">Clave: {l.license_key}</span>}
                                                    </div>
                                                    <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500" onClick={() => handleRemoveLicense(l.id)}>
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Historial Completo de Asignaciones y Custodia */}
                                <div className="border-t pt-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                                            <History className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                                            Historial de Asignaciones ({selectedAsset.assignments?.length || 0})
                                        </h4>
                                        <span className="text-[10px] text-muted-foreground font-medium">Trazabilidad TI</span>
                                    </div>

                                    <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                                        {(!selectedAsset.assignments || selectedAsset.assignments.length === 0) ? (
                                            <span className="text-xs text-muted-foreground italic block bg-muted/30 p-2.5 rounded text-center border border-dashed">
                                                Sin registros de asignación anteriores. Equipo nuevo o en inventario inicial.
                                            </span>
                                        ) : (
                                            (selectedAsset.assignments || []).map((asg: any, index: number) => {
                                                const isCurrent = !asg.returned_date;
                                                const assignedDate = asg.assigned_date ? new Date(asg.assigned_date) : null;
                                                const returnedDate = asg.returned_date ? new Date(asg.returned_date) : null;

                                                let durationText = '';
                                                if (assignedDate) {
                                                    const end = returnedDate || new Date();
                                                    const days = Math.max(1, Math.round((end.getTime() - assignedDate.getTime()) / (1000 * 60 * 60 * 24)));
                                                    if (days < 30) {
                                                        durationText = `${days} día(s)`;
                                                    } else {
                                                        const months = Math.floor(days / 30);
                                                        const remDays = days % 30;
                                                        durationText = months === 1 ? '1 mes' : `${months} meses`;
                                                        if (remDays > 0) durationText += ` ${remDays}d`;
                                                    }
                                                }

                                                return (
                                                    <div 
                                                        key={asg.id || index}
                                                        className={`relative pl-3.5 border-l-2 py-1 text-xs transition ${
                                                            isCurrent 
                                                                ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 p-2.5 rounded-r-lg' 
                                                                : 'border-slate-300 dark:border-slate-700 bg-muted/40 p-2.5 rounded-r-lg'
                                                        }`}
                                                    >
                                                        {/* Status header indicator */}
                                                        <div className="flex items-center justify-between gap-1 mb-1">
                                                            <span className="font-bold text-foreground flex items-center gap-1.5 truncate">
                                                                {isCurrent ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                                                                        <UserCheck className="h-3 w-3" /> Custodio Actual
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.2 rounded font-medium">
                                                                        <Clock className="h-3 w-3" /> Devolución a Bodega
                                                                    </span>
                                                                )}
                                                            </span>
                                                            {durationText && (
                                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                                    {durationText}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Custodian name */}
                                                        <div className="font-semibold text-foreground text-[12px] truncate">
                                                            {asg.employee_name || asg.user_name || 'Colaborador no registrado'}
                                                            {asg.employee_code && (
                                                                <span className="text-muted-foreground font-normal text-[11px] ml-1">
                                                                    (Cód: {asg.employee_code})
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Details dates */}
                                                        <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground mt-1.5 pt-1.5 border-t border-dashed border-muted-foreground/20">
                                                            <div>
                                                                <span className="text-[10px] block text-slate-500">📅 Fecha Entrega</span>
                                                                <span className="font-medium text-foreground">
                                                                    {assignedDate ? assignedDate.toLocaleDateString('es-CR') : 'N/A'}
                                                                </span>
                                                                {asg.assigned_by && (
                                                                    <span className="block text-[9px] text-muted-foreground truncate">
                                                                        Por: {asg.assigned_by}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] block text-slate-500">📦 Devolución / Cierre</span>
                                                                {returnedDate ? (
                                                                    <span className="font-medium text-foreground">
                                                                        {returnedDate.toLocaleDateString('es-CR')}
                                                                    </span>
                                                                ) : (
                                                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                                        Vigente en Custodia
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* Historial de Tickets */}
                                <div className="border-t pt-4 space-y-2">
                                    <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">Historial de Soporte ({selectedAsset.tickets?.length || 0})</h4>
                                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                                        {(!selectedAsset.tickets || selectedAsset.tickets.length === 0) ? (
                                            <span className="text-xs text-muted-foreground italic">Sin tickets de soporte registrados.</span>
                                        ) : (
                                            (selectedAsset.tickets || []).map((t: any) => (
                                                <div key={t.id} className="flex flex-col gap-1 text-xs bg-muted/60 p-2 rounded border border-muted-foreground/10">
                                                    <div className="flex items-center justify-between font-bold">
                                                        <span className="text-blue-600 font-mono">{t.consecutive}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-extrabold ${
                                                            t.status === 'open' ? 'bg-slate-100 text-slate-800' :
                                                            t.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                                            t.status === 'on_hold' ? 'bg-amber-100 text-amber-800' :
                                                            t.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                                                            'bg-red-100 text-red-800'
                                                        }`}>
                                                            {t.status === 'open' ? 'Abierto' :
                                                             t.status === 'in_progress' ? 'Progreso' :
                                                             t.status === 'on_hold' ? 'Espera' :
                                                             t.status === 'completed' ? 'Cerrado' : 'Cancelado'}
                                                        </span>
                                                    </div>
                                                    <p className="font-semibold text-slate-700 dark:text-slate-300 truncate">{t.subject}</p>
                                                    <span className="text-[10px] text-muted-foreground">Creado el {new Date(t.created_at).toLocaleDateString()} por {t.created_by}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Documentos Adjuntos (Facturas, Garantías, Manuales) */}
                                <div className="border-t pt-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                                            <Paperclip className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                                            Documentos y Archivos ({selectedAsset.documents?.length || 0})
                                        </h4>
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40" onClick={() => setShowDocumentsModal(true)}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="space-y-1.5">
                                        {(!selectedAsset.documents || selectedAsset.documents.length === 0) ? (
                                            <span className="text-xs text-muted-foreground italic block bg-muted/30 p-2.5 rounded text-center border border-dashed">
                                                Sin documentos adjuntos (facturas, garantías o manuales).
                                            </span>
                                        ) : (
                                            (selectedAsset.documents || []).map((doc: any) => (
                                                <div key={doc.id} className="flex items-center justify-between text-xs bg-muted/60 p-2 rounded border border-muted-foreground/10 hover:bg-muted transition">
                                                    <div className="flex items-center gap-2 truncate pr-2">
                                                        <FileText className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                                                        <div className="truncate">
                                                            <a 
                                                                href={doc.file_url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="font-semibold text-indigo-600 hover:underline truncate block"
                                                                title={doc.title}
                                                            >
                                                                {doc.title}
                                                            </a>
                                                            <span className="text-[10px] text-muted-foreground block truncate">
                                                                {doc.document_type === 'invoice' ? '🧾 Factura Compra' :
                                                                 doc.document_type === 'warranty' ? '🛡️ Certificado Garantía' :
                                                                 doc.document_type === 'manual' ? '📖 Manual / Ficha Técnica' : '📎 Adjunto'} • {doc.file_name}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        <a 
                                                            href={doc.file_url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            className="p-1 text-slate-500 hover:text-indigo-600 rounded hover:bg-background transition"
                                                            title="Abrir archivo"
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </a>
                                                        <Button 
                                                            size="icon" 
                                                            variant="ghost" 
                                                            className="h-6 w-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" 
                                                            onClick={() => handleDeleteDocument(doc.id)}
                                                            title="Eliminar archivo del servidor"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="border-t pt-4 flex flex-wrap gap-2 justify-end">
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => handleDownloadAssetHandoverPdf(selectedAsset)}
                                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 font-semibold gap-1.5"
                                    >
                                        <FileDown className="h-4 w-4 text-indigo-600" />
                                        Boleta de Entrega (PDF)
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleEditAsset(selectedAsset)}>
                                        Editar Ficha
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleDeleteAsset(selectedAsset.id)}>
                                        Eliminar
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border-dashed">
                            <Info className="h-8 w-8 mb-2" />
                            <h3 className="font-semibold text-sm">Ficha del Activo</h3>
                            <p className="text-xs mt-1 max-w-[200px]">Seleccione un activo de la tabla para ver componentes, licencias e historial de asignaciones.</p>
                        </Card>
                    )}
                </div>
            </div>

            {/* Asset registration / edit modal */}
            {showAssetForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl border-2">
                        <CardHeader className="bg-muted/30 border-b pb-4">
                            <CardTitle className="text-xl flex items-center gap-2">
                                <Laptop className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                {assetForm.id ? 'Ficha Técnica: Modificar Activo de TI' : 'Registrar Nuevo Activo de TI'}
                            </CardTitle>
                            <CardDescription>
                                Complete las características físicas, seguridad, valor contable, accesorios y software del catálogo.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <form onSubmit={handleSaveAsset} className="space-y-6">
                                
                                {/* 1. Vinculación y Datos Base */}
                                <div className="bg-indigo-50/20 dark:bg-indigo-950/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                                        <Tag className="h-4 w-4" /> 1. Identificación y Ubicación
                                    </h3>
                                    
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-muted-foreground block">Vincular a Producto del Inventario de TI (Opcional)</label>
                                        <select
                                            value={assetForm.item_id || ''}
                                            onChange={(e) => {
                                                const itemId = e.target.value;
                                                if (itemId) {
                                                    const matched = tiInventoryItems.find(item => item.id === itemId);
                                                    if (matched) {
                                                        setAssetForm((prev: any) => ({
                                                            ...prev,
                                                            item_id: itemId,
                                                            brand: matched.brand || prev.brand,
                                                            model: matched.model || prev.model,
                                                            serial_number: matched.serial_number || prev.serial_number,
                                                            notes: `${matched.name} ${matched.part_number ? `(Parte: ${matched.part_number})` : ''}`
                                                        }));
                                                    }
                                                } else {
                                                    setAssetForm((prev: any) => ({ ...prev, item_id: '' }));
                                                }
                                            }}
                                            className="w-full bg-background border rounded px-3 py-2 text-sm font-semibold border-indigo-200"
                                        >
                                            <option value="">-- No vincular a producto físico --</option>
                                            {tiInventoryItems.map(item => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} {item.brand ? `[${item.brand}]` : ''} - Cant. Disponible: {item.quantity} {item.unit}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Categoría</label>
                                            <select
                                                value={assetForm.category}
                                                onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}
                                                className="w-full bg-background border rounded px-3 py-2 text-sm"
                                            >
                                                {categories.map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Sede / Sucursal</label>
                                            <select
                                                value={assetForm.branch_id}
                                                onChange={(e) => setAssetForm({ ...assetForm, branch_id: Number(e.target.value) })}
                                                className="w-full bg-background border rounded px-3 py-2 text-sm"
                                            >
                                                {branches.map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Marca</label>
                                            <Input
                                                value={assetForm.brand}
                                                onChange={(e) => setAssetForm({ ...assetForm, brand: e.target.value })}
                                                placeholder="Ej: HP, Dell, Apple"
                                                maxLength={50}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Modelo</label>
                                            <Input
                                                value={assetForm.model}
                                                onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })}
                                                placeholder="Ej: ProBook 450 G9"
                                                maxLength={50}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Número de Serie (Fabricante)</label>
                                            <Input
                                                value={assetForm.serial_number}
                                                onChange={(e) => setAssetForm({ ...assetForm, serial_number: e.target.value })}
                                                placeholder="Serie física (ej: 5CD2340XYZ)"
                                                maxLength={50}
                                                className="font-mono uppercase font-bold"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                                                <span>CLIC-HWID (Identificador Móvil / APK)</span>
                                                <span className="text-[10px] text-indigo-500 font-normal">Auto / Manual</span>
                                            </label>
                                            <Input
                                                value={assetForm.hardware_id || ''}
                                                onChange={(e) => setAssetForm({ ...assetForm, hardware_id: e.target.value })}
                                                placeholder="HWID compuesto APK (ej: android_8f3d...)"
                                                maxLength={100}
                                                className="font-mono text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Estado Operativo</label>
                                            <select
                                                value={assetForm.status}
                                                onChange={(e) => setAssetForm({ ...assetForm, status: e.target.value })}
                                                className="w-full bg-background border rounded px-3 py-2 text-sm font-medium"
                                            >
                                                <option value="active">🟢 Activo / Disponible</option>
                                                <option value="repair">🟡 En Reparación / Soporte</option>
                                                <option value="retired">🔴 Retirado</option>
                                                <option value="eol">⚫ EOL / Desecho</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Hardware y Especificaciones */}
                                <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                        <Cpu className="h-4 w-4" /> 2. Especificaciones de Hardware (CPU, RAM, Disco)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Procesador (CPU)</label>
                                            <Input
                                                value={assetForm.processor || ''}
                                                onChange={(e) => setAssetForm({ ...assetForm, processor: e.target.value })}
                                                placeholder="Ej: Intel Core i7-1255U / Ryzen 5"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Memoria RAM</label>
                                            <Input
                                                value={assetForm.ram_memory || ''}
                                                onChange={(e) => setAssetForm({ ...assetForm, ram_memory: e.target.value })}
                                                placeholder="Ej: 16 GB DDR4 / 32 GB"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Almacenamiento (Disco)</label>
                                            <Input
                                                value={assetForm.storage_capacity || ''}
                                                onChange={(e) => setAssetForm({ ...assetForm, storage_capacity: e.target.value })}
                                                placeholder="Ej: 512 GB SSD NVMe"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* 3. Seguridad BitLocker, Finanzas y Garantía */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Seguridad */}
                                    <div className="bg-amber-50/20 dark:bg-amber-950/10 p-4 rounded-xl border border-amber-200/50 dark:border-amber-900/40 space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-2">
                                            <KeyRound className="h-4 w-4 text-amber-600" /> 3. Seguridad & BitLocker
                                        </h3>
                                        <div className="space-y-2">
                                            <div>
                                                <label className="text-[11px] font-semibold text-muted-foreground block">Identificador BitLocker</label>
                                                <Input
                                                    value={assetForm.bitlocker_id || ''}
                                                    onChange={(e) => setAssetForm({ ...assetForm, bitlocker_id: e.target.value })}
                                                    placeholder="Ej: {B3A749C2-8E14-4B29-9F8C}"
                                                    className="font-mono text-xs"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-semibold text-muted-foreground block">Clave de Recuperación (Bóveda TI)</label>
                                                <Input
                                                    value={assetForm.bitlocker_key || ''}
                                                    onChange={(e) => setAssetForm({ ...assetForm, bitlocker_key: e.target.value })}
                                                    placeholder="Clave numérica / Alfanumérica"
                                                    className="font-mono text-xs"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Finanzas y Garantía */}
                                    <div className="bg-emerald-50/20 dark:bg-emerald-950/10 p-4 rounded-xl border border-emerald-200/50 dark:border-emerald-900/40 space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-emerald-600" /> 4. Valor Contable & Garantía
                                        </h3>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <label className="text-[11px] font-semibold text-muted-foreground block">Moneda</label>
                                                <select
                                                    value={assetForm.currency}
                                                    onChange={(e) => setAssetForm({ ...assetForm, currency: e.target.value })}
                                                    className="w-full bg-background border rounded px-2 py-1.5 text-xs"
                                                >
                                                    <option value="CRC">CRC (₡)</option>
                                                    <option value="USD">USD ($)</option>
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-[11px] font-semibold text-muted-foreground block">Costo Adquisición</label>
                                                <Input
                                                    type="number"
                                                    value={assetForm.purchase_cost}
                                                    onChange={(e) => setAssetForm({ ...assetForm, purchase_cost: e.target.value })}
                                                    placeholder="Monto de compra"
                                                    className="text-xs"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[11px] font-semibold text-muted-foreground block">Fecha de Compra</label>
                                                <Input
                                                    type="date"
                                                    value={assetForm.purchase_date || ''}
                                                    onChange={(e) => setAssetForm({ ...assetForm, purchase_date: e.target.value })}
                                                    className="text-xs"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-semibold text-muted-foreground block">Vence Garantía</label>
                                                <Input
                                                    type="date"
                                                    value={assetForm.warranty_expiration || ''}
                                                    onChange={(e) => setAssetForm({ ...assetForm, warranty_expiration: e.target.value })}
                                                    className="text-xs"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 4. Accesorios Estándar Entregados (Catálogo Dinámico de TI) */}
                                <div className="bg-muted/30 p-4 rounded-xl border space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                            <CheckCircle className="h-4 w-4 text-primary" /> 5. Accesorios y Periféricos Entregados
                                        </h3>
                                        <span className="text-[10px] text-muted-foreground">
                                            Catálogo administrable en /dashboard/admin/it-tools
                                        </span>
                                    </div>

                                    {standardAccessoriesCatalog.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic">
                                            No hay accesorios registrados en el catálogo. Puede añadirlos en /dashboard/admin/it-tools.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                            {standardAccessoriesCatalog.map((accName) => {
                                                const isChecked = Boolean(assetForm.standard_accessories?.[accName]);
                                                return (
                                                    <label 
                                                        key={accName} 
                                                        className={`flex items-center gap-2 p-2 rounded bg-background border cursor-pointer hover:bg-muted/50 transition ${
                                                            isChecked ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                const val = e.target.checked;
                                                                setAssetForm((prev: any) => ({
                                                                    ...prev,
                                                                    standard_accessories: {
                                                                        ...(prev.standard_accessories || {}),
                                                                        [accName]: val
                                                                    }
                                                                }));
                                                            }}
                                                            className="rounded h-4 w-4 text-indigo-600"
                                                        />
                                                        <span className="font-medium text-foreground">{accName}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* 5. Software Instalado (Conectado al Catálogo de Licencias) */}
                                <div className="bg-indigo-50/10 dark:bg-indigo-950/5 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                                            <FileText className="h-4 w-4" /> 6. Software y Licencias Instaladas (Catálogo de TI)
                                        </h3>
                                        <span className="text-[10px] text-muted-foreground">
                                            Marque el software instalado en este equipo particular.
                                        </span>
                                    </div>
                                    
                                    {licensesCatalog.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic">
                                            No hay licencias registradas en el catálogo. Puede añadirlas en /dashboard/admin/it-tools.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1">
                                            {licensesCatalog.map((lic) => {
                                                const isChecked = (assetForm.selected_software_ids || []).includes(lic.id);
                                                return (
                                                    <label 
                                                        key={lic.id} 
                                                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                                                            isChecked 
                                                                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-950 dark:text-indigo-200 font-semibold' 
                                                                : 'bg-background hover:bg-muted/50 border-muted'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setAssetForm((prev: any) => {
                                                                    const current = prev.selected_software_ids || [];
                                                                    const next = checked 
                                                                        ? [...current, lic.id] 
                                                                        : current.filter((id: number) => id !== lic.id);
                                                                    return { ...prev, selected_software_ids: next };
                                                                });
                                                            }}
                                                            className="rounded h-4 w-4 text-indigo-600"
                                                        />
                                                        <div className="truncate">
                                                            <span>{lic.name}</span>
                                                            {lic.description && (
                                                                <span className="block text-[9px] text-muted-foreground truncate">{lic.description}</span>
                                                            )}
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* 6. Dispositivo Móvil & Plan (Opcional según categoría) */}
                                {(() => {
                                    const isMobileCategory = ['celular', 'móvil', 'movil', 'tablet', 'phone', 'smartphone', 'dispositivo movil', 'dispositivo móvil'].includes(assetForm.category?.toLowerCase());
                                    const showMobileFields = isMobileCategory || assetForm.imei || assetForm.phone_number;
                                    if (!showMobileFields) return null;
                                    return (
                                        <div className="border border-blue-200 dark:border-blue-900/40 p-4 rounded-xl bg-blue-50/10 dark:bg-blue-950/5 space-y-3">
                                            <div className="flex items-center gap-2 border-b pb-2">
                                                <Smartphone className="h-4 w-4 text-blue-600" />
                                                <h4 className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase tracking-wider">
                                                    7. Datos del Dispositivo Móvil & Plan Celular
                                                </h4>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                                <div>
                                                    <label className="font-semibold text-muted-foreground block">IMEI</label>
                                                    <Input
                                                        value={assetForm.imei || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, imei: e.target.value })}
                                                        placeholder="861234567890123"
                                                        className="text-xs font-mono"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="font-semibold text-muted-foreground block">Número Telefónico</label>
                                                    <Input
                                                        value={assetForm.phone_number || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, phone_number: e.target.value })}
                                                        placeholder="8888-8888"
                                                        className="text-xs"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="font-semibold text-muted-foreground block">Operadora</label>
                                                    <Input
                                                        value={assetForm.telephony_provider || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, telephony_provider: e.target.value })}
                                                        placeholder="Liberty / Kölbi"
                                                        className="text-xs"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1 border-t border-dashed">
                                                <div>
                                                    <label className="font-semibold text-muted-foreground block">Inicio del Plan</label>
                                                    <Input
                                                        type="date"
                                                        value={assetForm.data_plan_start || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, data_plan_start: e.target.value })}
                                                        className="text-xs"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="font-semibold text-muted-foreground block">Fin / Vencimiento del Plan</label>
                                                    <Input
                                                        type="date"
                                                        value={assetForm.data_plan_end || ''}
                                                        onChange={(e) => setAssetForm({ ...assetForm, data_plan_end: e.target.value })}
                                                        className="text-xs"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="font-semibold text-muted-foreground block">Ciclo de Renovación</label>
                                                    <select
                                                        value={assetForm.data_plan_renewal || 'monthly'}
                                                        onChange={(e) => setAssetForm({ ...assetForm, data_plan_renewal: e.target.value })}
                                                        className="w-full bg-background border rounded px-2 py-1.5 text-xs"
                                                    >
                                                        <option value="monthly">Mensual</option>
                                                        <option value="annual">Anual</option>
                                                        <option value="biannual">Bianual (24 meses)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* 7. Notas adicionales */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">Notas Internas / Observaciones</label>
                                    <Textarea
                                        value={assetForm.notes || ''}
                                        onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
                                        placeholder="Observaciones de entrega, estado físico, asignación previa, etc."
                                        rows={2}
                                        className="text-xs"
                                    />
                                </div>

                                <div className="flex gap-3 justify-end pt-4 border-t">
                                    <Button type="button" variant="outline" onClick={() => setShowAssetForm(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 font-semibold px-6">
                                        {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                                        {assetForm.id ? 'Guardar Cambios' : 'Registrar Activo'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Assignment modal */}
            {showAssignModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-md shadow-2xl">
                        <CardHeader>
                            <CardTitle>Asignar Activo de TI</CardTitle>
                            <CardDescription>
                                Vincule el activo a un usuario del sistema o colaborador de planilla.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAssignAsset} className="space-y-4">
                                <div className="bg-muted p-2.5 rounded border mb-2 text-xs">
                                    <span className="font-semibold block">Equipo seleccionado:</span>
                                    <span className="text-muted-foreground">{selectedAsset.brand} {selectedAsset.model} (Serie: {selectedAsset.serial_number})</span>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">Seleccionar Colaborador</label>
                                    <select
                                        value={assignmentForm.collaboratorId}
                                        onChange={(e) => setAssignmentForm({ ...assignmentForm, collaboratorId: e.target.value })}
                                        className="w-full bg-background border rounded px-3 py-2 text-sm"
                                        required
                                    >
                                        <option value="">Seleccione...</option>
                                        {(unifiedCollaborators || []).map(c => (
                                            <option key={c.id} value={c.id} disabled={!c.active}>
                                                {c.name} ({c.detail}){!c.active ? ' [INACTIVO]' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex gap-2 justify-end pt-4 border-t">
                                    <Button type="button" variant="ghost" onClick={() => setShowAssignModal(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={submitting}>
                                        {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                                        Asignar
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Components modal */}
            {showComponentsModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-lg shadow-2xl">
                        <CardHeader>
                            <CardTitle>Accesorios y Periféricos</CardTitle>
                            <CardDescription>Vincule cargadores, monitores, o expansiones al equipo.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <form onSubmit={handleAddComponent} className="space-y-3 p-3 bg-muted/40 rounded-lg border">
                                <span className="text-xs font-bold block">Agregar Accesorio</span>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        placeholder="Nombre (ej: Cargador HP, Pantalla)"
                                        value={newComponent.component_name}
                                        onChange={(e) => setNewComponent({ ...newComponent, component_name: e.target.value })}
                                        required
                                    />
                                    <Input
                                        placeholder="Número de Serie"
                                        value={newComponent.serial_number}
                                        onChange={(e) => setNewComponent({ ...newComponent, serial_number: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        placeholder="Marca"
                                        value={newComponent.brand}
                                        onChange={(e) => setNewComponent({ ...newComponent, brand: e.target.value })}
                                    />
                                    <Input
                                        placeholder="Modelo"
                                        value={newComponent.model}
                                        onChange={(e) => setNewComponent({ ...newComponent, model: e.target.value })}
                                    />
                                </div>
                                <Button type="submit" size="sm" className="w-full">
                                    Vincular Accesorio
                                </Button>
                            </form>

                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Vinculados actualmente</span>
                                {(!selectedAsset?.components || selectedAsset.components.length === 0) ? (
                                    <p className="text-xs text-muted-foreground italic">No hay accesorios.</p>
                                ) : (
                                    (selectedAsset.components || []).map((c: any) => (
                                        <div key={c.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                                            <div>
                                                <span className="font-bold">{c.component_name}</span> 
                                                {c.brand && <span className="text-muted-foreground"> ({c.brand} {c.model})</span>}
                                                {c.serial_number && <span className="block text-[10px] text-muted-foreground font-mono">S/N: {c.serial_number}</span>}
                                            </div>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => handleRemoveComponent(c.id)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex justify-end border-t pt-3">
                                <Button type="button" variant="outline" size="sm" onClick={() => setShowComponentsModal(false)}>
                                    Cerrar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Licenses modal */}
            {showLicensesModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-lg shadow-2xl">
                        <CardHeader>
                            <CardTitle>Licencias de Software</CardTitle>
                            <CardDescription>Asocie claves y plazos de software al equipo.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <form onSubmit={handleAddLicense} className="space-y-3 p-3 bg-muted/40 rounded-lg border">
                                <span className="text-xs font-bold block">Vincular Nueva Licencia</span>
                                <div className="space-y-2">
                                    <select
                                        value={newLicense.license_catalog_id}
                                        onChange={(e) => setNewLicense({ ...newLicense, license_catalog_id: e.target.value })}
                                        className="w-full bg-background border rounded px-3 py-2 text-sm"
                                        required
                                    >
                                        <option value="">Seleccione Software...</option>
                                        {licensesCatalog.map(lic => (
                                            <option key={lic.id} value={lic.id}>{lic.name}</option>
                                        ))}
                                    </select>

                                    <Input
                                        placeholder="Clave de Licencia (Key)"
                                        value={newLicense.license_key}
                                        onChange={(e) => setNewLicense({ ...newLicense, license_key: e.target.value })}
                                    />

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-muted-foreground uppercase">Fecha de Expiración</label>
                                        <Input
                                            type="date"
                                            value={newLicense.expiration_date}
                                            onChange={(e) => setNewLicense({ ...newLicense, expiration_date: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <Button type="submit" size="sm" className="w-full">
                                    Asignar Licencia
                                </Button>
                            </form>

                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Licencias asignadas</span>
                                {(!selectedAsset?.licenses || selectedAsset.licenses.length === 0) ? (
                                    <p className="text-xs text-muted-foreground italic">No hay licencias asignadas.</p>
                                ) : (
                                    (selectedAsset.licenses || []).map((l: any) => (
                                        <div key={l.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                                            <div>
                                                <span className="font-bold">{l.license_name}</span>
                                                {l.license_key && <span className="block text-[10px] text-muted-foreground font-mono">Key: {l.license_key}</span>}
                                                {l.expiration_date && <span className="block text-[10px] text-red-500 font-semibold">Vence: {new Date(l.expiration_date).toLocaleDateString()}</span>}
                                            </div>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => handleRemoveLicense(l.id)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex justify-end border-t pt-3">
                                <Button type="button" variant="outline" size="sm" onClick={() => setShowLicensesModal(false)}>
                                    Cerrar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Documents and Attachments Modal (Invoices, Warranties, Manuals) */}
            {showDocumentsModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-lg shadow-2xl">
                        <CardHeader className="bg-muted/30 border-b pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Paperclip className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                Adjuntar Documento al Activo
                            </CardTitle>
                            <CardDescription>
                                Suba facturas de compra, pólizas de garantía o manuales técnicos. Se guardan físicamente en el servidor.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <form onSubmit={handleUploadDocument} className="space-y-3 p-3 bg-muted/40 rounded-lg border">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">Tipo de Documento</label>
                                    <select
                                        value={documentForm.document_type}
                                        onChange={(e) => setDocumentForm({ ...documentForm, document_type: e.target.value })}
                                        className="w-full bg-background border rounded px-3 py-2 text-sm"
                                        required
                                    >
                                        <option value="invoice">🧾 Factura de Compra / Adquisición</option>
                                        <option value="warranty">🛡️ Certificado / Póliza de Garantía</option>
                                        <option value="manual">📖 Manual de Usuario / Ficha Técnica</option>
                                        <option value="handover">📄 Boleta de Entrega Firmada</option>
                                        <option value="other">📎 Otro Documento Adjunto</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">Título / Descripción del Archivo</label>
                                    <Input
                                        placeholder="Ej: Factura Electrónica #FE-9012, Póliza HP Care Pack"
                                        value={documentForm.title}
                                        onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">Seleccionar Archivo (PDF, JPG, PNG, DOCX, XLSX)</label>
                                    <Input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0] || null;
                                            setDocumentForm(prev => ({
                                                ...prev,
                                                file,
                                                title: prev.title ? prev.title : (file ? file.name.replace(/\.[^/.]+$/, "") : "")
                                            }));
                                        }}
                                        required
                                        className="cursor-pointer text-xs"
                                    />
                                    <span className="text-[10px] text-muted-foreground block">
                                        El archivo se transmitirá al servidor y se almacenará en el almacenamiento persistente.
                                    </span>
                                </div>

                                <Button type="submit" size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold" disabled={uploadingDoc}>
                                    {uploadingDoc ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Subiendo archivo al servidor...
                                        </>
                                    ) : (
                                        <>
                                            <FileUp className="h-4 w-4 mr-2" />
                                            Subir y Vincular Documento
                                        </>
                                    )}
                                </Button>
                            </form>

                            <div className="space-y-2 max-h-52 overflow-y-auto">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Documentos Adjuntos ({selectedAsset?.documents?.length || 0})</span>
                                {(!selectedAsset?.documents || selectedAsset.documents.length === 0) ? (
                                    <p className="text-xs text-muted-foreground italic bg-muted/20 p-2 rounded text-center">
                                        No hay documentos guardados para este activo.
                                    </p>
                                ) : (
                                    (selectedAsset.documents || []).map((doc: any) => (
                                        <div key={doc.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded border">
                                            <div className="truncate pr-2">
                                                <span className="font-bold block truncate">{doc.title}</span>
                                                <span className="text-[10px] text-muted-foreground block truncate">
                                                    {doc.file_name} • Subido por {doc.uploaded_by} ({new Date(doc.uploaded_at).toLocaleDateString()})
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <a 
                                                    href={doc.file_url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded transition"
                                                    title="Ver archivo"
                                                >
                                                    <ExternalLink className="h-4 w-4" />
                                                </a>
                                                <Button 
                                                    size="icon" 
                                                    variant="ghost" 
                                                    className="h-7 w-7 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20" 
                                                    onClick={() => handleDeleteDocument(doc.id)}
                                                    title="Eliminar documento"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex justify-end border-t pt-3">
                                <Button type="button" variant="outline" size="sm" onClick={() => setShowDocumentsModal(false)}>
                                    Cerrar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Modal: Guía y Manual del Administrador de TI para el Agente Windows */}
            {showAgentGuide && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
                        <CardHeader className="border-b pb-4 bg-muted/20">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                        <Laptop className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-extrabold text-foreground flex items-center gap-2">
                                            Manual Oficial del Agente Windows (ITAM)
                                            <span className="text-xs font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                                                v1.0.0
                                            </span>
                                        </CardTitle>
                                        <CardDescription className="text-xs mt-0.5">
                                            Guía completa para despliegue por GPO/Intune, instalador asistido con 1-clic y administración de servicio.
                                        </CardDescription>
                                    </div>
                                </div>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowAgentGuide(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
                            {/* Card 0: Entornos y Direcciones Oficiales */}
                            <div className="p-4 rounded-xl border bg-slate-950 text-slate-100 space-y-2.5 shadow-sm">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-300">
                                        <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                                        Servidores Oficiales del Ecosistema IntraTool
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">Puerto Agente: HTTP / UDP 3001</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] text-slate-400 block font-semibold">🚀 Servidor de Producción</span>
                                            <span className="font-mono text-emerald-400 font-bold select-all">http://192.168.1.14:9003</span>
                                        </div>
                                        <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded font-mono">Principal</span>
                                    </div>
                                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] text-slate-400 block font-semibold">🧪 Servidor de Pruebas / Dev</span>
                                            <span className="font-mono text-amber-400 font-bold select-all">http://192.168.1.14:9001</span>
                                        </div>
                                        <span className="text-[10px] bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded font-mono">Fallback</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card 1: Despliegue Corporativo Masivo (GPO / Intune / PowerShell) */}
                            <div className="p-4 rounded-xl border bg-card space-y-2.5">
                                <div className="flex items-center gap-2 font-semibold text-foreground">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-bold">1</span>
                                    Despliegue Corporativo Masivo Desatendido (Active Directory GPO / Microsoft Intune)
                                </div>
                                <p className="text-muted-foreground text-xs leading-relaxed">
                                    Utilice el instalador oficial <strong className="text-foreground">&quot;ClicToolsAgent-Setup.exe&quot;</strong> con parámetros silenciosos para desplegar en segundo plano a toda la red corporativa sin intervención del usuario:
                                </p>
                                <div className="p-3 bg-muted/60 rounded-lg border font-mono text-xs space-y-1.5 text-foreground">
                                    <div><span className="text-muted-foreground font-sans block text-[11px] font-semibold">Instalación silenciosa desatendida (Producción):</span> ClicToolsAgent-Setup.exe /quiet SERVERURL=&quot;http://192.168.1.14:9003&quot;</div>
                                    <div className="border-t pt-1.5 border-dashed border-muted-foreground/30"><span className="text-muted-foreground font-sans block text-[11px] font-semibold">Instalación silenciosa (Pruebas / Dev):</span> ClicToolsAgent-Setup.exe /quiet SERVERURL=&quot;http://192.168.1.14:9001&quot;</div>
                                    <div className="border-t pt-1.5 border-dashed border-muted-foreground/30"><span className="text-muted-foreground font-sans block text-[11px] font-semibold">Desinstalación remota desatendida:</span> ClicToolsAgent-Setup.exe --uninstall</div>
                                </div>
                            </div>

                            {/* Card 2: Instalador Asistido / Setup 1-Clic */}
                            <div className="p-4 rounded-xl border bg-card space-y-2.5">
                                <div className="flex items-center gap-2 font-semibold text-foreground">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-xs font-bold">2</span>
                                    Instalación Asistida con Doble-Clic (Técnicos de TI)
                                </div>
                                <p className="text-muted-foreground text-xs leading-relaxed">
                                    Al ejecutar <strong className="text-foreground">&quot;ClicToolsAgent-Setup.exe&quot;</strong> con doble clic en Windows Explorer, se abrirá la ventana gráfica donde el técnico puede:
                                </p>
                                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 pl-1">
                                    <li>Seleccionar en 1 clic el entorno deseado (<strong>Producción :9003</strong> o <strong>Pruebas :9001</strong>).</li>
                                    <li>Presionar <strong>&quot;Probar Conexión&quot;</strong> para verificar conectividad con el servidor antes de proceder.</li>
                                    <li>Presionar <strong>&quot;Instalar Servicio Windows&quot;</strong> para copiar binarios, registrar e iniciar el servicio en 2 segundos.</li>
                                </ul>
                            </div>

                            {/* Card 3: Modificación Manual por el Técnico */}
                            <div className="p-4 rounded-xl border bg-card space-y-3">
                                <div className="flex items-center gap-2 font-semibold text-foreground">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-xs font-bold">3</span>
                                    Modificación Manual en Caliente de la IP (En Equipos Ya Instalados)
                                </div>
                                <p className="text-muted-foreground text-xs">
                                    Si un equipo ya instalado necesita cambiar de servidor o agregar un nuevo fallback:
                                </p>
                                <div className="space-y-2">
                                    <div className="p-3 bg-muted/60 rounded-lg border font-mono text-xs text-foreground">
                                        <div className="text-muted-foreground mb-1 font-sans font-bold text-[11px]">Opción A: Por comando en PowerShell / CMD (Como Administrador)</div>
                                        {'cd "C:\\Program Files\\ClicTools\\IntraToolAgent"'}<br/>
                                        {'.\\IntraToolAgent.exe --set-server "http://192.168.1.14:9003" --fallback "http://192.168.1.14:9001"'}
                                    </div>
                                    <div className="p-3 bg-muted/60 rounded-lg border font-mono text-xs text-foreground">
                                        <div className="text-muted-foreground mb-1 font-sans font-bold text-[11px]">Opción B: Editando el archivo de configuración</div>
                                        Ruta: <strong className="text-foreground">C:\Program Files\ClicTools\IntraToolAgent\appsettings.json</strong>
                                        <pre className="mt-2 p-2 bg-background rounded border text-[11px] text-muted-foreground font-mono">
{`{
  "ServerUrl": "http://192.168.1.14:9003",
  "FallbackServers": [
    "http://192.168.1.14:9001",
    "http://localhost:9003"
  ],
  "EnableUdpAutoDiscovery": true,
  "HeartbeatIntervalSeconds": 60
}`}
                                        </pre>
                                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                                            💡 <em>Recarga en caliente: El agente detecta los cambios al guardar el archivo sin necesidad de reiniciar el servicio.</em>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 4: Control del Servicio en Windows */}
                            <div className="p-4 rounded-xl border bg-card space-y-2.5">
                                <div className="flex items-center gap-2 font-semibold text-foreground">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-xs font-bold">4</span>
                                    Control del Servicio en Windows
                                </div>
                                <p className="text-muted-foreground text-xs leading-relaxed">
                                    El servicio corre bajo el nombre oficial de sistema <strong className="text-foreground">Clictoolsagent</strong> con privilegios de <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">NT AUTHORITY\SYSTEM</code>.
                                </p>
                                <div className="p-3 bg-muted/60 rounded-lg border font-mono text-xs space-y-1.5 text-foreground">
                                    <div><span className="text-muted-foreground font-sans block text-[11px] font-semibold">Reiniciar Servicio:</span> net stop Clictoolsagent && net start Clictoolsagent</div>
                                    <div className="border-t pt-1.5 border-dashed border-muted-foreground/30"><span className="text-muted-foreground font-sans block text-[11px] font-semibold">Probar Conexión en Consola:</span> .\IntraToolAgent.exe --test-connection</div>
                                    <div className="border-t pt-1.5 border-dashed border-muted-foreground/30"><span className="text-muted-foreground font-sans block text-[11px] font-semibold">Modo Debug Interactivo:</span> .\IntraToolAgent.exe --debug</div>
                                </div>
                            </div>
                        </CardContent>
                        <div className="flex items-center justify-between p-4 border-t bg-muted/20">
                            <Button variant="outline" onClick={downloadSilentScript} className="gap-2 text-xs border-indigo-500/40 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                <FileDown className="h-4 w-4" />
                                ⚡ Descargar Script 1-Clic (.ps1)
                            </Button>
                            <Button onClick={() => setShowAgentGuide(false)}>Entendido / Cerrar</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Alert Dialog para Confirmación de Eliminación de Documentos */}
            <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar documento adjunto?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará de forma permanente el archivo del servidor de almacenamiento.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteDocument} className="bg-red-600 hover:bg-red-700">
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
