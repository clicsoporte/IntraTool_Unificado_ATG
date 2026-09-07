/**
 * Caché en memoria para la telemetría GPS transmitida por la APK Móvil Flutter
 */

export interface MobileTelemetryCacheItem {
    driverId: string;
    plate: string;
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    battery: number;
    timestamp: string;
    lastUpdate: string;
}

export const CACHE_MOBILE_TELEMETRY: Record<string, MobileTelemetryCacheItem> = {};
