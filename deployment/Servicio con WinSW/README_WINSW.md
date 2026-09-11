# 🛠️ Guía de Despliegue como Servicio de Windows (WinSW)

Esta carpeta contiene la configuración basada en **WinSW v3 (Windows Service Wrapper)** para empaquetar la aplicación IntraTool Unificado en ejecutable nativo de Windows.

---

## 📁 Archivos Disponibles

| Entorno | Puerto HTTP | Ejecutable Principal | Script de Instalación | Script de Desinstalación |
| :--- | :---: | :--- | :--- | :--- |
| **Producción (`PROD`)** | **`9003`** | [`IntraTool-PROD.exe`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/deployment/Servicio%20con%20WinSW/IntraTool-PROD.exe) | [`instalar-servicio-PROD.bat`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/deployment/Servicio%20con%20WinSW/instalar-servicio-PROD.bat) | [`desinstalar-servicio-PROD.bat`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/deployment/Servicio%20con%20WinSW/desinstalar-servicio-PROD.bat) |
| **Pruebas (`TEST`)** | **`9004`** | [`IntraTool-TEST.exe`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/deployment/Servicio%20con%20WinSW/IntraTool-TEST.exe) | [`instalar-servicio-PRUEBAS.bat`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/deployment/Servicio%20con%20WinSW/instalar-servicio-PRUEBAS.bat) | [`desinstalar-servicio-PRUEBAS.bat`](file:///c:/Proyectos_Clic/Garend/IntraTool_Gravity_Entregas/IntraTool_Unificado_Grav/deployment/Servicio%20con%20WinSW/desinstalar-servicio-PRUEBAS.bat) |

---

## 🚀 Uso Rápido

1. **Instalar el Servicio**:
   - Haz clic derecho sobre `instalar-servicio-PROD.bat` (o `instalar-servicio-PRUEBAS.bat`) y selecciona **Ejecutar como Administrador**.
2. **Comprobar Estado**:
   - En una consola CMD elevada en esta carpeta puedes ejecutar:
     ```cmd
     IntraTool-PROD.exe status
     ```
3. **Desinstalar**:
   - Haz clic derecho sobre `desinstalar-servicio-PROD.bat` y selecciona **Ejecutar como Administrador**.

---

## ⚙️ Características Técnicas

- **Reinicio Automático**: Si el servidor web llega a fallar, WinSW reintenta iniciarlo automáticamente tras 5 segundos.
- **Logs Rotativos**: Guarda salidas en `\logs\` rotando automáticamente cada 10 MB.
- **Sin Dependencias de PowerShell**: Todo el manejo del servicio (install/uninstall/start/stop/status) está integrado en el ejecutable `.exe`.
