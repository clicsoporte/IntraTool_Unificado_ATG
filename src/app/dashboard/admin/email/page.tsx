
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import type { EmailSettings } from "@/modules/core/types";
import { logInfo, logError } from "@/modules/core/lib/logger";
import { getEmailSettings, saveEmailSettings, testEmailSettings } from "@/modules/core/lib/email-service";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Send, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { useRouter } from "next/navigation";

const initialSettings: EmailSettings = {
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpSecure: true,
    recoveryEmailSubject: 'Recuperación de Contraseña',
    recoveryEmailBody: `
<p>Hola [NOMBRE_USUARIO],</p>
<p>Has solicitado restablecer tu contraseña. Tu nueva contraseña temporal es:</p>
<h2 style="font-family: monospace; font-size: 1.5rem; background-color: #f0f0f0; padding: 10px; border-radius: 5px; text-align: center;">[CLAVE_TEMPORAL]</h2>
<p>Por favor, inicia sesión con esta contraseña y cámbiala inmediatamente por una nueva de tu elección.</p>
<p>Si no solicitaste esto, puedes ignorar este correo.</p>
<br>
<p>Gracias,</p>
<p>El equipo de Clic-Tools</p>
    `.trim(),
};

export default function EmailSettingsPage() {
    const { isAuthorized } = useAuthorization(['admin:settings:general']);
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const { setTitle } = usePageTitle();
    
    const [settings, setSettings] = useState<EmailSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        setTitle("Configuración de Correo");
        const fetchSettings = async () => {
            try {
                const savedSettings = await getEmailSettings();
                setSettings({ ...initialSettings, ...savedSettings });
            } catch (error) {
                logError("Failed to fetch email settings", { error });
                setSettings(initialSettings);
            } finally {
                setIsLoading(false);
            }
        };
        if (isAuthorized) {
            fetchSettings();
        }
    }, [setTitle, isAuthorized]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        try {
            await saveEmailSettings(settings);
            toast({
                title: "Configuración Guardada",
                description: "Los ajustes del servidor de correo han sido guardados.",
            });
            await logInfo("Email settings saved");
            router.refresh();
        } catch (error: any) {
            logError("Failed to save email settings", { error: error.message });
            toast({ title: "Error", description: "No se pudieron guardar los ajustes de correo.", variant: "destructive" });
        }
    };

    const handleTest = async () => {
        if (!settings || !settings.smtpUser || !user || !user.email) {
            toast({ title: "Faltan datos", description: "Por favor, completa la configuración SMTP y asegúrate de haber iniciado sesión.", variant: "destructive" });
            return;
        }
        
        setIsTesting(true);

        // Build a unique list of recipients
        const recipients = [settings.smtpUser];
        if (user.email !== settings.smtpUser) {
            recipients.push(user.email);
        }

        try {
            await testEmailSettings(settings, recipients);
            toast({
                title: "Correo de Prueba Enviado",
                description: `Se envió un correo de prueba a: ${recipients.join(', ')}.`,
                duration: 6000,
            });
        } catch (error: any) {
            logError("Failed to send test email", { error: error.message });
            toast({ title: "Error al Enviar", description: `No se pudo enviar el correo de prueba: ${error.message}`, variant: "destructive" });
        } finally {
            setIsTesting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setSettings(prev => prev ? { ...prev, [id]: value } : null);
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        // Allow empty string for user input, but parse to number for state
        const numValue = value === '' ? '' : parseInt(value, 10);
        if (value === '' || !isNaN(Number(numValue))) {
            setSettings(prev => prev ? { ...prev, [id]: numValue } : null);
        }
    };

    if (isAuthorized === false) {
      return null;
    }

    if (isLoading || !settings) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="mx-auto max-w-4xl space-y-6">
                    <Skeleton className="h-96 w-full" />
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <form onSubmit={handleSave}>
                <div className="mx-auto max-w-4xl space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-4">
                                <Mail className="h-8 w-8 text-primary"/>
                                <div>
                                    <CardTitle>Configuración de Correo (SMTP)</CardTitle>
                                    <CardDescription>
                                        Configura el servidor de correo para enviar notificaciones y recuperar contraseñas.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="smtpHost">Servidor SMTP</Label>
                                    <Input id="smtpHost" value={settings.smtpHost} onChange={handleChange} placeholder="smtp.ejemplo.com" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="smtpPort">Puerto</Label>
                                    <Input id="smtpPort" type="number" value={settings.smtpPort || ''} onChange={handleNumberChange} placeholder="587" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="smtpSecure">Seguridad</Label>
                                    <Select value={String(settings.smtpSecure)} onValueChange={(val) => setSettings(prev => prev ? { ...prev, smtpSecure: val === 'true' } : null)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="true">TLS/STARTTLS (Recomendado)</SelectItem>
                                            <SelectItem value="false">Ninguna (Inseguro)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                     <Label htmlFor="smtpUser">Usuario (Correo)</Label>
                                     <Input id="smtpUser" value={settings.smtpUser} onChange={handleChange} placeholder="notificaciones@ejemplo.com" />
                                 </div>
                                 <div className="space-y-2">
                                     <Label htmlFor="smtpPass">Contraseña</Label>
                                     <Input id="smtpPass" type="password" value={settings.smtpPass} onChange={handleChange} placeholder="••••••••" />
                                 </div>
                            </div>

                            {/* Sección de Contingencia / Fallback Automático */}
                            <div className="pt-4 border-t space-y-4">
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                        <span>🛡️ Puerto de Contingencia Automático (Fallback)</span>
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Si la conexión al puerto principal falla o sufre timeout por restricciones de red, el sistema conmutará automáticamente a este puerto secundario y lo registrará en los logs.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                                    <div className="space-y-2">
                                        <Label htmlFor="smtpFallbackPort">Puerto de Contingencia</Label>
                                        <Input 
                                            id="smtpFallbackPort" 
                                            type="number" 
                                            value={settings.smtpFallbackPort !== undefined ? settings.smtpFallbackPort : (settings.smtpPort === 465 ? 587 : 465)} 
                                            onChange={handleNumberChange} 
                                            placeholder="587" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="smtpFallbackSecure">Seguridad de Contingencia</Label>
                                        <Select 
                                            value={String(settings.smtpFallbackSecure !== undefined ? settings.smtpFallbackSecure : (settings.smtpPort === 465 ? false : true))} 
                                            onValueChange={(val) => setSettings(prev => prev ? { ...prev, smtpFallbackSecure: val === 'true' } : null)}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="false">STARTTLS / Port 587 (Recomendado Fallback)</SelectItem>
                                                <SelectItem value="true">SSL Directo / Port 465</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="smtpFallbackEnabled">Estado de Fallback</Label>
                                        <Select 
                                            value={String(settings.smtpFallbackEnabled !== false)} 
                                            onValueChange={(val) => setSettings(prev => prev ? { ...prev, smtpFallbackEnabled: val === 'true' } : null)}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="true">✅ Activado (Conmutación Automática)</SelectItem>
                                                <SelectItem value="false">❌ Desactivado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-between">
                            <Button type="button" variant="outline" onClick={handleTest} disabled={isTesting}>
                                {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4" />}
                                Enviar Correo de Prueba
                            </Button>
                            <Button type="submit" className="gap-2">
                                <Save className="w-4 h-4" />
                                Guardar Ajustes SMTP
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Plantilla de Recuperación de Contraseña</CardTitle>
                            <CardDescription>
                                Personaliza el correo que recibirán los usuarios. Usa [NOMBRE_USUARIO] y [CLAVE_TEMPORAL] como placeholders.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="space-y-2">
                                <Label htmlFor="recoveryEmailSubject">Asunto del Correo</Label>
                                <Input id="recoveryEmailSubject" value={settings.recoveryEmailSubject} onChange={handleChange} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="recoveryEmailBody">Cuerpo del Correo (HTML)</Label>
                                <Textarea id="recoveryEmailBody" value={settings.recoveryEmailBody} onChange={handleChange} rows={15} className="font-mono text-xs" />
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardFooter className="border-t px-6 py-4">
                            <Button type="submit">
                                <Save className="mr-2 h-4 w-4"/>
                                Guardar Toda la Configuración
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </form>
        </main>
    );
}
