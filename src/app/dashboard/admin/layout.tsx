/**
 * @fileoverview Main layout for the administration section.
 * This component establishes a context provider for the page title, allowing
 * any child page within the admin section to dynamically set the header title.
 */
'use client';

import type { ReactNode } from "react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { adminTools } from "@/modules/core/lib/data";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, SlidersHorizontal, Wrench, ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

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
      "admin:settings:planner"
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

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
    const pathname = usePathname();
    const { hasPermission, isLoading } = useAuthorization();
    
    const activeTool = adminTools.find(tool => pathname === tool.href);
    const ActiveIcon = activeTool ? activeTool.icon : Wrench;

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="px-4 md:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
                    {/* Left: Beautiful breadcrumb navigation */}
                    <div className="flex items-center gap-2 text-sm">
                        <Link 
                            href="/dashboard/admin" 
                            prefetch={false}
                            className={cn(
                                "font-semibold transition-colors hover:text-primary",
                                pathname === "/dashboard/admin" ? "text-primary text-base font-bold" : "text-muted-foreground"
                            )}
                        >
                            Configuración
                        </Link>
                        {activeTool && (
                            <>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                                <span className="text-foreground font-medium flex items-center gap-1.5">
                                    <activeTool.icon className="h-4 w-4 text-primary" />
                                    {activeTool.name}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Right: Elegant grouped dropdown select */}
                    {!isLoading && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="flex items-center gap-2 border-primary/20 hover:border-primary/40 hover:bg-accent/50 transition-all duration-200 shadow-sm"
                                >
                                    <ActiveIcon className="h-4 w-4 text-primary shrink-0" />
                                    <span className="font-semibold text-xs md:text-sm max-w-[150px] md:max-w-xs truncate">
                                        {activeTool ? activeTool.name : "Menú de Configuración"}
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[300px] p-0 shadow-lg border-primary/10">
                                <ScrollArea className="max-h-[350px] overflow-y-auto p-1">
                                    {CATEGORIES.map((category, catIdx) => {
                                        const allowedTools = adminTools.filter(
                                            tool => category.toolIds.includes(tool.id) && hasPermission(tool.id)
                                        );

                                        if (allowedTools.length === 0) return null;

                                        return (
                                            <div key={category.name}>
                                                {catIdx > 0 && <DropdownMenuSeparator className="my-1" />}
                                                <DropdownMenuLabel className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                                                    {category.name}
                                                </DropdownMenuLabel>
                                                <DropdownMenuGroup>
                                                    {allowedTools.sort((a,b) => a.name.localeCompare(b.name)).map(link => (
                                                        <DropdownMenuItem key={link.href} asChild>
                                                            <Link 
                                                                href={link.href}
                                                                prefetch={false}
                                                                className={cn(
                                                                    "flex items-center gap-2.5 w-full cursor-pointer py-2 px-3 rounded-sm transition-colors text-sm",
                                                                    pathname === link.href 
                                                                        ? "bg-primary/10 text-primary font-medium hover:bg-primary/15" 
                                                                        : "hover:bg-accent/60 text-muted-foreground hover:text-foreground"
                                                                )}
                                                            >
                                                                <link.icon className={cn(
                                                                    "h-4 w-4 shrink-0",
                                                                    pathname === link.href ? "text-primary" : "text-muted-foreground/70"
                                                                )} />
                                                                <span className="truncate">{link.name}</span>
                                                            </Link>
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuGroup>
                                            </div>
                                        );
                                    })}
                                </ScrollArea>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
