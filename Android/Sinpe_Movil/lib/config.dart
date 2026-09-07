class AppConfig {
  static const String appName = 'SINPE Listener';
  static const String appVersion = '1.0.0';
  static const int appVersionCode = 1;
  static const int brandColor = 0xFF059669; // Emerald Green
  static const int brandDarkColor = 0xFF0F172A;

  // Servidor Web Central, Red LAN & Fallback compartidos con Clic Driver
  static const String defaultBaseUrl = 'http://192.168.1.14:9001'; 
  static const String defaultFallbackUrl = ''; 
  static const String defaultPublicIpApiPrimary = 'https://api.ipify.org';
  static const String defaultPublicIpApiFallback = 'https://icanhazip.com';
}
