using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using IntraToolAgent.Config;

namespace IntraToolAgent.Engine
{
    public static class OtaUpdater
    {
        public static void CheckAndApply(OtaMetadata ota)
        {
            if (ota == null || string.IsNullOrEmpty(ota.file_url) || string.IsNullOrEmpty(ota.version_name)) return;

            string currentVer = AppConfig.Current.AgentVersion.TrimStart(new char[] { 'v', 'V' });
            string serverVer = ota.version_name.TrimStart(new char[] { 'v', 'V' });

            if (!IsNewerVersion(serverVer, currentVer))
            {
                return;
            }

            Console.WriteLine("[OTA] Nueva versión disponible: v{0} (Actual: v{1}). Iniciando descarga...", serverVer, currentVer);

            try
            {
                string updatesDir = Path.Combine(AppConfig.AppDataDirectory, "updates");
                if (!Directory.Exists(updatesDir)) Directory.CreateDirectory(updatesDir);

                string targetFile = Path.Combine(updatesDir, string.Format("agent_v{0}.exe", serverVer));

                // Download binary
                using (var client = new WebClient())
                {
                    client.DownloadFile(ota.file_url, targetFile);
                }

                // Verify Hash if provided
                if (!string.IsNullOrEmpty(ota.sha256_hash))
                {
                    string computedHash = ComputeSha256(targetFile);
                    if (!computedHash.Equals(ota.sha256_hash.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine("[OTA] Error: Hash SHA-256 no coincide. Descarga descartada.");
                        try { File.Delete(targetFile); } catch { }
                        return;
                    }
                }

                // Trigger updater.exe
                string currentExePath = Assembly.GetExecutingAssembly().Location;
                string exeDir = Path.GetDirectoryName(currentExePath);
                string updaterPath = Path.Combine(exeDir, "updater.exe");

                if (!File.Exists(updaterPath))
                {
                    Console.WriteLine("[OTA] updater.exe no encontrado en {0}", updaterPath);
                    return;
                }

                Console.WriteLine("[OTA] Lanzando updater.exe para actualizar servicio...");
                var psi = new ProcessStartInfo
                {
                    FileName = updaterPath,
                    Arguments = string.Format("\"{0}\" \"{1}\" \"IntraToolAgent\"", currentExePath, targetFile),
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[OTA] Error en auto-actualización: " + ex.Message);
            }
        }

        private static bool IsNewerVersion(string serverVer, string currentVer)
        {
            try
            {
                var vServer = new Version(serverVer);
                var vCurrent = new Version(currentVer);
                return vServer > vCurrent;
            }
            catch
            {
                return !serverVer.Equals(currentVer, StringComparison.OrdinalIgnoreCase);
            }
        }

        private static string ComputeSha256(string filePath)
        {
            using (var sha256 = SHA256.Create())
            using (var stream = File.OpenRead(filePath))
            {
                byte[] hash = sha256.ComputeHash(stream);
                return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            }
        }
    }
}
