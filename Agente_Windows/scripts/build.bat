@echo off
setlocal enabledelayedexpansion

echo =========================================================
echo  Compilando Agente de Servicio Windows (Nativo csc.exe)
echo =========================================================

set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
set ROOT_DIR=%~dp0..
set BIN_DIR=%ROOT_DIR%\bin
set PUBLIC_DIR=%ROOT_DIR%\..\public\downloads\Agente

if not exist "%CSC%" (
    echo [ERROR] No se encontro el compilador de C# en: %CSC%
    pause
    exit /b 1
)

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"
if not exist "%PUBLIC_DIR%" mkdir "%PUBLIC_DIR%"

echo Compilando Agente Principal (IntraToolAgent.exe)...
"%CSC%" /target:exe /reference:System.Management.dll,System.ServiceProcess.dll,System.Web.Extensions.dll,System.Net.Http.dll,System.Windows.Forms.dll,System.Drawing.dll /platform:anycpu /optimize+ /out:"%BIN_DIR%\IntraToolAgent.exe" "%ROOT_DIR%\src\Config\*.cs" "%ROOT_DIR%\src\Collectors\*.cs" "%ROOT_DIR%\src\Engine\*.cs" "%ROOT_DIR%\src\UI\*.cs" "%ROOT_DIR%\src\*.cs"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo la compilacion de IntraToolAgent.exe
    exit /b %ERRORLEVEL%
)

echo Compilando Actualizador Silencioso (updater.exe)...
"%CSC%" /target:exe /reference:System.ServiceProcess.dll /platform:anycpu /optimize+ /out:"%BIN_DIR%\updater.exe" "%ROOT_DIR%\updater\UpdaterProgram.cs"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo la compilacion de updater.exe
    exit /b %ERRORLEVEL%
)

echo Copiando archivos de configuracion y scripts...
copy /Y "%ROOT_DIR%\config\appsettings.json" "%BIN_DIR%\appsettings.json" >nul
copy /Y "%ROOT_DIR%\scripts\install-service.ps1" "%BIN_DIR%\install-service.ps1" >nul
copy /Y "%ROOT_DIR%\scripts\uninstall-service.ps1" "%BIN_DIR%\uninstall-service.ps1" >nul
copy /Y "%BIN_DIR%\IntraToolAgent.exe" "%BIN_DIR%\ClicToolsAgent-Setup.exe" >nul

echo Publicando instaladores en carpeta web (public\downloads\Agente)...
if not exist "%PUBLIC_DIR%" mkdir "%PUBLIC_DIR%"
copy /Y "%BIN_DIR%\*" "%PUBLIC_DIR%\" >nul

echo =========================================================
echo  COMPILACION Y PUBLICACION COMPLETADA EXITOSAMENTE
echo  Binarios en: %BIN_DIR%
echo  Descargas web en: %PUBLIC_DIR%
echo =========================================================
