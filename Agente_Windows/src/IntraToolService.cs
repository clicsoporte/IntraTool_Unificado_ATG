using System.ServiceProcess;

namespace IntraToolAgent
{
    public class IntraToolService : ServiceBase
    {
        private AgentCore _core;

        public IntraToolService()
        {
            ServiceName = "IntraToolAgent";
            CanStop = true;
            CanShutdown = true;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            _core = new AgentCore();
            _core.Start();
        }

        protected override void OnStop()
        {
            if (_core != null)
            {
                _core.Stop();
                _core = null;
            }
        }
    }
}
