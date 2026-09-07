'use client';

import React, { useState, useEffect } from 'react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Download, ExternalLink, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import Image from 'next/image';

export interface SelectedPhoto {
    url?: string;
    urls?: string[];
    title: string;
}

interface EvidencePhotoViewerProps {
    selectedPhoto: SelectedPhoto | null;
    onClose: () => void;
}

export function EvidencePhotoViewer({ selectedPhoto, onClose }: EvidencePhotoViewerProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Extraer lista de URLs seguras
    const photoList: string[] = React.useMemo(() => {
        if (!selectedPhoto) return [];
        if (selectedPhoto.urls && selectedPhoto.urls.length > 0) {
            return selectedPhoto.urls;
        }
        if (selectedPhoto.url) {
            const raw = selectedPhoto.url.trim();
            if (raw.startsWith('[') && raw.endsWith(']')) {
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed.map((item: string) => 
                            item.startsWith('http') || item.startsWith('data:') ? item : `/api/fleet/files/${item}`
                        );
                    }
                } catch (_) {}
            }
            return [raw];
        }
        return [];
    }, [selectedPhoto]);

    useEffect(() => {
        setCurrentIndex(0);
    }, [selectedPhoto]);

    const activeUrl = photoList[currentIndex] || '';
    const totalPhotos = photoList.length;

    const handleDownload = async () => {
        if (!activeUrl) return;
        try {
            const response = await fetch(activeUrl);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            // Clean filename
            const cleanTitle = (selectedPhoto?.title || 'Evidencia_Entrega')
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .replace(/_+/g, '_');
            link.download = totalPhotos > 1 ? `${cleanTitle}_Pagina_${currentIndex + 1}.png` : `${cleanTitle}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (e) {
            const link = document.createElement('a');
            link.href = activeUrl;
            link.download = 'evidencia.png';
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <Dialog open={!!selectedPhoto && photoList.length > 0} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col border border-slate-800 bg-slate-950/95 backdrop-blur-xl text-white shadow-2xl p-6 rounded-3xl">
                <DialogHeader className="space-y-1.5 pb-2 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-lg font-bold flex items-center gap-2 text-white">
                            <Camera className="h-5 w-5 text-indigo-400" />
                            {selectedPhoto?.title || "Evidencia Digital"}
                        </DialogTitle>
                        {totalPhotos > 1 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/30">
                                <Layers className="w-3.5 h-3.5" /> Página {currentIndex + 1} de {totalPhotos}
                            </span>
                        )}
                    </div>
                    <DialogDescription className="text-xs text-slate-400">
                        Comprobante fotográfico registrado en la entrega. {totalPhotos > 1 ? "Use las flechas para navegar entre las páginas o fotos adjuntas." : ""}
                    </DialogDescription>
                </DialogHeader>

                {activeUrl && (
                    <div className="relative mt-3 w-full h-[55vh] min-h-[320px] bg-black/70 rounded-2xl overflow-hidden flex items-center justify-center border border-white/10 group p-2">
                        <Image 
                            src={activeUrl} 
                            alt={`${selectedPhoto?.title || 'Foto'} ${totalPhotos > 1 ? `(${currentIndex + 1}/${totalPhotos})` : ''}`} 
                            fill
                            className="object-contain transition-transform duration-300 group-hover:scale-105"
                            unoptimized
                        />

                        {/* Navigation controls for multi-photo */}
                        {totalPhotos > 1 && (
                            <>
                                <button
                                    onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                                    disabled={currentIndex === 0}
                                    className={`absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full backdrop-blur-md transition-all ${
                                        currentIndex === 0 ? 'bg-black/20 text-white/30 cursor-not-allowed' : 'bg-black/60 hover:bg-indigo-600 text-white shadow-lg'
                                    }`}
                                >
                                    <ChevronLeft className="w-6 h-6" />
                                </button>
                                <button
                                    onClick={() => setCurrentIndex(i => Math.min(totalPhotos - 1, i + 1))}
                                    disabled={currentIndex === totalPhotos - 1}
                                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full backdrop-blur-md transition-all ${
                                        currentIndex === totalPhotos - 1 ? 'bg-black/20 text-white/30 cursor-not-allowed' : 'bg-black/60 hover:bg-indigo-600 text-white shadow-lg'
                                    }`}
                                >
                                    <ChevronRight className="w-6 h-6" />
                                </button>
                            </>
                        )}
                    </div>
                )}

                <div className="mt-4 pt-2 border-t border-white/10 flex flex-wrap gap-2 justify-between items-center">
                    <Button 
                        variant="secondary" 
                        className="bg-white/10 hover:bg-white/20 text-white rounded-xl h-10 px-4 text-xs font-semibold"
                        onClick={onClose}
                    >
                        Cerrar
                    </Button>

                    <div className="flex items-center gap-2">
                        {activeUrl && (
                            <>
                                <Button
                                    onClick={handleDownload}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                                >
                                    <Download className="w-4 h-4" />
                                    Descargar {totalPhotos > 1 ? `Pág. ${currentIndex + 1}` : 'Imagen'}
                                </Button>
                                <a 
                                    href={activeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Button 
                                        variant="outline"
                                        className="bg-indigo-600 hover:bg-indigo-700 border-none text-white rounded-xl h-10 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        Abrir en Grande
                                    </Button>
                                </a>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
