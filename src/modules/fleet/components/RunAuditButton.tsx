'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from '@/modules/core/hooks/use-toast';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { runFleetAuditManuallyAction } from '../lib/actions';
import { useRouter } from 'next/navigation';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";

export default function RunAuditButton() {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleRunAudit = async (sendAlerts: boolean) => {
        setDialogOpen(false);
        setLoading(true);
        try {
            const result = await runFleetAuditManuallyAction(sendAlerts);
            
            // Refresh panels immediately
            router.refresh();

            if (sendAlerts) {
                toast({
                    title: "¡Auditoría y Envío de Alertas Completados!",
                    description: `Se analizaron ${result.checkedCount} vehículos y se enviaron ${result.alertsSent} alertas pendientes por correo/Telegram.`,
                    className: "bg-emerald-600 border-emerald-500 text-white font-semibold",
                });
            } else {
                toast({
                    title: "¡Revisión Silenciosa Completada!",
                    description: `Se analizaron ${result.checkedCount} vehículos. Los umbrales de alerta en base de datos y los paneles visuales se actualizaron de forma silenciosa sin enviar notificaciones.`,
                    className: "bg-indigo-600 border-indigo-500 text-white font-semibold",
                });
            }
        } catch (e: any) {
            toast({
                variant: "destructive",
                title: "Error al auditar",
                description: e.message || "No se pudo ejecutar la auditoría de alertas.",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Button 
                onClick={() => setDialogOpen(true)}
                disabled={loading}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all flex items-center justify-center gap-2"
            >
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analizando Flota...
                    </>
                ) : (
                    <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Revisar todo lo pendiente
                    </>
                )}
            </Button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md border-indigo-100">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-700 font-bold text-lg">
                            <ShieldCheck className="w-5 h-5 text-indigo-600 animate-pulse" />
                            Análisis Técnico de Flotas
                        </DialogTitle>
                        <DialogDescription className="pt-3 text-slate-600 leading-relaxed text-sm">
                            El sistema auditará de forma exhaustiva el odómetro actual, kilometraje de cambio de aceite, planes preventivos, vigencia de RTV y permisos especiales de todos los vehículos activos para reflejar los estados reales en el panel de control.
                            <br /><br />
                            <strong>¿Desea enviar notificaciones (correo electrónico y Telegram) a los responsables durante este análisis?</strong>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col sm:flex-row justify-end gap-2 pt-5 border-t border-slate-100 mt-4">
                        <Button
                            variant="outline"
                            onClick={() => setDialogOpen(false)}
                            disabled={loading}
                            className="text-xs h-9 sm:order-1"
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => handleRunAudit(false)}
                            disabled={loading}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs h-9 sm:order-2"
                        >
                            Revisar Silenciosamente
                        </Button>
                        <Button
                            onClick={() => handleRunAudit(true)}
                            disabled={loading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 sm:order-3"
                        >
                            Revisar y Enviar Alertas
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
