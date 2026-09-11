import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';
import 'services/api_service.dart';
import 'services/background_sync_service.dart';
import 'services/version_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final bool isLoggedIn = prefs.getBool('is_logged_in') ?? false;
  final String serverUrl = prefs.getString('server_url') ?? AppConfig.defaultBaseUrl;

  // Restaurar token JWT en memoria de ApiService para autenticación inmediata
  final String? savedToken = prefs.getString('auth_token');
  if (savedToken != null && savedToken.isNotEmpty) {
    ApiService.setAuthToken(savedToken);
  }

  // Motor OTA Aislado: Ejecución temprana en arranque
  VersionService.checkAndExecuteOtaUpdateEarly(serverUrl);

  // Sincronización automática en segundo plano (servicio en primer plano)
  if (isLoggedIn) {
    initializeBackgroundSync();
  }

  runApp(ClicDriverApp(isLoggedIn: isLoggedIn));
}

class ClicDriverApp extends StatelessWidget {
  final bool isLoggedIn;
  const ClicDriverApp({super.key, required this.isLoggedIn});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(AppConfig.brandColor),
          brightness: Brightness.dark,
          primary: const Color(AppConfig.brandColor),
          surface: const Color(AppConfig.brandDarkColor),
        ),
      ),
      home: isLoggedIn ? const DashboardScreen() : const LoginScreen(),
    );
  }
}
