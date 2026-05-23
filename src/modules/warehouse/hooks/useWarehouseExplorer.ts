
'use client';
 
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { 
    getLocationsByParent, 
    getItemLocationsByLocation, 
    searchLocations,
    unassignMultipleItemsFromLocation 
} from '@/modules/warehouse/lib/actions';
import type { WarehouseLocation, ItemLocation, Product } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
 
const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};
 
interface State {
    isLoading: boolean;
    isSubmitting: boolean;
    buildings: WarehouseLocation[];
    racks: WarehouseLocation[];
    levels: WarehouseLocation[];
    currentAssignments: ItemLocation[];
    currentLeafNodes: WarehouseLocation[];
    searchTerm: string;
    detailsSearchTerm: string;
    selectedBuildingId: number | null;
    selectedRackId: number | null;
    selectedLevelId: number | null;
    highlightedPath: Set<number>;
    selectedAssignmentIds: Set<number>;
}
 
export function useWarehouseExplorer() {
    useAuthorization(['warehouse:explorer:read']);
    usePageTitle().setTitle("Explorador de Almacén");
    const { toast } = useToast();
    const { user, products } = useAuth();
 
    const [state, setState] = useState<State>({
        isLoading: true,
        isSubmitting: false,
        buildings: [],
        racks: [],
        levels: [],
        currentAssignments: [],
        currentLeafNodes: [],
        searchTerm: '',
        detailsSearchTerm: '',
        selectedBuildingId: null,
        selectedRackId: null,
        selectedLevelId: null,
        highlightedPath: new Set(),
        selectedAssignmentIds: new Set(),
    });
 
    const [debouncedSearchTerm] = useDebounce(state.searchTerm, 300);
    const [debouncedDetailsSearchTerm] = useDebounce(state.detailsSearchTerm, 300);
 
    const updateState = useCallback((newState: Partial<State>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);
 
    // Initial Load: Buildings only
    useEffect(() => {
        const loadInitial = async () => {
            try {
                const b = await getLocationsByParent(null);
                updateState({ buildings: b, isLoading: false });
            } catch (error) {
                logError("Failed to load buildings", { error });
                updateState({ isLoading: false });
            }
        };
        loadInitial();
    }, [updateState]);
 
    // Load Racks when Building changes
    useEffect(() => {
        if (!state.selectedBuildingId) {
            updateState({ racks: [], selectedRackId: null, levels: [], selectedLevelId: null });
            return;
        }
        const loadRacks = async () => {
            try {
                const r = await getLocationsByParent(state.selectedBuildingId);
                updateState({ racks: r, levels: [], selectedLevelId: null });
            } catch (error) {
                logError("Failed to load racks", { error });
            }
        };
        loadRacks();
    }, [state.selectedBuildingId, updateState]);
 
    // Load Levels when Rack changes
    useEffect(() => {
        if (!state.selectedRackId) {
            updateState({ levels: [], selectedLevelId: null });
            return;
        }
        const loadLevels = async () => {
            try {
                const l = await getLocationsByParent(state.selectedRackId);
                updateState({ levels: l });
            } catch (error) {
                logError("Failed to load levels", { error });
            }
        };
        loadLevels();
    }, [state.selectedRackId, updateState]);
 
    // Load Assignments/Details when selection changes
    useEffect(() => {
        const targetId = state.selectedLevelId || state.selectedRackId || state.selectedBuildingId;
        if (!targetId) {
            updateState({ currentAssignments: [], currentLeafNodes: [] });
            return;
        }
 
        const loadDetails = async () => {
            try {
                // We fetch assignments for the selection
                const assignments = await getItemLocationsByLocation(targetId);
                
                // For empty locations, we still need to know which ones are leaves.
                // Since this is specific to the selected branch, it's not a massive load.
                const { getChildLocations } = await import('@/modules/warehouse/lib/actions');
                const leafNodes = await getChildLocations([targetId]); 
                
                updateState({ currentAssignments: assignments, currentLeafNodes: leafNodes });
            } catch (error) {
                logError("Failed to load location details", { error });
            }
        };
        loadDetails();
    }, [state.selectedBuildingId, state.selectedRackId, state.selectedLevelId, updateState]);
 
    // Global Search: Uses Server-side search
    useEffect(() => {
        if (!debouncedSearchTerm) {
            updateState({ highlightedPath: new Set() });
            return;
        }
 
        const performSearch = async () => {
            try {
                const results = await searchLocations(debouncedSearchTerm, 1);
                if (results.length > 0) {
                    const found = results[0];
                    // We can't easily build the path in client if we don't have all locations.
                    // But we can extract the path from cached_full_path if we want to "highlight".
                    // For now, let's just toast or focus.
                    // A better approach would be for the server to return the breadcrumb IDs.
                }
            } catch (error) {
                logError("Search failed", { error });
            }
        };
        performSearch();
    }, [debouncedSearchTerm, updateState]);
    
    const selectBuilding = (buildingId: number) => {
        updateState({ selectedBuildingId: buildingId, selectedRackId: null, selectedLevelId: null });
    };
 
    const selectRack = (rackId: number) => {
        updateState({ selectedRackId: rackId, selectedLevelId: null });
    };
 
    const selectLevel = (levelId: number) => {
        updateState({ selectedLevelId: levelId });
    };
 
    const details = useMemo(() => {
        const targetId = state.selectedLevelId || state.selectedRackId || state.selectedBuildingId;
        if (!targetId) {
            return { title: 'Explorador de Almacén', description: 'Selecciona una bodega o zona para empezar.', items: [], emptyLocations: [] };
        }
 
        const targetNode = [...state.buildings, ...state.racks, ...state.levels].find(l => l.id === targetId);
        if (!targetNode) return { title: 'Cargando...', description: '', items: [], emptyLocations: [] };
 
        const assignedLocationIds = new Set<number>();
        
        const allEnrichedAssignments = state.currentAssignments.map(a => {
            assignedLocationIds.add(a.locationId!);
            const product = products.find(p => p.id === a.itemId);
            return {
                ...a,
                productName: product?.description || a.itemId,
                locationPath: a.cached_full_path || String(a.locationId),
            };
        });
        
        const filteredItems = allEnrichedAssignments.filter(item => {
            if (!debouncedDetailsSearchTerm) return true;
            const searchLower = normalizeText(debouncedDetailsSearchTerm);
            return normalizeText(item.productName).includes(searchLower) || 
                   normalizeText(item.itemId).includes(searchLower) ||
                   normalizeText(item.locationPath).includes(searchLower);
        });
 
        const emptyLocations = state.currentLeafNodes
            .filter(node => !assignedLocationIds.has(node.id))
            .map(node => ({ 
                id: node.id, 
                path: node.cached_full_path || node.name 
            }));
 
        return {
            title: targetNode.name,
            description: `Contenido de ${targetNode.code}`,
            items: filteredItems,
            emptyLocations
        };
    }, [state.selectedBuildingId, state.selectedRackId, state.selectedLevelId, state.buildings, state.racks, state.levels, state.currentAssignments, state.currentLeafNodes, products, debouncedDetailsSearchTerm]);
    
    const handleToggleAssignmentSelection = (assignmentId: number) => {
        updateState({
            selectedAssignmentIds: new Set(
                state.selectedAssignmentIds.has(assignmentId)
                    ? [...state.selectedAssignmentIds].filter(id => id !== assignmentId)
                    : [...state.selectedAssignmentIds, assignmentId]
            ),
        });
    };
    
    const handleSelectAllAssignments = (isChecked: boolean) => {
        if (isChecked) {
            updateState({ selectedAssignmentIds: new Set(details.items.map(i => i.id)) });
        } else {
            updateState({ selectedAssignmentIds: new Set() });
        }
    };
 
    const handleCleanup = async () => {
        if (!user || state.selectedAssignmentIds.size === 0) {
            toast({ title: 'Ninguna selección', description: 'Debes seleccionar al menos una asignación para limpiar.', variant: 'destructive' });
            return;
        }
 
        updateState({ isSubmitting: true });
        try {
            await unassignMultipleItemsFromLocation(Array.from(state.selectedAssignmentIds), user.name);
            toast({ title: "Limpieza Exitosa", description: `${state.selectedAssignmentIds.size} asignacion(es) han sido eliminadas.` });
            
            // Refresh assignments for the current view
            const targetId = state.selectedLevelId || state.selectedRackId || state.selectedBuildingId;
            if (targetId) {
                const assignments = await getItemLocationsByLocation(targetId);
                updateState({ currentAssignments: assignments, selectedAssignmentIds: new Set() });
            }
        } catch (error: any) {
            logError("Failed to perform cleanup from explorer", { error: error.message });
            toast({ title: "Error en la Limpieza", description: error.message, variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };
    
    const areAllSelected = useMemo(() => {
        return details.items.length > 0 && state.selectedAssignmentIds.size === details.items.length;
    }, [details.items, state.selectedAssignmentIds]);
 
    return {
        state,
        actions: {
            setSearchTerm: (term: string) => updateState({ searchTerm: term }),
            setDetailsSearchTerm: (term: string) => updateState({ detailsSearchTerm: term }),
            selectBuilding,
            selectRack,
            selectLevel,
            handleCleanup,
            handleToggleAssignmentSelection,
            handleSelectAllAssignments,
        },
        selectors: {
            buildings: state.buildings,
            racks: state.racks,
            levels: state.levels,
            details,
            isHighlighted: (locationId: number) => state.highlightedPath.has(locationId),
            areAllSelected,
        }
    };
}
