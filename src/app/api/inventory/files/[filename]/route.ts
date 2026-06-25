import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const filename = params.filename;
  const filePath = path.join(process.cwd(), 'uploads', 'inventory', filename);

  if (!fs.existsSync(filePath)) {
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
