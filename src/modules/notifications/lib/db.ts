import { getDb } from '@/modules/core/lib/db';
import { CORE_TABLE_NAMES } from '@/modules/core/lib/schema';
import { authorizeAction } from '@/modules/core/lib/auth-guard';

/**
 * DB helper for Notifications and Automations Module.
 */

// Rules
export async function getAllNotificationRules() {
    const db = await getDb();
    const rules = db.prepare(`SELECT * FROM ${CORE_TABLE_NAMES.notificationRules}`).all() as any[];
    return rules.map(r => ({ ...r, recipients: JSON.parse(r.recipients), enabled: r.enabled !== 0 }));
}

export async function saveNotificationRule(rule: any) {
    await authorizeAction('admin:settings:automations');
    const db = await getDb();
    const data = {
        name: rule.name || '',
        event: rule.event || '',
        action: rule.action || '',
        recipients: JSON.stringify(rule.recipients || []),
        subject: rule.subject || null,
        enabled: rule.enabled ? 1 : 0,
        id: rule.id || null
    };

    if (rule.id) {
        db.prepare(`
            UPDATE ${CORE_TABLE_NAMES.notificationRules} 
            SET name = @name, event = @event, action = @action, recipients = @recipients, subject = @subject, enabled = @enabled
            WHERE id = @id
        `).run(data);
    } else {
        db.prepare(`
            INSERT INTO ${CORE_TABLE_NAMES.notificationRules} (name, event, action, recipients, subject, enabled)
            VALUES (@name, @event, @action, @recipients, @subject, @enabled)
        `).run(data);
    }
}

export async function deleteNotificationRule(id: number) {
    await authorizeAction('admin:settings:automations');
    const db = await getDb();
    db.prepare(`DELETE FROM ${CORE_TABLE_NAMES.notificationRules} WHERE id = ?`).run(id);
}

// Templates
export async function getAllNotificationTemplates() {
    const db = await getDb();
    return db.prepare(`SELECT * FROM ${CORE_TABLE_NAMES.notificationTemplates}`).all() as any[];
}

export async function saveNotificationTemplate(template: any) {
    await authorizeAction('admin:settings:automations');
    const db = await getDb();
    db.prepare(`
        INSERT INTO ${CORE_TABLE_NAMES.notificationTemplates} (eventId, subject, body, telegram, internal)
        VALUES (@eventId, @subject, @body, @telegram, @internal)
        ON CONFLICT(eventId) DO UPDATE SET
            subject = @subject,
            body = @body,
            telegram = @telegram,
            internal = @internal
    `).run(template);
}

// Scheduled Tasks
export async function getAllScheduledTasks() {
    const db = await getDb();
    const tasks = db.prepare(`SELECT * FROM ${CORE_TABLE_NAMES.notificationScheduledTasks}`).all() as any[];
    return tasks.map(t => ({ ...t, enabled: t.enabled !== 0 }));
}

export async function saveScheduledTask(task: any) {
    await authorizeAction('admin:settings:automations');
    const db = await getDb();
    const data = {
        ...task,
        enabled: task.enabled ? 1 : 0
    };

    if (task.id) {
        db.prepare(`
            UPDATE ${CORE_TABLE_NAMES.notificationScheduledTasks} 
            SET name = @name, schedule = @schedule, taskId = @taskId, enabled = @enabled
            WHERE id = @id
        `).run(data);
    } else {
        db.prepare(`
            INSERT INTO ${CORE_TABLE_NAMES.notificationScheduledTasks} (name, schedule, taskId, enabled)
            VALUES (@name, @schedule, @taskId, @enabled)
        `).run(data);
    }
}

export async function deleteScheduledTask(id: number) {
    await authorizeAction('admin:settings:automations');
    const db = await getDb();
    db.prepare(`DELETE FROM ${CORE_TABLE_NAMES.notificationScheduledTasks} WHERE id = ?`).run(id);
}

export async function updateTaskLastRun(taskId: string) {
    const db = await getDb();
    db.prepare(`UPDATE ${CORE_TABLE_NAMES.notificationScheduledTasks} SET lastRun = ? WHERE taskId = ?`)
        .run(new Date().toISOString(), taskId);
}

/**
 * Seeds default templates and tasks for the fleet module.
 */
export async function initializeNotificationDefaults(db: any) {

    // 1. Default Templates
    const templates = [
        {
            eventId: 'onFleetMaintenanceDue',
            subject: '⚠️ Mantenimiento Vencido o Próximo: {{plate}}',
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a365d; padding: 24px; text-align: center; color: white; border-bottom: 4px solid #e11d48;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">ALERTA DE MANTENIMIENTO REQUERIDO</h1>
                        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Unidad Placa: <strong>{{plate}}</strong></p>
                    </div>
                    <div style="padding: 24px; color: #2d3748; line-height: 1.6;">
                        <div style="text-align: center; margin-bottom: 24px; background-color: #fff5f5; border: 1px solid #fed7d7; border-radius: 6px; padding: 15px;">
                            <div style="font-size: 32px; font-weight: bold; color: #c53030;">{{progress}}%</div>
                            <div style="font-size: 11px; font-weight: bold; color: #9b2c2c; text-transform: uppercase; letter-spacing: 0.5px;">Progreso de Vida Útil de Aceite</div>
                        </div>
                        <p style="margin: 0 0 16px 0; font-size: 14px;">Le informamos que el vehículo requiere un mantenimiento preventivo de cambio de aceite a la brevedad posible.</p>
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px;">
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Marca / Modelo:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #1a365d;">{{brand}} {{model}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Odómetro Actual:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">{{currentMileage}} {{odometerUnit}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Límite de Intervalo:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">{{oilChangeInterval}} {{odometerUnit}}</td></tr>
                            <tr><td style="padding: 8px 0; color: #718096;">Exceso / Faltante:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #c53030;">{{remaining}} {{odometerUnit}}</td></tr>
                        </table>
                        <div style="margin-top: 24px; text-align: center;">
                            <a href="https://industriasgarend.com/dashboard/fleet/vehicles" style="background-color: #1a365d; color: white; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 4px; font-size: 13px; display: inline-block;">Ver Ficha de Vehículo</a>
                        </div>
                    </div>
                    <div style="background-color: #f7fafc; padding: 15px; text-align: center; font-size: 11px; color: #a0aec0; border-top: 1px solid #edf2f7;">
                        Sistema de Control y Gestión de Flota - Industrias Garend S.A.
                    </div>
                </div>
            `,
            telegram: '⚠️ <b>MANTENIMIENTO FLOTA</b>\n\nUnidad: <b>{{plate}}</b>\nProgreso: <b>{{progress}}%</b>\nFaltan: <b>{{remaining}} {{odometerUnit}}</b>',
            internal: 'Mantenimiento próximo/vencido para unidad {{plate}} ({{progress}}%)'
        },
        {
            eventId: 'onFleetPermitExpiring',
            subject: '📅 Vencimiento de Permiso: {{plate}}',
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a365d; padding: 24px; text-align: center; color: white; border-bottom: 4px solid #f59e0b;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">ALERTA DE VENCIMIENTO DE DOCUMENTO</h1>
                        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Unidad Placa: <strong>{{plate}}</strong></p>
                    </div>
                    <div style="padding: 24px; color: #2d3748; line-height: 1.6;">
                        <div style="text-align: center; margin-bottom: 24px; background-color: #fffaf0; border: 1px solid #feebc8; border-radius: 6px; padding: 15px;">
                            <div style="font-size: 32px; font-weight: bold; color: #dd6b20;">{{daysLeft}} Días</div>
                            <div style="font-size: 11px; font-weight: bold; color: #9c4221; text-transform: uppercase; letter-spacing: 0.5px;">Plazo Restante para Renovación</div>
                        </div>
                        <p style="margin: 0 0 16px 0; font-size: 14px;">Se le notifica que el documento o permiso requerido para circular está próximo a vencer.</p>
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px;">
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Tipo de Permiso / Trámite:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #1a365d;">{{permitType}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Fecha de Expiración:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #c53030;">{{expirationDate}}</td></tr>
                            <tr><td style="padding: 8px 0; color: #718096;">Días Restantes:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #dd6b20;">{{daysLeft}} días</td></tr>
                        </table>
                        <div style="margin-top: 24px; text-align: center;">
                            <a href="https://industriasgarend.com/dashboard/fleet/vehicles" style="background-color: #1a365d; color: white; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 4px; font-size: 13px; display: inline-block;">Ver Ficha de Vehículo</a>
                        </div>
                    </div>
                    <div style="background-color: #f7fafc; padding: 15px; text-align: center; font-size: 11px; color: #a0aec0; border-top: 1px solid #edf2f7;">
                        Sistema de Control y Gestión de Flota - Industrias Garend S.A.
                    </div>
                </div>
            `,
            telegram: '📅 <b>VENCIMIENTO PERMISO</b>\n\nUnidad: <b>{{plate}}</b>\nDocumento: <b>{{permitType}}</b>\nVence: <b>{{expirationDate}}</b> ({{daysLeft}} días)',
            internal: 'Permiso {{permitType}} de unidad {{plate}} vence en {{daysLeft}} días.'
        },
        {
            eventId: 'onFleetFuelLogAdded',
            subject: '⛽ Nuevo Repostaje: {{plate}}',
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a365d; padding: 24px; text-align: center; color: white; border-bottom: 4px solid #3182ce;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">COMPROBANTE DE REPOSTAJE DE COMBUSTIBLE</h1>
                        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Unidad Placa: <strong>{{plate}}</strong></p>
                    </div>
                    <div style="padding: 24px; color: #2d3748; line-height: 1.6;">
                        <p style="margin: 0 0 16px 0; font-size: 14px;">Se ha registrado una nueva carga de combustible para este activo con la siguiente información:</p>
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px;">
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Fecha del Registro:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">{{date}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Tipo de Combustible:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #3182ce;">{{fuelTypeName}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Odómetro al Repostar:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">{{mileageBefore}} {{odometerUnit}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Litros Suministrados:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #3182ce;">{{liters}} L</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Costo de la Transacción:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #2b6cb0;">CRC {{cost}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Chofer Autorizado:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">{{driverId}}</td></tr>
                            <tr><td style="padding: 8px 0; color: #718096;">Registrado por:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">{{userName}}</td></tr>
                        </table>
                    </div>
                    <div style="background-color: #f7fafc; padding: 15px; text-align: center; font-size: 11px; color: #a0aec0; border-top: 1px solid #edf2f7;">
                        Sistema de Control y Gestión de Flota - Industrias Garend S.A.
                    </div>
                </div>
            `,
            telegram: '⛽ <b>REPOSTAJE</b>\n\nUnidad: <b>{{plate}}</b>\nCombustible: <b>{{fuelTypeName}}</b>\nLitros: <b>{{liters}} L</b>\nCosto: <b>CRC {{cost}}</b>\nChofer: <b>{{driverId}}</b>',
            internal: 'Nuevo repostaje de {{fuelTypeName}} registrado para {{plate}} ({{liters}} L)'
        },
        {
            eventId: 'onFleetMaintenanceLogAdded',
            subject: '🛠️ Mantenimiento Realizado: {{plate}}',
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a365d; padding: 24px; text-align: center; color: white; border-bottom: 4px solid #805ad5;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">REGISTRO DE MANTENIMIENTO EJECUTADO</h1>
                        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Unidad Placa: <strong>{{plate}}</strong></p>
                    </div>
                    <div style="padding: 24px; color: #2d3748; line-height: 1.6;">
                        <p style="margin: 0 0 16px 0; font-size: 14px;">Se ha registrado exitosamente la ejecución de un mantenimiento para este activo:</p>
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px;">
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Tipo de Mantenimiento:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #805ad5;">{{type}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Descripción / Detalles:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">{{description}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Odómetro del Servicio:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">{{mileage}} {{odometerUnit}}</td></tr>
                            <tr style="border-bottom: 1px solid #edf2f7;"><td style="padding: 8px 0; color: #718096;">Costo del Servicio:</td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #2b6cb0;">CRC {{cost}}</td></tr>
                            <tr><td style="padding: 8px 0; color: #718096;">Taller / Responsable:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">{{performedBy}}</td></tr>
                        </table>
                    </div>
                    <div style="background-color: #f7fafc; padding: 15px; text-align: center; font-size: 11px; color: #a0aec0; border-top: 1px solid #edf2f7;">
                        Sistema de Control y Gestión de Flota - Industrias Garend S.A.
                    </div>
                </div>
            `,
            telegram: '🛠️ <b>MANTENIMIENTO</b>\n\nUnidad: <b>{{plate}}</b>\nTipo: <b>{{type}}</b>\nCosto: <b>CRC {{cost}}</b>',
            internal: 'Mantenimiento {{type}} registrado para {{plate}}'
        },
        {
            eventId: 'onFleetWeeklyFuelReport',
            subject: '⛽ Consolidado Semanal de Combustible ({{startDate}} al {{endDate}})',
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 650px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a365d; padding: 24px; text-align: center; color: white; border-bottom: 4px solid #3182ce;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">CONSOLIDADO SEMANAL DE COMBUSTIBLE</h1>
                        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Período del <strong>{{startDate}}</strong> al <strong>{{endDate}}</strong></p>
                    </div>
                    <div style="padding: 24px; color: #2d3748; line-height: 1.6;">
                        <p style="margin: 0 0 20px 0; font-size: 14px;">Estimado Administrador, se detalla el resumen de consumos de combustible acumulados de la flota durante la semana anterior:</p>
                        
                        <!-- Tarjetas de Métricas -->
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                            <tr>
                                <td style="width: 50%; padding: 0 8px 8px 0;">
                                    <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; text-align: center;">
                                        <div style="font-size: 11px; font-weight: bold; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Total Litros</div>
                                        <div style="font-size: 22px; font-weight: bold; color: #3182ce;">{{totalLiters}} L</div>
                                    </div>
                                </td>
                                <td style="width: 50%; padding: 0 0 8px 8px;">
                                    <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; text-align: center;">
                                        <div style="font-size: 11px; font-weight: bold; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Inversión Total</div>
                                        <div style="font-size: 22px; font-weight: bold; color: #2b6cb0;">CRC {{totalCost}}</div>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td style="width: 50%; padding: 8px 8px 0 0;">
                                    <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; text-align: center;">
                                        <div style="font-size: 11px; font-weight: bold; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Costo Promedio L</div>
                                        <div style="font-size: 22px; font-weight: bold; color: #4a5568;">CRC {{avgCostPerLiter}}</div>
                                    </div>
                                </td>
                                <td style="width: 50%; padding: 8px 0 0 8px;">
                                    <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; text-align: center;">
                                        <div style="font-size: 11px; font-weight: bold; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Rendimiento Prom.</div>
                                        <div style="font-size: 22px; font-weight: bold; color: #38a169;">{{avgEfficiency}} Km/L</div>
                                    </div>
                                </td>
                            </tr>
                        </table>
                        
                        <h3 style="margin: 24px 0 12px 0; font-size: 15px; color: #1a365d; border-bottom: 2px solid #edf2f7; padding-bottom: 6px; font-weight: bold;">Historial de Consumo Consolidado por Activo</h3>
                        
                        <div style="overflow-x: auto; margin-bottom: 20px;">
                            {{consolidatedTable}}
                        </div>
                        
                        <div style="margin-top: 24px; text-align: center;">
                            <a href="https://industriasgarend.com/dashboard/fleet/reports" style="background-color: #1a365d; color: white; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 4px; font-size: 13px; display: inline-block;">Ver Reporte Completo en Web</a>
                        </div>
                    </div>
                    <div style="background-color: #f7fafc; padding: 15px; text-align: center; font-size: 11px; color: #a0aec0; border-top: 1px solid #edf2f7;">
                        Sistema de Control y Gestión de Flota - Industrias Garend S.A.
                    </div>
                </div>
            `,
            telegram: '⛽ <b>Reporte Semanal de Combustible</b>\n\nPeríodo: <b>{{startDate}} al {{endDate}}</b>\nTotal Litros: <b>{{totalLiters}} L</b>\nInversión: <b>CRC {{totalCost}}</b>\nCosto Prom. L: <b>CRC {{avgCostPerLiter}}</b>\nRendimiento Prom.: <b>{{avgEfficiency}} Km/L</b>\n\n<b>Detalle por Vehículo:</b>\n{{fuelListTelegram}}',
            internal: 'Reporte semanal de combustible consolidado ({{startDate}} al {{endDate}}): {{totalLiters}} L consumidos.'
        },
        {
            eventId: 'onFleetAlertsSummary',
            subject: '⚠️ Reporte Consolidado de Alertas Activas de Flota',
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 650px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #742a2a; padding: 24px; text-align: center; color: white; border-bottom: 4px solid #e53e3e;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">REPORTE CONSOLIDADO DE ALERTAS DE FLOTA</h1>
                        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Resumen semanal de alertas y estado de activos</p>
                    </div>
                    <div style="padding: 24px; color: #2d3748; line-height: 1.6;">
                        <p style="margin: 0 0 20px 0; font-size: 14px;">Estimado Administrador, se ha generado el informe de alertas mecánicas, legales y operativas activas en las unidades de la flota:</p>
                        
                        <!-- Tarjetas de Métricas -->
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                            <tr>
                                <td style="width: 25%; padding: 0 4px 0 0;">
                                    <div style="background-color: #fff5f5; border: 1px solid #fed7d7; border-radius: 6px; padding: 12px 5px; text-align: center;">
                                        <div style="font-size: 9px; font-weight: bold; color: #e53e3e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Total Alertas</div>
                                        <div style="font-size: 18px; font-weight: bold; color: #9b2c2c;">{{totalAlerts}}</div>
                                    </div>
                                </td>
                                <td style="width: 25%; padding: 0 4px 0 4px;">
                                    <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 5px; text-align: center;">
                                        <div style="font-size: 9px; font-weight: bold; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Fuera Servicio</div>
                                        <div style="font-size: 18px; font-weight: bold; color: #4a5568;">{{outOfServiceCount}}</div>
                                    </div>
                                </td>
                                <td style="width: 25%; padding: 0 4px 0 4px;">
                                    <div style="background-color: #fffaf0; border: 1px solid #feebc8; border-radius: 6px; padding: 12px 5px; text-align: center;">
                                        <div style="font-size: 9px; font-weight: bold; color: #dd6b20; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Al. Mecánicas</div>
                                        <div style="font-size: 18px; font-weight: bold; color: #dd6b20;">{{mechanicalAlertsCount}}</div>
                                    </div>
                                </td>
                                <td style="width: 25%; padding: 0 0 0 4px;">
                                    <div style="background-color: #ebf8ff; border: 1px solid #bee3f8; border-radius: 6px; padding: 12px 5px; text-align: center;">
                                        <div style="font-size: 9px; font-weight: bold; color: #3182ce; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Al. Legales</div>
                                        <div style="font-size: 18px; font-weight: bold; color: #2b6cb0;">{{legalAlertsCount}}</div>
                                    </div>
                                </td>
                            </tr>
                        </table>
                        
                        <h3 style="margin: 24px 0 12px 0; font-size: 15px; color: #742a2a; border-bottom: 2px solid #edf2f7; padding-bottom: 6px; font-weight: bold;">Detalle de Unidades con Alertas</h3>
                        
                        <div style="overflow-x: auto; margin-bottom: 20px;">
                            {{alertsTable}}
                        </div>
                        
                        <div style="margin-top: 24px; text-align: center;">
                            <a href="https://industriasgarend.com/dashboard/fleet/vehicles" style="background-color: #742a2a; color: white; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 4px; font-size: 13px; display: inline-block;">Ver Activos en Plataforma</a>
                        </div>
                    </div>
                    <div style="background-color: #f7fafc; padding: 15px; text-align: center; font-size: 11px; color: #a0aec0; border-top: 1px solid #edf2f7;">
                        Sistema de Control y Gestión de Flota - Industrias Garend S.A.
                    </div>
                </div>
            `,
            telegram: '⚠️ <b>Alertas de Flota Consolidadas</b>\n\nTotal Alertas: <b>{{totalAlerts}}</b>\nFuera de Servicio: <b>{{outOfServiceCount}}</b>\nAlertas Mecánicas: <b>{{mechanicalAlertsCount}}</b>\nAlertas Legales: <b>{{legalAlertsCount}}</b>\n\n<b>Detalle de Unidades con Alertas:</b>\n{{alertsListTelegram}}',
            internal: 'Reporte consolidado de alertas de flota: {{totalAlerts}} alertas activas encontradas.'
        },
        {
            eventId: 'onDeliveryUpdate',
            subject: '[LOGÍSTICA] Entrega {{estadoLabel}} - Doc #{{docNumero}}',
            body: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); overflow: hidden; border: 1px solid #f3f4f6;">
                        <!-- Header Banner -->
                        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 30px; text-align: center; color: #ffffff;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">Clic Logistics</h1>
                            <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Control de Entregas en Tiempo Real</p>
                        </div>
                        
                        <!-- Content -->
                        <div style="padding: 30px;">
                            <!-- Status Badge -->
                            <div style="text-align: center; margin-bottom: 25px;">
                                <span style="display: inline-flex; align-items: center; padding: 6px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600; color: {{estadoColor}}; background-color: {{estadoBg}}; border: 1px solid {{estadoColor}}33;">
                                    <span style="margin-right: 6px;">{{icon}}</span> {{estadoLabel}}
                                </span>
                            </div>
                            
                            <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #111827; text-align: center;">
                                Novedad en la entrega del documento {{docNumero}}
                            </h2>
                            
                            <div style="border-top: 1px solid #f3f4f6; border-bottom: 1px solid #f3f4f6; padding: 20px 0; margin-bottom: 20px;">
                                <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280; width: 35%;">Tipo Documento:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500; text-transform: capitalize;">{{tipoDoc}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Cliente:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{clienteNombre}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Canal Reporte:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500; text-transform: uppercase;">{{canal}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Gestionado Por:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{gestionadoPor}}</td>
                                    </tr>
                                </table>
                            </div>

                            {{comentario}}

                            {{infoEnvio}}

                            {{linesHtml}}

                            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                                <a href="{{baseAppUrl}}/dashboard/operations/logistics/deliveries" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
                                    Ir al Monitor de Entregas
                                </a>
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af;">
                            <p style="margin: 0 0 5px 0;">Este es un correo automático generado por Clic-Tools.</p>
                            <p style="margin: 0;">Por favor no respondas a este correo. Todos los derechos reservados &copy; 2026.</p>
                        </div>
                    </div>
                </div>
            `,
            telegram: '🚚 <b>ENTREGA {{estadoLabel}}</b>\n\nDoc: <b>#{{docNumero}}</b>\nCliente: <b>{{clienteNombre}}</b>\nCanal: <b>{{canal}}</b>\nNotas: <i>{{comentario}}</i>',
            internal: 'Novedad de entrega para documento {{docNumero}} ({{estadoLabel}})'
        },
        {
            eventId: 'onAssetAssigned',
            subject: 'Asignación de Activo Fijo TI - Clic-Tools',
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
                    <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #3b82f6;">
                        <h2 style="color: #1e3a8a; margin: 0;">Acta de Entrega de Activo Fijo</h2>
                        <p style="color: #64748b; font-size: 14px; margin: 5px 0 0 0;">Departamento de Tecnología (TI)</p>
                    </div>
                    
                    <div style="padding: 20px 0;">
                        <p style="margin: 0 0 15px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                            Estimado(a) <strong>{{assigneeName}}</strong>,
                        </p>
                        <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                            Se ha formalizado la asignación del siguiente activo de la empresa para el desempeño de sus labores. Al recibir este equipo, usted acepta la responsabilidad por su custodia, cuidado y uso conforme a las políticas de seguridad y uso de activos de la organización.
                        </p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                            <tr style="background-color: #f8fafc;">
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569; width: 35%;">Categoría</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{category}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Marca / Modelo</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{brand}} {{model}}</td>
                            </tr>
                            <tr style="background-color: #f8fafc;">
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Número de Serie</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{serialNumber}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Fecha Asignación</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{assignedDate}}</td>
                            </tr>
                            <tr style="background-color: #f8fafc;">
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Asignado Por</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{assignedBy}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Notas / Estado</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{notes}}</td>
                            </tr>
                        </table>
                        
                        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                            <h4 style="margin: 0 0 5px 0; color: #14532d; font-size: 14px;">Compromiso del Colaborador</h4>
                            <p style="margin: 0; color: #166534; font-size: 12px; line-height: 1.4;">
                                Me comprometo a mantener este activo en óptimas condiciones, reportar de forma inmediata cualquier falla, pérdida o robo al departamento de TI, y hacer entrega del mismo al finalizar mi relación laboral o cuando sea requerido.
                            </p>
                        </div>
                        
                        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; text-align: center;">
                            <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                                Documento de Control Interno generado automáticamente. Trazabilidad ISO 9001.
                            </p>
                        </div>
                    </div>
                </div>
            `,
            telegram: '💻 <b>ASIGNACIÓN TI</b>\n\nActivo: <b>{{category}} {{brand}} {{model}}</b>\nSerie: <b>{{serialNumber}}</b>\nAsignado a: <b>{{assigneeName}}</b>',
            internal: 'Activo {{category}} {{brand}} {{model}} asignado a {{assigneeName}}'
        },
        {
            eventId: 'onTicketCreated',
            subject: '🎟️ Ticket Creado [{{consecutive}}]: {{subject}}',
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
                    <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #3b82f6;">
                        <h2 style="color: #1e3a8a; margin: 0;">Apertura de Ticket de Soporte / Mantenimiento</h2>
                        <p style="color: #64748b; font-size: 14px; margin: 5px 0 0 0;">Departamento / Instancia: {{departmentName}}</p>
                    </div>
                    
                    <div style="padding: 20px 0;">
                        <p style="margin: 0 0 15px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                            Estimado(a) <strong>{{requesterName}}</strong>,
                        </p>
                        <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                            Se ha registrado exitosamente una nueva solicitud en nuestra mesa de control con el consecutivo <strong>{{consecutive}}</strong>. Nuestro equipo técnico evaluará y atenderá su solicitud a la brevedad.
                        </p>
                        
                        <h3 style="color: #1e3a8a; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px;">Detalles de la Solicitud</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                            <tr style="background-color: #f8fafc;">
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569; width: 35%;">Consecutivo</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: bold;">{{consecutive}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Asunto</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{subject}}</td>
                            </tr>
                            <tr style="background-color: #f8fafc;">
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Tipo de Mantenimiento</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{maintenanceType}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Prioridad</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;"><span style="padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; background-color: #fef3c7; color: #d97706;">{{priority}}</span></td>
                            </tr>
                            <tr style="background-color: #f8fafc;">
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Equipo / Activo</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{equipmentName}} {{brand}} {{model}} (S/N: {{serialNumber}})</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Técnico Asignado</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: 500;">{{assigneeName}}</td>
                            </tr>
                            <tr style="background-color: #f8fafc;">
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Registrado Por</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{createdByName}}</td>
                            </tr>
                        </table>
                        
                        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                            <h4 style="margin: 0 0 5px 0; color: #1e3a8a; font-size: 14px;">Descripción del Problema</h4>
                            <p style="margin: 0; color: #334155; font-size: 13px; line-height: 1.5; white-space: pre-wrap;">{{description}}</p>
                        </div>
                        
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                            <a href="{{baseAppUrl}}/dashboard/tickets" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                                Ver Detalles del Ticket
                            </a>
                        </div>
                        
                        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; text-align: center;">
                            <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                                Documento de Control Interno generado automáticamente. Trazabilidad ISO 9001.
                            </p>
                        </div>
                    </div>
                </div>
            `,
            telegram: '🎟️ <b>NUEVO TICKET</b>\n\nTicket: <b>{{consecutive}}</b>\nAsunto: <b>{{subject}}</b>\nPrioridad: <b>{{priority}}</b>\nAsignado a: <b>{{assigneeName}}</b>',
            internal: 'Nuevo ticket creado {{consecutive}}: {{subject}}'
        },
        {
            eventId: 'onTicketStatusChanged',
            subject: '🔄 Actualización de Ticket [{{consecutive}}]: {{subject}}',
            body: `
                <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
                    <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #3b82f6;">
                        <h2 style="color: #1e3a8a; margin: 0;">Actualización de Ticket de Soporte / Mantenimiento</h2>
                        <p style="color: #64748b; font-size: 14px; margin: 5px 0 0 0;">Departamento / Instancia: {{departmentName}}</p>
                    </div>
                    
                    <div style="padding: 20px 0;">
                        <p style="margin: 0 0 15px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                            Estimado(a) <strong>{{requesterName}}</strong>,
                        </p>
                        <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.5;">
                            El estado de su ticket de soporte <strong>{{consecutive}}</strong> ha sido actualizado a: <span style="font-weight: bold; padding: 2px 8px; border-radius: 4px; background-color: #dbeafe; color: #1e40af;">{{status}}</span>
                        </p>
                        
                        <h3 style="color: #1e3a8a; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px;">Resumen del Ticket</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                            <tr style="background-color: #f8fafc;">
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569; width: 35%;">Consecutivo</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: bold;">{{consecutive}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Asunto</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b;">{{subject}}</td>
                            </tr>
                            <tr style="background-color: #f8fafc;">
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Estado Actual</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: bold;">{{status}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Técnico Asignado</td>
                                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: 500;">{{assigneeName}}</td>
                            </tr>
                        </table>
                        
                        {{partsTable}}
                        
                        {{consumablesTable}}
                        
                        <h3 style="color: #1e3a8a; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px;">Historial de Cambios y Auditoría (ISO 9001)</h3>
                        <div style="margin-bottom: 25px;">
                            {{historyTable}}
                        </div>
                        
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                            <a href="{{baseAppUrl}}/dashboard/tickets" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                                Ver Detalles del Ticket
                            </a>
                        </div>
                        
                        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; text-align: center;">
                            <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                                Documento de Control Interno generado automáticamente. Trazabilidad ISO 9001.
                            </p>
                        </div>
                    </div>
                </div>
            `,
            telegram: '🔄 <b>TICKET ACTUALIZADO</b>\n\nTicket: <b>{{consecutive}}</b>\nAsunto: <b>{{subject}}</b>\nNuevo Estado: <b>{{status}}</b>\nAsignado a: <b>{{assigneeName}}</b>',
            internal: 'Ticket {{consecutive}} actualizado a estado {{status}}'
        },
        {
            eventId: 'onCollectAssigned',
            subject: '📦 Recolecta Asignada a Ruta - Consecutivo #{{consecutivo}}',
            body: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); overflow: hidden; border: 1px solid #f3f4f6;">
                        <div style="background: linear-gradient(135deg, #6b21a8 0%, #a855f7 100%); padding: 30px; text-align: center; color: #ffffff;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">Clic Logistics</h1>
                            <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Asignación de Solicitud de Recolecta</p>
                        </div>
                        <div style="padding: 30px;">
                            <div style="text-align: center; margin-bottom: 25px;">
                                <span style="display: inline-flex; align-items: center; padding: 6px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600; color: #a855f7; background-color: #f3e8ff; border: 1px solid #e9d5ff;">
                                    📦 En Ruta de Recolección
                                </span>
                            </div>
                            <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #111827; text-align: center;">
                                La solicitud de recolecta #{{consecutivo}} ha sido asignada
                            </h2>
                            <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin-bottom: 20px; text-align: center;">
                                Hola <strong>{{solicitanteNombre}}</strong>, te informamos que tu solicitud para recolectar mercancía ha sido asignada a la ruta de hoy.
                            </p>
                            <div style="border-top: 1px solid #f3f4f6; border-bottom: 1px solid #f3f4f6; padding: 20px 0; margin-bottom: 20px;">
                                <table style="width: 100%; font-size: 14px; border-collapse: collapse; line-height: 1.8;">
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280; width: 35%;">Proveedor:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 600;">{{proveedor}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Orden de Compra:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{ordenCompra}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Factura:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{factura}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Método de Pago:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500; text-transform: uppercase;">{{metodoPago}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Contacto Proveedor:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{contactoNombre}} ({{contactoTelefono}})</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Lugar de Entrega:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{lugarEntrega}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Horario:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{horarioProveedor}}</td>
                                    </tr>
                                    <tr style="border-top: 1px dashed #f3f4f6; margin-top: 8px;">
                                        <td style="padding: 8px 0 4px 0; color: #6b7280;">Ruta Asignada:</td>
                                        <td style="padding: 8px 0 4px 0; color: #111827; font-weight: 600; color: #6b21a8;">{{rutaNombre}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Chofer:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{choferNombre}} (Placa: {{vehiculoPlaca}})</td>
                                    </tr>
                                </table>
                            </div>
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="{{whatsappLink}}" style="display: inline-block; background-color: #25d366; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-right: 10px; box-shadow: 0 2px 4px rgba(37, 211, 102, 0.2);">
                                    Abrir WhatsApp Contacto
                                </a>
                            </div>
                        </div>
                        <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af;">
                            <p style="margin: 0 0 5px 0;">Este es un correo automático generado por Clic-Tools.</p>
                            <p style="margin: 0;">Por favor no respondas a este correo. Todos los derechos reservados &copy; 2026.</p>
                        </div>
                    </div>
                </div>
            `,
            telegram: '📦 <b>RECOLECTA ASIGNADA</b>\n\nConsecutivo: <b>{{consecutivo}}</b>\nProveedor: <b>{{proveedor}}</b>\nChofer: <b>{{choferNombre}}</b>\nRuta: <b>{{rutaNombre}}</b>\nContacto: <b>{{contactoNombre}}</b>\nWhatsApp: {{whatsappLink}}',
            internal: 'Recolecta {{consecutivo}} para {{proveedor}} asignada a la ruta {{rutaNombre}}'
        },
        {
            eventId: 'onCollectUpdate',
            subject: '📦 Recolecta {{estadoLabel}} - {{proveedor}} - Consecutivo #{{consecutivo}}',
            body: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); overflow: hidden; border: 1px solid #f3f4f6;">
                        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 30px; text-align: center; color: #ffffff;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">Clic Logistics</h1>
                            <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Resultado de Solicitud de Recolecta</p>
                        </div>
                        <div style="padding: 30px;">
                            <div style="text-align: center; margin-bottom: 25px;">
                                <span style="display: inline-flex; align-items: center; padding: 6px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600; color: #1e3a8a; background-color: #eff6ff; border: 1px solid #bfdbfe;">
                                    📦 Estado: {{estadoLabel}}
                                </span>
                            </div>
                            <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #111827; text-align: center;">
                                Reporte de recolecta del proveedor {{proveedor}}
                            </h2>
                            <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin-bottom: 20px; text-align: center;">
                                Hola <strong>{{solicitanteNombre}}</strong>, te informamos sobre el resultado de tu solicitud consecutivo <strong>#{{consecutivo}}</strong>.
                            </p>
                            <div style="border-top: 1px solid #f3f4f6; border-bottom: 1px solid #f3f4f6; padding: 20px 0; margin-bottom: 20px;">
                                <table style="width: 100%; font-size: 14px; border-collapse: collapse; line-height: 1.8;">
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280; width: 35%;">Consecutivo:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 600;">#{{consecutivo}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Proveedor:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 600;">{{proveedor}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Orden de Compra:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{ordenCompra}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Factura:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{factura}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Chofer:</td>
                                        <td style="padding: 4px 0; color: #111827; font-weight: 500;">{{choferNombre}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280;">Estado Reportado:</td>
                                        <td style="padding: 4px 0; color: #1e3a8a; font-weight: 700;">{{estadoLabel}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #6b7280; vertical-align: top;">Comentario Chofer:</td>
                                        <td style="padding: 4px 0; color: #b91c1c; font-weight: 500; font-style: italic;">{{comentarioChofer}}</td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                        <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af;">
                            <p style="margin: 0 0 5px 0;">Este es un correo automático generado por Clic-Tools.</p>
                            <p style="margin: 0;">Por favor no respondas a este correo. Todos los derechos reservados &copy; 2026.</p>
                        </div>
                    </div>
                </div>
            `,
            telegram: '📦 <b>RECOLECTA {{estadoLabel}}</b>\n\nConsecutivo: <b>{{consecutivo}}</b>\nProveedor: <b>{{proveedor}}</b>\nChofer: <b>{{choferNombre}}</b>\nComentario: <i>{{comentarioChofer}}</i>',
            internal: 'Recolecta {{consecutivo}} para {{proveedor}} reportada como {{estadoLabel}}'
        },
        {
            eventId: 'onDeliveryRetry',
            subject: '↩️ Devolución de Entrega: Documento {{documento_numero}}',
            body: `
                <div class="printable-boleta" style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 25px; border: 2px solid #cbd5e1; border-radius: 8px; background-color: #ffffff; color: #1e293b; box-sizing: border-box;">
                    <style>
                        @media print {
                            body * { display: none; }
                            .printable-boleta, .printable-boleta * { display: block !important; }
                            .printable-boleta { border: none !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; }
                            .no-print { display: none !important; }
                        }
                    </style>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr>
                            <td style="vertical-align: top; width: 50%;">
                                <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #b91c1c; text-transform: uppercase; letter-spacing: 0.5px;">DEVOLUCIÓN DE ENTREGA</h1>
                                <p style="margin: 3px 0; font-size: 12px; color: #64748b; font-weight: 600;">MERCANCÍA DEVUELTA AL TALLER / BODEGA</p>
                                <div style="margin-top: 10px; font-size: 11px; color: #475569; line-height: 1.4;">
                                    <strong>Clic-Tools Logistics</strong><br>
                                    San José, Costa Rica<br>
                                    Teléfono: +506 4000-0000 | soporte@empresa.com
                                </div>
                            </td>
                            <td style="vertical-align: top; text-align: right; width: 50%;">
                                <div style="display: inline-block; border: 1.5px solid #b91c1c; border-radius: 6px; padding: 12px 20px; background-color: #fef2f2; text-align: left; min-width: 220px;">
                                    <div style="font-size: 11px; font-weight: 700; color: #b91c1c; text-transform: uppercase; margin-bottom: 4px;">DOCUMENTO NÚMERO</div>
                                    <div style="font-size: 18px; font-weight: 900; color: #b91c1c; font-family: monospace;">{{documento_numero}}</div>
                                    <div style="border-top: 1px solid #fee2e2; margin-top: 8px; padding-top: 8px; font-size: 10px; color: #7f1d1d;">
                                        <strong>Fecha Devolución:</strong> {{fecha}}<br>
                                        <strong>Ruta:</strong> {{ruta_nombre}}<br>
                                        <strong>Chofer:</strong> {{chofer_nombre}}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </table>

                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; color: #475569; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Información del Cliente</h3>
                        <table style="width: 100%; font-size: 12px; border-collapse: collapse; line-height: 1.6;">
                            <tr>
                                <td style="width: 15%; color: #64748b; font-weight: bold;">Cliente:</td>
                                <td style="width: 50%; font-weight: bold; color: #0f172a;">{{cliente_nombre}} ({{cliente_id}})</td>
                                <td style="width: 15%; color: #64748b; font-weight: bold;">Ubicación:</td>
                                <td style="width: 20%; color: #0f172a;">{{lugar_entrega}}</td>
                            </tr>
                            <tr>
                                <td style="color: #64748b; font-weight: bold;">Contacto:</td>
                                <td style="color: #0f172a;">{{contacto_nombre}}</td>
                                <td style="color: #64748b; font-weight: bold;">Teléfono:</td>
                                <td style="color: #0f172a;">{{contacto_telefono}}</td>
                            </tr>
                        </table>
                    </div>

                    <div style="margin-bottom: 25px;">
                        <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; color: #475569; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Detalle y Motivo de la Devolución</h3>
                        <div style="border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                                <thead>
                                    <tr style="background-color: #b91c1c; color: #ffffff;">
                                        <th style="padding: 10px; font-weight: bold;">Motivo Reportado por el Conductor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style="padding: 15px; line-height: 1.6; color: #0f172a; font-family: monospace; font-size: 13px; background-color: #fff; white-space: pre-wrap;">{{motivo_devolucion}}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style="font-size: 11px; color: #64748b; line-height: 1.5; margin-bottom: 35px; border-left: 3.5px solid #b91c1c; padding-left: 10px;">
                        <strong>Nota Administrativa:</strong><br>
                        Este documento registra el retorno físico de la mercancía correspondiente al pedido a nuestras bodegas de origen. Se procederá con la anulación del despacho y/o la generación de la nota de crédito respectiva según políticas vigentes.
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-top: 40px; font-size: 11px;">
                        <tr>
                            <td style="width: 45%; text-align: center; vertical-align: bottom;">
                                <div style="border-bottom: 1px solid #475569; width: 80%; margin: 0 auto 8px auto;"></div>
                                <strong style="color: #0f172a;">Firma de Devolución del Cliente</strong><br>
                                Nombre: ____________________________<br>
                                Cédula: ____________________________
                            </td>
                            <td style="width: 10%;"></td>
                            <td style="width: 45%; text-align: center; vertical-align: bottom;">
                                <div style="border-bottom: 1px solid #475569; width: 80%; margin: 0 auto 8px auto;"></div>
                                <strong style="color: #0f172a;">Recibido en Bodega / Chofer</strong><br>
                                Nombre: {{chofer_nombre}}<br>
                                Identificación: {{chofer_id}}
                            </td>
                        </tr>
                    </table>
                </div>
            `,
            telegram: '↩️ <b>DEVOLUCIÓN DE DOCUMENTO</b>\n\nDocumento: <b>{{documento_numero}}</b>\nCliente: <b>{{cliente_nombre}}</b>\nChofer: <b>{{chofer_nombre}}</b>\nMotivo: <i>{{motivo_devolucion}}</i>',
            internal: 'Documento {{documento_numero}} devuelto por el chofer. Motivo: {{motivo_devolucion}}'
        },
        {
            eventId: 'onDeliveryPartial',
            subject: '📦 Boleta de Entrega Faltante: Documento {{documento_numero}}',
            body: `
                <div class="printable-boleta" style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 25px; border: 2px solid #cbd5e1; border-radius: 8px; background-color: #ffffff; color: #1e293b; box-sizing: border-box;">
                    <style>
                        @media print {
                            body * { display: none; }
                            .printable-boleta, .printable-boleta * { display: block !important; }
                            .printable-boleta { border: none !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; }
                            .no-print { display: none !important; }
                        }
                    </style>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr>
                            <td style="vertical-align: top; width: 50%;">
                                <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">BOLETA DE ENTREGA</h1>
                                <p style="margin: 3px 0; font-size: 12px; color: #64748b; font-weight: 600;">MATERIALES PENDIENTES / FALTANTE</p>
                                <div style="margin-top: 10px; font-size: 11px; color: #475569; line-height: 1.4;">
                                    <strong>Clic-Tools Logistics</strong><br>
                                    San José, Costa Rica<br>
                                    Teléfono: +506 4000-0000 | soporte@empresa.com
                                </div>
                            </td>
                            <td style="vertical-align: top; text-align: right; width: 50%;">
                                <div style="display: inline-block; border: 1.5px solid #0f172a; border-radius: 6px; padding: 12px 20px; background-color: #f8fafc; text-align: left; min-width: 220px;">
                                    <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">DOCUMENTO NÚMERO</div>
                                    <div style="font-size: 18px; font-weight: 900; color: #0f172a; font-family: monospace;">{{documento_numero}}</div>
                                    <div style="border-top: 1px solid #cbd5e1; margin-top: 8px; padding-top: 8px; font-size: 10px; color: #64748b;">
                                        <strong>Fecha Emisión:</strong> {{fecha}}<br>
                                        <strong>Ruta:</strong> {{ruta_nombre}}<br>
                                        <strong>Chofer:</strong> {{chofer_nombre}}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </table>

                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; color: #475569; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Información del Cliente</h3>
                        <table style="width: 100%; font-size: 12px; border-collapse: collapse; line-height: 1.6;">
                            <tr>
                                <td style="width: 15%; color: #64748b; font-weight: bold;">Cliente:</td>
                                <td style="width: 50%; font-weight: bold; color: #0f172a;">{{cliente_nombre}} ({{cliente_id}})</td>
                                <td style="width: 15%; color: #64748b; font-weight: bold;">Ubicación:</td>
                                <td style="width: 20%; color: #0f172a;">{{lugar_entrega}}</td>
                            </tr>
                            <tr>
                                <td style="color: #64748b; font-weight: bold;">Contacto:</td>
                                <td style="color: #0f172a;">{{contacto_nombre}}</td>
                                <td style="color: #64748b; font-weight: bold;">Teléfono:</td>
                                <td style="color: #0f172a;">{{contacto_telefono}}</td>
                            </tr>
                        </table>
                    </div>

                    <div style="margin-bottom: 25px;">
                        <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; color: #475569; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Detalle del Pendiente a Entregar</h3>
                        <div style="border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                                <thead>
                                    <tr style="background-color: #0f172a; color: #ffffff;">
                                        <th style="padding: 10px; font-weight: bold;">Descripción de Productos / Líneas Incompletas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style="padding: 15px; line-height: 1.6; color: #0f172a; font-family: monospace; font-size: 13px; background-color: #fff; white-space: pre-wrap;">{{motivo_incompleto}}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style="font-size: 11px; color: #64748b; line-height: 1.5; margin-bottom: 35px; border-left: 3.5px solid #0f172a; padding-left: 10px;">
                        <strong>Nota de Compromiso de Entrega:</strong><br>
                        Este documento constituye una constancia de los artículos no entregados correspondientes al pedido original. El transportista y la empresa se comprometen a reprogramar y completar la entrega física de este saldo pendiente a la brevedad.
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-top: 40px; font-size: 11px;">
                        <tr>
                            <td style="width: 45%; text-align: center; vertical-align: bottom;">
                                <div style="border-bottom: 1px solid #475569; width: 80%; margin: 0 auto 8px auto;"></div>
                                <strong style="color: #0f172a;">Firma de Recibido del Cliente</strong><br>
                                Nombre: ____________________________<br>
                                Cédula: ____________________________
                            </td>
                            <td style="width: 10%;"></td>
                            <td style="width: 45%; text-align: center; vertical-align: bottom;">
                                <div style="border-bottom: 1px solid #475569; width: 80%; margin: 0 auto 8px auto;"></div>
                                <strong style="color: #0f172a;">Entregado por / Chofer Autorizado</strong><br>
                                Nombre: {{chofer_nombre}}<br>
                                Identificación: {{chofer_id}}
                            </td>
                        </tr>
                    </table>
                </div>
            `,
            telegram: '📦 <b>ENTREGA PARCIAL DETECTADA</b>\n\nDocumento: <b>{{documento_numero}}</b>\nCliente: <b>{{cliente_nombre}}</b>\nChofer: <b>{{chofer_nombre}}</b>\nFaltantes: <i>{{motivo_incompleto}}</i>',
            internal: 'Documento {{documento_numero}} reportado como incompleto. Faltantes: {{motivo_incompleto}}'
        }
    ];

    const insertTemplate = db.prepare(`
        INSERT INTO ${CORE_TABLE_NAMES.notificationTemplates} (eventId, subject, body, telegram, internal)
        VALUES (@eventId, @subject, @body, @telegram, @internal)
        ON CONFLICT(eventId) DO UPDATE SET
            subject = excluded.subject,
            body = excluded.body,
            telegram = excluded.telegram,
            internal = excluded.internal
    `);

    for (const t of templates) {
        insertTemplate.run(t);
    }

    // 2. Default Scheduled Tasks (check existence first to avoid duplicates since the table has no UNIQUE constraint)
    const exists = db.prepare(`SELECT 1 FROM ${CORE_TABLE_NAMES.notificationScheduledTasks} WHERE taskId = ?`).get('fleet-audit');
    if (!exists) {
        db.prepare(`
            INSERT INTO ${CORE_TABLE_NAMES.notificationScheduledTasks} (name, schedule, taskId, enabled)
            VALUES ('Auditoría Diaria de Flota', '0 8 * * *', 'fleet-audit', 1)
        `).run();
    }

    const existsFuel = db.prepare(`SELECT 1 FROM ${CORE_TABLE_NAMES.notificationScheduledTasks} WHERE taskId = ?`).get('fleet-weekly-fuel');
    if (!existsFuel) {
        db.prepare(`
            INSERT INTO ${CORE_TABLE_NAMES.notificationScheduledTasks} (name, schedule, taskId, enabled)
            VALUES ('Reporte Semanal de Combustible', '0 7 * * 1', 'fleet-weekly-fuel', 1)
        `).run();
    }

    const existsAlerts = db.prepare(`SELECT 1 FROM ${CORE_TABLE_NAMES.notificationScheduledTasks} WHERE taskId = ?`).get('fleet-alerts-summary');
    if (!existsAlerts) {
        db.prepare(`
            INSERT INTO ${CORE_TABLE_NAMES.notificationScheduledTasks} (name, schedule, taskId, enabled)
            VALUES ('Resumen de Alertas de Flota', '0 8 * * 1', 'fleet-alerts-summary', 1)
        `).run();
    }
}


// Configs
export async function getNotificationConfig(service: string) {
    const db = await getDb();
    const row = db.prepare(`SELECT config FROM ${CORE_TABLE_NAMES.notificationConfigs} WHERE service = ?`).get(service) as any;
    return row ? JSON.parse(row.config) : {};
}

export async function saveNotificationConfig(service: string, config: any) {
    await authorizeAction('admin:settings:automations');
    const db = await getDb();
    db.prepare(`
        INSERT INTO ${CORE_TABLE_NAMES.notificationConfigs} (service, config)
        VALUES (?, ?)
        ON CONFLICT(service) DO UPDATE SET config = excluded.config
    `).run(service, JSON.stringify(config));
}

// Internal Notifications (Bell)
export async function createInternalNotification(notif: any) {
    const db = await getDb();
    db.prepare(`
        INSERT INTO ${CORE_TABLE_NAMES.notifications} (userId, message, href, timestamp, entityId, entityType)
        VALUES (@userId, @message, @href, @timestamp, @entityId, @entityType)
    `).run({
        ...notif,
        timestamp: new Date().toISOString()
    });
}
