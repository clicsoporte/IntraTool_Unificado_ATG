using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;
using IntraToolAgent.Config;

namespace IntraToolAgent.Engine
{
    public class SyncResponse
    {
        public bool success { get; set; }
        public int asset_id { get; set; }
        public string secret_key { get; set; }
        public List<CommandItem> commands { get; set; }
        public OtaMetadata ota { get; set; }
        public string error { get; set; }

        public SyncResponse()
        {
            commands = new List<CommandItem>();
        }
    }

    public class OtaMetadata
    {
        public string version_name { get; set; }
        public int version_code { get; set; }
        public string file_url { get; set; }
        public string sha256_hash { get; set; }
        public string release_notes { get; set; }
    }

    public static class ApiClient
    {
        private static readonly JavaScriptSerializer _serializer = new JavaScriptSerializer();
        private static string _activeServerUrl = null;

        static ApiClient()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;
        }

        public static string GetActiveServerUrl()
        {
            if (!string.IsNullOrEmpty(_activeServerUrl)) return _activeServerUrl;
            return AppConfig.Current.ServerUrl;
        }

        public static SyncResponse SendSync(object telemetryPayload)
        {
            // Build candidate server list (Active -> Configured -> Fallbacks -> UDP Discovery)
            var candidateUrls = new List<string>();

            if (!string.IsNullOrEmpty(_activeServerUrl)) candidateUrls.Add(_activeServerUrl);
            if (!string.IsNullOrEmpty(AppConfig.Current.ServerUrl) && !candidateUrls.Contains(AppConfig.Current.ServerUrl))
            {
                candidateUrls.Add(AppConfig.Current.ServerUrl);
            }

            if (AppConfig.Current.FallbackServers != null)
            {
                foreach (var fb in AppConfig.Current.FallbackServers)
                {
                    if (!string.IsNullOrEmpty(fb) && !candidateUrls.Contains(fb.Trim()))
                    {
                        candidateUrls.Add(fb.Trim());
                    }
                }
            }

            string jsonBody = _serializer.Serialize(telemetryPayload);

            // 1. Try candidate URLs in order
            foreach (var baseUrl in candidateUrls)
            {
                var resp = TryPostSync(baseUrl, jsonBody);
                if (resp != null && resp.success)
                {
                    if (_activeServerUrl != baseUrl)
                    {
                        Console.WriteLine("[API] Servidor activo establecido en: {0}", baseUrl);
                        _activeServerUrl = baseUrl;
                    }
                    if (!string.IsNullOrEmpty(resp.secret_key) && AppConfig.Current.SecretKey != resp.secret_key)
                    {
                        AppConfig.Current.SecretKey = resp.secret_key;
                        AppConfig.Save();
                    }
                    return resp;
                }
            }

            // 2. If all failed, trigger UDP Broadcast Auto-Discovery (UrBackup pattern)
            string discoveredUrl = ServerDiscovery.DiscoverServer(3000);
            if (!string.IsNullOrEmpty(discoveredUrl))
            {
                var resp = TryPostSync(discoveredUrl, jsonBody);
                if (resp != null && resp.success)
                {
                    Console.WriteLine("[API] Servidor descubierto y conectado: {0}", discoveredUrl);
                    _activeServerUrl = discoveredUrl;
                    AppConfig.Current.ServerUrl = discoveredUrl;
                    AppConfig.Save();
                    return resp;
                }
            }

            return new SyncResponse { success = false, error = "No se pudo conectar con ningun servidor IntraTool disponible." };
        }

        private static SyncResponse TryPostSync(string baseUrl, string jsonBody)
        {
            try
            {
                string url = baseUrl.TrimEnd('/') + "/api/it-tools/agent/sync";

                using (var client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    if (!string.IsNullOrEmpty(AppConfig.Current.SecretKey))
                    {
                        client.Headers["Authorization"] = "Bearer " + AppConfig.Current.SecretKey;
                    }
                    client.Encoding = Encoding.UTF8;

                    string responseStr = client.UploadString(url, "POST", jsonBody);
                    return _serializer.Deserialize<SyncResponse>(responseStr);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[API] Fallo intento con servidor {0}: {1}", baseUrl, ex.Message);
                return null;
            }
        }

        public static void ReportCommandResult(int commandId, string status, object output)
        {
            try
            {
                string baseUrl = GetActiveServerUrl();
                string url = baseUrl.TrimEnd('/') + "/api/it-tools/agent/commands";
                var payload = new Dictionary<string, object>();
                payload["command_id"] = commandId;
                payload["status"] = status;
                payload["result_output"] = output;

                string jsonBody = _serializer.Serialize(payload);

                using (var client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    if (!string.IsNullOrEmpty(AppConfig.Current.SecretKey))
                    {
                        client.Headers["Authorization"] = "Bearer " + AppConfig.Current.SecretKey;
                    }
                    client.Encoding = Encoding.UTF8;
                    client.UploadString(url, "POST", jsonBody);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[API] Error reportando resultado de comando #{0}: {1}", commandId, ex.Message);
            }
        }

        public static bool TestConnection(string url)
        {
            var candidateUrls = new List<string>();
            if (!string.IsNullOrEmpty(url)) candidateUrls.Add(url);
            if (!string.IsNullOrEmpty(AppConfig.Current.ServerUrl) && !candidateUrls.Contains(AppConfig.Current.ServerUrl))
            {
                candidateUrls.Add(AppConfig.Current.ServerUrl);
            }
            if (AppConfig.Current.FallbackServers != null)
            {
                foreach (var fb in AppConfig.Current.FallbackServers)
                {
                    if (!string.IsNullOrEmpty(fb) && !candidateUrls.Contains(fb.Trim()))
                    {
                        candidateUrls.Add(fb.Trim());
                    }
                }
            }

            foreach (var targetUrl in candidateUrls)
            {
                try
                {
                    string endpoint = targetUrl.TrimEnd('/') + "/api/it-tools/agent/ota/latest";
                    using (var client = new WebClient())
                    {
                        client.Encoding = Encoding.UTF8;
                        if (!string.IsNullOrEmpty(AppConfig.Current.SecretKey))
                        {
                            client.Headers["Authorization"] = "Bearer " + AppConfig.Current.SecretKey;
                        }
                        string res = client.DownloadString(endpoint);
                        if (res != null && res.Contains("success")) return true;
                    }
                }
                catch { }
            }

            return false;
        }
    }
}
