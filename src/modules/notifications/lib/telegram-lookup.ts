import { getDb } from '@/modules/core/lib/db';
import { logError } from '@/modules/core/lib/logger';

/**
 * Resolves the Telegram Chat ID for a user, employee, or salesperson.
 * Hierarchy:
 * 1. Specific User's telegramChatId column in core_users.
 * 2. Telegram Bot linkage in fleet_telegram_linkages by employeeId.
 * 3. Salesperson mapped to user in core_users or linked employee.
 */
export async function getTelegramChatIdForUser(params: {
  userId?: number | string;
  employeeId?: string;
  salespersonId?: string;
}): Promise<string | null> {
  const db = await getDb();
  try {
    const userTableInfo = db.prepare("PRAGMA table_info('core_users')").all().map((c: any) => c.name);
    const hasTelegramCol = userTableInfo.includes('telegramChatId');
    const hasEmployeeCol = userTableInfo.includes('employeeId');
    const hasSalespersonCol = userTableInfo.includes('salespersonId');

    // 1. Direct search by userId
    if (params.userId) {
      const selectCols = [
        hasTelegramCol ? 'telegramChatId' : 'NULL as telegramChatId',
        hasEmployeeCol ? 'employeeId' : 'NULL as employeeId',
      ].join(', ');

      const user = db.prepare(`SELECT ${selectCols} FROM core_users WHERE id = ?`).get(params.userId) as {
        telegramChatId?: string;
        employeeId?: string;
      } | undefined;

      if (user?.telegramChatId) {
        return user.telegramChatId;
      }

      if (user?.employeeId) {
        const linkage = db.prepare('SELECT chatId FROM fleet_telegram_linkages WHERE employeeId = ?').get(user.employeeId) as { chatId?: string } | undefined;
        if (linkage?.chatId) {
          return linkage.chatId;
        }
      }
    }

    // 2. Direct search by employeeId
    if (params.employeeId && hasEmployeeCol) {
      const selectCols = hasTelegramCol ? 'telegramChatId' : 'NULL as telegramChatId';
      const user = db.prepare(`SELECT ${selectCols} FROM core_users WHERE employeeId = ?`).get(params.employeeId) as { telegramChatId?: string } | undefined;
      if (user?.telegramChatId) {
        return user.telegramChatId;
      }

      const linkage = db.prepare('SELECT chatId FROM fleet_telegram_linkages WHERE employeeId = ?').get(params.employeeId) as { chatId?: string } | undefined;
      if (linkage?.chatId) {
        return linkage.chatId;
      }
    }

    // 3. Search by salespersonId
    if (params.salespersonId && hasSalespersonCol) {
      const selectCols = [
        hasTelegramCol ? 'telegramChatId' : 'NULL as telegramChatId',
        hasEmployeeCol ? 'employeeId' : 'NULL as employeeId',
      ].join(', ');

      const user = db.prepare(`SELECT ${selectCols} FROM core_users WHERE salespersonId = ?`).get(params.salespersonId) as {
        telegramChatId?: string;
        employeeId?: string;
      } | undefined;

      if (user?.telegramChatId) {
        return user.telegramChatId;
      }

      if (user?.employeeId) {
        const linkage = db.prepare('SELECT chatId FROM fleet_telegram_linkages WHERE employeeId = ?').get(user.employeeId) as { chatId?: string } | undefined;
        if (linkage?.chatId) {
          return linkage.chatId;
        }
      }
    }

    return null;
  } catch (error: any) {
    await logError('Error resolving Telegram Chat ID in getTelegramChatIdForUser', { params, error: error.message });
    return null;
  }
}
