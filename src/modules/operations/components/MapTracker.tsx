import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, Globe, Map, Moon, Eye, EyeOff, Route, Truck, MapPin } from 'lucide-react';

// Keyframe animation injected dynamically for premium visual effects
const INJECTED_STYLES = `
  @keyframes gps-pulse {
    0% { transform: scale(0.6); opacity: 0.9; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  .custom-truck-pulse {
    position: relative;
    width: 30px;
    height: 30px;
  }
  .custom-truck-pulse::after {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: #3b82f6;
    opacity: 0.4;
    animation: gps-pulse 2s infinite ease-in-out;
    top: 0;
    left: 0;
  }
  .custom-truck-dot {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #2563eb;
    border: 2px solid #ffffff;
    top: 9px;
    left: 9px;
    box-shadow: 0 0 6px rgba(0,0,0,0.6);
    z-index: 10;
  }
`;

interface MapTrackerProps {
  activeTrucks: any[];
  gpsPaths: Record<number, any[]>;
  deliveryMarkers: any[];
  onMarkerClick?: (deliveryId: number) => void;
}

export default function MapTracker({ activeTrucks, gpsPaths, deliveryMarkers, onMarkerClick }: MapTrackerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Map settings state
  const [mapType, setMapType] = useState<'dark' | 'satellite' | 'streets'>('dark');
  const [showRoutes, setShowRoutes] = useState<boolean>(true);
  const [showDeliveries, setShowDeliveries] = useState<boolean>(true);
  const [showTrucks, setShowTrucks] = useState<boolean>(true);

  // Keep track of previous coordinates length to avoid re-zooming on simple toggle changes
  const prevDataHashRef = useRef<string>('');

  useEffect(() => {
    // Inject custom animation styles if not already present
    if (!document.getElementById('leaflet-custom-styles')) {
      const style = document.createElement('style');
      style.id = 'leaflet-custom-styles';
      style.innerHTML = INJECTED_STYLES;
      document.head.appendChild(style);
    }

    if (!mapContainerRef.current) return;

    // Initialize map if it doesn't exist
    if (!mapRef.current) {
      // Costa Rica centroid as default
      const defaultCenter: L.LatLngExpression = [9.7489, -83.7534];
      const defaultZoom = 8;

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: false // custom position below
      });

      // Re-position zoom control to bottom-right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
    }

    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    // Update base tile layer dynamically based on mapType state
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    let url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    if (mapType === 'satellite') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
    } else if (mapType === 'streets') {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    }

    tileLayerRef.current = L.tileLayer(url, {
      attribution,
      maxZoom: 20
    }).addTo(map);

    // Clear previous dynamic layers
    markersLayer.clearLayers();

    const bounds: L.LatLng[] = [];

    // 1. Draw route paths (polylines) - only if showRoutes is true
    if (showRoutes) {
      Object.entries(gpsPaths).forEach(([assignmentId, points]) => {
        if (points.length < 2) return;
        const latLngs = points.map(p => L.latLng(p.latitud, p.longitud));
        
        // Plot the trace line
        L.polyline(latLngs, {
          color: mapType === 'satellite' ? '#10b981' : '#3b82f6', // emerald on satellite for visibility
          weight: 3,
          opacity: 0.8,
          dashArray: '5, 10'
        }).addTo(markersLayer);

        latLngs.forEach(ll => bounds.push(ll));
      });
    }

    // 2. Plot completed/attempted delivery points (grouping identical coordinates to avoid visual overlap)
    if (showDeliveries) {
      const groupedMarkers: Record<string, any[]> = {};
      deliveryMarkers.forEach(del => {
        const lat = del.latitud;
        const lng = del.longitud;
        if (!lat || !lng) return;
        
        // Group using 5 decimal places (approx 1.1 meters precision)
        const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        if (!groupedMarkers[key]) {
          groupedMarkers[key] = [];
        }
        groupedMarkers[key].push(del);
      });

      Object.entries(groupedMarkers).forEach(([coordsKey, docs]) => {
        const [latStr, lngStr] = coordsKey.split(',');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        const latLng = L.latLng(lat, lng);
        bounds.push(latLng);

        // Determine badge color based on contents
        const hasRejected = docs.some(d => d.estado === 'rechazado');
        const hasIncomplete = docs.some(d => d.estado === 'incompleto');
        
        let markerColor = '#10b981'; // green
        let statusLabel = 'Completado 🟢';
        if (hasRejected) {
          markerColor = '#ef4444'; // red
          statusLabel = 'Rechazo 🔴';
        } else if (hasIncomplete) {
          markerColor = '#f59e0b'; // orange
          statusLabel = 'Incompleto 🟡';
        }

        // Elegant grouped marker with count badge if > 1
        const customDivIcon = L.divIcon({
          className: 'custom-delivery-marker',
          html: `
            <div style="position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background: ${markerColor}; border: 1.5px solid #ffffff; box-shadow: 0 0 6px ${markerColor};"></div>
              ${docs.length > 1 ? `<span style="position: absolute; top: -6px; right: -6px; background: #3b82f6; color: white; font-size: 8px; font-weight: 900; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; border: 1px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);">${docs.length}</span>` : ''}
            </div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        const marker = L.marker(latLng, { icon: customDivIcon }).addTo(markersLayer);

        // Populate popup with list of all deliveries at this location
        let popupContent = `
          <div style="font-family: sans-serif; padding: 4px; color: #f3f4f6; background: #1f2937; border-radius: 4px; min-width: 220px; max-width: 280px;">
            <h4 style="margin: 0 0 8px 0; color: #60a5fa; font-size: 12px; font-weight: 800; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
              📍 Ubicación (${docs.length} ${docs.length > 1 ? 'Entregas' : 'Entrega'})
            </h4>
            <div style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
        `;

        docs.forEach((del, index) => {
          let itemStatusLabel = 'Completado 🟢';
          if (del.estado === 'incompleto') itemStatusLabel = 'Incompleto 🟡';
          if (del.estado === 'rechazado') itemStatusLabel = 'Rechazado 🔴';

          const formattedTime = del.fecha_entrega 
            ? new Date(del.fecha_entrega).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            : '';

          popupContent += `
            <div style="padding: 4px 0; ${index > 0 ? 'border-top: 1px dashed rgba(255,255,255,0.08);' : ''}">
              <div style="font-size: 11px; font-weight: 700; color: #93c5fd;">Factura #${del.documento_numero}</div>
              <div style="font-size: 10px; margin-bottom: 2px;"><b>Cliente:</b> ${del.cliente_nombre}</div>
              ${del.embarcar_a ? `<div style="font-size: 10px; margin-bottom: 2px;"><b>Destino:</b> ${del.embarcar_a}</div>` : ''}
              ${del.chofer_nombre ? `<div style="font-size: 10px; margin-bottom: 2px;"><b>Chofer:</b> ${del.chofer_nombre}</div>` : ''}
              <div style="font-size: 10px; margin-bottom: 2px;"><b>Estado:</b> ${itemStatusLabel}</div>
              ${formattedTime ? `<div style="font-size: 9px; color: #9ca3af;">⏱️ Reportado a las ${formattedTime}</div>` : ''}
            </div>
          `;
        });

        popupContent += `
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          className: 'dark-popup',
          closeButton: false
        });

        if (onMarkerClick) {
          marker.on('click', () => onMarkerClick(docs[0].id));
        }
      });
    }

    // 3. Plot active truck points - only if showTrucks is true
    if (showTrucks) {
      activeTrucks.forEach(truck => {
        const lat = truck.latitud;
        const lng = truck.longitud;
        if (!lat || !lng) return;

        const latLng = L.latLng(lat, lng);
        bounds.push(latLng);

        // Customize active truck marker pulse color depending on map style for contrast
        const pulseColor = mapType === 'satellite' ? '#22c55e' : '#3b82f6';

        const truckIcon = L.divIcon({
          className: 'custom-truck-marker',
          html: `
            <div class="custom-truck-pulse">
              <style>
                .custom-truck-pulse::after { background: ${pulseColor} !important; }
                .custom-truck-dot { background: ${pulseColor} !important; }
              </style>
              <div class="custom-truck-dot"></div>
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });

        const marker = L.marker(latLng, { icon: truckIcon }).addTo(markersLayer);

        const popupContent = `
          <div style="font-family: sans-serif; padding: 4px; color: #f3f4f6; background: #1f2937; border-radius: 4px; min-width: 180px;">
            <h4 style="margin: 0 0 6px 0; color: #3b82f6; font-size: 13px; font-weight: 600;">🚚 Camión Activo</h4>
            <div style="font-size: 11px; margin-bottom: 4px;"><b>Ruta:</b> ${truck.ruta_nombre}</div>
            <div style="font-size: 11px; margin-bottom: 4px;"><b>Chofer:</b> ${truck.chofer_nombre}</div>
            <div style="font-size: 11px; margin-bottom: 4px;"><b>Placa:</b> ${truck.vehiculo_placa}</div>
            ${truck.siguiente_cliente ? `<div style="font-size: 11px; margin-bottom: 4px; color: #fbbf24;">📍 <b>Destino actual:</b> ${truck.siguiente_cliente}</div>` : ''}
            <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">⏱️ Último reporte: ${new Date(truck.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          className: 'dark-popup',
          closeButton: false
        });
      });
    }

    // Fit map view bounds automatically to cover all active components
    // BUT only when the actual coordinates data changes (not when toggling toggles or map types)
    const currentDataHash = `${activeTrucks.length}-${deliveryMarkers.length}-${Object.keys(gpsPaths).length}`;
    if (bounds.length > 0 && prevDataHashRef.current !== currentDataHash) {
      map.fitBounds(L.latLngBounds(bounds), {
        padding: [40, 40],
        maxZoom: 15
      });
      prevDataHashRef.current = currentDataHash;
    }

  }, [activeTrucks, gpsPaths, deliveryMarkers, onMarkerClick, mapType, showRoutes, showDeliveries, showTrucks]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const style = document.getElementById('leaflet-custom-styles');
      if (style) {
        style.remove();
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Dynamic Leaflet Map Container */}
      <div 
        ref={mapContainerRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          borderRadius: '0.75rem', 
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }} 
      />

      {/* Floating Modern HUD for Layer Controls (Top-Left) */}
      <div className="absolute top-4 left-4 z-[1000] bg-slate-900/95 backdrop-blur-md border border-slate-800/80 rounded-xl p-3.5 shadow-2xl w-[220px] pointer-events-auto text-slate-100 flex flex-col gap-3.5 select-none">
        {/* Title */}
        <div className="flex items-center gap-2 pb-1.5 border-b border-slate-800/60">
          <Layers className="w-4 h-4 text-blue-400" />
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">Capas Satelitales</h4>
        </div>

        {/* Base Map Selector */}
        <div className="space-y-1.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Fondo del Mapa</span>
          <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/40">
            <button
              onClick={() => setMapType('dark')}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-md transition-all ${
                mapType === 'dark' 
                  ? 'bg-blue-600 text-white font-bold shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Moon className="w-3.5 h-3.5 mb-0.5" />
              <span className="text-[9px] tracking-tight">Oscuro</span>
            </button>
            <button
              onClick={() => setMapType('satellite')}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-md transition-all ${
                mapType === 'satellite' 
                  ? 'bg-blue-600 text-white font-bold shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Globe className="w-3.5 h-3.5 mb-0.5" />
              <span className="text-[9px] tracking-tight">Satélite</span>
            </button>
            <button
              onClick={() => setMapType('streets')}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-md transition-all ${
                mapType === 'streets' 
                  ? 'bg-blue-600 text-white font-bold shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Map className="w-3.5 h-3.5 mb-0.5" />
              <span className="text-[9px] tracking-tight">Calles</span>
            </button>
          </div>
        </div>

        {/* Overlay Layers Switches */}
        <div className="space-y-1.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Filtros de Trazado</span>
          
          <div className="flex flex-col gap-1.5">
            {/* Toggle Routes */}
            <button
              onClick={() => setShowRoutes(!showRoutes)}
              className="flex items-center justify-between p-1.5 px-2 bg-slate-950/40 hover:bg-slate-950/80 rounded-lg border border-slate-800/30 transition-all group"
            >
              <div className="flex items-center gap-2">
                <Route className={`w-3.5 h-3.5 ${showRoutes ? 'text-blue-400' : 'text-slate-500'}`} />
                <span className={`text-[10px] font-bold transition-colors ${showRoutes ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                  Mostrar Rutas
                </span>
              </div>
              {showRoutes ? (
                <Eye className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>

            {/* Toggle Deliveries */}
            <button
              onClick={() => setShowDeliveries(!showDeliveries)}
              className="flex items-center justify-between p-1.5 px-2 bg-slate-950/40 hover:bg-slate-950/80 rounded-lg border border-slate-800/30 transition-all group"
            >
              <div className="flex items-center gap-2">
                <MapPin className={`w-3.5 h-3.5 ${showDeliveries ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className={`text-[10px] font-bold transition-colors ${showDeliveries ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                  Puntos Entrega
                </span>
              </div>
              {showDeliveries ? (
                <Eye className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>

            {/* Toggle Trucks */}
            <button
              onClick={() => setShowTrucks(!showTrucks)}
              className="flex items-center justify-between p-1.5 px-2 bg-slate-950/40 hover:bg-slate-950/80 rounded-lg border border-slate-800/30 transition-all group"
            >
              <div className="flex items-center gap-2">
                <Truck className={`w-3.5 h-3.5 ${showTrucks ? 'text-blue-500' : 'text-slate-500'}`} />
                <span className={`text-[10px] font-bold transition-colors ${showTrucks ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                  Camiones Activos
                </span>
              </div>
              {showTrucks ? (
                <Eye className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Dark Leaflet Popup Styling Override */}
      <style jsx global>{`
        .leaflet-popup-content-wrapper {
          background: #1f2937 !important;
          color: #f3f4f6 !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5) !important;
          border-radius: 0.5rem !important;
        }
        .leaflet-popup-tip {
          background: #1f2937 !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
        }
      `}</style>
    </div>
  );
}
