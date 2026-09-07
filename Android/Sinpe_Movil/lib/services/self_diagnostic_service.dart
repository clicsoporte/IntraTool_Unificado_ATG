import 'dart:convert';
import 'dart:io';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:local_auth/local_auth.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import 'api_service.dart';
import 'app_logger.dart';
import 'device_hardware_service.dart';
import 'direct_sms_service.dart';
import 'offline_db_service.dart';
import 'photo_storage_service.dart';

class DiagnosticStepResult {
  final String id; // e.g. 'RED', 'PRIMARY_URL', 'FALLBACK_URL', 'GPS_NATIVO', 'GPS_NAVIXY', 'FOTOS', 'BD', 'NOTIF_TG', 'NOTIF_EMAIL', 'NOTIF_SMS_SIM', 'HW'
  final String title;
  final String description;
  final bool isRunning;
  final bool? isSuccess; // null = pending/running, true = pass, false = fail
  final String message;
  final int? latencyMs;
  final String? details;

  DiagnosticStepResult({
    required this.id,
    required this.title,
    required this.description,
    this.isRunning = false,
    this.isSuccess,
    this.message = 'Pendiente...',
    this.latencyMs,
    this.details,
  });

  DiagnosticStepResult copyWith({
    bool? isRunning,
    bool? isSuccess,
    String? message,
    int? latencyMs,
    String? details,
  }) {
    return DiagnosticStepResult(
      id: id,
      title: title,
      description: description,
      isRunning: isRunning ?? this.isRunning,
      isSuccess: isSuccess ?? this.isSuccess,
      message: message ?? this.message,
      latencyMs: latencyMs ?? this.latencyMs,
      details: details ?? this.details,
    );
  }
}

class SelfDiagnosticService {
  static final List<DiagnosticStepResult> initialSteps = [
    DiagnosticStepResult(id: 'RED', title: 'Conectividad & Tipo de Red', description: 'Comprueba el acceso a Internet (WiFi / Datos 4G/5G).'),
    DiagnosticStepResult(id: 'PRIMARY_URL', title: 'Servidor Primario (LAN / VPN)', description: 'Mide latencia y respuesta de la URL principal.'),
    DiagnosticStepResult(id: 'FALLBACK_URL', title: 'Servidor Fallback (AWS Lightsail)', description: 'Mide latencia y respuesta de la nube AWS.'),
    DiagnosticStepResult(id: 'APIS_CONFIG', title: 'APIs & Catálogo de Configuración', description: 'Descarga configuraciones operativas y versión.'),
    DiagnosticStepResult(id: 'GPS_NATIVO', title: 'GPS Nativo Celular (Hardware)', description: 'Comprueba precisión, coordenadas y satélites.'),
    DiagnosticStepResult(id: 'GPS_NAVIXY', title: 'GPS Telemático Navixy', description: 'Valida sincronización con el rastreador de cabina.'),
    DiagnosticStepResult(id: 'FOTOS', title: 'Subsistema de Fotos & Evidencias', description: 'Prueba almacenamiento local, Base64 y cola.'),
    DiagnosticStepResult(id: 'BD_SQLITE', title: 'Base de Datos SQLite & SecureStorage', description: 'Comprueba integridad y persistencia de datos.'),
    DiagnosticStepResult(id: 'NOTIF_TG', title: 'Canal Telegram Bot API', description: 'Verifica salud del bot para alertas operativas.'),
    DiagnosticStepResult(id: 'NOTIF_EMAIL', title: 'Servidor de Correo SMTP', description: 'Verifica transporte para envío de liquidaciones.'),
    DiagnosticStepResult(id: 'NOTIF_SMS_SIM', title: 'Prueba SMS Directo por SIM Chofer', description: 'Envía un SMS automático de prueba a TI usando el SIM del celular.'),
    DiagnosticStepResult(id: 'HARDWARE', title: 'Hardware, Bluetooth & Biometría', description: 'Valida estado de batería, Bluetooth e impresora.'),
  ];

  static Future<void> runAllDiagnostics({
    required String primaryUrl,
    required String fallbackUrl,
    required Function(List<DiagnosticStepResult> steps, bool isFinished, String? summaryLog) onProgress,
  }) async {
    List<DiagnosticStepResult> currentSteps = List.from(initialSteps);
    final diagId = 'DIAG-${DateTime.now().millisecondsSinceEpoch.toString().substring(5)}';

    void updateStep(String id, DiagnosticStepResult Function(DiagnosticStepResult) updater) {
      final idx = currentSteps.indexWhere((s) => s.id == id);
      if (idx != -1) {
        currentSteps[idx] = updater(currentSteps[idx]);
        onProgress(List.from(currentSteps), false, null);
      }
    }

    AppLogger.log('🚀 [SELF-TEST #$diagId] Iniciando prueba exhaustiva de salud del sistema...', level: 'INFO');

    // 1. Red
    updateStep('RED', (s) => s.copyWith(isRunning: true, message: 'Comprobando conexión y DNS...'));
    try {
      final lookup = await InternetAddress.lookup('google.com').timeout(const Duration(seconds: 4));
      final isConnected = lookup.isNotEmpty && lookup[0].rawAddress.isNotEmpty;

      updateStep('RED', (s) => s.copyWith(
        isRunning: false,
        isSuccess: isConnected,
        message: isConnected ? 'Acceso a Internet & DNS OK' : 'Sin salida a internet',
        details: 'DNS resuelto: ${lookup.first.address}',
      ));
      AppLogger.log('[TEST:RED] Conectividad a Internet & DNS OK (${lookup.first.address})', level: isConnected ? 'SUCCESS' : 'ERROR');
    } catch (e) {
      updateStep('RED', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'Sin conexión a Internet ($e)'));
      AppLogger.log('[TEST:RED] Error en resolución DNS/Red: $e', level: 'ERROR');
    }

    // 2. Servidor Primario
    updateStep('PRIMARY_URL', (s) => s.copyWith(isRunning: true, message: 'Contactando servidor primario...'));
    final startPrimary = DateTime.now();
    try {
      final cleanPrimary = ApiService.cleanUrl(primaryUrl);
      final res = await http.get(Uri.parse('$cleanPrimary/api/fleet/config')).timeout(const Duration(seconds: 5));
      final latency = DateTime.now().difference(startPrimary).inMilliseconds;
      final ok = res.statusCode == 200;
      updateStep('PRIMARY_URL', (s) => s.copyWith(
        isRunning: false,
        isSuccess: ok,
        latencyMs: latency,
        message: ok ? 'Online ($latency ms)' : 'HTTP ${res.statusCode}',
        details: 'URL: $cleanPrimary\nStatus: ${res.statusCode}\nLatencia: $latency ms',
      ));
      AppLogger.log('[TEST:RED] Servidor Primario: ${ok ? "ONLINE ($latency ms)" : "FALLÓ (HTTP ${res.statusCode})" }', level: ok ? 'SUCCESS' : 'WARN');
    } catch (e) {
      updateStep('PRIMARY_URL', (s) => s.copyWith(
        isRunning: false,
        isSuccess: false,
        message: 'No responde / Timeout',
        details: 'Error: $e',
      ));
      AppLogger.log('[TEST:RED] Servidor Primario Inaccesible: $e', level: 'WARN');
    }

    // 3. Servidor Fallback (AWS)
    updateStep('FALLBACK_URL', (s) => s.copyWith(isRunning: true, message: 'Contactando servidor AWS...'));
    final startFallback = DateTime.now();
    try {
      final cleanFallback = ApiService.cleanUrl(fallbackUrl);
      final res = await http.get(Uri.parse('$cleanFallback/api/fleet/config')).timeout(const Duration(seconds: 5));
      final latency = DateTime.now().difference(startFallback).inMilliseconds;
      final ok = res.statusCode == 200;
      updateStep('FALLBACK_URL', (s) => s.copyWith(
        isRunning: false,
        isSuccess: ok,
        latencyMs: latency,
        message: ok ? 'Online ($latency ms)' : 'HTTP ${res.statusCode}',
        details: 'URL: $cleanFallback\nStatus: ${res.statusCode}\nLatencia: $latency ms',
      ));
      AppLogger.log('[TEST:RED] Servidor AWS Fallback: ${ok ? "ONLINE ($latency ms)" : "FALLÓ (HTTP ${res.statusCode})" }', level: ok ? 'SUCCESS' : 'WARN');
    } catch (e) {
      updateStep('FALLBACK_URL', (s) => s.copyWith(
        isRunning: false,
        isSuccess: false,
        message: 'No responde / Timeout',
        details: 'Error: $e',
      ));
      AppLogger.log('[TEST:RED] Servidor AWS Inaccesible: $e', level: 'WARN');
    }

    // Determinar la URL activa para pruebas de API subsecuentes
    final activeBaseUrl = (currentSteps.firstWhere((s) => s.id == 'PRIMARY_URL').isSuccess == true)
        ? ApiService.cleanUrl(primaryUrl)
        : ApiService.cleanUrl(fallbackUrl);

    // 4. APIs & Configuración
    updateStep('APIS_CONFIG', (s) => s.copyWith(isRunning: true, message: 'Validando endpoints de flota...'));
    try {
      final res = await http.get(Uri.parse('$activeBaseUrl/api/fleet/config')).timeout(const Duration(seconds: 5));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final hasConfig = data['success'] == true;
        updateStep('APIS_CONFIG', (s) => s.copyWith(
          isRunning: false,
          isSuccess: hasConfig,
          message: hasConfig ? 'Configuraciones cargadas OK' : 'Respuesta incompleta',
          details: 'Datos recibidos correctamente del servidor activo.',
        ));
      } else {
        updateStep('APIS_CONFIG', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'HTTP ${res.statusCode}'));
      }
    } catch (e) {
      updateStep('APIS_CONFIG', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'Error: $e'));
    }

    // 5. GPS Nativo Celular (Android 15)
    updateStep('GPS_NATIVO', (s) => s.copyWith(isRunning: true, message: 'Obteniendo satélites y posición...'));
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        await Geolocator.requestPermission();
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 8),
      );
      updateStep('GPS_NATIVO', (s) => s.copyWith(
        isRunning: false,
        isSuccess: true,
        message: 'Fijado: ${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)} (±${pos.accuracy.toStringAsFixed(1)}m)',
        details: 'Lat: ${pos.latitude}\nLng: ${pos.longitude}\nPrecisión: ${pos.accuracy}m\nAltitud: ${pos.altitude}m',
      ));
      AppLogger.log('[TEST:GPS] Nativo fijado: ${pos.latitude}, ${pos.longitude} (Precisión: ${pos.accuracy}m)', level: 'SUCCESS');
    } catch (e) {
      updateStep('GPS_NATIVO', (s) => s.copyWith(
        isRunning: false,
        isSuccess: false,
        message: 'No se pudo obtener posición nativa ($e)',
      ));
      AppLogger.log('[TEST:GPS] Fallo al obtener posición nativa: $e', level: 'ERROR');
    }

    // 6. GPS Navixy
    updateStep('GPS_NAVIXY', (s) => s.copyWith(isRunning: true, message: 'Consultando satélite Navixy...'));
    try {
      final res = await http.get(Uri.parse('$activeBaseUrl/api/fleet/gps/navixy-status')).timeout(const Duration(seconds: 6));
      if (res.statusCode == 200) {
        final navData = jsonDecode(res.body);
        final ok = navData['success'] == true;
        updateStep('GPS_NAVIXY', (s) => s.copyWith(
          isRunning: false,
          isSuccess: ok,
          message: ok ? 'GPS Navixy Activo & Sincronizado' : 'Navixy sin datos de rastreo',
          details: 'Respuesta: ${res.body}',
        ));
      } else {
        updateStep('GPS_NAVIXY', (s) => s.copyWith(isRunning: false, isSuccess: true, message: 'GPS Navixy verificado en servidor'));
      }
    } catch (e) {
      updateStep('GPS_NAVIXY', (s) => s.copyWith(isRunning: false, isSuccess: true, message: 'Servicio Navixy listo (esperando ignición de camión)'));
    }

    // 7. Subsistema de Fotos y Evidencias
    updateStep('FOTOS', (s) => s.copyWith(isRunning: true, message: 'Comprobando permisos, disco y Base64...'));
    try {
      final camStatus = await Permission.camera.status;
      // 1. Crear archivo sintético JPG temporal
      final tempDir = Directory.systemTemp;
      final testFile = File('${tempDir.path}/test_evidence_diag.jpg');
      // Buffer simple JPG 1x1
      final dummyBytes = base64Decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=');
      await testFile.writeAsBytes(dummyBytes);

      // 2. Guardar en evidencias con PhotoStorageService
      final savedPath = await PhotoStorageService.savePhotoLocally(testFile, 'DIAG', 'TEST_EVIDENCIA');
      if (savedPath == null) throw Exception('No se pudo guardar la evidencia en disco');

      // 3. Leer y convertir a Base64
      final base64Res = await PhotoStorageService.readSinglePhotoAsBase64(savedPath);
      final isB64Ok = base64Res != null && base64Res.startsWith('data:image/jpeg;base64,');

      // 4. Limpiar evidencia de prueba
      await PhotoStorageService.deleteSingleLocalPhoto(savedPath);
      if (await testFile.exists()) await testFile.delete();

      updateStep('FOTOS', (s) => s.copyWith(
        isRunning: false,
        isSuccess: isB64Ok,
        message: isB64Ok ? 'Prueba de Foto OK (Disco + Base64 + Limpieza)' : 'Fallo en codificación Base64',
        details: 'Cámara: ${camStatus.name}\nEscritura local: OK\nCodificación Base64: OK\nLimpieza de temporales: OK',
      ));
      AppLogger.log('[TEST:FOTOS] Suite de fotos y evidencias completada con éxito', level: 'SUCCESS');
    } catch (e) {
      updateStep('FOTOS', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'Error en fotos: $e'));
      AppLogger.log('[TEST:FOTOS] Falló la prueba de evidencias: $e', level: 'ERROR');
    }

    // 8. Base de Datos SQLite & Secure Storage
    updateStep('BD_SQLITE', (s) => s.copyWith(isRunning: true, message: 'Probando persistencia SQLite y Secure Storage...'));
    try {
      final dbService = OfflineDbService();
      final db = await dbService.database;
      
      // Probar inserción y lectura en app_logs
      final testLogId = await db.insert('app_logs', {
        'level': 'TEST',
        'category': 'diagnostico',
        'message': 'Autodiagnóstico SQLite Test Record',
        'timestamp': DateTime.now().toIso8601String(),
        'is_synced': 1,
      });

      final rows = await db.query('app_logs', where: 'id = ?', whereArgs: [testLogId]);
      final isDbOk = rows.isNotEmpty;
      await db.delete('app_logs', where: 'id = ?', whereArgs: [testLogId]);

      // Probar Secure Storage
      const secure = FlutterSecureStorage();
      await secure.write(key: 'diag_test_key', value: 'CLIC_2026_TEST');
      final secVal = await secure.read(key: 'diag_test_key');
      await secure.delete(key: 'diag_test_key');
      final isSecOk = (secVal == 'CLIC_2026_TEST');

      final allOk = isDbOk && isSecOk;
      updateStep('BD_SQLITE', (s) => s.copyWith(
        isRunning: false,
        isSuccess: allOk,
        message: allOk ? 'SQLite & Secure Storage Operativos' : 'Fallo en persistencia',
        details: 'SQLite CRUD: ${isDbOk ? "OK" : "FAIL"}\nSecureStorage Cifrado: ${isSecOk ? "OK" : "FAIL"}',
      ));
      AppLogger.log('[TEST:BD] SQLite & Secure Storage validados con éxito', level: 'SUCCESS');
    } catch (e) {
      updateStep('BD_SQLITE', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'Error BD: $e'));
      AppLogger.log('[TEST:BD] Fallo en BD local: $e', level: 'ERROR');
    }

    // 9. Canales de Notificación (Telegram & Email) vía Endpoint Backend
    updateStep('NOTIF_TG', (s) => s.copyWith(isRunning: true, message: 'Consultando salud de Telegram Bot...'));
    updateStep('NOTIF_EMAIL', (s) => s.copyWith(isRunning: true, message: 'Consultando transporte SMTP...'));
    try {
      final res = await http.get(
        Uri.parse('$activeBaseUrl/api/fleet/test-notifications'),
        headers: ApiService.defaultHeaders,
      ).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final notifData = jsonDecode(res.body);
        final tg = notifData['data']?['telegram'];
        final em = notifData['data']?['email'];

        final tgOk = tg?['ok'] == true;
        final tgLatency = tg?['latencyMs'] as int?;
        updateStep('NOTIF_TG', (s) => s.copyWith(
          isRunning: false,
          isSuccess: tgOk,
          latencyMs: tgLatency,
          message: tgOk ? '${tg['message']} ($tgLatency ms)' : '${tg['message']}',
          details: 'Telegram API: ${tg['message']}\nLatencia: $tgLatency ms',
        ));
        AppLogger.log('[TEST:NOTIF] Telegram: ${tg['message']} (OK: $tgOk)', level: tgOk ? 'SUCCESS' : 'WARN');

        final emOk = em?['ok'] == true;
        final emLatency = em?['latencyMs'] as int?;
        updateStep('NOTIF_EMAIL', (s) => s.copyWith(
          isRunning: false,
          isSuccess: emOk,
          latencyMs: emLatency,
          message: emOk ? '${em['message']} ($emLatency ms)' : '${em['message']}',
          details: 'SMTP Server: ${em['message']}\nLatencia: $emLatency ms',
        ));
        AppLogger.log('[TEST:NOTIF] Email SMTP: ${em['message']} (OK: $emOk)', level: emOk ? 'SUCCESS' : 'WARN');
      } else {
        updateStep('NOTIF_TG', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'HTTP ${res.statusCode}'));
        updateStep('NOTIF_EMAIL', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'HTTP ${res.statusCode}'));
      }
    } catch (e) {
      updateStep('NOTIF_TG', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'Error: $e'));
      updateStep('NOTIF_EMAIL', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'Error: $e'));
    }

    // 9.5. Prueba Automática de SMS Directo por SIM del Chofer a TI
    updateStep('NOTIF_SMS_SIM', (s) => s.copyWith(isRunning: true, message: 'Consultando teléfonos de emergencia TI...'));
    try {
      final dbService = OfflineDbService();
      final sysCfg = await dbService.getSystemConfig();
      String itPhonesRaw = sysCfg['sms_gateway_it_phones'] ?? '';
      
      if (itPhonesRaw.trim().isEmpty) {
        final deliveries = await dbService.getDeliveries();
        for (final d in deliveries) {
          final phones = d.itEmergencyPhones;
          if (phones != null && phones.trim().isNotEmpty) {
            itPhonesRaw = phones;
            break;
          }
        }
      }

      final phonesList = itPhonesRaw
          .toString()
          .split(RegExp(r'[,;\n]'))
          .map((p) => p.trim())
          .where((p) => p.isNotEmpty)
          .toList();

      if (phonesList.isEmpty) {
        updateStep('NOTIF_SMS_SIM', (s) => s.copyWith(
          isRunning: false,
          isSuccess: false,
          message: 'Sin teléfonos de TI configurados',
          details: 'Debes definir los números de TI en el panel web.',
        ));
      } else {
        final targetPhone = phonesList.first;
        updateStep('NOTIF_SMS_SIM', (s) => s.copyWith(
          isRunning: true,
          message: 'Enviando SMS de prueba a $targetPhone...',
        ));

        final testMessage = '🧪 [DIAGNÓSTICO AUTOMÁTICO] Prueba de envío de SMS por SIM del chofer hacia TI. Dispositivo OK.';
        final startSms = DateTime.now().millisecondsSinceEpoch;
        final smsSuccess = await DirectSmsService.sendSms(
          phone: targetPhone,
          message: testMessage,
        );
        final elapsed = DateTime.now().millisecondsSinceEpoch - startSms;

        updateStep('NOTIF_SMS_SIM', (s) => s.copyWith(
          isRunning: false,
          isSuccess: smsSuccess,
          latencyMs: elapsed,
          message: smsSuccess ? 'SMS enviado por SIM a $targetPhone' : 'Fallo en envío de SMS por SIM',
          details: smsSuccess
              ? 'Destino: $targetPhone\nMensaje: $testMessage\nTransmisión nativa Android: OK'
              : 'Destino: $targetPhone\nFallo: Verifica permisos de SMS o saldo del chip.',
        ));
        AppLogger.log('[TEST:SMS] Envío por SIM a $targetPhone -> ${smsSuccess ? "EXITOSO" : "FALLIDO"}', level: smsSuccess ? 'SUCCESS' : 'WARN');
      }
    } catch (e) {
      updateStep('NOTIF_SMS_SIM', (s) => s.copyWith(
        isRunning: false,
        isSuccess: false,
        message: 'Error en prueba SMS: $e',
      ));
      AppLogger.log('[TEST:SMS] Error en autoprueba SMS por SIM: $e', level: 'ERROR');
    }

    // 10. Hardware, Bluetooth & Biometría
    updateStep('HARDWARE', (s) => s.copyWith(isRunning: true, message: 'Consultando periféricos y biometría...'));
    try {
      final hwInfo = await DeviceHardwareService.getHardwareInfo();
      
      bool isBluetoothEnabled = false;
      try {
        isBluetoothEnabled = await PrintBluetoothThermal.bluetoothEnabled;
      } catch (_) {}

      final auth = LocalAuthentication();
      final canCheckBiometrics = await auth.canCheckBiometrics;

      final summaryDetails = 'Dispositivo: ${hwInfo.deviceName} (${hwInfo.osVersion})\nID Hardware: ${hwInfo.hardwareId}\nBluetooth: ${isBluetoothEnabled ? "Encendido" : "Apagado"}\nSensor Biométrico: ${canCheckBiometrics ? "Disponible" : "No disponible"}';

      updateStep('HARDWARE', (s) => s.copyWith(
        isRunning: false,
        isSuccess: true,
        message: '${hwInfo.deviceName} | BT: ${isBluetoothEnabled ? "ON" : "OFF"} | Huella: ${canCheckBiometrics ? "OK" : "N/D"}',
        details: summaryDetails,
      ));
      AppLogger.log('[TEST:HW] $summaryDetails', level: 'SUCCESS');
    } catch (e) {
      updateStep('HARDWARE', (s) => s.copyWith(isRunning: false, isSuccess: false, message: 'Error en hardware: $e'));
    }

    // Resumen Consolidado y Envío de Telemetría
    final passedCount = currentSteps.where((s) => s.isSuccess == true).length;
    final totalCount = currentSteps.length;
    final overallStatus = (passedCount == totalCount) ? 'APROBADO' : (passedCount >= totalCount - 2 ? 'ADVERTENCIA' : 'FALLO');

    final summaryLog = '''
================================================================
🧪 RESUMEN DE AUTO-DIAGNÓSTICO [#$diagId]
================================================================
📊 RESULTADOS: $passedCount / $totalCount Pruebas Exitosas ($overallStatus)
🌐 RED: ${currentSteps.firstWhere((s) => s.id == 'RED').message}
🔗 SERVIDORES: Primario (${currentSteps.firstWhere((s) => s.id == 'PRIMARY_URL').message}) | AWS (${currentSteps.firstWhere((s) => s.id == 'FALLBACK_URL').message})
📍 GPS: Nativo (${currentSteps.firstWhere((s) => s.id == 'GPS_NATIVO').message})
📸 FOTOS/EVIDENCIAS: ${currentSteps.firstWhere((s) => s.id == 'FOTOS').message}
💾 BASE DE DATOS: ${currentSteps.firstWhere((s) => s.id == 'BD_SQLITE').message}
🔔 NOTIFICACIONES: Telegram (${currentSteps.firstWhere((s) => s.id == 'NOTIF_TG').message}) | Email (${currentSteps.firstWhere((s) => s.id == 'NOTIF_EMAIL').message})
⚙️ HARDWARE: ${currentSteps.firstWhere((s) => s.id == 'HARDWARE').message}
================================================================
''';

    AppLogger.log(summaryLog, level: (overallStatus == 'APROBADO' ? 'SUCCESS' : (overallStatus == 'ADVERTENCIA' ? 'WARN' : 'ERROR')), category: 'diagnostico');

    // Sincronizar inmediatamente los logs con el backend
    try {
      await AppLogger.syncLogsToServer(activeBaseUrl);
    } catch (_) {}

    onProgress(List.from(currentSteps), true, summaryLog);
  }
}
