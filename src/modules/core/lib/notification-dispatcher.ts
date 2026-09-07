/**
 * Despachador Omnicanal Unificado de Notificaciones (Telegram + SMS Gateway)
 */

import { getDeliverySettings } from '@/modules/operations/lib/actions';
import { sendTelegramMessage } from '@/modules/notifications/lib/telegram-service';
import { sendSmsViaGateway, formatPhoneNumber } from '@/modules/core/lib/sms-service';
import { logInfo, logWarn, logError } from '@/modules/core/lib/logger';

export interface OmnichannelNotificationPayload {
    recipientUserId?: number;
    phone?: string; // Número celular para SMS
    telegramChatId?: string; // Chat ID para Telegram (opcional o de db)
    title?: string;
    message: string;
    notificationType?: 'flota' | 'ruta' | 'incidencia' | 'sistema';
}

export interface DispatcherResult {
    success: boolean;
    telegramSent: boolean;
    smsSent: boolean;
    strategyUsed: string;
    details?: string;
}

/**
 * Despacha una notificación respetando la estrategia omnicanal configurada en Administración
 */
export async function dispatchOmnichannelNotification(
    payload: OmnichannelNotificationPayload
): Promise<DispatcherResult> {
    try {
        const settings = await getDeliverySettings();

        // Estrategias: 'solamente_telegram' (default) | 'solamente_sms' | 'ambos' | 'fallback_sms'
        const strategy = settings.notification_strategy || 'solamente_telegram';
        const smsGatewayUrl = settings.sms_gateway_url || '';
        const smsGatewayToken = settings.sms_gateway_token || '';

        const fullMessage = payload.title ? `*${payload.title}*\n${payload.message}` : payload.message;
        const targetPhone = formatPhoneNumber(payload.phone || '');

        let telegramSent = false;
        let smsSent = false;

        // 1. Estrategia: Solamente Telegram
        if (strategy === 'solamente_telegram') {
            const tgRes = await sendTelegramMessage(fullMessage, payload.telegramChatId || '');
            telegramSent = tgRes.success;
            return {
                success: telegramSent,
                telegramSent,
                smsSent: false,
                strategyUsed: 'solamente_telegram',
                details: telegramSent ? 'Notificación enviada por Telegram' : 'Error al enviar por Telegram'
            };
        }

        // 2. Estrategia: Solamente SMS
        if (strategy === 'solamente_sms') {
            if (!targetPhone) {
                logWarn('OmnichannelDispatcher: No se pudo enviar SMS porque el usuario no tiene teléfono celular en su perfil');
                return {
                    success: false,
                    telegramSent: false,
                    smsSent: false,
                    strategyUsed: 'solamente_sms',
                    details: 'Usuario sin número celular registrado'
                };
            }

            const smsRes = await sendSmsViaGateway({
                to: targetPhone,
                message: fullMessage.replace(/\*/g, ''), // Remover formato markdown de Telegram
                gatewayUrl: smsGatewayUrl,
                gatewayToken: smsGatewayToken
            });

            smsSent = smsRes.success;
            return {
                success: smsSent,
                telegramSent: false,
                smsSent,
                strategyUsed: 'solamente_sms',
                details: smsRes.error || 'SMS enviado con éxito'
            };
        }

        // 3. Estrategia: Ambos en paralelo
        if (strategy === 'ambos') {
            const [tgRes, smsRes] = await Promise.all([
                sendTelegramMessage(fullMessage, payload.telegramChatId || ''),
                targetPhone ? sendSmsViaGateway({
                    to: targetPhone,
                    message: fullMessage.replace(/\*/g, ''),
                    gatewayUrl: smsGatewayUrl,
                    gatewayToken: smsGatewayToken
                }) : Promise.resolve({ success: false, error: 'Sin teléfono celular' })
            ]);

            telegramSent = tgRes.success;
            smsSent = smsRes.success;

            return {
                success: telegramSent || smsSent,
                telegramSent,
                smsSent,
                strategyUsed: 'ambos',
                details: `Telegram: ${telegramSent ? 'OK' : 'Error'}, SMS: ${smsSent ? 'OK' : 'Error'}`
            };
        }

        // 4. Estrategia: Fallback SMS (Telegram primero, si falla o no hay bot => SMS)
        if (strategy === 'fallback_sms') {
            const tgRes = await sendTelegramMessage(fullMessage, payload.telegramChatId || '');
            telegramSent = tgRes.success;

            if (telegramSent) {
                return {
                    success: true,
                    telegramSent: true,
                    smsSent: false,
                    strategyUsed: 'fallback_sms',
                    details: 'Enviado exitosamente por Telegram (Fallback SMS no requerido)'
                };
            }

            // Telegram falló o usuario no registrado -> conmuta a SMS
            if (targetPhone) {
                const smsRes = await sendSmsViaGateway({
                    to: targetPhone,
                    message: fullMessage.replace(/\*/g, ''),
                    gatewayUrl: smsGatewayUrl,
                    gatewayToken: smsGatewayToken
                });

                smsSent = smsRes.success;
                return {
                    success: smsSent,
                    telegramSent: false,
                    smsSent,
                    strategyUsed: 'fallback_sms',
                    details: smsSent ? 'Conmutado a SMS tras fallo en Telegram' : `Fallaron ambos (SMS: ${smsRes.error})`
                };
            }

            return {
                success: false,
                telegramSent: false,
                smsSent: false,
                strategyUsed: 'fallback_sms',
                details: 'Falló Telegram y el usuario no tiene número celular para fallback SMS'
            };
        }

        return {
            success: false,
            telegramSent: false,
            smsSent: false,
            strategyUsed: strategy,
            details: 'Estrategia de notificación no reconocida'
        };
    } catch (e: any) {
        logError('Error en OmnichannelDispatcher:', { error: e?.message || String(e) });
        return {
            success: false,
            telegramSent: false,
            smsSent: false,
            strategyUsed: 'error',
            details: e?.message || String(e)
        };
    }
}

/**
 * Despacha alertas críticas de TI (pérdida de conectividad, caída de servidor, alteración de APK)
 * enviando SMS directo a los números del Departamento de TI configurados en Administración.
 */
export async function dispatchCriticalItAlert(title: string, message: string): Promise<boolean> {
    try {
        const settings = await getDeliverySettings();
        const rawPhones = settings.telefonos_departamento_ti || '';
        const smsGatewayUrl = settings.sms_gateway_url || '';
        const smsGatewayToken = settings.sms_gateway_token || '';

        const phones = rawPhones.split(/[,;]/).map(p => p.trim()).filter(Boolean);
        if (phones.length === 0) {
            logWarn('dispatchCriticalItAlert: No hay teléfonos del Departamento de TI configurados en Administración');
            return false;
        }

        const fullMessage = `🚨 ALERTA CRÍTICA TI: ${title}\n\n${message}`;
        logInfo(`Despachando alerta crítica por SMS a ${phones.length} teléfonos de TI...`);

        const results = await Promise.all(
            phones.map(phone =>
                sendSmsViaGateway({
                    to: phone,
                    message: fullMessage,
                    gatewayUrl: smsGatewayUrl,
                    gatewayToken: smsGatewayToken
                })
            )
        );

        return results.some(r => r.success);
    } catch (e: any) {
        logError('Error al despachar alerta crítica de TI por SMS:', { error: e?.message || String(e) });
        return false;
    }
}

