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
    toggleItBranchStatus as toggleItBranchStatusServer,
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
    getItPlanExpirationAlerts as getItPlanExpirationAlertsServer,
    getSystemUsersList as getSystemUsersListServer,
    getPayrollEmployeesList as getPayrollEmployeesListServer,
    getItAssetCategories as getItAssetCategoriesServer,
    saveItAssetCategories as saveItAssetCategoriesServer,
    getItStandardAccessories as getItStandardAccessoriesServer,
    saveItStandardAccessories as saveItStandardAccessoriesServer,
    sendAssetAssignmentEmail as sendAssetAssignmentEmailServer,
    getMyAssignedAssets as getMyAssignedAssetsServer,
    getMobileFleetData as getMobileFleetDataServer,
    saveMobileDeviceAssignment as saveMobileDeviceAssignmentServer,
    deleteMobileDevice as deleteMobileDeviceServer,
    publishAppVersion as publishAppVersionServer,
    toggleOtaPause as toggleOtaPauseServer,
    resetDeviceOtaFailures as resetDeviceOtaFailuresServer,
    saveDeviceMdmPolicy as saveDeviceMdmPolicyServer,
    requestAppUninstall as requestAppUninstallServer,
    requestDeviceReboot as requestDeviceRebootServer,
    saveFleetServerUrls as saveFleetServerUrlsServer,
    uploadAssetDocumentAction as uploadAssetDocumentActionServer,
    deleteAssetDocumentAction as deleteAssetDocumentActionServer
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

export async function toggleItBranchStatus(id: number, isActive: boolean | number): Promise<any> {
    return toggleItBranchStatusServer(id, isActive);
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
export async function assignItAsset(assetId: number, assigneeType: 'system_user' | 'payroll_employee', userOrEmployeeId: string | number): Promise<{ success: boolean; assignmentId: number }> {
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

// Plan Expiration alert wrappers
export async function getItPlanExpirationAlerts(): Promise<any[]> {
    return getItPlanExpirationAlertsServer();
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

export async function getItStandardAccessories(): Promise<string[]> {
    return getItStandardAccessoriesServer();
}

export async function saveItStandardAccessories(accessories: string[]): Promise<void> {
    return saveItStandardAccessoriesServer(accessories);
}

export async function sendAssetAssignmentEmail(assignmentId: number): Promise<{ success: boolean; error?: string }> {
    return sendAssetAssignmentEmailServer(assignmentId);
}

export async function getMyAssignedAssets(): Promise<any[]> {
    return getMyAssignedAssetsServer();
}

export async function getMobileFleetData(): Promise<{ 
    versionSettings: any; 
    devices: any[]; 
    backgroundSyncMinutes?: string; 
    adminPin?: string; 
    telegramAlertsChatId?: string;
    smsGatewayItPhones?: string;
    publicIpApiPrimary?: string;
    publicIpApiFallback?: string;
}> {
    return getMobileFleetDataServer();
}

export async function saveMobileDeviceAssignment(
    hardwareIdOrData: string | { hardwareId: string; deviceName?: string; phoneNumber?: string; driverUserId?: number },
    dataParam?: { deviceName?: string; phone_number?: string; last_user_id?: number | null; last_driver_name?: string; ota_paused?: number }
): Promise<{ success: boolean }> {
    if (typeof hardwareIdOrData === 'string') {
        return saveMobileDeviceAssignmentServer(hardwareIdOrData, dataParam || {});
    } else {
        return saveMobileDeviceAssignmentServer(hardwareIdOrData.hardwareId, {
            deviceName: hardwareIdOrData.deviceName,
            phone_number: hardwareIdOrData.phoneNumber,
            last_user_id: hardwareIdOrData.driverUserId
        });
    }
}

export async function publishAppVersion(data: {
    version_name?: string;
    versionName?: string;
    version_code?: number;
    versionCode?: number;
    apk_url?: string;
    apkUrl?: string;
    release_notes?: string;
    releaseNotes?: string;
    force_update?: boolean;
    forceUpdate?: boolean;
    server_url_primary?: string;
    serverUrlPrimary?: string;
    server_url_fallback?: string;
    serverUrlFallback?: string;
    background_sync_minutes?: string;
    backgroundSyncMinutes?: string;
    admin_pin?: string;
    adminPin?: string;
    telegram_alerts_chat_id?: string;
    telegramAlertsChatId?: string;
    sms_gateway_it_phones?: string;
    smsGatewayItPhones?: string;
    public_ip_api_primary?: string;
    publicIpApiPrimary?: string;
    public_ip_api_fallback?: string;
    publicIpApiFallback?: string;
}): Promise<{ success: boolean; error?: string }> {
    const versionName = data.version_name || data.versionName || '1.0.0';
    const versionCode = data.version_code || data.versionCode || 1;
    const apkUrl = data.apk_url || data.apkUrl || '';
    const releaseNotes = data.release_notes || data.releaseNotes;
    const forceUpdate = data.force_update !== undefined ? data.force_update : data.forceUpdate;
    const server_url_primary = data.server_url_primary || data.serverUrlPrimary;
    const server_url_fallback = data.server_url_fallback || data.serverUrlFallback;
    const background_sync_minutes = data.background_sync_minutes || data.backgroundSyncMinutes;
    const admin_pin = data.admin_pin || data.adminPin;
    const telegram_alerts_chat_id = data.telegram_alerts_chat_id || data.telegramAlertsChatId;
    const sms_gateway_it_phones = data.sms_gateway_it_phones || data.smsGatewayItPhones;
    const public_ip_api_primary = data.public_ip_api_primary || data.publicIpApiPrimary;
    const public_ip_api_fallback = data.public_ip_api_fallback || data.publicIpApiFallback;

    return publishAppVersionServer({
        version_name: versionName,
        version_code: versionCode,
        apk_url: apkUrl,
        release_notes: releaseNotes,
        force_update: forceUpdate,
        server_url_primary: server_url_primary,
        server_url_fallback: server_url_fallback,
        background_sync_minutes: background_sync_minutes,
        admin_pin: admin_pin,
        telegram_alerts_chat_id: telegram_alerts_chat_id,
        sms_gateway_it_phones: sms_gateway_it_phones,
        public_ip_api_primary: public_ip_api_primary,
        public_ip_api_fallback: public_ip_api_fallback
    });
}

export async function toggleOtaPause(
    scopeOrOptions: 'global' | 'device' | { target: 'global' | 'device'; hwid?: string },
    hardwareId?: string
): Promise<{ success: boolean; isPaused: boolean }> {
    if (typeof scopeOrOptions === 'string') {
        return toggleOtaPauseServer(scopeOrOptions, hardwareId);
    } else {
        return toggleOtaPauseServer(scopeOrOptions.target, scopeOrOptions.hwid);
    }
}

export async function resetDeviceOtaFailures(hardwareId: string): Promise<{ success: boolean }> {
    return resetDeviceOtaFailuresServer(hardwareId);
}

export async function deleteMobileDeviceAction(hardwareId: string): Promise<{ success: boolean }> {
    return deleteMobileDeviceServer(hardwareId);
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
    return saveDeviceMdmPolicyServer(hardwareId, policy);
}

export async function requestAppUninstallAction(hardwareId: string, packageName: string): Promise<{ success: boolean; error?: string }> {
    return requestAppUninstallServer(hardwareId, packageName);
}

export async function requestDeviceRebootAction(hardwareId: string): Promise<{ success: boolean }> {
    return requestDeviceRebootServer(hardwareId);
}

export async function saveFleetServerUrlsAction(primaryUrl: string, fallbackUrl?: string): Promise<{ success: boolean }> {
    return saveFleetServerUrlsServer(primaryUrl, fallbackUrl);
}

export async function uploadAssetDocument(formData: FormData): Promise<{ success: boolean; document?: any; error?: string }> {
    return uploadAssetDocumentActionServer(formData);
}

export async function deleteAssetDocument(documentId: number): Promise<{ success: boolean; error?: string }> {
    return deleteAssetDocumentActionServer(documentId);
}

export async function sendAgentCommandAction(
    assetId: number,
    commandType: string,
    payload: any = {}
): Promise<{ success: boolean; commandId?: number; error?: string }> {
    try {
        const { getDb } = await import('@/modules/core/lib/db');
        const { IT_TOOLS_TABLES } = await import('./schema');
        const { authorizeAction } = await import('@/modules/core/lib/auth-guard');
        await authorizeAction('it-tools:assets:write');

        const db = await getDb();
        const now = new Date().toISOString();

        db.exec(`
            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.agentCommands} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id INTEGER NOT NULL,
                command_type TEXT NOT NULL,
                payload_json TEXT,
                status TEXT DEFAULT 'pending',
                result_json TEXT,
                priority INTEGER DEFAULT 5,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        `);

        const result = db.prepare(`
            INSERT INTO ${IT_TOOLS_TABLES.agentCommands} (asset_id, command_type, payload_json, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
        `).run(assetId, commandType, JSON.stringify(payload), now);

        return { success: true, commandId: Number(result.lastInsertRowid) };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

