using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace IntraToolAgent.Collectors
{
    public class EventAlertInfo
    {
        public string LogName { get; set; }
        public string Source { get; set; }
        public int EventId { get; set; }
        public string Level { get; set; }
        public string Message { get; set; }
        public string TimeGenerated { get; set; }
    }

    public static class EventLogCollector
    {
        public static List<EventAlertInfo> Collect()
        {
            var alerts = new List<EventAlertInfo>();

            try
            {
                // Scan System log for critical/error events in the last 24 hours
                ScanLog("System", alerts);

                // Scan Application log for critical errors
                ScanLog("Application", alerts);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[EventLogCollector] Error al consultar EventLogs: " + ex.Message);
            }

            return alerts;
        }

        private static void ScanLog(string logName, List<EventAlertInfo> alerts)
        {
            try
            {
                if (!EventLog.Exists(logName)) return;

                using (EventLog log = new EventLog(logName))
                {
                    int entriesCount = log.Entries.Count;
                    DateTime cutoff = DateTime.Now.AddHours(-24);

                    // Scan backwards to get recent events quickly
                    int scanned = 0;
                    for (int i = entriesCount - 1; i >= 0 && scanned < 50; i--)
                    {
                        scanned++;
                        EventLogEntry entry = log.Entries[i];
                        if (entry.TimeGenerated < cutoff) break;

                        if (entry.EntryType == EventLogEntryType.Error || entry.EntryType == EventLogEntryType.Warning)
                        {
                            // Filter key errors: Disk, BSOD (BugCheck), Kernel-Power, Ntfs, BitLocker, Service Control Manager
                            string source = entry.Source ?? "";
                            int id = entry.InstanceId > 0 ? (int)(entry.InstanceId & 0xFFFF) : 0;

                            bool isCriticalSource = source.IndexOf("disk", StringComparison.OrdinalIgnoreCase) >= 0
                                || source.IndexOf("bugcheck", StringComparison.OrdinalIgnoreCase) >= 0
                                || source.IndexOf("ntfs", StringComparison.OrdinalIgnoreCase) >= 0
                                || source.IndexOf("kernel-power", StringComparison.OrdinalIgnoreCase) >= 0
                                || source.IndexOf("bitlocker", StringComparison.OrdinalIgnoreCase) >= 0
                                || entry.EntryType == EventLogEntryType.Error;

                            if (isCriticalSource)
                            {
                                string msg = entry.Message;
                                if (!string.IsNullOrEmpty(msg) && msg.Length > 250)
                                {
                                    msg = msg.Substring(0, 247) + "...";
                                }

                                alerts.Add(new EventAlertInfo
                                {
                                    LogName = logName,
                                    Source = source,
                                    EventId = id,
                                    Level = entry.EntryType.ToString(),
                                    Message = msg,
                                    TimeGenerated = entry.TimeGenerated.ToString("yyyy-MM-dd HH:mm:ss")
                                });

                                if (alerts.Count >= 20) break; // Limit payload size
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[EventLogCollector] Error escaneando " + logName + ": " + ex.Message);
            }
        }
    }
}
