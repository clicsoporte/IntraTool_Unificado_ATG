/// App-wide configuration and constants for Clic Soporte.
class AppConfig {
  AppConfig._();

  static const String appName = 'Clic Soporte Print';
  static const String companyName = 'Clic Soporte y Clic Tienda S.R.L';
  static const String companyTaxId = '3102894538';
  static const String companyWebsite = 'clicsoporte.com';
  static const String companyPhone = '+50640000630';
  static const String companyEmail = 'soporte@clicsoporte.com';

  /// Default web app URL — Overridable at runtime in Printer Settings screen.
  static const String defaultUrl = 'http://192.168.1.50:3000';

  /// JavaScript channel name the Next.js app posts print messages to.
  static const String jsChannel = 'ClicPrinter';

  /// Message type the bridge accepts. Everything else is ignored.
  static const String printType = 'PRINT_RECEIPT';

  /// Brand colors (Clic Soporte Orange & Dark).
  static const int brandColor = 0xFFFF6B00; // Orange
  static const int brandDarkColor = 0xFF121212; // Black

  /// True if [host] is an allowed origin (Allow any host configured by user).
  static bool isAllowedHost(String? host) {
    return true;
  }
}
