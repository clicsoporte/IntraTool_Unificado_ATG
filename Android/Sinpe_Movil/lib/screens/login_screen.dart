import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../services/api_service.dart';
import '../services/app_logger.dart';
import '../services/background_sync_service.dart';
import '../services/offline_db_service.dart';
import 'dashboard_screen.dart';

import '../services/biometric_service.dart';
import '../services/device_security_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _userCtrl = TextEditingController();
  final TextEditingController _passCtrl = TextEditingController();
  String _serverUrl = AppConfig.defaultBaseUrl;
  bool _isLoading = false;
  bool _hasBiometricUser = false;
  Map<String, dynamic>? _biometricUserData;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadSavedServerUrl();
    _checkBiometricsOnStart();
    DeviceSecurityService.requestAllCorePermissions();
  }

  Future<void> _checkBiometricsOnStart() async {
    final available = await BiometricService.isBiometricAvailable();
    if (!available) return;

    final bioUser = await BiometricService.getSavedBiometricUser();
    if (bioUser != null && mounted) {
      setState(() {
        _hasBiometricUser = true;
        _biometricUserData = bioUser;
      });
      _doBiometricLogin();
    }
  }

  Future<void> _doBiometricLogin() async {
    final authenticated = await BiometricService.authenticateDriver();
    if (authenticated && _biometricUserData != null && mounted) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt('user_id', _biometricUserData!['id'] ?? 0);
      await prefs.setString('user_name', _biometricUserData!['name'] ?? '');
      await prefs.setString('user_email', _biometricUserData!['email'] ?? '');
      await prefs.setBool('is_logged_in', true);
      initializeBackgroundSync();

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    }
  }

  @override
  void dispose() {
    _userCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSavedServerUrl() async {
    final db = OfflineDbService();
    final urlCfg = await db.getServerUrlsConfig();
    if (urlCfg['active']?.isNotEmpty == true) {
      setState(() => _serverUrl = urlCfg['active']!);
    } else if (urlCfg['primary']?.isNotEmpty == true) {
      setState(() => _serverUrl = urlCfg['primary']!);
    } else {
      final prefs = await SharedPreferences.getInstance();
      final savedUrl = prefs.getString('server_url');
      if (savedUrl != null && savedUrl.isNotEmpty) {
        setState(() => _serverUrl = savedUrl);
      }
    }
  }

  Future<void> _requestAdminPinAndOpenConfig() async {
    final db = OfflineDbService();
    final cfg = await db.getSystemConfig();
    final targetPin = cfg['apk_admin_settings_pin']?.trim().isNotEmpty == true ? cfg['apk_admin_settings_pin']!.trim() : null;

    // Si la app no ha realizado su primera sincronización (sin PIN en DB local), ingresa directamente a configurar el servidor
    if (targetPin == null || targetPin.isEmpty) {
      AppLogger.log('🔓 Primera sincronización pendiente (Sin PIN en SQLite). Acceso concedido a configuración de servidor.', level: 'SUCCESS');
      _showServerConfigDialog();
      return;
    }

    final pinCtrl = TextEditingController();
    bool isError = false;
    String? errorMsg;

    if (!mounted) return;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDlgState) => AlertDialog(
          backgroundColor: const Color(0xFF1E1E1E),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.admin_panel_settings_rounded, color: Colors.amber, size: 26),
              SizedBox(width: 8),
              Text('ACCESO DE SUPERVISOR', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Ingresa el PIN de Administrador configurado en el servidor (o el PIN maestro de emergencia) para acceder a los ajustes técnicos:',
                style: TextStyle(color: Colors.white70, fontSize: 12),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: pinCtrl,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 8),
                decoration: InputDecoration(
                  counterText: '',
                  hintText: '••••',
                  hintStyle: const TextStyle(color: Colors.grey, letterSpacing: 4),
                  filled: true,
                  fillColor: const Color(0xFF2A2A2A),
                  errorText: isError ? (errorMsg ?? 'PIN incorrecto') : null,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar', style: TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(AppConfig.brandColor),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () {
                final inputPin = pinCtrl.text.trim();
                // Acepta el PIN configurado del servidor o el PIN maestro de emergencia '4343'
                if (inputPin == targetPin || inputPin == '4343') {
                  AppLogger.log('🔓 PIN de Administrador (servidor o maestro 4343) validado correctamente.', level: 'SUCCESS');
                  Navigator.pop(ctx);
                  _showServerConfigDialog();
                } else {
                  AppLogger.log('❌ PIN de Administrador incorrecto en Login', level: 'WARNING');
                  setDlgState(() {
                    isError = true;
                    errorMsg = 'PIN incorrecto';
                  });
                }
              },
              child: const Text('Ingresar', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showServerConfigDialog() async {
    final db = OfflineDbService();
    final urlCfg = await db.getServerUrlsConfig();
    final primaryCtrl = TextEditingController(text: urlCfg['primary']?.isNotEmpty == true ? urlCfg['primary'] : _serverUrl);
    final fallbackCtrl = TextEditingController(text: urlCfg['fallback'] ?? '');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1E1E),
        title: const Row(
          children: [
            Icon(Icons.dns_rounded, color: Color(AppConfig.brandColor)),
            SizedBox(width: 10),
            Text('Servidor Clic-Tools', style: TextStyle(color: Colors.white, fontSize: 18)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '1. URL Primaria del Servidor (LAN / WAN):',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: primaryCtrl,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'http://192.168.1.14:9001',
                hintStyle: const TextStyle(color: Colors.grey),
                filled: true,
                fillColor: const Color(0xFF2A2A2A),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              '2. URL de Respaldo / Fallback (Opcional):',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: fallbackCtrl,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'http://192.168.1.50:9001 (Respaldo)',
                hintStyle: const TextStyle(color: Colors.grey),
                filled: true,
                fillColor: const Color(0xFF2A2A2A),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(AppConfig.brandColor),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () async {
              final newPrimary = primaryCtrl.text.trim();
              final newFallback = fallbackCtrl.text.trim();
              if (newPrimary.isNotEmpty) {
                final prefs = await SharedPreferences.getInstance();
                await prefs.setString('server_url', newPrimary);
                await db.saveServerUrlsConfig(
                  primary: newPrimary,
                  fallback: newFallback,
                  active: newPrimary,
                );
                setState(() => _serverUrl = newPrimary);
                Navigator.pop(ctx);
              }
            },
            child: const Text('Guardar', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Future<void> _doLogin() async {
    final userText = _userCtrl.text.trim();
    final passText = _passCtrl.text;

    if (userText.isEmpty || passText.isEmpty) {
      setState(() => _errorMessage = 'Ingresa tu usuario/correo y contraseña');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final cleanUrl = ApiService.cleanUrl(_serverUrl);
      final url = Uri.parse('$cleanUrl/api/fleet/login');
      AppLogger.log('Intentando login en $url para usuario: $userText');

      final res = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'usernameOrEmail': userText,
          'password': passText,
        }),
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true && data['user'] != null) {
          AppLogger.log('Login exitoso para: ${data['user']['name']}', level: 'SUCCESS');
          final user = data['user'];
          final token = data['token'];
          final prefs = await SharedPreferences.getInstance();
          await prefs.setInt('user_id', user['id']);
          await prefs.setString('user_name', user['name'] ?? '');
          await prefs.setString('user_email', user['email'] ?? '');
          if (token != null && token is String && token.isNotEmpty) {
            await prefs.setString('auth_token', token);
            ApiService.setAuthToken(token);
          }
          await prefs.setBool('is_logged_in', true);
          initializeBackgroundSync();

          if (mounted) {
            final canBio = await BiometricService.isBiometricAvailable();
            final savedBio = await BiometricService.getSavedBiometricUser();

            if (canBio && savedBio == null) {
              await showDialog(
                context: context,
                barrierDismissible: false,
                builder: (ctx) => AlertDialog(
                  backgroundColor: const Color(0xFF1E1E1E),
                  title: const Row(
                    children: [
                      Icon(Icons.fingerprint_rounded, color: Color(AppConfig.brandColor), size: 28),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text('¿Activar Acceso Rápido?', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                  content: const Text(
                    'Permite ingresar a Clic Driver al instante usando la Huella, Patrón o PIN configurado en tu celular sin escribir la contraseña cada vez.',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Luego', style: TextStyle(color: Colors.grey)),
                    ),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(AppConfig.brandColor),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () async {
                        await BiometricService.saveBiometricUser(
                          userId: user['id'],
                          userName: user['name'] ?? '',
                          userEmail: user['email'] ?? '',
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                      },
                      icon: const Icon(Icons.check_rounded, color: Colors.white),
                      label: const Text('Activar Acceso', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              );
            }

            if (mounted) {
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (_) => const DashboardScreen()),
              );
            }
          }
          return;
        } else {
          final err = data['error'] ?? 'Usuario o contraseña incorrectos';
          AppLogger.log('Login fallido: $err', level: 'ERROR');
          setState(() => _errorMessage = err);
        }
      } else {
        final data = jsonDecode(res.body);
        final err = data['error'] ?? 'Error de autenticación (${res.statusCode})';
        AppLogger.log('Login fallido HTTP ${res.statusCode}: $err', level: 'ERROR');
        setState(() => _errorMessage = err);
      }
    } catch (e) {
      AppLogger.log('Excepción en login: $e', level: 'ERROR');
      setState(() => _errorMessage = 'No se pudo conectar al servidor $_serverUrl. Error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121212),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.bug_report_rounded, color: Color(AppConfig.brandColor)),
            tooltip: 'Ver Logs de Diagnóstico',
            onPressed: () => AppLogger.showLogsDialog(context),
          ),
          IconButton(
            icon: const Icon(Icons.settings_rounded, color: Colors.white70),
            tooltip: 'Configurar IP del Servidor',
            onPressed: _requestAdminPinAndOpenConfig,
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Brand Header
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(AppConfig.brandColor).withOpacity(0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.local_shipping_rounded,
                    size: 64,
                    color: Color(AppConfig.brandColor),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Clic Driver',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      'Sistema de Entregas & Logística',
                      style: TextStyle(color: Colors.grey, fontSize: 14),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(AppConfig.brandColor).withOpacity(0.2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(AppConfig.brandColor).withOpacity(0.4)),
                      ),
                      child: const Text(
                        'v${AppConfig.appVersion}',
                        style: TextStyle(color: Color(AppConfig.brandColor), fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 36),

                // Error Card
                if (_errorMessage != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.red.shade400),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline_rounded, color: Colors.redAccent, size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Form Card
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E1E1E),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Usuario o Correo:', style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _userCtrl,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: 'ej. chofer@clicsoporte.com',
                          hintStyle: const TextStyle(color: Colors.grey),
                          prefixIcon: const Icon(Icons.person_rounded, color: Color(AppConfig.brandColor)),
                          filled: true,
                          fillColor: const Color(0xFF2A2A2A),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                        ),
                      ),
                      const SizedBox(height: 16),

                      const Text('Contraseña:', style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _passCtrl,
                        obscureText: true,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: '••••••••',
                          hintStyle: const TextStyle(color: Colors.grey),
                          prefixIcon: const Icon(Icons.lock_rounded, color: Color(AppConfig.brandColor)),
                          filled: true,
                          fillColor: const Color(0xFF2A2A2A),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                        ),
                      ),
                      const SizedBox(height: 24),

                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(AppConfig.brandColor),
                          minimumSize: const Size(double.infinity, 50),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        onPressed: _isLoading ? null : _doLogin,
                        icon: _isLoading
                            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : const Icon(Icons.login_rounded, color: Colors.white),
                        label: Text(
                          _isLoading ? 'Autenticando...' : '🔐 Iniciar Sesión Clic Driver',
                          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ),

                      if (_hasBiometricUser) ...[
                        const SizedBox(height: 16),
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(double.infinity, 50),
                            side: const BorderSide(color: Color(AppConfig.brandColor)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onPressed: _doBiometricLogin,
                          icon: const Icon(Icons.fingerprint_rounded, color: Color(AppConfig.brandColor), size: 24),
                          label: Text(
                            '👆 Entrar como ${_biometricUserData?['name'] ?? 'Chofer'} (Huella / Patrón / PIN)',
                            style: const TextStyle(color: Color(AppConfig.brandColor), fontSize: 13, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                Text(
                  'v${AppConfig.appVersion} (Build ${AppConfig.appVersionCode})  •  Servidor: $_serverUrl',
                  style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
