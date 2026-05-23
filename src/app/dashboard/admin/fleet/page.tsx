import { getFleetSettingsAction, addFleetSettingAction, deleteFleetSettingAction, getAllEmployeesAction } from "@/modules/fleet/lib/actions";
import { Truck, Plus, Trash2, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getCurrentUser, hasPermission } from "@/modules/core/lib/auth";
import { redirect } from "next/navigation";
import AddSettingForm from "@/modules/fleet/components/AddSettingForm";
import ManageDriversClient from "@/modules/fleet/components/ManageDriversClient";
import NotificationSettingsClient from "@/modules/fleet/components/NotificationSettingsClient";

export default async function FleetSettingsPage() {
    const user = await getCurrentUser();
    if (!user) redirect('/');

    const settings = await getFleetSettingsAction();
    const allEmployees = await getAllEmployeesAction();
    const currentDrivers = settings.filter((s: any) => s.category === 'driver');

    const categories = [
        { id: 'brand', name: 'Marcas de Vehículo', permission: 'fleet:settings:brands' },
        { id: 'fuel_type', name: 'Tipos de Combustible', permission: 'fleet:settings:fuel' },
        { id: 'permit_type', name: 'Tipos de Permisos Especiales', permission: 'fleet:settings:permits' },
        { id: 'maintenance_type', name: 'Tipos de Mantenimiento', permission: 'fleet:settings:maintenance' }
    ];

    // Check permissions for each category
    const categoriesWithPermission = await Promise.all(
        categories.map(async (cat) => ({
            ...cat,
            allowed: await hasPermission(user.id, cat.permission as any) || await hasPermission(user.id, 'fleet:settings:manage')
        }))
    );

    const visibleCategories = categoriesWithPermission.filter(cat => cat.allowed);

    if (visibleCategories.length === 0) {
        redirect('/dashboard');
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg text-white">
                    <Truck className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">Configuración de Gestión de Flota</h1>
                    <p className="text-muted-foreground">Administre los catálogos y parámetros maestros del módulo de flota.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Configuración General */}
                <Card className="md:col-span-2 border-emerald-200 bg-emerald-50/30">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2 text-emerald-700">
                            <Settings2 className="w-4 h-4" />
                            Ajustes Generales del Módulo
                        </CardTitle>
                        <CardDescription>
                            Parámetros globales de funcionamiento para la gestión de flota.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-emerald-100 shadow-sm">
                            <div className="space-y-0.5">
                                <h3 className="font-medium text-emerald-900">Ocultar Selección de Conductor</h3>
                                <p className="text-sm text-muted-foreground">Si se activa, el campo de conductor no aparecerá en el formulario de repostaje (uso simplificado).</p>
                            </div>
                            {(() => {
                                const driverSetting = settings.find((s: any) => s.category === 'driver_requirement' && s.value === 'enabled');
                                const isEnabled = !!driverSetting;
                                const settingId = driverSetting?.id; // PRIMITIVE ONLY
                                
                                const toggleAction = async () => {
                                    'use server';
                                    if (isEnabled && settingId) {
                                        await deleteFleetSettingAction(settingId);
                                    } else {
                                        await addFleetSettingAction('driver_requirement', 'enabled');
                                    }
                                };

                                return (
                                    <form action={toggleAction}>
                                        <Button 
                                            variant={isEnabled ? "destructive" : "default"}
                                            className={isEnabled ? "" : "bg-emerald-600 hover:bg-emerald-700"}
                                            type="submit"
                                        >
                                            {isEnabled ? 'Activo (Campo Oculto)' : 'Inactivo (Mostrar Campo)'}
                                        </Button>
                                    </form>
                                );
                            })()}
                        </div>
                    </CardContent>
                </Card>

                {/* Periodicidad de Alertas y Notificaciones */}
                <NotificationSettingsClient settings={settings} />

                {/* Gestión de Choferes */}
                {visibleCategories.some(c => c.id === 'brand') && ( // Assuming if they can manage brands, they can manage drivers.
                    <Card className="md:col-span-2 border-blue-200">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2 text-blue-700">
                                <Users className="w-4 h-4" />
                                Gestión de Choferes (Lista Manual)
                            </CardTitle>
                            <CardDescription>
                                Agrega los empleados de la empresa que están autorizados para conducir los vehículos. Esta será la lista que aparecerá en el formulario de repostaje.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ManageDriversClient currentDrivers={currentDrivers} allEmployees={allEmployees} />
                        </CardContent>
                    </Card>
                )}

                {visibleCategories.map((category) => (
                    <Card key={category.id}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Settings2 className="w-4 h-4 text-blue-500" />
                                {category.name}
                            </CardTitle>
                            <CardDescription>
                                {category.id === 'notification_email'
                                    ? "Correos electrónicos destinatarios que recibirán alertas automáticas de la flota (mantenimientos, repostajes y RTV)."
                                    : "Valores disponibles para seleccionar en las fichas de vehículos."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <AddSettingForm 
                                category={category.id} 
                                placeholder={`Nueva ${category.name.toLowerCase()}...`} 
                            />

                            <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
                                {settings
                                    .filter((s: any) => s.category === category.id)
                                    .map((setting: any) => (
                                        <div key={setting.id} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium">{setting.value}</span>
                                                {category.id === 'fuel_type' && (
                                                    <span className="text-xs text-emerald-600 font-bold">Precio: CRC {setting.price?.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
                                                )}
                                            </div>
                                            <form action={deleteFleetSettingAction.bind(null, setting.id)}>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                    type="submit"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </form>
                                        </div>
                                    ))}
                                {settings.filter((s: any) => s.category === category.id).length === 0 && (
                                    <div className="p-8 text-center text-muted-foreground italic text-sm">
                                        No hay valores definidos.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
