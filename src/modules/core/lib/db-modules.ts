/**
 * @fileoverview This file acts as the central registry for all database modules.
 * It defines the static configuration for each module, including its database file
 * and schema, but does NOT contain executable functions, to prevent circular dependencies.
 */

import type { DatabaseModule } from '@/modules/core/types';

// Import schema definitions
import { CORE_TABLES } from './schema';

/**
 * Acts as a registry for all database modules in the application.
 * This is the single source of truth for module definitions, containing only configuration data.
 */
export const DB_MODULES: { id: string, name: string, dbFile: string }[] = [
    { 
        id: 'clic-tools-main', 
        name: 'Clic-Tools (Sistema Principal)', 
        dbFile: 'clic_tools.db', 
    },
    { 
        id: 'purchase-requests', 
        name: 'Solicitud de Compra', 
        dbFile: 'clic_tools.db', 
    },
    { 
        id: 'production-planner', 
        name: 'Planificador de Producción', 
        dbFile: 'clic_tools.db', 
    },
    { 
        id: 'warehouse-management', 
        name: 'Gestión de Almacenes', 
        dbFile: 'clic_tools.db', 
    },
    { 
        id: 'cost-assistant', 
        name: 'Asistente de Costos', 
        dbFile: 'clic_tools.db', 
    },
    {
        id: 'operations',
        name: 'Centro de Operaciones',
        dbFile: 'clic_tools.db',
    },
    {
        id: 'it-tools',
        name: 'Herramientas de TI',
        dbFile: 'clic_tools.db',
    },
    {
        id: 'consignments',
        name: 'Gestión de Consignaciones',
        dbFile: 'clic_tools.db',
    },
    {
        id: 'erp-imports',
        name: 'Importaciones ERP (Facturas, Pedidos y Vendedores)',
        dbFile: 'clic_tools.db',
    }
];
