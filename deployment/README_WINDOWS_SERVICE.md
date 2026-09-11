# ⚙️ Guía de Administración del Servicio de Windows (IntraTool Unificado)

Esta carpeta contiene el sistema automatizado de configuración e instalación del servidor **IntraTool Unificado** como un **Servicio de Windows oficial** (Service Control Manager) usando **NSSM (Non-Sucking Service Manager)**.

Al instalar la aplicación como servicio de Windows, el servidor web se ejecutará automáticamente **cada vez que la computadora o servidor Windows se reinicie**, sin necesidad de iniciar sesión de usuario.

---

## 🚀 Método 1: Instalación Rápida por Doble Clic (Recomendado)

1. Ve a la carpeta `deployment/`.
2. Haz clic derecho sobre `install-service.bat` y selecciona **Ejecutar como Administrador**.
3. La consola interactiva te solicitará confirmar o personalizar:
   - **1. Nombre del Servicio** (Por defecto: `IntraTool_Unificado_Service`).
   - **2. Carpeta de la Aplicación** (Por defecto: La ruta del proyecto).
   - **3. Puerto HTTP** (Por defecto: `9003`).
4. Al finalizar, presiona `ENTER`. El servicio quedará instalado e iniciado automáticamente.

---

## ⚡ Método 2: Instalación por Consola PowerShell de Administrador

Puedes ejecutar el script con parámetros directos sin responder preguntas:

```powershell
# Abrir PowerShell como Administrador en la carpeta deployment/
cd C:\Proyectos_Clic\Garend\IntraTool_Gravity_Entregas\IntraTool_Unificado_Grav\deployment

# Ejecutar con valores por defecto (Puerto 9003)
.\install-windows-service.ps1

# O especificando parámetros personalizados:
.\install-windows-service.ps1 -ServiceNameInput "IntraTool_Prod_Service" -PortInput "9003" -AppDirInput "C:\Proyectos_Clic\Garend\IntraTool_Gravity_Entregas\IntraTool_Unificado_Grav"
```

---

## 🗑️ Desinstalación del Servicio

Para detener y eliminar el servicio de Windows:

- **Por Doble Clic**: Haz clic derecho en `uninstall-service.bat` y selecciona **Ejecutar como Administrador**.
- **Por Consola**: Ejecuta `.\uninstall-windows-service.ps1` en PowerShell como Administrador.

---

## 📊 Verificación y Logs

- **Consola de Servicios de Windows**: Presiona `Win + R`, escribe `services.msc` y busca `IntraTool Unificado - Servicio Web Gravity`.
- **Logs de Salida y Errores**:
  - Salida estándar: `<CarpetaDelProyecto>\logs\service_stdout.log`
  - Errores de consola: `<CarpetaDelProyecto>\logs\service_stderr.log`
- **Reinicio Automático**: NSSM está configurado para reiniciar automáticamente el servidor en 5 segundos si el proceso Node.js se detuviera de forma inesperada.
