/**
 * @fileoverview The main dashboard page for the analytics section.
 * It displays a grid of available analysis and reporting tools, grouped by category.
 */
'use client';

import { ToolCard } from "@/components/dashboard/tool-card";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { analyticsTools, consignmentsReportTools, inventoryReportTools, productionReportTools, purchasingReportTools } from "@/modules/core/lib/data";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/modules/core/hooks/useAuth";
import type { Tool } from "@/modules/core/types";

const Section = ({ title, tools }: { title: string, tools: any[] }) => {
    if (tools.length === 0) return null;
    return (
        <div>
            <h2 className="mb-4 text-2xl font-bold tracking-tight">{title}</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                ))}
            </div>
        </div>
    );
};

export default function AnalyticsDashboardPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized, hasPermission } = useAuthorization();
    const { isAuthReady } = useAuth();

    useEffect(() => {
        setTitle("Analíticas y Reportes");
    }, [setTitle]);

    const visibleSections = useMemo(() => {
        if (!isAuthReady || !isAuthorized) return [];
        
        const sections = [
            { title: "Reportes de Consignaciones", tools: consignmentsReportTools.filter((tool: Tool) => hasPermission(tool.id)) },
            { title: "Reportes de Compras y Tránsitos", tools: purchasingReportTools.filter((tool: Tool) => hasPermission(tool.id)) },
            { title: "Reportes de Inventario y Almacén", tools: inventoryReportTools.filter((tool: Tool) => hasPermission(tool.id)) },
            { title: "Reportes de Producción y Calidad", tools: productionReportTools.filter((tool: Tool) => hasPermission(tool.id)) },
            { title: "Reportes Administrativos", tools: analyticsTools.filter((tool: Tool) => hasPermission(tool.id)) },
        ];

        return sections.filter(section => section.tools.length > 0);

    }, [isAuthReady, isAuthorized, hasPermission]);
    
    if (!isAuthReady) {
        return (
             <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-8">
                <div>
                    <Skeleton className="h-8 w-80 mb-4" />
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                </div>
                 <div>
                    <Skeleton className="h-8 w-80 mb-4" />
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        <Skeleton className="h-24 w-full" />
                    </div>
                </div>
            </main>
        );
    }
    
    if (visibleSections.length === 0) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="text-center text-muted-foreground">
                    No tienes permiso para acceder a ninguna herramienta de analíticas.
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="grid gap-8">
                {visibleSections.map(section => (
                    <Section key={section.title} title={section.title} tools={section.tools} />
                ))}
            </div>
        </main>
    );
}
