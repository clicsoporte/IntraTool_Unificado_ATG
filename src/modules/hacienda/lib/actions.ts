
/**
 * @fileoverview Server Actions for the Hacienda module.
 * These server-only functions are responsible for securely interacting
 * with external Hacienda APIs to fetch contributor and exemption information.
 */
'use server';

import { logError } from '@/modules/core/lib/logger';
import { getApiSettings, getCabysCatalog, getAllExemptions } from '@/modules/core/lib/db';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import type { HaciendaContributorInfo, HaciendaExemptionApiResponse, EnrichedExemptionInfo, EnrichedCabysItem } from '@/modules/core/types';

// In-memory cache for CABYS data to avoid repeated DB queries.
let cabysCache: Map<string, { description: string, taxRate: number }> | null = null;

/**
 * Loads the CABYS data from the database into an in-memory cache.
 * @returns {Promise<Map<string, { description: string, taxRate: number }>>} A Map where keys are CABYS codes.
 */
async function loadCabysData(): Promise<Map<string, { description: string, taxRate: number }>> {
    if (cabysCache) {
        return cabysCache;
    }

    console.log('Loading CABYS catalog from database into memory...');
    try {
        const cabysItems = await getCabysCatalog();
        const newCache = new Map<string, { description: string, taxRate: number }>();
        for (const item of cabysItems) {
            newCache.set(item.code, { description: item.description, taxRate: item.taxRate });
        }
        cabysCache = newCache;
        console.log(`CABYS catalog loaded with ${cabysCache.size} entries.`);
    } catch (error) {
        console.error('Failed to load CABYS data from DB:', error);
        cabysCache = new Map(); // Initialize empty cache on error to prevent repeated failed attempts.
    }
    return cabysCache;
}

// Pre-load data on server start to make subsequent lookups faster.
loadCabysData().catch(console.error);


/**
 * Fetches contributor (taxpayer) information from the Hacienda API.
 * @param {string} taxpayerId - The taxpayer's identification number.
 * @returns {Promise<HaciendaContributorInfo | { error: boolean; message: string }>} The contributor data or an error object.
 */
export async function getContributorInfo(taxpayerId: string): Promise<HaciendaContributorInfo | { error: boolean; message: string }> {
    await authorizeAction('hacienda:query');
    if (!taxpayerId) {
        return { error: true, message: "El número de identificación es requerido." };
    }
    try {
        const apiSettings = await getApiSettings();
        if (!apiSettings?.haciendaTributariaApi) { 
            throw new Error("La URL de la API de situación tributaria no está configurada.");
        }
        
        const apiUrl = `${apiSettings.haciendaTributariaApi}${taxpayerId}`;
        
        const response = await fetch(apiUrl, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`Error de la API de Hacienda: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data as HaciendaContributorInfo;
    } catch (error: any) {
        logError("Error al obtener información del contribuyente", { error: error.message, taxpayerId });
        return { error: true, message: error.message };
    }
}

/**
 * Fetches the status of a specific tax exemption from the Hacienda API.
 * @param {string} authNumber - The exemption authorization number.
 * @returns {Promise<HaciendaExemptionApiResponse | { error: boolean; message: string; status?: number }>} The exemption data or an error object.
 */
export async function getExemptionStatus(authNumber: string): Promise<HaciendaExemptionApiResponse | { error: boolean; message: string; status?: number }> {
    await authorizeAction('hacienda:query');
    if (!authNumber) {
        return { error: true, message: "El número de autorización es requerido." };
    }
    try {
        const apiSettings = await getApiSettings();
        if (!apiSettings?.haciendaExemptionApi) {
            throw new Error("La URL de la API de exoneraciones no está configurada.");
        }

        const fullApiUrl = `${apiSettings.haciendaExemptionApi}${authNumber}`;
        const response = await fetch(fullApiUrl, { cache: 'no-store' });

        if (!response.ok) {
            if (response.status === 404) {
                 return { error: true, message: "Exoneración no encontrada en Hacienda.", status: 404 };
            }
            throw new Error(`Error de la API de Hacienda: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data as HaciendaExemptionApiResponse;
    } catch (error: any) {
        logError("Error al obtener estado de exoneración", { error: error.message, authNumber });
        return { error: true, message: error.message };
    }
}

/**
 * Fetches exemption status and enriches it with CABYS descriptions from the local cache.
 * @param {string} authNumber - The exemption authorization number.
 * @returns {Promise<EnrichedExemptionInfo | { error: boolean; message: string; status?: number }>} The enriched exemption data or an error object.
 */
export async function getEnrichedExemptionStatus(authNumber: string): Promise<EnrichedExemptionInfo | { error: boolean; message: string; status?: number }> {
    const exemptionResult = await getExemptionStatus(authNumber);

    if ('error' in exemptionResult) {
        return exemptionResult;
    }

    const cabysMap = await loadCabysData();

    const enrichedCabys: EnrichedCabysItem[] = exemptionResult.cabys.map((code) => {
        const cabysEntry = cabysMap.get(code);
        
        return {
            code,
            description: cabysEntry?.description || 'Descripción no encontrada',
            taxRate: cabysEntry?.taxRate ?? 0,
        };
    });

    const result: EnrichedExemptionInfo = {
        ...exemptionResult,
        enrichedCabys,
    };

    return result;
}

export async function getExemptionsAction() {
    await authorizeAction('hacienda:query');
    return getAllExemptions();
}
