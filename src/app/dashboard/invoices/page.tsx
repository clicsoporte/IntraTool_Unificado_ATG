import { authorizeSession } from "@/modules/core/lib/auth-guard";
import InvoicesDashboardPage from "./client";

export const dynamic = 'force-dynamic';

export default async function Page() {
    await authorizeSession();
    return <InvoicesDashboardPage />;
}
