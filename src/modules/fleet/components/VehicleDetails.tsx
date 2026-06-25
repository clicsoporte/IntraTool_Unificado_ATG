'use client';

import { useState, useEffect } from 'react';
import { 
    Truck, Gauge, Fuel, Wrench, Calendar, 
    User, DollarSign, Plus, ArrowLeft, 
    FileText, Activity, TrendingUp, AlertCircle, Settings, Trash2, CheckCircle, Clock, MoreVertical,
    Camera, Loader2, MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { saveFuelLogAction, saveMaintenanceLogAction, savePermitAction, deleteVehicleAction, deletePermitAction, savePreventativePlanAction, deletePreventativePlanAction, deleteFuelLogAction, deleteMaintenanceLogAction, updateVehicleRtvAction, getTelegramBotLogsAction, getDeletedLogsAction, restoreDeletedLogAction } from '../lib/actions';
import { useRouter } from 'next/navigation';
import { useToast } from '@/modules/core/hooks/use-toast';
import Image from 'next/image';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRef, useMemo, useCallback } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const parseLogPhoto = (text: string | null | undefined) => {
    if (!text) return { cleanText: "", photoFilename: null };
    const match = text.match(/\[Foto:\s*([^\]]+)\]/);
    if (match) {
        const photoFilename = match[1];
        const cleanText = text.replace(match[0], "").trim();
        return { cleanText, photoFilename };
    }
    return { cleanText: text, photoFilename: null };
};

const getBase64ImageFromUrl = async (imageUrl: string): Promise<string> => {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export default function VehicleDetails({ vehicle, fuelLogs, maintenanceLogs, permits, preventativePlans = [], catalogs }: { 
    vehicle: any, 
    fuelLogs: any[], 
    maintenanceLogs: any[], 
    permits: any[],
    preventativePlans?: any[],
    catalogs: any
}) {
    const router = useRouter();
    const { toast } = useToast();
    const { user, companyData } = useAuth();
    const { hasPermission } = useAuthorization();
    const [loading, setLoading] = useState(false);
    const [fuelLoading, setFuelLoading] = useState(false);
    const [maintLoading, setMaintLoading] = useState(false);
    const [permitLoading, setPermitLoading] = useState(false);
    const [preventativeLoading, setPreventativeLoading] = useState(false);
    
    // Soft-Delete Papelera state
    const [deletedLogs, setDeletedLogs] = useState<any[]>([]);
    const [showDeleted, setShowDeleted] = useState(false);
    const [deletedLoading, setDeletedLoading] = useState(false);

    const loadDeletedLogs = useCallback(async () => {
        try {
            const logs = await getDeletedLogsAction(vehicle.id);
            setDeletedLogs(logs);
        } catch (e) {
            console.error("Error loading deleted logs", e);
        }
    }, [vehicle.id]);

    useEffect(() => {
        setDeletedLoading(true);
        loadDeletedLogs().finally(() => setDeletedLoading(false));
    }, [loadDeletedLogs]);

    async function handleRestoreLog(archiveId: number) {
        if (!confirm("¿Está seguro de que desea restaurar este registro? Se incorporará nuevamente a las métricas del vehículo.")) return;
        setLoading(true);
        try {
            const res = await restoreDeletedLogAction(archiveId, vehicle.id);
            if (res.success) {
                toast({ title: "Éxito", description: "Registro restaurado y métricas actualizadas." });
                await loadDeletedLogs();
                router.refresh();
            } else {
                throw new Error(res.error);
            }
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "No se pudo restaurar el registro." });
        } finally {
            setLoading(false);
        }
    }
    
    // Submitting refs to synchronously block double/triple-click submissions
    const isFuelSubmitting = useRef(false);
    const isMaintSubmitting = useRef(false);
    const isPermitSubmitting = useRef(false);
    const isPreventativeSubmitting = useRef(false);
    const [permitDialogOpen, setPermitDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [cost, setCost] = useState(''); 
    const [activeTab, setActiveTab] = useState('history');
    const [maintType, setMaintType] = useState('');
    const [preventativeDialogOpen, setPreventativeDialogOpen] = useState(false);
    const [photoModalOpen, setPhotoModalOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [rtvDialogOpen, setRtvDialogOpen] = useState(false);
    const [rtvDateValue, setRtvDateValue] = useState(vehicle.rtvExpiration || '');
    const [rtvLoading, setRtvLoading] = useState(false);
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
    const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
    
    // Pagination states for history lists
    const [fuelPage, setFuelPage] = useState(1);
    const [maintPage, setMaintPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    const [botLogs, setBotLogs] = useState<any[]>([]);
    const [botLogsLoading, setBotLogsLoading] = useState(true);
    const [botPage, setBotPage] = useState(1);

    useEffect(() => {
        async function loadBotLogs() {
            setBotLogsLoading(true);
            try {
                const logs = await getTelegramBotLogsAction(vehicle.id);
                setBotLogs(logs);
            } catch (e) {
                console.error("Error loading bot logs:", e);
            } finally {
                setBotLogsLoading(false);
            }
        }
        loadBotLogs();
    }, [vehicle.id, rtvDialogOpen]);

    const paginatedBotLogs = useMemo(() => {
        const startIndex = (botPage - 1) * ITEMS_PER_PAGE;
        return botLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [botLogs, botPage]);

    const displayedFuelLogs = useMemo(() => {
        if (!showDeleted) return fuelLogs;
        const activeWithFlag = fuelLogs.map(l => ({ ...l, isDeleted: false }));
        const deletedFuel = deletedLogs
            .filter(l => l.logType === 'fuel')
            .map(l => ({
                ...JSON.parse(l.payload),
                isDeleted: true,
                archiveId: l.id,
                deletedAt: l.deletedAt,
                deletedBy: l.deletedBy
            }));
        const merged = [...activeWithFlag, ...deletedFuel];
        return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [fuelLogs, deletedLogs, showDeleted]);

    const displayedMaintLogs = useMemo(() => {
        if (!showDeleted) return maintenanceLogs;
        const activeWithFlag = maintenanceLogs.map(l => ({ ...l, isDeleted: false }));
        const deletedMaint = deletedLogs
            .filter(l => l.logType === 'maintenance')
            .map(l => ({
                ...JSON.parse(l.payload),
                isDeleted: true,
                archiveId: l.id,
                deletedAt: l.deletedAt,
                deletedBy: l.deletedBy
            }));
        const merged = [...activeWithFlag, ...deletedMaint];
        return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [maintenanceLogs, deletedLogs, showDeleted]);

    const displayedPermits = useMemo(() => {
        if (!showDeleted) return permits;
        const activeWithFlag = permits.map(l => ({ ...l, isDeleted: false }));
        const deletedPermits = deletedLogs
            .filter(l => l.logType === 'permit')
            .map(l => ({
                ...JSON.parse(l.payload),
                isDeleted: true,
                archiveId: l.id,
                deletedAt: l.deletedAt,
                deletedBy: l.deletedBy
            }));
        const merged = [...activeWithFlag, ...deletedPermits];
        return merged.sort((a, b) => new Date(b.expirationDate).getTime() - new Date(a.expirationDate).getTime());
    }, [permits, deletedLogs, showDeleted]);

    const displayedPreventativePlans = useMemo(() => {
        if (!showDeleted) return preventativePlans;
        const activeWithFlag = preventativePlans.map(l => ({ ...l, isDeleted: false }));
        const deletedPlans = deletedLogs
            .filter(l => l.logType === 'preventative_plan')
            .map(l => ({
                ...JSON.parse(l.payload),
                isDeleted: true,
                archiveId: l.id,
                deletedAt: l.deletedAt,
                deletedBy: l.deletedBy
            }));
        const merged = [...activeWithFlag, ...deletedPlans];
        return merged;
    }, [preventativePlans, deletedLogs, showDeleted]);

    const paginatedFuelLogs = useMemo(() => {
        const startIndex = (fuelPage - 1) * ITEMS_PER_PAGE;
        return displayedFuelLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [displayedFuelLogs, fuelPage]);

    const paginatedMaintLogs = useMemo(() => {
        const startIndex = (maintPage - 1) * ITEMS_PER_PAGE;
        return displayedMaintLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [displayedMaintLogs, maintPage]);
    
    // Find the default fuel matching the vehicle's fuelType string
    const defaultFuel = catalogs.settings?.find((f:any) => f.category === 'fuel_type' && f.value === vehicle?.fuelType);
    
    const [selectedFuelPrice, setSelectedFuelPrice] = useState(defaultFuel?.price ?? 0);
    const [selectedFuelId, setSelectedFuelId] = useState(defaultFuel?.id?.toString() ?? '');
    
    const [liters, setLiters] = useState(0);
    // efecto para actualizar costo cuando cambia litros o precio del combustible
    useEffect(() => {
        const total = (liters * selectedFuelPrice).toFixed(2);
        setCost(total);
    }, [liters, selectedFuelPrice]);
    const fuelFormRef = useRef<HTMLFormElement>(null);
    const maintenanceFormRef = useRef<HTMLFormElement>(null);

    const formatOdometer = (val: number, unit: string = 'km', includeConversion = true) => {
        const value = val || 0;
        if (unit === 'mi') {
            const km = (value * 1.60934).toLocaleString('es-CR', { maximumFractionDigits: 1 });
            return includeConversion ? `${value.toLocaleString()} mi (${km} km)` : `${value.toLocaleString()} mi`;
        } else if (unit === 'hr') {
            return `${value.toLocaleString()} hr`;
        }
        const mi = (value * 0.621371).toLocaleString('es-CR', { maximumFractionDigits: 1 });
        return includeConversion ? `${value.toLocaleString()} km (${mi} mi)` : `${value.toLocaleString()} km`;
    };

    const handleDeleteVehicle = async () => {
        setIsDeleting(true);
        try {
            await deleteVehicleAction(vehicle.id);
            toast({ title: "Activo Eliminado", description: "El activo se ha eliminado correctamente." });
            router.push('/dashboard/fleet');
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el activo." });
            setIsDeleting(false);
        }
    };

    // Calculate Efficiency (Metrics)
    // Km/L = (Mileage Current - Mileage Previous) / Liters Previous
    const efficiencyData = fuelLogs.slice(0, 5).map((log, index) => {
        const prevLog = fuelLogs[index + 1];
        if (!prevLog) return null;
        const kmTravelled = log.mileageBefore - prevLog.mileageBefore;
        const liters = prevLog.liters;
        const kmPerLiter = liters > 0 ? kmTravelled / liters : 0;
        return { date: log.date, kmPerLiter };
    }).filter(Boolean);

    const avgEfficiency = efficiencyData.length > 0 
        ? efficiencyData.reduce((acc, curr: any) => acc + curr.kmPerLiter, 0) / efficiencyData.length 
        : 0;
    
    const efficiencyUnit = (vehicle.odometerUnit === 'hr' ? 'Hr/L' : (vehicle.odometerUnit === 'mi' ? 'Mi/L' : 'Km/L'));

    // Maintenance progress
    const mileageSinceLastChange = vehicle.currentMileage - vehicle.lastOilChangeMileage;
    const oilChangeProgress = Math.min(100, (mileageSinceLastChange / vehicle.oilChangeInterval) * 100);
    const isOilChangeUrgent = oilChangeProgress >= 90;

    async function handleFuelSubmit(formData: FormData) {
        if (isFuelSubmitting.current) return;
        isFuelSubmitting.current = true;
        setFuelLoading(true);
        try {
            formData.append('vehicleId', vehicle.id.toString());
            await saveFuelLogAction(formData, user?.name || 'Sistema');
            toast({ title: "Éxito", description: "Consumo de combustible registrado y notificado por correo." });
            fuelFormRef.current?.reset();
            router.refresh();
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo registrar el consumo." });
        } finally {
            setFuelLoading(false);
            isFuelSubmitting.current = false;
        }
    }

    async function handleMaintenanceSubmit(formData: FormData) {
        if (isMaintSubmitting.current) return;
        isMaintSubmitting.current = true;
        setMaintLoading(true);
        try {
            formData.append('vehicleId', vehicle.id.toString());
            await saveMaintenanceLogAction(formData, user?.name || 'Sistema');
            toast({ title: "Éxito", description: "Mantenimiento registrado y notificado por correo." });
            maintenanceFormRef.current?.reset();
            router.refresh();
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo registrar el mantenimiento." });
        } finally {
            setMaintLoading(false);
            isMaintSubmitting.current = false;
        }
    }

    async function handlePermitSubmit(formData: FormData) {
        if (isPermitSubmitting.current) return;
        isPermitSubmitting.current = true;
        setPermitLoading(true);
        const amountStr = formData.get('amount') as string;
        const amount = amountStr ? parseFloat(amountStr) : null;

        const data = {
            vehicleId: vehicle.id,
            type: formData.get('type'),
            expirationDate: formData.get('expirationDate'),
            documentUrl: '',
            amount: amount !== null && !isNaN(amount) ? amount : null
        };

        try {
            await savePermitAction(data);
            setPermitDialogOpen(false);
            toast({ title: "Éxito", description: "Permiso registrado correctamente." });
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo registrar el permiso." });
        } finally {
            setPermitLoading(false);
            isPermitSubmitting.current = false;
        }
    }

    async function handleDeletePermit(permitId: number) {
        if (!confirm("¿Está seguro de que desea eliminar este permiso?")) return;
        setLoading(true);
        try {
            await deletePermitAction(permitId, vehicle.id);
            toast({ title: "Éxito", description: "Permiso eliminado correctamente." });
            await loadDeletedLogs();
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el permiso." });
        } finally {
            setLoading(false);
        }
     }

    async function handleUpdateRtv(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setRtvLoading(true);
        try {
            await updateVehicleRtvAction(vehicle.id, rtvDateValue || null);
            toast({ title: "Éxito", description: "RTV actualizado correctamente." });
            setRtvDialogOpen(false);
            router.refresh();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "No se pudo actualizar el RTV." });
        } finally {
            setRtvLoading(false);
        }
    }

     async function handleDeleteFuelLog(logId: number) {
        if (!confirm("¿Está seguro de que desea eliminar este registro de repostaje?")) return;
        setLoading(true);
        try {
            await deleteFuelLogAction(logId, vehicle.id);
            toast({ title: "Éxito", description: "Repostaje eliminado correctamente." });
            await loadDeletedLogs();
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el repostaje." });
        } finally {
            setLoading(false);
        }
     }

     async function handleDeleteMaintenanceLog(logId: number) {
        if (!confirm("¿Está seguro de que desea eliminar este registro de mantenimiento?")) return;
        setLoading(true);
        try {
            await deleteMaintenanceLogAction(logId, vehicle.id);
            toast({ title: "Éxito", description: "Mantenimiento eliminado correctamente." });
            await loadDeletedLogs();
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el mantenimiento." });
        } finally {
            setLoading(false);
        }
     }

     async function handlePreventativeSubmit(formData: FormData) {
         if (isPreventativeSubmitting.current) return;
         isPreventativeSubmitting.current = true;
         setPreventativeLoading(true);
         const data = {
             vehicleId: vehicle.id,
             maintenanceType: formData.get('maintenanceType') as string,
             intervalValue: Number(formData.get('intervalValue')),
             intervalUnit: formData.get('intervalUnit') as string,
             lastPerformedValue: Number(formData.get('lastPerformedValue'))
         };

         try {
             await savePreventativePlanAction(data);
             setPreventativeDialogOpen(false);
             toast({ title: "Éxito", description: "Plan preventivo registrado correctamente." });
             router.refresh();
         } catch (error) {
             toast({ variant: "destructive", title: "Error", description: "No se pudo registrar el plan preventivo." });
         } finally {
             setPreventativeLoading(false);
             isPreventativeSubmitting.current = false;
         }
     }

     async function handleDeletePreventativePlan(planId: number) {
         if (!confirm("¿Está seguro de que desea eliminar este plan preventivo?")) return;
         setLoading(true);
         try {
             await deletePreventativePlanAction(planId, vehicle.id);
             toast({ title: "Éxito", description: "Plan preventivo eliminado correctamente." });
             await loadDeletedLogs();
             router.refresh();
         } catch (error) {
             toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el plan." });
         } finally {
             setLoading(false);
         }
     }

    const exportFuelLogPDF = async (log: any) => {
        if (!companyData) return;
        
        toast({ title: "Generando PDF", description: "Descargando comprobante y preparando archivo..." });
        
        const parsed = parseLogPhoto(log.notes);
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        // Margins
        const marginX = 12;
        let currentY = 15;
        const pageWidth = 210;
        const contentWidth = pageWidth - (marginX * 2); // 186mm
        
        // --- 1. HEADER (Industrias Garend S.A. vs. Badge-box) ---
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(26, 54, 93);
        doc.text(companyData.name || "Industrias Garend S.A.", marginX, currentY);
        currentY += 6;
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(113, 128, 150);
        doc.text(`Cédula Jurídica: ${companyData.taxId || "3101133082"}`, marginX, currentY);
        currentY += 4.5;
        
        // Address text wrapping
        const splitAddress = doc.splitTextToSize(companyData.address || "Alajuela, Poás, Carrillos bajo, del EBAIS 700 oeste", 100);
        splitAddress.forEach((line: string) => {
            doc.text(line, marginX, currentY);
            currentY += 4.5;
        });
        
        doc.text(`Teléfono: ${companyData.phone || "+506 2458-4343"}`, marginX, currentY);
        currentY += 4.5;
        doc.text(`Email: ${companyData.email || "ventas@industriasgarend.com"}`, marginX, currentY);
        
        // Right Column - Badge Box
        const badgeBoxX = 120;
        const badgeBoxY = 15;
        const badgeBoxWidth = 78;
        const badgeBoxHeight = 35;
        
        // Draw badge box
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(247, 250, 252);
        doc.roundedRect(badgeBoxX, badgeBoxY, badgeBoxWidth, badgeBoxHeight, 2, 2, 'FD');
        
        // Badge Content
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(160, 174, 192); // light grey
        doc.text("COMPROBANTE DE REPOSTAJE", badgeBoxX + 4, badgeBoxY + 5);
        
        doc.setFontSize(14);
        doc.setTextColor(26, 54, 93);
        doc.text(`FUEL-${log.id}`, badgeBoxX + 4, badgeBoxY + 11);
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(113, 128, 150);
        doc.text("Fecha Registro:", badgeBoxX + 4, badgeBoxY + 18);
        doc.text("Placa / Matrícula:", badgeBoxX + 4, badgeBoxY + 23);
        doc.text("Estado Carga:", badgeBoxX + 4, badgeBoxY + 29);
        
        // Values on right side of badge box
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(45, 55, 72);
        const dateStr = format(parseISO(log.date), 'dd/MM/yyyy HH:mm', { locale: es });
        doc.text(dateStr, badgeBoxX + badgeBoxWidth - 4, badgeBoxY + 18, { align: 'right' });
        doc.setTextColor(43, 108, 176); // accent blue
        doc.text(vehicle.plate, badgeBoxX + badgeBoxWidth - 4, badgeBoxY + 23, { align: 'right' });
        
        // Status badge pill (REGISTRADO)
        const pillText = "REGISTRADO";
        const pillFillColor = [198, 246, 213]; // light green
        const pillTextColor = [34, 84, 61]; // dark green
        
        const pillWidth = 22;
        const pillHeight = 4.5;
        const pillX = badgeBoxX + badgeBoxWidth - pillWidth - 4;
        const pillY = badgeBoxY + 26;
        
        doc.setFillColor(pillFillColor[0], pillFillColor[1], pillFillColor[2]);
        doc.setDrawColor(pillFillColor[0], pillFillColor[1], pillFillColor[2]);
        doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 1, 1, 'FD');
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(pillTextColor[0], pillTextColor[1], pillTextColor[2]);
        doc.text(pillText, pillX + (pillWidth / 2), pillY + 3.2, { align: 'center' });
        
        currentY = Math.max(currentY + 12, badgeBoxY + badgeBoxHeight + 8);
        
        // Helper to draw a section header
        const drawSectionHeader = (title: string) => {
            doc.setFillColor(43, 108, 176); // accent blue
            doc.rect(marginX, currentY, 1, 5, 'F'); // left border-like bar
            
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(26, 54, 93);
            doc.text(title, marginX + 3, currentY + 3.8);
            currentY += 7;
        };
        
        // Helper to draw a Card box with fields
        const drawCard = (fields: { label: string; value: string; isBold?: boolean; isMono?: boolean; isHighlight?: boolean }[][]) => {
            const cardY = currentY;
            const cardPadding = 4;
            const rowHeight = 9;
            const cardHeight = (fields.length * rowHeight) + (cardPadding * 2);
            
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.roundedRect(marginX, cardY, contentWidth, cardHeight, 1.5, 1.5, 'FD');
            
            let fieldY = cardY + cardPadding;
            fields.forEach((row) => {
                const colWidth = contentWidth / row.length;
                row.forEach((col, colIdx) => {
                    const colX = marginX + (colIdx * colWidth) + 3;
                    
                    doc.setFont('Helvetica', 'bold');
                    doc.setFontSize(7);
                    doc.setTextColor(160, 174, 192);
                    doc.text(col.label, colX, fieldY + 2.5);
                    
                    const isHighlight = col.isHighlight;
                    const isMono = col.isMono;
                    doc.setFont(isMono ? 'Courier' : 'Helvetica', (col.isBold || isHighlight) ? 'bold' : 'normal');
                    doc.setFontSize(isMono ? 8.5 : 9);
                    doc.setTextColor(isHighlight ? 26 : 45, isHighlight ? 54 : 55, isHighlight ? 93 : 72);
                    
                    const wrappedVal = doc.splitTextToSize(col.value || "No registrado", colWidth - 6);
                    doc.text(wrappedVal[0], colX, fieldY + 6.5);
                });
                
                fieldY += rowHeight;
            });
            
            currentY += cardHeight + 5;
        };
        
        // --- SECCIÓN 1: Identificación del Vehículo ---
        drawSectionHeader("1. Identificación del Vehículo");
        drawCard([
            [
                { label: "Marca / Fabricante", value: vehicle.brand || "No registrado", isHighlight: true },
                { label: "Modelo", value: vehicle.model || "No registrado", isHighlight: true },
                { label: "Año Modelo", value: String(vehicle.year || "No registrado") }
            ],
            [
                { label: "Placa Única", value: vehicle.plate, isBold: true, isHighlight: true, isMono: true },
                { label: "Tipo Combustible Autorizado", value: vehicle.fuelType || "No registrado" },
                { label: "Sede de Operación", value: vehicle.branchId || "No registrado" }
            ]
        ]);
        
        // --- SECCIÓN 2: Detalles de la Carga de Combustible ---
        drawSectionHeader("2. Detalles de la Carga de Combustible");
        drawCard([
            [
                { label: "Litros Suministrados", value: `${log.liters.toLocaleString()} Litros`, isBold: true, isHighlight: true },
                { label: "Odómetro al Repostar", value: formatOdometer(log.mileageBefore, vehicle.odometerUnit, false), isBold: true }
            ],
            [
                { label: "Chofer Autorizado", value: log.driverId || "No registrado", isHighlight: true },
                { label: "Registrado en Sistema Por", value: user?.name || "Sistema" }
            ]
        ]);
        
        // --- SECCIÓN 3: Costos y Desglose Financiero ---
        drawSectionHeader("3. Costos y Desglose Financiero");
        const unitCost = log.liters > 0 ? (log.cost / log.liters) : 0;
        drawCard([
            [
                { label: "Costo Unitario por Litro", value: `CRC ${unitCost.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                { label: "Costo Total Transacción", value: `CRC ${log.cost.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, isBold: true, isHighlight: true }
            ]
        ]);
        
        // --- SECCIÓN 4: Notas y Observaciones ---
        if (parsed.cleanText) {
            drawSectionHeader("4. Notas y Observaciones");
            drawCard([
                [
                    { label: "Comentarios Adicionales", value: parsed.cleanText || "Sin observaciones registradas." }
                ]
            ]);
        }
        
        // Footer (Bottom of page)
        const pageHeight = 297;
        doc.setFontSize(8);
        doc.setTextColor(160, 174, 192);
        doc.text(parsed.photoFilename ? "Página 1 de 2" : "Página 1 de 1", pageWidth - marginX, pageHeight - 10, { align: 'right' });
        doc.text("Sistema de Control y Gestión de Flota - Industrias Garend S.A.", marginX, pageHeight - 10);
        
        if (parsed.photoFilename) {
            let photoBase64 = null;
            try {
                photoBase64 = await getBase64ImageFromUrl(`/api/fleet/files/${parsed.photoFilename}`);
            } catch (e) {
                console.error("Failed to load receipt photo for PDF", e);
            }
            
            if (photoBase64) {
                doc.addPage();
                
                // Header of the new page
                doc.setFillColor(43, 108, 176); // accent blue
                doc.rect(marginX, 15, 1, 5, 'F');
                
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(26, 54, 93);
                doc.text("5. Comprobante de Respaldo", marginX + 3, 15 + 3.8);
                
                // Centered large photo container
                const imgWidth = 140;
                const imgHeight = 180;
                const imgX = marginX + (contentWidth - imgWidth) / 2;
                const imgY = 32;
                
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.2);
                doc.roundedRect(marginX, imgY - 4, contentWidth, imgHeight + 8, 1.5, 1.5, 'FD');
                
                try {
                    doc.addImage(photoBase64, 'JPEG', imgX, imgY, imgWidth, imgHeight, undefined, 'FAST');
                } catch (imgError) {
                    console.error("Error adding image to jsPDF", imgError);
                }
                
                // Footer for the second page
                doc.setFontSize(8);
                doc.setTextColor(160, 174, 192);
                doc.text("Página 2 de 2", pageWidth - marginX, pageHeight - 10, { align: 'right' });
                doc.text("Sistema de Control y Gestión de Flota - Industrias Garend S.A.", marginX, pageHeight - 10);
            }
        }
        
        doc.save(`repostaje_${vehicle.plate}_${log.id}.pdf`);
    };

    const exportMaintenanceLogPDF = async (log: any) => {
        if (!companyData) return;
        
        toast({ title: "Generando PDF", description: "Descargando comprobante y preparando archivo..." });
        
        const parsed = parseLogPhoto(log.description);
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        // Margins
        const marginX = 12;
        let currentY = 15;
        const pageWidth = 210;
        const contentWidth = pageWidth - (marginX * 2); // 186mm
        
        // --- 1. HEADER (Industrias Garend S.A. vs. Badge-box) ---
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(26, 54, 93);
        doc.text(companyData.name || "Industrias Garend S.A.", marginX, currentY);
        currentY += 6;
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(113, 128, 150);
        doc.text(`Cédula Jurídica: ${companyData.taxId || "3101133082"}`, marginX, currentY);
        currentY += 4.5;
        
        // Address text wrapping
        const splitAddress = doc.splitTextToSize(companyData.address || "Alajuela, Poás, Carrillos bajo, del EBAIS 700 oeste", 100);
        splitAddress.forEach((line: string) => {
            doc.text(line, marginX, currentY);
            currentY += 4.5;
        });
        
        doc.text(`Teléfono: ${companyData.phone || "+506 2458-4343"}`, marginX, currentY);
        currentY += 4.5;
        doc.text(`Email: ${companyData.email || "ventas@industriasgarend.com"}`, marginX, currentY);
        
        // Right Column - Badge Box
        const badgeBoxX = 120;
        const badgeBoxY = 15;
        const badgeBoxWidth = 78;
        const badgeBoxHeight = 35;
        
        // Draw badge box
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(247, 250, 252);
        doc.roundedRect(badgeBoxX, badgeBoxY, badgeBoxWidth, badgeBoxHeight, 2, 2, 'FD');
        
        // Badge Content
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(160, 174, 192); // light grey
        doc.text("COMPROBANTE DE MANTENIMIENTO", badgeBoxX + 4, badgeBoxY + 5);
        
        doc.setFontSize(14);
        doc.setTextColor(26, 54, 93);
        doc.text(`MNT-${log.id}`, badgeBoxX + 4, badgeBoxY + 11);
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(113, 128, 150);
        doc.text("Fecha Registro:", badgeBoxX + 4, badgeBoxY + 18);
        doc.text("Placa / Matrícula:", badgeBoxX + 4, badgeBoxY + 23);
        doc.text("Estado Servicio:", badgeBoxX + 4, badgeBoxY + 29);
        
        // Values on right side of badge box
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(45, 55, 72);
        const dateStr = format(parseISO(log.date), 'dd/MM/yyyy HH:mm', { locale: es });
        doc.text(dateStr, badgeBoxX + badgeBoxWidth - 4, badgeBoxY + 18, { align: 'right' });
        doc.setTextColor(43, 108, 176); // accent blue
        doc.text(vehicle.plate, badgeBoxX + badgeBoxWidth - 4, badgeBoxY + 23, { align: 'right' });
        
        // Status badge pill (EJECUTADO)
        const pillText = "EJECUTADO";
        const pillFillColor = [235, 230, 255]; // light purple
        const pillTextColor = [107, 70, 193]; // dark purple
        
        const pillWidth = 22;
        const pillHeight = 4.5;
        const pillX = badgeBoxX + badgeBoxWidth - pillWidth - 4;
        const pillY = badgeBoxY + 26;
        
        doc.setFillColor(pillFillColor[0], pillFillColor[1], pillFillColor[2]);
        doc.setDrawColor(pillFillColor[0], pillFillColor[1], pillFillColor[2]);
        doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 1, 1, 'FD');
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(pillTextColor[0], pillTextColor[1], pillTextColor[2]);
        doc.text(pillText, pillX + (pillWidth / 2), pillY + 3.2, { align: 'center' });
        
        currentY = Math.max(currentY + 12, badgeBoxY + badgeBoxHeight + 8);
        
        // Helper to draw a section header
        const drawSectionHeader = (title: string) => {
            doc.setFillColor(43, 108, 176); // accent blue
            doc.rect(marginX, currentY, 1, 5, 'F'); // left border-like bar
            
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(26, 54, 93);
            doc.text(title, marginX + 3, currentY + 3.8);
            currentY += 7;
        };
        
        // Helper to draw a Card box with fields
        const drawCard = (fields: { label: string; value: string; isBold?: boolean; isMono?: boolean; isHighlight?: boolean }[][]) => {
            const cardY = currentY;
            const cardPadding = 4;
            const rowHeight = 9;
            const cardHeight = (fields.length * rowHeight) + (cardPadding * 2);
            
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.roundedRect(marginX, cardY, contentWidth, cardHeight, 1.5, 1.5, 'FD');
            
            let fieldY = cardY + cardPadding;
            fields.forEach((row) => {
                const colWidth = contentWidth / row.length;
                row.forEach((col, colIdx) => {
                    const colX = marginX + (colIdx * colWidth) + 3;
                    
                    doc.setFont('Helvetica', 'bold');
                    doc.setFontSize(7);
                    doc.setTextColor(160, 174, 192);
                    doc.text(col.label, colX, fieldY + 2.5);
                    
                    const isHighlight = col.isHighlight;
                    const isMono = col.isMono;
                    doc.setFont(isMono ? 'Courier' : 'Helvetica', (col.isBold || isHighlight) ? 'bold' : 'normal');
                    doc.setFontSize(isMono ? 8.5 : 9);
                    doc.setTextColor(isHighlight ? 26 : 45, isHighlight ? 54 : 55, isHighlight ? 93 : 72);
                    
                    const wrappedVal = doc.splitTextToSize(col.value || "No registrado", colWidth - 6);
                    doc.text(wrappedVal[0], colX, fieldY + 6.5);
                });
                
                fieldY += rowHeight;
            });
            
            currentY += cardHeight + 5;
        };
        
        // --- SECCIÓN 1: Identificación del Vehículo ---
        drawSectionHeader("1. Identificación del Vehículo");
        drawCard([
            [
                { label: "Marca / Fabricante", value: vehicle.brand || "No registrado", isHighlight: true },
                { label: "Modelo", value: vehicle.model || "No registrado", isHighlight: true },
                { label: "Año Modelo", value: String(vehicle.year || "No registrado") }
            ],
            [
                { label: "Placa Única", value: vehicle.plate, isBold: true, isHighlight: true, isMono: true },
                { label: "Tipo Combustible Autorizado", value: vehicle.fuelType || "No registrado" },
                { label: "Sede de Operación", value: vehicle.branchId || "No registrado" }
            ]
        ]);
        
        // --- SECCIÓN 2: Detalles del Mantenimiento ---
        drawSectionHeader("2. Detalles del Mantenimiento");
        drawCard([
            [
                { label: "Tipo de Mantenimiento", value: log.type || "No registrado", isBold: true, isHighlight: true },
                { label: "Odómetro de Servicio", value: formatOdometer(log.mileage, vehicle.odometerUnit, false), isBold: true }
            ],
            [
                { label: "Taller / Proveedor Responsable", value: log.performedBy || "No registrado", isHighlight: true },
                { label: "Registrado en Sistema Por", value: user?.name || "Sistema" }
            ],
            [
                { label: "Descripción de los Trabajos", value: parsed.cleanText || "Sin descripción adicional." }
            ]
        ]);
        
        // --- SECCIÓN 3: Desglose Financiero ---
        drawSectionHeader("3. Desglose Financiero");
        drawCard([
            [
                { label: "Costo Total del Mantenimiento", value: `CRC ${log.cost.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, isBold: true, isHighlight: true }
            ]
        ]);
        
        // Footer (Bottom of page)
        const pageHeight = 297;
        doc.setFontSize(8);
        doc.setTextColor(160, 174, 192);
        doc.text(parsed.photoFilename ? "Página 1 de 2" : "Página 1 de 1", pageWidth - marginX, pageHeight - 10, { align: 'right' });
        doc.text("Sistema de Control y Gestión de Flota - Industrias Garend S.A.", marginX, pageHeight - 10);
        
        if (parsed.photoFilename) {
            let photoBase64 = null;
            try {
                photoBase64 = await getBase64ImageFromUrl(`/api/fleet/files/${parsed.photoFilename}`);
            } catch (e) {
                console.error("Failed to load maintenance photo for PDF", e);
            }
            
            if (photoBase64) {
                doc.addPage();
                
                // Header of the new page
                doc.setFillColor(43, 108, 176); // accent blue
                doc.rect(marginX, 15, 1, 5, 'F');
                
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(26, 54, 93);
                doc.text("4. Comprobante de Respaldo", marginX + 3, 15 + 3.8);
                
                // Centered large photo container
                const imgWidth = 140;
                const imgHeight = 180;
                const imgX = marginX + (contentWidth - imgWidth) / 2;
                const imgY = 32;
                
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.2);
                doc.roundedRect(marginX, imgY - 4, contentWidth, imgHeight + 8, 1.5, 1.5, 'FD');
                
                try {
                    doc.addImage(photoBase64, 'JPEG', imgX, imgY, imgWidth, imgHeight, undefined, 'FAST');
                } catch (imgError) {
                    console.error("Error adding image to jsPDF", imgError);
                }
                
                // Footer for the second page
                doc.setFontSize(8);
                doc.setTextColor(160, 174, 192);
                doc.text("Página 2 de 2", pageWidth - marginX, pageHeight - 10, { align: 'right' });
                doc.text("Sistema de Control y Gestión de Flota - Industrias Garend S.A.", marginX, pageHeight - 10);
            }
        }
        
        doc.save(`mantenimiento_${vehicle.plate}_${log.id}.pdf`);
    };

    const exportVehicleSheetPDF = () => {
        if (!companyData) return;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        // Margins
        const marginX = 12;
        let currentY = 15;
        const pageWidth = 210;
        const contentWidth = pageWidth - (marginX * 2); // 186mm
        
        // --- 1. HEADER (Industrias Garend S.A. vs. Badge-box) ---
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(26, 54, 93);
        doc.text(companyData.name || "Industrias Garend S.A.", marginX, currentY);
        currentY += 6;
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(113, 128, 150);
        doc.text(`Cédula Jurídica: ${companyData.taxId || "3101133082"}`, marginX, currentY);
        currentY += 4.5;
        
        // Address text wrapping
        const splitAddress = doc.splitTextToSize(companyData.address || "Alajuela, Poás, Carrillos bajo, del EBAIS 700 oeste", 100);
        splitAddress.forEach((line: string) => {
            doc.text(line, marginX, currentY);
            currentY += 4.5;
        });
        
        doc.text(`Teléfono: ${companyData.phone || "+506 2458-4343"}`, marginX, currentY);
        currentY += 4.5;
        doc.text(`Email: ${companyData.email || "ventas@industriasgarend.com"}`, marginX, currentY);
        
        // Right Column - Badge Box
        const badgeBoxX = 120;
        const badgeBoxY = 15;
        const badgeBoxWidth = 78;
        const badgeBoxHeight = 35;
        
        // Draw badge box
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(247, 250, 252);
        doc.roundedRect(badgeBoxX, badgeBoxY, badgeBoxWidth, badgeBoxHeight, 2, 2, 'FD');
        
        // Badge Content
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(160, 174, 192); // light grey
        doc.text("FICHA TÉCNICA DEL VEHÍCULO", badgeBoxX + 4, badgeBoxY + 5);
        
        doc.setFontSize(14);
        doc.setTextColor(26, 54, 93);
        doc.text(`VEH-${vehicle.plate}`, badgeBoxX + 4, badgeBoxY + 11);
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(113, 128, 150);
        doc.text("Fecha Emisión:", badgeBoxX + 4, badgeBoxY + 18);
        doc.text("Placa / Matrícula:", badgeBoxX + 4, badgeBoxY + 23);
        doc.text("Estado Actual:", badgeBoxX + 4, badgeBoxY + 29);
        
        // Values on right side of badge box
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(45, 55, 72);
        const dateStr = format(new Date(), 'dd/MM/yyyy');
        doc.text(dateStr, badgeBoxX + badgeBoxWidth - 4, badgeBoxY + 18, { align: 'right' });
        doc.setTextColor(43, 108, 176); // accent blue
        doc.text(vehicle.plate, badgeBoxX + badgeBoxWidth - 4, badgeBoxY + 23, { align: 'right' });
        
        // Status badge pill
        const statusActive = vehicle.status === 'active';
        const pillText = statusActive ? "OPERATIVO" : "FUERA DE SERVICIO";
        const pillFillColor = statusActive ? [198, 246, 213] : [254, 215, 215];
        const pillTextColor = statusActive ? [34, 84, 61] : [155, 44, 44];
        
        const pillWidth = statusActive ? 22 : 34;
        const pillHeight = 4.5;
        const pillX = badgeBoxX + badgeBoxWidth - pillWidth - 4;
        const pillY = badgeBoxY + 26;
        
        doc.setFillColor(pillFillColor[0], pillFillColor[1], pillFillColor[2]);
        doc.setDrawColor(pillFillColor[0], pillFillColor[1], pillFillColor[2]);
        doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 1, 1, 'FD');
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(pillTextColor[0], pillTextColor[1], pillTextColor[2]);
        doc.text(pillText, pillX + (pillWidth / 2), pillY + 3.2, { align: 'center' });
        
        currentY = Math.max(currentY + 12, badgeBoxY + badgeBoxHeight + 8);
        
        // Helper to draw a section header
        const drawSectionHeader = (title: string) => {
            doc.setFillColor(43, 108, 176); // accent blue
            doc.rect(marginX, currentY, 1, 5, 'F'); // left border-like bar
            
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(26, 54, 93);
            doc.text(title, marginX + 3, currentY + 3.8);
            currentY += 7;
        };
        
        // Helper to draw a Card box with fields
        const drawCard = (fields: { label: string; value: string; isBold?: boolean; isMono?: boolean; isHighlight?: boolean }[][]) => {
            const cardY = currentY;
            const cardPadding = 4;
            const rowHeight = 9;
            const cardHeight = (fields.length * rowHeight) + (cardPadding * 2);
            
            // Draw background and border
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.roundedRect(marginX, cardY, contentWidth, cardHeight, 1.5, 1.5, 'FD');
            
            let fieldY = cardY + cardPadding;
            fields.forEach((row) => {
                const colWidth = contentWidth / row.length;
                row.forEach((col, colIdx) => {
                    const colX = marginX + (colIdx * colWidth) + 3;
                    
                    // Label
                    doc.setFont('Helvetica', 'bold');
                    doc.setFontSize(7);
                    doc.setTextColor(160, 174, 192); // light grey
                    doc.text(col.label, colX, fieldY + 2.5);
                    
                    // Value
                    const isHighlight = col.isHighlight;
                    const isMono = col.isMono;
                    doc.setFont(isMono ? 'Courier' : 'Helvetica', (col.isBold || isHighlight) ? 'bold' : 'normal');
                    doc.setFontSize(isMono ? 8.5 : 9);
                    doc.setTextColor(isHighlight ? 26 : 45, isHighlight ? 54 : 55, isHighlight ? 93 : 72);
                    
                    // Wrap value if needed
                    const wrappedVal = doc.splitTextToSize(col.value || "No registrado", colWidth - 6);
                    doc.text(wrappedVal[0], colX, fieldY + 6.5);
                });
                
                fieldY += rowHeight;
            });
            
            currentY += cardHeight + 5;
        };
        
        // --- SECCIÓN 1: Identificación del Activo ---
        drawSectionHeader("1. Identificación del Activo");
        drawCard([
            [
                { label: "Marca", value: vehicle.brand || "No registrado", isHighlight: true },
                { label: "Modelo", value: vehicle.model || "No registrado", isHighlight: true },
                { label: "Año del Modelo", value: String(vehicle.year || "No registrado") }
            ],
            [
                { label: "Procedencia", value: vehicle.origin || "No registrado" },
                { label: "Sede Asignada", value: vehicle.branchId || "No registrado" },
                { label: "Color", value: vehicle.color || "No registrado" }
            ],
            [
                { label: "Número de Serie", value: vehicle.serialNumber || "No registrado", isMono: true },
                { label: "VIN", value: vehicle.vin || "No registrado", isMono: true },
                { label: "Chasis", value: vehicle.chassisNumber || "No registrado", isMono: true }
            ]
        ]);
        
        // --- SECCIÓN 2: Especificaciones Técnicas ---
        drawSectionHeader("2. Especificaciones Técnicas");
        drawCard([
            [
                { label: "Tipo Carrocería", value: vehicle.bodyType || "No registrado" },
                { label: "Tracción / Configuración", value: vehicle.traction || "No registrado" },
                { label: "Capacidad de Pasajeros", value: `${vehicle.capacity || 0} personas` }
            ],
            [
                { label: "Tipo Combustible", value: vehicle.fuelType || "No registrado" },
                { label: "Capacidad de Carga", value: vehicle.loadCapacity || "No registrado" },
                { label: "Número de Ejes", value: String(vehicle.axes || 2) }
            ],
            [
                { label: "Odómetro Actual", value: formatOdometer(vehicle.currentMileage, vehicle.odometerUnit), isBold: true },
                { label: " ", value: " " },
                { label: " ", value: " " }
            ]
        ]);
        
        // --- SECCIÓN 3: Características del Motor ---
        drawSectionHeader("3. Características del Motor");
        drawCard([
            [
                { label: "Número Motor", value: vehicle.engineNumber || "No registrado", isMono: true },
                { label: "Marca Motor", value: vehicle.engineBrand || "No registrado" },
                { label: "Modelo Motor", value: vehicle.engineModel || "No registrado" }
            ],
            [
                { label: "Serie Motor", value: vehicle.engineSerial || "No registrado" },
                { label: "Cilindrada", value: vehicle.engineDisplacement || "No registrado" },
                { label: "Cilindros", value: vehicle.engineCylinders || "No registrado" }
            ],
            [
                { label: "Potencia", value: vehicle.enginePower || "No registrado" },
                { label: "Fabricante", value: vehicle.engineManufacturer || "No registrado" },
                { label: " ", value: " " }
            ]
        ]);
        
        // --- SECCIÓN 4: Información de Propiedad ---
        drawSectionHeader("4. Información de Propiedad");
        drawCard([
            [
                { label: "Registrado a nombre de", value: vehicle.ownerName || "No registrado", isBold: true, isHighlight: true },
                { label: "Identificación Jurídica / Física", value: vehicle.ownerId || "No registrado", isMono: true }
            ]
        ]);
        
        // --- SECCIÓN 5: Próximos Mantenimientos y Alertas ---
        drawSectionHeader("5. Próximos Mantenimientos y Alertas");
        
        const nextOilChange = vehicle.lastOilChangeMileage + vehicle.oilChangeInterval;
        
        autoTable(doc, {
            startY: currentY,
            margin: { left: marginX, right: marginX },
            theme: 'striped',
            headStyles: { fillColor: [26, 54, 93], textColor: 255, font: 'Helvetica', fontStyle: 'bold', fontSize: 8.5 },
            bodyStyles: { font: 'Helvetica', fontSize: 9, textColor: [45, 55, 72] },
            columnStyles: {
                0: { cellWidth: 90, fontStyle: 'bold' },
                1: { cellWidth: 96 }
            },
            head: [['Mantenimiento / Control', 'Detalle / Estado Operativo']],
            body: [
                ['Vencimiento RTV', vehicle.rtvExpiration ? format(parseISO(vehicle.rtvExpiration), 'dd/MM/yyyy') : 'No registrado'],
                ['Intervalo de Aceite', formatOdometer(vehicle.oilChangeInterval, vehicle.odometerUnit, false)],
                ['Último Cambio de Aceite', `${formatOdometer(vehicle.lastOilChangeMileage, vehicle.odometerUnit, false)} (Restablecido)`],
                ['Siguiente Cambio de Aceite', formatOdometer(nextOilChange, vehicle.odometerUnit)]
            ],
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 1) {
                    if (data.cell.text[0] === 'No registrado') {
                        data.cell.styles.textColor = [197, 48, 48]; // Red warnings
                        data.cell.styles.fontStyle = 'bold';
                    } else if (data.row.index === 3) {
                        data.cell.styles.textColor = [43, 108, 176]; // Blue for next oil change
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });
        
        // Footer (Bottom of page)
        const totalPages = 1;
        const pageHeight = 297;
        doc.setFontSize(8);
        doc.setTextColor(160, 174, 192);
        doc.text("Página 1 de 1", pageWidth - marginX, pageHeight - 10, { align: 'right' });
        doc.text("Sistema de Control y Gestión de Flota - Industrias Garend S.A.", marginX, pageHeight - 10);
        
        doc.save(`ficha_vehiculo_${vehicle.plate}.pdf`);
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => {
                        router.push('/dashboard/fleet');
                    }} size="icon">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <Dialog open={photoModalOpen} onOpenChange={setPhotoModalOpen}>
                        <DialogTrigger asChild>
                            <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 overflow-hidden border cursor-pointer hover:opacity-85 transition-opacity">
                                {vehicle.photoUrl ? (
                                    <Image 
                                        src={`/api/fleet/files/${vehicle.photoUrl}`} 
                                        className="w-full h-full object-cover" 
                                        alt="Vehículo" 
                                        width={64} 
                                        height={64} 
                                        unoptimized
                                    />
                                ) : (
                                    <Truck className="w-8 h-8" />
                                )}
                            </div>
                        </DialogTrigger>
                        {vehicle.photoUrl && (
                            <DialogContent className="max-w-3xl p-0 overflow-hidden bg-transparent border-none [&>button]:text-white [&>button]:bg-white/20 hover:[&>button]:bg-white/30 [&>button]:rounded-full [&>button]:w-8 [&>button]:h-8 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:transition-all [&>button]:right-6 [&>button]:top-6 [&>button_svg]:w-4 [&>button_svg]:h-4">
                                <DialogTitle className="sr-only">Foto del Vehículo {vehicle.plate}</DialogTitle>
                                <div className="relative aspect-video w-full max-h-[80vh] flex items-center justify-center bg-black/40 backdrop-blur-md rounded-2xl overflow-hidden p-2 border border-slate-700/30">
                                    <Image 
                                        src={`/api/fleet/files/${vehicle.photoUrl}`} 
                                        className="max-w-full max-h-full object-contain rounded-lg" 
                                        alt="Foto del Vehículo" 
                                        width={1200} 
                                        height={800} 
                                        unoptimized
                                    />
                                </div>
                            </DialogContent>
                        )}
                    </Dialog>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl md:text-3xl font-bold truncate">{vehicle.plate}</h1>
                            <Badge className={vehicle.status === 'active' ? 'bg-green-500' : 'bg-amber-500'}>
                                {vehicle.status === 'active' ? 'Activo' : 'Taller'}
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground font-medium truncate">{vehicle.brand} {vehicle.model} • {vehicle.fuelType}</p>
                    </div>
                </div>
                {/* Desktop Action Buttons */}
                <div className="hidden sm:flex items-center gap-2 mt-4 md:mt-0">
                    <Button variant="outline" onClick={exportVehicleSheetPDF} className="gap-2">
                        <FileText className="w-4 h-4" /> Exportar Ficha
                    </Button>
                    <Button variant="outline" onClick={() => router.push(`/dashboard/fleet/vehicles/${vehicle.id}/edit`)}>
                        Editar Ficha
                    </Button>
                    {hasPermission('fleet:vehicles:delete') && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="gap-2">
                                    <Trash2 className="w-4 h-4" /> Eliminar
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción no se puede deshacer. Esto eliminará permanentemente el activo, 
                                        su historial de mantenimientos y repostajes de la base de datos.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction 
                                        onClick={handleDeleteVehicle} 
                                        className="bg-red-600 hover:bg-red-700"
                                        disabled={isDeleting}
                                    >
                                        {isDeleting ? 'Eliminando...' : 'Sí, Eliminar Activo'}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>

                {/* Mobile Action Dropdown & Quick Menu */}
                <div className="flex sm:hidden items-center gap-2 w-full mt-4">
                    <Button variant="outline" onClick={exportVehicleSheetPDF} className="flex-1 gap-2 h-10 text-xs font-semibold">
                        <FileText className="w-4 h-4" /> Exportar Ficha
                    </Button>
                    
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-10 px-3 bg-slate-50 border-slate-200">
                                <MoreVertical className="w-5 h-5 text-slate-600" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 p-1.5 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-slate-200/50">
                            <DropdownMenuLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-1">Acciones del Activo</DropdownMenuLabel>
                            <DropdownMenuSeparator className="my-1" />
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/fleet/vehicles/${vehicle.id}/edit`)} className="rounded-lg py-2 px-2.5 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer">
                                <Wrench className="w-4 h-4 mr-2 text-slate-500" /> Editar Ficha
                            </DropdownMenuItem>
                            {hasPermission('fleet:vehicles:delete') && (
                                <>
                                    <DropdownMenuSeparator className="my-1" />
                                    <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="rounded-lg py-2 px-2.5 text-red-600 font-medium focus:text-red-705 focus:bg-red-50 hover:bg-red-50 cursor-pointer">
                                        <Trash2 className="w-4 h-4 mr-2 text-red-500" /> Eliminar Activo
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Mobile Delete Dialog */}
                    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                        <AlertDialogContent className="rounded-2xl max-w-[90vw]">
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción no se puede deshacer. Esto eliminará permanentemente el activo, 
                                    su historial de mantenimientos y repostajes de la base de datos.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex flex-col gap-2 mt-4">
                                <AlertDialogCancel disabled={isDeleting} className="w-full rounded-xl">Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                    onClick={handleDeleteVehicle} 
                                    className="bg-red-600 hover:bg-red-700 w-full rounded-xl"
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? 'Eliminando...' : 'Sí, Eliminar Activo'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-none shadow-sm bg-blue-50/50">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                            <Gauge className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-bold">Odómetro Actual</p>
                            <p className="text-lg font-bold">{vehicle.currentMileage.toLocaleString()} {vehicle.odometerUnit || 'km'}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className={`border-none shadow-sm ${isOilChangeUrgent ? 'bg-amber-50' : 'bg-green-50/50'}`}>
                    <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground uppercase font-bold">Mantenimiento</p>
                            <Badge variant={isOilChangeUrgent ? 'destructive' : 'secondary'} className="text-[10px]">
                                {oilChangeProgress.toFixed(0)}%
                            </Badge>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                            <div 
                                className={`h-1.5 rounded-full ${isOilChangeUrgent ? 'bg-amber-500' : 'bg-green-500'}`} 
                                style={{ width: `${oilChangeProgress}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground">Sig: {formatOdometer(vehicle.lastOilChangeMileage + vehicle.oilChangeInterval, vehicle.odometerUnit, false)}</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-indigo-50/50">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-bold">Próximo RTV</p>
                            <p className="text-lg font-bold">{vehicle.rtvExpiration ? format(parseISO(vehicle.rtvExpiration), 'dd/MM/yyyy') : 'N/A'}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-emerald-50/50">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-bold">Rendimiento Prom.</p>
                            <p className="text-lg font-bold">{avgEfficiency.toFixed(2)} <span className="text-xs font-normal">{efficiencyUnit}</span></p>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                {/* Desktop Tabs Header List */}
                <div className="hidden md:flex justify-between items-center pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 gap-4">
                    <TabsList className="inline-flex w-max justify-start gap-1 p-1 bg-slate-100/80 backdrop-blur rounded-xl border border-slate-200/50">
                        <TabsTrigger value="history" className="px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200 data-[state=active]:bg-white data-[state=active]:shadow-sm">Historial Log</TabsTrigger>
                        <TabsTrigger value="tech" className="px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200 data-[state=active]:bg-white data-[state=active]:shadow-sm">Ficha Técnica</TabsTrigger>
                        <TabsTrigger value="fuel" className="px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200 data-[state=active]:bg-white data-[state=active]:shadow-sm">Repostaje</TabsTrigger>
                        <TabsTrigger value="maintenance" className="px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200 data-[state=active]:bg-white data-[state=active]:shadow-sm">Mantenimiento</TabsTrigger>
                        <TabsTrigger value="permits" className="px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200 data-[state=active]:bg-white data-[state=active]:shadow-sm">Permisos</TabsTrigger>
                        <TabsTrigger value="preventative" className="px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all duration-200 data-[state=active]:bg-white data-[state=active]:shadow-sm">Planes Preventivos</TabsTrigger>
                    </TabsList>
                    
                    {/* Soft-Delete Toggle Checkbox */}
                    <div className="flex items-center gap-2 border border-slate-200 bg-slate-50/50 backdrop-blur px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm h-10 shrink-0">
                        <input
                            type="checkbox"
                            id="toggle-deleted"
                            checked={showDeleted}
                            onChange={(e) => setShowDeleted(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        />
                        <label htmlFor="toggle-deleted" className="text-slate-700 cursor-pointer flex items-center gap-1.5">
                            Mostrar eliminados
                            {deletedLogs.length > 0 && (
                                <Badge className="bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-[9px] px-1.5 py-0 h-4 border-none animate-pulse">
                                    {deletedLogs.length}
                                </Badge>
                            )}
                        </label>
                    </div>
                </div>

                {/* Mobile Show Deleted Toggle */}
                <div className="flex md:hidden items-center justify-between border border-slate-200 bg-slate-50/50 p-3 rounded-2xl text-xs font-bold shadow-sm mb-3">
                    <span className="text-slate-700 flex items-center gap-1.5">
                        Mostrar elementos eliminados
                        {deletedLogs.length > 0 && (
                            <Badge className="bg-rose-500 text-white font-extrabold text-[9px] px-1.5 py-0 h-4 border-none">
                                {deletedLogs.length}
                            </Badge>
                        )}
                    </span>
                    <input
                        type="checkbox"
                        checked={showDeleted}
                        onChange={(e) => setShowDeleted(e.target.checked)}
                        className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                    />
                </div>

                {/* Mobile Vertical Menu (Stacked Cards) */}
                <div className="flex flex-col gap-3 md:hidden">
                    <Button 
                        variant="outline" 
                        type="button"
                        onClick={() => { setActiveTab('history'); setMobileSheetOpen(true); }}
                        className="w-full justify-between h-14 rounded-2xl bg-white border-slate-200/80 shadow-sm px-4 hover:bg-slate-50 transition-all text-sm font-semibold"
                    >
                        <span className="flex items-center gap-3 text-slate-700">
                            <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600">📋</span>
                            Historial Log
                        </span>
                        <span className="text-slate-400 font-normal">➔</span>
                    </Button>

                    <Button 
                        variant="outline" 
                        type="button"
                        onClick={() => { setActiveTab('tech'); setMobileSheetOpen(true); }}
                        className="w-full justify-between h-14 rounded-2xl bg-white border-slate-200/80 shadow-sm px-4 hover:bg-slate-50 transition-all text-sm font-semibold"
                    >
                        <span className="flex items-center gap-3 text-slate-700">
                            <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">🚗</span>
                            Ficha Técnica
                        </span>
                        <span className="text-slate-400 font-normal">➔</span>
                    </Button>

                    <Button 
                        variant="outline" 
                        type="button"
                        onClick={() => { setActiveTab('fuel'); setMobileSheetOpen(true); }}
                        className="w-full justify-between h-14 rounded-2xl bg-white border-slate-200/80 shadow-sm px-4 hover:bg-slate-50 transition-all text-sm font-semibold"
                    >
                        <span className="flex items-center gap-3 text-slate-700">
                            <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">⛽</span>
                            Repostaje
                        </span>
                        <span className="text-slate-400 font-normal">➔</span>
                    </Button>

                    <Button 
                        variant="outline" 
                        type="button"
                        onClick={() => { setActiveTab('maintenance'); setMobileSheetOpen(true); }}
                        className="w-full justify-between h-14 rounded-2xl bg-white border-slate-200/80 shadow-sm px-4 hover:bg-slate-50 transition-all text-sm font-semibold"
                    >
                        <span className="flex items-center gap-3 text-slate-700">
                            <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-amber-50 text-amber-600">🔧</span>
                            Mantenimiento
                        </span>
                        <span className="text-slate-400 font-normal">➔</span>
                    </Button>

                    <Button 
                        variant="outline" 
                        type="button"
                        onClick={() => { setActiveTab('permits'); setMobileSheetOpen(true); }}
                        className="w-full justify-between h-14 rounded-2xl bg-white border-slate-200/80 shadow-sm px-4 hover:bg-slate-50 transition-all text-sm font-semibold"
                    >
                        <span className="flex items-center gap-3 text-slate-700">
                            <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-purple-50 text-purple-600">📄</span>
                            Permisos y Seguros
                        </span>
                        <span className="text-slate-400 font-normal">➔</span>
                    </Button>

                    <Button 
                        variant="outline" 
                        type="button"
                        onClick={() => { setActiveTab('preventative'); setMobileSheetOpen(true); }}
                        className="w-full justify-between h-14 rounded-2xl bg-white border-slate-200/80 shadow-sm px-4 hover:bg-slate-50 transition-all text-sm font-semibold"
                    >
                        <span className="flex items-center gap-3 text-slate-700">
                            <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-rose-50 text-rose-600">🛡️</span>
                            Planes Preventivos
                        </span>
                        <span className="text-slate-400 font-normal">➔</span>
                    </Button>
                </div>

                {/* Tabs render content wrapper */}
                {(() => {
                    const renderTabsContent = () => (
                        <>
                            {/* Technical Sheet View */}
                            <TabsContent value="tech" className="pt-4 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="border-none shadow-sm">
                            <CardHeader className="bg-slate-50 py-3">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <Truck className="w-4 h-4 text-blue-600" /> Identificación y General
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-y-4 pt-4 text-sm">
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Marca / Modelo</p><p className="font-bold">{vehicle.brand} {vehicle.model}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Año</p><p className="font-bold">{vehicle.year}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Placa</p><p className="font-bold">{vehicle.plate}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Color</p><p className="font-bold">{vehicle.color || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Sede</p><p className="font-bold">{vehicle.branchId || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Número Serie</p><p className="font-bold truncate">{vehicle.serialNumber || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">VIN</p><p className="font-bold truncate">{vehicle.vin || 'N/A'}</p></div>
                                <div className="col-span-2"><p className="text-muted-foreground text-xs uppercase font-semibold">Chasis</p><p className="font-bold">{vehicle.chassisNumber || 'N/A'}</p></div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm">
                            <CardHeader className="bg-slate-50 py-3">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-emerald-600" /> Especificaciones
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-y-4 pt-4 text-sm">
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Carrocería</p><p className="font-bold">{vehicle.bodyType || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Tracción</p><p className="font-bold">{vehicle.traction || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Capacidad</p><p className="font-bold">{vehicle.capacity} Personas</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Combustible</p><p className="font-bold">{vehicle.fuelType}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Carga Máxima</p><p className="font-bold">{vehicle.loadCapacity || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Ejes</p><p className="font-bold">{vehicle.axes}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Procedencia</p><p className="font-bold">{vehicle.origin || 'N/A'}</p></div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm">
                            <CardHeader className="bg-slate-50 py-3">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-amber-600" /> Detalles del Motor
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-y-4 pt-4 text-sm">
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Número Motor</p><p className="font-bold">{vehicle.engineNumber || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Marca Motor</p><p className="font-bold">{vehicle.engineBrand || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Serie Motor</p><p className="font-bold">{vehicle.engineSerial || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Cilindrada</p><p className="font-bold">{vehicle.engineDisplacement || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Cilindros</p><p className="font-bold">{vehicle.engineCylinders || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground text-xs uppercase font-semibold">Potencia</p><p className="font-bold">{vehicle.enginePower || 'N/A'}</p></div>
                                <div className="col-span-2"><p className="text-muted-foreground text-xs uppercase font-semibold">Fabricante</p><p className="font-bold">{vehicle.engineManufacturer || 'N/A'}</p></div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm">
                            <CardHeader className="bg-slate-50 py-3">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <User className="w-4 h-4 text-indigo-600" /> Información de Propiedad
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground text-xs uppercase font-semibold">Propietario Registrado</p>
                                    <p className="font-bold text-base">{vehicle.ownerName || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs uppercase font-semibold">Identificación / Cédula</p>
                                    <p className="font-bold">{vehicle.ownerId || 'N/A'}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* History View */}
                <TabsContent value="history" className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Fuel className="w-4 h-4 text-emerald-500" /> Últimos Repostajes
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {paginatedFuelLogs.map((log) => {
                                        const parsed = parseLogPhoto(log.notes);
                                        return (
                                            <div key={log.id || log.archiveId} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3 transition-all ${
                                                log.isDeleted 
                                                    ? 'bg-rose-50/60 dark:bg-rose-950/10 border-rose-200 text-rose-950 border-l-4 border-l-rose-500 animate-in fade-in duration-300' 
                                                    : 'bg-muted/40 border-slate-200'
                                            }`}>
                                                <div className="space-y-1 flex-1">
                                                    <div className="font-bold flex items-center gap-2 text-sm sm:text-base">
                                                        {log.liters.toFixed(2)} L 
                                                        <span className="text-[10px] sm:text-xs font-normal text-muted-foreground whitespace-nowrap">at {log.mileageBefore.toLocaleString()} {vehicle.odometerUnit || 'km'}</span>
                                                    </div>
                                                    <div className="text-[10px] sm:text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                                                         <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(log.date).toLocaleDateString()}</span>
                                                         {log.isDeleted ? (
                                                             <Badge className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-extrabold text-[9px] px-1.5 py-0.5 border-none">
                                                                 🗑️ Eliminado por: {log.deletedBy} el {new Date(log.deletedAt).toLocaleDateString()}
                                                             </Badge>
                                                         ) : (
                                                             <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200/50">Registrado por: {log.createdBy || 'Sistema'}</span>
                                                         )}
                                                     </div>
                                                    {parsed.cleanText && (
                                                        <div className="text-[10px] sm:text-xs text-muted-foreground bg-slate-100/60 dark:bg-slate-800/40 px-2 py-1 rounded border border-dashed mt-1 max-w-md">
                                                            <strong>Notas:</strong> {parsed.cleanText}
                                                        </div>
                                                    )}
                                                    {parsed.photoFilename && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            className="h-7 px-2 text-[10px] sm:text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 flex items-center gap-1 mt-1 shrink-0 w-fit"
                                                            onClick={() => setSelectedPhoto(parsed.photoFilename)}
                                                        >
                                                            <Camera className="w-3.5 h-3.5" /> Ver Ticket
                                                        </Button>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0">
                                                    <div className="text-right">
                                                        <div className="text-sm font-bold text-emerald-700">CRC {log.cost?.toLocaleString()}</div>
                                                        <div className="text-[10px] text-muted-foreground">ID: {log.driverId || 'N/A'}</div>
                                                    </div>
                                                    {log.isDeleted ? (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-8 text-xs font-black text-emerald-600 border-emerald-250 hover:bg-emerald-50 bg-emerald-50/10 flex items-center gap-1 shrink-0 rounded-lg shadow-sm"
                                                            onClick={() => handleRestoreLog(log.archiveId)}
                                                            disabled={loading}
                                                        >
                                                            <Clock className="w-3.5 h-3.5 rotate-180" />
                                                            Restaurar
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            {hasPermission('fleet:fuel:delete') && (
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-muted-foreground hover:text-red-650 rounded-full shrink-0 transition-colors" 
                                                                    onClick={() => handleDeleteFuelLog(log.id)}
                                                                    disabled={loading}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => exportFuelLogPDF(log)}>
                                                                <FileText className="h-4 w-4 text-emerald-600" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {displayedFuelLogs.length === 0 && <p className="text-center py-10 text-muted-foreground italic">No hay registros de combustible.</p>}
                                    {displayedFuelLogs.length > ITEMS_PER_PAGE && (
                                         <div className="flex items-center justify-between pt-4 border-t border-dashed">
                                             <Button 
                                                 variant="outline" 
                                                 size="sm" 
                                                 onClick={() => setFuelPage(prev => Math.max(1, prev - 1))}
                                                 disabled={fuelPage === 1}
                                                 className="text-xs h-8"
                                             >
                                                 Anterior
                                             </Button>
                                             <span className="text-xs text-muted-foreground font-semibold">
                                                 Pág. {fuelPage} de {Math.ceil(displayedFuelLogs.length / ITEMS_PER_PAGE)}
                                             </span>
                                             <Button 
                                                 variant="outline" 
                                                 size="sm" 
                                                 onClick={() => setFuelPage(prev => Math.min(Math.ceil(displayedFuelLogs.length / ITEMS_PER_PAGE), prev + 1))}
                                                 disabled={fuelPage === Math.ceil(displayedFuelLogs.length / ITEMS_PER_PAGE)}
                                                 className="text-xs h-8"
                                             >
                                                 Siguiente
                                             </Button>
                                         </div>
                                     )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Wrench className="w-4 h-4 text-blue-500" /> Últimos Mantenimientos
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                     {paginatedMaintLogs.map((log) => {
                                        const parsed = parseLogPhoto(log.description);
                                        return (
                                            <div key={log.id || log.archiveId} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3 transition-all ${
                                                log.isDeleted 
                                                    ? 'bg-rose-50/60 dark:bg-rose-950/10 border-rose-200 text-rose-950 border-l-4 border-l-rose-500 animate-in fade-in duration-300' 
                                                    : 'bg-muted/40 border border-l-4 border-l-blue-400 border-slate-200'
                                            }`}>
                                                <div className="space-y-1 flex-1">
                                                    <div className="font-bold text-blue-800 text-sm sm:text-base">{log.type}</div>
                                                    {parsed.cleanText && <div className="text-[10px] sm:text-xs font-medium line-clamp-2">{parsed.cleanText}</div>}
                                                    <div className="text-[9px] sm:text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                                                         <span>{new Date(log.date).toLocaleDateString()} • {log.mileage.toLocaleString()} {vehicle.odometerUnit || 'km'}</span>
                                                         {log.isDeleted ? (
                                                             <Badge className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-extrabold text-[9px] px-1.5 py-0.5 border-none">
                                                                 🗑️ Eliminado por: {log.deletedBy} el {new Date(log.deletedAt).toLocaleDateString()}
                                                             </Badge>
                                                         ) : (
                                                             <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200/50">Registrado por: {log.createdBy || 'Sistema'}</span>
                                                         )}
                                                     </div>
                                                    {parsed.photoFilename && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            className="h-7 px-2 text-[10px] sm:text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 flex items-center gap-1 mt-1 shrink-0 w-fit"
                                                            onClick={() => setSelectedPhoto(parsed.photoFilename)}
                                                        >
                                                            <Camera className="w-3.5 h-3.5" /> Ver Comprobante
                                                        </Button>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0">
                                                    <div className="text-right">
                                                        <div className="text-sm font-bold">CRC {log.cost?.toLocaleString()}</div>
                                                        <div className="text-[10px] text-muted-foreground truncate max-w-[100px]">{log.performedBy}</div>
                                                    </div>
                                                    {log.isDeleted ? (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-8 text-xs font-black text-emerald-600 border-emerald-250 hover:bg-emerald-50 bg-emerald-50/10 flex items-center gap-1 shrink-0 rounded-lg shadow-sm"
                                                            onClick={() => handleRestoreLog(log.archiveId)}
                                                            disabled={loading}
                                                        >
                                                            <Clock className="w-3.5 h-3.5 rotate-180" />
                                                            Restaurar
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            {hasPermission('fleet:maintenance:delete') && (
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-muted-foreground hover:text-red-650 rounded-full shrink-0 transition-colors" 
                                                                    onClick={() => handleDeleteMaintenanceLog(log.id)}
                                                                    disabled={loading}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => exportMaintenanceLogPDF(log)}>
                                                                <FileText className="h-4 w-4 text-blue-600" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {displayedMaintLogs.length === 0 && <p className="text-center py-10 text-muted-foreground italic">No hay registros de mantenimiento.</p>}
                                    {displayedMaintLogs.length > ITEMS_PER_PAGE && (
                                         <div className="flex items-center justify-between pt-4 border-t border-dashed">
                                             <Button 
                                                 variant="outline" 
                                                 size="sm" 
                                                 onClick={() => setMaintPage(prev => Math.max(1, prev - 1))}
                                                 disabled={maintPage === 1}
                                                 className="text-xs h-8"
                                             >
                                                 Anterior
                                             </Button>
                                             <span className="text-xs text-muted-foreground font-semibold">
                                                 Pág. {maintPage} de {Math.ceil(displayedMaintLogs.length / ITEMS_PER_PAGE)}
                                             </span>
                                             <Button 
                                                 variant="outline" 
                                                 size="sm" 
                                                 onClick={() => setMaintPage(prev => Math.min(Math.ceil(displayedMaintLogs.length / ITEMS_PER_PAGE), prev + 1))}
                                                 disabled={maintPage === Math.ceil(displayedMaintLogs.length / ITEMS_PER_PAGE)}
                                                 className="text-xs h-8"
                                             >
                                                 Siguiente
                                             </Button>
                                         </div>
                                     )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Dedicated Permanent Telegram Bot Logs Card (Full Width) */}
                        <Card className="lg:col-span-2 border-t-4 border-t-[#0088cc] shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center gap-2 text-[#0088cc]">
                                    <MessageSquare className="w-5 h-5" /> Historial de Registros vía Bot Telegram
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Registros permanentes realizados por los usuarios desde el asistente de Telegram.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {botLogsLoading ? (
                                    <div className="flex items-center justify-center py-10">
                                        <Loader2 className="w-6 h-6 animate-spin text-[#0088cc]" />
                                        <span className="ml-2 text-sm text-muted-foreground">Cargando registros...</span>
                                    </div>
                                ) : (
                                    <div className="space-y-4 mt-2">
                                        {paginatedBotLogs.map((log) => {
                                            let actionEmoji = '🤖';
                                            let actionColor = 'bg-slate-100 text-slate-700 border-slate-200';
                                            if (log.actionType === 'fuel') {
                                                actionEmoji = '⛽';
                                                actionColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                            } else if (log.actionType === 'maintenance') {
                                                actionEmoji = '🔧';
                                                actionColor = 'bg-blue-50 text-blue-700 border-blue-200';
                                            } else if (log.actionType === 'rtv') {
                                                actionEmoji = '🚙';
                                                actionColor = 'bg-purple-50 text-purple-700 border-purple-200';
                                            }

                                            return (
                                                <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 gap-3 hover:bg-slate-50 transition-colors duration-150">
                                                    <div className="space-y-1 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Badge variant="outline" className={`${actionColor} font-bold rounded-lg px-2 py-0.5 text-xs`}>
                                                                {actionEmoji} {log.actionType === 'fuel' ? 'Repostaje' : log.actionType === 'maintenance' ? 'Mantenimiento' : log.actionType === 'rtv' ? 'Renovación RTV' : 'Otro'}
                                                            </Badge>
                                                            <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                                {format(parseISO(log.timestamp), 'dd/MM/yyyy HH:mm', { locale: es })}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1.5 leading-relaxed">
                                                            {log.message}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 shrink-0">
                                                        <div className="text-right">
                                                            <span className="text-[10px] bg-sky-50 text-sky-800 border border-sky-100 px-2 py-0.5 rounded-lg font-bold">
                                                                Usuario: {log.driverName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {botLogs.length === 0 && (
                                            <p className="text-center py-12 text-muted-foreground italic text-sm">
                                                No hay registros permanentes de Telegram para este vehículo.
                                            </p>
                                        )}
                                        {botLogs.length > ITEMS_PER_PAGE && (
                                            <div className="flex items-center justify-between pt-4 border-t border-dashed border-slate-200">
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => setBotPage(prev => Math.max(1, prev - 1))}
                                                    disabled={botPage === 1}
                                                    className="text-xs h-8"
                                                >
                                                    Anterior
                                                </Button>
                                                <span className="text-xs text-muted-foreground font-semibold">
                                                    Pág. {botPage} de {Math.ceil(botLogs.length / ITEMS_PER_PAGE)}
                                                </span>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => setBotPage(prev => Math.min(Math.ceil(botLogs.length / ITEMS_PER_PAGE), prev + 1))}
                                                    disabled={botPage === Math.ceil(botLogs.length / ITEMS_PER_PAGE)}
                                                    className="text-xs h-8"
                                                >
                                                    Siguiente
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Fuel Entry Form */}
                <TabsContent value="fuel" className="pt-4">
                    <Card className="max-w-2xl mx-auto border-emerald-200">
                        <CardHeader className="bg-emerald-50">
                            <CardTitle className="text-emerald-700 flex items-center gap-2">
                                <Plus className="w-5 h-5" /> Registrar Repostaje
                            </CardTitle>
                            <CardDescription>Ingrese los datos de la carga de combustible actual.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <form ref={fuelFormRef} action={handleFuelSubmit} encType="multipart/form-data" className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Fecha</Label>
                                    <Input type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>Odómetro Actual</Label>
                                    <Input type="number" step="0.1" name="mileageBefore" defaultValue={vehicle.currentMileage} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>Litros Cargados</Label>
                                    <Input type="number" step="0.01" name="liters" placeholder="0.00" required onChange={(e) => setLiters(parseFloat(e.target.value) || 0)} />
                                </div>
                                <div className="space-y-2">

                                {/* Selector de tipo de combustible */}
                                <div className="space-y-2">
                                    <Label>Tipo de Combustible</Label>
                                    <Select name="fuelTypeId" value={selectedFuelId} onValueChange={(value) => {
                                        const fuel = catalogs.settings?.find((f:any) => f.id === Number(value));
                                        setSelectedFuelId(value);
                                        setSelectedFuelPrice(fuel?.price ?? 0);
                                    }}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar combustible" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {catalogs.settings?.filter((f:any) => f.category === 'fuel_type').map((f:any) => (
                                                <SelectItem key={f.id} value={f.id.toString()}>{f.value} - CRC {f.price}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {/* Costo Total */}
                                <Label>Costo Total</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">CRC</span>
                                    <Input type="number" name="cost" className="pl-12" placeholder="0.00" value={cost} readOnly />
                                </div>
                                </div>
                                {/* Conductor - puede deshabilitarse vía configuración admin */}
                                {(!catalogs.settings?.some((s:any) => s.category==='driver_requirement' && s.value==='enabled')) && (
                                    <>
                                        <Label>Conductor</Label>
                                        <Select name="driverId">
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar conductor" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {catalogs.drivers.map((d:any) => (
                                                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </>
                                )}

                                <div className="space-y-2 md:col-span-2">
                                    <Label>Notas</Label>
                                    <Input name="notes" placeholder="Ej: Full tanque, Estación X..." />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="fuel-photo">Comprobante / Foto del Repostaje (Opcional)</Label>
                                    <Input id="fuel-photo" type="file" name="photo" accept="image/*" className="cursor-pointer file:text-emerald-700 file:font-semibold" />
                                </div>

                                <Button type="submit" disabled={fuelLoading} className="md:col-span-2 bg-emerald-600 hover:bg-emerald-700">
                                    {fuelLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Registrando...
                                        </>
                                    ) : 'Registrar Consumo'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Maintenance Entry Form */}
                <TabsContent value="maintenance" className="pt-4">
                    <Card className="max-w-2xl mx-auto border-blue-200">
                        <CardHeader className="bg-blue-50">
                            <CardTitle className="text-blue-700 flex items-center gap-2">
                                <Plus className="w-5 h-5" /> Registrar Mantenimiento
                            </CardTitle>
                            <CardDescription>Historial de servicios y cambios de piezas.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <form ref={maintenanceFormRef} action={handleMaintenanceSubmit} encType="multipart/form-data" className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Fecha</Label>
                                    <Input type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>Odómetro al momento</Label>
                                    <Input type="number" step="0.1" name="mileage" defaultValue={vehicle.currentMileage} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tipo de Mantenimiento</Label>
                                    <Select name="type" value={maintType} onValueChange={setMaintType} required>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {catalogs.settings.filter((s:any) => s.category === 'maintenance_type').map((s: any) => (
                                                <SelectItem key={s.id} value={s.value}>{s.value}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Costo</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">CRC</span>
                                        <Input type="number" name="cost" className="pl-12" placeholder="0.00" />
                                    </div>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Descripción / Repuestos cambiados</Label>
                                    <Input name="description" placeholder="Ej: Cambio de aceite 15w40, filtro de aire..." required />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Realizado por (Taller / Persona)</Label>
                                    <Input name="performedBy" placeholder="Ej: Taller Central, Mecánico Juan..." />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="maint-photo">Comprobante / Foto del Mantenimiento (Opcional)</Label>
                                    <Input id="maint-photo" type="file" name="photo" accept="image/*" className="cursor-pointer file:text-blue-700 file:font-semibold" />
                                </div>

                                <Button type="submit" disabled={maintLoading} className="md:col-span-2 bg-blue-600 hover:bg-blue-700">
                                    {maintLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Registrando...
                                        </>
                                    ) : 'Registrar Mantenimiento'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Permits Tab */}
                <TabsContent value="permits" className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Card className="border-l-4 border-l-purple-500 relative hover:shadow-md transition-all duration-200">
                            <Dialog open={rtvDialogOpen} onOpenChange={setRtvDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 text-muted-foreground hover:text-blue-600 absolute top-2 right-2 rounded-full transition-colors"
                                        onClick={() => setRtvDateValue(vehicle.rtvExpiration || '')}
                                    >
                                        <Clock className="h-4 w-4" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                                    <form onSubmit={handleUpdateRtv} className="space-y-4">
                                        <DialogHeader>
                                            <DialogTitle className="text-lg font-bold">Actualizar Vencimiento RTV</DialogTitle>
                                            <DialogDescription>
                                                Configure la fecha de la Revisión Técnica Vehicular.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-2">
                                            <Label htmlFor="rtvExpiration">Fecha de Vencimiento</Label>
                                            <Input 
                                                id="rtvExpiration" 
                                                type="date" 
                                                value={rtvDateValue} 
                                                onChange={(e) => setRtvDateValue(e.target.value)} 
                                            />
                                        </div>
                                        <div className="flex justify-end gap-2 pt-2">
                                            <Button type="button" variant="outline" onClick={() => setRtvDialogOpen(false)} disabled={rtvLoading}>
                                                Cancelar
                                            </Button>
                                            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={rtvLoading}>
                                                {rtvLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                                Guardar
                                            </Button>
                                        </div>
                                    </form>
                                </DialogContent>
                            </Dialog>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">RTV (Revisión Técnica)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {vehicle.rtvExpiration ? format(parseISO(vehicle.rtvExpiration), 'dd/MM/yyyy') : 'No registrada'}
                                </div>
                                {vehicle.rtvExpiration && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Vence {new Date(vehicle.rtvExpiration) < new Date() ? 'HACE' : 'EN'} {Math.abs(Math.floor((new Date(vehicle.rtvExpiration).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))} días
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                        
                        {displayedPermits.map(permit => {
                            const expDate = new Date(permit.expirationDate);
                            const isExpired = expDate < new Date();
                            const daysDiff = Math.floor((expDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                            
                            let statusText = "Vigente";
                            let statusClass = "text-green-600 font-semibold bg-green-50 border-green-200";
                            let borderClass = permit.isDeleted ? "border-l-rose-500" : "border-l-green-500";
                            let showWarningIcon = false;

                            if (permit.isDeleted) {
                                statusText = `Eliminado por ${permit.deletedBy}`;
                                statusClass = "text-rose-600 font-semibold bg-rose-50 border-rose-200";
                            } else if (isExpired) {
                                statusText = `Vencido hace ${Math.abs(daysDiff)} días`;
                                statusClass = "text-red-600 font-semibold bg-red-50 border-red-200";
                                borderClass = "border-l-red-500";
                                showWarningIcon = true;
                            } else if (daysDiff < 30) {
                                statusText = `Próximo a vencer en ${daysDiff} días`;
                                statusClass = "text-amber-600 font-semibold bg-amber-50 border-amber-200";
                                borderClass = "border-l-amber-500";
                                showWarningIcon = true;
                            }

                            return (
                                <Card key={permit.id || permit.archiveId} className={`border-l-4 ${borderClass} relative hover:shadow-md transition-all duration-200 ${
                                    permit.isDeleted ? 'bg-rose-50/60 dark:bg-rose-950/10 border-rose-200 animate-in fade-in duration-300' : ''
                                }`}>
                                    {permit.isDeleted ? (
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-8 text-xs font-black text-emerald-600 border-emerald-200 hover:bg-emerald-50 bg-emerald-50/10 flex items-center gap-1 absolute top-2 right-2 rounded-lg shadow-sm"
                                            onClick={() => handleRestoreLog(permit.archiveId)}
                                            disabled={loading}
                                        >
                                            <Clock className="w-3.5 h-3.5 rotate-180" />
                                            Restaurar
                                        </Button>
                                    ) : (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 text-muted-foreground hover:text-red-650 absolute top-2 right-2 rounded-full transition-colors"
                                            onClick={() => handleDeletePermit(permit.id)}
                                            disabled={loading}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <CardHeader className="pb-2 pr-10">
                                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{permit.type}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{expDate.toLocaleDateString()}</div>
                                        {permit.amount !== undefined && permit.amount !== null && (
                                            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
                                                <span>💵 Costo:</span>
                                                <span className="font-bold">CRC {Number(permit.amount).toLocaleString('es-CR')}</span>
                                            </div>
                                        )}
                                        <div className="mt-2">
                                            <Badge variant="outline" className={`text-xs px-2.5 py-0.5 rounded-full ${statusClass}`}>
                                                {permit.isDeleted ? (
                                                    <Trash2 className="w-3 h-3 mr-1" />
                                                ) : showWarningIcon ? (
                                                    <AlertCircle className="w-3 h-3 mr-1" />
                                                ) : (
                                                    <CheckCircle className="w-3 h-3 mr-1" />
                                                )}
                                                {statusText}
                                            </Badge>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}

                        <Dialog open={permitDialogOpen} onOpenChange={setPermitDialogOpen}>
                            <DialogTrigger asChild>
                                <Card className="border-dashed flex items-center justify-center p-6 bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors">
                                    <div className="text-center space-y-2">
                                        <Plus className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                                        <p className="text-sm font-medium text-muted-foreground">Gestionar otros permisos</p>
                                    </div>
                                </Card>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Registrar Nuevo Permiso</DialogTitle>
                                    <DialogDescription>
                                        Ingrese los detalles del permiso o seguro del vehículo.
                                    </DialogDescription>
                                </DialogHeader>
                                <form action={handlePermitSubmit} className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label>Tipo de Permiso</Label>
                                        <Select name="type" required>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar tipo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {catalogs.settings.filter((s:any) => s.category === 'permit_type').map((s:any) => (
                                                    <SelectItem key={s.id} value={s.value}>{s.value}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Fecha de Vencimiento</Label>
                                        <Input type="date" name="expirationDate" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="permitAmount">Costo / Valor (Opcional)</Label>
                                        <Input 
                                            type="number" 
                                            id="permitAmount"
                                            name="amount" 
                                            placeholder="ej: 15000"
                                            step="any"
                                            min="0"
                                            className="text-xs h-9"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button type="button" variant="ghost" onClick={() => setPermitDialogOpen(false)}>Cancelar</Button>
                                        <Button type="submit" disabled={permitLoading}>
                                            {permitLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    Guardando...
                                                </>
                                            ) : 'Guardar Permiso'}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </TabsContent>

                {/* Preventative Plans Tab */}
                <TabsContent value="preventative" className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {displayedPreventativePlans.map(plan => {
                            const currentVal = (plan.intervalUnit === 'hours' && vehicle.odometerUnit !== 'hr') ? (vehicle.currentHours || 0) : vehicle.currentMileage;
                            const diff = currentVal - plan.lastPerformedValue;
                            const wearPercent = Math.min(100, Math.max(0, (diff / plan.intervalValue) * 100));
                            const isExpired = diff >= plan.intervalValue;
                            const isNear = diff >= (plan.intervalValue * 0.9);

                            let statusText = "Vigente";
                            let statusClass = "text-green-600 bg-green-50 border-green-200";
                            let progressColor = "bg-green-500";
                            let borderClass = plan.isDeleted ? "border-l-rose-500" : "border-l-green-500";

                            if (plan.isDeleted) {
                                statusText = `Eliminado por ${plan.deletedBy}`;
                                statusClass = "text-rose-600 bg-rose-50 border-rose-200";
                                progressColor = "bg-rose-500";
                            } else if (isExpired) {
                                statusText = "Vencido";
                                statusClass = "text-red-600 bg-red-50 border-red-200 animate-pulse";
                                progressColor = "bg-red-500 animate-pulse";
                                borderClass = "border-l-red-500";
                            } else if (isNear) {
                                statusText = "Próximo a vencer";
                                statusClass = "text-amber-600 bg-amber-50 border-amber-200";
                                progressColor = "bg-amber-500";
                                borderClass = "border-l-amber-500";
                            }

                            return (
                                <Card key={plan.id || plan.archiveId} className={`border-l-4 ${borderClass} relative hover:shadow-md transition-all duration-200 ${
                                    plan.isDeleted ? 'bg-rose-50/60 dark:bg-rose-950/10 border-rose-200 animate-in fade-in duration-300' : ''
                                }`}>
                                    {plan.isDeleted ? (
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-8 text-xs font-black text-emerald-600 border-emerald-250 hover:bg-emerald-50 bg-emerald-50/10 flex items-center gap-1 absolute top-2 right-2 rounded-lg shadow-sm"
                                            onClick={() => handleRestoreLog(plan.archiveId)}
                                            disabled={loading}
                                        >
                                            <Clock className="w-3.5 h-3.5 rotate-180" />
                                            Restaurar
                                        </Button>
                                    ) : (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 text-muted-foreground hover:text-red-650 absolute top-2 right-2 rounded-full transition-colors"
                                            onClick={() => handleDeletePreventativePlan(plan.id)}
                                            disabled={loading}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <CardHeader className="pb-2 pr-10">
                                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{plan.maintenanceType}</CardTitle>
                                        <CardDescription className="text-xs">Intervalo: cada {plan.intervalValue.toLocaleString()} {plan.intervalUnit}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div>
                                            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                                                <span>Uso / Desgaste</span>
                                                <span>{wearPercent.toFixed(0)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2">
                                                <div 
                                                    className={`h-2 rounded-full ${progressColor}`} 
                                                    style={{ width: `${wearPercent}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-xs border-t pt-3">
                                            <div>
                                                <p className="text-muted-foreground">Último Servicio</p>
                                                <p className="font-bold text-slate-800">{plan.lastPerformedValue.toLocaleString()} {plan.intervalUnit}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">Lectura Actual</p>
                                                <p className="font-bold text-slate-800">{currentVal.toLocaleString()} {plan.intervalUnit}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-2 pt-2">
                                            <Badge variant="outline" className={`text-xs px-2.5 py-0.5 rounded-full ${statusClass}`}>
                                                {statusText}
                                            </Badge>
                                            {!plan.isDeleted && (
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => {
                                                        setMaintType(plan.maintenanceType);
                                                        setActiveTab('maintenance');
                                                    }}
                                                    className="text-xs h-7 gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                                                >
                                                    <Wrench className="w-3.5 h-3.5" /> Registrar Servicio
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}

                        <Dialog open={preventativeDialogOpen} onOpenChange={setPreventativeDialogOpen}>
                            <DialogTrigger asChild>
                                <Card className="border-dashed flex items-center justify-center p-6 bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors">
                                    <div className="text-center space-y-2">
                                        <Plus className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                                        <p className="text-sm font-medium text-muted-foreground">Programar nuevo plan preventivo</p>
                                    </div>
                                </Card>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Programar Plan Preventivo</DialogTitle>
                                    <DialogDescription>
                                        Establezca alertas personalizadas por kilometraje o por horas para un tipo de mantenimiento.
                                    </DialogDescription>
                                </DialogHeader>
                                <form action={handlePreventativeSubmit} className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label>Tipo de Mantenimiento</Label>
                                        <Select name="maintenanceType" required>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar tipo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {catalogs.settings.filter((s:any) => s.category === 'maintenance_type').map((s:any) => (
                                                    <SelectItem key={s.id} value={s.value}>{s.value}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Intervalo de Servicio</Label>
                                            <Input type="number" name="intervalValue" placeholder="Ej: 10000" required />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Unidad</Label>
                                            <Select name="intervalUnit" defaultValue="km" required>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Seleccionar" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="km">Kilómetros (km)</SelectItem>
                                                    <SelectItem value="horas">Horas de Uso (h)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Última lectura en que se realizó</Label>
                                        <Input 
                                            type="number" 
                                            name="lastPerformedValue" 
                                            placeholder="Ej: 80000" 
                                            defaultValue={vehicle.currentMileage} 
                                            required 
                                        />
                                    </div>

                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button type="button" variant="ghost" onClick={() => setPreventativeDialogOpen(false)}>Cancelar</Button>
                                        <Button type="submit" disabled={preventativeLoading}>
                                            {preventativeLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    Programando...
                                                </>
                                            ) : 'Programar Plan'}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </TabsContent>
                        </>
                    );

                    return (
                        <>
                            {/* Desktop Inline Tab Contents */}
                            <div className="hidden md:block">
                                {renderTabsContent()}
                            </div>

                            {/* Mobile Bottom Sheet Overlay */}
                            <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
                                <SheetContent side="bottom" className="h-[92vh] rounded-t-[2rem] bg-slate-50 p-0 overflow-hidden flex flex-col border-t border-slate-200">
                                    {/* Drag Handle indicator */}
                                    <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-3 shrink-0" />
                                    
                                    <SheetHeader className="px-6 pb-4 border-b bg-white shrink-0 flex flex-row items-center justify-between">
                                        <div className="text-left">
                                            <SheetTitle className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                                                {activeTab === 'history' && '📋 Historial Log'}
                                                {activeTab === 'tech' && '🚗 Ficha Técnica'}
                                                {activeTab === 'fuel' && '⛽ Registrar Repostaje'}
                                                {activeTab === 'maintenance' && '🔧 Registrar Mantenimiento'}
                                                {activeTab === 'permits' && '📄 Permisos y Seguros'}
                                                {activeTab === 'preventative' && '🛡️ Planes Preventivos'}
                                            </SheetTitle>
                                            <SheetDescription className="text-xs font-semibold text-slate-500 mt-0.5">
                                                Activo: {vehicle.plate}
                                            </SheetDescription>
                                        </div>
                                    </SheetHeader>
                                    
                                    {/* Dedicated Scroll Container inside Bottom Sheet */}
                                    <div className="flex-1 overflow-y-auto px-4 py-4 pb-20">
                                        <Tabs value={activeTab} className="w-full">
                                            {renderTabsContent()}
                                        </Tabs>
                                    </div>
                                </SheetContent>
                            </Sheet>
                            
                            <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
                                <DialogContent className="max-w-lg p-0 overflow-hidden bg-black/95 border-none shadow-2xl rounded-2xl flex flex-col items-center justify-center">
                                    <DialogHeader className="p-4 border-b border-white/10 w-full bg-slate-900/90 text-white flex flex-row items-center justify-between animate-fadeIn">
                                        <div>
                                            <DialogTitle className="text-base font-bold flex items-center gap-2">
                                                <Camera className="w-4 h-4 text-emerald-400 animate-pulse" /> Comprobante Adjunto
                                            </DialogTitle>
                                            <DialogDescription className="text-xs text-slate-400">
                                                Imagen cargada desde Telegram
                                            </DialogDescription>
                                        </div>
                                    </DialogHeader>
                                    {selectedPhoto && (
                                        <div className="relative w-full max-h-[80vh] flex items-center justify-center p-2 bg-slate-950">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img 
                                                src={`/api/fleet/files/${selectedPhoto}`} 
                                                alt="Comprobante" 
                                                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md border border-white/5 transition-all duration-300"
                                            />
                                        </div>
                                    )}
                                </DialogContent>
                            </Dialog>
                        </>
                    );
                })()}
            </Tabs>
        </div>
    );
}
