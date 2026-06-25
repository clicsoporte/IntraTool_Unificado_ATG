/**
 * @fileoverview System maintenance page for administrators.
 * This page provides critical, high-risk functionalities such as database
 * backup, restore, and factory reset. It is designed to be modular to support
 * future tools with separate databases.
 */
"use client";

import { useState, useCallback, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select"
import { useToast } from "@/modules/core/hooks/use-toast";
import { logError, logInfo, logWarn } from "@/modules/core/lib/logger";
import { UploadCloud, RotateCcw, Loader2, Save, LifeBuoy, Trash2 as TrashIcon, Download, Skull, AlertTriangle, FileUp, ShieldCheck, CheckCircle, Wrench, FileArchive, DatabaseZap as DBMigrationIcon, DatabaseBackup } from "lucide-react";
import { useDropzone } from 'react-dropzone';
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { restoreAllFromUpdateBackup, listAllUpdateBackups, deleteOldUpdateBackups, restoreDatabase, backupAllForUpdate, factoryReset, getDbModules, getCurrentVersion, forceWalCheckpoint } from '@/modules/core/lib/db';
import { runDatabaseAudit, repairDatabaseSchema } from '@/modules/core/lib/maintenance-actions';
import { cleanupAllExportFiles } from '@/modules/core/lib/actions';
import { migrateLegacyInventoryUnits, initializePopulationStatus, cleanupAndInitializeLocationFlags } from '@/modules/warehouse/lib/actions';
import type { UpdateBackupInfo, DatabaseModule, AuditResult, WarehouseSettings } from '@/modules/core/types';
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from "@/lib/utils";
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { shutdownServer } from '@/modules/core/lib/actions';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { getWarehouseSettings } from '@/modules/warehouse/lib/db';


export default function MaintenancePage() {
    const { isAuthorized, hasPermission } = useAuthorization(['admin:maintenance:backup', 'admin:maintenance:restore', 'admin:maintenance:reset']);
    const { user } = useAuth();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingAction, setProcessingAction] = useState<string | null>(null);
    const { setTitle } = usePageTitle();

    // State for update backups
    const [systemVersion, setSystemVersion] = useState<string | null>(null);
    const [updateBackups, setUpdateBackups] = useState<UpdateBackupInfo[]>([]);
    const [dbModules, setDbModules] = useState<Omit<DatabaseModule, 'schema'>[]>([]);
    const [warehouseSettings, setWarehouseSettings] = useState<WarehouseSettings | null>(null);
    const [isRestoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
    const [isClearBackupsConfirmOpen, setClearBackupsConfirmOpen] = useState(false);
    const [isClearExportsConfirmOpen, setClearExportsConfirmOpen] = useState(false);
    
    // State for module reset
    const [isResetConfirmOpen, setResetConfirmOpen] = useState(false);
    const [resetStep, setResetStep] = useState(0);
    const [resetConfirmationText, setResetConfirmationText] = useState("");
    const [moduleToReset, setModuleToReset] = useState<string>("");

    // State for full reset
    const [isFullResetConfirmOpen, setFullResetConfirmOpen] = useState(false);
    const [fullResetStep, setFullResetStep] = useState(0);
    const [fullResetConfirmationText, setFullResetConfirmationText] = useState("");

    const [showAllRestorePoints, setShowAllRestorePoints] = useState(false);
    const [selectedRestoreTimestamp, setSelectedRestoreTimestamp] = useState<string>("");

    // State for single module restore
    const [isSingleRestoreOpen, setIsSingleRestoreOpen] = useState(false);
    const [moduleToRestore, setModuleToRestore] = useState<string>("");
    const [fileToRestore, setFileToRestore] = useState<File | null>(null);
    const [singleRestoreStep, setSingleRestoreStep] = useState(0);
    const [singleRestoreConfirmationText, setSingleRestoreConfirmationText] = useState("");
    
    // State for audit
    const [isAuditing, setIsAuditing] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);
    const [auditResults, setAuditResults] = useState<AuditResult[] | null>(null);

    // State for legacy migration
    const [isMigratingLegacy, setIsMigratingLegacy] = useState(false);
    const [isInitializingPopulation, setIsInitializingPopulation] = useState(false);
    const [isCleaningUp, setIsCleaningUp] = useState(false);

    /**
     * Parses a timestamp string from a backup filename.
     * Backup filenames replace colons with hyphens. This function reverses that.
     * @param timestampString The timestamp string from the filename (e.g., '2024-07-25T16-04-30.123Z').
     * @returns A valid Date object.
     */
    const parseBackupTimestamp = (timestampString: string): Date => {
        if (!timestampString) return new Date(NaN);
        const parts = timestampString.split('T');
        if (parts.length !== 2) {
            return parseISO(timestampString);
        }
        const datePart = parts[0];
        const timePart = parts[1];
        const correctedTimePart = timePart.replace(/-/g, ':');
        return parseISO(`${datePart}T${correctedTimePart}`);
    };

    /**
     * Safely formats a date, returning a fallback string if the date is invalid.
     */
    const safeFormatDate = (date: Date | string | null, formatStr: string) => {
        if (!date) return 'Sin fecha';
        try {
            const d = typeof date === 'string' ? parseISO(date) : date;
            if (isNaN(d.getTime())) return 'Fecha inválida';
            return format(d, formatStr, { locale: es });
        } catch (e) {
            return 'Error de fecha';
        }
    };


    const fetchMaintenanceData = useCallback(async () => {
        setIsProcessing(true);
        setProcessingAction('load');
        try {
            const [backups, modules, version, whSettings] = await Promise.all([
                listAllUpdateBackups(),
                getDbModules(),
                getCurrentVersion(),
                getWarehouseSettings(),
            ]);
            setUpdateBackups(backups);
            setDbModules(modules);
            setSystemVersion(version);
            setWarehouseSettings(whSettings);
            if (backups.length > 0) {
                const latestTimestamp = backups.reduce((latest: string, current: UpdateBackupInfo) => new Date(current.date) > new Date(latest) ? current.date : latest, backups[0].date);
                setSelectedRestoreTimestamp(latestTimestamp);
            }
        } catch(error: any) {
            logError("Error fetching maintenance data", { error: error.message });
            toast({ title: "Error", description: "No se pudieron cargar los datos de mantenimiento.", variant: "destructive" });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    }, [toast]);

    useEffect(() => {
        setTitle("Mantenimiento del Sistema");
        if(isAuthorized) {
            fetchMaintenanceData();
        }
    }, [setTitle, fetchMaintenanceData, isAuthorized]);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        setFileToRestore(acceptedFiles[0]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'], 'application/octet-stream': ['.db', '.sqlite', '.sqlite3'] },
        maxFiles: 1,
    });
    
    const handleFullBackup = async () => {
        setIsProcessing(true);
        setProcessingAction('full-backup');
        try {
            await backupAllForUpdate();
            await fetchMaintenanceData();
            toast({
                title: "Backup Completo Creado",
                description: `Se creó un nuevo punto de restauración para la actualización.`
            });
            await logInfo(`User ${user?.name} created a new full backup for update.`);
        } catch (error: any) {
             toast({
                title: "Error de Backup",
                description: `No se pudo crear el backup completo. ${error.message}`,
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    };
    
    const handleFullRestore = async () => {
        if (!selectedRestoreTimestamp) {
            toast({ title: "Error", description: "Debe seleccionar un punto de restauración.", variant: "destructive" });
            return;
        }
        setIsProcessing(true);
        setProcessingAction('full-restore');
        
        try {
            await restoreAllFromUpdateBackup(selectedRestoreTimestamp);

            toast({
                title: "Restauración Iniciada",
                description: "Los datos han sido restaurados. Por favor, reinicie manualmente el servidor de la aplicación para aplicar los cambios.",
                duration: 10000,
            });
            
            await logWarn(`System restore initiated by user ${user?.name} from backup point ${selectedRestoreTimestamp}. A manual server restart is required.`);

        } catch (error: any) {
             toast({
                title: "Error de Restauración",
                description: `No se pudo completar la restauración. ${error.message}`,
                variant: "destructive"
            });
        } finally {
             setIsProcessing(false);
             setProcessingAction(null);
        }
    };

    const handleClearOldBackups = async () => {
        if (uniqueTimestamps.length <= 1) {
            toast({ title: "Acción no necesaria", description: "No hay backups antiguos para eliminar.", variant: "default"});
            return;
        }

        setIsProcessing(true);
        setProcessingAction('clear-backups');
        try {
            const count = await deleteOldUpdateBackups();
            await fetchMaintenanceData();
            await logInfo(`User ${user?.name} cleared ${count} old backup sets.`);
            toast({
                title: "Limpieza Completada",
                description: `Se han eliminado ${count} puntos de restauración antiguos.`
            });
        } catch (error: any) {
             toast({
                title: "Error al Limpiar",
                description: `No se pudieron eliminar los backups. ${error.message}`,
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    };

    const handleClearExportFiles = async () => {
        setIsProcessing(true);
        setProcessingAction('clear-exports');
        try {
            const count = await cleanupAllExportFiles();
            toast({
                title: "Limpieza Completada",
                description: `Se han eliminado ${count} archivos de exportación temporales.`
            });
            await logInfo(`User ${user?.name} cleared ${count} temporary export files.`);
        } catch (error: any) {
            toast({
                title: "Error al Limpiar",
                description: `No se pudieron eliminar los archivos de exportación. ${error.message}`,
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    }
    
    const handleForceCheckpoint = async () => {
        setIsProcessing(true);
        setProcessingAction('checkpoint');
        try {
            await forceWalCheckpoint();
            toast({
                title: "Consolidación Completada",
                description: "Los archivos de datos han sido consolidados exitosamente."
            });
        } catch (error: any) {
            logError("Failed to run manual WAL checkpoint", { error: error.message });
            toast({ title: "Error", description: `No se pudo completar la consolidación. ${error.message}`, variant: "destructive" });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    };

    const handleSingleModuleRestore = async () => {
        if (singleRestoreStep !== 2 || singleRestoreConfirmationText !== "RESTAURAR" || !moduleToRestore || !fileToRestore) {
            toast({ title: "Confirmación requerida", description: "Debe seleccionar un módulo, un archivo y seguir los pasos para confirmar.", variant: "destructive" });
            return;
        }
        setIsProcessing(true);
        setProcessingAction('single-restore');
        try {
            const moduleName = dbModules.find(m => m.id === moduleToRestore)?.name || moduleToRestore;
            
            await restoreDatabase(moduleToRestore, fileToRestore);

            toast({
                title: "Módulo Restaurado",
                description: `La base de datos de "${moduleName}" ha sido restaurada. Por favor, reinicie manualmente el servidor.`,
                duration: 10000,
            });

            await logWarn(`Module ${moduleName} was restored by ${user?.name} from a file backup. A manual server restart is required.`);
            
        } catch (error: any) {
             toast({ title: "Error de Restauración", description: error.message, variant: "destructive" });
            logError("Single module restore failed.", { error: error.message, module: moduleToRestore });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    };

    const handleFactoryReset = async () => {
        if (resetStep !== 2 || resetConfirmationText !== "RESETEAR" || !moduleToReset) {
            toast({ title: "Confirmación requerida", description: "Debe seleccionar un módulo y seguir los pasos para confirmar la acción.", variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        setProcessingAction('factory-reset');
        try {
            const moduleName = dbModules.find(m => m.id === moduleToReset)?.name || moduleToReset;
            
            await factoryReset(moduleToReset);
            
            toast({
                title: "Módulo Reseteado",
                description: `Se ha borrado la base de datos de "${moduleName}". Por favor, reinicie manualmente el servidor.`,
                duration: 10000,
            });

            await logWarn(`MODULE FACTORY RESET initiated by user ${user?.name} for module ${moduleName}. A manual server restart is required.`);

        } catch (error: any) {
            toast({ title: "Error en el Reseteo", description: error.message, variant: "destructive" });
            logError("Factory reset failed.", { error: error.message, module: moduleToReset });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    }
    
    const handleFullFactoryReset = async () => {
        if (fullResetStep !== 2 || fullResetConfirmationText !== "RESETEAR TODO") {
            toast({ title: "Confirmación Estricta Requerida", description: "Debe seguir todos los pasos para confirmar esta acción irreversible.", variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        setProcessingAction('full-factory-reset');
        try {
            await factoryReset('__all__');

            toast({
                title: "Reseteo de Fábrica Completado",
                description: "Se han borrado todas las bases de datos. Por favor, reinicie manualmente el servidor para reinicializar.",
                duration: 10000,
            });

            await logWarn(`FULL SYSTEM FACTORY RESET initiated by user ${user?.name}. All data will be wiped. A manual server restart is required.`);
        } catch (error: any) {
            toast({ title: "Error en el Reseteo Total", description: error.message, variant: "destructive" });
            logError("Full factory reset failed.", { error: error.message });
        } finally {
            setIsProcessing(false);
            setProcessingAction(null);
        }
    };

    const handleRunAudit = async () => {
        setIsAuditing(true);
        setAuditResults(null);
        try {
            const results = await runDatabaseAudit();
            setAuditResults(results);
            
            const issues = (results || []).filter(r => r.status !== 'ok').length;
            if (issues > 0) {
                toast({ 
                    title: "Auditoría Completada", 
                    description: `Se encontraron ${issues} discrepancias en el esquema.`, 
                    variant: "destructive" 
                });
            } else {
                toast({ 
                    title: "Auditoría Completada", 
                    description: "La estructura de la base de datos está íntegra.", 
                });
            }
        } catch (error: any) {
            logError("Error running database audit", { error: error.message });
            toast({ title: "Error en la Auditoría", description: "No se pudo completar el proceso de auditoría.", variant: "destructive" });
        } finally {
            setIsAuditing(false);
        }
    }

    const handleRepairSchema = async () => {
        if (!auditResults) return;
        setIsRepairing(true);
        try {
            const result = await repairDatabaseSchema(auditResults);
            if (result.success) {
                toast({ 
                    title: "Reparación Exitosa", 
                    description: `Se corrigieron ${result.fixed.length} columnas.`, 
                });
                // Re-run audit to verify
                await handleRunAudit();
            } else {
                toast({ 
                    title: "Reparación Parcial", 
                    description: `Se corrigieron ${result.fixed.length} columnas, pero hubo ${result.errors.length} errores.`, 
                    variant: "destructive" 
                });
            }
        } catch (error: any) {
            logError("Error repairing database schema", { error: error.message });
            toast({ title: "Error en la Reparación", description: "No se pudo completar el proceso de reparación.", variant: "destructive" });
        } finally {
            setIsRepairing(false);
        }
    };
    
    const handleRunLegacyMigration = async () => {
        if (!user) return;
        setIsMigratingLegacy(true);
        try {
            await migrateLegacyInventoryUnits();
            toast({ title: "Migración Completada", description: `Se actualizaron los ingresos antiguos.` });
            await fetchMaintenanceData();
        } catch (error: any) {
            logError("Error running legacy inventory migration", { error: error.message });
            toast({ title: "Error de Migración", description: "No se pudo completar el proceso.", variant: "destructive" });
        } finally {
            setIsMigratingLegacy(false);
        }
    };

    const handleInitializePopulationStatus = async () => {
        if (!user) return;
        setIsInitializingPopulation(true);
        try {
            const { updated } = await initializePopulationStatus();
            toast({ title: "Inicialización Completa", description: `Se revisaron y actualizaron ${updated} ubicaciones al nuevo sistema de estado.` });
            await fetchMaintenanceData();
        } catch (error: any) {
            logError("Error initializing population status", { error: error.message });
            toast({ title: "Error de Inicialización", description: "No se pudo completar el proceso.", variant: "destructive" });
        } finally {
            setIsInitializingPopulation(false);
        }
    };

    const handleCleanupAndRecalculate = async () => {
        if (!user) return;
        setIsCleaningUp(true);
        try {
            const { deletedCount, mixedCount } = await cleanupAndInitializeLocationFlags();
            toast({
                title: "Proceso de Saneamiento Completado",
                description: `Se eliminaron ${deletedCount} asignaciones duplicadas y se marcaron ${mixedCount} ubicaciones como mixtas.`,
                duration: 7000
            });
            await fetchMaintenanceData();
        } catch (error: any) {
            logError("Error running location cleanup", { error: error.message });
            toast({ title: "Error en la Limpieza", description: "No se pudo completar el proceso de saneamiento.", variant: "destructive" });
        } finally {
            setIsCleaningUp(false);
        }
    };

    const uniqueTimestamps = [...new Set(updateBackups.map(b => b.date))].sort((a,b) => new Date(b).getTime() - new Date(a).getTime());

    const oldBackupsCount = uniqueTimestamps.length > 1 ? uniqueTimestamps.length - 1 : 0;
    
    if (isAuthorized === null) {
        return null;
    }

    if (!isAuthorized) {
        return null;
    }
    
    const selectedBackupVersion = selectedRestoreTimestamp ? updateBackups.find(b => b.date === selectedRestoreTimestamp)?.version : null;
    const isVersionMismatch = systemVersion && selectedBackupVersion && systemVersion !== selectedBackupVersion;

    const hasAuditIssues = auditResults?.some(r => r.status !== 'ok');

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-8">
                <Accordion type="multiple" defaultValue={['audit']} className="w-full space-y-6">
                     <Card className="overflow-hidden border-none shadow-xl bg-gradient-to-br from-background to-muted/30">
                        <AccordionItem value="audit" className="border-none">
                            <AccordionTrigger className="p-6 hover:no-underline hover:bg-muted/50 transition-all">
                                <div className="flex items-center gap-4 text-left">
                                    <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                                        <ShieldCheck className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-2xl font-bold tracking-tight">Centro de Actualización y Verificación</CardTitle>
                                        <CardDescription className="text-base">
                                            Audita y repara la estructura de las bases de datos para asegurar la integridad post-actualización.
                                        </CardDescription>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0 space-y-6">
                                <div className='flex flex-wrap gap-4 items-center bg-muted/20 p-4 rounded-xl border border-border/50'>
                                    <Button 
                                        onClick={handleRunAudit} 
                                        disabled={isAuditing || isRepairing}
                                        className="relative overflow-hidden group shadow-lg transition-all hover:scale-105 active:scale-95"
                                    >
                                        {isAuditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4 group-hover:rotate-12 transition-transform" />}
                                        Ejecutar Auditoría de Esquema
                                    </Button>

                                    {hasAuditIssues && (
                                        <Button 
                                            variant="secondary" 
                                            onClick={handleRepairSchema} 
                                            disabled={isAuditing || isRepairing}
                                            className="shadow-md hover:bg-primary hover:text-primary-foreground transition-colors"
                                        >
                                            {isRepairing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wrench className="mr-2 h-4 w-4" />}
                                            Reparación Automática
                                        </Button>
                                    )}

                                    {hasAuditIssues && (
                                        <Alert variant="destructive" className="flex-1 border-destructive/50 bg-destructive/10 animate-in fade-in slide-in-from-left-4">
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertTitle className="font-bold">¡Inconsistencias detectadas!</AlertTitle>
                                            <AlertDescription>Se han encontrado tablas o columnas faltantes. Utiliza la reparación automática o contacta a soporte.</AlertDescription>
                                        </Alert>
                                    )}
                                </div>

                                {auditResults && (
                                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in zoom-in-95 duration-500">
                                        {auditResults.map(r => (
                                            <div 
                                                key={r.table} 
                                                className={cn(
                                                    "group p-4 rounded-xl border transition-all duration-300 hover:shadow-md flex flex-col justify-between",
                                                    r.status === 'ok' 
                                                        ? 'bg-green-50/30 border-green-200 hover:border-green-400' 
                                                        : 'bg-red-50/30 border-red-200 hover:border-red-400'
                                                )}
                                            >
                                                <div>
                                                    <div className="flex justify-between items-start gap-2 mb-2 min-w-0">
                                                        <span 
                                                            className="font-bold text-xs tracking-wider opacity-70 group-hover:opacity-100 transition-opacity break-words flex-1 min-w-0 pr-1"
                                                            title={r.table.toUpperCase()}
                                                        >
                                                            {r.table.toUpperCase()}
                                                        </span>
                                                        <div className={cn(
                                                            "p-1.5 rounded-full shrink-0",
                                                            r.status === 'ok' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                                        )}>
                                                            {r.status === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                                        </div>
                                                    </div>
                                                    
                                                    {r.status !== 'ok' && (
                                                        <div className="mt-3 space-y-2">
                                                            <div className="text-[10px] font-bold uppercase tracking-widest text-red-500/70">Faltan:</div>
                                                            <div className="flex flex-wrap gap-1">
                                                                {r.missingColumns.map(col => (
                                                                    <span key={col} className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-mono border border-red-200">
                                                                        {col}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className={cn(
                                                    "mt-4 pt-2.5 border-t border-dashed flex flex-col gap-1.5",
                                                    r.status === 'ok' ? 'border-green-200/50' : 'border-red-200/50'
                                                )}>
                                                    <div className="flex items-center justify-between text-[11px]">
                                                        <span className="text-muted-foreground font-medium">Registros:</span>
                                                        <span className={cn(
                                                            "font-mono font-bold px-2 py-0.5 rounded text-[10px] border",
                                                            r.status === 'ok' 
                                                                ? 'bg-green-100/50 text-green-800 border-green-200/40' 
                                                                : 'bg-red-100/50 text-red-800 border-red-200/40'
                                                        )}>
                                                            {r.recordCount !== undefined ? r.recordCount.toLocaleString() : '0'}
                                                        </span>
                                                    </div>
                                                    {r.status === 'ok' ? (
                                                        <p className="text-[10px] text-green-600/70 italic mt-0.5">Esquema verificado e íntegro</p>
                                                    ) : (
                                                        <p className="text-[10px] text-red-600/70 italic mt-0.5">Requiere reparación</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Card>

                    <Card>
                        <AccordionItem value="backups">
                            <AccordionTrigger className="p-6 hover:no-underline">
                                <div className="flex items-center gap-4">
                                    <LifeBuoy className="h-8 w-8 text-blue-600" />
                                    <div>
                                        <CardTitle>Backups y Puntos de Restauración</CardTitle>
                                        <CardDescription>
                                        Crea puntos de restauración de todo el sistema, ideal antes de una actualización.
                                        </CardDescription>
                                    </div>
                                </div>
                            </AccordionTrigger>
                             <AccordionContent className="p-6 pt-0 space-y-6">
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-4 rounded-lg border p-4">
                                        <h3 className="font-semibold">Crear Punto de Restauración</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Crea una copia de seguridad de todas las bases de datos en un nuevo punto de restauración.
                                        </p>
                                        <Button onClick={handleFullBackup} disabled={isProcessing} className="w-full">
                                            {processingAction === 'full-backup' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                            Crear Punto de Restauración
                                        </Button>
                                    </div>
                                    <div className="space-y-4 rounded-lg border p-4">
                                        <h3 className="font-semibold">Restaurar Sistema Completo</h3>
                                        <div className="space-y-2">
                                            <Label>Punto de Restauración a Usar</Label>
                                            <Select value={selectedRestoreTimestamp} onValueChange={setSelectedRestoreTimestamp} disabled={isProcessing}>
                                                <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                                <SelectContent>
                                                    {uniqueTimestamps.slice(0, showAllRestorePoints ? undefined : 5).map(ts => {
                                                        const backupInfo = updateBackups.find(b => b.date === ts);
                                                        return (
                                                            <SelectItem key={ts} value={ts}>
                                                                {safeFormatDate(parseBackupTimestamp(ts), "dd/MM/yyyy 'a las' HH:mm:ss")}
                                                                {backupInfo?.version && <span className="ml-2 text-xs text-muted-foreground"> (v{backupInfo.version})</span>}
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                            <div className="flex items-center space-x-2 pt-1">
                                                <Checkbox id="show-all-restore-points" checked={showAllRestorePoints} onCheckedChange={(checked) => setShowAllRestorePoints(checked as boolean)} />
                                                <Label htmlFor="show-all-restore-points" className="text-sm font-normal">Mostrar todos los puntos</Label>
                                            </div>
                                        </div>
                                         {isVersionMismatch && (
                                            <Alert variant="destructive">
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertTitle>¡Cuidado! Incompatibilidad de Versiones</AlertTitle>
                                                <AlertDescription>
                                                   Estás intentando restaurar un backup de la versión <strong>v{selectedBackupVersion}</strong> sobre la versión actual del sistema <strong>v{systemVersion}</strong>. Esto puede causar errores o corrupción de datos. Procede solo si también vas a restaurar los archivos de la aplicación a la versión anterior.
                                                </AlertDescription>
                                            </Alert>
                                        )}
                                        <AlertDialog open={isRestoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" disabled={isProcessing || !selectedRestoreTimestamp} className="w-full">
                                                    <RotateCcw className="mr-2 h-4 w-4" />Restaurar desde Selección
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Confirmar Restauración del Sistema?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Esta acción reemplazará **TODAS** las bases de datos actuales con las del backup seleccionado. Se requiere un reinicio manual del servidor de la aplicación.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleFullRestore}>Sí, restaurar todo</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                                <Card>
                                    <CardHeader><CardTitle>Archivos de Puntos de Restauración</CardTitle></CardHeader>
                                    <CardContent>
                                        <ScrollArea className="h-60 w-full rounded-md border p-2">
                                            {updateBackups.length > 0 ? (
                                                <div className="space-y-2">
                                                    {updateBackups.map(b => (
                                                        <div key={b.fileName} className="flex items-center justify-between rounded-md p-2 hover:bg-muted">
                                                            <div>
                                                                <p className="font-semibold text-sm">{b.moduleName} {b.version && <span className="font-normal text-xs text-muted-foreground">(v{b.version})</span>}</p>
                                                                <p className="text-xs text-muted-foreground">{safeFormatDate(parseBackupTimestamp(b.date), "dd/MM/yyyy HH:mm:ss")}</p>
                                                            </div>
                                                            <a href={`/routes/temp-backups?file=${encodeURIComponent(b.fileName)}`} download={b.fileName}>
                                                                <Button variant="ghost" size="icon"><Download className="h-4 w-4"/></Button>
                                                            </a>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <div className="flex h-full items-center justify-center"><p className="text-muted-foreground text-sm">No hay puntos de restauración.</p></div>}
                                        </ScrollArea>
                                    </CardContent>
                                    <CardFooter>
                                        <AlertDialog open={isClearBackupsConfirmOpen} onOpenChange={setClearBackupsConfirmOpen}>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="outline" disabled={isProcessing || oldBackupsCount === 0}>
                                                    <TrashIcon className="mr-2 h-4 w-4" />
                                                    Limpiar {oldBackupsCount > 0 ? `${oldBackupsCount} Puntos Antiguos` : 'Backups'}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Limpiar Backups Antiguos?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Se eliminarán todos los puntos de restauración excepto el más reciente. Esta acción no se puede deshacer.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleClearOldBackups}>Sí, limpiar</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </CardFooter>
                                </Card>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>
                    
                    {hasPermission('admin:maintenance:reset') && (
                        <Accordion type="multiple" className="w-full space-y-6">
                            <Card>
                                <AccordionItem value="migration-tools">
                                    <AccordionTrigger className="p-6 hover:no-underline">
                                        <div className="flex items-center gap-4">
                                            <DBMigrationIcon className="h-8 w-8 text-orange-600" />
                                            <div>
                                                <CardTitle>Herramientas de Migración</CardTitle>
                                                <CardDescription>Ejecuta procesos manuales para actualizar la estructura de datos antiguos.</CardDescription>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-6 pt-0 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2 rounded-lg border p-4">
                                            <h3 className="font-semibold">Actualizar Ingresos de Almacén Antiguos</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Este proceso buscará todos los ingresos creados antes del sistema de estados y los marcará como &quot;Aplicado&quot;. Es seguro de ejecutar múltiples veces.
                                            </p>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                     <Button variant="secondary" disabled={isMigratingLegacy}>
                                                        {isMigratingLegacy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4"/>}
                                                        Actualizar Ingresos Antiguos
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Actualizar Registros Antiguos?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Se asignará un consecutivo y se marcarán como &quot;Aplicados&quot; todos los ingresos de inventario que no tengan un estado.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleRunLegacyMigration}>Sí, actualizar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                             {warehouseSettings?.lastLegacyMigration && (
                                                <p className="text-xs text-muted-foreground pt-2">Última ejecución: {safeFormatDate(warehouseSettings.lastLegacyMigration, 'dd/MM/yyyy HH:mm')}</p>
                                            )}
                                        </div>
                                         <div className="space-y-2 rounded-lg border p-4">
                                            <h3 className="font-semibold">Inicializar Estado de Poblado</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Analiza las ubicaciones y asignaciones existentes para establecer el estado inicial (&apos;Ocupado&apos; o &apos;Pendiente&apos;). Ejecutar después de actualizar a v2.8+.
                                            </p>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                     <Button variant="secondary" disabled={isInitializingPopulation}>
                                                        {isInitializingPopulation ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4"/>}
                                                        Inicializar Estado de Poblado
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Inicializar Estados de Ubicación?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            El sistema revisará todas las ubicaciones. Si una ya tiene un producto asignado, se marcará como &apos;Ocupada&apos;; si no, como &apos;Pendiente&apos;. Esto es seguro y solo afecta a ubicaciones no procesadas por el nuevo sistema.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleInitializePopulationStatus}>Sí, inicializar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                            {warehouseSettings?.lastPopulationInit && (
                                                <p className="text-xs text-muted-foreground pt-2">Última ejecución: {safeFormatDate(warehouseSettings.lastPopulationInit, 'dd/MM/yyyy HH:mm')}</p>
                                            )}
                                        </div>
                                         <div className="space-y-2 rounded-lg border p-4">
                                            <h3 className="font-semibold">Limpiar y Recalcular Ubicaciones Mixtas</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Elimina asignaciones duplicadas de versiones antiguas y recalcula qué ubicaciones son mixtas. Ejecutar una vez tras actualizar a v2.8+.
                                            </p>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="secondary" disabled={isCleaningUp}>
                                                        {isCleaningUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                                        Limpiar y Recalcular
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Confirmar Saneamiento de Datos?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción buscará y eliminará asignaciones duplicadas (producto/ubicación) y recalculará las banderas &quot;mixtas&quot; de todas las ubicaciones. Es seguro ejecutarlo, pero se recomienda hacerlo solo una vez.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleCleanupAndRecalculate}>Sí, continuar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                            {warehouseSettings?.lastCleanup && (
                                                <p className="text-xs text-muted-foreground pt-2">Última ejecución: {format(parseISO(warehouseSettings.lastCleanup), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
                                            )}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Card>

                            <Card className="border-destructive">
                                <AccordionItem value="danger-zone">
                                    <AccordionTrigger className="p-6 hover:no-underline">
                                        <div className="flex items-center gap-4">
                                            <Skull className="h-8 w-8 text-destructive" />
                                            <div>
                                                <CardTitle>Zona de Peligro</CardTitle>
                                                <CardDescription>Acciones críticas e irreversibles. Usar con extrema precaución.</CardDescription>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-6 pt-0 space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-4 rounded-lg border p-4">
                                                <h3 className="font-semibold">Limpiar Archivos Temporales</h3>
                                                <p className="text-sm text-muted-foreground">Elimina todos los archivos generados por las exportaciones de reportes (Excel) que se han acumulado en el servidor.</p>
                                                <AlertDialog open={isClearExportsConfirmOpen} onOpenChange={setClearExportsConfirmOpen}>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="outline" className="w-full" disabled={isProcessing}>
                                                            <FileArchive className="mr-2 h-4 w-4" />Limpiar Exportaciones
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>¿Limpiar Archivos de Exportación?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Se eliminarán todos los archivos temporales de la carpeta de exportaciones.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleClearExportFiles}>Sí, limpiar</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                            <div className="space-y-4 rounded-lg border p-4">
                                                <h3 className="font-semibold">Forzar Consolidación de Datos</h3>
                                                <p className="text-sm text-muted-foreground">Ejecuta un &quot;checkpoint&quot; para consolidar los archivos temporales (.wal) en la base de datos principal.</p>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="outline" className="w-full" disabled={isProcessing}>
                                                            <DatabaseBackup className="mr-2 h-4 w-4" />Forzar Consolidación
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>¿Confirmar Consolidación?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Esta acción forzará al sistema a escribir todos los cambios pendientes desde los archivos temporales (.wal) a los archivos de base de datos principales. Es una operación segura.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleForceCheckpoint}>Sí, consolidar</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                            <div className="space-y-4 rounded-lg border p-4">
                                                <h3 className="font-semibold">Restaurar Módulo Individual</h3>
                                                <p className="text-sm text-muted-foreground">Reemplaza la base de datos de un módulo con un archivo .db que subas desde tu computadora.</p>
                                                <Dialog open={isSingleRestoreOpen} onOpenChange={(open: boolean) => {
                                                    if (!open) { setSingleRestoreStep(0); setSingleRestoreConfirmationText(""); setModuleToRestore(""); setFileToRestore(null); }
                                                    setIsSingleRestoreOpen(open);
                                                }}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="destructive" className="w-full"><FileUp className="mr-2 h-4 w-4"/>Restaurar Módulo</Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle className="flex items-center gap-2"><AlertTriangle/>Confirmación de Restauración</DialogTitle>
                                                            <DialogDescription>Esta acción reemplazará la base de datos del módulo seleccionado. Todos los datos actuales en ese módulo se perderán.</DialogDescription>
                                                        </DialogHeader>
                                                        <div className="py-4 space-y-4">
                                                            <div className="space-y-2">
                                                                <Label htmlFor="restore-module-select">Módulo a Restaurar</Label>
                                                                <Select value={moduleToRestore} onValueChange={setModuleToRestore}><SelectTrigger id="restore-module-select"><SelectValue placeholder="Seleccionar módulo..." /></SelectTrigger><SelectContent>{dbModules.map(m => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}</SelectContent></Select>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label>Archivo de Backup (.db)</Label>
                                                                <div {...getRootProps()} className={cn("flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors", isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50')}>
                                                                    <input {...getInputProps()} />
                                                                    <UploadCloud className="w-8 h-8 text-muted-foreground" />
                                                                    {fileToRestore ? <p className="mt-2 text-sm font-medium">{fileToRestore.name}</p> : <p className="mt-2 text-center text-sm text-muted-foreground">Arrastra un archivo .db aquí o haz clic para seleccionar</p>}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <Checkbox id="restore-single-confirm-checkbox" onCheckedChange={(checked) => setSingleRestoreStep(checked ? 1 : 0)} disabled={!moduleToRestore || !fileToRestore}/>
                                                                <Label htmlFor="restore-single-confirm-checkbox" className="font-medium text-destructive">Entiendo las consecuencias y deseo continuar.</Label>
                                                            </div>
                                                            {singleRestoreStep > 0 && (
                                                                <div className="space-y-2">
                                                                    <Label htmlFor="restore-single-confirmation-text">Para confirmar, escribe &quot;RESTAURAR&quot;:</Label>
                                                                    <Input id="restore-single-confirmation-text" value={singleRestoreConfirmationText} onChange={(e) => { setSingleRestoreConfirmationText(e.target.value.toUpperCase()); if (e.target.value.toUpperCase() === "RESTAURAR") {setSingleRestoreStep(2);} else {setSingleRestoreStep(1);}}} className="border-destructive focus-visible:ring-destructive" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <DialogFooter>
                                                            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                                                            <Button variant="destructive" onClick={handleSingleModuleRestore} disabled={isProcessing || singleRestoreStep !== 2 || singleRestoreConfirmationText !== "RESTAURAR"}>
                                                                {processingAction === 'single-restore' ? <Loader2 className="mr-2 animate-spin"/> : <RotateCcw className="mr-2"/>} Sí, Restaurar Módulo
                                                            </Button>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>
                                            </div>
                                            <div className="space-y-4 rounded-lg border p-4">
                                                <h3 className="font-semibold">Resetear Módulo Específico</h3>
                                                <p className="text-sm text-muted-foreground">Borra todos los datos de un módulo y lo devuelve a su estado inicial. Útil si un módulo está corrupto.</p>
                                                <div className='flex flex-wrap gap-4 items-end'>
                                                    <div className="flex-1 min-w-[200px] space-y-2"><Label htmlFor="reset-module-select">Módulo a Resetear</Label><Select value={moduleToReset} onValueChange={setModuleToReset}><SelectTrigger id="reset-module-select"><SelectValue placeholder="Seleccionar..." /></SelectTrigger><SelectContent>{dbModules.map(m => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}</SelectContent></Select></div>
                                                    <AlertDialog open={isResetConfirmOpen} onOpenChange={(open: boolean) => { setResetConfirmOpen(open); if(!open) { setResetStep(0); setResetConfirmationText(""); }}}>
                                                        <AlertDialogTrigger asChild><Button variant="destructive" disabled={isProcessing || !moduleToReset}><TrashIcon className="mr-2 h-4 w-4" />Resetear Módulo</Button></AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>Confirmación Final Requerida</AlertDialogTitle>
                                                                <AlertDialogDescription>Esta acción borrará **TODA** la información del módulo &quot;{dbModules.find(m => m.id === moduleToReset)?.name || ""}&quot;.</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <div className="py-4 space-y-4">
                                                                <div className="flex items-center space-x-2"><Checkbox id="reset-confirm-checkbox" onCheckedChange={(checked) => setResetStep(checked ? 1 : 0)} /><Label htmlFor="reset-confirm-checkbox" className="font-medium text-destructive">Entiendo las consecuencias.</Label></div>
                                                                {resetStep > 0 && (<div className="space-y-2"><Label htmlFor="reset-confirmation-text">Para confirmar, escribe &quot;RESETEAR&quot;:</Label><Input id="reset-confirmation-text" value={resetConfirmationText} onChange={(e) => { setResetConfirmationText(e.target.value.toUpperCase()); if (e.target.value.toUpperCase() === "RESETEAR") {setResetStep(2);} else {setResetStep(1);}}} className="border-destructive focus-visible:ring-destructive" /></div>)}
                                                            </div>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction onClick={handleFactoryReset} disabled={isProcessing || resetStep !== 2 || resetConfirmationText !== "RESETEAR"}>{processingAction === 'factory-reset' ? <Loader2 className="mr-2 animate-spin"/> : <TrashIcon className="mr-2"/>}Sí, Borrar Módulo</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4 rounded-lg border p-4">
                                            <h3 className="font-semibold">Resetear Todo el Sistema</h3>
                                            <p className="text-sm text-muted-foreground">Devuelve la aplicación completa a su estado de fábrica. Se borrarán todos los usuarios, configuraciones y datos. Es una acción irreversible.</p>
                                            <AlertDialog open={isFullResetConfirmOpen} onOpenChange={(open: boolean) => { setFullResetConfirmOpen(open); if(!open) { setFullResetStep(0); setFullResetConfirmationText(""); }}}>
                                                <AlertDialogTrigger asChild><Button variant="destructive" className='w-full'><Skull className="mr-2 h-4 w-4" />Resetear Sistema de Fábrica</Button></AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>¡ACCIÓN IRREVERSIBLE!</AlertDialogTitle>
                                                        <AlertDialogDescription>Se borrarán **TODAS LAS BASES DE DATOS** y se perderá toda la información. La aplicación se reiniciará.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <div className="py-4 space-y-4">
                                                        <div className="flex items-center space-x-2"><Checkbox id="full-reset-confirm-checkbox" onCheckedChange={(checked) => setFullResetStep(checked ? 1 : 0)} /><Label htmlFor="full-reset-confirm-checkbox" className="font-medium text-destructive">Entiendo que esto borrará toda la información.</Label></div>
                                                        {fullResetStep > 0 && (<div className="space-y-2"><Label htmlFor="full-reset-confirmation-text">Para confirmar, escribe &quot;RESETEAR TODO&quot;:</Label><Input id="full-reset-confirmation-text" value={fullResetConfirmationText} onChange={(e) => { setFullResetConfirmationText(e.target.value.toUpperCase()); if (e.target.value.toUpperCase() === "RESETEAR TODO") {setFullResetStep(2);} else {setFullResetStep(1);}}} className="border-destructive focus-visible:ring-destructive" /></div>)}
                                                    </div>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleFullFactoryReset} disabled={isProcessing || fullResetStep !== 2 || fullResetConfirmationText !== "RESETEAR TODO"}>{processingAction === 'full-factory-reset' ? <Loader2 className="mr-2 animate-spin"/> : <Skull className="mr-2"/>}Sí, Borrar Todo</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Card>
                        </Accordion>
                    )}
                </Accordion>
            </div>
            
            {(isProcessing) && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-primary p-3 text-primary-foreground shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Procesando...</span>
                </div>
            )}
        </main>
    );
}
