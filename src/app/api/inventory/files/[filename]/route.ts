import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getCurrentUser } from '@/modules/core/lib/auth';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'inventory');

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  // [Auth Guard] Exigir sesión de usuario
  const webUser = await getCurrentUser();
  if (!webUser) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const filename = params.filename;
  if (!filename) {
    return new NextResponse('Nombre de archivo inválido', { status: 400 });
  }

  // [S3] Blindaje estricto de Path Traversal
  const safeFilename = path.basename(filename);
  const resolvedPath = path.resolve(UPLOAD_DIR, safeFilename);
  const baseResolved = path.resolve(UPLOAD_DIR);

  if (!resolvedPath.startsWith(baseResolved)) {
    return new NextResponse('Acceso no autorizado al archivo', { status: 403 });
  }

  if (!fs.existsSync(resolvedPath)) {
    return new NextResponse('File not found', { status: 404 });
  }

  const fileBuffer = fs.readFileSync(resolvedPath);
  
  // Determine content type based on extension
  const ext = filename.split('.').pop()?.toLowerCase();
  let contentType = 'application/octet-stream';
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
    contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  } else if (ext === 'pdf') {
    contentType = 'application/pdf';
  } else if (['doc', 'docx'].includes(ext || '')) {
    contentType = 'application/msword';
  }

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
