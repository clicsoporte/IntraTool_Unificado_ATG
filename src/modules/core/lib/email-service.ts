"use server";

import nodemailer from 'nodemailer';
import { getDb } from './db';
import type { EmailSettings } from '../types';
import { logError, logWarn, logInfo } from './logger';

/**
 * Retrieves email settings from the database.
 * @returns The saved email settings or an empty object.
 */
export async function getEmailSettings(): Promise<Partial<EmailSettings>> {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT key, value FROM core_email_settings').all() as { key: string, value: string }[];
        if (rows.length === 0) return {};
        const settings: Partial<EmailSettings> = {};
        for (const row of rows) {
            const key = row.key as keyof EmailSettings;
            if (key === 'smtpPort') {
                settings[key] = Number(row.value);
            } else if (key === 'smtpFallbackPort') {
                settings[key] = Number(row.value);
            } else if (key === 'smtpSecure') {
                settings[key] = row.value === 'true';
            } else if (key === 'smtpFallbackSecure') {
                settings[key] = row.value === 'true';
            } else if (key === 'smtpFallbackEnabled') {
                settings[key] = row.value === 'true';
            } else {
                settings[key] = row.value;
            }
        }
        return settings;
    } catch (error) {
        // If the table doesn't exist, it's not a critical failure, just return empty settings.
        if ((error as Error).message.includes('no such table')) {
            console.warn('core_email_settings table does not exist. Returning empty settings.');
            return {};
        }
        await logError('getEmailSettings', { error: (error as Error).message });
        return {};
    }
}

/**
 * Saves email settings to the database.
 * @param settings The email settings to save.
 */
export async function saveEmailSettings(settings: EmailSettings): Promise<void> {
    const db = await getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO core_email_settings (key, value) VALUES (?, ?)');
    const transaction = db.transaction((s: EmailSettings) => {
        for (const [key, value] of Object.entries(s)) {
            insert.run(key, String(value));
        }
    });
    transaction(settings);
}

/**
 * Creates a nodemailer transporter based on saved settings with optional port/security overrides.
 * @param settings The email settings to use.
 * @param portOverride Optional port override (e.g. for fallback).
 * @param secureOverride Optional secure boolean override.
 * @returns A nodemailer transporter instance.
 */
function createTransporter(settings: EmailSettings, portOverride?: number, secureOverride?: boolean) {
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
        throw new Error("La configuración SMTP está incompleta. Por favor, verifica el host, usuario y contraseña.");
    }
    const finalPort = portOverride !== undefined ? portOverride : (settings.smtpPort || 587);
    const finalSecure = secureOverride !== undefined ? secureOverride : (settings.smtpSecure ?? (finalPort === 465));

    return nodemailer.createTransport({
        host: settings.smtpHost,
        port: finalPort,
        secure: finalSecure, // true for 465, false for 587/25
        auth: {
            user: settings.smtpUser,
            pass: settings.smtpPass,
        },
        connectionTimeout: 7000, // 7s timeout para conexión TCP
        greetingTimeout: 5000,   // 5s timeout para saludo SMTP
        socketTimeout: 10000,    // 10s timeout de inactividad de socket
        tls: {
            // Do not fail on invalid certs for local servers or development environments
            rejectUnauthorized: false
        }
    });
}

/**
 * Sends an email using the configured settings with automatic fallback support.
 * @param options The email options.
 * @param options.to Recipient's email address.
 * @param options.subject The email subject.
 * @param options.html The HTML body of the email.
 */
export async function sendEmail({ to, subject, html }: { to: string | string[], subject: string, html: string }) {
    const settings = await getEmailSettings();
    if (!settings.smtpHost) {
        console.warn("Attempted to send email, but SMTP settings are not configured. Skipping.");
        await logWarn("Email not sent: SMTP settings are missing.");
        return; // Silently fail if not configured
    }

    const fullSettings = settings as EmailSettings;
    const primaryPort = fullSettings.smtpPort || 587;
    const primarySecure = fullSettings.smtpSecure !== undefined ? fullSettings.smtpSecure : (primaryPort === 465);

    // 1. Intento primario
    try {
        const transporter = createTransporter(fullSettings, primaryPort, primarySecure);
        await transporter.sendMail({
            from: `"${fullSettings.smtpUser}" <${fullSettings.smtpUser}>`,
            to: to,
            subject: subject,
            html: html,
        });
        return;
    } catch (primaryError: any) {
        const fallbackEnabled = fullSettings.smtpFallbackEnabled !== false; // Default true si no está explícitamente desactivado
        const fallbackPort = fullSettings.smtpFallbackPort || (primaryPort === 465 ? 587 : 465);
        const fallbackSecure = fullSettings.smtpFallbackSecure !== undefined ? fullSettings.smtpFallbackSecure : (fallbackPort === 465);

        if (!fallbackEnabled || fallbackPort === primaryPort) {
            await logError(`Error enviando correo a [${Array.isArray(to) ? to.join(', ') : to}] en puerto ${primaryPort}: ${primaryError.message}`, {
                host: fullSettings.smtpHost,
                port: primaryPort,
                error: primaryError.message,
                subject
            });
            throw primaryError;
        }

        // Registrar advertencia de conmutación en los logs del sistema
        await logWarn(`Fallo de conexión SMTP en puerto principal ${primaryPort} (${primaryError.message}). Conmutando automáticamente a puerto de contingencia ${fallbackPort}...`, {
            host: fullSettings.smtpHost,
            primaryPort,
            fallbackPort,
            subject
        });

        // 2. Intento de fallback
        try {
            const fallbackTransporter = createTransporter(fullSettings, fallbackPort, fallbackSecure);
            await fallbackTransporter.sendMail({
                from: `"${fullSettings.smtpUser}" <${fullSettings.smtpUser}>`,
                to: to,
                subject: subject,
                html: html,
            });

            await logInfo(`Correo enviado con éxito vía puerto de contingencia ${fallbackPort} a [${Array.isArray(to) ? to.join(', ') : to}]`, {
                host: fullSettings.smtpHost,
                fallbackPort,
                subject
            });
        } catch (fallbackError: any) {
            await logError(`Error crítico en envío de correo: Fallaron puerto principal (${primaryPort}: ${primaryError.message}) y de contingencia (${fallbackPort}: ${fallbackError.message})`, {
                host: fullSettings.smtpHost,
                primaryPort,
                fallbackPort,
                primaryError: primaryError.message,
                fallbackError: fallbackError.message,
                subject
            });
            throw fallbackError;
        }
    }
}

/**
 * Sends a test email to verify SMTP configuration.
 * @param settings The settings to test.
 * @param testRecipientEmails The email addresses to send the test email to.
 */
export async function testEmailSettings(settings: EmailSettings, testRecipientEmails: string[]): Promise<void> {
    const transporter = createTransporter(settings);
    await transporter.sendMail({
        from: `"${settings.smtpUser}" <${settings.smtpUser}>`,
        to: testRecipientEmails.join(','),
        subject: "Correo de Prueba - Clic-Tools",
        html: "<p>¡Hola!</p><p>Este es un correo de prueba para verificar que tu configuración SMTP en Clic-Tools funciona correctamente.</p><p>¡La conexión es exitosa!</p>",
    });
}
