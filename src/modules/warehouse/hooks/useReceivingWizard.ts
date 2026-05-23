/**
 * @fileoverview Hook to manage the state and logic for the receiving wizard.
 */
'use client';
 
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { 
    addInventoryUnit, 
    assignItemToLocation, 
    checkAssignmentConflict,
    searchLocations,
    getSuggestedLocations,
    getLocationsByParent,
    lockEntity
} from '@/modules/warehouse/lib/actions';
import type { Product, WarehouseLocation, InventoryUnit } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import jsPDF from "jspdf";
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { format } from 'date-fns';
 
type WizardStep = 'select_product' | 'select_location' | 'confirm_suggested' | 'confirm_new' | 'finished';
 
export const useReceivingWizard = () => {
    useAuthorization(['warehouse:receiving-wizard:use']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products: authProducts, isAuthReady } = useAuth();
 
    const [state, setState] = useState({
        isLoading: true,
        isSubmitting: false,
        step: 'select_product' as WizardStep,
        selectableLocations: [] as WarehouseLocation[],
        selectedProduct: null as Product | null,
        suggestedLocations: [] as WarehouseLocation[],
        selectedLocationId: null as number | null,
        newLocationId: null as number | null,
        quantity: '1',
        humanReadableId: '',
        documentId: '',
        erpDocumentId: '',
        notes: '',
        lastCreatedUnit: null as InventoryUnit | null,
        productSearchTerm: '',
        isProductSearchOpen: false,
        locationSearchTerm: '',
        isLocationSearchOpen: false,
        saveAsDefault: true,
        isMixedLocationConfirmOpen: false,
        conflictingItems: [] as Product[],
        isTargetLocationMixed: false,
        moveProductConfirmOpen: false,
        moveAndMixConfirmOpen: false,
    });
    
    const isSubmittingRef = useRef(false);
    const [debouncedProductSearch] = useDebounce(state.productSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [debouncedLocationSearch] = useDebounce(state.locationSearchTerm, companyData?.searchDebounceTime ?? 500);
 
    const updateState = useCallback((newState: Partial<typeof state>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);
 
    useEffect(() => {
        setTitle("Asistente de Recepción");
        const loadInitialData = async () => {
            updateState({ isLoading: true });
            try {
                const rootLocs = await getLocationsByParent(null);
                updateState({ selectableLocations: rootLocs, isLoading: false });
            } catch (error: any) {
                logError("Failed to load initial receiving data", { error: error.message });
                updateState({ isLoading: false });
            }
        };
        if (isAuthReady) loadInitialData();
    }, [setTitle, isAuthReady, updateState]);
    
    useEffect(() => {
        if (!debouncedLocationSearch || debouncedLocationSearch.length < 2) return;
        const performSearch = async () => {
            try {
                const results = await searchLocations(debouncedLocationSearch, 20);
                updateState({ selectableLocations: results });
            } catch (error) {
                logError("Location search failed", { error });
            }
        };
        performSearch();
    }, [debouncedLocationSearch, updateState]);
 
    const productOptions = useMemo(() => {
        if (debouncedProductSearch.length < 2) return [];
        const searchLower = debouncedProductSearch.toLowerCase();
        return authProducts
            .filter(p => p.id.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower) || (p.barcode || '').toLowerCase().includes(searchLower))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
    }, [authProducts, debouncedProductSearch]);
 
    const locationOptions = useMemo(() => {
        return state.selectableLocations.map(l => ({ 
            value: String(l.id), 
            label: l.cached_full_path || l.name 
        }));
    }, [state.selectableLocations]);
 
    const handleSelectProduct = useCallback(async (productId: string) => {
        const product = authProducts.find(p => p.id === productId);
        if (!product) return;
 
        updateState({ isLoading: true });
        try {
            const suggested = await getSuggestedLocations(productId);
            updateState({
                selectedProduct: product,
                productSearchTerm: '',
                suggestedLocations: suggested,
                step: 'select_location',
                isProductSearchOpen: false,
                saveAsDefault: suggested.length === 0,
            });
        } catch (error) {
            logError("Failed to fetch suggested locations", { error });
        } finally {
            updateState({ isLoading: false });
        }
    }, [authProducts, updateState]);
    
    const handleUseSuggestedLocation = (locationId: number) => {
        const location = state.suggestedLocations.find(l => l.id === locationId);
        updateState({
            selectedLocationId: locationId,
            newLocationId: locationId,
            locationSearchTerm: location?.cached_full_path || location?.name || '',
            step: 'confirm_suggested',
            saveAsDefault: false,
        });
    };
    
    const performRegistration = useCallback(async (mode?: 'move' | 'add' | 'add_and_mix' | 'move_and_mix') => {
        if (!user || !state.selectedProduct || !state.newLocationId || !state.quantity) return;
        updateState({ isSubmitting: true });
        
        try {
            // Re-lock just before actual database modification to ensure atomicity
            const lockResult = await lockEntity({ entityIds: [state.newLocationId], userName: user.name, userId: user.id });
            if (lockResult.locked) {
                toast({ title: "Ubicación Ocupada", description: "Otro usuario está usando esta ubicación ahora mismo. Intenta nuevamente en unos segundos.", variant: "destructive" });
                return;
            }

            if (state.saveAsDefault) {
                 await assignItemToLocation({
                    itemId: state.selectedProduct.id,
                    locationId: state.newLocationId,
                    clientId: null,
                    updatedBy: user.name,
                    isExclusive: 0,
                    requiresCertificate: 0,
                }, mode);
            }
 
            const newUnit = await addInventoryUnit({
                productId: state.selectedProduct.id,
                locationId: state.newLocationId,
                quantity: parseFloat(state.quantity),
                humanReadableId: state.humanReadableId,
                documentId: state.documentId,
                erpDocumentId: state.erpDocumentId,
                notes: state.notes,
                createdBy: user.name,
            });
 
            updateState({ lastCreatedUnit: newUnit, step: 'finished' });
            
        } catch (error: any) {
            logError('Failed to register new unit', { error: error.message });
            toast({ title: "Error al Registrar", description: error.message, variant: "destructive" });
        } finally {
            if (state.newLocationId && user?.id) {
                const { releaseLock } = await import('@/modules/warehouse/lib/actions');
                await releaseLock([state.newLocationId], user.id);
            }
            isSubmittingRef.current = false;
            updateState({ isSubmitting: false, isMixedLocationConfirmOpen: false, moveAndMixConfirmOpen: false, moveProductConfirmOpen: false });
        }
    }, [user, state.selectedProduct, state.newLocationId, state.quantity, state.humanReadableId, state.documentId, state.erpDocumentId, state.notes, state.saveAsDefault, toast, updateState]);
 
    const handleConfirmAndRegister = async () => {
        if (!user || !state.selectedProduct || !state.newLocationId || !state.quantity || isSubmittingRef.current) return;
        const quantityNum = parseFloat(state.quantity);
        if (isNaN(quantityNum) || quantityNum <= 0) {
            toast({ title: 'Cantidad Inválida', description: 'La cantidad debe ser un número mayor a cero.', variant: 'destructive' });
            return;
        }
        
        isSubmittingRef.current = true;
        updateState({ isSubmitting: true });
        try {
            // 1. Lock the location atomically to prevent race conditions from other users
            const lockResult = await lockEntity({ entityIds: [state.newLocationId], userName: user.name, userId: user.id });
            if (lockResult.locked) {
                toast({ title: "Ubicación Ocupada", description: "Otro usuario está recibiendo en esta ubicación en este momento.", variant: "destructive" });
                isSubmittingRef.current = false;
                updateState({ isSubmitting: false });
                return;
            }

            // 2. Perform conflict check inside the lock
            const conflictResult = await checkAssignmentConflict({ itemId: state.selectedProduct.id, locationId: state.newLocationId });
            
            if (conflictResult.productHasOtherLocations && conflictResult.locationHasOtherProducts) {
                updateState({ moveAndMixConfirmOpen: true });
            } else if (conflictResult.productHasOtherLocations) {
                updateState({ moveProductConfirmOpen: true });
            } else if (conflictResult.locationHasOtherProducts) {
                updateState({ 
                    conflictingItems: [conflictResult.conflictingProduct!].filter(Boolean), 
                    isMixedLocationConfirmOpen: true 
                });
            } else {
                await performRegistration('add'); 
            }
        } catch (e: any) {
            logError('Conflict check failed', { error: e.message });
            // Release lock on error
            if (state.newLocationId && user?.id) {
                const { releaseLock } = await import('@/modules/warehouse/lib/actions');
                await releaseLock([state.newLocationId], user.id);
            }
            isSubmittingRef.current = false;
            updateState({ isSubmitting: false });
        }
    };
 
    return {
        state,
        actions: {
            handleSelectProduct,
            handleUseSuggestedLocation,
            handleAssignNewLocation: () => updateState({ step: 'confirm_new' }),
            handleSelectLocation: (idStr: string) => {
                const loc = state.selectableLocations.find(l => l.id === Number(idStr));
                updateState({ newLocationId: Number(idStr), isLocationSearchOpen: false, locationSearchTerm: loc?.cached_full_path || loc?.name || '' });
            },
            handleConfirmAndRegister,
            handleReset: () => updateState({ step: 'select_product', selectedProduct: null, productSearchTerm: '', suggestedLocations: [], selectedLocationId: null, newLocationId: null, locationSearchTerm: '', quantity: '1', humanReadableId: '', documentId: '', erpDocumentId: '', notes: '', lastCreatedUnit: null, saveAsDefault: true }),
            handleGoBack: () => {
                if (state.step === 'select_location') updateState({ step: 'select_product', selectedProduct: null });
                else updateState({ step: 'select_location', newLocationId: null, locationSearchTerm: '' });
            },
            setProductSearchTerm: (term: string) => updateState({ productSearchTerm: term }),
            setProductSearchOpen: (isOpen: boolean) => updateState({ isProductSearchOpen: isOpen }),
            setLocationSearchTerm: (term: string) => updateState({ locationSearchTerm: term }),
            setLocationSearchOpen: (isOpen: boolean) => updateState({ isLocationSearchOpen: isOpen }),
            setQuantity: (qty: string) => updateState({ quantity: qty }),
            setHumanReadableId: (id: string) => updateState({ humanReadableId: id }),
            setDocumentId: (id: string) => updateState({ documentId: id }),
            setErpDocumentId: (id: string) => updateState({ erpDocumentId: id }),
            setSaveAsDefault: (save: boolean) => updateState({ saveAsDefault: save }),
            setNotes: (notes: string) => updateState({ notes }),
            handleProductSearchKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' && productOptions.length > 0) handleSelectProduct(productOptions[0].value);
            },
            handlePrintLabel: async (unit: InventoryUnit | null) => {
                if (!unit || !state.selectedProduct) return;
                const canvas = document.createElement('canvas');
                JsBarcode(canvas, unit.unitCode!, { format: 'CODE128' });
                const barcodeDataUrl = canvas.toDataURL('image/png');
                const qrCodeDataUrl = await QRCode.toDataURL(unit.unitCode!);
                const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [4, 3] });
                doc.addImage(qrCodeDataUrl, 'PNG', 0.2, 0.2, 1.2, 1.2);
                doc.addImage(barcodeDataUrl, 'PNG', 0.2, 1.5, 1.2, 0.4);
                doc.text(`ID: ${unit.productId}`, 1.6, 0.5);
                doc.save(`label_${unit.unitCode}.pdf`);
            },
            setIsMixedLocationConfirmOpen: (open: boolean) => updateState({ isMixedLocationConfirmOpen: open }),
            setMoveProductConfirmOpen: (open: boolean) => updateState({ moveProductConfirmOpen: open }),
            setMoveAndMixConfirmOpen: (open: boolean) => updateState({ moveAndMixConfirmOpen: open }),
            performRegistration,
        },
        selectors: {
            productOptions,
            locationOptions,
            renderLocationPath: (id: number) => {
                const loc = [...state.selectableLocations, ...state.suggestedLocations].find(l => l.id === id);
                return loc?.cached_full_path || loc?.name || String(id);
            },
        },
    };
};
