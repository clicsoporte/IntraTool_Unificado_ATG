/**
 * @fileoverview Server-side functions for the new IT Tools module database.
 * This file handles all direct interactions with the unified database.
 */
"use server";

import { getDb } from '@/modules/core/lib/db';
import type { ITNote } from '@/modules/core/types';
import { IT_TOOLS_TABLES } from './schema';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import { getCurrentUser } from '@/modules/core/lib/auth';
import { sendEmail } from '@/modules/core/lib/email-service';

// Note management functions
export async function getNotes(): Promise<ITNote[]> {
    const db = await getDb();
    const notes = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.notes} ORDER BY updatedAt DESC`).all() as ITNote[];
    return JSON.parse(JSON.stringify(notes));
}

export async function saveNote(note: Omit<ITNote, 'id' | 'createdAt' | 'updatedAt'> & { id?: number }): Promise<ITNote> {
    await authorizeAction(note.id ? 'it-tools:notes:update' : 'it-tools:notes:create');
    const db = await getDb();
    const now = new Date().toISOString();

    if (note.id) { // Update
        db.prepare(
            `UPDATE ${IT_TOOLS_TABLES.notes} SET title = ?, content = ?, linkedModule = ?, updatedAt = ? WHERE id = ?`
        ).run(note.title, note.content, note.linkedModule || null, now, note.id);
        const updatedNote = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.notes} WHERE id = ?`).get(note.id) as ITNote;
        return updatedNote;
    } else { // Create
        const info = db.prepare(
            `INSERT INTO ${IT_TOOLS_TABLES.notes} (title, content, linkedModule, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(note.title, note.content, note.linkedModule || null, note.createdBy, now, now);
        const newNote = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.notes} WHERE id = ?`).get(info.lastInsertRowid) as ITNote;
        return newNote;
    }
}

export async function deleteNote(id: number): Promise<void> {
    await authorizeAction('it-tools:notes:delete');
    const db = await getDb();
    db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.notes} WHERE id = ?`).run(id);
}

// Branches (Sucursales) functions
export async function getItBranches(): Promise<any[]> {
    const db = await getDb();
    const branches = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.branches} ORDER BY code ASC`).all();
    return JSON.parse(JSON.stringify(branches));
}

export async function saveItBranch(branch: { id?: number; name: string; code: string; is_active: number }): Promise<any> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    const now = new Date().toISOString();
    if (branch.id) {
        db.prepare(
            `UPDATE ${IT_TOOLS_TABLES.branches} SET name = ?, code = ?, is_active = ? WHERE id = ?`
        ).run(branch.name, branch.code, branch.is_active, branch.id);
        return db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.branches} WHERE id = ?`).get(branch.id);
    } else {
        const info = db.prepare(
            `INSERT INTO ${IT_TOOLS_TABLES.branches} (name, code, is_active, created_at) VALUES (?, ?, ?, ?)`
        ).run(branch.name, branch.code, branch.is_active, now);
        return db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.branches} WHERE id = ?`).get(info.lastInsertRowid);
    }
}

export async function deleteItBranch(id: number): Promise<void> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.branches} WHERE id = ?`).run(id);
}

// Licenses Catalog functions
export async function getItLicensesCatalog(): Promise<any[]> {
    const db = await getDb();
    const licenses = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.licensesCatalog} ORDER BY name ASC`).all();
    return JSON.parse(JSON.stringify(licenses));
}

export async function saveItLicenseCatalog(license: { id?: number; name: string; description: string }): Promise<any> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    const now = new Date().toISOString();
    if (license.id) {
        db.prepare(
            `UPDATE ${IT_TOOLS_TABLES.licensesCatalog} SET name = ?, description = ? WHERE id = ?`
        ).run(license.name, license.description, license.id);
        return db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.licensesCatalog} WHERE id = ?`).get(license.id);
    } else {
        const info = db.prepare(
            `INSERT INTO ${IT_TOOLS_TABLES.licensesCatalog} (name, description, created_at) VALUES (?, ?, ?)`
        ).run(license.name, license.description, now);
        return db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.licensesCatalog} WHERE id = ?`).get(info.lastInsertRowid);
    }
}

export async function deleteItLicenseCatalog(id: number): Promise<void> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.licensesCatalog} WHERE id = ?`).run(id);
}

// Assets functions
export async function getItAssets(): Promise<any[]> {
    const db = await getDb();
    const assets = db.prepare(`
        SELECT a.*, b.name as branch_name, b.code as branch_code,
               asg.id as assignment_id, asg.assignee_type, asg.user_id, asg.employee_code, asg.assigned_date, asg.assigned_by,
               u.name as user_name, u.email as user_email,
               e.NOMBRE as employee_name, e.ACTIVO as employee_status
        FROM ${IT_TOOLS_TABLES.assets} a
        LEFT JOIN ${IT_TOOLS_TABLES.branches} b ON a.branch_id = b.id
        LEFT JOIN ${IT_TOOLS_TABLES.assetAssignments} asg ON a.id = asg.asset_id AND asg.returned_date IS NULL
        LEFT JOIN core_users u ON asg.user_id = u.id
        LEFT JOIN core_employees e ON asg.employee_code = e.EMPLEADO
        ORDER BY a.created_at DESC
    `).all();
    return JSON.parse(JSON.stringify(assets));
}

export async function getItAssetById(id: number): Promise<any> {
    const db = await getDb();
    const asset = db.prepare(`
        SELECT a.*, b.name as branch_name, b.code as branch_code
        FROM ${IT_TOOLS_TABLES.assets} a
        LEFT JOIN ${IT_TOOLS_TABLES.branches} b ON a.branch_id = b.id
        WHERE a.id = ?
    `).get(id);
    if (!asset) return null;

    const components = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assetComponents} WHERE parent_asset_id = ?`).all(id);
    const licenses = db.prepare(`
        SELECT al.*, lc.name as license_name
        FROM ${IT_TOOLS_TABLES.assetLicenses} al
        JOIN ${IT_TOOLS_TABLES.licensesCatalog} lc ON al.license_catalog_id = lc.id
        WHERE al.asset_id = ?
    `).all(id);
    const assignments = db.prepare(`
        SELECT asg.*, 
               u.name as user_name, u.email as user_email,
               e.NOMBRE as employee_name
        FROM ${IT_TOOLS_TABLES.assetAssignments} asg
        LEFT JOIN core_users u ON asg.user_id = u.id
        LEFT JOIN core_employees e ON asg.employee_code = e.EMPLEADO
        WHERE asg.asset_id = ?
        ORDER BY asg.assigned_date DESC
    `).all(id);

    const tickets = db.prepare(`
        SELECT id, consecutive, subject, status, priority, created_at, created_by
        FROM repair_tickets
        WHERE linked_asset_id = ?
        ORDER BY created_at DESC
    `).all(id);

    return JSON.parse(JSON.stringify({
        ...asset,
        components,
        licenses,
        assignments,
        tickets
    }));
}

export async function saveItAsset(asset: any): Promise<any> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    
    // Check serial number uniqueness
    const existing = db.prepare(`SELECT id FROM ${IT_TOOLS_TABLES.assets} WHERE serial_number = ?`).get(asset.serial_number) as { id: number } | undefined;
    if (existing && (!asset.id || existing.id !== Number(asset.id))) {
        throw new Error("El número de serie ingresado ya está registrado en otro equipo.");
    }

    const now = new Date().toISOString();
    
    const assetData = {
        item_id: asset.item_id || null,
        category: asset.category,
        brand: asset.brand,
        model: asset.model,
        serial_number: asset.serial_number,
        status: asset.status || 'active',
        purchase_date: asset.purchase_date || null,
        purchase_cost: asset.purchase_cost !== undefined && asset.purchase_cost !== '' ? Number(asset.purchase_cost) : null,
        currency: asset.currency || 'CRC',
        exchange_rate: asset.exchange_rate !== undefined && asset.exchange_rate !== '' ? Number(asset.exchange_rate) : 1.0,
        warranty_expiration: asset.warranty_expiration || null,
        invoice_url: asset.invoice_url || null,
        warranty_cert_url: asset.warranty_cert_url || null,
        branch_id: Number(asset.branch_id),
        notes: asset.notes || null,
        imei: asset.imei || null,
        phone_number: asset.phone_number || null,
        telephony_provider: asset.telephony_provider || null,
        data_plan_start: asset.data_plan_start || null,
        data_plan_end: asset.data_plan_end || null,
        data_plan_renewal: asset.data_plan_renewal || null,
        created_at: now
    };

    if (asset.id) {
        db.prepare(`
            UPDATE ${IT_TOOLS_TABLES.assets} SET
                item_id = @item_id, category = @category, brand = @brand, model = @model,
                serial_number = @serial_number, status = @status, purchase_date = @purchase_date,
                purchase_cost = @purchase_cost, currency = @currency, exchange_rate = @exchange_rate,
                warranty_expiration = @warranty_expiration, invoice_url = @invoice_url,
                warranty_cert_url = @warranty_cert_url, branch_id = @branch_id, notes = @notes,
                imei = @imei, phone_number = @phone_number, telephony_provider = @telephony_provider,
                data_plan_start = @data_plan_start, data_plan_end = @data_plan_end, data_plan_renewal = @data_plan_renewal
            WHERE id = @id
        `).run({ ...assetData, id: asset.id });
        return getItAssetById(asset.id);
    } else {
        const info = db.prepare(`
            INSERT INTO ${IT_TOOLS_TABLES.assets} (
                item_id, category, brand, model, serial_number, status, purchase_date,
                purchase_cost, currency, exchange_rate, warranty_expiration, invoice_url,
                warranty_cert_url, branch_id, notes, imei, phone_number, telephony_provider,
                data_plan_start, data_plan_end, data_plan_renewal, created_at
            ) VALUES (
                @item_id, @category, @brand, @model, @serial_number, @status, @purchase_date,
                @purchase_cost, @currency, @exchange_rate, @warranty_expiration, @invoice_url,
                @warranty_cert_url, @branch_id, @notes, @imei, @phone_number, @telephony_provider,
                @data_plan_start, @data_plan_end, @data_plan_renewal, @created_at
            )
        `).run(assetData);
        return getItAssetById(Number(info.lastInsertRowid));
    }
}

export async function deleteItAsset(id: number): Promise<void> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assets} WHERE id = ?`).run(id);
}

// Assignments functions
export async function assignItAsset(assetId: number, assigneeType: 'system_user' | 'payroll_employee', userOrEmployeeId: string | number): Promise<void> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    const now = new Date().toISOString();
    const currentUser = await getCurrentUser();
    const assignedBy = currentUser?.name || 'Sistema';

    const transaction = db.transaction(() => {
        db.prepare(`
            UPDATE ${IT_TOOLS_TABLES.assetAssignments}
            SET returned_date = ?
            WHERE asset_id = ? AND returned_date IS NULL
        `).run(now, assetId);

        let userId: number | null = null;
        let employeeCode: string | null = null;

        if (assigneeType === 'system_user') {
            userId = Number(userOrEmployeeId);
            const userRow = db.prepare('SELECT employeeId FROM core_users WHERE id = ?').get(userId) as { employeeId: string | null } | undefined;
            if (userRow?.employeeId) {
                employeeCode = userRow.employeeId;
            }
        } else {
            employeeCode = String(userOrEmployeeId);
            const userRow = db.prepare('SELECT id FROM core_users WHERE employeeId = ?').get(employeeCode) as { id: number } | undefined;
            if (userRow?.id) {
                userId = userRow.id;
            }
        }

        db.prepare(`
            INSERT INTO ${IT_TOOLS_TABLES.assetAssignments} (
                asset_id, assignee_type, user_id, employee_code, assigned_date, returned_date, assigned_by
            ) VALUES (?, ?, ?, ?, ?, NULL, ?)
        `).run(assetId, assigneeType, userId, employeeCode, now, assignedBy);
    });

    transaction();
}

export async function returnItAsset(assetId: number): Promise<void> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE ${IT_TOOLS_TABLES.assetAssignments}
        SET returned_date = ?
        WHERE asset_id = ? AND returned_date IS NULL
    `).run(now, assetId);
}

// Components functions
export async function addItAssetComponent(component: { parent_asset_id: number; component_name: string; brand?: string; model?: string; serial_number?: string }): Promise<any> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    const info = db.prepare(`
        INSERT INTO ${IT_TOOLS_TABLES.assetComponents} (parent_asset_id, component_name, brand, model, serial_number)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        component.parent_asset_id,
        component.component_name,
        component.brand || null,
        component.model || null,
        component.serial_number || null
    );
    return db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assetComponents} WHERE id = ?`).get(info.lastInsertRowid);
}

export async function removeItAssetComponent(id: number): Promise<void> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assetComponents} WHERE id = ?`).run(id);
}

// Licenses to Asset functions
export async function addItAssetLicense(assetLicense: { asset_id: number; license_catalog_id: number; license_key?: string; expiration_date?: string }): Promise<any> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    const info = db.prepare(`
        INSERT INTO ${IT_TOOLS_TABLES.assetLicenses} (asset_id, license_catalog_id, license_key, expiration_date, status)
        VALUES (?, ?, ?, ?, 'active')
    `).run(
        assetLicense.asset_id,
        assetLicense.license_catalog_id,
        assetLicense.license_key || null,
        assetLicense.expiration_date || null
    );
    return db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assetLicenses} WHERE id = ?`).get(info.lastInsertRowid);
}

export async function removeItAssetLicense(id: number): Promise<void> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assetLicenses} WHERE id = ?`).run(id);
}

// HR Alerts functions
export async function getItHrAlerts(): Promise<any[]> {
    const db = await getDb();
    const alerts = db.prepare(`
        SELECT asg.id as assignment_id, asg.assigned_date, asg.assigned_by,
               a.id as asset_id, a.brand, a.model, a.serial_number, a.category,
               e.EMPLEADO as employee_code, e.NOMBRE as employee_name, e.DEPARTAMENTO as employee_dept
        FROM ${IT_TOOLS_TABLES.assetAssignments} asg
        JOIN ${IT_TOOLS_TABLES.assets} a ON asg.asset_id = a.id
        JOIN core_employees e ON asg.employee_code = e.EMPLEADO
        WHERE asg.returned_date IS NULL 
          AND asg.assignee_type = 'payroll_employee'
          AND e.ACTIVO = 'N'
    `).all();
    return JSON.parse(JSON.stringify(alerts));
}

// Lookup Lists
export async function getSystemUsersList(): Promise<any[]> {
    const db = await getDb();
    const users = db.prepare(`SELECT id, name, email, employeeId FROM core_users ORDER BY name ASC`).all();
    return JSON.parse(JSON.stringify(users));
}

export async function getPayrollEmployeesList(): Promise<any[]> {
    const db = await getDb();
    const employees = db.prepare(`SELECT EMPLEADO as id, NOMBRE as name, ACTIVO as active FROM core_employees ORDER BY name ASC`).all();
    return JSON.parse(JSON.stringify(employees));
}

export async function getItAssetCategories(): Promise<string[]> {
    const db = await getDb();
    const row = db.prepare(`SELECT value FROM ${IT_TOOLS_TABLES.settings} WHERE key = 'asset_categories'`).get() as { value: string } | undefined;
    if (!row) {
        return ['Laptop', 'Desktop PC', 'Monitor', 'Celular', 'Servidor', 'Networking', 'Impresora', 'Otro'];
    }
    try {
        return JSON.parse(row.value);
    } catch {
        return ['Laptop', 'Desktop PC', 'Monitor', 'Celular', 'Servidor', 'Networking', 'Impresora', 'Otro'];
    }
}

export async function saveItAssetCategories(categories: string[]): Promise<void> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    db.prepare(`INSERT OR REPLACE INTO ${IT_TOOLS_TABLES.settings} (key, value) VALUES ('asset_categories', ?)`).run(JSON.stringify(categories));
}

export async function sendAssetAssignmentEmail(assignmentId: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('it-tools:assets:write');
    try {
        const db = await getDb();

        // 1. Fetch assignment
        const assignment = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assetAssignments} WHERE id = ?`).get(assignmentId) as {
            id: number;
            asset_id: number;
            assignee_type: 'system_user' | 'payroll_employee';
            user_id: number | null;
            employee_code: string | null;
            assigned_date: string;
            assigned_by: string;
        } | undefined;

        if (!assignment) {
            throw new Error(`Asignación con ID ${assignmentId} no encontrada.`);
        }

        // 2. Fetch Asset
        const asset = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assets} WHERE id = ?`).get(assignment.asset_id) as {
            id: number;
            item_id: string | null;
            category: string;
            brand: string;
            model: string;
            serial_number: string;
            notes: string;
        } | undefined;

        if (!asset) {
            throw new Error(`Activo con ID ${assignment.asset_id} no encontrado.`);
        }

        // 3. Find recipient email & name
        let recipientEmail: string | null = null;
        let recipientName = '';

        if (assignment.assignee_type === 'system_user') {
            const userRow = db.prepare('SELECT name, email FROM core_users WHERE id = ?').get(assignment.user_id) as { name: string; email: string } | undefined;
            if (userRow) {
                recipientEmail = userRow.email;
                recipientName = userRow.name;
            }
        } else {
            const empRow = db.prepare('SELECT NOMBRE FROM core_employees WHERE EMPLEADO = ?').get(assignment.employee_code) as { NOMBRE: string } | undefined;
            if (empRow) {
                recipientName = empRow.NOMBRE;
            }
            const userRow = db.prepare('SELECT email FROM core_users WHERE employeeId = ?').get(assignment.employee_code) as { email: string } | undefined;
            if (userRow) {
                recipientEmail = userRow.email;
            }
        }

        if (!recipientEmail) {
            console.warn(`No email found for assignee of type ${assignment.assignee_type} (ID/Code: ${assignment.assignee_type === 'system_user' ? assignment.user_id : assignment.employee_code}). Skipping email.`);
            return { success: false, error: 'No se encontró una dirección de correo para el colaborador asignado.' };
        }

        // 4. Load template or fallback
        let subject = 'Asignación de Activo Fijo TI - Clic-Tools';
        let body = '';

        const template = db.prepare("SELECT subject, body FROM notification_templates WHERE eventId = 'onAssetAssigned'").get() as { subject: string; body: string } | undefined;
        
        if (template) {
            subject = template.subject || subject;
            body = template.body || body;
        }

        const fallbackHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
                <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #3b82f6;">
                    <h2 style="color: #1e3a8a; margin: 0;">Acta de Entrega de Activo Fijo</h2>
                    <p style="color: #64748b; font-size: 14px; margin: 5px 0 0 0;">Departamento de Tecnología (TI)</p>
                </div>
                
                <div style="padding: 20px 0;">
                    <p style="margin: 0 0 15px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                        Estimado(a) <strong>{{assigneeName}}</strong>,
                    </p>
                    <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                        Se ha formalizado la asignación del siguiente activo de la empresa para el desempeño de sus labores. Al recibir este equipo, usted acepta la responsabilidad por su custodia, cuidado y uso conforme a las políticas de seguridad y uso de activos de la organización.
                    </p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                        <tr style="background-color: #f8fafc;">
                            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569; width: 35%;">Categoría</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{category}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Marca / Modelo</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{brand}} {{model}}</td>
                        </tr>
                        <tr style="background-color: #f8fafc;">
                            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Número de Serie</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{serialNumber}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Fecha Asignación</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{assignedDate}}</td>
                        </tr>
                        <tr style="background-color: #f8fafc;">
                            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Asignado Por</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{assignedBy}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Notas / Estado</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{notes}}</td>
                        </tr>
                    </table>
                    
                    <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                        <h4 style="margin: 0 0 5px 0; color: #14532d; font-size: 14px;">Compromiso del Colaborador</h4>
                        <p style="margin: 0; color: #166534; font-size: 12px; line-height: 1.4;">
                            Me comprometo a mantener este activo en óptimas condiciones, reportar de forma inmediata cualquier falla, pérdida o robo al departamento de TI, y hacer entrega del mismo al finalizar mi relación laboral o cuando sea requerido.
                        </p>
                    </div>
                    
                    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; text-align: center;">
                        <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                            Documento de Control Interno generado automáticamente. Trazabilidad ISO 9001.
                        </p>
                    </div>
                </div>
            </div>
        `;

        if (!body) {
            body = fallbackHtml;
        }

        // 5. Replace placeholders
        const dataMap: Record<string, string> = {
            assigneeName: recipientName,
            assigneeId: assignment.assignee_type === 'system_user' ? String(assignment.user_id) : String(assignment.employee_code),
            category: asset.category,
            brand: asset.brand || '',
            model: asset.model || '',
            serialNumber: asset.serial_number || 'N/A',
            assignedDate: new Date(assignment.assigned_date).toLocaleDateString('es-CR'),
            assignedBy: assignment.assigned_by,
            notes: asset.notes || 'Buen estado'
        };

        const replaceAll = (text: string) => {
            return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
                return dataMap[key] !== undefined ? dataMap[key] : match;
            });
        };

        const finalSubject = replaceAll(subject);
        const finalBody = replaceAll(body);

        // 6. Send the email
        await sendEmail({
            to: recipientEmail,
            subject: finalSubject,
            html: finalBody
        });

        return { success: true };
    } catch (e: any) {
        console.error("Error in sendAssetAssignmentEmail:", e);
        return { success: false, error: e.message };
    }
}

export async function getMyAssignedAssets(): Promise<any[]> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];
    
    const db = await getDb();
    const assets = db.prepare(`
        SELECT a.*, b.name as branch_name, b.code as branch_code,
               asg.id as assignment_id, asg.assignee_type, asg.user_id, asg.employee_code, asg.assigned_date, asg.assigned_by
        FROM ${IT_TOOLS_TABLES.assets} a
        LEFT JOIN ${IT_TOOLS_TABLES.branches} b ON a.branch_id = b.id
        JOIN ${IT_TOOLS_TABLES.assetAssignments} asg ON a.id = asg.asset_id AND asg.returned_date IS NULL
        WHERE asg.user_id = ? OR (asg.employee_code IS NOT NULL AND asg.employee_code = ?)
        ORDER BY asg.assigned_date DESC
    `).all(currentUser.id, currentUser.employeeId || '');
    
    return JSON.parse(JSON.stringify(assets));
}
