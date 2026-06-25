'use server';

import { 
  createLinkageCode, 
  linkTelegramManually, 
  removeLinkage, 
  updateLinkagePermissions,
  getAllLinkages, 
  getAllActiveBotStates, 
  deleteTelegramState,
  getTelegramBotSettings,
  updateTelegramBotSetting
} from './telegram-bot';
import { getNotificationConfig, saveNotificationConfig } from '@/modules/notifications/lib/db';
import { getCompanySettings } from '@/modules/core/lib/db';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import { revalidatePath } from 'next/cache';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { getAllActiveEmployees, getAllEmployees } from './db';

/**
 * Server Action to generate an activation code for an employee
 */
export async function generateActivationCodeAction(employeeId: string): Promise<string> {
  await authorizeAction('admin:settings:automations');
  try {
    const code = await createLinkageCode(employeeId);
    revalidatePath('/dashboard/admin/automations');
    return code;
  } catch (error: any) {
    await logError('Error al generar código de vinculación Telegram', { employeeId, error: error.message });
    throw new Error('No se pudo generar el código de vinculación.');
  }
}

/**
 * Server Action to link an employee's Telegram account manually
 */
export async function linkTelegramManuallyAction(
  employeeId: string, 
  chatId: string, 
  username?: string
): Promise<void> {
  await authorizeAction('admin:settings:automations');
  try {
    await linkTelegramManually(employeeId, chatId, username);
    revalidatePath('/dashboard/admin/automations');
  } catch (error: any) {
    await logError('Error al vincular chat ID Telegram manualmente', { employeeId, chatId, error: error.message });
    throw new Error('No se pudo vincular el Chat ID manualmente.');
  }
}

/**
 * Server Action to unlink an employee's Telegram account
 */
export async function unlinkTelegramAction(id: number): Promise<void> {
  await authorizeAction('admin:settings:automations');
  try {
    await removeLinkage(id);
    revalidatePath('/dashboard/admin/automations');
  } catch (error: any) {
    await logError('Error al eliminar vinculación Telegram', { id, error: error.message });
    throw new Error('No se pudo eliminar la vinculación.');
  }
}

/**
 * Server Action to query all existing linkages
 */
export async function getAllLinkagesAction() {
  await authorizeAction('admin:settings:automations');
  return getAllLinkages();
}

/**
 * Server Action to get all active chat state machines
 */
export async function getActiveBotStatesAction() {
  await authorizeAction('admin:settings:automations');
  return getAllActiveBotStates();
}

/**
 * Server Action to clear a stuck state machine
 */
export async function clearBotStateAction(chatId: string): Promise<void> {
  await authorizeAction('admin:settings:automations');
  try {
    await deleteTelegramState(chatId);
    revalidatePath('/dashboard/admin/automations');
    await logInfo(`Conversación de Telegram limpiada manualmente para Chat ID: ${chatId}`);
  } catch (error: any) {
    await logError('Error al limpiar conversación de Telegram', { chatId, error: error.message });
    throw new Error('No se pudo limpiar el estado de la conversación.');
  }
}

/**
 * Server Action to fetch Telegram Bot configuration settings
 */
export async function getTelegramBotSettingsAction() {
  return getTelegramBotSettings();
}

/**
 * Server Action to update a Telegram Bot configuration setting
 */
export async function updateTelegramBotSettingAction(
  key: 'requirePhotoFuel' | 'requirePhotoMaintenance',
  enabled: boolean
): Promise<void> {
  await authorizeAction('admin:settings:automations');
  try {
    await updateTelegramBotSetting(key, enabled);
    revalidatePath('/dashboard/admin/automations');
  } catch (error: any) {
    await logError('Error al actualizar configuración de fotos de Telegram', { key, enabled, error: error.message });
    throw new Error('No se pudo actualizar la configuración.');
  }
}

/**
 * Server Action to automatically register the Webhook url with Telegram Bot API
 */
export async function setupTelegramWebhookAction(): Promise<{ success: boolean; message: string }> {
  await authorizeAction('admin:settings:automations');
  try {
    // 1. Get Telegram Bot configuration
    const config = await getNotificationConfig('telegram');
    if (!config || !config.botToken) {
      throw new Error('El Bot Token de Telegram no está configurado en Servicios Externos.');
    }

    // 2. Get Public Application URL from Company Settings
    const company = await getCompanySettings();
    let publicUrl = company?.publicUrl;

    if (!publicUrl) {
      throw new Error('La URL Pública de la aplicación no está configurada. Vaya a Administración > Configuración de la Empresa.');
    }

    // Clean public URL trailing slash if present
    if (publicUrl.endsWith('/')) {
      publicUrl = publicUrl.substring(0, publicUrl.length - 1);
    }

    // Prevents duplication if the user entered the full webhook URL in Company Settings
    let webhookUrl = publicUrl;
    if (!webhookUrl.endsWith('/api/telegram/webhook')) {
      webhookUrl = `${webhookUrl}/api/telegram/webhook`;
    }

    const telegramUrl = `https://api.telegram.org/bot${config.botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

    const response = await fetch(telegramUrl, { method: 'POST', cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Error de conexión con Telegram: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.description || 'Fallo de registro de Webhook en Telegram.');
    }

    await logInfo(`Webhook de Telegram configurado exitosamente: ${webhookUrl}`);
    return {
      success: true,
      message: `Webhook registrado exitosamente. Destino: ${webhookUrl}`
    };

  } catch (error: any) {
    await logError('Fallo al registrar Webhook de Telegram', { error: error.message });
    return {
      success: false,
      message: error.message || 'No se pudo configurar el Webhook.'
    };
  }
}

/**
 * Server Action to delete Telegram Webhook and clear configuration from database
 */
export async function deleteTelegramWebhookAction(): Promise<{ success: boolean; message: string }> {
  await authorizeAction('admin:settings:automations');
  try {
    // 1. Get Telegram Bot configuration
    const config = await getNotificationConfig('telegram');
    const botToken = config?.botToken;

    // 2. If bot token exists, call deleteWebhook API
    if (botToken) {
      const telegramUrl = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
      try {
        const response = await fetch(telegramUrl, { method: 'POST', cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (!data.ok) {
            await logError('El API de Telegram rechazó la solicitud deleteWebhook', { description: data.description });
          }
        } else {
          await logError(`Error al conectar con deleteWebhook de Telegram: ${response.statusText}`);
        }
      } catch (apiError: any) {
        await logError('Fallo al invocar API deleteWebhook de Telegram', { error: apiError.message });
      }
    }

    // 3. Clear the Telegram configuration in database (empty botToken and chatId)
    await saveNotificationConfig('telegram', { botToken: '', chatId: '' });

    await logInfo('Webhook de Telegram y configuración eliminados exitosamente.');
    revalidatePath('/dashboard/admin/automations');

    return {
      success: true,
      message: 'Webhook de Telegram eliminado y configuración limpiada en base de datos.'
    };
  } catch (error: any) {
    await logError('Fallo al eliminar Webhook de Telegram y configuración', { error: error.message });
    return {
      success: false,
      message: error.message || 'No se pudo eliminar el Webhook y la configuración.'
    };
  }
}

/**
 * Server Action to fetch all active employees for manual pairing
 */
export async function getActiveEmployeesAction() {
  await authorizeAction('admin:settings:automations');
  try {
    return await getAllActiveEmployees();
  } catch (error: any) {
    await logError('Error al cargar empleados activos para Telegram', { error: error.message });
    return [];
  }
}

/**
 * Server Action to fetch all employees (active and inactive) for manual pairing
 */
export async function getAllEmployeesAction() {
  await authorizeAction('admin:settings:automations');
  try {
    return await getAllEmployees();
  } catch (error: any) {
    await logError('Error al cargar todos los empleados para Telegram', { error: error.message });
    return [];
  }
}

/**
 * Server Action to update linkage permissions with admin authorization
 */
export async function updateTelegramLinkagePermissionsAction(
  id: number,
  permissions: { allowFuel: boolean; allowMaintenance: boolean; allowDeliveries: boolean; allowWarehouse: boolean }
): Promise<void> {
  await authorizeAction('admin:settings:automations');
  try {
    await updateLinkagePermissions(id, permissions);
    revalidatePath('/dashboard/admin/automations');
  } catch (error: any) {
    await logError('Error al actualizar permisos de Telegram para vinculación', { id, permissions, error: error.message });
    throw new Error('No se pudieron guardar los permisos.');
  }
}
