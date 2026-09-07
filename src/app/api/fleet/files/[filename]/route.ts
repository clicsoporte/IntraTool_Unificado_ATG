import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getFleetFilePath } from '@/modules/fleet/lib/files';
import { getCurrentUser } from '@/modules/core/lib/auth';
import { authenticateFleetRequest } from '@/modules/fleet/lib/fleet-auth-guard';

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  // [Auth Guard] Exigir sesión web de usuario o token de chofer/flota
  const webUser = await getCurrentUser();
  if (!webUser) {
    const fleetAuth = await authenticateFleetRequest(request);
    if ('response' in fleetAuth) {
      const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
      if (authHeader) {
        return fleetAuth.response;
      }
    }
  }

  let filename = decodeURIComponent(params.filename || '').trim();

  // Si el filename viene como un JSON array: '["foto1.jpg", "foto2.jpg"]'
  if (filename.startsWith('[') && filename.endsWith(']')) {
    try {
      const parsed = JSON.parse(filename);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        filename = parsed[0].trim();
      }
    } catch (_) {
      // Intento manual de regex
      const match = filename.match(/["']([^"']+\.(?:jpg|jpeg|png|webp|gif|pdf))["']/i);
      if (match) filename = match[1];
    }
  }

  const filePath = getFleetFilePath(filename);

  if (!filePath || !fs.existsSync(filePath)) {
    return new NextResponse('File not found', { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  
  // Determine content type based on extension
  const ext = filename.split('.').pop()?.toLowerCase();
  let contentType = 'application/octet-stream';
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
    contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  } else if (ext === 'pdf') {
    contentType = 'application/pdf';
  }

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
