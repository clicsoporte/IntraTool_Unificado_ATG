/**
 * @fileoverview Server Actions for the Cost Assistant module.
 * These functions handle server-side logic like processing XML files,
 * interacting with the database, and generating export files.
 */
'use server';

import { XMLParser } from 'fast-xml-parser';
import type { CostAssistantLine, ProcessedInvoiceInfo, CostAnalysisDraft, CostAssistantSettings, DraftableCostAssistantLine } from '@/modules/core/types';
import { 
    getAllDrafts as getAllDraftsServer, 
    saveDraft as saveDraftServer, 
    deleteDraft as deleteDraftServer, 
    getCostAssistantDbSettings as getDbSettings,
    saveCostAssistantDbSettings as saveDbSettings,
} from './db';
import { logError, logInfo } from '@/modules/core/lib/logger';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';
import { authorizeAction } from '@/modules/core/lib/auth-guard';

type ColumnVisibility = CostAssistantSettings['columnVisibility'];

const ALL_EXPORT_COLUMNS: { id: keyof ColumnVisibility, label: string, width: number }[] = [
    { id: 'cabysCode', label: 'Cabys', width: 15 },
    { id: 'supplierCode', label: 'Cód. Artículo', width: 15 },
    { id: 'description', label: 'Descripción', width: 40 },
    { id: 'originalQuantity', label: 'Cant. Original (XML)', width: 12 },
    { id: 'unitsPerPack', label: 'Uds/Paq', width: 10 },
    { id: 'quantity', label: 'Cant. Total', width: 12 },
    { id: 'discountAmountUnit', label: 'Desc. Unit. (s/IVA)', width: 15 },
    { id: 'discountPercentage', label: 'Desc. %', width: 10 },
    { id: 'xmlGrossPackCost', label: 'Costo Paq. Bruto', width: 15 },
    { id: 'xmlPackCost', label: 'Costo Paq. Neto', width: 15 },
    { id: 'unitCostWithoutTax', label: 'Costo Unit. Final (s/IVA)', width: 20 },
    { id: 'taxRate', label: 'Imp. %', width: 10 },
    { id: 'margin', label: 'Margen %', width: 10 },
    { id: 'sellPriceWithoutTax', label: 'P.V.P Unit. (s/IVA)', width: 22 },
    { id: 'finalSellPrice', label: 'P.V.P Unitario Sugerido', width: 22 },
    { id: 'profitPerLine', label: 'Ganancia por Línea', width: 20 },
];

// Helper to get and format the value for a specific column
function getColumnValue(line: CostAssistantLine, colId: keyof ColumnVisibility): string | number {
    switch (colId) {
        case 'cabysCode': return line.cabysCode;
        case 'supplierCode': return line.supplierCode;
        case 'description': return line.description;
        case 'originalQuantity': return line.originalQuantity;
        case 'unitsPerPack': return line.unitsPerPack;
        case 'quantity': return line.quantity;
        case 'discountAmountUnit': return line.discountAmountUnit;
        case 'discountPercentage': return `${(line.discountPercentage * 100).toFixed(2)}%`;
        case 'xmlGrossPackCost': return line.xmlGrossPackCost;
        case 'xmlPackCost': return line.xmlPackCost;
        case 'unitCostWithoutTax': return line.unitCostWithoutTax;
        case 'taxRate': return line.taxRate * 100;
        case 'margin': return `${(line.margin * 100).toFixed(2)}%`;
        case 'sellPriceWithoutTax': return line.sellPriceWithoutTax;
        case 'finalSellPrice': return line.finalSellPrice;
        case 'profitPerLine': return line.profitPerLine;
        default: return '';
    }
}


// Helper to get a value from a potentially nested object
const getValue = (obj: any, path: string[], defaultValue: any = '') => {
    return path.reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : defaultValue, obj);
};

const parseDecimal = (str: any): number => {
    if (str === null || str === undefined || str === '') return 0;
    const s = String(str).trim();
    
    if (s.includes(',')) {
        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }
    
    return parseFloat(s);
};

const roundTo4Decimals = (num: number): number => {
    return Math.round(num * 10000) / 10000;
};


interface InvoiceParseResult {
    lines: Omit<CostAssistantLine, 'displayMargin' | 'displayTaxRate' | 'displayUnitCost' | 'displayUnitsPerPack' | 'finalSellPrice' | 'profitPerLine' | 'sellPriceWithoutTax' | 'isCostEdited'>[];
    invoiceInfo: Omit<ProcessedInvoiceInfo, 'status' | 'errorMessage'>;
}

async function parseInvoice(xmlContent: string, fileIndex: number): Promise<InvoiceParseResult | { error: string, details: Partial<ProcessedInvoiceInfo> }> {
    
    if (xmlContent.includes('MensajeHacienda')) {
        return { error: 'El archivo es una respuesta de Hacienda, no una factura.', details: {} };
    }

    const parser = new XMLParser({
        ignoreAttributes: true,
        removeNSPrefix: true, 
        parseTagValue: false, 
        isArray: (tagName) => {
            const alwaysArray = ['LineaDetalle', 'CodigoComercial'];
            return alwaysArray.includes(tagName);
        },
    });

    let json;
    try {
        json = parser.parse(xmlContent);
    } catch (e: any) {
        logError('XML parsing failed', { error: e.message, content: xmlContent.substring(0, 500) });
        return { error: 'XML malformado o ilegible.', details: {} };
    }
    
    const rootNode = json.FacturaElectronica || json.TiqueteElectronico;
    
    if (!rootNode) {
        const detectedRoot = Object.keys(json)[0] || 'N/A';
        logError('Invalid XML structure for invoice', { detectedRoot });
        if (detectedRoot === 'html' || detectedRoot.startsWith('?xml')) {
            return { error: 'El archivo es un documento HTML o XML inválido, no una factura.', details: {} };
        }
        return { error: `No es un archivo de factura válido. Nodo raíz no encontrado: ${detectedRoot}`, details: {} };
    }
    
    const clave = getValue(rootNode, ['Clave'], `unknown-key-${fileIndex}`);
    const numeroConsecutivo = getValue(rootNode, ['NumeroConsecutivo'], clave.substring(21, 41));
    const fechaEmision = getValue(rootNode, ['FechaEmision'], new Date().toISOString());
    const emisorNombre = getValue(rootNode, ['Emisor', 'Nombre'], 'Desconocido');

    const invoiceInfo = {
        supplierName: emisorNombre,
        invoiceNumber: numeroConsecutivo,
        invoiceDate: fechaEmision,
    };

    const detalleServicio = getValue(rootNode, ['DetalleServicio']);
    if (!detalleServicio || !detalleServicio.LineaDetalle) {
        return { lines: [], invoiceInfo };
    }

    const lineasDetalle = Array.isArray(detalleServicio.LineaDetalle) ? detalleServicio.LineaDetalle : [detalleServicio.LineaDetalle];

    const moneda = getValue(rootNode, ['ResumenFactura', 'CodigoTipoMoneda', 'CodigoMoneda'], 'CRC');
    const tipoCambioStr = getValue(rootNode, ['ResumenFactura', 'CodigoTipoMoneda', 'TipoCambio'], '1');
    const tipoCambio = parseDecimal(tipoCambioStr) || 1.0;


    const lines: Omit<CostAssistantLine, 'displayMargin' | 'displayTaxRate' | 'displayUnitCost' | 'displayUnitsPerPack' | 'finalSellPrice' | 'profitPerLine' | 'sellPriceWithoutTax' | 'isCostEdited'>[] = [];
    for (const [index, linea] of lineasDetalle.entries()) {
        const cantidad = parseDecimal(getValue(linea, ['Cantidad'], '0'));
        if (cantidad === 0) continue;
        
        let supplierCode = 'N/A';
        let supplierCodeType = '99'; // Default to 'Otros'
        const codigosComerciales = linea.CodigoComercial || []; // It's now always an array
        
        if (codigosComerciales.length > 0) {
            const preferredCodeNode = codigosComerciales.find((c: any) => c.Tipo === '01');
            if (preferredCodeNode && preferredCodeNode.Codigo) {
                supplierCode = preferredCodeNode.Codigo;
                supplierCodeType = preferredCodeNode.Tipo;
            } else if (codigosComerciales[0].Codigo) { // Fallback to the first available code
                supplierCode = codigosComerciales[0].Codigo;
                supplierCodeType = codigosComerciales[0].Tipo || '99';
            }
        }
        
        const cabysV43 = getValue(linea, ['Codigo']);
        const cabysV44 = getValue(linea, ['CodigoCABYS']);
        const cabysCode = cabysV44 || cabysV43 || 'N/A';
        
        const descuentoNode = getValue(linea, ['Descuento']);
        const discountAmount = descuentoNode ? parseDecimal(getValue(descuentoNode, ['MontoDescuento'], '0')) : 0;
        
        const subTotal = parseDecimal(getValue(linea, ['SubTotal'], '0'));
        const precioUnitario = parseDecimal(getValue(linea, ['PrecioUnitario'], '0'));

        const impuestoNode = getValue(linea, ['Impuesto']);
        let taxRate = 0.13;
        let taxCode = '08';
        if (impuestoNode) {
            taxRate = roundTo4Decimals(parseDecimal(getValue(impuestoNode, ['Tarifa'], '13')) / 100);
            taxCode = getValue(impuestoNode, ['CodigoTarifaIVA'], '08');
        }
        
        const unitGrossCostInColones = roundTo4Decimals(moneda === 'USD' ? precioUnitario * tipoCambio : precioUnitario);
        const discountAmountInColones = roundTo4Decimals(moneda === 'USD' ? discountAmount * tipoCambio : discountAmount);
        const netCostPerPack = cantidad > 0 ? (subTotal / cantidad) : 0;
        const netCostPerPackInColones = roundTo4Decimals(moneda === 'USD' ? netCostPerPack * tipoCambio : netCostPerPack);
        
        const discountAmountUnit = roundTo4Decimals(cantidad > 0 ? discountAmountInColones / cantidad : 0);
        const discountPercentage = roundTo4Decimals((unitGrossCostInColones * cantidad) > 0 ? discountAmountInColones / (unitGrossCostInColones * cantidad) : 0);
        
        const numeroLinea = getValue(linea, ['NumeroLinea'], index + 1);
        const rawDescription = getValue(linea, ['Detalle']);
        const cleanDescription = rawDescription.split(';')[0].trim();

        lines.push({
            id: `${numeroConsecutivo}-${numeroLinea}-${supplierCode}-${index}`,
            invoiceKey: numeroConsecutivo,
            lineNumber: numeroLinea,
            cabysCode: cabysCode,
            supplierCode: supplierCode,
            supplierCodeType: supplierCodeType,
            description: cleanDescription,
            originalQuantity: cantidad,
            unitsPerPack: 1,
            quantity: cantidad,
            discountAmount: discountAmountInColones,
            discountAmountUnit,
            discountPercentage,
            xmlGrossPackCost: unitGrossCostInColones,
            xmlPackCost: netCostPerPackInColones, // NET cost per pack/unit from XML in CRC
            unitCostWithoutTax: 0, // Placeholder, calculated on frontend
            taxRate,
            taxCode,
            margin: 0,
            supplierName: emisorNombre,
        });
    }

    return { lines, invoiceInfo };
}

export async function processInvoiceXmls(xmlContents: string[]): Promise<{ lines: Omit<CostAssistantLine, 'displayMargin' | 'displayTaxRate' | 'displayUnitCost' | 'displayUnitsPerPack' | 'finalSellPrice' | 'profitPerLine' | 'sellPriceWithoutTax' | 'isCostEdited'>[], processedInvoices: ProcessedInvoiceInfo[] }> {
    await authorizeAction('cost-assistant:access');
    let allLines: Omit<CostAssistantLine, 'displayMargin' | 'displayTaxRate' | 'displayUnitCost' | 'displayUnitsPerPack' | 'finalSellPrice' | 'profitPerLine' | 'sellPriceWithoutTax' | 'isCostEdited'>[] = [];
    const processedInvoices: ProcessedInvoiceInfo[] = [];

    for (const [index, xmlContent] of xmlContents.entries()) {
        try {
            const result = await parseInvoice(xmlContent, index);
            if (result && 'lines' in result) {
                allLines = [...allLines, ...result.lines];
                if (result.invoiceInfo.supplierName) { // Only add if it's a valid invoice
                    processedInvoices.push({
                        ...result.invoiceInfo,
                        status: 'success'
                    });
                }
            } else if (result && 'error' in result) {
                 processedInvoices.push({
                    supplierName: result.details.supplierName || 'Desconocido',
                    invoiceNumber: result.details.invoiceNumber || `Archivo ${index + 1}`,
                    invoiceDate: result.details.invoiceDate || new Date().toISOString(),
                    status: 'error',
                    errorMessage: result.error
                });
            }
        } catch (error: any) {
            console.error("Error parsing one of the XMLs:", error.message);
            processedInvoices.push({
                supplierName: 'Desconocido',
                invoiceNumber: `Archivo ${index + 1}`,
                invoiceDate: new Date().toISOString(),
                status: 'error',
                errorMessage: 'XML malformado o ilegible'
            });
        }
    }
    
    return JSON.parse(JSON.stringify({ lines: allLines, processedInvoices }));
}

const defaultSettings: CostAssistantSettings = {
    draftPrefix: 'AC-',
    nextDraftNumber: 1,
    columnVisibility: {
        cabysCode: true, supplierCode: true, description: true, originalQuantity: false, unitsPerPack: true, quantity: true,
        discountAmountUnit: true, discountPercentage: true, xmlGrossPackCost: false, xmlPackCost: false, unitCostWithoutTax: true, taxRate: true,
        margin: true, sellPriceWithoutTax: true, finalSellPrice: true, profitPerLine: true
    },
    discountHandling: 'company',
};

export async function getCostAssistantSettings(userId: number): Promise<CostAssistantSettings> {
    const userPrefs = await getUserPreferences(userId, 'costAssistantSettings');
    const dbSettings = await getDbSettings();
    const settings = { ...defaultSettings, ...dbSettings, ...userPrefs };
    return settings;
}

export async function saveCostAssistantSettings(userId: number, settings: Partial<CostAssistantSettings>): Promise<void> {
    const { draftPrefix, nextDraftNumber, ...userPrefs } = settings;
    await saveUserPreferences(userId, 'costAssistantSettings', userPrefs);
    
    const dbSettingsToSave: Partial<CostAssistantSettings> = {};
    if (draftPrefix !== undefined) dbSettingsToSave.draftPrefix = draftPrefix;
    if (nextDraftNumber !== undefined) dbSettingsToSave.nextDraftNumber = nextDraftNumber;
    
    if (Object.keys(dbSettingsToSave).length > 0) {
        await saveDbSettings(dbSettingsToSave);
    }
    await logInfo('Cost Assistant settings updated', { userId });
}

export async function getAllDrafts(userId: number): Promise<CostAnalysisDraft[]> {
    const drafts = await getAllDraftsServer(userId);
    return JSON.parse(JSON.stringify(drafts));
}

export async function saveDraft(draft: Omit<CostAnalysisDraft, 'id' | 'createdAt'>): Promise<void> {
    const settings = await getDbSettings();
    const draftPrefix = settings.draftPrefix || 'AC-';
    const nextDraftNumber = settings.nextDraftNumber || 1;
    await logInfo('Cost analysis draft saved', { name: draft.name, userId: draft.userId });
    await saveDraftServer(draft, draftPrefix, nextDraftNumber);
}

export async function deleteDraft(id: string): Promise<void> {
    await logInfo('Cost analysis draft deleted', { draftId: id });
    return deleteDraftServer(id);
}

export async function getNextDraftNumber(): Promise<number> {
    const settings = await getDbSettings();
    return settings.nextDraftNumber || 1;
}

export async function exportForERP(lines: CostAssistantLine[], columnVisibility: ColumnVisibility): Promise<string> {
    await authorizeAction('invoices:reporter:export');
    const visibleColumns = ALL_EXPORT_COLUMNS.filter(col => columnVisibility[col.id as keyof ColumnVisibility]);
    
    if (visibleColumns.length === 0) {
        throw new Error("No hay columnas seleccionadas para exportar.");
    }
    
    const headers = visibleColumns.map(col => col.label);
    
    const dataToExport = lines.map(line => 
        visibleColumns.map(col => getColumnValue(line, col.id as keyof ColumnVisibility))
    );

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataToExport]);
    
    worksheet['!cols'] = visibleColumns.map(col => ({ wch: col.width }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'AnalisisDeCostos');
    
    const exportDir = path.join(process.cwd(), 'temp_files', 'exports');
    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
    }
    
    const fileName = `analisis_costos_${Date.now()}.xlsx`;
    const filePath = path.join(exportDir, fileName);

    try {
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        fs.writeFileSync(filePath, buffer);
    } catch (error: any) {
        logError("Failed to save Excel file to disk", { error: error.message, path: filePath });
        throw new Error(`No se pudo guardar el archivo en la ruta del servidor: ${filePath}`);
    }
    
    return fileName;
}


export async function cleanupExportFile(fileName: string): Promise<void> {
    if (!fileName) {
        throw new Error("Filename is required");
    }
    const exportDir = path.join(process.cwd(), 'temp_files', 'exports');
    const filePath = path.join(exportDir, fileName);

    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (error: any) {
            logError("Failed to delete temporary export file", { error: error.message, file: fileName });
            throw new Error("Error del servidor al limpiar el archivo temporal.");
        }
    }
}
