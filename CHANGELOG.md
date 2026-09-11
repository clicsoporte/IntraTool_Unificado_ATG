# Historial de Cambios (Changelog) - Clic-Tools

Este documento registra todas las mejoras, correcciones y cambios significativos en cada versión de la aplicación.

---

## Proceso de Actualización y Rollback

**Para actualizar a una nueva versión, siga estos pasos:**

1.  **¡Crítico! Crear Punto de Restauración:** Antes de cualquier cambio, vaya a **Administración > Mantenimiento** y haga clic en **"Crear Punto de Restauración"**. Esto crea una copia de seguridad completa de todas las bases de datos (`.db`).
2.  **Reemplazar Archivos:** Reemplace todos los archivos y carpetas de la aplicación en el servidor con los de la nueva versión, **excepto** la carpeta `dbs/` y el archivo `.env.local`.
3.  **Actualizar Dependencias:** Ejecute `npm install --omit=dev` en el servidor.
4.  **Reconstruir y Reiniciar:** Ejecute `npm run build` y reinicie la aplicación (ej: `pm2 restart clic-tools`).
5.  **Verificar:** Ejecute la auditoría desde **Administración > Mantenimiento** para confirmar que la estructura de la base de datos es correcta.

**Para realizar un rollback (regresar a la versión anterior):**

1.  **Restaurar Punto de Restauración:** Vaya a **Administración > Mantenimiento**, seleccione el punto de restauración que creó antes de la actualización y haga clic en "Restaurar". **Esto requiere un reinicio manual del servidor de la aplicación después de la restauración.**
2.  **Revertir Archivos:** Reemplace los archivos del servidor con los de la versión anterior.
3.  **Reinstalar y Reconstruir:** Ejecute `npm install --omit=dev` y `npm run build`.
4.  **Reiniciar:** Inicie la aplicación nuevamente.

---

## [3.1.0] - En Desarrollo

- **[MÓVIL / APK CLIC DRIVER] Validaciones de Entrega, Contexto Seguro y Telemetría:**
  - **Motivo Configurable en Incidencias/Rechazo (`apk_require_incident_notes`):** Se parametrizó desde la consola web (`/dashboard/admin/operations/deliveries`) la obligatoriedad de ingresar motivo/notas ante entregas parciales o rechazadas, permitiendo que logística decida si es obligatorio u opcional.
- **[HISTORIAL / ENTREGAS DIRECTAS] Tarjeta de Entregas Manuales / Sin Ruta (`HistoricalDeliveriesTab.tsx`, `actions.ts`):**
  - **Consulta e Interfaz Unificada:** Se actualizó `getHistoricalAssignments` para incluir entregas marcadas directamente desde la cola (sin asignación de ruta, ej. remisiones `REM-...`) y se diseñó la tarjeta especial `📦 Entregas Manuales / Sin Ruta (Despacho Web)` en el historial con soporte para reversión inmediata a la cola activa.
  - **Centro de Ayuda (`/dashboard/help`):** Se actualizó la documentación interactiva detallando las entregas directas y los parámetros del APK.
  - **Invariante de Cantidades:** Validación estricta `pedida == entregada + faltante` antes de confirmar la entrega, evitando datos inconsistentes.
  - **Seguridad en Diálogos y Red:** Captura de `ScaffoldMessenger` antes del `Navigator.pop` y manejo `try/catch` con `mounted` en reporte de averías y envío de boletas por correo.
  - **Reversión Limpia de Entregas:** Vaciado de fecha de entrega, coordenadas y notas previas al revertir un documento en `dashboard_screen.dart`.
  - **Telemetría Fidedigna de Batería:** Ajuste en `MainActivity.kt` para retornar `-1` en lugar de `100` ante fallos en la lectura del sensor nativo de batería.
- **[INTEGRIDAD / CONCURRENCIA] Protección Transaccional y Gestión de Clones (`delivery-service.ts`, `actions.ts`, `driver-actions.ts`):**
  - **Generación Atómica de Hojas de Ruta:** Envolvimiento de `finalizeRouteAssignmentInternal` en `db.transaction` para garantizar que el cierre de asignación, el consecutivo y el reseteo de documentos devueltos se ejecuten de forma indivisible.
  - **Consecutivos de Boleta Únicos en Clones:** Eliminación de la duplicación de `boleta_numero` en reintentos y entregas parciales (`-PARTIAL`/`-RETRY`), asignando `boleta_numero = NULL` hasta su entrega efectiva y recalculando `cantidad_pedida` con base en el faltante real.
  - **Limpieza de Devolución en Autocarga de Chofer:** Se forzó `devolucion_asignacion_id = NULL` al recargar facturas devueltas a una nueva ruta activa, evitando conteos duplicados.
  - **Reversión Integral de Entregas:** Vaciado exhaustivo de boletas, firmas, horas efectivas, tiempos de descarga y locks de concurrencia (`telegram_lock_at/by`) en las reversiones operativas y del chofer.
  - **Rollback de Archivos Huérfanos:** Eliminación física automática de archivos temporales de evidencias/firmas generados en disco si la transacción de confirmación es abortada.
- **[ZONA HORARIA / ARQUITECTURA DRY] Estandarización Comercial y Protección contra Desfase UTC:**
  - **Unificación Frontend & Backend:** Adopción de `getLocalDateStr` (`Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Costa_Rica' })`) en reemplazo de `.toISOString()`, alineando la UI con la configuración centralizada de **Zona Horaria Comercial** (`/dashboard/admin/general`).
  - **Protección de Depuración Histórica:** Eliminación del riesgo de desfase horario después de las 18:00 CR en `purgeCutoffDate`, asegurando que la fecha por defecto represente el día anterior real.
  - **Filtros de Analítica Exactos:** Normalización de fechas en consultas SQL (`DATE(q.fecha_registro) >= ?`) para no omitir facturas del primer día del rango.
- **[TELEMETRÍA GPS / MAPAS] Monitoreo en Vivo y Rendimiento Reactivo:**
  - **Telemetría en Polling:** Inclusión de `getLiveTelemetryAction()` en `silentRefresh` de `useDeliveriesMonitor` para mantener actualizadas las velocidades y posiciones GPS en el dashboard.
  - **Estabilización de Cámara Leaflet:** Corrección de saltos de cámara en `LiveTelemetryMap` (`flyTo` condicionado al cambio real de vehículo seleccionado) y destrucción de instancias al desmontar componentes.
  - **Pausa Inteligente en Pestañas Ocultas:** Verificación de `document.hidden` en los temporizadores de refresco para ahorrar consumo de CPU y red.
  - **Sanitización de Coordenadas:** Validación estricta de valores finitos (`isFinite`) y rangos geográficos en `MapTracker`.
- **[MÉTRICAS / AI AUDITOR / UX] Exactitud Operativa y Formularios Limpios:**
  - **Unificación de Tasa de Completitud:** Tarjeta global de completitud alineada al criterio estricto `d.estado === 'completo'`.
  - **Corrección de Consulta en AI Auditor:** Actualización del filtro de auditoría a `WHERE estado NOT IN ('completo')`.
  - **Prevención de Duraciones Negativas:** Aplicación de `Math.max(0, ...)` en cálculos de duración de rutas.
  - **Limpieza de Formularios Móviles:** Reseteo completo de estados de fotos, firmas y comentarios al cancelar o reabrir modales de entrega y averías.
  - **Diálogos Accesibles:** Sustitución de `window.confirm()` nativo por `AlertDialog` en las reversiones del chofer.

### Módulo de Entregas y Diagnóstico Móvil (Web & APK Clic Driver v1.2.32 - Build 51)
- **[LOGÍSTICA / ERP] Corrección del Usuario Creador Real del Pedido Softland (`/dashboard/operations/logistics/deliveries`):**
  - **Cruce Directo por `PEDIDO`:** Se corrigió la importación y sincronización de facturas (`core_erp_invoice_headers`) realizando un `LEFT JOIN` directo con los encabezados de pedidos (`core_erp_order_headers`) a través de la columna común **`PEDIDO`**. De esta forma, el campo `creado_por` toma el `USUARIO` que verdaderamente digitó la orden de venta en lugar del facturador que procesó el lote en Softland.
  - **Auto-Curación Retrospectiva:** Cada sincronización de cola ejecuta un proceso de actualización que corrige automáticamente las facturas ya existentes en la cola y rutas activas.
  - **Notificaciones y Alertas Precisas:** Las alertas automáticas de despacho, entrega y bitácoras ahora notifican directamente al vendedor o ejecutivo responsable del pedido.
- **[AUDITORÍA / EVIDENCIAS] Soporte de Facturas de Múltiples Hojas y Galería de Fotos (APK & Web):**
  - **Captura Multihábil en APK:** El chofer ahora puede fotografiar tantas páginas o evidencias como requiera (ej. facturas de 3, 4 o más páginas selladas). La interfaz muestra miniaturas con indicador de página (`Pág 1`, `Pág 2`), botones para añadir más capturas (`+ Pág.`) o eliminar fotos individuales.
  - **Sincronización y Backend:** `PhotoStorageService`, `DeliveryService` y `SyncEngine` procesan y serializan las colecciones fotográficas en formato JSON array garantizando la subida y almacenamiento seguro de cada archivo.
  - **Visor Web de Evidencias Interactivo:** `EvidencePhotoViewer` y el Centro de Auditoría incorporan navegación paginada (`< Página 1 de 3 >`), permitiendo al supervisor examinar y descargar cada hoja de la factura o foto de mercadería por separado.
- **[AUDITORÍA / UX] Centro de Auditoría 360° y Boleta Digital 80mm (`/dashboard/operations/logistics/audit`):**
  - **Filtro de Estado Optimizado:** El filtro por defecto ahora muestra exclusivamente entregas procesadas (`completo`, `incompleto`, `rechazado`, `descartado`), evitando la sobrecarga de documentos en cola o pendientes a menos que se seleccionen explícitamente.
  - **Área de Trabajo Ampliada:** Expansión del contenedor a `max-w-[1750px]` para permitir la visualización holgada de las 10 columnas de auditoría y métricas de permanencia/tiempos de descarga.
  - **Boleta Digital Oficial (80mm) con Artículos y Membrete Completo:** Se perfeccionó el generador de PDF térmico (`handleDownloadThermalPdf`) para incluir el membrete fiscal completo (Cédula Jurídica, Dirección, Teléfono y Correo), la tabla de 5 columnas `DISCREPANCIAS / FALTANTES` (`Cód`, `Producto`, `Ped`, `Ent`, `Fal`) y firma digital táctil con coordenadas GPS, haciéndolo 100% idéntico a la tirilla de 80mm de la impresora física.
  - **Galería de Fotos de Mercadería (`foto_evidencia`):** Corrección del visor para soporte de arreglos JSON con múltiples fotografías de paquetes/mercadería descargada, eliminando errores de imagen rota y permitiendo navegación paginada.
- **[ADMINISTRACIÓN / ROLES] Buscador Inteligente, Badges de Categoría e Insignias de Canal (`/dashboard/admin/roles`):**
  - **Buscador Principal de Roles:** Permite filtrar en tiempo real la lista de roles por nombre o ID técnico con contador dinámico de resultados.
  - **Buscador de Permisos en Modal:** Input de filtrado reactivo dentro del modal de edición que busca por nombre descriptivo, clave técnica o canal (`apk`, `bot`, `portal`, `erp`), expandiendo automáticamente las categorías coincidentes.
  - **Indicador Visual de Categorías Activas:** Cada grupo de permisos colapsable (`<details>`) despliega un badge verde esmeralda con el conteo exacto de permisos asignados (ej. `✓ 3 de 6 activos`), facilitando identificar qué módulos tiene habilitados un rol sin tener que abrir cada sección.
  - **Insignias de Ámbito / Canal:** Se agregaron badges visuales con íconos para distinguir los permisos exclusivos de la **📱 APK Clic Driver** (`deliveries:write`, `deliveries:revert`, `deliveries:collect`, `users:edit:erp-alias`), del **🤖 Bot Telegram / IA** (`ai:access`, `ai:analytics:query`, `ai:financial:query`) y del **🌐 Portal Chofer Web** (`operaciones_chofer_web`).
- **[PERMISOS / SEGURIDAD] Control Granular de Alias ERP y Reorganización en Roles (`/dashboard/admin/roles`):**
  - Se incorporó el permiso granular `users:edit:erp-alias` (*Perfil: Editar Alias de Usuario (ERP)*) dentro del grupo **Acceso General**, permitiendo bloquear la edición del alias ERP a usuarios no autorizados tanto en la interfaz (`/dashboard/profile`) como en el backend (`updateOwnProfile`).
  - Se trasladó el permiso `admin:import:run` (*Admin: Ejecutar Sincronización ERP*) del grupo de administración a **Acceso General**, facilitando su concesión a roles operativos sin necesidad de brindar acceso administrativo global.
- **[NUEVO / UX] Distintivo Visual de Ambiente de Pruebas (Rojo Vino / Burgundy):** Cuando el nombre del sistema (configurado en `/dashboard/admin/general`) contiene palabras clave como `"prueba"`, `"pruebas"`, `test` o `demo`, la interfaz tiñe automáticamente el nombre del sistema en color rojo vino/borgoña (`#881337`), desplegando badges distintivos (`🧪 AMBIENTE DE PRUEBAS`) en el Sidebar, Header, pantalla de Login y formulario general para evitar confusiones operativas entre copias de prueba y producción.
- **[NUEVO / AUDITORÍA] Bitácora Operativa del Chofer en '📱 Registros APK' (`/dashboard/operations/logistics/deliveries`):** Transformación completa de la pestaña en una herramienta de supervisión y auditoría de ruta en tiempo real. Permite al supervisor auditar con fecha, hora exacta, placa y chofer eventos críticos: 🚨 **Reversiones de entregas** (alerta de manipulación de estado), ✅ **Entregas procesadas** (con desglose de evidencias: firma, foto de entrega, foto de factura física o entregas sin evidencia), 🖨️ **Reimpresiones térmicas**, ☕ **Pausas y descansos** (con cálculo de exceso de tiempo) y 🛠️ **Averías reportadas**. Incluye tarjetas de métricas rápidas y filtros ejecutivos.
- **[UX / MÓVIL] Modo Consulta 'Ver Procesado' (Solo Lectura) en APK:** Cuando una entrega ya fue procesada, `DeliveryProcessScreen` entra automáticamente en modo solo lectura para proteger las firmas y cantidades, precargando la firma digital y habilitando el botón de reimpresión de recibos térmicos.
- **[ADMINISTRACIÓN] Reorganización de Ajustes en `/dashboard/admin/operations/deliveries`:** Migración de opciones móviles exclusivas (reversión de entregas, sincronización en segundo plano, chofer en espera y método de impresión) a la pestaña dedicada "📱 APK Nativa".
- **[DOCUMENTACIÓN] Centro de Ayuda (`/dashboard/help`):** Publicación de minitutoriales para principiantes en logística, configuración de despacho, herramientas de TI e integración directa con el Manual Interactivo (`/docs/Manual.html`).
- **[MOTOR UNIFICADO / PIPELINE] Reordenamiento Estricto de Sincronización:** Se unificó el motor de sincronización en `SyncEngine.runFullSync` ejecutado tanto en primer plano como en segundo plano. El pipeline asegura: 1. Failover y chequeo de salud de URL ➔ 2. Subida prioritaria de entregas y eventos offline ➔ 3. Descarga de asignaciones y entregas ➔ 4. Sincronización de configuraciones y políticas MDM ➔ 5. Telemetría de batería y hardware ➔ 6. Subida de logs técnicos desde SQLite.
- **[BACKGROUND / NOTIFICACIONES] Notificación Nativa de Nuevas Facturas y Recolectas en Ruta:** Al detectar nuevos documentos recibidos en segundo plano (con la pantalla apagada o con el chofer navegando en Waze/Maps), `SyncEngine` emite una notificación nativa en Android con canal prioritario `IMPORTANCE_HIGH`, vibración, sonido predeterminado y texto expandible identificando si son entregas (`📦 Nuevas Facturas Asignadas`) o retiros (`🔄 Nueva Recolecta Asignada`).
- **[REACTIVIDAD / LIFECYCLE] Refresco Inmediato al Reanudar la App:** Implementación de `WidgetsBindingObserver` en `DashboardScreen` (`didChangeAppLifecycleState: resumed`) para refrescar en el acto la UI desde SQLite local sin recargas pesadas ni requerir cierre de sesión del chofer.
- **[CONTROL WEB] Selector de Intervalo de Sincronización en Segundo Plano:** En `/dashboard/admin/operations/deliveries` (Parámetros de la APK) se habilitó el control numérico para configurar centralizadamente el intervalo en minutos (`apk_background_sync_minutes`, mín. 5 min).
- **[TELEMETRÍA / HARDWARE] Extracción Robusta de IMEI/MEID en Android 10+:** Permisos `READ_PHONE_STATE` y `READ_PHONE_NUMBERS` en `AndroidManifest.xml` con fallback en cascada en `MainActivity.kt` (`tm.getImei(0)` → `tm.imei` → `tm.meid` → `tm.deviceId`) aprovechando privilegios de Device Owner.
- **[TELEMETRÍA / CALIDAD] Monitoreo de Voltaje (V), Salud y Tecnología de Batería:** Telemetría en vivo de voltaje, salud (`Buena / Óptima`, `Sobrecalentada`, `Degradada`) y tecnología química (`Li-ion`) visible en `/dashboard/it-tools/mobile`.
- **[PERSISTENCIA] Logs Técnicos Indestructibles en SQLite:** Creación de la tabla local `app_logs` en `OfflineDbService` para unificar el guardado de eventos entre hilos y garantizar la subida del 100% de la bitácora hacia la web.

### Resilencia de Conexión en Caliente y Sincronización Manual (APK Clic Driver v1.2.6 - Build 25)
- **[CORRECCIÓN / RESILENCIA] Refresco en Caliente de URL Activa en Memoria:** Se corrigió una discrepancia donde `_forceManualSync` e interfaces del Drawer podían utilizar una dirección IP en caché si el servicio en segundo plano había conmutado automáticamente por Failover. Ahora `_loadData` y `_forceManualSync` consultan en vivo la URL activa conmutada desde SQLite antes de cualquier llamada HTTP.
- **[CORRECCIÓN] Heartbeat con URL Efectiva:** La telemetría periódica y el registro de versiones en segundo plano (`POST /api/fleet/app-version`) ahora se envían directamente a la URL que superó el chequeo de salud activo, eliminando timeouts residuales con IPs anteriores.
- **[VERSIÓN] APK 1.2.6+25:** Versión actualizada en `pubspec.yaml`, `config.dart` y panel de administración OTA.

### Fijado Dinámico de Aplicaciones y Menú Inteligente de Ruta (APK Clic Driver v1.2.5 - Build 24)
- **[NUEVO] Fijado Dinámico de Apps en Herramientas de Ruta:** En `/dashboard/it-tools/mobile` (modal Gestor de Aplicaciones & Blindaje), se añadió el selector `📌 Fijar / En Ruta` para cada aplicación del teléfono. El administrador puede fijar de forma individual y granular los accesos directos autorizados (ej: Waze, Google Maps, WhatsApp, Teléfono, Cámara, etc.), persistidos en la base de datos central (`mdm_pinned_apps`) y entregados al dispositivo mediante `/api/fleet/device-config`.
- **[UX] Ocultamiento Inteligente del Menú de Ruta en la APK:**
  - **Kiosco Apagado y Sin Apps Fijadas:** La sección completa *Herramientas de Ruta* se **oculta automáticamente**, dejando el menú lateral limpio, despejado y enfocado en la operativa de entrega.
  - **Apps Fijadas por el Administrador:** Muestra exclusivamente las aplicaciones fijadas con su título, icono temático y apertura directa vía `launchPackage`.
  - **Kiosco Activo y Sin Apps Fijadas:** Despliega el catálogo seguro esencial de navegación y comunicación (*Waze, Maps, Teléfono, WhatsApp, Cámara*) para garantizar la movilidad del chofer en modo restringido.
- **[UX / CALIDAD] Rediseño Compacto de Tabla de Flota TI:** Se optimizó `/dashboard/it-tools/mobile` reduciendo el ancho de `1350px` a `1050px`, fusionando las columnas de *Versión*, *Estado OTA* y *Última Conexión* en una sola columna limpia `Versión & Conexión`, y compactando los botones de localización a `GPS`.
- **[VERSIÓN] APK 1.2.5+24:** Versión actualizada en `pubspec.yaml`, `config.dart` y panel de administración OTA.

### Alta Disponibilidad de Servidor (Failover Automático) y Blindaje MDM (APK Clic Driver v1.2.4 - Build 23)
- **[NUEVO] Conmutación Automática (Failover) de Servidor:** Arquitectura de alta disponibilidad para la flota móvil. En `/dashboard/it-tools/mobile` se introdujo la configuración centralizada de **URL Primaria** y **URL de Respaldo / Fallback**. El motor de sincronización (`SyncEngine.runFullSync` y `BackgroundSyncService`) monitorea la salud de la URL activa mediante `ApiService.checkServerHealth` (< 4s); si la conexión falla o expira por timeout, conmuta automáticamente a la URL Fallback sin detener las operaciones del chofer y se auto-recupera cuando la Primaria vuelve a estar disponible.
- **[CALIDAD] Persistencia Indestructible en SQLite Local:** Ambas URLs (`server_url_primary` y `server_url_fallback`) y la activa se almacenan en la tabla permanente `system_config` de SQLite local del teléfono (`OfflineDbService.saveServerUrlsConfig`). Esto garantiza que la IP nunca se revierta a valores predeterminados de fábrica tras un cierre de sesión, arranque temprano o actualización del sistema.
- **[UX / CALIDAD] Prohibición de Avisos Nativos del Navegador (`AlertDialog` del Sistema):** Se reemplazaron todos los `window.confirm()` y `window.alert()` del navegador en `/dashboard/it-tools/mobile` por componentes modales `AlertDialog` nativos de Shadcn/Radix integrados con tema oscuro/claro para la confirmación de desinstalación de apps, reinicio remoto por hardware y eliminación de dispositivos de la flota.
- **[UX] Feedback Visual Inmediato al Marcar Apps para Desinstalar:** Al solicitar la desinstalación remota de una app, su tarjeta se resalta en tono rojizo (`border-rose-400`), su nombre se tacha (`line-through`), muestra una insignia animada `🗑️ Encolada para Desinstalar` y el botón cambia a `Marcada` (deshabilitado).
- **[SEGURIDAD] Candado de Protección Total para Aplicaciones Vitales del Sistema:** Se bloquearon permanentemente contra suspensión o desinstalación los paquetes críticos del sistema operativo (`com.sec.location.nfwlocationprivacy`, `incallui`, `dialer`, `settings`, `telecom`, `systemui` y lanzadores), mostrando la insignia fija `🔒 Vital / Intocable` y etiqueta `🔒 Siempre Activa` sin switch manipulable.
- **[VERSIÓN] APK 1.2.4+23:** Versión actualizada en `pubspec.yaml`, `config.dart`, `schema.ts` y tabla `ops_app_version_settings` para su distribución OTA.

### Sincronización Automática en Segundo Plano de la APK Clic Driver (v1.0.8)
- **[NUEVO] Servicio en primer plano de sincronización automática:** Se integró `flutter_background_service` en la APK para ejecutar ciclos periódicos de sincronización bidireccional con el servidor central **aunque la app esté minimizada**: heartbeat/telemetría (`POST /api/fleet/app-version` → mantiene `last_seen`), descarga de entregas/recolectas (`GET /api/fleet/driver-routes`), envío de la cola offline (entregas + eventos `driver-actions`), re-registro del dispositivo (`device-config`) y subida de logs (`/api/fleet/logs`).
- **[UX] Intervalo configurable desde administración:** Nueva opción **"Sincronización Automática en Segundo Plano"** en `/dashboard/admin/operations/deliveries → Configuración Remota de APK Nativa` (`apk_background_sync_minutes`). Validación de **mínimo 5 minutos** en UI y servidor (`updateDeliverySettings`). El APK usa 5 min por defecto hasta recibir la configuración remota (`/api/fleet/config`), y reajusta su timer en vivo.
- **[CALIDAD] Motor de sincronización compartido:** Se extrajo la lógica a `lib/services/sync_engine.dart` (`runFullSync`) reutilizada por la sincronización manual y el servicio en segundo plano, eliminando duplicación. El HWID se persiste en `SharedPreferences` para que el aislado de background lo lea.
- **[NUEVO] Vista de dispositivos enriquecida en it-tools:** `/dashboard/it-tools/mobile` ahora muestra las columnas **Impresora MAC** y **Última Conexión** (fecha/hora completa), complementando el indicador "En línea/Hace X min".
- **[VERSIÓN] APK 1.0.8+7** (pubspec, `config.dart` y `ops_app_version_settings`): versión objetivo actualizada en los 3 archivos para distribución OTA.

### Asignación de Activos TI con Usuarios del Sistema y Alerta de Colaboradores Inactivos
- **[CORRECCIÓN] Ficha del Activo vacía en activos de flota auto-registrados:** Los dispositivos móviles registrados automáticamente desde la APK (`/api/fleet/device-config`) quedaban con `id = NULL` en `it_assets` cuando la tabla existía con la columna `id` en formato TEXT (no autoincremental). Esto impedía cargar la Ficha del Activo (detalles, componentes, licencias e historial), ya que `getItAssetById(null)` no retornaba nada. Se agregó la **migración v3** en el seeder de IT-Tools que backfillea los ids con el `rowid` de SQLite (idempotente), y el endpoint `device-config` ahora asigna explícitamente el id del `rowid` al auto-registrar un dispositivo.
- **[UX] Dropdown de asignación basado en usuarios del sistema:** El modal **"Asignar Activo de TI"** de `/dashboard/it-tools/assets` ahora lista **solo los usuarios del sistema** (`core_users`, la lista de `/dashboard/admin/users`) activos, en lugar de la mezcla anterior de empleados de planilla + usuarios. Esto mantiene la asignación ligada por `user_id` a `/dashboard/profile` → **"Mis Herramientas de Trabajo & Activos"**. Se eliminó la carga de `payrollEmployees` (dato no utilizado).
- **[ALERTA] Detección de colaboradores inactivos con equipos asignados:** `getItHrAlerts` ahora también detecta asignaciones de tipo `system_user` cuyo usuario está inactivo (`is_active = 0`) o cuyo empleado vinculado al ERP (`core_employees.ACTIVO = 'N'`) fue dado de baja. Las asignaciones activas se conservan hasta que el administrador de TI las desasigne.
- **[CORRECCIÓN] Botones "Reasignar" y "Devolver a Bodega" del banner de alertas:** Ahora resuelven correctamente el id del activo (`asset_id`) al dispararse desde la alerta de colaboradores inactivos, cargando los detalles y registrando la reasignación/devolución como corresponde.
- **[CALIDAD] Sincronización de usuarios con empleados del ERP:** En el import de empleados (`saveAllEmployees`, `/dashboard/admin/import` → "Consulta para Empleados (RRHH)") se agrega una sincronización que **desactiva automáticamente** (`is_active = 0`) a los usuarios del sistema vinculados a empleados que el ERP marca inactivos. Solo desactiva (nunca reactiva); la reactivación se hace manualmente en `/dashboard/admin/users`.

### Notificaciones de Pedidos y Entregas por Telegram para Vendedores y Creadores ERP
- **[ESQUEMA DE BASE DE DATOS Y USUARIOS] Columna `telegramChatId` y Migración v13:** Se agregó el campo opcional `telegramChatId` en la tabla `core_users` y en las interfaces/esquemas Zod de gestión de usuarios (`/dashboard/admin/users`), permitiendo asignarle directamente un Telegram Chat ID a los usuarios del sistema además de la vinculación interactiva del bot (`fleet_telegram_linkages`).
- **[HELPER DE BÚSQUEDA TELEGAM] Módulo `telegram-lookup.ts`:** Creación de la función `getTelegramChatIdForUser` que resuelve dinámicamente el `chat_id` correspondiente buscando en tres niveles: (1) `telegramChatId` directo en `core_users`, (2) vinculación en `fleet_telegram_linkages` por `employeeId`, (3) usuario asociado al código de vendedor `salespersonId`.
- **[CORRECCIÓN EN FLUJO DE ENTREGAS INCOMPLETAS / RECHAZADAS] `delivery-service.ts`:** Se ajustó la bandera `entregadoFlag = 1` al reportar entregas incompletas o rechazadas. Esto mueve de inmediato el documento procesado a la sección **"Procesados Hoy"** del portal del chofer, habilitando la impresión de la boleta de faltante en impresoras térmicas de 80mm/57mm, la descarga del PDF y el reenvío por correo.
- **[CORRECCIÓN DE FUGA DE TEXTO CSS Y DESCARGA DE BOLETA] `actions.ts` & `DriverDeliveriesTab.tsx`:** 
  - Se eliminó el reemplazo erróneo que imprimía `style { display: none !important; }` como texto físico visible en la parte superior de las boletas y correos de rutas.
  - Se separaron los botones en el modal de la Boleta: **`📥 Descargar Documento Boleta`** (descarga directamente el archivo a almacenamiento local sin abrir diálogos) y **`🖨️ Imprimir Hoja Completa`** (ejecuta la impresión limpia directamente desde el marco iFrame del documento).
  - **Consecutivo Oficial de Boletas de Entrega (`boleta_consecutive_prefix` / `boleta_consecutive_next`):** Se implementó la generación automática y configurable de números correlativos oficiales para las boletas de entrega en choferes (ej. `BOL-000001`), administrable centralizadamente desde `/dashboard/admin/operations/deliveries`.
  - **Paridad Mutua de Impresión en Chrome y Firefox Android:** Se unificó el viewport en `width=576` con `font-size: 17px` y `text-size-adjust: 100%`. Esto logra que Mozilla Firefox no reduzca la boleta a tamaño diminuto y que Google Chrome mantenga el diseño elegante con el tamaño ideal sin desbordamientos.
  - **Compatibilidad de Impresión Chrome vs Firefox (ESCPrint Service / 3nStar):** Se eliminó la propiedad CSS `zoom: 1.6` que Google Chrome interpretaba multiplicando el tamaño de texto a niveles gigantescos, y se aplicó `-webkit-text-size-adjust: none` con una escala de fuentes base unificada. Esto garantiza que la boleta impresa desde el navegador Chrome o Firefox se renderice con idéntico tamaño elegante y proporciones perfectas.
  - **Integración de Impresión Nativa sin RawBT (`Clic Print Connector` & `Clic Print Intent`):** Se implementó la dualidad de botones de impresión en las boletas térmicas (`actions.ts`): **`⚡ Imprimir Clic Direct (Opción 1)`** (puente JS nativo a 1 solo toque) y **`🚀 Imprimir Clic Intent (Opción 2)`** (esquema `clicprint://` para uso desde Google Chrome sin pagar apps de terceros).
  - **Selector de Método de Impresión Térmica en Administración (`/dashboard/admin/operations/deliveries`):** Se agregó el parámetro configurable `driver_boleta_print_method` para elegir si los choferes ven todas las opciones simultáneamente o únicamente su método preferido (Opción 1, Opción 2, RawBT o Todos).
  - **Estructura de Almacenamiento Público de APKs (`/public/downloads/apk/`):** Se creó el directorio web público permanente `/public/downloads/apk/` para alojar los instaladores nativos descargables (`ClicPrint_Connector_v1.0.apk` y `ClicPrint_Intent_v1.0.apk`) directamente desde la plataforma.
  - Se vinculó dinámicamente la información de la empresa registrada en **/dashboard/admin/general** (`getCompanySettings()`) a los encabezados de todas las boletas térmicas, documentos PDF e **Hojas de Ruta de Distribución** (`/dashboard/operations/logistics/deliveries/route-sheets`), mostrando automáticamente el **Nombre de la Empresa**, **Cédula Jurídica**, **Dirección**, **Teléfono** y **Correo Electrónico**.
- **[DESPACHO AUTOMÁTICO DE NOTIFICACIONES] Integración en `delivery-service.ts` & `actions.ts`:** En los eventos de actualización de entrega (Rechazado, Entregado Completo o Incompleto) y en el cierre/actualización de **Solicitudes de Recolecta** (`/dashboard/operations/logistics/collect`), el sistema envía notificaciones enriquecidas por Telegram directamente a los vendedores, creadores ERP y solicitantes del retiro.

### Matriz de Compatibilidad de Repuestos, SKU de Fábrica, Catálogo de Marcas e Integración en Tickets y Taller
- **[CATÁLOGO DE MARCAS DE REPUESTOS] Administración Centralizada (`/dashboard/admin/inventory`):** Adición de la tarjeta de administración *"🏷️ Catálogo de Marcas de Repuestos / Refacciones"* para gestionar marcas maestras de piezas, filtros y aceites (`inv_part_brands`).
- **[MATRIZ DE COMPATIBILIDAD DE FLOTA] Tabla `inv_item_compatibilities`:** Vinculación relacional de repuestos de bodega (`inv_items`) contra marcas de vehículo (ej. Freightliner, Isuzu, Hino, Toyota), modelos (ej. M2 106, NPR) y placas/IDs de camión de la flota (ej. `C123456`).
- **[HERRAMIENTA ASISTENTE DE TALLER] Asistente de Compatibilidad (`/dashboard/inventory`):** Nuevo buscador interactivo para mecánicos y jefes de taller *"🔍 Asistente de Compatibilidad Taller & Flota"*. Permite seleccionar un vehículo o digitar un SKU de fábrica y devuelve de inmediato los repuestos compatibles en stock, su ubicación en estantería y stock disponible.
- **[FILTRADO INTELIGENTE EN TICKETS DE REPARACIÓN] Integración en `/dashboard/tickets`:** El selector de vincular repuesto de bodega destaca automáticamente los repuestos e insumos compatibles con el vehículo del ticket (con insignia verde `✅`), incluyendo un interruptor para alternar entre sólo compatibles o el catálogo completo de bodega.
- **[OPTIMIZACIÓN Y RECALCULO DE FLOTA] Mantenimientos, Aceite y Reportes (`/dashboard/fleet` & `/dashboard/fleet/reports`):**
  - Corrección de consultas SQL SQLite `MAX(IFNULL(currentMileage, 0), ?)` para evitar valores nulos tras actualizar consumos o mantenimientos.
  - Robustecimiento del algoritmo `isOilChange` para detectar automáticamente palabras clave de aceite, filtros y lubricantes en tipo y descripción.
  - Corrección en el filtro de fecha límite `matchesTo` en reportes de flota para incluir registros generados durante el día (`T23:59:59.999`).
  - Migración al motor centralizado `exportToExcel` en `/dashboard/fleet/reports` cumpliendo con los estándares de la Regla 4.

### Boletas de Entrega Unificadas, Impresión Térmica Bluetooth (80mm/57mm), Opciones Móviles y Reversión con RBAC

- **[UNIFICACIÓN Y BOLETA INSTITUCIONAL] Rediseño de Boletas & Notificaciones (`actions.ts` & `db.ts`):** Unificación del formato de la "Boleta de Entrega" (pantalla, PDF y correos de notificación `onDeliveryPartial` y `onDeliveryRetry`). Incluye distintivo visual de estado por color (🟢 Completo, 🟡 Incompleto, 🔴 Rechazado, 🔵 Recolecta), desglose estructurado de artículos faltantes (`ops_delivery_lines`), firma digital del cliente (`firma_cliente`), nombre de la persona que recibe (`nombre_recibe`), chofer, ruta y enlace navegable directo a Google Maps con las coordenadas GPS de confirmación.
- **[IMPRESIÓN TÉRMICA & BLUETOOTH ANDROID] Formato Imprimible en Recibo (80mm / 57mm):** Nuevo generador de boleta imprimible `getBoletaThermalPrintHtml` optimizado para impresoras térmicas de papel continuo tipo Epson TMU (80 mm) y Datáfonos/POS (57 mm). Incluye botón de disparo rápido con Intent Android para la aplicación RawBT / Bluetooth Print (`intent://...`), permitiendo a los choferes imprimir recibos físicos directamente desde sus teléfonos Android vinculados a impresoras Bluetooth portátiles (NOVA FFP4080B001C y similares).
- **[CONFIGURACIÓN ADMINISTRATIVA] Panel de Opciones de Boletas (`/dashboard/admin/operations/deliveries`):** Nueva tarjeta de parámetros para activar o desactivar independientemente las acciones del portal móvil del chofer (`driver_boleta_pdf_enabled`, `driver_boleta_email_enabled`, `driver_boleta_print_enabled`) y selector para definir el ancho del papel térmico de la empresa (`80mm` vs `57mm`).
- **[REVERSIÓN DE ENTREGAS & PERMISO RBAC] Control Granular (`deliveries:revert`):** Adición del nuevo permiso `deliveries:revert` (*"Entregas: Revertir Estado de Entregas Procesadas"*) registrado en la gestión de roles. En el portal móvil del chofer (`/dashboard/operations/logistics/driver`), la opción de revertir se encuentra disponible **únicamente mientras la ruta de entregas continúe activa (`activa === 1`)**. Tras finalizar la jornada, la reversión queda bloqueada en el móvil y disponible solo desde el Centro de Control para personal autorizado.

### Portal Web Móvil para Choferes (Transportes, Recolectas, Averías y Firma Digital)

- **[NUEVO MÓDULO WEB] Portal Web de Choferes (`/dashboard/operations/logistics/driver`):** Se creó el nuevo módulo web móvil optimizado para celulares conectados vía OpenVPN. Permite a los choferes gestionar el 100% del ciclo de vida de rutas en la calle si Telegram no está disponible.
  - Se optimizó el espacio vertical de la Boleta Térmica (márgenes, interlineado y alto de firma táctil a `70px`), logrando que todo el contenido impreso (incluyendo la firma y la leyenda de agradecimiento) quepa holgadamente en **1 sola página (1/1)** en las aplicaciones de impresión móvil (como ClicPrint / Android Print Service).
  - **Firma Digital en Pantalla Táctil (`SignatureCanvas.tsx`):** Componente interactivo `<canvas>` para recabar la firma táctil del cliente en la pantalla del celular durante la entrega de pedidos, almacenando la evidencia en `ops_delivery_queue` (`firma_cliente`) y adjuntándola a las notificaciones por correo.
  - **Geolocalización GPS Híbrida (`driver-actions.ts`):** Esquema de captura en 3 niveles que consulta primero la telemetría del camión en tiempo real desde Navixy API (`gps-service.ts`), luego el GPS del celular navegador (`navigator.geolocation`), y finalmente permite la captura manual auditada.
  - **Operaciones de Entrega y Recolecta:** Asignación de ruta/vehículo, inicio/salida a ruta, auto-carga de facturas, procesamiento completo, incompleto con desglose de ítems y faltantes, rechazado con re-inyección automática, carga de fotografías de evidencia/factura con cámara móvil y reporte rápido de averías de flota.
  - **Gestión Granular de Permisos:** Adición del permiso `operaciones_chofer_web` (*Operaciones: Portal Web Móvil Choferes*) en la matriz de roles (`permissions.ts`) y enlace directo "🚚 Portal Chofer" en el encabezado principal de navegación.

### Auto-reparación de Esquema IA (Configuración de Sinónimos y Parámetros)

- **[CORRECCIÓN DB] Faltante de Columna 'synonyms' en `core_ai_settings`:** Se corrigió la discrepancia en el esquema donde `core_ai_settings` no incluía la definición de las columnas `synonyms`, `aiMemory`, `adaptTechnicalLevel` y `strictSafetyRules` en la creación de tabla base `CORE_TABLES`. Se agregó auto-reparación (self-healing) activa al inicializar la base de datos en [`db-conn.ts`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/src/modules/core/lib/db-conn.ts) y en [`db.ts`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/src/modules/core/lib/db.ts) (`getAiSettings` y `saveAiSettings`), garantizando que la estructura SQLite en disco añada automáticamente cualquier columna faltante al guardar o consultar las configuraciones de IA.

### Blindaje de Serialización de Datos (Next.js Server Actions)

- **[CORRECCIÓN CRÍTICA] Error 'Only plain objects':** Se solucionó de raíz el error generalizado que afectaba a la mayoría de los módulos de la aplicación (incluyendo GPS y Logística). El problema ocurría porque el proveedor de autenticación global (`AuthProvider`) invocaba la acción `getInitialAuthData`, la cual retornaba múltiples registros directos de la base de datos (SQLite) conservando sus prototipos. Se implementó una capa de sanitización estandarizada (`JSON.parse(JSON.stringify(...))`) en funciones clave de la base de datos (`getApiSettings`, `getAiSettings`, `getExemptionLaws`, `getAllCustomers`, `getAllSuppliers`, `getImportQueries`, `getCabysCatalog`, `getAllErpPurchaseOrderLines`, `getAllActiveBotStates`) asegurando que toda la comunicación entre Servidor y Cliente utilice exclusivamente objetos planos, cumpliendo estrictamente con los requisitos de serialización de Next.js App Router.

### Integración de Telemetría GPS (Navixy API v2) y Monitor de Estados de Flota

-   **[MEJORAS UX & AUDITORÍA LOGÍSTICA] Indicador OTIF, Notas de Chofer y Búsqueda por Factura:**
    -   **Explicación OTIF (`/dashboard/operations/logistics/analytics`):** Adición de la definición en español de OTIF (*On-Time In-Full / Entregas Completas y a Tiempo*) con ícono interactivo de ayuda.
    -   **Notas del Chofer en Auditoría (`/dashboard/operations/logistics/audit`):** Nueva columna en la tabla de Resultados de Auditoría para visualizar comentarios y observaciones del chofer (`💬 Nota Chofer`).
    -   **Carga en Segundo Plano sin Bloqueo (`/dashboard/operations/logistics/deliveries`):** Se eliminó la pantalla de carga bloqueante en el Monitor de Entregas. Ahora la interfaz y las pestañas abren de inmediato mientras la telemetría actualiza en segundo plano con un indicador discreto.
    -   **Filtro por Factura en Historial (`HistoricalDeliveriesTab.tsx`):** Nuevo campo de entrada en el Historial de Entregas para filtrar instantáneamente por número de factura o nombre de cliente.
    -   **Blindaje de Serialización (`gps-actions.ts`, `gps-service.ts`, `auth.ts` & `actions.ts`):** Sanitización con `JSON.parse(JSON.stringify(...))` en `getCurrentUser` (corrigiendo la persistencia de prototipos de base de datos en sesiones de usuario), `getLiveTelemetryAction`, `fetchNavixyLiveTelemetry` (limpiando `rawState` de trackers) y `getDeliverySettings`, erradicando el error `Only plain objects`. Se incorporaron los métodos `validateTelemetryStructure` y `testSerialization` en [`gps-service.ts`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/src/modules/fleet/lib/gps-service.ts#L246) para auditar y garantizar la integridad de transferencia.
-   **[CORRECCIÓN SINTAXIS SCRIPTING & SANITIZACIÓN SQLITE] Corrección "Only Plain Objects" y Cierre de Plantilla (`actions.ts` & `analytics/page.tsx`):**
    -   Se corrigió el cierre del literal de plantilla en `getHistoricalAssignments` ([`actions.ts`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/src/modules/operations/lib/actions.ts#L304)), restaurando el parseo de sintaxis TypeScript en todo el archivo.
    -   Se auditó y blindó el retorno de todas las consultas SQLite con `JSON.parse(JSON.stringify(...))`: `getActiveAssignments`, `getHistoricalAssignments`, `getGeneralQueue`, `getAssignedDeliveriesToday`, `getSystemUsers`, `getUserCollectRequests`, `getFinalizedRoutesReport`, `getDrivers` y `getVehicles`.
-   **[PERSISTENCIA HISTÓRICA GPS NAVIXY] Sincronización Automática a Base de Datos (`gps-service.ts`):** Toda coordenada e hito de telemetría devuelto por Navixy API v2 para unidades activas se almacena automáticamente en la tabla SQLite `ops_delivery_gps_logs` asociándolo a la asignación de ruta diaria. Esto permite realizar reproducciones de ruta y auditorías históricas permanentes.
-   **[NUEVO] Conector Navixy GPS (`src/modules/fleet/lib/gps-service.ts`):** Integración nativa con la API v2 del proveedor para rastreo en tiempo real mediante coincidencia de placa (`fleet_vehicles.plate`), sin necesidad de interacción por Telegram.
-   **[NUEVO] Geocodificación Inversa con Caché (`geocoding-service.ts`):** Conversión de coordenadas lat/lng a nombres de distrito/cantón/provincia mediante Nominatim (OSM) con umbral de 200 metros.
-   **[NUEVO] Parámetros en Administración (`/dashboard/admin/api` y `/dashboard/admin/operations/deliveries`):** Gestión de credenciales Navixy, selector de fuente (*Telegram*, *GPS Navixy*, *Híbrido*), alertas de estadía en cliente, geofence de parqueo y la nueva tarjeta **Configuración del Monitor de Estados GPS & Tour** (Modo Predeterminado, Tiempo Tour, Zoom Tour, Frecuencia AutoAjuste, Umbral Geocodificación e Intervalo UI).
-   **[NUEVA FUNCIONALIDAD NOTIFICACIÓN DE ARRIBO A CLIENTES] Configuración de Correo por Dirección & Plantilla HTML (`/dashboard/clientes` & `/dashboard/admin/automations`):**
    -   **Migración DB (v11):** Adición de la columna `email_notificacion TEXT` a `core_customer_shipment_addresses` en `schema.ts`.
    -   **Gestión en Clientes (`/dashboard/clientes`):** Editor de "GPS & Email" por cada Dirección de Embarque (EMB), permitiendo asociar correos para avisos automáticos de arribo.
    -   **Diseño de Mensaje HTML en Motor de Automatizaciones:** Registro del evento `onDeliveryArrivalGeofence` en `/dashboard/admin/automations` (Diseño Mensajes) con diseño HTML nativo editable y variables dinámicas.
-   **[AJUSTE UI & MAQUETACIÓN] Reestructuración del Panel de Filtros (`route-sheets/page.tsx`):** Se ajustó la rejilla de filtros a 5 columnas adaptativas (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`) y se ubicaron los botones **"Limpiar Filtros"** y **"Buscar Hojas de Ruta"** en una barra inferior alineada a la derecha, corrigiendo el desbordamiento horizontal.
-   **[INTEGRACIÓN MAPA GPS] Rastreo Satelital en Mapa Interactivo (`deliveries/map` & `actions.ts`):** Confirmada la integración directa del mapa cartográfico con el motor centralizado de GPS (Navixy/Híbrido) para la visualización de vehículos en tiempo real.
-   **[RENDIMIENTO & BÚSQUEDA BAJO DEMANDA] Hojas de Ruta (`route-sheets/page.tsx` & `actions.ts`):** Transformación del módulo de Hojas de Ruta a búsqueda estrictamente bajo demanda con botón **"Buscar Hojas de Ruta"**, evitando consultas automáticas al cargar la vista. Se sanitizaron además las respuestas de `getDeliveryRoutes()`, `getDrivers()` y `getVehicles()` con `JSON.parse(JSON.stringify(...))` para prevenir errores de serialización Next.js.
-   **[NORMATIVA DE DESARROLLO AGENTS.MD] Directiva Obligatoria para Exportación a Excel (`AGENTS.MD`):** Incorporación formal en `AGENTS.MD` de la regla estricta que exige el uso exclusivo del motor centralizado `exportToExcel` (`src/modules/core/lib/excel-export.ts`) para la descarga de reportes `.xlsx` en todos los submódulos actuales y futuros.
-   **[MOTOR DE EXPORTACIÓN EXCEL REUTILIZABLE] Generador Nativo `.xlsx` (`excel-export.ts`):** Actualización del motor centralizado de exportación a Excel en `src/modules/core/lib/excel-export.ts` con auto-cálculo dinámico del ancho de columnas y formato nativo SheetJS (`.xlsx`). Integrado en el Centro de Auditoría de Logística (`audit/page.tsx`).
-   **[NUEVO EXPORTADOR EXCEL REPORTE AUDITORÍA] Ampliación de Columnas y Sin Truncado (`audit-actions.ts`):** La exportación a Excel en el Centro de Auditoría ahora exporta hasta 10,000 registros filtrados incorporando las columnas: `Documento`, `Estado`, `Cliente ID`, `Nombre Cliente`, `Chofer`, `Vehiculo / Placa`, `Ruta`, `Vendedor ERP`, `Creador ERP`, `Fecha Registro`, `Hora Arribo`, `Hora Entrega`, `Hora Salida`, `Minutos Descarga/Espera`, `Evidencias (Fotos)`, `Comentario de Calle` y `Direccion Embarque (EMB)`.
-   **[NUEVO PDF DEFENSIVO] Generador Directo de Expediente PDF (`audit/page.tsx`):** Se reemplazó el evento de impresión del navegador (`window.print()`) por una función cliente con `jsPDF` (`handleDownloadExpedientePdf`) que construye y descarga directamente el archivo `Expediente_Entrega_[Factura].pdf` listo para enviar al cliente.
-   **[CORRECCIÓN SERIALIZACIÓN NEXT.JS] Sanitización de Objetos SQLite (`actions.ts` & `audit-actions.ts`):** Solución al error `Only plain objects, and a few built-ins, can be passed to Client Components` sanitizando las filas retornadas por `better-sqlite3` mediante `JSON.parse(JSON.stringify(...))`.
-   **[RENDIMIENTO & PAGINACIÓN AGENTS.md] Reingeniería de Rendimiento en Logística:**
    -   **Paginación SQL Servidor (`LIMIT ? OFFSET ?`):** Implementada en el Centro de Auditoría (`audit/page.tsx` y `audit-actions.ts`) y en Hojas de Ruta (`route-sheets/page.tsx` y `actions.ts`) con controles UI completos (`Página X de Y`, selector de items por página: `10`, `15`, `25`, `50`, `100`).
    -   **Carga de Componentes con `next/dynamic`:** Carga bajo demanda del Monitor GPS interactivo (`gps-monitor/page.tsx`) con `{ ssr: false }` para acelerar el tiempo de carga inicial y reducir el tamaño del bundle.
    -   **Optimización de Memoria:** Rendimiento mantenido al 100% en el monitor activo `/deliveries` tal como solicitó el usuario.
-   **[CORRECCIÓN SQL] Columna Vendedor en Auditoría (`audit-actions.ts`):** Solución al error `no such column: q.vendedor` realizando el `LEFT JOIN` hacia `core_erp_invoice_headers` y extrayendo el vendedor vía `COALESCE(h.VENDEDOR, q.creado_por)`.
-   **[CALIDAD ESLint] Reparación Activa en Módulo de Auditoría (`audit/page.tsx`):** Sustitución de etiquetas nativas `<img>` por el componente de Next.js `<Image unoptimized />`, escape de comillas JSX e inclusión de `useCallback` en las dependencias de `useEffect`.
-   **[CORRECCIÓN TS] Rutas de Importación de Módulos (`audit/page.tsx` & `audit-actions.ts`):** Corrección del hook `useToast` importándolo desde `@/modules/core/hooks/use-toast` y la función `authorizeAction` desde `@/modules/core/lib/auth-guard`.
-   **[CORRECCIÓN TS2339] Estado Inicial de Parámetros GPS (`deliveries/page.tsx`):** Solución al error TypeScript `TS2339` incorporando la propiedad `intervalo_consulta_gps` al estado inicial del componente de administración.
-   **[CORRECCIÓN] Errores de Consola en Servidor / SSR:** Solución al error de serialización `Only plain objects can be passed to Client Components` sanitizando objetos llanos en `getDeletedVehicles()` y manejo limpio de redirección `AuthError` en la página principal de Flota.
-   **[NUEVO] Tarjeta y Módulo "Monitor de Estados GPS" (`/dashboard/operations/gps-monitor`):** Integración completa del monitor de estados de flota, filtros por movimiento, mapa en vivo con Leaflet e inyección de script CDN y Modo Tour Animado.
-   **[NUEVO] Centro de Auditoría & Evidencias 360° (`/dashboard/operations/logistics/audit`):** Submódulo especializado de búsqueda multicriterio (por factura, cliente, chofer, placa o fechas), expediente interactivo de evidencia fotográfica/GPS y generador de exportación a Excel (.csv con BOM UTF-8) en 23 columnas operativas.
-   **[NUEVO] Submódulo de Analítica Logística & KPIs (`/dashboard/operations/logistics/analytics`):** Vista dedicada para medición del indicador OTIF global, promedios de tiempo de descarga en cliente, desglose de incidencias/rechazos y ranking de clientes por tiempo de retención.
-   **[NUEVO] Permisos Granulares de Analítica (`permissions.ts`):** Registro e integración de los permisos `deliveries:analytics:read` y `deliveries:analytics:read:all` para control de accesos y scoping por rol y alias ERP.
-   **[NUEVO] Modelo de Doble Odómetro Separado (`fleet_schema.ts`):** Incorporación de las columnas `odometro_manual`, `odometro_gps` y `discrepancia_odometro` en registros de combustible y mantenimientos para auditoría transparente sin mezclar datos.
-   **[NUEVO] Bloqueo de Asignación por Vehículo en Taller (`actions.ts`):** Validación en `createAssignment` que impide asignar a rutas de entregas aquellos camiones cuyo estado se encuentre en `maintenance` / `in_taller` en el módulo de Flota o Taller de Repuestos (Dept 1).
-   **[NUEVO] Ciclo de Vida de Tiempos en Cliente & Notificaciones Enriquecidas (`delivery-service.ts`):** Medición de las 3 marcas de tiempo clave por entrega (`hora_ingreso_geocerca`, `hora_entrega_efectiva` y `hora_salida_geocerca`), cálculo de minutos de descarga/espera en cliente y despacho de correos HTML enriquecidos.
-   **[NUEVO] Preferencias de Notificación por Cliente (`ops_client_emails`):** Soporte para activación/desactivación de avisos de llegada a bodega (`notificar_llegada`) por cliente y gestión de múltiples correos.
-   **[NUEVO] Guía Operativa y Modal de Ayuda GPS (`/dashboard/operations/logistics/deliveries`):** Integración del botón `Ayuda ❓` y modal interactivo con la explicación detallada de los 5 estados del vehículo (En movimiento, En la empresa, Detenido ralentí, Estacionado y Sin señal GPS), cálculo de duraciones y catálogo de apoyo.
-   **[NUEVO] Sección de Ayuda en Centro de Ayuda (`/dashboard/help`):** Incorporación del nuevo módulo de ayuda **"🚚 Manual Operativo: Gestión de Entregas y Rastreo GPS"** con tutoriales de uso del monitor, mapa satelital, hojas de ruta y configuración.
-   **[CALIDAD] Registro Centralizado de Eventos API Navixy (`/dashboard/admin/logs`):** Las consultas de telemetría, respuestas HTTP y estados del servidor GPS Navixy ahora se registran estructuradamente con el prefijo `[Navixy API]` en el visor central de auditoría y logs.
-   **[NUEVO] Reutilización de Fotos de Flota en Monitor GPS (`FullGpsMonitorView.tsx`):** Vinculación automática en tiempo real de la propiedad `photoUrl` de `fleet_vehicles` mediante coincidencia por placa. El recuadro flotante `#header-vehicle-card` del Monitor GPS consume las fotos existentes a través del endpoint `/api/fleet/files/[filename]`.

### Mono-Base de Datos y Normalización de Datos

-   **[NUEVO] Arquitectura Mono-Base de Datos (`clic_tools.db`):**
    -   Se ha unificado la persistencia de todos los módulos en un único archivo de base de datos SQLite.
    -   Simplifica drásticamente el proceso de copias de seguridad (backups), restauraciones y mantenimiento del servidor.
    -   Implementación de un **Singleton `getDb()`** para una gestión eficiente de conexiones.
    -   Prefijado automático de tablas por módulo (ej: `core_`, `wh_`, `pl_`, `req_`, `con_`) para evitar colisiones.
-   **[CALIDAD] Normalización Estricta de Identificadores:**
    -   **Mayúsculas para IDs de Negocio:** Todos los códigos de producto (`productId`), clientes (`customerId`) y proveedores (`supplierId`) se normalizan automáticamente a **MAYÚSCULAS** antes de guardarse.
    -   **Minúsculas para IDs de Sistema:** Los roles de usuario se normalizan a **minúsculas** para asegurar la consistencia en el control de acceso.
    -   Esta normalización previene la duplicidad de datos por diferencias de capitalización y asegura que las búsquedas relacionales sean 100% fiables.
-   **[SISTEMA] Orquestador de Migraciones Centralizado:**
    -   Se ha implementado un sistema que inicializa y migra los esquemas de todos los módulos de forma secuencial y atómica durante el arranque de la aplicación.
-   **[ESTABILIDAD] Corrección de Tipado en Importaciones:** Se han corregido errores de TypeScript en las funciones de importación del ERP y guardado de exenciones para soportar correctamente el manejo de fechas y normalización de strings.

### Estándares de Diseño y Responsivo

-   **[NUEVO] Estándar de Diseño Responsivo Premium (Mobile Bottom Sheet):**
    -   Implementación de un nuevo patrón de diseño adaptativo para secciones complejas y flujos de trabajo con pestañas (`Tabs`) en dispositivos móviles.
    -   En celulares y tablets pequeñas, las pestañas tradicionales horizontales se reemplazan por un menú vertical de acceso con botones/tarjetas de bordes redondeados (`rounded-2xl`), iconos con micro-backdrops en tonos pastel suaves e indicadores direccionales.
    -   La visualización y captura de datos se realiza dentro de un **Panel Inferior Desplizable Premium (`Bottom Sheet Drawer`)** con scroll vertical independiente (`overflow-y-auto bg-slate-50`), aislando por completo los formularios complejos y evitando desbordamientos de página.
    -   El botón de cierre (`X`) se ha rediseñado con enfoque táctil de alta gama: forma circular (`rounded-full`), tamaño de toque óptimo (`w-10 h-10`), fondo de contraste suave (`bg-slate-100 hover:bg-slate-200`) e icono de cierre ampliado a `h-5 w-5`.

---

## [3.0.0] - Publicado

### Funcionalidades y Mejoras Principales

-   **[NUEVO] Sincronización Automática de Datos (Cron Job):**
    -   Se ha añadido un endpoint de API seguro (`/api/cron/sync-erp`) que permite automatizar la sincronización de datos del ERP.
    -   La ejecución se protege mediante una clave secreta (`CRON_SECRET`) que debe ser configurada en el archivo `.env.local`.
    -   Se ha añadido documentación detallada en el `README.md` y en el **Centro de Ayuda** con instrucciones para configurar la tarea programada tanto en servidores Linux (crontab) como en Windows (Task Scheduler).

### Correcciones Críticas de Estabilidad

-   **[Corregido] Error Crítico de Arranque del Servidor (`EADDRINUSE`):**
    -   Se ha solucionado un error fatal que impedía que el servidor de desarrollo se iniciara correctamente debido a un conflicto de puertos.
    -   La causa raíz era una configuración incorrecta en el script `dev` del archivo `package.json`, que intentaba usar dos puertos a la vez. El script ha sido corregido para usar un único puerto (`9003`).
-   **[Corregido] Errores de Renderizado en el Servidor (`Cannot read properties of undefined`):**
    -   Se ha solucionado una serie de errores de renderizado que ocurrían en varias páginas de la aplicación.
    -   El problema se debía a una arquitectura incorrecta donde un componente de servidor se renderizaba dentro de un componente de cliente (`AuthProvider`), lo cual es inválido en Next.js App Router.
    -   Se ha aplicado la directiva `"use client";` en las páginas afectadas para asegurar un renderizado consistente y estable.
-   **[Corregido] Error de Compilación (`PageNotFoundError`):**
    -   Se ha resuelto un error que impedía que la aplicación se compilara correctamente (`next build`).
    -   El error ocurría porque el sistema de rutas de Next.js confundía las rutas de API (`/api/...`) con páginas.
    -   Se han movido todos los endpoints de la API del directorio `src/app/api/` al nuevo directorio `src/app/routes/` para eliminar la ambigüedad y seguir las convenciones modernas del App Router.

### Mejoras Internas y de Calidad de Código

-   **[Calidad] Fiabilidad de Datos con Revalidación de Caché:** Se ha implementado el uso de `revalidatePath()` en todas las acciones del servidor que modifican datos (crear, editar, eliminar). Esto soluciona un problema clave de la arquitectura de Next.js, asegurando que la interfaz de usuario siempre muestre la información más reciente y evitando la visualización de datos en caché obsoletos.
-   **[Calidad] Compatibilidad Multiplataforma:** Se ha reemplazado el comando `rm -rf` en `package.json` por `rimraf`, garantizando que el entorno de desarrollo pueda ser iniciado sin problemas tanto en sistemas Windows como Unix (Linux/macOS).
-   **[Refactorización]** Se ha centralizado la lógica de configuración de Analíticas y se han corregido múltiples errores de tipado en TypeScript para mejorar la mantenibilidad y robustez del código.

---

## [2.9.3] - Publicado

### Mejoras de Rendimiento y Experiencia de Usuario (UX)

-   **[Rendimiento Crítico] Optimización de Carga en Módulos de Almacén.** Se ha refactorizado la forma en que los módulos de almacén cargan datos (productos, clientes, ubicaciones) para solucionar problemas de lentitud y bloqueos en instalaciones con grandes volúmenes de información.
    -   En lugar de cargar miles de registros en el navegador, ahora las páginas cargan de forma instantánea.
    -   Se implementó una **búsqueda inteligente del lado del servidor**: a medida que el usuario escribe, el sistema realiza consultas rápidas y ligeras para traer solo los resultados más relevantes.
    -   Este cambio afecta a: **Asistente de Recepción, Asistente de Poblado, Toma de Inventario Físico, Centro de Etiquetas y Gestión de Lotes/Tarimas**.
-   **[Rendimiento Catálogo] Paginación del Lado del Servidor.** El módulo **"Catálogo Clientes y Artículos"** ahora utiliza paginación del lado del servidor. En lugar de cargar todas las asignaciones a la vez, carga los datos por páginas, garantizando un rendimiento óptimo sin importar la cantidad de registros.
-   **[UX Panel Principal]** Se eliminó la tarjeta duplicada de "Panel" del dashboard principal para una interfaz más limpia y lógica.

### Correcciones y Mejoras de Lógica

-   **[Seguridad de Permisos]** Se corrigió un error en el gestor de roles que impedía la correcta asignación de permisos dependientes (ej: no se podía asignar "Aprobar Boleta" sin tener acceso a la lista de boletas). El sistema ahora aplica la jerarquía de permisos correctamente.
-   **[Estabilidad]** Se solucionó una advertencia de "dependencias faltantes" en el hook `useAuthorization` para mejorar la estabilidad y prevenir bugs de renderizado.
-   **[Responsivo]** Se corrigieron errores de desbordamiento horizontal en las barras de navegación secundarias de los módulos de "Administración" y "Analíticas" en pantallas pequeñas y grandes, asegurando una visualización correcta en todos los dispositivos.

---

## [2.9.2] - Publicado

### Mejoras de Experiencia de Usuario (UX) y Calidad de Vida

-   **[UX Consignación] Visualización de Alias de Cliente.** Para facilitar la identificación de productos según el cliente, el "Alias de Cliente" ahora se muestra en dos lugares clave:
    -   Se añadió una nueva columna opcional "Alias Cliente" al **Reporte de Cierre de Consignaciones**.
    -   Al editar una boleta, el alias ahora aparece junto al código de producto del ERP, respetando la configuración de visualización del acuerdo.
-   **[Notificaciones Consignación] Correos Más Completos y Útiles.** Se ha mejorado la comunicación por correo en el módulo de consignaciones:
    -   Todos los correos de cambio de estado (Aprobada, Enviada, Facturada) ahora incluyen la **tabla detallada con los productos**, similar al correo de aprobación. Se mantiene la regla de que el usuario que realizó el conteo no ve los precios.
    -   Se ha añadido un **enlace a la aplicación** en el pie de página de todos los correos del sistema (recuperación de contraseña y notificaciones), utilizando la "URL Pública" configurada en Administración.

### Correcciones y Mejoras de Lógica

-   **[Lógica Consignación] Nuevo Modo de Reposición Manual (Sin Máximos).** Se ha introducido una lógica más flexible para los acuerdos de consignación:
    -   Si el "Stock Máximo" de un producto en un acuerdo se establece en `0`, el sistema lo interpretará como "sin máximo".
    -   Al generar una boleta para estos productos, la "Cantidad a Reponer" se establecerá automáticamente en `0`, esperando que un supervisor o vendedor ingrese manualmente la cantidad solicitada por el cliente.
-   **[Corrección de Notificaciones]** Se solucionó un error que impedía que los correos de notificación se enviaran correctamente para los estados "Aprobada", "Enviada" y "Facturada". Ahora el creador de la boleta y los usuarios interesados son notificados en cada paso del flujo.
-   **[Corrección Consignación]** Se corrigió un bug crítico que impedía que el campo "Código Cliente (Alias)" de un producto en un acuerdo de consignación se guardara correctamente. El valor ahora se persiste en la base de datos.
-   **[Corrección Reporte Consignación]** Se solucionó un error de tipo (`is not iterable`) que impedía la generación del "Reporte de Cierre de Consignaciones".

---

## [2.9.1] - Publicado

### Mejoras de Experiencia de Usuario (UX) y Calidad de Vida

-   **[UX Consignación]** Se rediseñaron las ventanas de diálogo del módulo de "Consignaciones" (Acuerdos y Boletas) para usar un sistema de tarjetas en lugar de tablas. Este cambio mejora drásticamente la visualización en dispositivos móviles y previene que los números largos se corten.
-   **[UX Consignación]** Se añadió una nueva columna "Total a Reponer" a la tabla principal de "Gestión de Boletas", permitiendo una vista rápida de la magnitud de cada envío.
-   **[UX Consignación]** Se agregaron descripciones emergentes (tooltips) a los encabezados de la tabla de "Gestión de Boletas" para explicar el propósito de cada columna.
-   **[UX Consignación]** El mensaje de error al intentar eliminar un "Acuerdo" que tiene boletas asociadas ahora es claro y amigable, guiando al usuario sobre cómo proceder en lugar de mostrar un error técnico.

### Correcciones y Mejoras de Lógica

-   **[Lógica Consignación] Recálculo Inteligente de Boletas.** Se ha mejorado el flujo de edición de boletas. El sistema ahora detecta si una cantidad a reponer fue editada manualmente y respeta ese valor en futuras ediciones. Si las reglas del acuerdo cambian (ej. se ajusta el stock máximo), el sistema solo recalculará las cantidades que no hayan sido modificadas manualmente. Se añadió un discreto botón de "reset" para volver al cálculo automático si se desea.
-   **[Corrección de Estabilidad]** Se corrigió un error en el selector de usuarios para las notificaciones de consignación que impedía que la selección se mantuviera correctamente.
-   **[Refactorización de Seguridad]** Se implementó una capa de seguridad más robusta con un nuevo `auth-guard` del lado del servidor. Las páginas y acciones ahora utilizan `authorizePage` y `authorizeAction` para una validación de permisos más estricta y centralizada.

---

## [2.9.0] - Publicado

### Funcionalidades y Mejoras Principales

-   **[NUEVO MÓDULO] Gestión de Consignaciones:**
    -   Se ha creado un módulo completo para gestionar el ciclo de vida de los productos en consignación en las instalaciones de los clientes.
    -   **Submódulo 1: Gestión de Acuerdos:** Permite crear un "contrato" de consignación por cliente, asignándole una bodega virtual del ERP y definiendo qué productos están autorizados, con sus respectivos stocks máximos y precios de venta acordados.
    -   **Submódulo 2: Toma de Inventario Robusta:** Una interfaz optimizada para que un colaborador en campo registre las cantidades físicas. El sistema guarda cada conteo individualmente al pasar de un campo a otro, previniendo la pérdida de datos por desconexiones de VPN. Además, permite reanudar sesiones de conteo no finalizadas.
    -   **Submódulo 3: Gestión y Aprobación de Boletas:** Las tomas de inventario generan "Boletas de Reposición" que entran en un flujo de aprobación. Solo las boletas aprobadas pueden ser impresas para el despacho. El sistema también permite marcar una boleta como "Facturada" e ingresar el número de factura del ERP para una trazabilidad total.
    -   **Submódulo 4: Reporte de Cierre Mensual:** Una nueva herramienta en Analíticas que genera un reporte detallado del consumo de un cliente en un mes específico, mostrando inventario inicial, entregas, inventario final y el consumo total facturable. Incluye exportación a Excel y PDF.
    -   **Notificaciones por Correo:** El sistema notifica automáticamente a los supervisores cuando se crea una nueva boleta y al creador cuando esta es aprobada.
    -   **Consecutivos Automáticos:** El sistema genera automáticamente un prefijo de boleta basado en el código del cliente, asegurando secuencias lógicas y ordenadas.

### Mejoras Internas y de Calidad de Código

-   **[Refactorización]** Se ha refactorizado la lógica del módulo de Almacén para unificar el comportamiento de asignación de ubicaciones, aplicando las mismas validaciones de conflicto tanto en el "Asistente de Recepción" como en el "Catálogo", previniendo condiciones de carrera y duplicidad de datos.
-   **[Funcionalidad Restaurada]** Se ha reincorporado el campo de "Notas" en el "Asistente de Recepción" y se ha restaurado la lógica de auditoría por correo para el "Asistente de Poblado" cuando se crean ubicaciones mixtas.
-   **[Calidad de Código]** Se corrigieron más de 30 errores de tipeo y referencias incorrectas detectados por el compilador de TypeScript, mejorando la estabilidad y mantenibilidad del código en todos los módulos.

---

## [2.8.0] - Publicado

### Funcionalidades y Mejoras Principales

-   **[NUEVO MÓDULO] Herramientas de TI:**
    -   Se ha creado un nuevo panel de control dedicado para el departamento de Tecnologías de la Información.
    -   **Primer Sub-módulo: Notas Técnicas.** Permite crear una base de conocimiento interna para documentar procedimientos, guías y soluciones a problemas comunes.
    -   **Vinculación Inteligente:** Cada nota puede ser vinculada a un módulo específico de la aplicación (ej: una guía para el "Planificador" o un procedimiento para "Compras"), permitiendo un filtrado contextual y una búsqueda más eficiente.

-   **[NUEVO MÓDULO] Centro de Trazabilidad y Operaciones (CTO) - Cimientos:**
    -   Se ha añadido la infraestructura base (menú, base de datos y permisos) para un futuro módulo de gestión de formularios digitales (boletas de entrega, movimientos de bodega, etc.) para el cumplimiento de la norma ISO 9001. La interfaz de usuario se encuentra actualmente en construcción.

-   **[MEJORA] Mantenimiento del Sistema Robusto:**
    -   **Backups Íntegros:** La acción **"Crear Punto de Restauración"** ahora ejecuta automáticamente una consolidación de la base de datos (checkpoint WAL) *antes* de crear el backup, garantizando que cada copia de seguridad sea completa y segura.
    -   **Consolidación Manual:** Se ha añadido un nuevo botón **"Forzar Consolidación de Datos"** en la "Zona de Peligro" de Mantenimiento, dando a los administradores control explícito para consolidar los archivos de la base de datos cuando sea necesario.

### Correcciones y Mejoras Internas

-   **[Corrección Crítica] Asistente de Costos Mejorado:**
    -   Se ha corregido un error que causaba que la descripción de los artículos en el Asistente de Costos incluyera datos extra (ej: `...;IVA1;0.00`). El sistema ahora limpia este campo automáticamente.
    -   Se ha mejorado la lógica de análisis para dar prioridad al código de producto del proveedor (`Tipo 01`), aumentando la compatibilidad con diferentes formatos de facturas XML v4.3 y v4.4.
-   **[UI]** Se han añadido los nuevos módulos ("Herramientas de TI" y "Operaciones") a la barra de navegación lateral para un acceso rápido.

---

## [2.7.0] - Publicado

### Funcionalidades y Mejoras Principales

-   **[Funcionalidad Clave] Lógica Inteligente de Multi-Ubicación para Productos:**
    -   Se ha rediseñado por completo la lógica de asignación de ubicaciones para reflejar la realidad de un almacén dinámico. El sistema ahora permite de forma intencional que un mismo producto resida en múltiples ubicaciones.
    -   **Flujo Deliberado con Decisión:** En el **"Catálogo Clientes y Artículos"** y en el **"Asistente de Recepción"**, al asignar un producto a una nueva ubicación, el sistema ahora detecta si ya tiene un "hogar" y presenta un diálogo de decisión claro:
        -   **Mover a la nueva ubicación:** Actualiza el registro existente, moviendo el producto de su ubicación anterior a la nueva.
        -   **Agregar como ubicación adicional:** Crea un nuevo registro, permitiendo que el producto tenga múltiples ubicaciones designadas.
    -   Esta mejora previene errores y la creación de datos duplicados, dando al usuario control total sobre la estructura del catálogo.

-   **[UX Almacén] Asistente de Poblado con Auditoría Automática:**
    -   Para no sacrificar su velocidad, el asistente **mantiene el guardado inmediato** de cada asignación escaneada, asegurando que no se pierdan datos.
    -   **Resumen Inteligente al Finalizar:** Al terminar una sesión, el asistente ahora presenta una ventana de resumen que **resalta en rojo** cualquier producto que haya sido asignado a múltiples ubicaciones durante esa sesión.
    -   **Notificación Automática por Correo:** Junto con el resumen, el sistema **envía automáticamente un correo electrónico** a los supervisores con los detalles de las ubicaciones múltiples detectadas, garantizando una auditoría proactiva sin interrumpir al operario.

-   **[UX Reportes] Reporte de Catálogo Depurado y Preciso:**
    -   El **Reporte de Catálogo** ha sido mejorado para reflejar la nueva lógica de multi-ubicación.
    -   En lugar de mostrar filas duplicadas, ahora agrupa las ubicaciones por producto, mostrando todas las ubicaciones asignadas en una sola vista consolidada. Esto ofrece un panorama limpio y preciso del estado actual del inventario.

-   **[Mejora de UX] Optimización del Asistente de Recepción:**
    -   La opción **"Guardar como ubicación predeterminada"** ahora viene activada por defecto para agilizar el proceso de registro.
    -   La lista de ubicaciones sugeridas ahora se actualiza en tiempo real dentro de la misma sesión, eliminando la necesidad de salir y volver a entrar para ver los cambios recientes.

---

## [2.6.0] - Publicado

### Funcionalidades y Mejoras Principales

-   **[Funcionalidad Clave] Configuración de Alias para Reporte de Tránsitos:**
    -   Se ha añadido una nueva sección de configuración en **Administración > Analíticas**.
    -   Desde aquí, ahora puedes definir **alias de texto y colores personalizados** para cada estado de las órdenes de compra del ERP (ej: `A` = "Activa" en color verde, `E` = "Enviada" en azul).
    -   Esta funcionalidad, inspirada en la gestión de bodegas, te da control total sobre cómo se interpreta y visualiza la información de tránsito en toda la aplicación.
-   **[UX Reportes] Filtro de Estados Múltiples en Reporte de Tránsitos:**
    -   El **Reporte de Tránsitos** ahora incluye un nuevo filtro multi-selección para los **estados**.
    -   Los estados que aparecen en el filtro utilizan los alias y colores que configuraste en el paso anterior, haciendo la interfaz más intuitiva.
    -   Por defecto, el filtro seleccionará todos los estados que no sean finales (como "Recibida" o "Anulada"), pero puedes personalizar la vista para incluir o excluir los que necesites.
    -   Tus preferencias de columnas y filtros de estado ahora se guardan por usuario.

### Correcciones y Mejoras Internas

-   **[Corrección Crítica] Reparación de Importación de Tránsitos:** Se ha corregido un error crítico en el sistema de importación de datos desde archivos. Previamente, el sistema estaba ignorando incorrectamente los archivos de órdenes de compra del ERP (`erp_purchase_order_headers.txt` y `erp_purchase_order_lines.txt`), lo que causaba que el Reporte de Tránsitos no mostrara datos actualizados. Con esta corrección, la sincronización de tránsitos vuelve a funcionar como se esperaba.
-   **[Estabilidad] Carga Automática en Reportes:** Se ha ajustado la lógica de carga en todos los reportes de Analíticas. Ahora, ningún reporte cargará datos automáticamente al abrir la página. El usuario debe siempre hacer clic en "Generar Reporte" para iniciar la consulta, previniendo sobrecargas de rendimiento con grandes volúmenes de datos.
-   **[Refactorización]** Se ha centralizado la lógica de obtención de datos para todos los reportes de Analíticas en un archivo de acciones dedicado, mejorando la organización y mantenibilidad del código.

---

## [2.5.0] - Publicado

### Mejoras de Experiencia de Usuario (UX)

-   **[UX] Mejoras en Administración de Ingresos:**
    -   Se ha añadido **paginación** a la tabla de resultados, permitiendo manejar miles de registros sin afectar el rendimiento.
    -   Se ha integrado un nuevo filtro **"Mostrar solo pendientes"** que está activado por defecto, enfocando la vista en las tareas que requieren acción. La preferencia de este filtro se guarda por usuario.
-   **[UX] Indicador Visual de Ubicaciones Mixtas:**
    -   En todas las herramientas del módulo de Almacén (Asistente de Recepción, Catálogo, Consultas, etc.), las ubicaciones que contienen más de un tipo de producto ahora muestran una insignia roja **"(Mixta)"**.
    -   Esto proporciona visibilidad inmediata al operario sobre el estado de una ubicación sin necesidad de generar un reporte.
-   **[UX] Notificación de Sincronización Mejorada:** El mensaje que aparece al finalizar la sincronización del ERP ahora muestra un recuento más claro del progreso (ej: "Se han procesado 10 de 11 tipos de datos").

### Correcciones y Mejoras Internas

-   **[Funcionalidad] Búsqueda por Código de Barras Universal:** Se ha habilitado la búsqueda por código de barras en todos los buscadores de productos de la aplicación (Cotizador, Planificador, Compras, Almacén) para una mayor consistencia y agilidad.
-   **[Corrección] Logo en PDF de Ingresos:** Se solucionó un error que impedía que el logo de la empresa se mostrara en los comprobantes de ingreso y anulación generados desde la Administración de Ingresos.
-   **[Corrección] Título de Página Dinámico:** Se arregló un problema que causaba que el título en la cabecera de la aplicación no se actualizara correctamente al navegar entre diferentes herramientas del panel de Administración.
-   **[Lógica] Asistente de Recepción Inteligente:** Se corrigió la lógica del asistente. Ahora, la advertencia de "Ubicación Ocupada" solo aparecerá si se intenta ingresar un producto en una ubicación que ya contiene un artículo **diferente**, y no cuando se agrega más stock del mismo producto.
-   **[Documentación] Centro de Ayuda Actualizado:** Se ha ampliado y actualizado el manual de usuario con tutoriales detallados que explican la diferencia entre las herramientas de almacén y cómo realizar traslados de inventario.

---

## [2.4.0] - Publicado

### Funcionalidades y Mejoras Principales

-   **[Funcionalidad Clave] Generación de Boletas de Ingreso/Corrección (PDF):**
    -   Se ha añadido un nuevo botón de **impresión** en cada fila de la herramienta **"Administración de Ingresos"**.
    -   Al hacer clic, el sistema genera una boleta en formato PDF, ideal para auditorías de **ISO 9001**.
    -   **Contenido Dinámico:** La boleta adapta su título y contenido según el estado del registro:
        -   **Ingreso Normal:** Se titula **"Comprobante de Ingreso"**.
        -   **Anulación:** Se titula **"Comprobante de Anulación"** y muestra a qué ingreso original anula.
        -   **Corrección:** Se titula **"Comprobante de Ingreso (por Corrección)"** y muestra a qué ingreso reemplaza.
    -   **Trazabilidad Completa:** La boleta incluye todos los detalles: producto, cantidades, lotes, documentos asociados (ERP y origen), y el nombre del usuario que **recibió** y el que **aplicó** el ingreso.
    -   **Personalización:** Se puede configurar una "Leyenda Superior" (ej: "Documento Controlado - ISO 9001") desde la Configuración de Almacenes.
-   **[Funcionalidad] Campo de Notas en Recepción:**
    -   El "Asistente de Recepción" ahora incluye un campo opcional para añadir **notas** al momento de registrar un nuevo ingreso.
    -   Estas notas quedan registradas en el sistema y se imprimen en la boleta de ingreso correspondiente, permitiendo documentar cualquier eventualidad durante la recepción (ej: "caja golpeada").

---

## [2.3.0] - Publicado

### Funcionalidades y Mejoras Principales

-   **[Funcionalidad Clave] Nuevo Flujo de Aprobación para Ingresos de Mercadería:**
    -   Se ha introducido un sistema de estados para la herramienta **"Administración de Ingresos"**.
    -   **Nuevos Estados:** Los ingresos creados desde el "Asistente de Recepción" ahora entran en estado **"Pendiente"**.
    -   **Revisión y Aplicación:** Un supervisor puede ahora "Revisar y Aplicar" un ingreso pendiente. En esta etapa, se pueden **editar todos los campos**, incluyendo `Producto`, `Cantidad`, `Lote` y, crucialmente, añadir el **Nº de Documento ERP** que se genera horas después de la recepción física. Al "Aplicar", el registro se actualiza y se marca como final.
    -   **Corrección Post-Aplicación:** Una vez que un ingreso está "Aplicado", el flujo de "Corrección" funciona como antes: anula el ingreso original y crea uno nuevo, manteniendo una trazabilidad completa de los cambios.
    -   Este cambio proporciona la flexibilidad necesaria para completar la información del ERP sin perder el control ni la capacidad de auditoría.

-   **[UX Reportes] Mejoras en Reporte de Ocupación:**
    -   La columna "Artículos" en el "Reporte de Ocupación" ahora muestra directamente el **código del artículo** además de la descripción cuando una ubicación está ocupada por un solo producto.
    -   Se han añadido nuevos **filtros jerárquicos** por **Rack** y **Nivel**, permitiendo un análisis mucho más granular del estado de las ubicaciones.
    -   El buscador del reporte ahora también indexa el código del artículo.

### Mejoras Internas y de Estabilidad

-   **[Estabilidad]** Se corrigió un error de compilación (`Property 'disabled' does not exist`) relacionado con el componente de filtro múltiple, mejorando la estabilidad de la página de reportes.

---

## [2.2.0] - Publicado

### Funcionalidades y Mejoras Principales

-   **[Funcionalidad Clave] Nuevo Módulo "Catálogo de Clientes y Artículos":**
    -   Se ha evolucionado la herramienta "Asignar Ubicación" a un módulo de catálogo completo.
    -   Permite crear una asociación entre un **producto**, una **ubicación** y, opcionalmente, un **cliente**.
    -   **Exclusividad:** Se puede marcar una asignación como "Exclusiva" para un cliente, indicando que ese producto en esa ubicación es solo para él.
    -   La interfaz ha sido rediseñada con una tabla principal que muestra todas las asignaciones y un diálogo simplificado para crear o editar estas asociaciones.

-   **[Funcionalidad Clave] Nueva Herramienta "Administración de Ingresos" (Corrección):**
    -   Se ha añadido una potente herramienta en **Almacén > Administración de Ingresos**.
    -   Permite a un supervisor buscar una unidad de inventario (lote/tarima) por múltiples criterios (fecha, producto, lote, consecutivo, etc.).
    -   Al seleccionar una unidad, se abre un modal que permite **corregir el producto o la cantidad** del ingreso original.
    -   Internamente, el sistema anula la unidad incorrecta y crea una nueva con los datos corregidos, generando los movimientos de inventario de entrada y salida correspondientes para una trazabilidad completa.

-   **[Funcionalidad Clave] Nuevo "Reporte de Catálogo":**
    -   Se ha añadido un nuevo reporte en **Analíticas > Reporte de Catálogo**.
    -   Permite auditar todas las asignaciones de producto-cliente-ubicación.
    -   Incluye filtros estándar por **rango de fechas**, búsqueda de texto, **clasificación de producto** y un nuevo filtro por **tipo de asignación** (General, Exclusivo, Sin Cliente).
    -   Cuenta con paginación y exportación a PDF y Excel.

### Mejoras de Experiencia de Usuario (UX)

-   **[UX] Fechas por Defecto en Reportes:** Todos los reportes de Analíticas ahora inician con el rango de fechas establecido en el día actual, facilitando la consulta de la información más reciente.
-   **[UX] Nomenclatura Intuitiva:** Se ha renombrado la tarjeta de acceso a la herramienta de asignaciones a "Catálogo Clientes y Artículos" para reflejar mejor su nueva funcionalidad.

---

## [2.1.1] - Publicado

### Mejoras Funcionales y de Experiencia de Usuario (UX)

-   **[Funcionalidad Clave] Búsqueda Universal por Código de Barras:**
    -   Se ha integrado la capacidad de buscar productos utilizando su código de barras en **toda la aplicación**.
    -   Los módulos **Cotizador, Planificador y Solicitudes de Compra** ahora permiten escanear o escribir un código de barras en el buscador de productos para una identificación instantánea.
    -   La importación de datos desde el ERP ha sido actualizada para incluir el campo `CODIGO_BARRAS_VENT`.

-   **[UX Almacén] Información de Producto Enriquecida:**
    -   En los módulos **Consulta de Almacén** y **Búsqueda Rápida**, los resultados ahora muestran información adicional crítica del producto:
        -   **Estado:** Una insignia visual ("Activo" en verde, "Inactivo" en rojo).
        -   **Unidad de Venta:** (Ej: CAJA, UND, PTE).
        -   **Notas:** Se muestran las notas del artículo directamente en la tarjeta si existen.
        -   **Código de Barras:** Se muestra el código de barras del producto.

-   **[UX Compras] Rediseño del Formulario de "Nueva Solicitud":**
    -   Se ha rediseñado el formulario emergente para crear una nueva solicitud de compra, organizando los campos en una cuadrícula de 3 columnas.
    -   Este cambio optimiza el uso del espacio en pantalla y asegura que todos los campos sean visibles sin necesidad de una barra de desplazamiento, solucionando problemas de desbordamiento visual.

-   **[Robustez] Prevención de Códigos de Ubicación Duplicados:**
    -   Se ha añadido una validación en la **Gestión de Ubicaciones** que impide a un administrador crear manualmente una nueva ubicación con un código que ya existe, previniendo errores de base de datos.

### Mejoras de Seguridad y Permisos

-   **[Seguridad] Permisos Granulares para Datos Financieros en Compras:**
    -   Se han introducido tres nuevos permisos para un control detallado sobre la información financiera en el módulo de Solicitudes de Compra:
        -   `requests:view:sale-price` (Ver Precio Venta)
        -   `requests:view:cost` (Ver Costo)
        -   `requests:view:margin` (Ver Margen)
    -   Estos permisos siguen una lógica de jerarquía: para ver el margen, se debe tener permiso para ver el costo, y para ver el costo, se debe tener permiso para ver el precio de venta.
    -   La interfaz ahora oculta estos campos a los usuarios que no posean dichos permisos.

### Mejoras Internas y de Estabilidad

-   **[Estabilidad] Corrección de Errores de Compilación:** Se solucionaron múltiples errores de `Cannot find module` que impedían que la aplicación se compilara correctamente. La causa raíz, relacionada con la carga inicial de la página y la detección de usuarios, ha sido resuelta para garantizar builds estables.
-   **[Calidad de Código] Centralización de Lógica Duplicada:**
    -   Se unificó la lógica para determinar si un usuario es "Administrador", utilizando el sistema de permisos (`hasPermission('admin:access')`) en lugar de comprobaciones directas, lo que hace el código más mantenible.
    -   Se eliminaron funciones duplicadas para obtener las iniciales de los usuarios, centralizando la lógica en un solo lugar.
-   **[UI] Corrección de Etiquetas de Almacén:** Se solucionó un problema en la generación de etiquetas PDF donde las rutas de ubicación largas se cortaban. Ahora, el texto se ajusta automáticamente en varias líneas para asegurar que la información siempre sea legible.
-   **[Preparación a Futuro] Cimientos para Módulo de Despacho:** Se ha integrado la infraestructura de base de datos y la lógica de importación para manejar datos de **facturas del ERP** (`erp_invoice_headers` y `erp_invoice_lines`). Aunque no hay una interfaz visible para el usuario final, este cambio sienta las bases para el futuro desarrollo del módulo de "Chequeo de Despacho".

## [2.1.0] - Publicado

### Mejoras de Calidad y Estabilidad

-   **[UX] Optimización del Flujo de Escáner:** En la pantalla de **Búsqueda Rápida de Almacén**, después de que un escáner introduce un código y presiona "Enter", el campo de búsqueda ahora se limpia y se re-enfoca automáticamente, permitiendo un flujo de escaneo continuo y sin interrupciones.

### Mejoras de Seguridad Críticas

-   **[Seguridad] Fortalecimiento del Sistema de Autenticación:**
    -   Se reemplazará el almacenamiento del ID de usuario en `sessionStorage` (inseguro y manipulable desde el navegador) por un sistema de **cookies seguras `httpOnly`**.
    -   Esto previene que un usuario pueda suplantar la identidad de otro (ej. un administrador) modificando variables en el navegador. La sesión ahora será gestionada de forma segura por el servidor.
-   **[Seguridad] Protección de Rutas de Descarga:**
    -   Se añadió una capa de autenticación y autorización a las rutas de descarga de archivos (`/api/temp-backups` y `/api/temp-exports`).
    -   A partir de ahora, solo los usuarios autenticados con los permisos adecuados (ej. `admin:maintenance:backup`) podrán descargar respaldos de bases de datos o reportes de Excel, previniendo fugas de información.

### Mejoras y Correcciones en Módulo de Almacén

-   **Asistente de Poblado de Racks (Funcionalidad Clave):**
    -   **[Nuevo] Capacidad de Retomar Sesiones:** Se ha implementado un sistema de "sesiones" robusto. Si un usuario inicia el asistente de poblado y luego navega a otro módulo, cierra la pestaña o su sesión expira, al volver a la herramienta podrá **continuar exactamente donde se quedó**.
    -   **[Solucionado] Error de Bloqueo por Sí Mismo:** Se solucionó el bug crítico que impedía a un usuario volver a usar el asistente si lo había abandonado sin finalizar, mostrándole que él mismo tenía el tramo bloqueado.
    -   **[Mejora] Detección Visual de Bloqueos:** La interfaz ahora detecta y deshabilita visualmente los niveles de un rack que ya están siendo poblados por otro usuario, previniendo errores y mejorando la claridad.
    -   **[Mejora] Indicador de Nivel Finalizado:** En el asistente, los niveles que ya han sido completamente poblados ahora muestran una etiqueta `(Finalizado)` para dar una retroalimentación visual clara al operario.
    -   **[Solucionado] Corrección del "Unknown" en Gestión de Bloqueos:** Se solucionó el error que causaba que el nombre del tramo bloqueado apareciera como "unknown".
    -   **[Estabilidad]** Se corrigieron múltiples errores de `NOT NULL constraint failed` y `Cannot read properties of undefined` que ocurrían debido a inconsistencias en la gestión del estado de la sesión, haciendo el asistente mucho más estable.

-   **Optimización para Dispositivos Móviles (Responsivo):**
    -   **[Mejora] Consulta de Almacén:** La página principal de búsqueda (`/warehouse/search`) fue rediseñada para una mejor experiencia en celulares y tablets. La barra de búsqueda ahora es fija en la parte superior, y los filtros adicionales se han movido a un panel lateral desplegable para una interfaz más limpia.
    -   **[Mejora] Gestión de Ubicaciones:** Se ajustó la disposición de los botones en pantallas pequeñas para un acceso más fácil y rápido.
    -   **[Mejora] Consistencia General:** Se aplicaron ajustes menores de diseño en todas las herramientas del módulo de Almacén para una experiencia más unificada.

### Correcciones Generales del Sistema

-   **[Estabilidad] Corrección de Errores de Renderizado en Servidor:** Se solucionó un error general (`Cannot read properties of undefined (reading 'call')`) que ocurría en varios módulos al no especificar correctamente que eran "componentes de cliente". Se añadió la directiva `"use client";` en todas las páginas afectadas, estabilizando la aplicación.

---

## [2.0.0] - Lanzamiento Inicial

-   Lanzamiento de la versión 2.0.0 de Clic-Tools.
-   Incluye los módulos de Cotizador, Planificador OP, Solicitudes de Compra, Asistente de Costos, Almacenes, Consultas Hacienda y el panel de Administración completo.
-   Arquitectura basada en Next.js App Router, componentes de servidor y bases de datos modulares SQLite.
    