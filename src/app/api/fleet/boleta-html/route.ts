import { NextRequest, NextResponse } from 'next/server';
import { getBoletaPreviewHtml } from '@/modules/operations/lib/actions';
import { getCurrentUser } from '@/modules/core/lib/auth';
import { authenticateFleetRequest } from '@/modules/fleet/lib/fleet-auth-guard';

export async function GET(req: NextRequest) {
  try {
    // Validar autorización: debe ser usuario de sesión web o chofer autenticado
    const webUser = await getCurrentUser();
    if (!webUser) {
      const fleetAuth = await authenticateFleetRequest(req);
      if ('response' in fleetAuth) {
        return fleetAuth.response;
      }
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return new NextResponse('Falta parámetro id', { status: 400 });
    }

    const autoPrint = searchParams.get('print') === '1' || searchParams.get('pdf') === '1';

    const res = await getBoletaPreviewHtml(Number(id));
    if (res.success && res.html) {
      let finalHtml = res.html;

      const printScript = `
        <style>
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; padding: 10px; background: #fff !important; color: #000 !important; }
          }
        </style>
        <div class="no-print" style="position: fixed; top: 12px; right: 12px; z-index: 99999; display: flex; gap: 8px;">
          <button onclick="window.print()" style="background: #e11d48; color: #fff; border: none; padding: 10px 16px; font-weight: bold; font-size: 13px; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-family: sans-serif;">
            📄 Imprimir / Guardar como PDF
          </button>
        </div>
        ${autoPrint ? `
        <script>
          window.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() { window.print(); }, 400);
          });
        </script>
        ` : ''}
      `;

      if (finalHtml.includes('</body>')) {
        finalHtml = finalHtml.replace('</body>', `${printScript}</body>`);
      } else {
        finalHtml += printScript;
      }

      return new NextResponse(finalHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new NextResponse(`Error generando boleta: ${res.error || 'No encontrada'}`, { status: 404 });
  } catch (error: any) {
    return new NextResponse(`Error de servidor: ${error.message}`, { status: 500 });
  }
}
