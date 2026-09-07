import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'app_logger.dart';

class DirectSmsService {
  static const MethodChannel _channel = MethodChannel('com.clicsoporte.clic_driver/sms');

  /// Formats and cleans phone number (defaults to Costa Rica +506 prefix if 8 digits)
  static String formatPhone(String phone) {
    String cleaned = phone.replaceAll(RegExp(r'[^0-9+]'), '');
    if (cleaned.length == 8 && !cleaned.startsWith('+')) {
      return '+506$cleaned';
    }
    return cleaned;
  }

  /// Sends a direct SMS using the phone's native SIM card via SmsManager MethodChannel
  static Future<bool> sendSms({required String phone, required String message}) async {
    final cleanPhone = formatPhone(phone);
    if (cleanPhone.isEmpty || cleanPhone.length < 8) {
      AppLogger.log('DirectSmsService: Teléfono inválido u omitido: "$phone"', level: 'WARNING');
      return false;
    }

    try {
      final status = await Permission.sms.status;
      if (!status.isGranted) {
        final reqStatus = await Permission.sms.request();
        if (!reqStatus.isGranted) {
          AppLogger.log('DirectSmsService: Permiso de SEND_SMS denegado por el usuario en Android.', level: 'WARNING');
          return false;
        }
      }

      final bool result = await _channel.invokeMethod('sendSms', {
        'phone': cleanPhone,
        'message': message,
      });
      AppLogger.log('DirectSmsService: SMS enviado exitosamente a $cleanPhone', level: 'SUCCESS');
      return result;
    } on PlatformException catch (e) {
      AppLogger.log('DirectSmsService: Error enviando SMS a $cleanPhone: ${e.message}', level: 'ERROR');
      return false;
    } catch (e) {
      AppLogger.log('DirectSmsService: Error inesperado enviando SMS: $e', level: 'ERROR');
      return false;
    }
  }

  /// Dispatch delivery status notification directly from driver SIM to Salesperson and Order Creator
  static Future<void> notifyDeliveryStatusDirectSms({
    required Map<String, dynamic> doc,
    required String newStatus,
    String? choferNombre,
    String? comentario,
    String? nombreRecibe,
  }) async {
    try {
      final docNum = doc['documento_numero'] ?? doc['boleta_numero'] ?? 'DOC';
      final clientName = doc['cliente_nombre'] ?? 'Cliente';
      final driver = choferNombre ?? 'Chofer';
      final recibe = nombreRecibe != null && nombreRecibe.trim().isNotEmpty ? nombreRecibe.trim() : 'Recibido';

      String statusStr = 'COMPLETADA';
      String prefKey = 'completed';

      if (newStatus == 'incompleto' || newStatus == 'incompleta') {
        statusStr = 'INCOMPLETA (Parcial)';
        prefKey = 'incomplete';
      } else if (newStatus == 'rechazado' || newStatus == 'rechazada') {
        statusStr = 'RECHAZADA';
        prefKey = 'rejected';
      }

      String message = '📦 [Clic Driver] Documento #$docNum\n'
          'Cliente: $clientName\n'
          'Estado: $statusStr\n'
          'Recibe: $recibe\n'
          'Chofer: $driver';

      if (comentario != null && comentario.trim().isNotEmpty) {
        final cleanCom = comentario.length > 50 ? '${comentario.substring(0, 50)}...' : comentario;
        message += '\nObs: $cleanCom';
      }

      // 1. Vendedor
      final vendedorPhone = (doc['vendedor_phone'] ?? '').toString();
      final vendedorPrefs = doc['vendedor_sms_prefs'] is Map ? doc['vendedor_sms_prefs'] as Map : {};
      final vendorEnabled = vendedorPrefs[prefKey] != false;

      if (vendedorPhone.isNotEmpty && vendorEnabled) {
        AppLogger.log('DirectSmsService: Enviando SMS a Vendedor ($vendedorPhone)...');
        await sendSms(phone: vendedorPhone, message: message);
      }

      // 2. Creador del Pedido (ERP Order Creator)
      final creadorPhone = (doc['creado_por_phone'] ?? '').toString();
      final creadorPrefs = doc['creado_por_sms_prefs'] is Map ? doc['creado_por_sms_prefs'] as Map : {};
      final creatorEnabled = creadorPrefs[prefKey] != false;

      // Evitar duplicar mensaje si el vendedor es el mismo creador del pedido
      if (creadorPhone.isNotEmpty && creatorEnabled && creadorPhone != vendedorPhone) {
        AppLogger.log('DirectSmsService: Enviando SMS a Creador de Pedido ($creadorPhone)...');
        await sendSms(phone: creadorPhone, message: message);
      }
    } catch (e) {
      AppLogger.log('DirectSmsService: Error procesando notificaciones de entrega: $e', level: 'ERROR');
    }
  }

  /// Sends emergency alert SMS to IT department in case of failure or critical app error
  static Future<void> sendEmergencyItAlertSms({
    required String errorMessage,
    String? docNumero,
    String? driverName,
    String? itPhonesRaw,
  }) async {
    try {
      final docInfo = docNumero != null ? ' Doc: #$docNumero.' : '';
      final choferInfo = driverName != null ? ' Chofer: $driverName.' : '';
      final msg = '🚨 [Clic Driver ALERTA IT]$docInfo$choferInfo Fallo: $errorMessage';

      final phonesStr = itPhonesRaw ?? '';
      List<String> phoneList = phonesStr
          .split(RegExp(r'[,;]'))
          .map((p) => p.trim())
          .where((p) => p.isNotEmpty)
          .toList();

      if (phoneList.isEmpty) {
        AppLogger.log('DirectSmsService: No hay teléfonos de TI configurados para alertas de emergencia.', level: 'WARNING');
        return;
      }

      for (final phone in phoneList) {
        AppLogger.log('DirectSmsService: Enviando SMS de emergencia IT a $phone...');
        await sendSms(phone: phone, message: msg);
      }
    } catch (e) {
      AppLogger.log('DirectSmsService: Error enviando SMS de emergencia IT: $e', level: 'ERROR');
    }
  }
}
