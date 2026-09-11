import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import { getBusinessDateStr } from '@/modules/core/lib/timezone';
import { authenticateFleetRequest } from '@/modules/fleet/lib/fleet-auth-guard';

export async function GET(req: NextRequest) {
  try {
    // Validar autenticación de flota en catálogo de rutas/vehículos
    const authResult = await authenticateFleetRequest(req);
    if ('response' in authResult) {
      return authResult.response;
    }

    const db = await getDb();
    const routes = db.prepare("SELECT id, name FROM ops_delivery_routes WHERE active = 1 ORDER BY name ASC").all();
    const vehicles = db.prepare("SELECT id, plate, brand, model FROM fleet_vehicles ORDER BY plate ASC").all();

    return NextResponse.json({
      success: true,
      routes,
      vehicles
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // [S1 & JWT] Validar token de autenticación en acciones de chofer
    const authResult = await authenticateFleetRequest(req);
    if ('response' in authResult) {
      return authResult.response;
    }

    const body = await req.json();
    const { action, rutaId, vehiculoId, assignmentId, docNumStr, lat, lng, siguienteCliente, finishType } = body;

    // [Anti-IDOR] Priorizar userId del token JWT verificado si está presente
    const effectiveUserId = authResult.user?.userId || (body.userId ? Number(body.userId) : 0);

    const db = await getDb();
    const todayStr = await getBusinessDateStr();
    const now = new Date().toISOString();

    // Helper de validación de propiedad (Ownership Check):
    // Verifica que el assignmentId pertenezca al chofer autenticado (o rol admin)
    const isAuthorizedAssignment = (asgnId: number): boolean => {
      if (!effectiveUserId || effectiveUserId <= 0) return true; // Modo permisivo sin token
      const asgn = db.prepare("SELECT empleado_id FROM ops_delivery_assignments WHERE id = ?").get(asgnId) as any;
      if (!asgn) return false;
      if (asgn.empleado_id === effectiveUserId) return true;
      // Permitir si es rol admin/supervisor
      const user = db.prepare("SELECT role FROM core_users WHERE id = ?").get(effectiveUserId) as any;
      return user && (user.role === 'admin' || user.role === 'supervisor');
    };

    // Helper de validación de propiedad para un documento en cola
    const isAuthorizedDocument = (dId: number): boolean => {
      if (!effectiveUserId || effectiveUserId <= 0) return true;
      const doc = db.prepare(`
        SELECT q.asignacion_id, a.empleado_id 
        FROM ops_delivery_queue q
        LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id
        WHERE q.id = ?
      `).get(dId) as any;
      if (!doc) return false;
      if (!doc.asignacion_id || !doc.empleado_id) return true;
      if (doc.empleado_id === effectiveUserId) return true;
      const user = db.prepare("SELECT role FROM core_users WHERE id = ?").get(effectiveUserId) as any;
      return user && (user.role === 'admin' || user.role === 'supervisor');
    };

    // 1. INICIAR RUTA (Seleccionar Vehículo y Ruta)
    if (action === 'start_route') {
      if (!effectiveUserId || !rutaId || !vehiculoId) {
        return NextResponse.json({ success: false, error: 'Faltan parámetros: userId, rutaId, vehiculoId' }, { status: 400 });
      }

      // Validar si el chofer ya tiene una ruta activa hoy
      const existing = db.prepare("SELECT id FROM ops_delivery_assignments WHERE empleado_id = ? AND fecha = ? AND activa = 1").get(effectiveUserId, todayStr);
      if (existing) {
        return NextResponse.json({ success: true, message: 'Ruta ya activa', assignmentId: (existing as any).id });
      }

      // [Q11] Validar que el vehículo no esté ya asignado y activo con otro chofer hoy
      const vehicleInUse = db.prepare(`
        SELECT a.id, u.name as driver_name, v.plate 
        FROM ops_delivery_assignments a
        LEFT JOIN core_users u ON a.empleado_id = u.id
        LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
        WHERE a.vehiculo_id = ? AND a.fecha = ? AND a.activa = 1 AND a.empleado_id != ?
      `).get(vehiculoId, todayStr, effectiveUserId) as any;

      if (vehicleInUse) {
        return NextResponse.json({ 
          success: false, 
          error: `El vehículo (${vehicleInUse.plate || 'seleccionado'}) ya está en uso activo hoy por el chofer ${vehicleInUse.driver_name || 'otro chofer'}.` 
        }, { status: 400 });
      }

      const info = db.prepare(`
        INSERT INTO ops_delivery_assignments (
          ruta_id, empleado_id, vehiculo_id, fecha, activa, fecha_creacion
        ) VALUES (?, ?, ?, ?, 1, ?)
      `).run(rutaId, effectiveUserId, vehiculoId, todayStr, now);

      return NextResponse.json({
        success: true,
        assignmentId: Number(info.lastInsertRowid),
        message: 'Ruta iniciada correctamente'
      });
    }

    // 2. CARGAR / ESCANEAR FACTURA A LA RUTA
    if (action === 'autoload_invoice') {
      if (!assignmentId || !docNumStr) {
        return NextResponse.json({ success: false, error: 'Faltan parámetros: assignmentId, docNumStr' }, { status: 400 });
      }

      if (!isAuthorizedAssignment(Number(assignmentId))) {
        return NextResponse.json({ success: false, error: 'No está autorizado para modificar una ruta asignada a otro chofer.' }, { status: 403 });
      }

      const tokens = docNumStr.split(/[,;\s]+/).map((t: string) => t.trim().toUpperCase()).filter((t: string) => t.length > 0);
      let loadedCount = 0;
      const loadedTokens: string[] = [];
      const skippedDelivered: string[] = [];
      const skippedOtherRoute: string[] = [];
      const notFoundTokens: string[] = [];

      for (const token of tokens) {
        // [Q12] Coincidencia exacta o parcial solo si el token tiene al menos 4 caracteres para evitar colisiones
        const usePartialLike = token.length >= 4;
        const likePattern = usePartialLike ? `%${token}` : token;

        // 0. Pre-verificación: Si ya fue entregado / completado, registrar y omitir para procesar las demás
        const alreadyDelivered = db.prepare(`
          SELECT q.documento_numero, q.boleta_numero, q.fecha_entrega, q.gestionado_por, u.name as chofer_nombre
          FROM ops_delivery_queue q
          LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id
          LEFT JOIN core_users u ON a.empleado_id = u.id
          WHERE (
            UPPER(q.documento_numero) = ? 
            OR (q.boleta_numero IS NOT NULL AND UPPER(q.boleta_numero) = ?)
            OR (q.referencia_doc IS NOT NULL AND UPPER(q.referencia_doc) = ?)
            OR (1 = ? AND (UPPER(q.documento_numero) LIKE ? OR (q.boleta_numero IS NOT NULL AND UPPER(q.boleta_numero) LIKE ?) OR (q.referencia_doc IS NOT NULL AND UPPER(q.referencia_doc) LIKE ?)))
          ) AND (q.entregado = 1 OR q.estado = 'completo')
          ORDER BY q.id DESC LIMIT 1
        `).get(token, token, token, usePartialLike ? 1 : 0, likePattern, likePattern, likePattern) as any;

        if (alreadyDelivered) {
          skippedDelivered.push(alreadyDelivered.boleta_numero || alreadyDelivered.documento_numero);
          continue;
        }

        // 0.1 Pre-verificación: Si está pendiente de autorización por jefatura
        const pendingAuthDoc = db.prepare(`
          SELECT q.documento_numero, q.boleta_numero
          FROM ops_delivery_queue q
          WHERE (
            UPPER(q.documento_numero) = ?
            OR (q.boleta_numero IS NOT NULL AND UPPER(q.boleta_numero) = ?)
            OR (q.referencia_doc IS NOT NULL AND UPPER(q.referencia_doc) = ?)
          ) AND q.estado = 'pendiente_autorizacion'
          LIMIT 1
        `).get(token, token, token) as any;

        if (pendingAuthDoc) {
          skippedOtherRoute.push(`${pendingAuthDoc.boleta_numero || pendingAuthDoc.documento_numero} (Pendiente de Aprobación por Jefatura)`);
          continue;
        }

        let queueDoc = db.prepare(`
          SELECT q.*, a.empleado_id, u.name as chofer_nombre
          FROM ops_delivery_queue q
          LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id AND a.activa = 1
          LEFT JOIN core_users u ON a.empleado_id = u.id
          WHERE (
            UPPER(q.documento_numero) = ? 
            OR (q.boleta_numero IS NOT NULL AND UPPER(q.boleta_numero) = ?)
            OR (q.referencia_doc IS NOT NULL AND UPPER(q.referencia_doc) = ?)
            OR (1 = ? AND (UPPER(q.documento_numero) LIKE ? OR (q.boleta_numero IS NOT NULL AND UPPER(q.boleta_numero) LIKE ?) OR (q.referencia_doc IS NOT NULL AND UPPER(q.referencia_doc) LIKE ?)))
          ) AND q.entregado = 0 AND q.estado NOT IN ('pendiente_autorizacion', 'aprobado_fuera_de_ruta', 'anulado')
          ORDER BY CASE 
            WHEN UPPER(COALESCE(q.boleta_numero, '')) = ? THEN 1
            WHEN UPPER(q.documento_numero) = ? THEN 2
            WHEN UPPER(COALESCE(q.referencia_doc, '')) = ? THEN 3
            ELSE 4 
          END, q.id DESC
          LIMIT 1
        `).get(token, token, token, usePartialLike ? 1 : 0, likePattern, likePattern, likePattern, token, token, token) as any;

        if (!queueDoc && usePartialLike) {
          queueDoc = db.prepare(`
            SELECT q.*, a.empleado_id, u.name as chofer_nombre
            FROM ops_delivery_queue q
            LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id AND a.activa = 1
            LEFT JOIN core_users u ON a.empleado_id = u.id
            WHERE (
              UPPER(q.documento_numero) LIKE ? 
              OR (q.boleta_numero IS NOT NULL AND UPPER(q.boleta_numero) LIKE ?)
              OR (q.referencia_doc IS NOT NULL AND UPPER(q.referencia_doc) LIKE ?)
            ) AND q.entregado = 0 AND q.estado NOT IN ('pendiente_autorizacion', 'aprobado_fuera_de_ruta', 'anulado')
            ORDER BY q.id DESC
            LIMIT 1
          `).get(`%${token}%`, `%${token}%`, `%${token}%`) as any;
        }

        if (queueDoc) {
          if (queueDoc.asignacion_id && queueDoc.asignacion_id !== assignmentId && queueDoc.empleado_id) {
            skippedOtherRoute.push(`${queueDoc.documento_numero} (Ruta de ${queueDoc.chofer_nombre || 'otro chofer'})`);
            continue;
          }

          db.prepare("UPDATE ops_delivery_queue SET asignacion_id = ?, estado = 'en_ruta' WHERE id = ?").run(assignmentId, queueDoc.id);
          loadedCount++;
          loadedTokens.push(queueDoc.documento_numero);
          continue;
        }

        let erpInvoice = db.prepare(`
          SELECT FACTURA, CLIENTE, NOMBRE_CLIENTE FROM core_erp_invoice_headers
          WHERE UPPER(FACTURA) = ? OR UPPER(FACTURA) LIKE ?
          ORDER BY CASE WHEN UPPER(FACTURA) = ? THEN 1 ELSE 2 END, FACTURA DESC
          LIMIT 1
        `).get(token, `%${token}`, token) as any;

        if (!erpInvoice && token.length >= 4) {
          erpInvoice = db.prepare(`
            SELECT FACTURA, CLIENTE, NOMBRE_CLIENTE FROM core_erp_invoice_headers
            WHERE UPPER(FACTURA) LIKE ?
            ORDER BY FACTURA DESC
            LIMIT 1
          `).get(`%${token}%`) as any;
        }

        if (erpInvoice) {
          const existingInQueue = db.prepare("SELECT id, asignacion_id FROM ops_delivery_queue WHERE UPPER(documento_numero) = ? AND entregado = 0").get(erpInvoice.FACTURA.toUpperCase()) as any;
          if (existingInQueue) {
            if (existingInQueue.asignacion_id && existingInQueue.asignacion_id !== assignmentId) {
              skippedOtherRoute.push(`${erpInvoice.FACTURA} (Asignada a otra ruta)`);
              continue;
            }
            db.prepare("UPDATE ops_delivery_queue SET asignacion_id = ?, estado = 'en_ruta' WHERE id = ?").run(assignmentId, existingInQueue.id);
          } else {
            db.prepare(`
              INSERT INTO ops_delivery_queue (
                documento_numero, tipo_documento, cliente_id, cliente_nombre, asignacion_id, entregado, estado, fecha_registro
              ) VALUES (?, 'factura', ?, ?, ?, 0, 'en_ruta', ?)
            `).run(erpInvoice.FACTURA, erpInvoice.CLIENTE, erpInvoice.NOMBRE_CLIENTE, assignmentId, todayStr);
          }
          loadedCount++;
          loadedTokens.push(erpInvoice.FACTURA);
          continue;
        }

        notFoundTokens.push(token);
      }

      // Si no se cargó ninguna y todo fueron fallas o entregadas
      if (loadedCount === 0) {
        let errorMsg = 'No se pudo cargar ningún documento.';
        if (skippedDelivered.length > 0) {
          errorMsg = `El/los documento(s) [${skippedDelivered.join(', ')}] ya fueron entregados anteriormente.`;
        } else if (skippedOtherRoute.length > 0) {
          errorMsg = `Documentos ya en otras rutas: ${skippedOtherRoute.join(', ')}`;
        } else if (notFoundTokens.length > 0) {
          errorMsg = `No se encontraron en ERP o cola general: ${notFoundTokens.join(', ')}`;
        }
        return NextResponse.json({
          success: false,
          error: errorMsg,
          loadedCount: 0,
          skippedDelivered,
          skippedOtherRoute,
          notFoundTokens
        }, { status: 400 });
      }

      // Mensaje estructurado y amigable
      const parts: string[] = [];
      parts.push(`✓ ${loadedCount} factura(s) cargada(s): ${loadedTokens.join(', ')}.`);
      if (skippedDelivered.length > 0) {
        parts.push(`⚠️ Omitida(s) ya entregada(s) previamente: ${skippedDelivered.join(', ')}.`);
      }
      if (skippedOtherRoute.length > 0) {
        parts.push(`⚠️ Omitida(s) en otra ruta: ${skippedOtherRoute.join(', ')}.`);
      }
      if (notFoundTokens.length > 0) {
        parts.push(`⚠️ No encontrada(s): ${notFoundTokens.join(', ')}.`);
      }

      return NextResponse.json({
        success: true,
        loadedCount,
        loadedTokens,
        skippedDelivered,
        skippedOtherRoute,
        notFoundTokens,
        message: parts.join(' ')
      });
    }

    // 3. SALIR A RUTA (DEPART TO ROUTE)
    if (action === 'depart_route') {
      if (!assignmentId) {
        return NextResponse.json({ success: false, error: 'Falta assignmentId' }, { status: 400 });
      }

      if (!isAuthorizedAssignment(Number(assignmentId))) {
        return NextResponse.json({ success: false, error: 'No está autorizado para modificar una ruta asignada a otro chofer.' }, { status: 403 });
      }

      db.prepare(`
        UPDATE ops_delivery_assignments
        SET fecha_salida = ?
        WHERE id = ?
      `).run(now, assignmentId);

      if (lat && lng) {
        db.prepare(`
          INSERT INTO ops_delivery_gps_logs (asignacion_id, timestamp, latitud, longitud, evento)
          VALUES (?, ?, ?, ?, 'salida_ruta')
        `).run(assignmentId, now, lat, lng);
      }

      return NextResponse.json({ success: true, message: 'Salida a ruta registrada' });
    }

    // 4. INDICAR SIGUIENTE CLIENTE
    if (action === 'set_next_client') {
      if (!assignmentId || !siguienteCliente) {
        return NextResponse.json({ success: false, error: 'Faltan parámetros: assignmentId, siguienteCliente' }, { status: 400 });
      }

      if (!isAuthorizedAssignment(Number(assignmentId))) {
        return NextResponse.json({ success: false, error: 'No está autorizado para modificar una ruta asignada a otro chofer.' }, { status: 403 });
      }

      db.prepare(`
        UPDATE ops_delivery_assignments
        SET siguiente_cliente = ?, siguiente_cliente_fecha = ?
        WHERE id = ?
      `).run(siguienteCliente, now, assignmentId);

      return NextResponse.json({ success: true, message: `Siguiente cliente fijado: ${siguienteCliente}` });
    }

    // 5. FINALIZAR RUTA / INICIAR RETORNO
    if (action === 'finish_route') {
      if (!assignmentId) {
        return NextResponse.json({ success: false, error: 'Falta assignmentId' }, { status: 400 });
      }

      if (!isAuthorizedAssignment(Number(assignmentId))) {
        return NextResponse.json({ success: false, error: 'No está autorizado para finalizar una ruta asignada a otro chofer.' }, { status: 403 });
      }

      if (finishType === 'return') {
        db.prepare(`
          UPDATE ops_delivery_assignments
          SET fecha_inicio_retorno = ?, latitud_retorno = ?, longitud_retorno = ?
          WHERE id = ?
        `).run(now, lat || null, lng || null, assignmentId);
        return NextResponse.json({ success: true, message: 'Inicio de retorno registrado' });
      } else {
        const { finalizeRouteAssignmentInternal } = await import('@/modules/operations/lib/actions');
        const driverName = body.driverName || 'Chofer APK';
        const finRes = await finalizeRouteAssignmentInternal(assignmentId, driverName, db, lat || null, lng || null);
        let msg = finRes.error || 'Error al finalizar ruta';
        if (finRes.success) {
          msg = finRes.consecutivo ? `Ruta finalizada con consecutivo ${finRes.consecutivo}` : (finRes.message || 'Ruta cerrada sin entregas ni consecutivo.');
        }
        return NextResponse.json({
          success: finRes.success,
          consecutivo: finRes.consecutivo,
          message: msg
        });
      }
    }

    // 6. REVERTIR ENTREGA (Soporta APK sin requerir cookies de sesión web)
    if (action === 'revert_delivery') {
      const { docId } = body;
      if (!docId) {
        return NextResponse.json({ success: false, error: 'Falta docId' }, { status: 400 });
      }

      if (!isAuthorizedDocument(Number(docId))) {
        return NextResponse.json({ success: false, error: 'No está autorizado para revertir un documento asignado a otra ruta.' }, { status: 403 });
      }

      const { revertDeliveryInternal } = await import('@/modules/operations/lib/driver-actions');
      const res = await revertDeliveryInternal(Number(docId));
      return NextResponse.json(res);
    }

    // 7. REPORTAR AVERÍA (Reutiliza la lógica existente con soporte de fotografías)
    if (action === 'report_breakdown') {
      const { vehiculoId, breakdownType, description, choferNombre, photo } = body;
      if (!vehiculoId || !description) {
        return NextResponse.json({ success: false, error: 'Faltan parámetros de avería' }, { status: 400 });
      }

      let savedPhotoName = '';
      if (photo && typeof photo === 'string' && photo.startsWith('data:image/')) {
        try {
          const { saveBase64ToFleetFile } = await import('@/modules/fleet/lib/files');
          const fileName = await saveBase64ToFleetFile(photo, 'averia');
          if (fileName) savedPhotoName = fileName;
        } catch (_) {}
      }

      const fullDesc = savedPhotoName ? `${description}\n📸 Evidencia: ${savedPhotoName}` : description;
      const { saveTelegramMaintenanceLog } = await import('@/modules/fleet/lib/telegram-bot');
      await saveTelegramMaintenanceLog({
        vehicleId: Number(vehiculoId),
        date: todayStr,
        mileage: 0,
        type: breakdownType || 'Mecánica',
        description: fullDesc,
        cost: 0,
        performedBy: choferNombre || 'Chofer APK'
      }, choferNombre || 'Chofer APK');
      return NextResponse.json({ success: true, message: 'Avería reportada exitosamente a la central' });
    }

    // 8. ENVIAR BOLETA POR CORREO
    if (action === 'send_email') {
      const { docId, targetEmail } = body;
      if (!docId) {
        return NextResponse.json({ success: false, error: 'Falta docId' }, { status: 400 });
      }

      if (!isAuthorizedDocument(Number(docId))) {
        return NextResponse.json({ success: false, error: 'No está autorizado para enviar comprobantes de un documento ajeno.' }, { status: 403 });
      }

      const { sendBoletaManualEmail } = await import('@/modules/operations/lib/actions');
      const res = await sendBoletaManualEmail(Number(docId), targetEmail || '');
      return NextResponse.json(res);
    }

    // 9. AVISO: CHOFER EN ESPERA DE ATENCIÓN (⏱️)
    if (action === 'notify_waiting_customer') {
      const { docId, lat, lng } = body;
      if (!docId) {
        return NextResponse.json({ success: false, error: 'Falta docId' }, { status: 400 });
      }

      if (!isAuthorizedDocument(Number(docId))) {
        return NextResponse.json({ success: false, error: 'No está autorizado para enviar avisos sobre un cliente asignado a otra ruta.' }, { status: 403 });
      }

      const { sendDriverWaitingCustomerNoticeAction } = await import('@/modules/operations/lib/actions');
      const res = await sendDriverWaitingCustomerNoticeAction({
        docId: Number(docId),
        lat: lat ? Number(lat) : null,
        lng: lng ? Number(lng) : null
      });
      return NextResponse.json(res);
    }

    return NextResponse.json({ success: false, error: `Acción desconocida: ${action}` }, { status: 400 });
  } catch (error: any) {
    // [E7] Mensaje de error saneado
    return NextResponse.json({ success: false, error: "Error interno al procesar la acción del chofer." }, { status: 500 });
  }
}
