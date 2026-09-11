// /src/app/api/cron/sync-erp/route.ts

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { syncAllData } from '@/modules/core/lib/actions';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { populateDeliveryQueueFromERPInternal } from '@/modules/operations/lib/actions';
import { runSystemAudits } from '@/modules/notifications/lib/scheduler';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    // 1. Get the secret key from environment variables
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      logError('CRON_SECRET is not set in environment variables. Cron job cannot run.');
      return NextResponse.json({ error: 'La clave secreta del Cron no está configurada en el servidor.' }, { status: 500 });
    }

    // 2. Check for the Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logError('Cron job access attempt without proper Authorization header.');
      return NextResponse.json({ error: 'No autorizado: Falta cabecera de autorización.' }, { status: 401 });
    }
    
    // 3. Extract and validate the token using constant-time comparison
    const token = authHeader.substring(7).trim();
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(cronSecret.trim());

    if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
      logError('Cron job access attempt with invalid secret key.');
      return NextResponse.json({ error: 'No autorizado: Clave secreta inválida.' }, { status: 403 });
    }

    // 4. Run ERP data synchronization (SQL Server -> SQLite)
    logInfo('Cron job triggered: Starting full ERP data synchronization...');
    const { results, totalTasks } = await syncAllData();
    logInfo(`ERP Sync finished. Processed ${results.length}/${totalTasks} tasks.`);

    // 5. Auto-populate delivery queue from fresh ERP data (Lookback 5 days, no credit notes excluded)
    let queueCount = 0;
    try {
      logInfo('Cron job: Auto-populating delivery queue from fresh ERP invoices/orders...');
      const queueRes = await populateDeliveryQueueFromERPInternal({ daysLookback: 5, excludeCreditNotes: false });
      queueCount = queueRes.count || 0;
      logInfo(`Delivery queue auto-populated: ${queueCount} new documents imported.`);
      revalidatePath('/dashboard/operations/logistics/deliveries');
      revalidatePath('/dashboard/operations/logistics/deliveries/operation');
    } catch (queueErr: any) {
      logError('Error auto-populating delivery queue in cron job:', { error: queueErr.message });
    }

    // 6. Run System Scheduled Tasks (Fleet Audits, Alerts, Weekly reports configured in /dashboard/admin/automations)
    let executedTasks: string[] = [];
    try {
      logInfo('Cron job: Executing system scheduled tasks (/dashboard/admin/automations)...');
      const auditRes = await runSystemAudits(false);
      executedTasks = auditRes.executedTasks || [];
      revalidatePath('/dashboard/admin/automations');
      revalidatePath('/dashboard/fleet');
    } catch (auditErr: any) {
      logError('Error running scheduled tasks in cron job:', { error: auditErr.message });
    }

    const summary = `Sincronización completada. ERP: ${results.length}/${totalTasks} tareas. Cola de entregas: +${queueCount} docs. Tareas automatizadas: ${executedTasks.length > 0 ? executedTasks.join(', ') : 'Ninguna requerida en este ciclo'}.`;
    logInfo('Cron master execution finished successfully.', { summary, results, queueCount, executedTasks });

    return NextResponse.json({
      success: true,
      message: summary,
      erpResults: results,
      queueAddedCount: queueCount,
      executedTasks
    });

  } catch (error: any) {
    logError('Error executing cron job for ERP sync', { error: error.message });
    return NextResponse.json({ error: `Error interno del servidor: ${error.message}` }, { status: 500 });
  }
}
