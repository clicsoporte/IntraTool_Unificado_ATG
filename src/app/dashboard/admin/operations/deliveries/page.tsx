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
    Clock, 
    SlidersHorizontal,
    RefreshCw,
    Trash2
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

export default function AdminOperationsPage() {
    const { toast } = useToast();
    const { setTitle } = usePageTitle();
    const { hasPermission, isLoading: authLoading } = useAuthorization(['deliveries:admin']);
    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [creatingRoute, setCreatingRoute] = useState(false);

    // Settings State
    const [settings, setSettings] = useState({
        delivery_mode: 'sencillo',
        release_codes_enabled: 'false',
        release_codes_override_min: '5',
        visibilidad_alertas: 'normal',
        hora_barrido_fin_jornada: '19:00',
        limite_coincidencias: '5',
        notificaciones_email: 'true',
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
        default_retry_email: 'logistica@empresa.com',
        default_partial_email: 'logistica@empresa.com',
        route_consecutive_prefix: 'RUT-',
        route_consecutive_next: '1',
        notificaciones_ruta_emails: 'logistica@empresa.com'
    });

    const handleToggleAskNextClient = (checked: boolean) => {
        setSettings(prev => {
            const next = { ...prev, bot_ask_next_client: checked ? 'true' : 'false' };
            if (!checked) {
                next.bot_next_client_mandatory = 'false';
            }
            return next;
        });
    };

    const handleToggleNextClientMandatory = (checked: boolean) => {
        setSettings(prev => {
            const next = { ...prev, bot_next_client_mandatory: checked ? 'true' : 'false' };
            if (checked) {
                next.bot_ask_next_client = 'true';
            }
            return next;
        });
    };

    const handleToggleAskLocation = (checked: boolean) => {
        setSettings(prev => {
            const next = { ...prev, bot_ask_location: checked ? 'true' : 'false' };
            if (!checked) {
                next.bot_location_mandatory = 'false';
            }
            return next;
        });
    };

    const handleToggleLocationMandatory = (checked: boolean) => {
        setSettings(prev => {
            const next = { ...prev, bot_location_mandatory: checked ? 'true' : 'false' };
            if (checked) {
                next.bot_ask_location = 'true';
            }
            return next;
        });
    };

    const handleToggleLiveTracking = (checked: boolean) => {
        setSettings(prev => {
            const next = { ...prev, bot_live_tracking: checked ? 'true' : 'false' };
            if (!checked) {
                next.bot_live_tracking_mandatory = 'false';
            }
            return next;
        });
    };

    const handleToggleLiveTrackingMandatory = (checked: boolean) => {
        setSettings(prev => {
            const next = { ...prev, bot_live_tracking_mandatory: checked ? 'true' : 'false' };
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

    useEffect(() => {
        setTitle('Configuración de Entregas');
    }, [setTitle]);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const [fetchedSettings, fetchedRoutes, fetchedGeo] = await Promise.all([
                    getDeliverySettings(),
                    getDeliveryRoutes(),
                    getCostaRicaGeography()
                ]);
                if (fetchedSettings && Object.keys(fetchedSettings).length > 0) {
                    setSettings((prev) => ({ ...prev, ...fetchedSettings }));
                }
                setRoutes(fetchedRoutes);
                setGeographyData(fetchedGeo);
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

    async function handleDeleteRoute(id: number, name: string) {
        if (!confirm(`¿Está seguro de eliminar la ruta "${name}"? Esta acción no se puede deshacer y eliminará las asignaciones asociadas.`)) {
            return;
        }

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
                title: 'Error al eliminar',
                description: e.message || 'No se pudo eliminar la ruta.',
                variant: 'destructive'
            });
        }
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

    async function handleRestoreGeography() {
        if (!confirm('¿Está seguro de restaurar el catálogo geográfico por defecto? Esto sobrescribirá cualquier cambio manual que haya realizado.')) {
            return;
        }
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
                title: 'Error al restaurar',
                description: e.message || 'No se pudo restablecer la geografía.',
                variant: 'destructive'
            });
        } finally {
            setRestoringGeo(false);
        }
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
                            {/* Delivery Mode Toggle */}
                            <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-muted/50">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-bold block">Modo de Operación y Entrega</Label>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            Selecciona si deseas flujos rápidos y simples, o controles detallados de inventario.
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-background p-1.5 rounded-lg border shadow-sm">
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
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-bold flex items-center gap-1.5">
                                            <SlidersHorizontal className="w-4 h-4 text-purple-500" />
                                            Códigos de Validación
                                        </Label>
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
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-bold flex items-center gap-1.5">
                                            <Mail className="w-4 h-4 text-emerald-500" />
                                            Notificar Creador ERP
                                        </Label>
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
                                <div className="flex flex-row items-center justify-between p-4 bg-muted/20 rounded-xl border border-muted/40">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-bold flex items-center gap-1.5">
                                            <Settings className="w-4 h-4 text-blue-500" />
                                            Habilitar Pedidos ERP
                                        </Label>
                                        <span className="text-xs text-muted-foreground font-medium block">
                                            Importar pedidos en cola y bot de Telegram.
                                        </span>
                                    </div>
                                    <Switch
                                        checked={settings.pedidos_enabled !== 'false'}
                                        onCheckedChange={(val) => setSettings(prev => ({ ...prev, pedidos_enabled: val ? 'true' : 'false' }))}
                                    />
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <SlidersHorizontal className="w-5 h-5 text-sky-500" />
                                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Configuración del Bot de Telegram</h3>
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
                                    <span className="text-sm font-bold text-purple-600 dark:text-purple-400">Consecutivo de Recolectas de Proveedores</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-purple-500/5 dark:bg-purple-950/10 border border-purple-500/10 rounded-xl">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                            Prefijo de Consecutivo
                                         </Label>
                                        <Input
                                            type="text"
                                            value={settings.collect_consecutive_prefix || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, collect_consecutive_prefix: e.target.value }))}
                                            className="rounded-lg font-bold focus-visible:ring-purple-500"
                                            placeholder="REC-"
                                        />
                                        <span className="text-[10px] text-muted-foreground block font-medium">
                                            Ej: REC-, RET-, COMP-, etc.
                                        </span>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                                            Siguiente Número
                                        </Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={settings.collect_consecutive_next || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, collect_consecutive_next: e.target.value }))}
                                            className="rounded-lg font-bold focus-visible:ring-purple-500"
                                            placeholder="1"
                                        />
                                        <span className="text-[10px] text-muted-foreground block font-medium">
                                            Siguiente correlativo a asignar (se incrementa automáticamente).
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

                                {/* Consecutivos de Recolecta */}
                                <div className="space-y-4 pt-4 border-t border-muted/40">
                                    <div className="flex items-center gap-2">
                                        <SlidersHorizontal className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">Consecutivo de Solicitudes de Recolecta</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Configure el prefijo y el número siguiente para las solicitudes de recolecta creadas en el sistema.
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
                                                Prefijo utilizado al generar el identificador (ej. REC-).
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
                                                El siguiente número secuencial que se asignará.
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
                                    onChange={(e) => setRawGeoJson(e.target.value)}
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
        </div>
    );
}
