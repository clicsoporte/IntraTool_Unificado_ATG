'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { 
    Settings, 
    Route, 
    Save, 
    Plus, 
    AlertTriangle, 
    ShieldAlert, 
    Mail, 
    Send,
    Clock, 
    SlidersHorizontal,
    RefreshCw,
    Trash2,
    MapPin
} from 'lucide-react';
import { 
    getDeliverySettings, 
    updateDeliverySettings, 
    getDeliveryRoutes, 
    createDeliveryRoute, 
    toggleDeliveryRoute,
    deleteDeliveryRoute,
    getCostaRicaGeography,
    saveCostaRicaGeographyAction,
    restoreDefaultGeographyAction
} from '@/modules/operations/lib/actions';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const PlatformBadge = ({ type }: { type: 'web' | 'telegram' | 'both' | 'apk' | 'web_apk' | 'bot_apk' | 'all' }) => {
    if (type === 'web') {
        return (
            <Badge variant="outline" className="text-[10px] font-extrabold bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 gap-1 py-0.5 px-2 shrink-0">
                🌐 Solo Web
            </Badge>
        );
    }
    if (type === 'telegram') {
        return (
            <Badge variant="outline" className="text-[10px] font-extrabold bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800 gap-1 py-0.5 px-2 shrink-0">
                🤖 Solo Telegram
            </Badge>
        );
    }
    if (type === 'apk') {
        return (
            <Badge variant="outline" className="text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 gap-1 py-0.5 px-2 shrink-0">
                📱 Solo APK Nativa
            </Badge>
        );
    }
    if (type === 'web_apk') {
        return (
            <Badge variant="outline" className="text-[10px] font-extrabold bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800 gap-1 py-0.5 px-2 shrink-0">
                🖥️ Web & APK
            </Badge>
        );
    }
    if (type === 'bot_apk') {
        return (
            <Badge variant="outline" className="text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 gap-1 py-0.5 px-2 shrink-0">
                🔄 Bot & APK
            </Badge>
        );
    }
    if (type === 'all') {
        return (
            <Badge variant="outline" className="text-[10px] font-extrabold bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 gap-1 py-0.5 px-2 shrink-0">
                ✨ Web, Bot & APK
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className="text-[10px] font-extrabold bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 gap-1 py-0.5 px-2 shrink-0">
            🔄 Web & Telegram
        </Badge>
    );
};

export default function AdminOperationsPage() {
    const { toast } = useToast();
    const { setTitle } = usePageTitle();
    const { hasPermission, isLoading: authLoading } = useAuthorization(['deliveries:admin']);
    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [creatingRoute, setCreatingRoute] = useState(false);

    // Settings State
    const [settings, setSettings] = useState<Record<string, string>>({
        delivery_mode: 'sencillo',
        release_codes_enabled: 'false',
        release_codes_override_min: '5',
        visibilidad_alertas: 'normal',
        hora_barrido_fin_jornada: '19:00',
        limite_coincidencias: '5',
        notificaciones_email: 'true',
        tracking_source: 'hybrid',
        tiempo_maximo_cliente_min: '20',
        parqueo_latitud: '10.025541',
        parqueo_longitud: '-84.273252',
        parqueo_radio_metros: '500',
        pedidos_enabled: 'true',
        bot_ask_next_client: 'true',
        bot_next_client_mandatory: 'false',
        bot_ask_rtv: 'true',
        bot_ask_comments: 'true',
        bot_ask_location: 'false',
        bot_location_mandatory: 'false',
        bot_live_tracking: 'false',
        bot_live_tracking_mandatory: 'false',
        bot_ask_start_location: 'optional',
        bot_ask_first_client: 'optional',
        bot_ask_return_location: 'optional',
        bot_ask_arrival_location: 'mandatory',
        bot_require_evidence_photo: 'disabled',
        bot_require_invoice_photo: 'disabled',
        collect_consecutive_prefix: 'REC-',
        collect_consecutive_next: '1',
        boleta_consecutive_prefix: 'BOL-',
        boleta_consecutive_next: '1',
        default_retry_email: 'logistica@empresa.com',
        default_partial_email: 'logistica@empresa.com',
        route_consecutive_prefix: 'RUT-',
        route_consecutive_next: '1',
        notificaciones_ruta_emails: 'logistica@empresa.com',
        driver_boleta_pdf_enabled: 'true',
        driver_boleta_email_enabled: 'true',
        driver_boleta_print_enabled: 'true',
        driver_boleta_paper_size: '80mm',
        driver_boleta_print_method: 'all',
        gps_modo_predeterminado: 'autoAjuste',
        gps_tour_tiempo_sec: '10',
        gps_tour_zoom_level: '17',
        gps_auto_ajuste_interval_sec: '15',
        gps_geocoding_threshold_m: '200',
        gps_ui_refresh_sec: '5',
        intervalo_consulta_gps: '12',
        allow_driver_revert_delivery: '1',
        apk_require_evidence_photo: 'disabled',
        apk_require_invoice_photo: 'disabled',
        apk_require_signature: 'false',
        apk_require_incident_notes: 'false',
        apk_print_show_client: 'true',
        apk_print_show_lines: 'true',
        apk_print_footer_text: '¡Gracias por preferirnos!\nEl articulo viaja por cuenta y riesgo del cliente.',
        apk_block_if_gps_off: 'true',
        apk_block_if_bluetooth_off: 'false',
        apk_block_tethering: 'false',
        apk_alert_on_tamper: 'true',
        apk_enable_break_timer: 'true',
        apk_background_sync_minutes: '5',
        apk_tracking_interval_minutes: '5',
        notification_strategy: 'solamente_telegram',
        sms_gateway_url: '',
        sms_gateway_token: '',
        telefonos_departamento_ti: '',
        break_time_breakfast_min: '15',
        break_time_lunch_min: '45',
        break_time_snack_min: '15',
        ops_enable_gps_tamper_detection: 'true',
    });

    const handleToggleAskNextClient = (checked: boolean) => {
        setSettings((prev: Record<string, string>) => {
            const next: Record<string, string> = { ...prev, bot_ask_next_client: checked ? 'true' : 'false' };
            if (!checked) {
                next.bot_next_client_mandatory = 'false';
            }
            return next;
        });
    };

    const handleToggleNextClientMandatory = (checked: boolean) => {
        setSettings((prev: Record<string, string>) => {
            const next: Record<string, string> = { ...prev, bot_next_client_mandatory: checked ? 'true' : 'false' };
            if (checked) {
                next.bot_ask_next_client = 'true';
            }
            return next;
        });
    };

    const handleToggleAskLocation = (checked: boolean) => {
        setSettings((prev: Record<string, string>) => {
            const next: Record<string, string> = { ...prev, bot_ask_location: checked ? 'true' : 'false' };
            if (!checked) {
                next.bot_location_mandatory = 'false';
            }
            return next;
        });
    };

    const handleToggleLocationMandatory = (checked: boolean) => {
        setSettings((prev: Record<string, string>) => {
            const next: Record<string, string> = { ...prev, bot_location_mandatory: checked ? 'true' : 'false' };
            if (checked) {
                next.bot_ask_location = 'true';
            }
            return next;
        });
    };

    const handleToggleLiveTracking = (checked: boolean) => {
        setSettings((prev: Record<string, string>) => {
            const next: Record<string, string> = { ...prev, bot_live_tracking: checked ? 'true' : 'false' };
            if (!checked) {
                next.bot_live_tracking_mandatory = 'false';
            }
            return next;
        });
    };

    const handleToggleLiveTrackingMandatory = (checked: boolean) => {
        setSettings((prev: Record<string, string>) => {
            const next: Record<string, string> = { ...prev, bot_live_tracking_mandatory: checked ? 'true' : 'false' };
            if (checked) {
                next.bot_live_tracking = 'true';
            }
            return next;
        });
    };

    // Routes State
    const [routes, setRoutes] = useState<any[]>([]);
    const [newRouteName, setNewRouteName] = useState('');

    // Geography State
    const [geographyData, setGeographyData] = useState<any>(null);
    const [selectedProvince, setSelectedProvince] = useState('');
    const [selectedCanton, setSelectedCanton] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState('');

    // Raw JSON Geography Editor State
    const [rawGeoJson, setRawGeoJson] = useState('');
    const [savingGeo, setSavingGeo] = useState(false);
    const [restoringGeo, setRestoringGeo] = useState(false);

    // Registered Devices state
    const [registeredDevices, setRegisteredDevices] = useState<any[]>([]);

    useEffect(() => {
        setTitle('Configuración de Entregas');
    }, [setTitle]);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const [fetchedSettings, fetchedRoutes, fetchedGeo, devicesRes] = await Promise.all([
                    getDeliverySettings(),
                    getDeliveryRoutes(),
                    getCostaRicaGeography(),
                    fetch('/api/fleet/device-config?list=true').then(r => r.json()).catch(() => ({ devices: [] }))
                ]);
                if (fetchedSettings && Object.keys(fetchedSettings).length > 0) {
                    setSettings((prev) => ({ ...prev, ...fetchedSettings }));
                }
                setRoutes(fetchedRoutes);
                setGeographyData(fetchedGeo);
                if (devicesRes?.devices) {
                    setRegisteredDevices(devicesRes.devices);
                }
                if (fetchedGeo) {
                    setRawGeoJson(JSON.stringify(fetchedGeo, null, 4));
                }
            } catch (e: any) {
                toast({
                    title: 'Error de carga',
                    description: 'No se pudieron recuperar las configuraciones.',
                    variant: 'destructive'
                });
            } finally {
                setLoading(false);
            }
        }
        if (!authLoading && hasPermission('deliveries:admin')) {
            loadData();
        }
    }, [toast, authLoading, hasPermission]);

    async function handleSaveSettings() {
        setSavingSettings(true);
        try {
            const res = await updateDeliverySettings(settings);
            if (res.success) {
                toast({
                    title: 'Ajustes guardados',
                    description: 'Los parámetros del sistema se han actualizado correctamente.',
                });
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al guardar',
                description: e.message || 'No se pudo guardar la configuración.',
                variant: 'destructive'
            });
        } finally {
            setSavingSettings(false);
        }
    }

    async function handleCreateRoute(e: React.FormEvent) {
        e.preventDefault();
        if (!newRouteName.trim()) return;

        setCreatingRoute(true);
        try {
            const res = await createDeliveryRoute(newRouteName.trim());
            if (res.success) {
                toast({
                    title: 'Ruta creada',
                    description: `La ruta "${newRouteName}" ya está disponible para asignaciones.`,
                });
                setNewRouteName('');
                const fetchedRoutes = await getDeliveryRoutes();
                setRoutes(fetchedRoutes);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al crear ruta',
                description: e.message || 'La ruta podría ya existir.',
                variant: 'destructive'
            });
        } finally {
            setCreatingRoute(false);
        }
    }

    async function handleToggleRoute(id: number, active: boolean) {
        try {
            const res = await toggleDeliveryRoute(id, active);
            if (res.success) {
                toast({
                    title: active ? 'Ruta activada' : 'Ruta desactivada',
                    description: 'El estado de la ruta logística se ha actualizado.',
                });
                const fetchedRoutes = await getDeliveryRoutes();
                setRoutes(fetchedRoutes);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error de actualización',
                description: e.message,
                variant: 'destructive'
            });
        }
    }

    // State for Delete Route Alert Dialog
    const [routeToDelete, setRouteToDelete] = useState<{ id: number; name: string } | null>(null);

    async function executeDeleteRoute() {
        if (!routeToDelete) return;
        const { id, name } = routeToDelete;
        try {
            const res = await deleteDeliveryRoute(id);
            if (res.success) {
                toast({
                    title: 'Ruta eliminada',
                    description: `La ruta "${name}" ha sido eliminada del sistema.`,
                });
                const fetchedRoutes = await getDeliveryRoutes();
                setRoutes(fetchedRoutes);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al eliminar ruta',
                description: e.message,
                variant: 'destructive'
            });
        } finally {
            setRouteToDelete(null);
        }
    }

    function handleDeleteRoute(id: number, name: string) {
        setRouteToDelete({ id, name });
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            try {
                const parsed = JSON.parse(text);
                if (!parsed || typeof parsed !== 'object' || !parsed.provincias) {
                    throw new Error("El archivo no tiene el formato geográfico correcto (debe incluir la clave 'provincias').");
                }
                setRawGeoJson(JSON.stringify(parsed, null, 4));
                toast({
                    title: 'Archivo cargado correctamente',
                    description: 'El archivo ha sido leído. Revise los cambios en el editor y presione "Guardar Geografía" para aplicarlos.',
                });
            } catch (err: any) {
                toast({
                    title: 'Error al leer archivo',
                    description: err.message || 'El formato del archivo no es un JSON válido.',
                    variant: 'destructive'
                });
            }
        };
        reader.readAsText(file);
    };

    async function handleSaveGeography() {
        if (!rawGeoJson.trim()) return;
        setSavingGeo(true);
        try {
            const parsed = JSON.parse(rawGeoJson);
            if (!parsed || typeof parsed !== 'object' || !parsed.provincias) {
                throw new Error("El JSON no tiene el formato geográfico correcto (debe incluir la clave 'provincias').");
            }

            const res = await saveCostaRicaGeographyAction(rawGeoJson);
            if (res.success) {
                toast({
                    title: 'Geografía actualizada',
                    description: 'La base de datos geográfica se ha actualizado de manera exitosa.',
                });
                setGeographyData(parsed);
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al guardar geografía',
                description: e.message || 'El JSON ingresado no es válido.',
                variant: 'destructive'
            });
        } finally {
            setSavingGeo(false);
        }
    }

    // State for Restore Geography Alert Dialog
    const [showRestoreGeoDialog, setShowRestoreGeoDialog] = useState<boolean>(false);

    async function executeRestoreGeography() {
        setShowRestoreGeoDialog(false);
        setRestoringGeo(true);
        try {
            const res = await restoreDefaultGeographyAction();
            if (res.success) {
                toast({
                    title: 'Catálogo restaurado',
                    description: 'Se ha restablecido la geografía base de Costa Rica con éxito.',
                });
                const fetchedGeo = await getCostaRicaGeography();
                if (fetchedGeo) {
                    setGeographyData(fetchedGeo);
                    setRawGeoJson(JSON.stringify(fetchedGeo, null, 4));
                    setSelectedProvince('');
                    setSelectedCanton('');
                    setSelectedDistrict('');
                }
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({
                title: 'Error al restaurar catálogo',
                description: e.message,
                variant: 'destructive'
            });
        } finally {
            setRestoringGeo(false);
        }
    }

    function handleRestoreGeography() {
        setShowRestoreGeoDialog(true);
    }

    // Geography parsing helpers
    const provinces = geographyData 
        ? Object.entries(geographyData.provincias).map(([id, p]: any) => ({ id, nombre: p.nombre })) 
        : [];
    
    const cantons = geographyData && selectedProvince 
        ? Object.entries(geographyData.provincias[selectedProvince].cantones).map(([id, c]: any) => ({ id, nombre: c.nombre })) 
        : [];
        
    const districts = geographyData && selectedProvince && selectedCanton 
        ? Object.entries(geographyData.provincias[selectedProvince].cantones[selectedCanton].distritos).map(([id, name]: any) => ({ id, nombre: name })) 
        : [];

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse m-6">
                <div className="text-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                    <p className="text-muted-foreground font-medium">Cargando configuraciones...</p>
                </div>
            </div>
        );
    }

    if (!hasPermission('deliveries:admin')) {
        return (
            <div className="p-6 text-center text-red-500 font-bold">
                No tiene permiso para acceder a esta sección de administración.
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Configuración de Entregas</h1>
                <p className="text-muted-foreground text-sm">
                    Gestione parámetros operativos, rutas y reglas de negocio del despacho.
                </p>
            </div>
            
            <Tabs defaultValue="general" className="w-full space-y-6">
                <TabsList className="bg-muted/50 p-1 rounded-xl">
                    <TabsTrigger value="general" className="rounded-lg font-bold">Ajustes Generales</TabsTrigger>
                    <TabsTrigger value="apk" className="rounded-lg font-bold flex items-center gap-2">
                        <span className="text-emerald-500">📱</span> APK Nativa
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="mt-0 outline-none">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* General Settings */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-none shadow-md overflow-hidden relative bg-card">
                        <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full bg-blue-500/10 pointer-events-none" />
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-2">
                                <Settings className="w-5 h-5 text-blue-600" />
                                <CardTitle className="text-xl">Parámetros del Sistema</CardTitle>
                            </div>
                            <CardDescription>
                                Configure las reglas de negocio globales y comportamiento de la app y del Bot de Telegram.
                            </CardDescription>
                        </CardHeader>
                        
                        <CardContent className="space-y-6">
                            {/* Leyenda Guía de Ámbito */}
                            <div className="flex items-center gap-2 text-xs bg-muted/40 p-3 rounded-xl border border-muted/60 flex-wrap">
                                <span className="font-bold text-foreground text-xs">📍 Guía de Ámbito de Aplicación:</span>
                                <PlatformBadge type="web" />
                                <span className="text-[11px] text-muted-foreground mr-2">Configuración App / Portal Web</span>
                                <PlatformBadge type="telegram" />
                                <span className="text-[11px] text-muted-foreground mr-2">Configuración Bot Telegram</span>
                                <PlatformBadge type="both" />
                                <span className="text-[11px] text-muted-foreground">Aplica a ambas plataformas</span>
                            </div>

                            {/* Delivery Mode Toggle */}
                            <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-muted/50">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Label className="text-sm font-bold block">Modo de Operación y Entrega</Label>
                                            <PlatformBadge type="both" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Selecciona si deseas flujos rápidos y simples, o controles detallados de inventario.
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-background p-1.5 rounded-lg border shadow-sm shrink-0">
                                        <Button
                                            variant={settings.delivery_mode === 'sencillo' ? 'default' : 'ghost'}
                                            size="sm"
                                            className="h-8 rounded-md text-xs font-bold"
                                            onClick={() => setSettings(prev => ({ ...prev, delivery_mode: 'sencillo' }))}
                                        >
                                            Sencillo
                                        </Button>
                                        <Button
                                            variant={settings.delivery_mode === 'avanzado' ? 'default' : 'ghost'}
                                            size="sm"
                                            className="h-8 rounded-md text-xs font-bold"
                                            onClick={() => setSettings(prev => ({ ...prev, delivery_mode: 'avanzado' }))}
                                        >
                                            Avanzado
                                        </Button>
                                    </div>
                                </div>
                                
                                <div className="pt-2 border-t border-muted/50">
                                    {settings.delivery_mode === 'sencillo' ? (
                                        <div className="flex items-start gap-2.5 text-xs text-amber-600 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                            <p className="font-semibold">
                                                <strong>Modo Sencillo Activo:</strong> El chofer solo reporta si la entrega es Completa, Incompleta o Rechazada. Ideal para operaciones logísticas veloces sin fricción de ítems.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-2.5 text-xs text-blue-600 bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/20">
                                            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                                            <p className="font-semibold">
                                                <strong>Modo Avanzado Activo:</strong> Permite digitar cantidades físicas exactas y mermas por línea de producto, solicitando autorizaciones especiales y códigos de validación.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Toggles & Selects */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Release Codes Switch */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                <SlidersHorizontal className="w-4 h-4 text-purple-500" />
                                                Códigos de Validación
                                            </Label>
                                            <PlatformBadge type="both" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Exigir código de 6 dígitos en mermas.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.release_codes_enabled === 'true'}
                                        onCheckedChange={(val) => setSettings(prev => ({ ...prev, release_codes_enabled: val ? 'true' : 'false' }))}
                                    />
                                </div>

                                {/* Email notification Switch */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                <Mail className="w-4 h-4 text-emerald-500" />
                                                Notificar Creador ERP
                                            </Label>
                                            <PlatformBadge type="both" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Enviar correo al facturador sobre incidencias.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.notificaciones_email === 'true'}
                                        onCheckedChange={(val) => setSettings(prev => ({ ...prev, notificaciones_email: val ? 'true' : 'false' }))}
                                    />
                                </div>

                                {/* Habilitar Pedidos ERP Switch */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                <Settings className="w-4 h-4 text-blue-500" />
                                                Habilitar Pedidos ERP
                                            </Label>
                                            <PlatformBadge type="both" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Importar pedidos en cola y bot de Telegram.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.pedidos_enabled !== 'false'}
                                        onCheckedChange={(val) => setSettings(prev => ({ ...prev, pedidos_enabled: val ? 'true' : 'false' }))}
                                    />
                                </div>

                                {/* Opciones de Boletas e Impresión Móvil Chofer */}
                                <div className="col-span-1 md:col-span-3 space-y-4 p-5 bg-indigo-950/10 rounded-xl border border-indigo-500/20">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-xl">🖨️</span>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Label className="text-sm font-extrabold text-indigo-900 dark:text-indigo-300">
                                                        Opciones de Boleta e Impresoras Térmicas en Portal Móvil Chofer
                                                    </Label>
                                                    <PlatformBadge type="web" />
                                                </div>
                                                <span className="text-xs text-muted-foreground block font-medium">
                                                    Habilite o deshabilite las acciones disponibles para el chofer al finalizar o revisar entregas.
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                                        <div className="flex items-center justify-between p-3 bg-background rounded-lg border shadow-sm gap-2">
                                            <div className="space-y-0.5 pr-2">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <Label className="text-xs font-bold block">📄 Descargar PDF</Label>
                                                    <PlatformBadge type="both" />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground block">Permitir guardar PDF boleta</span>
                                            </div>
                                            <Switch
                                                checked={settings.driver_boleta_pdf_enabled !== 'false'}
                                                onCheckedChange={(val) => setSettings(prev => ({ ...prev, driver_boleta_pdf_enabled: val ? 'true' : 'false' }))}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-3 bg-background rounded-lg border shadow-sm gap-2">
                                            <div className="space-y-0.5 pr-2">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <Label className="text-xs font-bold block">📧 Enviar por Correo</Label>
                                                    <PlatformBadge type="both" />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground block">Despachar boleta por email</span>
                                            </div>
                                            <Switch
                                                checked={settings.driver_boleta_email_enabled !== 'false'}
                                                onCheckedChange={(val) => setSettings(prev => ({ ...prev, driver_boleta_email_enabled: val ? 'true' : 'false' }))}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-3 bg-background rounded-lg border shadow-sm gap-2">
                                            <div className="space-y-0.5 pr-2">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <Label className="text-xs font-bold block">🖨️ Impresión Térmica</Label>
                                                    <PlatformBadge type="web" />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground block">Imprimir recibo Bluetooth</span>
                                            </div>
                                            <Switch
                                                checked={settings.driver_boleta_print_enabled !== 'false'}
                                                onCheckedChange={(val) => setSettings(prev => ({ ...prev, driver_boleta_print_enabled: val ? 'true' : 'false' }))}
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Label className="text-xs font-bold text-indigo-900 dark:text-indigo-200 block">
                                                    Formato de Papel para Impresoras de Recibos / Bluetooth
                                                </Label>
                                                <PlatformBadge type="web" />
                                            </div>
                                            <span className="text-[11px] text-muted-foreground block">
                                                Seleccione el ancho físico estándar del papel térmico de la empresa (Epson TMU o Datáfonos/POS).
                                            </span>
                                        </div>

                                        <Select 
                                            value={settings.driver_boleta_paper_size || '80mm'} 
                                            onValueChange={(val) => setSettings(prev => ({ ...prev, driver_boleta_paper_size: val }))}
                                        >
                                            <SelectTrigger className="w-full sm:w-64 h-9 font-bold text-xs bg-background shrink-0">
                                                <SelectValue placeholder="Seleccionar Formato" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="80mm">80 mm (Epson TMU / Térmica)</SelectItem>
                                                <SelectItem value="57mm">57 mm (Datáfono / POS)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Tracking Source & Customer Stay Alerts */}
                            <div className="space-y-4 p-4 bg-slate-900/5 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Label className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
                                                📡 Fuente de Rastreo de Flota en Vivo
                                            </Label>
                                            <PlatformBadge type="both" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Seleccione el origen de las coordenadas geográficas de los camiones.
                                        </span>
                                    </div>

                                    <Select 
                                        value={settings.tracking_source || 'hybrid'} 
                                        onValueChange={(val) => setSettings(prev => ({ ...prev, tracking_source: val }))}
                                    >
                                        <SelectTrigger className="w-72 h-9 font-bold text-xs bg-background">
                                            <SelectValue placeholder="Seleccionar Fuente" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="telegram">Sólo GPS del Teléfono (APK Móvil / Bot)</SelectItem>
                                            <SelectItem value="gps_navixy">Sólo GPS Camión (Navixy Satelital)</SelectItem>
                                            <SelectItem value="hybrid">Modo Híbrido (GPS Camión + APK / Bot)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200/80">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                                            Tiempo Máx. en Cliente (Min)
                                        </Label>
                                        <Input
                                            type="number"
                                            min="5"
                                            max="180"
                                            value={settings.tiempo_maximo_cliente_min || '20'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, tiempo_maximo_cliente_min: e.target.value }))}
                                            className="rounded-lg font-bold"
                                        />
                                        <span className="text-[10px] text-muted-foreground block">
                                            Emite alerta si el camión permanece detenido en cliente más de estos minutos.
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                                                Latitud Parqueo / Sede Empresa
                                            </Label>
                                            <Input
                                                type="text"
                                                placeholder="Ej: 10.025541"
                                                value={settings.parqueo_latitud || '10.025541'}
                                                onChange={(e) => setSettings(prev => ({ ...prev, parqueo_latitud: e.target.value }))}
                                                className="rounded-lg font-mono font-bold"
                                            />
                                            <span className="text-[10px] text-muted-foreground block">
                                                Coordenada de Latitud decimal del predio/empresa.
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                                                Longitud Parqueo / Sede Empresa
                                            </Label>
                                            <Input
                                                type="text"
                                                placeholder="Ej: -84.273252"
                                                value={settings.parqueo_longitud || '-84.273252'}
                                                onChange={(e) => setSettings(prev => ({ ...prev, parqueo_longitud: e.target.value }))}
                                                className="rounded-lg font-mono font-bold"
                                            />
                                            <span className="text-[10px] text-muted-foreground block">
                                                Coordenada de Longitud decimal del predio/empresa.
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                                                    Radio Parqueo Sede (Metros)
                                                </Label>
                                                {settings.parqueo_latitud && settings.parqueo_longitud && (
                                                    <a
                                                        href={`https://www.google.com/maps/search/?api=1&query=${settings.parqueo_latitud},${settings.parqueo_longitud}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-[10px] text-indigo-600 hover:underline font-bold flex items-center gap-0.5"
                                                    >
                                                        🗺️ Ver Mapa
                                                    </a>
                                                )}
                                            </div>
                                            <Input
                                                type="number"
                                                min="50"
                                                max="2000"
                                                value={settings.parqueo_radio_metros || '500'}
                                                onChange={(e) => setSettings(prev => ({ ...prev, parqueo_radio_metros: e.target.value }))}
                                                className="rounded-lg font-bold"
                                            />
                                            <span className="text-[10px] text-muted-foreground block">
                                                Radio de geocerca del patio/sede central (m) para detectar entrada y salida.
                                            </span>
                                        </div>
                                    </div>

                                    {/* Auto-inicio de ruta por salida de patio */}
                                    <div className="flex flex-row items-center justify-between p-3 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-0.5 pr-2">
                                            <Label className="text-xs font-bold">Auto-Iniciar Ruta al Salir del Patio</Label>
                                            <span className="text-[10px] text-muted-foreground block">
                                                Activa la hoja de ruta y registra la hora de salida automáticamente si el camión sale del radio sin tocar el botón.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.auto_start_route_on_depot_exit !== 'false'}
                                            onCheckedChange={(val) => setSettings(prev => ({ ...prev, auto_start_route_on_depot_exit: val ? 'true' : 'false' }))}
                                        />
                                    </div>

                                    {/* Auto-llegada de ruta por entrada a patio */}
                                    <div className="flex flex-row items-center justify-between p-3 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-0.5 pr-2">
                                            <Label className="text-xs font-bold">Auto-Registrar Llegada al Entrar al Patio</Label>
                                            <span className="text-[10px] text-muted-foreground block">
                                                Captura la hora exacta de retorno al ingresar al radio tras concluir las entregas para consolidar tiempos en analítica.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.auto_record_arrival_on_depot_entry !== 'false'}
                                            onCheckedChange={(val) => setSettings(prev => ({ ...prev, auto_record_arrival_on_depot_entry: val ? 'true' : 'false' }))}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* NUEVA TARJETA: MONITOR DE ESTADOS GPS & TOUR */}
                            <div className="space-y-4 p-4 bg-sky-950/10 rounded-xl border border-sky-500/20">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">🎯</span>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Label className="text-sm font-bold text-sky-900 dark:text-sky-300">
                                                    Configuración de Pantalla y Modo Tour (Monitor GPS)
                                                </Label>
                                                <PlatformBadge type="web" />
                                            </div>
                                            <span className="text-xs text-muted-foreground block font-medium">
                                                Personalice el comportamiento predeterminado del Monitor GPS de la Flota en tiempo real.
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-sky-500/20">
                                    {/* Modo Predeterminado */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                            Modo Predeterminado
                                        </Label>
                                        <Select 
                                            value={settings.gps_modo_predeterminado || 'autoAjuste'} 
                                            onValueChange={(val) => setSettings(prev => ({ ...prev, gps_modo_predeterminado: val }))}
                                        >
                                            <SelectTrigger className="h-9 font-bold text-xs bg-background">
                                                <SelectValue placeholder="Modo Inicial" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="autoAjuste">🎯 Auto Ajuste (Encuadre General)</SelectItem>
                                                <SelectItem value="modoTour">🔄 Modo Tour (Carrusel Animado)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-[10px] text-muted-foreground block">
                                            Modo activo al abrir la pantalla de monitoreo.
                                        </span>
                                    </div>

                                    {/* Tiempo Tour */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                            Tiempo por Vehículo en Tour (Seg)
                                        </Label>
                                        <Input
                                            type="number"
                                            min="3"
                                            max="60"
                                            value={settings.gps_tour_tiempo_sec || '10'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, gps_tour_tiempo_sec: e.target.value }))}
                                            className="h-9 font-bold text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground block">
                                            Segundos enfocado en cada camión en Modo Tour.
                                        </span>
                                    </div>

                                    {/* Zoom Level */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                            Nivel de Zoom en Tour
                                        </Label>
                                        <Select 
                                            value={settings.gps_tour_zoom_level || '17'} 
                                            onValueChange={(val) => setSettings(prev => ({ ...prev, gps_tour_zoom_level: val }))}
                                        >
                                            <SelectTrigger className="h-9 font-bold text-xs bg-background">
                                                <SelectValue placeholder="Zoom" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="15">Zoom 15 (Ciudad/Sector)</SelectItem>
                                                <SelectItem value="16">Zoom 16 (Cercano)</SelectItem>
                                                <SelectItem value="17">Zoom 17 (Detallado)</SelectItem>
                                                <SelectItem value="18">Zoom 18 (Máximo Zoom)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-[10px] text-muted-foreground block">
                                            Acercamiento de cámara al hacer foco en un vehículo.
                                        </span>
                                    </div>

                                    {/* Frecuencia AutoAjuste */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                            Frecuencia Auto Ajuste (Seg)
                                        </Label>
                                        <Input
                                            type="number"
                                            min="5"
                                            max="120"
                                            value={settings.gps_auto_ajuste_interval_sec || '15'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, gps_auto_ajuste_interval_sec: e.target.value }))}
                                            className="h-9 font-bold text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground block">
                                            Segundos para re-encuadrar el grupo completo.
                                        </span>
                                    </div>

                                    {/* Umbral Desplazamiento Geocodificación */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                            Umbral Geocodificación (Mts)
                                        </Label>
                                        <Input
                                            type="number"
                                            min="100"
                                            max="2000"
                                            value={settings.gps_geocoding_threshold_m || '200'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, gps_geocoding_threshold_m: e.target.value }))}
                                            className="h-9 font-bold text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground block">
                                            Desplazamiento mínimo para actualizar nombre de ciudad.
                                        </span>
                                    </div>

                                    {/* Frecuencia Refresco UI */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                            Refresco de Pantalla UI (Seg)
                                        </Label>
                                        <Input
                                            type="number"
                                            min="2"
                                            max="30"
                                            value={settings.gps_ui_refresh_sec || '5'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, gps_ui_refresh_sec: e.target.value }))}
                                            className="h-9 font-bold text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground block">
                                            Tiempo entre actualizaciones de contadores de interfaz.
                                        </span>
                                    </div>

                                    {/* Frecuencia de Consulta a Navixy API */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                            📡 Consulta Navixy API (Seg)
                                        </Label>
                                        <Input
                                            type="number"
                                            min="12"
                                            max="120"
                                            value={settings.intervalo_consulta_gps || '12'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, intervalo_consulta_gps: e.target.value }))}
                                            className="h-9 font-bold text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground block">
                                            Tiempo entre llamadas al servidor Navixy (Mín. 12s para rate-limit).
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <SlidersHorizontal className="w-5 h-5 text-sky-500" />
                                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Configuración del Bot de Telegram</h3>
                                    <PlatformBadge type="telegram" />
                                </div>
                                <p className="text-xs text-muted-foreground font-medium">
                                    Personalice las preguntas del asistente de Telegram que realizan los choferes en la calle. Las dependencias entre preguntas se gestionan de forma automática.
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* bot_ask_next_client */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Preguntar Próximo Cliente</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Pregunta al chofer su próximo destino al terminar la entrega.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.bot_ask_next_client === 'true'}
                                            onCheckedChange={handleToggleAskNextClient}
                                        />
                                    </div>

                                    {/* bot_next_client_mandatory */}
                                    <div className={`flex flex-row items-center justify-between p-4 rounded-xl border transition-all ${
                                        settings.bot_ask_next_client === 'true' 
                                            ? 'bg-muted/20 border-muted/40' 
                                            : 'bg-muted/5 border-muted/20 opacity-50'
                                    }`}>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Hacer Próximo Cliente Obligatorio</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Impide omitir la indicación de su próximo destino.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.bot_next_client_mandatory === 'true'}
                                            onCheckedChange={handleToggleNextClientMandatory}
                                            disabled={settings.bot_ask_next_client !== 'true'}
                                        />
                                    </div>

                                    {/* bot_ask_comments */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Preguntar Comentarios de Entrega</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-amber-500/10 text-amber-500 border border-amber-500/20">SÓLO MODO SIMPLE</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Permite ingresar observaciones textuales al chofer.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.bot_ask_comments !== 'false'}
                                            onCheckedChange={(val) => setSettings(prev => ({ ...prev, bot_ask_comments: val ? 'true' : 'false' }))}
                                        />
                                    </div>

                                    {/* bot_ask_location */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Preguntar Ubicación al Entregar</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Pregunta al chofer su ubicación GPS actual al reportar una entrega.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.bot_ask_location === 'true'}
                                            onCheckedChange={handleToggleAskLocation}
                                        />
                                    </div>

                                    {/* bot_location_mandatory */}
                                    <div className={`flex flex-row items-center justify-between p-4 rounded-xl border transition-all ${
                                        settings.bot_ask_location === 'true' 
                                            ? 'bg-muted/20 border-muted/40' 
                                            : 'bg-muted/5 border-muted/20 opacity-50'
                                    }`}>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Hacer Ubicación de Entrega Obligatoria</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Impide omitir el envío de ubicación para reportar el estado.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.bot_location_mandatory === 'true'}
                                            onCheckedChange={handleToggleLocationMandatory}
                                            disabled={settings.bot_ask_location !== 'true'}
                                        />
                                    </div>

                                    {/* bot_live_tracking */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Activar Rastreo GPS en Vivo</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Solicita compartir ubicación en tiempo real al chofer al iniciar su jornada.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.bot_live_tracking === 'true'}
                                            onCheckedChange={handleToggleLiveTracking}
                                        />
                                    </div>

                                    {/* bot_live_tracking_mandatory */}
                                    <div className={`flex flex-row items-center justify-between p-4 rounded-xl border transition-all ${
                                        settings.bot_live_tracking === 'true' 
                                            ? 'bg-muted/20 border-muted/40' 
                                            : 'bg-muted/5 border-muted/20 opacity-50'
                                    }`}>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Hacer Rastreo en Vivo Obligatorio</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                El bot no permitirá ver entregas hasta que se active el rastreo en vivo.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.bot_live_tracking_mandatory === 'true'}
                                            onCheckedChange={handleToggleLiveTrackingMandatory}
                                            disabled={settings.bot_live_tracking !== 'true'}
                                        />
                                    </div>

                                    {/* bot_ask_start_location */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Ubicación al Iniciar Ruta</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Requisito de GPS cuando inicia su ruta logístico.
                                            </span>
                                        </div>
                                        <div className="w-[140px]">
                                            <Select
                                                value={settings.bot_ask_start_location || 'optional'}
                                                onValueChange={(val) => setSettings(prev => ({ ...prev, bot_ask_start_location: val }))}
                                            >
                                                <SelectTrigger className="rounded-xl font-bold bg-background border-muted focus:ring-blue-500">
                                                    <SelectValue placeholder="Seleccione" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-lg border-muted">
                                                    <SelectItem value="disabled" className="font-semibold text-slate-500">Deshabilitado</SelectItem>
                                                    <SelectItem value="optional" className="font-semibold">Opcional</SelectItem>
                                                    <SelectItem value="mandatory" className="font-semibold text-amber-600">Obligatorio</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* bot_ask_first_client */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Preguntar Primer Cliente</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Requisito de elegir el primer cliente a visitar al iniciar la ruta.
                                            </span>
                                        </div>
                                        <div className="w-[140px]">
                                            <Select
                                                value={settings.bot_ask_first_client || 'optional'}
                                                onValueChange={(val) => setSettings(prev => ({ ...prev, bot_ask_first_client: val }))}
                                            >
                                                <SelectTrigger className="rounded-xl font-bold bg-background border-muted focus:ring-blue-500">
                                                    <SelectValue placeholder="Seleccione" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-lg border-muted">
                                                    <SelectItem value="disabled" className="font-semibold text-slate-500">Deshabilitado</SelectItem>
                                                    <SelectItem value="optional" className="font-semibold">Opcional</SelectItem>
                                                    <SelectItem value="mandatory" className="font-semibold text-amber-600">Obligatorio</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* bot_ask_return_location */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Ubicación al Iniciar Retorno</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Requisito de GPS cuando inicia el viaje de regreso a la empresa.
                                            </span>
                                        </div>
                                        <div className="w-[140px]">
                                            <Select
                                                value={settings.bot_ask_return_location || 'optional'}
                                                onValueChange={(val) => setSettings(prev => ({ ...prev, bot_ask_return_location: val }))}
                                            >
                                                <SelectTrigger className="rounded-xl font-bold bg-background border-muted focus:ring-blue-500">
                                                    <SelectValue placeholder="Seleccione" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-lg border-muted">
                                                    <SelectItem value="optional" className="font-semibold">Opcional</SelectItem>
                                                    <SelectItem value="mandatory" className="font-semibold text-amber-600">Obligatorio</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* bot_ask_arrival_location */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Ubicación al Llegar a Empresa</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Requisito de GPS al finalizar ruta y reportar llegada física.
                                            </span>
                                        </div>
                                        <div className="w-[140px]">
                                            <Select
                                                value={settings.bot_ask_arrival_location || 'mandatory'}
                                                onValueChange={(val) => setSettings(prev => ({ ...prev, bot_ask_arrival_location: val }))}
                                            >
                                                <SelectTrigger className="rounded-xl font-bold bg-background border-muted focus:ring-blue-500">
                                                    <SelectValue placeholder="Seleccione" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-lg border-muted">
                                                    <SelectItem value="optional" className="font-semibold">Opcional</SelectItem>
                                                    <SelectItem value="mandatory" className="font-semibold text-amber-600">Obligatorio</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* bot_require_evidence_photo */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Foto de Evidencia (Entrega)</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Exigir foto de soporte al chofer (mermas, rechazos, incompleto o completo).
                                            </span>
                                        </div>
                                        <div className="w-[140px]">
                                            <Select
                                                value={settings.bot_require_evidence_photo || 'disabled'}
                                                onValueChange={(val) => setSettings(prev => ({ ...prev, bot_require_evidence_photo: val }))}
                                            >
                                                <SelectTrigger className="rounded-xl font-bold bg-background border-muted focus:ring-blue-500">
                                                    <SelectValue placeholder="Seleccione" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-lg border-muted">
                                                    <SelectItem value="disabled" className="font-semibold text-slate-500">Desactivada</SelectItem>
                                                    <SelectItem value="optional" className="font-semibold text-blue-600">Opcional</SelectItem>
                                                    <SelectItem value="mandatory" className="font-semibold text-amber-600">Obligatoria</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* bot_require_invoice_photo */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold">Foto de Factura Firmada</Label>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">MODO SIMPLE y AVANZADO</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Exigir foto de la factura física firmada por el cliente de recibido.
                                            </span>
                                        </div>
                                        <div className="w-[140px]">
                                            <Select
                                                value={settings.bot_require_invoice_photo || 'disabled'}
                                                onValueChange={(val) => setSettings(prev => ({ ...prev, bot_require_invoice_photo: val }))}
                                            >
                                                <SelectTrigger className="rounded-xl font-bold bg-background border-muted focus:ring-blue-500">
                                                    <SelectValue placeholder="Seleccione" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-lg border-muted">
                                                    <SelectItem value="disabled" className="font-semibold text-slate-500">Desactivada</SelectItem>
                                                    <SelectItem value="optional" className="font-semibold text-blue-600">Opcional</SelectItem>
                                                    <SelectItem value="mandatory" className="font-semibold text-amber-600">Obligatoria</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Input Options */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Release Code Override timer */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                                        Espera Override (Min)
                                    </Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="60"
                                        value={settings.release_codes_override_min}
                                        onChange={(e) => setSettings(prev => ({ ...prev, release_codes_override_min: e.target.value }))}
                                        className="rounded-lg font-bold"
                                    />
                                    <span className="text-[10px] text-muted-foreground block font-medium">
                                        Minutos de inactividad para bypass del bot.
                                    </span>
                                </div>

                                {/* Night cleanup time */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                                        Barrido Nocturno (Hora)
                                    </Label>
                                    <Input
                                        type="text"
                                        placeholder="HH:MM"
                                        value={settings.hora_barrido_fin_jornada}
                                        onChange={(e) => setSettings(prev => ({ ...prev, hora_barrido_fin_jornada: e.target.value }))}
                                        className="rounded-lg font-bold"
                                    />
                                    <span className="text-[10px] text-muted-foreground block font-medium">
                                        Cierre automático de rutas huérfanas.
                                    </span>
                                </div>

                                {/* Search results limit */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                        <SlidersHorizontal className="w-3.5 h-3.5 text-purple-500" />
                                        Límite de Búsqueda Bot
                                    </Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="15"
                                        value={settings.limite_coincidencias}
                                        onChange={(e) => setSettings(prev => ({ ...prev, limite_coincidencias: e.target.value }))}
                                        className="rounded-lg font-bold"
                                    />
                                    <span className="text-[10px] text-muted-foreground block font-medium">
                                        Máx documentos en el chat de Telegram.
                                    </span>
                                </div>
                            </div>

                            <Separator />

                            {/* Consecutivos de Recolecta */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-1.5">
                                    <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Consecutivo de Boletas de Entregas (Incidencias / Devoluciones)</span>
                                </div>
                                <p className="text-xs text-muted-foreground font-medium">
                                    Configure el prefijo y número correlativo automático que se imprimirá e identificará las Boletas oficiales de Entrega (ej. BOL-000001).
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-emerald-500/5 dark:bg-emerald-950/10 border border-emerald-500/10 rounded-xl">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                            Prefijo de Consecutivo
                                         </Label>
                                        <Input
                                            type="text"
                                            value={settings.boleta_consecutive_prefix || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, boleta_consecutive_prefix: e.target.value }))}
                                            className="rounded-lg font-bold focus-visible:ring-emerald-500"
                                            placeholder="BOL-"
                                        />
                                        <span className="text-[10px] text-muted-foreground block font-medium">
                                            Prefijo utilizado al generar boletas de chofer (ej. BOL-, INC-, DEV-).
                                        </span>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                            Siguiente Número
                                        </Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={settings.boleta_consecutive_next || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, boleta_consecutive_next: e.target.value }))}
                                            className="rounded-lg font-bold focus-visible:ring-emerald-500"
                                            placeholder="1"
                                        />
                                        <span className="text-[10px] text-muted-foreground block font-medium">
                                            Siguiente correlativo a asignar secuencialmente.
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Correos de Notificación por Defecto */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-1.5">
                                    <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">Correos de Notificación por Defecto (Incidencias)</span>
                                </div>
                                <p className="text-xs text-muted-foreground font-medium">
                                    Defina los correos del departamento de logística o compras que recibirán las boletas de devolución o entrega incompleta de manera predeterminada.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-blue-500/5 dark:bg-blue-950/10 border border-blue-500/10 rounded-xl">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                            Correo para Boleta de Retorno / Devolución Total
                                         </Label>
                                        <Input
                                            type="email"
                                            value={settings.default_retry_email || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, default_retry_email: e.target.value }))}
                                            className="rounded-lg font-bold focus-visible:ring-blue-500"
                                            placeholder="logistica@empresa.com"
                                        />
                                        <span className="text-[10px] text-muted-foreground block font-medium">
                                            Se usará si el cliente rechaza totalmente el pedido.
                                        </span>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                            Correo para Boleta de Entrega Incompleta
                                        </Label>
                                        <Input
                                            type="email"
                                            value={settings.default_partial_email || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, default_partial_email: e.target.value }))}
                                            className="rounded-lg font-bold focus-visible:ring-blue-500"
                                            placeholder="logistica@empresa.com"
                                        />
                                        <span className="text-[10px] text-muted-foreground block font-medium">
                                            Se usará si quedan productos faltantes en la entrega.
                                        </span>
                                    </div>
                                </div>

                                {/* Supervisión de Entregas vía Telegram (Múltiples Chat IDs) */}
                                <div className="space-y-4 pt-4 border-t border-muted/40">
                                    <div className="flex items-center gap-2">
                                        <Send className="w-4 h-4 text-sky-500" />
                                        <span className="text-sm font-bold text-sky-600 dark:text-sky-400">Avisos a Supervisores vía Telegram (Múltiples Destinatarios)</span>
                                        <Badge variant="outline" className="text-[9px] font-extrabold bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300">
                                            Canal de Supervisión
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Permite enviar una copia en tiempo real de los reportes de entrega directamente a los supervisores o grupos de Telegram (choferes finalizando entregas desde APK o Telegram).
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-sky-500/5 dark:bg-sky-950/10 border border-sky-500/15 rounded-xl">
                                        <div className="md:col-span-2 space-y-2">
                                            <Label className="text-xs font-bold flex items-center justify-between text-muted-foreground uppercase tracking-wider">
                                                <span>Telegram Chat IDs de Supervisores / Grupos</span>
                                                <span className="text-[10px] text-sky-600 font-extrabold normal-case">Admite varios separados por coma o salto de línea</span>
                                            </Label>
                                            <Textarea
                                                rows={2}
                                                value={settings.supervisor_telegram_chat_ids || ''}
                                                onChange={(e) => setSettings(prev => ({ ...prev, supervisor_telegram_chat_ids: e.target.value }))}
                                                className="rounded-lg font-mono text-xs focus-visible:ring-sky-500 bg-background"
                                                placeholder="-1002345678901, 987654321, 123456789"
                                            />
                                            <span className="text-[10px] text-muted-foreground block font-medium">
                                                Para grupos o canales use el ID que inicia en <code>-100...</code> o IDs personales de supervisores.
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                Filtro de Eventos a Notificar
                                            </Label>
                                            <Select
                                                value={settings.supervisor_telegram_filter || 'all'}
                                                onValueChange={(val) => setSettings(prev => ({ ...prev, supervisor_telegram_filter: val }))}
                                            >
                                                <SelectTrigger className="rounded-lg font-bold bg-background border-muted text-xs h-9">
                                                    <SelectValue placeholder="Seleccione eventos" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl shadow-lg border-muted">
                                                    <SelectItem value="all" className="text-xs font-bold text-emerald-600">
                                                        ✅ Todas las entregas (Completas, Incidencias y Rechazos)
                                                    </SelectItem>
                                                    <SelectItem value="incidents_only" className="text-xs font-bold text-amber-600">
                                                        ⚠️ Solo Incidencias (Incompletas y Rechazadas)
                                                    </SelectItem>
                                                    <SelectItem value="rejected_only" className="text-xs font-bold text-rose-600">
                                                        ❌ Solo Entregas Rechazadas
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span className="text-[10px] text-muted-foreground block font-medium">
                                                Filtre la intensidad de mensajes que reciben los supervisores en Telegram.
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Consecutivos de Recolecta */}
                                <div className="space-y-4 pt-4 border-t border-muted/40">
                                    <div className="flex items-center gap-2">
                                        <SlidersHorizontal className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">Consecutivo de Solicitudes de Recolecta</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Configure el prefijo y el número secuencial para las órdenes de retiro y solicitudes de recolecta a proveedor (`/dashboard/operations/logistics/collect`).
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-purple-500/5 dark:bg-purple-950/10 border border-purple-500/10 rounded-xl">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                Prefijo Consecutivo
                                            </Label>
                                            <Input
                                                type="text"
                                                value={settings.collect_consecutive_prefix || ''}
                                                onChange={(e) => setSettings(prev => ({ ...prev, collect_consecutive_prefix: e.target.value }))}
                                                className="rounded-lg font-bold focus-visible:ring-purple-500"
                                                placeholder="REC-"
                                            />
                                            <span className="text-[10px] text-muted-foreground block font-medium">
                                                Prefijo utilizado al generar la solicitud (ej. REC-).
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                Siguiente Número
                                            </Label>
                                            <Input
                                                type="number"
                                                value={settings.collect_consecutive_next || ''}
                                                onChange={(e) => setSettings(prev => ({ ...prev, collect_consecutive_next: e.target.value }))}
                                                className="rounded-lg font-bold focus-visible:ring-purple-500"
                                                placeholder="1"
                                            />
                                            <span className="text-[10px] text-muted-foreground block font-medium">
                                                El siguiente número secuencial que se asignará automáticamente.
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Consecutivos y Correos de Hoja de Ruta */}
                                <div className="space-y-4 pt-4 border-t border-muted/40">
                                    <div className="flex items-center gap-2">
                                        <SlidersHorizontal className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                        <span className="text-sm font-bold text-sky-600 dark:text-sky-400">Consecutivo y Correos de Hoja de Ruta</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Configure el prefijo, número correlativo y correos (como Epson Connect y respaldos) que recibirán las Hojas de Ruta en el cuerpo del correo al finalizar la ruta.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-sky-500/5 dark:bg-sky-950/10 border border-sky-500/10 rounded-xl">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                Prefijo Consecutivo
                                            </Label>
                                            <Input
                                                type="text"
                                                value={settings.route_consecutive_prefix || ''}
                                                onChange={(e) => setSettings(prev => ({ ...prev, route_consecutive_prefix: e.target.value }))}
                                                className="rounded-lg font-bold focus-visible:ring-sky-500"
                                                placeholder="RUT-"
                                            />
                                            <span className="text-[10px] text-muted-foreground block font-medium">
                                                Prefijo para el identificador (ej. RUT-).
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                Siguiente Número
                                            </Label>
                                            <Input
                                                type="number"
                                                value={settings.route_consecutive_next || ''}
                                                onChange={(e) => setSettings(prev => ({ ...prev, route_consecutive_next: e.target.value }))}
                                                className="rounded-lg font-bold focus-visible:ring-sky-500"
                                                placeholder="1"
                                            />
                                            <span className="text-[10px] text-muted-foreground block font-medium">
                                                Siguiente número secuencial a asignar.
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                Correos de Notificación
                                            </Label>
                                            <Input
                                                type="text"
                                                value={settings.notificaciones_ruta_emails || ''}
                                                onChange={(e) => setSettings(prev => ({ ...prev, notificaciones_ruta_emails: e.target.value }))}
                                                className="rounded-lg font-bold focus-visible:ring-sky-500"
                                                placeholder="logistica@empresa.com,epson@connect.com"
                                            />
                                            <span className="text-[10px] text-muted-foreground block font-medium">
                                                Correos separados por comas.
                                            </span>
                                        </div>

                                        <div className="space-y-2 md:col-span-3">
                                            <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                🏷️ Código Documental y Control ISO 9001 (Membrete Superior)
                                            </Label>
                                            <Input
                                                type="text"
                                                value={settings.route_sheet_iso_text || ''}
                                                onChange={(e) => setSettings(prev => ({ ...prev, route_sheet_iso_text: e.target.value }))}
                                                className="rounded-lg font-bold focus-visible:ring-sky-500"
                                                placeholder="DOC-LOG-04 | Ver. 02 | Sistema de Gestión de Calidad ISO 9001:2015"
                                            />
                                            <span className="text-[10px] text-muted-foreground block font-medium">
                                                Este texto se imprimirá en el membrete superior de todas las hojas para cumplimiento de control de información documentada ISO 9001.
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                 {/* Notificaciones Omnicanal (SMS Gateway) */}
                                 <div className="space-y-4 pt-2">
                                     <div className="flex items-center gap-2 flex-wrap">
                                         <Send className="w-5 h-5 text-emerald-500" />
                                         <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Servidor SMS Gateway & Notificaciones Omnicanal</h3>
                                         <PlatformBadge type="all" />
                                     </div>
                                     <p className="text-xs text-muted-foreground font-medium">
                                         Configure la estrategia de notificaciones de la operación y el servidor Gateway SMS (Telegram + SMS Gateway con fallback).
                                     </p>

                                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                         {/* Frecuencia de rastreo GPS APK */}
                                         <div className="space-y-2">
                                             <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                 ⏱️ Rastreo GPS APK (Min)
                                             </Label>
                                             <Select 
                                                 value={settings.apk_tracking_interval_minutes || '5'}
                                                 onValueChange={(val) => setSettings(prev => ({ ...prev, apk_tracking_interval_minutes: val }))}
                                             >
                                                 <SelectTrigger className="h-9 font-bold text-xs rounded-lg">
                                                     <SelectValue placeholder="Seleccione intervalo" />
                                                 </SelectTrigger>
                                                 <SelectContent>
                                                     <SelectItem value="3">Cada 3 minutos (Alta precisión)</SelectItem>
                                                     <SelectItem value="5">Cada 5 minutos (Predeterminado - Recomendado)</SelectItem>
                                                     <SelectItem value="10">Cada 10 minutos (Ahorro batería)</SelectItem>
                                                     <SelectItem value="15">Cada 15 minutos</SelectItem>
                                                 </SelectContent>
                                             </Select>
                                             <span className="text-[10px] text-muted-foreground block font-medium">
                                                 Intervalo del despertador background en la APK Flutter (~1.5% batería/día).
                                             </span>
                                         </div>

                                         {/* Estrategia de Notificación */}
                                         <div className="space-y-2">
                                             <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                 📲 Estrategia de Avisos
                                             </Label>
                                             <Select 
                                                 value={settings.notification_strategy || 'solamente_telegram'}
                                                 onValueChange={(val) => setSettings(prev => ({ ...prev, notification_strategy: val }))}
                                             >
                                                 <SelectTrigger className="h-9 font-bold text-xs rounded-lg">
                                                     <SelectValue placeholder="Seleccione estrategia" />
                                                 </SelectTrigger>
                                                 <SelectContent>
                                                     <SelectItem value="solamente_telegram">Solamente Telegram Bot</SelectItem>
                                                     <SelectItem value="solamente_sms">Solamente SMS Gateway (Android)</SelectItem>
                                                     <SelectItem value="ambos">Ambos Canales en Paralelo (Telegram + SMS)</SelectItem>
                                                     <SelectItem value="fallback_sms">Fallback Inteligente (Telegram ➔ SMS si falla)</SelectItem>
                                                 </SelectContent>
                                             </Select>
                                             <span className="text-[10px] text-muted-foreground block font-medium">
                                                 Los SMS usan el número registrado en el perfil (/dashboard/profile).
                                             </span>
                                         </div>

                                         {/* IP / URL Servidor SMS Gateway */}
                                         <div className="space-y-2">
                                             <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                                 🌐 URL Servidor SMS Gateway
                                             </Label>
                                             <Input
                                                 type="text"
                                                 value={settings.sms_gateway_url || ''}
                                                 onChange={(e) => setSettings(prev => ({ ...prev, sms_gateway_url: e.target.value }))}
                                                 className="rounded-lg font-bold text-xs"
                                                 placeholder="http://192.168.1.50:8082"
                                             />
                                             <span className="text-[10px] text-muted-foreground block font-medium">
                                                 IP local o remota del teléfono Android ejecutando traccar-sms-gateway.
                                             </span>
                                         </div>

                                         {/* Centralized Note pointing to IT Tools Mobile */}
                                         <div className="space-y-1 md:col-span-3 p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-900/40 text-xs">
                                             <span className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                                                 🚨 Teléfonos Departamento de TI (Alertas Críticas SMS)
                                             </span>
                                             <p className="text-[11px] text-muted-foreground">
                                                 Los números celulares del Departamento de TI para alertas de emergencia SMS han sido reubicados y unificados en <a href="/dashboard/it-tools/mobile" className="underline font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950">Herramientas TI / Gestión Móvil MDM (/dashboard/it-tools/mobile)</a> junto al canal de contingencia Telegram.
                                             </p>
                                         </div>
                                     </div>
                                 </div>
                            </div>
                        </CardContent>

                        <CardFooter className="bg-muted/10 p-4 border-t border-muted/30 flex justify-end">
                            <Button 
                                onClick={handleSaveSettings} 
                                disabled={savingSettings}
                                className="rounded-xl gap-2 font-bold shadow-md shadow-blue-100 dark:shadow-none bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Save className="w-4 h-4" />
                                {savingSettings ? 'Guardando...' : 'Guardar Parámetros'}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Control de Geografía de Costa Rica */}
                    <Card className="border-none shadow-md overflow-hidden relative bg-card">
                        <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full bg-indigo-500/10 pointer-events-none" />
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-2">
                                <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                                <CardTitle className="text-xl">Control de Geografía de Costa Rica</CardTitle>
                            </div>
                            <CardDescription>
                                Administre la estructura de Provincias, Cantones y Distritos cargada en la base de datos.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between p-3.5 bg-muted/20 border border-muted/50 rounded-xl">
                                <div className="space-y-1">
                                    <span className="text-xs font-bold block">Actualizar por archivo (.json, .txt)</span>
                                    <span className="text-[10px] text-muted-foreground font-semibold block">
                                        Arrastre o seleccione un nuevo archivo de catálogo geográfico para precargarlo en el editor.
                                    </span>
                                </div>
                                <div className="relative shrink-0">
                                    <input
                                        type="file"
                                        accept=".json,.txt"
                                        onChange={handleFileUpload}
                                        id="geo-file-upload"
                                        className="hidden"
                                    />
                                    <Button
                                        asChild
                                        variant="outline"
                                        className="h-9 font-bold rounded-xl cursor-pointer hover:bg-muted"
                                    >
                                        <label htmlFor="geo-file-upload">
                                            Seleccionar Archivo
                                        </label>
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Editor de Geografía (JSON)</Label>
                                    <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-none bg-blue-500/10 text-blue-600 font-extrabold">
                                        Editable en caliente
                                    </Badge>
                                </div>
                                <Textarea
                                    value={rawGeoJson}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRawGeoJson(e.target.value)}
                                    className="w-full h-80 font-mono text-[11px] leading-relaxed p-4 bg-muted/30 border border-muted/70 rounded-xl focus:ring-indigo-500"
                                    placeholder="Cargando JSON geográfico..."
                                    spellCheck={false}
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="bg-muted/10 p-4 border-t border-muted/30 flex items-center justify-between flex-wrap gap-3">
                            <Button
                                onClick={handleRestoreGeography}
                                disabled={restoringGeo || savingGeo}
                                variant="outline"
                                className="rounded-xl gap-2 font-bold text-destructive hover:bg-destructive/10 border-destructive/20"
                            >
                                <RefreshCw className={`w-4 h-4 ${restoringGeo ? 'animate-spin' : ''}`} />
                                Restaurar por Defecto
                            </Button>
                            
                            <Button
                                onClick={handleSaveGeography}
                                disabled={savingGeo || restoringGeo}
                                className="rounded-xl gap-2 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 dark:shadow-none"
                            >
                                <Save className="w-4 h-4" />
                                {savingGeo ? 'Guardando...' : 'Guardar Geografía'}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* Routes List & Builder */}
                <div>
                    <Card className="border-none shadow-md bg-card h-full flex flex-col">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-2">
                                <Route className="w-5 h-5 text-indigo-600" />
                                <CardTitle className="text-xl">Rutas Logísticas</CardTitle>
                            </div>
                            <CardDescription>
                                Administre la nomenclatura de rutas de la flota para autoarmados y despachos diarios.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 flex-1">
                            {/* Costa Rica Geographic Selector Assistance */}
                            {geographyData && (
                                <div className="space-y-3 p-3 bg-muted/20 border border-muted/50 rounded-xl">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                                        Asistente de Ubicación (Componer Ruta)
                                    </span>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[9px] font-bold text-muted-foreground">Provincia</Label>
                                            <Select value={selectedProvince} onValueChange={(val) => {
                                                setSelectedProvince(val);
                                                setSelectedCanton('');
                                                setSelectedDistrict('');
                                            }}>
                                                <SelectTrigger className="h-8 rounded-lg text-xs font-bold bg-background">
                                                    <SelectValue placeholder="Provincia" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {provinces.map(p => (
                                                        <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[9px] font-bold text-muted-foreground">Cantón</Label>
                                            <Select value={selectedCanton} onValueChange={(val) => {
                                                setSelectedCanton(val);
                                                setSelectedDistrict('');
                                            }} disabled={!selectedProvince}>
                                                <SelectTrigger className="h-8 rounded-lg text-xs font-bold bg-background">
                                                    <SelectValue placeholder="Cantón" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {cantons.map(c => (
                                                        <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[9px] font-bold text-muted-foreground">Distrito</Label>
                                            <Select value={selectedDistrict} onValueChange={(val) => {
                                                setSelectedDistrict(val);
                                                if (selectedProvince && selectedCanton && val) {
                                                    const provName = geographyData.provincias[selectedProvince].nombre;
                                                    const cantName = geographyData.provincias[selectedProvince].cantones[selectedCanton].nombre;
                                                    const distName = geographyData.provincias[selectedProvince].cantones[selectedCanton].distritos[val];
                                                    setNewRouteName(`Ruta: ${provName} - ${cantName} - ${distName}`);
                                                }
                                            }} disabled={!selectedCanton}>
                                                <SelectTrigger className="h-8 rounded-lg text-xs font-bold bg-background">
                                                    <SelectValue placeholder="Distrito" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {districts.map(d => (
                                                        <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* New Route Form */}
                            <form onSubmit={handleCreateRoute} className="flex gap-2">
                                <Input
                                    placeholder="Nombre de ruta (ej: RUTA 1)"
                                    value={newRouteName}
                                    onChange={(e) => setNewRouteName(e.target.value)}
                                    className="rounded-lg font-bold flex-1"
                                />
                                <Button 
                                    type="submit" 
                                    disabled={creatingRoute}
                                    className="rounded-lg shrink-0 p-3 bg-indigo-600 hover:bg-indigo-700 text-white"
                                >
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </form>

                            <Separator className="my-2" />

                            {/* Routes Table / List */}
                            <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                                {routes.length === 0 ? (
                                    <div className="text-center p-6 bg-muted/20 rounded-xl border border-dashed border-muted text-xs text-muted-foreground font-semibold">
                                        No hay rutas configuradas.
                                    </div>
                                ) : (
                                    routes.map((route) => (
                                        <div 
                                            key={route.id}
                                            className="flex items-center justify-between p-3 bg-muted/20 border border-muted/50 rounded-xl hover:bg-muted/30 transition-colors"
                                        >
                                            <div className="space-y-0.5">
                                                <span className="text-sm font-bold text-foreground">{route.name}</span>
                                                <div className="flex items-center">
                                                    {route.active === 1 ? (
                                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[9px] font-extrabold px-1.5 py-0 border-none">
                                                            Activa
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-muted text-muted-foreground border-muted text-[9px] font-extrabold px-1.5 py-0 border-none">
                                                            Inactiva
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={route.active === 1}
                                                    onCheckedChange={(checked) => handleToggleRoute(route.id, checked)}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                                                    onClick={() => handleDeleteRoute(route.id, route.name)}
                                                    type="button"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
                    </div>
                </TabsContent>

                <TabsContent value="apk" className="mt-0 outline-none">
                    <Card className="border-none shadow-md overflow-hidden relative bg-card">
                        <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full bg-emerald-500/10 pointer-events-none" />
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">📱</span>
                                <CardTitle className="text-xl">Configuración Remota de APK Nativa</CardTitle>
                            </div>
                            <CardDescription>
                                Ajuste los permisos, botones y comportamientos del teléfono móvil del chofer remotamente. (Los cambios aplicarán en la próxima sincronización del dispositivo).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Signature Settings */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                Firma Digital Obligatoria
                                            </Label>
                                            <PlatformBadge type="apk" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Obligar al chofer a recabar firma al cliente en pantalla.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.apk_require_signature === 'true'}
                                        onCheckedChange={(val) => setSettings(prev => ({ ...prev, apk_require_signature: val ? 'true' : 'false' }))}
                                    />
                                </div>

                                {/* Evidence Photo Settings */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                Foto de Evidencia Obligatoria
                                            </Label>
                                            <PlatformBadge type="apk" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Obligar captura de foto de evidencia antes de completar entrega.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.apk_require_evidence_photo === 'mandatory'}
                                        onCheckedChange={(val) => setSettings(prev => ({ ...prev, apk_require_evidence_photo: val ? 'mandatory' : 'disabled' }))}
                                    />
                                </div>

                                {/* Invoice Photo Settings */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                Foto de Factura Firmada
                                            </Label>
                                            <PlatformBadge type="apk" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Obligar foto de factura física sellada antes de cerrar.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.apk_require_invoice_photo === 'mandatory'}
                                        onCheckedChange={(val) => setSettings(prev => ({ ...prev, apk_require_invoice_photo: val ? 'mandatory' : 'disabled' }))}
                                    />
                                </div>

                                {/* Incident Notes Settings */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                Motivo Obligatorio en Rechazo / Parcial
                                            </Label>
                                            <PlatformBadge type="apk" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Obligar al chofer a escribir el motivo en Notas si la entrega es Parcial o Rechazada.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.apk_require_incident_notes === 'true' || settings.apk_require_incident_notes === 'mandatory'}
                                        onCheckedChange={(val) => setSettings(prev => ({ ...prev, apk_require_incident_notes: val ? 'true' : 'false' }))}
                                    />
                                </div>

                                {/* Print button */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                Botón Imprimir Recibo Térmico
                                            </Label>
                                            <PlatformBadge type="apk" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Habilita o deshabilita la opción de imprimir vía Bluetooth.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.driver_boleta_print_enabled !== 'false'}
                                        onCheckedChange={(val) => setSettings(prev => ({ ...prev, driver_boleta_print_enabled: val ? 'true' : 'false' }))}
                                    />
                                </div>
                                {/* Reversión de Entregas por Chofer */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                Permitir Reversión de Entregas en APK
                                            </Label>
                                            <PlatformBadge type="apk" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Permite a los choferes revertir entregas finalizadas a pendiente desde el celular.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.allow_driver_revert_delivery === '1' || settings.allow_driver_revert_delivery === 'true'}
                                        onCheckedChange={(c) => setSettings(prev => ({ ...prev, allow_driver_revert_delivery: c ? '1' : '0' }))}
                                    />
                                </div>

                                {/* Sync Interval Settings */}
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                                Sincronización en Segundo Plano
                                            </Label>
                                            <PlatformBadge type="apk" />
                                        </div>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Frecuencia en minutos con la que la APK consulta y sube datos (Mín. 5 min).
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min="5"
                                            max="120"
                                            value={settings.apk_background_sync_minutes || '5'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, apk_background_sync_minutes: e.target.value }))}
                                            className="w-20 font-bold text-center rounded-lg"
                                        />
                                        <span className="text-xs font-bold text-muted-foreground">min</span>
                                    </div>
                                </div>
                            </div>

                            {/* Notificaciones: Chofer en Espera de Atención (⏱️ APK) */}
                            <div className="p-4 bg-amber-500/5 dark:bg-amber-950/10 border border-amber-500/20 rounded-xl space-y-3">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-amber-500" />
                                    <Label className="text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                        Notificaciones de Chofer en Espera de Atención (⏱️ Botón de Reloj)
                                    </Label>
                                    <PlatformBadge type="apk" />
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Canales a notificar cuando el chofer pulsa el botón de reloj ⏱️ en la app indicando que está esperando ser atendido en el cliente.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                    {/* Email Vendedor */}
                                    <div className="flex items-center justify-between p-3 bg-background/80 rounded-lg border">
                                        <div className="space-y-0.5 pr-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5">
                                                <Mail className="w-3.5 h-3.5 text-blue-500" /> Email al Vendedor
                                            </Label>
                                            <span className="text-[10px] text-muted-foreground block">
                                                Enviar correo al vendedor asignado al cliente.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.notif_waiting_email_salesperson === '1' || settings.notif_waiting_email_salesperson === 'true' || settings.notif_waiting_email_salesperson === undefined}
                                            onCheckedChange={(c) => setSettings(prev => ({ ...prev, notif_waiting_email_salesperson: c ? '1' : '0' }))}
                                        />
                                    </div>

                                    {/* Email Creador Pedido */}
                                    <div className="flex items-center justify-between p-3 bg-background/80 rounded-lg border">
                                        <div className="space-y-0.5 pr-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5">
                                                <Mail className="w-3.5 h-3.5 text-indigo-500" /> Email a Creador / Facturador
                                            </Label>
                                            <span className="text-[10px] text-muted-foreground block">
                                                Enviar correo a quien creó/facturó el pedido en ERP.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.notif_waiting_email_creator === '1' || settings.notif_waiting_email_creator === 'true' || settings.notif_waiting_email_creator === undefined}
                                            onCheckedChange={(c) => setSettings(prev => ({ ...prev, notif_waiting_email_creator: c ? '1' : '0' }))}
                                        />
                                    </div>

                                    {/* Telegram Vendedor */}
                                    <div className="flex items-center justify-between p-3 bg-background/80 rounded-lg border">
                                        <div className="space-y-0.5 pr-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5">
                                                <Send className="w-3.5 h-3.5 text-sky-500" /> Telegram al Vendedor
                                            </Label>
                                            <span className="text-[10px] text-muted-foreground block">
                                                Enviar al Telegram Chat ID del vendedor (/admin/users).
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.notif_waiting_telegram_salesperson === '1' || settings.notif_waiting_telegram_salesperson === 'true'}
                                            onCheckedChange={(c) => setSettings(prev => ({ ...prev, notif_waiting_telegram_salesperson: c ? '1' : '0' }))}
                                        />
                                    </div>

                                    {/* Telegram Creador Pedido */}
                                    <div className="flex items-center justify-between p-3 bg-background/80 rounded-lg border">
                                        <div className="space-y-0.5 pr-2">
                                            <Label className="text-xs font-bold flex items-center gap-1.5">
                                                <Send className="w-3.5 h-3.5 text-sky-500" /> Telegram a Creador / Facturador
                                            </Label>
                                            <span className="text-[10px] text-muted-foreground block">
                                                Enviar al Telegram Chat ID de quien creó el pedido.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.notif_waiting_telegram_creator === '1' || settings.notif_waiting_telegram_creator === 'true'}
                                            onCheckedChange={(c) => setSettings(prev => ({ ...prev, notif_waiting_telegram_creator: c ? '1' : '0' }))}
                                        />
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-300">Plantilla de Boleta Térmica e Impresión</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Configure el formato, métodos y diseño del recibo físico (impresión ESC/POS 58mm o 80mm).
                                    </p>
                                </div>

                                <div className="p-4 bg-muted/20 rounded-xl border border-muted/40 space-y-2">
                                    <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                        Método de Impresión Térmica Visible para Choferes
                                    </Label>
                                    <select
                                        value={settings.driver_boleta_print_method || 'all'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, driver_boleta_print_method: e.target.value }))}
                                        className="w-full h-10 px-3 rounded-lg border border-input bg-background font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="all">🌟 Mostrar Todos los Métodos (Opción 1 + Opción 2 + Chrome + RawBT)</option>
                                        <option value="option1">⚡ Opción 1: Clic Print Connector (App Nativa WebView + JS Bridge)</option>
                                        <option value="option2">🚀 Opción 2: Clic Print Intent (Navegador Chrome + clicprint://)</option>
                                        <option value="rawbt">📱 RawBT (App de Pago externa)</option>
                                    </select>
                                    <span className="text-[10px] text-muted-foreground block font-medium">
                                        Permite definir centralizadamente si los choferes ven todas las opciones o únicamente el método preferido.
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="flex flex-row items-center justify-between p-4 bg-emerald-950/10 rounded-xl border border-emerald-500/20 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-sm font-bold">Imprimir Datos del Cliente</Label>
                                            <span className="text-xs text-muted-foreground block">
                                                Incluir Nombre y Código del Cliente en la boleta.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.apk_print_show_client !== 'false'}
                                            onCheckedChange={(val) => setSettings(prev => ({ ...prev, apk_print_show_client: val ? 'true' : 'false' }))}
                                        />
                                    </div>
                                    <div className="flex flex-row items-center justify-between p-4 bg-emerald-950/10 rounded-xl border border-emerald-500/20 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-sm font-bold">Imprimir Detalle de Artículos</Label>
                                            <span className="text-xs text-muted-foreground block">
                                                Tabla con Código, Pedido, Entregado y Faltante.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.apk_print_show_lines !== 'false'}
                                            onCheckedChange={(val) => setSettings(prev => ({ ...prev, apk_print_show_lines: val ? 'true' : 'false' }))}
                                        />
                                    </div>
                                    <div className="flex flex-row items-center justify-between p-4 bg-emerald-950/10 rounded-xl border border-emerald-500/20 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-sm font-bold">Texto en Negrita (Bold)</Label>
                                            <span className="text-xs text-muted-foreground block">
                                                {settings.apk_print_bold === 'true' ? 'Fuerza texto oscurecido / grueso.' : 'Texto normal claro y legible (Recomendado).'}
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.apk_print_bold === 'true'}
                                            onCheckedChange={(val) => setSettings(prev => ({ ...prev, apk_print_bold: val ? 'true' : 'false' }))}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 p-4 bg-emerald-950/10 rounded-xl border border-emerald-500/20">
                                    <Label className="text-sm font-bold">Mensaje Institucional (Pie de Boleta)</Label>
                                    <Textarea
                                        value={settings.apk_print_footer_text ?? ''}
                                        onChange={(e) => setSettings(prev => ({ ...prev, apk_print_footer_text: e.target.value }))}
                                        placeholder="Ej: ¡Gracias por preferirnos! No se aceptan devoluciones..."
                                        className="h-20 bg-background resize-none text-sm font-mono"
                                    />
                                </div>
                            </div>

                            <Separator />

                            {/* Break Timers & Anti-Fraud Section */}
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                                        <span>☕</span> Control de Pausas, Marcas de Tiempo y Motor Anti-Fraude
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Parametrice las duraciones de almuerzo y meriendas, habilite el temporizador en la APK y configure el detector anti-fraude por GPS.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Enable Break Timer Toggle */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-blue-950/10 rounded-xl border border-blue-500/20 gap-3">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold flex items-center gap-1.5">
                                                    Habilitar Módulo de Pausas en APK
                                                </Label>
                                                <PlatformBadge type="apk" />
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Mostrar la opción &quot;Pausas / Marcas de Tiempo&quot; en el menú lateral del celular.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.apk_enable_break_timer !== 'false'}
                                            onCheckedChange={(val) => setSettings(prev => ({ ...prev, apk_enable_break_timer: val ? 'true' : 'false' }))}
                                        />
                                    </div>

                                    {/* GPS Anti-Fraud Engine Toggle */}
                                    <div className="flex flex-row items-center justify-between p-4 bg-blue-950/10 rounded-xl border border-blue-500/20 gap-3">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Label className="text-sm font-bold flex items-center gap-1.5">
                                                    Motor Anti-Fraude con GPS Camión
                                                </Label>
                                                <PlatformBadge type="web" />
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium block">
                                                Cruzar telemetría (motor encendido/velocidad) para detectar falsas pausas y paradas no declaradas.
                                            </span>
                                        </div>
                                        <Switch
                                            checked={settings.ops_enable_gps_tamper_detection !== 'false'}
                                            onCheckedChange={(val) => setSettings(prev => ({ ...prev, ops_enable_gps_tamper_detection: val ? 'true' : 'false' }))}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-blue-950/10 rounded-xl border border-blue-500/20">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold">🥐 Merienda Mañana (Min)</Label>
                                        <Input
                                            type="number"
                                            value={settings.break_time_breakfast_min ?? '15'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, break_time_breakfast_min: e.target.value }))}
                                            className="h-9 font-mono text-sm bg-background"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold">🍱 Almuerzo (Min)</Label>
                                        <Input
                                            type="number"
                                            value={settings.break_time_lunch_min ?? '45'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, break_time_lunch_min: e.target.value }))}
                                            className="h-9 font-mono text-sm bg-background"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold">☕ Merienda Tarde (Min)</Label>
                                        <Input
                                            type="number"
                                            value={settings.break_time_snack_min ?? '15'}
                                            onChange={(e) => setSettings(prev => ({ ...prev, break_time_snack_min: e.target.value }))}
                                            className="h-9 font-mono text-sm bg-background"
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        
                        <CardFooter className="bg-muted/10 p-4 border-t border-muted/30 flex justify-end">
                            <Button 
                                onClick={handleSaveSettings} 
                                disabled={savingSettings}
                                className="rounded-xl gap-2 font-bold shadow-md shadow-emerald-100 dark:shadow-none bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                <Save className="w-4 h-4" />
                                {savingSettings ? 'Guardando...' : 'Guardar Parámetros de APK'}
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* AlertDialog para confirmación de eliminación de ruta */}
            <AlertDialog open={!!routeToDelete} onOpenChange={(open) => { if (!open) setRouteToDelete(null); }}>
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-destructive" />
                            ¿Eliminar Ruta de Entrega?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm">
                            ¿Está seguro de eliminar la ruta <strong className="text-foreground">{routeToDelete?.name}</strong>? 
                            Esta acción no se puede deshacer y desvinculará las asignaciones asociadas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={executeDeleteRoute}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold rounded-xl"
                        >
                            Sí, Eliminar Ruta
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* AlertDialog para confirmación de restauración de catálogo geográfico */}
            <AlertDialog open={showRestoreGeoDialog} onOpenChange={setShowRestoreGeoDialog}>
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-amber-500" />
                            ¿Restaurar Catálogo Geográfico por Defecto?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm">
                            ¿Está seguro de restaurar el catálogo geográfico por defecto de Costa Rica? 
                            Esta acción sobrescribirá cualquier personalización manual que haya realizado en provincias, cantones y distritos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={executeRestoreGeography}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl"
                        >
                            Sí, Restaurar Catálogo
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
