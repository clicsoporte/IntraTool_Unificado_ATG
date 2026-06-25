
/**
 * @fileoverview Hook for managing the logic for the new Consignments Report page.
 */
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { getConsignmentAgreements, getConsignmentsReportData } from '@/modules/consignments/lib/actions';
import type { DateRange, ConsignmentAgreement, Company, RestockBoleta, BoletaLine, BoletaHistory, UserPreferences, PeriodClosure, ConsignmentReportRow } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { exportToExcel } from '@/lib/excel-export';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { format, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ConsignmentsReportSortKey = 'productId' | 'productDescription' | 'consumption' | 'totalValue';
export type SortDirection = 'asc' | 'desc';

interface State {
    isLoading: boolean;
    hasRun: boolean;
    dateRange: DateRange;
    agreements: ConsignmentAgreement[];
    selectedAgreementId: string | null;
    reportData: ConsignmentReportRow[];
    processedBoletas: (RestockBoleta & { lines: BoletaLine[], history: BoletaHistory[] })[];
    allBoletasForClient: RestockBoleta[];
    allClosuresForClient: (PeriodClosure & { client_name: string; is_initial_inventory: boolean; previous_closure_consecutive?: string; })[];
    boletaFilter: string[];
    closureFilter: string | null;
    sortKey: ConsignmentsReportSortKey;
    sortDirection: SortDirection;
    visibleColumns: string[];
    detailsForProduct: ConsignmentReportRow | null;
    isDetailsOpen: boolean;
}

const availableColumns = [
    { id: 'productId', label: 'Código Artículo', sortable: true },
    { id: 'productDescription', label: 'Producto', sortable: true },
    { id: 'clientProductCode', label: 'Alias Cliente' },
    { id: 'consumption', label: 'Consumo', sortable: true, align: 'right' },
    { id: 'price', label: 'Precio Unit.', align: 'right' },
    { id: 'totalValue', label: 'Valor Total', sortable: true, align: 'right' },
    { id: 'details', label: 'Desglose' },
];

export function useConsignmentsReport() {
    const { isAuthorized } = useAuthorization(['analytics:consignments-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const [state, setState] = useState<State>({
        isLoading: false,
        hasRun: false,
        dateRange: { from: undefined, to: undefined },
        agreements: [],
        selectedAgreementId: null,
        reportData: [],
        processedBoletas: [],
        allBoletasForClient: [],
        allClosuresForClient: [],
        boletaFilter: [],
        closureFilter: null,
        sortKey: 'consumption',
        sortDirection: 'desc',
        visibleColumns: availableColumns.map(c => c.id),
        detailsForProduct: null,
        isDetailsOpen: false,
    });

    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);
    
    useEffect(() => {
        // Set initial date range only on the client-side to avoid hydration issues
        updateState({
            dateRange: { from: startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: new Date() }
        });
    }, [updateState]);

    useEffect(() => {
        setTitle("Reporte Analítico de Consignaciones");
        const fetchInitialData = async () => {
            if (isAuthorized) {
                try {
                    const [agreementsData, prefs] = await Promise.all([
                        getConsignmentAgreements(),
                        user ? getUserPreferences(user.id, 'consignmentsReportPrefs') : null
                    ]);

                    updateState({ 
                        agreements: agreementsData, 
                        isLoading: false,
                        ...(prefs?.visibleColumns ? { visibleColumns: prefs.visibleColumns } : {}),
                    });
                } catch (error) {
                    logError('Failed to fetch consignment agreements for report', { error });
                    toast({ title: 'Error', description: 'No se pudieron cargar los acuerdos de consignación.', variant: 'destructive'});
                    updateState({ isLoading: false });
                }
            }
        };
        if(isAuthorized) {
            fetchInitialData();
        } else {
             updateState({ isLoading: false });
        }
    }, [setTitle, isAuthorized, toast, updateState, user]);

    const handleGenerateReport = useCallback(async () => {
        if (!state.selectedAgreementId) {
            toast({ title: "Datos incompletos", description: "Por favor, selecciona un cliente.", variant: 'destructive'});
            return;
        }
        if (!state.closureFilter && (!state.dateRange.from || !state.dateRange.to)) {
             toast({ title: "Datos incompletos", description: "Por favor, selecciona un rango de fechas o un cierre de período.", variant: 'destructive'});
            return;
        }
        updateState({ isLoading: true, hasRun: true });
        try {
            const { reportRows, boletas, allBoletasForClient, allClosuresForClient } = await getConsignmentsReportData(
                state.selectedAgreementId, 
                state.dateRange as { from: Date, to: Date },
                {
                    boletaIds: state.boletaFilter,
                    closureId: state.closureFilter || undefined,
                }
            );
            updateState({ reportData: reportRows, processedBoletas: boletas, allBoletasForClient, allClosuresForClient });
        } catch (error: any) {
            logError("Failed to generate consignments report", { error: error.message });
            toast({ title: "Error al Generar", description: error.message, variant: "destructive"});
        } finally {
            updateState({ isLoading: false });
        }
    }, [state.selectedAgreementId, state.dateRange, state.boletaFilter, state.closureFilter, toast, updateState]);
    
    const handleSort = (key: ConsignmentsReportSortKey) => {
        let direction: SortDirection = 'asc';
        if (state.sortKey === key && state.sortDirection === 'asc') {
            direction = 'desc';
        }
        updateState({ sortKey: key, sortDirection: direction });
    };

    const handleColumnVisibilityChange = (columnId: string, checked: boolean) => {
        updateState({
            visibleColumns: checked
                ? [...state.visibleColumns, columnId]
                : state.visibleColumns.filter(id => id !== columnId),
        });
    };

    const savePreferences = async () => {
        if (!user) return;
        try {
            await saveUserPreferences(user.id, 'consignmentsReportPrefs', { visibleColumns: state.visibleColumns });
            toast({ title: 'Preferencias Guardadas' });
        } catch (error: any) {
            logError('Failed to save preferences', { error: error.message });
            toast({ title: 'Error', description: 'No se pudieron guardar las preferencias.', variant: 'destructive' });
        }
    };

    const handleExportExcel = () => {
        if (!state.reportData || state.reportData.length === 0) return;
        const agreement = state.agreements.find(a => String(a.id) === state.selectedAgreementId);

        const flatData = state.reportData.flatMap(productRow =>
            productRow.transactions.map((tx) => ({
                'Producto ID': productRow.productId,
                'Producto Descripción': productRow.productDescription,
                'Alias Cliente': productRow.clientProductCode,
                'Fecha': format(parseISO(tx.date), 'dd/MM/yyyy HH:mm'),
                'Tipo': tx.type,
                'Documento/Motivo': tx.document,
                'Cantidad': tx.quantity,
                'Usuario': tx.user,
                'Notas': tx.notes || '',
            }))
        );

        if (flatData.length === 0) {
            toast({ title: "Sin transacciones", description: "No hay entregas o ajustes que exportar en el período seleccionado.", variant: "default" });
            return;
        }

        const headers = Object.keys(flatData[0]);
        const dataToExport = flatData.map(row => Object.values(row));

        exportToExcel({
            fileName: `reporte_analitico_consignacion_${agreement?.client_name.replace(/\s+/g, '_') || ''}`,
            sheetName: 'Transacciones',
            title: `Reporte Analítico de Consignación: Transacciones`,
            meta: [
                { label: "Cliente:", value: agreement?.client_name || 'N/A' },
                { label: "Período:", value: `${state.dateRange.from ? format(state.dateRange.from, 'dd/MM/yyyy', { locale: es }) : ''} al ${state.dateRange.to ? format(state.dateRange.to, 'dd/MM/yyyy', { locale: es }) : ''}` }
            ],
            data: [headers, ...dataToExport],
            headers: [],
            columnWidths: [20, 40, 20, 20, 25, 25, 15, 20, 30],
        });
    };

    const handleExportPDF = async () => {
        if (!state.reportData.length || !companyData) return;
        const agreement = state.agreements.find(a => String(a.id) === state.selectedAgreementId);
        
        const totalToBill = selectors.totalConsumptionValue;

        const doc = generateDocument({
            docTitle: "Reporte Analítico de Consignación",
            docId: '',
            companyData: companyData as Company,
            logoDataUrl: companyData.logoUrl,
            meta: [{ label: 'Cliente', value: agreement?.client_name || '' }, { label: 'Período', value: `${state.dateRange.from ? format(state.dateRange.from, 'dd/MM/yyyy') : ''} al ${state.dateRange.to ? format(state.dateRange.to, 'dd/MM/yyyy') : ''}` }],
            blocks: [],
            table: {
                columns: ["Código", "Descripción", "Consumo", "Precio Unit.", "Total"],
                rows: sortedReportData.map(r => [
                    r.productId,
                    r.productDescription,
                    r.consumption.toLocaleString('es-CR'),
                    `¢${r.price.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`,
                    `¢${r.totalValue.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`
                ]),
                columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
            },
            totals: [{ label: 'Total a Facturar:', value: `¢${totalToBill.toLocaleString('es-CR', { minimumFractionDigits: 2 })}` }],
        });
        doc.save(`cierre_consignacion_${agreement?.client_name.replace(/\s+/g, '_')}.pdf`);
    };
    
    const sortedReportData = useMemo(() => {
        if (!state.reportData) return [];
        return [...state.reportData].sort((a, b) => {
            const dir = state.sortDirection === 'asc' ? 1 : -1;
            const key = state.sortKey;

            switch (key) {
                case 'productId':
                    return a.productId.localeCompare(b.productId) * dir;
                case 'productDescription':
                    return a.productDescription.localeCompare(b.productDescription) * dir;
                case 'consumption':
                case 'totalValue':
                    return (a[key] - b[key]) * dir;
                default:
                    return 0;
            }
        });
    }, [state.reportData, state.sortKey, state.sortDirection]);
    
    const actions = {
        setDateRange: (range: DateRange | undefined) => updateState({ dateRange: range || { from: undefined, to: undefined }, closureFilter: null }),
        setSelectedAgreementId: (id: string) => updateState({ 
            selectedAgreementId: id, 
            reportData: [], 
            hasRun: false,
            allBoletasForClient: [],
            allClosuresForClient: [],
            boletaFilter: [],
            closureFilter: null,
        }),
        setBoletaFilter: (ids: string[]) => updateState({ boletaFilter: ids }),
        setClosureFilter: (id: string) => updateState({ closureFilter: id === 'none' ? null : id, dateRange: { from: undefined, to: undefined } }),
        handleClearFilters: () => updateState({ boletaFilter: [], closureFilter: null, dateRange: { from: startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: new Date() } }),
        handleGenerateReport,
        handleExportExcel,
        handleExportPDF,
        handleSort,
        handleColumnVisibilityChange,
        savePreferences,
        openDetailsModal: (row: ConsignmentReportRow) => updateState({ detailsForProduct: row, isDetailsOpen: true }),
        setIsDetailsOpen: (open: boolean) => updateState({ isDetailsOpen: open }),
    };

    const selectors = {
        agreementOptions: useMemo(() => 
            state.agreements.map(a => ({ value: String(a.id), label: a.client_name }))
        , [state.agreements]),
        boletaOptions: useMemo(() => 
            state.allBoletasForClient.map(b => ({ value: String(b.id), label: `${b.consecutive} - ${format(parseISO(b.created_at), 'dd/MM/yy')}`}))
        , [state.allBoletasForClient]),
        closureOptions: useMemo(() => 
            state.allClosuresForClient.map(c => ({ value: String(c.id), label: `${c.consecutive} - ${format(parseISO(c.created_at), 'dd/MM/yy')}`}))
        , [state.allClosuresForClient]),
        totalConsumptionValue: useMemo(() => 
            state.reportData.reduce((sum, row) => sum + row.totalValue, 0)
        , [state.reportData]),
        sortedReportData,
        availableColumns,
        visibleColumnsData: useMemo(() => 
            state.visibleColumns.map(id => availableColumns.find(c => c.id === id)).filter(Boolean) as (typeof availableColumns)[0][]
        , [state.visibleColumns]),
        getColumnContent: (row: ConsignmentReportRow, colId: string): { content: React.ReactNode, className?: string } => {
            switch(colId) {
                case 'productId': return { content: row.productId, className: 'font-mono' };
                case 'productDescription': return { content: row.productDescription };
                case 'clientProductCode': return { content: row.clientProductCode || '-', className: 'text-muted-foreground' };
                case 'consumption': return { content: row.consumption.toLocaleString(), className: 'font-bold text-lg' };
                case 'price': return { content: `¢${row.price.toLocaleString('es-CR')}` };
                case 'totalValue': return { content: `¢${row.totalValue.toLocaleString('es-CR')}`, className: 'font-bold text-primary text-lg' };
                case 'details': return { content: React.createElement(Button, { variant: "ghost", size: "icon", onClick: () => actions.openDetailsModal(row) }, React.createElement(ListChecks, { className: "h-4 w-4" })) };
                default: return { content: '' };
            }
        }
    };

    return {
        state: { ...state, reportData: sortedReportData },
        actions,
        selectors,
        isAuthorized,
    };
}
