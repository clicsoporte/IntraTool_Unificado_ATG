import { authorizeSession } from "@/modules/core/lib/auth-guard";
import { hasPermission as hasPermissionServer } from "@/modules/core/lib/auth";
import { redirect } from 'next/navigation';
import ClosuresClient from "./client";

export const dynamic = 'force-dynamic';

export default async function Page() {
    const user = await authorizeSession();
    
    // We check if the user has any of the required permissions to access closures
    const isApprove = await hasPermissionServer(user.id, 'consignments:boleta:approve');
    const isCreate = await hasPermissionServer(user.id, 'consignments:closures:create');
    const isAnnul = await hasPermissionServer(user.id, 'consignments:closures:annul');
    
    if (!isApprove && !isCreate && !isAnnul) {
        return redirect('/dashboard');
    }
    
    return <ClosuresClient />;
}
