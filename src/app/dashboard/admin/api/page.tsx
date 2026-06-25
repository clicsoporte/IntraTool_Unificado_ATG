
"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";
import type { ApiSettings, ExemptionLaw } from "@/modules/core/types";
import { logInfo, logError, logWarn } from "@/modules/core/lib/logger";
import { getApiSettings, saveApiSettings, getExemptionLaws, saveExemptionLaws } from "@/modules/core/lib/db";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { PlusCircle, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const initialApiSettings: ApiSettings = {
    exchangeRateApi: "https://api.hacienda.go.cr/indicadores/tc/dolar",
    haciendaExemptionApi: "https://api.hacienda.go.cr/fe/ex?autorizacion=",
    haciendaTributariaApi: "https://api.hacienda.go.cr/fe/ae?identificacion=",
    recopeApi: "",
}

const emptyLaw: ExemptionLaw = {
    docType: "",
    institutionName: "",
    authNumber: null
};

export default function ApiSettingsPage() {
  const { isAuthorized } = useAuthorization(['admin:settings:api']);
  const { toast } = useToast();
  const [apiSettings, setApiSettings] = useState<ApiSettings>(initialApiSettings);
  const [exemptionLaws, setExemptionLaws] = useState<ExemptionLaw[]>([]);
  const [isLawsLoading, setIsLawsLoading] = useState(true);
  const { setTitle } = usePageTitle();
  
  // State for dialogs
  const [isLawDialogOpen, setLawDialogOpen] = useState(false);
  const [currentLaw, setCurrentLaw] = useState<ExemptionLaw | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [lawToDelete, setLawToDelete] = useState<ExemptionLaw | null>(null);

  useEffect(() => {
    setTitle("Configuración de API y Leyes");
    const fetchSettings = async () => {
        const [savedApiData, savedLawsData] = await Promise.all([
            getApiSettings(),
            getExemptionLaws()
        ]);
        
        if (savedApiData) {
            setApiSettings({ ...initialApiSettings, ...savedApiData });
        }
        setExemptionLaws(savedLawsData);
        setIsLawsLoading(false);
    }
    if (isAuthorized) {
        fetchSettings();
    }
  }, [setTitle, isAuthorized]);

  const handleApiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setApiSettings(prev => ({...prev, [id]: value}));
  }

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        await saveApiSettings(apiSettings);
        await saveExemptionLaws(exemptionLaws);
        toast({
        title: "Configuración Guardada",
        description: "Los cambios en las APIs y leyes han sido guardados.",
        });
        await logInfo("Configuración de API y Leyes guardada", { settings: apiSettings, laws: exemptionLaws });
    } catch(error: any) {
        logError("Failed to save API settings", { error: error.message });
        toast({ title: "Error", description: "No se pudieron guardar los ajustes.", variant: "destructive"});
    }
  };
  
  const handleOpenLawDialog = (law?: ExemptionLaw) => {
      if (law) {
          setCurrentLaw(law);
          setIsEditing(true);
      } else {
          setCurrentLaw(emptyLaw);
          setIsEditing(false);
      }
      setLawDialogOpen(true);
  };
  
  const handleSaveLaw = () => {
      if (!currentLaw || !currentLaw.docType || !currentLaw.institutionName) {
          toast({ title: "Datos incompletos", description: "El Tipo de Documento y el Nombre de la Institución son requeridos.", variant: "destructive" });
          return;
      }
      
      let updatedLaws;
      if (isEditing) {
          updatedLaws = exemptionLaws.map(law => law.docType === currentLaw.docType ? currentLaw : law);
      } else {
          if (exemptionLaws.some(law => law.docType === currentLaw.docType)) {
              toast({ title: "Error", description: "El Tipo de Documento ya existe.", variant: "destructive" });
              return;
          }
          updatedLaws = [...exemptionLaws, currentLaw];
      }
      setExemptionLaws(updatedLaws);
      setLawDialogOpen(false);
      setCurrentLaw(null);
  };
  
  const handleDeleteLaw = useCallback(() => {
      if (!lawToDelete) return;
      setExemptionLaws(prevLaws => (prevLaws || []).filter(law => law.docType !== lawToDelete.docType));
      logWarn("Exemption law deleted", { docType: lawToDelete.docType });
      toast({ title: "Ley Eliminada", description: "La ley de exoneración ha sido eliminada. Guarda los cambios para confirmar.", variant: "destructive"});
      setLawToDelete(null);
  }, [lawToDelete, toast]);

  if (isAuthorized === null) {
      return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-2xl space-y-6">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        </main>
      );
  }

  if (isAuthorized === false) {
      return null;
  }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl">
          <form onSubmit={handleSaveAll}>
            <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>APIs Externas</CardTitle>
                    <CardDescription>
                      Gestionar las URLs para las integraciones de API.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="exchangeRateApi">API de Tipo de Cambio (Hacienda CR)</Label>
                      <Input 
                        id="exchangeRateApi" 
                        value={apiSettings.exchangeRateApi || ''}
                        onChange={handleApiChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="haciendaExemptionApi">API de Exoneraciones (Hacienda CR)</Label>
                      <Input 
                        id="haciendaExemptionApi" 
                        value={apiSettings.haciendaExemptionApi || ''}
                        onChange={handleApiChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="haciendaTributariaApi">API de Situación Tributaria (Hacienda CR)</Label>
                      <Input 
                        id="haciendaTributariaApi" 
                        value={apiSettings.haciendaTributariaApi || ''}
                        onChange={handleApiChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recopeApi">API Recope Precios combustible</Label>
                      <Input 
                        id="recopeApi" 
                        value={apiSettings.recopeApi || ''}
                        onChange={handleApiChange}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Leyes de Exoneración</CardTitle>
                                <CardDescription>
                                Gestiona las leyes que se asocian a un tipo de documento.
                                </CardDescription>
                            </div>
                            <Button type="button" size="sm" onClick={() => handleOpenLawDialog()}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Añadir Ley
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLawsLoading ? (
                            <Skeleton className="h-40 w-full" />
                        ) : (
                            <div className="space-y-4">
                                {exemptionLaws.map(law => (
                                    <div key={law.docType} className="flex items-center justify-between rounded-lg border p-3">
                                        <div className="space-y-1">
                                            <p className="font-medium">{law.institutionName}</p>
                                            <p className="text-sm text-muted-foreground">
                                                Tipo Doc: <span className="font-mono">{law.docType}</span>
                                                {law.authNumber && ` | Nº Autorización: ${law.authNumber}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenLawDialog(law)}>
                                                Editar
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLawToDelete(law)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Eliminar esta ley?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción no se puede deshacer. Se eliminará la ley &apos;{law.institutionName}&apos;.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel onClick={() => setLawToDelete(null)}>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleDeleteLaw}>Sí, eliminar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
                
                <Card>
                    <CardFooter className="border-t px-6 py-4">
                        <Button type="submit">Guardar Todos los Cambios</Button>
                    </CardFooter>
                </Card>
            </div>
          </form>
        </div>

        {/* Dialog for adding/editing laws */}
        <Dialog open={isLawDialogOpen} onOpenChange={setLawDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEditing ? "Editar Ley de Exoneración" : "Añadir Nueva Ley"}</DialogTitle>
                    <DialogDescription>
                        Define la asociación entre un Tipo de Documento y su nombre o ley.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="docType">Tipo de Documento (Código)</Label>
                        <Input 
                            id="docType" 
                            value={currentLaw?.docType || ''}
                            onChange={(e) => setCurrentLaw(prev => prev ? {...prev, docType: e.target.value} : null)}
                            placeholder="Ej: 03, 99"
                            disabled={isEditing}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="institutionName">Nombre de la Institución/Ley</Label>
                        <Input 
                            id="institutionName" 
                            value={currentLaw?.institutionName || ''}
                            onChange={(e) => setCurrentLaw(prev => prev ? {...prev, institutionName: e.target.value} : null)}
                            placeholder="Ej: Régimen de Zona Franca"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="authNumber">Nº de Autorización</Label>
                        <Input 
                            id="authNumber" 
                            value={currentLaw?.authNumber || ''}
                            onChange={(e) => setCurrentLaw(prev => prev ? {...prev, authNumber: e.target.value} : null)}
                            placeholder="Ej: 9635 (usado para casos especiales)"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="ghost">Cancelar</Button></DialogClose>
                    <Button type="button" onClick={handleSaveLaw}>Guardar Ley</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </main>
  );
}
