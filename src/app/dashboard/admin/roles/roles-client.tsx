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
import { Badge } from '@/components/ui/badge';
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
import { PlusCircle, Save, Trash2, ShieldQuestion, Copy, Search, X, Smartphone, Bot, Globe, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getDepartments } from '@/modules/inventory/lib/actions';

// Mapa de insignias de ámbito de canal
const CHANNEL_BADGES: Record<string, { label: string; icon: any; colorClass: string; searchKeywords: string }> = {
  // APK Clic Driver
  'deliveries:write': { label: 'APK Driver', icon: Smartphone, colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', searchKeywords: 'apk movil chofer android' },
  'deliveries:revert': { label: 'APK Driver', icon: Smartphone, colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', searchKeywords: 'apk movil chofer android' },
  'deliveries:collect': { label: 'APK Driver', icon: Smartphone, colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', searchKeywords: 'apk movil chofer android recolectas' },
  'deliveries:customers': { label: 'APK / GPS', icon: Smartphone, colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', searchKeywords: 'apk movil geocerca' },
  'users:edit:erp-alias': { label: 'APK / ERP', icon: Smartphone, colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', searchKeywords: 'apk chofer alias' },

  // Bot de Telegram & Asistente IA
  'ai:access': { label: 'Bot / IA', icon: Bot, colorClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30', searchKeywords: 'bot telegram ia asistente' },
  'ai:analytics:query': { label: 'Bot / IA', icon: Bot, colorClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30', searchKeywords: 'bot telegram ia kpis' },
  'ai:financial:query': { label: 'Bot / IA', icon: Bot, colorClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30', searchKeywords: 'bot telegram ia finanzas precios' },

  // Portal de Chofer Web
  'operaciones_chofer_web': { label: 'Portal Chofer Web', icon: Globe, colorClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30', searchKeywords: 'portal chofer web movil navegador' },
};

export default function RolesClient() {
  const { hasPermission } = useAuthorization(['roles:create', 'roles:read', 'roles:update', 'roles:delete']);
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { setTitle } = usePageTitle();

  // Search states
  const [roleSearchTerm, setRoleSearchTerm] = useState('');
  const [permSearchTerm, setPermSearchTerm] = useState('');

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
    setPermSearchTerm('');
    setDialogOpen(true);
  };
  
  const handleCopyRole = (role: Role) => {
    setCurrentRole({
        id: '', 
        name: `Copia de ${role.name}`,
        permissions: [...role.permissions]
    });
    setPermSearchTerm('');
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

    let roleId = currentRole.id;
    if (!roleId) {
        roleId = currentRole.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    const updatedRole: Role = {
        ...currentRole,
        id: roleId,
    };

    const isNew = !roles.some(r => r.id === updatedRole.id);
    let newRoles: Role[];

    if (isNew) {
        newRoles = [...roles, updatedRole];
    } else {
        newRoles = roles.map(r => r.id === updatedRole.id ? updatedRole : r);
    }
    
    try {
        await saveAllRoles(newRoles);
        setRoles(newRoles);
        toast({
            title: isNew ? 'Rol Creado' : 'Rol Actualizado',
            description: `El rol "${updatedRole.name}" se guardó correctamente.`,
        });
        setDialogOpen(false);
    } catch(e) {
        toast({
            title: 'Error al Guardar',
            description: 'No se pudo guardar la configuración de roles en la base de datos.',
            variant: 'destructive',
        });
    }
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;
    if (roleToDelete.id === 'admin') {
      toast({
        title: 'Acción No Permitida',
        description: 'El rol de Administrador no puede ser eliminado.',
        variant: 'destructive',
      });
      return;
    }

    const newRoles = roles.filter(r => r.id !== roleToDelete.id);

    try {
        await saveAllRoles(newRoles);
        setRoles(newRoles);
        toast({
            title: 'Rol Eliminado',
            description: `El rol "${roleToDelete.name}" fue eliminado.`,
        });
        setRoleToDelete(null);
    } catch(e) {
        toast({
            title: 'Error al Eliminar',
            description: 'No se pudo eliminar el rol.',
            variant: 'destructive',
        });
    }
  };

  const handleResetAdmin = async () => {
    try {
        await resetDefaultRoles();
        await fetchRoles();
        toast({
            title: 'Rol Restablecido',
            description: 'El rol de Administrador ha sido restablecido con todos los permisos.',
        });
    } catch (e) {
        toast({
            title: 'Error',
            description: 'No se pudo restablecer el rol de Administrador.',
            variant: 'destructive',
        });
    }
  };

  const handlePermissionChange = (
    permission: string,
    checked: boolean,
    role: Role
  ) => {
    if (!currentRole) return;

    const newPermissions = new Set(currentRole.permissions);

    const addWithChildren = (perm: string) => {
        newPermissions.add(perm);
        const children = localPermissionTree[perm];
        if (children) {
            children.forEach(addWithChildren);
        }
    };

    const removeWithParents = (perm: string) => {
        newPermissions.delete(perm);
        Object.entries(localPermissionTree).forEach(([parent, children]) => {
            if (children && children.includes(perm)) {
                removeWithParents(parent);
            }
        });
    };

    if (checked) {
        addWithChildren(permission);
    } else {
        removeWithParents(permission);
    }

    setCurrentRole({ ...currentRole, permissions: Array.from(newPermissions) });
  };

  const handleGroupPermissionChange = (
    permissions: string[],
    checked: boolean
  ) => {
    if (!currentRole) return;

    const newPermissions = new Set(currentRole.permissions);

    const addWithChildren = (perm: string) => {
        newPermissions.add(perm);
        const children = localPermissionTree[perm];
        if (children) {
            children.forEach(addWithChildren);
        }
    };

    const removeWithParents = (perm: string) => {
        newPermissions.delete(perm);
        Object.entries(localPermissionTree).forEach(([parent, children]) => {
            if (children && children.includes(perm)) {
                removeWithParents(parent);
            }
        });
    };

    permissions.forEach(p => {
        if (checked) {
            addWithChildren(p);
        } else {
            removeWithParents(p);
        }
    });

    setCurrentRole({ ...currentRole, permissions: Array.from(newPermissions) });
  };

  const filteredRoles = useMemo(() => {
    if (!roleSearchTerm.trim()) return roles;
    const query = roleSearchTerm.toLowerCase().trim();
    return roles.filter(r => 
      r.name.toLowerCase().includes(query) || 
      r.id.toLowerCase().includes(query)
    );
  }, [roles, roleSearchTerm]);

  const renderPermissionGroup = (
    groupName: string,
    permissions: string[],
    role: Role
  ) => {
    const allSelectedInGroup = permissions.length > 0 && permissions.every(p => role.permissions.includes(p));
    const activeCount = permissions.filter(p => role.permissions.includes(p)).length;
    const hasActive = activeCount > 0;

    const cleanSearch = permSearchTerm.toLowerCase().trim();
    let visiblePermissions = permissions;
    let isMatchInGroup = false;

    if (cleanSearch) {
      visiblePermissions = permissions.filter(p => {
        const trans = ((localPermissionTranslations as any)[p] || '').toLowerCase();
        const code = p.toLowerCase();
        const badgeInfo = CHANNEL_BADGES[p];
        const badgeKeywords = badgeInfo?.searchKeywords || '';
        const badgeLabel = badgeInfo?.label.toLowerCase() || '';

        return trans.includes(cleanSearch) || 
               code.includes(cleanSearch) || 
               badgeKeywords.includes(cleanSearch) ||
               badgeLabel.includes(cleanSearch) ||
               groupName.toLowerCase().includes(cleanSearch);
      });

      if (visiblePermissions.length === 0 && !groupName.toLowerCase().includes(cleanSearch)) {
        return null;
      }
      isMatchInGroup = true;
    }

    return (
      <details 
        key={groupName} 
        open={Boolean(cleanSearch && isMatchInGroup)} 
        className={`space-y-2 rounded-xl border transition-all p-2 ${
          hasActive 
            ? 'bg-emerald-500/[0.03] border-emerald-500/30 dark:border-emerald-500/20' 
            : 'border-border/60 hover:border-border'
        }`}
      >
        <summary className="cursor-pointer font-medium flex justify-between items-center py-1.5 px-2 hover:bg-muted/50 rounded-lg transition-colors select-none">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{groupName}</span>
            {hasActive ? (
              <Badge 
                variant="outline" 
                className="text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 flex items-center gap-1 py-0 px-2 shadow-xs"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                {activeCount} de {permissions.length} activos
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground bg-muted/30 border-muted/50 py-0 px-1.5">
                0 de {permissions.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mr-2" onClick={(e) => e.preventDefault()}>
            <Label htmlFor={`select-all-${groupName.replace(/\s+/g, '-')}`} className="text-xs font-normal cursor-pointer text-muted-foreground hover:text-foreground">
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

        <div className="pl-3 pr-1 pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 border-t border-border/40 mt-1">
          {visiblePermissions.map((permission) => {
            const isChecked = role.permissions.includes(permission);
            const badge = CHANNEL_BADGES[permission];
            const BadgeIcon = badge?.icon;

            return (
              <div 
                key={permission} 
                className={`flex items-start space-x-2 p-2 rounded-lg border transition-all ${
                  isChecked 
                    ? 'bg-emerald-500/5 border-emerald-500/20 dark:bg-emerald-500/10' 
                    : 'border-transparent hover:bg-muted/40'
                }`}
              >
                <Checkbox
                  id={`${role.id}-${permission}`}
                  checked={isChecked}
                  onCheckedChange={(checked) =>
                    handlePermissionChange(permission, !!checked, role)
                  }
                  disabled={role.id === 'admin'}
                  className="mt-0.5"
                />
                <div className="flex flex-col gap-1 leading-none">
                  <Label
                    htmlFor={`${role.id}-${permission}`}
                    className="font-normal text-xs cursor-pointer select-none leading-snug"
                  >
                    {(localPermissionTranslations as any)[permission] || permission}
                  </Label>
                  
                  {badge && (
                    <div>
                      <Badge 
                        variant="outline" 
                        className={`text-[9px] font-bold px-1.5 py-0 inline-flex items-center gap-1 ${badge.colorClass}`}
                      >
                        {BadgeIcon && <BadgeIcon className="w-2.5 h-2.5" />}
                        {badge.label}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Gestión de Roles</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Define roles de usuario, permisos del sistema y accesos a la APK Móvil o Bot.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAdmin}
              disabled={!hasPermission('roles:update')}
              className="text-xs"
            >
              <ShieldQuestion className="mr-1.5 h-4 w-4" />
              Restablecer Admin
            </Button>
            <Button
              size="sm"
              onClick={() => handleOpenDialog()}
              disabled={!hasPermission('roles:create')}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              <PlusCircle className="mr-1.5 h-4 w-4" />
              Nuevo Rol
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar roles por nombre o ID (ej. Chofer, Logística, Admin)..."
            value={roleSearchTerm}
            onChange={(e) => setRoleSearchTerm(e.target.value)}
            className="pl-9 pr-8 text-xs sm:text-sm bg-card border-border/80"
          />
          {roleSearchTerm && (
            <button 
              onClick={() => setRoleSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          {filteredRoles.length === 0 ? (
            <div className="p-8 text-center border border-dashed rounded-2xl bg-muted/20">
              <p className="text-sm text-muted-foreground">
                No se encontraron roles coincidentes con &quot;{roleSearchTerm}&quot;.
              </p>
            </div>
          ) : (
            filteredRoles.map((role) => (
              <Card key={role.id} className="transition-all hover:border-primary/40 shadow-xs">
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base sm:text-lg">{role.name}</CardTitle>
                        <Badge variant="outline" className="text-[10px] bg-muted/40 font-mono">
                          {role.permissions.length} permisos
                        </Badge>
                      </div>
                      <CardDescription className="text-xs mt-0.5">ID: <span className="font-mono">{role.id}</span></CardDescription>
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyRole(role)}
                        disabled={!hasPermission('roles:create')}
                        className="text-xs gap-1 h-8"
                      >
                        <Copy className="h-3.5 w-3.5"/>
                        Copiar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog(role)}
                        disabled={
                          role.id === 'admin' || !hasPermission('roles:update')
                        }
                        className="text-xs font-semibold h-8"
                      >
                        Editar Permisos
                      </Button>
                      <AlertDialog onOpenChange={(open) => !open && setRoleToDelete(null)}>
                          <AlertDialogTrigger asChild>
                              <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={
                                      role.id === 'admin' || !hasPermission('roles:delete')
                                  }
                                  onClick={() => setRoleToDelete(role)}
                                  className="h-8 px-2.5"
                                  >
                                  <Trash2 className="h-3.5 w-3.5" />
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
            ))
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl h-[88vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="p-4 sm:p-6 pb-3 border-b shrink-0 bg-background">
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-lg font-bold">
                  {currentRole?.id ? 'Editar Permisos del Rol' : 'Crear Nuevo Rol'}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {currentRole?.id
                    ? `Configurando permisos asignados para "${currentRole?.name}"`
                    : 'Crea un nuevo rol y selecciona sus permisos por categoría.'}
                </DialogDescription>
              </div>
              {currentRole && (
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-bold px-2.5 py-1">
                  ✓ {currentRole.permissions.length} permisos activos
                </Badge>
              )}
            </div>
          </DialogHeader>

          {currentRole && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
                <div className="space-y-1">
                  <Label htmlFor="role-name" className="text-xs font-semibold">Nombre del Rol</Label>
                  <Input
                    id="role-name"
                    value={currentRole.name}
                    onChange={(e) =>
                      setCurrentRole({ ...currentRole, name: e.target.value })
                    }
                    disabled={currentRole.id === 'admin'}
                    placeholder="Ej. Chofer Repartidor, Supervisor de Bodega..."
                    className="text-xs sm:text-sm h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="perm-search" className="text-xs font-semibold flex items-center justify-between">
                    <span>Filtrar Permisos</span>
                    {permSearchTerm && (
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-normal">
                        Filtrando resultados
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      id="perm-search"
                      placeholder="Buscar permiso, código o canal (ej. apk, bot, portal, erp)..."
                      value={permSearchTerm}
                      onChange={(e) => setPermSearchTerm(e.target.value)}
                      className="pl-8 pr-7 text-xs h-9"
                    />
                    {permSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setPermSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-[11px] bg-muted/30 p-2 rounded-lg border border-border/50 text-muted-foreground shrink-0">
                <span className="font-semibold text-foreground text-[10px]">Insignias de Ámbito:</span>
                <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[10px] font-bold">
                  <Smartphone className="w-2.5 h-2.5" /> APK Driver
                </span>
                <span className="inline-flex items-center gap-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded text-[10px] font-bold">
                  <Bot className="w-2.5 h-2.5" /> Bot / IA
                </span>
                <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded text-[10px] font-bold">
                  <Globe className="w-2.5 h-2.5" /> Portal Chofer Web
                </span>
              </div>

              <div className="space-y-3 pb-4">
                {Object.entries(localPermissionGroups).map(([groupName, perms]) =>
                  renderPermissionGroup(groupName, perms as any, currentRole)
                )}
              </div>
            </div>
          )}

          <DialogFooter className="p-3 sm:p-4 border-t shrink-0 bg-background flex items-center justify-between sm:justify-between">
            <DialogClose asChild>
              <Button variant="ghost" size="sm" className="text-xs">Cancelar</Button>
            </DialogClose>
            <Button
              onClick={handleSaveRole}
              disabled={currentRole?.id === 'admin'}
              size="sm"
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
