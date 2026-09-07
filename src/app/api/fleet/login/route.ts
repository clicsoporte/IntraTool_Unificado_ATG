import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/modules/core/lib/db';
import bcrypt from 'bcryptjs';
import { generateFleetToken } from '@/modules/core/lib/jwt-service';
import { checkRateLimit, recordRateLimitFailure, resetRateLimit } from '@/modules/core/lib/rate-limiter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { usernameOrEmail, password, driverId } = body;

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
    const targetAccount = driverId ? `id_${driverId}` : (usernameOrEmail ? String(usernameOrEmail).toLowerCase().trim() : 'anonymous');
    
    const ipRateLimitKey = `fleet_login_ip:${ip}`;
    const accountRateLimitKey = `fleet_login_account:${targetAccount}`;

    // [Security] Rate Limiting Dual: Máximo 10 intentos fallidos en 15 minutos (por IP o por cuenta)
    const ipLimitCheck = checkRateLimit(ipRateLimitKey, 10, 15 * 60 * 1000);
    const accountLimitCheck = checkRateLimit(accountRateLimitKey, 10, 15 * 60 * 1000);

    if (!ipLimitCheck.allowed || !accountLimitCheck.allowed) {
      const retrySec = Math.max(ipLimitCheck.retryAfterSec, accountLimitCheck.retryAfterSec);
      return NextResponse.json({
        success: false,
        error: `Demasiados intentos fallidos. Por seguridad, la cuenta o IP ha sido bloqueada temporalmente. Intente de nuevo en ${Math.ceil(retrySec / 60)} minutos.`
      }, { status: 429 });
    }

    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Debe proporcionar su contraseña' }, { status: 400 });
    }

    const db = await getDb();

    if (driverId) {
      const user = db.prepare('SELECT id, name, email, employeeId, password, is_active, role FROM core_users WHERE id = ?').get(driverId) as any;
      if (!user) {
        recordRateLimitFailure(ipRateLimitKey);
        recordRateLimitFailure(accountRateLimitKey);
        return NextResponse.json({ success: false, error: 'Usuario no encontrado' }, { status: 404 });
      }

      if (user.is_active === 0) {
        return NextResponse.json({ success: false, error: 'Cuenta de chofer inactiva' }, { status: 403 });
      }

      if (!user.password) {
        return NextResponse.json({ success: false, error: 'El usuario no tiene contraseña configurada' }, { status: 401 });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        recordRateLimitFailure(ipRateLimitKey);
        recordRateLimitFailure(accountRateLimitKey);
        return NextResponse.json({ success: false, error: 'Contraseña incorrecta' }, { status: 401 });
      }

      resetRateLimit(ipRateLimitKey);
      resetRateLimit(accountRateLimitKey);

      const token = generateFleetToken({
        userId: user.id,
        userName: user.name,
        role: user.role || 'driver',
        employeeId: user.employeeId,
      });

      return NextResponse.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          employeeId: user.employeeId,
        }
      });
    }

    if (!usernameOrEmail) {
      return NextResponse.json({ success: false, error: 'Debe proporcionar usuario/correo' }, { status: 400 });
    }

    const cleanSearch = usernameOrEmail.trim();
    const user = db.prepare(`
      SELECT id, name, email, employeeId, password, is_active, role 
      FROM core_users 
      WHERE LOWER(email) = LOWER(?) OR LOWER(name) = LOWER(?) OR employeeId = ?
    `).get(cleanSearch, cleanSearch, cleanSearch) as any;

    if (!user) {
      recordRateLimitFailure(ipRateLimitKey);
      recordRateLimitFailure(accountRateLimitKey);
      return NextResponse.json({ success: false, error: 'Usuario o contraseña incorrectos' }, { status: 401 });
    }

    if (user.is_active === 0) {
      return NextResponse.json({ success: false, error: 'Cuenta de chofer inactiva' }, { status: 403 });
    }

    if (!user.password) {
      return NextResponse.json({ success: false, error: 'El usuario no tiene contraseña configurada' }, { status: 401 });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      recordRateLimitFailure(ipRateLimitKey);
      recordRateLimitFailure(accountRateLimitKey);
      return NextResponse.json({ success: false, error: 'Usuario o contraseña incorrectos' }, { status: 401 });
    }

    resetRateLimit(ipRateLimitKey);
    resetRateLimit(accountRateLimitKey);

    const token = generateFleetToken({
      userId: user.id,
      userName: user.name,
      role: user.role || 'driver',
      employeeId: user.employeeId,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Error interno del servidor en autenticación' }, { status: 500 });
  }
}
