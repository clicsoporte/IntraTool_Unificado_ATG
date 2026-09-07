/**
 * @fileoverview System Architecture Map and Semantic Index for Clic-Tools AI Assistant.
 * Provides the AI with structured architectural context, module interactions, and critical workflows
 * without needing to parse thousands of lines of raw source code on every request.
 */

export interface SystemModuleInfo {
  name: string;
  category: "Mobile APK" | "Logística & Entregas" | "Flota & Telegram" | "IT & MDM" | "Core & Automaciones";
  path: string;
  description: string;
  keyComponents: string[];
  databaseTables: string[];
  criticalFlows: string[];
  commonTroubleshooting: string[];
}

export const SYSTEM_ARCHITECTURE_MAP: SystemModuleInfo[] = [
  // 1. ANDROID FLUTTER APK
  {
    name: "Android Mobile APK (Clic Driver)",
    category: "Mobile APK",
    path: "\\Android\\lib",
    description: "Aplicación móvil nativa en Flutter para choferes de reparto. Opera en modo Offline-First con Device Owner (MDM Kiosk) y sincronización por WebSockets / HTTP.",
    keyComponents: [
      "screens/dashboard_screen.dart (Pantalla principal del chofer, auto-carga de facturas, firma táctil, foto evidencia y pausas)",
      "services/sync_engine.dart (Motor de sincronización bidireccional y resolución de conflictos)",
      "services/offline_db_service.dart (Base de datos SQLite local en el teléfono para operar 100% sin internet)",
      "services/app_logger.dart (Envío de telemetría, errores SocketException y trazas hacia ops_driver_logs en el servidor)",
      "services/version_service.dart (Actualización silenciosa OTA mediante Device Owner sin intervención del chofer)",
      "services/device_hardware_service.dart (Lectura de nivel de batería, estado de carga, señal WiFi/Celular e IP)",
      "services/device_security_service.dart (Políticas MDM Kiosk, bloqueo de desinstalación, GPS obligatorio y control de ajustes)"
    ],
    databaseTables: ["ops_driver_logs", "ops_delivery_queue", "fleet_registered_devices", "ops_app_version_settings"],
    criticalFlows: [
      "Auto-carga de Factura: Chofer escanea código de barras ➡️ SQLite local busca coincidencia ➡️ Si no existe, consulta al servidor vía HTTP/Socket ➡️ Registra evento en ops_driver_logs.",
      "Entrega Exitosa: Captura firma en canvas ➡️ Captura foto de entrega ➡️ Guarda en SQLite local ➡️ sync_engine transmite al servidor ➡️ Actualiza ops_delivery_queue a estado 'entregado'.",
      "Actualización Silenciosa OTA: version_service consulta /api/fleet/app-version ➡️ Si version_code es mayor, descarga APK en background ➡️ Instala vía PackageInstaller nativo sin diálogo."
    ],
    commonTroubleshooting: [
      "SocketException / Timeout: Indica desconexión de red celular o túnel WireGuard VPN caído en el teléfono.",
      "Factura no encontrada: La factura aún no fue importada desde el ERP a core_erp_invoice_headers o no está asignada al chofer.",
      "Fallo OTA (ota_failures >= 3): Dispositivo con almacenamiento lleno (<500MB) o batería baja (<20%) bloqueando la instalación."
    ]
  },

  // 2. LOGÍSTICA & DESPACHO
  {
    name: "Logística y Despacho de Operaciones",
    category: "Logística & Entregas",
    path: "/dashboard/operations/logistics",
    description: "Centro neurálgico de operaciones logísticas, monitoreo de rutas en tiempo real, auditoría forense de entregas y portal de contingencia para choferes.",
    keyComponents: [
      "/dashboard/operations/logistics/deliveries (Gestión de despacho diario, armado de hojas de ruta y estados)",
      "/dashboard/operations/logistics/collect (Módulo de recolectas a proveedores y devoluciones de mercadería)",
      "/dashboard/operations/logistics/gps-monitor (Rastreo en mapa Leaflet de choferes, geocercas y tiempos de parada)",
      "/dashboard/operations/logistics/driver (Portal web móvil de contingencia para choferes sin teléfono Android)",
      "/dashboard/operations/logistics/analytics (Indicadores de rendimiento de entrega, tiempos de ciclo y OTIF)",
      "/dashboard/operations/logistics/audit (Auditoría forense de cambios de estado, reversiones y firmas)"
    ],
    databaseTables: ["ops_delivery_queue", "ops_delivery_assignments", "ops_driver_logs", "core_erp_invoice_headers"],
    criticalFlows: [
      "Despacho Diario: Supervisor crea asignación en ops_delivery_assignments vinculando chofer y vehículo ➡️ Facturas pasan a estado 'asignado' ➡️ Visibles en el APK del chofer.",
      "Logística Inversa / Recolectas: Registro de boleta de recolecta ➡️ Asignación a ruta ➡️ Confirmación con firma en el destino."
    ],
    commonTroubleshooting: [
      "Factura retenida en cola: Verificar si tiene asignación de chofer activa o si fue marcada con error de geocerca.",
      "Discrepancia OTIF: Tiempos de permanencia en cliente excesivos calculados entre hora_ingreso_geocerca y hora_salida_geocerca."
    ]
  },

  // 3. ADMINISTRACIÓN DE ENTREGAS
  {
    name: "Administración Total de Entregas",
    category: "Logística & Entregas",
    path: "/dashboard/admin/operations/deliveries",
    description: "Panel de control maestro para administradores. Permite reabrir rutas, forzar cambios de estado, anular entregas y auditar la cola global de documentos.",
    keyComponents: [
      "src/app/dashboard/admin/operations/deliveries/page.tsx (Panel maestro de administración y filtros avanzados)",
      "src/modules/operations/lib/actions.ts (Server actions para forzado de estados, asignación masiva y exportación)"
    ],
    databaseTables: ["ops_delivery_queue", "ops_delivery_assignments", "core_logs"],
    criticalFlows: [
      "Reversión de Entrega: Administrador revierte documento entregado por error ➡️ ops_delivery_queue vuelve a 'pendiente' ➡️ Se registra auditoría en core_logs."
    ],
    commonTroubleshooting: [
      "Bloqueo de Sincronización: Documentos con conflicto de edición simultánea entre portal web y APK móvil."
    ]
  },

  // 4. FLOTA VEHICULAR & BOT TELEGRAM
  {
    name: "Gestión de Flota Vehicular & Bot Telegram",
    category: "Flota & Telegram",
    path: "/dashboard/fleet y /dashboard/admin/fleet",
    description: "Control de activos vehiculares, odómetros, repostajes de combustible vinculados con RECOPE, bitácora de mantenimientos y Bot conversacional de Telegram.",
    keyComponents: [
      "/dashboard/fleet/vehicles (Catálogo de camiones/motos, placas, marcas y odómetros)",
      "/dashboard/fleet/new (Registro de cargas de combustible y sincronización de precios RECOPE)",
      "/dashboard/fleet/reports (Reportes de rendimiento km/litro y costos operativos)",
      "/dashboard/admin/fleet (Configuración de marcas, tipos de combustible y catálogos de mantenimiento)",
      "src/modules/fleet/lib/telegram-actions.ts (Control de vinculaciones de choferes y procesamiento de comandos de Telegram)"
    ],
    databaseTables: ["fleet_vehicles", "fleet_fuel_logs", "fleet_maintenance_logs", "fleet_telegram_bot_logs"],
    criticalFlows: [
      "Carga de Combustible con RECOPE: Chofer o administrativo registra litros y monto ➡️ Sistema valida precio oficial vigente de RECOPE ➡️ Alerta anomalías de sobreprecio o consumo excesivo.",
      "Interacción Bot Telegram: Chofer envía comando /ruta o foto ➡️ Webhook procesa solicitud ➡️ Registra traza en fleet_telegram_bot_logs."
    ],
    commonTroubleshooting: [
      "Fallo de Webhook de Telegram: Token de bot desactualizado o URL de webhook no accesible públicamente por HTTPS.",
      "Anomalía de Rendimiento: Odómetro registrado menor al odómetro anterior en fleet_fuel_logs."
    ]
  },

  // 5. AUTOMACIONES & ASISTENTE IA
  {
    name: "Motor de Automaciones, Notificaciones & IA",
    category: "Core & Automaciones",
    path: "/dashboard/admin/automations",
    description: "Centro de control de tareas programadas (cron), reglas de alertas por Email/Telegram y configuración dinámica del motor de Inteligencia Artificial.",
    keyComponents: [
      "src/app/dashboard/admin/automations/page.tsx (Gestión de reglas, cron jobs y configuración de IA)",
      "src/modules/core/lib/ai-assistant-service.ts (Motor conversacional general de usabilidad para Telegram)",
      "src/modules/core/lib/ai-auditor-service.ts (Motor de diagnóstico forense de TI con acceso a SQLite)",
      "src/app/dashboard/it-tools/ai-auditor/page.tsx (Consola forense de IA para el departamento de TI)"
    ],
    databaseTables: ["core_ai_settings", "notification_rules", "scheduled_tasks", "notification_templates", "core_logs"],
    criticalFlows: [
      "Configuración de IA en Caliente: Administrador marca tablas permitidas y ajusta el Master Prompt en /dashboard/admin/automations ➡️ Se guarda en core_ai_settings ➡️ Se aplica inmediatamente sin reiniciar.",
      "Alertas Automáticas: Evento de sistema (ej. stock bajo o fallo de entrega) ➡️ Motor evalúa notification_rules ➡️ Dispara Email vía Nodemailer o mensaje a Telegram."
    ],
    commonTroubleshooting: [
      "Timeout en IA: Modelo tardando más de 45s debido a consultas masivas; mitigado mediante filtrado mecánico por '6 horas' o 'hoy'.",
      "Tarea Cron Inactiva: Verificar si el servicio en segundo plano de Windows / Node.js tiene el proceso de scheduler encendido."
    ]
  },

  // 6. IT TOOLS & MDM
  {
    name: "Herramientas de TI, ITAM & Flota Móvil MDM",
    category: "IT & MDM",
    path: "/dashboard/it-tools",
    description: "Administración integral de activos tecnológicos, licencias de software, notas técnicas de soporte y control MDM de celulares Android.",
    keyComponents: [
      "/dashboard/it-tools/assets (Inventario de hardware, laptops, servidores y custodias)",
      "/dashboard/it-tools/mobile (Gestión de celulares Android, control Device Owner, bloqueo de apps y OTA)",
      "/dashboard/it-tools/notes (Base de conocimiento y procedimientos técnicos)",
      "/dashboard/it-tools/ai-auditor (Consola interactiva del Asistente IA de Soporte TI)"
    ],
    databaseTables: ["it_assets", "it_asset_assignments", "it_licenses_catalog", "it_asset_licenses", "it_notes", "it_branches", "it_asset_telemetry", "fleet_registered_devices", "ops_app_version_settings"],
    criticalFlows: [
      "Asignación de Equipo: Administrador asigna laptop a usuario ➡️ Registra en it_asset_assignments ➡️ Envía acta de entrega por correo al colaborador.",
      "Hardening MDM de Celulares: Aplicar políticas de bloqueo (deshabilitar ajustes, forzar GPS, modo Kiosco) ➡️ APK sincroniza y activa DevicePolicyManager."
    ],
    commonTroubleshooting: [
      "Licencia por Expirar: Registro con fecha de vencimiento menor a 30 días en it_asset_licenses.",
      "Dispositivo Desconectado: Celular con last_seen mayor a 24 horas en fleet_registered_devices."
    ]
  }
];

/**
 * Genera un resumen compacto en texto estructurado del Mapa Arquitectónico para inyectar en el System Prompt de la IA.
 */
export function getSystemArchitectureSummary(): string {
  let summary = "=== MAPA ARQUITECTÓNICO DEL SISTEMA CLIC-TOOLS ===\n\n";

  for (const mod of SYSTEM_ARCHITECTURE_MAP) {
    summary += `📦 MÓDULO: ${mod.name} [${mod.category}]\n`;
    summary += `📍 Ruta: ${mod.path}\n`;
    summary += `📝 Propósito: ${mod.description}\n`;
    summary += `🔑 Componentes Clave:\n  - ${mod.keyComponents.join("\n  - ")}\n`;
    summary += `🗄️ Tablas BD: ${mod.databaseTables.join(", ")}\n`;
    summary += `⚡ Flujos Críticos:\n  - ${mod.criticalFlows.join("\n  - ")}\n`;
    summary += `🩺 Diagnóstico Común:\n  - ${mod.commonTroubleshooting.join("\n  - ")}\n\n`;
  }

  return summary;
}
