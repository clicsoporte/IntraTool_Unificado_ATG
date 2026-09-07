using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

namespace IntraToolUpdater
{
    class UpdaterProgram
    {
        static void Main(string[] args)
        {
            if (args.Length < 2)
            {
                Console.WriteLine("Uso: updater.exe <RutaActualExe> <RutaNuevoExe> [NombreServicio]");
                return;
            }

            string currentExe = args[0];
            string newExe = args[1];
            string serviceName = args.Length >= 3 ? args[2] : "Clictoolsagent";
            string backupExe = currentExe + ".bak";

            Console.WriteLine("[Updater] Iniciando proceso de actualizacion para servicio: " + serviceName);

            try
            {
                // 1. Detener Servicio si está corriendo
                StopService(serviceName);

                // Esperar a que los archivos se liberen
                Thread.Sleep(3000);

                // 2. Respaldar versión actual
                if (File.Exists(currentExe))
                {
                    if (File.Exists(backupExe)) File.Delete(backupExe);
                    File.Move(currentExe, backupExe);
                }

                // 3. Mover nueva versión
                File.Copy(newExe, currentExe, true);
                try { File.Delete(newExe); } catch { }

                // 4. Iniciar Servicio
                StartService(serviceName);

                // 5. Validar estado en 10 segundos (Rollback si falla)
                Thread.Sleep(10000);
                if (!IsServiceRunning(serviceName))
                {
                    Console.WriteLine("[Updater] ALERTA: El servicio fallo al iniciar. Ejecutando Rollback...");
                    StopService(serviceName);
                    if (File.Exists(backupExe))
                    {
                        File.Copy(backupExe, currentExe, true);
                        StartService(serviceName);
                    }
                }
                else
                {
                    Console.WriteLine("[Updater] Actualizacion completada con exito.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Updater] Error critico durante la actualizacion: " + ex.Message);
            }
        }

        static void StopService(string serviceName)
        {
            try
            {
                using (var sc = new ServiceController(serviceName))
                {
                    if (sc.Status != ServiceControllerStatus.Stopped && sc.Status != ServiceControllerStatus.StopPending)
                    {
                        sc.Stop();
                        sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Updater] Error deteniendo servicio: " + ex.Message);
            }
        }

        static void StartService(string serviceName)
        {
            try
            {
                using (var sc = new ServiceController(serviceName))
                {
                    if (sc.Status != ServiceControllerStatus.Running && sc.Status != ServiceControllerStatus.StartPending)
                    {
                        sc.Start();
                        sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Updater] Error iniciando servicio: " + ex.Message);
            }
        }

        static bool IsServiceRunning(string serviceName)
        {
            try
            {
                using (var sc = new ServiceController(serviceName))
                {
                    return sc.Status == ServiceControllerStatus.Running;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
