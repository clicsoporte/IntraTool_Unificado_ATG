'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wrench, Camera, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/modules/core/hooks/use-toast';
import Image from 'next/image';

interface ReportBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: number | null;
  vehiclePlate: string;
  driverName: string;
  onSubmit: (data: { vehicleId: number; type: string; description: string; photo?: string }) => Promise<boolean>;
}

export function ReportBreakdownModal({
  open,
  onOpenChange,
  vehicleId,
  vehiclePlate,
  driverName,
  onSubmit
}: ReportBreakdownModalProps) {
  const { toast } = useToast();
  const [type, setType] = useState('Falla Mecánica General');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setDescription('');
      setPhoto(null);
      setType('Falla Mecánica General');
    }
  }, [open]);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setPhoto(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!vehicleId) {
      toast({ title: 'Error', description: 'No hay un vehículo asignado.', variant: 'destructive' });
      return;
    }
    if (!description.trim()) {
      toast({ title: 'Requerido', description: 'Por favor describe la avería.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const ok = await onSubmit({
        vehicleId,
        type,
        description: description.trim(),
        photo: photo || undefined
      });
      if (ok) {
        toast({ title: 'Avería Reportada', description: 'Se ha registrado la incidencia para el área de flota y taller.' });
        setDescription('');
        setPhoto(null);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'No se pudo enviar el reporte.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4 sm:p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 font-bold text-lg">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Reportar Avería de Vehículo
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Registra fallas o averías mecánicas del camión <strong className="text-slate-800 font-mono">{vehiclePlate || 'N/A'}</strong> para notificación a flota.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Tipo de Avería</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-10 text-xs font-semibold">
                <SelectValue placeholder="Seleccionar Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Falla Mecánica General">Falla Mecánica General</SelectItem>
                <SelectItem value="Sistema de Frenos">Frenos / Sistema de Frenos</SelectItem>
                <SelectItem value="Llantas / Neumáticos">Llantas / Neumáticos / Ponchadora</SelectItem>
                <SelectItem value="Motor / Sobrecalentamiento">Motor / Sobrecalentamiento</SelectItem>
                <SelectItem value="Sistema Eléctrico / Batería">Sistema Eléctrico / Batería</SelectItem>
                <SelectItem value="Fuga de Aceite o Fluidos">Fuga de Aceite o Fluidos</SelectItem>
                <SelectItem value="Carrocería / Accidente Minor">Carrocería / Golpes</SelectItem>
                <SelectItem value="Otros">Otros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Descripción de la Avería *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explica qué ocurrió, ruidos, luces de advertencia encendidas, etc..."
              rows={3}
              className="text-xs resize-none"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Foto de la Avería (Opcional)</span>
              <span className="text-[10px] text-slate-400 font-normal">Usar cámara del celular</span>
            </Label>
            
            <div className="flex items-center gap-3">
              <label className="flex-1 flex items-center justify-center gap-2 h-11 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl cursor-pointer transition-colors text-xs font-bold text-indigo-700">
                <Camera className="w-4 h-4 text-indigo-600" />
                <span>{photo ? 'Cambiar Foto' : 'Tomar Foto'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />
              </label>
              {photo && (
                <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-slate-200">
                  <Image src={photo} alt="Foto Avería" unoptimized fill className="object-cover" />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-xs font-semibold h-10"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-10 gap-1.5 shadow-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              <span>Enviar Reporte</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
