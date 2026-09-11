/**
 * DRY Logistics Metrics & Geofence Utilities
 * Shared domain logic for calculating and formatting arrival, delivery, departure, 
 * dwell times, and auto-geofence tags across Analytics, Route Sheets, Audit, and TV views.
 */

export interface DeliveryGeofenceTimeData {
    fecha_llegada_geocerca?: string | null;
    fecha_entrega?: string | null;
    fecha_salida_geocerca?: string | null;
    tiempo_estadia_min?: number | null;
    geocerca_auto_llegada?: number | boolean | null;
    geocerca_auto_salida?: number | boolean | null;
    canal_registro?: string | null;
}

export function formatTimeHHMM(isoOrTimeString?: string | null): string {
    if (!isoOrTimeString) return '--:--';
    try {
        const date = new Date(isoOrTimeString);
        if (isNaN(date.getTime())) {
            // Handle if it's already HH:mm or HH:mm:ss string
            if (/^\d{2}:\d{2}/.test(isoOrTimeString)) {
                return isoOrTimeString.substring(0, 5);
            }
            return '--:--';
        }
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch {
        return '--:--';
    }
}

export function getDeliveryTimeMetrics(item: DeliveryGeofenceTimeData) {
    const horaLlegada = formatTimeHHMM(item.fecha_llegada_geocerca);
    const horaEntrega = formatTimeHHMM(item.fecha_entrega);
    const horaSalida = formatTimeHHMM(item.fecha_salida_geocerca);

    let dwellMinutes: number | null = item.tiempo_estadia_min ?? null;
    if (dwellMinutes === null && item.fecha_llegada_geocerca && item.fecha_salida_geocerca) {
        const arr = new Date(item.fecha_llegada_geocerca).getTime();
        const dep = new Date(item.fecha_salida_geocerca).getTime();
        if (!isNaN(arr) && !isNaN(dep) && dep >= arr) {
            dwellMinutes = Math.round((dep - arr) / (1000 * 60));
        }
    }

    const isAutoArrival = Boolean(item.geocerca_auto_llegada);
    const isAutoDeparture = Boolean(item.geocerca_auto_salida);

    return {
        horaLlegada,
        horaEntrega,
        horaSalida,
        dwellMinutes,
        isAutoArrival,
        isAutoDeparture,
        formattedDwell: dwellMinutes !== null ? `${dwellMinutes} min` : '--'
    };
}

/**
 * Generates ultra-compact HTML snippet for Letter Landscape Route Sheet print table
 */
export function renderCompactRouteSheetTimeCell(item: DeliveryGeofenceTimeData): string {
    const metrics = getDeliveryTimeMetrics(item);

    const autoArrivalBadge = metrics.isAutoArrival ? ' <span style="font-size: 8px; color: #0284c7; font-weight: bold;">(⚡)</span>' : '';
    const autoDepartureBadge = metrics.isAutoDeparture ? ' <span style="font-size: 8px; color: #0284c7; font-weight: bold;">(⚡)</span>' : '';

    return `
        <div style="font-size: 9px; line-height: 1.15; font-family: monospace, sans-serif; text-align: left; padding: 2px 0;">
            <div><strong style="color: #475569;">Ing:</strong> ${metrics.horaLlegada}${autoArrivalBadge}</div>
            <div><strong style="color: #16a34a;">Ent:</strong> ${metrics.horaEntrega}</div>
            <div><strong style="color: #dc2626;">Sal:</strong> ${metrics.horaSalida}${autoDepartureBadge}</div>
            ${metrics.dwellMinutes !== null ? `<div style="color: #64748b; font-size: 8px; border-top: 1px dashed #cbd5e1; margin-top: 1px; padding-top: 1px;"><strong>Est:</strong> ${metrics.formattedDwell}</div>` : ''}
        </div>
    `;
}
