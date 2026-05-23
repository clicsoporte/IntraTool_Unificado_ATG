
/**
 * @fileoverview Hook for the guided rack population wizard.
 * This has been converted from a page component to a hook to centralize logic.
 */
'use client';
 
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError } from '@/modules/core/lib/logger';
import { 
    getChildLocations, 
    lockEntity, 
    releaseLock, 
    assignItemToLocation, 
    updateLocationPopulationStatus, 
    finalizePopulationSession,
    getRacks,
    getLevelsForRack,
} from '@/modules/warehouse/lib/actions';
import { getActiveWizardSession, saveWizardSession, clearWizardSession } from '@/modules/core/lib/db';
import type { WarehouseLocation, WizardSession } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
 
export type WizardStep = 'setup' | 'populating' | 'finished' | 'resume';
 
export const usePopulationWizard = () => {
    useAuthorization(['warehouse:access']);
    const { toast } = useToast();
    const { user, companyData, products: authProducts } = useAuth();
 
    const [isLoading, setIsLoading] = useState(true);
    const [wizardStep, setWizardStep] = useState<WizardStep>('setup');
    
    const [racks, setRacks] = useState<WarehouseLocation[]>([]);
    const [selectedRackId, setSelectedRackId] = useState<number | null>(null);
    const [rackLevels, setRackLevels] = useState<(WarehouseLocation & { isCompleted?: boolean })[]>([]);
    const [selectedLevelIds, setSelectedLevelIds] = useState<Set<number>>(new Set());
 
    const [locationsToPopulate, setLocationsToPopulate] = useState<WarehouseLocation[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [productSearch, setProductSearch] = useState('');
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const [lastAssignment, setLastAssignment] = useState<{ location: string; product: string; code: string; } | null>(null);
    
    const [rackSearchTerm, setRackSearchTerm] = useState('');
    const [isRackSearchOpen, setIsRackSearchOpen] = useState(false);
 
    const [debouncedProductSearch] = useDebounce(productSearch, companyData?.searchDebounceTime ?? 300);
    const [debouncedRackSearch] = useDebounce(rackSearchTerm, companyData?.searchDebounceTime ?? 500);
    const [existingSession, setExistingSession] = useState<WizardSession | null>(null);
    
    const [sessionAssignments, setSessionAssignments] = useState<{ locationId: number, itemId: string }[]>([]);
    
    useEffect(() => {
        const loadInitial = async () => {
            setIsLoading(true);
            try {
                if (user) {
                    const [racksData, session] = await Promise.all([
                        getRacks(),
                        getActiveWizardSession(user.id)
                    ]);
                    setRacks(racksData);
                    if (session) {
                        setExistingSession(session);
                        setWizardStep('resume');
                    }
                }
            } catch (error) {
                logError("Failed to load initial wizard data", { error });
            } finally {
                setIsLoading(false);
            }
        };
        loadInitial();
    }, [user]);
 
    useEffect(() => {
        if (selectedRackId) {
            getLevelsForRack(selectedRackId).then(setRackLevels);
        } else {
            setRackLevels([]);
        }
    }, [selectedRackId]);
 
    const handleSelectRack = (idStr: string) => {
        setSelectedRackId(Number(idStr));
        setSelectedLevelIds(new Set());
    };
 
    const handleToggleLevel = (levelId: number) => {
        const newSet = new Set(selectedLevelIds);
        if (newSet.has(levelId)) newSet.delete(levelId);
        else newSet.add(levelId);
        setSelectedLevelIds(newSet);
    };
 
    const handleStartWizard = async () => {
        if (!selectedRackId || selectedLevelIds.size === 0 || !user) return;
        setIsLoading(true);
        try {
            const levelIds = Array.from(selectedLevelIds);
            const allLeaves = await getChildLocations(levelIds);
            const flatLeaves = allLeaves.sort((a, b) => (a.cached_full_path || '').localeCompare(b.cached_full_path || ''));
 
            const lockResult = await lockEntity({ entityIds: [selectedRackId], userName: user.name, userId: user.id });
            if (lockResult.locked) {
                toast({ title: "Rack Bloqueado", description: lockResult.message, variant: "destructive" });
                return;
            }
 
            setLocationsToPopulate(flatLeaves);
            setCurrentIndex(0);
            setWizardStep('populating');
            
            await saveWizardSession(user.id, {
                rackId: selectedRackId,
                levelIds: levelIds,
                currentIndex: 0,
                assignments: []
            });
 
        } catch (error) {
            logError("Failed to start population", { error });
            toast({ title: "Error", description: "No se pudieron cargar las ubicaciones.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };
 
    const resumeSession = async () => {
        if (!existingSession || !user) return;
        setIsLoading(true);
        try {
            const { rackId, levelIds, currentIndex, assignments } = existingSession;
            const allLeaves = await getChildLocations(levelIds);
            const flatLeaves = allLeaves.sort((a, b) => (a.cached_full_path || '').localeCompare(b.cached_full_path || ''));
 
            await lockEntity({ entityIds: [rackId], userName: user.name, userId: user.id });
 
            setLocationsToPopulate(flatLeaves);
            setCurrentIndex(currentIndex);
            setSessionAssignments(assignments || []);
            setWizardStep('populating');
            setSelectedRackId(rackId);
            setSelectedLevelIds(new Set(levelIds));
        } catch (error) {
            logError("Failed to resume session", { error });
        } finally {
            setIsLoading(false);
        }
    };
 
    const abandonSession = async () => {
        if (user) await clearWizardSession(user.id);
        setWizardStep('setup');
        setExistingSession(null);
        setSelectedRackId(null);
        setSelectedLevelIds(new Set());
    };
 
    const handleAssign = async (productId: string | null) => {
        const currentLocation = locationsToPopulate[currentIndex];
        if (user) {
            try {
                if (productId) {
                    const result = await assignItemToLocation({
                        itemId: productId,
                        locationId: currentLocation.id,
                        clientId: null,
                        updatedBy: user.name,
                    }, 'add');
 
                    if (!result.success) {
                        toast({ title: "Error al Asignar", description: result.error, variant: "destructive" });
                        return;
                    }
 
                    const newAssignments = [...sessionAssignments, { locationId: currentLocation.id, itemId: productId }];
                    setSessionAssignments(newAssignments);
                    
                    const product = authProducts.find(p => p.id === productId);
                    setLastAssignment({ 
                        location: currentLocation.cached_full_path || currentLocation.name, 
                        product: product?.description || productId,
                        code: product?.id || productId
                    });
 
                    await saveWizardSession(user.id, {
                        rackId: selectedRackId!,
                        levelIds: Array.from(selectedLevelIds),
                        currentIndex: currentIndex + 1,
                        assignments: newAssignments
                    });
                } else {
                    await updateLocationPopulationStatus(currentLocation.id, 'S');
                    await saveWizardSession(user.id, {
                        rackId: selectedRackId!,
                        levelIds: Array.from(selectedLevelIds),
                        currentIndex: currentIndex + 1,
                        assignments: sessionAssignments
                    });
                }
 
                if (currentIndex < locationsToPopulate.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                    setProductSearch('');
                } else {
                    await handleFinishWizard();
                }
            } catch (err: any) {
                toast({ title: "Error de Sistema", description: "No se pudo conectar con el servidor.", variant: "destructive" });
            }
        }
    };
 
    const handleFinishWizard = async () => {
        if (!selectedRackId || !user) return;
        setIsLoading(true);
        try {
            const levelIds = Array.from(selectedLevelIds);
            await finalizePopulationSession({
                levelIds,
                userName: user.name,
                userId: user.id,
                assignments: sessionAssignments
            });
            await releaseLock([selectedRackId], user.id);
            await clearWizardSession(user.id);
            setWizardStep('finished');
        } catch (error) {
            logError("Failed to finish population", { error });
        } finally {
            setIsLoading(false);
        }
    };
 
    const resetWizard = () => {
        setWizardStep('setup');
        setSelectedRackId(null);
        setSelectedLevelIds(new Set());
        setLocationsToPopulate([]);
        setCurrentIndex(0);
        setLastAssignment(null);
        setSessionAssignments([]);
    };
 
    const productOptions = useMemo(() => {
        if (!debouncedProductSearch) return [];
        const searchLower = debouncedProductSearch.toLowerCase();
        if (searchLower.length < 2) return [];
 
        return authProducts
            .filter(p => p.id.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
    }, [authProducts, debouncedProductSearch]);
 
    const rackOptions = useMemo(() => {
        const searchLower = debouncedRackSearch.toLowerCase();
        return racks
            .filter(l => (l.name.toLowerCase().includes(searchLower) || l.code.toLowerCase().includes(searchLower)))
            .map(r => ({ value: String(r.id), label: `${r.name} (${r.code})` }));
    }, [racks, debouncedRackSearch]);
 
    return {
        state: {
            isLoading,
            wizardStep,
            rackLevels,
            selectedLevelIds,
            rackSearchTerm,
            isRackSearchOpen,
            locationsToPopulate,
            currentIndex,
            productSearch,
            isProductSearchOpen,
            lastAssignment,
            existingSession,
            allLocations: [] 
        },
        actions: {
            handleSelectRack,
            setRackSearchTerm,
            setIsRackSearchOpen,
            handleToggleLevel,
            handleStartWizard,
            abandonSession,
            resumeSession,
            handleProductSelect: handleAssign,
            setProductSearch,
            setIsProductSearchOpen,
            handleSkip: () => handleAssign(null),
            handlePrevious: () => setCurrentIndex(prev => Math.max(0, prev - 1)),
            handleFinishWizard,
            resetWizard,
            handleKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' && productOptions.length > 0) {
                    handleAssign(productOptions[0].value);
                }
            }
        },
        selectors: {
            rackOptions,
            productOptions,
            renderLocationPathAsString: (id: number) => {
                const found = locationsToPopulate.find(l => l.id === id);
                return found?.cached_full_path || found?.name || 'N/A';
            }
        }
    };
};
