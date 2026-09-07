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
                fecha_salida TEXT,
                fecha_llegada_bodega TEXT,
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
                boleta_numero TEXT,                  -- Consecutivo de boleta emitida (re-despacho o entrega parcial)
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

            -- 7. Bitácora de Registros de la APK Nativa (Logs de Operaciones)
            CREATE TABLE IF NOT EXISTS ops_driver_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                user_name TEXT,
                chofer_nombre TEXT,
                chofer_telefono TEXT,
                ruta_nombre TEXT,
                placa_vehiculo TEXT,
                level TEXT NOT NULL,
                category TEXT DEFAULT 'operativo',
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );

            -- 8. Historial de Notificaciones ERP
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

            -- 9. Dispositivos Móviles Registrados e Inventario de Hardware (Auto-Aprovisionamiento & IT Assets)
            CREATE TABLE IF NOT EXISTS fleet_registered_devices (
                hardware_id TEXT PRIMARY KEY,
                device_name TEXT,
                last_user_id INTEGER,
                last_driver_name TEXT,
                driver_phone TEXT,
                printer_mac TEXT,
                paper_size TEXT DEFAULT '80mm',
                server_url_override TEXT,
                custom_config_json TEXT,
                asset_id INTEGER,
                last_seen TEXT NOT NULL,
                phone_number TEXT,
                current_app_version TEXT,
                current_version_code INTEGER,
                battery_level INTEGER,
                ota_paused INTEGER DEFAULT 0,
                install_failed_count INTEGER DEFAULT 0,
                last_install_error TEXT
            );

            -- 9b. Configuración de Versiones Oficiales de la APK para Auto-Actualización OTA
            CREATE TABLE IF NOT EXISTS ops_app_version_settings (
                id INTEGER PRIMARY KEY,
                version_name TEXT NOT NULL,
                version_code INTEGER NOT NULL,
                apk_url TEXT NOT NULL,
                release_notes TEXT,
                global_ota_paused INTEGER DEFAULT 0,
                force_update INTEGER DEFAULT 0,
                updated_at TEXT NOT NULL
            );

            -- 8. Historial GPS de Ruta (Rastreo en vivo)
            CREATE TABLE IF NOT EXISTS ops_delivery_gps_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asignacion_id INTEGER NOT NULL,
                latitud REAL NOT NULL,
                longitud REAL NOT NULL,
                timestamp TEXT NOT NULL,
                evento TEXT,
                FOREIGN KEY (asignacion_id) REFERENCES ops_delivery_assignments(id) ON DELETE CASCADE
            );

            -- 9. Correos de Clientes
            CREATE TABLE IF NOT EXISTS ops_client_emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id TEXT NOT NULL,
                email TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(cliente_id, email)
            );

            -- 10. Descartes de Documentos
            CREATE TABLE IF NOT EXISTS ops_delivery_discards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                documento_numero TEXT NOT NULL,
                motivo_descarte TEXT NOT NULL,
                usuario_descarte TEXT NOT NULL,
                fecha_descarte DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Índices de Rendimiento
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_queue_doc ON ops_delivery_queue(documento_numero);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_queue_estado ON ops_delivery_queue(estado);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_queue_fecha ON ops_delivery_queue(fecha_registro);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_queue_asign ON ops_delivery_queue(asignacion_id) WHERE asignacion_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_ops_queue_asig_entregado ON ops_delivery_queue(asignacion_id, entregado, fecha_registro DESC);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_assignments_fecha ON ops_delivery_assignments(fecha, activa);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_lines_order ON ops_delivery_lines(delivery_order_id);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_gps_logs_ass ON ops_delivery_gps_logs(asignacion_id);
            CREATE INDEX IF NOT EXISTS idx_ops_delivery_gps_asig_ts ON ops_delivery_gps_logs(asignacion_id, timestamp DESC);
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
        insertSetting.run('driver_boleta_pdf_enabled', 'true');
        insertSetting.run('driver_boleta_email_enabled', 'true');
        insertSetting.run('driver_boleta_print_enabled', 'true');
        insertSetting.run('driver_boleta_paper_size', '80mm');

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
            insertSetting.run('route_sheet_iso_text', 'DOC-LOG-04 | Ver. 02 | Sistema de Gestión de Calidad ISO 9001:2015');
        } catch (e: any) {
            console.error('Error inserting settings in migration 15:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(15, new Date().toISOString());
    }

    if (currentVersion < 16) {
        try {
            db.exec(`
                ALTER TABLE ops_delivery_queue ADD COLUMN hora_ingreso_geocerca TEXT;
                ALTER TABLE ops_delivery_queue ADD COLUMN hora_entrega_efectiva TEXT;
                ALTER TABLE ops_delivery_queue ADD COLUMN hora_salida_geocerca TEXT;
                ALTER TABLE ops_delivery_queue ADD COLUMN tiempo_descarga_min INTEGER;
                ALTER TABLE ops_delivery_queue ADD COLUMN tiempo_espera_post_entrega_min INTEGER;
                ALTER TABLE ops_delivery_queue ADD COLUMN tiempo_total_permanencia_min INTEGER;
                ALTER TABLE ops_client_emails ADD COLUMN notificar_llegada INTEGER DEFAULT 1;
            `);
        } catch (e: any) {
            console.warn('Migration to version 16 columns warned/skipped:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(16, new Date().toISOString());
    }

    if (currentVersion < 17) {
        try {
            const tableInfo = db.prepare("PRAGMA table_info('ops_delivery_queue')").all();
            const cols = tableInfo.map((c: any) => c.name);
            if (!cols.includes('firma_cliente')) {
                db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN firma_cliente TEXT;`);
            }
        } catch (e: any) {
            console.warn('Migration to version 17 columns warned/skipped:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(17, new Date().toISOString());
    }

    if (currentVersion < 18) {
        try {
            const tableInfo = db.prepare("PRAGMA table_info('ops_delivery_queue')").all();
            const cols = tableInfo.map((c: any) => c.name);
            if (!cols.includes('nombre_recibe')) {
                db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN nombre_recibe TEXT;`);
            }
        } catch (e: any) {
            console.warn('Migration to version 18 columns warned/skipped:', e.message);
        }
        db.prepare('INSERT INTO _ops_migrations (version, installed_at) VALUES (?, ?)').run(18, new Date().toISOString());
    }

    // Always run self-healing check for ops_delivery_queue
    try {
        const tableInfo = db.prepare("PRAGMA table_info('ops_delivery_queue')").all();
        const cols = tableInfo.map((c: any) => c.name);
        if (!cols.includes('foto_evidencia')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN foto_evidencia TEXT;`);
        if (!cols.includes('foto_factura')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN foto_factura TEXT;`);
        if (!cols.includes('devolucion_asignacion_id')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN devolucion_asignacion_id INTEGER;`);
        if (!cols.includes('hora_ingreso_geocerca')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN hora_ingreso_geocerca TEXT;`);
        if (!cols.includes('hora_entrega_efectiva')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN hora_entrega_efectiva TEXT;`);
        if (!cols.includes('hora_salida_geocerca')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN hora_salida_geocerca TEXT;`);
        if (!cols.includes('tiempo_descarga_min')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN tiempo_descarga_min INTEGER;`);
        if (!cols.includes('tiempo_espera_post_entrega_min')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN tiempo_espera_post_entrega_min INTEGER;`);
        if (!cols.includes('tiempo_total_permanencia_min')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN tiempo_total_permanencia_min INTEGER;`);
        if (!cols.includes('firma_cliente')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN firma_cliente TEXT;`);
        if (!cols.includes('nombre_recibe')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN nombre_recibe TEXT;`);
        if (!cols.includes('boleta_numero')) db.exec(`ALTER TABLE ops_delivery_queue ADD COLUMN boleta_numero TEXT;`);
    } catch (e: any) {
        console.warn('Self-healing ops_delivery_queue check warning:', e.message);
    }

    // Always run self-healing check for ops_delivery_assignments
    try {
        const tableInfo = db.prepare("PRAGMA table_info('ops_delivery_assignments')").all();
        const cols = tableInfo.map((c: any) => c.name);
        if (!cols.includes('fecha_creacion')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN fecha_creacion TEXT;`);
        if (!cols.includes('fecha_inicio_retorno')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN fecha_inicio_retorno TEXT;`);
        if (!cols.includes('latitud_retorno')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN latitud_retorno REAL;`);
        if (!cols.includes('longitud_retorno')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN longitud_retorno REAL;`);
        if (!cols.includes('latitud_llegada')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN latitud_llegada REAL;`);
        if (!cols.includes('longitud_llegada')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN longitud_llegada REAL;`);
        if (!cols.includes('latitud_inicio')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN latitud_inicio REAL;`);
        if (!cols.includes('longitud_inicio')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN longitud_inicio REAL;`);
        if (!cols.includes('fecha_salida')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN fecha_salida TEXT;`);
        if (!cols.includes('fecha_llegada_bodega')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN fecha_llegada_bodega TEXT;`);
        if (!cols.includes('consecutivo')) db.exec(`ALTER TABLE ops_delivery_assignments ADD COLUMN consecutivo TEXT;`);
    } catch (e: any) {
        console.warn('Self-healing ops_delivery_assignments check warning:', e.message);
    }

    // Always run self-healing check for ops_delivery_gps_logs
    try {
        const tableInfo = db.prepare("PRAGMA table_info('ops_delivery_gps_logs')").all();
        const cols = tableInfo.map((c: any) => c.name);
        if (!cols.includes('evento')) db.exec(`ALTER TABLE ops_delivery_gps_logs ADD COLUMN evento TEXT;`);
    } catch (e: any) {
        console.warn('Self-healing ops_delivery_gps_logs check warning:', e.message);
    }

    // Always run self-healing check for ops_client_emails, ops_delivery_discards and ops_app_version_settings tables
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
            CREATE TABLE IF NOT EXISTS ops_app_version_settings (
                id INTEGER PRIMARY KEY,
                version_name TEXT NOT NULL,
                version_code INTEGER NOT NULL,
                apk_url TEXT NOT NULL,
                release_notes TEXT,
                global_ota_paused INTEGER DEFAULT 0,
                force_update INTEGER DEFAULT 0,
                server_url_primary TEXT,
                server_url_fallback TEXT,
                updated_at TEXT NOT NULL
            );
        `);
    } catch (e: any) {
        console.warn('Self-healing create auxiliary tables warning:', e.message);
    }

    // Ensure columns for ops_app_version_settings
    try {
        const versionCols = db.prepare("PRAGMA table_info('ops_app_version_settings')").all().map((c: any) => c.name);
        if (!versionCols.includes('server_url_primary')) db.exec(`ALTER TABLE ops_app_version_settings ADD COLUMN server_url_primary TEXT;`);
        if (!versionCols.includes('server_url_fallback')) db.exec(`ALTER TABLE ops_app_version_settings ADD COLUMN server_url_fallback TEXT;`);
        if (!versionCols.includes('force_update')) db.exec(`ALTER TABLE ops_app_version_settings ADD COLUMN force_update INTEGER DEFAULT 0;`);
        if (!versionCols.includes('global_ota_paused')) db.exec(`ALTER TABLE ops_app_version_settings ADD COLUMN global_ota_paused INTEGER DEFAULT 0;`);

        // Ensure default row exists
        const countRow = db.prepare("SELECT COUNT(*) as count FROM ops_app_version_settings").get() as any;
        if (!countRow || countRow.count === 0) {
            db.prepare(`
                INSERT INTO ops_app_version_settings 
                (id, version_name, version_code, apk_url, release_notes, global_ota_paused, force_update, server_url_primary, server_url_fallback, updated_at)
                VALUES (1, '1.2.37', 56, '/downloads/apk/ClicDriver.apk', 'Actualización Oficial v1.2.37: Protección PopScope contra salidas accidentales, política de retención local de fotos hasta la nueva ruta y diagnóstico silencioso de sensores para TI.', 0, 1, '192.168.1.14:9003', '192.168.1.14:9001', CURRENT_TIMESTAMP)
            `).run();
        } else {
            // Auto-actualizar registro por defecto si está en versión inferior
            db.prepare(`
                UPDATE ops_app_version_settings
                SET version_name = '1.2.37', version_code = 56, release_notes = 'Actualización Oficial v1.2.37: Protección PopScope contra salidas accidentales, política de retención local de fotos hasta la nueva ruta y diagnóstico silencioso de sensores para TI.'
                WHERE id = 1 AND version_code < 56
            `).run();
        }
    } catch (e: any) {
        console.warn('Self-healing ops_app_version_settings warning:', e.message);
    }

    // Ensure columns for fleet_registered_devices
    try {
        const devCols = db.prepare("PRAGMA table_info('fleet_registered_devices')").all().map((c: any) => c.name);
        if (!devCols.includes('phone_number')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN phone_number TEXT;`);
        if (!devCols.includes('current_app_version')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN current_app_version TEXT;`);
        if (!devCols.includes('current_version_code')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN current_version_code INTEGER;`);
        if (!devCols.includes('battery_level')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN battery_level INTEGER;`);
        if (!devCols.includes('ota_paused')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN ota_paused INTEGER DEFAULT 0;`);
        if (!devCols.includes('install_failed_count')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN install_failed_count INTEGER DEFAULT 0;`);
        if (!devCols.includes('last_install_error')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN last_install_error TEXT;`);
        
        // Advanced MDM Telemetry columns
        if (!devCols.includes('current_lat')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN current_lat REAL;`);
        if (!devCols.includes('current_lng')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN current_lng REAL;`);
        if (!devCols.includes('installed_apps_json')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN installed_apps_json TEXT;`);
        if (!devCols.includes('storage_free_mb')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN storage_free_mb INTEGER;`);
        if (!devCols.includes('storage_total_mb')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN storage_total_mb INTEGER;`);
        if (!devCols.includes('ram_free_mb')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN ram_free_mb INTEGER;`);
        if (!devCols.includes('ram_total_mb')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN ram_total_mb INTEGER;`);
        if (!devCols.includes('battery_temp_c')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN battery_temp_c REAL;`);
        if (!devCols.includes('is_charging')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN is_charging INTEGER;`);
        if (!devCols.includes('network_type')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN network_type TEXT;`);
        if (!devCols.includes('sim_carrier')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN sim_carrier TEXT;`);
        if (!devCols.includes('os_version')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN os_version TEXT;`);
        if (!devCols.includes('device_model')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN device_model TEXT;`);
        if (!devCols.includes('shutdown_lat')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN shutdown_lat REAL;`);
        if (!devCols.includes('shutdown_lng')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN shutdown_lng REAL;`);
        if (!devCols.includes('shutdown_at')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN shutdown_at TEXT;`);
        if (!devCols.includes('shutdown_battery')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN shutdown_battery INTEGER;`);
        if (!devCols.includes('shutdown_reason')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN shutdown_reason TEXT;`);
        if (!devCols.includes('is_device_owner')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN is_device_owner INTEGER;`);
        if (!devCols.includes('serial_number')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN serial_number TEXT;`);
        if (!devCols.includes('imei')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN imei TEXT;`);

        // MDM Hardening & App Whitelist columns
        if (!devCols.includes('mdm_kiosk_enabled')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_kiosk_enabled INTEGER DEFAULT 0;`);
        if (!devCols.includes('mdm_force_gps')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_force_gps INTEGER DEFAULT 1;`);
        if (!devCols.includes('mdm_disallow_airplane_mode')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_disallow_airplane_mode INTEGER DEFAULT 0;`);
        if (!devCols.includes('mdm_disallow_mobile_data_off')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_disallow_mobile_data_off INTEGER DEFAULT 0;`);
        if (!devCols.includes('mdm_disallow_battery_saver')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_disallow_battery_saver INTEGER DEFAULT 0;`);
        if (!devCols.includes('mdm_block_uninstall')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_block_uninstall INTEGER DEFAULT 1;`);
        if (!devCols.includes('mdm_disallow_settings')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_disallow_settings INTEGER DEFAULT 0;`);
        if (!devCols.includes('mdm_disallow_tethering')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_disallow_tethering INTEGER DEFAULT 0;`);
        if (!devCols.includes('mdm_disallow_install_apps')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_disallow_install_apps INTEGER DEFAULT 0;`);
        if (!devCols.includes('mdm_disallow_play_store_install')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_disallow_play_store_install INTEGER DEFAULT 0;`);
        if (!devCols.includes('mdm_always_on_vpn')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_always_on_vpn INTEGER DEFAULT 0;`);
        if (!devCols.includes('mdm_whitelisted_packages')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_whitelisted_packages TEXT;`);
        if (!devCols.includes('mdm_pinned_apps')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_pinned_apps TEXT;`);
        if (!devCols.includes('mdm_pending_uninstalls')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_pending_uninstalls TEXT;`);
        if (!devCols.includes('mdm_pending_reboot')) db.exec(`ALTER TABLE fleet_registered_devices ADD COLUMN mdm_pending_reboot INTEGER DEFAULT 0;`);
    } catch (e: any) {
        console.warn('Self-healing auxiliary tables check warning:', e.message);
    }

    console.log('Operations schema initialized at version', currentVersion < 17 ? 17 : currentVersion);
}
