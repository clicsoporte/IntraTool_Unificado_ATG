/**
 * @fileoverview Main dashboard page for the IT Tools module.
 * It displays a grid of available IT management tools.
 */
'use client';

import { ToolCard } from "@/components/dashboard/tool-card";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { itTools } from "@/modules/core/lib/data";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Bot, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/modules/core/hooks/useAuth";

export default function ItToolsDashboardPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized, hasPermission } = useAuthorization();
    const { isAuthReady } = useAuth();

    useEffect(() => {
        setTitle("Herramientas de TI");
    }, [setTitle]);

    const visibleTools = useMemo(() => {
        if (!isAuthorized) return [];
        return itTools.filter(tool => hasPermission(tool.id));
    }, [isAuthorized, hasPermission]);

    if (!isAuthReady) {
        return (
             <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="grid gap-8">
                <div>
                    <h2 className="mb-4 text-2xl font-bold tracking-tight">
                        <Skeleton className="h-8 w-96" />
                    </h2>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        <Skeleton className="h-24 w-full" />
                    </div>
                </div>
                </div>
            </main>
        );
    }
    
    if (isAuthorized === false) {
        return null;
    }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-8">
        {/* Banner Destacado: Asistente IA de TI */}
        {hasPermission('ai:audit:logs') && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-950 p-6 md:p-8 text-white shadow-xl border border-purple-500/30">
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold text-purple-300 border border-purple-400/30">
                    ✨ Inteligencia Artificial Exclusiva de TI
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
                  <Bot className="h-8 w-8 text-purple-400 animate-pulse" />
                  Asistente IA de Soporte Técnico & Auditoría
                </h1>
                <p className="text-xs md:text-sm text-purple-200/80 leading-relaxed">
                  Diagnóstico en tiempo real de inventario ITAM, alertas de licencias por vencer, celulares de choferes, telemetría de Windows, procedimientos en notas técnicas y bitácoras de errores.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
                <Link href="/dashboard/it-tools/ai-auditor">
                  <Button 
                    className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-6 rounded-xl shadow-lg hover:shadow-purple-500/25 transition-all text-sm gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Abrir Consola Forense IA
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-8">
          <div>
            <h2 className="mb-4 text-2xl font-bold tracking-tight">
              Herramientas de Tecnologías de la Información
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleTools.length > 0 ? visibleTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              )) : (
                <p className="text-muted-foreground col-span-full">No tienes permiso para ver ninguna herramienta de TI.</p>
              )}
            </div>
          </div>
        </div>
      </main>
  );
}
