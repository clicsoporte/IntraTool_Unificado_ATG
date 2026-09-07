using System;
using System.IO;
using System.Management;

namespace IntraToolAgent.Collectors
{
    public class DiskInfo
    {
        public double PrimaryFreeGb { get; set; }
        public double PrimaryTotalGb { get; set; }
        public string SmartStatus { get; set; }

        public DiskInfo()
        {
            PrimaryFreeGb = 0;
            PrimaryTotalGb = 0;
            SmartStatus = "OK";
        }
    }

    public static class DiskCollector
    {
        public static DiskInfo Collect()
        {
            var info = new DiskInfo();

            // 1. Read System Drive (C:\) capacity
            try
            {
                string systemDrive = Path.GetPathRoot(Environment.SystemDirectory); // "C:\"
                var drive = new DriveInfo(systemDrive);
                if (drive.IsReady)
                {
                    info.PrimaryFreeGb = Math.Round((double)drive.AvailableFreeSpace / (1024 * 1024 * 1024), 1);
                    info.PrimaryTotalGb = Math.Round((double)drive.TotalSize / (1024 * 1024 * 1024), 1);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Disk] Error leyendo DriveInfo: " + ex.Message);
            }

            // 2. Read Physical Disk S.M.A.R.T. Health Status via WMI
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT Status, StatusInfo, Model FROM Win32_DiskDrive WHERE MediaType LIKE '%Fixed%' OR MediaType IS NULL"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        string status = obj["Status"] != null ? obj["Status"].ToString().Trim() : "OK";
                        if (!status.Equals("OK", StringComparison.OrdinalIgnoreCase))
                        {
                            info.SmartStatus = status; // e.g. "Pred Fail", "Error", "Degraded"
                            break;
                        }
                    }
                }
            }
            catch
            {
                info.SmartStatus = "OK";
            }

            return info;
        }
    }
}
