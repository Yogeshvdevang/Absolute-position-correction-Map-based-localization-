import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BasemapStyle } from './MapView';

const DEFAULT_FOCUS: [number, number] = [78.9629, 20.5937];

const basemapSources: Record<BasemapStyle, maplibregl.RasterSourceSpecification> = {
  streets: {
    type: 'raster',
    tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: 'Ac OpenStreetMap contributors',
    maxzoom: 19,
    minzoom: 0
  },
  dark: {
    type: 'raster',
    tiles: ['https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: 'Ac Stadia Maps Ac OpenMapTiles Ac OpenStreetMap contributors',
    maxzoom: 20,
    minzoom: 0
  },
  satellite: {
    type: 'raster',
    tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: 'Ac Esri',
    maxzoom: 19,
    minzoom: 0
  },
  terrain: {
    type: 'raster',
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: 'Ac OpenTopoMap Ac OpenStreetMap contributors',
    maxzoom: 17,
    minzoom: 0
  }
};

const buildStyle = (style: BasemapStyle): maplibregl.StyleSpecification => ({
  version: 8,
  sources: {
    basemap: basemapSources[style]
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0b1220' }
    },
    {
      id: 'basemap',
      type: 'raster',
      source: 'basemap',
      paint: { 'raster-opacity': 1 }
    }
  ]
});

interface MiniMapProps {
  center?: { lat: number; lon: number } | null;
  mapStyle: BasemapStyle;
  zoom?: number;
  bearing?: number;
}

export const MiniMap = ({ center, mapStyle, zoom = 12, bearing = 0 }: MiniMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(mapStyle),
      center: center ? [center.lon, center.lat] : DEFAULT_FOCUS,
      zoom,
      bearing: 0,
      pitch: 0,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0
    });
    mapRef.current = map;

    const markerEl = document.createElement('div');
    markerEl.style.width = '6px';
    markerEl.style.height = '6px';
    markerEl.style.borderRadius = '999px';
    markerEl.style.background = '#ef4444';
    markerEl.style.boxShadow = '0 0 6px rgba(239, 68, 68, 0.8)';

    markerRef.current = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat(center ? [center.lon, center.lat] : DEFAULT_FOCUS)
      .addTo(map);

    map.on('load', () => {
      map.resize();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildStyle(mapStyle));
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    map.jumpTo({
      center: [center.lon, center.lat],
      zoom,
      bearing: 0,
      pitch: 0
    });
    markerRef.current?.setLngLat([center.lon, center.lat]);
  }, [center?.lat, center?.lon, zoom]);

  return (
    <div className="relative h-40 w-40">
      <div className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 h-[112px] w-[112px] rounded-full overflow-hidden border-2 border-white z-10">
        <div ref={containerRef} className="absolute inset-0 z-0" />
        <div className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-red-400">N</div>
      </div>
      <div
        className="absolute inset-0 rounded-full border-2 border-white/80 pointer-events-none"
        style={{ transform: `rotate(${-bearing}deg)` }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{ transform: `translate(-50%, -50%) rotate(${i * 30}deg)` }}
          >
            <span className="block h-3 w-px bg-white/80" />
          </span>
        ))}
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white">N</span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white">E</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white">S</span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white">W</span>
      </div>
    </div>
  );
};
