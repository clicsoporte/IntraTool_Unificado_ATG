@echo off
:: ==============================================================================
:: LANZADOR UAC PARA INSTALAR SERVICIO DE PRUEBAS / DEV (WINSW)
:: ==============================================================================
title Instalador Servicio PRUEBAS - IntraTool Unificado

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Elevando permisos de Administrador...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo.
echo ==========================================================
echo  🧪 INSTALANDO SERVICIO DE PRUEBAS/DEV (PUERTO 9004)
echo ==========================================================
echo.
IntraTool-TEST.exe install
echo.
echo 🚀 Iniciando Servicio de Pruebas...
IntraTool-TEST.exe start
echo.
echo ==========================================================
echo  🎉 Proceso finalizado. Estado del servicio:
echo ==========================================================
IntraTool-TEST.exe status
echo.
pause
