/**
 * @fileoverview Hook to manage the logic for the ItemLocation assignment page.
 */
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { 
    getLocations, getAllItemLocations, assignItemToLocation, 
    unassignItemFromLocation, getSelectableLocations, unassignAllByProduct, 
    unassignAllByLocation, checkAssignmentConflict, unassignAllByRack, unassignAllByLevel,
    getWarehouseSettings, getItemLocationsPaginated,
} from '@/modules/warehouse/lib/actions';
import type { Product, Customer, WarehouseLocation, ItemLocation, WarehouseSettings } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';

const renderLocationPathAsString = (locationId: number, locations: WarehouseLocation[]): string => {
    if (!locationId) return '';
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

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const emptyFormData = {
    selectedProductId: null as string | null,
    selectedClientId: null as string | null,
    selectedLocationId: null as string | null,
    isExclusive: false,
    requiresCertificate: false,
};

export type SortKey = 'product' | 'description' | 'client' | 'location' | 'type' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

interface State {
    isLoading: boolean;
    isSubmitting: boolean;
    isFormOpen: boolean;
    isEditing: boolean;
    globalFilter: string;
    currentPage: number;
    rowsPerPage: number;
    sortKey: SortKey;
    sortDirection: SortDirection;
    formData: typeof emptyFormData;
    warehouseSettings: WarehouseSettings | null;
    productSearchTerm: string;
    isProductSearchOpen: boolean;
    clientSearchTerm: string;
    isClientSearchOpen: boolean;
    locationSearchTerm: string;
    isLocationSearchOpen: boolean;
    cleanupSearchTerm: string;
    isCleanupSearchOpen: boolean;
    // Conflict dialogs
    moveProductConfirmOpen: boolean;
    mixedLocationConfirmOpen: boolean;
    moveAndMixConfirmOpen: boolean;
    conflictingItems: Product[];
    isTargetLocationMixed: boolean;
    totalCount: number;
}

export function useItemLocation() {
    const { hasPermission, isAuthorized } = useAuthorization(['warehouse:item-assignment:create', 'warehouse:item-assignment:delete']);
    const { toast } = useToast();
    const { user, companyData, products: authProducts, customers: authCustomers } = useAuth();
    
    const [allLocations, setAllLocations] = useState<WarehouseLocation[]>([]);
    const [allAssignments, setAllAssignments] = useState<ItemLocation[]>([]);
    const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null);

    const [state, setState] = useState<State>({
        isLoading: true,
        isSubmitting: false,
        isFormOpen: false,
        isEditing: false,
        globalFilter: '',
        currentPage: 0,
        rowsPerPage: 10,
        sortKey: 'updatedAt',
        sortDirection: 'desc',
        formData: emptyFormData,
        warehouseSettings: null,
        productSearchTerm: '',
        isProductSearchOpen: false,
        clientSearchTerm: '',
        isClientSearchOpen: false,
        locationSearchTerm: '',
        isLocationSearchOpen: false,
        cleanupSearchTerm: '',
        isCleanupSearchOpen: false,
        moveProductConfirmOpen: false,
        mixedLocationConfirmOpen: false,
        moveAndMixConfirmOpen: false,
        conflictingItems: [],
        isTargetLocationMixed: false,
        totalCount: 0,
    });
    
    const [debouncedProductSearch] = useDebounce(state.productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedClientSearch] = useDebounce(state.clientSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedLocationSearch] = useDebounce(state.locationSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedGlobalFilter] = useDebounce(state.globalFilter, companyData?.searchDebounceTime ?? 500);
    const [debouncedCleanupSearch] = useDebounce(state.cleanupSearchTerm, companyData?.searchDebounceTime ?? 500);
    
    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const fetchAssignments = useCallback(async () => {
        try {
            const { assignments, totalCount } = await getItemLocationsPaginated({
                page: state.currentPage,
                limit: state.rowsPerPage,
                search: debouncedGlobalFilter,
                sortKey: state.sortKey,
                sortDirection: state.sortDirection
            });
            setAllAssignments(assignments);
            updateState({ totalCount });
        } catch (error) {
            logError("Failed to load paginated assignments", { error });
        }
    }, [state.currentPage, state.rowsPerPage, debouncedGlobalFilter, state.sortKey, state.sortDirection, updateState]);

    const loadInitialData = useCallback(async () => {
        updateState({ isLoading: true });
        try {
            const [locs, settings] = await Promise.all([getLocations(), getWarehouseSettings()]);
            setAllLocations(locs);
            updateState({ warehouseSettings: settings });
        } catch (error) {
            logError("Failed to load data for assignment page", { error });
            toast({ title: "Error de Carga", description: "No se pudieron cargar los datos necesarios.", variant: "destructive" });
        } finally {
            updateState({ isLoading: false });
        }
    }, [toast, updateState]);
    
    useEffect(() => {
        if (isAuthorized) {
            loadInitialData();
        }
    }, [isAuthorized, loadInitialData]);

    useEffect(() => {
        if (isAuthorized && allLocations.length > 0) {
            fetchAssignments();
        }
    }, [isAuthorized, allLocations.length, fetchAssignments]);
    
    const selectableLocations = useMemo(() => getSelectableLocations(allLocations), [allLocations]);
    
    const productOptions = useMemo(() => {
        if (!debouncedProductSearch) return [];
        const searchLower = debouncedProductSearch.toLowerCase();
        if (searchLower.length < 2) return [];
        return authProducts.filter(p => p.id.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
    }, [authProducts, debouncedProductSearch]);

    const clientOptions = useMemo(() =>
        debouncedClientSearch.length < 2 ? [] : authCustomers
            .filter(c => c.id.toLowerCase().includes(debouncedClientSearch.toLowerCase()) || c.name.toLowerCase().includes(debouncedClientSearch.toLowerCase()))
            .map(c => ({ value: c.id, label: `[${c.id}] ${c.name}` })),
        [authCustomers, debouncedClientSearch]
    );

    const locationOptions = useMemo(() => {
        const searchTerm = debouncedLocationSearch.trim().toLowerCase();
        if (searchTerm === '*' || searchTerm === '') return selectableLocations.map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, allLocations) }));
        return selectableLocations.filter(l => renderLocationPathAsString(l.id, allLocations).toLowerCase().includes(searchTerm))
            .map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, allLocations) }));
    }, [allLocations, selectableLocations, debouncedLocationSearch]);

    const cleanupProductOptions = useMemo(() => {
        if (!debouncedCleanupSearch) return [];
        const searchLower = debouncedCleanupSearch.toLowerCase();
        if (searchLower.length < 2) return [];
        return authProducts.filter(p => p.id.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
    }, [authProducts, debouncedCleanupSearch]);

    const cleanupLocationOptions = useMemo(() => {
        const searchTerm = debouncedCleanupSearch.trim().toLowerCase();
        if (searchTerm === '*' || searchTerm === '') return selectableLocations.map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, allLocations) }));
        return selectableLocations.filter(l => renderLocationPathAsString(l.id, allLocations).toLowerCase().includes(searchTerm))
            .map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, allLocations) }));
    }, [allLocations, selectableLocations, debouncedCleanupSearch]);
    
    const cleanupRackOptions = useMemo(() => {
        const searchTerm = debouncedCleanupSearch.trim().toLowerCase();
        if (searchTerm.length < 1) return [];
        return allLocations.filter(l => l.type === 'rack' && (l.name.toLowerCase().includes(searchTerm) || l.code.toLowerCase().includes(searchTerm)))
            .map(r => ({ value: String(r.id), label: `${r.name} (${r.code})` }));
    }, [allLocations, debouncedCleanupSearch]);

    const cleanupLevelOptions = useMemo(() => {
        const searchTerm = debouncedCleanupSearch.trim().toLowerCase();
        if (!state.warehouseSettings || searchTerm.length < 1) return [];
        
        const levelType = state.warehouseSettings.locationLevels.find(l => l.name.toLowerCase().includes('nivel') || l.name.toLowerCase().includes('estante'))?.type;
        if (!levelType) return [];

        return allLocations.filter(l => l.type === levelType && renderLocationPathAsString(l.id, allLocations).toLowerCase().includes(searchTerm))
            .map(l => ({ value: String(l.id), label: renderLocationPathAsString(l.id, allLocations) }));
    }, [allLocations, debouncedCleanupSearch, state.warehouseSettings]);


    const handleSelectProduct = (value: string) => {
        const product = authProducts.find(p => p.id === value);
        if (product) {
            updateState({ formData: { ...state.formData, selectedProductId: value }, productSearchTerm: `[${product.id}] ${product.description}`, isProductSearchOpen: false });
        }
    };
    
    const handleSelectClient = (value: string | null) => {
        const client = value ? authCustomers.find(c => c.id === value) : null;
        updateState({ formData: { ...state.formData, selectedClientId: client ? client.id : null }, clientSearchTerm: client ? `[${client.id}] ${client.name}` : '', isClientSearchOpen: false });
    };

    const handleSelectLocation = (value: string) => {
        const location = allLocations.find(l => String(l.id) === value);
        if (location) {
            updateState({ formData: { ...state.formData, selectedLocationId: value }, locationSearchTerm: renderLocationPathAsString(location.id, allLocations), isLocationSearchOpen: false });
        }
    };
    
    const resetForm = useCallback(() => {
        updateState({
            formData: emptyFormData,
            productSearchTerm: '',
            clientSearchTerm: '',
            locationSearchTerm: '',
            isEditing: false,
        });
        setEditingAssignmentId(null);
    }, [updateState]);

    const openCreateForm = () => {
        resetForm();
        updateState({ isFormOpen: true });
    };

    const openEditForm = (assignment: ItemLocation) => {
        const product = authProducts.find(p => p.id === assignment.itemId);
        const client = assignment.clientId ? authCustomers.find(c => c.id === assignment.clientId) : null;
        const location = allLocations.find(l => l.id === assignment.locationId);

        updateState({
            formData: {
                selectedProductId: assignment.itemId,
                selectedClientId: assignment.clientId || null,
                selectedLocationId: String(assignment.locationId),
                isExclusive: assignment.isExclusive === 1,
                requiresCertificate: assignment.requiresCertificate === 1,
            },
            productSearchTerm: product ? `[${product.id}] ${product.description}` : '',
            clientSearchTerm: client ? `[${client.id}] ${client.name}` : '',
            locationSearchTerm: location ? renderLocationPathAsString(location.id, allLocations) : '',
            isEditing: true,
            isFormOpen: true,
        });
        setEditingAssignmentId(assignment.id);
    };

    const handleSubmit = async (mode?: 'move' | 'add' | 'add_and_mix' | 'move_and_mix') => {
        if (!user) return;
        if (!state.formData.selectedProductId || !state.formData.selectedLocationId) {
            toast({ title: "Datos Incompletos", description: "Debe seleccionar un producto y una ubicación.", variant: "destructive" });
            return;
        }

        updateState({ isSubmitting: true });

        if (!mode) {
            try {
                const conflictResult = await checkAssignmentConflict({ itemId: state.formData.selectedProductId, locationId: Number(state.formData.selectedLocationId) });

                if (conflictResult.isLocked) {
                    toast({ title: "Ubicación Bloqueada", description: `Esta ubicación está siendo modificada por ${conflictResult.lockedBy || 'otro usuario'}. Intenta de nuevo más tarde.`, variant: "destructive" });
                    updateState({ isSubmitting: false });
                    return;
                }

                if (conflictResult.productHasOtherLocations && conflictResult.locationHasOtherProducts) {
                    updateState({ moveAndMixConfirmOpen: true });
                } else if (conflictResult.productHasOtherLocations) {
                    updateState({ moveProductConfirmOpen: true });
                } else if (conflictResult.locationHasOtherProducts) {
                    updateState({ 
                        conflictingItems: [conflictResult.conflictingProduct!].filter(Boolean), 
                        mixedLocationConfirmOpen: true,
                        isTargetLocationMixed: allLocations.find(l => l.id === Number(state.formData.selectedLocationId))?.is_mixed === 1,
                    });
                } else {
                    await handleSubmit('add'); 
                }
                 if(conflictResult.productHasOtherLocations || conflictResult.locationHasOtherProducts) {
                    updateState({ isSubmitting: false });
                }
            } catch(e: any) {
                logError('Conflict check failed', { error: e.message });
                toast({ title: 'Error de Verificación', description: e.message, variant: 'destructive' });
                updateState({ isSubmitting: false });
            }
            return;
        }
        
        try {
            const payload = {
                id: state.isEditing ? editingAssignmentId! : undefined,
                itemId: state.formData.selectedProductId,
                locationId: parseInt(state.formData.selectedLocationId, 10),
                clientId: state.formData.selectedClientId,
                isExclusive: (state.formData.isExclusive ? 1 : 0) as 0 | 1,
                requiresCertificate: (state.formData.requiresCertificate ? 1 : 0) as 0 | 1,
                updatedBy: user.name,
            };

            await assignItemToLocation(payload, mode);
            
            await loadInitialData();
            await fetchAssignments();
            toast({ title: state.isEditing ? "Asignación Actualizada" : "Asignación Creada" });
            
            updateState({ isFormOpen: false });
            resetForm();
        } catch(e: any) {
            logError('Failed to save item assignment', { error: e.message });
            toast({ title: "Error al Guardar", description: `No se pudo guardar la asignación. ${e.message}`, variant: "destructive" });
        } finally {
            updateState({ 
                isSubmitting: false, 
                moveProductConfirmOpen: false, 
                mixedLocationConfirmOpen: false, 
                moveAndMixConfirmOpen: false 
            });
        }
    };

    const handleDeleteAssignment = async (assignmentId: number) => {
        updateState({ isSubmitting: true });
        try {
            await unassignItemFromLocation(assignmentId);
            await fetchAssignments();
            toast({ title: "Asignación Eliminada", variant: "destructive" });
        } catch (e: any) {
            logError('Failed to delete item assignment', { error: e.message });
            toast({ title: "Error al Eliminar", description: `No se pudo eliminar la asignación. ${e.message}`, variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };
    
    const filteredAssignments = useMemo(() => {
        return { length: state.totalCount } as any as ItemLocation[];
    }, [state.totalCount]);
    
    useEffect(() => { updateState({ currentPage: 0 }); }, [debouncedGlobalFilter, state.rowsPerPage, updateState]);
    
    const paginatedAssignments = allAssignments;

    const handleSort = (key: SortKey) => {
        updateState({ 
            sortKey: key, 
            sortDirection: state.sortKey === key && state.sortDirection === 'asc' ? 'desc' : 'asc' 
        });
    };

    const handleCleanup = async (type: 'product' | 'location' | 'rack' | 'level', id: string | number) => {
        if (!user) return;
        updateState({ isSubmitting: true });
        try {
            if (type === 'product' && typeof id === 'string') {
                await unassignAllByProduct(id, user.name);
                toast({ title: "Limpieza Completada", description: `Se eliminaron todas las asignaciones para el producto ${id}.` });
            } else if (type === 'location' && typeof id === 'number') {
                const locPath = renderLocationPathAsString(id, allLocations);
                await unassignAllByLocation(id, user.name);
                toast({ title: "Limpieza Completada", description: `Se eliminaron todas las asignaciones de la ubicación ${locPath}.` });
            } else if (type === 'rack' && typeof id === 'number') {
                const rack = allLocations.find(l => l.id === id);
                await unassignAllByRack(id, user.name);
                toast({ title: "Limpieza de Rack Completada", description: `Se eliminaron todas las asignaciones del rack ${rack?.name || ''}.` });
            } else if (type === 'level' && typeof id === 'number') {
                const level = allLocations.find(l => l.id === id);
                await unassignAllByLevel(id, user.name);
                toast({ title: "Limpieza de Nivel Completada", description: `Se eliminaron todas las asignaciones del nivel ${level?.name || ''}.` });
            }
            await loadInitialData(); // Refresh data
            await fetchAssignments(); // Refresh assignments
        } catch (e: any) {
            logError('Failed to perform cleanup', { error: e.message, type, id });
            toast({ title: "Error en la Limpieza", description: e.message, variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };
    
    const totalPages = Math.ceil(state.totalCount / state.rowsPerPage);

    return {
        state,
        selectors: {
            paginatedAssignments, totalPages, filteredAssignments,
            productOptions, clientOptions, locationOptions, hasPermission,
            cleanupProductOptions, cleanupLocationOptions, cleanupRackOptions, cleanupLevelOptions,
            getProductName: (id: string) => authProducts.find(p => p.id === id)?.description || 'Desconocido',
            getClientName: (id: string | null | undefined) => id ? authCustomers.find(c => c.id === id)?.name : 'General',
            getLocationPath: (id: number) => renderLocationPathAsString(id, allLocations)
        },
        actions: {
            setGlobalFilter: (filter: string) => updateState({ globalFilter: filter }),
            setCurrentPage: (page: number | ((p: number) => number)) => updateState({ currentPage: typeof page === 'function' ? page(state.currentPage) : page }),
            setRowsPerPage: (size: number) => updateState({ rowsPerPage: size }),
            setIsFormOpen: (open: boolean) => updateState({ isFormOpen: open }),
            openCreateForm, openEditForm, handleSubmit, handleDeleteAssignment, resetForm,
            setFormData: (data: typeof emptyFormData) => updateState({ formData: data }),
            setProductSearchTerm: (term: string) => updateState({ productSearchTerm: term }),
            setIsProductSearchOpen: (open: boolean) => updateState({ isProductSearchOpen: open }),
            handleSelectProduct,
            setClientSearchTerm: (term: string) => updateState({ clientSearchTerm: term }),
            setIsClientSearchOpen: (open: boolean) => updateState({ isClientSearchOpen: open }),
            handleSelectClient,
            setLocationSearchTerm: (term: string) => updateState({ locationSearchTerm: term }),
            setIsLocationSearchOpen: (open: boolean) => updateState({ isLocationSearchOpen: open }),
            handleSelectLocation,
            setCleanupSearchTerm: (term: string) => updateState({ cleanupSearchTerm: term }),
            setIsCleanupSearchOpen: (open: boolean) => updateState({ isCleanupSearchOpen: open }),
            handleSort,
            handleCleanup,
            setMoveProductConfirmOpen: (open: boolean) => updateState({ moveProductConfirmOpen: open }),
            setMixedLocationConfirmOpen: (open: boolean) => updateState({ mixedLocationConfirmOpen: open }),
            setMoveAndMixConfirmOpen: (open: boolean) => updateState({ moveAndMixConfirmOpen: open }),
        }
    };
}
