/**
 * @fileoverview This file contains the initial or default data for the application.
 * This data is used to populate the database on its first run.
 * Spanish is used for UI-facing strings like names and descriptions.
 */

import type { Tool, User, Role, DatabaseModule, Company } from "@/modules/core/types";
import {
  Users, Sheet, Network, ShieldCheck, FileTerminal, FileUp, LifeBuoy, ServerCog,
  CalendarCheck, Factory, ShoppingCart, Warehouse, Briefcase, Store, Search,
  Wrench, LayoutDashboard, Map, PackagePlus, MessageSquare, BarChartBig,
  Lightbulb, FileText, Calculator, PanelLeft, Mail, KeyRound, BellRing,
  Palette, UserCheck, ShoppingBag, QrCode, HelpCircle, ClipboardCheck,
  ClipboardList, Wand2, Lock, PackageCheck, RotateCcw, BookUser, GitBranch,
  Construction, BookCopy, Cpu, FileSignature, Settings, ListChecks, FileInput, Box, SlidersHorizontal,
  Container, Tags, Truck, LayoutGrid, FileSpreadsheet, Trash2
} from "lucide-react";
import { allAdminPermissions } from "./permissions";

/**
 * Default company data for initial setup.
 */
export const initialCompany: Omit<Company, 'id'> = {
  name: "Nombre de su Empresa",
  taxId: "000-000-000000",
  address: "Su Dirección",
  phone: "0000-0000",
  email: "contacto@suempresa.com",
  systemName: "Clic-Tools",
  quotePrefix: 'COT-',
  nextQuoteNumber: 1,
  decimalPlaces: 2,
  quoterShowTaxId: true,
  searchDebounceTime: 500,
  syncWarningHours: 12,
  importMode: 'file',
  systemVersion: "3.0.0",
};

/**
 * The default user to be created in the database.
 * This is no longer used. The first user is created via the setup wizard.
 */
export const initialUsers: User[] = [];

/**
 * List of tools available on the main dashboard.
 */
export const mainTools: Tool[] = [
  {
    id: "quotes:create",
    name: "Cotizador",
    description: "Crear y gestionar cotizaciones para clientes.",
    href: "/dashboard/quoter",
    icon: Sheet,
    bgColor: "bg-green-500",
  },
  {
    id: "invoices:access",
    name: "Facturas y XML",
    description: "Analizar facturas de compra XML y gestionar documentos electrónicos.",
    href: "/dashboard/invoices",
    icon: FileText,
    bgColor: "bg-emerald-600",
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
    id: 'operations:access',
    name: 'Operaciones',
    description: 'Boletas digitales de movimiento, entregas y más.',
    href: '/dashboard/operations',
    icon: FileSignature,
    bgColor: 'bg-teal-700',
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
    id: "warehouse:access",
    name: "Almacén",
    description: "Consultar ubicaciones, gestionar unidades y registrar conteos.",
    href: "/dashboard/warehouse",
    icon: Warehouse,
    bgColor: "bg-cyan-600",
  },
  {
    id: "fleet:access",
    name: "Gestión de Flota",
    description: "Control de combustible, mantenimiento y activos.",
    href: "/dashboard/fleet",
    icon: Truck,
    bgColor: "bg-blue-600",
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
    id: "help",
    name: "Centro de Ayuda",
    description: "Consultar la documentación y guías de uso del sistema.",
    href: "/dashboard/help",
    icon: LifeBuoy,
    bgColor: "bg-blue-700",
  },
];


export const warehouseTools: Tool[] = [
    {
        id: "warehouse:search:simple",
        name: "Búsqueda Rápida",
        description: "Escanear o buscar un artículo para una consulta rápida.",
        href: "/dashboard/warehouse/search/simple",
        icon: QrCode,
        bgColor: 'bg-sky-600',
    },
    {
        id: "warehouse:search:full",
        name: "Consulta de Almacén",
        description: "Localizar artículos, clientes y unidades de inventario.",
        href: "/dashboard/warehouse/search",
        icon: Search,
        bgColor: 'bg-blue-600',
    },
    {
        id: 'warehouse:explorer:read',
        name: 'Explorador de Almacén',
        description: 'Visualiza la estructura del almacén, su ocupación y realiza limpiezas.',
        href: '/dashboard/warehouse/explorer',
        icon: LayoutGrid,
        bgColor: 'bg-sky-700',
    },
    {
        id: 'warehouse:receiving-wizard:use',
        name: 'Asistente de Recepción',
        description: 'Registrar producto terminado o compras y generar etiquetas.',
        href: '/dashboard/warehouse/receiving',
        icon: PackageCheck,
        bgColor: 'bg-emerald-600',
    },
    {
        id: 'warehouse:population-wizard:use',
        name: 'Asistente de Poblado',
        description: 'Poblar masivamente las ubicaciones de un rack de forma guiada.',
        href: '/dashboard/warehouse/population-wizard',
        icon: Wand2,
        bgColor: 'bg-indigo-500',
    },
     {
        id: "warehouse:item-assignment:create",
        name: "Catálogo Clientes y Artículos",
        description: "Asociar productos a clientes y marcar si son de venta general o exclusivos.",
        href: "/dashboard/warehouse/assign",
        icon: BookUser,
        bgColor: 'bg-teal-600',
    },
    {
        id: "warehouse:inventory-count:create",
        name: "Toma de Inventario Físico",
        description: "Registrar conteos físicos de productos en ubicaciones específicas.",
        href: "/dashboard/warehouse/inventory-count",
        icon: ClipboardCheck,
        bgColor: 'bg-lime-600',
    },
    {
        id: 'warehouse:correction:execute',
        name: 'Administración de Ingresos',
        description: 'Corregir un producto mal ingresado, moviendo su unidad de inventario.',
        href: '/dashboard/warehouse/correction',
        icon: RotateCcw,
        bgColor: 'bg-red-500'
    },
    {
        id: 'warehouse:labels:generate',
        name: 'Centro de Etiquetas',
        description: 'Generar e imprimir etiquetas de ubicación o de productos por lotes.',
        href: '/dashboard/warehouse/labels',
        icon: Tags,
        bgColor: 'bg-orange-500'
    },
    {
        id: "warehouse:units:create",
        name: "Gestión de Lotes/Tarimas",
        description: "Crear y etiquetar unidades de inventario (lotes/tarimas).",
        href: "/dashboard/warehouse/units",
        icon: QrCode,
        bgColor: 'bg-cyan-700',
    },
    {
        id: "warehouse:locations:create",
        name: "Gestionar Ubicaciones",
        description: "Definir la jerarquía y crear las ubicaciones físicas del almacén.",
        href: "/dashboard/warehouse/locations",
        icon: Map,
        bgColor: 'bg-purple-600',
    },
    {
        id: 'warehouse:locks:manage',
        name: 'Gestionar Bloqueos',
        description: 'Ver y liberar racks o niveles que están siendo editados.',
        href: '/dashboard/warehouse/locks',
        icon: Lock,
        bgColor: 'bg-slate-500',
    },
];

export const invoicesTools: Tool[] = [
    {
        id: 'cost-assistant:access',
        name: 'Asistente de Costos',
        description: 'Calcular costos y precios a partir de facturas XML.',
        href: '/dashboard/invoices/cost-assistant',
        icon: Calculator,
        bgColor: 'bg-orange-600',
    },
    {
        id: 'invoices:reporter:access',
        name: 'Reporteador de Facturas',
        description: 'Carga facturas XML para analizar, editar y exportar a Excel.',
        href: '/dashboard/invoices/reporter',
        icon: FileSpreadsheet,
        bgColor: 'bg-sky-600',
    },
];

export const consignmentsTools: Tool[] = [
    {
        id: "consignments:setup",
        name: "Acuerdos de Consignación",
        description: "Definir clientes, productos y precios para la consignación.",
        href: "/dashboard/consignments/agreements",
        icon: ListChecks,
        bgColor: "bg-teal-600",
    },
    {
        id: "consignments:count", // Re-using this permission
        name: "Asistente de Campo",
        description: "Realizar conteos, solicitar reposiciones y generar cierres de período.",
        href: "/dashboard/consignments/field-assistant",
        icon: Wand2,
        bgColor: "bg-sky-600",
    },
    {
        id: "consignments:boletas:read",
        name: "Gestión de Boletas",
        description: "Aprobar y gestionar las boletas de reposición.",
        href: "/dashboard/consignments/boletas",
        icon: FileText,
        bgColor: "bg-orange-600",
    },
    {
        id: "consignments:closures:create",
        name: "Gestión de Cierres y Facturación",
        description: "Administrar y facturar los cierres de período de consignación.",
        href: "/dashboard/consignments/cierres",
        icon: FileSignature,
        bgColor: "bg-indigo-600",
    },
    {
        id: "consignments:adjustments:create",
        name: "Ajustes de Inventario",
        description: "Registrar mermas o ganancias de inventario que no son ventas.",
        href: "/dashboard/consignments/adjustments",
        icon: SlidersHorizontal,
        bgColor: "bg-rose-500",
    },
];

export const itTools: Tool[] = [
    {
        id: 'it-tools:notes:read',
        name: 'Notas Técnicas',
        description: 'Base de conocimiento para procedimientos, guías y soluciones de TI.',
        href: '/dashboard/it-tools/notes',
        icon: BookCopy,
        bgColor: 'bg-slate-700',
    }
];

/**
 * Default roles and their permissions.
 * The 'viewer' role has been removed. Only the 'admin' role is defined by default.
 */
export const initialRoles: Role[] = [
  {
    id: "admin",
    name: "Admin",
    permissions: allAdminPermissions,
  },
];


/**
 * List of tools available in the admin section.
 */
export const adminTools: Tool[] = [
    {
        id: "users:read",
        name: "Gestión de Usuarios",
        description: "Añadir, editar y gestionar usuarios y sus roles.",
        href: "/dashboard/admin/users",
        icon: Users,
        bgColor: 'bg-blue-500',
      },
      {
        id: "roles:read",
        name: "Gestion de Roles",
        description: "Definir roles y asignar permisos granulares.",
        href: "/dashboard/admin/roles",
        icon: ShieldCheck,
        bgColor: 'bg-green-600',
      },
      {
        id: "admin:settings:general",
        name: "Configuración General",
        description: "Gestionar los datos de la empresa y logo.",
        href: "/dashboard/admin/general",
        icon: Briefcase,
        bgColor: 'bg-orange-500',
      },
      {
        id: "admin:settings:email",
        name: "Configuración de Correo",
        description: "Ajustes del servidor SMTP para enviar correos.",
        href: "/dashboard/admin/email",
        icon: Mail,
        bgColor: 'bg-purple-600',
      },
      {
        id: "admin:suggestions:read",
        name: "Buzón de Sugerencias",
        description: "Revisar el feedback enviado por los usuarios del sistema.",
        href: "/dashboard/admin/suggestions",
        icon: MessageSquare,
        bgColor: 'bg-green-700',
      },
      {
        id: "admin:settings:quoter",
        name: "Config. Cotizador",
        description: "Gestionar prefijos y consecutivos del cotizador.",
        href: "/dashboard/admin/quoter", 
        icon: Sheet,
        bgColor: 'bg-blue-600',
      },
      {
        id: "admin:settings:cost-assistant",
        name: "Config. Asist. Costos",
        description: "Gestionar ajustes para el asistente de costos.",
        href: "/dashboard/admin/cost-assistant",
        icon: Calculator,
        bgColor: 'bg-orange-500',
      },
       {
        id: "admin:settings:analytics",
        name: "Config. Analíticas",
        description: "Personalizar alias y configuraciones de reportes.",
        href: "/dashboard/admin/analytics",
        icon: Settings,
        bgColor: 'bg-indigo-700',
      },
      {
        id: "admin:import:run",
        name: "Importar Datos",
        description: "Cargar clientes, productos, exoneraciones y...",
        href: "/dashboard/admin/import",
        icon: FileUp,
        bgColor: 'bg-cyan-700',
      },
       {
        id: "admin:maintenance:backup",
        name: "Mantenimiento",
        description: "Backup, restauración y reseteo del sistema.",
        href: "/dashboard/admin/maintenance",
        icon: ServerCog,
        bgColor: 'bg-red-600',
      },
      {
        id: "admin:settings:api",
        name: "Configuración de API",
        description: "Gestionar URLs y claves de APIs externas.",
        href: "/dashboard/admin/api",
        icon: Network,
        bgColor: 'bg-indigo-500',
      },
       {
        id: "admin:settings:planner",
        name: "Config. Planificador",
        description: "Gestionar máquinas y otros ajustes del...",
        href: "/dashboard/admin/planner",
        icon: Factory,
        bgColor: 'bg-slate-600',
      },
       {
        id: "admin:settings:requests",
        name: "Config. Compras",
        description: "Gestionar rutas y otros ajustes de compras.",
        href: "/dashboard/admin/requests",
        icon: Store,
        bgColor: 'bg-amber-700',
      },
      {
        id: "admin:settings:warehouse",
        name: "Config. Almacenes e Inventario",
        description: "Gestionar bodegas, unidades y jerarquía del almacén.",
        href: "/dashboard/admin/warehouse",
        icon: Wrench,
        bgColor: 'bg-purple-600',
      },
       {
        id: "admin:settings:consignments",
        name: "Config. Consignación",
        description: "Gestionar los consecutivos para las boletas de consignación.",
        href: "/dashboard/admin/consignments",
        icon: Container,
        bgColor: 'bg-lime-500',
      },
      {
        id: "fleet:settings:manage",
        name: "Config. Flota",
        description: "Gestionar marcas, combustibles y tipos de permiso.",
        href: "/dashboard/admin/fleet",
        icon: Truck,
        bgColor: 'bg-blue-600',
      },
      {
        id: "admin:logs:read",
        name: "Visor de Eventos",
        description: "Revisar los registros y errores del sistema.",
        href: "/dashboard/admin/logs",
        icon: FileTerminal,
        bgColor: 'bg-gray-500',
      },
      {
        id: "admin:settings:automations",
        name: "Automatizaciones y Alertas",
        description: "Configurar el motor de eventos, plantillas y tareas Cron.",
        href: "/dashboard/admin/automations",
        icon: BellRing,
        bgColor: 'bg-pink-600',
      }
];

export const consignmentsReportTools: Tool[] = [
    {
        id: 'analytics:consignments-report:read',
        name: 'Análisis de Consumo (Flexible)',
        description: 'Analiza el consumo de un cliente en un rango de fechas flexible. No para facturación oficial.',
        href: '/dashboard/analytics/consignments-report',
        icon: BarChartBig,
        bgColor: 'bg-lime-600',
    },
    {
        id: 'analytics:consignments-report:read', // Re-use permission
        name: 'Monitor de Inventario',
        description: 'Ver inventario teórico vs. último conteo físico para un cliente.',
        href: '/dashboard/analytics/inventory-monitor',
        icon: Box,
        bgColor: 'bg-lime-700',
    }
];

export const purchasingReportTools: Tool[] = [
    {
        id: "analytics:purchase-suggestions:read",
        name: "Sugerencias de Compra Proactivas",
        description: "Analizar pedidos y stock para sugerir compras.",
        href: "/dashboard/analytics/purchase-suggestions",
        icon: Lightbulb,
        bgColor: "bg-blue-600",
    },
    {
        id: "analytics:purchase-report:read",
        name: "Reporte de Compras",
        description: "Visualiza faltantes de inventario y artículos en tránsito.",
        href: "/dashboard/analytics/purchase-report",
        icon: ShoppingBag,
        bgColor: "bg-blue-500",
    },
    {
        id: "analytics:transits-report:read",
        name: "Reporte de Tránsitos",
        description: "Monitorear órdenes de compra del ERP activas y en tránsito.",
        href: "/dashboard/analytics/transits-report",
        icon: Truck,
        bgColor: "bg-orange-500",
    },
];

export const inventoryReportTools: Tool[] = [
    {
        id: "analytics:physical-inventory-report:read",
        name: "Reporte de Inventario Físico",
        description: "Comparar conteos físicos con el stock del ERP.",
        href: "/dashboard/analytics/physical-inventory-report",
        icon: ClipboardCheck,
        bgColor: "bg-cyan-600",
    },
    {
        id: "analytics:receiving-report:read",
        name: "Reporte de Recepciones",
        description: "Auditar las recepciones de mercadería.",
        href: "/dashboard/analytics/receiving-report",
        icon: ClipboardList,
        bgColor: "bg-teal-600",
    },
    {
        id: 'analytics:item-assignments-report:read',
        name: 'Reporte de Catálogo',
        description: 'Auditar qué productos están asociados a qué clientes y si son exclusivos.',
        href: '/dashboard/analytics/item-assignments-report',
        icon: BookUser,
        bgColor: 'bg-rose-600'
    },
    {
        id: 'analytics:occupancy-report:read',
        name: 'Reporte de Ocupación',
        description: 'Visualizar el estado de las ubicaciones del almacén.',
        href: '/dashboard/analytics/occupancy-report',
        icon: LayoutGrid,
        bgColor: 'bg-sky-700'
    },
];

export const productionReportTools: Tool[] = [
    {
        id: "analytics:production-report:read",
        name: "Reporte de Producción",
        description: "Analizar rendimiento y desperdicio de órdenes completadas.",
        href: "/dashboard/analytics/production-report",
        icon: BarChartBig,
        bgColor: "bg-purple-600",
    },
];

export const analyticsTools: Tool[] = [
    {
        id: "analytics:user-permissions:read",
        name: "Reporte de Permisos",
        description: "Auditar los permisos asignados a cada usuario según su rol.",
        href: "/dashboard/analytics/user-permissions",
        icon: UserCheck,
        bgColor: "bg-slate-600",
    },
];


/**
 * A combined list of all tools for easy access.
 */
export const allTools: Tool[] = [
    ...mainTools, 
    ...invoicesTools,
    ...adminTools, 
    ...analyticsTools, 
    ...warehouseTools, 
    ...consignmentsTools, 
    ...itTools,
    ...purchasingReportTools,
    ...productionReportTools,
    ...inventoryReportTools,
    ...consignmentsReportTools
];
