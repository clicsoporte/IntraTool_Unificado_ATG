import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:signature/signature.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';
import '../models/delivery_doc.dart';
import '../services/api_service.dart';
import '../services/app_logger.dart';
import '../services/native_printer_service.dart';
import '../services/offline_db_service.dart';
import '../services/device_security_service.dart';
import '../services/photo_storage_service.dart';
import '../services/direct_sms_service.dart';

class DeliveryProcessScreen extends StatefulWidget {
  final DeliveryDoc doc;
  final String baseUrl;

  const DeliveryProcessScreen({
    super.key,
    required this.doc,
    required this.baseUrl,
  });

  @override
  State<DeliveryProcessScreen> createState() => _DeliveryProcessScreenState();
}

class _DeliveryProcessScreenState extends State<DeliveryProcessScreen> {
  late SignatureController _sigController;
  final TextEditingController _recibeCtrl = TextEditingController();
  final TextEditingController _notesCtrl = TextEditingController();
  final ImagePicker _picker = ImagePicker();

  String _estado = 'completo';
  bool _estadoSelected = false;
  List<File> _evidencePhotos = [];
  List<File> _facturaPhotos = [];
  String? _signatureBase64;
  bool _isSaving = false;
  String _savingPhase = '';
  Map<String, String> _sysConfig = {};

  bool get isReadOnly => widget.doc.estado != 'pendiente' && widget.doc.estado != 'en_ruta';

  @override
  void initState() {
    super.initState();
    _loadConfig();
    _estadoSelected = isReadOnly;
    _estado = widget.doc.estado == 'pendiente' || widget.doc.estado == 'en_ruta' ? 'completo' : widget.doc.estado;
    _recibeCtrl.text = widget.doc.nombreRecibe ?? '';
    _notesCtrl.text = widget.doc.comentario;

    // Solo asignar por defecto 100% si es una entrega nueva en proceso
    if (!isReadOnly) {
      for (var line in widget.doc.lines) {
        if (line.entregada == 0 && (line.faltante == 0 || line.faltante == line.pedida)) {
          line.entregada = line.pedida;
          line.faltante = 0;
        }
      }
    }

    // Si existen fotos locales en disco, cargarlas (soporta string individual o JSON array)
    if (widget.doc.fotoEvidencia != null && widget.doc.fotoEvidencia!.trim().isNotEmpty) {
      final raw = widget.doc.fotoEvidencia!.trim();
      if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
          final parsed = jsonDecode(raw);
          if (parsed is List) {
            for (final p in parsed) {
              final f = File(p.toString());
              if (f.existsSync()) _evidencePhotos.add(f);
            }
          }
        } catch (_) {}
      } else {
        final f = File(raw);
        if (f.existsSync()) _evidencePhotos.add(f);
      }
    }

    if (widget.doc.fotoFactura != null && widget.doc.fotoFactura!.trim().isNotEmpty) {
      final raw = widget.doc.fotoFactura!.trim();
      if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
          final parsed = jsonDecode(raw);
          if (parsed is List) {
            for (final p in parsed) {
              final f = File(p.toString());
              if (f.existsSync()) _facturaPhotos.add(f);
            }
          }
        } catch (_) {}
      } else {
        final f = File(raw);
        if (f.existsSync()) _facturaPhotos.add(f);
      }
    }

    _sigController = SignatureController(
      penStrokeWidth: 3,
      penColor: Colors.black,
      exportBackgroundColor: Colors.white,
    );
  }

  @override
  void dispose() {
    _sigController.dispose();
    _recibeCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadConfig() async {
    final db = OfflineDbService();
    final config = await db.getSystemConfig();
    if (mounted) {
      setState(() {
        _sysConfig = config;
      });
    }
  }

  Future<void> _takeEvidencePhoto() async {
    final photo = await _picker.pickImage(source: ImageSource.camera, imageQuality: 85);
    if (photo != null) {
      setState(() => _evidencePhotos.add(File(photo.path)));
    }
  }

  Future<void> _takeFacturaPhoto() async {
    final photo = await _picker.pickImage(source: ImageSource.camera, imageQuality: 85);
    if (photo != null) {
      setState(() => _facturaPhotos.add(File(photo.path)));
    }
  }

  void _removeEvidencePhoto(int index) {
    if (index >= 0 && index < _evidencePhotos.length) {
      setState(() => _evidencePhotos.removeAt(index));
    }
  }

  void _removeFacturaPhoto(int index) {
    if (index >= 0 && index < _facturaPhotos.length) {
      setState(() => _facturaPhotos.removeAt(index));
    }
  }

  Future<void> _saveAndPrint() async {
    if (_isSaving) return;

    // 1. Paso Obligatorio 1: Confirmar Selección del Estado de la Entrega
    if (!_estadoSelected) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('⚠️ Debe seleccionar el Estado de la Entrega (Completo, Parcial o Rechazado) antes de continuar.'),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 4),
        ),
      );
      return;
    }

    // 2. Paso Obligatorio 2: Coherencia en Entrega Parcial / Incidencias
    if (_estado == 'incompleto') {
      final hasFaltante = widget.doc.lines.any((l) => l.faltante > 0);
      if (!hasFaltante) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('⚠️ Marcó la entrega como "Parcial / Incidencias". Debe especificar la cantidad faltante en los artículos o agregar un ítem faltante.'),
            backgroundColor: Colors.red,
            duration: Duration(seconds: 4),
          ),
        );
        return;
      }
    }

    // Motivo Obligatorio en Rechazo / Parcial (según configuración web)
    final requireIncidentNotes = _sysConfig['apk_require_incident_notes'] == 'true' || _sysConfig['apk_require_incident_notes'] == 'mandatory';
    if (requireIncidentNotes) {
      if (_estado == 'incompleto' && _notesCtrl.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('⚠️ Debe especificar en las Notas / Observaciones el motivo de la entrega parcial o faltante.'),
            backgroundColor: Colors.red,
            duration: Duration(seconds: 4),
          ),
        );
        return;
      }
      if (_estado == 'rechazado' && _notesCtrl.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('⚠️ Debe ingresar en las Notas / Observaciones el motivo detallado del rechazo.'),
            backgroundColor: Colors.red,
            duration: Duration(seconds: 4),
          ),
        );
        return;
      }
    }

    // Validación de invariante: Pedida == Entregada + Faltante en cada renglón
    for (final line in widget.doc.lines) {
      if (line.pedida != (line.entregada + line.faltante)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('⚠️ Inconsistencia en artículo ${line.codigo}: Pedida (${line.pedida}) ≠ Entregada (${line.entregada}) + Faltante (${line.faltante}).'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
        return;
      }
    }

    // 3. Paso Obligatorio 3: Nombre de la Persona que Recibe o Rechaza
    if (_recibeCtrl.text.trim().isEmpty) {
      final isRechazado = _estado == 'rechazado';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isRechazado
              ? '⚠️ Por favor ingrese el Nombre de la persona que rechaza la mercancía.'
              : '⚠️ Por favor ingrese el Nombre de la persona que recibe la entrega.'),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 4),
        ),
      );
      return;
    }

    // 4. Paso Obligatorio 4: Firma Digital (Si aplica según servidor)
    if (_sysConfig['apk_require_signature'] == 'true' && _sigController.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('La firma digital del cliente es obligatoria.'), backgroundColor: Colors.red),
      );
      return;
    }
    
    // 5. Paso Obligatorio 5: Foto Evidencia y Foto Factura (Si aplica según servidor)
    if (_sysConfig['apk_require_evidence_photo'] == 'mandatory' && _evidencePhotos.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('La foto de evidencia de la entrega es obligatoria.'), backgroundColor: Colors.red),
      );
      return;
    }
    
    if (_sysConfig['apk_require_invoice_photo'] == 'mandatory' && _facturaPhotos.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('La foto de la factura sellada es obligatoria.'), backgroundColor: Colors.red),
      );
      return;
    }

    // 6. Paso Obligatorio 6: Guardián de GPS
    if (_sysConfig['apk_block_if_gps_off'] != 'false') {
      final gpsOk = await DeviceSecurityService.isGpsEnabled();
      if (!gpsOk && mounted) {
        await DeviceSecurityService.showGpsDisabledDialog(context);
        return;
      }
    }

    // 7. Paso Obligatorio 7: Guardián de Bluetooth (Si la impresión está activa)
    if (_sysConfig['driver_boleta_print_enabled'] != 'false' && _sysConfig['apk_block_if_bluetooth_off'] == 'true') {
      final btOk = await DeviceSecurityService.isBluetoothEnabled();
      if (!btOk && mounted) {
        await DeviceSecurityService.showBluetoothDisabledDialog(context);
        return;
      }
    }

    setState(() {
      _isSaving = true;
      _savingPhase = '📡 Obteniendo telemetría...';
    });

    try {
      // Capture Telemetry location of customer delivery (Navixy del camión actuará como principal/fallback en servidor)
      try {
        final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high).timeout(const Duration(seconds: 4));
        widget.doc.latitud = pos.latitude;
        widget.doc.longitud = pos.longitude;
        AppLogger.log('📍 Telemetría Celular Capturada (${widget.doc.clienteNombre}): Lat ${pos.latitude}, Lng ${pos.longitude}', level: 'SUCCESS', category: 'entrega');
      } catch (e) {
        widget.doc.latitud = null;
        widget.doc.longitud = null;
        AppLogger.log('📡 Telemetría celular no disponible al entregar (se usará GPS Navixy de cabina en servidor): $e', level: 'INFO', category: 'entrega');
      }

      if (mounted) setState(() => _savingPhase = '📸 Guardando firma y fotos...');

      // Capture signature if drawn (Exportación con tamaño fijo uniforme: 400x180 px)
      if (_sigController.isNotEmpty) {
        final sigBytes = await _sigController.toPngBytes(width: 400, height: 180);
        if (sigBytes != null) {
          _signatureBase64 = 'data:image/png;base64,${base64Encode(sigBytes)}';
        }
      }

      widget.doc.estado = _estado;
      widget.doc.nombreRecibe = _recibeCtrl.text;
      widget.doc.comentario = _notesCtrl.text.trim();
      widget.doc.firmaCliente = _signatureBase64;

      // Guardar lista de fotos de evidencia
      if (_evidencePhotos.isNotEmpty) {
        final List<String> savedPaths = [];
        for (final photo in _evidencePhotos) {
          final localPath = await PhotoStorageService.savePhotoLocally(photo, 'evidencia', widget.doc.documentoNumero);
          if (localPath != null) savedPaths.add(localPath);
        }
        widget.doc.fotoEvidencia = savedPaths.length > 1 ? jsonEncode(savedPaths) : (savedPaths.isNotEmpty ? savedPaths.first : null);
      } else {
        widget.doc.fotoEvidencia = null;
      }

      // Guardar lista de fotos de facturas (múltiples hojas)
      if (_facturaPhotos.isNotEmpty) {
        final List<String> savedPaths = [];
        for (final photo in _facturaPhotos) {
          final localPath = await PhotoStorageService.savePhotoLocally(photo, 'factura', widget.doc.documentoNumero);
          if (localPath != null) savedPaths.add(localPath);
        }
        widget.doc.fotoFactura = savedPaths.length > 1 ? jsonEncode(savedPaths) : (savedPaths.isNotEmpty ? savedPaths.first : null);
      } else {
        widget.doc.fotoFactura = null;
      }

      // 1. Assign Timestamp and Consecutive Boleta
      if (mounted) setState(() => _savingPhase = '💾 Guardando boleta en SQLite...');
      if (widget.doc.fechaEntrega.trim().isEmpty) {
        widget.doc.fechaEntrega = DateTime.now().toString().substring(0, 19).replaceAll('T', ' ');
      }

      final db = OfflineDbService();
      if (widget.doc.boletaNumero == widget.doc.documentoNumero || !widget.doc.boletaNumero.contains('-')) {
        widget.doc.boletaNumero = await db.getNextBoletaConsecutive();
      }

      widget.doc.isSynced = false;
      await db.updateDeliveryState(widget.doc);

      // Auditoría Operativa para Supervisión
      final hasSig = widget.doc.firmaCliente != null && widget.doc.firmaCliente!.isNotEmpty;
      final hasEvid = widget.doc.fotoEvidencia != null && widget.doc.fotoEvidencia!.isNotEmpty;
      final hasFact = widget.doc.fotoFactura != null && widget.doc.fotoFactura!.isNotEmpty;
      final evidStr = 'Firma: ${hasSig ? "✓" : "✗"}, Foto Evidencia: ${hasEvid ? "✓" : "✗"}, Foto Factura: ${hasFact ? "✓" : "✗"}';
      final statusLabel = _estado == 'completo' ? 'COMPLETA' : (_estado == 'incompleto' ? 'PARCIAL/CON FALTANTES' : 'RECHAZADA');
      final auditLevel = _estado == 'rechazado' || (!hasSig && !hasEvid && !hasFact) ? 'WARNING' : 'SUCCESS';

      AppLogger.log(
        '📦 Entrega # ${widget.doc.documentoNumero} (${widget.doc.clienteNombre}) PROCESADA como [$statusLabel]. '
        'Recibe: "${widget.doc.nombreRecibe ?? 'N/D'}". Evidencias: [$evidStr]. Boleta: ${widget.doc.boletaNumero}.',
        level: auditLevel,
        category: 'entrega',
      );

      // Disparo de Notificaciones por SMS directo desde la SIM del chofer (Omnicanal Offline/Online)
      try {
        final prefs = await SharedPreferences.getInstance();
        final driverName = prefs.getString('user_name') ?? widget.doc.choferNombre;
        final docMap = widget.doc.toJson();
        DirectSmsService.notifyDeliveryStatusDirectSms(
          doc: docMap,
          newStatus: _estado,
          choferNombre: driverName,
          comentario: widget.doc.comentario,
          nombreRecibe: widget.doc.nombreRecibe,
        );
      } catch (e) {
        AppLogger.log('⚠️ Error enviando SMS nativo de entrega: $e', level: 'WARNING');
      }

      // 2. Impresión Térmica Nativa Bluetooth (80mm / 58mm ESC/POS)
      if (mounted) setState(() => _savingPhase = '🖨️ Imprimiendo tiquete...');
      try {
        final prefs = await SharedPreferences.getInstance();
        final targetMac = prefs.getString('printer_mac');
        final paperSize = prefs.getString('paper_size') ?? '80mm';

        final compName = prefs.getString('company_name') ?? 'EMPRESA CLIENTE S.A.';
        final compTaxId = prefs.getString('company_tax_id') ?? '3-101-000000';
        final compAddr = prefs.getString('company_address') ?? 'Costa Rica';
        final compPhone = prefs.getString('company_phone') ?? '+506 2000-0000';
        final compEmail = prefs.getString('company_email') ?? 'contacto@empresa.com';

        await NativePrinterService.printBoleta(
          doc: widget.doc,
          lines: widget.doc.lines,
          sysConfig: _sysConfig,
          companyName: compName,
          taxId: compTaxId,
          address: compAddr,
          phone: compPhone,
          email: compEmail,
          targetMacAddress: targetMac,
          paperSize: paperSize,
        ).timeout(const Duration(seconds: 4));
      } catch (_) {}

      // 3. Sincronización en línea vía REST API
      if (mounted) setState(() => _savingPhase = '☁️ Sincronizando con servidor...');
      try {
        final api = ApiService(widget.baseUrl);
        bool synced = await api.syncDelivery(widget.doc, widget.doc.lines);
        if (synced) {
          widget.doc.isSynced = true;
          await db.updateDeliveryState(widget.doc);
        }
      } catch (_) {}

      if (mounted) {
        setState(() => _savingPhase = '✓ ¡Entrega Finalizada!');
        await Future.delayed(const Duration(milliseconds: 700));
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✓ Entrega guardada exitosamente'), backgroundColor: Colors.green),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error guardando entrega: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
          _savingPhase = '';
        });
      }
    }
  }

  void _showAddLineDialog() {
    final codeCtrl = TextEditingController(text: 'FALTANTE-${widget.doc.lines.length + 1}');
    final descCtrl = TextEditingController();
    final pedidaCtrl = TextEditingController(text: '1');
    final entregadaCtrl = TextEditingController(text: '0');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1E1E),
        title: const Row(
          children: [
            Icon(Icons.add_shopping_cart_rounded, color: Colors.amber),
            SizedBox(width: 10),
            Text('➕ Agregar Faltante / Incidencia', style: TextStyle(color: Colors.white, fontSize: 16)),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: codeCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Código del Producto',
                  labelStyle: const TextStyle(color: Colors.grey),
                  filled: true,
                  fillColor: const Color(0xFF2A2A2A),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: descCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Descripción del Producto',
                  labelStyle: const TextStyle(color: Colors.grey),
                  filled: true,
                  fillColor: const Color(0xFF2A2A2A),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: pedidaCtrl,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Cantidad Pedida',
                        labelStyle: const TextStyle(color: Colors.grey),
                        filled: true,
                        fillColor: const Color(0xFF2A2A2A),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: entregadaCtrl,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Cantidad Entregada',
                        labelStyle: const TextStyle(color: Colors.grey),
                        filled: true,
                        fillColor: const Color(0xFF2A2A2A),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar', style: TextStyle(color: Colors.grey))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(AppConfig.brandColor)),
            onPressed: () {
              final ped = int.tryParse(pedidaCtrl.text) ?? 1;
              final ent = int.tryParse(entregadaCtrl.text) ?? 0;
              final desc = descCtrl.text.trim().isNotEmpty ? descCtrl.text.trim() : 'Producto Faltante';

              setState(() {
                widget.doc.lines.add(
                  DeliveryLine(
                    codigo: codeCtrl.text.trim(),
                    desc: desc,
                    pedida: ped,
                    entregada: ent.clamp(0, ped),
                    faltante: math.max(0, ped - ent),
                  ),
                );
                if (widget.doc.lines.any((l) => l.faltante > 0)) {
                  _estado = 'incompleto';
                }
              });
              Navigator.pop(ctx);
            },
            child: const Text('Agregar', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _showItemsSearchModal() async {
    final searchCtrl = TextEditingController();
    String filterQuery = '';

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: const Color(0xFF181818),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          final filtered = widget.doc.lines.where((l) {
            if (filterQuery.isEmpty) return true;
            final q = filterQuery.toLowerCase();
            return l.codigo.toLowerCase().contains(q) || l.desc.toLowerCase().contains(q);
          }).toList();

          final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;

          return SafeArea(
            bottom: true,
            child: AnimatedPadding(
              padding: EdgeInsets.only(bottom: keyboardHeight),
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeOut,
              child: Container(
                height: MediaQuery.of(context).size.height * 0.85,
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const Icon(Icons.list_alt_rounded, color: Colors.amber, size: 22),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Detalle de Artículos (${widget.doc.lines.length} productos)',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: Colors.white70),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // Buscador en Tiempo Real
                    TextField(
                      controller: searchCtrl,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: '🔍 Buscar por código o descripción...',
                        hintStyle: const TextStyle(color: Colors.grey),
                        prefixIcon: const Icon(Icons.search_rounded, color: Colors.amber),
                        suffixIcon: filterQuery.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear_rounded, color: Colors.grey, size: 18),
                                onPressed: () {
                                  searchCtrl.clear();
                                  setModalState(() => filterQuery = '');
                                },
                              )
                            : null,
                        filled: true,
                        fillColor: const Color(0xFF2A2A2A),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                      ),
                      onChanged: (val) => setModalState(() => filterQuery = val.trim()),
                    ),
                    const SizedBox(height: 12),

                    Expanded(
                      child: filtered.isEmpty
                          ? Center(
                              child: Text(
                                filterQuery.isNotEmpty ? 'No se encontraron productos con "$filterQuery"' : 'Sin artículos registrados',
                                style: const TextStyle(color: Colors.grey, fontSize: 13),
                              ),
                            )
                          : ListView.separated(
                              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                              padding: const EdgeInsets.only(bottom: 24),
                              itemCount: filtered.length,
                              separatorBuilder: (c, i) => const Divider(color: Colors.white12),
                              itemBuilder: (c, i) {
                                final line = filtered[i];
                                final entQty = _estado == 'completo' ? line.pedida : _estado == 'rechazado' ? 0 : line.entregada;
                                final missQty = _estado == 'completo' ? 0 : _estado == 'rechazado' ? line.pedida : line.faltante;
                                final isMissing = missQty > 0;

                                return Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text(
                                          line.codigo,
                                          style: const TextStyle(color: Color(AppConfig.brandColor), fontWeight: FontWeight.bold, fontSize: 14),
                                        ),
                                        const Spacer(),
                                        Text(
                                          'Pedida: ${line.pedida}',
                                          style: const TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.w600),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      line.desc,
                                      style: const TextStyle(color: Colors.white70, fontSize: 12),
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        const Text('Entregada: ', style: TextStyle(color: Colors.white70, fontSize: 12)),
                                        if (!isReadOnly && _estado == 'incompleto') ...[
                                          SizedBox(
                                            width: 65,
                                            child: TextFormField(
                                              key: ValueKey('line_qty_${line.codigo}'),
                                              initialValue: line.entregada.toString(),
                                              keyboardType: TextInputType.number,
                                              scrollPadding: const EdgeInsets.only(bottom: 120),
                                              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                                              textAlign: TextAlign.center,
                                              decoration: InputDecoration(
                                                contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                                                filled: true,
                                                fillColor: const Color(0xFF2A2A2A),
                                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                                              ),
                                              onChanged: (val) {
                                                final ent = int.tryParse(val) ?? 0;
                                                line.entregada = ent.clamp(0, line.pedida);
                                                line.faltante = math.max(0, line.pedida - line.entregada);
                                                _estadoSelected = true;
                                              },
                                            ),
                                          ),
                                          const SizedBox(width: 4),
                                          InkWell(
                                            onTap: () {
                                              setState(() {
                                                if (line.entregada == 0) {
                                                  line.entregada = line.pedida;
                                                  line.faltante = 0;
                                                } else {
                                                  line.entregada = 0;
                                                  line.faltante = line.pedida;
                                                }
                                              });
                                              setModalState(() {});
                                            },
                                            borderRadius: BorderRadius.circular(6),
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                                              decoration: BoxDecoration(
                                                color: line.entregada == 0 ? Colors.green.withOpacity(0.2) : Colors.red.withOpacity(0.2),
                                                borderRadius: BorderRadius.circular(6),
                                                border: Border.all(color: line.entregada == 0 ? Colors.green : Colors.red),
                                              ),
                                              child: Text(
                                                line.entregada == 0 ? '✓ 100%' : '🚫 0',
                                                style: TextStyle(
                                                  color: line.entregada == 0 ? Colors.greenAccent : Colors.redAccent,
                                                  fontSize: 10,
                                                  fontWeight: FontWeight.bold,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ] else ...[
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                            decoration: BoxDecoration(
                                              color: const Color(0xFF2A2A2A),
                                              borderRadius: BorderRadius.circular(6),
                                              border: Border.all(color: Colors.white24),
                                            ),
                                            child: Text(
                                              '$entQty',
                                              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                                            ),
                                          ),
                                        ],
                                        const Spacer(),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: _estado == 'rechazado'
                                                ? Colors.red.withOpacity(0.2)
                                                : _estado == 'completo'
                                                    ? Colors.green.withOpacity(0.2)
                                                    : (isMissing ? Colors.red.withOpacity(0.2) : Colors.green.withOpacity(0.2)),
                                            borderRadius: BorderRadius.circular(6),
                                            border: Border.all(
                                              color: _estado == 'rechazado'
                                                  ? Colors.red
                                                  : _estado == 'completo'
                                                      ? Colors.green
                                                      : (isMissing ? Colors.red : Colors.green),
                                            ),
                                          ),
                                          child: Text(
                                            _estado == 'rechazado'
                                                ? 'RECHAZADO'
                                                : _estado == 'completo'
                                                    ? 'ENTREGADO'
                                                    : 'Faltante: $missQty',
                                            style: TextStyle(
                                              color: _estado == 'rechazado'
                                                  ? Colors.redAccent
                                                  : _estado == 'completo'
                                                      ? Colors.green
                                                      : (isMissing ? Colors.redAccent : Colors.green),
                                              fontSize: 12,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                );
                              },
                            ),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(AppConfig.brandColor),
                        minimumSize: const Size(double.infinity, 46),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () => Navigator.pop(ctx),
                      child: Text(
                        isReadOnly ? 'Cerrar Detalle de Artículos' : '✓ Guardar / Regresar a la Entrega',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ),
                    SizedBox(height: MediaQuery.of(ctx).padding.bottom > 0 ? MediaQuery.of(ctx).padding.bottom : 8),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
    setState(() {});
  }

  void _showNotesModal() {
    final noteTextCtrl = TextEditingController(text: _notesCtrl.text);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (modalCtx, setModalState) {
          final isRechazado = _estado == 'rechazado';
          final isIncompleto = _estado == 'incompleto';
          final titleColor = isRechazado ? Colors.redAccent : (isIncompleto ? Colors.amberAccent : const Color(AppConfig.brandColor));

          return Container(
            padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
            decoration: const BoxDecoration(
              color: Color(0xFF1E1E1E),
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Icon(Icons.edit_note_rounded, color: titleColor, size: 24),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              isRechazado ? 'Motivo del Rechazo' : (isIncompleto ? 'Motivo / Incidencias' : 'Notas y Observaciones'),
                              style: TextStyle(color: titleColor, fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            Text(
                              'Entrega #${widget.doc.boletaNumero} • ${_estado.toUpperCase()}',
                              style: const TextStyle(color: Colors.grey, fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                      if (!isReadOnly && noteTextCtrl.text.trim().isNotEmpty)
                        TextButton.icon(
                          onPressed: () {
                            noteTextCtrl.clear();
                            setModalState(() {});
                          },
                          icon: const Icon(Icons.clear, color: Colors.grey, size: 14),
                          label: const Text('Limpiar', style: TextStyle(color: Colors.grey, fontSize: 11)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: noteTextCtrl,
                    readOnly: isReadOnly,
                    maxLines: 4,
                    minLines: 3,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(
                      hintText: isRechazado
                          ? 'Escriba el motivo por el cual se rechazó el pedido (ej. Cliente sin fondos, producto no solicitado, local cerrado)...'
                          : (isIncompleto
                              ? 'Escriba la causa de la entrega incompleta (ej. Faltó 1 bulto en camión, producto averiado)...'
                              : 'Escriba notas adicionales o instrucciones del cliente...'),
                      hintStyle: const TextStyle(color: Colors.white30, fontSize: 13),
                      filled: true,
                      fillColor: const Color(0xFF2A2A2A),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Colors.white24),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Colors.white24),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: titleColor, width: 1.5),
                      ),
                    ),
                    onChanged: (_) => setModalState(() {}),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white70,
                            side: const BorderSide(color: Colors.white24),
                            minimumSize: const Size(double.infinity, 44),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          onPressed: () => Navigator.pop(ctx),
                          child: const Text('Cancelar', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                        ),
                      ),
                      if (!isReadOnly) ...[
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(AppConfig.brandColor),
                              minimumSize: const Size(double.infinity, 44),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                            onPressed: () {
                              setState(() {
                                _notesCtrl.text = noteTextCtrl.text.trim();
                                (widget.doc as dynamic).comentario = _notesCtrl.text;
                              });
                              Navigator.pop(ctx);
                            },
                            icon: const Icon(Icons.check_rounded, color: Colors.white, size: 18),
                            label: const Text('✓ Guardar Nota', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                          ),
                        ),
                      ],
                    ],
                  ),
                  SizedBox(height: MediaQuery.of(ctx).padding.bottom > 0 ? MediaQuery.of(ctx).padding.bottom : 8),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  bool _isFormDirty() {
    if (isReadOnly) return false;
    return _recibeCtrl.text.trim().isNotEmpty ||
        _notesCtrl.text.trim().isNotEmpty ||
        _evidencePhotos.isNotEmpty ||
        _facturaPhotos.isNotEmpty ||
        !_sigController.isEmpty ||
        _estadoSelected ||
        widget.doc.lines.any((l) => l.entregada != l.pedida || l.faltante > 0);
  }

  String? _getMissingFieldsReason() {
    if (!_estadoSelected) return 'Debe seleccionar el estado de la entrega.';
    if (_estado == 'incompleto' && !widget.doc.lines.any((l) => l.faltante > 0)) {
      return 'Marcó entrega parcial pero no especificó cantidades faltantes.';
    }
    if (_recibeCtrl.text.trim().isEmpty) {
      return _estado == 'rechazado' ? 'Nombre de quien rechaza la mercancía' : 'Nombre de quien recibe la entrega';
    }
    if (_sysConfig['apk_require_signature'] == 'true' && _sigController.isEmpty) {
      return 'Firma digital del cliente';
    }
    if (_sysConfig['apk_require_evidence_photo'] == 'mandatory' && _evidencePhotos.isEmpty) {
      return 'Foto de evidencia de la entrega';
    }
    if (_sysConfig['apk_require_invoice_photo'] == 'mandatory' && _facturaPhotos.isEmpty) {
      return 'Foto de la factura sellada';
    }
    return null;
  }

  Future<bool> _onWillPop() async {
    if (_isSaving) {
      return false; // Bloquear salida mientras está guardando/imprimiendo
    }
    if (isReadOnly || !_isFormDirty()) {
      return true; // Salir directamente si es solo lectura o si no modificó nada
    }

    final missingReason = _getMissingFieldsReason();
    final canSaveDirectly = missingReason == null;

    final shouldPop = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        final isPrintEnabled = _sysConfig['driver_boleta_print_enabled'] != 'false';
        final saveBtnLabel = isPrintEnabled ? '💾 GUARDAR BOLETA E IMPRIMIR' : '💾 GUARDAR Y CERRAR';

        return AlertDialog(
          backgroundColor: const Color(0xFF1E1E1E),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              Icon(
                canSaveDirectly ? Icons.save_as_rounded : Icons.warning_amber_rounded,
                color: canSaveDirectly ? Colors.greenAccent : Colors.amberAccent,
                size: 26,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  canSaveDirectly ? '¿Guardar Entrega?' : 'Cambios sin Guardar',
                  style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (canSaveDirectly) ...[
                const Text(
                  'El formulario está completo. ¿Deseas guardar los cambios y procesar esta entrega ahora?',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ] else ...[
                Text(
                  'Tienes datos ingresados pero falta completar el siguiente campo obligatorio:\n\n• $missingReason',
                  style: const TextStyle(color: Colors.amberAccent, fontSize: 13, height: 1.3),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Si sales ahora, los datos que ingresaste no se guardarán en el sistema.',
                  style: TextStyle(color: Colors.white60, fontSize: 12),
                ),
              ],
            ],
          ),
          actionsPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          actions: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (canSaveDirectly) ...[
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(AppConfig.brandColor),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    onPressed: () {
                      Navigator.pop(ctx, false); // Cierra modal
                      _saveAndPrint(); // Dispara guardado directo
                    },
                    icon: Icon(isPrintEnabled ? Icons.print : Icons.save, color: Colors.white, size: 18),
                    label: Text(saveBtnLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 8),
                ],
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white70,
                          side: const BorderSide(color: Colors.white24),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: () => Navigator.pop(ctx, false), // Permanece en la pantalla editando
                        child: const Text('Seguir Editando', style: TextStyle(fontSize: 12)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red.shade900,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: () => Navigator.pop(ctx, true), // Sale descartando
                        child: const Text('Salir sin Guardar', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        );
      },
    );

    return shouldPop ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final isCollect = widget.doc.tipoDocumento == 'recoger';
    return PopScope(
      canPop: !_isSaving && (isReadOnly || !_isFormDirty()),
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop || _isSaving) return;
        final shouldPop = await _onWillPop();
        if (shouldPop && context.mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF121212),
        appBar: AppBar(
          backgroundColor: const Color(0xFF1E1E1E),
          title: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              isCollect ? '📦 Recolección #${widget.doc.boletaNumero}' : 'Entrega #${widget.doc.boletaNumero}',
              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ),
        ),
        body: SafeArea(
          bottom: true,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
            // Client & Location Info Header
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF1E1E1E),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: isCollect ? Colors.cyan.shade700 : Colors.white12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(isCollect ? Icons.inventory_2_rounded : Icons.person_rounded, color: isCollect ? Colors.cyanAccent : const Color(AppConfig.brandColor), size: 18),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          widget.doc.clienteNombre,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('Lugar: ${widget.doc.lugarEntrega}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                  if (widget.doc.latitud != null && widget.doc.longitud != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            side: const BorderSide(color: Colors.blueAccent),
                          ),
                          onPressed: () async {
                            final url = Uri.parse('https://www.google.com/maps/search/?api=1&query=${widget.doc.latitud},${widget.doc.longitud}');
                            if (await canLaunchUrl(url)) await launchUrl(url, mode: LaunchMode.externalApplication);
                          },
                          icon: const Icon(Icons.map_rounded, color: Colors.blueAccent, size: 14),
                          label: const Text('Google Maps 🗺️', style: TextStyle(color: Colors.blueAccent, fontSize: 11)),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            side: const BorderSide(color: Colors.cyanAccent),
                          ),
                          onPressed: () async {
                            final url = Uri.parse('https://waze.com/ul?ll=${widget.doc.latitud},${widget.doc.longitud}&navigate=yes');
                            if (await canLaunchUrl(url)) await launchUrl(url, mode: LaunchMode.externalApplication);
                          },
                          icon: const Icon(Icons.navigation_rounded, color: Colors.cyanAccent, size: 14),
                          label: const Text('Waze 🚗', style: TextStyle(color: Colors.cyanAccent, fontSize: 11)),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
            // Status Selector
            Row(
              children: [
                Text(isCollect ? 'Estado de la Recolecta / Retiro:' : 'Estado de la Entrega:', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                if (!_estadoSelected) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: Colors.red.withOpacity(0.2), borderRadius: BorderRadius.circular(4), border: Border.all(color: Colors.red)),
                    child: const Text('SELECCIÓN REQUERIDA', style: TextStyle(color: Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: 'completo', label: Text(isCollect ? 'Recogido Completo' : 'Completo', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold))),
                ButtonSegment(value: 'incompleto', label: Text(isCollect ? 'Retiro Parcial' : 'Parcial / Incidencias', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold))),
                ButtonSegment(value: 'rechazado', label: Text(isCollect ? 'No se Pudo Recoger' : 'Rechazado', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold))),
              ],
              selected: _estadoSelected ? {_estado} : {},
              onSelectionChanged: isReadOnly ? null : (s) {
                setState(() {
                  _estadoSelected = true;
                  _estado = s.first;
                  if (_estado == 'completo') {
                    for (var line in widget.doc.lines) {
                      line.entregada = line.pedida;
                      line.faltante = 0;
                    }
                  } else if (_estado == 'rechazado') {
                    for (var line in widget.doc.lines) {
                      line.entregada = 0;
                      line.faltante = line.pedida;
                    }
                  } else if (_estado == 'incompleto') {
                    for (var line in widget.doc.lines) {
                      if (line.entregada == 0 && (line.faltante == 0 || line.faltante == line.pedida)) {
                        line.entregada = line.pedida;
                        line.faltante = 0;
                      } else {
                        line.faltante = math.max(0, line.pedida - line.entregada);
                      }
                    }
                  }
                });
              },
            ),
            const SizedBox(height: 16),

            // Detalle de Artículos y Faltantes (Visibilidad Permanente para Consulta del Chofer)
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFF1E1E1E),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.amber.shade700.withOpacity(0.5), width: 1),
              ),
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.list_alt_rounded, color: Colors.amber, size: 18),
                      const SizedBox(width: 6),
                      const Expanded(
                        child: Text(
                          'Detalle de Artículos',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (!isReadOnly && _estado == 'incompleto')
                        InkWell(
                          onTap: _showAddLineDialog,
                          borderRadius: BorderRadius.circular(6),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.amber.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: Colors.amber.shade700, width: 1),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.add_circle_outline_rounded, color: Colors.amber, size: 14),
                                SizedBox(width: 4),
                                Text('+ Faltante', style: TextStyle(color: Colors.amber, fontSize: 11, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                    const SizedBox(height: 10),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2A2A2A),
                        minimumSize: const Size(double.infinity, 46),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        side: const BorderSide(color: Colors.amber, width: 1),
                      ),
                      onPressed: _showItemsSearchModal,
                      icon: const Icon(Icons.manage_search_rounded, color: Colors.amber, size: 20),
                      label: Text(
                        '🔍 Ver / Filtrar Productos (${widget.doc.lines.length} Ítems)',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 14),

            // Botón de Notas / Observaciones de Calle con Modal Emergente
            InkWell(
              onTap: _showNotesModal,
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                decoration: BoxDecoration(
                  color: _notesCtrl.text.trim().isNotEmpty
                      ? (_estado == 'rechazado'
                          ? Colors.red.shade900.withOpacity(0.25)
                          : (_estado == 'incompleto' ? Colors.amber.shade900.withOpacity(0.25) : const Color(0xFF1E3A2F)))
                      : const Color(0xFF1E1E1E),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: _notesCtrl.text.trim().isNotEmpty
                        ? (_estado == 'rechazado'
                            ? Colors.redAccent
                            : (_estado == 'incompleto' ? Colors.amberAccent : Colors.greenAccent))
                        : Colors.white24,
                    width: _notesCtrl.text.trim().isNotEmpty ? 1.5 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      _notesCtrl.text.trim().isNotEmpty ? Icons.note_alt_rounded : Icons.edit_note_rounded,
                      color: _notesCtrl.text.trim().isNotEmpty
                          ? (_estado == 'rechazado'
                              ? Colors.redAccent
                              : (_estado == 'incompleto' ? Colors.amberAccent : Colors.greenAccent))
                          : Colors.grey,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                _estado == 'rechazado'
                                    ? 'Motivo del Rechazo'
                                    : (_estado == 'incompleto' ? 'Motivo / Incidencias' : 'Notas y Observaciones'),
                                style: TextStyle(
                                  color: _notesCtrl.text.trim().isNotEmpty ? Colors.white : Colors.white70,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                ),
                              ),
                              if (_notesCtrl.text.trim().isNotEmpty) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: _estado == 'rechazado'
                                        ? Colors.redAccent
                                        : (_estado == 'incompleto' ? Colors.amberAccent : Colors.green),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    '✓ NOTA REGISTRADA',
                                    style: TextStyle(color: Colors.black, fontSize: 8, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _notesCtrl.text.trim().isNotEmpty
                                ? _notesCtrl.text.trim()
                                : (isReadOnly ? 'Sin notas u observaciones adicionales' : 'Tocar para escribir motivo, avería o instrucciones...'),
                            style: TextStyle(
                              color: _notesCtrl.text.trim().isNotEmpty ? Colors.white70 : Colors.white30,
                              fontSize: 11,
                              fontStyle: _notesCtrl.text.trim().isNotEmpty ? FontStyle.normal : FontStyle.italic,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    Icon(
                      Icons.chevron_right_rounded,
                      color: _notesCtrl.text.trim().isNotEmpty ? Colors.white70 : Colors.white38,
                      size: 18,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),

            // Recibido por / Rechazado por
            TextField(
              controller: _recibeCtrl,
              readOnly: isReadOnly,
              onChanged: (_) => setState(() {}),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: _estado == 'rechazado' 
                    ? (isCollect ? 'Nombre de Quien No Entregó / Motivo *' : 'Nombre de Quien Rechaza la Mercancía *')
                    : (isCollect ? 'Nombre del Vendedor / Contacto que Entrega *' : 'Nombre de Quien Recibe *'),
                labelStyle: TextStyle(
                  color: _estado == 'rechazado' ? Colors.redAccent : Colors.grey,
                  fontWeight: _estado == 'rechazado' ? FontWeight.bold : FontWeight.normal,
                ),
                hintText: _estado == 'rechazado' 
                    ? (isCollect ? 'Ej. Roberto Gómez (Proveedor cerrado)' : 'Ej. Juan Pérez (Motivo de rechazo en notas)')
                    : (isCollect ? 'Ej. Roberto Gómez (Contacto Proveedor)' : 'Ej. Juan Pérez (Bodeguero)'),
                hintStyle: const TextStyle(color: Colors.white24, fontSize: 13),
                filled: true,
                fillColor: const Color(0xFF1E1E1E),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: _estado == 'rechazado' ? Colors.redAccent : Colors.white24),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: _estado == 'rechazado' ? Colors.redAccent.withOpacity(0.6) : Colors.white24),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: _estado == 'rechazado' ? Colors.redAccent : const Color(AppConfig.brandColor)),
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Camera Photos (Evidencia + Factura de Varias Hojas)
            const Text('Evidencias Fotográficas (Celular):', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            if (!isReadOnly) ...[
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2A2A2A),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: _takeEvidencePhoto,
                      icon: Icon(
                        Icons.camera_alt_rounded, 
                        color: _evidencePhotos.isNotEmpty ? Colors.green : const Color(AppConfig.brandColor), 
                        size: 18
                      ),
                      label: Text(
                        _evidencePhotos.isNotEmpty ? '✓ Evidencia (${_evidencePhotos.length})' : '+ Foto Evidencia', 
                        style: const TextStyle(color: Colors.white, fontSize: 12)
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2A2A2A),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: _takeFacturaPhoto,
                      icon: Icon(
                        Icons.description_rounded, 
                        color: _facturaPhotos.isNotEmpty ? Colors.green : const Color(AppConfig.brandColor), 
                        size: 18
                      ),
                      label: Text(
                        _facturaPhotos.isNotEmpty ? '✓ Factura (${_facturaPhotos.length} pág)' : '+ Foto Factura', 
                        style: const TextStyle(color: Colors.white, fontSize: 12)
                      ),
                    ),
                  ),
                ],
              ),
            ],

            // Miniaturas de Fotos de Evidencia
            if (_evidencePhotos.isNotEmpty) ...[
              const SizedBox(height: 8),
              const Text('Fotos de Mercadería / Evidencia:', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              SizedBox(
                height: 80,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _evidencePhotos.length + (!isReadOnly ? 1 : 0),
                  separatorBuilder: (c, i) => const SizedBox(width: 8),
                  itemBuilder: (c, i) {
                    if (!isReadOnly && i == _evidencePhotos.length) {
                      return InkWell(
                        onTap: _takeEvidencePhoto,
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          width: 80,
                          decoration: BoxDecoration(
                            color: const Color(0xFF2A2A2A),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.white24, style: BorderStyle.solid),
                          ),
                          child: const Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.add_a_photo_rounded, color: Color(AppConfig.brandColor), size: 20),
                              SizedBox(height: 4),
                              Text('+ Añadir', style: TextStyle(color: Colors.white70, fontSize: 10)),
                            ],
                          ),
                        ),
                      );
                    }
                    final file = _evidencePhotos[i];
                    return Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.file(file, width: 80, height: 80, fit: BoxFit.cover),
                        ),
                        if (!isReadOnly)
                          Positioned(
                            top: 2,
                            right: 2,
                            child: InkWell(
                              onTap: () => _removeEvidencePhoto(i),
                              child: Container(
                                padding: const EdgeInsets.all(2),
                                decoration: const BoxDecoration(color: Colors.black87, shape: BoxShape.circle),
                                child: const Icon(Icons.close_rounded, color: Colors.redAccent, size: 14),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
            ],

            // Miniaturas de Fotos de Facturas (Múltiples Hojas)
            if (_facturaPhotos.isNotEmpty) ...[
              const SizedBox(height: 8),
              const Text('Hojas de Factura Sellada:', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              SizedBox(
                height: 80,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _facturaPhotos.length + (!isReadOnly ? 1 : 0),
                  separatorBuilder: (c, i) => const SizedBox(width: 8),
                  itemBuilder: (c, i) {
                    if (!isReadOnly && i == _facturaPhotos.length) {
                      return InkWell(
                        onTap: _takeFacturaPhoto,
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          width: 80,
                          decoration: BoxDecoration(
                            color: const Color(0xFF2A2A2A),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.white24, style: BorderStyle.solid),
                          ),
                          child: const Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.add_photo_alternate_rounded, color: Color(AppConfig.brandColor), size: 20),
                              SizedBox(height: 4),
                              Text('+ Pág.', style: TextStyle(color: Colors.white70, fontSize: 10)),
                            ],
                          ),
                        ),
                      );
                    }
                    final file = _facturaPhotos[i];
                    return Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.file(file, width: 80, height: 80, fit: BoxFit.cover),
                        ),
                        Positioned(
                          bottom: 2,
                          left: 2,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                            decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(4)),
                            child: Text('Pág ${i + 1}', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                          ),
                        ),
                        if (!isReadOnly)
                          Positioned(
                            top: 2,
                            right: 2,
                            child: InkWell(
                              onTap: () => _removeFacturaPhoto(i),
                              child: Container(
                                padding: const EdgeInsets.all(2),
                                decoration: const BoxDecoration(color: Colors.black87, shape: BoxShape.circle),
                                child: const Icon(Icons.close_rounded, color: Colors.redAccent, size: 14),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
            ] else if (isReadOnly) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E1E1E),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.white12),
                ),
                child: Row(
                  children: [
                    Icon(
                      widget.doc.fotoEvidencia != null || widget.doc.fotoFactura != null ? Icons.cloud_done_rounded : Icons.photo_library_outlined,
                      color: widget.doc.fotoEvidencia != null || widget.doc.fotoFactura != null ? Colors.greenAccent : Colors.grey,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.doc.fotoEvidencia != null || widget.doc.fotoFactura != null
                            ? 'Evidencias fotográficas procesadas y respaldadas en el servidor.'
                            : 'No se registraron fotos de evidencia para esta entrega.',
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),

            // Touch Digital Signature Pad / Visualización de Firma
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(isCollect ? 'Firma Digital del Proveedor / Contacto:' : 'Firma Digital del Cliente (Táctil):', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                if (!isReadOnly)
                  TextButton.icon(
                    onPressed: () => _sigController.clear(),
                    icon: const Icon(Icons.refresh_rounded, color: Colors.amberAccent, size: 14),
                    label: const Text('Limpiar Firma', style: TextStyle(color: Colors.amberAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(50, 30)),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Container(
                height: 160,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.amber.shade700, width: 1.5),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 4, offset: const Offset(0, 2)),
                  ],
                ),
                child: isReadOnly
                    ? (widget.doc.firmaCliente != null && widget.doc.firmaCliente!.trim().isNotEmpty
                        ? () {
                            try {
                              String raw = widget.doc.firmaCliente!.trim();
                              if (raw.contains(',')) {
                                raw = raw.split(',').last;
                              }
                              final bytes = base64Decode(raw);
                              return Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(8.0),
                                  child: Image.memory(bytes, height: 140, fit: BoxFit.contain),
                                ),
                              );
                            } catch (_) {
                              return const Center(
                                child: Text('✓ Firma digital registrada en el sistema', style: TextStyle(color: Colors.black54, fontWeight: FontWeight.bold)),
                              );
                            }
                          }()
                        : const Center(
                            child: Text('Sin firma digital registrada', style: TextStyle(color: Colors.black38, fontStyle: FontStyle.italic)),
                          ))
                    : Stack(
                        children: [
                          // Canvas de Firma Táctil
                          Signature(
                            controller: _sigController,
                            height: 160,
                            backgroundColor: Colors.white,
                          ),
                          // Línea guía inferior punteada o tenue para orientar la firma del cliente
                          Positioned(
                            bottom: 30,
                            left: 20,
                            right: 20,
                            child: IgnorePointer(
                              child: Container(
                                height: 1,
                                color: Colors.black12,
                              ),
                            ),
                          ),
                          Positioned(
                            bottom: 12,
                            left: 20,
                            child: IgnorePointer(
                              child: Row(
                                children: const [
                                  Icon(Icons.edit_note_rounded, size: 13, color: Colors.black38),
                                  SizedBox(width: 4),
                                  Text('Firme sobre la línea', style: TextStyle(color: Colors.black38, fontSize: 10, fontWeight: FontWeight.w500)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 24),

            // Save & Print Button (Solo en modo Pendiente / Editable)
            if (!isReadOnly) ...[
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: _savingPhase.startsWith('✓') ? Colors.green.shade700 : const Color(AppConfig.brandColor),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: _savingPhase.startsWith('✓') ? Colors.green.shade800 : const Color(0xFF2E3A4E),
                  disabledForegroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 54),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(
                      color: _isSaving ? (_savingPhase.startsWith('✓') ? Colors.greenAccent : Colors.amberAccent) : Colors.transparent,
                      width: 1.5,
                    ),
                  ),
                ),
                onPressed: _isSaving ? null : _saveAndPrint,
                icon: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: _isSaving 
                      ? (_savingPhase.startsWith('✓')
                          ? const Icon(Icons.check_circle_rounded, color: Colors.white, size: 22, key: ValueKey('icon_ok'))
                          : const SizedBox(width: 20, height: 20, key: ValueKey('icon_progress'), child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5)))
                      : (_sysConfig['driver_boleta_print_enabled'] != 'false' 
                          ? const Icon(Icons.print, color: Colors.white, key: ValueKey('icon_print')) 
                          : const Icon(Icons.save, color: Colors.white, key: ValueKey('icon_save'))),
                ),
                label: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  transitionBuilder: (Widget child, Animation<double> animation) {
                    return FadeTransition(
                      opacity: animation,
                      child: SlideTransition(
                        position: Tween<Offset>(
                          begin: const Offset(0.0, 0.2),
                          end: Offset.zero,
                        ).animate(animation),
                        child: child,
                      ),
                    );
                  },
                  child: Text(
                    _isSaving 
                      ? (_savingPhase.isNotEmpty ? _savingPhase : 'PROCESANDO...') 
                      : (_sysConfig['driver_boleta_print_enabled'] != 'false' ? 'GUARDAR BOLETA E IMPRIMIR' : 'GUARDAR Y CERRAR'),
                    key: ValueKey<String>(_isSaving ? _savingPhase : 'idle_btn'),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],

            // Reimprimir Tiquete (Disponible para entregas ya procesadas)
            if (isReadOnly) ...[
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(AppConfig.brandColor),
                  minimumSize: const Size(double.infinity, 52),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: _isSaving
                    ? null
                    : () async {
                        final prefs = await SharedPreferences.getInstance();
                        final mac = prefs.getString('printer_mac');
                        final paperSize = prefs.getString('paper_size') ?? '80mm';

                        final compName = prefs.getString('company_name') ?? 'EMPRESA CLIENTE S.A.';
                        final compTaxId = prefs.getString('company_tax_id') ?? '3-101-000000';
                        final compAddr = prefs.getString('company_address') ?? 'Costa Rica';
                        final compPhone = prefs.getString('company_phone') ?? '+506 2000-0000';
                        final compEmail = prefs.getString('company_email') ?? 'contacto@empresa.com';

                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Reimprimiendo tiquete por Bluetooth...')),
                        );

                        AppLogger.log(
                          '🖨️ Chofer REIMPRIMIÓ tiquete térmico para la entrega #${widget.doc.documentoNumero} (${widget.doc.clienteNombre}) - Boleta #${widget.doc.boletaNumero}.',
                          level: 'INFO',
                          category: 'reimpresion',
                        );

                        await NativePrinterService.printBoleta(
                          doc: widget.doc,
                          lines: widget.doc.lines,
                          sysConfig: _sysConfig,
                          companyName: compName,
                          taxId: compTaxId,
                          address: compAddr,
                          phone: compPhone,
                          email: compEmail,
                          targetMacAddress: mac,
                          paperSize: paperSize,
                        );
                      },
                icon: const Icon(Icons.print, color: Colors.white),
                label: const Text('🖨️ REIMPRIMIR TIQUETE DE ESTA ENTREGA', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 46),
                  side: const BorderSide(color: Colors.white24),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.arrow_back_rounded, color: Colors.white70),
                label: const Text('Cerrar Consulta', style: TextStyle(color: Colors.white70)),
              ),
              const SizedBox(height: 12),
            ],
            ],
          ),
        ),
      ),
    ),
  );
}
}
