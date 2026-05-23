/**
 * @fileoverview Hook to manage the logic for the Warehouse Occupancy Report page.
 */
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getOccupancyReportData } from '@/modules/analytics/lib/actions';
import type { UserPreferences, WarehouseLocation, WarehouseSettings } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';

export type SortKey = 'locationPath' | 'status';
export type SortDirection = 'asc' | 'desc';
export type StatusFilter = 'all' | 'Libre' | 'Ocupado' | 'Mixto';

export interface OccupancyReportRow {
    locationId: number;
    locationPath: string;
    status: 'Libre' | 'Ocupado' | 'Mixto';
    items: {
        productId: string;
        productDescription: string;
        classification: string;
        quantity: number | undefined;
    }[];
    clients: {
        clientId: string;
        clientName: string;
    }[];
}


const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

interface State {
    isLoading: boolean;
    data: OccupancyReportRow[];
    allLocations: WarehouseLocation[];
    warehouseSettings: WarehouseSettings | null;
    searchTerm: string;
    sortKey: SortKey;
    sortDirection: SortDirection;
    statusFilter: StatusFilter;
    classificationFilter: string[];
    clientFilter: string[];
    rackFilter: string[];
    levelFilter: string[];
    currentPage: number;
    rowsPerPage: number;
    visibleColumns: string[];
    hasRun: boolean;
}

export const useOccupancyReport = () => {
    const { isAuthorized } = useAuthorization(['analytics:occupancy-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, products } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: false,
        data: [],
        allLocations: [],
        warehouseSettings: null,
        searchTerm: '',
        sortKey: 'locationPath',
        sortDirection: 'asc',
        statusFilter: 'all',
        classificationFilter: [],
        clientFilter: [],
        rackFilter: [],
        levelFilter: [],
        currentPage: 0,
        rowsPerPage: 25,
        visibleColumns: ['locationPath', 'status', 'items', 'clients'],
        hasRun: false,
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const fetchData = useCallback(async () => {
        updateState({ isLoading: true });
        try {
            const { reportRows, allLocations, warehouseSettings } = await getOccupancyReportData();
            updateState({ data: reportRows, allLocations, warehouseSettings });
        } catch (error: any) {
            logError("Failed to fetch occupancy report data", { error: error.message });
            toast({ title: "Error al Generar Reporte", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isLoading: false, hasRun: true });
        }
    }, [toast, updateState]);
    
    const loadPrefs = useCallback(async () => {
        if(user) {
           const prefs = await getUserPreferences(user.id, 'occupancyReportPrefs');
           if (prefs) {
               updateState({ visibleColumns: prefs.visibleColumns || state.visibleColumns });
           }
       }
       setIsInitialLoading(false);
   }, [user, updateState, state.visibleColumns]);

    useEffect(() => {
        setTitle("Reporte de Ocupación de Almacén");
        if (isAuthorized) {
            loadPrefs();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTitle, isAuthorized]);

    const getDescendantIds = useCallback((parentIds: number[]): Set<number> => {
        const descendants = new Set<number>();
        if (parentIds.length === 0) return descendants;

        const queue: number[] = [...parentIds];
        const visited = new Set<number>();
    
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            
            descendants.add(currentId);
    
            const children = state.allLocations.filter(l => l.parentId === currentId);
            children.forEach(child => queue.push(child.id));
        }
        return descendants;
    }, [state.allLocations]);

    const filteredData = useMemo(() => {
        let filtered = [...state.data];

        if (state.statusFilter !== 'all') {
            filtered = filtered.filter(item => item.status === state.statusFilter);
        }

        if (state.classificationFilter.length > 0) {
            filtered = filtered.filter(item => item.items.some(prod => state.classificationFilter.includes(prod.classification)));
        }
        
        if (state.clientFilter.length > 0) {
            filtered = filtered.filter(item => item.clients.some(client => state.clientFilter.includes(client.clientId)));
        }

        if (state.levelFilter.length > 0) {
            const targetLocationIds = getDescendantIds(state.levelFilter.map(Number));
            filtered = filtered.filter(item => targetLocationIds.has(item.locationId));
        } else if (state.rackFilter.length > 0) {
            const targetLocationIds = getDescendantIds(state.rackFilter.map(Number));
            filtered = filtered.filter(item => targetLocationIds.has(item.locationId));
        }

        if (debouncedSearchTerm) {
            const searchLower = normalizeText(debouncedSearchTerm);
            filtered = filtered.filter(item => {
                const itemText = item.items.map(i => `${i.productId} ${i.productDescription}`).join(' ');
                const clientText = item.clients.map(c => c.clientName).join(' ');
                const fullText = `${item.locationPath} ${itemText} ${clientText}`;
                return normalizeText(fullText).includes(searchLower);
            });
        }
        
        filtered.sort((a, b) => {
            const dir = state.sortDirection === 'asc' ? 1 : -1;
            const valA = a[state.sortKey] || '';
            const valB = b[state.sortKey] || '';
            return valA.localeCompare(valB, 'es', { numeric: true }) * dir;
        });

        return filtered;
    }, [state.data, debouncedSearchTerm, state.statusFilter, state.classificationFilter, state.clientFilter, state.rackFilter, state.levelFilter, state.sortKey, state.sortDirection, getDescendantIds]);
    
    const paginatedData = useMemo(() => {
        const start = state.currentPage * state.rowsPerPage;
        const end = start + state.rowsPerPage;
        return filteredData.slice(start, end);
    }, [filteredData, state.currentPage, state.rowsPerPage]);

    const handleSort = (key: SortKey) => {
        updateState({ sortKey: key, sortDirection: state.sortKey === key && state.sortDirection === 'asc' ? 'desc' : 'asc' });
    };

    const savePreferences = async () => {
        if (!user) return;
        try {
            const prefs: Partial<UserPreferences> = { visibleColumns: state.visibleColumns };
            await saveUserPreferences(user.id, 'occupancyReportPrefs', prefs);
            toast({ title: 'Preferencias Guardadas' });
        } catch (error: any) {
            logError('Failed to save preferences for occupancy report', { error: error.message });
            toast({ title: 'Error', description: 'No se pudieron guardar las preferencias.', variant: 'destructive' });
        }
    };
    
     const handleExportExcel = () => {
        const headers = ["Ubicación", "Estado", "Artículos", "Clientes"];
        const dataToExport = filteredData.map(item => [
            item.locationPath,
            item.status,
            item.items.map(i => `${i.productDescription} (${i.productId}) ${i.quantity !== undefined ? `[${i.quantity}]` : ''}`).join(', '),
            item.clients.map(c => c.clientName).join(', '),
        ]);
        exportToExcel({
            fileName: 'reporte_ocupacion_almacen',
            sheetName: 'Ocupacion',
            headers,
            data: dataToExport,
            columnWidths: [50, 15, 60, 40],
        });
    };

    const handleExportDetailedExcel = () => {
        const headers = ["Ubicación", "Estado", "Código Artículo", "Descripción Artículo", "Clasificación", "Cantidad", "Clientes"];
        const dataToExport: any[][] = [];
        
        filteredData.forEach(item => {
            if (item.items.length === 0) {
                dataToExport.push([
                    item.locationPath,
                    item.status,
                    "-",
                    "-",
                    "-",
                    0,
                    item.clients.map(c => c.clientName).join(', ') || "Venta General"
                ]);
            } else {
                item.items.forEach(i => {
                    dataToExport.push([
                        item.locationPath,
                        item.status,
                        i.productId,
                        i.productDescription,
                        i.classification || "-",
                        i.quantity !== undefined ? i.quantity : 0,
                        item.clients.map(c => c.clientName).join(', ') || "Venta General"
                    ]);
                });
            }
        });
        
        exportToExcel({
            fileName: 'reporte_ocupacion_almacen_detallado',
            sheetName: 'Detalle Ocupacion',
            headers,
            data: dataToExport,
            columnWidths: [40, 15, 20, 50, 20, 12, 40],
        });
    };

    return {
        state,
        actions: {
            fetchData,
            setSearchTerm: (term: string) => updateState({ searchTerm: term, currentPage: 0 }),
            handleSort,
            handleExportExcel,
            handleExportDetailedExcel,
            setStatusFilter: (filter: StatusFilter) => updateState({ statusFilter: filter, currentPage: 0 }),
            setClassificationFilter: (filter: string[]) => updateState({ classificationFilter: filter, currentPage: 0 }),
            setClientFilter: (filter: string[]) => updateState({ clientFilter: filter, currentPage: 0 }),
            setRackFilter: (filter: string[]) => updateState({ rackFilter: filter, levelFilter: [], currentPage: 0 }),
            setLevelFilter: (filter: string[]) => updateState({ levelFilter: filter, currentPage: 0 }),
            setCurrentPage: (page: number) => updateState({ currentPage: page }),
            setRowsPerPage: (size: number) => updateState({ rowsPerPage: size, currentPage: 0 }),
            handleColumnVisibilityChange: (columnId: string, checked: boolean) => updateState({ visibleColumns: checked ? [...state.visibleColumns, columnId] : state.visibleColumns.filter(id => id !== columnId) }),
            savePreferences,
            handleClearFilters: () => updateState({
                searchTerm: '',
                statusFilter: 'all',
                classificationFilter: [],
                clientFilter: [],
                rackFilter: [],
                levelFilter: [],
                currentPage: 0,
            }),
        },
        selectors: {
            filteredData,
            paginatedData,
            totalPages: Math.ceil(filteredData.length / state.rowsPerPage),
            classifications: useMemo(() => Array.from(new Set(products.map(p => p.classification).filter(Boolean))), [products]),
            clients: useMemo(() => {
                const allClientsInReport = new Map<string, { id: string, name: string }>();
                state.data.forEach(row => {
                    row.clients.forEach(client => {
                        if (!allClientsInReport.has(client.clientId)) {
                            allClientsInReport.set(client.clientId, { id: client.clientId, name: client.clientName });
                        }
                    });
                });
                return Array.from(allClientsInReport.values());
            }, [state.data]),
             rackOptions: useMemo(() => {
                if (!state.warehouseSettings) return [];
                const rackType = state.warehouseSettings.locationLevels.find(l => l.name.toLowerCase().includes('rack'))?.type;
                if (!rackType) return [];
                return state.allLocations.filter(l => l.type === rackType).map(l => ({ value: String(l.id), label: l.name }));
            }, [state.allLocations, state.warehouseSettings]),
            levelOptions: useMemo(() => {
                if (state.rackFilter.length === 0 || !state.warehouseSettings) return [];
                const rackIds = new Set(state.rackFilter.map(Number));
                const levelType = state.warehouseSettings.locationLevels.find(l => l.name.toLowerCase().includes('nivel') || l.name.toLowerCase().includes('estante'))?.type;
                if (!levelType) return [];
                return state.allLocations.filter(l => l.type === levelType && l.parentId && rackIds.has(l.parentId)).map(l => ({ value: String(l.id), label: l.name }));
            }, [state.allLocations, state.rackFilter, state.warehouseSettings]),
            availableColumns: [
                { id: 'locationPath', label: 'Ubicación', sortable: true },
                { id: 'status', label: 'Estado', sortable: true },
                { id: 'items', label: 'Artículos' },
                { id: 'clients', label: 'Clientes Asignados' },
            ],
            visibleColumnsData: useMemo(() => state.visibleColumns.map(id => ({ id, label: ({
                'locationPath': 'Ubicación',
                'status': 'Estado',
                'items': 'Artículos',
                'clients': 'Clientes Asignados'
            })[id] || id })).filter(Boolean), [state.visibleColumns]),
            renderCellContent: (item: OccupancyReportRow, colId: string): { content: React.ReactNode, className?: string } => {
                switch(colId) {
                    case 'locationPath': return { content: item.locationPath };
                    case 'status': return { content: <Badge variant={item.status === 'Libre' ? 'secondary' : (item.status === 'Ocupado' ? 'default' : 'destructive')}>{item.status}</Badge> };
                    case 'items':
                        if (item.items.length === 0) return { content: <span className="text-muted-foreground">-</span> };
                        const firstItem = item.items[0];
                        
                        if (item.status === 'Ocupado') {
                            return { 
                                content: (
                                    <div>
                                        <p>{firstItem.productDescription}</p>
                                        <p className="text-xs text-muted-foreground">{firstItem.productId}</p>
                                    </div>
                                )
                            };
                        }

                        const content = (
                            <div className="flex items-center gap-2">
                                <span>{firstItem.productDescription} {firstItem.quantity !== undefined && `(${firstItem.quantity})`}</span>
                                {item.items.length > 1 && <Badge variant="outline">{`+${item.items.length - 1}`}</Badge>}
                            </div>
                        );
                        return { content: item.status === 'Mixto' ? <div className="flex items-center gap-1">{content}<Info className="h-3 w-3 text-muted-foreground"/></div> : content };
                    case 'clients':
                        if (item.clients.length === 0) return { content: <span className="text-muted-foreground">Venta General</span> };
                        const firstClient = item.clients[0];
                        return { content: <>{firstClient.clientName}{item.clients.length > 1 && <Badge variant="outline" className="ml-2">{`+${item.clients.length-1}`}</Badge>}</> };
                    default: return { content: '' };
                }
            }
        },
        isAuthorized,
        isInitialLoading,
    };
};
