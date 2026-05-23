'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from '@/modules/core/hooks/use-toast';
import { Bell, Wrench, ShieldAlert } from 'lucide-react';
import { toggleFleetMilestoneAction } from '../lib/actions';

interface NotificationSettingsClientProps {
    settings: any[];
}

export default function NotificationSettingsClient({ settings }: NotificationSettingsClientProps) {
    const { toast } = useToast();
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

    const rtvOptions = ['60', '30', '15', '8', '2', '1', '0'];
    const permitOptions = ['60', '30', '15', '8', '2', '1', '0'];
    const oilOptions = ['90', '95', '100', '110', '120', '130', '140', '150'];
    const preventativeOptions = ['90', '95', '100', '110', '120', '130', '140', '150'];

    const getIsChecked = (category: string, value: string) => {
        // If there are no settings of this category stored yet, default all to true
        const categorySettings = settings.filter(s => s.category === category);
        if (categorySettings.length === 0) return true;
        return categorySettings.some(s => s.value === value);
    };

    const handleToggle = async (category: 'rtv_milestone' | 'permit_milestone' | 'oil_milestone' | 'preventative_milestone', value: string, currentChecked: boolean) => {
        const key = `${category}-${value}`;
        setLoadingMap(prev => ({ ...prev, [key]: true }));

        try {
            // If it is the first time modifying this category, populate the other options as enabled first
            const categorySettings = settings.filter(s => s.category === category);
            if (categorySettings.length === 0) {
                const options = 
                    category === 'rtv_milestone' ? rtvOptions : 
                    category === 'permit_milestone' ? permitOptions : 
                    category === 'oil_milestone' ? oilOptions : 
                    preventativeOptions;
                // Save all other options as active, and skip/delete this option
                for (const opt of options) {
                    if (opt !== value) {
                        await toggleFleetMilestoneAction(category, opt, true);
                    }
                }
                // Toggle this specific one to false
                await toggleFleetMilestoneAction(category, value, false);
            } else {
                await toggleFleetMilestoneAction(category, value, !currentChecked);
            }

            toast({
                title: "Configuración Actualizada",
                description: `El hito de ${value}${category.includes('milestone') && category !== 'rtv_milestone' && category !== 'permit_milestone' ? '%' : ' días'} fue ${!currentChecked ? 'habilitado' : 'deshabilitado'} correctamente.`,
            });
        } catch (e: any) {
            toast({
                variant: "destructive",
                title: "Error al actualizar",
                description: e.message || "Ocurrió un problema de red.",
            });
        } finally {
            setLoadingMap(prev => ({ ...prev, [key]: false }));
        }
    };

    return (
        <Card className="border-blue-200 md:col-span-2 shadow-md">
            <CardHeader className="pb-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 rounded-t-xl">
                <CardTitle className="text-xl flex items-center gap-2 text-blue-800">
                    <Bell className="w-5 h-5 text-blue-600 animate-pulse" />
                    Configuración de Periodicidad de Avisos y Notificaciones
                </CardTitle>
                <CardDescription className="text-sm font-medium">
                    Personalice con cuánta antelación y con qué frecuencia el sistema enviará correos y mensajes de Telegram.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
                {/* RTV & Permits Date Milestones */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-purple-600" />
                        Vencimientos de RTV (Revisión Técnica Vehicular)
                    </h3>
                    <p className="text-xs text-muted-foreground -mt-2">Seleccione los días de anticipación con los que desea recibir alertas:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                        {rtvOptions.map(val => {
                            const isChecked = getIsChecked('rtv_milestone', val);
                            const key = `rtv_milestone-${val}`;
                            const isLoading = !!loadingMap[key];
                            return (
                                <div 
                                    key={val} 
                                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all duration-200 ${
                                        isChecked 
                                            ? 'bg-blue-50/50 border-blue-200 text-blue-900 shadow-sm shadow-blue-50/20' 
                                            : 'bg-white border-slate-100 hover:border-slate-200 text-slate-600'
                                    }`}
                                >
                                    <Checkbox 
                                        id={key}
                                        checked={isChecked}
                                        disabled={isLoading}
                                        onCheckedChange={() => handleToggle('rtv_milestone', val, isChecked)}
                                    />
                                    <label htmlFor={key} className="text-xs md:text-sm font-semibold cursor-pointer select-none">
                                        {val === '0' ? 'Hoy mismo' : val === '1' ? '1 día antes' : `${val} días antes`}
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Permits Date Milestones */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-indigo-600" />
                        Vencimientos de Permisos Especiales
                    </h3>
                    <p className="text-xs text-muted-foreground -mt-2">Seleccione los días de anticipación con los que desea recibir alertas:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                        {permitOptions.map(val => {
                            const isChecked = getIsChecked('permit_milestone', val);
                            const key = `permit_milestone-${val}`;
                            const isLoading = !!loadingMap[key];
                            return (
                                <div 
                                    key={val} 
                                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all duration-200 ${
                                        isChecked 
                                            ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900 shadow-sm shadow-indigo-50/20' 
                                            : 'bg-white border-slate-100 hover:border-slate-200 text-slate-600'
                                    }`}
                                >
                                    <Checkbox 
                                        id={key}
                                        checked={isChecked}
                                        disabled={isLoading}
                                        onCheckedChange={() => handleToggle('permit_milestone', val, isChecked)}
                                    />
                                    <label htmlFor={key} className="text-xs md:text-sm font-semibold cursor-pointer select-none">
                                        {val === '0' ? 'Hoy mismo' : val === '1' ? '1 día antes' : `${val} días antes`}
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Oil Odometer Milestones */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-emerald-600" />
                        Cambios de Aceite y Odómetro (Kilometraje)
                    </h3>
                    <p className="text-xs text-muted-foreground -mt-2">Seleccione los hitos porcentuales de uso del aceite en los que desea recibir alertas:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
                        {oilOptions.map(val => {
                            const isChecked = getIsChecked('oil_milestone', val);
                            const key = `oil_milestone-${val}`;
                            const isLoading = !!loadingMap[key];
                            return (
                                <div 
                                    key={val} 
                                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all duration-200 ${
                                        isChecked 
                                            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 shadow-sm shadow-emerald-50/20' 
                                            : 'bg-white border-slate-100 hover:border-slate-200 text-slate-600'
                                    }`}
                                >
                                    <Checkbox 
                                        id={key}
                                        checked={isChecked}
                                        disabled={isLoading}
                                        onCheckedChange={() => handleToggle('oil_milestone', val, isChecked)}
                                    />
                                    <label htmlFor={key} className="text-xs md:text-sm font-semibold cursor-pointer select-none">
                                        {val}%
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Preventative Odometer Milestones */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-purple-600" />
                        Planes Preventivos Personalizados (Kilometraje o Horas)
                    </h3>
                    <p className="text-xs text-muted-foreground -mt-2">Seleccione los hitos porcentuales de desgaste del componente en los que desea recibir alertas:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
                        {preventativeOptions.map(val => {
                            const isChecked = getIsChecked('preventative_milestone', val);
                            const key = `preventative_milestone-${val}`;
                            const isLoading = !!loadingMap[key];
                            return (
                                <div 
                                    key={val} 
                                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all duration-200 ${
                                        isChecked 
                                            ? 'bg-purple-50/50 border-purple-200 text-purple-900 shadow-sm shadow-purple-50/20' 
                                            : 'bg-white border-slate-100 hover:border-slate-200 text-slate-600'
                                    }`}
                                >
                                    <Checkbox 
                                        id={key}
                                        checked={isChecked}
                                        disabled={isLoading}
                                        onCheckedChange={() => handleToggle('preventative_milestone', val, isChecked)}
                                    />
                                    <label htmlFor={key} className="text-xs md:text-sm font-semibold cursor-pointer select-none">
                                        {val}%
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
