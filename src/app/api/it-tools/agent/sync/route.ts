import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import { IT_TOOLS_TABLES } from '@/modules/it-tools/lib/schema';

import crypto from 'crypto';

// Helper to validate agent API key
async function validateAgentAuth(req: NextRequest, db: any): Promise<{ authed: boolean; secretKey: string | null }> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('X-Agent-Secret-Key');
  
  db.exec("CREATE TABLE IF NOT EXISTS it_settings (key TEXT PRIMARY KEY, value TEXT)");
  let secretSetting = db.prepare(`SELECT value FROM it_settings WHERE key = 'agent_secret_key'`).get() as any;
  
  // Sembrar clave si no existe
  if (!secretSetting || !secretSetting.value || secretSetting.value.trim().length === 0) {
    const generated = crypto.randomBytes(32).toString('hex');
    db.prepare(`INSERT INTO it_settings (key, value) VALUES ('agent_secret_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?`).run(generated, generated);
    secretSetting = { value: generated };
  }

  const currentSecret = secretSetting.value.trim();

  if (!authHeader) {
    return { authed: false, secretKey: null };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(currentSecret);

  if (tokenBuf.length !== secretBuf.length) return { authed: false, secretKey: null };
  const isValid = crypto.timingSafeEqual(tokenBuf, secretBuf);
  return { authed: isValid, secretKey: isValid ? currentSecret : null };
}

/**
 * POST /api/it-tools/agent/sync
 * Primary Heartbeat + Telemetry + Command Pull endpoint for the Windows Service
 */
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const { authed, secretKey } = await validateAgentAuth(req, db);
    if (!authed) {
      return NextResponse.json({ success: false, error: 'Unauthorized agent' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      serial_number,
      hardware_id,
      hostname,
      manufacturer,
      model,
      category = 'Laptop',
      branch_id = 1,
      os_version,
      os_build,
      logged_in_user,
      domain,
      cpu_name,
      cpu_usage = 0,
      ram_total_gb = 0,
      ram_used_percent = 0,
      disk_primary_free_gb = 0,
      disk_primary_total_gb = 0,
      disk_smart_status = 'OK',
      battery_percent,
      is_charging = 0,
      is_laptop = 1,
      bitlocker_status,
      bitlocker_id,
      bitlocker_key,
      antivirus_status,
      ip_address_local,
      ip_address_public,
      mac_address,
      monitors = [],
      installed_software = [],
      critical_events = [],
      key_services = [],
      top_processes = [],
      discovered_network_devices = [],
      ram_slots_total,
      ram_slots_free,
      agent_version = '1.0.0'
    } = payload;

    if (!serial_number && !hardware_id && !mac_address) {
      return NextResponse.json({ success: false, error: 'Missing device identifier (serial_number, hardware_id or mac_address)' }, { status: 400 });
    }

    // Ensure telemetry table has expanded columns
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.agentTelemetry} ADD COLUMN ram_slots_total INTEGER`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.agentTelemetry} ADD COLUMN ram_slots_free INTEGER`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.agentTelemetry} ADD COLUMN critical_events_json TEXT`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.agentTelemetry} ADD COLUMN key_services_json TEXT`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.agentTelemetry} ADD COLUMN top_processes_json TEXT`).run(); } catch (_) {}
    try { db.prepare(`ALTER TABLE ${IT_TOOLS_TABLES.agentTelemetry} ADD COLUMN network_devices_json TEXT`).run(); } catch (_) {}

    const now = new Date().toISOString();
    const effectiveSerial = (serial_number && serial_number.trim().length > 0)
      ? serial_number.trim()
      : (hardware_id || `CLIC-WIN-${mac_address ? mac_address.replace(/[:-]/g, '') : 'UNKNOWN'}`);

    // 1. Find or Auto-Create IT Asset in it_assets
    let asset = db.prepare(`
      SELECT id, brand, model, serial_number, branch_id FROM ${IT_TOOLS_TABLES.assets} 
      WHERE UPPER(TRIM(serial_number)) = UPPER(TRIM(?)) OR (hardware_id IS NOT NULL AND UPPER(TRIM(hardware_id)) = UPPER(TRIM(?)))
    `).get(effectiveSerial, hardware_id || effectiveSerial) as any;

    let assetId: number;

    if (!asset) {
      // Auto-register asset
      const brandVal = manufacturer || 'Generico';
      const modelVal = model || hostname || 'Equipo Windows';
      const catVal = is_laptop === 1 ? 'Laptop' : 'Desktop';

      const insertInfo = db.prepare(`
        INSERT INTO ${IT_TOOLS_TABLES.assets} (
          category, brand, model, serial_number, hardware_id, status, branch_id,
          processor, ram_memory, storage_capacity, bitlocker_id, bitlocker_key,
          created_at
        ) VALUES (
          ?, ?, ?, ?, ?, 'active', ?,
          ?, ?, ?, ?, ?,
          ?
        )
      `).run(
        catVal, brandVal, modelVal, effectiveSerial, hardware_id || null, branch_id || 1,
        cpu_name || null, ram_total_gb ? `${Math.round(ram_total_gb)} GB` : null,
        disk_primary_total_gb ? `${Math.round(disk_primary_total_gb)} GB` : null,
        bitlocker_id || null, bitlocker_key || null,
        now
      );
      assetId = Number(insertInfo.lastInsertRowid);
    } else {
      assetId = Number(asset.id);
      // Update hardware specs in it_assets if available
      db.prepare(`
        UPDATE ${IT_TOOLS_TABLES.assets} SET
          processor = COALESCE(?, processor),
          ram_memory = COALESCE(?, ram_memory),
          storage_capacity = COALESCE(?, storage_capacity),
          bitlocker_id = COALESCE(?, bitlocker_id),
          bitlocker_key = COALESCE(?, bitlocker_key)
        WHERE id = ?
      `).run(
        cpu_name || null,
        ram_total_gb ? `${Math.round(ram_total_gb)} GB` : null,
        disk_primary_total_gb ? `${Math.round(disk_primary_total_gb)} GB` : null,
        bitlocker_id || null,
        bitlocker_key || null,
        assetId
      );
    }

    // 2. Upsert it_asset_telemetry
    db.prepare(`
      INSERT INTO ${IT_TOOLS_TABLES.agentTelemetry} (
        asset_id, hostname, os_version, os_build, logged_in_user, domain, cpu_name, cpu_usage,
        ram_total_gb, ram_used_percent, disk_primary_free_gb, disk_primary_total_gb, disk_smart_status,
        battery_percent, is_charging, is_laptop, bitlocker_status, antivirus_status, ip_address_local,
        ip_address_public, mac_address, monitors_json, ram_slots_total, ram_slots_free,
        critical_events_json, key_services_json, top_processes_json, network_devices_json,
        agent_version, last_seen
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
      ON CONFLICT(asset_id) DO UPDATE SET
        hostname = excluded.hostname,
        os_version = excluded.os_version,
        os_build = excluded.os_build,
        logged_in_user = excluded.logged_in_user,
        domain = excluded.domain,
        cpu_name = excluded.cpu_name,
        cpu_usage = excluded.cpu_usage,
        ram_total_gb = excluded.ram_total_gb,
        ram_used_percent = excluded.ram_used_percent,
        disk_primary_free_gb = excluded.disk_primary_free_gb,
        disk_primary_total_gb = excluded.disk_primary_total_gb,
        disk_smart_status = excluded.disk_smart_status,
        battery_percent = excluded.battery_percent,
        is_charging = excluded.is_charging,
        is_laptop = excluded.is_laptop,
        bitlocker_status = excluded.bitlocker_status,
        antivirus_status = excluded.antivirus_status,
        ip_address_local = excluded.ip_address_local,
        ip_address_public = excluded.ip_address_public,
        mac_address = excluded.mac_address,
        monitors_json = excluded.monitors_json,
        ram_slots_total = excluded.ram_slots_total,
        ram_slots_free = excluded.ram_slots_free,
        critical_events_json = excluded.critical_events_json,
        key_services_json = excluded.key_services_json,
        top_processes_json = excluded.top_processes_json,
        network_devices_json = excluded.network_devices_json,
        agent_version = excluded.agent_version,
        last_seen = excluded.last_seen
    `).run(
      assetId, hostname || null, os_version || null, os_build || null, logged_in_user || null, domain || null, cpu_name || null, cpu_usage || 0,
      ram_total_gb || 0, ram_used_percent || 0, disk_primary_free_gb || 0, disk_primary_total_gb || 0, disk_smart_status || 'OK',
      battery_percent !== undefined ? battery_percent : null, is_charging ? 1 : 0, is_laptop ? 1 : 0, bitlocker_status || null, antivirus_status || null, ip_address_local || null,
      ip_address_public || null, mac_address || null, monitors && monitors.length > 0 ? JSON.stringify(monitors) : null,
      ram_slots_total || null, ram_slots_free || null,
      critical_events && critical_events.length > 0 ? JSON.stringify(critical_events) : null,
      key_services && key_services.length > 0 ? JSON.stringify(key_services) : null,
      top_processes && top_processes.length > 0 ? JSON.stringify(top_processes) : null,
      discovered_network_devices && discovered_network_devices.length > 0 ? JSON.stringify(discovered_network_devices) : null,
      agent_version || '1.0.0', now
    );

    // 3. Upsert Installed Software Inventory if provided
    if (Array.isArray(installed_software) && installed_software.length > 0) {
      db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.installedSoftware} WHERE asset_id = ?`).run(assetId);
      const insertSoftware = db.prepare(`
        INSERT INTO ${IT_TOOLS_TABLES.installedSoftware} (asset_id, name, version, publisher, install_date, last_scanned_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const sw of installed_software) {
        if (sw && sw.name) {
          insertSoftware.run(assetId, sw.name.slice(0, 150), (sw.version || '').slice(0, 50), (sw.publisher || '').slice(0, 100), sw.install_date || null, now);
        }
      }
    }

    // 4. Fetch Pending Commands for this asset (Ordered by priority ASC, created_at ASC)
    const pendingCommands = db.prepare(`
      SELECT id, command_type, payload_json, priority FROM ${IT_TOOLS_TABLES.agentCommands}
      WHERE asset_id = ? AND status = 'pending'
      ORDER BY priority ASC, created_at ASC
    `).all(assetId) as any[];

    // Mark retrieved commands as 'running'
    for (const cmd of pendingCommands) {
      db.prepare(`UPDATE ${IT_TOOLS_TABLES.agentCommands} SET status = 'running' WHERE id = ?`).run(cmd.id);
    }

    // 5. Check if newer OTA Version is available
    const latestOta = db.prepare(`
      SELECT version_name, version_code, file_url, sha256_hash, release_notes 
      FROM ${IT_TOOLS_TABLES.agentOtaVersions}
      WHERE is_active = 1
      ORDER BY version_code DESC
      LIMIT 1
    `).get() as any;

    return NextResponse.json({
      success: true,
      asset_id: assetId,
      secret_key: secretKey,
      commands: pendingCommands.map(c => ({
        id: c.id,
        type: c.command_type,
        payload: c.payload_json ? JSON.parse(c.payload_json) : {},
        priority: c.priority
      })),
      ota: latestOta || null,
      server_time: now
    });
  } catch (error: any) {
    console.error('Error in agent sync endpoint:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
