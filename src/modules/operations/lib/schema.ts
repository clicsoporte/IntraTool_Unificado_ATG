import { Database } from 'better-sqlite3';
import { OperationsDocumentType } from '@/modules/core/types';

export const OPERATIONS_TABLES = {
    types: 'ops_types',
    documents: 'ops_documents',
    lines: 'ops_lines',
    history: 'ops_history'
} as const;

export async function initializeOperationsSchema(db: Database) {
    // Check current version
    db.exec(`
        CREATE TABLE IF NOT EXISTS _ops_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            installed_at TEXT NOT NULL
        )
    `);

    const row = db.prepare('SELECT MAX(version) as version FROM _ops_migrations').get() as { version: number | null };
    const currentVersion = row?.version || 0;

    if (currentVersion < 1) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${OPERATIONS_TABLES.types} (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                prefix TEXT NOT NULL UNIQUE,
                nextNumber INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS ${OPERATIONS_TABLES.documents} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consecutive TEXT UNIQUE NOT NULL,
                documentTypeId TEXT NOT NULL,
                status TEXT NOT NULL,
                requestDate TEXT NOT NULL,
                notes TEXT,
                relatedProductionOrderId INTEGER,
                relatedPurchaseRequestId INTEGER,
                relatedCustomerId TEXT,
                requesterId INTEGER,
                requesterName TEXT,
                requesterSignedAt TEXT,
                processorId INTEGER,
                processorName TEXT,
                processorSignedAt TEXT,
                FOREIGN KEY (documentTypeId) REFERENCES ${OPERATIONS_TABLES.types}(id)
            );

            CREATE TABLE IF NOT EXISTS ${OPERATIONS_TABLES.lines} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                documentId INTEGER NOT NULL,
                itemId TEXT NOT NULL,
                itemDescription TEXT,
                quantity REAL NOT NULL,
                lotId TEXT,
                sourceLocationId INTEGER,
                destinationLocationId INTEGER,
                FOREIGN KEY (documentId) REFERENCES ${OPERATIONS_TABLES.documents}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ${OPERATIONS_TABLES.history} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                documentId INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT,
                updatedBy TEXT NOT NULL,
                FOREIGN KEY (documentId) REFERENCES ${OPERATIONS_TABLES.documents}(id) ON DELETE CASCADE
            );

            -- Production Indexes
            CREATE INDEX IF NOT EXISTS idx_ops_documents_consecutive ON ${OPERATIONS_TABLES.documents}(consecutive);
            CREATE INDEX IF NOT EXISTS idx_ops_documents_status ON ${OPERATIONS_TABLES.documents}(status);
            CREATE INDEX IF NOT EXISTS idx_ops_history_documentId ON ${OPERATIONS_TABLES.history}(documentId);
            CREATE INDEX IF NOT EXISTS idx_ops_lines_documentId ON ${OPERATIONS_TABLES.lines}(documentId);
        `);

        // Populate with initial document types
        const insertType = db.prepare(`INSERT OR IGNORE INTO ${OPERATIONS_TABLES.types} (id, name, description, prefix, nextNumber) VALUES (@id, @name, @description, @prefix, @nextNumber)`);
        const transaction = db.transaction((types: OperationsDocumentType[]) => {
            for (const type of types) insertType.run(type);
        });

        const defaultTypes: OperationsDocumentType[] = [
            { id: 'prod-to-wh', name: 'Entrega de Producción a Bodega', description: 'Registra el traslado de producto terminado desde producción al almacén.', prefix: 'ENT-BOD-', nextNumber: 1 },
            { id: 'wh-to-prod', name: 'Salida de Material a Producción', description: 'Registra la salida de materia prima o componentes hacia una orden de producción.', prefix: 'SAL-PROD-', nextNumber: 1 },
            { id: 'wh-transfer', name: 'Movimiento entre Bodegas', description: 'Registra un traslado de inventario entre dos bodegas o ubicaciones internas.', prefix: 'MOV-INT-', nextNumber: 1 },
            { id: 'customer-sample', name: 'Envío de Muestra a Cliente', description: 'Registra la salida de una muestra para un cliente.', prefix: 'MUE-CLI-', nextNumber: 1 },
            { id: 'customer-return', name: 'Devolución de Cliente', description: 'Registra el reingreso de mercancía devuelta por un cliente.', prefix: 'DEV-CLI-', nextNumber: 1 },
        ];

        transaction(defaultTypes);

        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(1, new Date().toISOString());
    }

    console.log('Operations schema initialized at version', currentVersion < 1 ? 1 : currentVersion);
}
