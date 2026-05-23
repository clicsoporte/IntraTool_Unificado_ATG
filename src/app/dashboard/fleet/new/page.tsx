import { getFleetCatalogsAction } from "@/modules/fleet/lib/actions";
import VehicleForm from "@/modules/fleet/components/VehicleForm";
import { authorizeAction } from "@/modules/core/lib/auth-guard";

export default async function NewVehiclePage() {
    await authorizeAction('fleet:vehicles:create');
    const { settings } = await getFleetCatalogsAction();

    return (
        <div className="p-6 space-y-6">
            <VehicleForm settings={settings} />
        </div>
    );
}
