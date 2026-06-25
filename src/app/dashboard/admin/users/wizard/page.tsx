'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { createDriverWithBotLinkage, getTelegramBotInfo } from '@/modules/core/lib/wizard-actions';
import { getAllRoles } from '@/modules/core/lib/db';
import { getAllEmployeesAction } from '@/modules/fleet/lib/actions';
import { Loader2, ArrowLeft, ArrowRight, UserPlus, ShieldAlert, Sparkles, CheckCircle2, Award, Check } from 'lucide-react';
import QRCode from 'qrcode';
import type { Role } from '@/modules/core/types';

export default function DriverWizardPage() {
  useAuthorization(['users:create']);
  const { setTitle } = usePageTitle();
  const { toast } = useToast();
  const router = useRouter();

  // Wizard Steps: 1 (Personal Info & Role), 2 (Permissions), 3 (Success/QR Linkage)
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  
  // Data for Selectors
  const [employees, setEmployees] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Success state
  const [activationCode, setActivationCode] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [deepLinkUrl, setDeepLinkUrl] = useState<string>('');

  // Form State
  const [formData, setFormData] = useState({
    employeeId: '',
    name: '',
    phone: '',
    email: '',
    password: '',
    role: '',
    allowFuel: true,
    allowMaintenance: true,
    allowDeliveries: true,
    allowWarehouse: false,
    createWebAccount: true, // Default true now
  });

  const activeEmployees = useMemo(() => employees.filter(emp => emp.active === 'S'), [employees]);

  useEffect(() => {
    setTitle('Asistente de Alta Rápida de Choferes');
    
    // Fetch initial data
    const fetchInitialData = async () => {
      setIsLoadingData(true);
      try {
        const [empData, rolesData, botRes] = await Promise.all([
          getAllEmployeesAction(),
          getAllRoles(),
          getTelegramBotInfo()
        ]);
        
        setEmployees(empData || []);
        setRoles(rolesData || []);
        
        if (botRes.success && botRes.username) {
          setBotUsername(botRes.username);
        }

        // Try to auto-select a driver role if one exists
        const driverRole = rolesData.find((r: Role) => r.id.toLowerCase() === 'chofer' || r.id.toLowerCase() === 'driver');
        if (driverRole) {
          setFormData(prev => ({ ...prev, role: driverRole.id }));
        }

      } catch (e) {
        toast({ title: 'Error de conexión', description: 'No se pudieron cargar los datos de empleados o roles.', variant: 'destructive' });
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchInitialData();
  }, [setTitle, toast]);

  const handleTextChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field: string, checked: boolean) => {
    setFormData(prev => ({ ...prev, [field]: checked }));
  };

  const handleEmployeeSelect = (empId: string) => {
    if (empId === 'none') {
        setFormData(prev => ({ ...prev, employeeId: '', name: '', phone: '' }));
        return;
    }
    const selectedEmp = employees.find(e => e.id === empId);
    if (selectedEmp) {
      setFormData(prev => ({
        ...prev,
        employeeId: empId,
        name: selectedEmp.name || '',
        phone: selectedEmp.phone || ''
      }));
    }
  };

  const validateStep1 = () => {
    if (!formData.employeeId) {
      toast({ title: 'Campo requerido', description: 'Por favor, seleccione un empleado de la planilla.', variant: 'destructive' });
      return false;
    }
    if (!formData.role) {
      toast({ title: 'Campo requerido', description: 'Por favor, seleccione el rol para la cuenta web.', variant: 'destructive' });
      return false;
    }
    if (formData.createWebAccount && !formData.email.trim()) {
      toast({ title: 'Email requerido', description: 'Para crear una cuenta web es necesario ingresar el correo electrónico.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await createDriverWithBotLinkage(formData);
      
      if (result.success && result.activationCode) {
        setActivationCode(result.activationCode);
        
        // Generate Deep Link: https://t.me/BotUsername?start=CODE
        const username = botUsername || 'GarendGeneralBot';
        const startLink = `https://t.me/${username}?start=${result.activationCode}`;
        setDeepLinkUrl(startLink);
        
        // Generate QR code pointing to deep link
        const qrUrl = await QRCode.toDataURL(startLink, { errorCorrectionLevel: 'M', width: 250 });
        setQrCodeUrl(qrUrl);
        
        setStep(3);
        toast({ title: 'Chofer registrado', description: 'El chofer ha sido configurado en todos los módulos.' });
      } else {
        toast({ title: 'Error al procesar', description: result.error || 'Ocurrió un error inesperado.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error de servidor', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-muted/20 flex justify-center items-center h-full">
            <Loader2 className="animate-spin text-primary h-12 w-12" />
        </main>
    );
  }

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8 bg-muted/20">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/admin/users')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Asistente Unificado de Conductor</h1>
            <p className="text-muted-foreground text-sm">Crea usuario, asigna a flota y genera enlace Telegram en un solo flujo.</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-6 py-3 bg-card border rounded-xl shadow-sm">
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</div>
            <span className={`text-xs font-medium ${step === 1 ? 'text-primary' : 'text-muted-foreground'}`}>Cuenta Web y Planilla</span>
          </div>
          <div className="h-px flex-1 bg-border mx-4"></div>
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
            <span className={`text-xs font-medium ${step === 2 ? 'text-primary' : 'text-muted-foreground'}`}>Permisos en Bot</span>
          </div>
          <div className="h-px flex-1 bg-border mx-4"></div>
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${step === 3 ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>3</div>
            <span className={`text-xs font-medium ${step === 3 ? 'text-green-600' : 'text-muted-foreground'}`}>Activación</span>
          </div>
        </div>

        {/* Step 1: Personal Info & Role */}
        {step === 1 && (
          <Card className="shadow-lg border-none">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
              <CardTitle className="text-lg flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> Enlace de Planilla y Sistema Web</CardTitle>
              <CardDescription>Seleccione al empleado de la planilla y configure su acceso al sistema.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              
              <div className="space-y-2">
                <Label htmlFor="employeeId">Vincular a Empleado de Planilla</Label>
                <Select value={formData.employeeId || 'none'} onValueChange={handleEmployeeSelect}>
                    <SelectTrigger id="employeeId">
                        <SelectValue placeholder="Seleccione un empleado..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Seleccione un empleado...</SelectItem>
                        {activeEmployees.map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>
                                {emp.name} ({emp.id})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre Completo</Label>
                  <Input id="name" value={formData.name} readOnly disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Celular (Para Telegram)</Label>
                  <Input id="phone" type="tel" placeholder="Ej: 8888-8888" value={formData.phone} onChange={e => handleTextChange('phone', e.target.value)} />
                </div>
              </div>
              
              <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center space-x-2 pb-2">
                      <Checkbox id="createWebAccount" checked={formData.createWebAccount} onCheckedChange={checked => handleCheckboxChange('createWebAccount', !!checked)} />
                      <Label htmlFor="createWebAccount" className="font-semibold cursor-pointer">Crear cuenta de acceso web para este empleado</Label>
                  </div>
                  
                  {formData.createWebAccount && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border">
                          <div className="space-y-2 col-span-2 md:col-span-1">
                              <Label htmlFor="role">Rol en el Sistema</Label>
                              <Select value={formData.role} onValueChange={val => handleTextChange('role', val)}>
                                  <SelectTrigger id="role">
                                      <SelectValue placeholder="Seleccione un rol" />
                                  </SelectTrigger>
                                  <SelectContent>
                                      {roles.map(r => (
                                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                      ))}
                                  </SelectContent>
                              </Select>
                          </div>
                          <div className="space-y-2 col-span-2 md:col-span-1">
                              <Label htmlFor="email">Correo Electrónico</Label>
                              <Input id="email" type="email" placeholder="Requerido para login" value={formData.email} onChange={e => handleTextChange('email', e.target.value)} />
                          </div>
                          <div className="space-y-2 col-span-2">
                              <Label htmlFor="password">Contraseña Temporal</Label>
                              <Input id="password" type="password" placeholder="Dejar en blanco para usar contraseña por defecto (Driver123!)" value={formData.password} onChange={e => handleTextChange('password', e.target.value)} />
                              <p className="text-xs text-muted-foreground">Se solicitará el cambio de contraseña en su primer ingreso.</p>
                          </div>
                      </div>
                  )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-6">
              <Button onClick={handleNext} className="gap-2">Siguiente <ArrowRight className="h-4 w-4" /></Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 2: Permissions */}
        {step === 2 && (
          <Card className="shadow-lg border-none">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
              <CardTitle className="text-lg flex items-center gap-2"><Award className="h-5 w-5 text-primary" /> Permisos del Bot de Telegram</CardTitle>
              <CardDescription>Defina qué módulos podrá gestionar el chofer desde Telegram.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <Checkbox id="allowDeliveries" checked={formData.allowDeliveries} onCheckedChange={checked => handleCheckboxChange('allowDeliveries', !!checked)} />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="allowDeliveries" className="font-semibold cursor-pointer">Registrar Entregas</Label>
                      <p className="text-xs text-muted-foreground">Reportar entregas de facturas/pedidos y recolectar firmas.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <Checkbox id="allowFuel" checked={formData.allowFuel} onCheckedChange={checked => handleCheckboxChange('allowFuel', !!checked)} />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="allowFuel" className="font-semibold cursor-pointer">Reportar Combustible</Label>
                      <p className="text-xs text-muted-foreground">Registrar recargas de combustible y kilometraje del vehículo.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <Checkbox id="allowMaintenance" checked={formData.allowMaintenance} onCheckedChange={checked => handleCheckboxChange('allowMaintenance', !!checked)} />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="allowMaintenance" className="font-semibold cursor-pointer">Reportar Incidencias</Label>
                      <p className="text-xs text-muted-foreground">Reportar fallas de camión y crear tickets en el taller.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <Checkbox id="allowWarehouse" checked={formData.allowWarehouse} onCheckedChange={checked => handleCheckboxChange('allowWarehouse', !!checked)} />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="allowWarehouse" className="font-semibold cursor-pointer">Tareas de Almacén</Label>
                      <p className="text-xs text-muted-foreground">Habilita lectura rápida de códigos QR y stock del almacén.</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-6">
              <Button variant="outline" onClick={handleBack} className="gap-2"><ArrowLeft className="h-4 w-4" /> Atrás</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2 bg-primary">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Finalizar Configuración
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 3: Success & QR Linkage */}
        {step === 3 && (
          <Card className="shadow-xl border-t-4 border-t-green-600 border-none overflow-hidden">
            <CardHeader className="text-center pb-2 bg-gradient-to-b from-green-50 to-transparent dark:from-green-950/20">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 mb-2">
                <Check className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl text-green-700 dark:text-green-400 font-bold">¡Chofer Configurado Exitosamente!</CardTitle>
              <CardDescription>El empleado ha sido agregado al sistema web, a la flota y al bot. Escanee el código QR para activar su celular.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-4 text-center">
              
              {/* QR Code and Activation Details */}
              <div className="flex flex-col items-center justify-center p-4 border rounded-xl bg-card shadow-sm inline-block mx-auto max-w-sm">
                {qrCodeUrl ? (
                  <Image 
                    src={qrCodeUrl} 
                    alt="QR Code Linkage" 
                    width={250} 
                    height={250} 
                    unoptimized
                    className="mx-auto mb-4 border p-2 rounded bg-white" 
                  />
                ) : (
                  <div className="h-[250px] w-[250px] flex items-center justify-center bg-muted mb-4 rounded"><Loader2 className="animate-spin text-muted-foreground" /></div>
                )}
                <div className="bg-muted px-4 py-2 rounded-lg font-mono text-lg font-bold tracking-widest text-primary border border-primary/20">
                  CÓDIGO: {activationCode}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 max-w-md mx-auto">
                <Button className="w-full bg-[#0088cc] hover:bg-[#0077b5] text-white" asChild>
                  <a href={deepLinkUrl} target="_blank" rel="noopener noreferrer">
                    Abrir Chat en Telegram
                  </a>
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => {
                    navigator.clipboard.writeText(deepLinkUrl);
                    toast({ title: 'Copiado', description: 'Enlace de activación copiado al portapapeles.' });
                  }}>
                    Copiar Enlace
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={() => {
                    setFormData({
                      employeeId: '',
                      name: '',
                      phone: '',
                      email: '',
                      password: '',
                      role: '',
                      allowFuel: true,
                      allowMaintenance: true,
                      allowDeliveries: true,
                      allowWarehouse: false,
                      createWebAccount: true,
                    });
                    setStep(1);
                  }}>
                    Registrar Otro
                  </Button>
                </div>
              </div>

              {/* Instructions */}
              <div className="text-left text-xs space-y-2 text-muted-foreground bg-muted/30 p-3 rounded-lg border max-w-md mx-auto mt-4">
                <p className="font-semibold text-foreground flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> Instrucciones de activación rápida:</p>
                <ol className="list-decimal pl-4 space-y-1.5">
                  <li>Abra la cámara del celular del conductor y escanee el código QR de arriba.</li>
                  <li>Esto abrirá la aplicación de Telegram dirigida al bot de la empresa.</li>
                  <li>Presione el botón <b>&quot;Iniciar&quot; (Start)</b> que aparece abajo en el chat.</li>
                  <li>El bot vinculará la cuenta del chofer inmediatamente, sin necesidad de teclear ningún código manual.</li>
                </ol>
              </div>

            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
