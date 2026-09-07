import { NextRequest, NextResponse } from 'next/server';
import { addSuggestion } from '@/modules/core/lib/suggestions-actions';
import { authenticateFleetRequest } from '@/modules/fleet/lib/fleet-auth-guard';

/**
 * POST /api/fleet/suggestions
 * Permite a la APK Clic Driver enviar sugerencias directamente a /dashboard/admin/suggestions
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateFleetRequest(req);
    if ('response' in authResult) {
      return authResult.response;
    }

    const body = await req.json();
    const { content, userId, userName } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ success: false, error: 'El contenido de la sugerencia es requerido.' }, { status: 400 });
    }

    const finalUserName = authResult.user?.userName || userName || 'Chofer Clic Driver';
    const finalUserId = authResult.user?.userId || (userId ? Number(userId) : null);

    await addSuggestion(content.trim(), finalUserId, finalUserName);

    return NextResponse.json({ success: true, message: 'Sugerencia registrada exitosamente.' });
  } catch (error: any) {
    console.error('Error al guardar sugerencia desde APK:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Error al guardar la sugerencia.' }, { status: 500 });
  }
}
