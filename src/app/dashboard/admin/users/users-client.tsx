'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { getAllUsers, addUser, updateUser, deleteUser } from '@/modules/core/lib/auth-client';
import { getAllRoles } from '@/modules/core/lib/db';
import { getAllEmployeesAction } from '@/modules/fleet/lib/actions';
import { getAllLinkagesAction } from '@/modules/fleet/lib/telegram-actions';
import type { User, Role } from '@/modules/core/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, Edit, Trash2, Save, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { Badge } from '@/components/ui/badge';
import { getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


const emptyUser: Omit<User, 'id' | 'password'> = {
  name: '',
  email: '',
  phone: '',
  whatsapp: '',
  avatar: '',
  role: 'viewer', // default role
  erpAlias: '',
  recentActivity: '',
  forcePasswordChange: true,
};

export default function UsersClient() {
  const { hasPermission } = useAuthorization();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [telegramLinkages, setTelegramLinkages] = useState<any[]>([]);
  const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { setTitle } = usePageTitle();

  const [isDialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<Partial<User> & { password?: string }>({});
  const [isEditing, setIsEditing] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (showInactiveEmployees) return true;
      return emp.active === 'S';
    });
  }, [employees, showInactiveEmployees]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersData, rolesData, employeesData, linkagesData] = await Promise.all([
        getAllUsers(),
        getAllRoles(),
        getAllEmployeesAction(),
        getAllLinkagesAction()
      ]);
      setUsers(usersData);
      setRoles(rolesData);
      setEmployees(employeesData || []);
      setTelegramLinkages(linkagesData || []);
    } catch (error) {
      logError('Error fetching users/roles/employees/linkages', { error });
      toast({ title: 'Error', description: 'No se pudieron cargar los datos de usuarios, roles, empleados y vinculaciones de Telegram.', variant: 'destructive' });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    setTitle('Gestión de Usuarios');
    fetchData();
  }, [setTitle, fetchData]);

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setCurrentUser(user);
      setIsEditing(true);
    } else {
      setCurrentUser({ ...emptyUser, password: '', forcePasswordChange: true });
      setIsEditing(false);
    }
    setDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!currentUser.name || !currentUser.email || (!isEditing && !currentUser.password) || !currentUser.role) {
      toast({ title: 'Datos Incompletos', description: 'Nombre, correo, contraseña (si es nuevo) y rol son requeridos.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing) {
        await updateUser(currentUser as User);
        toast({ title: 'Usuario Actualizado' });
      } else {
        await addUser({
          name: currentUser.name,
          email: currentUser.email,
          password: currentUser.password!,
          role: currentUser.role,
          phone: currentUser.phone || '',
          whatsapp: currentUser.whatsapp || '',
          erpAlias: currentUser.erpAlias || '',
          forcePasswordChange: !!(currentUser.forcePasswordChange ?? true),
          employeeId: currentUser.employeeId || null,
        });
        toast({ title: 'Usuario Creado' });
      }
      await fetchData(); // Re-fetch to see changes
      setDialogOpen(false);
    } catch (error: any) {
      logError('Failed to save user', { error: error.message });
      toast({ title: 'Error al Guardar', description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteUser(userToDelete.id);
      toast({ title: 'Usuario Eliminado', variant: 'destructive' });
      await fetchData(); // Re-fetch to see changes
    } catch (error: any) {
      logError('Failed to delete user', { error: error.message });
      toast({ title: 'Error al Eliminar', description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      setUserToDelete(null);
    }
  };

  const handleFieldChange = (field: keyof User | 'password', value: string | boolean) => {
    setCurrentUser(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
            <p className="text-muted-foreground">Crea, edita y gestiona las cuentas de usuario.</p>
          </div>
          {hasPermission('users:create') && (
            <Button onClick={() => handleOpenDialog()}>
              <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Usuario
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="p-4 text-left font-medium">Usuario</th>
                    <th className="p-4 text-left font-medium">Contacto</th>
                    <th className="p-4 text-left font-medium">Alias ERP</th>
                    <th className="p-4 text-left font-medium">Rol</th>
                    <th className="p-4 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={user.avatar} alt={user.name} />
                            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold">{user.name}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                            {user.employeeId && (
                              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded text-[10px] font-medium">
                                  Empleado: {(() => {
                                    const emp = employees.find(e => e.id === user.employeeId);
                                    return emp ? `${emp.name} (${user.employeeId})` : user.employeeId;
                                  })()}
                                </span>
                                {(() => {
                                  const linkedTelegram = telegramLinkages.find(t => t.employeeId === user.employeeId);
                                  return linkedTelegram ? (
                                    <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                      Telegram Bot Activo
                                    </span>
                                  ) : (
                                    <span className="bg-zinc-100 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400 px-2 py-0.5 rounded text-[10px] font-medium">
                                      Sin Telegram Bot
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        <div>{user.phone}</div>
                        <div>{user.whatsapp}</div>
                      </td>
                      <td className="p-4 text-sm font-mono">{user.erpAlias}</td>
                      <td className="p-4">
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {roles.find(r => r.id === user.role)?.name || user.role}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        {hasPermission('users:update') && (
                          <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(user)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {hasPermission('users:delete') && user.id !== 1 && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => setUserToDelete(user)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>¿Eliminar Usuario?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta acción eliminará permanentemente al usuario &quot;{userToDelete?.name}&quot;. No se puede deshacer.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteUser}>Sí, Eliminar</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <ScrollArea className="max-h-[70vh] p-1">
              <div className="space-y-4 pr-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre Completo</Label>
                    <Input id="name" value={currentUser.name || ''} onChange={(e) => handleFieldChange('name', e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo Electrónico</Label>
                    <Input id="email" type="email" value={currentUser.email || ''} onChange={(e) => handleFieldChange('email', e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{isEditing ? 'Nueva Contraseña (dejar en blanco para no cambiar)' : 'Contraseña'}</Label>
                  <Input id="password" type="password" value={currentUser.password || ''} onChange={(e) => handleFieldChange('password', e.target.value)} required={!isEditing} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input id="phone" value={currentUser.phone || ''} onChange={(e) => handleFieldChange('phone', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input id="whatsapp" value={currentUser.whatsapp || ''} onChange={(e) => handleFieldChange('whatsapp', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="employee">Vincular a Empleado (Opcional)</Label>
                        <div className="space-y-1.5">
                            <Select 
                              value={currentUser.employeeId || 'none'} 
                              onValueChange={(value) => {
                                const empId = value === 'none' ? null : value;
                                handleFieldChange('employeeId', empId || '');
                                if (empId) {
                                  const selectedEmp = employees.find(e => e.id === empId);
                                  if (selectedEmp) {
                                    handleFieldChange('name', selectedEmp.name);
                                  }
                                }
                              }}
                            >
                                <SelectTrigger id="employee">
                                  <SelectValue placeholder="Seleccionar un empleado" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sin vincular</SelectItem>
                                    {filteredEmployees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>
                                          {emp.name} ({emp.id}){emp.active === 'N' ? ' [INACTIVO]' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="flex items-center space-x-2">
                                <Checkbox 
                                  id="showInactiveEmployees" 
                                  checked={showInactiveEmployees} 
                                  onCheckedChange={(checked) => setShowInactiveEmployees(!!checked)} 
                                />
                                <Label htmlFor="showInactiveEmployees" className="text-xs text-muted-foreground font-normal cursor-pointer select-none">
                                  Mostrar también inactivos
                                </Label>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="erpAlias">Alias de Usuario (ERP)</Label>
                        <Input id="erpAlias" value={currentUser.erpAlias || ''} onChange={(e) => handleFieldChange('erpAlias', e.target.value)} />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label htmlFor="role">Rol</Label>
                        <Select value={currentUser.role} onValueChange={(value) => handleFieldChange('role', value)} required>
                            <SelectTrigger id="role"><SelectValue placeholder="Seleccionar un rol" /></SelectTrigger>
                            <SelectContent>
                            {roles.map(role => (
                                <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex items-center space-x-2 pt-4">
                  <Checkbox
                    id="forcePasswordChange"
                    checked={!!currentUser.forcePasswordChange}
                    onCheckedChange={(checked) => handleFieldChange('forcePasswordChange', !!checked)}
                  />
                  <Label htmlFor="forcePasswordChange" className="font-normal">Forzar cambio de contraseña en el próximo inicio de sesión</Label>
                </div>
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
            <Button onClick={handleSaveUser} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Guardar Cambios' : 'Crear Usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
