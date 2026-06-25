'use server';

import { getDb } from '@/modules/core/lib/db';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { revalidatePath } from 'next/cache';
import { authorizeActionAny, authorizeSession } from '@/modules/core/lib/auth-guard';
import { hasPermission } from '@/modules/core/lib/auth';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface InventoryItem {
    id: string;
    department_id: number;
    name: string;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    part_number: string | null;
    batch_number: string | null;
    category: string | null;
    quantity: number;
    unit: string;
    location: string | null;
    min_stock: number;
    price: number;
    datasheet_url: string | null;
    status: string;
}

export interface InventoryTransaction {
    id: number;
    item_id: string;
    quantity: number;
    type: 'ENTRY' | 'EXIT' | 'REPAIR_CONSUMPTION';
    reason: string;
    reference_id: string | null;
    created_at: string;
    created_by: string;
    item_name?: string; // Optional for reports
}

export interface RepairTicket {
    id: number;
    consecutive: string;
    department_id: number;
    subject: string;
    description: string;
    status: 'open' | 'in_progress' | 'on_hold' | 'completed' | 'canceled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    maintenance_type?: 'preventive' | 'corrective' | 'predictive' | 'installation' | 'upgrade' | null;
    equipment_name: string;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    created_at: string;
    created_by: string;
    assignee_id: number | null;
    assignee_name?: string | null;
    closed_at: string | null;
    closed_by: string | null;
    linked_asset_id?: number | null;
    requester_name?: string | null;
}

export interface TicketPart {
    id: number;
    ticket_id: number;
    item_id: string;
    quantity: number;
    price: number;
    created_at: string;
    created_by: string;
    item_name?: string;
    part_number?: string | null;
    batch_number?: string | null;
}

// ----------------------------------------------------
// 1. Departments Server Actions
// ----------------------------------------------------

export async function getDepartments() {
    await authorizeSession();
    try {
        const db = await getDb();
        const rows = db.prepare('SELECT * FROM inv_departments ORDER BY id ASC').all();
        return JSON.parse(JSON.stringify(rows));
    } catch (error: any) {
        logError('getDepartments failed', { error: error.message });
        throw new Error('Error al obtener los departamentos: ' + error.message);
    }
}

export async function updateDepartmentName(id: number, name: string, description: string, isActive?: number) {
    await authorizeActionAny(['admin:settings:general']);
    try {
        const db = await getDb();
        if (isActive !== undefined) {
            db.prepare('UPDATE inv_departments SET name = ?, description = ?, is_active = ? WHERE id = ?').run(name, description, isActive, id);
        } else {
            db.prepare('UPDATE inv_departments SET name = ?, description = ? WHERE id = ?').run(name, description, id);
        }
        logInfo('Department updated successfully', { id, name, isActive });
        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/tickets');
        return { success: true };
    } catch (error: any) {
        logError('updateDepartmentName failed', { error: error.message });
        throw new Error('Error al actualizar el departamento: ' + error.message);
    }
}

// ----------------------------------------------------
// 2. Inventory Items CRUD and Transactions Actions
// ----------------------------------------------------

export async function getInventoryItems(departmentId: number, search?: string, category?: string) {
    await authorizeSession();
    try {
        const db = await getDb();
        let query = "SELECT * FROM inv_items WHERE department_id = ? AND status = 'active'";
        const params: any[] = [departmentId];

        if (category && category !== 'all') {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ` AND (
                id LIKE ? OR 
                name LIKE ? OR 
                brand LIKE ? OR 
                model LIKE ? OR 
                serial_number LIKE ? OR 
                part_number LIKE ? OR 
                batch_number LIKE ? OR 
                location LIKE ?
            )`;
            const likeParam = `%${search}%`;
            params.push(likeParam, likeParam, likeParam, likeParam, likeParam, likeParam, likeParam, likeParam);
        }

        query += ' ORDER BY name ASC';
        const rows = db.prepare(query).all(...params);
        return JSON.parse(JSON.stringify(rows)) as InventoryItem[];
    } catch (error: any) {
        logError('getInventoryItems failed', { departmentId, error: error.message });
        throw new Error('Error al buscar repuestos: ' + error.message);
    }
}

export async function createInventoryItem(item: {
    id: string;
    departmentId: number;
    name: string;
    brand?: string;
    model?: string;
    serialNumber?: string;
    partNumber?: string;
    batchNumber?: string;
    category?: string;
    quantity: number;
    unit?: string;
    location?: string;
    minStock: number;
    price: number;
    datasheetUrl?: string;
    user: string;
}) {
    await authorizeSession();
    try {
        const db = await getDb();
        
        // Check uniqueness of ID
        const exists = db.prepare('SELECT 1 FROM inv_items WHERE id = ?').get(item.id);
        if (exists) {
            return { success: false, error: 'El código de repuesto ya existe en el sistema.' };
        }

        const now = new Date().toISOString();

        db.transaction(() => {
            // 1. Insert Item
            db.prepare(`
                INSERT INTO inv_items (
                    id, department_id, name, brand, model, serial_number, part_number, batch_number,
                    category, quantity, unit, location, min_stock, price, datasheet_url, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            `).run(
                item.id,
                item.departmentId,
                item.name,
                item.brand || null,
                item.model || null,
                item.serialNumber || null,
                item.partNumber || null,
                item.batchNumber || null,
                item.category || null,
                item.quantity,
                item.unit || 'unidades',
                item.location || null,
                item.minStock,
                item.price,
                item.datasheetUrl || null
            );

            // 2. Insert initial ENTRY transaction if quantity > 0
            if (item.quantity > 0) {
                db.prepare(`
                    INSERT INTO inv_transactions (item_id, quantity, type, reason, created_at, created_by)
                    VALUES (?, ?, 'ENTRY', 'Inventario Inicial', ?, ?)
                `).run(item.id, item.quantity, now, item.user);
            }
        })();

        logInfo('Inventory item created', { id: item.id, name: item.name });
        revalidatePath('/dashboard/inventory');
        return { success: true };
    } catch (error: any) {
        logError('createInventoryItem failed', { error: error.message });
        return { success: false, error: 'Error al registrar repuesto: ' + error.message };
    }
}

export async function updateInventoryItem(
    id: string,
    item: Partial<{
        name: string;
        brand: string;
        model: string;
        serialNumber: string;
        partNumber: string;
        batchNumber: string;
        category: string;
        unit: string;
        location: string;
        minStock: number;
        price: number;
        datasheetUrl: string;
        status: string;
    }>
) {
    await authorizeSession();
    try {
        const db = await getDb();

        const current = db.prepare('SELECT * FROM inv_items WHERE id = ?').get(id) as any;
        if (!current) {
            return { success: false, error: 'El repuesto no existe.' };
        }

        db.prepare(`
            UPDATE inv_items SET
                name = COALESCE(?, name),
                brand = COALESCE(?, brand),
                model = COALESCE(?, model),
                serial_number = COALESCE(?, serial_number),
                part_number = COALESCE(?, part_number),
                batch_number = COALESCE(?, batch_number),
                category = COALESCE(?, category),
                unit = COALESCE(?, unit),
                location = COALESCE(?, location),
                min_stock = COALESCE(?, min_stock),
                price = COALESCE(?, price),
                datasheet_url = COALESCE(?, datasheet_url),
                status = COALESCE(?, status)
            WHERE id = ?
        `).run(
            item.name ?? null,
            item.brand ?? null,
            item.model ?? null,
            item.serialNumber ?? null,
            item.partNumber ?? null,
            item.batchNumber ?? null,
            item.category ?? null,
            item.unit ?? null,
            item.location ?? null,
            item.minStock ?? null,
            item.price ?? null,
            item.datasheetUrl ?? null,
            item.status ?? null,
            id
        );

        logInfo('Inventory item updated', { id });
        revalidatePath('/dashboard/inventory');
        return { success: true };
    } catch (error: any) {
        logError('updateInventoryItem failed', { id, error: error.message });
        return { success: false, error: 'Error al actualizar repuesto: ' + error.message };
    }
}

export async function adjustInventoryStock(
    itemId: string,
    quantityChange: number,
    type: 'ENTRY' | 'EXIT',
    reason: string,
    user: string
) {
    await authorizeSession();
    try {
        const db = await getDb();

        const now = new Date().toISOString();

        const result = db.transaction(() => {
            const currentItem = db.prepare('SELECT quantity, name FROM inv_items WHERE id = ?').get(itemId) as { quantity: number; name: string } | undefined;
            if (!currentItem) {
                throw new Error('El repuesto no existe.');
            }

            const newQty = currentItem.quantity + quantityChange;
            if (newQty < 0) {
                throw new Error(`Inventario insuficiente para ${currentItem.name}. Stock actual: ${currentItem.quantity}, Intento de deducción: ${Math.abs(quantityChange)}.`);
            }

            // Update item quantity
            db.prepare('UPDATE inv_items SET quantity = ? WHERE id = ?').run(newQty, itemId);

            // Record transaction
            db.prepare(`
                INSERT INTO inv_transactions (item_id, quantity, type, reason, created_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(itemId, quantityChange, type, reason, now, user);

            return { success: true, newQuantity: newQty };
        })();

        logInfo('Stock adjusted manually', { itemId, quantityChange, type });
        revalidatePath('/dashboard/inventory');
        return result;
    } catch (error: any) {
        logError('adjustInventoryStock failed', { itemId, error: error.message });
        return { success: false, error: error.message };
    }
}

export async function getInventoryTransactions(itemId: string) {
    await authorizeSession();
    try {
        const db = await getDb();
        const rows = db.prepare(`
            SELECT t.*, i.name as item_name 
            FROM inv_transactions t
            JOIN inv_items i ON t.item_id = i.id
            WHERE t.item_id = ?
            ORDER BY t.created_at DESC
        `).all(itemId);
        return JSON.parse(JSON.stringify(rows)) as InventoryTransaction[];
    } catch (error: any) {
        logError('getInventoryTransactions failed', { itemId, error: error.message });
        throw new Error('Error al obtener transacciones: ' + error.message);
    }
}

// ----------------------------------------------------
// 3. Support and Repair Tickets Server Actions
// ----------------------------------------------------

export async function getTickets(departmentId: number, filters?: { status?: string; priority?: string }) {
    const user = await authorizeSession();
    try {
        const db = await getDb();
        const isAdmin = user.role === 'admin';
        const isManager = isAdmin || await hasPermission(user.id, `tickets:manage:${departmentId}`);
        const isReader = isManager || await hasPermission(user.id, `tickets:read:${departmentId}`);

        // Check if user is technician of this department
        const isTech = db.prepare('SELECT 1 FROM inv_department_technicians WHERE department_id = ? AND user_id = ?').get(departmentId, user.id) !== undefined;

        if (!isReader && !isTech) {
            return [];
        }

        let query = `
            SELECT t.*, u.name as assignee_name 
            FROM repair_tickets t
            LEFT JOIN core_users u ON t.assignee_id = u.id
            WHERE t.department_id = ?
        `;
        const params: any[] = [departmentId];

        if (isManager) {
            // Can see all tickets in the department
        } else if (isTech) {
            // Technical role: only assigned tickets
            query += ' AND t.assignee_id = ?';
            params.push(user.id);
        } else {
            // Creator: own tickets
            query += ' AND (t.created_by = ? OR t.created_by = ? OR t.requester_name = ?)';
            params.push(user.name, user.email || '', user.name);
        }

        if (filters?.status && filters.status !== 'all') {
            query += ' AND t.status = ?';
            params.push(filters.status);
        }

        if (filters?.priority && filters.priority !== 'all') {
            query += ' AND t.priority = ?';
            params.push(filters.priority);
        }

        query += ' ORDER BY t.created_at DESC';
        const rows = db.prepare(query).all(...params);
        return JSON.parse(JSON.stringify(rows)) as RepairTicket[];
    } catch (error: any) {
        logError('getTickets failed', { departmentId, error: error.message });
        throw new Error('Error al obtener tickets: ' + error.message);
    }
}

export async function createTicket(ticket: {
    departmentId: number;
    subject: string;
    description: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    maintenanceType?: string;
    equipmentName: string;
    brand?: string;
    model?: string;
    serialNumber?: string;
    user: string;
    linkedAssetId?: number;
    requesterName?: string;
}) {
    await authorizeSession();
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        // Auto-assign technician if default exists
        let defaultAssigneeId: number | null = null;
        if (ticket.departmentId === 1) {
            const row = db.prepare("SELECT default_assignee_id FROM fleet_settings WHERE category = 'maintenance_type' AND value = ?").get(ticket.maintenanceType || 'Correctivo') as { default_assignee_id: number | null } | undefined;
            if (row) defaultAssigneeId = row.default_assignee_id;
        } else {
            const row = db.prepare("SELECT default_assignee_id FROM inv_maintenance_types WHERE department_id = ? AND name = ?").get(ticket.departmentId, ticket.maintenanceType || 'Correctivo') as { default_assignee_id: number | null } | undefined;
            if (row) defaultAssigneeId = row.default_assignee_id;
        }

        const result = db.transaction(() => {
            // 1. Fetch & lock next ticket consecutive settings
            const settings = db.prepare('SELECT ticket_prefix, next_ticket_number FROM ticket_settings WHERE department_id = ?').get(ticket.departmentId) as { ticket_prefix: string; next_ticket_number: number } | undefined;
            if (!settings) {
                throw new Error('Configuración de tickets no encontrada para este departamento.');
            }

            const prefix = settings.ticket_prefix;
            const nextNum = settings.next_ticket_number;
            const consecutive = `${prefix}${String(nextNum).padStart(6, '0')}`;

            // 2. Insert ticket
            db.prepare(`
                INSERT INTO repair_tickets (
                    consecutive, department_id, subject, description, status, priority,
                    maintenance_type, equipment_name, brand, model, serial_number, created_at, created_by, assignee_id, linked_asset_id, requester_name
                ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                consecutive,
                ticket.departmentId,
                ticket.subject,
                ticket.description,
                ticket.priority || 'medium',
                ticket.maintenanceType || 'corrective',
                ticket.equipmentName,
                ticket.brand || null,
                ticket.model || null,
                ticket.serialNumber || null,
                now,
                ticket.user,
                defaultAssigneeId,
                ticket.linkedAssetId || null,
                ticket.requesterName || null
            );

            // Get the ticket ID
            const ticketId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;

            // Log history
            db.prepare(`
                INSERT INTO repair_ticket_history (ticket_id, action, description, performed_by, created_at)
                VALUES (?, 'create', 'Ticket creado.', ?, ?)
            `).run(ticketId, ticket.user, now);

            if (defaultAssigneeId) {
                const tech = db.prepare('SELECT name FROM core_users WHERE id = ?').get(defaultAssigneeId) as { name: string } | undefined;
                const techName = tech ? tech.name : `Técnico #${defaultAssigneeId}`;
                db.prepare(`
                    INSERT INTO repair_ticket_history (ticket_id, action, description, performed_by, created_at)
                    VALUES (?, 'assign', ?, 'Sistema', ?)
                `).run(ticketId, `Asignado automáticamente a ${techName} por tipo de mantenimiento.`, now);
            }

            // 3. Update next consecutive number
            db.prepare('UPDATE ticket_settings SET next_ticket_number = ? WHERE department_id = ?').run(nextNum + 1, ticket.departmentId);

            return { success: true, consecutive, id: ticketId };
        })();

        logInfo('Repair ticket created', { consecutive: result.consecutive });
        
        // Trigger email notification asynchronously
        if (result.success && result.id) {
            sendTicketEmailNotification(result.id, 'onTicketCreated');
        }

        revalidatePath('/dashboard/tickets');
        return result;
    } catch (error: any) {
        logError('createTicket failed', { error: error.message });
        return { success: false, error: 'Error al registrar ticket de soporte: ' + error.message };
    }
}

export async function updateTicketAssetAndRequester(ticketId: number, linkedAssetId: number | null, requesterName: string | null) {
    await authorizeSession();
    try {
        const db = await getDb();
        db.prepare('UPDATE repair_tickets SET linked_asset_id = ?, requester_name = ? WHERE id = ?').run(linkedAssetId, requesterName, ticketId);
        revalidatePath('/dashboard/tickets');
        return { success: true };
    } catch (error: any) {
        logError('updateTicketAssetAndRequester failed', { ticketId, error: error.message });
        return { success: false, error: error.message };
    }
}

export async function updateTicketStatus(
    ticketId: number,
    status: 'open' | 'in_progress' | 'on_hold' | 'completed' | 'canceled',
    user: string,
    odometerReading?: number
) {
    await authorizeSession();
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        db.transaction(() => {
            const statusLabels = { open: 'Abierto', in_progress: 'En Progreso', on_hold: 'En Espera', completed: 'Completado', canceled: 'Cancelado' };
            const statusLabel = statusLabels[status] || status;

            // Log history
            db.prepare(`
                INSERT INTO repair_ticket_history (ticket_id, action, description, performed_by, created_at)
                VALUES (?, 'status_change', ?, ?, ?)
            `).run(ticketId, `Estado cambiado a ${statusLabel}.`, user, now);

            if (status === 'completed' || status === 'canceled') {
                db.prepare(`
                    UPDATE repair_tickets 
                    SET status = ?, closed_at = ?, closed_by = ? 
                    WHERE id = ?
                `).run(status, now, user, ticketId);
            } else {
                db.prepare(`
                    UPDATE repair_tickets 
                    SET status = ?, closed_at = NULL, closed_by = NULL 
                    WHERE id = ?
                `).run(status, ticketId);
            }
        })();

        // Sync with Fleet Taller if applicable
        const ticket = db.prepare('SELECT department_id, linked_asset_id, serial_number, subject, description, closed_by, maintenance_type FROM repair_tickets WHERE id = ?').get(ticketId) as any;
        if (ticket && ticket.department_id === 1) {
            let vehicleId = ticket.linked_asset_id;
            if (!vehicleId && ticket.serial_number) {
                const vRow = db.prepare('SELECT id FROM fleet_vehicles WHERE UPPER(plate) = ?').get(ticket.serial_number.toUpperCase().trim()) as { id: number } | undefined;
                if (vRow) vehicleId = vRow.id;
            }

            if (status === 'completed' && odometerReading !== undefined && odometerReading !== null) {
                if (vehicleId) {
                    const { updateVehicleMileageAndCheckAlerts } = await import('@/modules/fleet/lib/db');
                    await updateVehicleMileageAndCheckAlerts(db, vehicleId, odometerReading, null);

                    // Sync to fleet_maintenance_logs
                    const existingLog = db.prepare('SELECT id FROM fleet_maintenance_logs WHERE ticket_id = ?').get(ticketId) as { id: number } | undefined;
                    if (!existingLog) {
                        const partsCostRow = db.prepare('SELECT SUM(quantity * price) as total FROM ticket_parts WHERE ticket_id = ?').get(ticketId) as { total: number | null } | undefined;
                        const partsCost = partsCostRow?.total || 0;

                        const parts = db.prepare(`
                            SELECT tp.quantity, i.name 
                            FROM ticket_parts tp
                            JOIN inv_items i ON tp.item_id = i.id
                            WHERE tp.ticket_id = ?
                        `).all(ticketId) as { quantity: number; name: string }[];

                        let partsDesc = '';
                        if (parts.length > 0) {
                            partsDesc = '\n\nRepuestos utilizados:\n' + parts.map(p => `- ${p.name} (Cant: ${p.quantity})`).join('\n');
                        }
                        const finalDescription = (ticket.description || 'Mantenimiento completado desde mesa de tickets') + partsDesc;

                        db.prepare(`
                            INSERT INTO fleet_maintenance_logs (vehicleId, date, mileage, type, description, cost, performedBy, createdBy, ticket_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            vehicleId,
                            now.split('T')[0],
                            odometerReading,
                            ticket.subject || 'Mantenimiento General',
                            finalDescription,
                            partsCost,
                            user || ticket.closed_by || 'Sistema',
                            user || 'Sistema',
                            ticketId
                        );

                        // If it's an oil change, update last oil change mileage
                        const isOilChange = String(ticket.subject || '').toLowerCase().includes('aceite') || String(ticket.description || '').toLowerCase().includes('aceite');
                        if (isOilChange) {
                            db.prepare(`
                                UPDATE fleet_vehicles 
                                SET lastOilChangeMileage = ?, currentMileage = MAX(currentMileage, ?), lastOilChangeAlertThreshold = 0
                                WHERE id = ?
                            `).run(odometerReading, odometerReading, vehicleId);
                        }

                        // Auto update preventative plans lastPerformedValue and reset threshold
                        db.prepare(`
                            UPDATE fleet_preventative_plans
                            SET lastPerformedValue = ?, lastAlertThreshold = 0
                            WHERE vehicleId = ? AND LOWER(maintenanceType) = LOWER(?)
                        `).run(odometerReading, vehicleId, ticket.maintenance_type || '');
                    } else {
                        db.prepare('UPDATE fleet_maintenance_logs SET mileage = ? WHERE ticket_id = ?').run(odometerReading, ticketId);
                    }
                }
            } else if (status !== 'completed') {
                // If reopened or canceled, remove the associated log entry in fleet_maintenance_logs
                db.prepare('DELETE FROM fleet_maintenance_logs WHERE ticket_id = ?').run(ticketId);
            }

            // Revalidate fleet pages
            revalidatePath('/dashboard/fleet');
            if (vehicleId) {
                revalidatePath(`/dashboard/fleet/vehicles/${vehicleId}`);
            }
        }

        logInfo('Ticket status updated', { ticketId, status });
        
        // Trigger email notification asynchronously
        sendTicketEmailNotification(ticketId, 'onTicketStatusChanged');

        revalidatePath('/dashboard/tickets');
        return { success: true };
    } catch (error: any) {
        logError('updateTicketStatus failed', { ticketId, error: error.message });
        return { success: false, error: 'Error al actualizar estado del ticket: ' + error.message };
    }
}

export async function assignTicket(ticketId: number, assigneeId: number | null) {
    const user = await authorizeSession();
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        db.transaction(() => {
            let assigneeName = 'sin asignar';
            if (assigneeId) {
                const tech = db.prepare('SELECT name FROM core_users WHERE id = ?').get(assigneeId) as { name: string } | undefined;
                if (tech) assigneeName = tech.name;
            }

            db.prepare('UPDATE repair_tickets SET assignee_id = ? WHERE id = ?').run(assigneeId, ticketId);

            db.prepare(`
                INSERT INTO repair_ticket_history (ticket_id, action, description, performed_by, created_at)
                VALUES (?, 'assign', ?, ?, ?)
            `).run(ticketId, `Ticket asignado a ${assigneeName}.`, user.name, now);
        })();

        logInfo('Ticket assigned', { ticketId, assigneeId });

        // Trigger email notification since status or assignee changed
        sendTicketEmailNotification(ticketId, 'onTicketStatusChanged');

        revalidatePath('/dashboard/tickets');
        return { success: true };
    } catch (error: any) {
        logError('assignTicket failed', { ticketId, error: error.message });
        return { success: false, error: 'Error al asignar ticket: ' + error.message };
    }
}

export async function getTicketHistory(ticketId: number) {
    await authorizeSession();
    try {
        const db = await getDb();
        const rows = db.prepare('SELECT * FROM repair_ticket_history WHERE ticket_id = ? ORDER BY id DESC').all(ticketId);
        return JSON.parse(JSON.stringify(rows));
    } catch (error: any) {
        logError('getTicketHistory failed', { ticketId, error: error.message });
        throw new Error('Error al obtener historial de auditoría: ' + error.message);
    }
}

export async function updateTicketDetails(
    ticketId: number,
    details: {
        subject: string;
        description: string;
        priority: 'low' | 'medium' | 'high' | 'urgent';
        maintenanceType?: string;
        equipmentName: string;
        brand?: string;
        model?: string;
        serialNumber?: string;
        user: string;
    }
) {
    await authorizeSession();
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        db.transaction(() => {
            db.prepare(`
                UPDATE repair_tickets
                SET subject = ?, description = ?, priority = ?, maintenance_type = ?,
                    equipment_name = ?, brand = ?, model = ?, serial_number = ?
                WHERE id = ?
            `).run(
                details.subject,
                details.description,
                details.priority,
                details.maintenanceType || 'corrective',
                details.equipmentName,
                details.brand || null,
                details.model || null,
                details.serialNumber || null,
                ticketId
            );

            db.prepare(`
                INSERT INTO repair_ticket_history (ticket_id, action, description, performed_by, created_at)
                VALUES (?, 'update', 'Detalles del ticket actualizados.', ?, ?)
            `).run(ticketId, details.user, now);
        })();

        logInfo('Ticket details updated', { ticketId });
        sendTicketEmailNotification(ticketId, 'onTicketStatusChanged');
        revalidatePath('/dashboard/tickets');
        return { success: true };
    } catch (error: any) {
        logError('updateTicketDetails failed', { ticketId, error: error.message });
        return { success: false, error: 'Error al actualizar detalles del ticket: ' + error.message };
    }
}

export async function updateMaintenanceTypeAssignee(id: number, assigneeId: number | null, departmentId: number) {
    await authorizeActionAny(['admin:settings:general']);
    try {
        const db = await getDb();
        if (departmentId === 1) {
            db.prepare('UPDATE fleet_settings SET default_assignee_id = ? WHERE id = ?').run(assigneeId, id);
        } else {
            db.prepare('UPDATE inv_maintenance_types SET default_assignee_id = ? WHERE id = ?').run(assigneeId, id);
        }
        revalidatePath('/dashboard/admin/inventory');
        revalidatePath('/dashboard/tickets');
        return { success: true };
    } catch (error: any) {
        logError('updateMaintenanceTypeAssignee failed', { id, assigneeId, departmentId, error: error.message });
        return { success: false, error: error.message };
    }
}

export async function sendTicketEmailNotification(ticketId: number, eventId: 'onTicketCreated' | 'onTicketStatusChanged') {
    try {
        const db = await getDb();
        
        const ticket = db.prepare(`
            SELECT t.*, d.name as department_name, u.name as assignee_name, u.email as assignee_email
            FROM repair_tickets t
            LEFT JOIN inv_departments d ON t.department_id = d.id
            LEFT JOIN core_users u ON t.assignee_id = u.id
            WHERE t.id = ?
        `).get(ticketId) as any;
        
        if (!ticket) return;

        let creatorEmail = '';
        let requesterEmail = '';
        
        if (ticket.created_by) {
            const creatorUser = db.prepare('SELECT email FROM core_users WHERE name = ? OR email = ?').get(ticket.created_by, ticket.created_by) as { email: string } | undefined;
            if (creatorUser) creatorEmail = creatorUser.email;
        }
        if (ticket.requester_name) {
            const requesterUser = db.prepare('SELECT email FROM core_users WHERE name = ? OR email = ?').get(ticket.requester_name, ticket.requester_name) as { email: string } | undefined;
            if (requesterUser) requesterEmail = requesterUser.email;
        }

        const priorityLabels = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
        const priorityLabel = priorityLabels[ticket.priority as keyof typeof priorityLabels] || ticket.priority;

        const statusLabels = { open: 'Abierto', in_progress: 'En Progreso', on_hold: 'En Espera', completed: 'Completado', canceled: 'Cancelado' };
        const statusLabel = statusLabels[ticket.status as keyof typeof statusLabels] || ticket.status;

        const parts = db.prepare(`
            SELECT tp.*, i.name as item_name, i.part_number 
            FROM ticket_parts tp
            JOIN inv_items i ON tp.item_id = i.id
            WHERE tp.ticket_id = ?
        `).all(ticketId) as any[];
        
        let partsTable = '';
        if (parts.length > 0) {
            partsTable = `
                <h3 style="color: #1e3a8a; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px;">Repuestos Consumidos</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px;">
                    <thead>
                        <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Repuesto</th>
                            <th style="padding: 8px; text-align: center; border: 1px solid #e2e8f0; width: 15%;">Cantidad</th>
                            <th style="padding: 8px; text-align: right; border: 1px solid #e2e8f0; width: 20%;">Precio</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            for (const p of parts) {
                partsTable += `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #e2e8f0;">${p.item_name} ${p.part_number ? `(${p.part_number})` : ''}</td>
                        <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;">${p.quantity}</td>
                        <td style="padding: 8px; text-align: right; border: 1px solid #e2e8f0;">¢${p.price.toLocaleString()}</td>
                    </tr>
                `;
            }
            partsTable += `</tbody></table>`;
        }

        const consumables = db.prepare(`
            SELECT tc.*, i.name as item_name
            FROM inv_ticket_consumables tc
            JOIN inv_items i ON tc.inventory_item_id = i.id
            WHERE tc.ticket_id = ?
        `).all(ticketId) as any[];

        let consumablesTable = '';
        if (consumables.length > 0) {
            consumablesTable = `
                <h3 style="color: #1e3a8a; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px;">Consumibles Utilizados</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px;">
                    <thead>
                        <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                            <th style="padding: 8px; text-align: left; border: 1px solid #e2e8f0;">Consumible</th>
                            <th style="padding: 8px; text-align: center; border: 1px solid #e2e8f0; width: 15%;">Cantidad</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            for (const c of consumables) {
                consumablesTable += `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #e2e8f0;">${c.item_name}</td>
                        <td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;">${c.quantity}</td>
                    </tr>
                `;
            }
            consumablesTable += `</tbody></table>`;
        }

        const history = db.prepare(`
            SELECT * FROM repair_ticket_history WHERE ticket_id = ? ORDER BY created_at ASC
        `).all(ticketId) as any[];

        let historyTable = '';
        if (history.length > 0) {
            historyTable = `
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #475569;">
                    <thead>
                        <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <th style="padding: 6px; text-align: left; border: 1px solid #e2e8f0;">Fecha</th>
                            <th style="padding: 6px; text-align: left; border: 1px solid #e2e8f0;">Acción</th>
                            <th style="padding: 6px; text-align: left; border: 1px solid #e2e8f0;">Usuario</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            for (const h of history) {
                const formattedDate = new Date(h.created_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
                historyTable += `
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; white-space: nowrap;">${formattedDate}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0;">${h.description}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0;">${h.performed_by}</td>
                    </tr>
                `;
            }
            historyTable += `</tbody></table>`;
        } else {
            historyTable = `<p style="font-size: 12px; color: #94a3b8; font-style: italic; margin: 0;">No hay historial de cambios registrado.</p>`;
        }

        const payload = {
            consecutive: ticket.consecutive,
            subject: ticket.subject,
            departmentName: ticket.department_name || `Instancia #${ticket.department_id}`,
            maintenanceType: ticket.maintenance_type || 'Correctivo',
            status: statusLabel,
            priority: priorityLabel,
            equipmentName: ticket.equipment_name,
            brand: ticket.brand || 'N/A',
            model: ticket.model || 'N/A',
            serialNumber: ticket.serial_number || 'N/A',
            requesterName: ticket.requester_name || ticket.created_by,
            createdByName: ticket.created_by,
            assigneeName: ticket.assignee_name || 'Sin asignar',
            description: ticket.description,
            partsTable,
            consumablesTable,
            historyTable
        };

        const { triggerNotificationEvent } = await import('@/modules/notifications/lib/notifications-engine');
        await triggerNotificationEvent(eventId, payload);

        const template = db.prepare('SELECT subject, body FROM notification_templates WHERE eventId = ?').get(eventId) as { subject: string, body: string } | undefined;
        if (template) {
            const applyTemplateStr = (tmpl: string) => {
                let processed = tmpl.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, field, content) => {
                    return !!(payload as any)[field] ? content : '';
                });
                return processed.replace(/\{\{(\w+)\}\}/g, (match, key) => {
                    const val = (payload as any)[key];
                    return (val !== undefined && val !== null) ? String(val) : match;
                });
            };

            const finalSubject = applyTemplateStr(template.subject);
            const finalBody = applyTemplateStr(template.body);

            const recs = new Set<string>();
            if (creatorEmail) recs.add(creatorEmail);
            if (requesterEmail) recs.add(requesterEmail);
            
            if (recs.size > 0) {
                const { sendEmail } = await import('@/modules/core/lib/email-service');
                await sendEmail({
                    to: Array.from(recs),
                    subject: finalSubject,
                    html: finalBody
                });
                await logInfo(`Sent ticket email notification directly to users`, { ticketId, eventId, recipients: Array.from(recs) });
            }
        }
    } catch (error: any) {
        await logError('sendTicketEmailNotification failed', { ticketId, eventId, error: error.message });
    }
}

// ----------------------------------------------------
// 4. Ticket Parts Consumption and Atomic Transactions
// ----------------------------------------------------

export async function addPartToTicket(ticketId: number, itemId: string, quantity: number, user: string) {
    await authorizeSession();
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        const result = db.transaction(() => {
            // 1. Fetch Item details
            const item = db.prepare('SELECT name, quantity, price, department_id FROM inv_items WHERE id = ?').get(itemId) as { name: string; quantity: number; price: number; department_id: number } | undefined;
            if (!item) {
                throw new Error('El repuesto no existe.');
            }

            // 2. Validate stock
            if (item.quantity < quantity) {
                throw new Error(`Inventario insuficiente para ${item.name}. Disponible: ${item.quantity}, Solicitado: ${quantity}.`);
            }

            // 3. Fetch Ticket details
            const ticket = db.prepare('SELECT consecutive, status FROM repair_tickets WHERE id = ?').get(ticketId) as { consecutive: string; status: string } | undefined;
            if (!ticket) {
                throw new Error('El ticket de reparación no existe.');
            }
            if (ticket.status === 'completed' || ticket.status === 'canceled') {
                throw new Error('No se pueden modificar los repuestos de un ticket completado o cancelado.');
            }

            // 4. Reduce stock
            db.prepare('UPDATE inv_items SET quantity = quantity - ? WHERE id = ?').run(quantity, itemId);

            // 5. Link part to ticket
            db.prepare(`
                INSERT INTO ticket_parts (ticket_id, item_id, quantity, price, created_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(ticketId, itemId, quantity, item.price, now, user);

            // Record history log
            db.prepare(`
                INSERT INTO repair_ticket_history (ticket_id, action, description, performed_by, created_at)
                VALUES (?, 'add_part', ?, ?, ?)
            `).run(ticketId, `Repuesto agregado: ${item.name} (Cant: ${quantity}).`, user, now);

            // 6. Record transaction in history
            db.prepare(`
                INSERT INTO inv_transactions (item_id, quantity, type, reason, reference_id, created_at, created_by)
                VALUES (?, ?, 'REPAIR_CONSUMPTION', ?, ?, ?, ?)
            `).run(itemId, -quantity, `Consumo en reparación de ticket ${ticket.consecutive}`, String(ticketId), now, user);

            return { success: true };
        })();

        logInfo('Part added to ticket', { ticketId, itemId, quantity });
        revalidatePath('/dashboard/tickets');
        revalidatePath('/dashboard/inventory');
        return result;
    } catch (error: any) {
        logError('addPartToTicket failed', { ticketId, itemId, error: error.message });
        return { success: false, error: error.message };
    }
}

export async function removePartFromTicket(ticketId: number, partId: number, user: string) {
    await authorizeSession();
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        const result = db.transaction(() => {
            // 1. Fetch Part assignment details
            const ticketPart = db.prepare('SELECT item_id, quantity FROM ticket_parts WHERE id = ?').get(partId) as { item_id: string; quantity: number } | undefined;
            if (!ticketPart) {
                throw new Error('La pieza asociada no existe.');
            }

            // 2. Fetch Ticket details
            const ticket = db.prepare('SELECT consecutive, status FROM repair_tickets WHERE id = ?').get(ticketId) as { consecutive: string; status: string } | undefined;
            if (!ticket) {
                throw new Error('El ticket de reparación no existe.');
            }
            if (ticket.status === 'completed' || ticket.status === 'canceled') {
                throw new Error('No se pueden modificar los repuestos de un ticket completado o cancelado.');
            }

            // 3. Return stock to item catalog
            db.prepare('UPDATE inv_items SET quantity = quantity + ? WHERE id = ?').run(ticketPart.quantity, ticketPart.item_id);

            // 4. Delete the ticket_parts linkage
            db.prepare('DELETE FROM ticket_parts WHERE id = ?').run(partId);

            // Fetch item details for naming in audit
            const item = db.prepare('SELECT name FROM inv_items WHERE id = ?').get(ticketPart.item_id) as { name: string } | undefined;
            const itemName = item ? item.name : ticketPart.item_id;

            // Record history log
            db.prepare(`
                INSERT INTO repair_ticket_history (ticket_id, action, description, performed_by, created_at)
                VALUES (?, 'remove_part', ?, ?, ?)
            `).run(ticketId, `Repuesto removido: ${itemName} (Cant: ${ticketPart.quantity}).`, user, now);

            // 5. Record rollback entry transaction
            db.prepare(`
                INSERT INTO inv_transactions (item_id, quantity, type, reason, reference_id, created_at, created_by)
                VALUES (?, ?, 'ENTRY', ?, ?, ?, ?)
            `).run(ticketPart.item_id, ticketPart.quantity, `Retorno/Reversión de pieza en ticket ${ticket.consecutive}`, String(ticketId), now, user);

            return { success: true };
        })();

        logInfo('Part removed from ticket', { ticketId, partId });
        revalidatePath('/dashboard/tickets');
        revalidatePath('/dashboard/inventory');
        return result;
    } catch (error: any) {
        logError('removePartFromTicket failed', { ticketId, partId, error: error.message });
        return { success: false, error: error.message };
    }
}

export async function getTicketParts(ticketId: number) {
    await authorizeSession();
    try {
        const db = await getDb();
        const rows = db.prepare(`
            SELECT p.*, i.name as item_name, i.part_number, i.batch_number 
            FROM ticket_parts p
            JOIN inv_items i ON p.item_id = i.id
            WHERE p.ticket_id = ?
            ORDER BY p.created_at ASC
        `).all(ticketId);
        return JSON.parse(JSON.stringify(rows)) as TicketPart[];
    } catch (error: any) {
        logError('getTicketParts failed', { ticketId, error: error.message });
        throw new Error('Error al obtener piezas del ticket: ' + error.message);
    }
}

// ----------------------------------------------------
// 5. Settings and Customization Server Actions
// ----------------------------------------------------

export async function getTicketSettings(departmentId: number) {
    await authorizeSession();
    try {
        const db = await getDb();
        const row = db.prepare('SELECT * FROM ticket_settings WHERE department_id = ?').get(departmentId);
        return JSON.parse(JSON.stringify(row)) as { department_id: number; ticket_prefix: string; next_ticket_number: number } | null;
    } catch (error: any) {
        logError('getTicketSettings failed', { departmentId, error: error.message });
        throw new Error('Error al obtener configuraciones: ' + error.message);
    }
}

export async function updateTicketSettings(departmentId: number, prefix: string, nextNumber: number) {
    await authorizeActionAny(['admin:settings:general']);
    try {
        const db = await getDb();
        db.prepare('UPDATE ticket_settings SET ticket_prefix = ?, next_ticket_number = ? WHERE department_id = ?').run(prefix, nextNumber, departmentId);
        logInfo('Ticket settings updated successfully', { departmentId, prefix, nextNumber });
        revalidatePath('/dashboard/tickets');
        return { success: true };
    } catch (error: any) {
        logError('updateTicketSettings failed', { departmentId, error: error.message });
        throw new Error('Error al guardar configuración de tickets: ' + error.message);
    }
}

export async function getTechnicians(departmentId?: number) {
    await authorizeSession();
    try {
        const db = await getDb();
        if (departmentId) {
            // Filter technicians assigned exclusively to this department
            const rows = db.prepare(`
                SELECT u.id, u.name 
                FROM core_users u
                JOIN inv_department_technicians dt ON u.id = dt.user_id
                WHERE dt.department_id = ?
                ORDER BY u.name ASC
            `).all(departmentId);
            
            return JSON.parse(JSON.stringify(rows)) as { id: number; name: string }[];
        } else {
            const rows = db.prepare('SELECT id, name FROM core_users ORDER BY name ASC').all();
            return JSON.parse(JSON.stringify(rows)) as { id: number; name: string }[];
        }
    } catch (error: any) {
        logError('getTechnicians failed', { departmentId, error: error.message });
        throw new Error('Error al obtener la lista de técnicos: ' + error.message);
    }
}

export async function getDepartmentTechnicians(departmentId: number) {
    await authorizeSession();
    try {
        const db = await getDb();
        const rows = db.prepare(`
            SELECT u.id, u.name, 
                   EXISTS(SELECT 1 FROM inv_department_technicians WHERE department_id = ? AND user_id = u.id) as is_assigned
            FROM core_users u
            ORDER BY u.name ASC
        `).all(departmentId);
        return JSON.parse(JSON.stringify(rows)) as { id: number; name: string; is_assigned: number }[];
    } catch (error: any) {
        logError('getDepartmentTechnicians failed', { departmentId, error: error.message });
        throw new Error('Error al obtener técnicos del departamento: ' + error.message);
    }
}

export async function setDepartmentTechnicians(departmentId: number, userIds: number[]) {
    await authorizeActionAny(['admin:settings:general']);
    try {
        const db = await getDb();
        db.transaction(() => {
            db.prepare('DELETE FROM inv_department_technicians WHERE department_id = ?').run(departmentId);
            const insert = db.prepare('INSERT INTO inv_department_technicians (department_id, user_id) VALUES (?, ?)');
            for (const uid of userIds) {
                insert.run(departmentId, uid);
            }
        })();
        revalidatePath('/dashboard/tickets');
        return { success: true };
    } catch (error: any) {
        logError('setDepartmentTechnicians failed', { departmentId, error: error.message });
        throw new Error('Error al guardar técnicos de la instancia: ' + error.message);
    }
}

export async function getFleetMaintenanceTypes(): Promise<string[]> {
    await authorizeSession();
    try {
        const db = await getDb();
        const rows = db.prepare("SELECT value FROM fleet_settings WHERE category = 'maintenance_type' ORDER BY value").all() as { value: string }[];
        return rows.map(r => r.value);
    } catch (error: any) {
        logError('getFleetMaintenanceTypes failed', { error: error.message });
        return ['Correctivo', 'Preventivo', 'Predictivo', 'Instalación', 'Upgrade'];
    }
}

export async function uploadInventoryFileAction(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
    await authorizeSession();
    try {
        const file = formData.get('file') as File;
        if (!file || file.size === 0) {
            return { success: false, error: 'No se ha proporcionado ningún archivo o el archivo está vacío.' };
        }

        const uploadDir = path.join(process.cwd(), 'uploads', 'inventory');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileExtension = path.extname(file.name);
        const fileName = `${crypto.randomUUID()}${fileExtension}`;
        const filePath = path.join(uploadDir, fileName);

        fs.writeFileSync(filePath, buffer);
        
        // Return URL path for the file serving endpoint
        const fileUrl = `/api/inventory/files/${fileName}`;
        return { success: true, url: fileUrl };
    } catch (err: any) {
        logError('uploadInventoryFileAction failed', { error: err.message });
        return { success: false, error: 'Error al subir el archivo: ' + err.message };
    }
}

export async function getMaintenanceTypesByDept(departmentId: number): Promise<{ id: number; name: string; default_assignee_id: number | null }[]> {
    await authorizeSession();
    try {
        const db = await getDb();
        if (departmentId === 1) {
            const rows = db.prepare("SELECT id, value as name, default_assignee_id FROM fleet_settings WHERE category = 'maintenance_type' ORDER BY value").all() as { id: number; name: string; default_assignee_id: number | null }[];
            return JSON.parse(JSON.stringify(rows));
        } else {
            const rows = db.prepare("SELECT id, name, default_assignee_id FROM inv_maintenance_types WHERE department_id = ? ORDER BY name ASC").all(departmentId) as { id: number; name: string; default_assignee_id: number | null }[];
            return JSON.parse(JSON.stringify(rows));
        }
    } catch (error: any) {
        logError('getMaintenanceTypesByDept failed', { departmentId, error: error.message });
        return [];
    }
}

export async function addMaintenanceType(departmentId: number, name: string): Promise<{ success: boolean; error?: string }> {
    await authorizeActionAny(['admin:settings:general']);
    if (!name || !name.trim()) {
        return { success: false, error: 'El nombre es requerido.' };
    }
    try {
        const db = await getDb();
        if (departmentId === 1) {
            const exists = db.prepare("SELECT 1 FROM fleet_settings WHERE category = 'maintenance_type' AND LOWER(value) = ?").get(name.trim().toLowerCase());
            if (exists) {
                return { success: false, error: 'Este tipo de mantenimiento ya existe para el taller de flota.' };
            }
            db.prepare("INSERT INTO fleet_settings (category, value, price) VALUES ('maintenance_type', ?, 0)").run(name.trim());
        } else {
            const exists = db.prepare("SELECT 1 FROM inv_maintenance_types WHERE department_id = ? AND LOWER(name) = ?").get(departmentId, name.trim().toLowerCase());
            if (exists) {
                return { success: false, error: 'Este tipo de mantenimiento ya existe para este departamento.' };
            }
            
            const now = new Date().toISOString();
            db.prepare("INSERT INTO inv_maintenance_types (department_id, name, created_at) VALUES (?, ?, ?)").run(departmentId, name.trim(), now);
        }
        
        revalidatePath('/dashboard/tickets');
        revalidatePath('/dashboard/admin/inventory');
        return { success: true };
    } catch (error: any) {
        logError('addMaintenanceType failed', { departmentId, name, error: error.message });
        return { success: false, error: error.message };
    }
}

export async function deleteMaintenanceType(id: number, departmentId?: number): Promise<{ success: boolean; error?: string }> {
    await authorizeActionAny(['admin:settings:general']);
    try {
        const db = await getDb();
        if (departmentId === 1) {
            db.prepare("DELETE FROM fleet_settings WHERE id = ? AND category = 'maintenance_type'").run(id);
        } else {
            const exists = db.prepare("SELECT 1 FROM inv_maintenance_types WHERE id = ?").get(id);
            if (exists) {
                db.prepare("DELETE FROM inv_maintenance_types WHERE id = ?").run(id);
            } else {
                db.prepare("DELETE FROM fleet_settings WHERE id = ? AND category = 'maintenance_type'").run(id);
            }
        }
        
        revalidatePath('/dashboard/tickets');
        revalidatePath('/dashboard/admin/inventory');
        return { success: true };
    } catch (error: any) {
        logError('deleteMaintenanceType failed', { id, error: error.message });
        return { success: false, error: error.message };
    }
}

export async function deductTicketConsumables(ticketId: number, itemId: string, quantity: number, user: string) {
    await authorizeSession();
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        const result = db.transaction(() => {
            // 1. Fetch Item details
            const item = db.prepare('SELECT name, quantity, price, department_id, is_consumable FROM inv_items WHERE id = ?').get(itemId) as { name: string; quantity: number; price: number; department_id: number; is_consumable: number } | undefined;
            if (!item) {
                throw new Error('El artículo de inventario no existe.');
            }

            // 2. Validate stock
            if (item.quantity < quantity) {
                throw new Error(`Inventario insuficiente para ${item.name}. Disponible: ${item.quantity}, Solicitado: ${quantity}.`);
            }

            // 3. Fetch Ticket details
            const ticket = db.prepare('SELECT consecutive, status FROM repair_tickets WHERE id = ?').get(ticketId) as { consecutive: string; status: string } | undefined;
            if (!ticket) {
                throw new Error('El ticket de soporte no existe.');
            }
            if (ticket.status === 'completed' || ticket.status === 'canceled') {
                throw new Error('No se pueden modificar los consumibles de un ticket completado o cancelado.');
            }

            // 4. Reduce stock
            db.prepare('UPDATE inv_items SET quantity = quantity - ? WHERE id = ?').run(quantity, itemId);

            // 5. Link consumable to ticket
            db.prepare(`
                INSERT INTO inv_ticket_consumables (ticket_id, inventory_item_id, quantity, registered_at)
                VALUES (?, ?, ?, ?)
            `).run(ticketId, itemId, quantity, now);

            // Record history log
            db.prepare(`
                INSERT INTO repair_ticket_history (ticket_id, action, description, performed_by, created_at)
                VALUES (?, 'add_consumable', ?, ?, ?)
            `).run(ticketId, `Consumible utilizado: ${item.name} (Cant: ${quantity}).`, user, now);

            // 6. Record transaction in history
            db.prepare(`
                INSERT INTO inv_transactions (item_id, quantity, type, reason, reference_id, created_at, created_by)
                VALUES (?, ?, 'REPAIR_CONSUMPTION', ?, ?, ?, ?)
            `).run(itemId, -quantity, `Consumo de consumible en ticket ${ticket.consecutive}`, String(ticketId), now, user);

            return { success: true };
        })();

        logInfo('Consumable deducted from ticket', { ticketId, itemId, quantity });
        revalidatePath('/dashboard/tickets');
        revalidatePath('/dashboard/inventory');
        return result;
    } catch (error: any) {
        logError('deductTicketConsumables failed', { ticketId, itemId, error: error.message });
        return { success: false, error: error.message };
    }
}

export async function removeConsumableFromTicket(ticketId: number, consumableId: number, user: string) {
    await authorizeSession();
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        const result = db.transaction(() => {
            // 1. Fetch assignment details
            const ticketConsumable = db.prepare('SELECT inventory_item_id, quantity FROM inv_ticket_consumables WHERE id = ?').get(consumableId) as { inventory_item_id: string; quantity: number } | undefined;
            if (!ticketConsumable) {
                throw new Error('El consumo registrado no existe.');
            }

            // 2. Fetch Ticket details
            const ticket = db.prepare('SELECT consecutive, status FROM repair_tickets WHERE id = ?').get(ticketId) as { consecutive: string; status: string } | undefined;
            if (!ticket) {
                throw new Error('El ticket de soporte no existe.');
            }
            if (ticket.status === 'completed' || ticket.status === 'canceled') {
                throw new Error('No se pueden modificar los consumibles de un ticket completado o cancelado.');
            }

            // 3. Return stock to item catalog
            db.prepare('UPDATE inv_items SET quantity = quantity + ? WHERE id = ?').run(ticketConsumable.quantity, ticketConsumable.inventory_item_id);

            // 4. Delete the inv_ticket_consumables linkage
            db.prepare('DELETE FROM inv_ticket_consumables WHERE id = ?').run(consumableId);

            // Fetch item details for naming in audit
            const item = db.prepare('SELECT name FROM inv_items WHERE id = ?').get(ticketConsumable.inventory_item_id) as { name: string } | undefined;
            const itemName = item ? item.name : ticketConsumable.inventory_item_id;

            // Record history log
            db.prepare(`
                INSERT INTO repair_ticket_history (ticket_id, action, description, performed_by, created_at)
                VALUES (?, 'remove_consumable', ?, ?, ?)
            `).run(ticketId, `Consumible removido: ${itemName} (Cant: ${ticketConsumable.quantity}).`, user, now);

            // 5. Record rollback entry transaction
            db.prepare(`
                INSERT INTO inv_transactions (item_id, quantity, type, reason, reference_id, created_at, created_by)
                VALUES (?, ?, 'ENTRY', ?, ?, ?, ?)
            `).run(ticketConsumable.inventory_item_id, ticketConsumable.quantity, `Reversión de consumible en ticket ${ticket.consecutive}`, String(ticketId), now, user);

            return { success: true };
        })();

        logInfo('Consumable removed from ticket', { ticketId, consumableId });
        revalidatePath('/dashboard/tickets');
        revalidatePath('/dashboard/inventory');
        return result;
    } catch (error: any) {
        logError('removeConsumableFromTicket failed', { ticketId, consumableId, error: error.message });
        return { success: false, error: error.message };
    }
}

export async function getTicketConsumables(ticketId: number) {
    await authorizeSession();
    try {
        const db = await getDb();
        const rows = db.prepare(`
            SELECT c.*, i.name as item_name, i.unit as item_unit, i.price as item_price
            FROM inv_ticket_consumables c
            JOIN inv_items i ON c.inventory_item_id = i.id
            WHERE c.ticket_id = ?
            ORDER BY c.registered_at DESC
        `).all(ticketId);
        return JSON.parse(JSON.stringify(rows)) as any[];
    } catch (error: any) {
        logError('getTicketConsumables failed', { ticketId, error: error.message });
        return [];
    }
}

