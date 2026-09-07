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

export async function saveItBranch(branch: { id?: number; name: string; code: string; is_active: any }): Promise<any> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    const now = new Date().toISOString();
    const isActiveNum = (branch.is_active === true || branch.is_active === 1 || branch.is_active === '1') ? 1 : 0;
    const branchIdNum = branch.id ? Number(branch.id) : undefined;
    
    if (branchIdNum) {
        db.prepare(
            `UPDATE ${IT_TOOLS_TABLES.branches} SET name = ?, code = ?, is_active = ? WHERE id = ?`
        ).run(branch.name.trim(), branch.code.trim().toUpperCase(), isActiveNum, branchIdNum);
        return db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.branches} WHERE id = ?`).get(branchIdNum);
    } else {
        const info = db.prepare(
            `INSERT INTO ${IT_TOOLS_TABLES.branches} (name, code, is_active, created_at) VALUES (?, ?, ?, ?)`
        ).run(branch.name.trim(), branch.code.trim().toUpperCase(), isActiveNum, now);
        return db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.branches} WHERE id = ?`).get(info.lastInsertRowid);
    }
}

export async function toggleItBranchStatus(id: number, isActive: boolean | number): Promise<any> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    const isActiveNum = (isActive === true || isActive === 1) ? 1 : 0;
    db.prepare(`UPDATE ${IT_TOOLS_TABLES.branches} SET is_active = ? WHERE id = ?`).run(isActiveNum, id);
    return db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.branches} WHERE id = ?`).get(id);
}

export async function deleteItBranch(id: number): Promise<void> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    
    // Check if there are assets associated with this branch
    const linkedAssets = db.prepare(`SELECT count(*) as count FROM ${IT_TOOLS_TABLES.assets} WHERE branch_id = ? OR branch_id = ?`).get(id, String(id)) as { count: number };
    if (linkedAssets && linkedAssets.count > 0) {
        throw new Error(`No se puede eliminar la sede porque tiene ${linkedAssets.count} activo(s) de TI asociado(s). Reasigne o traslade los activos a otra sede antes de eliminarla.`);
    }

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
    db.prepare(`
        CREATE TABLE IF NOT EXISTS fleet_registered_devices (
            hardware_id TEXT PRIMARY KEY,
            device_name TEXT,
            last_user_id INTEGER,
            last_driver_name TEXT,
            driver_phone TEXT,
            printer_mac TEXT,
            paper_size TEXT DEFAULT '80mm',
            server_url_override TEXT,
            custom_config_json TEXT,
            asset_id INTEGER,
            serial_number TEXT,
            imei TEXT,
            last_seen TEXT NOT NULL
        )
    `).run();

    try { db.prepare("ALTER TABLE fleet_registered_devices ADD COLUMN serial_number TEXT").run(); } catch (_) {}
    try { db.prepare("ALTER TABLE fleet_registered_devices ADD COLUMN imei TEXT").run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.assets} ADD COLUMN processor TEXT`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.assets} ADD COLUMN ram_memory TEXT`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.assets} ADD COLUMN storage_capacity TEXT`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.assets} ADD COLUMN bitlocker_id TEXT`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.assets} ADD COLUMN bitlocker_key TEXT`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.assets} ADD COLUMN standard_accessories_json TEXT`).run(); } catch (_) {}
    
    db.prepare(`
        CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.assetDocuments} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            document_type TEXT NOT NULL DEFAULT 'other',
            title TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_size INTEGER NULL,
            uploaded_by TEXT NOT NULL,
            uploaded_at TEXT NOT NULL,
            FOREIGN KEY(asset_id) REFERENCES ${IT_TOOLS_TABLES.assets}(id) ON DELETE CASCADE
        )
    `).run();
    const assets = db.prepare(`
        SELECT a.*, b.name as branch_name, b.code as branch_code,
               asg.id as assignment_id, asg.assignee_type, asg.user_id, asg.employee_code, asg.assigned_date, asg.assigned_by,
               u.name as user_name, u.email as user_email, u.phone as user_phone,
               e.NOMBRE as employee_name, e.ACTIVO as employee_status, e.IDENTIFICACION as employee_tax_id, e.PUESTO as employee_position, e.DEPARTAMENTO as employee_dept,
               pos.DESCRIPCION as employee_position_name,
               frd.hardware_id as dev_hardware_id, frd.last_driver_name as dev_driver_name,
               frd.driver_phone as dev_driver_phone, frd.printer_mac as dev_printer_mac,
               frd.paper_size as dev_paper_size, frd.last_seen as dev_last_seen,
               tel.hostname as agent_hostname, tel.os_version as agent_os_version, tel.os_build as agent_os_build,
               tel.logged_in_user as agent_logged_in_user, tel.domain as agent_domain, tel.cpu_name as agent_cpu_name,
               tel.cpu_usage as agent_cpu_usage, tel.ram_total_gb as agent_ram_total_gb, tel.ram_used_percent as agent_ram_used_percent,
               tel.disk_primary_free_gb as agent_disk_primary_free_gb, tel.disk_primary_total_gb as agent_disk_primary_total_gb,
               tel.disk_smart_status as agent_disk_smart_status, tel.battery_percent as agent_battery_percent,
               tel.is_charging as agent_is_charging, tel.is_laptop as agent_is_laptop, tel.bitlocker_status as agent_bitlocker_status,
               tel.antivirus_status as agent_antivirus_status, tel.ip_address_local as agent_ip_address_local,
               tel.monitors_json as agent_monitors_json, tel.agent_version as agent_version, tel.last_seen as agent_last_seen
        FROM ${IT_TOOLS_TABLES.assets} a
        LEFT JOIN ${IT_TOOLS_TABLES.branches} b ON a.branch_id = b.id
        LEFT JOIN ${IT_TOOLS_TABLES.assetAssignments} asg ON a.id = asg.asset_id AND asg.returned_date IS NULL
        LEFT JOIN core_users u ON asg.user_id = u.id
        LEFT JOIN core_employees e ON (asg.employee_code = e.EMPLEADO OR u.employeeId = e.EMPLEADO)
        LEFT JOIN core_positions pos ON e.PUESTO = pos.PUESTO
        LEFT JOIN fleet_registered_devices frd ON (a.serial_number = frd.hardware_id OR a.id = frd.asset_id)
        LEFT JOIN ${IT_TOOLS_TABLES.agentTelemetry} tel ON a.id = tel.asset_id
        ORDER BY a.created_at DESC
    `).all();
    return JSON.parse(JSON.stringify(assets));
}

export async function getItAssetById(id: number): Promise<any> {
    const db = await getDb();
    const asset = db.prepare(`
        SELECT a.*, b.name as branch_name, b.code as branch_code,
               asg.id as assignment_id, asg.assignee_type, asg.user_id, asg.employee_code, asg.assigned_date, asg.assigned_by,
               u.name as user_name, u.email as user_email, u.phone as user_phone,
               e.NOMBRE as employee_name, e.ACTIVO as employee_status, e.IDENTIFICACION as employee_tax_id, e.PUESTO as employee_position, e.DEPARTAMENTO as employee_dept,
               pos.DESCRIPCION as employee_position_name,
               frd.hardware_id as dev_hardware_id, frd.last_driver_name as dev_driver_name,
               frd.driver_phone as dev_driver_phone, frd.printer_mac as dev_printer_mac,
               frd.paper_size as dev_paper_size, frd.last_seen as dev_last_seen,
               tel.hostname as agent_hostname, tel.os_version as agent_os_version, tel.os_build as agent_os_build,
               tel.logged_in_user as agent_logged_in_user, tel.domain as agent_domain, tel.cpu_name as agent_cpu_name,
               tel.cpu_usage as agent_cpu_usage, tel.ram_total_gb as agent_ram_total_gb, tel.ram_used_percent as agent_ram_used_percent,
               tel.disk_primary_free_gb as agent_disk_primary_free_gb, tel.disk_primary_total_gb as agent_disk_primary_total_gb,
               tel.disk_smart_status as agent_disk_smart_status, tel.battery_percent as agent_battery_percent,
               tel.is_charging as agent_is_charging, tel.is_laptop as agent_is_laptop, tel.bitlocker_status as agent_bitlocker_status,
               tel.antivirus_status as agent_antivirus_status, tel.ip_address_local as agent_ip_address_local,
               tel.monitors_json as agent_monitors_json, tel.agent_version as agent_version, tel.last_seen as agent_last_seen
        FROM ${IT_TOOLS_TABLES.assets} a
        LEFT JOIN ${IT_TOOLS_TABLES.branches} b ON a.branch_id = b.id
        LEFT JOIN ${IT_TOOLS_TABLES.assetAssignments} asg ON a.id = asg.asset_id AND asg.returned_date IS NULL
        LEFT JOIN core_users u ON asg.user_id = u.id
        LEFT JOIN core_employees e ON (asg.employee_code = e.EMPLEADO OR u.employeeId = e.EMPLEADO)
        LEFT JOIN core_positions pos ON e.PUESTO = pos.PUESTO
        LEFT JOIN fleet_registered_devices frd ON (a.serial_number = frd.hardware_id OR a.id = frd.asset_id)
        LEFT JOIN ${IT_TOOLS_TABLES.agentTelemetry} tel ON a.id = tel.asset_id
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

    const documents = db.prepare(`
        SELECT *
        FROM ${IT_TOOLS_TABLES.assetDocuments}
        WHERE asset_id = ?
        ORDER BY uploaded_at DESC
    `).all(id);

    const installedSoftware = db.prepare(`
        SELECT *
        FROM ${IT_TOOLS_TABLES.installedSoftware}
        WHERE asset_id = ?
        ORDER BY name ASC
    `).all(id);

    const agentCommands = db.prepare(`
        SELECT *
        FROM ${IT_TOOLS_TABLES.agentCommands}
        WHERE asset_id = ?
        ORDER BY created_at DESC
        LIMIT 20
    `).all(id);

    return JSON.parse(JSON.stringify({
        ...asset,
        components,
        licenses,
        assignments,
        tickets,
        documents,
        installed_software: installedSoftware,
        agent_commands: agentCommands
    }));
}

export async function saveItAsset(asset: any): Promise<any> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    
    // Check serial number uniqueness
    const existing = db.prepare(`SELECT id, brand, model, serial_number FROM ${IT_TOOLS_TABLES.assets} WHERE UPPER(TRIM(serial_number)) = UPPER(TRIM(?))`).get(asset.serial_number) as { id: number; brand: string; model: string; serial_number: string } | undefined;
    if (existing && (!asset.id || Number(existing.id) !== Number(asset.id))) {
        throw new Error(`El número de serie "${asset.serial_number}" ya está asignado al equipo #${existing.id} (${existing.brand} ${existing.model}). Por favor verifique el número de serie ingresado.`);
    }

    const now = new Date().toISOString();
    
    const assetData = {
        item_id: asset.item_id || null,
        category: asset.category,
        brand: asset.brand,
        model: asset.model,
        serial_number: asset.serial_number ? asset.serial_number.trim() : '',
        hardware_id: asset.hardware_id ? asset.hardware_id.trim() : null,
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
        processor: asset.processor || null,
        ram_memory: asset.ram_memory || null,
        storage_capacity: asset.storage_capacity || null,
        bitlocker_id: asset.bitlocker_id || null,
        bitlocker_key: asset.bitlocker_key || null,
        standard_accessories_json: asset.standard_accessories_json ? (typeof asset.standard_accessories_json === 'string' ? asset.standard_accessories_json : JSON.stringify(asset.standard_accessories_json)) : null,
        created_at: now
    };

    let targetAssetId = asset.id ? Number(asset.id) : 0;

    if (targetAssetId) {
        db.prepare(`
            UPDATE ${IT_TOOLS_TABLES.assets} SET
                item_id = @item_id, category = @category, brand = @brand, model = @model,
                serial_number = @serial_number, hardware_id = @hardware_id, status = @status, purchase_date = @purchase_date,
                purchase_cost = @purchase_cost, currency = @currency, exchange_rate = @exchange_rate,
                warranty_expiration = @warranty_expiration, invoice_url = @invoice_url,
                warranty_cert_url = @warranty_cert_url, branch_id = @branch_id, notes = @notes,
                imei = @imei, phone_number = @phone_number, telephony_provider = @telephony_provider,
                data_plan_start = @data_plan_start, data_plan_end = @data_plan_end, data_plan_renewal = @data_plan_renewal,
                processor = @processor, ram_memory = @ram_memory, storage_capacity = @storage_capacity,
                bitlocker_id = @bitlocker_id, bitlocker_key = @bitlocker_key,
                standard_accessories_json = @standard_accessories_json
            WHERE id = @id
        `).run({ ...assetData, id: targetAssetId });
    } else {
        const info = db.prepare(`
            INSERT INTO ${IT_TOOLS_TABLES.assets} (
                item_id, category, brand, model, serial_number, hardware_id, status, purchase_date,
                purchase_cost, currency, exchange_rate, warranty_expiration, invoice_url,
                warranty_cert_url, branch_id, notes, imei, phone_number, telephony_provider,
                data_plan_start, data_plan_end, data_plan_renewal,
                processor, ram_memory, storage_capacity, bitlocker_id, bitlocker_key,
                standard_accessories_json, created_at
            ) VALUES (
                @item_id, @category, @brand, @model, @serial_number, @hardware_id, @status, @purchase_date,
                @purchase_cost, @currency, @exchange_rate, @warranty_expiration, @invoice_url,
                @warranty_cert_url, @branch_id, @notes, @imei, @phone_number, @telephony_provider,
                @data_plan_start, @data_plan_end, @data_plan_renewal,
                @processor, @ram_memory, @storage_capacity, @bitlocker_id, @bitlocker_key,
                @standard_accessories_json, @created_at
            )
        `).run(assetData);
        targetAssetId = Number(info.lastInsertRowid);
    }

    // Sincronizar catálogo de software / licencias si se proporcionan en el formulario
    if (Array.isArray(asset.selected_software_ids) && targetAssetId) {
        const currentLicRows = db.prepare(`SELECT id, license_catalog_id FROM ${IT_TOOLS_TABLES.assetLicenses} WHERE asset_id = ?`).all(targetAssetId) as { id: number; license_catalog_id: number }[];
        const currentCatIds = new Set<number>(currentLicRows.map(r => Number(r.license_catalog_id)));
        const targetCatIds = new Set<number>(asset.selected_software_ids.map((id: any) => Number(id)));

        // Eliminar las que ya no están seleccionadas
        for (const row of currentLicRows) {
            if (!targetCatIds.has(Number(row.license_catalog_id))) {
                db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assetLicenses} WHERE id = ?`).run(row.id);
            }
        }

        // Agregar las nuevas
        for (const catId of Array.from(targetCatIds)) {
            if (!currentCatIds.has(catId)) {
                db.prepare(`
                    INSERT INTO ${IT_TOOLS_TABLES.assetLicenses} (asset_id, license_catalog_id, status)
                    VALUES (?, ?, 'active')
                `).run(targetAssetId, catId);
            }
        }
    }

    const fetched = await getItAssetById(targetAssetId);
    if (fetched) return fetched;

    // Fallback if joined query had an anomaly
    const simple = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assets} WHERE id = ?`).get(targetAssetId);
    return JSON.parse(JSON.stringify(simple || { id: targetAssetId, ...assetData }));
}

export async function deleteItAsset(id: number): Promise<void> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    
    db.transaction(() => {
        // Eliminar explícitamente todos los registros asociados en tablas hijas para prevenir conflictos de claves foráneas
        try { db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assetDocuments} WHERE asset_id = ?`).run(id); } catch (_) {}
        try { db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assetAssignments} WHERE asset_id = ?`).run(id); } catch (_) {}
        try { db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assetLicenses} WHERE asset_id = ?`).run(id); } catch (_) {}
        try { db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assetComponents} WHERE parent_asset_id = ?`).run(id); } catch (_) {}
        try { db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.agentTelemetry} WHERE asset_id = ?`).run(id); } catch (_) {}
        try { db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.agentCommands} WHERE asset_id = ?`).run(id); } catch (_) {}
        try { db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.installedSoftware} WHERE asset_id = ?`).run(id); } catch (_) {}
        try { db.prepare(`UPDATE repair_tickets SET linked_asset_id = NULL WHERE linked_asset_id = ?`).run(id); } catch (_) {}
        try { db.prepare(`UPDATE fleet_registered_devices SET asset_id = NULL WHERE asset_id = ?`).run(id); } catch (_) {}

        // Eliminar el activo principal
        db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assets} WHERE id = ?`).run(id);
    })();
}

// Assignments functions
export async function assignItAsset(assetId: number, assigneeType: 'system_user' | 'payroll_employee', userOrEmployeeId: string | number): Promise<{ success: boolean; assignmentId: number }> {
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

        const info = db.prepare(`
            INSERT INTO ${IT_TOOLS_TABLES.assetAssignments} (
                asset_id, assignee_type, user_id, employee_code, assigned_date, returned_date, assigned_by
            ) VALUES (?, ?, ?, ?, ?, NULL, ?)
        `).run(assetId, assigneeType, userId, employeeCode, now, assignedBy);

        return Number(info.lastInsertRowid);
    });

    const newAssignmentId = transaction();
    return { success: true, assignmentId: newAssignmentId };
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
               asg.assignee_type,
               COALESCE(NULLIF(e.EMPLEADO, ''), u.employeeId) as employee_code,
               COALESCE(e.NOMBRE, u.name) as employee_name,
               e.DEPARTAMENTO as employee_dept
        FROM ${IT_TOOLS_TABLES.assetAssignments} asg
        JOIN ${IT_TOOLS_TABLES.assets} a ON asg.asset_id = a.id
        LEFT JOIN core_users u ON asg.user_id = u.id
        LEFT JOIN core_employees e ON asg.employee_code = e.EMPLEADO
        WHERE asg.returned_date IS NULL
          AND (
            (asg.assignee_type = 'payroll_employee' AND e.ACTIVO = 'N')
            OR
            (asg.assignee_type = 'system_user'
             AND (u.is_active = 0
                  OR EXISTS (
                    SELECT 1 FROM core_employees pe
                    WHERE pe.EMPLEADO = u.employeeId AND pe.ACTIVO = 'N'
                  )
             )
            )
          )
    `).all();
    return JSON.parse(JSON.stringify(alerts));
}

// Plan Expiration Alerts (Planes Celulares / Datos Móviles)
export async function getItPlanExpirationAlerts(): Promise<any[]> {
    const db = await getDb();
    // Obtener activos con data_plan_end configurado
    const rows = db.prepare(`
        SELECT a.id as asset_id, a.brand, a.model, a.serial_number, a.category,
               a.phone_number, a.telephony_provider, a.data_plan_start, a.data_plan_end, a.data_plan_renewal,
               b.name as branch_name,
               COALESCE(e.NOMBRE, u.name, 'Sin Asignar') as current_holder,
               COALESCE(u.email, '') as holder_email
        FROM ${IT_TOOLS_TABLES.assets} a
        LEFT JOIN ${IT_TOOLS_TABLES.branches} b ON a.branch_id = b.id
        LEFT JOIN ${IT_TOOLS_TABLES.assetAssignments} asg ON a.id = asg.asset_id AND asg.returned_date IS NULL
        LEFT JOIN core_users u ON asg.user_id = u.id
        LEFT JOIN core_employees e ON asg.employee_code = e.EMPLEADO
        WHERE a.data_plan_end IS NOT NULL 
          AND TRIM(a.data_plan_end) != ''
          AND a.status = 'active'
        ORDER BY a.data_plan_end ASC
    `).all() as any[];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alerts = rows.map((r: any) => {
        const endDate = new Date(r.data_plan_end);
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return {
            ...r,
            diffDays,
            isExpired: diffDays < 0,
            isExpiringSoon: diffDays >= 0 && diffDays <= 30
        };
    }).filter((r: any) => r.isExpired || r.isExpiringSoon);

    return JSON.parse(JSON.stringify(alerts));
}

// Lookup Lists
export async function getSystemUsersList(): Promise<any[]> {
    const db = await getDb();
    const users = db.prepare(`SELECT id, name, email, employeeId, is_active FROM core_users ORDER BY name ASC`).all();
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

export async function getItStandardAccessories(): Promise<string[]> {
    const db = await getDb();
    const row = db.prepare(`SELECT value FROM ${IT_TOOLS_TABLES.settings} WHERE key = 'standard_accessories'`).get() as { value: string } | undefined;
    if (!row) {
        return [
            'Cargador Original',
            'Mouse Óptico',
            'Maletín / Bolso',
            'Candado Kensington',
            'Monitor Externo',
            'Teclado Externo',
            'Manos Libres / Diadema',
            'Adaptador USB-C / HDMI'
        ];
    }
    try {
        return JSON.parse(row.value);
    } catch {
        return [
            'Cargador Original',
            'Mouse Óptico',
            'Maletín / Bolso',
            'Candado Kensington',
            'Monitor Externo',
            'Teclado Externo',
            'Manos Libres / Diadema',
            'Adaptador USB-C / HDMI'
        ];
    }
}

export async function saveItStandardAccessories(accessories: string[]): Promise<void> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    db.prepare(`INSERT OR REPLACE INTO ${IT_TOOLS_TABLES.settings} (key, value) VALUES ('standard_accessories', ?)`).run(JSON.stringify(accessories));
}

export async function sendAssetAssignmentEmail(assignmentId: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('it-tools:assets:write');
    try {
        const db = await getDb();
        const targetId = Number(assignmentId);

        // 1. Fetch assignment by id, or latest active assignment if id is not found
        let assignment = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assetAssignments} WHERE id = ?`).get(targetId) as {
            id: number;
            asset_id: number;
            assignee_type: 'system_user' | 'payroll_employee';
            user_id: number | null;
            employee_code: string | null;
            assigned_date: string;
            assigned_by: string;
        } | undefined;

        if (!assignment) {
            // Fallback: Check if assignmentId was passed as asset_id
            assignment = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assetAssignments} WHERE asset_id = ? AND returned_date IS NULL ORDER BY id DESC LIMIT 1`).get(targetId) as any;
        }

        if (!assignment) {
            console.warn(`[ITAM Email] Asignación con ID o Asset ID ${assignmentId} no encontrada en BD.`);
            return { success: false, error: `Asignación no encontrada en el historial.` };
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

// --- MOBILE FLEET & OTA APP VERSION MANAGEMENT ---

export async function getMobileFleetData(): Promise<{ 
    versionSettings: any; 
    devices: any[]; 
    backgroundSyncMinutes: string; 
    adminPin?: string; 
    telegramAlertsChatId?: string;
    smsGatewayItPhones?: string;
    publicIpApiPrimary?: string;
    publicIpApiFallback?: string;
}> {
    await authorizeAction('it-tools:assets:read');
    const db = await getDb();

    // 1. Get official target version settings
    const versionSettings = db.prepare('SELECT * FROM ops_app_version_settings WHERE id = 1').get() as any || null;

    // 2. Get registered devices with assigned user info
    const devices = db.prepare(`
        SELECT d.*, u.name as driver_user_name, u.email as driver_user_email
        FROM fleet_registered_devices d
        LEFT JOIN core_users u ON d.last_user_id = u.id
        ORDER BY d.last_seen DESC
    `).all() as any[];

    // 3. Get background sync minutes, admin PIN and Telegram chat ID from ops_delivery_settings
    let backgroundSyncMinutes = '5';
    let adminPin = '0000';
    let telegramAlertsChatId = '';
    let smsGatewayItPhones = '';
    try {
        const syncCfg = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'apk_background_sync_minutes'").get() as any;
        if (syncCfg?.value) backgroundSyncMinutes = syncCfg.value;
    } catch (_) {}
    try {
        const pinCfg = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'apk_admin_settings_pin'").get() as any;
        if (pinCfg?.value) adminPin = pinCfg.value;
    } catch (_) {}
    try {
        const tgCfg = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'mdm_telegram_alerts_chat_id'").get() as any;
        if (tgCfg?.value) telegramAlertsChatId = tgCfg.value;
    } catch (_) {}
    try {
        const itPhonesCfg = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'sms_gateway_it_phones'").get() as any;
        if (itPhonesCfg?.value) smsGatewayItPhones = itPhonesCfg.value;
    } catch (_) {}

    let publicIpApiPrimary = 'https://api.ipify.org';
    let publicIpApiFallback = 'https://icanhazip.com';

    try {
        const ipPriCfg = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'public_ip_api_primary'").get() as any;
        if (ipPriCfg?.value) publicIpApiPrimary = ipPriCfg.value;
    } catch (_) {}
    try {
        const ipFbCfg = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'public_ip_api_fallback'").get() as any;
        if (ipFbCfg?.value) publicIpApiFallback = ipFbCfg.value;
    } catch (_) {}

    return {
        versionSettings: versionSettings ? JSON.parse(JSON.stringify(versionSettings)) : null,
        devices: JSON.parse(JSON.stringify(devices)),
        backgroundSyncMinutes: String(backgroundSyncMinutes),
        adminPin: String(adminPin),
        telegramAlertsChatId: String(telegramAlertsChatId),
        smsGatewayItPhones: String(smsGatewayItPhones),
        publicIpApiPrimary: String(publicIpApiPrimary),
        publicIpApiFallback: String(publicIpApiFallback)
    };
}

export async function saveMobileDeviceAssignment(hardwareId: string, data: {
    deviceName?: string;
    phone_number?: string;
    last_user_id?: number | null;
    last_driver_name?: string;
    ota_paused?: number;
}): Promise<{ success: boolean }> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    
    db.prepare(`
        UPDATE fleet_registered_devices 
        SET device_name = COALESCE(?, device_name),
            phone_number = COALESCE(?, phone_number),
            last_user_id = COALESCE(?, last_user_id),
            last_driver_name = COALESCE(?, last_driver_name),
            ota_paused = COALESCE(?, ota_paused)
        WHERE hardware_id = ?
    `).run(
        data.deviceName || null,
        data.phone_number || null,
        data.last_user_id ?? null,
        data.last_driver_name || null,
        data.ota_paused ?? null,
        hardwareId
    );

    return { success: true };
}

export async function deleteMobileDevice(hardwareId: string): Promise<{ success: boolean }> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    db.prepare('DELETE FROM fleet_registered_devices WHERE hardware_id = ?').run(hardwareId);
    return { success: true };
}

export async function publishAppVersion(data: {
    version_name: string;
    version_code: number;
    apk_url: string;
    release_notes?: string;
    force_update?: boolean;
    server_url_primary?: string;
    server_url_fallback?: string;
    background_sync_minutes?: string;
    admin_pin?: string;
    telegram_alerts_chat_id?: string;
    sms_gateway_it_phones?: string;
    public_ip_api_primary?: string;
    public_ip_api_fallback?: string;
}): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    const nowIso = new Date().toISOString();

    db.prepare(`
        INSERT INTO ops_app_version_settings 
        (id, version_name, version_code, apk_url, release_notes, global_ota_paused, force_update, server_url_primary, server_url_fallback, updated_at)
        VALUES (1, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            version_name = excluded.version_name,
            version_code = excluded.version_code,
            apk_url = excluded.apk_url,
            release_notes = excluded.release_notes,
            force_update = excluded.force_update,
            server_url_primary = COALESCE(excluded.server_url_primary, ops_app_version_settings.server_url_primary),
            server_url_fallback = COALESCE(excluded.server_url_fallback, ops_app_version_settings.server_url_fallback),
            updated_at = excluded.updated_at
    `).run(
        data.version_name.trim(),
        data.version_code,
        data.apk_url.trim(),
        data.release_notes?.trim() || null,
        data.force_update ? 1 : 0,
        data.server_url_primary?.trim() || null,
        data.server_url_fallback?.trim() || null,
        nowIso
    );

    if (data.background_sync_minutes) {
        const syncMin = Math.max(5, parseInt(data.background_sync_minutes, 10) || 5);
        try {
            db.prepare(`
                INSERT INTO ops_delivery_settings (key, value) VALUES ('apk_background_sync_minutes', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run(String(syncMin));
        } catch (_) {}
    }

    if (data.admin_pin && data.admin_pin.trim().length > 0) {
        try {
            db.prepare(`
                INSERT INTO ops_delivery_settings (key, value) VALUES ('apk_admin_settings_pin', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run(data.admin_pin.trim());
        } catch (_) {}
    }

    if (data.telegram_alerts_chat_id !== undefined) {
        try {
            db.prepare(`
                INSERT INTO ops_delivery_settings (key, value) VALUES ('mdm_telegram_alerts_chat_id', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run(data.telegram_alerts_chat_id.trim());
        } catch (_) {}
    }

    if (data.sms_gateway_it_phones !== undefined) {
        try {
            db.prepare(`
                INSERT INTO ops_delivery_settings (key, value) VALUES ('sms_gateway_it_phones', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run(data.sms_gateway_it_phones.trim());
        } catch (_) {}
    }

    if (data.public_ip_api_primary !== undefined) {
        try {
            db.prepare(`
                INSERT INTO ops_delivery_settings (key, value) VALUES ('public_ip_api_primary', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run(data.public_ip_api_primary.trim());
        } catch (_) {}
    }

    if (data.public_ip_api_fallback !== undefined) {
        try {
            db.prepare(`
                INSERT INTO ops_delivery_settings (key, value) VALUES ('public_ip_api_fallback', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run(data.public_ip_api_fallback.trim());
        } catch (_) {}
    }

    return { success: true };
}

export async function saveFleetServerUrls(primaryUrl: string, fallbackUrl?: string): Promise<{ success: boolean }> {
    await authorizeAction('it-tools:assets:admin');
    const db = await getDb();
    db.prepare(`
        UPDATE ops_app_version_settings 
        SET server_url_primary = ?, server_url_fallback = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = 1
    `).run(
        primaryUrl.trim(),
        fallbackUrl && fallbackUrl.trim().length > 0 ? fallbackUrl.trim() : null
    );
    return { success: true };
}

export async function toggleOtaPause(scope: 'global' | 'device', hardwareId?: string): Promise<{ success: boolean; isPaused: boolean }> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();

    if (scope === 'global') {
        const settings = db.prepare('SELECT global_ota_paused FROM ops_app_version_settings WHERE id = 1').get() as any;
        const newStatus = settings && settings.global_ota_paused === 1 ? 0 : 1;
        db.prepare('UPDATE ops_app_version_settings SET global_ota_paused = ? WHERE id = 1').run(newStatus);
        return { success: true, isPaused: newStatus === 1 };
    } else if (hardwareId) {
        const dev = db.prepare('SELECT ota_paused FROM fleet_registered_devices WHERE hardware_id = ?').get(hardwareId) as any;
        const newStatus = dev && dev.ota_paused === 1 ? 0 : 1;
        db.prepare('UPDATE fleet_registered_devices SET ota_paused = ? WHERE hardware_id = ?').run(newStatus, hardwareId);
        return { success: true, isPaused: newStatus === 1 };
    }
    return { success: false, isPaused: false };
}

export async function resetDeviceOtaFailures(hardwareId: string): Promise<{ success: boolean }> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    db.prepare(`
        UPDATE fleet_registered_devices 
        SET install_failed_count = 0, last_install_error = NULL 
        WHERE hardware_id = ?
    `).run(hardwareId);

    return { success: true };
}

export async function saveDeviceMdmPolicy(hardwareId: string, policy: {
    mdm_kiosk_enabled?: number;
    mdm_force_gps?: number;
    mdm_disallow_airplane_mode?: number;
    mdm_disallow_mobile_data_off?: number;
    mdm_disallow_battery_saver?: number;
    mdm_block_uninstall?: number;
    mdm_disallow_settings?: number;
    mdm_disallow_tethering?: number;
    mdm_disallow_install_apps?: number;
    mdm_disallow_play_store_install?: number;
    mdm_always_on_vpn?: number;
    mdm_whitelisted_packages?: string;
    mdm_pinned_apps?: string;
}): Promise<{ success: boolean }> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();

    db.prepare(`
        UPDATE fleet_registered_devices
        SET mdm_kiosk_enabled = COALESCE(?, mdm_kiosk_enabled),
            mdm_force_gps = COALESCE(?, mdm_force_gps),
            mdm_disallow_airplane_mode = COALESCE(?, mdm_disallow_airplane_mode),
            mdm_disallow_mobile_data_off = COALESCE(?, mdm_disallow_mobile_data_off),
            mdm_disallow_battery_saver = COALESCE(?, mdm_disallow_battery_saver),
            mdm_block_uninstall = COALESCE(?, mdm_block_uninstall),
            mdm_disallow_settings = COALESCE(?, mdm_disallow_settings),
            mdm_disallow_tethering = COALESCE(?, mdm_disallow_tethering),
            mdm_disallow_install_apps = COALESCE(?, mdm_disallow_install_apps),
            mdm_disallow_play_store_install = COALESCE(?, mdm_disallow_play_store_install),
            mdm_always_on_vpn = COALESCE(?, mdm_always_on_vpn),
            mdm_whitelisted_packages = COALESCE(?, mdm_whitelisted_packages),
            mdm_pinned_apps = COALESCE(?, mdm_pinned_apps)
        WHERE hardware_id = ?
    `).run(
        policy.mdm_kiosk_enabled !== undefined ? policy.mdm_kiosk_enabled : null,
        policy.mdm_force_gps !== undefined ? policy.mdm_force_gps : null,
        policy.mdm_disallow_airplane_mode !== undefined ? policy.mdm_disallow_airplane_mode : null,
        policy.mdm_disallow_mobile_data_off !== undefined ? policy.mdm_disallow_mobile_data_off : null,
        policy.mdm_disallow_battery_saver !== undefined ? policy.mdm_disallow_battery_saver : null,
        policy.mdm_block_uninstall !== undefined ? policy.mdm_block_uninstall : null,
        policy.mdm_disallow_settings !== undefined ? policy.mdm_disallow_settings : null,
        policy.mdm_disallow_tethering !== undefined ? policy.mdm_disallow_tethering : null,
        policy.mdm_disallow_install_apps !== undefined ? policy.mdm_disallow_install_apps : null,
        policy.mdm_disallow_play_store_install !== undefined ? policy.mdm_disallow_play_store_install : null,
        policy.mdm_always_on_vpn !== undefined ? policy.mdm_always_on_vpn : null,
        policy.mdm_whitelisted_packages !== undefined ? policy.mdm_whitelisted_packages : null,
        policy.mdm_pinned_apps !== undefined ? policy.mdm_pinned_apps : null,
        hardwareId
    );

    return { success: true };
}

export async function requestAppUninstall(hardwareId: string, packageName: string): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();

    // Security block: check if protected system package
    const protectedSystemPkgs = [
        'com.clicsoporte.clic_driver',
        'com.android.systemui',
        'com.android.settings',
        'com.google.android.gms',
        'com.google.android.gsf',
        'com.google.android.inputmethod.latin',
        'com.samsung.android.honeyboard',
        'com.sec.android.app.launcher',
        'com.miui.home',
        'com.mi.android.globallauncher',
        'com.google.android.apps.nexuslauncher',
        'com.android.launcher3',
        'com.huawei.android.launcher',
        'com.oppo.launcher',
        'com.coloros.home',
        'com.android.packageinstaller',
        'com.google.android.packageinstaller',
        'com.miui.packageinstaller',
        'com.samsung.android.packageinstaller',
        'com.miui.securitycenter',
        'com.google.android.dialer',
        'com.android.dialer',
        'com.android.phone',
        'com.android.server.telecom'
    ];

    if (protectedSystemPkgs.includes(packageName) || packageName.startsWith('com.android.internal') || packageName.includes('launcher')) {
        return { success: false, error: 'Este paquete es vital para el sistema operativo y está 100% protegido contra desinstalaciones.' };
    }

    const dev = db.prepare('SELECT mdm_pending_uninstalls FROM fleet_registered_devices WHERE hardware_id = ?').get(hardwareId) as any;
    let list: string[] = [];
    if (dev?.mdm_pending_uninstalls) {
        try {
            list = JSON.parse(dev.mdm_pending_uninstalls);
        } catch (_) {}
    }
    if (!list.includes(packageName)) {
        list.push(packageName);
    }

    db.prepare('UPDATE fleet_registered_devices SET mdm_pending_uninstalls = ? WHERE hardware_id = ?')
        .run(JSON.stringify(list), hardwareId);

    return { success: true };
}

// ------------------------------------------------------------------------------------------------
// IT Asset Documents & Attachments (Invoices, Warranties, Manuals, etc. saved directly to server disk)
// ------------------------------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function uploadAssetDocumentAction(formData: FormData): Promise<{ success: boolean; document?: any; error?: string }> {
    await authorizeAction('it-tools:assets:write');
    try {
        const file = formData.get('file') as File;
        const assetId = formData.get('asset_id') ? Number(formData.get('asset_id')) : 0;
        const documentType = (formData.get('document_type') as string) || 'other';
        const title = (formData.get('title') as string) || file?.name || 'Documento adjunto';

        if (!file || file.size === 0) {
            return { success: false, error: 'No se ha proporcionado ningún archivo o el archivo está vacío.' };
        }
        if (!assetId) {
            return { success: false, error: 'ID de activo inválido.' };
        }

        const uploadDir = path.join(process.cwd(), 'uploads', 'it-tools', 'documents');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const originalName = file.name;
        const fileExtension = path.extname(originalName);
        const uniqueFileName = `${crypto.randomUUID()}${fileExtension}`;
        const diskFilePath = path.join(uploadDir, uniqueFileName);

        // Guardar físicamente en disco (NUNCA base64 en base de datos)
        fs.writeFileSync(diskFilePath, buffer);

        const fileUrl = `/api/it-tools/documents/${uniqueFileName}`;
        const user = await getCurrentUser();
        const uploadedBy = user?.name || user?.email || 'Admin TI';
        const now = new Date().toISOString();

        const db = await getDb();
        const info = db.prepare(`
            INSERT INTO ${IT_TOOLS_TABLES.assetDocuments} (
                asset_id, document_type, title, file_name, file_url, file_size, uploaded_by, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(assetId, documentType, title, originalName, fileUrl, file.size, uploadedBy, now);

        const savedDoc = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assetDocuments} WHERE id = ?`).get(info.lastInsertRowid);
        return { success: true, document: JSON.parse(JSON.stringify(savedDoc)) };
    } catch (err: any) {
        console.error("Error uploading asset document:", err);
        return { success: false, error: 'Error al subir el archivo: ' + err.message };
    }
}

export async function deleteAssetDocumentAction(documentId: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('it-tools:assets:write');
    try {
        const db = await getDb();
        const doc = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.assetDocuments} WHERE id = ?`).get(documentId) as any;
        if (!doc) {
            return { success: false, error: 'Documento no encontrado.' };
        }

        // Eliminar archivo físico de disco
        if (doc.file_url && doc.file_url.startsWith('/api/it-tools/documents/')) {
            const fileName = doc.file_url.replace('/api/it-tools/documents/', '');
            const filePath = path.join(process.cwd(), 'uploads', 'it-tools', 'documents', fileName);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {
                    console.error("No se pudo borrar el archivo físico de disco:", e);
                }
            }
        }

        db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.assetDocuments} WHERE id = ?`).run(documentId);
        return { success: true };
    } catch (err: any) {
        console.error("Error deleting asset document:", err);
        return { success: false, error: 'Error al eliminar documento: ' + err.message };
    }
}

export async function requestDeviceReboot(hardwareId: string): Promise<{ success: boolean }> {
    await authorizeAction('it-tools:assets:write');
    const db = await getDb();
    db.prepare('UPDATE fleet_registered_devices SET mdm_pending_reboot = 1 WHERE hardware_id = ?').run(hardwareId);
    return { success: true };
}

// ------------------------------------------------------------------------------------------------
// Windows Agent Commands & Telemetry Management
// ------------------------------------------------------------------------------------------------

export async function queueAgentCommand(assetId: number, commandType: string, payload: any = {}, priority: number = 5): Promise<{ success: boolean; commandId?: number; error?: string }> {
    await authorizeAction('it-tools:assets:write');
    try {
        const db = await getDb();
        const user = await getCurrentUser();
        const createdBy = user?.name || user?.email || 'Admin TI';
        const now = new Date().toISOString();

        const info = db.prepare(`
            INSERT INTO ${IT_TOOLS_TABLES.agentCommands} (
                asset_id, command_type, payload_json, priority, status, created_by, created_at
            ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `).run(assetId, commandType, JSON.stringify(payload), priority, createdBy, now);

        return { success: true, commandId: Number(info.lastInsertRowid) };
    } catch (err: any) {
        console.error("Error queueing agent command:", err);
        return { success: false, error: err.message };
    }
}

export async function cancelAgentCommand(commandId: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('it-tools:assets:write');
    try {
        const db = await getDb();
        db.prepare(`UPDATE ${IT_TOOLS_TABLES.agentCommands} SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(commandId);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function getAgentOtaVersions(): Promise<any[]> {
    const db = await getDb();
    const rows = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.agentOtaVersions} ORDER BY version_code DESC`).all();
    return JSON.parse(JSON.stringify(rows));
}

export async function saveAgentOtaVersion(data: {
    version_name: string;
    version_code: number;
    file_url: string;
    file_size?: number;
    sha256_hash: string;
    release_notes?: string;
    is_active?: number;
}): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('it-tools:assets:admin');
    try {
        const db = await getDb();
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO ${IT_TOOLS_TABLES.agentOtaVersions} (
                version_name, version_code, file_url, file_size, sha256_hash, release_notes, is_active, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(version_name) DO UPDATE SET
                version_code = excluded.version_code,
                file_url = excluded.file_url,
                file_size = excluded.file_size,
                sha256_hash = excluded.sha256_hash,
                release_notes = excluded.release_notes,
                is_active = excluded.is_active
        `).run(
            data.version_name.trim(),
            data.version_code,
            data.file_url.trim(),
            data.file_size || 0,
            data.sha256_hash.trim(),
            data.release_notes || '',
            data.is_active !== undefined ? data.is_active : 1,
            now
        );
        return { success: true };
    } catch (err: any) {
        console.error("Error saving agent OTA version:", err);
        return { success: false, error: err.message };
    }
}
