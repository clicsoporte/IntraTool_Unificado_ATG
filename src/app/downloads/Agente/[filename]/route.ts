import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await params;
        if (!filename) {
            return new NextResponse('Nombre de archivo inválido', { status: 400 });
        }

        // Clean filename for safety
        const safeFilename = path.basename(filename);
        const filePath = path.join(process.cwd(), 'public', 'downloads', 'Agente', safeFilename);

        if (!fs.existsSync(filePath)) {
            return new NextResponse(`Archivo ${safeFilename} no encontrado en public/downloads/Agente/`, { status: 404 });
        }

        const fileBuffer = fs.readFileSync(filePath);
        
        let contentType = 'application/octet-stream';
        if (safeFilename.endsWith('.exe')) contentType = 'application/x-msdownload';
        else if (safeFilename.endsWith('.msi')) contentType = 'application/x-msi';
        else if (safeFilename.endsWith('.json')) contentType = 'application/json';
        else if (safeFilename.endsWith('.ps1')) contentType = 'text/plain';

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${safeFilename}"`,
                'Content-Length': fileBuffer.length.toString(),
            },
        });
    } catch (error: any) {
        return new NextResponse(`Error interno al servir archivo del agente: ${error?.message}`, { status: 500 });
    }
}
