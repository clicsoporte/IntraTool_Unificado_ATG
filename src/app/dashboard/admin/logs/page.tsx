"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clearLogs, getLogs } from "@/modules/core/lib/logger";
import type { LogEntry, DateRange } from "@/modules/core/types";
import { RefreshCw, Trash2, Calendar as CalendarIcon, FilterX, Download, Loader2, Phone, MessageSquare, Truck, Smartphone, Cpu, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useDebounce } from "use-debounce";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type LogTypeFilter = 'operational' | 'apk' | 'system' | 'all';
type LogTypeToDelete = 'operational' | 'apk' | 'system' | 'all';

export default function LogViewerPage() {
  const { isAuthorized, hasPermission } = useAuthorization(['admin:logs:read']);
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const { setTitle } = usePageTitle();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter state
  const [logTypeFilter, setLogTypeFilter] = useState<LogTypeFilter>('apk');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);

  // Clear logs dialog state
  const [isClearLogDialogOpen, setClearLogDialogOpen] = useState(false);
  const [logTypeToDelete, setLogTypeToDelete] = useState<LogTypeToDelete>('apk');
  const [deleteAllTime, setDeleteAllTime] = useState(false);

  const fetchLogs = async (isRefreshAction = false) => {
    if (isRefreshAction) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      let fromStr = '';
      let toStr = '';

      if (dateFilter?.from) {
        fromStr = format(dateFilter.from, 'yyyy-MM-dd');
      }
      if (dateFilter?.to) {
        toStr = format(dateFilter.to, 'yyyy-MM-dd');
      }

      if (logTypeFilter === 'apk') {
        // Fetch driver APK logs specifically
        const queryParams = new URLSearchParams({
          category: 'apk',
          q: debouncedSearchTerm,
        });
        if (fromStr) queryParams.append('from', fromStr);
        if (toStr) queryParams.append('to', toStr);

        const res = await fetch(`/api/fleet/logs?${queryParams.toString()}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
        } else {
          setLogs([]);
        }
      } else if (logTypeFilter === 'operational') {
        const fetchedLogs = await getLogs({
          type: 'operational',
          search: debouncedSearchTerm,
          dateRange: dateFilter
        });
        setLogs(fetchedLogs);
      } else if (logTypeFilter === 'system') {
        const fetchedLogs = await getLogs({
          type: 'system',
          search: debouncedSearchTerm,
          dateRange: dateFilter
        });
        setLogs(fetchedLogs);
      } else {
        // Combine system, operational, and APK logs
        const queryParams = new URLSearchParams({
          category: 'todos',
          q: debouncedSearchTerm,
        });
        if (fromStr) queryParams.append('from', fromStr);
        if (toStr) queryParams.append('to', toStr);

        const [sysLogs, driverRes] = await Promise.all([
          getLogs({ type: 'all', search: debouncedSearchTerm, dateRange: dateFilter }),
          fetch(`/api/fleet/logs?${queryParams.toString()}`).then(r => r.json()).catch(() => ({ logs: [] }))
        ]);
        const driverLogs = driverRes.logs || [];
        const combined = [...sysLogs, ...driverLogs].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setLogs(combined);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      if (isRefreshAction) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    setTitle("Visor de Eventos");
    if (isAuthorized) {
      fetchLogs(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTitle, isAuthorized, logTypeFilter, debouncedSearchTerm, dateFilter]);

  const handleClearLogs = async () => {
    if (!user) return;
    if (logTypeToDelete === 'apk') {
      await fetch('/api/fleet/logs', { method: 'DELETE' }).catch(() => {});
    } else {
      await clearLogs(user.name, logTypeToDelete as 'operational' | 'system' | 'all', deleteAllTime);
    }
    setClearLogDialogOpen(false);
    await fetchLogs(true);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setDateFilter({ from: new Date(), to: new Date() });
    setLogTypeFilter('apk');
  };

  const handleDownloadLogs = () => {
    const logContent = logs
      .map(log => {
        const driverInfo = log.chofer_nombre ? ` [Chofer: ${log.chofer_nombre} | Tel: ${log.chofer_telefono || 'N/D'}]` : '';
        return `[${log.level || log.type || 'INFO'}] ${format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss', { locale: es })}${driverInfo} - ${log.message}`;
      })
      .join('\n\n' + '-'.repeat(80) + '\n\n');

    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `system-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getBadgeVariant = (level: string) => {
    const lvl = (level || '').toUpperCase();
    if (lvl.includes('ERROR')) return 'destructive';
    if (lvl.includes('WARN')) return 'secondary';
    return 'outline';
  };

  if (isAuthorized === false) {
    return null;
  }

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-full overflow-x-hidden">
      <Card className="w-full overflow-hidden">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Registros del Sistema</CardTitle>
              <CardDescription>
                Eventos, advertencias y errores registrados en la aplicación.
              </CardDescription>
            </div>
            <div className="flex w-full sm:w-auto gap-2">
              <Button
                variant="default"
                onClick={() => window.location.href = '/dashboard/it-tools/ai-auditor'}
                className="flex-1 sm:flex-initial bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                title="Abrir Asistente IA para diagnóstico inteligente de estos logs"
              >
                <Cpu className="h-4 w-4" />
                <span>Auditar con IA</span>
              </Button>
              <Button variant="outline" onClick={() => fetchLogs(true)} className="flex-1 sm:flex-initial" disabled={isRefreshing}>
                {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refrescar
              </Button>
              {hasPermission('admin:logs:clear') && (
                <AlertDialog open={isClearLogDialogOpen} onOpenChange={setClearLogDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="flex-1 sm:flex-initial">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpiar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Limpieza de Registros</AlertDialogTitle>
                      <AlertDialogDescription>
                        Selecciona qué tipo de logs deseas eliminar. Por defecto, se conservarán los últimos 30 días.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4 space-y-6">
                      <RadioGroup defaultValue="apk" value={logTypeToDelete} onValueChange={(value) => setLogTypeToDelete(value as LogTypeToDelete)}>
                        <Label className="font-semibold">Tipo de Logs a Eliminar</Label>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="apk" id="r-apk" />
                          <Label htmlFor="r-apk">APK Nativa (Choferes)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="operational" id="r-op" />
                          <Label htmlFor="r-op">Operativos Web</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="system" id="r-sys" />
                          <Label htmlFor="r-sys">Sistema Web</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="all" id="r-all" />
                          <Label htmlFor="r-all">Todos</Label>
                        </div>
                      </RadioGroup>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="delete-all-time" checked={deleteAllTime} onCheckedChange={(checked) => setDeleteAllTime(checked as boolean)} />
                        <Label htmlFor="delete-all-time" className="font-medium text-destructive">
                          Borrar todos los registros (incluyendo los últimos 30 días)
                        </Label>
                      </div>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearLogs}>Confirmar Limpieza</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4">
            <Tabs value={logTypeFilter} onValueChange={(value) => setLogTypeFilter(value as LogTypeFilter)}>
              <TabsList className="flex flex-wrap md:grid md:grid-cols-4 w-full">
                <TabsTrigger value="apk" className="flex items-center gap-1.5 font-semibold">
                  <Smartphone className="w-4 h-4 text-amber-600" />
                  APK Nativa
                </TabsTrigger>
                <TabsTrigger value="operational" className="flex items-center gap-1.5 font-semibold">
                  <Truck className="w-4 h-4 text-blue-600" />
                  Operativo
                </TabsTrigger>
                <TabsTrigger value="system" className="flex items-center gap-1.5 font-semibold">
                  <Cpu className="w-4 h-4 text-slate-600" />
                  Sistema
                </TabsTrigger>
                <TabsTrigger value="all" className="flex items-center gap-1.5 font-semibold">
                  <ShieldAlert className="w-4 h-4 text-purple-600" />
                  Todos
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-col md:flex-row flex-wrap gap-4">
              <Input 
                placeholder="Buscar por mensaje o detalles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                      "w-full md:w-[300px] justify-start text-left font-normal",
                      !dateFilter && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFilter?.from ? (
                      dateFilter.to ? (
                        <>
                          {format(dateFilter.from, "LLL dd, y", { locale: es })} -{" "}
                          {format(dateFilter.to, "LLL dd, y", { locale: es })}
                        </>
                      ) : (
                        format(dateFilter.from, "LLL dd, y", { locale: es })
                      )
                    ) : (
                      <span>Seleccionar fecha</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateFilter?.from}
                    selected={dateFilter}
                    onSelect={setDateFilter}
                    numberOfMonths={2}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
              <Button variant="outline" onClick={handleDownloadLogs} disabled={logs.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Descargar
              </Button>
              <Button variant="ghost" onClick={handleClearFilters}>
                <FilterX className="mr-2 h-4 w-4" />
                Limpiar Filtros
              </Button>
            </div>
          </div>
          <ScrollArea className="h-[60vh] rounded-lg border w-full overflow-x-auto">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px] md:w-[180px]">Fecha y Hora</TableHead>
                  <TableHead className="w-[85px] md:w-[100px]">Tipo</TableHead>
                  <TableHead className="w-[calc(100%-245px)] md:w-[calc(100%-280px)]">Mensaje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && !isRefreshing ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                      <div className="flex justify-center items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin"/>
                        <span>Cargando registros...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : logs.length > 0 ? (
                  logs.map((log, idx) => {
                    const isDriver = log.chofer_nombre || log.chofer_telefono;
                    const phoneClean = (log.chofer_telefono || '').replace(/[^\d+]/g, '');

                    return (
                      <TableRow key={log.id || idx}>
                        <TableCell className="font-medium text-xs whitespace-nowrap align-top">
                          {log.timestamp ? format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: es }) : 'N/A'}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={getBadgeVariant(log.level || log.type)} className="text-[10px] px-1.5 py-0.5">{log.level || log.type || 'INFO'}</Badge>
                        </TableCell>
                        <TableCell className="align-top break-words max-w-full overflow-hidden">
                          {isDriver && (
                            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 flex-wrap">
                              <span className="flex items-center gap-1 text-amber-600 font-bold">
                                <Truck className="w-3.5 h-3.5" />
                                {log.chofer_nombre}
                              </span>
                              {log.ruta_nombre && <span>| Ruta: {log.ruta_nombre}</span>}
                              {log.chofer_telefono && (
                                <div className="inline-flex items-center gap-1.5 ml-2">
                                  <a href={`tel:${phoneClean}`} className="flex items-center gap-0.5 text-blue-600 hover:underline">
                                    <Phone className="w-3 h-3" />
                                    <span>{log.chofer_telefono}</span>
                                  </a>
                                  <a 
                                    href={`https://wa.me/${phoneClean.replace('+', '')}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="p-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700"
                                    title="Abrir WhatsApp"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="font-medium text-sm break-words whitespace-normal">{log.message}</div>
                          {log.details && (
                            <pre className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded-md max-w-full overflow-x-auto whitespace-pre-wrap break-all">
                              {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                      No hay registros para mostrar con los filtros actuales.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </main>
  );
}
