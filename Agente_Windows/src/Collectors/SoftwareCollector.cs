using System;
using System.Collections.Generic;
using Microsoft.Win32;

namespace IntraToolAgent.Collectors
{
    public class SoftwareInfo
    {
        public string name { get; set; }
        public string version { get; set; }
        public string publisher { get; set; }
        public string install_date { get; set; }

        public SoftwareInfo()
        {
            name = "";
            version = "";
            publisher = "";
            install_date = "";
        }
    }

    public static class SoftwareCollector
    {
        public static List<SoftwareInfo> Collect()
        {
            var list = new List<SoftwareInfo>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            string[] registryKeys = new string[]
            {
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
            };

            foreach (var keyPath in registryKeys)
            {
                try
                {
                    using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Default))
                    using (var key = hklm.OpenSubKey(keyPath))
                    {
                        if (key != null)
                        {
                            foreach (var subkeyName in key.GetSubKeyNames())
                            {
                                try
                                {
                                    using (var subkey = key.OpenSubKey(subkeyName))
                                    {
                                        if (subkey == null) continue;

                                        object nameObj = subkey.GetValue("DisplayName");
                                        string displayName = nameObj != null ? nameObj.ToString().Trim() : "";
                                        if (string.IsNullOrEmpty(displayName)) continue;

                                        object isSystemComp = subkey.GetValue("SystemComponent");
                                        if (isSystemComp != null && Convert.ToInt32(isSystemComp) == 1) continue;

                                        object verObj = subkey.GetValue("DisplayVersion");
                                        string displayVersion = verObj != null ? verObj.ToString().Trim() : "";

                                        object pubObj = subkey.GetValue("Publisher");
                                        string publisher = pubObj != null ? pubObj.ToString().Trim() : "";

                                        object dateObj = subkey.GetValue("InstallDate");
                                        string installDate = dateObj != null ? dateObj.ToString().Trim() : "";

                                        string dedupeKey = displayName + "_" + displayVersion;
                                        if (!seen.Contains(dedupeKey))
                                        {
                                            seen.Add(dedupeKey);
                                            list.Add(new SoftwareInfo
                                            {
                                                name = displayName,
                                                version = displayVersion,
                                                publisher = publisher,
                                                install_date = installDate
                                            });
                                        }
                                    }
                                }
                                catch { }
                            }
                        }
                    }
                }
                catch { }
            }

            return list;
        }
    }
}
