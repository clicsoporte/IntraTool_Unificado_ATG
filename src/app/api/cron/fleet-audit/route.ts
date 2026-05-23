// /src/app/api/cron/fleet-audit/route.ts

import { NextResponse } from 'next/server';
import { runFleetAudit } from '@/modules/notifications/lib/scheduler';
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

    // 4. If authorized, run the fleet audit process
    logInfo('Cron job triggered: Starting Fleet Audit (Milestones & Alert checks)...');
    
    const result = await runFleetAudit();
    
    // Refresh relevant cache paths
    revalidatePath('/dashboard/fleet');
    revalidatePath('/dashboard/admin/fleet');

    const summary = `Auditoría de flota completada. Se analizaron ${result.checkedCount} vehículos y se despacharon ${result.alertsSent} alertas.`;
    logInfo('Fleet audit cron job finished successfully.', { summary });

    return NextResponse.json({ 
      success: true, 
      message: summary, 
      checkedCount: result.checkedCount, 
      alertsSent: result.alertsSent 
    });

  } catch (error: any) {
    logError('Error executing fleet audit cron job', { error: error.message });
    return NextResponse.json({ error: `Error interno del servidor: ${error.message}` }, { status: 500 });
  }
}
