import { NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import { logWarn, logError } from '@/modules/core/lib/logger';

export async function GET(request: Request) {
    return handleVersionCheck(request);
}

export async function POST(request: Request) {
    return handleVersionCheck(request);
}

async function handleVersionCheck(request: Request) {
    try {
        const headers = request.headers;
        const fleetAppHeader = headers.get('x-fleet-app') || headers.get('X-Fleet-App');
        const userAgent = headers.get('user-agent') || '';

        // Filtrar bots o escáneres anónimos que no provengan del ecosistema Flutter / ClicDriver
        const isLegitClient = (fleetAppHeader === 'ClicDriver') || userAgent.toLowerCase().includes('dart') || userAgent.toLowerCase().includes('flutter') || userAgent.toLowerCase().includes('okhttp');
        if (!isLegitClient) {
            return NextResponse.json({ success: false, error: 'Bad Request' }, { status: 400 });
        }

        const db = await getDb();
        try { db.prepare("ALTER TABLE fleet_registered_devices ADD COLUMN serial_number TEXT").run(); } catch (_) {}
        try { db.prepare("ALTER TABLE fleet_registered_devices ADD COLUMN imei TEXT").run(); } catch (_) {}
        try { db.prepare("ALTER TABLE fleet_registered_devices ADD COLUMN battery_voltage REAL").run(); } catch (_) {}
        try { db.prepare("ALTER TABLE fleet_registered_devices ADD COLUMN battery_health TEXT").run(); } catch (_) {}
        try { db.prepare("ALTER TABLE fleet_registered_devices ADD COLUMN battery_tech TEXT").run(); } catch (_) {}
        const url = new URL(request.url);
        
        let hwid = url.searchParams.get('hwid') || '';
        let versionName = url.searchParams.get('version_name') || url.searchParams.get('version') || '1.0.0';
        let versionCode = parseInt(url.searchParams.get('version_code') || '1', 10);
        let battery: number | null = url.searchParams.get('battery') ? parseInt(url.searchParams.get('battery')!, 10) : null;
        let deviceName = url.searchParams.get('device_name') || '';
        let installError = url.searchParams.get('install_error') || '';

        // MDM Extended Fields
        let currentLat: number | null = null;
        let currentLng: number | null = null;
        let installedAppsJson: string | null = null;
        let storageFreeMb: number | null = null;
        let storageTotalMb: number | null = null;
        let ramFreeMb: number | null = null;
        let ramTotalMb: number | null = null;
        let batteryTempC: number | null = null;
        let batteryVoltageV: number | null = null;
        let batteryHealth: string | null = null;
        let batteryTech: string | null = null;
        let isCharging: number | null = null;
        let networkType: string | null = null;
        let simCarrier: string | null = null;
        let osVersion: string | null = null;
        let deviceModel: string | null = null;
        let shutdownLat: number | null = null;
        let shutdownLng: number | null = null;
        let isDeviceOwner: number | null = null;
        let serialNumber: string | null = null;
        let imei: string | null = null;
        let phoneNumber: string | null = null;
        let isShutdownEvent = false;
        let shutdownBatteryLevel: number | null = null;
        let body: any = null;

        // If POST with JSON body
        if (request.method === 'POST') {
            try {
                body = await request.json();
                if (body.hwid) hwid = body.hwid;
                if (body.version_name) versionName = body.version_name;
                if (body.version_code) versionCode = parseInt(body.version_code, 10);
                if (body.battery !== undefined) battery = parseInt(body.battery, 10);
                if (body.device_name) deviceName = body.device_name;
                if (body.install_error) installError = body.install_error;

                if (body.lat !== undefined) currentLat = parseFloat(body.lat);
                if (body.lng !== undefined) currentLng = parseFloat(body.lng);
                if (body.installed_apps) installedAppsJson = typeof body.installed_apps === 'string' ? body.installed_apps : JSON.stringify(body.installed_apps);
                if (body.storage_free_mb !== undefined) storageFreeMb = parseInt(body.storage_free_mb, 10);
                if (body.storage_total_mb !== undefined) storageTotalMb = parseInt(body.storage_total_mb, 10);
                if (body.ram_free_mb !== undefined) ramFreeMb = parseInt(body.ram_free_mb, 10);
                if (body.ram_total_mb !== undefined) ramTotalMb = parseInt(body.ram_total_mb, 10);
                if (body.battery_temp !== undefined) batteryTempC = parseFloat(body.battery_temp);
                if (body.battery_voltage !== undefined) batteryVoltageV = parseFloat(body.battery_voltage);
                if (body.battery_health) batteryHealth = body.battery_health.toString();
                if (body.battery_tech) batteryTech = body.battery_tech.toString();
                if (body.is_charging !== undefined) isCharging = body.is_charging ? 1 : 0;
                if (body.network_type) networkType = body.network_type;
                if (body.sim_carrier) simCarrier = body.sim_carrier;
                if (body.phone_number || body.driver_phone) phoneNumber = body.phone_number || body.driver_phone;
                if (body.os_version) osVersion = body.os_version;
                if (body.device_model) deviceModel = body.device_model;
                if (body.is_device_owner !== undefined) isDeviceOwner = body.is_device_owner ? 1 : 0;
                if (body.serial_number || body.serial) serialNumber = body.serial_number || body.serial;
                if (body.imei) imei = body.imei;

                // Shutdown emergency payload
                if (body.is_shutdown_event === true) {
                    isShutdownEvent = true;
                    if (body.lat !== undefined) shutdownLat = parseFloat(body.lat);
                    if (body.lng !== undefined) shutdownLng = parseFloat(body.lng);
                    if (body.battery_level !== undefined) shutdownBatteryLevel = parseInt(body.battery_level, 10);
                }
            } catch (_) {}
        }

        const nowIso = new Date().toISOString();

        if (hwid && hwid.trim().length > 0) {
            const cleanHwid = hwid.trim();
            const existingDev = db.prepare('SELECT hardware_id FROM fleet_registered_devices WHERE hardware_id = ?').get(cleanHwid) as any;

            if (existingDev) {
                if (installError) {
                    db.prepare(`
                        UPDATE fleet_registered_devices 
                        SET last_seen = ?, current_app_version = ?, current_version_code = ?, battery_level = COALESCE(?, battery_level), 
                            install_failed_count = install_failed_count + 1, last_install_error = ?
                        WHERE hardware_id = ?
                    `).run(nowIso, versionName, versionCode, battery, installError, cleanHwid);

                    logWarn(`[OTA Update Failure] Dispositivo HWID ${cleanHwid} reportó error al instalar v${versionName}: ${installError}`);
                } else if (isShutdownEvent || (shutdownLat !== null && shutdownLng !== null)) {
                    const shutdownBattery = shutdownBatteryLevel !== null ? shutdownBatteryLevel : battery;
                    const isManualShutdown = shutdownBattery !== null && shutdownBattery > 15;
                    const shutdownReason = isManualShutdown ? 'manual_user' : (shutdownBattery !== null && shutdownBattery <= 5 ? 'battery_critical' : 'shutdown');

                    db.prepare(`
                        UPDATE fleet_registered_devices
                        SET shutdown_lat = COALESCE(?, shutdown_lat),
                            shutdown_lng = COALESCE(?, shutdown_lng),
                            shutdown_at = ?,
                            shutdown_battery = COALESCE(?, shutdown_battery),
                            shutdown_reason = ?,
                            last_seen = ?
                        WHERE hardware_id = ?
                    `).run(shutdownLat, shutdownLng, nowIso, shutdownBattery, shutdownReason, nowIso, cleanHwid);

                    logWarn(`[🚨 SHUTDOWN EMERGENCY PING] El celular HWID ${cleanHwid} reportó su última ubicación antes de apagarse: (${shutdownLat}, ${shutdownLng}) Batería: ${shutdownBattery}%`);

                    // Despachar alerta instantánea por Telegram si hay chat ID configurado
                    try {
                        const tgSetting = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'mdm_telegram_alerts_chat_id'").get() as any;
                        const alertChatId = tgSetting?.value?.trim();

                        if (alertChatId) {
                            const devInfo = db.prepare(`
                                SELECT d.*, u.name as user_full_name
                                FROM fleet_registered_devices d
                                LEFT JOIN core_users u ON d.last_user_id = u.id
                                WHERE d.hardware_id = ?
                            `).get(cleanHwid) as any;

                            const choferName = devInfo?.user_full_name || devInfo?.last_driver_name || 'Sin Asignar';
                            const phone = devInfo?.phone_number || devInfo?.driver_phone || 'N/D';
                            const devName = devInfo?.device_name || devInfo?.device_model || cleanHwid;
                            const horaLocal = new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });

                            let googleMapsLink = '';
                            if (shutdownLat && shutdownLng) {
                                googleMapsLink = `\n📍 <b>Ubicación:</b> <a href="https://maps.google.com/?q=${shutdownLat},${shutdownLng}">Ver en Google Maps (${shutdownLat}, ${shutdownLng})</a>`;
                            }

                            const motivoTexto = isManualShutdown 
                                ? '🚨 <b>APAGADO MANUAL INTENCIONAL</b> (El chofer apagó el celular teniendo suficiente batería)'
                                : '⚠️ <b>APAGADO POR BATERÍA BAJA</b>';

                            const telegramMsg = `🚨 <b>ALERTA DE DESCONEXIÓN MDM: CELULAR APAGADO</b>\n\n` +
                                `👤 <b>Chofer:</b> ${choferName}\n` +
                                `📱 <b>Línea / Teléfono:</b> ${phone}\n` +
                                `💻 <b>Dispositivo:</b> ${devName} (<code>${cleanHwid}</code>)\n` +
                                `🔋 <b>Nivel de Batería:</b> ${shutdownBattery !== null ? `${shutdownBattery}%` : 'N/D'}\n` +
                                `⏰ <b>Hora:</b> ${horaLocal}\n` +
                                `📋 <b>Diagnóstico:</b> ${motivoTexto}${googleMapsLink}`;

                            const { sendTelegramMessage } = await import('@/modules/notifications/lib/telegram-service');
                            await sendTelegramMessage(telegramMsg, alertChatId).catch((err) => {
                                logWarn(`[Telegram Alert Error] No se pudo enviar alerta de apagado a Telegram: ${err?.message}`);
                            });
                        }
                    } catch (tgErr: any) {
                        logWarn(`[Telegram Alert Error] Error al preparar alerta de apagado: ${tgErr?.message}`);
                    }
                } else {
                    db.prepare(`
                        UPDATE fleet_registered_devices 
                        SET last_seen = ?, current_app_version = ?, current_version_code = ?, battery_level = COALESCE(?, battery_level),
                            current_lat = COALESCE(?, current_lat),
                            current_lng = COALESCE(?, current_lng),
                            installed_apps_json = COALESCE(?, installed_apps_json),
                            storage_free_mb = COALESCE(?, storage_free_mb),
                            storage_total_mb = COALESCE(?, storage_total_mb),
                            ram_free_mb = COALESCE(?, ram_free_mb),
                            ram_total_mb = COALESCE(?, ram_total_mb),
                            battery_temp_c = COALESCE(?, battery_temp_c),
                            battery_voltage = COALESCE(?, battery_voltage),
                            battery_health = COALESCE(?, battery_health),
                            battery_tech = COALESCE(?, battery_tech),
                            is_charging = COALESCE(?, is_charging),
                            network_type = COALESCE(?, network_type),
                            sim_carrier = COALESCE(?, sim_carrier),
                            phone_number = COALESCE(?, phone_number),
                            driver_phone = COALESCE(?, driver_phone),
                            os_version = COALESCE(?, os_version),
                            device_model = COALESCE(?, device_model),
                            is_device_owner = COALESCE(?, is_device_owner),
                            serial_number = COALESCE(?, serial_number),
                            imei = COALESCE(?, imei)
                        WHERE hardware_id = ?
                    `).run(
                        nowIso, versionName, versionCode, battery,
                        currentLat, currentLng, installedAppsJson,
                        storageFreeMb, storageTotalMb, ramFreeMb, ramTotalMb,
                        batteryTempC, batteryVoltageV, batteryHealth, batteryTech, isCharging, networkType, simCarrier,
                        phoneNumber, phoneNumber,
                        osVersion, deviceModel, isDeviceOwner,
                        serialNumber, imei,
                        cleanHwid
                    );
                }
            } else {
                db.prepare(`
                    INSERT INTO fleet_registered_devices 
                    (hardware_id, device_name, last_seen, current_app_version, current_version_code, battery_level, last_install_error,
                     current_lat, current_lng, installed_apps_json, storage_free_mb, storage_total_mb, ram_free_mb, ram_total_mb,
                     battery_temp_c, battery_voltage, battery_health, battery_tech, is_charging, network_type, sim_carrier, phone_number, driver_phone, os_version, device_model, is_device_owner,
                     serial_number, imei)
                    VALUES (?, ?, ?, ?, ?, COALESCE(?, 100), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    cleanHwid, deviceName || 'Celular Android', nowIso, versionName, versionCode, battery, installError || null,
                    currentLat, currentLng, installedAppsJson, storageFreeMb, storageTotalMb, ramFreeMb, ramTotalMb,
                    batteryTempC, batteryVoltageV, batteryHealth, batteryTech, isCharging, networkType, simCarrier, phoneNumber, phoneNumber, osVersion, deviceModel, isDeviceOwner,
                    serialNumber, imei
                );
            }
        }

        // Query official version settings
        const versionSettings = db.prepare('SELECT * FROM ops_app_version_settings WHERE id = 1').get() as any;

        if (!versionSettings) {
            return NextResponse.json({
                has_update: false,
                is_paused: false,
                message: 'No hay versión objetivo declarada en el servidor'
            });
        }

        let deviceOtaPaused = 0;
        let installFailedCount = 0;

        if (hwid && hwid.trim().length > 0) {
            const dev = db.prepare('SELECT ota_paused, install_failed_count FROM fleet_registered_devices WHERE hardware_id = ?').get(hwid.trim()) as any;
            if (dev) {
                deviceOtaPaused = dev.ota_paused || 0;
                installFailedCount = dev.install_failed_count || 0;
            }
        }

        const globalPaused = versionSettings.global_ota_paused || 0;
        const targetVersionCode = versionSettings.version_code || 1;
        const forceUpdate = versionSettings.force_update === 1;

        if (globalPaused === 1 || deviceOtaPaused === 1 || installFailedCount >= 3) {
            return NextResponse.json({
                has_update: false,
                is_paused: true,
                pause_reason: globalPaused === 1 ? 'Distribución OTA pausada globalmente' : deviceOtaPaused === 1 ? 'Actualización pausada para este celular' : 'Máximo de reintentos fallidos alcanzado (3/3)',
                install_failed_count: installFailedCount
            });
        }

        if (targetVersionCode > versionCode) {
            return NextResponse.json({
                has_update: true,
                is_paused: false,
                version_name: versionSettings.version_name,
                version_code: versionSettings.version_code,
                apk_url: versionSettings.apk_url,
                force_update: forceUpdate,
                release_notes: versionSettings.release_notes || 'Nueva actualización disponible',
                install_failed_count: installFailedCount
            });
        }

        // Si el celular ya cuenta con la versión objetivo o superior, auto-limpiar cualquier error previo o reintentos fallidos
        if (hwid && hwid.trim().length > 0) {
            try {
                db.prepare(`
                    UPDATE fleet_registered_devices 
                    SET last_install_error = NULL, install_failed_count = 0 
                    WHERE hardware_id = ?
                `).run(hwid.trim());
            } catch (_) {}
        }

        return NextResponse.json({
            has_update: false,
            is_paused: false,
            version_name: versionName,
            version_code: versionCode,
            message: 'La aplicación está actualizada a la última versión'
        });
    } catch (error: any) {
        logError('Error checking app version endpoint:', error?.message);
        return NextResponse.json({
            has_update: false,
            error: error?.message || 'Error interno del servidor'
        }, { status: 500 });
    }
}
