using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using IntraToolAgent.Collectors;
using IntraToolAgent.Config;
using IntraToolAgent.Engine;

namespace IntraToolAgent
{
    public class AgentCore
    {
        private Timer _heartbeatTimer;
        private DateTime _lastSoftwareScan = DateTime.MinValue;
        private bool _isProcessing = false;

        public void Start()
        {
            Console.WriteLine("[Core] Iniciando Agente IntraTool ITAM v{0}...", AppConfig.Current.AgentVersion);
            AppConfig.Load();

            // Run first cycle immediately
            ThreadPool.QueueUserWorkItem(delegate(object state)
            {
                RunCycle(true);
            });

            // Schedule periodic heartbeats
            int intervalMs = Math.Max(10, AppConfig.Current.HeartbeatIntervalSeconds) * 1000;
            _heartbeatTimer = new Timer(new TimerCallback(OnTimerTick), null, intervalMs, intervalMs);
        }

        public void Stop()
        {
            Console.WriteLine("[Core] Deteniendo Agente IntraTool...");
            if (_heartbeatTimer != null)
            {
                _heartbeatTimer.Dispose();
                _heartbeatTimer = null;
            }
        }

        private void OnTimerTick(object state)
        {
            RunCycle(false);
        }

        public void RunCycle(bool forceSoftwareScan)
        {
            if (_isProcessing) return;
            _isProcessing = true;

            try
            {
                // 1. Recolección de red e identidad
                var netInfo = NetworkCollector.Collect();

                // 2. Recolección de hardware, SO y batería
                var hwInfo = HardwareCollector.Collect(netInfo.PrimaryMac);

                // 3. Recolección de discos y salud SMART
                var diskInfo = DiskCollector.Collect();

                // 4. Recolección de monitores conectados (EDID)
                var monitors = MonitorCollector.Collect();

                // 5. Recolección de seguridad (BitLocker y Antivirus)
                var secInfo = SecurityCollector.Collect();

                // 5b. Recolección de EventLog (BSOD, Discos, Errores Críticos - Wazuh Pattern)
                var eventAlerts = EventLogCollector.Collect();

                // 5c. Recolección de Servicios y Top Procesos (Cockpit / OCO Pattern)
                var procSvcInfo = ProcessServiceCollector.Collect();

                // 5d. Escaneo de Subred Local (IPDiscover - OCS Pattern)
                var networkDevices = NetworkDiscoveryCollector.Collect();

                // 6. Recolección de software instalado (periódica o forzada)
                List<SoftwareInfo> softwareList = null;
                bool shouldScanSoftware = forceSoftwareScan || (DateTime.Now - _lastSoftwareScan).TotalMinutes >= AppConfig.Current.SoftwareScanIntervalMinutes;
                if (shouldScanSoftware)
                {
                    Console.WriteLine("[Core] Escaneando inventario de software instalado...");
                    softwareList = SoftwareCollector.Collect();
                    _lastSoftwareScan = DateTime.Now;
                }

                // 7. Estructurar payload
                var payload = new Dictionary<string, object>();
                payload["serial_number"] = hwInfo.SerialNumber;
                payload["hardware_id"] = hwInfo.HardwareId;
                payload["hostname"] = hwInfo.Hostname;
                payload["manufacturer"] = hwInfo.Manufacturer;
                payload["model"] = hwInfo.Model;
                payload["category"] = hwInfo.IsLaptop == 1 ? "Laptop" : "Desktop";
                payload["branch_id"] = AppConfig.Current.DefaultBranchId;
                payload["os_version"] = hwInfo.OsVersion;
                payload["os_build"] = hwInfo.OsBuild;
                payload["logged_in_user"] = netInfo.LoggedInUser;
                payload["domain"] = hwInfo.Domain;
                payload["cpu_name"] = hwInfo.CpuName;
                payload["cpu_usage"] = hwInfo.CpuUsage;
                payload["ram_total_gb"] = hwInfo.RamTotalGb;
                payload["ram_used_percent"] = hwInfo.RamUsedPercent;
                payload["ram_slots_total"] = hwInfo.RamSlotsTotal;
                payload["ram_slots_used"] = hwInfo.RamSlotsUsed;
                payload["ram_slots_free"] = hwInfo.RamSlotsFree;
                payload["disk_primary_free_gb"] = diskInfo.PrimaryFreeGb;
                payload["disk_primary_total_gb"] = diskInfo.PrimaryTotalGb;
                payload["disk_smart_status"] = diskInfo.SmartStatus;
                payload["battery_percent"] = hwInfo.BatteryPercent;
                payload["is_charging"] = hwInfo.IsCharging;
                payload["is_laptop"] = hwInfo.IsLaptop;
                payload["bitlocker_status"] = secInfo.BitlockerStatus;
                payload["bitlocker_id"] = secInfo.BitlockerId;
                payload["antivirus_status"] = secInfo.AntivirusStatus;
                payload["ip_address_local"] = netInfo.IpLocal;
                payload["mac_address"] = netInfo.PrimaryMac;
                payload["monitors"] = monitors;
                payload["installed_software"] = softwareList;
                payload["critical_events"] = eventAlerts;
                payload["key_services"] = procSvcInfo.KeyServices;
                payload["top_processes"] = procSvcInfo.TopProcesses;
                payload["discovered_network_devices"] = networkDevices;
                payload["agent_version"] = AppConfig.Current.AgentVersion;

                // 8. Enviar al servidor IntraTool
                Console.WriteLine("[Core] Sincronizando con {0} (Serial: {1})...", AppConfig.Current.ServerUrl, hwInfo.SerialNumber);
                var response = ApiClient.SendSync(payload);

                if (response != null && response.success)
                {
                    Console.WriteLine("[Core] Sincronización exitosa. Activo #{0}. Comandos pendientes: {1}", response.asset_id, response.commands != null ? response.commands.Count : 0);

                    // 9. Ejecutar comandos pendientes
                    if (response.commands != null && response.commands.Count > 0)
                    {
                        foreach (var cmd in response.commands)
                        {
                            CommandExecutor.Execute(cmd, delegate(int id, string status, object output)
                            {
                                ApiClient.ReportCommandResult(id, status, output);
                            });

                            if (cmd.type != null && cmd.type.ToLower() == "sync_inventory")
                            {
                                ThreadPool.QueueUserWorkItem(delegate(object state)
                                {
                                    RunCycle(true);
                                });
                            }
                        }
                    }

                    // 10. Evaluar auto-actualización OTA
                    if (response.ota != null)
                    {
                        OtaUpdater.CheckAndApply(response.ota);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Core] Error en ciclo de telemetría: " + ex.Message);
            }
            finally
            {
                _isProcessing = false;
            }
        }
    }
}
