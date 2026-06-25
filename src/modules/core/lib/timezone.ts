import { getDb } from './db';

// Caché en memoria con TTL
let cachedTimeZone: string | null = null;
let lastFetch: number = 0;
const CACHE_TTL = 60000; // 1 minuto (60,000ms)

/**
 * Obtiene la zona horaria comercial configurada en la base de datos de manera optimizada usando caché
 */
async function getBusinessTimeZone(): Promise<string> {
    const now = Date.now();
    
    if (cachedTimeZone && (now - lastFetch) < CACHE_TTL) {
        return cachedTimeZone;
    }

    try {
        const db = await getDb();
        const settings = db.prepare('SELECT timeZone FROM core_company_settings WHERE id = 1').get() as { timeZone?: string } | undefined;
        cachedTimeZone = settings?.timeZone || 'America/Costa_Rica';
        lastFetch = now;
        return cachedTimeZone;
    } catch (e) {
        console.error("Error leyendo zona horaria comercial, usando Costa Rica por defecto:", e);
        return cachedTimeZone || 'America/Costa_Rica';
    }
}

/**
 * Helper limpio para exponer la zona horaria en logs de debug sin mutar la caché directamente.
 */
export function getCachedTimeZone(): string {
    return cachedTimeZone || 'America/Costa_Rica';
}

/**
 * Invalida la caché para forzar una consulta fresca en la base de datos (llamar al guardar configuraciones)
 */
export function invalidateTimeZoneCache(): void {
    cachedTimeZone = null;
    lastFetch = 0;
}

/**
 * Retorna la fecha comercial del negocio formateada en YYYY-MM-DD basándose en la zona horaria configurada.
 */
export async function getBusinessDateStr(date: Date = new Date()): Promise<string> {
    const timeZone = await getBusinessTimeZone();
    return new Intl.DateTimeFormat('fr-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

/**
 * Versión síncrona de getBusinessDateStr útil para áreas síncronas o renders inmediatos.
 */
export function getBusinessDateStrSync(date: Date = new Date()): string {
    const timeZone = cachedTimeZone || 'America/Costa_Rica';
    return new Intl.DateTimeFormat('fr-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
