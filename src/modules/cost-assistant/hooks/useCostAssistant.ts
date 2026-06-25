/**
 * @fileoverview Custom hook for managing the state and logic of the CostAssistantPage component.
 */
'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import type { CostAssistantLine, ProcessedInvoiceInfo, CostAnalysisDraft, CostAssistantSettings, DraftableCostAssistantLine } from '@/modules/core/types';
import { processInvoiceXmls, getCostAssistantSettings, saveCostAssistantSettings, getAllDrafts, saveDraft, deleteDraft, exportForERP, cleanupExportFile } from '../lib/actions';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { useAuth } from '@/modules/core/hooks/useAuth';

const parseDecimal = (str: any): number => {
    if (str === null || str === undefined || str === '') return 0;
    const s = String(str).trim();
    if (!s) return 0;

    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');

    let decimalSeparatorIndex = -1;

    if (lastDot > lastComma) {
        decimalSeparatorIndex = lastDot;
    } else if (lastComma > -1) {
        decimalSeparatorIndex = lastComma;
    }

    let integerPart = s;
    let decimalPart = '';

    if (decimalSeparatorIndex !== -1) {
        integerPart = s.substring(0, decimalSeparatorIndex);
        decimalPart = s.substring(decimalSeparatorIndex + 1);
    }
    
    const cleanedInteger = integerPart.replace(/\D/g, '');
    const cleanedDecimal = decimalPart.replace(/\D/g, '');
    
    const finalString = cleanedDecimal.length > 0 ? `${cleanedInteger}.${cleanedDecimal}` : cleanedInteger;
    
    const parsed = parseFloat(finalString);
    return isNaN(parsed) ? 0 : parsed;
};

const roundTo4Decimals = (num: number): number => {
    return Math.round(num * 10000) / 10000;
};


const initialColumnVisibility: CostAssistantSettings['columnVisibility'] = {
    cabysCode: true,
    supplierCode: true,
    description: true,
    originalQuantity: false,
    unitsPerPack: true,
    quantity: true,
    discountAmountUnit: false,
    discountPercentage: true,
    xmlGrossPackCost: false,
    xmlPackCost: true,
    unitCostWithoutTax: true,
    taxRate: true,
    margin: true,
    sellPriceWithoutTax: true,
    finalSellPrice: true,
    profitPerLine: true,
};

export type ColumnVisibility = typeof initialColumnVisibility;

type ExportStatus = 'idle' | 'generating' | 'ready';

const initialState = {
    isProcessing: false,
    isSubmitting: false,
    lines: [] as CostAssistantLine[],
    processedInvoices: [] as ProcessedInvoiceInfo[],
    drafts: [] as CostAnalysisDraft[],
    transportCost: 0,
    otherCosts: 0,
    discountHandling: 'company' as 'customer' | 'company',
    columnVisibility: initialColumnVisibility as ColumnVisibility,
    exportStatus: 'idle' as ExportStatus,
    exportFileName: null as string | null,
};

export const useCostAssistant = () => {
    useAuthorization(['dashboard:access', 'cost-assistant:access']); // Permissions
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, isAuthReady } = useAuth();
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [state, setState] = useState(initialState);

    useEffect(() => {
        setTitle("Asistente de Costos");
        const loadSettings = async () => {
            if (user) {
                logInfo('User accessed Cost Assistant module', { user: user.name });
                const settings = await getCostAssistantSettings(user.id);
                const completeVisibility = { ...initialColumnVisibility, ...settings.columnVisibility };
                setState(prevState => ({ 
                    ...prevState, 
                    columnVisibility: completeVisibility,
                    discountHandling: settings.discountHandling || 'company',
                }));
            }
        };
        if (isAuthReady) { // Load settings only when auth context is fully ready
            loadSettings();
        }
    }, [setTitle, user, isAuthReady]);

    const updateLine = (id: string, updatedFields: Partial<CostAssistantLine>) => {
        setState(prevState => ({
            ...prevState,
            lines: prevState.lines.map(line => 
                line.id === id ? { ...line, ...updatedFields } : line
            ),
        }));
    };
    
    const onFileSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return;
        
        const acceptedFiles = Array.from(event.target.files);
        setState(prevState => ({ ...prevState, isProcessing: true }));
        
        try {
            const fileContents = await Promise.all(
                acceptedFiles.map(file => 
                    new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsText(file);
                    })
                )
            );
            
            const { lines: processedLines, processedInvoices } = await processInvoiceXmls(fileContents);

            const newLines = processedLines.map((line: any) => ({
                ...line,
                displayMargin: "20",
                margin: 0.20,
                displayTaxRate: (line.taxRate * 100).toFixed(0),
                displayUnitsPerPack: String(line.unitsPerPack || 1),
                finalSellPrice: 0,
                profitPerLine: 0, 
                sellPriceWithoutTax: 0,
            }));
            
            setState(prevState => ({ 
                ...prevState, 
                lines: [...prevState.lines, ...newLines],
                processedInvoices: [...prevState.processedInvoices, ...processedInvoices]
            }));
            const successCount = processedInvoices.filter((p: any) => p.status === 'success').length;
            toast({ title: "Facturas Procesadas", description: `Se agregaron ${newLines.length} artículos de ${successCount} factura(s).` });

        } catch (error: any) {
            logError("Error processing invoice XMLs", { error: error.message });
            toast({ title: "Error al Procesar Archivos", description: error.message, variant: "destructive" });
        } finally {
            setState(prevState => ({ ...prevState, isProcessing: false }));
        }
    }, [toast]);
    
    const openFileDialog = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = ""; // Reset to allow re-uploading the same file
            fileInputRef.current.click();
        }
    };

    const removeLine = (id: string) => {
        setState(prevState => ({
            ...prevState,
            lines: prevState.lines.filter(line => line.id !== id)
        }));
    };
    
     const handleUnitsPerPackBlur = (lineId: string, displayValue: string) => {
        if (displayValue.trim() === '') {
            updateLine(lineId, {
                unitsPerPack: 1,
                displayUnitsPerPack: '1',
            });
            return;
        }

        const numericValue = parseDecimal(displayValue);
        const newUnitsPerPack = Math.max(1, numericValue);
        const line = state.lines.find(l => l.id === lineId);
        
        if (line) {
            const newQuantity = line.originalQuantity * newUnitsPerPack;
            updateLine(lineId, {
                unitsPerPack: newUnitsPerPack,
                displayUnitsPerPack: String(newUnitsPerPack),
                quantity: newQuantity
            });
        }
    };
    
    const handleMarginBlur = (lineId: string, displayValue: string) => {
        const numericValue = parseDecimal(displayValue);
        updateLine(lineId, {
            margin: numericValue / 100,
            displayMargin: String(numericValue)
        });
    };

    const handleTaxRateBlur = (lineId: string, displayValue: string) => {
        const numericValue = parseDecimal(displayValue);
        updateLine(lineId, {
            taxRate: numericValue / 100,
            displayTaxRate: String(numericValue)
        });
    };

    const formatCurrency = (amount: number) => {
        return `¢${amount.toLocaleString("es-CR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
    };

    const setColumnVisibility = (columnId: string, isVisible: boolean) => {
        setState(prevState => ({
            ...prevState,
            columnVisibility: {
                ...prevState.columnVisibility,
                [columnId]: isVisible,
            }
        }));
    };

    const handleSaveColumnVisibility = async () => {
        if (!user) return;
        try {
            await saveCostAssistantSettings(user.id, { 
                columnVisibility: state.columnVisibility,
                discountHandling: state.discountHandling,
            });
            toast({ title: "Preferencia Guardada", description: "La visibilidad de las columnas y el manejo de descuentos han sido guardados." });
        } catch (error: any) {
            logError("Failed to save cost assistant settings", { error: error.message });
            toast({ title: "Error", description: "No se pudo guardar la configuración.", variant: "destructive" });
        }
    };

    const handleClear = () => {
        setState(prevState => ({
            ...initialState, 
            columnVisibility: prevState.columnVisibility,
            discountHandling: prevState.discountHandling,
            drafts: prevState.drafts, // Keep drafts loaded
        }));
        toast({ title: "Operación Limpiada", description: "Se han borrado todos los datos para iniciar un nuevo análisis." });
    };

    const handleExportToERP = async () => {
        if (state.lines.length === 0) {
            toast({ title: 'No hay datos', description: 'No hay artículos para exportar.', variant: 'destructive' });
            return;
        }
        setState(prevState => ({ ...prevState, exportStatus: 'generating' }));
        try {
            const fileName = await exportForERP(state.lines, state.columnVisibility);
            setState(prevState => ({ ...prevState, exportStatus: 'ready', exportFileName: fileName }));
            toast({ title: 'Exportación Lista', description: 'Tu archivo está listo para ser descargado.' });
        } catch (error: any) {
            logError("Failed to export for ERP", { error: error.message });
            setState(prevState => ({ ...prevState, exportStatus: 'idle' }));
            toast({ title: "Error de Exportación", description: error.message, variant: "destructive" });
        }
    };

     const handleFinalizeExport = async () => {
        if (!state.exportFileName) return;
        try {
            await cleanupExportFile(state.exportFileName);
            setState(prevState => ({ ...prevState, exportStatus: 'idle', exportFileName: null }));
            toast({ title: 'Exportación Finalizada', description: 'El archivo temporal ha sido eliminado del servidor.' });
        } catch (error: any) {
            logError("Failed to cleanup export file", { error: error.message });
            // Even if cleanup fails, reset UI state
            setState(prevState => ({ ...prevState, exportStatus: 'idle', exportFileName: null }));
            toast({ title: "Error de Limpieza", description: `No se pudo eliminar el archivo del servidor. ${error.message}`, variant: "destructive" });
        }
    };
    
    // --- Drafts ---
    const loadDrafts = async () => {
        if (!user) return;
        try {
            const draftsFromDb = await getAllDrafts(user.id);
            setState(prevState => ({ ...prevState, drafts: draftsFromDb }));
        } catch (error: any) {
            logError("Failed to load drafts", { error: error.message });
            toast({ title: "Error", description: "No se pudieron cargar los borradores.", variant: "destructive" });
        }
    };

    const saveDraftAction = async () => {
        if (!user) return;
        
        if (state.lines.length === 0) {
            toast({ title: "Sin datos", description: "No puedes guardar un análisis vacío.", variant: "destructive" });
            return;
        }
        
        setState(prevState => ({ ...prevState, isSubmitting: true }));

        const settings = await getCostAssistantSettings(user.id);
        const defaultName = `${settings.draftPrefix || 'AC-'}${String(settings.nextDraftNumber || 1).padStart(5, '0')} - Borrador de Costos`;
        const draftName = prompt("Asigna un nombre a este borrador:", defaultName);

        if (!draftName) {
            setState(prevState => ({ ...prevState, isSubmitting: false }));
            return; // User cancelled prompt
        }

        const newDraft: Omit<CostAnalysisDraft, 'id' | 'createdAt'> = {
            userId: user.id,
            name: draftName,
            lines: state.lines.map(({ displayMargin, displayTaxRate, displayUnitsPerPack, ...line }) => line), // Remove display fields
            globalCosts: {
                transportCost: state.transportCost,
                otherCosts: state.otherCosts,
            },
            processedInvoices: state.processedInvoices,
            discountHandling: state.discountHandling,
        };

        try {
            await saveDraft(newDraft);
            toast({ title: "Borrador Guardado", description: `El análisis "${draftName}" ha sido guardado.` });
            await loadDrafts(); // Refresh draft list
        } catch (error: any) {
            logError("Failed to save draft", { error: error.message });
            toast({ title: "Error", description: "No se pudo guardar el borrador.", variant: "destructive" });
        } finally {
            setState(prevState => ({ ...prevState, isSubmitting: false }));
        }
    };
    
    const loadDraft = (draftToLoad: CostAnalysisDraft) => {
        // Re-create display fields from the loaded data
        const linesWithDisplay = draftToLoad.lines.map(line => ({
            ...line,
            displayMargin: (line.margin * 100).toFixed(2),
            displayTaxRate: (line.taxRate * 100).toFixed(0),
            displayUnitsPerPack: String(line.unitsPerPack || 1),
        }));

        setState(prevState => ({
            ...prevState,
            lines: linesWithDisplay,
            transportCost: draftToLoad.globalCosts.transportCost,
            otherCosts: draftToLoad.globalCosts.otherCosts,
            processedInvoices: draftToLoad.processedInvoices,
            discountHandling: draftToLoad.discountHandling || 'company' // Restore discount handling, default if not present
        }));
        toast({ title: "Borrador Cargado", description: `Se ha cargado el análisis "${draftToLoad.name}".` });
    };

    const deleteDraftAction = async (id: string) => {
        try {
            await deleteDraft(id);
            setState(prevState => ({
                ...prevState,
                drafts: prevState.drafts.filter(d => d.id !== id)
            }));
            toast({ title: "Borrador Eliminado", variant: "destructive" });
        } catch (error: any) {
            logError("Failed to delete draft", { error: error.message });
            toast({ title: "Error", description: "No se pudo eliminar el borrador.", variant: "destructive" });
        }
    };

    const linesWithCalculatedCosts = useMemo(() => {
        const totalProratableValue = state.lines.reduce((sum, line) => {
            // CORRECTED: Always use the net cost (xmlPackCost) for the proration base.
            return sum + (line.xmlPackCost * line.originalQuantity);
        }, 0);

        const totalAdditionalCosts = state.transportCost + state.otherCosts;
    
        return state.lines.map(line => {
            let baseCostPerPack = line.xmlPackCost; 
            if (state.discountHandling === 'company') {
                baseCostPerPack = line.xmlGrossPackCost;
            }
            
            const proratedAdditionalCostPerPack = totalProratableValue > 0
                ? (line.xmlPackCost / totalProratableValue) * totalAdditionalCosts
                : 0;
            
            const totalCostPerPack = baseCostPerPack + proratedAdditionalCostPerPack;
            
            const finalUnitCostWithoutTax = line.unitsPerPack > 0
                ? totalCostPerPack / line.unitsPerPack
                : 0;
    
            const sellPriceWithoutTax = finalUnitCostWithoutTax / (1 - line.margin);
            const finalSellPrice = sellPriceWithoutTax * (1 + line.taxRate);
            
            const profitPerUnit = sellPriceWithoutTax - finalUnitCostWithoutTax;
            const profitPerLine = profitPerUnit * line.quantity;
    
            return {
                ...line,
                unitCostWithoutTax: roundTo4Decimals(finalUnitCostWithoutTax),
                finalSellPrice: roundTo4Decimals(finalSellPrice),
                sellPriceWithoutTax: roundTo4Decimals(sellPriceWithoutTax),
                profitPerLine: roundTo4Decimals(profitPerLine),
            };
        });
    }, [state.lines, state.transportCost, state.otherCosts, state.discountHandling]);
    
    useEffect(() => {
        if (JSON.stringify(state.lines) !== JSON.stringify(linesWithCalculatedCosts)) {
             setState(prevState => ({...prevState, lines: linesWithCalculatedCosts }));
        }
    }, [linesWithCalculatedCosts, state.lines]);

    const totals = useMemo(() => {
        const totalPurchaseCost = state.lines.reduce((sum, line) => sum + (line.xmlGrossPackCost * line.originalQuantity), 0);
        const totalAdditionalCosts = state.transportCost + state.otherCosts;
        const totalFinalCost = state.lines.reduce((sum, line) => sum + (line.unitCostWithoutTax * line.quantity), 0);
        const totalSellValue = state.lines.reduce((sum, line) => sum + (line.finalSellPrice * line.quantity), 0);
        const estimatedGrossProfit = totalSellValue - totalFinalCost;

        return {
            totalPurchaseCost: roundTo4Decimals(totalPurchaseCost),
            totalAdditionalCosts: roundTo4Decimals(totalAdditionalCosts),
            totalFinalCost: roundTo4Decimals(totalFinalCost),
            totalSellValue: roundTo4Decimals(totalSellValue),
            estimatedGrossProfit: roundTo4Decimals(estimatedGrossProfit)
        };
    }, [state.lines, state.transportCost, state.otherCosts]);

    const selectors = {
        columns: useMemo(() => [
            { id: 'cabysCode', label: 'Cabys', className: 'min-w-[150px]' },
            { id: 'supplierCode', label: 'Cód. Prov.', className: 'min-w-[150px]' },
            { id: 'description', label: 'Descripción', className: 'min-w-[400px]' },
            { id: 'originalQuantity', label: 'Cant. XML', tooltip: 'La cantidad que aparece en la factura XML.', className: 'w-[120px] text-right' },
            { id: 'unitsPerPack', label: 'Uds/Paq', tooltip: 'Unidades por paquete/caja para desglose de costo.', className: 'w-[100px] text-right' },
            { id: 'quantity', label: 'Cant. Total', className: 'w-[120px] text-right font-bold' },
            { id: 'discountAmountUnit', label: 'Desc. Unit. (s/IVA)', tooltip: 'Descuento por unidad, sin IVA.', className: 'w-[150px] text-right' },
            { id: 'discountPercentage', label: 'Desc. %', tooltip: 'Porcentaje de descuento sobre el costo bruto.', className: 'w-[120px] text-right' },
            { id: 'xmlGrossPackCost', label: 'Costo Paq. Bruto (s/IVA)', tooltip: 'Costo por paquete/caja según factura XML, antes de descuentos.', className: 'w-[180px] text-right' },
            { id: 'xmlPackCost', label: 'Costo Paq. Neto (s/IVA)', tooltip: 'Costo por paquete/caja según factura XML, después de descuentos.', className: 'w-[180px] text-right' },
            { id: 'unitCostWithoutTax', label: 'Costo Unit. Final (s/IVA)', tooltip: 'Costo por unidad individual, prorrateado y después de descuentos.', className: 'w-[180px] text-right' },
            { id: 'taxRate', label: 'Imp. % (s/IVA)', className: 'min-w-[120px] text-center' },
            { id: 'margin', label: 'Margen %', className: 'min-w-[120px] text-center' },
            { id: 'sellPriceWithoutTax', label: 'PVP Unit. (s/IVA)', tooltip: 'Precio de venta sugerido por unidad antes de impuestos.', className: 'w-[180px] text-right' },
            { id: 'finalSellPrice', label: 'PVP Final (c/IVA)', tooltip: 'Precio de venta final sugerido, con IVA incluido.', className: 'w-[180px] text-right' },
            { id: 'profitPerLine', label: 'Ganancia Bruta (s/IVA)', tooltip: 'Ganancia total estimada para esta línea de producto (Venta Neta - Costo Total Final).', className: 'w-[180px] text-right' },
        ], [])
    };

    const actions = {
        removeLine,
        updateLine,
        handleMarginBlur,
        handleTaxRateBlur,
        handleUnitsPerPackBlur,
        formatCurrency,
        handleClear,
        openFileDialog,
        onFileSelected,
        setTransportCost: (cost: number) => setState(prevState => ({ ...prevState, transportCost: cost })),
        setOtherCosts: (cost: number) => setState(prevState => ({ ...prevState, otherCosts: cost })),
        setColumnVisibility,
        handleSaveColumnVisibility,
        handleExportToERP,
        loadDrafts,
        saveDraft: saveDraftAction,
        loadDraft,
        deleteDraft: deleteDraftAction,
        handleFinalizeExport,
        setDiscountHandling: (value: 'customer' | 'company') => setState(prevState => ({ ...prevState, discountHandling: value })),
    };

    return {
        state: { ...state, totals, fileInputRef },
        actions,
        selectors,
    };
};
