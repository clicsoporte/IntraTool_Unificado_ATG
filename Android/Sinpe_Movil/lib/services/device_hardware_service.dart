import 'dart:convert';
import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DeviceHardwareInfo {
  final String hardwareId;
  final String deviceName;
  final String osVersion;
  final String deviceModel;

  DeviceHardwareInfo({
    required this.hardwareId,
    required this.deviceName,
    this.osVersion = 'Android',
    this.deviceModel = 'Android',
  });
}

class DeviceHardwareService {
  static const String _storageKey = 'device_hardware_id';
  static const String _nameKey = 'device_name_info';
  static const _secureStorage = FlutterSecureStorage();
  static const MethodChannel _kioskChannel = MethodChannel('com.clicsoporte.clic_driver/kiosk');

  static Future<DeviceHardwareInfo> getHardwareInfo() async {
    String? hardwareId;
    String deviceName = 'Celular Flotilla Android';
    String osVersion = 'Android';
    String deviceModel = 'Android';

    try {
      if (Platform.isAndroid) {
        final deviceInfo = DeviceInfoPlugin();
        final androidInfo = await deviceInfo.androidInfo;
        final brand = androidInfo.brand.toUpperCase();
        final model = androidInfo.model;
        final release = androidInfo.version.release;
        final sdk = androidInfo.version.sdkInt;

        deviceName = '$brand $model'.trim();
        osVersion = 'Android $release (API $sdk)';
        deviceModel = '$brand $model';

        // Attempt to fetch unique ANDROID_ID from native Kotlin channel
        try {
          final String? nativeAndroidId = await _kioskChannel.invokeMethod('getAndroidId');
          if (nativeAndroidId != null && nativeAndroidId.trim().isNotEmpty && nativeAndroidId.toUpperCase() != 'UNKNOWN') {
            hardwareId = 'CLIC-HWID-${nativeAndroidId.trim().toUpperCase()}';
          }
        } catch (_) {}

        // Fallback if native channel fails
        if (hardwareId == null || hardwareId.isEmpty) {
          final rawId = androidInfo.id;
          if (rawId.trim().isNotEmpty) {
            hardwareId = 'CLIC-HWID-${rawId.toUpperCase()}';
          }
        }
      }
    } catch (_) {}

    if (hardwareId == null || hardwareId.isEmpty) {
      try {
        hardwareId = await _secureStorage.read(key: _storageKey);
      } catch (_) {}
    }

    if (hardwareId == null || hardwareId.isEmpty) {
      final prefs = await SharedPreferences.getInstance();
      hardwareId = prefs.getString(_storageKey);
      if (hardwareId == null || hardwareId.isEmpty) {
        final timestamp = DateTime.now().millisecondsSinceEpoch.toRadixString(16).toUpperCase();
        hardwareId = 'CLIC-HWID-$timestamp';
        await prefs.setString(_storageKey, hardwareId);
      }
    }

    try {
      await _secureStorage.write(key: _storageKey, value: hardwareId);
      await _secureStorage.write(key: _nameKey, value: deviceName);
    } catch (_) {}

    return DeviceHardwareInfo(
      hardwareId: hardwareId,
      deviceName: deviceName,
      osVersion: osVersion,
      deviceModel: deviceModel,
    );
  }

  static Future<String> getHardwareId() async {
    final info = await getHardwareInfo();
    return info.hardwareId;
  }

  static Future<Map<String, dynamic>> fetchMdmTelemetryPayload() async {
    final info = await getHardwareInfo();
    Map<String, dynamic> payload = {
      'hwid': info.hardwareId,
      'device_name': info.deviceName,
      'device_model': info.deviceModel,
      'os_version': info.osVersion,
    };

    // Native Serial & IMEI extraction for MDM / Asset Inventory
    try {
      final String? serial = await _kioskChannel.invokeMethod('getSerialNumber');
      if (serial != null && serial.trim().isNotEmpty) {
        payload['serial_number'] = serial.trim();
      }
    } catch (_) {}

    try {
      final String? imei = await _kioskChannel.invokeMethod('getImei');
      if (imei != null && imei.trim().isNotEmpty) {
        payload['imei'] = imei.trim();
      }
    } catch (_) {}

    // Native Real Battery Level, Charging Status & Real Temperature / Voltage / Health
    try {
      final Map<dynamic, dynamic>? batteryMap = await _kioskChannel.invokeMapMethod('getBatteryInfo');
      if (batteryMap != null) {
        if (batteryMap['level'] != null) {
          payload['battery'] = (batteryMap['level'] as num).toInt();
        }
        payload['is_charging'] = batteryMap['isCharging'] == true;
        if (batteryMap['temperature'] != null) {
          payload['battery_temp'] = (batteryMap['temperature'] as num).toDouble();
        }
        if (batteryMap['voltage'] != null) {
          payload['battery_voltage'] = (batteryMap['voltage'] as num).toDouble();
        }
        if (batteryMap['health'] != null) {
          payload['battery_health'] = batteryMap['health'].toString();
        }
        if (batteryMap['technology'] != null) {
          payload['battery_tech'] = batteryMap['technology'].toString();
        }
      }
    } catch (_) {}

    // Extended Hardware Telemetry (RAM, Storage, SIM Carrier, Network Type)
    try {
      final Map<dynamic, dynamic>? ext = await _kioskChannel.invokeMapMethod('getExtendedHardwareTelemetry');
      if (ext != null) {
        if (ext['ram_free_mb'] != null) payload['ram_free_mb'] = (ext['ram_free_mb'] as num).toInt();
        if (ext['ram_total_mb'] != null) payload['ram_total_mb'] = (ext['ram_total_mb'] as num).toInt();
        if (ext['storage_free_mb'] != null) payload['storage_free_mb'] = (ext['storage_free_mb'] as num).toInt();
        if (ext['storage_total_mb'] != null) payload['storage_total_mb'] = (ext['storage_total_mb'] as num).toInt();
        if (ext['sim_carrier'] != null) payload['sim_carrier'] = ext['sim_carrier'].toString();
        if (ext['network_type'] != null) payload['network_type'] = ext['network_type'].toString();
        if (ext['phone_number'] != null && ext['phone_number'].toString().trim().isNotEmpty) {
          payload['phone_number'] = ext['phone_number'].toString().trim();
        }
      }
    } catch (_) {}

    // Fallback: Local saved driver phone if not auto-detected from SIM
    if (payload['phone_number'] == null || (payload['phone_number'] as String).isEmpty) {
      try {
        final prefs = await SharedPreferences.getInstance();
        final localPhone = prefs.getString('driver_phone_number');
        if (localPhone != null && localPhone.trim().isNotEmpty) {
          payload['phone_number'] = localPhone.trim();
        }
      } catch (_) {}
    }

    // 1. GPS Position
    try {
      Position? pos = await Geolocator.getLastKnownPosition();
      if (pos != null) {
        payload['lat'] = pos.latitude;
        payload['lng'] = pos.longitude;
      }
    } catch (_) {}

    // 2. Device Owner Status
    try {
      final bool isDo = await _kioskChannel.invokeMethod('isDeviceOwner');
      payload['is_device_owner'] = isDo;
    } catch (_) {}

    // 3. Installed Apps List
    try {
      final List<dynamic>? apps = await _kioskChannel.invokeMethod('getInstalledApps');
      if (apps != null) {
        payload['installed_apps'] = jsonEncode(apps);
      }
    } catch (_) {}

    return payload;
  }
}
