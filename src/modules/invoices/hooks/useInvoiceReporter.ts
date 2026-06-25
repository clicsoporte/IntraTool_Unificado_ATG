/**
 * @fileoverview Custom hook for managing the state and logic of the Invoice Reporter page.
 */
'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import type { InvoiceReportLine, ProcessedInvoiceInfo } from '@/modules/core/types';
import { processInvoicesForReport, type ProcessedInvoicePayload } from '../lib/actions';
import { logError } from '@/modules/core/lib/logger';
import { exportToExcel } from '@/lib/excel-export';
import { format, parseISO, isValid } from 'date-fns';

type ViewMode = 'detailed' | 'summary';

const roundTo4Decimals = (num: number): number => {
    return Math.round(num * 10000) / 10000;
};

export interface UiInvoiceReportLine extends InvoiceReportLine {
    // This type inherits from the core InvoiceReportLine
}

export interface UiProcessedInvoice extends ProcessedInvoicePayload {
    isSelected: boolean; // For summary view selection
    lines: UiInvoiceReportLine[];
}

export interface InvoiceSummary {
    id: string; // invoice number used as unique key
    isSelected: boolean;
    invoiceNumber: string;
    supplierName: string;
    invoiceDate: string;
    totalVentaNeta: number;
    totalImpuesto: number;
    totalComprobante: number;
}

const initialState = {
    isProcessing: false,
    processedData: [] as UiProcessedInvoice[],
    statusReport: [] as ProcessedInvoiceInfo[],
    viewMode: 'detailed' as ViewMode,
};

export const useInvoiceReporter = () => {
    usePageTitle().setTitle("Reporteador de Facturas");
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [state, setState] = useState(initialState);

    const onFileSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return;
        
        const acceptedFiles = Array.from(event.target.files);
        setState(prevState => ({ ...prevState, isProcessing: true }));
        
        try {
            const fileContents = await Promise.all(
                acceptedFiles.map(file => new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsText(file);
                }))
            );
            
            const { processedInvoices: newProcessedData, statusReport: newStatusReport } = await processInvoicesForReport(fileContents);
            
            const newUiData: UiProcessedInvoice[] = newProcessedData.map(invoice => ({
                ...invoice,
                isSelected: true, // Default to selected for summary view
                lines: invoice.lines.map((line, lineIndex) => ({
                    ...line,
                    id: `${invoice.info.invoiceNumber}-${lineIndex}`,
                    isSelected: true, // Default to selected for detailed view
                })),
            }));

            setState(prevState => ({ 
                ...prevState, 
                processedData: [...prevState.processedData, ...newUiData],
                statusReport: [...prevState.statusReport, ...newStatusReport],
            }));
            const successCount = newStatusReport.filter(p => p.status === 'success').length;
            toast({ title: "Facturas Procesadas", description: `Se procesaron ${successCount} factura(s) exitosamente.` });

        } catch (error: any) {
            logError("Error processing invoice XMLs for reporter", { error: error.message });
            toast({ title: "Error al Procesar Archivos", description: error.message, variant: "destructive" });
        } finally {
            setState(prevState => ({ ...prevState, isProcessing: false }));
        }
    }, [toast]);
    
    const openFileDialog = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
            fileInputRef.current.click();
        }
    };

    const updateLine = (id: string, updatedFields: Partial<UiInvoiceReportLine>) => {
        setState(prevState => ({
            ...prevState,
            processedData: prevState.processedData.map(invoice => {
                const hasLine = invoice.lines.some(line => line.id === id);
                if (!hasLine) return invoice;

                const updatedLines = invoice.lines.map(line => {
                    if (line.id !== id) return line;

                    let newLine = { ...line, ...updatedFields };
                    const taxRate = newLine.taxRate !== undefined ? newLine.taxRate : 0;

                    if ('quantity' in updatedFields || 'unitPrice' in updatedFields) {
                        newLine.unitPrice = roundTo4Decimals(newLine.unitPrice);
                        newLine.quantity = roundTo4Decimals(newLine.quantity);
                        newLine.unitPriceWithTax = roundTo4Decimals(newLine.unitPrice * (1 + taxRate));
                        newLine.totalLine = roundTo4Decimals(newLine.quantity * newLine.unitPrice);
                        newLine.totalLineWithTax = roundTo4Decimals(newLine.quantity * newLine.unitPriceWithTax);
                    } else if ('unitPriceWithTax' in updatedFields) {
                        newLine.unitPriceWithTax = roundTo4Decimals(newLine.unitPriceWithTax);
                        newLine.unitPrice = roundTo4Decimals(newLine.unitPriceWithTax / (1 + taxRate));
                        newLine.totalLine = roundTo4Decimals(newLine.quantity * newLine.unitPrice);
                        newLine.totalLineWithTax = roundTo4Decimals(newLine.quantity * newLine.unitPriceWithTax);
                    } else if ('totalLine' in updatedFields) {
                        newLine.totalLine = roundTo4Decimals(newLine.totalLine);
                        newLine.unitPrice = roundTo4Decimals(newLine.quantity > 0 ? newLine.totalLine / newLine.quantity : 0);
                        newLine.unitPriceWithTax = roundTo4Decimals(newLine.unitPrice * (1 + taxRate));
                        newLine.totalLineWithTax = roundTo4Decimals(newLine.totalLine * (1 + taxRate));
                    } else if ('totalLineWithTax' in updatedFields) {
                        newLine.totalLineWithTax = roundTo4Decimals(newLine.totalLineWithTax);
                        newLine.totalLine = roundTo4Decimals(newLine.totalLineWithTax / (1 + taxRate));
                        newLine.unitPriceWithTax = roundTo4Decimals(newLine.quantity > 0 ? newLine.totalLineWithTax / newLine.quantity : 0);
                        newLine.unitPrice = roundTo4Decimals(newLine.unitPriceWithTax / (1 + taxRate));
                    }

                    return newLine;
                });

                return {
                    ...invoice,
                    lines: updatedLines,
                };
            }),
        }));
    };

    const toggleSelected = (id: string, isChecked: boolean) => {
        if (state.viewMode === 'detailed') {
            setState(prevState => ({
                ...prevState,
                processedData: prevState.processedData.map(invoice => ({
                    ...invoice,
                    lines: invoice.lines.map(line =>
                        line.id === id ? { ...line, isSelected: isChecked } : line
                    ),
                })),
            }));
        } else { // Summary mode
            setState(prevState => ({
                ...prevState,
                processedData: prevState.processedData.map(invoice =>
                    invoice.info.invoiceNumber === id ? { ...invoice, isSelected: isChecked } : invoice
                ),
            }));
        }
    };
    
    const toggleAllSelected = (isChecked: boolean) => {
        if (state.viewMode === 'detailed') {
            setState(prevState => ({
                ...prevState,
                processedData: prevState.processedData.map(invoice => ({
                    ...invoice,
                    lines: invoice.lines.map(line => ({...line, isSelected: isChecked})),
                })),
            }));
        } else { // Summary mode
            setState(prevState => ({
                ...prevState,
                processedData: prevState.processedData.map(invoice => ({...invoice, isSelected: isChecked})),
            }));
        }
    };

    const handleClear = () => {
        setState(initialState);
        toast({ title: "Limpiado", description: "Se han borrado todos los datos del reporteador." });
    };

    const handleExport = () => {
        if (state.viewMode === 'detailed') {
            const selectedLines = selectors.detailedLines.filter(line => line.isSelected);
            if (selectedLines.length === 0) {
                toast({ title: "Sin Líneas Seleccionadas", description: "Marca las líneas que deseas exportar.", variant: "destructive" });
                return;
            }
            const headers = ["Nº Factura", "Proveedor", "Fecha Emisión", "Código Artículo", "Descripción", "Cantidad", "Precio Unitario (s/IVA)", "Precio Unitario (c/IVA)", "Total Línea (s/IVA)", "Total Línea (c/IVA)", "% Imp."];
            const dataToExport = selectedLines.map(line => [
                line.invoiceNumber, line.supplierName, format(parseISO(line.invoiceDate), 'dd/MM/yyyy'), line.itemCode,
                line.itemDescription, line.quantity, line.unitPrice, line.unitPriceWithTax, line.totalLine, line.totalLineWithTax,
                line.taxRate !== undefined ? (line.taxRate * 100) : '-'
            ]);
            exportToExcel({ fileName: 'reporte_facturas_detallado', sheetName: 'Facturas Detalle', title: 'Reporte Detallado de Facturas Seleccionadas', data: dataToExport, headers: headers, columnWidths: [25, 30, 15, 20, 40, 10, 20, 20, 20, 20, 10] });
        } else { // Summary mode
            const selectedSummaries = selectors.summaryLines.filter(s => s.isSelected);
             if (selectedSummaries.length === 0) {
                toast({ title: "Sin Facturas Seleccionadas", description: "Marca las facturas que deseas exportar.", variant: "destructive" });
                return;
            }
            const headers = ["Nº Factura", "Proveedor", "Fecha Emisión", "Venta Neta", "Impuesto", "Total Comprobante"];
            const dataToExport = selectedSummaries.map(s => [
                s.invoiceNumber, s.supplierName, format(parseISO(s.invoiceDate), 'dd/MM/yyyy'),
                s.totalVentaNeta, s.totalImpuesto, s.totalComprobante
            ]);
            exportToExcel({ fileName: 'reporte_facturas_resumido', sheetName: 'Facturas Resumen', title: 'Reporte Resumido de Facturas Seleccionadas', data: dataToExport, headers: headers, columnWidths: [25, 30, 15, 20, 20, 20] });
        }
    };
    
    const selectors = {
        detailedLines: useMemo(() => state.processedData.flatMap(invoice => invoice.lines), [state.processedData]),
        summaryLines: useMemo(() => state.processedData.map(invoice => {
            const activeLines = invoice.lines.filter(l => l.isSelected);
            const totalVentaNeta = roundTo4Decimals(activeLines.reduce((sum, l) => sum + l.totalLine, 0));
            const totalComprobante = roundTo4Decimals(activeLines.reduce((sum, l) => sum + l.totalLineWithTax, 0));
            const totalImpuesto = roundTo4Decimals(totalComprobante - totalVentaNeta);

            return {
                id: invoice.info.invoiceNumber,
                isSelected: invoice.isSelected,
                invoiceNumber: invoice.info.invoiceNumber,
                supplierName: invoice.info.supplierName,
                invoiceDate: invoice.info.invoiceDate,
                totalVentaNeta,
                totalImpuesto,
                totalComprobante,
            };
        }), [state.processedData]),
        areAllDetailedSelected: useMemo(() => {
            const allLines = state.processedData.flatMap(inv => inv.lines);
            return allLines.length > 0 && allLines.every(l => l.isSelected);
        }, [state.processedData]),
        areAllSummarySelected: useMemo(() => state.processedData.length > 0 && state.processedData.every(inv => inv.isSelected), [state.processedData]),
    };
    
    const actions = {
        openFileDialog,
        onFileSelected,
        updateLine,
        toggleSelected,
        toggleAllSelected,
        handleClear,
        handleExport,
        setViewMode: (mode: ViewMode) => setState(prevState => ({...prevState, viewMode: mode})),
    };

    return {
        state: { ...state, fileInputRef },
        actions,
        selectors,
    };
};
