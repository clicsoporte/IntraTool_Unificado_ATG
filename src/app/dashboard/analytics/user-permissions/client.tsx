
/**
 * @fileoverview Page for the User Permissions Report.
 * It displays a filterable and sortable list of all users, their assigned roles,
 * and the specific permissions granted by those roles.
 */
'use client';

import React from 'react';
import { useUserPermissionsReport } from '@/modules/analytics/hooks/useUserPermissionsReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Loader2, FileDown, FileSpreadsheet, Search, FilterX, ArrowUp, ArrowDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { UserPermissionRow, SortKey } from '@/modules/analytics/hooks/useUserPermissionsReport';

export default function UserPermissionsReportPage() {
    const {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    } = useUserPermissionsReport();

    const { isLoading, searchTerm, sortKey, sortDirection } = state;

    if (isInitialLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-5 w-96 mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full max-w-sm" />
                        <Skeleton className="h-48 w-full" />
                    </CardContent>
                </Card>
            </main>
        );
    }
    
    if (isAuthorized === false) {
        return null;
    }
    
    const renderSortIcon = (key: SortKey) => {
        if (sortKey !== key) return null;
        return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
    };

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Reporte de Permisos de Usuario</CardTitle>
                    <CardDescription>
                        Audita qué permisos tiene cada usuario según el rol que se le ha asignado en el sistema.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Buscar por usuario, correo o rol..." 
                            value={searchTerm} 
                            onChange={(e) => actions.setSearchTerm(e.target.value)} 
                            className="pl-8 w-full"
                        />
                    </div>
                     <Button variant="ghost" onClick={() => actions.setSearchTerm('')}>
                        <FilterX className="mr-2 h-4 w-4" />
                        Limpiar Filtros
                    </Button>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Listado de Permisos</CardTitle>
                         <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={actions.handleExportPDF} disabled={isLoading || selectors.filteredData.length === 0}><FileDown className="mr-2"/>Exportar PDF</Button>
                            <Button variant="outline" onClick={actions.handleExportExcel} disabled={isLoading || selectors.filteredData.length === 0}><FileSpreadsheet className="mr-2"/>Exportar Excel</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[60vh] border rounded-md">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead className="cursor-pointer hover:bg-muted" onClick={() => actions.handleSort('userName')}>
                                        <div className="flex items-center gap-2">Usuario {renderSortIcon('userName')}</div>
                                    </TableHead>
                                    <TableHead className="cursor-pointer hover:bg-muted" onClick={() => actions.handleSort('roleName')}>
                                        <div className="flex items-center gap-2">Rol {renderSortIcon('roleName')}</div>
                                    </TableHead>
                                    <TableHead>Permisos Asignados</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={3}><Skeleton className="h-8 w-full" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : selectors.filteredData.length > 0 ? (
                                    selectors.filteredData.map(item => (
                                        <TableRow key={item.userId}>
                                            <TableCell className="font-medium align-top">
                                                <p>{item.userName}</p>
                                                <p className="text-sm text-muted-foreground">{item.userEmail}</p>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <Badge variant={item.roleId === 'admin' ? 'default' : 'secondary'}>{item.roleName}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {item.permissions.length > 0 ? item.permissions.map(perm => (
                                                        <Badge key={perm} variant="outline" className="font-normal">{selectors.translatePermission(perm)}</Badge>
                                                    )) : (
                                                        <span className="text-xs text-muted-foreground">Sin permisos específicos.</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-32 text-center">
                                            No se encontraron usuarios para los filtros seleccionados.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </main>
    );
}
