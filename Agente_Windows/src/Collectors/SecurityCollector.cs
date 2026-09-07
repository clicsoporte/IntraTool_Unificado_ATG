using System;
using System.Collections.Generic;
using System.Management;

namespace IntraToolAgent.Collectors
{
    public class SecurityInfo
    {
        public string BitlockerStatus { get; set; }
        public string BitlockerId { get; set; }
        public string AntivirusStatus { get; set; }

        public SecurityInfo()
        {
            BitlockerStatus = "Desactivado";
            BitlockerId = "";
            AntivirusStatus = "";
        }
    }

    public static class SecurityCollector
    {
        public static SecurityInfo Collect()
        {
            var info = new SecurityInfo();

            // 1. BitLocker Volume Encryption Status via root\CIMV2\Security\MicrosoftVolumeEncryption
            try
            {
                var scope = new ManagementScope(@"\\.\root\CIMV2\Security\MicrosoftVolumeEncryption");
                scope.Connect();

                using (var searcher = new ManagementObjectSearcher(scope, new ObjectQuery("SELECT DriveLetter, ProtectionStatus, PersistentVolumeID FROM Win32_EncryptableVolume WHERE DriveLetter = 'C:'")))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        info.BitlockerId = obj["PersistentVolumeID"] != null ? obj["PersistentVolumeID"].ToString().Trim() : "";
                        int protection = Convert.ToInt32(obj["ProtectionStatus"]);
                        info.BitlockerStatus = protection == 1 ? "Protegido (Cifrado)" : "Sin Protección";
                    }
                }
            }
            catch
            {
                info.BitlockerStatus = "No Configurado";
            }

            // 2. Antivirus Product via root\SecurityCenter2
            try
            {
                var scope = new ManagementScope(@"\\.\root\SecurityCenter2");
                scope.Connect();

                using (var searcher = new ManagementObjectSearcher(scope, new ObjectQuery("SELECT displayName, productState FROM AntiVirusProduct")))
                {
                    var names = new List<string>();
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        string name = obj["displayName"] != null ? obj["displayName"].ToString() : null;
                        if (!string.IsNullOrEmpty(name)) names.Add(name);
                    }
                    if (names.Count > 0)
                    {
                        info.AntivirusStatus = string.Join(", ", names.ToArray());
                    }
                }
            }
            catch
            {
                info.AntivirusStatus = "Windows Defender";
            }

            return info;
        }
    }
}
