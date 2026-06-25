import { getDb } from '@/modules/core/lib/db';
import { getBusinessDateStr } from '@/modules/core/lib/timezone';
import { revalidatePath } from 'next/cache';
import { logInfo, logWarn, logError } from '@/modules/core/lib/logger';
import { sendEmail } from '@/modules/core/lib/email-service';

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
        comentario?: string;
        canal: 'telegram' | 'web';
        gestionadoPor: string;
        lines?: { codigo: string; desc?: string; pedida: number; entregada: number; faltante: number }[];
        releaseCodeId?: number;
        fotoEvidencia?: string | null;
        fotoFactura?: string | null;
    }
): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    try {
        const localTodayStr = await getBusinessDateStr();
        const transaction = db.transaction(() => {
            const todayStr = new Date().toISOString();
            const entregadoFlag = data.estado === 'completo' ? 1 : 0; // If complete, it is delivered and archived (1)

            // 1. Get current document details
            const currentDoc = db.prepare('SELECT * FROM ops_delivery_queue WHERE id = ?').get(id) as any;
            if (!currentDoc) throw new Error('Documento no encontrado en la cola.');

            // 2. Update the queue record
            db.prepare(`
                UPDATE ops_delivery_queue
                SET estado = ?, comentario = ?, canal_registro = ?, gestionado_por = ?, entregado = ?, fecha_entrega = ?
                    ${data.releaseCodeId !== undefined ? ', release_code_id = ?' : ''}
                    ${data.fotoEvidencia !== undefined ? ', foto_evidencia = ?' : ''}
                    ${data.fotoFactura !== undefined ? ', foto_factura = ?' : ''}
                WHERE id = ?
            `).run(
                data.estado, 
                data.comentario || null, 
                data.canal, 
                data.gestionadoPor, 
                entregadoFlag, 
                todayStr, 
                ...(data.releaseCodeId !== undefined ? [data.releaseCodeId] : []),
                ...(data.fotoEvidencia !== undefined ? [data.fotoEvidencia] : []),
                ...(data.fotoFactura !== undefined ? [data.fotoFactura] : []),
                id
            );

            // 3. Clear existing lock
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(id);

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

            // 5. Reinyección: If incomplete or rejected, automatically clone and re-inject back to general queue (delivered = 0, state = 'pendiente', assignment = null)
            if (currentDoc.tipo_documento !== 'recoger' && (data.estado === 'incompleto' || data.estado === 'rechazado')) {
                db.prepare(`
                    INSERT INTO ops_delivery_queue (documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por, fecha_registro, entregado, estado)
                    VALUES (?, ?, ?, ?, ?, ?, 0, 'pendiente')
                `).run(
                    currentDoc.documento_numero + (data.estado === 'incompleto' ? '-PARTIAL' : '-RETRY'),
                    currentDoc.tipo_documento,
                    currentDoc.cliente_id,
                    currentDoc.cliente_nombre,
                    currentDoc.creado_por,
                    localTodayStr
                );
            }
        });

        transaction();
        revalidatePath('/dashboard/operations/logistics/deliveries');

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
                        .replace(/{{comentario}}/g, comentarioHtml)
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
                    // Check active state of salesperson in ERP
                    const spData = db.prepare('SELECT ACTIVO, NOMBRE FROM core_salespersons WHERE VENDEDOR = ?').get(salespersonCode) as { ACTIVO: string, NOMBRE: string } | undefined;
                    
                    if (!spData || spData.ACTIVO !== 'N') {
                        // Resolve system profile
                        const spUser = db.prepare('SELECT id, email, employeeId FROM core_users WHERE salespersonId = ?').get(salespersonCode) as { id: string, email: string, employeeId: string | null } | undefined;
                        
                        if (spUser && spUser.email) {
                            let spActive = true;
                            
                            // Check if employee is inactive
                            if (spUser.employeeId) {
                                const empData = db.prepare('SELECT ACTIVO FROM core_employees WHERE EMPLEADO = ?').get(spUser.employeeId) as { ACTIVO: string } | undefined;
                                if (empData && empData.ACTIVO === 'N') {
                                    spActive = false;
                                    logInfo(`Notifications silenced for salesperson ${salespersonCode} because associated employee ${spUser.employeeId} is inactive.`);
                                }
                            }

                            if (spActive) {
                                // Check salesperson preferences
                                const spPref = db.prepare("SELECT value FROM core_user_preferences WHERE userId = ? AND key = 'ops_delivery_notifications_enabled'").get(spUser.id) as { value: string } | undefined;
                                
                                const isEnabled = spPref ? (spPref.value === 'true' || spPref.value === '1') : true;
                                
                                if (isEnabled) {
                                    logInfo(`Sending salesperson notification to ${spUser.email} for code ${salespersonCode}`);
                                    await sendEmail({
                                        to: spUser.email,
                                        subject: emailSubject,
                                        html: emailHtml
                                    });
                                    sentEmails.add(spUser.email.toLowerCase().trim());
                                } else {
                                    logInfo(`Salesperson ${salespersonCode} (${spUser.email}) has delivery notifications disabled.`);
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
                    const creatorUser = db.prepare('SELECT id, email, employeeId, salespersonId FROM core_users WHERE erpAlias = ?').get(erpAlias) as { id: string, email: string, employeeId: string | null, salespersonId: string | null } | undefined;
                    
                    if (creatorUser && creatorUser.email) {
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
                                logInfo(`Sending ERP Creator notification to ${creatorUser.email} for alias ${erpAlias}`);
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
            logError('Error dispatching dual notifications:', mailErr.message);
        }

        return { success: true };
    } catch (e: any) {
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
