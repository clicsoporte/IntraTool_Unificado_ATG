import { getAllVehiclesAction, getFleetCatalogsAction } from "@/modules/fleet/lib/actions";
import VehicleList from "@/modules/fleet/components/VehicleList";
import FuelPriceUpdater from "@/modules/fleet/components/FuelPriceUpdater";
import RunAuditButton from "@/modules/fleet/components/RunAuditButton";
import { authorizeAction } from "@/modules/core/lib/auth-guard";
import Link from "next/link";
import { Truck, FileBarChart } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function FleetDashboardPage() {
    await authorizeAction('fleet:access');
    const vehicles = await getAllVehiclesAction();
    const catalogs = await getFleetCatalogsAction();

    return (
        <div className="p-4 md:p-6 space-y-6 md:space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-200">
                        <Truck className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Gestión de Flota</h1>
                        <p className="text-sm md:text-base text-muted-foreground font-medium">Control unificado de activos, combustible y mantenimiento.</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                    <RunAuditButton />
                    <FuelPriceUpdater settings={catalogs.settings} lastFuelPriceUpdate={catalogs.lastFuelPriceUpdate} />
                    <Link href="/dashboard/fleet/reports" className="w-full sm:w-auto">
                        <Button className="w-full bg-slate-800 hover:bg-slate-900 text-white shadow-lg transition-all">
                            <FileBarChart className="w-4 h-4 mr-2" /> Reporte de Consumos
                        </Button>
                    </Link>
                </div>
            </div>

            <VehicleList vehicles={vehicles} />
        </div>
    );
}
