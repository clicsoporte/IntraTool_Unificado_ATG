import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import { getBusinessDateStr } from '@/modules/core/lib/timezone';
import { logInfo, logWarn, logError } from '@/modules/core/lib/logger';
import { CACHE_MOBILE_TELEMETRY } from '@/modules/fleet/lib/mobile-telemetry-cache';

async function processMobileTelemetry(params: Record<string, string>) {
    const rawId = params.id || params.deviceid || params.driverId || params.plate || '';
    const latStr = params.lat || params.latitude || '0';
    const lngStr = params.lon || params.lng || params.longitude || '0';
    const speedStr = params.speed || '0';
    const headingStr = params.bearing || params.heading || '0';
    const battStr = params.batt || params.battery || '0';
    const timestampStr = params.timestamp || new Date().toISOString();

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const speed = Math.round(parseFloat(speedStr));
    const heading = parseFloat(headingStr);
    const battery = parseFloat(battStr);

    if (
        !rawId ||
        isNaN(lat) ||
        isNaN(lng) ||
        (lat === 0 && lng === 0) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
    ) {
        return { success: false, error: 'Parámetros de ubicación móviles no válidos' };
    }

    const db = await getDb();
    const todayStr = await getBusinessDateStr();
    const cleanSearchId = rawId.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Buscar asignación activa por Placa de vehículo o ID de chofer
    const activeAssignment = db.prepare(`
        SELECT a.id, a.vehiculo_id, v.plate as vehiculo_placa
        FROM ops_delivery_assignments a
        JOIN fleet_vehicles v ON a.vehiculo_id = v.id
        LEFT JOIN core_users u ON a.empleado_id = u.id
        WHERE (
          v.plate = ? 
          OR UPPER(REPLACE(v.plate, '-', '')) = ? 
          OR UPPER(REPLACE(u.name, ' ', '')) LIKE ? 
          OR CAST(a.empleado_id AS TEXT) = ? 
          OR UPPER(u.email) = ?
          OR UPPER(u.erpAlias) = ?
        )
          AND a.fecha = ?
          AND a.activa = 1
        LIMIT 1
    `).get(rawId, cleanSearchId, `%${cleanSearchId}%`, rawId, cleanSearchId, todayStr) as {
        id: number;
        vehiculo_id: number;
        vehiculo_placa: string;
    } | undefined;

    const resolvedPlate = activeAssignment?.vehiculo_placa || rawId;

    // Guardar en caché de memoria
    CACHE_MOBILE_TELEMETRY[cleanSearchId] = {
        driverId: rawId,
        plate: resolvedPlate,
        lat,
        lng,
        speed,
        heading,
        battery,
        timestamp: timestampStr,
        lastUpdate: new Date().toISOString()
    };

    // Si existe una asignación activa en el día, guardar log GPS
    if (activeAssignment?.id) {
        const lastLog = db.prepare(`
            SELECT latitud, longitud 
            FROM ops_delivery_gps_logs 
            WHERE asignacion_id = ? 
            ORDER BY id DESC LIMIT 1
        `).get(activeAssignment.id) as { latitud: number; longitud: number } | undefined;

        if (!lastLog || Math.abs(lastLog.latitud - lat) > 0.0001 || Math.abs(lastLog.longitud - lng) > 0.0001) {
            db.prepare(`
                INSERT INTO ops_delivery_gps_logs (asignacion_id, latitud, longitud, timestamp)
                VALUES (?, ?, ?, ?)
            `).run(activeAssignment.id, lat, lng, timestampStr);
        }
    }

    return {
        success: true,
        resolvedPlate,
        assignmentId: activeAssignment?.id || null
    };
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const params: Record<string, string> = {};
        url.searchParams.forEach((val, key) => {
            params[key] = val;
        });

        const result = await processMobileTelemetry(params);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
    } catch (e: any) {
        logError('Error en GET /api/fleet/telemetry/mobile:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        let params: Record<string, string> = {};
        const contentType = req.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const body = await req.json();
            for (const k in body) {
                params[k] = String(body[k]);
            }
        } else {
            const formData = await req.formData();
            formData.forEach((val, key) => {
                params[key] = String(val);
            });
        }

        const result = await processMobileTelemetry(params);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
    } catch (e: any) {
        logError('Error en POST /api/fleet/telemetry/mobile:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
