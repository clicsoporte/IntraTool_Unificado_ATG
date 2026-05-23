/**
 * @fileoverview Hook to manage the logic for the Physical Inventory Count page.
 * This includes handling both manual and scanner-based input modes.
 */
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getLocations, getSelectableLocations, updateInventory, getAllItemLocations, clearInventory } from '@/modules/warehouse/lib/actions';
import type { Product, WarehouseLocation, User, ItemLocation } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';

export type CountMode = 'manual' | 'scanner';

const renderLocationPathAsString = (locationId: number | null, locations: WarehouseLocation[]): string => {
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

export const useInventoryCount = () => {
    const { isAuthorized } = useAuthorization(['warehouse:inventory-count:create']);
    const { toast } = useToast();
    const { user, companyData, products: authProducts } = useAuth();
    
    const [state, setState] = useState({
        isLoading: true,
        isSubmitting: false,
        mode: 'manual' as CountMode,
        allLocations: [] as WarehouseLocation[],
        selectableLocations: [] as WarehouseLocation[],
        itemLocations: [] as ItemLocation[],
        
        // Manual Mode State
        selectedProductId: null as string | null,
        selectedLocationId: null as string | null,
        countedQuantity: '',
        productSearchTerm: '',
        isProductSearchOpen: false,
        locationSearchTerm: '',
        isLocationSearchOpen: false,
        keepLocation: false,

        // Scanner Mode State
        scanInput: '',
        scannerQuantityInput: '',
        scannerLoadedData: null as { product: Product; location: WarehouseLocation } | null,
        lastCountInfo: null as { product: string; location: string; quantity: number } | null,
    });

    const quantityInputRef = useRef<HTMLInputElement>(null);
    const scanInputRef = useRef<HTMLInputElement>(null);

    const [debouncedProductSearch] = useDebounce(state.productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedLocationSearch] = useDebounce(state.locationSearchTerm, companyData?.searchDebounceTime ?? 500);

    const updateState = useCallback((newState: Partial<typeof state>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    useEffect(() => {
        const loadInitialData = async () => {
            updateState({ isLoading: true });
            try {
                const [locs, itemLocs, prefs] = await Promise.all([
                    getLocations(),
                    getAllItemLocations(),
                    user ? getUserPreferences(user.id, 'inventoryCountPrefs') : Promise.resolve(null),
                ]);
                updateState({
                    allLocations: locs,
                    selectableLocations: getSelectableLocations(locs),
                    itemLocations: itemLocs,
                    mode: prefs?.mode || 'manual',
                    keepLocation: prefs?.keepLocation || false,
                });
            } catch (error) {
                logError("Failed to load data for inventory count page", { error });
                toast({ title: "Error de Carga", variant: "destructive" });
            } finally {
                updateState({ isLoading: false });
            }
        };
        if (isAuthorized) {
            loadInitialData();
        }
    }, [isAuthorized, toast, updateState, user]);

    // --- SHARED LOGIC & SELECTORS ---

    const mixedLocationIds = useMemo(() => {
        const counts = new Map<number, number>();
        state.itemLocations.forEach(il => {
            if (il.locationId) {
                counts.set(il.locationId, (counts.get(il.locationId) || 0) + 1);
            }
        });
        return new Set(
            Array.from(counts.entries())
                .filter(([_, count]) => count > 1)
                .map(([locationId]) => locationId)
        );
    }, [state.itemLocations]);

    const productOptions = useMemo(() => {
        if (debouncedProductSearch.length < 2) return [];
        const searchLower = debouncedProductSearch.toLowerCase();
        return authProducts
            .filter(p => p.id.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
    }, [authProducts, debouncedProductSearch]);

    const locationOptions = useMemo(() => {
        const searchTerm = debouncedLocationSearch.trim().toLowerCase();
        if (searchTerm === '*' || searchTerm === '') {
            return state.selectableLocations.map(l => ({ 
                value: String(l.id), 
                label: `${renderLocationPathAsString(l.id, state.allLocations)}${mixedLocationIds.has(l.id) ? ' (Mixta)' : ''}` 
            }));
        }
        return state.selectableLocations
            .filter(l => renderLocationPathAsString(l.id, state.allLocations).toLowerCase().includes(searchTerm))
            .map(l => ({ 
                value: String(l.id), 
                label: `${renderLocationPathAsString(l.id, state.allLocations)}${mixedLocationIds.has(l.id) ? ' (Mixta)' : ''}`
             }));
    }, [state.allLocations, state.selectableLocations, debouncedLocationSearch, mixedLocationIds]);


    // --- MODE SWITCHING ---
    const setMode = async (newMode: CountMode) => {
        updateState({ mode: newMode });
        if (user) {
            await saveUserPreferences(user.id, 'inventoryCountPrefs', { mode: newMode, keepLocation: state.keepLocation });
        }
    };
    
    // --- MANUAL MODE ACTIONS ---
    const handleSelectProduct = (value: string) => {
        const product = authProducts.find(p => p.id === value);
        if (product) {
            updateState({ selectedProductId: value, productSearchTerm: `[${product.id}] ${product.description}`, isProductSearchOpen: false });
        }
    };
    
    const handleSelectLocation = (value: string) => {
        const location = state.allLocations.find(l => String(l.id) === value);
        if (location) {
            updateState({ selectedLocationId: value, locationSearchTerm: renderLocationPathAsString(location.id, state.allLocations), isLocationSearchOpen: false });
        }
    };

    const handleSaveManualCount = async () => {
        if (!state.selectedProductId || !state.selectedLocationId || state.countedQuantity === '') {
            toast({ title: "Datos Incompletos", variant: "destructive" });
            return;
        }
        if (!user) return;

        const quantity = parseFloat(state.countedQuantity);
        if (isNaN(quantity)) {
            toast({ title: "Cantidad Inválida", variant: "destructive" });
            return;
        }

        updateState({ isSubmitting: true });
        try {
            await updateInventory(state.selectedProductId, parseInt(state.selectedLocationId, 10), quantity, user.id);
            toast({ title: "Conteo Guardado", description: `Se registró un inventario de ${quantity} para el producto.` });

            updateState({ selectedProductId: null, productSearchTerm: '', countedQuantity: '' });
            if (!state.keepLocation) {
                updateState({ selectedLocationId: null, locationSearchTerm: '' });
            }
        } catch (e: any) {
            logError('Failed to save manual inventory count', { error: e.message });
            toast({ title: "Error", description: `No se pudo guardar el conteo. ${e.message}`, variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };

    const setKeepLocation = async (value: boolean) => {
        updateState({ keepLocation: value });
         if (user) {
            await saveUserPreferences(user.id, 'inventoryCountPrefs', { mode: state.mode, keepLocation: value });
        }
    }

    // --- SCANNER MODE ACTIONS ---
    const processScan = (scanValue: string) => {
        const trimmedValue = scanValue.trim();
        if (!trimmedValue) return;

        let locationId: number | null = null;
        let productId: string | null = null;

        if (trimmedValue.includes('>')) {
            const parts = trimmedValue.split('>');
            locationId = parseInt(parts[0], 10);
            productId = parts[1];
        } else {
            // Assume it's a product code and try to find its designated location
            productId = trimmedValue;
            const itemLoc = state.itemLocations.find(il => il.itemId === productId);
            if (itemLoc) {
                locationId = itemLoc.locationId;
            }
        }

        if (!locationId || !productId) {
            toast({ title: 'Código Inválido', description: 'No se pudo determinar el producto y la ubicación.', variant: 'destructive' });
            return;
        }
        
        const product = authProducts.find(p => p.id === productId);
        const location = state.allLocations.find(l => l.id === locationId);

        if (product && location) {
            updateState({
                scannerLoadedData: { product, location },
                scanInput: '', // Clear after successful load
            });
            setTimeout(() => quantityInputRef.current?.focus(), 100);
        } else {
            toast({ title: 'No Encontrado', description: 'No se encontró el producto o la ubicación para este código.', variant: 'destructive' });
        }
    };
    
    const handleScanInput = (scanValue: string) => {
        updateState({ scanInput: scanValue, scannerLoadedData: null });
    };

    const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            processScan(state.scanInput);
        }
    };
    
    const handleSaveScannerCount = async () => {
        if (!state.scannerLoadedData || !state.scannerQuantityInput || !user) return;

        const quantity = parseFloat(state.scannerQuantityInput);
        if (isNaN(quantity)) {
            toast({ title: 'Cantidad Inválida', variant: 'destructive' });
            return;
        }

        updateState({ isSubmitting: true });
        try {
            await updateInventory(state.scannerLoadedData.product.id, state.scannerLoadedData.location.id, quantity, user.id);
            toast({ title: "Conteo Guardado" });
            
            updateState({
                lastCountInfo: {
                    product: state.scannerLoadedData.product.description,
                    location: renderLocationPathAsString(state.scannerLoadedData.location.id, state.allLocations),
                    quantity,
                },
                scannerLoadedData: null,
                scannerQuantityInput: '',
            });
             setTimeout(() => scanInputRef.current?.focus(), 100);
        } catch (error: any) {
            logError('Failed to save scanner inventory count', { error: error.message });
            toast({ title: "Error", description: `No se pudo guardar el conteo. ${error.message}`, variant: "destructive" });
        } finally {
             updateState({ isSubmitting: false });
        }
    };
    
    const handleClearAllCounts = async () => {
        if (!window.confirm("¿Estás seguro de que deseas borrar TODA la toma de inventario actual? Esta acción no se puede deshacer.")) {
            return;
        }

        updateState({ isSubmitting: true });
        try {
            await clearInventory();
            toast({ title: "Inventario Borrado", description: "Se han eliminado todos los registros de la toma de inventario actual." });
            updateState({ 
                selectedProductId: null, productSearchTerm: '', countedQuantity: '',
                scannerLoadedData: null, lastCountInfo: null
            });
        } catch (error: any) {
            logError('Failed to clear inventory', { error: error.message });
            toast({ title: "Error", description: "No se pudo borrar el inventario.", variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };


    return {
        state,
        actions: {
            // Shared
            setMode,
            // Manual
            handleSelectProduct,
            handleSelectLocation,
            handleSaveManualCount,
            setProductSearchTerm: (term: string) => updateState({ productSearchTerm: term }),
            setLocationSearchTerm: (term: string) => updateState({ locationSearchTerm: term }),
            setProductSearchOpen: (isOpen: boolean) => updateState({ isProductSearchOpen: isOpen }),
            setLocationSearchOpen: (isOpen: boolean) => updateState({ isLocationSearchOpen: isOpen }),
            setCountedQuantity: (qty: string) => updateState({ countedQuantity: qty }),
            setKeepLocation,
            // Scanner
            handleScanInput,
            handleScanKeyDown,
            handleSaveScannerCount,
            setScannerQuantityInput: (qty: string) => updateState({ scannerQuantityInput: qty }),
            handleClearAllCounts,
        },
        selectors: {
            productOptions,
            locationOptions,
            getLocationPathString: (locationId: number | null) => renderLocationPathAsString(locationId, state.allLocations),
        },
        refs: {
            quantityInputRef,
            scanInputRef,
        },
        isAuthorized,
    };
};
