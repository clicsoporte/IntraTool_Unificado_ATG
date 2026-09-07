import 'package:flutter/material.dart';

import 'config.dart';
import 'screens/print_bridge_screen.dart';
import 'screens/printer_settings_screen.dart';
import 'screens/webview_screen.dart';
import 'services/logger_service.dart';
import 'services/printer_service.dart';
import 'services/server_service.dart';
import 'services/settings_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await SettingsStore.create();
  final logger = LoggerService(store);
  final printer = PrinterService(store, logger);
  final server = ServerService(printer, logger);
  await server.start();
  runApp(ClicSoportePrintApp(store: store, printer: printer, logger: logger));
}

class ClicSoportePrintApp extends StatelessWidget {
  final SettingsStore store;
  final PrinterService printer;
  final LoggerService logger;
  final String? initialPrintText;

  const ClicSoportePrintApp({
    super.key,
    required this.store,
    required this.printer,
    required this.logger,
    this.initialPrintText,
  });

  @override
  Widget build(BuildContext context) {
    Widget initialHome;
    if (initialPrintText != null && initialPrintText!.isNotEmpty) {
      initialHome = PrintBridgeScreen(
        printContent: initialPrintText!,
        printer: printer,
        logger: logger,
      );
    } else if (store.useWebView) {
      initialHome = WebViewScreen(store: store, printer: printer, logger: logger);
    } else {
      initialHome = PrinterSettingsScreen(store: store, printer: printer, logger: logger);
    }

    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(AppConfig.brandColor),
          primary: const Color(AppConfig.brandColor),
          surface: const Color(0xFFFAFAFA),
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(AppConfig.brandColor),
          brightness: Brightness.dark,
          primary: const Color(AppConfig.brandColor),
          surface: const Color(AppConfig.brandDarkColor),
        ),
      ),
      home: initialHome,
    );
  }
}
