import { useEffect, useState, useRef, useMemo } from 'react';
import { useChaoxStream } from '@/hooks/useChaoxStream';
import { useMockEntities } from '@/hooks/useMockEntities';
import { CanvasToolbar } from './CanvasToolbar';
import { MapView, BasemapStyle, MapViewRef } from './MapView';
import { MiniMap } from './MiniMap';
import { LatLonPoint, MissionWaypoint, SurveyOverlay } from '@/types/mission';
import { SurveyConfig } from './SurveyPatternPanel';
import { useToast } from '@/hooks/use-toast';
import { MissionPlannerPanel } from './MissionPlannerPanel';
import { VehicleDomain } from '@/types/entity';


interface MissionCanvasProps {
  selectedEntity: string | null;
  onEntitySelect: (entityId: string) => void;
  onEntitiesUpdate: (entities: any[]) => void;
  offlineDrawActive?: boolean;
  offlineBBox?: { west: number; south: number; east: number; north: number } | null;
  onOfflineBBoxChange?: (bbox: { west: number; south: number; east: number; north: number } | null) => void;
  onOfflineDrawActiveChange?: (active: boolean) => void;
  onMapZoomChange?: (zoom: number) => void;
  onRegisterSnapshot?: (fn: () => string | null) => void;
  budgetBBox?: { west: number; south: number; east: number; north: number } | null;
}

type PlannerMission = {
  id: string;
  name: string;
  description: string;
  typeId: string;
  status: string;
  asset: string;
  waypoints: MissionWaypoint[];
  cruiseSpeed: number;
};

type PlannerOperation = {
  id: string;
  name: string;
  missions: PlannerMission[];
};

const initialOperations: PlannerOperation[] = [
  {
    id: 'op-1',
    name: 'Border ISR Sector 3',
    missions: [
      {
        id: 'mission-1',
        name: 'Northern Perimeter Scan',
        description: 'Patrol northern border segment',
        typeId: 'perimeter-patrol',
        status: 'Ready',
        asset: 'UAV-001',
        waypoints: [],
        cruiseSpeed: 15,
      },
      {
        id: 'mission-2',
        name: 'Grid Search Alpha',
        description: 'Systematic area coverage',
        typeId: 'area-search',
        status: 'Draft',
        asset: 'UAV-002',
        waypoints: [],
        cruiseSpeed: 15,
      },
    ],
  },
  {
    id: 'op-2',
    name: 'Maritime Surveillance',
    missions: [
      {
        id: 'mission-3',
        name: 'Harbor Watch',
        description: 'Monitor harbor entrance',
        typeId: 'loiter-observe',
        status: 'Ready',
        asset: 'USV-001',
        waypoints: [],
        cruiseSpeed: 12,
      },
    ],
  },
];

const API_BASE = import.meta.env.VITE_CHAOX_API_BASE || 'http://localhost:9000';

// Helper to derive domain from entity type
const getEntityDomain = (type: string): VehicleDomain => {
  switch (type) {
    case 'UAV':
      return 'air';
    case 'UGV':
    case 'Vehicle':
      return 'land';
    case 'USV':
    case 'UUV':
      return 'water';
    case 'Satellite':
      return 'space';
    default:
      return 'air';
  }
};

export const MissionCanvas = ({
  selectedEntity,
  onEntitySelect,
  onEntitiesUpdate,
  offlineDrawActive = false,
  offlineBBox = null,
  onOfflineBBoxChange,
  onOfflineDrawActiveChange,
  onMapZoomChange,
  onRegisterSnapshot,
  budgetBBox
}: MissionCanvasProps) => {
  const [mapStyle, setMapStyle] = useState<BasemapStyle>('streets');
  const [operations, setOperations] = useState<PlannerOperation[]>(initialOperations);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(initialOperations[0]?.id ?? null);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(initialOperations[0]?.missions[0]?.id ?? null);
  const [planningEnabledByMission, setPlanningEnabledByMission] = useState<Record<string, boolean>>({});
  const [surveyBoundaryPoints, setSurveyBoundaryPoints] = useState<LatLonPoint[]>([]);
  const [surveyOverlay, setSurveyOverlay] = useState<SurveyOverlay | null>(null);
  const [lastPreviewConfig, setLastPreviewConfig] = useState<SurveyConfig | null>(null);
  const [surveyEditMode, setSurveyEditMode] = useState(false);
  const [showInternationalBorders, setShowInternationalBorders] = useState(true);
  const [showLineOfControl, setShowLineOfControl] = useState(true);
  const [showIndianClaimedBorder, setShowIndianClaimedBorder] = useState(true);
  const [surveyConfig, setSurveyConfig] = useState<SurveyConfig>({
    patternType: 'grid',
    cameraType: 'manual',
    altitude: 100,
    triggerDistance: 50,
    spacing: 60,
    angle: 0,
    turnaroundDist: 10,
    corridorWidth: 200,
    circleRadius: 150,
    hoverAndCapture: false,
    reflyAt90: false,
    imagesInTurnarounds: false,
    relativeAltitude: true,
  });
  const mapRef = useRef<MapViewRef>(null);
  const {
    entities: liveEntities,
    connected,
    missionPlan
  } = useChaoxStream();
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const mockEntities = useMockEntities();
  const { toast } = useToast();
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [showCameraMain, setShowCameraMain] = useState(false);
  const [mapBearing, setMapBearing] = useState(0);
  const [mainFeed, setMainFeed] = useState<'primary' | 'aux'>('primary');
  const [mapMarkers, setMapMarkers] = useState<LatLonPoint[]>([]);
  const [homeLocation, setHomeLocation] = useState<LatLonPoint | null>(null);
  const [homePlacementMode, setHomePlacementMode] = useState(false);
  const loadingPlannerRef = useRef(false);

  // Use mock entities if not connected, otherwise use live entities
  const entities = connected ? liveEntities : mockEntities;

  const selectedOperation = useMemo(() => {
    return operations.find(op => op.id === selectedOperationId) || null;
  }, [operations, selectedOperationId]);

  const activeMission = useMemo(() => {
    return selectedOperation?.missions.find(m => m.id === selectedMissionId) || null;
  }, [selectedOperation, selectedMissionId]);

  const missionWaypoints = activeMission?.waypoints ?? [];
  const defaultAirspeed = activeMission?.cruiseSpeed ?? 15;
  const planningEnabled = activeMission ? (planningEnabledByMission[activeMission.id] ?? false) : false;

  // Get the selected entity's domain
  const selectedEntityData = useMemo(() => {
    if (!selectedEntity) return null;
    return entities.find(e => e.entity_id === selectedEntity) || null;
  }, [selectedEntity, entities]);

  const vehicleDomain: VehicleDomain = useMemo(() => {
    if (!selectedEntityData) return 'air';
    return selectedEntityData.domain || getEntityDomain(selectedEntityData.type);
  }, [selectedEntityData]);

  const selectedCallsign = selectedEntityData?.entity_id || 'No asset selected';
  const miniMapCenter = selectedEntityData
    ? { lat: selectedEntityData.lat, lon: selectedEntityData.lon }
    : null;

  useEffect(() => {
    setMainFeed('primary');
  }, [selectedEntity]);

  const connectionInfo = useMemo(() => {
    const meta = selectedEntityData?.metadata as Record<string, any> | undefined;
    if (meta?.comm_port) return `COM ${meta.comm_port}`;
    if (meta?.link) return String(meta.link);
    if (meta?.carrier) return String(meta.carrier);
    if (connected) return import.meta.env.VITE_CHAOX_WS_BASE || 'ws://localhost:9000';
    return 'DEMO';
  }, [selectedEntityData, connected]);

  // Update parent component with entities
  useEffect(() => {
    onEntitiesUpdate(entities);
  }, [entities, onEntitiesUpdate]);

  const refreshPlannerState = async () => {
    if (loadingPlannerRef.current) return;
    loadingPlannerRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/planner/state`);
      if (!res.ok) throw new Error('Failed to load planner state');
      const data = await res.json();
      const nextOperations: PlannerOperation[] = data?.operations || [];
      if (!nextOperations.length) return;
      setOperations(nextOperations);
      setSelectedOperationId(prev => {
        if (prev && nextOperations.some(op => op.id === prev)) return prev;
        return nextOperations[0]?.id ?? null;
      });
      setSelectedMissionId(prev => {
        if (prev && nextOperations.some(op => op.missions.some(m => m.id === prev))) return prev;
        const firstOp = nextOperations[0];
        return firstOp?.missions[0]?.id ?? null;
      });
    } catch (err) {
      // Keep local fallback if backend is unavailable.
    } finally {
      loadingPlannerRef.current = false;
    }
  };

  const handleLocationSearch = (query: string) => {
    mapRef.current?.searchLocation(query);
  };

  const getReferencePoint = (): LatLonPoint | null => {
    return mapRef.current?.getReferencePoint() ?? null;
  };

  const handleAddMarker = () => {
    const point = getReferencePoint();
    if (!point) {
      toast({ title: 'No map point available', description: 'Move cursor over the map and try again.' });
      return;
    }
    setMapMarkers(prev => [...prev, point]);
    toast({
      title: 'Marker added',
      description: `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`
    });
  };

  const handleSetHomeLocation = () => {
    setHomePlacementMode(true);
    toast({
      title: 'Home placement active',
      description: 'Move cursor on map, then press Enter to confirm home. Press Esc to cancel.'
    });
  };

  const handleCopyLatLong = async () => {
    const point = getReferencePoint();
    if (!point) {
      toast({ title: 'No map point available', description: 'Move cursor over the map and try again.' });
      return;
    }
    const value = `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Coordinates copied', description: value });
    } catch {
      toast({ title: 'Copy failed', description: value, variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (!homePlacementMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setHomePlacementMode(false);
        toast({ title: 'Home placement cancelled' });
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const point = getReferencePoint();
      if (!point) {
        toast({ title: 'No map point available', description: 'Move cursor over the map and try again.' });
        return;
      }
      setHomeLocation(point);
      setHomePlacementMode(false);
      toast({
        title: 'Home location confirmed',
        description: `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [homePlacementMode]);

  const issueCommand = async (cmd: 'arm' | 'takeoff' | 'land' | 'rtl' | 'mode', params?: Record<string, any>) => {
    try {
      setCommandStatus(`Sending ${cmd}...`);
      const res = await fetch(`${API_BASE}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_id: selectedEntity || 'vehicle-1',
          command: cmd,
          params
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Command failed');
      setCommandStatus(`Command ${cmd} ok`);
      setTimeout(() => setCommandStatus(null), 2000);
    } catch (err: any) {
      setCommandStatus(`Command ${cmd} failed: ${err?.message || err}`);
    }
  };

  const resetOverlay = () => setSurveyOverlay(null);
  const clearPreview = () => setLastPreviewConfig(null);

  useEffect(() => {
    if (!selectedOperation) return;
    if (selectedMissionId && selectedOperation.missions.some(m => m.id === selectedMissionId)) return;
    setSelectedMissionId(selectedOperation.missions[0]?.id ?? null);
  }, [selectedOperation, selectedMissionId]);

  useEffect(() => {
    resetOverlay();
    clearPreview();
    setSurveyBoundaryPoints([]);
    setSurveyEditMode(false);
  }, [selectedMissionId]);

  const updateMission = (missionId: string, updates: Partial<PlannerMission>) => {
    setOperations(prev => prev.map(op => ({
      ...op,
      missions: op.missions.map(mission => (
        mission.id === missionId ? { ...mission, ...updates } : mission
      ))
    })));
  };

  const persistMissionUpdate = async (missionId: string, updates: Partial<PlannerMission>) => {
    try {
      await fetch(`${API_BASE}/missions/${missionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: updates.name,
          description: updates.description,
          typeId: updates.typeId,
          status: updates.status,
          asset: updates.asset,
          cruiseSpeed: updates.cruiseSpeed
        })
      });
    } catch (err) {
      // Non-blocking; UI already updated.
    }
  };

  const persistWaypoints = async (missionId: string, waypoints: MissionWaypoint[]) => {
    try {
      const res = await fetch(`${API_BASE}/missions/${missionId}/waypoints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: waypoints.map((wp, idx) => ({
            id: wp.id,
            seq: idx,
            name: wp.name,
            lat: wp.lat,
            lon: wp.lon,
            alt: wp.alt
          }))
        })
      });
      if (!res.ok) throw new Error('Waypoint sync failed');
      const json = await res.json();
      if (json?.items) {
        updateMission(missionId, {
          waypoints: json.items.map((wp: any) => ({
            id: wp.id,
            name: wp.name,
            lat: wp.lat,
            lon: wp.lon,
            alt: wp.alt
          }))
        });
      }
    } catch (err) {
      // Non-blocking; UI already updated.
    }
  };

  const updateMissionWaypoints = (
    missionId: string,
    waypoints: MissionWaypoint[],
    options?: { persist?: boolean }
  ) => {
    updateMission(missionId, { waypoints });
    if (options?.persist === false) return;
    void persistWaypoints(missionId, waypoints);
  };

  const ensureActiveMissionId = () => {
    if (activeMission) return activeMission.id;
    const fallbackId = selectedOperation?.missions[0]?.id ?? null;
    if (fallbackId) {
      setSelectedMissionId(fallbackId);
    }
    return fallbackId;
  };

  const handleSelectOperation = (id: string) => {
    setSelectedOperationId(id);
  };

  const handleSelectMission = (id: string) => {
    setSelectedMissionId(id);
  };

  const handleCreateOperation = (name: string) => {
    const create = async () => {
      try {
        const res = await fetch(`${API_BASE}/operations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (!res.ok) throw new Error('Create operation failed');
        const json = await res.json();
        const newOp: PlannerOperation = {
          id: json.id,
          name: json.name,
          missions: []
        };
        setOperations(prev => [...prev, newOp]);
        setSelectedOperationId(newOp.id);
        setSelectedMissionId(null);
      } catch (err: any) {
        toast({ title: 'Operation failed', description: err?.message || String(err), variant: 'destructive' });
      }
    };
    void create();
  };

  const handleCreateMission = (name: string, typeId: string) => {
    if (!selectedOperationId) return;
    const create = async () => {
      try {
        const res = await fetch(`${API_BASE}/operations/${selectedOperationId}/missions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, typeId })
        });
        if (!res.ok) throw new Error('Create mission failed');
        const json = await res.json();
        const newMission: PlannerMission = {
          id: json.id,
          name: json.name,
          description: json.description || '',
          typeId: json.typeId,
          status: json.status || 'Draft',
          asset: json.asset || 'Unassigned',
          waypoints: json.waypoints || [],
          cruiseSpeed: json.cruiseSpeed || 15
        };
        setOperations(prev => prev.map(op => (
          op.id === selectedOperationId
            ? { ...op, missions: [...op.missions, newMission] }
            : op
        )));
        setSelectedMissionId(newMission.id);
      } catch (err: any) {
        toast({ title: 'Mission failed', description: err?.message || String(err), variant: 'destructive' });
      }
    };
    void create();
  };

  const handleUpdateMissionMeta = (missionId: string, updates: Partial<PlannerMission>) => {
    updateMission(missionId, updates);
    void persistMissionUpdate(missionId, updates);
  };

  const handleAirspeedChange = (value: number) => {
    if (!activeMission) return;
    updateMission(activeMission.id, { cruiseSpeed: value });
    void persistMissionUpdate(activeMission.id, { cruiseSpeed: value });
  };

  const addWaypoint = ({ lat, lon }: { lat: number; lon: number }) => {
    resetOverlay();
    clearPreview();
    const missionId = ensureActiveMissionId();
    if (!missionId) return;
    const nextIndex = missionWaypoints.length + 1;
    const lastAlt = missionWaypoints.length ? missionWaypoints[missionWaypoints.length - 1].alt : 120;
    updateMissionWaypoints(missionId, [
      ...missionWaypoints,
      {
        id: `WP-${nextIndex}`,
        name: `WP ${nextIndex}`,
        lat,
        lon,
        alt: lastAlt
      }
    ]);
    if (!plannerOpen) setPlannerOpen(true);
  };

  const uploadMissionPlan = async () => {
    try {
      if (!activeMission || !missionWaypoints.length) return;
      const res = await fetch(`${API_BASE}/mission/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission_id: activeMission.id,
          name: activeMission.name,
          items: missionWaypoints.map((wp, idx) => ({
            seq: idx,
            lat: wp.lat,
            lon: wp.lon,
            alt: wp.alt,
            command: 16,
            params: [0, 0, 0, 0]
          }))
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Mission upload failed');
      toast({ title: 'Mission synced', description: `Uploaded ${missionWaypoints.length} waypoints.` });
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  const startMission = async () => {
    try {
      const res = await fetch(`${API_BASE}/mission/start`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Mission start failed');
      if (activeMission) {
        updateMission(activeMission.id, { status: 'Running' });
      }
      toast({ title: 'Mission started' });
    } catch (err: any) {
      toast({ title: 'Start failed', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  const pauseMission = async () => {
    try {
      const res = await fetch(`${API_BASE}/mission/pause`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Mission pause failed');
      if (activeMission) {
        updateMission(activeMission.id, { status: 'Paused' });
      }
      toast({ title: 'Mission paused' });
    } catch (err: any) {
      toast({ title: 'Pause failed', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  const handleSurveyBoundaryChange = (points: LatLonPoint[]) => {
    setSurveyBoundaryPoints(points);
  };

  const updateWaypoint = (id: string, patch: Partial<MissionWaypoint>) => {
    resetOverlay();
    clearPreview();
    const missionId = ensureActiveMissionId();
    if (!missionId) return;
    updateMissionWaypoints(missionId, missionWaypoints.map(wp => wp.id === id ? { ...wp, ...patch } : wp));
  };

  const removeWaypoint = (id: string) => {
    resetOverlay();
    clearPreview();
    const missionId = ensureActiveMissionId();
    if (!missionId) return;
    updateMissionWaypoints(missionId, missionWaypoints.filter(wp => wp.id !== id));
  };

  const reorderWaypoint = (from: number, to: number) => {
    resetOverlay();
    clearPreview();
    const missionId = ensureActiveMissionId();
    if (!missionId) return;
    const next = [...missionWaypoints];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateMissionWaypoints(missionId, next);
  };

  const clearMission = () => {
    resetOverlay();
    clearPreview();
    const missionId = ensureActiveMissionId();
    if (!missionId) return;
    updateMissionWaypoints(missionId, []);
    setSurveyBoundaryPoints([]);
  };

  const undoWaypoint = () => {
    resetOverlay();
    clearPreview();
    const missionId = ensureActiveMissionId();
    if (!missionId) return;
    updateMissionWaypoints(missionId, missionWaypoints.slice(0, -1));
  };

  const focusWaypoint = (wp: MissionWaypoint) => {
    mapRef.current?.flyTo(wp.lon, wp.lat, 15);
  };

  const toLocal = (point: LatLonPoint, origin: LatLonPoint) => {
    const latRad = origin.lat * Math.PI / 180;
    const metersPerDegLat = 111320;
    const metersPerDegLon = 111320 * Math.cos(latRad);
    return {
      x: (point.lon - origin.lon) * metersPerDegLon,
      y: (point.lat - origin.lat) * metersPerDegLat
    };
  };

  const toGeo = (point: { x: number; y: number }, origin: LatLonPoint): LatLonPoint => {
    const latRad = origin.lat * Math.PI / 180;
    const metersPerDegLat = 111320;
    const metersPerDegLon = 111320 * Math.cos(latRad);
    return {
      lat: origin.lat + (point.y / metersPerDegLat),
      lon: origin.lon + (point.x / metersPerDegLon)
    };
  };

  const generateGridPattern = (boundary: LatLonPoint[], config: SurveyConfig) => {
    const angle = ((config.angle % 360) + 360) % 360;
    const spacing = Math.max(1, config.spacing || 1);
    const turnaround = Math.max(0, config.turnaroundDist || 0);
    const origin = {
      lat: boundary.reduce((s, p) => s + p.lat, 0) / boundary.length,
      lon: boundary.reduce((s, p) => s + p.lon, 0) / boundary.length
    };
    const localPoly = boundary.map(p => toLocal(p, origin));
    const dirRad = (angle * Math.PI) / 180;
    const dir = { x: Math.sin(dirRad), y: Math.cos(dirRad) }; // angle from North, clockwise
    const perp = { x: Math.cos(dirRad), y: -Math.sin(dirRad) };

    const projections = localPoly.map(p => ({
      along: p.x * dir.x + p.y * dir.y,
      across: p.x * perp.x + p.y * perp.y
    }));
    const minAcross = Math.min(...projections.map(p => p.across));
    const maxAcross = Math.max(...projections.map(p => p.across));
    const padding = spacing * 0.5;
    const startOffset = Math.floor((minAcross - padding) / spacing) * spacing;
    const endOffset = Math.ceil((maxAcross + padding) / spacing) * spacing;

    const waypoints: MissionWaypoint[] = [];
    const gridLines: SurveyOverlay['gridLines'] = [];

    const lineOriginAtOffset = (offset: number) => ({
      x: perp.x * offset,
      y: perp.y * offset
    });

    for (let offset = startOffset, lane = 0; offset <= endOffset; offset += spacing, lane++) {
      const o = lineOriginAtOffset(offset);
      const intersections: { t: number; point: { x: number; y: number } }[] = [];

      for (let i = 0; i < localPoly.length; i++) {
        const a = localPoly[i];
        const b = localPoly[(i + 1) % localPoly.length];
        const edge = { x: b.x - a.x, y: b.y - a.y };
        const denom = dir.x * edge.y - dir.y * edge.x;
        if (Math.abs(denom) < 1e-6) continue; // parallel
        const ao = { x: a.x - o.x, y: a.y - o.y };
        const t = (ao.x * edge.y - ao.y * edge.x) / denom;
        const u = (ao.x * dir.y - ao.y * dir.x) / denom;
        if (u < 0 || u > 1) continue;
        intersections.push({
          t,
          point: { x: o.x + dir.x * t, y: o.y + dir.y * t }
        });
      }

      intersections.sort((a, b) => a.t - b.t);
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const a = intersections[i].point;
        const b = intersections[i + 1].point;
        const startPoint = a;
        const endPoint = b;
        const forward = lane % 2 === 0;
        const laneDir = forward ? dir : { x: -dir.x, y: -dir.y };
        const start = forward ? startPoint : endPoint;
        const end = forward ? endPoint : startPoint;
        const startExtended = { x: start.x - laneDir.x * turnaround, y: start.y - laneDir.y * turnaround };
        const endExtended = { x: end.x + laneDir.x * turnaround, y: end.y + laneDir.y * turnaround };

        const startGeo = toGeo(startExtended, origin);
        const endGeo = toGeo(endExtended, origin);

        gridLines.push({ start: startGeo, end: endGeo });

        waypoints.push({
          id: `WP-${waypoints.length + 1}`,
          name: `Leg ${waypoints.length + 1}`,
          lat: startGeo.lat,
          lon: startGeo.lon,
          alt: config.altitude
        });
        waypoints.push({
          id: `WP-${waypoints.length + 1}`,
          name: `Leg ${waypoints.length + 1}`,
          lat: endGeo.lat,
          lon: endGeo.lon,
          alt: config.altitude
        });
      }
    }

    // Fallback: if no intersections (tiny polygon or spacing too large), add one diagonal sweep
    if (!gridLines.length && boundary.length >= 2) {
      const minAlong = Math.min(...projections.map(p => p.along));
      const maxAlong = Math.max(...projections.map(p => p.along));
      const centerAcross = (minAcross + maxAcross) / 2;
      const o = lineOriginAtOffset(centerAcross);
      const start = { x: o.x + dir.x * minAlong - dir.x * turnaround, y: o.y + dir.y * minAlong - dir.y * turnaround };
      const end = { x: o.x + dir.x * maxAlong + dir.x * turnaround, y: o.y + dir.y * maxAlong + dir.y * turnaround };
      const startGeo = toGeo(start, origin);
      const endGeo = toGeo(end, origin);
      gridLines.push({ start: startGeo, end: endGeo });
      waypoints.push({
        id: `WP-${waypoints.length + 1}`,
        name: `Leg ${waypoints.length + 1}`,
        lat: startGeo.lat,
        lon: startGeo.lon,
        alt: config.altitude
      });
      waypoints.push({
        id: `WP-${waypoints.length + 1}`,
        name: `Leg ${waypoints.length + 1}`,
        lat: endGeo.lat,
        lon: endGeo.lon,
        alt: config.altitude
      });
    }

    return { waypoints, gridLines, boundary };
  };

  const generateCorridorPattern = (points: LatLonPoint[], config: SurveyConfig) => {
    if (points.length < 2) {
      return { waypoints: [], gridLines: [], boundary: points };
    }
    const start = points[0];
    const end = points[points.length - 1];
    const origin = {
      lat: (start.lat + end.lat) / 2,
      lon: (start.lon + end.lon) / 2
    };
    const startLocal = toLocal(start, origin);
    const endLocal = toLocal(end, origin);
    const dirVec = { x: endLocal.x - startLocal.x, y: endLocal.y - startLocal.y };
    const len = Math.hypot(dirVec.x, dirVec.y) || 1;
    const dir = { x: dirVec.x / len, y: dirVec.y / len };
    const perp = { x: -dir.y, y: dir.x };

    const spacing = Math.max(1, config.spacing || 1);
    const halfWidth = Math.max(spacing, config.corridorWidth || spacing) / 2;
    const turnaround = Math.max(0, config.turnaroundDist || 0);

    const waypoints: MissionWaypoint[] = [];
    const gridLines: SurveyOverlay['gridLines'] = [];
    const boundaryLocal = [
      { x: startLocal.x + perp.x * halfWidth, y: startLocal.y + perp.y * halfWidth },
      { x: startLocal.x - perp.x * halfWidth, y: startLocal.y - perp.y * halfWidth },
      { x: endLocal.x - perp.x * halfWidth, y: endLocal.y - perp.y * halfWidth },
      { x: endLocal.x + perp.x * halfWidth, y: endLocal.y + perp.y * halfWidth }
    ];
    const boundary = boundaryLocal.map(p => toGeo(p, origin));

    const startOffset = -halfWidth;
    const endOffset = halfWidth;
    for (let offset = startOffset, lane = 0; offset <= endOffset + 0.001; offset += spacing, lane++) {
      const o = { x: perp.x * offset, y: perp.y * offset };
      const forward = lane % 2 === 0;
      const laneDir = forward ? dir : { x: -dir.x, y: -dir.y };
      const a = { x: startLocal.x + o.x, y: startLocal.y + o.y };
      const b = { x: endLocal.x + o.x, y: endLocal.y + o.y };
      const startPt = forward ? a : b;
      const endPt = forward ? b : a;
      const startExtended = { x: startPt.x - laneDir.x * turnaround, y: startPt.y - laneDir.y * turnaround };
      const endExtended = { x: endPt.x + laneDir.x * turnaround, y: endPt.y + laneDir.y * turnaround };

      const startGeo = toGeo(startExtended, origin);
      const endGeo = toGeo(endExtended, origin);
      gridLines.push({ start: startGeo, end: endGeo });
      waypoints.push({
        id: `WP-${waypoints.length + 1}`,
        name: `Leg ${waypoints.length + 1}`,
        lat: startGeo.lat,
        lon: startGeo.lon,
        alt: config.altitude
      });
      waypoints.push({
        id: `WP-${waypoints.length + 1}`,
        name: `Leg ${waypoints.length + 1}`,
        lat: endGeo.lat,
        lon: endGeo.lon,
        alt: config.altitude
      });
    }

    return { waypoints, gridLines, boundary };
  };

  const generateCirclePattern = (points: LatLonPoint[], config: SurveyConfig) => {
    if (!points.length) {
      return { waypoints: [], gridLines: [], boundary: [] };
    }
    const center = points[0];
    const origin = center;
    let radius = Math.max(1, config.circleRadius || 1);
    if (points.length > 1) {
      const local = toLocal(points[1], origin);
      const dist = Math.hypot(local.x, local.y);
      if (dist > 0.5) radius = dist;
    }
    const circlePts = 64;
    const boundary = Array.from({ length: circlePts }, (_, i) => {
      const t = (i / circlePts) * Math.PI * 2;
      return toGeo({ x: Math.cos(t) * radius, y: Math.sin(t) * radius }, origin);
    });

    const circumference = 2 * Math.PI * radius;
    const spacing = Math.max(5, config.spacing || 5);
    const waypointCount = Math.max(12, Math.round(circumference / spacing));
    const waypoints: MissionWaypoint[] = Array.from({ length: waypointCount }, (_, i) => {
      const t = (i / waypointCount) * Math.PI * 2;
      const p = toGeo({ x: Math.cos(t) * radius, y: Math.sin(t) * radius }, origin);
      return {
        id: `WP-${i + 1}`,
        name: `Leg ${i + 1}`,
        lat: p.lat,
        lon: p.lon,
        alt: config.altitude
      };
    });

    return { waypoints, gridLines: [], boundary };
  };

  const generatePattern = (boundary: LatLonPoint[], config: SurveyConfig) => {
    if (config.patternType === 'corridor') return generateCorridorPattern(boundary, config);
    if (config.patternType === 'circle') return generateCirclePattern(boundary, config);
    return generateGridPattern(boundary, config);
  };

  const handleSurveyPreview = (config: SurveyConfig) => {
    setLastPreviewConfig(config);
    setSurveyConfig(config);
    const boundarySource = surveyBoundaryPoints.length
      ? surveyBoundaryPoints
      : missionWaypoints.map(({ lat, lon }) => ({ lat, lon }));
    const minPoints = config.patternType === 'circle' ? 1 : (config.patternType === 'corridor' ? 2 : 3);
    if (boundarySource.length < minPoints) {
      setSurveyOverlay(boundarySource.length ? { boundary: boundarySource, gridLines: [] } : null);
      return;
    }
    const { gridLines, boundary } = generatePattern(boundarySource, config);
    setSurveyOverlay({ boundary, gridLines });
  };

  const handleSurveyApply = (config: SurveyConfig) => {
    const boundarySource = surveyBoundaryPoints.length
      ? surveyBoundaryPoints
      : (surveyOverlay?.boundary?.length ? surveyOverlay.boundary : missionWaypoints.map(({ lat, lon }) => ({ lat, lon })));

    const minPoints = config.patternType === 'circle' ? 1 : (config.patternType === 'corridor' ? 2 : 3);
    if (boundarySource.length < minPoints) {
      toast({
        title: 'Need survey boundary',
        description: config.patternType === 'circle'
          ? 'Drop a center point (and optional radius point) to define the circle, then apply the pattern.'
          : (config.patternType === 'corridor'
            ? 'Drop at least 2 points to define the corridor direction, then apply the pattern.'
            : 'Drop at least 3 points on the map to define the survey polygon, then apply the pattern.'),
        variant: 'destructive'
      });
      return;
    }

    const { waypoints, gridLines, boundary } = generatePattern(boundarySource, config);

    if (!waypoints.length) {
      toast({
        title: 'Pattern failed',
        description: 'Could not generate a survey pattern for the selected area. Try adjusting spacing or angle.',
        variant: 'destructive'
      });
      return;
    }

    const missionId = ensureActiveMissionId();
    if (!missionId) return;
    updateMissionWaypoints(missionId, waypoints);
    setSurveyOverlay({ boundary, gridLines });
    setPlanningEnabledByMission(prev => ({ ...prev, [missionId]: true }));
    setPlannerOpen(true);
    toast({
      title: 'Survey pattern applied',
      description: `Generated ${waypoints.length} waypoints with ${gridLines.length} transects at ${config.spacing}m spacing.`
    });
  };

  useEffect(() => {
    if (!surveyEditMode) return;
    if (!surveyBoundaryPoints.length) {
      setSurveyOverlay(null);
      return;
    }
    if (surveyConfig.patternType === 'corridor') {
      if (surveyBoundaryPoints.length < 2) {
        setSurveyOverlay({ boundary: surveyBoundaryPoints, gridLines: [] });
        return;
      }
    } else if (surveyConfig.patternType === 'circle') {
      if (surveyBoundaryPoints.length < 1) {
        setSurveyOverlay({ boundary: surveyBoundaryPoints, gridLines: [] });
        return;
      }
    } else if (surveyBoundaryPoints.length < 4) {
      setSurveyOverlay({ boundary: surveyBoundaryPoints, gridLines: [] });
      return;
    }
    const { waypoints, gridLines, boundary } = generatePattern(surveyBoundaryPoints, surveyConfig);
    setSurveyOverlay({ boundary, gridLines });
    const missionId = ensureActiveMissionId();
    if (!missionId) return;
    updateMissionWaypoints(missionId, waypoints, { persist: false });
    setPlanningEnabledByMission(prev => ({ ...prev, [missionId]: true }));
    setPlannerOpen(true);
  }, [surveyBoundaryPoints, surveyConfig, surveyEditMode]);

  useEffect(() => {
    void refreshPlannerState();
  }, []);

  useEffect(() => {
    if (!onRegisterSnapshot) return;
    onRegisterSnapshot(() => mapRef.current?.getSnapshot() ?? null);
  }, [onRegisterSnapshot]);

  return <div className="h-full w-full bg-canvas flex flex-col">
      {/* Demo Mode Banner */}
      {!connected}
      
      <div className="flex-1 relative">
        <div className="absolute left-3 right-3 z-10" style={{ top: 'var(--heading-offset, 12px)' }}>
          <CanvasToolbar 
            connected={connected} 
            entityCount={entities.length} 
            entities={entities}
            mapStyle={mapStyle} 
            onMapStyleChange={setMapStyle}
            onLocationSearch={handleLocationSearch}
            planningEnabled={planningEnabled}
            missionCount={missionWaypoints.length}
            onTogglePlanning={() => {
              const missionId = ensureActiveMissionId();
              if (!missionId) return;
              setPlanningEnabledByMission(prev => ({ ...prev, [missionId]: !prev[missionId] }));
              setPlannerOpen(true);
            }}
            onClearMission={clearMission}
            onUndoWaypoint={undoWaypoint}
            onAddMarker={handleAddMarker}
            onSetHomeLocation={handleSetHomeLocation}
            onCopyLatLong={handleCopyLatLong}
            onCommand={issueCommand}
            selectedVehicle={selectedEntity}
            vehicleDomain={vehicleDomain}
            connectionInfo={connectionInfo}
            showInternationalBorders={showInternationalBorders}
            showLineOfControl={showLineOfControl}
            showIndianClaimedBorder={showIndianClaimedBorder}
            onShowInternationalBordersChange={setShowInternationalBorders}
            onShowLineOfControlChange={setShowLineOfControl}
            onShowIndianClaimedBorderChange={setShowIndianClaimedBorder}
          />
        </div>
        {showCameraMain ? (
          <div className="absolute inset-0 bg-black">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-black" />
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12), transparent 40%)' }} />
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-xs text-white/80">LIVE CAMERA</span>
              <span className="text-xs text-white/60">{selectedCallsign}</span>
              <span className="text-[10px] text-white/70">({mainFeed === 'primary' ? 'Primary' : 'Aux'})</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-28 w-28 border border-white/50 rounded-sm" />
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMainFeed(prev => (prev === 'primary' ? 'aux' : 'primary'))}
                className="h-20 w-36 rounded-md border border-white/10 bg-black/60 relative overflow-hidden text-left"
                aria-label="Swap camera feed"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-muted-foreground/20 via-muted/30 to-background/50" />
                <div className="absolute top-2 left-2 text-[10px] text-white/70">
                  {mainFeed === 'primary' ? 'Aux Feed' : 'Primary Feed'}
                </div>
              </button>
            </div>
            <div className="absolute bottom-4 right-4 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCameraMain(false)}
                className="rounded-full p-0 border-0 bg-transparent"
                aria-label="Show map"
              >
                <MiniMap center={miniMapCenter} mapStyle={mapStyle} bearing={mapBearing} />
              </button>
            </div>
          </div>
        ) : (
          <MapView 
            ref={mapRef}
            entities={entities} 
            followEntity={selectedEntity} 
            onEntityClick={entity => onEntitySelect(entity.entity_id)} 
            mapStyle={mapStyle} 
            onMapStyleChange={setMapStyle} 
            cameraViewActive={showCameraMain}
            onToggleCameraView={() => setShowCameraMain(prev => !prev)}
            onBearingChange={setMapBearing}
            planningEnabled={planningEnabled}
            missionWaypoints={missionPlan.length ? missionPlan : missionWaypoints}
            onAddWaypoint={addWaypoint}
            onWaypointClick={focusWaypoint}
            surveyOverlay={surveyOverlay}
            surveyEditEnabled={surveyEditMode}
            surveyBoundaryPoints={surveyEditMode ? surveyBoundaryPoints : []}
            onSurveyBoundaryChange={handleSurveyBoundaryChange}
            surveyPatternType={surveyConfig.patternType}
            annotationMarkers={mapMarkers}
            homeLocation={homeLocation}
            homePlacementMode={homePlacementMode}
            showInternationalBorders={showInternationalBorders}
            showLineOfControl={showLineOfControl}
            showIndianClaimedBorder={showIndianClaimedBorder}
            drawBBoxActive={offlineDrawActive}
            offlineBBox={offlineBBox}
            budgetBBox={budgetBBox}
            onOfflineBBoxChange={onOfflineBBoxChange}
            onDrawBBoxActiveChange={onOfflineDrawActiveChange}
            onZoomChange={onMapZoomChange}
          />
        )}
        {plannerOpen && (
          <div className="absolute left-4 bottom-4 w-[420px] max-w-[90vw] z-10">
            <MissionPlannerPanel
              operations={operations}
              selectedOperationId={selectedOperationId}
              selectedMissionId={selectedMissionId}
              onSelectOperation={handleSelectOperation}
              onSelectMission={handleSelectMission}
              onCreateOperation={handleCreateOperation}
              onCreateMission={handleCreateMission}
              onUpdateMissionMeta={handleUpdateMissionMeta}
              waypoints={missionWaypoints}
              planningEnabled={planningEnabled}
              onTogglePlanning={() => {
                const missionId = ensureActiveMissionId();
                if (!missionId) return;
                setPlanningEnabledByMission(prev => ({ ...prev, [missionId]: !prev[missionId] }));
              }}
              onClose={() => setPlannerOpen(false)}
              onClear={clearMission}
              onUndo={undoWaypoint}
              onRemove={removeWaypoint}
              onReorder={reorderWaypoint}
              onUpdate={updateWaypoint}
              onFocus={focusWaypoint}
              defaultAirspeed={defaultAirspeed}
              onAirspeedChange={handleAirspeedChange}
              onApplyPattern={handleSurveyApply}
              onPreviewPattern={handleSurveyPreview}
              surveyConfig={surveyConfig}
              onSurveyConfigChange={setSurveyConfig}
              onSurveyPanelOpenChange={setSurveyEditMode}
              onUploadMission={uploadMissionPlan}
              onStartMission={startMission}
              onPauseMission={pauseMission}
            />
          </div>
        )}
        {commandStatus && (
          <div className="absolute top-4 right-4 bg-card/90 text-xs px-3 py-2 rounded border border-border shadow">
            {commandStatus}
          </div>
        )}
      </div>
    </div>;
};
