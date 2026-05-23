'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import { Fuel, Save, RefreshCw } from 'lucide-react';
import { updateFleetFuelPriceAction, syncRecopePricesAction } from '@/modules/fleet/lib/actions';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useIsMobile } from '@/modules/core/hooks/use-mobile';

export default function FuelPriceUpdater({ settings, lastFuelPriceUpdate }: { settings: any[], lastFuelPriceUpdate?: string | null }) {
    const isMobile = useIsMobile();
    const [open, setOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [prices, setPrices] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const formatLastUpdate = (isoString: string | null) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            return format(date, "dd/MM/yyyy h:mm a", { locale: es }).replace('AM', 'am').replace('PM', 'pm');
        } catch (e) {
            return '';
        }
    };

    const fuels = settings.filter((s: any) => s.category === 'fuel_type');

    // Inicializar precios cuando se abre el modal/drawer
    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (isOpen) {
            const initial: Record<number, string> = {};
            fuels.forEach(f => initial[f.id] = (f.price || 0).toString());
            setPrices(initial);
        }
    };

    const handleSave = async (id: number) => {
        const newPrice = parseFloat(prices[id]);
        if (isNaN(newPrice) || newPrice < 0) return;
        
        setLoading(true);
        try {
            await updateFleetFuelPriceAction(id, newPrice);
            toast({ title: 'Precio actualizado', description: 'El nuevo precio se ha guardado correctamente en el historial.' });
        } catch (e) {
            toast({ title: 'Error', description: 'No se pudo actualizar el precio.', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const updatedCount = await syncRecopePricesAction();
            if (updatedCount > 0) {
                toast({ title: 'Sincronizado', description: `Se actualizaron o crearon ${updatedCount} tipos de combustible desde RECOPE.` });
                setOpen(false); // Cerramos el modal para que al abrirlo tome los nuevos de la BD
            } else {
                toast({ title: 'Atención', description: 'Todos los precios ya estaban actualizados.' });
            }
        } catch (error: any) {
            toast({ title: 'Error de sincronización', description: error.message || 'No se pudo conectar con RECOPE.', variant: 'destructive' });
        } finally {
            setSyncing(false);
        }
    };

    const renderFormContent = () => (
        <div className="space-y-4 py-2">
            <div className="flex flex-col gap-2.5">
                <p className="text-sm text-slate-500 leading-relaxed">
                    Actualice el precio por litro. Cada vez que guarde, se creará un registro en el historial para generar gráficas de fluctuación a futuro.
                </p>
                {lastFuelPriceUpdate && (
                    <p className="text-xs text-emerald-700 bg-emerald-50/50 px-3 py-1.5 rounded-xl border border-emerald-100 w-fit font-bold select-none">
                        Actualizado por última vez el {formatLastUpdate(lastFuelPriceUpdate)}
                    </p>
                )}
                <Button 
                    variant="secondary" 
                    size="sm" 
                    className="w-fit gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold rounded-lg" 
                    onClick={handleSync} 
                    disabled={syncing}
                >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> 
                    {syncing ? 'Conectando con RECOPE...' : 'Obtener precios desde RECOPE'}
                </Button>
            </div>
            <div className="space-y-3 mt-4">
                {fuels.length === 0 ? (
                    <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-200">
                        No hay tipos de combustible registrados. Presiona el botón de sincronizar para cargarlos desde RECOPE.
                    </p>
                ) : (
                    fuels.map(fuel => {
                        const originalPriceStr = (fuel.price || 0).toString();
                        const currentPriceStr = prices[fuel.id] ?? originalPriceStr;
                        const hasChanged = currentPriceStr !== originalPriceStr && currentPriceStr !== '';
                        
                        return (
                            <div key={fuel.id} className="flex items-center justify-between gap-4 p-3.5 bg-white border border-slate-150 rounded-2xl hover:border-slate-200 transition-colors shadow-sm">
                                <div className="flex-1">
                                    <Label className="font-bold text-sm text-slate-800">{fuel.value}</Label>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <div className="relative w-28 sm:w-32">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">₡</span>
                                        <Input 
                                            type="number" 
                                            step="0.01"
                                            className={`pl-7 h-10 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${hasChanged ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 bg-slate-50/50'}`}
                                            value={currentPriceStr}
                                            onChange={(e) => setPrices({ ...prices, [fuel.id]: e.target.value })}
                                        />
                                    </div>
                                    <Button 
                                        size="icon" 
                                        onClick={() => handleSave(fuel.id)}
                                        disabled={loading || !hasChanged}
                                        variant={hasChanged ? 'default' : 'ghost'}
                                        className={`w-10 h-10 rounded-xl transition-all ${hasChanged ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow' : 'text-slate-400'}`}
                                    >
                                        <Save className="w-5 h-5" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );

    if (!isMounted) {
        return (
            <Button variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 transition-colors">
                <Fuel className="w-4 h-4 mr-2" /> Actualizar Precios de Combustible
            </Button>
        );
    }

    if (isMobile) {
        return (
            <Sheet open={open} onOpenChange={handleOpenChange}>
                <SheetTrigger asChild>
                    <Button 
                        variant="outline" 
                        className="w-full h-12 rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all active:scale-[0.98] flex items-center justify-center font-bold"
                    >
                        <Fuel className="w-4 h-4 mr-2" /> Actualizar Precios de Combustible
                    </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[92vh] rounded-t-[2rem] bg-slate-50 p-0 overflow-hidden flex flex-col">
                    <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-3 shrink-0" />
                    <SheetHeader className="px-6 pb-4 border-b bg-white">
                        <SheetTitle className="flex items-center gap-2 text-emerald-800 text-left font-bold text-lg">
                            <Fuel className="w-5 h-5" />
                            Precios Actuales de Combustible
                        </SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto px-6 py-6 pb-24">
                        {renderFormContent()}
                    </div>
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 transition-colors">
                    <Fuel className="w-4 h-4 mr-2" /> Actualizar Precios de Combustible
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px] max-h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader className="shrink-0 pb-1">
                    <DialogTitle className="flex items-center gap-2 text-emerald-800 font-extrabold text-xl">
                        <Fuel className="w-5 h-5" />
                        Precios Actuales de Combustible
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto pr-1.5 -mr-1.5">
                    {renderFormContent()}
                </div>
            </DialogContent>
        </Dialog>
    );
}
