'use client';

import { ToolCard } from "@/components/dashboard/tool-card";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { invoicesTools } from "@/modules/core/lib/data";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/modules/core/hooks/useAuth";
import type { Tool } from "@/modules/core/types";

export default function InvoicesDashboardPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized, hasPermission } = useAuthorization();
    const { isAuthReady } = useAuth();
    
    useEffect(() => {
        setTitle("Facturas y XML");
    }, [setTitle]);

    const visibleTools = useMemo(() => {
        if (!isAuthorized) return [];
        return invoicesTools.filter(tool => hasPermission(tool.id));
    }, [isAuthorized, hasPermission]);

    if (!isAuthReady) {
        return (
             <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="grid gap-8">
                    <div>
                        <Skeleton className="h-8 w-80 mb-4" />
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            <Skeleton className="h-24 w-full" />
                             <Skeleton className="h-24 w-full" />
                        </div>
                    </div>
                </div>
            </main>
        );
    }
    
    if (visibleTools.length === 0) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="text-center text-muted-foreground">
                    No tienes permiso para acceder a ninguna herramienta en este módulo.
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="grid gap-8">
                <div>
                    <h2 className="mb-4 text-2xl font-bold tracking-tight">
                        Herramientas de Facturas y XML
                    </h2>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {visibleTools.map((tool) => (
                            <ToolCard key={tool.id} tool={tool} />
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
