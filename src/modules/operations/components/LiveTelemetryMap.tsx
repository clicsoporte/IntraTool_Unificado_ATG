'use client';

import React, { useEffect, useRef, useCallback } from 'react';

declare global {
    interface Window {
        L: any;
    }
}

type LiveTelemetryMapProps = {
    telemetry: any[];
    selectedTrackerId?: number | null;
    zoom?: number;
    mapStyle?: 'osm' | 'carto-light' | 'carto-dark' | 'google-maps';
    showLabels?: boolean;
    showTime?: boolean;
    autoFit?: boolean;
    onSelectVehicle?: (trackerId: number) => void;
    depotLat?: number;
    depotLng?: number;
    depotRadius?: number;
    cartoApiKey?: string;
    googleMapsApiKey?: string;
};

export default function LiveTelemetryMap({
    telemetry,
    selectedTrackerId,
    zoom = 13,
    mapStyle = 'osm',
    showLabels = true,
    showTime = true,
    autoFit = false,
    onSelectVehicle,
    depotLat = 10.025541,
    depotLng = -84.273252,
    depotRadius = 500,
    cartoApiKey,
    googleMapsApiKey
}: LiveTelemetryMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const tileLayerRef = useRef<any>(null);
    const markersRef = useRef<Record<string, any>>({});
    const labelsRef = useRef<Record<string, any>>({});
    const linesRef = useRef<Record<string, any>>({});
    const depotCircleRef = useRef<any>(null);
    const prevSelectedTrackerIdRef = useRef<number | string | null | undefined>(null);

    // Helper para adjuntar el TileLayer actual
    const applyTileLayer = useCallback((map: any, L: any, style: string) => {
        if (tileLayerRef.current) {
            try {
                map.removeLayer(tileLayerRef.current);
            } catch (_) {}
            tileLayerRef.current = null;
        }

        let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        let subdomains: string | string[] = ['a', 'b', 'c'];
        if (style === 'carto-light') {
            tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
            subdomains = 'abcd';
        } else if (style === 'carto-dark') {
            tileUrl = cartoApiKey 
                ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${cartoApiKey}`
                : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
            subdomains = 'abcd';
        } else if (style === 'google-maps') {
            tileUrl = googleMapsApiKey
                ? `https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${googleMapsApiKey}`
                : 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
            subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
        }

        const newLayer = L.tileLayer(tileUrl, {
            maxZoom: 19,
            subdomains,
            attribution: style === 'google-maps' ? '© Google Maps' : '© OpenStreetMap / CartoDB'
        }).addTo(map);

        tileLayerRef.current = newLayer;
    }, [cartoApiKey, googleMapsApiKey]);

    // 1. Inicialización ÚNICA del contenedor del mapa
    useEffect(() => {
        if (typeof window === 'undefined' || !mapRef.current) return;

        // Cargar CSS de Leaflet si no existe
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        const createMapInstance = (L: any) => {
            if (!mapInstanceRef.current && mapRef.current) {
                const map = L.map(mapRef.current, {
                    zoomControl: false
                }).setView([depotLat, depotLng], zoom);

                L.control.zoom({ position: 'bottomright' }).addTo(map);
                mapInstanceRef.current = map;

                // Aplicar TileLayer inmediatamente al crear la instancia
                applyTileLayer(map, L, mapStyle);

                // Forzar recálculo de dimensiones para evitar el cuadro gris inicial de Leaflet
                setTimeout(() => {
                    try {
                        map.invalidateSize();
                    } catch (_) {}
                }, 100);
            }
        };

        if (window.L) {
            createMapInstance(window.L);
        } else if (!document.getElementById('leaflet-js')) {
            const script = document.createElement('script');
            script.id = 'leaflet-js';
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => {
                if (window.L) createMapInstance(window.L);
            };
            document.body.appendChild(script);
        } else {
            const checkInterval = setInterval(() => {
                if (window.L) {
                    clearInterval(checkInterval);
                    createMapInstance(window.L);
                }
            }, 100);
        }

        return () => {
            if (mapInstanceRef.current) {
                try {
                    mapInstanceRef.current.remove();
                    mapInstanceRef.current = null;
                } catch (_) {}
            }
        };
    }, [depotLat, depotLng, zoom, applyTileLayer, mapStyle]);

    // 2. Cambio de TileLayer cuando el usuario cambia el selector de mapa
    useEffect(() => {
        if (!mapInstanceRef.current || !window.L) return;
        applyTileLayer(mapInstanceRef.current, window.L, mapStyle);
        try {
            mapInstanceRef.current.invalidateSize();
        } catch (_) {}
    }, [mapStyle, applyTileLayer]);

    // 3. Actualización continua de marcadores, telemetría y geocerca SIN parpadeo
    useEffect(() => {
        if (!mapInstanceRef.current || !window.L) return;
        const L = window.L;
        const map = mapInstanceRef.current;

        // Renderizar / actualizar Geofence de la empresa
        if (depotLat && depotLng) {
            if (depotCircleRef.current) {
                map.removeLayer(depotCircleRef.current);
            }
            depotCircleRef.current = L.circle([depotLat, depotLng], {
                radius: depotRadius,
                color: '#f97316',
                fillColor: '#f97316',
                fillOpacity: 0.12,
                weight: 2,
                dashArray: '5, 5'
            }).addTo(map);
        }

        const activeIds = new Set<string>();

        // Actualizar Marcadores
        for (const item of telemetry) {
            if (!item.lat || !item.lng) continue;
            const key = String(item.id);
            activeIds.add(key);

            const colorHex = item.connectionStatus === 'offline' 
                ? '#64748b' 
                : (item.movementStatus === 'parked' ? '#f97316' : (item.movementStatus === 'moving' ? '#10b981' : '#eab308'));

            const isMoving = item.movementStatus === 'moving';
            const pulseHtml = isMoving 
                ? `<div style="position: absolute; width: 28px; height: 28px; top: -4px; left: -4px; border-radius: 50%; background: ${colorHex}; opacity: 0.5; animation: ping 1.5s infinite;"></div>`
                : '';

            const customIcon = L.divIcon({
                className: `vehicle-marker-${key}`,
                html: `
                    <div style="position: relative; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                        ${pulseHtml}
                        <div style="width: 14px; height: 14px; border-radius: 50%; background: ${colorHex}; border: 2.5px solid #ffffff; box-shadow: 0 0 8px ${colorHex}; z-index: 10;"></div>
                    </div>
                `,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            if (markersRef.current[key]) {
                markersRef.current[key].setLatLng([item.lat, item.lng]);
                markersRef.current[key].setIcon(customIcon);
            } else {
                const marker = L.marker([item.lat, item.lng], { icon: customIcon }).addTo(map);
                
                marker.on('click', () => {
                    if (onSelectVehicle) onSelectVehicle(item.id);
                });

                marker.bindPopup(`
                    <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a;">
                        <b style="font-size: 13px; color: #0f172a;">${item.label}</b><br/>
                        <span style="color: #64748b;">Placa: <b>${item.plate}</b></span><br/>
                        <span style="color: ${colorHex}; font-weight: bold;">Estado: ${item.movementStatus === 'moving' ? 'En Ruta (' + item.speed + ' km/h)' : (item.movementStatus === 'parked' ? 'En Empresa' : 'Detenido')}</span><br/>
                        <span style="font-size: 11px; color: #334155;">📍 ${item.locationText || 'Ubicación...'}</span>
                    </div>
                `);
                markersRef.current[key] = marker;
            }

            // Renderizar Etiquetas Flotantes en el Mapa con línea indicadora
            if (showLabels && item.connectionStatus !== 'offline') {
                const angle = (item.id * 53) % 360;
                const rad = (angle * Math.PI) / 180;
                const distance = 55 + (item.id % 3) * 6;
                const offsetX = Math.cos(rad) * distance;
                const offsetY = Math.sin(rad) * distance - 20;

                const labelLat = item.lat + (offsetY / 111000);
                const labelLng = item.lng + (offsetX / (111000 * Math.cos((item.lat * Math.PI) / 180)));

                const labelHtml = `
                    <div style="
                        background: #0f172a;
                        color: #fff;
                        padding: 6px 10px;
                        border-radius: 10px;
                        font-size: 11px;
                        font-weight: 800;
                        border: 2px solid ${colorHex};
                        box-shadow: 0 4px 16px rgba(0,0,0,0.7);
                        display: flex;
                        flex-direction: column;
                        min-width: 170px;
                        pointer-events: none;
                    ">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                            <div style="display:flex; align-items:center; gap:5px;">
                                <span style="width:8px; height:8px; border-radius:50%; background:${colorHex}; display:inline-block;"></span>
                                <span style="font-size:12px; font-weight:900; color:#f8fafc;">${item.label}</span>
                            </div>
                            <span style="font-size:10px; color:#38bdf8; font-weight:800;">⚡ ${item.speed || 0} km/h</span>
                        </div>
                        ${showTime && item.timeInStateFormatted ? `
                            <div style="font-size:10px; color:#fbbf24; font-weight:700; margin-top:2px;">
                                ⏱️ ${item.movementStatus === 'moving' ? 'en ruta: ' + item.timeInStateFormatted : item.timeInStateFormatted}
                            </div>
                        ` : ''}
                    </div>
                `;

                if (labelsRef.current[key]) {
                    labelsRef.current[key].setLatLng([labelLat, labelLng]);
                    labelsRef.current[key].setIcon(L.divIcon({
                        className: 'label-box',
                        html: labelHtml,
                        iconSize: [160, 44],
                        iconAnchor: [80, 22]
                    }));
                } else {
                    const labelMarker = L.marker([labelLat, labelLng], {
                        icon: L.divIcon({
                            className: 'label-box',
                            html: labelHtml,
                            iconSize: [160, 44],
                            iconAnchor: [80, 22]
                        }),
                        interactive: false,
                        pane: 'popupPane'
                    }).addTo(map);
                    labelsRef.current[key] = labelMarker;
                }

                if (linesRef.current[key]) {
                    linesRef.current[key].setLatLngs([[item.lat, item.lng], [labelLat, labelLng]]);
                    linesRef.current[key].setStyle({ color: colorHex });
                } else {
                    const line = L.polyline([[item.lat, item.lng], [labelLat, labelLng]], {
                        color: colorHex,
                        weight: 1.5,
                        opacity: 0.5,
                        dashArray: '4, 4',
                        interactive: false,
                        pane: 'overlayPane'
                    }).addTo(map);
                    linesRef.current[key] = line;
                }
            } else {
                if (labelsRef.current[key]) {
                    map.removeLayer(labelsRef.current[key]);
                    delete labelsRef.current[key];
                }
                if (linesRef.current[key]) {
                    map.removeLayer(linesRef.current[key]);
                    delete linesRef.current[key];
                }
            }

            // Vuelo suave de cámara únicamente al cambiar la selección del vehículo (evita saltos en cada poll de 12s)
            if (selectedTrackerId && Number(selectedTrackerId) === Number(item.id)) {
                if (prevSelectedTrackerIdRef.current !== selectedTrackerId) {
                    map.flyTo([item.lat, item.lng], 17, {
                        animate: true,
                        duration: 1.5
                    });
                    if (markersRef.current[key]) {
                        markersRef.current[key].openPopup();
                    }
                }
            }
        }

        // Limpieza de marcadores de vehículos eliminados / desconectados
        Object.keys(markersRef.current).forEach(id => {
            if (!activeIds.has(id)) {
                map.removeLayer(markersRef.current[id]);
                delete markersRef.current[id];
            }
        });
        Object.keys(labelsRef.current).forEach(id => {
            if (!activeIds.has(id)) {
                map.removeLayer(labelsRef.current[id]);
                delete labelsRef.current[id];
            }
        });
        Object.keys(linesRef.current).forEach(id => {
            if (!activeIds.has(id)) {
                map.removeLayer(linesRef.current[id]);
                delete linesRef.current[id];
            }
        });

        prevSelectedTrackerIdRef.current = selectedTrackerId;

        // Auto ajuste si la opción está activa y no hay selección específica
        if (autoFit && !selectedTrackerId && telemetry.length > 0) {
            const validCoords = telemetry.filter(t => t.lat && t.lng).map(t => [t.lat, t.lng]);
            if (validCoords.length > 0) {
                const bounds = L.latLngBounds(validCoords);
                map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15, animate: true });
            }
        }
    }, [telemetry, selectedTrackerId, showLabels, showTime, autoFit, depotLat, depotLng, depotRadius, onSelectVehicle]);

    return (
        <div className="w-full h-full min-h-[450px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative">
            <div ref={mapRef} className="w-full h-full min-h-[450px] z-10" />
        </div>
    );
}
