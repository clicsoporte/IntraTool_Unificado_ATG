/**
 * @fileoverview This file contains general-purpose Server Actions that can be called from client components.
 */
'use server';

import fs from 'fs';
import path from 'path';
import { getDb, importAllData, getPaginatedCustomers, getCustomerShipmentAddresses, updateShipmentAddressCoordinates, getPaginatedSuppliers, updateSupplierCoordinates } from './db';
import { logWarn } from './logger';
import { Customer } from '@/modules/core/types';
import { authorizeAction } from './auth-guard';

/**
 * A server action that triggers a full data synchronization from the configured source (file or SQL).
 * This function is safe to call from client components. It now also triggers a WAL checkpoint.
 * @returns {Promise<{ results: { type: string; count: number; }[], totalTasks: number }>} A promise that resolves to an object containing import results and the total number of tasks.
 */
export async function syncAllData(): Promise<{ results: { type: string; count: number; }[], totalTasks: number }> {
    return await importAllData();
}

/**
 * Shuts down the Node.js process.
 * This is a drastic action used to force a server restart after critical operations like a database restore.
 * It relies on a process manager (like PM2 or IIS) to automatically restart the application.
 */
export async function shutdownServer(): Promise<void> {
    await logWarn("SERVER SHUTDOWN INITIATED VIA ACTION. This will terminate the process.");
    // A small delay to ensure any final logs can be written
    setTimeout(() => {
        process.exit(1);
    }, 500);
}

/**
 * Cleans up all temporary export files from the server's disk.
 * @returns {Promise<number>} The number of files deleted.
 */
export async function cleanupAllExportFiles(): Promise<number> {
    const exportDir = path.join(process.cwd(), 'temp_files', 'exports');
    if (!fs.existsSync(exportDir)) {
        return 0;
    }
    
    const files = fs.readdirSync(exportDir);
    let deletedCount = 0;
    for (const file of files) {
        if (file.endsWith('.xlsx')) {
            fs.unlinkSync(path.join(exportDir, file));
            deletedCount++;
        }
    }
    return deletedCount;
}

export async function getPaginatedCustomersAction(search?: string, activeOnly?: boolean, page?: number, pageSize?: number, hasLocationOnly?: boolean): Promise<{ customers: Customer[]; totalCount: number; totalPages: number }> {
    await authorizeAction('deliveries:customers');
    return await getPaginatedCustomers(search, activeOnly, page, pageSize, hasLocationOnly);
}

export async function getCustomerShipmentAddressesAction(clienteId: string): Promise<any[]> {
    await authorizeAction('deliveries:customers');
    return await getCustomerShipmentAddresses(clienteId);
}

export async function updateShipmentAddressCoordinatesAction(
    clienteId: string, 
    direccionId: string, 
    latitude: number | null, 
    longitude: number | null,
    emailNotificacion?: string | null
): Promise<void> {
    await authorizeAction('deliveries:customers');
    return await updateShipmentAddressCoordinates(clienteId, direccionId, latitude, longitude, emailNotificacion);
}

export async function updateCustomerSlaSettingsAction(
    clienteId: string,
    data: {
        horaApertura?: string | null;
        horaCierre?: string | null;
        pausaInicio?: string | null;
        pausaFin?: string | null;
        esPrioritario?: boolean;
        requiereCita?: boolean;
        aplicaMulta?: boolean;
        notasRecepcion?: string | null;
    }
): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('deliveries:customers');
    const db = await getDb();
    try {
        db.prepare(`
            UPDATE core_customers
            SET hora_apertura = ?,
                hora_cierre = ?,
                pausa_inicio = ?,
                pausa_fin = ?,
                es_prioritario = ?,
                requiere_cita = ?,
                aplica_multa = ?,
                notas_recepcion = ?
            WHERE id = ?
        `).run(
            data.horaApertura || null,
            data.horaCierre || null,
            data.pausaInicio || null,
            data.pausaFin || null,
            data.esPrioritario ? 1 : 0,
            data.requiereCita ? 1 : 0,
            data.aplicaMulta ? 1 : 0,
            data.notasRecepcion || null,
            clienteId
        );
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getPaginatedSuppliersAction(search?: string, page?: number, pageSize?: number, hasLocationOnly?: boolean): Promise<{ suppliers: any[]; totalCount: number; totalPages: number }> {
    await authorizeAction('deliveries:customers');
    return await getPaginatedSuppliers(search, page, pageSize, hasLocationOnly);
}

export async function updateSupplierCoordinatesAction(
    supplierId: string,
    latitude: number | null,
    longitude: number | null
): Promise<void> {
    await authorizeAction('deliveries:customers');
    return await updateSupplierCoordinates(supplierId, latitude, longitude);
}

export async function searchProductsAction(query: string): Promise<{ id: string; description: string; unit?: string }[]> {
    await authorizeAction('deliveries:collect');
    const db = await getDb();
    try {
        if (!query || query.trim().length < 2) return [];
        const s = `%${query.trim()}%`;
        const rows = db.prepare(`
            SELECT id, description, unit 
            FROM core_products 
            WHERE id LIKE ? OR description LIKE ? 
            ORDER BY description ASC 
            LIMIT 15
        `).all(s, s) as any[];
        return rows;
    } catch (e: any) {
        console.error("Error searching products:", e);
        return [];
    }
}

/**
 * Retorna la configuración general y datos de la empresa cliente (Nombre, Cédula, Dirección, Teléfono, etc.)
 */
export async function getCompanySettingsAction() {
    const { getCompanySettings } = await import('./db');
    return await getCompanySettings();
}
