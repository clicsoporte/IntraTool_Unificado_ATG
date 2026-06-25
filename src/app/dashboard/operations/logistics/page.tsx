'use client';

import React from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Truck, Package, ArrowRight, ClipboardList, ShieldAlert, Users, RefreshCw, FileText } from 'lucide-react';
import Link from 'next/link';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';

export default function LogisticsParentPage() {
    const { setTitle } = usePageTitle();
    const { hasPermission, isLoading } = useAuthorization(['deliveries:read', 'deliveries:collect', 'deliveries:customers', 'deliveries:route-sheets']);

    React.useEffect(() => {
        setTitle("Logística y Distribución");
    }, [setTitle]);

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="flex items-center justify-center p-12 bg-card rounded-2xl border border-muted animate-pulse max-w-5xl mx-auto">
                    <div className="text-center space-y-4">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                        <p className="text-muted-foreground font-medium">Cargando permisos de logística...</p>
                    </div>
                </div>
            </main>
        );
    }

    const canReadDeliveries = hasPermission('deliveries:read') || hasPermission('deliveries:write') || hasPermission('deliveries:admin');
    const canCollect = hasPermission('deliveries:collect') || hasPermission('deliveries:write') || hasPermission('deliveries:admin');
    const canManageCustomers = hasPermission('deliveries:customers') || hasPermission('deliveries:admin');
    const canReadRouteSheets = hasPermission('deliveries:route-sheets') || hasPermission('deliveries:admin') || hasPermission('deliveries:read') || hasPermission('deliveries:write');

    if (!canReadDeliveries && !canCollect && !canManageCustomers && !canReadRouteSheets) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 animate-in fade-in duration-500">
                <div className="mx-auto max-w-md bg-card border border-rose-200 rounded-2xl p-6 text-center space-y-4 shadow-lg">
                    <div className="p-3 bg-rose-100 text-rose-600 rounded-full w-fit mx-auto">
                        <ShieldAlert className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold text-rose-800">Acceso Restringido</h2>
                        <p className="text-sm text-muted-foreground">
                            No tienes permisos suficientes para acceder al módulo de logística. Contacta a un administrador para obtener acceso.
                        </p>
                    </div>
                    <div className="pt-2">
                        <Link href="/dashboard" className="inline-flex items-center justify-center px-4 py-2 bg-muted text-muted-foreground rounded-xl hover:bg-muted/80 text-sm font-semibold transition-colors">
                            Volver al Inicio
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 animate-in fade-in duration-500">
            <div className="mx-auto max-w-5xl space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-muted pb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-100 dark:shadow-none">
                            <Truck className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight">Módulo de Logística y Rutas</h1>
                            <p className="text-muted-foreground font-medium">Gestión de entregas de clientes y recolección de proveedores.</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Card 1: Deliveries & Dispatch */}
                    {canReadDeliveries ? (
                        <Link href="/dashboard/operations/logistics/deliveries" prefetch={false}>
                            <Card className="group hover:shadow-xl transition-all border border-muted hover:border-blue-200 shadow-sm overflow-hidden relative h-full flex flex-col justify-between">
                                <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full bg-blue-600 opacity-10 group-hover:scale-110 transition-transform" />
                                <CardHeader className="pb-2 flex flex-row items-center gap-4">
                                    <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                                        <ClipboardList className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">Monitor de Rutas y Despacho</CardTitle>
                                        <CardDescription>Entregas y Asignaciones</CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col justify-between pt-2">
                                    <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                                        Gestión y monitoreo en tiempo real de camiones, rutas de entrega de mercadería a clientes, y asignación de despachos diarios.
                                    </p>
                                    <div className="flex items-center gap-1 text-sm font-bold text-blue-600">
                                        Ingresar a Despacho <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ) : (
                        <Card className="opacity-60 border border-dashed border-muted bg-muted/20 h-full flex flex-col justify-between">
                            <CardHeader className="pb-2 flex flex-row items-center gap-4">
                                <div className="p-3 bg-muted text-muted-foreground rounded-xl">
                                    <ClipboardList className="w-6 h-6" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl text-muted-foreground">Monitor de Rutas y Despacho</CardTitle>
                                    <CardDescription>Acceso no autorizado</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                                    Requiere permiso `deliveries:read` o `deliveries:write` para acceder a la cola de entregas y asignación de vehículos.
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Card 2: Collect requests (Compras) */}
                    {canCollect ? (
                        <Link href="/dashboard/operations/logistics/collect" prefetch={false}>
                            <Card className="group hover:shadow-xl transition-all border border-muted hover:border-purple-200 shadow-sm overflow-hidden relative h-full flex flex-col justify-between">
                                <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full bg-purple-600 opacity-10 group-hover:scale-110 transition-transform" />
                                <CardHeader className="pb-2 flex flex-row items-center gap-4">
                                    <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                                        <Package className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">Solicitud de Recolecta</CardTitle>
                                        <CardDescription>Compras a Proveedores</CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col justify-between pt-2">
                                    <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                                        Creación de solicitudes para retirar mercadería de proveedores. Permite agendar retiros en ruta para ser coordinados por transporte.
                                    </p>
                                    <div className="flex items-center gap-1 text-sm font-bold text-purple-600">
                                        Crear Solicitud de Retiro <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ) : (
                        <Card className="opacity-60 border border-dashed border-muted bg-muted/20 h-full flex flex-col justify-between">
                            <CardHeader className="pb-2 flex flex-row items-center gap-4">
                                <div className="p-3 bg-muted text-muted-foreground rounded-xl">
                                    <Package className="w-6 h-6" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl text-muted-foreground">Solicitud de Recolecta</CardTitle>
                                    <CardDescription>Acceso no autorizado</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                                    Requiere permiso `deliveries:collect` para registrar solicitudes de recolectas y retiro de mercaderías con proveedores.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                    {/* Card 3: Clientes y Ubicaciones */}
                    {canManageCustomers ? (
                        <Link href="/dashboard/clientes" prefetch={false}>
                            <Card className="group hover:shadow-xl transition-all border border-muted hover:border-indigo-200 shadow-sm overflow-hidden relative h-full flex flex-col justify-between">
                                <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full bg-indigo-600 opacity-10 group-hover:scale-110 transition-transform" />
                                <CardHeader className="pb-2 flex flex-row items-center gap-4">
                                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                                        <Users className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">Clientes y Ubicaciones</CardTitle>
                                        <CardDescription>Geolocalizaciones de Entrega</CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col justify-between pt-2">
                                    <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                                        Gestión de direcciones de embarque para clientes e integración de coordenadas GPS para navegación en Waze y Google Maps.
                                    </p>
                                    <div className="flex items-center gap-1 text-sm font-bold text-indigo-600">
                                        Administrar Clientes <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ) : (
                        <Card className="opacity-60 border border-dashed border-muted bg-muted/20 h-full flex flex-col justify-between">
                            <CardHeader className="pb-2 flex flex-row items-center gap-4">
                                <div className="p-3 bg-muted text-muted-foreground rounded-xl">
                                    <Users className="w-6 h-6" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl text-muted-foreground">Clientes y Ubicaciones</CardTitle>
                                    <CardDescription>Acceso no autorizado</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                                    Requiere permiso `deliveries:customers` para visualizar y actualizar geolocalizaciones de clientes.
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Card 4: Hojas de Ruta */}
                    {canReadRouteSheets ? (
                        <Link href="/dashboard/operations/logistics/deliveries/route-sheets" prefetch={false}>
                            <Card className="group hover:shadow-xl transition-all border border-muted hover:border-emerald-200 shadow-sm overflow-hidden relative h-full flex flex-col justify-between">
                                <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full bg-emerald-600 opacity-10 group-hover:scale-110 transition-transform" />
                                <CardHeader className="pb-2 flex flex-row items-center gap-4">
                                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">Hojas de Ruta</CardTitle>
                                        <CardDescription>Documentos y Archivos</CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col justify-between pt-2">
                                    <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                                        Historial de hojas de ruta finalizadas. Permite reimprimir boletas en tamaño carta, descargar PDF y reenviar correos de cierre.
                                    </p>
                                    <div className="flex items-center gap-1 text-sm font-bold text-emerald-600">
                                        Ver Hojas de Ruta <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ) : (
                        <Card className="opacity-60 border border-dashed border-muted bg-muted/20 h-full flex flex-col justify-between">
                            <CardHeader className="pb-2 flex flex-row items-center gap-4">
                                <div className="p-3 bg-muted text-muted-foreground rounded-xl">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl text-muted-foreground">Hojas de Ruta</CardTitle>
                                    <CardDescription>Acceso no autorizado</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                                    Requiere permiso `deliveries:route-sheets` para ver el historial y archivos de hojas de ruta de distribución.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </main>
    );
}
