import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import '../config.dart';
import 'api_service.dart';
import 'app_logger.dart';
import 'device_hardware_service.dart';
import 'offline_db_service.dart';

class VersionInfo {
  final bool hasUpdate;
  final bool isPaused;
  final String versionName;
  final int versionCode;
  final String apkUrl;
  final String releaseNotes;
  final bool forceUpdate;
  final int installFailedCount;

  VersionInfo({
    required this.hasUpdate,
    required this.isPaused,
    required this.versionName,
    required this.versionCode,
    required this.apkUrl,
    required this.releaseNotes,
    required this.forceUpdate,
    required this.installFailedCount,
  });
}

class VersionService {
  static const MethodChannel _kioskChannel = MethodChannel('com.clicsoporte.clic_driver/kiosk');

  /// Motor OTA Aislado de Invocación Temprana (Inmune a cambios de módulos)
  static Future<bool> checkAndExecuteOtaUpdateEarly(String serverBaseUrl) async {
    http.Client? client;
    try {
      final hwInfo = await DeviceHardwareService.getHardwareInfo();
      final hardwareId = hwInfo.hardwareId;
      if (hardwareId.isEmpty) return false;

      final info = await checkVersion(serverBaseUrl, hardwareId);
      if (info != null && info.hasUpdate && !info.isPaused && info.installFailedCount < 3) {
        AppLogger.log('🚀 [Motor OTA Aislado] Iniciando descarga silenciosa desatendida hacia v${info.versionName}...', level: 'SUCCESS');
        final clean = ApiService.cleanUrl(serverBaseUrl);
        final downloadUrl = Uri.parse('$clean${info.apkUrl}');
        
        client = http.Client();
        final request = http.Request('GET', downloadUrl);
        final streamedResponse = await client.send(request).timeout(const Duration(seconds: 15));
        
        if (streamedResponse.statusCode == 200) {
          final tempDir = Directory.systemTemp;
          final apkFile = File('${tempDir.path}/ClicDriver_v${info.versionName}.apk');
          final sink = apkFile.openWrite();
          await streamedResponse.stream.timeout(const Duration(minutes: 5)).pipe(sink);
          await sink.flush();
          await sink.close();
          client.close();
          client = null;

          AppLogger.log('📦 [Motor OTA Aislado] Descarga completada (${await apkFile.length()} bytes). Ejecutando instalación...', level: 'SUCCESS');
          final bool success = await _kioskChannel.invokeMethod('installApk', {'apkPath': apkFile.path});
          return success;
        } else {
          AppLogger.log('❌ [Motor OTA Aislado] Error HTTP ${streamedResponse.statusCode} al descargar APK', level: 'ERROR');
        }
      }
    } catch (e) {
      AppLogger.log('⚠️ [Motor OTA Aislado] Excepción en chequeo temprano: $e', level: 'WARNING');
    } finally {
      client?.close();
    }
    return false;
  }

  static Future<VersionInfo?> checkVersion(String serverBaseUrl, String hardwareId, {int? battery, String? installError}) async {
    final db = OfflineDbService();
    final urlCfg = await db.getServerUrlsConfig();

    // Determinar lista de URLs candidatas ordenadas: 1. Activa -> 2. Primaria -> 3. Fallback (AWS)
    final urlsToTry = <String>[];
    if (serverBaseUrl.isNotEmpty) urlsToTry.add(serverBaseUrl);
    if (urlCfg['active']?.isNotEmpty == true && !urlsToTry.contains(urlCfg['active']!)) urlsToTry.add(urlCfg['active']!);
    if (urlCfg['primary']?.isNotEmpty == true && !urlsToTry.contains(urlCfg['primary']!)) urlsToTry.add(urlCfg['primary']!);
    if (urlCfg['fallback']?.isNotEmpty == true && !urlsToTry.contains(urlCfg['fallback']!)) urlsToTry.add(urlCfg['fallback']!);

    final mdmPayload = await DeviceHardwareService.fetchMdmTelemetryPayload();
    mdmPayload['hwid'] = hardwareId;
    mdmPayload['version_name'] = AppConfig.appVersion;
    mdmPayload['version_code'] = AppConfig.appVersionCode;
    if (battery != null) {
      mdmPayload['battery'] = battery;
    }
    if (installError != null) mdmPayload['install_error'] = installError;

    for (int i = 0; i < urlsToTry.length; i++) {
      final currentBaseUrl = urlsToTry[i];
      try {
        final clean = ApiService.cleanUrl(currentBaseUrl);
        final url = Uri.parse('$clean/api/fleet/app-version');

        AppLogger.log('🔍 Consultando actualización OTA en $url (HWID: $hardwareId, v${AppConfig.appVersion}+${AppConfig.appVersionCode})...', level: 'INFO');

        final res = await http.post(
          url,
          headers: {
            'Content-Type': 'application/json',
            'X-Fleet-App': 'ClicDriver',
          },
          body: jsonEncode(mdmPayload),
        ).timeout(const Duration(seconds: 4));

        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          final hasUpdate = data['has_update'] == true;
          final isPaused = data['is_paused'] == true;
          final versionName = data['version_name'] ?? AppConfig.appVersion;
          final versionCode = data['version_code'] ?? AppConfig.appVersionCode;
          final apkUrl = data['apk_url'] ?? '';
          final releaseNotes = data['release_notes'] ?? '';
          final forceUpdate = data['force_update'] == true;
          final installFailedCount = data['install_failed_count'] ?? 0;

          if (hasUpdate) {
            AppLogger.log('📦 OTA RESPUESTA: ¡NUEVA VERSIÓN DISPONIBLE! v$versionName (Build $versionCode) - URL: $apkUrl', level: 'SUCCESS');
          } else if (isPaused) {
            AppLogger.log('⏸️ OTA RESPUESTA: Actualización pausada en servidor (${data['pause_reason'] ?? 'Sin motivo'})', level: 'WARNING');
          } else {
            AppLogger.log('✅ OTA RESPUESTA: La app se encuentra al día en v$versionName (Code $versionCode)', level: 'INFO');
          }

          // Si conectó con éxito en una URL que no era la activa previa, persistir la conmutación
          if (urlCfg['active'] != currentBaseUrl) {
            await db.saveServerUrlsConfig(
              primary: urlCfg['primary'] ?? currentBaseUrl,
              fallback: urlCfg['fallback'],
              active: currentBaseUrl,
            );
          }

          return VersionInfo(
            hasUpdate: hasUpdate,
            isPaused: isPaused,
            versionName: versionName,
            versionCode: versionCode,
            apkUrl: apkUrl,
            releaseNotes: releaseNotes,
            forceUpdate: forceUpdate,
            installFailedCount: installFailedCount,
          );
        } else {
          AppLogger.log('❌ Error HTTP ${res.statusCode} en $currentBaseUrl al consultar /api/fleet/app-version', level: 'WARNING');
        }
      } catch (e) {
        AppLogger.log('⚠️ Falla de enlace con $currentBaseUrl ($e). ${i + 1 < urlsToTry.length ? "Reintentando con servidor de respaldo..." : "Sin servidores disponibles."}', level: 'WARNING');
      }
    }

    return null;
  }

  static Future<bool> downloadAndInstallApk({
    required BuildContext context,
    required VersionInfo info,
    required String serverBaseUrl,
    required String hardwareId,
    required Function(String status, double progress) onProgress,
  }) async {
    http.Client? client;
    try {
      onProgress('Conectando al servidor...', 0.05);
      final clean = ApiService.cleanUrl(serverBaseUrl);
      final downloadUrl = Uri.parse('$clean${info.apkUrl}');
      
      AppLogger.log('Descargando APK OTA desde: $downloadUrl');
      onProgress('Descargando actualización v${info.versionName}...', 0.1);

      client = http.Client();
      final request = http.Request('GET', downloadUrl);
      final streamedResponse = await client.send(request).timeout(const Duration(seconds: 15));

      if (streamedResponse.statusCode != 200) {
        final err = 'Error HTTP ${streamedResponse.statusCode} al descargar APK (${info.apkUrl})';
        AppLogger.log(err, level: 'ERROR');
        await checkVersion(serverBaseUrl, hardwareId, installError: err);
        return false;
      }

      final totalBytes = streamedResponse.contentLength ?? 58000000;
      int receivedBytes = 0;
      final tempDir = Directory.systemTemp;
      final apkFile = File('${tempDir.path}/ClicDriver_v${info.versionName}.apk');
      final sink = apkFile.openWrite();

      await for (final chunk in streamedResponse.stream.timeout(const Duration(minutes: 5))) {
        sink.add(chunk);
        receivedBytes += chunk.length;
        final prog = 0.1 + (0.75 * (receivedBytes / totalBytes)).clamp(0.0, 0.75);
        final mb = (receivedBytes / (1024 * 1024)).toStringAsFixed(1);
        final totalMb = (totalBytes / (1024 * 1024)).toStringAsFixed(1);
        onProgress('Descargando: $mb MB / $totalMb MB (${(prog * 100).toInt()}%)', prog);
      }

      await sink.flush();
      await sink.close();
      client.close();
      client = null;

      onProgress('Ejecutando instalación desatendida...', 0.9);
      AppLogger.log('Descarga finalizada ($receivedBytes bytes). Iniciando instalación nativa: ${apkFile.path}');

      // Call Native MethodChannel Device Owner PackageInstaller
      final bool success = await _kioskChannel.invokeMethod('installApk', {'apkPath': apkFile.path});

      if (success) {
        onProgress('Instalación iniciada. Reiniciando aplicación...', 1.0);
        return true;
      } else {
        const err = 'La instalación nativa devolvió respuesta no exitosa';
        AppLogger.log(err, level: 'ERROR');
        await checkVersion(serverBaseUrl, hardwareId, installError: err);
        return false;
      }
    } catch (e) {
      final err = 'Error durante descarga o instalación desatendida: $e';
      AppLogger.log(err, level: 'ERROR');
      await checkVersion(serverBaseUrl, hardwareId, installError: err);
      return false;
    } finally {
      client?.close();
    }
  }

  static void showUpdateDialog(BuildContext context, VersionInfo info, String serverBaseUrl, String hardwareId) {
    bool isInstalling = false;
    bool hasAutoStarted = false;
    String statusMessage = 'Iniciando auto-actualización a v${info.versionName}...';
    double progressValue = 0.1;

    showDialog(
      context: context,
      barrierDismissible: !info.forceUpdate,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDlgState) {
          // Auto-start installation automatically on dialog opening!
          if (!hasAutoStarted) {
            hasAutoStarted = true;
            isInstalling = true;
            WidgetsBinding.instance.addPostFrameCallback((_) async {
              bool ok = await downloadAndInstallApk(
                context: context,
                info: info,
                serverBaseUrl: serverBaseUrl,
                hardwareId: hardwareId,
                onProgress: (status, prog) {
                  if (ctx.mounted) {
                    setDlgState(() {
                      statusMessage = status;
                      progressValue = prog;
                    });
                  }
                },
              );

              if (!ok && ctx.mounted) {
                setDlgState(() {
                  isInstalling = false;
                  statusMessage = '❌ Error instalando v${info.versionName}. Se reportó el fallo a TI.';
                });
              }
            });
          }

          return AlertDialog(
            backgroundColor: const Color(0xFF1E1E1E),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Row(
              children: [
                const Icon(Icons.system_update_rounded, color: Color(AppConfig.brandColor), size: 28),
                const SizedBox(width: 10),
                Text('Actualización v${info.versionName}', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(statusMessage, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 14),
                LinearProgressIndicator(
                  value: progressValue > 0 ? progressValue : null,
                  backgroundColor: Colors.white12,
                  color: const Color(AppConfig.brandColor),
                ),
                const SizedBox(height: 8),
                const Text('Instalación desatendida en curso. No apague el teléfono.', style: TextStyle(color: Colors.amberAccent, fontSize: 11)),
              ],
            ),
            actions: [
              if (!info.forceUpdate && !isInstalling)
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cerrar', style: TextStyle(color: Colors.grey)),
                ),
              if (!isInstalling)
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(AppConfig.brandColor),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: () async {
                    setDlgState(() {
                      isInstalling = true;
                      statusMessage = 'Reintentando instalación v${info.versionName}...';
                    });

                    bool ok = await downloadAndInstallApk(
                      context: context,
                      info: info,
                      serverBaseUrl: serverBaseUrl,
                      hardwareId: hardwareId,
                      onProgress: (status, prog) {
                        if (ctx.mounted) {
                          setDlgState(() {
                            statusMessage = status;
                            progressValue = prog;
                          });
                        }
                      },
                    );

                    if (!ok && ctx.mounted) {
                      setDlgState(() {
                        isInstalling = false;
                        statusMessage = '❌ Error instalando v${info.versionName}. Se reportó el fallo a TI.';
                      });
                    }
                  },
                  icon: const Icon(Icons.refresh_rounded, color: Colors.white),
                  label: const Text('Reintentar Instalación', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
            ],
          );
        },
      ),
    );
  }
}
