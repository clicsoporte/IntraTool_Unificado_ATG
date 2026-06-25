/**
 * @fileoverview Sidebar component for the main application layout.
 * It handles navigation, displays user and company information, and adapts
 * to mobile and desktop views.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Settings,
  Network,
  Wrench,
  LayoutDashboard,
  LifeBuoy,
  Sheet,
  CalendarCheck,
  ShoppingCart,
  Warehouse,
  Search,
  BarChartBig,
  Calculator,
  FileSignature,
  Cpu,
  Container,
  Truck,
  Users,
} from "lucide-react";
import type { Tool } from "@/modules/core/types";
import { UserNav } from "./user-nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { useMemo } from "react";

const navLinks: Tool[] = [
  {
    id: "dashboard:access",
    name: "Panel",
    description: "Visión general de las herramientas y actividad.",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "quotes:create",
    name: "Cotizador",
    description: "Crear y gestionar cotizaciones para clientes.",
    href: "/dashboard/quoter",
    icon: Sheet,
    bgColor: "bg-green-500",
  },
  {
    id: "requests:create",
    name: "Solicitud de Compra",
    description: "Crear y gestionar solicitudes de compra internas.",
    href: "/dashboard/requests",
    icon: ShoppingCart,
    bgColor: "bg-amber-700",
  },
   {
    id: "planner:create",
    name: "Planificador OP",
    description: "Gestionar y visualizar la carga de producción.",
    href: "/dashboard/planner",
    icon: CalendarCheck,
    bgColor: "bg-purple-700",
  },
  {
    id: 'cost-assistant:access',
    name: 'Asistente de Costos',
    description: 'Calcular costos y precios a partir de facturas XML.',
    href: '/dashboard/cost-assistant',
    icon: Calculator,
    bgColor: 'bg-orange-600',
  },
  {
    id: 'operations:access',
    name: 'Operaciones',
    description: 'Boletas digitales de movimiento, entregas y más.',
    href: '/dashboard/operations',
    icon: FileSignature,
    bgColor: 'bg-teal-700',
  },
   {
    id: 'deliveries:customers',
    name: 'Clientes y Ubicaciones',
    description: 'Gestionar direcciones de entrega y geolocalizaciones.',
    href: '/dashboard/clientes',
    icon: Users,
    bgColor: 'bg-indigo-600',
  },
   {
    id: "it-tools:access",
    name: "Herramientas de TI",
    description: "Gestionar notas técnicas y documentación interna de TI.",
    href: "/dashboard/it-tools",
    icon: Cpu,
    bgColor: "bg-gray-700",
  },
  {
    id: "consignments:access",
    name: "Gestión de Consignaciones",
    description: "Administrar productos en consignación en instalaciones de clientes.",
    href: "/dashboard/consignments",
    icon: Container,
    bgColor: "bg-lime-500",
  },
  {
    id: "fleet:access",
    name: "Gestión de Flota",
    description: "Control de combustible, mantenimiento y eficiencia de activos.",
    href: "/dashboard/fleet",
    icon: Truck,
    bgColor: "bg-blue-600",
  },
  {
    id: "warehouse:access",
    name: "Almacén",
    description: "Consultar ubicaciones, gestionar unidades y registrar conteos.",
    href: "/dashboard/warehouse",
    icon: Warehouse,
    bgColor: "bg-cyan-600",
  },
     {
      id: "hacienda:query",
      name: "Consultas Hacienda",
      description: "Verificar situación tributaria y exoneraciones.",
      href: "/dashboard/hacienda",
      icon: Search,
      bgColor: "bg-fuchsia-600",
    },
  {
    id: "inventory:read",
    name: "Inventario y Repuestos",
    description: "Gestión centralizada de stock, repuestos y activos aislados por departamento.",
    href: "/dashboard/inventory",
    icon: Warehouse,
    bgColor: "bg-emerald-600",
  },
  {
    id: "tickets:read",
    name: "Mesa de Tickets",
    description: "Administrar solicitudes de soporte, reparaciones y consumos de inventario.",
    href: "/dashboard/tickets",
    icon: Wrench,
    bgColor: "bg-blue-600",
  },
  {
    id: "help",
    name: "Centro de Ayuda",
    description: "Consultar la documentación y guías de uso del sistema.",
    href: "/dashboard/help",
    icon: LifeBuoy,
    bgColor: "bg-blue-700",
  },
];

/**
 * Renders the main application sidebar.
 * It fetches current user and company data to display personalized information.
 * It highlights the active navigation link based on the current URL path.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { user: currentUser, companyData, isAuthReady } = useAuth();
  const { hasPermission } = useAuthorization();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };


  /**
   * Determines if a navigation link should be considered active.
   * @param href - The href of the navigation link.
   * @returns True if the link is active, false otherwise.
   */
  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/dashboard') {
        return pathname === href;
    }
    if (href === '/dashboard/operations') {
        return pathname === '/dashboard/operations' || pathname.startsWith('/dashboard/operations/');
    }
    return pathname.startsWith(href);
  };

  const visibleNavLinks = useMemo(() => {
    return navLinks.filter(link => hasPermission(link.id));
  }, [hasPermission]);


  if (!isAuthReady) {
    return (
        <div className="hidden md:flex flex-col w-64 border-r p-4 gap-4 bg-sidebar text-sidebar-foreground">
            <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-10 w-10 rounded-lg"/>
                <Skeleton className="h-6 w-32"/>
            </div>
            <div className="space-y-2 flex-1">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="mt-auto space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
    )
  }

  return (
      <Sidebar collapsible="icon" className="border-r z-20">
        <SidebarHeader className="flex flex-row items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center">
          <Button variant="ghost" size="icon" className="size-10 shrink-0" asChild>
            <Link href="/dashboard" onClick={handleLinkClick}>
              <Network className="text-primary" />
            </Link>
          </Button>
          <h2 className="text-sm font-semibold tracking-tight text-sidebar-foreground truncate group-data-[collapsible=icon]:hidden">
            {companyData?.systemName || 'Clic-Tools'}
          </h2>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {visibleNavLinks.map((item) => (
                <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.name}
                    >
                    <Link href={item.href} onClick={handleLinkClick}>
                        <item.icon />
                        <span>{item.name}</span>
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              )
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton
                asChild
                isActive={isActive("/dashboard/profile")}
                tooltip="Mi Perfil"
                >
                <Link href="/dashboard/profile" onClick={handleLinkClick}>
                    <Settings />
                    <span>Mi Perfil</span>
                </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>

             {hasPermission('analytics:read') && (
                <SidebarMenuItem>
                    <SidebarMenuButton
                        asChild
                        isActive={isActive("/dashboard/analytics")}
                        tooltip="Analíticas"
                    >
                        <Link href="/dashboard/analytics" onClick={handleLinkClick}>
                            <BarChartBig />
                            <span>Analíticas</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            )}
            
            {hasPermission('admin:access') && (
                 <SidebarMenuItem>
                    <SidebarMenuButton
                        asChild
                        isActive={isActive("/dashboard/admin")}
                        tooltip="Configuración"
                    >
                        <Link href="/dashboard/admin" onClick={handleLinkClick} className="relative">
                           <Wrench />
                           <span>Configuración</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            )}
          </SidebarMenu>
          <div className="flex items-center gap-2 p-2 mt-4 border-t border-sidebar-border group-data-[collapsible=icon]:hidden">
            <UserNav user={currentUser} />
            <div className="flex flex-col text-sm">
              <span className="font-semibold text-sidebar-foreground">
                {currentUser?.name}
              </span>
              <span className="text-sidebar-foreground/70">
                {currentUser?.email}
              </span>
            </div>
          </div>
           <div className="text-center text-xs text-sidebar-foreground/50 p-2 group-data-[collapsible=icon]:hidden">
                {companyData?.systemVersion ? `Clic-Tools v${companyData.systemVersion}` : 'Clic-Tools'} - ClicSoporte
           </div>
        </SidebarFooter>
      </Sidebar>
  );
}
