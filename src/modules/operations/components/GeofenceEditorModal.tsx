'use client';

import React, { useState, useEffect } from 'react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { MapPin, Target, Save, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/modules/core/hooks/use-toast';

interface GeofenceEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientName?: string;
    initialLat?: number;
    initialLng?: number;
    initialRadius?: number;
    onSave?: (data: { lat: number; lng: number; radius: number }) => Promise<void> | void;
}

export function GeofenceEditorModal({
    isOpen,
    onClose,
    clientName = 'Cliente',
    initialLat = 10.025541,
    initialLng = -84.273252,
    initialRadius = 200,
    onSave
}: GeofenceEditorModalProps) {
    const { toast } = useToast();
    const [lat, setLat] = useState<number>(initialLat);
    const [lng, setLng] = useState<number>(initialLng);
    const [radius, setRadius] = useState<number>(initialRadius);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setLat(initialLat);
        setLng(initialLng);
        setRadius(initialRadius);
    }, [initialLat, initialLng, initialRadius, isOpen]);

    const handleSave = async () => {
        setSaving(true);
        try {
            if (onSave) {
                await onSave({ lat, lng, radius });
            }
            toast({
                title: 'Geocerca Actualizada',
                description: `Se guardó la geocerca de ${radius}m para ${clientName}.`,
            });
            onClose();
        } catch (e: any) {
            toast({
                title: 'Error al guardar',
                description: e.message || 'No se pudo guardar la geocerca.',
                variant: 'destructive'
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px] rounded-2xl border-none shadow-2xl bg-card">
                <DialogHeader className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-500">
                            <Target className="w-5 h-5" />
                        </div>
                        <DialogTitle className="text-lg font-bold">Editor de Geocerca de Entrega</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs font-medium text-muted-foreground">
                        Configure el radio de detección automática de llegada y presencia para <span className="font-bold text-foreground">{clientName}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                    {/* Visual radius badge */}
                    <div className="flex items-center justify-between p-3.5 bg-muted/20 border border-muted/50 rounded-xl">
                        <div className="space-y-0.5">
                            <span className="text-xs font-bold block">Radio de Detección</span>
                            <span className="text-[10px] text-muted-foreground block">
                                Distancia máxima para marcar llegada automática.
                            </span>
                        </div>
                        <Badge variant="outline" className="text-xs font-mono font-black bg-indigo-500/10 text-indigo-600 border-indigo-500/20 px-2.5 py-1">
                            🎯 {radius} metros
                        </Badge>
                    </div>

                    {/* Slider selector */}
                    <div className="space-y-2 px-1">
                        <div className="flex justify-between text-xs font-bold text-muted-foreground">
                            <span>50m</span>
                            <span>200m (Estándar)</span>
                            <span>1000m (Amplio)</span>
                        </div>
                        <Slider
                            value={[radius]}
                            min={50}
                            max={1000}
                            step={25}
                            onValueChange={(val) => setRadius(val[0])}
                            className="py-2"
                        />
                    </div>

                    {/* Coordenadas */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                Latitud
                            </Label>
                            <Input
                                type="number"
                                step="any"
                                value={lat}
                                onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                                className="h-9 font-mono text-xs font-bold rounded-xl"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                Longitud
                            </Label>
                            <Input
                                type="number"
                                step="any"
                                value={lng}
                                onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                                className="h-9 font-mono text-xs font-bold rounded-xl"
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-xl gap-2 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 dark:shadow-none"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Guardando...' : 'Guardar Geocerca'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
