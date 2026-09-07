import 'dart:convert';
import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:image/image.dart' as img;
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import '../models/delivery_doc.dart';

class NativePrinterService {
  static String stripAccents(String input) {
    return input
        .replaceAll('á', 'a').replaceAll('é', 'e').replaceAll('í', 'i').replaceAll('ó', 'o').replaceAll('ú', 'u')
        .replaceAll('Á', 'A').replaceAll('É', 'E').replaceAll('Í', 'I').replaceAll('Ó', 'O').replaceAll('Ú', 'U')
        .replaceAll('ñ', 'n').replaceAll('Ñ', 'N').replaceAll('ü', 'u').replaceAll('Ü', 'U');
  }

  static Future<List<BluetoothInfo>> getPairedPrinters() async {
    try {
      return await PrintBluetoothThermal.pairedBluetooths;
    } catch (_) {
      return [];
    }
  }

  static Future<bool> connect(String macAddress) async {
    try {
      return await PrintBluetoothThermal.connect(macPrinterAddress: macAddress);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> testPrint(String macAddress, {String paperSize = '80mm'}) async {
    try {
      bool isConnected = await PrintBluetoothThermal.connectionStatus;
      if (!isConnected) {
        bool ok = await connect(macAddress);
        if (!ok) {
          final paired = await getPairedPrinters();
          if (paired.isNotEmpty) {
            await connect(paired.first.macAdress);
          }
        }
      }

      final divider = paperSize == '58mm' ? '--------------------------------' : '------------------------------------------------';

      final rawText = '''
CLIC SOPORTE Y CLIC TIENDA S.R.L
Cedula Juridica: 3-102-894538
$divider
PRUEBA DE IMPRESION BLUETOOTH
Estado: OK (Conectado)
Papel: $paperSize ESC/POS
Fecha: ${DateTime.now().toString().substring(0, 19)}
$divider
¡Impresion Exitosa desde Clic Driver!
'''.trim();

      final cleanText = stripAccents(rawText);

      List<int> bytes = [];
      bytes.addAll([0x1B, 0x40]); // Reset printer
      bytes.addAll(latin1.encode(cleanText));
      bytes.addAll([0x1B, 0x64, 0x03]); // Feed 3 lines
      bytes.addAll([0x1B, 0x42, 0x02, 0x02]); // Beep sound 2 times
      bytes.addAll([0x1D, 0x56, 0x42, 0x00]); // Paper Cut

      return await PrintBluetoothThermal.writeBytes(bytes);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> printBoleta({
    required DeliveryDoc doc,
    required List<DeliveryLine> lines,
    Map<String, String>? sysConfig,
    String companyName = 'CLIC SOPORTE Y CLIC TIENDA S.R.L',
    String taxId = '3-102-894538',
    String address = 'San Jose, Costa Rica',
    String phone = '+506 4000-0630',
    String email = 'soporte@clicsoporte.com',
    String? targetMacAddress,
    String paperSize = '80mm',
  }) async {
    final cfg = sysConfig ?? {};
    bool isConnected = await PrintBluetoothThermal.connectionStatus;
    if (!isConnected) {
      if (targetMacAddress != null && targetMacAddress.isNotEmpty) {
        await connect(targetMacAddress);
      } else {
        final printers = await getPairedPrinters();
        if (printers.isNotEmpty) {
          await connect(printers.first.macAdress);
        }
      }
    }

    final divider = paperSize == '58mm' ? '--------------------------------' : '------------------------------------------------';
    final dotDivider = paperSize == '58mm' ? '................................' : '................................................';

    StringBuffer linesBuffer = StringBuffer();
    if (lines.isNotEmpty && cfg['apk_print_show_lines'] != 'false') {
      linesBuffer.writeln(divider);
      linesBuffer.writeln('DISCREPANCIAS / FALTANTES');
      if (paperSize == '58mm') {
        linesBuffer.writeln('Cod  |Prod    |Ped|Ent|Fal');
        linesBuffer.writeln(divider);
        for (var l in lines) {
          final cod = l.codigo.padRight(4).substring(0, 4);
          final prod = l.desc.padRight(8).substring(0, 8);
          final ped = l.pedida.toString().padLeft(3);
          final ent = l.entregada.toString().padLeft(3);
          final fal = l.faltante.toString().padLeft(3);
          linesBuffer.writeln('$cod |$prod |$ped|$ent|$fal');
        }
      } else {
        // 80mm paper size (48 columns)
        linesBuffer.writeln('Cod    | Producto             | Ped | Ent | Fal');
        linesBuffer.writeln(divider);
        for (var l in lines) {
          final cod = l.codigo.padRight(7).substring(0, 7);
          final prod = l.desc.padRight(21).substring(0, 21);
          final ped = l.pedida.toString().padLeft(4);
          final ent = l.entregada.toString().padLeft(4);
          final fal = l.faltante.toString().padLeft(4);
          linesBuffer.writeln('$cod| $prod| $ped| $ent| $fal');
        }
      }
      linesBuffer.writeln(divider);
    }

    StringBuffer clientBuffer = StringBuffer();
    if (cfg['apk_print_show_client'] != 'false') {
      clientBuffer.writeln('CLIENTE:');
      if (doc.clienteId.isNotEmpty) {
        clientBuffer.writeln('Codigo: ${doc.clienteId}');
      }
      clientBuffer.writeln('Nombre: ${doc.clienteNombre}');
      if (doc.lugarEntrega.isNotEmpty) {
        clientBuffer.writeln('Destino (EMB): ${doc.lugarEntrega}');
      }
      clientBuffer.writeln(divider);
    }

    final fechaPrint = doc.fechaEntrega.trim().isNotEmpty
        ? doc.fechaEntrega
        : DateTime.now().toString().substring(0, 19).replaceAll('T', ' ');

    final rawHeader = '''
${companyName.toUpperCase()}
Cedula Juridica: $taxId
$address
$phone | $email
Boleta de Entrega ($paperSize)
$dotDivider
Boleta: #${doc.boletaNumero}
Doc ERP: #${doc.documentoNumero}
Estado: [ ${doc.estado.toUpperCase()} ]
Fecha: $fechaPrint
Ruta: ${doc.rutaNombre}
Camion: ${doc.placaVehiculo}
Chofer: ${doc.choferNombre}
$divider
${clientBuffer.toString().trim()}
${linesBuffer.toString().trim()}
${doc.comentario.isNotEmpty ? '\nNotas: ${doc.comentario}\n$dotDivider' : ''}
Recibido Por: ${doc.nombreRecibe ?? '_______________________'}

Firma Digital del Cliente:
'''.trim();

    final cleanHeader = stripAccents(rawHeader);
    final isBold = (cfg['apk_print_bold'] ?? 'false') == 'true';

    List<int> bytes = [];
    bytes.addAll([0x1B, 0x40]); // Reset printer
    if (isBold) {
      bytes.addAll([0x1B, 0x45, 0x01]); // Bold / Emphasized ON
    } else {
      bytes.addAll([0x1B, 0x45, 0x00, 0x1B, 0x47, 0x00]); // Bold OFF & Double-strike OFF (Texto Normal Claro)
    }
    bytes.addAll(latin1.encode(cleanHeader));
    bytes.addAll([0x0A, 0x0A]);

    // Encode Hand-Drawn Signature Bitmap Image onto Thermal Receipt
    if (doc.firmaCliente != null && doc.firmaCliente!.isNotEmpty) {
      try {
        final cleanBase64 = doc.firmaCliente!.contains(',') ? doc.firmaCliente!.split(',').last : doc.firmaCliente!;
        final imageBytes = base64Decode(cleanBase64);
        final img.Image? decoded = img.decodeImage(imageBytes);
        if (decoded != null) {
          try {
            final profile = await CapabilityProfile.load().timeout(const Duration(milliseconds: 800));
            final generator = Generator(paperSize == '58mm' ? PaperSize.mm58 : PaperSize.mm80, profile);
            final img.Image resized = img.copyResize(decoded, width: paperSize == '58mm' ? 360 : 480);
            bytes.addAll(generator.imageRaster(resized, align: PosAlign.center));
          } catch (_) {
            bytes.addAll(latin1.encode('\n[Firma Digital Registrada]\n'));
          }
        }
      } catch (_) {
        bytes.addAll(latin1.encode('\nFirma: _________________________\n'));
      }
    } else {
      bytes.addAll(latin1.encode('\nFirma: _________________________\n'));
    }

    final footerText = cfg['apk_print_footer_text'] ?? '¡Gracias por su preferencia!';
    final rawFooter = '''
$dotDivider
$footerText
'''.trim();

    final cleanFooter = stripAccents(rawFooter);

    bytes.addAll([0x0A]);
    bytes.addAll(latin1.encode(cleanFooter));
    bytes.addAll([0x1B, 0x64, 0x03]); // Feed 3 lines
    bytes.addAll([0x1B, 0x42, 0x02, 0x02]); // Beep sound 2 times
    bytes.addAll([0x1D, 0x56, 0x42, 0x00]); // Paper cut

    return await PrintBluetoothThermal.writeBytes(bytes);
  }
}
