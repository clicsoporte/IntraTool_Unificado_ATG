/**
 * @fileoverview Server-side actions for the new Operations Delivery Monitor v2.1 module.
 * Handlers for settings, daily operations, queue management, concurrent locking, and Telegram bot linkages.
 */
"use server";

import { getDb, getAllSalespersons, getGeographyData, saveGeographyData } from '@/modules/core/lib/db';
import { getBusinessDateStr } from '@/modules/core/lib/timezone';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import { revalidatePath } from 'next/cache';
import { logInfo, logWarn, logError } from '@/modules/core/lib/logger';
import { sendEmail } from '@/modules/core/lib/email-service';
import fs from 'fs';
import path from 'path';
import { updateDeliveryStatusInternal, getDocumentLinesInternal } from './delivery-service';

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
            notificaciones_ruta_emails: 'logistica@empresa.com'
        };
        const settings: Record<string, string> = { ...defaults };
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        return settings;
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
        const stmt = db.prepare('INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES (?, ?)');
        const transaction = db.transaction((data) => {
            for (const [key, value] of Object.entries(data)) {
                stmt.run(key, String(value));
            }
        });
        transaction(settings);
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
        return db.prepare('SELECT * FROM ops_delivery_routes ORDER BY name ASC').all();
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
        return rows;
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

        // Query assigned deliveries for specific date (including returned ones)
        const deliveries = db.prepare(`
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
            WHERE a.fecha = ?
            ORDER BY q.fecha_registro DESC
        `).all(dateString);

        return { assignments, deliveries };
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
): Promise<{ success: boolean; consecutivo?: string; error?: string }> {
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

        // 2. Generate consecutive
        const prefixRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'route_consecutive_prefix'").get() as { value: string } | undefined;
        const nextRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'route_consecutive_next'").get() as { value: string } | undefined;

        const prefix = prefixRow?.value || 'RUT-';
        const nextNum = parseInt(nextRow?.value || '1', 10);
        const consecutivo = `${prefix}${String(nextNum).padStart(6, '0')}`;

        // 3. Update next counter
        db.prepare("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('route_consecutive_next', ?)").run(String(nextNum + 1));

        // 4. Update assignment
        db.prepare(`
            UPDATE ops_delivery_assignments
            SET activa = 0, fecha_completada = ?, consecutivo = ?, latitud_llegada = ?, longitud_llegada = ?, siguiente_cliente = NULL, siguiente_cliente_fecha = NULL
            WHERE id = ?
        `).run(nowStr, consecutivo, lat, lng, assignmentId);

        // 5. Reset remaining pending documents to general queue (marking their devolucion_asignacion_id)
        db.prepare(`
            UPDATE ops_delivery_queue 
            SET devolucion_asignacion_id = asignacion_id, asignacion_id = NULL, estado = 'pendiente', canal_registro = 'web', gestionado_por = ?
            WHERE asignacion_id = ? AND entregado = 0
        `).run(closedBy, assignmentId);

        // Update local object for rendering
        assignment.fecha_completada = nowStr;

        // 6. Query processed deliveries
        const deliveries = db.prepare(`
            SELECT * FROM ops_delivery_queue 
            WHERE asignacion_id = ? OR (devolucion_asignacion_id = ? AND estado IN ('incompleto', 'rechazado'))
            ORDER BY fecha_entrega ASC
        `).all(assignmentId, assignmentId) as any[];

        // 7. Compile HTML report
        const htmlReport = generateRouteSheetHtml(consecutivo, assignment, deliveries, db);

        // 8. Dispatch Email
        const emailSettingsRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'notificaciones_ruta_emails'").get() as { value: string } | undefined;
        const emailSettingEnabled = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'notificaciones_email'").get() as { value: string } | undefined;
        
        const enabled = emailSettingEnabled ? emailSettingEnabled.value === 'true' : true;
        const emailsStr = emailSettingsRow?.value || 'logistica@empresa.com';

        if (enabled && emailsStr) {
            const emailList = emailsStr.split(',').map(e => e.trim()).filter(e => e.length > 0);
            if (emailList.length > 0) {
                const subject = `📋 Hoja de Ruta Finalizada - Consecutivo #${consecutivo} - ${assignment.ruta_nombre}`;
                await sendEmail({
                    to: emailList,
                    subject,
                    html: htmlReport
                });
                logInfo(`Sent route sheet email for assignment ${assignmentId} consecutive ${consecutivo} to ${emailList.join(', ')}`);
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
}): Promise<any[]> {
    const db = await getDb();
    try {
        let sql = `
            SELECT 
                a.*,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                v.brand as vehiculo_marca,
                v.model as vehiculo_modelo,
                (SELECT COUNT(*) FROM ops_delivery_queue q WHERE q.asignacion_id = a.id) as total_entregas
            FROM ops_delivery_assignments a
            JOIN ops_delivery_routes r ON a.ruta_id = r.id
            JOIN core_users u ON a.empleado_id = u.id
            JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            WHERE a.consecutivo IS NOT NULL
        `;
        const params: any[] = [];

        if (filters.startDate) {
            sql += ` AND DATE(a.fecha_completada) >= ?`;
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            sql += ` AND DATE(a.fecha_completada) <= ?`;
            params.push(filters.endDate);
        }
        if (filters.routeId) {
            sql += ` AND a.ruta_id = ?`;
            params.push(Number(filters.routeId));
        }
        if (filters.driverId) {
            sql += ` AND a.empleado_id = ?`;
            params.push(Number(filters.driverId));
        }
        if (filters.query) {
            sql += ` AND (a.consecutivo LIKE ? OR u.name LIKE ?)`;
            params.push(`%${filters.query}%`, `%${filters.query}%`);
        }

        sql += ` ORDER BY a.fecha_completada DESC`;

        return db.prepare(sql).all(...params);
    } catch (e: any) {
        logError('Error getting finalized routes report:', e.message);
        return [];
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
            WHERE asignacion_id = ? OR (devolucion_asignacion_id = ? AND estado IN ('incompleto', 'rechazado'))
            ORDER BY fecha_entrega ASC
        `).all(assignmentId, assignmentId) as any[];

        const html = generateRouteSheetHtml(assignment.consecutivo, assignment, deliveries, db);
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
            WHERE asignacion_id = ? OR (devolucion_asignacion_id = ? AND estado IN ('incompleto', 'rechazado'))
            ORDER BY fecha_entrega ASC
        `).all(assignmentId, assignmentId) as any[];

        const htmlReport = generateRouteSheetHtml(assignment.consecutivo, assignment, deliveries, db);

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

function generateRouteSheetHtml(
    consecutivo: string,
    assignment: any,
    deliveries: any[],
    db: any
): string {
    const companyName = 'Industrias Garend S.A.';
    const companyTaxId = '3-101-133082';
    const companyAddress = 'Alajuela, Poás, Carrillos bajo, del EBAIS 700 oeste.';
    const companyPhone = '+506 2458-4343';
    const companyEmail = 'ventas@industriasgarend.com';

    const dateStr = new Date(assignment.fecha_completada || assignment.fecha || Date.now()).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
    const timeStr = new Date(assignment.fecha_completada || assignment.fecha || Date.now()).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' });

    let rowsHtml = '';
    if (deliveries.length === 0) {
        rowsHtml = `
            <tr>
                <td colspan="5" style="padding: 12px; text-align: center; color: #64748b; font-style: italic;">
                    No se registraron entregas procesadas en esta ruta.
                </td>
            </tr>
        `;
    } else {
        deliveries.forEach((d) => {
            let statusLabel = 'Completo';
            let statusColor = '#10b981';
            let statusBg = '#d1fae5';

            if (d.estado === 'incompleto') {
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
            try {
                const header = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(d.documento_numero) as { DIREC_EMBARQUE: string | null } | undefined;
                const code = (header?.DIREC_EMBARQUE || 'ND').trim();
                if (code !== 'ND') {
                    const addrRow = db.prepare('SELECT descripcion, detalle_direccion FROM core_customer_shipment_addresses WHERE cliente_id = ? AND direccion_id = ? LIMIT 1').get(d.cliente_id, code) as { descripcion: string | null, detalle_direccion: string | null } | undefined;
                    const desc = addrRow?.descripcion || addrRow?.detalle_direccion || '';
                    addressText = `${code}${desc ? ` - ${desc}` : ''}`;
                }
            } catch (e) {}

            const deliveryTime = d.fecha_entrega ? new Date(d.fecha_entrega).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }) : 'N/D';

            rowsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px; font-size: 13px; color: #1e293b;">${deliveryTime}</td>
                    <td style="padding: 10px; font-size: 13px; color: #1e293b;">
                        <strong>${d.cliente_nombre}</strong><br/>
                        <span style="font-size: 11px; color: #64748b;">ID: ${d.cliente_id}</span>
                    </td>
                    <td style="padding: 10px; font-size: 13px; color: #0f172a; font-family: monospace; font-weight: bold;">${d.documento_numero}</td>
                    <td style="padding: 10px; font-size: 12px; color: #475569;">${addressText}</td>
                    <td style="padding: 10px; text-align: center;">
                        <span style="display: inline-block; padding: 4px 8px; border-radius: 9999px; font-size: 11px; font-weight: bold; color: ${statusColor}; background-color: ${statusBg};">
                            ${statusLabel}
                        </span>
                    </td>
                </tr>
            `;
        });
    }

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Hoja de Ruta - ${consecutivo}</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b;">
        <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            
            <!-- Cabecera de la Empresa -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr>
                    <td style="width: 60%; vertical-align: top;">
                        <h2 style="margin: 0; color: #1e3a8a; font-size: 22px; font-weight: bold;">${companyName}</h2>
                        <p style="margin: 4px 0; font-size: 12px; color: #475569;">Cédula Jurídica: ${companyTaxId}</p>
                        <p style="margin: 2px 0; font-size: 12px; color: #475569;">Dirección: ${companyAddress}</p>
                        <p style="margin: 2px 0; font-size: 12px; color: #475569;">Tel: ${companyPhone} | Email: ${companyEmail}</p>
                    </td>
                    <td style="width: 40%; text-align: right; vertical-align: top;">
                        <div style="display: inline-block; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px 18px; text-align: right;">
                            <span style="font-size: 11px; font-weight: bold; color: #1e40af; text-transform: uppercase; display: block; margin-bottom: 4px;">HOJA DE RUTA</span>
                            <span style="font-size: 18px; font-weight: bold; color: #1d4ed8; font-family: monospace;">${consecutivo}</span>
                            <span style="font-size: 12px; color: #475569; display: block; margin-top: 6px;">Fecha: ${dateStr} ${timeStr}</span>
                        </div>
                    </td>
                </tr>
            </table>

            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;"/>

            <!-- Datos Generales de la Ruta -->
            <h3 style="margin: 0 0 12px 0; color: #1e3a8a; font-size: 15px; text-transform: uppercase; border-left: 4px solid #3b82f6; padding-left: 8px;">
                Información del Viaje
            </h3>
            <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 25px;">
                <tr>
                    <td style="padding: 10px; font-size: 13px; color: #475569; border-bottom: 1px solid #e2e8f0; width: 25%;"><strong>Ruta:</strong></td>
                    <td style="padding: 10px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; width: 25%;">${assignment.ruta_nombre}</td>
                    <td style="padding: 10px; font-size: 13px; color: #475569; border-bottom: 1px solid #e2e8f0; width: 25%;"><strong>Chofer:</strong></td>
                    <td style="padding: 10px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; width: 25%;">${assignment.chofer_nombre}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; font-size: 13px; color: #475569; width: 25%;"><strong>Vehículo / Placa:</strong></td>
                    <td style="padding: 10px; font-size: 13px; color: #0f172a; width: 25%;">${assignment.vehiculo_marca} ${assignment.vehiculo_modelo} (${assignment.vehiculo_placa})</td>
                    <td style="padding: 10px; font-size: 13px; color: #475569; width: 25%;"><strong>Fecha Cierre:</strong></td>
                    <td style="padding: 10px; font-size: 13px; color: #0f172a;">${dateStr}</td>
                </tr>
            </table>

            <!-- Listado de Entregas -->
            <h3 style="margin: 0 0 12px 0; color: #1e3a8a; font-size: 15px; text-transform: uppercase; border-left: 4px solid #3b82f6; padding-left: 8px;">
                Resumen de Entregas Realizadas
            </h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                        <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: bold; color: #475569;">Hora</th>
                        <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: bold; color: #475569;">Cliente</th>
                        <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: bold; color: #475569;">N° Factura</th>
                        <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: bold; color: #475569;">Dirección (EMB)</th>
                        <th style="padding: 10px; text-align: center; font-size: 12px; font-weight: bold; color: #475569;">Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <!-- Espacio de Firmas -->
            <table style="width: 100%; border-collapse: collapse; margin-top: 40px;">
                <tr>
                    <td style="width: 45%; text-align: center; padding-top: 30px; border-top: 1px solid #cbd5e1; font-size: 12px; color: #475569;">
                        <strong>Firma Chofer</strong><br/>
                        ${assignment.chofer_nombre}
                    </td>
                    <td style="width: 10%;"></td>
                    <td style="width: 45%; text-align: center; padding-top: 30px; border-top: 1px solid #cbd5e1; font-size: 12px; color: #475569;">
                        <strong>Recibido Transportes</strong><br/>
                        Firma y Sello
                    </td>
                </tr>
            </table>

            <div style="margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                Este es un reporte automático generado por el sistema de logística Clic-Tools en cumplimiento con las normas ISO 9001.
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
        // Returns pending, unassigned delivery documents (including returns 'D' for visual reference, but they are excluded from routing in the UI)
        return db.prepare(`
            SELECT q.*, c.phone as cliente_telefono
            FROM ops_delivery_queue q
            LEFT JOIN core_customers c ON q.cliente_id = c.id
            WHERE q.entregado = 0 AND q.asignacion_id IS NULL
            ORDER BY q.fecha_registro DESC
        `).all();
    } catch (e: any) {
        logError('Error getting general delivery queue:', e.message);
        return [];
    }
}

export async function getAssignedDeliveriesToday(includeCompleted = false): Promise<any[]> {
    const db = await getDb();
    try {
        const todayStr = await getBusinessDateStr();
        // Joins queue docs with daily assignments (either active or closed where they got returned)
        return db.prepare(`
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
    await authorizeAction('deliveries:write');
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
                    entregado = 0, fecha_entrega = null, release_code_id = null, 
                    foto_evidencia = null, foto_factura = null, latitud = null, longitud = null
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
                const thresholdStr = dateThreshold.toISOString().split('T')[0];
                
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

        const transaction = db.transaction(() => {
            // A. Import from active ERP Invoices (Both F and D)
            const erpInvoices = db.prepare(`
                SELECT FACTURA, CLIENTE, NOMBRE_CLIENTE, USUARIO, FECHA, TIPO_DOCUMENTO, FACTURA_ORIGINAL, PEDIDO
                FROM core_erp_invoice_headers
                WHERE ${whereInvoices}
            `).all(...paramsInvoices) as any[];

            const insertInvoice = db.prepare(`
                INSERT INTO ops_delivery_queue (documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por, fecha_registro, estado, entregado, tipo_documento_erp, factura_original)
                VALUES (?, 'factura', ?, ?, ?, ?, 'pendiente', 0, ?, ?)
            `);

            const checkInvoiceExists = db.prepare('SELECT 1 FROM ops_delivery_queue WHERE documento_numero = ? AND tipo_documento = \'factura\'');
            const getOrderCreator = db.prepare('SELECT USUARIO FROM core_erp_order_headers WHERE PEDIDO = ?');

            for (const inv of erpInvoices) {
                const exists = checkInvoiceExists.get(inv.FACTURA);
                if (!exists) {
                    let orderCreator = null;
                    if (inv.PEDIDO) {
                        const order = getOrderCreator.get(inv.PEDIDO) as { USUARIO: string } | undefined;
                        if (order?.USUARIO) {
                            orderCreator = order.USUARIO;
                        }
                    }
                    const finalCreator = orderCreator || inv.USUARIO || 'ERP_SYNC';

                    insertInvoice.run(
                        inv.FACTURA, 
                        inv.CLIENTE, 
                        inv.NOMBRE_CLIENTE || 'Cliente ERP', 
                        finalCreator, 
                        inv.FECHA || new Date().toISOString().split('T')[0],
                        inv.TIPO_DOCUMENTO || 'F',
                        inv.FACTURA_ORIGINAL || null
                    );
                    addedCount++;
                }
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
                        insertOrder.run(ord.PEDIDO, ord.CLIENTE, cust?.name || 'Cliente ERP', ord.USUARIO || 'ERP_SYNC', ord.FECHA_PEDIDO || new Date().toISOString().split('T')[0]);
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
        return db.prepare(`
            SELECT id, name 
            FROM core_users 
            WHERE employeeId IN (
                SELECT value FROM fleet_settings WHERE category = 'driver'
            )
            ORDER BY name ASC
        `).all();
    } catch (e: any) {
        logError('Error getting drivers:', e.message);
        return [];
    }
}

export async function getVehicles(): Promise<any[]> {
    const db = await getDb();
    try {
        return db.prepare('SELECT id, plate, brand, model FROM fleet_vehicles ORDER BY plate ASC').all();
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

                        if (salespersonCode) {
                            const spData = db.prepare('SELECT ACTIVO FROM core_salespersons WHERE VENDEDOR = ?').get(salespersonCode) as { ACTIVO: string } | undefined;
                            if (!spData || spData.ACTIVO !== 'N') {
                                const spUser = db.prepare('SELECT id, email, employeeId FROM core_users WHERE salespersonId = ?').get(salespersonCode) as { id: string, email: string, employeeId: string | null } | undefined;
                                if (spUser && spUser.email) {
                                    let spActive = true;
                                    if (spUser.employeeId) {
                                        const empData = db.prepare('SELECT ACTIVO FROM core_employees WHERE EMPLEADO = ?').get(spUser.employeeId) as { ACTIVO: string } | undefined;
                                        if (empData && empData.ACTIVO === 'N') {
                                            spActive = false;
                                        }
                                    }
                                    if (spActive) {
                                        const spPref = db.prepare("SELECT value FROM core_user_preferences WHERE userId = ? AND key = 'ops_delivery_notifications_enabled'").get(spUser.id) as { value: string } | undefined;
                                        const isEnabled = spPref ? (spPref.value === 'true' || spPref.value === '1') : true;
                                        if (isEnabled) {
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
                            const creatorUser = db.prepare('SELECT id, email, employeeId, salespersonId FROM core_users WHERE erpAlias = ?').get(erpAlias) as { id: string, email: string, employeeId: string | null, salespersonId: string | null } | undefined;
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

        return JSON.parse(JSON.stringify({
            activeTrucks,
            gpsPaths,
            deliveryMarkers
        }));
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
        return rows;
    } catch (e: any) {
        logError('Error fetching system users:', e.message);
        return [];
    }
}

// --- Create Collect Request Action ---
export async function createCollectRequestAction(
    supplierName: string,
    formData: {
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
    }
): Promise<{ success: boolean; consecutive?: string; error?: string }> {
    await authorizeAction('deliveries:collect');
    const db = await getDb();
    try {
        const localTodayStr = await getBusinessDateStr();
        
        // Transaction to safely generate and increment consecutive number
        const consecutive = db.transaction(() => {
            const prefixRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'collect_consecutive_prefix'").get() as { value: string } | undefined;
            const nextRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'collect_consecutive_next'").get() as { value: string } | undefined;
            
            const prefix = prefixRow?.value || 'REC-';
            const nextVal = parseInt(nextRow?.value || '1', 10);
            
            const cons = `${prefix}${String(nextVal).padStart(6, '0')}`;
            
            db.prepare("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('collect_consecutive_next', ?)").run(String(nextVal + 1));
            return cons;
        })();

        const notes = JSON.stringify(formData);
        
        db.prepare(`
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
            ) VALUES (?, 'recoger', 'PROV_MANUAL', ?, ?, ?, 'pendiente', 0, ?)
        `).run(
            consecutive,
            supplierName,
            formData.solicitante_nombre,
            localTodayStr,
            notes
        );

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
            details = JSON.parse(doc.comentario);
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
            details = JSON.parse(doc.comentario);
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
    } catch (e: any) {
        logError('Error triggering collect update email:', e.message);
    }
}

// --- Client Emails & Document Discarding Actions ---

import { CORE_TABLE_NAMES } from '@/modules/core/lib/schema';

export async function getClientEmails(clienteId: string): Promise<string[]> {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT email FROM ops_client_emails WHERE cliente_id = ? ORDER BY created_at DESC').all(clienteId) as { email: string }[];
        return rows.map(r => r.email);
    } catch (e: any) {
        logError('Error getting client emails:', e.message);
        return [];
    }
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
            parsedDetails = JSON.parse(doc.comentario);
        } catch(e) {}

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
        
        let formattedMotivo = doc.comentario || 'Ninguno';
        if (doc.tipo_documento === 'recoger' && Object.keys(parsedDetails).length > 0) {
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
        // Prevent stylesheet code from ever displaying physically on screen
        body = body.replace('<style>', '<style>style { display: none !important; } ');

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

        return { success: true, html: body };
    } catch (e: any) {
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
            SELECT id, documento_numero, cliente_nombre, creado_por, fecha_registro, estado, entregado, comentario, asignacion_id, foto_factura, foto_evidencia
            FROM ops_delivery_queue
            WHERE tipo_documento = 'recoger'
        `;
        const params: any[] = [];
        
        if (options?.startDate) {
            query += ` AND fecha_registro >= ?`;
            params.push(options.startDate);
        }
        if (options?.endDate) {
            query += ` AND fecha_registro <= ?`;
            params.push(options.endDate);
        }
        
        query += ` ORDER BY id DESC`;
        
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

        return {
            requests: paginatedRows,
            totalCount,
            page,
            totalPages
        };
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
