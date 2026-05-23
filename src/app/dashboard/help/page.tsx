
"use client";

import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Code,
  FileUp,
  FileTerminal,
  Network,
  ShieldCheck,
  Users,
  Building,
  FileDown,
  PlusCircle,
  UserCog,
  DatabaseZap,
  Keyboard,
  DollarSign,
  ShieldQuestion,
  LifeBuoy,
  Rocket,
  Boxes,
  CalendarCheck,
  ShoppingCart,
  Truck,
  PackageCheck,
  Factory,
  CheckCircle,
  XCircle,
  ShieldAlert,
  Search,
  Wrench,
  Map,
  PackagePlus,
  BookMarked,
  Save,
  Copy,
  Folder,
  AlertTriangle,
  ToggleRight,
  FilePlusIcon,
  Warehouse,
  Send,
  Loader2,
  Play,
  Pause,
  History,
  Undo2,
  Info,
  BadgeInfo,
  RefreshCcw,
  Zap,
  CreditCard,
  MessageSquare,
  Trash2,
  Download,
  Briefcase,
  Store,
  ListChecks,
  Hourglass,
  Layers,
  UploadCloud,
  BarChartBig,
  Lightbulb,
  FileText,
  Calculator,
  PanelLeft,
  Mail,
  KeyRound,
  BellRing,
  Palette,
  UserCheck,
  ShoppingBag,
  QrCode,
  HelpCircle,
  ClipboardCheck,
  ClipboardList,
  Wand2,
  Lock,
  LockKeyhole,
  RotateCcw,
  BookUser,
  GitBranch,
  Construction,
  BookCopy,
  Cpu,
  FileSignature,
  Settings,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// --- Helper Functions ---
const normalizeText = (text: string | null | undefined): string => {
  if (!text) return "";
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const HighlightedText = ({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) => {
  if (!highlight.trim()) {
    return <>{text}</>;
  }
  const normalizedHighlight = normalizeText(highlight);
  const parts = text.split(
    new RegExp(
      `(${normalizedHighlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    )
  );

  return (
    <>
      {parts.map((part, i) =>
        normalizeText(part).toLowerCase() === normalizedHighlight ? (
          <mark key={i} className="bg-yellow-300 p-0 m-0">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

const HelpSection = ({
  title,
  icon,
  content,
  searchTerm,
}: {
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  searchTerm: string;
}) => {
  const contentString = useMemo(() => {
    const getText = (node: React.ReactNode): string => {
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(getText).join(" ");
      if (typeof node === "object" && node !== null && "props" in node && node.props.children) {
        return getText(node.props.children);
      }
      return "";
    };
    return getText(content);
  }, [content]);

  const isVisible = useMemo(() => {
    const searchTerms = normalizeText(searchTerm).split(" ").filter(Boolean);
    if (searchTerms.length === 0) return true;
    const targetText = normalizeText(title + " " + contentString);
    return searchTerms.every((term) => targetText.includes(term));
  }, [searchTerm, title, contentString]);

  if (!isVisible) return null;

  return (
    <AccordionItem value={title}>
      <AccordionTrigger className="text-lg font-semibold">
        <div className="flex items-center">
          {icon}
          <HighlightedText text={title} highlight={searchTerm} />
        </div>
      </AccordionTrigger>
      <AccordionContent className="prose max-w-none text-base">
        {content}
      </AccordionContent>
    </AccordionItem>
  );
};

export default function HelpPage() {
  const { setTitle } = usePageTitle();
  const { companyData } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setTitle("Centro de Ayuda");
  }, [setTitle]);

  const helpSections = [
    {
        title: "Introducción al Sistema",
        icon: <Rocket className="mr-4 h-6 w-6 text-blue-500" />,
        content: (
            <>
                <p>
                ¡Bienvenido a <strong><HighlightedText text={companyData?.systemName || "la Aplicación"} highlight={searchTerm}/></strong>! Piensa en este sistema como tu navaja suiza digital para las tareas diarias de la empresa. Ha sido diseñado para ser súper rápido y fácil de usar desde cualquier computadora en la oficina.
                </p>
                <p>
                El objetivo es simple: tener todas las herramientas importantes (como hacer cotizaciones, solicitudes de compra o planificar la producción) en un solo lugar, con la flexibilidad de obtener datos tanto de archivos de texto como directamente desde el ERP.
                </p>
                 <Alert variant="default" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>¡Nuevo Panel Lateral Plegable!</AlertTitle>
                    <AlertDescription>
                        Ahora puedes hacer clic en el botón <span className="inline-flex items-center justify-center h-6 w-6 bg-primary/10 rounded-md"><PanelLeft className="h-4 w-4 text-primary" /></span> en la esquina superior izquierda para contraer el menú lateral y maximizar tu espacio de trabajo.
                    </AlertDescription>
                </Alert>
            </>
        )
    },
    {
        title: "Minitutoriales Rápidos: El Nuevo Sistema Unificado",
        icon: <Wand2 className="mr-4 h-6 w-6 text-purple-600" />,
        content: (
            <div className="space-y-6">
                <p className="text-muted-foreground italic">Hemos simplificado la arquitectura para que el sistema sea más rápido y confiable. Aquí tienes lo esencial que debes saber:</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center"><DatabaseZap className="mr-2 h-4 w-4 text-primary"/> Una Sola Base de Datos</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs">
                            Antes cada módulo tenía su archivo. Ahora todo vive en <code>clic_tools.db</code>. Esto significa que si actualizas un cliente en un lado, se actualiza en todos instantáneamente.
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center"><Zap className="mr-2 h-4 w-4 text-yellow-600"/> Velocidad Offline-First</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs">
                            El sistema no consulta a Softland cada vez que buscas un producto. Lee de su propia copia local ultrarrápida. Por eso las búsquedas son instantáneas.
                        </CardContent>
                    </Card>



                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center"><RefreshCcw className="mr-2 h-4 w-4 text-green-600"/> Sincronización Inteligente</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs">
                            Los datos de RRHH (empleados, puestos, departamentos) ahora se sincronizan igual que los productos. Todo el organigrama está disponible localmente.
                        </CardContent>
                    </Card>
                </div>


            </div>
        )
    },

    {
        title: "Guía del Centro de Notificaciones",
        icon: <BellRing className="mr-4 h-6 w-6 text-yellow-500" />,
        content: (
             <div className="space-y-4">
                <p>
                El Centro de Notificaciones es el corazón de la comunicación proactiva de la aplicación. En lugar de que tengas que revisar constantemente los módulos, el sistema te avisará cuando algo requiera tu atención.
                </p>
                
                <h4 className="font-semibold text-lg pt-2 border-t">¿Cómo Funciona?</h4>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Icono de Campana (<BellRing className="inline h-4 w-4"/>):</strong> Ubicado en la cabecera, este icono mostrará un punto rojo con un número que indica cuántas notificaciones tienes sin leer. Si llega una nueva, se animará sutilmente.
                    </li>
                    <li>
                        <strong>Panel de Notificaciones:</strong> Al hacer clic en la campana, se desplegará una lista con tus últimas notificaciones, ordenadas de la más reciente a la más antigua.
                    </li>
                    <li>
                        <strong>Redirección Inteligente:</strong> Cada notificación es un enlace. Al hacerle clic, te llevará directamente a la orden, solicitud o sección correspondiente.
                    </li>
                    <li>
                        <strong>Basado en Permisos:</strong> El sistema es inteligente. No recibirás notificaciones de tareas que no puedes realizar. Por ejemplo, solo los usuarios con permiso para aprobar cancelaciones recibirán esa notificación.
                    </li>
                </ul>

                <Alert variant="default" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Notificaciones Accionables</AlertTitle>
                    <AlertDescription>
                        Algunas notificaciones, como las de &quot;solicitud de cancelación&quot;, incluirán botones de acción rápida (ej: &quot;Aprobar&quot;, &quot;Rechazar&quot;). Esto te permite gestionar tareas críticas directamente desde el panel de notificaciones sin tener que navegar a la página específica.
                    </AlertDescription>
                </Alert>
                 <Alert variant="default" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Notificaciones de Sugerencias</AlertTitle>
                    <AlertDescription>
                        Los usuarios con el permiso `admin:suggestions:read` también recibirán una notificación cada vez que se envíe una nueva sugerencia a través del buzón del sistema, asegurando que el feedback sea atendido rápidamente.
                    </AlertDescription>
                </Alert>
            </div>
        )
    },
    {
        title: "Guía Crítica: Sincronización de Datos del ERP",
        icon: <DatabaseZap className="mr-4 h-6 w-6 text-cyan-500" />,
        content: (
            <div className="space-y-4">
                <p>
                Esta es una de las funcionalidades más importantes. Permite que la aplicación se mantenga al día con los datos maestros de tu sistema ERP (clientes, productos, inventario, RRHH, etc.). Se gestiona desde <strong>Administración &gt; Importar Datos</strong> y tiene dos modos de funcionamiento.
                </p>


                <h4 className="font-semibold text-lg pt-2 border-t">Modo 1: Importación desde Archivos</h4>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>¿Cómo funciona?:</strong> Debes generar archivos de texto plano (`.txt` o `.csv`) desde tu ERP y colocarlos en una carpeta en el servidor. Luego, en la pantalla de importación, le dices a la aplicación la ruta completa de cada archivo.
                    </li>
                    <li>
                        <strong>Ventajas:</strong> Es un método robusto y sencillo de configurar, ideal si no quieres dar acceso directo a tu base de datos del ERP.
                    </li>
                </ul>

                <h4 className="font-semibold text-lg pt-2 border-t">Modo 2: Sincronización desde SQL Server (Recomendado)</h4>
                 <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>¿Cómo funciona?:</strong> En lugar de archivos, la aplicación se conecta directamente a la base de datos de tu ERP (usando un usuario de <strong>solo lectura</strong>) y ejecuta consultas `SELECT` para traer los datos.
                    </li>
                     <li>
                        <strong>¿Cómo se configura?:</strong> Un administrador debe ir a <strong>Administración &gt; Importar Datos</strong> y:
                        <ol className="list-decimal space-y-2 pl-5 mt-2">
                            <li>Activar el interruptor a &quot;Importar desde SQL Server&quot;.</li>
                            <li>Ingresar las credenciales de la base de datos (servidor, usuario, contraseña, etc.).</li>
                            <li>Pegar las consultas `SELECT` específicas para cada tipo de dato (clientes, artículos, etc.) en el &quot;Gestor de Consultas&quot;.</li>
                        </ol>
                    </li>
                    <li>
                        <strong>Ventajas:</strong> Es más rápido, directo y elimina la necesidad de generar archivos manualmente.
                    </li>
                </ul>
                
                <h4 className="font-semibold text-lg pt-2 border-t">Automatizaciones y Tareas Programadas (Cron Jobs) - ¡NUEVO!</h4>
                <p>Para mantener los datos actualizados y las notificaciones activas automáticamente, puedes configurar tareas programadas externas que llamen de forma segura a los siguientes endpoints:</p>
                <ol className="list-decimal space-y-4 pl-6">
                    <li>
                        <strong>Configurar la Clave Secreta:</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>En el servidor, abre (o crea) el archivo <code>.env.local</code> en la raíz del proyecto.</li>
                            <li>Añade la siguiente línea, reemplazando el valor de ejemplo por una cadena de texto larga y aleatoria:</li>
                            <li className="p-2 bg-muted rounded-md font-mono text-xs"><code>CRON_SECRET=&quot;tu_clave_super_secreta_y_aleatoria_aqui&quot;</code></li>
                        </ul>
                    </li>
                    <li>
                        <strong>Configurar Sincronización del ERP:</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>La tarea debe realizar una petición <code>POST</code> a la URL <code>/api/cron/sync-erp</code> de tu aplicación, incluyendo la clave secreta en la cabecera de autorización.</li>
                            <li><strong>Ejemplo para Windows (Programador de Tareas):</strong></li>
                            <li className="p-2 bg-muted rounded-md font-mono text-xs"><code>powershell</code><br/>Argumentos: <code>{`Invoke-WebRequest -Uri "http://localhost:9003/api/cron/sync-erp" -Method POST -Headers @{'Authorization' = 'Bearer tu_clave_super_secreta'} -UseBasicParsing`}</code></li>
                            <li><strong>Ejemplo para Linux (<code>crontab</code>):</strong></li>
                            <li className="p-2 bg-muted rounded-md font-mono text-xs"><code>0 2 * * * curl -X POST -H &quot;Authorization: Bearer tu_clave_super_secreta&quot; http://localhost:9003/api/cron/sync-erp</code></li>
                        </ul>
                    </li>
                    <li>
                        <strong>Configurar Auditoría de Flota (Vencimientos y Alertas):</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>La tarea debe realizar una petición <code>POST</code> a la URL <code>/api/cron/fleet-audit</code> de tu aplicación, incluyendo la clave secreta en la cabecera de autorización.</li>
                            <li><strong>Ejemplo para Windows (Programador de Tareas):</strong></li>
                            <li className="p-2 bg-muted rounded-md font-mono text-xs"><code>powershell</code><br/>Argumentos: <code>{`Invoke-WebRequest -Uri "http://localhost:9003/api/cron/fleet-audit" -Method POST -Headers @{'Authorization' = 'Bearer tu_clave_super_secreta'} -UseBasicParsing`}</code></li>
                            <li><strong>Ejemplo para Linux (<code>crontab</code>):</strong></li>
                            <li className="p-2 bg-muted rounded-md font-mono text-xs"><code>0 8 * * * curl -X POST -H &quot;Authorization: Bearer tu_clave_super_secreta&quot; http://localhost:9003/api/cron/fleet-audit</code></li>
                            <li><span className="font-bold">Importante:</span> Esta tarea evalúa de forma inteligente los hitos de kilometraje (aceite) y fechas límite (RTV/permisos), y despacha alertas por correo y Telegram según tus preferencias.</li>
                        </ul>
                    </li>
                </ol>

                <h4 className="font-semibold text-lg pt-2 border-t">¿Qué es el Botón &quot;Sincronizar ERP&quot;?</h4>
                 <ul className="list-disc space-y-3 pl-6">
                    <li>Este botón, visible en el encabezado para usuarios con permisos, ejecuta el proceso de importación completo (ya sea desde archivos o SQL) en segundo plano. La notificación de éxito ahora te dirá cuántos tipos de datos se procesaron del total (ej: &quot;10 de 11&quot;).</li>
                    <li>
                        <strong>Alerta de Sincronización Antigua (<AlertTriangle className="inline h-4 w-4 text-red-600"/>):</strong> Si ha pasado mucho tiempo desde la última sincronización (el tiempo es configurable en Administración &gt; General), el indicador &quot;Última Sinc&quot; y el botón de sincronización se pondrán en <strong>rojo y parpadearán</strong>. Esto es una alerta visual crítica que te indica que los datos de la aplicación (como precios o inventario) pueden estar desactualizados.
                    </li>
                </ul>
            </div>
        )
    },
    {
        title: "Manual del Bot de Telegram de Flota",
        icon: <Send className="mr-4 h-6 w-6 text-sky-500" />,
        content: (
            <div className="space-y-4">
                <p>
                El <strong>Bot de Telegram Interactivo de Flota</strong> es una potente extensión que permite a los colaboradores (choferes y mecánicos) registrar cargas de combustible (repostajes) y reportar mantenimientos directamente desde Telegram, sin necesidad de acceder a la plataforma web.
                </p>

                <h4 className="font-semibold text-lg pt-2 border-t">🔑 1. Proceso de Vinculación de Seguridad</h4>
                <p>Por motivos de seguridad, antes de que un colaborador pueda utilizar el bot, su cuenta de Telegram debe estar enlazada con su registro de empleado en el sistema. Existen dos métodos para realizar esto:</p>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Generación de Código de Activación (Recomendado):</strong>
                        <ol className="list-decimal space-y-1.5 pl-5 mt-2">
                            <li>Un administrador va a <strong>Administración &gt; Automatizaciones &gt; Bot de Telegram Flota</strong>.</li>
                            <li>En la tarjeta &quot;Generación Rápida de Código&quot;, selecciona al colaborador y presiona &quot;Generar Código&quot;.</li>
                            <li>Brinda el código temporal generado al colaborador.</li>
                            <li>El colaborador inicia el bot en Telegram enviando el comando <code>/vincular CODIGO</code> (ej: <code>/vincular ABC123XYZ</code>). El bot confirmará la vinculación exitosa al instante.</li>
                        </ol>
                    </li>
                    <li>
                        <strong>Vinculación Manual por Chat ID:</strong>
                        <ol className="list-decimal space-y-1.5 pl-5 mt-2">
                            <li>Si se conoce el <em>Chat ID</em> numérico del colaborador, el administrador puede forzar la vinculación inmediatamente haciendo clic en el botón &quot;Vincular Manualmente&quot; e ingresando el empleado y su ID de chat.</li>
                        </ol>
                    </li>
                </ul>

                <h4 className="font-semibold text-lg pt-2 border-t">⛽ 2. Flujo de Carga de Combustible (Repostaje)</h4>
                <p>Cuando un colaborador de flota necesita reportar una recarga de combustible, debe seguir estos pasos en el bot de Telegram:</p>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>Selecciona la opción <strong>1 - Repostaje</strong> en el menú interactivo (o envía <code>/menu</code>).</li>
                    <li>El bot le solicitará la <strong>Placa del Vehículo</strong> (ej: <code>CL-12345</code>). El sistema validará en tiempo real que el vehículo exista y esté activo en la base de datos de la empresa.</li>
                    <li>El bot solicitará el <strong>Kilometraje (Odómetro) Actual</strong>. Para garantizar la consistencia, el bot validará que la lectura no sea inferior al kilometraje previamente registrado del vehículo.</li>
                    <li>El bot solicitará la **Cantidad de Litros** cargados. El tipo de combustible (Diésel, Regular, Súper, etc.) se autodetecta según la ficha del activo.</li>
                    <li>El bot calculará y sugerirá el costo estimado según los precios de combustible guardados en el sistema y pedirá al usuario ingresar el **Costo Total**.</li>
                    <li>Por último, solicitará la **Foto del Ticket/Comprobante** de pago (esta foto puede configurarse como obligatoria o no desde el panel de control).</li>
                </ol>

                <h4 className="font-semibold text-lg pt-2 border-t">🔧 3. Flujo de Reporte de Mantenimiento</h4>
                <p>Para reportar fallos, reparaciones o mantenimientos preventivos realizados:</p>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>Selecciona la opción <strong>2 - Mantenimiento</strong> en el menú interactivo del bot.</li>
                    <li>Ingresa la <strong>Placa del Vehículo</strong>.</li>
                    <li>El bot desplegará dinámicamente un teclado con los <strong>Tipos de Mantenimiento</strong> cargados directamente desde la configuración de tu sistema (ej: Cambio de Aceite, Frenos, RTV).</li>
                    <li>Introduce el <strong>Kilometraje Actual</strong>, la <strong>Descripción detallada</strong> del trabajo (ej: Cambio de pastillas delanteras) y el <strong>Costo Total</strong>.</li>
                    <li>Introduce el **Taller Responsable** y finalmente sube la **Foto del Comprobante** (obligatoria u opcional según la configuración).</li>
                </ol>
 
                <h4 className="font-semibold text-lg pt-2 border-t">🔍 4. Consultas Interactivas de Activos</h4>
                <p>El bot permite a mecánicos, choferes y administradores consultar el estado de la flota en tiempo real:</p>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Consultar Alertas ⚠️:</strong>
                        <p className="mt-1">Ofrece tres modos de consulta inteligente:</p>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                            <li><strong>Ver todas las alertas ⚠️:</strong> Genera un reporte completo y detallado con semáforo (🔴 Crítico, 🟡 Advertencia) de todos los vehículos de la flota que tienen alertas o mantenimientos vencidos/próximos en tiempo real, sin necesidad de ingresar placa por placa.</li>
                            <li><strong>Lista de activos con alertas 🚨:</strong> Analiza toda la flota y genera una lista consolidada rápida de las placas y cantidad de alertas activas para identificar cuáles vehículos requieren atención inmediata.</li>
                            <li><strong>Buscar por placa 🔍:</strong> Muestra un reporte detallado individual con semáforo (🔴 Crítico, 🟡 Advertencia, 🟢 Al día) del cambio de aceite, RTV, permisos especiales y planes preventivos activos de un vehículo específico.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Historial Log 📋:</strong> Muestra los últimos 5 repostajes y 5 mantenimientos de un activo (incluyendo fechas, costos, kilometrajes, operarios y si tiene fotos/comprobantes adjuntos en el sistema).
                    </li>
                    <li>
                        <strong>Permisos y Planes 📄:</strong> Desglosa los documentos vigentes (RTV, permisos especiales, etc.) y los planes de mantenimiento preventivo vigentes con su porcentaje de uso según el kilometraje u horas.
                    </li>
                </ul>

                <h4 className="font-semibold text-lg pt-2 border-t">⚙️ 5. Administración y Monitoreo del Bot</h4>
                <p>En el panel web <strong>Administración &gt; Automatizaciones &gt; Bot Telegram</strong>, los administradores de TI tienen pleno control operativo sobre el bot:</p>
                <ul className="list-disc space-y-3 pl-6">
                    <li><strong>Control de Webhook:</strong> Permite sincronizar y validar en vivo la comunicación segura con los servidores de Telegram.</li>
                    <li><strong>Fotos Obligatorias:</strong> Switches de activación para forzar a los colaboradores a subir una foto antes de guardar un repostaje o mantenimiento.</li>
                    <li><strong>Monitoreo de Sesiones Activas:</strong> Un panel en tiempo real que muestra el estado conversacional de los mecánicos y choferes (útil para ver en qué paso están y forzar un reinicio de conversación en caso de atascos).</li>
                </ul>
            </div>
        )
    },
    {
        title: "Guía de Seguridad: Recuperación de Contraseña",
        icon: <KeyRound className="mr-4 h-6 w-6 text-fuchsia-600" />,
        content: (
            <div className="space-y-4">
                <p>
                Para mejorar la seguridad y la autonomía del usuario, el sistema ahora incluye un flujo completo para recuperar el acceso a una cuenta.
                </p>
                 <Alert variant="destructive">
                    <LockKeyhole className="h-4 w-4" />
                    <AlertTitle>¡Mejora de Seguridad Crítica Implementada!</AlertTitle>
                    <AlertDescription>
                       El sistema de autenticación ahora utiliza <strong>cookies seguras y `httpOnly`</strong>. Esto significa que tu sesión es gestionada por el servidor, haciendo imposible que sea manipulada desde el navegador y previniendo la suplantación de identidad.
                    </AlertDescription>
                </Alert>

                <h4 className="font-semibold text-lg pt-2 border-t">Configuración para Administradores</h4>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Paso 1: Configurar el SMTP.</strong> Para que el sistema pueda enviar correos, un administrador debe ir a <strong>Administración &gt; Configuración de Correo</strong>.
                    </li>
                    <li>
                        <strong>Campos Requeridos:</strong> Se deben ingresar los datos del servidor de correo de la empresa (Host, Puerto, Usuario, Contraseña y Seguridad). Estos datos se guardan de forma segura.
                    </li>
                     <li>
                        <strong>Plantilla Personalizable:</strong> En esta misma pantalla, se puede personalizar el <strong>asunto y el cuerpo del correo</strong> de recuperación, usando `[NOMBRE_USUARIO]` y `[CLAVE_TEMPORAL]` como placeholders.
                    </li>
                    <li>
                        <strong>Prueba de Conexión:</strong> Es crucial usar el botón <strong>&quot;Enviar Correo de Prueba&quot;</strong> para verificar que la configuración sea correcta.
                    </li>
                </ul>

                <h4 className="font-semibold text-lg pt-2 border-t">Flujo de Recuperación para Usuarios</h4>
                 <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>¿Olvidé mi contraseña?:</strong> En la pantalla de login, el usuario hace clic en el enlace, ingresa su correo y el sistema le envía una <strong>contraseña temporal</strong>.
                    </li>
                    <li>
                        <strong>Inicio de Sesión Forzado:</strong> Al ingresar con la contraseña temporal, la misma tarjeta de login se transforma y le pide al usuario que establezca una <strong>nueva contraseña personal</strong>.
                    </li>
                    <li>
                        <strong>Proceso Finalizado:</strong> Una vez que establece su nueva contraseña, se le informa que el cambio fue exitoso y se le pide que vuelva a la pantalla de login para ingresar normalmente.
                    </li>
                </ul>

                 <h4 className="font-semibold text-lg pt-2 border-t">Creación de Nuevos Usuarios</h4>
                 <ul className="list-disc space-y-3 pl-6">
                    <li>Al crear un nuevo usuario, el administrador ahora tiene una casilla: <strong>&quot;Forzar cambio de contraseña en el próximo inicio de sesión&quot;</strong>.</li>
                    <li>Si se marca, el nuevo usuario seguirá el mismo flujo de cambio de contraseña forzado la primera vez que ingrese, asegurando que establezca una clave personal y segura.</li>
                 </ul>
            </div>
        )
    },
    {
        title: "Tutorial: Buzón de Sugerencias",
        icon: <MessageSquare className="mr-4 h-6 w-6 text-green-600" />,
        content: (
             <div className="space-y-4">
                <p>
                Esta es una herramienta de comunicación directa para mejorar la aplicación. Todos los usuarios pueden participar.
                </p>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Enviar una Sugerencia:</strong> En el panel principal, haz clic en el botón verde <strong>&quot;Sugerencias y Mejoras&quot;</strong> (<MessageSquare className="inline h-4 w-4" />). Se abrirá una ventana donde podrás escribir tu idea, reportar un problema o proponer una mejora. Al enviarla, los usuarios con permiso para leer sugerencias serán notificados.
                    </li>
                    <li>
                        <strong>Gestión para Administradores:</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Los usuarios con permiso `admin:suggestions:read` verán un contador de sugerencias no leídas en el botón de &quot;Configuración&quot; del menú lateral.</li>
                            <li>Dentro de <strong>Administración &gt; Buzón de Sugerencias</strong>, podrán ver todas las sugerencias enviadas, quién las envió y cuándo.</li>
                            <li>Las sugerencias nuevas aparecen resaltadas. Pueden marcarlas como leídas (<CheckCircle className="inline h-4 w-4 text-green-600"/>) o eliminarlas (<Trash2 className="inline h-4 w-4 text-red-600"/>).</li>
                        </ul>
                    </li>
                </ul>
            </div>
        )
    },
     {
        title: "Guía Maestra: Asistente de Costos",
        icon: <Calculator className="mr-4 h-6 w-6 text-orange-500" />,
        content: (
            <div className="space-y-4">
                <p>Esta herramienta te ayuda a calcular los precios de venta de tus productos importados, tomando en cuenta todos los costos asociados a una compra.</p>
                
                <h4 className="font-semibold text-lg pt-2 border-t">Flujo de Trabajo del Asistente</h4>
                <ol className="list-decimal space-y-4 pl-6">
                    <li>
                        <strong>Paso 1: Cargar Facturas XML (<UploadCloud className="inline h-4 w-4"/>).</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Usa el botón &quot;Cargar Facturas XML&quot; para seleccionar una o varias facturas de compra en formato XML de Hacienda (v4.3 o v4.4). El sistema extraerá automáticamente todos los artículos, cantidades y costos.</li>
                            <li>Verás las facturas procesadas en la tarjeta de &quot;Facturas Procesadas&quot;, indicando si la extracción fue exitosa o si hubo algún error (ej. XML malformado).</li>
                            <li>El sistema ahora es más inteligente: limpiará automáticamente la descripción del artículo (quitando datos como `...;IVA1;...`) y dará prioridad al código de producto del proveedor si está presente.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 2: Añadir Costos y Manejar Descuentos.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Ingresa el costo total de <strong>Transporte</strong> y de <strong>Otros Costos</strong> (como aduanas, comisiones, etc.). El sistema <strong>prorrateará</strong> estos costos automáticamente entre todos los artículos cargados.</li>
                            <li><strong>Manejo de Descuentos:</strong> En la misma tarjeta, puedes decidir cómo tratar los descuentos de la factura: si se aplican para <strong>reducir el costo</strong> del producto (beneficiando al cliente final) o si se consideran como <strong>parte de la ganancia</strong> de la empresa.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 3: Ajustar y Calcular Precios.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>En la tabla de &quot;Artículos Extraídos&quot;, puedes editar la mayoría de los campos.</li>
                            <li><strong>Costo Unit. (s/IVA):</strong> Este es el costo real del artículo (costo de factura + costo prorrateado +/- efecto del descuento). Puedes <strong>sobrescribirlo manualmente</strong> si necesitas ajustar el costo base para un artículo específico.</li>
                            <li><strong>Imp. %:</strong> El sistema extrae el impuesto del XML, pero puedes editarlo aquí si es necesario (ej. de &quot;13&quot; a &quot;1&quot;).</li>
                            <li><strong>Margen:</strong> Introduce el margen de ganancia deseado (ej. &quot;20&quot; para un 20%).</li>
                            <li>El sistema calculará automáticamente el <strong>P.V.P. Unitario Sugerido</strong> y la <strong>Ganancia por Línea</strong> en tiempo real.</li>
                        </ul>
                    </li>
                     <li>
                        <strong>Paso 4: Guardar o Exportar.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li><strong>Guardar Borrador (<Save className="inline h-4 w-4"/>):</strong> Si necesitas continuar más tarde, guarda tu análisis como un borrador. Podrás cargarlo desde el botón &quot;Cargar Borradores&quot;.</li>
                            <li><strong>Exportar a Excel (<FileDown className="inline h-4 w-4"/>):</strong> Cuando los precios estén listos, haz clic en este botón. Se generará un archivo <strong>Excel (.xlsx)</strong> con los datos exactos que ves en pantalla, ideal para análisis externos o para archivar el cálculo.</li>
                        </ul>
                    </li>
                </ol>
            </div>
        )
    },
    {
        title: "Guía Maestra: Módulo Cotizador",
        icon: <DollarSign className="mr-4 h-6 w-6 text-green-500" />,
        content: (
             <div className="space-y-4">
                <p>Esta es tu herramienta principal para crear y enviar cotizaciones profesionales a los clientes. Su diseño está optimizado para la velocidad y la precisión.</p>
                
                <h4 className="font-semibold text-lg pt-2 border-t">Flujo de Trabajo Recomendado</h4>
                <ol className="list-decimal space-y-4 pl-6">
                    <li>
                        <strong>Paso 1: Seleccionar al Cliente y Verificar su Información.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Empieza a escribir el nombre, código o cédula del cliente en el campo &quot;Buscar Cliente&quot;. El sistema te mostrará una lista de sugerencias. Haz clic o presiona `Enter` para seleccionarlo.</li>
                            <li>Al seleccionar, aparecerá una tarjeta con los <strong>datos críticos del ERP</strong> (<CreditCard className="inline h-4 w-4"/>): cédula, límite de crédito, condición de pago y vendedor asignado. Esto te da una visión instantánea del estado del cliente.</li>
                            <li><strong>Verificar Exoneración (<ShieldQuestion className="inline h-4 w-4" />):</strong> Si el cliente tiene una exoneración en el ERP, aparecerá una segunda tarjeta. El sistema consultará a Hacienda <strong>en tiempo real</strong> y te mostrará dos estados para que los compares: el del ERP y el de Hacienda. Esto te permite confirmar si la exoneración sigue vigente antes de aplicarla.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 2: Agregar Productos y Consultar Detalles.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>En el campo &quot;Agregar Producto&quot;, busca por código, descripción o <strong>código de barras</strong>. El sistema te sugerirá productos y te mostrará el <strong>inventario actual del ERP</strong> entre paréntesis.</li>
                            <li>Presiona `Enter` o haz clic para añadir el producto a la cotización. El sistema aplicará el impuesto automáticamente (13% por defecto, 1% para canasta básica, o 0% si el cliente tiene una exoneración válida).</li>
                            <li><strong>Consultar Info del Producto (<BadgeInfo className="inline h-4 w-4"/>):</strong> Haz clic en cualquier parte de la fila de un producto ya agregado. Aparecerá una tarjeta con información detallada del ERP: su <strong>clasificación</strong>, la <strong>fecha del último ingreso</strong> y notas importantes.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 3: Ajustar Cantidades y Precios.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Modifica directamente los campos de cantidad y precio.</li>
                            <li><strong>Atajos de Teclado (<Keyboard className="inline h-4 w-4" />):</strong> Usa la tecla `Enter` en los campos &quot;Cantidad&quot; y &quot;Precio&quot;. El sistema te moverá eficientemente: de Cantidad a Precio, y de Precio de vuelta al buscador de productos para que puedas seguir añadiendo artículos sin usar el mouse.</li>
                            <li><strong>Uso en Móviles:</strong> En pantallas pequeñas, los campos de Cantidad y Precio ahora tienen más espacio. Si necesitas ver otras columnas como &quot;Cabys&quot; o &quot;Unidad&quot;, puedes activarlas desde el botón &quot;Columnas&quot;.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 4: Finalizar y Generar.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Ajusta las condiciones de pago, la validez de la oferta y añade cualquier nota adicional.</li>
                            <li><strong>Borradores (<Folder className="inline h-4 w-4" />):</strong> Si no terminaste, guarda la cotización como borrador. Puedes cargarla más tarde desde el botón &quot;Ver Borradores&quot;.</li>
                            <li><strong>Generar PDF (<FileDown className="inline h-4 w-4" />):</strong> Cuando todo esté listo, genera el PDF. El número de cotización se actualizará automáticamente para la próxima vez.</li>
                        </ul>
                    </li>
                </ol>
            </div>
        )
    },
    {
        title: "Guía Técnica: Módulo de Solicitudes de Compra",
        icon: <ShoppingCart className="mr-4 h-6 w-6 text-yellow-500" />,
        content: (
            <div className="space-y-4">
                <p>Esta herramienta te permite crear, gestionar y dar seguimiento a las solicitudes de compra internas de manera centralizada.</p>
                
                <h4 className="font-semibold text-lg pt-2 border-t">Flujo de Estados</h4>
                <p>Las solicitudes pasan por varios estados para un seguimiento claro:</p>
                <ul className="list-disc space-y-3 pl-6">
                    <li><strong>Pendiente:</strong> La solicitud ha sido creada y está esperando revisión.</li>
                    <li><strong>Revisión Compras:</strong> El equipo de compras está revisando la solicitud. Desde aquí, pueden <strong>regresar a Pendiente</strong> si se necesita una corrección.</li>
                    <li><strong>Pendiente Aprobación:</strong> La solicitud ha sido enviada para su aprobación final. Desde aquí, se puede <strong>regresar a Revisión Compras</strong>.</li>
                    <li><strong>Aprobada (<CheckCircle className="inline h-4 w-4 text-green-600"/>):</strong> Un usuario con permisos ha aprobado la compra.</li>
                    <li><strong>Ordenada (<Truck className="inline h-4 w-4 text-blue-600"/>):</strong> Ya se realizó el pedido al proveedor.</li>
                    <li><strong>Recibida (<PackageCheck className="inline h-4 w-4 text-teal-600"/>):</strong> (Paso opcional) El producto ha llegado. Este paso se activa en Administración.</li>
                    <li><strong>En Bodega (<Warehouse className="inline h-4 w-4 text-gray-700"/>):</strong> (Paso opcional) El producto ya está en el almacén físico.</li>
                    <li><strong>Ingresado en ERP (<DatabaseZap className="inline h-4 w-4 text-indigo-600"/>):</strong> (Paso opcional) El ingreso de la mercancía se ha registrado en el ERP.</li>
                    <li><strong>Cancelada (<XCircle className="inline h-4 w-4 text-red-600"/>):</strong> La solicitud ha sido cancelada.</li>
                </ul>

                <h4 className="font-semibold text-lg pt-2 border-t">Funcionalidades Clave</h4>
                <ul className="list-disc space-y-3 pl-6">
                <li>
                    <strong>Visibilidad por Defecto:</strong> Por seguridad y claridad, la vista de solicitudes siempre mostrará por defecto solo los documentos que tú has creado. Si tienes el permiso `requests:read:all`, la casilla &quot;Mostrar solo mis solicitudes&quot; aparecerá desmarcada por defecto, dándote visibilidad total, pero puedes marcarla para enfocarte en tus documentos.
                </li>
                <li>
                    <strong>Creación Inteligente desde ERP (<Layers className="inline h-4 w-4"/>):</strong> Permite crear solicitudes de compra automáticamente a partir de un pedido de venta del ERP. El sistema analiza el pedido, compara con el inventario actual y sugiere qué artículos comprar.
                </li>
                 <li>
                    <strong>Creación desde Sugerencias:</strong> En el módulo de Analíticas, puedes generar solicitudes directamente desde la herramienta &quot;Sugerencias de Compra&quot;. El sistema creará la solicitud con los datos disponibles y la dejará &quot;Pendiente&quot; para que Compras complete la información faltante, como el precio.
                </li>
                <li>
                    <strong>Aviso de &apos;Modificado&apos; (<AlertTriangle className="inline h-4 w-4 text-red-600" />):</strong> Si una solicitud es editada después de haber sido Aprobada u Ordenada, aparecerá una alerta visual &apos;Modificado&apos; para notificar a todos los involucrados.
                </li>
                 <li>
                    <strong>Alerta de Duplicados (<Info className="inline h-4 w-4 text-amber-500" />):</strong> Al crear una solicitud, si el sistema detecta que ya existen otras solicitudes activas (pendientes, aprobadas u ordenadas) para el mismo artículo, te mostrará una advertencia para evitar compras duplicadas.
                </li>
                 <li>
                    <strong>Tooltips Informativos:</strong> Si un botón de acción (como &quot;Aprobar&quot; o &quot;Reabrir&quot;) está desactivado, ahora puedes pasar el cursor sobre él para ver un mensaje que explica por qué no está disponible (ej: &quot;Solo para solicitudes aprobadas&quot;).
                </li>
                <li>
                    <strong>Pasos Opcionales:</strong> En <strong>Administración &gt; Config. Compras</strong>, puedes activar el paso de &quot;Recibido en Bodega&quot; y el paso final &quot;Ingresado en ERP&quot; para un control más detallado del proceso logístico.
                </li>
                <li>
                    <strong>Exportación:</strong> Puedes generar un archivo <strong>PDF</strong> o <strong>Excel (.xlsx)</strong> del reporte actual, incluyendo los filtros que hayas aplicado.
                </li>
                </ul>
            </div>
        )
    },
    {
        title: "Tutorial: Módulo Planificador OP",
        icon: <CalendarCheck className="mr-4 h-6 w-6 text-purple-500" />,
        content: (
             <div className="space-y-4">
                <p>
                Organiza y visualiza la carga de trabajo del taller o la producción. Permite un seguimiento detallado de cada orden.
                </p>
                
                <h4 className="font-semibold text-lg pt-2 border-t">Flujo de Estados Mejorado</h4>
                <p>Las órdenes pasan por varias etapas para un control preciso. Ahora puedes avanzar y retroceder en el flujo para corregir errores.</p>
                <ul className="list-disc space-y-3 pl-6">
                    <li><strong>Pendiente:</strong> La orden ha sido creada. Desde aquí, un usuario con permisos la envía al siguiente paso.</li>
                    <li><strong>Pendiente Revisión (<Send className="inline h-4 w-4 text-cyan-600"/>):</strong> La orden espera la revisión de un supervisor o encargado de producción. Desde aquí se puede <strong>regresar a Pendiente</strong> (<Undo2 className="inline h-4 w-4 text-orange-600"/>) si hay algo que corregir.</li>
                    <li><strong>Pendiente Aprobación (<ShoppingBag className="inline h-4 w-4 text-orange-600"/>):</strong> La orden ha sido revisada y ahora espera la aprobación final de un gerente. Desde aquí, se puede <strong>regresar a Revisión</strong> (<Undo2 className="inline h-4 w-4 text-orange-600"/>).</li>
                    <li><strong>Aprobada (<CheckCircle className="inline h-4 w-4 text-green-600"/>):</strong> La orden está autorizada para producción.</li>
                    <li><strong>En Cola, En Progreso, etc.:</strong> El resto del flujo continúa como antes (En Cola, En Progreso, Completada, etc.).</li>
                </ul>

                <h4 className="font-semibold text-lg pt-2 border-t">Funcionalidades Clave</h4>
                 <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Visibilidad por Defecto:</strong> Al igual que en Compras, el planificador te mostrará por defecto solo las órdenes que tú has creado. Los usuarios con el permiso `planner:read:all` verán la casilla de &quot;Mostrar solo mis órdenes&quot; desmarcada al inicio para tener una vista global.
                    </li>
                    <li>
                        <strong>Validación de Campos:</strong> Al crear una nueva orden, el sistema ahora te avisará si olvidas seleccionar un cliente, un producto, o si la cantidad es cero, evitando errores.
                    </li>

                    <li>
                        <strong>Tooltips Informativos:</strong> Si un botón de acción (como &quot;Aprobar&quot; o &quot;Iniciar Progreso&quot;) está desactivado, ahora puedes pasar el cursor sobre él para ver un mensaje que explica por qué no está disponible (ej: &quot;Se requiere asignar una máquina&quot; o &quot;Solo para órdenes aprobadas&quot;).
                    </li>

                    <li>
                        <strong>Alertas y Solicitudes de Cambio:</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li><strong>Aviso de &quot;Modificado&quot; (<AlertTriangle className="inline h-4 w-4 text-red-600" />):</strong> Si una orden se edita después de ser aprobada, aparecerá esta alerta. Un supervisor deberá hacer clic en el nuevo botón <strong>&quot;Confirmar Modificación&quot;</strong> para limpiar la alerta, dejando un registro en el historial.</li>
                            <li><strong>Solicitar Desaprobación / Cancelación:</strong> Si una orden ya aprobada necesita un cambio mayor o debe ser cancelada, puedes solicitarlo. Esto notificará a los administradores para que aprueben o rechacen tu petición. Si es rechazada, recibirás una notificación de vuelta.</li>
                        </ul>
                    </li>
                    <li>
                        **Historial (<History className="inline h-4 w-4"/>):** Haz clic en el icono de historial en cualquier orden para ver un registro detallado de cada cambio de estado, quién lo hizo y cuándo.
                    </li>
                </ul>
            </div>
        )
    },
    {
        title: "Tutorial: Módulo de Analíticas",
        icon: <BarChartBig className="mr-4 h-6 w-6 text-indigo-500" />,
        content: (
            <div className="space-y-4">
                <p>
                Este es el centro de inteligencia de la aplicación. Agrupa herramientas que analizan los datos del ERP y del sistema para ayudarte a tomar decisiones más inteligentes.
                </p>
                <h4 className="font-semibold text-lg pt-2 border-t">Sugerencias de Compra Proactivas (<Lightbulb className="inline h-5 w-5 text-yellow-400"/>)</h4>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>
                        <strong>¿Qué hace?:</strong> Esta herramienta revisa todos los pedidos de venta del ERP dentro de un rango de fechas, los compara con el inventario actual y te dice exactamente qué artículos te hacen falta para cumplir con esos pedidos.
                    </li>
                    <li>
                        <strong>¿Cómo se usa?:</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Selecciona un rango de fechas de los pedidos del ERP que quieres analizar y haz clic en <strong>&quot;Analizar Pedidos&quot;</strong>.</li>
                            <li>El sistema te mostrará una tabla con los artículos faltantes. Para cada artículo, verás la cantidad total que necesitas, cuánto tienes en inventario, y el faltante exacto.</li>
                            <li>**Ordena los resultados:** Haz clic en el encabezado de cualquier columna (ej: <strong>&quot;Próxima Entrega&quot;</strong> o <strong>&quot;Faltante Total&quot;</strong>) para ordenar la tabla según ese criterio. Una flecha te indicará el orden actual.</li>
                            <li>Usa los filtros de búsqueda y de clasificación (que ahora permite <strong>selección múltiple</strong>) para refinar la lista.</li>
                            <li>
                                <strong>Crear Solicitudes:</strong> Marca los artículos que quieres comprar y haz clic en <strong>&quot;Crear Solicitudes&quot;</strong>. El sistema creará las solicitudes automáticamente en segundo plano, dejándolas &quot;Pendientes&quot; para que Compras complete la información faltante, como el precio.
                            </li>
                             <li>
                                <strong>Alerta de Duplicados (<Info className="inline h-4 w-4 text-amber-500"/>):</strong> Si intentas crear una solicitud para un artículo que ya tiene una solicitud activa, el sistema te mostrará una <strong>alerta con detalles</strong>, incluyendo el número de la solicitud existente y quién la creó. Podrás decidir si quieres crear el duplicado o no.
                            </li>
                            <li>Puedes exportar esta vista a <strong>Excel</strong> para un análisis más profundo.</li>
                        </ul>
                    </li>
                </ol>
                 <h4 className="font-semibold text-lg pt-2 border-t">Reporte de Permisos de Usuario (<UserCheck className="inline h-5 w-5 text-fuchsia-600"/>)</h4>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>
                        <strong>¿Qué hace?:</strong> Esta es una herramienta de auditoría crucial. Te muestra una lista de todos los usuarios del sistema, su rol asignado y un desglose completo de todos los permisos que ese rol les concede.
                    </li>
                    <li>
                        <strong>¿Cómo se usa?:</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Accede al reporte para ver la tabla completa.</li>
                            <li>Usa la barra de búsqueda para filtrar rápidamente por nombre de usuario, correo o nombre del rol.</li>
                            <li>Haz clic en los encabezados de columna <strong>&quot;Usuario&quot;</strong> o <strong>&quot;Rol&quot;</strong> para ordenar la lista.</li>
                            <li>Exporta la vista actual a <strong>PDF</strong> o <strong>Excel</strong> para compartirla o archivarla como un registro de auditoría de seguridad.</li>
                        </ul>
                    </li>
                </ol>
                 <h4 className="font-semibold text-lg pt-2 border-t">Reporte de Catálogo de Clientes por Producto (<BookUser className="inline h-5 w-5 text-rose-600"/>)</h4>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>
                        <strong>¿Qué hace?:</strong> Permite auditar todas las asignaciones de producto-cliente-ubicación que se han configurado en el sistema.
                    </li>
                    <li>
                        <strong>¿Cómo se usa?:</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                           <li>Accede al reporte para ver una tabla con todas las asignaciones. Ahora mostrará las <strong>multi-ubicaciones</strong> agrupadas.</li>
                            <li>Utiliza el nuevo **filtro de fecha** para acotar la búsqueda por cuándo se actualizó la asignación.</li>
                            <li>Filtra por **tipo de asignación** para ver solo las que son de venta General, Exclusivas para un cliente, o las que no tienen cliente asignado.</li>
                            <li>Usa la búsqueda de texto y el filtro de clasificación para encontrar rápidamente lo que necesitas.</li>
                            <li>La tabla tiene paginación para un rendimiento óptimo. Puedes exportar la vista actual a PDF o Excel.</li>
                        </ul>
                    </li>
                </ol>
            </div>
        )
    },
    {
        title: "Guía Maestra: Módulo de Almacenes (Nuevo)",
        icon: <Warehouse className="mr-4 h-6 w-6 text-cyan-600" />,
        content: (
            <div className="space-y-4">
                <p>Este módulo te da control total sobre la localización y conteo de tu inventario. Con las últimas mejoras, el sistema es más inteligente y flexible.</p>
                
                <h4 className="font-semibold text-lg pt-4 border-t">Flujos de Trabajo Inteligentes</h4>
                <Alert variant="default" className="mt-4">
                    <GitBranch className="h-4 w-4" />
                    <AlertTitle>¡Nueva Lógica de Decisión!</AlertTitle>
                    <AlertDescription>
                        Para evitar errores y duplicados, ahora el sistema te preguntará qué hacer cuando asignes un producto a una ubicación nueva si este ya tenía una asignación previa.
                    </AlertDescription>
                </Alert>

                <ul className="list-disc space-y-4 pl-6 mt-4">
                    <li>
                        <strong>Asignar en Catálogo y Recepción: El Flujo Deliberado</strong>
                        <p className="text-sm text-muted-foreground">Al usar el <strong>&quot;Catálogo Clientes y Artículos&quot;</strong> o el <strong>&quot;Asistente de Recepción&quot;</strong>, si asignas el `Producto A` a una nueva `Ubicación X`, el sistema detectará si ya estaba asignado a una `Ubicación Y` y te preguntará:</p>
                        <blockquote className="mt-2 border-l-2 pl-4 italic">&quot;Este producto ya está asignado a [Ubicación Y]. ¿Qué deseas hacer?&quot;</blockquote>
                        <div className="flex gap-2 mt-2">
                            <Button size="sm" variant="secondary">Mover a la nueva ubicación</Button>
                            <Button size="sm" variant="outline">Agregar como ubicación adicional</Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Esto te da control total para decidir si estás <strong>moviendo</strong> el producto o si necesitas que tenga <strong>múltiples hogares</strong> (multi-ubicación).</p>
                    </li>
                    
                    <li>
                        <strong>Poblado Rápido: El Flujo Ágil con Auditoría</strong>
                        <p className="text-sm text-muted-foreground">En el <strong>&quot;Asistente de Poblado&quot;</strong>, la velocidad es clave. Aquí el flujo es diferente para no interrumpirte:</p>
                        <ol className="list-decimal space-y-2 pl-5 mt-2 text-sm">
                            <li>El bodeguero escanea el `Producto B` en `R08-C-15`.</li>
                            <li>El sistema <strong>guarda la asignación inmediatamente</strong> para no perder el dato.</li>
                            <li>Si detecta que el `Producto B` ya estaba en otra parte, muestra una alerta no intrusiva: <span className="bg-yellow-100 text-yellow-800 p-1 rounded">&quot;¡Ojo! Se creó una ubicación adicional.&quot;</span></li>
                            <li>Al <strong>Finalizar Sesión</strong>, se muestra un resumen resaltando los productos con múltiples ubicaciones y <strong>se envía un correo automático a los supervisores</strong> para su revisión.</li>
                        </ol>
                    </li>
                </ul>

                <h4 className="font-semibold text-lg pt-4 border-t">¿Cómo Mover un Artículo de Ubicación?</h4>
                <p>Con la nueva lógica, mover un producto es más fácil y seguro:</p>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>
                        <strong>Usa &quot;Catálogo Clientes y Artículos&quot;:</strong> Es la herramienta recomendada para gestionar la &quot;casa&quot; de un producto.
                    </li>
                    <li>
                        <strong>Crea la nueva asignación:</strong> Busca el producto que quieres mover y asígnale su <strong>nueva ubicación</strong>.
                    </li>
                    <li>
                        <strong>Toma la decisión:</strong> Cuando aparezca el diálogo, presiona el botón <strong>&quot;Mover a la nueva ubicación&quot;</strong>.
                    </li>
                     <li>
                        <strong>¡Listo!</strong> El sistema actualizará el registro existente, asegurando que no queden datos obsoletos.
                    </li>
                </ol>
                <p className="text-sm text-muted-foreground">Ya no es necesario hacer un movimiento de salida y luego uno de entrada para trasladar un artículo. El sistema lo maneja de forma limpia.</p>

                <h4 className="font-semibold text-lg pt-4 border-t">Otras Herramientas Principales</h4>
                 <ul className="list-disc space-y-3 pl-6 mt-4">
                    <li>
                        <strong>Búsqueda Rápida (<QrCode className="inline h-4 w-4"/>):</strong> Ideal para dispositivos con escáner. Simplemente escanea el código de un artículo para ver instantáneamente su información, existencias y ubicaciones. El campo de búsqueda se limpia automáticamente, listo para el siguiente escaneo.
                    </li>
                    <li>
                        <strong>Administración de Ingresos (<BookMarked className="inline h-4 w-4 text-red-500"/>):</strong>
                        Permite buscar, aplicar o corregir ingresos de inventario. Incluye paginación y un filtro inteligente para ver solo los ingresos pendientes.
                    </li>
                     <li>
                        <strong>Toma de Inventario Físico (<ClipboardCheck className="inline h-4 w-4"/>):</strong> Permite registrar conteos físicos de un producto en una ubicación específica. Ahora incluye un <strong>&quot;Modo Escáner&quot;</strong>.
                    </li>
                </ul>
            </div>
        )
    },
    {
        title: "Guía: Herramientas de TI",
        icon: <Cpu className="mr-4 h-6 w-6 text-slate-700" />,
        content: (
            <div className="space-y-4">
                <p>
                Este es un nuevo panel de control diseñado para centralizar la documentación y las herramientas del departamento de Tecnologías de la Información.
                </p>
                <h4 className="font-semibold text-lg pt-2 border-t">Notas Técnicas (<BookCopy className="inline h-5 w-5 text-blue-600"/>)</h4>
                <p>
                La primera herramienta de este módulo es una base de conocimiento interna. Su objetivo es simple: documentar todo.
                </p>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Crear Conocimiento:</strong> Crea notas para documentar procedimientos de soporte, guías de configuración, soluciones a problemas recurrentes, o cualquier información técnica relevante.
                    </li>
                    <li>
                        <strong>Vincular a Módulos:</strong> La característica más potente es la capacidad de vincular una nota a un módulo específico de la aplicación. Por ejemplo, puedes crear una &quot;Guía para Solicitudes de Compra&quot; y vincularla al módulo de &quot;Compras&quot;.
                    </li>
                    <li>
                        <strong>Búsqueda y Filtrado:</strong> Usa la barra de búsqueda para encontrar notas por título o contenido, y utiliza el filtro de &quot;Módulo&quot; para ver solo la documentación relevante para un área específica del sistema.
                    </li>
                </ul>
            </div>
        )
    },
    {
        title: "Guía: Centro de Trazabilidad y Operaciones (CTO)",
        icon: <FileSignature className="mr-4 h-6 w-6 text-teal-700" />,
        content: (
            <div className="space-y-4">
                <Alert variant="default" className="mt-4">
                    <Construction className="h-4 w-4" />
                    <AlertTitle>Módulo en Desarrollo</AlertTitle>
                    <AlertDescription>
                        Este módulo está actualmente en construcción y sentará las bases para la digitalización de formularios y procesos operativos.
                    </AlertDescription>
                </Alert>
                <p>
                El objetivo del CTO es reemplazar las boletas de papel por formularios digitales para cumplir con normativas como la ISO 9001 y mejorar la trazabilidad.
                </p>
                 <h4 className="font-semibold text-lg pt-2 border-t">Funcionalidades Planeadas</h4>
                <ul className="list-disc space-y-2 pl-6">
                    <li>Formularios para entrega de producción a bodega.</li>
                    <li>Boletas de salida de material a producción.</li>
                    <li>Registro de movimientos internos de inventario.</li>
                    <li>Gestión de muestras y devoluciones de clientes.</li>
                </ul>
            </div>
        )
    },
    {
        title: "Tutorial: Consultas a Hacienda",
        icon: <Search className="mr-4 h-6 w-6 text-indigo-500" />,
        content: (
            <div className="space-y-4">
                <p>
                Esta herramienta te permite consultar información directamente de las APIs del Ministerio de Hacienda de Costa Rica de forma centralizada.
                </p>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Búsqueda Unificada:</strong> Es la forma más potente de usar el módulo. Busca un cliente del ERP y el sistema hará todo el trabajo:
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Consultará la <strong>Situación Tributaria</strong> del cliente usando su cédula.</li>
                            <li>Buscará si tiene una <strong>exoneración asociada en el ERP</strong>.</li>
                            <li>Si la encuentra, consultará esa exoneración en Hacienda para ver su <strong>estado y los códigos CABYS</strong> que cubre.</li>
                            <li>Te presentará toda la información consolidada en una sola pantalla.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Búsquedas Individuales:</strong> También puedes usar las pestañas &quot;Situación Tributaria&quot; y &quot;Exoneraciones&quot; para hacer consultas directas a Hacienda ingresando una cédula o un número de autorización, respectivamente.
                    </li>
                </ul>
            </div>
        )
    },
    {
        title: "Tutorial: Mi Perfil",
        icon: <UserCog className="mr-4 h-6 w-6 text-blue-500" />,
        content: (
            <div className="flex items-start gap-4">
                <UserCog className="mt-1 h-6 w-6 text-blue-500 shrink-0" />
                <div>
                    <p>
                    Aquí puedes personalizar tu propia cuenta de usuario.
                    </p>
                    <ul className="list-disc space-y-2 pl-6">
                        <li>Actualiza tu nombre, teléfono y WhatsApp.</li>
                        <li>Cambia tu foto de perfil haciendo clic sobre el círculo con tus iniciales.</li>
                        <li>Cambia tu contraseña.</li>
                        <li>Configura una pregunta de seguridad para poder recuperar tu cuenta si olvidas la contraseña.</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        title: "Guía Técnica: Panel de Administración (Configuración)",
        icon: <Wrench className="mr-4 h-6 w-6 text-slate-600" />,
        content: (
            <div className="space-y-4">
                <p>
                Esta es la sala de máquinas del sistema, accesible solo para administradores. Aquí se configura todo el comportamiento de la aplicación, módulo por módulo.
                </p>
                <div className="space-y-4">
                    <div className="flex items-start gap-4">
                        <Users className="mt-1 h-6 w-6 text-blue-500 shrink-0" />
                        <div><h4 className="font-semibold">Gestión de Usuarios</h4><p>Permite crear, editar, eliminar y asignar roles a las cuentas de usuario. Incluye la opción de forzar el cambio de contraseña para nuevos usuarios.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <ShieldCheck className="mt-1 h-6 w-6 text-green-500 shrink-0" />
                        <div><h4 className="font-semibold">Gestión de Roles</h4><p>Define qué puede hacer cada usuario. Puedes crear roles personalizados (ej: &quot;Supervisor&quot;) y asignar permisos granulares para cada módulo. Al marcar un permiso &quot;padre&quot; (como &quot;Compras: Lectura y Creación&quot;), se marcarán automáticamente todos sus permisos hijos.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Mail className="mt-1 h-6 w-6 text-purple-600 shrink-0" />
                        <div><h4 className="font-semibold">Configuración de Correo</h4><p>Configura tu servidor de correo (SMTP) para habilitar el envío de notificaciones y la recuperación de contraseñas. Permite personalizar las plantillas de los correos.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Briefcase className="mt-1 h-6 w-6 text-orange-500 shrink-0" />
                        <div><h4 className="font-semibold">Configuración General</h4><p>Establece la identidad de tu empresa (nombre, logo), el nombre del sistema y ajusta parámetros globales como el tiempo de espera de la búsqueda o las horas para la alerta de sincronización del ERP.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <MessageSquare className="mt-1 h-6 w-6 text-green-600 shrink-0" />
                        <div><h4 className="font-semibold">Buzón de Sugerencias</h4><p>Revisa el feedback enviado por los usuarios a través del botón &quot;Sugerencias y Mejoras&quot; en el panel principal.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <DollarSign className="mt-1 h-6 w-6 text-emerald-600 shrink-0" />
                        <div><h4 className="font-semibold">Config. Cotizador</h4><p>Ajusta el comportamiento del Cotizador, definiendo el prefijo y el número con el que iniciará la siguiente cotización, y si se debe mostrar la cédula del cliente.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Calculator className="mt-1 h-6 w-6 text-orange-600 shrink-0" />
                        <div><h4 className="font-semibold">Config. Asist. Costos</h4><p>Gestionar los consecutivos y prefijos para los borradores del Asistente de Costos.</p></div>
                    </div>
                     <div className="flex items-start gap-4">
                        <Settings className="mt-1 h-6 w-6 text-indigo-700 shrink-0" />
                        <div><h4 className="font-semibold">Config. Analíticas</h4><p>Personaliza alias y colores para los estados del Reporte de Tránsitos.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Factory className="mt-1 h-6 w-6 text-purple-700 shrink-0" />
                        <div><h4 className="font-semibold">Config. Planificador</h4><p>Personaliza el Planificador, incluyendo los nombres de &quot;máquinas&quot;, los turnos de trabajo, los estados personalizados, los campos que disparan la alerta de &quot;Modificado&quot;, y el formato de exportación a PDF.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Store className="mt-1 h-6 w-6 text-amber-700 shrink-0" />
                        <div><h4 className="font-semibold">Config. Compras</h4><p>Define las rutas de entrega, métodos de envío y activa pasos opcionales en el flujo de aprobación como &quot;Recibido en Bodega&quot; o &quot;Ingresado en ERP&quot;.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Map className="mt-1 h-6 w-6 text-teal-700 shrink-0" />
                        <div><h4 className="font-semibold">Config. Almacenes</h4><p>Define la jerarquía de ubicaciones (el &quot;molde&quot;), gestiona las bodegas del ERP para el desglose de stock, ajusta los prefijos para las etiquetas de unidades de inventario y configura las notificaciones de despacho.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <FileUp className="mt-1 h-6 w-6 text-cyan-500 shrink-0" />
                        <div>
                            <h4 className="font-semibold">Importar Datos</h4>
                            <p>Sincroniza los datos maestros (clientes, productos, etc.) desde tu ERP. Tienes dos modos: por <strong>Archivos</strong> (cargando .txt o .csv) o por <strong>SQL Server</strong> (conectando directamente a la base de datos de tu ERP, usando el Gestor de Consultas para definir cada `SELECT`).</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <DatabaseZap className="mt-1 h-6 w-6 text-red-500 shrink-0" />
                        <div><h4 className="font-semibold">Mantenimiento</h4>
                            <p>Herramientas críticas, ahora separadas en secciones para mayor claridad y seguridad:</p>
                            <ul className="list-disc pl-5 text-sm space-y-1 mt-2">
                                <li><strong>Centro de Verificación:</strong> Audita la integridad y estructura de todas las bases de datos para asegurar que las tablas y columnas sean correctas, una herramienta vital después de una actualización. Si encuentra un error, permite intentar una reparación automática.</li>
                                <li>
                                    <strong>Backups y Puntos de Restauración:</strong> Gestiona backups de <strong>todo el sistema</strong>. La acción <strong>&quot;Crear Punto de Restauración&quot;</strong> ahora es más segura, ya que consolida los datos (ejecuta un `checkpoint`) antes de crear la copia.
                                </li>
                                <li>
                                    <strong>Zona de Peligro:</strong> Contiene acciones críticas. Aquí puedes restaurar la base de datos de un solo módulo, resetear un módulo a su estado de fábrica, o usar el nuevo botón <strong>&quot;Forzar Consolidación de Datos&quot;</strong> para asegurar que todos los cambios pendientes se escriban en los archivos principales de la base de datos.
                                </li>
                            </ul>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Network className="mt-1 h-6 w-6 text-indigo-500 shrink-0" />
                        <div><h4 className="font-semibold">Configuración de API</h4><p>Define las URLs de los servicios externos que utiliza la aplicación, como las APIs de Hacienda para consultar el tipo de cambio, la situación tributaria y el estado de las exoneraciones.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <FileTerminal className="mt-1 h-6 w-6 text-slate-500 shrink-0" />
                        <div><h4 className="font-semibold">Visor de Eventos</h4>
                            <p>Un registro (log) de todo lo que sucede en el sistema. Es una herramienta invaluable para diagnosticar problemas. Permite filtrar por tipo de evento (Operativo vs. Sistema), fecha y texto. También permite limpiar los registros de forma granular.</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        title: "Guía Técnica: Actualización y Problemas Comunes",
        icon: <Wrench className="mr-4 h-6 w-6 text-slate-600" />,
        content: (
            <div className="space-y-4">
                 <h4 className="font-semibold text-lg">Proceso de Actualización Seguro</h4>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>
                        <strong>Paso 1: Realizar una Copia de Seguridad (<Copy className="inline h-4 w-4"/>).</strong> Este es el paso más importante. Antes de tocar nada, ve a <strong>Administración &gt; Mantenimiento</strong> y haz clic en <strong>&quot;Crear Punto de Restauración&quot;</strong>. Esto generará una copia segura de todas las bases de datos del sistema.
                    </li>
                    <li>
                        <strong>Paso 2: Reemplazar Archivos.</strong> Detén la aplicación (por ejemplo, usando `pm2 stop clic-tools` en Linux o deteniendo el sitio en IIS). Luego, borra todos los archivos y carpetas de la versión anterior **excepto** la carpeta `dbs/` y, si existe, el archivo `.env.local`. Después, copia todos los archivos de la nueva versión en su lugar.
                    </li>
                    <li>
                        <strong>Paso 3: Actualizar y Reconstruir.</strong> Abre una terminal en la carpeta del proyecto, ejecuta `npm install --omit=dev` para instalar cualquier nueva dependencia y luego `npm run build` para compilar la nueva versión.
                    </li>
                    <li>
                        <strong>Paso 4: Reiniciar y Verificar.</strong> Vuelve a iniciar la aplicación (ej: `pm2 start clic-tools`). Al arrancar, el sistema detectará las diferencias y añadirá las nuevas tablas o columnas automáticamente. Luego, ve a <strong>Administración &gt; Mantenimiento &gt; Centro de Verificación</strong> y ejecuta la auditoría para confirmar que todas las bases de datos tienen la estructura correcta.
                    </li>
                </ol>
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>¡Atención!</AlertTitle>
                    <AlertDescription>
                        Nunca reemplaces la carpeta &quot;dbs/&quot; del servidor con la de la nueva versión, ya que esto borraría todos tus datos de producción.
                    </AlertDescription>
                </Alert>

                <h4 className="font-semibold text-lg pt-4 border-t">Solución de Problemas: Despliegue en IIS</h4>
                <div className="space-y-2">
                    <p><strong>Síntoma:</strong> Después de guardar un cambio en la configuración o importar datos, la aplicación se reinicia o muestra un error &quot;aborted&quot;.</p>
                    <p><strong>Diagnóstico:</strong> El vigilante de archivos de `iisnode` está detectando cambios en las bases de datos (`.db`) y reinicia la aplicación de forma incorrecta.</p>
                    <p><strong>La Solución Definitiva (v2.0.0+):</strong> A partir de la versión 2.0.0, el proyecto incluye un archivo `web.config` en la raíz. Este archivo ya está configurado para decirle a IIS que **ignore** los cambios en la carpeta &quot;dbs/&quot;, solucionando el problema de raíz. Simplemente asegúrate de que este archivo se copie al servidor durante el despliegue.</p>
                 </div>
            </div>
        )
    },
    {
        title: "Guía de Diseño: Estándar Responsivo Premium (Desarrolladores)",
        icon: <Palette className="mr-4 h-6 w-6 text-pink-500" />,
        content: (
            <div className="space-y-4">
                <p>
                Este sistema utiliza un estándar de diseño responsivo de alta gama para asegurar que todas las páginas complejas, formularios y tablas sean plenamente funcionales y hermosos en celulares y tablets.
                </p>
                <h4 className="font-semibold text-lg pt-2 border-t">Pilares del Estándar</h4>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Menú de Acceso Vertical:</strong> En celulares, las barras de pestañas horizontales se ocultan y se reemplazan por tarjetas verticales con iconos y bordes muy redondeados (<code>rounded-2xl</code>) para una navegación más cómoda y táctil.
                    </li>
                    <li>
                        <strong>Panel Inferior Desplizable (Bottom Sheet Drawer):</strong> Al tocar una pestaña, el contenido se abre dentro de una hoja deslizable inferior (<code>Sheet</code>) con altura de <code>92vh</code>, bordes curvos pronunciados y un scroll vertical aislado. Esto evita que los formularios anchos o tablas estiren horizontalmente la pantalla principal del dashboard.
                    </li>
                    <li>
                        <strong>Botón de Cierre Ultra-Táctil Premium:</strong> La hoja deslizable cuenta con un botón de cierre circular ultra-llamativo de color rojo vibrante (<code>w-10 h-10 rounded-full bg-red-500 text-white shadow-md</code>) y una <strong>X</strong> con trazo grueso y tamaño aumentado a <code>h-5 w-5 stroke-[2.5]</code> para una visibilidad y facilidad de uso inigualable.
                    </li>
                </ul>
                <p className="text-sm text-muted-foreground">
                Para consultar las directrices y ejemplos técnicos de implementación en React, consulte el documento <code>docs/estandar_resposivo.txt</code> en la raíz del proyecto.
                </p>
            </div>
        )
    },
     {
        title: "Control de Cambios (Changelog)",
        icon: <ListChecks className="mr-4 h-6 w-6 text-fuchsia-600" />,
        content: (
             <div className="space-y-4">
                <p>Para ver un historial detallado de todos los cambios, mejoras y correcciones de errores en cada versión, por favor consulta el archivo `CHANGELOG.md` en la raíz del proyecto. Este archivo es la fuente de verdad sobre la evolución de la aplicación.</p>
            </div>
        )
    }
  ];

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-white">
                <LifeBuoy className="h-6 w-6" />
              </div>
              <div>
                {companyData ? (
                  <CardTitle className="text-2xl">
                    Manual de Usuario de {companyData.systemName || "la Aplicación"}
                  </CardTitle>
                ) : (
                  <Skeleton className="h-8 w-96" />
                )}
                <CardDescription>
                  Guía completa sobre cómo utilizar las herramientas y funcionalidades del sistema.
                </CardDescription>
              </div>
            </div>
            <div className="relative mt-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Escribe para buscar en la ayuda (ej: 'contraseña', 'importar', 'resetear')..."
                className="w-full pl-10 h-12 text-base"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {helpSections.map((section, index) => (
                <HelpSection
                  key={index}
                  title={section.title}
                  icon={section.icon}
                  content={section.content}
                  searchTerm={searchTerm}
                />
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
