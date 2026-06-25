'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Truck, LayoutDashboard, CalendarRange, Settings, RefreshCw, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';

export default function DeliveriesLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { isAuthorized, isLoading, hasPermission } = useAuthorization(['deliveries:read']);
    const [isTvQuery, setIsTvQuery] = React.useState(false);

    React.useEffect(() => {
        const handleLocationChange = () => {
            const params = new URLSearchParams(window.location.search);
            setIsTvQuery(params.get('tv') === 'true');
        };

        handleLocationChange();

        window.addEventListener('popstate', handleLocationChange);
        window.addEventListener('locationchange', handleLocationChange);

        return () => {
            window.removeEventListener('popstate', handleLocationChange);
            window.removeEventListener('locationchange', handleLocationChange);
        };
    }, []);

    const tabs = (isLoading || isTvQuery) ? [] : [
        {
            href: '/dashboard/operations/logistics/deliveries',
            label: 'Dashboard Realtime',
            icon: LayoutDashboard,
            active: pathname === '/dashboard/operations/logistics/deliveries',
            visible: hasPermission('deliveries:read')
        },
        {
            href: '/dashboard/operations/logistics/deliveries/operation',
            label: 'Operación y Despacho',
            icon: CalendarRange,
            active: pathname === '/dashboard/operations/logistics/deliveries/operation',
            visible: hasPermission('deliveries:write')
        },
        {
            href: '/dashboard/operations/logistics/deliveries/map',
            label: 'Mapa Satelital 🗺️',
            icon: MapPin,
            active: pathname === '/dashboard/operations/logistics/deliveries/map',
            visible: hasPermission('deliveries:read')
        },
        {
            href: '/dashboard/admin/operations',
            label: 'Configuración',
            icon: Settings,
            active: pathname === '/dashboard/admin/operations',
            visible: hasPermission('deliveries:admin')
        }
    ].filter(tab => tab.visible);

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse max-w-7xl mx-auto">
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                        <p className="text-muted-foreground font-medium">Verificando credenciales logísticas...</p>
                    </div>
                </div>
            </main>
        );
    }

    if (!isAuthorized) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="text-center text-red-500 font-bold p-12 bg-rose-50 border border-rose-200 rounded-2xl max-w-7xl mx-auto space-y-2 shadow-sm">
                    <h3 className="text-lg font-black text-rose-700">Acceso Denegado</h3>
                    <p className="text-xs text-rose-600 font-medium">Se requiere el permiso de visualización de entregas (deliveries:read) para acceder a este módulo.</p>
                </div>
            </main>
        );
    }

    return (
        <main className={`flex-1 animate-in fade-in duration-500 ${isTvQuery ? 'p-2' : 'p-3 md:p-6 lg:p-8'}`}>
            <div className={`mx-auto space-y-6 ${isTvQuery ? 'max-w-none w-full px-2' : 'max-w-7xl'}`}>
                {!isTvQuery && (
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-muted">
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="p-2.5 md:p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-100 dark:shadow-none shrink-0">
                                <Truck className="w-6 h-6 md:w-8 md:h-8" />
                            </div>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Monitor de Entregas v2.1</h1>
                                <p className="text-[11px] md:text-sm text-muted-foreground font-medium">Control omnicanal, concurrencia en tiempo real y asignación de rutas.</p>
                            </div>
                        </div>

                        {tabs.length > 0 && (
                            <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl overflow-x-auto max-w-full shrink-0 w-full md:w-auto flex-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {tabs.map((tab) => (
                                    <Button
                                        key={tab.href}
                                        asChild
                                        variant={tab.active ? 'default' : 'ghost'}
                                        className="shrink-0 rounded-lg gap-1.5 text-[11px] sm:text-xs font-bold transition-all px-2.5 py-1 h-8"
                                        size="sm"
                                    >
                                        <Link href={tab.href} prefetch={false}>
                                            <tab.icon className="w-3.5 h-3.5" />
                                            {tab.label}
                                        </Link>
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="w-full">
                    {children}
                </div>
            </div>
        </main>
    );
}
