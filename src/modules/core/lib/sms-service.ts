/**
 * Servicio de Envío de SMS a través del Gateway Android (traccar-sms-gateway)
 */

export interface SendSmsParams {
    to: string; // Número de teléfono (ej. "+50688888888" o "88888888")
    message: string;
    gatewayUrl?: string; // URL/IP del teléfono Android Gateway (ej. "http://192.168.1.50:8082")
    gatewayToken?: string; // Token opcional de autenticación
}

export interface SmsSendResult {
    success: boolean;
    error?: string;
    messageId?: string;
}

/**
 * Normaliza un número de celular de Costa Rica
 */
export function formatPhoneNumber(phone: string): string {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('506') && cleaned.length === 11) {
        cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+') && cleaned.length === 8) {
        cleaned = '+506' + cleaned;
    }
    return cleaned;
}

/**
 * Despacha un mensaje SMS enviando una petición HTTP al gateway Android Traccar SMS
 */
export async function sendSmsViaGateway(params: SendSmsParams): Promise<SmsSendResult> {
    const { to, message, gatewayUrl, gatewayToken } = params;

    const formattedTo = formatPhoneNumber(to);
    if (!formattedTo) {
        return { success: false, error: 'Número de teléfono de destino no válido' };
    }

    if (!message || message.trim().length === 0) {
        return { success: false, error: 'El mensaje SMS no puede estar vacío' };
    }

    const targetUrl = gatewayUrl || process.env.SMS_GATEWAY_URL || 'http://127.0.0.1:8082';

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (gatewayToken || process.env.SMS_GATEWAY_TOKEN) {
            headers['Authorization'] = gatewayToken || process.env.SMS_GATEWAY_TOKEN || '';
        }

        // Estándar HTTP Traccar SMS Gateway POST /send o POST /
        const resp = await fetch(`${targetUrl.replace(/\/$/, '')}/send`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                to: formattedTo,
                message: message
            }),
            signal: AbortSignal.timeout(5000) // 5s timeout máximo
        });

        if (resp.ok) {
            const resData = await resp.json().catch(() => ({}));
            return {
                success: true,
                messageId: resData.id || resData.messageId || 'sent'
            };
        } else {
            const errText = await resp.text().catch(() => '');
            return {
                success: false,
                error: `Error HTTP ${resp.status} en SMS Gateway: ${errText || resp.statusText}`
            };
        }
    } catch (e: any) {
        return {
            success: false,
            error: `Excepción de red al conectar con SMS Gateway (${targetUrl}): ${e.message || String(e)}`
        };
    }
}
