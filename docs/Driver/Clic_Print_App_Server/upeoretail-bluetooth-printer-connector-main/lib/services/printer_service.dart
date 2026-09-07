import 'dart:convert';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:permission_handler/permission_handler.dart';

import '../models/receipt.dart';
import 'escpos_builder.dart';
import 'logger_service.dart';
import 'settings_store.dart';

/// Typed errors so the UI can react precisely (choose printer / turn on BT /
/// grant permission / printer offline) instead of showing a generic failure.
class PrinterException implements Exception {
  final String message;
  const PrinterException(this.message);
  @override
  String toString() => message;
}

class NoPrinterSelected extends PrinterException {
  const NoPrinterSelected() : super('No default printer selected.');
}

class BluetoothOff extends PrinterException {
  const BluetoothOff() : super('Bluetooth is turned off.');
}

class PermissionDenied extends PrinterException {
  const PermissionDenied() : super('Bluetooth permission was denied.');
}

class PrinterUnavailable extends PrinterException {
  const PrinterUnavailable(super.message);
}

/// Bluetooth Classic (SPP) ESC/POS printing. No BLE, no RawBT, no external app.
class PrinterService {
  final SettingsStore store;
  final LoggerService logger;
  PrinterService(this.store, this.logger);

  void _log(String msg, {String level = 'INFO', String category = 'BLUETOOTH'}) {
    print('[PrinterLog] $msg');
    logger.log(level: level, category: category, message: msg);
  }

  /// Request the runtime permissions needed across Android versions.
  Future<void> ensurePermissions() async {
    _log('Verificando permisos de Android...');
    final statuses = await <Permission>[
      Permission.bluetoothConnect,
      Permission.bluetoothScan,
      Permission.locationWhenInUse,
      Permission.location,
      Permission.camera,
      Permission.photos,
    ].request();

    final btConn = statuses[Permission.bluetoothConnect];
    final btScan = statuses[Permission.bluetoothScan];
    final loc = statuses[Permission.locationWhenInUse];
    final cam = statuses[Permission.camera];
    _log('Estado Permisos -> BT: $btConn, Scan: $btScan, GPS: $loc, Cam: $cam');

    final connect = statuses[Permission.bluetoothConnect];
    if (connect != null && (connect.isPermanentlyDenied || connect.isDenied)) {
      final scan = statuses[Permission.bluetoothScan];
      final blockedOn12Plus = connect.isPermanentlyDenied ||
          (connect.isDenied && (scan?.isDenied ?? false) && (scan?.isPermanentlyDenied ?? false));
      if (blockedOn12Plus) {
        _log('ERROR PERMISO: El usuario o el sistema denegó Bluetooth Connect');
        throw const PermissionDenied();
      }
    }
  }

  Future<bool> isBluetoothOn() => PrintBluetoothThermal.bluetoothEnabled;

  Future<bool> isConnected() => PrintBluetoothThermal.connectionStatus;

  Future<List<BluetoothInfo>> pairedPrinters() async {
    await ensurePermissions();
    if (!await isBluetoothOn()) {
      _log('Error: Bluetooth esta apagado');
      throw const BluetoothOff();
    }
    _log('Buscando impresoras Bluetooth vinculadas...');
    final list = await PrintBluetoothThermal.pairedBluetooths;
    _log('Encontradas ${list.length} impresoras vinculadas');
    return list;
  }

  Future<void> connect(String mac) async {
    if (!await isBluetoothOn()) {
      _log('Error: Bluetooth apagado');
      throw const BluetoothOff();
    }
    _log('Conectando a MAC: $mac...');
    final ok = await PrintBluetoothThermal.connect(macPrinterAddress: mac);
    if (!ok) {
      _log('Fallo conexion Bluetooth a MAC: $mac');
      throw PrinterUnavailable(
          'No se pudo conectar a $mac. Revisa que la impresora este encendida y vinculada.');
    }
    _log('Conexion Bluetooth Exitosa a $mac');
  }

  Future<void> disconnect() async {
    try {
      _log('Desconectando Bluetooth...');
      await PrintBluetoothThermal.disconnect;
    } catch (_) {/* ignore */}
  }

  Future<void> ensureConnectedToDefault({bool force = false}) async {
    await ensurePermissions();
    final mac = store.printerMac;
    if (mac == null || mac.isEmpty) {
      _log('Error: No hay impresora predeterminada seleccionada');
      throw const NoPrinterSelected();
    }
    if (!await isBluetoothOn()) {
      _log('Error: Bluetooth apagado');
      throw const BluetoothOff();
    }
    if (force) {
      _log('Reconexión forzada a $mac...');
      await disconnect();
    } else if (await isConnected()) {
      _log('Ya existe conexión Bluetooth activa con $mac');
      return;
    }
    await connect(mac);
  }

  Future<bool> _writeOnce(List<int> bytes) async {
    _log('Enviando ${bytes.length} bytes por Bluetooth...');
    final ok = await PrintBluetoothThermal.writeBytes(bytes);
    _log('Resultado envio de bytes: $ok');
    return ok;
  }

  Future<void> _write(List<int> bytes) async {
    if (await _writeOnce(bytes)) {
      _log('Impresión enviada correctamente');
      return;
    }
    _log('Reintentando impresion con reconexión forzada...');
    await ensureConnectedToDefault(force: true);
    if (await _writeOnce(bytes)) {
      _log('Impresión enviada tras reintento');
      return;
    }
    _log('Error: La impresora no respondió a los bytes enviados');
    throw const PrinterUnavailable(
        'La impresora no respondió. Verifica la batería y que esté encendida.');
  }

  Future<void> printRawString(String text) async {
    _log('Procesando impresion de texto...');
    await ensureConnectedToDefault();
    final List<int> bytes = [];
    bytes.addAll([0x1B, 0x40]);
    bytes.addAll(latin1.encode(text));
    bytes.addAll([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00]);
    await _write(bytes);
  }

  Future<void> printReceipt(Receipt r) async {
    _log('Procesando boleta ${r.invoiceNo}...');
    if (r.rawText != null && r.rawText!.trim().isNotEmpty) {
      await printRawString(r.rawText!);
      return;
    }
    await ensureConnectedToDefault();
    final bytes = await EscPosBuilder.build(r, store.paperSize);
    await _write(bytes);
  }

  Future<void> testPrint() async {
    _log('Iniciando ticket de prueba...');
    await ensureConnectedToDefault();
    final bytes = await EscPosBuilder.buildTest(store.paperSize);
    await _write(bytes);
  }
}
