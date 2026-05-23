import { getDb } from '@/modules/core/lib/db';
import { FLEET_TABLES } from './schema';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { triggerNotificationEvent } from '@/modules/notifications/lib/notifications-engine';
import { getVehicleById } from './db';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export interface TelegramBotState {
  chatId: string;
  currentFlow: string | null;
  step: string | null;
  tempData: string | null;
  updatedAt: string;
}

export interface TelegramLinkage {
  id: number;
  chatId: string | null;
  employeeId: string;
  username: string | null;
  activationCode: string | null;
  createdAt: string;
  employeeName?: string;
}

/**
 * --- BOT STATES ---
 */

export async function getTelegramState(chatId: string): Promise<TelegramBotState | null> {
  const db = await getDb();
  try {
    const row = db.prepare(`SELECT * FROM ${FLEET_TABLES.telegramStates} WHERE chatId = ?`).get(chatId) as TelegramBotState | undefined;
    return row || null;
  } catch (error: any) {
    console.error(`Error in getTelegramState for chatId ${chatId}:`, error);
    return null;
  }
}

export async function saveTelegramState(
  chatId: string,
  currentFlow: string | null,
  step: string | null,
  tempData: any
): Promise<void> {
  const db = await getDb();
  const tempDataStr = tempData ? JSON.stringify(tempData) : null;
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO ${FLEET_TABLES.telegramStates} (chatId, currentFlow, step, tempData, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chatId) DO UPDATE SET
        currentFlow = excluded.currentFlow,
        step = excluded.step,
        tempData = excluded.tempData,
        updatedAt = excluded.updatedAt
    `).run(chatId, currentFlow, step, tempDataStr, now);
  } catch (error: any) {
    console.error(`Error in saveTelegramState for chatId ${chatId}:`, error);
    throw error;
  }
}

export async function deleteTelegramState(chatId: string): Promise<void> {
  const db = await getDb();
  try {
    db.prepare(`DELETE FROM ${FLEET_TABLES.telegramStates} WHERE chatId = ?`).run(chatId);
  } catch (error: any) {
    console.error(`Error in deleteTelegramState for chatId ${chatId}:`, error);
    throw error;
  }
}

export async function getAllActiveBotStates(): Promise<any[]> {
  const db = await getDb();
  try {
    const rows = db.prepare(`
      SELECT s.*, l.username, e.NOMBRE as employeeName
      FROM ${FLEET_TABLES.telegramStates} s
      LEFT JOIN ${FLEET_TABLES.telegramLinkages} l ON s.chatId = l.chatId
      LEFT JOIN core_employees e ON l.employeeId = e.EMPLEADO
      ORDER BY s.updatedAt DESC
    `).all() as any[];
    return rows;
  } catch (error) {
    console.error("Error in getAllActiveBotStates:", error);
    return [];
  }
}

/**
 * --- USER LINKAGES ---
 */

export async function getLinkageByChatId(chatId: string): Promise<TelegramLinkage | null> {
  const db = await getDb();
  try {
    const row = db.prepare(`
      SELECT l.*, e.NOMBRE as employeeName 
      FROM ${FLEET_TABLES.telegramLinkages} l
      JOIN core_employees e ON l.employeeId = e.EMPLEADO AND e.ACTIVO = 'S'
      WHERE l.chatId = ?
    `).get(chatId) as TelegramLinkage | undefined;
    return row || null;
  } catch (error) {
    console.error(`Error in getLinkageByChatId for ${chatId}:`, error);
    return null;
  }
}

export async function getLinkageByCode(code: string): Promise<TelegramLinkage | null> {
  const db = await getDb();
  try {
    const row = db.prepare(`
      SELECT l.*, e.NOMBRE as employeeName
      FROM ${FLEET_TABLES.telegramLinkages} l
      JOIN core_employees e ON l.employeeId = e.EMPLEADO AND e.ACTIVO = 'S'
      WHERE l.activationCode = ?
    `).get(code.toUpperCase().trim()) as TelegramLinkage | undefined;
    return row || null;
  } catch (error) {
    console.error(`Error in getLinkageByCode for code ${code}:`, error);
    return null;
  }
}

export async function createLinkageCode(employeeId: string): Promise<string> {
  const db = await getDb();
  const now = new Date().toISOString();
  
  // Generate random 6-character alphanumeric code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit confusing chars (1, I, 0, O)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  try {
    db.prepare(`
      INSERT INTO ${FLEET_TABLES.telegramLinkages} (employeeId, activationCode, createdAt)
      VALUES (?, ?, ?)
      ON CONFLICT(employeeId) DO UPDATE SET
        activationCode = excluded.activationCode,
        chatId = NULL,
        username = NULL,
        createdAt = excluded.createdAt
    `).run(employeeId, code, now);
    
    await logInfo(`Código de vinculación Telegram generado para empleado ${employeeId}: ${code}`);
    return code;
  } catch (error) {
    console.error(`Error in createLinkageCode for employee ${employeeId}:`, error);
    throw error;
  }
}

export async function linkTelegramManually(employeeId: string, chatId: string, username?: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO ${FLEET_TABLES.telegramLinkages} (employeeId, chatId, username, activationCode, createdAt)
      VALUES (?, ?, ?, NULL, ?)
      ON CONFLICT(employeeId) DO UPDATE SET
        chatId = excluded.chatId,
        username = excluded.username,
        activationCode = NULL,
        createdAt = excluded.createdAt
    `).run(employeeId, chatId, username || null, now);
    await logInfo(`Vinculación Telegram manual realizada para empleado ${employeeId} -> ChatID ${chatId}`);
  } catch (error) {
    console.error(`Error in linkTelegramManually:`, error);
    throw error;
  }
}

export async function activateLinkage(code: string, chatId: string, username?: string): Promise<TelegramLinkage> {
  const db = await getDb();
  const cleanedCode = code.toUpperCase().trim();
  try {
    const linkage = await getLinkageByCode(cleanedCode);
    if (!linkage) {
      throw new Error("Código de activación inválido");
    }

    db.prepare(`
      UPDATE ${FLEET_TABLES.telegramLinkages}
      SET chatId = ?, username = ?, activationCode = NULL
      WHERE id = ?
    `).run(chatId, username || null, linkage.id);

    await logInfo(`Vinculación Telegram activada: Empleado ${linkage.employeeId} vinculado al chat ${chatId}`);
    return linkage;
  } catch (error) {
    console.error(`Error in activateLinkage:`, error);
    throw error;
  }
}

export async function removeLinkage(id: number): Promise<void> {
  const db = await getDb();
  try {
    db.prepare(`DELETE FROM ${FLEET_TABLES.telegramLinkages} WHERE id = ?`).run(id);
    await logInfo(`Vinculación de Telegram eliminada (ID: ${id})`);
  } catch (error) {
    console.error(`Error in removeLinkage:`, error);
    throw error;
  }
}

export async function getAllLinkages(): Promise<TelegramLinkage[]> {
  const db = await getDb();
  try {
    const rows = db.prepare(`
      SELECT l.*, e.NOMBRE as employeeName
      FROM ${FLEET_TABLES.telegramLinkages} l
      JOIN core_employees e ON l.employeeId = e.EMPLEADO
      ORDER BY e.NOMBRE
    `).all() as TelegramLinkage[];
    return JSON.parse(JSON.stringify(rows));
  } catch (error) {
    console.error("Error in getAllLinkages:", error);
    return [];
  }
}

/**
 * --- BOT CONFIGURATION SETTINGS ---
 * Using fleet_settings table with category = 'telegram_bot_fleet_settings'
 */

export async function getTelegramBotSettings(): Promise<{ requirePhotoFuel: boolean; requirePhotoMaintenance: boolean }> {
  const db = await getDb();
  try {
    const rows = db.prepare(`
      SELECT value FROM ${FLEET_TABLES.settings} 
      WHERE category = 'telegram_bot_fleet_settings'
    `).all() as { value: string }[];
    
    let requirePhotoFuel = false;
    let requirePhotoMaintenance = false;

    for (const r of rows) {
      if (r.value === 'require_photo_fuel:true') requirePhotoFuel = true;
      if (r.value === 'require_photo_maintenance:true') requirePhotoMaintenance = true;
    }

    return { requirePhotoFuel, requirePhotoMaintenance };
  } catch (error) {
    console.error("Error in getTelegramBotSettings:", error);
    return { requirePhotoFuel: false, requirePhotoMaintenance: false };
  }
}

export async function updateTelegramBotSetting(key: 'requirePhotoFuel' | 'requirePhotoMaintenance', enabled: boolean): Promise<void> {
  const db = await getDb();
  const valueToInsert = `${key === 'requirePhotoFuel' ? 'require_photo_fuel' : 'require_photo_maintenance'}:${enabled}`;
  const valueToRemove = `${key === 'requirePhotoFuel' ? 'require_photo_fuel' : 'require_photo_maintenance'}:${!enabled}`;
  
  try {
    db.transaction(() => {
      // Remove any existing setting for this parameter
      db.prepare(`
        DELETE FROM ${FLEET_TABLES.settings} 
        WHERE category = 'telegram_bot_fleet_settings' AND (value = ? OR value = ?)
      `).run(valueToInsert, valueToRemove);
      
      // If enabled, insert it
      if (enabled) {
        db.prepare(`
          INSERT INTO ${FLEET_TABLES.settings} (category, value, price) 
          VALUES ('telegram_bot_fleet_settings', ?, 0)
        `).run(valueToInsert);
      }
    })();
    await logInfo(`Telegram Bot Configuración actualizada: ${key} = ${enabled}`);
  } catch (error) {
    console.error("Error in updateTelegramBotSetting:", error);
    throw error;
  }
}

export async function getVehicleByPlate(plate: string): Promise<any | null> {
  const db = await getDb();
  try {
    const row = db.prepare(`SELECT * FROM ${FLEET_TABLES.vehicles} WHERE UPPER(plate) = ?`).get(plate.toUpperCase().trim()) as any;
    return row ? JSON.parse(JSON.stringify(row)) : null;
  } catch (error) {
    console.error(`Error in getVehicleByPlate for plate ${plate}:`, error);
    return null;
  }
}

export async function getMaintenanceTypes(): Promise<string[]> {
  const db = await getDb();
  try {
    const rows = db.prepare(`
      SELECT value FROM ${FLEET_TABLES.settings} 
      WHERE category = 'maintenance_type' 
      ORDER BY value
    `).all() as { value: string }[];
    return rows.map(r => r.value);
  } catch (error) {
    console.error("Error in getMaintenanceTypes:", error);
    return ['Cambio de Aceite', 'Cambio de Llantas', 'Frenos', 'RTV', 'Mantenimiento General'];
  }
}

export async function saveTelegramFuelLog(log: any, userName: string) {
    const db = await getDb();
    let dateToSave = log.date;
    if (typeof log.date === 'string' && log.date.length === 10) {
        const now = new Date();
        const timeStr = format(now, 'HH:mm:ss');
        dateToSave = `${log.date}T${timeStr}`;
    }

    const logWithUser = { ...log, date: dateToSave, createdBy: userName };
    
    // Insert into DB directly (without authorizeAction)
    try {
        const transaction = db.transaction((data) => {
            db.prepare(`
                INSERT INTO ${FLEET_TABLES.fuelLogs} (vehicleId, date, mileageBefore, liters, cost, driverId, fuelTypeId, notes, createdBy)
                VALUES (@vehicleId, @date, @mileageBefore, @liters, @cost, @driverId, @fuelTypeId, @notes, @createdBy)
            `).run(data);

            // Update current mileage if the log mileage is higher
            db.prepare(`
                UPDATE ${FLEET_TABLES.vehicles} 
                SET currentMileage = MAX(currentMileage, ?) 
                WHERE id = ?
            `).run(data.mileageBefore, data.vehicleId);
        });
        transaction(logWithUser);
        await logInfo(`Fuel log registered via Telegram Bot for vehicle ${log.vehicleId}`);
    } catch (error: any) {
        console.error("Error saving fuel log in Telegram Bot", error);
        await logError(`Error al guardar repostaje vía Telegram Bot para vehículo ID: ${log.vehicleId}`, {
            error: error.message,
            logData: log,
            userName
        });
        throw error;
    }
    
    // Trigger Notification via Engine
    try {
        const vehicle = await getVehicleById(log.vehicleId);
        if (vehicle) {
            const fuelTypeRow = log.fuelTypeId ? db.prepare(`SELECT value FROM fleet_settings WHERE id = ?`).get(log.fuelTypeId) as { value: string } | undefined : undefined;
            const fuelTypeName = fuelTypeRow ? fuelTypeRow.value : 'No especificado';

            await triggerNotificationEvent('onFleetFuelLogAdded', {
                ...log,
                ...vehicle,
                userName,
                fuelTypeName,
                date: format(parseISO(dateToSave), 'dd/MM/yyyy HH:mm', { locale: es }),
                cost: Number(log.cost).toLocaleString('es-CR', { minimumFractionDigits: 2 })
            });
        }
    } catch (e: any) {
        console.error('Failed to trigger fuel log notification', e);
    }

    // Check for maintenance alerts via Engine
    try {
        const vehicle = await getVehicleById(log.vehicleId);
        if (vehicle) {
            const mileageSinceLast = log.mileageBefore - (vehicle.lastOilChangeMileage || 0);
            const progress = (mileageSinceLast / vehicle.oilChangeInterval) * 100;
            
            if (progress >= 90) {
                await triggerNotificationEvent('onFleetMaintenanceDue', {
                    ...vehicle,
                    currentMileage: log.mileageBefore,
                    progress: progress.toFixed(0),
                    remaining: Math.max(0, vehicle.oilChangeInterval - mileageSinceLast),
                    odometerUnit: vehicle.odometerUnit || 'km'
                });
            }
        }
    } catch (e: any) {
        console.error('Failed to process maintenance alert via engine', e);
    }
}

export async function saveTelegramMaintenanceLog(log: any, userName: string) {
    const db = await getDb();
    let dateToSave = log.date;
    if (typeof log.date === 'string' && log.date.length === 10) {
        const now = new Date();
        const timeStr = format(now, 'HH:mm:ss');
        dateToSave = `${log.date}T${timeStr}`;
    }

    const logWithUser = { ...log, date: dateToSave, createdBy: userName };
    
    // Insert into DB directly (without authorizeAction)
    try {
        const transaction = db.transaction((data) => {
            db.prepare(`
                INSERT INTO ${FLEET_TABLES.maintenanceLogs} (vehicleId, date, mileage, type, description, cost, performedBy, createdBy)
                VALUES (@vehicleId, @date, @mileage, @type, @description, @cost, @performedBy, @createdBy)
            `).run(data);

            // If it's an oil change, update the last oil change mileage
            const isOilChange = String(data.type).toLowerCase().includes('aceite');
            
            if (isOilChange) {
                db.prepare(`
                    UPDATE ${FLEET_TABLES.vehicles} 
                    SET lastOilChangeMileage = ?, currentMileage = MAX(currentMileage, ?), lastOilChangeAlertThreshold = 0
                    WHERE id = ?
                `).run(data.mileage, data.mileage, data.vehicleId);
            } else {
                db.prepare(`
                    UPDATE ${FLEET_TABLES.vehicles} 
                    SET currentMileage = MAX(currentMileage, ?)
                    WHERE id = ?
                `).run(data.mileage, data.vehicleId);
            }

            // Auto update preventative plans lastPerformedValue and reset threshold
            db.prepare(`
                UPDATE fleet_preventative_plans
                SET lastPerformedValue = ?, lastAlertThreshold = 0
                WHERE vehicleId = ? AND maintenanceType = ?
            `).run(data.mileage, data.vehicleId, data.type);
        });
        transaction(logWithUser);
        await logInfo(`Maintenance log (${log.type}) registered via Telegram Bot for vehicle ${log.vehicleId}`);
    } catch (error: any) {
        console.error("Error saving maintenance log in Telegram Bot", error);
        await logError(`Error al guardar mantenimiento (${log.type}) vía Telegram Bot para vehículo ID: ${log.vehicleId}`, {
            error: error.message,
            logData: log,
            userName
        });
        throw error;
    }

    // Trigger Notification via Engine
    try {
        const vehicle = await getVehicleById(log.vehicleId);
        if (vehicle) {
            await triggerNotificationEvent('onFleetMaintenanceLogAdded', {
                ...log,
                ...vehicle,
                userName,
                date: format(parseISO(dateToSave), 'dd/MM/yyyy HH:mm', { locale: es }),
                cost: Number(log.cost).toLocaleString('es-CR', { minimumFractionDigits: 2 })
            });
        }
    } catch (e: any) {
        console.error('Failed to trigger maintenance log notification', e);
    }
}
