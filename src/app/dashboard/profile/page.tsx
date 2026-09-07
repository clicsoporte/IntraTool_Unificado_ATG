/**
 * @fileoverview User profile settings page.
 * Allows the currently logged-in user to update their personal information,
 * security question, and password. This is the single source of truth for user self-service updates.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/modules/core/hooks/use-toast";
import type { User } from "@/modules/core/types";
import { Skeleton } from "@/components/ui/skeleton";
import { logInfo, logError } from "@/modules/core/lib/logger";
import { Separator } from "@/components/ui/separator";
import { comparePasswords, getUserPreference, saveUserPreference, updateOwnProfile } from "@/modules/core/lib/auth-client";
import { getEmployeeDetails } from "@/modules/core/lib/user-actions";
import { getMyAssignedAssets } from "@/modules/it-tools/lib/actions";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useDropzone } from "react-dropzone";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Camera, Laptop, Smartphone, Calendar as CalendarIcon, Lock, Bell, Mail, Send, Truck, Wrench, TicketCheck, ShieldCheck, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { getInitials } from "@/lib/utils";

/**
 * Renders the user profile settings page.
 * Fetches the current user's data and provides forms to update their details
 * and change their password.
 */
export default function ProfilePage() {
  const { toast } = useToast();
  const { user, isAuthReady, refreshAuth } = useAuth();
  const { hasPermission } = useAuthorization(['users:edit:erp-alias']);
  const { setTitle } = usePageTitle();
  
  const [formData, setFormData] = useState({
      name: "",
      email: "",
      phone: "",
      whatsapp: "",
      erpAlias: "",
      avatar: ""
  });
  
  // Notification Preferences State (Multi-Module Granular)
  const [notifPrefs, setNotifPrefs] = useState({
      master: true,
      // Channels
      channelEmail: true,
      channelTelegram: true,
      channelSms: true,
      // Logistics / Deliveries
      deliveryCompleted: true,
      deliveryIncomplete: true,
      deliveryRejected: true,
      routeFinalized: false,
      // Fleet
      fleetMaintenance: true,
      fleetPermits: true,
      fleetFuelAnomalies: true,
      // Tickets & IT
      ticketsAssigned: true,
      ticketsStatusChange: true,
      ticketsUrgent: true,
  });
  
  const [employeeDetails, setEmployeeDetails] = useState<any>(null);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [myAssets, setMyAssets] = useState<any[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // State for the password change form
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  useEffect(() => {
    setTitle("Configuración de Perfil");
    if (user) {
        setFormData({
            name: user.name || "",
            email: user.email || "",
            phone: user.phone || "",
            whatsapp: user.whatsapp || "",
            erpAlias: user.erpAlias || "",
            avatar: user.avatar || ""
        });
        
        // Fetch Granular Notification Preferences
        const keys = [
            'notif_master',
            'notif_channel_email',
            'notif_channel_telegram',
            'notif_channel_sms',
            'ops_notif_delivery_completed',
            'ops_notif_delivery_incomplete',
            'ops_notif_delivery_rejected',
            'ops_notif_route_finalized',
            'fleet_notif_maintenance',
            'fleet_notif_permits',
            'fleet_notif_fuel_anomalies',
            'tickets_notif_assigned',
            'tickets_notif_status_change',
            'tickets_notif_urgent',
            // legacy fallback
            'ops_delivery_notifications_enabled'
        ];

        Promise.all(keys.map(k => getUserPreference(user.id, k)))
            .then(([
                master, chEmail, chTelegram, chSms,
                delComp, delIncomp, delRej, rtFin,
                fltMaint, fltPermits, fltFuel,
                tktAssigned, tktStatus, tktUrgent,
                legacyOps
            ]) => {
                const legacyVal = legacyOps !== null ? (legacyOps === true || legacyOps === 'true') : true;

                setNotifPrefs({
                    master: master !== null ? (master === true || master === 'true') : legacyVal,
                    channelEmail: chEmail !== null ? (chEmail === true || chEmail === 'true') : true,
                    channelTelegram: chTelegram !== null ? (chTelegram === true || chTelegram === 'true') : true,
                    channelSms: chSms !== null ? (chSms === true || chSms === 'true') : true,
                    deliveryCompleted: delComp !== null ? (delComp === true || delComp === 'true') : legacyVal,
                    deliveryIncomplete: delIncomp !== null ? (delIncomp === true || delIncomp === 'true') : true,
                    deliveryRejected: delRej !== null ? (delRej === true || delRej === 'true') : true,
                    routeFinalized: rtFin !== null ? (rtFin === true || rtFin === 'true') : false,
                    fleetMaintenance: fltMaint !== null ? (fltMaint === true || fltMaint === 'true') : true,
                    fleetPermits: fltPermits !== null ? (fltPermits === true || fltPermits === 'true') : true,
                    fleetFuelAnomalies: fltFuel !== null ? (fltFuel === true || fltFuel === 'true') : true,
                    ticketsAssigned: tktAssigned !== null ? (tktAssigned === true || tktAssigned === 'true') : true,
                    ticketsStatusChange: tktStatus !== null ? (tktStatus === true || tktStatus === 'true') : true,
                    ticketsUrgent: tktUrgent !== null ? (tktUrgent === true || tktUrgent === 'true') : true,
                });
            })
            .catch(err => {
                console.error('Failed to load user notification preferences:', err);
            });

        // Load assigned IT assets
        setLoadingAssets(true);
        getMyAssignedAssets().then(assets => {
            setMyAssets(assets);
        }).catch(err => {
            console.error('Failed to load assigned assets:', err);
        }).finally(() => {
            setLoadingAssets(false);
        });

        if (user.employeeId) {
            setLoadingEmployee(true);
            getEmployeeDetails(user.employeeId).then(details => {
                setEmployeeDetails(details);
            }).catch(err => {
                console.error('Failed to load employee details:', err);
            }).finally(() => {
                setLoadingEmployee(false);
            });
        } else {
            setEmployeeDetails(null);
        }
    }
  }, [setTitle, user]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({...prev, avatar: base64String}));
      };
      reader.readAsDataURL(file);
    }
  }, []);

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

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setPasswords((prev) => ({ ...prev, [id]: value }));
  }

  const handleSubmit = async () => {
    if (!user) return;

    const updateData: Partial<User> = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        whatsapp: formData.whatsapp,
        erpAlias: formData.erpAlias,
        avatar: formData.avatar,
    };

    if (passwords.current || passwords.new || passwords.confirm) {
      if (!passwords.current || !passwords.new || !passwords.confirm) {
          toast({ title: "Error", description: "Por favor, complete todos los campos de contraseña para cambiarla.", variant: "destructive" });
          return;
      }
      if (passwords.new !== passwords.confirm) {
          toast({ title: "Error", description: "La nueva contraseña y la confirmación no coinciden.", variant: "destructive" });
          return;
      }
      
      const isCurrentPasswordCorrect = await comparePasswords(user.id, passwords.current);
      if (!isCurrentPasswordCorrect) {
          toast({ title: "Error de Autenticación", description: "La contraseña actual es incorrecta.", variant: "destructive" });
          return;
      }

      updateData.password = passwords.new;
      toast({
        title: "Contraseña Actualizada",
        description: "Tu contraseña ha sido cambiada exitosamente.",
      });
      await logInfo("User password updated by self", { user: user.name });
      setPasswords({ current: "", new: "", confirm: "" });
    }
    
    try {
        const res = await updateOwnProfile(updateData);
        if (!res.success) {
            throw new Error(res.error);
        }
        
        // Save Granular Notification Preferences
        await Promise.all([
            saveUserPreference(user.id, 'notif_master', notifPrefs.master),
            saveUserPreference(user.id, 'notif_channel_email', notifPrefs.channelEmail),
            saveUserPreference(user.id, 'notif_channel_telegram', notifPrefs.channelTelegram),
            saveUserPreference(user.id, 'ops_notif_delivery_completed', notifPrefs.deliveryCompleted),
            saveUserPreference(user.id, 'ops_notif_delivery_incomplete', notifPrefs.deliveryIncomplete),
            saveUserPreference(user.id, 'ops_notif_delivery_rejected', notifPrefs.deliveryRejected),
            saveUserPreference(user.id, 'ops_notif_route_finalized', notifPrefs.routeFinalized),
            saveUserPreference(user.id, 'fleet_notif_maintenance', notifPrefs.fleetMaintenance),
            saveUserPreference(user.id, 'fleet_notif_permits', notifPrefs.fleetPermits),
            saveUserPreference(user.id, 'fleet_notif_fuel_anomalies', notifPrefs.fleetFuelAnomalies),
            saveUserPreference(user.id, 'tickets_notif_assigned', notifPrefs.ticketsAssigned),
            saveUserPreference(user.id, 'tickets_notif_status_change', notifPrefs.ticketsStatusChange),
            saveUserPreference(user.id, 'tickets_notif_urgent', notifPrefs.ticketsUrgent),
            // Maintain legacy compatibility key
            saveUserPreference(user.id, 'ops_delivery_notifications_enabled', notifPrefs.master && notifPrefs.deliveryCompleted)
        ]);
        
        toast({
          title: "Perfil Actualizado",
          description: "Tu información y preferencias de notificación han sido guardadas exitosamente.",
        });
        await refreshAuth();
    } catch (error: any) {
        toast({
            title: "Error al Guardar",
            description: `No se pudo actualizar tu perfil: ${error.message}`,
            variant: "destructive"
        });
    }
  };
  
  if (!isAuthReady || !user) {
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-2xl">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-full mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                    <CardFooter className="border-t px-6 py-4">
                        <Skeleton className="h-10 w-24" />
                    </CardFooter>
                </Card>
            </div>
        </main>
    );
  }

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mi Perfil</h1>
          <p className="text-sm text-muted-foreground">
            Administra tu información personal, seguridad y preferencias de notificaciones.
          </p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <Card>
            <CardHeader>
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>
                Actualiza tu foto, datos de contacto y credenciales de acceso.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <Avatar className="h-24 w-24 border-2 border-primary/20 shadow-md">
                  <AvatarImage src={formData.avatar} alt={formData.name} />
                  <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                    {getInitials(formData.name)}
                  </AvatarFallback>
                </Avatar>
                <div {...getRootProps()} className="flex-1 cursor-pointer border-2 border-dashed border-muted hover:border-primary/50 transition-colors rounded-xl p-4 text-center">
                  <input {...getInputProps()} />
                  <Camera className="mx-auto h-6 w-6 text-muted-foreground mb-1" />
                  <p className="text-xs font-semibold text-foreground">
                    Arrastra una foto aquí o haz clic para seleccionarla
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Formatos: JPG, PNG o WEBP (máx. 2MB)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre Completo</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={handleProfileChange}
                    className="font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleProfileChange}
                    className="font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="erpAlias">Alias de Usuario (ERP)</Label>
                  {!hasPermission('users:edit:erp-alias') && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      <Lock className="w-3 h-3" /> Solo Lectura
                    </span>
                  )}
                </div>
                <Input
                  id="erpAlias"
                  value={formData.erpAlias || ''}
                  onChange={handleProfileChange}
                  placeholder="Tu nombre de usuario en el sistema ERP"
                  disabled={!hasPermission('users:edit:erp-alias')}
                  className={!hasPermission('users:edit:erp-alias') ? "bg-muted/50 text-muted-foreground cursor-not-allowed font-medium" : "font-medium"}
                />
                <p className="text-xs text-muted-foreground">
                  {hasPermission('users:edit:erp-alias') ? (
                    "Este alias se usará para asociar tus órdenes de venta, solicitudes y entregas generadas."
                  ) : (
                    "🔒 La edición del Alias ERP está protegida. Contacta a un administrador para modificarlo."
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="font-bold flex items-center justify-between">
                    <span>Teléfono / Celular</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold">📱 Requerido para SMS</span>
                  </Label>
                  <Input
                    id="phone"
                    value={formData.phone || ''}
                    onChange={handleProfileChange}
                    placeholder="Ej. +50688888888 o 88888888"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Formato recomendado: <code className="text-indigo-600 dark:text-indigo-400 font-bold">+50688888888</code> o 8 dígitos <code className="text-indigo-600 dark:text-indigo-400 font-bold">88888888</code> (Usado para SMS del chofer).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp" className="font-bold">WhatsApp Notificaciones</Label>
                  <Input
                    id="whatsapp"
                    value={formData.whatsapp || ''}
                    onChange={handleProfileChange}
                    placeholder="Ej. +50688888888"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Número asignado para alertas vía WhatsApp.
                  </p>
                </div>
              </div>

              {/* Centro de Preferencias Granulares de Notificaciones */}
              <Separator className="my-6" />
              
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent border border-blue-500/20 rounded-2xl">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                        Centro de Notificaciones y Alertas
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Control maestro y granular de avisos por correo y Telegram para tus actividades.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className="text-xs font-bold text-muted-foreground">
                      {notifPrefs.master ? 'Todas Activas' : 'Silenciadas'}
                    </span>
                    <Switch
                      checked={notifPrefs.master}
                      onCheckedChange={(val) => setNotifPrefs(prev => ({ ...prev, master: val }))}
                    />
                  </div>
                </div>

                {/* Sub-paneles granulares (deshabilitados visualmente si master está apagado) */}
                <div className={`space-y-4 transition-opacity ${notifPrefs.master ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  
                  {/* Canales de Entrega */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                      Canales de Recepción Habilitados
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-950 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-emerald-600" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">Correo Electrónico</span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">{formData.email || 'Sin correo'}</span>
                          </div>
                        </div>
                        <Switch
                          checked={notifPrefs.channelEmail}
                          onCheckedChange={(val) => setNotifPrefs(prev => ({ ...prev, channelEmail: val }))}
                        />
                      </div>

                      <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-950 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-sky-500" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">Bot de Telegram</span>
                            <span className="text-[10px] text-muted-foreground">
                              {user.telegramChatId ? `Vinculado (${user.telegramChatId})` : 'No vinculado'}
                            </span>
                          </div>
                        </div>
                        <Switch
                          checked={notifPrefs.channelTelegram}
                          onCheckedChange={(val) => setNotifPrefs(prev => ({ ...prev, channelTelegram: val }))}
                        />
                      </div>

                      <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-950 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-amber-500" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">Mensajes SMS</span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                              {formData.phone ? formData.phone : 'Sin celular'}
                            </span>
                          </div>
                        </div>
                        <Switch
                          checked={notifPrefs.channelSms ?? true}
                          onCheckedChange={(val) => setNotifPrefs(prev => ({ ...prev, channelSms: val }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 1. Logística y Despachos */}
                  <div className="p-4 border rounded-xl space-y-3 bg-card shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                          Logística y Entregas (Tus Facturas / Despachos)
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-bold border-emerald-500/20 bg-emerald-500/5 text-emerald-600">
                        Ventas & Facturación
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="delComp"
                          checked={notifPrefs.deliveryCompleted}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, deliveryCompleted: !!c }))}
                        />
                        <Label htmlFor="delComp" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Entregas Completas (Exitosas)
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="delIncomp"
                          checked={notifPrefs.deliveryIncomplete}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, deliveryIncomplete: !!c }))}
                        />
                        <Label htmlFor="delIncomp" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Entregas Incompletas / Parciales
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="delRej"
                          checked={notifPrefs.deliveryRejected}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, deliveryRejected: !!c }))}
                        />
                        <Label htmlFor="delRej" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-rose-500" /> Entregas Rechazadas / Incidencias
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="rtFin"
                          checked={notifPrefs.routeFinalized}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, routeFinalized: !!c }))}
                        />
                        <Label htmlFor="rtFin" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" /> Liquidación / Cierre de Hoja de Ruta
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* 2. Flota Vehicular */}
                  <div className="p-4 border rounded-xl space-y-3 bg-card shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                          Flota Vehicular & Transportes
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-bold border-purple-500/20 bg-purple-500/5 text-purple-600">
                        Operaciones
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="fltMaint"
                          checked={notifPrefs.fleetMaintenance}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, fleetMaintenance: !!c }))}
                        />
                        <Label htmlFor="fltMaint" className="text-xs font-medium cursor-pointer">
                          🛠️ Mantenimientos Preventivos / Vencidos
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="fltPermits"
                          checked={notifPrefs.fleetPermits}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, fleetPermits: !!c }))}
                        />
                        <Label htmlFor="fltPermits" className="text-xs font-medium cursor-pointer">
                          📄 Vencimiento de RTV, Marchamo y Permisos
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors sm:col-span-2">
                        <Checkbox
                          id="fltFuel"
                          checked={notifPrefs.fleetFuelAnomalies}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, fleetFuelAnomalies: !!c }))}
                        />
                        <Label htmlFor="fltFuel" className="text-xs font-medium cursor-pointer">
                          ⛽ Alertas de Combustible y Saltos de Odómetro
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* 3. Tickets y Soporte */}
                  <div className="p-4 border rounded-xl space-y-3 bg-card shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TicketCheck className="w-4 h-4 text-sky-600" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                          Tickets & Mesa de Ayuda IT
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-bold border-sky-500/20 bg-sky-500/5 text-sky-600">
                        Soporte & Casos
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="tktAssigned"
                          checked={notifPrefs.ticketsAssigned}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, ticketsAssigned: !!c }))}
                        />
                        <Label htmlFor="tktAssigned" className="text-xs font-medium cursor-pointer">
                          📌 Casos y Solicitudes Asignadas a Mí
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="tktStatus"
                          checked={notifPrefs.ticketsStatusChange}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, ticketsStatusChange: !!c }))}
                        />
                        <Label htmlFor="tktStatus" className="text-xs font-medium cursor-pointer">
                          🔄 Cambios de Estado y Nuevas Respuestas
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors sm:col-span-2">
                        <Checkbox
                          id="tktUrgent"
                          checked={notifPrefs.ticketsUrgent}
                          onCheckedChange={(c) => setNotifPrefs(p => ({ ...p, ticketsUrgent: !!c }))}
                        />
                        <Label htmlFor="tktUrgent" className="text-xs font-medium cursor-pointer">
                          🚨 Casos con Prioridad Urgente / Crítica
                        </Label>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Cambiar Contraseña */}
              <Separator className="my-6" />
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Seguridad y Contraseña</h3>
                <div className="space-y-2">
                  <Label htmlFor="current">Contraseña Actual</Label>
                  <Input id="current" type="password" value={passwords.current} onChange={handlePasswordChange} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new">Nueva Contraseña</Label>
                    <Input id="new" type="password" value={passwords.new} onChange={handlePasswordChange}/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirmar Contraseña</Label>
                    <Input id="confirm" type="password" value={passwords.confirm} onChange={handlePasswordChange}/>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4 flex justify-end">
              <Button type="submit" className="font-bold">Guardar Cambios</Button>
            </CardFooter>
          </Card>
        </form>

          {/* Assigned IT Assets Section */}
          <Card className="mt-6 border border-zinc-100 dark:border-zinc-800 shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Laptop className="h-5 w-5" /> Mis Herramientas de Trabajo & Activos
              </CardTitle>
              <CardDescription>
                Equipos y licencias de TI asignados bajo su responsabilidad
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {loadingAssets ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : myAssets.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground italic text-sm">
                  No tiene equipos o activos de TI asignados actualmente.
                </div>
              ) : (
                <div className="space-y-3">
                  {myAssets.map((asset) => {
                    const isCell = ['celular', 'móvil', 'movil', 'tablet', 'phone', 'smartphone'].includes(asset.category?.toLowerCase());
                    return (
                      <div 
                        key={asset.id} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-muted/30 border rounded-lg gap-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            {isCell ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                          </div>
                          <div>
                            <span className="font-semibold text-sm text-foreground block">
                              {asset.brand} {asset.model}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span>{asset.category}</span>
                              <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                S/N: {asset.serial_number}
                              </span>
                              {asset.phone_number && (
                                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.2 rounded">
                                  Línea: {asset.phone_number}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-row sm:flex-col items-start sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 text-xs text-muted-foreground gap-1">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            Asignado el {asset.assigned_date ? new Date(asset.assigned_date).toLocaleDateString('es-CR') : 'N/A'}
                          </span>
                          <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium px-2 py-0.5 rounded-full">
                            Sede: {asset.branch_name || 'N/A'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
  );
}
