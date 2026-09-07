'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Check, PenTool } from 'lucide-react';

interface SignatureCanvasProps {
  onSave: (signatureDataUrl: string | null) => void;
  height?: number;
}

export function SignatureCanvas({ onSave, height = 160 }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set high resolution for crisp drawing
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.strokeStyle = '#0f172a'; // Dark slate
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      emitSignature();
    }
  };

  const emitSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) {
      onSave(null);
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
    onSave(null);
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-600 font-semibold px-1">
        <span className="flex items-center gap-1.5 text-slate-700">
          <PenTool className="w-3.5 h-3.5 text-indigo-600" />
          Firma del Cliente (Pantalla Táctil)
        </span>
        {hasSignature && (
          <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
            <Check className="w-3 h-3" /> Registrada
          </span>
        )}
      </div>

      <div className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white shadow-inner touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ height: `${height}px` }}
          className="w-full cursor-crosshair block touch-none"
        />

        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
            <p className="text-xs text-slate-400 font-medium italic">Firme con el dedo aquí...</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={!hasSignature}
          className="h-8 text-xs font-semibold text-slate-600 hover:text-slate-900 border-slate-300"
        >
          <Eraser className="w-3.5 h-3.5 mr-1" />
          Limpiar Firma
        </Button>
      </div>
    </div>
  );
}
