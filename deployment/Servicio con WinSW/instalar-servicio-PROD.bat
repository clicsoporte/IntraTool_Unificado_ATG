@echo off
:: ==============================================================================
:: LANZADOR UAC PARA INSTALAR SERVICIO DE PRODUCCIÓN (WINSW)
:: ==============================================================================
title Instalador Servicio PRODUCCION - IntraTool Unificado

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Elevando permisos de Administrador...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo.
echo ==========================================================
echo  🚀 INSTALANDO SERVICIO DE PRODUCCIÓN (PUERTO 9003)
echo ==========================================================
echo.
IntraTool-PROD.exe install
echo.
echo 🚀 Iniciando Servicio...
IntraTool-PROD.exe start
echo.
echo ==========================================================
echo  🎉 Proceso finalizado. Estado del servicio:
echo ==========================================================
IntraTool-PROD.exe status
echo.
pause
