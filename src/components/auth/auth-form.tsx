/**
 * @fileoverview Client component for handling the authentication form,
 * now also responsible for determining whether to show the login form or the setup wizard.
 */
"use client";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { Loader2, Network, UserPlus, AlertTriangle } from "lucide-react";
import React, { useState, useEffect } from "react";
import type { User } from "@/modules/core/types";
import { useToast } from "@/modules/core/hooks/use-toast";
import {
  login,
  getAllUsers,
  saveAllUsers,
  sendRecoveryEmail,
} from "@/modules/core/lib/auth-client";
import { logInfo, logWarn, logError } from "@/modules/core/lib/logger";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { SetupWizard } from "./setup-wizard";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AuthFormProps {
    initialHasUsers: boolean;
    initialCompanyName: string;
    initialSystemVersion: string | null;
}

/**
 * Renders the login form, setup wizard, or password recovery flow.
 * This component now receives its initial state as props from a Server Component parent.
 */
export function AuthForm({ initialHasUsers, initialCompanyName, initialSystemVersion }: AuthFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isAuthReady, refreshAuth, redirectAfterLogin } = useAuth();

  // Auth flow state
  const [authStep, setAuthStep] = useState<"login" | "force_change" | "recovery_success">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [userForPasswordChange, setUserForPasswordChange] = useState<User | null>(null);

  // Recovery dialog state
  const [isRecoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");

  // New password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  
  useEffect(() => {
    // If the user is already logged in, redirect them to the dashboard.
    if (isAuthReady && user) {
      redirectAfterLogin("/dashboard");
    }
  }, [isAuthReady, user, redirectAfterLogin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const loginResult = await login(email, password);

      if (loginResult.user) {
        if (loginResult.forcePasswordChange) {
          setUserForPasswordChange(loginResult.user);
          setAuthStep("force_change");
        } else {
          // Pass the user object directly to refreshAuth to avoid race conditions
          const refreshedUser = await refreshAuth(loginResult.user);
          if (refreshedUser) {
            redirectAfterLogin();
          } else {
             throw new Error("La sesión no se pudo establecer después del login.");
          }
        }
      } else {
        toast({ title: "Credenciales Incorrectas", variant: "destructive" });
      }
    } catch (error: any) {
      // Guardar el fallo de autenticación de forma persistente en los logs operativos
      await logError("Error de Inicio de Sesión", { error: error.message, email });
      toast({ title: "Error de Inicio de Sesión", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetNewPassword = async () => {
    if (!userForPasswordChange) return;
    if (newPassword.length < 6) {
      toast({ title: "Contraseña Débil", description: "Debe tener al menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Error", description: "Las contraseñas no coinciden.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      const allUsers = await getAllUsers();
      const updatedUsers = allUsers.map((u) => u.id === userForPasswordChange.id ? { ...u, password: newPassword, forcePasswordChange: false } : u);
      await saveAllUsers(updatedUsers);
      await logInfo(`Password for user ${userForPasswordChange.name} was changed successfully (forced).`);
      setAuthStep("recovery_success");
    } catch (error: any) {
      await logError("Failed to set new password", { error: error.message });
      toast({ title: "Error", description: "No se pudo actualizar la contraseña.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecoveryStart = async () => {
    if (!recoveryEmail) return;
    setIsProcessing(true);
    try {
      await sendRecoveryEmail(recoveryEmail);
      toast({ title: "Correo de Recuperación Enviado", description: "Si el correo existe, recibirás una contraseña temporal." });
      setRecoveryDialogOpen(false);
      setRecoveryEmail("");
    } catch (error: any) {
      await logError("Password recovery failed", { error: error.message, email: recoveryEmail });
      toast({ title: "Error de Recuperación", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const returnToLogin = () => {
    setEmail("");
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setUserForPasswordChange(null);
    setAuthStep("login");
  };
  
  const getHeaderIcon = () => {
    return initialHasUsers ? <Network className="h-8 w-8" /> : <UserPlus className="h-8 w-8" />;
  };

  const getHeaderTitle = () => {
    return initialHasUsers ? initialCompanyName : "Bienvenido a Clic-Tools";
  };

  const getHeaderDescription = () => {
    if (authStep === 'force_change') return "Por seguridad, debes establecer una nueva contraseña.";
    if (authStep === 'recovery_success') return "Tu contraseña ha sido actualizada.";
    return initialHasUsers ? "Inicia sesión para acceder a tus herramientas" : "Completa la configuración para crear tu cuenta de administrador";
  };

  const renderContent = () => {
    if (isAuthReady && user) return <div className="flex justify-center items-center h-48"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    
    if (initialHasUsers === false) return <SetupWizard />;

    switch (authStep) {
      case 'force_change':
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="new-password">Nueva Contraseña</Label><Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required suppressHydrationWarning /></div>
            <div className="space-y-2"><Label htmlFor="confirm-new-password">Confirmar Nueva Contraseña</Label><Input id="confirm-new-password" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required suppressHydrationWarning /></div>
            <CardFooter className="p-0 pt-4"><Button onClick={handleSetNewPassword} className="w-full" disabled={isProcessing}>{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Establecer Nueva Contraseña</Button></CardFooter>
          </div>
        );
      case 'recovery_success':
        return (
          <div className="space-y-4 text-center">
            <p className="text-green-600 font-medium">¡Contraseña actualizada!</p>
            <p className="text-sm text-muted-foreground">Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <CardFooter className="p-0 pt-4"><Button onClick={returnToLogin} className="w-full">Regresar a Inicio</Button></CardFooter>
          </div>
        );
      case 'login':
      default:
        return (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="email">Correo Electrónico</Label><Input id="email" type="email" placeholder="usuario@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required suppressHydrationWarning /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label htmlFor="password">Contraseña</Label>
                <Dialog open={isRecoveryDialogOpen} onOpenChange={setRecoveryDialogOpen}>
                  <DialogTrigger asChild><button type="button" className="text-sm font-medium text-primary hover:underline">¿Olvidaste tu contraseña?</button></DialogTrigger>
                  <DialogContent><DialogHeader><DialogTitle>Recuperación de Contraseña</DialogTitle><DialogDescription>Ingresa tu correo. Si existe, te enviaremos una contraseña temporal.</DialogDescription></DialogHeader>
                    <div className="space-y-4 py-4"><div className="space-y-2"><Label htmlFor="recovery-email">Correo Electrónico</Label><Input id="recovery-email" type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="tu@correo.com" suppressHydrationWarning /></div></div>
                    <DialogFooter><DialogClose asChild><Button variant="ghost" type="button">Cancelar</Button></DialogClose><Button onClick={handleRecoveryStart} type="button" disabled={isProcessing}>{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar Correo</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required suppressHydrationWarning />
            </div>
            <CardFooter className="p-0 pt-4"><Button type="submit" className="w-full" disabled={isProcessing}>{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Iniciar Sesión</Button></CardFooter>
          </form>
        );
    }
  };

  return (
    <>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">{getHeaderIcon()}</div>
        <CardTitle className="text-3xl font-bold">{getHeaderTitle()}</CardTitle>
        <CardDescription>{getHeaderDescription()}</CardDescription>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
      {initialSystemVersion && (
        <div className="p-6 pt-0 text-center text-xs text-muted-foreground">
            Versión {initialSystemVersion}
        </div>
      )}
    </>
  );
}
