"use server";

import { getDb } from '@/modules/core/lib/db-conn';
import { createLinkageCode } from '@/modules/fleet/lib/telegram-bot';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import { logInfo, logError } from '@/modules/core/lib/logger';
import bcrypt from 'bcryptjs';

export interface DriverWizardData {
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  password?: string;
  allowFuel: boolean;
  allowMaintenance: boolean;
  allowDeliveries: boolean;
  allowWarehouse: boolean;
  createWebAccount: boolean;
}

export async function createDriverWithBotLinkage(data: DriverWizardData) {
  await authorizeAction('users:create');
  
  const db = await getDb();
  
  try {
    const result = db.transaction(() => {
      // 1. Validate employee exists in core_employees
      const employee = db.prepare('SELECT NOMBRE FROM core_employees WHERE EMPLEADO = ?').get(data.employeeId) as { NOMBRE: string } | undefined;
      if (!employee) {
        throw new Error(`El empleado con ID ${data.employeeId} no existe en la planilla.`);
      }

      // 2. Add employee as driver setting in fleet_settings (category = 'driver')
      db.prepare(`
        INSERT OR IGNORE INTO fleet_settings (category, value)
        VALUES ('driver', ?)
      `).run(data.employeeId);

      // 3. Create web user account if requested
      let createdUserId: number | null = null;
      if (data.createWebAccount) {
        if (!data.email) {
            throw new Error("El correo electrónico es requerido para crear una cuenta web.");
        }
        const emailLower = data.email.toLowerCase().trim();
        const existingUser = db.prepare('SELECT id FROM core_users WHERE email = ?').get(emailLower) as { id: number } | undefined;
        
        if (!existingUser) {
          const defaultPassword = data.password && data.password.trim() !== '' ? data.password : 'Driver123!';
          const salt = bcrypt.genSaltSync(10);
          const hashedPassword = bcrypt.hashSync(defaultPassword, salt);
          
          const userInsert = db.prepare(`
            INSERT INTO core_users (name, email, password, phone, whatsapp, role, employeeId, forcePasswordChange, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
          `).run(data.name || employee.NOMBRE, emailLower, hashedPassword, data.phone, data.phone, data.role || 'chofer', data.employeeId);
          
          createdUserId = Number(userInsert.lastInsertRowid);
        } else {
          // Already exists, update user's link to employeeId, role, active status, and phone/whatsapp if provided
          if (data.phone) {
            db.prepare('UPDATE core_users SET employeeId = ?, role = ?, is_active = 1, phone = ?, whatsapp = ? WHERE id = ?')
              .run(data.employeeId, data.role || 'chofer', data.phone, data.phone, existingUser.id);
          } else {
            db.prepare('UPDATE core_users SET employeeId = ?, role = ?, is_active = 1 WHERE id = ?')
              .run(data.employeeId, data.role || 'chofer', existingUser.id);
          }
          createdUserId = existingUser.id;
        }
      }

      return { success: true, createdUserId };
    })();

    // 4. Generate linkage code (writes to fleet_telegram_linkages and handles conflicts)
    const activationCode = await createLinkageCode(data.employeeId);

    // 5. Update custom linkage permissions
    db.prepare(`
      UPDATE fleet_telegram_linkages 
      SET allowFuel = ?, allowMaintenance = ?, allowDeliveries = ?, allowWarehouse = ?
      WHERE employeeId = ?
    `).run(
      data.allowFuel ? 1 : 0,
      data.allowMaintenance ? 1 : 0,
      data.allowDeliveries ? 1 : 0,
      data.allowWarehouse ? 1 : 0,
      data.employeeId
    );

    await logInfo(`Macro Wizard completado para chofer: ${data.name} (ID: ${data.employeeId}) con código ${activationCode}`);

    return {
      success: true,
      activationCode,
      employeeId: data.employeeId,
      name: data.name,
      createdUserId: result.createdUserId
    };

  } catch (error: any) {
    await logError('Fallo al crear chofer con enlace de bot en Wizard', { error: error.message, employeeId: data.employeeId });
    return {
      success: false,
      error: error.message || 'Error desconocido al procesar el Wizard.'
    };
  }
}

export async function getTelegramBotInfo() {
  try {
    const { getNotificationConfig } = await import('@/modules/notifications/lib/db');
    const config = await getNotificationConfig('telegram');
    if (!config || !config.botToken) {
      return { success: false, error: 'Telegram Bot Token not configured' };
    }
    
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`, { cache: 'no-store' });
    if (!response.ok) {
      return { success: false, error: 'Failed to communicate with Telegram API' };
    }
    
    const data = await response.json();
    if (data.ok && data.result) {
      return { success: true, username: data.result.username };
    }
    return { success: false, error: data.description || 'Unknown error from Telegram API' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
