"use server";

import nodemailer from 'nodemailer';
import { getDb } from './db';
import type { EmailSettings } from '../types';
import { logError, logWarn } from './logger';

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
            } else if (key === 'smtpSecure') {
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
 * Creates a nodemailer transporter based on saved settings.
 * @param settings The email settings to use.
 * @returns A nodemailer transporter instance.
 */
function createTransporter(settings: EmailSettings) {
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
        throw new Error("La configuración SMTP está incompleta. Por favor, verifica el host, usuario y contraseña.");
    }
    return nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpSecure, // true for 465, false for other ports
        auth: {
            user: settings.smtpUser,
            pass: settings.smtpPass,
        },
        tls: {
            // Do not fail on invalid certs for local servers or development environments
            rejectUnauthorized: false
        }
    });
}

/**
 * Sends an email using the configured settings.
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
    const transporter = createTransporter(settings as EmailSettings);

    await transporter.sendMail({
        from: `"${settings.smtpUser}" <${settings.smtpUser}>`, // sender address
        to: to,
        subject: subject,
        html: html,
    });
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
