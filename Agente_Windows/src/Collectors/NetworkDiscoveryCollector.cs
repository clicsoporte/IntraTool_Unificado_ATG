using System;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading.Tasks;

namespace IntraToolAgent.Collectors
{
    public class DiscoveredDevice
    {
        public string IpAddress { get; set; }
        public string Hostname { get; set; }
        public string Status { get; set; }
        public long ResponseTimeMs { get; set; }
    }

    public static class NetworkDiscoveryCollector
    {
        private static DateTime _lastScanTime = DateTime.MinValue;
        private static List<DiscoveredDevice> _cachedDevices = new List<DiscoveredDevice>();

        public static List<DiscoveredDevice> Collect(bool force = false)
        {
            // Run subnet scan once every 24 hours unless forced
            if (!force && (DateTime.Now - _lastScanTime).TotalHours < 24 && _cachedDevices.Count > 0)
            {
                return _cachedDevices;
            }

            var devices = new List<DiscoveredDevice>();
            try
            {
                string localIp = GetLocalIpAddress();
                if (string.IsNullOrEmpty(localIp) || localIp == "127.0.0.1") return devices;

                int lastDot = localIp.LastIndexOf('.');
                if (lastDot <= 0) return devices;

                string subnetPrefix = localIp.Substring(0, lastDot + 1);

                Console.WriteLine("[NetworkDiscovery] Escaneando subred {0}0/24...", subnetPrefix);

                var tasks = new List<Task<DiscoveredDevice>>();
                for (int i = 1; i <= 254; i++)
                {
                    string targetIp = subnetPrefix + i;
                    tasks.Add(PingHostAsync(targetIp));
                }

                Task.WaitAll(tasks.ToArray(), 5000); // 5 sec timeout overall

                foreach (var task in tasks)
                {
                    if (task.IsCompleted && !task.IsFaulted && task.Result != null)
                    {
                        devices.Add(task.Result);
                    }
                }

                _cachedDevices = devices;
                _lastScanTime = DateTime.Now;
                Console.WriteLine("[NetworkDiscovery] Escaneo finalizado. Dispositivos activos: {0}", devices.Count);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[NetworkDiscovery] Error en escaneo IP: " + ex.Message);
            }

            return devices;
        }

        private static async Task<DiscoveredDevice> PingHostAsync(string ip)
        {
            try
            {
                using (Ping p = new Ping())
                {
                    PingReply reply = await p.SendPingAsync(ip, 300);
                    if (reply.Status == IPStatus.Success)
                    {
                        string hostName = "";
                        try
                        {
                            IPHostEntry entry = await Dns.GetHostEntryAsync(ip);
                            hostName = entry.HostName;
                        }
                        catch
                        {
                            hostName = ip;
                        }

                        return new DiscoveredDevice
                        {
                            IpAddress = ip,
                            Hostname = hostName,
                            Status = "Active",
                            ResponseTimeMs = reply.RoundtripTime
                        };
                    }
                }
            }
            catch { }
            return null;
        }

        private static string GetLocalIpAddress()
        {
            try
            {
                using (Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0))
                {
                    socket.Connect("8.8.8.8", 65530);
                    IPEndPoint endPoint = socket.LocalEndPoint as IPEndPoint;
                    return endPoint.Address.ToString();
                }
            }
            catch
            {
                return "127.0.0.1";
            }
        }
    }
}
