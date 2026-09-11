import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import { authenticateFleetRequest } from '@/modules/fleet/lib/fleet-auth-guard';

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    
    // Check authenticated user
    let userId: number | null = null;
    try {
      const authResult = await authenticateFleetRequest(req);
      if ('user' in authResult && authResult.user?.userId) {
        userId = authResult.user.userId;
      }
    } catch (_) {}

    if (!userId) {
      try {
        const { searchParams } = new URL(req.url);
        const uParam = searchParams.get('userId') || searchParams.get('user_id');
        if (uParam) userId = Number(uParam);
      } catch (_) {}
    }
    
    // Fetch Tenant / Customer Company Settings from /dashboard/admin/general
    const company = db.prepare('SELECT name, taxId, phone, email, address FROM core_company_settings WHERE id = 1').get() as any;

    // Fetch Operational Settings from /dashboard/admin/operations/deliveries
    const rows = db.prepare('SELECT key, value FROM ops_delivery_settings').all() as { key: string; value: string }[];
    const config: Record<string, string> = {};
    for (const r of rows) {
      config[r.key] = r.value;
    }

    // Override driver-specific boleta consecutive if authenticated
    if (userId) {
      try {
        const driverConsec = db.prepare('SELECT prefix, next_number FROM ops_driver_consecutives WHERE user_id = ?').get(userId) as any;
        if (driverConsec && driverConsec.prefix) {
          config.boleta_consecutive_prefix = driverConsec.prefix;
          config.boleta_consecutive_next = String(driverConsec.next_number || 1);
        } else {
          const user = db.prepare('SELECT name, erpAlias FROM core_users WHERE id = ?').get(userId) as any;
          if (user) {
            const cleanAlias = (user.erpAlias || user.name || 'DRV').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
            config.boleta_consecutive_prefix = `BOL-${cleanAlias}-`;
            config.boleta_consecutive_next = '1';
          }
        }
      } catch (_) {}
    }

    // Fetch breakdown types catalog from /dashboard/admin/fleet
    let breakdownRows: { value: string }[] = [];
    try {
      breakdownRows = db.prepare("SELECT value FROM fleet_settings WHERE category = 'breakdown_type' ORDER BY value ASC").all() as { value: string }[];
    } catch (_) {}

    const breakdownTypes = breakdownRows.map(b => b.value);
    if (breakdownTypes.length === 0) {
      breakdownTypes.push('Mecánica', 'Eléctrica', 'Llantas / Neumáticos', 'Frenos', 'Transmisión', 'Motor', 'Fuga de Aceite', 'Accidente / Colisión', 'Climatización / AC', 'Otro');
    }

    const defaultConfig = {
      bot_require_evidence_photo: '0',
      bot_require_invoice_photo: '0',
      bot_ask_location: '1',
      bot_location_mandatory: '0',
      bot_ask_next_client: '1',
      bot_next_client_mandatory: '0',
      boleta_consecutive_prefix: 'BOL-',
      boleta_consecutive_next: '1',
      incidencia_consecutive_prefix: 'INC-',
      devolucion_consecutive_prefix: 'DEV-',
      driver_boleta_paper_size: '80mm',
      fleet_tracking_source: 'hybrid',
      fleet_primary_gps_source: 'phone',
      fleet_fallback_gps_source: 'navixy',
      allow_driver_revert_delivery: '1',
      delivery_mode: 'avanzado',
      apk_latest_version: '1.0.2',
      apk_require_evidence_photo: 'disabled',
      apk_require_invoice_photo: 'disabled',
      apk_require_signature: 'false',
      apk_require_incident_notes: 'false',
      driver_boleta_print_enabled: 'true',
      release_codes_enabled: 'false',
      apk_print_show_client: 'true',
      apk_print_show_lines: 'true',
      apk_print_bold: 'false',
      apk_print_footer_text: '¡Gracias por preferirnos!\nEl articulo viaja por cuenta y riesgo del cliente.',
      apk_admin_settings_pin: '0000',
      apk_kiosk_enabled: 'false',
      apk_whitelisted_apps: 'com.waze,com.google.android.apps.maps,com.google.android.dialer,com.samsung.android.incallui,com.google.android.contacts,com.android.contacts,com.google.android.apps.photos,com.sec.android.gallery3d,com.google.android.apps.messaging,com.samsung.android.messaging,com.google.android.GoogleCamera,com.android.camera,com.android.camera2,com.sec.android.app.camera,com.google.android.calendar,com.google.android.apps.docs,com.microsoft.teams,com.whatsapp,com.whatsapp.w4b,org.telegram.messenger,net.openvpn.openvpn,com.android.chrome,com.google.android.apps.pdfviewer,com.adobe.reader',
      apk_block_if_gps_off: 'true',
      apk_block_if_bluetooth_off: 'false',
      apk_block_tethering: 'false',
      apk_alert_on_tamper: 'true',
      apk_enable_break_timer: 'true',
      apk_background_sync_minutes: '5',
      break_time_breakfast_min: '15',
      break_time_lunch_min: '45',
      break_time_snack_min: '15',
      ops_enable_gps_tamper_detection: 'true',
      public_ip_api_primary: 'https://api.ipify.org',
      public_ip_api_fallback: 'https://icanhazip.com',
      mdm_telegram_alerts_chat_id: '',
      sms_gateway_it_phones: '',
    };

    // Obtener URLs de alta disponibilidad y versión oficial
    let serverUrlPrimary = '';
    let serverUrlFallback = '';
    try {
      const verRow = db.prepare("SELECT server_url_primary, server_url_fallback FROM ops_app_version_settings WHERE id = 1").get() as any;
      if (verRow?.server_url_primary) serverUrlPrimary = verRow.server_url_primary;
      if (verRow?.server_url_fallback) serverUrlFallback = verRow.server_url_fallback;
    } catch (_) {}

    // Obtener token de Telegram bot si está configurado en el sistema
    let telegramBotToken = '';
    try {
      const tgRow = db.prepare("SELECT config FROM core_notification_configs WHERE service = 'telegram'").get() as any;
      if (tgRow?.config) {
        const tgCfg = JSON.parse(tgRow.config);
        if (tgCfg.botToken) telegramBotToken = tgCfg.botToken;
      }
    } catch (_) {}

    const mergedConfig = {
      ...defaultConfig,
      telegram_bot_token: telegramBotToken,
      ...(serverUrlPrimary ? { server_url_primary: serverUrlPrimary } : {}),
      ...(serverUrlFallback ? { server_url_fallback: serverUrlFallback } : {}),
      ...config,
    };

    // [Security] Omitir claves privadas del sistema e información sensible en endpoint público
    delete (mergedConfig as any).system_jwt_secret;
    delete (mergedConfig as any).agent_secret_key;
    delete (mergedConfig as any).telegram_bot_token;
    delete (mergedConfig as any).apk_admin_settings_pin;

    return NextResponse.json({
      success: true,
      company: {
        name: company?.name || 'EMPRESA CLIENTE S.A.',
        taxId: company?.taxId || '3-101-000000',
        phone: company?.phone || '+506 2000-0000',
        email: company?.email || 'contacto@empresa.com',
        address: company?.address || 'Costa Rica',
      },
      config: mergedConfig,
      breakdownTypes,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
