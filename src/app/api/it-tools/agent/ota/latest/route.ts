import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import { IT_TOOLS_TABLES } from '@/modules/it-tools/lib/schema';
import crypto from 'crypto';

// Helper to validate agent API key (Fail-Closed)
async function validateAgentAuth(req: NextRequest, db: any): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('X-Agent-Secret-Key');
  
  db.exec("CREATE TABLE IF NOT EXISTS it_settings (key TEXT PRIMARY KEY, value TEXT)");
  let secretSetting = db.prepare(`SELECT value FROM it_settings WHERE key = 'agent_secret_key'`).get() as any;
  
  if (!secretSetting || !secretSetting.value || secretSetting.value.trim().length === 0) {
    const generated = crypto.randomBytes(32).toString('hex');
    db.prepare(`INSERT INTO it_settings (key, value) VALUES ('agent_secret_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?`).run(generated, generated);
    secretSetting = { value: generated };
  }

  // Permitir handshake/test de conexión si el agente no posee token en su instalación
  if (!authHeader) return true;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secretSetting.value.trim());

  if (tokenBuf.length !== secretBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}

/**
 * GET /api/it-tools/agent/ota/latest
 * Returns latest active OTA binary metadata
 */
export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const isAuthed = await validateAgentAuth(req, db);
    if (!isAuthed) {
      return NextResponse.json({ success: false, error: 'Unauthorized agent' }, { status: 401 });
    }

    const latest = db.prepare(`
      SELECT version_name, version_code, file_url, file_size, sha256_hash, release_notes, created_at
      FROM ${IT_TOOLS_TABLES.agentOtaVersions}
      WHERE is_active = 1
      ORDER BY version_code DESC
      LIMIT 1
    `).get() as any;

    if (!latest) {
      return NextResponse.json({ success: true, ota_available: false });
    }

    return NextResponse.json({
      success: true,
      ota_available: true,
      version: latest
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
