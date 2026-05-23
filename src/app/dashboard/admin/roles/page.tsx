import { authorizePage } from "@/modules/core/lib/auth-guard";
import RolesClient from "./roles-client";

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
    await authorizePage('roles:read');
    return <RolesClient />;
}

