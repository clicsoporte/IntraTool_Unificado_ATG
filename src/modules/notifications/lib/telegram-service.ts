import { getNotificationConfig } from './db';
import { logError } from '@/modules/core/lib/logger';

/**
 * Service to send messages via Telegram Bot API.
 */
export async function sendTelegramMessage(message: string, chatId: string) {
    try {
        const config = await getNotificationConfig('telegram');
        if (!config.botToken) {
            throw new Error('Telegram bot token not configured');
        }

        const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML', // Allow basic HTML styling
                disable_web_page_preview: true
            }),
        });

        const data = await response.json();
        
        if (!data.ok) {
            throw new Error(data.description || 'Failed to send Telegram message');
        }

        return data;
    } catch (error: any) {
        logError('Telegram Service Error', { error: error.message, chatId });
        throw error;
    }
}
