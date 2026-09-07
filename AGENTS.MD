# Directivas para Agentes de IA - Clic-Tools

Este documento establece las reglas, estándares de arquitectura, políticas de objeción técnica, buenas prácticas de desarrollo y flujos de trabajo obligatorios que todo agente de IA o desarrollador debe seguir.

> ⚠️ **REGLA DE ORO / COMPATIBILIDAD HACIA ATRÁS:**
> Este proyecto ya se encuentra en producción y cuenta con módulos en funcionamiento.
> 1. **CERO REFACTORIZACIONES NO SOLICITADAS / PROTOCOLO DE AUTORIZACIÓN:** NUNCA modifiques, refactorices ni elimines código, tablas, rutas o configuraciones existentes sin que el usuario te lo pida o autorice explícitamente.
>    * **Si una refactorización o cambio estructural es realmente necesario para resolver un problema, NO lo omitas ni lo apliques a espaldas del usuario:** Debes detenerte, explicar con claridad técnica **POR QUÉ** es indispensable realizar dicha refactorización, detallar los riesgos/beneficios y **PEDIR LA AUTORIZACIÓN EXPRESA DEL USUARIO** antes de tocar el código.
> 2. **DETECCIÓN Y REPORTE DE ARCHIVOS MONOLÍTICOS:** Cada vez que identifiques un archivo monolítico (archivos masivos con exceso de responsabilidades, miles de líneas concentradas como componentes gigantes de interfaz mezclados con lógica de negocio o servicios sobredimensionados), **DEBES AVISAR DE INMEDIATO AL USUARIO Y CREAR UN PLAN DE TRABAJO ESTRUCTURADO** para modularizarlo, descomponerlo en submódulos/componentes desacoplados y evitar la persistencia de monolitos en el proyecto.
> 3. **RESPETO AL CÓDIGO LEGADO:** Si encuentras código, estructuras de base de datos o convenciones previas que no sigan al 100% las reglas descritas abajo, **MANTÉNLAS Y ADAPTATE A ELLAS**. No intentes "corregirlas" ni cambiarlas sin aprobación.
> 4. **PRINCIPIO "DE AHORA EN ADELANTE":** Las reglas de este documento aplican estrictamente a **NUEVAS** funcionalidades, nuevos módulos o cuando el usuario pida explícitamente actualizar algo existente.
> 5. **VALIDACIÓN OBLIGATORIA DE LA RUTA DE TRABAJO:** El agente DEBE verificar la ruta exacta del proyecto en la que se están aplicando los cambios antes de ejecutar operaciones o crear archivos. Para este workspace, la ubicación autorizada es estrictamente: `C:\Proyectos_Clic\Garend\IntraTool_Gravity_Entregas\IntraTool_Unificado_Grav`.

---

## 1. Contexto del Proyecto y Entorno Operativo

**Clic-Tools** es una aplicación web interna diseñada para centralizar herramientas y procesos empresariales clave en un único panel de control.
* **Branding y Datos de Empresa (Proveedor vs Cliente):** 
  * **Clic Soporte S.R.L.** es la empresa desarrolladora / proveedora creadora de **Clic-Tools**.
    * **Desarrollado por:** CLIC SOPORTE Y CLIC TIENDA S.R.L
    * **Cédula Jurídica:** 3-102-894538
    * **Teléfono:** +506 4000-0630
    * **Email:** soporte@clicsoporte.com
    * **Web:** www.clicsoporte.com
  * Los datos de la **empresa cliente donde está instalado el sistema** (Nombre Comercial, Cédula Jurídica, Teléfono, Correo y Dirección) residen centralizados en el panel web en: 👉 `/dashboard/admin/general` (Tabla SQLite `core_company_settings`). Todos los encabezados de impresiones, boletas y exportaciones deben usar siempre los datos de la empresa cliente de `/dashboard/admin/general`.

---

## 2. Deber de Objeción Crítica (El Derecho al "NO")

Como agente colaborador de IA, **TIENES EL DERECHO Y LA OBLIGACIÓN DE DECIR "NO" O DETENER UNA ACCIÓN** cuando una instrucción dada por el usuario ponga en riesgo la estabilidad del sistema. Que el usuario lo pida **no significa automáticamente que sea correcto o viable**.

Debes **DETENERTE, ADVERTIR Y JUSTIFICAR** antes de escribir o modificar código si detectas cualquiera de las siguientes situaciones:

1. **Riesgo de Ruptura (Breaking Changes):** Si la instrucción rompe compatibilidad con la base de datos actual, altera endpoints activos o elimina lógica crítica de producción.
2. **Redundancia / Funcionalidad Existente:** Si el usuario solicita crear una función, componente, módulo o vista que **ya existe** en el sistema. Debes indicarle dónde está ubicada la solución existente antes de duplicar código.
3. **Pérdida de Datos:** Si la indicación implica scripts destructivos, eliminación masiva de tablas sin backup o reseteos injustificados.
4. **Viabilidad Técnica o Alternativa Superior:** Si la instrucción propone una solución técnicamente deficiente que creará deuda técnica innecesaria. Debes objetar amablemente, explicar las consecuencias y proponer la alternativa correcta antes de proceder.

---

## 3. Buenas Prácticas de Software y Mantenibilidad (Para Humanos)

El código debe estar diseñado para ser leído, mantenido y extendido fácilmente por desarrolladores humanos en el futuro:

* **Documentación en Código (Documentación JSDoc/TSDoc):**
    * Toda función principal, *Server Action*, *hook* personalizado o consulta a la base de datos **DEBE incluir comentarios JSDoc** explicando qué hace, sus parámetros y lo que retorna.
    * Comenta el *por qué* de lógicas de negocio complejas o algoritmos no triviales dentro del código.
* **Principios SOLID y Mantenibilidad:**
    * **Responsabilidad Única:** Mantén los componentes de interfaz (React) separados de la lógica de datos (*Server Actions* o capa de BD).
    * Evita funciones monstruo o componentes gigantescos; descompón la lógica en piezas pequeñas y reutilizables.
* **Manejo Legible de Errores:**
    * Captura errores en bloque `try/catch` de forma explícita y devuelve mensajes estructurados, claros e informativos en español tanto para los logs del servidor como para el usuario.
* **Naming Conventions Claros:**
    * Usa nombres de variables y funciones descriptivos en inglés o español según la convención del archivo en que te encuentres, evitando abreviaturas ambiguas (ej. prefiere `fetchPendingOrders` sobre `getOrd`).

---

## 4. Reglas del Flujo de Desarrollo

* **Optimización de Consumo de Tokens y División de Responsabilidades:**
    * **Programación y Código (Agente IA):** El agente se encarga 100% de la lógica, arquitectura, programación y edición directa de código fuente con respuestas concisas para maximizar la eficiencia.
    * **Compilaciones y Pruebas (Responsabilidad Exclusiva del Usuario):** Para evitar sobrecosto de tokens, bloqueos o bucles ineficientes en segundo plano, la IA **NUNCA compilará por su cuenta** ningún entorno:
      * 🚫 **Web (`npm run build` / Next.js):** La IA no compilará bundles de producción. El usuario ejecutará los comandos en su terminal cuando lo requiera.
      * 🚫 **APK Móvil (`flutter build apk`):** La IA no ejecutará `flutter build`. La IA se limitará a actualizar el código Dart/Kotlin, las versiones en `pubspec.yaml`, `config.dart`, `schema.ts` y la base de datos, y le proporcionará al usuario el comando exacto para que compile el instalador y lo copie a `public/downloads/apk/ClicDriver.apk`.

* **Prohibición de Avisos Nativos del Navegador (`window.confirm` / `window.alert`):**
    * **NUNCA utilices diálogos nativos del navegador (`confirm(...)` o `alert(...)`):** Los navegadores modernos pueden bloquearlos silenciosamente, arruinan la experiencia de usuario y no respetan el tema oscuro/claro del sistema.
    * Es **OBLIGATORIO** utilizar componentes modales de confirmación del propio sistema (ej. `AlertDialog`, `Dialog` de Radix/Shadcn o toasts personalizados) integrados con la interfaz visual.

* **Reparación Activa de Código y Estándares de Rendimiento:**
    * **Cero Supresión de Warnings:** En lugar de apagar advertencias mediante comentarios (ej. `eslint-disable`), el agente **DEBE reparar activamente el código** usando las mejores prácticas de Next.js/React.
    * **Uso Obligatorio del Componente `next/image`:** NUNCA uses la etiqueta nativa `<img>`. Utiliza siempre el componente `<Image />` de `next/image` configurando la optimización adecuada o la propiedad `unoptimized` según corresponda para imágenes dinámicas/locales.
    * **Uso Obligatorio del Motor de Excel (`exportToExcel`):** NUNCA generes archivos `.csv` ni implementes librerías redundantes para exportar a Excel. De ahora en adelante es **OBLIGATORIO** reutilizar el motor centralizado ubicado en `src/modules/core/lib/excel-export.ts` (`exportToExcel`) para todas las descargas de reportes en formato `.xlsx`.
    * **Paginación y Lazy Loading Estándar:** Aplica siempre que sea posible **paginación en tablas/listas** y **lazy loading / renderizado bajo demanda** (ej. `next/dynamic` para componentes pesados como mapas o librerías externas) para optimizar la memoria, LCP y el rendimiento general de la interfaz.

* **Documentación Obligatoria tras cada Cambio:**
    Ante cualquier ajuste, corrección o nueva funcionalidad, debes actualizar solo si el cambio lo requiere:
    1. `CHANGELOG.md`: Registra el cambio indicando versión, tipo (NUEVO, CORRECCIÓN, UX, CALIDAD) y descripción detallada para prevenir regresiones futuras.
    2. `README.md`: Actualiza la documentación técnica, variables de entorno o guías de arquitectura si sufrieron modificaciones.
    3. `Centro de Ayuda (/dashboard/help)`: Agrega o actualiza un mini tutorial interactivo explicando el uso de la nueva funcionalidad a los usuarios finales.

---

## 5. Arquitectura de Módulos y Rutas

* **Estructura de Dos Niveles (Módulo Padre / Submódulo):**
    * Los módulos principales residen en `/dashboard/[modulo]` (ej. `/dashboard/requests`, `/dashboard/quoter`).
    * Para **nuevos requerimientos**, si se solicita expresamente, los submódulos se ubicarán en `/dashboard/[modulo]/[submodulo]` (ej. `/dashboard/operations/logistics`). Mantén la ruta actual de los módulos que ya existen.

* **Centralización de Configuraciones (`/dashboard/admin`):**
    * Las configuraciones y parámetros de los módulos **DEBEN** ubicarse centralizadamente dentro de la sección `/dashboard/admin`.
    * Si un módulo requiere subconfiguraciones específicas o avanzadas, se derivan a su subruta correspondiente dentro de administración (ej. `/dashboard/admin/operations`, `/dashboard/admin/analytics`). De ser necesario, **pregunta al usuario** si se trata de una sección de subconfiguraciones o de un nuevo módulo o ruta antes de crearlo.

* **Prohibición de Valores Hardcodeados (Parametrización Obligatoria en la Sección Correcta):**
    * **NUNCA** dejes hardcodeadas constantes, umbrales, URLs, tokens, teléfonos, tiempos de espera, intervalos, radios geográficos, correos, prefijos o reglas operativas que puedan variar y que el usuario o administrador requiera ajustar en el futuro.
    * **Ubicación en la Sección de Configuración que Corresponda:** Todo parámetro debe registrarse en la base de datos persistente (`settings` / base de datos del módulo) y contar con su correspondiente opción visible y editable en la interfaz del módulo o sección especializada adecuada:
      * 🔌 **APIs y Webhooks:** En la sección dedicada a integraciones y APIs del módulo correspondiente.
      * 🗄️ **Bases de Datos Externas / ERP:** En la sección dedicada a conexiones y mapeo de bases de datos externas (`/dashboard/admin/databases` o integración ERP).
      * 📱 **Control de APK Móvil / MDM / Flota:** En la sección dedicada a flota y herramientas móviles en el módulo de TI (`/dashboard/it-tools/mobile`).
      * ⚙️ **Configuración Operativa de Entregas / Logística:** En su respectiva consola de administración (`/dashboard/admin/operations/deliveries`).
      * 🏢 **Configuración Global de Empresa:** En `/dashboard/admin/general`.
    * **Inclusión en el Plan de Trabajo:** Al proponer una nueva funcionalidad o cambio, el agente debe **identificar e incluir explícitamente en el plan** la sección exacta donde se ubicará la configuración del parámetro para revisión del usuario antes de programar.
    * **Retraso de Búsqueda Global (`searchDebounceTime`):** Toda implementación que incluya un buscador, filtro de entrada de texto o autocompletado en cualquier módulo DEBE consultar y apegarse estrictamente a la configuración global de la empresa definida en `/dashboard/admin/general` (`searchDebounceTime` / *Retraso de Búsqueda (ms)*). Queda prohibido hardcodear delais de debounce (ej. `300ms`, `500ms`) en componentes de búsqueda.

---

## 6. Control de Accesos, Roles y Permisos

* **Permisos Granulares Obligatorios:**
    * Toda nueva implementación o funcionalidad debe registrar su correspondiente permiso en la gestión de roles (`/dashboard/admin/roles`).
    * Se deben definir permisos con granularidad estricta para cada acción (lectura, creación, edición, eliminación, aprobación o campos sensibles como costos/márgenes).

* **Herencia e Interfaz Cascada (Padre/Hijo):**
    * Al diseñar o registrar permisos nuevos, asegura la relación jerárquica: al marcar un **permiso Padre** (ej. `Compras: Lectura y Creación`), se deben marcar/activar automáticamente todos sus **permisos Hijos** dependientes.

---

## 7. Base de Datos, Persistencia y Mantenimiento

* **Evolución Aditiva (De ahora en adelante):**
    * Respetar la arquitectura SQLite en `/dbs/`. Para **nuevas tablas**, utiliza la convención de prefijos por módulo (`core_`, `wh_`, `req_`, `con_`, etc.) y la normalización de identificadores (IDs de negocio en MAYÚSCULAS, roles en minúsculas).
    * **IMPORTANTE:** Si una tabla existente no sigue este patrón exactamente, **no la renombres ni alteres sus columnas existentes**. Adapta tu nuevo código para que trabaje pacíficamente con la estructura actual.

* **Auditoría y Mantenimiento de Esquema:**
    * Con cada modificación en la estructura de datos (nuevas tablas, columnas o índices), actualiza el esquema global de la aplicación respetando la compatibilidad con los datos guardados.
    * Mantén la lógica de inicialización/migración sincronizada con la herramienta de **Auditoría de Esquema** ubicada en `/dashboard/admin/maintenance`.

---

## 8. Gestión de Versiones de la APK Móvil (`/Android`)

* **Sincronización Obligatoria de Versión & Ubicación de Archivos (3 Archivos + Base de Datos + 2 Rutas de Descarga):**
    * Toda actualización o incremento de versión de la aplicación móvil APK Flutter (`/Android`) **DEBE actualizarse y desplegarse estrictamente en las siguientes ubicaciones**:
      1. **`Android/pubspec.yaml`**: Actualizar la clave `version: X.Y.Z+W` (ej. `version: 1.0.8+7`).
      2. **`Android/lib/config.dart`** 🚨 *(CRÍTICO)*: Actualizar `static const String appVersion = 'X.Y.Z';` y `static const int appVersionCode = W;`. La APK lee esta clase para identificarse en los Heartbeats y calcular la disponibilidad de actualizaciones OTA. Olvidar este archivo provoca que la app se actualice en bucle infinito.
      3. **`src/modules/operations/lib/schema.ts`** (Servidor Backend): Actualizar el registro semilla en `ops_app_version_settings` (`version_name`, `version_code`, `apk_url`) con la versión objetivo y la ruta oficial permanente (ej. `'1.1.4'`, `13`, `'/downloads/apk/ClicDriver.apk'`).
      4. **Base de Datos de Producción SQLite (`dbs/clic_tools.db`)**: Ejecutar el script `UPDATE ops_app_version_settings` (`apk_url = '/downloads/apk/ClicDriver.apk'`) para que el servidor web responda inmediatamente con la versión objetivo a las consultas OTA (`/api/fleet/app-version`).
      5. **Compilación del Instalador Release (`/Android`) (A cargo del Usuario)**: La compilación la realiza el **usuario** ejecutando `flutter build apk --release` desde la terminal dentro de `/Android` para generar `Android/build/app/outputs/flutter-apk/app-release.apk`.
      6. **Ubicación de Archivos APK en el Servidor Web (`public/downloads/apk/`)**:
         * El usuario copia el archivo generado a **`public/downloads/apk/ClicDriver.apk`** (Ruta fija permanente `/downloads/apk/ClicDriver.apk`).
         * Opcionalmente se puede mantener una copia versionada de respaldo `public/downloads/apk/ClicDriver_vX.Y.Z.apk`.