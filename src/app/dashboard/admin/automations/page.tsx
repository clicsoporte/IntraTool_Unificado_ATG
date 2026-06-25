'use client';

/**
 * @fileoverview Administration page for managing the Notifications and Automations Engine.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
    Dialog, 
    DialogContent, 
    DialogFooter, 
    DialogHeader, 
    DialogTitle, 
    DialogTrigger, 
    DialogClose 
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Trash2, Edit, BellRing, Clock, Send, Loader2, Mail, RefreshCw, Play, LayoutTemplate, Info, Save, ChevronRight, Eye, Bot, Smartphone, UserPlus, Link2, Unlink, CheckCircle2, AlertCircle, Key, Lock, User, UserCheck, Activity, Sparkles, Cpu, Server, CheckCircle, XCircle, Settings2, HelpCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import type { NotificationRule, ScheduledTask, NotificationServiceConfig, EmailSettings, NotificationTemplate, AiSettings } from '@/modules/core/types';
import { 
    getAllNotificationRules, saveNotificationRule, deleteNotificationRule,
    getAllScheduledTasks, saveScheduledTask, deleteScheduledTask,
    getNotificationServiceSettings, saveNotificationServiceSettings,
    testTelegram, fetchTelegramChatId, testNotificationRule,
    getAllNotificationTemplates, saveNotificationTemplate
} from '@/modules/notifications/lib/actions';
import { getAiSettings, saveAiSettings } from '@/modules/core/lib/db';
import { testAiConnection } from '@/modules/core/lib/ai-assistant-service';
import { Badge } from '@/components/ui/badge';
import {
    generateActivationCodeAction,
    linkTelegramManuallyAction,
    unlinkTelegramAction,
    updateTelegramLinkagePermissionsAction,
    getAllLinkagesAction,
    getActiveBotStatesAction,
    clearBotStateAction,
    getTelegramBotSettingsAction,
    updateTelegramBotSettingAction,
    setupTelegramWebhookAction,
    deleteTelegramWebhookAction,
    getAllEmployeesAction
} from '@/modules/fleet/lib/telegram-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const eventLabels: Record<string, string> = {
    onFleetMaintenanceDue: 'Cambio de Aceite / Mantenimiento (Por Vencer o Vencido)',
    onFleetPermitExpiring: 'Documentos, Permisos Especiales y RTV (Por Vencer o Vencido)',
    onFleetFuelLogAdded: 'Nuevo Repostaje / Consumo de Combustible',
    onFleetMaintenanceLogAdded: 'Mantenimiento Realizado (Registro de Trabajo)',
    onFleetOdometerAnomaly: 'Anomalía en Odómetro (Desfase de Kilometraje)',
    onNewSuggestion: 'Nueva Sugerencia en Buzón',
    onTicketCreated: 'Nuevo Ticket (Apertura de Soporte)',
    onTicketStatusChanged: 'Cambio de Estado en Ticket',
    onFleetWeeklyFuelReport: 'Consolidado Semanal de Consumo de Combustible (Reporte)',
    onFleetAlertsSummary: 'Consolidado de Alertas de Flota (Reporte)',
    onDeliveryUpdate: 'Actualización en Estado de Entrega (Logística)',
    onAssetAssigned: 'Asignación de Activo Fijo TI (ITAM)',
    onCollectAssigned: 'Solicitud de Recolecta Asignada a Ruta (Compras)',
    onCollectUpdate: 'Actualización en Estado de Recolecta (Compras)',
    onDeliveryRetry: 'Boleta de Retorno / Devolución Total de Entrega (Logística)',
    onDeliveryPartial: 'Boleta de Entrega Incompleta / Faltante (Logística)',
};

const eventVariables: Record<string, string[]> = {
    onFleetMaintenanceDue: ['plate', 'brand', 'model', 'progress', 'remaining', 'currentMileage', 'odometerUnit'],
    onFleetPermitExpiring: ['plate', 'permitType', 'expirationDate', 'daysLeft'],
    onFleetFuelLogAdded: ['plate', 'brand', 'model', 'date', 'mileageBefore', 'liters', 'cost', 'driverId', 'userName'],
    onFleetMaintenanceLogAdded: ['plate', 'brand', 'model', 'type', 'description', 'mileage', 'cost', 'performedBy'],
    onFleetOdometerAnomaly: ['plate', 'previousMileage', 'currentMileage', 'diff'],
    onNewSuggestion: ['userName', 'content'],
    onTicketCreated: ['consecutive', 'subject', 'departmentName', 'maintenanceType', 'priority', 'equipmentName', 'brand', 'model', 'serialNumber', 'assigneeName', 'createdByName', 'requesterName', 'description'],
    onTicketStatusChanged: ['consecutive', 'subject', 'departmentName', 'status', 'assigneeName', 'requesterName', 'partsTable', 'consumablesTable', 'historyTable'],
    onFleetWeeklyFuelReport: ['startDate', 'endDate', 'totalLiters', 'totalCost', 'avgCostPerLiter', 'avgEfficiency', 'consolidatedTable', 'fuelListTelegram'],
    onFleetAlertsSummary: ['totalAlerts', 'outOfServiceCount', 'mechanicalAlertsCount', 'legalAlertsCount', 'alertsTable', 'alertsListTelegram'],
    onDeliveryUpdate: ['docNumero', 'clienteNombre', 'estadoLabel', 'estadoColor', 'estadoBg', 'tipoDoc', 'canal', 'gestionadoPor', 'comentario', 'infoEnvio', 'linesHtml', 'productosHtml', 'icon'],
    onAssetAssigned: ['assigneeName', 'assigneeId', 'category', 'brand', 'model', 'serialNumber', 'assignedDate', 'assignedBy', 'notes'],
    onCollectAssigned: ['consecutivo', 'proveedor', 'ordenCompra', 'factura', 'solicitanteNombre', 'choferNombre', 'rutaNombre', 'vehiculoPlaca', 'lugarEntrega', 'metodoPago', 'horarioProveedor', 'contactoNombre', 'contactoTelefono', 'whatsappLink'],
    onCollectUpdate: ['consecutivo', 'proveedor', 'ordenCompra', 'factura', 'solicitanteNombre', 'choferNombre', 'rutaNombre', 'vehiculoPlaca', 'lugarEntrega', 'metodoPago', 'horarioProveedor', 'contactoNombre', 'contactoTelefono', 'whatsappLink', 'estadoLabel', 'comentarioChofer'],
    onDeliveryRetry: ['documento_numero', 'cliente_nombre', 'cliente_id', 'lugar_entrega', 'contacto_nombre', 'contacto_telefono', 'fecha', 'ruta_nombre', 'chofer_nombre', 'chofer_id', 'motivo_devolucion'],
    onDeliveryPartial: ['documento_numero', 'cliente_nombre', 'cliente_id', 'lugar_entrega', 'contacto_nombre', 'contacto_telefono', 'fecha', 'ruta_nombre', 'chofer_nombre', 'chofer_id', 'motivo_incompleto'],
};

function interpretCronExpression(cron: string): string {
    if (!cron) return 'Expresión vacía';
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
        return 'Expresión inválida (debe tener exactamente 5 campos)';
    }

    const [min, hour, dom, month, dow] = parts;

    // Helper to convert 24h format to 12h AM/PM
    const formatTime = (hStr: string, mStr: string): string => {
        let h = parseInt(hStr, 10);
        let m = parseInt(mStr, 10);
        if (isNaN(h) || isNaN(m)) return `${hStr}:${mStr}`;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const formattedHour = h % 12 === 0 ? 12 : h % 12;
        const formattedMinute = m < 10 ? `0${m}` : m;
        return `${formattedHour}:${formattedMinute} ${ampm}`;
    };

    const daysOfWeekEs: Record<string, string> = {
        '0': 'domingo', '7': 'domingo',
        '1': 'lunes', '2': 'martes', '3': 'miércoles', '4': 'jueves', '5': 'viernes', '6': 'sábado',
        'SUN': 'domingo', 'MON': 'lunes', 'TUE': 'martes', 'WED': 'miércoles', 'THU': 'jueves', 'FRI': 'viernes', 'SAT': 'sábado'
    };

    const monthsEs: Record<string, string> = {
        '1': 'enero', '2': 'febrero', '3': 'marzo', '4': 'abril', '5': 'mayo', '6': 'junio',
        '7': 'julio', '8': 'agosto', '9': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre'
    };

    // Case 1: Minutes interval: */X * * * *
    if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
        const mins = min.replace('*/', '');
        return `Cada ${mins} minutos`;
    }

    // Case 2: Hours interval: 0 */X * * *
    if (min === '0' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
        const hrs = hour.replace('*/', '');
        return `Cada ${hrs} ${hrs === '1' ? 'hora' : 'horas'}`;
    }

    // Case 3: Monthly: M H D * *
    if (dom !== '*' && month === '*' && dow === '*') {
        const hourNum = parseInt(hour, 10);
        const minNum = parseInt(min, 10);
        if (!isNaN(hourNum) && !isNaN(minNum)) {
            const timeStr = formatTime(hour, min);
            return `El día ${dom} de cada mes a las ${timeStr}`;
        }
    }

    // Case 4: Weekly: M H * * D
    if (dow !== '*' && dom === '*' && month === '*') {
        const hourNum = parseInt(hour, 10);
        const minNum = parseInt(min, 10);
        if (!isNaN(hourNum) && !isNaN(minNum)) {
            const timeStr = formatTime(hour, min);
            const days = dow.split(',').map(d => daysOfWeekEs[d.toUpperCase()] || d).join(', ');
            if (dow.includes('-')) {
                const [start, end] = dow.split('-');
                const startDay = daysOfWeekEs[start] || start;
                const endDay = daysOfWeekEs[end] || end;
                return `De ${startDay} a ${endDay} a las ${timeStr}`;
            }
            return `Todos los ${days} a las ${timeStr}`;
        }
    }

    // Case 5: Daily: M H * * *
    if (dom === '*' && month === '*' && dow === '*') {
        const hourNum = parseInt(hour, 10);
        const minNum = parseInt(min, 10);
        if (!isNaN(hourNum) && !isNaN(minNum)) {
            const timeStr = formatTime(hour, min);
            return `Todos los días a las ${timeStr}`;
        }
    }

    // Generic fallback interpreter for other patterns
    let interpretation = '';
    
    // Time explanation
    if (hour === '*' && min === '*') {
        interpretation += 'Cada minuto';
    } else if (hour === '*') {
        interpretation += `En el minuto ${min} de cada hora`;
    } else if (min.startsWith('*/')) {
        const mins = min.replace('*/', '');
        interpretation += `Cada ${mins} minutos a las horas [${hour}]`;
    } else {
        const hourParts = hour.split(',');
        const minParts = min.split(',');
        if (hourParts.length === 1 && minParts.length === 1) {
            interpretation += `A las ${formatTime(hour, min)}`;
        } else {
            interpretation += `A los minutos [${min}] de las horas [${hour}]`;
        }
    }

    // Day of Month explanation
    if (dom !== '*') {
        interpretation += `, el día ${dom} del mes`;
    }

    // Month explanation
    if (month !== '*') {
        const months = month.split(',').map(m => monthsEs[m] || m).join(', ');
        interpretation += `, en ${months}`;
    }

    // Day of Week explanation
    if (dow !== '*') {
        const days = dow.split(',').map(d => daysOfWeekEs[d.toUpperCase()] || d).join(', ');
        if (dow.includes('-')) {
            const [start, end] = dow.split('-');
            const startDay = daysOfWeekEs[start] || start;
            const endDay = daysOfWeekEs[end] || end;
            interpretation += `, de ${startDay} a ${endDay}`;
        } else {
            interpretation += `, los ${days}`;
        }
    } else if (dom === '*') {
        interpretation += ', todos los días';
    }

    return interpretation;
}

const mapBotStepLabel = (step: string | null) => {
    if (!step) return 'Inicio / Menú';
    const mappings: { [key: string]: string } = {
        'fuel_plate': 'Ingresando Placa',
        'fuel_liters': 'Ingresando Litros',
        'fuel_odometer': 'Ingresando Odómetro',
        'fuel_cost': 'Ingresando Costo Real',
        'fuel_photo': 'Subiendo Foto de Ticket',
        'fuel_confirm': 'Esperando Confirmación',
        'maint_plate': 'Ingresando Placa',
        'maint_odometer': 'Ingresando Odómetro',
        'maint_type': 'Seleccionando Tipo de Trabajo',
        'maint_cost': 'Ingresando Costo de Trabajo',
        'maint_performer': 'Ingresando Taller/Mecánico',
        'maint_description': 'Ingresando Descripción',
        'maint_photo': 'Subiendo Foto de Comprobante',
        'maint_confirm': 'Esperando Confirmación'
    };
    return mappings[step] || step;
};

export default function AutomationManagerPage() {
    const { isAuthorized } = useAuthorization(['admin:settings:automations']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [rules, setRules] = useState<NotificationRule[]>([]);
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
    const [telegramSettings, setTelegramSettings] = useState<any>({ botToken: '', chatId: '' });
    
    // States for Telegram Bot Control Panel
    const [linkages, setLinkages] = useState<any[]>([]);
    const [activeBotStates, setActiveBotStates] = useState<any[]>([]);
    const [photoSettings, setPhotoSettings] = useState({ requirePhotoFuel: false, requirePhotoMaintenance: false });
    const [activeEmployees, setActiveEmployees] = useState<any[]>([]);
    const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [manualChatId, setManualChatId] = useState('');
    const [manualUsername, setManualUsername] = useState('');

    const filteredEmployees = useMemo(() => {
        return (activeEmployees || []).filter(emp => {
            if (showInactiveEmployees) return true;
            return emp.active === 'S';
        });
    }, [activeEmployees, showInactiveEmployees]);
    const [isPairingDialogOpen, setPairingDialogOpen] = useState(false);
    const [isSyncingWebhook, setIsSyncingWebhook] = useState(false);
    const [isDeletingWebhook, setIsDeletingWebhook] = useState(false);
    const [generatedCode, setGeneratedCode] = useState('');
    const [generatedCodeEmployeeId, setGeneratedCodeEmployeeId] = useState('');
    const [selectedBotId, setSelectedBotId] = useState<'fleet'>('fleet');

    const [isRuleDialogOpen, setRuleDialogOpen] = useState(false);
    const [isTaskDialogOpen, setTaskDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTestingTelegram, setIsTestingTelegram] = useState(false);
    const [isTestingRule, setIsTestingRule] = useState<number | null>(null);
    const [isFetchingChatId, setIsFetchingChatId] = useState(false);

    const [currentRule, setCurrentRule] = useState<Partial<NotificationRule>>({
        name: '', event: 'onFleetMaintenanceDue', action: 'sendEmail', recipients: [], enabled: true
    });
    const [currentTask, setCurrentTask] = useState<Partial<ScheduledTask>>({
        name: '', schedule: '0 8 * * *', taskId: 'fleet-audit', enabled: true
    });

    // AI Settings States
    const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
    const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
    const [aiConnectionStatus, setAiConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);
    const [isSavingAi, setIsSavingAi] = useState(false);

    // States for Cron Visual Builder
    const [cronMode, setCronMode] = useState<'visual' | 'manual'>('visual');
    const [freqType, setFreqType] = useState<'daily' | 'weekly' | 'monthly' | 'minutes' | 'hours'>('daily');
    const [visualHour, setVisualHour] = useState('08');
    const [visualMinute, setVisualMinute] = useState('00');
    const [visualDayOfWeek, setVisualDayOfWeek] = useState('1'); // Lunes (1)
    const [visualDayOfMonth, setVisualDayOfMonth] = useState('1');
    const [visualInterval, setVisualInterval] = useState('15');

    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
    const [isPreviewOpen, setPreviewOpen] = useState(false);

    const fetchTelegramBotData = useCallback(async () => {
        try {
            const [linkagesData, statesData, settingsData, employeesData] = await Promise.all([
                getAllLinkagesAction(),
                getActiveBotStatesAction(),
                getTelegramBotSettingsAction(),
                getAllEmployeesAction()
            ]);
            setLinkages(linkagesData);
            setActiveBotStates(statesData);
            setPhotoSettings(settingsData);
            setActiveEmployees(employeesData || []);
        } catch (error) {
            console.error("Error fetching telegram bot data:", error);
        }
    }, []);

    const handleSyncWebhook = async () => {
        setIsSyncingWebhook(true);
        try {
            const res = await setupTelegramWebhookAction();
            if (res.success) {
                toast({ title: 'Éxito', description: res.message });
            } else {
                toast({ title: 'Error', description: res.message, variant: 'destructive' });
            }
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'No se pudo sincronizar el webhook.', variant: 'destructive' });
        } finally {
            setIsSyncingWebhook(false);
            fetchTelegramBotData();
        }
    };

    const handleDeleteWebhook = async () => {
        setIsDeletingWebhook(true);
        try {
            const res = await deleteTelegramWebhookAction();
            if (res.success) {
                toast({ title: 'Éxito', description: res.message });
                setTelegramSettings({ botToken: '', chatId: '' });
            } else {
                toast({ title: 'Error', description: res.message, variant: 'destructive' });
            }
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'No se pudo eliminar el webhook.', variant: 'destructive' });
        } finally {
            setIsDeletingWebhook(false);
            fetchTelegramBotData();
        }
    };

    const handleTogglePhoto = async (key: 'requirePhotoFuel' | 'requirePhotoMaintenance', currentVal: boolean) => {
        try {
            await updateTelegramBotSettingAction(key, !currentVal);
            toast({ title: 'Configuración actualizada', description: 'El requerimiento de foto fue guardado.' });
            fetchTelegramBotData();
        } catch (error: any) {
            toast({ title: 'Error', description: 'No se pudo actualizar el requerimiento.', variant: 'destructive' });
        }
    };

    const handleGenerateCode = async (employeeId: string) => {
        try {
            const code = await generateActivationCodeAction(employeeId);
            setGeneratedCode(code);
            setGeneratedCodeEmployeeId(employeeId);
            toast({ title: 'Código Generado', description: `Código para vincular: ${code}. El empleado debe enviar /vincular ${code} en el Bot.` });
            fetchTelegramBotData();
        } catch (error: any) {
            toast({ title: 'Error', description: 'No se pudo generar el código.', variant: 'destructive' });
        }
    };

    const handleManualLink = async () => {
        if (!selectedEmployeeId || !manualChatId) {
            toast({ title: 'Error', description: 'Debe seleccionar un empleado e ingresar el Chat ID.', variant: 'destructive' });
            return;
        }
        setIsSaving(true);
        try {
            await linkTelegramManuallyAction(selectedEmployeeId, manualChatId, manualUsername);
            toast({ title: 'Éxito', description: 'Empleado vinculado manualmente.' });
            setPairingDialogOpen(false);
            setSelectedEmployeeId('');
            setManualChatId('');
            setManualUsername('');
            fetchTelegramBotData();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'No se pudo vincular.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleUnlink = async (id: number) => {
        if (!confirm('¿Está seguro de que desea eliminar esta vinculación? El usuario ya no podrá registrar datos con el bot.')) return;
        try {
            await unlinkTelegramAction(id);
            toast({ title: 'Éxito', description: 'Vinculación eliminada con éxito.' });
            fetchTelegramBotData();
        } catch (error: any) {
            toast({ title: 'Error', description: 'No se pudo eliminar la vinculación.', variant: 'destructive' });
        }
    };

    const handleClearState = async (chatId: string) => {
        try {
            await clearBotStateAction(chatId);
            toast({ title: 'Éxito', description: 'Conversación de Telegram reiniciada.' });
            fetchTelegramBotData();
        } catch (error: any) {
            toast({ title: 'Error', description: 'No se pudo limpiar la conversación.', variant: 'destructive' });
        }
    };

    const handleToggleAiActive = (checked: boolean) => {
        if (!aiSettings) return;
        setAiSettings({ ...aiSettings, aiEnabled: checked ? 1 : 0 });
    };

    const handleAiProviderChange = (val: string) => {
        if (!aiSettings) return;
        setAiSettings({ ...aiSettings, provider: val });
        setAiConnectionStatus(null);
    };

    const handleAiSettingChange = (id: keyof AiSettings, value: string) => {
        if (!aiSettings) return;
        setAiSettings({ ...aiSettings, [id]: value });
    };

    const handleTestAiConnection = async () => {
        if (!aiSettings) return;
        setIsTestingAiConnection(true);
        setAiConnectionStatus(null);
        try {
            const res = await testAiConnection(aiSettings.provider as 'ollama' | 'gemini' | 'deepseek', {
                ollamaHost: aiSettings.ollamaHost,
                ollamaModel: aiSettings.ollamaModel,
                geminiApiKey: aiSettings.geminiApiKey,
                geminiModel: aiSettings.geminiModel,
                deepseekApiKey: aiSettings.deepseekApiKey,
                deepseekModel: aiSettings.deepseekModel,
            });
            setAiConnectionStatus(res);
            toast({
                title: res.success ? 'Conexión Exitosa' : 'Error de Conexión',
                description: res.message,
                variant: res.success ? 'default' : 'destructive'
            });
        } catch (err: any) {
            setAiConnectionStatus({ success: false, message: err.message });
        } finally {
            setIsTestingAiConnection(false);
        }
    };

    const handleSaveAiSettings = async () => {
        if (!aiSettings) return;
        setIsSavingAi(true);
        try {
            await saveAiSettings(aiSettings);
            toast({
                title: 'Configuración Guardada',
                description: 'Los parámetros del Asistente de IA se han actualizado correctamente.',
            });
            fetchData();
        } catch (err: any) {
            toast({
                title: 'Error al Guardar',
                description: err.message,
                variant: 'destructive'
            });
        } finally {
            setIsSavingAi(false);
        }
    };

    const handleTogglePermission = async (
        linkId: number,
        permissionKey: 'allowFuel' | 'allowMaintenance' | 'allowDeliveries' | 'allowWarehouse',
        currentValue: boolean
    ) => {
        const link = linkages.find(l => l.id === linkId);
        if (!link) return;

        const permissions = {
            allowFuel: link.allowFuel !== 0,
            allowMaintenance: link.allowMaintenance !== 0,
            allowDeliveries: link.allowDeliveries !== 0,
            allowWarehouse: link.allowWarehouse !== 0,
            [permissionKey]: !currentValue
        };

        try {
            await updateTelegramLinkagePermissionsAction(linkId, permissions);
            toast({ title: 'Permisos actualizados', description: 'Los accesos del bot fueron guardados.' });
            fetchTelegramBotData();
        } catch (error: any) {
            toast({ title: 'Error', description: 'No se pudieron guardar los permisos.', variant: 'destructive' });
        }
    };

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [rulesData, tasksData, settings, templatesData, aiSettingsData] = await Promise.all([
                getAllNotificationRules(),
                getAllScheduledTasks(),
                getNotificationServiceSettings('telegram'),
                getAllNotificationTemplates(),
                getAiSettings()
            ]);
            setRules(rulesData);
            setTasks(tasksData);
            setTemplates(templatesData);
            if (settings) setTelegramSettings(settings);
            if (aiSettingsData) setAiSettings(aiSettingsData);
            
            // Sync telegram bot linkages and states
            await fetchTelegramBotData();

        } catch (error) {
            console.error(error);
            toast({ title: 'Error', description: 'No se pudieron cargar las automatizaciones.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
            setIsInitialLoading(false);
        }
    }, [toast, fetchTelegramBotData]);

    useEffect(() => {
        if (templates.length > 0 && !selectedTemplateId) {
            setSelectedTemplateId(templates[0].eventId);
            setEditingTemplate(templates[0]);
        }
    }, [templates, selectedTemplateId]);

    useEffect(() => {
        setTitle('Gestor de Automatizaciones');
        if (isAuthorized) fetchData();
    }, [isAuthorized, setTitle, fetchData]);

    const parseScheduleToVisual = (schedule: string) => {
        if (!schedule) return;
        const parts = schedule.trim().split(/\s+/);
        if (parts.length !== 5) {
            setCronMode('manual');
            return;
        }
        const [min, hour, dom, month, dow] = parts;

        // Check if it matches an interval of minutes: */X * * * *
        if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
            setCronMode('visual');
            setFreqType('minutes');
            setVisualInterval(min.replace('*/', ''));
            return;
        }

        // Check if it matches an interval of hours: 0 */X * * *
        if (min === '0' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
            setCronMode('visual');
            setFreqType('hours');
            setVisualInterval(hour.replace('*/', ''));
            return;
        }

        // Check if it matches monthly: M H D * *
        if (dom !== '*' && month === '*' && dow === '*') {
            const h = parseInt(hour, 10);
            const m = parseInt(min, 10);
            const d = parseInt(dom, 10);
            if (!isNaN(h) && !isNaN(m) && !isNaN(d)) {
                setCronMode('visual');
                setFreqType('monthly');
                setVisualHour(h < 10 ? `0${h}` : `${h}`);
                setVisualMinute(m < 10 ? `0${m}` : `${m}`);
                setVisualDayOfMonth(`${d}`);
                return;
            }
        }

        // Check if it matches weekly: M H * * D (e.g. single day or comma-separated days, or range)
        if (dow !== '*' && dom === '*' && month === '*') {
            const h = parseInt(hour, 10);
            const m = parseInt(min, 10);
            if (!isNaN(h) && !isNaN(m)) {
                setCronMode('visual');
                setFreqType('weekly');
                setVisualHour(h < 10 ? `0${h}` : `${h}`);
                setVisualMinute(m < 10 ? `0${m}` : `${m}`);
                setVisualDayOfWeek(dow);
                return;
            }
        }

        // Check if it matches daily: M H * * *
        if (dom === '*' && month === '*' && dow === '*') {
            const h = parseInt(hour, 10);
            const m = parseInt(min, 10);
            if (!isNaN(h) && !isNaN(m)) {
                setCronMode('visual');
                setFreqType('daily');
                setVisualHour(h < 10 ? `0${h}` : `${h}`);
                setVisualMinute(m < 10 ? `0${m}` : `${m}`);
                return;
            }
        }

        // Default fallback to manual mode
        setCronMode('manual');
    };

    // Parse schedule when task dialog opens
    useEffect(() => {
        if (isTaskDialogOpen) {
            parseScheduleToVisual(currentTask.schedule || '0 8 * * *');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTaskDialogOpen]);

    // Compile visual selections to Cron schedule
    useEffect(() => {
        if (cronMode === 'visual') {
            let compiledCron = '0 8 * * *';
            const h = parseInt(visualHour, 10);
            const m = parseInt(visualMinute, 10);
            
            switch (freqType) {
                case 'daily':
                    compiledCron = `${m} ${h} * * *`;
                    break;
                case 'weekly':
                    compiledCron = `${m} ${h} * * ${visualDayOfWeek}`;
                    break;
                case 'monthly':
                    compiledCron = `${m} ${h} ${visualDayOfMonth} * *`;
                    break;
                case 'minutes':
                    compiledCron = `*/${visualInterval} * * * *`;
                    break;
                case 'hours':
                    compiledCron = `0 */${visualInterval} * * *`;
                    break;
            }
            if (currentTask.schedule !== compiledCron) {
                setCurrentTask(prev => ({ ...prev, schedule: compiledCron }));
            }
        }
    }, [cronMode, freqType, visualHour, visualMinute, visualDayOfWeek, visualDayOfMonth, visualInterval, currentTask.schedule]);

    const handleSaveRule = async () => {
        if (!currentRule.name || !currentRule.event) return;
        setIsSaving(true);
        try {
            await saveNotificationRule(currentRule as NotificationRule);
            toast({ title: 'Regla Guardada' });
            fetchData();
            setRuleDialogOpen(false);
        } catch (error) {
            console.error(error);
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestRuleAction = async (ruleId: number) => {
        setIsTestingRule(ruleId);
        try {
            const res = await testNotificationRule(ruleId);
            toast({ title: 'Info', description: res.message });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsTestingRule(null);
        }
    };

    const handleSaveTask = async () => {
        if (!currentTask.name || !currentTask.schedule) return;
        setIsSaving(true);
        try {
            await saveScheduledTask(currentTask as ScheduledTask);
            toast({ title: 'Tarea Programada Guardada' });
            fetchData();
            setTaskDialogOpen(false);
        } catch (error) {
            console.error(error);
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveTelegram = async () => {
        setIsSaving(true);
        try {
            await saveNotificationServiceSettings('telegram', telegramSettings);
            toast({ title: 'Configuración de Telegram Guardada' });
        } catch (error) {
            console.error(error);
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestTelegram = async () => {
        if (!telegramSettings?.botToken || !telegramSettings?.chatId) {
            toast({ title: "Faltan datos", description: "Configura el token y el ID antes de probar.", variant: "destructive" });
            return;
        }
        setIsTestingTelegram(true);
        try {
            const res = await testTelegram(telegramSettings.chatId);
            if (res.success) {
                toast({ title: "Mensaje Enviado", description: "Revisa tu aplicación de Telegram." });
            } else {
                throw new Error(res.message);
            }
        } catch (error: any) {
            toast({ title: "Error en Telegram", description: error.message, variant: "destructive" });
        } finally {
            setIsTestingTelegram(false);
        }
    };

    const handleFetchChatId = async () => {
        setIsFetchingChatId(true);
        try {
            const res = await fetchTelegramChatId();
            if (res.success) {
                setTelegramSettings({ ...telegramSettings, chatId: res.id! });
                toast({ title: "Chat Detectado", description: `Se encontró: ${res.name}` });
            } else {
                toast({ title: "Búsqueda Fallida", description: res.error, variant: "destructive" });
            }
        } catch (error: any) {
            toast({ title: "Búsqueda Fallida", description: error.message, variant: "destructive" });
        } finally {
            setIsFetchingChatId(false);
        }
    };

    const handleSelectTemplate = (id: string) => {
        const t = templates.find(temp => temp.eventId === id);
        if (t) {
            setSelectedTemplateId(id);
            setEditingTemplate({ ...t });
        }
    };

    const handleSaveTemplate = async () => {
        if (!editingTemplate) return;
        setIsSaving(true);
        try {
            await saveNotificationTemplate(editingTemplate);
            toast({ title: "Plantilla Actualizada" });
            setTemplates(prev => prev.map(t => t.eventId === editingTemplate.eventId ? editingTemplate : t));
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    if (!isAuthorized) return null;
    if (isInitialLoading) return <main className="flex-1 p-8"><Skeleton className="h-96 w-full" /></main>;

    return (
        <TooltipProvider>
            <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Automatizaciones y Alertas</h1>
                        <p className="text-muted-foreground text-sm">Gestiona el motor de eventos, plantillas y tareas programadas de la plataforma.</p>
                    </div>
                </div>

                <Tabs defaultValue="scheduled">
                    <TabsList className="grid w-full grid-cols-6">
                        <TabsTrigger value="scheduled" className="flex gap-2"><Clock className="h-4 w-4" /> Tareas Cron</TabsTrigger>
                        <TabsTrigger value="rules" className="flex gap-2"><BellRing className="h-4 w-4" /> Reglas de Envío</TabsTrigger>
                        <TabsTrigger value="templates" className="flex gap-2 text-primary font-black uppercase tracking-tighter"><LayoutTemplate className="h-4 w-4" /> Diseño Mensajes</TabsTrigger>
                        <TabsTrigger value="services" className="flex gap-2"><Send className="h-4 w-4" /> Servicios Externos</TabsTrigger>
                        <TabsTrigger value="telegram-bot" className="flex gap-2"><Bot className="h-4 w-4" /> Bot Telegram</TabsTrigger>
                        <TabsTrigger value="ai-copilot" className="flex gap-2"><Sparkles className="h-4 w-4" /> Asistente IA</TabsTrigger>
                    </TabsList>

                    <TabsContent value="rules" className="space-y-4 pt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Reglas de Notificación</CardTitle>
                                    <CardDescription>Define qué eventos disparan alertas por Email o Telegram.</CardDescription>
                                </div>
                                <Button onClick={() => { setCurrentRule({ name: '', event: 'onFleetMaintenanceDue', action: 'sendEmail', recipients: [], enabled: true }); setRuleDialogOpen(true); }}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Nueva Regla
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nombre</TableHead>
                                            <TableHead>Evento</TableHead>
                                            <TableHead>Acción</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rules.map(rule => (
                                            <TableRow key={rule.id}>
                                                <TableCell className="font-bold">{rule.name}</TableCell>
                                                <TableCell><Badge variant="outline">{eventLabels[rule.event] || rule.event}</Badge></TableCell>
                                                <TableCell className="capitalize">
                                                    <div className="flex items-center gap-2">
                                                        {rule.action === 'sendEmail' ? <Mail className="h-3 w-3" /> : <Send className="h-3 w-3 text-blue-500" />}
                                                        {rule.action === 'sendEmail' ? 'Email' : 'Telegram'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Switch checked={rule.enabled} onCheckedChange={() => saveNotificationRule({ ...rule, enabled: !rule.enabled }).then(fetchData)} />
                                                </TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950" 
                                                        disabled={isTestingRule !== null}
                                                        onClick={() => handleTestRuleAction(rule.id)}
                                                        title="Ejecutar regla manualmente (Prueba)"
                                                    >
                                                        {isTestingRule === rule.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Play className="h-4 w-4 fill-current" />
                                                        )}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setCurrentRule(rule); setRuleDialogOpen(true); }}><Edit className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteNotificationRule(rule.id).then(fetchData)}><Trash2 className="h-4 w-4" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="templates" className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                            <Card className="lg:col-span-1 border-primary/20">
                                <CardHeader className="p-4 border-b bg-primary/5">
                                    <CardTitle className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                                        <BellRing className="h-4 w-4 text-primary" /> Eventos Disponibles
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <ScrollArea className="h-[600px]">
                                        <div className="divide-y">
                                            {templates.map((temp) => (
                                                <div 
                                                    key={temp.eventId} 
                                                    onClick={() => handleSelectTemplate(temp.eventId)}
                                                    className={cn(
                                                        "p-4 cursor-pointer transition-colors hover:bg-muted group flex items-center justify-between",
                                                        selectedTemplateId === temp.eventId ? "bg-primary/10 border-l-4 border-primary" : "border-l-4 border-transparent"
                                                    )}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className={cn("text-xs font-bold truncate", selectedTemplateId === temp.eventId && "text-primary")}>
                                                            {eventLabels[temp.eventId] || temp.eventId}
                                                        </p>
                                                        <p className="text-[9px] font-mono text-muted-foreground uppercase">{temp.eventId}</p>
                                                    </div>
                                                    <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>

                            <div className="lg:col-span-3 space-y-6">
                                {editingTemplate ? (
                                    <div className="space-y-6">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/30 p-4 rounded-xl border">
                                            <div>
                                                <h3 className="text-lg font-black text-primary uppercase tracking-tighter">Editor de Formato</h3>
                                                <p className="text-xs text-muted-foreground">Personaliza el diseño visual de: <strong>{eventLabels[editingTemplate.eventId]}</strong></p>
                                            </div>
                                            <div className="flex gap-2">
                                                <Dialog open={isPreviewOpen} onOpenChange={setPreviewOpen}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" size="sm" className="h-9">
                                                            <Eye className="h-4 w-4 mr-2" /> Previsualizar
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="sm:max-w-3xl h-[80vh] flex flex-col p-0">
                                                        <DialogHeader className="p-6 border-b"><DialogTitle>Vista Previa HTML</DialogTitle></DialogHeader>
                                                        <div className="flex-1 bg-white p-8 overflow-auto">
                                                            <div dangerouslySetInnerHTML={{ __html: editingTemplate.body }} />
                                                        </div>
                                                        <DialogFooter className="p-4 border-t bg-muted/10">
                                                            <DialogClose asChild><Button variant="ghost">Cerrar</Button></DialogClose>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>
                                                <Button onClick={handleSaveTemplate} size="sm" disabled={isSaving} className="h-9 px-6 font-bold shadow-md">
                                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                                    Guardar Plantilla
                                                </Button>
                                            </div>
                                        </div>

                                        <Tabs defaultValue="email">
                                            <TabsList className="bg-muted w-fit mb-4">
                                                <TabsTrigger value="email" className="flex gap-2"><Mail className="h-3 w-3" /> Correo Electrónico</TabsTrigger>
                                                <TabsTrigger value="telegram" className="flex gap-2"><Send className="h-3 w-3" /> Telegram Bot</TabsTrigger>
                                                <TabsTrigger value="internal" className="flex gap-2"><BellRing className="h-3 w-3" /> Notif. Interna</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="email" className="space-y-6">
                                                <Card>
                                                    <CardContent className="pt-6 space-y-4">
                                                        <div className="space-y-2">
                                                            <Label className="text-xs font-black uppercase">Asunto del Correo</Label>
                                                            <Input 
                                                                value={editingTemplate.subject} 
                                                                onChange={e => setEditingTemplate({...editingTemplate, subject: e.target.value})} 
                                                                className="font-bold"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-xs font-black uppercase">Cuerpo del Mensaje (HTML)</Label>
                                                            <Textarea 
                                                                value={editingTemplate.body} 
                                                                onChange={e => setEditingTemplate({...editingTemplate, body: e.target.value})} 
                                                                rows={15}
                                                                className="font-mono text-xs leading-relaxed bg-slate-950 text-emerald-400 p-6"
                                                            />
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            </TabsContent>

                                            <TabsContent value="telegram">
                                                <Card>
                                                    <CardContent className="pt-6 space-y-4">
                                                        <div className="space-y-2">
                                                            <Label className="text-xs font-black uppercase">Formato de Texto Telegram (HTML Parse Mode)</Label>
                                                            <Textarea 
                                                                value={editingTemplate.telegram} 
                                                                onChange={e => setEditingTemplate({...editingTemplate, telegram: e.target.value})} 
                                                                rows={10}
                                                                className="font-mono text-xs bg-slate-950 text-blue-300 p-6"
                                                            />
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            </TabsContent>

                                            <TabsContent value="internal">
                                                <Card>
                                                    <CardContent className="pt-6 space-y-4">
                                                        <div className="space-y-2">
                                                            <Label className="text-xs font-black uppercase">Texto Corto (Campana)</Label>
                                                            <Input 
                                                                value={editingTemplate.internal} 
                                                                onChange={e => setEditingTemplate({...editingTemplate, internal: e.target.value})} 
                                                            />
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            </TabsContent>
                                        </Tabs>

                                        <Card className="bg-primary/5 border-primary/20">
                                            <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
                                                <Info className="h-4 w-4 text-primary" />
                                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Variables Dinámicas Disponibles</CardTitle>
                                            </CardHeader>
                                            <CardContent className="py-2 px-4 flex flex-wrap gap-2">
                                                {eventVariables[editingTemplate.eventId]?.map(variable => (
                                                    <code 
                                                        key={variable}
                                                        className="text-[10px] bg-white border px-1.5 py-0.5 rounded cursor-copy hover:bg-primary hover:text-white transition-colors"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(`{{${variable}}}`);
                                                            toast({ title: "Copiado", description: `{{${variable}}} copiado.`, duration: 1000 });
                                                        }}
                                                    >
                                                        {`{{${variable}}}`}
                                                    </code>
                                                ))}
                                            </CardContent>
                                        </Card>
                                    </div>
                                ) : (
                                    <div className="h-[70vh] flex flex-col items-center justify-center border-2 border-dashed rounded-3xl opacity-30">
                                        <LayoutTemplate className="h-20 w-20 mb-4" />
                                        <p className="font-bold">Selecciona una plantilla para empezar a diseñar.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="scheduled" className="space-y-4 pt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Sincronización y Tareas Cron</CardTitle>
                                    <CardDescription>Gestiona procesos que corren automáticamente (ej: Vigilante de Vencimientos).</CardDescription>
                                </div>
                                <Button variant="outline" onClick={() => { setCurrentTask({ name: '', schedule: '0 8 * * *', taskId: 'fleet-audit', enabled: true }); setTaskDialogOpen(true); }}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Tarea
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tarea</TableHead>
                                            <TableHead>Frecuencia (Cron)</TableHead>
                                            <TableHead>Función</TableHead>
                                            <TableHead>Habilitada</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {tasks.map(task => (
                                            <TableRow key={task.id}>
                                                <TableCell className="font-bold">{task.name}</TableCell>
                                                <TableCell className="font-mono text-xs">{task.schedule}</TableCell>
                                                <TableCell><Badge variant="secondary">{task.taskId}</Badge></TableCell>
                                                <TableCell>
                                                    <Switch checked={task.enabled} onCheckedChange={() => saveScheduledTask({ ...task, enabled: !task.enabled }).then(fetchData)} />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => { setCurrentTask(task); setTaskDialogOpen(true); }}><Edit className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteScheduledTask(task.id).then(fetchData)}><Trash2 className="h-4 w-4" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="services" className="space-y-6 pt-4">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-4">
                                    <Send className="h-8 w-8 text-blue-500" />
                                    <div>
                                        <CardTitle>Telegram Bot API</CardTitle>
                                        <CardDescription>Configura tu bot para enviar alertas instantáneas a grupos o canales.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Bot API Token</Label>
                                        <Input 
                                            type="password" 
                                            value={telegramSettings?.botToken || ''} 
                                            onChange={e => setTelegramSettings({...telegramSettings!, botToken: e.target.value})} 
                                            placeholder="123456:ABC-DEF..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Chat ID Predeterminado</Label>
                                        <div className="flex gap-2">
                                            <Input 
                                                value={telegramSettings?.chatId || ''} 
                                                onChange={e => setTelegramSettings({...telegramSettings!, chatId: e.target.value})} 
                                                placeholder="-100..."
                                                className="flex-1"
                                            />
                                            <Button variant="secondary" size="sm" onClick={handleFetchChatId} disabled={isFetchingChatId}>
                                                {isFetchingChatId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-between border-t p-6">
                                <Button variant="outline" onClick={handleTestTelegram} disabled={isTestingTelegram}>
                                    {isTestingTelegram ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                    Probar Conexión
                                </Button>
                                <Button onClick={handleSaveTelegram} disabled={isSaving}>
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                    Guardar Configuración
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="telegram-bot" className="space-y-6 pt-4">
                        {/* SELECTOR DE BOTS MULTIFUNCIONAL */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Bot General (Activo) */}
                            <Card className={cn(
                                "border-2 relative overflow-hidden transition-all duration-300 hover:shadow-lg",
                                selectedBotId === 'fleet' ? "border-primary/50 bg-primary/5" : "border-border"
                            )}>
                                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Activo
                                </div>
                                <CardHeader>
                                    <Bot className="h-10 w-10 text-primary mb-2" />
                                    <CardTitle className="text-lg">Bot General</CardTitle>
                                    <CardDescription>
                                        Asistente inteligente unificado. Choferes, mecánicos y operarios gestionan repostajes, mantenimientos, entregas y consultas de almacén desde un único chat.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Button 
                                        size="sm" 
                                        variant={selectedBotId === 'fleet' ? 'default' : 'outline'} 
                                        className="w-full text-xs font-semibold"
                                        onClick={() => setSelectedBotId('fleet')}
                                    >
                                        Gestionar Bot
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* Bot de Soporte (Próximamente) */}
                            <Card className="border border-dashed relative overflow-hidden opacity-70 bg-muted/40 hover:opacity-85 transition-opacity duration-300">
                                <div className="absolute top-3 right-3 bg-blue-500/15 text-blue-600 dark:text-blue-400 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                                    Diseño
                                </div>
                                <CardHeader>
                                    <Smartphone className="h-10 w-10 text-blue-500 mb-2" />
                                    <CardTitle className="text-lg">Bot de Soporte</CardTitle>
                                    <CardDescription>
                                        Asistente inteligente para que conductores reporten incidentes, siniestros y soliciten auxilio vial.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Button size="sm" variant="secondary" className="w-full text-xs" disabled>
                                        Próximamente
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* Bot de Operaciones (Próximamente) */}
                            <Card className="border border-dashed relative overflow-hidden opacity-70 bg-muted/40 hover:opacity-85 transition-opacity duration-300">
                                <div className="absolute top-3 right-3 bg-violet-500/15 text-violet-600 dark:text-violet-400 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                                    Próximamente
                                </div>
                                <CardHeader>
                                    <Send className="h-10 w-10 text-violet-500 mb-2" />
                                    <CardTitle className="text-lg">Bot de Operaciones</CardTitle>
                                    <CardDescription>
                                        Envío directo de alertas críticas, resúmenes mecánicos y recordatorios de RTV a directores.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Button size="sm" variant="secondary" className="w-full text-xs" disabled>
                                        Próximamente
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>

                        {selectedBotId === 'fleet' && (
                            <div className="space-y-6">
                                {/* Fila 1: Estado Webhook y Requerimiento de Fotos */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card className="lg:col-span-2">
                                        <CardHeader>
                                            <CardTitle className="text-md flex items-center gap-2">
                                                <Bot className="h-5 w-5 text-primary" />
                                                Servicio del Bot General
                                            </CardTitle>
                                            <CardDescription>
                                                Sincroniza y valida la conexión en tiempo real con el API de Telegram.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="p-3 bg-muted/50 rounded-lg flex items-center justify-between gap-4">
                                                <div className="space-y-1">
                                                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider block">Token del Bot Configurado</span>
                                                    <p className="font-mono text-xs font-semibold truncate max-w-[320px]">
                                                        {telegramSettings?.botToken ? `${telegramSettings.botToken.substring(0, 10)}...${telegramSettings.botToken.substring(telegramSettings.botToken.length - 8)}` : '❌ No configurado en Servicios Externos'}
                                                    </p>
                                                </div>
                                                <Badge variant={telegramSettings?.botToken ? 'default' : 'destructive'} className={cn("text-[10px] font-bold uppercase border", telegramSettings?.botToken ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "")}>
                                                    {telegramSettings?.botToken ? 'Configurado' : 'Sin Token'}
                                                </Badge>
                                            </div>
                                            
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                Para que el Bot de Telegram pueda recibir las interacciones de los mecánicos y choferes de forma instantánea, debe registrar su URL pública ante los servidores oficiales de Telegram.
                                            </p>
                                        </CardContent>
                                        <CardFooter className="bg-muted/20 border-t flex flex-col sm:flex-row justify-between items-center gap-4 p-4">
                                            <div className="text-[10px] text-muted-foreground italic text-center sm:text-left">
                                                * Desvincular detendrá la recepción de mensajes del bot actual.
                                            </div>
                                            <div className="flex flex-wrap gap-2 justify-center sm:justify-end w-full sm:w-auto">
                                                {telegramSettings?.botToken && (
                                                    <Button 
                                                        onClick={handleDeleteWebhook} 
                                                        disabled={isDeletingWebhook || isSyncingWebhook}
                                                        variant="destructive"
                                                        className="font-semibold text-xs flex gap-2"
                                                    >
                                                        {isDeletingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                        Eliminar Webhook
                                                    </Button>
                                                )}
                                                <Button 
                                                    onClick={handleSyncWebhook} 
                                                    disabled={isSyncingWebhook || isDeletingWebhook || !telegramSettings?.botToken} 
                                                    className="font-semibold text-xs flex gap-2"
                                                >
                                                    {isSyncingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                                    Sincronizar Webhook con Telegram
                                                </Button>
                                            </div>
                                        </CardFooter>
                                    </Card>

                                    {/* Configuración de Fotos */}
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-md flex items-center gap-2">
                                                <Smartphone className="h-5 w-5 text-primary" />
                                                Fotos Obligatorias
                                            </CardTitle>
                                            <CardDescription>
                                                Define si el bot requiere obligatoriamente una foto para autorizar el registro.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {/* Repostajes */}
                                            <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg border border-border">
                                                <div className="space-y-0.5">
                                                    <Label className="text-sm font-bold">⛽ Repostajes</Label>
                                                    <span className="text-[10px] text-muted-foreground block">Foto del ticket de combustible</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black uppercase text-muted-foreground mr-1">
                                                        {photoSettings.requirePhotoFuel ? 'Oblig' : 'Opcional'}
                                                    </span>
                                                    <Switch 
                                                        checked={photoSettings.requirePhotoFuel} 
                                                        onCheckedChange={() => handleTogglePhoto('requirePhotoFuel', photoSettings.requirePhotoFuel)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Mantenimientos */}
                                            <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg border border-border">
                                                <div className="space-y-0.5">
                                                    <Label className="text-sm font-bold">🔧 Mantenimientos</Label>
                                                    <span className="text-[10px] text-muted-foreground block">Foto de comprobante o taller</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black uppercase text-muted-foreground mr-1">
                                                        {photoSettings.requirePhotoMaintenance ? 'Oblig' : 'Opcional'}
                                                    </span>
                                                    <Switch 
                                                        checked={photoSettings.requirePhotoMaintenance} 
                                                        onCheckedChange={() => handleTogglePhoto('requirePhotoMaintenance', photoSettings.requirePhotoMaintenance)}
                                                    />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Control de Accesos y Vinculación de Empleados */}
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle className="text-md flex items-center gap-2">
                                                <UserCheck className="h-5 w-5 text-primary" />
                                                Vinculación y Accesos de Personal
                                            </CardTitle>
                                            <CardDescription>
                                                Autoriza qué choferes y mecánicos pueden interactuar con el Bot y registra su Chat ID.
                                            </CardDescription>
                                        </div>
                                        <Button 
                                            size="sm" 
                                            onClick={() => {
                                                setSelectedEmployeeId('');
                                                setManualChatId('');
                                                setManualUsername('');
                                                setPairingDialogOpen(true);
                                            }} 
                                            className="font-bold text-xs flex gap-1.5"
                                        >
                                            <UserPlus className="h-3.5 w-3.5" />
                                            Vinculación Manual
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="p-3 bg-gradient-to-r from-blue-500/10 via-sky-500/10 to-indigo-500/10 rounded-lg border border-blue-500/20 text-blue-800 dark:text-blue-300 text-xs leading-relaxed flex gap-2">
                                            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
                                            <div className="space-y-1">
                                                <span className="font-bold uppercase text-[9px] tracking-wider block opacity-75">Vinculación Segura Paso a Paso</span>
                                                <p>
                                                    Para habilitar a un chofer o mecánico, seleccione su nombre en el panel inferior y genere un <b>código alfanumérico</b>. Bríndele el código al colaborador; al ingresar al bot de Telegram y enviar <code>/vincular CÓDIGO</code>, su cuenta quedará enlazada automáticamente con total seguridad.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="rounded-md border border-border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Empleado</TableHead>
                                                        <TableHead>Usuario Telegram</TableHead>
                                                        <TableHead>Chat ID</TableHead>
                                                        <TableHead>Permisos del Bot</TableHead>
                                                        <TableHead>Estado / Código Activo</TableHead>
                                                        <TableHead className="text-right">Acciones</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {linkages.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                                                                Ningún empleado vinculado actualmente. Genere un código o realice una vinculación manual para comenzar.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        linkages.map((link) => (
                                                            <TableRow key={link.id}>
                                                                <TableCell className="font-medium text-xs">{link.employeeName || 'Empleado'}</TableCell>
                                                                <TableCell className="text-xs font-mono text-primary">
                                                                    {link.username ? `@${link.username}` : link.chatId ? 'Vinculado (sin @usuario)' : '-'}
                                                                </TableCell>
                                                                <TableCell className="font-mono text-xs text-muted-foreground">{link.chatId || '-'}</TableCell>
                                                                <TableCell className="text-xs">
                                                                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
                                                                        <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-semibold text-muted-foreground hover:text-primary">
                                                                            <input 
                                                                                type="checkbox"
                                                                                checked={link.allowFuel !== 0}
                                                                                onChange={() => handleTogglePermission(link.id, 'allowFuel', link.allowFuel !== 0)}
                                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                                            />
                                                                            <span>⛽ Comb.</span>
                                                                        </label>
                                                                        <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-semibold text-muted-foreground hover:text-primary">
                                                                            <input 
                                                                                type="checkbox"
                                                                                checked={link.allowMaintenance !== 0}
                                                                                onChange={() => handleTogglePermission(link.id, 'allowMaintenance', link.allowMaintenance !== 0)}
                                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                                            />
                                                                            <span>🔧 Mec.</span>
                                                                        </label>
                                                                        <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-semibold text-muted-foreground hover:text-primary">
                                                                            <input 
                                                                                type="checkbox"
                                                                                checked={link.allowDeliveries !== 0}
                                                                                onChange={() => handleTogglePermission(link.id, 'allowDeliveries', link.allowDeliveries !== 0)}
                                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                                            />
                                                                            <span>🚚 Ent.</span>
                                                                        </label>
                                                                        <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-semibold text-muted-foreground hover:text-primary">
                                                                            <input 
                                                                                type="checkbox"
                                                                                checked={link.allowWarehouse !== 0}
                                                                                onChange={() => handleTogglePermission(link.id, 'allowWarehouse', link.allowWarehouse !== 0)}
                                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                                            />
                                                                            <span>📦 Bod.</span>
                                                                        </label>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    {link.chatId ? (
                                                                        <Badge variant="default" className="text-[10px] font-bold py-0.5 px-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                                            Vinculado ✅
                                                                        </Badge>
                                                                    ) : (
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="secondary" className="font-mono text-[10px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 py-0.5 px-2">
                                                                                {link.activationCode}
                                                                            </Badge>
                                                                            <span className="text-[9px] text-muted-foreground">Pendiente</span>
                                                                        </div>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-right space-x-2">
                                                                    {!link.chatId && (
                                                                        <Button 
                                                                            variant="outline" 
                                                                            size="sm" 
                                                                            onClick={() => handleGenerateCode(link.employeeId)}
                                                                            className="h-7 text-[10px] px-2 font-semibold"
                                                                            title="Regenerar código de vinculación"
                                                                        >
                                                                            <RefreshCw className="h-3 w-3 mr-1" />
                                                                            Regenerar
                                                                        </Button>
                                                                    )}
                                                                    <Button 
                                                                        variant="destructive" 
                                                                        size="sm" 
                                                                        onClick={() => handleUnlink(link.id)}
                                                                        className="h-7 text-[10px] px-2 font-semibold"
                                                                    >
                                                                        <Trash2 className="h-3 w-3 mr-1" />
                                                                        Desvincular
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        {/* Generación rápida de códigos */}
                                        {activeEmployees.length > 0 && (
                                            <Card className="border border-border bg-muted/10">
                                                <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-end justify-between">
                                                    <div className="w-full md:w-2/3 space-y-1.5">
                                                        <Label className="text-xs font-bold">Generación Rápida de Código de Activación</Label>
                                                        <Select 
                                                            value={generatedCodeEmployeeId} 
                                                            onValueChange={(val) => {
                                                                setGeneratedCodeEmployeeId(val);
                                                                setGeneratedCode('');
                                                            }}
                                                        >
                                                            <SelectTrigger className="text-xs h-9">
                                                                <SelectValue placeholder="Seleccione un empleado..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {filteredEmployees
                                                                    .filter(emp => !linkages.some(l => l.employeeId === emp.id && l.chatId))
                                                                    .map(emp => (
                                                                        <SelectItem key={emp.id} value={emp.id}>
                                                                            {emp.name} ({emp.DEPARTAMENTO || 'Sin área'}){emp.active === 'N' ? ' [INACTIVO]' : ''}
                                                                        </SelectItem>
                                                                    ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <div className="flex items-center space-x-2 pt-0.5">
                                                            <input 
                                                                type="checkbox"
                                                                id="showInactiveEmployeesBot"
                                                                checked={showInactiveEmployees}
                                                                onChange={(e) => setShowInactiveEmployees(e.target.checked)}
                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                            />
                                                            <Label htmlFor="showInactiveEmployeesBot" className="text-[11px] text-muted-foreground font-normal cursor-pointer select-none">
                                                                Mostrar también empleados inactivos
                                                            </Label>
                                                        </div>
                                                    </div>
                                                    <div className="w-full md:w-1/3">
                                                        <Button 
                                                            className="w-full text-xs font-semibold h-9" 
                                                            disabled={!generatedCodeEmployeeId}
                                                            onClick={() => handleGenerateCode(generatedCodeEmployeeId)}
                                                        >
                                                            Generar Código
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                                {generatedCode && (
                                                    <div className="border-t p-4 bg-emerald-500/5 dark:bg-emerald-950/5 flex flex-col md:flex-row gap-4 items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                        <div className="space-y-1">
                                                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider block">Código de Activación</span>
                                                            <p className="text-xs text-muted-foreground">
                                                                Entregue este código al chofer para que lo envíe en el chat del Bot de Telegram.
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-3 bg-background border px-4 py-2 rounded-lg shadow-sm">
                                                            <span className="font-mono font-black text-xl tracking-widest text-emerald-600 dark:text-emerald-400">
                                                                {generatedCode}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </Card>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Monitor de Estados en Tiempo Real */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-md flex items-center gap-2">
                                            <Activity className="h-5 w-5 text-primary" />
                                            Monitor de Diálogos Activos
                                        </CardTitle>
                                        <CardDescription>
                                            Supervisa las conversaciones en progreso y los pasos actuales de cada usuario interactuando con el Bot.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="rounded-md border border-border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Colaborador / Chat ID</TableHead>
                                                        <TableHead>Flujo</TableHead>
                                                        <TableHead>Paso de Diálogo</TableHead>
                                                        <TableHead>Última Actividad</TableHead>
                                                        <TableHead className="text-right">Acciones</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {activeBotStates.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                                                                No hay conversaciones activas en este momento.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        activeBotStates.map((stateRow) => (
                                                            <TableRow key={stateRow.chatId}>
                                                                <TableCell className="space-y-0.5">
                                                                    <p className="font-semibold text-xs">
                                                                        {stateRow.employeeName || 'Empleado en proceso de vinculación'}
                                                                    </p>
                                                                    <span className="font-mono text-[10px] text-muted-foreground block">
                                                                        ID: {stateRow.chatId} {stateRow.username && `@${stateRow.username}`}
                                                                    </span>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge 
                                                                        variant={stateRow.currentFlow === 'fuel' ? 'default' : 'secondary'} 
                                                                        className="text-[10px] font-bold"
                                                                    >
                                                                        {stateRow.currentFlow === 'fuel' ? '⛽ Repostaje' : '🔧 Mantenimiento'}
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell className="text-xs font-semibold text-primary">
                                                                    {mapBotStepLabel(stateRow.step)}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground font-mono">
                                                                    {stateRow.updatedAt ? new Date(stateRow.updatedAt).toLocaleTimeString('es-CR') : '-'}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button 
                                                                        variant="outline" 
                                                                        size="sm" 
                                                                        className="h-7 text-[10px] font-semibold" 
                                                                        onClick={() => handleClearState(stateRow.chatId)}
                                                                    >
                                                                        <RefreshCw className="h-3 w-3 mr-1" />
                                                                        Forzar Reinicio
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="ai-copilot" className="space-y-4 pt-4 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                                <Card className="shadow-sm">
                                    <CardHeader className="bg-primary/5 pb-4 border-b">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <Settings2 className="h-5 w-5 text-primary" />
                                                <div>
                                                    <CardTitle className="text-lg">Configuración de IA Copiloto</CardTitle>
                                                    <CardDescription>Configura el motor de IA que ayuda a guiar a los usuarios en Telegram.</CardDescription>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="ai-active" className="text-sm font-semibold cursor-pointer">Activar Asistencia</Label>
                                                <Switch
                                                    id="ai-active"
                                                    checked={aiSettings?.aiEnabled === 1}
                                                    onCheckedChange={handleToggleAiActive}
                                                />
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-6 pt-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="ai-provider" className="flex items-center gap-2 text-sm font-semibold">
                                                <Cpu className="h-4 w-4 text-muted-foreground" />
                                                Proveedor de IA
                                            </Label>
                                            <Select value={aiSettings?.provider} onValueChange={handleAiProviderChange}>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Selecciona un proveedor" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ollama">Ollama (Servicio Local)</SelectItem>
                                                    <SelectItem value="gemini">Google Gemini (Nube)</SelectItem>
                                                    <SelectItem value="deepseek">DeepSeek (API Nube)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {aiSettings?.provider === 'ollama' && (
                                            <div className="space-y-4 border-t pt-4 animate-in slide-in-from-top-4 duration-300">
                                                <div className="space-y-2">
                                                    <Label htmlFor="ollamaHost" className="flex items-center gap-2 text-sm font-semibold">
                                                        <Server className="h-4 w-4 text-muted-foreground" />
                                                        Host de Ollama
                                                    </Label>
                                                    <Input
                                                        id="ollamaHost"
                                                        placeholder="http://localhost:11434"
                                                        value={aiSettings.ollamaHost}
                                                        onChange={(e) => handleAiSettingChange("ollamaHost", e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="ollamaModel" className="flex items-center gap-2 text-sm font-semibold">
                                                        <Bot className="h-4 w-4 text-muted-foreground" />
                                                        Modelo de Ollama
                                                    </Label>
                                                    <Input
                                                        id="ollamaModel"
                                                        placeholder="llama3.2:3b"
                                                        value={aiSettings.ollamaModel}
                                                        onChange={(e) => handleAiSettingChange("ollamaModel", e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {aiSettings?.provider === 'gemini' && (
                                            <div className="space-y-4 border-t pt-4 animate-in slide-in-from-top-4 duration-300">
                                                <div className="space-y-2">
                                                    <Label htmlFor="geminiApiKey" className="flex items-center gap-2 text-sm font-semibold">
                                                        <Key className="h-4 w-4 text-muted-foreground" />
                                                        Gemini API Key
                                                    </Label>
                                                    <Input
                                                        id="geminiApiKey"
                                                        type="password"
                                                        placeholder="AIzaSy..."
                                                        value={aiSettings.geminiApiKey}
                                                        onChange={(e) => handleAiSettingChange("geminiApiKey", e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="geminiModel" className="flex items-center gap-2 text-sm font-semibold">
                                                        <Bot className="h-4 w-4 text-muted-foreground" />
                                                        Modelo de Gemini
                                                    </Label>
                                                    <Input
                                                        id="geminiModel"
                                                        placeholder="gemini-1.5-flash"
                                                        value={aiSettings.geminiModel}
                                                        onChange={(e) => handleAiSettingChange("geminiModel", e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {aiSettings?.provider === 'deepseek' && (
                                            <div className="space-y-4 border-t pt-4 animate-in slide-in-from-top-4 duration-300">
                                                <div className="space-y-2">
                                                    <Label htmlFor="deepseekApiKey" className="flex items-center gap-2 text-sm font-semibold">
                                                        <Key className="h-4 w-4 text-muted-foreground" />
                                                        DeepSeek API Key
                                                    </Label>
                                                    <Input
                                                        id="deepseekApiKey"
                                                        type="password"
                                                        placeholder="sk-..."
                                                        value={aiSettings.deepseekApiKey}
                                                        onChange={(e) => handleAiSettingChange("deepseekApiKey", e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="deepseekModel" className="flex items-center gap-2 text-sm font-semibold">
                                                        <Bot className="h-4 w-4 text-muted-foreground" />
                                                        Modelo de DeepSeek
                                                    </Label>
                                                    <Input
                                                        id="deepseekModel"
                                                        placeholder="deepseek-v4-flash"
                                                        value={aiSettings.deepseekModel}
                                                        onChange={(e) => handleAiSettingChange("deepseekModel", e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                    <CardFooter className="flex justify-end gap-3 border-t pt-4 bg-muted/20">
                                        <Button onClick={handleSaveAiSettings} disabled={isSavingAi} className="h-9">
                                            {isSavingAi ? 'Guardando...' : 'Guardar Configuración'}
                                        </Button>
                                    </CardFooter>
                                </Card>

                                <Card className="shadow-sm">
                                    <CardHeader>
                                        <div className="flex items-center gap-3">
                                            <HelpCircle className="h-5 w-5 text-primary" />
                                            <div>
                                                <CardTitle className="text-md">Prompt de Sistema</CardTitle>
                                                <CardDescription>Modifica las directivas de comportamiento y formato para el asistente conversacional.</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-2">
                                        <Textarea
                                            id="systemPrompt"
                                            rows={6}
                                            className="font-mono text-sm leading-relaxed"
                                            placeholder="Escribe las directivas de personalidad de la IA aquí..."
                                            value={aiSettings?.systemPrompt || ''}
                                            onChange={(e) => handleAiSettingChange("systemPrompt", e.target.value)}
                                        />
                                    </CardContent>
                                    <CardFooter className="flex justify-end gap-3 border-t pt-4 bg-muted/20">
                                        <Button onClick={handleSaveAiSettings} disabled={isSavingAi} className="h-9">
                                            {isSavingAi ? 'Guardando...' : 'Guardar Configuración'}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </div>

                            <div className="space-y-6">
                                <Card className="shadow-sm border-secondary/50">
                                    <CardHeader className="pb-3 border-b bg-secondary/5">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <Activity className="h-4 w-4 text-primary animate-pulse" />
                                            Prueba de Conexión
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-4 space-y-4">
                                        {aiConnectionStatus ? (
                                            <div className={`p-4 rounded-xl border flex flex-col gap-2 text-xs ${aiConnectionStatus.success ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400'}`}>
                                                <div className="flex items-center gap-2 font-bold">
                                                    {aiConnectionStatus.success ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                                                    {aiConnectionStatus.success ? 'Servicio Activo' : 'Error de Conexión'}
                                                </div>
                                                <p className="font-medium leading-relaxed">{aiConnectionStatus.message}</p>
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-muted/40 rounded-xl border text-center text-xs text-muted-foreground">
                                                No se ha realizado la prueba de conexión para el proveedor activo.
                                            </div>
                                        )}

                                        <Button
                                            variant="outline"
                                            className="w-full gap-2 flex items-center justify-center h-9"
                                            disabled={isTestingAiConnection}
                                            onClick={handleTestAiConnection}
                                        >
                                            <RefreshCw className={`h-4 w-4 ${isTestingAiConnection ? 'animate-spin' : ''}`} />
                                            Probar Conectividad
                                        </Button>
                                    </CardContent>
                                </Card>

                                <Card className="shadow-sm bg-primary/5 border-primary/10">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-xs font-bold flex items-center gap-2 text-primary">
                                            <Bot className="h-4 w-4" />
                                            ¿Cómo funciona la IA?
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-[11px] text-muted-foreground space-y-3 leading-relaxed">
                                        <p>
                                            El asistente de IA se activará automáticamente cuando un chofer o usuario ingrese un texto inválido o no reconocido por el menú actual del bot de Telegram.
                                        </p>
                                        <p>
                                            La IA analizará el paso actual y explicará amigablemente qué debe hacer.
                                        </p>
                                        <p>
                                            Si la IA se encuentra inactiva, apagada o genera algún error de red, el bot continuará su flujo tradicional sin interrupciones.
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                {/* Dialogs */}
                <Dialog open={isRuleDialogOpen} onOpenChange={setRuleDialogOpen}>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader><DialogTitle>Regla de Notificación</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Nombre de la Regla</Label>
                                <Input value={currentRule.name} onChange={e => setCurrentRule({...currentRule, name: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Evento</Label>
                                    <Select value={currentRule.event} onValueChange={(v: any) => setCurrentRule({...currentRule, event: v})}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(eventLabels).map(([id, label]) => (
                                                <SelectItem key={id} value={id}>{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Medio</Label>
                                    <Select value={currentRule.action} onValueChange={(v: any) => setCurrentRule({...currentRule, action: v})}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="sendEmail">Correo Electrónico</SelectItem>
                                            <SelectItem value="sendTelegram">Telegram</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>
                                    {currentRule.action === 'sendTelegram' 
                                        ? 'Destinatarios / Chat ID (uno por línea)' 
                                        : 'Destinatarios (uno por línea)'}
                                </Label>
                                <Textarea 
                                    className="w-full min-h-[100px]" 
                                    value={currentRule.recipients?.join('\n')}
                                    onChange={e => setCurrentRule({...currentRule, recipients: e.target.value.split('\n').filter(Boolean)})}
                                    placeholder={currentRule.action === 'sendTelegram' ? '-100123456789' : 'ejemplo@empresa.com'}
                                />
                                {currentRule.action === 'sendTelegram' && (
                                    <p className="text-[11px] text-muted-foreground bg-muted p-2 rounded-md">
                                        ℹ️ Ingrese los ID numéricos de los chats o canales de Telegram (ej. <code>-100xxxxxxxxxx</code> para supergrupos/canales o <code>xxxxxxxxx</code> para chats personales). Asegúrese de haber agregado previamente el Bot a ese grupo o chat.
                                    </p>
                                )}
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleSaveRule} disabled={isSaving}>Guardar Regla</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={isTaskDialogOpen} onOpenChange={setTaskDialogOpen}>
                    <DialogContent>
                        <DialogHeader><DialogTitle>Programar Tarea (Cron)</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Nombre de la Automatización</Label>
                                <Input value={currentTask.name} onChange={e => setCurrentTask({...currentTask, name: e.target.value})} />
                            </div>
                            <div className="space-y-3 rounded-lg border p-3.5 bg-card shadow-sm">
                                <div className="flex items-center justify-between border-b pb-2 mb-2">
                                    <Label className="text-sm font-semibold">Configuración de Frecuencia</Label>
                                    <div className="flex bg-muted p-0.5 rounded-md text-[11px] gap-0.5">
                                        <button
                                            type="button"
                                            className={cn(
                                                "px-2.5 py-0.5 rounded-sm transition-all duration-200",
                                                cronMode === 'visual' ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                                            )}
                                            onClick={() => setCronMode('visual')}
                                        >
                                            Asistente
                                        </button>
                                        <button
                                            type="button"
                                            className={cn(
                                                "px-2.5 py-0.5 rounded-sm transition-all duration-200",
                                                cronMode === 'manual' ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                                            )}
                                            onClick={() => setCronMode('manual')}
                                        >
                                            Manual (Cron)
                                        </button>
                                    </div>
                                </div>

                                {cronMode === 'visual' && (
                                    <div className="space-y-3 animate-in fade-in duration-200">
                                        <div className="grid grid-cols-5 gap-0.5 bg-muted/60 p-0.5 rounded-md text-[10px]">
                                            {[
                                                { value: 'daily', label: 'Diario' },
                                                { value: 'weekly', label: 'Semanal' },
                                                { value: 'monthly', label: 'Mensual' },
                                                { value: 'minutes', label: 'Minutos' },
                                                { value: 'hours', label: 'Horas' }
                                            ].map(item => (
                                                <button
                                                    key={item.value}
                                                    type="button"
                                                    className={cn(
                                                        "py-1 rounded-sm text-center font-bold transition-all duration-200 truncate",
                                                        freqType === item.value ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                                    )}
                                                    onClick={() => setFreqType(item.value as any)}
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>

                                        {freqType === 'daily' && (
                                            <div className="flex gap-3 items-center">
                                                <div className="flex-1 space-y-1">
                                                    <Label className="text-[10px] text-muted-foreground">Hora</Label>
                                                    <Select value={visualHour} onValueChange={setVisualHour}>
                                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {Array.from({ length: 24 }).map((_, i) => {
                                                                const val = i < 10 ? `0${i}` : `${i}`;
                                                                const label = i % 12 === 0 ? 12 : i % 12;
                                                                const ampm = i >= 12 ? 'PM' : 'AM';
                                                                return <SelectItem key={val} value={val}>{`${label} ${ampm} (${val}:00)`}</SelectItem>;
                                                            })}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex-1 space-y-1">
                                                    <Label className="text-[10px] text-muted-foreground">Minuto</Label>
                                                    <Select value={visualMinute} onValueChange={setVisualMinute}>
                                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {Array.from({ length: 60 }).map((_, i) => {
                                                                const val = i < 10 ? `0${i}` : `${i}`;
                                                                return <SelectItem key={val} value={val}>{val}</SelectItem>;
                                                            })}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        )}

                                        {freqType === 'weekly' && (
                                            <div className="space-y-2">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-muted-foreground">Día de la Semana</Label>
                                                    <Select value={visualDayOfWeek} onValueChange={setVisualDayOfWeek}>
                                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="1">Lunes</SelectItem>
                                                            <SelectItem value="2">Martes</SelectItem>
                                                            <SelectItem value="3">Miércoles</SelectItem>
                                                            <SelectItem value="4">Jueves</SelectItem>
                                                            <SelectItem value="5">Viernes</SelectItem>
                                                            <SelectItem value="6">Sábado</SelectItem>
                                                            <SelectItem value="0">Domingo</SelectItem>
                                                            <SelectItem value="1-5">Lunes a Viernes (Días laborales)</SelectItem>
                                                            <SelectItem value="0,6">Sábado y Domingo (Fin de semana)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex gap-3 items-center">
                                                    <div className="flex-1 space-y-1">
                                                        <Label className="text-[10px] text-muted-foreground">Hora</Label>
                                                        <Select value={visualHour} onValueChange={setVisualHour}>
                                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {Array.from({ length: 24 }).map((_, i) => {
                                                                    const val = i < 10 ? `0${i}` : `${i}`;
                                                                    const label = i % 12 === 0 ? 12 : i % 12;
                                                                    const ampm = i >= 12 ? 'PM' : 'AM';
                                                                    return <SelectItem key={val} value={val}>{`${label} ${ampm} (${val}:00)`}</SelectItem>;
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="flex-1 space-y-1">
                                                        <Label className="text-[10px] text-muted-foreground">Minuto</Label>
                                                        <Select value={visualMinute} onValueChange={setVisualMinute}>
                                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {Array.from({ length: 60 }).map((_, i) => {
                                                                    const val = i < 10 ? `0${i}` : `${i}`;
                                                                    return <SelectItem key={val} value={val}>{val}</SelectItem>;
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {freqType === 'monthly' && (
                                            <div className="space-y-2">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-muted-foreground">Día del Mes</Label>
                                                    <Select value={visualDayOfMonth} onValueChange={setVisualDayOfMonth}>
                                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {Array.from({ length: 31 }).map((_, i) => {
                                                                const val = `${i + 1}`;
                                                                return <SelectItem key={val} value={val}>{`Día ${val}`}</SelectItem>;
                                                            })}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex gap-3 items-center">
                                                    <div className="flex-1 space-y-1">
                                                        <Label className="text-[10px] text-muted-foreground">Hora</Label>
                                                        <Select value={visualHour} onValueChange={setVisualHour}>
                                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {Array.from({ length: 24 }).map((_, i) => {
                                                                    const val = i < 10 ? `0${i}` : `${i}`;
                                                                    const label = i % 12 === 0 ? 12 : i % 12;
                                                                    const ampm = i >= 12 ? 'PM' : 'AM';
                                                                    return <SelectItem key={val} value={val}>{`${label} ${ampm} (${val}:00)`}</SelectItem>;
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="flex-1 space-y-1">
                                                        <Label className="text-[10px] text-muted-foreground">Minuto</Label>
                                                        <Select value={visualMinute} onValueChange={setVisualMinute}>
                                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {Array.from({ length: 60 }).map((_, i) => {
                                                                    const val = i < 10 ? `0${i}` : `${i}`;
                                                                    return <SelectItem key={val} value={val}>{val}</SelectItem>;
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {freqType === 'minutes' && (
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-muted-foreground">Intervalo de Minutos</Label>
                                                <Select value={visualInterval} onValueChange={setVisualInterval}>
                                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="2">Cada 2 minutos</SelectItem>
                                                        <SelectItem value="5">Cada 5 minutos</SelectItem>
                                                        <SelectItem value="10">Cada 10 minutos</SelectItem>
                                                        <SelectItem value="15">Cada 15 minutos</SelectItem>
                                                        <SelectItem value="30">Cada 30 minutos</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {freqType === 'hours' && (
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-muted-foreground">Intervalo de Horas</Label>
                                                <Select value={visualInterval} onValueChange={setVisualInterval}>
                                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1">Cada hora</SelectItem>
                                                        <SelectItem value="2">Cada 2 horas</SelectItem>
                                                        <SelectItem value="4">Cada 4 horas</SelectItem>
                                                        <SelectItem value="6">Cada 6 horas</SelectItem>
                                                        <SelectItem value="12">Cada 12 horas</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {cronMode === 'manual' && (
                                    <div className="space-y-2 animate-in fade-in duration-200">
                                        <Label className="text-xs text-muted-foreground">Expresión Cron Manual</Label>
                                        <Input 
                                            value={currentTask.schedule} 
                                            onChange={e => setCurrentTask({...currentTask, schedule: e.target.value})} 
                                            placeholder="ej: 0 8 * * *"
                                            className="font-mono text-xs h-8"
                                        />
                                        <p className="text-[9px] text-muted-foreground leading-snug">
                                            Estructura: <code>minuto hora díaMes mes díaSemana</code>.
                                            Ej: <code>0 8 * * *</code> (Todos los días a las 8 AM).
                                        </p>
                                    </div>
                                )}

                                {currentTask.schedule && (
                                    <div className="mt-2.5 p-2.5 rounded-md border bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 shadow-2xs flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                                        <div className="space-y-0.5">
                                            <span className="text-[8px] uppercase font-bold tracking-wider opacity-70 block">Interpretación en español</span>
                                            <p className="text-xs font-semibold leading-tight">
                                                {interpretCronExpression(currentTask.schedule)}
                                            </p>
                                            {cronMode === 'visual' && (
                                                <span className="text-[9px] block font-mono text-muted-foreground dark:text-emerald-400/70 mt-1">
                                                    Cron compilado: <code className="font-bold bg-emerald-500/20 px-1 py-0.2 rounded text-emerald-800 dark:text-emerald-200 text-[10px]">{currentTask.schedule}</code>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Acción del Sistema</Label>
                                <Select value={currentTask.taskId} onValueChange={(v: string) => setCurrentTask({...currentTask, taskId: v})}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="fleet-audit">Vigilante de Flota (Mantenimiento/Vencimientos)</SelectItem>
                                        <SelectItem value="fleet-weekly-fuel">Reporte Semanal de Combustible Consolidado</SelectItem>
                                        <SelectItem value="fleet-alerts-summary">Reporte Consolidado de Alertas de Flota</SelectItem>
                                        <SelectItem value="check-suggestions">Revisión de Sugerencias</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleSaveTask} disabled={isSaving}>Guardar Tarea</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Dialogo de Vinculación Manual */}
                <Dialog open={isPairingDialogOpen} onOpenChange={setPairingDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <UserPlus className="h-5 w-5 text-primary" />
                                Vinculación Manual de Telegram
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <p className="text-xs text-muted-foreground leading-normal">
                                Utilice esta opción si conoce el Chat ID numérico del usuario y desea forzar la vinculación inmediatamente sin requerir el código de activación en Telegram.
                            </p>
                            
                            <div className="space-y-2">
                                <Label className="text-xs font-bold">Colaborador / Empleado</Label>
                                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                                    <SelectTrigger className="text-xs">
                                        <SelectValue placeholder="Seleccione un empleado..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {filteredEmployees.map((emp) => (
                                            <SelectItem key={emp.id} value={emp.id}>
                                                {emp.name} ({emp.id}){emp.active === 'N' ? ' [INACTIVO]' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <div className="flex items-center space-x-2 pt-0.5">
                                    <input 
                                        type="checkbox"
                                        id="showInactiveEmployeesManual"
                                        checked={showInactiveEmployees}
                                        onChange={(e) => setShowInactiveEmployees(e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <Label htmlFor="showInactiveEmployeesManual" className="text-[11px] text-muted-foreground font-normal cursor-pointer select-none">
                                        Mostrar también empleados inactivos
                                    </Label>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold">Chat ID de Telegram</Label>
                                    <Input 
                                        value={manualChatId} 
                                        onChange={e => setManualChatId(e.target.value)} 
                                        placeholder="ej: 987654321"
                                        className="text-xs font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold">Usuario Telegram (Opcional)</Label>
                                    <Input 
                                        value={manualUsername} 
                                        onChange={e => setManualUsername(e.target.value)} 
                                        placeholder="ej: juan_perez"
                                        className="text-xs font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="flex justify-end gap-2 border-t pt-4">
                            <DialogClose asChild>
                                <Button variant="outline" size="sm" className="text-xs font-semibold">
                                    Cancelar
                                </Button>
                            </DialogClose>
                            <Button onClick={handleManualLink} disabled={isSaving} size="sm" className="text-xs font-semibold">
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                Vincular Ahora
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </main>
        </TooltipProvider>
    );
}
