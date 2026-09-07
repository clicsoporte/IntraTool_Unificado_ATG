/**
 * Servicio de Geocodificación Inversa con Caché de Memoria (Nominatim/OpenStreetMap)
 * Portado desde MonitorEstados_GPS para resolver Lat/Lng a Texto (Distrito, Cantón, Provincia).
 */
import { logWarn } from '@/modules/core/lib/logger';

type CacheItem = {
    lat: number;
    lng: number;
    ubicacion: string;
    timestamp: number;
};

const CACHE_GEOCODIFICACION: Record<string, CacheItem> = {};

function calcularDistanciaMatematica(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Radio de la Tierra en metros
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function calcularDistanciaGeografica(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return calcularDistanciaMatematica(lat1, lon1, lat2, lon2);
}

export async function obtenerUbicacionTexto(
    trackerId: string | number,
    lat: number,
    lng: number,
    umbralMetros: number = 200
): Promise<string> {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        return "";
    }

    const key = String(trackerId);
    const cached = CACHE_GEOCODIFICACION[key];

    // Reutilizar caché si se ha movido menos del umbral en metros
    if (cached && cached.ubicacion) {
        const dist = calcularDistanciaMatematica(cached.lat, cached.lng, lat, lng);
        if (dist < umbralMetros) {
            return cached.ubicacion;
        }
    }

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'ClicToolsGarendFlota/2.0 (logistica@industriasgarend.com)'
            },
            signal: AbortSignal.timeout(1500),
            next: { revalidate: 3600 } // Cache HTTP Next.js por 1 hora
        });

        if (resp.ok) {
            const data = await resp.json();
            const address = data.address || {};

            const localidad = address.suburb || address.neighbourhood || address.village || address.town || address.city_district || '';
            const municipio = address.city || address.county || address.state_district || '';
            const provincia = address.state || '';

            const partes = [localidad, municipio, provincia].filter(Boolean);
            const ubicacionStr = partes.length > 0 ? partes.join(', ') : (data.display_name || '').split(',')[0];

            CACHE_GEOCODIFICACION[key] = {
                lat,
                lng,
                ubicacion: ubicacionStr,
                timestamp: Date.now()
            };

            return ubicacionStr;
        }
    } catch (e: any) {
        logWarn(`Geocodificación omitida para rastreador ${trackerId}: ${e.message}`);
    }

    return cached ? cached.ubicacion : "";
}
