import { NextRequest, NextResponse } from 'next/server';
import { getNotificationConfig } from '@/modules/notifications/lib/db';
import { getEmailSettings } from '@/modules/core/lib/email-service';
import { getCurrentUser } from '@/modules/core/lib/auth';
import nodemailer from 'nodemailer';

export async function GET(req: NextRequest) {
  // [Auth Guard] Administradores o dispositivos móviles registrados
  const hwid = req.headers.get('x-device-hardware-id') || req.headers.get('x-hardware-id');
  const webUser = await getCurrentUser();
  const isDriverOrMobile = Boolean(hwid && hwid.trim().length > 3);

  if (!webUser && !isDriverOrMobile) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    telegram: { ok: false, message: 'No probado', latencyMs: 0 },
    email: { ok: false, message: 'No probado', latencyMs: 0 },
    serverTimestamp: new Date().toISOString(),
  };

  // 1. Probar Telegram Bot API
  const startTelegram = Date.now();
  try {
    const config = await getNotificationConfig('telegram');
    if (!config.botToken) {
      results.telegram = {
        ok: false,
        message: 'Token de Telegram no configurado en servidor',
        latencyMs: Date.now() - startTelegram,
      };
    } else {
      const tgRes = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`, {
        method: 'GET',
        signal: AbortSignal.timeout(6000),
      });
      const tgData = await tgRes.json();
      results.telegram = {
        ok: tgData.ok === true,
        message: tgData.ok ? `Bot: @${tgData.result?.username || 'Activo'}` : (tgData.description || 'Error de autenticación Telegram'),
        latencyMs: Date.now() - startTelegram,
      };
    }
  } catch (error: any) {
    results.telegram = {
      ok: false,
      message: `Fallo de conexión Telegram: ${error.message}`,
      latencyMs: Date.now() - startTelegram,
    };
  }

  // 2. Probar Servidor de Correo (SMTP)
  const startEmail = Date.now();
  try {
    const emailSettings = await getEmailSettings();
    if (!emailSettings.smtpHost || !emailSettings.smtpUser) {
      results.email = {
        ok: false,
        message: 'Configuración SMTP incompleta en servidor',
        latencyMs: Date.now() - startEmail,
      };
    } else {
      const transporter = nodemailer.createTransport({
        host: emailSettings.smtpHost,
        port: emailSettings.smtpPort || 587,
        secure: emailSettings.smtpSecure ?? false,
        auth: {
          user: emailSettings.smtpUser,
          pass: emailSettings.smtpPass || '',
        },
        connectionTimeout: 6000,
        greetingTimeout: 5000,
      });

      // Verificar transporte SMTP sin enviar correo real
      await transporter.verify();
      results.email = {
        ok: true,
        message: `Conexión SMTP exitosa (${emailSettings.smtpHost}:${emailSettings.smtpPort || 587})`,
        latencyMs: Date.now() - startEmail,
      };
    }
  } catch (error: any) {
    results.email = {
      ok: false,
      message: `Fallo SMTP: ${error.message}`,
      latencyMs: Date.now() - startEmail,
    };
  }

  return NextResponse.json({
    success: true,
    data: results,
  });
}
