'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { 
    Truck, 
    FileText, 
    SlidersHorizontal, 
    ArrowRight, 
    Lock,
    Settings,
    RefreshCw
} from 'lucide-react';

export default function OperationsAdminIndexPage() {
    const { setTitle } = usePageTitle();
    const { hasPermission, isLoading: authLoading } = useAuthorization(['deliveries:admin']);

    useEffect(() => {
        setTitle('Administración de Operaciones');
    }, [setTitle]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse m-6">
                <div className="text-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                    <p className="text-muted-foreground font-medium">Cargando panel de operaciones...</p>
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

    const modules = [
        {
            id: 'deliveries',
            title: 'Entregas y Despacho',
            description: 'Configure parámetros de despacho general, auto-ruteador del ERP, editor de geografía de Costa Rica y reglas del asistente de Telegram.',
            href: '/dashboard/admin/operations/deliveries',
            icon: Truck,
            badge: 'Activo',
            badgeVariant: 'default' as const,
            statusColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
            active: true
        },
        {
            id: 'boletas',
            title: 'Boletas Operativas',
            description: 'Gestión de plantillas de boletas, resoluciones de impresión móvil, firmas digitales de recepción física y flujos de boletas del Bot.',
            href: '#',
            icon: FileText,
            badge: 'Próximamente',
            badgeVariant: 'outline' as const,
            statusColor: 'text-muted-foreground bg-muted/10 border-muted',
            active: false
        },
        {
            id: 'contingencia',
            title: 'Auditoría e Inventario de Ruta',
            description: 'Gestión de devoluciones físicas al almacén por mermas, arqueo rápido de camiones en ruta y reportería de rechazos históricos.',
            href: '#',
            icon: SlidersHorizontal,
            badge: 'Próximamente',
            badgeVariant: 'outline' as const,
            statusColor: 'text-muted-foreground bg-muted/10 border-muted',
            active: false
        }
    ];

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-500/10">
                    <Settings className="w-6 h-6 animate-spin" style={{ animationDuration: '6s' }} />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-foreground">Panel de Control de Operaciones</h1>
                    <p className="text-muted-foreground text-sm font-medium">
                        Directorio centralizado para la administración y configuración de los submódulos logísticos de IntraTool.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                {modules.map((mod) => {
                    const Icon = mod.icon;
                    return (
                        <Card 
                            key={mod.id} 
                            className={`border border-muted/70 shadow-sm relative overflow-hidden flex flex-col h-[260px] transition-all duration-300 ${
                                mod.active 
                                    ? 'hover:shadow-md hover:border-blue-500/50 hover:bg-blue-500/[0.01] group' 
                                    : 'opacity-70 border-dashed bg-muted/5'
                            }`}
                        >
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div className={`p-2.5 rounded-xl border ${mod.active ? 'bg-blue-600/5 border-blue-500/10 text-blue-600 group-hover:scale-105 transition-transform' : 'bg-muted border-muted/50 text-muted-foreground'}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <Badge 
                                        variant={mod.badgeVariant} 
                                        className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${mod.statusColor}`}
                                    >
                                        {mod.badge}
                                    </Badge>
                                </div>
                                <CardTitle className="text-md font-extrabold pt-4 text-foreground leading-snug">
                                    {mod.title}
                                </CardTitle>
                                <CardDescription className="text-xs font-semibold leading-relaxed text-muted-foreground pt-1.5 line-clamp-3">
                                    {mod.description}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="flex-1 flex items-end pb-5">
                                {mod.active ? (
                                    <Link href={mod.href} prefetch={false} className="w-full">
                                        <Button 
                                            className="w-full h-9 rounded-xl font-extrabold text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-100 dark:shadow-none justify-between pl-4 pr-3 group-hover:translate-x-0.5 transition-transform"
                                        >
                                            <span>Administrar Submódulo</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </Button>
                                    </Link>
                                ) : (
                                    <Button 
                                        disabled
                                        variant="secondary"
                                        className="w-full h-9 rounded-xl font-bold text-xs gap-1.5 justify-center"
                                    >
                                        <Lock className="w-3.5 h-3.5" />
                                        <span>Submódulo Bloqueado</span>
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
