'use client';

import * as XLSX from 'xlsx';

export interface ExportToExcelOptions {
    fileName: string;
    sheetName?: string;
    headers: string[];
    data: (string | number | null | undefined)[][];
    columnWidths?: number[];
    includeTimestampInFilename?: boolean;
}

/**
 * Motor Centralizado de Exportación a Excel (.xlsx) para Clic-Tools.
 * Genera archivos .xlsx nativos con formato limpio, auto-ajuste de ancho de columnas y cabeceras estructuradas.
 */
export const exportToExcel = ({
    fileName,
    sheetName = 'Datos',
    headers,
    data,
    columnWidths,
    includeTimestampInFilename = true,
}: ExportToExcelOptions) => {
    // 1. Create a new workbook
    const workbook = XLSX.utils.book_new();
    
    // 2. Pre-process rows to ensure clean string/number formatting
    const processedData = data.map(row => 
        row.map(cell => (cell === null || cell === undefined ? '' : cell))
    );

    const dataWithHeaders = [headers, ...processedData];

    // 3. Create worksheet from AOA
    const worksheet = XLSX.utils.aoa_to_sheet(dataWithHeaders);

    // 4. Calculate auto column widths if not provided
    if (columnWidths && columnWidths.length === headers.length) {
        worksheet['!cols'] = columnWidths.map(width => ({ wch: width }));
    } else {
        const autoWidths = headers.map((header, colIndex) => {
            let maxLen = header ? header.toString().length : 10;
            processedData.forEach(row => {
                const cellVal = row[colIndex];
                if (cellVal !== undefined && cellVal !== null) {
                    const len = cellVal.toString().length;
                    if (len > maxLen) {
                        maxLen = len;
                    }
                }
            });
            return { wch: Math.min(Math.max(maxLen + 3, 12), 60) }; // min 12, max 60 chars
        });
        worksheet['!cols'] = autoWidths;
    }

    // 5. Append worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // 6. Generate .xlsx filename
    const dateStr = new Date().toISOString().split('T')[0];
    const finalFilename = includeTimestampInFilename 
        ? `${fileName}_${dateStr}.xlsx` 
        : `${fileName}.xlsx`;

    // 7. Download file
    XLSX.writeFile(workbook, finalFilename);
};
