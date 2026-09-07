using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Web.Script.Serialization;

namespace IntraToolAgent.Config
{
    public class AgentConfig
    {
        public string ServerUrl { get; set; }
        public List<string> FallbackServers { get; set; }
        public bool EnableUdpAutoDiscovery { get; set; }
        public int DiscoveryPort { get; set; }
        public string SecretKey { get; set; }
        public int HeartbeatIntervalSeconds { get; set; }
        public int SoftwareScanIntervalMinutes { get; set; }
        public int DefaultBranchId { get; set; }
        public string AgentVersion { get; set; }

        public AgentConfig()
        {
            ServerUrl = "http://192.168.1.14:9003";
            FallbackServers = new List<string>
            {
                "http://192.168.1.14:9001",
                "http://localhost:9003",
                "http://localhost:3000"
            };
            EnableUdpAutoDiscovery = true;
            DiscoveryPort = 3001;
            SecretKey = "";
            HeartbeatIntervalSeconds = 60;
            SoftwareScanIntervalMinutes = 360;
            DefaultBranchId = 1;
            AgentVersion = "1.0.0";
        }
    }

    public static class AppConfig
    {
        private static AgentConfig _current;
        private static readonly JavaScriptSerializer _serializer = new JavaScriptSerializer();
        private static FileSystemWatcher _watcher;

        public static AgentConfig Current
        {
            get
            {
                if (_current == null)
                {
                    Load();
                    StartWatcher();
                }
                return _current;
            }
        }

        public static string AppDataDirectory
        {
            get
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "ClicTools\\IntraToolAgent");
                try
                {
                    if (!Directory.Exists(dir))
                    {
                        Directory.CreateDirectory(dir);
                    }
                }
                catch { }
                return dir;
            }
        }

        public static string ProgramFilesDirectory
        {
            get
            {
                string pFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                return Path.Combine(pFiles, "ClicTools\\IntraToolAgent");
            }
        }

        public static string ConfigFilePath
        {
            get
            {
                // 1. Check local directory (where .exe is located)
                try
                {
                    string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                    string localConfig = Path.Combine(exeDir, "appsettings.json");
                    if (File.Exists(localConfig)) return localConfig;
                }
                catch { }

                // 2. Check Program Files (ClicTools\IntraToolAgent)
                try
                {
                    string pFilesConfig = Path.Combine(ProgramFilesDirectory, "appsettings.json");
                    if (File.Exists(pFilesConfig)) return pFilesConfig;
                }
                catch { }

                // 3. Fallback to ProgramData
                return Path.Combine(AppDataDirectory, "appsettings.json");
            }
        }

        public static void Load()
        {
            try
            {
                string path = ConfigFilePath;
                if (File.Exists(path))
                {
                    string json = File.ReadAllText(path);
                    _current = _serializer.Deserialize<AgentConfig>(json) ?? new AgentConfig();
                    if (_current.FallbackServers == null) _current.FallbackServers = new List<string>();
                }
                else
                {
                    _current = new AgentConfig();
                    Save();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Config] Error cargando configuración: " + ex.Message);
                _current = new AgentConfig();
            }
        }

        public static void Save()
        {
            try
            {
                string path = ConfigFilePath;
                string dir = Path.GetDirectoryName(path);
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                string json = _serializer.Serialize(_current);
                File.WriteAllText(path, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Config] Error guardando configuración: " + ex.Message);
            }
        }

        private static void StartWatcher()
        {
            try
            {
                string path = ConfigFilePath;
                string dir = Path.GetDirectoryName(path);
                string file = Path.GetFileName(path);

                if (Directory.Exists(dir))
                {
                    _watcher = new FileSystemWatcher(dir, file);
                    _watcher.NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size;
                    _watcher.Changed += delegate(object sender, FileSystemEventArgs e)
                    {
                        System.Threading.Thread.Sleep(500); // Wait for file flush
                        Console.WriteLine("[Config] Archivo appsettings.json modificado en caliente. Recargando...");
                        Load();
                    };
                    _watcher.EnableRaisingEvents = true;
                }
            }
            catch { }
        }
    }
}
