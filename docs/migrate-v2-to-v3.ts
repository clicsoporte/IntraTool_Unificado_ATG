/**
 * @file migrate-v2-to-v3.ts
 * @description Script de migración corregido para arquitectura de base de datos única (v3.1).
 * Migra datos desde intratool.db y warehouse.db hacia clic_tools.db.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Configuración de rutas
const DBS_DIR = path.join(process.cwd(), 'dbs');
const OLD_ADMIN_DB = path.join(DBS_DIR, 'intratool.db'); // Cambiado de core.db a intratool.db
const OLD_WAREHOUSE_DB = path.join(DBS_DIR, 'warehouse.db');
const NEW_UNIFIED_DB = path.join(DBS_DIR, 'clic_tools.db');

async function runMigration() {
    console.log("🚀 Iniciando proceso de migración de arquitectura (v3.1)...");

    if (!fs.existsSync(NEW_UNIFIED_DB)) {
        console.error("❌ No se encontró clic_tools.db. Por favor, asegúrate de que el sistema haya inicializado la DB vacía.");
        process.exit(1);
    }

    const mainDb = new Database(NEW_UNIFIED_DB);
    mainDb.pragma('journal_mode = WAL');
    mainDb.pragma('foreign_keys = OFF');

    try {
        // --- MÓDULO ADMIN (CORE) ---
        if (fs.existsSync(OLD_ADMIN_DB)) {
            console.log("\n📁 Migrando Módulo Admin (desde intratool.db)...");
            const coreDb = new Database(OLD_ADMIN_DB);

            // 1. Usuarios
            const users = coreDb.prepare("SELECT * FROM users").all() as any[];
            let userCount = 0;
            for (const u of users) {
                const exists = mainDb.prepare("SELECT id FROM core_users WHERE email = ?").get(u.email);
                if (!exists) {
                    mainDb.prepare(`
                        INSERT INTO core_users (id, name, email, password, phone, whatsapp, erpAlias, role, forcePasswordChange)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(u.id, u.name, u.email, u.password, u.phone, u.whatsapp, u.erpAlias, u.role.toLowerCase(), u.forcePasswordChange ? 1 : 0);
                    userCount++;
                }
            }
            console.log(`  ✅ ${userCount} usuarios migrados (Roles normalizados a minúsculas).`);

            // 2. Roles
            const roles = coreDb.prepare("SELECT * FROM roles").all() as any[];
            for (const r of roles) {
                mainDb.prepare("INSERT OR IGNORE INTO core_roles (id, name, permissions) VALUES (?, ?, ?)")
                    .run(r.id.toLowerCase(), r.name, r.permissions);
            }
            console.log(`  ✅ Roles migrados.`);

            // 3. Configuración de Empresa
            const company = coreDb.prepare("SELECT * FROM company_settings WHERE id = 1").get() as any;
            if (company) {
                mainDb.prepare(`
                    UPDATE core_company_settings SET 
                    name = ?, taxId = ?, address = ?, phone = ?, email = ?, logoUrl = ?, systemName = ?, 
                    publicUrl = ?, systemVersion = ?, quotePrefix = ?, nextQuoteNumber = ?, decimalPlaces = ?, 
                    quoterShowTaxId = ?, searchDebounceTime = ?, syncWarningHours = ?, importMode = ?,
                    customerFilePath = ?, productFilePath = ?, exemptionFilePath = ?, stockFilePath = ?,
                    locationFilePath = ?, cabysFilePath = ?, supplierFilePath = ?, 
                    erpPurchaseOrderHeaderFilePath = ?, erpPurchaseOrderLineFilePath = ?,
                    erpInvoiceHeaderFilePath = ?, erpInvoiceLineFilePath = ?
                    WHERE id = 1
                `).run(
                    company.name, company.taxId, company.address, company.phone, company.email, company.logoUrl, company.systemName,
                    company.publicUrl, company.systemVersion, company.quotePrefix, company.nextQuoteNumber, company.decimalPlaces,
                    company.quoterShowTaxId ? 1 : 0, company.searchDebounceTime, company.syncWarningHours, company.importMode,
                    company.customerFilePath, company.productFilePath, company.exemptionFilePath, company.stockFilePath,
                    company.locationFilePath, company.cabysFilePath, company.supplierFilePath,
                    company.erpPurchaseOrderHeaderFilePath, company.erpPurchaseOrderLineFilePath,
                    company.erpInvoiceHeaderFilePath, company.erpInvoiceLineFilePath
                );
                console.log(`  ✅ Configuración de empresa migrada.`);
            }

            // 4. Catálogos de Negocio (Normalización a MAYÚSCULAS)
            console.log("  > Migrando catálogos (Productos, Clientes, Proveedores)...");
            
            const customers = coreDb.prepare("SELECT * FROM customers").all() as any[];
            for (const c of customers) {
                mainDb.prepare(`INSERT OR IGNORE INTO core_customers (id, name, address, phone, taxId, currency, creditLimit, paymentCondition, salesperson, active, email, electronicDocEmail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                    .run(c.id.toUpperCase(), c.name, c.address, c.phone, c.taxId, c.currency, c.creditLimit, c.paymentCondition, c.salesperson, c.active, c.email, c.electronicDocEmail);
            }

            const products = coreDb.prepare("SELECT * FROM products").all() as any[];
            for (const p of products) {
                mainDb.prepare(`INSERT OR IGNORE INTO core_products (id, description, classification, lastEntry, active, notes, unit, isBasicGood, cabys, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                    .run(p.id.toUpperCase(), p.description, p.classification, p.lastEntry, p.active, p.notes, p.unit, p.isBasicGood, p.cabys, p.barcode);
            }

            const suppliers = coreDb.prepare("SELECT * FROM suppliers").all() as any[];
            for (const s of suppliers) {
                mainDb.prepare(`INSERT OR IGNORE INTO core_suppliers (id, name, alias, email, phone) VALUES (?, ?, ?, ?, ?)`)
                    .run(s.id.toUpperCase(), s.name, s.alias, s.email, s.phone);
            }

            // 5. Tablas de Auditoría y Sistema
            console.log("  > Migrando logs y registros de sistema...");
            const logTables = [
                { old: 'logs', new: 'core_logs' },
                { old: 'api_settings', new: 'core_api_settings' },
                { old: 'suggestions', new: 'core_suggestions' },
                { old: 'notifications', new: 'core_notifications' },
                { old: 'analytics_settings', new: 'core_analytics_settings' },
                { old: 'stock_settings', new: 'core_stock_settings' },
                { old: 'import_queries', new: 'core_import_queries' }
            ];

            for (const table of logTables) {
                try {
                    const data = coreDb.prepare(`SELECT * FROM ${table.old}`).all() as any[];
                    if (data.length > 0) {
                        const cols = Object.keys(data[0]).join(', ');
                        const placeholders = Object.keys(data[0]).map(() => '?').join(', ');
                        const insert = mainDb.prepare(`INSERT OR IGNORE INTO ${table.new} (${cols}) VALUES (${placeholders})`);
                        for (const row of data) insert.run(Object.values(row));
                    }
                } catch (e) {
                    console.warn(`  ⚠️  Omitiendo tabla ${table.old} (no encontrada o error).`);
                }
            }

            coreDb.close();
        }

        // --- MÓDULO ALMACÉN (WAREHOUSE) ---
        if (fs.existsSync(OLD_WAREHOUSE_DB)) {
            console.log("\n📁 Sincronizando Módulo de Almacén...");
            const whDb = new Database(OLD_WAREHOUSE_DB);
            
            // Solo migrar si la tabla wh_locations está vacía o tiene menos de 10 registros (evita duplicidad)
            const currentLocs = mainDb.prepare("SELECT COUNT(*) as count FROM wh_locations").get() as { count: number };
            if (currentLocs.count > 10) {
                console.log("  ✅ Los datos de almacén ya parecen haber sido migrados. Saltando para evitar duplicados.");
            } else {
                const locationIdMap = new Map<number, number>();
                const oldLocs = whDb.prepare("SELECT * FROM locations ORDER BY parentId ASC").all() as any[];
                for (const loc of oldLocs) {
                    const newParent = loc.parentId ? locationIdMap.get(loc.parentId) : null;
                    const res = mainDb.prepare(`INSERT INTO wh_locations (name, code, type, parentId, population_status, is_mixed) VALUES (?, ?, ?, ?, ?, ?)`).run(loc.name, loc.code, loc.type, newParent, loc.population_status || 'P', loc.is_mixed || 0);
                    locationIdMap.set(loc.id, res.lastInsertRowid as number);
                }
                
                // Mapeo de inventario con IDs nuevos
                const oldItemLocs = whDb.prepare("SELECT * FROM item_locations").all() as any[];
                for (const il of oldItemLocs) {
                    const newLoc = locationIdMap.get(il.locationId);
                    if (newLoc) mainDb.prepare(`INSERT INTO wh_item_locations (itemId, locationId, clientId, isExclusive, requiresCertificate, updatedBy, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(il.itemId.toUpperCase(), newLoc, il.clientId, il.isExclusive, il.requiresCertificate, il.updatedBy, il.updatedAt);
                }
                console.log(`  ✅ ${oldLocs.length} ubicaciones y asignaciones sincronizadas.`);
            }
            whDb.close();
        }

        console.log("\n✨ MIGRACIÓN COMPLETADA EXITOSAMENTE.");
    } catch (error) {
        console.error("\n❌ ERROR CRÍTICO EN LA MIGRACIÓN:", error);
    } finally {
        mainDb.pragma('foreign_keys = ON');
        mainDb.close();
    }
}

runMigration();
