# Clic-Tools: Documentación Técnica y Manual de Usuario

**Clic-Tools v2.9.2** es una aplicación web interna diseñada para centralizar herramientas y procesos empresariales clave en un único panel de control. El objetivo es proporcionar una plataforma sencilla, rápida, segura y altamente configurable, optimizada para su uso en una red local (LAN).

Esta versión marca un hito importante, introduciendo mejoras significativas en la arquitectura, la experiencia de usuario y la inteligencia de negocio.

---

## 1. Arquitectura y Filosofía

-   **Stack Tecnológico**:
    -   **Framework**: Next.js 14+ (con App Router).
    -   **Lenguaje**: TypeScript y Zod para validación de esquemas.
    -   **UI**: React, Tailwind CSS, ShadCN UI y Lucide React (iconos).
    -   **Base de Datos Local**: `better-sqlite3` para bases de datos locales basadas en archivos, garantizando alta velocidad y funcionamiento offline.
    -   **Conectividad ERP**: Soporte para `mssql` para conexión directa y de solo lectura a bases de datos de SQL Server.
    -   **Envío de Correo**: `nodemailer` para el envío de notificaciones y recuperación de contraseñas.

-   **Filosofía de Diseño**:
    -   **Server-Centric**: La mayor parte de la lógica crítica se ejecuta en el servidor (`'use server'`), mejorando la seguridad y el rendimiento.
    -   **Modularidad**: Cada herramienta (Cotizador, Planificador, etc.) tiene su propia base de datos (`.db`), asegurando un desacoplamiento total. Un error, una actualización fallida o un reseteo en un módulo no afecta a los demás.
    -   **Independencia y Resiliencia**: El sistema funciona sobre su propia base de datos SQLite. Los datos del ERP (clientes, productos, etc.) se **sincronizan** a esta base de datos local. Esto significa que la aplicación es extremadamente rápida y puede seguir funcionando incluso si el servidor del ERP no está disponible temporalmente.
    -   **Doble Modo de Importación**:
        1.  **Desde Archivos**: El método tradicional, cargando datos desde archivos de texto (`.txt` o `.csv`). Ideal para una configuración rápida o como método de respaldo.
        2.  **Desde SQL Server**: El método recomendado. Conecta directamente a la base de datos del ERP (con un usuario de **solo lectura**) para sincronizar los datos.
    -   **Gestor de Consultas Dinámico**: Para el modo SQL, las consultas `SELECT` no están escritas en el código. Se configuran desde la interfaz de administración, permitiendo adaptar la aplicación a cambios en la estructura del ERP sin necesidad de modificar el código fuente.

---

## 2. Estructura del Proyecto

-   `src/app/`: Contiene las rutas y páginas de la aplicación.
    -   `(auth)/`: Páginas de autenticación (login).
    -   `dashboard/`: Layout y páginas del panel de control principal.
-   `src/components/`: Componentes de React reutilizables (UI, Layout).
-   `src/modules/`: El corazón de la aplicación, organizado por funcionalidad.
    -   `core/`: Lógica compartida (autenticación, tipos, hooks, conexión a BD).
    -   `quoter/`, `planner/`, `requests/`, `warehouse/`, `cost-assistant/`: Módulos para cada herramienta, conteniendo sus propios `hooks`, `actions` y lógica de base de datos.
-   `src/lib/`: Utilidades generales.
-   `dbs/`: **Directorio persistente** donde se almacenan todos los archivos de base de datos (`.db`).
-   `deployment/`: **(Nuevo)** Documentación y scripts de ayuda para el despliegue.
-   `web.config`: **(Nuevo en v2.0)** Archivo de configuración para despliegues en IIS que previene reinicios inesperados.
-   `.env.local`: Archivo **NO COMPARTIDO** donde se almacenan las credenciales de SQL Server y SMTP.

---

## 3. Guía de Módulos (Funcionalidades)

### 3.1. Centro de Notificaciones
- **Alertas Proactivas:** Un icono de campana en la cabecera muestra un contador de notificaciones no leídas y se anima sutilmente cuando llega una nueva.
- **Bandeja de Tareas Interactiva:** Al hacer clic en la campana, se despliega un panel con las últimas notificaciones. Cada notificación es un enlace directo a la entidad correspondiente (una orden, una solicitud, etc.).
- **Notificaciones Accionables:** Ciertas notificaciones (ej: "Se solicita cancelar una orden") incluyen botones para realizar acciones rápidas directamente desde el panel, como "Aprobar" o "Rechazar", convirtiendo las notificaciones en una herramienta de gestión activa.
- **Inteligencia de Contexto:** El sistema notifica a usuarios específicos (ej: el creador de una orden) o a usuarios con un permiso determinado (ej: todos los que pueden aprobar cancelaciones), según la relevancia de la acción.

### 3.2. Cotizador (`/dashboard/quoter`)
- **Creación Rápida:** Permite buscar y añadir clientes y productos de forma ágil, con autocompletado y atajos de teclado. Muestra la cédula del cliente para evitar confusiones.
- **Validación en Tiempo Real:** Verifica el estado de exoneración de un cliente directamente con la API de Hacienda al seleccionarlo.
- **Generación de PDF:** Crea documentos de cotización profesionales con la información de la empresa.

### 3.3. Asistente de Costos (`/dashboard/cost-assistant`)
- **Análisis de Facturas:** Carga facturas de compra en formato XML y extrae automáticamente todos los artículos, cantidades y costos.
- **Prorrateo de Costos:** Permite ingresar costos adicionales (transporte, aduanas, etc.) que se distribuyen automáticamente entre todos los artículos para obtener un costo final real.
- **Manejo de Descuentos:** Configura si los descuentos de la factura se trasladan al costo (beneficiando al cliente) o a la ganancia (beneficiando a la empresa).
- **Cálculo de Precios de Venta:** Ingresa el margen de ganancia deseado para cada artículo y el sistema calcula el precio de venta final sugerido.
- **Exportación a Excel:** Genera un archivo Excel (`.xlsx`) con los datos exactos que se ven en pantalla, ideal para análisis o reportes externos.

### 3.4. Planificador (`/dashboard/planner`)
- **Gestión de Órdenes:** Permite crear, editar y visualizar órdenes de producción, mostrando siempre el nombre y la cédula del cliente para mayor claridad.
- **Visibilidad Controlada:** Por defecto, los usuarios solo ven las órdenes que ellos han creado. Un permiso especial (`planner:read:all`) permite a supervisores y administradores ver todas las órdenes.
- **Flujo de Aprobación por Etapas:**
    - Controla el ciclo de vida de una orden: `Pendiente` -> `Revisión` -> `Aprobación` -> `En Progreso`, etc.
    - **Flexibilidad de Flujo:** Permite retroceder en el flujo (ej: de `Aprobación` a `Revisión`) para corregir errores sin cancelar la orden.
- **Trazabilidad:** Cada cambio de estado, nota o modificación queda registrada en un historial detallado por orden.
- **Alertas Visuales:**
    - Las órdenes modificadas después de ser aprobadas se marcan visualmente para alertar a los supervisores.
    - Al crear una nueva orden, el sistema avisa si ya existen otras órdenes activas para el mismo producto.
- **Gestión de Turnos Personalizable**: Desde administración, se puede cambiar el nombre de la etiqueta "Turno" y añadir, editar o eliminar los diferentes turnos de trabajo disponibles.
- **Interfaz Optimizada**: La vista de órdenes ahora cuenta con un **encabezado fijo** que permanece visible al hacer scroll, mejorando la legibilidad.
- **Exportación Flexible:** Permite exportar la vista actual (con filtros) a un archivo **PDF** o **Excel (.xlsx)**.

### 3.5. Solicitud de Compra (`/dashboard/requests`)
- **Visibilidad Controlada:** Por defecto, los usuarios solo ven sus propias solicitudes. El permiso `requests:read:all` otorga visibilidad total al desmarcar el filtro "Mostrar solo mis solicitudes".
- **Flujo de Aprobación Flexible:**
  - Controla el ciclo de vida de una solicitud: `Pendiente` -> `Revisión` -> `Aprobación` -> `Ordenada`, etc.
  - **Pasos Opcionales:** Desde administración se puede activar el estado "Recibido en Bodega" y el estado final "Ingresado en ERP" para una trazabilidad completa.
  - **Retroceso en el Flujo:** Permite regresar una solicitud de "Aprobación" a "Revisión", o de "Revisión" a "Pendiente", para corregir errores.
- **Creación Inteligente desde ERP:** Permite crear solicitudes de compra automáticamente a partir de un pedido de venta del ERP. El sistema analiza el pedido, compara con el inventario actual y sugiere qué artículos comprar.
- **Alerta Visual de Duplicados:** Antes de crear una solicitud, el sistema avisa si ya existen otras solicitudes activas para el mismo artículo.
- **Interfaz Optimizada**: La vista de solicitudes ahora cuenta con un **encabezado fijo** que permanece visible al hacer scroll.
- **Exportación Flexible:** Permite exportar la vista actual (con filtros) a un archivo **PDF** o **Excel (.xlsx)**.

### 3.6. Gestión de Consignaciones (`/dashboard/consignments`) - ¡NUEVO!
- **Ciclo de Vida Completo:** Un nuevo módulo dedicado para gestionar productos en consignación en las instalaciones de los clientes, desde la configuración inicial hasta la facturación mensual.
- **Gestión de Acuerdos:** Permite crear "contratos" de consignación por cliente, asociando una bodega virtual del ERP y definiendo una lista de productos autorizados con sus respectivos stocks máximos y precios de venta.
- **Toma de Inventario Robusta:** Una interfaz optimizada para que un colaborador en campo registre las cantidades físicas. El sistema guarda cada conteo individualmente, previniendo la pérdida de datos por desconexiones, y permite reanudar sesiones no finalizadas.
- **Boletas de Reposición con Aprobación:** Genera "Boletas de Reposición" automáticamente, las cuales entran en un flujo de aprobación. Solo las boletas aprobadas pueden imprimirse para despacho.
- **Trazabilidad de Facturación:** Permite marcar una boleta como "Facturada" e ingresar el número de factura del ERP, creando un vínculo de trazabilidad total.

### 3.7. Analíticas y Reportes (`/dashboard/analytics`)
Este módulo agrupa herramientas de inteligencia de negocio para ayudar en la toma de decisiones.
- **Sugerencias de Compra Proactivas (`/purchase-suggestions`):**
    - Analiza los pedidos de venta del ERP en un rango de fechas y los cruza con el inventario actual.
    - Genera una lista consolidada de todos los artículos que tienen un faltante de stock para cumplir con la demanda.
    - Permite filtrar, ordenar los resultados y **crear las solicitudes de compra directamente**, alertando si se va a crear un duplicado.
- **Reporte de Tránsitos (`/transits-report`):**
    - Muestra un listado de todas las órdenes de compra activas en el ERP, permitiendo monitorear el inventario que está en camino.
- **Reporte de Cierre de Consignaciones (`/consignments-report`) - ¡NUEVO!:**
    - Genera un reporte detallado del consumo mensual de un cliente en consignación, calculando el total a facturar. Incluye exportación a Excel y PDF y personalización de columnas.

### 3.8. Almacenes (`/dashboard/warehouse`)
- **Consulta de Inventario:** Permite buscar artículos o clientes y ver sus ubicaciones y existencias en tiempo real, combinando datos del ERP y las ubicaciones físicas asignadas.
- **Asignación de Ubicaciones:** Herramienta para mover inventario o asignar artículos a ubicaciones físicas en el almacén.
- **Configuración Flexible:** Soporta un modo "informativo" (solo asignación) y un modo "avanzado" (conteo de existencias físicas por ubicación).

### 3.9. Consultas Hacienda (`/dashboard/hacienda`)
- **Búsqueda Unificada:** Centraliza la consulta de situación tributaria y exoneraciones de un cliente.

### 3.10. Herramientas de TI
- **Notas Técnicas:** Una base de conocimiento interna para documentar procedimientos, guías y soluciones a problemas comunes, con la capacidad de vincular cada nota a un módulo específico de la aplicación.

### 3.11. Centro de Trazabilidad y Operaciones (CTO)
- **(En Construcción)** Módulo futuro para la creación y gestión de formularios digitales (boletas de entrega, movimientos de bodega, etc.) para mejorar la trazabilidad y cumplir con normativas como ISO 9001.

### 3.12. Buzón de Sugerencias (`/dashboard/admin/suggestions`)
- **Feedback Directo:** Permite a los usuarios enviar sugerencias o reportar problemas directamente desde la interfaz.
- **Panel de Administración:** Los administradores pueden ver, gestionar y marcar como leídas las sugerencias para un seguimiento efectivo.

### 3.13. Centro de Ayuda (`/dashboard/help`)
- **Documentación Integrada**: Una guía de usuario completa y siempre actualizada, directamente accesible desde la aplicación.
- **Búsqueda Inteligente**: Incluye una barra de búsqueda que filtra y resalta las secciones relevantes en tiempo real.

---

## 4. Gestión de Usuarios y Seguridad

### 4.1. Recuperación de Contraseña
- **Flujo de Autoservicio:** Los usuarios pueden hacer clic en "¿Olvidaste tu contraseña?" en la pantalla de login.
- **Correo Seguro:** El sistema envía una contraseña temporal al correo electrónico registrado del usuario.
- **Configuración SMTP:** Un administrador debe configurar las credenciales del servidor de correo (SMTP) en **Administración > Configuración de Correo** para que esta función esté activa.

### 4.2. Cambio de Contraseña Forzado
- **Para Nuevos Usuarios:** Al crear un nuevo usuario, un administrador puede marcar la opción **"Forzar cambio de contraseña en el próximo inicio de sesión"**.
- **Para Contraseñas Recuperadas:** Este proceso se activa automáticamente cuando un usuario utiliza una contraseña temporal.
- **Proceso:** Tras iniciar sesión, la misma tarjeta de login se transformará para solicitarle al usuario que establezca una nueva contraseña personal antes de poder acceder al sistema.

---

## 5. Instalación y Despliegue

1.  **Instalar dependencias**:
    ```bash
    npm install
    ```
2.  **(Opcional) Configurar Conexiones Externas**:
    -   Crea un archivo llamado `.env.local` en la raíz del proyecto.
    -   Añade las siguientes líneas con tus credenciales. Solo necesitas las que vayas a usar.
        ```
        # Para conexión a SQL Server
        SQL_SERVER_USER=tu_usuario
        SQL_SERVER_PASSWORD=tu_contraseña
        SQL_SERVER_HOST=ip_del_servidor
        SQL_SERVER_DATABASE=nombre_bd
        SQL_SERVER_PORT=1433

        # Para envío de correos (SMTP)
        SMTP_HOST=smtp.tuproveedor.com
        SMTP_PORT=587
        SMTP_USER=tu_correo@ejemplo.com
        SMTP_PASS=tu_contraseña_de_correo
        SMTP_SECURE=true
        ```
3.  **Ejecutar en desarrollo**:
    ```bash
    npm run dev
    ```
    La aplicación se iniciará en `http://localhost:9003`.
4.  **Primer Inicio de Sesión**:
    -   Al acceder por primera vez, la aplicación te presentará un **Asistente de Configuración**.
    -   Deberás crear el **primer usuario administrador**.
5.  **Construir y Ejecutar en Producción**:
    ```bash
    npm run build
    npm run start
    ```
    Se recomienda usar un gestor de procesos como **PM2** (para Linux) o configurar el sitio en **IIS** (para Windows). Puedes encontrar guías detalladas en la carpeta `deployment/`.

### 5.1. (Opcional) Automatización de Sincronización (Cron Job)
### 5.1. (Opcional) Automatización (Cron Jobs)

**Paso 1: Configurar la Clave Secreta**

1.  Abre (o crea) el archivo `.env.local` en la raíz de tu proyecto en el servidor.
2.  Añade la siguiente línea, reemplazando el valor con una cadena de texto larga y aleatoria:
    ```
    CRON_SECRET="tu_clave_super_secreta_y_aleatoria_aqui"
    ```
    *Puedes generar una clave segura en Linux con el comando: `openssl rand -base64 32`*

**Paso 2: Configurar las Tareas Programadas**

El sistema cuenta con tres endpoints de automatización de fondo (cron) que deben ejecutarse mediante peticiones `POST` seguras incluyendo el token `Bearer <CRON_SECRET>` en la cabecera de autorización:

1. **Sincronización ERP:** `/api/cron/sync-erp` (Recomendado diariamente a las 2:00 AM)
2. **Auditoría de Flota (Alertas/RTV/Permisos):** `/api/cron/fleet-audit` (Recomendado diariamente a las 6:00 AM)
3. **Limpieza de Colas de Entregas (Históricos):** `/api/cron/delivery-cleanup` (Recomendado semanalmente, ej. domingos a las 3:00 AM)

**Ejemplo para Linux (usando `crontab`):**

1.  Abre el editor de cron con el comando `crontab -e`.
2.  Añade las siguientes líneas para automatizar las tareas:

    ```bash
    # Sincroniza Clic-Tools con el ERP diariamente
    0 2 * * * curl -X POST -H "Authorization: Bearer tu_clave_super_secreta_y_aleatoria_aqui" http://localhost:9003/api/cron/sync-erp
    # Ejecuta la auditoría de alertas y vencimientos de flota diariamente
    0 6 * * * curl -X POST -H "Authorization: Bearer tu_clave_super_secreta_y_aleatoria_aqui" http://localhost:9003/api/cron/fleet-audit
    # Limpieza semanal de colas e históricos de entregas (Domingos)
    0 3 * * 0 curl -X POST -H "Authorization: Bearer tu_clave_super_secreta_y_aleatoria_aqui" http://localhost:9003/api/cron/delivery-cleanup
    ```
    *Asegúrate de que `http://localhost:9003` sea la dirección y puerto correctos de tu aplicación en el servidor.*

**Ejemplo para Windows (usando el Programador de Tareas):**

1.  Abre el "Programador de Tareas".
2.  Crea una nueva "Tarea Básica" para cada uno de los endpoints anteriores.
3.  **Desencadenador:** Configúrala para que se ejecute de forma programada (ej. Diariamente a las 02:00, 06:00, o Semanalmente para limpieza).
4.  **Acción:** Selecciona "Iniciar un programa".
5.  **Programa/script:** `powershell`
6.  **Agregar argumentos (opcional):** Pega el respectivo comando para cada tarea, reemplazando la URL y la clave secreta:

    *   **Para Sincronización ERP:**
        ```powershell
        -NoProfile -WindowStyle Hidden -Command "Invoke-WebRequest -Uri 'http://localhost:9003/api/cron/sync-erp' -Method POST -Headers @{'Authorization' = 'Bearer tu_clave_super_secreta_y_aleatoria_aqui'} -UseBasicParsing"
        ```
    *   **Para Auditoría de Flota:**
        ```powershell
        -NoProfile -WindowStyle Hidden -Command "Invoke-WebRequest -Uri 'http://localhost:9003/api/cron/fleet-audit' -Method POST -Headers @{'Authorization' = 'Bearer tu_clave_super_secreta_y_aleatoria_aqui'} -UseBasicParsing"
        ```
    *   **Para Limpieza de Entregas:**
        ```powershell
        -NoProfile -WindowStyle Hidden -Command "Invoke-WebRequest -Uri 'http://localhost:9003/api/cron/delivery-cleanup' -Method POST -Headers @{'Authorization' = 'Bearer tu_clave_super_secreta_y_aleatoria_aqui'} -UseBasicParsing"
        ```
7.  Finaliza el asistente para cada tarea.

Una vez configuradas, las tareas de sincronización, alertas de flota y depuración del histórico correrán automáticamente. Si actualizas las consultas SQL desde el panel de administración, el cron job usará las nuevas consultas en su próxima ejecución.

---

## 6. Proceso de Actualización de Versiones

Actualizar la aplicación a una nueva versión sin perder datos es un proceso crítico. Sigue estos pasos cuidadosamente.

**Filosofía de Actualización:** La aplicación está diseñada para manejar cambios en la base de datos de forma automática. Al iniciar, el sistema verifica si faltan tablas o columnas y las añade sin borrar los datos existentes. Este proceso se conoce como **migración**.

### Proceso de Actualización Seguro:

1.  **Paso 1: Realizar una Copia de Seguridad (¡CRÍTICO!)**
    -   Antes de hacer cualquier cambio, ve a **Administración > Mantenimiento** y haz clic en **"Crear Punto de Restauración"**.
    -   Haz también una copia manual del archivo `.env.local` si lo estás usando.

2.  **Paso 2: Reemplazar los Archivos de la Aplicación**
    -   Detén la aplicación en el servidor.
    -   Elimina todos los archivos y carpetas de la versión anterior **EXCEPTO** la carpeta `dbs/` y el archivo `.env.local`.
    -   Copia todos los archivos y carpetas de la **nueva versión** en el directorio de la aplicación.

3.  **Paso 3: Actualizar Dependencias y Reconstruir**
    -   Abre una terminal en la carpeta del proyecto en el servidor.
    -   Ejecuta `npm install --omit=dev` para instalar cualquier nueva dependencia.
    -   Ejecuta `npm run build` para compilar la nueva versión.

4.  **Paso 4: Reiniciar la Aplicación**
    -   Inicia la aplicación nuevamente.
    -   Al primer inicio, la aplicación detectará las diferencias y aplicará las migraciones necesarias automáticamente.

5.  **Paso 5: Verificar**
    -   Accede a la aplicación y verifica que tus datos sigan ahí y que las nuevas funcionalidades operen correctamente.

---

## 7. Créditos y Licencia

Este proyecto es desarrollado y mantenido por CLIC SOPORTE Y CLIC TIENDA S.R.L. y se distribuye bajo la **Licencia MIT**.
    