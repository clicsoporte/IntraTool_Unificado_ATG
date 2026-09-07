import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import '../config.dart';
import 'api_service.dart';
import 'offline_db_service.dart';
import 'app_logger.dart';
import 'device_hardware_service.dart';
import 'device_security_service.dart';
import 'emergency_alert_service.dart';

/// Resultado de un ciclo completo de sincronización con el servidor central.
class FullSyncResult {
  final bool success;
  final int intervalMinutes;
  final int deliveriesFetched;
  final int offlineSent;

  const FullSyncResult({
    required this.success,
    required this.intervalMinutes,
    this.deliveriesFetched = 0,
    this.offlineSent = 0,
  });
}

/// Motor de sincronización bidireccional reutilizable (foreground y background).
///
/// Ejecuta el ciclo completo contra el servidor central:
/// 1. Descarga la configuración remota (recibe) y deriva el intervalo de sync.
/// 2. Heartbeat/telemetría mínima (POST /api/fleet/app-version) -> mantiene online.
/// 3. Recibe entregas/recolectas (GET /api/fleet/driver-routes) y las guarda local.
/// 4. Envía la cola offline (eventos + entregas no sincronizadas).
/// 5. Re-registra el dispositivo (POST /api/fleet/device-config) -> last_seen.
/// 6. Sube los logs técnicos del aislado actual.
class SyncEngine {
  /// Mínimo permitido para el intervalo de sincronización (AGENTS: no menos de 5).
  static const int minIntervalMinutes = 5;

  /// Resuelve el intervalo configurado (remoto o local), forzando el mínimo.
  static Future<int> resolveIntervalMinutes(String serverUrl) async {
    int minutes = minIntervalMinutes;
    try {
      final db = OfflineDbService();
      final local = await db.getSystemConfig();
      final parsed = int.tryParse(local['apk_background_sync_minutes'] ?? '');
      if (parsed != null && parsed >= minIntervalMinutes) minutes = parsed;
    } catch (_) {}
    return minutes;
  }

  static Future<T> _withDbRetry<T>(Future<T> Function() fn, {int maxAttempts = 3}) async {
    int attempts = 0;
    while (true) {
      attempts++;
      try {
        return await fn();
      } catch (e) {
        if (attempts >= maxAttempts) rethrow;
        await Future.delayed(Duration(milliseconds: 300 * attempts));
      }
    }
  }

  static bool _isSyncing = false;

  /// Ejecuta un ciclo completo de sincronización con soporte de Alta Disponibilidad (Failover).
  static Future<FullSyncResult> runFullSync({
    required String serverUrl,
    required int userId,
    required String userName,
    required String hardwareId,
  }) async {
    if (_isSyncing) {
      return const FullSyncResult(
        success: true,
        intervalMinutes: 5,
      );
    }
    _isSyncing = true;
    final db = OfflineDbService();
    
    // Obtener URLs de alta disponibilidad guardadas en SQLite
    final urlCfg = await db.getServerUrlsConfig();
    String effectiveServerUrl = serverUrl;

    // Si la URL pasada o activa no responde rápidamente, probar si la primaria o fallback están vivas
    bool isHealthy = await ApiService.checkServerHealth(effectiveServerUrl);
    if (!isHealthy) {
      // 🛡️ [WireGuard Auto-Recovery] Si la URL principal (VPN) no responde, intentar refrescar el túnel WireGuard de fondo
      AppLogger.log('⚠️ URL activa no responde ($effectiveServerUrl). Disparando auto-recuperación nativa de WireGuard VPN...', level: 'WARNING');
      DeviceSecurityService.restartWireGuardTunnel().catchError((_) => false);

      if (urlCfg['primary']?.isNotEmpty == true && urlCfg['primary'] != effectiveServerUrl) {
        final primaryOk = await ApiService.checkServerHealth(urlCfg['primary']!);
        if (primaryOk) {
          effectiveServerUrl = urlCfg['primary']!;
          isHealthy = true;
          await db.saveServerUrlsConfig(primary: urlCfg['primary']!, fallback: urlCfg['fallback'], active: effectiveServerUrl);
          AppLogger.log('🔄 Failover: Conmutado a URL Primaria ($effectiveServerUrl)', level: 'INFO');
        }
      }
      if (!isHealthy && urlCfg['fallback']?.isNotEmpty == true && urlCfg['fallback'] != effectiveServerUrl) {
        final fallbackOk = await ApiService.checkServerHealth(urlCfg['fallback']!);
        if (fallbackOk) {
          effectiveServerUrl = urlCfg['fallback']!;
          isHealthy = true;
          await db.saveServerUrlsConfig(primary: urlCfg['primary'] ?? effectiveServerUrl, fallback: urlCfg['fallback'], active: effectiveServerUrl);
          AppLogger.log('🛡️ Failover: Conmutado a URL de Respaldo Fallback ($effectiveServerUrl)', level: 'WARNING');
        }
      }

      // Re-verificar si tras el refresco de WireGuard la URL Primaria resucitó
      if (!isHealthy && urlCfg['primary']?.isNotEmpty == true) {
        await Future.delayed(const Duration(milliseconds: 600));
        final recheckPrimary = await ApiService.checkServerHealth(urlCfg['primary']!);
        if (recheckPrimary) {
          effectiveServerUrl = urlCfg['primary']!;
          isHealthy = true;
          await db.saveServerUrlsConfig(primary: urlCfg['primary']!, fallback: urlCfg['fallback'], active: effectiveServerUrl);
          AppLogger.log('⚡ WireGuard restablecido con éxito tras refresco nativo ($effectiveServerUrl)', level: 'SUCCESS');
        }
      }
    }

      // Si ambos servidores fallaron (pérdida total de conexión con los endpoints centrales)
      if (!isHealthy) {
        AppLogger.log('🚨 Pérdida total de conectividad con servidores. Evaluando emisión de Alerta SOS Telegram...', level: 'WARNING');
        EmergencyAlertService.sendConnectivitySosAlert(
          primaryUrl: urlCfg['primary']?.isNotEmpty == true ? urlCfg['primary']! : effectiveServerUrl,
          fallbackUrl: urlCfg['fallback'] ?? '',
          failedReason: 'Servidor Primario y Fallback inalcanzables en ciclo de sincronización',
        ).catchError((_) => false);
      }

    // Asegurar que el Heartbeat y las llamadas usen la URL efectiva activa
    final api = ApiService(effectiveServerUrl);
    int intervalMinutes = minIntervalMinutes;
    int deliveriesFetched = 0;
    int offlineSent = 0;

    try {
      // 1. Enviar cola offline PRIMERO (Prioridad #1: asegurar que lo completado por el chofer suba de inmediato)
      try {
        final offlineEvents = await db.getOfflineEvents();
        for (final ev in offlineEvents) {
          final type = ev['type'];
          final payload = jsonDecode(ev['payload']);
          bool ok = false;
          if (type == 'DEPART_ROUTE') {
            ok = await api.departRoute(payload['assignmentId'], payload['lat'], payload['lng']);
          } else if (type == 'SET_NEXT_CLIENT') {
            ok = await api.setNextClient(payload['assignmentId'], payload['siguienteCliente']);
          } else if (type == 'FINISH_ROUTE') {
            ok = await api.finishRoute(payload['assignmentId'], payload['finishType'], payload['lat'], payload['lng']);
          } else if (type == 'SEND_SUGGESTION') {
            ok = await api.sendSuggestion(payload['content'], payload['userId'] ?? 0, payload['userName'] ?? '');
          } else if (type == 'REVERT_DELIVERY') {
            ok = await api.revertDelivery(payload['docId']);
          }
          if (ok) await _withDbRetry(() => db.deleteOfflineEvent(ev['id']));
        }

        final unsynced = await db.getUnsyncedDeliveries();
        for (final doc in unsynced) {
          final synced = await api.syncDelivery(doc, doc.lines);
          if (synced) {
            doc.isSynced = true;
            await _withDbRetry(() => db.updateDeliveryState(doc));
            offlineSent++;
          }
        }
      } catch (_) {}

      // 2. Descargar entregas / recolectas asignadas y notificar si hay nuevos documentos
      try {
        final previousDocs = await db.getDeliveries();
        final prevIds = previousDocs.map((d) => d.id).toSet();

        final res = await api.fetchDeliveries(userId);
        deliveriesFetched = res.deliveries.length;

        if (res.hasActiveAssignment && res.assignment != null) {
          final a = res.assignment!;
          final currentLocal = await db.getActiveAssignment();
          final effectiveSiguienteCliente = (a['siguiente_cliente'] != null && a['siguiente_cliente'].toString().trim().isNotEmpty)
              ? a['siguiente_cliente']
              : currentLocal?['siguiente_cliente'];

          await _withDbRetry(() => db.saveActiveAssignment({
            'id': a['id'],
            'ruta_id': a['ruta_id'],
            'ruta_nombre': a['ruta_nombre'],
            'vehiculo_id': a['vehiculo_id'],
            'vehiculo_placa': a['vehiculo_placa'],
            'fecha': a['fecha'],
            'fecha_salida': a['fecha_salida'],
            'siguiente_cliente': effectiveSiguienteCliente,
            'estado_flujo': a['fecha_salida'] != null ? 'salida' : 'creada',
          }));
          await _withDbRetry(() => db.saveDeliveries(res.deliveries));

          // Detección de nuevos documentos agregados en ruta
          final newDocs = res.deliveries.where((d) => !prevIds.contains(d.id)).toList();
          if (newDocs.isNotEmpty && prevIds.isNotEmpty) {
            final collectCount = newDocs.where((d) => d.tipoDocumento.toLowerCase().contains('recolecta')).length;
            final invoiceCount = newDocs.length - collectCount;

            String notifTitle = '📦 Nuevas Asignaciones en Ruta';
            String notifMessage = '';

            if (collectCount > 0 && invoiceCount > 0) {
              notifMessage = 'Se han asignado $invoiceCount factura(s) y $collectCount recolecta(s) a su ruta.';
            } else if (collectCount > 0) {
              notifTitle = '🔄 Nueva Recolecta Asignada';
              notifMessage = collectCount == 1 
                  ? 'Se asignó una nueva orden de retiro: ${newDocs.first.clienteNombre}' 
                  : 'Se han asignado $collectCount nuevas órdenes de retiro/recolecta.';
            } else {
              notifTitle = '📦 Nuevas Facturas Asignadas';
              notifMessage = invoiceCount == 1 
                  ? 'Se asignó una nueva factura: #${newDocs.first.documentoNumero} (${newDocs.first.clienteNombre})' 
                  : 'Se han asignado $invoiceCount nuevas facturas a su ruta.';
            }

            try {
              const kioskChannel = MethodChannel('com.clicsoporte.clic_driver/kiosk');
              await kioskChannel.invokeMethod('showNativeNotification', {
                'title': notifTitle,
                'message': notifMessage,
              });
              AppLogger.log('🔔 Notificación nativa enviada: $notifTitle - $notifMessage', level: 'SUCCESS');
            } catch (_) {}
          }
        } else {
          await _withDbRetry(() => db.clearActiveAssignment());
        }
      } catch (_) {}

      // 3. Configuración remota del sistema (recibe) -> alimenta el intervalo
      try {
        final sys = await api.fetchSystemConfig();
        final config = sys['config'];
        if (config is Map && config.isNotEmpty) {
          final cfgMap = config.map((k, v) => MapEntry(k.toString(), v.toString()));
          await db.saveSystemConfig(cfgMap);
          final server = int.tryParse(cfgMap['apk_background_sync_minutes'] ?? '');
          if (server != null && server >= minIntervalMinutes) intervalMinutes = server;
        }
      } catch (_) {}

      // 5. Re-registro de dispositivo y Sincronización de Políticas MDM
      try {
        await api.registerDeviceConfig(
          hardwareId: hardwareId,
          deviceName: 'Clic Driver',
          driverName: userName,
          userId: userId,
        );

        final devConfig = await api.fetchDeviceConfig(hardwareId);
        if (devConfig['registered'] == true && devConfig['config'] != null) {
          final cfg = devConfig['config'];

          // Actualizar URLs de alta disponibilidad en SQLite si el servidor las envió
          final primaryFromSrv = cfg['serverUrlPrimary']?.toString();
          final fallbackFromSrv = cfg['serverUrlFallback']?.toString();
          if (primaryFromSrv != null && primaryFromSrv.isNotEmpty) {
            await db.saveServerUrlsConfig(
              primary: primaryFromSrv,
              fallback: fallbackFromSrv,
              active: effectiveServerUrl,
            );
          }

          if (cfg['mdm'] != null && cfg['mdm'] is Map) {
            final mdmMap = Map<String, dynamic>.from(cfg['mdm']);
            await DeviceSecurityService.applyMdmPolicy(mdmMap);

            // Persistir apps fijadas y lista blanca en la BD local de configuración del sistema
            final configUpdates = <String, dynamic>{};
            if (mdmMap['pinnedApps'] != null && mdmMap['pinnedApps'] is List) {
              final pinnedList = List<String>.from(mdmMap['pinnedApps']);
              configUpdates['pinned_route_apps'] = pinnedList.join(',');
            } else if (mdmMap['pinnedApps'] == null) {
              configUpdates['pinned_route_apps'] = '';
            }

            if (mdmMap['whitelistedPackages'] != null && mdmMap['whitelistedPackages'] is List) {
              final wlList = List<String>.from(mdmMap['whitelistedPackages']);
              configUpdates['apk_whitelisted_apps'] = wlList.join(',');
            }
            if (mdmMap['kioskEnabled'] != null) {
              final isKiosk = mdmMap['kioskEnabled'] == true;
              configUpdates['apk_kiosk_enabled'] = isKiosk ? 'true' : 'false';
              try {
                const kioskChannel = MethodChannel('com.clicsoporte.clic_driver/kiosk');
                if (isKiosk) {
                  final rawWhitelisted = configUpdates['apk_whitelisted_apps'] ?? '';
                  final packages = rawWhitelisted.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
                  await kioskChannel.invokeMethod('startLockTask', {'packages': packages});
                } else {
                  await kioskChannel.invokeMethod('stopLockTask');
                }
              } catch (_) {}
            }
            if (configUpdates.isNotEmpty) {
              await db.saveSystemConfig(configUpdates);
            }
          }

          // Procesar desinstalaciones remotas de usuario (solo apps de terceros)
          if (cfg['pendingUninstalls'] != null && cfg['pendingUninstalls'] is List) {
            final uninstalls = List<String>.from(cfg['pendingUninstalls']);
            for (final pkg in uninstalls) {
              if (pkg.trim().isNotEmpty) {
                try {
                  const kioskChannel = MethodChannel('com.clicsoporte.clic_driver/kiosk');
                  final ok = await kioskChannel.invokeMethod('uninstallUserPackage', {'packageName': pkg});
                  if (ok == true) {
                    AppLogger.log('🗑️ Desinstalación remota exitosa de $pkg', level: 'SUCCESS');
                  }
                } catch (err) {
                  AppLogger.log('⚠️ Falló desinstalación remota de $pkg: $err', level: 'WARNING');
                }
              }
            }
          }

          // Procesar orden de reinicio remoto TI
          if (cfg['pendingReboot'] == true) {
            try {
              AppLogger.log('🔄 Ejecutando orden de reinicio remoto por hardware...', level: 'WARNING');
              const kioskChannel = MethodChannel('com.clicsoporte.clic_driver/kiosk');
              await kioskChannel.invokeMethod('rebootDevice');
            } catch (err) {
              AppLogger.log('⚠️ Error al reiniciar remotamente: $err', level: 'WARNING');
            }
          }
        }
      } catch (e) {
        AppLogger.log('⚠️ Error actualizando políticas MDM en sync: $e', level: 'WARNING');
      }

      // 5. Heartbeat / telemetría en tiempo real (batería, voltaje, salud, RAM, almacenamiento, GPS)
      try {
        final mdm = await DeviceHardwareService.fetchMdmTelemetryPayload();
        mdm['hwid'] = hardwareId;
        mdm['version_name'] = AppConfig.appVersion;
        mdm['version_code'] = AppConfig.appVersionCode;
        await http.post(
          Uri.parse('${ApiService.cleanUrl(effectiveServerUrl)}/api/fleet/app-version'),
          headers: {
            'Content-Type': 'application/json',
            'X-Fleet-App': 'ClicDriver',
          },
          body: jsonEncode(mdm),
        ).timeout(const Duration(seconds: 8));
      } catch (_) {}

      // 6. Subir logs del aislado actual usando la URL efectiva verificada
      try {
        await AppLogger.syncLogsToServer(effectiveServerUrl);
      } catch (_) {}

      AppLogger.log(
        '🔄 Sync automático completado (intervalo $intervalMinutes min, $deliveriesFetched entregas, $offlineSent offline)',
        level: 'SUCCESS',
      );
      return FullSyncResult(
        success: true,
        intervalMinutes: intervalMinutes,
        deliveriesFetched: deliveriesFetched,
        offlineSent: offlineSent,
      );
    } catch (e) {
      AppLogger.log('❌ Sync automático falló: $e', level: 'ERROR');
      return FullSyncResult(success: false, intervalMinutes: intervalMinutes);
    } finally {
      _isSyncing = false;
    }
  }
}
