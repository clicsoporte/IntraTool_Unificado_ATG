'use server';

import { getDb } from '@/modules/core/lib/db';
import { getCurrentUser } from '@/modules/core/lib/auth';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import { logInfo, logError } from '@/modules/core/lib/logger';

export interface AuditFilterParams {
    documentoNumero?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    clienteNombre?: string;
    choferNombre?: string;
    vehiculoPlaca?: string;
    estado?: string;
    searchTerm?: string;
    page?: number;
    pageSize?: number;
}

export async function searchDeliveryAuditLogs(filters: AuditFilterParams): Promise<{ success: boolean; data?: any[]; totalCount?: number; totalPages?: number; page?: number; pageSize?: number; error?: string }> {
    const user = await getCurrentUser();
    if (!user) {
        return { success: false, error: 'Usuario no autenticado.' };
    }

    const db = await getDb();
    try {
        let whereSql = ` WHERE 1=1`;
        const params: any[] = [];

        // Scoping check for sales/creators if user does NOT have global audit permission
        const hasGlobalAudit = user.role === 'admin' || user.role === 'superadmin' || user.role === 'logistics_manager';
        if (!hasGlobalAudit && (user.erpAlias || user.salespersonId)) {
            whereSql += ` AND (q.creado_por = ? OR h.VENDEDOR = ?)`;
            params.push(user.erpAlias || '', user.salespersonId || '');
        }

        if (filters.documentoNumero && filters.documentoNumero.trim() !== '') {
            whereSql += ` AND q.documento_numero LIKE ?`;
            params.push(`%${filters.documentoNumero.trim()}%`);
        }

        if (filters.fechaDesde && filters.fechaDesde.trim() !== '') {
            const fDesde = filters.fechaDesde.trim();
            whereSql += ` AND (h.FECHA >= ? OR q.fecha_entrega >= ? OR q.fecha_registro >= ?)`;
            params.push(fDesde, fDesde, fDesde);
        }

        if (filters.fechaHasta && filters.fechaHasta.trim() !== '') {
            const fHastaDate = filters.fechaHasta.trim();
            const fHastaIso = `${fHastaDate}T23:59:59`;
            whereSql += ` AND (h.FECHA <= ? OR q.fecha_entrega <= ? OR q.fecha_registro <= ?)`;
            params.push(fHastaDate, fHastaIso, fHastaIso);
        }

        if (filters.clienteNombre && filters.clienteNombre.trim() !== '') {
            whereSql += ` AND (q.cliente_nombre LIKE ? OR q.cliente_id LIKE ? OR c.name LIKE ?)`;
            const term = `%${filters.clienteNombre.trim()}%`;
            params.push(term, term, term);
        }

        if (filters.choferNombre && filters.choferNombre.trim() !== '') {
            whereSql += ` AND u.name LIKE ?`;
            params.push(`%${filters.choferNombre.trim()}%`);
        }

        if (filters.vehiculoPlaca && filters.vehiculoPlaca.trim() !== '') {
            whereSql += ` AND v.plate LIKE ?`;
            params.push(`%${filters.vehiculoPlaca.trim()}%`);
        }

        if (filters.estado === 'procesados' || !filters.estado) {
            whereSql += ` AND q.estado NOT IN ('pendiente', 'en_ruta')`;
        } else if (filters.estado !== 'todos' && filters.estado.trim() !== '') {
            whereSql += ` AND q.estado = ?`;
            params.push(filters.estado.trim());
        }

        if (filters.searchTerm && filters.searchTerm.trim() !== '') {
            whereSql += ` AND (q.documento_numero LIKE ? OR q.cliente_nombre LIKE ? OR q.comentario LIKE ?)`;
            const term = `%${filters.searchTerm.trim()}%`;
            params.push(term, term, term);
        }

        // Count Total Records
        const countSql = `
            SELECT COUNT(*) as count 
            FROM ops_delivery_queue q
            LEFT JOIN core_erp_invoice_headers h ON q.documento_numero = h.FACTURA
            LEFT JOIN ops_delivery_assignments a ON (q.asignacion_id = a.id OR q.devolucion_asignacion_id = a.id)
            LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
            LEFT JOIN core_users u ON a.empleado_id = u.id
            LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            LEFT JOIN core_customers c ON q.cliente_id = c.id
            ${whereSql}
        `;
        const countRow = db.prepare(countSql).get(...params) as { count: number };
        const totalCount = countRow?.count || 0;

        let query = `
            SELECT 
                q.id,
                q.documento_numero,
                q.tipo_documento,
                q.cliente_id,
                q.cliente_nombre,
                q.creado_por,
                COALESCE(h.VENDEDOR, q.creado_por) as vendedor,
                h.FECHA as fecha_factura_erp,
                h.FECHA_ENTREGA as fecha_promesa_erp,
                a.fecha as fecha_asignacion_ruta,
                q.fecha_registro,
                q.fecha_entrega,
                q.estado,
                q.comentario,
                q.foto_evidencia,
                q.foto_factura,
                q.firma_cliente,
                q.nombre_recibe,
                q.latitud,
                q.longitud,
                q.hora_ingreso_geocerca,
                q.hora_entrega_efectiva,
                q.hora_salida_geocerca,
                q.tiempo_descarga_min,
                q.tiempo_espera_post_entrega_min,
                q.tiempo_total_permanencia_min,
                a.fecha as asignacion_fecha,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                v.brand as vehiculo_marca,
                v.model as vehiculo_modelo,
                c.phone as cliente_telefono,
                c.address as cliente_direccion,
                h.EMBARCAR_A as direccion_embarque_erp,
                h.DIREC_EMBARQUE as direccion_factura_erp
            FROM ops_delivery_queue q
            LEFT JOIN core_erp_invoice_headers h ON q.documento_numero = h.FACTURA
            LEFT JOIN ops_delivery_assignments a ON (q.asignacion_id = a.id OR q.devolucion_asignacion_id = a.id)
            LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
            LEFT JOIN core_users u ON a.empleado_id = u.id
            LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            LEFT JOIN core_customers c ON q.cliente_id = c.id
            ${whereSql}
            ORDER BY q.id DESC
        `;

        const curPage = filters.page || 1;
        const curSize = filters.pageSize || 25;
        const limit = Number(curSize);
        const offset = (Number(curPage) - 1) * limit;

        query += ` LIMIT ? OFFSET ?`;
        const pageParams = [...params, limit, offset];

        const rawRows = db.prepare(query).all(...pageParams);
        const rows = JSON.parse(JSON.stringify(rawRows));
        const totalPages = Math.ceil(totalCount / limit) || 1;

        return { success: true, data: rows, totalCount, totalPages, page: curPage, pageSize: curSize };
    } catch (e: any) {
        logError('Error in searchDeliveryAuditLogs:', e.message);
        return { success: false, error: e.message };
    }
}

export async function exportDeliveryAuditLogsToCsv(filters: AuditFilterParams): Promise<{ success: boolean; csvContent?: string; filename?: string; error?: string }> {
    // Export up to 10,000 matching records without pagination truncation
    const res = await searchDeliveryAuditLogs({ ...filters, page: 1, pageSize: 10000 });
    if (!res.success || !res.data) {
        return { success: false, error: res.error || 'Error al obtener datos para exportación.' };
    }

    try {
        const headers = [
            'Documento',
            'Tipo Documento',
            'Estado',
            'Fecha Factura ERP',
            'Fecha Asignacion Ruta',
            'Fecha Entrega Efectiva',
            'Fecha Registro Cola',
            'Fecha Promesa ERP',
            'Cliente ID',
            'Nombre Cliente',
            'Chofer',
            'Vehiculo / Placa',
            'Ruta',
            'Vendedor ERP',
            'Creador ERP',
            'Hora Arribo Bodega',
            'Hora Entrega Efectiva',
            'Hora Salida Bodega',
            'Minutos Descarga',
            'Minutos Espera',
            'Minutos Permanencia Total',
            'Evidencias (Fotos)',
            'Tiene Foto Factura',
            'Tiene Foto Paquetes',
            'Observacion o Comentario de Calle',
            'Direccion Embarque (EMB)',
            'Coordenadas Lat/Lng'
        ];

        const csvLines = [headers.join(',')];

        res.data.forEach(item => {
            const hasPhotos = item.foto_factura || item.foto_evidencia ? 'Si' : 'No';
            const vehiculoStr = item.vehiculo_placa ? `${item.vehiculo_marca || ''} (${item.vehiculo_placa})` : '';
            const direccionStr = item.direccion_embarque_erp || item.cliente_direccion || item.direccion_factura_erp || '';

            const row = [
                `"${(item.documento_numero || '').replace(/"/g, '""')}"`,
                `"${(item.tipo_documento || '').replace(/"/g, '""')}"`,
                `"${(item.estado || '').replace(/"/g, '""')}"`,
                `"${(item.fecha_factura_erp || '').replace(/"/g, '""')}"`,
                `"${(item.fecha_asignacion_ruta || item.asignacion_fecha || '').replace(/"/g, '""')}"`,
                `"${(item.hora_entrega_efectiva || item.fecha_entrega || '').replace(/"/g, '""')}"`,
                `"${(item.fecha_registro || '').replace(/"/g, '""')}"`,
                `"${(item.fecha_promesa_erp || '').replace(/"/g, '""')}"`,
                `"${(item.cliente_id || '').replace(/"/g, '""')}"`,
                `"${(item.cliente_nombre || '').replace(/"/g, '""')}"`,
                `"${(item.chofer_nombre || 'No asignado').replace(/"/g, '""')}"`,
                `"${vehiculoStr.replace(/"/g, '""')}"`,
                `"${(item.ruta_nombre || '').replace(/"/g, '""')}"`,
                `"${(item.vendedor || '').replace(/"/g, '""')}"`,
                `"${(item.creado_por || '').replace(/"/g, '""')}"`,
                `"${(item.hora_ingreso_geocerca || '').replace(/"/g, '""')}"`,
                `"${(item.hora_entrega_efectiva || item.fecha_entrega || '').replace(/"/g, '""')}"`,
                `"${(item.hora_salida_geocerca || '').replace(/"/g, '""')}"`,
                `"${item.tiempo_descarga_min || 0}"`,
                `"${item.tiempo_espera_post_entrega_min || 0}"`,
                `"${item.tiempo_total_permanencia_min || 0}"`,
                `"${hasPhotos}"`,
                `"${item.foto_factura ? 'Si' : 'No'}"`,
                `"${item.foto_evidencia ? 'Si' : 'No'}"`,
                `"${(item.comentario || '').replace(/"/g, '""')}"`,
                `"${direccionStr.replace(/"/g, '""')}"`,
                `"${item.latitud && item.longitud ? `${item.latitud},${item.longitud}` : ''}"`
            ];
            csvLines.push(row.join(','));
        });

        const csvContent = '\uFEFF' + csvLines.join('\n'); // Add UTF-8 BOM for Excel
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `Reporte_Auditoria_Entregas_${dateStr}.csv`;

        logInfo(`Exportado reporte de auditoría de entregas a CSV: ${res.data.length} registros`);
        return { success: true, csvContent, filename };
    } catch (e: any) {
        logError('Error generating CSV export:', e.message);
        return { success: false, error: e.message };
    }
}

export async function getDeliveryDocumentDetail(docId: number): Promise<{
    success: boolean;
    data?: {
        doc: any;
        lines: Array<{ codigo: string; desc: string; pedida: number; entregada: number; faltante: number }>;
        company: any;
    };
    error?: string;
}> {
    const db = await getDb();
    try {
        const doc = db.prepare(`
            SELECT 
                q.*,
                r.name as ruta_nombre,
                u.name as chofer_nombre,
                v.plate as vehiculo_placa,
                v.brand as vehiculo_marca,
                v.model as vehiculo_modelo,
                c.phone as cliente_telefono,
                c.address as cliente_direccion,
                h.EMBARCAR_A as direccion_embarque_erp,
                h.DIREC_EMBARQUE as direccion_factura_erp,
                h.VENDEDOR as vendedor
            FROM ops_delivery_queue q
            LEFT JOIN core_erp_invoice_headers h ON q.documento_numero = h.FACTURA
            LEFT JOIN ops_delivery_assignments a ON (q.asignacion_id = a.id OR q.devolucion_asignacion_id = a.id)
            LEFT JOIN ops_delivery_routes r ON a.ruta_id = r.id
            LEFT JOIN core_users u ON a.empleado_id = u.id
            LEFT JOIN fleet_vehicles v ON a.vehiculo_id = v.id
            LEFT JOIN core_customers c ON q.cliente_id = c.id
            WHERE q.id = ?
        `).get(docId) as any;

        if (!doc) {
            return { success: false, error: 'Documento no encontrado.' };
        }

        // 1. Obtener líneas reportadas en ops_delivery_lines
        let lines = db.prepare(`
            SELECT 
                producto_codigo as codigo, 
                producto_descripcion as desc, 
                cantidad_pedida as pedida, 
                cantidad_entregada as entregada, 
                cantidad_faltante as faltante 
            FROM ops_delivery_lines 
            WHERE delivery_order_id = ?
        `).all(doc.id) as any[];

        // 2. Si no tiene líneas reportadas (ej. entrega completa sin discrepancias), traer las líneas de la factura ERP
        if (!lines || lines.length === 0) {
            if (doc.tipo_documento === 'factura') {
                const erpLines = db.prepare(`
                    SELECT 
                        l.ARTICULO as codigo, 
                        COALESCE(p.description, l.DESCRIPCION, l.ARTICULO) as desc, 
                        l.CANTIDAD as pedida, 
                        l.CANTIDAD as entregada, 
                        0 as faltante 
                    FROM core_erp_invoice_lines l
                    LEFT JOIN core_products p ON l.ARTICULO = p.id
                    WHERE l.FACTURA = ?
                `).all(doc.documento_numero) as any[];
                if (erpLines && erpLines.length > 0) {
                    lines = erpLines;
                }
            } else if (doc.tipo_documento === 'pedido') {
                const orderLines = db.prepare(`
                    SELECT 
                        l.ARTICULO as codigo, 
                        (SELECT description FROM core_products WHERE id = l.ARTICULO) as desc, 
                        l.CANTIDAD_PEDIDA as pedida, 
                        l.CANTIDAD_PEDIDA as entregada, 
                        0 as faltante 
                    FROM core_erp_order_lines l
                    WHERE l.PEDIDO = ?
                `).all(doc.documento_numero) as any[];
                if (orderLines && orderLines.length > 0) {
                    lines = orderLines;
                }
            }
        }

        const { getCompanySettings } = await import('@/modules/core/lib/db');
        const company = await getCompanySettings();

        return {
            success: true,
            data: {
                doc,
                lines: lines || [],
                company: company || {
                    name: 'INDUSTRIAS GAREND S.A',
                    taxId: '3101133082',
                    address: 'Alajuela, Poás, Carrillos bajo, del EBAIS 700 oeste.',
                    phone: '+50624584343',
                    email: 'ventas@industriasgarend.com'
                }
            }
        };
    } catch (e: any) {
        logError('Error getting delivery document detail:', e.message);
        return { success: false, error: e.message };
    }
}
