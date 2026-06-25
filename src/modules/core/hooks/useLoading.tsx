'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingContextType {
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  isLoading: boolean;
  loadingMessage: string;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [activeRequests, setActiveRequests] = useState(0);
  const [message, setMessage] = useState('Cargando...');
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  const showLoading = useCallback((customMessage = 'Cargando...') => {
    setMessage(customMessage);
    setActiveRequests((prev) => {
      const next = prev + 1;
      if (next === 1) {
        if (delayTimeoutRef.current) clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = setTimeout(() => {
          setShouldRender(true);
        }, 150);
      }
      return next;
    });
  }, []);

  const hideLoading = useCallback(() => {
    setActiveRequests((prev) => {
      const next = Math.max(0, prev - 1);
      if (next === 0) {
        if (delayTimeoutRef.current) {
          clearTimeout(delayTimeoutRef.current);
          delayTimeoutRef.current = null;
        }
        setShouldRender(false);
      }
      return next;
    });
  }, []);

  const isLoading = activeRequests > 0 && shouldRender;

  return (
    <LoadingContext.Provider value={{ showLoading, hideLoading, isLoading, loadingMessage: message }}>
      {children}
      {isLoading && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/60 backdrop-blur-md transition-all duration-300 animate-in fade-in">
          <div className="flex flex-col items-center space-y-4 p-6 rounded-2xl bg-card border shadow-2xl max-w-xs text-center animate-in zoom-in-95 duration-200">
            <div className="relative flex items-center justify-center">
              {/* External ping effect */}
              <div className="absolute h-16 w-16 rounded-full bg-primary/10 animate-ping" />
              {/* Spinner */}
              <Loader2 className="h-10 w-10 animate-spin text-primary stroke-[2.5]" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground text-sm tracking-wide">{message}</p>
              <p className="text-xs text-muted-foreground animate-pulse">Por favor, espera un momento</p>
            </div>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}
