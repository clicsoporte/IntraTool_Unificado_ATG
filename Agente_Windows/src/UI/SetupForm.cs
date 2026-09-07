using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using IntraToolAgent.Config;
using IntraToolAgent.Engine;

namespace IntraToolAgent.UI
{
    public class SetupForm : Form
    {
        private RadioButton _rbProd;
        private RadioButton _rbTest;
        private RadioButton _rbCustom;
        private TextBox _txtCustomUrl;
        private Button _btnTest;
        private Label _lblStatus;
        private Button _btnInstall;
        private Button _btnCancel;

        private const string ProdUrl = "http://192.168.1.14:9003";
        private const string TestUrl = "http://192.168.1.14:9001";

        public SetupForm()
        {
            InitializeComponents();
        }

        private void InitializeComponents()
        {
            this.Text = "Instalador ClicTools Agent - IntraTool ITAM";
            this.Size = new Size(520, 390);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            this.BackColor = Color.FromArgb(248, 250, 252);

            // Banner Header
            Panel headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 65;
            headerPanel.BackColor = Color.FromArgb(15, 23, 42); // Slate-900

            Label lblTitle = new Label();
            lblTitle.Text = "ClicTools IntraToolAgent";
            lblTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(18, 12);
            lblTitle.AutoSize = true;

            Label lblSubtitle = new Label();
            lblSubtitle.Text = "Servicio Oficial de Telemetría e Inventario TI de Windows";
            lblSubtitle.Font = new Font("Segoe UI", 8.5F);
            lblSubtitle.ForeColor = Color.FromArgb(148, 163, 184);
            lblSubtitle.Location = new Point(19, 36);
            lblSubtitle.AutoSize = true;

            headerPanel.Controls.Add(lblTitle);
            headerPanel.Controls.Add(lblSubtitle);
            this.Controls.Add(headerPanel);

            // Group Box Entornos
            GroupBox gb = new GroupBox();
            gb.Text = "Seleccione el Servidor IntraTool:";
            gb.Location = new Point(20, 80);
            gb.Size = new Size(465, 175);
            gb.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            gb.ForeColor = Color.FromArgb(30, 41, 59);

            _rbProd = new RadioButton();
            _rbProd.Text = "Servidor de Producción (192.168.1.14:9003)";
            _rbProd.Location = new Point(20, 26);
            _rbProd.Size = new Size(420, 24);
            _rbProd.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            _rbProd.Checked = true;
            _rbProd.CheckedChanged += OnEnvironmentChanged;

            _rbTest = new RadioButton();
            _rbTest.Text = "Servidor de Pruebas / Dev (192.168.1.14:9001)";
            _rbTest.Location = new Point(20, 56);
            _rbTest.Size = new Size(420, 24);
            _rbTest.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            _rbTest.CheckedChanged += OnEnvironmentChanged;

            _rbCustom = new RadioButton();
            _rbCustom.Text = "Servidor Personalizado (IP o Dominio FQDN):";
            _rbCustom.Location = new Point(20, 86);
            _rbCustom.Size = new Size(420, 24);
            _rbCustom.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            _rbCustom.CheckedChanged += OnEnvironmentChanged;

            _txtCustomUrl = new TextBox();
            _txtCustomUrl.Location = new Point(40, 114);
            _txtCustomUrl.Size = new Size(290, 23);
            _txtCustomUrl.Font = new Font("Consolas", 9F);
            _txtCustomUrl.Text = "http://192.168.1.14:9003";
            _txtCustomUrl.Enabled = false;

            _btnTest = new Button();
            _btnTest.Text = "Probar Conexión";
            _btnTest.Location = new Point(340, 112);
            _btnTest.Size = new Size(110, 26);
            _btnTest.Font = new Font("Segoe UI", 8.5F);
            _btnTest.BackColor = Color.FromArgb(241, 245, 249);
            _btnTest.UseVisualStyleBackColor = true;
            _btnTest.Click += OnTestConnectionClick;

            _lblStatus = new Label();
            _lblStatus.Text = "Listo para instalar servicio.";
            _lblStatus.Location = new Point(40, 147);
            _lblStatus.Size = new Size(410, 20);
            _lblStatus.Font = new Font("Segoe UI", 8.5F, FontStyle.Italic);
            _lblStatus.ForeColor = Color.FromArgb(100, 116, 139);

            gb.Controls.Add(_rbProd);
            gb.Controls.Add(_rbTest);
            gb.Controls.Add(_rbCustom);
            gb.Controls.Add(_txtCustomUrl);
            gb.Controls.Add(_btnTest);
            gb.Controls.Add(_lblStatus);
            this.Controls.Add(gb);

            // Bottom Buttons
            _btnInstall = new Button();
            _btnInstall.Text = "Instalar Servicio Windows";
            _btnInstall.Location = new Point(265, 275);
            _btnInstall.Size = new Size(220, 36);
            _btnInstall.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            _btnInstall.BackColor = Color.FromArgb(16, 185, 129); // Emerald-500
            _btnInstall.ForeColor = Color.White;
            _btnInstall.FlatStyle = FlatStyle.Flat;
            _btnInstall.FlatAppearance.BorderSize = 0;
            _btnInstall.Click += OnInstallClick;

            _btnCancel = new Button();
            _btnCancel.Text = "Salir";
            _btnCancel.Location = new Point(175, 275);
            _btnCancel.Size = new Size(80, 36);
            _btnCancel.Font = new Font("Segoe UI", 9F);
            _btnCancel.BackColor = Color.FromArgb(226, 232, 240);
            _btnCancel.UseVisualStyleBackColor = true;
            _btnCancel.Click += (s, e) => this.Close();

            this.Controls.Add(_btnInstall);
            this.Controls.Add(_btnCancel);
        }

        private string GetSelectedServerUrl()
        {
            if (_rbProd.Checked) return ProdUrl;
            if (_rbTest.Checked) return TestUrl;
            return _txtCustomUrl.Text.Trim();
        }

        private void OnEnvironmentChanged(object sender, EventArgs e)
        {
            if (_rbProd.Checked)
            {
                _txtCustomUrl.Enabled = false;
                _txtCustomUrl.Text = ProdUrl;
            }
            else if (_rbTest.Checked)
            {
                _txtCustomUrl.Enabled = false;
                _txtCustomUrl.Text = TestUrl;
            }
            else
            {
                _txtCustomUrl.Enabled = true;
                _txtCustomUrl.Focus();
            }
        }

        private void OnTestConnectionClick(object sender, EventArgs e)
        {
            string url = GetSelectedServerUrl();
            _lblStatus.Text = "Comprobando conexion con " + url + "...";
            _lblStatus.ForeColor = Color.Blue;
            Application.DoEvents();

            bool ok = ApiClient.TestConnection(url);
            if (ok)
            {
                _lblStatus.Text = "✅ Conexión Exitosa con el servidor.";
                _lblStatus.ForeColor = Color.FromArgb(5, 150, 105);
            }
            else
            {
                _lblStatus.Text = "❌ No hubo respuesta del servidor (Verifique IP/Puerto).";
                _lblStatus.ForeColor = Color.FromArgb(220, 38, 38);
            }
        }

        private void OnInstallClick(object sender, EventArgs e)
        {
            string targetServer = GetSelectedServerUrl();
            _btnInstall.Enabled = false;
            _lblStatus.Text = "Instalando servicio Clictoolsagent...";
            _lblStatus.ForeColor = Color.Blue;
            Application.DoEvents();

            try
            {
                bool success = ServiceInstallerHelper.InstallService(targetServer);
                if (success)
                {
                    _lblStatus.Text = "✅ ¡Servicio instalado e iniciado con éxito!";
                    _lblStatus.ForeColor = Color.FromArgb(5, 150, 105);
                    MessageBox.Show(
                        "El Agente Clictoolsagent se ha instalado correctamente como servicio de Windows.\n\n" +
                        "Servidor configurado: " + targetServer + "\n" +
                        "Cuenta de ejecución: NT AUTHORITY\\SYSTEM\n\n" +
                        "El equipo ya está reportando telemetría al servidor.",
                        "Instalación Exitosa",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                    this.Close();
                }
                else
                {
                    _lblStatus.Text = "❌ Error durante la instalación. Verifique permisos de Administrador.";
                    _lblStatus.ForeColor = Color.FromArgb(220, 38, 38);
                    _btnInstall.Enabled = true;
                }
            }
            catch (Exception ex)
            {
                _lblStatus.Text = "❌ Error: " + ex.Message;
                _lblStatus.ForeColor = Color.FromArgb(220, 38, 38);
                _btnInstall.Enabled = true;
            }
        }
    }

    public static class ServiceInstallerHelper
    {
        private const string ServiceName = "Clictoolsagent";
        private const string DisplayName = "ClicTools ITAM Agent Service";
        private const string Description = "Servicio nativo de recolección de telemetría, seguridad BitLocker e inventario para IntraTool ITAM.";
        private static readonly string TargetInstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "ClicTools\\IntraToolAgent");

        public static bool InstallService(string serverUrl)
        {
            try
            {
                // 1. Crear directorio destino
                if (!Directory.Exists(TargetInstallDir))
                {
                    Directory.CreateDirectory(TargetInstallDir);
                }

                // 2. Copiar binario actual
                string currentExePath = Process.GetCurrentProcess().MainModule.FileName;
                string targetExePath = Path.Combine(TargetInstallDir, "IntraToolAgent.exe");

                if (!string.Equals(currentExePath, targetExePath, StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(currentExePath, targetExePath, true);
                }

                // 3. Crear o actualizar appsettings.json en ProgramData y en InstallDir
                AppConfig.Load();
                AppConfig.Current.ServerUrl = serverUrl;
                if (serverUrl.Contains("9003"))
                {
                    AppConfig.Current.FallbackServers = new List<string> { "http://192.168.1.14:9001", "http://localhost:9003" };
                }
                else if (serverUrl.Contains("9001"))
                {
                    AppConfig.Current.FallbackServers = new List<string> { "http://192.168.1.14:9003", "http://localhost:9001" };
                }
                AppConfig.Save();

                // Copiar config a install dir también
                string installDirConfig = Path.Combine(TargetInstallDir, "appsettings.json");
                File.Copy(AppConfig.ConfigFilePath, installDirConfig, true);

                // 4. Detener servicio previo si existe
                RunScCommand(string.Format("stop {0}", ServiceName));
                Thread.Sleep(1000);
                RunScCommand(string.Format("delete {0}", ServiceName));
                Thread.Sleep(1000);

                // 5. Crear servicio en Windows (LocalSystem)
                string binPathWithQuotes = string.Format("\"{0}\"", targetExePath);
                int createRes = RunScCommand(string.Format("create {0} binPath= {1} start= auto DisplayName= \"{2}\"", ServiceName, binPathWithQuotes, DisplayName));
                
                RunScCommand(string.Format("description {0} \"{1}\"", ServiceName, Description));
                RunScCommand(string.Format("failure {0} reset= 86400 actions= restart/60000/restart/60000/restart/60000", ServiceName));

                // 6. Iniciar el servicio
                int startRes = RunScCommand(string.Format("start {0}", ServiceName));

                return createRes == 0 || startRes == 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error instalando servicio: " + ex.Message);
                return false;
            }
        }

        public static bool UninstallService()
        {
            try
            {
                RunScCommand(string.Format("stop {0}", ServiceName));
                Thread.Sleep(1000);
                int res = RunScCommand(string.Format("delete {0}", ServiceName));
                return res == 0;
            }
            catch (Exception)
            {
                return false;
            }
        }

        private static int RunScCommand(string arguments)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("sc.exe", arguments);
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process p = Process.Start(psi);
                p.WaitForExit(10000);
                return p.ExitCode;
            }
            catch (Exception)
            {
                return -1;
            }
        }
    }
}
