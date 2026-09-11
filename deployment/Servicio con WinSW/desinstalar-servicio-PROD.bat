@echo off
:: ==============================================================================
:: LANZADOR UAC PARA DESINSTALAR SERVICIO DE PRODUCCIÓN (WINSW)
:: ==============================================================================
title Desinstalador Servicio PRODUCCION - IntraTool Unificado

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Elevando permisos de Administrador...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo.
echo ==========================================================
echo  🛑 DETENIENDO Y DESINSTALANDO SERVICIO DE PRODUCCIÓN
echo ==========================================================
echo.
IntraTool-PROD.exe stop
echo.
IntraTool-PROD.exe uninstall
echo.
echo ✅ Servicio de Producción desinstalado correctamente.
echo.
pause
