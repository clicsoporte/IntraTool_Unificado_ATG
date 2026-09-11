/**
 * @fileoverview Server-side actions for the new Operations Delivery Monitor v2.1 module.
 * Handlers for settings, daily operations, queue management, concurrent locking, and Telegram bot linkages.
 */
"use server";

import { getDb, getAllSalespersons, getGeographyData, saveGeographyData } from '@/modules/core/lib/db';
import { getCurrentUser } from '@/modules/core/lib/auth';
import { getBusinessDateStr } from '@/modules/core/lib/timezone';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import { revalidatePath } from 'next/cache';
import { logInfo, logWarn, logError } from '@/modules/core/lib/logger';
import { sendEmail } from '@/modules/core/lib/email-service';
import fs from 'fs';
import path from 'path';
import { updateDeliveryStatusInternal, getDocumentLinesInternal } from './delivery-service';
import { renderCompactRouteSheetTimeCell } from './logistics-metrics';

// --- Settings ---

export async function getDeliverySettings(): Promise<Record<string, string>> {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT key, value FROM ops_delivery_settings').all() as { key: string; value: string }[];
        const defaults: Record<string, string> = {
            delivery_mode: 'sencillo',
            release_codes_enabled: 'false',
            release_codes_override_min: '5',
            visibilidad_alertas: 'normal',
            hora_barrido_fin_jornada: '19:00',
            limite_coincidencias: '5',
            notificaciones_email: 'true',
            pedidos_enabled: 'true',
            bot_ask_start_location: 'optional',
            bot_ask_first_client: 'optional',
            bot_ask_return_location: 'optional',
            bot_ask_arrival_location: 'mandatory',
            bot_require_evidence_photo: 'disabled',
            bot_require_invoice_photo: 'disabled',
            collect_consecutive_prefix: 'REC-',
            collect_consecutive_next: '1',
            route_consecutive_prefix: 'RUT-',
            route_consecutive_next: '1',
            boleta_consecutive_prefix: 'BOL-',
            boleta_consecutive_next: '1',
            driver_boleta_print_method: 'all',
            notificaciones_ruta_emails: 'logistica@empresa.com',
            route_sheet_iso_text: 'DOC-LOG-04 | Ver. 02 | Sistema de Gestión de Calidad ISO 9001:2015',
            tracking_source: 'hybrid',
            tiempo_maximo_cliente_min: '20',
            driver_boleta_pdf_enabled: 'true',
            driver_boleta_email_enabled: 'true',
            driver_boleta_print_enabled: 'true',
            driver_boleta_paper_size: '80mm',
            parqueo_latitud: '10.025541',
            parqueo_longitud: '-84.273252',
            parqueo_radio_metros: '500',
            auto_start_route_on_depot_exit: 'true',
            auto_record_arrival_on_depot_entry: 'true',
            intervalo_consulta_gps: '12',
            gps_modo_predeterminado: 'autoAjuste',
            gps_tour_tiempo_sec: '10',
            gps_tour_zoom_level: '17',
            gps_auto_ajuste_interval_sec: '15',
            gps_geocoding_threshold_m: '200',
            gps_ui_refresh_sec: '5',
            supervisor_telegram_chat_ids: '',
            supervisor_telegram_filter: 'all'
        };
        const settings: Record<string, string> = { ...defaults };
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        return JSON.parse(JSON.stringify(settings));
    } catch (e: any) {
        logError('Error fetching ops_delivery_settings:', e.message);
        return {
            delivery_mode: 'sencillo',
            release_codes_enabled: 'false',
            release_codes_override_min: '5',
            visibilidad_alertas: 'normal',
            hora_barrido_fin_jornada: '19:00',
            limite_coincidencias: '5',
            notificaciones_email: 'true',
            pedidos_enabled: 'true',
            bot_ask_start_location: 'optional',
            bot_ask_first_client: 'optional',
            bot_ask_return_location: 'optional',
            bot_ask_arrival_location: 'mandatory',
            bot_require_evidence_photo: 'disabled',
            bot_require_invoice_photo: 'disabled',
            collect_consecutive_prefix: 'REC-',
            collect_consecutive_next: '1',
            route_consecutive_prefix: 'RUT-',
            route_consecutive_next: '1',
            notificaciones_ruta_emails: 'logistica@empresa.com'
        };
    }
}

export async function updateDeliverySettings(settings: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:admin');
    const db = await getDb();
    try {
        // Validación: el intervalo de sincronización automática de la APK no puede ser menor a 5 minutos.
        if (settings.apk_background_sync_minutes !== undefined) {
            const parsed = parseInt(String(settings.apk_background_sync_minutes), 10);
            if (Number.isNaN(parsed) || parsed < 5) {
                return { success: false, error: 'El intervalo de sincronización automática debe ser de al menos 5 minutos.' };
            }
            settings.apk_background_sync_minutes = String(parsed);
        }
        const stmt = db.prepare('INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES (?, ?)');
        const transaction = db.transaction((data) => {
            for (const [key, value] of Object.entries(data)) {
                stmt.run(key, String(value));
            }
        });
        transaction(settings);
        logInfo('[GPS Configuración] Parámetros de entregas y GPS actualizados correctamente', { totalKeys: Object.keys(settings).length });
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error updating ops_delivery_settings:', e.message);
        return { success: false, error: e.message };
    }
}

// --- Routes ---

export async function getDeliveryRoutes(): Promise<any[]> {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT * FROM ops_delivery_routes ORDER BY name ASC').all();
        return JSON.parse(JSON.stringify(rows));
    } catch (e: any) {
        logError('Error getting ops_delivery_routes:', e.message);
        return [];
    }
}

export async function createDeliveryRoute(name: string): Promise<{ success: boolean; id?: number; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        const result = db.prepare('INSERT INTO ops_delivery_routes (name, active) VALUES (?, 1)').run(name);
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true, id: Number(result.lastInsertRowid) };
    } catch (e: any) {
        logError('Error creating ops_delivery_route:', e.message);
        return { success: false, error: e.message };
    }
}

export async function toggleDeliveryRoute(id: number, active: boolean): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        db.prepare('UPDATE ops_delivery_routes SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error toggling ops_delivery_route:', e.message);
        return { success: false, error: e.message };
    }
}

export async function deleteDeliveryRoute(id: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        db.prepare('DELETE FROM ops_delivery_routes WHERE id = ?').run(id);
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error deleting ops_delivery_route:', e.message);
        return { success: false, error: e.message };
    }
}

export async function getCostaRicaGeography(): Promise<any> {
    try {
        const value = await getGeographyData('costa_rica');
        if (!value) return null;
        return JSON.parse(value);
    } catch (e: any) {
        logError('Error reading Costa Rica geography from database:', e.message);
        return null;
    }
}

export async function saveCostaRicaGeographyAction(jsonString: string): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:admin');
    try {
        // Validar formato del JSON
        const parsed = JSON.parse(jsonString);
        if (!parsed || typeof parsed !== 'object' || !parsed.provincias) {
            throw new Error("El JSON no tiene el formato geográfico correcto (debe incluir la clave 'provincias').");
        }
        
        await saveGeographyData('costa_rica', jsonString);
        revalidatePath('/dashboard/admin/operations');
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error saving Costa Rica geography:', e.message);
        return { success: false, error: e.message };
    }
}

export async function restoreDefaultGeographyAction(): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:admin');
    try {
        const filePath = path.join(process.cwd(), 'docs', 'provincias_cantones_distritos_costa_ric.txt');
        if (!fs.existsSync(filePath)) {
            throw new Error("Archivo geográfico base no encontrado en el servidor.");
        }
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        // Validar JSON
        JSON.parse(fileContent);
        await saveGeographyData('costa_rica', fileContent);
        revalidatePath('/dashboard/admin/operations');
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error restoring default Costa Rica geography:', e.message);
        return { success: false, error: e.message };
    }
}

// --- Assignments ---

export async function getActiveAssignmentsToday(includeCompleted = false): Promise<any[]> {
    const db = await getDb();
    try {
        const todayStr = await getBusinessDateStr();
        // Join daily assignments with routes, fleet vehicles, and core users
        const rows = db.prepare(`
            SELECT 
                a.id,
                a.fecha,
                a.ruta_id,
                a.empleado_id,
                a.vehiculo_id,
                a.activa,
                a.siguiente_cliente,
                a.siguiente_cliente_fecha,
                a.fecha_completada,
                a.fecha_creacion,
                a.fecha_inicio_retorno,
                a.latitud_inicio,
                a.longitud_inicio,
                a.latitud_retorno,
                a.longitud_retorno,
                a.latitud_llegada,
                a.longitud_llegada,
                a.origen_salida,
                a.origen_llegada,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                v.brand as vehiculo_marca,
                v.model as vehiculo_modelo
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            WHERE a.fecha = ? AND (a.activa = 1 OR ? = 1)
        `).all(todayStr, includeCompleted ? 1 : 0);
        return JSON.parse(JSON.stringify(rows));
    } catch (e: any) {
        logError('Error getting active assignments:', e.message);
        return [];
    }
}

export async function getHistoricalAssignments(dateString: string): Promise<{ assignments: any[], deliveries: any[] }> {
    const db = await getDb();
    try {
        // Query assignments for specific date
        const assignments = db.prepare(`
            SELECT 
                a.id,
                a.fecha,
                a.ruta_id,
                a.empleado_id,
                a.vehiculo_id,
                a.activa,
                a.siguiente_cliente,
                a.siguiente_cliente_fecha,
                a.fecha_completada,
                a.fecha_creacion,
                a.fecha_inicio_retorno,
                a.latitud_inicio,
                a.longitud_inicio,
                a.latitud_retorno,
                a.longitud_retorno,
                a.latitud_llegada,
                a.longitud_llegada,
                a.origen_salida,
                a.origen_llegada,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                v.brand as vehiculo_marca,
                v.model as vehiculo_modelo
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            WHERE a.fecha = ?
        `).all(dateString);

        // Query assigned deliveries for specific date (including returned ones and direct unassigned deliveries)
        const deliveries = db.prepare(`
            SELECT 
                q.*,
                c.phone as cliente_telefono,
                COALESCE(r.name, 'Entregas Directas (Sin Ruta)') as ruta_nombre,
                COALESCE(u.name, q.gestionado_por, 'Coordinador Web') as chofer_nombre,
                COALESCE(v.plate, 'Despacho Directo') as vehiculo_placa
            FROM ops_delivery_queue q
            LEFT JOIN core_customers c ON q.cliente_id = c.id
            LEFT JOIN ops_delivery_assignments a ON (q.asignacion_id = a.id OR q.devolucion_asignacion_id = a.id)
            LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
            LEFT JOIN core_users u ON a.empleado_id = u.id
            LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            WHERE (a.fecha = ? OR (q.asignacion_id IS NULL AND q.entregado = 1 AND DATE(q.fecha_entrega) = ?))
            ORDER BY q.fecha_registro DESC
        `).all(dateString, dateString);

        return JSON.parse(JSON.stringify({ assignments, deliveries }));
    } catch (e: any) {
        logError('Error getting historical assignments:', e.message);
        return { assignments: [], deliveries: [] };
    }
}

export async function createAssignment(rutaId: number, employeeId: number, vehicleId: number): Promise<{ success: boolean; id?: number; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        const todayStr = await getBusinessDateStr();
        
        const vehicleObj = db.prepare('SELECT plate, status FROM fleet_vehicles WHERE id = ?').get(vehicleId) as { plate: string; status: string } | undefined;
        if (vehicleObj && (vehicleObj.status === 'maintenance' || vehicleObj.status === 'in_taller')) {
            return {
                success: false,
                error: `⚠️ El vehículo (${vehicleObj.plate}) se encuentra actualmente EN TALLER por mantenimiento y no puede ser asignado a una ruta.`
            };
        }

        // Check if vehicle is already active today
        const vehicleConflict = db.prepare(`
            SELECT u.name as chofer_nombre, r.name as ruta_nombre
            FROM ops_delivery_assignments a
            JOIN core_users u ON a.empleado_id = u.id
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            WHERE a.fecha = ? AND a.activa = 1 AND a.vehiculo_id = ?
        `).get(todayStr, vehicleId) as { chofer_nombre: string; ruta_nombre: string } | undefined;

        if (vehicleConflict) {
            return { 
                success: false, 
                error: `El vehículo ya está asignado hoy en la ruta activa "${vehicleConflict.ruta_nombre}" bajo el chofer ${vehicleConflict.chofer_nombre}.` 
            };
        }

        // Check if driver is already active today
        const driverConflict = db.prepare(`
            SELECT r.name as ruta_nombre
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            WHERE a.fecha = ? AND a.activa = 1 AND a.empleado_id = ?
        `).get(todayStr, employeeId) as { ruta_nombre: string } | undefined;

        if (driverConflict) {
            return { 
                success: false, 
                error: `El chofer ya tiene una ruta activa asignada hoy: "${driverConflict.ruta_nombre}".` 
            };
        }

        const transaction = db.transaction(() => {
            return db.prepare(`
                INSERT INTO ops_delivery_assignments (fecha, ruta_id, empleado_id, vehiculo_id, activa, fecha_creacion)
                VALUES (?, ?, ?, ?, 1, ?)
            `).run(todayStr, rutaId, employeeId, vehicleId, new Date().toISOString());
        });

        const result = transaction();

        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true, id: Number(result.lastInsertRowid) };
    } catch (e: any) {
        logError('Error creating daily assignment:', e.message);
        return { success: false, error: e.message };
    }
}

export async function finalizeRouteAssignmentInternal(
    assignmentId: number,
    closedBy: string,
    db: any,
    lat: number | null = null,
    lng: number | null = null
): Promise<{ success: boolean; consecutivo?: string; message?: string; error?: string }> {
    try {
        const nowStr = new Date().toISOString();
        
        // 1. Get assignment details
        const assignment = db.prepare(`
            SELECT 
                a.*,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                v.brand as vehiculo_marca,
                v.model as vehiculo_modelo
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            WHERE a.id = ?
        `).get(assignmentId) as any;

        if (!assignment) {
            return { success: false, error: 'Asignación de ruta no encontrada.' };
        }

        // If already finalized, do nothing
        if (assignment.activa === 0 && assignment.consecutivo) {
            return { success: true, consecutivo: assignment.consecutivo };
        }

        // 2. Verificar si la asignación tuvo documentos cargados (en cola activa o procesados)
        const totalDocsCountRow = db.prepare(`
            SELECT COUNT(*) as count 
            FROM ops_delivery_queue 
            WHERE asignacion_id = ? OR devolucion_asignacion_id = ?
        `).get(assignmentId, assignmentId) as { count: number };
        const hadDocuments = (totalDocsCountRow?.count || 0) > 0;

        let consecutivo: string | undefined = undefined;
        let deliveries: any[] = [];

        db.transaction(() => {
            // CASO A: Si la ruta se abrió y NUNCA se cargó ninguna factura (0 documentos)
            if (!hadDocuments) {
                db.prepare(`
                    UPDATE ops_delivery_assignments
                    SET activa = 0, fecha_completada = ?, consecutivo = NULL, latitud_llegada = ?, longitud_llegada = ?, siguiente_cliente = NULL, siguiente_cliente_fecha = NULL
                    WHERE id = ?
                `).run(nowStr, lat, lng, assignmentId);
                return;
            }

            // CASO B: Si la ruta SÍ tuvo al menos 1 factura cargada
            // 2.1. Generar consecutivo oficial
            const prefixRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'route_consecutive_prefix'").get() as { value: string } | undefined;
            const nextRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'route_consecutive_next'").get() as { value: string } | undefined;

            const prefix = prefixRow?.value || 'RUT-';
            const nextNum = parseInt(nextRow?.value || '1', 10);
            consecutivo = `${prefix}${String(nextNum).padStart(6, '0')}`;

            // 2.2. Actualizar contador
            db.prepare("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('route_consecutive_next', ?)").run(String(nextNum + 1));

            // 2.3. Actualizar asignación con el consecutivo
            db.prepare(`
                UPDATE ops_delivery_assignments
                SET activa = 0, fecha_completada = ?, consecutivo = ?, latitud_llegada = ?, longitud_llegada = ?, siguiente_cliente = NULL, siguiente_cliente_fecha = NULL
                WHERE id = ?
            `).run(nowStr, consecutivo, lat, lng, assignmentId);

            // 2.4. Resetear los documentos que quedaron sin entregar de regreso a la cola general marcando devolucion_asignacion_id
            db.prepare(`
                UPDATE ops_delivery_queue 
                SET devolucion_asignacion_id = asignacion_id, asignacion_id = NULL, estado = 'pendiente', canal_registro = 'web', gestionado_por = ?
                WHERE asignacion_id = ? AND entregado = 0
            `).run(closedBy, assignmentId);

            // 2.5. Consultar entregas para la Hoja de Ruta
            deliveries = db.prepare(`
                SELECT * FROM ops_delivery_queue 
                WHERE asignacion_id = ? OR devolucion_asignacion_id = ?
                ORDER BY CASE WHEN entregado = 1 THEN 0 ELSE 1 END, fecha_entrega ASC, id ASC
            `).all(assignmentId, assignmentId) as any[];
        })();

        if (!hadDocuments) {
            return { 
                success: true, 
                consecutivo: undefined, 
                message: 'Ruta finalizada/anulada sin documentos cargados. No se generó Hoja de Ruta.' 
            };
        }

        // Update local object for rendering
        assignment.fecha_completada = nowStr;
        if (consecutivo) {
            assignment.consecutivo = consecutivo;
        }

        // 2.6. Compilar reporte HTML de Hoja de Ruta
        const htmlReport = await generateRouteSheetHtml(consecutivo || 'RUT-000000', assignment, deliveries, db);

        // 2.7. Despacho de Correo (Asíncrono no bloqueante)
        const emailSettingsRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'notificaciones_ruta_emails'").get() as { value: string } | undefined;
        const emailSettingEnabled = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'notificaciones_email'").get() as { value: string } | undefined;
        
        const enabled = emailSettingEnabled ? emailSettingEnabled.value === 'true' : true;
        const emailsStr = emailSettingsRow?.value || 'logistica@empresa.com';

        if (enabled && emailsStr) {
            const emailList = emailsStr.split(',').map(e => e.trim()).filter(e => e.length > 0);
            if (emailList.length > 0) {
                const subject = `📋 Hoja de Ruta Finalizada - Consecutivo #${consecutivo} - ${assignment.ruta_nombre}`;
                sendEmail({
                    to: emailList,
                    subject,
                    html: htmlReport
                }).then(() => {
                    logInfo(`Sent route sheet email for assignment ${assignmentId} consecutive ${consecutivo} to ${emailList.join(', ')}`);
                }).catch((emailErr: any) => {
                    logWarn(`No se pudo enviar correo de liquidación para ruta ${assignmentId} (${consecutivo}): ${emailErr.message}`);
                });
            }
        }

        return { success: true, consecutivo };
    } catch (err: any) {
        logError('Error in finalizeRouteAssignmentInternal:', err.message);
        return { success: false, error: err.message };
    }
}

export async function closeAssignment(assignmentId: number, closedBy: string): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        const res = await finalizeRouteAssignmentInternal(assignmentId, closedBy, db);
        if (res.success) {
            revalidatePath('/dashboard/operations/logistics/deliveries');
            return { success: true };
        } else {
            return { success: false, error: res.error };
        }
    } catch (e: any) {
        logError('Error closing assignment:', e.message);
        return { success: false, error: e.message };
    }
}

export async function getFinalizedRoutesReport(filters: {
    startDate?: string;
    endDate?: string;
    routeId?: string;
    driverId?: string;
    query?: string;
    page?: number;
    pageSize?: number;
}): Promise<any> {
    const db = await getDb();
    try {
        let whereSql = ` WHERE a.consecutivo IS NOT NULL`;
        const params: any[] = [];

        if (filters.startDate) {
            whereSql += ` AND DATE(a.fecha_completada) >= ?`;
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            whereSql += ` AND DATE(a.fecha_completada) <= ?`;
            params.push(filters.endDate);
        }
        if (filters.routeId) {
            whereSql += ` AND a.ruta_id = ?`;
            params.push(Number(filters.routeId));
        }
        if (filters.driverId) {
            whereSql += ` AND a.empleado_id = ?`;
            params.push(Number(filters.driverId));
        }
        if (filters.query) {
            whereSql += ` AND (a.consecutivo LIKE ? OR u.name LIKE ?)`;
            params.push(`%${filters.query}%`, `%${filters.query}%`);
        }

        const countSql = `
            SELECT COUNT(*) as count 
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            ${whereSql}
        `;
        const countRow = db.prepare(countSql).get(...params) as { count: number };
        const totalCount = countRow?.count || 0;

        let sql = `
            SELECT 
                a.*,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                v.brand as vehiculo_marca,
                v.model as vehiculo_modelo,
                (SELECT COUNT(DISTINCT q.id) FROM ops_delivery_queue q WHERE q.asignacion_id = a.id OR (q.devolucion_asignacion_id = a.id AND q.asignacion_id IS NULL)) as total_entregas
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            ${whereSql}
            ORDER BY a.fecha_completada DESC
        `;

        if (filters.page && filters.pageSize) {
            const limit = Number(filters.pageSize);
            const offset = (Number(filters.page) - 1) * limit;
            sql += ` LIMIT ? OFFSET ?`;
            const pageParams = [...params, limit, offset];
            const rawData = db.prepare(sql).all(...pageParams);
            const data = JSON.parse(JSON.stringify(rawData));
            const totalPages = Math.ceil(totalCount / limit) || 1;
            return { data, totalCount, totalPages, page: Number(filters.page), pageSize: limit };
        }

        const rawData = db.prepare(sql).all(...params);
        return JSON.parse(JSON.stringify(rawData));
    } catch (e: any) {
        logError('Error getting finalized routes report:', e.message);
        return filters.page ? { data: [], totalCount: 0, totalPages: 1, page: 1, pageSize: 25 } : [];
    }
}

export async function getRouteSheetPreviewHtml(assignmentId: number): Promise<{ success: boolean; html?: string; error?: string }> {
    const db = await getDb();
    try {
        const assignment = db.prepare(`
            SELECT 
                a.*,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                v.brand as vehiculo_marca,
                v.model as vehiculo_modelo
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            WHERE a.id = ?
        `).get(assignmentId) as any;

        if (!assignment || !assignment.consecutivo) {
            return { success: false, error: 'Hoja de Ruta no encontrada o no finalizada.' };
        }

        const deliveries = db.prepare(`
            SELECT * FROM ops_delivery_queue 
            WHERE asignacion_id = ? OR devolucion_asignacion_id = ?
            ORDER BY CASE WHEN entregado = 1 THEN 0 ELSE 1 END, fecha_entrega ASC, id ASC
        `).all(assignmentId, assignmentId) as any[];

        const html = await generateRouteSheetHtml(assignment.consecutivo, assignment, deliveries, db);
        return { success: true, html };
    } catch (e: any) {
        logError('Error rendering preview html:', e.message);
        return { success: false, error: e.message };
    }
}

export async function resendRouteSheetEmail(assignmentId: number): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    try {
        const assignment = db.prepare(`
            SELECT 
                a.*,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                v.brand as vehiculo_marca,
                v.model as vehiculo_modelo
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            WHERE a.id = ?
        `).get(assignmentId) as any;

        if (!assignment || !assignment.consecutivo) {
            return { success: false, error: 'Hoja de Ruta no encontrada o no finalizada.' };
        }

        const deliveries = db.prepare(`
            SELECT * FROM ops_delivery_queue 
            WHERE asignacion_id = ? OR devolucion_asignacion_id = ?
            ORDER BY CASE WHEN entregado = 1 THEN 0 ELSE 1 END, fecha_entrega ASC, id ASC
        `).all(assignmentId, assignmentId) as any[];

        const htmlReport = await generateRouteSheetHtml(assignment.consecutivo, assignment, deliveries, db);

        const emailSettingsRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'notificaciones_ruta_emails'").get() as { value: string } | undefined;
        const emailsStr = emailSettingsRow?.value || 'logistica@empresa.com';

        if (emailsStr) {
            const emailList = emailsStr.split(',').map(e => e.trim()).filter(e => e.length > 0);
            if (emailList.length > 0) {
                const subject = `📋 [REENVÍO] Hoja de Ruta Finalizada - Consecutivo #${assignment.consecutivo} - ${assignment.ruta_nombre}`;
                await sendEmail({
                    to: emailList,
                    subject,
                    html: htmlReport
                });
                return { success: true };
            }
        }
        return { success: false, error: 'No se encontraron correos configurados para el reenvío.' };
    } catch (e: any) {
        logError('Error resending email:', e.message);
        return { success: false, error: e.message };
    }
}

export async function getRouteSheetEmailRecipientsAction(): Promise<{ success: boolean; emails: string[]; error?: string }> {
    try {
        const db = await getDb();
        const emailSettingsRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'notificaciones_ruta_emails'").get() as { value: string } | undefined;
        const emailsStr = emailSettingsRow?.value || 'logistica@empresa.com';
        const emails = emailsStr.split(',').map(e => e.trim()).filter(e => e.length > 0);
        return { success: true, emails };
    } catch (e: any) {
        return { success: false, emails: [], error: e.message };
    }
}

async function generateRouteSheetHtml(
    consecutivo: string,
    assignment: any,
    deliveries: any[],
    db: any
): Promise<string> {
    const { getCompanySettings } = await import('@/modules/core/lib/db');
    const company = await getCompanySettings();
    const companyName = company?.name || 'Industrias Garend S.A.';
    const companyTaxId = company?.taxId || '3101133082';
    const companyAddress = company?.address || 'Alajuela, Poás, Carrillos bajo, del EBAIS 700 oeste.';
    const companyPhone = company?.phone || '+506 2458-4343';
    const companyEmail = company?.email || 'ventas@industriasgarend.com';

    const isoSettingRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'route_sheet_iso_text'").get() as { value: string } | undefined;
    const isoText = isoSettingRow?.value || 'DOC-LOG-04 | Ver. 02 | Sistema de Gestión de Calidad ISO 9001:2015';

    const dateStr = new Date(assignment.fecha_completada || assignment.fecha || Date.now()).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
    const timeStr = new Date(assignment.fecha_completada || assignment.fecha || Date.now()).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' });

    let rowsHtml = '';
    if (deliveries.length === 0) {
        rowsHtml = `
            <tr>
                <td colspan="7" style="padding: 16px; text-align: center; color: #64748b; font-style: italic; background: #ffffff;">
                    No se registraron entregas procesadas en esta ruta.
                </td>
            </tr>
        `;
    } else {
        deliveries.forEach((d) => {
            let statusLabel = 'Completo';
            let statusColor = '#059669';
            let statusBg = '#d1fae5';

            if (d.entregado === 0 || d.estado === 'pendiente') {
                statusLabel = 'No Entregado';
                statusColor = '#b45309'; // ámbar oscuro
                statusBg = '#fef3c7';    // amarillo claro
            } else if (d.estado === 'incompleto') {
                statusLabel = 'Incompleto';
                statusColor = '#d97706';
                statusBg = '#fef3c7';
            } else if (d.estado === 'rechazado') {
                statusLabel = 'Rechazado';
                statusColor = '#dc2626';
                statusBg = '#fee2e2';
            }

            // Resolve delivery address
            let addressText = 'DIRECCIÓN GENERAL';
            const cleanDocNumForErp = (d.documento_numero || '').replace('-PARTIAL', '').replace('-RETRY', '');
            try {
                const header = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(cleanDocNumForErp) as { DIREC_EMBARQUE: string | null } | undefined;
                const code = (header?.DIREC_EMBARQUE || 'ND').trim();
                if (code !== 'ND') {
                    const addrRow = db.prepare('SELECT descripcion, detalle_direccion FROM core_customer_shipment_addresses WHERE cliente_id = ? AND direccion_id = ? LIMIT 1').get(d.cliente_id, code) as { descripcion: string | null, detalle_direccion: string | null } | undefined;
                    const desc = addrRow?.descripcion || addrRow?.detalle_direccion || '';
                    addressText = `${code}${desc ? ` - ${desc}` : ''}`;
                }
            } catch (e) {}

            const timeCellHtml = renderCompactRouteSheetTimeCell(d);
            const receptorText = d.nombre_recibe ? `<strong>${d.nombre_recibe}</strong>` : '<span style="color: #94a3b8; font-style: italic;">Sin registrar</span>';

            // Cuadro para Firma (Física o Digital) en la entrega
            const firmaBoxHtml = `
                <div style="width: 82px; height: 32px; border: 1px dashed #cbd5e1; border-radius: 4px; background: #ffffff; display: inline-flex; align-items: center; justify-content: center; font-size: 8.5px; color: #94a3b8; font-style: italic; box-sizing: border-box;">
                    Firma
                </div>
            `;

            let boletaBadgeHtml = '';
            // Solo mostrar el badge de Boleta si d.boleta_numero existe y el documento es una entrega parcial / re-despacho o posee un boleta_numero propio diferenciado
            const isPartialOrRetry = (d.documento_numero || '').includes('-PARTIAL') || (d.documento_numero || '').includes('-RETRY') || !!d.devolucion_asignacion_id;
            if (d.boleta_numero && (isPartialOrRetry || (d.boleta_numero !== d.documento_numero && d.tipo_documento === 'boleta'))) {
                boletaBadgeHtml = `
                    <div style="margin-top: 3px;">
                        <span style="display: inline-block; font-size: 9.5px; font-family: monospace; font-weight: 800; color: #0284c7; background: #e0f2fe; border: 1px solid #bae6fd; padding: 1.5px 5px; border-radius: 4px; white-space: nowrap;">
                            📄 Boleta: #${d.boleta_numero}
                        </span>
                    </div>
                `;
            }

            const rawDocNum = d.referencia_doc || d.documento_numero || '';
            const cleanDocNum = rawDocNum.replace('-PARTIAL', '').replace('-RETRY', '');

            rowsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid;">
                    <td style="padding: 5px 4px; text-align: center; white-space: nowrap; vertical-align: middle;">${timeCellHtml}</td>
                    <td style="padding: 6px 5px; font-size: 11px; color: #1e293b;">
                        <strong>${d.cliente_nombre}</strong><br/>
                        <span style="font-size: 9.5px; color: #64748b; font-weight: 600;">ID: ${d.cliente_id}</span>
                    </td>
                    <td style="padding: 6px 5px; font-size: 11px; color: #0f172a; font-family: monospace; font-weight: bold; white-space: nowrap;">
                        ${cleanDocNum}
                        ${boletaBadgeHtml}
                    </td>
                    <td style="padding: 6px 5px; font-size: 10.5px; color: #475569; line-height: 1.25;">${addressText}</td>
                    <td style="padding: 6px 5px; font-size: 10.5px; color: #334155;">${receptorText}</td>
                    <td style="padding: 6px 5px; text-align: center;">
                        <span style="display: inline-block; padding: 2.5px 7px; border-radius: 9999px; font-size: 9.5px; font-weight: bold; color: ${statusColor}; background-color: ${statusBg}; white-space: nowrap;">
                            ${statusLabel}
                        </span>
                    </td>
                    <td style="padding: 5px 4px; text-align: center; vertical-align: middle;">
                        ${firmaBoxHtml}
                    </td>
                </tr>
            `;
        });
    }

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="utf-8">
        <title>Hoja de Ruta - ${consecutivo}</title>
        <style>
            @page {
                size: letter landscape;
                margin: 7mm 7mm 7mm 7mm;
            }
            @media print {
                body {
                    background-color: #ffffff !important;
                    padding: 0 !important;
                    font-size: 10.5px;
                }
                .no-print {
                    display: none !important;
                }
                .route-sheet-page {
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    max-width: 100% !important;
                    margin-bottom: 0 !important;
                    page-break-after: always;
                    break-after: page;
                }
                .route-sheet-page:last-child {
                    page-break-after: avoid;
                    break-after: avoid;
                }
                thead {
                    display: table-header-group;
                }
                tr {
                    page-break-inside: avoid;
                }
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #f1f5f9;
                margin: 0;
                padding: 16px;
                color: #0f172a;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .route-sheet-page {
                max-width: 1140px;
                margin: 0 auto 24px auto;
                background-color: #ffffff;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            .page-badge {
                display: inline-block;
                background-color: #f1f5f9;
                color: #475569;
                font-size: 10px;
                font-weight: 800;
                padding: 2px 8px;
                border-radius: 4px;
                border: 1px solid #cbd5e1;
                margin-top: 4px;
            }
        </style>
    </head>
    <body>
        <!-- PÁGINA 1: LISTADO DE ENTREGAS Y FACTURAS -->
        <div class="route-sheet-page">
            
            <!-- Encabezado Institucional Página 1 -->
            <table style="margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                <tr>
                    <td style="width: 56%; vertical-align: top;">
                        <h1 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em;">
                            ${companyName}
                        </h1>
                        <div style="font-size: 10.5px; color: #475569; line-height: 1.4;">
                            <strong>Cédula Jurídica:</strong> ${companyTaxId}<br/>
                            ${companyAddress}<br/>
                            <strong>Teléfono:</strong> ${companyPhone} | <strong>Email:</strong> ${companyEmail}
                        </div>
                    </td>
                    <td style="width: 44%; text-align: right; vertical-align: top;">
                        <div style="display: inline-block; background-color: #eff6ff; border: 1.5px solid #93c5fd; border-radius: 8px; padding: 8px 14px; text-align: right; min-width: 250px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                <span style="font-size: 10px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.05em;">HOJA DE RUTA</span>
                                <span style="font-size: 16px; font-weight: 900; color: #1d4ed8; font-family: monospace;">${consecutivo}</span>
                            </div>
                            <div style="font-size: 9.5px; font-weight: bold; color: #0284c7; background: #e0f2fe; padding: 2.5px 6px; border-radius: 4px; margin: 3px 0; text-align: center; border: 1px solid #bae6fd;">
                                📋 ${isoText}
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                                <span style="font-size: 10.5px; color: #475569;">Fecha: <strong>${dateStr} ${timeStr}</strong></span>
                                <span class="page-badge">Hoja 1 de 2</span>
                            </div>
                        </div>
                    </td>
                </tr>
            </table>

            <!-- Datos Generales de la Ruta -->
            <table style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 14px;">
                <tr>
                    <td style="padding: 6px 10px; font-size: 11px; color: #475569; width: 10%;"><strong>Ruta:</strong></td>
                    <td style="padding: 6px 10px; font-size: 11px; color: #0f172a; font-weight: 700; width: 23%;">${assignment.ruta_nombre}</td>
                    <td style="padding: 6px 10px; font-size: 11px; color: #475569; width: 10%;"><strong>Chofer:</strong></td>
                    <td style="padding: 6px 10px; font-size: 11px; color: #0f172a; font-weight: 700; width: 23%;">${assignment.chofer_nombre}</td>
                    <td style="padding: 6px 10px; font-size: 11px; color: #475569; width: 10%;"><strong>Vehículo:</strong></td>
                    <td style="padding: 6px 10px; font-size: 11px; color: #0f172a; font-weight: 700; width: 24%;">${assignment.vehiculo_marca} ${assignment.vehiculo_modelo} (${assignment.vehiculo_placa})</td>
                </tr>
                <tr style="border-top: 1px dashed #e2e8f0;">
                    <td style="padding: 6px 10px; font-size: 10.5px; color: #475569;" colspan="2">
                        🚀 <strong>Salida Parqueo / Ruta:</strong> 
                        <span style="color: #1e40af; font-weight: bold;">
                            ${assignment.fecha_salida ? new Date(assignment.fecha_salida).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) : (assignment.fecha_inicio ? new Date(assignment.fecha_inicio).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) : '--:--')}
                        </span>
                    </td>
                    <td style="padding: 6px 10px; font-size: 10.5px; color: #475569;" colspan="2">
                        🏁 <strong>Llegada Parqueo / Cierre:</strong> 
                        <span style="color: #059669; font-weight: bold;">
                            ${assignment.fecha_inicio_retorno ? new Date(assignment.fecha_inicio_retorno).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) : (assignment.fecha_completada ? new Date(assignment.fecha_completada).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) : '--:--')}
                        </span>
                    </td>
                    <td style="padding: 6px 10px; font-size: 10.5px; color: #475569;" colspan="2">
                        ⏱️ <strong>Estado Ruta:</strong> 
                        <span style="font-weight: bold; color: #0f172a; text-transform: uppercase;">
                            ${assignment.estado || 'FINALIZADA'}
                        </span>
                    </td>
                </tr>
            </table>

            <!-- Listado de Entregas -->
            <table id="route-sheet-deliveries-table" style="margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                        <th style="padding: 7px 5px; text-align: center; font-size: 10.5px; font-weight: bold; color: #334155; width: 105px;">Hora (Ing / Ent / Sal)</th>
                        <th style="padding: 7px 5px; text-align: left; font-size: 10.5px; font-weight: bold; color: #334155; width: 230px;">Cliente</th>
                        <th style="padding: 7px 5px; text-align: left; font-size: 10.5px; font-weight: bold; color: #334155; width: 135px;">N° Factura / Boleta</th>
                        <th style="padding: 7px 5px; text-align: left; font-size: 10.5px; font-weight: bold; color: #334155;">Dirección (EMB)</th>
                        <th style="padding: 7px 5px; text-align: left; font-size: 10.5px; font-weight: bold; color: #334155; width: 110px;">Recibido Por</th>
                        <th style="padding: 7px 5px; text-align: center; font-size: 10.5px; font-weight: bold; color: #334155; width: 85px;">Estado</th>
                        <th style="padding: 7px 5px; text-align: center; font-size: 10.5px; font-weight: bold; color: #334155; width: 92px;">Firma</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div style="margin-top: 14px; text-align: right; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                Continúa en Hoja 2 (Anexo Inspección y Limpieza de Vehículos ISO 9001) ▶
            </div>
        </div>

        <!-- PÁGINA 2: ANEXO DE LIMPIEZA E INSPECCIÓN DE VEHÍCULOS ISO 9001 -->
        <div class="route-sheet-page" style="page-break-before: always; break-before: page;">
            
            <!-- Encabezado Institucional Página 2 -->
            <table style="margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px;">
                <tr>
                    <td style="width: 56%; vertical-align: top;">
                        <h1 style="margin: 0 0 4px 0; font-size: 19px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em;">
                            ${companyName}
                        </h1>
                        <div style="font-size: 11px; color: #475569; line-height: 1.4;">
                            <strong>Cédula Jurídica:</strong> ${companyTaxId}<br/>
                            ${companyAddress}<br/>
                            <strong>Teléfono:</strong> ${companyPhone} | <strong>Email:</strong> ${companyEmail}
                        </div>
                    </td>
                    <td style="width: 44%; text-align: right; vertical-align: top;">
                        <div style="display: inline-block; background-color: #eff6ff; border: 1.5px solid #93c5fd; border-radius: 8px; padding: 8px 14px; text-align: right; min-width: 250px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                <span style="font-size: 10px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.05em;">HOJA DE RUTA</span>
                                <span style="font-size: 16px; font-weight: 900; color: #1d4ed8; font-family: monospace;">${consecutivo}</span>
                            </div>
                            <div style="font-size: 9.5px; font-weight: bold; color: #0284c7; background: #e0f2fe; padding: 2.5px 6px; border-radius: 4px; margin: 3px 0; text-align: center; border: 1px solid #bae6fd;">
                                📋 ${isoText}
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                                <span style="font-size: 10.5px; color: #475569;">Fecha: <strong>${dateStr} ${timeStr}</strong></span>
                                <span class="page-badge">Hoja 2 de 2</span>
                            </div>
                        </div>
                    </td>
                </tr>
            </table>

            <!-- Datos Generales de la Ruta Página 2 -->
            <table style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 20px;">
                <tr>
                    <td style="padding: 7px 12px; font-size: 11.5px; color: #475569; width: 10%;"><strong>Ruta:</strong></td>
                    <td style="padding: 7px 12px; font-size: 11.5px; color: #0f172a; font-weight: 700; width: 23%;">${assignment.ruta_nombre}</td>
                    <td style="padding: 7px 12px; font-size: 11.5px; color: #475569; width: 10%;"><strong>Chofer:</strong></td>
                    <td style="padding: 7px 12px; font-size: 11.5px; color: #0f172a; font-weight: 700; width: 23%;">${assignment.chofer_nombre}</td>
                    <td style="padding: 7px 12px; font-size: 11.5px; color: #475569; width: 10%;"><strong>Vehículo:</strong></td>
                    <td style="padding: 7px 12px; font-size: 11.5px; color: #0f172a; font-weight: 700; width: 24%;">${assignment.vehiculo_marca} ${assignment.vehiculo_modelo} (${assignment.vehiculo_placa})</td>
                </tr>
                <tr style="border-top: 1px dashed #e2e8f0;">
                    <td style="padding: 7px 12px; font-size: 11px; color: #475569;" colspan="3">
                        🚀 <strong>Salida Parqueo:</strong> 
                        <span style="color: #1e40af; font-weight: bold;">
                            ${assignment.fecha_salida ? new Date(assignment.fecha_salida).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) : (assignment.fecha_inicio ? new Date(assignment.fecha_inicio).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) : '--:--')}
                        </span>
                    </td>
                    <td style="padding: 7px 12px; font-size: 11px; color: #475569;" colspan="3">
                        🏁 <strong>Llegada Parqueo:</strong> 
                        <span style="color: #059669; font-weight: bold;">
                            ${assignment.fecha_inicio_retorno ? new Date(assignment.fecha_inicio_retorno).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) : (assignment.fecha_completada ? new Date(assignment.fecha_completada).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) : '--:--')}
                        </span>
                    </td>
                </tr>
            </table>

            <!-- Título de Sección Anexa -->
            <div style="margin-bottom: 12px; padding: 6px 12px; background-color: #f1f5f9; border-left: 4px solid #1d4ed8; border-radius: 0 4px 4px 0;">
                <span style="font-size: 12px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.05em;">
                    ANEXO: CONTROL DE CALIDAD E INSPECCIÓN PRE-OPERACIONAL DEL VEHÍCULO
                </span>
            </div>

            <!-- Lista de Verificación ISO 9001: Limpieza e Inspección de Vehículos -->
            <div style="border: 1.5px solid #0f172a; border-radius: 6px; overflow: hidden; background-color: #ffffff; margin-bottom: 28px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
                    <thead>
                        <tr style="background-color: #0f172a; color: #ffffff;">
                            <th style="padding: 8px 14px; text-align: left; font-weight: 800; font-size: 11.5px; letter-spacing: 0.05em; text-transform: uppercase;">
                                Limpieza e Inspección de Vehículos (X) - Control de Calidad ISO 9001
                            </th>
                            <th style="padding: 8px 14px; text-align: center; width: 100px; font-weight: 800; font-size: 11.5px; letter-spacing: 0.05em; border-left: 1px solid #334155;">
                                ESTADO
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 7px 14px; color: #1e293b;">* Pisos libres de humedad:</td>
                            <td style="padding: 7px 14px; text-align: center; font-weight: 800; color: #0f172a; border-left: 1px solid #cbd5e1; background-color: #f8fafc;">SI</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 7px 14px; color: #1e293b;">* Pisos y esquinas libres de residuos:</td>
                            <td style="padding: 7px 14px; text-align: center; font-weight: 800; color: #0f172a; border-left: 1px solid #cbd5e1; background-color: #f8fafc;">SI</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 7px 14px; color: #1e293b;">* Libre de plagas o insectos:</td>
                            <td style="padding: 7px 14px; text-align: center; font-weight: 800; color: #0f172a; border-left: 1px solid #cbd5e1; background-color: #f8fafc;">SI</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 7px 14px; color: #1e293b;">* Paredes y puertas libres de humedad o suciedad:</td>
                            <td style="padding: 7px 14px; text-align: center; font-weight: 800; color: #0f172a; border-left: 1px solid #cbd5e1; background-color: #f8fafc;">SI</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 7px 14px; color: #1e293b;">* Cabina libre de suciedad o basura:</td>
                            <td style="padding: 7px 14px; text-align: center; font-weight: 800; color: #0f172a; border-left: 1px solid #cbd5e1; background-color: #f8fafc;">SI</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 7px 14px; color: #1e293b;">* Nivel de combustible:</td>
                            <td style="padding: 7px 14px; text-align: center; font-weight: 800; color: #0f172a; border-left: 1px solid #cbd5e1; background-color: #f8fafc;">Revisado</td>
                        </tr>
                        <tr style="background-color: #f1f5f9;">
                            <td style="padding: 8px 14px; font-weight: 800; color: #0f172a;">
                                Realizado por: <span style="font-weight: 700; color: #1e40af;">${assignment.chofer_nombre}</span>
                            </td>
                            <td style="padding: 8px 14px; text-align: center; font-size: 11px; font-weight: 700; color: #475569; border-left: 1px solid #cbd5e1;">
                                CONFORME
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style="margin-top: 35px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                Documento de control logístico emitido bajo las directrices del Sistema de Gestión de Calidad ISO 9001:2015.
            </div>
        </div>
    </body>
    </html>
    `;
}

// --- Queue ---

export async function getGeneralQueue(): Promise<any[]> {
    const db = await getDb();
    try {
        // Auto-cleanup orphan telegram locks older than 15 minutes (TTL 15 min)
        try {
            const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE telegram_lock_at IS NOT NULL AND telegram_lock_at < ?').run(fifteenMinAgo);
        } catch (_) {}

        // Returns pending, unassigned delivery documents (including returns 'D' for visual reference, but they are excluded from routing in the UI)
        const rows = db.prepare(`
            SELECT q.*, c.phone as cliente_telefono
            FROM ops_delivery_queue q
            LEFT JOIN core_customers c ON q.cliente_id = c.id
            WHERE q.entregado = 0 AND q.asignacion_id IS NULL
            ORDER BY q.fecha_registro DESC
        `).all();
        return JSON.parse(JSON.stringify(rows));
    } catch (e: any) {
        logError('Error getting general delivery queue:', e.message);
        return [];
    }
}

export async function getAssignedDeliveriesToday(includeCompleted = false): Promise<any[]> {
    const db = await getDb();
    try {
        // Auto-cleanup orphan telegram locks older than 15 minutes (TTL 15 min)
        try {
            const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE telegram_lock_at IS NOT NULL AND telegram_lock_at < ?').run(fifteenMinAgo);
        } catch (_) {}

        const todayStr = await getBusinessDateStr();
        // Joins queue docs with daily assignments (either active or closed where they got returned)
        const rows = db.prepare(`
            SELECT 
                q.*,
                c.phone as cliente_telefono,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa
            FROM ops_delivery_queue q
            LEFT JOIN core_customers c ON q.cliente_id = c.id
            JOIN ops_delivery_assignments a ON (q.asignacion_id = a.id OR q.devolucion_asignacion_id = a.id)
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            WHERE a.fecha = ? AND (a.activa = 1 OR ? = 1)
            ORDER BY q.fecha_registro DESC
        `).all(todayStr, includeCompleted ? 1 : 0);
        return JSON.parse(JSON.stringify(rows));
    } catch (e: any) {
        logError('Error getting assigned deliveries:', e.message);
        return [];
    }
}

export async function assignDocumentsToRoute(documentIds: number[], assignmentId: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        const stmt = db.prepare('UPDATE ops_delivery_queue SET asignacion_id = ?, devolucion_asignacion_id = NULL, estado = \'en_ruta\' WHERE id = ?');
        const transaction = db.transaction((ids) => {
            for (const id of ids) {
                stmt.run(assignmentId, id);
            }
        });
        transaction(documentIds);

        // Disparar correos si hay recolecciones
        for (const id of documentIds) {
            const doc = db.prepare('SELECT tipo_documento FROM ops_delivery_queue WHERE id = ?').get(id) as { tipo_documento: string } | undefined;
            if (doc?.tipo_documento === 'recoger') {
                await triggerCollectAssignedEmail(id);
                await notifyDriverCollectAssignment(id, assignmentId);
            }
        }

        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error assigning docs to route:', e.message);
        return { success: false, error: e.message };
    }
}

export async function reassignDocument(id: number, newAssignmentId: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        db.prepare('UPDATE ops_delivery_queue SET asignacion_id = ?, devolucion_asignacion_id = NULL, estado = \'en_ruta\' WHERE id = ?').run(newAssignmentId, id);
        
        const doc = db.prepare('SELECT tipo_documento FROM ops_delivery_queue WHERE id = ?').get(id) as { tipo_documento: string } | undefined;
        if (doc?.tipo_documento === 'recoger') {
            await triggerCollectAssignedEmail(id);
            await notifyDriverCollectAssignment(id, newAssignmentId);
        }

        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error reassigning doc:', e.message);
        return { success: false, error: e.message };
    }
}

export async function unassignDocument(id: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        db.prepare(`
            UPDATE ops_delivery_queue 
            SET asignacion_id = NULL, estado = 'pendiente', canal_registro = 'web', gestionado_por = 'Desasignación Manual'
            WHERE id = ?
        `).run(id);
        
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error unassigning document:', e.message);
        return { success: false, error: e.message };
    }
}

export async function releasePendingDocuments(assignmentId: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        db.prepare(`
            UPDATE ops_delivery_queue 
            SET asignacion_id = NULL, estado = 'pendiente', canal_registro = 'web', gestionado_por = 'Liberación Manual'
            WHERE asignacion_id = ? AND entregado = 0
        `).run(assignmentId);
        
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error releasing pending documents:', e.message);
        return { success: false, error: e.message };
    }
}

// --- Direct manual deliveries (Web Coordination) ---

export async function updateDeliveryStatus(
    id: number,
    data: {
        estado: 'completo' | 'incompleto' | 'rechazado';
        comentario?: string;
        canal: 'telegram' | 'web';
        gestionadoPor: string;
        lines?: { codigo: string; desc?: string; pedida: number; entregada: number; faltante: number }[];
        releaseCodeId?: number;
        fotoEvidencia?: string | null;
        fotoFactura?: string | null;
    }
): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    return updateDeliveryStatusInternal(id, data);
}

export async function revertDeliveryStatus(id: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:revert');
    const db = await getDb();
    try {
        const transaction = db.transaction(() => {
            // 1. Get current document details
            const currentDoc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(id) as any;
            if (!currentDoc) throw new Error('Documento no encontrado en la cola.');

            // 2. Revert queue record status to 'pendiente'
            db.prepare(`
                UPDATE ops_delivery_queue
                SET estado = 'pendiente', comentario = null, canal_registro = null, gestionado_por = null, 
                    entregado = 0, fecha_entrega = null, hora_entrega_efectiva = null, tiempo_descarga_min = null,
                    boleta_numero = null, release_code_id = null, 
                    foto_evidencia = null, foto_factura = null, firma_cliente = null, nombre_recibe = null,
                    latitud = null, longitud = null, telegram_lock_at = null, telegram_lock_by = null
                WHERE id = ?
            `).run(id);

            // 3. Delete delivery lines if any exist
            db.prepare('DELETE FROM ops_delivery_lines WHERE delivery_order_id = ?').run(id);

            // 4. Delete generated clones if they exist (PARTIAL or RETRY)
            const partialDocNum = currentDoc.documento_numero + '-PARTIAL';
            const retryDocNum = currentDoc.documento_numero + '-RETRY';

            db.prepare(`
                DELETE FROM ops_delivery_queue 
                WHERE documento_numero IN (?, ?) AND entregado = 0 AND estado = 'pendiente'
            `).run(partialDocNum, retryDocNum);
        });

        transaction();
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (error: any) {
        console.error("Error in revertDeliveryStatus:", error);
        return { success: false, error: error.message || 'No se pudo revertir el estado de la entrega.' };
    }
}

// --- Telegram Locking ---

export async function lockDocumentTelegram(id: number, chatId: string): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        const nowStr = new Date().toISOString();
        db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?').run(nowStr, chatId, id);
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error locking document:', e.message);
        return { success: false, error: e.message };
    }
}

export async function unlockDocumentTelegram(id: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(id);
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error unlocking document:', e.message);
        return { success: false, error: e.message };
    }
}

// --- Autoload/Populate queue from ERP cache ---

export async function populateDeliveryQueueFromERPInternal(options?: {
    daysLookback?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    excludeCreditNotes?: boolean;
}): Promise<{ success: boolean; count: number; error?: string }> {
    const db = await getDb();
    try {
        let addedCount = 0;

        let whereInvoices = "ANULADA <> 'S'";
        let whereOrders = "ESTADO = 'A'";
        const paramsInvoices: any[] = [];
        const paramsOrders: any[] = [];

        if (options) {
            if (options.excludeCreditNotes) {
                whereInvoices += " AND (TIPO_DOCUMENTO IS NULL OR TIPO_DOCUMENTO <> 'D')";
            }
            if (options.daysLookback !== undefined && options.daysLookback !== null) {
                const dateThreshold = new Date();
                dateThreshold.setDate(dateThreshold.getDate() - options.daysLookback);
                const thresholdStr = await getBusinessDateStr(dateThreshold);
                
                whereInvoices += " AND FECHA >= ?";
                whereOrders += " AND FECHA_PEDIDO >= ?";
                paramsInvoices.push(thresholdStr);
                paramsOrders.push(thresholdStr);
            } else {
                if (options.startDate) {
                    whereInvoices += " AND FECHA >= ?";
                    whereOrders += " AND FECHA_PEDIDO >= ?";
                    paramsInvoices.push(options.startDate);
                    paramsOrders.push(options.startDate);
                }
                if (options.endDate) {
                    whereInvoices += " AND FECHA <= ?";
                    whereOrders += " AND FECHA_PEDIDO <= ?";
                    paramsInvoices.push(options.endDate);
                    paramsOrders.push(options.endDate);
                }
            }
        }

        const fallbackDateStr = await getBusinessDateStr();
        const transaction = db.transaction(() => {
            // A. Import from active ERP Invoices (Both F and D) cruzando con core_erp_order_headers por PEDIDO
            const erpInvoices = db.prepare(`
                SELECT 
                    h.FACTURA, 
                    h.CLIENTE, 
                    h.NOMBRE_CLIENTE, 
                    h.USUARIO as FACTURADOR_USUARIO, 
                    h.VENDEDOR, 
                    h.FECHA, 
                    h.TIPO_DOCUMENTO, 
                    h.FACTURA_ORIGINAL, 
                    h.PEDIDO,
                    o.USUARIO as CREADOR_PEDIDO_USUARIO
                FROM core_erp_invoice_headers h
                LEFT JOIN core_erp_order_headers o ON (
                    (h.PEDIDO IS NOT NULL AND h.PEDIDO <> '' AND h.PEDIDO = o.PEDIDO)
                    OR (h.PEDIDO IS NOT NULL AND h.PEDIDO <> '' AND TRIM(h.PEDIDO) = TRIM(o.PEDIDO))
                )
                WHERE ${whereInvoices}
            `).all(...paramsInvoices) as any[];

            const insertInvoice = db.prepare(`
                INSERT INTO ops_delivery_queue (documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por, fecha_registro, estado, entregado, tipo_documento_erp, factura_original)
                VALUES (?, 'factura', ?, ?, ?, ?, 'pendiente', 0, ?, ?)
            `);

            const checkInvoiceExists = db.prepare('SELECT 1 FROM ops_delivery_queue WHERE documento_numero = ? AND tipo_documento = \'factura\'');

            for (const inv of erpInvoices) {
                const exists = checkInvoiceExists.get(inv.FACTURA);
                if (!exists) {
                    // Prioridad: 1. Creador real del Pedido en Softland -> 2. Vendedor de Factura -> 3. Usuario Facturador de Lote
                    const finalCreator = (inv.CREADOR_PEDIDO_USUARIO && String(inv.CREADOR_PEDIDO_USUARIO).trim())
                        ? String(inv.CREADOR_PEDIDO_USUARIO).trim()
                        : ((inv.VENDEDOR && String(inv.VENDEDOR).trim())
                            ? String(inv.VENDEDOR).trim()
                            : (inv.FACTURADOR_USUARIO || 'ERP_SYNC'));

                    insertInvoice.run(
                        inv.FACTURA, 
                        inv.CLIENTE, 
                        inv.NOMBRE_CLIENTE || 'Cliente ERP', 
                        finalCreator, 
                        inv.FECHA || fallbackDateStr,
                        inv.TIPO_DOCUMENTO || 'F',
                        inv.FACTURA_ORIGINAL || null
                    );
                    addedCount++;
                }
            }

            // A.1. Auto-Curación Retrospectiva: Actualizar el creador real de todas las facturas en cola (no entregadas) que tengan pedido asignado
            try {
                db.prepare(`
                    UPDATE ops_delivery_queue
                    SET creado_por = (
                        SELECT o.USUARIO
                        FROM core_erp_invoice_headers h
                        JOIN core_erp_order_headers o ON (h.PEDIDO = o.PEDIDO OR TRIM(h.PEDIDO) = TRIM(o.PEDIDO))
                        WHERE h.FACTURA = ops_delivery_queue.documento_numero
                          AND o.USUARIO IS NOT NULL
                          AND o.USUARIO <> ''
                        LIMIT 1
                    )
                    WHERE tipo_documento = 'factura'
                      AND EXISTS (
                        SELECT 1
                        FROM core_erp_invoice_headers h
                        JOIN core_erp_order_headers o ON (h.PEDIDO = o.PEDIDO OR TRIM(h.PEDIDO) = TRIM(o.PEDIDO))
                        WHERE h.FACTURA = ops_delivery_queue.documento_numero
                          AND o.USUARIO IS NOT NULL
                          AND o.USUARIO <> ''
                          AND ops_delivery_queue.creado_por <> o.USUARIO
                      )
                `).run();
            } catch (curationErr: any) {
                console.warn('Auto-curación de creadores ERP advertencia:', curationErr.message);
            }

            // B. Import from active ERP Orders
            const pedRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'pedidos_enabled'").get() as { value: string } | undefined;
            const ordersEnabled = pedRow ? pedRow.value !== 'false' : true;

            if (ordersEnabled) {
                const erpOrders = db.prepare(`
                    SELECT PEDIDO, CLIENTE, USUARIO, FECHA_PEDIDO
                    FROM core_erp_order_headers
                    WHERE ${whereOrders}
                `).all(...paramsOrders) as any[];

                const insertOrder = db.prepare(`
                    INSERT INTO ops_delivery_queue (documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por, fecha_registro, estado, entregado)
                    VALUES (?, 'pedido', ?, ?, ?, ?, 'pendiente', 0)
                `);

                const checkOrderExists = db.prepare('SELECT 1 FROM ops_delivery_queue WHERE documento_numero = ? AND tipo_documento = \'pedido\'');
                const getCustomerName = db.prepare('SELECT name FROM core_customers WHERE id = ?');

                for (const ord of erpOrders) {
                    const exists = checkOrderExists.get(ord.PEDIDO);
                    if (!exists) {
                        const cust = getCustomerName.get(ord.CLIENTE) as { name: string } | undefined;
                        insertOrder.run(ord.PEDIDO, ord.CLIENTE, cust?.name || 'Cliente ERP', ord.USUARIO || 'ERP_SYNC', ord.FECHA_PEDIDO || fallbackDateStr);
                        addedCount++;
                    }
                }
            }
        });

        transaction();
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true, count: addedCount };
    } catch (e: any) {
        logError('Error populating delivery queue from ERP:', e.message);
        return { success: false, count: 0, error: e.message };
    }
}

export async function populateDeliveryQueueFromERP(options?: {
    daysLookback?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    excludeCreditNotes?: boolean;
}): Promise<{ success: boolean; count: number; error?: string }> {
    await authorizeAction('deliveries:write');
    return populateDeliveryQueueFromERPInternal(options);
}

// --- Auto-Route queue based on invoice RUTA ---

export async function autoRouteQueueToday(): Promise<{ success: boolean; count: number; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        const todayStr = await getBusinessDateStr();
        let routedCount = 0;
        const transaction = db.transaction(() => {
            
            // 1. Get active assignments today
            const activeAssignments = db.prepare(`
                SELECT a.id, r.name as ruta_nombre
                FROM ops_delivery_assignments a
                JOIN ops_delivery_routes r ON a.ruta_id = r.id
                WHERE a.fecha = ? AND a.activa = 1
            `).all(todayStr) as { id: number; ruta_nombre: string }[];

            if (activeAssignments.length === 0) return;

            // 2. Get unassigned pending invoices (excluding returns 'D')
            const pendingInvoices = db.prepare(`
                SELECT id, documento_numero 
                FROM ops_delivery_queue 
                WHERE tipo_documento = 'factura' AND entregado = 0 AND asignacion_id IS NULL AND (tipo_documento_erp IS NULL OR tipo_documento_erp <> 'D')
            `).all() as { id: number; documento_numero: string }[];

            const getErpInvoiceRoute = db.prepare('SELECT RUTA FROM core_erp_invoice_headers WHERE FACTURA = ?');

            for (const doc of pendingInvoices) {
                const erpRoute = getErpInvoiceRoute.get(doc.documento_numero) as { RUTA: string } | undefined;
                if (erpRoute && erpRoute.RUTA) {
                    const routeNameClean = erpRoute.RUTA.toLowerCase().trim();
                    // Find active assignment matching route name
                    const match = activeAssignments.find(a => 
                        a.ruta_nombre.toLowerCase().includes(routeNameClean) || 
                        routeNameClean.includes(a.ruta_nombre.toLowerCase())
                    );
                    if (match) {
                        db.prepare('UPDATE ops_delivery_queue SET asignacion_id = ?, estado = \'en_ruta\' WHERE id = ?').run(match.id, doc.id);
                        routedCount++;
                    }
                }
            }
        });

        transaction();
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true, count: routedCount };
    } catch (e: any) {
        logError('Error auto-routing deliveries:', e.message);
        return { success: false, count: 0, error: e.message };
    }
}

export async function getDrivers(): Promise<any[]> {
    const db = await getDb();
    try {
        // Enforce using the manual driver list configured in Fleet Settings
        const rows = db.prepare(`
            SELECT id, name 
            FROM core_users 
            WHERE employeeId IN (
                SELECT value FROM fleet_settings WHERE category = 'driver'
            )
            ORDER BY name ASC
        `).all();
        return JSON.parse(JSON.stringify(rows));
    } catch (e: any) {
        logError('Error getting drivers:', e.message);
        return [];
    }
}

export async function getVehicles(): Promise<any[]> {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT id, plate, brand, model FROM fleet_vehicles ORDER BY plate ASC').all();
        return JSON.parse(JSON.stringify(rows));
    } catch (e: any) {
        logError('Error getting vehicles:', e.message);
        return [];
    }
}

export async function getDocumentLines(docNum: string, tipo: 'factura' | 'pedido'): Promise<any[]> {
    return getDocumentLinesInternal(docNum, tipo);
}

export async function generateReleaseCode(deliveryOrderId: number, generadoPor: string): Promise<{ success: boolean; codigo?: string; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        const codigo = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
        const now = new Date();
        const dateGen = now.toISOString();
        const dateExp = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 mins expiry

        // Deactivate older unused codes for this delivery order
        db.prepare('UPDATE ops_delivery_release_codes SET usado = 1 WHERE delivery_order_id = ?').run(deliveryOrderId);

        db.prepare(`
            INSERT INTO ops_delivery_release_codes (codigo, delivery_order_id, generado_por, usado, fecha_generacion, fecha_expiracion, es_override)
            VALUES (?, ?, ?, 0, ?, ?, 0)
        `).run(codigo, deliveryOrderId, generadoPor, dateGen, dateExp);

        return { success: true, codigo };
    } catch (e: any) {
        logError('Error generating release code:', e.message);
        return { success: false, error: e.message };
    }
}

export async function getActiveReleaseCode(deliveryOrderId: number): Promise<any | null> {
    const db = await getDb();
    try {
        // Return active code (not used, not expired)
        const row = db.prepare(`
            SELECT * FROM ops_delivery_release_codes 
            WHERE delivery_order_id = ? AND usado = 0 
            ORDER BY id DESC LIMIT 1
        `).get(deliveryOrderId) as any;
        
        if (row) {
            const exp = new Date(row.fecha_expiracion).getTime();
            const now = new Date().getTime();
            if (exp > now) {
                return row;
            }
        }
        return null;
    } catch (e: any) {
        logError('Error getting active release code:', e.message);
        return null;
    }
}

function getUndeliveredSweepEmailHtml({
    docNumero,
    tipoDoc,
    clienteNombre,
    rutaNombre,
    choferNombre,
    vehiculoPlaca,
    baseAppUrl = 'http://localhost:3000'
}: {
    docNumero: string;
    tipoDoc: string;
    clienteNombre: string;
    rutaNombre: string;
    choferNombre: string;
    vehiculoPlaca: string;
    baseAppUrl?: string;
}) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pedido No Entregado hoy - Clic-Tools</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); overflow: hidden; border: 1px solid #f3f4f6;">
            <!-- Header Banner -->
            <div style="background-color: #475569; padding: 24px; text-align: center; color: #ffffff;">
                <span style="font-size: 32px; display: block; margin-bottom: 8px;">🗓️</span>
                <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">Pedido no entregado hoy</h2>
            </div>
            
            <!-- Content -->
            <div style="padding: 24px; color: #374151; line-height: 1.5;">
                <p style="margin: 0 0 16px 0; font-size: 15px;">Estimado colaborador, te informamos que al cierre del día el siguiente documento asignado a ruta no ha sido reportado como entregado y se ha devuelto a la cola de pendientes:</p>
                
                <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr>
                            <td style="padding: 4px 0; color: #6b7280; width: 140px;">Documento:</td>
                            <td style="padding: 4px 0; color: #111827; font-weight: 600;">#${docNumero}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #6b7280;">Tipo Documento:</td>
                            <td style="padding: 4px 0; color: #111827; font-weight: 500; text-transform: capitalize;">${tipoDoc}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #6b7280;">Cliente:</td>
                            <td style="padding: 4px 0; color: #111827; font-weight: 500;">${clienteNombre}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #6b7280;">Ruta Asignada:</td>
                            <td style="padding: 4px 0; color: #111827; font-weight: 500;">${rutaNombre || 'Sin Ruta'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #6b7280;">Chofer:</td>
                            <td style="padding: 4px 0; color: #111827; font-weight: 500;">${choferNombre || 'Sin Chofer'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #6b7280;">Camión Placa:</td>
                            <td style="padding: 4px 0; color: #111827; font-weight: 500;">${vehiculoPlaca || 'Sin Placa'}</td>
                        </tr>
                    </table>
                </div>

                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                    <a href="${baseAppUrl}/dashboard/operations/logistics/deliveries" style="display: inline-block; background-color: #475569; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; box-shadow: 0 2px 4px rgba(71, 85, 105, 0.2);">
                        Ir al Monitor de Entregas
                    </a>
                </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af;">
                <p style="margin: 0 0 5px 0;">Este es un correo automático generado por Clic-Tools.</p>
                <p style="margin: 0;">Por favor no respondas a este correo. Todos los derechos reservados &copy; ${new Date().getFullYear()}.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

export async function sweepActiveAssignments(closedBy: string): Promise<{ success: boolean; count: number; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        let closedCount = 0;
        const undeliveredToNotify: {
            doc: any;
            ruta_nombre: string;
            chofer_nombre: string;
            vehiculo_placa: string;
        }[] = [];

        // Find all active assignments with their details before deactivating them
        const activeAssignments = db.prepare(`
            SELECT a.id, r.name as ruta_nombre, u.name as chofer_nombre, v.plate as vehiculo_placa
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            WHERE a.activa = 1
        `).all() as { id: number; ruta_nombre: string; chofer_nombre: string; vehiculo_placa: string }[];

        for (const ass of activeAssignments) {
            // Scan remaining pending / en_ruta documents assigned before closing to trigger notification
            const undeliveredDocs = db.prepare(`
                SELECT * 
                FROM ops_delivery_queue 
                WHERE asignacion_id = ? AND entregado = 0
            `).all(ass.id) as any[];

            for (const doc of undeliveredDocs) {
                undeliveredToNotify.push({
                    doc,
                    ruta_nombre: ass.ruta_nombre,
                    chofer_nombre: ass.chofer_nombre,
                    vehiculo_placa: ass.vehiculo_placa
                });
            }

            // Finalize route: assigns consecutive, resets pending docs, sends Hoja de Ruta email
            await finalizeRouteAssignmentInternal(ass.id, closedBy, db);
            closedCount++;
        }

        revalidatePath('/dashboard/operations/logistics/deliveries');

        // 4. Send email notifications asynchronously in the background
        if (undeliveredToNotify.length > 0) {
            (async () => {
                for (const item of undeliveredToNotify) {
                    try {
                        const { doc, ruta_nombre, chofer_nombre, vehiculo_placa } = item;
                        
                        const companySettings = db.prepare('SELECT publicUrl FROM core_company_settings WHERE id = 1').get() as { publicUrl?: string } | undefined;
                        const baseAppUrl = companySettings?.publicUrl || 'http://localhost:3000';

                        // Build email template
                        const emailHtml = getUndeliveredSweepEmailHtml({
                            docNumero: doc.documento_numero,
                            tipoDoc: doc.tipo_documento,
                            clienteNombre: doc.cliente_nombre,
                            rutaNombre: ruta_nombre,
                            choferNombre: chofer_nombre,
                            vehiculoPlaca: vehiculo_placa,
                            baseAppUrl
                        });
                        
                        const emailSubject = `[LOGÍSTICA - NO ENTREGADO] Pedido #${doc.documento_numero} no entregado hoy`;
                        const sentEmails = new Set<string>();

                        // --- 1. Resolve Vendedor (Salesperson) ---
                        let salespersonCode: string | null = null;
                        if (doc.tipo_documento === 'factura') {
                            const erpInvoice = db.prepare('SELECT VENDEDOR FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { VENDEDOR: string } | undefined;
                            if (erpInvoice?.VENDEDOR) {
                                salespersonCode = erpInvoice.VENDEDOR;
                            }
                        }
                        if (!salespersonCode) {
                            const customer = db.prepare('SELECT salesperson FROM core_customers WHERE id = ?').get(doc.cliente_id) as { salesperson: string } | undefined;
                            if (customer?.salesperson) {
                                salespersonCode = customer.salesperson;
                            }
                        }

                        const shouldSendNotification = (userId: number, channel: 'email' | 'telegram', estado: string): boolean => {
                            try {
                                const prefs = db.prepare("SELECT key, value FROM core_user_preferences WHERE userId = ?").all(userId) as { key: string, value: string }[];
                                const map = new Map(prefs.map(p => [p.key, p.value]));
                                const master = map.get('notif_master');
                                if (master === 'false' || master === '0') return false;
                                if (channel === 'email') {
                                    const chEmail = map.get('notif_channel_email');
                                    if (chEmail === 'false' || chEmail === '0') return false;
                                }
                                const norm = estado.toLowerCase().trim();
                                if (norm === 'completo' || norm === 'entregado') {
                                    const comp = map.get('ops_notif_delivery_completed');
                                    if (comp === 'false' || comp === '0') return false;
                                    const legacy = map.get('ops_delivery_notifications_enabled');
                                    if (comp === undefined && (legacy === 'false' || legacy === '0')) return false;
                                } else if (norm === 'incompleto') {
                                    const incomp = map.get('ops_notif_delivery_incomplete');
                                    if (incomp === 'false' || incomp === '0') return false;
                                } else if (norm === 'rechazado') {
                                    const rej = map.get('ops_notif_delivery_rejected');
                                    if (rej === 'false' || rej === '0') return false;
                                }
                                return true;
                            } catch (e) {
                                return true;
                            }
                        };

                        if (salespersonCode) {
                            const spData = db.prepare('SELECT ACTIVO FROM core_salespersons WHERE VENDEDOR = ?').get(salespersonCode) as { ACTIVO: string } | undefined;
                            if (!spData || spData.ACTIVO !== 'N') {
                                const spUser = db.prepare('SELECT id, email, employeeId FROM core_users WHERE salespersonId = ?').get(salespersonCode) as { id: number, email: string, employeeId: string | null } | undefined;
                                if (spUser && spUser.email) {
                                    let spActive = true;
                                    if (spUser.employeeId) {
                                        const empData = db.prepare('SELECT ACTIVO FROM core_employees WHERE EMPLEADO = ?').get(spUser.employeeId) as { ACTIVO: string } | undefined;
                                        if (empData && empData.ACTIVO === 'N') {
                                            spActive = false;
                                        }
                                    }

                                    if (spActive) {
                                        const isAllowed = shouldSendNotification(Number(spUser.id), 'email', doc.estado || 'completo');
                                        if (isAllowed) {
                                            logInfo(`Sending salesperson night sweep notification to ${spUser.email} for document ${doc.documento_numero}`);
                                            await sendEmail({
                                                to: spUser.email,
                                                subject: emailSubject,
                                                html: emailHtml
                                            });
                                            sentEmails.add(spUser.email.toLowerCase().trim());
                                        }
                                    }
                                }
                            }
                        }

                        // --- 2. Resolve ERP Creador (User) ---
                        const erpAlias = doc.creado_por;
                        if (erpAlias) {
                            const creatorUser = db.prepare('SELECT id, email, employeeId, salespersonId FROM core_users WHERE erpAlias = ?').get(erpAlias) as { id: number, email: string, employeeId: string | null, salespersonId: string | null } | undefined;
                            if (creatorUser && creatorUser.email) {
                                const emailClean = creatorUser.email.toLowerCase().trim();
                                if (!sentEmails.has(emailClean)) {
                                    let creatorActive = true;
                                    if (creatorUser.employeeId) {
                                        const empData = db.prepare('SELECT ACTIVO FROM core_employees WHERE EMPLEADO = ?').get(creatorUser.employeeId) as { ACTIVO: string } | undefined;
                                        if (empData && empData.ACTIVO === 'N') {
                                            creatorActive = false;
                                        }
                                    }
                                    if (creatorUser.salespersonId) {
                                        const spData = db.prepare('SELECT ACTIVO FROM core_salespersons WHERE VENDEDOR = ?').get(creatorUser.salespersonId) as { ACTIVO: string } | undefined;
                                        if (spData && spData.ACTIVO === 'N') {
                                            creatorActive = false;
                                        }
                                    }
                                    if (creatorActive) {
                                        const isAllowed = shouldSendNotification(Number(creatorUser.id), 'email', doc.estado || 'completo');
                                        if (isAllowed) {
                                            logInfo(`Sending ERP Creator night sweep notification to ${creatorUser.email} for document ${doc.documento_numero}`);
                                            await sendEmail({
                                                to: creatorUser.email,
                                                subject: emailSubject,
                                                html: emailHtml
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    } catch (mailErr: any) {
                        logError(`Failed to send night sweep notification for item:`, mailErr.message);
                    }
                }
            })();
        }

        return { success: true, count: closedCount };
    } catch (e: any) {
        logError('Error sweeping active assignments:', e.message);
        return { success: false, count: 0, error: e.message };
    }
}

export async function getAllSalespersonsAction(): Promise<any[]> {
    return getAllSalespersons();
}

export async function markDocumentsAsDeliveredBulkAction(
    ids: number[],
    user: string
): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        const todayStr = new Date().toISOString();
        const stmt = db.prepare(`
            UPDATE ops_delivery_queue
            SET entregado = 1, estado = 'completo', gestionado_por = ?, fecha_entrega = ?, canal_registro = 'web'
            WHERE id = ?
        `);
        const transaction = db.transaction((docIds: number[]) => {
            for (const id of docIds) {
                stmt.run(user, todayStr, id);
            }
        });
        transaction(ids);
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error in markDocumentsAsDeliveredBulkAction:', e.message);
        return { success: false, error: e.message };
    }
}

export async function purgeGeneralQueueBeforeDateAction(
    cutoffDate: string,
    user: string
): Promise<{ success: boolean; count: number; error?: string }> {
    await authorizeAction('deliveries:admin');
    const db = await getDb();
    try {
        const todayStr = new Date().toISOString();
        const transaction = db.transaction(() => {
            const row = db.prepare(`
                SELECT COUNT(*) as count 
                FROM ops_delivery_queue 
                WHERE entregado = 0 AND asignacion_id IS NULL AND fecha_registro < ?
            `).get(cutoffDate) as { count: number };
            
            const count = row?.count || 0;

            db.prepare(`
                UPDATE ops_delivery_queue
                SET entregado = 1, estado = 'completo', gestionado_por = ?, fecha_entrega = ?, canal_registro = 'web'
                WHERE entregado = 0 AND asignacion_id IS NULL AND fecha_registro < ?
            `).run(user, todayStr, cutoffDate);

            return count;
        });

        const affectedCount = transaction();
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true, count: affectedCount };
    } catch (e: any) {
        logError('Error in purgeGeneralQueueBeforeDateAction:', e.message);
        return { success: false, count: 0, error: e.message };
    }
}

export async function getTelegramDeliveryBotLogsAction(dateString?: string): Promise<any[]> {
    try {
        const db = await getDb();
        
        // Use provided date string or default to local date in Costa Rica timezone (UTC-6)
        const targetDate = dateString || await getBusinessDateStr();

        const rows = db.prepare(`
            SELECT l.*, v.plate as vehiclePlate FROM fleet_telegram_bot_logs l
            LEFT JOIN fleet_vehicles v ON l.vehicleId = v.id
            WHERE (l.actionType = 'delivery' OR l.actionType = 'rtv')
              AND date(l.timestamp, '-6 hours') = ?
            ORDER BY l.timestamp DESC
        `).all(targetDate) as any[];

        // Resolve coordinates dynamically by extracting from details or document number
        for (const log of rows) {
            if (log.actionType === 'delivery') {
                if (log.details) {
                    try {
                        const det = JSON.parse(log.details);
                        if (det && typeof det === 'object' && det.lat !== undefined && det.lng !== undefined) {
                            log.latitud = det.lat;
                            log.longitud = det.lng;
                        }
                    } catch (e) {
                        // ignore JSON error
                    }
                }
                
                if (!log.latitud || !log.longitud) {
                    const match = log.message.match(/#([A-Za-z0-9-]+)/);
                    if (match && match[1]) {
                        const docNum = match[1];
                        const docRow = db.prepare("SELECT latitud, longitud FROM ops_delivery_queue WHERE documento_numero = ? OR documento_numero = ? LIMIT 1").get(docNum, docNum + '-PARTIAL') as { latitud: number | null, longitud: number | null } | undefined;
                        if (docRow && docRow.latitud && docRow.longitud) {
                            log.latitud = docRow.latitud;
                            log.longitud = docRow.longitud;
                        }
                    }
                }
            }
        }

        return JSON.parse(JSON.stringify(rows));
    } catch (error: any) {
        console.error("Error fetching Telegram delivery bot logs:", error);
        return [];
    }
}

/**
 * Consulta la bitácora de eventos y diagnósticos enviados por la aplicación móvil Clic Driver APK.
 * Filtra el ruido técnico para la vista operativa de supervisores de ruta.
 */
export async function getApkDriverLogsAction(dateString?: string): Promise<any[]> {
    try {
        const db = await getDb();
        const targetDate = dateString || await getBusinessDateStr();

        db.prepare(`
            CREATE TABLE IF NOT EXISTS ops_driver_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                user_name TEXT,
                chofer_nombre TEXT,
                chofer_telefono TEXT,
                ruta_nombre TEXT,
                placa_vehiculo TEXT,
                level TEXT NOT NULL,
                category TEXT DEFAULT 'operativo',
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        `).run();

        const rows = db.prepare(`
            SELECT * FROM ops_driver_logs
            WHERE (date(timestamp, '-6 hours') = ? OR date(timestamp) = ?)
              AND message NOT LIKE 'GET http%'
              AND message NOT LIKE 'Diagnóstico%'
              AND message NOT LIKE 'CHECKLIST CONFIGURACIÓN%'
              AND message NOT LIKE '1. Empresa Cliente%'
              AND message NOT LIKE '2. PIN Admin%'
              AND message NOT LIKE '3. Modo Kiosco%'
              AND message NOT LIKE '4. Guardián GPS%'
              AND message NOT LIKE '5. Tamaño Papel%'
              AND message NOT LIKE '6. Apps Autorizadas%'
              AND message NOT LIKE 'Iniciando diagnóstico%'
              AND message NOT LIKE '🔒 Verificación de Permisos%'
              AND message NOT LIKE '🔍 Consultando actualización%'
              AND message NOT LIKE '✅ Aplicación al día%'
              AND message NOT LIKE '✅ OTA RESPUESTA%'
              AND message NOT LIKE '🚀 BackgroundSyncService%'
              AND message NOT LIKE '🟢 BackgroundSyncService%'
              AND message NOT LIKE '👑 Políticas MDM%'
              AND message NOT LIKE '👑 ESTADO DEVICE OWNER%'
              AND message NOT LIKE '🔒 VERIFICACIÓN DE MODO KIOSCO%'
              AND message NOT LIKE '🔓 MODO KIOSCO NATIVO%'
              AND message NOT LIKE '🔄 Sync automático completado (intervalo 5 min, 0 entregas%'
            ORDER BY timestamp DESC
        `).all(targetDate, targetDate) as any[];

        return JSON.parse(JSON.stringify(rows));
    } catch (error: any) {
        console.error("Error fetching APK driver logs:", error);
        return [];
    }
}

export async function getDeliveryGPSData(dateString?: string): Promise<{
    activeTrucks: any[];
    gpsPaths: Record<number, any[]>;
    deliveryMarkers: any[];
}> {
    try {
        const db = await getDb();
        const dateStr = dateString || await getBusinessDateStr();

        // 1. Fetch active assignments and their last known location
        const activeTrucks = db.prepare(`
            SELECT 
                a.id as asignacion_id,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                a.siguiente_cliente,
                a.siguiente_cliente_fecha,
                g.latitud,
                g.longitud,
                g.timestamp
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            JOIN core_users u ON a.empleado_id = u.id
            LEFT JOIN (
                SELECT asignacion_id, latitud, longitud, timestamp
                FROM ops_delivery_gps_logs
                WHERE id IN (
                    SELECT MAX(id) 
                    FROM ops_delivery_gps_logs 
                    GROUP BY asignacion_id
                )
            ) g ON a.id = g.asignacion_id
            WHERE a.fecha = ?
        `).all(dateStr) as any[];

        // 2. Fetch full path history for active assignments
        const gpsLogs = db.prepare(`
            SELECT asignacion_id, latitud, longitud, timestamp
            FROM ops_delivery_gps_logs
            WHERE asignacion_id IN (
                SELECT id FROM ops_delivery_assignments WHERE fecha = ?
            )
            ORDER BY timestamp ASC
        `).all(dateStr) as any[];

        const gpsPaths: Record<number, any[]> = {};
        for (const log of gpsLogs) {
            if (!gpsPaths[log.asignacion_id]) {
                gpsPaths[log.asignacion_id] = [];
            }
            gpsPaths[log.asignacion_id].push({
                latitud: log.latitud,
                longitud: log.longitud,
                timestamp: log.timestamp
            });
        }

        // 3. Fetch completed or attempted deliveries today (including those without coordinates for real counts/KPIs)
        const deliveryMarkers = db.prepare(`
            SELECT 
                q.id,
                q.documento_numero,
                q.tipo_documento,
                q.cliente_nombre,
                q.estado,
                q.latitud,
                q.longitud,
                q.fecha_entrega,
                q.gestionado_por,
                r.name as ruta_nombre,
                h.EMBARCAR_A as embarcar_a,
                u.name as chofer_nombre
            FROM ops_delivery_queue q
            LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id
            LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
            LEFT JOIN core_users u ON a.empleado_id = u.id
            LEFT JOIN core_erp_invoice_headers h ON q.documento_numero = h.FACTURA
            WHERE (q.fecha_registro = ? OR (a.fecha = ? AND a.id IS NOT NULL))
        `).all(dateStr, dateStr) as any[];

        const result = {
            activeTrucks,
            gpsPaths,
            deliveryMarkers
        };
        return JSON.parse(JSON.stringify(result));
    } catch (error: any) {
        console.error("Error in getDeliveryGPSData:", error);
        return {
            activeTrucks: [],
            gpsPaths: {},
            deliveryMarkers: []
        };
    }
}

// --- System Users List ---
export async function getSystemUsers(): Promise<{ id: number; name: string; email: string; phone: string }[]> {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT id, name, email, phone FROM core_users WHERE is_active IS NOT 0 ORDER BY name').all() as any[];
        return JSON.parse(JSON.stringify(rows));
    } catch (e: any) {
        logError('Error fetching system users:', e.message);
        return [];
    }
}

// --- Create Collect Request Action ---
export async function createCollectRequestAction(
    supplierName: string,
    formData: {
        supplier_id?: string;
        orden_compra?: string;
        factura?: string;
        metodo_pago: 'pagar_al_retirar' | 'ya_esta_pago' | 'credito';
        proveedor_contacto_nombre: string;
        proveedor_contacto_telefono: string;
        solicitante_usuario_id: number;
        solicitante_nombre: string;
        solicitante_email: string;
        solicitante_telefono: string;
        en_nombre_de_companero: boolean;
        companero_usuario_id?: number | null;
        companero_nombre?: string | null;
        companero_email?: string | null;
        companero_telefono?: string | null;
        horario_proveedor: string;
        lugar_entrega: string;
        detalle_adicional?: string;
        provincia_nombre?: string;
        canton_nombre?: string;
        distrito_nombre?: string;
        direccion_detalle?: string;
    },
    lines?: { codigo?: string; descripcion: string; cantidad: number; unidad?: string }[]
): Promise<{ success: boolean; consecutive?: string; error?: string }> {
    await authorizeAction('deliveries:collect');
    const db = await getDb();
    try {
        const localTodayStr = await getBusinessDateStr();
        
        // Transaction to safely generate consecutive, queue doc, lines, and update supplier address
        const consecutive = db.transaction(() => {
            const prefixRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'collect_consecutive_prefix'").get() as { value: string } | undefined;
            const nextRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'collect_consecutive_next'").get() as { value: string } | undefined;
            
            const prefix = prefixRow?.value || 'REC-';
            const nextVal = parseInt(nextRow?.value || '1', 10);
            
            const cons = `${prefix}${String(nextVal).padStart(6, '0')}`;
            
            db.prepare("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('collect_consecutive_next', ?)").run(String(nextVal + 1));
            
            const notes = JSON.stringify(formData);
            const suppId = formData.supplier_id || 'PROV_MANUAL';
            
            const res = db.prepare(`
                INSERT INTO ops_delivery_queue (
                    documento_numero,
                    tipo_documento,
                    cliente_id,
                    cliente_nombre,
                    creado_por,
                    fecha_registro,
                    estado,
                    entregado,
                    comentario
                ) VALUES (?, 'recoger', ?, ?, ?, ?, 'pendiente', 0, ?)
            `).run(
                cons,
                suppId,
                supplierName,
                formData.solicitante_nombre,
                localTodayStr,
                notes
            );

            const docId = res.lastInsertRowid;

            // Insert itemized product lines into ops_delivery_lines
            if (lines && lines.length > 0) {
                const insertLine = db.prepare(`
                    INSERT INTO ops_delivery_lines (
                        delivery_order_id,
                        producto_codigo,
                        producto_descripcion,
                        cantidad_pedida,
                        cantidad_entregada,
                        cantidad_faltante
                    ) VALUES (?, ?, ?, ?, 0, ?)
                `);
                for (const l of lines) {
                    const code = l.codigo || 'ART';
                    const desc = l.unidad ? `${l.descripcion} (${l.unidad})` : l.descripcion;
                    const qty = Number(l.cantidad) || 1;
                    insertLine.run(docId, code, desc, qty, qty);
                }
            }

            // Auto-learn / update supplier address in core_suppliers if blank
            const fullAddress = [
                formData.provincia_nombre,
                formData.canton_nombre,
                formData.distrito_nombre,
                formData.direccion_detalle || formData.lugar_entrega
            ].filter(Boolean).join(', ');

            if (fullAddress.trim().length > 0) {
                try {
                    const suppRow = db.prepare('SELECT id, address FROM core_suppliers WHERE id = ? OR LOWER(name) = LOWER(?)').get(suppId, supplierName) as { id: string; address: string | null } | undefined;
                    if (suppRow && (!suppRow.address || suppRow.address.trim() === '')) {
                        db.prepare('UPDATE core_suppliers SET address = ? WHERE id = ?').run(fullAddress.trim(), suppRow.id);
                    }
                } catch (_) {}
            }

            return cons;
        })();

        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true, consecutive };
    } catch (e: any) {
        logError('Error creating collect request:', e.message);
        return { success: false, error: e.message };
    }
}

// --- Trigger Collect Assigned Email ---
export async function triggerCollectAssignedEmail(id: number): Promise<void> {
    const db = await getDb();
    try {
        const doc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(id) as any;
        if (!doc || doc.tipo_documento !== 'recoger') return;

        let details: any = {};
        try {
            const parsed = JSON.parse(doc.comentario);
            if (parsed && typeof parsed === 'object') details = parsed;
        } catch (e: any) {
            logError('Error parsing collect comments JSON:', e.message);
            return;
        }

        const assignment = db.prepare(`
            SELECT a.fecha, u.name as chofer_nombre, v.plate as vehiculo_placa, r.name as ruta_nombre
            FROM ops_delivery_assignments a
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            WHERE a.id = ?
        `).get(doc.asignacion_id) as any;

        const cleanPhone = ((details?.proveedor_contacto_telefono) ?? (details?.provider_contact_telefono) ?? '').replace(/\D/g, '');
        const whatsappPhone = cleanPhone.length === 8 ? '506' + cleanPhone : cleanPhone;
        const whatsappLink = `https://wa.me/${whatsappPhone}`;
        const metodoPagoLabel = details.metodo_pago === 'pagar_al_retirar' ? 'Pagar al retirar' : details.metodo_pago === 'ya_esta_pago' ? 'Ya está pago' : 'Crédito';

        const template = db.prepare("SELECT subject, body FROM notification_templates WHERE eventId = 'onCollectAssigned'").get() as { subject: string; body: string } | undefined;

        let emailSubject = `📦 Recolecta Asignada a Ruta - Consecutivo #${doc.documento_numero}`;
        let emailHtml = '';

        const solicitanteNombreCompleto = details.en_nombre_de_companero ? details.companero_nombre : details.solicitante_nombre;
        const choferNombre = assignment?.chofer_nombre || 'N/D';
        const rutaNombre = assignment?.ruta_nombre || 'N/D';
        const vehiculoPlaca = assignment?.vehiculo_placa || 'N/D';

        if (template) {
            emailSubject = template.subject
                .replace(/{{consecutivo}}/g, doc.documento_numero)
                .replace(/{{proveedor}}/g, doc.cliente_nombre);

            emailHtml = template.body
                .replace(/{{consecutivo}}/g, doc.documento_numero)
                .replace(/{{proveedor}}/g, doc.cliente_nombre)
                .replace(/{{ordenCompra}}/g, details.orden_compra || 'N/D')
                .replace(/{{factura}}/g, details.factura || 'N/D')
                .replace(/{{solicitanteNombre}}/g, solicitanteNombreCompleto)
                .replace(/{{choferNombre}}/g, choferNombre)
                .replace(/{{rutaNombre}}/g, rutaNombre)
                .replace(/{{vehiculoPlaca}}/g, vehiculoPlaca)
                .replace(/{{lugarEntrega}}/g, details.lugar_entrega || 'N/D')
                .replace(/{{metodoPago}}/g, metodoPagoLabel)
                .replace(/{{horarioProveedor}}/g, details.horario_proveedor || 'N/D')
                .replace(/{{contactoNombre}}/g, details.proveedor_contacto_nombre ?? details.provider_contact_name ?? 'N/D')
                .replace(/{{contactoTelefono}}/g, details.proveedor_contacto_telefono ?? details.provider_contact_telefono ?? 'N/D')
                .replace(/{{whatsappLink}}/g, whatsappLink);
        } else {
            emailHtml = `
                <h2>La solicitud de recolecta #${doc.documento_numero} ha sido asignada</h2>
                <p>Estimado(a) ${solicitanteNombreCompleto},</p>
                <p>Su solicitud para recolectar del proveedor <strong>${doc.cliente_nombre}</strong> ha sido asignada a la ruta del día de hoy.</p>
                <ul>
                    <li><strong>Chofer:</strong> ${choferNombre}</li>
                    <li><strong>Ruta:</strong> ${rutaNombre}</li>
                    <li><strong>Vehículo Placa:</strong> ${vehiculoPlaca}</li>
                    <li><strong>Orden de Compra:</strong> ${details.orden_compra || 'N/D'}</li>
                    <li><strong>Factura:</strong> ${details.factura || 'N/D'}</li>
                    <li><strong>Método de Pago:</strong> ${metodoPagoLabel}</li>
                    <li><strong>Contacto:</strong> ${details.proveedor_contacto_nombre || 'N/D'} (${details.proveedor_contacto_telefono || 'N/D'})</li>
                    <li><strong>WhatsApp:</strong> <a href="${whatsappLink}">Abrir Chat</a></li>
                </ul>
            `;
        }

        const recipientEmail = details.en_nombre_de_companero ? details.companero_email : details.solicitante_email;
        if (recipientEmail) {
            logInfo(`Sending collect assigned notification email to ${recipientEmail}`);
            await sendEmail({
                to: recipientEmail,
                subject: emailSubject,
                html: emailHtml
            });
        }
    } catch (e: any) {
        logError('Error triggering collect assigned email:', e.message);
    }
}

// --- Trigger Collect Update Email ---
export async function triggerCollectUpdateEmail(id: number, estado: string, comentarioChofer?: string): Promise<void> {
    const db = await getDb();
    try {
        const doc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(id) as any;
        if (!doc || doc.tipo_documento !== 'recoger') return;

        let details: any = {};
        try {
            const parsed = JSON.parse(doc.comentario);
            if (parsed && typeof parsed === 'object') details = parsed;
        } catch (e: any) {
            logError('Error parsing collect comments JSON:', e.message);
            return;
        }

        const assignment = db.prepare(`
            SELECT a.fecha, u.name as chofer_nombre, v.plate as vehiculo_placa, r.name as ruta_nombre
            FROM ops_delivery_assignments a
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            WHERE a.id = ?`).get(id) as any;
        const cleanPhone = (details.proveedor_contacto_telefono || '').replace(/\D/g, '');
        const whatsappPhone = cleanPhone.length === 8 ? '506' + cleanPhone : cleanPhone;
        const whatsappLink = `https://wa.me/${whatsappPhone}`;
        const metodoPagoLabel = details.metodo_pago === 'pagar_al_retirar' ? 'Pagar al retirar' : details.metodo_pago === 'ya_esta_pago' ? 'Ya está pago' : 'Crédito';
        const estadoLabel = estado === 'completo' ? 'Recogido / Retirado 👍' : 'No se pudo Recoger ❌';
        const template = db.prepare("SELECT subject, body FROM notification_templates WHERE eventId = 'onCollectUpdate'").get() as { subject: string; body: string } | undefined;

        let emailSubject = `📦 Recolecta ${estado === 'completo' ? 'Completada' : 'No Lograda'} - Consecutivo #${doc.documento_numero}`;
        let emailHtml = '';

        const solicitanteNombreCompleto = details.en_nombre_de_companero ? details.companero_nombre : details.solicitante_nombre;
        const choferNombre = assignment?.chofer_nombre || 'N/D';

        if (template) {
            emailSubject = template.subject
                .replace(/{{consecutivo}}/g, doc.documento_numero)
                .replace(/{{proveedor}}/g, doc.cliente_nombre)
                .replace(/{{estadoLabel}}/g, estadoLabel);

            emailHtml = template.body
                .replace(/{{consecutivo}}/g, doc.documento_numero)
                .replace(/{{proveedor}}/g, doc.cliente_nombre)
                .replace(/{{ordenCompra}}/g, details.orden_compra || 'N/D')
                .replace(/{{factura}}/g, details.factura || 'N/D')
                .replace(/{{solicitanteNombre}}/g, solicitanteNombreCompleto)
                .replace(/{{choferNombre}}/g, choferNombre)
                .replace(/{{rutaNombre}}/g, assignment?.ruta_nombre || 'N/D')
                .replace(/{{vehiculoPlaca}}/g, assignment?.vehiculo_placa || 'N/D')
                .replace(/{{lugarEntrega}}/g, details.lugar_entrega || 'N/D')
                .replace(/{{metodoPago}}/g, metodoPagoLabel)
                .replace(/{{horarioProveedor}}/g, details.horario_proveedor || 'N/D')
                .replace(/{{contactoNombre}}/g, details.proveedor_contacto_nombre ?? details.provider_contact_name ?? 'N/D')
                .replace(/{{contactoTelefono}}/g, details.proveedor_contacto_telefono ?? details.provider_contact_telefono ?? 'N/D')
                .replace(/{{whatsappLink}}/g, whatsappLink)
                .replace(/{{estadoLabel}}/g, estadoLabel)
                .replace(/{{comentarioChofer}}/g, comentarioChofer || 'Ninguno');
        } else {
            emailHtml = `
                <h2>Resultado de Recolecta del Proveedor: ${estadoLabel}</h2>
                <p>Estimado(a) ${solicitanteNombreCompleto},</p>
                <p>Le informamos sobre el resultado de su solicitud consecutivo <strong>#${doc.documento_numero}</strong> para el proveedor <strong>${doc.cliente_nombre}</strong>.</p>
                <ul>
                    <li><strong>Estado:</strong> ${estadoLabel}</li>
                    <li><strong>Chofer:</strong> ${choferNombre}</li>
                    <li><strong>Comentario Chofer:</strong> ${comentarioChofer || 'Ninguno'}</li>
                    <li><strong>Orden de Compra:</strong> ${details.orden_compra || 'N/D'}</li>
                    <li><strong>Factura:</strong> ${details.factura || 'N/D'}</li>
                </ul>
            `;
        }

        const recipientEmail = details.en_nombre_de_companero ? details.companero_email : details.solicitante_email;
        if (recipientEmail) {
            logInfo(`Sending collect update notification email to ${recipientEmail}`);
            await sendEmail({
                to: recipientEmail,
                subject: emailSubject,
                html: emailHtml
            });
        }

        // --- Telegram Notification Dispatch to Collect Request Creator ---
        try {
            let targetTelegramUserId: number | undefined;

            if (details.en_nombre_de_companero && details.companero_email) {
                const compUser = db.prepare('SELECT id FROM core_users WHERE LOWER(email) = LOWER(?)').get(details.companero_email) as { id: number } | undefined;
                if (compUser) targetTelegramUserId = compUser.id;
            }

            if (!targetTelegramUserId && (recipientEmail || doc.creado_por)) {
                const solUser = db.prepare('SELECT id FROM core_users WHERE LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?)').get(recipientEmail || '', doc.creado_por || '') as { id: number } | undefined;
                if (solUser) targetTelegramUserId = solUser.id;
            }

            if (targetTelegramUserId) {
                const { getTelegramChatIdForUser } = await import('@/modules/notifications/lib/telegram-lookup');
                const chatId = await getTelegramChatIdForUser({ userId: targetTelegramUserId });

                if (chatId) {
                    const { sendTelegramMessage } = await import('@/modules/notifications/lib/telegram-service');
                    const icon = estado === 'completo' ? '✅' : '❌';
                    const telegramMsg = `
<b>${icon} Actualización de Solicitud de Recolecta #${doc.documento_numero}</b>

<b>Estado:</b> ${estadoLabel}
<b>Proveedor:</b> ${doc.cliente_nombre}
${details.orden_compra ? `<b>Orden de Compra:</b> ${details.orden_compra}\n` : ''}${details.factura ? `<b>Factura:</b> ${details.factura}\n` : ''}<b>Chofer:</b> ${choferNombre}
${comentarioChofer ? `<b>Nota del Chofer:</b> <i>"${comentarioChofer}"</i>\n` : ''}<b>Lugar Entrega:</b> ${details.lugar_entrega || 'N/D'}
`.trim();

                    await sendTelegramMessage(telegramMsg, chatId);
                    logInfo(`Telegram notification sent for collect update #${doc.documento_numero} to Chat ID: ${chatId}`);
                }
            }
        } catch (tgErr: any) {
            logError('Error dispatching Telegram notification for collect update:', tgErr.message);
        }
    } catch (e: any) {
        logError('Error triggering collect update email:', e.message);
    }
}

// --- Client Emails & Document Discarding Actions ---

import { CORE_TABLE_NAMES } from '@/modules/core/lib/schema';

export async function getClientEmailConfig(clienteId: string): Promise<{ emails: string[]; notificarLlegada: boolean }> {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT email, notificar_llegada FROM ops_client_emails WHERE cliente_id = ? ORDER BY created_at DESC').all(clienteId) as { email: string; notificar_llegada: number }[];
        const emails = rows.map(r => r.email);
        const notificarLlegada = rows.length > 0 ? Boolean(rows[0].notificar_llegada ?? 1) : true;
        return { emails, notificarLlegada };
    } catch (e: any) {
        logError('Error getting client email config:', e.message);
        return { emails: [], notificarLlegada: true };
    }
}

export async function getClientEmails(clienteId: string): Promise<string[]> {
    const config = await getClientEmailConfig(clienteId);
    return config.emails;
}

export async function saveClientEmail(clienteId: string, email: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    try {
        db.prepare('INSERT OR REPLACE INTO ops_client_emails (cliente_id, email) VALUES (?, ?)').run(clienteId, email.trim().toLowerCase());
        return { success: true };
    } catch (e: any) {
        logError('Error saving client email:', e.message);
        return { success: false, error: e.message };
    }
}

export async function setClientArrivalNotification(clienteId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    try {
        db.prepare('UPDATE ops_client_emails SET notificar_llegada = ? WHERE cliente_id = ?').run(enabled ? 1 : 0, clienteId);
        logInfo(`Notificación de llegada a bodega para cliente ${clienteId} establecida a: ${enabled}`);
        return { success: true };
    } catch (e: any) {
        logError('Error setting client arrival notification preference:', e.message);
        return { success: false, error: e.message };
    }
}

export async function discardQueueDocument(docId: number, docNum: string, reason: string): Promise<{ success: boolean; error?: string }> {
    const user = await authorizeAction('deliveries:write');
    const db = await getDb();
    try {
        db.transaction(() => {
            // Mark as delivered/resolved
            db.prepare("UPDATE ops_delivery_queue SET entregado = 1, estado = 'descartado' WHERE id = ?").run(docId);
            // Insert discard audit
            db.prepare('INSERT INTO ops_delivery_discards (documento_numero, motivo_descarte, usuario_descarte) VALUES (?, ?, ?)')
                .run(docNum, reason.trim(), user.name);
        })();
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error discarding queue document:', e.message);
        return { success: false, error: e.message };
    }
}

export async function sendBoletaManualEmail(docId: number, targetEmail: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    try {
        const doc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(docId) as any;
        if (!doc) {
            return { success: false, error: 'Documento no encontrado' };
        }

        // Get matching template
        const eventId = doc.tipo_documento === 'recoger' || doc.estado === 'rechazado' ? 'onDeliveryRetry' : 'onDeliveryPartial';
        const template = db.prepare(`SELECT subject, body FROM ${CORE_TABLE_NAMES.notificationTemplates} WHERE eventId = ?`).get(eventId) as { subject: string; body: string } | undefined;
        if (!template) {
            return { success: false, error: `Plantilla de correo '${eventId}' no encontrada.` };
        }

        // Get preview HTML which handles variable parsing, JSON comments, and styles/labels mapping for collect documents
        const previewRes = await getBoletaPreviewHtml(docId);
        if (!previewRes.success || !previewRes.html) {
            return { success: false, error: previewRes.error || 'No se pudo generar la boleta.' };
        }
        const body = previewRes.html;

        // Render subject
        let subject = template.subject;
        if (doc.tipo_documento === 'recoger') {
            subject = `📦 Solicitud de Recolecta a Proveedor: Documento ${doc.documento_numero.replace('-RETRY', '').replace('-PARTIAL', '')}`;
        } else {
            // Retrieve route info if assigned
            let routeName = 'Sin Asignar';
            let driverName = 'Sin Asignar';
            let driverId = 'N/D';
            if (doc.asignacion_id) {
                const assignment = db.prepare(`
                    SELECT a.id, r.name as ruta_nombre, u.name as chofer_nombre, u.id as chofer_id
                    FROM ops_delivery_assignments a
                    JOIN ops_delivery_routes r ON a.ruta_id = r.id
                    JOIN core_users u ON a.empleado_id = u.id
                    WHERE a.id = ?
                `).get(doc.asignacion_id) as any;
                if (assignment) {
                    routeName = assignment.ruta_nombre;
                    driverName = assignment.chofer_nombre;
                    driverId = String(assignment.chofer_id);
                }
            }

            const dateStr = new Date(doc.created_at || Date.now()).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
            const dataPayload: Record<string, string> = {
                documento_numero: doc.documento_numero.replace('-RETRY', '').replace('-PARTIAL', ''),
                cliente_nombre: doc.cliente_nombre || 'N/D',
                cliente_id: doc.cliente_id || 'N/D',
                lugar_entrega: doc.lugar_entrega || 'N/D',
                fecha: dateStr,
                ruta_nombre: routeName,
                chofer_nombre: driverName,
                chofer_id: driverId
            };

            for (const [k, v] of Object.entries(dataPayload)) {
                const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
                subject = subject.replace(re, v);
            }
        }

        // Split emails if multiple
        const recipients = targetEmail.split(/[,;]/).map(em => em.trim()).filter(Boolean);
        if (recipients.length === 0) {
            return { success: false, error: 'Dirección de correo inválida.' };
        }

        await sendEmail({
            to: recipients,
            subject: subject,
            html: body
        });

        return { success: true };
    } catch (e: any) {
        logError('Error sending manual boleta email:', e.message);
        return { success: false, error: e.message };
    }
}

export async function getBoletaPreviewHtml(docId: number): Promise<{ success: boolean; html?: string; error?: string }> {
    const db = await getDb();
    try {
        const doc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(docId) as any;
        if (!doc) return { success: false, error: 'Documento no encontrado' };

        const eventId = doc.tipo_documento === 'recoger' || doc.estado === 'rechazado' ? 'onDeliveryRetry' : 'onDeliveryPartial';
        const template = db.prepare(`SELECT body FROM ${CORE_TABLE_NAMES.notificationTemplates} WHERE eventId = ?`).get(eventId) as { body: string } | undefined;
        if (!template) return { success: false, error: `Plantilla de correo '${eventId}' no encontrada.` };

        let parsedDetails: any = {};
        try {
            if (doc.comentario) {
                const parsed = JSON.parse(doc.comentario);
                if (parsed && typeof parsed === 'object') {
                    parsedDetails = parsed;
                }
            }
        } catch(e) {}

        let routeName = 'Sin Asignar (Pendiente en Cola)';
        let driverName = '_______________________';
        let driverId = 'N/D';
        
        // Si el documento está pendiente en cola o re-inyectado sin chofer asignado actualmente, no mostrar chofer anterior
        const targetAssignmentId = doc.entregado === 1 ? (doc.asignacion_id || doc.devolucion_asignacion_id) : doc.asignacion_id;
        if (targetAssignmentId) {
            const assignment = db.prepare(`
                SELECT a.id, r.name as ruta_nombre, u.name as chofer_nombre, u.id as chofer_id
                FROM ops_delivery_assignments a
                JOIN ops_delivery_routes r ON a.ruta_id = r.id
                JOIN core_users u ON a.empleado_id = u.id
                WHERE a.id = ?
            `).get(targetAssignmentId) as any;
            if (assignment) {
                routeName = assignment.ruta_nombre;
                driverName = assignment.chofer_nombre;
                driverId = String(assignment.chofer_id);
            }
        }

        const dateStr = new Date(doc.created_at || Date.now()).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
        
        let formattedMotivo = doc.comentario || 'Ninguno';
        
        // Query delivery lines if present (checking both original doc id or original source doc if re-injected)
        const docLines = db.prepare('SELECT producto_codigo as codigo, producto_descripcion as desc, cantidad_pedida as pedida, cantidad_entregada as entregada, cantidad_faltante as faltante FROM ops_delivery_lines WHERE delivery_order_id = ?').all(doc.id) as any[];

        if (docLines && docLines.length > 0) {
            let linesRowsHtml = docLines.map(l => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px; font-family: monospace; font-weight: bold; color: #1e293b;">${l.codigo}</td>
                    <td style="padding: 6px; color: #334155;">${l.desc}</td>
                    <td style="padding: 6px; text-align: center; color: #64748b;">${l.pedida}</td>
                    <td style="padding: 6px; text-align: center; font-weight: bold; color: #16a34a;">${l.entregada}</td>
                    <td style="padding: 6px; text-align: center; font-weight: bold; color: #dc2626;">${l.faltante}</td>
                </tr>
            `).join('');

            formattedMotivo = `
                <div style="margin-bottom: 12px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; background-color: #ffffff;">
                        <thead>
                            <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                                <th style="padding: 6px; text-align: left; color: #475569;">Código</th>
                                <th style="padding: 6px; text-align: left; color: #475569;">Descripción</th>
                                <th style="padding: 6px; text-align: center; color: #475569;">Pedida</th>
                                <th style="padding: 6px; text-align: center; color: #475569;">Entregada</th>
                                <th style="padding: 6px; text-align: center; color: #475569;">Faltante</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${linesRowsHtml}
                        </tbody>
                    </table>
                </div>
                ${doc.comentario ? `<div style="font-size: 12px; color: #475569;"><strong>Observaciones del Chofer:</strong> ${doc.comentario}</div>` : ''}
            `;
        } else if (doc.tipo_documento === 'recoger' && Object.keys(parsedDetails).length > 0) {
            formattedMotivo = `
<table style="width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.6; font-family: sans-serif;">
  <tr><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; font-weight: bold; width: 30%; color: #4b5563;">Orden de Compra:</td><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #111827; font-weight: 600;">${parsedDetails.orden_compra || 'N/D'}</td></tr>
  <tr><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #4b5563;">Factura:</td><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #111827; font-weight: 600;">${parsedDetails.factura || 'N/D'}</td></tr>
  <tr><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #4b5563;">Método de Pago:</td><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #111827; font-weight: 600; text-transform: uppercase;">${parsedDetails.metodo_pago === 'pagar_al_retirar' ? 'Pagar al Retirar' : parsedDetails.metodo_pago === 'ya_esta_pago' ? 'Ya está Pago' : parsedDetails.metodo_pago === 'credito' ? 'Crédito' : parsedDetails.metodo_pago || 'N/D'}</td></tr>
  <tr><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #4b5563;">Contacto Proveedor:</td><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #111827;">${parsedDetails.proveedor_contacto_nombre || 'N/D'} (${parsedDetails.proveedor_contacto_telefono || 'N/D'})</td></tr>
  <tr><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #4b5563;">Solicitante:</td><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #111827;">${parsedDetails.solicitante_nombre || 'N/D'} (${parsedDetails.solicitante_email || 'N/D'})</td></tr>
  ${parsedDetails.en_nombre_de_companero ? `<tr><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #4b5563;">A Nombre de:</td><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #111827;">${parsedDetails.companero_nombre || 'N/D'} (${parsedDetails.companero_email || 'N/D'})</td></tr>` : ''}
  <tr><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #4b5563;">Horario Proveedor:</td><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #111827;">${parsedDetails.horario_proveedor || 'N/D'}</td></tr>
  <tr><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #4b5563;">Lugar de Entrega:</td><td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #111827;">${parsedDetails.lugar_entrega || 'N/D'}</td></tr>
  <tr><td style="padding: 6px; font-weight: bold; vertical-align: top; color: #4b5563;">Detalle Adicional:</td><td style="padding: 6px; white-space: pre-wrap; color: #111827; background-color: #f8fafc; border-radius: 4px; border: 1px solid #e2e8f0;">${parsedDetails.detalle_adicional || 'Ninguno'}</td></tr>
</table>
            `;
        }

        const dataPayload: Record<string, string> = {
            documento_numero: doc.documento_numero.replace('-RETRY', '').replace('-PARTIAL', ''),
            cliente_nombre: doc.cliente_nombre || 'N/D',
            cliente_id: doc.cliente_id || 'N/D',
            lugar_entrega: doc.lugar_entrega || 'N/D',
            contacto_nombre: parsedDetails.proveedor_contacto_nombre || parsedDetails.contacto_nombre || doc.cliente_nombre || 'N/D',
            contacto_telefono: parsedDetails.proveedor_contacto_telefono || parsedDetails.contacto_telefono || 'N/D',
            fecha: dateStr,
            ruta_nombre: routeName,
            chofer_nombre: driverName,
            chofer_id: driverId,
            motivo_devolucion: formattedMotivo,
            motivo_incompleto: formattedMotivo
        };

        let body = template.body;

        if (doc.tipo_documento === 'recoger') {
            body = body
                .replace(/DEVOLUCIÓN DE ENTREGA/g, 'SOLICITUD DE RECOLECTA A PROVEEDOR')
                .replace(/MERCANCÍA DEVUELTA AL TALLER \/ BODEGA/g, 'ORDEN DE RETIRO DE MERCANCÍA')
                .replace(/Fecha Devolución:/g, 'Fecha Solicitud:')
                .replace(/Detalle y Motivo de la Devolución/g, 'Detalles de la Recolecta')
                .replace(/Motivo Reportado por el Conductor/g, 'Detalle de la Orden de Retiro')
                .replace(/Este documento registra el retorno físico de la mercancía correspondiente al pedido a nuestras bodegas de origen\. Se procederá con la anulación del despacho y\/o la generación de la nota de crédito respectiva según políticas vigentes\./g, 'Este documento autoriza al transportista asignado a retirar la mercancía del proveedor detallado para su posterior entrega en el punto de destino indicado.')
                .replace(/Firma de Devolución del Cliente/g, 'Firma del Proveedor (Despacha)')
                .replace(/Recibido en Bodega \/ Chofer/g, 'Recibido por (Chofer / Transportista)')
                .replace(/#b91c1c/g, '#0284c7')
                .replace(/#fef2f2/g, '#f0f9ff')
                .replace(/#fee2e2/g, '#e0f2fe')
                .replace(/#7f1d1d/g, '#0369a1');
        }

        for (const [k, v] of Object.entries(dataPayload)) {
            const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
            body = body.replace(re, v);
        }

        const { getCompanySettings } = await import('@/modules/core/lib/db');
        const company = await getCompanySettings();
        const companyName = company?.name || 'Industrias Garend S.A';
        const companyAddress = company?.address || 'Alajuela, Poás, Carrillos bajo, del EBAIS 700 oeste.';
        const companyPhone = company?.phone || '+506 2458-4343';
        const companyEmail = company?.email || 'ventas@industriasgarend.com';

        body = body
            .replace(/Clic-Tools Logistics/g, companyName)
            .replace(/San José, Costa Rica/g, companyAddress)
            .replace(/Teléfono: \+506 4000-0000 \| soporte@empresa\.com/g, `Teléfono: ${companyPhone} | ${companyEmail}`)
            .replace(/max-width:\s*600px/g, 'max-width: 800px')
            .replace(/max-width:\s*700px/g, 'max-width: 800px');

        // Inject GPS Google Maps link if available
        let gpsSection = '';
        if (doc.latitud && doc.longitud) {
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${doc.latitud},${doc.longitud}`;
            gpsSection = `
                <div style="margin-top: 15px; padding: 10px 14px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 11.5px; color: #166534; display: flex; align-items: center; justify-content: space-between;">
                    <span>📍 <strong>Ubicación GPS de Confirmación de Entrega:</strong> Lat ${doc.latitud}, Lng ${doc.longitud}</span>
                    <a href="${mapsUrl}" target="_blank" style="display: inline-block; padding: 5px 12px; background-color: #16a34a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 11px;">Abrir en Google Maps ↗</a>
                </div>
            `;
        }

        // Section for 3rd signer: Aprobado por / Supervisión
        const aprobacionBlock = `
            <div style="margin-top: 20px; padding: 16px; border: 1.5px dashed #cbd5e1; background-color: #f8fafc; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #475569;">
                    <tr>
                        <td style="width: 50%; padding-bottom: 35px;"><strong>Aprobado por:</strong> ___________________________</td>
                        <td style="width: 50%; padding-bottom: 35px;"><strong>Firma / Sello de Aprobación:</strong> ___________________________</td>
                    </tr>
                </table>
            </div>
        `;

        // Inject Customer Signature, Receiver Name, Third Signer (Aprobado por) and GPS into HTML template
        let firmaSection = '';
        if (doc.firma_cliente) {
            const signatureUrl = doc.firma_cliente.startsWith('http') || doc.firma_cliente.startsWith('data:') 
                ? doc.firma_cliente 
                : `/api/fleet/files/${doc.firma_cliente}`;
            firmaSection = `
                <div style="margin-top: 20px; padding: 14px; border: 1.5px dashed #cbd5e1; background-color: #f8fafc; border-radius: 8px; text-align: center;">
                    <span style="font-size: 12px; font-weight: 800; color: #334155; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">✍️ Firma Digital del Cliente (Registrada en Pantalla Táctil)</span>
                    <img src="${signatureUrl}" alt="Firma Cliente" style="max-height: 95px; max-width: 320px; display: block; margin: 0 auto; filter: contrast(150%);" />
                    ${doc.nombre_recibe ? `<span style="font-size: 13px; font-weight: bold; color: #0f172a; display: block; margin-top: 8px;">Recibido Por: ${doc.nombre_recibe}</span>` : ''}
                </div>
                ${aprobacionBlock}
                ${gpsSection}
            `;
        } else {
            firmaSection = `
                ${aprobacionBlock}
                ${gpsSection}
            `;
        }

        // Ensure letter-sized wrapper and clean body closing
        if (body.includes('</body>')) {
            body = body.replace('</body>', `${firmaSection}</body>`);
        } else {
            body = `${body}${firmaSection}`;
        }

        if (!body.includes('max-width: 800px')) {
            body = `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 25px; border: 1px solid #cbd5e1; border-radius: 8px; background-color: #ffffff; color: #1e293b; box-sizing: border-box;">${body}</div>`;
        }

        return { success: true, html: body };
    } catch (e: any) {
        logError('Error rendering boleta preview html:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Renders thermal receipt printable HTML for 80mm or 57mm Bluetooth/POS printers.
 */
export async function getBoletaThermalPrintHtml(docId: number): Promise<{ success: boolean; html?: string; error?: string }> {
    const db = await getDb();
    try {
        const doc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(docId) as any;
        if (!doc) return { success: false, error: 'Documento no encontrado' };

        const paperSizeSetting = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'driver_boleta_paper_size'").get() as { value: string } | undefined;
        const paperSize = paperSizeSetting?.value === '57mm' ? '57mm' : '80mm';
        const is57 = paperSize === '57mm';

        let routeName = 'Sin Asignar (Pendiente)';
        let driverName = '_______________________';
        let vehiclePlate = 'N/D';
        
        // Si el documento está pendiente en cola o re-inyectado sin chofer asignado actualmente, no mostrar chofer anterior
        const targetAssignmentId = doc.entregado === 1 ? (doc.asignacion_id || doc.devolucion_asignacion_id) : doc.asignacion_id;
        if (targetAssignmentId) {
            const assignment = db.prepare(`
                SELECT a.id, r.name as ruta_nombre, u.name as chofer_nombre, v.plate as vehiculo_placa
                FROM ops_delivery_assignments a
                JOIN ops_delivery_routes r ON a.ruta_id = r.id
                JOIN core_users u ON a.empleado_id = u.id
                LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
                WHERE a.id = ?
            `).get(targetAssignmentId) as any;
            if (assignment) {
                routeName = assignment.ruta_nombre;
                driverName = assignment.chofer_nombre;
                vehiclePlate = assignment.vehiculo_placa || 'N/D';
            }
        }

        const docLines = db.prepare('SELECT producto_codigo as codigo, producto_descripcion as desc, cantidad_pedida as pedida, cantidad_entregada as entregada, cantidad_faltante as faltante FROM ops_delivery_lines WHERE delivery_order_id = ?').all(doc.id) as any[];

        const dateStr = new Date(doc.created_at || Date.now()).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
        const timeStr = new Date(doc.created_at || Date.now()).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' });

        let statusText = 'COMPLETO';
        if (doc.estado === 'incompleto') statusText = 'INCOMPLETO / PARCIAL';
        if (doc.estado === 'rechazado') statusText = 'RECHAZADO / RETORNO';
        if (doc.tipo_documento === 'recoger') statusText = 'RECOLECTA PROVEEDOR';

        let linesHtml = '';
        if (docLines && docLines.length > 0) {
            linesHtml = docLines.map(l => `
                <tr>
                    <td style="font-weight: bold; width: 22%;">${l.codigo}</td>
                    <td style="width: 42%;">${l.desc}</td>
                    <td style="text-align: right; width: 11%;">${l.pedida}</td>
                    <td style="text-align: right; width: 11%;">${l.entregada}</td>
                    <td style="text-align: right; font-weight: bold; width: 14%; color: #000; white-space: nowrap;">${l.faltante}</td>
                </tr>
            `).join('');
        }

        let signatureUrl = '';
        if (doc.firma_cliente) {
            signatureUrl = doc.firma_cliente.startsWith('http') || doc.firma_cliente.startsWith('data:') 
                ? doc.firma_cliente 
                : `/api/fleet/files/${doc.firma_cliente}`;
        }

        const mapsUrl = (doc.latitud && doc.longitud) ? `https://www.google.com/maps/search/?api=1&query=${doc.latitud},${doc.longitud}` : '';

        const { getCompanySettings } = await import('@/modules/core/lib/db');
        const company = await getCompanySettings();
        const companyName = company?.name || 'Industrias Garend S.A';
        const systemName = company?.systemName || 'Clic-Tools Logistics';

        let rawbtLinesText = '';
        if (docLines && docLines.length > 0) {
            rawbtLinesText = '--------------------------------\nDISCREPANCIAS / FALTANTES\nCod  | Prod             |Ped|Ent|Fal\n--------------------------------\n' + 
            docLines.map(l => `${l.codigo.padEnd(4).substring(0,4)} | ${l.desc.padEnd(16).substring(0,16)} | ${l.pedida.toString().padStart(2)}| ${l.entregada.toString().padStart(2)}| ${l.faltante.toString().padStart(2)}`).join('\n') + '\n--------------------------------\n';
        }

        const firmaStatusText = doc.firma_cliente ? 'Firma: [ FIRMA DIGITAL REGISTRADA TÁCTIL ]' : 'Firma: _________________________';

        const rawbtText = encodeURIComponent(`
${companyName.toUpperCase()}
Cedula Juridica: ${company?.taxId || 'N/D'}
${company?.address || ''}
${company?.phone || ''} | ${company?.email || ''}
Boleta de Entrega (80mm)
................................
Boleta: #${doc.boleta_numero || doc.documento_numero}
Doc ERP: #${doc.documento_numero}
Estado: [ ${statusText} ]
Fecha: ${dateStr} ${timeStr}
Ruta: ${routeName}
Camion: ${vehiclePlate}
Chofer: ${driverName}
--------------------------------
CLIENTE:
${doc.cliente_nombre} (${doc.cliente_id || 'N/D'})
${doc.lugar_entrega ? `Destino: ${doc.lugar_entrega}\n` : ''}================================
${rawbtLinesText}
${doc.comentario ? `Notas: ${doc.comentario}\n................................\n` : ''}
Recibido Por: ${doc.nombre_recibe || '_______________________'}

${firmaStatusText}
................................
   ¡Gracias por su preferencia!
`.trim());

        const plainBoletaText = decodeURIComponent(rawbtText);
        const clicPrintIntent = `intent://${rawbtText}#Intent;scheme=clicprint;package=com.clicsoporte.print;end;`;
        const rawbtIntent = `intent://${rawbtText}#Intent;scheme=rawbt;package=ru.a42.rawbtprinter;end;`;
        const settings = await getDeliverySettings();
        const printMethod = settings.driver_boleta_print_method || 'all';

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Boleta Thermal ${doc.documento_numero}</title>
    <style>
        @media print {
            @page {
                size: ${is57 ? '57mm' : '80mm'} auto;
                margin: 0mm;
            }
            html, body {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                overflow: visible !important;
                -webkit-print-color-adjust: exact;
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;
            }
            .no-print { display: none !important; }
        }
        html, body {
            font-family: 'Courier New', Courier, monospace, sans-serif;
            width: 100%;
            max-width: ${is57 ? '320px' : '400px'};
            margin: 0 auto;
            padding: 4px;
            font-size: ${is57 ? '12px' : '14px'};
            line-height: 1.25;
            font-weight: 700;
            color: #000000;
            background: #ffffff;
            height: auto;
            box-sizing: border-box;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
        }
        .center { text-align: center; }
        .bold { font-weight: 900; }
        .dashed-line { border-bottom: 1.5px dashed #000; margin: 4px 0; }
        .solid-line { border-bottom: 2px solid #000; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; font-size: ${is57 ? '11px' : '13px'}; }
        th, td { padding: 2px 0; vertical-align: top; word-break: break-word; }
    </style>
</head>
<body>
    <div class="center bold" style="font-size: ${is57 ? '15px' : '19px'}; text-transform: uppercase;">${companyName}</div>
    ${company?.taxId ? `<div class="center" style="font-size: ${is57 ? '10px' : '13px'}; font-weight: bold;">Cédula Jurídica: ${company.taxId}</div>` : ''}
    ${company?.address ? `<div class="center" style="font-size: ${is57 ? '9px' : '11px'};">${company.address}</div>` : ''}
    ${company?.phone || company?.email ? `<div class="center" style="font-size: ${is57 ? '9px' : '11px'};">${company.phone || ''} ${company.email ? '| ' + company.email : ''}</div>` : ''}
    <div class="center bold" style="font-size: ${is57 ? '13px' : '16px'}; margin-top: 2px;">Boleta de Entrega (${paperSize})</div>
    <div class="dashed-line"></div>

    <div><span class="bold">Boleta:</span> #${doc.boleta_numero || doc.documento_numero}</div>
    <div><span class="bold">Doc ERP:</span> #${doc.documento_numero}</div>
    <div style="white-space: nowrap;"><span class="bold">Estado:</span> [ ${statusText} ]</div>
    <div><span class="bold">Fecha:</span> ${dateStr} ${timeStr}</div>
    <div><span class="bold">Ruta:</span> ${routeName}</div>
    <div><span class="bold">Camión:</span> ${vehiclePlate}</div>
    <div><span class="bold">Chofer:</span> ${driverName}</div>
    
    <div class="dashed-line"></div>
    <div class="bold">CLIENTE:</div>
    <div>${doc.cliente_nombre} (${doc.cliente_id || 'N/D'})</div>
    ${doc.lugar_entrega ? `<div><span class="bold">Destino:</span> ${doc.lugar_entrega}</div>` : ''}

    <div class="solid-line"></div>
    ${linesHtml ? `
        <div class="bold center" style="font-size: ${is57 ? '13px' : '16px'}; font-weight: 900; margin-top: 2px;">DISCREPANCIAS / FALTANTES</div>
        <table>
            <thead>
                <tr style="border-bottom: 1.5px solid #000;">
                    <th style="text-align: left; width: 22%;">Cód</th>
                    <th style="text-align: left; width: 42%;">Prod</th>
                    <th style="text-align: right; width: 11%;">Ped</th>
                    <th style="text-align: right; width: 11%;">Ent</th>
                    <th style="text-align: right; width: 14%; white-space: nowrap;">Falt</th>
                </tr>
            </thead>
            <tbody>
                ${linesHtml}
            </tbody>
        </table>
        <div class="dashed-line"></div>
    ` : ''}

    ${doc.comentario ? `<div><span class="bold">Notas:</span> ${doc.comentario}</div><div class="dashed-line"></div>` : ''}

    <div><span class="bold">Recibido Por:</span> ${doc.nombre_recibe || '_______________________'}</div>
    ${signatureUrl ? `
        <div class="center" style="margin-top: 4px;">
            <img src="${signatureUrl}" style="max-height: 70px; max-width: 90%; width: 230px; display: block; margin: 4px auto; filter: contrast(200%);" />
            <span style="font-size: 13px; font-weight: 900;">(Firma Digital Táctil)</span>
        </div>
    ` : `
        <div style="margin-top: 25px; text-align: center; border-top: 1.5px solid #000; width: 80%; margin-left: auto; margin-right: auto; padding-top: 2px; font-size: 14px; font-weight: 900;">
            Firma del Cliente
        </div>
    `}

    <div class="dashed-line"></div>
    <div class="center bold" style="font-size: 13px; margin-top: 3px;">¡Gracias por su preferencia!</div>

    ${mapsUrl ? `
        <div class="dashed-line"></div>
        <div class="center" style="font-size: 8px;">
            GPS: Lat ${doc.latitud}, Lng ${doc.longitud}<br/>
            <a href="${mapsUrl}" target="_blank" style="color: #000;">Ver en Google Maps</a>
        </div>
    ` : ''}

    <div class="dashed-line"></div>
    <div class="center" style="font-size: 8px;">¡Gracias por su preferencia!</div>
</body>
</html>
        `;

        return { success: true, html };
    } catch (e: any) {
        logError('Error rendering thermal print html:', e.message);
        return { success: false, error: e.message };
    }
}

// --- Get User's Own Collect Requests ---
export async function getUserCollectRequests(options?: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
}): Promise<{
    requests: any[];
    totalCount: number;
    page: number;
    totalPages: number;
}> {
    const user = await authorizeAction('deliveries:collect');
    const db = await getDb();
    try {
        const page = options?.page || 1;
        const pageSize = options?.pageSize || 10;
        
        let query = `
            SELECT 
                q.id, 
                q.documento_numero, 
                q.cliente_nombre, 
                q.creado_por, 
                q.fecha_registro, 
                q.estado, 
                q.entregado, 
                q.comentario, 
                q.asignacion_id, 
                q.foto_factura, 
                q.foto_evidencia,
                a.fecha as fecha_asignacion,
                u.name as chofer_nombre,
                u.phone as chofer_telefono,
                r.name as ruta_nombre
            FROM ops_delivery_queue q
            LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id
            LEFT JOIN core_users u ON a.empleado_id = u.id
            LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
            WHERE q.tipo_documento = 'recoger'
        `;
        const params: any[] = [];
        
        if (options?.startDate) {
            query += ` AND q.fecha_registro >= ?`;
            params.push(options.startDate);
        }
        if (options?.endDate) {
            query += ` AND q.fecha_registro <= ?`;
            params.push(options.endDate);
        }
        
        query += ` ORDER BY q.id DESC`;
        
        const rows = db.prepare(query).all(...params) as any[];

        // Filter in memory to only return requests where the logged-in user is either the solicitor or the colleague
        const filteredRows = rows.filter(row => {
            try {
                const details = JSON.parse(row.comentario || '{}');
                return details.solicitante_email === user.email || details.companero_email === user.email;
            } catch (e) {
                return false;
            }
        });

        const totalCount = filteredRows.length;
        const totalPages = Math.ceil(totalCount / pageSize);
        const startIndex = (page - 1) * pageSize;
        const paginatedRows = filteredRows.slice(startIndex, startIndex + pageSize);

        return JSON.parse(JSON.stringify({
            requests: paginatedRows,
            totalCount,
            page,
            totalPages
        }));
    } catch (e: any) {
        logError('Error fetching user collect requests:', e.message);
        return {
            requests: [],
            totalCount: 0,
            page: 1,
            totalPages: 1
        };
    }
}

// --- Cancel Collect Request Action ---
export async function cancelCollectRequestAction(id: number): Promise<{ success: boolean; error?: string }> {
    const user = await authorizeAction('deliveries:collect');
    const db = await getDb();
    try {
        const doc = db.prepare('SELECT estado, comentario FROM ops_delivery_queue WHERE id = ?').get(id) as any;
        if (!doc) {
            return { success: false, error: 'La solicitud no existe.' };
        }

        // Validate that user is authorized to cancel it (must be solicitor or colleague)
        try {
            const details = JSON.parse(doc.comentario || '{}');
            if (details.solicitante_email !== user.email && details.companero_email !== user.email) {
                return { success: false, error: 'No tiene permisos para cancelar esta solicitud.' };
            }
        } catch (e) {
            return { success: false, error: 'Error al validar propiedad de la solicitud.' };
        }

        if (doc.estado !== 'pendiente') {
            return { success: false, error: `No se puede cancelar una solicitud en estado: ${doc.estado}.` };
        }

        db.prepare("UPDATE ops_delivery_queue SET entregado = 1, estado = 'cancelado' WHERE id = ?").run(id);
        revalidatePath('/dashboard/operations/logistics/collect');
        return { success: true };
    } catch (e: any) {
        logError('Error cancelling collect request:', e.message);
        return { success: false, error: e.message };
    }
}

// --- Reinject / Reactivate Collect Request to General Queue ---
export async function reinjectCollectToGeneralQueueAction(id: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:collect');
    const db = await getDb();
    try {
        const doc = db.prepare('SELECT id, documento_numero, estado, entregado, tipo_documento, asignacion_id FROM ops_delivery_queue WHERE id = ?').get(id) as any;
        if (!doc) {
            return { success: false, error: 'La solicitud de recolecta no existe.' };
        }

        if (doc.tipo_documento !== 'recoger') {
            return { success: false, error: 'El documento no es una recolecta.' };
        }

        if (doc.estado === 'completo') {
            return { success: false, error: 'No se puede reactivar una recolecta que ya fue completada exitosamente.' };
        }

        // Reset assignment, return flags and set back to active pending in general queue
        db.prepare(`
            UPDATE ops_delivery_queue 
            SET asignacion_id = NULL, 
                devolucion_asignacion_id = NULL, 
                entregado = 0, 
                estado = 'pendiente', 
                canal_registro = 'web'
            WHERE id = ?
        `).run(id);

        revalidatePath('/dashboard/operations/logistics/collect');
        revalidatePath('/dashboard/operations/logistics/deliveries');
        return { success: true };
    } catch (e: any) {
        logError('Error reinjecting collect request to general queue:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Dispatcher: Notifica al Vendedor y Creador/Facturador del pedido cuando el chofer reporta que está esperando atención.
 */
export async function sendDriverWaitingCustomerNoticeAction(params: {
    docId: number;
    lat?: number | null;
    lng?: number | null;
}): Promise<{ success: boolean; message?: string; error?: string }> {
    const db = await getDb();
    try {
        const doc = db.prepare(`
            SELECT 
                q.*, 
                a.empleado_id, 
                a.ruta_id, 
                a.vehiculo_id,
                COALESCE(u.name, '') as chofer_nombre,
                COALESCE(v.plate, '') as vehiculo_placa,
                COALESCE(r.name, '') as ruta_nombre
            FROM ops_delivery_queue q
            LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id
            LEFT JOIN core_users u ON a.empleado_id = u.id
            LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
            WHERE q.id = ?
        `).get(params.docId) as any;

        if (!doc) {
            return { success: false, error: 'Documento no encontrado' };
        }

        const lines = db.prepare('SELECT producto_codigo as codigo, producto_descripcion as desc, cantidad_pedida as pedida FROM ops_delivery_lines WHERE delivery_order_id = ?').all(doc.id) as any[];

        const effectiveLat = params.lat ?? doc.latitud;
        const effectiveLng = params.lng ?? doc.longitud;
        const mapsLink = (effectiveLat && effectiveLng)
            ? `https://www.google.com/maps/search/?api=1&query=${effectiveLat},${effectiveLng}`
            : 'https://maps.google.com';

        const dateObj = new Date();
        const horaReporte = dateObj.toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) + ' ' + dateObj.toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });

        // Build HTML table for products
        let productosTable = '';
        if (lines && lines.length > 0) {
            const rows = lines.map(l => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px 8px; font-family: monospace; font-weight: bold; color: #475569;">${l.codigo}</td>
                    <td style="padding: 6px 8px; color: #1e293b;">${l.desc}</td>
                    <td style="padding: 6px 8px; text-align: right; font-weight: bold; color: #0f172a;">${l.pedida}</td>
                </tr>
            `).join('');
            productosTable = `
                <div style="margin-top: 15px; margin-bottom: 20px;">
                    <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 6px;">Líneas de Producto que Transporta:</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                        <thead>
                            <tr style="background-color: #f8fafc; border-bottom: 1.5px solid #cbd5e1; color: #475569; font-weight: bold; text-align: left;">
                                <th style="padding: 6px 8px;">Cód</th>
                                <th style="padding: 6px 8px;">Descripción</th>
                                <th style="padding: 6px 8px; text-align: right;">Cant</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }

        // Resolver dirección de embarque enriquecida (idéntica a la tarjeta del APK)
        let resolvedAddress = '';
        if (doc.tipo_documento === 'recoger') {
            try {
                if (doc.comentario && doc.comentario.trim().startsWith('{')) {
                    const parsed = JSON.parse(doc.comentario);
                    const dirExacta = parsed.direccion_exacta || parsed.direccion_detalle || parsed.direccionDetalle || '';
                    const prov = parsed.provincia || parsed.provincia_nombre || '';
                    const cant = parsed.canton || parsed.canton_nombre || '';
                    const dist = parsed.distrito || parsed.distrito_nombre || '';
                    const geo = [prov, cant, dist, dirExacta].filter(s => s && String(s).trim().length > 0 && String(s).trim() !== '0').join(', ');
                    if (geo.length > 0) resolvedAddress = geo;
                }
            } catch (_) {}

            if (!resolvedAddress) {
                const supp = db.prepare('SELECT address FROM core_suppliers WHERE id = ? OR LOWER(name) = LOWER(?)').get(doc.cliente_id, doc.cliente_nombre) as { address?: string } | undefined;
                if (supp?.address && supp.address.trim() !== '' && supp.address.trim() !== '0') {
                    resolvedAddress = supp.address.trim();
                }
            }
        } else {
            // Factura o pedido de cliente: buscar por dirección de embarque del ERP
            try {
                const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE, OBSERVACIONES FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { DIREC_EMBARQUE?: string; OBSERVACIONES?: string } | undefined;
                const direcEmbarque = invoiceHeader?.DIREC_EMBARQUE;

                if (direcEmbarque) {
                    const sa = db.prepare(`
                        SELECT descripcion, detalle_direccion 
                        FROM core_customer_shipment_addresses 
                        WHERE cliente_id = ? AND direccion_id = ?
                        LIMIT 1
                    `).get(doc.cliente_id, direcEmbarque) as { descripcion?: string; detalle_direccion?: string } | undefined;

                    if (sa) {
                        const isValid = (val?: string) => val && val.trim() !== '' && val.trim() !== '0' && !val.trim().endsWith('.0');
                        if (isValid(sa.descripcion)) {
                            resolvedAddress = sa.descripcion!.trim();
                        } else if (isValid(sa.detalle_direccion)) {
                            resolvedAddress = sa.detalle_direccion!.trim();
                        }
                    }
                }

                // Fallbacks si no se encontró con DIREC_EMBARQUE específico
                if (!resolvedAddress) {
                    const firstSa = db.prepare(`
                        SELECT descripcion, detalle_direccion 
                        FROM core_customer_shipment_addresses 
                        WHERE cliente_id = ? 
                          AND ((descripcion IS NOT NULL AND descripcion != '' AND descripcion NOT GLOB '*[0-9].0')
                            OR (detalle_direccion IS NOT NULL AND detalle_direccion != '' AND detalle_direccion NOT GLOB '*[0-9].0'))
                        ORDER BY id ASC LIMIT 1
                    `).get(doc.cliente_id) as { descripcion?: string; detalle_direccion?: string } | undefined;
                    if (firstSa) {
                        const isValid = (val?: string) => val && val.trim() !== '' && val.trim() !== '0' && !val.trim().endsWith('.0');
                        if (isValid(firstSa.descripcion)) {
                            resolvedAddress = firstSa.descripcion!.trim();
                        } else if (isValid(firstSa.detalle_direccion)) {
                            resolvedAddress = firstSa.detalle_direccion!.trim();
                        }
                    }
                }

                if (!resolvedAddress) {
                    const cust = db.prepare('SELECT address FROM core_customers WHERE id = ?').get(doc.cliente_id) as { address?: string } | undefined;
                    if (cust?.address && cust.address.trim() !== '' && cust.address.trim() !== '0' && !cust.address.trim().endsWith('.0')) {
                        resolvedAddress = cust.address.trim();
                    }
                }
            } catch (_) {}
        }

        if (!resolvedAddress || resolvedAddress === '0') {
            resolvedAddress = doc.lugar_entrega && doc.lugar_entrega !== '0' ? doc.lugar_entrega : 'Dirección registrada en expediente';
        }

        // Consultar configuraciones de envío
        const getSetting = (key: string, defaultVal: string = '1') => {
            const row = db.prepare('SELECT value FROM ops_delivery_settings WHERE key = ?').get(key) as { value: string } | undefined;
            return row ? row.value : defaultVal;
        };

        const emailSalespersonEnabled = getSetting('notif_waiting_email_salesperson', '1') === '1';
        const emailCreatorEnabled = getSetting('notif_waiting_email_creator', '1') === '1';
        const telegramSalespersonEnabled = getSetting('notif_waiting_telegram_salesperson', '0') === '1';
        const telegramCreatorEnabled = getSetting('notif_waiting_telegram_creator', '0') === '1';

        // Obtener plantilla personalizada desde DB
        const templateRow = db.prepare("SELECT * FROM notification_templates WHERE eventId = 'onDriverWaitingCustomer'").get() as any;
        let subjectTemplate = templateRow?.subject || '⏱️ [EN ESPERA] Chofer esperando atención en {{clienteNombre}} - Factura #{{docNumero}}';
        let bodyTemplate = templateRow?.body || '';
        let telegramTemplate = templateRow?.telegram || '⏱️ <b>CHOFER EN ESPERA DE ATENCIÓN</b>\n\nDoc: <b>#{{docNumero}}</b>\nCliente: <b>{{clienteNombre}}</b>\nChofer: <b>{{choferNombre}}</b> ({{vehiculoPlaca}})\nHora: <b>{{horaReporte}}</b>\nDirección: <i>{{lugarEntrega}}</i>\n\n📍 <a href="{{mapsLink}}">Ver Ubicación GPS en Google Maps</a>';

        const replaceVars = (tmpl: string) => {
            return tmpl
                .replace(/\{\{docNumero\}\}/g, doc.documento_numero || '')
                .replace(/\{\{clienteNombre\}\}/g, doc.cliente_nombre || '')
                .replace(/\{\{clienteId\}\}/g, doc.cliente_id || '')
                .replace(/\{\{lugarEntrega\}\}/g, resolvedAddress)
                .replace(/\{\{choferNombre\}\}/g, doc.chofer_nombre || 'Chofer')
                .replace(/\{\{vehiculoPlaca\}\}/g, doc.vehiculo_placa || 'N/D')
                .replace(/\{\{rutaNombre\}\}/g, doc.ruta_nombre || 'Ruta')
                .replace(/\{\{horaReporte\}\}/g, horaReporte)
                .replace(/\{\{mapsLink\}\}/g, mapsLink)
                .replace(/\{\{productosTable\}\}/g, productosTable);
        };

        const renderedSubject = replaceVars(subjectTemplate);
        const renderedBody = replaceVars(bodyTemplate);
        const renderedTelegram = replaceVars(telegramTemplate);

        const { sendEmail } = await import('@/modules/core/lib/email-service');
        const { sendTelegramMessage } = await import('@/modules/notifications/lib/telegram-service');

        const sentEmails = new Set<string>();
        const sentTelegramChats = new Set<string>();

        // 1. Resolver Vendedor
        let salespersonCode: string | null = null;
        if (doc.tipo_documento === 'factura') {
            const erpInvoice = db.prepare('SELECT VENDEDOR FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { VENDEDOR: string } | undefined;
            if (erpInvoice?.VENDEDOR) salespersonCode = erpInvoice.VENDEDOR;
        }
        if (!salespersonCode) {
            const cust = db.prepare('SELECT salesperson FROM core_customers WHERE id = ?').get(doc.cliente_id) as { salesperson: string } | undefined;
            if (cust?.salesperson) salespersonCode = cust.salesperson;
        }

        if (salespersonCode) {
            const spUser = db.prepare('SELECT id, email, telegramChatId FROM core_users WHERE salespersonId = ?').get(salespersonCode) as { id: string; email?: string; telegramChatId?: string } | undefined;
            if (spUser) {
                if (emailSalespersonEnabled && spUser.email && !sentEmails.has(spUser.email.toLowerCase())) {
                    await sendEmail({
                        to: spUser.email,
                        subject: renderedSubject,
                        html: renderedBody
                    });
                    sentEmails.add(spUser.email.toLowerCase());
                }
                if (telegramSalespersonEnabled && spUser.telegramChatId && !sentTelegramChats.has(spUser.telegramChatId)) {
                    try {
                        await sendTelegramMessage(renderedTelegram, spUser.telegramChatId);
                        sentTelegramChats.add(spUser.telegramChatId);
                    } catch (e: any) {
                        logError(`Failed to send waiting Telegram notice to salesperson ${salespersonCode}:`, e.message);
                    }
                }
            }
        }

        // 2. Resolver Creador / Facturador ERP
        const erpCreatorAlias = doc.creado_por;
        if (erpCreatorAlias) {
            const creatorUser = db.prepare('SELECT id, email, telegramChatId FROM core_users WHERE erpAlias = ? OR email = ? OR name = ?').get(erpCreatorAlias, erpCreatorAlias, erpCreatorAlias) as { id: string; email?: string; telegramChatId?: string } | undefined;
            if (creatorUser) {
                if (emailCreatorEnabled && creatorUser.email && !sentEmails.has(creatorUser.email.toLowerCase())) {
                    await sendEmail({
                        to: creatorUser.email,
                        subject: renderedSubject,
                        html: renderedBody
                    });
                    sentEmails.add(creatorUser.email.toLowerCase());
                }
                if (telegramCreatorEnabled && creatorUser.telegramChatId && !sentTelegramChats.has(creatorUser.telegramChatId)) {
                    try {
                        await sendTelegramMessage(renderedTelegram, creatorUser.telegramChatId);
                        sentTelegramChats.add(creatorUser.telegramChatId);
                    } catch (e: any) {
                        logError(`Failed to send waiting Telegram notice to creator ${erpCreatorAlias}:`, e.message);
                    }
                }
            }
        }

        return {
            success: true,
            message: `Aviso enviado correctamente (${sentEmails.size} email(s), ${sentTelegramChats.size} telegram(s))`
        };
    } catch (e: any) {
        logError('Error sending driver waiting notice:', e.message);
        return { success: false, error: e.message };
    }
}





async function notifyDriverCollectAssignment(docId: number, assignmentId: number): Promise<void> {
    const db = await getDb();
    try {
        const doc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(docId) as any;
        if (!doc) return;

        const driverLink = db.prepare(`
            SELECT tl.chatId
            FROM ops_delivery_assignments a
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_telegram_linkages tl ON u.employeeId = tl.employeeId
            WHERE a.id = ?
        `).get(assignmentId) as { chatId: string } | undefined;

        if (driverLink?.chatId) {
            let details: any = {};
            try {
                details = JSON.parse(doc.comentario || '{}');
            } catch (e) {}

            const msg = `📦 <b>Nueva Recolecta Asignada</b>\n\n` +
                        `Se ha asignado una nueva solicitud de recolecta a tu ruta actual:\n` +
                        `• Consecutivo: <b>#${doc.documento_numero}</b>\n` +
                        `• Proveedor: <b>${doc.cliente_nombre}</b>\n` +
                        `• Dirección: <b>${details.direccion_detalle || 'N/D'}</b>\n` +
                        `• Contacto: <b>${details.proveedor_contacto_nombre || 'N/D'}</b> (${details.proveedor_contacto_telefono || 'N/D'})\n\n` +
                        `<i>Puedes consultar y reportar esta recolecta desde el menú del bot.</i>`;

            const { sendTelegramMessage } = require('@/modules/notifications/lib/telegram-service');
            await sendTelegramMessage(msg, driverLink.chatId);
        }
    } catch (err: any) {
        logError('Error notifying driver of collect assignment:', err.message);
    }
}

export interface LogisticsAnalyticsFilters {
    startDate?: string;
    endDate?: string;
    choferName?: string;
    rutaId?: string;
    vehiculoPlaca?: string;
    searchClient?: string;
    documentoNumero?: string;
}

export async function getLogisticsAnalyticsDataAction(filters: LogisticsAnalyticsFilters) {
    const user = await getCurrentUser();
    if (!user) throw new Error("No autenticado");

    const db = await getDb();

    let queueQuery = `
        SELECT q.*, 
               c.name as cliente_nombre_core,
               COALESCE(u.name, q.gestionado_por) as chofer_nombre,
               v.plate as vehiculo_placa,
               r.name as ruta_nombre
        FROM ops_delivery_queue q
        LEFT JOIN core_customers c ON q.cliente_id = c.id
        LEFT JOIN ops_delivery_assignments a ON (q.asignacion_id = a.id OR q.devolucion_asignacion_id = a.id)
        LEFT JOIN core_users u ON a.empleado_id = u.id
        LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
        LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
        WHERE 1=1
    `;
    const params: any[] = [];

    const hasGlobalPermission = user.role === 'admin' || user.role === 'superadmin' || user.role === 'logistics_manager';
    if (!hasGlobalPermission && (user.erpAlias || user.salespersonId)) {
        queueQuery += ` AND (q.creado_por = ? OR q.vendedor = ?)`;
        params.push(user.erpAlias || '', user.salespersonId || '');
    }

    if (filters.documentoNumero && filters.documentoNumero.trim()) {
        queueQuery += ` AND q.documento_numero LIKE ?`;
        params.push(`%${filters.documentoNumero.trim()}%`);
    }

    if (filters.startDate) {
        queueQuery += ` AND DATE(COALESCE(q.fecha_entrega, a.fecha, q.fecha_registro)) >= ?`;
        params.push(filters.startDate);
    }
    if (filters.endDate) {
        queueQuery += ` AND DATE(COALESCE(q.fecha_entrega, a.fecha, q.fecha_registro)) <= ?`;
        params.push(filters.endDate);
    }
    if (filters.choferName && filters.choferName !== 'all') {
        queueQuery += ` AND (u.name LIKE ? OR q.gestionado_por LIKE ?)`;
        params.push(`%${filters.choferName}%`, `%${filters.choferName}%`);
    }
    if (filters.vehiculoPlaca && filters.vehiculoPlaca !== 'all') {
        queueQuery += ` AND v.plate LIKE ?`;
        params.push(`%${filters.vehiculoPlaca}%`);
    }
    if (filters.searchClient && filters.searchClient.trim()) {
        const term = `%${filters.searchClient.trim()}%`;
        queueQuery += ` AND (q.cliente_nombre LIKE ? OR q.cliente_id LIKE ? OR c.name LIKE ?)`;
        params.push(term, term, term);
    }

    queueQuery += ` ORDER BY q.id DESC LIMIT 2000`;

    const rawDocs = db.prepare(queueQuery).all(...params) as any[];
    const queueDocs = JSON.parse(JSON.stringify(rawDocs));

    // Query assignments
    let assQuery = `
        SELECT a.*, r.name as ruta_nombre, u.name as chofer_nombre, v.plate as vehiculo_placa
        FROM ops_delivery_assignments a
        LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
        LEFT JOIN core_users u ON a.empleado_id = u.id
        LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
        WHERE 1=1
    `;
    const assParams: any[] = [];
    if (filters.startDate) {
        assQuery += ` AND a.fecha >= ?`;
        assParams.push(filters.startDate);
    }
    if (filters.endDate) {
        assQuery += ` AND a.fecha <= ?`;
        assParams.push(filters.endDate);
    }
    if (filters.rutaId && filters.rutaId !== 'all') {
        assQuery += ` AND a.ruta_id = ?`;
        assParams.push(filters.rutaId);
    }

    assQuery += ` ORDER BY a.id DESC LIMIT 500`;

    const rawAssignments = db.prepare(assQuery).all(...assParams) as any[];
    const assignments = JSON.parse(JSON.stringify(rawAssignments));

    return {
        success: true,
        queueDocs,
        assignments
    };
}

export async function getSuppliersAction(): Promise<{ id: string; name: string; alias?: string; email?: string; phone?: string; address?: string; latitude?: number; longitude?: number }[]> {
    const db = await getDb();
    try {
        const suppliersMap = new Map<string, { id: string; name: string; alias?: string; email?: string; phone?: string; address?: string; latitude?: number; longitude?: number }>();

        // 1. Catálogo Oficial ERP (core_suppliers)
        try {
            const rows = db.prepare('SELECT id, name, alias, email, phone, address, latitude, longitude FROM core_suppliers ORDER BY name ASC').all() as any[];
            rows.forEach(r => {
                if (r.name && r.name.trim()) {
                    suppliersMap.set(r.name.trim().toLowerCase(), {
                        id: r.id || r.name,
                        name: r.name.trim(),
                        alias: r.alias || '',
                        email: r.email || '',
                        phone: r.phone || '',
                        address: r.address || '',
                        latitude: r.latitude ?? undefined,
                        longitude: r.longitude ?? undefined
                    });
                }
            });
        } catch (e) {}

        // 2. Órdenes de Compra ERP (core_erp_purchase_order_headers) como respaldo oficial si el catálogo principal aún no se sincronizó
        if (suppliersMap.size === 0) {
            try {
                const poRows = db.prepare('SELECT DISTINCT PROVEEDOR as id, PROVEEDOR as name FROM core_erp_purchase_order_headers WHERE PROVEEDOR IS NOT NULL AND PROVEEDOR != ""').all() as any[];
                poRows.forEach(p => {
                    if (p.name && p.name.trim() && !suppliersMap.has(p.name.trim().toLowerCase())) {
                        suppliersMap.set(p.name.trim().toLowerCase(), {
                            id: p.id || p.name,
                            name: p.name.trim()
                        });
                    }
                });
            } catch (e) {}
        }

        const list = Array.from(suppliersMap.values());
        return list.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e: any) {
        logError('Error fetching suppliers:', e.message);
        return [];
    }
}

/**
 * Obtiene el desglose de líneas de artículos reportados (pedidas, entregadas, faltantes)
 * para un documento específico desde ops_delivery_lines.
 */
export async function getDeliveryLinesByDocIdAction(docId: number): Promise<{
    success: boolean;
    vendedor?: {
        codigo: string;
        nombre: string;
        email?: string;
        telefono?: string;
    };
    lines: Array<{
        id: number;
        codigo: string;
        desc: string;
        pedida: number;
        entregada: number;
        faltante: number;
    }>;
    error?: string;
}> {
    try {
        const db = await getDb();

        // 1. Obtener documento para extraer número, cliente y creador
        const doc = db.prepare('SELECT id, documento_numero, cliente_id, creado_por FROM ops_delivery_queue WHERE id = ?').get(docId) as any;

        // 2. Resolver Vendedor Asignado (Factura -> Cliente -> Creador)
        let salespersonCode: string | null = null;
        let salespersonName = '';
        let salespersonEmail = '';
        let salespersonPhone = '';

        if (doc) {
            // Prioridad 1: Vendedor en encabezado de factura ERP
            const erpInvoice = db.prepare('SELECT VENDEDOR FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { VENDEDOR: string } | undefined;
            if (erpInvoice?.VENDEDOR && String(erpInvoice.VENDEDOR).trim()) {
                salespersonCode = String(erpInvoice.VENDEDOR).trim();
            } else if (doc.cliente_id) {
                // Prioridad 2: Vendedor asociado al Cliente
                const cust = db.prepare('SELECT salesperson FROM core_customers WHERE id = ?').get(doc.cliente_id) as { salesperson: string } | undefined;
                if (cust?.salesperson && String(cust.salesperson).trim()) {
                    salespersonCode = String(cust.salesperson).trim();
                }
            }

            // Buscar datos del vendedor en core_salespersons
            if (salespersonCode) {
                const sp = db.prepare('SELECT NOMBRE, E_MAIL, TELEFONO FROM core_salespersons WHERE VENDEDOR = ?').get(salespersonCode) as any;
                if (sp) {
                    salespersonName = sp.NOMBRE || salespersonCode;
                    salespersonEmail = sp.E_MAIL || '';
                    salespersonPhone = sp.TELEFONO || '';
                } else {
                    // Fallback a core_users
                    const u = db.prepare('SELECT name, email FROM core_users WHERE salespersonId = ? OR email = ? OR erpAlias = ?').get(salespersonCode, salespersonCode, salespersonCode) as any;
                    if (u) {
                        salespersonName = u.name || salespersonCode;
                        salespersonEmail = u.email || '';
                    } else {
                        salespersonName = salespersonCode;
                    }
                }
            } else if (doc.creado_por) {
                // Prioridad 3: Usuario creador del pedido
                const u = db.prepare('SELECT name, email, salespersonId FROM core_users WHERE email = ? OR erpAlias = ? OR id = ?').get(doc.creado_por, doc.creado_por, doc.creado_por) as any;
                salespersonCode = u?.salespersonId || doc.creado_por;
                salespersonName = u?.name || doc.creado_por;
                salespersonEmail = u?.email || '';
            }
        }

        // 3. Obtener líneas de entrega
        const rows = db.prepare(`
            SELECT 
                id,
                producto_codigo as codigo,
                producto_descripcion as desc,
                cantidad_pedida as pedida,
                cantidad_entregada as entregada,
                cantidad_faltante as faltante
            FROM ops_delivery_lines
            WHERE delivery_order_id = ?
            ORDER BY id ASC
        `).all(docId) as any[];

        return {
            success: true,
            vendedor: salespersonCode ? {
                codigo: salespersonCode,
                nombre: salespersonName || salespersonCode,
                email: salespersonEmail,
                telefono: salespersonPhone
            } : undefined,
            lines: rows.map(r => ({
                id: Number(r.id),
                codigo: String(r.codigo || ''),
                desc: String(r.desc || ''),
                pedida: Number(r.pedida || 0),
                entregada: Number(r.entregada || 0),
                faltante: Number(r.faltante || 0)
            }))
        };
    } catch (e: any) {
        logError('Error getting delivery lines by doc id:', e.message);
        return { success: false, lines: [], error: e.message };
    }
}

// ==========================================
// --- SERVER ACTIONS FOR BOLETAS OPERATIVAS ---
// ==========================================

export async function createBoletaOperativaAction(data: {
    clienteId: string;
    clienteNombre: string;
    motivoSalida: 'faltante' | 'devolucion' | 'muestra' | 'regalia' | 'otro';
    referenciaDoc?: string;
    comentario?: string;
    direccionEmbarqueId?: string;
    items: Array<{ codigo: string; descripcion: string; cantidad: number }>;
}): Promise<{ success: boolean; boletaNumero?: string; error?: string }> {
    const db = await getDb();
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        return { success: false, error: 'No autorizado' };
    }

    try {
        // Asegurar columnas de boletas operativas
        try {
            const tableInfo = db.prepare("PRAGMA table_info('ops_delivery_queue')").all();
            const cols = tableInfo.map((c: any) => c.name);
            if (!cols.includes('motivo_salida')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN motivo_salida TEXT;`);
            if (!cols.includes('referencia_doc')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN referencia_doc TEXT;`);
            if (!cols.includes('requiere_autorizacion')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN requiere_autorizacion INTEGER DEFAULT 0;`);
            if (!cols.includes('autorizado_por')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN autorizado_por TEXT;`);
            if (!cols.includes('fecha_autorizacion')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN fecha_autorizacion TEXT;`);
            if (!cols.includes('direccion_embarque_id')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN direccion_embarque_id TEXT;`);
        } catch (e) {}

        // Verificar si se usa un consecutivo único unificado para todas las boletas
        const useSingleConsecRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'boletas_use_single_consecutive'").get() as { value: string } | undefined;
        const isSingleConsecutive = useSingleConsecRow?.value === 'true';

        // Obtener prefijo y consecutivo según motivo o global
        let prefixSettingKey = isSingleConsecutive ? 'boleta_consecutive_prefix' : `boleta_prefix_${data.motivoSalida}`;
        let nextSettingKey = isSingleConsecutive ? 'boleta_consecutive_next' : `boleta_next_${data.motivoSalida}`;

        const prefixRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = ? OR key = 'boleta_consecutive_prefix' ORDER BY CASE WHEN key = ? THEN 1 ELSE 2 END LIMIT 1").get(prefixSettingKey, prefixSettingKey) as { value: string } | undefined;
        const nextRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = ? OR key = 'boleta_consecutive_next' ORDER BY CASE WHEN key = ? THEN 1 ELSE 2 END LIMIT 1").get(nextSettingKey, nextSettingKey) as { value: string } | undefined;

        const defaultPrefixes: Record<string, string> = {
            faltante: 'BOL-',
            devolucion: 'DEV-',
            muestra: 'MUE-',
            regalia: 'REG-',
            otro: 'BOL-'
        };

        const prefix = prefixRow?.value || (isSingleConsecutive ? 'BOL-' : defaultPrefixes[data.motivoSalida] || 'BOL-');
        const nextNum = parseInt(nextRow?.value || '1', 10);
        const boletaNum = `${prefix}${String(nextNum).padStart(6, '0')}`;

        // Incrementar consecutivo
        db.prepare("INSERT INTO ops_delivery_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(nextSettingKey, String(nextNum + 1));
        if (prefixSettingKey === 'boleta_prefix_faltante') {
            db.prepare("INSERT INTO ops_delivery_settings (key, value) VALUES ('boleta_consecutive_next', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(nextNum + 1));
        }

        const todayStr = new Date().toISOString();

        // Verificar si requiere aprobación según configuración
        const requireAuthRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'boletas_require_authorization'").get() as { value: string } | undefined;
        const requiresAuth = requireAuthRow?.value === 'true' ? 1 : 0;
        const initialEstado = requiresAuth === 1 ? 'pendiente_autorizacion' : 'pendiente';

        const result = db.prepare(`
            INSERT INTO ops_delivery_queue (
                documento_numero, tipo_documento, cliente_id, cliente_nombre,
                creado_por, fecha_registro, entregado, estado, comentario,
                boleta_numero, motivo_salida, referencia_doc, requiere_autorizacion,
                autorizado_por, fecha_autorizacion, direccion_embarque_id
            ) VALUES (?, 'boleta', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            boletaNum,
            data.clienteId || 'CLI-GENERIC',
            data.clienteNombre || 'Cliente General',
            currentUser.name || currentUser.email || 'Sistema',
            todayStr,
            initialEstado,
            data.comentario || null,
            boletaNum,
            data.motivoSalida,
            data.referenciaDoc || null,
            requiresAuth,
            requiresAuth === 0 ? 'AUTO' : null,
            requiresAuth === 0 ? todayStr : null,
            data.direccionEmbarqueId || null
        );

        const deliveryId = Number(result.lastInsertRowid);

        // Guardar ítems de la boleta
        if (data.items && data.items.length > 0) {
            const insertLineStmt = db.prepare(`
                INSERT INTO ops_delivery_lines (delivery_order_id, producto_codigo, producto_descripcion, cantidad_pedida, cantidad_entregada, cantidad_faltante)
                VALUES (?, ?, ?, ?, 0, ?)
            `);
            for (const item of data.items) {
                insertLineStmt.run(deliveryId, item.codigo, item.descripcion, item.cantidad, item.cantidad);
            }
        }

        revalidatePath('/dashboard/operations/vouchers');
        revalidatePath('/dashboard/operations/logistics/deliveries/operation');

        return { success: true, boletaNumero: boletaNum };
    } catch (e: any) {
        logError('Error creating boleta operativa:', e.message);
        return { success: false, error: e.message };
    }
}

export async function getBoletasOperativasAction(filters?: {
    motivo?: string;
    estado?: string;
    search?: string;
}): Promise<any[]> {
    const db = await getDb();
    try {
        let sql = `
            SELECT q.*, 
                (SELECT COUNT(*) FROM ops_delivery_lines WHERE delivery_order_id = q.id) as total_items
            FROM ops_delivery_queue q
            WHERE q.tipo_documento = 'boleta' OR q.motivo_salida IS NOT NULL
        `;

        const params: any[] = [];
        if (filters?.motivo && filters.motivo !== 'all') {
            sql += ` AND q.motivo_salida = ?`;
            params.push(filters.motivo);
        }
        if (filters?.estado && filters.estado !== 'all') {
            sql += ` AND q.estado = ?`;
            params.push(filters.estado);
        }
        if (filters?.search) {
            sql += ` AND (q.documento_numero LIKE ? OR q.boleta_numero LIKE ? OR q.cliente_nombre LIKE ? OR q.referencia_doc LIKE ?)`;
            const term = `%${filters.search}%`;
            params.push(term, term, term, term);
        }

        sql += ` ORDER BY q.id DESC LIMIT 100`;

        const rows = db.prepare(sql).all(...params) as any[];

        for (const row of rows) {
            const lines = db.prepare(`
                SELECT producto_codigo as codigo, producto_descripcion as descripcion, cantidad_pedida as cantidad
                FROM ops_delivery_lines WHERE delivery_order_id = ?
            `).all(row.id);
            row.items = lines;
        }

        return rows;
    } catch (e: any) {
        logError('Error fetching boletas operativas:', e.message);
        return [];
    }
}

export async function approveBoletaOperativaAction(
    boletaId: number, 
    sendToQueue: boolean = true
): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        return { success: false, error: 'No autorizado' };
    }

    try {
        const todayStr = new Date().toISOString();
        const nextState = sendToQueue ? 'pendiente' : 'aprobado_fuera_de_ruta';

        db.prepare(`
            UPDATE ops_delivery_queue
            SET estado = ?, autorizado_por = ?, fecha_autorizacion = ?
            WHERE id = ?
        `).run(nextState, currentUser.name || currentUser.email, todayStr, boletaId);

        revalidatePath('/dashboard/operations/vouchers');
        revalidatePath('/dashboard/operations/logistics/deliveries/operation');
        return { success: true };
    } catch (e: any) {
        logError('Error approving boleta operativa:', e.message);
        return { success: false, error: e.message };
    }
}

export async function updateBoletaOperativaAction(
    boletaId: number,
    data: {
        items?: Array<{ codigo: string; descripcion: string; cantidad: number }>;
        comentario?: string;
        referenciaDoc?: string;
        clienteNombre?: string;
        clienteId?: string;
        direccionEmbarqueId?: string;
    }
): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        return { success: false, error: 'No autorizado' };
    }

    try {
        const doc = db.prepare('SELECT id, estado FROM ops_delivery_queue WHERE id = ?').get(boletaId) as any;
        if (!doc) return { success: false, error: 'Boleta no encontrada' };

        if (doc.estado !== 'pendiente_autorizacion' && doc.estado !== 'pendiente') {
            return { success: false, error: 'Solo se pueden editar boletas pendientes de aprobación o pendientes de ruta.' };
        }

        const updateFields: string[] = [];
        const params: any[] = [];

        if (data.comentario !== undefined) {
            updateFields.push('comentario = ?');
            params.push(data.comentario || null);
        }
        if (data.referenciaDoc !== undefined) {
            updateFields.push('referencia_doc = ?');
            params.push(data.referenciaDoc || null);
        }
        if (data.clienteNombre !== undefined) {
            updateFields.push('cliente_nombre = ?');
            params.push(data.clienteNombre);
        }
        if (data.clienteId !== undefined) {
            updateFields.push('cliente_id = ?');
            params.push(data.clienteId);
        }
        if (data.direccionEmbarqueId !== undefined) {
            updateFields.push('direccion_embarque_id = ?');
            params.push(data.direccionEmbarqueId || null);
        }

        if (updateFields.length > 0) {
            params.push(boletaId);
            db.prepare(`UPDATE ops_delivery_queue SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);
        }

        if (data.items) {
            db.prepare('DELETE FROM ops_delivery_lines WHERE delivery_order_id = ?').run(boletaId);
            const insertLine = db.prepare(`
                INSERT INTO ops_delivery_lines (delivery_order_id, producto_codigo, producto_descripcion, cantidad_pedida, cantidad_entregada, cantidad_faltante)
                VALUES (?, ?, ?, ?, 0, ?)
            `);
            for (const item of data.items) {
                insertLine.run(boletaId, item.codigo, item.descripcion, item.cantidad, item.cantidad);
            }
        }

        revalidatePath('/dashboard/operations/vouchers');
        revalidatePath('/dashboard/admin/operations/vouchers');
        revalidatePath('/dashboard/operations/logistics/deliveries/operation');
        return { success: true };
    } catch (e: any) {
        logError('Error updating boleta operativa:', e.message);
        return { success: false, error: e.message };
    }
}

export async function searchErpInvoicesAction(query: string): Promise<Array<{
    factura: string;
    clienteId: string;
    clienteNombre: string;
    fecha: string;
    direccionEmbarque?: string;
}>> {
    const db = await getDb();
    try {
        if (!query || query.trim().length < 2) return [];
        const term = `%${query.trim()}%`;
        const rows = db.prepare(`
            SELECT FACTURA as factura, CLIENTE as clienteId, NOMBRE_CLIENTE as clienteNombre, FECHA as fecha, DIREC_EMBARQUE as direccionEmbarque
            FROM core_erp_invoice_headers
            WHERE FACTURA LIKE ? OR CLIENTE LIKE ? OR NOMBRE_CLIENTE LIKE ?
            ORDER BY FECHA DESC LIMIT 20
        `).all(term, term, term) as any[];
        return rows;
    } catch (e: any) {
        logError('Error searching ERP invoices:', e.message);
        return [];
    }
}

export async function getErpInvoiceDetailAction(facturaNum: string): Promise<{
    success: boolean;
    header?: any;
    lines?: any[];
    shipmentAddresses?: any[];
    error?: string;
}> {
    const db = await getDb();
    try {
        const header = db.prepare(`
            SELECT FACTURA as factura, CLIENTE as clienteId, NOMBRE_CLIENTE as clienteNombre, FECHA as fecha, DIREC_EMBARQUE as direccionEmbarque
            FROM core_erp_invoice_headers
            WHERE FACTURA = ?
        `).get(facturaNum) as any;

        if (!header) {
            return { success: false, error: 'Documento no encontrado' };
        }

        const lines = db.prepare(`
            SELECT ARTICULO as codigo, (SELECT description FROM core_products WHERE id = ARTICULO) as descripcion_cat, DESCRIPCION as descripcion_erp, CANTIDAD as cantidad
            FROM core_erp_invoice_lines
            WHERE FACTURA = ?
        `).all(facturaNum) as any[];

        const formattedLines = lines.map((l: any) => ({
            codigo: l.codigo,
            descripcion: l.descripcion_cat || l.descripcion_erp || l.codigo,
            cantidad: Number(l.cantidad) || 1
        }));

        let shipmentAddresses: any[] = [];
        if (header.clienteId) {
            shipmentAddresses = db.prepare(`
                SELECT direccion_id as id, descripcion, detalle_direccion as detalle, latitude, longitude
                FROM core_customer_shipment_addresses
                WHERE cliente_id = ?
            `).all(header.clienteId) as any[];
        }

        return {
            success: true,
            header,
            lines: formattedLines,
            shipmentAddresses
        };
    } catch (e: any) {
        logError('Error fetching ERP invoice detail:', e.message);
        return { success: false, error: e.message };
    }
}

export async function searchCustomersAction(query: string): Promise<Array<{
    id: string;
    nombre: string;
    cedula?: string;
    direccion?: string;
}>> {
    const db = await getDb();
    try {
        if (!query || query.trim().length < 2) return [];
        const term = `%${query.trim()}%`;
        const rows = db.prepare(`
            SELECT id, nombre, cedula, direccion
            FROM core_customers
            WHERE id LIKE ? OR nombre LIKE ? OR cedula LIKE ?
            ORDER BY nombre ASC LIMIT 20
        `).all(term, term, term) as any[];
        return rows;
    } catch (e: any) {
        logError('Error searching customers:', e.message);
        return [];
    }
}

export async function getCustomerShipmentAddressesAction(clienteId: string): Promise<Array<{
    id: string;
    descripcion: string;
    detalle: string;
    latitude?: number;
    longitude?: number;
}>> {
    const db = await getDb();
    try {
        if (!clienteId) return [];
        const rows = db.prepare(`
            SELECT direccion_id as id, descripcion, detalle_direccion as detalle, latitude, longitude
            FROM core_customer_shipment_addresses
            WHERE cliente_id = ?
        `).all(clienteId) as any[];
        return rows;
    } catch (e: any) {
        logError('Error fetching customer shipment addresses:', e.message);
        return [];
    }
}

export async function searchProductsAction(query: string): Promise<Array<{
    codigo: string;
    descripcion: string;
}>> {
    const db = await getDb();
    try {
        if (!query || query.trim().length < 2) return [];
        const term = `%${query.trim()}%`;
        const rows = db.prepare(`
            SELECT id as codigo, description as descripcion
            FROM core_products
            WHERE id LIKE ? OR description LIKE ?
            ORDER BY description ASC LIMIT 20
        `).all(term, term) as any[];
        return rows;
    } catch (e: any) {
        logError('Error searching products:', e.message);
        return [];
    }
}

export async function getBoletaPrintHtmlAction(boletaId: number): Promise<{ success: boolean; html?: string; error?: string }> {
    const db = await getDb();
    try {
        const doc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(boletaId) as any;
        if (!doc) return { success: false, error: 'Boleta no encontrada' };

        const lines = db.prepare('SELECT * FROM ops_delivery_lines WHERE delivery_order_id = ?').all(boletaId) as any[];

        const { getCompanySettings } = await import('@/modules/core/lib/db');
        const company = await getCompanySettings();

        const motivoLabels: Record<string, string> = {
            faltante: 'ENTREGA INCOMPLETA / LÍNEA FALTANTE',
            devolucion: 'DEVOLUCIÓN Y REPOSICIÓN DE PRODUCTO',
            muestra: 'MUESTRA PROMOCIONAL / DEMOSTRACIÓN',
            regalia: 'REGALÍA / PATROCINIO ESPECIAL',
            otro: 'SALIDA OPERATIVA DE BODEGA'
        };

        const motivoTitle = motivoLabels[doc.motivo_salida || 'otro'] || 'BOLETA DE SALIDA DE BODEGA';
        const originalDocRef = doc.referencia_doc || (doc.documento_numero && doc.documento_numero.includes('-PARTIAL') ? doc.documento_numero.replace('-PARTIAL', '').replace('-RETRY', '') : null);

        const linesHtml = lines.map(l => `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: bold;">${l.producto_codigo}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${l.producto_descripcion || 'N/D'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${l.cantidad_pedida}</td>
            </tr>
        `).join('');

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8"/>
                <title>Boleta de Salida #${doc.boleta_numero || doc.documento_numero}</title>
                <style>
                    @page { size: letter portrait; margin: 12mm; }
                    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; margin: 0; padding: 15px; color: #0f172a; background: #ffffff; }
                    .header-container { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; }
                    .company-title { font-size: 20px; font-weight: 900; color: #0369a1; text-transform: uppercase; tracking: -0.5px; }
                    .company-sub { font-size: 11px; color: #475569; margin-top: 3px; line-height: 1.3; }
                    .doc-badge { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px; }
                    .doc-number { font-size: 22px; font-weight: 900; color: #0f172a; margin: 4px 0 0 0; font-family: monospace; }
                    .doc-date { font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
                    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 11.5px; line-height: 1.5; }
                    .info-card-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 4px; }
                    .notes-box { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 10px 14px; border-radius: 8px; font-size: 11px; margin-bottom: 16px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                    th { background: #f1f5f9; color: #334155; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: left; }
                    td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; color: #1e293b; }
                    .sig-section { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 50px; page-break-inside: avoid; }
                    .sig-box { text-align: center; font-size: 10.5px; }
                    .sig-line { border-top: 1.5px dashed #94a3b8; margin-top: 45px; padding-top: 6px; font-weight: 700; color: #334155; }
                </style>
            </head>
            <body>
                <div class="header-container">
                    <div>
                        <div class="company-title">${company?.name || 'INDUSTRIAS GAREND S.A.'}</div>
                        <div class="company-sub">
                            Cédula Jurídica: ${company?.taxId || '3-101-133082'}<br/>
                            ${company?.address || 'Alajuela, Costa Rica'}<br/>
                            Tel: ${company?.phone || '+506 2458-4343'} | Email: ${company?.email || 'ventas@industriasgarend.com'}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div class="doc-badge">${motivoTitle}</div>
                        <div class="doc-number">#${doc.boleta_numero || doc.documento_numero}</div>
                        <div class="doc-date">Fecha Registro: ${new Date(doc.fecha_registro).toLocaleDateString('es-CR')} ${new Date(doc.fecha_registro).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-card">
                        <div class="info-card-title">Datos del Destinatario / Cliente</div>
                        <strong style="font-size: 13px; color: #0f172a;">${doc.cliente_nombre}</strong><br/>
                        <span style="color: #64748b; font-weight: 600;">ID Cliente: ${doc.cliente_id}</span><br/>
                        ${originalDocRef ? `
                            <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                                <span style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700;">Documento Base / ERP:</span><br/>
                                <span style="display: inline-block; font-family: monospace; font-size: 13px; font-weight: 900; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; margin-top: 2px;">
                                    📄 #${originalDocRef}
                                </span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="info-card">
                        <div class="info-card-title">Control y Trazabilidad Operativa</div>
                        <strong>Solicitado Por:</strong> ${doc.creado_por}<br/>
                        <strong>Autorizado Por:</strong> ${doc.autorizado_por || 'Pendiente de Autorización'}<br/>
                        <strong>Estado Actual:</strong> <span style="font-weight: 800; color: #0284c7;">${doc.estado.toUpperCase()}</span>
                    </div>
                </div>

                ${doc.comentario ? `
                    <div class="notes-box">
                        <strong>📌 Comentarios / Observaciones de Alistamiento:</strong><br/>
                        ${doc.comentario}
                    </div>
                ` : ''}

                <table>
                    <thead>
                        <tr>
                            <th style="width: 120px;">Código</th>
                            <th>Descripción del Producto</th>
                            <th style="text-align: center; width: 130px;">Cant. Unidades</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linesHtml.length > 0 ? linesHtml : '<tr><td colspan="3" style="text-align:center; padding: 16px; color: #94a3b8;">Sin productos registrados en el detalle.</td></tr>'}
                    </tbody>
                </table>

                <div class="sig-section">
                    <div class="sig-box">
                        <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 2px;">${doc.creado_por || 'Usuario Solicitante'}</div>
                        <div class="sig-line">Solicitado Por</div>
                        <div style="color: #64748b; font-size: 9px; margin-top: 3px;">Generó la Boleta</div>
                    </div>
                    <div class="sig-box">
                        <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 2px;">${doc.autorizado_por || 'Pendiente de Aprobación'}</div>
                        <div class="sig-line">Aprobado Por (Jefatura / Supervisión)</div>
                        <div style="color: #64748b; font-size: 9px; margin-top: 3px;">${doc.fecha_autorizacion ? `Autorizado el ${new Date(doc.fecha_autorizacion).toLocaleDateString('es-CR')} ${new Date(doc.fecha_autorizacion).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}` : 'Firma & Autorización'}</div>
                    </div>
                    <div class="sig-box">
                        <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 2px;">Bodega / Despacho</div>
                        <div class="sig-line">Alistado & Recibido Bodega</div>
                        <div style="color: #64748b; font-size: 9px; margin-top: 3px;">Firma & Fecha Entregado</div>
                    </div>
                </div>
            </body>
            </html>
        `;

        return { success: true, html };
    } catch (e: any) {
        logError('Error generating boleta print html:', e.message);
        return { success: false, error: e.message };
    }
}


