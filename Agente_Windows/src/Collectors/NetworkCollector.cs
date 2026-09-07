using System;
using System.Diagnostics;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace IntraToolAgent.Collectors
{
    public class NetworkInfo
    {
        public string PrimaryMac { get; set; }
        public string IpLocal { get; set; }
        public string LoggedInUser { get; set; }

        public NetworkInfo()
        {
            PrimaryMac = "";
            IpLocal = "";
            LoggedInUser = "";
        }
    }

    public static class NetworkCollector
    {
        public static NetworkInfo Collect()
        {
            var info = new NetworkInfo();

            // 1. Primary Active Network Interface (Mac Address & Local IP)
            try
            {
                var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(nic => nic.OperationalStatus == OperationalStatus.Up &&
                                  nic.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                                  nic.NetworkInterfaceType != NetworkInterfaceType.Tunnel &&
                                  !nic.Description.ToLower().Contains("virtual") &&
                                  !nic.Description.ToLower().Contains("hyper-v") &&
                                  !nic.Description.ToLower().Contains("vmware"))
                    .ToList();

                var activeNic = interfaces.FirstOrDefault();
                if (activeNic != null)
                {
                    info.PrimaryMac = string.Join(":", activeNic.GetPhysicalAddress().GetAddressBytes().Select(b => b.ToString("X2")).ToArray());

                    var ipProp = activeNic.GetIPProperties();
                    var unicast = ipProp.UnicastAddresses.FirstOrDefault(u => u.Address.AddressFamily == AddressFamily.InterNetwork);
                    if (unicast != null)
                    {
                        info.IpLocal = unicast.Address.ToString();
                    }
                }
            }
            catch { }

            // 2. Active Logged-in User (Explorer.exe owner / WMI)
            info.LoggedInUser = GetActiveUser();

            return info;
        }

        private static string GetActiveUser()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT ProcessId, Name FROM Win32_Process WHERE Name = 'explorer.exe'"))
                {
                    foreach (ManagementObject process in searcher.Get())
                    {
                        var outParams = process.InvokeMethod("GetOwner", null, null) as ManagementBaseObject;
                        if (outParams != null)
                        {
                            string user = outParams["User"] != null ? outParams["User"].ToString() : null;
                            string domain = outParams["Domain"] != null ? outParams["Domain"].ToString() : null;
                            if (!string.IsNullOrEmpty(user))
                            {
                                return string.IsNullOrEmpty(domain) ? user : domain + "\\" + user;
                            }
                        }
                    }
                }
            }
            catch { }

            return Environment.UserName;
        }
    }
}
