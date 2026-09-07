# Script de Desinstalación del Agente de Servicio Windows
# Ejecutar como Administrador en PowerShell

$serviceName = "Clictoolsagent"
$installDir = "C:\Program Files\ClicTools\IntraToolAgent"

Write-Host "Deteniendo y eliminando servicio $serviceName..." -ForegroundColor Yellow

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    & sc.exe delete $serviceName | Out-Null
}

if (Test-Path $installDir) {
    Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "✅ Servicio $serviceName desinstalado completamente." -ForegroundColor Green
