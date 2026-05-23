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
    