/**
 * Servicio de Telemetría y Rastreo GPS Navixy API v2
 * Conector completo que recupera lista de rastreadores, estados en vivo, cálculo de parqueo y coincidencia por placa.
 */
import { getApiSettings } from '@/modules/core/lib/db';
import { getDeliverySettings } from '@/modules/operations/lib/actions';
import { getAllVehicles } from './db';
import { obtenerUbicacionTexto, calcularDistanciaGeografica } from './geocoding-service';
import { logError, logWarn, logInfo } from '@/modules/core/lib/logger';
import { getBusinessDateStr } from '@/modules/core/lib/timezone';

export type NavixyTrackerState = {
    id: number | string;
    label: string;
    plate: string;
    photoUrl?: string;
    lat: number;
    lng: number;
    speed: number;
    ignition: boolean;
    connectionStatus: 'active' | 'offline';
    movementStatus: 'moving' | 'stopped' | 'parked';
    lastUpdate: string;
    movementStatusUpdate: string;
    timeInStateSeconds: number;
    timeInStateFormatted: string;
    isParkedInDepot: boolean;
    locationText: string;
    rawState: any;
};

function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    if (mins < 1) return "1 min";
    if (mins < 60) return `${mins} min`;
    if (mins < 1440) {
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        return remMins > 0 ? `${hrs} h ${remMins} min` : `${hrs} h`;
    }
    const days = Math.floor(mins / 1440);
    const remHrs = Math.floor((mins % 1440) / 60);
    return remHrs > 0 ? `${days} d ${remHrs} h` : `${days} d`;
}

/**
 * Consulta la lista de rastreadores y sus estados en tiempo real directamente a Navixy API.
 */
export async function fetchNavixyLiveTelemetry(): Promise<NavixyTrackerState[]> {
    try {
        const apiSettings = await getApiSettings();
        const opsSettings = await getDeliverySettings();

        const baseUrl = apiSettings?.navixyBaseUrl || "https://fleets.geotracking.co.cr/api-v2";
        const apiKey = apiSettings?.navixyApiKey || "ebfeaf0741b58537be31be2880a09927";

        const depotLat = parseFloat(opsSettings.parqueo_latitud || '10.025541');
        const depotLng = parseFloat(opsSettings.parqueo_longitud || '-84.273252');
        const depotRadius = parseFloat(opsSettings.parqueo_radio_metros || '500');

        // 1. Obtener lista de rastreadores
        const listResp = await fetch(`${baseUrl}/tracker/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash: apiKey }),
            next: { revalidate: 10 }
        });

        if (!listResp.ok) {
            logError('[Navixy API] Falla de respuesta HTTP al llamar a /tracker/list', { status: listResp.status });
            return [];
        }

        const listData = await listResp.json();
        if (!listData.success || !Array.isArray(listData.list)) {
            logWarn('[Navixy API] Respuesta no exitosa en /tracker/list:', listData);
            return [];
        }

        const trackers = listData.list;
        const trackerIds = trackers.map((t: any) => t.id);

        if (trackerIds.length === 0) return [];

        // 2. Obtener estados en lote
        const statesResp = await fetch(`${baseUrl}/tracker/get_states`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash: apiKey, trackers: trackerIds }),
            next: { revalidate: 10 }
        });

        if (!statesResp.ok) {
            logError('[Navixy API] Falla de respuesta HTTP al llamar a /tracker/get_states', { status: statesResp.status });
            return [];
        }

        const statesData = await statesResp.json();
        const statesObj = statesData.states || {};

        // 3. Obtener vehículos registrados en el módulo de Flota para cruzar fotos
        let fleetVehiclesMap: Record<string, string> = {};
        try {
            const dbVehicles = await getAllVehicles();
            if (Array.isArray(dbVehicles)) {
                for (const v of dbVehicles) {
                    if (v.plate && v.photoUrl) {
                        const cleanP = String(v.plate).toUpperCase().replace(/[^A-Z0-9]/g, '');
                        fleetVehiclesMap[cleanP] = v.photoUrl;
                    }
                }
            }
        } catch (e: any) {
            logWarn('No se pudieron consultar vehículos de la DB para cruce de fotos:', { error: e?.message || String(e) });
        }

        // 4. Procesar y estructurar la telemetría por cada camión en paralelo
        const results: NavixyTrackerState[] = await Promise.all(
            trackers.map(async (tracker: any) => {
                const tId = tracker.id;
                const label = tracker.label || '';
                const stateObj = statesObj[tId] || {};

                const gps = stateObj.gps || {};
                const location = gps.location || {};
                const lat = parseFloat(location.lat || 0);
                const lng = parseFloat(location.lng || 0);
                const speed = parseInt(gps.speed || 0, 10);
                const connectionStatus = String(stateObj.connection_status || 'active').toLowerCase() as 'active' | 'offline';
                const movementStatusRaw = String(stateObj.movement_status || 'stopped').toLowerCase();
                const movementStatus = (movementStatusRaw === 'moving' ? 'moving' : 'stopped') as 'moving' | 'stopped' | 'parked';
                const ignition = Boolean(stateObj.ignition);

                const lastUpdate = stateObj.last_update || '';
                const movementUpdate = stateObj.movement_status_update || '';

                let timeInStateSeconds = 0;
                if (movementUpdate) {
                    try {
                        const dtState = new Date(movementUpdate.replace(' ', 'T'));
                        timeInStateSeconds = Math.max(0, Math.floor((Date.now() - dtState.getTime()) / 1000));
                    } catch {
                        timeInStateSeconds = 0;
                    }
                }

                const distToDepot = calcularDistanciaGeografica(depotLat, depotLng, lat, lng);
                const isParkedInDepot = distToDepot <= depotRadius;

                // Extraer la placa limpia desde el label del proveedor (ej. "CL-223185 - ISUZU")
                const plateMatch = label.match(/([A-Z]{1,3}[-\s]?\d{3,7})/i);
                const plate = plateMatch ? plateMatch[1].toUpperCase().replace(/\s+/g, '') : label.trim();
                const cleanSearchPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

                const photoUrl = fleetVehiclesMap[cleanSearchPlate] || '';
                const locationText = await obtenerUbicacionTexto(tId, lat, lng);

                return {
                    id: tId,
                    label,
                    plate,
                    photoUrl,
                    lat,
                    lng,
                    speed,
                    ignition,
                    connectionStatus,
                    movementStatus: isParkedInDepot ? 'parked' : movementStatus,
                    lastUpdate,
                    movementStatusUpdate: movementUpdate,
                    timeInStateSeconds,
                    timeInStateFormatted: formatDuration(timeInStateSeconds),
                    isParkedInDepot,
                    locationText,
                    rawState: JSON.parse(JSON.stringify(stateObj || {}))
                };
            })
        );

        // 5. Integrar fallback de telemetría móvil (APK Flutter) para vehículos sin GPS Navixy o desconectados
        try {
            const { CACHE_MOBILE_TELEMETRY } = await import('@/modules/fleet/lib/mobile-telemetry-cache');
            const nowTime = Date.now();

            for (const key in CACHE_MOBILE_TELEMETRY) {
                const mob = CACHE_MOBILE_TELEMETRY[key];
                if (!mob || !mob.plate) continue;

                const cleanMobPlate = mob.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const existingIdx = results.findIndex(r => r.plate.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanMobPlate);

                // Si no existe en Navixy o si el reporte de Navixy está desactualizado y la telemetría móvil es reciente (< 10 min)
                const mobAgeMinutes = Math.floor((nowTime - new Date(mob.lastUpdate).getTime()) / (1000 * 60));
                if (mobAgeMinutes < 15 && (existingIdx === -1 || results[existingIdx].connectionStatus === 'offline')) {
                    const distToDepot = calcularDistanciaGeografica(depotLat, depotLng, mob.lat, mob.lng);
                    const isParkedInDepot = distToDepot <= depotRadius;

                    const mobileState: NavixyTrackerState = {
                        id: `mobile-${mob.driverId}`,
                        label: `${mob.plate} (GPS Móvil)`,
                        plate: mob.plate,
                        photoUrl: fleetVehiclesMap[cleanMobPlate] || '',
                        lat: mob.lat,
                        lng: mob.lng,
                        speed: mob.speed,
                        ignition: mob.speed > 0,
                        connectionStatus: 'active',
                        movementStatus: isParkedInDepot ? 'parked' : (mob.speed > 5 ? 'moving' : 'stopped'),
                        lastUpdate: mob.lastUpdate,
                        movementStatusUpdate: mob.lastUpdate,
                        timeInStateSeconds: mobAgeMinutes * 60,
                        timeInStateFormatted: `${mobAgeMinutes}m`,
                        isParkedInDepot,
                        locationText: `${mob.lat.toFixed(4)}, ${mob.lng.toFixed(4)} (GPS Móvil)`,
                        rawState: { source: 'mobile_apk', battery: mob.battery }
                    };

                    if (existingIdx >= 0) {
                        results[existingIdx] = mobileState;
                    } else {
                        results.push(mobileState);
                    }
                }
            }
        } catch (err: any) {
            logWarn('Fallo menor al combinar telemetría móvil fallback:', err?.message || String(err));
        }

        // 6. Persistir traza satelital en la base de datos para seguimiento histórico
        syncNavixyTelemetryToDb(results).catch(() => {});

        return JSON.parse(JSON.stringify(results));
    } catch (e: any) {
        logError('Error en fetchNavixyLiveTelemetry:', e.message);
        return [];
    }
}

async function syncNavixyTelemetryToDb(results: NavixyTrackerState[]) {
    try {
        const { getDb } = await import('@/modules/core/lib/db');
        const db = await getDb();
        const todayStr = await getBusinessDateStr();
        const nowIso = new Date().toISOString();

        // Recuperar configuraciones de geocerca y automatización
        const opsSettings = await getDeliverySettings();
        const depotLat = parseFloat(opsSettings.parqueo_latitud || '10.025541');
        const depotLng = parseFloat(opsSettings.parqueo_longitud || '-84.273252');
        const depotRadius = parseFloat(opsSettings.parqueo_radio_metros || '500');
        const autoStartEnabled = opsSettings.auto_start_route_on_depot_exit !== 'false';
        const autoArrivalEnabled = opsSettings.auto_record_arrival_on_depot_entry !== 'false';

        for (const t of results) {
            if (!t.lat || !t.lng || (t.lat === 0 && t.lng === 0)) continue;

            const cleanSearchPlate = t.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

            const activeAssignment = db.prepare(`
                SELECT a.id, a.activa, a.fecha_salida, a.fecha_creacion, a.fecha_inicio_retorno, a.fecha_llegada_bodega, a.latitud_llegada, a.longitud_llegada
                FROM ops_delivery_assignments a
                JOIN fleet_vehicles v ON a.vehiculo_id = v.id
                WHERE (v.plate = ? OR UPPER(REPLACE(v.plate, '-', '')) = ?) 
                  AND a.fecha = ? 
                  AND a.fecha_completada IS NULL
                LIMIT 1
            `).get(t.plate, cleanSearchPlate, todayStr) as { 
                id: number; 
                activa: number; 
                fecha_salida: string | null; 
                fecha_creacion: string | null; 
                fecha_inicio_retorno: string | null; 
                fecha_llegada_bodega?: string | null; 
                latitud_llegada: number | null; 
                longitud_llegada: number | null; 
            } | undefined;

            if (activeAssignment?.id) {
                // 1. Guardar log histórico de GPS sin duplicados cercanos
                const lastLog = db.prepare(`
                    SELECT latitud, longitud 
                    FROM ops_delivery_gps_logs 
                    WHERE asignacion_id = ? 
                    ORDER BY id DESC LIMIT 1
                `).get(activeAssignment.id) as { latitud: number; longitud: number } | undefined;

                if (!lastLog || Math.abs(lastLog.latitud - t.lat) > 0.0001 || Math.abs(lastLog.longitud - t.lng) > 0.0001) {
                    db.prepare(`
                        INSERT INTO ops_delivery_gps_logs (asignacion_id, latitud, longitud, timestamp)
                        VALUES (?, ?, ?, ?)
                    `).run(activeAssignment.id, t.lat, t.lng, t.lastUpdate || nowIso);
                }

                const distToDepot = calcularDistanciaGeografica(depotLat, depotLng, t.lat, t.lng);
                const isOutsideDepot = distToDepot > depotRadius;
                const isInsideDepot = distToDepot <= depotRadius;

                // 2. AUTO-INICIO DE RUTA AL SALIR DEL PATIO (Geocerca Salida)
                if (autoStartEnabled && isOutsideDepot && (!activeAssignment.fecha_salida || activeAssignment.activa === 0)) {
                    db.prepare(`
                        UPDATE ops_delivery_assignments
                        SET activa = 1, fecha_salida = COALESCE(fecha_salida, ?), latitud_inicio = COALESCE(latitud_inicio, ?), longitud_inicio = COALESCE(longitud_inicio, ?)
                        WHERE id = ?
                    `).run(nowIso, t.lat, t.lng, activeAssignment.id);

                    // Pasar documentos pendientes asignados a 'en_ruta'
                    db.prepare(`
                        UPDATE ops_delivery_queue
                        SET estado = 'en_ruta'
                        WHERE asignacion_id = ? AND estado = 'pendiente'
                    `).run(activeAssignment.id);

                    logInfo(`🚚 [Auto-Inicio de Ruta] Camión ${t.plate} salió del patio central (${Math.round(distToDepot)}m). Ruta #${activeAssignment.id} activada.`);
                }

                // 3. AUTO-REGISTRO DE LLEGADA AL PATIO (Geocerca Entrada / Retorno)
                if (autoArrivalEnabled && isInsideDepot && !activeAssignment.fecha_llegada_bodega) {
                    // Verificar si ya concluyó entregas o inició retorno
                    const pendingDocsCount = db.prepare(`
                        SELECT COUNT(*) as count FROM ops_delivery_queue WHERE asignacion_id = ? AND entregado = 0
                    `).get(activeAssignment.id) as { count: number };

                    if (pendingDocsCount.count === 0 || activeAssignment.fecha_inicio_retorno) {
                        db.prepare(`
                            UPDATE ops_delivery_assignments
                            SET fecha_inicio_retorno = COALESCE(fecha_inicio_retorno, ?),
                                fecha_llegada_bodega = COALESCE(fecha_llegada_bodega, ?),
                                latitud_llegada = ?,
                                longitud_llegada = ?
                            WHERE id = ?
                        `).run(nowIso, nowIso, t.lat, t.lng, activeAssignment.id);

                        logInfo(`🏁 [Auto-Llegada a Patio] Camión ${t.plate} ingresó al patio central (${Math.round(distToDepot)}m). Llegada registrada para Ruta #${activeAssignment.id}.`);
                    }
                }
            }
        }
    } catch (e: any) {
        logWarn('Error al sincronizar coordenadas Navixy a ops_delivery_gps_logs:', { error: e?.message || String(e) });
    }
}

/**
 * Busca la telemetría GPS específica de un vehículo dada su placa.
 */
export async function getLiveTelemetryByVehiclePlate(plate: string): Promise<NavixyTrackerState | null> {
    if (!plate) return null;
    const cleanSearchPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const allTelemetry = await fetchNavixyLiveTelemetry();

    return allTelemetry.find(t => {
        const cleanTPlate = t.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        return cleanTPlate === cleanSearchPlate || t.label.toUpperCase().includes(cleanSearchPlate);
    }) || null;
}

/**
 * Validador de estructura de telemetría esperada.
 */
export function validateTelemetryStructure(data: any): boolean {
    return (
        data !== null &&
        typeof data === 'object' &&
        data.lat !== undefined &&
        data.lng !== undefined &&
        typeof data.speed === 'number'
    );
}

/**
 * Verifica si un objeto de datos es serializable a un objeto plano JSON limpio.
 */
export function testSerialization(data: any): boolean {
    try {
        const serialized = JSON.stringify(data);
        const deserialized = JSON.parse(serialized);
        return true;
    } catch {
        return false;
    }
}
