import { getDb } from '@/modules/core/lib/db';
import { getBusinessDateStr } from '@/modules/core/lib/timezone';
import { revalidatePath } from 'next/cache';
import { logInfo, logWarn, logError } from '@/modules/core/lib/logger';
import { sendEmail } from '@/modules/core/lib/email-service';
import { fetchNavixyLiveTelemetry } from '@/modules/fleet/lib/gps-service';

export async function getDocumentLinesInternal(docNum: string, tipo: 'factura' | 'pedido'): Promise<any[]> {
    const db = await getDb();
    try {
        if (tipo === 'factura') {
            return db.prepare(`
                SELECT 
                    l.LINEA as linea, 
                    l.ARTICULO as articulo, 
                    COALESCE(p.description, l.DESCRIPCION) as descripcion, 
                    l.CANTIDAD as cantidad 
                FROM core_erp_invoice_lines l
                LEFT JOIN core_products p ON l.ARTICULO = p.id
                WHERE l.FACTURA = ?
            `).all(docNum);
        } else {
            return db.prepare(`
                SELECT 
                    PEDIDO_LINEA as linea, 
                    ARTICULO as articulo, 
                    (SELECT description FROM core_products WHERE id = ARTICULO) as descripcion, 
                    CANTIDAD_PEDIDA as cantidad 
                FROM core_erp_order_lines 
                WHERE PEDIDO = ?
            `).all(docNum);
        }
    } catch (e: any) {
        logError('Error getting document lines:', e.message);
        return [];
    }
}

export async function updateDeliveryStatusInternal(
    id: number,
    data: {
        estado: 'completo' | 'incompleto' | 'rechazado';
        boletaNumero?: string | null;
        comentario?: string;
        canal: 'telegram' | 'web';
        gestionadoPor: string;
        lines?: { codigo: string; desc?: string; pedida: number; entregada: number; faltante: number }[];
        releaseCodeId?: number;
        fotoEvidencia?: string | null;
        fotoFactura?: string | null;
        firmaCliente?: string | null;
        nombreRecibe?: string | null;
        lat?: number | null;
        lng?: number | null;
    }
): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    const savedFileNames: string[] = [];
    try {
        const { saveBase64ToFleetFile, deleteFleetFile } = await import('@/modules/fleet/lib/files');
        
        let processedFirma = data.firmaCliente;
        if (processedFirma && processedFirma.startsWith('data:image/')) {
            const fileName = await saveBase64ToFleetFile(processedFirma, 'sign');
            if (fileName) {
                processedFirma = fileName;
                savedFileNames.push(fileName);
            }
        }

        // Helper para procesar una foto individual o múltiples fotos (JSON array o array nativo)
        const processPhotoField = async (input: any, prefix: string): Promise<string | null> => {
            if (!input) return null;

            // Si es un array de fotos en Base64 o nombres
            if (Array.isArray(input)) {
                const savedList: string[] = [];
                for (const item of input) {
                    if (typeof item === 'string' && item.startsWith('data:image/')) {
                        const fName = await saveBase64ToFleetFile(item, prefix);
                        if (fName) {
                            savedList.push(fName);
                            savedFileNames.push(fName);
                        }
                    } else if (typeof item === 'string' && item.trim()) {
                        savedList.push(item.trim());
                    }
                }
                return savedList.length > 0 ? JSON.stringify(savedList) : null;
            }

            // Si es un string que ya viene como JSON array: '["data:image...", ...]' o '["img1.jpg", ...]'
            if (typeof input === 'string' && input.trim().startsWith('[') && input.trim().endsWith(']')) {
                try {
                    const parsed = JSON.parse(input);
                    if (Array.isArray(parsed)) {
                        const savedList: string[] = [];
                        for (const item of parsed) {
                            if (typeof item === 'string' && item.startsWith('data:image/')) {
                                const fName = await saveBase64ToFleetFile(item, prefix);
                                if (fName) {
                                    savedList.push(fName);
                                    savedFileNames.push(fName);
                                }
                            } else if (typeof item === 'string' && item.trim()) {
                                savedList.push(item.trim());
                            }
                        }
                        return savedList.length > 0 ? JSON.stringify(savedList) : null;
                    }
                } catch (_) {}
            }

            // Si es una sola foto en Base64
            if (typeof input === 'string' && input.startsWith('data:image/')) {
                const fileName = await saveBase64ToFleetFile(input, prefix);
                if (fileName) {
                    savedFileNames.push(fileName);
                    return fileName;
                }
                return null;
            }

            return typeof input === 'string' && input.trim() ? input.trim() : null;
        };

        const processedEvidencia = await processPhotoField(data.fotoEvidencia, 'evi');
        const processedFactura = await processPhotoField(data.fotoFactura, 'fac');

        const localTodayStr = await getBusinessDateStr();

        // Fallback GPS Navixy resolution (async call outside db.transaction)
        let resolvedLat = data.lat;
        let resolvedLng = data.lng;

        if ((!resolvedLat || !resolvedLng)) {
            try {
                const docRow = db.prepare('SELECT asignacion_id FROM ops_delivery_queue WHERE id = ?').get(id) as { asignacion_id: number | null } | undefined;
                if (docRow?.asignacion_id) {
                    const vehicleRow = db.prepare(`
                        SELECT v.plate FROM ops_delivery_assignments a
                        JOIN fleet_vehicles v ON a.vehiculo_id = v.id
                        WHERE a.id = ?
                    `).get(docRow.asignacion_id) as { plate: string } | undefined;

                    if (vehicleRow?.plate) {
                        const telemetryList = await fetchNavixyLiveTelemetry();
                        const cleanPlate = vehicleRow.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const truckFix = telemetryList.find(t => String(t.plate).toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanPlate);
                        if (truckFix && truckFix.lat && truckFix.lng) {
                            resolvedLat = truckFix.lat;
                            resolvedLng = truckFix.lng;
                            console.log(`📡 [Navixy Fallback GPS] Coordenadas obtenidas del GPS del camión ${vehicleRow.plate}: Lat ${resolvedLat}, Lng ${resolvedLng}`);
                        }
                    }
                }
            } catch (e: any) {
                console.error('Error al resolver fallback GPS Navixy:', e.message);
            }
        }

        const transaction = db.transaction(() => {
            const todayStr = new Date().toISOString();
            const entregadoFlag = 1; // Un documento procesado (completo, incompleto o rechazado) queda procesado (1) en la ruta del día

            // 1. Get current document details
            const currentDoc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(id) as any;
            if (!currentDoc) throw new Error('Documento no encontrado en la cola.');

            // Prevenir doble confirmación concurrente (Respuesta idempotente en reintentos de red)
            if (['completo', 'incompleto', 'rechazado'].includes(currentDoc.estado)) {
                if (currentDoc.estado === data.estado || currentDoc.entregado === 1) {
                    logInfo(`[Doble Confirmación Idempotente] Documento #${currentDoc.documento_numero} ya en estado '${currentDoc.estado}'. Retornando éxito.`);
                    return { success: true };
                }
                throw new Error(`El documento #${currentDoc.documento_numero} ya fue procesado previamente con estado '${currentDoc.estado}'.`);
            }

            // Validar titularidad de lock si está activo (< 15 min)
            if (currentDoc.telegram_lock_by && currentDoc.telegram_lock_at) {
                const lockAgeMs = Date.now() - new Date(currentDoc.telegram_lock_at).getTime();
                const isLockActive = lockAgeMs < 15 * 60 * 1000;
                if (isLockActive && currentDoc.telegram_lock_by !== data.gestionadoPor && data.canal === 'telegram') {
                    throw new Error(`El documento #${currentDoc.documento_numero} está bloqueado por '${currentDoc.telegram_lock_by}'.`);
                }
            }

            let tiempoDescargaMin: number | null = currentDoc.tiempo_descarga_min || null;
            if (currentDoc.hora_ingreso_geocerca && !tiempoDescargaMin) {
                try {
                    const ingresoDt = new Date(currentDoc.hora_ingreso_geocerca);
                    const entregaDt = new Date(todayStr);
                    tiempoDescargaMin = Math.max(1, Math.round((entregaDt.getTime() - ingresoDt.getTime()) / 60000));
                } catch {
                    tiempoDescargaMin = null;
                }
            }

            // Ensure firma_cliente, nombre_recibe and boleta_numero columns exist
            try {
                const tableInfo = db.prepare("PRAGMA table_info('ops_delivery_queue')").all();
                const cols = tableInfo.map((c: any) => c.name);
                if (!cols.includes('firma_cliente')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN firma_cliente TEXT;`);
                if (!cols.includes('nombre_recibe')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN nombre_recibe TEXT;`);
                if (!cols.includes('boleta_numero')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN boleta_numero TEXT;`);
            } catch (e) {}

            // Assign Boleta Consecutive (prioritizing boletaNumero from driver APK)
            let assignedBoletaNumero = data.boletaNumero || currentDoc.boleta_numero || null;
            if (!assignedBoletaNumero) {
                try {
                    const useSingleConsecRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'boletas_use_single_consecutive'").get() as { value: string } | undefined;
                    const isSingleConsecutive = useSingleConsecRow?.value === 'true';

                    const prefixSettingKey = isSingleConsecutive ? 'boleta_consecutive_prefix' : 'boleta_prefix_faltante';
                    const nextSettingKey = isSingleConsecutive ? 'boleta_consecutive_next' : 'boleta_next_faltante';

                    const prefixRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = ? OR key = 'boleta_consecutive_prefix' ORDER BY CASE WHEN key = ? THEN 1 ELSE 2 END LIMIT 1").get(prefixSettingKey, prefixSettingKey) as { value: string } | undefined;
                    const nextRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = ? OR key = 'boleta_consecutive_next' ORDER BY CASE WHEN key = ? THEN 1 ELSE 2 END LIMIT 1").get(nextSettingKey, nextSettingKey) as { value: string } | undefined;

                    const prefix = prefixRow?.value ?? 'BOL-';
                    const nextNum = parseInt(nextRow?.value || '1', 10);
                    assignedBoletaNumero = `${prefix}${String(nextNum).padStart(6, '0')}`;

                    db.prepare("INSERT INTO ops_delivery_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(nextSettingKey, String(nextNum + 1));
                } catch (e) {
                    assignedBoletaNumero = `BOL-${Date.now().toString().slice(-6)}`;
                }
            }

            // 2. Update the queue record
            db.prepare(`
                UPDATE ops_delivery_queue
                SET estado = ?, comentario = ?, canal_registro = ?, gestionado_por = ?, entregado = ?, fecha_entrega = ?, hora_entrega_efectiva = ?, tiempo_descarga_min = ?, boleta_numero = ?
                    ${data.releaseCodeId !== undefined ? ', release_code_id = ?' : ''}
                    ${data.fotoEvidencia !== undefined ? ', foto_evidencia = ?' : ''}
                    ${data.fotoFactura !== undefined ? ', foto_factura = ?' : ''}
                    ${data.firmaCliente !== undefined ? ', firma_cliente = ?' : ''}
                    ${data.nombreRecibe !== undefined ? ', nombre_recibe = ?' : ''}
                WHERE id = ?
            `).run(
                data.estado, 
                data.comentario || null, 
                data.canal, 
                data.gestionadoPor, 
                entregadoFlag, 
                todayStr, 
                todayStr,
                tiempoDescargaMin,
                assignedBoletaNumero,
                ...(data.releaseCodeId !== undefined ? [data.releaseCodeId] : []),
                ...(data.fotoEvidencia !== undefined ? [processedEvidencia] : []),
                ...(data.fotoFactura !== undefined ? [processedFactura] : []),
                ...(data.firmaCliente !== undefined ? [processedFirma] : []),
                ...(data.nombreRecibe !== undefined ? [data.nombreRecibe] : []),
                id
            );

            // 3. Clear existing lock
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(id);

            // 3.1. Save GPS Telemetry & Customer Geocoding (with Navixy GPS Fallback)
            if (resolvedLat && resolvedLng) {
                try {
                    db.prepare('UPDATE ops_delivery_queue SET latitud = ?, longitud = ? WHERE id = ?').run(resolvedLat, resolvedLng, id);
                    
                    if (currentDoc.cliente_id && currentDoc.documento_numero) {
                        const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(currentDoc.documento_numero) as { DIREC_EMBARQUE: string | null } | undefined;
                        const direccionId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();

                        const existingAddr = db.prepare(`
                            SELECT id FROM core_customer_shipment_addresses 
                            WHERE cliente_id = ? AND direccion_id = ?
                            ORDER BY id ASC LIMIT 1
                        `).get(currentDoc.cliente_id, direccionId) as { id: number } | undefined;

                        if (existingAddr) {
                            db.prepare(`
                                UPDATE core_customer_shipment_addresses 
                                SET latitude = ?, longitude = ? 
                                WHERE id = ?
                            `).run(resolvedLat, resolvedLng, existingAddr.id);
                        } else {
                            db.prepare(`
                                INSERT INTO core_customer_shipment_addresses (cliente_id, direccion_id, detalle_direccion, descripcion, latitude, longitude)
                                VALUES (?, ?, ?, ?, ?, ?)
                            `).run(currentDoc.cliente_id, direccionId, currentDoc.cliente_nombre || 'Entrega Principal', currentDoc.cliente_nombre || 'Entrega Principal', resolvedLat, resolvedLng);
                        }
                    }

                    // Auto-update supplier GPS location in core_suppliers if collection request
                    if (currentDoc.tipo_documento === 'recoger' && (currentDoc.cliente_id || currentDoc.cliente_nombre)) {
                        try {
                            const suppRow = db.prepare('SELECT id, latitude FROM core_suppliers WHERE id = ? OR LOWER(name) = LOWER(?)').get(currentDoc.cliente_id, currentDoc.cliente_nombre) as { id: string; latitude: number | null } | undefined;
                            if (suppRow) {
                                db.prepare('UPDATE core_suppliers SET latitude = ?, longitude = ? WHERE id = ?').run(resolvedLat, resolvedLng, suppRow.id);
                                console.log(`📍 [Geolocalización Proveedor Actualizada] Proveedor: ${suppRow.id} | Lat: ${resolvedLat}, Lng: ${resolvedLng}`);
                            }
                        } catch (e: any) {
                            console.error('Error al actualizar geolocalización de proveedor:', e.message);
                        }
                    }

                    if (currentDoc.asignacion_id) {
                        db.prepare(`
                            INSERT INTO ops_delivery_gps_logs (asignacion_id, latitud, longitud, timestamp, evento)
                            VALUES (?, ?, ?, ?, 'entrega_completada')
                        `).run(currentDoc.asignacion_id, resolvedLat, resolvedLng, todayStr);
                    }
                    console.log(`📍 [Geolocalización Cliente Actualizada] Cliente ID: ${currentDoc.cliente_id} | Lat: ${resolvedLat}, Lng: ${resolvedLng}`);
                } catch (e: any) {
                    console.error('Error al actualizar geolocalización de cliente:', e.message);
                }
            }

            // 4. Save delivery lines in Modo Avanzado
            if (data.lines && data.lines.length > 0) {
                db.prepare('DELETE FROM ops_delivery_lines WHERE delivery_order_id = ?').run(id);
                const insertLine = db.prepare(`
                    INSERT INTO ops_delivery_lines (delivery_order_id, producto_codigo, producto_descripcion, cantidad_pedida, cantidad_entregada, cantidad_faltante)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                for (const line of data.lines) {
                    insertLine.run(id, line.codigo, line.desc || '', line.pedida, line.entregada, line.faltante);
                }
            }

            // 5. Reinyección: If incomplete or rejected, automatically clone as a voucher requiring authorization
            if (currentDoc.tipo_documento !== 'recoger' && (data.estado === 'incompleto' || data.estado === 'rechazado')) {
                const newDocNumber = currentDoc.documento_numero + (data.estado === 'incompleto' ? '-PARTIAL' : '-RETRY');
                const baseOriginalDoc = (currentDoc.referencia_doc || currentDoc.documento_numero || '').replace('-PARTIAL', '').replace('-RETRY', '');
                
                // Prevent duplicate reinjections if already re-injected
                const existingReinjection = db.prepare("SELECT id FROM ops_delivery_queue WHERE documento_numero = ? AND estado IN ('pendiente', 'pendiente_autorizacion') AND entregado = 0").get(newDocNumber);
                
                if (!existingReinjection) {
                    // Generate official consecutive boleta number for this reinjection
                    let reinjectedBoletaNumero: string | null = null;
                    try {
                        const useSingleConsecRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'boletas_use_single_consecutive'").get() as { value: string } | undefined;
                        const isSingleConsecutive = useSingleConsecRow?.value === 'true';

                        const prefixSettingKey = isSingleConsecutive ? 'boleta_consecutive_prefix' : 'boleta_prefix_faltante';
                        const nextSettingKey = isSingleConsecutive ? 'boleta_consecutive_next' : 'boleta_next_faltante';

                        const prefixRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = ? OR key = 'boleta_consecutive_prefix' ORDER BY CASE WHEN key = ? THEN 1 ELSE 2 END LIMIT 1").get(prefixSettingKey, prefixSettingKey) as { value: string } | undefined;
                        const nextRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = ? OR key = 'boleta_consecutive_next' ORDER BY CASE WHEN key = ? THEN 1 ELSE 2 END LIMIT 1").get(nextSettingKey, nextSettingKey) as { value: string } | undefined;

                        const prefix = prefixRow?.value ?? 'BOL-';
                        const nextNum = parseInt(nextRow?.value || '1', 10);
                        reinjectedBoletaNumero = `${prefix}${String(nextNum).padStart(6, '0')}`;

                        db.prepare("INSERT INTO ops_delivery_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(nextSettingKey, String(nextNum + 1));
                    } catch (e) {
                        reinjectedBoletaNumero = `BOL-${Date.now().toString().slice(-6)}`;
                    }

                    const reinjectedResult = db.prepare(`
                        INSERT INTO ops_delivery_queue (
                            documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por,
                            fecha_registro, entregado, estado, devolucion_asignacion_id, comentario,
                            boleta_numero, referencia_doc, motivo_salida, requiere_autorizacion
                        )
                        VALUES (?, 'boleta', ?, ?, ?, ?, 0, 'pendiente_autorizacion', ?, ?, ?, ?, ?, 1)
                    `).run(
                        newDocNumber,
                        currentDoc.cliente_id,
                        currentDoc.cliente_nombre,
                        data.gestionadoPor || currentDoc.creado_por || 'Chofer en Ruta',
                        localTodayStr,
                        currentDoc.asignacion_id || null,
                        data.comentario || null,
                        reinjectedBoletaNumero,
                        baseOriginalDoc,
                        data.estado === 'incompleto' ? 'faltante' : 'devolucion'
                    );

                    const newDocId = Number(reinjectedResult.lastInsertRowid);
                    if (data.lines && data.lines.length > 0 && newDocId) {
                        const insertLine = db.prepare(`
                            INSERT INTO ops_delivery_lines (delivery_order_id, producto_codigo, producto_descripcion, cantidad_pedida, cantidad_entregada, cantidad_faltante)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `);
                        for (const line of data.lines) {
                            if (line.faltante > 0) {
                                // Para el clon, la cantidad pedida es el remanente real que falta entregar
                                insertLine.run(newDocId, line.codigo, line.desc || '', line.faltante, 0, line.faltante);
                            }
                        }
                    }
                }
            }
        });

        transaction();
        revalidatePath('/dashboard/operations/logistics/deliveries');
        revalidatePath('/dashboard/operations/vouchers');
        revalidatePath('/dashboard/admin/operations/vouchers');

        // --- Dual Notifications Engine (Parallel Dispatch) ---
        try {
            // Re-query current doc to get up-to-date values
            const doc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(id) as any;
            if (doc) {
                if (doc.tipo_documento === 'recoger') {
                    const { triggerCollectUpdateEmail } = require('./actions');
                    await triggerCollectUpdateEmail(id, data.estado, data.comentario);
                    return { success: true };
                }
                // A. Retrieve Info Envío for the template
                let infoEnvio = '';
                if (doc.asignacion_id) {
                    const assignment = db.prepare(`
                        SELECT r.name as ruta_nombre, u.name as chofer_nombre, v.plate as vehiculo_placa, v.brand as vehiculo_marca, v.model as vehiculo_modelo
                        FROM ops_delivery_assignments a
                        JOIN ops_delivery_routes r ON a.ruta_id = r.id
                        JOIN core_users u ON a.empleado_id = u.id
                        JOIN fleet_vehicles v ON a.vehiculo_id = v.id
                        WHERE a.id = ?
                    `).get(doc.asignacion_id) as any;
                    
                    if (assignment) {
                        infoEnvio = `
                            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #e5e7eb;">
                                <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563; font-weight: 600;">Detalles del Despacho:</p>
                                <p style="margin: 0 0 4px 0; font-size: 13px; color: #1f2937;"><strong>Chofer:</strong> ${assignment.chofer_nombre}</p>
                                <p style="margin: 0 0 4px 0; font-size: 13px; color: #1f2937;"><strong>Vehículo:</strong> ${assignment.vehiculo_marca} ${assignment.vehiculo_modelo} (${assignment.vehiculo_placa})</p>
                                <p style="margin: 0; font-size: 13px; color: #1f2937;"><strong>Ruta:</strong> ${assignment.ruta_nombre}</p>
                            </div>
                        `;
                    }
                }

                // Compile discrepancy lines (if any exist)
                const docLines = db.prepare('SELECT producto_codigo as codigo, producto_descripcion as desc, cantidad_pedida as pedida, cantidad_entregada as entregada, cantidad_faltante as faltante FROM ops_delivery_lines WHERE delivery_order_id = ?').all(id) as any[];

                // Determine dynamic status values for template replacement
                let estadoLabel = 'Completado';
                let estadoColor = '#10B981';
                let estadoBg = '#D1FAE5';
                let icon = '✅';

                if (data.estado === 'incompleto') {
                    estadoLabel = 'Entregado con Incidencias';
                    estadoColor = '#D97706';
                    estadoBg = '#FEF3C7';
                    icon = '⚠️';
                } else if (data.estado === 'rechazado') {
                    estadoLabel = 'Rechazado';
                    estadoColor = '#DC2626';
                    estadoBg = '#FEE2E2';
                    icon = '❌';
                }

                // Compile driver comment HTML box if comment exists
                const comentarioHtml = data.comentario ? `
                <div style="background-color: #fdf2f8; border-left: 4px solid #db2777; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #db2777; text-transform: uppercase; letter-spacing: 0.05em;">Notas de la calle / Observación:</p>
                    <p style="margin: 0; font-size: 14px; color: #374151; font-style: italic;">"${data.comentario}"</p>
                </div>
                ` : '';

                // Compile customer signature HTML box if signature exists
                const firmaHtml = data.firmaCliente ? `
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Firma Digital de Recibido:</p>
                    <img src="${data.firmaCliente}" alt="Firma del Cliente" style="max-height: 110px; width: auto; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; display: inline-block;" />
                </div>
                ` : '';

                // Compile differences/discrepancies list HTML if differences exist
                const linesHtml = docLines && docLines.length > 0
                    ? `
                    <div style="margin-top: 20px;">
                        <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #374151;">Detalle de Discrepancias / Incidencias:</p>
                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                            <thead>
                                <tr style="border-bottom: 2px solid #e5e7eb;">
                                    <th style="padding: 8px 4px; color: #4b5563; font-weight: 600;">Código</th>
                                    <th style="padding: 8px 4px; color: #4b5563; font-weight: 600;">Artículo</th>
                                    <th style="padding: 8px 4px; text-align: right; color: #4b5563; font-weight: 600;">Pedida</th>
                                    <th style="padding: 8px 4px; text-align: right; color: #4b5563; font-weight: 600;">Entregada</th>
                                    <th style="padding: 8px 4px; text-align: right; color: #4b5563; font-weight: 600;">Faltante</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${docLines.map(line => {
                                    const hasFaltante = (line.faltante || 0) > 0;
                                    return `
                                    <tr style="border-bottom: 1px solid #f3f4f6; ${hasFaltante ? 'background-color: #fffbeb;' : ''}">
                                        <td style="padding: 8px 4px; font-family: monospace; color: #1f2937;">${line.codigo}</td>
                                        <td style="padding: 8px 4px; color: #4b5563;">${line.desc || 'Artículo sin descripción'}</td>
                                        <td style="padding: 8px 4px; text-align: right; color: #1f2937;">${line.pedida}</td>
                                        <td style="padding: 8px 4px; text-align: right; color: #1f2937;">${line.entregada}</td>
                                        <td style="padding: 8px 4px; text-align: right; font-weight: bold; color: ${hasFaltante ? '#d97706' : '#10b981'};">${line.faltante}</td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    `
                    : '';

                // Compile full products list HTML
                let linesForProducts = docLines;
                if (!linesForProducts || linesForProducts.length === 0) {
                    try {
                        const cleanDocNum = doc.documento_numero.replace('-PARTIAL', '').replace('-RETRY', '');
                        const erpLines = await getDocumentLinesInternal(cleanDocNum, doc.tipo_documento);
                        if (erpLines && erpLines.length > 0) {
                            linesForProducts = erpLines.map(el => ({
                                codigo: el.articulo,
                                desc: el.descripcion,
                                pedida: el.cantidad,
                                entregada: data.estado === 'completo' ? el.cantidad : 0,
                                faltante: data.estado === 'completo' ? 0 : el.cantidad
                            }));
                        }
                    } catch (erpErr) {
                        console.error("Error loading ERP lines for template:", erpErr);
                    }
                }

                const productosHtml = linesForProducts && linesForProducts.length > 0
                    ? `
                    <div style="margin-top: 20px;">
                        <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #374151;">Detalle de Productos:</p>
                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                            <thead>
                                <tr style="border-bottom: 2px solid #e5e7eb;">
                                    <th style="padding: 8px 4px; color: #4b5563; font-weight: 600;">Código</th>
                                    <th style="padding: 8px 4px; color: #4b5563; font-weight: 600;">Descripción</th>
                                    <th style="padding: 8px 4px; text-align: right; color: #4b5563; font-weight: 600;">Cant. Pedida</th>
                                    <th style="padding: 8px 4px; text-align: right; color: #4b5563; font-weight: 600;">Cant. Entregada</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${linesForProducts.map(line => {
                                    return `
                                    <tr style="border-bottom: 1px solid #f3f4f6;">
                                        <td style="padding: 8px 4px; font-family: monospace; color: #1f2937;">${line.codigo}</td>
                                        <td style="padding: 8px 4px; color: #4b5563;">${line.desc || 'Artículo sin descripción'}</td>
                                        <td style="padding: 8px 4px; text-align: right; color: #1f2937;">${line.pedida}</td>
                                        <td style="padding: 8px 4px; text-align: right; color: #1f2937;">${line.entregada}</td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    `
                    : '';

                // Retrieve the notification template from database
                const template = db.prepare("SELECT subject, body FROM notification_templates WHERE eventId = 'onDeliveryUpdate'").get() as { subject: string; body: string } | undefined;

                let emailHtml = '';
                let emailSubject = '';

                if (template) {
                    emailSubject = template.subject
                        .replace(/{{estadoLabel}}/g, estadoLabel)
                        .replace(/{{docNumero}}/g, doc.documento_numero);

                    emailHtml = template.body
                        .replace(/{{estadoColor}}/g, estadoColor)
                        .replace(/{{estadoBg}}/g, estadoBg)
                        .replace(/{{icon}}/g, icon)
                        .replace(/{{estadoLabel}}/g, estadoLabel)
                        .replace(/{{docNumero}}/g, doc.documento_numero)
                        .replace(/{{tipoDoc}}/g, doc.tipo_documento)
                        .replace(/{{clienteNombre}}/g, doc.cliente_nombre)
                        .replace(/{{canal}}/g, data.canal)
                        .replace(/{{gestionadoPor}}/g, data.gestionadoPor)
                        .replace(/{{comentario}}/g, comentarioHtml + firmaHtml)
                        .replace(/{{firmaHtml}}/g, firmaHtml)
                        .replace(/{{infoEnvio}}/g, infoEnvio)
                        .replace(/{{linesHtml}}/g, linesHtml)
                        .replace(/{{productosHtml}}/g, productosHtml);
                } else {
                    const companySettings = db.prepare('SELECT publicUrl FROM core_company_settings WHERE id = 1').get() as { publicUrl?: string } | undefined;
                    const baseAppUrl = companySettings?.publicUrl || 'http://localhost:3000';

                    // Fallback to static email HTML template
                    emailHtml = getPremiumEmailHtml({
                        docNumero: doc.documento_numero,
                        tipoDoc: doc.tipo_documento,
                        clienteNombre: doc.cliente_nombre,
                        estado: data.estado,
                        comentario: data.comentario,
                        gestionadoPor: data.gestionadoPor,
                        canal: data.canal,
                        infoEnvio,
                        lines: docLines,
                        baseAppUrl
                    });
                    emailSubject = `[LOGÍSTICA] Entrega ${data.estado.toUpperCase()} - Doc #${doc.documento_numero}`;
                }

                // Recipient set to prevent sending duplicate emails to the same address
                const sentEmails = new Set<string>();

                // Helper para evaluar preferencias granulares del usuario antes de despachar
                const shouldSendNotification = (userId: number, channel: 'email' | 'telegram', estado: string): boolean => {
                    try {
                        const prefs = db.prepare("SELECT key, value FROM core_user_preferences WHERE userId = ?").all(userId) as { key: string, value: string }[];
                        const map = new Map(prefs.map(p => [p.key, p.value]));

                        // 1. Master switch check
                        const master = map.get('notif_master');
                        if (master === 'false' || master === '0') return false;

                        // 2. Channel check
                        if (channel === 'email') {
                            const chEmail = map.get('notif_channel_email');
                            if (chEmail === 'false' || chEmail === '0') return false;
                        } else if (channel === 'telegram') {
                            const chTg = map.get('notif_channel_telegram');
                            if (chTg === 'false' || chTg === '0') return false;
                        }

                        // 3. Status event check
                        const normEstado = estado.toLowerCase().trim();
                        if (normEstado === 'completo' || normEstado === 'entregado') {
                            const comp = map.get('ops_notif_delivery_completed');
                            if (comp === 'false' || comp === '0') return false;
                            const legacy = map.get('ops_delivery_notifications_enabled');
                            if (comp === undefined && (legacy === 'false' || legacy === '0')) return false;
                        } else if (normEstado === 'incompleto') {
                            const incomp = map.get('ops_notif_delivery_incomplete');
                            if (incomp === 'false' || incomp === '0') return false;
                        } else if (normEstado === 'rechazado' || normEstado === 'no_entregado') {
                            const rej = map.get('ops_notif_delivery_rejected');
                            if (rej === 'false' || rej === '0') return false;
                        }

                        return true;
                    } catch (e) {
                        return true;
                    }
                };

                let spUserId: number | null = null;
                let creatorUserId: number | null = null;

                // --- 1. VENDEDOR (Salesperson) Channel ---
                let salespersonCode: string | null = null;
                
                // Try retrieving salesperson code from ERP invoice headers
                if (doc.tipo_documento === 'factura') {
                    const erpInvoice = db.prepare('SELECT VENDEDOR FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { VENDEDOR: string } | undefined;
                    if (erpInvoice?.VENDEDOR) {
                        salespersonCode = erpInvoice.VENDEDOR;
                    }
                }
                
                // Fallback to customer default salesperson code if needed
                if (!salespersonCode) {
                    const customer = db.prepare('SELECT salesperson FROM core_customers WHERE id = ?').get(doc.cliente_id) as { salesperson: string } | undefined;
                    if (customer?.salesperson) {
                        salespersonCode = customer.salesperson;
                    }
                }

                if (salespersonCode) {
                    const spData = db.prepare('SELECT ACTIVO FROM core_salespersons WHERE VENDEDOR = ?').get(salespersonCode) as { ACTIVO: string } | undefined;
                    if (spData && spData.ACTIVO === 'S') {
                        const spUser = db.prepare('SELECT id, email, employeeId FROM core_users WHERE salespersonId = ?').get(salespersonCode) as { id: number, email: string, employeeId: string | null } | undefined;
                        if (spUser && spUser.email) {
                            spUserId = spUser.id;
                            let spActive = true;
                            if (spUser.employeeId) {
                                const empData = db.prepare('SELECT ACTIVO FROM core_employees WHERE EMPLEADO = ?').get(spUser.employeeId) as { ACTIVO: string } | undefined;
                                if (empData && empData.ACTIVO === 'N') {
                                    spActive = false;
                                    logInfo(`Notifications silenced for salesperson ${salespersonCode} because associated employee ${spUser.employeeId} is inactive.`);
                                }
                            }

                            if (spActive) {
                                const isAllowedEmail = shouldSendNotification(spUser.id, 'email', data.estado);
                                if (isAllowedEmail) {
                                    logInfo(`Sending salesperson notification to ${spUser.email} for code ${salespersonCode}`);
                                    await sendEmail({
                                        to: spUser.email,
                                        subject: emailSubject,
                                        html: emailHtml
                                    });
                                    sentEmails.add(spUser.email.toLowerCase().trim());
                                } else {
                                    logInfo(`Salesperson ${salespersonCode} (${spUser.email}) silenced notification for status '${data.estado}' or email channel.`);
                                }
                            }
                        }
                    } else {
                        logInfo(`Notifications silenced for salesperson ${salespersonCode} because salesperson record is marked inactive.`);
                    }
                }

                // --- 2. ERP CREATOR Channel ---
                const erpAlias = doc.creado_por;
                if (erpAlias) {
                    const creatorUser = db.prepare('SELECT id, email, employeeId, salespersonId FROM core_users WHERE erpAlias = ?').get(erpAlias) as { id: number, email: string, employeeId: string | null, salespersonId: string | null } | undefined;
                    
                    if (creatorUser && creatorUser.email) {
                        creatorUserId = creatorUser.id;
                        const emailClean = creatorUser.email.toLowerCase().trim();
                        // Only proceed if we haven't already sent an email to this address
                        if (!sentEmails.has(emailClean)) {
                            let creatorActive = true;

                            // Check associated employee status
                            if (creatorUser.employeeId) {
                                const empData = db.prepare('SELECT ACTIVO FROM core_employees WHERE EMPLEADO = ?').get(creatorUser.employeeId) as { ACTIVO: string } | undefined;
                                if (empData && empData.ACTIVO === 'N') {
                                    creatorActive = false;
                                    logInfo(`Notifications silenced for ERP Creator ${erpAlias} because associated employee ${creatorUser.employeeId} is inactive.`);
                                }
                            }

                            // Check associated salesperson status
                            if (creatorUser.salespersonId) {
                                const spData = db.prepare('SELECT ACTIVO FROM core_salespersons WHERE VENDEDOR = ?').get(creatorUser.salespersonId) as { ACTIVO: string } | undefined;
                                if (spData && spData.ACTIVO === 'N') {
                                    creatorActive = false;
                                    logInfo(`Notifications silenced for ERP Creator ${erpAlias} because associated salesperson ${creatorUser.salespersonId} is inactive.`);
                                }
                            }

                            if (creatorActive) {
                                const isAllowedEmail = shouldSendNotification(creatorUser.id, 'email', data.estado);
                                if (isAllowedEmail) {
                                    logInfo(`Sending ERP Creator notification to ${creatorUser.email} for alias ${erpAlias}`);
                                    await sendEmail({
                                        to: creatorUser.email,
                                        subject: emailSubject,
                                        html: emailHtml
                                    });
                                } else {
                                    logInfo(`ERP Creator ${erpAlias} (${creatorUser.email}) silenced notification for status '${data.estado}' or email channel.`);
                                }
                            }
                        }
                    }
                }

                // --- 3. TELEGRAM CHANNEL (Vendedor & Creador con Preferencias) ---
                try {
                    const telegramRecipients = new Set<string>();

                    // Resolver Telegram Chat ID del Vendedor (Validando granularidad de Telegram y Estado)
                    if (salespersonCode && spUserId) {
                        if (shouldSendNotification(spUserId, 'telegram', data.estado)) {
                            const { getTelegramChatIdForUser } = await import('@/modules/notifications/lib/telegram-lookup');
                            const spTelegramId = await getTelegramChatIdForUser({ salespersonId: salespersonCode });
                            if (spTelegramId) telegramRecipients.add(spTelegramId);
                        }
                    }

                    // Resolver Telegram Chat ID del Creador (Validando granularidad de Telegram y Estado)
                    if (erpAlias && creatorUserId) {
                        if (shouldSendNotification(creatorUserId, 'telegram', data.estado)) {
                            const { getTelegramChatIdForUser } = await import('@/modules/notifications/lib/telegram-lookup');
                            const creatorTelegramId = await getTelegramChatIdForUser({ userId: creatorUserId });
                            if (creatorTelegramId) telegramRecipients.add(creatorTelegramId);
                        }
                    }

                    // Resolver Telegram Chat IDs de Supervisión (Múltiples chats / grupos)
                    try {
                        const supChatRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'supervisor_telegram_chat_ids'").get() as { value: string } | undefined;
                        const supFilterRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'supervisor_telegram_filter'").get() as { value: string } | undefined;
                        
                        const supChatIdsStr = supChatRow?.value || '';
                        const supFilter = supFilterRow?.value || 'all';

                        let shouldNotifySupervisor = false;
                        if (supFilter === 'all') {
                            shouldNotifySupervisor = true;
                        } else if (supFilter === 'incidents_only') {
                            shouldNotifySupervisor = data.estado === 'incompleto' || data.estado === 'rechazado';
                        } else if (supFilter === 'rejected_only') {
                            shouldNotifySupervisor = data.estado === 'rechazado';
                        }

                        if (shouldNotifySupervisor && supChatIdsStr.trim()) {
                            // Soportar múltiples IDs separados por coma, punto y coma o salto de línea
                            const supChatList = supChatIdsStr
                                .split(/[\n,;]+/)
                                .map(c => c.trim())
                                .filter(Boolean);

                            for (const supChat of supChatList) {
                                telegramRecipients.add(supChat);
                            }
                        }
                    } catch (supErr: any) {
                        logError('Error resolving supervisor telegram chat IDs:', supErr.message);
                    }

                    if (telegramRecipients.size > 0) {
                        const { sendTelegramMessage } = await import('@/modules/notifications/lib/telegram-service');
                        
                        const isCollectDoc = doc.tipo_documento === 'recoger';
                        const docTypeHeader = isCollectDoc ? 'RECOLECTA' : doc.tipo_documento.toUpperCase();
                        const entityLabel = isCollectDoc ? 'Proveedor' : 'Cliente';

                        // Clean text message for Telegram (HTML formatted)
                        const telegramMsg = `
<b>${icon} Actualización de ${docTypeHeader} #${doc.documento_numero}</b>

<b>Estado:</b> ${estadoLabel}
<b>${entityLabel}:</b> ${doc.cliente_nombre}
<b>Tipo:</b> ${docTypeHeader}
${data.comentario ? `<b>Notas:</b> <i>"${data.comentario}"</i>\n` : ''}<b>Gestionado por:</b> ${data.gestionadoPor} (${data.canal})
`.trim();

                        for (const chatId of telegramRecipients) {
                            try {
                                await sendTelegramMessage(telegramMsg, chatId);
                                logInfo(`Telegram notification sent for delivery ${doc.documento_numero} to Chat ID: ${chatId}`);
                            } catch (tgErr: any) {
                                logError(`Error sending Telegram notification to Chat ID: ${chatId}`, { error: tgErr.message });
                            }
                        }
                    }
                } catch (tgChannelErr: any) {
                    logError('Error in Telegram notification dispatch:', tgChannelErr.message);
                }
            }
        } catch (mailErr: any) {
            logError('Error dispatching dual notifications:', mailErr.message);
        }

        return { success: true };
    } catch (e: any) {
        // Limpieza de archivos guardados si la transacción falló
        if (savedFileNames.length > 0) {
            try {
                const { deleteFleetFile } = await import('@/modules/fleet/lib/files');
                for (const fName of savedFileNames) {
                    await deleteFleetFile(fName);
                }
            } catch (_) {}
        }
        logError('Error updating delivery status:', e.message);
        return { success: false, error: e.message };
    }
}

export function getPremiumEmailHtml({
    docNumero,
    tipoDoc,
    clienteNombre,
    estado,
    comentario,
    gestionadoPor,
    canal,
    infoEnvio,
    lines,
    baseAppUrl = 'http://localhost:3000'
}: {
    docNumero: string;
    tipoDoc: string;
    clienteNombre: string;
    estado: string;
    comentario?: string;
    gestionadoPor: string;
    canal: string;
    infoEnvio: string;
    lines?: any[];
    baseAppUrl?: string;
}) {
    let estadoLabel = 'Completado';
    let estadoColor = '#10B981';
    let estadoBg = '#D1FAE5';
    let icon = '✅';

    if (estado === 'incompleto') {
        estadoLabel = 'Entregado con Incidencias';
        estadoColor = '#D97706';
        estadoBg = '#FEF3C7';
        icon = '⚠️';
    } else if (estado === 'rechazado') {
        estadoLabel = 'Rechazado';
        estadoColor = '#DC2626';
        estadoBg = '#FEE2E2';
        icon = '❌';
    }

    const linesHtml = lines && lines.length > 0
        ? `
        <div style="margin-top: 20px;">
            <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #374151;">Detalle de Discrepancias / Incidencias:</p>
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                    <tr style="border-bottom: 2px solid #e5e7eb;">
                        <th style="padding: 8px 4px; color: #4b5563; font-weight: 600;">Código</th>
                        <th style="padding: 8px 4px; color: #4b5563; font-weight: 600;">Artículo</th>
                        <th style="padding: 8px 4px; text-align: right; color: #4b5563; font-weight: 600;">Pedida</th>
                        <th style="padding: 8px 4px; text-align: right; color: #4b5563; font-weight: 600;">Entregada</th>
                        <th style="padding: 8px 4px; text-align: right; color: #4b5563; font-weight: 600;">Faltante</th>
                    </tr>
                </thead>
                <tbody>
                    ${lines.map(line => {
                        const hasFaltante = (line.faltante || 0) > 0;
                        return `
                        <tr style="border-bottom: 1px solid #f3f4f6; ${hasFaltante ? 'background-color: #fffbeb;' : ''}">
                            <td style="padding: 8px 4px; font-family: monospace; color: #1f2937;">${line.codigo}</td>
                            <td style="padding: 8px 4px; color: #4b5563;">${line.desc || 'Artículo sin descripción'}</td>
                            <td style="padding: 8px 4px; text-align: right; color: #1f2937;">${line.pedida}</td>
                            <td style="padding: 8px 4px; text-align: right; color: #1f2937;">${line.entregada}</td>
                            <td style="padding: 8px 4px; text-align: right; font-weight: bold; color: ${hasFaltante ? '#d97706' : '#10b981'};">${line.faltante}</td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        `
        : '';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Notificación de Entrega - Clic-Tools</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); overflow: hidden; border: 1px solid #f3f4f6;">
            <!-- Header Banner -->
            <div style="background-color: #2563eb; padding: 24px; text-align: center; color: #ffffff;">
                <span style="font-size: 32px; display: block; margin-bottom: 8px;">${icon}</span>
                <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">Estado de la Entrega: ${estadoLabel}</h2>
            </div>
            
            <!-- Content -->
            <div style="padding: 24px; color: #374151; line-height: 1.5;">
                <p style="margin: 0 0 16px 0; font-size: 15px;">Estimado cliente/colaborador, se ha registrado un movimiento en el sistema de logística de entregas:</p>
                
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
                            <td style="padding: 4px 0; color: #6b7280;">Gestor / Chofer:</td>
                            <td style="padding: 4px 0; color: #111827; font-weight: 500;">${gestionadoPor}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #6b7280;">Vía Registro:</td>
                            <td style="padding: 4px 0; color: #111827; font-weight: 500; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">${canal}</td>
                        </tr>
                    </table>
                </div>

                ${comentario ? `
                <div style="background-color: #fdf2f8; border-left: 4px solid #db2777; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #db2777; text-transform: uppercase; letter-spacing: 0.05em;">Notas de la calle / Observación:</p>
                    <p style="margin: 0; font-size: 14px; color: #374151; font-style: italic;">"${comentario}"</p>
                </div>
                ` : ''}

                ${infoEnvio}

                ${linesHtml}

                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                    <a href="${baseAppUrl}/dashboard/operations/logistics/deliveries" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
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
