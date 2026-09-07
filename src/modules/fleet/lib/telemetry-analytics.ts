/**
 * Motor Analítico de KPIs y Telemetría Logística (Portado de Traccar)
 * Proporciona funciones de cálculo de paradas, resúmenes de viaje y evaluación de geocercas.
 */

export interface GpsPoint {
    lat: number;
    lng: number;
    speed?: number;
    timestamp: string | Date;
}

export interface DetectedStop {
    lat: number;
    lng: number;
    startTime: string;
    endTime: string;
    durationMinutes: number;
}

export interface TripSummary {
    totalPoints: number;
    totalDistanceKm: number;
    maxSpeedKmH: number;
    avgSpeedKmH: number;
    movingMinutes: number;
    idleMinutes: number;
    stopsCount: number;
    startTime: string | null;
    endTime: string | null;
}

export interface GeofenceCircle {
    type: 'circle';
    lat: number;
    lng: number;
    radiusMeters: number;
}

export interface GeofencePolygon {
    type: 'polygon';
    points: Array<{ lat: number; lng: number }>;
}

export type GeofenceDefinition = GeofenceCircle | GeofencePolygon;

/**
 * Fórmula de Haversine para cálculo de distancia en metros entre dos coordenadas.
 */
export function calcularDistanciaHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Radio terrestre en metros
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Evalúa si una coordenada está dentro de un radio circular o polígono.
 */
export function isPointInGeofence(lat: number, lng: number, geofence: GeofenceDefinition): boolean {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return false;

    if (geofence.type === 'circle') {
        const dist = calcularDistanciaHaversine(lat, lng, geofence.lat, geofence.lng);
        return dist <= geofence.radiusMeters;
    }

    if (geofence.type === 'polygon') {
        const pts = geofence.points;
        if (!pts || pts.length < 3) return false;

        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].lat, yi = pts[i].lng;
            const xj = pts[j].lat, yj = pts[j].lng;

            const intersect = ((yi > lng) !== (yj > lng)) &&
                (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    return false;
}

/**
 * Algoritmo de detección de paradas (StopProvider de Traccar)
 * Identifica grupos de puntos consecutivos donde el vehículo no se ha desplazado más allá de un umbral en metros.
 */
export function detectStops(points: GpsPoint[], minStopMinutes: number = 5, distanceThresholdMeters: number = 100): DetectedStop[] {
    if (!points || points.length < 2) return [];

    const stops: DetectedStop[] = [];
    let stopStart: GpsPoint | null = null;
    let stopEnd: GpsPoint | null = null;

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!stopStart) {
            stopStart = p;
            stopEnd = p;
            continue;
        }

        const dist = calcularDistanciaHaversine(stopStart.lat, stopStart.lng, p.lat, p.lng);
        if (dist <= distanceThresholdMeters) {
            stopEnd = p;
        } else {
            const startMs = new Date(stopStart.timestamp).getTime();
            const endMs = new Date((stopEnd || stopStart).timestamp).getTime();
            const durationMin = Math.floor((endMs - startMs) / (1000 * 60));

            if (durationMin >= minStopMinutes) {
                stops.push({
                    lat: stopStart.lat,
                    lng: stopStart.lng,
                    startTime: new Date(stopStart.timestamp).toISOString(),
                    endTime: new Date((stopEnd || stopStart).timestamp).toISOString(),
                    durationMinutes: durationMin
                });
            }

            stopStart = p;
            stopEnd = p;
        }
    }

    if (stopStart && stopEnd) {
        const startMs = new Date(stopStart.timestamp).getTime();
        const endMs = new Date(stopEnd.timestamp).getTime();
        const durationMin = Math.floor((endMs - startMs) / (1000 * 60));

        if (durationMin >= minStopMinutes) {
            stops.push({
                lat: stopStart.lat,
                lng: stopStart.lng,
                startTime: new Date(stopStart.timestamp).toISOString(),
                endTime: new Date(stopEnd.timestamp).toISOString(),
                durationMinutes: durationMin
            });
        }
    }

    return stops;
}

/**
 * Calcula métricas y resumen de rendimiento de viaje a partir de la traza de puntos GPS.
 */
export function calculateTripSummary(points: GpsPoint[]): TripSummary {
    if (!points || points.length === 0) {
        return {
            totalPoints: 0,
            totalDistanceKm: 0,
            maxSpeedKmH: 0,
            avgSpeedKmH: 0,
            movingMinutes: 0,
            idleMinutes: 0,
            stopsCount: 0,
            startTime: null,
            endTime: null
        };
    }

    let totalMeters = 0;
    let maxSpeed = 0;
    let speedSum = 0;
    let movingCount = 0;
    let idleCount = 0;

    for (let i = 0; i < points.length; i++) {
        const curr = points[i];
        const spd = curr.speed || 0;
        if (spd > maxSpeed) maxSpeed = spd;
        speedSum += spd;

        if (spd > 5) {
            movingCount++;
        } else {
            idleCount++;
        }

        if (i > 0) {
            const prev = points[i - 1];
            totalMeters += calcularDistanciaHaversine(prev.lat, prev.lng, curr.lat, curr.lng);
        }
    }

    const stops = detectStops(points, 5);
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const durationTotalMs = new Date(lastPoint.timestamp).getTime() - new Date(firstPoint.timestamp).getTime();
    const durationTotalMin = Math.max(1, Math.floor(durationTotalMs / (1000 * 60)));

    return {
        totalPoints: points.length,
        totalDistanceKm: Number((totalMeters / 1000).toFixed(2)),
        maxSpeedKmH: Math.round(maxSpeed),
        avgSpeedKmH: Math.round(speedSum / points.length),
        movingMinutes: Math.min(durationTotalMin, Math.round((movingCount / points.length) * durationTotalMin)),
        idleMinutes: Math.min(durationTotalMin, Math.round((idleCount / points.length) * durationTotalMin)),
        stopsCount: stops.length,
        startTime: new Date(firstPoint.timestamp).toISOString(),
        endTime: new Date(lastPoint.timestamp).toISOString()
    };
}
