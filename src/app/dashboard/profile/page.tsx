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
import { Camera, Laptop, Smartphone, Calendar as CalendarIcon } from "lucide-react";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { getInitials } from "@/lib/utils";

/**
 * Renders the user profile settings page.
 * Fetches the current user's data and provides forms to update their details
 * and change their password.
 */
export default function ProfilePage() {
  const { toast } = useToast();
  const { user, isAuthReady, refreshAuth } = useAuth();
  const { setTitle } = usePageTitle();
  
  const [formData, setFormData] = useState({
      name: "",
      email: "",
      phone: "",
      whatsapp: "",
      erpAlias: "",
      avatar: ""
  });
  
  const [deliveryNotifications, setDeliveryNotifications] = useState(false);
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
        // Fetch contact governance preference
        getUserPreference(user.id, 'ops_delivery_notifications_enabled').then(pref => {
            setDeliveryNotifications(pref === true || pref === 'true');
        }).catch(err => {
            console.error('Failed to load user preference:', err);
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

      const isMatch = await comparePasswords(user.id, passwords.current);
      if (!isMatch) {
        toast({
          title: "Error de Contraseña",
          description: "La contraseña actual no es correcta.",
          variant: "destructive",
        });
        return;
      }
      if (passwords.new.length < 6) {
        toast({
          title: "Contraseña Débil",
          description: "La nueva contraseña debe tener al menos 6 caracteres.",
          variant: "destructive",
        });
        return;
      }
      if (passwords.new !== passwords.confirm) {
          toast({
              title: "Error de Contraseña",
              description: "Las nuevas contraseñas no coinciden.",
              variant: "destructive",
          });
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
        
        // Save preference
        await saveUserPreference(user.id, 'ops_delivery_notifications_enabled', deliveryNotifications);
        
        toast({
          title: "Perfil Actualizado",
          description: "Tu información ha sido guardada exitosamente.",
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
                        <Button disabled>Guardar Cambios</Button>
                    </CardFooter>
                </Card>
            </div>
        </main>
    )
  }


  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div {...getRootProps()} className="relative group cursor-pointer">
                    <input {...getInputProps()} />
                    <Avatar className="h-24 w-24 text-4xl">
                        <AvatarImage src={formData.avatar} alt={formData.name} />
                        <AvatarFallback>{getInitials(formData.name)}</AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div>
                    <CardTitle>Mi Perfil</CardTitle>
                    <CardDescription>
                      Actualiza tu información personal y foto. Estos datos se usarán en las
                      cotizaciones si así lo especificas.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={handleProfileChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleProfileChange}
                  />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="erpAlias">Alias de Usuario (ERP)</Label>
                  <Input
                    id="erpAlias"
                    value={formData.erpAlias || ''}
                    onChange={handleProfileChange}
                    placeholder="Tu nombre de usuario en el sistema ERP"
                  />
                   <p className="text-xs text-muted-foreground">Este alias se usará para filtrar órdenes y solicitudes por tu usuario del ERP.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={formData.phone || ''}
                      onChange={handleProfileChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      value={formData.whatsapp || ''}
                      onChange={handleProfileChange}
                    />
                  </div>
                </div>

                <Separator className="my-6" />
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Preferencias de Contacto</h3>
                  <p className="text-sm text-muted-foreground">
                    Gobernanza sobre tus preferencias de notificaciones y alertas.
                  </p>
                  <div className="flex items-center space-x-3 p-3 bg-muted/20 border border-muted/50 rounded-xl">
                    <Checkbox 
                      id="deliveryNotifications" 
                      checked={deliveryNotifications} 
                      onCheckedChange={(checked) => setDeliveryNotifications(!!checked)} 
                    />
                    <Label htmlFor="deliveryNotifications" className="font-normal text-xs text-foreground cursor-pointer select-none leading-tight">
                      Recibir notificaciones por correo de mis entregas / despachos activos
                    </Label>
                  </div>
                </div>

                <Separator className="my-6" />
                <div className="space-y-4">
                    <h3 className="text-lg font-medium">Cambiar Contraseña</h3>
                    <div className="space-y-2">
                        <Label htmlFor="current">Contraseña Actual</Label>
                        <Input id="current" type="password" value={passwords.current} onChange={handlePasswordChange} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new">Nueva Contraseña</Label>
                        <Input id="new" type="password" value={passwords.new} onChange={handlePasswordChange}/>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="confirm">Confirmar Nueva Contraseña</Label>
                        <Input id="confirm" type="password" value={passwords.confirm} onChange={handlePasswordChange}/>
                    </div>
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button>Guardar Cambios</Button>
              </CardFooter>
            </Card>
          </form>

          {user.employeeId && (
            <Card className="mt-6 border border-blue-100/50 shadow-sm dark:border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                    Expediente Laboral ERP
                  </CardTitle>
                  <CardDescription>
                    Información de planilla y contratación sincronizada
                  </CardDescription>
                </div>
                {loadingEmployee ? (
                  <span className="text-xs text-muted-foreground animate-pulse">Cargando...</span>
                ) : employeeDetails ? (
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${employeeDetails.ACTIVO === 'S' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    <span className="text-xs font-semibold uppercase">
                      {employeeDetails.ACTIVO === 'S' ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">No sincronizado</span>
                )}
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {employeeDetails ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block font-medium">Código de Empleado</span>
                      <span className="font-mono font-semibold text-foreground">{employeeDetails.EMPLEADO}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block font-medium">Identificación / Cédula</span>
                      <span className="font-semibold text-foreground">{employeeDetails.IDENTIFICACION || 'N/A'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block font-medium">Nombre Completo</span>
                      <span className="font-semibold text-foreground">{employeeDetails.NOMBRE}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block font-medium">Dirección Habitación</span>
                      <span className="font-semibold text-foreground">{employeeDetails.DIRECCION_HAB || 'N/A'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block font-medium">Pasaporte</span>
                      <span className="font-semibold text-foreground">{employeeDetails.PASAPORTE || 'N/A'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block font-medium">País</span>
                      <span className="font-semibold text-foreground">{employeeDetails.PAIS || 'N/A'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block font-medium">Permiso / Licencia de Conducir</span>
                      <span className="font-semibold text-foreground">{employeeDetails.PERMISO_CONDUCIR || 'N/A'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block font-medium">Fecha de Ingreso</span>
                      <span className="font-semibold text-foreground">{employeeDetails.FECHA_INGRESO || 'N/A'}</span>
                    </div>
                    {employeeDetails.FECHA_SALIDA && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground block font-medium">Fecha de Salida</span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400">{employeeDetails.FECHA_SALIDA}</span>
                      </div>
                    )}
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground block font-medium">Nómina / Puesto</span>
                      <span className="font-semibold text-foreground">{employeeDetails.NOMINA} - {employeeDetails.PUESTO}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Vinculado al código {user.employeeId} pero no se encontraron datos detallados en la base de datos local.</p>
                )}
              </CardContent>
            </Card>
          )}

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
