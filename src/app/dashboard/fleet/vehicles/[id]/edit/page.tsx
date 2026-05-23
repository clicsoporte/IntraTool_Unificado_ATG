import { getVehicleByIdAction, getFleetCatalogsAction } from "@/modules/fleet/lib/actions";
import VehicleForm from "@/modules/fleet/components/VehicleForm";
import { authorizeAction } from "@/modules/core/lib/auth-guard";
import { notFound } from "next/navigation";

export default async function EditVehiclePage({ params }: { params: { id: string } }) {
    await authorizeAction('fleet:vehicles:update');
    
    const id = Number(params.id);
    if (isNaN(id)) notFound();

    const vehicle = await getVehicleByIdAction(id);
    if (!vehicle) notFound();

    const { settings } = await getFleetCatalogsAction();

    return (
        <div className="p-6">
            <VehicleForm vehicle={vehicle} settings={settings} />
        </div>
    );
}
