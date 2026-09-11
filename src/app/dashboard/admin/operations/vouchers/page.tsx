'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, SlidersHorizontal, RefreshCw, FileText, CheckCircle2, Hash, Layers } from 'lucide-react';
import Link from 'next/link';
import { getDeliverySettings, updateDeliverySettings } from '@/modules/operations/lib/actions';

export default function VouchersAdminPage() {
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { hasPermission, isLoading: authLoading } = useAuthorization(['deliveries:admin']);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<Record<string, string>>({
        boletas_use_single_consecutive: 'false',
        boleta_consecutive_prefix: 'BOL-',
        boleta_consecutive_next: '1',
        boleta_prefix_devolucion: 'DEV-',
        boleta_next_devolucion: '1',
        boleta_prefix_muestra: 'MUE-',
        boleta_next_muestra: '1',
        boleta_prefix_regalia: 'REG-',
        boleta_next_regalia: '1',
        boleta_prefix_faltante: 'BOL-',
        boleta_next_faltante: '1',
        boletas_require_authorization: 'false'
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getDeliverySettings();
            setSettings(prev => ({ ...prev, ...data }));
        } catch (e) {
            toast({ title: 'Error de carga', description: 'No se pudieron cargar los parámetros.', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        setTitle('Configuración de Boletas Operativas');
        loadData();
    }, [setTitle, loadData]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await updateDeliverySettings(settings);
            if (res.success) {
                toast({ title: 'Configuración Guardada', description: 'Los prefijos y reglas de boletas han sido actualizados.' });
            } else {
                throw new Error(res.error);
            }
        } catch (e: any) {
            toast({ title: 'Error al guardar', description: e.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || loading) {
        return (
            <main className="flex-1 p-6 flex justify-center items-center">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            </main>
        );
    }

    const isSingleConsecutive = settings.boletas_use_single_consecutive === 'true';

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/admin/operations">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-500/10">
                        <FileText className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">Configuración de Boletas Operativas</h1>
                        <p className="text-xs text-muted-foreground font-medium">
                            Consecutivos unificados o por motivo de salida, reglas de firma y autorizaciones de alistamiento.
                        </p>
                    </div>
                </div>

                <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md">
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Guardar Cambios
                </Button>
            </div>

            {/* Reglas de Aprobación */}
            <Card className="border-muted shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Reglas de Autorización de Salida
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Defina si las boletas operativas requieren la aprobación explícita de la jefatura antes de ser enviadas a la Cola General de Despacho.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted/30 border border-muted rounded-xl">
                        <div className="space-y-1">
                            <Label className="text-sm font-bold">Requerir Autorización de Jefatura</Label>
                            <p className="text-xs text-muted-foreground">
                                Si está activo, las nuevas boletas ingresan en estado &apos;Por Autorizar&apos; y no aparecen en el despacho hasta que un supervisor presione &apos;Autorizar&apos;.
                            </p>
                        </div>
                        <Switch
                            checked={settings.boletas_require_authorization === 'true'}
                            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, boletas_require_authorization: checked ? 'true' : 'false' }))}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Modo de Consecutivos (Único Unificado vs Por Motivo) */}
            <Card className="border-muted shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Hash className="w-5 h-5 text-blue-600" /> Modalidad de Secuencia y Consecutivos
                        </span>
                        {isSingleConsecutive ? (
                            <Badge className="bg-blue-600 text-white text-[11px] font-bold">Consecutivo Único Global</Badge>
                        ) : (
                            <Badge variant="outline" className="text-slate-700 border-slate-300 text-[11px] font-bold">Consecutivos por Motivo</Badge>
                        )}
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Elija si todas las salidas de bodega (Regalías, Devoluciones, Muestras, Faltantes) usarán una misma numeración única correlativa o secuencias separadas por tipo.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                        <div className="space-y-1 pr-4">
                            <Label className="text-sm font-bold text-blue-900 dark:text-blue-200">Usar un Único Consecutivo Global para Todas las Boletas</Label>
                            <p className="text-xs text-muted-foreground">
                                Al activar esta opción, todas las boletas creadas (Regalía / Patrocinio, Devolución / Reposición, Muestras Promocionales, Faltantes, etc.) usarán un solo prefijo y una secuencia numérica única e ininterrumpida.
                            </p>
                        </div>
                        <Switch
                            checked={isSingleConsecutive}
                            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, boletas_use_single_consecutive: checked ? 'true' : 'false' }))}
                        />
                    </div>

                    {isSingleConsecutive ? (
                        /* Consecutivo Único Global */
                        <div className="p-4 border border-blue-300 bg-blue-500/10 rounded-xl space-y-3">
                            <h3 className="text-xs font-black text-blue-800 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                                <Layers className="w-4 h-4 text-blue-600" /> Numeración Única Unificada (Todas las Boletas)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prefijo Oficial Global</Label>
                                    <Input
                                        value={settings.boleta_consecutive_prefix || 'BOL-'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_consecutive_prefix: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                        placeholder="BOL-"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Siguiente Número Consecutivo</Label>
                                    <Input
                                        type="number"
                                        value={settings.boleta_consecutive_next || '1'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_consecutive_next: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Consecutivos Separados por Motivo */
                        <div className="space-y-6">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <SlidersHorizontal className="w-4 h-4 text-blue-600" /> Configuración de Consecutivos Independientes por Motivo
                            </div>

                            {/* Faltantes */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-amber-200 bg-amber-500/5 rounded-xl">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-amber-800 uppercase tracking-wider">📦 Faltante ERP / Entrega Incompleta</Label>
                                    <Input
                                        value={settings.boleta_prefix_faltante || settings.boleta_consecutive_prefix || 'BOL-'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_prefix_faltante: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                        placeholder="BOL-"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-amber-800 uppercase tracking-wider">Siguiente Número</Label>
                                    <Input
                                        type="number"
                                        value={settings.boleta_next_faltante || settings.boleta_consecutive_next || '1'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_next_faltante: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                    />
                                </div>
                            </div>

                            {/* Muestras */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-blue-200 bg-blue-500/5 rounded-xl">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-blue-800 uppercase tracking-wider">📄 Muestras Promocionales</Label>
                                    <Input
                                        value={settings.boleta_prefix_muestra || 'MUE-'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_prefix_muestra: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                        placeholder="MUE-"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-blue-800 uppercase tracking-wider">Siguiente Número</Label>
                                    <Input
                                        type="number"
                                        value={settings.boleta_next_muestra || '1'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_next_muestra: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                    />
                                </div>
                            </div>

                            {/* Devoluciones */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-rose-200 bg-rose-500/5 rounded-xl">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-rose-800 uppercase tracking-wider">🔄 Devolución / Reposición</Label>
                                    <Input
                                        value={settings.boleta_prefix_devolucion || 'DEV-'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_prefix_devolucion: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                        placeholder="DEV-"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-rose-800 uppercase tracking-wider">Siguiente Número</Label>
                                    <Input
                                        type="number"
                                        value={settings.boleta_next_devolucion || '1'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_next_devolucion: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                    />
                                </div>
                            </div>

                            {/* Regalías */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-purple-200 bg-purple-500/5 rounded-xl">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-purple-800 uppercase tracking-wider">🎁 Regalía / Patrocinio</Label>
                                    <Input
                                        value={settings.boleta_prefix_regalia || 'REG-'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_prefix_regalia: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                        placeholder="REG-"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-purple-800 uppercase tracking-wider">Siguiente Número</Label>
                                    <Input
                                        type="number"
                                        value={settings.boleta_next_regalia || '1'}
                                        onChange={(e) => setSettings(prev => ({ ...prev, boleta_next_regalia: e.target.value }))}
                                        className="rounded-xl font-bold font-mono text-xs bg-background"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </main>
    );
}
