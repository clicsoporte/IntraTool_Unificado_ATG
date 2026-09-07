import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import '../config.dart';
import 'app_logger.dart';

class DeviceSecurityService {
  /// Solicita de forma proactiva todos los permisos requeridos por la app en el arranque inicial.
  static Future<Map<Permission, PermissionStatus>> requestAllCorePermissions() async {
    try {
      final permissions = [
        Permission.location,
        Permission.notification,
        Permission.camera,
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
        Permission.ignoreBatteryOptimizations,
        Permission.sms,
      ];

      final statuses = await permissions.request();
      AppLogger.log('🛡️ Verificación inicial de permisos del sistema completada', level: 'INFO');
      return statuses;
    } catch (e) {
      AppLogger.log('⚠️ Excepción al solicitar permisos del sistema: $e', level: 'WARNING');
      return {};
    }
  }

  /// Verifica si los servicios de ubicación (GPS) del celular están encendidos.
  static Future<bool> isGpsEnabled() async {
    try {
      final status = await Permission.location.serviceStatus;
      return status.isEnabled;
    } catch (_) {
      return true; // Fallback seguro
    }
  }

  /// Verifica si la antena Bluetooth del celular está activada.
  static Future<bool> isBluetoothEnabled() async {
    try {
      bool isGranted = await PrintBluetoothThermal.isPermissionBluetoothGranted;
      if (!isGranted) return false;
      return await PrintBluetoothThermal.bluetoothEnabled;
    } catch (_) {
      return true; // Fallback seguro
    }
  }

  /// Despliega el diálogo de bloqueo por GPS/Telemetría apagada (Guardián de Telemetría).
  static Future<void> showGpsDisabledDialog(BuildContext context) async {
    AppLogger.log('⚠️ GUARDIÁN TELEMETRÍA: El chofer intentó operar con la Telemetría/Ubicación desactivada.', level: 'WARNING');
    
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1E1E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.location_off_rounded, color: Colors.redAccent, size: 28),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'TELEMETRÍA / UBICACIÓN REQUERIDA',
                style: TextStyle(color: Colors.redAccent, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: const Text(
          'Por política de seguridad y trazabilidad de la empresa, es OBLIGATORIO mantener encendida la Telemetría / Ubicación en tu celular para registrar entregas y rutas.\n\nPor favor activa la Ubicación en la barra de ajustes de Android para continuar.',
          style: TextStyle(color: Colors.white70, fontSize: 13),
        ),
        actions: [
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.redAccent,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () async {
              await openAppSettings();
              if (ctx.mounted) Navigator.pop(ctx);
            },
            icon: const Icon(Icons.settings, color: Colors.white),
            label: const Text('Abrir Ajustes de Android', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  /// Despliega el diálogo de aviso por Bluetooth desactivado (Guardián de Bluetooth).
  static Future<void> showBluetoothDisabledDialog(BuildContext context) async {
    AppLogger.log('⚠️ GUARDIÁN BLUETOOTH: Intento de impresión o guardado sin Bluetooth encendido.', level: 'WARNING');
    
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1E1E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.bluetooth_disabled_rounded, color: Colors.amber, size: 28),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'BLUETOOTH DESACTIVADO',
                style: TextStyle(color: Colors.amber, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: const Text(
          'Para conectar la impresora térmica e imprimir la boleta física, debes encender la antena Bluetooth de tu celular.',
          style: TextStyle(color: Colors.white70, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(AppConfig.brandColor),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () async {
              await openAppSettings();
              if (ctx.mounted) Navigator.pop(ctx);
            },
            icon: const Icon(Icons.bluetooth, color: Colors.white),
            label: const Text('Activar Bluetooth', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  /// Aplica las restricciones nativas MDM de Device Owner recibidas del servidor.
  static Future<bool> applyMdmPolicy(Map<String, dynamic> policy) async {
    try {
      const channel = MethodChannel('com.clicsoporte.clic_driver/kiosk');
      final result = await channel.invokeMethod<bool>('applyMdmRestrictions', {
        'forceGps': policy['forceGps'] ?? true,
        'disallowAirplaneMode': policy['disallowAirplaneMode'] ?? false,
        'disallowMobileDataOff': policy['disallowMobileDataOff'] ?? false,
        'disallowBatterySaver': policy['disallowBatterySaver'] ?? false,
        'blockUninstall': policy['blockUninstall'] ?? true,
        'disallowSettings': policy['disallowSettings'] ?? false,
        'disallowTethering': policy['disallowTethering'] ?? false,
        'disallowInstallApps': policy['disallowInstallApps'] ?? false,
        'disallowPlayStoreInstall': policy['disallowPlayStoreInstall'] ?? false,
        'alwaysOnVpn': policy['alwaysOnVpn'] ?? false,
        'vpnPackage': policy['vpnPackage'] ?? 'com.wireguard.android',
        'whitelistedPackages': policy['whitelistedPackages'] != null 
            ? List<String>.from(policy['whitelistedPackages'])
            : null,
      });

      if (result == true) {
        AppLogger.log('👑 Políticas MDM aplicadas con éxito en el sistema operativo', level: 'SUCCESS');
      }
      return result ?? false;
    } on MissingPluginException {
      // Ignorar silenciosamente si se ejecuta en un aislado en segundo plano sin Activity activa
      return false;
    } catch (e) {
      AppLogger.log('⚠️ Error aplicando restricciones MDM nativas: $e', level: 'WARNING');
      return false;
    }
  }

  /// Libera completamente todas las restricciones MDM y el modo Kiosco (Modo Emergencia Técnico).
  static Future<bool> clearAllMdmRestrictions() async {
    try {
      const channel = MethodChannel('com.clicsoporte.clic_driver/kiosk');
      final result = await channel.invokeMethod<bool>('clearAllMdmRestrictions');
      if (result == true) {
        AppLogger.log('🔓 MODO EMERGENCIA TÉCNICO: Todas las restricciones MDM y Kiosco han sido liberadas.', level: 'SUCCESS');
      }
      return result ?? false;
    } on MissingPluginException {
      return false;
    } catch (e) {
      AppLogger.log('⚠️ Error liberando restricciones MDM: $e', level: 'WARNING');
      return false;
    }
  }

  /// Reinicia el túnel de WireGuard y refresca el enlace Always-On de red sin cerrar la app.
  static Future<bool> restartWireGuardTunnel({String? tunnelName, String vpnPackage = 'com.wireguard.android'}) async {
    try {
      const channel = MethodChannel('com.clicsoporte.clic_driver/kiosk');
      final result = await channel.invokeMethod<bool>('restartWireGuardVpnTunnel', {
        'vpnPackage': vpnPackage,
        'tunnelName': tunnelName,
      });
      if (result == true) {
        AppLogger.log('🔄 Túnel WireGuard refrescado exitosamente tras cambio de red/pérdida de enlace.', level: 'SUCCESS');
      }
      return result ?? false;
    } on MissingPluginException {
      return false;
    } catch (e) {
      AppLogger.log('⚠️ Error refrescando túnel WireGuard: $e', level: 'WARNING');
      return false;
    }
  }
}
