using System;
using System.IO;
using System.Management;
using System.Security.Cryptography;
using System.Text;
using IntraToolAgent.Config;

namespace IntraToolAgent.Collectors
{
    public class HardwareInfo
    {
        public string SerialNumber { get; set; }
        public string HardwareId { get; set; }
        public string Manufacturer { get; set; }
        public string Model { get; set; }
        public string CpuName { get; set; }
        public float CpuUsage { get; set; }
        public double RamTotalGb { get; set; }
        public double RamUsedPercent { get; set; }
        public int? BatteryPercent { get; set; }
        public int IsCharging { get; set; }
        public int IsLaptop { get; set; }
        public string Hostname { get; set; }
        public string OsVersion { get; set; }
        public string OsBuild { get; set; }
        public string Domain { get; set; }
        public int RamSlotsTotal { get; set; }
        public int RamSlotsUsed { get; set; }
        public int RamSlotsFree { get; set; }

        public HardwareInfo()
        {
            SerialNumber = "";
            HardwareId = "";
            Manufacturer = "";
            Model = "";
            CpuName = "";
            CpuUsage = 0;
            RamTotalGb = 0;
            RamUsedPercent = 0;
            IsCharging = 0;
            IsLaptop = 1;
            Hostname = "";
            OsVersion = "";
            OsBuild = "";
            Domain = "";
            RamSlotsTotal = 0;
            RamSlotsUsed = 0;
            RamSlotsFree = 0;
        }
    }

    public static class HardwareCollector
    {
        public static HardwareInfo Collect(string primaryMac)
        {
            var info = new HardwareInfo
            {
                Hostname = Environment.MachineName,
                OsVersion = GetOsFriendlyName(),
                OsBuild = Environment.OSVersion.Version.ToString(),
                Domain = Environment.UserDomainName
            };

            // 1. BIOS Serial Number & Manufacturer
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT SerialNumber, Manufacturer FROM Win32_BIOS"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        info.SerialNumber = obj["SerialNumber"] != null ? obj["SerialNumber"].ToString().Trim() : "";
                        if (string.IsNullOrEmpty(info.Manufacturer))
                        {
                            info.Manufacturer = obj["Manufacturer"] != null ? obj["Manufacturer"].ToString().Trim() : "";
                        }
                    }
                }
            }
            catch { }

            // 2. Computer System (Model, Manufacturer, RAM)
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT Manufacturer, Model, TotalPhysicalMemory, Domain FROM Win32_ComputerSystem"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        if (string.IsNullOrEmpty(info.Manufacturer) || info.Manufacturer.ToLower().Contains("bios"))
                        {
                            info.Manufacturer = obj["Manufacturer"] != null ? obj["Manufacturer"].ToString().Trim() : info.Manufacturer;
                        }
                        info.Model = obj["Model"] != null ? obj["Model"].ToString().Trim() : "";
                        if (obj["Domain"] != null && !string.IsNullOrEmpty(obj["Domain"].ToString()))
                        {
                            info.Domain = obj["Domain"].ToString().Trim();
                        }

                        if (obj["TotalPhysicalMemory"] != null)
                        {
                            double bytes = Convert.ToDouble(obj["TotalPhysicalMemory"]);
                            info.RamTotalGb = Math.Round(bytes / (1024 * 1024 * 1024), 1);
                        }
                    }
                }
            }
            catch { }

            // 3. System Product UUID & Fallback Serial Persisted (Patrón OCS Inventory)
            info.HardwareId = GetOrCreateHardwareId(info.SerialNumber, primaryMac);
            if (string.IsNullOrEmpty(info.SerialNumber) || info.SerialNumber.Equals("Default string", StringComparison.OrdinalIgnoreCase) || info.SerialNumber.Equals("System Serial Number", StringComparison.OrdinalIgnoreCase))
            {
                info.SerialNumber = info.HardwareId;
            }

            // 4. Processor (CPU)
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT Name, LoadPercentage FROM Win32_Processor"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        info.CpuName = obj["Name"] != null ? obj["Name"].ToString().Trim() : "";
                        if (obj["LoadPercentage"] != null)
                        {
                            info.CpuUsage = Convert.ToSingle(obj["LoadPercentage"]);
                        }
                    }
                }
            }
            catch { }

            // 5. RAM Usage (Available memory)
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT FreePhysicalMemory, TotalVisibleMemorySize FROM Win32_OperatingSystem"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        if (obj["FreePhysicalMemory"] != null && obj["TotalVisibleMemorySize"] != null)
                        {
                            double freeKb = Convert.ToDouble(obj["FreePhysicalMemory"]);
                            double totalKb = Convert.ToDouble(obj["TotalVisibleMemorySize"]);
                            if (totalKb > 0)
                            {
                                info.RamUsedPercent = Math.Round(((totalKb - freeKb) / totalKb) * 100, 1);
                            }
                        }
                    }
                }
            }
            catch { }

            // 5b. RAM Slots (Total & Used) - OCS Inventory Pattern
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT MemoryDevices FROM Win32_PhysicalMemoryArray"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        if (obj["MemoryDevices"] != null)
                        {
                            info.RamSlotsTotal += Convert.ToInt32(obj["MemoryDevices"]);
                        }
                    }
                }

                using (var searcher = new ManagementObjectSearcher("SELECT BankLabel FROM Win32_PhysicalMemory"))
                {
                    info.RamSlotsUsed = searcher.Get().Count;
                }

                info.RamSlotsFree = Math.Max(0, info.RamSlotsTotal - info.RamSlotsUsed);
            }
            catch { }

            // 6. Battery Status (Laptop vs Desktop)
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT EstimatedChargeRemaining, BatteryStatus FROM Win32_Battery"))
                {
                    var collection = searcher.Get();
                    if (collection.Count > 0)
                    {
                        info.IsLaptop = 1;
                        foreach (ManagementObject obj in collection)
                        {
                            if (obj["EstimatedChargeRemaining"] != null)
                            {
                                info.BatteryPercent = Convert.ToInt32(obj["EstimatedChargeRemaining"]);
                            }
                            if (obj["BatteryStatus"] != null)
                            {
                                int status = Convert.ToInt32(obj["BatteryStatus"]);
                                info.IsCharging = (status == 2 || status == 6 || status == 7 || status == 8) ? 1 : 0;
                            }
                        }
                    }
                    else
                    {
                        info.IsLaptop = 0;
                        info.BatteryPercent = null;
                        info.IsCharging = 0;
                    }
                }
            }
            catch
            {
                info.IsLaptop = 0;
                info.BatteryPercent = null;
            }

            return info;
        }

        private static string GetOsFriendlyName()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT Caption, Version FROM Win32_OperatingSystem"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        return obj["Caption"] != null ? obj["Caption"].ToString().Trim() : "Windows";
                    }
                }
            }
            catch { }
            return "Windows " + Environment.OSVersion.Version.Major;
        }

        private static string GetOrCreateHardwareId(string serialNumber, string mac)
        {
            string idFile = Path.Combine(AppConfig.AppDataDirectory, "hardware_id.txt");
            if (File.Exists(idFile))
            {
                try
                {
                    string existing = File.ReadAllText(idFile).Trim();
                    if (!string.IsNullOrEmpty(existing)) return existing;
                }
                catch { }
            }

            string rawId = "";
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT UUID FROM Win32_ComputerSystemProduct"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        rawId = obj["UUID"] != null ? obj["UUID"].ToString().Trim() : "";
                    }
                }
            }
            catch { }

            if (string.IsNullOrEmpty(rawId) || rawId.Equals("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF", StringComparison.OrdinalIgnoreCase))
            {
                string seed = Environment.MachineName + "_" + mac + "_" + serialNumber;
                using (var md5 = MD5.Create())
                {
                    byte[] hash = md5.ComputeHash(Encoding.UTF8.GetBytes(seed));
                    rawId = new Guid(hash).ToString();
                }
            }

            try
            {
                File.WriteAllText(idFile, rawId);
            }
            catch { }

            return rawId;
        }
    }
}
