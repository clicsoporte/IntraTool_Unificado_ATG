'use server';

import * as db from './db';
import { revalidatePath } from 'next/cache';
import { sendTelegramMessage } from './telegram-service';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { runSystemAudits } from './scheduler';
import { getDb } from '@/modules/core/lib/db';
import { CORE_TABLE_NAMES } from '@/modules/core/lib/schema';
import { sendEmail } from '@/modules/core/lib/email-service';

export async function runSystemAuditsAction() {
    return runSystemAudits();
}

export async function getAllNotificationRules() {
    return db.getAllNotificationRules();
}

export async function saveNotificationRule(rule: any) {
    await db.saveNotificationRule(rule);
    revalidatePath('/dashboard/admin/automations');
}

export async function deleteNotificationRule(id: number) {
    await db.deleteNotificationRule(id);
    revalidatePath('/dashboard/admin/automations');
}

export async function getAllNotificationTemplates() {
    return db.getAllNotificationTemplates();
}

export async function saveNotificationTemplate(template: any) {
    await db.saveNotificationTemplate(template);
    revalidatePath('/dashboard/admin/automations');
}

export async function getAllScheduledTasks() {
    return db.getAllScheduledTasks();
}

export async function saveScheduledTask(task: any) {
    await db.saveScheduledTask(task);
    revalidatePath('/dashboard/admin/automations');
}

export async function deleteScheduledTask(id: number) {
    await db.deleteScheduledTask(id);
    revalidatePath('/dashboard/admin/automations');
}

export async function getNotificationServiceSettings(service: string) {
    return db.getNotificationConfig(service);
}

export async function saveNotificationServiceSettings(service: string, config: any) {
    await db.saveNotificationConfig(service, config[service] || config);
    revalidatePath('/dashboard/admin/automations');
}

export async function testTelegram(chatId: string) {
    try {
        await sendTelegramMessage("🤖 *Prueba de Sistema*\n\nConexión establecida correctamente con Clic-Tools.", chatId);
        return { success: true, message: "Mensaje enviado." };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}

export async function fetchTelegramChatId() {
    try {
        const config = await db.getNotificationConfig('telegram');
        if (!config.botToken) throw new Error("Bot token no configurado.");
        
        const res = await fetch(`https://api.telegram.org/bot${config.botToken}/getUpdates`);
        const data = await res.json();
        
        if (data.result && data.result.length > 0) {
            const lastMsg = data.result[data.result.length - 1].message;
            return { id: String(lastMsg.chat.id), name: lastMsg.chat.title || lastMsg.chat.first_name };
        }
        throw new Error("No se encontraron mensajes recientes. Envía un mensaje al bot primero.");
    } catch (e: any) {
        throw new Error(e.message);
    }
}

export async function testNotificationRule(ruleId: number) {
    try {
        const dbInstance = await getDb();
        
        // 1. Obtener la regla
        const rules = await db.getAllNotificationRules();
        const rule = rules.find(r => r.id === ruleId);
        
        if (!rule) {
            return { success: false, message: `No se encontró la regla de notificación con ID: ${ruleId}` };
        }
        
        // 2. Obtener la plantilla asociada al evento
        const template = dbInstance.prepare(`SELECT * FROM ${CORE_TABLE_NAMES.notificationTemplates} WHERE eventId = ?`).get(rule.event) as {
            subject: string;
            body: string;
            telegram: string;
            internal: string;
        } | undefined;
        
        if (!template) {
            return { success: false, message: `No se encontró plantilla configurada para el evento: ${rule.event}` };
        }
        
        // 3. Generar un payload de datos falsos realista
        const payload = getMockPayloadForEvent(rule.event);
        
        // 4. Aplicar el motor de plantillas
        const finalSubject = rule.subject || applyTemplate(template.subject, payload);
        const finalBody = applyTemplate(template.body, payload);
        const finalTelegram = applyTemplate(template.telegram, payload);
        
        const processedRecipients = rule.recipients.filter(Boolean);
        if (processedRecipients.length === 0) {
            return { success: false, message: `La regla no tiene destinatarios configurados.` };
        }
        
        // 5. Despachar según la acción de la regla
        if (rule.action === 'sendEmail') {
            await sendEmail({
                to: processedRecipients,
                subject: `[PRUEBA MANUAL] ${finalSubject}`,
                html: finalBody
            });
            await logInfo(`Prueba manual: Email enviado para regla ${ruleId}`);
            return { success: true, message: `Prueba enviada por correo electrónico a: ${processedRecipients.join(', ')}` };
        } else if (rule.action === 'sendTelegram') {
            for (const chatId of processedRecipients) {
                await sendTelegramMessage(`🤖 <b>[PRUEBA MANUAL]</b>\n\n${finalTelegram}`, chatId);
            }
            await logInfo(`Prueba manual: Telegram enviado para regla ${ruleId}`);
            return { success: true, message: `Prueba enviada por Telegram a: ${processedRecipients.join(', ')}` };
        }
        
        return { success: false, message: `Acción '${rule.action}' no soportada en pruebas.` };
    } catch (error: any) {
        await logError('Error en testNotificationRule', { ruleId, error: error.message });
        return { success: false, message: `Error al procesar la prueba: ${error.message}` };
    }
}

function applyTemplate(template: string, payload: Record<string, unknown>): string {
    if (!template) return '';
    
    // 1. Process IF blocks: {{#if field}}content{{/if}}
    const processed = template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, field, content) => {
        return !!payload[field] ? content : '';
    });

    // 2. Process standard placeholders: {{field}}
    return processed.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const val = payload[key];
        if (val === undefined || val === null) return match;
        
        if (typeof val === 'number') {
            return val.toLocaleString();
        }
        
        return String(val);
    });
}

function getMockPayloadForEvent(eventId: string): Record<string, any> {
    switch (eventId) {
        case 'onFleetWeeklyFuelReport':
            return {
                startDate: '11/05/2026',
                endDate: '17/05/2026',
                totalLiters: '284.0',
                totalCost: '157,144',
                avgCostPerLiter: '553.3',
                avgEfficiency: '440.14',
                consolidatedTable: `
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-family: Arial, sans-serif; font-size: 13px; color: #2d3748; border: 1px solid #edf2f7; border-radius: 6px;">
                        <thead>
                            <tr style="background-color: #f7fafc; border-bottom: 2px solid #edf2f7; color: #718096; text-transform: uppercase; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">
                                <th style="padding: 12px 15px; text-align: left;">Vehículo</th>
                                <th style="padding: 12px 15px; text-align: left;">Marca / Estilo</th>
                                <th style="padding: 12px 15px; text-align: right;">Odómetro Máx (km)</th>
                                <th style="padding: 12px 15px; text-align: right;">Litros</th>
                                <th style="padding: 12px 15px; text-align: right;">Inversión</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid #edf2f7;">
                                <td style="padding: 12px 15px; font-weight: bold; color: #1a365d; text-align: left;">GP-1035</td>
                                <td style="padding: 12px 15px; color: #4a5568; text-align: left;">Toyota Hilux</td>
                                <td style="padding: 12px 15px; text-align: right; color: #4a5568;">125,000</td>
                                <td style="padding: 12px 15px; text-align: right; font-weight: bold; color: #3182ce;">284.00 L</td>
                                <td style="padding: 12px 15px; text-align: right; font-weight: bold; color: #2d3748;">¢157,144</td>
                            </tr>
                        </tbody>
                    </table>
                `,
                fuelListTelegram: `🚗 <b>GP-1035</b> (Toyota Hilux)\n├ Odómetro Máx: <b>125,000 km</b>\n├ Litros: <b>284.00 L</b>\n└ Inversión: <b>¢157,144</b>\n\n`
            };
        case 'onFleetAlertsSummary':
            return {
                totalAlerts: '2',
                outOfServiceCount: '0',
                mechanicalAlertsCount: '0',
                legalAlertsCount: '2',
                alertsCount: '2',
                inTallerCount: '0',
                alertsTable: `
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-family: Arial, sans-serif; font-size: 13px; color: #2d3748; border: 1px solid #edf2f7; border-radius: 6px;">
                        <thead>
                            <tr style="background-color: #f8fafc; border-bottom: 2px solid #edf2f7; color: #718096; text-transform: uppercase; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">
                                <th style="padding: 12px 15px; text-align: left;">Vehículo</th>
                                <th style="padding: 12px 15px; text-align: left;">Marca / Estilo</th>
                                <th style="padding: 12px 15px; text-align: center;">Estado</th>
                                <th style="padding: 12px 15px; text-align: left;">Alertas Mecánicas</th>
                                <th style="padding: 12px 15px; text-align: left;">Alertas Legales</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid #edf2f7; vertical-align: top;">
                                <td style="padding: 12px 15px; font-weight: bold; color: #742a2a; text-align: left;">GP-1035</td>
                                <td style="padding: 12px 15px; color: #4a5568; text-align: left;">Toyota Hilux</td>
                                <td style="padding: 12px 15px; text-align: center;">
                                    <span style="display: inline-block; padding: 4px 8px; font-size: 10px; font-weight: bold; border-radius: 12px; color: white; background-color: #38a169; whitespace-nowrap;">
                                        Activo
                                    </span>
                                </td>
                                <td style="padding: 12px 15px; text-align: left;"><span style="color: #a0aec0; font-style: italic;">Sin alertas</span></td>
                                <td style="padding: 12px 15px; text-align: left;">
                                    <div style="margin-bottom: 4px; color: #e53e3e; font-weight: 500;">• RTV vence en 15 días</div>
                                    <div style="margin-bottom: 4px; color: #e53e3e; font-weight: 500;">• Permiso Especial: Pesos y Dimensiones vence en 24 días</div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                `,
                alertsListTelegram: `🚗 <b>GP-1035</b> (Toyota Hilux)\n├ Estado: 🟢 <b>Activo</b>\n├ Alertas Mecánicas:\n  • <i>Sin alertas mecánicas</i>\n└ Alertas Legales:\n  • 📄 RTV vence en 15 días\n  • 📄 Permiso Especial: Pesos y Dimensiones vence en 24 días\n\n`
            };
        case 'onFleetMaintenanceDue':
            return {
                plate: 'GP-1035',
                brand: 'Toyota',
                model: 'Hilux',
                progress: '92',
                remaining: '800',
                currentMileage: '124,200',
                odometerUnit: 'km',
                oilChangeInterval: '10,000'
            };
        case 'onFleetPermitExpiring':
            return {
                plate: 'GP-1035',
                permitType: 'Revisión Técnica Vehicular (RTV)',
                expirationDate: '2026-06-05',
                daysLeft: '15'
            };
        case 'onFleetFuelLogAdded':
            return {
                plate: 'GP-1035',
                brand: 'Toyota',
                model: 'Hilux',
                date: '2026-05-20 14:32',
                fuelTypeName: 'Súper',
                mileageBefore: '124,200',
                odometerUnit: 'km',
                liters: '45.0',
                cost: '24,800',
                driverId: 'Juan Pérez',
                userName: 'Admin'
            };
        case 'onFleetMaintenanceLogAdded':
            return {
                plate: 'GP-1035',
                brand: 'Toyota',
                model: 'Hilux',
                type: 'Preventivo',
                description: 'Cambio de pastillas de frenos delanteras',
                mileage: '124,200',
                odometerUnit: 'km',
                cost: '45,000',
                performedBy: 'Taller Automecánica Garend'
            };
        case 'onFleetOdometerAnomaly':
            return {
                plate: 'GP-1035',
                previousMileage: '120,000',
                currentMileage: '115,000',
                diff: '-5,000'
            };
        case 'onNewSuggestion':
            return {
                userName: 'Cliente Externo',
                content: 'Me gustaría que se agregue una opción para exportar reportes en PDF directamente desde el panel principal de flota.'
            };
        case 'onTicketCreated':
            return {
                ticketId: 'T-1024',
                title: 'Falla en visualización del mapa de activos',
                description: 'Al intentar cargar la pestaña de monitoreo en tiempo real, la API de Google Maps retorna un error de autenticación de credenciales.',
                category: 'Soporte Técnico',
                priority: 'Alta',
                status: 'Abierto',
                createdBy: 'Jona Soporte'
            };
        case 'onTicketStatusChanged':
            return {
                ticketId: 'T-1024',
                title: 'Falla en visualización del mapa de activos',
                previousStatus: 'Abierto',
                newStatus: 'En Proceso',
                updatedBy: 'Coordinador IT'
            };
        default:
            return {
                plate: 'GP-1035',
                brand: 'Toyota',
                model: 'Hilux',
                date: '2026-05-20',
                userName: 'Usuario Prueba'
            };
    }
}
