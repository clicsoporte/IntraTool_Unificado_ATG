/**
 * @fileoverview The main header component for the application's authenticated layout.
 * It displays the current page title, global actions (sync, suggestions, exchange rate),
 * and the user navigation menu.
 */
"use client";

import { useState, useEffect } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserNav } from "./user-nav";
import { NotificationBell } from "./notification-bell";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { useToast } from "@/modules/core/hooks/use-toast";
import { logError, logInfo } from "@/modules/core/lib/logger";
import { syncAllData } from "@/modules/core/lib/actions";
import { addSuggestion } from "@/modules/core/lib/suggestions-actions";
import { format, parseISO } from 'date-fns';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw, Clock, DollarSign, Send, MessageSquare, PanelLeft, Calculator } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QuickCalculator } from "@/components/dashboard/quick-calculator";

interface HeaderProps {
  title: string;
}

function HeaderActions() {
    const { user, companyData, setCompanyData, exchangeRateData, refreshExchangeRate, updateUnreadSuggestionsCount } = useAuth();
    const { hasPermission } = useAuthorization(['admin:import:run']);
    const { toast } = useToast();

    const [isSyncing, setIsSyncing] = useState(false);
    const [isRateRefreshing, setIsRateRefreshing] = useState(false);
    const [suggestion, setSuggestion] = useState("");
    const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
    const [isSuggestionDialogOpen, setSuggestionDialogOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState<Date | null>(null);

    useEffect(() => {
        setCurrentTime(new Date());
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const getTimezoneOffsetString = (date: Date) => {
        const offset = -date.getTimezoneOffset();
        const sign = offset >= 0 ? '+' : '-';
        const hours = Math.floor(Math.abs(offset) / 60);
        const minutes = Math.abs(offset) % 60;
        return `GMT${sign}${hours}${minutes > 0 ? `:${String(minutes).padStart(2, '0')}` : ''}`;
    };

    const isSyncOld = companyData?.lastSyncTimestamp && companyData?.syncWarningHours 
      ? (new Date().getTime() - parseISO(companyData.lastSyncTimestamp).getTime()) > (companyData.syncWarningHours * 60 * 60 * 1000) 
      : false;

    const handleFullSync = async () => {
      if (!hasPermission('admin:import:run')) {
        toast({ title: "Acceso Denegado", description: "No tienes permiso para sincronizar.", variant: "destructive" });
        return;
      }
      setIsSyncing(true);
      toast({ title: "Iniciando Sincronización Completa", description: "Importando todos los datos desde el ERP..." });
      try {
          const { results, totalTasks } = await syncAllData();
          toast({
              title: "Sincronización Completa Exitosa",
              description: `Se han procesado ${results.length} de ${totalTasks} tipos de datos desde el ERP. Los datos se reflejarán automáticamente.`,
          });
          await logInfo("Full ERP data synchronization completed via header button.", { results });
          if (companyData) {
              setCompanyData({ ...companyData, lastSyncTimestamp: new Date().toISOString() });
          }
      } catch (error: any) {
           toast({ title: "Error en Sincronización", description: error.message, variant: "destructive" });
           await logError(`Error durante la sincronización completa desde el header`, { error: error.message });
      } finally {
          setIsSyncing(false);
      }
    };

    const handleRateRefresh = async () => {
        setIsRateRefreshing(true);
        await refreshExchangeRate();
        toast({ title: "Tipo de Cambio Actualizado", description: "Se ha obtenido el valor más reciente de la API." });
        setIsRateRefreshing(false);
    };

    const handleSuggestionSubmit = async () => {
        if (!suggestion.trim() || !user) return;
        setIsSubmittingSuggestion(true);
        try {
            await addSuggestion(suggestion, user.id, user.name);
            toast({ title: "¡Gracias por tu Sugerencia!", description: "Hemos recibido tu idea y la revisaremos pronto." });
            setSuggestion("");
            setSuggestionDialogOpen(false);
            await updateUnreadSuggestionsCount();
        } catch (error: any) {
            toast({ title: "Error al Enviar", description: `No se pudo enviar tu sugerencia: ${error.message}`, variant: "destructive" });
        } finally {
            setIsSubmittingSuggestion(false);
        }
    };

    return (
        <>
            {currentTime && (
                <div className="hidden items-center gap-2 text-sm text-muted-foreground p-2 border rounded-lg md:flex bg-slate-50/50 dark:bg-slate-900/10">
                    <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                    <span className="font-mono text-xs font-semibold">
                        {format(currentTime, 'dd/MM/yy HH:mm:ss')}
                        <span className="text-[10px] text-slate-400 ml-1.5 font-sans font-bold">({getTimezoneOffsetString(currentTime)})</span>
                    </span>
                </div>
            )}
            {exchangeRateData.rate && (
                <div className="hidden items-center gap-2 text-sm text-muted-foreground p-2 border rounded-lg sm:flex">
                    <DollarSign className="h-4 w-4"/>
                    <span>TC Venta: <strong>{exchangeRateData.rate.toLocaleString('es-CR')}</strong></span>
                    <span className="text-xs hidden md:inline">({exchangeRateData.date})</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRateRefresh} disabled={isRateRefreshing}>
                        {isRateRefreshing ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                    </Button>
                </div>
            )}
            {companyData?.lastSyncTimestamp && (
                <div className={cn("hidden items-center gap-2 text-sm text-muted-foreground p-2 border rounded-lg sm:flex", isSyncOld && "text-red-500 font-medium border-red-500/50 bg-red-50")}>
                    <Clock className="h-4 w-4" />
                    <span className="hidden lg:inline">Última Sinc:</span>
                    <strong>{format(parseISO(companyData.lastSyncTimestamp), 'dd/MM/yy HH:mm')}</strong>
                </div>
            )}
             {hasPermission('admin:import:run') && (
                <Button onClick={handleFullSync} disabled={isSyncing} variant="outline" className="h-9 w-9 p-0 sm:w-auto sm:px-3">
                    {isSyncing ? <Loader2 className="animate-spin h-4 w-4" /> : <RefreshCw className={cn("h-4 w-4", isSyncOld && "animate-pulse text-red-500")}/>}
                    <span className="hidden sm:inline ml-2">Sincronizar ERP</span>
                </Button>
            )}
            <Dialog open={isSuggestionDialogOpen} onOpenChange={setSuggestionDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 h-9 w-9 p-0 sm:w-auto sm:px-3">
                        <MessageSquare />
                        <span className="hidden sm:inline ml-2">Sugerencias</span>
                    </Button>
                </DialogTrigger>
                <DialogContent>
                     <DialogHeader>
                        <DialogTitle>Buzón de Sugerencias y Mejoras</DialogTitle>
                        <DialogDescription>
                            ¿Tienes una idea para mejorar la aplicación? ¿Encontraste algo que no funciona como esperabas? Déjanos tu sugerencia aquí.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        <Label htmlFor="suggestion-box" className="sr-only">Tu sugerencia</Label>
                        <Textarea id="suggestion-box" placeholder="Describe tu idea o el problema que encontraste..." rows={4} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSuggestionSubmit} disabled={isSubmittingSuggestion || !suggestion.trim()}>
                            {isSubmittingSuggestion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Enviar Sugerencia
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <Calculator className="h-5 w-5" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 mr-4 p-1">
                    <QuickCalculator />
                </PopoverContent>
            </Popover>
            <NotificationBell />
            <UserNav />
             {(isSyncing || isRateRefreshing) && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-primary p-3 text-primary-foreground shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Procesando...</span>
                </div>
            )}
        </>
    );
}


/**
 * Renders the main application header.
 * @param {HeaderProps} props - The properties for the component.
 * @param {string} props.title - The title to be displayed in the header, typically controlled by the current page.
 * @returns {JSX.Element} The header component.
 */
export function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="h-8 w-8 bg-primary/10 text-primary" >
          <PanelLeft />
        </SidebarTrigger>
        <h1 className="text-2xl font-semibold hidden sm:block">{title}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <HeaderActions />
      </div>
    </header>
  );
}
