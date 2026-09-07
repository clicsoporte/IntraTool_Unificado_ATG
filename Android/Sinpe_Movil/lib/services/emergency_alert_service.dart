import 'dart:convert';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'app_logger.dart';
import 'device_hardware_service.dart';
import 'offline_db_service.dart';
import 'direct_sms_service.dart';

class EmergencyAlertService {
  static const String _kLastSosEpoch = 'last_sos_alert_epoch';
  static const int _kCooldownMinutes = 30; // 30 minutos de regla anti-spam

  /// Intenta obtener la IP pública del celular probando la URL primaria y luego el fallback.
  static Future<String?> getPublicIp({
    String primaryApi = 'https://api.ipify.org',
    String fallbackApi = 'https://icanhazip.com',
  }) async {
    // 1. Probar API Primaria
    try {
      final uri = Uri.parse(primaryApi.trim());
      final res = await http.get(uri).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final ip = res.body.trim();
        if (_isValidIp(ip)) return ip;
      }
    } catch (_) {}

    // 2. Probar API Fallback
    try {
      final uri = Uri.parse(fallbackApi.trim());
      final res = await http.get(uri).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final ip = res.body.trim();
        if (_isValidIp(ip)) return ip;
      }
    } catch (_) {}

    return null;
  }

  static bool _isValidIp(String text) {
    if (text.isEmpty || text.length > 45) return false;
    // Comprobar si parece una IPv4 o IPv6 básica
    final clean = text.replaceAll('\n', '').replaceAll('\r', '').trim();
    return clean.contains('.') || clean.contains(':');
  }

  /// Dispara una alerta SOS directa a Telegram cuando fallan tanto el servidor principal como el fallback
  static Future<bool> sendConnectivitySosAlert({
    required String primaryUrl,
    required String fallbackUrl,
    String? failedReason,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final now = DateTime.now().millisecondsSinceEpoch;
      final lastSos = prefs.getInt(_kLastSosEpoch) ?? 0;

      // 1. Regla Anti-Spam: Verificar cooldown de 30 minutos
      final diffMinutes = (now - lastSos) / (1000 * 60);
      if (diffMinutes < _kCooldownMinutes) {
        AppLogger.log('⏳ SOS Telegram omitido por Cooldown (${diffMinutes.toStringAsFixed(1)} / $_kCooldownMinutes min)', level: 'INFO');
        return false;
      }

      // 2. Obtener configuraciones del sistema (Token de bot y Chat ID)
      final db = OfflineDbService();
      final sysCfg = await db.getSystemConfig();
      final botToken = sysCfg['telegram_bot_token']?.trim();
      final chatId = sysCfg['mdm_telegram_alerts_chat_id']?.trim();

      if (botToken == null || botToken.isEmpty || chatId == null || chatId.isEmpty) {
        AppLogger.log('⚠️ Alerta SOS no enviada: Token de Telegram o Chat ID no configurados.', level: 'WARNING');
        return false;
      }

      final ipPrimaryApi = sysCfg['public_ip_api_primary'] ?? 'https://api.ipify.org';
      final ipFallbackApi = sysCfg['public_ip_api_fallback'] ?? 'https://icanhazip.com';

      // 3. Obtener IP pública del celular
      final publicIp = await getPublicIp(primaryApi: ipPrimaryApi, fallbackApi: ipFallbackApi) ?? 'No detectada / Sin salida DNS';

      // 4. Datos del vehículo, chofer y hardware
      final hwInfo = await DeviceHardwareService.getHardwareInfo();
      final driverName = prefs.getString('user_name') ?? prefs.getString('user_email') ?? 'Chofer APK';
      final driverPhone = prefs.getString('driver_phone_number') ?? 'N/D';
      final routeName = prefs.getString('current_route_name') ?? 'Sin Ruta';
      final vehiclePlate = prefs.getString('current_vehicle_plate') ?? 'Sin Placa';

      // 5. Coordenadas GPS del celular
      String gpsStr = 'No disponible';
      try {
        final pos = await Geolocator.getLastKnownPosition();
        if (pos != null) {
          gpsStr = '${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)} (±${pos.accuracy.toStringAsFixed(1)}m)';
        }
      } catch (_) {}

      final timeFormatted = DateTime.now().toString().substring(0, 19);

      // 6. Construir mensaje HTML para Telegram
      final message = '''
🚨 <b>ALERTA MDM: PÉRDIDA TOTAL DE CONECTIVIDAD DE FLOTA</b>

🚚 <b>Camión / Placa:</b> $vehiclePlate
👤 <b>Chofer:</b> $driverName (Tel: $driverPhone)
🗺️ <b>Ruta:</b> $routeName
📱 <b>Dispositivo:</b> ${hwInfo.deviceName} (${hwInfo.osVersion})
🆔 <b>Hardware ID:</b> <code>${hwInfo.hardwareId}</code>

🌐 <b>Diagnóstico de Conexión:</b>
❌ <b>URL Primaria:</b> <code>$primaryUrl</code> (Inaccesible)
❌ <b>URL Fallback:</b> <code>${fallbackUrl.isNotEmpty ? fallbackUrl : 'No configurada'}</code> (Inaccesible)
${failedReason != null ? "⚠️ <b>Detalle:</b> $failedReason\n" : ""}
📶 <b>Datos de Red del Teléfono:</b>
📍 <b>IP Pública del Celular:</b> <code>$publicIp</code>
📍 <b>GPS Teléfono:</b> $gpsStr
🕒 <b>Hora del Evento:</b> $timeFormatted

⚠️ <i>El teléfono tiene salida a internet público, pero ninguno de los servidores de la empresa responde.</i>
''';

      // 7. Enviar POST directo a la API de Telegram
      final telegramUrl = Uri.parse('https://api.telegram.org/bot$botToken/sendMessage');
      final res = await http.post(
        telegramUrl,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'chat_id': chatId,
          'text': message,
          'parse_mode': 'HTML',
          'disable_web_page_preview': true,
        }),
      ).timeout(const Duration(seconds: 8));

      // 8. Enviar SMS directo desde SIM a Teléfonos de TI (Falla de conectividad a servidores)
      try {
        final itPhones = sysCfg['sms_gateway_it_phones'] ?? '';
        DirectSmsService.sendEmergencyItAlertSms(
          errorMessage: 'Perdida total de conexion con servidor primary/fallback. IP Cel: $publicIp',
          driverName: driverName,
          itPhonesRaw: itPhones,
        );
      } catch (_) {}

      if (res.statusCode == 200) {
        // Actualizar marca de tiempo para el cooldown de 30 minutos
        await prefs.setInt(_kLastSosEpoch, now);
        AppLogger.log('🚀 [SOS TELEGRAM] Alerta de desconexión enviada exitosamente (IP: $publicIp)', level: 'SUCCESS');
        return true;
      } else {
        AppLogger.log('⚠️ Error al enviar SOS a Telegram: HTTP ${res.statusCode} - ${res.body}', level: 'ERROR');
        return false;
      }
    } catch (e) {
      AppLogger.log('⚠️ Excepción al disparar SOS a Telegram: $e', level: 'ERROR');
      return false;
    }
  }
}
