'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { 
    getDocumentLines, 
    getActiveReleaseCode, 
    generateReleaseCode 
} from '@/modules/operations/lib/actions';

interface UseContingencyFormProps {
    isOpen: boolean;
    selectedDoc: any | null;
    settings: {
        delivery_mode: 'sencillo' | 'avanzado';
        release_codes_enabled: string;
    };
    onConfirm: (data: {
        estado: 'completo' | 'incompleto' | 'rechazado';
        comentario: string;
        lines?: any[];
    }) => Promise<boolean>;
    onOpenChange: (open: boolean) => void;
}

export function useContingencyForm({
    isOpen,
    selectedDoc,
    settings,
    onConfirm,
    onOpenChange
}: UseContingencyFormProps) {
    const { toast } = useToast();
    
    // Form and Modal States
    const [modalLoading, setModalLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [modalLines, setModalLines] = useState<any[]>([]);
    const [lineQuantities, setLineQuantities] = useState<Record<string, { entregada: number; faltante: number }>>({});
    
    const [manualState, setManualState] = useState<'completo' | 'incompleto' | 'rechazado'>('completo');
    const [manualComment, setManualComment] = useState('');
    const [releaseCode, setReleaseCode] = useState('');
    const [generatedCode, setGeneratedCode] = useState('');
    const [generatingCode, setGeneratingCode] = useState(false);

    // Load lines and validation codes when opening the modal
    useEffect(() => {
        if (!isOpen || !selectedDoc) return;

        setManualState('completo');
        setManualComment('');
        setReleaseCode('');
        setGeneratedCode('');
        setLineQuantities({});
        setModalLines([]);

        if (settings.delivery_mode === 'avanzado') {
            const loadData = async () => {
                setModalLoading(true);
                try {
                    const lines = await getDocumentLines(selectedDoc.documento_numero, selectedDoc.tipo_documento);
                    setModalLines(lines || []);
                    
                    // Initialize quantities mapping
                    const initialQuantities: Record<string, { entregada: number; faltante: number }> = {};
                    for (const line of lines) {
                        initialQuantities[line.linea] = {
                            entregada: line.cantidad,
                            faltante: 0
                        };
                    }
                    setLineQuantities(initialQuantities);

                    // Fetch active release code if any
                    const activeCode = await getActiveReleaseCode(selectedDoc.id);
                    if (activeCode) {
                        setGeneratedCode(activeCode.codigo);
                    }
                } catch (e: any) {
                    toast({
                        title: 'Error de líneas',
                        description: 'No se pudieron recuperar las líneas del documento ERP.',
                        variant: 'destructive'
                    });
                } finally {
                    setModalLoading(false);
                }
            };
            loadData();
        }
    }, [isOpen, selectedDoc, settings.delivery_mode, toast]);

    const handleQtyChange = (linea: number, pedida: number, value: string) => {
        const val = parseInt(value, 10);
        if (isNaN(val) || val < 0) return;
        
        const entregada = Math.min(val, pedida);
        const faltante = pedida - entregada;

        setLineQuantities(prev => ({
            ...prev,
            [linea]: { entregada, faltante }
        }));
    };

    const handleGenerateCode = async () => {
        if (!selectedDoc) return;
        setGeneratingCode(true);
        try {
            const res = await generateReleaseCode(selectedDoc.id, 'Coordinador Web');
            if (res.success && res.codigo) {
                setGeneratedCode(res.codigo);
                toast({
                    title: 'Código Generado',
                    description: `Código de liberación: ${res.codigo} (Válido por 15 min).`,
                });
            } else {
                throw new Error(res.error || 'No se pudo generar el código.');
            }
        } catch (e: any) {
            toast({
                title: 'Error de generación',
                description: e.message,
                variant: 'destructive'
            });
        } finally {
            setGeneratingCode(false);
        }
    };

    const handleSubmit = async () => {
        if (!selectedDoc) return;

        setSubmitLoading(true);
        try {
            let processedLines: any[] = [];
            let hasMermas = false;

            if (settings.delivery_mode === 'avanzado') {
                processedLines = modalLines.map(line => {
                    const qty = lineQuantities[line.linea] || { entregada: line.cantidad, faltante: 0 };
                    if (qty.faltante > 0) hasMermas = true;
                    return {
                        codigo: line.articulo,
                        desc: line.descripcion,
                        pedida: line.cantidad,
                        entregada: qty.entregada,
                        faltante: qty.faltante
                    };
                });

                // Validation code logic
                if (hasMermas && settings.release_codes_enabled === 'true') {
                    if (!releaseCode.trim()) {
                        throw new Error('Se requiere digitar un Código de Validación debido a diferencias físicas en la entrega.');
                    }
                    if (releaseCode.trim() !== generatedCode) {
                        throw new Error('El Código de Validación ingresado no es válido o ya expiró.');
                    }
                }
            }

            const stateToSave = settings.delivery_mode === 'avanzado' 
                ? (hasMermas ? 'incompleto' : 'completo')
                : manualState;

            const success = await onConfirm({
                estado: stateToSave,
                comentario: manualComment,
                lines: settings.delivery_mode === 'avanzado' ? processedLines : undefined
            });

            if (success) {
                onOpenChange(false);
            }
        } catch (e: any) {
            toast({
                title: 'Error al reportar',
                description: e.message || 'No se pudo guardar el reporte de entrega.',
                variant: 'destructive'
            });
        } finally {
            setSubmitLoading(false);
        }
    };

    return {
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
    };
}
