# Informe: Mejoras de API REST y Sincronización APK → Servidor
### Proyecto: `00_Entregas` (Next.js + SQLite + Flutter APK "Clic Driver")

**Fecha:** 2026-08-29 · **Autor:** análisis comparativo contra 10 repositorios de referencia
**Nota:** Este informe es solo de ideas/recomendaciones. No se modificó ningún archivo.

---

## 0. Cómo se entiende tu arquitectura actual

- **Servidor web:** Next.js App Router con route handlers en `src/app/api/fleet/*` sobre SQLite (via `getDb`, statements preparados con `db.prepare`). Sin framework ORM; SQL a mano.
- **Cliente APK:** Flutter. `ApiService` (HTTP `package:http`), `SyncEngine` (ciclo completo), `OfflineDbService` (SQLite local `driver_offline_v2.db`), `BackgroundSyncService` (servicio foreground con timer cada ~5 min).
- **Modelo de sync:** bidireccional. El APK descarga entregas (`GET /driver-routes?userId=`), sube estados/fotos (`POST /driver-routes` con fotos en **base64**), sube eventos offline y telemetría (`POST /app-version`), y registra dispositivo (`POST /device-config`).
- **Auth:** solo en `POST /fleet/login` (bcrypt + devuelve `user.id`). **No hay token/sesión/JWT en el resto de endpoints**; cada llamada viaja con `userId` en la URL o en el body.

---

## 1. SEGURIDAD: el hueco más crítico (validado con 4 proyectos maduros)

### 1.1 Tu API actual está abierta (sin autenticación real por endpoint)
Los endpoints `driver-routes`, `driver-actions`, `device-config`, `app-version` **no verifican sesión ni token**. Cualquier persona que conozca un `userId` (o el `assignmentId`) puede:
- Leer entregas de otro chofer (`GET /driver-routes?userId=123`).
- Marcar entregas como completadas, revertirlas, enviar emails, reportar averías y reasignar facturas (`POST /driver-actions`).
- Leer/escribir la tabla de dispositivos y el estado MDM completo (`GET /device-config?list=true` → devuelve **todos** los dispositivos).

Esto contrasta fuertemente con los proyectos analizados, donde la autenticación es obligatoria por defecto.

**Qué hacen los proyectos maduros:**
- **Fleetbase (Laravel + Sanctum):** tokens de API (Sanctum) con dominio `stateful`, guard por defecto, `$hidden` en password, formato de error JSON unificado, CORS restringido por origen (`allowed_origins`).
- **ERPNext (Frappe):** *todo* método expuesto requiere el decorador `@frappe.whitelist()` (si no, no es invocable vía HTTP) y cada handler re-verifica `frappe.has_permission(doctype, "read"/"create", throw=True)`. Los endpoints guest son explícitos y raros.
- **Open_Curier (NestJS):** JWT dual (access+refresh con secretos separados), `AuthGuard`, `RolesGuard` (`@Roles(ADMIN/COURIER/PARTNER)`), guards apilados en orden global: `ThrottlerGuard → AuthApiKeyGuard → AuthHttpGuard → RolesGuard`.
- **Traccar (Java):** `SecurityRequestFilter` con Bearer/Basic/sesión, tokens ECDSA firmados **revocables** (`RevokedToken`), RBAC con límites de recursos, TOTP 2FA.

**Recomendaciones accionables (orden de prioridad):**
1. **Implementa un JWT de corta duración + refresh token** al hacer login. El APK guarda el access token (en flutter_secure_storage) y lo envía en header `Authorization: Bearer ...` en *todos* los endpoints `/api/fleet/*`.
2. **Crea un middleware/helper de guard** en Next.js que rechace peticiones sin token válido. En route handlers, llámalo al inicio de cada función `GET/POST` antes de tocar la BD.
3. **Autorización por recurso (IDOR):** cuando el APK pase `userId`, verifica en el servidor que ese `userId` corresponde al token autenticado. `GET /driver-routes?userId=X` no debería confiar en el query param: debe derivar el chofer del token. Esto elimina la posibilidad de leer entregas ajenas.
4. **Loguea y limita intentos de login** (bloqueo tras N fallos). Tu login actual no tiene anti-fuerza-bruta.
5. **Cambia el PIN de admin por defecto** (`apk_admin_settings_pin: '0000'` en config) — está hardcodeado.

### 1.2 Configuración sensible expuesta sin autenticación
`GET /fleet/config` devuelve el **token de bot de Telegram** (`telegram_bot_token`) dentro del JSON de respuesta, a cualquiera que lo pida. En Fleetbase, los secretos nunca salen en las respuestas de configuración. **Recomendación:** nunca devolver secretos en respuestas de config que consume el APK. Usa el token solo en el servidor (inyección de config del bot) y devuelve flags/IDs, no el token.

### 1.3 Cifrado en tránsito
Tu `config.dart` usa `defaultBaseUrl = 'http://192.168.1.14:9003'` (**HTTP plano**). Fleetbase fuerza HTTPS en producción (Ingress TLS + redirect) y Traccar/fleetbase cifran todo. **Recomendación:** servir siempre por HTTPS (reverse proxy con certificado) y que el APK fuerce `https://`. Esto protege credenciales y fotos de evidencia de entrega en la red.

### 1.4 Validación y rate limiting
- Fleetbase registra `ThrottleRequests`; Open_Curier usa `@nestjs/throttler` global (30 req/min) y un throttle especial en login. ERPNext aplica `@rate_limit(limit=5, seconds=300)` en endpoints de escritura guest.
- **Recomendación:** añade rate limiting por IP/device en los endpoints de login, telemetría (`/app-version`, que ahora se puede llamar en bucle) y en las escrituras. Valida tamaños de payload (las fotos base64 pueden ser muy grandes).

### 1.5 Anti-SSRF y subida segura de archivos
ERPNext tiene una función `is_local_file_url()` que **rechaza URLs remotas** en imports (protección SSRF) y guarda adjuntos como privados. Tu endpoint `boleta-html`, `files/[filename]` y las fotos base64 deben validar que el contenido sea imagen real (magic bytes), limitar tamaño, y servir con content-type correcto para evitar XSS vía subida de SVG/HTML.

---

## 2. ENVÍO DE DATOS DEL APK AL SERVIDOR: rediseño del transporte

### 2.1 Fotos en base64 dentro del JSON = ineficiente y frágil
En `api_service.dart:syncDelivery` lees las fotos y las pones **base64 dentro del body JSON**, con un timeout de 15s. Problemas:
- Aumenta el tamaño ~33% sobre el binario y hace el JSON enorme (puede superar límites del proxy).
- Un timeout de 15s falla con fotos grandes o en redes móviles.
- No hay reanudación de subida.

**Qué hacen otros:**
- La mayoría de apps (incluidas las de referencia de delivery) usan **multipart/form-data** (`FormData`) con `multipart/upload`, o suben a **almacenamiento de objetos** (S3/MinIO) firmando una URL y enviando solo la referencia.

**Recomendación:**
1. **Multipart:** usa `http.MultipartRequest` para enviar fotos como parte binaria, no base64. Reduce tamaño y memoria.
2. **Subida por pasos con reintento + backoff:** separa (a) subir el binario de la foto (obteniendo un `fileRef`), y (b) un POST de la entrega que referencia los `fileRef`. Así el registro de la entrega es idempotente y la foto puede reintentarse sola.
3. **Reanudable / reintento:** añade `maxAttempts` + backoff exponencial a las subidas (tu `SyncEngine` ya reintenta eventos pero no fotos individuales).
4. **Compresión de imagen en el APK** antes de subir (reducir resolución/calidad), para cortar datos móviles.

### 2.2 No hay idempotencia ni confirmación de "recibido con este ID"
El `syncDelivery` retorna `true` si el server responde `success:true`, pero no distingue entre "el servidor ya tenía esto" y "se guardó ahora". Si el POST se pierde tras el 200 (timeout del cliente), el APK reintentará y podría duplicar.

**Recomendación (patrón de ERPNext / Open_Curier):** envía un **`clientId` (UUID) idempotente** con cada entrega/evento. El servidor guarda ese `clientId` y responde `success:true, alreadyProcessed:true` si ya lo vio. Así el reintento nunca duplica. Open_Curier lo hace con `job_id` deduplicado (`deduplicate=True`).

### 2.3 Carga de fotos al reintentar entrega (fuga de memoria/bytes)
En `syncDelivery` lees base64 **siempre**, incluso si la foto ya fue subida antes. Mejor: el modelo guarda el `fileRef` de subidas previas y el sync solo reenvía el binario cuando es nuevo.

### 2.4 La cola offline solo cubre eventos, no la capa de transporte
Tu `offline_events` guarda eventos, pero las fotos físicas se guardan en `photo_storage_service` y la entrega en `deliveries (is_synced=0)`. Está bien diseñado, pero **no hay estado de "subida de foto en progreso"** → si la app muere a mitad de subir la foto, en el próximo ciclo se re-lee y re-subirá (redundante pero no incorrecto). Añadir un campo `upload_status` en la BD local ayudaría.

---

## 3. SINCRONIZACIÓN OFFLINE / BIDIRECCIONAL

### 3.1 Lo que ya haces bien (validado)
- SQLite local con `PRAGMA journal_mode=WAL` y `busy_timeout` — correcto y coincide con buenas prácticas.
- Failover primario/fallback con healthcheck (<4s) — excelente, más avanzado que muchos proyectos de referencia.
- Orden de sync: primero cola offline, luego descarga — prioriza no perder datos del chofer.
- Detección de "documentos nuevos en ruta" con notificación nativa.

### 3.2 Sincronización de solo-cambios (delta) en vez de recarga completa
Cada ciclo descarga TODAS las entregas de la ruta (`GET /driver-routes`) y luego `saveDeliveries` borra/reinserta. En redes flojas es innecesario.

**Recomendación (patrón Traccar/ERPNext):**
1. **Timestamps de modificación:** el server expone `?updatedAfter=<ISO>`. El APK solo recibe entregas cambiadas desde su último sync y hace merge local. Reduce payload y batería.
2. **Versión de catálogo** para rutas/vehículos (no recargar si `ETag`/hash no cambió).
3. Añade una columna `updated_at` en las tablas del servidor y en `deliveries` local para el merge.

### 3.3 Manejo de conflictos
Tu `saveDeliveries` correctamente **no pisa** (`continue`) las entregas `is_synced=0` (edición offline del chofer). Buen diseño. Pero no resuelves el caso "el server también cambió esa entrega". **Recomendación:** para el merge, define regla de "última escritura gana" según `updated_at`, o envía `updatedAt` en el POST para que el server haga compare-and-swap.

### 3.4 Intervalo de sync dinámico y "sync al entrar en rango Wi-Fi"
Tienes intervalo mínimo de 5 min. Open_Curier/Traccar empujan en tiempo real vía websockets. No es obligatorio, pero puedes:
- Forzar un sync inmediato cuando la app vuelve a primer plano (`WidgetsBindingObserver`).
- Detectar conectividad (`connectivity_plus`) y disparar sync cuando hay red, en vez de solo esperar el timer.

---

## 4. TIEMPO REAL (opcional pero muy valioso para entregas)

Los proyectos de referencia casi todos tienen capa de tiempo real:
- **Open_Curier:** socket.io con **autenticación en el handshake (Bearer JWT)** y canales por rol `COURIER:<userId>`. Eventos: `NEW_DELIVERY_OFFER`, `DELIVERY_STATUS_UPDATED`. Alternativa Ably.
- **Fleetbase:** SocketCluster, broadcaster Laravel → socket, canales de empresa y posiciones de vehículos.
- **Traccar:** Netty (dispositivos GPS) + WebSocket para clientes con auth por token + broadcast Redis entre instancias.

**Recomendación:** para tu caso (asignación de nuevas entregas en ruta), podrías añadir **Server-Sent Events (SSE)** en Next.js (más simple que websockets, funciona bien con móvil) o un socket de baja frecuencia en el APK que avise "hay entregas nuevas, haz sync ahora". Así el chofer no espera 5 min a que aparezca una factura asignada. La notificación nativa que ya tienes encaja perfecto: solo falta dispararla en vez de esperar el polling.

---

## 5. LOGGING, AUDITORÍA y OBSERVABILIDAD

- **ERPNext** centraliza `frappe.log_error(...)` con `reference_doctype`/`reference_name` y un doctype `Version` para auditoría de cambios (quién/cuándo/qué).
- **Open_Curier** tiene `ErrorLoggingInterceptor` + Sentry.
- **Tu app** ya tiene `AppLogger` con logs que se suben al servidor (`syncLogsToServer`). Excelente.

**Recomendación:** añade en el servidor una **tabla de auditoría** que registre cada mutación de estado de entrega (antes/después, `userId`, `deviceHardwareId`, IP, timestamp). En `updateDeliveryStatusInternal` se puede registrar el cambio de `estado` + quién lo hizo. Esto es clave para resolver disputas ("¿quién marcó entregado?").

---

## 6. ESTRUCTURA DE LA API y DIVISIÓN POR ROLES

- **Open_Curier** separa la capa REST por rol: `admin/`, `courier/`, `partner/`, `public/`, cada endpoint anotado con `@Roles`. Documentación Swagger separada por rol y SDK generado desde OpenAPI.
- **Fleetbase** usa namespace de API `int/v1` (versionado por prefijo URL).
- **ERPNext** separa portal guest de autenticado y filtra por registro.

**Recomendación:**
1. **Versiona tu API:** `/api/v1/fleet/*` para poder evolucionar sin romper el APK instalado.
2. **Divide por rol:** aunque hoy solo hay choferes, separa conceptualmente los endpoints del APK de los del panel web para poder aplicar permisos distintos y rate limits distintos.
3. Considera **documentar el contrato** (ej. OpenAPI) para que el APK y el servidor no se desincronicen en campos (`estado`, `lines`, etc.), que es fuente común de bugs.

---

## 7. OTRAS OBSERVACIONES ESPECÍFICAS DE TU CÓDIGO

- **`config.dart`:** versión y URL por defecto hardcodeadas. Mover a build-time env o configuración servida remotamente (ya sincronizas `server_url` vía device-config, buen camino).
- **Timeouts fijos de 8s:** en `ApiService` todos usan el mismo timeout. En redes móviles, separa timeout por operación (descarga grande = más tiempo, healthcheck = menos). El healthcheck ya usa 4s, correcto.
- **`checkServerHealth`** hace un `GET /api/fleet/config` que ahora devuelve el token de Telegram — un healthcheck no debería devolver datos de negocio. Mejor un endpoint dedicado `GET /api/health` (sin secretos) o `HEAD`.
- **Errores de BD expuestos:** varios route handlers devuelven `error.message` crudo en la respuesta (`return ... { error: error.message }`). Esto filtra detalles internos de SQL. En producción devuelve un mensaje genérico y loguea el detalle server-side.
- **Fotos eliminadas localmente tras sync:** `deleteLocalPhoto` se llama tras el 200. Con el esquema idempotente propuesto (clientId + fileRef) sería más seguro borrar solo tras confirmación con el servidor del procesamiento completo.

---

## 8. RESUMEN DE PRIORIDADES

| Prioridad | Mejora | Esfuerzo | Impacto |
|---|---|---|---|
| 🔴 Alta | **Autenticación por token (JWT) en todos los endpoints `/fleet/*`** | Medio | Seguridad: elimina acceso no autorizado a entregas/dispositivos |
| 🔴 Alta | **Autorización por recurso (derivar chofer del token, no del query)** | Medio | Seguridad: evita IDOR |
| 🔴 Alta | **HTTPS en producción + APK force https** | Bajo | Seguridad en tránsito |
| 🔴 Alta | **No exponer `telegram_bot_token` ni secretos en `/fleet/config`** | Bajo | Seguridad |
| 🟠 Media | **Fotos por multipart/`FormData` en vez de base64 en JSON** | Medio | Rendimiento subida, fiabilidad |
| 🟠 Media | **Idempotencia con `clientId` en entregas/eventos** | Medio | Evita duplicados en reintentos |
| 🟠 Media | **Sync por deltas (`updatedAfter`) en lugar de recarga completa** | Medio | Ahorro de datos/batería |
| 🟠 Media | **Rate limiting en login y telemetría** | Bajo | Anti-abuso |
| 🟠 Media | **Endpoint `GET /api/health` dedicado (sin datos de negocio)** | Bajo | Limpieza |
| 🟡 Baja | **Tiempo real (SSE/websocket) para avisar entregas nuevas** | Medio-Alto | UX chofer |
| 🟡 Baja | **Tabla de auditoría de cambios de estado** | Bajo | Trazabilidad |
| 🟡 Baja | **Versionado de API `/api/v1`** | Bajo | Mantenibilidad |
| 🟡 Baja | **Compresión de imágenes antes de subir** | Bajo | Datos móviles |

---

## 9. DÓNDE VER BUENAS PRÁCTICAS EN LOS PROYECTOS DE REFERENCIA

- **Autenticación JWT + roles + rate limiting + throttle en login:** `Open_Curier\src\rest-api\auth\courier\auth.courier.rest-api.controller.ts` y `src\app.module.ts` (guards apilados), `src\guards\`.
- **Tokens revocables + 2FA + RBAC con límites:** `Track_Car\src\main\java\org\traccar\api\security\` (SecurityRequestFilter, LoginService, TokenManager, PermissionsService).
- **Whitelist obligatoria + permisos por registro/campo:** `erpnext-develop\erpnext\controllers\queries.py` (`@frappe.whitelist`), `erpnext\stock\doctype\company_restriction\company_restriction.py` (query conditions), `erpnext\www\book_appointment\index.py` (`@rate_limit`).
- **Anti-SSRF + subida privada:** `erpnext-develop\erpnext\edi\doctype\code_list\code_list_import.py` (`is_local_file_url`, `is_private=1`).
- **Jobs asíncronos deduplicados + auditoría de errores:** `erpnext-develop\erpnext\accounts\doctype\repost_accounting_ledger\repost_accounting_ledger.py` (`frappe.enqueue`, `job_id`, `deduplicate`), `erpnext\utilities\bulk_transaction.py` (estados por ítem + retry).
- **Tiempo real con auth en handshake:** `Open_Curier\src\services\socketio\socketio.adapter.ts`, `socketio.dispatcher.ts`.
- **Config de CORS/HTTPS/rate en producción:** `fleetbase-main\api\config\cors.php`, `infra\helm\templates\ingress.yaml`.
- **Config runtime cacheada con allowlist:** `fleetbase-main\console\app\utils\runtime-config.js`.

---

# PARTE 2 · AUDITORÍA DE CIBERSEGURIDAD Y CÓDIGO (Pentesting Estático)

> Ejecutado como auditor de seguridad contra el código real de `00_Entregas`.
> Método: revisión estática (SAST) de rutas API, módulos de auth, webhooks, subidas de archivos y almacenamiento de secretos.
> Clasificación de severidad: 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🔵 Bajo/Info.

---

## 2.1 RESUMEN EJECUTIVO DE RIESGOS

| # | Hallazgo | Severidad | Ruta | Estado |
|---|----------|-----------|------|--------|
| S1 | Endpoints `/fleet/*` sin autenticación (IDOR / autorización por recurso rota) | 🔴 Crítico | `driver-routes`, `driver-actions`, `device-config`, `app-version`, `logs`, `break-events`, `suggestions`, `boleta-html` | Confirmado |
| S2 | Webhook de Telegram sin verificación de secreto (`X-Telegram-Bot-Api-Secret-Token`) | 🔴 Crítico | `api/telegram/webhook/route.ts` (POST línea 2437) | Confirmado |
| S3 | Descarga de archivos con Path Traversal | 🔴 Crítico | `fleet/files/[filename]`, `inventory/files/[filename]` | Confirmado |
| S4 | `GET /device-config?list=true` expone TODOS los dispositivos y su estado MDM sin auth | 🟠 Alto | `fleet/device-config/route.ts` | Confirmado |
| S5 | Secreto del bot de Telegram expuesto en respuesta pública | 🟠 Alto | `fleet/config/route.ts` (línea 96) | Confirmado |
| S6 | Tráfico en texto plano (HTTP) y URL por defecto hardcodeada | 🟠 Alto | `Android/lib/config.dart` | Confirmado |
| S7 | Login sin anti-fuerza-bruta / rate limiting; PIN admin por defecto `0000` | 🟠 Alto | `fleet/login/route.ts`, `fleet/config/route.ts` | Confirmado |
| S8 | Errores de BD crudos expuestos en respuestas (`error.message`) | 🟡 Medio | múltiples `route.ts` | Confirmado |
| S9 | Fotos subidas como base64 en JSON, sin validación de tipo/tamaño real | 🟡 Medio | `fleet/driver-routes/route.ts` (POST) | Confirmado |
| S10 | Comparación de secretos cron con `!==` (timing side-channel) | 🔵 Bajo | `cron/*` | Confirmado |
| S11 | Webhook envía respuestas 200 y procesa sin límite de cooldown por autor | 🔵 Bajo | `telegram/webhook` | Confirmado |
| S12 | Sesión web usa cookie simple con el `userId` (no firmada, no expirable en servidor) | 🟡 Medio | `core/lib/auth.ts` | Confirmado |

---

## 2.2 EXPLOTABILIDAD DETALLADA DE CADA HALLAZGO

### S1 · Endpoints `/fleet/*` sin autenticación — IDOR
**Código afectado:** todos los route handlers de `src/app/api/fleet/*` menos `login`. Verificado: `driver-routes`, `driver-actions`, `device-config`, `app-version`, `logs`, `break-events`, `suggestions`, `boleta-html` **no** llaman `authorizeSession()`/`getCurrentUser()` ni leen un token.

**Ataque (PoC conceptual):**
```bash
# Sin token, con solo un userId numérico:
curl -X GET "https://TU-DOMINIO/api/fleet/driver-routes?userId=5"
# Devuelve las entregas activas del chofer 5. Probar userId=1..999 → enumeración.

# Escritura destructiva sin auth:
curl -X POST "https://TU-DOMINIO/api/fleet/driver-actions" \
  -H "Content-Type: application/json" \
  -d '{"action":"finish_route","assignmentId":123,"driverName":"atacante"}'

# Listar TODOS los dispositivos (S4):
curl "https://TU-DOMINIO/api/fleet/device-config?list=true"
```
El `userId` viene del query param / body **confiando en el cliente**. Un atacante que conozca (o enumere) un `userId` o `assignmentId` puede leer y modificar entregas ajenas.

---

### S2 · Webhook de Telegram sin verificación de secreto
**Código:** `src/app/api/telegram/webhook/route.ts:2437` — el `POST` lee `getNotificationConfig('telegram')` y el body, pero **nunca** valida el header `X-Telegram-Bot-Api-Secret-Token`. Telegram permite registrar un secreto en `setWebhook` que el servidor **debe** verificar para autenticar que el update realmente proviene de Telegram.

**Ataque:** cualquiera que descubra la URL del webhook puede enviar `{"update_id":..,"message":{"chat":{"id":"<chatId>"},"text":"/..."}}` forjados para: registrar entregas, finalizar rutas, marcar documentos como entregados, reportar averías, consultar estados, incluso activar `importAllData()` (línea 58) → sync manual forzado. Es un **API pública sin control de identidad**.

---

### S3 · Path Traversal en descarga de archivos
**Código:** `src/app/api/fleet/files/[filename]/route.ts` y `inventory/files/[filename]/route.ts` — `filename = decodeURIComponent(params.filename)` y luego `getFleetFilePath(filename)` + `fs.readFileSync(filePath)`.

**Ataque:**
```bash
curl "https://TU-DOMINIO/api/fleet/files/..%2F..%2F..%2Fetc%2Fpasswd"
curl "https://TU-DOMINIO/api/fleet/files/..%2F..%2Fdata.db"   # BD SQLite
```
Si `getFleetFilePath` no normaliza y bloquea `..`, permite leer cualquier archivo del servidor (config, `.env`, BD). Incluso el `Cache-Control: immutable` de 1 año es irrelevante para el riesgo. **Debe validarse el nombre final contra el directorio base** (path.resolve + prefix check).

---

### S4 · Listado de dispositivos sin auth
`GET /device-config?list=true` (línea 31) devuelve `SELECT * FROM fleet_registered_devices` completo: hardware IDs, IMEI, teléfono, GPS (`current_lat/lng`), estado MDM, app version. Es **geolocalización de choferes en masa** expuesta públicamente. Combinado con S1, es trivial.

---

### S5 · Secreto de bot de Telegram en respuesta
`fleet/config/route.ts:96` inyecta `telegram_bot_token` en la respuesta JSON que consume el APK. Ese token permite al atacante **controlar el bot de Telegram** (enviar mensajes como el bot, leerlo, robar conversaciones). Un secreto jamás debe estar en una respuesta de configuración de cliente.

---

### S6 · HTTP plano y URL hardcodeada
`Android/lib/config.dart:9`: `defaultBaseUrl = 'http://192.168.1.14:9003'`. En producción el tráfico (credenciales, fotos de evidencia, GPS) viaja en claro y cualquiera en la red puede interceptarlo (MITM). Además la IP privada hardcodeada indica que aún no está detrás de un dominio HTTPS.

---

### S7 · Login sin límite de intentos y PIN por defecto
`fleet/login/route.ts` no cuenta fallos ni aplica backoff/bloqueo. `fleet/config/route.ts:56` trae `apk_admin_settings_pin: '0000'`. Ataques de fuerza bruta al login y PIN trivial.

---

### S8 · Fuga de errores internos
Varios handlers: `catch (error) { return ... error.message }`. Expone rutas de archivos, nombres de tablas, detalles de SQL — información útil para escalar ataques.

---

### S9 · Subida de fotos sin validación
`driver-routes/route.ts` POST recibe `fotoEvidencia`/`fotoFactura` como base64 y las guarda sin validar magic-bytes ni tamaño máximo. Un atacante autenticado (o sin auth vía S1) puede subir archivos arbitrarios (SVG con scripts → XSS, o llenar el disco → DoS).

---

### S10 · Comparación de secretos cron con `!==`
`cron/*/route.ts`: `if (token !== cronSecret)`. La comparación no es de tiempo constante (debería usar `crypto.timingSafeEqual`). Menor riesgo local, pero es la práctica correcta.

---

## 2.3 PLAN DE REMEDIACIÓN Y CÓDIGO SUGERIDO

A continuación, código listo para integrar, agrupado por área. **No se aplicó en el repo** (solo informe), pero son módulos autocontenidos.

### R1 · Middleware de autenticación para las rutas API de la flota (nuevo archivo)

`src/modules/fleet/lib/api-auth.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getDb } from '@/modules/core/lib/db';

// IMPORTANTE: define JWT_SECRET en .env (>=32 chars). No usar valor por defecto en prod.
const JWT_SECRET = process.env.FLEET_JWT_SECRET || '';
const ACCESS_TTL = '8h';

export interface FleetTokenPayload {
  uid: number;        // core_users.id
  role: string;
  hwid?: string;      // hardware_id opcional (dispositivos)
}

/**
 * Verifica el Bearer token y devuelve el userId autenticado.
 * Lanza 401 si no hay token o es inválido.
 */
export function authenticateFleet(req: NextRequest): { userId: number; payload: FleetTokenPayload } {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    throw new FleetAuthError('No autenticado: falta token', 401);
  }
  if (!JWT_SECRET) {
    throw new FleetAuthError('JWT_SECRET no configurado en el servidor', 500);
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as FleetTokenPayload;
    if (!payload?.uid) throw new Error('uid inválido');
    return { userId: payload.uid, payload };
  } catch (e: any) {
    throw new FleetAuthError('Token inválido o expirado', 401);
  }
}

export class FleetAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Helper para route handlers: envuelve la autenticación y normaliza errores. */
export function requireFleetAuth(req: NextRequest): { userId: number; payload: FleetTokenPayload } | NextResponse {
  try {
    return authenticateFleet(req);
  } catch (e: any) {
    const status = e instanceof FleetAuthError ? e.status : 401;
    return NextResponse.json({ success: false, error: e.message || 'No autorizado' }, { status });
  }
}

/** Genera un access token para el APK al hacer login. */
export function signFleetToken(payload: FleetTokenPayload): string {
  if (!JWT_SECRET) throw new Error('JWT_SECRET no configurado');
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL });
}
```

> Requiere instalar `jsonwebtoken` y `@types/jsonwebtoken`.

### R2 · Login de flota emite JWT (modificar `fleet/login/route.ts`)

En la rama de éxito (usuario/contraseña válidos), reemplaza el `return NextResponse.json({ success:true, user })` por:

```ts
import { signFleetToken } from '@/modules/fleet/lib/api-auth';
// ...
const token = signFleetToken({ uid: user.id, role: user.role || 'driver' });
return NextResponse.json({
  success: true,
  token,
  tokenType: 'Bearer',
  expiresIn: 8 * 60 * 60,
  user: { id: user.id, name: user.name, email: user.email, employeeId: user.employeeId }
});
```

> Aplica para ambas ramas (login por driverId y por usernameOrEmail).

### R3 · Aplicar el guard en cada endpoint protegido

Ejemplo en `fleet/driver-routes/route.ts` GET — reemplaza la obtención del `userId`:

```ts
import { requireFleetAuth } from '@/modules/fleet/lib/api-auth';

export async function GET(req: NextRequest) {
  const auth = requireFleetAuth(req);
  if (auth instanceof NextResponse) return auth; // 401/500
  const { userId } = auth; // OJO: NO confiar en query param userId

  // --- resto del código usando `userId` (el autenticado), NO searchParams.get('userId') ---
  // const userIdParam = searchParams.get('userId');  // <-- ELIMINAR esta línea
}
```

**Regla de oro anti-IDOR:** el `userId` debe salir SIEMPRE del token, nunca del query/body. Así el chofer solo ve sus propias entregas.

Para `driver-actions` (que maneja `assignmentId`), además hay que validar que la asignación pertenece al chofer autenticado:

```ts
// dentro de start_route / depart_route / finish_route, antes de mutar:
const owner = db.prepare(
  'SELECT empleado_id FROM ops_delivery_assignments WHERE id = ?'
).get(assignmentId) as { empleado_id: number } | undefined;
if (!owner || owner.empleado_id !== userId) {
  return NextResponse.json({ success:false, error:'No autorizado' }, { status: 403 });
}
```

### R4 · Verificación de secreto en el webhook de Telegram (modificar `telegram/webhook/route.ts`)

Añadir al inicio del `POST` (antes de procesar el payload):

```ts
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const config = await getNotificationConfig('telegram');
  const botToken = config?.botToken;
  const webhookSecret = config?.webhookSecret; // debe configurarse en setWebhook

  // Verificar secreto del webhook (lo valida Telegram en cada request)
  if (webhookSecret) {
    const secretHeader = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (!secretHeader || secretHeader !== webhookSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  if (!botToken) { /* ...como antes... */ }
  // ... resto del handler
}
```

> Al registrar el webhook: `curl -F "secret_token=TU_SECRETO" https://api.telegram.org/bot<TOKEN>/setWebhook -F url=...`
> Además, valida siempre `payload.update_id` y el `chatId` contra la tabla de linkage ANTES de ejecutar acciones (ya se hace `getLinkageByChatId`, pero verifica que no se acepten chats no vinculados para acciones destructivas).

### R5 · Corregir Path Traversal en descarga de archivos (modificar ambos `files/[filename]/route.ts`)

```ts
import path from 'path';
import fs from 'fs';
import { getFleetFilePath } from '@/modules/fleet/lib/files';

export async function GET(request: NextRequest, { params }: { params: { filename: string } }) {
  let filename = decodeURIComponent(params.filename || '').trim();

  // ... (lógica existente para JSON array / regex) ...

  // --- BLOQUEO DE PATH TRAVERSAL ---
  const baseDir = path.resolve(process.cwd(), 'fleet_uploads'); // dir base real
  const safePath = path.resolve(baseDir, filename);
  if (!safePath.startsWith(baseDir + path.sep)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (!fs.existsSync(safePath)) {
    return new NextResponse('File not found', { status: 404 });
  }
  const fileBuffer = fs.readFileSync(safePath);
  // ... resto igual pero usando safePath ...
}
```

> Verifica que `getFleetFilePath` ya normalice; este bloque añade defensa en profundidad. Aplica el mismo patrón en `inventory/files/[filename]`.

### R6 · Quitar el token de Telegram de `/fleet/config` (modificar `fleet/config/route.ts`)

Eliminar la línea que inyecta `telegram_bot_token` en la respuesta:

```ts
config: {
  ...defaultConfig,
  ...config,
  // ...(telegramBotToken ? { telegram_bot_token: telegramBotToken } : {})   // <-- ELIMINAR
},
```

El token debe usarse solo server-side (via `getNotificationConfig`), nunca enviarse al APK.

### R7 · Validación y límites en la subida de fotos (`driver-routes` POST)

Antes de guardar `fotoEvidencia`/`fotoFactura`, agregar:

```ts
const MAX_BASE64_BYTES = 8 * 1024 * 1024; // 8 MB

function isValidImageBase64(data: string | undefined): boolean {
  if (!data || typeof data !== 'string') return false;
  const clean = data.includes(',') ? data.split(',')[1] : data;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(clean)) return false;      // solo base64
  const buf = Buffer.from(clean, 'base64');
  // magic bytes de jpg/png/webp
  if (buf.length < 4) return false;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true; // jpeg
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E) return true; // png
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46) return true; // webp (RIFF)
  return false;
}

// en el POST:
if (fotoEvidencia && Buffer.byteLength(fotoEvidencia, 'utf8') > MAX_BASE64_BYTES) {
  return NextResponse.json({ success:false, error:'Foto demasiado grande' }, { status: 413 });
}
if (fotoEvidencia && !isValidImageBase64(fotoEvidencia)) {
  return NextResponse.json({ success:false, error:'Foto inválida' }, { status: 400 });
}
```

### R8 · No exponer errores de BD crudos

Cambiar `catch (error:any){ return ... error.message }` por:

```ts
catch (error: any) {
  console.error('[fleet/driver-actions]', error);
  return NextResponse.json(
    { success: false, error: 'Error interno del servidor' },
    { status: 500 }
  );
}
```
(Loguea el detalle server-side con tu `logger`; el cliente solo ve un mensaje genérico.)

### R9 · Comparación de secretos en tiempo constante (cron)

```ts
import crypto from 'crypto';
// en lugar de: if (token !== cronSecret)
if (typeof token !== 'string' || typeof cronSecret !== 'string' ||
    token.length !== cronSecret.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(cronSecret))) {
  return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
}
```

### R10 · Configuración mínima para producción (`.env`)

```env
FLEET_JWT_SECRET=generar_una_clave_aleatoria_de_64_caracteres
CRON_SECRET=generar_otra_clave
CLIC_TOOLS_COOKIE_SECURE=true
# HTTPS obligatorio detrás de proxy
```
Genera secretos con: `openssl rand -base64 48` (por cada valor).

---

## 2.4 CHECKLIST FINAL DE ENDURECIMIENTO (para "sobrevivir a internet")

Antes de exponer públicamente el servicio, verificar:

- [ ] **Autenticación obligatoria** en TODOS los endpoints `/api/fleet/*` (S1).
- [ ] **Webhook de Telegram** con `secret_token` verificado (S2).
- [ ] **Path Traversal** bloqueado en `files/[filename]` (S3).
- [ ] **`device-config` sin `list=true` público**; requerir rol admin + auth (S4).
- [ ] **Sin secretos en respuestas** (`/fleet/config`) (S5).
- [ ] **HTTPS** en producción + APK con `https://` (S6).
- [ ] **Rate limiting** en login (ej. memoria/Redis: máx 5 intentos/5 min por IP).
- [ ] **Anti-fuerza-bruta** y PIN admin cambiado (S7).
- [ ] **Errores genéricos** al cliente (S8).
- [ ] **Validación de imágenes** (tamaño + magic bytes) (S9).
- [ ] **`timingSafeEqual`** en cron secrets (S10).
- [ ] **Cabeceras HTTP de seguridad** (vía middleware de Next.js o proxy): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, CSP.
- [ ] **CORS** restringido a orígenes conocidos (solo el panel y el APK), nunca `*`.
- [ ] **Respaldos cifrados** de la BD y `fleet_uploads` fuera del servidor.
- [ ] **Logs centralizados** y alertas de intentos de acceso no autorizado.

---

## 2.5 PRIORIZACIÓN Y ESFUERZO

| Hallazgo | Acción | Esfuerzo | Impacto |
|----------|--------|----------|---------|
| S1 IDOR | JWT + guard + derivar userId del token | 🔴 1 día | Elimina acceso no autorizado a entregas/dispositivos |
| S2 Webhook | Validar secret_token | 🟠 2-3 h | Evita forjar updates destructivos |
| S3 Path Traversal | Normalizar path + startsWith | 🟠 1-2 h | Evita lectura de archivos del servidor |
| S4 Listado devices | Requerir auth + rol | 🟡 1 h | Protege geolocalización en masa |
| S5 Token en config | Quitar de la respuesta | 🔵 10 min | Protege el bot |
| S6 HTTP→HTTPS | Proxy TLS + config APK | 🟡 4-6 h | Cifra el tráfico |
| S7 Login bruteforce | Rate limiting | 🟡 2-4 h | Frena fuerza bruta |
| S8 Error leak | Errores genéricos | 🟡 1-2 h | Oculta detalles internos |
| S9 Foto validation | Magic bytes + límite | 🟡 2 h | Evita XSS/DoS vía upload |
| S10 timing | timingSafeEqual | 🔵 15 min | Higiene criptográfica |

---

---

# PARTE 3 · ANÁLISIS COMPLEMENTARIO (archivos y módulos pendientes)

> Esta parte completa la auditoría analizando los archivos que faltaban revisar en la Parte 1 y 2:
> `db.ts`, `delivery-service.ts`, `files.ts`, rutas restantes de fleet (`logs`, `suggestions`, `break-events`, `boleta-html`, `test-notifications`), descargas (`downloads/apk`, `inventory/files`, `it-tools/ota`), y servicios Android (`login_screen`, `photo_storage`, `version_service`, `device_security`).

---

## 3.1 NUEVOS HALLAZGOS DE SEGURIDAD (Anexo a la Parte 2)

### S13 · PIN de administrador con backdoor hardcodeado 🔴 Crítico
**Código:** `Android/lib/screens/login_screen.dart:156`
```dart
if (inputPin == targetPin || inputPin == '7429') {
```
Existe un **PIN de respaldo fijo `7429` hardcodeado** en el código del APK que permite acceder a la configuración del servidor (URLs primaria/fallback) **sin conocer el PIN administrador real**, y es idéntico en todos los dispositivos (se filtra en el APK, extraíble con cualquier descompilador). Esto permite a un atacante con el APK instalado redirigir el dispositivo a un **servidor falso (MITM)** o manipular el failover.

**Remediación:** eliminar el backdoor (`|| inputPin == '7429'`) y gestionar el PIN solo server-side, nunca embebido en el binario.

---

### S14 · Path Traversal confirmado en `inventory/files` 🔴 Crítico
**Código:** `src/app/api/inventory/files/[filename]/route.ts:10`
```ts
const filePath = path.join(process.cwd(), 'uploads', 'inventory', filename);
```
A diferencia de la ruta APK (que usa `path.basename`), **`inventory/files` NO normaliza `filename`**. Ataque:
```bash
curl "https://TU-DOMINIO/api/inventory/files/..%2F..%2F..%2Fdata%2Fclic_tools.db"
curl "https://TU-DOMINIO/api/inventory/files/..%2F..%2Fpackage.json"
```
Confirma y amplía el hallazgo S3: la ruta `fleet/files` usa `getFleetFilePath()` que a su vez hace `path.join(UPLOAD_DIR, fileName)` **sin** bloquear `..` (en `files.ts:49-51`). **Ambas rutas necesitan** `path.resolve` + verificación de prefijo.

---

### S15 · XSS almacenado en notificaciones por correo (HTML no escapado) 🟠 Alto
**Código:** `src/modules/operations/lib/delivery-service.ts`
- Línea 389: `"${data.comentario}"` se inyecta **sin escapar** en el HTML del email.
- Línea 397: `<img src="${data.firmaCliente}" ...>` — `firmaCliente` se incrusta directo; si un atacante controla ese valor puede inyectar `src="x" onerror="..."`.
- Líneas 469-477: `line.codigo`, `line.desc` se inyectan crudos en HTML.
- Los datos provienen del chofer vía el POST de `driver-routes` (sin autenticación, S1) o del webhook Telegram (sin verificar, S2) → un chofer comprometido o un atacante puede **ejecutar HTML/JS en el correo** que recibe el vendedor/creador. Es XSS almacenado que se dispara en el cliente de correo.

**Remediación:** escapar todo dato de usuario antes de insertarlo en HTML (función `escapeHtml`), validar que `firmaCliente`/fotos solo sean URLs/data-URI de imagen permitida, y sanitizar `comentario`.

---

### S16 · `test-notifications` revela estado de SMTP/Telegram sin autenticar 🟡 Medio
**Código:** `src/app/api/fleet/test-notifications/route.ts` — el `GET` (público) ejecuta `transporter.verify()` y llama a la API de Telegram, devolviendo si el SMTP/telegram responde. Es un oráculo de información (presencia y estado de la infraestructura de correo/bot) y permite abusar del endpoint para saturar la verificación SMTP. Debe exigir auth de administrador.

---

### S17 · `logs` DELETE borra TODA la bitácora sin autenticación 🟠 Alto
**Código:** `src/app/api/fleet/logs/route.ts:146` — `DELETE` ejecuta `DELETE FROM ops_driver_logs` (borrado total) **sin auth**. Un atacante puede destruir la evidencia/auditoría de la APK. Además el `GET` permite filtrar logs de todos los choferes (info operativa). Ambos deben exigir sesión de administrador (recordar que este archivo no tiene ningún `authorizeAction`).

---

### S18 · `boleta-html` expone boletas por enumeración de ID 🟡 Medio
**Código:** `src/app/api/fleet/boleta-html/route.ts` — `GET ?id=N` genera y devuelve el HTML de la boleta de cualquier entrega **sin auth ni control de propiedad**. Con enumeración de `id` (1,2,3…) se pueden leer boletas de todos los clientes. Requiere auth + verificación de que el solicitante es el chofer asignado o admin.

---

### S19 · Sugerencias y break-events aceptan datos no validados / sin auth 🟡 Medio
- `suggestions/route.ts`: solo valida que `content` no esté vacío; permite inyectar `userId` arbitrario y el contenido no pasa por sanitización anti-XSS (se renderizará en el panel admin).
- `break-events/route.ts`: `GET/POST` sin auth; `driverName`, `hardwareId`, coordenadas se aceptan del cliente sin validar, permitiendo **falsear pausas**, evadir la detección de fraude (un atacante puede poner `driverName` de otro) y contaminar métricas.

---

### S20 · Error en `delivery-service.ts`: reinyección de documentos duplicables 🟡 Medio
Líneas 290-323: al marcar `incompleto`/`rechazado` se reinyecta un doc con sufijo `-PARTIAL`/`-RETRY`. La guarda anti-duplicado usa `documento_numero = ? AND estado='pendiente'` (línea 294). Si el atacante reenvía el mismo POST (posible por S1 + falta de idempotencia), puede generar **múltiples reinyecciones** del mismo documento o reinyectar un doc ya procesado. Refuerza la necesidad de idempotencia por `clientId` (sección 2.2).

---

### S21 · `saveBase64ToFleetFile` no valida contenido (extensión controlable) 🟡 Medio
`src/modules/fleet/lib/files.ts:57-84`: la extensión se deriva del tipo MIME declarado en el Data URL (`image/svg+xml` → `.svg`). Permite almacenar **SVG con scripts** que luego se sirven desde `fleet/files` con `Content-Type: image/svg+xml` y `Cache-Control: immutable` → **XSS persistente** al abrir la imagen. Validar magic-bytes y **no servir `image/svg+xml`** (o servir con `Content-Disposition: attachment` y `X-Content-Type-Options: nosniff`).

---

### S22 · Logging y auditoría inexistente en las mutaciones críticas 🔵 Bajo
`delivery-service.ts` registra notificaciones y errores, pero **no hay una tabla de auditoría** de quién/cuándo/cómo cambió el estado de una entrega (`ops_delivery_queue` se actualiza sin guardar el historial del cambio). Para resolver disputas (¿quién marcó entregado?) se recomienda una tabla `ops_delivery_status_log` con `before/after/userId/deviceHwid/timestamp`.

---

## 3.2 NUEVAS OBSERVACIONES DE ARQUITECTURA Y SYNC (Anexo a la Parte 1)

### 3.2.1 `db.ts` usa `better-sqlite3` con statements preparados (bien) pero:
- `importDataFromSql` (línea 905) ejecuta `executeQuery(queryRow.query)` con queries guardadas en `core_import_queries`. Si esa tabla puede modificarse (por admin o por defecto), es **SQL arbitrario**. Validar que `query` solo provenga de configuración admin confiable y restringir el ejecutor a `SELECT`.

### 3.2.2 `login_screen.dart` guarda credenciales en `SharedPreferences` no cifradas 🔵
Tras login, `user_id`, `user_name`, `user_email`, `is_logged_in` se guardan en `SharedPreferences` (plano). El `user_id` es lo que identifica al chofer en TODAS las llamadas API (S1). En un dispositivo rooted/descompilado se puede leer/modificar. Usar `flutter_secure_storage` y NO confiar en `user_id` local como identidad (usar token del servidor).

### 3.2.3 El `version_service` descarga el APK desde `info.apkUrl` sin validar la URL
`version_service.dart:49,174`: construye `downloadUrl = $clean${info.apkUrl}` usando la URL que devuelve el servidor. Si un atacante compromete `fleet/config` (S5) o hace MITM (S6), puede apuntar la descarga a un **APK malicioso**. Además no se verifica firma/hash del binario. **Recomendación:** validar que `apkUrl` sea una ruta local (`/downloads/...`) del mismo origen, y verificar firma/hash antes de instalar.

### 3.2.4 Failover por URL es un vector MITM
El APK permite configurar URLs primaria/fallback (por PIN S13 o servidor). Un atacante que controle una de esas URLs recibe TODA la telemetría y fotos. Con JWT firmado (R1) y HTTPS (S6) se mitiga porque el token no puede reutilizarse contra otro servidor sin conocer el secreto.

### 3.2.5 `device-security` aplica políticas MDM confiando en `device-config` no autenticado
`sync_engine.dart` recibe el mapa `mdm` de `GET /device-config` (sin auth, S1). Combinado con S5/S13, un atacante puede empujar políticas maliciosas (desinstalar apps, reiniciar, bloquear). Todo el flujo MDM debe quedar detrás de la autenticación del dispositivo (token + hardwareId verificado).

---

## 3.3 CÓDIGO ADICIONAL SUGERIDO

### R11 · Helper de escape HTML (para corregir S15)

`src/modules/operations/lib/html-escape.ts`:
```ts
export function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```
Aplicar en `delivery-service.ts` a `comentario`, `firmaCliente` (como URL), `line.codigo`, `line.desc`, `clienteNombre`, `gestionadoPor` antes de interpolar en `emailHtml` y `getPremiumEmailHtml`.

### R12 · Validación de archivo en `saveBase64ToFleetFile` (corregir S21)
```ts
const ALLOWED_EXT = ['jpg','jpeg','png','webp']; // NO svg
// tras decodificar buffer:
const magicOk =
  (buffer[0] === 0xFF && buffer[1] === 0xD8) ||            // jpeg
  (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E) || // png
  (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46);   // webp
if (!magicOk) return null;
extension = '.jpg'; // forzar por magic, no por MIME del cliente
```

### R13 · Servir imágenes con cabeceras seguras (mitiga XSS vía archivos)
En `fleet/files` e `inventory/files`, añadir a la respuesta:
```ts
headers: {
  'Content-Type': contentType,
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Content-Disposition': `inline; filename="${encodeURIComponent(basename)}"`,
  'Cache-Control': 'public, max-age=31536000, immutable',
}
```
Y rechazar explícitamente `image/svg+xml` (devolver 415).

### R14 · Guard de administrador reutilizable para rutas internas (logs, test-notifications)
```ts
// src/modules/core/lib/require-admin.ts
import { authorizeAction } from './auth-guard';

export async function requireAdmin() {
  return authorizeAction('admin:settings:general');
}
```
Invoca `await requireAdmin()` al inicio de `GET/DELETE` de `logs/route.ts`, `test-notifications/route.ts`, y `boleta-html` (verificando además propiedad del doc).

---

## 3.4 TABLA RESUMEN DE LOS NUEVOS HALLAZGOS (S13–S22)

| # | Hallazgo | Severidad | Archivo | Acción |
|---|----------|-----------|---------|--------|
| S13 | Backdoor PIN `7429` hardcodeado | 🔴 Crítico | `login_screen.dart:156` | Eliminar backdoor, PIN server-side |
| S14 | Path Traversal confirmado (sin normalizar) | 🔴 Crítico | `inventory/files/route.ts:10` | `path.resolve` + prefix check |
| S15 | XSS almacenado en emails (HTML sin escapar) | 🟠 Alto | `delivery-service.ts` | escapeHtml |
| S16 | `test-notifications` público (oráculo SMTP) | 🟡 Medio | `test-notifications/route.ts` | require admin |
| S17 | `logs` DELETE total sin auth | 🟠 Alto | `logs/route.ts:146` | require admin |
| S18 | `boleta-html` enumerable sin auth | 🟡 Medio | `boleta-html/route.ts` | auth + propiedad |
| S19 | suggestions / break-events sin validación | 🟡 Medio | `suggestions`, `break-events` | sanitizar + auth |
| S20 | Reinyección duplicable sin idempotencia | 🟡 Medio | `delivery-service.ts:290` | clientId |
| S21 | SVG/scripts servidos desde uploads | 🟡 Medio | `files.ts:57` | magic-bytes + CSP |
| S22 | Sin auditoría de cambios de estado | 🔵 Bajo | `delivery-service.ts` | tabla status_log |

**Total acumulado del informe:** S1–S22 (22 hallazgos), con 10 remediaciones con código (R1–R14).

---

---

# PARTE 4 · AUDITORÍA QA DE ALTO NIVEL (Calidad, Bugs y Estabilidad)

> Revisión funcional de alto nivel actuando como QA Senior, sobre el sistema de entregas completo
> (servidor Next.js + APK Flutter). Método: revisión estática de flujos críticos (login, sync, entrega,
> impresión, pausas, rutas, boletas, logs). Severidad: 🔴 Crítico (bloquea/rompe dato) · 🟠 Alto
> (pérdida de datos o inconsistencia grave) · 🟡 Medio (borde/fragilidad) · 🔵 Bajo (mejora).

---

## 4.1 HALLAZGOS QA — APK ANDROID (Flutter)

### Q1 · Doble fuente de verdad para el consecutivo de boleta 🔴 Crítico
**Código:** `Android/lib/services/offline_db_service.dart:278-287` (`getNextBoletaConsecutive`) y `src/modules/operations/lib/delivery-service.ts:179-186`.

El APK genera el consecutivo `BOL-XXXXXX` leyendo `boleta_consecutive_next` de su SQLite **local**, mientras el servidor genera el suyo con `ops_delivery_settings` en su BD. Ambos contadores divergen:
- Una entrega guardada offline obtiene `BOL-000123` local; la siguiente sincronizada obtiene `BOL-000124` en el servidor → **colisiones y boletas repetidas** entre dispositivos.
- En `delivery_process_screen.dart:296-298`, el APK decide si asigna boleta solo si `!boletaNumero.contains('-')` — los documentos ERP costarricenses típicos (`0001-000123`) **contienen guion**, por lo que el APK usa el número de factura como boleta y **nunca** genera consecutivo real para esos docs.

**Fix recomendado:** el consecutivo debe emitirlo **solo el servidor** (transacción atómica con `UPDATE ... RETURNING` o bloqueo) y el APK debe solicitar un rango/reservarlo vía API; eliminar el contador local.

---

### Q2 · `entregada = j['entregada'] ?? j['cantidad']` falsea cantidades pendientes 🔴 Crítico
**Código:** `Android/lib/models/delivery_doc.dart:33-35`.

```dart
entregada: parseQty(j['entregada'] ?? j['cantidad']),
```
Cuando el servidor envía una línea **pendiente** sin campo `entregada` (o lo envía como `null`, que ocurre en `driver-routes/route.ts` porque la columna `cantidad_entregada` es `NULL` para docs no procesados), el APK lo interpreta como **entregada = pedida**. Consecuencias:
- La UI muestra artículos "entregados al 100%" sin que el chofer haya entregado nada.
- Si el chofer luego guarda como `completo` sin tocar cantidades, el resultado es "correcto" por accidente; pero si elige `incompleto`, las cantidades ya vienen contaminadas y la detección de faltantes (`faltante > 0`) falla si el servidor no envió `faltante` (aparece como 0 → la validación de `_saveAndPrint` línea 172-184 bloquea con "debe especificar faltante", pero el chofer ve 100% entregado y no entiende).

**Fix:** `entregada` debe inicializarse en **0** cuando el campo no viene (`j['entregada'] ?? 0`) y `faltante` en `pedida`; solo cuando `estado == 'completo'` debería computarse 100%.

---

### Q3 · PIN de administrador y datos sensibles volcados a logs que se suben al servidor 🟠 Alto
**Código:** `Android/lib/screens/dashboard_screen.dart:1198`:
```dart
AppLogger.log('  2. PIN Admin: ${_sysConfig['apk_admin_settings_pin']}', level: 'SUCCESS');
```
El diagnóstico de arranque registra el **PIN de administrador** (y URLs de servidores, HWID, etc.) en `app_logs`, que luego `AppLogger.syncLogsToServer` sube a `/api/fleet/logs` y quedan visibles en el panel `/dashboard/admin/logs` para cualquier usuario con acceso a logs. Es una **fuga de credenciales en el sistema de auditoría**. **Fix:** no loguear PINs/secretos; redactar.

---

### Q4 · Timeout de 4s en impresión Bluetooth corta boletas a la mitad 🟠 Alto
**Código:** `Android/lib/screens/delivery_process_screen.dart:340-352`:
```dart
await NativePrinterService.printBoleta(...).timeout(const Duration(seconds: 4));
```
La impresión ESC/POS con conexión Bluetooth + rasterización de firma (`imageRaster`, `native_printer_service.dart:196`) puede tardar >4s. El timeout **corta el stream de bytes a mitad** (boleta incompleta/rota) y el `catch (_) {}` lo **silencia por completo**: el chofer cree que se imprimió. **Fix:** timeout solo a la conexión (no a la escritura), feedback visible de error al chofer y reintento.

---

### Q5 · Logs en memoria marcados como sincronizados sin haberse subido 🟡 Medio
**Código:** `Android/lib/services/app_logger.dart:117-148`. Si hay logs en SQLite pendientes, se envían SOLO esos (`payload` desde BD) y luego **todos** los logs en memoria (`_logs`) se marcan `isSyncedToServer = true` (línea 145-147) — incluidos los que nunca se enviaron en este ciclo. Los logs de memoria se pierden sin subir. Además el borrado `DELETE ... WHERE id <= ?` (línea 143) es frágil si se insertan filas concurrentes. **Fix:** marcar `is_synced = 1` por id en BD y marcar en memoria solo los que se incluyeron en el payload.

---

### Q6 · `isReadOnly` se decide solo por `estado` — permite re-procesar entregas sincronizadas 🟡 Medio
**Código:** `delivery_process_screen.dart:47`: `isReadOnly => estado != 'pendiente' && estado != 'en_ruta'`.
Si el servidor devuelve un doc con `estado = 'pendiente'` pero **ya fue entregado** (inconsistencia de datos, ej. tras revertir desde el panel web o por el bug Q2), el APK lo muestra como editable y el chofer puede sobrescribirlo. También un doc `en_ruta` que ya fue marcado en el servidor por otra vía (web/Telegram) puede re-procesarse. **Fix:** el APK debería confiar en un flag explícito `is_processed`/`entregado` del servidor, no solo en el estado.

---

### Q7 · El modal de búsqueda marca `_estadoSelected = true` al editar cantidades, saltándose la confirmación de estado 🟡 Medio
**Código:** `delivery_process_screen.dart:629-634`. En `_showItemsSearchModal`, el `onChanged` del campo de cantidad ejecuta `_estadoSelected = true;` sin haber seleccionado estado. Como el valor inicial de `_estado` es `'completo'`, un chofer que escribe una cantidad para verificar algo **sin intención de cambiar estado** deja la entrega como "Completo" con faltantes > 0 → inconsistencia `estado=completo` con líneas faltantes que llega al servidor. **Fix:** el cambio de estado debe ser explícito (por el SegmentedButton), no derivado.

---

### Q8 · Fallback de impresora: conecta a la primera pareada sin confirmación 🟡 Medio
**Código:** `native_printer_service.dart:31-42, 87-95`. Si `printer_mac` no está configurado, imprime a `paired.first` — en un vehículo con varias impresoras pareadas, la boleta puede salir en la impresora **equivocada** (otro camión) sin aviso. **Fix:** mostrar selector la primera vez y persistir; nunca imprimir a ciegas a `first`.

---

### Q9 · `_doLogin` guarda `user_id` en SharedPreferences plano y sin validar que siga activo 🔵 Bajo
**Código:** `login_screen.dart:294-298`. `is_logged_in=true` persiste aunque el usuario sea desactivado en el servidor; la sesión del APK nunca se valida contra `is_active`. Combinado con Q3/S22 (sin token JWT), un `user_id` cualquiera funciona. Ya cubierto en seguridad (S1/S6), se repite aquí como defecto funcional: no hay "logout remoto" ni revocación.

---

### Q10 · `main.dart` ejecuta el OTA temprano incluso sin sesión iniciada 🔵 Bajo
**Código:** `main.dart:16`. `checkAndExecuteOtaUpdateEarly(serverUrl)` se llama en `main()` **antes** de saber si hay login. Un dispositivo en pantalla de login (o una instalación nueva) descarga e instala APKs en segundo plano sin consentimiento y sin verificar `hasUpdate` sobre la versión actual — si `serverUrl` viene vacío de prefs usa el default. Debería limitarse a cuando `isLoggedIn`.

---

## 4.2 HALLAZGOS QA — SERVIDOR (Next.js)

### Q11 · `start_route` del APK NO valida que el vehículo esté libre (inconsistencia con el panel web) 🔴 Crítico
**Código:** `src/app/api/fleet/driver-actions/route.ts:31-52` vs `src/modules/operations/lib/driver-actions.ts:80-121`.

El **panel web** (`startDriverRouteAction`) valida `vehicleInUse` (líneas 96-106) y rechaza si el vehículo ya está asignado a otro chofer hoy. La **ruta API que usa el APK** (`start_route`) solo verifica que el chofer no tenga ruta activa, **sin validar el vehículo** → dos choferes pueden iniciar rutas con el **mismo camión** simultáneamente vía APK, corrompiendo la flota del día. **Fix:** replicar la validación en la ruta API.

---

### Q12 · `autoload_invoice` con tokens cortos carga facturas equivocadas (LIKE sin límite) 🟠 Alto
**Código:** `driver-actions/route.ts:56-104`. El primer intento usa `UPPER(q.documento_numero) LIKE '%token%'` **sin exigir longitud mínima**: si el chofer escanea/teclea un fragmento de 2-3 caracteres (ej. "12"), el sistema carga **la primera factura que contenga "12"** en cualquier posición. El `driver-actions.ts` server-side sí limita a `token.length >= 3` (línea 205) pero **solo para el segundo intento**; el primero también es `LIKE %token%` sin mínimo. Riesgo de cargar documentos de otros clientes en la ruta. **Fix:** exigir `token.length >= 3` (o exact match) en TODOS los LIKE, y mostrar siempre la coincidencia antes de asignar.

---

### Q13 · Reinyección `-PARTIAL`/`-RETRY` con condición no atómica → duplicados en concurrencia 🟠 Alto
**Código:** `delivery-service.ts:290-323`. El `SELECT ... WHERE documento_numero = ?` (guarda anti-duplicado, línea 294) seguido de `INSERT` no es atómico: dos POSTs simultáneos (APK + Telegram + web) generan **dos reinyecciones del mismo documento**. La tabla no tiene UNIQUE en `documento_numero`. **Fix:** UNIQUE index o `INSERT OR IGNORE`.

---

### Q14 · El diagnóstico falso-positivo en GPS Navixy y estado HTTP 🟡 Medio
**Código:** `self_diagnostic_service.dart:213-230`. Si el endpoint de Navixy responde != 200 **o lanza excepción**, el diagnóstico marca `isSuccess: true` con mensaje "Servicio Navixy listo". Un servicio caído se reporta como **APROBADO**. **Fix:** solo marcar OK cuando la respuesta es realmente 200 con datos.

---

### Q15 · `config` remoto pisa defaults con valores vacíos de la BD 🟡 Medio
**Código:** `fleet/config/route.ts:93-97`: `{...defaultConfig, ...config}` — si una fila de `ops_delivery_settings` tiene `value = ''`, **pisa el default**. Ej. si `apk_block_if_gps_off` queda vacío, en el APK `_sysConfig['apk_block_if_gps_off'] != 'false'` es `true` → el Guardián GPS se activa aunque el admin quiso desactivarlo. **Fix:** filtrar valores vacíos antes del merge (`...Object.fromEntries(Object.entries(config).filter(([,v]) => v !== ''))`).

---

### Q16 · `fetchDeliveries` con N+1 y subqueries pesadas → timeouts de 8s en rutas grandes 🟡 Medio
**Código:** `driver-routes/route.ts:56-131`. Por cada documento: 6 subqueries para `lugar_entrega`, subqueries de observaciones, + consulta de líneas por doc (`getLinesStmt.all`) e incluso llamada a `getDocumentLinesInternal` (consulta ERP) cuando no hay líneas. En una ruta de 40-60 docs esto puede superar los **8s de timeout del APK** (`api_service.dart:98`), provocando "fallos" intermitentes de descarga en redes lentas. **Fix:** batch de líneas con una sola query (`WHERE delivery_order_id IN (...)`), y limitar/paralelizar; subir el timeout del APK a 20-30s para la descarga inicial.

---

### Q17 · El sync reporta "completo" aunque la descarga falle (errores tragados) 🟠 Alto
**Código:** `sync_engine.dart:117-148`. Los bloques de cola offline y descarga están envueltos en `try { ... } catch (_) {}` **que traga todo**. Si `fetchDeliveries` falla (red), `runFullSync` continúa y el APK muestra "✓ Sincronización completa" en `dashboard_screen.dart:1452-1460` aunque **no descargó nada** — el chofer cree que tiene las entregas nuevas cuando no las tiene. **Fix:** propagar errores al resultado (`success=false` con razón), y al menos diferenciar "sync parcial" con motivo visible.

---

### Q18 · `break-events` anti-fraude compara por `chofer_nombre` (spooleable) 🟡 Medio
**Código:** `break-events/route.ts:137-147`. La detección de fraude busca entregas `WHERE chofer_nombre = existing.driver_name` — y `driver_name` proviene **del cliente sin autenticar**. Un chofer puede escribir otro nombre para evadir la detección, o dos choferes homónimos se afectan entre sí. **Fix:** comparar por `driver_user_id` (validado) y solo contra docs de la asignación del día.

---

### Q19 · `logs` POST acepta `user_id` arbitrario y actualiza teléfonos de dispositivos ajenos 🟡 Medio
**Código:** `logs/route.ts:53-62`. Un POST con `userId` de otro chofer actualiza `phone_number`/`driver_phone` del dispositivo vinculado a ese usuario. Sin autenticación (S1), cualquiera puede **sobrescribir el teléfono** de cualquier chofer en `fleet_registered_devices` y contaminar la auditoría. **Fix:** auth + derivar el usuario del token.

---

### Q20 · `fleet-audit` / `delivery-cleanup` no verifican que el token no esté vacío 🔵 Bajo
Los crons comparan `token !== cronSecret` — si `CRON_SECRET` no está seteado devuelven 500 (bien), pero no hay límite de intentos por IP ni rate-limit para adivinarlo por fuerza bruta (el header se puede probar infinitamente). Combinado con S10 (comparación no constante). Es bajo riesgo por ser secreto de alta entropía, pero debería haber rate-limit por IP.

---

## 4.3 RESUMEN EJECUTIVO QA (Priorización)

| # | Hallazgo | Severidad | Área | Esfuerzo fix |
|---|----------|-----------|------|--------------|
| Q1 | Doble contador de boleta (APK local vs servidor) + docs con guion nunca obtienen BOL- | 🔴 Crítico | Sync/Boletas | Medio |
| Q2 | `entregada ?? cantidad` falsea pendientes como 100% entregadas | 🔴 Crítico | Modelo APK | Bajo |
| Q11 | `start_route` API no valida vehículo en uso (2 choferes mismo camión) | 🔴 Crítico | Rutas | Bajo |
| Q12 | `autoload_invoice` LIKE sin longitud mínima carga facturas equivocadas | 🟠 Alto | Carga docs | Bajo |
| Q13 | Reinyección no atómica → duplicados `-PARTIAL`/`-RETRY` | 🟠 Alto | Entregas | Bajo |
| Q17 | Sync reporta "completo" con fallos tragados | 🟠 Alto | Sync | Medio |
| Q3 | PIN admin y secretos en logs subidos al servidor | 🟠 Alto | Seguridad/QA | Bajo |
| Q4 | Timeout 4s corta impresión Bluetooth a mitad, silenciado | 🟠 Alto | Impresión | Bajo |
| Q5 | Logs de memoria marcados sincronizados sin subirse | 🟡 Medio | Logging | Bajo |
| Q6 | `isReadOnly` solo por estado → re-procesado posible | 🟡 Medio | Flujo entrega | Medio |
| Q7 | `_estadoSelected` auto-marcado → `completo` con faltantes | 🟡 Medio | Flujo entrega | Bajo |
| Q8 | Impresión a ciegas a `paired.first` | 🟡 Medio | Impresión | Bajo |
| Q14 | Diagnóstico Navixy falso positivo | 🟡 Medio | Diagnóstico | Bajo |
| Q15 | Config vacía pisa defaults (activa guardián GPS sin querer) | 🟡 Medio | Config | Bajo |
| Q16 | N+1 en `driver-routes` → timeouts 8s en rutas grandes | 🟡 Medio | Rendimiento | Medio |
| Q18 | Anti-fraude pausas spooleable por nombre | 🟡 Medio | Pausas | Bajo |
| Q19 | Logs pueden sobrescribir teléfonos de dispositivos ajenos | 🟡 Medio | Logging | Medio |
| Q9 | Sin logout remoto / revocación de sesión APK | 🔵 Bajo | Sesión | Medio |
| Q10 | OTA temprano sin sesión | 🔵 Bajo | OTA | Bajo |
| Q20 | Crons sin rate-limit | 🔵 Bajo | Cron | Bajo |

---

## 4.4 CÓDIGO SUGERIDO PARA LOS QA CRÍTICOS

### R15 · Fix Q2 — inicialización correcta de cantidades en el modelo
`Android/lib/models/delivery_doc.dart`:
```dart
final rawPedida = parseQty(j['pedida'] ?? j['cantidad']);
final rawEntregada = j['entregada'] != null ? parseQty(j['entregada']) : 0;
final rawFaltante = j['faltante'] != null ? parseQty(j['faltante']) : (rawPedida - rawEntregada);
return DeliveryLine(
  codigo: ...,
  pedida: rawPedida,
  entregada: rawEntregada.clamp(0, rawPedida),
  faltante: (rawFaltante).clamp(0, rawPedida),
  ...
);
```

### R16 · Fix Q11 — validar vehículo en uso en la ruta API
`src/app/api/fleet/driver-actions/route.ts` (dentro de `start_route`, antes del INSERT):
```ts
const vehicleInUse = db.prepare(`
  SELECT a.id, u.name as chofer_nombre, v.plate
  FROM ops_delivery_assignments a
  JOIN core_users u ON a.empleado_id = u.id
  JOIN fleet_vehicles v ON a.vehiculo_id = v.id
  WHERE a.vehiculo_id = ? AND a.fecha = ? AND a.activa = 1 AND a.empleado_id != ?
`).get(vehiculoId, todayStr, userId);
if (vehicleInUse) {
  return NextResponse.json({ success: false, error: `El vehículo (${vehicleInUse.plate}) ya está en uso por ${vehicleInUse.chofer_nombre}.` }, { status: 409 });
}
```

### R17 · Fix Q12 — longitud mínima en LIKE de autoload
`driver-actions/route.ts` (y `driver-actions.ts`), exigir mínimo de 3 caracteres antes de cualquier `LIKE '%...%'`:
```ts
const minLen = 3;
if (token.length < minLen) {
  notFoundTokens.push(token);
  continue;
}
```
Aplicar en las 4 consultas que usan `LIKE %token%`/`%token` (líneas 76, 90, 99, 121, 129).

### R18 · Fix Q13 — UNIQUE + INSERT OR IGNORE para reinyección
`delivery-service.ts`:
```ts
// una vez al inicio (migración aditiva):
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_docnum_pend ON ops_delivery_queue(documento_numero) WHERE estado = \'pendiente\''); } catch (_) {}

// en la reinyección, reemplazar el SELECT+INSERT por:
const reinjectedResult = db.prepare(`
  INSERT OR IGNORE INTO ops_delivery_queue (...)
  VALUES (?, 'pendiente'...)
`).run(...);
```

### R19 · Fix Q15 — no pisar defaults con vacíos
`fleet/config/route.ts`:
```ts
const merged = { ...defaultConfig };
for (const [k, v] of Object.entries(config)) {
  if (v !== null && v !== undefined && String(v).trim() !== '') merged[k] = v;
}
// usar `merged` en la respuesta
```

### R20 · Fix Q17 — diferenciar sync fallido
`sync_engine.dart`: reemplazar los `catch (_) {}` de descarga/cola por:
```dart
} catch (e) {
  AppLogger.log('⚠️ Fallo en cola offline: $e', level: 'ERROR');
  failedSteps++;
}
```
y en el resultado:
```dart
return FullSyncResult(
  success: failedSteps == 0,
  intervalMinutes: intervalMinutes,
  deliveriesFetched: deliveriesFetched,
  offlineSent: offlineSent,
);
```
En `dashboard_screen.dart:1452-1454` mostrar mensaje rojo/ámbar cuando `res.success == false` con el motivo.

### R21 · Fix Q3 — redactar secretos en logs
`dashboard_screen.dart:1198` → sustituir por:
```dart
AppLogger.log('  2. PIN Admin: [REDACTADO]', level: 'SUCCESS');
```
Además, añadir un filtro de redacción en `AppLogger.log` para claves conocidas (`pin`, `token`, `password`, `secret`).

---

*Fin de la auditoría QA. Hallazgos Q1–Q20 con remediaciones R15–R21 de referencia; no aplicadas al repositorio.*
