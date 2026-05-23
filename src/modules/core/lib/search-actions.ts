/**
 * @fileoverview Centralized server-side search actions.
 * These functions perform efficient, debounced searches on the database.
 */
'use server';
import { getDb } from '@/modules/core/lib/db';
import type { Product, Customer } from '@/modules/core/types';

const SEARCH_LIMIT = 50;

/**
 * Searches for products by ID, description, or barcode.
 * @param term The search term.
 * @param onlyActive If true, only returns active products.
 * @returns A promise that resolves to an array of matching products.
 */
export async function searchProducts(term: string, onlyActive: boolean = true): Promise<Product[]> {
    if (!term || term.length < 2) return [];
    const db = await getDb();
    const searchTerm = `%${term}%`;
    let query = `SELECT * FROM core_products 
                 WHERE (id LIKE @term OR description LIKE @term OR barcode LIKE @term)`;
    if (onlyActive) {
        query += ` AND active = 'S'`;
    }
    query += ` LIMIT ${SEARCH_LIMIT}`;
    
    const products = db.prepare(query).all({ term: searchTerm });
    return products as Product[];
}

/**
 * Searches for customers by ID, name, or tax ID.
 * @param term The search term.
 * @param onlyActive If true, only returns active customers.
 * @returns A promise that resolves to an array of matching customers.
 */
export async function searchCustomers(term: string, onlyActive: boolean = true): Promise<Customer[]> {
    if (!term || term.length < 2) return [];
    const db = await getDb();
    const searchTerm = `%${term}%`;
    let query = `SELECT * FROM core_customers
                 WHERE (id LIKE @term OR name LIKE @term OR taxId LIKE @term)`;
    if (onlyActive) {
        query += ` AND active = 'S'`;
    }
    query += ` LIMIT ${SEARCH_LIMIT}`;

    const customers = db.prepare(query).all({ term: searchTerm });
    return customers as Customer[];
}
