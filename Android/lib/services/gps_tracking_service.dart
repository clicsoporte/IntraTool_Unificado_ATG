import 'dart:async';
import 'dart:math';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import '../config.dart';
import 'app_logger.dart';
import 'offline_db_service.dart';

/**
 * Servicio de Rastreo Continuo en Segundo Plano (Estilo Traccar Client)
 * Transmite migajas de pan GPS cada X minutos (5 min por defecto)
 * con apagado automático al ingresar a la geocerca "Parqueo" de la empresa.
 */
class GpsTrackingService {
  static Timer? _trackingTimer;
  static bool _isTrackingActive = false;

  /// Inicia el rastreo continuo en segundo plano durante la ruta activa
  static Future<void> startTracking({int intervalMinutes = 5}) async {
    if (_isTrackingActive) return;
    _isTrackingActive = true;
    AppLogger.log('🟢 GpsTrackingService: Iniciando rastreo continuo (cada $intervalMinutes min)', level: 'INFO');

    _trackingTimer?.cancel();
    _trackingTimer = Timer.periodic(Duration(minutes: intervalMinutes), (_) async {
      await _sendCurrentLocationFix();
    });

    // Enviar primera fijación de inmediato
    await _sendCurrentLocationFix();
  }

  /// Detiene el rastreo en segundo plano
  static Future<void> stopTracking() async {
    _isTrackingActive = false;
    _trackingTimer?.cancel();
    _trackingTimer = null;
    AppLogger.log('🛑 GpsTrackingService: Rastreo detenido', level: 'INFO');
  }

  /// Ejecuta un ciclo de captura de ubicación y envío al servidor
  static Future<void> _sendCurrentLocationFix() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      String? userId = prefs.getString('user_id');
      if (userId == null) {
        final rawUser = prefs.get('user_id');
        if (rawUser != null) userId = rawUser.toString();
      }
      String? vehiclePlate = prefs.getString('vehicle_plate') ?? prefs.getString('current_vehicle_plate');
      
      // Fallback: Consultar asignación activa en SQLite si falta la placa o el usuario
      if (vehiclePlate == null || vehiclePlate.isEmpty || userId == null || userId.isEmpty) {
        try {
          final db = OfflineDbService();
          final assignment = await db.getActiveAssignment();
          if (assignment != null) {
            if (vehiclePlate == null || vehiclePlate.isEmpty) {
              vehiclePlate = assignment['vehiculo_placa']?.toString();
            }
          }
        } catch (_) {}
      }

      final effectiveId = (vehiclePlate != null && vehiclePlate.isNotEmpty)
          ? vehiclePlate
          : (userId ?? prefs.getString('hardware_id') ?? 'CHOFER');

      final serverUrl = prefs.getString('server_url') ?? AppConfig.defaultBaseUrl;

      // Coordenadas de la geocerca de Parqueo de la Empresa
      final depotLat = prefs.getDouble('depot_lat') ?? 10.025541;
      final depotLng = prefs.getDouble('depot_lng') ?? -84.273252;
      final depotRadiusMeters = prefs.getDouble('depot_radius_meters') ?? 500.0;

      // Obtener fijación GPS actual (usando servicio nativo o geolocator)
      final position = await _getCurrentPositionFallback();
      if (position == null) return;

      final lat = position['lat']!;
      final lng = position['lng']!;
      final speed = position['speed'] ?? 0.0;

      // Evaluar si ingresó a la geocerca de Parqueo de la Empresa
      final distToDepot = _calculateHaversineDistance(lat, lng, depotLat, depotLng);
      if (distToDepot <= depotRadiusMeters) {
        AppLogger.log('🏁 GpsTrackingService: Chofer ingresó a la geocerca Parqueo (${distToDepot.round()}m). Apagando rastreo automáticamente.', level: 'INFO');
        await stopTracking();
        return;
      }

      // Transmitir al endpoint receptor de Next.js /api/fleet/telemetry/mobile
      final targetUri = Uri.parse('$serverUrl/api/fleet/telemetry/mobile').replace(queryParameters: {
        'id': effectiveId,
        'lat': lat.toString(),
        'lon': lng.toString(),
        'speed': speed.toString(),
        'timestamp': DateTime.now().toIso8601String(),
      });

      final resp = await http.get(targetUri, headers: {'X-Fleet-App': 'ClicDriver'}).timeout(const Duration(seconds: 5));
      if (resp.statusCode == 200) {
        AppLogger.log('📡 GpsTrackingService: Coordenadas transmitidas con éxito ($lat, $lng - ${speed.round()} km/h)', level: 'DEBUG');
      }
    } catch (e) {
      AppLogger.log('⚠️ GpsTrackingService: Excepción al transmitir GPS: $e', level: 'WARN');
    }
  }

  /// Método para obtener fijación GPS real del dispositivo
  static Future<Map<String, double>?> _getCurrentPositionFallback() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      ).timeout(const Duration(seconds: 4));
      // Convertir velocidad de m/s a km/h (* 3.6)
      final speedKmh = (pos.speed > 0 ? pos.speed * 3.6 : 0.0);
      return {
        'lat': pos.latitude,
        'lng': pos.longitude,
        'speed': speedKmh,
      };
    } catch (_) {
      try {
        final lastPos = await Geolocator.getLastKnownPosition();
        if (lastPos != null) {
          final speedKmh = (lastPos.speed > 0 ? lastPos.speed * 3.6 : 0.0);
          return {
            'lat': lastPos.latitude,
            'lng': lastPos.longitude,
            'speed': speedKmh,
          };
        }
      } catch (_) {}
    }
    return null;
  }

  /// Fórmula de Haversine pura en Dart para calcular distancia en metros
  static double _calculateHaversineDistance(double lat1, double lon1, double lat2, double lon2) {
    const r = 6371000.0;
    final rad = pi / 180.0;
    final dLat = (lat2 - lat1) * rad;
    final dLon = (lon2 - lon1) * rad;

    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(lat1 * rad) * cos(lat2 * rad) * sin(dLon / 2) * sin(dLon / 2);
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return r * c;
  }
}
