import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import '../models/log_entry.dart';
import 'settings_store.dart';

class LoggerService {
  final SettingsStore store;
  static Database? _db;

  LoggerService(this.store);

  Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _initDatabase();
    return _db!;
  }

  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final pathLocation = join(dbPath, 'clic_soporte_logs.db');

    return await openDatabase(
      pathLocation,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE app_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            level TEXT NOT NULL,
            category TEXT NOT NULL,
            message TEXT NOT NULL,
            details TEXT
          )
        ''');
      },
    );
  }

  Future<void> log({
    required String level,
    required String category,
    required String message,
    String? details,
  }) async {
    final now = DateTime.now();
    final timestamp = "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')} ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}";

    // Also update SettingsStore for last status badge
    store.setLastStatus('[$category] $message • ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}');

    try {
      final db = await database;
      final entry = LogEntry(
        timestamp: timestamp,
        level: level,
        category: category,
        message: message,
        details: details,
      );
      await db.insert('app_logs', entry.toMap());
      await _cleanOldLogs(db);
    } catch (e) {
      print('Error writing log to SQLite: $e');
    }
  }

  Future<void> _cleanOldLogs(Database db) async {
    try {
      // Keep max 500 recent records
      await db.execute('''
        DELETE FROM app_logs WHERE id NOT IN (
          SELECT id FROM app_logs ORDER BY id DESC LIMIT 500
        )
      ''');
    } catch (_) {}
  }

  Future<List<LogEntry>> getLogs({String? filterLevel, String? filterCategory, String? searchQuery}) async {
    final db = await database;
    String whereClause = '';
    List<dynamic> whereArgs = [];

    List<String> conditions = [];
    if (filterLevel != null && filterLevel != 'ALL') {
      conditions.add('level = ?');
      whereArgs.add(filterLevel);
    }
    if (filterCategory != null && filterCategory != 'ALL') {
      conditions.add('category = ?');
      whereArgs.add(filterCategory);
    }
    if (searchQuery != null && searchQuery.isNotEmpty) {
      conditions.add('(message LIKE ? OR details LIKE ?)');
      whereArgs.add('%$searchQuery%');
      whereArgs.add('%$searchQuery%');
    }

    if (conditions.isNotEmpty) {
      whereClause = conditions.join(' AND ');
    }

    final maps = await db.query(
      'app_logs',
      where: whereClause.isEmpty ? null : whereClause,
      whereArgs: whereArgs.isEmpty ? null : whereArgs,
      orderBy: 'id DESC',
      limit: 200,
    );

    return maps.map((m) => LogEntry.fromMap(m)).toList();
  }

  Future<void> clearLogs() async {
    final db = await database;
    await db.delete('app_logs');
    store.setLastStatus('Historial de logs vaciado • ${DateTime.now().hour}:${DateTime.now().minute}');
  }
}
