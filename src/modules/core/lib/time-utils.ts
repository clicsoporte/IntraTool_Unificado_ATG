
/**
 * @fileoverview This file contains centralized utility functions related to time and date calculations.
 * Centralizing this logic adheres to the DRY (Don't Repeat Yourself) principle and makes
 * the business rules for date calculations consistent and easy to update.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns';

export const DEFAULT_BUSINESS_TIMEZONE = 'America/Costa_Rica';

/**
 * Retorna la fecha local en formato YYYY-MM-DD respetando la zona horaria (default America/Costa_Rica).
 * Totalmente seguro para Client Components y Server Components (sin dependencias de base de datos).
 */
export function getLocalDateStr(dateInput: Date | string | number = new Date(), timeZone: string = DEFAULT_BUSINESS_TIMEZONE): string {
    if (!dateInput) return '';
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
        return dateInput.trim();
    }
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('fr-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(d);
}

/**
 * Retorna fecha y hora en formato YYYY-MM-DDTHH:mm para inputs de tipo datetime-local respetando la zona horaria.
 */
export function getLocalDateTimeStr(dateInput: Date | string | number = new Date(), timeZone: string = DEFAULT_BUSINESS_TIMEZONE): string {
    if (!dateInput) return '';
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(d);

    const map: Record<string, string> = {};
    for (const p of parts) {
        map[p.type] = p.value;
    }
    let hour = map.hour || '00';
    if (hour === '24') hour = '00';
    return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

/**
 * Normaliza y formatea cualquier fecha proveniente del ERP o BD a YYYY-MM-DD local.
 */
export function formatDateToLocal(dateInput: string | Date | null | undefined, timeZone: string = DEFAULT_BUSINESS_TIMEZONE): string {
    if (!dateInput) return '';
    return getLocalDateStr(dateInput, timeZone);
}


/**
 * Calculates the number of days remaining until a given date and returns a label and a color class.
 * This function is used across different modules (Planner, Requests) to provide a consistent
 * visual indicator of urgency.
 *
 * @param {string | null | undefined} dateStr - The target date in ISO string format. Can be null or undefined.
 * @returns {{ label: string; color: string; }} An object containing the display label and a Tailwind CSS color class.
 */
export function getDaysRemaining(dateStr: string | null | undefined) {
    if (!dateStr) {
        return { label: 'Sin fecha', color: 'text-gray-500' };
    }

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const targetDate = parseISO(dateStr);
        targetDate.setHours(0, 0, 0, 0);

        const days = differenceInCalendarDays(targetDate, today);

        let colorClass = 'text-green-600';
        if (days <= 2) colorClass = 'text-orange-500';
        if (days < 1) colorClass = 'text-red-600';

        let label = '';
        if (days === 0) {
            label = 'Para Hoy';
        } else if (days < 0) {
            label = `Atrasado ${Math.abs(days)}d`;
        } else {
            label = `Faltan ${days}d`;
        }

        return { label, color: colorClass };
        
    } catch (error) {
        console.error("Error parsing date in getDaysRemaining:", error);
        return { label: 'Fecha inv.', color: 'text-red-600' };
    }
}
