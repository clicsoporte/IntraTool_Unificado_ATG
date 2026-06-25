
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/modules/core/hooks/use-toast";
import type { Company } from "@/modules/core/types";
import { Skeleton } from "@/components/ui/skeleton";
import { logInfo } from "@/modules/core/lib/logger";
import { getCompanySettings, saveCompanySettings } from "@/modules/core/lib/db";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useDropzone } from "react-dropzone";
import { Camera, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { getInitials } from "@/lib/utils";

// --- Helper Functions for Time Conversion ---

/**
 * Converts decimal hours to HH:MM format.
 * @param {number | null | undefined} decimalHours - The hours in decimal format (e.g., 1.5).
 * @returns {string} The time in HH:MM format (e.g., "01:30").
 */
const toHHMM = (decimalHours: number | null | undefined): string => {
    if (decimalHours === null || decimalHours === undefined) return '';
    const totalMinutes = Math.round(decimalHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Converts a string (either decimal or HH:MM) to decimal hours.
 * @param {string} input - The input string (e.g., "0.5", "0,5", "1:30").
 * @returns {number | null} The time in decimal hours, or null if input is empty.
 */
const toDecimalHours = (input: string): number | null => {
    if (!input) return null;
    if (input.includes(':')) {
        const [hours, minutes] = input.split(':').map(Number);
        return (hours || 0) + ((minutes || 0) / 60);
    } else {
        const normalized = input.replace(',', '.');
        const parsed = parseFloat(normalized);
        return isNaN(parsed) ? null : parsed;
    }
};


export default function GeneralSettingsPage() {
  const { isAuthorized } = useAuthorization(['admin:settings:general']);
  const { toast } = useToast();
  const router = useRouter();
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setTitle } = usePageTitle();

  const [syncWarningDisplay, setSyncWarningDisplay] = useState('');

  useEffect(() => {
    setTitle("Configuración General");
    const loadData = async () => {
        setIsLoading(true);
        const data = await getCompanySettings();
        setCompanyData(data);
        if (data) {
            setSyncWarningDisplay(toHHMM(data.syncWarningHours));
        }
        setIsLoading(false);
    }
    if (isAuthorized) {
        loadData();
    }
  }, [setTitle, isAuthorized]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && companyData) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setCompanyData(prev => prev ? ({...prev, logoUrl: base64String}) : null);
      };
      reader.readAsDataURL(file);
    }
  }, [companyData]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': [],
    },
    maxFiles: 1,
    multiple: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!companyData) return;
    const { id, value } = e.target;
    setCompanyData(prev => prev ? ({...prev, [id]: value}) : null);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!companyData) return;
    const { id, value } = e.target;
    const numValue = value === '' ? null : parseInt(value, 10);
    if (value === '' || (numValue !== null && !isNaN(numValue))) {
        setCompanyData(prev => prev ? ({...prev, [id]: numValue }) : null);
    }
  };

  const handleSyncWarningChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      setSyncWarningDisplay(inputValue); // Update display value as user types

      const decimalValue = toDecimalHours(inputValue);
      if (companyData) {
        setCompanyData({ ...companyData, syncWarningHours: decimalValue ?? undefined });
      }
  };


  const handleSubmit = async () => {
    if (!companyData) return;
    await saveCompanySettings(companyData);
    toast({
      title: "Configuración Guardada",
      description: "Los datos de la empresa han sido actualizados.",
    });
    await logInfo("Configuración general guardada", { companyName: companyData.name });
    router.refresh(); // Force a server-side data refresh
  };
  
  if (isAuthorized === false) {
    return null;
  }

  if (isLoading || !companyData) {
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
        </div>
        </main>
    )
  }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div {...getRootProps()} className="relative group cursor-pointer flex-shrink-0">
                        <input {...getInputProps()} />
                        <Avatar className="h-24 w-24 text-4xl">
                            <AvatarImage src={companyData.logoUrl} alt={companyData.name} />
                            <AvatarFallback>{getInitials(companyData.name)}</AvatarFallback>
                        </Avatar>
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="h-8 w-8 text-white" />
                        </div>
                    </div>
                    <div>
                        <CardTitle>Datos de la Empresa</CardTitle>
                        <CardDescription>
                        Esta información se usará en los encabezados de los documentos. Haz clic en el logo para cambiarlo.
                        </CardDescription>
                    </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="systemName">Nombre del Sistema</Label>
                    <Input 
                      id="systemName" 
                      value={companyData.systemName || ''}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre de la Empresa</Label>
                    <Input 
                      id="name" 
                      value={companyData.name}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxId">ID de Contribuyente / Cédula Jurídica</Label>
                    <Input 
                      id="taxId" 
                      value={companyData.taxId}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Dirección</Label>
                    <Textarea 
                      id="address" 
                      rows={3}
                      value={companyData.address}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input 
                          id="phone" 
                          value={companyData.phone}
                          onChange={handleChange}
                      />
                      </div>
                      <div className="space-y-2">
                      <Label htmlFor="email">Correo Electrónico</Label>
                      <Input 
                          id="email" 
                          type="email"
                          value={companyData.email}
                          onChange={handleChange}
                      />
                      </div>
                  </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Ajustes de Interfaz y Rendimiento</CardTitle>
                    <CardDescription>Configuración global para la experiencia de usuario y el acceso a la aplicación.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="systemVersion">Versión del Sistema</Label>
                        <Input 
                            id="systemVersion"
                            value={companyData.systemVersion || ''}
                            onChange={handleChange}
                        />
                        <p className="text-xs text-muted-foreground pt-1">
                            El número de versión que se muestra en la aplicación.
                        </p>
                    </div>
                   <div className="space-y-2">
                      <Label htmlFor="searchDebounceTime">Retraso de Búsqueda (ms)</Label>
                      <Input 
                          id="searchDebounceTime"
                          type="number"
                          value={companyData.searchDebounceTime ?? ''}
                          onChange={handleNumberChange}
                      />
                       <p className="text-xs text-muted-foreground pt-1">
                          Tiempo en milisegundos que el sistema espera antes de buscar (ej: 500 = 0.5s).
                       </p>
                  </div>
                   <div className="space-y-2">
                      <Label htmlFor="syncWarningHours">Tiempo para Alerta de Sinc.</Label>
                       <Input 
                          id="syncWarningHours"
                          type="text"
                          placeholder="HH:MM"
                          value={syncWarningDisplay}
                          onChange={handleSyncWarningChange}
                      />
                       <p className="text-xs text-muted-foreground pt-1">
                          Después de cuánto tiempo sin sincronizar se mostrará la alerta. Formato HH:MM o decimal (ej: 0.5 para 30 min).
                       </p>
                  </div>
                   <div className="space-y-2">
                        <Label htmlFor="timeZone">Zona Horaria Comercial</Label>
                        <select 
                            id="timeZone"
                            value={companyData.timeZone || 'America/Costa_Rica'}
                            onChange={(e) => setCompanyData(prev => prev ? ({...prev, timeZone: e.target.value}) : null)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <optgroup label="Centroamérica y Latam">
                                <option value="America/Costa_Rica">🇨🇷 Costa Rica (GMT-6)</option>
                                <option value="America/Panama">🇵🇦 Panamá (GMT-5)</option>
                                <option value="America/Bogota">🇨🇴 Colombia (GMT-5)</option>
                                <option value="America/Mexico_City">🇲🇽 México (GMT-6)</option>
                                <option value="America/Guatemala">🇬🇹 Guatemala (GMT-6)</option>
                                <option value="America/El_Salvador">🇸🇻 El Salvador (GMT-6)</option>
                                <option value="America/Managua">🇳🇮 Nicaragua (GMT-6)</option>
                                <option value="America/Tegucigalpa">🇭🇳 Honduras (GMT-6)</option>
                            </optgroup>
                            <optgroup label="Otras Zonas">
                                <option value="UTC">🌐 UTC (GMT+0)</option>
                                <option value="America/New_York">🇺🇸 US Eastern (GMT-5)</option>
                            </optgroup>
                        </select>
                        <p className="text-xs text-muted-foreground pt-1">
                            Huso horario que el bot de Telegram y la consola usarán para delimitar la jornada laboral.
                        </p>
                   </div>
                  <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="publicUrl">URL Pública de la Aplicación</Label>
                      <Input 
                          id="publicUrl"
                          type="url"
                          value={companyData.publicUrl || ''}
                          onChange={handleChange}
                          placeholder="Ej: https://intranet.miempresa.com"
                      />
                       <p className="text-xs text-muted-foreground pt-1">
                          Importante para generar códigos QR correctos si la aplicación está detrás de un proxy. Dejar en blanco si se accede por IP.
                       </p>
                  </div>
                </CardContent>
            </Card>

            <Card className="mt-6">
                <CardFooter className="border-t px-6 py-4">
                  <Button>
                    <Save className="mr-2 h-4 w-4"/>
                    Guardar Todos los Cambios
                  </Button>
                </CardFooter>
            </Card>
          </form>
        </div>
      </main>
  );
}
