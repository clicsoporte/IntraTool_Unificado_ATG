'use server';

import { getDb } from '@/modules/core/lib/db';
import { getBusinessDateStr } from '@/modules/core/lib/timezone';
import { getCurrentUser } from '@/modules/core/lib/auth';
import { updateDeliveryStatusInternal, getDocumentLinesInternal } from './delivery-service';
import { saveTelegramMaintenanceLog } from '@/modules/fleet/lib/telegram-bot';
import { fetchNavixyLiveTelemetry } from '@/modules/fleet/lib/gps-service';
import { revalidatePath } from 'next/cache';

/**
 * Retrieves the currently logged-in user's active route assignment for today.
 */
export async function getDriverActiveAssignmentAction() {
  const user = await getCurrentUser();
  if (!user) return null;

  const db = await getDb();
  const todayStr = await getBusinessDateStr();

  try {
    const assignment = db.prepare(`
      SELECT 
        a.*,
        r.name as ruta_nombre,
        v.plate as vehiculo_placa,
        v.brand as vehiculo_marca,
        v.model as vehiculo_modelo
      FROM ops_delivery_assignments a
      JOIN ops_delivery_routes r ON a.ruta_id = r.id
      JOIN fleet_vehicles v ON a.vehiculo_id = v.id
      WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
      LIMIT 1
    `).get(user.id, todayStr) as any;

    if (!assignment) return null;

    // Get documents queued for this assignment
    const pendingDocs = db.prepare(`
      SELECT * FROM ops_delivery_queue
      WHERE asignacion_id = ? AND entregado = 0
      ORDER BY id ASC
    `).all(assignment.id) as any[];

    const completedDocs = db.prepare(`
      SELECT * FROM ops_delivery_queue
      WHERE asignacion_id = ? AND entregado = 1
      ORDER BY fecha_entrega DESC
    `).all(assignment.id) as any[];

    return JSON.parse(JSON.stringify({
      assignment,
      pendingDocs,
      completedDocs
    }));
  } catch (error: any) {
    console.error("Error in getDriverActiveAssignmentAction:", error);
    return null;
  }
}

/**
 * Gets available routes and vehicles for starting a new route assignment.
 */
export async function getDriverAvailableRoutesAndVehiclesAction() {
  const db = await getDb();
  try {
    const routes = db.prepare("SELECT * FROM ops_delivery_routes WHERE active = 1 ORDER BY name ASC").all();
    const vehicles = db.prepare("SELECT * FROM fleet_vehicles ORDER BY plate ASC").all();
    return JSON.parse(JSON.stringify({ routes, vehicles }));
  } catch (error) {
    console.error("Error fetching routes/vehicles:", error);
    return { routes: [], vehicles: [] };
  }
}

/**
 * Starts a new route assignment for the driver today.
 */
export async function startDriverRouteAction(rutaId: number, vehiculoId: number, lat?: number, lng?: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");

  const db = await getDb();
  const todayStr = await getBusinessDateStr();
  const now = new Date().toISOString();

  try {
    // Check if user already has an active assignment
    const existing = db.prepare("SELECT id FROM ops_delivery_assignments WHERE empleado_id = ? AND fecha = ? AND activa = 1").get(user.id, todayStr);
    if (existing) {
      throw new Error("Ya tienes una ruta activa registrada para hoy.");
    }

    // Check if vehicle is already in use by another driver today
    const vehicleInUse = db.prepare(`
      SELECT a.id, u.name as chofer_nombre, v.plate
      FROM ops_delivery_assignments a
      JOIN core_users u ON a.empleado_id = u.id
      JOIN fleet_vehicles v ON a.vehiculo_id = v.id
      WHERE a.vehiculo_id = ? AND a.fecha = ? AND a.activa = 1 AND a.empleado_id != ?
    `).get(vehiculoId, todayStr, user.id) as any;

    if (vehicleInUse) {
      throw new Error(`El vehículo (${vehicleInUse.plate}) ya está siendo utilizado hoy por ${vehicleInUse.chofer_nombre}.`);
    }

    const info = db.prepare(`
      INSERT INTO ops_delivery_assignments (
        ruta_id, empleado_id, vehiculo_id, fecha, activa, fecha_creacion, latitud_inicio, longitud_inicio
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(rutaId, user.id, vehiculoId, todayStr, now, lat || null, lng || null);

    revalidatePath('/dashboard/operations/logistics/driver');
    revalidatePath('/dashboard/operations/logistics/deliveries');
    return { success: true, assignmentId: Number(info.lastInsertRowid) };
  } catch (error: any) {
    console.error("Error starting route:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Marks departure to route (Salir a Ruta) capturing timestamp and GPS.
 */
export async function departDriverRouteAction(assignmentId: number, lat?: number, lng?: number) {
  const db = await getDb();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      UPDATE ops_delivery_assignments
      SET fecha_salida = ?
      WHERE id = ?
    `).run(now, assignmentId);

    // Save GPS log if coordinates present
    if (lat && lng) {
      db.prepare(`
        INSERT INTO ops_delivery_gps_logs (asignacion_id, timestamp, latitud, longitud, evento)
        VALUES (?, ?, ?, ?, 'salida_ruta')
      `).run(assignmentId, now, lat, lng);
    }

    revalidatePath('/dashboard/operations/logistics/driver');
    return { success: true };
  } catch (error: any) {
    console.error("Error departing route:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Autoloads one or multiple invoice/order documents (separated by commas or spaces) to the active route assignment.
 */
export async function autoloadInvoiceAction(assignmentId: number, docNumStr: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");

  const db = await getDb();
  const todayStr = await getBusinessDateStr();

  // Split input by commas, semicolons or spaces to allow multi-invoice entry
  const tokens = docNumStr
    .split(/[,;\s]+/)
    .map(t => t.trim().toUpperCase())
    .filter(t => t.length > 0);

  if (tokens.length === 0) {
    throw new Error("Por favor ingresa al menos un número de factura o pedido.");
  }

  const loadedDocs: string[] = [];
  const skippedDelivered: string[] = [];
  const skippedOtherRoute: string[] = [];
  const notFoundTokens: string[] = [];

  try {
    for (const token of tokens) {
      // 0. Pre-verificación: Si ya fue entregado / completado, registrar y omitir para procesar las demás
      const alreadyDelivered = db.prepare(`
        SELECT q.documento_numero, q.fecha_entrega, q.gestionado_por, u.name as chofer_nombre
        FROM ops_delivery_queue q
        LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id
        LEFT JOIN core_users u ON a.empleado_id = u.id
        WHERE (UPPER(q.documento_numero) = ? OR UPPER(q.documento_numero) LIKE ?) AND (q.entregado = 1 OR q.estado = 'completo')
        ORDER BY q.id DESC LIMIT 1
      `).get(token, `%${token}`) as any;

      if (alreadyDelivered) {
        skippedDelivered.push(alreadyDelivered.documento_numero);
        continue;
      }

      // 1. Check if document exists in queue (exact or ending with / containing token)
      let queueDoc = db.prepare(`
        SELECT q.*, a.empleado_id, u.name as chofer_nombre
        FROM ops_delivery_queue q
        LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id AND a.activa = 1
        LEFT JOIN core_users u ON a.empleado_id = u.id
        WHERE (UPPER(q.documento_numero) = ? OR UPPER(q.documento_numero) LIKE ?) AND q.entregado = 0
        ORDER BY CASE WHEN UPPER(q.documento_numero) = ? THEN 1 ELSE 2 END, q.id DESC
        LIMIT 1
      `).get(token, `%${token}`, token) as any;

      if (!queueDoc && token.length >= 3) {
        queueDoc = db.prepare(`
          SELECT q.*, a.empleado_id, u.name as chofer_nombre
          FROM ops_delivery_queue q
          LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id AND a.activa = 1
          LEFT JOIN core_users u ON a.empleado_id = u.id
          WHERE UPPER(q.documento_numero) LIKE ? AND q.entregado = 0
          ORDER BY q.id DESC
          LIMIT 1
        `).get(`%${token}%`) as any;
      }

      if (queueDoc) {
        // Si el documento ya está asignado a otra ruta activa de otro chofer, no permitir robarlo
        if (queueDoc.asignacion_id && queueDoc.asignacion_id !== assignmentId && queueDoc.empleado_id) {
          skippedOtherRoute.push(`${queueDoc.documento_numero} (Ruta de ${queueDoc.chofer_nombre || 'otro chofer'})`);
          continue;
        }

        db.prepare("UPDATE ops_delivery_queue SET asignacion_id = ?, estado = 'en_ruta', devolucion_asignacion_id = NULL WHERE id = ?").run(assignmentId, queueDoc.id);
        loadedDocs.push(queueDoc.documento_numero);
        continue;
      }

      // 2. Try finding document in ERP Invoice headers (exact or ending with / containing token) cruzando con Pedidos
      let erpInvoice = db.prepare(`
        SELECT 
          h.FACTURA, 
          h.CLIENTE, 
          h.NOMBRE_CLIENTE, 
          h.VENDEDOR, 
          h.USUARIO as FACTURADOR,
          o.USUARIO as CREADOR_PEDIDO
        FROM core_erp_invoice_headers h
        LEFT JOIN core_erp_order_headers o ON (
          (h.PEDIDO IS NOT NULL AND h.PEDIDO <> '' AND h.PEDIDO = o.PEDIDO)
          OR (h.PEDIDO IS NOT NULL AND h.PEDIDO <> '' AND TRIM(h.PEDIDO) = TRIM(o.PEDIDO))
        )
        WHERE UPPER(h.FACTURA) = ? OR UPPER(h.FACTURA) LIKE ?
        ORDER BY CASE WHEN UPPER(h.FACTURA) = ? THEN 1 ELSE 2 END, h.FACTURA DESC
        LIMIT 1
      `).get(token, `%${token}`, token) as any;

      if (!erpInvoice && token.length >= 3) {
        erpInvoice = db.prepare(`
          SELECT 
            h.FACTURA, 
            h.CLIENTE, 
            h.NOMBRE_CLIENTE, 
            h.VENDEDOR, 
            h.USUARIO as FACTURADOR,
            o.USUARIO as CREADOR_PEDIDO
          FROM core_erp_invoice_headers h
          LEFT JOIN core_erp_order_headers o ON (
            (h.PEDIDO IS NOT NULL AND h.PEDIDO <> '' AND h.PEDIDO = o.PEDIDO)
            OR (h.PEDIDO IS NOT NULL AND h.PEDIDO <> '' AND TRIM(h.PEDIDO) = TRIM(o.PEDIDO))
          )
          WHERE UPPER(h.FACTURA) LIKE ?
          ORDER BY h.FACTURA DESC
          LIMIT 1
        `).get(`%${token}%`) as any;
      }

      if (erpInvoice) {
        const finalCreator = (erpInvoice.CREADOR_PEDIDO && String(erpInvoice.CREADOR_PEDIDO).trim())
          ? String(erpInvoice.CREADOR_PEDIDO).trim()
          : ((erpInvoice.VENDEDOR && String(erpInvoice.VENDEDOR).trim())
            ? String(erpInvoice.VENDEDOR).trim()
            : (erpInvoice.FACTURADOR || user.name));

        // Verificar si ya existe en cola para evitar duplicados
        const existingInQueue = db.prepare("SELECT id, asignacion_id FROM ops_delivery_queue WHERE UPPER(documento_numero) = ? AND entregado = 0").get(erpInvoice.FACTURA.toUpperCase()) as any;
        if (existingInQueue) {
          if (existingInQueue.asignacion_id && existingInQueue.asignacion_id !== assignmentId) {
            skippedOtherRoute.push(`${erpInvoice.FACTURA} (Asignada a otra ruta)`);
            continue;
          }
          db.prepare("UPDATE ops_delivery_queue SET asignacion_id = ?, estado = 'en_ruta', creado_por = ? WHERE id = ?").run(assignmentId, finalCreator, existingInQueue.id);
        } else {
          db.prepare(`
            INSERT INTO ops_delivery_queue (
              documento_numero, tipo_documento, cliente_id, cliente_nombre, asignacion_id, creado_por, entregado, estado, fecha_registro
            ) VALUES (?, 'factura', ?, ?, ?, ?, 0, 'en_ruta', ?)
          `).run(erpInvoice.FACTURA, erpInvoice.CLIENTE, erpInvoice.NOMBRE_CLIENTE, assignmentId, finalCreator, todayStr);
        }

        loadedDocs.push(erpInvoice.FACTURA);
        continue;
      }

    notFoundTokens.push(token);
    }

    // --- AUDITORÍA FORENSE DE AUTO-CARGA DE FACTURAS ---
    try {
      const assignmentInfo = db.prepare(`
        SELECT a.id, r.name as ruta_nombre, v.plate as vehiculo_placa
        FROM ops_delivery_assignments a
        LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
        LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
        WHERE a.id = ?
      `).get(assignmentId) as any;

      const rutaNombre = assignmentInfo?.ruta_nombre || 'Ruta';
      const placa = assignmentInfo?.vehiculo_placa || '';
      const nowIso = new Date().toISOString();

      const auditLines: string[] = [
        `📋 CARGA DE FACTURAS EN RUTA [${rutaNombre} - Asig #${assignmentId}]`
      ];

      if (loadedDocs.length > 0) {
        auditLines.push(`✓ Facturas cargadas con éxito (${loadedDocs.length}): [${loadedDocs.join(', ')}]`);
      } else {
        auditLines.push(`⚠️ Ninguna factura pudo ser cargada.`);
      }

      if (notFoundTokens.length > 0) {
        auditLines.push(`❌ No encontradas en ERP (${notFoundTokens.length}): [${notFoundTokens.join(', ')}] (Sincronización pendiente o no emitidas)`);
      }
      if (skippedOtherRoute.length > 0) {
        auditLines.push(`⚠️ Ya asignadas a otra ruta (${skippedOtherRoute.length}): [${skippedOtherRoute.join(', ')}]`);
      }
      if (skippedDelivered.length > 0) {
        auditLines.push(`ℹ️ Ya entregadas anteriormente (${skippedDelivered.length}): [${skippedDelivered.join(', ')}]`);
      }

      const fullAuditMsg = auditLines.join(' | ');

      // 1. Guardar en ops_driver_logs para el visor de Registros APK
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

      const logCategory = (notFoundTokens.length > 0 || skippedOtherRoute.length > 0) ? 'carga_facturas_alerta' : 'carga_facturas';
      const logLevel = notFoundTokens.length > 0 ? 'WARNING' : 'SUCCESS';

      db.prepare(`
        INSERT INTO ops_driver_logs (
          user_id, user_name, chofer_nombre, chofer_telefono,
          ruta_nombre, placa_vehiculo, level, category, message, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        user.name,
        user.name,
        user.phone || '',
        rutaNombre,
        placa,
        logLevel,
        logCategory,
        fullAuditMsg,
        nowIso
      );

      // 2. Guardar en core_audit_logs del sistema central
      const { logWarn, logInfo } = await import('@/modules/core/lib/logger');
      if (notFoundTokens.length > 0 || skippedOtherRoute.length > 0) {
        await logWarn(fullAuditMsg, {
          action: 'AUTOLOAD_INVOICES',
          driver: user.name,
          loadedDocs,
          notFoundTokens,
          skippedOtherRoute,
          skippedDelivered
        });
      } else {
        await logInfo(fullAuditMsg, {
          action: 'AUTOLOAD_INVOICES',
          driver: user.name,
          loadedDocs
        });
      }
    } catch (auditErr: any) {
      console.warn("No se pudo registrar log de auto-carga:", auditErr?.message);
    }

    revalidatePath('/dashboard/operations/logistics/driver');
    revalidatePath('/dashboard/operations/logistics/deliveries');

    if (loadedDocs.length === 0) {
      let errorMsg = 'No se pudo cargar ningún documento.';
      if (skippedDelivered.length > 0) {
        errorMsg = `El/los documento(s) [${skippedDelivered.join(', ')}] ya fueron entregados anteriormente.`;
      } else if (skippedOtherRoute.length > 0) {
        errorMsg = `Documentos ya en otras rutas: ${skippedOtherRoute.join(', ')}`;
      } else if (notFoundTokens.length > 0) {
        errorMsg = `No se encontraron: ${notFoundTokens.join(', ')}`;
      }
      return { success: false, error: errorMsg, loadedDocs: [], skippedDelivered, skippedOtherRoute, notFoundTokens };
    }

    const parts: string[] = [];
    parts.push(`✓ ${loadedDocs.length} factura(s) cargada(s): ${loadedDocs.join(', ')}.`);
    if (skippedDelivered.length > 0) {
      parts.push(`⚠️ Omitida(s) ya entregada(s): ${skippedDelivered.join(', ')}.`);
    }
    if (skippedOtherRoute.length > 0) {
      parts.push(`⚠️ Omitida(s) en otra ruta: ${skippedOtherRoute.join(', ')}.`);
    }
    if (notFoundTokens.length > 0) {
      parts.push(`⚠️ No encontrada(s): ${notFoundTokens.join(', ')}.`);
    }

    return {
      success: true,
      message: parts.join(' '),
      loadedDocs,
      skippedDelivered,
      skippedOtherRoute,
      notFoundTokens
    };
  } catch (error: any) {
    console.error("Error in autoloadInvoiceAction:", error);
    return { success: false, error: error.message || 'Error cargando factura' };
  }
}

/**
 * Processes a document delivery or pickup.
 */
export async function processDriverDeliveryAction(data: {
  id: number;
  estado: 'completo' | 'incompleto' | 'rechazado';
  comentario?: string;
  fotoEvidencia?: string | null;
  fotoFactura?: string | null;
  firmaCliente?: string | null;
  nombreRecibe?: string | null;
  lines?: any[];
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");

  try {
    const res = await updateDeliveryStatusInternal(data.id, {
      ...data,
      canal: 'web',
      gestionadoPor: user.name
    });

    revalidatePath('/dashboard/operations/logistics/driver');
    revalidatePath('/dashboard/operations/logistics/deliveries');
    return res;
  } catch (error: any) {
    console.error("Error processing driver delivery:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Reverts a processed delivery if the driver's route is still active.
 */
export async function revertDeliveryInternal(docId: number) {
  const db = await getDb();
  try {
    const doc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(docId) as any;
    if (!doc) throw new Error('Documento no encontrado.');

    if (doc.asignacion_id) {
      const assignment = db.prepare('SELECT activa FROM ops_delivery_assignments WHERE id = ?').get(doc.asignacion_id) as any;
      if (assignment && assignment.activa === 0) {
        return { 
          success: false, 
          error: 'No se puede revertir la entrega porque la ruta ya ha sido finalizada. Solicite el ajuste desde el Centro de Control de Rutas.' 
        };
      }
    }

    const transaction = db.transaction(() => {
      // 1. Revert queue record status to 'pendiente'
      db.prepare(`
        UPDATE ops_delivery_queue
        SET estado = 'pendiente', comentario = null, canal_registro = null, gestionado_por = null, 
            entregado = 0, fecha_entrega = null, hora_entrega_efectiva = null, tiempo_descarga_min = null,
            boleta_numero = null, release_code_id = null, 
            foto_evidencia = null, foto_factura = null, firma_cliente = null, nombre_recibe = null,
            latitud = null, longitud = null, telegram_lock_at = null, telegram_lock_by = null
        WHERE id = ?
      `).run(docId);

      // 2. Delete delivery lines if any exist
      db.prepare('DELETE FROM ops_delivery_lines WHERE delivery_order_id = ?').run(docId);

      // 3. Delete generated clones if they exist (PARTIAL or RETRY)
      const partialDocNum = doc.documento_numero + '-PARTIAL';
      const retryDocNum = doc.documento_numero + '-RETRY';

      db.prepare(`
        DELETE FROM ops_delivery_queue 
        WHERE documento_numero IN (?, ?) AND entregado = 0 AND estado = 'pendiente'
      `).run(partialDocNum, retryDocNum);
    });

    transaction();
    try {
      revalidatePath('/dashboard/operations/logistics/driver');
      revalidatePath('/dashboard/operations/logistics/deliveries');
    } catch (_) {}
    return { success: true };
  } catch (error: any) {
    console.error("Error reverting driver delivery:", error);
    return { success: false, error: error.message || 'No se pudo revertir la entrega.' };
  }
}

export async function revertDriverDeliveryAction(docId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");
  return revertDeliveryInternal(docId);
}

/**
 * Reports a vehicle breakdown from the driver's mobile portal.
 */
export async function reportDriverBreakdownAction(data: {
  vehicleId: number;
  type: string;
  description: string;
  photo?: string;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");

  try {
    const todayStr = await getBusinessDateStr();
    let savedPhotoPath: string | undefined = undefined;

    if (data.photo && data.photo.startsWith('data:image')) {
      try {
        const { saveBase64ToFleetFile } = await import('@/modules/fleet/lib/files');
        const resPath = await saveBase64ToFleetFile(data.photo, `breakdown_${data.vehicleId}_${Date.now()}.jpg`);
        savedPhotoPath = resPath || undefined;
      } catch (err: any) {
        console.error("Error saving breakdown photo:", err);
      }
    }

    await saveTelegramMaintenanceLog({
      vehicleId: data.vehicleId,
      date: todayStr,
      mileage: 0,
      type: data.type,
      description: data.description + (savedPhotoPath ? ` [Foto: ${savedPhotoPath}]` : ''),
      cost: 0,
      performedBy: user.name
    }, user.name);

    revalidatePath('/dashboard/operations/logistics/driver');
    return { success: true };
  } catch (error: any) {
    console.error("Error reporting driver breakdown:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Marks route return or final arrival to company HQ with official consecutivo generation.
 */
export async function finishDriverRouteAction(assignmentId: number, type: 'return' | 'completion', lat?: number, lng?: number) {
  const user = await getCurrentUser();
  const userName = user?.name || 'Chofer';
  const db = await getDb();
  const now = new Date().toISOString();

  try {
    if (type === 'return') {
      db.prepare(`
        UPDATE ops_delivery_assignments
        SET fecha_inicio_retorno = ?, latitud_retorno = ?, longitud_retorno = ?
        WHERE id = ?
      `).run(now, lat || null, lng || null, assignmentId);
      revalidatePath('/dashboard/operations/logistics/driver');
      revalidatePath('/dashboard/operations/logistics/deliveries');
      return { success: true };
    } else {
      const { finalizeRouteAssignmentInternal } = await import('@/modules/operations/lib/actions');
      const finRes = await finalizeRouteAssignmentInternal(assignmentId, userName, db, lat || null, lng || null);
      revalidatePath('/dashboard/operations/logistics/driver');
      revalidatePath('/dashboard/operations/logistics/deliveries');
      return finRes;
    }
  } catch (error: any) {
    console.error("Error finishing route:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Hybrid location fetcher: Tries Navixy GPS API first for the truck, then browser GPS, then manual.
 */
export async function getHybridLocationAction(vehiclePlate?: string, browserLat?: number, browserLng?: number) {
  try {
    const db = await getDb();
    const primaryRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'fleet_primary_gps_source'").get() as { value: string } | undefined;
    const fallbackRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'fleet_fallback_gps_source'").get() as { value: string } | undefined;

    const primary = primaryRow?.value || 'phone';
    const fallback = fallbackRow?.value || 'navixy';

    const getPhoneGps = () => (browserLat && browserLng) ? { source: 'phone_gps', lat: browserLat, lng: browserLng } : null;

    const getNavixyGps = async () => {
      if (!vehiclePlate) return null;
      try {
        const telemetryList = await fetchNavixyLiveTelemetry();
        const cleanPlate = vehiclePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const truckFix = telemetryList.find(t => String(t.plate).toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanPlate);
        if (truckFix && truckFix.lat && truckFix.lng) {
          return { source: 'navixy_gps', lat: truckFix.lat, lng: truckFix.lng, speed: truckFix.speed, address: truckFix.locationText };
        }
      } catch (_) {}
      return null;
    };

    // 1. Try Primary
    if (primary === 'phone') {
      const res = getPhoneGps();
      if (res) return res;
    } else if (primary === 'navixy') {
      const res = await getNavixyGps();
      if (res) return res;
    }

    // 2. Try Fallback
    if (fallback === 'phone') {
      const res = getPhoneGps();
      if (res) return res;
    } else if (fallback === 'navixy') {
      const res = await getNavixyGps();
      if (res) return res;
    }

    // 3. Last fallback
    return getPhoneGps() || await getNavixyGps() || { source: 'manual', lat: null, lng: null };
  } catch (e: any) {
    console.error("Error fetching hybrid location:", e);
    return {
      source: 'manual',
      lat: browserLat || null,
      lng: browserLng || null
    };
  }
}

/**
 * Gets document lines for discrepancy verification in partial deliveries.
 */
export async function fetchDocumentLinesAction(docNum: string, tipo: 'factura' | 'pedido') {
  try {
    const lines = await getDocumentLinesInternal(docNum, tipo);
    return JSON.parse(JSON.stringify(lines));
  } catch (error) {
    console.error("Error fetching doc lines action:", error);
    return [];
  }
}
