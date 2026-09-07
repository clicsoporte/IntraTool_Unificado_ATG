import { NextRequest, NextResponse } from 'next/server';
import { verifyFleetToken, FleetTokenPayload } from '@/modules/core/lib/jwt-service';
import { getDb } from '@/modules/core/lib/db';

export interface AuthenticatedFleetRequest {
    user: FleetTokenPayload;
}

/**
 * Guard de seguridad para endpoints /api/fleet/*
 * Permite transición suave (Zero Downtime):
 * - Si viene Header Authorization: Bearer <token>, lo valida estrictamente.
 * - Si no viene token pero el Switch de Seguridad en BD está en 'permissive', valida con fallback a hardwareId/userId.
 * - Si está en 'strict', rechaza con 401 si no hay token válido.
 */
export async function authenticateFleetRequest(
    req: NextRequest
): Promise<{ user: FleetTokenPayload } | { response: NextResponse }> {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        const payload = verifyFleetToken(token);

        if (payload) {
            return { user: payload };
        } else {
            return {
                response: NextResponse.json(
                    { success: false, error: 'Token de sesión inválido o expirado. Inicie sesión nuevamente.' },
                    { status: 401 }
                )
            };
        }
    }

    // Modo de Compatibilidad / Feature Flag
    try {
        const db = await getDb();
        const row = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'fleet_security_mode'").get() as any;
        const securityMode = row?.value || 'permissive'; // 'permissive' | 'strict'

        if (securityMode === 'strict') {
            return {
                response: NextResponse.json(
                    { success: false, error: 'Autenticación requerida. Cabecera Authorization no provista.' },
                    { status: 401 }
                )
            };
        }
    } catch (_) {}

    // Fallback permisivo temporal para APKs no actualizadas aún:
    // Derivar usuario básico de parámetros o devolver objeto temporal
    const { searchParams } = new URL(req.url);
    const rawUserId = searchParams.get('userId');
    const fallbackUserId = rawUserId ? parseInt(rawUserId, 10) : 0;

    return {
        user: {
            userId: fallbackUserId,
            userName: 'Legacy-Driver',
            role: 'driver',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 86400
        }
    };
}
