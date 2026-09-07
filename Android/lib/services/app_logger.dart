import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'offline_db_service.dart';

class AppLogEntry {
  final String timestamp;
  final String level; // 'INFO', 'WARN', 'ERROR', 'SUCCESS'
  final String category; // 'auditoria', 'reversion', 'entrega', 'reimpresion', 'pausa', 'averia', 'tecnico'
  final String message;
  bool isSyncedToServer;

  AppLogEntry({
    required this.timestamp,
    required this.level,
    this.category = 'auditoria',
    required this.message,
    this.isSyncedToServer = false,
  });

  Map<String, dynamic> toJson({
    int? userId,
    String? userName,
    String? phone,
    String? route,
    String? plate,
  }) => {
        'userId': userId,
        'userName': userName,
        'choferNombre': userName,
        'choferTelefono': phone,
        'rutaNombre': route,
        'placaVehiculo': plate,
        'level': level,
        'category': category,
        'message': message,
        'timestamp': DateTime.now().toIso8601String(),
      };
}

class AppLogger {
  static final List<AppLogEntry> _logs = [];

  static String _redactSecrets(String text) {
    if (text.isEmpty) return text;
    // Ocultar PINs numéricos de 4-6 dígitos en logs (ej: PIN=1234, PIN Admin: 1234, PIN Supervisor: 4343 -> ****)
    var sanitized = text.replaceAllMapped(
      RegExp(r'(PIN\s*[\w\s]*[:=]\s*)(\d{4,6})', caseSensitive: false),
      (m) => '${m[1]}****',
    );
    // Ocultar Bearer tokens o contraseñas en logs
    sanitized = sanitized.replaceAllMapped(
      RegExp(r'(Bearer\s+|password=)[a-zA-Z0-9_\-\.]{8,}', caseSensitive: false),
      (m) => '${m[1]}[REDACTED]',
    );
    return sanitized;
  }

  static void log(String message, {String level = 'INFO', String category = 'auditoria'}) {
    final cleanMessage = _redactSecrets(message);
    final entry = AppLogEntry(
      timestamp: DateTime.now().toString().substring(11, 19),
      level: level,
      category: category,
      message: cleanMessage,
    );
    _logs.insert(0, entry);
    if (_logs.length > 200) {
      _logs.removeLast();
    }

    // Persistir de forma asíncrona en SQLite para sobrevivir a reinicios o cambios de aislado
    try {
      final dbService = OfflineDbService();
      dbService.database.then((db) {
        db.insert('app_logs', {
          'level': level,
          'category': category,
          'message': message,
          'timestamp': DateTime.now().toIso8601String(),
          'is_synced': 0,
        }).catchError((_) => 0);
      }).catchError((_) {});
    } catch (_) {}
  }

  static Future<void> syncLogsToServer(String baseUrl) async {
    if (baseUrl.isEmpty) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      final rawUserId = prefs.get('user_id');
      final userId = (rawUserId is int)
          ? rawUserId
          : (rawUserId is String ? (int.tryParse(rawUserId) ?? 1) : 1);
      final userName = prefs.getString('user_name') ?? prefs.getString('user_email') ?? 'Chofer APK';
      final phone = prefs.getString('driver_phone_number') ?? '';
      final route = prefs.getString('current_route_name') ?? '';
      final plate = prefs.getString('current_vehicle_plate') ?? '';

      final dbService = OfflineDbService();
      final db = await dbService.database;
      
      // 1. Obtener logs pendientes de SQLite (hasta 100 por ciclo)
      final pendingRows = await db.query(
        'app_logs',
        where: 'is_synced = 0',
        orderBy: 'id ASC',
        limit: 100,
      );

      final List<Map<String, dynamic>> payload = [];
      final List<int> idsToMark = [];

      for (var row in pendingRows) {
        idsToMark.add(row['id'] as int);
        payload.add({
          'userId': userId,
          'userName': userName,
          'choferNombre': userName,
          'choferTelefono': phone,
          'rutaNombre': route,
          'placaVehiculo': plate,
          'level': row['level'] ?? 'INFO',
          'category': row['category'] ?? 'auditoria',
          'message': row['message'] ?? '',
          'timestamp': row['timestamp'] ?? DateTime.now().toIso8601String(),
        });
      }

      // Si no hay en SQLite pero hay en memoria pendientes
      if (payload.isEmpty) {
        final unsyncedMem = _logs.where((l) => !l.isSyncedToServer).toList();
        if (unsyncedMem.isEmpty) return;

        payload.addAll(unsyncedMem.map((l) => l.toJson(
          userId: userId,
          userName: userName,
          phone: phone,
          route: route,
          plate: plate,
        )));
      }

      final cleanBase = baseUrl.trim().endsWith('/') ? baseUrl.trim().substring(0, baseUrl.trim().length - 1) : baseUrl.trim();
      final target = cleanBase.startsWith('http://') || cleanBase.startsWith('https://') ? cleanBase : 'http://$cleanBase';
      final url = Uri.parse('$target/api/fleet/logs');
      
      final token = prefs.getString('auth_token');
      final headers = <String, String>{
        'Content-Type': 'application/json',
        'X-Fleet-App': 'ClicDriver',
      };
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }

      final res = await http.post(
        url,
        headers: headers,
        body: jsonEncode({'logs': payload}),
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        if (idsToMark.isNotEmpty) {
          await db.delete('app_logs', where: 'id <= ?', whereArgs: [idsToMark.last]);
        }
        for (var l in _logs) {
          l.isSyncedToServer = true;
        }
      }
    } catch (_) {}
  }

  static List<AppLogEntry> get logs => List.unmodifiable(_logs);

  static void clear() {
    _logs.clear();
  }

  static void showLogsDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1E1E1E),
          title: Row(
            children: [
              const Icon(Icons.bug_report_rounded, color: Color(0xFFFF6B00)),
              const SizedBox(width: 10),
              const Text('Logs de Diagnóstico', style: TextStyle(color: Colors.white, fontSize: 18)),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.delete_outline, color: Colors.grey, size: 20),
                onPressed: () {
                  clear();
                  setDialogState(() {});
                },
              ),
            ],
          ),
          content: SizedBox(
            width: double.maxFinite,
            height: 350,
            child: _logs.isEmpty
                ? const Center(
                    child: Text('No hay registros en el log.', style: TextStyle(color: Colors.grey)),
                  )
                : ListView.builder(
                    itemCount: _logs.length,
                    itemBuilder: (context, index) {
                      final log = _logs[index];
                      final isError = log.level == 'ERROR';
                      final isSuccess = log.level == 'SUCCESS';

                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: isError
                              ? Colors.red.withOpacity(0.12)
                              : isSuccess
                                  ? Colors.green.withOpacity(0.12)
                                  : const Color(0xFF262626),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: isError
                                ? Colors.red.withOpacity(0.4)
                                : isSuccess
                                    ? Colors.green.withOpacity(0.4)
                                    : Colors.white12,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Header superior: Timestamp + Nivel Badge
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  '🕒 ${log.timestamp}',
                                  style: const TextStyle(color: Colors.grey, fontSize: 10.5, fontFamily: 'monospace'),
                                ),
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: isError
                                        ? Colors.red.withOpacity(0.2)
                                        : isSuccess
                                            ? Colors.green.withOpacity(0.2)
                                            : Colors.white10,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    log.level,
                                    style: TextStyle(
                                      color: isError
                                          ? Colors.redAccent
                                          : isSuccess
                                              ? Colors.greenAccent
                                              : const Color(0xFFFF6B00),
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      fontFamily: 'monospace',
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            // Contenido del mensaje con ancho completo alineado a la izquierda
                            SelectableText(
                              log.message,
                              textAlign: TextAlign.left,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11.5,
                                height: 1.35,
                                fontFamily: 'monospace',
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
          actions: [
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFF6B00),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () {
                final fullLogText = _logs.map((l) => '[${l.timestamp}] [${l.level}] ${l.message}').join('\n');
                Clipboard.setData(ClipboardData(text: fullLogText));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('✓ Logs copiados al portapapeles')),
                );
              },
              icon: const Icon(Icons.copy_rounded, size: 16, color: Colors.white),
              label: const Text('Copiar Logs', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cerrar', style: TextStyle(color: Colors.grey)),
            ),
          ],
        ),
      ),
    );
  }
}
