using System;
using System.Collections.Generic;
using System.Management;
using System.Text;

namespace IntraToolAgent.Collectors
{
    public class MonitorInfo
    {
        public string Manufacturer { get; set; }
        public string Model { get; set; }
        public string Serial { get; set; }
        public string Resolution { get; set; }
        public double? SizeInches { get; set; }

        public MonitorInfo()
        {
            Manufacturer = "";
            Model = "";
            Serial = "";
            Resolution = "";
        }
    }

    public static class MonitorCollector
    {
        public static List<MonitorInfo> Collect()
        {
            var list = new List<MonitorInfo>();
            try
            {
                var scope = new ManagementScope(@"\\.\root\wmi");
                scope.Connect();

                using (var searcher = new ManagementObjectSearcher(scope, new ObjectQuery("SELECT ManufacturerName, UserFriendlyName, SerialNumberID FROM WmiMonitorID")))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        var m = new MonitorInfo();

                        ushort[] mfgArray = obj["ManufacturerName"] as ushort[];
                        if (mfgArray != null)
                        {
                            m.Manufacturer = CleanString(mfgArray);
                        }

                        ushort[] nameArray = obj["UserFriendlyName"] as ushort[];
                        if (nameArray != null)
                        {
                            m.Model = CleanString(nameArray);
                        }

                        ushort[] serialArray = obj["SerialNumberID"] as ushort[];
                        if (serialArray != null)
                        {
                            m.Serial = CleanString(serialArray);
                        }

                        if (!string.IsNullOrEmpty(m.Manufacturer) || !string.IsNullOrEmpty(m.Model) || !string.IsNullOrEmpty(m.Serial))
                        {
                            list.Add(m);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Monitors] Error leyendo EDID: " + ex.Message);
            }

            return list;
        }

        private static string CleanString(ushort[] array)
        {
            if (array == null || array.Length == 0) return "";
            var sb = new StringBuilder();
            foreach (ushort u in array)
            {
                if (u == 0) break;
                sb.Append((char)u);
            }
            return sb.ToString().Trim();
        }
    }
}
