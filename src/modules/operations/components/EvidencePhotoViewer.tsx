'use client';

import React from 'react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';

interface SelectedPhoto {
    url: string;
    title: string;
}

interface EvidencePhotoViewerProps {
    selectedPhoto: SelectedPhoto | null;
    onClose: () => void;
}

export function EvidencePhotoViewer({ selectedPhoto, onClose }: EvidencePhotoViewerProps) {
    return (
        <Dialog open={!!selectedPhoto} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-[500px] border-none bg-slate-950/95 backdrop-blur-md text-white shadow-2xl p-6 rounded-3xl">
                <DialogHeader className="space-y-1.5">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
                        <Camera className="h-5 w-5 text-blue-400" />
                        {selectedPhoto?.title || "Evidencia Digital"}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-400">
                        Foto adjunta a este reporte de entrega desde Telegram.
                    </DialogDescription>
                </DialogHeader>
                {selectedPhoto && (
                    <div className="relative mt-4 w-full h-[480px] bg-black/60 rounded-2xl overflow-hidden flex items-center justify-center border border-white/10 group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                            src={selectedPhoto.url} 
                            alt={selectedPhoto.title} 
                            className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
                        />
                    </div>
                )}
                <div className="mt-4 flex gap-3">
                    <Button 
                        variant="secondary" 
                        className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-xl h-11 font-semibold"
                        onClick={onClose}
                    >
                        Cerrar Vista
                    </Button>
                    {selectedPhoto && (
                        <a 
                            href={selectedPhoto.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1"
                        >
                            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-semibold flex items-center justify-center gap-2">
                                Abrir Original
                            </Button>
                        </a>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
