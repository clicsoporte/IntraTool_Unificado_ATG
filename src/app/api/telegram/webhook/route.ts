import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb } from '@/modules/core/lib/db';
import { getNotificationConfig } from '@/modules/notifications/lib/db';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { 
  getLinkageByChatId, 
  getTelegramState, 
  saveTelegramState, 
  deleteTelegramState, 
  activateLinkage, 
  getVehicleByPlate, 
  getMaintenanceTypes, 
  getTelegramBotSettings, 
  saveTelegramFuelLog, 
  saveTelegramMaintenanceLog,
  saveTelegramBotLog
} from '@/modules/fleet/lib/telegram-bot';

// Telegram Keyboards
const menuKeyboard = {
  keyboard: [
    [{ text: "1. Registrar Repostaje ⛽" }],
    [{ text: "2. Registrar Mantenimiento 🔧" }],
    [{ text: "3. Consultar Alertas ⚠️" }],
    [{ text: "4. Historial Log 📋" }],
    [{ text: "5. Permisos y Planes 📄" }],
    [{ text: "6. Renovar RTV 🚙" }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

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

export async function POST(req: NextRequest) {
  try {
    const config = await getNotificationConfig('telegram');
    const botToken = config?.botToken;

    if (!botToken) {
      console.warn("Telegram Bot Token is not configured yet.");
      return NextResponse.json({ ok: true });
    }

    const payload = await req.json();
    const message = payload.message;

    if (!message || !message.chat) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const chatIdStr = String(chatId);
    const text = message.text ? message.text.trim() : '';

    // Check if employee is linked
    const linkage = await getLinkageByChatId(chatIdStr);

    // 1. GLOBAL CANCEL HANDLING
    if (text.toLowerCase().includes('cancelar') || text.toLowerCase() === '/cancelar') {
      await deleteTelegramState(chatIdStr);
      await sendTelegramMessage(
        botToken, 
        chatId, 
        "❌ Proceso cancelado. Escribe /menu o presiona cualquier botón de abajo para iniciar de nuevo.", 
        linkage ? menuKeyboard : undefined
      );
      return NextResponse.json({ ok: true });
    }

    // 2. UNLINKED USER FLOW
    if (!linkage) {
      if (text.toLowerCase().startsWith('/vincular') || /^[A-Z0-9]{6}$/i.test(text)) {
        let code = text;
        if (text.toLowerCase().startsWith('/vincular')) {
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
            `✅ <b>¡Vinculación Exitosa!</b>\nBienvenido, <b>${activatedLink.employeeName || 'Colaborador'}</b>. Ya puedes interactuar con el sistema de Flota.\n\nEscribe /menu o presiona cualquier botón de abajo para ver las opciones de registro.`,
            menuKeyboard
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
          "❌ <b>Acceso no autorizado</b>\nTu cuenta de Telegram no está vinculada al sistema de Flota Garend.\n\nPor favor, ingresa tu código de activación generado por administración:\n<code>/vincular CÓDIGO</code>"
        );
      }
      return NextResponse.json({ ok: true });
    }

    // 3. LINKED USER FLOW
    if (text === '/start' || text.toLowerCase() === '/menu' || text.toLowerCase() === 'menu') {
      await deleteTelegramState(chatIdStr);
      await sendTelegramMessage(
        botToken, 
        chatId, 
        `🚗 <b>Bot de Flota Garend</b>\nHola, <b>${linkage.employeeName || message.from?.first_name}</b>. ¿Qué deseas hacer hoy?`,
        menuKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    const state = await getTelegramState(chatIdStr);

    // Initial Trigger for flows
    if (!state || !state.currentFlow) {
      if (text.includes("Repostaje") || text.toLowerCase() === '1') {
        await saveTelegramState(chatIdStr, 'fuel', 'fuel_plate', {});
        await sendTelegramMessage(botToken, chatId, "✍️ Por favor, escribe la <b>placa</b> del vehículo:", cancelOnlyKeyboard);
      } else if (text.includes("Mantenimiento") || text.toLowerCase() === '2') {
        await saveTelegramState(chatIdStr, 'maintenance', 'maint_plate', {});
        await sendTelegramMessage(botToken, chatId, "✍️ Por favor, escribe la <b>placa</b> del vehículo:", cancelOnlyKeyboard);
      } else if (text.includes("Alertas") || text.toLowerCase() === '3') {
        await saveTelegramState(chatIdStr, 'alerts', 'alerts_options', {});
        await sendTelegramMessage(
          botToken, 
          chatId, 
          "⚠️ <b>Consultar Alertas de Flota</b>\n¿Qué tipo de consulta deseas realizar?", 
          alertsOptionsKeyboard
        );
      } else if (text.includes("Historial") || text.toLowerCase() === '4') {
        await saveTelegramState(chatIdStr, 'history', 'history_plate', {});
        await sendTelegramMessage(botToken, chatId, "✍️ Por favor, escribe la <b>placa</b> del vehículo para consultar el historial:", cancelOnlyKeyboard);
      } else if (text.includes("Permisos") || text.toLowerCase() === '5') {
        await saveTelegramState(chatIdStr, 'permits_plans', 'permits_plans_plate', {});
        await sendTelegramMessage(botToken, chatId, "✍️ Por favor, escribe la <b>placa</b> del vehículo para consultar sus permisos y planes:", cancelOnlyKeyboard);
      } else if (text.includes("Renovar RTV") || text.toLowerCase() === '6' || text.toLowerCase() === '/rtv') {
        await saveTelegramState(chatIdStr, 'rtv_renewal', 'rtv_plate', {});
        await sendTelegramMessage(botToken, chatId, "✍️ Por favor, escribe la <b>placa</b> del vehículo para renovar su RTV:", cancelOnlyKeyboard);
      } else {
        await sendTelegramMessage(
          botToken, 
          chatId, 
          "🤔 No entendí ese comando. Por favor, selecciona una de las opciones del menú de abajo o escribe /menu:",
          menuKeyboard
        );
      }
      return NextResponse.json({ ok: true });
    }

    const tempData = state.tempData ? JSON.parse(state.tempData) : {};

    // A. REPOSTAJES FLOW (FUEL)
    if (state.currentFlow === 'fuel') {
      switch (state.step) {
        case 'fuel_plate': {
          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida:`, cancelOnlyKeyboard);
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

              await deleteTelegramState(chatIdStr);
              await sendTelegramMessage(botToken, chatId, "✅ Repostaje registrado y guardado con éxito.", menuKeyboard);
            } catch (err: any) {
              console.error("Error writing fuel log via Telegram", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al registrar en la base de datos. Intente de nuevo.", menuKeyboard);
              await deleteTelegramState(chatIdStr);
            }
          } else if (text === 'No, cancelar ❌') {
            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(botToken, chatId, "❌ Registro cancelado.", menuKeyboard);
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
          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida:`, cancelOnlyKeyboard);
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

              await deleteTelegramState(chatIdStr);
              await sendTelegramMessage(botToken, chatId, "✅ Mantenimiento registrado y guardado con éxito.", menuKeyboard);
            } catch (err: any) {
              console.error("Error writing maintenance log via Telegram", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al registrar en la base de datos. Intente de nuevo.", menuKeyboard);
              await deleteTelegramState(chatIdStr);
            }
          } else if (text === 'No, cancelar ❌') {
            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(botToken, chatId, "❌ Registro cancelado.", menuKeyboard);
          } else {
            await sendTelegramMessage(botToken, chatId, "Por favor, selecciona una de las opciones:", confirmKeyboard);
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
                await sendTelegramMessage(botToken, chatId, responseText, menuKeyboard);
              } else {
                responseText += `<i>💡 Se encontraron ${alertCount} vehículos con alertas. Escribe /menu para volver al menú principal.</i>`;
                await sendTelegramMessage(botToken, chatId, responseText, menuKeyboard);
              }

              await deleteTelegramState(chatIdStr);
            } catch (err) {
              console.error("Error in view all alerts:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar las alertas. Por favor intenta de nuevo.", menuKeyboard);
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
              await sendTelegramMessage(botToken, chatId, responseText, menuKeyboard);
            } catch (err) {
              console.error("Error in list vehicles with alerts:", err);
              await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar las alertas globales. Por favor intenta de nuevo.", menuKeyboard);
              await deleteTelegramState(chatIdStr);
            }
          } else if (text.includes("Placa") || text.includes("Buscar por") || text === '3') {
            await saveTelegramState(chatIdStr, 'alerts', 'alerts_plate', tempData);
            await sendTelegramMessage(botToken, chatId, "✍️ Por favor, escribe la <b>placa</b> del vehículo para consultar sus alertas:", cancelOnlyKeyboard);
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
          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida:`, cancelOnlyKeyboard);
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
            await sendTelegramMessage(botToken, chatId, responseText, menuKeyboard);
          } catch (err) {
            console.error("Error generating detailed vehicle alerts:", err);
            await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar el reporte. Por favor intenta de nuevo.", menuKeyboard);
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
          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida:`, cancelOnlyKeyboard);
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
            await sendTelegramMessage(botToken, chatId, responseText, menuKeyboard);
          } catch (err) {
            console.error("Error generating history log report:", err);
            await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar el historial. Por favor intenta de nuevo.", menuKeyboard);
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
          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(botToken, chatId, `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida:`, cancelOnlyKeyboard);
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
            await sendTelegramMessage(botToken, chatId, responseText, menuKeyboard);
          } catch (err) {
            console.error("Error generating permits and plans report:", err);
            await sendTelegramMessage(botToken, chatId, "❌ Ocurrió un error al procesar el reporte. Por favor intenta de nuevo.", menuKeyboard);
            await deleteTelegramState(chatIdStr);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // F. RENOVACION DE RTV FLOW
    if (state.currentFlow === 'rtv_renewal') {
      if (text === 'Cancelar ❌' || text.toLowerCase() === 'cancelar' || text.toLowerCase() === '/cancelar') {
        await deleteTelegramState(chatIdStr);
        await sendTelegramMessage(botToken, chatId, "❌ Operación cancelada.", menuKeyboard);
        return NextResponse.json({ ok: true });
      }

      switch (state.step) {
        case 'rtv_plate': {
          const vehicle = await getVehicleByPlate(text);
          if (!vehicle) {
            await sendTelegramMessage(
              botToken, 
              chatId, 
              `❌ Vehículo con placa <b>"${text}"</b> no encontrado. Por favor, ingresa una placa válida o presiona Cancelar:`, 
              cancelOnlyKeyboard
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

              await deleteTelegramState(chatIdStr);
              await sendTelegramMessage(
                botToken,
                chatId,
                `✅ RTV del vehículo <b>${tempData.plate}</b> renovado con éxito al <b>${tempData.formattedProposed}</b>.`,
                menuKeyboard
              );
            } catch (err: any) {
              console.error("Error updating RTV via Telegram confirmation", err);
              await sendTelegramMessage(botToken, chatId, "❌ Error al actualizar la base de datos. Intente de nuevo.", menuKeyboard);
              await deleteTelegramState(chatIdStr);
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

            await deleteTelegramState(chatIdStr);
            await sendTelegramMessage(
              botToken,
              chatId,
              `✅ RTV del vehículo <b>${tempData.plate}</b> actualizado con éxito al <b>${formattedDate}</b>.`,
              menuKeyboard
            );
          } catch (err: any) {
            console.error("Error updating RTV via Telegram manual input", err);
            await sendTelegramMessage(botToken, chatId, "❌ Error al actualizar la base de datos. Intente de nuevo.", menuKeyboard);
            await deleteTelegramState(chatIdStr);
          }
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

  } catch (error) {
    console.error("Critical error in Telegram bot webhook route:", error);
  }

  return NextResponse.json({ ok: true });
}
