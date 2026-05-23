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
