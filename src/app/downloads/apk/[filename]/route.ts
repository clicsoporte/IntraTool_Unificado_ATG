import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await params;
        if (!filename || !filename.endsWith('.apk')) {
            return new NextResponse('Nombre de archivo APK inválido', { status: 400 });
        }

        // Clean filename for safety
        const safeFilename = path.basename(filename);
        const apkPath = path.join(process.cwd(), 'public', 'downloads', 'apk', safeFilename);

        if (!fs.existsSync(apkPath)) {
            // Check if there is any .apk in public/downloads/apk as fallback
            const apkDir = path.join(process.cwd(), 'public', 'downloads', 'apk');
            if (fs.existsSync(apkDir)) {
                const files = fs.readdirSync(apkDir).filter(f => f.endsWith('.apk'));
                if (files.length > 0) {
                    const fallbackPath = path.join(apkDir, files[0]);
                    const fileBuffer = fs.readFileSync(fallbackPath);
                    return new NextResponse(fileBuffer, {
                        headers: {
                            'Content-Type': 'application/vnd.android.package-archive',
                            'Content-Disposition': `attachment; filename="${safeFilename}"`,
                            'Content-Length': fileBuffer.length.toString(),
                        },
                    });
                }
            }
            return new NextResponse(`Archivo APK ${safeFilename} no encontrado en public/downloads/apk/`, { status: 404 });
        }

        const fileBuffer = fs.readFileSync(apkPath);
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Disposition': `attachment; filename="${safeFilename}"`,
                'Content-Length': fileBuffer.length.toString(),
            },
        });
    } catch (error: any) {
        return new NextResponse(`Error interno al servir APK: ${error?.message}`, { status: 500 });
    }
}
