import 'dart:convert';
import 'dart:io';
import '../models/receipt.dart';
import 'logger_service.dart';
import 'printer_service.dart';

class ServerService {
  final PrinterService printer;
  final LoggerService logger;
  HttpServer? _server;

  ServerService(this.printer, this.logger);

  Future<void> start() async {
    try {
      _server = await HttpServer.bind(InternetAddress.anyIPv4, 9100);
      logger.log(
        level: 'INFO',
        category: 'HTTP_SERVER',
        message: 'Servidor local de impresión activo en puerto 9100',
      );

      _server!.listen((HttpRequest request) async {
        // CORS Headers
        request.response.headers.add('Access-Control-Allow-Origin', '*');
        request.response.headers.add('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        request.response.headers.add('Access-Control-Allow-Headers', 'Content-Type');

        if (request.method == 'OPTIONS') {
          request.response.statusCode = HttpStatus.ok;
          await request.response.close();
          return;
        }

        if (request.method == 'POST' && request.uri.path == '/print') {
          try {
            final body = await utf8.decoder.bind(request).join();
            logger.log(
              level: 'INFO',
              category: 'HTTP_SERVER',
              message: 'Petición HTTP /print recibida (${body.length} bytes)',
            );

            if (body.startsWith('{')) {
              final Map<String, dynamic> data = jsonDecode(body);
              if (data.containsKey('rawText')) {
                await printer.printRawString(data['rawText'].toString());
              } else {
                final receipt = Receipt.fromJson(data);
                await printer.printReceipt(receipt);
              }
            } else {
              await printer.printRawString(body);
            }

            request.response.statusCode = HttpStatus.ok;
            request.response.write(jsonEncode({'success': true, 'message': 'Impresión enviada correctamente'}));
          } catch (e) {
            logger.log(level: 'ERROR', category: 'HTTP_SERVER', message: 'Error procesando HTTP /print: $e');
            request.response.statusCode = HttpStatus.internalServerError;
            request.response.write(jsonEncode({'success': false, 'error': e.toString()}));
          } finally {
            await request.response.close();
          }
        } else {
          request.response.statusCode = HttpStatus.ok;
          request.response.write(jsonEncode({'status': 'online', 'server': 'Clic Soporte Print Server v1.0'}));
          await request.response.close();
        }
      });
    } catch (e) {
      logger.log(level: 'ERROR', category: 'HTTP_SERVER', message: 'No se pudo iniciar el servidor HTTP local: $e');
    }
  }

  void stop() {
    _server?.close(force: true);
  }
}
