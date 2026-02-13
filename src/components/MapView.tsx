import { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef, MouseEvent } from 'react';
import maplibregl, { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Entity } from '@/types/entity';
import { LatLonPoint, MissionWaypoint, SurveyOverlay } from '@/types/mission';
import droneQuadSvg from '@/assets/drone-quadcopter.svg';
import droneFixedSvg from '@/assets/drone-fixedwing.svg';
import roverSvg from '@/assets/rover-ugv.svg';
import vehicleSvg from '@/assets/vehicle-truck.svg';
import { HeadingTape } from './HeadingTape';
import { Home, Camera, Map as MapIcon } from 'lucide-react';

const DEFAULT_FOCUS: [number, number] = [78.9629, 20.5937]; // India region
const DEFAULT_ZOOM = 5.2;
export type BasemapStyle = 'streets' | 'dark' | 'satellite' | 'terrain';
const BASEMAP_SOURCE_ID = 'basemap';
const BASEMAP_LAYER_ID = 'basemap';
const LEGACY_BASEMAP_IDS = ['osm', 'dark', 'satellite', 'terrain'];
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
const basemapPaint: maplibregl.RasterLayerSpecification['paint'] = {
  'raster-fade-duration': 0,
  'raster-opacity': 1
};
const applyBasemapStyle = (map: MapLibreMap, style: BasemapStyle) => {
  if (map.getLayer(BASEMAP_LAYER_ID)) {
    map.removeLayer(BASEMAP_LAYER_ID);
  }
  if (map.getSource(BASEMAP_SOURCE_ID)) {
    map.removeSource(BASEMAP_SOURCE_ID);
  }
  for (const id of LEGACY_BASEMAP_IDS) {
    if (map.getLayer(id)) {
      map.removeLayer(id);
    }
  }
  for (const id of LEGACY_BASEMAP_IDS) {
    if (map.getSource(id)) {
      map.removeSource(id);
    }
  }
  map.addSource(BASEMAP_SOURCE_ID, basemapSources[style]);
  const layers = map.getStyle()?.layers || [];
  const firstNonBackgroundId = layers.find(layer => layer.type !== 'background')?.id;
  map.addLayer({
    id: BASEMAP_LAYER_ID,
    type: 'raster',
    source: BASEMAP_SOURCE_ID,
    paint: basemapPaint
  }, firstNonBackgroundId);
};
const fallbackStyle: maplibregl.StyleSpecification = {
  version: 8,
  name: 'Fallback',
  sources: {},
  layers: [{
    id: 'background',
    type: 'background',
    paint: {
      'background-color': '#0b1220'
    }
  }]
};
const getEntityIconName = (e: Entity) => {
  if (e.type === 'UAV') return e.model_name === 'fixed-wing' ? 'icon-uav-fixed' : 'icon-uav-quad';
  if (e.type === 'UGV') return 'icon-ugv';
  if (e.type === 'Vehicle') return 'icon-vehicle';
  return 'icon-uav-quad';
};
export interface MapViewRef {
  searchLocation: (query: string) => Promise<void>;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
}

interface MapViewProps {
  entities: Entity[];
  followEntity?: string | null;
  onEntityClick?: (entity: Entity) => void;
  mapStyle?: BasemapStyle;
  onMapStyleChange?: (style: BasemapStyle) => void;
  cameraViewActive?: boolean;
  onToggleCameraView?: () => void;
  onBearingChange?: (bearing: number) => void;
  planningEnabled?: boolean;
  missionWaypoints?: MissionWaypoint[];
  onAddWaypoint?: (point: { lon: number; lat: number }) => void;
  onWaypointClick?: (waypoint: MissionWaypoint) => void;
  surveyOverlay?: SurveyOverlay | null;
  surveyEditEnabled?: boolean;
  surveyBoundaryPoints?: LatLonPoint[];
  onSurveyBoundaryChange?: (points: LatLonPoint[]) => void;
  surveyPatternType?: 'grid' | 'corridor' | 'circle';
  showInternationalBorders?: boolean;
  showLineOfControl?: boolean;
  showIndianClaimedBorder?: boolean;
}

export const MapView = forwardRef<MapViewRef, MapViewProps>(({
  entities,
  followEntity,
  onEntityClick,
  mapStyle = 'streets',
  onMapStyleChange,
  cameraViewActive = false,
  onToggleCameraView,
  onBearingChange,
  planningEnabled = false,
  missionWaypoints = [],
  onAddWaypoint,
  onWaypointClick,
  surveyOverlay,
  surveyEditEnabled = false,
  surveyBoundaryPoints = [],
  onSurveyBoundaryChange,
  surveyPatternType = 'grid',
  showInternationalBorders = true,
  showLineOfControl = true,
  showIndianClaimedBorder = true
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const entitiesRef = useRef<Entity[]>([]);
  const introPlayedRef = useRef(false);
  const onEntityClickRef = useRef<typeof onEntityClick>(onEntityClick);
  const surveyBoundaryRef = useRef<LatLonPoint[]>(surveyBoundaryPoints);
  const onSurveyBoundaryChangeRef = useRef<typeof onSurveyBoundaryChange>(onSurveyBoundaryChange);
  const surveyEditEnabledRef = useRef(surveyEditEnabled);
  const surveyPatternTypeRef = useRef(surveyPatternType);
  const surveyPopupRef = useRef<maplibregl.Popup | null>(null);
  const ensureOverlayRef = useRef<null | (() => void)>(null);
  const syncOverlayDataRef = useRef<null | (() => void)>(null);
  const [basemapError, setBasemapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [bearing, setBearing] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [pitch, setPitch] = useState(0);
  const [is3d, setIs3d] = useState(false);
  const [scaleLabel, setScaleLabel] = useState('200 mi');
  const [scaleWidth, setScaleWidth] = useState(80);
  const dragStateRef = useRef<{ type: 'vertex'; index: number } | null>(null);

  useImperativeHandle(ref, () => ({
    searchLocation: async (query: string) => {
      if (!query.trim() || !mapRef.current) return;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const json = await res.json();
        if (json?.length) {
          const hit = json[0];
          mapRef.current.flyTo({
            center: [Number(hit.lon), Number(hit.lat)],
            zoom: 15
          });
        }
      } catch (err) {
        console.error('Search failed', err);
      }
    },
    flyTo: (lng: number, lat: number, zoom = 15) => {
      if (!mapRef.current) return;
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom
      });
    }
  }));
  const computeInitialCenter = (): [number, number] => {
    const initialFollow = followEntity ? entities.find(e => e.entity_id === followEntity) : null;
    if (initialFollow) return [initialFollow.lon, initialFollow.lat];
    if (!entities.length) return DEFAULT_FOCUS;
    const lng = entities.reduce((s, e) => s + e.lon, 0) / entities.length;
    const lat = entities.reduce((s, e) => s + e.lat, 0) / entities.length;
    return [lng, lat];
  };
  const viewRef = useRef<{
    center: [number, number];
    zoom: number;
  }>({
    center: computeInitialCenter(),
    zoom: DEFAULT_ZOOM
  });
  const entitiesGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (followEntity ? entities.filter(e => e.entity_id === followEntity) : []).map(e => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [e.lon, e.lat]
      },
      properties: {
        id: e.entity_id,
        status: e.status,
        heading: e.heading || 0,
        label: `${e.entity_id} · ${e.model_name}`,
        icon: getEntityIconName(e)
      }
    }))
  }), [entities]);
  const missionWaypointsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: missionWaypoints.map((wp, idx) => {
      const role = idx === 0 ? 'start' : (idx === missionWaypoints.length - 1 ? 'end' : 'mid');
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [wp.lon, wp.lat]
        },
        properties: {
          id: wp.id,
          order: idx + 1,
          alt: wp.alt,
          name: wp.name || `WP${idx + 1}`,
          role
        }
      };
    })
  }), [missionWaypoints]);
  const waypointColumnsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const metersToLngLat = (lat: number, meters: number) => {
      const latRad = (lat * Math.PI) / 180;
      const metersPerDegLat = 111320;
      const metersPerDegLon = 111320 * Math.cos(latRad);
      return {
        dLat: meters / metersPerDegLat,
        dLon: meters / metersPerDegLon
      };
    };
    const radiusMeters = 6;
    const segments = 18;
    return {
      type: 'FeatureCollection',
      features: missionWaypoints.map((wp) => {
        const { dLat, dLon } = metersToLngLat(wp.lat, radiusMeters);
        const ring: [number, number][] = Array.from({ length: segments + 1 }, (_, i) => {
          const t = (i / segments) * Math.PI * 2;
          return [wp.lon + Math.cos(t) * dLon, wp.lat + Math.sin(t) * dLat];
        });
        return {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [ring]
          },
          properties: {
            height: (wp.alt || 0) * 0.5
          }
        };
      })
    };
  }, [missionWaypoints]);
  const missionPath = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: missionWaypoints.length > 1 ? [{
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: missionWaypoints.map(wp => [wp.lon, wp.lat])
      },
      properties: {}
    }] : []
  }), [missionWaypoints]);
  const missionPathPipesGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (missionWaypoints.length < 2) {
      return { type: 'FeatureCollection', features: [] };
    }
    const toLocal = (point: { lat: number; lon: number }, origin: { lat: number; lon: number }) => {
      const latRad = origin.lat * Math.PI / 180;
      const metersPerDegLat = 111320;
      const metersPerDegLon = 111320 * Math.cos(latRad);
      return {
        x: (point.lon - origin.lon) * metersPerDegLon,
        y: (point.lat - origin.lat) * metersPerDegLat
      };
    };
    const toGeo = (point: { x: number; y: number }, origin: { lat: number; lon: number }) => {
      const latRad = origin.lat * Math.PI / 180;
      const metersPerDegLat = 111320;
      const metersPerDegLon = 111320 * Math.cos(latRad);
      return {
        lat: origin.lat + (point.y / metersPerDegLat),
        lon: origin.lon + (point.x / metersPerDegLon)
      };
    };
    const pipeWidthMeters = 2.2;
    const features = missionWaypoints.slice(0, -1).map((a, idx) => {
      const b = missionWaypoints[idx + 1];
      const origin = {
        lat: (a.lat + b.lat) / 2,
        lon: (a.lon + b.lon) / 2
      };
      const al = toLocal(a, origin);
      const bl = toLocal(b, origin);
      const dx = bl.x - al.x;
      const dy = bl.y - al.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -(dy / len);
      const ny = dx / len;
      const half = pipeWidthMeters / 2;
      const p1 = { x: al.x + nx * half, y: al.y + ny * half };
      const p2 = { x: al.x - nx * half, y: al.y - ny * half };
      const p3 = { x: bl.x - nx * half, y: bl.y - ny * half };
      const p4 = { x: bl.x + nx * half, y: bl.y + ny * half };
      const ring = [p1, p2, p3, p4, p1].map(p => {
        const geo = toGeo(p, origin);
        return [geo.lon, geo.lat];
      });
      const height = (((a.alt || 0) + (b.alt || 0)) / 2) * 0.5;
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [ring]
        },
        properties: { height }
      };
    });
    return { type: 'FeatureCollection' as const, features };
  }, [missionWaypoints]);
  const maxWaypointHeight = useMemo(() => {
    if (!missionWaypoints.length) return 0;
    return Math.max(...missionWaypoints.map(wp => (wp.alt || 0) * 0.5));
  }, [missionWaypoints]);
  const surveyBoundaryExtrusionGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!surveyOverlay?.boundary?.length || maxWaypointHeight <= 0) {
      return { type: 'FeatureCollection', features: [] };
    }
    const coords = surveyOverlay.boundary.map(p => [p.lon, p.lat]);
    if (coords.length && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
      coords.push(coords[0]);
    }
    return {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords]
        },
        properties: { height: maxWaypointHeight }
      }]
    };
  }, [surveyOverlay, maxWaypointHeight]);
  const surveyGridExtrusionGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!surveyOverlay?.gridLines?.length || maxWaypointHeight <= 0) {
      return { type: 'FeatureCollection', features: [] };
    }
    const lineWidthMeters = 2;
    const toLocal = (point: { lat: number; lon: number }, origin: { lat: number; lon: number }) => {
      const latRad = origin.lat * Math.PI / 180;
      const metersPerDegLat = 111320;
      const metersPerDegLon = 111320 * Math.cos(latRad);
      return {
        x: (point.lon - origin.lon) * metersPerDegLon,
        y: (point.lat - origin.lat) * metersPerDegLat
      };
    };
    const toGeo = (point: { x: number; y: number }, origin: { lat: number; lon: number }) => {
      const latRad = origin.lat * Math.PI / 180;
      const metersPerDegLat = 111320;
      const metersPerDegLon = 111320 * Math.cos(latRad);
      return {
        lat: origin.lat + (point.y / metersPerDegLat),
        lon: origin.lon + (point.x / metersPerDegLon)
      };
    };
    const features = surveyOverlay.gridLines.map((line, idx) => {
      const origin = {
        lat: (line.start.lat + line.end.lat) / 2,
        lon: (line.start.lon + line.end.lon) / 2
      };
      const a = toLocal(line.start, origin);
      const b = toLocal(line.end, origin);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -(dy / len);
      const ny = dx / len;
      const half = lineWidthMeters / 2;
      const p1 = { x: a.x + nx * half, y: a.y + ny * half };
      const p2 = { x: a.x - nx * half, y: a.y - ny * half };
      const p3 = { x: b.x - nx * half, y: b.y - ny * half };
      const p4 = { x: b.x + nx * half, y: b.y + ny * half };
      const ring = [p1, p2, p3, p4, p1].map(p => {
        const geo = toGeo(p, origin);
        return [geo.lon, geo.lat];
      });
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [ring]
        },
        properties: { height: maxWaypointHeight, id: `grid-${idx}` }
      };
    });
    return { type: 'FeatureCollection' as const, features };
  }, [surveyOverlay, maxWaypointHeight]);
  const surveyBoundaryGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    const boundary = surveyOverlay?.boundary?.length
      ? surveyOverlay.boundary
      : (surveyEditEnabled ? surveyBoundaryPoints : []);
    if (!boundary.length || boundary.length < 4) {
      return { type: 'FeatureCollection', features: [] };
    }
    const coords = boundary.map(p => [p.lon, p.lat]);
    // Ensure polygon is closed
    if (coords.length && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
      coords.push(coords[0]);
    }
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coords]
        },
        properties: {}
      }]
    };
  }, [surveyEditEnabled, surveyBoundaryPoints, surveyOverlay]);
  const surveyVertexGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!surveyEditEnabled || surveyBoundaryPoints.length < 1) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: surveyBoundaryPoints.map((p, idx) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.lon, p.lat]
        },
        properties: { index: idx }
      }))
    };
  }, [surveyBoundaryPoints, surveyEditEnabled]);
  const surveyMidpointGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!surveyEditEnabled || surveyPatternType !== 'grid' || surveyBoundaryPoints.length < 4) {
      return { type: 'FeatureCollection', features: [] };
    }
    const pts = surveyBoundaryPoints;
    const features = pts.map((p, idx) => {
      const next = pts[(idx + 1) % pts.length];
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [
            (p.lon + next.lon) / 2,
            (p.lat + next.lat) / 2
          ]
        },
        properties: { edgeIndex: idx }
      };
    });
    return {
      type: 'FeatureCollection' as const,
      features
    };
  }, [surveyBoundaryPoints, surveyEditEnabled, surveyPatternType]);
  const surveyGridGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!surveyOverlay?.gridLines?.length) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: surveyOverlay.gridLines.map((line, idx) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [line.start.lon, line.start.lat],
            [line.end.lon, line.end.lat]
          ]
        },
        properties: { id: `grid-${idx}` }
      }))
    };
  }, [surveyOverlay]);
  const initialCenterRef = useRef<[number, number]>(computeInitialCenter());
  const entitiesGeoJsonRef = useRef(entitiesGeoJson);
  const missionWaypointsGeoJsonRef = useRef(missionWaypointsGeoJson);
  const waypointColumnsGeoJsonRef = useRef(waypointColumnsGeoJson);
  const missionPathRef = useRef(missionPath);
  const missionPathPipesGeoJsonRef = useRef(missionPathPipesGeoJson);
  const surveyBoundaryGeoJsonRef = useRef(surveyBoundaryGeoJson);
  const surveyGridGeoJsonRef = useRef(surveyGridGeoJson);
  const surveyBoundaryExtrusionGeoJsonRef = useRef(surveyBoundaryExtrusionGeoJson);
  const surveyGridExtrusionGeoJsonRef = useRef(surveyGridExtrusionGeoJson);
  const surveyVertexGeoJsonRef = useRef(surveyVertexGeoJson);
  const surveyMidpointGeoJsonRef = useRef(surveyMidpointGeoJson);
  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);
  useEffect(() => {
    entitiesGeoJsonRef.current = entitiesGeoJson;
  }, [entitiesGeoJson]);
  useEffect(() => {
    missionWaypointsGeoJsonRef.current = missionWaypointsGeoJson;
  }, [missionWaypointsGeoJson]);
  useEffect(() => {
    waypointColumnsGeoJsonRef.current = waypointColumnsGeoJson;
  }, [waypointColumnsGeoJson]);
  useEffect(() => {
    missionPathRef.current = missionPath;
  }, [missionPath]);
  useEffect(() => {
    missionPathPipesGeoJsonRef.current = missionPathPipesGeoJson;
  }, [missionPathPipesGeoJson]);
  useEffect(() => {
    surveyBoundaryGeoJsonRef.current = surveyBoundaryGeoJson;
  }, [surveyBoundaryGeoJson]);
  useEffect(() => {
    surveyGridGeoJsonRef.current = surveyGridGeoJson;
  }, [surveyGridGeoJson]);
  useEffect(() => {
    surveyBoundaryExtrusionGeoJsonRef.current = surveyBoundaryExtrusionGeoJson;
  }, [surveyBoundaryExtrusionGeoJson]);
  useEffect(() => {
    surveyGridExtrusionGeoJsonRef.current = surveyGridExtrusionGeoJson;
  }, [surveyGridExtrusionGeoJson]);
  useEffect(() => {
    surveyVertexGeoJsonRef.current = surveyVertexGeoJson;
  }, [surveyVertexGeoJson]);
  useEffect(() => {
    surveyMidpointGeoJsonRef.current = surveyMidpointGeoJson;
  }, [surveyMidpointGeoJson]);
  useEffect(() => {
    surveyBoundaryRef.current = surveyBoundaryPoints;
  }, [surveyBoundaryPoints]);
  useEffect(() => {
    onEntityClickRef.current = onEntityClick;
  }, [onEntityClick]);
  useEffect(() => {
    surveyEditEnabledRef.current = surveyEditEnabled;
  }, [surveyEditEnabled]);
  useEffect(() => {
    surveyPatternTypeRef.current = surveyPatternType;
  }, [surveyPatternType]);
  useEffect(() => {
    onSurveyBoundaryChangeRef.current = onSurveyBoundaryChange;
  }, [onSurveyBoundaryChange]);
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: fallbackStyle,
      center: viewRef.current.center,
      zoom: viewRef.current.zoom,
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: true,
      maxTileCacheSize: 200,
      crossSourceCollisions: false
    });
    mapRef.current = map;
    map.on('move', () => {
      const c = map.getCenter();
      viewRef.current = {
        center: [c.lng, c.lat],
        zoom: map.getZoom()
      };
    });
    const handleRotate = () => {
      const nextBearing = map.getBearing();
      setBearing(nextBearing);
      onBearingChange?.(nextBearing);
    };
    const handlePitch = () => {
      setPitch(map.getPitch());
    };
    const handleZoom = () => {
      setZoomLevel(map.getZoom());
    };
    const updateScale = () => {
      const center = map.getCenter();
      const lat = center.lat;
      const zoom = map.getZoom();
      const metersPerPixel = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
      const maxWidth = 120;
      const milesOptions = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
      let chosenMiles = milesOptions[0];
      let chosenWidth = (chosenMiles * 1609.34) / metersPerPixel;
      for (const miles of milesOptions) {
        const width = (miles * 1609.34) / metersPerPixel;
        if (width <= maxWidth) {
          chosenMiles = miles;
          chosenWidth = width;
        } else {
          break;
        }
      }
      setScaleLabel(`${chosenMiles} mi`);
      setScaleWidth(Math.max(24, Math.min(chosenWidth, maxWidth)));
    };
    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      setCursorCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    const handleMouseLeave = () => {
      setCursorCoords(null);
    };
    setBearing(map.getBearing());
    onBearingChange?.(map.getBearing());
    setZoomLevel(map.getZoom());
    setPitch(map.getPitch());
    map.on('mousemove', handleMouseMove);
    map.on('rotate', handleRotate);
    map.on('pitch', handlePitch);
    map.on('zoom', handleZoom);
    map.on('zoom', updateScale);
    map.on('move', updateScale);
    updateScale();
    map.getCanvas().addEventListener('mouseleave', handleMouseLeave);
    const addIcon = (name: string, url: string) => {
      if (map.hasImage(name)) return;
      map.loadImage(url, (err, image) => {
        if (!err && image) {
          map.addImage(name, image, {
            pixelRatio: 2
          });
          return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          map.addImage(name, img, {
            pixelRatio: 2
          });
        };
        img.src = url;
      });
    };
    const ensureOverlay = () => {
      addIcon('icon-uav-quad', droneQuadSvg);
      addIcon('icon-uav-fixed', droneFixedSvg);
      addIcon('icon-ugv', roverSvg);
      addIcon('icon-vehicle', vehicleSvg);

      // Add India border highlight with neon glow effect (local GeoJSON to avoid CORS)
      if (!map.getSource('india-border')) {
        map.addSource('india-border', {
          type: 'geojson',
          data: '/geo/india.geojson'
        });
      }

      // Add neighboring countries source from Natural Earth (local file)
      if (!map.getSource('countries')) {
        map.addSource('countries', {
          type: 'geojson',
          data: '/geo/countries.geojson'
        });
      }

      // Get first symbol layer to insert borders below labels but above base
      const layers = map.getStyle()?.layers || [];
      let firstSymbolId: string | undefined;
      for (const layer of layers) {
        if (layer.type === 'symbol') {
          firstSymbolId = layer.id;
          break;
        }
      }

      // Neighboring countries with their colors
      const neighbors = [
        { name: 'Pakistan', color: '#ff0000' },
        { name: 'Bangladesh', color: '#9b59b6' },
        { name: 'Nepal', color: '#00ff00' },
        { name: 'China', color: '#ff3333' },
        { name: 'Myanmar', color: '#ff9900' },
        { name: 'Bhutan', color: '#ffff00' },
        { name: 'Sri Lanka', color: '#3498db' },
        { name: 'Afghanistan', color: '#ff66cc' },
      ];

      // Add layers for each neighboring country
      neighbors.forEach(({ name, color }) => {
        const id = name.toLowerCase().replace(' ', '-');
        
        // Outer glow
        if (!map.getLayer(`${id}-glow-2`)) {
          map.addLayer({
            id: `${id}-glow-2`,
            type: 'line',
            source: 'countries',
            filter: ['==', ['get', 'ADMIN'], name],
            paint: {
              'line-color': color,
              'line-width': 10,
              'line-opacity': 0.3,
              'line-blur': 8
            }
          }, firstSymbolId);
        }
        // Inner glow
        if (!map.getLayer(`${id}-glow-1`)) {
          map.addLayer({
            id: `${id}-glow-1`,
            type: 'line',
            source: 'countries',
            filter: ['==', ['get', 'ADMIN'], name],
            paint: {
              'line-color': color,
              'line-width': 5,
              'line-opacity': 0.5,
              'line-blur': 3
            }
          }, firstSymbolId);
        }
        // Core line
        if (!map.getLayer(`${id}-line`)) {
          map.addLayer({
            id: `${id}-line`,
            type: 'line',
            source: 'countries',
            filter: ['==', ['get', 'ADMIN'], name],
            paint: {
              'line-color': color,
              'line-width': 2,
              'line-opacity': 1
            }
          }, firstSymbolId);
        }
        // Country name label
        if (!map.getLayer(`${id}-label`)) {
          map.addLayer({
            id: `${id}-label`,
            type: 'symbol',
            source: 'countries',
            filter: ['==', ['get', 'ADMIN'], name],
            layout: {
              'text-field': ['get', 'ADMIN'],
              'text-size': 14,
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-transform': 'uppercase',
              'text-letter-spacing': 0.1,
              'text-allow-overlap': false
            },
            paint: {
              'text-color': color,
              'text-halo-color': '#0a0a0a',
              'text-halo-width': 2,
              'text-halo-blur': 1
            }
          });
        }
      });

      // India layers (on top)
      // Subtle fill (bottommost)
      if (!map.getLayer('india-border-fill')) {
        map.addLayer({
          id: 'india-border-fill',
          type: 'fill',
          source: 'india-border',
          paint: {
            'fill-color': 'rgba(0, 255, 255, 0.08)'
          }
        }, firstSymbolId);
      }
      // Outer glow layer (widest, most transparent)
      if (!map.getLayer('india-border-glow-3')) {
        map.addLayer({
          id: 'india-border-glow-3',
          type: 'line',
          source: 'india-border',
          paint: {
            'line-color': '#00ffff',
            'line-width': 14,
            'line-opacity': 0.2,
            'line-blur': 10
          }
        }, firstSymbolId);
      }
      // Mid glow layer
      if (!map.getLayer('india-border-glow-2')) {
        map.addLayer({
          id: 'india-border-glow-2',
          type: 'line',
          source: 'india-border',
          paint: {
            'line-color': '#00ffff',
            'line-width': 8,
            'line-opacity': 0.4,
            'line-blur': 5
          }
        }, firstSymbolId);
      }
      // Inner glow layer
      if (!map.getLayer('india-border-glow-1')) {
        map.addLayer({
          id: 'india-border-glow-1',
          type: 'line',
          source: 'india-border',
          paint: {
            'line-color': '#00ffff',
            'line-width': 4,
            'line-opacity': 0.7,
            'line-blur': 2
          }
        }, firstSymbolId);
      }
      // Core neon line (brightest)
      if (!map.getLayer('india-border-line')) {
        map.addLayer({
          id: 'india-border-line',
          type: 'line',
          source: 'india-border',
          paint: {
            'line-color': '#00ffff',
            'line-width': 2,
            'line-opacity': 1
          }
        }, firstSymbolId);
      }

      // Mission planning overlays
      if (!map.getSource('mission-waypoints')) {
        map.addSource('mission-waypoints', {
          type: 'geojson',
          data: missionWaypointsGeoJsonRef.current
        });
      }
      if (!map.getSource('mission-path')) {
        map.addSource('mission-path', {
          type: 'geojson',
          data: missionPathRef.current
        });
      }
      if (!map.getLayer('mission-path-line')) {
        map.addLayer({
          id: 'mission-path-line',
          type: 'line',
          source: 'mission-path',
          paint: {
            'line-color': '#ffaa00',
            'line-width': 3,
            'line-dasharray': [1.5, 1],
            'line-opacity': 0.9
          }
        }, firstSymbolId);
      }
      if (!map.getLayer('mission-path-glow')) {
        map.addLayer({
          id: 'mission-path-glow',
          type: 'line',
          source: 'mission-path',
          paint: {
            'line-color': '#ffaa00',
            'line-width': 8,
            'line-opacity': 0.18,
            'line-blur': 6
          }
        }, firstSymbolId);
      }
      if (!map.getLayer('mission-waypoints-circle')) {
        map.addLayer({
          id: 'mission-waypoints-circle',
          type: 'circle',
          source: 'mission-waypoints',
          paint: {
            'circle-color': ['match', ['get', 'role'], 'start', '#0aff9d', 'end', '#ff6b6b', '#ffc857'],
            'circle-stroke-color': '#0b1220',
            'circle-stroke-width': 2,
            'circle-radius': 7
          }
        });
      }
      if (!map.getLayer('mission-waypoints-label')) {
        map.addLayer({
          id: 'mission-waypoints-label',
          type: 'symbol',
          source: 'mission-waypoints',
          layout: {
            'text-field': ['format', '#', ['get', 'order']],
            'text-size': 11,
            'text-offset': [0, 1.1],
            'text-anchor': 'top'
          },
          paint: {
            'text-color': '#f8fafc',
            'text-halo-color': '#0b1220',
            'text-halo-width': 1.2
          }
        });
      }
      if (!map.getSource('mission-waypoint-columns')) {
        map.addSource('mission-waypoint-columns', {
          type: 'geojson',
          data: waypointColumnsGeoJsonRef.current
        });
      }
      if (!map.getLayer('mission-waypoint-columns')) {
        map.addLayer({
          id: 'mission-waypoint-columns',
          type: 'fill-extrusion',
          source: 'mission-waypoint-columns',
          paint: {
            'fill-extrusion-color': '#f59e0b',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.65
          }
        });
      }
      // Survey overlay (area + grid)
      if (!map.getSource('survey-boundary')) {
        map.addSource('survey-boundary', {
          type: 'geojson',
          data: surveyBoundaryGeoJsonRef.current
        });
      }
      if (!map.getSource('survey-grid')) {
        map.addSource('survey-grid', {
          type: 'geojson',
          data: surveyGridGeoJsonRef.current
        });
      }
      if (!map.getLayer('survey-boundary-fill')) {
        map.addLayer({
          id: 'survey-boundary-fill',
          type: 'fill',
          source: 'survey-boundary',
          paint: {
            'fill-color': '#16a34a',
            'fill-opacity': 0.15
          }
        }, firstSymbolId);
      }
      if (!map.getLayer('survey-boundary-outline')) {
        map.addLayer({
          id: 'survey-boundary-outline',
          type: 'line',
          source: 'survey-boundary',
          paint: {
            'line-color': '#22c55e',
            'line-width': 2,
            'line-dasharray': [1.2, 1]
          }
        }, firstSymbolId);
      }
      if (!map.getLayer('survey-grid-lines')) {
        map.addLayer({
          id: 'survey-grid-lines',
          type: 'line',
          source: 'survey-grid',
          paint: {
            'line-color': '#a7f3d0',
            'line-width': 1.6,
            'line-opacity': 0.85
          }
        }, firstSymbolId);
      }
      if (!map.getSource('mission-path-pipes')) {
        map.addSource('mission-path-pipes', {
          type: 'geojson',
          data: missionPathPipesGeoJsonRef.current
        });
      }
      if (!map.getLayer('mission-path-pipes')) {
        map.addLayer({
          id: 'mission-path-pipes',
          type: 'fill-extrusion',
          source: 'mission-path-pipes',
          paint: {
            'fill-extrusion-color': '#f59e0b',
            'fill-extrusion-height': ['+', ['get', 'height'], 1],
            'fill-extrusion-base': ['get', 'height'],
            'fill-extrusion-opacity': 0.8
          }
        });
      }

      if (!map.getSource('survey-boundary-extrusion')) {
        map.addSource('survey-boundary-extrusion', {
          type: 'geojson',
          data: surveyBoundaryExtrusionGeoJsonRef.current
        });
      }
      if (!map.getSource('survey-grid-extrusion')) {
        map.addSource('survey-grid-extrusion', {
          type: 'geojson',
          data: surveyGridExtrusionGeoJsonRef.current
        });
      }
      if (!map.getLayer('survey-boundary-extrusion')) {
        map.addLayer({
          id: 'survey-boundary-extrusion',
          type: 'fill-extrusion',
          source: 'survey-boundary-extrusion',
          paint: {
            'fill-extrusion-color': '#16a34a',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.22
          }
        });
      }
      if (!map.getLayer('survey-grid-extrusion')) {
        map.addLayer({
          id: 'survey-grid-extrusion',
          type: 'fill-extrusion',
          source: 'survey-grid-extrusion',
          paint: {
            'fill-extrusion-color': '#a7f3d0',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.6
          }
        });
      }

      // Keep waypoint columns below survey overlays and mission paths
      if (map.getLayer('mission-waypoint-columns') && map.getLayer('survey-boundary-extrusion')) {
        map.moveLayer('mission-waypoint-columns', 'survey-boundary-extrusion');
      }
      if (map.getLayer('survey-boundary-extrusion')) {
        map.moveLayer('survey-boundary-extrusion');
      }
      if (map.getLayer('survey-grid-extrusion')) {
        map.moveLayer('survey-grid-extrusion');
      }
      if (map.getLayer('survey-boundary-fill')) {
        map.moveLayer('survey-boundary-fill');
      }
      if (map.getLayer('survey-boundary-outline')) {
        map.moveLayer('survey-boundary-outline');
      }
      if (map.getLayer('survey-grid-lines')) {
        map.moveLayer('survey-grid-lines');
      }
      if (map.getLayer('mission-path-pipes')) {
        map.moveLayer('mission-path-pipes');
      }
      if (map.getLayer('mission-path-glow')) {
        map.moveLayer('mission-path-glow');
      }
      if (map.getLayer('mission-path-line')) {
        map.moveLayer('mission-path-line');
      }

      if (!map.getSource('survey-vertices')) {
        map.addSource('survey-vertices', {
          type: 'geojson',
          data: surveyVertexGeoJsonRef.current
        });
      }
      if (!map.getSource('survey-midpoints')) {
        map.addSource('survey-midpoints', {
          type: 'geojson',
          data: surveyMidpointGeoJsonRef.current
        });
      }
      if (!map.getLayer('survey-vertices-layer')) {
        map.addLayer({
          id: 'survey-vertices-layer',
          type: 'circle',
          source: 'survey-vertices',
          paint: {
            'circle-radius': 6,
            'circle-color': '#0ea5e9',
            'circle-stroke-color': '#0b1220',
            'circle-stroke-width': 2
          }
        });
      }
      if (!map.getLayer('survey-midpoints-layer')) {
        map.addLayer({
          id: 'survey-midpoints-layer',
          type: 'circle',
          source: 'survey-midpoints',
          paint: {
            'circle-radius': 5,
            'circle-color': '#f59e0b',
            'circle-stroke-color': '#0b1220',
            'circle-stroke-width': 1.5
          }
        });
      }

      if (!map.getSource('entities')) {
        map.addSource('entities', {
          type: 'geojson',
          data: entitiesGeoJsonRef.current
        });
      }
      if (!map.getLayer('entities-heat')) {
        map.addLayer({
          id: 'entities-heat',
          type: 'heatmap',
          source: 'entities',
          paint: {
            'heatmap-radius': 25,
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(255,255,255,0)', 0.3, 'rgba(0,180,216,0.2)', 0.6, 'rgba(255,87,34,0.4)', 1, 'rgba(255,23,68,0.6)']
          }
        });
      }
      if (!map.getLayer('entities-symbol')) {
        map.addLayer({
          id: 'entities-symbol',
          type: 'symbol',
          source: 'entities',
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': 0.6,
            'icon-allow-overlap': true,
            'icon-rotate': ['get', 'heading'],
            'icon-rotation-alignment': 'map'
          }
        });
      }
      if (!map.getLayer('entities-label')) {
        map.addLayer({
          id: 'entities-label',
          type: 'symbol',
          source: 'entities',
          layout: {
            'text-field': ['get', 'label'],
            'text-offset': [0, 1.2],
            'text-anchor': 'top',
            'text-size': 11
          },
          paint: {
            'text-color': '#e2e8f0',
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.2
          }
        });
      }
      if (!map.listens('click')) {
        map.on('click', 'entities-symbol', e => {
          const feature = e.features?.[0];
          const id = feature?.properties?.id as string | undefined;
          const clickHandler = onEntityClickRef.current;
          if (id && clickHandler) {
            const ent = entitiesRef.current.find(en => en.entity_id === id);
            if (ent) clickHandler(ent);
          }
        });
      }
      const src = map.getSource('entities') as GeoJSONSource | undefined;
      if (src) src.setData(entitiesGeoJsonRef.current);
    };
    const syncOverlayData = () => {
      const entitiesSrc = map.getSource('entities') as GeoJSONSource | undefined;
      if (entitiesSrc) entitiesSrc.setData(entitiesGeoJsonRef.current);
      const waypointSrc = map.getSource('mission-waypoints') as GeoJSONSource | undefined;
      if (waypointSrc) waypointSrc.setData(missionWaypointsGeoJsonRef.current);
      const pathSrc = map.getSource('mission-path') as GeoJSONSource | undefined;
      if (pathSrc) pathSrc.setData(missionPathRef.current);
      const columnSrc = map.getSource('mission-waypoint-columns') as GeoJSONSource | undefined;
      if (columnSrc) columnSrc.setData(waypointColumnsGeoJsonRef.current);
      const pipeSrc = map.getSource('mission-path-pipes') as GeoJSONSource | undefined;
      if (pipeSrc) pipeSrc.setData(missionPathPipesGeoJsonRef.current);
      const boundarySrc = map.getSource('survey-boundary') as GeoJSONSource | undefined;
      if (boundarySrc) boundarySrc.setData(surveyBoundaryGeoJsonRef.current);
      const gridSrc = map.getSource('survey-grid') as GeoJSONSource | undefined;
      if (gridSrc) gridSrc.setData(surveyGridGeoJsonRef.current);
      const boundaryExtrudeSrc = map.getSource('survey-boundary-extrusion') as GeoJSONSource | undefined;
      if (boundaryExtrudeSrc) boundaryExtrudeSrc.setData(surveyBoundaryExtrusionGeoJsonRef.current);
      const gridExtrudeSrc = map.getSource('survey-grid-extrusion') as GeoJSONSource | undefined;
      if (gridExtrudeSrc) gridExtrudeSrc.setData(surveyGridExtrusionGeoJsonRef.current);
      const vertexSrc = map.getSource('survey-vertices') as GeoJSONSource | undefined;
      if (vertexSrc) vertexSrc.setData(surveyVertexGeoJsonRef.current);
      const midpointSrc = map.getSource('survey-midpoints') as GeoJSONSource | undefined;
      if (midpointSrc) midpointSrc.setData(surveyMidpointGeoJsonRef.current);
    };
    ensureOverlayRef.current = ensureOverlay;
    syncOverlayDataRef.current = syncOverlayData;
    const runIntro = () => {
      if (introPlayedRef.current) return;
      introPlayedRef.current = true;
      map.stop();
      const setProjection = (map as any).setProjection;
      if (typeof setProjection === 'function') {
        setProjection.call(map, { name: 'globe' });
      }
      map.jumpTo({
        center: [0, 0],
        zoom: 1.2,
        pitch: 0,
        bearing: 0
      });
      map.easeTo({
        center: DEFAULT_FOCUS,
        zoom: DEFAULT_ZOOM,
        pitch: 45,
        bearing: 20,
        duration: 2800,
        easing: t => 1 - Math.pow(1 - t, 2),
        essential: true
      });
      map.once('moveend', () => {
        map.easeTo({
          pitch: 0,
          bearing: 0,
          duration: 600,
          essential: true
        });
      });
      viewRef.current = {
        center: DEFAULT_FOCUS,
        zoom: DEFAULT_ZOOM
      };
    };
    const bindSurveyHandlers = () => {
      if (!onSurveyBoundaryChangeRef.current) return;
      if (!surveyPopupRef.current) {
        surveyPopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12
        });
      }
      const popup = surveyPopupRef.current;
      const handleVertexDown = (e: maplibregl.MapLayerMouseEvent) => {
        if (!surveyEditEnabledRef.current) return;
        const feature = e.features?.[0];
        const index = Number(feature?.properties?.index);
        if (!Number.isFinite(index)) return;
        dragStateRef.current = { type: 'vertex', index };
        map.dragPan.disable();
      };
      const handleMidpointDown = (e: maplibregl.MapLayerMouseEvent) => {
        if (!surveyEditEnabledRef.current) return;
        const feature = e.features?.[0];
        const edgeIndex = Number(feature?.properties?.edgeIndex);
        if (!Number.isFinite(edgeIndex)) return;
        const current = surveyBoundaryRef.current;
        if (current.length < 4) return;
        const insertIndex = edgeIndex + 1;
        const lngLat = e.lngLat;
        const next = [...current];
        next.splice(insertIndex, 0, { lat: lngLat.lat, lon: lngLat.lng });
        onSurveyBoundaryChangeRef.current?.(next);
        dragStateRef.current = { type: 'vertex', index: insertIndex };
        map.dragPan.disable();
      };
      const handleMove = (e: maplibregl.MapMouseEvent) => {
        if (!surveyEditEnabledRef.current) return;
        if (!dragStateRef.current) return;
        const idx = dragStateRef.current.index;
        const current = surveyBoundaryRef.current;
        if (!current[idx]) return;
        const next = current.map((p, i) => i === idx ? { lat: e.lngLat.lat, lon: e.lngLat.lng } : p);
        onSurveyBoundaryChangeRef.current?.(next);
      };
      const handleUp = () => {
        if (dragStateRef.current) {
          dragStateRef.current = null;
          map.dragPan.enable();
        }
      };
      const handleMidpointEnter = (e: maplibregl.MapLayerMouseEvent) => {
        if (!surveyEditEnabledRef.current) return;
        map.getCanvas().style.cursor = 'pointer';
        popup
          .setLngLat(e.lngLat)
          .setText('Add point here')
          .addTo(map);
      };
      const handleMidpointLeave = () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      };

      map.off('mousedown', 'survey-vertices-layer', handleVertexDown);
      map.off('mousedown', 'survey-midpoints-layer', handleMidpointDown);
      map.off('mousemove', handleMove);
      map.off('mouseup', handleUp);
      map.off('mouseleave', handleUp);
      map.off('mouseenter', 'survey-midpoints-layer', handleMidpointEnter);
      map.off('mouseleave', 'survey-midpoints-layer', handleMidpointLeave);

      map.on('mousedown', 'survey-vertices-layer', handleVertexDown);
      map.on('mousedown', 'survey-midpoints-layer', handleMidpointDown);
      map.on('mousemove', handleMove);
      map.on('mouseup', handleUp);
      map.on('mouseleave', handleUp);
      map.on('mouseenter', 'survey-midpoints-layer', handleMidpointEnter);
      map.on('mouseleave', 'survey-midpoints-layer', handleMidpointLeave);
    };
    // Show the map as soon as the first frame is rendered (avoids fade flicker)
    map.once('render', () => {
      setMapReady(true);
    });

    map.on('load', () => {
      applyBasemapStyle(map, mapStyle);
      ensureOverlay();
      syncOverlayData();
      runIntro();
      bindSurveyHandlers();
    });
    // Re-add overlays after a basemap switch (setStyle) and keep globe projection
    map.on('style.load', () => {
      ensureOverlay();
      syncOverlayData();
       const setProjection = (map as any).setProjection;
       if (typeof setProjection === 'function') {
         setProjection.call(map, { name: 'globe' });
       }
       bindSurveyHandlers();
    });
    map.on('error', () => {
      setBasemapError(true);
    });
    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('rotate', handleRotate);
      map.off('pitch', handlePitch);
      map.off('zoom', handleZoom);
      map.off('zoom', updateScale);
      map.off('move', updateScale);
      map.getCanvas().removeEventListener('mouseleave', handleMouseLeave);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync map style when prop changes - only when style actually changes
  const prevStyleRef = useRef<BasemapStyle>(mapStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || prevStyleRef.current === mapStyle) return;
    prevStyleRef.current = mapStyle;
    setBasemapError(false);
    applyBasemapStyle(map, mapStyle);
  }, [mapStyle]);

  // sync data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('entities') as GeoJSONSource | undefined;
    if (src) src.setData(entitiesGeoJson);
  }, [entitiesGeoJson]);

  // sync mission planning overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const waypointSrc = map.getSource('mission-waypoints') as GeoJSONSource | undefined;
    const pathSrc = map.getSource('mission-path') as GeoJSONSource | undefined;
    const columnSrc = map.getSource('mission-waypoint-columns') as GeoJSONSource | undefined;
    const pipeSrc = map.getSource('mission-path-pipes') as GeoJSONSource | undefined;
    if (waypointSrc) waypointSrc.setData(missionWaypointsGeoJson);
    if (pathSrc) pathSrc.setData(missionPath);
    if (columnSrc) columnSrc.setData(waypointColumnsGeoJson);
    if (pipeSrc) pipeSrc.setData(missionPathPipesGeoJson);
  }, [missionPath, missionWaypointsGeoJson, waypointColumnsGeoJson, missionPathPipesGeoJson]);

  // sync survey overlay (boundary + grid)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const boundarySrc = map.getSource('survey-boundary') as GeoJSONSource | undefined;
    const gridSrc = map.getSource('survey-grid') as GeoJSONSource | undefined;
    const boundaryExtrudeSrc = map.getSource('survey-boundary-extrusion') as GeoJSONSource | undefined;
    const gridExtrudeSrc = map.getSource('survey-grid-extrusion') as GeoJSONSource | undefined;
    if (boundarySrc) boundarySrc.setData(surveyBoundaryGeoJson);
    if (gridSrc) gridSrc.setData(surveyGridGeoJson);
    if (boundaryExtrudeSrc) boundaryExtrudeSrc.setData(surveyBoundaryExtrusionGeoJson);
    if (gridExtrudeSrc) gridExtrudeSrc.setData(surveyGridExtrusionGeoJson);
  }, [surveyBoundaryGeoJson, surveyGridGeoJson, surveyBoundaryExtrusionGeoJson, surveyGridExtrusionGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vertexSrc = map.getSource('survey-vertices') as GeoJSONSource | undefined;
    const midpointSrc = map.getSource('survey-midpoints') as GeoJSONSource | undefined;
    if (vertexSrc) vertexSrc.setData(surveyVertexGeoJson);
    if (midpointSrc) midpointSrc.setData(surveyMidpointGeoJson);
  }, [surveyVertexGeoJson, surveyMidpointGeoJson]);

  // Toggle international borders visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    
    const neighbors = ['pakistan', 'bangladesh', 'nepal', 'china', 'myanmar', 'bhutan', 'sri-lanka', 'afghanistan'];
    const visibility = showInternationalBorders ? 'visible' : 'none';
    
    neighbors.forEach(id => {
      const layerIds = [`${id}-glow-2`, `${id}-glow-1`, `${id}-line`, `${id}-label`];
      layerIds.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      });
    });
  }, [showInternationalBorders, mapReady]);

  // Toggle Line of Control visibility (specific LOC layers if any)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    
    const visibility = showLineOfControl ? 'visible' : 'none';
    // Add specific LOC layers here if you have them separate from India border
    // For now this is a placeholder for future LOC-specific layers
  }, [showLineOfControl, mapReady]);

  // Toggle Indian Actual Claimed Border (India GeoJSON overlay) visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    
    const visibility = showIndianClaimedBorder ? 'visible' : 'none';
    const indiaBorderLayers = [
      'india-border-fill',
      'india-border-glow-3',
      'india-border-glow-2',
      'india-border-glow-1',
      'india-border-line'
    ];
    
    indiaBorderLayers.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  }, [showIndianClaimedBorder, mapReady]);

  // follow entity once on change; allow manual pan/zoom afterward
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followEntity) return;
    const target = entitiesRef.current.find(e => e.entity_id === followEntity);
    if (!target) return;
    map.stop();
    map.easeTo({
      center: [target.lon, target.lat],
      zoom: viewRef.current.zoom,
      duration: 800
    });
    // after first ease, keep view state aligned with manual changes
    viewRef.current = {
      center: [target.lon, target.lat],
      zoom: viewRef.current.zoom
    };
  }, [followEntity]);

  // mission planning: add waypoint on map click
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onAddWaypoint) return;
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!planningEnabled) return;
      if (surveyEditEnabledRef.current && onSurveyBoundaryChangeRef.current) {
        const current = surveyBoundaryRef.current;
        const pattern = surveyPatternTypeRef.current;
        const maxPoints = pattern === 'circle' ? 2 : (pattern === 'corridor' ? 2 : 4);
        if (current.length >= maxPoints) return;
        const next = [...current, { lat: e.lngLat.lat, lon: e.lngLat.lng }];
        onSurveyBoundaryChangeRef.current(next);
        return;
      }
      const hitWaypoint = map.queryRenderedFeatures(e.point, { layers: ['mission-waypoints-circle'] });
      if (hitWaypoint.length) return;
      onAddWaypoint({ lon: e.lngLat.lng, lat: e.lngLat.lat });
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [onAddWaypoint, planningEnabled]);

  // mission planning: waypoint click to focus/select
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onWaypointClick) return;
    if (!map.getLayer('mission-waypoints-circle')) return;
    const handleWaypointClick = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      const id = feature?.properties?.id as string | undefined;
      if (!id) return;
      const found = missionWaypoints.find(wp => wp.id === id);
      if (found) onWaypointClick(found);
    };
    map.on('click', 'mission-waypoints-circle', handleWaypointClick);
    return () => {
      map.off('click', 'mission-waypoints-circle', handleWaypointClick);
    };
  }, [missionWaypoints, onWaypointClick]);

  const handleToggle3d = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3d;
    setIs3d(next);
    map.easeTo({
      pitch: next ? 45 : 0,
      duration: 500
    });
  };

  const handleResetNorth = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ bearing: 0, duration: 400 });
  };

  const handleHome = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: DEFAULT_FOCUS,
      zoom: DEFAULT_ZOOM,
      duration: 500
    });
    viewRef.current = {
      center: DEFAULT_FOCUS,
      zoom: DEFAULT_ZOOM
    };
  };

  const handleZoomIn = () => {
    mapRef.current?.zoomIn({ duration: 250 });
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut({ duration: 250 });
  };

  const handleZoomTrackClick = (event: MouseEvent<HTMLDivElement>) => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const ratio = Math.min(Math.max(x / bounds.width, 0), 1);
    const minZoom = map.getMinZoom();
    const maxZoom = map.getMaxZoom();
    const nextZoom = minZoom + ratio * (maxZoom - minZoom);
    map.easeTo({ zoom: nextZoom, duration: 200 });
  };

  const minZoom = mapRef.current?.getMinZoom() ?? 0;
  const maxZoom = mapRef.current?.getMaxZoom() ?? 22;
  const zoomRatio = Math.min(Math.max((zoomLevel - minZoom) / (maxZoom - minZoom), 0), 1);
  return (
    <div className="map-canvas w-full h-full relative bg-gradient-dark overflow-hidden rounded-lg">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Fade overlay (keeps map rendering stable; prevents visible flicker) */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-dark transition-opacity duration-500 ease-out ${mapReady ? 'opacity-0' : 'opacity-100'}`}
      />

      {/* Heading Tape - shows when 3D mode is active */}
      {is3d && <HeadingTape bearing={bearing} />}

      {cursorCoords && (
        <div className="map-cursor absolute z-10 rounded-md border border-white/10 bg-black/60 px-3 py-2 text-[11px] text-slate-100 shadow-sm">
          <div className="text-[10px] uppercase tracking-wide text-slate-300">Cursor</div>
          <div>{cursorCoords.lat.toFixed(5)}, {cursorCoords.lon.toFixed(5)}</div>
        </div>
      )}

      <div className="absolute z-10 bottom-4 right-4 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleToggle3d}
          className={`h-9 w-9 rounded-md border text-[11px] font-semibold ${is3d ? 'border-red-400 text-white bg-red-500/20' : 'border-white/10 text-slate-200 bg-black/60'}`}
        >
          3D
        </button>
        <div className="relative mt-5">
          {/* North indicator outside compass */}
          <span
            className="absolute left-1/2 -top-5 -translate-x-1/2 text-[10px] font-bold text-red-500"
            style={{ transform: `translateX(-50%) rotate(${-bearing}deg)`, transformOrigin: 'center 52px' }}
          >
            N
          </span>
          <button
            type="button"
            onClick={handleResetNorth}
            className="relative h-16 w-16 rounded-full border border-white/20 bg-black/70 text-slate-100"
            aria-label="Reset north"
          >
            {/* Tick marks around compass */}
            <span
              className="absolute inset-0"
              style={{ transform: `rotate(${-bearing}deg)` }}
            >
              {Array.from({ length: 36 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute left-1/2 origin-bottom"
                  style={{
                    transform: `translateX(-50%) rotate(${i * 10}deg)`,
                    height: '50%',
                    top: 0,
                  }}
                >
                  <span
                    className={`absolute top-0 left-1/2 -translate-x-1/2 ${
                      i % 9 === 0 ? 'h-2 w-0.5 bg-white/80' : 'h-1.5 w-px bg-white/40'
                    }`}
                  />
                </span>
              ))}
            </span>
            {/* Center degree display */}
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">
              {Math.round(((bearing % 360) + 360) % 360)}°
            </span>
          </button>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center rounded-md border border-white/10 bg-black/60">
            <button
              type="button"
              onClick={onToggleCameraView}
              className="h-8 w-8 text-slate-100"
              aria-label={cameraViewActive ? 'Show map' : 'Show camera'}
            >
              {cameraViewActive ? <MapIcon className="h-4 w-4 mx-auto" /> : <Camera className="h-4 w-4 mx-auto" />}
            </button>
          </div>
          <div className="flex items-center rounded-md border border-white/10 bg-black/60">
            <button
              type="button"
              onClick={handleHome}
              className="h-8 w-8 text-slate-100"
              aria-label="Home"
            >
              <Home className="h-4 w-4 mx-auto" />
            </button>
          </div>
        </div>
      </div>
      <div className="absolute z-10 bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/60 px-2 py-0 h-7">
          <button type="button" onClick={handleZoomOut} className="h-7 w-7 text-lg text-slate-100">-</button>
          <div className="relative h-px w-36" onClick={handleZoomTrackClick}>
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/30" />
            <div
              className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white/80"
              style={{ left: `${zoomRatio * 100}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>
          <button type="button" onClick={handleZoomIn} className="h-7 w-7 text-lg text-slate-100">+</button>
          <span className="text-[10px] text-slate-200 tabular-nums min-w-[36px] text-right">
            {zoomLevel.toFixed(1)}x
          </span>
        </div>
        <div className="flex flex-col items-start justify-center gap-1 rounded-md border border-white/10 bg-black/60 px-2 py-0 h-7">
          <span className="text-[10px] text-slate-200">{scaleLabel}</span>
          <div className="h-1 rounded-sm bg-white/70" style={{ width: `${scaleWidth}px` }} />
        </div>
      </div>
    </div>
  );
});
