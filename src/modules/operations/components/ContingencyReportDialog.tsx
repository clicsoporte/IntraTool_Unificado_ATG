'use client';

import React from 'react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
    ShieldAlert, 
    CheckCircle, 
    AlertTriangle, 
    XCircle, 
    RefreshCw, 
    Key, 
    Check 
} from 'lucide-react';
import { useContingencyForm } from '@/modules/operations/hooks/useContingencyForm';

interface ContingencyReportDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    selectedDoc: any | null;
    settings: {
        delivery_mode: 'sencillo' | 'avanzado';
        release_codes_enabled: string;
    };
    onConfirm: (data: {
        estado: 'completo' | 'incompleto' | 'rechazado';
        comentario: string;
        lines?: { codigo: string; desc?: string; pedida: number; entregada: number; faltante: number }[];
    }) => Promise<boolean>;
}

export function ContingencyReportDialog({
    isOpen,
    onOpenChange,
    selectedDoc,
    settings,
    onConfirm
}: ContingencyReportDialogProps) {
    const {
        modalLoading,
        submitLoading,
        modalLines,
        lineQuantities,
        manualState,
        setManualState,
        manualComment,
        setManualComment,
        releaseCode,
        setReleaseCode,
        generatedCode,
        generatingCode,
        handleQtyChange,
        handleGenerateCode,
        handleSubmit
    } = useContingencyForm({
        isOpen,
        selectedDoc,
        settings,
        onConfirm,
        onOpenChange
    });

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl rounded-2xl bg-card">
                <DialogHeader>
                    <DialogTitle className="text-lg font-extrabold flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-amber-500" />
                        Registrar Reporte Manual Contingencia
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Utilice este formulario únicamente si el chofer no tiene señal, celular descargado o para corregir errores.
                    </DialogDescription>
                </DialogHeader>

                {selectedDoc && (
                    <div className="space-y-4 pt-2">
                        {/* Doc short overview */}
                        <div className="grid grid-cols-2 gap-4 p-3 bg-muted/20 border border-muted/50 rounded-xl">
                            <div>
                                <span className="text-[10px] font-extrabold text-muted-foreground uppercase">Documento</span>
                                <p className="text-xs font-black font-mono">{selectedDoc.documento_numero} ({selectedDoc.tipo_documento})</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-extrabold text-muted-foreground uppercase">Cliente</span>
                                <p className="text-xs font-bold truncate">{selectedDoc.cliente_nombre}</p>
                            </div>
                        </div>

                        {/* Mode validation display */}
                        {settings.delivery_mode === 'sencillo' ? (
                            /* Sencillo Mode Inputs */
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                        {selectedDoc?.tipo_documento === 'recoger' ? 'Estado de Recolecta' : 'Estado de Entrega'}
                                    </Label>
                                    <RadioGroup 
                                        value={manualState} 
                                        onValueChange={(val: any) => setManualState(val)}
                                        className="grid grid-cols-3 gap-3"
                                    >
                                        <div>
                                            <RadioGroupItem value="completo" id="opt-completo" className="peer sr-only" />
                                            <Label 
                                                htmlFor="opt-completo" 
                                                className={`flex flex-col items-center justify-center p-3 border rounded-xl hover:bg-muted/10 cursor-pointer transition-all ${
                                                    manualState === 'completo' ? 'border-emerald-500/50 bg-emerald-500/5 text-emerald-600' : 'border-muted'
                                                }`}
                                            >
                                                <CheckCircle className="w-5 h-5 mb-1 text-emerald-500" />
                                                <span className="text-xs font-extrabold">Completo</span>
                                            </Label>
                                        </div>

                                        <div>
                                            <RadioGroupItem value="incompleto" id="opt-incompleto" className="peer sr-only" />
                                            <Label 
                                                htmlFor="opt-incompleto" 
                                                className={`flex flex-col items-center justify-center p-3 border rounded-xl hover:bg-muted/10 cursor-pointer transition-all ${
                                                    manualState === 'incompleto' ? 'border-amber-500/50 bg-amber-500/5 text-amber-600' : 'border-muted'
                                                }`}
                                            >
                                                <AlertTriangle className="w-5 h-5 mb-1 text-amber-500" />
                                                <span className="text-xs font-extrabold">Incompleto</span>
                                            </Label>
                                        </div>

                                        <div>
                                            <RadioGroupItem value="rechazado" id="opt-rechazado" className="peer sr-only" />
                                            <Label 
                                                htmlFor="opt-rechazado" 
                                                className={`flex flex-col items-center justify-center p-3 border rounded-xl hover:bg-muted/10 cursor-pointer transition-all ${
                                                    manualState === 'rechazado' ? 'border-red-500/50 bg-red-500/5 text-red-600' : 'border-muted'
                                                }`}
                                            >
                                                <XCircle className="w-5 h-5 mb-1 text-red-500" />
                                                <span className="text-xs font-extrabold">Rechazado</span>
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </div>
                            </div>
                        ) : (
                            /* Avanzado Mode Detail Lines Input */
                            <div className="space-y-4">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                                    Desglose Físico por Línea de Producto (ERP)
                                </span>

                                {modalLoading ? (
                                    <div className="text-center p-6 space-y-2">
                                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-500" />
                                        <p className="text-xs text-muted-foreground">Recuperando líneas...</p>
                                    </div>
                                ) : (
                                    <div className="border border-muted rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-muted/50 text-[10px] font-extrabold uppercase text-muted-foreground border-b border-muted">
                                                    <th className="p-2.5">Código / Descripción</th>
                                                    <th className="p-2.5 text-center w-16">Pedida</th>
                                                    <th className="p-2.5 text-center w-24">Entregada</th>
                                                    <th className="p-2.5 text-center w-16">Faltante</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {modalLines.map((line) => {
                                                    const qty = lineQuantities[line.linea] || { entregada: line.cantidad, faltante: 0 };
                                                    return (
                                                        <tr key={line.linea} className="border-b border-muted/30 hover:bg-muted/10">
                                                            <td className="p-2.5">
                                                                <div className="font-extrabold text-foreground">{line.articulo}</div>
                                                                <div className="text-[10px] text-muted-foreground truncate max-w-[280px]">{line.descripcion}</div>
                                                            </td>
                                                            <td className="p-2.5 text-center font-bold text-muted-foreground">{line.cantidad}</td>
                                                            <td className="p-2.5 text-center">
                                                                <Input
                                                                    type="number"
                                                                    value={qty.entregada}
                                                                    min="0"
                                                                    max={line.cantidad}
                                                                    onChange={(e) => handleQtyChange(line.linea, line.cantidad, e.target.value)}
                                                                    className="h-7 w-16 rounded font-bold text-center p-1 mx-auto text-xs"
                                                                />
                                                            </td>
                                                            <td className={`p-2.5 text-center font-black ${qty.faltante > 0 ? 'text-red-500' : 'text-muted-foreground/30'}`}>
                                                                {qty.faltante}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Verification Release Codes section */}
                                {settings.release_codes_enabled === 'true' && (
                                    <div className="p-3 bg-purple-600/5 border border-purple-500/10 rounded-xl space-y-2">
                                        <div className="flex justify-between items-center">
                                            <div className="space-y-0.5">
                                                <span className="text-xs font-black text-purple-600 flex items-center gap-1">
                                                    <Key className="w-3.5 h-3.5" />
                                                    Código de Validación Requerido
                                                </span>
                                                <p className="text-[10px] text-muted-foreground font-semibold">
                                                    Se detectan mermas físicas. El despachador debe dictar un código de validación.
                                                </p>
                                            </div>

                                            <Button
                                                onClick={handleGenerateCode}
                                                disabled={generatingCode}
                                                size="sm"
                                                className="h-7 text-[10px] bg-purple-600 hover:bg-purple-700 text-white rounded font-extrabold gap-1"
                                            >
                                                {generatingCode ? 'Generando...' : 'Generar Código'}
                                            </Button>
                                        </div>

                                        {generatedCode && (
                                            <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 p-2 rounded-lg">
                                                <span className="text-[10px] text-purple-600 font-extrabold uppercase">Código a dictar:</span>
                                                <span className="text-sm font-black text-purple-700 tracking-widest">{generatedCode}</span>
                                            </div>
                                        )}

                                        <div className="space-y-1 pt-1">
                                            <Label className="text-[10px] font-extrabold text-muted-foreground uppercase">Ingrese el Código para Validar:</Label>
                                            <Input
                                                placeholder="XXXXXX"
                                                value={releaseCode}
                                                onChange={(e) => setReleaseCode(e.target.value)}
                                                className="rounded-lg text-center font-bold tracking-widest h-8 text-sm max-w-[120px] mx-auto"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Observations comments */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Comentarios y Observaciones</Label>
                            <Input
                                placeholder="Digite motivo de merma, rechazo u observaciones logísticas..."
                                value={manualComment}
                                onChange={(e) => setManualComment(e.target.value)}
                                className="rounded-lg text-xs font-semibold"
                            />
                        </div>
                    </div>
                )}

                <DialogFooter className="bg-muted/10 p-4 border-t border-muted/30 flex gap-2">
                    <Button 
                        variant="ghost" 
                        onClick={() => onOpenChange(false)}
                        className="rounded-lg font-bold text-xs"
                    >
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleSubmit}
                        disabled={modalLoading || submitLoading || (settings.delivery_mode === 'avanzado' && modalLines.length === 0)}
                        className="rounded-lg font-bold text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow"
                    >
                        {submitLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Check className="w-4 h-4" />
                        )}
                        {selectedDoc?.tipo_documento === 'recoger' ? 'Confirmar Recolecta' : 'Confirmar Entrega'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
