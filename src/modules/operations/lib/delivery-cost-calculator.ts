/**
 * Calculador de Métricas Físicas de Ralentí y Desperdicio Directo de Combustible en Cliente
 * Proporciona reportes exactos de horas perdidas y litros consumidos en ralentí de cliente.
 */

export interface GeofenceIdleMetrics {
    clienteId: string;
    clienteNombre: string;
    totalDeliveries: number;
    totalDwellHours: number;
    totalCustomerIdleHours: number;
    wastedFuelLiters: number;
    directFuelCostLocal: number; // ₡
}

export async function getGeofenceIdleReport(limit = 10): Promise<GeofenceIdleMetrics[]> {
    const { getDb } = await import('@/modules/core/lib/db');
    const db = await getDb();

    // Obtener precio promedio de combustible de las facturas recientes
    let fuelPricePerLiter = 635; // Valor base Costa Rica en ₡
    try {
        const fuelRow = db.prepare(`
            SELECT AVG(price_per_liter) as avg_price 
            FROM fleet_fuel_logs 
            WHERE price_per_liter IS NOT NULL AND price_per_liter > 0
        `).get() as { avg_price: number | null } | undefined;
        if (fuelRow?.avg_price) {
            fuelPricePerLiter = Math.round(fuelRow.avg_price);
        }
    } catch (_) {}

    const rows = db.prepare(`
        SELECT 
            q.cliente_id as clienteId,
            q.cliente_nombre as clienteNombre,
            COUNT(q.id) as totalDeliveries,
            SUM(COALESCE(q.tiempo_estadia_min, 0)) as totalDwellMin,
            SUM(COALESCE(q.ralenti_cliente_minutos, 0)) as totalRalentiMin
        FROM ops_delivery_queue q
        WHERE q.cliente_id IS NOT NULL AND q.cliente_id != ''
        GROUP BY q.cliente_id, q.cliente_nombre
        HAVING totalRalentiMin > 0 OR totalDwellMin > 60
        ORDER BY totalRalentiMin DESC, totalDwellMin DESC
        LIMIT ?
    `).all(limit) as Array<{
        clienteId: string;
        clienteNombre: string;
        totalDeliveries: number;
        totalDwellMin: number;
        totalRalentiMin: number;
    }>;

    const idleRateLitersPerHour = 1.8; // Estándar técnico diésel en ralentí

    return rows.map(r => {
        const totalDwellHours = Number((r.totalDwellMin / 60).toFixed(1));
        const totalCustomerIdleHours = Number((r.totalRalentiMin / 60).toFixed(1));
        const wastedFuelLiters = Number((totalCustomerIdleHours * idleRateLitersPerHour).toFixed(1));
        const directFuelCostLocal = Math.round(wastedFuelLiters * fuelPricePerLiter);

        return {
            clienteId: r.clienteId,
            clienteNombre: r.clienteNombre,
            totalDeliveries: r.totalDeliveries,
            totalDwellHours,
            totalCustomerIdleHours,
            wastedFuelLiters,
            directFuelCostLocal
        };
    });
}
