import crypto from 'crypto';

export interface FleetTokenPayload {
    userId: number;
    userName: string;
    role: string;
    employeeId?: string | null;
    hardwareId?: string | null;
    iat: number;
    exp: number;
}

// Clave en memoria caché para evitar queries continuas
let _cachedDbJwtSecret: string | null = null;

function getSecretKey(): string {
    if (process.env.FLEET_JWT_SECRET && process.env.FLEET_JWT_SECRET.trim().length > 0) {
        return process.env.FLEET_JWT_SECRET.trim();
    }
    if (process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.trim().length > 0) {
        return process.env.NEXTAUTH_SECRET.trim();
    }

    if (_cachedDbJwtSecret) {
        return _cachedDbJwtSecret;
    }

    // [E6] Persistencia en SQLite para sobrevivir reinicios sin invalidar tokens
    try {
        const Database = require('better-sqlite3');
        const path = require('path');
        const dbPath = path.join(process.cwd(), 'dbs', 'database.sqlite');
        const db = new Database(dbPath);
        
        db.exec("CREATE TABLE IF NOT EXISTS ops_delivery_settings (key TEXT PRIMARY KEY, value TEXT)");
        const row = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'system_jwt_secret'").get() as any;
        
        if (row && row.value && row.value.length >= 32) {
            _cachedDbJwtSecret = row.value;
            db.close();
            return _cachedDbJwtSecret!;
        }

        const generated = crypto.randomBytes(64).toString('hex');
        db.prepare("INSERT INTO ops_delivery_settings (key, value) VALUES ('system_jwt_secret', ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(generated, generated);
        _cachedDbJwtSecret = generated;
        db.close();
        return _cachedDbJwtSecret!;
    } catch (_) {
        if (!_cachedDbJwtSecret) {
            _cachedDbJwtSecret = crypto.randomBytes(64).toString('hex');
        }
        return _cachedDbJwtSecret;
    }
}

function base64UrlEncode(str: string): string {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Genera un token firmado HMAC-SHA256 (JWT estándar) válido por defecto durante 7 días.
 */
export function generateFleetToken(payload: {
    userId: number;
    userName: string;
    role: string;
    employeeId?: string | null;
    hardwareId?: string | null;
    expiresInDays?: number;
}): string {
    const header = {
        alg: 'HS256',
        typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const expDays = payload.expiresInDays || 30;
    const exp = now + (expDays * 24 * 60 * 60);

    const fullPayload: FleetTokenPayload = {
        userId: payload.userId,
        userName: payload.userName,
        role: payload.role,
        employeeId: payload.employeeId || null,
        hardwareId: payload.hardwareId || null,
        iat: now,
        exp: exp
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

    const signature = crypto
        .createHmac('sha256', getSecretKey())
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Valida la firma criptográfica y expiración de un token JWT.
 */
export function verifyFleetToken(token: string): FleetTokenPayload | null {
    try {
        if (!token || typeof token !== 'string') return null;
        const parts = token.trim().split('.');
        if (parts.length !== 3) return null;

        const [encodedHeader, encodedPayload, signature] = parts;

        const expectedSignature = crypto
            .createHmac('sha256', getSecretKey())
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

        // Comparación resistente a timing attacks
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            return null;
        }

        const payloadStr = base64UrlDecode(encodedPayload);
        const payload: FleetTokenPayload = JSON.parse(payloadStr);

        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return null; // Token expirado
        }

        return payload;
    } catch (_) {
        return null;
    }
}

/**
 * Determina si un token debe auto-renovarse (ha transcurrido al menos la mitad de su vida útil / >= 15 días).
 */
export function shouldRenewFleetToken(payload: FleetTokenPayload): boolean {
    if (!payload || !payload.iat) return false;
    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = now - payload.iat;
    const fifteenDaysSeconds = 15 * 24 * 60 * 60;
    return elapsedSeconds >= fifteenDaysSeconds;
}

/**
 * Auto-renueva silenciosamente el token por 30 días adicionales si han transcurrido 15 días o más desde su emisión.
 */
export function renewFleetTokenIfNeeded(payload: FleetTokenPayload): string | null {
    if (!shouldRenewFleetToken(payload)) return null;
    return generateFleetToken({
        userId: payload.userId,
        userName: payload.userName,
        role: payload.role,
        employeeId: payload.employeeId,
        hardwareId: payload.hardwareId,
        expiresInDays: 30
    });
}
