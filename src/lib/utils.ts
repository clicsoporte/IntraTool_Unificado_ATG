import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates initials from a name string.
 * @param name The full name.
 * @returns A string with the first letter of each word, up to 2 characters, in uppercase.
 */
export function getInitials(name: string): string {
    if (!name) return "";
    const parts = name.split(" ");
    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase();
}

/**
 * Determina si el nombre del sistema corresponde a un ambiente de pruebas o desarrollo
 * buscando palabras clave como "prueba", "pruebas", "test", "demo" (con o sin comillas).
 */
export function isTestEnvironment(systemName?: string | null): boolean {
    if (!systemName) return false;
    const clean = systemName.toLowerCase();
    return (
        clean.includes('prueba') ||
        clean.includes('pruebas') ||
        clean.includes('"prueba"') ||
        clean.includes('"pruebas"') ||
        clean.includes('“prueba”') ||
        clean.includes('“pruebas”') ||
        clean.includes('test') ||
        clean.includes('staging') ||
        clean.includes('qa') ||
        clean.includes('demo')
    );
}
