import { authorizePage } from "@/modules/core/lib/auth-guard";
import InvoiceReporterClient from "./client";

export const dynamic = 'force-dynamic';

export default async function Page() {
    await authorizePage('invoices:reporter:access');
    return <InvoiceReporterClient />;
}
