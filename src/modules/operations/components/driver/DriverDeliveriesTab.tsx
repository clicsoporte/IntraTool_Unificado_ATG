'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Truck, Navigation, CheckCircle2, AlertTriangle, Phone, MessageSquare, 
  MapPin, PlusCircle, Wrench, Play, Flag, ArrowRightLeft, ShoppingBag, 
  FileText, Clock, RefreshCw, Loader2, PackageCheck, Printer, RotateCcw, Send, Download
} from 'lucide-react';
import { getBoletaPreviewHtml, getBoletaThermalPrintHtml, sendBoletaManualEmail, getDeliverySettings } from '@/modules/operations/lib/actions';
import { revertDriverDeliveryAction } from '@/modules/operations/lib/driver-actions';
import { DeliveryProcessModal } from './DeliveryProcessModal';
import { ReportBreakdownModal } from './ReportBreakdownModal';
import { useToast } from '@/modules/core/hooks/use-toast';

interface DriverDeliveriesTabProps {
  activeAssignmentData: {
    assignment: any;
    pendingDocs: any[];
    completedDocs: any[];
  } | null;
  availableRoutes: any[];
  availableVehicles: any[];
  driverName: string;
  onStartRoute: (rutaId: number, vehiculoId: number, lat?: number, lng?: number) => Promise<any>;
  onDepartRoute: (assignmentId: number, lat?: number, lng?: number) => Promise<any>;
  onAutoloadInvoice: (assignmentId: number, docNum: string) => Promise<any>;
  onProcessDelivery: (data: any) => Promise<any>;
  onReportBreakdown: (data: any) => Promise<any>;
  onFinishRoute: (assignmentId: number, type: 'return' | 'completion', lat?: number, lng?: number) => Promise<any>;
  onFetchLines: (docNum: string, tipo: 'factura' | 'pedido') => Promise<any[]>;
  onRefresh: () => void;
}

export function DriverDeliveriesTab({
  activeAssignmentData,
  availableRoutes,
  availableVehicles,
  driverName,
  onStartRoute,
  onDepartRoute,
  onAutoloadInvoice,
  onProcessDelivery,
  onReportBreakdown,
  onFinishRoute,
  onFetchLines,
  onRefresh
}: DriverDeliveriesTabProps) {
  const { toast } = useToast();
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [autoloadDialogOpen, setAutoloadDialogOpen] = useState(false);
  const [startRouteDialogOpen, setStartRouteDialogOpen] = useState(false);

  const [driverSettings, setDriverSettings] = useState<any>({
    driver_boleta_pdf_enabled: 'true',
    driver_boleta_email_enabled: 'true',
    driver_boleta_print_enabled: 'true',
    driver_boleta_paper_size: '80mm'
  });
  const [selectedBoletaDoc, setSelectedBoletaDoc] = useState<any>(null);
  const [boletaHtml, setBoletaHtml] = useState<string>('');
  const [loadingBoletaId, setLoadingBoletaId] = useState<number | null>(null);
  const [thermalHtml, setThermalHtml] = useState<string>('');
  const [thermalDialogOpen, setThermalDialogOpen] = useState<boolean>(false);
  const [emailModalDoc, setEmailModalDoc] = useState<any>(null);
  const [targetEmail, setTargetEmail] = useState<string>('');
  const [sendingBoletaEmail, setSendingBoletaEmail] = useState<boolean>(false);
  const [revertConfirmDocId, setRevertConfirmDocId] = useState<number | null>(null);

  React.useEffect(() => {
    async function loadSettings() {
      try {
        const s = await getDeliverySettings();
        if (s) setDriverSettings(s);
      } catch (e) {}
    }
    loadSettings();

    // Reenviar mensajes de impresión desde el iframe hacia la app nativa ClicPrinter
    const handleFrameMessage = (event: MessageEvent) => {
      try {
        if (!event.data) return;
        const dataStr = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
        if (dataStr.includes('PRINT_RECEIPT')) {
          const win = window as any;
          const bridge = win.ClicPrinter || win.UpeoRetailPrinter;
          if (bridge && typeof bridge.postMessage === 'function') {
            bridge.postMessage(dataStr);
          }
        }
      } catch (_) {}
    };

    window.addEventListener('message', handleFrameMessage);
    return () => window.removeEventListener('message', handleFrameMessage);
  }, []);

  const proceedRevertDriverDoc = async (docId: number) => {
    setActionLoading(true);
    try {
      const res = await revertDriverDeliveryAction(docId);
      if (res.success) {
        toast({ title: 'Entrega Revertida', description: 'El documento volvió a estar pendiente por entregar.' });
        onRefresh();
      } else {
        toast({ title: 'No se pudo revertir', description: res.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
      setRevertConfirmDocId(null);
    }
  };

  const handlePrintThermalReceipt = async (docId: number) => {
    try {
      const res = await getBoletaThermalPrintHtml(docId);
      if (res.success && res.html) {
        setThermalHtml(res.html);
        setThermalDialogOpen(true);
      } else {
        toast({ title: 'Error', description: res.error || 'No se pudo generar el formato imprimible.', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleSendEmailSubmit = async () => {
    if (!emailModalDoc || !targetEmail.trim()) return;
    setSendingBoletaEmail(true);
    try {
      const res = await sendBoletaManualEmail(emailModalDoc.id, targetEmail.trim());
      if (res.success) {
        toast({ title: 'Correo Enviado', description: `Se envió la boleta a ${targetEmail.trim()}` });
        setEmailModalDoc(null);
        setTargetEmail('');
      } else {
        toast({ title: 'Error de Envío', description: res.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSendingBoletaEmail(false);
    }
  };

  // Form states
  const [selectedRutaId, setSelectedRutaId] = useState<string>('');
  const [selectedVehiculoId, setSelectedVehiculoId] = useState<string>('');
  const [autoloadDocNum, setAutoloadDocNum] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'deliveries' | 'collects'>('all');

  const assignment = activeAssignmentData?.assignment;
  const pendingDocs = activeAssignmentData?.pendingDocs || [];
  const completedDocs = activeAssignmentData?.completedDocs || [];

  // Helper for capturing mobile browser GPS
  const getBrowserCoords = (): Promise<{ lat?: number; lng?: number }> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve({}),
          { timeout: 5000, enableHighAccuracy: true }
        );
      } else {
        resolve({});
      }
    });
  };

  const handleStartRouteSubmit = async () => {
    if (!selectedRutaId || !selectedVehiculoId) {
      toast({ title: 'Requerido', description: 'Selecciona una ruta y un vehículo.', variant: 'destructive' });
      return;
    }

    setActionLoading(true);
    try {
      const coords = await getBrowserCoords();
      const res = await onStartRoute(parseInt(selectedRutaId), parseInt(selectedVehiculoId), coords.lat, coords.lng);
      if (res.success) {
        toast({ title: 'Ruta Iniciada', description: 'Se ha creado tu asignación de ruta para hoy.' });
        setStartRouteDialogOpen(false);
        onRefresh();
      } else {
        toast({ title: 'Error', description: res.error || 'No se pudo iniciar la ruta.', variant: 'destructive' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDepartRoute = async () => {
    if (!assignment) return;
    setActionLoading(true);
    try {
      const coords = await getBrowserCoords();
      const res = await onDepartRoute(assignment.id, coords.lat, coords.lng);
      if (res.success) {
        toast({ title: 'Salida Registrada', description: 'Se ha registrado la hora y ubicación de salida a ruta.' });
        onRefresh();
      } else {
        toast({ title: 'Error', description: res.error || 'No se pudo registrar la salida.', variant: 'destructive' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoloadSubmit = async () => {
    if (!assignment || !autoloadDocNum.trim()) return;
    setActionLoading(true);
    try {
      const res = await onAutoloadInvoice(assignment.id, autoloadDocNum.trim());
      if (res.success) {
        toast({ title: 'Documento Cargado', description: res.message });
        setAutoloadDocNum('');
        setAutoloadDialogOpen(false);
        onRefresh();
      } else {
        toast({ title: 'Error', description: res.error || 'No se pudo cargar el documento.', variant: 'destructive' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinishRoute = async (type: 'return' | 'completion') => {
    if (!assignment) return;
    setActionLoading(true);
    try {
      const coords = await getBrowserCoords();
      const res = await onFinishRoute(assignment.id, type, coords.lat, coords.lng);
      if (res.success) {
        toast({
          title: type === 'return' ? 'Retorno Registrado' : 'Ruta Finalizada',
          description: type === 'return' ? 'Se ha registrado el inicio del viaje de regreso.' : 'Se ha completado la ruta de hoy.'
        });
        onRefresh();
      } else {
        toast({ title: 'Error', description: res.error || 'No se pudo actualizar el estado de la ruta.', variant: 'destructive' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenProcessModal = (doc: any) => {
    setSelectedDoc(doc);
    setDeliveryModalOpen(true);
  };

  // Filter docs
  const filteredPending = pendingDocs.filter((d) => {
    if (filterType === 'deliveries') return d.tipo_documento !== 'recoger';
    if (filterType === 'collects') return d.tipo_documento === 'recoger';
    return true;
  });

  return (
    <div className="space-y-4 pb-12">
      {/* Header Info Banner */}
      <Card className="bg-slate-900 text-white border-0 shadow-lg rounded-2xl overflow-hidden">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-inner">
                🚚
              </div>
              <div>
                <h2 className="font-bold text-base leading-tight">{driverName}</h2>
                <p className="text-xs text-slate-300">Chofer de Transporte & Entregas</p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              className="text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* Active Route Status Card */}
          {assignment ? (
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5" />
                  {assignment.ruta_nombre}
                </span>
                <Badge variant="outline" className="border-indigo-400 text-indigo-300 font-mono text-[10px]">
                  {assignment.vehiculo_placa}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-slate-700">
                <span>Pendientes: <strong>{pendingDocs.length}</strong></span>
                <span>Completados: <strong>{completedDocs.length}</strong></span>
                {assignment.fecha_salida && <span className="text-emerald-400 font-semibold">En Ruta 🚀</span>}
              </div>
            </div>
          ) : (
            <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-800/60 text-xs text-amber-200 flex items-center justify-between">
              <span>No tienes una ruta activa iniciada para hoy.</span>
              <Button
                size="sm"
                onClick={() => setStartRouteDialogOpen(true)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-8 gap-1 rounded-lg"
              >
                <Play className="w-3.5 h-3.5" /> Iniciar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Driver Controls Bar */}
      {assignment && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {!assignment.fecha_salida ? (
              <Button
                onClick={handleDepartRoute}
                disabled={actionLoading}
                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-transform text-white font-bold text-xs sm:text-sm h-12 rounded-xl shadow-sm gap-1.5"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Salir a Ruta</span>
              </Button>
            ) : !assignment.fecha_inicio_retorno ? (
              <Button
                onClick={() => handleFinishRoute('return')}
                disabled={actionLoading}
                className="bg-amber-600 hover:bg-amber-700 active:scale-95 transition-transform text-white font-bold text-xs sm:text-sm h-12 rounded-xl shadow-sm gap-1.5"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                <span>Regresar a Empresa</span>
              </Button>
            ) : (
              <Button
                onClick={() => handleFinishRoute('completion')}
                disabled={actionLoading}
                className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-transform text-white font-bold text-xs sm:text-sm h-12 rounded-xl shadow-sm gap-1.5"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                <span>Llegada a Empresa</span>
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setAutoloadDialogOpen(true)}
              className="border-slate-300 font-bold text-xs sm:text-sm h-12 rounded-xl gap-1.5 text-slate-700 hover:bg-slate-50 active:scale-95 transition-transform"
            >
              <PlusCircle className="w-4 h-4 text-indigo-600" />
              <span>Auto-Cargar</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => setBreakdownModalOpen(true)}
              className="border-red-200 bg-red-50/50 hover:bg-red-50 text-red-700 font-bold text-xs sm:text-sm h-12 rounded-xl gap-1.5 col-span-2 sm:col-span-2 active:scale-95 transition-transform"
            >
              <Wrench className="w-4 h-4 text-red-600" />
              <span>Reportar Avería</span>
            </Button>
          </div>

          {/* Step-by-Step Guidance Banner */}
          {!assignment.fecha_salida ? (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-blue-800">
                <span>1️⃣ Paso 1: Inicio de Viaje</span>
              </div>
              <p className="text-[11px] text-blue-700">
                Tu ruta está asignada. Cuando vayas a salir en el camión, presiona el botón <strong>&quot;🚀 Salir a Ruta&quot;</strong>. Puedes presionar <strong>&quot;📥 Auto-Cargar&quot;</strong> para agregar facturas a tu ruta.
              </p>
            </div>
          ) : !assignment.fecha_inicio_retorno && pendingDocs.length > 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                <span>2️⃣ Paso 2: Entregas en Ruta</span>
              </div>
              <p className="text-[11px] text-emerald-700">
                🟢 Ruta en viaje activo. Selecciona cualquier factura abajo para reportar la Entrega (Completo, Incidencias o Rechazado con Firma Digital del cliente).
              </p>
            </div>
          ) : !assignment.fecha_inicio_retorno && pendingDocs.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <span>3️⃣ Paso 3: Retorno a Empresa</span>
              </div>
              <p className="text-[11px] text-amber-700">
                🎉 ¡Todas las entregas han sido procesadas! Presiona el botón <strong>&quot;🔄 Regresar a Empresa&quot;</strong> para iniciar el viaje de retorno.
              </p>
            </div>
          ) : (
            <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl text-xs text-indigo-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-indigo-800">
                <span>4️⃣ Paso 4: Llegada a Empresa</span>
              </div>
              <p className="text-[11px] text-indigo-700">
                🏢 De regreso en la empresa. Presiona el botón <strong>&quot;🏁 Registrar Llegada&quot;</strong> para cerrar y archivar la ruta de hoy.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      {assignment && (
        <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl text-xs font-bold text-slate-700">
          <button
            onClick={() => setFilterType('all')}
            className={`flex-1 py-2 rounded-lg transition-all ${filterType === 'all' ? 'bg-white shadow text-indigo-700' : 'hover:bg-slate-300/50'}`}
          >
            Todos ({pendingDocs.length})
          </button>
          <button
            onClick={() => setFilterType('deliveries')}
            className={`flex-1 py-2 rounded-lg transition-all ${filterType === 'deliveries' ? 'bg-white shadow text-indigo-700' : 'hover:bg-slate-300/50'}`}
          >
            Entregas ({pendingDocs.filter(d => d.tipo_documento !== 'recoger').length})
          </button>
          <button
            onClick={() => setFilterType('collects')}
            className={`flex-1 py-2 rounded-lg transition-all ${filterType === 'collects' ? 'bg-white shadow text-indigo-700' : 'hover:bg-slate-300/50'}`}
          >
            Recolectas ({pendingDocs.filter(d => d.tipo_documento === 'recoger').length})
          </button>
        </div>
      )}

      {/* Document Cards List */}
      {assignment && (
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-slate-800 px-1 flex items-center justify-between">
            <span>Pendientes por Procesar</span>
            <Badge variant="secondary" className="font-mono text-xs">{filteredPending.length}</Badge>
          </h3>

          {filteredPending.length > 0 ? (
            filteredPending.map((doc) => {
              const isCollect = doc.tipo_documento === 'recoger';
              return (
                <Card key={doc.id} className="border-slate-200 hover:border-slate-300 shadow-sm rounded-2xl overflow-hidden transition-all">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={isCollect ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}>
                            {isCollect ? 'Recolecta' : doc.tipo_documento.toUpperCase()}
                          </Badge>
                          <span className="font-mono font-bold text-sm text-slate-900">Doc. ERP: #{doc.documento_numero}</span>
                          {doc.boleta_numero && doc.boleta_numero !== doc.documento_numero && (
                            <Badge variant="secondary" className="font-mono text-[11px] bg-amber-100 text-amber-800 border-amber-300">
                              📄 Boleta: {doc.boleta_numero}
                            </Badge>
                          )}
                          {doc.cliente_id && (
                            <Badge variant="outline" className="font-mono text-[11px] text-indigo-700 bg-indigo-50 border-indigo-200">
                              Código: {doc.cliente_id}
                            </Badge>
                          )}
                        </div>
                        <h4 className="font-bold text-sm text-slate-800 leading-snug">{doc.cliente_nombre}</h4>
                        {doc.lugar_entrega && (
                          <p className="text-xs text-slate-600 flex items-start gap-1 font-medium pt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                            <span><strong>{isCollect ? 'Dirección Proveedor / Retiro:' : 'Destino (EMB):'}</strong> {doc.lugar_entrega}</span>
                          </p>
                        )}

                        {/* Navigation Waze / Maps Buttons if GPS present */}
                        {((doc.latitud_destino || doc.latitud) && (doc.longitud_destino || doc.longitud)) && (
                          <div className="flex gap-2 pt-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              type="button"
                              onClick={() => window.open(`https://waze.com/ul?ll=${doc.latitud_destino || doc.latitud},${doc.longitud_destino || doc.longitud}&navigate=yes`)}
                              className="h-7 px-2 text-[10px] gap-1 text-blue-600 border-blue-200 font-bold"
                            >
                              <Navigation className="w-3 h-3" /> Waze
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              type="button"
                              onClick={() => window.open(`https://maps.google.com/?q=${doc.latitud_destino || doc.latitud},${doc.longitud_destino || doc.longitud}`)}
                              className="h-7 px-2 text-[10px] gap-1 text-emerald-600 border-emerald-200 font-bold"
                            >
                              <MapPin className="w-3 h-3" /> Google Maps
                            </Button>
                          </div>
                        )}

                        {/* Rich Collection Details for Driver */}
                        {isCollect && (() => {
                          let details: any = {};
                          try { details = JSON.parse(doc.comentario || '{}'); } catch (_) {}
                          const cleanProvPhone = (details.proveedor_contacto_telefono || '').replace(/\D/g, '');
                          const cleanSolPhone = (details.solicitante_telefono || details.companero_telefono || '').replace(/\D/g, '');
                          const metodoPagoStr = details.metodo_pago === 'pagar_al_retirar' ? 'Pagar al Retirar' : details.metodo_pago === 'ya_esta_pago' ? 'Ya está Pago' : 'Crédito';

                          return (
                            <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-2 text-xs mt-2">
                              <div className="flex items-center justify-between border-b border-purple-200/60 pb-1.5 font-semibold text-purple-950">
                                <span>OC: <b>{details.orden_compra || 'N/D'}</b> | FAC: <b>{details.factura || 'N/D'}</b></span>
                                <Badge variant="secondary" className="text-[10px] bg-purple-200 text-purple-900 border-0">{metodoPagoStr}</Badge>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                <div>
                                  <span className="text-slate-500 font-semibold block">🏭 Contacto Proveedor:</span>
                                  <span className="font-bold text-slate-800">{details.proveedor_contacto_nombre || 'N/D'} ({details.proveedor_contacto_telefono || 'N/D'})</span>
                                  {cleanProvPhone.length >= 8 && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      type="button"
                                      onClick={() => window.open(`https://wa.me/${cleanProvPhone.length === 8 ? '506' + cleanProvPhone : cleanProvPhone}?text=${encodeURIComponent(`Hola, hablo de logística sobre la recolecta de mercancía #${doc.documento_numero}.`)}`)}
                                      className="h-6 px-1.5 text-[9px] gap-1 font-bold text-emerald-700 border-emerald-300 bg-emerald-50 mt-1"
                                    >
                                      WhatsApp Proveedor
                                    </Button>
                                  )}
                                </div>
                                <div>
                                  <span className="text-slate-500 font-semibold block">🛒 Solicitante (Compras):</span>
                                  <span className="font-bold text-slate-800">{details.en_nombre_de_companero ? details.companero_nombre : details.solicitante_nombre}</span>
                                  {cleanSolPhone.length >= 8 && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      type="button"
                                      onClick={() => window.open(`https://wa.me/${cleanSolPhone.length === 8 ? '506' + cleanSolPhone : cleanSolPhone}?text=${encodeURIComponent(`Hola, consulto sobre los detalles de la recolecta #${doc.documento_numero}.`)}`)}
                                      className="h-6 px-1.5 text-[9px] gap-1 font-bold text-indigo-700 border-indigo-300 bg-indigo-50 mt-1"
                                    >
                                      WhatsApp Compras
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {details.detalle_adicional && (
                                <div className="text-[11px] text-amber-900 bg-amber-100/60 p-2 rounded-lg border border-amber-200/60 font-medium">
                                  📝 <b>Notas Especiales:</b> {details.detalle_adicional}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Product Lines List */}
                        {doc.lines && doc.lines.length > 0 && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1 mt-2">
                            <span className="text-[10px] font-bold uppercase text-slate-500 block">📦 Artículos a Retirar ({doc.lines.length}):</span>
                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {doc.lines.map((l: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-xs font-medium text-slate-800 bg-white p-1.5 rounded border border-slate-100">
                                  <span><b className="font-mono text-purple-700">{l.codigo}:</b> {l.desc}</span>
                                  <Badge className="bg-purple-100 text-purple-900 border-0 font-bold">Cant: {l.pedida}</Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {doc.observaciones && doc.observaciones.trim().length > 4 && doc.observaciones.trim().toUpperCase() !== 'ND' && (
                          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg p-2 flex items-start gap-1.5 font-medium mt-1">
                            <span>📝 <strong>Observaciones ERP:</strong> {doc.observaciones}</span>
                          </p>
                        )}
                      </div>

                      <Badge variant="outline" className="text-[10px] uppercase font-bold border-amber-300 text-amber-700 bg-amber-50">
                        {doc.estado || 'Pendiente'}
                      </Badge>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                      <Button
                        onClick={() => handleOpenProcessModal(doc)}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm h-12 rounded-xl gap-2 shadow-sm active:scale-95 transition-transform"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        <span>{isCollect ? 'Procesar Recolecta' : 'Procesar Entrega'}</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
              <PackageCheck className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs text-slate-500 font-medium">No hay entregas pendientes en esta categoría.</p>
            </div>
          )}
        </div>
      )}

      {/* Completed Documents Summary Section */}
      {completedDocs.length > 0 && (
        <div className="space-y-2 pt-4 border-t">
          <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider px-1">Procesados Hoy ({completedDocs.length})</h4>
          <div className="space-y-2">
            {completedDocs.map((doc) => {
              const isIncompleteOrRejected = doc.estado === 'incompleto' || doc.estado === 'rechazado';
              return (
                <div key={doc.id} className="bg-emerald-50/60 border border-emerald-200/80 p-3 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-emerald-900">#{doc.documento_numero}</span>
                      <p className="text-slate-600 truncate max-w-[200px]">{doc.cliente_nombre}</p>
                      {doc.nombre_recibe && (
                        <p className="text-[10px] text-slate-500 font-semibold">✍️ Recibe: {doc.nombre_recibe}</p>
                      )}
                    </div>
                    <Badge className={`text-[10px] capitalize ${doc.estado === 'completo' ? 'bg-emerald-600 text-white' : doc.estado === 'incompleto' ? 'bg-amber-600 text-white' : 'bg-red-600 text-white'}`}>
                      {doc.estado}
                    </Badge>
                  </div>

                  <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-end flex-wrap gap-1.5">
                    {/* PDF Boleta Button */}
                    {driverSettings.driver_boleta_pdf_enabled !== 'false' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingBoletaId === doc.id}
                        className="h-7 text-[10px] font-bold border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg gap-1"
                        onClick={async () => {
                          setLoadingBoletaId(doc.id);
                          try {
                            setSelectedBoletaDoc(doc);
                            const res = await getBoletaPreviewHtml(doc.id);
                            if (res.success && res.html) setBoletaHtml(res.html);
                          } finally {
                            setLoadingBoletaId(null);
                          }
                        }}
                      >
                        {loadingBoletaId === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                        <span>Boleta PDF</span>
                      </Button>
                    )}

                    {/* Email Button */}
                    {driverSettings.driver_boleta_email_enabled !== 'false' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] font-bold border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg gap-1"
                        onClick={() => {
                          setEmailModalDoc(doc);
                          setTargetEmail('');
                        }}
                      >
                        <Send className="w-3 h-3" />
                        <span>Enviar Email</span>
                      </Button>
                    )}

                    {/* Thermal Print Button */}
                    {driverSettings.driver_boleta_print_enabled !== 'false' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] font-bold border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg gap-1"
                        onClick={() => handlePrintThermalReceipt(doc.id)}
                      >
                        <Printer className="w-3 h-3" />
                        <span>Imprimir ({driverSettings.driver_boleta_paper_size || '80mm'})</span>
                      </Button>
                    )}

                    {/* Revert Button - Available ONLY IF active route */}
                    {assignment?.activa === 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] font-bold border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-lg gap-1"
                        onClick={() => setRevertConfirmDocId(doc.id)}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Revertir</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialog: Start Route */}
      <Dialog open={startRouteDialogOpen} onOpenChange={setStartRouteDialogOpen}>
        <DialogContent className="max-w-sm p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Navigation className="w-5 h-5 text-indigo-600" />
              Iniciar Ruta de Hoy
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Seleccionar Ruta *</label>
              <Select value={selectedRutaId} onValueChange={setSelectedRutaId}>
                <SelectTrigger className="h-10 text-xs font-semibold">
                  <SelectValue placeholder="Seleccionar Ruta" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoutes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Seleccionar Vehículo / Camión *</label>
              <Select value={selectedVehiculoId} onValueChange={setSelectedVehiculoId}>
                <SelectTrigger className="h-10 text-xs font-semibold">
                  <SelectValue placeholder="Seleccionar Placa" />
                </SelectTrigger>
                <SelectContent>
                  {availableVehicles.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.plate} - {v.brand} {v.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setStartRouteDialogOpen(false)} className="text-xs h-10 font-semibold">Cancelar</Button>
            <Button onClick={handleStartRouteSubmit} disabled={actionLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 gap-1">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>Iniciar Asignación</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Autoload Invoice */}
      <Dialog open={autoloadDialogOpen} onOpenChange={setAutoloadDialogOpen}>
        <DialogContent className="max-w-sm p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-indigo-600" />
              Auto-Cargar Facturas a la Ruta
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-bold text-slate-700">Número(s) de Factura o Pedido ERP *</label>
            <Input
              value={autoloadDocNum}
              onChange={(e) => setAutoloadDocNum(e.target.value)}
              placeholder="Ej: 6127, 6128, 6129"
              className="h-10 text-xs font-mono font-bold uppercase"
            />
            <p className="text-[11px] text-slate-500">
              Puedes ingresar varios números separados por comas o espacios (ej: <code>6127, 6128, 6129</code>).
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAutoloadDialogOpen(false)} className="text-xs h-10 font-semibold">Cancelar</Button>
            <Button onClick={handleAutoloadSubmit} disabled={actionLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 gap-1">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
              <span>Cargar Facturas</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals for Process & Breakdown */}
      <DeliveryProcessModal
        open={deliveryModalOpen}
        onOpenChange={setDeliveryModalOpen}
        document={selectedDoc}
        onFetchLines={onFetchLines}
        onSubmit={async (data) => {
          const res = await onProcessDelivery(data);
          if (res.success) {
            onRefresh();
            return true;
          }
          return false;
        }}
      />

      <ReportBreakdownModal
        open={breakdownModalOpen}
        onOpenChange={setBreakdownModalOpen}
        vehicleId={assignment?.vehiculo_id || null}
        vehiclePlate={assignment?.vehiculo_placa || ''}
        driverName={driverName}
        onSubmit={async (data) => {
          const res = await onReportBreakdown(data);
          if (res.success) {
            onRefresh();
            return true;
          }
          return false;
        }}
      />

      {/* Boleta Modal */}
      <Dialog open={!!selectedBoletaDoc} onOpenChange={(open) => !open && setSelectedBoletaDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center justify-between">
              <span>📄 Boleta de Incidencia - #{selectedBoletaDoc?.documento_numero}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-2 border-b pb-3">
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl gap-1.5"
                onClick={() => {
                  if (!boletaHtml) return;
                  // Create a Blob with HTML content and trigger clean download as HTML/PDF document
                  const blob = new Blob([boletaHtml], { type: 'text/html;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Boleta_Incidencia_${selectedBoletaDoc?.documento_numero || 'entrega'}.html`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                📥 Descargar Documento Boleta
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 font-bold text-xs rounded-xl gap-1.5"
                onClick={() => {
                  const iframe = document.querySelector('iframe[title="Boleta HTML"]') as HTMLIFrameElement;
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                  }
                }}
              >
                🖨️ Imprimir Hoja Completa
              </Button>
            </div>

            {boletaHtml ? (
              <div className="border rounded-xl p-2 bg-white overflow-hidden shadow-inner">
                <iframe
                  srcDoc={boletaHtml}
                  className="w-full h-[450px] border-none"
                  title="Boleta HTML"
                />
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Cargando vista previa de la boleta...</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Thermal Print Modal */}
      <Dialog open={thermalDialogOpen} onOpenChange={setThermalDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Printer className="w-4 h-4 text-purple-600" />
              <span>Impresión Térmica / Bluetooth ({driverSettings.driver_boleta_paper_size || '80mm'})</span>
            </DialogTitle>
          </DialogHeader>

          {thermalHtml ? (
            <div className="border rounded-xl p-2 bg-white overflow-hidden shadow-inner">
              <iframe
                srcDoc={thermalHtml}
                className="w-full h-[400px] border-none"
                title="Térmica HTML"
              />
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
              <span>Generando recibo térmico...</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Email Modal */}
      <Dialog open={!!emailModalDoc} onOpenChange={(open) => !open && setEmailModalDoc(null)}>
        <DialogContent className="max-w-sm rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Send className="w-4 h-4 text-indigo-600" />
              <span>Enviar Boleta por Correo</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-slate-600">
              Documento: <strong>#{emailModalDoc?.documento_numero}</strong> ({emailModalDoc?.cliente_nombre})
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Correo Electrónico Destinatario *</label>
              <Input
                type="email"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="h-10 text-xs font-medium"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEmailModalDoc(null)} className="text-xs h-9 font-semibold">Cancelar</Button>
            <Button onClick={handleSendEmailSubmit} disabled={sendingBoletaEmail || !targetEmail.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 gap-1">
              {sendingBoletaEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Enviar Boleta</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revert Confirmation Dialog */}
      <AlertDialog open={revertConfirmDocId !== null} onOpenChange={(open) => !open && setRevertConfirmDocId(null)}>
        <AlertDialogContent className="rounded-2xl border border-muted bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-extrabold flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Confirmar Reversión de Entrega
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-semibold leading-relaxed text-muted-foreground">
              ¿Desea revertir esta entrega para corregir los datos? El documento regresará a su listado de entregas pendientes en esta ruta activa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 justify-end">
            <AlertDialogCancel className="rounded-xl font-bold text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revertConfirmDocId !== null) {
                  proceedRevertDriverDoc(revertConfirmDocId);
                }
              }}
              className="rounded-xl font-black text-xs bg-amber-600 hover:bg-amber-700 text-white"
            >
              Revertir a Pendiente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
