# ==============================================================================
# SCRIPT DE INSTALACIÓN AUTOMÁTICA DE SERVICIO DE WINDOWS CON NSSM
# Sistema: IntraTool Unificado (Next.js / Node.js)
# ==============================================================================

param(
    [string]$ServiceNameInput = "",
    [string]$AppDirInput = "",
    [string]$PortInput = ""
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
    Write-Host " Por favor haz clic derecho en el archivo 'install-service.bat' y selecciona:" -ForegroundColor Yellow
    Write-Host " 👉 'Ejecutar como Administrador'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host " Presione ENTER para salir..."
    exit 1
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  🚀 INSTALADOR AUTOMÁTICO DE SERVICIO DE WINDOWS (NSSM)" -ForegroundColor Cyan
Write-Host "  Sistema: IntraTool Unificado (Next.js / Node.js)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# Resolver directorio raíz del proyecto (un nivel arriba de deployment)
$scriptDir = $PSScriptRoot
$defaultAppDir = (Resolve-Path "$scriptDir\..").Path

# 2. Prompts interactivos con valores predeterminados
if ($ServiceNameInput -eq "") {
    $inputVal = Read-Host "1. Nombre del Servicio de Windows [Por defecto: IntraTool_Unificado_Service]"
    $serviceName = if ($inputVal.Trim() -ne "") { $inputVal.Trim() } else { "IntraTool_Unificado_Service" }
} else {
    $serviceName = $ServiceNameInput
}

if ($AppDirInput -eq "") {
    $inputVal = Read-Host "2. Carpeta Raíz de la Aplicación [Por defecto: $defaultAppDir]"
    $appDir = if ($inputVal.Trim() -ne "") { (Resolve-Path $inputVal.Trim()).Path } else { $defaultAppDir }
} else {
    $appDir = (Resolve-Path $AppDirInput).Path
}

if ($PortInput -eq "") {
    $inputVal = Read-Host "3. Puerto HTTP para el servidor [Por defecto: 9003]"
    $port = if ($inputVal.Trim() -ne "") { $inputVal.Trim() } else { "9003" }
} else {
    $port = $PortInput
}

$displayName = "IntraTool Unificado - Servicio Web Gravity"
$description = "Servidor Web Oficial de IntraTool Unificado en Node.js / Next.js. Ejecuta la aplicación automáticamente en el puerto $port."

Write-Host ""
Write-Host "📋 Resumen de Configuración:" -ForegroundColor Yellow
Write-Host " • Nombre del Servicio : $serviceName" -ForegroundColor White
Write-Host " • Carpeta del Proyecto: $appDir" -ForegroundColor White
Write-Host " • Puerto HTTP        : $port" -ForegroundColor White
Write-Host ""

# 3. Ubicar ejecutable de NSSM
$nssmPath = "$appDir\deployment\nssm\win64\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    $nssmPath = "$appDir\deployment\nssm\win32\nssm.exe"
}

if (-not (Test-Path $nssmPath)) {
    Write-Host "❌ ERROR: No se encontró el ejecutable NSSM en $nssmPath" -ForegroundColor Red
    exit 1
}

# 4. Ubicar ejecutable de Node.js o npm.cmd
$npmPath = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Path
if (-not $npmPath) {
    $npmPath = (Get-Command "npm" -ErrorAction SilentlyContinue).Path
}

if (-not $npmPath) {
    Write-Host "❌ ERROR: Node.js / npm no está instalado en las variables de entorno PATH del sistema." -ForegroundColor Red
    exit 1
}

# 5. Crear directorio de logs si no existe
$logsDir = "$appDir\logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

# 6. Detener y remover servicio previo si existe
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "⚠️ Se detectó un servicio existente con el nombre '$serviceName'. Reinstalando..." -ForegroundColor Yellow
    & $nssmPath stop $serviceName 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    & $nssmPath remove $serviceName confirm 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

# 7. Registrar Servicio de Windows usando NSSM
Write-Host "⚡ Registrando Servicio de Windows mediante NSSM..." -ForegroundColor Cyan

& $nssmPath install $serviceName "$npmPath" "run start" | Out-Null
& $nssmPath set $serviceName AppDirectory "$appDir" | Out-Null
& $nssmPath set $serviceName DisplayName "$displayName" | Out-Null
& $nssmPath set $serviceName Description "$description" | Out-Null
& $nssmPath set $serviceName Start SERVICE_AUTO_START | Out-Null

# Configurar variables de entorno y logs
& $nssmPath set $serviceName AppEnvironmentExtra "PORT=$port" "NODE_ENV=production" | Out-Null
& $nssmPath set $serviceName AppStdout "$logsDir\service_stdout.log" | Out-Null
& $nssmPath set $serviceName AppStderr "$logsDir\service_stderr.log" | Out-Null
& $nssmPath set $serviceName AppRotateFiles 1 | Out-Null
& $nssmPath set $serviceName AppRotateOnline 1 | Out-Null
& $nssmPath set $serviceName AppRotateSeconds 86400 | Out-Null

# Configuración de reinicio automático en caso de fallo
& sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null

# 8. Iniciar el servicio
Write-Host "🚀 Iniciando el Servicio de Windows '$serviceName'..." -ForegroundColor Green
& $nssmPath start $serviceName | Out-Null

Start-Sleep -Seconds 3

# 9. Verificar estado final
$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($svc.Status -eq "Running") {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " 🎉 ¡SERVICIO INSTALADO E INICIADO EXITOSAMENTE!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " • Nombre del Servicio : $serviceName" -ForegroundColor White
    Write-Host " • Estado              : RUNNING (En Ejecución)" -ForegroundColor Green
    Write-Host " • Puerto Configurado  : http://localhost:$port" -ForegroundColor Cyan
    $stdoutLog = "$logsDir\service_stdout.log"
    $stderrLog = "$logsDir\service_stderr.log"
    Write-Host " [LOGS] Archivos de Log     : $stdoutLog" -ForegroundColor Gray
    Write-Host ""
} else {
    $statusName = $svc.Status
    Write-Host "[ADVERTENCIA] El servicio fue registrado pero el estado actual es: $statusName" -ForegroundColor Yellow
    Write-Host "Revisa los logs en: $stderrLog" -ForegroundColor Yellow
}
