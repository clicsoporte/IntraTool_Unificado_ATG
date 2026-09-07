import 'dart:convert';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import '../models/delivery_doc.dart';
import 'photo_storage_service.dart';

class OfflineDbService {
  static Database? _db;

  Future<Database> get database async {
    if (_db != null) {
      await autoHealSchema(_db!);
      return _db!;
    }
    _db = await _initDb();
    await autoHealSchema(_db!);
    return _db!;
  }

  Future<void> autoHealSchema(Database db) async {
    try {
      await db.execute('PRAGMA journal_mode=WAL;');
      await db.execute('PRAGMA busy_timeout=5000;');
    } catch (_) {}
    try {
      await db.execute('CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)');
      await db.execute('''
        CREATE TABLE IF NOT EXISTS deliveries (
          id INTEGER PRIMARY KEY,
          documento_numero TEXT,
          boleta_numero TEXT,
          tipo_documento TEXT,
          cliente_nombre TEXT,
          cliente_id TEXT,
          lugar_entrega TEXT,
          comentario TEXT,
          estado TEXT,
          chofer_nombre TEXT,
          placa_vehiculo TEXT,
          ruta_nombre TEXT,
          fecha_entrega TEXT,
          nombre_recibe TEXT,
          firma_cliente TEXT,
          foto_evidencia TEXT,
          foto_factura TEXT,
          is_synced INTEGER DEFAULT 1,
          latitud REAL,
          longitud REAL
        )
      ''');

      final cols = await db.rawQuery("PRAGMA table_info('deliveries')");
      final colNames = cols.map((c) => c['name'].toString().toLowerCase()).toSet();

      if (!colNames.contains('latitud')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN latitud REAL');
      }
      if (!colNames.contains('longitud')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN longitud REAL');
      }
      if (!colNames.contains('boleta_numero')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN boleta_numero TEXT');
      }
      if (!colNames.contains('tipo_documento')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN tipo_documento TEXT');
      }
      if (!colNames.contains('observaciones')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN observaciones TEXT');
      }
      if (!colNames.contains('vendedor_phone')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN vendedor_phone TEXT');
      }
      if (!colNames.contains('vendedor_nombre')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN vendedor_nombre TEXT');
      }
      if (!colNames.contains('vendedor_sms_prefs')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN vendedor_sms_prefs TEXT');
      }
      if (!colNames.contains('creado_por_phone')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN creado_por_phone TEXT');
      }
      if (!colNames.contains('creado_por_nombre')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN creado_por_nombre TEXT');
      }
      if (!colNames.contains('creado_por_sms_prefs')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN creado_por_sms_prefs TEXT');
      }
      if (!colNames.contains('it_emergency_phones')) {
        await db.execute('ALTER TABLE deliveries ADD COLUMN it_emergency_phones TEXT');
      }

      await db.execute('''
        CREATE TABLE IF NOT EXISTS delivery_lines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          delivery_id INTEGER,
          codigo TEXT,
          desc TEXT,
          pedida INTEGER,
          entregada INTEGER,
          faltante INTEGER
        )
      ''');

      await db.execute('''
        CREATE TABLE IF NOT EXISTS driver_assignment (
          id INTEGER PRIMARY KEY,
          ruta_id INTEGER,
          ruta_nombre TEXT,
          vehiculo_id INTEGER,
          vehiculo_placa TEXT,
          fecha TEXT,
          fecha_salida TEXT,
          siguiente_cliente TEXT,
          estado_flujo TEXT
        )
      ''');

      await db.execute('''
        CREATE TABLE IF NOT EXISTS cached_routes (id INTEGER PRIMARY KEY, name TEXT)
      ''');

      await db.execute('''
        CREATE TABLE IF NOT EXISTS cached_vehicles (id INTEGER PRIMARY KEY, plate TEXT, brand TEXT, model TEXT)
      ''');

      await db.execute('''
        CREATE TABLE IF NOT EXISTS offline_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT,
          payload TEXT,
          timestamp TEXT
        )
      ''');

      await db.execute('''
        CREATE TABLE IF NOT EXISTS app_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level TEXT,
          category TEXT DEFAULT 'auditoria',
          message TEXT,
          timestamp TEXT,
          is_synced INTEGER DEFAULT 0
        )
      ''');
      try { await db.execute("ALTER TABLE app_logs ADD COLUMN category TEXT DEFAULT 'auditoria'"); } catch (_) {}
    } catch (_) {}
  }

  Future<Database> _initDb() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'driver_offline_v2.db');

    return await openDatabase(
      path,
      version: 4,
      onConfigure: (db) async {
        try {
          await db.execute('PRAGMA journal_mode=WAL;');
          await db.execute('PRAGMA busy_timeout=5000;');
        } catch (_) {}
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        await db.execute('CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)');
        try { await db.execute('ALTER TABLE deliveries ADD COLUMN latitud REAL'); } catch (_) {}
        try { await db.execute('ALTER TABLE deliveries ADD COLUMN longitud REAL'); } catch (_) {}
      },
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE deliveries (
            id INTEGER PRIMARY KEY,
            documento_numero TEXT,
            boleta_numero TEXT,
            tipo_documento TEXT,
            cliente_nombre TEXT,
            cliente_id TEXT,
            lugar_entrega TEXT,
            comentario TEXT,
            estado TEXT,
            chofer_nombre TEXT,
            placa_vehiculo TEXT,
            ruta_nombre TEXT,
            fecha_entrega TEXT,
            nombre_recibe TEXT,
            firma_cliente TEXT,
            foto_evidencia TEXT,
            foto_factura TEXT,
            is_synced INTEGER DEFAULT 1,
            latitud REAL,
            longitud REAL
          )
        ''');

        await db.execute('''
          CREATE TABLE delivery_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            delivery_id INTEGER,
            codigo TEXT,
            desc TEXT,
            pedida INTEGER,
            entregada INTEGER,
            faltante INTEGER
          )
        ''');

        await db.execute('''
          CREATE TABLE driver_assignment (
            id INTEGER PRIMARY KEY,
            ruta_id INTEGER,
            ruta_nombre TEXT,
            vehiculo_id INTEGER,
            vehiculo_placa TEXT,
            fecha TEXT,
            fecha_salida TEXT,
            siguiente_cliente TEXT,
            estado_flujo TEXT
          )
        ''');

        await db.execute('''
          CREATE TABLE cached_routes (
            id INTEGER PRIMARY KEY,
            name TEXT
          )
        ''');

        await db.execute('''
          CREATE TABLE cached_vehicles (
            id INTEGER PRIMARY KEY,
            plate TEXT,
            brand TEXT,
            model TEXT
          )
        ''');

        await db.execute('''
          CREATE TABLE offline_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            payload TEXT,
            timestamp TEXT
          )
        ''');

        await db.execute('''
          CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT
          )
        ''');
      },
    );
  }

  // System Config Management
  Future<void> saveSystemConfig(Map<String, dynamic> config) async {
    final db = await database;
    await db.execute('CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)');
    final batch = db.batch();
    config.forEach((key, val) {
      batch.insert('system_config', {'key': key, 'value': val?.toString() ?? ''}, conflictAlgorithm: ConflictAlgorithm.replace);
    });
    await batch.commit(noResult: true);
  }

  Future<Map<String, String>> getSystemConfig() async {
    final db = await database;
    await db.execute('CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)');
    final maps = await db.query('system_config');
    final Map<String, String> res = {};
    for (var m in maps) {
      res[m['key'].toString()] = m['value'].toString();
    }
    return res;
  }

  /// Guarda de forma indestructible las URLs primaria, fallback y activa en SQLite
  Future<void> saveServerUrlsConfig({required String primary, String? fallback, String? active}) async {
    final map = <String, dynamic>{
      'server_url_primary': primary.trim(),
    };
    if (fallback != null) {
      map['server_url_fallback'] = fallback.trim();
    }
    if (active != null) {
      map['server_url_active'] = active.trim();
    }
    await saveSystemConfig(map);
  }

  /// Lee las URLs de alta disponibilidad guardadas en SQLite
  Future<Map<String, String>> getServerUrlsConfig() async {
    final cfg = await getSystemConfig();
    return {
      'primary': cfg['server_url_primary'] ?? '',
      'fallback': cfg['server_url_fallback'] ?? '',
      'active': cfg['server_url_active'] ?? '',
    };
  }

  Future<String> getNextBoletaConsecutive() async {
    final config = await getSystemConfig();
    final prefix = config['boleta_consecutive_prefix'] ?? 'BOL-';
    final nextNumStr = config['boleta_consecutive_next'] ?? '1';
    final nextNum = int.tryParse(nextNumStr) ?? 1;

    final formatted = '$prefix${nextNum.toString().padLeft(6, '0')}';
    await saveSystemConfig({'boleta_consecutive_next': (nextNum + 1).toString()});
    return formatted;
  }

  // Deliveries Management
  Future<void> saveDeliveries(List<DeliveryDoc> incomingList) async {
    final db = await database;
    try { await db.execute('ALTER TABLE deliveries ADD COLUMN latitud REAL'); } catch (_) {}
    try { await db.execute('ALTER TABLE deliveries ADD COLUMN longitud REAL'); } catch (_) {}
    
    final incomingIds = incomingList.map((d) => d.id).toSet();

    // 1. Obtener todos los documentos guardados actualmente en el dispositivo (Facturas y Recolectas)
    final currentLocalRows = await db.query('deliveries', columns: ['id', 'is_synced', 'estado']);
    
    // 2. Identificar documentos que ya no están asignados en el servidor (desasignados, liberados o transferidos)
    final batch = db.batch();
    for (final row in currentLocalRows) {
      final docId = row['id'] as int;
      final isSynced = (row['is_synced'] as int?) ?? 1;
      final estado = (row['estado'] as String?) ?? 'pendiente';

      if (!incomingIds.contains(docId)) {
        // Solo borrar si no es una entrega/recolección offline gestionada por el chofer pendiente de subir
        if (isSynced == 1 || estado == 'pendiente' || estado == 'en_ruta') {
          batch.delete('deliveries', where: 'id = ?', whereArgs: [docId]);
          batch.delete('delivery_lines', where: 'delivery_id = ?', whereArgs: [docId]);
        }
      }
    }

    // 3. Insertar / Actualizar entregas y recolectas entrantes vigentes
    final pendingUnsynced = await db.query('deliveries', columns: ['id'], where: 'is_synced = 0');
    final unsyncedIds = pendingUnsynced.map((r) => r['id'] as int).toSet();

    for (var doc in incomingList) {
      // Si el chofer ya editó o completó este documento offline, no pisar su edición con el estado del servidor
      if (unsyncedIds.contains(doc.id)) {
        continue;
      }
      batch.insert('deliveries', doc.toSqlite(), conflictAlgorithm: ConflictAlgorithm.replace);
      batch.delete('delivery_lines', where: 'delivery_id = ?', whereArgs: [doc.id]);
      for (var line in doc.lines) {
        batch.insert('delivery_lines', {
          'delivery_id': doc.id,
          'codigo': line.codigo,
          'desc': line.desc,
          'pedida': line.pedida,
          'entregada': line.entregada,
          'faltante': line.faltante,
        });
      }
    }
    await batch.commit(noResult: true);
  }

  Future<List<DeliveryDoc>> getDeliveries() async {
    final db = await database;
    // Excluimos explícitamente foto_evidencia, foto_factura y firma_cliente del listado principal
    // para evitar que filas pesadas superen el límite de 2MB del CursorWindow de Android.
    final maps = await db.query(
      'deliveries',
      columns: [
        'id',
        'documento_numero',
        'boleta_numero',
        'tipo_documento',
        'cliente_nombre',
        'cliente_id',
        'lugar_entrega',
        'comentario',
        'observaciones',
        'estado',
        'chofer_nombre',
        'placa_vehiculo',
        'ruta_nombre',
        'fecha_entrega',
        'nombre_recibe',
        'is_synced',
        'latitud',
        'longitud',
      ],
      orderBy: 'id DESC',
    );
    List<DeliveryDoc> result = [];
    for (var m in maps) {
      final doc = DeliveryDoc.fromJson(m);
      final lineMaps = await db.query('delivery_lines', where: 'delivery_id = ?', whereArgs: [doc.id]);
      if (lineMaps.isNotEmpty) {
        doc.lines = lineMaps.map((l) => DeliveryLine.fromJson(l)).toList();
      }
      result.add(doc);
    }
    return result;
  }

  Future<void> updateDeliveryState(DeliveryDoc doc) async {
    final db = await database;
    await db.update(
      'deliveries',
      doc.toSqlite(),
      where: 'id = ?',
      whereArgs: [doc.id],
    );
    await db.delete('delivery_lines', where: 'delivery_id = ?', whereArgs: [doc.id]);
    final batch = db.batch();
    for (var line in doc.lines) {
      batch.insert('delivery_lines', {
        'delivery_id': doc.id,
        'codigo': line.codigo,
        'desc': line.desc,
        'pedida': line.pedida,
        'entregada': line.entregada,
        'faltante': line.faltante,
      });
    }
    await batch.commit(noResult: true);
  }

  Future<List<DeliveryDoc>> getUnsyncedDeliveries() async {
    final db = await database;
    // 1. Consultar primero solo los IDs no sincronizados
    final idMaps = await db.query('deliveries', columns: ['id'], where: 'is_synced = ?', whereArgs: [0]);
    List<DeliveryDoc> result = [];
    
    // 2. Recuperar cada documento individualmente para que cada fila quepa holgadamente en su propio CursorWindow
    for (var idRow in idMaps) {
      final docId = idRow['id'] as int;
      try {
        final singleDocList = await db.query('deliveries', where: 'id = ?', whereArgs: [docId], limit: 1);
        if (singleDocList.isNotEmpty) {
          final doc = DeliveryDoc.fromJson(singleDocList.first);
          final lineMaps = await db.query('delivery_lines', where: 'delivery_id = ?', whereArgs: [doc.id]);
          if (lineMaps.isNotEmpty) {
            doc.lines = lineMaps.map((l) => DeliveryLine.fromJson(l)).toList();
          }
          result.add(doc);
        }
      } catch (e) {
        // En caso de que una fila individual sea excepcionalmente pesada, intentar recuperarla sin blobs de fotos o registrar log
        try {
          final fallbackDocList = await db.query(
            'deliveries',
            columns: [
              'id', 'documento_numero', 'boleta_numero', 'tipo_documento', 'cliente_nombre',
              'cliente_id', 'lugar_entrega', 'comentario', 'observaciones', 'estado',
              'chofer_nombre', 'placa_vehiculo', 'ruta_nombre', 'fecha_entrega', 'nombre_recibe',
              'firma_cliente', 'is_synced', 'latitud', 'longitud'
            ],
            where: 'id = ?',
            whereArgs: [docId],
            limit: 1,
          );
          if (fallbackDocList.isNotEmpty) {
            final doc = DeliveryDoc.fromJson(fallbackDocList.first);
            final lineMaps = await db.query('delivery_lines', where: 'delivery_id = ?', whereArgs: [doc.id]);
            if (lineMaps.isNotEmpty) {
              doc.lines = lineMaps.map((l) => DeliveryLine.fromJson(l)).toList();
            }
            result.add(doc);
          }
        } catch (_) {}
      }
    }
    return result;
  }

  Future<int> countUnsyncedDeliveries() async {
    try {
      final db = await database;
      final res = await db.rawQuery('SELECT COUNT(*) as count FROM deliveries WHERE is_synced = 0');
      if (res.isNotEmpty && res.first['count'] != null) {
        return (res.first['count'] as num).toInt();
      }
    } catch (_) {}
    return 0;
  }

  // Active Assignment Local Persistence
  Future<void> saveActiveAssignment(Map<String, dynamic> data) async {
    final db = await database;
    await db.delete('driver_assignment');
    await db.insert(
      'driver_assignment',
      {
        'id': data['id'],
        'ruta_id': data['ruta_id'],
        'ruta_nombre': data['ruta_nombre'],
        'vehiculo_id': data['vehiculo_id'],
        'vehiculo_placa': data['vehiculo_placa'],
        'fecha': data['fecha'],
        'fecha_salida': data['fecha_salida'],
        'siguiente_cliente': data['siguiente_cliente'],
        'estado_flujo': data['estado_flujo'] ?? 'creada',
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Map<String, dynamic>?> getActiveAssignment() async {
    final db = await database;
    final maps = await db.query('driver_assignment', limit: 1);
    if (maps.isNotEmpty) return Map<String, dynamic>.from(maps.first);
    return null;
  }

  Future<void> clearActiveAssignment() async {
    final db = await database;
    await db.delete('driver_assignment');
    // Solo borrar entregas que ya hayan sido confirmadas y subidas al servidor
    // Las que tengan is_synced == 0 se conservan para que SyncEngine las suba cuando haya red
    await db.delete('deliveries', where: 'is_synced = 1');
  }

  // Offline Event Queue
  Future<void> queueOfflineEvent(String type, Map<String, dynamic> payload) async {
    final db = await database;
    await db.insert('offline_events', {
      'type': type,
      'payload': jsonEncode(payload),
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  Future<List<Map<String, dynamic>>> getOfflineEvents() async {
    final db = await database;
    return await db.query('offline_events', orderBy: 'id ASC');
  }

  Future<void> deleteOfflineEvent(int id) async {
    final db = await database;
    await db.delete('offline_events', where: 'id = ?', whereArgs: [id]);
  }

  // Catalogs Cache
  Future<void> saveCatalogs(List routes, List vehicles) async {
    final db = await database;
    final batch = db.batch();
    batch.delete('cached_routes');
    batch.delete('cached_vehicles');
    for (var r in routes) {
      batch.insert('cached_routes', {'id': r['id'], 'name': r['name']});
    }
    for (var v in vehicles) {
      batch.insert('cached_vehicles', {
        'id': v['id'],
        'plate': v['plate'],
        'brand': v['brand'] ?? '',
        'model': v['model'] ?? '',
      });
    }
    await batch.commit(noResult: true);
  }

  Future<Map<String, dynamic>> getCachedCatalogs() async {
    final db = await database;
    final routes = await db.query('cached_routes');
    final vehicles = await db.query('cached_vehicles');
    return {'routes': routes, 'vehicles': vehicles};
  }

  /// Purga de Retención: Limpia entregas y archivos de fotos de la ruta anterior AL INICIAR UNA NUEVA RUTA
  Future<void> purgePreviousRouteData() async {
    final db = await database;
    try {
      final oldDocs = await db.query('deliveries', columns: ['foto_evidencia', 'foto_factura']);
      for (final doc in oldDocs) {
        if (doc['foto_evidencia'] != null) {
          await PhotoStorageService.deleteLocalPhoto(doc['foto_evidencia'].toString());
        }
        if (doc['foto_factura'] != null) {
          await PhotoStorageService.deleteLocalPhoto(doc['foto_factura'].toString());
        }
      }
    } catch (_) {}

    await db.transaction((txn) async {
      await txn.delete('deliveries');
      await txn.delete('delivery_lines');
      await txn.delete('driver_assignment');
      await txn.delete('offline_events');
    });
  }

  /// Reset de Emergencia: Vaciado atómico de tablas operativas (entregas, líneas, asignación y eventos offline)
  Future<void> emergencyResetOperationalData() async {
    final db = await database;
    await db.transaction((txn) async {
      await txn.delete('deliveries');
      await txn.delete('delivery_lines');
      await txn.delete('driver_assignment');
      await txn.delete('offline_events');
    });
  }
}
