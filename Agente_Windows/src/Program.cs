using System;
using System.Collections.Generic;
using System.ServiceProcess;
using System.Threading;
using IntraToolAgent.Config;
using IntraToolAgent.Engine;

namespace IntraToolAgent
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            // 1. Manejo de Flags CLI para Técnicos, Despliegues GPO/Intune y Administradores
            if (args.Length > 0)
            {
                // Modo Instalación Silenciosa (GPO / Intune / Scripts)
                if (args[0].Equals("--install-silent", StringComparison.OrdinalIgnoreCase) || 
                    args[0].Equals("/qn", StringComparison.OrdinalIgnoreCase) || 
                    args[0].Equals("/quiet", StringComparison.OrdinalIgnoreCase) || 
                    args[0].Equals("/s", StringComparison.OrdinalIgnoreCase))
                {
                    string targetServer = "http://192.168.1.14:9003";
                    for (int i = 1; i < args.Length; i++)
                    {
                        if (args[i].StartsWith("SERVERURL=", StringComparison.OrdinalIgnoreCase))
                        {
                            targetServer = args[i].Substring("SERVERURL=".Length).Trim().Trim('"');
                        }
                        else if (!args[i].StartsWith("/") && !args[i].StartsWith("-"))
                        {
                            targetServer = args[i].Trim().Trim('"');
                        }
                    }

                    bool ok = IntraToolAgent.UI.ServiceInstallerHelper.InstallService(targetServer);
                    Environment.Exit(ok ? 0 : 1);
                    return;
                }

                // Modo Desinstalación
                if (args[0].Equals("--uninstall", StringComparison.OrdinalIgnoreCase) || args[0].Equals("/u", StringComparison.OrdinalIgnoreCase))
                {
                    bool ok = IntraToolAgent.UI.ServiceInstallerHelper.UninstallService();
                    Environment.Exit(ok ? 0 : 1);
                    return;
                }

                if (args[0].Equals("--set-server", StringComparison.OrdinalIgnoreCase) && args.Length >= 2)
                {
                    string newServer = args[1].Trim();
                    AppConfig.Load();
                    AppConfig.Current.ServerUrl = newServer;

                    // Opcional: --fallback
                    for (int i = 2; i < args.Length; i++)
                    {
                        if (args[i].Equals("--fallback", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                        {
                            string[] fallbacks = args[i + 1].Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
                            AppConfig.Current.FallbackServers = new List<string>(fallbacks);
                        }
                        if (args[i].Equals("--secret", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                        {
                            AppConfig.Current.SecretKey = args[i + 1].Trim();
                        }
                    }

                    AppConfig.Save();
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("=================================================");
                    Console.WriteLine(" [OK] Servidor configurado: " + newServer);
                    if (AppConfig.Current.FallbackServers != null && AppConfig.Current.FallbackServers.Count > 0)
                    {
                        Console.WriteLine(" [OK] Fallbacks: " + string.Join(", ", AppConfig.Current.FallbackServers.ToArray()));
                    }
                    Console.WriteLine(" Archivo actualizado en: " + AppConfig.ConfigFilePath);
                    Console.WriteLine("=================================================");
                    Console.ResetColor();
                    return;
                }

                if (args[0].Equals("--test-connection", StringComparison.OrdinalIgnoreCase))
                {
                    AppConfig.Load();
                    Console.WriteLine("Probando conexion con servidor primario: " + AppConfig.Current.ServerUrl);
                    bool ok = ApiClient.TestConnection(AppConfig.Current.ServerUrl);
                    if (ok)
                    {
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine("✅ CONEXION EXITOSA con " + AppConfig.Current.ServerUrl);
                        Console.ResetColor();
                    }
                    else
                    {
                        Console.ForegroundColor = ConsoleColor.Red;
                        Console.WriteLine("❌ ERROR: No se pudo conectar con " + AppConfig.Current.ServerUrl);
                        Console.ResetColor();
                    }
                    return;
                }

                if (args[0].Equals("--setup", StringComparison.OrdinalIgnoreCase) || args[0].Equals("--install", StringComparison.OrdinalIgnoreCase))
                {
                    System.Windows.Forms.Application.EnableVisualStyles();
                    System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
                    System.Windows.Forms.Application.Run(new IntraToolAgent.UI.SetupForm());
                    return;
                }
            }

            // 2. Si el usuario da doble clic interactivo sin argumentos en el explorador de Windows, abrir Asistente de Instalación
            if (Environment.UserInteractive && (args.Length == 0))
            {
                // Verificar si ya está corriendo instalado en Program Files
                string currentPath = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName;
                if (!currentPath.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), StringComparison.OrdinalIgnoreCase))
                {
                    System.Windows.Forms.Application.EnableVisualStyles();
                    System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
                    System.Windows.Forms.Application.Run(new IntraToolAgent.UI.SetupForm());
                    return;
                }
            }

            // 2. Modo interactivo / Debug
            if (Environment.UserInteractive || (args.Length > 0 && args[0].Equals("--debug", StringComparison.OrdinalIgnoreCase)))
            {
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("=================================================");
                Console.WriteLine(" ClicTools IntraToolAgent (Modo Debug / Consola)");
                Console.WriteLine(" Archivo config: " + AppConfig.ConfigFilePath);
                Console.WriteLine("=================================================");
                Console.ResetColor();

                var core = new AgentCore();
                core.Start();

                Console.WriteLine("Presiona Ctrl+C o Enter para detener el agente...");
                Console.ReadLine();

                core.Stop();
            }
            else
            {
                // 3. Ejecución como Servicio nativo de Windows (LocalSystem)
                ServiceBase.Run(new ServiceBase[]
                {
                    new IntraToolService()
                });
            }
        }
    }
}
