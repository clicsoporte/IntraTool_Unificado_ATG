/**
 * @fileoverview Server-side functions for the warehouse database.
 */
"use server";

import { getDb, getAllStock as getAllStockFromMain, getStockSettings as getStockSettingsFromMain } from '@/modules/core/lib/db';
import type { WarehouseLocation, WarehouseInventoryItem, MovementLog, WarehouseSettings, StockSettings, StockInfo, ItemLocation, InventoryUnit, DateRange, User, Product } from '@/modules/core/types';
import { logError, logInfo, logWarn } from '@/modules/core/lib/logger';
import path from 'path';
import { sendEmail } from '@/modules/core/lib/email-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { WAREHOUSE_TABLES } from './schema';
import { authorizeAction } from '@/modules/core/lib/auth-guard';

const WAREHOUSE_DB_FILE = 'warehouse.db';

const renderLocationPathAsString = (locationId: number, locations: any[]): string => {
    if (!locationId) return "N/A";
    const path: any[] = [];
    let current = locations.find(l => l.id === locationId);
    while (current) {
        path.unshift(current);
        current = current.parentId ? locations.find(l => l.id === current.parentId) : undefined;
    }
    return path.map(l => l.name).join(' > ');
};

const updateLocationMixedStatus = (db: import('better-sqlite3').Database, locationId: number) => {
    const assignedItemIds = db.prepare(`SELECT DISTINCT itemId FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId = ?`).all(locationId).map((row: any) => row.itemId);
    const physicalItemIds = db.prepare(`SELECT DISTINCT productId as itemId FROM ${WAREHOUSE_TABLES.inventory_units} WHERE locationId = ? AND status != 'voided'`).all(locationId).map((row: any) => row.itemId);
    const allUniqueItemIds = new Set([...assignedItemIds, ...physicalItemIds]);
    
    const newIsMixed = allUniqueItemIds.size > 1 ? 1 : 0;
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET is_mixed = ? WHERE id = ?`).run(newIsMixed, locationId);
};


export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const db = await getDb();
    const defaults: WarehouseSettings = {
        locationLevels: [
            { type: 'building', name: 'Edificio' },
            { type: 'zone', name: 'Zona' },
            { type: 'rack', name: 'Rack' },
            { type: 'shelf', name: 'Estante' },
            { type: 'bin', name: 'Casilla' }
        ],
        unitPrefix: 'U-',
        nextUnitNumber: 1,
        receptionPrefix: 'ING-',
        nextReceptionNumber: 1,
        correctionPrefix: 'COR-',
        nextCorrectionNumber: 1,
        dispatchNotificationEmails: '',
        populationSupervisorEmails: '',
        pdfTopLegend: 'Documento de Control Interno',
        lastLegacyMigration: null,
        lastPopulationInit: null,
        lastCleanup: null,
    };
    try {
        const row = db.prepare(`SELECT value FROM ${WAREHOUSE_TABLES.config} WHERE key = 'settings'`).get() as { value: string } | undefined;
        if (row) {
            const settings = JSON.parse(row.value);
            return { ...defaults, ...settings };
        }
    } catch (error) {
        console.error("Error fetching warehouse settings, returning default.", error);
    }
    return defaults;
}

export async function saveWarehouseSettings(settings: Partial<WarehouseSettings>): Promise<void> {
    await authorizeAction('admin:settings:warehouse');
    const db = await getDb();
    const currentSettings = await getWarehouseSettings();
    const newSettings = { ...currentSettings, ...settings };
    db.prepare(`
        INSERT OR REPLACE INTO ${WAREHOUSE_TABLES.config} (key, value) VALUES ('settings', ?)
    `).run(JSON.stringify(newSettings));
}

// This is a local helper function for transactions
const getChildLeafLocations_transactional = (db: import('better-sqlite3').Database, parentIds: number[]): WarehouseLocation[] => {
    if (parentIds.length === 0) return [];
    
    let allChildren: WarehouseLocation[] = [];
    const queue = [...parentIds];
    const visited = new Set<number>();
    const allLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations}`).all() as WarehouseLocation[];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const children = allLocations.filter(l => l.parentId === currentId);
        if (children.length === 0) {
            const self = allLocations.find(l => l.id === currentId);
            if(self) allChildren.push(self);
        } else {
            queue.push(...children.map(c => c.id));
        }
    }
    return Array.from(new Map(allChildren.map(item => [item.id, item])).values());
};

/**
 * Recursively builds the full path string for a location.
 * Uses a transactional approach to avoid multiple getDb calls.
 */
function buildLocationPathInternal(db: any, locationId: number): string {
    const path: string[] = [];
    let currentId: number | null = locationId;
    
    while (currentId) {
        const row = db.prepare(`SELECT name, parentId FROM wh_locations WHERE id = ?`).get(currentId) as { name: string, parentId: number | null } | undefined;
        if (!row) break;
        path.unshift(row.name);
        currentId = row.parentId;
    }
    return path.join(' > ');
}

/**
 * Synchronizes the cached_full_path for all locations.
 * This should be called after a migration or significant changes.
 */
export async function syncAllLocationPaths(): Promise<void> {
    const db = await getDb();
    const locations = db.prepare(`SELECT id FROM wh_locations`).all() as { id: number }[];
    
    db.transaction(() => {
        const updateStmt = db.prepare(`UPDATE wh_locations SET cached_full_path = ? WHERE id = ?`);
        for (const loc of locations) {
            const fullPath = buildLocationPathInternal(db, loc.id);
            updateStmt.run(fullPath, loc.id);
        }
    })();
}


const getChildLeafLocationsInMemory = (allLocations: WarehouseLocation[], parentIds: number[]): WarehouseLocation[] => {
    if (parentIds.length === 0) return [];
    
    let allChildren: WarehouseLocation[] = [];
    const queue = [...parentIds];
    const visited = new Set<number>();

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const children = allLocations.filter(l => l.parentId === currentId);
        if (children.length === 0) {
            const self = allLocations.find(l => l.id === currentId);
            if(self) allChildren.push(self);
        } else {
            queue.push(...children.map(c => c.id));
        }
    }
    return Array.from(new Map(allChildren.map(item => [item.id, item])).values());
};

/**
 * Gets all locations and enriches them with completion status for wizard.
 * @returns {Promise<WarehouseLocation[]>} A promise that resolves to an array of all locations.
 */
export async function getLocations(): Promise<(WarehouseLocation & { isCompleted?: boolean })[]> {
    const db = await getDb();
    const allLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} ORDER BY parentId, name`).all() as WarehouseLocation[];
    
    const allItemLocations = db.prepare(`SELECT DISTINCT locationId FROM ${WAREHOUSE_TABLES.item_locations}`).all() as { locationId: number }[];
    const populatedLocationIds = new Set(allItemLocations.map(il => il.locationId));

    const enrichedLocations = allLocations.map(loc => {
        // Check if a location is a 'level' (has children)
        const children = allLocations.filter(l => l.parentId === loc.id);
        if (children.length > 0) {
            const finalChildren = getChildLeafLocationsInMemory(allLocations, [loc.id]);
            const isCompleted = finalChildren.length > 0 && finalChildren.every(child => populatedLocationIds.has(child.id));
            return { ...loc, isCompleted };
        }
        return { ...loc, isCompleted: populatedLocationIds.has(loc.id) };
    });

    return JSON.parse(JSON.stringify(enrichedLocations));
}

export async function getSelectableLocations(): Promise<WarehouseLocation[]> {
    const db = await getDb();
    const allLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations}`).all() as WarehouseLocation[];
    const parentIds = new Set(allLocations.map(l => l.parentId).filter(Boolean));
    const selectable = allLocations.filter(l => !parentIds.has(l.id));
    return JSON.parse(JSON.stringify(selectable));
}

/**
 * Gets suggested locations for a product based on previous assignments.
 */
export async function getSuggestedLocations(productId: string): Promise<WarehouseLocation[]> {
    const db = await getDb();
    const productIdUpper = productId.toUpperCase();
    
    const results = db.prepare(`
        SELECT l.* 
        FROM ${WAREHOUSE_TABLES.locations} l
        JOIN ${WAREHOUSE_TABLES.item_locations} il ON l.id = il.locationId
        WHERE il.itemId = ?
    `).all(productIdUpper) as WarehouseLocation[];
    
    return JSON.parse(JSON.stringify(results));
}

/**
 * Gets item assignments for a specific location and its descendants.
 */
export async function getItemLocationsByLocation(locationId: number): Promise<ItemLocation[]> {
    const db = await getDb();
    const leafNodes = getChildLeafLocations_transactional(db, [locationId]);
    const leafIds = leafNodes.map(l => l.id);
    
    if (leafIds.length === 0) return [];
    
    const results = db.prepare(`
        SELECT * FROM ${WAREHOUSE_TABLES.item_locations} 
        WHERE locationId IN (${leafIds.map(() => '?').join(',')})
    `).all(...leafIds) as ItemLocation[];
    
    return JSON.parse(JSON.stringify(results));
}

/**
 * Gets child locations for a specific parent.
 */
export async function getLocationsByParent(parentId: number | null): Promise<WarehouseLocation[]> {
    const db = await getDb();
    const results = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE parentId IS ? ORDER BY name`).all(parentId) as WarehouseLocation[];
    return JSON.parse(JSON.stringify(results));
}

/**
 * Searches for locations using the cached_full_path for high performance.
 */
export async function searchLocations(query: string, limit: number = 50): Promise<WarehouseLocation[]> {
    const db = await getDb();
    const searchLower = `%${query.toLowerCase()}%`;
    
    const results = db.prepare(`
        SELECT * FROM ${WAREHOUSE_TABLES.locations} 
        WHERE LOWER(cached_full_path) LIKE ? OR LOWER(code) LIKE ?
        LIMIT ?
    `).all(searchLower, searchLower, limit) as WarehouseLocation[];
    
    return JSON.parse(JSON.stringify(results));
}

export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    await authorizeAction('warehouse:locations:create');
    const db = await getDb();
    const { name, code, type, parentId } = location;

    // Validate for duplicate code before attempting to insert.
    const existing = db.prepare(`SELECT id FROM ${WAREHOUSE_TABLES.locations} WHERE code = ?`).get(code);
    if (existing) {
        throw new Error(`El código de ubicación '${code}' ya está en uso. Por favor, elige otro.`);
    }

    const info = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run(name, code, type, parentId ?? null);
    const newId = info.lastInsertRowid as number;
    const fullPath = buildLocationPathInternal(db, newId);
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET cached_full_path = ? WHERE id = ?`).run(fullPath, newId);
    
    const newLocation = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?`).get(newId) as WarehouseLocation;
    return newLocation;
}

export async function addBulkLocations(payload: { type: 'rack' | 'clone'; params: any; }): Promise<void> {
    const db = await getDb();
    const { type, params } = payload;
    const settings = await getWarehouseSettings();

    const transaction = db.transaction(() => {
        if (type === 'rack') {
            const { name, prefix, levels, positions, depth, parentId } = params;

            // Check for existing code before trying to insert
            const existing = db.prepare(`SELECT id FROM ${WAREHOUSE_TABLES.locations} WHERE code = ?`).get(prefix);
            if (existing) {
                throw new Error(`El código de prefijo '${prefix}' ya está en uso. Por favor, elige otro.`);
            }

            const rackType = settings.locationLevels.find(l => l.name.toLowerCase().includes('rack'))?.type || 'rack';
            const info = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run(name, prefix, rackType, parentId || null);
            const rackId = info.lastInsertRowid as number;

            for (let i = 0; i < levels; i++) {
                const levelName = String.fromCharCode(65 + i);
                const levelType = settings.locationLevels[3]?.type || 'shelf';
                const levelInfo = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run(`Nivel ${levelName}`, `${prefix}-${levelName}`, levelType, rackId);
                const levelId = levelInfo.lastInsertRowid as number;

                for (let j = 1; j <= positions; j++) {
                    const posName = String(j).padStart(2, '0');
                    const posType = settings.locationLevels[4]?.type || 'bin';
                    const posCode = `${prefix}-${levelName}-${posName}`;
                    const posInfo = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run(`Posición ${posName}`, posCode, posType, levelId);
                    
                    if (depth > 0) {
                        const posId = posInfo.lastInsertRowid as number;
                        if (depth === 1) {
                            db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run('Frente', `${posCode}-F`, posType, posId);
                        } else if (depth >= 2) {
                            db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run('Frente', `${posCode}-F`, posType, posId);
                            db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run('Fondo', `${posCode}-T`, posType, posId);
                        }
                    }
                }
            }
        } else if (type === 'clone') {
            const { sourceRackId, newName, newPrefix } = params;

            const existing = db.prepare(`SELECT id FROM ${WAREHOUSE_TABLES.locations} WHERE code = ?`).get(newPrefix);
            if (existing) {
                throw new Error(`El nuevo código de prefijo '${newPrefix}' ya está en uso.`);
            }

            const allLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations}`).all() as WarehouseLocation[];
            const sourceRack = allLocations.find(l => l.id === Number(sourceRackId));
            if (!sourceRack) throw new Error('Rack de origen no encontrado.');

            const mapping = new Map<number, number>();
            
            const newRackInfo = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run(newName, newPrefix, sourceRack.type, sourceRack.parentId);
            const newRackId = newRackInfo.lastInsertRowid as number;
            mapping.set(sourceRack.id, newRackId);

            function cloneChildren(oldParentId: number, newParentId: number, originalRackCode: string) {
                const children = allLocations.filter(l => l.parentId === oldParentId);
                for (const child of children) {
                    const newCode = child.code.replace(originalRackCode, newPrefix);
                    const newChildInfo = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run(child.name, newCode, child.type, newParentId);
                    const newChildId = newChildInfo.lastInsertRowid as number;
                    mapping.set(child.id, newChildId);
                    cloneChildren(child.id, newChildId, originalRackCode);
                }
            }

            cloneChildren(sourceRack.id, newRackId, sourceRack.code);
        }
        
        // After bulk operations, sync all paths to ensure consistency
        const locations = db.prepare(`SELECT id FROM ${WAREHOUSE_TABLES.locations}`).all() as { id: number }[];
        const updateStmt = db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET cached_full_path = ? WHERE id = ?`);
        for (const loc of locations) {
            const fullPath = buildLocationPathInternal(db, loc.id);
            updateStmt.run(fullPath, loc.id);
        }
    });

    transaction();
}


export async function addLevelsToRack(rackId: number, numNewLevels: number): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('warehouse:locations:create');
    const db = await getDb();

    try {
        // Verify rack exists
        const rack = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?`).get(rackId) as WarehouseLocation | undefined;
        if (!rack) {
            return { success: false, error: "El rack especificado no existe." };
        }

        // Get all direct children of this rack (existing levels)
        const directChildren = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE parentId = ? ORDER BY code`).all(rackId) as WarehouseLocation[];
        if (directChildren.length === 0) {
            return { success: false, error: "Este rack no tiene niveles configurados para poder clonar su estructura. Por favor, use el asistente de creación." };
        }

        const firstLevel = directChildren[0];

        // Query positions under the first level to replicate their structure
        const originalPositions = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE parentId = ? ORDER BY code`).all(firstLevel.id) as WarehouseLocation[];
        
        // For each position, query its child locations (depth Frente/Fondo)
        const positionChildrenMap = new Map<number, WarehouseLocation[]>();
        for (const pos of originalPositions) {
            const children = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE parentId = ? ORDER BY code`).all(pos.id) as WarehouseLocation[];
            positionChildrenMap.set(pos.id, children);
        }

        // Determine the naming & coding pattern of existing levels: alphabetical or numerical
        let isNumericalSequence = true;
        let maxNumber = 0;
        let maxLetterCode = 64; // character code before 'A' (65)
        let numberPadding = 2;

        for (const child of directChildren) {
            const parts = child.code.split('-');
            const lastPart = parts[parts.length - 1];
            if (lastPart) {
                // Check if it is numeric
                if (/^\d+$/.test(lastPart)) {
                    const num = parseInt(lastPart, 10);
                    if (num > maxNumber) {
                        maxNumber = num;
                        numberPadding = lastPart.length;
                    }
                } else {
                    isNumericalSequence = false;
                    if (lastPart.length === 1) {
                        const charCode = lastPart.toUpperCase().charCodeAt(0);
                        if (charCode >= 65 && charCode <= 90) {
                            if (charCode > maxLetterCode) {
                                maxLetterCode = charCode;
                            }
                        }
                    }
                }
            } else {
                isNumericalSequence = false;
            }
        }

        // Helper for infinite alphabet (e.g. A..Z, AA..AZ)
        function getLevelLetter(index: number): string {
            let letter = "";
            let temp = index;
            while (temp >= 0) {
                letter = String.fromCharCode((temp % 26) + 65) + letter;
                temp = Math.floor(temp / 26) - 1;
            }
            return letter;
        }

        const newInsertedIds: number[] = [];

        const transaction = db.transaction(() => {
            for (let i = 0; i < numNewLevels; i++) {
                let levelName = "";
                let levelSuffix = "";

                if (isNumericalSequence) {
                    const nextNum = maxNumber + 1 + i;
                    levelSuffix = String(nextNum).padStart(numberPadding, '0');
                    levelName = `Nivel ${nextNum}`;
                } else {
                    const nextIdx = (maxLetterCode >= 65) ? (maxLetterCode - 65 + 1 + i) : (directChildren.length + i);
                    levelSuffix = getLevelLetter(nextIdx);
                    levelName = `Nivel ${levelSuffix}`;
                }

                const levelCode = `${rack.code}-${levelSuffix}`;

                // Check if the level code already exists to avoid collisions
                const existing = db.prepare(`SELECT id FROM ${WAREHOUSE_TABLES.locations} WHERE code = ?`).get(levelCode);
                if (existing) {
                    throw new Error(`El código de nivel '${levelCode}' ya existe en el sistema.`);
                }

                // Insert new level
                const levelInfo = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run(levelName, levelCode, firstLevel.type, rackId);
                const levelId = levelInfo.lastInsertRowid as number;
                newInsertedIds.push(levelId);

                // Replicate positions under this new level
                for (const pos of originalPositions) {
                    // Find relative suffix of position compared to firstLevel code
                    const posSuffix = pos.code.substring(firstLevel.code.length);
                    const newPosCode = `${levelCode}${posSuffix}`;
                    
                    // Insert position
                    const posInfo = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run(pos.name, newPosCode, pos.type, levelId);
                    const posId = posInfo.lastInsertRowid as number;
                    newInsertedIds.push(posId);

                    // Replicate depth sub-locations (Frente/Fondo)
                    const depthChildren = positionChildrenMap.get(pos.id) || [];
                    for (const child of depthChildren) {
                        const childSuffix = child.code.substring(pos.code.length);
                        const newChildCode = `${newPosCode}${childSuffix}`;

                        // Insert depth sub-location
                        const childInfo = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.locations} (name, code, type, parentId) VALUES (?, ?, ?, ?)`).run(child.name, newChildCode, child.type, posId);
                        newInsertedIds.push(childInfo.lastInsertRowid as number);
                    }
                }
            }

            // Calculate and cache full paths only for new locations to optimize performance
            const updateStmt = db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET cached_full_path = ? WHERE id = ?`);
            for (const newId of newInsertedIds) {
                const fullPath = buildLocationPathInternal(db, newId);
                updateStmt.run(fullPath, newId);
            }
        });

        transaction();
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "Fallo interno al agregar niveles adicionales." };
    }
}



export async function updateLocation(location: WarehouseLocation): Promise<WarehouseLocation> {
    await authorizeAction('warehouse:locations:update');
    const db = await getDb();
    const { id, name, code, type, parentId } = location;
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET name = ?, code = ?, type = ?, parentId = ? WHERE id = ?`).run(name, code, type, parentId ?? null, id);
    
    // Update path for itself and all descendants
    const fullPath = buildLocationPathInternal(db, id);
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET cached_full_path = ? WHERE id = ?`).run(fullPath, id);
    
    // Recalculate paths for all descendants (could be slow if many, but necessary for consistency)
    const descendants = db.prepare(`SELECT id FROM ${WAREHOUSE_TABLES.locations} WHERE parentId = ?`).all(id) as { id: number }[];
    for (const desc of descendants) {
        const descPath = buildLocationPathInternal(db, desc.id);
        db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET cached_full_path = ? WHERE id = ?`).run(descPath, desc.id);
    }

    const updatedLocation = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?`).get(id) as WarehouseLocation;
    return updatedLocation;
}

export async function deleteLocation(id: number, userName: string): Promise<{ success: boolean; error?: string }> {
    await authorizeAction('warehouse:locations:delete');
    const db = await getDb();
    
    // 1. Get location for audit logging
    const location = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?`).get(id) as WarehouseLocation | undefined;
    if (!location) {
        return { success: false, error: "La ubicación especificada no existe." };
    }

    // 2. Query all descendants IDs recursively
    const descendants = db.prepare(`
        WITH RECURSIVE descendants(id) AS (
            SELECT id FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?
            UNION ALL
            SELECT l.id FROM ${WAREHOUSE_TABLES.locations} l
            INNER JOIN descendants d ON l.parentId = d.id
        )
        SELECT id FROM descendants
    `).all(id) as { id: number }[];
    
    const descendantIds = descendants.map(d => d.id);

    if (descendantIds.length === 0) {
        return { success: false, error: "No se encontraron ubicaciones a eliminar." };
    }

    // 3. Prepare parameters for placeholders
    const placeholders = descendantIds.map(() => '?').join(',');

    // 4. Check for active inventory in any of the locations in the branch
    const inventoryCheck = db.prepare(`
        SELECT COUNT(*) as count 
        FROM ${WAREHOUSE_TABLES.inventory} 
        WHERE locationId IN (${placeholders}) AND quantity > 0
    `).get(...descendantIds) as { count: number };

    // 5. Check for active assignments in any of the locations in the branch
    const itemLocationsCheck = db.prepare(`
        SELECT COUNT(*) as count 
        FROM ${WAREHOUSE_TABLES.item_locations} 
        WHERE locationId IN (${placeholders})
    `).get(...descendantIds) as { count: number };

    // 6. Check for active LPN inventory units in any of the locations in the branch
    const inventoryUnitsCheck = db.prepare(`
        SELECT COUNT(*) as count 
        FROM ${WAREHOUSE_TABLES.inventory_units} 
        WHERE locationId IN (${placeholders}) AND status != 'voided'
    `).get(...descendantIds) as { count: number };

    if (inventoryCheck.count > 0 || itemLocationsCheck.count > 0 || inventoryUnitsCheck.count > 0) {
        return { 
            success: false, 
            error: `No se puede eliminar la ubicación "${location.name}" porque contiene inventario activo, unidades LPN o asignaciones de productos en sí misma o en sus sub-ubicaciones. Por favor, vacíe y desasigne el contenido primero.` 
        };
    }

    // 7. Safe to delete. ON DELETE CASCADE will automatically clean up all children in sqlite
    db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?`).run(id);
    await logWarn(`Ubicación de almacén "${location.name}" (ID ${id}) y sus sub-ubicaciones vacías fueron eliminadas por ${userName}.`);

    return { success: true };
}


export async function getInventoryForItem(itemId: string): Promise<WarehouseInventoryItem[]> {
    const db = await getDb();
    return db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.inventory} WHERE itemId = ?`).all(itemId) as WarehouseInventoryItem[];
}

export async function getInventory(dateRange?: DateRange): Promise<WarehouseInventoryItem[]> {
    const db = await getDb();
    if (dateRange?.from) {
        const toDate = dateRange.to || new Date();
        toDate.setHours(23, 59, 59, 999);
        const inventory = db.prepare(`
            SELECT * FROM ${WAREHOUSE_TABLES.inventory} 
            WHERE lastUpdated BETWEEN ? AND ?
            ORDER BY lastUpdated DESC
        `).all(dateRange.from.toISOString(), toDate.toISOString()) as WarehouseInventoryItem[];
        return JSON.parse(JSON.stringify(inventory));
    }
    const inventory = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.inventory} ORDER BY lastUpdated DESC`).all() as WarehouseInventoryItem[];
    return JSON.parse(JSON.stringify(inventory));
}

export async function updateInventory(itemIdRaw: string, locationId: number, newQuantity: number, userId: number): Promise<void> {
    await authorizeAction('warehouse:inventory-count:create');
    const itemId = itemIdRaw.toUpperCase();
    const db = await getDb();
    
    // Get user name from unified DB
    const user = db.prepare('SELECT name FROM core_users WHERE id = ?').get(userId) as User | undefined;
    const userName = user?.name || 'Sistema';

    try {
        const transaction = db.transaction(() => {
            const currentInventory = db.prepare(`SELECT quantity FROM ${WAREHOUSE_TABLES.inventory} WHERE itemId = ? AND locationId = ?`).get(itemId, locationId) as { quantity: number } | undefined;
            const oldQuantity = currentInventory?.quantity ?? 0;
            const difference = newQuantity - oldQuantity;

            if (difference !== 0) {
                db.prepare(
                    `INSERT INTO ${WAREHOUSE_TABLES.inventory} (itemId, locationId, quantity, lastUpdated, updatedBy) 
                     VALUES (?, ?, ?, datetime('now'), ?)
                     ON CONFLICT(itemId, locationId) 
                     DO UPDATE SET quantity = ?, updatedBy = ?, lastUpdated = datetime('now')`
                ).run(itemId, locationId, newQuantity, userName, newQuantity, userName);

                db.prepare(
                    `INSERT INTO ${WAREHOUSE_TABLES.movements} (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) VALUES (?, ?, ?, ?, datetime('now'), ?, ?)`
                ).run(itemId, difference, null, locationId, userId, `Ajuste de inventario físico. Conteo: ${newQuantity}`);
            }
        });

        transaction();
    } catch(error) {
        logError('Error in updateInventory transaction', { error: (error as Error).message, user: userName });
        throw error;
    }
}


export async function logMovement(movement: Omit<MovementLog, 'id' | 'timestamp'>): Promise<void> {
    const db = await getDb();
    const newMovement = { 
        ...movement, 
        itemId: movement.itemId.toUpperCase(),
        timestamp: new Date().toISOString() 
    };
    db.prepare(
        `INSERT INTO ${WAREHOUSE_TABLES.movements} (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) VALUES (@itemId, @quantity, @fromLocationId, @toLocationId, @timestamp, @userId, @notes)`
    ).run(newMovement);
}

export async function getWarehouseData(): Promise<{ locations: WarehouseLocation[], inventory: WarehouseInventoryItem[], stock: StockInfo[], itemLocations: ItemLocation[], warehouseSettings: WarehouseSettings, stockSettings: StockSettings }> {
    const db = await getDb();
    const locations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations}`).all() as WarehouseLocation[];
    const inventory = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.inventory}`).all() as WarehouseInventoryItem[];
    const itemLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.item_locations}`).all() as ItemLocation[];
    const stock = await getAllStockFromMain();
    const warehouseSettings = await getWarehouseSettings();
    const stockSettings = await getStockSettingsFromMain();

    return JSON.parse(JSON.stringify({
        locations: locations || [],
        inventory: inventory || [],
        stock: stock || [],
        itemLocations: itemLocations || [],
        warehouseSettings: warehouseSettings,
        stockSettings: stockSettings || { warehouses: [] },
    }));
}

export async function getRacks(): Promise<WarehouseLocation[]> {
    const db = await getDb();
    const settings = await getWarehouseSettings();
    const rackType = settings.locationLevels.find(l => l.name.toLowerCase().includes('rack'))?.type || 'rack';
    const racks = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE type = ? ORDER BY name`).all(rackType) as WarehouseLocation[];
    return JSON.parse(JSON.stringify(racks));
}

export async function getLevelsForRack(rackId: number): Promise<(WarehouseLocation & { isCompleted?: boolean })[]> {
    const db = await getDb();
    const levels = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE parentId = ? ORDER BY name`).all(rackId) as WarehouseLocation[];

    if (levels.length === 0) return [];

    const allItemLocations = db.prepare(`SELECT DISTINCT locationId FROM ${WAREHOUSE_TABLES.item_locations}`).all() as { locationId: number }[];
    const populatedLocationIds = new Set(allItemLocations.map(il => il.locationId));
    
    const enrichedLevels = levels.map(level => {
        const finalChildren = getChildLeafLocations_transactional(db, [level.id]);
        const isCompleted = finalChildren.length > 0 && finalChildren.every(child => populatedLocationIds.has(child.id));
        return { ...level, isCompleted };
    });

    return JSON.parse(JSON.stringify(enrichedLevels));
}

export async function getMovements(itemId?: string): Promise<MovementLog[]> {
    const db = await getDb();
    if (itemId) {
        const normalizedItemId = itemId.toUpperCase();
        return db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.movements} WHERE itemId = ? ORDER BY timestamp DESC`).all(normalizedItemId) as MovementLog[];
    }
    return db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.movements} ORDER BY timestamp DESC`).all() as MovementLog[];
}

export async function getItemLocations(itemId: string): Promise<ItemLocation[]> {
    const db = await getDb();
    const normalizedItemId = itemId.toUpperCase();
    const itemLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.item_locations} WHERE itemId = ?`).all(normalizedItemId) as ItemLocation[];
    return JSON.parse(JSON.stringify(itemLocations));
}

export async function getAllItemLocations(): Promise<ItemLocation[]> {
    const db = await getDb();
    const itemLocations = db.prepare(`
        SELECT il.*, l.cached_full_path 
        FROM ${WAREHOUSE_TABLES.item_locations} il
        LEFT JOIN ${WAREHOUSE_TABLES.locations} l ON il.locationId = l.id
    `).all() as ItemLocation[];
    return JSON.parse(JSON.stringify(itemLocations));
}

export async function getItemLocationsPaginated(params: {
    page: number;
    limit: number;
    search?: string;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
}): Promise<{ assignments: ItemLocation[]; totalCount: number }> {
    const db = await getDb();
    const { page, limit, search, sortKey, sortDirection } = params;
    
    let query = `
        SELECT il.*, l.cached_full_path, p.description AS productDescription, cust.name AS clientName
        FROM ${WAREHOUSE_TABLES.item_locations} il
        LEFT JOIN ${WAREHOUSE_TABLES.locations} l ON il.locationId = l.id
        LEFT JOIN core_products p ON il.itemId = p.id
        LEFT JOIN core_customers cust ON il.clientId = cust.id
    `;
    
    let countQuery = `
        SELECT COUNT(*) as count
        FROM ${WAREHOUSE_TABLES.item_locations} il
        LEFT JOIN ${WAREHOUSE_TABLES.locations} l ON il.locationId = l.id
        LEFT JOIN core_products p ON il.itemId = p.id
        LEFT JOIN core_customers cust ON il.clientId = cust.id
    `;
    
    const conditions: string[] = [];
    const binds: any[] = [];
    
    if (search && search.trim().length > 0) {
        const searchPattern = `%${search.trim()}%`;
        conditions.push(`(il.itemId LIKE ? OR p.description LIKE ? OR cust.name LIKE ? OR l.cached_full_path LIKE ?)`);
        binds.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    if (conditions.length > 0) {
        const whereClause = ` WHERE ${conditions.join(' AND ')}`;
        query += whereClause;
        countQuery += whereClause;
    }
    
    // Sorting
    const allowedSortKeys = ['product', 'description', 'client', 'location', 'type', 'updatedAt'];
    let orderClause = '';
    if (sortKey && allowedSortKeys.includes(sortKey)) {
        const direction = sortDirection === 'asc' ? 'ASC' : 'DESC';
        switch (sortKey) {
            case 'product':
                orderClause = ` ORDER BY il.itemId ${direction}`;
                break;
            case 'description':
                orderClause = ` ORDER BY p.description ${direction}`;
                break;
            case 'client':
                orderClause = ` ORDER BY CASE WHEN cust.name IS NULL THEN 1 ELSE 0 END, cust.name ${direction}`;
                break;
            case 'location':
                orderClause = ` ORDER BY l.cached_full_path ${direction}`;
                break;
            case 'type':
                orderClause = ` ORDER BY il.isExclusive ${direction}`;
                break;
            case 'updatedAt':
                orderClause = ` ORDER BY il.updatedAt ${direction}`;
                break;
        }
    } else {
        orderClause = ` ORDER BY il.updatedAt DESC`;
    }
    query += orderClause;
    
    // Pagination
    const offset = page * limit;
    query += ` LIMIT ? OFFSET ?`;
    const queryBinds = [...binds, limit, offset];
    
    const totalCountRow = db.prepare(countQuery).get(...binds) as { count: number } | undefined;
    const totalCount = totalCountRow?.count || 0;
    
    const assignments = db.prepare(query).all(...queryBinds) as any[];
    
    return {
        assignments: JSON.parse(JSON.stringify(assignments)),
        totalCount
    };
}

/**
 * Inserts or updates an item-location assignment.
 * If payload.id is provided, it updates. Otherwise, it inserts.
 */
export async function assignItemToLocation(payload: Partial<Omit<ItemLocation, 'updatedAt'>> & { updatedBy: string }, mode?: 'move' | 'add' | 'add_and_mix' | 'move_and_mix'): Promise<{ success: boolean; data?: ItemLocation; error?: string }> {
    try {
        await authorizeAction('warehouse:item-assignment:create');
        const db = await getDb();
        const { id, itemId: rawItemId, locationId, clientId, isExclusive, requiresCertificate, updatedBy } = payload;
        const itemId = rawItemId?.toUpperCase();
        
        let savedItem: ItemLocation;

        db.transaction(() => {
            if (mode === 'move' || mode === 'move_and_mix') {
                const existingAssignment = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.item_locations} WHERE itemId = ?`).get(itemId) as ItemLocation | undefined;
                if (existingAssignment) {
                    const oldLocationId = existingAssignment.locationId;
                    db.prepare(`UPDATE ${WAREHOUSE_TABLES.item_locations} SET locationId = ? WHERE id = ?`).run(locationId, existingAssignment.id);
                    updateLocationMixedStatus(db, oldLocationId);
                }
            }
            
            if (id) {
                db.prepare(`UPDATE ${WAREHOUSE_TABLES.item_locations} SET clientId = ?, isExclusive = ?, requiresCertificate = ?, updatedBy = ?, updatedAt = datetime('now') WHERE id = ?`)
                .run(clientId || null, isExclusive, requiresCertificate, updatedBy, id);
                savedItem = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.item_locations} WHERE id = ?`).get(id) as ItemLocation;
            } else {
                const info = db.prepare(`INSERT INTO ${WAREHOUSE_TABLES.item_locations} (itemId, locationId, clientId, isExclusive, requiresCertificate, updatedBy, updatedAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`)
                .run(itemId, locationId, clientId || null, isExclusive, requiresCertificate, updatedBy);
                savedItem = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.item_locations} WHERE id = ?`).get(info.lastInsertRowid) as ItemLocation;
            }
            db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = 'O' WHERE id = ?`).run(locationId);
            updateLocationMixedStatus(db, locationId!);
        })();
        
        return { success: true, data: JSON.parse(JSON.stringify(savedItem!)) };
    } catch (error: any) {
        logError('Error en assignItemToLocation', { error: error.message, payload });
        return { success: false, error: error.message };
    }
}

export async function unassignItemFromLocation(itemLocationId: number): Promise<void> {
    const db = await getDb();
    const location = db.prepare(`SELECT locationId FROM ${WAREHOUSE_TABLES.item_locations} WHERE id = ?`).get(itemLocationId) as { locationId: number };
    
    db.transaction(() => {
        db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.item_locations} WHERE id = ?`).run(itemLocationId);
        // If this was the last assignment for this location, mark it as pending again.
        const remaining = db.prepare(`SELECT COUNT(*) as count FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId = ?`).get(location.locationId) as { count: number };
        if (remaining.count === 0) {
            db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = 'P', is_mixed = 0 WHERE id = ?`).run(location.locationId);
        } else {
             updateLocationMixedStatus(db, location.locationId);
        }
    })();
}

export async function unassignMultipleItemsFromLocation(itemLocationIds: number[], userName: string): Promise<void> {
    const db = await getDb();
    
    if (itemLocationIds.length === 0) return;

    const transaction = db.transaction(() => {
        const placeholders = itemLocationIds.map(() => '?').join(',');

        // Find out which locations are affected before deleting
        const affectedLocations = db.prepare(`
            SELECT DISTINCT locationId FROM ${WAREHOUSE_TABLES.item_locations} WHERE id IN (${placeholders})
        `).all(...itemLocationIds) as { locationId: number }[];
        const affectedLocationIds = affectedLocations.map(l => l.locationId);
        
        // Delete the assignments
        const deleteResult = db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.item_locations} WHERE id IN (${placeholders})`).run(...itemLocationIds);
        
        // Recalculate status for each affected location
        for (const locationId of affectedLocationIds) {
            const remaining = db.prepare(`SELECT COUNT(*) as count FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId = ?`).get(locationId) as { count: number };
            if (remaining.count === 0) {
                db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = 'P', is_mixed = 0 WHERE id = ?`).run(locationId);
            } else {
                updateLocationMixedStatus(db, locationId); // Use existing helper
            }
        }
        logWarn(`${deleteResult.changes} item assignments were deleted in bulk by ${userName}.`);
    });

    try {
        transaction();
    } catch(error: any) {
        logError('Failed to unassign multiple items', { error: error.message, ids: itemLocationIds, user: userName });
        throw error;
    }
}

export async function unassignAllByProduct(itemId: string, userName: string): Promise<void> {
    const db = await getDb();
    const normalizedItemId = itemId.toUpperCase();
    const locationsToUpdate = db.prepare(`SELECT DISTINCT locationId FROM ${WAREHOUSE_TABLES.item_locations} WHERE itemId = ?`).all(normalizedItemId).map((row: any) => row.locationId);
    
    db.transaction(() => {
        db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.item_locations} WHERE itemId = ?`).run(normalizedItemId);
        // Check each affected location and reset if it's now empty.
        for (const locationId of locationsToUpdate) {
            const remaining = db.prepare(`SELECT COUNT(*) as count FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId = ?`).get(locationId) as { count: number };
            if (remaining.count === 0) {
                db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = 'P', is_mixed = 0 WHERE id = ?`).run(locationId);
            } else {
                updateLocationMixedStatus(db, locationId);
            }
        }
    })();
    logWarn(`All assignments for product ${normalizedItemId} were deleted by ${userName}.`);
}

export async function unassignAllByLocation(locationId: number, userName: string): Promise<void> {
    const db = await getDb();
    db.transaction(() => {
        db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId = ?`).run(locationId);
        db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = 'P', is_mixed = 0 WHERE id = ?`).run(locationId);
    })();
    logWarn(`All assignments for location ID ${locationId} were deleted by ${userName}.`);
}

export async function unassignAllByRack(rackId: number, userName: string): Promise<void> {
    const db = await getDb();

    const transaction = db.transaction(() => {
        const allLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations}`).all() as WarehouseLocation[];
        
        const locationsToClearIds = new Set<number>();
        const queue: number[] = [rackId];
        const visited = new Set<number>();

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            locationsToClearIds.add(currentId);
            
            const children = allLocations.filter(l => l.parentId === currentId);
            children.forEach(child => queue.push(child.id));
        }
        
        if (locationsToClearIds.size === 0) {
            logWarn(`unassignAllByRack called for non-existent or empty rack ID: ${rackId}.`, { user: userName });
            return;
        }
        
        const placeholders = Array.from(locationsToClearIds).map(() => '?').join(',');
        
        const deleteResult = db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId IN (${placeholders})`).run(...Array.from(locationsToClearIds));
        
        const updateResult = db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = 'P', is_mixed = 0 WHERE id IN (${placeholders})`).run(...Array.from(locationsToClearIds));

        logWarn(`All assignments under rack ID ${rackId} (${deleteResult.changes} deleted) were cleared by ${userName}. ${updateResult.changes} location statuses were reset.`);
    });
    
    transaction();
}

export async function unassignAllByLevel(levelId: number, userName: string): Promise<void> {
    const db = await getDb();

    const transaction = db.transaction(() => {
        const allLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations}`).all() as WarehouseLocation[];
        
        const locationsToClearIds = new Set<number>();
        const queue: number[] = [levelId];
        const visited = new Set<number>();

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            locationsToClearIds.add(currentId);
            
            const children = allLocations.filter(l => l.parentId === currentId);
            children.forEach(child => queue.push(child.id));
        }
        
        if (locationsToClearIds.size === 0) {
            logWarn(`unassignAllByLevel called for non-existent or empty level ID: ${levelId}.`, { user: userName });
            return;
        }
        
        const placeholders = Array.from(locationsToClearIds).map(() => '?').join(',');
        
        const deleteResult = db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId IN (${placeholders})`).run(...Array.from(locationsToClearIds));
        
        const updateResult = db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = 'P', is_mixed = 0 WHERE id IN (${placeholders})`).run(...Array.from(locationsToClearIds));

        logWarn(`All assignments under level ID ${levelId} (${deleteResult.changes} deleted) were cleared by ${userName}. ${updateResult.changes} location statuses were reset.`);
    });
    
    transaction();
}
//... rest of file
export async function addInventoryUnit(unit: Omit<InventoryUnit, 'id' | 'createdAt' | 'unitCode' | 'receptionConsecutive' | 'status'>): Promise<InventoryUnit> {
    const db = await getDb();
    
    const transaction = db.transaction(() => {
        const settings = getWarehouseSettingsTx(db);
        const unitPrefix = settings.unitPrefix || 'U-';
        const nextUnitNumber = settings.nextUnitNumber || 1;
        const receptionPrefix = settings.receptionPrefix || 'ING-';
        const nextReceptionNumber = settings.nextReceptionNumber || 1;

        const unitCode = `${unitPrefix}${String(nextUnitNumber).padStart(5, '0')}`;
        const receptionConsecutive = `${receptionPrefix}${String(nextReceptionNumber).padStart(5, '0')}`;
        
        const newUnitData: Omit<InventoryUnit, 'id'> = {
            ...unit,
            productId: unit.productId.toUpperCase(),
            createdAt: new Date().toISOString(),
            unitCode: unitCode,
            receptionConsecutive: receptionConsecutive,
            humanReadableId: unit.humanReadableId || undefined,
            documentId: unit.documentId || undefined,
            erpDocumentId: unit.erpDocumentId || undefined,
            quantity: unit.quantity ?? 1,
            notes: unit.notes || undefined,
            status: 'pending', // Always start as pending
        };

        const info = db.prepare(
            `INSERT INTO ${WAREHOUSE_TABLES.inventory_units} (unitCode, receptionConsecutive, productId, humanReadableId, documentId, erpDocumentId, locationId, quantity, notes, createdAt, createdBy, status) VALUES (@unitCode, @receptionConsecutive, @productId, @humanReadableId, @documentId, @erpDocumentId, @locationId, @quantity, @notes, @createdAt, @createdBy, @status)`
        ).run(newUnitData);
        
        const newId = info.lastInsertRowid as number;
        
        // Increment counters
        settings.nextUnitNumber = nextUnitNumber + 1;
        settings.nextReceptionNumber = nextReceptionNumber + 1;
        db.prepare(`UPDATE ${WAREHOUSE_TABLES.config} SET value = ? WHERE key = 'settings'`).run(JSON.stringify(settings));

        if (unit.locationId) {
            db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = 'O' WHERE id = ?`).run(unit.locationId);
            // After adding a unit, always recalculate the mixed status for that location
            updateLocationMixedStatus(db, unit.locationId);
        }

        return db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.inventory_units} WHERE id = ?`).get(newId) as InventoryUnit;
    });

    try {
        return transaction();
    } catch (error: any) {
        logError("Failed to create inventory unit transactionally", { error: error.message, details: unit });
        throw error;
    }
}

export async function getInventoryUnits(filters: { dateRange?: DateRange, includeVoided?: boolean, statuses?: string[] } = {}): Promise<InventoryUnit[]> {
    const db = await getDb();
    let query = `SELECT * FROM ${WAREHOUSE_TABLES.inventory_units}`;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (filters.dateRange?.from) {
        whereClauses.push("createdAt >= ?");
        params.push(filters.dateRange.from.toISOString());
    }
    if (filters.dateRange?.to) {
        const toDate = new Date(filters.dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        whereClauses.push("createdAt <= ?");
        params.push(toDate.toISOString());
    }
    if (!filters.includeVoided) {
        whereClauses.push("correctionConsecutive IS NULL");
    }
    if (filters.statuses && filters.statuses.length > 0) {
        const placeholders = filters.statuses.map(() => '?').join(',');
        whereClauses.push(`status IN (${placeholders})`);
        params.push(...filters.statuses);
    }

    if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ' ORDER BY createdAt DESC LIMIT 200';
    const units = db.prepare(query).all(...params) as InventoryUnit[];
    return JSON.parse(JSON.stringify(units));
}

export async function searchInventoryUnits(filters: {
    dateRange?: DateRange;
    productId?: string;
    humanReadableId?: string;
    unitCode?: string;
    documentId?: string;
    receptionConsecutive?: string;
    showVoided?: boolean;
    statusFilter?: string[];
}): Promise<InventoryUnit[]> {
    const db = await getDb();
    let query = `SELECT * FROM ${WAREHOUSE_TABLES.inventory_units}`;
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (filters.dateRange?.from) {
        whereClauses.push("createdAt >= ?");
        params.push(filters.dateRange.from.toISOString());
    }
    if (filters.dateRange?.to) {
        const toDate = new Date(filters.dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        whereClauses.push("createdAt <= ?");
        params.push(toDate.toISOString());
    }
    if (filters.productId) {
        whereClauses.push("productId LIKE ?");
        params.push(`%${filters.productId.toUpperCase()}%`);
    }
    if (filters.humanReadableId) {
        whereClauses.push("humanReadableId LIKE ?");
        params.push(`%${filters.humanReadableId}%`);
    }
    if (filters.unitCode) {
        whereClauses.push("unitCode LIKE ?");
        params.push(`%${filters.unitCode}%`);
    }
    if (filters.documentId) {
        whereClauses.push("documentId LIKE ?");
        params.push(`%${filters.documentId}%`);
    }
     if (filters.receptionConsecutive) {
        whereClauses.push("receptionConsecutive LIKE ?");
        params.push(`%${filters.receptionConsecutive}%`);
    }
    
    if (!filters.showVoided) {
        whereClauses.push("correctionConsecutive IS NULL");
    }
    
    if (filters.statusFilter && filters.statusFilter.length > 0) {
        const placeholders = filters.statusFilter.map(() => '?').join(',');
        whereClauses.push(`status IN (${placeholders})`);
        params.push(...filters.statusFilter);
    }
    
    if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    query += ' ORDER BY createdAt DESC LIMIT 200';
    
    const units = db.prepare(query).all(...params) as InventoryUnit[];
    return JSON.parse(JSON.stringify(units));
}


export async function getInventoryUnitById(id: string | number): Promise<InventoryUnit | null> {
    const db = await getDb();
    const searchTerm = String(id).toUpperCase();
    
    let unit: InventoryUnit | null | undefined;
    
    unit = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.inventory_units} WHERE id = ? OR UPPER(unitCode) = ? OR UPPER(humanReadableId) = ? OR UPPER(receptionConsecutive) = ?`).get(id, searchTerm, searchTerm, searchTerm) as InventoryUnit | undefined;

    return unit ? JSON.parse(JSON.stringify(unit)) : null;
}

export async function deleteInventoryUnit(id: number): Promise<void> {
    const db = await getDb();
    db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.inventory_units} WHERE id = ?`).run(id);
}

export async function updateInventoryUnitLocation(id: number, locationId: number): Promise<void> {
    const db = await getDb();
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.inventory_units} SET locationId = ? WHERE id = ?`).run(locationId, id);
}

// Helper to get settings within a transaction
const getWarehouseSettingsTx = (db: import('better-sqlite3').Database): WarehouseSettings => {
    const row = db.prepare(`SELECT value FROM ${WAREHOUSE_TABLES.config} WHERE key = 'settings'`).get() as { value: string };
    return JSON.parse(row.value);
};


export async function correctInventoryUnit(payload: {
    unitId: number;
    newProductId: string;
    newQuantity: number;
    newHumanReadableId: string;
    newDocumentId: string;
    newErpDocumentId: string;
    userId: number;
    userName: string;
}): Promise<void> {
    const { unitId, newProductId: rawProductId, newQuantity, newHumanReadableId, newDocumentId, newErpDocumentId, userId, userName } = payload;
    const newProductId = rawProductId.toUpperCase();
    const db = await getDb();

    const transaction = db.transaction(() => {
        const originalUnit = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.inventory_units} WHERE id = ?`).get(unitId) as InventoryUnit | undefined;
        if (!originalUnit) {
            throw new Error("La unidad de inventario a corregir no existe.");
        }
        if (originalUnit.correctionConsecutive) {
            throw new Error("Esta unidad ya ha sido anulada y no puede ser corregida de nuevo.");
        }

        const settings = getWarehouseSettingsTx(db);
        const nextCorrectionNumber = settings.nextCorrectionNumber || 1;
        const correctionConsecutive = `${settings.correctionPrefix || 'COR-'}${String(nextCorrectionNumber).padStart(5, '0')}`;
        const annulmentTimestamp = new Date().toISOString();
        
        let newUnitId: number | null = null;
        let newUnitReceptionConsecutive: string | null = null;
        
        const hasDataChanged = newProductId !== originalUnit.productId ||
                               newQuantity !== originalUnit.quantity ||
                               newHumanReadableId !== (originalUnit.humanReadableId || '') ||
                               newDocumentId !== (originalUnit.documentId || '') ||
                               newErpDocumentId !== (originalUnit.erpDocumentId || '');

        // Always void the original unit
        db.prepare(`UPDATE ${WAREHOUSE_TABLES.inventory_units} SET quantity = 0, notes = ?, correctionConsecutive = ?, annulledAt = ?, annulledBy = ?, status = ? WHERE id = ?`)
          .run(`ANULADO POR: ${correctionConsecutive}. Nota original: ${originalUnit.notes || ''}`, correctionConsecutive, annulmentTimestamp, userName, 'voided', unitId);

        // Always register OUT movement for the INCORRECT product/quantity
        db.prepare(
            `INSERT INTO ${WAREHOUSE_TABLES.movements} (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(originalUnit.productId, -originalUnit.quantity, originalUnit.locationId, null, annulmentTimestamp, userId, `Corrección de ingreso (Anulación). ID: ${correctionConsecutive}.`);
        
        // If data has changed, create a new unit.
        if (hasDataChanged) {
            const nextUnitNumber = settings.nextUnitNumber || 1;
            const unitCode = `${settings.unitPrefix || 'U-'}${String(nextUnitNumber).padStart(5, '0')}`;
            const nextReceptionNumber = settings.nextReceptionNumber || 1;
            newUnitReceptionConsecutive = `${settings.receptionPrefix || 'ING-'}${String(nextReceptionNumber).padStart(5, '0')}`;
            
            const newUnitData = {
                unitCode: unitCode,
                productId: newProductId,
                quantity: newQuantity,
                humanReadableId: newHumanReadableId || null,
                documentId: newDocumentId || null,
                erpDocumentId: newErpDocumentId || null,
                locationId: originalUnit.locationId,
                notes: `CORRECCIÓN desde ${originalUnit.receptionConsecutive}. Anulación: ${correctionConsecutive}.`,
                createdAt: originalUnit.createdAt,
                createdBy: userName, // The corrector is the creator of the new unit
                receptionConsecutive: newUnitReceptionConsecutive,
                correctedFromUnitId: originalUnit.id,
                status: 'applied', // Corrections are applied by default
                appliedAt: new Date().toISOString(),
                appliedBy: userName,
            };

            const info = db.prepare(
                `INSERT INTO ${WAREHOUSE_TABLES.inventory_units} (unitCode, productId, quantity, humanReadableId, documentId, erpDocumentId, locationId, notes, createdAt, createdBy, receptionConsecutive, correctedFromUnitId, status, appliedAt, appliedBy) VALUES (@unitCode, @productId, @quantity, @humanReadableId, @documentId, @erpDocumentId, @locationId, @notes, @createdAt, @createdBy, @receptionConsecutive, @correctedFromUnitId, @status, @appliedAt, @appliedBy)`
            ).run(newUnitData);
            newUnitId = info.lastInsertRowid as number;
            
            settings.nextUnitNumber = nextUnitNumber + 1;
            settings.nextReceptionNumber = nextReceptionNumber + 1;

            db.prepare(
                `INSERT INTO ${WAREHOUSE_TABLES.movements} (itemId, quantity, fromLocationId, toLocationId, timestamp, userId, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(newProductId, newQuantity, null, originalUnit.locationId, annulmentTimestamp, userId, `Corrección de ingreso. Nueva unidad ${newUnitReceptionConsecutive}.`);
        }
        
        // Increment correction counter
        settings.nextCorrectionNumber = nextCorrectionNumber + 1;
        
        db.prepare(`UPDATE ${WAREHOUSE_TABLES.config} SET value = ? WHERE key = 'settings'`).run(JSON.stringify(settings));

        logInfo('Inventory unit corrected successfully', {
            oldUnitId: unitId,
            correctionConsecutive,
            newUnitId: newUnitId,
            newUnitReceptionConsecutive: newUnitReceptionConsecutive,
            user: userName,
        });
    });

    try {
        transaction();
    } catch (error: any) {
        logError('Failed to correct inventory unit', { error: error.message, payload });
        throw error;
    }
}

export async function applyInventoryUnit(payload: {
    unitId: number;
    newProductId: string;
    newQuantity: number;
    newHumanReadableId: string;
    newDocumentId: string;
    newErpDocumentId: string;
    updatedBy: string;
}): Promise<void> {
    const db = await getDb();
    const { unitId, updatedBy, newProductId: rawProductId, ...dataToUpdate } = payload;
    const newProductId = rawProductId.toUpperCase();
    
    try {
        db.prepare(`
            UPDATE ${WAREHOUSE_TABLES.inventory_units} SET
                productId = @newProductId,
                quantity = @newQuantity,
                humanReadableId = @newHumanReadableId,
                documentId = @newDocumentId,
                erpDocumentId = @newErpDocumentId,
                status = 'applied',
                appliedAt = datetime('now'),
                appliedBy = @updatedBy
            WHERE id = @unitId AND status = 'pending'
        `).run({ unitId, updatedBy, ...dataToUpdate });

        logInfo('Pending inventory unit applied', { unitId, user: updatedBy, changes: dataToUpdate });

    } catch (error: any) {
        logError('Failed to apply inventory unit', { error: error.message, payload });
        throw error;
    }
}

// --- Wizard Lock Functions ---

export async function getActiveLocks(): Promise<WarehouseLocation[]> {
    const db = await getDb();
    const locks = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations} WHERE isLocked = 1`).all() as WarehouseLocation[];
    return JSON.parse(JSON.stringify(locks));
}

export async function lockEntity(payload: { entityIds: number[]; userName: string; userId: number; }): Promise<{ locked: boolean; message: string; }> {
    const db = await getDb();
    const { entityIds, userName, userId } = payload;
    const sessionId = String(userId); // Use user ID as the session ID

    const transaction = db.transaction(() => {
        const placeholders = entityIds.map(() => '?').join(',');
        const conflictingLocks = db.prepare(`SELECT id, lockedBy FROM ${WAREHOUSE_TABLES.locations} WHERE id IN (${placeholders}) AND isLocked = 1 AND (lockedBySessionId != ? OR lockedBySessionId IS NULL)`).all(...entityIds, sessionId) as { id: number; lockedBy: string }[];
        
        if (conflictingLocks.length > 0) {
            const locker = conflictingLocks[0].lockedBy || 'otro usuario';
            const message = `Uno o más niveles ya están en uso por ${locker}.`;
            logWarn('Lock attempt failed, entity already locked', { conflictingLocks, user: userName, message });
            return { locked: true, message };
        }

        const stmt = db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET isLocked = 1, lockedBy = ?, lockedBySessionId = ? WHERE id IN (${placeholders})`);
        stmt.run(userName, sessionId, ...entityIds);
        
        return { locked: false, message: 'Bloqueo exitoso.' };
    });

    return transaction();
}

export async function releaseLock(entityIds: number[], userId: number): Promise<void> {
    const db = await getDb();
    if (entityIds.length === 0) return;
    const placeholders = entityIds.map(() => '?').join(',');
    const sessionId = String(userId);
    // Only release locks that belong to the current user's session
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET isLocked = 0, lockedBy = NULL, lockedBySessionId = NULL WHERE id IN (${placeholders}) AND lockedBySessionId = ?`).run(...entityIds, sessionId);
}

export async function forceReleaseLock(locationId: number): Promise<void> {
    const db = await getDb();
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET isLocked = 0, lockedBy = NULL, lockedBySessionId = NULL WHERE id = ?`).run(locationId);
}

export async function getChildLocations(parentIds: number[]): Promise<WarehouseLocation[]> {
    const db = await getDb();
    if (parentIds.length === 0) return [];
    
    let allChildren: WarehouseLocation[] = [];
    const queue = [...parentIds];
    const visited = new Set<number>();
    const allLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations}`).all() as WarehouseLocation[];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const children = allLocations.filter(l => l.parentId === currentId);
        if (children.length === 0) {
            const self = allLocations.find(l => l.id === currentId);
            if(self) allChildren.push(self);
        } else {
            queue.push(...children.map(c => c.id));
        }
    }
    
    // De-duplicate in case of complex structures
    const uniqueChildren = Array.from(new Map(allChildren.map(item => [item.id, item])).values());
    return JSON.parse(JSON.stringify(uniqueChildren));
}

// --- Wizard Population Status Actions ---
export async function updateLocationPopulationStatus(locationId: number, status: 'S'): Promise<void> {
    const db = await getDb();
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = ? WHERE id = ?`).run(status, locationId);
}

export async function finalizePopulationSession(payload: { levelIds: number[]; userName: string; userId: number; assignments: { locationId: number, itemId: string }[] }): Promise<void> {
    const db = await getDb();
    const { levelIds, userName, userId, assignments } = payload;
    
    const transaction = db.transaction(() => {
        const placeholders = levelIds.map(() => '?').join(',');
        
        for (const levelId of levelIds) {
            const childLeafIds = getChildLeafLocations_transactional(db, [levelId]).map(l => l.id);
            if (childLeafIds.length === 0) {
                 db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = 'F' WHERE id = ?`).run(levelId);
                 continue;
            }

            const childPlaceholders = childLeafIds.map(() => '?').join(',');
            const statuses = db.prepare(`SELECT population_status FROM ${WAREHOUSE_TABLES.locations} WHERE id IN (${childPlaceholders})`).all(...childLeafIds) as { population_status: string }[];
            const hasOmittedOrPending = statuses.some(s => s.population_status === 'S' || s.population_status === 'P');
            const finalStatus = hasOmittedOrPending ? 'PC' : 'F';
            
            db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = ? WHERE id = ?`).run(finalStatus, levelId);
        }
        
        const sessionLocationIds = new Set(assignments.map(a => a.locationId));
        if (sessionLocationIds.size === 0) return;

        const newMixedLocationsQuery = db.prepare(`
            SELECT DISTINCT locationId
            FROM ${WAREHOUSE_TABLES.item_locations}
            WHERE locationId IN (${Array.from(sessionLocationIds).map(() => '?').join(',')})
            GROUP BY locationId
            HAVING COUNT(DISTINCT itemId) > 1
        `);
        
        const mixedLocationsResult = newMixedLocationsQuery.all(...Array.from(sessionLocationIds)) as { locationId: number }[];
        
        if (mixedLocationsResult.length > 0) {
            const settings = getWarehouseSettingsTx(db);
            const mainDb = db; // Using same db for consistency
            const productMap = new Map(mainDb.prepare('SELECT id, description FROM core_products').all().map((p: any) => [p.id, p.description]));
            const allLocations = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.locations}`).all() as WarehouseLocation[];

            let emailBody = `<p>El usuario <strong>${userName}</strong> ha finalizado una sesión de poblado y se detectaron las siguientes ubicaciones mixtas:</p>
                <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                    <thead><tr style="background-color: #f2f2f2;"><th>Ubicación</th><th>Artículos Asignados</th></tr></thead><tbody>`;

            for (const loc of mixedLocationsResult) {
                const itemsInLoc = db.prepare(`SELECT DISTINCT itemId FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId = ?`).all(loc.locationId) as { itemId: string }[];
                const locationPath = renderLocationPathAsString(loc.locationId, allLocations);
                const itemDescriptions = itemsInLoc.map(i => `<li>${productMap.get(i.itemId) || i.itemId}</li>`).join('');
                emailBody += `<tr><td>${locationPath}</td><td><ul>${itemDescriptions}</ul></td></tr>`;
            }
            emailBody += '</tbody></table>';

            const supervisorEmails = settings.populationSupervisorEmails;
            if (supervisorEmails) {
                sendEmail({
                    to: supervisorEmails.split(',').map(e => e.trim()),
                    subject: 'Alerta: Ubicaciones Mixtas Creadas en Poblado',
                    html: emailBody
                }).catch(err => logError('Failed to send population audit email', { error: err.message }));
            }
        }
    });

    try {
        transaction();
        await releaseLock(levelIds, userId);
        logInfo(`Population session finalized for levels: ${levelIds.join(', ')} by ${userName}`);
    } catch(err) {
        logError('Error finalizing population session', { error: (err as Error).message });
        throw err;
    }
}
export async function migrateLegacyInventoryUnits(): Promise<number> {
    const db = await getDb();
    let updatedCount = 0;

    const transaction = db.transaction(() => {
        const legacyUnits = db.prepare(`SELECT * FROM ${WAREHOUSE_TABLES.inventory_units} WHERE status IS NULL OR status = ''`).all() as InventoryUnit[];
        
        if (legacyUnits.length === 0) {
            return;
        }

        const settings = getWarehouseSettingsTx(db);
        let nextReceptionNumber = settings.nextReceptionNumber || 1;
        
        for (const unit of legacyUnits) {
            let receptionConsecutive = unit.receptionConsecutive;
            if (!receptionConsecutive) {
                receptionConsecutive = `${settings.receptionPrefix || 'ING-'}${String(nextReceptionNumber).padStart(5, '0')}`;
                nextReceptionNumber++;
            }
            db.prepare(`UPDATE ${WAREHOUSE_TABLES.inventory_units} SET status = 'applied', receptionConsecutive = ? WHERE id = ?`).run(receptionConsecutive, unit.id);
            updatedCount++;
        }
        
        settings.nextReceptionNumber = nextReceptionNumber;
        db.prepare(`UPDATE ${WAREHOUSE_TABLES.config} SET value = ? WHERE key = 'settings'`).run(JSON.stringify(settings));
    });

    transaction();
    
    const currentSettings = await getWarehouseSettings();
    await saveWarehouseSettings({ ...currentSettings, lastLegacyMigration: new Date().toISOString() });

    return updatedCount;
}

export async function initializePopulationStatus(): Promise<{ updated: number }> {
    const db = await getDb();
    let updatedCount = 0;

    const transaction = db.transaction(() => {
        // Ensure the column exists
        const tableInfo = db.prepare(`PRAGMA table_info(${WAREHOUSE_TABLES.locations})`).all() as { name: string }[];
        if (!tableInfo.some(c => c.name === 'population_status')) {
            db.exec(`ALTER TABLE ${WAREHOUSE_TABLES.locations} ADD COLUMN population_status TEXT DEFAULT 'P'`);
        }
        
        const allLocations = db.prepare(`SELECT id FROM ${WAREHOUSE_TABLES.locations}`).all() as { id: number }[];
        const occupiedLocationIds = new Set(
            db.prepare(`SELECT DISTINCT locationId FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId IS NOT NULL`).all().map((row: any) => row.locationId)
        );

        const updateStmt = db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET population_status = ? WHERE id = ?`);

        for (const location of allLocations) {
            const currentStatus = db.prepare(`SELECT population_status FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?`).get(location.id) as { population_status: string | null } | undefined;
            
            // Only update if the status is the default 'P' or NULL to avoid overwriting 'S' (Skipped)
            if (!currentStatus?.population_status || currentStatus.population_status === 'P') {
                const newStatus = occupiedLocationIds.has(location.id) ? 'O' : 'P';
                updateStmt.run(newStatus, location.id);
                updatedCount++;
            }
        }
    });

    transaction();

    const currentSettings = await getWarehouseSettings();
    await saveWarehouseSettings({ ...currentSettings, lastPopulationInit: new Date().toISOString() });

    return { updated: updatedCount };
}

export async function cleanupAndInitializeLocationFlags(): Promise<{ deletedCount: number; mixedCount: number; initializedCount: number; }> {
    const db = await getDb();
    const transaction = db.transaction(() => {
        // Step 1: Find and delete duplicate item_locations
        const duplicateGroups = db.prepare(`
            SELECT itemId, locationId
            FROM ${WAREHOUSE_TABLES.item_locations}
            GROUP BY itemId, locationId
            HAVING COUNT(id) > 1
        `).all() as { itemId: string; locationId: number }[];

        let deletedCount = 0;
        for (const group of duplicateGroups) {
            const idsToDelete = db.prepare(`
                SELECT id FROM ${WAREHOUSE_TABLES.item_locations} 
                WHERE itemId = ? AND locationId = ? 
                ORDER BY id DESC
            `).all(group.itemId, group.locationId).map((row: any) => row.id).slice(1);
            
            if (idsToDelete.length > 0) {
                const result = db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.item_locations} WHERE id IN (${idsToDelete.map(() => '?').join(',')})`).run(...idsToDelete);
                deletedCount += result.changes;
            }
        }

        // Step 2: Initialize/recalculate is_mixed flag for all locations
        const allLocations = db.prepare(`SELECT id FROM ${WAREHOUSE_TABLES.locations}`).all() as { id: number }[];
        const updateStmt = db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET is_mixed = ? WHERE id = ?`);
        let mixedCount = 0;

        for (const loc of allLocations) {
            const result = db.prepare(`SELECT COUNT(DISTINCT itemId) as count FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId = ?`).get(loc.id) as { count: number };
            const isMixed = result.count > 1 ? 1 : 0;
            if (isMixed === 1) {
                mixedCount++;
            }
            updateStmt.run(isMixed, loc.id);
        }

        return { deletedCount, mixedCount, initializedCount: allLocations.length };
    });

    const result = transaction();

    const currentSettings = await getWarehouseSettings();
    await saveWarehouseSettings({ ...currentSettings, lastCleanup: new Date().toISOString() });

    return result;
}

export async function checkAssignmentConflict(payload: { itemId: string, locationId: number; }): Promise<{
    productHasOtherLocations: boolean;
    locationHasOtherProducts: boolean;
    conflictingProduct?: Product;
    isLocked: boolean;
    lockedBy?: string | null;
}> {
    const db = await getDb();
    const { itemId, locationId } = payload;
    
    // Check lock status first
    const location = db.prepare(`SELECT isLocked, lockedBy FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?`).get(locationId) as { isLocked: 0 | 1, lockedBy: string | null } | undefined;
    if (location?.isLocked) {
        return {
            productHasOtherLocations: false,
            locationHasOtherProducts: false,
            isLocked: true,
            lockedBy: location.lockedBy,
            conflictingProduct: undefined,
        };
    }
    
    const otherAssignmentsForProduct = db.prepare(`SELECT COUNT(*) as count FROM ${WAREHOUSE_TABLES.item_locations} WHERE itemId = ?`).get(itemId) as { count: number };
    
    const assignmentsInLocation = db.prepare(`SELECT itemId FROM ${WAREHOUSE_TABLES.item_locations} WHERE locationId = ?`).all(locationId) as { itemId: string }[];
    const otherProductsInLocation = assignmentsInLocation.filter(a => a.itemId !== itemId);
    
    let conflictingProduct: Product | undefined = undefined;
    if (otherProductsInLocation.length > 0) {
        const mainDb = await getDb();
        const normalizedConflictingId = otherProductsInLocation[0].itemId.toUpperCase();
        conflictingProduct = mainDb.prepare('SELECT * FROM core_products WHERE id = ?').get(normalizedConflictingId) as Product;
    }
    
    return {
        productHasOtherLocations: otherAssignmentsForProduct.count > 0,
        locationHasOtherProducts: otherProductsInLocation.length > 0,
        conflictingProduct: conflictingProduct,
        isLocked: false,
        lockedBy: null
    };
}

export async function clearInventory(): Promise<void> {
    await authorizeAction('warehouse:inventory-count:delete');
    const db = await getDb();
    db.prepare(`DELETE FROM ${WAREHOUSE_TABLES.inventory}`).run();
    await logWarn("La tabla de inventario físico (conteo simplificado) ha sido vaciada.");
}
