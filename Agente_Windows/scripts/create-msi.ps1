# ==============================================================================
# Script de Empaquetado MSI Nativo 100% Valido para ClicTools Agent
# Genera ClicToolsAgent.msi compatible con doble-clic GUI y GPO / quiet
# ==============================================================================

param(
    [string]$SourceExe = "$PSScriptRoot\..\bin\IntraToolAgent.exe",
    [string]$OutMsi = "$PSScriptRoot\..\bin\ClicToolsAgent.msi"
)

Write-Host "Iniciando empaquetado de ClicToolsAgent.msi..." -ForegroundColor Cyan

if (-not (Test-Path $SourceExe)) {
    Write-Error "No se encontró el ejecutable fuente: $SourceExe"
    exit 1
}

$binDir = Split-Path $SourceExe
$cabFile = Join-Path $binDir "agent.cab"

# 1. Crear archivo Cabinet comprimido con makecab.exe nativo de Windows
Write-Host "Creando cabina comprimida agent.cab..." -ForegroundColor Yellow
$makecab = "$env:SystemRoot\System32\makecab.exe"
& $makecab "$SourceExe" "$cabFile" | Out-Null

if (-not (Test-Path $cabFile)) {
    Write-Error "No se pudo generar agent.cab"
    exit 1
}

# 2. Si el archivo MSI antiguo existe, eliminarlo antes de crear
if (Test-Path $OutMsi) {
    Remove-Item -Path $OutMsi -Force
}

# 3. Crear base de datos MSI con WindowsInstaller COM
$installer = New-Object -ComObject WindowsInstaller.Installer

# msidbOpenCreate = 3
$db = $installer.GetType().InvokeMember("OpenDatabase", "InvokeMethod", $null, $installer, @($OutMsi, 3))

# 4. Crear Tablas MSI Estándar
$tablesDDL = @(
    "CREATE TABLE `Property` (`Property` CHAR(72) NOT NULL, `Value` CHAR(0) NOT NULL PRIMARY KEY `Property`)",
    "CREATE TABLE `Directory` (`Directory` CHAR(72) NOT NULL, `Directory_Parent` CHAR(72), `DefaultDir` CHAR(255) NOT NULL PRIMARY KEY `Directory`)",
    "CREATE TABLE `Feature` (`Feature` CHAR(38) NOT NULL, `Feature_Parent` CHAR(38), `Title` CHAR(64), `Description` CHAR(255), `Display` SHORT NOT NULL, `Level` SHORT NOT NULL, `Directory_` CHAR(72), `Attributes` SHORT NOT NULL PRIMARY KEY `Feature`)",
    "CREATE TABLE `Component` (`Component` CHAR(72) NOT NULL, `ComponentId` CHAR(38), `Directory_` CHAR(72) NOT NULL, `Attributes` SHORT NOT NULL, `Condition` CHAR(255), `KeyPath` CHAR(72) PRIMARY KEY `Component`)",
    "CREATE TABLE `File` (`File` CHAR(72) NOT NULL, `Component_` CHAR(72) NOT NULL, `FileName` CHAR(255) NOT NULL, `FileSize` LONG NOT NULL, `Version` CHAR(72), `Language` CHAR(20), `Attributes` SHORT, `Sequence` SHORT NOT NULL PRIMARY KEY `File`)",
    "CREATE TABLE `Media` (`DiskId` SHORT NOT NULL, `LastSequence` SHORT NOT NULL, `DiskPrompt` CHAR(64), `Cabinet` CHAR(255), `VolumeLabel` CHAR(32), `Source` CHAR(72) PRIMARY KEY `DiskId`)",
    "CREATE TABLE `CustomAction` (`Action` CHAR(72) NOT NULL, `Type` SHORT NOT NULL, `Source` CHAR(72), `Target` CHAR(255), `ExtendedType` LONG PRIMARY KEY `Action`)",
    "CREATE TABLE `InstallExecuteSequence` (`Action` CHAR(72) NOT NULL, `Condition` CHAR(255), `Sequence` SHORT PRIMARY KEY `Action`)",
    "CREATE TABLE `InstallUISequence` (`Action` CHAR(72) NOT NULL, `Condition` CHAR(255), `Sequence` SHORT PRIMARY KEY `Action`)",
    "CREATE TABLE `FeatureComponents` (`Feature_` CHAR(38) NOT NULL, `Component_` CHAR(72) NOT NULL PRIMARY KEY `Feature_`, `Component_`)"
)

foreach ($ddl in $tablesDDL) {
    $view = $db.OpenView($ddl)
    $view.Execute()
    $view.Close()
}

# 5. Insertar Propiedades del Producto
$props = @(
    @("ProductCode", "{4C4C4547-0042-3810-8054-B8C04F375301}"),
    @("ProductName", "ClicTools IntraTool ITAM Agent"),
    @("ProductVersion", "1.0.0"),
    @("ProductLanguage", "1033"),
    @("Manufacturer", "Industrias Garend S.A."),
    @("UpgradeCode", "{4C4C4547-0042-3810-8054-B8C04F375302}"),
    @("ALLUSERS", "1"),
    @("SERVERURL", "http://192.168.1.14:9003")
)

foreach ($p in $props) {
    $view = $db.OpenView("INSERT INTO `Property` (`Property`, `Value`) VALUES ('$($p[0])', '$($p[1])')")
    $view.Execute()
    $view.Close()
}

# 6. Insertar Directorios
$dirs = @(
    @("TARGETDIR", "", "SourceDir"),
    @("ProgramFilesFolder", "TARGETDIR", "PFiles"),
    @("ClicToolsFolder", "ProgramFilesFolder", "ClicTools"),
    @("INSTALLDIR", "ClicToolsFolder", "IntraToolAgent")
)
foreach ($d in $dirs) {
    $parent = if ($d[1] -eq "") { "NULL" } else { "'$($d[1])'" }
    $view = $db.OpenView("INSERT INTO `Directory` (`Directory`, `Directory_Parent`, `DefaultDir`) VALUES ('$($d[0])', $parent, '$($d[2])')")
    $view.Execute()
    $view.Close()
}

# 7. Insertar Componentes, Feature y File
$fileSize = (Get-Item $SourceExe).Length

$view = $db.OpenView("INSERT INTO `Feature` (`Feature`, `Feature_Parent`, `Title`, `Description`, `Display`, `Level`, `Directory_`, `Attributes`) VALUES ('MainFeature', NULL, 'ClicTools Agent', 'Servicio ITAM ClicTools Agent', 1, 1, 'INSTALLDIR', 0)")
$view.Execute(); $view.Close()

$view = $db.OpenView("INSERT INTO `Component` (`Component`, `ComponentId`, `Directory_`, `Attributes`, `Condition`, `KeyPath`) VALUES ('AgentExeComp', '{4C4C4547-0042-3810-8054-B8C04F375303}', 'INSTALLDIR', 0, NULL, 'IntraToolAgent.exe')")
$view.Execute(); $view.Close()

$view = $db.OpenView("INSERT INTO `FeatureComponents` (`Feature_`, `Component_`) VALUES ('MainFeature', 'AgentExeComp')")
$view.Execute(); $view.Close()

$view = $db.OpenView("INSERT INTO `File` (`File`, `Component_`, `FileName`, `FileSize`, `Version`, `Language`, `Attributes`, `Sequence`) VALUES ('IntraToolAgent.exe', 'AgentExeComp', 'IntraToolAgent.exe', $fileSize, '1.0.0', '1033', 512, 1)")
$view.Execute(); $view.Close()

# 8. Custom Actions para instalación/desinstalación de servicio
$customActions = @(
    @("InstallAgentService", 50, "INSTALLDIR", "cmd.exe /c ""[INSTALLDIR]IntraToolAgent.exe --install-silent SERVERURL=[SERVERURL]"""),
    @("UninstallAgentService", 50, "INSTALLDIR", "cmd.exe /c ""[INSTALLDIR]IntraToolAgent.exe --uninstall""")
)

foreach ($ca in $customActions) {
    $view = $db.OpenView("INSERT INTO `CustomAction` (`Action`, `Type`, `Source`, `Target`) VALUES ('$($ca[0])', $($ca[1]), '$($ca[2])', '$($ca[3])')")
    $view.Execute()
    $view.Close()
}

# 9. Secuencias Execute & UI
$execSeqs = @(
    @("CostInitialize", $null, 800),
    @("FileCost", $null, 900),
    @("CostFinalize", $null, 1000),
    @("InstallValidate", $null, 1400),
    @("InstallInitialize", $null, 1500),
    @("ProcessComponents", $null, 1600),
    @("UnpublishFeatures", $null, 1800),
    @("UninstallAgentService", "REMOVE=`"ALL`"", 1850),
    @("InstallFiles", $null, 4000),
    @("InstallAgentService", "NOT Installed", 5900),
    @("RegisterUser", $null, 6000),
    @("RegisterProduct", $null, 6100),
    @("PublishFeatures", $null, 6300),
    @("PublishProduct", $null, 6400),
    @("InstallFinalize", $null, 6600)
)

foreach ($s in $execSeqs) {
    $cond = if ($null -eq $s[1]) { "NULL" } else { "'$($s[1])'" }
    $view = $db.OpenView("INSERT INTO `InstallExecuteSequence` (`Action`, `Condition`, `Sequence`) VALUES ('$($s[0])', $cond, $($s[2]))")
    $view.Execute()
    $view.Close()
}

# Secuencia UI obligatoria para abrir el instalador con doble-clic
$uiSeqs = @(
    @("CostInitialize", $null, 800),
    @("FileCost", $null, 900),
    @("CostFinalize", $null, 1000),
    @("ExecuteAction", $null, 1300)
)

foreach ($s in $uiSeqs) {
    $view = $db.OpenView("INSERT INTO `InstallUISequence` (`Action`, `Condition`, `Sequence`) VALUES ('$($s[0])', NULL, $($s[2]))")
    $view.Execute()
    $view.Close()
}

# 10. Media Stream
$view = $db.OpenView("INSERT INTO `Media` (`DiskId`, `LastSequence`, `DiskPrompt`, `Cabinet`, `VolumeLabel`, `Source`) VALUES (1, 1, '1', '#agent.cab', NULL, NULL)")
$view.Execute(); $view.Close()

# 11. Embeber agent.cab en el stream de la base de datos MSI (_Streams)
$view = $db.OpenView("INSERT INTO `_Streams` (`Name`, `Data`) VALUES ('agent.cab', ?)")
$record = $installer.CreateRecord(1)
$record.SetStream(1, $cabFile)
$view.Execute($record)
$view.Close()

# Guardar base de datos
$db.Commit()

# 12. Summary Information Stream (Obligatorio para que Windows Explorer abra el MSI)
$sumInfo = $db.SummaryInformation(20)
$sumInfo.Property(1) = 0 # Codepage (ANSI)
$sumInfo.Property(2) = "Instalador Corporativo ClicTools Agent" # Subject
$sumInfo.Property(3) = "ClicTools IntraTool ITAM Windows Service" # Title
$sumInfo.Property(4) = "Industrias Garend S.A." # Author
$sumInfo.Property(7) = ";1033" # Languages
$sumInfo.Property(9) = "{4C4C4547-0042-3810-8054-B8C04F375301}" # Package Code
$sumInfo.Property(14) = 200 # Schema (2.0)
$sumInfo.Property(15) = 2 # WordCount (Long File Names)
$sumInfo.Persist()

# Limpiar archivo cab temporal
if (Test-Path $cabFile) {
    Remove-Item -Path $cabFile -Force
}

Write-Host "✅ Paquete MSI nativo creado exitosamente en: $OutMsi" -ForegroundColor Green
