'use client';
 
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import Link from 'next/link';
 
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Dashboard Error Boundary:', error);
  }, [error]);
 
  return (
    <div className="flex h-[80vh] w-full items-center justify-center p-4">
      <Card className="max-w-md w-full border-red-200 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-10 w-10" />
          </div>
          <CardTitle className="text-2xl text-red-700">¡Ups! Algo salió mal</CardTitle>
          <CardDescription className="text-base">
            Se ha producido un error inesperado al cargar esta sección del dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted p-3 text-xs font-mono overflow-auto max-h-32">
            {error.message || 'Error desconocido'}
            {error.digest && <p className="mt-2 text-muted-foreground">ID: {error.digest}</p>}
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Esto puede deberse a un problema temporal de conexión o un error en los datos.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            onClick={() => reset()}
            variant="default"
            className="w-full sm:w-auto"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reintentar
          </Button>
          <Button 
            asChild
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Link href="/dashboard">
              <Home className="mr-2 h-4 w-4" />
              Ir al Inicio
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
