/**
 * @fileoverview Hook to manage the state and logic for the Label Center page.
 */
'use client';

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getLocations, getAllItemLocations, getWarehouseSettings } from '@/modules/warehouse/lib/actions';
import type { WarehouseLocation, ItemLocation, WarehouseSettings, Product } from '@/modules/core/types';
import { useDebounce } from 'use-debounce';
import jsPDF from "jspdf";
import QRCode from 'qrcode';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { format } from 'date-fns';

type LabelType = 'location' | 'product_location';

interface State {
    isLoading: boolean;
    isSubmitting: boolean;
    allLocations: WarehouseLocation[];
    itemLocations: ItemLocation[];
    warehouseSettings: WarehouseSettings | null;
    selectedRack: WarehouseLocation | null;
    levelFilter: string[];
    positionFilter: string[];
    labelType: LabelType;
    rackSearchTerm: string;
    isRackSearchOpen: boolean;
}

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


export const useLabelCenter = () => {
    const { isAuthorized } = useAuthorization(['warehouse:labels:generate']);
    const { toast } = useToast();
    const { user, products, companyData } = useAuth();

    const [state, setState] = useState<State>({
        isLoading: true,
        isSubmitting: false,
        allLocations: [],
        itemLocations: [],
        warehouseSettings: null,
        selectedRack: null,
        levelFilter: [],
        positionFilter: [],
        labelType: 'location',
        rackSearchTerm: '',
        isRackSearchOpen: false,
    });

    const [debouncedRackSearch] = useDebounce(state.rackSearchTerm, companyData?.searchDebounceTime ?? 500);

    const updateState = useCallback((newState: Partial<State>) => {
        setState((prevState: State) => ({ ...prevState, ...newState }));
    }, []);

    useEffect(() => {
        const loadData = async () => {
            if (!isAuthorized) return;
            try {
                const [locs, itemLocs, settings] = await Promise.all([getLocations(), getAllItemLocations(), getWarehouseSettings()]);
                updateState({ allLocations: locs, itemLocations: itemLocs, warehouseSettings: settings, isLoading: false });
            } catch (error: any) {
                logError("Failed to load data for label center", { error: error.message });
                toast({ title: "Error de Carga", variant: "destructive" });
                updateState({ isLoading: false });
            }
        };
        loadData();
    }, [isAuthorized, toast, updateState]);

    const handleSelectRack = (rackIdStr: string) => {
        const rackId = Number(rackIdStr);
        const rack = state.allLocations.find((l: WarehouseLocation) => l.id === rackId);
        if (rack) {
            updateState({
                selectedRack: rack,
                rackSearchTerm: `${rack.name} (${rack.code})`,
                isRackSearchOpen: false,
                levelFilter: [],
                positionFilter: [],
            });
        }
    };
    
    const rackOptions = useMemo(() => {
        return state.allLocations
            .filter((l: WarehouseLocation) => l.type === 'rack' && (l.name.toLowerCase().includes(debouncedRackSearch.toLowerCase()) || l.code.toLowerCase().includes(debouncedRackSearch.toLowerCase())))
            .map((r: WarehouseLocation) => ({ value: String(r.id), label: `${r.name} (${r.code})` }));
    }, [state.allLocations, debouncedRackSearch]);

    const rackChildren = useMemo(() => {
        if (!state.selectedRack) return [];
        
        const getChildrenRecursive = (parentId: number): WarehouseLocation[] => {
            const directChildren = state.allLocations.filter((l: WarehouseLocation) => l.parentId === parentId);
            if (directChildren.length === 0) {
                 const parentItself = state.allLocations.find((l: WarehouseLocation) => l.id === parentId);
                 return parentItself ? [parentItself] : [];
            }
            return directChildren.flatMap((child: WarehouseLocation) => getChildrenRecursive(child.id));
        };

        return getChildrenRecursive(state.selectedRack.id);
    }, [state.selectedRack, state.allLocations]);

    const levelOptions = useMemo(() => {
        if (!state.selectedRack || !state.warehouseSettings?.locationLevels) return [];
        const levelType = state.warehouseSettings.locationLevels[3]?.type || 'shelf';
        const children = state.allLocations.filter((l: WarehouseLocation) => l.parentId === state.selectedRack?.id && l.type === levelType);
        return children.map((l: WarehouseLocation) => ({ value: String(l.id), label: l.name }));
    }, [state.selectedRack, state.allLocations, state.warehouseSettings]);
    
    const positionOptions = useMemo(() => {
        if (!state.selectedRack || !state.warehouseSettings?.locationLevels) return [];
        const levelType = state.warehouseSettings.locationLevels[3]?.type || 'shelf';
        const positionType = state.warehouseSettings.locationLevels[4]?.type || 'bin';
        
        const levels = state.allLocations.filter((l: WarehouseLocation) => l.parentId === state.selectedRack?.id && l.type === levelType);
        const positions = levels.flatMap((level: WarehouseLocation) => state.allLocations.filter((l: WarehouseLocation) => l.parentId === level.id && l.type === positionType));
        
        const uniquePositionNames = Array.from(new Set(positions.map((p: WarehouseLocation) => p.name))).sort();

        return uniquePositionNames.map(name => ({ value: name, label: name }));
    }, [state.selectedRack, state.allLocations, state.warehouseSettings]);

    const filteredLocations = useMemo(() => {
        if (!state.selectedRack) return [];

        // rackChildren are the leaf nodes, which is what we want to print.
        let potentialLocations = rackChildren;
        
        // Helper to get all ancestors for a given location up to the selected rack
        const getAncestors = (locationId: number): WarehouseLocation[] => {
            const ancestors: WarehouseLocation[] = [];
            let current = state.allLocations.find(l => l.id === locationId);
            while (current && current.parentId) {
                const parent = state.allLocations.find(p => p.id === current!.parentId);
                if (!parent || parent.id === state.selectedRack?.id) break;
                ancestors.push(parent);
                current = parent;
            }
            return ancestors;
        };
        
        // Apply Level Filter
        if (state.levelFilter.length > 0) {
            const levelIds = new Set(state.levelFilter.map(Number));
            potentialLocations = potentialLocations.filter(loc => {
                const ancestors = getAncestors(loc.id);
                // A "level" is a direct child of a rack.
                const levelAncestor = ancestors.find(a => a.parentId === state.selectedRack?.id);
                return levelAncestor && levelIds.has(levelAncestor.id);
            });
        }
        
        // Apply Position Filter
        if (state.positionFilter.length > 0) {
            const positionNames = new Set(state.positionFilter);
            potentialLocations = potentialLocations.filter(loc => {
                const ancestors = getAncestors(loc.id);
                // A "position" is a child of a "level".
                return ancestors.some(a => positionNames.has(a.name));
            });
        }

        // Apply Label Type filter
        if (state.labelType === 'product_location') {
            const assignedLocationIds = new Set(state.itemLocations.map((il: ItemLocation) => il.locationId));
            return potentialLocations.filter(l => assignedLocationIds.has(l.id));
        }

        return potentialLocations;
    }, [state.selectedRack, state.levelFilter, state.positionFilter, state.labelType, rackChildren, state.itemLocations, state.allLocations]);
    
    const handleGeneratePdf = async () => {
        if (filteredLocations.length === 0) {
            toast({ title: 'Sin etiquetas para generar', variant: 'destructive' });
            return;
        }
        updateState({ isSubmitting: true });

        const getDynamicFontSize = (doc: jsPDF, text: string, maxWidth: number): number => {
            let fontSize = 80; // Start large
            doc.setFontSize(fontSize);
            while (doc.getTextWidth(text) > maxWidth && fontSize > 10) {
                fontSize -= 2;
                doc.setFontSize(fontSize);
            }
            return fontSize;
        };
        
        try {
            if (state.labelType === 'product_location') {
                const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
                doc.deletePage(1);

                for (const location of filteredLocations) {
                    doc.addPage();
                    const itemAssignment = state.itemLocations.find((il: ItemLocation) => il.locationId === location.id);
                    if (!itemAssignment) continue;

                    const product = products.find(p => p.id === itemAssignment.itemId);
                    const qrContent = `${location.id}>${itemAssignment.itemId}`;
                    const mainText = product?.id || 'N/A';
                    const secondaryText = product?.description || 'Producto no encontrado';
                    const footerText = renderLocationPathAsString(location.id, state.allLocations);

                    const qrCodeDataUrl = await QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'M', width: 200 });
                    const margin = 40;
                    const pageWidth = doc.internal.pageSize.getWidth();
                    const pageHeight = doc.internal.pageSize.getHeight();
                    doc.addImage(qrCodeDataUrl, 'PNG', margin, margin, 100, 100);
                    doc.setFontSize(9);
                    doc.setFont('Helvetica', 'normal');
                    doc.setTextColor('#666');
                    doc.text(`Creado: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin, { align: 'right' });
                    if (user) doc.text(`por ${user.name}`, pageWidth - margin, margin + 12, { align: 'right' });
                    doc.setTextColor('#000');
                    doc.setFontSize(150);
                    doc.setFont('Helvetica', 'bold');
                    doc.text(mainText, pageWidth / 2, pageHeight / 2 - 40, { align: 'center'});
                    doc.setFontSize(52);
                    doc.setFont('Helvetica', 'normal');
                    const secondaryTextLines = doc.splitTextToSize(secondaryText, pageWidth - margin * 2);
                    doc.text(secondaryTextLines, pageWidth / 2, pageHeight / 2 + 50, { align: 'center' });
                    if (footerText) {
                        doc.setFontSize(24);
                        doc.setFont('Helvetica', 'bold');
                        doc.text('Ubicación:', margin, pageHeight - 80);
                        doc.setFontSize(28);
                        doc.setFont('Helvetica', 'normal');
                        const footerLines = doc.splitTextToSize(footerText, pageWidth - margin * 2);
                        doc.text(footerLines, margin, pageHeight - 50);
                    }
                }
                if (doc.getNumberOfPages() > 1) { // If pages were added
                    doc.save(`etiquetas_productos_${Date.now()}.pdf`);
                } else {
                    toast({ title: 'Sin Asignaciones', description: 'Ninguna de las ubicaciones filtradas tiene un producto asignado.', variant: 'destructive'});
                }
            } else {
                const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
                doc.deletePage(1);
                for (const location of filteredLocations) {
                    doc.addPage();
                    const qrContent = String(location.id);
                    const mainText = location.code;
                    const secondaryText = renderLocationPathAsString(location.id, state.allLocations);
                    const qrCodeDataUrl = await QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'M', width: 200 });
                    
                    const margin = 40;
                    const pageWidth = doc.internal.pageSize.getWidth();
                    const pageHeight = doc.internal.pageSize.getHeight();
                    const maxWidth = pageWidth - (margin * 2);

                    doc.addImage(qrCodeDataUrl, 'PNG', margin, margin, 100, 100);
                    
                    // Metadatos arriba a la derecha
                    doc.setFontSize(9);
                    doc.setFont('Helvetica', 'normal');
                    doc.setTextColor('#666');
                    doc.text(`Creado: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin, margin, { align: 'right' });
                    doc.setTextColor('#000');

                    // 1. Ajustar Código de Ubicación (Main Text) - Máximo tamaño posible
                    doc.setFont('Helvetica', 'bold');
                    let mainFontSize = 160;
                    doc.setFontSize(mainFontSize);
                    while (doc.getTextWidth(mainText) > maxWidth && mainFontSize > 20) {
                        mainFontSize -= 5;
                        doc.setFontSize(mainFontSize);
                    }
                    doc.text(mainText, pageWidth / 2, pageHeight / 2 - 10, { align: 'center' });

                    // 2. Ajustar Ruta de Ubicación (Secondary Text) - Con soporte multilínea
                    doc.setFont('Helvetica', 'normal');
                    let secondaryFontSize = 38;
                    doc.setFontSize(secondaryFontSize);
                    // Si es extremadamente largo, bajamos un poco la base antes de hacer el wrap
                    while (doc.getTextWidth(secondaryText) > maxWidth * 2 && secondaryFontSize > 14) {
                        secondaryFontSize -= 2;
                        doc.setFontSize(secondaryFontSize);
                    }
                    const secondaryTextLines = doc.splitTextToSize(secondaryText, maxWidth);
                    doc.text(secondaryTextLines, pageWidth / 2, pageHeight / 2 + 80, { align: 'center' });
                }
                 if (doc.getNumberOfPages() > 1) {
                    doc.save(`etiquetas_ubicacion_${Date.now()}.pdf`);
                 } else {
                     toast({ title: 'Sin Etiquetas', description: 'No se encontraron ubicaciones para generar.', variant: 'destructive'});
                 }
            }
        } catch (err: any) {
             logError('PDF Generation Error', { error: err.message });
             toast({ title: 'Error al generar PDF', variant: 'destructive'});
        } finally {
            updateState({ isSubmitting: false });
        }
    };

    return {
        state,
        actions: {
            handleSelectRack,
            setRackSearchTerm: (term: string) => updateState({ rackSearchTerm: term }),
            setIsRackSearchOpen: (isOpen: boolean) => updateState({ isRackSearchOpen: isOpen }),
            setLevelFilter: (filter: string[]) => updateState({ levelFilter: filter }),
            setPositionFilter: (filter: string[]) => updateState({ positionFilter: filter }),
            setLabelType: (type: LabelType) => updateState({ labelType: type }),
            handleGeneratePdf,
        },
        selectors: {
            rackOptions,
            levelOptions,
            positionOptions,
            filteredLocations,
        }
    };
};
