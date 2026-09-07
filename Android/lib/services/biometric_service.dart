import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

class BiometricService {
  static final LocalAuthentication _auth = LocalAuthentication();
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static const String _kBioEnabled = 'bio_enabled';
  static const String _kBioUserData = 'bio_user_data';

  static Future<bool> isBiometricAvailable() async {
    try {
      final bool canCheck = await _auth.canCheckBiometrics;
      final bool isSupported = await _auth.isDeviceSupported();
      return canCheck || isSupported;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> authenticateDriver() async {
    try {
      return await _auth.authenticate(
        localizedReason: 'Desbloquea con tu Huella Dactilar, Patrón o PIN para acceder a Clic Driver',
        persistAcrossBackgrounding: true,
        biometricOnly: false,
      );
    } on Exception catch (_) {
      return false;
    }
  }

  static Future<void> saveBiometricUser({
    required int userId,
    required String userName,
    required String userEmail,
  }) async {
    final data = jsonEncode({
      'id': userId,
      'name': userName,
      'email': userEmail,
    });
    await _storage.write(key: _kBioEnabled, value: 'true');
    await _storage.write(key: _kBioUserData, value: data);
  }

  static Future<Map<String, dynamic>?> getSavedBiometricUser() async {
    final enabled = await _storage.read(key: _kBioEnabled);
    if (enabled != 'true') return null;

    final data = await _storage.read(key: _kBioUserData);
    if (data == null) return null;

    try {
      return jsonDecode(data) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<void> clearBiometricUser() async {
    await _storage.delete(key: _kBioEnabled);
    await _storage.delete(key: _kBioUserData);
  }
}
