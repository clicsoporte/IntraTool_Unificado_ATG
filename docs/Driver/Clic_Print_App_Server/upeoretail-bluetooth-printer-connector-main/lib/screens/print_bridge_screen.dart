import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/logger_service.dart';
import '../services/printer_service.dart';

class PrintBridgeScreen extends StatefulWidget {
  final String printContent;
  final PrinterService printer;
  final LoggerService logger;

  const PrintBridgeScreen({
    super.key,
    required this.printContent,
    required this.printer,
    required this.logger,
  });

  @override
  State<PrintBridgeScreen> createState() => _PrintBridgeScreenState();
}

class _PrintBridgeScreenState extends State<PrintBridgeScreen> {
  String _statusMessage = 'Inicializando impresión...';
  String _subMessage = 'Preparando conexión Bluetooth...';
  bool _isSuccess = false;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _startPrintJob();
  }

  Future<void> _startPrintJob() async {
    widget.logger.log(
      level: 'INFO',
      category: 'BRIDGE',
      message: 'Iniciando trabajo de impresión puente (${widget.printContent.length} caracteres)...',
    );

    setState(() {
      _statusMessage = '🖨️ Imprimiendo Boleta de Entrega...';
      _subMessage = 'Conectando por Bluetooth a la impresora 3nStar...';
    });

    try {
      await widget.printer.printRawString(widget.printContent);
      if (mounted) {
        setState(() {
          _isSuccess = true;
          _statusMessage = '✓ ¡Impresión enviada con éxito!';
          _subMessage = 'Retornando a Google Chrome...';
        });
      }
      widget.logger.log(
        level: 'SUCCESS',
        category: 'BRIDGE',
        message: 'Impresión completada por puente. Retornando a navegador...',
      );

      await Future.delayed(const Duration(milliseconds: 1200));
      _returnToChrome();
    } catch (e) {
      if (mounted) {
        setState(() {
          _hasError = true;
          _statusMessage = '❌ Error de Impresión';
          _subMessage = e.toString();
        });
      }
      widget.logger.log(
        level: 'ERROR',
        category: 'BRIDGE',
        message: 'Error en impresión puente: $e',
      );
    }
  }

  void _returnToChrome() {
    SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121212),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 36.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Spacer(),
              // Header logo / title
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF6B00).withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.local_shipping_rounded,
                  size: 64,
                  color: Color(0xFFFF6B00),
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'Clic Soporte Logistics',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                ),
              ),
              const Text(
                'Impresión Rápida Bluetooth',
                style: TextStyle(
                  color: Colors.grey,
                  fontSize: 14,
                ),
              ),
              const Spacer(),

              // Animated Card State
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E1E1E),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: _isSuccess
                        ? Colors.green
                        : _hasError
                            ? Colors.red
                            : const Color(0xFFFF6B00),
                    width: 2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: (_isSuccess
                              ? Colors.green
                              : _hasError
                                  ? Colors.red
                                  : const Color(0xFFFF6B00))
                          .withOpacity(0.2),
                      blurRadius: 20,
                      spreadRadius: 2,
                    )
                  ],
                ),
                child: Column(
                  children: [
                    if (!_isSuccess && !_hasError)
                      const SizedBox(
                        height: 56,
                        width: 56,
                        child: CircularProgressIndicator(
                          color: Color(0xFFFF6B00),
                          strokeWidth: 4,
                        ),
                      )
                    else if (_isSuccess)
                      const Icon(
                        Icons.check_circle_rounded,
                        color: Colors.green,
                        size: 64,
                      )
                    else
                      const Icon(
                        Icons.error_outline_rounded,
                        color: Colors.red,
                        size: 64,
                      ),
                    const SizedBox(height: 20),
                    Text(
                      _statusMessage,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: _isSuccess
                            ? Colors.greenAccent
                            : _hasError
                                ? Colors.redAccent
                                : Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _subMessage,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),

              // Action buttons if error
              if (_hasError) ...[
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFF6B00),
                    minimumSize: const Size(double.infinity, 48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onPressed: () {
                    setState(() {
                      _hasError = false;
                    });
                    _startPrintJob();
                  },
                  icon: const Icon(Icons.refresh_rounded, color: Colors.white),
                  label: const Text('Reintentar Impresión', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(double.infinity, 48),
                    side: const BorderSide(color: Colors.grey),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onPressed: _returnToChrome,
                  child: const Text('Volver a Chrome', style: TextStyle(color: Colors.white)),
                ),
              ] else ...[
                const Text(
                  'Regresando al navegador automáticamente...',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
