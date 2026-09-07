using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using IntraToolAgent.Collectors;

namespace IntraToolAgent.Engine
{
    public class CommandItem
    {
        public int id { get; set; }
        public string type { get; set; }
        public Dictionary<string, object> payload { get; set; }
        public int priority { get; set; }

        public CommandItem()
        {
            type = "";
            payload = new Dictionary<string, object>();
            priority = 5;
        }
    }

    public static class CommandExecutor
    {
        [DllImport("user32.dll")]
        public static extern bool LockWorkStation();

        public delegate void ReportResultCallback(int commandId, string status, object output);

        public static void Execute(CommandItem cmd, ReportResultCallback onReportResult)
        {
            if (cmd == null) return;
            Console.WriteLine("[Command] Ejecutando orden #{0} de tipo '{1}' (Prioridad: {2})", cmd.id, cmd.type, cmd.priority);

            try
            {
                string cmdType = cmd.type != null ? cmd.type.ToLower() : "";

                switch (cmdType)
                {
                    case "reboot":
                        ExecuteReboot(cmd, onReportResult);
                        break;

                    case "lock":
                        ExecuteLock(cmd, onReportResult);
                        break;

                    case "sync_inventory":
                        onReportResult(cmd.id, "completed", "Inventario forzado solicitado exitosamente.");
                        break;

                    case "exec_script":
                        ExecutePowerShell(cmd, onReportResult);
                        break;

                    case "force_windows_update":
                        ExecuteWindowsUpdate(cmd, onReportResult);
                        break;

                    case "run_winget_upgrade":
                        ExecuteWinGetUpgrade(cmd, onReportResult);
                        break;

                    case "clean_temp_files":
                        ExecuteCleanTemp(cmd, onReportResult);
                        break;

                    case "flush_dns":
                        ExecuteFlushDns(cmd, onReportResult);
                        break;

                    case "gpupdate":
                        ExecuteGpUpdate(cmd, onReportResult);
                        break;

                    case "run_ipdiscover":
                        ExecuteIpDiscover(cmd, onReportResult);
                        break;

                    case "start_service":
                    case "stop_service":
                    case "restart_service":
                        ExecuteServiceControl(cmd, cmdType, onReportResult);
                        break;

                    default:
                        onReportResult(cmd.id, "failed", "Tipo de comando no reconocido: " + cmd.type);
                        break;
                }
            }
            catch (Exception ex)
            {
                onReportResult(cmd.id, "failed", "Error de ejecución: " + ex.Message);
            }
        }

        private static void ExecuteReboot(CommandItem cmd, ReportResultCallback onReportResult)
        {
            int delaySeconds = 60;
            string msg = "Reinicio de mantenimiento programado por el Administrador de TI.";

            if (cmd.payload != null)
            {
                if (cmd.payload.ContainsKey("delay_seconds") && cmd.payload["delay_seconds"] != null)
                {
                    int.TryParse(cmd.payload["delay_seconds"].ToString(), out delaySeconds);
                }
                if (cmd.payload.ContainsKey("message") && cmd.payload["message"] != null)
                {
                    msg = cmd.payload["message"].ToString();
                }
            }

            var psi = new ProcessStartInfo("shutdown.exe", string.Format("/r /t {0} /c \"{1}\"", delaySeconds, msg))
            {
                CreateNoWindow = true,
                UseShellExecute = false
            };
            Process.Start(psi);

            onReportResult(cmd.id, "completed", string.Format("Reinicio programado en {0} segundos con mensaje: {1}", delaySeconds, msg));
        }

        private static void ExecuteLock(CommandItem cmd, ReportResultCallback onReportResult)
        {
            bool locked = LockWorkStation();
            onReportResult(cmd.id, locked ? "completed" : "failed", locked ? "Sesión de Windows bloqueada exitosamente." : "No se pudo bloquear la estación de trabajo.");
        }

        private static void ExecuteWindowsUpdate(CommandItem cmd, ReportResultCallback onReportResult)
        {
            string script = @"
usoclient StartScan
$Session = New-Object -ComObject Microsoft.Update.Session
$Searcher = $Session.CreateUpdateSearcher()
$Result = $Searcher.Search('IsInstalled=0 and Type=''Software''')
if ($Result.Updates.Count -gt 0) {
    $Downloader = $Session.CreateUpdateDownloader()
    $Downloader.Updates = $Result.Updates
    $Downloader.Download()
    $Installer = $Session.CreateUpdateInstaller()
    $Installer.Updates = $Result.Updates
    $InstallResult = $Installer.Install()
    Write-Output ('Windows Update ejecutado: ' + $Result.Updates.Count + ' actualizaciones instaladas.')
} else {
    Write-Output 'El sistema está actualizado. No hay parches pendientes.'
}
";
            RunPowerShellScript(cmd.id, script, onReportResult, 300000); // 5 min timeout
        }

        private static void ExecuteWinGetUpgrade(CommandItem cmd, ReportResultCallback onReportResult)
        {
            string wingetCmd = "winget upgrade --all --include-unknown --accept-package-agreements --accept-source-agreements --silent";
            var psi = new ProcessStartInfo("cmd.exe", "/c " + wingetCmd)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            try
            {
                using (var p = Process.Start(psi))
                {
                    string output = p.StandardOutput.ReadToEnd();
                    string err = p.StandardError.ReadToEnd();
                    p.WaitForExit(300000); // 5 min timeout

                    string resultMsg = !string.IsNullOrEmpty(output) ? output : err;
                    if (string.IsNullOrEmpty(resultMsg)) resultMsg = "Comando WinGet Upgrade completado sin salida gráfica.";
                    onReportResult(cmd.id, "completed", resultMsg);
                }
            }
            catch (Exception ex)
            {
                onReportResult(cmd.id, "failed", "Error al ejecutar winget: " + ex.Message);
            }
        }

        private static void ExecuteCleanTemp(CommandItem cmd, ReportResultCallback onReportResult)
        {
            string script = @"
Remove-Item -Path $env:TEMP\* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'C:\Windows\Temp\*' -Recurse -Force -ErrorAction SilentlyContinue
Write-Output 'Archivos temporales del sistema y usuario limpiados con éxito.'
";
            RunPowerShellScript(cmd.id, script, onReportResult, 60000);
        }

        private static void ExecuteFlushDns(CommandItem cmd, ReportResultCallback onReportResult)
        {
            var psi = new ProcessStartInfo("ipconfig.exe", "/flushdns")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using (var p = Process.Start(psi))
            {
                string outStr = p.StandardOutput.ReadToEnd();
                p.WaitForExit(15000);
                onReportResult(cmd.id, "completed", outStr);
            }
        }

        private static void ExecuteGpUpdate(CommandItem cmd, ReportResultCallback onReportResult)
        {
            var psi = new ProcessStartInfo("gpupdate.exe", "/force")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using (var p = Process.Start(psi))
            {
                string outStr = p.StandardOutput.ReadToEnd();
                p.WaitForExit(30000);
                onReportResult(cmd.id, "completed", outStr);
            }
        }

        private static void ExecuteIpDiscover(CommandItem cmd, ReportResultCallback onReportResult)
        {
            var devices = NetworkDiscoveryCollector.Collect(true);
            onReportResult(cmd.id, "completed", string.Format("Escaneo de subred forzado completado. {0} dispositivos encontrados.", devices.Count));
        }

        private static void ExecuteServiceControl(CommandItem cmd, string action, ReportResultCallback onReportResult)
        {
            string serviceName = (cmd.payload != null && cmd.payload.ContainsKey("service_name") && cmd.payload["service_name"] != null)
                ? cmd.payload["service_name"].ToString()
                : "";

            if (string.IsNullOrEmpty(serviceName))
            {
                onReportResult(cmd.id, "failed", "Nombre de servicio no especificado.");
                return;
            }

            try
            {
                using (var sc = new ServiceController(serviceName))
                {
                    if (action == "start_service")
                    {
                        sc.Start();
                        sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
                        onReportResult(cmd.id, "completed", string.Format("Servicio '{0}' iniciado correctamente.", serviceName));
                    }
                    else if (action == "stop_service")
                    {
                        sc.Stop();
                        sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20));
                        onReportResult(cmd.id, "completed", string.Format("Servicio '{0}' detenido correctamente.", serviceName));
                    }
                    else if (action == "restart_service")
                    {
                        if (sc.Status == ServiceControllerStatus.Running)
                        {
                            sc.Stop();
                            sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20));
                        }
                        sc.Start();
                        sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
                        onReportResult(cmd.id, "completed", string.Format("Servicio '{0}' reiniciado correctamente.", serviceName));
                    }
                }
            }
            catch (Exception ex)
            {
                onReportResult(cmd.id, "failed", string.Format("Error al controlar servicio '{0}': {1}", serviceName, ex.Message));
            }
        }

        private static void ExecutePowerShell(CommandItem cmd, ReportResultCallback onReportResult)
        {
            string script = (cmd.payload != null && cmd.payload.ContainsKey("script") && cmd.payload["script"] != null) ? cmd.payload["script"].ToString() : "";
            if (string.IsNullOrEmpty(script))
            {
                onReportResult(cmd.id, "failed", "Script de PowerShell vacío.");
                return;
            }

            RunPowerShellScript(cmd.id, script, onReportResult, 60000);
        }

        private static void RunPowerShellScript(int cmdId, string script, ReportResultCallback onReportResult, int timeoutMs)
        {
            var psi = new ProcessStartInfo("powershell.exe", "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"" + script.Replace("\"", "\\\"") + "\"")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using (var p = Process.Start(psi))
            {
                string output = p.StandardOutput.ReadToEnd();
                string err = p.StandardError.ReadToEnd();
                p.WaitForExit(timeoutMs);

                if (p.ExitCode == 0)
                {
                    onReportResult(cmdId, "completed", string.IsNullOrEmpty(output) ? "Ejecución exitosa sin retorno." : output);
                }
                else
                {
                    onReportResult(cmdId, "failed", "ExitCode " + p.ExitCode + ": " + (string.IsNullOrEmpty(err) ? output : err));
                }
            }
        }
    }
}
