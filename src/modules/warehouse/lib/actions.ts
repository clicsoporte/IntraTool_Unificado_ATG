/**
 * @fileoverview Client-side functions for interacting with the warehouse module's server-side DB functions.
 * This abstraction layer ensures components only call client-safe functions.
 */
'use client';

import {
    getLocations as getLocationsServer,
    addLocation as addLocationServer,
    updateLocation as updateLocationServer,
    deleteLocation as deleteLocationServer,
    getWarehouseSettings as getWarehouseSettingsServer,
    saveWarehouseSettings as saveWarehouseSettingsServer,
    getInventoryForItem as getInventoryForItemServer,
    logMovement as logMovementServer,
    updateInventory as updateInventoryServer,
    getItemLocations as getItemLocationsServer,
    getAllItemLocations as getAllItemLocationsServer,
    getItemLocationsPaginated as getItemLocationsPaginatedServer,
    assignItemToLocation as assignItemToLocationServer,
    unassignItemFromLocation as unassignItemFromLocationServer,
    getWarehouseData as getWarehouseDataServer,
    getMovements as getMovementsServer,
    addInventoryUnit as addInventoryUnitServer,
    getInventoryUnits as getInventoryUnitsServer,
    deleteInventoryUnit as deleteInventoryUnitServer,
    getInventoryUnitById as getInventoryUnitByIdServer,
    addBulkLocations as addBulkLocationsServer,
    addLevelsToRack as addLevelsToRackServer,
    getActiveLocks as getActiveLocksServer,
    lockEntity as lockEntityServer,
    releaseLock as releaseLockServer,
    forceReleaseLock as forceReleaseLockServer,
    getChildLocations as getChildLocationsServer,
    correctInventoryUnit as correctInventoryUnitServer,
    searchInventoryUnits as searchInventoryUnitsServer,
    migrateLegacyInventoryUnits as migrateLegacyInventoryUnitsServer,
    initializePopulationStatus as initializePopulationStatusServer,
    cleanupAndInitializeLocationFlags as cleanupAndInitializeLocationFlagsServer,
    applyInventoryUnit as applyInventoryUnitServer,
    checkAssignmentConflict as checkAssignmentConflictServer,
    unassignAllByProduct as unassignAllByProductServer,
    unassignAllByLocation as unassignAllByLocationServer,
    unassignAllByRack as unassignAllByRackServer,
    unassignAllByLevel as unassignAllByLevelServer,
    unassignMultipleItemsFromLocation as unassignMultipleItemsFromLocationServer,
    getRacks as getRacksServer,
    getLevelsForRack as getLevelsForRackServer,
    updateLocationPopulationStatus as updateLocationPopulationStatusServer,
    finalizePopulationSession as finalizePopulationSessionServer,
    clearInventory as clearInventoryServer,
    searchLocations as searchLocationsServer,
    getLocationsByParent as getLocationsByParentServer,
    getItemLocationsByLocation as getItemLocationsByLocationServer,
    getSuggestedLocations as getSuggestedLocationsServer,
} from './db';
import { getStockSettings as getStockSettingsDb, saveStockSettings as saveStockSettingsDb } from '@/modules/core/lib/db';
import type { WarehouseSettings, WarehouseLocation, WarehouseInventoryItem, MovementLog, ItemLocation, InventoryUnit, StockSettings, User, DateRange, Product } from '@/modules/core/types';
import { logInfo, logWarn } from '@/modules/core/lib/logger';

export const getWarehouseSettings = async (): Promise<WarehouseSettings> => getWarehouseSettingsServer();
export async function saveWarehouseSettings(settings: WarehouseSettings): Promise<void> {
    await logInfo("Warehouse settings updated.");
    return saveWarehouseSettingsServer(settings);
}
export const getStockSettings = async (): Promise<StockSettings> => getStockSettingsDb();
export async function saveStockSettings(settings: StockSettings): Promise<void> {
    await logInfo("Stock settings updated.");
    return saveStockSettingsDb(settings);
}
export const getLocations = async (): Promise<WarehouseLocation[]> => getLocationsServer();
export const searchLocations = async (query: string, limit?: number): Promise<WarehouseLocation[]> => searchLocationsServer(query, limit);
export const getLocationsByParent = async (parentId: number | null): Promise<WarehouseLocation[]> => getLocationsByParentServer(parentId);
export const getItemLocationsByLocation = async (locationId: number): Promise<ItemLocation[]> => getItemLocationsByLocationServer(locationId);
export const getSuggestedLocations = async (productId: string): Promise<WarehouseLocation[]> => getSuggestedLocationsServer(productId);

/**
 * Filters a list of all locations to return only those that can be selected as final destinations
 * (i.e., they are not parents of other locations).
 * @param allLocations - An array of all warehouse locations.
 * @returns An array of selectable, "leaf" warehouse locations.
 */
export function getSelectableLocations(allLocations: WarehouseLocation[]): WarehouseLocation[] {
    const parentIds = new Set(allLocations.map(l => l.parentId).filter(Boolean));
    return allLocations.filter(l => !parentIds.has(l.id));
}

export async function addLocation(location: Omit<WarehouseLocation, 'id'>): Promise<WarehouseLocation> {
    const newLocation = await addLocationServer(location);
    await logInfo(`New warehouse location created: ${newLocation.name} (${newLocation.code})`);
    return newLocation;
}

export async function addBulkLocations(payload: { type: 'rack' | 'clone'; params: any; }): Promise<void> {
    await addBulkLocationsServer(payload);
    await logInfo(`Bulk locations created via wizard`, { payload });
}

export async function addLevelsToRack(rackId: number, numNewLevels: number): Promise<void> {
    await logInfo(`Adding ${numNewLevels} levels to rack with ID ${rackId}`);
    const res = await addLevelsToRackServer(rackId, numNewLevels);
    if (!res.success) {
        throw new Error(res.error);
    }
}

export async function updateLocation(location: WarehouseLocation): Promise<WarehouseLocation> {
    const updatedLocation = await updateLocationServer(location);
    await logInfo(`Warehouse location updated: ${updatedLocation.name} (${updatedLocation.code})`);
    return updatedLocation;
}
export async function deleteLocation(id: number, userName: string): Promise<void> {
    const res = await deleteLocationServer(id, userName);
    if (!res.success) {
        throw new Error(res.error);
    }
}
export const getInventoryForItem = async (itemId: string): Promise<WarehouseInventoryItem[]> => getInventoryForItemServer(itemId);
export const logMovement = async (movement: Omit<MovementLog, 'id'|'timestamp'>): Promise<void> => logMovementServer(movement);

export const updateInventory = async(itemId: string, locationId: number, quantity: number, userId: number): Promise<void> => {
    return updateInventoryServer(itemId, locationId, quantity, userId);
};

// --- Simple Mode Actions ---
export const getItemLocations = async (itemId: string): Promise<ItemLocation[]> => getItemLocationsServer(itemId);
export const getAllItemLocations = async (): Promise<ItemLocation[]> => getAllItemLocationsServer();
export const getItemLocationsPaginated = async (params: {
    page: number;
    limit: number;
    search?: string;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
}): Promise<{ assignments: ItemLocation[]; totalCount: number }> => getItemLocationsPaginatedServer(params);

export async function assignItemToLocation(payload: Partial<Omit<ItemLocation, 'updatedAt'>> & { updatedBy: string }, mode?: 'move' | 'add' | 'add_and_mix' | 'move_and_mix'): Promise<{ success: boolean; data?: ItemLocation; error?: string }> {
    return assignItemToLocationServer(payload, mode);
}


export async function unassignItemFromLocation(itemLocationId: number): Promise<void> {
    await logInfo(`Item location mapping with ID ${itemLocationId} was removed.`);
    return unassignItemFromLocationServer(itemLocationId);
}

// --- Page-specific data loaders ---
export const getWarehouseData = async () => getWarehouseDataServer();
export const getMovements = async (itemId?: string): Promise<MovementLog[]> => getMovementsServer(itemId);

// --- Inventory Unit Actions ---
export const addInventoryUnit = async (unit: Omit<InventoryUnit, 'id' | 'createdAt' | 'unitCode' | 'receptionConsecutive' | 'status'>): Promise<InventoryUnit> => addInventoryUnitServer(unit);
export const getInventoryUnits = async (filters?: { dateRange?: DateRange; includeVoided?: boolean; statuses?: string[] }): Promise<InventoryUnit[]> => getInventoryUnitsServer(filters);
export const deleteInventoryUnit = async (id: number): Promise<void> => deleteInventoryUnitServer(id);
export const getInventoryUnitById = async (id: string | number): Promise<InventoryUnit | null> => getInventoryUnitByIdServer(id);

export const correctInventoryUnit = async (payload: {
    unitId: number;
    newProductId: string;
    newQuantity: number;
    newHumanReadableId: string;
    newDocumentId: string;
    newErpDocumentId: string;
    userId: number;
    userName: string;
}): Promise<void> => correctInventoryUnitServer(payload);

export const searchInventoryUnits = async (filters: {
    dateRange?: DateRange;
    productId?: string;
    humanReadableId?: string;
    unitCode?: string;
    documentId?: string;
    receptionConsecutive?: string;
    showVoided?: boolean;
    statusFilter?: string[];
}): Promise<InventoryUnit[]> => searchInventoryUnitsServer(filters);



// --- Wizard Lock Actions ---
export const getActiveLocks = async (): Promise<WarehouseLocation[]> => getActiveLocksServer();
export const lockEntity = async (payload: { entityIds: number[]; userName: string; userId: number; }): Promise<{ locked: boolean; message: string }> => lockEntityServer(payload);
export const releaseLock = async (entityIds: number[], userId: number): Promise<void> => releaseLockServer(entityIds, userId);
export const forceReleaseLock = async (locationId: number): Promise<void> => forceReleaseLockServer(locationId);
export const getChildLocations = async (parentIds: number[]): Promise<WarehouseLocation[]> => getChildLocationsServer(parentIds);

// Maintenance actions
export const migrateLegacyInventoryUnits = async (): Promise<number> => migrateLegacyInventoryUnitsServer();
export const initializePopulationStatus = async (): Promise<{ updated: number }> => initializePopulationStatusServer();
export const cleanupAndInitializeLocationFlags = async (): Promise<{ deletedCount: number; mixedCount: number; initializedCount: number; }> => cleanupAndInitializeLocationFlagsServer();

// Correction tool actions
export const applyInventoryUnit = async (payload: { unitId: number; newProductId: string; newQuantity: number; newHumanReadableId: string; newDocumentId: string; newErpDocumentId: string; updatedBy: string; }): Promise<void> => applyInventoryUnitServer(payload);

// Item Location (Catalog) actions
export const checkAssignmentConflict = async (payload: { itemId: string, locationId: number }): Promise<{ productHasOtherLocations: boolean; locationHasOtherProducts: boolean; conflictingProduct?: Product; isLocked: boolean; lockedBy?: string | null; }> => checkAssignmentConflictServer(payload);
export const unassignAllByProduct = async (itemId: string, userName: string): Promise<void> => unassignAllByProductServer(itemId, userName);
export const unassignAllByLocation = async (locationId: number, userName: string): Promise<void> => unassignAllByLocationServer(locationId, userName);
export const unassignAllByRack = async (rackId: number, userName: string): Promise<void> => unassignAllByRackServer(rackId, userName);
export const unassignAllByLevel = async (levelId: number, userName: string): Promise<void> => unassignAllByLevelServer(levelId, userName);
export const unassignMultipleItemsFromLocation = async (itemLocationIds: number[], userName: string): Promise<void> => unassignMultipleItemsFromLocationServer(itemLocationIds, userName);

// Population Wizard actions
export const getRacks = async (): Promise<WarehouseLocation[]> => getRacksServer();
export const getLevelsForRack = async (rackId: number): Promise<(WarehouseLocation & { isCompleted?: boolean })[]> => getLevelsForRackServer(rackId);
export const updateLocationPopulationStatus = async (locationId: number, status: 'S'): Promise<void> => updateLocationPopulationStatusServer(locationId, status);
export const finalizePopulationSession = async (payload: { levelIds: number[]; userName: string; userId: number; assignments: { locationId: number, itemId: string }[] }): Promise<void> => finalizePopulationSessionServer(payload);

export const clearInventory = async (): Promise<void> => {
    return clearInventoryServer();
};
