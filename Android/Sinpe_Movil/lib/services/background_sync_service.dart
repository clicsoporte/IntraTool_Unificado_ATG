import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import 'api_service.dart';
import 'app_logger.dart';
import 'offline_db_service.dart';
import 'sync_engine.dart';

int _syncIntervalMinutes = SyncEngine.minIntervalMinutes;
Timer? _syncTimer;

/// Inicializa y arranca el servicio en primer plano de sincronización automática.
Future<void> initializeBackgroundSync() async {
  try {
    final service = FlutterBackgroundService();
    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: onBackgroundSyncStart,
        autoStart: true,
        autoStartOnBoot: true,
        isForegroundMode: true,
        notificationChannelId: 'clic_driver_background_sync',
        initialNotificationTitle: 'Clic Driver',
        initialNotificationContent: 'Sincronización automática en segundo plano activa',
        foregroundServiceNotificationId: 888,
        foregroundServiceTypes: [AndroidForegroundType.dataSync],
      ),
      iosConfiguration: IosConfiguration(
        autoStart: true,
        onForeground: onBackgroundSyncStart,
        onBackground: onIosBackground,
      ),
    );
    AppLogger.log('🚀 BackgroundSyncService configurado con éxito', level: 'INFO');
  } catch (e) {
    AppLogger.log('❌ Error al inicializar BackgroundSyncService: $e', level: 'ERROR');
  }
}

/// Detiene el servicio en primer plano.
Future<void> stopBackgroundSync() async {
  _syncTimer?.cancel();
  _syncTimer = null;
  try {
    FlutterBackgroundService().invoke('stopService');
  } catch (_) {}
}

/// Notifica al aislado de background un nuevo intervalo (desde el main isolate).
Future<void> updateBackgroundSyncInterval(int minutes) async {
  if (minutes < SyncEngine.minIntervalMinutes) {
    minutes = SyncEngine.minIntervalMinutes;
  }
  try {
    FlutterBackgroundService().invoke('updateInterval', {'minutes': minutes});
  } catch (_) {}
}

@pragma('vm:entry-point')
void onBackgroundSyncStart(ServiceInstance service) async {
  WidgetsFlutterBinding.ensureInitialized();
  DartPluginRegistrant.ensureInitialized();

  AppLogger.log('🟢 BackgroundSyncService iniciado (en primer plano)', level: 'INFO');

  if (service is AndroidServiceInstance) {
    service.setAsForegroundService();
    service.setForegroundNotificationInfo(
      title: 'Clic Driver Sync',
      content: 'Sincronización automática activa',
    );

    service.on('stopService').listen((_) => service.stopSelf());
    service.on('updateInterval').listen((event) {
      final m = event?['minutes'];
      if (m is int && m >= SyncEngine.minIntervalMinutes) {
        _syncIntervalMinutes = m;
        _scheduleSyncTimer(service);
      }
    });
  }

  _scheduleSyncTimer(service);
  await _runBackgroundSync(service);
}

@pragma('vm:entry-point')
Future<bool> onIosBackground(ServiceInstance service) async {
  WidgetsFlutterBinding.ensureInitialized();
  DartPluginRegistrant.ensureInitialized();
  await _runBackgroundSync(service);
  return true;
}

/// Ejecuta un ciclo de sync leyendo la configuración persistida del usuario.
Future<void> _runBackgroundSync(ServiceInstance service) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final db = OfflineDbService();
    final urlCfg = await db.getServerUrlsConfig();
    
    // Prioridad de alta disponibilidad: 1. SQLite Active -> 2. SQLite Primary -> 3. SharedPreferences -> 4. Default BaseUrl
    String serverUrl = urlCfg['active']?.isNotEmpty == true
        ? urlCfg['active']!
        : (urlCfg['primary']?.isNotEmpty == true
            ? urlCfg['primary']!
            : (prefs.getString('server_url') ?? AppConfig.defaultBaseUrl));

    final rawUserId = prefs.get('user_id');
    final userId = (rawUserId is int)
        ? rawUserId
        : (rawUserId is String ? (int.tryParse(rawUserId) ?? 1) : 1);
    final userName = prefs.getString('user_name') ?? prefs.getString('user_email') ?? '';
    final hardwareId = prefs.getString('hardware_id') ?? '';
    final savedToken = prefs.getString('auth_token');
    if (savedToken != null && savedToken.isNotEmpty) {
      ApiService.setAuthToken(savedToken);
    }

    if (serverUrl.isEmpty || hardwareId.isEmpty) {
      return;
    }

    final res = await SyncEngine.runFullSync(
      serverUrl: serverUrl,
      userId: userId,
      userName: userName,
      hardwareId: hardwareId,
    );
    _syncIntervalMinutes = res.intervalMinutes;
    _scheduleSyncTimer(service);

    // Notificar al isolate principal de Flutter que hay nuevos datos en SQLite
    try {
      service.invoke('sync_completed', {
        'timestamp': DateTime.now().toIso8601String(),
        'success': res.success,
        'deliveriesFetched': res.deliveriesFetched,
        'offlineSent': res.offlineSent,
      });
    } catch (_) {}
  } catch (e) {
    AppLogger.log('❌ Background sync exception: $e', level: 'ERROR');
  }
}

void _scheduleSyncTimer(ServiceInstance service) {
  _syncTimer?.cancel();
  _syncTimer = Timer.periodic(Duration(minutes: _syncIntervalMinutes), (_) {
    _runBackgroundSync(service);
  });
}
