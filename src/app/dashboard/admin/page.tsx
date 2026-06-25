/**
 * @fileoverview The main dashboard page for the admin section.
 * It dynamically displays a grid of available administration tools.
 */
'use client';

import { adminTools } from "@/modules/core/lib/data";
import { ToolCard } from "@/components/dashboard/tool-card";
import { useEffect, useMemo } from "react";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/core/hooks/useAuth";

const CATEGORIES = [
  {
    name: "Seguridad y Accesos",
    toolIds: ["users:read", "roles:read", "admin:logs:read"]
  },
  {
    name: "Módulos y Operaciones",
    toolIds: [
      "admin:settings:warehouse",
      "admin:settings:cost-assistant",
      "admin:settings:requests",
      "admin:settings:consignments",
      "admin:settings:quoter",
      "fleet:settings:manage",
      "deliveries:admin",
      "admin:settings:planner",
      "it-tools:assets:admin"
    ]
  },
  {
    name: "Sistema y Configuración",
    toolIds: [
      "admin:settings:general",
      "admin:settings:api",
      "admin:settings:email",
      "admin:settings:automations",
      "admin:suggestions:read",
      "admin:settings:analytics",
      "admin:import:run",
      "admin:maintenance:backup"
    ]
  }
];

export default function AdminDashboardPage() {
    const { setTitle } = usePageTitle();
    // The hook now directly gives us the hasPermission function and loading state.
    const { hasPermission, isAuthorized, isLoading } = useAuthorization(['admin:access']);
    const { unreadSuggestionsCount } = useAuth();

    useEffect(() => {
        setTitle("Configuración");
    }, [setTitle]);
    
    // Filter the tools based on the user's granular permissions.
    const visibleTools = useMemo(() => {
        if (!isAuthorized) return [];
        return adminTools.filter(tool => hasPermission(tool.id));
    }, [isAuthorized, hasPermission]);

    if (isLoading) {
        return (
             <main className="flex-1 p-4 md:p-6 lg:p-8 bg-background">
                <div className="max-w-7xl mx-auto grid gap-8">
                <div>
                    <Skeleton className="h-8 w-80 mb-4" />
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <Skeleton className="h-24 w-full" />
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
             <main className="flex-1 p-4 md:p-6 lg:p-8 bg-background">
                <div className="text-center text-muted-foreground py-12">
                    No tienes permiso para acceder a ninguna herramienta de administración.
                </div>
            </main>
        );
    }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8 bg-background">
        <div className="max-w-7xl mx-auto space-y-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Configuración del Sistema
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Administre accesos, seguridad, parámetros globales y el comportamiento de todos los módulos operativos.
            </p>
          </div>

          <div className="space-y-10">
            {CATEGORIES.map((category) => {
               const toolsInCategory = visibleTools.filter(tool => category.toolIds.includes(tool.id));
               if (toolsInCategory.length === 0) return null;
               
               return (
                 <div key={category.name} className="space-y-4">
                   <div className="flex items-center gap-2 border-b pb-2 border-border/60">
                     <h2 className="text-lg font-semibold tracking-tight text-foreground/90">
                       {category.name}
                     </h2>
                     <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
                       {toolsInCategory.length}
                     </span>
                   </div>
                   <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                     {toolsInCategory.sort((a,b) => a.name.localeCompare(b.name)).map((tool) => {
                       const isSuggestionsTool = tool.id === "admin:suggestions:read";
                       const badgeCount = isSuggestionsTool ? unreadSuggestionsCount : 0;
                       return <ToolCard key={tool.id} tool={tool} badgeCount={badgeCount}/>
                     })}
                   </div>
                 </div>
               );
            })}
          </div>
        </div>
      </main>
  );
}
    
