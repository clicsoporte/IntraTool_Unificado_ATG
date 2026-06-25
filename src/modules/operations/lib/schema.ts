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

    if (currentVersion < 2) {
        db.exec(`
            -- 1. Configuración del Módulo
            CREATE TABLE IF NOT EXISTS ops_delivery_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- 2. Rutas Logísticas
            CREATE TABLE IF NOT EXISTS ops_delivery_routes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                active INTEGER DEFAULT 1
            );

            -- 3. Asignaciones Diarias (Chofer + Vehículo + Rutas)
            CREATE TABLE IF NOT EXISTS ops_delivery_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha TEXT NOT NULL,                  -- YYYY-MM-DD
                ruta_id INTEGER NOT NULL,
                empleado_id INTEGER NOT NULL,         -- Relacionado a core_users
                vehiculo_id INTEGER NOT NULL,         -- Relacionado a fleet_vehicles
                activa INTEGER DEFAULT 1,
                siguiente_cliente TEXT,
                siguiente_cliente_fecha TEXT,
                fecha_completada TEXT,
                FOREIGN KEY (ruta_id) REFERENCES ops_delivery_routes(id) ON DELETE CASCADE,
                FOREIGN KEY (vehiculo_id) REFERENCES fleet_vehicles(id) ON DELETE RESTRICT
            );

            -- 4. Cola General y Documentos en Tránsito (Pedidos/Facturas)
            CREATE TABLE IF NOT EXISTS ops_delivery_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                documento_numero TEXT NOT NULL,       -- Número de Pedido o Factura
                tipo_documento TEXT NOT NULL,         -- 'pedido' o 'factura'
                cliente_id TEXT NOT NULL,             -- Relacionado a core_customers
                cliente_nombre TEXT NOT NULL,
                asignacion_id INTEGER,                -- Nullable si está en Cola General (sin asignar)
                creado_por TEXT,                      -- Usuario ERP creador del pedido
                entregado INTEGER DEFAULT 0,          -- Flag de BD (0/1). Si es 1, no reaparece
                estado TEXT DEFAULT 'pendiente',      -- 'pendiente', 'en_ruta', 'completo', 'incompleto', 'rechazado'
                fecha_registro TEXT NOT NULL,
                fecha_entrega TEXT,
                comentario TEXT,
                release_code_id INTEGER,
                
                -- Campos de Gestión Híbrida y Concurrencia
                canal_registro TEXT,                 -- 'telegram' o 'web'
                gestionado_por TEXT,                 -- ID o Nombre del usuario que completó la entrega
                telegram_lock_at TEXT,               -- Timestamp de inicio de reporte en Telegram (para concurrencia)
                telegram_lock_by TEXT,               -- Chat ID del chofer que tiene el bloqueo
                tipo_documento_erp TEXT,             -- 'F' o 'D'
                factura_original TEXT,               -- Referencia a factura original si es 'D'
                latitud REAL,
                longitud REAL,
                
                FOREIGN KEY (asignacion_id) REFERENCES ops_delivery_assignments(id) ON DELETE SET NULL
            );

            -- 5. Detalle de Líneas de Entrega (Para Modo Avanzado)
            CREATE TABLE IF NOT EXISTS ops_delivery_lines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                delivery_order_id INTEGER NOT NULL,
                producto_codigo TEXT NOT NULL,
                producto_descripcion TEXT,
                cantidad_pedida REAL NOT NULL,
                cantidad_entregada REAL NOT NULL,
                cantidad_faltante REAL NOT NULL,
                FOREIGN KEY (delivery_order_id) REFERENCES ops_delivery_queue(id) ON DELETE CASCADE
            );

            -- 6. Códigos de Validación (Release Codes)
            CREATE TABLE IF NOT EXISTS ops_delivery_release_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT NOT NULL,                 -- Código de 6 dígitos
                delivery_order_id INTEGER NOT NULL,
                generado_por TEXT NOT NULL,
                usado INTEGER DEFAULT 0,
                fecha_generacion TEXT NOT NULL,
                fecha_expiracion TEXT NOT NULL,
                es_override INTEGER DEFAULT 0,        -- 1 si se aplicó override por tiempo de espera
                FOREIGN KEY (delivery_order_id) REFERENCES ops_delivery_queue(id) ON DELETE CASCADE
            );

            -- 7. Historial de Notificaciones ERP
            CREATE TABLE IF NOT EXISTS ops_delivery_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                delivery_order_id INTEGER NOT NULL,
                usuario_erp TEXT NOT NULL,
                tipo TEXT NOT NULL,                  -- 'email_creador'
                estado TEXT NOT NULL,                -- 'enviado', 'fallido'
                error TEXT,
                fecha TEXT NOT NULL,
                FOREIGN KEY (delivery_order_id) REFERENCES ops_delivery_queue(id) ON DELETE CASCADE
            );

            -- 8. Historial GPS de Ruta (Rastreo en vivo)
            CREATE TABLE IF NOT EXISTS ops_delivery_gps_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asignacion_id INTEGER NOT NULL,
                latitud REAL NOT NULL,
                longitud REAL NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (asignacion_id) REFERENCES ops_delivery_assignments(id) ON DELETE CASCADE
            );

            -- Índices de Rendimiento
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_queue_doc ON ops_delivery_queue(documento_numero);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_queue_estado ON ops_delivery_queue(estado);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_assignments_fecha ON ops_delivery_assignments(fecha, activa);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_lines_order ON ops_delivery_lines(delivery_order_id);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_gps_logs_ass ON ops_delivery_gps_logs(asignacion_id);
        `);

        // Populate settings
        const insertSetting = db.prepare(`INSERT OR IGNORE INTO ops_delivery_settings (key, value) VALUES (?, ?)`);
        insertSetting.run('delivery_mode', 'sencillo');
        insertSetting.run('release_codes_enabled', 'false');
        insertSetting.run('release_codes_override_min', '5');
        insertSetting.run('visibilidad_alertas', 'normal');
        insertSetting.run('hora_barrido_fin_jornada', '19:00');
        insertSetting.run('limite_coincidencias', '5');
        insertSetting.run('notificaciones_email', 'true');

        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(2, new Date().toISOString());
    }

    if (currentVersion < 3) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_queue ADD COLUMN tipo_documento_erp TEXT;
                ALTER TABLE ops_delivery_queue ADD COLUMN factura_original TEXT;
            `);
        } catch (e: any) {
            console.warn('Migration to version 3 warned/skipped:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(3, new Date().toISOString());
    }

    if (currentVersion < 4) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_assignments ADD COLUMN siguiente_cliente TEXT;
            `);
        } catch (e: any) {
            console.warn('Migration to version 4 warned/skipped:', e.message);
        }

        try {
            const insertSetting = db.prepare(`INSERT OR IGNORE INTO ops_delivery_settings (key, value) VALUES (?, ?)`);
            insertSetting.run('bot_ask_next_client', 'true');
            insertSetting.run('bot_next_client_mandatory', 'false');
            insertSetting.run('bot_ask_rtv', 'true');
            insertSetting.run('bot_ask_comments', 'true');
        } catch (e: any) {
            console.error('Error inserting bot settings in migration 4:', e.message);
        }

        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(4, new Date().toISOString());
    }

    if (currentVersion < 5) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_assignments ADD COLUMN fecha_completada TEXT;
            `);
        } catch (e: any) {
            console.warn('Migration to version 5 warned/skipped:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(5, new Date().toISOString());
    }

    if (currentVersion < 6) {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS ops_delivery_gps_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    asignacion_id INTEGER NOT NULL,
                    latitud REAL NOT NULL,
                    longitud REAL NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (asignacion_id) REFERENCES ops_delivery_assignments(id) ON DELETE CASCADE
                );
                ALTER TABLE ops_delivery_queue ADD COLUMN latitud REAL;
                ALTER TABLE ops_delivery_queue ADD COLUMN longitud REAL;
            `);
        } catch (e: any) {
            console.warn('Migration to version 6 warned/skipped:', e.message);
        }

        try {
            const insertSetting = db.prepare(`INSERT OR IGNORE INTO ops_delivery_settings (key, value) VALUES (?, ?)`);
            insertSetting.run('bot_ask_location', 'false');
            insertSetting.run('bot_location_mandatory', 'false');
            insertSetting.run('bot_live_tracking', 'false');
            insertSetting.run('bot_live_tracking_mandatory', 'false');
        } catch (e: any) {
            console.error('Error inserting GPS settings in migration 6:', e.message);
        }

        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(6, new Date().toISOString());
    }

    if (currentVersion < 7) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_assignments ADD COLUMN fecha_creacion TEXT;
                ALTER TABLE ops_delivery_assignments ADD COLUMN fecha_inicio_retorno TEXT;
                ALTER TABLE ops_delivery_assignments ADD COLUMN latitud_retorno REAL;
                ALTER TABLE ops_delivery_assignments ADD COLUMN longitud_retorno REAL;
                ALTER TABLE ops_delivery_assignments ADD COLUMN latitud_llegada REAL;
                ALTER TABLE ops_delivery_assignments ADD COLUMN longitud_llegada REAL;
            `);
        } catch (e: any) {
            console.warn('Migration to version 7 warned/skipped:', e.message);
        }

        try {
            const insertSetting = db.prepare(`INSERT OR IGNORE INTO ops_delivery_settings (key, value) VALUES (?, ?)`);
            insertSetting.run('bot_ask_return_location', 'optional');
            insertSetting.run('bot_ask_arrival_location', 'mandatory');
        } catch (e: any) {
            console.error('Error inserting settings in migration 7:', e.message);
        }

        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(7, new Date().toISOString());
    }

    if (currentVersion < 8) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_assignments ADD COLUMN siguiente_cliente_fecha TEXT;
            `);
        } catch (e: any) {
            console.warn('Migration to version 8 warned/skipped:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(8, new Date().toISOString());
    }

    if (currentVersion < 9) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_queue ADD COLUMN foto_evidencia TEXT;
                ALTER TABLE ops_delivery_queue ADD COLUMN foto_factura TEXT;
            `);
        } catch (e: any) {
            console.warn('Migration to version 9 columns warned/skipped:', e.message);
        }

        try {
            const insertSetting = db.prepare(`INSERT OR IGNORE INTO ops_delivery_settings (key, value) VALUES (?, ?)`);
            insertSetting.run('bot_require_evidence_photo', 'disabled');
            insertSetting.run('bot_require_invoice_photo', 'disabled');
        } catch (e: any) {
            console.error('Error inserting photos settings in migration 9:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(9, new Date().toISOString());
    }

    if (currentVersion < 10) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_queue ADD COLUMN devolucion_asignacion_id INTEGER;
            `);
        } catch (e: any) {
            console.warn('Migration to version 10 columns warned/skipped:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(10, new Date().toISOString());
    }

    if (currentVersion < 11) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_assignments ADD COLUMN latitud_inicio REAL;
                ALTER TABLE ops_delivery_assignments ADD COLUMN longitud_inicio REAL;
            `);
        } catch (e: any) {
            console.warn('Migration to version 11 columns warned/skipped:', e.message);
        }

        try {
            const insertSetting = db.prepare(`INSERT OR IGNORE INTO ops_delivery_settings (key, value) VALUES (?, ?)`);
            insertSetting.run('bot_ask_start_location', 'optional');
            insertSetting.run('bot_ask_first_client', 'optional');
        } catch (e: any) {
            console.error('Error inserting settings in migration 11:', e.message);
        }

        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(11, new Date().toISOString());
    }

    if (currentVersion < 12) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_assignments ADD COLUMN fecha_salida TEXT;
            `);
        } catch (e: any) {
            console.warn('Migration to version 12 columns warned/skipped:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(12, new Date().toISOString());
    }

    if (currentVersion < 13) {
        try {
            const insertSetting = db.prepare(`INSERT OR IGNORE INTO ops_delivery_settings (key, value) VALUES (?, ?)`);
            insertSetting.run('collect_consecutive_prefix', 'REC-');
            insertSetting.run('collect_consecutive_next', '1');
        } catch (e: any) {
            console.error('Error inserting settings in migration 13:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(13, new Date().toISOString());
    }

    if (currentVersion < 14) {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS ops_client_emails (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cliente_id TEXT NOT NULL,
                    email TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(cliente_id, email)
                );
                CREATE TABLE IF NOT EXISTS ops_delivery_discards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    documento_numero TEXT NOT NULL,
                    motivo_descarte TEXT NOT NULL,
                    usuario_descarte TEXT NOT NULL,
                    fecha_descarte DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (e: any) {
            console.error('Error creating tables in migration 14:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(14, new Date().toISOString());
    }

    if (currentVersion < 15) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_assignments ADD COLUMN consecutivo TEXT;
            `);
        } catch (e: any) {
            console.warn('Migration to version 15 columns warned/skipped:', e.message);
        }

        try {
            const insertSetting = db.prepare(`INSERT OR IGNORE INTO ops_delivery_settings (key, value) VALUES (?, ?)`);
            insertSetting.run('route_consecutive_prefix', 'RUT-');
            insertSetting.run('route_consecutive_next', '1');
            insertSetting.run('notificaciones_ruta_emails', 'logistica@empresa.com');
        } catch (e: any) {
            console.error('Error inserting settings in migration 15:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(15, new Date().toISOString());
    }

    console.log('Operations schema initialized at version', currentVersion < 15 ? 15 : currentVersion);
}
