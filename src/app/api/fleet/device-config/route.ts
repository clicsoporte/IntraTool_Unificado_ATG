import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import { authenticateFleetRequest } from '@/modules/fleet/lib/fleet-auth-guard';

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateFleetRequest(req);
    if ('response' in authResult) {
      return authResult.response;
    }

    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const hardwareId = searchParams.get('hardwareId');

    db.prepare(`
      CREATE TABLE IF NOT EXISTS fleet_registered_devices (
        hardware_id TEXT PRIMARY KEY,
        device_name TEXT,
        last_user_id INTEGER,
        last_driver_name TEXT,
        driver_phone TEXT,
        printer_mac TEXT,
        paper_size TEXT DEFAULT '80mm',
        app_version TEXT DEFAULT '1.0.0',
        server_url_override TEXT,
        custom_config_json TEXT,
        asset_id INTEGER,
        last_seen TEXT NOT NULL
      )
    `).run();

    try {
      db.prepare("ALTER TABLE fleet_registered_devices ADD COLUMN app_version TEXT DEFAULT '1.0.0'").run();
    } catch (_) {}

    if (!hardwareId) {
      return NextResponse.json({ success: false, error: 'hardwareId requerido' }, { status: 400 });
    }

    const device = db.prepare(`SELECT * FROM fleet_registered_devices WHERE hardware_id = ?`).get(hardwareId) as any;

    if (!device) {
      return NextResponse.json({ success: true, registered: false });
    }

    const versionSettings = db.prepare(`SELECT server_url_primary, server_url_fallback FROM ops_app_version_settings WHERE id = 1`).get() as any;

    const response = NextResponse.json({
      success: true,
      registered: true,
      config: {
        hardwareId: device.hardware_id,
        deviceName: device.device_name,
        driverName: device.last_driver_name,
        driverPhone: device.driver_phone,
        printerMac: device.printer_mac,
        paperSize: device.paper_size || '80mm',
        appVersion: device.app_version || '1.0.0',
        serverUrlOverride: device.server_url_override,
        serverUrlPrimary: versionSettings?.server_url_primary || null,
        serverUrlFallback: versionSettings?.server_url_fallback || null,
        assetId: device.asset_id,
        lastSeen: device.last_seen,
        pendingUninstalls: device.mdm_pending_uninstalls ? (() => {
          try {
            const parsed = JSON.parse(device.mdm_pending_uninstalls);
            return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
          } catch (_) {
            return null;
          }
        })() : null,
        pendingReboot: device.mdm_pending_reboot === 1,
        mdm: {
          kioskEnabled: device.mdm_kiosk_enabled === 1,
          forceGps: device.mdm_force_gps !== 0,
          disallowAirplaneMode: device.mdm_disallow_airplane_mode === 1,
          disallowMobileDataOff: device.mdm_disallow_mobile_data_off === 1,
          disallowBatterySaver: device.mdm_disallow_battery_saver === 1,
          blockUninstall: device.mdm_block_uninstall !== 0,
          disallowSettings: device.mdm_disallow_settings === 1,
          disallowTethering: device.mdm_disallow_tethering === 1,
          disallowInstallApps: device.mdm_disallow_install_apps === 1,
          disallowPlayStoreInstall: device.mdm_disallow_play_store_install === 1,
          alwaysOnVpn: device.mdm_always_on_vpn === 1,
          whitelistedPackages: device.mdm_whitelisted_packages ? (() => { 
            try { 
              const parsed = JSON.parse(device.mdm_whitelisted_packages); 
              return Array.isArray(parsed) && parsed.length > 0 ? parsed : null; 
            } catch (_) { 
              return null; 
            } 
          })() : null,
          pinnedApps: device.mdm_pinned_apps ? (() => {
            try {
              const parsed = JSON.parse(device.mdm_pinned_apps);
              return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
            } catch (_) {
              return null;
            }
          })() : null,
        }
      }
    });

    // Limpiar cola de acciones pendientes entregadas
    if (device.mdm_pending_uninstalls || device.mdm_pending_reboot === 1) {
      try {
        db.prepare('UPDATE fleet_registered_devices SET mdm_pending_uninstalls = NULL, mdm_pending_reboot = 0 WHERE hardware_id = ?').run(hardwareId);
      } catch (_) {}
    }

    return response;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateFleetRequest(req);
    if ('response' in authResult) {
      return authResult.response;
    }

    const db = await getDb();
    const body = await req.json();
    const { hardwareId, deviceName, driverName, driverPhone, printerMac, paperSize, appVersion, userId, serverUrlOverride } = body;

    if (!hardwareId) {
      return NextResponse.json({ success: false, error: 'hardwareId es requerido' }, { status: 400 });
    }

    db.prepare(`
      CREATE TABLE IF NOT EXISTS fleet_registered_devices (
        hardware_id TEXT PRIMARY KEY,
        device_name TEXT,
        last_user_id INTEGER,
        last_driver_name TEXT,
        driver_phone TEXT,
        printer_mac TEXT,
        paper_size TEXT DEFAULT '80mm',
        app_version TEXT DEFAULT '1.0.0',
        server_url_override TEXT,
        custom_config_json TEXT,
        asset_id INTEGER,
        last_seen TEXT NOT NULL
      )
    `).run();

    try {
      db.prepare("ALTER TABLE fleet_registered_devices ADD COLUMN app_version TEXT DEFAULT '1.0.0'").run();
    } catch (_) {}

    const now = new Date().toISOString();

    // Upsert into fleet_registered_devices
    db.prepare(`
      INSERT INTO fleet_registered_devices (
        hardware_id, device_name, last_user_id, last_driver_name,
        driver_phone, printer_mac, paper_size, app_version, server_url_override, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(hardware_id) DO UPDATE SET
        device_name = COALESCE(excluded.device_name, fleet_registered_devices.device_name),
        last_user_id = COALESCE(excluded.last_user_id, fleet_registered_devices.last_user_id),
        last_driver_name = COALESCE(excluded.last_driver_name, fleet_registered_devices.last_driver_name),
        driver_phone = COALESCE(excluded.driver_phone, fleet_registered_devices.driver_phone),
        printer_mac = COALESCE(excluded.printer_mac, fleet_registered_devices.printer_mac),
        paper_size = COALESCE(excluded.paper_size, fleet_registered_devices.paper_size),
        app_version = COALESCE(excluded.app_version, fleet_registered_devices.app_version),
        server_url_override = COALESCE(excluded.server_url_override, fleet_registered_devices.server_url_override),
        last_seen = excluded.last_seen
    `).run(
      hardwareId,
      deviceName || 'Celular / Terminal Android',
      userId || null,
      driverName || 'Chofer APK',
      driverPhone || '',
      printerMac || null,
      paperSize || '80mm',
      appVersion || '1.0.0',
      serverUrlOverride || null,
      now
    );

    // Auto-link or Register with IT Assets table if present
    let linkedAssetId: number | null = null;
    try {
      const assetTableCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND (name='it_assets' OR name='core_assets')`).get() as any;
      if (assetTableCheck) {
        const tableName = assetTableCheck.name;
        let asset = db.prepare(`SELECT id FROM ${tableName} WHERE serial_number = ?`).get(hardwareId) as any;
        if (!asset) {
          // Get default branch_id if available
          let defaultBranchId = 1;
          try {
            const b = db.prepare(`SELECT id FROM it_branches LIMIT 1`).get() as any;
            if (b?.id) defaultBranchId = b.id;
          } catch (_) {}

          const insertAsset = db.prepare(`
            INSERT INTO ${tableName} (
              category, brand, model, serial_number, hardware_id, status, phone_number, branch_id, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
          `).run(
            'Dispositivos Móviles / Celulares Flotilla',
            'Android',
            deviceName || 'Celular Flotilla',
            'N/D - Móvil',
            hardwareId,
            driverPhone || '',
            defaultBranchId,
            `Auto-registrado desde APK Nativa | Chofer: ${driverName || 'Chofer'} | Impresora: ${printerMac || 'N/D'}`,
            now
          );
          // En tablas legacy donde `id` no es INTEGER PRIMARY KEY AUTOINCREMENT,
          // SQLite no autogenera el id. Lo asignamos explícitamente usando el rowid.
          const insertedRowid = Number(insertAsset.lastInsertRowid);
          try {
            db.prepare(`UPDATE ${tableName} SET id = ? WHERE serial_number = ? AND (id IS NULL OR TRIM(CAST(id AS TEXT)) = '')`).run(insertedRowid, hardwareId);
          } catch (_) {}
          linkedAssetId = insertedRowid;
        } else {
          linkedAssetId = asset.id;
        }

        if (linkedAssetId) {
          db.prepare(`UPDATE fleet_registered_devices SET asset_id = ? WHERE hardware_id = ?`).run(linkedAssetId, hardwareId);
        }
      }
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: 'Dispositivo registrado e inventariado con éxito',
      hardwareId,
      assetId: linkedAssetId,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authenticateFleetRequest(req);
    if ('response' in authResult) {
      return authResult.response;
    }

    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const hardwareId = searchParams.get('hardwareId');

    if (!hardwareId) {
      return NextResponse.json({ success: false, error: 'hardwareId es requerido' }, { status: 400 });
    }

    db.prepare(`DELETE FROM fleet_registered_devices WHERE hardware_id = ?`).run(hardwareId);
    return NextResponse.json({ success: true, message: 'Dispositivo eliminado correctamente' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
