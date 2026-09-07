import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import { authenticateFleetRequest } from '@/modules/fleet/lib/fleet-auth-guard';
import { getCurrentUser } from '@/modules/core/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // [Auth Guard] Validar autenticación de chofer/flota
    const authResult = await authenticateFleetRequest(req);
    if ('response' in authResult) {
      return authResult.response;
    }

    const db = await getDb();
    const body = await req.json();
    const logs = Array.isArray(body.logs) ? body.logs : [body];

    if (!logs || logs.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    db.prepare(`
      CREATE TABLE IF NOT EXISTS ops_driver_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        chofer_nombre TEXT,
        chofer_telefono TEXT,
        ruta_nombre TEXT,
        placa_vehiculo TEXT,
        level TEXT NOT NULL,
        category TEXT DEFAULT 'operativo',
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `).run();

    const insertStmt = db.prepare(`
      INSERT INTO ops_driver_logs (
        user_id, user_name, chofer_nombre, chofer_telefono,
        ruta_nombre, placa_vehiculo, level, category, message, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const effectiveUserId = authResult.user?.userId || null;
    const effectiveUserName = authResult.user?.userName || null;

    const transaction = db.transaction((logItems: any[]) => {
      for (const item of logItems) {
        const phone = item.choferTelefono || item.phone || '';
        insertStmt.run(
          item.userId || effectiveUserId,
          item.userName || effectiveUserName,
          item.choferNombre || item.userName || effectiveUserName || 'Chofer APK',
          phone,
          item.rutaNombre || '',
          item.placaVehiculo || '',
          item.level || 'INFO',
          item.category || 'operativo',
          item.message || '',
          item.timestamp || new Date().toISOString()
        );

        const targetUserId = item.userId || effectiveUserId;
        if (phone && phone.trim().length > 4 && targetUserId) {
          try {
            db.prepare(`
              UPDATE fleet_registered_devices 
              SET phone_number = CASE WHEN phone_number IS NULL OR phone_number = '' THEN ? ELSE phone_number END,
                  driver_phone = CASE WHEN driver_phone IS NULL OR driver_phone = '' THEN ? ELSE driver_phone END
              WHERE last_user_id = ?
            `).run(phone.trim(), phone.trim(), targetUserId);
          } catch (_) {}
        }
      }
    });

    transaction(logs);

    return NextResponse.json({
      success: true,
      count: logs.length,
      message: `${logs.length} logs guardados correctamente.`
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Error interno al guardar los registros." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    // [Auth Guard] Exigir sesión web o rol administrativo
    const webUser = await getCurrentUser();
    if (!webUser) {
      const fleetAuth = await authenticateFleetRequest(req);
      if ('response' in fleetAuth) {
        return fleetAuth.response;
      }
    }

    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'operativo';
    const search = searchParams.get('search') || '';
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500);

    db.prepare(`
      CREATE TABLE IF NOT EXISTS ops_driver_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        chofer_nombre TEXT,
        chofer_telefono TEXT,
        ruta_nombre TEXT,
        placa_vehiculo TEXT,
        level TEXT NOT NULL,
        category TEXT DEFAULT 'operativo',
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `).run();

    let query = `SELECT * FROM ops_driver_logs WHERE 1=1`;
    const params: any[] = [];

    if (category === 'operativo') {
      query += ` AND (category = 'operativo' OR category = 'auditoria' OR category IS NULL)`;
    } else if (category === 'sistema') {
      query += ` AND category = 'sistema'`;
    } else if (category === 'apk') {
      query += ``;
    }

    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (from) {
      query += ` AND timestamp >= ?`;
      params.push(from);
    }
    if (to) {
      const toStr = to.includes('T') ? to : `${to}T23:59:59.999Z`;
      query += ` AND timestamp <= ?`;
      params.push(toStr);
    }

    if (search.trim()) {
      query += ` AND (chofer_nombre LIKE ? OR chofer_telefono LIKE ? OR message LIKE ? OR ruta_nombre LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    query += ` ORDER BY id DESC LIMIT ?`;
    params.push(limit);

    const logs = db.prepare(query).all(...params);

    return NextResponse.json({
      success: true,
      category,
      count: logs.length,
      logs,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Error al consultar la bitácora." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // [Auth Guard] Solo administradores pueden purgar la bitácora
    const webUser = await getCurrentUser();
    if (!webUser || (webUser.role !== 'admin' && webUser.role !== 'supervisor')) {
      return NextResponse.json({ success: false, error: 'Acceso no autorizado para eliminar registros.' }, { status: 403 });
    }

    const db = await getDb();
    db.prepare(`DELETE FROM ops_driver_logs`).run();
    return NextResponse.json({ success: true, message: "Bitácora de APK nativa eliminada" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Error al eliminar la bitácora." }, { status: 500 });
  }
}
