/**
 * Motor Predictivo de Feactibilidad de Rutas y Evaluación de Riesgos Logísticos
 * Calcula probabilidad de cumplimiento de ruta, hora proyectada de retorno al patio
 * y alerta sobre clientes en riesgo o con requisitos especiales de horario/cita.
 */

export interface RouteFeasibilityResult {
    assignmentId: number;
    rutaNombre: string;
    vehiculoPlaca: string;
    totalDocs: number;
    completedDocs: number;
    pendingDocs: number;
    estimatedReturnTime: string; // HH:mm
    feasibilityPct: number; // 0 - 100
    statusCategory: 'excelente' | 'aceptable' | 'riesgo_alto';
    riskyDeliveries: Array<{
        documentoNumero: string;
        clienteNombre: string;
        motivoRiesgo: string;
        esPrioritario: boolean;
        requiereCita: boolean;
        aplicaMulta: boolean;
    }>;
}

export async function evaluateRouteFeasibility(assignmentId: number): Promise<RouteFeasibilityResult> {
    const { getDb } = await import('@/modules/core/lib/db');
    const db = await getDb();

    const assignment = db.prepare(`
        SELECT a.id, a.fecha_salida, r.name as ruta_nombre, v.plate as vehiculo_placa
        FROM ops_delivery_assignments a
        JOIN ops_delivery_routes r ON a.ruta_id = r.id
        JOIN fleet_vehicles v ON a.vehiculo_id = v.id
        WHERE a.id = ?
    `).get(assignmentId) as any;

    if (!assignment) {
        return {
            assignmentId,
            rutaNombre: 'N/A',
            vehiculoPlaca: 'N/A',
            totalDocs: 0,
            completedDocs: 0,
            pendingDocs: 0,
            estimatedReturnTime: '--:--',
            feasibilityPct: 100,
            statusCategory: 'excelente',
            riskyDeliveries: []
        };
    }

    const deliveries = db.prepare(`
        SELECT q.id, q.documento_numero, q.cliente_nombre, q.entregado, q.estado, q.tiempo_estadia_min,
               c.hora_apertura, c.hora_cierre, c.pausa_inicio, c.pausa_fin,
               c.es_prioritario, c.requiere_cita, c.aplica_multa
        FROM ops_delivery_queue q
        LEFT JOIN core_customers c ON q.cliente_id = c.id
        WHERE q.asignacion_id = ? OR q.devolucion_asignacion_id = ?
    `).all(assignmentId, assignmentId) as any[];

    const totalDocs = deliveries.length;
    const completedDocs = deliveries.filter(d => d.entregado === 1 || ['completo', 'incompleto', 'rechazado'].includes(d.estado)).length;
    const pendingDocs = totalDocs - completedDocs;

    // Base calculation: Average 25 minutes per delivery (transit + dwell)
    const baseMinutesPerStop = 25;
    const remainingMinutes = pendingDocs * baseMinutesPerStop + 45; // 45 min return buffer

    const now = new Date();
    const returnDate = new Date(now.getTime() + remainingMinutes * 60 * 1000);
    const hours = returnDate.getHours().toString().padStart(2, '0');
    const mins = returnDate.getMinutes().toString().padStart(2, '0');
    const estimatedReturnTime = `${hours}:${mins}`;

    // Risk Evaluation
    const riskyDeliveries: RouteFeasibilityResult['riskyDeliveries'] = [];
    let penaltyRiskCount = 0;

    deliveries.forEach(d => {
        if (d.entregado === 0 && d.estado === 'pendiente') {
            if (d.aplica_multa === 1) {
                penaltyRiskCount++;
                riskyDeliveries.push({
                    documentoNumero: d.documento_numero,
                    clienteNombre: d.cliente_nombre,
                    motivoRiesgo: 'Aplica penalización / multa por retraso en ventana de entrega',
                    esPrioritario: Boolean(d.es_prioritario),
                    requiereCita: Boolean(d.requiere_cita),
                    aplicaMulta: true
                });
            } else if (d.requiere_cita === 1) {
                riskyDeliveries.push({
                    documentoNumero: d.documento_numero,
                    clienteNombre: d.cliente_nombre,
                    motivoRiesgo: 'Requiere cita previa de entrega',
                    esPrioritario: Boolean(d.es_prioritario),
                    requiereCita: true,
                    aplicaMulta: false
                });
            }
        }
    });

    let feasibilityPct = 100;
    if (pendingDocs > 12) {
        feasibilityPct -= (pendingDocs - 12) * 6;
    }
    if (penaltyRiskCount > 0) {
        feasibilityPct -= penaltyRiskCount * 10;
    }
    feasibilityPct = Math.max(35, Math.min(100, Math.round(feasibilityPct)));

    let statusCategory: RouteFeasibilityResult['statusCategory'] = 'excelente';
    if (feasibilityPct < 65) statusCategory = 'riesgo_alto';
    else if (feasibilityPct < 85) statusCategory = 'aceptable';

    return {
        assignmentId,
        rutaNombre: assignment.ruta_nombre,
        vehiculoPlaca: assignment.vehiculo_placa,
        totalDocs,
        completedDocs,
        pendingDocs,
        estimatedReturnTime,
        feasibilityPct,
        statusCategory,
        riskyDeliveries
    };
}
