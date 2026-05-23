/**
 * @fileoverview Hook to manage the logic for the physical inventory report page.
 */
'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getPhysicalInventoryReportData } from '@/modules/analytics/lib/actions';
import type { PhysicalInventoryComparisonItem, DateRange, Product, UserPreferences, ItemLocation, WarehouseLocation } from '@/modules/core/types';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { format, parseISO, startOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDebounce } from 'use-debounce';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { cn } from '@/lib/utils';


export type SortKey = 'productId' | 'physicalCount' | 'erpStock' | 'difference' | 'lastCountDate' | 'locationName' | 'updatedBy';
export type SortDirection = 'asc' | 'desc';
export type DifferenceFilter = 'all' | 'with-difference' | 'shortage' | 'surplus' | 'empty-locations';


const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

interface State {
    isLoading: boolean;
    reportData: PhysicalInventoryComparisonItem[];
    allSelectableLocations: WarehouseLocation[];
    dateRange: DateRange;
    searchTerm: string;
    classificationFilter: string[];
    differenceFilter: DifferenceFilter;
    sortKey: SortKey;
    sortDirection: SortDirection;
    visibleColumns: string[];
}

export const availableColumns = [
    { id: 'productId', label: 'Producto', sortable: true },
    { id: 'locationName', label: 'Ubicación Conteo', sortable: true },
    { id: 'assignedLocationPath', label: 'Ubicación Designada', sortable: true },
    { id: 'physicalCount', label: 'Conteo Físico', sortable: true, align: 'right' },
    { id: 'erpStock', label: 'Stock ERP', sortable: true, align: 'right' },
    { id: 'difference', label: 'Diferencia', sortable: true, align: 'right' },
    { id: 'updatedBy', label: 'Contado Por', sortable: true },
    { id: 'lastCountDate', label: 'Fecha Conteo', sortable: true },
];

export function usePhysicalInventoryReport() {
    const { isAuthorized } = useAuthorization(['analytics:physical-inventory-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData, user, products } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: false,
        reportData: [],
        allSelectableLocations: [],
        dateRange: {
            from: undefined,
            to: undefined,
        },
        searchTerm: '',
        classificationFilter: [],
        differenceFilter: 'all',
        sortKey: 'difference',
        sortDirection: 'desc',
        visibleColumns: availableColumns.map(c => c.id),
    });

    const [debouncedSearchTerm] = useDebounce(state.searchTerm, companyData?.searchDebounceTime ?? 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const fetchData = useCallback(async () => {
        updateState({ isLoading: true });
        try {
            const data = await getPhysicalInventoryReportData({ dateRange: state.dateRange });
            updateState({ 
                reportData: data.comparisonData, 
                allSelectableLocations: data.allLocations 
            });
        } catch (error: any) {
            logError("Failed to fetch physical inventory report data", { error: error.message });
            toast({ title: "Error al Generar Reporte", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isLoading: false });
        }
    }, [state.dateRange, toast, updateState]);
    
    const loadPrefs = useCallback(async () => {
        if(user) {
           const prefs = await getUserPreferences(user.id, 'physicalInventoryReportPrefs');
           if (prefs) {
               updateState({
                   visibleColumns: prefs.visibleColumns || availableColumns.map(c => c.id),
                   classificationFilter: prefs.classificationFilter || [],
               });
           }
       }
       setIsInitialLoading(false);
    }, [user, updateState]);

    useEffect(() => {
        setTitle("Reporte de Inventario Físico");
        if (isAuthorized) {
            loadPrefs();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTitle, isAuthorized]);

    const sortedData = useMemo(() => {
        let data: PhysicalInventoryComparisonItem[] = [...state.reportData];

        if (state.differenceFilter === 'empty-locations') {
            const countedLocationIds = new Set(state.reportData.map(item => item.locationId));
            const emptyLocations = (state.allSelectableLocations || [])
                .filter(loc => !countedLocationIds.has(loc.id))
                .map(loc => ({
                    productId: 'N/A',
                    productDescription: 'Ubicación Vacía',
                    locationId: loc.id,
                    locationName: loc.name,
                    locationCode: loc.code,
                    physicalCount: 0,
                    erpStock: 0,
                    difference: 0,
                    lastCountDate: '',
                    updatedBy: 'N/A',
                    assignedLocationPath: 'N/A',
                }));
            data = emptyLocations;
        } else {
             switch (state.differenceFilter) {
                case 'with-difference':
                    data = data.filter(item => item.difference !== 0);
                    break;
                case 'shortage':
                    data = data.filter(item => item.difference < 0);
                    break;
                case 'surplus':
                    data = data.filter(item => item.difference > 0);
                    break;
            }
        }

        if (debouncedSearchTerm) {
            const lowercasedFilter = normalizeText(debouncedSearchTerm);
            data = data.filter(item =>
                normalizeText(item.productDescription).includes(lowercasedFilter) ||
                normalizeText(item.productId).includes(lowercasedFilter) ||
                normalizeText(item.locationName).includes(lowercasedFilter) ||
                normalizeText(item.updatedBy).includes(lowercasedFilter)
            );
        }

        if (state.classificationFilter.length > 0 && state.differenceFilter !== 'empty-locations') {
            data = data.filter(item => {
                const product = products.find(p => p.id === item.productId);
                return product && state.classificationFilter.includes(product.classification);
            });
        }
        
        data.sort((a, b) => {
            const valA = a[state.sortKey as keyof PhysicalInventoryComparisonItem];
            const valB = b[state.sortKey as keyof PhysicalInventoryComparisonItem];
            const direction = state.sortDirection === 'asc' ? 1 : -1;

            if (typeof valA === 'string' && typeof valB === 'string') {
                if (state.sortKey === 'lastCountDate') {
                    if (!valA) return 1 * direction;
                    if (!valB) return -1 * direction;
                    return (new Date(valA).getTime() - new Date(valB).getTime()) * direction;
                }
                return valA.localeCompare(valB) * direction;
            }
            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * direction;
            }
            return 0;
        });

        return data;
    }, [state.reportData, state.allSelectableLocations, debouncedSearchTerm, state.sortKey, state.sortDirection, state.classificationFilter, state.differenceFilter, products]);

    const handleSort = (key: SortKey) => {
        if (state.sortKey === key) {
            updateState({ sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc' });
        } else {
            updateState({ sortKey: key, sortDirection: 'asc' });
        }
    };
    
    const savePreferences = async () => {
        if (!user) return;
        try {
            const prefs: Partial<UserPreferences> = {
                visibleColumns: state.visibleColumns,
                classificationFilter: state.classificationFilter,
            };
            await saveUserPreferences(user.id, 'physicalInventoryReportPrefs', prefs);
            toast({ title: 'Preferencias Guardadas' });
        } catch (error: any) {
            logError('Failed to save preferences for physical inventory report', { error: error.message });
            toast({ title: 'Error', description: 'No se pudieron guardar las preferencias.', variant: 'destructive' });
        }
    };

    const handleExportExcel = () => {
        const dataToExport = sortedData.map(item => ({
            'Código Producto': item.productId,
            'Descripción': item.productDescription,
            'Ubicación Conteo': `${item.locationCode} (${item.locationName})`,
            'Ubicación Designada': item.assignedLocationPath || 'N/A',
            'Conteo Físico': item.physicalCount,
            'Stock ERP': item.erpStock,
            'Diferencia': item.difference,
            'Contado Por': item.updatedBy,
            'Fecha Conteo': item.lastCountDate ? format(parseISO(item.lastCountDate), 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A',
        }));

        exportToExcel({
            fileName: 'reporte_conteo_inventario',
            sheetName: 'ConteoFisico',
            headers: Object.keys(dataToExport[0] || {}),
            data: dataToExport.map(item => Object.values(item)),
            columnWidths: [20, 40, 25, 25, 15, 15, 15, 20, 20],
        });
    };

    const handleExportPDF = async () => {
        if (!companyData) return;
        const tableHeaders = ["Producto", "Ubic. Conteo", "Ubic. Designada", "Físico", "ERP", "Dif.", "Contado Por", "Fecha"];
        const tableRows = sortedData.map(item => [
            `${item.productDescription}\n(${item.productId})`,
            `${item.locationName} (${item.locationCode})`,
            item.assignedLocationPath || 'N/A',
            item.physicalCount.toLocaleString(),
            item.erpStock.toLocaleString(),
            item.difference.toLocaleString(),
            item.updatedBy,
            item.lastCountDate ? format(parseISO(item.lastCountDate), 'dd/MM/yy HH:mm') : 'N/A',
        ]);
        const doc = generateDocument({
            docTitle: "Reporte de Comparación de Inventario", docId: '', companyData,
            meta: [{ label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
            blocks: [],
            table: { columns: tableHeaders, rows: tableRows, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } },
            totals: [], orientation: 'landscape'
        });
        doc.save('reporte_inventario_fisico.pdf');
    };

    const actions = {
        fetchData,
        setDateRange: (range: DateRange | undefined) => updateState({ dateRange: range || { from: undefined, to: undefined } }),
        setSearchTerm: (term: string) => updateState({ searchTerm: term }),
        setClassificationFilter: (filter: string[]) => updateState({ classificationFilter: filter }),
        setDifferenceFilter: (filter: DifferenceFilter) => updateState({ differenceFilter: filter }),
        handleClearFilters: () => updateState({ searchTerm: '', classificationFilter: [], differenceFilter: 'all', dateRange: { from: undefined, to: undefined } }),
        handleSort,
        handleExportExcel,
        handleExportPDF,
        handleColumnVisibilityChange: (columnId: string, checked: boolean) => updateState({ visibleColumns: checked ? [...state.visibleColumns, columnId] : state.visibleColumns.filter(id => id !== columnId) }),
        savePreferences,
    };
    
    const selectors = {
        sortedData,
        classifications: useMemo(() => Array.from(new Set(products.map(p => p.classification).filter(Boolean))), [products]),
        availableColumns,
        visibleColumnsData: useMemo(() => state.visibleColumns.map(id => availableColumns.find(col => col.id === id)).filter(Boolean) as (typeof availableColumns)[0][], [state.visibleColumns]),
        getColumnContent: (item: PhysicalInventoryComparisonItem, colId: string): { type: string, data: any, className?: string } => {
            switch (colId) {
                case 'productId':
                    return { type: 'product', data: { description: item.productDescription, id: item.productId } };
                case 'locationName':
                    return { type: 'string', data: `${item.locationName} (${item.locationCode})` };
                case 'assignedLocationPath':
                    return { type: 'string', data: item.assignedLocationPath, className: "text-sm text-muted-foreground" };
                case 'physicalCount':
                    return { type: 'number', data: item.physicalCount, className: "font-medium" };
                case 'erpStock':
                    return { type: 'number', data: item.erpStock };
                case 'difference':
                    return { type: 'difference', data: item.difference, className: cn("font-bold", item.difference !== 0 && (item.difference > 0 ? "text-green-600" : "text-red-600")) };
                case 'updatedBy':
                    return { type: 'string', data: item.updatedBy };
                case 'lastCountDate':
                    return { type: 'date', data: item.lastCountDate, className: "text-xs text-muted-foreground" };
                default:
                    return { type: 'string', data: null };
            }
        },
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    };
}
