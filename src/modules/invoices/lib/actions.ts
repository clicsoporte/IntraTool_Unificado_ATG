/**
 * @fileoverview Server Actions for the new Invoice Reporter module.
 * These functions handle server-side logic like processing XML files.
 */
'use server';

import { XMLParser } from 'fast-xml-parser';
import type { InvoiceReportLine, ProcessedInvoiceInfo } from '@/modules/core/types';
import { logError } from '@/modules/core/lib/logger';
import { authorizeAction } from '@/modules/core/lib/auth-guard';

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

// This is the data structure for a single processed invoice.
export interface ProcessedInvoicePayload {
    info: Omit<ProcessedInvoiceInfo, 'status' | 'errorMessage'>;
    summary: {
        totalVentaNeta: number;
        totalImpuesto: number;
        totalComprobante: number;
    };
    lines: Omit<InvoiceReportLine, 'id' | 'isSelected'>[];
}


async function parseInvoice(xmlContent: string, fileIndex: number): Promise<{ data: ProcessedInvoicePayload; invoiceInfo: Omit<ProcessedInvoiceInfo, 'status' | 'errorMessage'> } | { error: string, details: Partial<Omit<ProcessedInvoiceInfo, 'status' | 'errorMessage'>> }> {
    
    if (xmlContent.includes('MensajeHacienda')) {
        return { error: 'El archivo es una respuesta de Hacienda, no una factura.', details: {} };
    }

    const parser = new XMLParser({
        ignoreAttributes: true,
        removeNSPrefix: true, 
        parseTagValue: false, 
        isArray: (tagName) => ['LineaDetalle', 'CodigoComercial'].includes(tagName),
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
    const lines: Omit<InvoiceReportLine, 'id' | 'isSelected'>[] = [];
    
    if (detalleServicio && detalleServicio.LineaDetalle) {
        const lineasDetalle = Array.isArray(detalleServicio.LineaDetalle) ? detalleServicio.LineaDetalle : [detalleServicio.LineaDetalle];
        
        for (const linea of lineasDetalle) {
            const cantidad = roundTo4Decimals(parseDecimal(getValue(linea, ['Cantidad'], '0')));
            if (cantidad === 0) continue;

            const codigosComerciales = linea.CodigoComercial || [];
            let itemCode = 'N/A';
            const preferredCodeNode = codigosComerciales.find((c: any) => c.Tipo === '01'); // Prioritize supplier's code
            if (preferredCodeNode && preferredCodeNode.Codigo) {
                itemCode = String(preferredCodeNode.Codigo).toUpperCase();
            } else if (codigosComerciales[0]?.Codigo) {
                itemCode = String(codigosComerciales[0].Codigo).toUpperCase();
            }


            const montoTotalLinea = roundTo4Decimals(parseDecimal(getValue(linea, ['MontoTotalLinea'], '0')));
            const subTotal = roundTo4Decimals(parseDecimal(getValue(linea, ['SubTotal'], '0')));
            
            const unitPriceFromXml = roundTo4Decimals(parseDecimal(getValue(linea, ['PrecioUnitario'], '0')));

            const impuestoNode = getValue(linea, ['Impuesto']);
            const taxRate = impuestoNode ? roundTo4Decimals(parseDecimal(getValue(impuestoNode, ['Tarifa'], '0')) / 100) : 0;
            
            let unitPrice;
            if (unitPriceFromXml > 0) {
                unitPrice = unitPriceFromXml;
            } else {
                unitPrice = cantidad > 0 ? roundTo4Decimals(subTotal / cantidad) : 0;
            }
            
            const unitPriceWithTax = cantidad > 0 ? roundTo4Decimals(montoTotalLinea / cantidad) : 0;

            const rawDescription = getValue(linea, ['Detalle']);
            const cleanDescription = rawDescription.split(';')[0].trim();

            lines.push({
                invoiceKey: numeroConsecutivo,
                invoiceNumber: numeroConsecutivo,
                supplierName: emisorNombre,
                invoiceDate: fechaEmision,
                itemCode: itemCode,
                itemDescription: cleanDescription,
                quantity: cantidad,
                unitPrice: unitPrice,
                unitPriceWithTax: unitPriceWithTax,
                totalLine: subTotal,
                totalLineWithTax: montoTotalLinea,
                taxRate: taxRate,
            });
        }
    }

    const resumenFactura = getValue(rootNode, ['ResumenFactura'], {});
    const summary = {
        totalVentaNeta: roundTo4Decimals(parseDecimal(getValue(resumenFactura, ['TotalVentaNeta'], '0'))),
        totalImpuesto: roundTo4Decimals(parseDecimal(getValue(resumenFactura, ['TotalImpuesto'], '0'))),
        totalComprobante: roundTo4Decimals(parseDecimal(getValue(resumenFactura, ['TotalComprobante'], '0'))),
    };

    return { 
        data: {
            info: invoiceInfo,
            summary,
            lines,
        },
        invoiceInfo 
    };
}


export async function processInvoicesForReport(xmlContents: string[]): Promise<{ 
    processedInvoices: ProcessedInvoicePayload[], 
    statusReport: ProcessedInvoiceInfo[] 
}> {
    await authorizeAction('invoices:access');
    const processedInvoicePayloads: ProcessedInvoicePayload[] = [];
    const statusReport: ProcessedInvoiceInfo[] = [];

    for (const [index, xmlContent] of xmlContents.entries()) {
        try {
            const result = await parseInvoice(xmlContent, index);
            if ('data' in result) {
                processedInvoicePayloads.push(result.data);
                statusReport.push({ ...result.invoiceInfo, status: 'success' });
            } else {
                 statusReport.push({
                    supplierName: result.details.supplierName || 'Desconocido',
                    invoiceNumber: result.details.invoiceNumber || `Archivo ${index + 1}`,
                    invoiceDate: result.details.invoiceDate || new Date().toISOString(),
                    status: 'error',
                    errorMessage: result.error,
                });
            }
        } catch (error: any) {
            statusReport.push({
                supplierName: 'Desconocido',
                invoiceNumber: `Archivo ${index + 1}`,
                invoiceDate: new Date().toISOString(),
                status: 'error',
                errorMessage: 'XML malformado o ilegible',
            });
        }
    }
    
    return JSON.parse(JSON.stringify({ processedInvoices: processedInvoicePayloads, statusReport }));
}
