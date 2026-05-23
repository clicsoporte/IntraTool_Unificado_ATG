/**
 * @fileoverview Hook to manage the logic for the user permissions report page.
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getAllItemLocations, getLocations } from '@/modules/warehouse/lib/actions';
import type { ItemLocation, WarehouseLocation, DateRange } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { format, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

export interface ItemAssignmentRow extends ItemLocation {
    productName: string;
    clientName: string;
    locationPath: string;
}

export type SortKey = 'product' | 'client' | 'location' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';
export type TypeFilter = 'all' | 'exclusive' | 'general' | 'unassigned';


const normalizeText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

interface State {
    isLoading: boolean;
    data: ItemAssignmentRow[];
    searchTerm: string;
    sortKey: SortKey;
    sortDirection: SortDirection;
    typeFilter: TypeFilter;
    classificationFilter: string[];
    dateRange: DateRange;
    currentPage: number;
    rowsPerPage: number;
}

const renderLocationPathAsString = (locationId: number | null, locations: WarehouseLocation[]): string => {
    if (!locationId) return "N/A";
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
    while (current) {
        path.unshift(current);
        const parentId = current.parentId;
        if (!parentId) break;
        current = locations.find(l => l.id === parentId);
    }
    return path.map(l => l.name).join(' > ');
};


export function useItemAssignmentsReport() {
    const { isAuthorized } = useAuthorization(['analytics:item-assignments-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData, products, customers } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: false, // Set to false initially, only true during fetch
        data: [],
        searchTerm: '',
        sortKey: 'product',
        sortDirection: 'asc',
        typeFilter: 'all',
        classificationFilter: [],
        dateRange: { from: startOfDay(new Date()), to: new Date() },
        currentPage: 0,
        rowsPerPage: 25,
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, companyData?.searchDebounceTime ?? 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const fetchData = useCallback(async () => {
        if (!isAuthorized) return;
        updateState({ isLoading: true });
        try {
            const [assignments, locations] = await Promise.all([
                getAllItemLocations(),
                getLocations(),
            ]);
            
            const enrichedData = assignments.map(a => ({
                ...a,
                productName: products.find(p => p.id === a.itemId)?.description || a.itemId,
                clientName: customers.find(c => c.id === a.clientId)?.name || '',
                locationPath: a.cached_full_path || renderLocationPathAsString(a.locationId, locations),
            }));

            updateState({ data: enrichedData });
        } catch (error: any) {
            logError("Failed to get item assignments report data", { error: error.message });
            toast({ title: "Error al Generar Reporte", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isLoading: false });
        }
    }, [isAuthorized, toast, updateState, products, customers]);
    
    useEffect(() => {
        setTitle("Reporte de Catálogo de Clientes");
        if (isAuthorized) {
            setIsInitialLoading(false);
        }
    }, [setTitle, isAuthorized]);

    const filteredData = useMemo(() => {
        let filtered = state.data;
        
        if (state.typeFilter !== 'all') {
            switch(state.typeFilter) {
                case 'exclusive': filtered = filtered.filter(a => a.clientId && a.isExclusive === 1); break;
                case 'general': filtered = filtered.filter(a => !a.isExclusive); break;
                case 'unassigned': filtered = filtered.filter(a => !a.clientId); break;
            }
        }
        
        if (debouncedSearchTerm) {
            const searchLower = normalizeText(debouncedSearchTerm);
            filtered = filtered.filter(item => 
                normalizeText(item.productName).includes(searchLower) ||
                normalizeText(item.itemId).includes(searchLower) ||
                normalizeText(item.clientName).includes(searchLower) ||
                normalizeText(item.locationPath).includes(searchLower)
            );
        }
        
        if (state.classificationFilter.length > 0) {
            filtered = filtered.filter(item => {
                const product = products.find(p => p.id === item.itemId);
                return product && state.classificationFilter.includes(product.classification);
            });
        }

        if (state.dateRange?.from) {
            const fromDate = startOfDay(state.dateRange.from);
            filtered = filtered.filter(item => item.updatedAt && new Date(item.updatedAt) >= fromDate);
        }
        if (state.dateRange?.to) {
            const toDate = new Date(state.dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(item => item.updatedAt && new Date(item.updatedAt) <= toDate);
        }
        
        filtered.sort((a, b) => {
            const dir = state.sortDirection === 'asc' ? 1 : -1;
            let valA, valB;
            switch(state.sortKey) {
                case 'product': valA = a.productName; valB = b.productName; break;
                case 'client': valA = a.clientName; valB = b.clientName; break;
                case 'location': valA = a.locationPath; valB = b.locationPath; break;
                case 'updatedAt': valA = a.updatedAt || ''; valB = b.updatedAt || ''; break;
                default: return 0;
            }
            return (valA || '').localeCompare(valB || '', 'es') * dir;
        });

        return filtered;
    }, [state.data, debouncedSearchTerm, state.sortKey, state.sortDirection, state.typeFilter, state.classificationFilter, products, state.dateRange]);
    
    const paginatedData = useMemo(() => {
        const start = state.currentPage * state.rowsPerPage;
        const end = start + state.rowsPerPage;
        return filteredData.slice(start, end);
    }, [filteredData, state.currentPage, state.rowsPerPage]);

    const handleSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (state.sortKey === key && state.sortDirection === 'asc') {
            direction = 'desc';
        }
        updateState({ sortKey: key, sortDirection: direction });
    };
    
    const handleExportExcel = () => {
        const headers = ["Producto", "Código", "Cliente", "Ubicación", "Tipo", "Actualizado por", "Fecha Actualización"];
        const dataToExport = filteredData.map(item => [
            item.productName,
            item.itemId,
            item.clientName || 'Venta General',
            item.locationPath,
            item.isExclusive ? 'Exclusivo' : 'General',
            item.updatedBy || 'N/A',
            item.updatedAt ? format(parseISO(item.updatedAt), 'dd/MM/yyyy HH:mm') : 'N/A'
        ]);
        exportToExcel({
            fileName: 'reporte_catalogo_clientes',
            sheetName: 'Catalogo',
            headers,
            data: dataToExport,
            columnWidths: [40, 20, 30, 40, 15, 20, 20],
        });
    };
    
    const handleExportPDF = async () => {
        if (!companyData) return;
        
        const tableHeaders = ["Producto", "Cliente", "Ubicación", "Tipo"];
        const tableRows = filteredData.map(item => [
            `${item.productName}\n(${item.itemId})`,
            item.clientName || 'Venta General',
            item.locationPath,
            item.isExclusive ? 'Exclusivo' : 'General',
        ]);

        const doc = generateDocument({
            docTitle: "Reporte de Catálogo de Clientes por Producto",
            docId: '',
            companyData,
            meta: [{ label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
            blocks: [],
            table: { columns: tableHeaders, rows: tableRows },
            totals: [],
            orientation: 'landscape',
        });
        doc.save(`reporte_catalogo.pdf`);
    };

    return {
        state,
        actions: {
            fetchData,
            setSearchTerm: (term: string) => updateState({ searchTerm: term, currentPage: 0 }),
            handleSort,
            handleExportExcel,
            handleExportPDF,
            setTypeFilter: (filter: TypeFilter) => updateState({ typeFilter: filter, currentPage: 0 }),
            setClassificationFilter: (filter: string[]) => updateState({ classificationFilter: filter, currentPage: 0 }),
            setDateRange: (range: DateRange | undefined) => updateState({ dateRange: range || { from: undefined, to: undefined }, currentPage: 0 }),
            setCurrentPage: (page: number) => updateState({ currentPage: page }),
            setRowsPerPage: (size: number) => updateState({ rowsPerPage: size, currentPage: 0 }),
            handleClearFilters: () => updateState({ 
                searchTerm: '', 
                typeFilter: 'all', 
                classificationFilter: [],
                dateRange: { from: startOfDay(new Date()), to: new Date() },
                currentPage: 0
            }),
        },
        selectors: {
            filteredData,
            paginatedData,
            totalPages: Math.ceil(filteredData.length / state.rowsPerPage),
            classifications: useMemo(() => Array.from(new Set(products.map(p => p.classification).filter(Boolean))), [products]),
        },
        isAuthorized,
        isInitialLoading,
    };
}
