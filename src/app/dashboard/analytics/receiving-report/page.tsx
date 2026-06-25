import { authorizePage } from "@/modules/core/lib/auth-guard";
import ClientComponent from "./client";

export const dynamic = 'force-dynamic';

export default async function Page() {
    await authorizePage('analytics:receiving-report:read');
    return <ClientComponent />;
}
