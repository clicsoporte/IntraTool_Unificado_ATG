// /src/app/api/cron/delivery-cleanup/route.ts

import { NextResponse } from 'next/server';
import { sweepActiveAssignments, getDeliverySettings } from '@/modules/operations/lib/actions';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/modules/core/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret) {
            logError('CRON_SECRET is not set in environment variables. Delivery cleanup cron job cannot run.');
            return NextResponse.json({ error: 'La clave secreta del Cron no está configurada en el servidor.' }, { status: 500 });
        }

        // Check for Authorization header
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logError('Delivery cleanup cron job access attempt without proper Authorization header.');
            return NextResponse.json({ error: 'No autorizado: Falta cabecera de autorización.' }, { status: 401 });
        }

        const token = authHeader.substring(7);
        if (token !== cronSecret) {
            logError('Delivery cleanup cron job access attempt with invalid secret key.');
            return NextResponse.json({ error: 'No autorizado: Clave secreta inválida.' }, { status: 403 });
        }

        // Fetch configured sweep hour and business timezone
        const settings = await getDeliverySettings();
        const configuredHour = settings.hora_barrido_fin_jornada || '19:00';
        
        const db = await getDb();
        const companySettings = db.prepare('SELECT timeZone FROM core_company_settings WHERE id = 1').get() as { timeZone?: string } | undefined;
        const bizTimeZone = companySettings?.timeZone || 'America/Costa_Rica';

        // Format execution time in local business timezone
        const formatter = new Intl.DateTimeFormat('fr-CA', {
            timeZone: bizTimeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        // Returns "YYYY-MM-DD HH:MM:SS" or similar depending on platform. We replace the comma or format clean.
        const currentLocalTimeStr = formatter.format(new Date()).replace(', ', ' ');

        logInfo('Iniciando Barrido Nocturno Automático.', {
            evento: 'BARRIDO_INICIO',
            horaConfigurada: configuredHour,
            horaEjecucionLocal: currentLocalTimeStr,
            zonaHorariaNegocio: bizTimeZone
        });

        const sweepResult = await sweepActiveAssignments('Barrido Nocturno Automático');

        // Revalidate relevant cache paths
        revalidatePath('/dashboard/operations/logistics/deliveries');
        revalidatePath('/dashboard/operations/logistics/deliveries/operation');

        if (!sweepResult.success) {
            logError('Fallo en el barrido nocturno automático.', { error: sweepResult.error });
            return NextResponse.json({ error: `Fallo en el barrido nocturno: ${sweepResult.error}` }, { status: 500 });
        }

        const summary = `Barrido nocturno completado. Rutas y asignaciones cerradas/liberadas: ${sweepResult.count}.`;
        logInfo('Barrido Nocturno Automático finalizado con éxito.', {
            evento: 'BARRIDO_FIN',
            resumen: summary,
            rutasCerradas: sweepResult.count,
            horaConfigurada: configuredHour,
            horaEjecucionLocal: currentLocalTimeStr
        });

        return NextResponse.json({ 
            success: true, 
            message: summary, 
            closedCount: sweepResult.count
        });

    } catch (error: any) {
        logError('Error executing delivery cleanup cron job', { error: error.message });
        return NextResponse.json({ error: `Error interno del servidor: ${error.message}` }, { status: 500 });
    }
}
