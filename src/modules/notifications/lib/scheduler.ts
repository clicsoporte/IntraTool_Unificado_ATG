import { getAllScheduledTasks, updateTaskLastRun } from './db';
import { triggerNotificationEvent } from './notifications-engine';
import { getDb } from '@/modules/core/lib/db';
import { CORE_TABLE_NAMES } from '@/modules/core/lib/schema';
import { logInfo, logError } from '@/modules/core/lib/logger';

/**
 * Main runner for automated tasks.
 * Can be triggered by instrumentation (startup) or by a user-based cron trigger.
 */
export async function runSystemAudits(force: boolean = false, targetTaskId?: string) {
    try {
        const tasks = await getAllScheduledTasks();
        const enabledTasks = tasks.filter(t => t.enabled);
        const executedTasks: string[] = [];

        for (const task of enabledTasks) {
            const isTarget = targetTaskId ? task.taskId === targetTaskId : true;
            if (isTarget && (force || shouldRunTask(task))) {
                logInfo(`Executing scheduled task: ${task.name}`);
                await executeTask(task.taskId);
                await updateTaskLastRun(task.taskId);
                executedTasks.push(task.name);
            }
        }
        return { success: true, executedTasks };
    } catch (error: any) {
        logError('Scheduler execution failed', { error: error.message });
        return { success: false, executedTasks: [], error: error.message };
    }
}

/**
 * Simple logic to check if a task should run today.
 * Parses standard 5-field simple cron expressions (minute hour day_of_month month day_of_week).
 */
function shouldRunTask(task: any): boolean {
    const now = new Date();
    
    // 1. Check if it already ran today to prevent duplicate runs
    if (task.lastRun) {
        const lastRunDate = new Date(task.lastRun).toDateString();
        if (lastRunDate === now.toDateString()) {
            return false; // Already ran today
        }
    }
    
    // 2. Parse simple cron expression
    const schedule = task.schedule;
    if (!schedule) return true;
    
    try {
        const parts = schedule.trim().split(/\s+/);
        if (parts.length === 5) {
            const [min, hour, dom, month, dow] = parts;
            
            // Check day of week (dow)
            if (dow !== '*') {
                const currentDayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
                const allowedDays = dow.split(',').flatMap((d: string) => {
                    if (d.includes('-')) {
                        const [start, end] = d.split('-').map(Number);
                        const days = [];
                        for (let i = start; i <= end; i++) {
                            days.push(i === 7 ? 0 : i);
                        }
                        return days;
                    }
                    const num = parseInt(d, 10);
                    if (isNaN(num)) {
                        // Support MON, TUE, etc.
                        const mapping: Record<string, number> = {
                            'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6
                        };
                        const mapped = mapping[d.toUpperCase()];
                        return mapped !== undefined ? [mapped] : [];
                    }
                    return [num === 7 ? 0 : num];
                });
                
                if (!allowedDays.includes(currentDayOfWeek)) {
                    return false; // Day of week doesn't match
                }
            }
            
            // Check day of month (dom)
            if (dom !== '*') {
                const currentDayOfMonth = now.getDate();
                const allowedDaysOfMonth = dom.split(',').map(Number);
                if (!allowedDaysOfMonth.includes(currentDayOfMonth)) {
                    return false; // Day of month doesn't match
                }
            }
            
            // Check month
            if (month !== '*') {
                const currentMonth = now.getMonth() + 1; // 1-indexed
                const allowedMonths = month.split(',').map(Number);
                if (!allowedMonths.includes(currentMonth)) {
                    return false; // Month doesn't match
                }
            }
        }
    } catch (e) {
        console.error('Error parsing cron schedule for task:', task.taskId, e);
    }
    
    return true;
}

async function executeTask(taskId: string) {
    switch (taskId) {
        case 'fleet-audit':
            await runFleetAudit();
            break;
        case 'fleet-weekly-fuel':
            await runWeeklyFuelReport();
            break;
        case 'fleet-alerts-summary':
            await runAlertsSummaryReport();
            break;
        // Add more system tasks here
        default:
            console.warn(`No executor found for task: ${taskId}`);
    }
}

/**
 * Specific Audit for the Fleet Module.
 */
export async function runFleetAudit(sendAlerts: boolean = true) {
    const db = await getDb();
    
    // 1. Get enabled Milestones from fleet_settings (or default if empty)
    const rtvSettings = db.prepare("SELECT value FROM fleet_settings WHERE category = 'rtv_milestone'").all() as any[];
    const rtvMilestones = rtvSettings.length > 0 ? rtvSettings.map(s => parseInt(s.value, 10)) : [60, 30, 15, 8, 2, 1, 0];

    const permitSettings = db.prepare("SELECT value FROM fleet_settings WHERE category = 'permit_milestone'").all() as any[];
    const permitMilestones = permitSettings.length > 0 ? permitSettings.map(s => parseInt(s.value, 10)) : [60, 30, 15, 8, 2, 1, 0];

    const oilSettings = db.prepare("SELECT value FROM fleet_settings WHERE category = 'oil_milestone'").all() as any[];
    const oilMilestones = oilSettings.length > 0 ? oilSettings.map(s => parseInt(s.value, 10)) : [90, 95, 100, 110, 120, 130, 140, 150];

    const preventativeSettings = db.prepare("SELECT value FROM fleet_settings WHERE category = 'preventative_milestone'").all() as any[];
    const preventativeMilestones = preventativeSettings.length > 0 ? preventativeSettings.map(s => parseInt(s.value, 10)) : [90, 95, 100, 110, 120, 130, 140, 150];

    const vehicles = db.prepare('SELECT * FROM fleet_vehicles').all() as any[];
    
    let alertsSent = 0;
    const now = new Date();

    for (const vehicle of vehicles) {
        // --- 1. OIL CHANGE / ODOMETER ALERTS ---
        const mileageSinceLast = (vehicle.currentMileage || 0) - (vehicle.lastOilChangeMileage || 0);
        const progress = vehicle.oilChangeInterval > 0 
            ? Math.round((mileageSinceLast / vehicle.oilChangeInterval) * 100)
            : 0;
        
        // Find the highest threshold reached from the active milestones list
        const reachedThresholds = oilMilestones.filter(m => progress >= m);
        if (reachedThresholds.length > 0 && vehicle.oilChangeInterval > 0) {
            const highestThreshold = Math.max(...reachedThresholds);
            const currentStoredThreshold = vehicle.lastOilChangeAlertThreshold || 0;
            
            if (highestThreshold > currentStoredThreshold) {
                // Trigger Oil Change Alert!
                if (sendAlerts) {
                    await triggerNotificationEvent('onFleetMaintenanceDue', {
                        ...vehicle,
                        progress: progress.toString(),
                        threshold: highestThreshold.toString(),
                        remaining: Math.max(0, vehicle.oilChangeInterval - mileageSinceLast),
                        odometerUnit: vehicle.odometerUnit || 'km'
                    });
                    alertsSent++;
                }
                // Update stored threshold in database
                db.prepare("UPDATE fleet_vehicles SET lastOilChangeAlertThreshold = ? WHERE id = ?")
                  .run(highestThreshold, vehicle.id);
            }
        }

        // --- 1.5 PREVENTATIVE PLANS ALERTS ---
        const preventativePlans = db.prepare('SELECT * FROM fleet_preventative_plans WHERE vehicleId = ?').all(vehicle.id) as any[];
        for (const plan of preventativePlans) {
            // Si el plan mide horas pero el vehículo mide horas en su odómetro principal, usamos currentMileage
            const currentVal = (plan.intervalUnit === 'hours' && vehicle.odometerUnit !== 'hr')
                ? (vehicle.currentHours || 0)
                : (vehicle.currentMileage || 0);
            
            const diff = currentVal - (plan.lastPerformedValue || 0);
            
            // Proteger contra división por cero
            const planProgress = plan.intervalValue > 0
                ? Math.round((diff / plan.intervalValue) * 100)
                : 0;

            // Find the highest threshold reached from the active preventative milestones list
            const reachedPlanThresholds = preventativeMilestones.filter(m => planProgress >= m);
            if (reachedPlanThresholds.length > 0 && plan.intervalValue > 0) {
                const highestPlanThreshold = Math.max(...reachedPlanThresholds);
                const currentStoredPlanThreshold = plan.lastAlertThreshold || 0;

                if (highestPlanThreshold > currentStoredPlanThreshold) {
                    // Trigger Preventative Alert! Reuse onFleetMaintenanceDue event with custom details
                    if (sendAlerts) {
                        await triggerNotificationEvent('onFleetMaintenanceDue', {
                            ...vehicle,
                            plate: `${vehicle.plate} [${plan.maintenanceType}]`,
                            progress: planProgress.toString(),
                            threshold: highestPlanThreshold.toString(),
                            oilChangeInterval: `${plan.intervalValue.toLocaleString()} ${plan.intervalUnit} (${plan.maintenanceType})`,
                            currentMileage: currentVal,
                            odometerUnit: plan.intervalUnit,
                            remaining: Math.max(0, plan.intervalValue - diff)
                        });
                        alertsSent++;
                    }

                    // Update stored threshold in database for this plan
                    db.prepare("UPDATE fleet_preventative_plans SET lastAlertThreshold = ? WHERE id = ?")
                      .run(highestPlanThreshold, plan.id);
                }
            }
        }

        // --- 2. RTV LEGAL ALERTS ---
        if (vehicle.rtvExpiration) {
            const rtvDate = new Date(vehicle.rtvExpiration);
            const rtvDateOnly = new Date(rtvDate.getFullYear(), rtvDate.getMonth(), rtvDate.getDate());
            const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const diffTime = rtvDateOnly.getTime() - todayDateOnly.getTime();
            const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (rtvMilestones.includes(daysLeft)) {
                if (sendAlerts) {
                    await triggerNotificationEvent('onFleetPermitExpiring', {
                        ...vehicle,
                        documentName: 'Revisión Técnica Vehicular (RTV)',
                        permitType: 'Revisión Técnica Vehicular (RTV)',
                        daysLeft: daysLeft.toString(),
                        expirationDate: vehicle.rtvExpiration
                    });
                    alertsSent++;
                }
            }
        }

        // --- 3. SPECIAL PERMITS LEGAL ALERTS ---
        const permits = db.prepare('SELECT * FROM fleet_permits WHERE vehicleId = ?').all(vehicle.id) as any[];
        for (const permit of permits) {
            if (permit.expirationDate) {
                const permitDate = new Date(permit.expirationDate);
                const permitDateOnly = new Date(permitDate.getFullYear(), permitDate.getMonth(), permitDate.getDate());
                const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const diffTime = permitDateOnly.getTime() - todayDateOnly.getTime();
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (permitMilestones.includes(daysLeft)) {
                    if (sendAlerts) {
                        await triggerNotificationEvent('onFleetPermitExpiring', {
                            ...vehicle,
                            documentName: `Permiso Especial: ${permit.type}`,
                            permitType: `Permiso Especial: ${permit.type}`,
                            daysLeft: daysLeft.toString(),
                            expirationDate: permit.expirationDate
                        });
                        alertsSent++;
                    }
                }
            }
        }
    }
    
    return { checkedCount: vehicles.length, alertsSent };
}

/**
 * Reporte Consolidado Semanal de Combustible.
 */
export async function runWeeklyFuelReport() {
    const db = await getDb();
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    // Calcular lunes y domingo de la semana pasada
    const diffToLastMonday = dayOfWeek === 0 ? 13 : dayOfWeek + 6;
    const mondayOfLastWeek = new Date(now);
    mondayOfLastWeek.setDate(now.getDate() - diffToLastMonday);
    mondayOfLastWeek.setHours(0, 0, 0, 0);
    
    const sundayOfLastWeek = new Date(mondayOfLastWeek);
    sundayOfLastWeek.setDate(mondayOfLastWeek.getDate() + 6);
    sundayOfLastWeek.setHours(23, 59, 59, 999);
    
    const formatDate = (date: Date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear();
        return `${d}/${m}/${y}`;
    };
    
    const startDateFormatted = formatDate(mondayOfLastWeek);
    const endDateFormatted = formatDate(sundayOfLastWeek);
    
    // Obtener todos los registros y filtrar en JS para mayor compatibilidad de fechas
    const fuelLogs = db.prepare('SELECT * FROM fleet_fuel_logs').all() as any[];
    const vehicles = db.prepare('SELECT * FROM fleet_vehicles').all() as any[];
    
    const start = mondayOfLastWeek.getTime();
    const end = sundayOfLastWeek.getTime();
    
    const weeklyLogs = fuelLogs.filter(log => {
        const logTime = new Date(log.date).getTime();
        return logTime >= start && logTime <= end;
    });
    
    // Totales generales
    const totalLiters = weeklyLogs.reduce((acc, log) => acc + (log.liters || 0), 0);
    const totalCost = weeklyLogs.reduce((acc, log) => acc + (log.cost || 0), 0);
    const avgCostPerLiter = totalLiters > 0 ? totalCost / totalLiters : 0;
    
    // Rendimiento general
    const vehicleGroups: Record<number, number[]> = {};
    weeklyLogs.forEach(log => {
        if (!vehicleGroups[log.vehicleId]) vehicleGroups[log.vehicleId] = [];
        vehicleGroups[log.vehicleId].push(log.mileageBefore);
    });

    let totalDistance = 0;
    Object.values(vehicleGroups).forEach(mileages => {
        if (mileages.length > 1) {
            const max = Math.max(...mileages);
            const min = Math.min(...mileages);
            totalDistance += (max - min);
        }
    });

    const avgEfficiency = totalLiters > 0 ? totalDistance / totalLiters : 0;
    
    // Consolidación por vehículo
    const vehicleWeeklyStats: Record<number, {
        plate: string;
        brandModel: string;
        maxMileage: number;
        minMileage: number;
        totalLiters: number;
        totalCost: number;
        odometerUnit: string;
        logsCount: number;
    }> = {};

    weeklyLogs.forEach(log => {
        const vId = log.vehicleId;
        if (!vehicleWeeklyStats[vId]) {
            const vehicle = vehicles.find(v => v.id === vId);
            vehicleWeeklyStats[vId] = {
                plate: vehicle?.plate || `ID: ${vId}`,
                brandModel: vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Desconocido',
                maxMileage: 0,
                minMileage: Infinity,
                totalLiters: 0,
                totalCost: 0,
                odometerUnit: vehicle?.odometerUnit || 'km',
                logsCount: 0
            };
        }
        const stat = vehicleWeeklyStats[vId];
        stat.totalLiters += (log.liters || 0);
        stat.totalCost += (log.cost || 0);
        stat.logsCount += 1;
        if (log.mileageBefore > stat.maxMileage) {
            stat.maxMileage = log.mileageBefore;
        }
        if (log.mileageBefore < stat.minMileage) {
            stat.minMileage = log.mileageBefore;
        }
    });
    
    // Construir tabla HTML
    let tableRows = '';
    const statsList = Object.values(vehicleWeeklyStats);
    if (statsList.length > 0) {
        statsList.forEach(stat => {
            const distance = stat.logsCount > 1 ? (stat.maxMileage - stat.minMileage) : 0;
            const efficiency = (stat.totalLiters > 0 && distance > 0) ? (distance / stat.totalLiters) : 0;
            const unit = stat.odometerUnit === 'hr' ? 'Hr/L' : stat.odometerUnit === 'mi' ? 'Mi/L' : 'Km/L';
            const efficiencyStr = efficiency > 0 ? `${efficiency.toFixed(2)} ${unit}` : 'N/D';

            tableRows += `
                <tr style="border-bottom: 1px solid #edf2f7;">
                    <td style="padding: 12px 15px; font-weight: bold; color: #1a365d; text-align: left;">${stat.plate}</td>
                    <td style="padding: 12px 15px; color: #4a5568; text-align: left;">${stat.brandModel}</td>
                    <td style="padding: 12px 15px; text-align: right; color: #4a5568;">${stat.maxMileage > 0 ? stat.maxMileage.toLocaleString() : 'N/D'}</td>
                    <td style="padding: 12px 15px; text-align: right; font-weight: bold; color: #3182ce;">${stat.totalLiters.toFixed(2)} L</td>
                    <td style="padding: 12px 15px; text-align: right; font-weight: bold; color: #38a169;">${efficiencyStr}</td>
                    <td style="padding: 12px 15px; text-align: right; font-weight: bold; color: #2d3748;">¢${stat.totalCost.toLocaleString()}</td>
                </tr>
            `;
        });
    } else {
        tableRows = `
            <tr>
                <td colspan="6" style="padding: 24px; text-align: center; color: #a0aec0; font-style: italic;">
                    No se registraron repostajes de combustible en este período.
                </td>
            </tr>
        `;
    }
    
    const consolidatedTableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-family: Arial, sans-serif; font-size: 13px; color: #2d3748; border: 1px solid #edf2f7; border-radius: 6px;">
            <thead>
                <tr style="background-color: #f7fafc; border-bottom: 2px solid #edf2f7; color: #718096; text-transform: uppercase; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">
                    <th style="padding: 12px 15px; text-align: left;">Vehículo</th>
                    <th style="padding: 12px 15px; text-align: left;">Marca / Estilo</th>
                    <th style="padding: 12px 15px; text-align: right;">Odómetro Máx</th>
                    <th style="padding: 12px 15px; text-align: right;">Litros</th>
                    <th style="padding: 12px 15px; text-align: right;">Rendimiento</th>
                    <th style="padding: 12px 15px; text-align: right;">Inversión</th>
                </tr>
            </thead>
            <tbody style="border-top: 1px solid #edf2f7;">
                ${tableRows}
            </tbody>
        </table>
    `;
    
    // Construir texto para Telegram
    let fuelListTelegram = '';
    if (statsList.length > 0) {
        statsList.forEach(stat => {
            const distance = stat.logsCount > 1 ? (stat.maxMileage - stat.minMileage) : 0;
            const efficiency = (stat.totalLiters > 0 && distance > 0) ? (distance / stat.totalLiters) : 0;
            const unit = stat.odometerUnit === 'hr' ? 'Hr/L' : stat.odometerUnit === 'mi' ? 'Mi/L' : 'Km/L';
            const efficiencyStr = efficiency > 0 ? `${efficiency.toFixed(2)} ${unit}` : 'N/D';

            fuelListTelegram += `🚗 <b>${stat.plate}</b> (${stat.brandModel})\n`;
            fuelListTelegram += `├ Odómetro Máx: <b>${stat.maxMileage > 0 ? stat.maxMileage.toLocaleString() : 'N/D'} ${stat.odometerUnit}</b>\n`;
            fuelListTelegram += `├ Litros: <b>${stat.totalLiters.toFixed(2)} L</b>\n`;
            fuelListTelegram += `├ Rendimiento: <b>${efficiencyStr}</b>\n`;
            fuelListTelegram += `└ Inversión: <b>¢${stat.totalCost.toLocaleString()}</b>\n\n`;
        });
    } else {
        fuelListTelegram = 'ℹ️ <i>No se registraron repostajes de combustible en este período.</i>\n';
    }
    
    // Disparar evento de notificación
    await triggerNotificationEvent('onFleetWeeklyFuelReport', {
        startDate: startDateFormatted,
        endDate: endDateFormatted,
        totalLiters: totalLiters.toLocaleString(undefined, { minimumFractionDigits: 1 }),
        totalCost: totalCost.toLocaleString(),
        avgCostPerLiter: avgCostPerLiter.toLocaleString(undefined, { maximumFractionDigits: 1 }),
        avgEfficiency: avgEfficiency.toFixed(2),
        consolidatedTable: consolidatedTableHtml,
        fuelListTelegram: fuelListTelegram
    });
    
    logInfo('Weekly fuel report executed successfully');
}

/**
 * Reporte Consolidado de Alertas Activas de Flota.
 */
export async function runAlertsSummaryReport() {
    const db = await getDb();
    const now = new Date();
    
    const vehicles = db.prepare('SELECT * FROM fleet_vehicles').all() as any[];
    
    let outOfServiceCount = 0;
    let mechanicalAlertsCount = 0;
    let legalAlertsCount = 0;
    
    const vehicleAlerts: {
        plate: string;
        brandModel: string;
        statusLabel: string;
        statusColor: string;
        mechanicalAlerts: string[];
        legalAlerts: string[];
    }[] = [];
    
    for (const vehicle of vehicles) {
        let isOutOfService = vehicle.status !== 'active';
        const mechanicalAlerts: string[] = [];
        const legalAlerts: string[] = [];
        
        // 1. Estado
        let statusLabel = 'Activo';
        let statusColor = '#38a169'; // verde
        if (isOutOfService) {
            statusLabel = vehicle.status === 'maintenance' ? 'En Mantenimiento' : 'Fuera de Servicio';
            statusColor = '#e53e3e'; // rojo
            outOfServiceCount++;
        }
        
        // 2. Alertas Mecánicas (Aceite)
        const mileageSinceLast = (vehicle.currentMileage || 0) - (vehicle.lastOilChangeMileage || 0);
        const oilProgress = vehicle.oilChangeInterval > 0 ? Math.round((mileageSinceLast / vehicle.oilChangeInterval) * 100) : 0;
        
        if (oilProgress >= 90) {
            const extra = oilProgress >= 100 ? `VENCIDO (${oilProgress}%)` : `Próximo (${oilProgress}%)`;
            mechanicalAlerts.push(`Cambio de Aceite: ${extra}`);
            mechanicalAlertsCount++;
        }
        
        // 3. Alertas Mecánicas (Planes Preventivos)
        const preventativePlans = db.prepare('SELECT * FROM fleet_preventative_plans WHERE vehicleId = ?').all(vehicle.id) as any[];
        for (const plan of preventativePlans) {
            const currentVal = plan.intervalUnit === 'hours' ? (vehicle.currentHours || 0) : (vehicle.currentMileage || 0);
            const diff = currentVal - (plan.lastPerformedValue || 0);
            const planProgress = plan.intervalValue > 0 ? Math.round((diff / plan.intervalValue) * 100) : 0;
            
            if (planProgress >= 90) {
                const extra = planProgress >= 100 ? `VENCIDO (${planProgress}%)` : `Próximo (${planProgress}%)`;
                mechanicalAlerts.push(`${plan.maintenanceType}: ${extra}`);
                mechanicalAlertsCount++;
            }
        }
        
        // 4. Alertas Legales (RTV)
        if (vehicle.rtvExpiration) {
            const rtvDate = new Date(vehicle.rtvExpiration);
            const diffTime = rtvDate.getTime() - now.getTime();
            const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (daysLeft <= 60) {
                const label = daysLeft < 0 ? `RTV VENCIDA (hace ${Math.abs(daysLeft)} días)` : `RTV vence en ${daysLeft} días`;
                legalAlerts.push(label);
                legalAlertsCount++;
            }
        }
        
        // 5. Alertas Legales (Permisos Especiales)
        const permits = db.prepare('SELECT * FROM fleet_permits WHERE vehicleId = ?').all(vehicle.id) as any[];
        for (const permit of permits) {
            if (permit.expirationDate) {
                const permitDate = new Date(permit.expirationDate);
                const diffTime = permitDate.getTime() - now.getTime();
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (daysLeft <= 60) {
                    const label = daysLeft < 0 ? `${permit.type} VENCIDO (hace ${Math.abs(daysLeft)} días)` : `${permit.type} vence en ${daysLeft} días`;
                    legalAlerts.push(label);
                    legalAlertsCount++;
                }
            }
        }
        
        // Si tiene cualquier condición de alerta, lo incluimos en la tabla
        if (isOutOfService || mechanicalAlerts.length > 0 || legalAlerts.length > 0) {
            vehicleAlerts.push({
                plate: vehicle.plate,
                brandModel: `${vehicle.brand} ${vehicle.model}`,
                statusLabel,
                statusColor,
                mechanicalAlerts,
                legalAlerts
            });
        }
    }
    
    const totalAlerts = outOfServiceCount + mechanicalAlertsCount + legalAlertsCount;
    
    // Construir tabla HTML
    let tableRows = '';
    if (vehicleAlerts.length > 0) {
        vehicleAlerts.forEach(vAlert => {
            const mechList = vAlert.mechanicalAlerts.length > 0 
                ? vAlert.mechanicalAlerts.map(a => `<div style="margin-bottom: 4px; color: #dd6b20; font-weight: 500;">• ${a}</div>`).join('')
                : '<span style="color: #a0aec0; font-style: italic;">Sin alertas</span>';
                
            const legalList = vAlert.legalAlerts.length > 0 
                ? vAlert.legalAlerts.map(a => `<div style="margin-bottom: 4px; color: #e53e3e; font-weight: 500;">• ${a}</div>`).join('')
                : '<span style="color: #a0aec0; font-style: italic;">Sin alertas</span>';
                
            tableRows += `
                <tr style="border-bottom: 1px solid #edf2f7; vertical-align: top;">
                    <td style="padding: 12px 15px; font-weight: bold; color: #742a2a; text-align: left;">${vAlert.plate}</td>
                    <td style="padding: 12px 15px; color: #4a5568; text-align: left;">${vAlert.brandModel}</td>
                    <td style="padding: 12px 15px; text-align: center;">
                        <span style="display: inline-block; padding: 4px 8px; font-size: 10px; font-weight: bold; border-radius: 12px; color: white; background-color: ${vAlert.statusColor}; whitespace-nowrap;">
                            ${vAlert.statusLabel}
                        </span>
                    </td>
                    <td style="padding: 12px 15px; text-align: left;">${mechList}</td>
                    <td style="padding: 12px 15px; text-align: left;">${legalList}</td>
                </tr>
            `;
        });
    } else {
        tableRows = `
            <tr>
                <td colspan="5" style="padding: 24px; text-align: center; color: #38a169; font-weight: bold; font-style: italic; background-color: #f0fff4;">
                    ✅ ¡Excelente! Todas las unidades se encuentran activas y al día sin alertas mecánicas ni legales.
                </td>
            </tr>
        `;
    }
    
    const alertsTableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-family: Arial, sans-serif; font-size: 13px; color: #2d3748; border: 1px solid #edf2f7; border-radius: 6px;">
            <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #edf2f7; color: #718096; text-transform: uppercase; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">
                    <th style="padding: 12px 15px; text-align: left;">Vehículo</th>
                    <th style="padding: 12px 15px; text-align: left;">Marca / Estilo</th>
                    <th style="padding: 12px 15px; text-align: center;">Estado</th>
                    <th style="padding: 12px 15px; text-align: left;">Alertas Mecánicas</th>
                    <th style="padding: 12px 15px; text-align: left;">Alertas Legales</th>
                </tr>
            </thead>
            <tbody style="border-top: 1px solid #edf2f7;">
                ${tableRows}
            </tbody>
        </table>
    `;
    
    // Construir texto para Telegram
    let alertsListTelegram = '';
    if (vehicleAlerts.length > 0) {
        vehicleAlerts.forEach(vAlert => {
            const statusEmoji = vAlert.statusLabel.includes('Inactivo') || vAlert.statusLabel.includes('Taller') || vAlert.statusLabel.includes('Fuera') ? '🔴' : '🟡';
            const mech = vAlert.mechanicalAlerts.length > 0 
                ? vAlert.mechanicalAlerts.map(a => `  • 🔧 ${a}`).join('\n')
                : '  • <i>Sin alertas mecánicas</i>';
                
            const legal = vAlert.legalAlerts.length > 0 
                ? vAlert.legalAlerts.map(a => `  • 📄 ${a}`).join('\n')
                : '  • <i>Sin alertas legales</i>';
                
            alertsListTelegram += `🚗 <b>${vAlert.plate}</b> (${vAlert.brandModel})\n`;
            alertsListTelegram += `├ Estado: ${statusEmoji} <b>${vAlert.statusLabel}</b>\n`;
            alertsListTelegram += `├ Alertas Mecánicas:\n${mech}\n`;
            alertsListTelegram += `└ Alertas Legales:\n${legal}\n\n`;
        });
    } else {
        alertsListTelegram = '✅ <i>¡Excelente! Todas las unidades se encuentran activas y al día sin alertas.</i>\n';
    }
    
    // Disparar evento de notificación
    await triggerNotificationEvent('onFleetAlertsSummary', {
        totalAlerts: totalAlerts.toString(),
        outOfServiceCount: outOfServiceCount.toString(),
        mechanicalAlertsCount: mechanicalAlertsCount.toString(),
        legalAlertsCount: legalAlertsCount.toString(),
        alertsTable: alertsTableHtml,
        alertsListTelegram: alertsListTelegram
    });
    
    logInfo('Alerts summary report executed successfully');
}
