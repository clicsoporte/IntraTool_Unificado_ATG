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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/modules/core/hooks/use-toast';
import { logInfo, logError } from '@/modules/core/lib/logger';
import {
  permissionGroups,
  permissionTranslations,
  permissionTree,
  AppPermission,
} from '@/modules/core/lib/permissions';
import { getAllRoles, saveAllRoles, resetDefaultRoles } from '@/modules/core/lib/db';
import type { Role } from '@/modules/core/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, Save, Trash2, ShieldQuestion, Copy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getDepartments } from '@/modules/inventory/lib/actions';

export default function RolesClient() {
  const { hasPermission } = useAuthorization(['roles:create', 'roles:read', 'roles:update', 'roles:delete']);
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { setTitle } = usePageTitle();

  const [localPermissionGroups, setLocalPermissionGroups] = useState<Record<string, string[]>>(permissionGroups);
  const [localPermissionTranslations, setLocalPermissionTranslations] = useState<Record<string, string>>(permissionTranslations);
  const [localPermissionTree, setLocalPermissionTree] = useState<Record<string, string[]>>(permissionTree as any);

  const [isDialogOpen, setDialogOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

  const fetchRoles = useCallback(async () => {
    setIsLoading(true);
    try {
      const rolesData = await getAllRoles();
      setRoles(rolesData);
    } catch (error) {
      logError('Error fetching roles', { error });
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los roles.',
        variant: 'destructive',
      });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    setTitle('Gestión de Roles');
    
    async function loadDynamicPermissions() {
      try {
        const depts = await getDepartments();
        const activeDepts = depts.filter((d: any) => Number(d.is_active) === 1);
        
        const ticketGroupPermissions: string[] = [];
        const newTranslations = { ...permissionTranslations } as any;
        const newTree = { ...permissionTree } as any;

        activeDepts.forEach((d: any) => {
            const readPerm = `tickets:read:${d.id}`;
            const createPerm = `tickets:create:${d.id}`;
            const managePerm = `tickets:manage:${d.id}`;

            ticketGroupPermissions.push(readPerm, createPerm, managePerm);

            newTranslations[readPerm] = `Tickets: Ver Soporte de ${d.name}`;
            newTranslations[createPerm] = `Tickets: Crear Ticket en ${d.name}`;
            newTranslations[managePerm] = `Tickets: Gestionar Tickets de ${d.name}`;

            newTree[readPerm] = [createPerm, managePerm];
            
            if (newTree["dashboard:access"]) {
                newTree["dashboard:access"] = [...newTree["dashboard:access"], readPerm];
            }
        });

        const updatedGroups = { ...permissionGroups } as any;
        updatedGroups["Mesa de Tickets (Soporte Técnico)"] = [
            ...permissionGroups["Mesa de Tickets (Soporte Técnico)"],
            ...ticketGroupPermissions
        ];

        setLocalPermissionGroups(updatedGroups);
        setLocalPermissionTranslations(newTranslations);
        setLocalPermissionTree(newTree);
      } catch (err) {
        console.error("Failed to load dynamic department permissions:", err);
      }
    }

    loadDynamicPermissions();
    fetchRoles();
  }, [setTitle, fetchRoles]);

  const handleOpenDialog = (role?: Role) => {
    setCurrentRole(role ? { ...role } : { id: '', name: '', permissions: [] });
    setDialogOpen(true);
  };
  
  const handleCopyRole = (role: Role) => {
    setCurrentRole({
        id: '', // New role, so no ID
        name: `Copia de ${role.name}`,
        permissions: [...role.permissions] // Copy permissions
    });
    setDialogOpen(true);
  }

  const handleSaveRole = async () => {
    if (!currentRole || !currentRole.name.trim()) {
      toast({
        title: 'Error de Validación',
        description: 'El nombre del rol no puede estar vacío.',
        variant: 'destructive',
      });
      return;
    }

    let updatedRoles;
    const isNew = !currentRole.id;
    if (isNew) {
      const newRoleId = currentRole.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      if (roles.some((r) => r.id === newRoleId)) {
        toast({
          title: 'Error',
          description: 'Ya existe un rol con un ID similar.',
          variant: 'destructive',
        });
        return;
      }
      updatedRoles = [...roles, { ...currentRole, id: newRoleId }];
    } else {
      updatedRoles = roles.map((r) =>
        r.id === currentRole.id ? currentRole : r
      );
    }

    try {
      await saveAllRoles(updatedRoles);
      setRoles(updatedRoles);
      toast({
        title: 'Roles Guardados',
        description: `El rol "${currentRole.name}" ha sido ${
          isNew ? 'creado' : 'actualizado'
        }.`,
      });
      await logInfo('Roles saved', { role: currentRole.name });
    } catch (err: any) {
      logError('Failed to save roles', { error: err.message });
      toast({
        title: 'Error al Guardar Roles',
        description: err.message || 'No se pudieron guardar los roles.',
        variant: 'destructive',
      });
    }

    setDialogOpen(false);
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;
    if (roleToDelete.id === 'admin') {
      toast({
        title: 'Acción no permitida',
        description: 'No se puede eliminar el rol de Administrador.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const updatedRoles = roles.filter((r) => r.id !== roleToDelete.id);
      await saveAllRoles(updatedRoles);
      setRoles(updatedRoles);
      toast({
        title: 'Rol Eliminado',
        description: `El rol "${roleToDelete.name}" ha sido eliminado.`,
        variant: 'destructive',
      });
      await logInfo('Role deleted', { roleId: roleToDelete.id });
    } catch (err: any) {
      logError('Failed to delete role', { error: err.message });
      toast({
        title: 'Error al Eliminar Rol',
        description: err.message || 'No se pudo eliminar el rol.',
        variant: 'destructive',
      });
    } finally {
      setRoleToDelete(null);
    }
  };

  const handleResetAdmin = async () => {
    await resetDefaultRoles();
    await fetchRoles(); // Re-fetch all roles to get the updated admin role
    toast({
      title: 'Rol de Administrador Restablecido',
      description:
        'Todos los permisos han sido re-asignados al rol de Administrador.',
    });
    await logInfo('Admin role reset to default');
  };

  const handlePermissionChange = (permission: any, isChecked: boolean, role: Role) => {
    if (!currentRole) return;

    let newPermissions = new Set(role.permissions as string[]);

    const addWithChildren = (perm: any) => {
        newPermissions.add(perm);
        const children = localPermissionTree[perm] || [];
        for (const child of children) {
            addWithChildren(child);
        }
    };
    
    const removeWithParents = (perm: any) => {
        newPermissions.delete(perm);
        for (const parent in localPermissionTree) {
            const parentPerm = parent;
            if (localPermissionTree[parentPerm]?.includes(perm)) {
                removeWithParents(parentPerm);
            }
        }
    };
    
    if (isChecked) {
        addWithChildren(permission);
    } else {
        removeWithParents(permission);
    }
    
    setCurrentRole({ ...role, permissions: Array.from(newPermissions) });
  };
  
 const handleGroupPermissionChange = (groupPermissions: any[], check: boolean) => {
    if (!currentRole) return;
    
    let newPermissions = new Set(currentRole.permissions as string[]);

    const addWithChildren = (perm: any) => {
        newPermissions.add(perm);
        const children = localPermissionTree[perm] || [];
        for (const child of children) {
            addWithChildren(child);
        }
    };

    const removeWithParents = (perm: any) => {
        newPermissions.delete(perm);
        for (const parent in localPermissionTree) {
            const parentPerm = parent;
            if (localPermissionTree[parentPerm]?.includes(perm)) {
                removeWithParents(parentPerm);
            }
        }
    };

    groupPermissions.forEach(p => {
        if (check) {
            addWithChildren(p);
        } else {
            removeWithParents(p);
        }
    });

    setCurrentRole({ ...currentRole, permissions: Array.from(newPermissions) });
};


  const renderPermissionGroup = (
    groupName: string,
    permissions: string[],
    role: Role
  ) => {
    const allSelectedInGroup = permissions.every(p => role.permissions.includes(p));

    return (
      <details key={groupName} className="space-y-2">
        <summary className="cursor-pointer font-medium flex justify-between items-center py-2 hover:bg-muted/50 rounded-md -mx-2 px-2">
          <span>{groupName}</span>
          <div className="flex items-center gap-2 mr-4" onClick={(e) => e.preventDefault()}>
            <Label htmlFor={`select-all-${groupName.replace(/\s+/g, '-')}`} className="text-xs font-normal cursor-pointer">
              Todos
            </Label>
            <Checkbox
              id={`select-all-${groupName.replace(/\s+/g, '-')}`}
              checked={allSelectedInGroup}
              onCheckedChange={(checked) => handleGroupPermissionChange(permissions, !!checked)}
              disabled={role.id === 'admin'}
            />
          </div>
        </summary>
        <div className="pl-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 border-l-2 ml-2 pl-4">
          {permissions.map((permission) => (
            <div key={permission} className="flex items-center space-x-2">
              <Checkbox
                id={`${role.id}-${permission}`}
                checked={role.permissions.includes(permission)}
                onCheckedChange={(checked) =>
                  handlePermissionChange(permission, !!checked, role)
                }
                disabled={role.id === 'admin'}
              />
              <Label
                htmlFor={`${role.id}-${permission}`}
                className="font-normal text-sm"
              >
                {(localPermissionTranslations as any)[permission] || permission}
              </Label>
            </div>
          ))}
        </div>
      </details>
    );
  };

  if (isLoading) {
    return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Gestión de Roles</h1>
            <p className="text-muted-foreground">
              Define roles de usuario y asigna permisos específicos.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleResetAdmin}
              disabled={!hasPermission('roles:update')}
            >
              <ShieldQuestion className="mr-2 h-4 w-4" />
              Restablecer Rol Admin
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              disabled={!hasPermission('roles:create')}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Nuevo Rol
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>{role.name}</CardTitle>
                    <CardDescription>ID: {role.id}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => handleCopyRole(role)}
                      disabled={!hasPermission('roles:create')}
                    >
                      <Copy className="mr-2 h-4 w-4"/>
                      Copiar Rol
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleOpenDialog(role)}
                      disabled={
                        role.id === 'admin' || !hasPermission('roles:update')
                      }
                    >
                      Editar Permisos
                    </Button>
                     <AlertDialog onOpenChange={(open) => !open && setRoleToDelete(null)}>
                        <AlertDialogTrigger asChild>
                             <Button
                                variant="destructive"
                                disabled={
                                    role.id === 'admin' || !hasPermission('roles:delete')
                                }
                                onClick={() => setRoleToDelete(role)}
                                >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar el rol &quot;{roleToDelete?.name}&quot;?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción no se puede deshacer. Los usuarios con este rol perderán sus permisos.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteRole}>Sí, Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {currentRole?.id ? 'Editar Rol' : 'Nuevo Rol'}
            </DialogTitle>
            <DialogDescription>
              {currentRole?.id
                ? `Editando permisos para "${currentRole?.name}"`
                : 'Crea un nuevo rol y asigna sus permisos.'}
            </DialogDescription>
          </DialogHeader>
          {currentRole && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Nombre del Rol</Label>
                <Input
                  id="role-name"
                  value={currentRole.name}
                  onChange={(e) =>
                    setCurrentRole({ ...currentRole, name: e.target.value })
                  }
                  disabled={currentRole.id === 'admin'}
                />
              </div>
              <ScrollArea className="h-[50vh] rounded-md border p-4">
                <div className="space-y-6">
                  {Object.entries(localPermissionGroups).map(([groupName, perms]) =>
                    renderPermissionGroup(groupName, perms as any, currentRole)
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <Button
              onClick={handleSaveRole}
              disabled={currentRole?.id === 'admin'}
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
