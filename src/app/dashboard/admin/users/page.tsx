import { authorizePage } from "@/modules/core/lib/auth-guard";
import UsersClient from "./users-client";

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
    await authorizePage('users:read');
    return <UsersClient />;
}

