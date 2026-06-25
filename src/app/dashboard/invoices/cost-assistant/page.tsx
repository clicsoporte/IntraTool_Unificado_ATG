import { authorizePage } from "@/modules/core/lib/auth-guard";
import CostAssistantClient from "./client";

export const dynamic = 'force-dynamic';

export default async function Page() {
    await authorizePage('cost-assistant:access');
    return <CostAssistantClient />;
}
