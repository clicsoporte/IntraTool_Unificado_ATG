import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb, importAllData } from '@/modules/core/lib/db';
import { getDbSync } from '@/modules/core/lib/db-conn';
import { getNotificationConfig } from '@/modules/notifications/lib/db';
import { getBusinessDateStr, getCachedTimeZone, getBusinessDateStrSync } from '@/modules/core/lib/timezone';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { 
  getLinkageByChatId, 
  getTelegramState, 
  saveTelegramState, 
  deleteTelegramState, 
  activateLinkage, 
  getVehicleByPlate, 
  getPlateSuggestions,
  getMaintenanceTypes, 
  getTelegramBotSettings, 
  saveTelegramFuelLog, 
  saveTelegramMaintenanceLog,
  saveTelegramBotLog,
  checkIsMechanic,
  getCoreUserIdFromLinkage,
  createTicketFromTelegram,
  getOpenTicketsForMechanic,
  assignTicketToMechanic,
  updateTicketStatusFromTelegram,
  searchSpareParts,
  consumeSparePartForTicket
} from '@/modules/fleet/lib/telegram-bot';
import { updateDeliveryStatusInternal } from '@/modules/operations/lib/delivery-service';
import { finalizeRouteAssignmentInternal, populateDeliveryQueueFromERPInternal } from '@/modules/operations/lib/actions';
// In-memory locks for coalescing concurrent sync requests from Telegram Bot
let activeSyncPromise: Promise<void> | null = null;
let lastSyncTime = 0;
const SYNC_COOLDOWN_MS = 10000; // 10 seconds cooldown

async function performAutoSyncSafe() {
  if (activeSyncPromise) {
    logInfo("AutoSync already in progress, awaiting existing sync...");
    await activeSyncPromise;
    return;
  }

  const now = Date.now();
  if (now - lastSyncTime < SYNC_COOLDOWN_MS) {
    logInfo("AutoSync requested during cooldown. Skipping execution.");
    return;
  }

  activeSyncPromise = (async () => {
    try {
      logInfo("Executing single-flight AutoSync from Telegram Bot...");
      await importAllData();
      await populateDeliveryQueueFromERPInternal({ daysLookback: 5 });
      lastSyncTime = Date.now();
    } catch (err: any) {
      logError("Error during single-flight AutoSync:", err);
    } finally {
      activeSyncPromise = null;
    }
  })();

  await activeSyncPromise;
}

function getPendingSummary(db: any, assignmentId: number): string {
  try {
    const rows = db.prepare(`
      SELECT documento_numero, tipo_documento, cliente_nombre, estado
      FROM ops_delivery_queue
      WHERE asignacion_id = ? AND entregado = 0
    `).all(assignmentId) as Array<{ documento_numero: string; tipo_documento: string; cliente_nombre: string; estado: string }>;

    if (!rows || rows.length === 0) {
      return "";
    }

    const entregas = rows.filter(r => r.tipo_documento !== 'recoger');
    const recolectas = rows.filter(r => r.tipo_documento === 'recoger');

    let summary = "\n\n📦 <b>Resumen de Pendientes a Retornar:</b>";

    if (entregas.length > 0) {
      summary += "\n\n<b>Entregas No Completadas:</b>";
      entregas.forEach(e => {
        summary += `\n• Factura ${e.documento_numero} - ${e.cliente_nombre || 'Sin nombre'} (${e.estado || 'Pendiente'})`;
      });
    }

    if (recolectas.length > 0) {
      summary += "\n\n<b>Recolectas No Completadas:</b>";
      recolectas.forEach(r => {
        summary += `\n• Recolecta ${r.documento_numero} - ${r.cliente_nombre || 'Sin nombre'} (${r.estado || 'Pendiente'})`;
      });
    }

    return summary;
  } catch (e) {
    console.error("Error generating pending summary:", e);
    return "";
  }
}

// Telegram Keyboards
// Telegram Keyboards
const menuKeyboard = {
  keyboard: [
    [{ text: "🚛 Transportes y Entregas" }],
    [{ text: "🛠️ Flota y Taller" }],
    [{ text: "📦 Almacén" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

function getActiveModules(linkage: any) {
  if (!linkage) return [];
  const hasFuel = linkage.allowFuel !== 0;
  const hasMaint = linkage.allowMaintenance !== 0;
  const hasDeliveries = linkage.allowDeliveries !== 0;
  const hasWarehouse = linkage.allowWarehouse !== 0;

  const active = [];
  if (hasDeliveries) active.push('deliveries');
  if (linkage.isMechanic && (hasMaint || hasFuel)) active.push('flota');
  if (hasWarehouse) active.push('warehouse');
  return active;
}

function getShowRtv() {
  let showRtv = true;
  let tempDb: any = null;
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'dbs', 'clic_tools.db');
    tempDb = new Database(dbPath, { readonly: true });
    const row = tempDb.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_rtv'").get() as { value: string } | undefined;
    if (row && row.value === 'false') {
      showRtv = false;
    }
  } catch (err) {
    console.error("Error reading bot_ask_rtv synchronously:", err);
  } finally {
    if (tempDb) {
      try {
        tempDb.close();
      } catch (e) {}
    }
  }
  return showRtv;
}

function getCoreUserIdFromLinkageSync(employeeId: string, db: any): number | null {
  try {
    let userRow;
    if (employeeId.startsWith('U-')) {
      userRow = db.prepare("SELECT id FROM core_users WHERE ('U-' || id) = ?").get(employeeId) as { id: number } | undefined;
    } else {
      userRow = db.prepare("SELECT id FROM core_users WHERE employeeId = ?").get(employeeId) as { id: number } | undefined;
    }
    return userRow ? userRow.id : null;
  } catch (err) {
    console.error("Error in getCoreUserIdFromLinkageSync:", err);
    return null;
  }
}

function getTransportesMenuKeyboard(linkage: any, hasMultipleModules: boolean) {
  const keyboardRows: any[] = [];
  
  let hasActiveAssignment = false;
  try {
    const db = getDbSync();
    const todayStr = getBusinessDateStrSync();
    const coreUserId = getCoreUserIdFromLinkageSync(linkage.employeeId, db) || 0;
    
    if (coreUserId) {
      const activeAssignment = db.prepare(`
          SELECT 1 FROM ops_delivery_assignments
          WHERE empleado_id = ? AND fecha = ? AND activa = 1
      `).get(coreUserId, todayStr);
      if (activeAssignment) {
        hasActiveAssignment = true;
      }
    }
  } catch (e) {
    console.error("Error checking active assignment in keyboard:", e);
  }
  
  if (linkage.allowDeliveries !== 0) {
    if (hasActiveAssignment) {
      keyboardRows.push([{ text: "📝 Registrar Entregas" }]);
      keyboardRows.push([{ text: "📦 Registrar Recolectas" }]);
    } else {
      keyboardRows.push([{ text: "🛣️ Iniciar Nueva Ruta" }]);
    }
  }
  if (linkage.allowFuel !== 0) {
    keyboardRows.push([{ text: "⛽ Registrar Combustible (Mi Vehículo)" }]);
  }
  if (linkage.allowMaintenance !== 0 && !linkage.isMechanic) {
    keyboardRows.push([{ text: "🔧 Reportar Avería (Mi Vehículo)" }]);
  }
  if (hasMultipleModules) {
    keyboardRows.push([{ text: "Volver al Menú Principal 🔙" }]);
  }

  return {
    keyboard: keyboardRows,
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

const collectsMenuKeyboard = {
  keyboard: [
    [{ text: "📥 Registrar Recolecta" }],
    [{ text: "Volver al Menú Principal 🔙" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

function getCollectsMenuKeyboard(db: any, assignmentId: number | undefined) {
  if (!assignmentId) {
    return collectsMenuKeyboard;
  }
  try {
    const pendingCountRow = db.prepare("SELECT COUNT(*) as count FROM ops_delivery_queue WHERE asignacion_id = ? AND entregado = 0 AND tipo_documento = 'recoger'").get(assignmentId) as { count: number } | undefined;
    const pendingCount = pendingCountRow?.count || 0;

    if (pendingCount === 0) {
      return {
        keyboard: [
          [{ text: "Volver al Menú Principal 🔙" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      };
    }
  } catch (e) {
    console.error("Error in getCollectsMenuKeyboard:", e);
  }
  return collectsMenuKeyboard;
}

function getDeliveryPreDepartKeyboard(db: any, assignmentId: number | undefined) {
  if (!assignmentId) {
    return deliveryPreDepartKeyboard;
  }
  try {
    const pendingCountRow = db.prepare("SELECT COUNT(*) as count FROM ops_delivery_queue WHERE asignacion_id = ? AND entregado = 0 AND tipo_documento <> 'recoger'").get(assignmentId) as { count: number } | undefined;
    const pendingCount = pendingCountRow?.count || 0;

    if (pendingCount === 0) {
      return {
        keyboard: [
          [{ text: "📥 Auto-Cargar Factura" }],
          [{ text: "Volver al Menú Principal 🔙" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      };
    }
  } catch (e) {
    console.error("Error in getDeliveryPreDepartKeyboard:", e);
  }
  return deliveryPreDepartKeyboard;
}

function getFlotaMenuKeyboard(linkage: any, hasMultipleModules: boolean, showRtv: boolean) {
  const keyboardRows: any[] = [];
  const isMechanic = linkage.isMechanic === true;

  if (isMechanic) {
    keyboardRows.push([{ text: "📋 Mis Tickets Abiertos" }, { text: "🛠️ Gestionar Ticket" }]);
    keyboardRows.push([{ text: "🛠️ Crear Ticket de Trabajo" }]);
    keyboardRows.push([{ text: "⛽ Combustible General (Flota)" }]);
    keyboardRows.push([{ text: "⚠️ Consultar Alertas" }]);
    keyboardRows.push([{ text: "⏳ Historial Mantenimientos" }]);
    if (showRtv) {
      keyboardRows.push([{ text: "📅 Consultar RTV" }]);
    }
  } else {
    if (linkage.allowFuel !== 0) {
      keyboardRows.push([{ text: "⛽ Registrar Combustible (Mi Vehículo)" }]);
    }
    if (linkage.allowMaintenance !== 0) {
      keyboardRows.push([{ text: "🔧 Reportar Avería (Mi Vehículo)" }]);
      keyboardRows.push([{ text: "⚠️ Alertas (Mi Vehículo)" }]);
      keyboardRows.push([{ text: "⏳ Historial (Mi Vehículo)" }]);
      if (showRtv) {
        keyboardRows.push([{ text: "📅 RTV (Mi Vehículo)" }]);
      }
    }
  }

  if (hasMultipleModules) {
    keyboardRows.push([{ text: "Volver al Menú Principal 🔙" }]);
  }

  return {
    keyboard: keyboardRows,
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function getWarehouseMenuKeyboard(linkage: any, hasMultipleModules: boolean) {
  const keyboardRows: any[] = [];
  
  if (linkage.allowWarehouse !== 0) {
    keyboardRows.push([{ text: "🔍 Consulta de Almacén" }]);
  }
  if (hasMultipleModules) {
    keyboardRows.push([{ text: "Volver al Menú Principal 🔙" }]);
  }

  return {
    keyboard: keyboardRows,
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function getDynamicMenuKeyboard(linkage: any) {
  if (!linkage) {
    return {
      keyboard: [[{ text: "Solicitar accesos 🔑" }]],
      resize_keyboard: true,
      one_time_keyboard: false
    };
  }

  const active = getActiveModules(linkage);
  if (active.length === 1) {
    const activeMod = active[0];
    if (activeMod === 'deliveries') {
      return getTransportesMenuKeyboard(linkage, false);
    } else if (activeMod === 'flota') {
      return getFlotaMenuKeyboard(linkage, false, getShowRtv());
    } else if (activeMod === 'warehouse') {
      return getWarehouseMenuKeyboard(linkage, false);
    }
  }

  const keyboardRows: any[] = [];
  if (linkage.allowDeliveries !== 0) {
    keyboardRows.push([{ text: "🚛 Transportes y Entregas" }]);
  }
  if (linkage.allowMaintenance !== 0 || linkage.allowFuel !== 0) {
    keyboardRows.push([{ text: "🛠️ Flota y Taller" }]);
  }
  if (linkage.allowWarehouse !== 0) {
    keyboardRows.push([{ text: "📦 Almacén" }]);
  }

  if (keyboardRows.length === 0) {
    keyboardRows.push([{ text: "Solicitar accesos 🔑" }]);
  }

  return {
    keyboard: keyboardRows,
    resize_keyboard: true,
    one_time_keyboard: false
  };
}
function safeJsonParse(data: any): any {
  if (!data) return {};
  if (typeof data !== 'string') return data;
  
  let cleaned = data.trim();
  if ((cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
    cleaned = cleaned.slice(1, -1);
  }
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return {};
  }
}

function getSubmenuForFlow(flow: string | null, tempData?: any): 'submenu_transportes' | 'submenu_flota' | 'submenu_warehouse' | null {
  if (!flow) return null;
  
  let parsedTempData = tempData;
  if (typeof tempData === 'string') {
    parsedTempData = safeJsonParse(tempData);
  }
  
  if (parsedTempData && parsedTempData.parentSubmenu) {
    return parsedTempData.parentSubmenu;
  }
  
  const transportesFlows = ['delivery_init', 'delivery_menu', 'deliveries', 'auto_load', 'finish_route', 'live_route'];
  const flotaFlows = [
    'fuel', 'mechanic_create_ticket', 'rtv_renewal', 'maint_log', 
    'close_ticket', 'consume_part', 'close_ticket_confirm',
    'vehicle_alerts', 'global_alerts', 'vehicle_history', 'rtv_query'
  ];
  const warehouseFlows = ['warehouse_search'];

  if (transportesFlows.includes(flow)) return 'submenu_transportes';
  if (flotaFlows.includes(flow)) return 'submenu_flota';
  if (warehouseFlows.includes(flow)) return 'submenu_warehouse';
  
  return null;
}

async function returnUserToSubmenu(chatIdStr: string, chatId: number | string, linkage: any, flow: string | null, messageText: string, botToken: string, stateTempData?: any) {
  const submenu = getSubmenuForFlow(flow, stateTempData);
  if (submenu && linkage) {
    const hasMultiple = getActiveModules(linkage).length > 1;
    let keyboard;
    if (submenu === 'submenu_transportes') {
      keyboard = getTransportesMenuKeyboard(linkage, hasMultiple);
    } else if (submenu === 'submenu_flota') {
      keyboard = getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv());
    } else {
      keyboard = getWarehouseMenuKeyboard(linkage, hasMultiple);
    }
    await saveTelegramState(chatIdStr, submenu, 'home', {});
    await sendTelegramMessage(botToken, chatId, messageText, keyboard);
  } else {
    await deleteTelegramState(chatIdStr);
    await sendTelegramMessage(botToken, chatId, messageText, getDynamicMenuKeyboard(linkage));
  }
}
const deliveryMenuKeyboard = {
  keyboard: [
    [{ text: "📝 Registrar Entrega" }],
    [{ text: "🏁 Finalizar Ruta" }],
    [{ text: "Volver al Menú Principal 🔙" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

const deliveryPreDepartKeyboard = {
  keyboard: [
    [{ text: "📥 Auto-Cargar Factura" }],
    [{ text: "🚀 Salir a Ruta" }],
    [{ text: "Volver al Menú Principal 🔙" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

function getDeliveryMenuKeyboard(db: any, assignmentId: number | undefined) {
  if (!assignmentId) {
    return deliveryMenuKeyboard;
  }
  try {
    const assRow = db.prepare("SELECT fecha_inicio_retorno FROM ops_delivery_assignments WHERE id = ?").get(assignmentId) as { fecha_inicio_retorno: string | null } | undefined;
    const hasStartedReturn = assRow?.fecha_inicio_retorno !== null && assRow?.fecha_inicio_retorno !== undefined;

    if (hasStartedReturn) {
      return {
        keyboard: [
          [{ text: "🏁 Registrar Llegada a Empresa" }],
          [{ text: "Volver al Menú Principal 🔙" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      };
    }

    const pendingCountRow = db.prepare("SELECT COUNT(*) as count FROM ops_delivery_queue WHERE asignacion_id = ? AND entregado = 0 AND tipo_documento <> 'recoger'").get(assignmentId) as { count: number } | undefined;
    const pendingCount = pendingCountRow?.count || 0;

    if (pendingCount === 0) {
      return {
        keyboard: [
          [{ text: "🚀 Completar Ruta y regresar" }],
          [{ text: "🏁 Finalizar Ruta" }],
          [{ text: "Volver al Menú Principal 🔙" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      };
    }
  } catch (e) {
    console.error("Error in getDeliveryMenuKeyboard:", e);
  }
  return deliveryMenuKeyboard;
}

function formatDocumentDetailMessage(match: any): string {
  if (match.tipo_documento === 'recoger') {
    try {
      const details = JSON.parse(match.comentario);
      const cleanPhone = (details.proveedor_contacto_telefono || '').replace(/\D/g, '');
      const whatsappPhone = cleanPhone.length === 8 ? '506' + cleanPhone : cleanPhone;
      const whatsappLink = `https://wa.me/${whatsappPhone}`;
      const metodoPagoLabel = details.metodo_pago === 'pagar_al_retirar' ? 'Pagar al retirar' : details.metodo_pago === 'ya_esta_pago' ? 'Ya está pago' : 'Crédito';
      const solicitante = details.en_nombre_de_companero ? `${details.companero_nombre} (solicitado por ${details.solicitante_nombre})` : details.solicitante_nombre;
      
      let geoInfo = '';
      if (details.provincia_nombre) geoInfo += `📍 Prov: <b>${details.provincia_nombre}</b>`;
      if (details.canton_nombre) geoInfo += ` | Cantón: <b>${details.canton_nombre}</b>`;
      if (details.distrito_nombre) geoInfo += ` | Dist: <b>${details.distrito_nombre}</b>`;
      if (geoInfo) geoInfo += '\n';

      const dirInfo = details.direccion_detalle ? `🗺️ Dirección Exacta: <b>${details.direccion_detalle}</b>\n` : '';

      return `📦 <b>SOLICITUD DE RETIRO / RECOLECTA</b>\n\n` +
             `📌 Consecutivo: <b>#${match.documento_numero}</b>\n` +
             `👤 Proveedor: <b>${match.cliente_nombre}</b>\n` +
             `📞 Contacto: <b>${details.proveedor_contacto_nombre}</b>\n` +
             `📱 Teléfono: <b>${details.proveedor_contacto_telefono}</b>\n` +
             `💬 WhatsApp: <a href="${whatsappLink}">Abrir Chat de WhatsApp</a>\n` +
             `🛒 Orden Compra: <b>${details.orden_compra || 'N/D'}</b>\n` +
             `📄 Factura Prov: <b>${details.factura || 'N/D'}</b>\n` +
             `💰 Método Pago: <b>${metodoPagoLabel}</b>\n` +
             `⏰ Horario Prov: <b>${details.horario_proveedor || 'N/D'}</b>\n` +
             `🏢 Lugar Entrega: <b>${details.lugar_entrega || 'N/D'}</b>\n` +
             geoInfo +
             dirInfo +
             `👤 Solicitante: <b>${solicitante}</b>\n` +
             `📝 Notas: <i>${details.detalle_adicional || 'Ninguna'}</i>\n\n` +
             `¿Deseas reportar el retiro de este proveedor?`;
    } catch (e) {
      return `📦 <b>Solicitud de Retiro #${match.documento_numero}</b>\n👤 Proveedor: <b>${match.cliente_nombre}</b>\n\n¿Deseas reportar el retiro de este proveedor?`;
    }
  }
  
  const typeLabel = match.tipo_documento === 'pedido' ? 'Pedido' : 'Factura';
  return `📋 <b>Documento Seleccionado</b>\n📌 ${typeLabel}: <b>#${match.documento_numero}</b>\n👤 Cliente: <b>${match.cliente_nombre}</b>\n\n¿Deseas reportar la entrega de este documento?`;
}

const alertsOptionsKeyboard = {
  keyboard: [
    [{ text: "Ver todas las alertas ⚠️" }],
    [{ text: "Lista de activos con alertas 🚨" }],
    [{ text: "Buscar por placa 🔍" }],
    [{ text: "Cancelar ❌" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
};

const cancelOnlyKeyboard = {
  keyboard: [
    [{ text: "Cancelar ❌" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
};

const searchQueryKeyboard = {
  keyboard: [
    [{ text: "👥 Seleccionar Cliente de Lista" }],
    [{ text: "Cancelar ❌" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
};

const plateQueryKeyboard = {
  keyboard: [
    [{ text: "👥 Seleccionar Placa de Lista" }],
    [{ text: "Cancelar ❌" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
};

const skipPhotoKeyboard = {
  keyboard: [
    [{ text: "Omitir foto ⏭️" }],
    [{ text: "Cancelar ❌" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
};

const confirmKeyboard = {
  keyboard: [
    [{ text: "Sí, registrar ✅" }, { text: "No, cancelar ❌" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
};

/**
 * Sends a message to a Telegram chat.
 */
async function sendTelegramMessage(botToken: string, chatId: string | number, text: string, replyMarkup?: any) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: any = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
    if (!res.ok) {
      console.error(`Error sending telegram message: ${res.statusText}`);
    }
  } catch (error) {
    console.error("Error sending telegram message:", error);
  }
}

async function sendFlowFallbackMessage(db: any, botToken: string, chatId: number, chatIdStr: string, state: any, linkage: any, userMessage?: string) {
  let fallbackMsg = `⚠️ <b>Opción inválida o no entendida.</b>\n\n` +
                    `Por favor, presiona los botones del menú de abajo. Si no los visualizas, puedes escribir o tocar los siguientes comandos directos:\n\n`;
  let keyboard: any = getDynamicMenuKeyboard(linkage);

  if (!state || !state.currentFlow || state.currentFlow === 'root' || state.currentFlow === 'home') {
    fallbackMsg += `🚛 /transportes - Módulo de Transportes y Entregas\n` +
                   `🛠️ /taller - Módulo de Flota y Taller\n` +
                   `📦 /almacen - Módulo de Almacén e Inventario`;
  } else if (state.currentFlow === 'submenu_transportes') {
    fallbackMsg += `📝 /entrega - Iniciar / Ver Entregas\n` +
                   `📦 /recolecta - Registrar Recolectas\n` +
                   `⛽ /combustible - Registrar Combustible\n` +
                   `🔧 /averia - Reportar Avería\n` +
                   `🔙 /menu - Volver al Menú Principal`;
    const hasMultiple = getActiveModules(linkage).length > 1;
    keyboard = getTransportesMenuKeyboard(linkage, hasMultiple);
  } else if (state.currentFlow === 'submenu_flota') {
    fallbackMsg += `📋 /tickets - Mis Tickets Abiertos\n` +
                   `⛽ /combustible - Registrar Combustible\n` +
                   `🔧 /averia - Reportar Avería\n` +
                   `🔙 /menu - Volver al Menú Principal`;
    const hasMultiple = getActiveModules(linkage).length > 1;
    keyboard = getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv());
  } else if (state.currentFlow === 'delivery_menu') {
    fallbackMsg += `📝 /entrega - Buscar y Registrar Entrega\n` +
                   `🏁 /finalizar - Finalizar Ruta / Jornada\n` +
                   `🔙 /menu - Volver al Menú Principal`;
    keyboard = getDeliveryMenuKeyboard(db, state.tempData?.assignmentId);
  } else if (state.currentFlow === 'collects_menu') {
    fallbackMsg += `📦 /recolecta - Buscar y Registrar Recolecta\n` +
                   `🏁 /finalizar - Finalizar Ruta / Jornada\n` +
                   `🔙 /menu - Volver al Menú Principal`;
    keyboard = getCollectsMenuKeyboard(db, state.tempData?.assignmentId);
  } else {
    fallbackMsg = `⚠️ <b>Entrada no válida o no entendida.</b>\n` +
                  `Por favor, selecciona una opción de los botones inferiores o escribe /cancelar para anular la operación actual:`;
    keyboard = cancelOnlyKeyboard;
  }

  if (userMessage && userMessage.trim()) {
    try {
      const { getAiHelp } = await import('@/modules/core/lib/ai-assistant-service');
      
      let flowContext = '';
      if (!state || !state.currentFlow || state.currentFlow === 'root' || state.currentFlow === 'home') {
        flowContext = 'El bot muestra el Menú Principal. Las opciones son: Transportes y Entregas, Taller y Flota, Almacén e Inventario.';
      } else if (state.currentFlow === 'submenu_transportes') {
        flowContext = 'El bot muestra el menú del módulo de Transportes y Entregas. Las opciones son: Registrar Entregas, Registrar Recolectas, Registrar Combustible, Reportar Avería.';
      } else if (state.currentFlow === 'submenu_flota') {
        flowContext = 'El bot muestra el menú del módulo de Flota y Taller. Las opciones son: Mis Tickets Abiertos, Registrar Combustible, Reportar Avería.';
      } else if (state.currentFlow === 'delivery_menu') {
        flowContext = 'El bot muestra el menú de la Entrega activa. Las opciones son: Buscar y Registrar Entrega, Finalizar Ruta/Jornada.';
      } else if (state.currentFlow === 'collects_menu') {
        flowContext = 'El bot muestra el menú de Recolectas. Las opciones son: Buscar y Registrar Recolecta, Finalizar Ruta/Jornada.';
      } else {
        // Enriquecer estados específicos para que la IA entienda el contexto humano de la pantalla
        let flowDesc = state.currentFlow;
        let stepDesc = state.step || 'esperando entrada';

        if (state.currentFlow === 'delivery_menu') {
          if (state.step === 'delivery_first_client') {
            flowDesc = 'Módulo de entregas. El bot le está pidiendo obligatoriamente al chofer que seleccione su primer cliente de la lista de botones inferiores para iniciar la ruta.';
          } else if (state.step === 'delivery_search_query') {
            flowDesc = 'Búsqueda de factura/pedido. El bot espera que el chofer digite los números finales del documento o que presione el botón "👥 Seleccionar Cliente de Lista".';
          } else if (state.step === 'delivery_autoload_query') {
            flowDesc = 'Auto-carga de facturas en bloque. El bot espera que el chofer escriba los números de facturas separados por comas para cargarlos a su camión.';
          } else if (state.step === 'delivery_await_evidence_photo') {
            flowDesc = 'Finalización de entrega. El bot está pidiendo al chofer que tome y envíe una foto como evidencia del reporte de entrega actual. Puede omitirla presionando el botón Omitir si el sistema lo permite.';
          }
        } else if (state.currentFlow === 'collects_menu') {
          if (state.step === 'collects_search_query') {
            flowDesc = 'Búsqueda de recolectas asignadas. El bot le pide al chofer los dígitos finales del número de recolección o presionar "👥 Seleccionar Proveedor de Lista".';
          }
        }

        flowContext = `El bot está en el flujo: "${flowDesc}". El paso actual es: "${stepDesc}". El bot espera que el usuario responda a la instrucción o elija una opción válida de la pantalla actual. Explícale amigablemente cómo continuar e indícale qué comandos o botones usar.`;
      }

      const aiResponse = await getAiHelp(flowContext, userMessage);
      if (aiResponse) {
        await sendTelegramMessage(botToken, chatId, `🤖 <b>Asistente de Ayuda:</b>\n\n${aiResponse}`, keyboard);
        return;
      }
    } catch (err) {
      console.error('Failed to get AI assistant help, falling back to standard fallback:', err);
    }
  }

  await sendTelegramMessage(botToken, chatId, fallbackMsg, keyboard);
}

/**
 * Sends a photo to a Telegram chat.
 */
async function sendTelegramPhoto(botToken: string, chatId: string | number, photoPath: string, caption?: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  try {
    if (!fs.existsSync(photoPath)) {
      console.error(`Photo file not found: ${photoPath}`);
      return;
    }
    const fileBuffer = fs.readFileSync(photoPath);
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('photo', blob, path.basename(photoPath));
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      cache: 'no-store'
    });
    if (!res.ok) {
      console.error(`Error sending telegram photo: ${res.statusText}`);
    }
  } catch (error) {
    console.error("Error sending telegram photo:", error);
  }
}

/**
 * Sends a keyboard containing all available vehicles in the database.
 */
async function sendPlatesSelectionKeyboard(botToken: string, chatId: string | number, promptText?: string) {
  try {
    const db = await getDb();
    const vehicles = db.prepare('SELECT plate FROM fleet_vehicles ORDER BY plate').all() as any[];
    
    if (vehicles.length === 0) {
      await sendTelegramMessage(botToken, chatId, "⚠️ No hay vehículos registrados en la flota para seleccionar. Por favor, escribe la placa manualmente:", cancelOnlyKeyboard);
      return;
    }

    const keyboardRows: any[][] = [];
    let currentRow: any[] = [];
    for (const vehicle of vehicles) {
      currentRow.push({ text: vehicle.plate });
      if (currentRow.length === 3) {
        keyboardRows.push(currentRow);
        currentRow = [];
      }
    }
    if (currentRow.length > 0) {
      keyboardRows.push(currentRow);
    }
    keyboardRows.push([{ text: "Cancelar ❌" }]);

    const platesKeyboard = {
      keyboard: keyboardRows,
      resize_keyboard: true,
      one_time_keyboard: true
    };

    const message = promptText || "📋 <b>Lista de vehículos disponibles:</b>\nPor favor, selecciona una placa o escribe la tuya directamente:";
    await sendTelegramMessage(botToken, chatId, message, platesKeyboard);
  } catch (err) {
    console.error("Error sending plates selection keyboard:", err);
    await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al cargar la lista de placas. Por favor, escribe la placa manualmente:", cancelOnlyKeyboard);
  }
}

/**
 * Sends a keyboard containing all active routes in the database.
 */
async function sendRoutesSelectionKeyboard(botToken: string, chatId: string | number, promptText?: string) {
  try {
    const db = await getDb();
    const routes = db.prepare('SELECT id, name FROM ops_delivery_routes WHERE active = 1 ORDER BY id').all() as any[];
    
    if (routes.length === 0) {
      await sendTelegramMessage(botToken, chatId, "⚠️ No hay rutas activas registradas en el sistema para seleccionar. Por favor escribe el número manualmente:", cancelOnlyKeyboard);
      return;
    }

    const keyboardRows: any[][] = [];
    let currentRow: any[] = [];
    for (const route of routes) {
      currentRow.push({ text: `${route.id} - ${route.name}` });
      if (currentRow.length === 2) {
        keyboardRows.push(currentRow);
        currentRow = [];
      }
    }
    if (currentRow.length > 0) {
      keyboardRows.push(currentRow);
    }
    keyboardRows.push([{ text: "Cancelar ❌" }]);

    const routesKeyboard = {
      keyboard: keyboardRows,
      resize_keyboard: true,
      one_time_keyboard: true
    };

    const message = promptText || "📋 <b>Lista de rutas disponibles:</b>\nPor favor, selecciona una ruta o digítala directamente:";
    await sendTelegramMessage(botToken, chatId, message, routesKeyboard);
  } catch (err) {
    console.error("Error sending routes selection keyboard:", err);
    await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al cargar la lista de rutas. Por favor escribe el número manualmente:", cancelOnlyKeyboard);
  }
}

/**
 * Dynamically resolves the delivery location address (EMBARCAR_A) of a document from Softland ERP headers or customer profiles.
 */
async function resolveDocumentLocation(db: any, docId: number): Promise<string> {
  try {
    const doc = db.prepare('SELECT documento_numero, tipo_documento, cliente_id FROM ops_delivery_queue WHERE id = ?').get(docId) as { documento_numero: string; tipo_documento: string; cliente_id: string } | undefined;
    if (!doc) return 'DIRECCIÓN GENERAL';
    
    if (doc.tipo_documento === 'factura') {
      const header = db.prepare('SELECT EMBARCAR_A, DIRECCION_FACTURA FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { EMBARCAR_A: string | null; DIRECCION_FACTURA: string | null } | undefined;
      const cleanLoc = (header?.EMBARCAR_A || header?.DIRECCION_FACTURA || '').trim();
      return cleanLoc || 'DIRECCIÓN GENERAL';
    }

    // Fallback for orders/others
    const customer = db.prepare('SELECT address FROM core_customers WHERE id = ?').get(doc.cliente_id) as { address: string | null } | undefined;
    const cleanAddr = (customer?.address || '').trim();
    return cleanAddr || 'DIRECCIÓN GENERAL';
  } catch (err) {
    console.error("Error in resolveDocumentLocation:", err);
    return 'DIRECCIÓN GENERAL';
  }
}

function parseDestinationLabel(label: string): { clientName: string, direccionId: string | null } {
  const match = label.match(/^(.*?)\s*\[([^\]]+)\]$/);
  if (match) {
    const clientName = match[1].trim();
    const addressPart = match[2].trim();
    const direccionId = addressPart.split('-')[0].trim();
    return { clientName, direccionId };
  }
  return { clientName: label.trim(), direccionId: null };
}

async function getPendingDestinations(db: any, assignmentId: number): Promise<{ label: string; clientName: string; direccionId: string; clientId: string }[]> {
  try {
    const pendingDocs = db.prepare(`
      SELECT q.id, q.cliente_id, q.cliente_nombre, q.documento_numero
      FROM ops_delivery_queue q
      WHERE q.asignacion_id = ? AND q.entregado = 0 AND q.tipo_documento <> 'recoger'
    `).all(assignmentId) as { id: number; cliente_id: string; cliente_nombre: string; documento_numero: string }[];

    if (pendingDocs.length === 0) return [];

    const destinationsMap = new Map<string, { label: string; clientName: string; direccionId: string; clientId: string }>();

    for (const doc of pendingDocs) {
      const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { DIREC_EMBARQUE: string | null } | undefined;
      const direccionId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();

      const key = `${doc.cliente_id.trim()}|${direccionId}`;
      if (!destinationsMap.has(key)) {
        const addrRow = db.prepare(`
          SELECT descripcion, detalle_direccion 
          FROM core_customer_shipment_addresses 
          WHERE cliente_id = ? AND direccion_id = ?
          LIMIT 1
        `).get(doc.cliente_id, direccionId) as { descripcion: string | null; detalle_direccion: string | null } | undefined;

        const description = (addrRow?.descripcion || addrRow?.detalle_direccion || '').trim();
        const clientNameClean = doc.cliente_nombre.trim();
        const clientIdClean = doc.cliente_id.trim();

        let label = `${clientIdClean} / ${direccionId} | ${clientNameClean}`;
        if (direccionId !== 'ND' && description) {
          label += ` [${description}]`;
        }

        // Limit button text length to 60 characters for clean horizontal display
        if (label.length > 60) {
          label = label.substring(0, 57) + '...';
        }

        destinationsMap.set(key, {
          label,
          clientName: clientNameClean,
          direccionId,
          clientId: clientIdClean
        });
      }
    }

    return Array.from(destinationsMap.values());
  } catch (err: any) {
    console.error("Error in getPendingDestinations:", err.message);
    return [];
  }
}

async function getPendingProviders(db: any, assignmentId: number): Promise<{ label: string; clientName: string; direccionId: string; clientId: string }[]> {
  try {
    const pendingDocs = db.prepare(`
      SELECT q.id, q.cliente_id, q.cliente_nombre, q.documento_numero
      FROM ops_delivery_queue q
      WHERE q.asignacion_id = ? AND q.entregado = 0 AND q.tipo_documento = 'recoger'
    `).all(assignmentId) as { id: number; cliente_id: string; cliente_nombre: string; documento_numero: string }[];

    if (pendingDocs.length === 0) return [];

    const destinationsMap = new Map<string, { label: string; clientName: string; direccionId: string; clientId: string }>();

    for (const doc of pendingDocs) {
      // In softland ERP invoices there might be DIREC_EMBARQUE, for standard returns/collects we check as well or default to ND
      const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { DIREC_EMBARQUE: string | null } | undefined;
      const direccionId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();

      const key = `${doc.cliente_id.trim()}|${direccionId}`;
      if (!destinationsMap.has(key)) {
        const addrRow = db.prepare(`
          SELECT descripcion, detalle_direccion 
          FROM core_customer_shipment_addresses 
          WHERE cliente_id = ? AND direccion_id = ?
          LIMIT 1
        `).get(doc.cliente_id, direccionId) as { descripcion: string | null; detalle_direccion: string | null } | undefined;

        const description = (addrRow?.descripcion || addrRow?.detalle_direccion || '').trim();
        const clientNameClean = doc.cliente_nombre.trim();
        const clientIdClean = doc.cliente_id.trim();

        let label = `${clientIdClean} / ${direccionId} | ${clientNameClean}`;
        if (direccionId !== 'ND' && description) {
          label += ` [${description}]`;
        }

        // Limit button text length to 60 characters for clean horizontal display
        if (label.length > 60) {
          label = label.substring(0, 57) + '...';
        }

        destinationsMap.set(key, {
          label,
          clientName: clientNameClean,
          direccionId,
          clientId: clientIdClean
        });
      }
    }

    return Array.from(destinationsMap.values());
  } catch (err: any) {
    console.error("Error in getPendingProviders:", err.message);
    return [];
  }
}

async function getNavigationLinks(db: any, assignmentId: number, clientNameOrText: string): Promise<string> {
  try {
    let matchedClientId: string | null = null;
    let matchedDireccionId: string | null = null;
    let clientName = clientNameOrText;
    let direccionId: string | null = null;

    const codePart = clientNameOrText.split('|')[0] || '';
    const codes = codePart.split('/').map((c: string) => c.trim());

    if (codes.length >= 2) {
      matchedClientId = codes[0];
      matchedDireccionId = codes[1];
    } else {
      const parsed = parseDestinationLabel(clientNameOrText);
      clientName = parsed.clientName;
      direccionId = parsed.direccionId;
    }

    let match: { cliente_id: string; documento_numero: string } | undefined;

    if (matchedClientId) {
      const docs = db.prepare(`
        SELECT q.cliente_id, q.documento_numero 
        FROM ops_delivery_queue q
        WHERE q.asignacion_id = ? AND q.entregado = 0 AND q.cliente_id = ?
      `).all(assignmentId, matchedClientId) as { cliente_id: string; documento_numero: string }[];

      for (const doc of docs) {
        const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { DIREC_EMBARQUE: string | null } | undefined;
        const docDirId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();
        if (matchedDireccionId && docDirId === matchedDireccionId) {
          match = doc;
          break;
        }
      }
    } else if (direccionId) {
      const docs = db.prepare(`
        SELECT q.cliente_id, q.documento_numero 
        FROM ops_delivery_queue q
        WHERE q.asignacion_id = ? AND q.entregado = 0 AND (q.cliente_nombre LIKE ? OR q.cliente_nombre = ?)
      `).all(assignmentId, `%${clientName}%`, clientName) as { cliente_id: string; documento_numero: string }[];

      for (const doc of docs) {
        const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(doc.documento_numero) as { DIREC_EMBARQUE: string | null } | undefined;
        const docDirId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();
        if (docDirId === direccionId) {
          match = doc;
          break;
        }
      }
    }

    if (!match) {
      if (matchedClientId) {
        match = db.prepare(`
          SELECT q.cliente_id, q.documento_numero 
          FROM ops_delivery_queue q
          WHERE q.asignacion_id = ? AND q.entregado = 0 AND q.cliente_id = ?
          LIMIT 1
        `).get(assignmentId, matchedClientId) as { cliente_id: string; documento_numero: string } | undefined;
      } else {
        match = db.prepare(`
          SELECT q.cliente_id, q.documento_numero 
          FROM ops_delivery_queue q
          WHERE q.asignacion_id = ? AND q.entregado = 0 AND (q.cliente_nombre LIKE ? OR q.cliente_nombre = ?)
          LIMIT 1
        `).get(assignmentId, `%${clientName}%`, clientName) as { cliente_id: string; documento_numero: string } | undefined;
      }
    }

    if (!match) return '';

    const invoiceHeader = db.prepare('SELECT CLIENTE, DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(match.documento_numero) as { CLIENTE: string; DIREC_EMBARQUE: string | null } | undefined;
    const clienteId = invoiceHeader?.CLIENTE || match.cliente_id;
    const resolvedDirId = matchedDireccionId || direccionId || (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();

    const coords = db.prepare(`
      SELECT latitude, longitude, detalle_direccion 
      FROM core_customer_shipment_addresses 
      WHERE cliente_id = ? AND direccion_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
      LIMIT 1
    `).get(clienteId, resolvedDirId) as { latitude: number; longitude: number; detalle_direccion: string | null } | undefined;

    if (coords) {
      const { latitude: lat, longitude: lng, detalle_direccion: addr } = coords;
      let text = `\n\n🗺️ <b>Navegación para entrega (${resolvedDirId}):</b>\n`;
      if (addr) text += `📍 <i>${addr}</i>\n`;
      text += `🚙 <a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes">Navegar con Waze</a>\n`;
      text += `📍 <a href="https://maps.google.com/?q=${lat},${lng}">Navegar con Google Maps</a>`;
      return text;
    }
  } catch (err: any) {
    console.error("Error generating navigation links:", err.message);
  }
  return '';
}



/**
 * Downloads a photo from Telegram servers and saves it to the local fleet_uploads folder.
 */
async function downloadTelegramFile(botToken: string, fileId: string): Promise<string> {
  const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const response = await fetch(getFileUrl, { method: 'GET', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to get file info from Telegram: ${response.statusText}`);
  }
  const fileData = await response.json();
  if (!fileData.ok || !fileData.result?.file_path) {
    throw new Error(fileData.description || 'Failed to get file info from Telegram.');
  }

  const filePath = fileData.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  
  const downloadResponse = await fetch(downloadUrl, { method: 'GET', cache: 'no-store' });
  if (!downloadResponse.ok) {
    throw new Error(`Failed to download file from Telegram: ${downloadResponse.statusText}`);
  }
  
  const arrayBuffer = await downloadResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save buffer to fleet_uploads
  const UPLOAD_DIR = path.join(process.cwd(), 'fleet_uploads');
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const fileExtension = path.extname(filePath) || '.jpg';
  const fileName = `${crypto.randomUUID()}${fileExtension}`;
  const localFilePath = path.join(UPLOAD_DIR, fileName);

  fs.writeFileSync(localFilePath, buffer);
  return fileName;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.substring(0, 10).split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  } catch (e) {}
  return dateStr;
}

async function checkVehicleAlerts(vehicle: any, db: any) {
  const alerts: string[] = [];
  const warnings: string[] = [];
  const controls: { name: string; status: string; detail: string }[] = [];

  // 1. OIL
  const currentMileage = vehicle.currentMileage || 0;
  const lastOilChangeMileage = vehicle.lastOilChangeMileage || 0;
  const mileageSinceLast = currentMileage - lastOilChangeMileage;
  const oilInterval = vehicle.oilChangeInterval || 10000;
  const oilProgress = Math.round((mileageSinceLast / oilInterval) * 100);
  const remainingOil = oilInterval - mileageSinceLast;
  
  if (oilProgress >= 100) {
    alerts.push(`🔴 <b>Aceite Vencido:</b> ${oilProgress}% de uso (${mileageSinceLast.toLocaleString('es-CR')} km de ${oilInterval.toLocaleString('es-CR')} km | Vencido hace ${Math.abs(remainingOil).toLocaleString('es-CR')} km).`);
    controls.push({ name: "🛢️ Cambio de Aceite", status: "🔴 Vencido", detail: `${oilProgress}% (${mileageSinceLast.toLocaleString('es-CR')}/${oilInterval.toLocaleString('es-CR')} km)` });
  } else if (oilProgress >= 90) {
    warnings.push(`🟡 <b>Aceite Próximo:</b> ${oilProgress}% de uso (Faltan ${remainingOil.toLocaleString('es-CR')} km).`);
    controls.push({ name: "🛢️ Cambio de Aceite", status: "🟡 Próximo", detail: `${oilProgress}% (Faltan ${remainingOil.toLocaleString('es-CR')} km)` });
  } else {
    controls.push({ name: "🛢️ Cambio de Aceite", status: "🟢 Al día", detail: `${oilProgress}% (${mileageSinceLast.toLocaleString('es-CR')}/${oilInterval.toLocaleString('es-CR')} km)` });
  }

  // 2. PREVENTATIVE PLANS
  try {
    const plans = db.prepare('SELECT * FROM fleet_preventative_plans WHERE vehicleId = ?').all(vehicle.id) as any[];
    for (const plan of plans) {
      const currentVal = (plan.intervalUnit === 'hours' && vehicle.odometerUnit !== 'hr') ? (vehicle.currentHours || 0) : currentMileage;
      const diff = currentVal - (plan.lastPerformedValue || 0);
      const planProgress = Math.round((diff / plan.intervalValue) * 100);
      const remaining = plan.intervalValue - diff;
      const unit = plan.intervalUnit || 'km';

      if (planProgress >= 100) {
        alerts.push(`🔴 <b>Plan Vencido [${plan.maintenanceType}]:</b> ${planProgress}% de uso (${diff.toLocaleString('es-CR')} ${unit} de ${plan.intervalValue.toLocaleString('es-CR')} ${unit} | Vencido hace ${Math.abs(remaining).toLocaleString('es-CR')} ${unit}).`);
        controls.push({ name: `🔧 Plan: ${plan.maintenanceType}`, status: "🔴 Vencido", detail: `${planProgress}% (${diff.toLocaleString('es-CR')}/${plan.intervalValue.toLocaleString('es-CR')} ${unit})` });
      } else if (planProgress >= 90) {
        warnings.push(`🟡 <b>Plan Próximo [${plan.maintenanceType}]:</b> ${planProgress}% de uso (Faltan ${remaining.toLocaleString('es-CR')} ${unit}).`);
        controls.push({ name: `🔧 Plan: ${plan.maintenanceType}`, status: "🟡 Próximo", detail: `${planProgress}% (Faltan ${remaining.toLocaleString('es-CR')} ${unit})` });
      } else {
        controls.push({ name: `🔧 Plan: ${plan.maintenanceType}`, status: "🟢 Al día", detail: `${planProgress}% (${diff.toLocaleString('es-CR')}/${plan.intervalValue.toLocaleString('es-CR')} ${unit})` });
      }
    }
  } catch (e) {
    console.error("Error checking preventative plans alerts:", e);
  }

  // 3. RTV
  if (vehicle.rtvExpiration) {
    try {
      const rtvDate = new Date(vehicle.rtvExpiration);
      const today = new Date();
      // Set hours to zero for pure date comparison
      rtvDate.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      const diffTime = rtvDate.getTime() - today.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const formattedDate = formatDate(vehicle.rtvExpiration);

      if (daysLeft <= 0) {
        alerts.push(`🔴 <b>RTV Expirado:</b> Venció el ${formattedDate} (hace ${Math.abs(daysLeft)} días).`);
        controls.push({ name: "🚙 Revisión Técnica (RTV)", status: "🔴 Expirado", detail: `Venció el ${formattedDate}` });
      } else if (daysLeft <= 60) {
        warnings.push(`🟡 <b>RTV Próxima:</b> Vence el ${formattedDate} (${daysLeft} días restantes).`);
        controls.push({ name: "🚙 Revisión Técnica (RTV)", status: "🟡 Próximo", detail: `Vence el ${formattedDate} (${daysLeft} d)` });
      } else {
        controls.push({ name: "🚙 Revisión Técnica (RTV)", status: "🟢 Vigente", detail: `Vence el ${formattedDate} (${daysLeft} d)` });
      }
    } catch (e) {
      console.error("Error processing RTV date:", e);
    }
  } else {
    controls.push({ name: "🚙 Revisión Técnica (RTV)", status: "⚪ No configurado", detail: "N/A" });
  }

  // 4. PERMITS
  try {
    const permits = db.prepare('SELECT * FROM fleet_permits WHERE vehicleId = ?').all(vehicle.id) as any[];
    for (const permit of permits) {
      if (permit.expirationDate) {
        const permitDate = new Date(permit.expirationDate);
        const today = new Date();
        permitDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        const diffTime = permitDate.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const formattedDate = formatDate(permit.expirationDate);

        if (daysLeft <= 0) {
          alerts.push(`🔴 <b>Permiso Expirado [${permit.type}]:</b> Venció el ${formattedDate} (hace ${Math.abs(daysLeft)} días).`);
          controls.push({ name: `📜 Permiso: ${permit.type}`, status: "🔴 Expirado", detail: `Venció el ${formattedDate}` });
        } else if (daysLeft <= 60) {
          warnings.push(`🟡 <b>Permiso Próximo [${permit.type}]:</b> Vence el ${formattedDate} (${daysLeft} días restantes).`);
          controls.push({ name: `📜 Permiso: ${permit.type}`, status: "🟡 Próximo", detail: `Vence el ${formattedDate} (${daysLeft} d)` });
        } else {
          controls.push({ name: `📜 Permiso: ${permit.type}`, status: "🟢 Vigente", detail: `Vence el ${formattedDate} (${daysLeft} d)` });
        }
      }
    }
  } catch (e) {
    console.error("Error checking permits alerts:", e);
  }

  return { alerts, warnings, controls };
}

async function startBatchSequentialReporting(chatIdStr: string, chatId: any, botToken: string, tempData: any) {
  const currentDocId = tempData.suggestedDocIds[tempData.batchIndex];
  const currentDocNum = tempData.suggestedDocNums[tempData.batchIndex];
  tempData.docId = currentDocId;
  tempData.docNum = currentDocNum;
  
  const db = await getDb();
  db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?').run(new Date().toISOString(), chatIdStr, currentDocId);
  
  await saveTelegramState(chatIdStr, 'delivery_batch_sequence', 'ask_status', tempData);
  
  const selectStatusKeyboard = {
    keyboard: [
      [{ text: "Completo ✅" }],
      [{ text: "Incompleto ⚠️" }, { text: "Rechazado ❌" }],
      [{ text: "Omitir esta factura ⏭️" }],
      [{ text: "Salir del Lote 🔙" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
  
  await sendTelegramMessage(
    botToken,
    chatId,
    `✏️ <b>Reporte de Lote: Factura ${tempData.batchIndex + 1} de ${tempData.suggestedDocIds.length}</b>\n` +
    `Documento: <b>#${currentDocNum}</b>\n` +
    `Cliente: <b>${tempData.nextClientName}</b>\n\n` +
    `¿Cuál es el estado de entrega para esta factura?`,
    selectStatusKeyboard
  );
}

async function advanceBatchSequentialReporting(db: any, chatIdStr: string, chatId: any, botToken: string, linkage: any, tempData: any) {
  db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
  
  tempData.batchIndex += 1;
  if (tempData.batchIndex >= tempData.suggestedDocIds.length) {
    db.prepare("UPDATE ops_delivery_assignments SET siguiente_cliente = NULL, siguiente_cliente_fecha = NULL WHERE id = ?").run(tempData.assignmentId);
    await transitionToNextDestinationStep(db, chatIdStr, chatId, botToken, linkage, tempData, `🎉 <b>¡Lote finalizado!</b> Se han procesado todos los documentos para este cliente.`);
  } else {
    await startBatchSequentialReporting(chatIdStr, chatId, botToken, tempData);
  }
}

async function transitionToNextDestinationStep(db: any, chatIdStr: string, chatId: any, botToken: string, linkage: any, tempData: any, leadMessage: string) {
  const pendingCountRow = db.prepare("SELECT COUNT(*) as count FROM ops_delivery_queue WHERE asignacion_id = ? AND entregado = 0 AND tipo_documento <> 'recoger'").get(tempData.assignmentId) as { count: number } | undefined;
  const pendingCount = pendingCountRow?.count || 0;

  if (pendingCount === 0) {
    const askReturnLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_return_location'").get() as { value: string } | undefined;
    const isMandatory = askReturnLocRow?.value === 'mandatory';

    await saveTelegramState(chatIdStr, 'delivery_await_return_location', 'wait_gps_return', tempData);

    const locationKeyboard = {
      keyboard: [
        [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
        ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
        [{ text: "Volver al Menú Principal 🔙" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };

    await sendTelegramMessage(
      botToken,
      chatId,
      `${leadMessage}\n\n🎉 <b>¡Excelente trabajo!</b> Has completado todas las entregas asignadas a tu ruta.\n\n📍 <b>Inicio de Retorno: Geolocalización</b>\n` +
      `Por favor comparte tu ubicación GPS actual utilizando el botón de abajo para registrar tu salida de regreso a la empresa:` +
      (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
      locationKeyboard
    );
    return;
  }

  const askNextRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_next_client'").get() as { value: string } | undefined;
  const askNext = askNextRow?.value !== 'false';
  
  if (!askNext) {
    await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
    await sendTelegramMessage(botToken, chatId, `${leadMessage}\n\nVolviendo al menú de entregas.`, getDeliveryMenuKeyboard(db, tempData.assignmentId));
    return;
  }
  
  const mandatoryRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_next_client_mandatory'").get() as { value: string } | undefined;
  const isMandatory = mandatoryRow?.value === 'true';
  
  await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_next_destination_init', tempData);
  
  const keys = [
    [{ text: "📋 Seleccionar de Lista" }],
    [{ text: "✍️ Digitar Factura / Pedido" }]
  ];
  if (!isMandatory) {
    keys.push([{ text: "⏭️ Omitir" }]);
  }
  
  const nextDestKeyboard = {
    keyboard: keys,
    resize_keyboard: true,
    one_time_keyboard: true
  };
  
  await sendTelegramMessage(
    botToken,
    chatId,
    `${leadMessage}\n\n📍 <b>Siguiente parada:</b>\n¿Hacia qué cliente te diriges ahora? Por favor, selecciona una opción:`,
    nextDestKeyboard
  );
}

async function sendSearchQueryPrompt(db: any, botToken: string, chatId: any, chatIdStr: string, tempData: any, type: 'factura' | 'pedido', printSlashList: boolean = false) {
  tempData.searchType = type;
  await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_query', tempData);

  const keyboardButtons: any[][] = [
    [{ text: "👥 Seleccionar Cliente de Lista" }],
    [{ text: "📄 Seleccionar Documento de Lista" }],
    [{ text: "Cancelar ❌" }]
  ];

  const dynamicSearchKeyboard = {
    keyboard: keyboardButtons,
    resize_keyboard: true,
    one_time_keyboard: true
  };

  const typeLabel = type === 'factura' ? 'Factura' : 'Pedido';
  let msg = `📋 <b>Buscar ${typeLabel}</b>\n` +
    `Por favor, selecciona una opción del Menú abajo o escribe los <b>dígitos finales</b> de la ${typeLabel.toLowerCase()}:`;

  if (printSlashList) {
    const pendingDocs = db.prepare(`
      SELECT id, documento_numero, cliente_nombre FROM ops_delivery_queue
      WHERE asignacion_id = ? AND estado IN ('pendiente', 'en_ruta') AND entregado = 0 AND tipo_documento = ?
    `).all(tempData.assignmentId, type) as { id: number, documento_numero: string, cliente_nombre: string }[];

    if (pendingDocs.length > 0) {
      msg += `\n\n📄 <b>${typeLabel}s Pendientes:</b>\n`;
      for (const d of pendingDocs) {
        msg += `• /doc_${d.documento_numero} - ${d.cliente_nombre}\n`;
      }
      msg += `\n<i>(Toca cualquier comando anterior para seleccionar el documento)</i>`;
    } else {
      msg += `\n\n⚠️ No tienes ${typeLabel.toLowerCase()}s pendientes hoy.`;
    }
  }

  await sendTelegramMessage(botToken, chatId, msg, dynamicSearchKeyboard);
}

async function executeFinalizeDelivery(db: any, chatIdStr: string, chatId: any, botToken: string, linkage: any, tempData: any, finalStateData: any) {
  const docIds = tempData.isBatchCompletion && tempData.batchDocIds ? tempData.batchDocIds : [tempData.docId];

  for (const docId of docIds) {
    const docFotoFactura = (tempData.isBatchCompletion && tempData.batchInvoicePhotos)
      ? tempData.batchInvoicePhotos[docId]
      : tempData.fotoFactura;

    // Update delivery queue status
    await updateDeliveryStatusInternal(docId, {
      estado: finalStateData.estado,
      comentario: finalStateData.comentario || '',
      canal: 'telegram',
      gestionadoPor: linkage.employeeName || 'Chofer',
      releaseCodeId: finalStateData.releaseCodeId,
      lines: finalStateData.lines,
      fotoEvidencia: tempData.fotoEvidencia || null,
      fotoFactura: docFotoFactura || null
    });

    // Save coordinates if we received them
    if (tempData.latitud && tempData.longitud) {
      db.prepare(`
        UPDATE ops_delivery_queue
        SET latitud = ?, longitud = ?
        WHERE id = ?
      `).run(tempData.latitud, tempData.longitud, docId);

      try {
        const docRow = db.prepare('SELECT cliente_id, documento_numero FROM ops_delivery_queue WHERE id = ?').get(docId) as { cliente_id: string; documento_numero: string } | undefined;
        if (docRow) {
          const invoiceHeader = db.prepare('SELECT CLIENTE, DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(docRow.documento_numero) as { CLIENTE: string; DIREC_EMBARQUE: string | null } | undefined;
          const clienteId = invoiceHeader?.CLIENTE || docRow.cliente_id;
          const direccionId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();

          if (clienteId && direccionId) {
            db.prepare(`
              INSERT INTO core_customer_shipment_addresses (
                cliente_id, direccion_id, latitude, longitude
              ) VALUES (
                ?, ?, ?, ?
              ) ON CONFLICT(cliente_id, direccion_id) DO UPDATE SET
                latitude = excluded.latitude,
                longitude = excluded.longitude
              WHERE latitude IS NULL
            `).run(clienteId, direccionId, tempData.latitud, tempData.longitud);
            console.log(`[BOT-GPS] Linked coordinates (${tempData.latitud}, ${tempData.longitud}) to client ${clienteId} address ${direccionId}`);
          }
        }
      } catch (gpsErr: any) {
        console.error("Error linking GPS coordinates to customer shipment address:", gpsErr.message);
      }
    }

    // Save Telegram Bot Log
    const docRow = db.prepare("SELECT documento_numero FROM ops_delivery_queue WHERE id = ?").get(docId) as { documento_numero: string } | undefined;
    const docNum = docRow?.documento_numero || String(docId);
    let logMsg = `Entrega registrada como ${finalStateData.estado.toUpperCase()} para el documento #${docNum}.`;
    if (finalStateData.comentario) logMsg += ` Motivo: ${finalStateData.comentario}`;
    if (tempData.latitud) logMsg += ` (GPS Registrado)`;
    await saveTelegramBotLog(db, tempData.vehicleId || 1, 'delivery', linkage.employeeName || 'Chofer', logMsg);

    // Clear Telegram lock for this document
    db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(docId);

    // Re-inject clone if incomplete and advanced
    if (finalStateData.estado === 'incompleto' && finalStateData.flowType === 'advanced') {
      try {
        db.prepare(`
            INSERT INTO ops_delivery_queue (documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por, fecha_registro, entregado, estado)
            VALUES (?, ?, ?, ?, ?, ?, 0, 'pendiente')
        `).run(
            docNum + '-PARTIAL',
            tempData.searchType || 'factura',
            (db.prepare('SELECT cliente_id FROM ops_delivery_queue WHERE id = ?').get(docId) as any)?.cliente_id || 'CLIENTE_ERP',
            tempData.cliente || 'Cliente ERP',
            tempData.creadoPor || 'ERP_SYNC',
            await getBusinessDateStr()
          );
      } catch (e: any) {
        console.error("Error re-injecting partial advanced delivery in executeFinalizeDelivery:", e.message);
      }
    }
  }

  // Clear next client from assignment since it's now completed
  if (tempData.assignmentId) {
    db.prepare("UPDATE ops_delivery_assignments SET siguiente_cliente = NULL, siguiente_cliente_fecha = NULL WHERE id = ?").run(tempData.assignmentId);
  }

  // Transition to next step
  if (tempData.isBatchCompletion) {
    const successMsg = `🟢 <b>¡Lote Procesado con Éxito!</b> Se registraron las ${docIds.length} facturas como entregadas al 100%.`;
    // Clear GPS, Photos and Batch variables from tempData to avoid caching them in consecutive deliveries
    delete tempData.latitud;
    delete tempData.longitud;
    delete tempData.fotoEvidencia;
    delete tempData.fotoFactura;
    delete tempData.isBatchCompletion;
    delete tempData.batchDocIds;
    delete tempData.batchDocNums;
    delete tempData.suggestedDocIds;
    delete tempData.suggestedDocNums;
    delete tempData.finalStateData;
    delete tempData.batchInvoicePhotos;
    delete tempData.activeInvoicePhotoDocId;
    await transitionToNextDestinationStep(db, chatIdStr, chatId, botToken, linkage, tempData, successMsg);
  } else if (finalStateData.flowType === 'sequential') {
    // Keep batch variables since sequence is in progress, but reset current doc photos
    delete tempData.latitud;
    delete tempData.longitud;
    delete tempData.fotoEvidencia;
    delete tempData.fotoFactura;
    await advanceBatchSequentialReporting(db, chatIdStr, chatId, botToken, linkage, tempData);
  } else {
    // 'simple' or 'advanced' (single search flow)
    const savedDocId = tempData.docId; // Keep to look up address
    const isPickup = tempData.docType === 'recoger';
    
    const successMsg = isPickup
      ? `🟢 <b>¡Recolecta Reportada con Éxito!</b> El retiro del proveedor #${tempData.docNum} se actualizó en el sistema.`
      : (finalStateData.flowType === 'advanced'
        ? `👍 Mermas de artículo y cantidades guardadas exitosamente para #${tempData.docNum}.`
        : `🟢 <b>¡Reporte Procesado con Éxito!</b> El documento #${tempData.docNum} se actualizó en el sistema.`);

    // Reset variables
    delete tempData.latitud;
    delete tempData.longitud;
    delete tempData.fotoEvidencia;
    delete tempData.fotoFactura;

    if (isPickup) {
      delete tempData.finalStateData;
      await saveTelegramState(chatIdStr, 'collects_menu', 'collects_menu_home', tempData);
      await sendTelegramMessage(botToken, chatId, successMsg, getCollectsMenuKeyboard(db, tempData.assignmentId));
      return;
    }

    const diverted = await checkAndPromptBoletaEmail(db, chatIdStr, chatId, botToken, linkage, tempData, finalStateData, successMsg);
    delete tempData.finalStateData;
    if (diverted) {
      return;
    }

    try {
      // Resolve current physical location address
      const currentLoc = await resolveDocumentLocation(db, savedDocId);

      // Search for any other pending documents in the same physical sucursal address
      const nextPendingSameLoc = db.prepare(`
        SELECT q.id, q.documento_numero, q.tipo_documento, q.cliente_nombre
        FROM ops_delivery_queue q
        LEFT JOIN core_erp_invoice_headers h ON q.documento_numero = h.FACTURA
        WHERE q.asignacion_id = ? AND q.entregado = 0 AND q.id <> ? AND q.cliente_nombre = ? 
          AND (h.EMBARCAR_A = ? OR (h.EMBARCAR_A IS NULL AND ? = 'DIRECCIÓN GENERAL'))
        LIMIT 1
      `).get(tempData.assignmentId, savedDocId, tempData.cliente, currentLoc, currentLoc) as { id: number; documento_numero: string; tipo_documento: string } | undefined;

      if (nextPendingSameLoc) {
        // Safe transition: save the next document details and ask the driver
        tempData.nextSameLocDocId = nextPendingSameLoc.id;
        tempData.nextSameLocDocNum = nextPendingSameLoc.documento_numero;
        tempData.nextSameLocDocType = nextPendingSameLoc.tipo_documento;
        tempData.currentLocName = currentLoc;

        await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_location_cadenamiento', tempData);

        const sameLocKeyboard = {
          keyboard: [
            [{ text: `👍 Sí, reportar #${nextPendingSameLoc.documento_numero}` }],
            [{ text: "⏭️ Reportar después" }],
            [{ text: "Cancelar ❌" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        };

        await sendTelegramMessage(
          botToken,
          chatId,
          `${successMsg}\n\n📍 <b>Sigues en la ubicación:</b> <code>${currentLoc}</code>\nTienes otro documento pendiente aquí del mismo cliente:\n• <b>#${nextPendingSameLoc.documento_numero}</b> (${nextPendingSameLoc.tipo_documento === 'pedido' ? 'Pedido' : 'Factura'})\n\n¿Deseas registrar su entrega ahora?`,
          sameLocKeyboard
        );
        return;
      }
    } catch (transErr) {
      console.error("Error in location cadenamiento lookup:", transErr);
    }

    // Default transition fallback if no other documents share the same sucursal location
    await transitionToNextDestinationStep(db, chatIdStr, chatId, botToken, linkage, tempData, successMsg);
  }
}

async function checkAndPromptBoletaEmail(db: any, chatIdStr: string, chatId: any, botToken: string, linkage: any, tempData: any, finalStateData: any, successMsg: string) {
  const isIncidence = finalStateData.estado === 'incompleto' || finalStateData.estado === 'rechazado';
  if (isIncidence && !tempData.isBatchCompletion) {
    tempData.boletaSuccessMsg = successMsg;
    tempData.boletaDocId = tempData.docId;
    tempData.boletaDocNum = tempData.docNum;
    tempData.boletaClienteId = (db.prepare('SELECT cliente_id FROM ops_delivery_queue WHERE id = ?').get(tempData.docId) as any)?.cliente_id || 'CLIENTE_ERP';

    let previousEmails: string[] = [];
    try {
      const rows = db.prepare('SELECT email FROM ops_client_emails WHERE cliente_id = ? ORDER BY id DESC LIMIT 3').all(tempData.boletaClienteId) as { email: string }[];
      previousEmails = rows.map(r => r.email);
    } catch (e) {
      console.error("Error fetching emails for telegram suggestion:", e);
    }

    await saveTelegramState(chatIdStr, 'delivery_menu', 'awaiting_boleta_email_choice', tempData);

    const keyboardRows: any[][] = [];
    previousEmails.forEach(email => {
      keyboardRows.push([{ text: `📧 Enviar a: ${email}` }]);
    });
    keyboardRows.push([{ text: "✍️ Digitar otro correo" }]);
    keyboardRows.push([{ text: "⏭️ Omitir / No enviar" }]);

    const keyboard = {
      keyboard: keyboardRows,
      resize_keyboard: true,
      one_time_keyboard: true
    };

    const promptText = `✉️ <b>¿Desea enviar la Boleta Digital al cliente?</b>\n` +
      `Se ha registrado una incidencia (${finalStateData.estado === 'incompleto' ? 'Entrega Incompleta' : 'Rechazado'}).\n` +
      `Seleccione uno de los correos sugeridos o digite uno nuevo para enviar el comprobante:`;

    await sendTelegramMessage(botToken, chatId, promptText, keyboard);
    return true;
  }
  return false;
}

async function proceedAfterBoletaEmail(db: any, chatIdStr: string, chatId: any, botToken: string, linkage: any, tempData: any) {
  const successMsg = tempData.boletaSuccessMsg || `🟢 <b>¡Reporte Procesado con Éxito!</b>`;
  const savedDocId = tempData.boletaDocId;
  const docNum = tempData.boletaDocNum;

  delete tempData.boletaSuccessMsg;
  delete tempData.boletaDocId;
  delete tempData.boletaDocNum;
  delete tempData.boletaClienteId;

  try {
    const currentLoc = await resolveDocumentLocation(db, savedDocId);
    const nextPendingSameLoc = db.prepare(`
      SELECT q.id, q.documento_numero, q.tipo_documento, q.cliente_nombre
      FROM ops_delivery_queue q
      LEFT JOIN core_erp_invoice_headers h ON q.documento_numero = h.FACTURA
      WHERE q.asignacion_id = ? AND q.entregado = 0 AND q.id <> ? AND q.cliente_nombre = ? 
        AND (h.EMBARCAR_A = ? OR (h.EMBARCAR_A IS NULL AND ? = 'DIRECCIÓN GENERAL'))
      LIMIT 1
    `).get(tempData.assignmentId, savedDocId, tempData.cliente, currentLoc, currentLoc) as { id: number; documento_numero: string; tipo_documento: string } | undefined;

    if (nextPendingSameLoc) {
      tempData.nextSameLocDocId = nextPendingSameLoc.id;
      tempData.nextSameLocDocNum = nextPendingSameLoc.documento_numero;
      tempData.nextSameLocDocType = nextPendingSameLoc.tipo_documento;
      tempData.currentLocName = currentLoc;

      await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_location_cadenamiento', tempData);

      const sameLocKeyboard = {
        keyboard: [
          [{ text: `👍 Sí, reportar #${nextPendingSameLoc.documento_numero}` }],
          [{ text: "⏭️ Reportar después" }],
          [{ text: "Cancelar ❌" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      };

      await sendTelegramMessage(
        botToken,
        chatId,
        `${successMsg}\n\n📍 <b>Sigues en la ubicación:</b> <code>${currentLoc}</code>\nTienes otro documento pendiente aquí del mismo cliente:\n• <b>#${nextPendingSameLoc.documento_numero}</b> (${nextPendingSameLoc.tipo_documento === 'pedido' ? 'Pedido' : 'Factura'})\n\n¿Deseas registrar su entrega ahora?`,
        sameLocKeyboard
      );
      return;
    }
  } catch (transErr) {
    console.error("Error in post-boleta location cadenamiento lookup:", transErr);
  }

  await transitionToNextDestinationStep(db, chatIdStr, chatId, botToken, linkage, tempData, successMsg);
}

async function runNextFinalizeStep(db: any, chatIdStr: string, chatId: any, botToken: string, linkage: any, tempData: any) {
  const finalStateData = tempData.finalStateData;
  if (!finalStateData) {
    await sendTelegramMessage(botToken, chatId, "❌ Error: Datos de finalización perdidos.", getDynamicMenuKeyboard(linkage));
    return;
  }

  // 1. Evidence Photo Step Check
  const reqEvidencePhotoRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_require_evidence_photo'").get() as { value: string } | undefined;
  const reqEvidencePhoto = reqEvidencePhotoRow?.value || 'disabled';

  if (reqEvidencePhoto !== 'disabled' && tempData.fotoEvidencia === undefined) {
    const flowName = tempData.docType === 'recoger' ? 'collects_menu' : 'delivery_menu';
    await saveTelegramState(chatIdStr, flowName, 'delivery_await_evidence_photo', tempData);

    const isMandatory = reqEvidencePhoto === 'mandatory';
    const photoKeyboard = {
      keyboard: [
        ...(isMandatory ? [] : [[{ text: "Omitir foto de evidencia ⏭️" }]]),
        [{ text: "Volver al Menú Principal 🔙" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };

    let msg = '';
    if (tempData.docType === 'recoger') {
      msg = `📸 <b>Evidencia de Recolecta Requerida</b>\n`;
      if (finalStateData.estado === 'completo') {
        msg += `Por favor, toma y envía una foto como evidencia del retiro exitoso para el proveedor <b>#${tempData.docNum}</b>:`;
      } else {
        msg += `Por favor, toma y envía una foto de evidencia que justifique por qué no se pudo realizar la recolecta del proveedor <b>#${tempData.docNum}</b>:`;
      }
    } else {
      msg = `📸 <b>Evidencia de Entrega Requerida</b>\n`;
      if (finalStateData.estado === 'completo') {
        msg += `Por favor, toma y envía una foto como evidencia de la entrega exitosa para la factura <b>#${tempData.docNum}</b>:`;
      } else if (finalStateData.estado === 'incompleto') {
        msg += `Por favor, toma y envía una foto de evidencia que justifique la entrega incompleta (mermas/daños) para la factura <b>#${tempData.docNum}</b>:`;
      } else {
        msg += `Por favor, toma y envía una foto de evidencia que justifique el rechazo del documento <b>#${tempData.docNum}</b>:`;
      }
    }

    msg += isMandatory ? `\n(La foto es obligatoria)` : `\n(La foto es opcional)`;

    await sendTelegramMessage(botToken, chatId, msg, photoKeyboard);
    return;
  }

  // 2. Invoice Photo Step Check
  const reqInvoicePhotoRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_require_invoice_photo'").get() as { value: string } | undefined;
  let reqInvoicePhoto = reqInvoicePhotoRow?.value || 'disabled';

  if (reqInvoicePhoto !== 'disabled') {
    if (tempData.isBatchCompletion && tempData.batchDocIds) {
      tempData.batchInvoicePhotos = tempData.batchInvoicePhotos || {};
      
      if (!tempData.activeInvoicePhotoDocId || tempData.batchInvoicePhotos[tempData.activeInvoicePhotoDocId] !== undefined) {
        const firstPendingId = tempData.batchDocIds.find((id: any) => tempData.batchInvoicePhotos[id] === undefined);
        if (firstPendingId !== undefined) {
          tempData.activeInvoicePhotoDocId = firstPendingId;
        } else {
          delete tempData.activeInvoicePhotoDocId;
        }
      }

      if (tempData.activeInvoicePhotoDocId && tempData.batchInvoicePhotos[tempData.activeInvoicePhotoDocId] === undefined) {
        const flowName = tempData.docType === 'recoger' ? 'collects_menu' : 'delivery_menu';
        await saveTelegramState(chatIdStr, flowName, 'delivery_await_invoice_photo', tempData);

        const isMandatory = reqInvoicePhoto === 'mandatory';
        const buttonsRow: { text: string }[] = [];
        
        tempData.batchDocIds.forEach((id: any, idx: number) => {
          const docNum = tempData.batchDocNums ? tempData.batchDocNums[idx] : String(id);
          let label = '';
          if (tempData.batchInvoicePhotos[id] !== undefined) {
            label = `✅ #${docNum}`;
          } else if (id === tempData.activeInvoicePhotoDocId) {
            label = `📸 #${docNum} (Actual)`;
          } else {
            label = `⏳ #${docNum}`;
          }
          buttonsRow.push({ text: label });
        });

        const keyboardRows: any[][] = [];
        for (let i = 0; i < buttonsRow.length; i += 2) {
          keyboardRows.push(buttonsRow.slice(i, i + 2));
        }

        const controlButtons: { text: string }[] = [];
        if (!isMandatory) {
          controlButtons.push({ text: "Omitir foto de factura firmada ⏭️" });
        }
        controlButtons.push({ text: "Volver al Menú Principal 🔙" });
        keyboardRows.push(controlButtons);

        const photoKeyboard = {
          keyboard: keyboardRows,
          resize_keyboard: true,
          one_time_keyboard: true
        };

        const activeIndex = tempData.batchDocIds.indexOf(tempData.activeInvoicePhotoDocId);
        const activeDocNum = tempData.batchDocNums ? tempData.batchDocNums[activeIndex] : String(tempData.activeInvoicePhotoDocId);

        let msg = `📸 <b>[Lote: Factura ${activeIndex + 1}/${tempData.batchDocIds.length}]</b>\n` +
          `Por favor, toma y envía una foto de la factura física firmada por el cliente de recibido para la factura <b>#${activeDocNum}</b>:\n\n` +
          `<i>(Puedes presionar los botones del menú de abajo para seleccionar otra factura y cambiar el orden)</i>`;

        msg += isMandatory ? `\n\n(La foto es obligatoria)` : `\n\n(La foto es opcional)`;

        await sendTelegramMessage(botToken, chatId, msg, photoKeyboard);
        return;
      }
    } else {
      if (tempData.fotoFactura === undefined) {
        const flowName = tempData.docType === 'recoger' ? 'collects_menu' : 'delivery_menu';
        await saveTelegramState(chatIdStr, flowName, 'delivery_await_invoice_photo', tempData);

        const isMandatory = reqInvoicePhoto === 'mandatory';
        const photoKeyboard = {
          keyboard: [
            ...(isMandatory ? [] : [[{ text: "Omitir foto de factura firmada ⏭️" }]]),
            [{ text: "Volver al Menú Principal 🔙" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        };

        let msg = `📸 <b>Foto de Factura Firmada Requerida</b>\n` +
          `Por favor, toma y envía una foto de la factura física firmada por el cliente de recibido para <b>#${tempData.docNum}</b>:`;

        msg += isMandatory ? `\n(La foto es obligatoria)` : `\n(La foto es opcional)`;

        await sendTelegramMessage(botToken, chatId, msg, photoKeyboard);
        return;
      }
    }
  }

  // 3. Location Step Check
  const askLocationRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_location'").get() as { value: string } | undefined;
  const askLocation = askLocationRow?.value === 'true';

  if (askLocation && tempData.latitud === undefined && tempData.longitud === undefined) {
    await saveTelegramState(chatIdStr, 'delivery_await_location', 'wait_gps', tempData);

    const isMandatoryRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_location_mandatory'").get() as { value: string } | undefined;
    const isMandatory = isMandatoryRow?.value === 'true';

    const locationKeyboard = {
      keyboard: [
        [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
        ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
        [{ text: "Salir del Lote 🔙" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };

    await sendTelegramMessage(
      botToken,
      chatId,
      `📍 <b>Geolocalización Requerida</b>\n` +
      `Por favor comparte tu ubicación GPS actual para registrar la entrega de la factura <b>#${tempData.docNum}</b>:`,
      locationKeyboard
    );
    return;
  }

  // 4. Finalize
  await executeFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, finalStateData);
}

async function preFinalizeDelivery(db: any, chatIdStr: string, chatId: any, botToken: string, linkage: any, tempData: any, finalStateData: any) {
  // Store the finalized data so we can access it at the end of the chain
  tempData.finalStateData = finalStateData;

  // Run next step!
  await runNextFinalizeStep(db, chatIdStr, chatId, botToken, linkage, tempData);
}

async function completeDeliveryInitFlow(db: any, botToken: string, chatId: number, chatIdStr: string, linkage: any, tempData: any) {
  try {
    db.prepare('UPDATE ops_delivery_assignments SET fecha_salida = ? WHERE id = ?').run(new Date().toISOString(), tempData.assignmentId);
  } catch (err) {
    console.error("Error setting fecha_salida in completeDeliveryInitFlow:", err);
  }

  await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);

  const liveTrackingRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_live_tracking'").get() as { value: string } | undefined;
  const liveTracking = liveTrackingRow?.value === 'true';
  const liveMandatoryRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_live_tracking_mandatory'").get() as { value: string } | undefined;
  const liveMandatory = liveMandatoryRow?.value === 'true';

  let successMsg = `✅ <b>Ruta Iniciada con Éxito</b>\n🛣️ Ruta: <b>${tempData.routeName}</b>\n🚙 Vehículo: <b>${tempData.plate}</b>\n\n`;
  
  if (liveTracking) {
    successMsg += `🛰️ <b>Rastreo GPS en Vivo Activado</b>\n`;
    if (liveMandatory) {
      successMsg += `⚠️ <b>IMPORTANTE:</b> El rastreo en tiempo real es <u>obligatorio</u>. Por favor comparte tu ubicación en tiempo real:\n` +
                    `1. Presiona el botón del clip 📎 o el menú de adjuntos.\n` +
                    `2. Selecciona <b>"Ubicación"</b>.\n` +
                    `3. Elige <b>"Compartir mi ubicación en tiempo real..."</b>.\n` +
                    `4. Selecciona el período máximo disponible (<b>8 horas</b> 🕐).\n\n` +
                    `<i>El sistema verificará el rastreo antes de habilitar tus reportes.</i>`;
    } else {
      successMsg += `💡 Te sugerimos compartir tu ubicación en tiempo real por la duración de tu jornada (8 horas) para dibujar tu ruta de despacho automáticamente en el mapa.\n\n¿Qué deseas hacer hoy?`;
    }
  } else {
    successMsg += `¿Qué deseas hacer hoy?`;
  }

  await sendTelegramMessage(
    botToken,
    chatId,
    successMsg,
    getDeliveryMenuKeyboard(db, tempData.assignmentId)
  );
}

async function sendFirstClientSelectionPrompt(db: any, botToken: string, chatId: number, chatIdStr: string, tempData: any, isMandatory: boolean) {
  const pending = await getPendingDestinations(db, tempData.assignmentId);

  const rows = pending.map(p => [{ text: p.label }]);
  if (!isMandatory) {
    rows.push([{ text: "Omitir primer cliente ⏭️" }]);
  }
  rows.push([{ text: "Cancelar ❌" }]);

  const firstClientKeyboard = {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: true
  };

  await saveTelegramState(chatIdStr, 'delivery_init', 'delivery_first_client', tempData);

  await sendTelegramMessage(
    botToken,
    chatId,
    `📍 <b>¿Cuál será el primer cliente que visitarás?</b>\n` +
    `Por favor selecciónalo de tu lista de hoy:` +
    (isMandatory ? `\n(La selección del primer cliente es obligatoria)` : ``),
    firstClientKeyboard
  );
}

async function startDeliveriesFlow(db: any, botToken: string, chatId: any, chatIdStr: string, linkage: any) {
  if (linkage.allowDeliveries === 0) {
    await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para reportar entregas. Contacta a administración.", getDynamicMenuKeyboard(linkage));
    return;
  }
  
  const coreUserId = (await getCoreUserIdFromLinkage(linkage.employeeId)) || 0;

  const activeAssignment = db.prepare(`
      SELECT a.id, r.name as ruta_nombre, v.plate as vehiculo_placa, a.fecha_salida
      FROM ops_delivery_assignments a
      JOIN ops_delivery_routes r ON a.ruta_id = r.id
      JOIN fleet_vehicles v ON a.vehiculo_id = v.id
      WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
  `).get(coreUserId, await getBusinessDateStr()) as any;

  if (activeAssignment) {
    if (!activeAssignment.fecha_salida) {
      await saveTelegramState(chatIdStr, 'delivery_pre_depart', 'pre_depart_home', { assignmentId: activeAssignment.id, routeName: activeAssignment.ruta_nombre, plate: activeAssignment.vehiculo_placa });
      await sendTelegramMessage(
        botToken,
        chatId,
        `🚚 <b>Monitor de Entregas (Preparación)</b>\nTienes una asignación de ruta creada:\nRuta: <b>${activeAssignment.ruta_nombre}</b>\nVehículo: <b>${activeAssignment.vehiculo_placa}</b>\n\nPor favor, carga tus facturas usando el botón de abajo. Cuando estés listo para salir de la empresa, presiona "🚀 Salir a Ruta".`,
        deliveryPreDepartKeyboard
      );
      return;
    }

    const pendingCountRow = db.prepare("SELECT COUNT(*) as count FROM ops_delivery_queue WHERE asignacion_id = ? AND entregado = 0").get(activeAssignment.id) as { count: number } | undefined;
    const pendingCount = pendingCountRow?.count || 0;

    if (pendingCount === 0) {
      const assDetails = db.prepare("SELECT fecha_inicio_retorno FROM ops_delivery_assignments WHERE id = ?").get(activeAssignment.id) as { fecha_inicio_retorno: string | null } | undefined;
      if (!assDetails?.fecha_inicio_retorno) {
        // Start return flow
        const askReturnLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_return_location'").get() as { value: string } | undefined;
        const isMandatory = askReturnLocRow?.value === 'mandatory';

        await saveTelegramState(chatIdStr, 'delivery_await_return_location', 'wait_gps_return', { assignmentId: activeAssignment.id, routeName: activeAssignment.ruta_nombre, plate: activeAssignment.vehiculo_placa });

        const locationKeyboard = {
          keyboard: [
            [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
            ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
            [{ text: "Volver al Menú Principal 🔙" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        };

        await sendTelegramMessage(
          botToken,
          chatId,
          `🚚 <b>Monitor de Entregas</b>\n\nHas completado todas las entregas asignadas a tu ruta.\n\n📍 <b>Inicio de Retorno: Geolocalización</b>\n` +
          `Por favor comparte tu ubicación GPS actual utilizando el botón de abajo para registrar tu salida de regreso a la empresa:` +
          (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
          locationKeyboard
        );
        return;
      } else {
        // Return has started, wait for arrival
        const askArrivalLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_arrival_location'").get() as { value: string } | undefined;
        const isMandatory = askArrivalLocRow?.value === 'mandatory';

        await saveTelegramState(chatIdStr, 'delivery_await_arrival_location', 'wait_gps_arrival', { assignmentId: activeAssignment.id, routeName: activeAssignment.ruta_nombre, plate: activeAssignment.vehiculo_placa });

        const locationKeyboard = {
          keyboard: [
            [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
            ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
            [{ text: "Volver al Menú Principal 🔙" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        };

        await sendTelegramMessage(
          botToken,
          chatId,
          `🚚 <b>Monitor de Entregas</b>\n\nTu viaje de retorno está registrado. Si ya has llegado a las instalaciones:\n\n📍 <b>Llegada a Empresa: Geolocalización</b>\n` +
          `Por favor comparte tu ubicación GPS actual utilizando el botón de abajo para registrar tu ingreso físico a la empresa y cerrar la ruta:` +
          (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
          locationKeyboard
        );
        return;
      }
    }

    const liveMandatoryRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_live_tracking_mandatory'").get() as { value: string } | undefined;
    const liveMandatory = liveMandatoryRow?.value === 'true';
    const hasGpsLog = db.prepare("SELECT 1 FROM ops_delivery_gps_logs WHERE asignacion_id = ? LIMIT 1").get(activeAssignment.id);

    if (liveMandatory && !hasGpsLog) {
      await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', { assignmentId: activeAssignment.id, routeName: activeAssignment.ruta_nombre, plate: activeAssignment.vehiculo_placa });
      await sendTelegramMessage(
        botToken,
        chatId,
        `⚠️ <b>Rastreo en Vivo Requerido</b>\n\n` +
        `Para acceder a tus entregas, debes compartir tu ubicación en tiempo real:\n\n` +
        `1. Toca el botón de adjuntos 📎 en tu chat.\n` +
        `2. Elige <b>"Ubicación"</b>.\n` +
        `3. Toca en <b>"Compartir mi ubicación en tiempo real..."</b>.\n` +
        `4. Selecciona <b>8 horas</b>.\n\n` +
        `<i>Una vez compartida, vuelve a escribir /menu para desbloquear tu terminal.</i>`,
        deliveryMenuKeyboard
      );
      return;
    }

    await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', { assignmentId: activeAssignment.id, routeName: activeAssignment.ruta_nombre, plate: activeAssignment.vehiculo_placa });
    await sendTelegramMessage(
      botToken,
      chatId,
      `🚚 <b>Monitor de Entregas v2.1</b>\nTienes una ruta activa: <b>${activeAssignment.ruta_nombre}</b>\nVehículo: <b>${activeAssignment.vehiculo_placa}</b>\n\n¿Qué deseas hacer hoy?`,
      getDeliveryMenuKeyboard(db, activeAssignment.id)
    );
  } else {
    await saveTelegramState(chatIdStr, 'delivery_init', 'delivery_routes', {});
    const routes = db.prepare('SELECT id, name FROM ops_delivery_routes WHERE active = 1').all() as any[];
    let msg = "🚚 <b>Monitor de Entregas v2.1</b>\n¿Qué ruta(s) llevas hoy?\n\n";
    if (routes.length === 0) {
      msg += "⚠️ No hay rutas activas registradas en el sistema. Contacta al despachador.";
      await deleteTelegramState(chatIdStr);
      await sendTelegramMessage(botToken, chatId, msg, getDynamicMenuKeyboard(linkage));
      return;
    }
    for (const route of routes) {
      msg += `<b>${route.id}</b> - ${route.name}\n`;
    }
    msg += "\nSelecciona una ruta de la lista o escribe los números de ruta separados por comas (ejemplo: <code>1,3</code>):";
    
    const routesInitKeyboard = {
      keyboard: [
        [{ text: "📋 Seleccionar Ruta de Lista" }],
        [{ text: "Cancelar ❌" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };
    await sendTelegramMessage(botToken, chatId, msg, routesInitKeyboard);
  }
}

async function startCollectsFlow(db: any, botToken: string, chatId: any, chatIdStr: string, linkage: any) {
  if (linkage.allowDeliveries === 0) {
    await sendTelegramMessage(botToken, chatId, "⚠️ No tienes accesos a este módulo.", getDynamicMenuKeyboard(linkage));
    return;
  }
  
  const coreUserId = (await getCoreUserIdFromLinkage(linkage.employeeId)) || 0;

  const activeAssignment = db.prepare(`
      SELECT a.id, r.name as ruta_nombre, v.plate as vehiculo_placa
      FROM ops_delivery_assignments a
      JOIN ops_delivery_routes r ON a.ruta_id = r.id
      JOIN fleet_vehicles v ON a.vehiculo_id = v.id
      WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
  `).get(coreUserId, await getBusinessDateStr()) as any;

  if (activeAssignment) {
    const pendingCountRow = db.prepare("SELECT COUNT(*) as count FROM ops_delivery_queue WHERE asignacion_id = ? AND entregado = 0 AND tipo_documento = 'recoger'").get(activeAssignment.id) as { count: number } | undefined;
    const pendingCount = pendingCountRow?.count || 0;

    await saveTelegramState(chatIdStr, 'collects_menu', 'collects_menu_home', { assignmentId: activeAssignment.id, routeName: activeAssignment.ruta_nombre, plate: activeAssignment.vehiculo_placa });
    
    if (pendingCount === 0) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `📦 <b>Monitor de Recolectas</b>\nTienes una ruta activa: <b>${activeAssignment.ruta_nombre}</b>\nVehículo: <b>${activeAssignment.vehiculo_placa}</b>\n\n⚠️ <b>No tienes recolectas pendientes el día de hoy.</b>`,
        getCollectsMenuKeyboard(db, activeAssignment.id)
      );
    } else {
      await sendTelegramMessage(
        botToken,
        chatId,
        `📦 <b>Monitor de Recolectas</b>\nTienes una ruta activa: <b>${activeAssignment.ruta_nombre}</b>\nVehículo: <b>${activeAssignment.vehiculo_placa}</b>\n\n¿Qué deseas hacer hoy?`,
        getCollectsMenuKeyboard(db, activeAssignment.id)
      );
    }
  } else {
    await sendTelegramMessage(
      botToken,
      chatId,
      `⚠️ <b>Sin Ruta Activa</b>\nNo tienes una ruta activa asignada para el día de hoy. Por favor inicia tu ruta primero con la opción "📝 Registrar Entregas" o "Iniciar Nueva Ruta" en el menú de Transportes.`,
      getDynamicMenuKeyboard(linkage)
    );
  }
}

async function handleMiCamionFuel(db: any, botToken: string, chatId: any, chatIdStr: string, linkage: any, parentSubmenu?: string) {
  const coreUserId = await getCoreUserIdFromLinkage(linkage.employeeId);
  const activeAssRow = db.prepare(`
    SELECT v.id as vehicle_id, v.plate, v.brand, v.model, v.currentMileage, v.fuelType
    FROM ops_delivery_assignments a
    JOIN fleet_vehicles v ON a.vehiculo_id = v.id
    WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
    LIMIT 1
  `).get(coreUserId, await getBusinessDateStr()) as any;

  if (!activeAssRow) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `⚠️ <b>Sin Ruta Activa</b>\nNo tienes una ruta de entregas activa asignada para el día de hoy. No puedes registrar repostajes sin una ruta activa.`,
      getDynamicMenuKeyboard(linkage)
    );
    return;
  }

  const tempData = {
    vehicleId: activeAssRow.vehicle_id,
    plate: activeAssRow.plate,
    brand: activeAssRow.brand,
    model: activeAssRow.model,
    currentMileage: activeAssRow.currentMileage || 0,
    fuelType: activeAssRow.fuelType || '',
    parentSubmenu: parentSubmenu
  };

  await saveTelegramState(chatIdStr, 'fuel', 'fuel_liters', tempData);
  await sendTelegramMessage(
    botToken,
    chatId,
    `⛽ <b>${tempData.brand} ${tempData.model} (${tempData.plate}) - Auto-detectado</b>\n¿Cuántos <b>litros</b> se cargaron? (Ingresa solo el número):`,
    cancelOnlyKeyboard
  );
}
async function handleMiCamionAveria(db: any, botToken: string, chatId: any, chatIdStr: string, linkage: any, parentSubmenu?: string) {
  const coreUserId = await getCoreUserIdFromLinkage(linkage.employeeId);
  const activeAssRow = db.prepare(`
    SELECT v.id as vehicle_id, v.plate, v.brand, v.model
    FROM ops_delivery_assignments a
    JOIN fleet_vehicles v ON a.vehiculo_id = v.id
    WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
    LIMIT 1
  `).get(coreUserId, await getBusinessDateStr()) as any;

  if (!activeAssRow) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `⚠️ <b>Sin Ruta Activa</b>\nNo tienes una ruta de entregas activa asignada para el día de hoy. No puedes reportar averías sin una ruta activa.`,
      getDynamicMenuKeyboard(linkage)
    );
    return;
  }

  const tempData = {
    vehicleId: activeAssRow.vehicle_id,
    plate: activeAssRow.plate,
    brand: activeAssRow.brand,
    model: activeAssRow.model,
    parentSubmenu: parentSubmenu
  };

  await saveTelegramState(chatIdStr, 'driver_report_fault', 'driver_maint_subject', tempData);
  await sendTelegramMessage(
    botToken,
    chatId,
    `🔧 <b>${tempData.brand} ${tempData.model} (${tempData.plate}) - Auto-detectado</b>\n\n¿Cuál es el <b>asunto o título breve</b> de la avería/mantenimiento que deseas reportar?\n(Ejemplo: <i>Fuga de aceite en motor</i>):`,
    cancelOnlyKeyboard
  );
}

async function handleDriverAlerts(db: any, botToken: string, chatId: any, chatIdStr: string, linkage: any) {
  const coreUserId = await getCoreUserIdFromLinkage(linkage.employeeId);
  const activeAssRow = db.prepare(`
    SELECT v.id, v.plate, v.brand, v.model, v.currentMileage, v.fuelType, v.currentHours, v.odometerUnit, v.lastOilChangeMileage, v.oilChangeInterval, v.nextOilChangeMileage, v.rtvExpiration, v.lastRtvDate, v.nextRtvDate, v.fireExtinguisherExpiration, v.permitExpiration
    FROM ops_delivery_assignments a
    JOIN fleet_vehicles v ON a.vehiculo_id = v.id
    WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
    LIMIT 1
  `).get(coreUserId, await getBusinessDateStr()) as any;

  if (!activeAssRow) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `⚠️ <b>Sin Ruta Activa</b>\nNo tienes una ruta de entregas activa asignada para el día de hoy, por lo que no tienes un vehículo asignado.`,
      getDynamicMenuKeyboard(linkage)
    );
    return;
  }

  try {
    const { alerts, warnings, controls } = await checkVehicleAlerts(activeAssRow, db);
    const brandModel = `${activeAssRow.brand || ''} ${activeAssRow.model || ''}`.trim();
    const fuelType = activeAssRow.fuelType || 'No especificado';
    const odoUnit = activeAssRow.odometerUnit || 'km';

    let responseText = `⚠️ <b>Alertas de Mi Vehículo - ${activeAssRow.plate}</b>\n`;
    responseText += `🚗 ${brandModel ? brandModel : 'Vehículo'} | ${fuelType}\n`;
    responseText += `📍 Odo: <b>${(activeAssRow.currentMileage || 0).toLocaleString('es-CR')} ${odoUnit}</b>`;
    if (activeAssRow.currentHours) {
      responseText += ` | Horas: <b>${activeAssRow.currentHours.toLocaleString('es-CR')} h</b>`;
    }
    responseText += `\n\n`;

    if (alerts.length > 0 || warnings.length > 0) {
      responseText += `🚨 <b>ALERTAS DETECTADAS:</b>\n`;
      for (const item of [...alerts, ...warnings]) {
        responseText += `• ${item}\n`;
      }
      responseText += `\n`;
    } else {
      responseText += `🟢 <b>Sin alertas activas:</b> El vehículo se encuentra al día en todos sus controles y permisos.\n\n`;
    }

    responseText += `📋 <b>CONTROLES Y ESTADOS:</b>\n`;
    for (const ctrl of controls) {
      responseText += `• ${ctrl.name}: <b>${ctrl.status}</b> (${ctrl.detail})\n`;
    }

    await sendTelegramMessage(botToken, chatId, responseText, getDynamicMenuKeyboard(linkage));
  } catch (err) {
    console.error("Error generating detailed vehicle alerts:", err);
    await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar el reporte de alertas. Por favor intenta de nuevo.", getDynamicMenuKeyboard(linkage));
  }
}

async function handleDriverHistory(db: any, botToken: string, chatId: any, chatIdStr: string, linkage: any) {
  const coreUserId = await getCoreUserIdFromLinkage(linkage.employeeId);
  const activeAssRow = db.prepare(`
    SELECT v.id as vehicle_id, v.plate, v.brand, v.model
    FROM ops_delivery_assignments a
    JOIN fleet_vehicles v ON a.vehiculo_id = v.id
    WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
    LIMIT 1
  `).get(coreUserId, await getBusinessDateStr()) as any;

  if (!activeAssRow) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `⚠️ <b>Sin Ruta Activa</b>\nNo tienes una ruta de entregas activa asignada para el día de hoy, por lo que no tienes un vehículo asignado.`,
      getDynamicMenuKeyboard(linkage)
    );
    return;
  }

  try {
    const fuelLogs = db.prepare('SELECT * FROM fleet_fuel_logs WHERE vehicleId = ? ORDER BY date DESC LIMIT 5').all(activeAssRow.vehicle_id) as any[];
    const maintLogs = db.prepare('SELECT * FROM fleet_maintenance_logs WHERE vehicleId = ? ORDER BY date DESC LIMIT 5').all(activeAssRow.vehicle_id) as any[];
    
    const brandModel = `${activeAssRow.brand || ''} ${activeAssRow.model || ''}`.trim();
    let responseText = `📋 <b>Historial de Log - ${activeAssRow.plate}</b>\n`;
    if (brandModel) responseText += `🚗 ${brandModel}\n\n`;
    else responseText += `\n`;

    // Fuel Logs
    responseText += `⛽ <b>Últimos Repostajes:</b>\n`;
    if (fuelLogs.length === 0) {
      responseText += `<i>No hay registros de repostaje.</i>\n\n`;
    } else {
      for (const log of fuelLogs) {
        const formattedDate = formatDate(log.date);
        const costStr = Number(log.cost || 0).toLocaleString('es-CR');
        const litersStr = Number(log.liters || 0).toLocaleString('es-CR');
        const odoStr = Number(log.mileageBefore || 0).toLocaleString('es-CR');
        responseText += `• ${formattedDate}: <b>${litersStr} L</b> (Odo: ${odoStr} km) | ₡${costStr}\n`;
      }
      responseText += `\n`;
    }

    // Maintenance Logs
    responseText += `🔧 <b>Últimos Mantenimientos:</b>\n`;
    if (maintLogs.length === 0) {
      responseText += `<i>No hay registros de mantenimiento.</i>\n\n`;
    } else {
      for (const log of maintLogs) {
        const formattedDate = formatDate(log.date);
        const costStr = Number(log.cost || 0).toLocaleString('es-CR');
        const odoStr = Number(log.mileage || 0).toLocaleString('es-CR');
        responseText += `• ${formattedDate} [${log.type}]: ${log.description || 'Sin descripción'} (Odo: ${odoStr} km) | ₡${costStr}\n`;
      }
    }

    await sendTelegramMessage(botToken, chatId, responseText, getDynamicMenuKeyboard(linkage));
  } catch (err) {
    console.error("Error generating detailed vehicle log history:", err);
    await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar el historial. Por favor intenta de nuevo.", getDynamicMenuKeyboard(linkage));
  }
}

async function handleDriverRtv(db: any, botToken: string, chatId: any, chatIdStr: string, linkage: any) {
  const askRtvRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_rtv'").get() as { value: string } | undefined;
  if (askRtvRow && askRtvRow.value === 'false') {
    await sendTelegramMessage(botToken, chatId, "⚠️ La función de renovación de RTV está desactivada por la administración.", getDynamicMenuKeyboard(linkage));
    return;
  }
  
  const coreUserId = await getCoreUserIdFromLinkage(linkage.employeeId);
  const activeAssRow = db.prepare(`
    SELECT v.id as vehicle_id, v.plate, v.brand, v.model, v.rtvExpiration
    FROM ops_delivery_assignments a
    JOIN fleet_vehicles v ON a.vehiculo_id = v.id
    WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
    LIMIT 1
  `).get(coreUserId, await getBusinessDateStr()) as any;

  if (!activeAssRow) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `⚠️ <b>Sin Ruta Activa</b>\nNo tienes una ruta de entregas activa asignada para el día de hoy, por lo que no tienes un vehículo asignado.`,
      getDynamicMenuKeyboard(linkage)
    );
    return;
  }

  const tempData: any = {
    vehicleId: activeAssRow.vehicle_id,
    plate: activeAssRow.plate,
    brand: activeAssRow.brand,
    model: activeAssRow.model,
    rtvExpiration: activeAssRow.rtvExpiration,
    parentSubmenu: 'submenu_flota'
  };

  if (activeAssRow.rtvExpiration) {
    const dateParts = activeAssRow.rtvExpiration.substring(0, 10).split('-');
    if (dateParts.length === 3) {
      const year = parseInt(dateParts[0], 10);
      const month = dateParts[1];
      const day = dateParts[2];
      const nextYear = year + 1;
      const proposedDate = `${nextYear}-${month}-${day}`;
      const formattedProposed = `${day}/${month}/${nextYear}`;

      tempData.proposedDate = proposedDate;
      tempData.formattedProposed = formattedProposed;

      await saveTelegramState(chatIdStr, 'rtv_renewal', 'rtv_confirm', tempData);

      const rtvConfirmKeyboard = {
        keyboard: [
          [{ text: `Sí, renovar al ${formattedProposed} ✅` }],
          [{ text: "✍️ Ingresar otra fecha" }],
          [{ text: "Cancelar ❌" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      };

      await sendTelegramMessage(
        botToken,
        chatId,
        `🚙 <b>${activeAssRow.brand} ${activeAssRow.model} (${activeAssRow.plate}) - Auto-detectado</b>\n` +
        `RTV actual: <b>${formatDate(activeAssRow.rtvExpiration)}</b>\n\n` +
        `¿Deseas renovar el RTV sumando un año para el <b>${formattedProposed}</b>?`,
        rtvConfirmKeyboard
      );
      return;
    }
  }

  // If no current RTV date, ask to input manually
  await saveTelegramState(chatIdStr, 'rtv_renewal', 'rtv_date_input', tempData);
  await sendTelegramMessage(
    botToken,
    chatId,
    `🚙 <b>${activeAssRow.brand} ${activeAssRow.model} (${activeAssRow.plate}) - Auto-detectado</b> no tiene fecha de RTV registrada.\n\n` +
    `Por favor, escribe la fecha de vencimiento de RTV en formato <b>DD/MM/AAAA</b> (ej: 01/05/2027):`,
    cancelOnlyKeyboard
  );
}

export async function POST(req: NextRequest) {
  try {
    const config = await getNotificationConfig('telegram');
    const botToken = config?.botToken;

    if (!botToken) {
      console.warn("Telegram Bot Token is not configured yet.");
      return NextResponse.json({ ok: true });
    }

    const payload = await req.json();
    try {
      await logInfo(`Telegram Bot: Webhook recibido`, { 
        update_id: payload.update_id,
        chatId: payload.message?.chat?.id || payload.edited_message?.chat?.id,
        user: payload.message?.from?.username || payload.message?.from?.first_name,
        text: payload.message?.text || (payload.message?.location ? '[Ubicación GPS]' : '[Mensaje sin texto]')
      });
    } catch (logErr) {
      console.error("Error writing log for webhook receive:", logErr);
    }
    const message = payload.message || payload.edited_message;

    if (!message || !message.chat) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const chatIdStr = String(chatId);
    const text = message.text ? message.text.trim() : '';

    // Check if employee is linked
    const linkage = await getLinkageByChatId(chatIdStr);
    if (linkage) {
      linkage.allowFuel = linkage.allowFuel ?? 1;
      linkage.allowMaintenance = linkage.allowMaintenance ?? 1;
      linkage.allowDeliveries = linkage.allowDeliveries ?? 1;
      linkage.allowWarehouse = linkage.allowWarehouse ?? 1;
      linkage.isMechanic = await checkIsMechanic(linkage.employeeId);
    }

    // Live Location Intercept (edited_message or one-time message.location without text when not expecting location)
    if (payload.edited_message && payload.edited_message.location) {
      if (linkage) {
        try {
          const db = await getDb();
          const coreUserId = (await getCoreUserIdFromLinkage(linkage.employeeId)) || 0;
          const activeAssRow = db.prepare(`
            SELECT id FROM ops_delivery_assignments
            WHERE empleado_id = ? AND fecha = ? AND activa = 1
            LIMIT 1
          `).get(coreUserId, await getBusinessDateStr()) as { id: number } | undefined;

          if (activeAssRow) {
            db.prepare(`
              INSERT INTO ops_delivery_gps_logs (asignacion_id, latitud, longitud, timestamp)
              VALUES (?, ?, ?, ?)
            `).run(activeAssRow.id, payload.edited_message.location.latitude, payload.edited_message.location.longitude, new Date().toISOString());
            console.log(`[GPS] Recorded live location update for assignment #${activeAssRow.id}`);
            const fechaComercial = await getBusinessDateStr();
            console.log(`[GPS-TIMEZONE] Fecha comercial resuelta: ${fechaComercial} | Zona horaria activa: ${getCachedTimeZone()}`);
          }
        } catch (gpsErr) {
          console.error("Error saving live location update:", gpsErr);
        }
      }
      return NextResponse.json({ ok: true });
    }
    // 1. GLOBAL CANCEL HANDLING
    if (text.toLowerCase().includes('cancelar') || text.toLowerCase() === '/cancelar') {
      const state = await getTelegramState(chatIdStr);
      await returnUserToSubmenu(
        chatIdStr,
        chatId,
        linkage,
        state ? state.currentFlow : null,
        "❌ Proceso cancelado.",
        botToken,
        state ? state.tempData : null
      );
      return NextResponse.json({ ok: true });
    }

    // 2. UNLINKED USER FLOW
    if (!linkage) {
      const isStartWithParam = text.startsWith('/start ') && text.trim().split(/\s+/).length === 2;
      if (text.toLowerCase().startsWith('/vincular') || /^[A-Z0-9]{6}$/i.test(text) || isStartWithParam) {
        let code = text;
        if (isStartWithParam) {
          code = text.split(/\s+/)[1].trim();
        } else if (text.toLowerCase().startsWith('/vincular')) {
          code = text.replace('/vincular', '').trim();
        }

        if (!code) {
          await sendTelegramMessage(
            botToken, 
            chatId, 
            "⚠️ Por favor ingresa el código después del comando.\nEjemplo: <code>/vincular TX8925</code>"
          );
          return NextResponse.json({ ok: true });
        }

        try {
          const activatedLink = await activateLinkage(code, chatIdStr, message.from?.username);
          await sendTelegramMessage(
            botToken, 
            chatId, 
            `✅ <b>¡Vinculación Exitosa!</b>\nBienvenido, <b>${activatedLink.employeeName || 'Colaborador'}</b>. Ya puedes interactuar con el bot general de la empresa.\n\nEscribe /menu o presiona cualquier botón de abajo para ver las opciones de registro.`,
            getDynamicMenuKeyboard(activatedLink)
          );
        } catch (error: any) {
          await sendTelegramMessage(
            botToken, 
            chatId, 
            "❌ <b>Código inválido o ya utilizado.</b>\nPor favor, genera un nuevo código en el panel de administración en /dashboard/admin/automations e inténtalo de nuevo."
          );
        }
      } else {
        await sendTelegramMessage(
          botToken, 
          chatId, 
          "❌ <b>Acceso no autorizado</b>\nTu cuenta de Telegram no está vinculada al Bot General Garend.\n\nPor favor, ingresa tu código de activación generado por administración:\n<code>/vincular CÓDIGO</code>"
        );
      }
      return NextResponse.json({ ok: true });
    }

    // 2.5. SLASH COMMANDS INTERCEPTORS
    if (text.startsWith('/')) {
      const lowerText = text.toLowerCase();
      if (lowerText === '/transportes') {
        if (linkage.allowDeliveries === 0 && linkage.allowFuel === 0 && linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes accesos a este módulo.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'submenu_transportes', 'home', {});
        const hasMultiple = getActiveModules(linkage).length > 1;
        await sendTelegramMessage(
          botToken,
          chatId,
          `Logístico: <b>Transportes y Entregas</b>\nPor favor, selecciona una opción:`,
          getTransportesMenuKeyboard(linkage, hasMultiple)
        );
        return NextResponse.json({ ok: true });
      }

      if (lowerText === '/taller') {
        if (!linkage.isMechanic || (linkage.allowMaintenance === 0 && linkage.allowFuel === 0)) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes accesos a este módulo.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'submenu_flota', 'home', {});
        const hasMultiple = getActiveModules(linkage).length > 1;
        await sendTelegramMessage(
          botToken,
          chatId,
          `Flota: <b>Flota y Taller</b>\nPor favor, selecciona una opción:`,
          getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv())
        );
        return NextResponse.json({ ok: true });
      }

      if (lowerText === '/almacen') {
        if (linkage.allowWarehouse === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes accesos a este módulo.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'submenu_warehouse', 'home', {});
        const hasMultiple = getActiveModules(linkage).length > 1;
        await sendTelegramMessage(
          botToken,
          chatId,
          `Almacén: <b>Almacén e Inventario</b>\nPor favor, selecciona una opción:`,
          getWarehouseMenuKeyboard(linkage, hasMultiple)
        );
        return NextResponse.json({ ok: true });
      }

      if (lowerText === '/entrega') {
        const db = await getDb();
        await startDeliveriesFlow(db, botToken, chatId, chatIdStr, linkage);
        return NextResponse.json({ ok: true });
      }

      if (lowerText === '/recolecta') {
        const db = await getDb();
        await startCollectsFlow(db, botToken, chatId, chatIdStr, linkage);
        return NextResponse.json({ ok: true });
      }

      if (lowerText === '/finalizar') {
        const db = await getDb();
        const state = await getTelegramState(chatIdStr);
        const currentTempData = state ? state.tempData : {};
        const coreUserId = (await getCoreUserIdFromLinkage(linkage.employeeId)) || 0;
        const activeAssignment = db.prepare(`
            SELECT a.id, r.name as ruta_nombre, v.plate as vehiculo_placa, a.fecha_salida
            FROM ops_delivery_assignments a
            WHERE a.empleado_id = ? AND a.fecha = ? AND a.activa = 1
        `).get(coreUserId, await getBusinessDateStr()) as any;

        if (!activeAssignment) {
          await sendTelegramMessage(botToken, chatId, "❌ No tienes una ruta activa asignada para el día de hoy.");
          return NextResponse.json({ ok: true });
        }

        const tempDataMerged = { ...currentTempData, assignmentId: activeAssignment.id };
        let hasStartedReturn = false;
        const assRow = db.prepare("SELECT fecha_inicio_retorno FROM ops_delivery_assignments WHERE id = ?").get(tempDataMerged.assignmentId) as { fecha_inicio_retorno: string | null } | undefined;
        hasStartedReturn = assRow?.fecha_inicio_retorno !== null && assRow?.fecha_inicio_retorno !== undefined;

        if (hasStartedReturn) {
          const askArrivalLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_arrival_location'").get() as { value: string } | undefined;
          const isMandatory = askArrivalLocRow?.value === 'mandatory';
          await saveTelegramState(chatIdStr, 'delivery_await_arrival_location', 'wait_gps_arrival', tempDataMerged);
          const locationKeyboard = {
            keyboard: [
              [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
              ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
              [{ text: "Volver al Menú Principal 🔙" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          };
          await sendTelegramMessage(
            botToken,
            chatId,
            `📍 <b>Llegada a Empresa: Geolocalización</b>\n` +
            `Por favor comparte tu ubicación GPS actual utilizando el botón de abajo para registrar tu ingreso físico a la empresa y cerrar la ruta:` +
            (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
            locationKeyboard
          );
        } else {
          const pending = db.prepare(`
            SELECT id, documento_numero, cliente_nombre 
            FROM ops_delivery_queue 
            WHERE asignacion_id = ? AND entregado = 0
          `).all(tempDataMerged.assignmentId) as { id: number; documento_numero: string; cliente_nombre: string }[];

          if (pending.length > 0) {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_finish_pending_check', tempDataMerged);
            let msg = `⚠️ <b>Tienes entregas pendientes en tu ruta activa:</b>\n\n`;
            pending.forEach((p, idx) => {
              msg += `${idx + 1}. <b>${p.cliente_nombre}</b> (Documento: #${p.documento_numero})\n`;
            });
            msg += `\n¿Cómo deseas proceder para finalizar tu ruta?\n\n` +
                   `1️⃣ <b>Ruta Completa</b>: Registra todos los pendientes como entregados al 100% y cierra la ruta.\n` +
                   `2️⃣ <b>Ruta Incompleta</b>: Finaliza la ruta dejando estos pendientes (volverán a la cola general).\n` +
                   `3️⃣ <b>Cancelar</b>: Continúa con tus entregas normales.`;
            await sendTelegramMessage(
              botToken,
              chatId,
              msg,
              {
                keyboard: [
                  [{ text: "🏁 Finalizar Ruta Completa ✅" }],
                  [{ text: "⚠️ Finalizar Ruta Incompleta" }],
                  [{ text: "Seguir en Ruta / Cancelar 🔙" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            );
          } else {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_finish_confirm', tempDataMerged);
            await sendTelegramMessage(
              botToken,
              chatId,
              "🏁 <b>¿Has terminado tu jornada?</b>\nSe cerrarán tus rutas activas y los pedidos que queden en ruta no reportados volverán a la cola general.\n\nEscribe <b>SI</b> para confirmar o <b>NO</b> para cancelar:",
              {
                keyboard: [[{ text: "Sí, finalizar jornada ✅" }], [{ text: "No, seguir en ruta 🔙" }]],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            );
          }
        }
        return NextResponse.json({ ok: true });
      }

      if (lowerText === '/tickets') {
        if (!linkage.isMechanic) {
          await sendTelegramMessage(botToken, chatId, "⚠️ Opción solo permitida para mecánicos de taller.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        const db = await getDb();
        const userId = await getCoreUserIdFromLinkage(linkage.employeeId);
        const tickets = await getOpenTicketsForMechanic(userId);
        const hasMultiple = getActiveModules(linkage).length > 1;
        if (tickets.length === 0) {
          await sendTelegramMessage(botToken, chatId, "📋 No tienes tickets abiertos asignados o pendientes de asignar en este momento.", getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv()));
        } else {
          let msg = "📋 <b>Tus Tickets Abiertos / Pendientes:</b>\n\n";
          for (const t of tickets) {
            const statusEmoji = t.status === 'in_progress' ? '🔄' : t.status === 'on_hold' ? '⚠️' : '📥';
            const priorityEmoji = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '🟡';
            msg += `${statusEmoji} <code>${t.consecutive}</code> [${t.status.toUpperCase()}]\n`;
            msg += `• Vehículo: <b>${t.equipment_name}</b>\n`;
            msg += `• Asunto: <b>${t.subject}</b>\n`;
            msg += `• Prioridad: ${priorityEmoji} ${t.priority.toUpperCase()}\n\n`;
          }
          msg += "<i>Para gestionar cualquiera de estos tickets, digita su consecutivo usando la opción Gestionar Ticket del taller.</i>";
          await sendTelegramMessage(botToken, chatId, msg, getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv()));
        }
        return NextResponse.json({ ok: true });
      }

      if (lowerText === '/averia') {
        if (linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para reportar averías. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        const db = await getDb();
        const parent = linkage.isMechanic ? 'submenu_flota' : 'submenu_transportes';
        await handleMiCamionAveria(db, botToken, chatId, chatIdStr, linkage, parent);
        return NextResponse.json({ ok: true });
      }

      if (lowerText === '/combustible') {
        if (linkage.allowFuel === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para registrar combustible. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        const db = await getDb();
        const parent = linkage.isMechanic ? 'submenu_flota' : 'submenu_transportes';
        await handleMiCamionFuel(db, botToken, chatId, chatIdStr, linkage, parent);
        return NextResponse.json({ ok: true });
      }
    }

    // 3. LINKED USER FLOW
    if (text.startsWith('/doc_')) {
      try {
        const docNum = text.replace('/doc_', '').trim();
        const db = await getDb();
        const coreUserId = (await getCoreUserIdFromLinkage(linkage.employeeId)) || 0;
        const activeAssRow = db.prepare(`
          SELECT id FROM ops_delivery_assignments
          WHERE empleado_id = ? AND fecha = ? AND activa = 1
          LIMIT 1
        `).get(coreUserId, await getBusinessDateStr()) as { id: number } | undefined;

        if (!activeAssRow) {
          await sendTelegramMessage(botToken, chatId, "❌ No tienes una ruta activa asignada para el día de hoy.");
          return NextResponse.json({ ok: true });
        }

        let matches = db.prepare(`
          SELECT * FROM ops_delivery_queue 
          WHERE documento_numero = ? AND (asignacion_id = ? OR asignacion_id IS NULL) AND entregado = 0
        `).all(docNum, activeAssRow.id) as any[];

        if (matches.length === 0) {
          // Document not found - perform automatic sync and retry
          await performAutoSyncSafe();
          matches = db.prepare(`
            SELECT * FROM ops_delivery_queue 
            WHERE documento_numero = ? AND (asignacion_id = ? OR asignacion_id IS NULL) AND entregado = 0
          `).all(docNum, activeAssRow.id) as any[];
        }

        if (matches.length === 0) {
          await sendTelegramMessage(botToken, chatId, `⚠️ El documento #${docNum} no se encuentra pendiente o no está asignado a tu ruta.`);
          return NextResponse.json({ ok: true });
        }

        const match = matches[0];
        const newTempData: any = {
          assignmentId: activeAssRow.id,
          docId: match.id,
          docNum: match.documento_numero,
          docType: match.tipo_documento,
          cliente: match.cliente_nombre,
          creadoPor: match.creado_por,
          searchType: match.tipo_documento || 'factura'
        };

        // Auto-assign in caliente if from general queue
        if (match.asignacion_id === null) {
          db.prepare(`
            UPDATE ops_delivery_queue 
            SET asignacion_id = ?, estado = 'en_ruta', canal_registro = 'telegram', gestionado_por = 'Chofer (Auto-Asignado)' 
            WHERE id = ?
          `).run(activeAssRow.id, match.id);
        }

        // Set Lock
        db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?').run(new Date().toISOString(), chatIdStr, match.id);

        const flowName = match.tipo_documento === 'recoger' ? 'collects_menu' : 'delivery_menu';
        const stepName = match.tipo_documento === 'recoger' ? 'collect_confirm_document' : 'delivery_confirm_document';
        await saveTelegramState(chatIdStr, flowName, stepName, newTempData);

        await sendTelegramMessage(
          botToken,
          chatId,
          formatDocumentDetailMessage(match),
          confirmKeyboard
        );
      } catch (err: any) {
        console.error("Error in doc command interceptor:", err);
        await sendTelegramMessage(botToken, chatId, "❌ Error al procesar el comando del documento.");
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/TKT_') || text.startsWith('/tkt_')) {
      try {
        const cleanedText = text.substring(1).toUpperCase(); // e.g. TKT_FLOT_000002
        const db = await getDb();
        
        let ticket = db.prepare("SELECT * FROM repair_tickets WHERE UPPER(consecutive) = ? AND department_id = 1").get(cleanedText) as any;
        if (!ticket) {
          const hyphenated = cleanedText.replace(/_/g, '-');
          ticket = db.prepare("SELECT * FROM repair_tickets WHERE UPPER(consecutive) = ? AND department_id = 1").get(hyphenated) as any;
        }

        if (!ticket) {
          await sendTelegramMessage(botToken, chatId, `⚠️ El ticket <b>"${cleanedText}"</b> no existe o no se encuentra en el taller de flota.`);
          return NextResponse.json({ ok: true });
        }

        if (!linkage.isMechanic) {
          await sendTelegramMessage(botToken, chatId, "❌ Solo los mecánicos autorizados pueden gestionar tickets.");
          return NextResponse.json({ ok: true });
        }

        const newTempData: any = {
          ticketId: ticket.id,
          consecutive: ticket.consecutive,
          status: ticket.status,
          subject: ticket.subject
        };

        // Fetch assignee name if any
        let assigneeName = 'Sin Asignar 👤';
        if (ticket.assignee_id) {
          const assRow = db.prepare("SELECT name FROM core_users WHERE id = ?").get(ticket.assignee_id) as { name: string } | undefined;
          if (assRow) assigneeName = assRow.name;
        }

        // Set state to mech_manage_action so the NEXT action from user is processed in the action step!
        await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_action', newTempData);

        const manageKeyboard = {
          keyboard: [
            [{ text: "1. Cambiar Estado 🔄" }, { text: "2. Asignármelo 🙋‍♂️" }],
            [{ text: "3. Consumir Repuesto 📦" }, { text: "4. Agregar Nota 📝" }],
            [{ text: "5. Cerrar Ticket ✅" }],
            [{ text: "Cancelar ❌" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        };

        const statusEmoji = ticket.status === 'in_progress' ? '🔄' : ticket.status === 'on_hold' ? '⚠️' : '📥';
        const ticketDetails = 
          `🛠️ <b>Gestión de Ticket: ${ticket.consecutive}</b>\n\n` +
          `• Estado: ${statusEmoji} <b>${ticket.status.toUpperCase()}</b>\n` +
          `• Prioridad: <b>${ticket.priority.toUpperCase()}</b>\n` +
          `• Tipo Maint: <b>${(ticket.maintenance_type || 'N/D').toUpperCase()}</b>\n` +
          `• Vehículo: <b>${ticket.equipment_name}</b>\n` +
          `• Asunto: <b>${ticket.subject}</b>\n` +
          `• Detalle: <i>${ticket.description}</i>\n` +
          `• Técnico Asignado: <b>${assigneeName}</b>\n\n` +
          `¿Qué acción deseas realizar sobre este ticket?`;

        await sendTelegramMessage(botToken, chatId, ticketDetails, manageKeyboard);

        // Check if there is an evidence photo attached inside ticket description
        const photoRegex = /\[Foto de Evidencia(?: de Cierre)?:?\s*([^\]]+)\]/i;
        const photoMatch = ticket.description ? ticket.description.match(photoRegex) : null;
        if (photoMatch) {
          const photoFilename = photoMatch[1].trim();
          const photoPath = path.join(process.cwd(), 'fleet_uploads', photoFilename);
          if (fs.existsSync(photoPath)) {
            await sendTelegramPhoto(botToken, chatId, photoPath, `📸 Evidencia adjunta para el ticket <b>${ticket.consecutive}</b>`);
          } else {
            console.warn(`Photo file not found: ${photoPath}`);
          }
        }
      } catch (err: any) {
        console.error("Error in ticket command interceptor:", err);
        await sendTelegramMessage(botToken, chatId, "❌ Error al procesar el comando del ticket.");
      }
      return NextResponse.json({ ok: true });
    }

    if (text === '/start' || text.toLowerCase() === '/menu' || text.toLowerCase() === 'menu') {
      await deleteTelegramState(chatIdStr);
      const activeModules = getActiveModules(linkage);
      if (activeModules.length === 1) {
        const activeMod = activeModules[0];
        if (activeMod === 'deliveries') {
          await saveTelegramState(chatIdStr, 'submenu_transportes', 'home', {});
          await sendTelegramMessage(
            botToken,
            chatId,
            `🤖 <b>Bot General Garend - Transportes y Entregas</b>\nHola, <b>${linkage.employeeName || message.from?.first_name}</b>. ¿Qué deseas hacer hoy?`,
            getTransportesMenuKeyboard(linkage, false)
          );
        } else if (activeMod === 'flota') {
          await saveTelegramState(chatIdStr, 'submenu_flota', 'home', {});
          await sendTelegramMessage(
            botToken,
            chatId,
            `🤖 <b>Bot General Garend - Flota y Taller</b>\nHola, <b>${linkage.employeeName || message.from?.first_name}</b>. ¿Qué deseas hacer hoy?`,
            getFlotaMenuKeyboard(linkage, false, getShowRtv())
          );
        } else if (activeMod === 'warehouse') {
          await saveTelegramState(chatIdStr, 'submenu_warehouse', 'home', {});
          await sendTelegramMessage(
            botToken,
            chatId,
            `🤖 <b>Bot General Garend - Almacén</b>\nHola, <b>${linkage.employeeName || message.from?.first_name}</b>. ¿Qué deseas hacer hoy?`,
            getWarehouseMenuKeyboard(linkage, false)
          );
        }
      } else {
        await sendTelegramMessage(
          botToken, 
          chatId, 
          `🤖 <b>Bot General Garend</b>\nHola, <b>${linkage.employeeName || message.from?.first_name}</b>. ¿Qué deseas hacer hoy?`,
          getDynamicMenuKeyboard(linkage)
        );
      }
      return NextResponse.json({ ok: true });
    }

    const state = await getTelegramState(chatIdStr);

    // Initial Trigger for flows
    if (!state || !state.currentFlow) {
      const db = await getDb();
      const active = getActiveModules(linkage);
      const hasMultiple = active.length > 1;

      // SUBMENU NAVIGATION TRIGGERS (when in main category menu)
      if (text === "🚛 Transportes y Entregas") {
        if (linkage.allowDeliveries === 0 && linkage.allowFuel === 0 && linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes accesos a este módulo.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'submenu_transportes', 'home', {});
        await sendTelegramMessage(
          botToken,
          chatId,
          `🚛 <b>Transportes y Entregas</b>\nPor favor, selecciona una opción:`,
          getTransportesMenuKeyboard(linkage, hasMultiple)
        );
        return NextResponse.json({ ok: true });
      }

      if (text === "🛠️ Flota y Taller") {
        if (!linkage.isMechanic || (linkage.allowMaintenance === 0 && linkage.allowFuel === 0)) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes accesos a este módulo.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'submenu_flota', 'home', {});
        await sendTelegramMessage(
          botToken,
          chatId,
          `🛠️ <b>Flota y Taller</b>\nPor favor, selecciona una opción:`,
          getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv())
        );
        return NextResponse.json({ ok: true });
      }

      if (text === "📦 Almacén") {
        if (linkage.allowWarehouse === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes accesos a este módulo.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'submenu_warehouse', 'home', {});
        await sendTelegramMessage(
          botToken,
          chatId,
          `📦 <b>Almacén e Inventario</b>\nPor favor, selecciona una opción:`,
          getWarehouseMenuKeyboard(linkage, hasMultiple)
        );
        return NextResponse.json({ ok: true });
      }

      if (text === "Volver al Menú Principal 🔙") {
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(
          botToken,
          chatId,
          `🤖 <b>Bot General Garend</b>\n¿Qué deseas hacer hoy?`,
          getDynamicMenuKeyboard(linkage)
        );
        return NextResponse.json({ ok: true });
      }

      if (text === "📝 Registrar Entregas" || text === "🛣️ Iniciar Nueva Ruta") {
        await startDeliveriesFlow(db, botToken, chatId, chatIdStr, linkage);
        return NextResponse.json({ ok: true });
      }

      if (text === "📦 Registrar Recolectas") {
        await startCollectsFlow(db, botToken, chatId, chatIdStr, linkage);
        return NextResponse.json({ ok: true });
      }

      if (text === "⛽ Registrar Combustible (Mi Vehículo)" || text === "⛽ Registrar Combustible (Mi Camión)") {
        if (linkage.allowFuel === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para registrar combustible. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        const parent = linkage.isMechanic ? 'submenu_flota' : 'submenu_transportes';
        await handleMiCamionFuel(db, botToken, chatId, chatIdStr, linkage, parent);
        return NextResponse.json({ ok: true });
      }

      if (text === "🔧 Reportar Avería (Mi Vehículo)" || text === "🔧 Reportar Avería (Mi Camión)") {
        if (linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para reportar averías. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        const parent = linkage.isMechanic ? 'submenu_flota' : 'submenu_transportes';
        await handleMiCamionAveria(db, botToken, chatId, chatIdStr, linkage, parent);
        return NextResponse.json({ ok: true });
      }

      if (text === "📋 Mis Tickets Abiertos") {
        if (!linkage.isMechanic) {
          await sendTelegramMessage(botToken, chatId, "⚠️ Opción solo permitida para mecánicos de taller.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        const userId = await getCoreUserIdFromLinkage(linkage.employeeId);
        const tickets = await getOpenTicketsForMechanic(userId);
        if (tickets.length === 0) {
          await sendTelegramMessage(botToken, chatId, "📋 No tienes tickets abiertos asignados o pendientes de asignar en este momento.", getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv()));
        } else {
          let msg = "📋 <b>Tus Tickets Abiertos / Pendientes:</b>\n\n";
          for (const t of tickets) {
            const statusEmoji = t.status === 'in_progress' ? '🔄' : t.status === 'on_hold' ? '⚠️' : '📥';
            const priorityEmoji = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '🟡';
            msg += `${statusEmoji} <code>${t.consecutive}</code> [${t.status.toUpperCase()}]\n`;
            msg += `• Vehículo: <b>${t.equipment_name}</b>\n`;
            msg += `• Asunto: <b>${t.subject}</b>\n`;
            msg += `• Prioridad: ${priorityEmoji} ${t.priority.toUpperCase()}\n\n`;
          }
          msg += "<i>Para gestionar cualquiera de estos tickets, digita su consecutivo usando la opción Gestionar Ticket del taller.</i>";
          await sendTelegramMessage(botToken, chatId, msg, getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv()));
        }
        return NextResponse.json({ ok: true });
      }

      if (text === "🛠️ Crear Ticket de Trabajo") {
        if (!linkage.isMechanic) {
          await sendTelegramMessage(botToken, chatId, "⚠️ Opción solo permitida para mecánicos de taller.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'mechanic_create_ticket', 'mech_create_plate', {});
        await sendTelegramMessage(botToken, chatId, "🛠️ <b>Reportar Mantenimiento Abierto (Taller)</b>\nPor favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela manualmente:", plateQueryKeyboard);
        return NextResponse.json({ ok: true });
      }

      if (text === "⛽ Combustible General (Flota)") {
        if (linkage.allowFuel === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para registrar combustible. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'fuel', 'fuel_plate', {});
        await sendTelegramMessage(botToken, chatId, "📋 Por favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela manualmente:", plateQueryKeyboard);
        return NextResponse.json({ ok: true });
      }

      if (text === "⚠️ Consultar Alertas") {
        if (linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para consultar alertas. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'alerts', 'alerts_options', {});
        await sendTelegramMessage(
          botToken, 
          chatId, 
          "⚠️ <b>Consultar Alertas de Flota</b>\n¿Qué tipo de consulta deseas realizar?", 
          alertsOptionsKeyboard
        );
        return NextResponse.json({ ok: true });
      }

      if (text === "⚠️ Alertas (Mi Vehículo)") {
        if (linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para consultar alertas. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await handleDriverAlerts(db, botToken, chatId, chatIdStr, linkage);
        return NextResponse.json({ ok: true });
      }

      if (text === "⏳ Historial Mantenimientos") {
        if (linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para consultar historial. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'history', 'history_plate', {});
        await sendTelegramMessage(botToken, chatId, "📋 Por favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela para consultar el historial:", plateQueryKeyboard);
        return NextResponse.json({ ok: true });
      }

      if (text === "⏳ Historial (Mi Vehículo)") {
        if (linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para consultar historial. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await handleDriverHistory(db, botToken, chatId, chatIdStr, linkage);
        return NextResponse.json({ ok: true });
      }

      if (text === "📅 Consultar RTV") {
        const askRtvRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_rtv'").get() as { value: string } | undefined;
        if (askRtvRow && askRtvRow.value === 'false') {
          await sendTelegramMessage(botToken, chatId, "⚠️ La función de renovación de RTV está desactivada por la administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        if (linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para renovar RTV. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'rtv_renewal', 'rtv_plate', {});
        await sendTelegramMessage(botToken, chatId, "📋 Por favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela para renovar su RTV:", plateQueryKeyboard);
        return NextResponse.json({ ok: true });
      }

      if (text === "📅 RTV (Mi Vehículo)") {
        if (linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para renovar RTV. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await handleDriverRtv(db, botToken, chatId, chatIdStr, linkage);
        return NextResponse.json({ ok: true });
      }

      if (text === "🔍 Consulta de Almacén") {
        if (linkage.allowWarehouse === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para consultas de almacén. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        await saveTelegramState(chatIdStr, 'warehouse_search', 'search_code', {});
        await sendTelegramMessage(botToken, chatId, "📦 <b>Consulta de Artículo (Almacén)</b>\nPor favor, escribe el <b>código exacto</b> o código de barras del producto a consultar:", cancelOnlyKeyboard);
        return NextResponse.json({ ok: true });
      }
      // Fallback triggers for root menu
      if (text.includes("Repostaje") || text.toLowerCase() === '1') {
        if (linkage.allowFuel === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para registrar repostajes. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        if (linkage.isMechanic) {
          await saveTelegramState(chatIdStr, 'fuel', 'fuel_plate', { parentSubmenu: 'submenu_flota' });
          await sendTelegramMessage(botToken, chatId, "📋 Por favor, selecciona la placa del vehículo de la lista o escríbela manualmente:", plateQueryKeyboard);
        } else {
          const parent = linkage.isMechanic ? 'submenu_flota' : 'submenu_transportes';
          await handleMiCamionFuel(db, botToken, chatId, chatIdStr, linkage, parent);
        }
        return NextResponse.json({ ok: true });
      }

      if (text.includes("Mantenimiento") || text.includes("Avería") || text.toLowerCase() === '2') {
        if (linkage.allowMaintenance === 0) {
          await sendTelegramMessage(botToken, chatId, "⚠️ No tienes permisos asignados para registrar mantenimientos. Contacta a administración.", getDynamicMenuKeyboard(linkage));
          return NextResponse.json({ ok: true });
        }
        if (linkage.isMechanic) {
          await saveTelegramState(chatIdStr, 'mechanic_create_ticket', 'mech_create_plate', { parentSubmenu: 'submenu_flota' });
          await sendTelegramMessage(botToken, chatId, "🛠️ <b>Reportar Mantenimiento Abierto (Taller)</b>\nPor favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela manualmente:", plateQueryKeyboard);
        } else {
          const parent = linkage.isMechanic ? 'submenu_flota' : 'submenu_transportes';
          await handleMiCamionAveria(db, botToken, chatId, chatIdStr, linkage, parent);
        }
        return NextResponse.json({ ok: true });
      }
      await sendFlowFallbackMessage(db, botToken, chatId, chatIdStr, state, linkage, text);
      return NextResponse.json({ ok: true });
    }

    // SUBMENU FLOW STATES
    if (state.currentFlow === 'submenu_transportes') {
      const db = await getDb();
      if (text === "📝 Registrar Entregas" || text === "🛣️ Iniciar Nueva Ruta") {
        await startDeliveriesFlow(db, botToken, chatId, chatIdStr, linkage);
      } else if (text === "📦 Registrar Recolectas") {
        await startCollectsFlow(db, botToken, chatId, chatIdStr, linkage);
      } else if (text === "⛽ Registrar Combustible (Mi Vehículo)" || text === "⛽ Registrar Combustible (Mi Camión)") {
        await handleMiCamionFuel(db, botToken, chatId, chatIdStr, linkage, 'submenu_transportes');
      } else if (text === "🔧 Reportar Avería (Mi Vehículo)" || text === "🔧 Reportar Avería (Mi Camión)") {
        await handleMiCamionAveria(db, botToken, chatId, chatIdStr, linkage, 'submenu_transportes');
      } else if (text === "Volver al Menú Principal 🔙") {
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "🤖 Volviendo al menú principal.", getDynamicMenuKeyboard(linkage));
      } else {
        await sendFlowFallbackMessage(db, botToken, chatId, chatIdStr, state, linkage, text);
      }
      return NextResponse.json({ ok: true });
    }

    if (state.currentFlow === 'submenu_flota') {
      const db = await getDb();
      const hasMultiple = getActiveModules(linkage).length > 1;
      if (text === "📋 Mis Tickets Abiertos" && linkage.isMechanic) {
        const userId = await getCoreUserIdFromLinkage(linkage.employeeId);
        const tickets = await getOpenTicketsForMechanic(userId);
        if (tickets.length === 0) {
          await sendTelegramMessage(botToken, chatId, "📋 No tienes tickets abiertos asignados o pendientes de asignar en este momento.", getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv()));
        } else {
          let msg = "📋 <b>Tus Tickets Abiertos / Pendientes:</b>\n\n";
          for (const t of tickets) {
            const statusEmoji = t.status === 'in_progress' ? '🔄' : t.status === 'on_hold' ? '⚠️' : '📥';
            const priorityEmoji = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '🟡';
            msg += `${statusEmoji} <code>${t.consecutive}</code> [${t.status.toUpperCase()}]\n`;
            msg += `• Vehículo: <b>${t.equipment_name}</b>\n`;
            msg += `• Asunto: <b>${t.subject}</b>\n`;
            msg += `• Prioridad: ${priorityEmoji} ${t.priority.toUpperCase()}\n\n`;
          }
          msg += "<i>Para gestionar cualquiera de estos tickets, presiona la opción Gestionar Ticket del taller.</i>";
          await sendTelegramMessage(botToken, chatId, msg, getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv()));
        }
      } else if (text === "🛠️ Gestionar Ticket" && linkage.isMechanic) {
        await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_select', {});
        const userId = await getCoreUserIdFromLinkage(linkage.employeeId);
        const tickets = await getOpenTicketsForMechanic(userId);
        if (tickets.length === 0) {
          await sendTelegramMessage(botToken, chatId, "🛠️ <b>Gestionar Ticket de Taller</b>\nNo tienes tickets abiertos o pendientes en este momento.", getFlotaMenuKeyboard(linkage, hasMultiple, getShowRtv()));
        } else {
          let msg = "🛠️ <b>Gestión de Tickets de Taller</b>\n\n" +
                    "Presiona sobre el comando rápido (enlace azul) del ticket que deseas gestionar:\n\n";
          for (const t of tickets) {
            const statusEmoji = t.status === 'in_progress' ? '🔄' : t.status === 'on_hold' ? '⚠️' : '📥';
            const priorityEmoji = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '🟡';
            const cmdLink = `/${t.consecutive.replace(/-/g, '_')}`;
            const desc = t.description && t.description.length > 80 ? t.description.substring(0, 80) + '...' : (t.description || 'Sin descripción');
            msg += `${statusEmoji} <code>${t.consecutive}</code> [${t.status.toUpperCase()}]\n`;
            msg += `• Vehículo: <b>${t.equipment_name}</b>\n`;
            msg += `• Asunto: <b>${t.subject}</b>\n`;
            msg += `• Detalle: <i>${desc}</i>\n`;
            msg += `• Prioridad: ${priorityEmoji} ${t.priority.toUpperCase()}\n`;
            msg += `👉 <b>Gestionar:</b> ${cmdLink}\n\n`;
            msg += `-----------------------------------\n\n`;
          }
          await sendTelegramMessage(botToken, chatId, msg, cancelOnlyKeyboard);
        }
      } else if (text === "🛠️ Crear Ticket de Trabajo" && linkage.isMechanic) {
        await saveTelegramState(chatIdStr, 'mechanic_create_ticket', 'mech_create_plate', { parentSubmenu: 'submenu_flota' });
        await sendTelegramMessage(botToken, chatId, "🛠️ <b>Reportar Mantenimiento Abierto (Taller)</b>\nPor favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela manualmente:", plateQueryKeyboard);
      } else if (text === "⛽ Combustible General (Flota)" && linkage.isMechanic) {
        await saveTelegramState(chatIdStr, 'fuel', 'fuel_plate', { parentSubmenu: 'submenu_flota' });
        await sendTelegramMessage(botToken, chatId, "📋 Por favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela manualmente:", plateQueryKeyboard);
      } else if ((text === "⛽ Registrar Combustible (Mi Vehículo)" || text === "⛽ Registrar Combustible (Mi Camión)") && !linkage.isMechanic) {
        await handleMiCamionFuel(db, botToken, chatId, chatIdStr, linkage, 'submenu_flota');
      } else if ((text === "🔧 Reportar Avería (Mi Vehículo)" || text === "🔧 Reportar Avería (Mi Camión)") && !linkage.isMechanic) {
        await handleMiCamionAveria(db, botToken, chatId, chatIdStr, linkage, 'submenu_flota');
      } else if (text === "⚠️ Alertas (Mi Vehículo)" && !linkage.isMechanic) {
        await handleDriverAlerts(db, botToken, chatId, chatIdStr, linkage);
      } else if (text === "⏳ Historial (Mi Vehículo)" && !linkage.isMechanic) {
        await handleDriverHistory(db, botToken, chatId, chatIdStr, linkage);
      } else if (text === "📅 RTV (Mi Vehículo)" && !linkage.isMechanic) {
        await handleDriverRtv(db, botToken, chatId, chatIdStr, linkage);
      } else if (text === "⚠️ Consultar Alertas" && linkage.isMechanic) {
        await saveTelegramState(chatIdStr, 'alerts', 'alerts_options', { parentSubmenu: 'submenu_flota' });
        await sendTelegramMessage(botToken, chatId, "⚠️ <b>Consultar Alertas de Flota</b>\n¿Qué tipo de consulta deseas realizar?", alertsOptionsKeyboard);
      } else if (text === "⏳ Historial Mantenimientos" && linkage.isMechanic) {
        await saveTelegramState(chatIdStr, 'history', 'history_plate', { parentSubmenu: 'submenu_flota' });
        await sendTelegramMessage(botToken, chatId, "📋 Por favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela para consultar el historial:", plateQueryKeyboard);
      } else if (text === "📅 Consultar RTV" && linkage.isMechanic) {
        await saveTelegramState(chatIdStr, 'rtv_renewal', 'rtv_plate', { parentSubmenu: 'submenu_flota' });
        await sendTelegramMessage(botToken, chatId, "📋 Por favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela para renovar su RTV:", plateQueryKeyboard);
      } else if (text === "Volver al Menú Principal 🔙") {
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "🤖 Volviendo al menú principal.", getDynamicMenuKeyboard(linkage));
      } else {
        await sendFlowFallbackMessage(db, botToken, chatId, chatIdStr, state, linkage, text);
      }
      return NextResponse.json({ ok: true });
    }

    if (state.currentFlow === 'submenu_warehouse') {
      const db = await getDb();
      const hasMultiple = getActiveModules(linkage).length > 1;
      if (text === "🔍 Consulta de Almacén") {
        await saveTelegramState(chatIdStr, 'warehouse_search', 'search_code', {});
        await sendTelegramMessage(botToken, chatId, "📦 <b>Consulta de Artículo (Almacén)</b>\nPor favor, escribe el <b>código exacto</b> o código de barras del producto a consultar:", cancelOnlyKeyboard);
      } else if (text === "Volver al Menú Principal 🔙") {
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "🤖 Volviendo al menú principal.", getDynamicMenuKeyboard(linkage));
      } else {
        await sendFlowFallbackMessage(db, botToken, chatId, chatIdStr, state, linkage, text);
      }
      return NextResponse.json({ ok: true });
    }

    const tempData = safeJsonParse(state.tempData);

    // A. REPOSTAJES FLOW (FUEL)
    if (state.currentFlow === 'fuel') {
      switch (state.step) {
        case 'fuel_plate': {
          if (text === '👥 Seleccionar Placa de Lista') {
            await sendPlatesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            const suggestions = await getPlateSuggestions(text);
            let errorMsg = `❌ Vehículo con placa <b>"${text}"</b> no encontrado.`;
            if (suggestions.length > 0) {
              errorMsg += `\n\n¿Quisiste decir alguna de estas?\n` + suggestions.map((s, idx) => `<b>${idx + 1}-</b> <code>${s}</code>`).join('\n') + `\n\nPor favor, escribe de nuevo la placa correcta del vehículo:`;
            } else {
              errorMsg += `\n\nPor favor, ingresa una placa válida o selecciónala de la lista:`;
            }
            await sendTelegramMessage(botToken, chatId, errorMsg, plateQueryKeyboard);
            return NextResponse.json({ ok: true });
          }
          
          tempData.vehicleId = vehicle.id;
          tempData.plate = vehicle.plate;
          tempData.brand = vehicle.brand;
          tempData.model = vehicle.model;
          tempData.currentMileage = vehicle.currentMileage || 0;
          tempData.fuelType = vehicle.fuelType || '';

          await saveTelegramState(chatIdStr, 'fuel', 'fuel_liters', tempData);
          await sendTelegramMessage(
            botToken, 
            chatId, 
            `⛽ <b>${vehicle.brand} ${vehicle.model} (${vehicle.plate})</b>\n¿Cuántos <b>litros</b> se cargaron? (Ingresa solo el número):`,
            cancelOnlyKeyboard
          );
          break;
        }

        case 'fuel_liters': {
          const liters = parseFloat(text.replace(',', '.'));
          if (isNaN(liters) || liters <= 0) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Litros inválidos. Por favor, ingresa solo un número positivo (ej: 45.5):", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.liters = liters;

          await saveTelegramState(chatIdStr, 'fuel', 'fuel_odometer', tempData);
          await sendTelegramMessage(
            botToken, 
            chatId, 
            `🚗 El odómetro actual del vehículo es <b>${tempData.currentMileage} km</b>.\n¿Cuál es la lectura actual del <b>odómetro</b> (kilometraje)?:`,
            cancelOnlyKeyboard
          );
          break;
        }

        case 'fuel_odometer': {
          const mileageBefore = parseFloat(text.replace(',', '.'));
          if (isNaN(mileageBefore) || mileageBefore < tempData.currentMileage) {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              `⚠️ El kilometraje no puede ser menor al actual (<b>${tempData.currentMileage} km</b>). Por favor, ingresa la lectura correcta del odómetro:`,
              cancelOnlyKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          tempData.mileageBefore = mileageBefore;

          // Estimate cost based on fuel setting price
          const db = await getDb();
          const fuelTypeSettings = db.prepare("SELECT id, value, price FROM fleet_settings WHERE category = 'fuel_type'").all() as any[];
          const matchingSetting = fuelTypeSettings.find(s => String(s.value).toLowerCase() === String(tempData.fuelType).toLowerCase());
          
          const fuelTypeId = matchingSetting ? matchingSetting.id : null;
          const fuelPrice = matchingSetting ? (matchingSetting.price || 0) : 0;
          const estimatedCost = Math.round(tempData.liters * fuelPrice);

          tempData.fuelTypeId = fuelTypeId;
          tempData.estimatedCost = estimatedCost;

          await saveTelegramState(chatIdStr, 'fuel', 'fuel_cost', tempData);

          const costKeyboard = {
            keyboard: [
              [{ text: `Usar estimado: ₡${estimatedCost}` }],
              [{ text: "Cancelar ❌" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          };

          await sendTelegramMessage(
            botToken, 
            chatId, 
            `💰 Costo estimado basado en tarifa de ${tempData.fuelType || 'combustible'}: <b>₡${estimatedCost.toLocaleString('es-CR')}</b>.\n\n¿Cuál fue el <b>costo real</b> de la recarga?\n(Presiona el botón de abajo para usar el costo estimado o escribe el monto real directamente):`,
            costKeyboard
          );
          break;
        }

        case 'fuel_cost': {
          let cost = 0;
          if (text.startsWith('Usar estimado:')) {
            cost = tempData.estimatedCost;
          } else {
            cost = parseFloat(text.replace(/[^0-9.]/g, '').replace(',', '.'));
          }

          if (isNaN(cost) || cost < 0) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Costo real inválido. Por favor, escribe un monto numérico válido o presiona el botón para usar el estimado:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.cost = cost;

          const botSettings = await getTelegramBotSettings();
          tempData.requirePhotoFuel = botSettings.requirePhotoFuel;

          await saveTelegramState(chatIdStr, 'fuel', 'fuel_photo', tempData);

          if (botSettings.requirePhotoFuel) {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              "📸 <b>[FOTO OBLIGATORIA]</b>\nPor favor, toma y envía una <b>foto del ticket de combustible</b> para continuar:",
              cancelOnlyKeyboard
            );
          } else {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              "📸 <b>[FOTO OPCIONAL]</b>\nPor favor, envía una <b>foto del ticket de combustible</b> o presiona el botón de abajo para omitir:",
              skipPhotoKeyboard
            );
          }
          break;
        }

        case 'fuel_photo': {
          let hasPhoto = false;
          let photoFilename = null;

          if (message.photo && message.photo.length > 0) {
            try {
              // Grab the highest resolution photo
              const photo = message.photo[message.photo.length - 1];
              await sendTelegramMessage(botToken, chatId, "⏳ Procesando y guardando imagen...");
              photoFilename = await downloadTelegramFile(botToken, photo.file_id);
              hasPhoto = true;
            } catch (err: any) {
              console.error("Error downloading telegram photo", err);
              await sendTelegramMessage(botToken, chatId, "⚠️ Error al descargar la foto. Intenta enviarla de nuevo o escribe /cancelar:");
              return NextResponse.json({ ok: true });
            }
          }

          if (!hasPhoto && text === 'Omitir foto ⏭️') {
            if (tempData.requirePhotoFuel) {
              await sendTelegramMessage(botToken, chatId, "⚠️ La foto es obligatoria para este registro. Por favor toma y envía la foto:", cancelOnlyKeyboard);
              return NextResponse.json({ ok: true });
            }
          } else if (!hasPhoto) {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              tempData.requirePhotoFuel 
                ? "⚠️ Entrada inválida. Por favor, envía una foto del ticket de combustible:" 
                : "⚠️ Entrada inválida. Envía una foto del ticket de combustible o presiona 'Omitir foto ⏭️':",
              tempData.requirePhotoFuel ? cancelOnlyKeyboard : skipPhotoKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          tempData.photoFilename = photoFilename;

          await saveTelegramState(chatIdStr, 'fuel', 'fuel_confirm', tempData);

          const summary = 
            `📝 <b>Resumen del Repostaje</b>\n\n` +
            `🚗 Vehículo: <b>${tempData.brand} ${tempData.model} (${tempData.plate})</b>\n` +
            `⛽ Litros: <b>${tempData.liters} L</b>\n` +
            `🚗 Odómetro: <b>${tempData.mileageBefore.toLocaleString('es-CR')} km</b>\n` +
            `💰 Costo: <b>₡${tempData.cost.toLocaleString('es-CR')}</b>\n` +
            `📸 Foto: <b>${tempData.photoFilename ? '✅ Adjuntada' : '❌ Omitida'}</b>\n\n` +
            `¿Confirmas el registro de este repostaje?`;

          await sendTelegramMessage(botToken, chatId, summary, confirmKeyboard);
          break;
        }

        case 'fuel_confirm': {
          if (text === 'Sí, registrar ✅') {
            try {
              const notes = tempData.photoFilename ? `[Foto: ${tempData.photoFilename}]` : '';
              await saveTelegramFuelLog({
                vehicleId: tempData.vehicleId,
                date: new Date().toISOString().substring(0, 10),
                mileageBefore: tempData.mileageBefore,
                liters: tempData.liters,
                cost: tempData.cost,
                fuelTypeId: tempData.fuelTypeId,
                notes: notes,
                driverId: linkage.employeeId
              }, linkage.employeeName || 'Telegram Bot');
              await returnUserToSubmenu(chatIdStr, chatId, linkage, 'fuel', "✅ Repostaje registrado y guardado con éxito.", botToken);
            } catch (err: any) {
              console.error("Error writing fuel log via Telegram", err);
              await returnUserToSubmenu(chatIdStr, chatId, linkage, 'fuel', "❌ Error al registrar en la base de datos. Intente de nuevo.", botToken);
            }
          } else if (text === 'No, cancelar ❌') {
            await returnUserToSubmenu(chatIdStr, chatId, linkage, 'fuel', "❌ Registro cancelado.", botToken);
          } else {
            await sendTelegramMessage(botToken, chatId, "Por favor, selecciona una de las opciones:", confirmKeyboard);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // B. MANTENIMIENTOS FLOW (MAINTENANCE)
    if (state.currentFlow === 'maintenance') {
      switch (state.step) {
        case 'maint_plate': {
          if (text === '👥 Seleccionar Placa de Lista') {
            await sendPlatesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida o selecciónala de la lista:`, plateQueryKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.vehicleId = vehicle.id;
          tempData.plate = vehicle.plate;
          tempData.brand = vehicle.brand;
          tempData.model = vehicle.model;
          tempData.currentMileage = vehicle.currentMileage || 0;

          await saveTelegramState(chatIdStr, 'maintenance', 'maint_odometer', tempData);
          await sendTelegramMessage(
            botToken, 
            chatId, 
            `🚗 El odómetro actual es de <b>${vehicle.currentMileage} km</b>.\n¿Cuál es la lectura actual del <b>odómetro</b> (kilometraje)?:`,
            cancelOnlyKeyboard
          );
          break;
        }

        case 'maint_odometer': {
          const mileage = parseFloat(text.replace(',', '.'));
          if (isNaN(mileage) || mileage < tempData.currentMileage) {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              `⚠️ El kilometraje no puede ser menor al actual (<b>${tempData.currentMileage} km</b>). Ingresa la lectura correcta del odómetro:`,
              cancelOnlyKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          tempData.mileage = mileage;

          const types = await getMaintenanceTypes();
          
          // Make keyboard with dynamic list of maintenance types
          const typeRows = [];
          for (let i = 0; i < types.length; i += 2) {
            const row = [];
            row.push({ text: types[i] });
            if (i + 1 < types.length) {
              row.push({ text: types[i + 1] });
            }
            typeRows.push(row);
          }
          typeRows.push([{ text: "Cancelar ❌" }]);

          const typeKeyboard = {
            keyboard: typeRows,
            resize_keyboard: true,
            one_time_keyboard: true
          };

          await saveTelegramState(chatIdStr, 'maintenance', 'maint_type', tempData);
          await sendTelegramMessage(
            botToken, 
            chatId, 
            "🔧 Por favor, selecciona el <b>tipo de mantenimiento</b> de la lista o escríbelo:",
            typeKeyboard
          );
          break;
        }

        case 'maint_type': {
          tempData.type = text;

          await saveTelegramState(chatIdStr, 'maintenance', 'maint_cost', tempData);
          await sendTelegramMessage(botToken, chatId, "💰 ¿Cuál fue el <b>costo total</b> del mantenimiento? (Ingresa solo el número):", cancelOnlyKeyboard);
          break;
        }

        case 'maint_cost': {
          const cost = parseFloat(text.replace(/[^0-9.]/g, '').replace(',', '.'));
          if (isNaN(cost) || cost < 0) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Costo inválido. Ingresa un monto numérico positivo:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.cost = cost;

          await saveTelegramState(chatIdStr, 'maintenance', 'maint_performer', tempData);
          await sendTelegramMessage(botToken, chatId, "🔧 ¿Quién realizó el trabajo? (Taller, mecánico, proveedor, etc.):", cancelOnlyKeyboard);
          break;
        }

        case 'maint_performer': {
          tempData.performedBy = text;

          await saveTelegramState(chatIdStr, 'maintenance', 'maint_description', tempData);
          await sendTelegramMessage(botToken, chatId, "✍️ Ingresa una breve <b>descripción</b> del trabajo realizado:", cancelOnlyKeyboard);
          break;
        }

        case 'maint_description': {
          tempData.description = text;

          const botSettings = await getTelegramBotSettings();
          tempData.requirePhotoMaintenance = botSettings.requirePhotoMaintenance;

          await saveTelegramState(chatIdStr, 'maintenance', 'maint_photo', tempData);

          if (botSettings.requirePhotoMaintenance) {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              "📸 <b>[FOTO OBLIGATORIA]</b>\nPor favor, toma y envía una <b>foto del comprobante/taller</b> para continuar:",
              cancelOnlyKeyboard
            );
          } else {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              "📸 <b>[FOTO OPCIONAL]</b>\nPor favor, envía una <b>foto del comprobante/taller</b> o presiona el botón de abajo para omitir:",
              skipPhotoKeyboard
            );
          }
          break;
        }

        case 'maint_photo': {
          let hasPhoto = false;
          let photoFilename = null;

          if (message.photo && message.photo.length > 0) {
            try {
              const photo = message.photo[message.photo.length - 1];
              await sendTelegramMessage(botToken, chatId, "⏳ Procesando y guardando imagen...");
              photoFilename = await downloadTelegramFile(botToken, photo.file_id);
              hasPhoto = true;
            } catch (err: any) {
              console.error("Error downloading telegram maintenance photo", err);
              await sendTelegramMessage(botToken, chatId, "⚠️ Error al descargar la foto. Intenta enviarla de nuevo o escribe /cancelar:");
              return NextResponse.json({ ok: true });
            }
          }

          if (!hasPhoto && text === 'Omitir foto ⏭️') {
            if (tempData.requirePhotoMaintenance) {
              await sendTelegramMessage(botToken, chatId, "⚠️ La foto es obligatoria para este registro. Por favor toma y envía la foto:", cancelOnlyKeyboard);
              return NextResponse.json({ ok: true });
            }
          } else if (!hasPhoto) {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              tempData.requirePhotoMaintenance 
                ? "⚠️ Entrada inválida. Por favor, envía una foto del comprobante/trabajo:" 
                : "⚠️ Entrada inválida. Envía una foto del comprobante o presiona 'Omitir foto ⏭️':",
              tempData.requirePhotoMaintenance ? cancelOnlyKeyboard : skipPhotoKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          tempData.photoFilename = photoFilename;

          await saveTelegramState(chatIdStr, 'maintenance', 'maint_confirm', tempData);

          const summary = 
            `📝 <b>Resumen de Mantenimiento</b>\n\n` +
            `🚗 Vehículo: <b>${tempData.brand} ${tempData.model} (${tempData.plate})</b>\n` +
            `🔧 Tipo: <b>${tempData.type}</b>\n` +
            `🚗 Odómetro: <b>${tempData.mileage.toLocaleString('es-CR')} km</b>\n` +
            `💰 Costo: <b>₡${tempData.cost.toLocaleString('es-CR')}</b>\n` +
            `🔧 Realizado por: <b>${tempData.performedBy}</b>\n` +
            `✍️ Descripción: <b>${tempData.description}</b>\n` +
            `📸 Foto: <b>${tempData.photoFilename ? '✅ Adjuntada' : '❌ Omitida'}</b>\n\n` +
            `¿Confirmas el registro de este mantenimiento?`;

          await sendTelegramMessage(botToken, chatId, summary, confirmKeyboard);
          break;
        }

        case 'maint_confirm': {
          if (text === 'Sí, registrar ✅') {
            try {
              const fullDescription = tempData.photoFilename 
                ? `${tempData.description} [Foto: ${tempData.photoFilename}]`
                : tempData.description;

              await saveTelegramMaintenanceLog({
                vehicleId: tempData.vehicleId,
                date: new Date().toISOString().substring(0, 10),
                mileage: tempData.mileage,
                type: tempData.type,
                description: fullDescription,
                cost: tempData.cost,
                performedBy: tempData.performedBy
              }, linkage.employeeName || 'Telegram Bot');
              await returnUserToSubmenu(chatIdStr, chatId, linkage, 'maint_log', "✅ Mantenimiento registrado y guardado con éxito.", botToken);
            } catch (err: any) {
              console.error("Error writing maintenance log via Telegram", err);
              await returnUserToSubmenu(chatIdStr, chatId, linkage, 'maint_log', "❌ Error al registrar en la base de datos. Intente de nuevo.", botToken);
            }
          } else if (text === 'No, cancelar ❌') {
            await returnUserToSubmenu(chatIdStr, chatId, linkage, 'maint_log', "❌ Registro cancelado.", botToken);
          } else {
            await sendTelegramMessage(botToken, chatId, "Por favor, selecciona una de las opciones:", confirmKeyboard);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // B.1 DRIVER REPORT FAULT FLOW (driver_report_fault)
    if (state.currentFlow === 'driver_report_fault') {
      switch (state.step) {
        case 'driver_maint_plate': {
          if (text === '👥 Seleccionar Placa de Lista') {
            await sendPlatesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida o selecciónala de la lista:`, plateQueryKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.vehicleId = vehicle.id;
          tempData.plate = vehicle.plate;
          tempData.brand = vehicle.brand;
          tempData.model = vehicle.model;

          await saveTelegramState(chatIdStr, 'driver_report_fault', 'driver_maint_subject', tempData);
          await sendTelegramMessage(
            botToken, 
            chatId, 
            `🔧 <b>${vehicle.brand} ${vehicle.model} (${vehicle.plate})</b>\n\n¿Cuál es el <b>asunto o título breve</b> de la avería/mantenimiento que deseas reportar?\n(Ejemplo: <i>Fuga de aceite en motor</i> o <i>Ruido extraño en frenos delanteros</i>):`,
            cancelOnlyKeyboard
          );
          break;
        }

        case 'driver_maint_subject': {
          if (text.length < 5) {
            await sendTelegramMessage(botToken, chatId, "⚠️ El asunto es muy corto. Por favor escribe un título más descriptivo (mínimo 5 caracteres):", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.subject = text;

          await saveTelegramState(chatIdStr, 'driver_report_fault', 'driver_maint_description', tempData);
          await sendTelegramMessage(botToken, chatId, "✍️ Por favor, escribe una <b>descripción detallada</b> del problema o avería:", cancelOnlyKeyboard);
          break;
        }

        case 'driver_maint_description': {
          if (text.length < 10) {
            await sendTelegramMessage(botToken, chatId, "⚠️ La descripción es muy corta. Por favor escribe más detalles del problema (mínimo 10 caracteres):", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.description = text;

          await saveTelegramState(chatIdStr, 'driver_report_fault', 'driver_maint_photo', tempData);
          await sendTelegramMessage(
            botToken, 
            chatId, 
            "📸 <b>[FOTO OPCIONAL]</b>\nPor favor, envía una foto que muestre la avería o presiona el botón para omitir:",
            skipPhotoKeyboard
          );
          break;
        }

        case 'driver_maint_photo': {
          let hasPhoto = false;
          let photoFilename = null;

          if (message.photo && message.photo.length > 0) {
            try {
              const photo = message.photo[message.photo.length - 1];
              await sendTelegramMessage(botToken, chatId, "⏳ Procesando y guardando imagen...");
              photoFilename = await downloadTelegramFile(botToken, photo.file_id);
              hasPhoto = true;
            } catch (err: any) {
              console.error("Error downloading driver fault photo", err);
              await sendTelegramMessage(botToken, chatId, "⚠️ Error al descargar la foto. Intenta enviarla de nuevo o escribe /cancelar:");
              return NextResponse.json({ ok: true });
            }
          }

          tempData.photoFilename = photoFilename;

          await saveTelegramState(chatIdStr, 'driver_report_fault', 'driver_maint_confirm', tempData);

          const summary = 
            `📝 <b>Confirmar Reporte de Avería</b>\n\n` +
            `🚗 Vehículo: <b>${tempData.brand} ${tempData.model} (${tempData.plate})</b>\n` +
            `📌 Asunto: <b>${tempData.subject}</b>\n` +
            `✍️ Detalle: <b>${tempData.description}</b>\n` +
            `📸 Foto: <b>${tempData.photoFilename ? '✅ Adjuntada' : '❌ Omitida'}</b>\n\n` +
            `¿Confirmas el envío de este reporte al Taller de Flota?`;

          await sendTelegramMessage(botToken, chatId, summary, confirmKeyboard);
          break;
        }

        case 'driver_maint_confirm': {
          if (text === 'Sí, registrar ✅') {
            try {
              const fullDesc = tempData.photoFilename 
                ? `${tempData.description}\n\n[Foto de Evidencia: ${tempData.photoFilename}]`
                : tempData.description;

              const consecutive = await createTicketFromTelegram({
                departmentId: 1, // Taller de Flota
                subject: `[Chofer] ${tempData.subject}`,
                description: fullDesc,
                priority: 'medium',
                maintenanceType: 'corrective',
                equipmentName: `${tempData.brand} ${tempData.model} (${tempData.plate})`,
                brand: tempData.brand,
                model: tempData.model,
                serialNumber: tempData.plate,
                user: linkage.employeeName || 'Chofer en Ruta'
              });

              await deleteTelegramState(chatIdStr);
              await sendTelegramMessage(
                botToken, 
                chatId, 
                `✅ <b>¡Reporte Recibido con Éxito!</b>\n\nSe ha creado el ticket <code>${consecutive}</code> en el Taller de Flota en estado <b>ABIERTO</b>.\n\nNuestros mecánicos recibirán la alerta y se encargarán del diagnóstico.`, 
                getDynamicMenuKeyboard(linkage)
              );
            } catch (err: any) {
              console.error("Error creating driver fault ticket", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al guardar el reporte en el sistema. Intente de nuevo.", getDynamicMenuKeyboard(linkage));
              await deleteTelegramState(chatIdStr);
            }
          } else if (text === 'No, cancelar ❌') {
            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(botToken, chatId, "❌ Reporte cancelado.", getDynamicMenuKeyboard(linkage));
          } else {
            await sendTelegramMessage(botToken, chatId, "Por favor, selecciona una de las opciones:", confirmKeyboard);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // B.2 MECHANIC CREATE TICKET FLOW (mechanic_create_ticket)
    if (state.currentFlow === 'mechanic_create_ticket') {
      switch (state.step) {
        case 'mech_create_plate': {
          if (text === '👥 Seleccionar Placa de Lista') {
            await sendPlatesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida o selecciónala de la lista:`, plateQueryKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.vehicleId = vehicle.id;
          tempData.plate = vehicle.plate;
          tempData.brand = vehicle.brand;
          tempData.model = vehicle.model;

          await saveTelegramState(chatIdStr, 'mechanic_create_ticket', 'mech_create_subject', tempData);
          await sendTelegramMessage(
            botToken, 
            chatId, 
            `🛠️ <b>${vehicle.brand} ${vehicle.model} (${vehicle.plate})</b>\n\nIngresa el <b>asunto o título breve</b> de la tarea o mantenimiento:`,
            cancelOnlyKeyboard
          );
          break;
        }

        case 'mech_create_subject': {
          if (text.length < 3) {
            await sendTelegramMessage(botToken, chatId, "⚠️ El asunto es muy corto. Escribe un asunto descriptivo:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.subject = text;

          const maintTypes = await getMaintenanceTypes();
          const keyboardRows: { text: string }[][] = [];
          for (let i = 0; i < maintTypes.length; i += 2) {
            const row: { text: string }[] = [];
            row.push({ text: maintTypes[i] });
            if (i + 1 < maintTypes.length) {
              row.push({ text: maintTypes[i + 1] });
            }
            keyboardRows.push(row);
          }
          keyboardRows.push([{ text: "Cancelar ❌" }]);

          const typeKeyboard = {
            keyboard: keyboardRows,
            resize_keyboard: true,
            one_time_keyboard: true
          };

          await saveTelegramState(chatIdStr, 'mechanic_create_ticket', 'mech_create_type', tempData);
          await sendTelegramMessage(botToken, chatId, "🔧 Selecciona el <b>tipo de mantenimiento</b>:", typeKeyboard);
          break;
        }

        case 'mech_create_type': {
          const maintTypes = await getMaintenanceTypes();
          const matchedType = maintTypes.find(t => t.toLowerCase().trim() === text.toLowerCase().trim());

          if (!matchedType) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Tipo inválido. Por favor selecciona una opción de la lista:");
            return NextResponse.json({ ok: true });
          }

          tempData.maintenanceType = matchedType;

          const priorityKeyboard = {
            keyboard: [
              [{ text: "Baja" }, { text: "Media" }],
              [{ text: "Alta" }, { text: "Urgente" }],
              [{ text: "Cancelar ❌" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          };

          await saveTelegramState(chatIdStr, 'mechanic_create_ticket', 'mech_create_priority', tempData);
          await sendTelegramMessage(botToken, chatId, "🚨 Selecciona la <b>prioridad</b> del ticket:", priorityKeyboard);
          break;
        }

        case 'mech_create_priority': {
          const cleanText = text.toLowerCase().trim();
          const priorityMapping: Record<string, string> = {
            'baja': 'low',
            'media': 'medium',
            'alta': 'high',
            'urgente': 'urgent'
          };
          const cleanPriority = priorityMapping[cleanText];

          if (!cleanPriority) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Prioridad inválida. Por favor selecciona una opción de la lista:");
            return NextResponse.json({ ok: true });
          }

          tempData.priority = cleanPriority;

          await saveTelegramState(chatIdStr, 'mechanic_create_ticket', 'mech_create_description', tempData);
          await sendTelegramMessage(botToken, chatId, "✍️ Ingresa una <b>descripción detallada</b> del trabajo a realizar o el diagnóstico:", cancelOnlyKeyboard);
          break;
        }

        case 'mech_create_description': {
          if (text.length < 5) {
            await sendTelegramMessage(botToken, chatId, "⚠️ La descripción es muy corta. Escribe una descripción detallada:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.description = text;

          await saveTelegramState(chatIdStr, 'mechanic_create_ticket', 'mech_create_confirm', tempData);

          const summary = 
            `📝 <b>Resumen de Apertura de Ticket (Taller)</b>\n\n` +
            `🚗 Vehículo: <b>${tempData.brand} ${tempData.model} (${tempData.plate})</b>\n` +
            `📌 Asunto: <b>${tempData.subject}</b>\n` +
            `🔧 Tipo: <b>${tempData.maintenanceType.toUpperCase()}</b>\n` +
            `🚨 Prioridad: <b>${tempData.priority.toUpperCase()}</b>\n` +
            `✍️ Detalle: <b>${tempData.description}</b>\n\n` +
            `¿Confirmas la apertura de este ticket en estado abierto?`;

          await sendTelegramMessage(botToken, chatId, summary, confirmKeyboard);
          break;
        }

        case 'mech_create_confirm': {
          if (text === 'Sí, registrar ✅') {
            try {
              const userId = await getCoreUserIdFromLinkage(linkage.employeeId);
              
              const consecutive = await createTicketFromTelegram({
                departmentId: 1, // Taller de Flota
                subject: tempData.subject,
                description: tempData.description,
                priority: tempData.priority,
                maintenanceType: tempData.maintenanceType,
                equipmentName: `${tempData.brand} ${tempData.model} (${tempData.plate})`,
                brand: tempData.brand,
                model: tempData.model,
                serialNumber: tempData.plate,
                user: linkage.employeeName || 'Mecánico en Taller'
              });

              // Self-assign ticket automatically to this mechanic
              if (userId) {
                const db = await getDb();
                const ticketRow = db.prepare("SELECT id FROM repair_tickets WHERE consecutive = ?").get(consecutive) as { id: number } | undefined;
                if (ticketRow) {
                  await assignTicketToMechanic(ticketRow.id, userId);
                }
              }

              await deleteTelegramState(chatIdStr);
              await sendTelegramMessage(
                botToken, 
                chatId, 
                `✅ <b>¡Ticket Creado con Éxito!</b>\n\nSe registró el ticket <code>${consecutive}</code> en estado <b>ABIERTO</b> y se auto-asignó a tu persona.\n\nPuedes gestionarlo o cerrarlo desde la sección de "Gestionar Ticket" en cualquier momento.`, 
                getDynamicMenuKeyboard(linkage)
              );
            } catch (err: any) {
              console.error("Error creating mechanic open ticket", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al crear el ticket. Intente de nuevo.", getDynamicMenuKeyboard(linkage));
              await deleteTelegramState(chatIdStr);
            }
          } else if (text === 'No, cancelar ❌') {
            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(botToken, chatId, "❌ Creación cancelada.", getDynamicMenuKeyboard(linkage));
          } else {
            await sendTelegramMessage(botToken, chatId, "Por favor, selecciona una de las opciones:", confirmKeyboard);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // B.3 MECHANIC MANAGE TICKET FLOW (mechanic_manage_ticket)
    if (state.currentFlow === 'mechanic_manage_ticket') {
      const db = await getDb();
      switch (state.step) {
        case 'mech_manage_select': {
          const tConsecutive = text.toUpperCase().trim();
          const ticket = db.prepare("SELECT * FROM repair_tickets WHERE UPPER(consecutive) = ? AND department_id = 1").get(tConsecutive) as any;
          if (!ticket) {
            await sendTelegramMessage(botToken, chatId, `❌ Ticket <b>"${text}"</b> no encontrado en el taller de flota.\nPor favor, escribe un consecutivo válido (ej: <code>TKT-FLOT-000001</code>) o presiona Cancelar:`, cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.ticketId = ticket.id;
          tempData.consecutive = ticket.consecutive;
          tempData.status = ticket.status;
          tempData.subject = ticket.subject;

          // Fetch assignee name if any
          let assigneeName = 'Sin Asignar 👤';
          if (ticket.assignee_id) {
            const assRow = db.prepare("SELECT name FROM core_users WHERE id = ?").get(ticket.assignee_id) as { name: string } | undefined;
            if (assRow) assigneeName = assRow.name;
          }

          await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_action', tempData);

          const manageKeyboard = {
            keyboard: [
              [{ text: "1. Cambiar Estado 🔄" }, { text: "2. Asignármelo 🙋‍♂️" }],
              [{ text: "3. Consumir Repuesto 📦" }, { text: "4. Agregar Nota 📝" }],
              [{ text: "5. Cerrar Ticket ✅" }],
              [{ text: "Cancelar ❌" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          };

          const statusEmoji = ticket.status === 'in_progress' ? '🔄' : ticket.status === 'on_hold' ? '⚠️' : '📥';
          const ticketDetails = 
            `🛠️ <b>Gestión de Ticket: ${ticket.consecutive}</b>\n\n` +
            `• Estado: ${statusEmoji} <b>${ticket.status.toUpperCase()}</b>\n` +
            `• Prioridad: <b>${ticket.priority.toUpperCase()}</b>\n` +
            `• Tipo Maint: <b>${(ticket.maintenance_type || 'N/D').toUpperCase()}</b>\n` +
            `• Vehículo: <b>${ticket.equipment_name}</b>\n` +
            `• Asunto: <b>${ticket.subject}</b>\n` +
            `• Detalle: <i>${ticket.description}</i>\n` +
            `• Técnico Asignado: <b>${assigneeName}</b>\n\n` +
            `¿Qué acción deseas realizar sobre este ticket?`;

          await sendTelegramMessage(botToken, chatId, ticketDetails, manageKeyboard);

          // Check if there is an evidence photo attached inside ticket description
          const photoRegex = /\[Foto de Evidencia(?: de Cierre)?:?\s*([^\]]+)\]/i;
          const photoMatch = ticket.description ? ticket.description.match(photoRegex) : null;
          if (photoMatch) {
            const photoFilename = photoMatch[1].trim();
            const photoPath = path.join(process.cwd(), 'fleet_uploads', photoFilename);
            if (fs.existsSync(photoPath)) {
              await sendTelegramPhoto(botToken, chatId, photoPath, `📸 Evidencia adjunta para el ticket <b>${ticket.consecutive}</b>`);
            } else {
              console.warn(`Photo file not found: ${photoPath}`);
            }
          }
          break;
        }

        case 'mech_manage_action': {
          if (text.includes("Cambiar Estado") || text.toLowerCase() === '1') {
            const statusKeyboard = {
              keyboard: [
                [{ text: "Abierto 📥" }, { text: "En Progreso 🔄" }],
                [{ text: "En Espera ⚠️" }],
                [{ text: "Cancelar ❌" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };
            await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_status', tempData);
            await sendTelegramMessage(botToken, chatId, `🔄 <b>Cambiar Estado del Ticket: ${tempData.consecutive}</b>\nSelecciona el nuevo estado de la lista:`, statusKeyboard);
          } else if (text.includes("Asignármelo") || text.toLowerCase() === '2') {
            try {
              const userId = await getCoreUserIdFromLinkage(linkage.employeeId);
              if (!userId) {
                await sendTelegramMessage(botToken, chatId, "❌ No se pudo determinar tu ID de usuario de soporte. Contacta al administrador.");
                return NextResponse.json({ ok: true });
              }
              await assignTicketToMechanic(tempData.ticketId, userId);
              
              // Load ticket again to show refresh details
              await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_select', tempData);
              await sendTelegramMessage(botToken, chatId, `✅ <b>¡Te has asignado el ticket!</b>`);
              // Trigger ticket reload message by simulating selection text
              const payloadSimulated = { message: { chat: { id: chatId }, text: tempData.consecutive } };
              const reqSimulated = new NextRequest(req.url, {
                method: 'POST',
                headers: req.headers,
                body: JSON.stringify(payloadSimulated)
              });
              return POST(reqSimulated);
            } catch (err) {
              await sendTelegramMessage(botToken, chatId, "❌ Error al autoasignarte el ticket. Reintenta.");
            }
          } else if (text.includes("Consumir Repuesto") || text.toLowerCase() === '3') {
            await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_part_search', tempData);
            await sendTelegramMessage(botToken, chatId, `📦 <b>Consumir Repuesto para ${tempData.consecutive}</b>\nDigita el <b>nombre o código</b> del repuesto para buscar en el inventario del Taller:`, cancelOnlyKeyboard);
          } else if (text.includes("Agregar Nota") || text.toLowerCase() === '4') {
            await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_note', tempData);
            await sendTelegramMessage(botToken, chatId, `📝 <b>Agregar Nota a ${tempData.consecutive}</b>\nEscribe el texto de la nota que deseas agregar a la bitácora:`, cancelOnlyKeyboard);
          } else if (text.includes("Cerrar Ticket") || text.toLowerCase() === '5') {
            await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_close_note', tempData);
            await sendTelegramMessage(botToken, chatId, `✅ <b>Cerrar y Completar Ticket ${tempData.consecutive}</b>\nPor favor, escribe un breve <b>comentario final de cierre</b> describiendo los trabajos realizados y repuestos aplicados:`, cancelOnlyKeyboard);
          } else {
            await sendTelegramMessage(botToken, chatId, "⚠️ Selección inválida. Por favor, elige una acción de la lista.");
          }
          break;
        }

        case 'mech_manage_status': {
          const statusMap: Record<string, string> = {
            'abierto 📥': 'open',
            'en progreso 🔄': 'in_progress',
            'en espera ⚠️': 'on_hold'
          };
          const cleanText = text.toLowerCase().trim();
          const newStatus = statusMap[cleanText];

          if (!newStatus) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Estado inválido. Por favor selecciona una opción de la lista.");
            return NextResponse.json({ ok: true });
          }

          try {
            await updateTicketStatusFromTelegram(tempData.ticketId, newStatus, linkage.employeeName || 'Mecánico');
            await sendTelegramMessage(botToken, chatId, `✅ El estado se actualizó a <b>${newStatus.toUpperCase()}</b>.`);
            
            // Reload ticket view
            await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_select', tempData);
            const payloadSimulated = { message: { chat: { id: chatId }, text: tempData.consecutive } };
            const reqSimulated = new NextRequest(req.url, {
              method: 'POST',
              headers: req.headers,
              body: JSON.stringify(payloadSimulated)
            });
            return POST(reqSimulated);
          } catch (err: any) {
            await sendTelegramMessage(botToken, chatId, "❌ Error al cambiar el estado del ticket en base de datos. Reintente.");
          }
          break;
        }

        case 'mech_manage_part_search': {
          if (text.length < 2) {
            await sendTelegramMessage(botToken, chatId, "⚠️ El término de búsqueda es muy corto. Escribe al menos 2 letras:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          const parts = await searchSpareParts(text);
          if (parts.length === 0) {
            await sendTelegramMessage(botToken, chatId, `❌ No se encontraron repuestos en el inventario del Taller que coincidan con <b>"${text}"</b>. Escribe otro término:`, cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          const partRows = [];
          for (const p of parts) {
            partRows.push([{ text: `${p.id} | ${p.name} (${Math.round(p.quantity)} ${p.unit})` }]);
          }
          partRows.push([{ text: "Cancelar ❌" }]);

          const partsKeyboard = {
            keyboard: partRows,
            resize_keyboard: true,
            one_time_keyboard: true
          };

          await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_part_select', tempData);
          await sendTelegramMessage(botToken, chatId, "📋 <b>Repuestos Encontrados:</b>\nPor favor, selecciona un repuesto de la lista:", partsKeyboard);
          break;
        }

        case 'mech_manage_part_select': {
          const itemId = text.split('|')[0].trim();
          const itemExists = db.prepare("SELECT name, quantity, unit FROM inv_items WHERE id = ? AND department_id = 1").get(itemId) as { name: string; quantity: number; unit: string } | undefined;
          
          if (!itemExists) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Repuesto inválido o no seleccionado de la lista. Intenta buscar de nuevo escribiendo /cancelar y gestionando de nuevo.");
            return NextResponse.json({ ok: true });
          }

          tempData.selectedItemId = itemId;
          tempData.selectedItemName = itemExists.name;
          tempData.maxStock = itemExists.quantity;
          tempData.itemUnit = itemExists.unit;

          await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_part_qty', tempData);
          await sendTelegramMessage(botToken, chatId, `🔢 ¿Qué <b>cantidad</b> de <b>"${itemExists.name}"</b> consumiste?\n(Disponible: <b>${itemExists.quantity} ${itemExists.unit}</b>. Digita solo el número):`, cancelOnlyKeyboard);
          break;
        }

        case 'mech_manage_part_qty': {
          const qty = parseFloat(text.replace(',', '.'));
          if (isNaN(qty) || qty <= 0) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Cantidad inválida. Ingresa un número positivo válido:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          if (qty > tempData.maxStock) {
            await sendTelegramMessage(botToken, chatId, `⚠️ Stock insuficiente. El stock máximo disponible es de <b>${tempData.maxStock} ${tempData.itemUnit}</b>. Digita una cantidad menor:`, cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          try {
            await consumeSparePartForTicket(tempData.ticketId, tempData.selectedItemId, qty, linkage.employeeName || 'Mecánico');
            await sendTelegramMessage(botToken, chatId, `✅ <b>¡Consumo Registrado!</b>\nSe consumieron <b>${qty} ${tempData.itemUnit}</b> de <b>"${tempData.selectedItemName}"</b> de forma exitosa para el ticket <b>${tempData.consecutive}</b>.`);
            
            // Reload ticket manage screen
            await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_select', tempData);
            const payloadSimulated = { message: { chat: { id: chatId }, text: tempData.consecutive } };
            const reqSimulated = new NextRequest(req.url, {
              method: 'POST',
              headers: req.headers,
              body: JSON.stringify(payloadSimulated)
            });
            return POST(reqSimulated);
          } catch (err: any) {
            await sendTelegramMessage(botToken, chatId, `❌ Error al realizar el consumo en la base de datos: ${err.message}`);
          }
          break;
        }

        case 'mech_manage_note': {
          if (text.length < 5) {
            await sendTelegramMessage(botToken, chatId, "⚠️ La nota es muy corta. Escribe una nota más descriptiva:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          try {
            const timestamp = new Date().toLocaleDateString('es-CR', { hour: '2-digit', minute: '2-digit' });
            db.prepare("UPDATE repair_tickets SET description = description || ? WHERE id = ?").run(`\n[Nota - ${timestamp} por ${linkage.employeeName || 'Mecánico'}]: ${text}`, tempData.ticketId);
            
            await sendTelegramMessage(botToken, chatId, "✅ <b>Nota agregada exitosamente</b> a la bitácora del ticket.");

            // Reload ticket manage screen
            await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_select', tempData);
            const payloadSimulated = { message: { chat: { id: chatId }, text: tempData.consecutive } };
            const reqSimulated = new NextRequest(req.url, {
              method: 'POST',
              headers: req.headers,
              body: JSON.stringify(payloadSimulated)
            });
            return POST(reqSimulated);
          } catch (err: any) {
            await sendTelegramMessage(botToken, chatId, "❌ Error al agregar nota en base de datos. Reintente.");
          }
          break;
        }

        case 'mech_manage_close_note': {
          if (text.length < 5) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Escribe una descripción de cierre detallada:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.closeRemarks = text;

          await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_close_photo', tempData);
          await sendTelegramMessage(
            botToken, 
            chatId, 
            "📸 <b>[FOTO OPCIONAL DE TRABAJO FINALIZADO]</b>\nEnvía una foto del trabajo mecánico realizado o presiona omitir:",
            skipPhotoKeyboard
          );
          break;
        }

        case 'mech_manage_close_photo': {
          let photoFilename = null;

          if (message.photo && message.photo.length > 0) {
            try {
              const photo = message.photo[message.photo.length - 1];
              await sendTelegramMessage(botToken, chatId, "⏳ Descargando foto de cierre...");
              photoFilename = await downloadTelegramFile(botToken, photo.file_id);
            } catch (err) {
              console.error("Error downloading mechanic closing photo", err);
            }
          }

          try {
            tempData.photoFilename = photoFilename;
            
            // Check if this ticket belongs to Fleet Maintenance (department_id = 1)
            const ticket = db.prepare('SELECT department_id, linked_asset_id, serial_number FROM repair_tickets WHERE id = ?').get(tempData.ticketId) as any;
            if (ticket && ticket.department_id === 1) {
              let vehicleRow = null;
              if (ticket.linked_asset_id) {
                vehicleRow = db.prepare('SELECT id, plate, brand, model, currentMileage, odometerUnit FROM fleet_vehicles WHERE id = ?').get(ticket.linked_asset_id) as any;
              } else if (ticket.serial_number) {
                vehicleRow = db.prepare('SELECT id, plate, brand, model, currentMileage, odometerUnit FROM fleet_vehicles WHERE UPPER(plate) = ?').get(ticket.serial_number.toUpperCase().trim()) as any;
              }

              if (vehicleRow) {
                tempData.vehicleId = vehicleRow.id;
                tempData.vehiclePlate = vehicleRow.plate;
                tempData.vehicleInfo = `${vehicleRow.brand} ${vehicleRow.model}`;
                tempData.currentMileage = vehicleRow.currentMileage || 0;
                tempData.odometerUnit = vehicleRow.odometerUnit || 'km';

                await saveTelegramState(chatIdStr, 'mechanic_manage_ticket', 'mech_manage_close_odometer', tempData);
                await sendTelegramMessage(
                  botToken, 
                  chatId, 
                  `🚗 <b>Lectura de Odómetro / Uso</b>\nEl vehículo <b>${tempData.vehicleInfo} (${tempData.vehiclePlate})</b> tiene un kilometraje previo de <b>${tempData.currentMileage} ${tempData.odometerUnit}</b>.\n\nPor favor, escribe la lectura actual del odómetro o uso del vehículo (ingresa solo el número):`, 
                  cancelOnlyKeyboard
                );
                return NextResponse.json({ ok: true });
              }
            }

            const finalRemarks = photoFilename 
              ? `${tempData.closeRemarks}\n\n[Foto de Evidencia de Cierre: ${photoFilename}]`
              : tempData.closeRemarks;

            const timestamp = new Date().toLocaleDateString('es-CR', { hour: '2-digit', minute: '2-digit' });
            
            db.transaction(() => {
              // Mark as completed
              db.prepare("UPDATE repair_tickets SET status = 'completed', closed_at = ?, closed_by = ? WHERE id = ?").run(
                new Date().toISOString(),
                linkage.employeeName || 'Mecánico',
                tempData.ticketId
              );

              // Append closing remarks
              db.prepare("UPDATE repair_tickets SET description = description || ? WHERE id = ?").run(
                `\n[Cierre - ${timestamp} por ${linkage.employeeName || 'Mecánico'}]: ${finalRemarks}`,
                tempData.ticketId
              );
            })();

            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(
              botToken, 
              chatId, 
              `🎉 <b>¡Excelente! Ticket ${tempData.consecutive} Cerrado y Completado Exitosamente.</b>\n\nEl ticket ha sido archivado y cerrado.`, 
              getDynamicMenuKeyboard(linkage)
            );
          } catch (err) {
            console.error("Error closing ticket via Telegram", err);
            await sendTelegramMessage(botToken, chatId, "❌ Error al cerrar el ticket en base de datos. Reintente.", getDynamicMenuKeyboard(linkage));
            await deleteTelegramState(chatIdStr);
          }
          break;
        }

        case 'mech_manage_close_odometer': {
          const odometer = parseFloat(text.replace(',', '.'));
          if (isNaN(odometer) || odometer <= 0) {
            await sendTelegramMessage(botToken, chatId, `⚠️ Lectura inválida. Por favor ingresa un número positivo para el odómetro (${tempData.odometerUnit || 'km'}):`, cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          try {
            const finalRemarks = tempData.photoFilename 
              ? `${tempData.closeRemarks}\n\n[Foto de Evidencia de Cierre: ${tempData.photoFilename}]`
              : tempData.closeRemarks;

            const timestamp = new Date().toLocaleDateString('es-CR', { hour: '2-digit', minute: '2-digit' });
            
            db.transaction(() => {
              // Mark as completed
              db.prepare("UPDATE repair_tickets SET status = 'completed', closed_at = ?, closed_by = ? WHERE id = ?").run(
                new Date().toISOString(),
                linkage.employeeName || 'Mecánico',
                tempData.ticketId
              );

              // Append closing remarks
              db.prepare("UPDATE repair_tickets SET description = description || ? WHERE id = ?").run(
                `\n[Cierre - ${timestamp} por ${linkage.employeeName || 'Mecánico'}]: ${finalRemarks}`,
                tempData.ticketId
              );
            })();

            // Update vehicle odometer and check preventative alerts in cascade
            if (tempData.vehicleId) {
              const { updateVehicleMileageAndCheckAlerts } = await import('@/modules/fleet/lib/db');
              await updateVehicleMileageAndCheckAlerts(db, tempData.vehicleId, odometer, null);
            }

            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(
              botToken, 
              chatId, 
              `🎉 <b>¡Excelente! Ticket ${tempData.consecutive} Cerrado y Completado Exitosamente.</b>\n\nEl ticket ha sido archivado y el odómetro del vehículo actualizado.`, 
              getDynamicMenuKeyboard(linkage)
            );
          } catch (err) {
            console.error("Error closing ticket with odometer via Telegram", err);
            await sendTelegramMessage(botToken, chatId, "❌ Error al cerrar el ticket en base de datos. Reintente.", getDynamicMenuKeyboard(linkage));
            await deleteTelegramState(chatIdStr);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // C. ALERTAS FLOW (ALERTS)
    if (state.currentFlow === 'alerts') {
      switch (state.step) {
        case 'alerts_options': {
          if (text.includes("Ver todas") || text.includes("todas las alertas") || text === '1') {
            await sendTelegramMessage(botToken, chatId, "⏳ Generando reporte detallado de todas las alertas en tiempo real...");
            
            try {
              const db = await getDb();
              const vehicles = db.prepare('SELECT * FROM fleet_vehicles ORDER BY plate').all() as any[];
              
              let responseText = "⚠️ <b>Reporte Detallado de Alertas de Flota:</b>\n\n";
              let hasAnyAlert = false;
              let alertCount = 0;

              for (const vehicle of vehicles) {
                const { alerts, warnings } = await checkVehicleAlerts(vehicle, db);
                if (alerts.length > 0 || warnings.length > 0) {
                  hasAnyAlert = true;
                  alertCount++;
                  const brandModel = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
                  
                  let vehicleText = `🚗 <b>${vehicle.plate}</b>${brandModel ? ` (${brandModel})` : ''}\n`;
                  vehicleText += `📍 Odo: <b>${(vehicle.currentMileage || 0).toLocaleString('es-CR')} km</b>\n`;
                  for (const item of [...alerts, ...warnings]) {
                    vehicleText += `• ${item}\n`;
                  }
                  vehicleText += `\n`;

                  // If adding this vehicleText exceeds 3800 chars, send the current responseText first
                  if (responseText.length + vehicleText.length > 3800) {
                    await sendTelegramMessage(botToken, chatId, responseText);
                    responseText = ''; // Reset for the next batch
                  }
                  responseText += vehicleText;
                }
              }

              if (!hasAnyAlert) {
                responseText = "🟢 <b>¡Excelente!</b> No hay ningún vehículo con alertas activas en toda la flota.";
                await sendTelegramMessage(botToken, chatId, responseText, getDynamicMenuKeyboard(linkage));
              } else {
                responseText += `<i>💡 Se encontraron ${alertCount} vehículos con alertas. Escribe /menu para volver al menú principal.</i>`;
                await sendTelegramMessage(botToken, chatId, responseText, getDynamicMenuKeyboard(linkage));
              }

              await deleteTelegramState(chatIdStr);
            } catch (err) {
              console.error("Error in view all alerts:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar las alertas. Por favor intenta de nuevo.", getDynamicMenuKeyboard(linkage));
              await deleteTelegramState(chatIdStr);
            }
          } else if (text.includes("Lista de activos") || text.includes("Listar") || text === '2') {
            await sendTelegramMessage(botToken, chatId, "⏳ Calculando alertas de toda la flota en tiempo real...");
            
            try {
              const db = await getDb();
              const vehicles = db.prepare('SELECT * FROM fleet_vehicles ORDER BY plate').all() as any[];
              
              let responseText = "🚨 <b>Vehículos con Alertas Activas:</b>\n\n";
              let hasAnyAlert = false;

              for (const vehicle of vehicles) {
                const { alerts, warnings } = await checkVehicleAlerts(vehicle, db);
                if (alerts.length > 0 || warnings.length > 0) {
                  hasAnyAlert = true;
                  const brandModel = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
                  responseText += `• <b>${vehicle.plate}</b>${brandModel ? ` (${brandModel})` : ''}\n`;
                  
                  const alertSummary = [];
                  if (alerts.length > 0) alertSummary.push(`🔴 ${alerts.length} Crítica(s)`);
                  if (warnings.length > 0) alertSummary.push(`🟡 ${warnings.length} Advertencia(s)`);
                  responseText += `  ⚠️ ${alertSummary.join(' | ')}\n\n`;
                }
              }

              if (!hasAnyAlert) {
                responseText = "🟢 <b>¡Excelente!</b> No hay ningún vehículo con alertas activas en toda la flota.";
              } else {
                responseText += "<i>💡 Escribe <b>/menu</b> para volver, selecciona 'Consultar Alertas' y elige 'Buscar por placa 🔍' para ver los detalles completos de cualquier activo.</i>";
              }

              await deleteTelegramState(chatIdStr);
              await sendTelegramMessage(botToken, chatId, responseText, getDynamicMenuKeyboard(linkage));
            } catch (err) {
              console.error("Error in list vehicles with alerts:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar las alertas globales. Por favor intenta de nuevo.", getDynamicMenuKeyboard(linkage));
              await deleteTelegramState(chatIdStr);
            }
          } else if (text.includes("Placa") || text.includes("Buscar por") || text === '3') {
            await saveTelegramState(chatIdStr, 'alerts', 'alerts_plate', tempData);
            await sendTelegramMessage(botToken, chatId, "📋 Por favor, selecciona la <b>placa</b> del vehículo de la lista o escríbela para consultar sus alertas:", plateQueryKeyboard);
          } else {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              "⚠️ Entrada inválida. Por favor, selecciona una de las opciones del teclado interactivo:", 
              alertsOptionsKeyboard
            );
          }
          break;
        }

        case 'alerts_plate': {
          if (text === '👥 Seleccionar Placa de Lista') {
            await sendPlatesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida o selecciónala de la lista:`, plateQueryKeyboard);
            return NextResponse.json({ ok: true });
          }

          try {
            const db = await getDb();
            const { alerts, warnings, controls } = await checkVehicleAlerts(vehicle, db);
            const brandModel = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
            const fuelType = vehicle.fuelType || 'No especificado';
            const odoUnit = vehicle.odometerUnit || 'km';

            let responseText = `⚠️ <b>Alertas de Activo - ${vehicle.plate}</b>\n`;
            responseText += `🚗 ${brandModel ? brandModel : 'Vehículo'} | ${fuelType}\n`;
            responseText += `📍 Odo: <b>${(vehicle.currentMileage || 0).toLocaleString('es-CR')} ${odoUnit}</b>`;
            if (vehicle.currentHours) {
              responseText += ` | Horas: <b>${vehicle.currentHours.toLocaleString('es-CR')} h</b>`;
            }
            responseText += `\n\n`;

            if (alerts.length > 0 || warnings.length > 0) {
              responseText += `🚨 <b>ALERTAS DETECTADAS:</b>\n`;
              for (const item of [...alerts, ...warnings]) {
                responseText += `• ${item}\n`;
              }
              responseText += `\n`;
            } else {
              responseText += `🟢 <b>Sin alertas activas:</b> El vehículo se encuentra al día en todos sus controles y permisos.\n\n`;
            }

            responseText += `📋 <b>CONTROLES Y ESTADOS:</b>\n`;
            for (const ctrl of controls) {
              responseText += `• ${ctrl.name}: <b>${ctrl.status}</b> (${ctrl.detail})\n`;
            }

            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(botToken, chatId, responseText, getDynamicMenuKeyboard(linkage));
          } catch (err) {
            console.error("Error generating detailed vehicle alerts:", err);
            await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar el reporte. Por favor intenta de nuevo.", getDynamicMenuKeyboard(linkage));
            await deleteTelegramState(chatIdStr);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // D. HISTORIAL FLOW (HISTORY)
    if (state.currentFlow === 'history') {
      switch (state.step) {
        case 'history_plate': {
          if (text === '👥 Seleccionar Placa de Lista') {
            await sendPlatesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida o selecciónala de la lista:`, plateQueryKeyboard);
            return NextResponse.json({ ok: true });
          }

          try {
            const db = await getDb();
            const fuelLogs = db.prepare('SELECT * FROM fleet_fuel_logs WHERE vehicleId = ? ORDER BY date DESC LIMIT 5').all(vehicle.id) as any[];
            const maintLogs = db.prepare('SELECT * FROM fleet_maintenance_logs WHERE vehicleId = ? ORDER BY date DESC LIMIT 5').all(vehicle.id) as any[];
            
            const brandModel = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
            let responseText = `📋 <b>Historial de Log - ${vehicle.plate}</b>\n`;
            if (brandModel) responseText += `🚗 ${brandModel}\n\n`;
            else responseText += `\n`;

            // Fuel Logs
            responseText += `⛽ <b>Últimos Repostajes:</b>\n`;
            if (fuelLogs.length === 0) {
              responseText += `<i>No hay registros de repostaje.</i>\n\n`;
            } else {
              for (const log of fuelLogs) {
                const hasPhoto = log.notes && log.notes.includes('[Foto:');
                let cleanNote = '';
                if (log.notes) {
                  cleanNote = log.notes.replace(/\[Foto:\s*([^\]]+)\]/g, '').trim();
                }
                
                const formattedDate = formatDate(log.date);
                const costStr = Number(log.cost || 0).toLocaleString('es-CR');
                const litersStr = Number(log.liters || 0).toLocaleString('es-CR');
                const odoStr = Number(log.mileageBefore || 0).toLocaleString('es-CR');
                
                responseText += `• <b>${formattedDate}</b> - ${litersStr} L | ₡${costStr} | ${odoStr} km\n`;
                if (log.createdBy) responseText += `  <i>Por: ${log.createdBy}${hasPhoto ? ' (📸 Foto Adjunta)' : ''}</i>\n`;
                if (cleanNote) responseText += `  <i>Nota: ${cleanNote}</i>\n`;
              }
              responseText += `\n`;
            }

            // Maintenance Logs
            responseText += `🔧 <b>Últimos Mantenimientos:</b>\n`;
            if (maintLogs.length === 0) {
              responseText += `<i>No hay registros de mantenimiento.</i>\n\n`;
            } else {
              for (const log of maintLogs) {
                const hasPhoto = log.description && log.description.includes('[Foto:');
                let cleanDesc = '';
                if (log.description) {
                  cleanDesc = log.description.replace(/\[Foto:\s*([^\]]+)\]/g, '').trim();
                }

                const formattedDate = formatDate(log.date);
                const costStr = Number(log.cost || 0).toLocaleString('es-CR');
                const odoStr = Number(log.mileage || 0).toLocaleString('es-CR');

                responseText += `• <b>${formattedDate}</b> - <b>${log.type}</b> | ₡${costStr}\n`;
                responseText += `  <i>Realizado por: ${log.performedBy || 'No especificado'} | ${odoStr} km</i>\n`;
                if (log.createdBy) responseText += `  <i>Por: ${log.createdBy}${hasPhoto ? ' (📸 Foto Adjunta)' : ''}</i>\n`;
                if (cleanDesc) responseText += `  <i>Detalle: ${cleanDesc}</i>\n`;
              }
              responseText += `\n`;
            }

            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(botToken, chatId, responseText, getDynamicMenuKeyboard(linkage));
          } catch (err) {
            console.error("Error generating history log report:", err);
            await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar el historial. Por favor intenta de nuevo.", getDynamicMenuKeyboard(linkage));
            await deleteTelegramState(chatIdStr);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // E. PERMISOS Y PLANES FLOW (PERMITS & PLANS)
    if (state.currentFlow === 'permits_plans') {
      switch (state.step) {
        case 'permits_plans_plate': {
          if (text === '👥 Seleccionar Placa de Lista') {
            await sendPlatesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida o selecciónala de la lista:`, plateQueryKeyboard);
            return NextResponse.json({ ok: true });
          }

          try {
            const db = await getDb();
            const permits = db.prepare('SELECT * FROM fleet_permits WHERE vehicleId = ? ORDER BY expirationDate ASC').all(vehicle.id) as any[];
            const plans = db.prepare('SELECT * FROM fleet_preventative_plans WHERE vehicleId = ? ORDER BY maintenanceType').all(vehicle.id) as any[];

            const brandModel = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
            let responseText = `📄 <b>Permisos y Planes - ${vehicle.plate}</b>\n`;
            if (brandModel) responseText += `🚗 ${brandModel}\n\n`;
            else responseText += `\n`;

            // Permits
            responseText += `📜 <b>Permisos Especiales:</b>\n`;
            let hasAnyDoc = false;
            if (vehicle.rtvExpiration) {
              hasAnyDoc = true;
              const rtvDate = new Date(vehicle.rtvExpiration);
              const today = new Date();
              rtvDate.setHours(0,0,0,0);
              today.setHours(0,0,0,0);
              const diffTime = rtvDate.getTime() - today.getTime();
              const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              const formattedDate = formatDate(vehicle.rtvExpiration);
              
              responseText += `• <b>Revisión Técnica Vehicular (RTV)</b>\n`;
              responseText += `  Vence: <b>${formattedDate}</b> (${daysLeft > 0 ? `quedan ${daysLeft} días` : `EXPIRADO hace ${Math.abs(daysLeft)} días`})\n`;
              responseText += `  Estado: ${daysLeft > 0 ? (daysLeft <= 60 ? '🟡 Próximo' : '🟢 Vigente') : '🔴 Expirado'}\n`;
            }

            if (permits.length > 0) {
              hasAnyDoc = true;
              for (const permit of permits) {
                let permitText = `• <b>Permiso Especial: ${permit.type}</b>\n`;
                if (permit.expirationDate) {
                  const permitDate = new Date(permit.expirationDate);
                  const today = new Date();
                  permitDate.setHours(0,0,0,0);
                  today.setHours(0,0,0,0);
                  const diffTime = permitDate.getTime() - today.getTime();
                  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  const formattedDate = formatDate(permit.expirationDate);

                  permitText += `  Vence: <b>${formattedDate}</b> (${daysLeft > 0 ? `quedan ${daysLeft} días` : `EXPIRADO hace ${Math.abs(daysLeft)} días`})\n`;
                  permitText += `  Estado: ${daysLeft > 0 ? (daysLeft <= 60 ? '🟡 Próximo' : '🟢 Vigente') : '🔴 Expirado'}\n`;
                } else {
                  permitText += `  Vence: <b>No expira / Indefinido</b>\n`;
                  permitText += `  Estado: 🟢 Vigente\n`;
                }
                responseText += permitText;
              }
            }

            if (!hasAnyDoc) {
              responseText += `<i>No hay permisos registrados para este activo.</i>\n`;
            }
            responseText += `\n`;

            // Preventative Plans
            responseText += `🔧 <b>Planes Preventivos Configurados:</b>\n`;
            if (plans.length === 0) {
              responseText += `<i>No hay planes preventivos configurados para este activo.</i>\n`;
            } else {
              for (const plan of plans) {
                const currentMileage = vehicle.currentMileage || 0;
                const currentVal = (plan.intervalUnit === 'hours' && vehicle.odometerUnit !== 'hr') ? (vehicle.currentHours || 0) : currentMileage;
                const diff = currentVal - (plan.lastPerformedValue || 0);
                const planProgress = Math.round((diff / plan.intervalValue) * 100);
                const unit = plan.intervalUnit || 'km';

                let stateEmoji = '🟢';
                let stateText = 'Al día';
                if (planProgress >= 100) {
                  stateEmoji = '🔴';
                  stateText = 'Vencido';
                } else if (planProgress >= 90) {
                  stateEmoji = '🟡';
                  stateText = 'Próximo';
                }

                responseText += `• <b>${plan.maintenanceType}</b>\n`;
                responseText += `  Intervalo: ${plan.intervalValue.toLocaleString('es-CR')} ${unit}\n`;
                responseText += `  Último control: ${plan.lastPerformedValue.toLocaleString('es-CR')} | Actual: ${currentVal.toLocaleString('es-CR')} (${planProgress}% de uso)\n`;
                responseText += `  Estado: ${stateEmoji} ${stateText}\n`;
              }
            }

            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(botToken, chatId, responseText, getDynamicMenuKeyboard(linkage));
          } catch (err) {
            console.error("Error generating permits and plans report:", err);
            await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar el reporte. Por favor intenta de nuevo.", getDynamicMenuKeyboard(linkage));
            await deleteTelegramState(chatIdStr);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // GG. MONITOR DE ENTREGAS - PRE-SALIDA / PREPARACIÓN
    if (state.currentFlow === 'delivery_pre_depart') {
      if (text === 'Volver al Menú Principal 🔙' || text === '/cancelar' || text.toLowerCase() === 'cancelar') {
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "🔙 Volviendo al menú principal.", getDynamicMenuKeyboard(linkage));
        return NextResponse.json({ ok: true });
      }

      if (text.includes("Auto-Cargar Factura")) {
        const db = await getDb();
        tempData.parentFlow = 'delivery_pre_depart';
        await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_autoload_query', tempData);
        await sendTelegramMessage(
          botToken,
          chatId,
          "📥 <b>Auto-Cargar Facturas en Bloque</b>\n\nPor favor escribe los números finales de las facturas que llevas, separados por comas (ejemplo: <code>4132, 4135, 4140</code>).\n\nEl sistema buscará los documentos libres en la Cola General y los asignará a tu camión de inmediato:",
          cancelOnlyKeyboard
        );
        return NextResponse.json({ ok: true });
      }

      if (text === '🚀 Salir a Ruta') {
        const db = await getDb();

        const pendingCountRow = db.prepare("SELECT COUNT(*) as count FROM ops_delivery_queue WHERE asignacion_id = ? AND entregado = 0").get(tempData.assignmentId) as { count: number } | undefined;
        const pendingCount = pendingCountRow?.count || 0;

        if (pendingCount === 0) {
          await sendTelegramMessage(
            botToken,
            chatId,
            "⚠️ <b>No puedes iniciar la ruta todavía.</b>\nDebes auto-cargar al menos una factura a tu camión utilizando la opción 📥 <b>Auto-Cargar Factura</b>.",
            await getDeliveryPreDepartKeyboard(db, tempData.assignmentId)
          );
          return NextResponse.json({ ok: true });
        }
        
        // 1. Geoloc de Salida
        const askStartLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_start_location'").get() as { value: string } | undefined;
        const askStartLoc = askStartLocRow?.value || 'optional';

        if (askStartLoc !== 'disabled') {
          await saveTelegramState(chatIdStr, 'delivery_init', 'delivery_start_location', tempData);
          const isMandatory = askStartLoc === 'mandatory';
          const locationKeyboard = {
            keyboard: [
              [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
              ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
              [{ text: "Cancelar ❌" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          };
          await sendTelegramMessage(
            botToken,
            chatId,
            `📍 <b>Inicio de Ruta: Geolocalización</b>\n` +
            `Por favor comparte tu ubicación GPS de inicio utilizando el botón de abajo para registrar tu salida hacia la ruta:` +
            (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
            locationKeyboard
          );
          return NextResponse.json({ ok: true });
        }

        // 2. Primer Cliente (si tiene facturas cargadas)
        const askFirstClientRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_first_client'").get() as { value: string } | undefined;
        const askFirstClient = askFirstClientRow?.value || 'optional';

        if (askFirstClient !== 'disabled') {
          const pending = await getPendingDestinations(db, tempData.assignmentId);

          if (pending.length > 0) {
            await sendFirstClientSelectionPrompt(db, botToken, chatId, chatIdStr, tempData, askFirstClient === 'mandatory');
            return NextResponse.json({ ok: true });
          }
        }

        // 3. Completar inicio si todo omitido
        await completeDeliveryInitFlow(db, botToken, chatId, chatIdStr, linkage, tempData);
        return NextResponse.json({ ok: true });
      }

      const db = await getDb();
      await sendTelegramMessage(botToken, chatId, "⚠️ Opción no válida. Selecciona una opción del menú o escribe /menu:", await getDeliveryPreDepartKeyboard(db, tempData.assignmentId));
      return NextResponse.json({ ok: true });
    }

    // G. MONITOR DE ENTREGAS - INICIALIZACIÓN DE RUTA
    if (state.currentFlow === 'delivery_init') {
      if (text === 'Cancelar ❌' || text.toLowerCase() === 'cancelar' || text.toLowerCase() === '/cancelar') {
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "❌ Operación cancelada.", getDynamicMenuKeyboard(linkage));
        return NextResponse.json({ ok: true });
      }

      switch (state.step) {
        case 'delivery_routes': {
          if (text === '📋 Seleccionar Ruta de Lista') {
            await sendRoutesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          let parsedText = text;
          if (text.includes(' - ')) {
            parsedText = text.split(' - ')[0].trim();
          }

          const routeIds = parsedText.split(',').map((id: string) => parseInt(id.trim(), 10)).filter((id: number) => !isNaN(id));
          if (routeIds.length === 0) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Formato inválido. Escribe los números de ruta separados por comas (ejemplo: <code>1,3</code>):", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          const db = await getDb();
          const route = db.prepare('SELECT id, name FROM ops_delivery_routes WHERE id = ? AND active = 1').get(routeIds[0]) as any;

          if (!route) {
            await sendTelegramMessage(botToken, chatId, "⚠️ La ruta seleccionada no es válida o está inactiva. Elige una de las rutas disponibles:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          tempData.routeId = route.id;
          tempData.routeName = route.name;
          tempData.allSelectedRoutes = routeIds;

          await saveTelegramState(chatIdStr, 'delivery_init', 'delivery_plate', tempData);
          await sendPlatesSelectionKeyboard(botToken, chatId, `🛣️ <b>Ruta seleccionada: ${route.name}</b>\n\n📋 Por favor, selecciona la <b>placa</b> del camión/vehículo que llevas hoy de la lista o escríbela manualmente:`);
          break;
        }

        case 'delivery_plate': {
          if (text === '👥 Seleccionar Placa de Lista') {
            await sendPlatesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          const vehicle = await getVehicleByPlate(text);
           if (!vehicle) {
            const suggestions = await getPlateSuggestions(text);
            let errorMsg = `❌ Vehículo con placa <b>"${text}"</b> no encontrado.`;
            if (suggestions.length > 0) {
              errorMsg += `\n\n¿Quisiste decir alguna de estas?\n` + suggestions.map((s, idx) => `<b>${idx + 1}-</b> <code>${s}</code>`).join('\n') + `\n\nPor favor, escribe de nuevo la placa correcta del camión:`;
            } else {
              errorMsg += `\n\nPor favor, ingresa una placa válida de la flota o selecciónala de la lista:`;
            }
            await sendPlatesSelectionKeyboard(botToken, chatId, errorMsg);
            return NextResponse.json({ ok: true });
          }

          const db = await getDb();
          const todayStr = await getBusinessDateStr();

          // Resolve coreUserId using robust helper
          const coreUserId = await getCoreUserIdFromLinkage(linkage.employeeId);

          if (!coreUserId) {
            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(botToken, chatId, `⚠️ <b>¡No se pudo iniciar la ruta!</b>\n\nSu perfil de empleado (código: <code>${linkage.employeeId}</code>) no está completamente vinculado o registrado en la tabla de usuarios del sistema Clic-Tools.\n\nPor favor, solicite al administrador que asocie su usuario con este código de empleado para poder operar.`, getDynamicMenuKeyboard(linkage));
            return NextResponse.json({ ok: true });
          }

          // Check if vehicle is already in use by another active driver today
          const vehicleConflict = db.prepare(`
              SELECT u.name as chofer_nombre
              FROM ops_delivery_assignments a
              JOIN core_users u ON a.empleado_id = u.id
              WHERE a.fecha = ? AND a.activa = 1 AND a.vehiculo_id = ? AND a.empleado_id <> ?
          `).get(todayStr, vehicle.id, coreUserId) as { chofer_nombre: string } | undefined;

          if (vehicleConflict) {
            await sendTelegramMessage(
              botToken,
              chatId,
              `⚠️ <b>Vehículo en Uso</b>\nEl vehículo con placa <b>${vehicle.plate}</b> ya está siendo utilizado hoy por el chofer <b>${vehicleConflict.chofer_nombre}</b> en una ruta activa.\n\nPor favor, selecciona otro vehículo o solicita al coordinador que libere la placa:`,
              cancelOnlyKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          // Create daily assignment
          db.prepare('UPDATE ops_delivery_assignments SET activa = 0, fecha_completada = ? WHERE fecha = ? AND (empleado_id = ? OR vehiculo_id = ?)').run(new Date().toISOString(), todayStr, coreUserId, vehicle.id);
          const result = db.prepare(`
              INSERT INTO ops_delivery_assignments (fecha, ruta_id, empleado_id, vehiculo_id, activa, fecha_creacion)
              VALUES (?, ?, ?, ?, 1, ?)
          `).run(todayStr, tempData.routeId, coreUserId, vehicle.id, new Date().toISOString());

          const assignmentId = Number(result.lastInsertRowid);
          
          // Import new ERP documents into queue dynamically on route init to sync queue
          try {
            const erpInvoices = db.prepare(`
                SELECT FACTURA, CLIENTE, NOMBRE_CLIENTE, USUARIO, FECHA, PEDIDO
                FROM core_erp_invoice_headers
                WHERE ANULADA <> 'S' AND RUTA = ?
            `).all(tempData.routeName.split(':').pop()?.trim() || '') as any[];

            const insertInvoice = db.prepare(`
                INSERT OR IGNORE INTO ops_delivery_queue (documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por, fecha_registro, estado, entregado, asignacion_id)
                VALUES (?, 'factura', ?, ?, ?, ?, 'en_ruta', 0, ?)
            `);

            const getOrderCreator = db.prepare('SELECT USUARIO FROM core_erp_order_headers WHERE PEDIDO = ?');

            for (const inv of erpInvoices) {
              let orderCreator = null;
              if (inv.PEDIDO) {
                const order = getOrderCreator.get(inv.PEDIDO) as { USUARIO: string } | undefined;
                if (order?.USUARIO) {
                  orderCreator = order.USUARIO;
                }
              }
              const finalCreator = orderCreator || inv.USUARIO || 'ERP_SYNC';

              insertInvoice.run(inv.FACTURA, inv.CLIENTE, inv.NOMBRE_CLIENTE || 'Cliente ERP', finalCreator, inv.FECHA || todayStr, assignmentId);
            }
          } catch (err) {
            console.error("Error auto-routing on init:", err);
          }

          // Save temp details
          tempData.assignmentId = assignmentId;
          tempData.plate = vehicle.plate;
          tempData.vehicleId = vehicle.id;

          // Transition immediately to pre-departure (Preparation / Loading) menu
          await saveTelegramState(chatIdStr, 'delivery_pre_depart', 'pre_depart_home', tempData);
          await sendTelegramMessage(
            botToken,
            chatId,
            `🚚 <b>Monitor de Entregas (Preparación)</b>\nSe ha creado la ruta de hoy:\nRuta: <b>${tempData.routeName}</b>\nVehículo: <b>${tempData.plate}</b>\n\nPor favor, realiza la <b>Auto-Carga</b> de las facturas que vas a entregar hoy para poder iniciar tu ruta de distribución:`,
            await getDeliveryPreDepartKeyboard(db, assignmentId)
          );
          break;
        }

        case 'delivery_start_location': {
          let lat = null;
          let lon = null;
          
          const db = await getDb();
          const askStartLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_start_location'").get() as { value: string } | undefined;
          const askStartLoc = askStartLocRow?.value || 'optional';
          const isMandatory = askStartLoc === 'mandatory';

          if (text === 'Omitir ubicación ⏭️') {
            if (isMandatory) {
              await sendTelegramMessage(botToken, chatId, "⚠️ La geolocalización es obligatoria para iniciar la ruta. Por favor comparte tu ubicación GPS:");
              return NextResponse.json({ ok: true });
            }
          } else if (message.location) {
            lat = message.location.latitude;
            lon = message.location.longitude;
          } else {
            await sendTelegramMessage(botToken, chatId, "⚠️ Por favor comparte tu ubicación GPS usando el botón de abajo o presiona Omitir si está permitido:");
            return NextResponse.json({ ok: true });
          }

          if (lat !== null && lon !== null && tempData.assignmentId) {
            db.prepare('UPDATE ops_delivery_assignments SET latitud_inicio = ?, longitud_inicio = ? WHERE id = ?').run(lat, lon, tempData.assignmentId);
          }

          const askFirstClientRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_first_client'").get() as { value: string } | undefined;
          const askFirstClient = askFirstClientRow?.value || 'optional';

          if (askFirstClient !== 'disabled') {
            const pending = await getPendingDestinations(db, tempData.assignmentId);

            if (pending.length > 0) {
              await sendFirstClientSelectionPrompt(db, botToken, chatId, chatIdStr, tempData, askFirstClient === 'mandatory');
            } else {
              await completeDeliveryInitFlow(db, botToken, chatId, chatIdStr, linkage, tempData);
            }
          } else {
            await completeDeliveryInitFlow(db, botToken, chatId, chatIdStr, linkage, tempData);
          }
          break;
        }

        case 'delivery_first_client': {
          const db = await getDb();
          const askFirstClientRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_first_client'").get() as { value: string } | undefined;
          const askFirstClient = askFirstClientRow?.value || 'optional';
          const isMandatory = askFirstClient === 'mandatory';

          let clientName = text.trim();

          if (clientName === 'Omitir primer cliente ⏭️') {
            if (isMandatory) {
              await sendTelegramMessage(botToken, chatId, "⚠️ La selección del primer cliente es obligatoria. Por favor elige uno:");
              return NextResponse.json({ ok: true });
            }
            clientName = '';
          }

          if (clientName) {
            const pending = await getPendingDestinations(db, tempData.assignmentId);
            
            // Decodificar códigos de cliente/dirección de la entrada del usuario
            // El formato es: "ID_CLIENTE / ID_DIRECCION | ..."
            let matchedDest = null;
            const codePart = clientName.split('|')[0] || '';
            const codes = codePart.split('/').map((c: string) => c.trim());
            
            if (codes.length >= 2) {
              const clientId = codes[0];
              const direccionId = codes[1];
              matchedDest = pending.find(p => p.clientId === clientId && p.direccionId === direccionId);
            }

            if (!matchedDest) {
              // Fallback check: si de casualidad coincide exactamente con alguna etiqueta
              matchedDest = pending.find(p => p.label === clientName);
            }

            if (!matchedDest) {
              const rows = pending.map(p => [{ text: p.label }]);
              if (!isMandatory) {
                rows.push([{ text: "Omitir primer cliente ⏭️" }]);
              }
              rows.push([{ text: "Cancelar ❌" }]);

              const firstClientKeyboard = {
                keyboard: rows,
                resize_keyboard: true,
                one_time_keyboard: true
              };

              await sendTelegramMessage(
                botToken,
                chatId,
                `⚠️ <b>Cliente no válido.</b> Por favor, selecciona un cliente de tu lista asignada para hoy:`,
                firstClientKeyboard
              );
              return NextResponse.json({ ok: true });
            }

            // Si se validó con éxito, usamos la etiqueta formateada completa del destino
            clientName = matchedDest.label;
          }

          if (clientName && tempData.assignmentId) {
            db.prepare("UPDATE ops_delivery_assignments SET siguiente_cliente = ?, siguiente_cliente_fecha = ? WHERE id = ?").run(clientName, new Date().toISOString(), tempData.assignmentId);
          }

          await completeDeliveryInitFlow(db, botToken, chatId, chatIdStr, linkage, tempData);
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // H. MONITOR DE ENTREGAS - MENÚ Y GESTIÓN DE ENTREGAS
    // H2. MONITOR DE RECOLECTAS - MENÚ Y GESTIÓN DE RECOLECTAS
    if (state.currentFlow === 'collects_menu') {
      if (text === 'Volver al Menú Principal 🔙') {
        if (tempData.docId) {
          const db = await getDb();
          db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
        }
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "🔙 Volviendo al menú principal.", getDynamicMenuKeyboard(linkage));
        return NextResponse.json({ ok: true });
      }

      if (text === '/cancelar' || text.toLowerCase() === 'cancelar' || text === 'Cancelar ❌') {
        if (tempData.docId) {
          const db = await getDb();
          db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
        }
        if (state.step === 'collects_menu_home') {
          await deleteTelegramState(chatIdStr);
          await sendTelegramMessage(botToken, chatId, "🔙 Volviendo al menú principal.", getDynamicMenuKeyboard(linkage));
        } else {
          await saveTelegramState(chatIdStr, 'collects_menu', 'collects_menu_home', tempData);
          const db = await getDb();
          await sendTelegramMessage(botToken, chatId, "🔙 Operación cancelada. Volviendo al menú de recolectas.", getCollectsMenuKeyboard(db, tempData.assignmentId));
        }
        return NextResponse.json({ ok: true });
      }

      switch (state.step) {
        case 'collects_menu_home': {
          if (text.includes("Registrar Recolecta")) {
            const db = await getDb();
            tempData.searchType = 'recoger';
            await saveTelegramState(chatIdStr, 'collects_menu', 'collects_search_query', tempData);

            const keyboardButtons: any[][] = [
              [{ text: "👥 Seleccionar Proveedor de Lista" }],
              [{ text: "📄 Seleccionar Recolecta de Lista" }],
              [{ text: "Cancelar ❌" }]
            ];

            const dynamicSearchKeyboard = {
              keyboard: keyboardButtons,
              resize_keyboard: true,
              one_time_keyboard: true
            };

            await sendTelegramMessage(
              botToken,
              chatId,
              `📋 <b>Buscar Recolecta</b>\nPor favor, selecciona una opción del Menú abajo o escribe los <b>dígitos finales</b> del número de la recolecta:`,
              dynamicSearchKeyboard
            );
          } else {
            const db = await getDb();
            await sendFlowFallbackMessage(db, botToken, chatId, chatIdStr, state, linkage, text);
          }
          break;
        }

        case 'collects_search_query': {
          if (text.includes("👥 Seleccionar Proveedor de Lista") || text.includes("Seleccionar Proveedor")) {
            try {
              const db = await getDb();
              const pending = await getPendingProviders(db, tempData.assignmentId);
              
              if (pending.length === 0) {
                await sendTelegramMessage(botToken, chatId, "⚠️ No tienes proveedores pendientes de recolectar hoy. Por favor escribe los dígitos del documento:", searchQueryKeyboard);
              } else {
                const rows = pending.map(p => [{ text: p.label }]);
                rows.push([{ text: "Cancelar ❌" }]);
                const clientsKeyboard = {
                  keyboard: rows,
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await saveTelegramState(chatIdStr, 'collects_menu', 'collects_search_provider_select', tempData);
                await sendTelegramMessage(botToken, chatId, "👥 Selecciona el <b>proveedor</b> para ver sus recolectas pendientes:", clientsKeyboard);
              }
            } catch (err) {
              console.error("Error loading pending providers for collects search:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al cargar la lista de proveedores. Por favor escribe los dígitos del documento:", searchQueryKeyboard);
            }
            return NextResponse.json({ ok: true });
          }

          if (text.includes("📄 Seleccionar Recolecta de Lista") || text.includes("Seleccionar Recolecta")) {
            try {
              const db = await getDb();
              const pendingDocs = db.prepare(`
                SELECT id, documento_numero, cliente_nombre FROM ops_delivery_queue
                WHERE asignacion_id = ? AND estado IN ('pendiente', 'en_ruta') AND entregado = 0 AND tipo_documento = 'recoger'
              `).all(tempData.assignmentId) as { id: number, documento_numero: string, cliente_nombre: string }[];

              if (pendingDocs.length > 0) {
                let msg = `📋 <b>Recolectas Pendientes:</b>\n`;
                for (const d of pendingDocs) {
                  msg += `• /doc_${d.documento_numero} - ${d.cliente_nombre}\n`;
                }
                msg += `\n<i>(Toca cualquier comando anterior para seleccionar la recolecta)</i>`;
                await sendTelegramMessage(botToken, chatId, msg, searchQueryKeyboard);
              } else {
                await sendTelegramMessage(botToken, chatId, "⚠️ No tienes recolectas pendientes hoy.", searchQueryKeyboard);
              }
            } catch (err) {
              console.error("Error showing collects list:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al cargar la lista de recolectas.", searchQueryKeyboard);
            }
            return NextResponse.json({ ok: true });
          }

          let db: any;
          try {
            db = await getDb();
            let queryDigits = text.trim();
            if (queryDigits.startsWith('#')) {
              queryDigits = queryDigits.substring(1);
            }
            
            let matches = db.prepare(`
                SELECT * FROM ops_delivery_queue 
                WHERE documento_numero LIKE ? AND (asignacion_id = ? OR asignacion_id IS NULL) AND entregado = 0 AND tipo_documento = 'recoger'
            `).all(`%${queryDigits}`, tempData.assignmentId) as any[];

            if (matches.length === 0) {
              // Document not found - perform automatic sync and retry
              await performAutoSyncSafe();
              matches = db.prepare(`
                  SELECT * FROM ops_delivery_queue 
                  WHERE documento_numero LIKE ? AND (asignacion_id = ? OR asignacion_id IS NULL) AND entregado = 0 AND tipo_documento = 'recoger'
              `).all(`%${queryDigits}`, tempData.assignmentId) as any[];
            }

            if (matches.length === 0) {
              const keyboardButtons: any[][] = [
                [{ text: "👥 Seleccionar Proveedor de Lista" }],
                [{ text: "📄 Seleccionar Recolecta de Lista" }],
                [{ text: "Cancelar ❌" }]
              ];

              const dynamicSearchKeyboard = {
                keyboard: keyboardButtons,
                resize_keyboard: true,
                one_time_keyboard: true
              };

              await sendTelegramMessage(
                botToken, 
                chatId, 
                `❌ No se encontró ninguna recolecta activa terminada en <b>"${queryDigits}"</b> asignada a tu camión o libre hoy.\n\nPor favor, selecciona una opción del menú o escribe de nuevo los dígitos finales:`, 
                dynamicSearchKeyboard
              );
              return NextResponse.json({ ok: true });
            }

            if (matches.length > 1) {
              let multipleMsg = "⚠️ <b>Se encontraron múltiples coincidencias:</b>\n\n";
              for (const match of matches) {
                multipleMsg += `• <code>${match.documento_numero}</code> - ${match.cliente_nombre}\n`;
              }
              multipleMsg += "\nPor favor ingresa el número completo para desempatar:";
              await sendTelegramMessage(botToken, chatId, multipleMsg, searchQueryKeyboard);
              return NextResponse.json({ ok: true });
            }

            // Exactly one match
            const match = matches[0];
            tempData.docId = match.id;
            tempData.docNum = match.documento_numero;
            tempData.docType = 'recoger';
            tempData.cliente = match.cliente_nombre;
            tempData.creadoPor = match.creado_por;

            // Auto-assign in caliente if from general queue
            if (match.asignacion_id === null) {
              db.prepare(`
                UPDATE ops_delivery_queue 
                SET asignacion_id = ?, estado = 'en_ruta', canal_registro = 'telegram', gestionado_por = 'Chofer (Auto-Asignado)' 
                WHERE id = ?
              `).run(tempData.assignmentId, match.id);
            }

            // Set Lock
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?').run(new Date().toISOString(), chatIdStr, match.id);

            await saveTelegramState(chatIdStr, 'collects_menu', 'collect_confirm_document', tempData);

            await sendTelegramMessage(
              botToken,
              chatId,
              formatDocumentDetailMessage(match),
              confirmKeyboard
            );
          } catch (e: any) {
            console.error("Error searching collect in bot", e);
            await sendTelegramMessage(botToken, chatId, "❌ Error al buscar en la base de datos.", getCollectsMenuKeyboard(db, tempData.assignmentId));
            await saveTelegramState(chatIdStr, 'collects_menu', 'collects_menu_home', tempData);
          }
          break;
        }

        case 'collects_search_provider_select': {
          try {
            const db = await getDb();
            const rawText = text.trim();
            
            // Decodificar códigos de proveedor/dirección de la etiqueta del botón
            let matchedClientId: string | null = null;
            let matchedDireccionId: string | null = null;
            let displayClientName = rawText;

            const codePart = rawText.split('|')[0] || '';
            const codes = codePart.split('/').map((c: string) => c.trim());

            if (codes.length >= 2) {
              matchedClientId = codes[0];
              matchedDireccionId = codes[1];
            }

            let matches: any[] = [];

            if (matchedClientId) {
              const allMatches = db.prepare(`
                SELECT * FROM ops_delivery_queue 
                WHERE asignacion_id = ? AND cliente_id = ? AND estado IN ('pendiente', 'en_ruta') AND entregado = 0 AND tipo_documento = 'recoger'
              `).all(tempData.assignmentId, matchedClientId) as any[];

              matches = allMatches.filter(m => {
                if (!matchedDireccionId) return true;
                const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(m.documento_numero) as any;
                const docDirId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();
                return docDirId === matchedDireccionId;
              });

              // Extraer parte legible
              const namePart = rawText.split('|')[1] || rawText;
              displayClientName = namePart.split('[')[0].trim();
            } else {
              const { clientName, direccionId } = parseDestinationLabel(rawText);
              displayClientName = clientName;

              const allMatches = db.prepare(`
                SELECT * FROM ops_delivery_queue 
                WHERE asignacion_id = ? AND (cliente_nombre LIKE ? OR cliente_nombre = ?) AND estado IN ('pendiente', 'en_ruta') AND entregado = 0 AND tipo_documento = 'recoger'
              `).all(tempData.assignmentId, `%${clientName}%`, clientName) as any[];

              matches = allMatches.filter(m => {
                if (!direccionId) return true;
                const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(m.documento_numero) as any;
                const docDirId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();
                return docDirId === direccionId;
              });
            }

            if (matches.length === 0) {
              await sendTelegramMessage(botToken, chatId, `❌ No se encontró ninguna recolecta activa asignada para el proveedor <b>"${displayClientName}"</b>.\n\nPor favor, escribe los dígitos de la recolecta:`, searchQueryKeyboard);
              await saveTelegramState(chatIdStr, 'collects_menu', 'collects_search_query', tempData);
              return NextResponse.json({ ok: true });
            }

            if (matches.length === 1) {
              const match = matches[0];
              tempData.docId = match.id;
              tempData.docNum = match.documento_numero;
              tempData.docType = 'recoger';
              tempData.cliente = match.cliente_nombre;
              tempData.creadoPor = match.creado_por;
              
              // Set Lock
              db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?').run(new Date().toISOString(), chatIdStr, match.id);

              await saveTelegramState(chatIdStr, 'collects_menu', 'collect_confirm_document', tempData);

              await sendTelegramMessage(
                botToken,
                chatId,
                formatDocumentDetailMessage(match),
                confirmKeyboard
              );
            } else {
              // Multiple pending collects for this provider
              const rows = matches.map(m => [{ text: `Recolecta #${m.documento_numero}` }]);
              rows.push([{ text: "Cancelar ❌" }]);
              
              const docsKeyboard = {
                keyboard: rows,
                resize_keyboard: true,
                one_time_keyboard: true
              };
              
              await saveTelegramState(chatIdStr, 'collects_menu', 'collects_search_doc_select', tempData);
              await sendTelegramMessage(
                botToken,
                chatId,
                `📦 El proveedor <b>${displayClientName}</b> tiene ${matches.length} recolectas asignadas hoy.\n\nSelecciona el documento a reportar:`,
                docsKeyboard
              );
            }
          } catch (e: any) {
            console.error("Error selecting provider for collects:", e);
            const db = await getDb();
            await sendTelegramMessage(botToken, chatId, "❌ Error al cargar proveedor.", getCollectsMenuKeyboard(db, tempData.assignmentId));
            await saveTelegramState(chatIdStr, 'collects_menu', 'collects_menu_home', tempData);
          }
          break;
        }

        case 'collects_search_doc_select': {
          try {
            const db = await getDb();
            const docNumMatch = text.match(/#(\w+)/);
            const docNum = docNumMatch ? docNumMatch[1] : text.replace(/[^\w]/g, '');

            const match = db.prepare(`
              SELECT * FROM ops_delivery_queue 
              WHERE asignacion_id = ? AND documento_numero = ? AND entregado = 0 AND tipo_documento = 'recoger'
            `).get(tempData.assignmentId, docNum) as any;

            if (!match) {
              await sendTelegramMessage(botToken, chatId, "❌ Recolecta no encontrada o ya procesada. Escribe los dígitos de la recolecta:", searchQueryKeyboard);
              await saveTelegramState(chatIdStr, 'collects_menu', 'collects_search_query', tempData);
              return NextResponse.json({ ok: true });
            }

            tempData.docId = match.id;
            tempData.docNum = match.documento_numero;
            tempData.docType = 'recoger';
            tempData.cliente = match.cliente_nombre;
            tempData.creadoPor = match.creado_por;

            // Set Lock
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?').run(new Date().toISOString(), chatIdStr, match.id);

            await saveTelegramState(chatIdStr, 'collects_menu', 'collect_confirm_document', tempData);

            await sendTelegramMessage(
              botToken,
              chatId,
              formatDocumentDetailMessage(match),
              confirmKeyboard
            );
          } catch (e: any) {
            console.error("Error in collects_search_doc_select", e);
            await sendTelegramMessage(botToken, chatId, "❌ Error al cargar recolecta.", searchQueryKeyboard);
            await saveTelegramState(chatIdStr, 'collects_menu', 'collects_search_query', tempData);
          }
          break;
        }

        case 'collect_confirm_document': {
          if (text.includes('Sí') || text.includes('registrar') || text.includes('confirmar')) {
            tempData.deliveryMode = 'sencillo';
            await saveTelegramState(chatIdStr, 'collects_menu', 'collect_report_simple', tempData);
            const simpleReportKeyboard = {
              keyboard: [
                [{ text: "👍 Recogido" }],
                [{ text: "❌ No se pudo Recoger" }],
                [{ text: "Cancelar ❌" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };
            await sendTelegramMessage(botToken, chatId, `🚚 <b>¿Cómo resultó la recolecta del documento #${tempData.docNum}?</b>`, simpleReportKeyboard);
          } else {
            const db = await getDb();
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
            await saveTelegramState(chatIdStr, 'collects_menu', 'collects_menu_home', tempData);
            await sendTelegramMessage(botToken, chatId, "🔙 Reporte cancelado.", getCollectsMenuKeyboard(db, tempData.assignmentId));
          }
          break;
        }

        case 'collect_report_simple': {
          if (text.includes("Recogido")) {
            try {
              const db = await getDb();
              await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
                estado: 'completo',
                flowType: 'simple'
              });
            } catch (err) {
              console.error("Error updating simple pickup status:", err);
              const db = await getDb();
              await sendTelegramMessage(botToken, chatId, "❌ Error al guardar en base de datos. Intenta de nuevo.", getCollectsMenuKeyboard(db, tempData.assignmentId));
            }
          } else if (text.includes("No se pudo Recoger") || text.includes("No pudo") || text.includes("rechazar") || text.includes("Rechazado")) {
            tempData.reportState = 'rechazado';
            await saveTelegramState(chatIdStr, 'collects_menu', 'delivery_report_reason', tempData);
            await sendTelegramMessage(botToken, chatId, "✍️ Por favor escribe el <b>motivo o comentario</b> por el cual no se pudo realizar la recolecta:", cancelOnlyKeyboard);
          } else {
            const simpleReportKeyboard = {
              keyboard: [
                [{ text: "👍 Recogido" }],
                [{ text: "❌ No se pudo Recoger" }],
                [{ text: "Cancelar ❌" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };
            await sendTelegramMessage(botToken, chatId, `⚠️ Opción inválida. Por favor, selecciona una de las opciones del menú de botones:\n\n👍 Recogido\n❌ No se pudo Recoger`, simpleReportKeyboard);
          }
          break;
        }

        case 'delivery_report_reason': {
          tempData.reason = text.trim();
          try {
            const db = await getDb();
            await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
              estado: tempData.reportState,
              comentario: tempData.reason,
              flowType: 'simple'
            });
          } catch (err: any) {
            console.error("Error processing collects simple reason:", err);
            const db = await getDb();
            await sendTelegramMessage(botToken, chatId, "❌ Error al registrar la recolecta. Reintentando...", getCollectsMenuKeyboard(db, tempData.assignmentId));
            await saveTelegramState(chatIdStr, 'collects_menu', 'collects_menu_home', tempData);
          }
          break;
        }

        case 'delivery_await_evidence_photo': {
          let hasPhoto = false;
          let photoFilename = null;

          if (message.photo && message.photo.length > 0) {
            try {
              const photo = message.photo[message.photo.length - 1];
              await sendTelegramMessage(botToken, chatId, "⏳ Descargando foto de evidencia...");
              photoFilename = await downloadTelegramFile(botToken, photo.file_id);
              hasPhoto = true;
            } catch (err: any) {
              console.error("Error downloading telegram photo for collection", err);
              await sendTelegramMessage(botToken, chatId, "⚠️ Error al descargar la foto. Intenta enviarla de nuevo:");
              return NextResponse.json({ ok: true });
            }
          }

          const db = await getDb();
          const reqEvidencePhotoRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_require_evidence_photo'").get() as { value: string } | undefined;
          const reqEvidencePhoto = reqEvidencePhotoRow?.value || 'disabled';
          const isMandatory = reqEvidencePhoto === 'mandatory';

          if (!hasPhoto && text === 'Omitir foto de evidencia ⏭️') {
            if (isMandatory) {
              await sendTelegramMessage(botToken, chatId, "⚠️ La foto de evidencia es obligatoria. Por favor envía la foto:", cancelOnlyKeyboard);
              return NextResponse.json({ ok: true });
            }
            tempData.fotoEvidencia = null; // Omitted
          } else if (!hasPhoto) {
            const optionalKeyboard = {
              keyboard: [
                [{ text: "Omitir foto de evidencia ⏭️" }],
                [{ text: "Volver al Menú Principal 🔙" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };
            const mandatoryKeyboard = {
              keyboard: [
                [{ text: "Volver al Menú Principal 🔙" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };

            await sendTelegramMessage(
              botToken,
              chatId,
              isMandatory
                ? "⚠️ Entrada inválida. Por favor, toma y envía una foto de evidencia:"
                : "⚠️ Entrada inválida. Envía una foto o presiona 'Omitir foto de evidencia ⏭️':",
              isMandatory ? mandatoryKeyboard : optionalKeyboard
            );
            return NextResponse.json({ ok: true });
          } else {
            tempData.fotoEvidencia = photoFilename;
          }

          await runNextFinalizeStep(db, chatIdStr, chatId, botToken, linkage, tempData);
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (state.currentFlow === 'delivery_menu') {
      if (text === 'Volver al Menú Principal 🔙' || text === '/cancelar' || text.toLowerCase() === 'cancelar') {
        // Unlock document if locked
        if (tempData.docId) {
          const db = await getDb();
          db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
        }
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "🔙 Volviendo al menú principal.", getDynamicMenuKeyboard(linkage));
        return NextResponse.json({ ok: true });
      }

      switch (state.step) {
        case 'delivery_menu_home': {
          if (text.includes("Registrar Entrega")) {
            const db = await getDb();
            
            let nextClient = null;
            if (tempData.assignmentId) {
              const assRow = db.prepare("SELECT siguiente_cliente FROM ops_delivery_assignments WHERE id = ?").get(tempData.assignmentId) as { siguiente_cliente: string | null } | undefined;
              nextClient = assRow?.siguiente_cliente;
            }

            if (nextClient) {
              // Decodificar códigos de cliente/dirección de la etiqueta guardada
              let matchedClientId: string | null = null;
              let matchedDireccionId: string | null = null;
              let cleanClientNameQuery = nextClient;

              const codePart = nextClient.split('|')[0] || '';
              const codes = codePart.split('/').map((c: string) => c.trim());

              if (codes.length >= 2) {
                matchedClientId = codes[0];
                matchedDireccionId = codes[1];
              }

              let allPending: any[] = [];

              if (matchedClientId) {
                const queryMatches = db.prepare(`
                  SELECT id, documento_numero, cliente_nombre FROM ops_delivery_queue 
                  WHERE asignacion_id = ? AND cliente_id = ? AND estado IN ('pendiente', 'en_ruta') AND entregado = 0 AND tipo_documento <> 'recoger'
                `).all(tempData.assignmentId, matchedClientId) as { id: number; documento_numero: string; cliente_nombre: string }[];

                allPending = queryMatches.filter(m => {
                  if (!matchedDireccionId) return true;
                  const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(m.documento_numero) as any;
                  const docDirId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();
                  return docDirId === matchedDireccionId;
                });
              } else {
                const { clientName, direccionId } = parseDestinationLabel(nextClient);
                cleanClientNameQuery = clientName;

                const queryMatches = db.prepare(`
                  SELECT id, documento_numero, cliente_nombre FROM ops_delivery_queue 
                  WHERE asignacion_id = ? AND (cliente_nombre LIKE ? OR cliente_nombre = ?) AND estado IN ('pendiente', 'en_ruta') AND entregado = 0 AND tipo_documento <> 'recoger'
                `).all(tempData.assignmentId, `%${clientName}%`, clientName) as { id: number; documento_numero: string; cliente_nombre: string }[];

                allPending = queryMatches.filter(m => {
                  if (!direccionId) return true;
                  const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(m.documento_numero) as any;
                  const docDirId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();
                  return docDirId === direccionId;
                });
              }
              
              const pendingDeliveries = allPending;
              
              if (pendingDeliveries.length > 0) {
                tempData.nextClientName = nextClient;
                tempData.suggestedDocIds = pendingDeliveries.map(d => d.id);
                tempData.suggestedDocNums = pendingDeliveries.map(d => d.documento_numero);
                
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_suggest_next_client', tempData);
                
                const docNumsStr = pendingDeliveries.map(d => `#${d.documento_numero}`).join(', ');
                const suggestedKeyboard = {
                  keyboard: [
                    [{ text: `🟢 Entregar Todas Completas (${pendingDeliveries.length})` }],
                    [{ text: `✏️ Reportar una por una` }],
                    [{ text: `🔍 Buscar Otra Factura / Pedido` }]
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                
                await sendTelegramMessage(
                  botToken, 
                  chatId, 
                  `📍 <b>Has llegado a: ${nextClient}</b>\n` +
                  `Detectamos que tienes pendientes las siguientes facturas/pedidos:\n` +
                  `👉 <b>${docNumsStr}</b>\n\n` +
                  `¿Cómo deseas reportar estas entregas?`,
                  suggestedKeyboard
                );
                return NextResponse.json({ ok: true });
              }
            }

            const pedidosEnabledRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'pedidos_enabled'").get() as { value: string } | undefined;
            const pedidosEnabled = (pedidosEnabledRow?.value !== 'false');

            if (!pedidosEnabled) {
              await sendSearchQueryPrompt(db, botToken, chatId, chatIdStr, tempData, 'factura');
            } else {
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_type', tempData);
              const searchTypeKeyboard = {
                keyboard: [
                  [{ text: "Factura" }, { text: "Pedido" }],
                  [{ text: "Volver al Menú Principal 🔙" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              };
              await sendTelegramMessage(botToken, chatId, "🔍 ¿Deseas buscar por <b>Pedido</b> o por <b>Factura</b>?", searchTypeKeyboard);
            }
          } else if (text.includes("Auto-Cargar Factura")) {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_autoload_query', tempData);
            await sendTelegramMessage(
              botToken,
              chatId,
              "📥 <b>Auto-Cargar Facturas en Bloque</b>\n\nPor favor escribe los números finales de las facturas que llevas, separados por comas (ejemplo: <code>4132, 4135, 4140</code>).\n\nEl sistema buscará los documentos libres en la Cola General y los asignará a tu camión de inmediato:",
              cancelOnlyKeyboard
            );
          } else if (text.includes("Completar Ruta y regresar")) {
            const db = await getDb();
            const askReturnLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_return_location'").get() as { value: string } | undefined;
            const isMandatory = askReturnLocRow?.value === 'mandatory';

            await saveTelegramState(chatIdStr, 'delivery_await_return_location', 'wait_gps_return', tempData);

            const locationKeyboard = {
              keyboard: [
                [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
                ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
                [{ text: "Volver al Menú Principal 🔙" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };

            await sendTelegramMessage(
              botToken,
              chatId,
              `📍 <b>Inicio de Retorno: Geolocalización</b>\n` +
              `Por favor comparte tu ubicación GPS actual utilizando el botón de abajo para registrar tu salida de regreso a la empresa:` +
              (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
              locationKeyboard
            );
          } else if (text.includes("Registrar Llegada a Empresa")) {
            const db = await getDb();
            const askArrivalLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_arrival_location'").get() as { value: string } | undefined;
            const isMandatory = askArrivalLocRow?.value === 'mandatory';

            await saveTelegramState(chatIdStr, 'delivery_await_arrival_location', 'wait_gps_arrival', tempData);

            const locationKeyboard = {
              keyboard: [
                [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
                ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
                [{ text: "Volver al Menú Principal 🔙" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };

            await sendTelegramMessage(
              botToken,
              chatId,
              `📍 <b>Llegada a Empresa: Geolocalización</b>\n` +
              `Por favor comparte tu ubicación GPS actual utilizando el botón de abajo para registrar tu ingreso físico a la empresa y cerrar la ruta:` +
              (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
              locationKeyboard
            );
          } else if (text.includes("Finalizar Ruta")) {
            const db = await getDb();
            let hasStartedReturn = false;
            if (tempData.assignmentId) {
              const assRow = db.prepare("SELECT fecha_inicio_retorno FROM ops_delivery_assignments WHERE id = ?").get(tempData.assignmentId) as { fecha_inicio_retorno: string | null } | undefined;
              hasStartedReturn = assRow?.fecha_inicio_retorno !== null && assRow?.fecha_inicio_retorno !== undefined;
            }

            if (hasStartedReturn) {
              // Direct them to register arrival instead
              const askArrivalLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_arrival_location'").get() as { value: string } | undefined;
              const isMandatory = askArrivalLocRow?.value === 'mandatory';

              await saveTelegramState(chatIdStr, 'delivery_await_arrival_location', 'wait_gps_arrival', tempData);

              const locationKeyboard = {
                keyboard: [
                  [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
                  ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
                  [{ text: "Volver al Menú Principal 🔙" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              };

              await sendTelegramMessage(
                botToken,
                chatId,
                `📍 <b>Llegada a Empresa: Geolocalización</b>\n` +
                `Por favor comparte tu ubicación GPS actual utilizando el botón de abajo para registrar tu ingreso físico a la empresa y cerrar la ruta:` +
                (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
                locationKeyboard
              );
            } else {
              const pending = db.prepare(`
                SELECT id, documento_numero, cliente_nombre 
                FROM ops_delivery_queue 
                WHERE asignacion_id = ? AND entregado = 0
              `).all(tempData.assignmentId) as { id: number; documento_numero: string; cliente_nombre: string }[];

              if (pending.length > 0) {
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_finish_pending_check', tempData);
                
                let msg = `⚠️ <b>Tienes entregas pendientes en tu ruta activa:</b>\n\n`;
                pending.forEach((p, idx) => {
                  msg += `${idx + 1}. <b>${p.cliente_nombre}</b> (Documento: #${p.documento_numero})\n`;
                });
                msg += `\n¿Cómo deseas proceder para finalizar tu ruta?\n\n` +
                       `1️⃣ <b>Ruta Completa</b>: Registra todos los pendientes como entregados al 100% y cierra la ruta.\n` +
                       `2️⃣ <b>Ruta Incompleta</b>: Finaliza la ruta dejando estos pendientes (volverán a la cola general).\n` +
                       `3️⃣ <b>Cancelar</b>: Continúa con tus entregas normales.`;

                await sendTelegramMessage(
                  botToken,
                  chatId,
                  msg,
                  {
                    keyboard: [
                      [{ text: "🏁 Finalizar Ruta Completa ✅" }],
                      [{ text: "⚠️ Finalizar Ruta Incompleta" }],
                      [{ text: "Seguir en Ruta / Cancelar 🔙" }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                  }
                );
              } else {
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_finish_confirm', tempData);
                await sendTelegramMessage(
                  botToken,
                  chatId,
                  "🏁 <b>¿Has terminado tu jornada?</b>\nSe cerrarán tus rutas activas y los pedidos que queden en ruta no reportados volverán a la cola general.\n\nEscribe <b>SI</b> para confirmar o <b>NO</b> para cancelar:",
                  {
                    keyboard: [[{ text: "Sí, finalizar jornada ✅" }], [{ text: "No, seguir en ruta 🔙" }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                  }
                );
              }
            }
          } else {
            const db = await getDb();
            await sendFlowFallbackMessage(db, botToken, chatId, chatIdStr, state, linkage, text);
          }
          break;
        }

        case 'delivery_suggest_next_client': {
          if (text.includes("Entregar Todas Completas")) {
            try {
              const db = await getDb();
              
              // Prepare batch data for validation steps (photo, GPS, etc.)
              tempData.isBatchCompletion = true;
              tempData.batchDocIds = tempData.suggestedDocIds;
              tempData.batchDocNums = tempData.suggestedDocNums;
              tempData.docNum = tempData.suggestedDocNums.map((n: string) => `#${n}`).join(', ');
              tempData.docId = tempData.suggestedDocIds[0];
              
              tempData.finalStateData = {
                estado: 'completo',
                comentario: 'Entrega en Lote (Completo)'
              };

              // Route to confirmation/validation steps
              await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, tempData.finalStateData);
            } catch (err) {
              console.error("Error starting batch complete validation:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al iniciar la validación del lote. Intente de nuevo.", deliveryMenuKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            }
          } else if (text.includes("Reportar una por una")) {
            tempData.batchIndex = 0;
            await startBatchSequentialReporting(chatIdStr, chatId, botToken, tempData);
          } else {
            const db = await getDb();
            const pedidosEnabledRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'pedidos_enabled'").get() as { value: string } | undefined;
            const pedidosEnabled = (pedidosEnabledRow?.value !== 'false');

            if (!pedidosEnabled) {
              tempData.searchType = 'factura';
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_query', tempData);
              await sendTelegramMessage(botToken, chatId, "✍️ Por favor escribe los <b>dígitos finales</b> del número de la factura:", searchQueryKeyboard);
            } else {
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_type', tempData);
              const searchTypeKeyboard = {
                keyboard: [
                  [{ text: "Factura" }, { text: "Pedido" }],
                  [{ text: "Volver al Menú Principal 🔙" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              };
              await sendTelegramMessage(botToken, chatId, "🔍 ¿Deseas buscar por <b>Pedido</b> o por <b>Factura</b>?", searchTypeKeyboard);
            }
          }
          break;
        }

        case 'delivery_next_destination_init': {
          if (text.includes("Seleccionar de Lista")) {
            try {
              const db = await getDb();
              const pending = await getPendingDestinations(db, tempData.assignmentId);
              
              if (pending.length === 0) {
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
                await sendTelegramMessage(botToken, chatId, "⚠️ No tienes clientes pendientes en tu ruta de hoy. Volviendo al menú.", deliveryMenuKeyboard);
              } else {
                const rows = pending.map(p => [{ text: p.label }]);
                rows.push([{ text: "🔙 Cancelar" }]);
                const clientsKeyboard = {
                  keyboard: rows,
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_next_destination_list', tempData);
                await sendTelegramMessage(botToken, chatId, "👉 Selecciona el <b>próximo cliente</b> de tu lista de entregas pendientes:", clientsKeyboard);
              }
            } catch (err) {
              console.error("Error loading pending clients:", err);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
              await sendTelegramMessage(botToken, chatId, "❌ Error al cargar lista.", deliveryMenuKeyboard);
            }
          } else if (text.includes("Digitar Factura")) {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_next_destination_manual', tempData);
            await sendTelegramMessage(botToken, chatId, "✍️ Escribe el nombre del cliente o número de factura hacia donde te diriges:", cancelOnlyKeyboard);
          } else if (text.includes("Omitir")) {
            try {
              const db = await getDb();
              db.prepare("UPDATE ops_delivery_assignments SET siguiente_cliente = NULL, siguiente_cliente_fecha = NULL WHERE id = ?").run(tempData.assignmentId);
            } catch (err) {}
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            await sendTelegramMessage(botToken, chatId, "⏭️ Omitido. Volviendo al menú de entregas.", deliveryMenuKeyboard);
          } else {
            await sendTelegramMessage(botToken, chatId, "Opción no válida. Por favor, toca una de las opciones del menú:", cancelOnlyKeyboard);
          }
          break;
        }

        case 'delivery_next_destination_list': {
          if (text.includes("Cancelar") || text.includes("Volver")) {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            await sendTelegramMessage(botToken, chatId, "🔙 Volviendo al menú principal de entregas.", deliveryMenuKeyboard);
          } else {
            try {
              const db = await getDb();
              db.prepare("UPDATE ops_delivery_assignments SET siguiente_cliente = ?, siguiente_cliente_fecha = ? WHERE id = ?").run(text.trim(), new Date().toISOString(), tempData.assignmentId);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
              const navLinks = await getNavigationLinks(db, tempData.assignmentId, text.trim());
              await sendTelegramMessage(botToken, chatId, `📍 Próximo destino establecido: <b>${text.trim()}</b>.${navLinks}`, deliveryMenuKeyboard);
            } catch (err) {
              console.error("Error saving next destination:", err);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
              await sendTelegramMessage(botToken, chatId, "❌ Error de base de datos al guardar próximo cliente.", deliveryMenuKeyboard);
            }
          }
          break;
        }

        case 'delivery_next_destination_manual': {
          if (text === 'Cancelar ❌' || text.toLowerCase() === 'cancelar') {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            await sendTelegramMessage(botToken, chatId, "🔙 Volviendo al menú principal de entregas.", deliveryMenuKeyboard);
          } else {
            try {
              const db = await getDb();
              let destination = text.trim();
              const docMatch = db.prepare(`
                SELECT cliente_nombre FROM ops_delivery_queue 
                WHERE asignacion_id = ? AND documento_numero LIKE ? AND entregado = 0 LIMIT 1
              `).get(tempData.assignmentId, `%${destination}`) as { cliente_nombre: string } | undefined;
              
              if (docMatch) {
                destination = docMatch.cliente_nombre;
              }
              
              db.prepare("UPDATE ops_delivery_assignments SET siguiente_cliente = ?, siguiente_cliente_fecha = ? WHERE id = ?").run(destination, new Date().toISOString(), tempData.assignmentId);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
              const navLinks = await getNavigationLinks(db, tempData.assignmentId, destination);
              await sendTelegramMessage(botToken, chatId, `📍 Próximo destino establecido: <b>${destination}</b>.${navLinks}`, deliveryMenuKeyboard);
            } catch (err) {
              console.error("Error saving manual destination:", err);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
              await sendTelegramMessage(botToken, chatId, "❌ Error de base de datos al guardar próximo cliente.", deliveryMenuKeyboard);
            }
          }
          break;
        }

        case 'delivery_autoload_query': {
          try {
            const db = await getDb();
            const queryDigitsList = text.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
            
            if (queryDigitsList.length === 0) {
              await sendTelegramMessage(botToken, chatId, "⚠️ Entrada inválida. Escribe la lista de facturas separadas por comas (ejemplo: <code>4132, 4135, 4140</code>):", cancelOnlyKeyboard);
              return NextResponse.json({ ok: true });
            }

            const successLoaded: { id: number; documento_numero: string; cliente_id: string; cliente_nombre: string }[] = [];
            const notFoundList: string[] = [];
            const alreadyAssignedList: string[] = [];

            for (const digits of queryDigitsList) {
              const matches = db.prepare(`
                SELECT id, documento_numero, asignacion_id, cliente_id, cliente_nombre 
                FROM ops_delivery_queue 
                WHERE (documento_numero LIKE ? OR documento_numero = ?) AND entregado = 0
              `).all(`%${digits}`, digits) as any[];

              if (matches.length === 0) {
                notFoundList.push(digits);
                continue;
              }

              const freeMatches = matches.filter(m => m.asignacion_id === null);
              const assignedMatches = matches.filter(m => m.asignacion_id !== null);

              if (freeMatches.length > 0) {
                const bestMatch = freeMatches[0];
                successLoaded.push({
                  id: bestMatch.id,
                  documento_numero: bestMatch.documento_numero,
                  cliente_id: bestMatch.cliente_id,
                  cliente_nombre: bestMatch.cliente_nombre
                });
              } else if (assignedMatches.length > 0) {
                alreadyAssignedList.push(digits);
              } else {
                notFoundList.push(digits);
              }
            }

            // Save results to tempData for intermediate confirmation
            tempData.autoloadFoundIds = successLoaded.map(f => f.id);
            tempData.autoloadFoundDocs = successLoaded;
            tempData.autoloadAlreadyAssigned = alreadyAssignedList;
            tempData.autoloadNotFound = notFoundList;
            tempData.autoloadQueryText = text;

            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_autoload_confirm', tempData);

            let responseMsg = "📥 <b>Confirmación de Auto-Carga</b>\n\n";
            if (successLoaded.length > 0) {
              responseMsg += `<b>Se van a cargar estas facturas (${successLoaded.length}):</b>\n`;
              successLoaded.forEach(f => {
                responseMsg += `• <code>${f.documento_numero}</code> (${f.cliente_nombre})\n`;
              });
              responseMsg += "\n";
            }
            if (alreadyAssignedList.length > 0) {
              responseMsg += `⚠️ <b>Ya asignadas a otros camiones (${alreadyAssignedList.length}):</b>\n`;
              alreadyAssignedList.forEach(f => {
                responseMsg += `• <code>${f}</code> (no se modificarán)\n`;
              });
              responseMsg += "\n";
            }
            if (notFoundList.length > 0) {
              responseMsg += `❌ <b>No encontradas en Cola General (${notFoundList.length}):</b>\n`;
              notFoundList.forEach(f => {
                responseMsg += `• <code>${f}</code>\n`;
              });
              responseMsg += "\n";
            }

            if (successLoaded.length === 0) {
              responseMsg += "⚠️ <i>No se encontraron facturas válidas libres para cargar.</i>";
              const errorKeyboard = {
                keyboard: [
                  [{ text: "✍️ Corregir / Intentar de nuevo" }],
                  [{ text: "Cancelar ❌" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              };
              await sendTelegramMessage(botToken, chatId, responseMsg, errorKeyboard);
            } else {
              responseMsg += "<b>¿Deseas aceptar y cargar estos documentos, o corregir la lista?</b>";
              const confirmKeyboard = {
                keyboard: [
                  [{ text: "✅ Aceptar y Cargar" }],
                  [{ text: "✍️ Corregir / Cambiar lista" }],
                  [{ text: "Cancelar ❌" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              };
              await sendTelegramMessage(botToken, chatId, responseMsg, confirmKeyboard);
            }
          } catch (err: any) {
            console.error("Error in delivery_autoload_query:", err);
            const db = await getDb();
            const destFlow = tempData.parentFlow || 'delivery_menu';
            const destStep = destFlow === 'delivery_pre_depart' ? 'pre_depart_home' : 'delivery_menu_home';
            let destKeyboard = deliveryMenuKeyboard;
            if (destFlow === 'delivery_pre_depart') {
              destKeyboard = await getDeliveryPreDepartKeyboard(db, tempData.assignmentId);
            } else {
              try {
                destKeyboard = getDeliveryMenuKeyboard(db, tempData.assignmentId);
              } catch (dbErr) {
                console.error("Error getting db for keyboard in catch:", dbErr);
              }
            }
            delete tempData.parentFlow;
            await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar las facturas en la base de datos.", destKeyboard);
            await saveTelegramState(chatIdStr, destFlow, destStep, tempData);
          }
          break;
        }

        case 'delivery_autoload_confirm': {
          const db = await getDb();
          const destFlow = tempData.parentFlow || 'delivery_menu';
          const destStep = destFlow === 'delivery_pre_depart' ? 'pre_depart_home' : 'delivery_menu_home';
          const destKeyboard = destFlow === 'delivery_pre_depart' ? await getDeliveryPreDepartKeyboard(db, tempData.assignmentId) : getDeliveryMenuKeyboard(db, tempData.assignmentId);

          if (text.includes("Cancelar") || text.includes("❌")) {
            delete tempData.parentFlow;
            await saveTelegramState(chatIdStr, destFlow, destStep, tempData);
            await sendTelegramMessage(botToken, chatId, "🔙 Operación cancelada. Volviendo al menú principal.", destKeyboard);
            return NextResponse.json({ ok: true });
          }

          if (text.includes("Corregir") || text.includes("Cambiar") || text.includes("Intentar")) {
            // Reset to autoload query step
            delete tempData.autoloadFoundIds;
            delete tempData.autoloadFoundDocs;
            delete tempData.autoloadAlreadyAssigned;
            delete tempData.autoloadNotFound;
            delete tempData.autoloadQueryText;

            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_autoload_query', tempData);
            await sendTelegramMessage(
              botToken,
              chatId,
              "📥 <b>Auto-Cargar Facturas en Bloque</b>\n\nPor favor escribe los números finales de las facturas que llevas, separados por comas (ejemplo: <code>4132, 4135, 4140</code>):",
              cancelOnlyKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          if (text.includes("Aceptar") || text.includes("Cargar")) {
            try {
              const idsToLoad = tempData.autoloadFoundIds || [];

              if (idsToLoad.length === 0) {
                delete tempData.parentFlow;
                await sendTelegramMessage(botToken, chatId, "⚠️ No hay documentos válidos para cargar. Operación cancelada.", destKeyboard);
                await saveTelegramState(chatIdStr, destFlow, destStep, tempData);
                return NextResponse.json({ ok: true });
              }

              db.transaction(() => {
                for (const docId of idsToLoad) {
                  db.prepare(`
                    UPDATE ops_delivery_queue 
                    SET asignacion_id = ?, estado = 'en_ruta', canal_registro = 'telegram', gestionado_por = 'Chofer (Auto-Cargar)' 
                    WHERE id = ?
                  `).run(tempData.assignmentId, docId);
                }
              })();

              const count = idsToLoad.length;
              let successMsg = `✅ <b>¡Auto-Carga Exitosa!</b>\nSe han asignado exitosamente <b>${count}</b> facturas a tu camión.\n\n`;
              successMsg += "💡 <i>Los documentos ya están en tu ruta y listos para reportarse.</i>";

              // Clear dynamic autoload values
              delete tempData.autoloadFoundIds;
              delete tempData.autoloadFoundDocs;
              delete tempData.autoloadAlreadyAssigned;
              delete tempData.autoloadNotFound;
              delete tempData.autoloadQueryText;
              delete tempData.parentFlow;

              // Si venimos de pre-salida, forzamos el teclado que contiene "Salir a Ruta" 
              // para evitar lecturas de base de datos desactualizadas en este mismo microsegundo.
              const finalKeyboard = destFlow === 'delivery_pre_depart'
                ? deliveryPreDepartKeyboard
                : getDeliveryMenuKeyboard(db, tempData.assignmentId);

              await saveTelegramState(chatIdStr, destFlow, destStep, tempData);
              await sendTelegramMessage(botToken, chatId, successMsg, finalKeyboard);
            } catch (err: any) {
              console.error("Error in delivery_autoload_confirm:", err);
              delete tempData.parentFlow;
              await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al guardar los documentos en la base de datos.", destKeyboard);
              await saveTelegramState(chatIdStr, destFlow, destStep, tempData);
            }
          } else {
            try {
              const queryDigitsList = text.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
              
              if (queryDigitsList.length === 0) {
                await sendTelegramMessage(botToken, chatId, "⚠️ Entrada inválida. Escribe la lista de facturas separadas por comas (ejemplo: <code>4132, 4135, 4140</code>):", cancelOnlyKeyboard);
                return NextResponse.json({ ok: true });
              }

              const successLoaded: { id: number; documento_numero: string; cliente_id: string; cliente_nombre: string }[] = [];
              const notFoundList: string[] = [];
              const alreadyAssignedList: string[] = [];

              for (const digits of queryDigitsList) {
                const matches = db.prepare(`
                  SELECT id, documento_numero, asignacion_id, cliente_id, cliente_nombre 
                  FROM ops_delivery_queue 
                  WHERE (documento_numero LIKE ? OR documento_numero = ?) AND entregado = 0
                `).all(`%${digits}`, digits) as any[];

                if (matches.length === 0) {
                  notFoundList.push(digits);
                  continue;
                }

                const freeMatches = matches.filter(m => m.asignacion_id === null);
                const assignedMatches = matches.filter(m => m.asignacion_id !== null);

                if (freeMatches.length > 0) {
                  const bestMatch = freeMatches[0];
                  successLoaded.push({
                    id: bestMatch.id,
                    documento_numero: bestMatch.documento_numero,
                    cliente_id: bestMatch.cliente_id,
                    cliente_nombre: bestMatch.cliente_nombre
                  });
                } else if (assignedMatches.length > 0) {
                  alreadyAssignedList.push(digits);
                } else {
                  notFoundList.push(digits);
                }
              }

              tempData.autoloadFoundIds = successLoaded.map(f => f.id);
              tempData.autoloadFoundDocs = successLoaded;
              tempData.autoloadAlreadyAssigned = alreadyAssignedList;
              tempData.autoloadNotFound = notFoundList;
              tempData.autoloadQueryText = text;

              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_autoload_confirm', tempData);

              let responseMsg = "📥 <b>Confirmación de Auto-Carga</b>\n\n";
              if (successLoaded.length > 0) {
                responseMsg += `<b>Se van a cargar estas facturas (${successLoaded.length}):</b>\n`;
                successLoaded.forEach(f => {
                  responseMsg += `• <code>${f.documento_numero}</code> (${f.cliente_nombre})\n`;
                });
                responseMsg += "\n";
              }
              if (alreadyAssignedList.length > 0) {
                responseMsg += `⚠️ <b>Ya asignadas a otros camiones (${alreadyAssignedList.length}):</b>\n`;
                alreadyAssignedList.forEach(f => {
                  responseMsg += `• <code>${f}</code> (no se modificarán)\n`;
                });
                responseMsg += "\n";
              }
              if (notFoundList.length > 0) {
                responseMsg += `❌ <b>No encontradas en Cola General (${notFoundList.length}):</b>\n`;
                notFoundList.forEach(f => {
                  responseMsg += `• <code>${f}</code>\n`;
                });
                responseMsg += "\n";
              }

              if (successLoaded.length === 0) {
                responseMsg += "⚠️ <i>No se encontraron facturas válidas libres para cargar.</i>";
                const errorKeyboard = {
                  keyboard: [
                    [{ text: "✍️ Corregir / Intentar de nuevo" }],
                    [{ text: "Cancelar ❌" }]
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await sendTelegramMessage(botToken, chatId, responseMsg, errorKeyboard);
              } else {
                responseMsg += "<b>¿Deseas aceptar y cargar estos documentos, o corregir la lista?</b>";
                const confirmKeyboard = {
                  keyboard: [
                    [{ text: "✅ Aceptar y Cargar" }],
                    [{ text: "✍️ Corregir / Cambiar lista" }],
                    [{ text: "Cancelar ❌" }]
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await sendTelegramMessage(botToken, chatId, responseMsg, confirmKeyboard);
              }
            } catch (err: any) {
              console.error("Error direct autoload confirm search:", err);
              await sendTelegramMessage(botToken, chatId, "Elige una opción válida de los botones:", cancelOnlyKeyboard);
            }
          }
          break;
        }

        case 'delivery_finish_pending_check': {
          if (text.includes("Completa")) {
            try {
              const db = await getDb();
              const pending = db.prepare(`
                SELECT id, documento_numero 
                FROM ops_delivery_queue 
                WHERE asignacion_id = ? AND entregado = 0
              `).all(tempData.assignmentId) as { id: number; documento_numero: string }[];

              if (pending.length === 0) {
                await sendTelegramMessage(botToken, chatId, "No se encontraron facturas pendientes. Finalizando jornada estándar...", cancelOnlyKeyboard);
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_finish_confirm', tempData);
                await sendTelegramMessage(
                  botToken,
                  chatId,
                  "🏁 <b>¿Has terminado tu jornada?</b>\nSe cerrarán tus rutas activas y los pedidos que queden en ruta no reportados volverán a la cola general.\n\nEscribe <b>SI</b> para confirmar o <b>NO</b> para cancelar:",
                  {
                    keyboard: [[{ text: "Sí, finalizar jornada ✅" }], [{ text: "No, seguir en ruta 🔙" }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                  }
                );
              } else {
                // Prepare batch completion logic
                tempData.isBatchCompletion = true;
                tempData.batchDocIds = pending.map(p => p.id);
                tempData.batchDocNums = pending.map(p => p.documento_numero);
                tempData.docNum = pending.map(p => `#${p.documento_numero}`).join(', ');
                tempData.docId = pending[0].id;
                
                tempData.finalStateData = {
                  estado: 'completo',
                  comentario: 'Finalización de Ruta (Entregas al 100%)'
                };

                await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, tempData.finalStateData);
              }
            } catch (err) {
              console.error("Error initiating batch complete from finish route:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar la ruta completa. Reintentando...", deliveryMenuKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            }
          } else if (text.includes("Incompleta")) {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_finish_confirm', tempData);
            await sendTelegramMessage(
              botToken,
              chatId,
              "🏁 <b>¿Has terminado tu jornada?</b>\nSe cerrarán tus rutas activas y los pedidos que queden en ruta no reportados volverán a la cola general.\n\nEscribe <b>SI</b> para confirmar o <b>NO</b> para cancelar:",
              {
                keyboard: [[{ text: "Sí, finalizar jornada ✅" }], [{ text: "No, seguir en ruta 🔙" }]],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            );
          } else {
            // Cancelar / Seguir en ruta / Cualquier otro texto
            const db = await getDb();
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            await sendTelegramMessage(botToken, chatId, "🔙 Operación cancelada. Sigues en ruta activa.", getDeliveryMenuKeyboard(db, tempData.assignmentId));
          }
          break;
        }

        case 'delivery_finish_confirm': {
          if (text.toLowerCase().includes('sí') || text.toLowerCase().includes('si') || text.includes('finalizar')) {
            try {
              const db = await getDb();
              
              // Close assignment and clear next destination fields
              db.prepare('UPDATE ops_delivery_assignments SET activa = 0, fecha_completada = ?, siguiente_cliente = NULL, siguiente_cliente_fecha = NULL WHERE id = ?').run(new Date().toISOString(), tempData.assignmentId);

              // Return remaining en_ruta docs back to general queue and trace the release
              db.prepare(`
                  UPDATE ops_delivery_queue 
                  SET devolucion_asignacion_id = asignacion_id, asignacion_id = NULL, estado = 'pendiente', canal_registro = 'telegram', gestionado_por = 'Chofer (Fin jornada)'
                  WHERE asignacion_id = ? AND entregado = 0
              `).run(tempData.assignmentId);

              await deleteTelegramState(chatIdStr);
              await sendTelegramMessage(botToken, chatId, "🏁 <b>Ruta cerrada con éxito.</b>\nGracias por reportar tus entregas hoy. ¡Ten un excelente viaje de regreso!", getDynamicMenuKeyboard(linkage));
            } catch (err: any) {
              console.error("Error closing route:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al finalizar la ruta en la base de datos.", deliveryMenuKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            }
          } else {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            await sendTelegramMessage(botToken, chatId, "🔙 Operación cancelada. Sigues en ruta activa.", deliveryMenuKeyboard);
          }
          break;
        }

        case 'delivery_search_type': {
          const type = text.toLowerCase().includes('factura') ? 'factura' : 'pedido';
          try {
            const db = await getDb();
            await sendSearchQueryPrompt(db, botToken, chatId, chatIdStr, tempData, type);
          } catch (err) {
            console.error("Error in delivery_search_type:", err);
            await sendTelegramMessage(botToken, chatId, `✍️ Por favor escribe los <b>dígitos finales</b> del número de la ${type}:`, searchQueryKeyboard);
          }
          break;
        }

        case 'delivery_search_query': {
          if (text.includes("👥 Seleccionar Cliente de Lista") || text.includes("Seleccionar Cliente")) {
            try {
              const db = await getDb();
              const pending = await getPendingDestinations(db, tempData.assignmentId);
              
              if (pending.length === 0) {
                await sendTelegramMessage(botToken, chatId, "⚠️ No tienes clientes pendientes en tu ruta de hoy. Por favor escribe los dígitos del documento:", searchQueryKeyboard);
              } else {
                const rows = pending.map(p => [{ text: p.label }]);
                rows.push([{ text: "Cancelar ❌" }]);
                const clientsKeyboard = {
                  keyboard: rows,
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_client_select', tempData);
                await sendTelegramMessage(botToken, chatId, "👥 Selecciona el <b>cliente</b> para ver sus facturas/pedidos pendientes:", clientsKeyboard);
              }
            } catch (err) {
              console.error("Error loading pending clients for search:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al cargar la lista de clientes. Por favor escribe los dígitos del documento:", searchQueryKeyboard);
            }
            return NextResponse.json({ ok: true });
          }

          if (text.includes("📄 Seleccionar Documento de Lista") || text.includes("Seleccionar Documento")) {
            try {
              const db = await getDb();
              await sendSearchQueryPrompt(db, botToken, chatId, chatIdStr, tempData, tempData.searchType || 'factura', true);
            } catch (err) {
              console.error("Error showing document list:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al cargar la lista de documentos.", searchQueryKeyboard);
            }
            return NextResponse.json({ ok: true });
          }

          try {
            const db = await getDb();
            let queryDigits = text.trim();
            if (queryDigits.startsWith('#')) {
              queryDigits = queryDigits.substring(1);
            }
            
            // Search in ops_delivery_queue for this assignment today or free invoices in the general queue
            let matches = db.prepare(`
                SELECT * FROM ops_delivery_queue 
                WHERE documento_numero LIKE ? AND (asignacion_id = ? OR asignacion_id IS NULL) AND entregado = 0 AND tipo_documento <> 'recoger'
            `).all(`%${queryDigits}`, tempData.assignmentId) as any[];

            if (matches.length === 0) {
              // Document not found - perform automatic sync and retry
              await performAutoSyncSafe();
              matches = db.prepare(`
                  SELECT * FROM ops_delivery_queue 
                  WHERE documento_numero LIKE ? AND (asignacion_id = ? OR asignacion_id IS NULL) AND entregado = 0 AND tipo_documento <> 'recoger'
              `).all(`%${queryDigits}`, tempData.assignmentId) as any[];
            }

            if (matches.length === 0) {
              const keyboardButtons: any[][] = [
                [{ text: "👥 Seleccionar Cliente de Lista" }],
                [{ text: "📄 Seleccionar Documento de Lista" }],
                [{ text: "Cancelar ❌" }]
              ];

              const dynamicSearchKeyboard = {
                keyboard: keyboardButtons,
                resize_keyboard: true,
                one_time_keyboard: true
              };

              await sendTelegramMessage(
                botToken, 
                chatId, 
                `❌ No se encontró ningún ${tempData.searchType} activo terminado en <b>"${queryDigits}"</b> asignado a tu camión o libre hoy.\n\nPor favor, selecciona una opción del menú o escribe de nuevo los dígitos finales:`, 
                dynamicSearchKeyboard
              );
              return NextResponse.json({ ok: true });
            }

            if (matches.length > 1) {
              let multipleMsg = "⚠️ <b>Se encontraron múltiples coincidencias:</b>\n\n";
              for (const match of matches) {
                multipleMsg += `• <code>${match.documento_numero}</code> - ${match.cliente_nombre}\n`;
              }
              multipleMsg += "\nPor favor ingresa el número completo para desempatar:";
              await sendTelegramMessage(botToken, chatId, multipleMsg, searchQueryKeyboard);
              return NextResponse.json({ ok: true });
            }

            // Exactly one match
            const match = matches[0];
            tempData.docId = match.id;
            tempData.docNum = match.documento_numero;
            tempData.cliente = match.cliente_nombre;
            tempData.creadoPor = match.creado_por;

            // Auto-assign in caliente if from the general queue
            if (match.asignacion_id === null) {
              db.prepare(`
                UPDATE ops_delivery_queue 
                SET asignacion_id = ?, estado = 'en_ruta', canal_registro = 'telegram', gestionado_por = 'Chofer (Auto-Asignado)' 
                WHERE id = ?
              `).run(tempData.assignmentId, match.id);
            }

            // Set Lock
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?').run(new Date().toISOString(), chatIdStr, match.id);

            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_confirm_document', tempData);

            await sendTelegramMessage(
              botToken,
              chatId,
              formatDocumentDetailMessage(match),
              confirmKeyboard
            );
          } catch (e: any) {
            console.error("Error searching document in bot", e);
            await sendTelegramMessage(botToken, chatId, "❌ Error al buscar en la base de datos.", deliveryMenuKeyboard);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
          }
          break;
        }

        case 'delivery_search_client_select': {
          if (text.includes("Cancelar") || text.includes("Volver") || text.includes("❌")) {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_query', tempData);
            await sendTelegramMessage(botToken, chatId, "✍️ Por favor escribe los <b>dígitos finales</b> del número del documento o factura:", searchQueryKeyboard);
            return NextResponse.json({ ok: true });
          }

          try {
            const db = await getDb();
            const rawText = text.trim();
            
            // Decodificar códigos de cliente/dirección de la etiqueta del botón
            let matchedClientId: string | null = null;
            let matchedDireccionId: string | null = null;
            let displayClientName = rawText;

            const codePart = rawText.split('|')[0] || '';
            const codes = codePart.split('/').map((c: string) => c.trim());

            if (codes.length >= 2) {
              matchedClientId = codes[0];
              matchedDireccionId = codes[1];
            }

            let matches: any[] = [];

            if (matchedClientId) {
              const allMatches = db.prepare(`
                SELECT * FROM ops_delivery_queue 
                WHERE asignacion_id = ? AND cliente_id = ? AND estado IN ('pendiente', 'en_ruta') AND entregado = 0 AND tipo_documento <> 'recoger'
              `).all(tempData.assignmentId, matchedClientId) as any[];

              matches = allMatches.filter(m => {
                if (!matchedDireccionId) return true;
                const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(m.documento_numero) as any;
                const docDirId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();
                return docDirId === matchedDireccionId;
              });

              // Extraer parte legible para mostrar en logs o mensajes
              const namePart = rawText.split('|')[1] || rawText;
              displayClientName = namePart.split('[')[0].trim();
            } else {
              const { clientName, direccionId } = parseDestinationLabel(rawText);
              displayClientName = clientName;

              const allMatches = db.prepare(`
                SELECT * FROM ops_delivery_queue 
                WHERE asignacion_id = ? AND (cliente_nombre LIKE ? OR cliente_nombre = ?) AND estado IN ('pendiente', 'en_ruta') AND entregado = 0 AND tipo_documento <> 'recoger'
              `).all(tempData.assignmentId, `%${clientName}%`, clientName) as any[];

              matches = allMatches.filter(m => {
                if (!direccionId) return true;
                const invoiceHeader = db.prepare('SELECT DIREC_EMBARQUE FROM core_erp_invoice_headers WHERE FACTURA = ?').get(m.documento_numero) as any;
                const docDirId = (invoiceHeader?.DIREC_EMBARQUE || 'ND').trim();
                return docDirId === direccionId;
              });
            }

            if (matches.length === 0) {
              await sendTelegramMessage(botToken, chatId, `❌ No se encontró ningún documento activo asignado para el cliente <b>"${displayClientName}"</b>.\n\nPor favor, escribe de nuevo los dígitos finales del documento:`, searchQueryKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_query', tempData);
              return NextResponse.json({ ok: true });
            }

            if (matches.length === 1) {
              const match = matches[0];
              tempData.docId = match.id;
              tempData.docNum = match.documento_numero;
              tempData.docType = match.tipo_documento;
              tempData.cliente = match.cliente_nombre;
              tempData.creadoPor = match.creado_por;
              
              // Set Lock
              db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?').run(new Date().toISOString(), chatIdStr, match.id);

              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_confirm_document', tempData);

              await sendTelegramMessage(
                botToken,
                chatId,
                formatDocumentDetailMessage(match),
                confirmKeyboard
              );
            } else {
              // Multiple documents for the same client
              const rows = matches.map(m => [{ text: `${m.tipo_documento === 'pedido' ? 'Pedido' : 'Factura'} #${m.documento_numero}` }]);
              rows.push([{ text: "Cancelar ❌" }]);
              
              const docsKeyboard = {
                keyboard: rows,
                resize_keyboard: true,
                one_time_keyboard: true
              };

              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_doc_select', tempData);
              await sendTelegramMessage(botToken, chatId, `👉 El cliente <b>${displayClientName}</b> tiene varios documentos pendientes. Selecciona el que deseas reportar:`, docsKeyboard);
            }
          } catch (e: any) {
            console.error("Error in delivery_search_client_select", e);
            await sendTelegramMessage(botToken, chatId, "❌ Error al cargar documentos de este cliente.", searchQueryKeyboard);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_query', tempData);
          }
          break;
        }

        case 'delivery_search_doc_select': {
          if (text.includes("Cancelar") || text.includes("Volver") || text.includes("❌")) {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_query', tempData);
            await sendTelegramMessage(botToken, chatId, "✍️ Por favor escribe los <b>dígitos finales</b> del número del documento o factura:", searchQueryKeyboard);
            return NextResponse.json({ ok: true });
          }

          try {
            const db = await getDb();
            // Extract document number from string like "Factura #4135" or "Pedido #4135"
            const docNumMatch = text.match(/#(\w+)/);
            const docNum = docNumMatch ? docNumMatch[1] : text.replace(/[^\w]/g, '');

            const match = db.prepare(`
              SELECT * FROM ops_delivery_queue 
              WHERE asignacion_id = ? AND documento_numero = ? AND entregado = 0
            `).get(tempData.assignmentId, docNum) as any;

            if (!match) {
              await sendTelegramMessage(botToken, chatId, "❌ Documento no encontrado o ya entregado. Escribe los dígitos del documento:", searchQueryKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_query', tempData);
              return NextResponse.json({ ok: true });
            }

            tempData.docId = match.id;
            tempData.docNum = match.documento_numero;
            tempData.docType = match.tipo_documento;
            tempData.cliente = match.cliente_nombre;
            tempData.creadoPor = match.creado_por;

            // Set Lock
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?').run(new Date().toISOString(), chatIdStr, match.id);

            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_confirm_document', tempData);

            await sendTelegramMessage(
              botToken,
              chatId,
              formatDocumentDetailMessage(match),
              confirmKeyboard
            );
          } catch (e: any) {
            console.error("Error in delivery_search_doc_select", e);
            await sendTelegramMessage(botToken, chatId, "❌ Error al cargar documento.", searchQueryKeyboard);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_search_query', tempData);
          }
          break;
        }

        case 'delivery_confirm_document': {
          if (text.includes('Sí') || text.includes('registrar') || text.includes('confirmar')) {
            try {
              const db = await getDb();
              
              if (tempData.docType === 'recoger') {
                tempData.deliveryMode = 'sencillo';
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_simple', tempData);
                const simpleReportKeyboard = {
                  keyboard: [
                    [{ text: "👍 Recogido" }],
                    [{ text: "❌ No se pudo Recoger" }],
                    [{ text: "Cancelar ❌" }]
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await sendTelegramMessage(botToken, chatId, `🚚 <b>¿Cómo resultó la recolecta del documento #${tempData.docNum}?</b>`, simpleReportKeyboard);
                return NextResponse.json({ ok: true });
              }

              // Check settings for delivery mode
              const modeRow = db.prepare('SELECT value FROM ops_delivery_settings WHERE key = \'delivery_mode\'').get() as { value: string } | undefined;
              const mode = modeRow?.value || 'sencillo';
              tempData.deliveryMode = mode;

              if (mode === 'sencillo') {
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_simple', tempData);
                const simpleReportKeyboard = {
                  keyboard: [
                    [{ text: "👍 Entregado Completo" }],
                    [{ text: "⚠️ Entregado Incompleto" }],
                    [{ text: "❌ Rechazado por Cliente" }],
                    [{ text: "Cancelar ❌" }]
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await sendTelegramMessage(botToken, chatId, `🚚 <b>¿Cómo fue entregado el documento #${tempData.docNum}?</b>`, simpleReportKeyboard);
              } else {
                // Modo Avanzado
                // Look up lines in erpInvoiceLines or erpOrderLines based on doc type
                let erpLines = [];
                if (tempData.searchType === 'factura') {
                  erpLines = db.prepare('SELECT LINEA, ARTICULO, DESCRIPCION, CANTIDAD FROM core_erp_invoice_lines WHERE FACTURA = ?').all(tempData.docNum) as any[];
                } else {
                  erpLines = db.prepare('SELECT PEDIDO_LINEA as LINEA, ARTICULO, (SELECT description FROM core_products WHERE id = ARTICULO) as DESCRIPCION, CANTIDAD_PEDIDA as CANTIDAD FROM core_erp_order_lines WHERE PEDIDO = ?').all(tempData.docNum) as any[];
                }

                tempData.erpLines = erpLines;

                if (erpLines.length === 0) {
                  // Fallback to simple if no lines are mapped
                  tempData.deliveryMode = 'sencillo';
                  await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_simple', tempData);
                  await sendTelegramMessage(botToken, chatId, `⚠️ No se encontraron líneas físicas de artículos para este documento. Redirigiendo a **Modo Sencillo**:\n\n👍 A- Entregado Completo\n⚠️ B- Entregado Incompleto\n❌ C- Rechazado por Cliente`);
                  return NextResponse.json({ ok: true });
                }

                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_advanced_lines', tempData);
                let linesMsg = `📦 <b>Artículos en #${tempData.docNum}:</b>\n\n`;
                for (const line of erpLines) {
                  linesMsg += `<b>Línea ${line.LINEA}</b>: ${line.DESCRIPCION || line.ARTICULO} (${line.CANTIDAD} und)\n`;
                }
                linesMsg += `\n✍️ Selecciona las líneas que tienen <b>incidencias/devoluciones</b>, o presiona <b>Ninguno</b> si todo se entregó al 100% o <b>Rechazo Total</b> si no se aceptó nada:`;
                
                const advancedLinesKeyboardRows: any[][] = [];
                advancedLinesKeyboardRows.push([{ text: "Ninguno (100% Entregado) ✅" }]);
                advancedLinesKeyboardRows.push([{ text: "Rechazo Total del Documento ❌" }]);

                let lineRow: any[] = [];
                for (const line of erpLines) {
                  lineRow.push({ text: `Línea ${line.LINEA}` });
                  if (lineRow.length === 3) {
                    advancedLinesKeyboardRows.push(lineRow);
                    lineRow = [];
                  }
                }
                if (lineRow.length > 0) {
                  advancedLinesKeyboardRows.push(lineRow);
                }
                advancedLinesKeyboardRows.push([{ text: "Cancelar ❌" }]);

                const advancedLinesKeyboard = {
                  keyboard: advancedLinesKeyboardRows,
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await sendTelegramMessage(botToken, chatId, linesMsg, advancedLinesKeyboard);
              }
            } catch (err: any) {
              console.error("Error setting up delivery report flow", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al inicializar el reporte de entregas.", deliveryMenuKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            }
          } else if (text.includes('No') || text.includes('Volver') || text.includes('Cancelar') || text.includes('❌')) {
            // Cancel confirmation, unlock document
            const db = await getDb();
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            await sendTelegramMessage(botToken, chatId, "🔙 Reporte cancelado.", deliveryMenuKeyboard);
          } else {
            // Invalid entry, trigger AI help
            const db = await getDb();
            await sendFlowFallbackMessage(db, botToken, chatId, chatIdStr, state, linkage, text);
          }
          break;
        }

        case 'delivery_await_evidence_photo': {
          if (text === 'Volver al Menú Principal 🔙' || text === '/cancelar' || text.toLowerCase() === 'cancelar') {
            const db = await getDb();
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            await sendTelegramMessage(botToken, chatId, "🔙 Cancelado. Volviendo al menú de entregas.", deliveryMenuKeyboard);
            return NextResponse.json({ ok: true });
          }

          let hasPhoto = false;
          let photoFilename = null;

          if (message.photo && message.photo.length > 0) {
            try {
              const photo = message.photo[message.photo.length - 1];
              await sendTelegramMessage(botToken, chatId, "⏳ Descargando foto de evidencia...");
              photoFilename = await downloadTelegramFile(botToken, photo.file_id);
              hasPhoto = true;
            } catch (err: any) {
              console.error("Error downloading telegram photo", err);
              await sendTelegramMessage(botToken, chatId, "⚠️ Error al descargar la foto. Intenta enviarla de nuevo:");
              return NextResponse.json({ ok: true });
            }
          }

          const db = await getDb();
          const reqEvidencePhotoRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_require_evidence_photo'").get() as { value: string } | undefined;
          const reqEvidencePhoto = reqEvidencePhotoRow?.value || 'disabled';
          const isMandatory = reqEvidencePhoto === 'mandatory';

          if (!hasPhoto && text === 'Omitir foto de evidencia ⏭️') {
            if (isMandatory) {
              await sendTelegramMessage(botToken, chatId, "⚠️ La foto de evidencia es obligatoria. Por favor envía la foto:", cancelOnlyKeyboard);
              return NextResponse.json({ ok: true });
            }
            tempData.fotoEvidencia = null; // Omitted
          } else if (!hasPhoto) {
            const optionalKeyboard = {
              keyboard: [
                [{ text: "Omitir foto de evidencia ⏭️" }],
                [{ text: "Volver al Menú Principal 🔙" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };
            const mandatoryKeyboard = {
              keyboard: [
                [{ text: "Volver al Menú Principal 🔙" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };

            await sendTelegramMessage(
              botToken,
              chatId,
              isMandatory
                ? "⚠️ Entrada inválida. Por favor, toma y envía una foto de evidencia:"
                : "⚠️ Entrada inválida. Envía una foto o presiona 'Omitir foto de evidencia ⏭️':",
              isMandatory ? mandatoryKeyboard : optionalKeyboard
            );
            return NextResponse.json({ ok: true });
          } else {
            tempData.fotoEvidencia = photoFilename;
          }

          await runNextFinalizeStep(db, chatIdStr, chatId, botToken, linkage, tempData);
          break;
        }

        case 'delivery_await_invoice_photo': {
          if (text === 'Volver al Menú Principal 🔙' || text === '/cancelar' || text.toLowerCase() === 'cancelar') {
            const db = await getDb();
            db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
            const isCollect = tempData.docType === 'recoger';
            const flowName = isCollect ? 'collects_menu' : 'delivery_menu';
            const stepName = isCollect ? 'collects_menu_home' : 'delivery_menu_home';
            await saveTelegramState(chatIdStr, flowName, stepName, tempData);
            const msg = isCollect ? "🔙 Cancelado. Volviendo al menú de recolectas." : "🔙 Cancelado. Volviendo al menú de entregas.";
            const keyboard = isCollect ? getCollectsMenuKeyboard(db, tempData.assignmentId) : deliveryMenuKeyboard;
            await sendTelegramMessage(botToken, chatId, msg, keyboard);
            return NextResponse.json({ ok: true });
          }

          // Check if driver clicked one of the manual invoice selector buttons in batch mode
          if (tempData.isBatchCompletion && tempData.batchDocIds && tempData.batchDocNums) {
            const db = await getDb();
            const matchedNumIndex = tempData.batchDocNums.findIndex((num: string) => text.includes(`#${num}`));
            if (matchedNumIndex !== -1) {
              const selectedDocId = tempData.batchDocIds[matchedNumIndex];
              const selectedDocNum = tempData.batchDocNums[matchedNumIndex];
              
              tempData.activeInvoicePhotoDocId = selectedDocId;
              await sendTelegramMessage(botToken, chatId, `🔄 Cambiado a factura <b>#${selectedDocNum}</b>. Por favor, envía su foto:`);
              await runNextFinalizeStep(db, chatIdStr, chatId, botToken, linkage, tempData);
              return NextResponse.json({ ok: true });
            }
          }

          let hasPhoto = false;
          let photoFilename = null;

          if (message.photo && message.photo.length > 0) {
            try {
              const photo = message.photo[message.photo.length - 1];
              await sendTelegramMessage(botToken, chatId, "⏳ Descargando foto de factura firmada...");
              photoFilename = await downloadTelegramFile(botToken, photo.file_id);
              hasPhoto = true;
            } catch (err: any) {
              console.error("Error downloading telegram photo", err);
              await sendTelegramMessage(botToken, chatId, "⚠️ Error al descargar la foto. Intenta enviarla de nuevo:");
              return NextResponse.json({ ok: true });
            }
          }

          const db = await getDb();
          const reqInvoicePhotoRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_require_invoice_photo'").get() as { value: string } | undefined;
          const reqInvoicePhoto = reqInvoicePhotoRow?.value || 'disabled';
          const isMandatory = reqInvoicePhoto === 'mandatory';

          if (tempData.isBatchCompletion && tempData.batchDocIds) {
            tempData.batchInvoicePhotos = tempData.batchInvoicePhotos || {};
            const activeDocId = tempData.activeInvoicePhotoDocId;

            if (!activeDocId) {
              const keyboard = tempData.docType === 'recoger' ? getCollectsMenuKeyboard(db, tempData.assignmentId) : getDeliveryMenuKeyboard(db, tempData.assignmentId);
              await sendTelegramMessage(botToken, chatId, "⚠️ Ocurrió un error. Por favor selecciona una factura:", keyboard);
              return NextResponse.json({ ok: true });
            }

            const activeIndex = tempData.batchDocIds.indexOf(activeDocId);
            const activeDocNum = tempData.batchDocNums ? tempData.batchDocNums[activeIndex] : String(activeDocId);

            if (!hasPhoto && text === 'Omitir foto de factura firmada ⏭️') {
              if (isMandatory) {
                await sendTelegramMessage(botToken, chatId, `⚠️ La foto de la factura firmada es obligatoria para la factura #${activeDocNum}. Por favor envía la foto:`);
                return NextResponse.json({ ok: true });
              }
              tempData.batchInvoicePhotos[activeDocId] = null; // Omitted
            } else if (!hasPhoto) {
              const buttonsRow: { text: string }[] = [];
              tempData.batchDocIds.forEach((id: any, idx: number) => {
                const docNum = tempData.batchDocNums ? tempData.batchDocNums[idx] : String(id);
                let label = '';
                if (tempData.batchInvoicePhotos[id] !== undefined) {
                  label = `✅ #${docNum}`;
                } else if (id === tempData.activeInvoicePhotoDocId) {
                  label = `📸 #${docNum} (Actual)`;
                } else {
                  label = `⏳ #${docNum}`;
                }
                buttonsRow.push({ text: label });
              });

              const keyboardRows: any[][] = [];
              for (let i = 0; i < buttonsRow.length; i += 2) {
                keyboardRows.push(buttonsRow.slice(i, i + 2));
              }

              const controlButtons: { text: string }[] = [];
              if (!isMandatory) {
                controlButtons.push({ text: "Omitir foto de factura firmada ⏭️" });
              }
              controlButtons.push({ text: "Volver al Menú Principal 🔙" });
              keyboardRows.push(controlButtons);

              await sendTelegramMessage(
                botToken,
                chatId,
                isMandatory
                  ? `⚠️ Entrada inválida. Por favor, toma y envía una foto de la factura #${activeDocNum}:`
                  : `⚠️ Entrada inválida. Envía una foto o presiona 'Omitir foto de factura firmada ⏭️':`,
                {
                  keyboard: keyboardRows,
                  resize_keyboard: true,
                  one_time_keyboard: true
                }
              );
              return NextResponse.json({ ok: true });
            } else {
              tempData.batchInvoicePhotos[activeDocId] = photoFilename;
            }

            delete tempData.activeInvoicePhotoDocId;
          } else {
            if (!hasPhoto && text === 'Omitir foto de factura firmada ⏭️') {
              if (isMandatory) {
                await sendTelegramMessage(botToken, chatId, "⚠️ La foto de la factura firmada es obligatoria. Por favor envía la foto:", cancelOnlyKeyboard);
                return NextResponse.json({ ok: true });
              }
              tempData.fotoFactura = null; // Omitted
            } else if (!hasPhoto) {
              const optionalKeyboard = {
                keyboard: [
                  [{ text: "Omitir foto de factura firmada ⏭️" }],
                  [{ text: "Volver al Menú Principal 🔙" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              };
              const mandatoryKeyboard = {
                keyboard: [
                  [{ text: "Volver al Menú Principal 🔙" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              };

              await sendTelegramMessage(
                botToken,
                chatId,
                isMandatory
                  ? "⚠️ Entrada inválida. Por favor, toma y envía una foto de la factura firmada:"
                  : "⚠️ Entrada inválida. Envía una foto o presiona 'Omitir foto de factura firmada ⏭️':",
                isMandatory ? mandatoryKeyboard : optionalKeyboard
              );
              return NextResponse.json({ ok: true });
            } else {
              tempData.fotoFactura = photoFilename;
            }
          }

          await runNextFinalizeStep(db, chatIdStr, chatId, botToken, linkage, tempData);
          break;
        }

        case 'delivery_report_simple': {
          if (tempData.docType === 'recoger') {
            if (text.includes("Recogido")) {
              try {
                const db = await getDb();
                await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
                  estado: 'completo',
                  flowType: 'simple'
                });
              } catch (err) {
                console.error("Error updating simple pickup status:", err);
                await sendTelegramMessage(botToken, chatId, "❌ Error al guardar en base de datos. Intenta de nuevo.", deliveryMenuKeyboard);
              }
            } else if (text.includes("No se pudo Recoger") || text.includes("No pudo") || text.includes("rechazar") || text.includes("Rechazado")) {
              tempData.reportState = 'rechazado';
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_reason', tempData);
              await sendTelegramMessage(botToken, chatId, "✍️ Por favor escribe el <b>motivo o comentario</b> por el cual no se pudo realizar la recolecta:", cancelOnlyKeyboard);
            } else {
              const simpleReportKeyboard = {
                keyboard: [
                  [{ text: "👍 Recogido" }],
                  [{ text: "❌ No se pudo Recoger" }],
                  [{ text: "Cancelar ❌" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              };
              await sendTelegramMessage(botToken, chatId, `⚠️ Opción inválida. Por favor, selecciona una de las opciones del menú de botones:\n\n👍 Recogido\n❌ No se pudo Recoger`, simpleReportKeyboard);
            }
            break;
          }

          if (text.includes("Completo")) {
            // Complete Delivery
            try {
              const db = await getDb();
              await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
                estado: 'completo',
                flowType: 'simple'
              });
            } catch (err) {
              console.error("Error updating simple complete status:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al guardar en base de datos. Intenta de nuevo.", deliveryMenuKeyboard);
            }
          } else if (text.includes("Incompleto")) {
            tempData.reportState = 'incompleto';
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_reason', tempData);
            await sendTelegramMessage(botToken, chatId, "✍️ Por favor escribe el <b>motivo o comentario</b> por el cual se entrega de forma incompleta:", cancelOnlyKeyboard);
          } else if (text.includes("Rechazado")) {
            tempData.reportState = 'rechazado';
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_reason', tempData);
            await sendTelegramMessage(botToken, chatId, "✍️ Por favor escribe el <b>motivo del rechazo</b> por parte del cliente:", cancelOnlyKeyboard);
          } else {
            const simpleReportKeyboard = {
              keyboard: [
                [{ text: "👍 Entregado Completo" }],
                [{ text: "⚠️ Entregado Incompleto" }],
                [{ text: "❌ Rechazado por Cliente" }],
                [{ text: "Cancelar ❌" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };

            const isDocNumText = text.trim() === String(tempData.docNum) || text.trim() === `#${tempData.docNum}`;
            let errorMsg = `⚠️ <b>Entrada Incorrecta Detectada</b>\n` +
              `Estás reportando el documento <b>#${tempData.docNum}</b>.\n\n` +
              `Por favor, selecciona una de las opciones del menú de botones de abajo:\n` +
              `1️⃣ <b>👍 Entregado Completo</b> - Si se recibió todo al 100%.\n` +
              `2️⃣ <b>⚠️ Entregado Incompleto</b> - Si hay mermas o daños.\n` +
              `3️⃣ <b>❌ Rechazado por Cliente</b> - Si no se recibió nada.\n\n` +
              `👉 <i>Usa los botones del chat para responder.</i>`;

            if (isDocNumText) {
              errorMsg = `📢 <b>El documento #${tempData.docNum} ya está seleccionado</b>\n` +
                `No necesitas buscarlo ni digitarlo de nuevo. Para registrar su entrega, indícanos cómo resultó seleccionando una de las siguientes opciones:\n` +
                `1️⃣ <b>👍 Entregado Completo</b>\n` +
                `2️⃣ <b>⚠️ Entregado Incompleto</b>\n` +
                `3️⃣ <b>❌ Rechazado por Cliente</b>\n\n` +
                `👉 <i>Usa los botones de abajo para responder.</i>`;
            }

            await sendTelegramMessage(botToken, chatId, errorMsg, simpleReportKeyboard);
          }
          break;
        }

        case 'delivery_report_reason': {
          tempData.reason = text.trim();
          
          try {
            const db = await getDb();
            const releaseEnabledRow = db.prepare('SELECT value FROM ops_delivery_settings WHERE key = \'release_codes_enabled\'').get() as { value: string } | undefined;
            const releaseEnabled = releaseEnabledRow?.value === 'true' && tempData.docType !== 'recoger';

            if (releaseEnabled) {
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_release_code', tempData);
              await sendTelegramMessage(botToken, chatId, "🔑 <b>Código de Liberación Requerido</b>\nPor favor, solicita el código de validación de 6 dígitos al coordinator de despacho e ingrésalo aquí:", cancelOnlyKeyboard);
            } else {
              // Perform update directly
              await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
                estado: tempData.reportState,
                comentario: tempData.reason,
                flowType: 'simple'
              });
            }
          } catch (err: any) {
            console.error("Error processing delivery simple reason:", err);
            await sendTelegramMessage(botToken, chatId, "❌ Error al registrar la entrega. Reintentando...", deliveryMenuKeyboard);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
          }
          break;
        }



        case 'delivery_report_release_code': {
          const typedCode = text.trim();
          try {
            const db = await getDb();
            // Validate code
            const codeRecord = db.prepare('SELECT * FROM ops_delivery_release_codes WHERE delivery_order_id = ? AND codigo = ? AND usado = 0').get(tempData.docId, typedCode) as any;

            if (!codeRecord && typedCode.toLowerCase() !== 'override') {
              await sendTelegramMessage(botToken, chatId, "❌ <b>Código inválido.</b> Solicita la clave correcta al coordinador o escribe de nuevo:", cancelOnlyKeyboard);
              return NextResponse.json({ ok: true });
            }

            // Flag code as used if verified
            if (codeRecord) {
              db.prepare('UPDATE ops_delivery_release_codes SET usado = 1 WHERE id = ?').run(codeRecord.id);
            }

            // Process update
            await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
              estado: tempData.reportState,
              comentario: tempData.reason,
              releaseCodeId: codeRecord?.id,
              flowType: 'simple'
            });
          } catch (err: any) {
            console.error("Error validating release code", err);
            await sendTelegramMessage(botToken, chatId, "❌ Error de conexión al validar código.", deliveryMenuKeyboard);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
          }
          break;
        }

        case 'delivery_report_advanced_lines': {
          if (text.toLowerCase().includes('ninguno') || text.toLowerCase() === 'ninguno' || text === '0') {
            // No incidences, delivered 100% complete
            try {
              const db = await getDb();
              await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
                estado: 'completo',
                flowType: 'advanced'
              });
            } catch (err) {
              console.error("Error saving advanced complete status", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al guardar en base de datos.", deliveryMenuKeyboard);
            }
          } else if (text.includes("Rechazo Total")) {
            tempData.reportState = 'rechazado';
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_reason', tempData);
            await sendTelegramMessage(botToken, chatId, "✍️ Por favor escribe el <b>motivo del rechazo</b> por parte del cliente:", cancelOnlyKeyboard);
          } else {
            // Clean dynamic text from buttons (eg: "Línea 1, Línea 3" -> "1, 3")
            const cleanText = text.replace(/Línea\s+/gi, '');
            // Driver typed specific lines (eg: 1,3)
            const lineNums = cleanText.split(',').map((l: string) => parseInt(l.trim(), 10)).filter((l: number) => !isNaN(l));
            if (lineNums.length === 0) {
              await sendTelegramMessage(botToken, chatId, "⚠️ Líneas inválidas. Por favor, escribe los números de línea con incidencias separados por comas (ejemplo: <code>1,3</code>):", cancelOnlyKeyboard);
              return NextResponse.json({ ok: true });
            }

            tempData.linesToReport = lineNums;
            tempData.currentReportIndex = 0;
            tempData.reportedLinesData = [];

            // Move to first line quant questioning
            const firstLineId = lineNums[0];
            const matchingLine = tempData.erpLines.find((l: any) => l.LINEA === firstLineId);

            if (!matchingLine) {
              await sendTelegramMessage(botToken, chatId, `⚠️ La línea ${firstLineId} no se encuentra en el documento. Escribe líneas correctas:`, cancelOnlyKeyboard);
              return NextResponse.json({ ok: true });
            }

            tempData.currentReportLine = matchingLine;
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_advanced_quantities', tempData);

            const maxQty = parseFloat(matchingLine.CANTIDAD);
            const qtyKeyboardRows = [];
            if (maxQty > 0 && maxQty <= 10 && Number.isInteger(maxQty)) {
              const row = [];
              for (let q = 0; q <= maxQty; q++) {
                row.push({ text: String(q) });
              }
              const chunkedRows = [];
              for (let i = 0; i < row.length; i += 5) {
                chunkedRows.push(row.slice(i, i + 5));
              }
              qtyKeyboardRows.push(...chunkedRows);
            } else {
              qtyKeyboardRows.push([
                { text: "0" },
                { text: String(maxQty) }
              ]);
            }
            qtyKeyboardRows.push([{ text: "Cancelar ❌" }]);
            const qtyKeyboard = {
              keyboard: qtyKeyboardRows,
              resize_keyboard: true,
              one_time_keyboard: true
            };

            await sendTelegramMessage(
              botToken,
              chatId,
              `📦 <b>Línea ${matchingLine.LINEA}: ${matchingLine.DESCRIPCION || matchingLine.ARTICULO}</b>\n` +
              `Cantidad solicitada originalmente: <b>${matchingLine.CANTIDAD} und</b>.\n\n` +
              `✍️ ¿Cuántas unidades se entregaron <b>físicamente con éxito</b> a satisfacción del cliente? (Ingresa solo el número o presiona un botón):`,
              qtyKeyboard
            );
          }
          break;
        }

        case 'delivery_report_advanced_quantities': {
          const deliveredQty = parseFloat(text.replace(',', '.'));
          const maxQty = parseFloat(tempData.currentReportLine.CANTIDAD);

          if (isNaN(deliveredQty) || deliveredQty < 0 || deliveredQty > maxQty) {
            const qtyKeyboardRows = [];
            if (maxQty > 0 && maxQty <= 10 && Number.isInteger(maxQty)) {
              const row = [];
              for (let q = 0; q <= maxQty; q++) {
                row.push({ text: String(q) });
              }
              const chunkedRows = [];
              for (let i = 0; i < row.length; i += 5) {
                chunkedRows.push(row.slice(i, i + 5));
              }
              qtyKeyboardRows.push(...chunkedRows);
            } else {
              qtyKeyboardRows.push([
                { text: "0" },
                { text: String(maxQty) }
              ]);
            }
            qtyKeyboardRows.push([{ text: "Cancelar ❌" }]);
            const qtyKeyboard = {
              keyboard: qtyKeyboardRows,
              resize_keyboard: true,
              one_time_keyboard: true
            };

            await sendTelegramMessage(
              botToken,
              chatId,
              `⚠️ <b>CANTIDAD NO VÁLIDA DETECTADA</b>\n` +
              `Estás reportando la línea <b>${tempData.currentReportLine.LINEA} (${tempData.currentReportLine.DESCRIPCION || tempData.currentReportLine.ARTICULO})</b>.\n\n` +
              `Por favor ingresa únicamente una cantidad numérica entre <b>0 y ${maxQty}</b> (o presiona uno de los botones grandes de abajo):`,
              qtyKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          const missingQty = maxQty - deliveredQty;

          // Save reported line data
          tempData.reportedLinesData.push({
            codigo: tempData.currentReportLine.ARTICULO,
            desc: tempData.currentReportLine.DESCRIPCION || '',
            pedida: maxQty,
            entregada: deliveredQty,
            faltante: missingQty
          });

          // Check if there are more lines to report
          const nextIndex = tempData.currentReportIndex + 1;
          if (nextIndex < tempData.linesToReport.length) {
            tempData.currentReportIndex = nextIndex;
            const nextLineId = tempData.linesToReport[nextIndex];
            const matchingLine = tempData.erpLines.find((l: any) => l.LINEA === nextLineId);

            if (!matchingLine) {
              // Skip if line somehow invalid
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
              await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error en la coherencia de las líneas del documento.", deliveryMenuKeyboard);
              return NextResponse.json({ ok: true });
            }

            tempData.currentReportLine = matchingLine;
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_advanced_quantities', tempData);

            const maxQty = parseFloat(matchingLine.CANTIDAD);
            const qtyKeyboardRows = [];
            if (maxQty > 0 && maxQty <= 10 && Number.isInteger(maxQty)) {
              const row = [];
              for (let q = 0; q <= maxQty; q++) {
                row.push({ text: String(q) });
              }
              const chunkedRows = [];
              for (let i = 0; i < row.length; i += 5) {
                chunkedRows.push(row.slice(i, i + 5));
              }
              qtyKeyboardRows.push(...chunkedRows);
            } else {
              qtyKeyboardRows.push([
                { text: "0" },
                { text: String(maxQty) }
              ]);
            }
            qtyKeyboardRows.push([{ text: "Cancelar ❌" }]);
            const qtyKeyboard = {
              keyboard: qtyKeyboardRows,
              resize_keyboard: true,
              one_time_keyboard: true
            };

            await sendTelegramMessage(
              botToken,
              chatId,
              `📦 <b>Línea ${matchingLine.LINEA}: ${matchingLine.DESCRIPCION || matchingLine.ARTICULO}</b>\n` +
              `Cantidad solicitada originalmente: <b>${matchingLine.CANTIDAD} und</b>.\n\n` +
              `✍️ ¿Cuántas unidades se entregaron <b>físicamente con éxito</b>? (Ingresa solo el número o presiona un botón):`,
              qtyKeyboard
            );
          } else {
            // All lines reported! Trigger status update with mermas
            try {
              const db = await getDb();
              
              // Totalize if everything was actually delivered 0 (fully incomplete/rejected)
              let totalFaltantes = 0;
              for (const line of tempData.reportedLinesData) {
                totalFaltantes += line.faltante;
              }

              const docState = totalFaltantes > 0 ? 'incompleto' : 'completo';
              tempData.reportState = docState;
              tempData.reason = `Mermas registradas por chofer en Telegram. Líneas con incidencias: [${tempData.linesToReport.join(', ')}]`;

              const releaseEnabledRow = db.prepare('SELECT value FROM ops_delivery_settings WHERE key = \'release_codes_enabled\'').get() as { value: string } | undefined;
              const releaseEnabled = releaseEnabledRow?.value === 'true';

              if (releaseEnabled && docState === 'incompleto') {
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_release_code', tempData);
                await sendTelegramMessage(botToken, chatId, "🔑 <b>Código de Liberación Requerido</b>\nPor favor, solicita el código de validación de 6 dígitos al coordinador de despacho e ingrésalo aquí:", cancelOnlyKeyboard);
              } else {
                await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
                  estado: docState,
                  comentario: tempData.reason,
                  lines: tempData.reportedLinesData,
                  flowType: 'advanced'
                });
              }
            } catch (err: any) {
              console.error("Error saving advanced items quantities:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al actualizar mermas en la base de datos.", deliveryMenuKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            }
          }
          break;
        }

        case 'delivery_location_cadenamiento': {
          if (text.includes("Cancelar") || text.includes("❌")) {
            const db = await getDb();
            // Clear transition temp values
            delete tempData.nextSameLocDocId;
            delete tempData.nextSameLocDocNum;
            delete tempData.nextSameLocDocType;
            delete tempData.currentLocName;

            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            await sendTelegramMessage(botToken, chatId, "🔙 Saliste del reporte. Volviendo al menú principal.", deliveryMenuKeyboard);
            return NextResponse.json({ ok: true });
          }

          if (text.includes("Reportar después") || text.includes("después") || text.includes("⏭️")) {
            const db = await getDb();
            // Clear transition temp values
            delete tempData.nextSameLocDocId;
            delete tempData.nextSameLocDocNum;
            delete tempData.nextSameLocDocType;
            delete tempData.currentLocName;

            await transitionToNextDestinationStep(db, chatIdStr, chatId, botToken, linkage, tempData, "Volviendo al ruteo libre.");
            return NextResponse.json({ ok: true });
          }

          if (text.includes("Sí") || text.includes("reportar")) {
            try {
              const db = await getDb();
              const nextDocId = tempData.nextSameLocDocId;
              const nextDocNum = tempData.nextSameLocDocNum;
              const nextDocType = tempData.nextSameLocDocType;

              // Clear transition values
              delete tempData.nextSameLocDocId;
              delete tempData.nextSameLocDocNum;
              delete tempData.nextSameLocDocType;
              delete tempData.currentLocName;

              tempData.docId = nextDocId;
              tempData.docNum = nextDocNum;
              tempData.docType = nextDocType;

              // Lock document in database
              db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = ?, telegram_lock_by = ? WHERE id = ?')
                .run(new Date().toISOString(), chatIdStr, nextDocId);

              // Resolve delivery mode
              const modeRow = db.prepare('SELECT value FROM ops_delivery_settings WHERE key = \'delivery_mode\'').get() as { value: string } | undefined;
              const mode = modeRow?.value || 'sencillo';
              tempData.deliveryMode = mode;

              if (mode === 'sencillo') {
                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_simple', tempData);
                const simpleReportKeyboard = {
                  keyboard: [
                    [{ text: "👍 Entregado Completo" }],
                    [{ text: "⚠️ Entregado Incompleto" }],
                    [{ text: "❌ Rechazado por Cliente" }],
                    [{ text: "Cancelar ❌" }]
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await sendTelegramMessage(botToken, chatId, `🚚 <b>¿Cómo fue entregado el documento #${tempData.docNum}?</b>`, simpleReportKeyboard);
              } else {
                // Modo Avanzado
                let erpLines = [];
                if (tempData.searchType === 'factura') {
                  erpLines = db.prepare('SELECT LINEA, ARTICULO, DESCRIPCION, CANTIDAD FROM core_erp_invoice_lines WHERE FACTURA = ?').all(tempData.docNum) as any[];
                } else {
                  erpLines = db.prepare('SELECT PEDIDO_LINEA as LINEA, ARTICULO, (SELECT description FROM core_products WHERE id = ARTICULO) as DESCRIPCION, CANTIDAD_PEDIDA as CANTIDAD FROM core_erp_order_lines WHERE PEDIDO = ?').all(tempData.docNum) as any[];
                }

                tempData.erpLines = erpLines;

                if (erpLines.length === 0) {
                  tempData.deliveryMode = 'sencillo';
                  await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_simple', tempData);
                  await sendTelegramMessage(botToken, chatId, `⚠️ No se encontraron líneas físicas de artículos. Redirigiendo a **Modo Sencillo**:\n\n👍 A- Entregado Completo\n⚠️ B- Entregado Incompleto\n❌ C- Rechazado por Cliente`);
                  return NextResponse.json({ ok: true });
                }

                await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_advanced_lines', tempData);
                let linesMsg = `📦 <b>Artículos en #${tempData.docNum}:</b>\n\n`;
                for (const line of erpLines) {
                  linesMsg += `<b>Línea ${line.LINEA}</b>: ${line.DESCRIPCION || line.ARTICULO} (${line.CANTIDAD} und)\n`;
                }
                linesMsg += `\n✍️ Selecciona las líneas que tienen <b>incidencias/devoluciones</b>, o presiona <b>Ninguno</b> si todo se entregó al 100% o <b>Rechazo Total</b> si no se aceptó nada:`;
                
                const advancedLinesKeyboardRows: any[][] = [];
                advancedLinesKeyboardRows.push([{ text: "Ninguno (100% Entregado) ✅" }]);
                advancedLinesKeyboardRows.push([{ text: "Rechazo Total del Documento ❌" }]);

                let lineRow: any[] = [];
                for (const line of erpLines) {
                  lineRow.push({ text: `Línea ${line.LINEA}` });
                  if (lineRow.length === 3) {
                    advancedLinesKeyboardRows.push(lineRow);
                    lineRow = [];
                  }
                }
                if (lineRow.length > 0) {
                  advancedLinesKeyboardRows.push(lineRow);
                }
                advancedLinesKeyboardRows.push([{ text: "Cancelar ❌" }]);

                const advancedLinesKeyboard = {
                  keyboard: advancedLinesKeyboardRows,
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                await sendTelegramMessage(botToken, chatId, linesMsg, advancedLinesKeyboard);
              }
            } catch (err: any) {
              console.error("Error transitioning to next same sucursal document:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al cargar el siguiente documento.", deliveryMenuKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            }
          } else {
            await sendTelegramMessage(botToken, chatId, "Por favor elige una opción válida de los botones:", cancelOnlyKeyboard);
          }
          break;
        }

        case 'awaiting_boleta_email_choice': {
          const db = await getDb();
          if (text.includes("Omitir") || text.includes("No enviar") || text.includes("⏭️")) {
            await proceedAfterBoletaEmail(db, chatIdStr, chatId, botToken, linkage, tempData);
            return NextResponse.json({ ok: true });
          }

          if (text.includes("Digitar") || text.includes("Escribir") || text.includes("✍️")) {
            await saveTelegramState(chatIdStr, 'delivery_menu', 'awaiting_client_email_input', tempData);
            await sendTelegramMessage(botToken, chatId, "✍️ Por favor escriba el correo electrónico del cliente para enviarle la boleta:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          if (text.startsWith("📧 Enviar a: ")) {
            const email = text.replace("📧 Enviar a: ", "").trim();
            await sendTelegramMessage(botToken, chatId, `📨 Enviando boleta digital a <b>${email}</b>...`);
            try {
              const { sendBoletaManualEmail } = require('@/modules/operations/lib/actions');
              const res = await sendBoletaManualEmail(tempData.boletaDocId, email);
              if (res.success) {
                await sendTelegramMessage(botToken, chatId, `✅ Boleta enviada con éxito a <b>${email}</b>.`);
              } else {
                await sendTelegramMessage(botToken, chatId, `⚠️ No se pudo enviar el correo: ${res.error || 'error desconocido'}`);
              }
            } catch (err: any) {
              console.error("Error sending boleta from Telegram choice:", err);
              await sendTelegramMessage(botToken, chatId, `❌ Error de servidor al enviar la boleta.`);
            }
            await proceedAfterBoletaEmail(db, chatIdStr, chatId, botToken, linkage, tempData);
            return NextResponse.json({ ok: true });
          }

          await proceedAfterBoletaEmail(db, chatIdStr, chatId, botToken, linkage, tempData);
          break;
        }

        case 'awaiting_client_email_input': {
          const db = await getDb();
          const email = text.trim();
          if (email.includes("Cancelar") || email.includes("❌") || email === '/cancelar') {
            await proceedAfterBoletaEmail(db, chatIdStr, chatId, botToken, linkage, tempData);
            return NextResponse.json({ ok: true });
          }

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Formato de correo electrónico inválido. Por favor, escribe un correo correcto (ej. cliente@empresa.com) o escribe <b>Cancelar</b> para omitir:", cancelOnlyKeyboard);
            return NextResponse.json({ ok: true });
          }

          await sendTelegramMessage(botToken, chatId, `📨 Enviando boleta digital a <b>${email}</b>...`);
          try {
            const { sendBoletaManualEmail, saveClientEmail } = require('@/modules/operations/lib/actions');
            const res = await sendBoletaManualEmail(tempData.boletaDocId, email);
            if (res.success) {
              await saveClientEmail(tempData.boletaClienteId, email);
              await sendTelegramMessage(botToken, chatId, `✅ Boleta enviada con éxito y correo guardado en la libreta del cliente.`);
            } else {
              await sendTelegramMessage(botToken, chatId, `⚠️ No se pudo enviar el correo: ${res.error || 'error desconocido'}`);
            }
          } catch (err: any) {
            console.error("Error sending/saving email from Telegram input:", err);
            await sendTelegramMessage(botToken, chatId, `❌ Error de servidor al enviar la boleta.`);
          }

          await proceedAfterBoletaEmail(db, chatIdStr, chatId, botToken, linkage, tempData);
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // I. MONITOR DE ENTREGAS - REPORTE DE LOTE DE FACTURAS SECUENCIAL
    if (state.currentFlow === 'delivery_batch_sequence') {
      if (text.includes("Salir del Lote") || text === '/cancelar' || text.toLowerCase() === 'cancelar') {
        if (tempData.docId) {
          const db = await getDb();
          db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
        }
        await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
        await sendTelegramMessage(botToken, chatId, "🔙 Saliste del reporte de lote. Volviendo al menú de entregas.", deliveryMenuKeyboard);
        return NextResponse.json({ ok: true });
      }

      switch (state.step) {
        case 'ask_status': {
          if (text.includes("Completo")) {
            try {
              const db = await getDb();
              await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
                estado: 'completo',
                flowType: 'sequential'
              });
            } catch (e) {
              await sendTelegramMessage(botToken, chatId, "❌ Error al actualizar el estado en base de datos.", deliveryMenuKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            }
          } else if (text.includes("Incompleto")) {
            try {
              const db = await getDb();
              const modeRow = db.prepare('SELECT value FROM ops_delivery_settings WHERE key = \'delivery_mode\'').get() as { value: string } | undefined;
              const mode = modeRow?.value || 'sencillo';
              
              if (mode === 'avanzado') {
                let erpLines = [];
                if (tempData.searchType === 'factura') {
                  erpLines = db.prepare('SELECT LINEA, ARTICULO, DESCRIPCION, CANTIDAD FROM core_erp_invoice_lines WHERE FACTURA = ?').all(tempData.docNum) as any[];
                } else {
                  erpLines = db.prepare('SELECT PEDIDO_LINEA as LINEA, ARTICULO, (SELECT description FROM core_products WHERE id = ARTICULO) as DESCRIPCION, CANTIDAD_PEDIDA as CANTIDAD FROM core_erp_order_lines WHERE PEDIDO = ?').all(tempData.docNum) as any[];
                }

                tempData.erpLines = erpLines;

                if (erpLines.length > 0) {
                  // Setup sequential routing fallback within advanced lines flow
                  tempData.isSequential = true;
                  tempData.reportState = 'incompleto';
                  tempData.flowType = 'sequential'; // To redirect to advanceBatchSequentialReporting on executeFinalizeDelivery

                  await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_report_advanced_lines', tempData);
                  
                  let linesMsg = `📦 <b>Artículos en #${tempData.docNum}:</b>\n\n`;
                  for (const line of erpLines) {
                    linesMsg += `<b>Línea ${line.LINEA}</b>: ${line.DESCRIPCION || line.ARTICULO} (${line.CANTIDAD} und)\n`;
                  }
                  linesMsg += `\n✍️ Selecciona las líneas que tienen <b>incidencias/devoluciones</b>, o presiona <b>Ninguno</b> si todo se entregó al 100% o <b>Rechazo Total</b> si no se aceptó nada:`;
                  
                  const advancedLinesKeyboardRows: any[][] = [];
                  advancedLinesKeyboardRows.push([{ text: "Ninguno (100% Entregado) ✅" }]);
                  advancedLinesKeyboardRows.push([{ text: "Rechazo Total del Documento ❌" }]);

                  let lineRow: any[] = [];
                  for (const line of erpLines) {
                    lineRow.push({ text: `Línea ${line.LINEA}` });
                    if (lineRow.length === 3) {
                      advancedLinesKeyboardRows.push(lineRow);
                      lineRow = [];
                    }
                  }
                  if (lineRow.length > 0) {
                    advancedLinesKeyboardRows.push(lineRow);
                  }
                  advancedLinesKeyboardRows.push([{ text: "Cancelar ❌" }]);

                  const advancedLinesKeyboard = {
                    keyboard: advancedLinesKeyboardRows,
                    resize_keyboard: true,
                    one_time_keyboard: true
                  };
                  await sendTelegramMessage(botToken, chatId, linesMsg, advancedLinesKeyboard);
                  return NextResponse.json({ ok: true });
                }
              }
            } catch (err) {
              console.error("Error setting up advanced sequential mode on ask_status:", err);
            }

            // Fallback to simple reporting if no lines or mode is simple
            tempData.reportState = 'incompleto';
            await saveTelegramState(chatIdStr, 'delivery_batch_sequence', 'ask_reason', tempData);
            await sendTelegramMessage(botToken, chatId, `✍️ Por favor escribe el <b>motivo o comentario</b> de merma para factura #${tempData.docNum}:`, cancelOnlyKeyboard);
          } else if (text.includes("Rechazado")) {
            tempData.reportState = 'rechazado';
            await saveTelegramState(chatIdStr, 'delivery_batch_sequence', 'ask_reason', tempData);
            await sendTelegramMessage(botToken, chatId, `✍️ Por favor escribe el <b>motivo del rechazo</b> para factura #${tempData.docNum}:`, cancelOnlyKeyboard);
          } else if (text.includes("Omitir")) {
            try {
              const db = await getDb();
              db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
              await advanceBatchSequentialReporting(db, chatIdStr, chatId, botToken, linkage, tempData);
            } catch (err) {
              await sendTelegramMessage(botToken, chatId, "❌ Error al omitir factura.", deliveryMenuKeyboard);
              await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            }
          } else {
            await sendTelegramMessage(botToken, chatId, "Opción no válida. Por favor, selecciona una opción:", cancelOnlyKeyboard);
          }
          break;
        }

        case 'ask_reason': {
          tempData.reason = text.trim();
          try {
            const db = await getDb();
            const releaseEnabledRow = db.prepare('SELECT value FROM ops_delivery_settings WHERE key = \'release_codes_enabled\'').get() as { value: string } | undefined;
            const releaseEnabled = releaseEnabledRow?.value === 'true';

            if (releaseEnabled && tempData.reportState === 'incompleto') {
              await saveTelegramState(chatIdStr, 'delivery_batch_sequence', 'ask_release_code', tempData);
              await sendTelegramMessage(botToken, chatId, `🔑 <b>Código de Liberación Requerido</b>\nPor favor, ingresa la clave de validación para la factura #${tempData.docNum}:`, cancelOnlyKeyboard);
            } else {
              await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
                estado: tempData.reportState,
                comentario: tempData.reason,
                flowType: 'sequential'
              });
            }
          } catch (err) {
            await sendTelegramMessage(botToken, chatId, "❌ Error al registrar motivo.", deliveryMenuKeyboard);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
          }
          break;
        }

        case 'ask_release_code': {
          const typedCode = text.trim();
          try {
            const db = await getDb();
            const codeRecord = db.prepare('SELECT * FROM ops_delivery_release_codes WHERE delivery_order_id = ? AND codigo = ? AND usado = 0').get(tempData.docId, typedCode) as any;

            if (!codeRecord && typedCode.toLowerCase() !== 'override') {
              await sendTelegramMessage(botToken, chatId, "❌ <b>Código inválido.</b> Intente de nuevo:", cancelOnlyKeyboard);
              return NextResponse.json({ ok: true });
            }

            if (codeRecord) {
              db.prepare('UPDATE ops_delivery_release_codes SET usado = 1 WHERE id = ?').run(codeRecord.id);
            }

            await preFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, {
              estado: tempData.reportState,
              comentario: tempData.reason,
              releaseCodeId: codeRecord?.id,
              flowType: 'sequential'
            });
          } catch (err) {
            await sendTelegramMessage(botToken, chatId, "❌ Error al validar código en lote.", deliveryMenuKeyboard);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // J. MONITOR DE ENTREGAS - ESPERA DE GEOLOCALIZACION
    if (state.currentFlow === 'delivery_await_location') {
      const db = await getDb();
      if (text.includes("Salir del Lote") || text === '/cancelar' || text.toLowerCase() === 'cancelar') {
        if (tempData.docId) {
          db.prepare('UPDATE ops_delivery_queue SET telegram_lock_at = NULL, telegram_lock_by = NULL WHERE id = ?').run(tempData.docId);
        }
        await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
        await sendTelegramMessage(botToken, chatId, "🔙 Cancelado. Volviendo al menú de entregas.", deliveryMenuKeyboard);
        return NextResponse.json({ ok: true });
      }

      const isMandatoryRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_location_mandatory'").get() as { value: string } | undefined;
      const isMandatory = isMandatoryRow?.value === 'true';

      // Check if location was shared
      if (message.location) {
        tempData.latitud = message.location.latitude;
        tempData.longitud = message.location.longitude;
        try {
          await executeFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, tempData.finalStateData);
        } catch (err: any) {
          console.error("Error finalize delivery with location:", err);
          await sendTelegramMessage(botToken, chatId, "❌ Error al finalizar la entrega con geolocalización.", deliveryMenuKeyboard);
          await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
        }
      } else if (text.includes("Omitir ubicación")) {
        if (isMandatory) {
          const locationKeyboard = {
            keyboard: [
              [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
              [{ text: "Salir del Lote 🔙" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          };
          await sendTelegramMessage(
            botToken,
            chatId,
            `⚠️ <b>La geolocalización es obligatoria</b> para reportar la factura <b>#${tempData.docNum}</b>.\nPor favor comparte tu ubicación GPS actual utilizando el botón de abajo:`,
            locationKeyboard
          );
        } else {
          tempData.latitud = null;
          tempData.longitud = null;
          try {
            await executeFinalizeDelivery(db, chatIdStr, chatId, botToken, linkage, tempData, tempData.finalStateData);
          } catch (err: any) {
            console.error("Error finalize delivery skipping location:", err);
            await sendTelegramMessage(botToken, chatId, "❌ Error al finalizar la entrega.", deliveryMenuKeyboard);
            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
          }
        }
      } else {
        // Any other message, request GPS again
        const locationKeyboard = {
          keyboard: [
            [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
            ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
            [{ text: "Salir del Lote 🔙" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        };
        await sendTelegramMessage(
          botToken,
          chatId,
          `⚠️ <b>Mensaje no reconocido.</b>\nPor favor comparte tu ubicación GPS utilizando el botón 📍 <b>Compartir mi Ubicación GPS</b>:` +
          (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
          locationKeyboard
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ESPERA DE GEOLOCALIZACION PARA INICIO DE RETORNO
    if (state.currentFlow === 'delivery_await_return_location') {
      try {
        const db = await getDb();
        if (text.toLowerCase().includes("volver") || text.toLowerCase().includes("menú") || text.toLowerCase().includes("menu") || text === '/cancelar' || text.toLowerCase() === 'cancelar') {
          await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
          await sendTelegramMessage(botToken, chatId, "🔙 Cancelado. Volviendo al menú de entregas.", getDeliveryMenuKeyboard(db, tempData.assignmentId));
          return NextResponse.json({ ok: true });
        }

        const askReturnLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_return_location'").get() as { value: string } | undefined;
        const isMandatory = askReturnLocRow?.value === 'mandatory';

        let lat = null;
        let lng = null;
        let locationShared = false;

        if (message.location) {
          lat = message.location.latitude;
          lng = message.location.longitude;
          locationShared = true;
        }

        if (locationShared || text.includes("Omitir ubicación")) {
          if (!locationShared && isMandatory) {
            const locationKeyboard = {
              keyboard: [
                [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
                [{ text: "Volver al Menú Principal 🔙" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };
            await sendTelegramMessage(
              botToken,
              chatId,
              `⚠️ <b>La geolocalización es obligatoria</b> para registrar el inicio de tu retorno.\nPor favor comparte tu ubicación GPS utilizando el botón de abajo:`,
              locationKeyboard
            );
          } else {
            const nowStr = new Date().toISOString();
            const companyRow = db.prepare('SELECT name FROM core_company_settings WHERE id = 1').get() as { name: string } | undefined;
            const companyName = companyRow?.name || 'Empresa';

            db.prepare(`
              UPDATE ops_delivery_assignments
              SET fecha_inicio_retorno = ?, latitud_retorno = ?, longitud_retorno = ?,
                  siguiente_cliente = ?, siguiente_cliente_fecha = ?
              WHERE id = ?
            `).run(nowStr, lat, lng, companyName, nowStr, tempData.assignmentId);

            let logMsg = `Chofer inició retorno a la empresa.`;
            if (locationShared) logMsg += ` (GPS Registrado)`;
            await saveTelegramBotLog(db, tempData.vehicleId || 1, 'delivery', linkage.employeeName || 'Chofer', logMsg, locationShared ? { lat, lng } : null);

            const pendingSummary = getPendingSummary(db, tempData.assignmentId);

            await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
            await sendTelegramMessage(
              botToken,
              chatId,
              `🚀 <b>Salida de Retorno Registrada</b>\n\nQue tengas un excelente y seguro viaje de regreso a las instalaciones de la empresa. ¡Buen viaje!${pendingSummary}\n\nCuando llegues físicamente, por favor presiona el botón <b>🏁 Registrar Llegada a Empresa</b>:`,
              getDeliveryMenuKeyboard(db, tempData.assignmentId)
            );
          }
        } else {
          const locationKeyboard = {
            keyboard: [
              [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
              ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
              [{ text: "Volver al Menú Principal 🔙" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          };
          await sendTelegramMessage(
            botToken,
            chatId,
            `⚠️ <b>Mensaje no reconocido.</b>\nPor favor comparte tu ubicación GPS utilizando el botón de abajo:` +
            (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
            locationKeyboard
          );
        }
      } catch (err: any) {
        console.error("Error processing return location:", err);
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "⚠️ Ocurrió un error inesperado al registrar el retorno. Volviendo al menú principal.", getDynamicMenuKeyboard(linkage));
      }
      return NextResponse.json({ ok: true });
    }

    // ESPERA DE GEOLOCALIZACION PARA LLEGADA A EMPRESA (CIERRE DE JORNADA)
    if (state.currentFlow === 'delivery_await_arrival_location') {
      try {
        const db = await getDb();
        if (text.toLowerCase().includes("volver") || text.toLowerCase().includes("menú") || text.toLowerCase().includes("menu") || text === '/cancelar' || text.toLowerCase() === 'cancelar') {
          await saveTelegramState(chatIdStr, 'delivery_menu', 'delivery_menu_home', tempData);
          await sendTelegramMessage(botToken, chatId, "🔙 Cancelado. Volviendo al menú de entregas.", getDeliveryMenuKeyboard(db, tempData.assignmentId));
          return NextResponse.json({ ok: true });
        }

        const askArrivalLocRow = db.prepare("SELECT value FROM ops_delivery_settings WHERE key = 'bot_ask_arrival_location'").get() as { value: string } | undefined;
        const isMandatory = askArrivalLocRow?.value === 'mandatory';

        let lat = null;
        let lng = null;
        let locationShared = false;

        if (message.location) {
          lat = message.location.latitude;
          lng = message.location.longitude;
          locationShared = true;
        }

        if (locationShared || text.includes("Omitir ubicación")) {
          if (!locationShared && isMandatory) {
            const locationKeyboard = {
              keyboard: [
                [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
                [{ text: "Volver al Menú Principal 🔙" }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            };
            await sendTelegramMessage(
              botToken,
              chatId,
              `⚠️ <b>La geolocalización es obligatoria</b> para registrar tu llegada a la empresa.\nPor favor comparte tu ubicación GPS utilizando el botón de abajo:`,
              locationKeyboard
            );
          } else {
            const nowStr = new Date().toISOString();
            const pendingSummary = getPendingSummary(db, tempData.assignmentId);

            const finalRes = await finalizeRouteAssignmentInternal(tempData.assignmentId, 'Chofer (Fin jornada/Llegada)', db, lat, lng);
            const consecText = finalRes.success && finalRes.consecutivo ? `\nConsecutivo Generado: <b>${finalRes.consecutivo}</b>` : '';

            let logMsg = `Chofer registró llegada a empresa. Ruta finalizada y cerrada.`;
            if (locationShared) logMsg += ` (GPS Registrado)`;
            await saveTelegramBotLog(db, tempData.vehicleId || 1, 'delivery', linkage.employeeName || 'Chofer', logMsg, locationShared ? { lat, lng } : null);

            let durationMsg = "";
            try {
              const assRow = db.prepare("SELECT fecha_creacion, fecha_inicio_retorno FROM ops_delivery_assignments WHERE id = ?").get(tempData.assignmentId) as any;
              if (assRow && assRow.fecha_creacion) {
                const start = new Date(assRow.fecha_creacion).getTime();
                const end = new Date(nowStr).getTime();
                const totalMins = Math.round((end - start) / (1000 * 60));
                const hrs = Math.floor(totalMins / 60);
                const mins = totalMins % 60;
                
                let routeDurationStr = `${hrs}h ${mins}m`;
                let returnDurationStr = "N/A";
                
                if (assRow.fecha_inicio_retorno) {
                  const returnStart = new Date(assRow.fecha_inicio_retorno).getTime();
                  const returnMins = Math.round((end - returnStart) / (1000 * 60));
                  const rHrs = Math.floor(returnMins / 60);
                  const rMins = returnMins % 60;
                  returnDurationStr = `${rHrs}h ${rMins}m`;
                }
                
                durationMsg = `\n\n⏱️ <b>Resumen de Tiempos:</b>\n` +
                              `• Ciclo Logístico Total: <b>${routeDurationStr}</b>\n` +
                              `• Tiempo de Retorno: <b>${returnDurationStr}</b>`;
              }
            } catch (e) {
              console.error("Error calculating summary for driver message:", e);
            }

            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(
              botToken,
              chatId,
              `🏁 <b>¡Llegada y Cierre de Jornada Registrados!</b>\n` +
              `Has concluido exitosamente tu ruta asignada para hoy. ¡Muchas gracias por tu valioso esfuerzo!${consecText}${durationMsg}${pendingSummary}`,
              getDynamicMenuKeyboard(linkage)
            );
          }
        } else {
        const locationKeyboard = {
          keyboard: [
            [{ text: "📍 Compartir mi Ubicación GPS", request_location: true }],
            ...(isMandatory ? [] : [[{ text: "Omitir ubicación ⏭️" }]]),
            [{ text: "Volver al Menú Principal 🔙" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        };
        await sendTelegramMessage(
          botToken,
          chatId,
          `⚠️ <b>Mensaje no reconocido.</b>\nPor favor comparte tu ubicación GPS utilizando el botón de abajo:` +
          (isMandatory ? `\n(La geolocalización es obligatoria)` : ``),
          locationKeyboard
        );
      }
      } catch (err: any) {
        console.error("Error processing arrival location:", err);
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "⚠️ Ocurrió un error inesperado al registrar la llegada. Volviendo al menú principal.", getDynamicMenuKeyboard(linkage));
      }
      return NextResponse.json({ ok: true });
    }

    // F. RENOVACION DE RTV FLOW
    if (state.currentFlow === 'rtv_renewal') {
      if (text === 'Cancelar ❌' || text.toLowerCase() === 'cancelar' || text.toLowerCase() === '/cancelar') {
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "❌ Operación cancelada.", getDynamicMenuKeyboard(linkage));
        return NextResponse.json({ ok: true });
      }

      switch (state.step) {
        case 'rtv_plate': {
          if (text === '👥 Seleccionar Placa de Lista') {
            await sendPlatesSelectionKeyboard(botToken, chatId);
            return NextResponse.json({ ok: true });
          }

          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida, selecciónala de la lista o presiona Cancelar:`, 
              plateQueryKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          tempData.vehicleId = vehicle.id;
          tempData.plate = vehicle.plate;
          tempData.brand = vehicle.brand;
          tempData.model = vehicle.model;
          tempData.rtvExpiration = vehicle.rtvExpiration;

          if (vehicle.rtvExpiration) {
            const dateParts = vehicle.rtvExpiration.substring(0, 10).split('-');
            if (dateParts.length === 3) {
              const year = parseInt(dateParts[0], 10);
              const month = dateParts[1];
              const day = dateParts[2];
              const nextYear = year + 1;
              const proposedDate = `${nextYear}-${month}-${day}`;
              const formattedProposed = `${day}/${month}/${nextYear}`;

              tempData.proposedDate = proposedDate;
              tempData.formattedProposed = formattedProposed;

              await saveTelegramState(chatIdStr, 'rtv_renewal', 'rtv_confirm', tempData);

              const rtvConfirmKeyboard = {
                keyboard: [
                  [{ text: `Sí, renovar al ${formattedProposed} ✅` }],
                  [{ text: "✍️ Ingresar otra fecha" }],
                  [{ text: "Cancelar ❌" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              };

              await sendTelegramMessage(
                botToken,
                chatId,
                `🚙 <b>${vehicle.brand} ${vehicle.model} (${vehicle.plate})</b>\n` +
                `RTV actual: <b>${formatDate(vehicle.rtvExpiration)}</b>\n\n` +
                `¿Deseas renovar el RTV sumando un año para el <b>${formattedProposed}</b>?`,
                rtvConfirmKeyboard
              );
              return NextResponse.json({ ok: true });
            }
          }

          // If no current RTV date, ask to input manually
          await saveTelegramState(chatIdStr, 'rtv_renewal', 'rtv_date_input', tempData);
          await sendTelegramMessage(
            botToken,
            chatId,
            `🚙 <b>${vehicle.brand} ${vehicle.model} (${vehicle.plate})</b> no tiene fecha de RTV registrada.\n\n` +
            `Por favor, escribe la fecha de vencimiento de RTV en formato <b>DD/MM/AAAA</b> (ej: 01/05/2027):`,
            cancelOnlyKeyboard
          );
          break;
        }

        case 'rtv_confirm': {
          if (text.startsWith('Sí, renovar') || text.includes('Confirmar') || text.includes('Sí')) {
            try {
              const db = await getDb();
              db.prepare(`UPDATE fleet_vehicles SET rtvExpiration = ? WHERE id = ?`).run(tempData.proposedDate, tempData.vehicleId);

              // Save bot log
              await saveTelegramBotLog(
                db,
                tempData.vehicleId,
                'rtv',
                linkage.employeeName || 'Telegram Bot',
                `Se renovó el RTV sumando 1 año hasta el ${tempData.formattedProposed}`
              );
              await returnUserToSubmenu(chatIdStr, chatId, linkage, 'rtv_renewal', `✅ RTV del vehículo <b>${tempData.plate}</b> renovado con éxito al <b>${tempData.formattedProposed}</b>.`, botToken);
            } catch (err: any) {
              console.error("Error updating RTV via Telegram confirmation", err);
              await returnUserToSubmenu(chatIdStr, chatId, linkage, 'rtv_renewal', "❌ Error al actualizar la base de datos. Intente de nuevo.", botToken);
            }
          } else if (text.includes("Ingresar otra fecha") || text.includes("Ingresar")) {
            await saveTelegramState(chatIdStr, 'rtv_renewal', 'rtv_date_input', tempData);
            await sendTelegramMessage(
              botToken,
              chatId,
              `✍️ Por favor, escribe la fecha de vencimiento en formato <b>DD/MM/AAAA</b> (ej: 01/05/2027):`,
              cancelOnlyKeyboard
            );
          } else {
            await sendTelegramMessage(
              botToken,
              chatId,
              "Por favor, selecciona una de las opciones válidas:",
              {
                keyboard: [
                  [{ text: `Sí, renovar al ${tempData.formattedProposed} ✅` }],
                  [{ text: "✍️ Ingresar otra fecha" }],
                  [{ text: "Cancelar ❌" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            );
          }
          break;
        }

        case 'rtv_date_input': {
          const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
          const match = text.trim().match(dateRegex);

          if (!match) {
            await sendTelegramMessage(
              botToken,
              chatId,
              "⚠️ Formato incorrecto. Por favor, ingresa la fecha en formato <b>DD/MM/AAAA</b> (ej: 01/05/2027) o presiona Cancelar:",
              cancelOnlyKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          const day = parseInt(match[1], 10);
          const month = parseInt(match[2], 10);
          const year = parseInt(match[3], 10);

          const dateObj = new Date(year, month - 1, day);
          if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
            await sendTelegramMessage(
              botToken,
              chatId,
              "⚠️ Fecha inválida. Por favor, ingresa una fecha real y válida (ej: 01/05/2027):",
              cancelOnlyKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const formattedDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

          try {
            const db = await getDb();
            db.prepare(`UPDATE fleet_vehicles SET rtvExpiration = ? WHERE id = ?`).run(isoDate, tempData.vehicleId);

            // Save bot log
            await saveTelegramBotLog(
              db,
              tempData.vehicleId,
              'rtv',
              linkage.employeeName || 'Telegram Bot',
              `Se renovó el RTV manualmente hasta el ${formattedDate}`
            );
              await returnUserToSubmenu(chatIdStr, chatId, linkage, 'rtv_renewal', `✅ RTV del vehículo <b>${tempData.plate}</b> actualizado con éxito al <b>${formattedDate}</b>.`, botToken);
          } catch (err: any) {
            console.error("Error updating RTV via Telegram manual input", err);
            await returnUserToSubmenu(chatIdStr, chatId, linkage, 'rtv_renewal', "❌ Error al actualizar la base de datos. Intente de nuevo.", botToken);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // I. WAREHOUSE SEARCH FLOW (SIMPLE ARTICLE LOOKUP)
    if (state.currentFlow === 'warehouse_search') {
      if (text === 'Cancelar ❌' || text.toLowerCase() === 'cancelar' || text.toLowerCase() === '/cancelar') {
        const hasMultiple = getActiveModules(linkage).length > 1;
        await saveTelegramState(chatIdStr, 'submenu_warehouse', 'home', {});
        await sendTelegramMessage(botToken, chatId, "❌ Operación cancelada.", getWarehouseMenuKeyboard(linkage, hasMultiple));
        return NextResponse.json({ ok: true });
      }

      switch (state.step) {
        case 'search_code': {
          const queryTerm = text.trim().toUpperCase();
          const db = await getDb();
          
          // Find matching product
          const product = db.prepare('SELECT * FROM core_products WHERE UPPER(id) = ? OR UPPER(barcode) = ?').get(queryTerm, queryTerm) as any;
          if (!product) {
            await sendTelegramMessage(
              botToken,
              chatId,
              `❌ Artículo con código o barras <b>"${text}"</b> no encontrado en el catálogo.\n\nPor favor, escribe de nuevo el código exacto o presiona Cancelar:`,
              cancelOnlyKeyboard
            );
            return NextResponse.json({ ok: true });
          }

          // Fetch physical warehouse locations (both active stock and assigned locations)
          const physicalLocations = db.prepare(`
              SELECT 
                COALESCE(l.cached_full_path, l.name) as locationName,
                COALESCE(i.quantity, 0) as quantity,
                CASE WHEN il.id IS NOT NULL THEN 1 ELSE 0 END as isAssigned
              FROM wh_locations l
              LEFT JOIN wh_inventory i ON l.id = i.locationId AND i.itemId = ?
              LEFT JOIN wh_item_locations il ON l.id = il.locationId AND il.itemId = ?
              WHERE (i.itemId IS NOT NULL AND i.quantity > 0) OR il.itemId IS NOT NULL
          `).all(product.id, product.id) as any[];

          // Fetch ERP stock visible levels
          const stockRow = db.prepare('SELECT * FROM core_stock WHERE itemId = ?').get(product.id) as any;
          const stockByWarehouse = stockRow?.stockByWarehouse ? JSON.parse(stockRow.stockByWarehouse) : {};

          // Fetch stock settings for Visible check
          let erpStockText = "";
          try {
            const rows = db.prepare("SELECT value FROM core_stock_settings WHERE key = 'warehouses'").get() as any;
            const warehouses = rows?.value ? JSON.parse(rows.value) : [];
            const visibleWarehouses = warehouses.filter((w: any) => w.isVisible);

            let totalERP = 0;
            let whLines: string[] = [];

            for (const wh of visibleWarehouses) {
              const qty = stockByWarehouse[wh.id] || 0;
              if (qty > 0) {
                whLines.push(`• <b>${wh.name} (${wh.id})</b>: ${qty.toLocaleString('es-CR')} unidades`);
                totalERP += qty;
              }
            }

            if (whLines.length > 0) {
              erpStockText = `\n\n<b>📦 Existencias ERP:</b>\n${whLines.join('\n')}\n<b>Total ERP:</b> ${totalERP.toLocaleString('es-CR')} unidades`;
            } else {
              erpStockText = `\n\n<b>📦 Existencias ERP:</b>\n• Sin existencias registradas en el ERP.`;
            }
          } catch (whErr) {
            console.error("Error formatting warehouse ERP levels for Telegram", whErr);
            erpStockText = `\n\n<b>📦 Existencias ERP:</b>\n• Sin información disponible.`;
          }

          // Format Physical Locations Text
          let physicalText = "";
          if (physicalLocations.length > 0) {
            const locLines = physicalLocations.map(loc => {
              if (loc.quantity > 0) {
                return `• 📍 <b>${loc.locationName}</b>: ${loc.quantity.toLocaleString('es-CR')} unidades${loc.isAssigned ? ' (Asignada)' : ''}`;
              } else {
                return `• 📍 <b>${loc.locationName}</b>: (Asignada - Sin existencias físicas)`;
              }
            });
            physicalText = `\n\n<b>📍 Ubicaciones Físicas (WMS):</b>\n${locLines.join('\n')}`;
          } else {
            physicalText = `\n\n<b>📍 Ubicaciones Físicas (WMS):</b>\n• Sin ubicaciones registradas en bodega.`;
          }

          // Build final response
          const statusBadge = product.active === 'S' ? '🟢 Activo' : '🔴 Inactivo';
          const responseText = 
            `📦 <b>Información de Artículo</b>\n\n` +
            `🔹 <b>ID:</b> <code>${product.id}</code>\n` +
            `🔹 <b>Descripción:</b> <b>${product.description}</b>\n` +
            `🔹 <b>Clasificación:</b> ${product.classification || 'N/A'}\n` +
            `🔹 <b>Unidad de Venta:</b> ${product.unit || 'N/A'}\n` +
            `🔹 <b>Estado:</b> ${statusBadge}` +
            physicalText +
            erpStockText;

          const hasMultiple = getActiveModules(linkage).length > 1;
          await saveTelegramState(chatIdStr, 'submenu_warehouse', 'home', {});
          await sendTelegramMessage(botToken, chatId, responseText, getWarehouseMenuKeyboard(linkage, hasMultiple));
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

  } catch (error: any) {
    console.error("Critical error in Telegram bot webhook route:", error);
    try {
      await logError(`Fallo Crítico en Webhook de Telegram`, {
        error: error?.message,
        stack: error?.stack
      });
    } catch (logErr) {
      console.error("Error writing system log for critical webhook error:", logErr);
    }
  }

  return NextResponse.json({ ok: true });
}
