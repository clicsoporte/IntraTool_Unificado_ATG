import React from 'react';
import { getDb } from '@/modules/core/lib/db';
import { getCurrentUser, hasPermission } from '@/modules/core/lib/auth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { AnalyticsViewTabs } from '@/modules/operations/components/AnalyticsViewTabs';

export const metadata = {
    title: 'Analítica Logística & KPIs Gerenciales | Clic-Tools',
    description: 'Indicadores OTIF, tiempos en cliente, desempeño de choferes y utilización de camiones.'
};

export default async function LogisticsAnalyticsPage() {
    const user = await getCurrentUser();
    
    // Auth Check
    if (!user) {
        return (
            <div className="p-6 max-w-4xl mx-auto text-center">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center justify-center gap-2">
                            <ShieldAlert className="h-6 w-6" /> Acceso Denegado
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Debe iniciar sesión para consultar los reportes gerenciales.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const canReadAnalytics = await hasPermission(Number(user.id), 'deliveries:analytics:read') || 
                             await hasPermission(Number(user.id), 'deliveries:analytics:read:all') || 
                             user.role === 'admin' || user.role === 'superadmin';

    if (!canReadAnalytics) {
        return (
            <div className="p-6 max-w-4xl mx-auto text-center">
                <Card className="border-red-200">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center justify-center gap-2">
                            <ShieldAlert className="h-6 w-6" /> Acceso Restringido
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground text-sm">
                            No posees el permiso <code className="text-amber-600 font-mono">deliveries:analytics:read</code> para consultar la Analítica y KPIs de logística.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const db = await getDb();
    const hasGlobalPermission = user.role === 'admin' || user.role === 'superadmin' || user.role === 'logistics_manager';

    // Catalog queries for filters dropdowns (lightweight)
    const rawDrivers = db.prepare(`
        SELECT DISTINCT name FROM core_users WHERE role IN ('driver', 'chofer', 'transportista', 'logistics', 'admin', 'superadmin')
        UNION
        SELECT DISTINCT gestionado_por as name FROM ops_delivery_queue WHERE gestionado_por IS NOT NULL AND gestionado_por != ''
    `).all() as { name: string }[];
    const driversList = rawDrivers.map(d => d.name).filter(Boolean);

    const rawRoutes = db.prepare(`
        SELECT id, name FROM ops_delivery_routes WHERE active = 1 ORDER BY name ASC
    `).all() as { id: number; name: string }[];
    const routesList = JSON.parse(JSON.stringify(rawRoutes));

    const rawVehicles = db.prepare(`
        SELECT DISTINCT plate FROM fleet_vehicles WHERE plate IS NOT NULL AND plate != '' ORDER BY plate ASC
    `).all() as { plate: string }[];
    const vehiclesList = rawVehicles.map(v => v.plate).filter(Boolean);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <BarChart3 className="h-7 w-7 text-primary" />
                        Centro de Analítica Logística & KPIs Gerenciales
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Indicadores OTIF, tiempos en cliente, rendimiento de rutas, desempeño de choferes y uso de camiones.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={hasGlobalPermission ? "default" : "outline"} className="px-3 py-1 text-xs">
                        {hasGlobalPermission ? "🌐 Vista Global Empresa" : `👤 Scoped: ${user.erpAlias || user.name}`}
                    </Badge>
                    <Link
                        href="/dashboard/operations/logistics/deliveries"
                        className="inline-flex items-center justify-center rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                    >
                        🚚 Monitor de Entregas
                    </Link>
                </div>
            </div>

            {/* Interactive Client Analytics Container */}
            <AnalyticsViewTabs
                initialQueueDocs={[]}
                initialAssignments={[]}
                driversList={driversList}
                routesList={routesList}
                vehiclesList={vehiclesList}
            />
        </div>
    );
}
