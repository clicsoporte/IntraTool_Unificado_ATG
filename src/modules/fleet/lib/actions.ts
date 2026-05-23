'use server';

import { 
    getFleetSettings, 
    saveFleetSetting, 
    deleteFleetSetting,
    getAllVehicles,
    getVehicleById,
    saveVehicle,
    saveFuelLog,
    updateFleetFuelPrice,
    saveMaintenanceLog,
    savePermit,
    getVehicleLogs,
    getAllFuelLogs,
    getDriversFromERP,
    deleteVehicle,
    getAllActiveEmployees,
    getAllEmployees,
    syncRecopePrices,
    deletePermit,
    getVehiclePreventativePlans,
    savePreventativePlan,
    deletePreventativePlan,
    deleteFuelLog,
    deleteMaintenanceLog
} from '@/modules/fleet/lib/db';
import { saveFleetFile } from '@/modules/fleet/lib/files';
import { revalidatePath } from 'next/cache';
import { sendEmail } from '@/modules/core/lib/email-service';
import { getCompanySettings, getApiSettings, getDb } from '@/modules/core/lib/db';
import { format, parseISO } from 'date-fns';
import { runFleetAudit } from '@/modules/notifications/lib/scheduler';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import { es } from 'date-fns/locale';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { getCurrentUser } from '@/modules/core/lib/auth';
import { triggerNotificationEvent } from '@/modules/notifications/lib/notifications-engine';

/**
 * FLEET MODULE SERVER ACTIONS (FINAL)
 */

export async function getFleetSettingsAction() {
    return getFleetSettings();
}

export async function addFleetSettingAction(category: string, value: string, price: number = 0) {
    await saveFleetSetting(category, value, price);
    revalidatePath('/dashboard/admin/fleet');
    revalidatePath('/dashboard/fleet');
}

export async function deleteFleetSettingAction(id: number) {
    await deleteFleetSetting(id);
    revalidatePath('/dashboard/admin/fleet');
    revalidatePath('/dashboard/fleet');
}

export async function getVehicleByIdAction(id: number) {
    return getVehicleById(id);
}

export async function getAllVehiclesAction() {
    return getAllVehicles();
}

export async function saveVehicleAction(formData: FormData) {
    const id = formData.get('id') ? Number(formData.get('id')) : undefined;
    const plate = (formData.get('plate') as string).toUpperCase();
    const brand = formData.get('brand') as string;
    const model = formData.get('model') as string;
    const year = Number(formData.get('year'));
    const fuelType = formData.get('fuelType') as string;
    const loadCapacity = formData.get('loadCapacity') as string;
    const axes = Number(formData.get('axes'));
    const currentMileage = Number(formData.get('currentMileage')) || 0;
    const oilChangeInterval = Number(formData.get('oilChangeInterval')) || 5000;
    const rtvExpiration = formData.get('rtvExpiration') as string;
    const branchId = formData.get('branchId') as string;
    const lastOilChangeMileage = Number(formData.get('lastOilChangeMileage')) || 0;
    const status = formData.get('status') as string || 'active';
    
    // New fields
    const serialNumber = formData.get('serialNumber') as string;
    const vin = formData.get('vin') as string;
    const chassisNumber = formData.get('chassisNumber') as string;
    const bodyType = formData.get('bodyType') as string;
    const traction = formData.get('traction') as string;
    const capacity = Number(formData.get('capacity')) || 0;
    const engineNumber = formData.get('engineNumber') as string;
    const engineBrand = formData.get('engineBrand') as string;
    const engineSerial = formData.get('engineSerial') as string;
    const engineModel = formData.get('engineModel') as string;
    const engineCylinders = Number(formData.get('engineCylinders')) || 0;
    const engineDisplacement = formData.get('engineDisplacement') as string;
    const enginePower = formData.get('enginePower') as string;
    const engineManufacturer = formData.get('engineManufacturer') as string;
    const origin = formData.get('origin') as string;
    const ownerName = formData.get('ownerName') as string;
    const ownerId = formData.get('ownerId') as string;
    const odometerUnit = formData.get('odometerUnit') as string || 'km';
    const color = formData.get('color') as string;

    let photoUrl = formData.get('existingPhotoUrl') as string || '';
    const photoFile = formData.get('photo') as File;

    if (photoFile && photoFile.size > 0) {
        photoUrl = await saveFleetFile(photoFile);
    }

    const vehicle = {
        id, plate, brand, model, year, fuelType, loadCapacity, axes,
        currentMileage, lastOilChangeMileage, oilChangeInterval,
        rtvExpiration, photoUrl, branchId, status,
        serialNumber, vin, chassisNumber, bodyType, traction, capacity,
        engineNumber, engineBrand, engineSerial, engineModel, engineCylinders,
        engineDisplacement, enginePower, engineManufacturer, origin,
        ownerName, ownerId, odometerUnit, color
    };

    try {
        await saveVehicle(vehicle);
        const user = await getCurrentUser();
        await logInfo(`Vehículo guardado: ${plate}`, { vehicleId: id, user: user?.name, action: id ? 'update' : 'create' });
    } catch (e: any) {
        const user = await getCurrentUser();
        await logError(`Error al guardar vehículo ${plate}`, { error: e.message, user: user?.name });
        throw new Error('No se pudo guardar el vehículo. Verifique la placa única.');
    }
    revalidatePath('/dashboard/fleet');
}

export async function deleteVehicleAction(id: number) {
    try {
        await deleteVehicle(id);
        const user = await getCurrentUser();
        await logInfo(`Vehículo eliminado (ID: ${id})`, { vehicleId: id, user: user?.name, action: 'delete' });
    } catch (e: any) {
        const user = await getCurrentUser();
        await logError(`Error al eliminar vehículo (ID: ${id})`, { error: e.message, user: user?.name });
        throw new Error('No se pudo eliminar el vehículo.');
    }
    revalidatePath('/dashboard/fleet');
}

export async function saveFuelLogAction(formData: FormData, userName: string) {
    const vehicleId = Number(formData.get('vehicleId'));
    try {
        const date = formData.get('date') as string;
        const mileageBefore = Number(formData.get('mileageBefore'));
        const liters = Number(formData.get('liters'));
        const cost = Number(formData.get('cost'));
        const driverId = formData.get('driverId') as string || '';
        const fuelTypeId = formData.get('fuelTypeId') ? Number(formData.get('fuelTypeId')) : null;
        let notes = formData.get('notes') as string || '';
        const photoFile = formData.get('photo') as File;

        let dateToSave = date;
        if (typeof date === 'string' && date.length === 10) {
            const now = new Date();
            const timeStr = format(now, 'HH:mm:ss');
            dateToSave = `${date}T${timeStr}`;
        }

        if (photoFile && photoFile.size > 0) {
            const photoFilename = await saveFleetFile(photoFile);
            notes = notes ? `${notes} [Foto: ${photoFilename}]` : `[Foto: ${photoFilename}]`;
        }

        const log = {
            vehicleId,
            date: dateToSave,
            mileageBefore,
            liters,
            cost,
            driverId,
            fuelTypeId,
            notes,
            createdBy: userName
        };

        await saveFuelLog(log);
        
        // Trigger Notification via Engine
        try {
            const vehicle = await getVehicleById(vehicleId);
            if (vehicle) {
                const db = await getDb();
                const fuelTypeRow = fuelTypeId ? db.prepare(`SELECT value FROM fleet_settings WHERE id = ?`).get(fuelTypeId) as { value: string } | undefined : undefined;
                const fuelTypeName = fuelTypeRow ? fuelTypeRow.value : 'No especificado';

                await triggerNotificationEvent('onFleetFuelLogAdded', {
                    ...log,
                    notes,
                    ...vehicle,
                    userName,
                    fuelTypeName,
                    date: format(parseISO(dateToSave), 'dd/MM/yyyy HH:mm', { locale: es }),
                    cost: Number(cost).toLocaleString('es-CR', { minimumFractionDigits: 2 })
                });
            }
        } catch (e: any) {
            logError('Failed to trigger fuel log notification', { error: e.message });
        }

        revalidatePath(`/dashboard/fleet/vehicles/${vehicleId}`);
        revalidatePath('/dashboard/fleet');

        // Check for maintenance alerts via Engine
        try {
            const vehicle = await getVehicleById(vehicleId);
            if (vehicle) {
                const mileageSinceLast = mileageBefore - (vehicle.lastOilChangeMileage || 0);
                const progress = (mileageSinceLast / vehicle.oilChangeInterval) * 100;
                
                if (progress >= 90) {
                    await triggerNotificationEvent('onFleetMaintenanceDue', {
                        ...vehicle,
                        currentMileage: mileageBefore,
                        progress: progress.toFixed(0),
                        remaining: Math.max(0, vehicle.oilChangeInterval - mileageSinceLast),
                        odometerUnit: vehicle.odometerUnit || 'km'
                    });
                }
            }
        } catch (e: any) {
            logError('Failed to process maintenance alert via engine', { error: e.message });
        }
    } catch (error: any) {
        const user = await getCurrentUser();
        await logError(`Error al registrar consumo de combustible para vehículo ID: ${vehicleId}`, {
            error: error.message,
            user: user?.name,
            vehicleId
        });
        throw new Error("No se pudo registrar el consumo.");
    }
}

export async function saveMaintenanceLogAction(formData: FormData, userName: string) {
    const vehicleId = Number(formData.get('vehicleId'));
    const type = formData.get('type') as string;
    try {
        const date = formData.get('date') as string;
        const mileage = Number(formData.get('mileage'));
        let description = formData.get('description') as string || '';
        const cost = Number(formData.get('cost'));
        const performedBy = formData.get('performedBy') as string || '';
        const photoFile = formData.get('photo') as File;

        let dateToSave = date;
        if (typeof date === 'string' && date.length === 10) {
            const now = new Date();
            const timeStr = format(now, 'HH:mm:ss');
            dateToSave = `${date}T${timeStr}`;
        }

        if (photoFile && photoFile.size > 0) {
            const photoFilename = await saveFleetFile(photoFile);
            description = description ? `${description} [Foto: ${photoFilename}]` : `[Foto: ${photoFilename}]`;
        }

        const log = {
            vehicleId,
            date: dateToSave,
            mileage,
            type,
            description,
            cost,
            performedBy,
            createdBy: userName
        };

        await saveMaintenanceLog(log);

        // Trigger Notification via Engine
        try {
            const vehicle = await getVehicleById(vehicleId);
            if (vehicle) {
                await triggerNotificationEvent('onFleetMaintenanceLogAdded', {
                    ...log,
                    description,
                    ...vehicle,
                    userName,
                    date: format(parseISO(dateToSave), 'dd/MM/yyyy HH:mm', { locale: es }),
                    cost: Number(cost).toLocaleString('es-CR', { minimumFractionDigits: 2 })
                });
            }
        } catch (e: any) {
            logError('Failed to trigger maintenance log notification', { error: e.message });
        }

        revalidatePath(`/dashboard/fleet/vehicles/${vehicleId}`);
        revalidatePath('/dashboard/fleet');
    } catch (error: any) {
        const user = await getCurrentUser();
        await logError(`Error al registrar mantenimiento (${type}) para vehículo ID: ${vehicleId}`, {
            error: error.message,
            user: user?.name,
            vehicleId,
            type
        });
        throw new Error("No se pudo registrar el mantenimiento.");
    }
}

export async function savePermitAction(permit: any) {
    await savePermit(permit);
    revalidatePath(`/dashboard/fleet/vehicles/${permit.vehicleId}`);
}



export async function getVehicleDetailsAction(id: number) {
    const vehicle = await getVehicleByIdAction(id);
    const logs = await getVehicleLogs(id);
    const preventativePlans = await getVehiclePreventativePlans(id);
    return { vehicle, ...logs, preventativePlans };
}

export async function getFleetCatalogsAction(includeInactive: boolean = false) {
    const settings = await getFleetSettings();
    const drivers = await getDriversFromERP(includeInactive);
    
    // Fetch last fuel price update from history
    let lastFuelPriceUpdate: string | null = null;
    try {
        const db = await getDb();
        const row = db.prepare("SELECT MAX(date) as lastUpdate FROM fleet_fuel_price_history").get() as { lastUpdate: string | null } | undefined;
        lastFuelPriceUpdate = row?.lastUpdate || null;
    } catch (e) {
        console.error("Error fetching last fuel price update", e);
    }

    return { settings, drivers, lastFuelPriceUpdate };
}

export async function getFleetLogsReportAction() {
    return getAllFuelLogs();
}

export async function getAllEmployeesAction() {
    return getAllEmployees();
}

export async function getAllActiveEmployeesAction() {
    return getAllActiveEmployees();
}

export async function updateFleetFuelPriceAction(id: number, newPrice: number) {
    await updateFleetFuelPrice(id, newPrice);
    revalidatePath('/dashboard/fleet');
    revalidatePath('/dashboard/admin/fleet');
}

export async function syncRecopePricesAction() {
    const apiSettings = await getApiSettings();
    if (!apiSettings?.recopeApi) {
        throw new Error("La API de RECOPE no está configurada en Administración > API.");
    }
    
    try {
        const response = await fetch(apiSettings.recopeApi, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Error HTTP de RECOPE: ${response.status}`);
        }
        const data = await response.json();
        
        // Process on the server
        const updatedCount = await syncRecopePrices(data);
        
        const user = await getCurrentUser();
        await logInfo(`Sincronización de precios RECOPE exitosa. Se actualizaron ${updatedCount} registros.`, {
            user: user?.name,
            updatedCount
        });

        revalidatePath('/dashboard/fleet');
        revalidatePath('/dashboard/admin/fleet');
        return updatedCount;
    } catch (error: any) {
        const user = await getCurrentUser();
        await logError("Fallo en la sincronización de precios de combustible RECOPE", {
            error: error.message,
            user: user?.name
        });
        throw error;
    }
}

export async function getLegalAlertsCountAction() {
    const db = await getDb();
    try {
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        // 1. Count vehicles with expiring RTV
        const vehicles = db.prepare("SELECT rtvExpiration FROM fleet_vehicles WHERE status = 'active'").all() as any[];
        const expiringRtv = vehicles.filter(v => {
            if (!v.rtvExpiration) return false;
            const rtvDate = new Date(v.rtvExpiration);
            const diff = rtvDate.getTime() - now.getTime();
            return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
        }).length;

        // 2. Count expiring special permits
        const permits = db.prepare("SELECT expirationDate FROM fleet_permits").all() as any[];
        const expiringPermits = permits.filter(p => {
            if (!p.expirationDate) return false;
            const expDate = new Date(p.expirationDate);
            const diff = expDate.getTime() - now.getTime();
            return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
        }).length;

        return expiringRtv + expiringPermits;
    } catch (error) {
        console.error("Error calculating legal alerts count", error);
        return 0;
    }
}

export async function toggleFleetMilestoneAction(category: 'rtv_milestone' | 'permit_milestone' | 'oil_milestone' | 'preventative_milestone', value: string, enable: boolean) {
    await authorizeAction('fleet:settings:manage');
    const db = await getDb();
    try {
        if (enable) {
            db.prepare("INSERT OR IGNORE INTO fleet_settings (category, value, price) VALUES (?, ?, 0)").run(category, value);
        } else {
            db.prepare("DELETE FROM fleet_settings WHERE category = ? AND value = ?").run(category, value);
        }
        revalidatePath('/dashboard/admin/fleet');
        revalidatePath('/dashboard/fleet');
    } catch (error) {
        console.error("Error toggling milestone", error);
        throw new Error("No se pudo actualizar el hito de alerta.");
    }
}

export async function runFleetAuditManuallyAction(sendAlerts: boolean = true) {
    await authorizeAction('fleet:vehicles:update');
    try {
        const result = await runFleetAudit(sendAlerts);
        const user = await getCurrentUser();
        await logInfo(`Auditoría manual de flota completada por ${user?.name || 'Sistema'}. Vehículos revisados: ${result.checkedCount}, Alertas enviadas: ${result.alertsSent}`, {
            user: user?.name,
            checkedCount: result.checkedCount,
            alertsSent: result.alertsSent,
            sendAlerts
        });
        revalidatePath('/dashboard/fleet');
        revalidatePath('/dashboard/admin/fleet');
        return result;
    } catch (error: any) {
        const user = await getCurrentUser();
        await logError("Error durante la auditoría manual de flota", {
            error: error.message,
            user: user?.name
        });
        throw new Error("Ocurrió un error al ejecutar la auditoría manual de flota.");
    }
}

export async function deletePermitAction(id: number, vehicleId: number) {
    await deletePermit(id);
    revalidatePath(`/dashboard/fleet/vehicles/${vehicleId}`);
    revalidatePath('/dashboard/fleet');
}

export async function getVehiclePreventativePlansAction(vehicleId: number) {
    return getVehiclePreventativePlans(vehicleId);
}

export async function savePreventativePlanAction(data: {
    vehicleId: number;
    maintenanceType: string;
    intervalValue: number;
    intervalUnit: string;
    lastPerformedValue: number;
}) {
    try {
        await savePreventativePlan(data);
        const user = await getCurrentUser();
        await logInfo(`Plan preventivo guardado (${data.maintenanceType}) para vehículo ID: ${data.vehicleId}`, {
            user: user?.name,
            vehicleId: data.vehicleId,
            type: data.maintenanceType
        });
        revalidatePath(`/dashboard/fleet/vehicles/${data.vehicleId}`);
        revalidatePath('/dashboard/fleet');
    } catch (error: any) {
        const user = await getCurrentUser();
        await logError(`Error al guardar plan preventivo para vehículo ID: ${data.vehicleId}`, {
            error: error.message,
            user: user?.name
        });
        throw error;
    }
}

export async function deletePreventativePlanAction(id: number, vehicleId: number) {
    try {
        await deletePreventativePlan(id);
        const user = await getCurrentUser();
        await logInfo(`Plan preventivo eliminado (ID: ${id}) para vehículo ID: ${vehicleId}`, {
            user: user?.name,
            vehicleId,
            planId: id
        });
        revalidatePath(`/dashboard/fleet/vehicles/${vehicleId}`);
        revalidatePath('/dashboard/fleet');
    } catch (error: any) {
        const user = await getCurrentUser();
        await logError(`Error al eliminar plan preventivo (ID: ${id}) para vehículo ID: ${vehicleId}`, {
            error: error.message,
            user: user?.name
        });
        throw error;
    }
}

export async function deleteFuelLogAction(id: number, vehicleId: number) {
    try {
        await deleteFuelLog(id);
        const user = await getCurrentUser();
        await logInfo(`Registro de combustible eliminado (ID: ${id}) para vehículo ID: ${vehicleId}`, {
            user: user?.name,
            vehicleId,
            logId: id
        });
        revalidatePath(`/dashboard/fleet/vehicles/${vehicleId}`);
        revalidatePath('/dashboard/fleet');
    } catch (error: any) {
        const user = await getCurrentUser();
        await logError(`Fallo al eliminar registro de combustible ID: ${id}`, {
            error: error.message,
            user: user?.name
        });
        throw error;
    }
}

export async function deleteMaintenanceLogAction(id: number, vehicleId: number) {
    try {
        await deleteMaintenanceLog(id);
        const user = await getCurrentUser();
        await logInfo(`Registro de mantenimiento eliminado (ID: ${id}) para vehículo ID: ${vehicleId}`, {
            user: user?.name,
            vehicleId,
            logId: id
        });
        revalidatePath(`/dashboard/fleet/vehicles/${vehicleId}`);
        revalidatePath('/dashboard/fleet');
    } catch (error: any) {
        const user = await getCurrentUser();
        await logError(`Fallo al eliminar registro de mantenimiento ID: ${id}`, {
            error: error.message,
            user: user?.name
        });
        throw error;
    }
}
