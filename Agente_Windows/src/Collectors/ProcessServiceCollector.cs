using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.ServiceProcess;

namespace IntraToolAgent.Collectors
{
    public class WinServiceInfo
    {
        public string Name { get; set; }
        public string DisplayName { get; set; }
        public string Status { get; set; }
    }

    public class TopProcessInfo
    {
        public string Name { get; set; }
        public int Pid { get; set; }
        public double MemoryMb { get; set; }
    }

    public class ProcessServiceResult
    {
        public List<WinServiceInfo> KeyServices { get; set; }
        public List<TopProcessInfo> TopProcesses { get; set; }

        public ProcessServiceResult()
        {
            KeyServices = new List<WinServiceInfo>();
            TopProcesses = new List<TopProcessInfo>();
        }
    }

    public static class ProcessServiceCollector
    {
        public static ProcessServiceResult Collect()
        {
            var result = new ProcessServiceResult();

            // 1. Collect Key Windows Services
            try
            {
                var services = ServiceController.GetServices();
                string[] filterList = new string[] { "spooler", "wuauserv", "windefend", "bits", "dnscache", "lanmanserver", "mssqlserver", "mysql" };

                foreach (var svc in services)
                {
                    string sName = svc.ServiceName.ToLower();
                    if (filterList.Any(f => sName.Contains(f)))
                    {
                        result.KeyServices.Add(new WinServiceInfo
                        {
                            Name = svc.ServiceName,
                            DisplayName = svc.DisplayName,
                            Status = svc.Status.ToString()
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[ProcessServiceCollector] Error leyendo servicios: " + ex.Message);
            }

            // 2. Collect Top 5 Processes by RAM Memory Consumption
            try
            {
                var processes = Process.GetProcesses();
                var topList = processes
                    .Where(p => p.Id != 0 && p.Id != 4) // Skip Idle & System kernel
                    .OrderByDescending(p =>
                    {
                        try { return p.WorkingSet64; } catch { return 0; }
                    })
                    .Take(5);

                foreach (var proc in topList)
                {
                    try
                    {
                        double memMb = Math.Round(proc.WorkingSet64 / (1024.0 * 1024.0), 1);
                        result.TopProcesses.Add(new TopProcessInfo
                        {
                            Name = proc.ProcessName,
                            Pid = proc.Id,
                            MemoryMb = memMb
                        });
                    }
                    catch { }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[ProcessServiceCollector] Error leyendo procesos: " + ex.Message);
            }

            return result;
        }
    }
}
