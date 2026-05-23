import { getAllVehiclesAction, getFleetLogsReportAction } from "@/modules/fleet/lib/actions";
import FleetReportsClient from "@/modules/fleet/components/FleetReportsClient";
import { authorizeAction } from "@/modules/core/lib/auth-guard";
import { FileBarChart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function FleetReportsPage() {
    await authorizeAction('fleet:access');
    
    const vehicles = await getAllVehiclesAction();
    const fuelLogs = await getFleetLogsReportAction();

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/fleet">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-100">
                            <FileBarChart className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight">Reporte de Consumos</h1>
                            <p className="text-muted-foreground font-medium">Historial de combustible, eficiencia y análisis de costos.</p>
                        </div>
                    </div>
                </div>

                <FleetReportsClient vehicles={vehicles} fuelLogs={fuelLogs} />
            </div>
        </main>
    );
}
