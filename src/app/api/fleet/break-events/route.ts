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
    const date = searchParams.get('date');
    const driverName = searchParams.get('driverName');

    db.prepare(`
      CREATE TABLE IF NOT EXISTS ops_driver_break_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_name TEXT NOT NULL,
        driver_user_id INTEGER,
        hardware_id TEXT,
        break_type TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_minutes INTEGER DEFAULT 0,
        allowed_minutes INTEGER DEFAULT 45,
        overdue_minutes INTEGER DEFAULT 0,
        lat_start REAL,
        lng_start REAL,
        lat_end REAL,
        lng_end REAL,
        status TEXT NOT NULL DEFAULT 'completed',
        fraud_flag INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL
      )
    `).run();

    let query = `SELECT * FROM ops_driver_break_events WHERE 1=1`;
    const params: any[] = [];

    if (date) {
      query += ` AND start_time LIKE ?`;
      params.push(`${date}%`);
    }

    if (driverName) {
      query += ` AND driver_name LIKE ?`;
      params.push(`%${driverName}%`);
    }

    query += ` ORDER BY start_time DESC LIMIT 100`;

    const events = db.prepare(query).all(...params);

    return NextResponse.json({ success: true, events });
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
    const {
      action,
      eventId,
      driverName,
      driverUserId,
      hardwareId,
      breakType,
      allowedMinutes,
      lat,
      lng,
      notes
    } = body;

    db.prepare(`
      CREATE TABLE IF NOT EXISTS ops_driver_break_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_name TEXT NOT NULL,
        driver_user_id INTEGER,
        hardware_id TEXT,
        break_type TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_minutes INTEGER DEFAULT 0,
        allowed_minutes INTEGER DEFAULT 45,
        overdue_minutes INTEGER DEFAULT 0,
        lat_start REAL,
        lng_start REAL,
        lat_end REAL,
        lng_end REAL,
        status TEXT NOT NULL DEFAULT 'completed',
        fraud_flag INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL
      )
    `).run();

    const now = new Date().toISOString();

    if (action === 'start') {
      const insert = db.prepare(`
        INSERT INTO ops_driver_break_events (
          driver_name, driver_user_id, hardware_id, break_type,
          start_time, allowed_minutes, lat_start, lng_start, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).run(
        driverName || 'Chofer APK',
        driverUserId || null,
        hardwareId || null,
        breakType || 'lunch',
        now,
        allowedMinutes || 45,
        lat || null,
        lng || null,
        now
      );

      return NextResponse.json({
        success: true,
        eventId: Number(insert.lastInsertRowid),
        message: 'Pausa iniciada correctamente'
      });
    }

    if (action === 'end' && eventId) {
      const existing = db.prepare(`SELECT * FROM ops_driver_break_events WHERE id = ?`).get(eventId) as any;
      if (existing) {
        const startTime = new Date(existing.start_time).getTime();
        const endTime = new Date(now).getTime();
        const durationMin = Math.max(1, Math.round((endTime - startTime) / (1000 * 60)));
        const allowedMin = existing.allowed_minutes || 45;
        const overdueMin = Math.max(0, durationMin - allowedMin);

        // Anti-fraud check: Check if deliveries were made during break
        let fraudFlag = 0;
        let finalStatus = overdueMin > 0 ? 'overdue' : 'completed';

        try {
          const deliveriesMade = db.prepare(`
            SELECT COUNT(*) as count FROM ops_deliveries
            WHERE chofer_nombre = ? AND updated_at BETWEEN ? AND ?
          `).get(existing.driver_name, existing.start_time, now) as any;

          if (deliveriesMade && deliveriesMade.count > 0) {
            fraudFlag = 1;
            finalStatus = 'fraud_detected';
          }
        } catch (_) {}

        db.prepare(`
          UPDATE ops_driver_break_events SET
            end_time = ?,
            duration_minutes = ?,
            overdue_minutes = ?,
            lat_end = ?,
            lng_end = ?,
            status = ?,
            fraud_flag = ?,
            notes = COALESCE(?, notes)
          WHERE id = ?
        `).run(now, durationMin, overdueMin, lat || null, lng || null, finalStatus, fraudFlag, notes || null, eventId);

        return NextResponse.json({
          success: true,
          durationMinutes: durationMin,
          overdueMinutes: overdueMin,
          fraudFlag,
          status: finalStatus,
          message: 'Pausa finalizada correctamente'
        });
      }
    }

    return NextResponse.json({ success: false, error: 'Acción no válida o evento no encontrado' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
