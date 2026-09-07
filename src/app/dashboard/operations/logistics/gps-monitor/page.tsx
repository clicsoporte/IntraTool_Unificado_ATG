import dynamic from 'next/dynamic';

const FullGpsMonitorView = dynamic(() => import('@/modules/operations/components/FullGpsMonitorView'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center p-12 text-slate-400 font-medium animate-pulse">
            Cargando Monitor GPS Interactivo...
        </div>
    )
});

export default function GpsMonitorLogisticsPage() {
    return (
        <main className="p-2 md:p-3 animate-in fade-in duration-150 min-h-screen bg-slate-950 w-full">
            <div className="w-full">
                <FullGpsMonitorView />
            </div>
        </main>
    );
}
