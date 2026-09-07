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

  // Permitir handshake si el agente no posee token en su instalación
  if (!authHeader) return true;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secretSetting.value.trim());

  if (tokenBuf.length !== secretBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}

/**
 * POST /api/it-tools/agent/commands
 * Agent reports the execution result of a command
 */
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const isAuthed = await validateAgentAuth(req, db);
    if (!isAuthed) {
      return NextResponse.json({ success: false, error: 'Unauthorized agent' }, { status: 401 });
    }

    const payload = await req.json();
    const { command_id, status, result_output } = payload;

    if (!command_id || !status) {
      return NextResponse.json({ success: false, error: 'Missing command_id or status' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const resultStr = typeof result_output === 'object' ? JSON.stringify(result_output) : String(result_output || '');

    const info = db.prepare(`
      UPDATE ${IT_TOOLS_TABLES.agentCommands} SET
        status = ?,
        result_output = ?,
        executed_at = ?
      WHERE id = ?
    `).run(status, resultStr, now, command_id);

    if (info.changes === 0) {
      return NextResponse.json({ success: false, error: 'Command not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, command_id, updated_at: now });
  } catch (error: any) {
    console.error('Error reporting command result:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
