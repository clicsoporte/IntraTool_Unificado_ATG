"use server";

import { getDb } from "./db";
import { getAiSettings } from "./db";
import { authorizeAction } from "./auth-guard";
import { logError, logInfo, logWarn } from "./logger";
import { getSystemArchitectureSummary } from "./system-architecture-map";

export interface SqliteTableCatalogItem {
  name: string;
  category: "Core / Sistema" | "Entregas / APK" | "Flota / Bot" | "IT Tools / ITAM" | "IT Tools / Mobile" | "Inventario" | "ERP";
  description: string;
  recommended: boolean;
}

const SQLITE_TABLES_CATALOG: SqliteTableCatalogItem[] = [
  {
    name: "core_logs",
    category: "Core / Sistema",
    description: "Bitácora general de eventos, advertencias del servidor y excepciones no controladas (INFO, WARN, ERROR).",
    recommended: true,
  },
  {
    name: "ops_driver_logs",
    category: "Entregas / APK",
    description: "Registros de actividad y telemetría de choferes en el APK móvil (auto-carga de facturas, fallos de sincronización, desconexiones de socket/VPN, pausas y eventos en ruta).",
    recommended: true,
  },
  {
    name: "ops_delivery_queue",
    category: "Entregas / APK",
    description: "Cola de documentos y facturas despachadas (estados, firmas táctiles, fotos de evidencia, coordenadas GPS y anomalías de entrega).",
    recommended: true,
  },
  {
    name: "ops_delivery_assignments",
    category: "Entregas / APK",
    description: "Asignaciones de rutas diarias abiertas a choferes con vehículos y fechas vinculadas.",
    recommended: true,
  },
  {
    name: "fleet_telegram_bot_logs",
    category: "Flota / Bot",
    description: "Trazas técnicas, mensajes entrantes y errores de ejecución del bot de Telegram.",
    recommended: true,
  },
  {
    name: "fleet_vehicles",
    category: "Flota / Bot",
    description: "Catálogo de vehículos, placas, marcas, odómetros y estado de mantenimiento de flota.",
    recommended: false,
  },
  {
    name: "fleet_fuel_logs",
    category: "Flota / Bot",
    description: "Registros de repostajes de combustible, sincronizaciones con RECOPE y anomalías de consumo.",
    recommended: false,
  },
  {
    name: "it_assets",
    category: "IT Tools / ITAM",
    description: "Inventario de computadoras, servidores, números de serie, hardware y estado de salud de activos TI.",
    recommended: true,
  },
  {
    name: "it_asset_assignments",
    category: "IT Tools / ITAM",
    description: "Historial de custodias y asignaciones de equipos a colaboradores y usuarios.",
    recommended: true,
  },
  {
    name: "it_licenses_catalog",
    category: "IT Tools / ITAM",
    description: "Catálogo de software, suites ofimáticas y licencias disponibles en la empresa.",
    recommended: true,
  },
  {
    name: "it_asset_licenses",
    category: "IT Tools / ITAM",
    description: "Licencias de software asignadas a computadoras y alertas de vencimiento.",
    recommended: true,
  },
  {
    name: "it_notes",
    category: "IT Tools / ITAM",
    description: "Base de conocimiento técnico, procedimientos de soporte, credenciales de red y guías de TI.",
    recommended: true,
  },
  {
    name: "it_branches",
    category: "IT Tools / ITAM",
    description: "Sedes, sucursales y ubicaciones físicas de la empresa.",
    recommended: true,
  },
  {
    name: "it_asset_telemetry",
    category: "IT Tools / ITAM",
    description: "Telemetría en tiempo real del Agente TI de Windows (RAM, CPU, discos, IPs y estado de conexión).",
    recommended: true,
  },
  {
    name: "fleet_registered_devices",
    category: "IT Tools / Mobile",
    description: "Flota de celulares y tablets Android registradas (/dashboard/it-tools/mobile): hardware ID, chofer asignado, versión de app instalada, nivel de batería, señal WiFi/Celular, IP, estado MDM, bloqueos de kiosco y fallos OTA.",
    recommended: true,
  },
  {
    name: "ops_app_version_settings",
    category: "IT Tools / Mobile",
    description: "Configuración y control de versiones del APK móvil (/dashboard/it-tools/mobile): versión objetivo oficial, URL del APK, changelog y pausa global de actualizaciones OTA.",
    recommended: true,
  },
  {
    name: "core_users",
    category: "Core / Sistema",
    description: "Usuarios del sistema, roles asignados, identificadores de empleados y estados de cuenta.",
    recommended: false,
  },
  {
    name: "core_erp_invoice_headers",
    category: "ERP",
    description: "Cabeceras de facturas sincronizadas desde el ERP (rutas asignadas, clientes, montos y fechas).",
    recommended: false,
  },
];

/**
 * Obtiene el catálogo completo de tablas con su descripción funcional
 */
export async function getSqliteTablesCatalogAction(): Promise<SqliteTableCatalogItem[]> {
  await authorizeAction("admin:settings:automations");
  return SQLITE_TABLES_CATALOG;
}

/**
 * Extrae datos relevantes de las tablas autorizadas para alimentar el contexto de la IA de forma mecánica y dirigida.
 */
async function fetchAuthorizedDatabaseContext(allowedTables: string[], userMessage: string = ""): Promise<string> {
  const db = await getDb();
  let contextReport = "";

  const lowerMsg = userMessage.toLowerCase();
  const isSixHoursFilter = lowerMsg.includes("6 horas") || lowerMsg.includes("seis horas") || lowerMsg.includes("horas") || lowerMsg.includes("reciente");
  const isTodayFilter = isSixHoursFilter || lowerMsg.includes("hoy") || lowerMsg.includes("today") || lowerMsg.includes("ahora") || lowerMsg.includes("actual");
  const isAllLogsFilter = lowerMsg.includes("todos") || lowerMsg.includes("general") || lowerMsg.includes("global") || lowerMsg.includes("visor");
  const isNetworkFilter = lowerMsg.includes("red") || lowerMsg.includes("socket") || lowerMsg.includes("wireguard") || lowerMsg.includes("conexion") || lowerMsg.includes("vpn");
  const isDriverFilter = lowerMsg.includes("chofer") || lowerMsg.includes("driver") || lowerMsg.includes("apk") || lowerMsg.includes("factura");
  const isItamFilter = lowerMsg.includes("activo") || lowerMsg.includes("computadora") || lowerMsg.includes("laptop") || lowerMsg.includes("licencia") || lowerMsg.includes("hardware") || lowerMsg.includes("servidor");

  for (const tableName of allowedTables) {
    const tableInfo = SQLITE_TABLES_CATALOG.find((t) => t.name === tableName);
    if (!tableInfo) continue;

    try {
      // Verificar si la tabla existe en SQLite
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
      if (!exists) continue;

      let rows: any[] = [];

      if (tableName === "core_logs") {
        let sql = `SELECT timestamp, type, message, details FROM core_logs WHERE 1=1`;
        if (!isAllLogsFilter) {
          sql += ` AND type IN ('WARN', 'ERROR')`;
        }
        if (isSixHoursFilter) {
          sql += ` AND timestamp >= datetime('now', '-6 hours', 'localtime')`;
        } else if (isTodayFilter) {
          sql += ` AND DATE(timestamp) = DATE('now', 'localtime')`;
        }
        sql += ` ORDER BY timestamp DESC LIMIT 35`;
        rows = db.prepare(sql).all();
      } else if (tableName === "ops_driver_logs") {
        let sql = `SELECT timestamp, chofer_nombre, user_name, level, category, message FROM ops_driver_logs WHERE 1=1`;
        if (isSixHoursFilter) {
          sql += ` AND timestamp >= datetime('now', '-6 hours', 'localtime')`;
        } else if (isTodayFilter) {
          sql += ` AND DATE(timestamp) = DATE('now', 'localtime')`;
        }
        if (isNetworkFilter) {
          sql += ` AND (message LIKE '%Socket%' OR message LIKE '%WireGuard%' OR message LIKE '%Exception%' OR message LIKE '%fail%' OR message LIKE '%error%' OR message LIKE '%red%' OR category = 'network')`;
        }
        sql += ` ORDER BY timestamp DESC LIMIT 35`;
        rows = db.prepare(sql).all();
      } else if (tableName === "fleet_telegram_bot_logs") {
        let sql = `SELECT timestamp, actionType, driverName, message, details FROM fleet_telegram_bot_logs WHERE 1=1`;
        if (isSixHoursFilter) {
          sql += ` AND timestamp >= datetime('now', '-6 hours', 'localtime')`;
        } else if (isTodayFilter) {
          sql += ` AND DATE(timestamp) = DATE('now', 'localtime')`;
        }
        sql += ` ORDER BY id DESC LIMIT 20`;
        rows = db.prepare(sql).all();
      } else if (tableName === "ops_delivery_queue") {
        let sql = `SELECT documento_numero, tipo_documento, cliente_nombre, estado, fecha_registro, fecha_entrega, comentario FROM ops_delivery_queue WHERE estado NOT IN ('completo')`;
        if (isSixHoursFilter || isTodayFilter) {
          sql += ` AND (DATE(fecha_registro) = DATE('now', 'localtime') OR DATE(fecha_entrega) = DATE('now', 'localtime'))`;
        }
        sql += ` ORDER BY id DESC LIMIT 20`;
        rows = db.prepare(sql).all();
      } else if (tableName === "it_assets") {
        rows = db.prepare(`
          SELECT a.id, a.item_id, a.category, a.brand, a.model, a.serial_number, a.status, 
                 b.name as branch_name, a.purchase_date, a.notes
          FROM it_assets a
          LEFT JOIN it_branches b ON a.branch_id = b.id
          ORDER BY a.id DESC
          LIMIT 30
        `).all();
      } else if (tableName === "it_asset_assignments") {
        rows = db.prepare(`
          SELECT asg.id, asg.asset_id, a.brand as asset_brand, a.model as asset_model, asg.assignee_type, 
                 asg.user_id, asg.employee_code, asg.assigned_date, asg.assigned_by, asg.returned_date
          FROM it_asset_assignments asg
          LEFT JOIN it_assets a ON asg.asset_id = a.id
          ORDER BY asg.assigned_date DESC
          LIMIT 25
        `).all();
      } else if (tableName === "it_licenses_catalog") {
        rows = db.prepare(`SELECT * FROM it_licenses_catalog ORDER BY name ASC`).all();
      } else if (tableName === "it_asset_licenses") {
        rows = db.prepare(`
          SELECT al.id, l.name as license_name, a.brand as asset_brand, a.model as asset_model, 
                 al.license_key, al.expiration_date, al.assigned_date
          FROM it_asset_licenses al
          LEFT JOIN it_licenses_catalog l ON al.license_id = l.id
          LEFT JOIN it_assets a ON al.asset_id = a.id
          ORDER BY al.expiration_date ASC
          LIMIT 25
        `).all();
      } else if (tableName === "it_notes") {
        rows = db.prepare(`
          SELECT id, title, category, author_name, created_at, content 
          FROM it_notes 
          ORDER BY created_at DESC 
          LIMIT 15
        `).all();
      } else if (tableName === "it_branches") {
        rows = db.prepare(`SELECT * FROM it_branches ORDER BY name ASC`).all();
      } else if (tableName === "it_asset_telemetry") {
        rows = db.prepare(`
          SELECT t.asset_id, t.hostname, a.brand as asset_brand, a.model as asset_model, 
                 t.cpu_usage, t.ram_used_percent, t.ip_address_local, t.ip_address_public, t.last_seen
          FROM it_asset_telemetry t
          LEFT JOIN it_assets a ON t.asset_id = a.id
          ORDER BY t.last_seen DESC
          LIMIT 15
        `).all();
      } else if (tableName === "fleet_registered_devices") {
        rows = db.prepare(`
          SELECT hardware_id, device_name, last_driver_name, phone_number, current_app_version, 
                 current_app_version_code, battery_level, is_charging, wifi_ssid, cellular_network_type, 
                 ip_address, ota_failures, ota_paused, last_seen
          FROM fleet_registered_devices
          ORDER BY last_seen DESC
          LIMIT 25
        `).all();
      } else if (tableName === "ops_app_version_settings") {
        rows = db.prepare(`SELECT * FROM ops_app_version_settings WHERE id = 1`).all();
      } else {
        rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT 15`).all();
      }

      if (rows.length > 0) {
        contextReport += `\n--- TABLA [${tableName}] (${tableInfo.description}) ---\n`;
        contextReport += JSON.stringify(rows, null, 2).substring(0, 4000);
        contextReport += "\n";
      }
    } catch (e: any) {
      console.warn(`[AI Auditor] Error leyendo tabla ${tableName}:`, e.message);
    }
  }

  return contextReport;
}

/**
 * Consulta interactiva con el Asistente IA de Auditoría de TI
 */
export async function chatWithAiAuditorAction(params: {
  message: string;
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
  filterContextHint?: string;
  customLogsPayload?: string;
}): Promise<{ success: boolean; reply: string; error?: string }> {
  try {
    const user = await authorizeAction("ai:audit:logs");
    const settings = await getAiSettings();

    if (!settings || settings.aiEnabled === 0) {
      return {
        success: false,
        reply: "El motor de Inteligencia Artificial está desactivado en la configuración de Automaciones.",
        error: "AI Disabled",
      };
    }

    const provider = settings.provider;
    const masterPrompt =
      settings.auditorMasterPrompt ||
      "Eres un Auditor Senior de Sistemas e Infraestructura para Clic-Tools. Analiza los logs, identifica causas raíz, diagnostica fallas de red/sockets/base de datos y sugiere soluciones claras y preventivas.";

    // Parsear tablas permitidas
    let allowedTables: string[] = [];
    try {
      allowedTables = JSON.parse(settings.auditorAllowedTables || "[]");
    } catch {
      allowedTables = ["core_logs", "ops_driver_logs", "fleet_telegram_bot_logs"];
    }

    // 1. Obtener contexto de base de datos autorizado y optimizado mecánicamente
    const dbContext = await fetchAuthorizedDatabaseContext(allowedTables, params.message);
    const systemArchMap = getSystemArchitectureSummary();

    let systemInstruction = `
${masterPrompt}

${systemArchMap}

DIRECTIVAS ESPECÍFICAS DE RESPUESTA:
- Eres el asistente exclusivo del Departamento de TI de Clic-Tools.
- Conoces a fondo la arquitectura del sistema descrita arriba (la app Flutter de Android, los submódulos de Logística, la Flota vehicular, las Automaciones y el MDM).
- ENFÓCATE ESTRICTAMENTE EN LA PREGUNTA DEL INGENIERO DE TI: Si pregunta por "ops_driver_logs", fallas de red, o inventario, responde directamente sobre eso. Relaciona el problema con el componente o servicio correspondiente (ej. sync_engine.dart, version_service.dart, ops_delivery_queue, etc.).
- Proporciona un desglose limpio, claro y fácil de leer:
  1. 🔍 **Diagnóstico y Causa Raíz** (explica el origen técnico del error, servicio involucrado o código errno).
  2. 📊 **Impacto Operativo** (si afecta choferes, entregas, o si es transitorio).
  3. 🛠️ **Pasos de Mitigación o Solución** (indica la pantalla, archivo o acción concreta).
  4. 💡 **Punto de Mejora Preventiva**.
- Responde siempre en español profesional, con formato Markdown ordenado (listas, viñetas y bloques de código para trazas).
- Si no hay eventos anómalos en la bitácora consultada, indícalo de forma breve y concisa ("✅ Sin anomalías registradas en el período").

TABLAS DE SQLITE CON ACCESO AUTORIZADO:
${allowedTables.join(", ")}

CONTEXTO ACTUAL EXTRAÍDO DE LAS TABLAS DE BD:
${dbContext || "No hay registros recientes o las tablas autorizadas están vacías."}
`;

    if (params.customLogsPayload) {
      systemInstruction += `\n\nLOGS ESPECÍFICOS ENVIADOS DESDE EL VISOR:\n${params.customLogsPayload.substring(0, 6000)}`;
    }

    // Preparar historial
    const history = params.conversationHistory || [];

    // Timeout dinámico configurado por el usuario (por defecto 45s, configurable en /dashboard/admin/automations)
    const timeoutSeconds = settings.auditorTimeoutSeconds && settings.auditorTimeoutSeconds > 0 ? settings.auditorTimeoutSeconds : 45;
    const timeoutMs = timeoutSeconds * 1000;

    if (provider === "gemini") {
      const apiKey = settings.geminiApiKey;
      if (!apiKey) throw new Error("Falta la API Key de Google Gemini en la configuración.");

      const model = settings.geminiModel || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const contents = history.map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      }));

      contents.push({
        role: "user",
        parts: [{ text: params.message }],
      });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4000,
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error de Gemini API (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No se obtuvo respuesta del modelo.";
      return { success: true, reply };
    } else if (provider === "deepseek") {
      const apiKey = settings.deepseekApiKey;
      if (!apiKey) throw new Error("Falta la API Key de DeepSeek en la configuración.");

      const model = settings.deepseekModel || "deepseek-chat";
      const messages = [
        { role: "system", content: systemInstruction },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: params.message },
      ];

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 4000,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error de DeepSeek API (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "No se obtuvo respuesta de DeepSeek.";
      return { success: true, reply };
    } else if (provider === "ollama") {
      const host = (settings.ollamaHost || "http://localhost:11434").replace(/\/$/, "");
      const model = settings.ollamaModel || "llama3.2:3b";
      const messages = [
        { role: "system", content: systemInstruction },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: params.message },
      ];

      const response = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: { temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Error de Ollama (${response.status})`);
      }

      const data = await response.json();
      const reply = data.message?.content || "No se obtuvo respuesta de Ollama.";
      return { success: true, reply };
    }

    return { success: false, reply: "", error: "Proveedor no soportado." };
  } catch (error: any) {
    logError("Error en chatWithAiAuditorAction:", { message: error.message });
    return {
      success: false,
      reply: `❌ Ocurrió un error al procesar la auditoría: ${error.message}`,
      error: error.message,
    };
  }
}
