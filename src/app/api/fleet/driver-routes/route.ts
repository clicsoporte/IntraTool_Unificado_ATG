import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import { getBusinessDateStr } from '@/modules/core/lib/timezone';
import { updateDeliveryStatusInternal, getDocumentLinesInternal } from '@/modules/operations/lib/delivery-service';
import { authenticateFleetRequest } from '@/modules/fleet/lib/fleet-auth-guard';

export async function GET(req: NextRequest) {
  try {
    // [S1 & Anti-IDOR] Autenticación y derivación segura de usuario
    const authResult = await authenticateFleetRequest(req);
    if ('response' in authResult) {
      return authResult.response;
    }

    const db = await getDb();
    const today = await getBusinessDateStr();
    const { searchParams } = new URL(req.url);
    const userIdParam = searchParams.get('userId');

    // Priorizar userId verificado del token JWT; si no hay, usar fallback del request
    let userId = authResult.user.userId || (userIdParam ? Number(userIdParam) : null);

    if (!userId || isNaN(userId)) {
      return NextResponse.json({
        success: true,
        hasActiveAssignment: false,
        assignment: null,
        deliveries: []
      });
    }

    // Find driver's active assignment today
    const assignment = db.prepare(`
      SELECT 
        a.id,
        a.ruta_id,
        a.empleado_id,
        a.vehiculo_id,
        a.fecha,
        a.activa,
        a.fecha_salida,
        a.siguiente_cliente,
        a.fecha_inicio_retorno,
        a.fecha_completada,
        COALESCE(r.name, '') as ruta_nombre,
        COALESCE(v.plate, '') as vehiculo_placa
      FROM ops_delivery_assignments a
      LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
      LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
      WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
      LIMIT 1
    `).get(userId, today) as any;

    if (!assignment) {
      return NextResponse.json({
        success: true,
        hasActiveAssignment: false,
        assignment: null,
        deliveries: []
      });
    }

    // Fetch documents belonging STRICTLY to this active assignment
    const docs = db.prepare(`
      SELECT 
        q.id,
        q.documento_numero,
        q.boleta_numero,
        q.tipo_documento,
        q.cliente_nombre,
        q.cliente_id,
        COALESCE(
          (
            SELECT sa.detalle_direccion 
            FROM core_customer_shipment_addresses sa 
            JOIN core_erp_invoice_headers h ON h.FACTURA = q.documento_numero
            WHERE sa.cliente_id = q.cliente_id AND sa.direccion_id = h.DIREC_EMBARQUE
              AND sa.detalle_direccion IS NOT NULL AND sa.detalle_direccion != '' AND sa.detalle_direccion NOT GLOB '*[0-9].0'
            LIMIT 1
          ),
          (
            SELECT sa.descripcion 
            FROM core_customer_shipment_addresses sa 
            JOIN core_erp_invoice_headers h ON h.FACTURA = q.documento_numero
            WHERE sa.cliente_id = q.cliente_id AND sa.direccion_id = h.DIREC_EMBARQUE
              AND sa.descripcion IS NOT NULL AND sa.descripcion != '' AND sa.descripcion NOT GLOB '*[0-9].0'
            LIMIT 1
          ),
          (
            SELECT sa.detalle_direccion 
            FROM core_customer_shipment_addresses sa 
            WHERE sa.cliente_id = q.cliente_id 
              AND sa.detalle_direccion IS NOT NULL AND sa.detalle_direccion != '' AND sa.detalle_direccion NOT GLOB '*[0-9].0'
            ORDER BY sa.id ASC LIMIT 1
          ),
          (
            SELECT sa.descripcion 
            FROM core_customer_shipment_addresses sa 
            WHERE sa.cliente_id = q.cliente_id 
              AND sa.descripcion IS NOT NULL AND sa.descripcion != '' AND sa.descripcion NOT GLOB '*[0-9].0'
            ORDER BY sa.id ASC LIMIT 1
          ),
          (SELECT c.address FROM core_customers c WHERE c.id = q.cliente_id AND c.address IS NOT NULL AND c.address != '' LIMIT 1),
          'Dirección registrada en expediente del cliente'
        ) as lugar_entrega,
        q.comentario,
        COALESCE(
          (SELECT OBSERVACIONES FROM core_erp_invoice_headers WHERE FACTURA = q.documento_numero LIMIT 1),
          ''
        ) as observaciones,
        q.estado,
        COALESCE(u.name, '') as chofer_nombre,
        COALESCE(v.plate, '') as placa_vehiculo,
        COALESCE(r.name, '') as ruta_nombre,
        q.fecha_entrega,
        q.nombre_recibe,
        q.firma_cliente,
        q.latitud,
        q.longitud,
        q.creado_por
      FROM ops_delivery_queue q
      JOIN ops_delivery_assignments a ON q.asignacion_id = a.id
      LEFT JOIN core_users u ON a.empleado_id = u.id
      LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
      LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
      WHERE q.asignacion_id = ?
      ORDER BY q.id ASC
    `).all(assignment.id);

    // IT emergency phone numbers setting
    const itPhonesSetting = (db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'sms_gateway_it_phones'").get() as any)?.value || '';

    const getUserSmsPref = (userId: number) => {
      const prefs = db.prepare('SELECT key, value FROM core_user_preferences WHERE userId = ?').all(userId) as { key: string; value: string }[];
      const map: Record<string, any> = {};
      for (const p of prefs) {
        try { map[p.key] = JSON.parse(p.value); } catch (_) { map[p.key] = p.value; }
      }
      const master = map['notif_master'] !== false;
      const channelSms = map['notif_channel_sms'] !== false;
      return {
        completed: master && channelSms && (map['ops_notif_delivery_completed'] !== false),
        incomplete: master && channelSms && (map['ops_notif_delivery_incomplete'] !== false),
        rejected: master && channelSms && (map['ops_notif_delivery_rejected'] !== false),
      };
    };

    const getLinesStmt = db.prepare(`
      SELECT 
        producto_codigo as codigo, 
        producto_descripcion as desc, 
        cantidad_pedida as pedida, 
        cantidad_entregada as entregada, 
        cantidad_faltante as faltante 
      FROM ops_delivery_lines 
      WHERE delivery_order_id = ?
    `);

    let totalLinesCount = 0;
    for (const doc of docs as any[]) {
      if (doc.tipo_documento === 'recoger') {
        try {
          let parsed: any = {};
          try {
            if (doc.comentario && doc.comentario.trim().startsWith('{')) {
              parsed = JSON.parse(doc.comentario);
            }
          } catch (_) {}

          // 1. Obtener la dirección ERP del proveedor (core_suppliers.address)
          const supp = db.prepare('SELECT address, latitude, longitude FROM core_suppliers WHERE id = ? OR LOWER(name) = LOWER(?)').get(doc.cliente_id, doc.cliente_nombre) as { address?: string; latitude?: number; longitude?: number } | undefined;
          
          let erpAddress = '';
          if (supp?.address && supp.address.trim() !== '' && supp.address.trim() !== '0') {
            erpAddress = supp.address.trim();
          }

          // Para la tarjeta principal (lugar_entrega), asignar la dirección ERP o mensaje claro
          doc.lugar_entrega = erpAddress || 'Sin dirección registrada en ERP';

          if (supp && supp.latitude !== null && supp.latitude !== undefined) {
            doc.latitud_destino = supp.latitude;
            doc.longitud_destino = supp.longitude;
          }

          // 2. Empaquetar la dirección específica de la solicitud y contactos en collect_details para el modal ℹ️
          doc.collect_details = {
            orden_compra: parsed.orden_compra || '',
            factura: parsed.factura || '',
            metodo_pago: parsed.metodo_pago || 'ya_esta_pago',
            proveedor_contacto_nombre: parsed.proveedor_contacto_nombre || parsed.contacto_nombre || '',
            proveedor_contacto_telefono: parsed.proveedor_contacto_telefono || parsed.contacto_telefono || '',
            provincia: parsed.provincia || parsed.provincia_nombre || '',
            canton: parsed.canton || parsed.canton_nombre || '',
            distrito: parsed.distrito || parsed.distrito_nombre || '',
            direccion_exacta: parsed.direccion_exacta || parsed.direccion_detalle || parsed.direccionDetalle || '',
            solicitante_nombre: parsed.en_nombre_de_companero ? parsed.companero_nombre : (parsed.solicitante_nombre || doc.creado_por || ''),
            solicitante_email: parsed.en_nombre_de_companero ? parsed.companero_email : (parsed.solicitante_email || ''),
            solicitante_telefono: parsed.en_nombre_de_companero ? parsed.companero_telefono : (parsed.solicitante_telefono || ''),
            horario_proveedor: parsed.horario_proveedor || 'Lunes a Viernes 8:00 AM - 5:00 PM',
            lugar_entrega: parsed.lugar_entrega || '',
            detalle_adicional: parsed.detalle_adicional || ''
          };
        } catch (_) {}
      }

      let dbLines = (getLinesStmt.all(doc.id) as any[]) || [];

      if (dbLines.length === 0) {
        try {
          const cleanDocNum = (doc.documento_numero || '').replace('-PARTIAL', '').replace('-RETRY', '');
          const erpLines = await getDocumentLinesInternal(cleanDocNum, doc.tipo_documento || 'factura');
          if (erpLines && erpLines.length > 0) {
            dbLines = erpLines.map((l: any) => ({
              codigo: l.articulo || l.codigo || 'ART',
              desc: l.descripcion || l.desc || `Producto ${l.articulo}`,
              pedida: Number(l.cantidad || l.pedida || 1),
              entregada: doc.estado === 'completo' || doc.estado === 'entregado' ? Number(l.cantidad || l.pedida || 1) : 0,
              faltante: doc.estado === 'completo' || doc.estado === 'entregado' ? 0 : Number(l.cantidad || l.pedida || 1),
            }));
          }
        } catch (_) {}
      }

      if (dbLines.length > 0) {
        doc.lines = dbLines;
      } else {
        doc.lines = [{
          codigo: doc.boleta_numero || doc.documento_numero || `DOC-${doc.id}`,
          desc: `Mercancía / Bultos General (${doc.cliente_nombre || 'Cliente'})`,
          pedida: 1,
          entregada: doc.estado === 'completo' || doc.estado === 'entregado' ? 1 : 0,
          faltante: doc.estado === 'completo' || doc.estado === 'entregado' ? 0 : 1
        }];
      }
      totalLinesCount += doc.lines.length;

      // Attach phone numbers and SMS preferences for offline direct SIM SMS sending
      let vendedorPhone = '';
      let vendedorName = '';
      let vendedorSmsPrefs = { completed: true, incomplete: true, rejected: true };
      const erpHeader = db.prepare('SELECT VENDEDOR FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { VENDEDOR?: string } | undefined;
      const vCode = erpHeader?.VENDEDOR?.trim() || '';
      if (vCode) {
        const vUser = db.prepare('SELECT id, name, phone FROM core_users WHERE salespersonId = ? OR erpAlias = ? OR email = ? OR name = ?').get(vCode, vCode, vCode, vCode) as any;
        if (vUser && vUser.phone) {
          vendedorPhone = vUser.phone.trim();
          vendedorName = vUser.name || vCode;
          vendedorSmsPrefs = getUserSmsPref(vUser.id);
        }
      }

      let meCreatorPhone = '';
      let meCreatorName = '';
      let meCreatorSmsPrefs = { completed: true, incomplete: true, rejected: true };
      const creatorCode = (doc.creado_por || '').trim();
      if (creatorCode) {
        const cUser = db.prepare('SELECT id, name, phone FROM core_users WHERE erpAlias = ? OR email = ? OR name = ? OR id = ?').get(creatorCode, creatorCode, creatorCode, creatorCode) as any;
        if (cUser && cUser.phone) {
          meCreatorPhone = cUser.phone.trim();
          meCreatorName = cUser.name || creatorCode;
          meCreatorSmsPrefs = getUserSmsPref(cUser.id);
        }
      }

      doc.vendedor_phone = vendedorPhone;
      doc.vendedor_nombre = vendedorName;
      doc.vendedor_sms_prefs = vendedorSmsPrefs;
      doc.creado_por_phone = meCreatorPhone;
      doc.creado_por_nombre = meCreatorName;
      doc.creado_por_sms_prefs = meCreatorSmsPrefs;
      doc.it_emergency_phones = itPhonesSetting;
    }

    return NextResponse.json({
      success: true,
      hasActiveAssignment: true,
      assignment,
      date: today,
      count: docs.length,
      totalLinesCount,
      deliveries: docs
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // [S1 & JWT] Validar token de autenticación en la subida de entregas
    const authResult = await authenticateFleetRequest(req);
    if ('response' in authResult) {
      return authResult.response;
    }

    const body = await req.json();
    const { id, boletaNumero, estado, comentario, fotoEvidencia, fotoFactura, firmaCliente, nombreRecibe, lines, choferNombre, lat, lng } = body;

    if (!id || !estado) {
      return NextResponse.json({ success: false, error: "Faltan parámetros requeridos (id, estado)" }, { status: 400 });
    }

    const effectiveUserId = authResult.user?.userId || 0;
    const db = await getDb();

    // [E5] Validar propiedad de la entrega: comprobar que no pertenezca a la ruta activa de otro chofer
    if (effectiveUserId > 0) {
      const doc = db.prepare(`
        SELECT q.asignacion_id, a.empleado_id 
        FROM ops_delivery_queue q
        LEFT JOIN ops_delivery_assignments a ON q.asignacion_id = a.id
        WHERE q.id = ?
      `).get(Number(id)) as any;

      if (doc && doc.asignacion_id && doc.empleado_id && doc.empleado_id !== effectiveUserId) {
        const user = db.prepare("SELECT role FROM core_users WHERE id = ?").get(effectiveUserId) as any;
        const isPrivileged = user && (user.role === 'admin' || user.role === 'supervisor');
        if (!isPrivileged) {
          return NextResponse.json({ success: false, error: 'No está autorizado para procesar un documento asignado a otro chofer.' }, { status: 403 });
        }
      }
    }

    const success = await updateDeliveryStatusInternal(Number(id), {
      estado,
      boletaNumero,
      comentario,
      canal: 'web',
      gestionadoPor: choferNombre || 'App Nativa ClicDriver',
      fotoEvidencia,
      fotoFactura,
      firmaCliente,
      nombreRecibe,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      lines: lines || []
    });

    if (success) {
      return NextResponse.json({ success: true, message: "Entrega registrada exitosamente" });
    } else {
      return NextResponse.json({ success: false, error: "No se pudo actualizar el estado de la entrega" }, { status: 500 });
    }
  } catch (error: any) {
    // [E7] Mensaje saneado sin fuga de trazas internas
    return NextResponse.json({ success: false, error: "Error interno al procesar la entrega." }, { status: 500 });
  }
}
