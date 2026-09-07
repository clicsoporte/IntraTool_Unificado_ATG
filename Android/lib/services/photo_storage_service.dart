import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import 'app_logger.dart';

class PhotoStorageService {
  /// Directorio de evidencias persistente del APK (No volátil)
  static Future<Directory> get _evidenciasDir async {
    // Usar la ruta privada de la aplicación (mismo directorio raíz protegido de SQLite)
    // para evitar que Android OS limpie las fotos temporales si la memoria se llena en ruta offline.
    final baseDir = await getDatabasesPath();
    final parentDir = Directory(baseDir).parent;
    final evidenciasFolder = Directory(p.join(parentDir.path, 'files', 'clic_evidencias'));
    if (!await evidenciasFolder.exists()) {
      await evidenciasFolder.create(recursive: true);
    }
    return evidenciasFolder;
  }

  /// Guarda una foto capturada por la cámara en el almacenamiento local del dispositivo
  /// Retorna la ruta absoluta del archivo guardado (ej. /storage/.../evidencia_FAC-6061_1724098234.jpg)
  static Future<String?> savePhotoLocally(File photoFile, String prefix, String docNumero) async {
    try {
      final dir = await _evidenciasDir;
      final timeStamp = DateTime.now().millisecondsSinceEpoch;
      final cleanDoc = docNumero.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
      final fileName = '${prefix}_${cleanDoc}_$timeStamp.jpg';
      final targetPath = p.join(dir.path, fileName);

      final savedFile = await photoFile.copy(targetPath);
      AppLogger.log('📁 Foto guardada en disco local: ${savedFile.path} (${savedFile.lengthSync()} bytes)', level: 'SUCCESS');
      return savedFile.path;
    } catch (e) {
      AppLogger.log('⚠️ Error al guardar foto en disco local: $e', level: 'ERROR');
      return null;
    }
  }

  /// Lee un archivo guardado localmente o una lista JSON de rutas y los convierte a Base64.
  /// Se invoca únicamente durante la transmisión HTTP en SyncEngine / ApiService.
  static Future<dynamic> readPhotoAsBase64(String? pathOrBase64) async {
    if (pathOrBase64 == null || pathOrBase64.trim().isEmpty) {
      return null;
    }

    final trimmed = pathOrBase64.trim();

    // Si es un JSON array de múltiples rutas: '["path1", "path2"]'
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        final parsed = jsonDecode(trimmed);
        if (parsed is List) {
          final List<String> base64List = [];
          for (final item in parsed) {
            if (item is String && item.isNotEmpty) {
              final b64 = await readSinglePhotoAsBase64(item);
              if (b64 != null) base64List.add(b64);
            }
          }
          return base64List.isNotEmpty ? jsonEncode(base64List) : null;
        }
      } catch (_) {}
    }

    return await readSinglePhotoAsBase64(trimmed);
  }

  static Future<String?> readSinglePhotoAsBase64(String pathOrBase64) async {
    final trimmed = pathOrBase64.trim();
    if (trimmed.startsWith('data:image/') || trimmed.startsWith('http')) {
      return trimmed;
    }

    try {
      final file = File(trimmed);
      if (await file.exists()) {
        final bytes = await file.readAsBytes();
        return 'data:image/jpeg;base64,${base64Encode(bytes)}';
      } else {
        AppLogger.log('⚠️ Archivo local de foto no existe en ruta: $trimmed', level: 'WARNING');
        return null;
      }
    } catch (e) {
      AppLogger.log('⚠️ Error al leer foto local a Base64: $e', level: 'ERROR');
      return null;
    }
  }

  /// Elimina en forma segura los archivos locales una vez que el servidor backend confirmó la entrega
  static Future<void> deleteLocalPhoto(String? pathOrBase64) async {
    if (pathOrBase64 == null || pathOrBase64.trim().isEmpty) return;
    final trimmed = pathOrBase64.trim();

    // Si es un JSON array
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        final parsed = jsonDecode(trimmed);
        if (parsed is List) {
          for (final item in parsed) {
            if (item is String) await deleteSingleLocalPhoto(item);
          }
          return;
        }
      } catch (_) {}
    }

    await deleteSingleLocalPhoto(trimmed);
  }

  static Future<void> deleteSingleLocalPhoto(String pathOrBase64) async {
    final trimmed = pathOrBase64.trim();
    if (trimmed.startsWith('data:image/') || trimmed.startsWith('http')) return;

    try {
      final file = File(trimmed);
      if (await file.exists()) {
        await file.delete();
        AppLogger.log('🗑️ Foto local eliminada tras sincronización exitosa: $trimmed', level: 'INFO');
      }
    } catch (e) {
      AppLogger.log('⚠️ No se pudo eliminar foto local $trimmed: $e', level: 'WARNING');
    }
  }
}
