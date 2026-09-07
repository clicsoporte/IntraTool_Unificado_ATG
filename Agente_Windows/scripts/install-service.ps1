# Script de Instalación Silenciosa del Agente de Servicio Windows (LocalSystem)
# Nombre del Servicio: Clictoolsagent
# Carpeta de Instalación: C:\Program Files\ClicTools\IntraToolAgent

param(
    [string]$ServerUrl = "http://localhost:3000",
    [string]$Fallback = "",
    [string]$Secret = ""
)

$ErrorActionPreference = "Stop"

$installDir = "C:\Program Files\ClicTools\IntraToolAgent"
$serviceName = "Clictoolsagent"
$currentDir = $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Instalador del Agente de Servicio Windows - ClicTools ITAM" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Crear directorio de instalación
if (-not (Test-Path $installDir)) {
    Write-Host "[1/5] Creando directorio: $installDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

# 2. Detener servicio previo si existe
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[2/5] Deteniendo servicio existente..." -ForegroundColor Yellow
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# 3. Copiar archivos ejecutables y configuración
Write-Host "[3/5] Copiando binarios y configuración..." -ForegroundColor Yellow
Copy-Item "$currentDir\IntraToolAgent.exe" "$installDir\IntraToolAgent.exe" -Force
if (Test-Path "$currentDir\updater.exe") {
    Copy-Item "$currentDir\updater.exe" "$installDir\updater.exe" -Force
}
if (Test-Path "$currentDir\appsettings.json") {
    if (-not (Test-Path "$installDir\appsettings.json")) {
        Copy-Item "$currentDir\appsettings.json" "$installDir\appsettings.json" -Force
    }
}

# 4. Registrar servicio Windows (si no existe) o actualizar binario
$binPath = "$installDir\IntraToolAgent.exe"
if (-not $existing) {
    Write-Host "[4/5] Creando servicio de Windows $serviceName bajo NT AUTHORITY\SYSTEM..." -ForegroundColor Yellow
    New-Service -Name $serviceName `
                -BinaryPathName $binPath `
                -DisplayName "ClicTools IntraTool Agent" `
                -Description "Agente de telemetría en tiempo real, inventario de hardware y administración de activos de TI para IntraTool." `
                -StartupType Automatic | Out-Null

    # Configurar recuperación automática en caso de fallo
    & sc.exe failure $serviceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
}

# 5. Aplicar parámetros de servidor si se especificaron
if ($ServerUrl -ne "http://localhost:3000" -or $Fallback -ne "") {
    Write-Host "Configurando servidor: $ServerUrl" -ForegroundColor Cyan
    & "$installDir\IntraToolAgent.exe" --set-server "$ServerUrl" $(if ($Fallback) { "--fallback" } else { "" }) $(if ($Fallback) { "$Fallback" } else { "" }) $(if ($Secret) { "--secret" } else { "" }) $(if ($Secret) { "$Secret" } else { "" }) | Out-Null
}

# 6. Iniciar servicio
Write-Host "[5/5] Iniciando servicio..." -ForegroundColor Green
Start-Service -Name $serviceName

Write-Host ""
Write-Host "✅ Agente instalado e iniciado exitosamente como Servicio de Windows ($serviceName)!" -ForegroundColor Green
Write-Host "Ruta de configuración: $installDir\appsettings.json" -ForegroundColor Yellow
Write-Host "Verifica el estado en: /dashboard/it-tools/assets" -ForegroundColor Cyan
