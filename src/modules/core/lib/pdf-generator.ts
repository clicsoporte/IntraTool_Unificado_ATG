/**
 * @fileoverview Centralized PDF generation service for the entire application.
 * This module provides a single, configurable function to create consistent and
 * professional-looking PDF documents for quotes, production orders, and purchase requests.
 */
import jsPDF from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import { format, parseISO } from 'date-fns';
import type { Company } from '../types';

export interface DocumentData {
    docTitle: string;
    docId: string;
    meta: { label: string; value: string }[];
    companyData: Company;
    logoDataUrl?: string | null;
    sellerInfo?: {
        name: string;
        email?: string;
        phone?: string;
        whatsapp?: string;
    };
    blocks: {
        title: string;
        content: string;
    }[];
    table: {
        columns: any[];
        rows: RowInput[];
        columnStyles?: { [key: string]: any };
    };
    notes?: string;
    paymentInfo?: string;
    totals: { label: string; value: string }[];
    signatureBlock?: { label: string; value: string }[];
    paperSize?: 'letter' | 'legal';
    orientation?: 'portrait' | 'landscape';
    topLegend?: string;
}

const addFooter = (doc: jsPDF, pageNumber: number, totalPages: number) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    doc.setFontSize(8);
    doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - margin, pageHeight - 30, { align: 'right' });
};

export const generateDocument = (data: DocumentData): jsPDF => {
    const doc = new jsPDF({ putOnlyUsedFonts: true, orientation: data.orientation || 'portrait', unit: 'pt', format: data.paperSize || 'letter' });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    let finalY = 0;

    const addHeader = () => {
        let currentY = 40; // Initial Y position for the main title
        const rightColX = pageWidth - margin;

        // --- 1. Draw Main Title on the first line ---
        doc.setFontSize(16);
        doc.setFont('Helvetica', 'bold');
        doc.text(data.docTitle, pageWidth / 2, currentY, { align: 'center' });
        currentY += 25; // Move down for the next section

        // --- 2. Draw Company Info & Meta Info ---
        let companyY = currentY;
        let rightY = currentY;
        
        let companyX = margin;
        
        if (data.logoDataUrl) {
            try {
                const imgProps = doc.getImageProperties(data.logoDataUrl);
                const imgHeight = 45; 
                const imgWidth = (imgProps.width * imgHeight) / imgProps.height;
                doc.addImage(data.logoDataUrl, 'PNG', margin, companyY, imgWidth, imgHeight);
                companyX = margin + imgWidth + 15;
            } catch (e) {
                console.error("Error adding logo image to PDF:", e);
            }
        }

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(data.companyData.name, companyX, companyY);
        companyY += 12;

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Cédula: ${data.companyData.taxId}`, companyX, companyY);
        companyY += 10;
        if (data.companyData.address) {
            const splitAddress = doc.splitTextToSize(data.companyData.address, (pageWidth / 2) - margin + 40);
            doc.text(splitAddress, companyX, companyY);
            companyY += (splitAddress.length * 10);
        }
        doc.text(`Tel: ${data.companyData.phone}`, companyX, companyY);
        companyY += 10;
        doc.text(`Email: ${data.companyData.email}`, companyX, companyY);
        
        doc.setFontSize(11);
        doc.setFont('Helvetica', 'bold');
        if (data.docId) {
            doc.text(data.docId, rightColX, rightY, { align: 'right' });
            rightY += 15;
        }

        doc.setFontSize(9);
        doc.setFont('Helvetica', 'normal');
        data.meta.forEach(item => {
            doc.text(`${item.label}: ${item.value}`, rightColX, rightY, { align: 'right' });
            rightY += 12;
        });
        
        if (data.sellerInfo) {
            rightY += 8;
            doc.setFont('Helvetica', 'bold');
            doc.text("Vendedor:", rightColX, rightY, { align: 'right' });
            rightY += 10;
            doc.setFont('Helvetica', 'normal');
            doc.text(data.sellerInfo.name, rightColX, rightY, { align: 'right' });
            if (data.sellerInfo.phone) { rightY += 10; doc.text(`Tel: ${data.sellerInfo.phone}`, rightColX, rightY, { align: 'right' }); }
            if (data.sellerInfo.whatsapp) { rightY += 10; doc.text(`WhatsApp: ${data.sellerInfo.whatsapp}`, rightColX, rightY, { align: 'right' }); }
            if (data.sellerInfo.email) { rightY += 10; doc.text(data.sellerInfo.email, rightColX, rightY, { align: 'right' }); }
        }
        
        if (data.topLegend) {
            doc.setFontSize(8);
            doc.setFont('Helvetica', 'italic');
            doc.text(data.topLegend, margin, 25);
        }
        
        finalY = Math.max(companyY, rightY) + 20;
    };

    let pagesDrawnByAutotable = new Set<number>();
    
    const didDrawPage = (hookData: any) => {
        pagesDrawnByAutotable.add(hookData.pageNumber);
        if (hookData.pageNumber > 1) {
            addHeader();
        }
    };
    
    addHeader();
    
    if (data.blocks && data.blocks.length > 0) {
        autoTable(doc, {
            startY: finalY,
            body: data.blocks.map(b => ([
                { content: b.title, styles: { fontStyle: 'bold', cellPadding: { top: 0, right: 5, bottom: 2, left: 0 } } },
                { content: b.content, styles: { fontStyle: 'normal', cellPadding: { top: 0, right: 0, bottom: 2, left: 0 } } }
            ])),
            theme: 'plain',
            tableWidth: 'wrap',
            styles: { fontSize: 9, cellPadding: 0 },
            columnStyles: { 0: { cellWidth: 'wrap' } },
            margin: { left: margin, right: margin }
        });
        finalY = (doc as any).lastAutoTable.finalY + 15;
    }

    if (data.table && data.table.rows.length > 0) {
        autoTable(doc, {
            head: [data.table.columns],
            body: data.table.rows,
            startY: finalY,
            margin: { top: finalY, right: margin, left: margin, bottom: 120 }, // Increased bottom margin
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185], textColor: 255, font: 'Helvetica', fontStyle: 'bold' },
            styles: { font: 'Helvetica', fontSize: 9, cellPadding: 4 },
            columnStyles: data.table.columnStyles,
            didDrawPage: didDrawPage,
        });
        finalY = (doc as any).lastAutoTable.finalY;
    }
    
    
    const pageHeight = doc.internal.pageSize.getHeight();
    let totalPages = (doc.internal as any).getNumberOfPages();
    let currentPage = totalPages;

    let bottomContentY = finalY + 20;

    if (bottomContentY > pageHeight - 160) { // Increased check value
        doc.addPage();
        currentPage++;
        totalPages++;
        bottomContentY = 60; 
        addHeader();
    }
    
    doc.setPage(currentPage);
    
    let leftY = bottomContentY;
    let rightY = bottomContentY;

    doc.setFontSize(9);
    if (data.paymentInfo) {
        doc.setFont('Helvetica', 'bold');
        doc.text('Condiciones de Pago:', margin, leftY);
        leftY += 12;
        doc.setFont('Helvetica', 'normal');
        doc.text(data.paymentInfo, margin, leftY);
        leftY += 15;
    }
    if (data.notes) {
        doc.setFont('Helvetica', 'bold');
        doc.text('Notas:', margin, leftY);
        leftY += 12;
        doc.setFont('Helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(data.notes, (pageWidth / 2) - margin * 2);
        doc.text(splitNotes, margin, leftY);
    }
    
    const totalsX = pageWidth - margin;
    const padding = 10; 
    
    data.totals.forEach((total, index) => {
        const isLast = index === data.totals.length - 1;
        
        doc.setFont('Helvetica', isLast ? 'bold' : 'normal');
        doc.setFontSize(isLast ? 12 : 10);
        
        const valueWidth = doc.getTextWidth(total.value);
        const labelX = totalsX - valueWidth - padding;

        doc.text(total.label, labelX, rightY, { align: 'right' });
        doc.text(total.value, totalsX, rightY, { align: 'right' });
        
        rightY += isLast ? 18 : 14;
    });

    if(data.signatureBlock && data.signatureBlock.length > 0) {
        const signatureY = pageHeight - 80;
        const colWidth = (pageWidth - (margin * 2)) / data.signatureBlock.length;
        
        data.signatureBlock.forEach((sig, index) => {
            const x = margin + (index * colWidth) + (colWidth / 2);
            doc.setLineCap(2);
            doc.line(x - 60, signatureY, x + 60, signatureY); // Draw line
            doc.setFontSize(8);
            doc.text(sig.label, x, signatureY + 12, { align: 'center' });
            doc.text(sig.value, x, signatureY + 22, { align: 'center' });
        });
    }

    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        if (!pagesDrawnByAutotable.has(i)) {
             addHeader();
        }
        addFooter(doc, i, totalPages);
    }

    return doc;
};
