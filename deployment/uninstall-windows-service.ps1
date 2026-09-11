# ==============================================================================
# SCRIPT DE DESINSTALACIÓN DE SERVICIO DE WINDOWS CON NSSM
# Sistema: IntraTool Unificado (Next.js / Node.js)
# ==============================================================================

param(
    [string]$ServiceNameInput = ""
)

$ErrorActionPreference = "Stop"

# 1. Verificar elevación de Administrador
$currentPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host " ❌ ERROR: ESTE SCRIPT REQUIERE PRIVILEGIOS DE ADMINISTRADOR" -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host " Por favor haz clic derecho en el archivo 'uninstall-service.bat' y selecciona:" -ForegroundColor Yellow
    Write-Host " 👉 'Ejecutar como Administrador'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host " Presione ENTER para salir..."
    exit 1
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "  🗑️ DESINSTALADOR DE SERVICIO DE WINDOWS" -ForegroundColor Yellow
Write-Host "  Sistema: IntraTool Unificado" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host ""

$scriptDir = $PSScriptRoot
$defaultAppDir = (Resolve-Path "$scriptDir\..").Path

if ($ServiceNameInput -eq "") {
    $inputVal = Read-Host "Nombre del Servicio a desinstalar [Por defecto: IntraTool_Unificado_Service]"
    $serviceName = if ($inputVal.Trim() -ne "") { $inputVal.Trim() } else { "IntraTool_Unificado_Service" }
} else {
    $serviceName = $ServiceNameInput
}

$nssmPath = "$defaultAppDir\deployment\nssm\win64\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    $nssmPath = "$defaultAppDir\deployment\nssm\win32\nssm.exe"
}

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if (-not $existing) {
    Write-Host "⚠️ No se encontró ningún servicio registrado con el nombre '$serviceName'." -ForegroundColor Red
    Read-Host " Presione ENTER para salir..."
    exit 0
}

Write-Host "🛑 Deteniendo servicio '$serviceName'..." -ForegroundColor Yellow
if (Test-Path $nssmPath) {
    & $nssmPath stop $serviceName 2>&1 | Out-Null
} else {
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

Write-Host "🗑️ Eliminando registro de servicio..." -ForegroundColor Yellow
if (Test-Path $nssmPath) {
    & $nssmPath remove $serviceName confirm 2>&1 | Out-Null
} else {
    & sc.exe delete $serviceName 2>&1 | Out-Null
}

Start-Sleep -Seconds 1

Write-Host ""
Write-Host "✅ El servicio de Windows '$serviceName' ha sido desinstalado correctamente." -ForegroundColor Green
Write-Host ""
