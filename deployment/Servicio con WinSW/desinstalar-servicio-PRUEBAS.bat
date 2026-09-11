@echo off
:: ==============================================================================
:: LANZADOR UAC PARA DESINSTALAR SERVICIO DE PRUEBAS / DEV (WINSW)
:: ==============================================================================
title Desinstalador Servicio PRUEBAS - IntraTool Unificado

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Elevando permisos de Administrador...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo.
echo ==========================================================
echo  🛑 DETENIENDO Y DESINSTALANDO SERVICIO DE PRUEBAS
echo ==========================================================
echo.
IntraTool-TEST.exe stop
echo.
IntraTool-TEST.exe uninstall
echo.
echo ✅ Servicio de Pruebas desinstalado correctamente.
echo.
pause
