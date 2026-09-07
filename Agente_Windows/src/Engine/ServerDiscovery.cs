using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Web.Script.Serialization;
using IntraToolAgent.Config;

namespace IntraToolAgent.Engine
{
    public class DiscoveryResult
    {
        public bool success { get; set; }
        public string server_name { get; set; }
        public string http_url { get; set; }
    }

    public static class ServerDiscovery
    {
        private static readonly JavaScriptSerializer _serializer = new JavaScriptSerializer();

        /// <summary>
        /// Sends UDP broadcast ping to discover IntraTool server in local subnet (Patrón UrBackup)
        /// </summary>
        public static string DiscoverServer(int timeoutMs)
        {
            if (!AppConfig.Current.EnableUdpAutoDiscovery) return null;

            Console.WriteLine("[Discovery] Buscando servidor IntraTool en la red local via UDP Broadcast (Puerto {0})...", AppConfig.Current.DiscoveryPort);

            try
            {
                using (var udp = new UdpClient())
                {
                    udp.EnableBroadcast = true;
                    udp.Client.ReceiveTimeout = timeoutMs > 0 ? timeoutMs : 3000;

                    byte[] pingBytes = Encoding.UTF8.GetBytes("INTRATOOL_AGENT_DISCOVERY_PING");
                    var broadcastEp = new IPEndPoint(IPAddress.Broadcast, AppConfig.Current.DiscoveryPort);
                    udp.Send(pingBytes, pingBytes.Length, broadcastEp);

                    IPEndPoint remoteEp = new IPEndPoint(IPAddress.Any, 0);
                    byte[] responseBytes = udp.Receive(ref remoteEp);

                    if (responseBytes != null && responseBytes.Length > 0)
                    {
                        string responseStr = Encoding.UTF8.GetString(responseBytes).Trim();
                        Console.WriteLine("[Discovery] Respuesta recibida de {0}: {1}", remoteEp.Address, responseStr);

                        if (responseStr.StartsWith("{"))
                        {
                            var result = _serializer.Deserialize<DiscoveryResult>(responseStr);
                            if (result != null && !string.IsNullOrEmpty(result.http_url))
                            {
                                return result.http_url.TrimEnd('/');
                            }
                        }
                        else if (responseStr.StartsWith("INTRATOOL_SERVER_HERE:"))
                        {
                            return responseStr.Replace("INTRATOOL_SERVER_HERE:", "").Trim().TrimEnd('/');
                        }
                    }
                }
            }
            catch (SocketException)
            {
                Console.WriteLine("[Discovery] No se recibio respuesta UDP broadcast (Timeout).");
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Discovery] Error en auto-descubrimiento: " + ex.Message);
            }

            return null;
        }
    }
}
