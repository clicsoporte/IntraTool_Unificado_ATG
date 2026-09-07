import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import '../models/delivery_doc.dart';
import 'app_logger.dart';
import 'photo_storage_service.dart';

class DriverRouteResponse {
  final bool hasActiveAssignment;
  final Map<String, dynamic>? assignment;
  final List<DeliveryDoc> deliveries;

  DriverRouteResponse({
    required this.hasActiveAssignment,
    this.assignment,
    required this.deliveries,
  });
}

class ApiService {
  final String rawBaseUrl;
  static String? _authToken;

  ApiService(this.rawBaseUrl);

  static void setAuthToken(String? token) {
    _authToken = token;
  }

  static String? get authToken => _authToken;

  String get baseUrl => cleanUrl(rawBaseUrl);

  static Map<String, String> get defaultHeaders {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'X-Fleet-App': 'ClicDriver',
      'X-Fleet-Version': AppConfig.appVersion,
    };
    if (_authToken != null && _authToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
  }

  static String cleanUrl(String raw) {
    var trimmed = raw.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = 'http://$trimmed';
    }
    final uri = Uri.tryParse(trimmed);
    if (uri != null && uri.hasAuthority) {
      return '${uri.scheme}://${uri.authority}';
    }
    return trimmed;
  }

  /// Verifica rápidamente si un servidor responde con éxito (Healthcheck en < 4s)
  static Future<bool> checkServerHealth(String targetUrl) async {
    try {
      final cleaned = cleanUrl(targetUrl);
      final url = Uri.parse('$cleaned/api/fleet/config');
      final res = await http.get(url, headers: defaultHeaders).timeout(const Duration(seconds: 4));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final url = Uri.parse('$baseUrl$path');
    try {
      final res = await http.post(
        url,
        headers: defaultHeaders,
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 8));
      return jsonDecode(res.body);
    } catch (e) {
      AppLogger.log('POST $url FAILED: $e', level: 'ERROR');
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>> get(String path) async {
    final url = Uri.parse('$baseUrl$path');
    try {
      final res = await http.get(url, headers: defaultHeaders).timeout(const Duration(seconds: 8));
      return jsonDecode(res.body);
    } catch (e) {
      AppLogger.log('GET $url FAILED: $e', level: 'ERROR');
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>> fetchSystemConfig() async {
    final url = Uri.parse('$baseUrl/api/fleet/config');
    try {
      final res = await http.get(url).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true) {
          return {
            'company': data['company'] != null ? Map<String, dynamic>.from(data['company']) : {},
            'config': data['config'] != null ? Map<String, dynamic>.from(data['config']) : {},
          };
        }
      }
    } catch (_) {}
    return {'company': {}, 'config': {}};
  }

  Future<DriverRouteResponse> fetchDeliveries(int userId) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-routes?userId=$userId');
    AppLogger.log('GET $url');
    try {
      final res = await http.get(url, headers: defaultHeaders).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final hasActive = data['hasActiveAssignment'] == true;
        final assignment = data['assignment'] != null ? Map<String, dynamic>.from(data['assignment']) : null;
        final list = (data['deliveries'] as List? ?? [])
            .map((e) => DeliveryDoc.fromJson(Map<String, dynamic>.from(e)))
            .toList();

        final totalLines = list.fold<int>(0, (sum, d) => sum + d.lines.length);
        AppLogger.log('GET $url -> OK (Activa: $hasActive, ${list.length} entregas, $totalLines líneas)', level: 'SUCCESS');
        return DriverRouteResponse(
          hasActiveAssignment: hasActive,
          assignment: assignment,
          deliveries: list,
        );
      }
      AppLogger.log('GET $url -> status ${res.statusCode}: ${res.body}', level: 'ERROR');
      throw Exception('Error obteniendo entregas (${res.statusCode}): ${res.body}');
    } catch (e) {
      AppLogger.log('GET $url FAILED: $e', level: 'ERROR');
      rethrow;
    }
  }

  Future<Map<String, dynamic>> fetchRoutesAndVehicles() async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    final res = await http.get(url, headers: defaultHeaders).timeout(const Duration(seconds: 4));
    if (res.statusCode == 200) {
      return jsonDecode(res.body);
    }
    throw Exception('Error cargando rutas y vehículos (${res.statusCode})');
  }

  Future<int?> startRoute(int userId, int rutaId, int vehiculoId) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    try {
      final res = await http.post(
        url,
        headers: defaultHeaders,
        body: jsonEncode({
          'action': 'start_route',
          'userId': userId,
          'rutaId': rutaId,
          'vehiculoId': vehiculoId,
        }),
      ).timeout(const Duration(seconds: 10));

      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        return data['assignmentId'] != null ? int.tryParse(data['assignmentId'].toString()) : null;
      }

      final errorMsg = data['error'] ?? data['message'] ?? 'No se pudo iniciar la ruta (Código ${res.statusCode})';
      throw Exception(errorMsg);
    } catch (e) {
      if (e is Exception) {
        rethrow;
      }
      throw Exception('Error al comunicarse con el servidor: $e');
    }
  }

  Future<bool> sendSuggestion(String content, int userId, String userName) async {
    try {
      final url = Uri.parse('$baseUrl/api/fleet/suggestions');
      final res = await http.post(
        url,
        headers: defaultHeaders,
        body: jsonEncode({
          'content': content,
          'userId': userId,
          'userName': userName,
        }),
      ).timeout(const Duration(seconds: 8));

      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<String> autoloadInvoice(int assignmentId, String docNumStr) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    try {
      final res = await http.post(
        url,
        headers: defaultHeaders,
        body: jsonEncode({
          'action': 'autoload_invoice',
          'assignmentId': assignmentId,
          'docNumStr': docNumStr,
        }),
      ).timeout(const Duration(seconds: 12));

      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        return data['message'] ?? 'Factura agregada';
      }
      
      final errorMsg = data['error'] ?? data['message'] ?? 'No se pudo cargar la factura (${res.statusCode})';
      throw Exception(errorMsg);
    } catch (e) {
      if (e is Exception) {
        rethrow;
      }
      throw Exception('Error al comunicarse con el servidor: $e');
    }
  }

  Future<bool> departRoute(int assignmentId, double? lat, double? lng) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    final res = await http.post(
      url,
      headers: defaultHeaders,
      body: jsonEncode({
        'action': 'depart_route',
        'assignmentId': assignmentId,
        'lat': lat,
        'lng': lng,
      }),
    ).timeout(const Duration(seconds: 8));

    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return data['success'] == true;
    }
    return false;
  }

  Future<Map<String, dynamic>> notifyWaitingCustomer(int docId, double? lat, double? lng) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    try {
      final res = await http.post(
        url,
        headers: defaultHeaders,
        body: jsonEncode({
          'action': 'notify_waiting_customer',
          'docId': docId,
          'lat': lat,
          'lng': lng,
        }),
      ).timeout(const Duration(seconds: 10));

      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        return {
          'success': true,
          'message': data['message'] ?? 'Aviso enviado exitosamente',
        };
      }
      return {
        'success': false,
        'error': data['error'] ?? 'Error al enviar aviso (${res.statusCode})',
      };
    } catch (e) {
      return {
        'success': false,
        'error': 'Error de conexión: $e',
      };
    }
  }

  Future<bool> setNextClient(int assignmentId, String siguienteCliente) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    final res = await http.post(
      url,
      headers: defaultHeaders,
      body: jsonEncode({
        'action': 'set_next_client',
        'assignmentId': assignmentId,
        'siguienteCliente': siguienteCliente,
      }),
    ).timeout(const Duration(seconds: 8));

    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return data['success'] == true;
    }
    return false;
  }

  Future<bool> finishRoute(int assignmentId, String finishType, double? lat, double? lng) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    final res = await http.post(
      url,
      headers: defaultHeaders,
      body: jsonEncode({
        'action': 'finish_route',
        'assignmentId': assignmentId,
        'finishType': finishType,
        'lat': lat,
        'lng': lng,
      }),
    ).timeout(const Duration(seconds: 15));

    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return data['success'] == true;
    }
    return false;
  }

  Future<bool> syncDelivery(DeliveryDoc doc, List<DeliveryLine> lines) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-routes');

    final fotoEvidenciaBase64 = await PhotoStorageService.readPhotoAsBase64(doc.fotoEvidencia);
    final fotoFacturaBase64 = await PhotoStorageService.readPhotoAsBase64(doc.fotoFactura);

    final body = jsonEncode({
      'id': doc.id,
      'boletaNumero': doc.boletaNumero,
      'estado': doc.estado,
      'comentario': doc.comentario,
      'fotoEvidencia': fotoEvidenciaBase64,
      'fotoFactura': fotoFacturaBase64,
      'firmaCliente': doc.firmaCliente,
      'nombreRecibe': doc.nombreRecibe,
      'choferNombre': doc.choferNombre,
      'lat': doc.latitud,
      'lng': doc.longitud,
      'lines': lines.map((l) => l.toJson()).toList(),
    });

    final res = await http.post(
      url,
      headers: defaultHeaders,
      body: body,
    ).timeout(const Duration(seconds: 15));

    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      if (data['success'] == true) {
        // Política de Retención: Las fotos permanecen guardadas localmente en el dispositivo
        // hasta que se inicie una nueva ruta, garantizando máxima resiliencia sin borrado prematuro.
        return true;
      }
    }
    return false;
  }

  Future<bool> revertDelivery(int docId) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    final res = await http.post(
      url,
      headers: defaultHeaders,
      body: jsonEncode({
        'action': 'revert_delivery',
        'docId': docId,
      }),
    ).timeout(const Duration(seconds: 8));

    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return data['success'] == true;
    }
    return false;
  }

  Future<bool> reportBreakdown(int vehiculoId, String breakdownType, String description, String choferNombre, {String? photo}) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    final res = await http.post(
      url,
      headers: defaultHeaders,
      body: jsonEncode({
        'action': 'report_breakdown',
        'vehiculoId': vehiculoId,
        'breakdownType': breakdownType,
        'description': description,
        'choferNombre': choferNombre,
        if (photo != null && photo.isNotEmpty) 'photo': photo,
      }),
    ).timeout(const Duration(seconds: 8));

    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      return data['success'] == true;
    }
    return false;
  }

  Future<Map<String, dynamic>> sendEmail(int docId, String targetEmail) async {
    final url = Uri.parse('$baseUrl/api/fleet/driver-actions');
    final res = await http.post(
      url,
      headers: defaultHeaders,
      body: jsonEncode({
        'action': 'send_email',
        'docId': docId,
        'targetEmail': targetEmail,
      }),
    ).timeout(const Duration(seconds: 12));

    if (res.statusCode == 200) {
      return jsonDecode(res.body);
    }
    return {'success': false, 'error': 'Error de conexión'};
  }

  Future<Map<String, dynamic>> fetchDeviceConfig(String hardwareId) async {
    final url = Uri.parse('$baseUrl/api/fleet/device-config?hardwareId=$hardwareId');
    try {
      final res = await http.get(url, headers: defaultHeaders).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        return jsonDecode(res.body);
      }
    } catch (_) {}
    return {'success': false};
  }

  Future<bool> registerDeviceConfig({
    required String hardwareId,
    String? deviceName,
    String? driverName,
    String? driverPhone,
    String? printerMac,
    String? paperSize,
    String? appVersion,
    int? userId,
  }) async {
    final url = Uri.parse('$baseUrl/api/fleet/device-config');
    try {
      final res = await http.post(
        url,
        headers: defaultHeaders,
        body: jsonEncode({
          'hardwareId': hardwareId,
          'deviceName': deviceName ?? 'Android Device',
          'driverName': driverName,
          'driverPhone': driverPhone,
          'printerMac': printerMac,
          'paperSize': paperSize ?? '80mm',
          'appVersion': appVersion ?? AppConfig.appVersion,
          'userId': userId,
        }),
      ).timeout(const Duration(seconds: 8));

      return res.statusCode == 200;
    } catch (_) {}
    return false;
  }

  Future<Map<String, dynamic>> checkAppUpdate({
    required String hardwareId,
    required String versionName,
    required int versionCode,
    int? battery,
    String? installError,
  }) async {
    final url = Uri.parse('$baseUrl/api/fleet/app-version');
    try {
      final Map<String, dynamic> body = {
        'hwid': hardwareId,
        'version_name': versionName,
        'version_code': versionCode,
      };
      if (battery != null) body['battery'] = battery;
      if (installError != null) body['install_error'] = installError;

      final res = await http.post(
        url,
        headers: defaultHeaders,
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        return jsonDecode(res.body);
      }
    } catch (e) {
      AppLogger.log('checkAppUpdate ERROR: $e', level: 'ERROR');
    }
    return {'has_update': false};
  }
}
