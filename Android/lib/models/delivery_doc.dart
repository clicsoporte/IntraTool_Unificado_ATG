import 'dart:convert';

class DeliveryLine {
  final String codigo;
  final String desc;
  final int pedida;
  int entregada;
  int faltante;

  DeliveryLine({
    required this.codigo,
    required this.desc,
    required this.pedida,
    required this.entregada,
    required this.faltante,
  });

  factory DeliveryLine.fromJson(Map<String, dynamic> j) {
    int parseQty(dynamic val) {
      if (val == null) return 0;
      if (val is int) return val;
      if (val is num) return val.toInt();
      if (val is String) {
        final parsedDbl = double.tryParse(val);
        if (parsedDbl != null) return parsedDbl.toInt();
      }
      return 0;
    }

    return DeliveryLine(
      codigo: j['codigo']?.toString() ?? j['articulo']?.toString() ?? '',
      desc: j['desc']?.toString() ?? j['descripcion']?.toString() ?? '',
      pedida: parseQty(j['pedida'] ?? j['cantidad']),
      entregada: parseQty(j['entregada']),
      faltante: parseQty(j['faltante']),
    );
  }

  Map<String, dynamic> toJson() => {
        'codigo': codigo,
        'desc': desc,
        'pedida': pedida,
        'entregada': entregada,
        'faltante': faltante,
      };
}

class DeliveryDoc {
  final int id;
  final String documentoNumero;
  String boletaNumero;
  final String tipoDocumento;
  final String clienteNombre;
  final String clienteId;
  final String lugarEntrega;
  String comentario;
  final String observaciones;
  String estado; // 'pendiente', 'completo', 'incompleto', 'rechazado'
  final String choferNombre;
  final String placaVehiculo;
  final String rutaNombre;
  String fechaEntrega;
  String? nombreRecibe;
  String? firmaCliente;
  String? fotoEvidencia;
  String? fotoFactura;
  bool isSynced;
  List<DeliveryLine> lines;
  double? latitud;
  double? longitud;

  String? vendedorPhone;
  String? vendedorNombre;
  dynamic vendedorSmsPrefs;
  String? creadoPorPhone;
  String? creadoPorNombre;
  dynamic creadoPorSmsPrefs;
  String? itEmergencyPhones;

  bool esPrioritario;
  bool requiereCita;
  bool aplicaMulta;
  String? horaApertura;
  String? horaCierre;
  String? notasRecepcion;

  Map<String, dynamic>? collectDetails;

  DeliveryDoc({
    required this.id,
    required this.documentoNumero,
    required this.boletaNumero,
    required this.tipoDocumento,
    required this.clienteNombre,
    required this.clienteId,
    required this.lugarEntrega,
    required this.comentario,
    this.observaciones = '',
    required this.estado,
    required this.choferNombre,
    required this.placaVehiculo,
    required this.rutaNombre,
    required this.fechaEntrega,
    this.nombreRecibe,
    this.firmaCliente,
    this.fotoEvidencia,
    this.fotoFactura,
    this.isSynced = true,
    this.latitud,
    this.longitud,
    this.vendedorPhone,
    this.vendedorNombre,
    this.vendedorSmsPrefs,
    this.creadoPorPhone,
    this.creadoPorNombre,
    this.creadoPorSmsPrefs,
    this.itEmergencyPhones,
    this.esPrioritario = false,
    this.requiereCita = false,
    this.aplicaMulta = false,
    this.horaApertura,
    this.horaCierre,
    this.notasRecepcion,
    this.collectDetails,
    List<DeliveryLine>? lines,
  }) : lines = lines ?? [];

  Map<String, dynamic> get parsedCollectDetails {
    if (collectDetails != null && collectDetails!.isNotEmpty) {
      return collectDetails!;
    }
    if (tipoDocumento == 'recoger' && comentario.trim().startsWith('{')) {
      try {
        final parsed = jsonDecode(comentario);
        if (parsed is Map<String, dynamic>) {
          return parsed;
        }
      } catch (_) {}
    }
    return {};
  }

  String get direccionFormateada {
    if (tipoDocumento == 'recoger') {
      final details = parsedCollectDetails;
      final dir = details['direccion_exacta'] ?? details['direccion_detalle'] ?? details['direccionDetalle'] ?? '';
      final prov = details['provincia'] ?? details['provincia_nombre'] ?? '';
      final cant = details['canton'] ?? details['canton_nombre'] ?? '';
      final dist = details['distrito'] ?? details['distrito_nombre'] ?? '';
      final full = [prov, cant, dist, dir].where((s) => s != null && s.toString().trim().isNotEmpty && s.toString().trim() != '0').join(', ');
      if (full.isNotEmpty) return full;
      if (lugarEntrega.isNotEmpty && lugarEntrega != '0') return lugarEntrega;
    } else {
      if (lugarEntrega.isNotEmpty && lugarEntrega != '0') return lugarEntrega;
    }
    return 'Sin dirección específica registrada';
  }

  factory DeliveryDoc.fromJson(Map<String, dynamic> j) {
    List<DeliveryLine> parsedLines = [];
    if (j['lines'] != null && j['lines'] is List) {
      parsedLines = (j['lines'] as List).map((l) => DeliveryLine.fromJson(Map<String, dynamic>.from(l))).toList();
    }
    int parseDocId(dynamic val) {
      if (val == null) return 0;
      if (val is int) return val;
      if (val is num) return val.toInt();
      if (val is String) {
        final parsed = int.tryParse(val);
        if (parsed != null) return parsed;
      }
      return 0;
    }

    Map<String, dynamic>? parsedCollect;
    if (j['collect_details'] != null && j['collect_details'] is Map) {
      parsedCollect = Map<String, dynamic>.from(j['collect_details']);
    }

    dynamic parseJsonOrNull(dynamic input) {
      if (input == null) return null;
      if (input is Map || input is List) return input;
      if (input is String) {
        try {
          return jsonDecode(input);
        } catch (_) {
          return null;
        }
      }
      return input;
    }

    return DeliveryDoc(
      id: parseDocId(j['id']),
      documentoNumero: j['documento_numero'] ?? '',
      boletaNumero: j['boleta_numero'] ?? j['documento_numero'] ?? '',
      tipoDocumento: j['tipo_documento'] ?? 'factura',
      clienteNombre: j['cliente_nombre'] ?? 'Cliente General',
      clienteId: j['cliente_id'] ?? 'N/D',
      lugarEntrega: j['lugar_entrega'] ?? '',
      comentario: j['comentario'] ?? '',
      observaciones: j['observaciones'] ?? '',
      estado: j['estado'] ?? 'pendiente',
      choferNombre: j['chofer_nombre'] ?? 'Chofer Clic',
      placaVehiculo: j['placa_vehiculo'] ?? 'N/D',
      rutaNombre: j['ruta_nombre'] ?? 'Ruta Local',
      fechaEntrega: j['fecha_entrega'] ?? '',
      nombreRecibe: j['nombre_recibe'],
      firmaCliente: j['firma_cliente'],
      fotoEvidencia: j['foto_evidencia'],
      fotoFactura: j['foto_factura'],
      isSynced: (j['is_synced'] ?? 1) == 1,
      latitud: j['latitud'] != null ? double.tryParse(j['latitud'].toString()) : null,
      longitud: j['longitud'] != null ? double.tryParse(j['longitud'].toString()) : null,
      vendedorPhone: j['vendedor_phone']?.toString(),
      vendedorNombre: j['vendedor_nombre']?.toString(),
      vendedorSmsPrefs: parseJsonOrNull(j['vendedor_sms_prefs']),
      creadoPorPhone: j['creado_por_phone']?.toString(),
      creadoPorNombre: j['creado_por_nombre']?.toString(),
      creadoPorSmsPrefs: parseJsonOrNull(j['creado_por_sms_prefs']),
      itEmergencyPhones: j['it_emergency_phones']?.toString(),
      esPrioritario: (j['es_prioritario'] == 1 || j['es_prioritario'] == true),
      requiereCita: (j['requiere_cita'] == 1 || j['requiere_cita'] == true),
      aplicaMulta: (j['aplica_multa'] == 1 || j['aplica_multa'] == true),
      horaApertura: j['hora_apertura']?.toString(),
      horaCierre: j['hora_cierre']?.toString(),
      notasRecepcion: j['notas_recepcion']?.toString(),
      collectDetails: parsedCollect,
      lines: parsedLines,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'documento_numero': documentoNumero,
        'boleta_numero': boletaNumero,
        'tipo_documento': tipoDocumento,
        'cliente_nombre': clienteNombre,
        'cliente_id': clienteId,
        'lugar_entrega': lugarEntrega,
        'comentario': comentario,
        'observaciones': observaciones,
        'estado': estado,
        'chofer_nombre': choferNombre,
        'placa_vehiculo': placaVehiculo,
        'ruta_nombre': rutaNombre,
        'fecha_entrega': fechaEntrega,
        'nombre_recibe': nombreRecibe,
        'firma_cliente': firmaCliente,
        'foto_evidencia': fotoEvidencia,
        'foto_factura': fotoFactura,
        'is_synced': isSynced ? 1 : 0,
        'latitud': latitud,
        'longitud': longitud,
        'vendedor_phone': vendedorPhone,
        'vendedor_nombre': vendedorNombre,
        'vendedor_sms_prefs': vendedorSmsPrefs,
        'creado_por_phone': creadoPorPhone,
        'creado_por_nombre': creadoPorNombre,
        'creado_por_sms_prefs': creadoPorSmsPrefs,
        'it_emergency_phones': itEmergencyPhones,
        'es_prioritario': esPrioritario ? 1 : 0,
        'requiere_cita': requiereCita ? 1 : 0,
        'aplica_multa': aplicaMulta ? 1 : 0,
        'hora_apertura': horaApertura,
        'hora_cierre': horaCierre,
        'notas_recepcion': notasRecepcion,
      };

  Map<String, dynamic> toSqlite() => {
        'id': id,
        'documento_numero': documentoNumero,
        'boleta_numero': boletaNumero,
        'tipo_documento': tipoDocumento,
        'cliente_nombre': clienteNombre,
        'cliente_id': clienteId,
        'lugar_entrega': lugarEntrega,
        'comentario': comentario,
        'observaciones': observaciones,
        'estado': estado,
        'chofer_nombre': choferNombre,
        'placa_vehiculo': placaVehiculo,
        'ruta_nombre': rutaNombre,
        'fecha_entrega': fechaEntrega,
        'nombre_recibe': nombreRecibe,
        'firma_cliente': firmaCliente,
        'foto_evidencia': fotoEvidencia,
        'foto_factura': fotoFactura,
        'is_synced': isSynced ? 1 : 0,
        'latitud': latitud,
        'longitud': longitud,
        'vendedor_phone': vendedorPhone,
        'vendedor_nombre': vendedorNombre,
        'vendedor_sms_prefs': vendedorSmsPrefs is Map ? jsonEncode(vendedorSmsPrefs) : vendedorSmsPrefs,
        'creado_por_phone': creadoPorPhone,
        'creado_por_nombre': creadoPorNombre,
        'creado_por_sms_prefs': creadoPorSmsPrefs is Map ? jsonEncode(creadoPorSmsPrefs) : creadoPorSmsPrefs,
        'it_emergency_phones': itEmergencyPhones,
        'es_prioritario': esPrioritario ? 1 : 0,
        'requiere_cita': requiereCita ? 1 : 0,
        'aplica_multa': aplicaMulta ? 1 : 0,
        'hora_apertura': horaApertura,
        'hora_cierre': horaCierre,
        'notas_recepcion': notasRecepcion,
      };
}
