/**
 * @fileoverview This file contains general-purpose Server Actions that can be called from client components.
 */
'use server';

import fs from 'fs';
import path from 'path';
import { importAllData, getPaginatedCustomers, getCustomerShipmentAddresses, updateShipmentAddressCoordinates } from './db';
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

export async function updateShipmentAddressCoordinatesAction(clienteId: string, direccionId: string, latitude: number | null, longitude: number | null): Promise<void> {
    await authorizeAction('deliveries:customers');
    return await updateShipmentAddressCoordinates(clienteId, direccionId, latitude, longitude);
}
