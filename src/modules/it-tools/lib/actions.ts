/**
 * @fileoverview Client-side functions for interacting with the IT Tools module's server-side DB functions.
 */
'use client';

import type { ITNote } from '@/modules/core/types';
import { 
    getNotes as getNotesServer, 
    saveNote as saveNoteServer, 
    deleteNote as deleteNoteServer,
    getItBranches as getItBranchesServer,
    saveItBranch as saveItBranchServer,
    deleteItBranch as deleteItBranchServer,
    getItLicensesCatalog as getItLicensesCatalogServer,
    saveItLicenseCatalog as saveItLicenseCatalogServer,
    deleteItLicenseCatalog as deleteItLicenseCatalogServer,
    getItAssets as getItAssetsServer,
    getItAssetById as getItAssetByIdServer,
    saveItAsset as saveItAssetServer,
    deleteItAsset as deleteItAssetServer,
    assignItAsset as assignItAssetServer,
    returnItAsset as returnItAssetServer,
    addItAssetComponent as addItAssetComponentServer,
    removeItAssetComponent as removeItAssetComponentServer,
    addItAssetLicense as addItAssetLicenseServer,
    removeItAssetLicense as removeItAssetLicenseServer,
    getItHrAlerts as getItHrAlertsServer,
    getSystemUsersList as getSystemUsersListServer,
    getPayrollEmployeesList as getPayrollEmployeesListServer,
    getItAssetCategories as getItAssetCategoriesServer,
    saveItAssetCategories as saveItAssetCategoriesServer,
    sendAssetAssignmentEmail as sendAssetAssignmentEmailServer,
    getMyAssignedAssets as getMyAssignedAssetsServer
} from './db';
import { adminTools, analyticsTools, mainTools, warehouseTools, consignmentsTools, itTools, invoicesTools, purchasingReportTools, productionReportTools, inventoryReportTools, consignmentsReportTools } from '@/modules/core/lib/data';

// Note wrappers
export async function getNotes(): Promise<ITNote[]> {
    return getNotesServer();
}

export async function saveNote(note: Omit<ITNote, 'id' | 'createdAt' | 'updatedAt'> & { id?: number }): Promise<ITNote> {
    return saveNoteServer(note);
}

export async function deleteNote(id: number): Promise<void> {
    return deleteNoteServer(id);
}

// Branch wrappers
export async function getItBranches(): Promise<any[]> {
    return getItBranchesServer();
}

export async function saveItBranch(branch: { id?: number; name: string; code: string; is_active: number }): Promise<any> {
    return saveItBranchServer(branch);
}

export async function deleteItBranch(id: number): Promise<void> {
    return deleteItBranchServer(id);
}

// License catalog wrappers
export async function getItLicensesCatalog(): Promise<any[]> {
    return getItLicensesCatalogServer();
}

export async function saveItLicenseCatalog(license: { id?: number; name: string; description: string }): Promise<any> {
    return saveItLicenseCatalogServer(license);
}

export async function deleteItLicenseCatalog(id: number): Promise<void> {
    return deleteItLicenseCatalogServer(id);
}

// Asset wrappers
export async function getItAssets(): Promise<any[]> {
    return getItAssetsServer();
}

export async function getItAssetById(id: number): Promise<any> {
    return getItAssetByIdServer(id);
}

export async function saveItAsset(asset: any): Promise<any> {
    return saveItAssetServer(asset);
}

export async function deleteItAsset(id: number): Promise<void> {
    return deleteItAssetServer(id);
}

// Assignment wrappers
export async function assignItAsset(assetId: number, assigneeType: 'system_user' | 'payroll_employee', userOrEmployeeId: string | number): Promise<void> {
    return assignItAssetServer(assetId, assigneeType, userOrEmployeeId);
}

export async function returnItAsset(assetId: number): Promise<void> {
    return returnItAssetServer(assetId);
}

// Component wrappers
export async function addItAssetComponent(component: { parent_asset_id: number; component_name: string; brand?: string; model?: string; serial_number?: string }): Promise<any> {
    return addItAssetComponentServer(component);
}

export async function removeItAssetComponent(id: number): Promise<void> {
    return removeItAssetComponentServer(id);
}

// Asset License wrappers
export async function addItAssetLicense(assetLicense: { asset_id: number; license_catalog_id: number; license_key?: string; expiration_date?: string }): Promise<any> {
    return addItAssetLicenseServer(assetLicense);
}

export async function removeItAssetLicense(id: number): Promise<void> {
    return removeItAssetLicenseServer(id);
}

// HR alert wrappers
export async function getItHrAlerts(): Promise<any[]> {
    return getItHrAlertsServer();
}

// Lookup wrappers
export async function getSystemUsersList(): Promise<any[]> {
    return getSystemUsersListServer();
}

export async function getPayrollEmployeesList(): Promise<any[]> {
    return getPayrollEmployeesListServer();
}

export async function getAvailableModules(): Promise<{ id: string, name: string }[]> {
    const allTools = [
        ...mainTools,
        ...invoicesTools,
        ...adminTools,
        ...analyticsTools, 
        ...warehouseTools, 
        ...consignmentsTools, 
        ...itTools,
        ...purchasingReportTools,
        ...productionReportTools,
        ...inventoryReportTools,
        ...consignmentsReportTools,
    ];

    const excludedIds = new Set([
        'help', 
        'it-tools',
        'operations',
        'warehouse',
        'consignments',
        'invoices',
        'analytics'
    ]);
    
    const modulesMap = new Map<string, { id: string; name: string }>();

    allTools.forEach(tool => {
        if (!excludedIds.has(tool.id) && !modulesMap.has(tool.id)) {
            modulesMap.set(tool.id, { id: tool.id, name: tool.name });
        }
    });
    
    const moduleList = Array.from(modulesMap.values());
    moduleList.sort((a, b) => a.name.localeCompare(b.name));
    
    return moduleList;
}

export async function getItAssetCategories(): Promise<string[]> {
    return getItAssetCategoriesServer();
}

export async function saveItAssetCategories(categories: string[]): Promise<void> {
    return saveItAssetCategoriesServer(categories);
}

export async function sendAssetAssignmentEmail(assignmentId: number): Promise<{ success: boolean; error?: string }> {
    return sendAssetAssignmentEmailServer(assignmentId);
}

export async function getMyAssignedAssets(): Promise<any[]> {
    return getMyAssignedAssetsServer();
}
