'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Camera, KeyRound, Loader2, PackageCheck, FileText, ShoppingBag } from 'lucide-react';
import { SignatureCanvas } from './SignatureCanvas';
import { useToast } from '@/modules/core/hooks/use-toast';

interface DeliveryItem {
  codigo: string;
  desc?: string;
  pedida: number;
  entregada: number;
  faltante: number;
}

interface DeliveryProcessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: number;
    documento_numero: string;
    tipo_documento: 'pedido' | 'factura' | 'recoger';
    cliente_nombre: string;
    cliente_id?: string;
    comentario?: string;
  } | null;
  onFetchLines?: (docNum: string, tipo: 'factura' | 'pedido') => Promise<DeliveryItem[]>;
  onSubmit: (data: {
    id: number;
    estado: 'completo' | 'incompleto' | 'rechazado';
    comentario?: string;
    fotoEvidencia?: string | null;
    fotoFactura?: string | null;
    firmaCliente?: string | null;
    nombreRecibe?: string | null;
    releaseCodeId?: number;
    lines?: DeliveryItem[];
  }) => Promise<boolean>;
}

export function DeliveryProcessModal({
  open,
  onOpenChange,
  document,
  onFetchLines,
  onSubmit
}: DeliveryProcessModalProps) {
  const { toast } = useToast();
  const [estado, setEstado] = useState<'completo' | 'incompleto' | 'rechazado'>('completo');
  const [comentario, setComentario] = useState('');
  const [nombreRecibe, setNombreRecibe] = useState('');
  const [fotoEvidencia, setFotoEvidencia] = useState<string | null>(null);
  const [fotoFactura, setFotoFactura] = useState<string | null>(null);
  const [firmaCliente, setFirmaCliente] = useState<string | null>(null);
  const [pinCode, setPinCode] = useState('');
  const [lines, setLines] = useState<DeliveryItem[]>([]);
  const [lineSearchQuery, setLineSearchQuery] = useState('');

  const filteredLines = lines.filter((l: DeliveryItem) => {
    if (!lineSearchQuery.trim()) return true;
    const q = lineSearchQuery.toLowerCase().trim();
    return (l.codigo || '').toLowerCase().includes(q) || (l.desc || '').toLowerCase().includes(q);
  });
  const [loadingLines, setLoadingLines] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isRecoger = document?.tipo_documento === 'recoger';

  useEffect(() => {
    if (open && document) {
      setEstado('completo');
      setComentario('');
      setNombreRecibe('');
      setFotoEvidencia(null);
      setFotoFactura(null);
      setFirmaCliente(null);
      setPinCode('');

      if (!isRecoger && onFetchLines) {
        setLoadingLines(true);
        const cleanNum = document.documento_numero.replace('-PARTIAL', '').replace('-RETRY', '');
        onFetchLines(cleanNum, document.tipo_documento as 'factura' | 'pedido')
          .then((fetchedLines: any) => {
            if (fetchedLines && fetchedLines.length > 0) {
              setLines(fetchedLines.map((l: any) => ({ 
                codigo: l.articulo || l.codigo, 
                desc: l.descripcion || l.desc, 
                pedida: l.cantidad ?? l.pedida, 
                entregada: l.cantidad ?? l.pedida, 
                faltante: 0 
              })));
            } else {
              setLines([]);
            }
          })
          .catch(() => setLines([]))
          .finally(() => setLoadingLines(false));
      } else {
        setLines([]);
      }
    } else {
      setLines([]);
      setComentario('');
      setNombreRecibe('');
      setFotoEvidencia(null);
      setFotoFactura(null);
      setFirmaCliente(null);
      setPinCode('');
    }
  }, [open, document, isRecoger, onFetchLines]);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>, target: 'evidencia' | 'factura') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (target === 'evidencia') setFotoEvidencia(dataUrl);
      else setFotoFactura(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleLineQtyChange = (index: number, deliveredQty: number) => {
    setLines((prev) => {
      const copy = [...prev];
      const target = copy[index];
      const pedida = target.pedida;
      const safeDelivered = Math.max(0, Math.min(pedida, deliveredQty));
      const faltante = pedida - safeDelivered;
      copy[index] = { ...target, entregada: safeDelivered, faltante };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!document || submitting) return;

    if (estado === 'rechazado' && !comentario.trim()) {
      toast({ title: 'Motivo Requerido', description: 'Debes indicar la razón del rechazo.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const ok = await onSubmit({
        id: document.id,
        estado,
        comentario: comentario.trim() || undefined,
        fotoEvidencia,
        fotoFactura,
        firmaCliente,
        nombreRecibe: nombreRecibe.trim() || undefined,
        lines: estado === 'incompleto' ? lines : undefined
      });

      if (ok) {
        toast({ title: 'Reporte Guardado', description: `Se ha registrado el resultado de ${document.documento_numero}.` });
        setComentario('');
        setNombreRecibe('');
        setFotoEvidencia(null);
        setFotoFactura(null);
        setFirmaCliente(null);
        setPinCode('');
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'No se pudo guardar la entrega.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-4 sm:p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
            {isRecoger ? <ShoppingBag className="w-5 h-5 text-indigo-600" /> : <PackageCheck className="w-5 h-5 text-emerald-600" />}
            <span>{isRecoger ? 'Confirmar Recolecta' : 'Procesar Entrega'}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 flex items-center justify-between pt-1">
            <span>Doc: <strong className="font-mono text-slate-800">#{document.documento_numero}</strong></span>
            <span className="truncate max-w-[200px]">Cliente: <strong className="text-slate-800">{document.cliente_nombre}</strong></span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Status Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Resultado de la Operación *</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={estado === 'completo' ? 'default' : 'outline'}
                onClick={() => setEstado('completo')}
                className={`h-12 flex-col gap-1 text-xs font-bold rounded-xl transition-all ${
                  estado === 'completo' ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md' : 'text-slate-700 border-slate-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isRecoger ? 'Recolectado' : 'Completo'}</span>
              </Button>

              {!isRecoger && (
                <Button
                  type="button"
                  variant={estado === 'incompleto' ? 'default' : 'outline'}
                  onClick={() => setEstado('incompleto')}
                  className={`h-12 flex-col gap-1 text-xs font-bold rounded-xl transition-all ${
                    estado === 'incompleto' ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md' : 'text-slate-700 border-slate-200'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Incidencias</span>
                </Button>
              )}

              <Button
                type="button"
                variant={estado === 'rechazado' ? 'default' : 'outline'}
                onClick={() => setEstado('rechazado')}
                className={`h-12 flex-col gap-1 text-xs font-bold rounded-xl transition-all ${
                  estado === 'rechazado' ? 'bg-red-600 hover:bg-red-700 text-white shadow-md' : 'text-slate-700 border-slate-200'
                } ${isRecoger ? 'col-span-2' : ''}`}
              >
                <XCircle className="w-4 h-4" />
                <span>Rechazado</span>
              </Button>
            </div>
          </div>

          {/* Detailed Item List for All Statuses */}
          {!isRecoger && (
            <div className="space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span>📦</span> Detalle de Artículos ({lines.length} ítems)
                </span>
                {loadingLines && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />}
              </div>

              {lines.length > 0 && (
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="🔍 Buscar por código o descripción..."
                    value={lineSearchQuery}
                    onChange={(e) => setLineSearchQuery(e.target.value)}
                    className="h-8 text-xs bg-white rounded-lg pl-3 pr-8 shadow-xs border-indigo-200 focus:border-indigo-500"
                  />
                  {lineSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setLineSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {lineSearchQuery.trim() && (
                <div className="text-[10px] text-slate-500 font-semibold px-0.5">
                  Mostrando {filteredLines.length} de {lines.length} productos
                </div>
              )}

              {filteredLines.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {filteredLines.map((line: DeliveryItem, idx: number) => {
                    const originalIdx = lines.findIndex((l: DeliveryItem) => l.codigo === line.codigo);
                    const realIdx = originalIdx >= 0 ? originalIdx : idx;
                    const deliveredQty = estado === 'completo' ? line.pedida : estado === 'rechazado' ? 0 : line.entregada;
                    const missingQty = estado === 'completo' ? 0 : estado === 'rechazado' ? line.pedida : line.faltante;

                    return (
                      <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold">
                          <span className="font-mono text-indigo-700">{line.codigo}</span>
                          <span className="text-slate-500 text-[11px]">Pedida: {line.pedida}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 truncate">{line.desc}</p>
                        
                        <div className="flex items-center justify-between pt-1 gap-2">
                          <div className="flex items-center gap-1.5">
                            <Label className="text-[11px] text-slate-500">Entregada:</Label>
                            {estado === 'incompleto' ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max={line.pedida}
                                  value={line.entregada}
                                  onChange={(e) => handleLineQtyChange(realIdx, parseInt(e.target.value) || 0)}
                                  className="w-16 h-7 text-xs font-bold text-center"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleLineQtyChange(realIdx, line.entregada === 0 ? line.pedida : 0)}
                                  className={`h-7 px-1.5 text-[10px] font-bold ${
                                    line.entregada === 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-red-50 text-red-700 border-red-200'
                                  }`}
                                >
                                  {line.entregada === 0 ? '✓ 100%' : '🚫 0'}
                                </Button>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-bold text-slate-800 border">
                                {deliveredQty}
                              </span>
                            )}
                          </div>
                          <Badge 
                            variant={estado === 'rechazado' ? 'destructive' : estado === 'completo' ? 'outline' : (missingQty > 0 ? 'destructive' : 'outline')} 
                            className={`text-[10px] ${estado === 'completo' ? 'border-emerald-600 text-emerald-700 bg-emerald-50' : ''}`}
                          >
                            {estado === 'rechazado' ? 'RECHAZADO' : estado === 'completo' ? 'ENTREGADO' : `Faltante: ${missingQty}`}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic text-center py-2">
                  {loadingLines ? 'Cargando lista de productos del documento...' : 'Sin artículos específicos en ERP. Puedes proceder con la boleta.'}
                </p>
              )}
            </div>
          )}

          {/* Recipient or Rejector Name */}
          <div className="pt-1 space-y-2">
            <div className="space-y-1">
              <Label className={`text-xs font-bold ${estado === 'rechazado' ? 'text-rose-600' : 'text-slate-700'}`}>
                {estado === 'rechazado' 
                  ? 'Nombre de quien rechaza la mercancía (Obligatorio) *' 
                  : (document?.tipo_documento === 'recoger' ? 'Nombre de quien entrega el producto (Legible)' : 'Nombre de quien recibe (Legible)')}
              </Label>
              <Input
                type="text"
                placeholder={estado === 'rechazado' ? "Ej. Juan Pérez (Motivo de rechazo en notas)" : "Ej. Juan Pérez (Bodeguero)"}
                value={nombreRecibe}
                onChange={(e) => setNombreRecibe(e.target.value)}
                className={`text-xs h-9 rounded-xl font-medium ${estado === 'rechazado' ? 'border-rose-300 focus:border-rose-500' : ''}`}
              />
            </div>
            {/* Customer Signature Canvas (Only for delivered/complete/incomplete) */}
            {estado !== 'rechazado' && (
              <SignatureCanvas onSave={(dataUrl) => setFirmaCliente(dataUrl)} height={140} />
            )}
          </div>

          {/* Photo Captures */}
          <div className="space-y-2 pt-1">
            <Label className="text-xs font-bold text-slate-700">Evidencias Fotográficas (Celular)</Label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/50 rounded-xl cursor-pointer transition-colors text-center">
                <Camera className="w-4 h-4 text-indigo-600 mb-1" />
                <span className="text-[11px] font-semibold text-slate-700">Foto Evidencia</span>
                <span className="text-[9px] text-slate-400">Tocar para tomar</span>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoCapture(e, 'evidencia')} className="hidden" />
                {fotoEvidencia && <Badge className="mt-1 bg-emerald-600 text-[9px]">Cargada</Badge>}
              </label>

              <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/50 rounded-xl cursor-pointer transition-colors text-center">
                <FileText className="w-4 h-4 text-indigo-600 mb-1" />
                <span className="text-[11px] font-semibold text-slate-700">Foto Factura</span>
                <span className="text-[9px] text-slate-400">Tocar para tomar</span>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoCapture(e, 'factura')} className="hidden" />
                {fotoFactura && <Badge className="mt-1 bg-emerald-600 text-[9px]">Cargada</Badge>}
              </label>
            </div>
          </div>

          {/* Comments / Observaciones */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
              Observaciones / Comentarios de la Calle {estado === 'rechazado' && '*'}
            </Label>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder={estado === 'rechazado' ? 'Motivo del rechazo obligatoriamente...' : 'Notas adicionales sobre la entrega...'}
              rows={2}
              className="text-xs resize-none"
              required={estado === 'rechazado'}
            />
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="text-xs font-semibold h-10">
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 gap-1.5 shadow-sm">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>Guardar Reporte</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
