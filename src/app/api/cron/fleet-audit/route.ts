// /src/app/api/cron/fleet-audit/route.ts

import { NextResponse } from 'next/server';
import { runSystemAudits } from '@/modules/notifications/lib/scheduler';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    // 1. Get the secret key from environment variables
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      logError('CRON_SECRET is not set in environment variables. Fleet audit cron job cannot run.');
      return NextResponse.json({ error: 'La clave secreta del Cron no está configurada en el servidor.' }, { status: 500 });
    }

    // 2. Check for the Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logError('Fleet audit cron job access attempt without proper Authorization header.');
      return NextResponse.json({ error: 'No autorizado: Falta cabecera de autorización.' }, { status: 401 });
    }
    
    // 3. Extract and validate the token
    const token = authHeader.substring(7, authHeader.length);
    if (token !== cronSecret) {
      logError('Fleet audit cron job access attempt with invalid secret key.');
      return NextResponse.json({ error: 'No autorizado: Clave secreta inválida.' }, { status: 403 });
    }

    // 4. Parse request body for manual trigger options (force/taskId)
    let body: any = {};
    try {
      if (request.headers.get('content-type')?.includes('application/json')) {
        body = await request.json();
      }
    } catch (e) {
      // Ignore JSON parsing errors for empty body
    }

    const { taskId, force } = body;

    // 5. If authorized, run the system scheduled tasks scheduler
    logInfo('Cron job triggered: Running System Scheduler (Scheduled Tasks)...', { taskId, force });
    
    const result = await runSystemAudits(!!force, taskId);
    
    // Refresh relevant cache paths
    revalidatePath('/dashboard/fleet');
    revalidatePath('/dashboard/admin/fleet');
    revalidatePath('/dashboard/admin/automations');

    if (!result.success) {
      return NextResponse.json({ error: `Fallo en el planificador: ${result.error}` }, { status: 500 });
    }

    const summary = `Auditoría y tareas programadas procesadas. Tareas ejecutadas: [${result.executedTasks.join(', ') || 'Ninguna (ya al día)'}].`;
    logInfo('Fleet audit/scheduler cron job finished successfully.', { summary });

    return NextResponse.json({ 
      success: true, 
      message: summary, 
      executedTasks: result.executedTasks
    });

  } catch (error: any) {
    logError('Error executing fleet audit cron job', { error: error.message });
    return NextResponse.json({ error: `Error interno del servidor: ${error.message}` }, { status: 500 });
  }
}
