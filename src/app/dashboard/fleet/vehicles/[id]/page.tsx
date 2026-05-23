import { getVehicleDetailsAction, getFleetCatalogsAction } from "@/modules/fleet/lib/actions";
import VehicleDetails from "@/modules/fleet/components/VehicleDetails";
import { authorizeAction } from "@/modules/core/lib/auth-guard";
import { notFound } from "next/navigation";

export default async function VehicleDetailsPage({ params }: { params: { id: string } }) {
    await authorizeAction('fleet:vehicles:read');
    
    const id = Number(params.id);
    if (isNaN(id)) notFound();

    const data = await getVehicleDetailsAction(id);
    if (!data.vehicle) notFound();

    const catalogs = await getFleetCatalogsAction();

    return (
        <div className="p-4 sm:p-6 max-w-full overflow-hidden">
            <VehicleDetails 
                vehicle={data.vehicle}
                fuelLogs={data.fuelLogs}
                maintenanceLogs={data.maintenanceLogs}
                permits={data.permits}
                preventativePlans={data.preventativePlans || []}
                catalogs={catalogs}
            />
        </div>
    );
}
