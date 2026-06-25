'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function DeliveriesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Deliveries Module Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 bg-rose-50 border border-rose-200 rounded-2xl max-w-2xl mx-auto my-8 space-y-4 text-center">
      <div className="p-4 bg-rose-100 rounded-full">
        <AlertTriangle className="w-10 h-10 text-rose-600" />
      </div>
      <h2 className="text-xl font-black text-rose-700">Error de Conexión o Visualización</h2>
      <p className="text-sm text-rose-600 font-medium max-w-md">
        Hubo un problema temporal al cargar el panel interactivo o sincronizar los datos de entregas.
      </p>
      
      <div className="pt-4 flex gap-4">
        <Button 
          onClick={() => reset()}
          className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md gap-2 font-bold"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar Carga
        </Button>
        <Button 
          variant="outline"
          onClick={() => window.location.reload()}
          className="border-rose-300 text-rose-700 hover:bg-rose-100 rounded-xl font-bold"
        >
          Forzar Recarga
        </Button>
      </div>
    </div>
  );
}
