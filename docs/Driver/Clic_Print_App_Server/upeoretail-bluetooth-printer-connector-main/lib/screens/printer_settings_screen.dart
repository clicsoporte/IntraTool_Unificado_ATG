import 'package:flutter/material.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import '../services/logger_service.dart';
import '../services/printer_service.dart';
import '../services/settings_store.dart';
import 'log_viewer_screen.dart';

/// Settings: web URL, paper size, paired-printer selection, connection status
/// and a test print.
class PrinterSettingsScreen extends StatefulWidget {
  final SettingsStore store;
  final PrinterService printer;
  final LoggerService logger;
  const PrinterSettingsScreen({
    super.key,
    required this.store,
    required this.printer,
    required this.logger,
  });

  @override
  State<PrinterSettingsScreen> createState() => _PrinterSettingsScreenState();
}

class _PrinterSettingsScreenState extends State<PrinterSettingsScreen> {
  late final TextEditingController _urlCtrl =
      TextEditingController(text: widget.store.webUrl);

  List<BluetoothInfo> _printers = [];
  bool _loading = false;
  bool _bluetoothOn = false;
  bool _connected = false;
  String? _error;

  SettingsStore get store => widget.store;
  PrinterService get printer => widget.printer;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _bluetoothOn = await printer.isBluetoothOn();
      _printers = await printer.pairedPrinters();
      // If a default printer is set but the socket isn't up, reconnect quietly
      // so the status reflects reality and the next print is instant.
      if (store.hasPrinter && _bluetoothOn) {
        try {
          await printer.ensureConnectedToDefault();
        } catch (_) {/* status row will show "Not connected" */}
      }
      _connected = await printer.isConnected();
    } on PrinterException catch (e) {
      _error = e.message;
      _printers = [];
    } catch (e) {
      _error = e.toString();
      _printers = [];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _selectPrinter(BluetoothInfo info) async {
    await store.setPrinter(info.name, info.macAdress);
    setState(() {});
    try {
      await printer.disconnect();
      await printer.connect(info.macAdress);
      _connected = await printer.isConnected();
      _toast('Connected to ${info.name}');
    } on PrinterException catch (e) {
      _toast(e.message, error: true);
    }
    if (mounted) setState(() {});
  }

  Future<void> _testPrint() async {
    try {
      await printer.testPrint();
      _toast('Test sent to printer');
    } on NoPrinterSelected {
      _toast('Select a printer first', error: true);
    } on BluetoothOff {
      _toast('Turn on Bluetooth first', error: true);
    } on PrinterException catch (e) {
      _toast(e.message, error: true);
    }
    if (mounted) {
      _connected = await printer.isConnected();
      setState(() {});
    }
  }

  void _toast(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Colors.red.shade700 : null,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Printer settings'),
        actions: [
          IconButton(onPressed: _loading ? null : _refresh, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ---- Web URL ----
            const _SectionTitle('Servidor Web Clic-Tools (URL o IP)'),
            TextField(
              controller: _urlCtrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: 'http://192.168.1.50:3000',
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: () async {
                  final nav = Navigator.of(context);
                  await store.setWebUrl(_urlCtrl.text);
                  // Returning to the web view reloads the saved URL automatically.
                  if (mounted) nav.pop();
                },
                child: const Text('Guardar y Abrir'),
              ),
            ),

            const SizedBox(height: 16),
            // ---- Paper size ----
            const _SectionTitle('Ancho de Papel Térmico'),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: '58', label: Text('58 mm')),
                ButtonSegment(value: '80', label: Text('80 mm')),
              ],
              selected: {store.paperCode},
              onSelectionChanged: (s) async {
                await store.setPaper(s.first);
                setState(() {});
              },
            ),

            const SizedBox(height: 16),
            // ---- Navigation Mode ----
            const _SectionTitle('Modo de Navegación'),
            SwitchListTile(
              secondary: const Icon(Icons.web_asset_rounded),
              title: const Text('Modo Navegador Interno (WebView)'),
              subtitle: const Text(
                'Desactivado por defecto. Permite abrir Clic-Tools dentro de la app en lugar de usar Google Chrome.',
                style: TextStyle(fontSize: 12),
              ),
              value: store.useWebView,
              onChanged: (val) async {
                await store.setUseWebView(val);
                setState(() {});
              },
            ),

            const SizedBox(height: 16),
            // ---- Status ----
            const _SectionTitle('Estado del Sistema'),
            _StatusRow(
              icon: _bluetoothOn ? Icons.bluetooth : Icons.bluetooth_disabled,
              label: 'Bluetooth',
              value: _bluetoothOn ? 'Encendido' : 'Apagado',
              ok: _bluetoothOn,
            ),
            _StatusRow(
              icon: Icons.print,
              label: 'Impresora Predeterminada',
              value: store.printerName ?? 'Sin seleccionar',
              ok: store.hasPrinter,
            ),
            _StatusRow(
              icon: Icons.link,
              label: 'Estado de Conexión',
              value: _connected ? 'Conectada (Imprimiendo)' : 'En reposo (Lista para imprimir)',
              ok: true,
            ),

            const SizedBox(height: 16),
            // ---- Paired printers ----
            const _SectionTitle('Impresoras Bluetooth Vinculadas'),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              Card(
                color: Colors.red.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(_error!, style: TextStyle(color: Colors.red.shade800)),
                ),
              )
            else if (_printers.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                      'No se encontraron impresoras vinculadas. Vincula tu impresora (ej. 3nStar PPT305BT) '
                      'en los Ajustes de Bluetooth de tu celular Android y desliza hacia abajo para refrescar.'),
                ),
              )
            else
              ..._printers.map((p) {
                final selected = p.macAdress == store.printerMac;
                return Card(
                  child: ListTile(
                    onTap: () => _selectPrinter(p),
                    leading: Icon(
                      selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                      color: selected ? Colors.green : Colors.grey,
                    ),
                    title: Text(p.name.isEmpty ? '(Sin Nombre)' : p.name),
                    subtitle: Text(p.macAdress),
                    trailing: selected ? const Icon(Icons.check_circle, color: Colors.green) : null,
                  ),
                );
              }),

            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _testPrint,
              icon: const Icon(Icons.receipt_long),
              label: const Text('Imprimir Ticket de Prueba 🖨️'),
            ),
            if (store.lastStatus != null) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.black12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('📋 ÚLTIMO LOG DE DIAGNÓSTICO:',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: Colors.black87)),
                    const SizedBox(height: 4),
                    Text(store.lastStatus!,
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFF6B00))),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => LogViewerScreen(logger: widget.logger),
                ));
              },
              icon: const Icon(Icons.assessment_outlined),
              label: const Text('Ver Historial de Logs en SQLite 📊'),
            ),
            const SizedBox(height: 24),
            const Divider(),
            const SizedBox(height: 12),
            const Center(
              child: Column(
                children: [
                  Text('Clic Soporte y Clic Tienda S.R.L', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  Text('Cédula Jurídica: 3102894538', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey)),
                  Text('clicsoporte.com | Tel: +50640000630', style: TextStyle(fontSize: 12, color: Colors.grey)),
                  Text('soporte@clicsoporte.com', style: TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text.toUpperCase(),
            style: const TextStyle(
                fontSize: 12, fontWeight: FontWeight.bold, color: Colors.black54, letterSpacing: 0.5)),
      );
}

class _StatusRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool ok;
  const _StatusRow({required this.icon, required this.label, required this.value, required this.ok});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Icon(icon, size: 20, color: ok ? Colors.green : Colors.grey),
            const SizedBox(width: 10),
            Text('$label: ', style: const TextStyle(fontWeight: FontWeight.w600)),
            Expanded(child: Text(value, overflow: TextOverflow.ellipsis)),
          ],
        ),
      );
}
