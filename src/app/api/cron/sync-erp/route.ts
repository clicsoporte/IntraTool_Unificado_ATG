// /src/app/api/cron/sync-erp/route.ts

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { syncAllData } from '@/modules/core/lib/actions';
import { logError, logInfo } from '@/modules/core/lib/logger';

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

    // 4. If authorized, run the sync process
    logInfo('Cron job triggered: Starting full ERP data synchronization...');
    
    const { results, totalTasks } = await syncAllData();
    
    const summary = `Sincronización completada. Se procesaron ${results.length} de ${totalTasks} tareas.`;
    logInfo('Cron job finished successfully.', { summary, results });

    return NextResponse.json({ success: true, message: summary, results });

  } catch (error: any) {
    logError('Error executing cron job for ERP sync', { error: error.message });
    return NextResponse.json({ error: `Error interno del servidor: ${error.message}` }, { status: 500 });
  }
}
