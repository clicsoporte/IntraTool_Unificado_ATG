@echo off
:: ==============================================================================
# LANZADOR AUTOMÁTICO CON UAC ELEVACIÓN PARA DESINSTALAR SERVICIO WINDOWS
:: ==============================================================================
title Desinstalador de Servicio de Windows - IntraTool Unificado

:: Verificar elevación de Administrador
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :RunPowerShell
) else (
    echo Elevando permisos de Administrador...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

:RunPowerShell
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-windows-service.ps1"
pause
