import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

type BBox = { west: number; south: number; east: number; north: number };
type RegionOption = 'asia' | 'custom';
type LocationSearchResult = {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
};

const SectionLabel = ({ children }: { children: string }) => (
  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{children}</div>
);

const ControlRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="text-xs text-foreground">{label}</div>
    <div className="min-w-[120px] flex justify-end">{children}</div>
  </div>
);

interface OfflineMapsPanelProps {
  drawActive?: boolean;
  onDrawActiveChange?: (active: boolean) => void;
  bbox?: BBox | null;
  onBBoxChange?: (bbox: BBox | null) => void;
  mapZoom?: number;
  previewImages?: { min: { url: string; label: string } | null; max: { url: string; label: string } | null };
  onCapturePreview?: (which: 'min' | 'max', zoom: number) => void;
  onBudgetBBoxChange?: (bbox: BBox | null) => void;
}

const DEFAULT_ASIA_BBOX = {
  west: '25.0',
  south: '-10.0',
  east: '180.0',
  north: '82.0'
};

const formatCoord = (value: number) => value.toFixed(6);
const formatBytes = (bytes: number | null | undefined) => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const buildBBoxFromCenterAndRadius = (lon: number, lat: number, radiusKm: number): BBox => {
  const boundedLat = Math.max(-85, Math.min(85, lat));
  const latDelta = radiusKm / 110.574;
  const cosLat = Math.cos((boundedLat * Math.PI) / 180);
  const lonScale = 111.32 * Math.max(0.1, Math.abs(cosLat));
  const lonDelta = radiusKm / lonScale;

  return {
    west: Math.max(-180, lon - lonDelta),
    south: Math.max(-85, boundedLat - latDelta),
    east: Math.min(180, lon + lonDelta),
    north: Math.min(85, boundedLat + latDelta),
  };
};

export const OfflineMapsPanel = ({
  drawActive = false,
  onDrawActiveChange,
  bbox: externalBBox,
  onBBoxChange,
  mapZoom,
  previewImages,
  onCapturePreview,
  onBudgetBBoxChange
}: OfflineMapsPanelProps) => {
  const [region, setRegion] = useState<RegionOption>('asia');
  const [bbox, setBbox] = useState(DEFAULT_ASIA_BBOX);
  const [bboxError, setBboxError] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationSearchResult | null>(null);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState('25');
  const [minZoom, setMinZoom] = useState(0);
  const [maxZoom, setMaxZoom] = useState(12);
  const [syncZoom, setSyncZoom] = useState(false);
  const [storageBudget, setStorageBudget] = useState(1);
  const [storageBudgetInput, setStorageBudgetInput] = useState('1');
  const [mapTypes, setMapTypes] = useState({
    streets: true,
    dark: true,
    satellite: true,
    terrain: true
  });
  const [provider, setProvider] = useState('osm');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [budgetEstimate, setBudgetEstimate] = useState<number | null>(null);
  const [budgetBBoxLocal, setBudgetBBoxLocal] = useState<BBox | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [cacheInventory, setCacheInventory] = useState<any>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [visualDbStatus, setVisualDbStatus] = useState<any>(null);
  const [visualDbBusy, setVisualDbBusy] = useState(false);
  const [visualDbMessage, setVisualDbMessage] = useState<string | null>(null);
  const adjustingRef = useRef(false);
  const apiBase = import.meta.env.VITE_CHAOX_API_BASE || 'http://localhost:9000';

  useEffect(() => {
    if (!externalBBox) return;
    setBbox({
      west: formatCoord(externalBBox.west),
      south: formatCoord(externalBBox.south),
      east: formatCoord(externalBBox.east),
      north: formatCoord(externalBBox.north),
    });
    setRegion('custom');
  }, [externalBBox]);

  useEffect(() => {
    const trimmedQuery = locationQuery.trim();
    if (trimmedQuery.length < 3) {
      setLocationResults([]);
      setLocationSearchLoading(false);
      if (!trimmedQuery) {
        setSelectedLocation(null);
        setLocationError(null);
      }
      return;
    }
    if (selectedLocation && trimmedQuery === selectedLocation.display_name) {
      setLocationResults([]);
      setLocationSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLocationSearchLoading(true);
      setLocationError(null);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          throw new Error(`Location search failed (${res.status})`);
        }
        const data = (await res.json()) as LocationSearchResult[];
        setLocationResults(Array.isArray(data) ? data : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLocationResults([]);
        setLocationError(error instanceof Error ? error.message : 'Location search failed');
      } finally {
        if (!controller.signal.aborted) {
          setLocationSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [locationQuery, selectedLocation]);

  useEffect(() => {
    if (storageBudgetInput !== String(storageBudget)) {
      setStorageBudgetInput(String(storageBudget));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageBudget]);

  useEffect(() => {
    if (!syncZoom || mapZoom === undefined) return;
    const rounded = Math.max(0, Math.min(22, Math.round(mapZoom)));
    setMinZoom(rounded);
    setMaxZoom(rounded);
  }, [mapZoom, syncZoom]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/tiles/status`);
        if (res.ok) setStatus(await res.json());
      } catch {
        // ignore
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [apiBase]);

  useEffect(() => {
    const loadVisualDbStatus = async () => {
      try {
        const res = await fetch(`${apiBase}/tiles/visual-localization-db`);
        if (res.ok) {
          setVisualDbStatus(await res.json());
        }
      } catch {
        // ignore
      }
    };
    void loadVisualDbStatus();
  }, [apiBase]);

  useEffect(() => {
    const loadCacheInventory = async () => {
      try {
        const res = await fetch(`${apiBase}/tiles/cache`);
        if (res.ok) {
          setCacheInventory(await res.json());
        }
      } catch {
        // ignore
      }
    };

    void loadCacheInventory();
    const timer = window.setInterval(() => {
      void loadCacheInventory();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [apiBase]);

  const mapTypeList = useMemo(
    () => Object.entries(mapTypes).filter(([, v]) => v).map(([k]) => k),
    [mapTypes]
  );
  const isDownloading = status?.state === 'running' && !status?.stopped;
  const isCanceling = status?.state === 'running' && Boolean(status?.stopped);

  const effectiveBBox = useMemo(() => {
    if (region !== 'custom') return undefined;
    if (budgetBBoxLocal) return budgetBBoxLocal;
    return {
      west: Number(bbox.west),
      south: Number(bbox.south),
      east: Number(bbox.east),
      north: Number(bbox.north),
    };
  }, [bbox.east, bbox.north, bbox.south, bbox.west, budgetBBoxLocal, region]);

  const previewTiles = useMemo(() => {
    const selectedType = mapTypeList[0];
    if (!selectedType) return null;
    const sourceBBox = budgetBBoxLocal ?? {
      west: Number(bbox.west),
      south: Number(bbox.south),
      east: Number(bbox.east),
      north: Number(bbox.north),
    };
    const west = sourceBBox.west;
    const south = sourceBBox.south;
    const east = sourceBBox.east;
    const north = sourceBBox.north;
    if (![west, south, east, north].every(v => Number.isFinite(v))) return null;
    const centerLon = (west + east) / 2;
    const centerLat = (south + north) / 2;
    const clampLat = Math.max(-85.0511, Math.min(85.0511, centerLat));
    const toTile = (lon: number, lat: number, zoom: number) => {
      const z = Math.max(0, Math.min(22, zoom));
      const n = Math.pow(2, z);
      const x = Math.floor(((lon + 180) / 360) * n);
      const latRad = (lat * Math.PI) / 180;
      const y = Math.floor(
        (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
      );
      return { x, y, z };
    };
    const minTile = toTile(centerLon, clampLat, minZoom);
    const maxTile = toTile(centerLon, clampLat, maxZoom);
    return {
      min: {
        url: `${apiBase}/tiles/${selectedType}/${minTile.z}/${minTile.x}/${minTile.y}.png`,
        label: `Min Zoom: ${minZoom}`
      },
      max: {
        url: `${apiBase}/tiles/${selectedType}/${maxTile.z}/${maxTile.x}/${maxTile.y}.png`,
        label: `Max Zoom: ${maxZoom}`
      }
    };
  }, [apiBase, bbox.east, bbox.north, bbox.south, bbox.west, budgetBBoxLocal, mapTypeList, maxZoom, minZoom]);

  const payload = useMemo(() => ({
    region_name: region,
    bbox: effectiveBBox,
    min_zoom: minZoom,
    max_zoom: maxZoom,
    map_types: mapTypeList,
    provider,
    max_tiles: storageBudget ? Math.floor(storageBudget * 5000) : undefined
  }), [effectiveBBox, mapTypeList, maxZoom, minZoom, provider, region, storageBudget]);

  const maxTilesBudget = Math.floor(storageBudget * 5000);

  const AVG_TILE_BYTES = 50 * 1024;
  const estimatedSizeGb = estimate !== null ? (estimate * AVG_TILE_BYTES) / (1024 ** 3) : null;

  const estimateTilesForBBox = async (targetBBox: BBox) => {
    if (!mapTypeList.length) return 0;
    const res = await fetch(`${apiBase}/tiles/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        region_name: 'custom',
        bbox: targetBBox
      })
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.tiles) || 0;
  };

  const shrinkBBox = (
    target: BBox,
    factor: number
  ) => {
    const centerLon = (target.west + target.east) / 2;
    const centerLat = (target.south + target.north) / 2;
    const width = (target.east - target.west) * factor;
    const height = (target.north - target.south) * factor;
    const west = Math.max(-180, centerLon - width / 2);
    const east = Math.min(180, centerLon + width / 2);
    const south = Math.max(-85, centerLat - height / 2);
    const north = Math.min(85, centerLat + height / 2);
    return { west, south, east, north };
  };

  useEffect(() => {
    if (region !== 'custom' || !externalBBox || !mapTypeList.length) return;
    if (adjustingRef.current) return;
    if (!Number.isFinite(maxTilesBudget) || maxTilesBudget <= 0) return;

    const adjust = async () => {
      adjustingRef.current = true;
      try {
        let nextBBox = { ...externalBBox };
        for (let i = 0; i < 3; i++) {
          const tiles = await estimateTilesForBBox(nextBBox);
          setBudgetEstimate(tiles);
          if (tiles <= maxTilesBudget) break;
          const ratio = Math.max(0.05, Math.min(1, Math.sqrt(maxTilesBudget / tiles)));
          nextBBox = shrinkBBox(nextBBox, ratio);
        }
        setBudgetBBoxLocal(nextBBox);
        onBudgetBBoxChange?.(nextBBox);
      } finally {
        adjustingRef.current = false;
      }
    };
    void adjust();
  }, [externalBBox, mapTypeList, maxTilesBudget, maxZoom, minZoom, onBudgetBBoxChange, region]);

  const applyBBoxSelection = (nextBBox: BBox) => {
    setRegion('custom');
    setBbox({
      west: formatCoord(nextBBox.west),
      south: formatCoord(nextBBox.south),
      east: formatCoord(nextBBox.east),
      north: formatCoord(nextBBox.north),
    });
    setBboxError(null);
    setBudgetBBoxLocal(null);
    onBudgetBBoxChange?.(null);
    onBBoxChange?.(nextBBox);
    onDrawActiveChange?.(false);
  };

  const parseEnteredBBox = (): BBox | null => {
    const parsed = {
      west: Number(bbox.west),
      south: Number(bbox.south),
      east: Number(bbox.east),
      north: Number(bbox.north),
    };
    if (!Object.values(parsed).every((value) => Number.isFinite(value))) {
      setBboxError('Enter valid numeric bbox coordinates.');
      return null;
    }
    if (parsed.west >= parsed.east || parsed.south >= parsed.north) {
      setBboxError('BBox must keep west < east and south < north.');
      return null;
    }
    return parsed;
  };

  const handleApplyEnteredBBox = () => {
    const parsed = parseEnteredBBox();
    if (!parsed) return;
    applyBBoxSelection(parsed);
  };

  const handleApplyRadiusBBox = () => {
    if (!selectedLocation) {
      setLocationError('Pick a search result first.');
      return;
    }
    const lat = Number(selectedLocation.lat);
    const lon = Number(selectedLocation.lon);
    const radius = Number(radiusKm);
    if (![lat, lon, radius].every((value) => Number.isFinite(value)) || radius <= 0) {
      setLocationError('Enter a valid radius in kilometers.');
      return;
    }
    setLocationError(null);
    applyBBoxSelection(buildBBoxFromCenterAndRadius(lon, lat, radius));
  };

  const handleEstimate = async () => {
    setEstimateError(null);
    try {
      const res = await fetch(`${apiBase}/tiles/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        setEstimate(null);
        setEstimateError(`Estimate failed (${res.status})`);
        return;
      }
      const data = await res.json();
      setEstimate(Number(data.tiles) || 0);
    } catch {
      setEstimate(null);
      setEstimateError('Estimate failed (network)');
    }
  };

  const handleDownload = async () => {
    setDownloadMessage(null);
    setClearMessage(null);
    try {
      const res = await fetch(`${apiBase}/tiles/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDownloadMessage(`Download failed (${res.status})`);
        return;
      }
      if (data.status === 'already_running') {
        setDownloadMessage('A tile download is already running.');
        return;
      }
      setStatus((current: any) => ({
        ...(current || {}),
        state: 'running',
        stopped: false,
        error: null,
      }));
      setDownloadMessage('Tile download started.');
    } catch {
      setDownloadMessage('Download failed (network).');
    }
  };

  const handleCancel = async () => {
    setDownloadMessage(null);
    setClearMessage(null);
    try {
      const res = await fetch(`${apiBase}/tiles/cancel`, { method: 'POST' });
      if (!res.ok) {
        setDownloadMessage(`Cancel failed (${res.status})`);
        return;
      }
      setStatus((current: any) => ({
        ...(current || {}),
        state: current?.state === 'running' ? 'running' : 'stopping',
        stopped: true,
      }));
      setDownloadMessage('Stopping tile download...');
    } catch {
      setDownloadMessage('Cancel failed (network).');
    }
  };

  const handleClearCache = async () => {
    setDownloadMessage(null);
    setClearMessage(null);
    setIsClearingCache(true);
    try {
      const res = await fetch(`${apiBase}/tiles/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_types: mapTypeList.length ? mapTypeList : undefined,
          clear_visual_dbs: true,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setClearMessage(data.reason || `Clear cache failed (${res.status})`);
        return;
      }
      setCacheInventory(data.inventory || null);
      setStatus((current: any) => ({
        ...(current || {}),
        state: 'idle',
        progress: 0,
        downloaded: 0,
        total: 0,
        stopped: false,
        error: null,
      }));
      setVisualDbStatus((current: any) => ({
        ...(current || {}),
        active_map_db_path: null,
        active_tile_zoom_level: null,
      }));
      localStorage.removeItem('chaox.visualMapDbPath');
      const cleared = Array.isArray(data.cleared_map_types) && data.cleared_map_types.length
        ? data.cleared_map_types.join(', ')
        : 'selected map types';
      const clearedVisualDbCount = Array.isArray(data.cleared_visual_dbs) ? data.cleared_visual_dbs.length : 0;
      setClearMessage(
        clearedVisualDbCount > 0
          ? `Cleared cache for ${cleared} and removed ${clearedVisualDbCount} visual DB folder(s).`
          : `Cleared cache for ${cleared}.`
      );
    } catch {
      setClearMessage('Clear cache failed (network).');
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleBuildVisualDb = async () => {
    setVisualDbBusy(true);
    setVisualDbMessage('Preparing visual localization DB from cached satellite tiles...');
    try {
      const res = await fetch(`${apiBase}/tiles/visual-localization-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_type: 'satellite',
          zoom_level: maxZoom,
          activate_for_visual_localization: true,
        })
      });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }
      if (!res.ok || data.status === 'error') {
        throw new Error(data.reason || `Visual DB build failed (${res.status})`);
      }
      setVisualDbStatus((current: any) => ({
        ...(current || {}),
        active_map_db_path: data.output_dir,
        active_tile_zoom_level: data.zoom_level,
      }));
      localStorage.setItem('chaox.visualMapDbPath', data.output_dir);
      setVisualDbMessage(`Visual localization DB ready: ${data.tile_count} tiles at z${data.zoom_level}`);
    } catch (error) {
      setVisualDbMessage(error instanceof Error ? error.message : 'Visual DB build failed');
    } finally {
      setVisualDbBusy(false);
    }
  };

  const handleClearSelection = () => {
    onBBoxChange?.(null);
    setBudgetBBoxLocal(null);
    onBudgetBBoxChange?.(null);
    setBboxError(null);
    setLocationError(null);
  };

  const handleCapture = (which: 'min' | 'max') => {
    if (mapZoom === undefined) return;
    const rounded = Math.max(0, Math.min(22, Math.round(mapZoom)));
    if (which === 'min') {
      setMinZoom(rounded);
    } else {
      setMaxZoom(rounded);
    }
    onCapturePreview?.(which, rounded);
  };

  return (
    <div className="h-full flex flex-col bg-panel border-r border-panel-border">
      <div className="p-3 border-b border-panel-border">
        <div className="text-xs text-muted-foreground uppercase tracking-[0.14em]">Offline Maps</div>
        <div className="text-sm font-semibold text-foreground">Tile Cache Manager</div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
            <SectionLabel>Region</SectionLabel>
            <Select value={region} onValueChange={(value) => setRegion(value as RegionOption)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asia">Asia</SelectItem>
                <SelectItem value="custom">Custom BBox</SelectItem>
              </SelectContent>
            </Select>
            <div className="space-y-2 rounded-md border border-border/60 bg-background/70 p-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Location Search</div>
              <Input
                className="h-8"
                value={locationQuery}
                onChange={(e) => {
                  setLocationQuery(e.target.value);
                  setSelectedLocation(null);
                }}
                placeholder="Search city, place, or address"
              />
              <div className="flex items-center gap-2">
                <Input
                  className="h-8"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(e.target.value)}
                  placeholder="Radius (km)"
                />
                <Button type="button" variant="outline" className="h-8 shrink-0" onClick={handleApplyRadiusBBox}>
                  Use Radius
                </Button>
              </div>
              {selectedLocation && (
                <div className="text-[10px] text-muted-foreground">
                  Center: {selectedLocation.display_name}
                </div>
              )}
              {locationSearchLoading && (
                <div className="text-[10px] text-muted-foreground">Searching locations...</div>
              )}
              {!locationSearchLoading && locationResults.length > 0 && (
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-background/60 p-1">
                  {locationResults.map((result) => (
                    <button
                      key={result.place_id}
                      type="button"
                      className="w-full rounded-sm px-2 py-1 text-left text-[11px] text-foreground transition hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        setSelectedLocation(result);
                        setLocationQuery(result.display_name);
                        setLocationResults([]);
                        setLocationError(null);
                        setRegion('custom');
                      }}
                    >
                      {result.display_name}
                    </button>
                  ))}
                </div>
              )}
              {locationError && (
                <div className="text-[10px] text-destructive">{locationError}</div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input className="h-8" value={bbox.west} onChange={(e) => setBbox(prev => ({ ...prev, west: e.target.value }))} placeholder="West (lon)" />
              <Input className="h-8" value={bbox.south} onChange={(e) => setBbox(prev => ({ ...prev, south: e.target.value }))} placeholder="South (lat)" />
              <Input className="h-8" value={bbox.east} onChange={(e) => setBbox(prev => ({ ...prev, east: e.target.value }))} placeholder="East (lon)" />
              <Input className="h-8" value={bbox.north} onChange={(e) => setBbox(prev => ({ ...prev, north: e.target.value }))} placeholder="North (lat)" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full" onClick={() => onDrawActiveChange?.(!drawActive)}>
                {drawActive ? 'Drawing…' : 'Draw BBox'}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleApplyEnteredBBox}>
                Apply BBox
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleApplyRadiusBBox}>
                Radius to BBox
              </Button>
              <Button variant="outline" className="w-full" onClick={handleClearSelection}>
                Clear Selection
              </Button>
            </div>
            {bboxError && (
              <div className="text-[10px] text-destructive">{bboxError}</div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Zoom Range</SectionLabel>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Sync Map</span>
                <Switch checked={syncZoom} onCheckedChange={(v) => setSyncZoom(Boolean(v))} />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span>Min Zoom</span>
                  <span>{minZoom}</span>
                </div>
                <Slider value={[minZoom]} onValueChange={(v) => setMinZoom(v[0])} max={22} min={0} step={1} />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span>Max Zoom</span>
                  <span>{maxZoom}</span>
                </div>
                <Slider value={[maxZoom]} onValueChange={(v) => setMaxZoom(v[0])} max={22} min={0} step={1} />
              </div>
            </div>
            {previewTiles && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-md border border-border/60 bg-background/70 p-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Min Preview</div>
                  <img
                    src={previewImages?.min?.url || previewTiles.min.url}
                    alt={previewImages?.min?.label || previewTiles.min.label}
                    className="mt-2 h-24 w-full rounded-sm object-cover"
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {previewImages?.min?.label || previewTiles.min.label}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 h-7 w-full text-[10px]"
                    onClick={() => handleCapture('min')}
                  >
                    Capture From Map
                  </Button>
                </div>
                <div className="rounded-md border border-border/60 bg-background/70 p-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Max Preview</div>
                  <img
                    src={previewImages?.max?.url || previewTiles.max.url}
                    alt={previewImages?.max?.label || previewTiles.max.label}
                    className="mt-2 h-24 w-full rounded-sm object-cover"
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {previewImages?.max?.label || previewTiles.max.label}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 h-7 w-full text-[10px]"
                    onClick={() => handleCapture('max')}
                  >
                    Capture From Map
                  </Button>
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between text-xs text-foreground mb-2">
                <span>Storage Budget (GB)</span>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-7 w-20 text-right text-xs"
                    value={storageBudgetInput}
                    onChange={(e) => setStorageBudgetInput(e.target.value)}
                    onBlur={() => {
                      const raw = Number(storageBudgetInput);
                      if (!Number.isFinite(raw)) {
                        setStorageBudgetInput(String(storageBudget));
                        return;
                      }
                      const clamped = Math.max(0.1, Math.min(2000, raw));
                      setStorageBudget(clamped);
                      setStorageBudgetInput(String(clamped));
                    }}
                  />
                  <span className="text-muted-foreground text-[10px] uppercase tracking-[0.12em]">GB</span>
                </div>
              </div>
              <Slider value={[storageBudget]} onValueChange={(v) => setStorageBudget(v[0])} max={2000} min={0.1} step={0.1} />
              <div className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
                Budget caps download size. Higher zoom or more map types reduce the maximum area. The BBox will auto-shrink
                to fit {maxTilesBudget.toLocaleString()} tiles across {mapTypeList.length} selected map types.
              </div>
              {budgetEstimate !== null && (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Current estimate: {budgetEstimate.toLocaleString()} tiles.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-3">
            <SectionLabel>Map Types</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-xs">Streets</span>
                <Switch checked={mapTypes.streets} onCheckedChange={(v) => setMapTypes(prev => ({ ...prev, streets: Boolean(v) }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-xs">Dark</span>
                <Switch checked={mapTypes.dark} onCheckedChange={(v) => setMapTypes(prev => ({ ...prev, dark: Boolean(v) }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-xs">Satellite</span>
                <Switch checked={mapTypes.satellite} onCheckedChange={(v) => setMapTypes(prev => ({ ...prev, satellite: Boolean(v) }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-xs">Terrain</span>
                <Switch checked={mapTypes.terrain} onCheckedChange={(v) => setMapTypes(prev => ({ ...prev, terrain: Boolean(v) }))} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-3">
            <SectionLabel>Cache Controls</SectionLabel>
            <ControlRow label="Provider">
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="osm">OSM</SelectItem>
                  <SelectItem value="stamen">Stamen</SelectItem>
                  <SelectItem value="esri">Esri</SelectItem>
                </SelectContent>
              </Select>
            </ControlRow>
            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={handleEstimate} disabled={isDownloading || isCanceling}>
                Estimate Size
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleDownload} disabled={isDownloading || isCanceling}>
                {isDownloading || isCanceling ? 'Downloading...' : 'Download Tiles'}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancel}
                disabled={!isDownloading || isCanceling}
              >
                {isCanceling ? 'Canceling...' : 'Cancel Download'}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleClearCache}
                disabled={isDownloading || isCanceling || isClearingCache}
              >
                {isClearingCache ? 'Clearing...' : 'Clear Cache'}
              </Button>
            </div>
            {downloadMessage && (
              <div className="text-[11px] text-muted-foreground">{downloadMessage}</div>
            )}
            {clearMessage && (
              <div className="text-[11px] text-muted-foreground">{clearMessage}</div>
            )}
            <div className="rounded-md border border-border/60 bg-background/70 p-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Visual Localization DB</div>
                <div className="text-[10px] text-muted-foreground">Satellite z{maxZoom}</div>
              </div>
              <Button className="w-full" size="sm" onClick={handleBuildVisualDb} disabled={visualDbBusy}>
                {visualDbBusy ? 'Preparing Visual DB...' : 'Use Cache For Visual Localization'}
              </Button>
              {visualDbStatus?.active_map_db_path && (
                <div className="text-[10px] text-muted-foreground break-all">
                  Active DB: {visualDbStatus.active_map_db_path}
                </div>
              )}
              {visualDbMessage && (
                <div className="text-[11px] text-muted-foreground">{visualDbMessage}</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground space-y-1">
            <div>Estimate: {estimate !== null ? estimate.toLocaleString() : '-'} tiles</div>
            <div>Size (est.): {estimatedSizeGb !== null ? estimatedSizeGb.toFixed(2) : '-'} GB</div>
            {estimateError && <div>Estimate error: {estimateError}</div>}
            <div>Queue: {status?.state ?? 'idle'} • Progress: {status?.progress ?? 0}%</div>
            <div>Downloaded: {status?.downloaded ?? 0} / {status?.total ?? 0}</div>
            {status?.error && <div>Download error: {status.error}</div>}
            {isCanceling && <div>Cancel requested. Waiting for the current tile fetch to stop.</div>}
            <div>Cache root: {cacheInventory?.cache_root ?? '-'}</div>
            <div>Total cached tiles: {typeof cacheInventory?.total_tiles === 'number' ? cacheInventory.total_tiles.toLocaleString() : '-'}</div>
            <div>Cache size: {formatBytes(cacheInventory?.total_size_bytes)}</div>
            {cacheInventory?.map_types && (
              <div className="pt-2 space-y-1">
                {Object.entries(cacheInventory.map_types).map(([mapType, info]: [string, any]) => (
                  <div key={mapType} className="rounded-md border border-border/50 bg-background/60 px-2 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="capitalize text-foreground">{mapType}</span>
                      <span>{Number(info?.tile_count || 0).toLocaleString()} tiles</span>
                    </div>
                    <div>Zooms: {Array.isArray(info?.zoom_levels) && info.zoom_levels.length ? info.zoom_levels.join(', ') : 'none'}</div>
                    <div>Size: {formatBytes(info?.size_bytes)}</div>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(cacheInventory?.visual_dbs) && cacheInventory.visual_dbs.length > 0 && (
              <div className="pt-2 space-y-1">
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Visual DB Folders</div>
                {cacheInventory.visual_dbs.map((db: any) => (
                  <div key={db.path} className="rounded-md border border-border/50 bg-background/60 px-2 py-1">
                    <div className="text-foreground">{db.name}</div>
                    <div>{Number(db.tile_count || 0).toLocaleString()} tiles • {formatBytes(db.size_bytes)}</div>
                    <div className="break-all">{db.path}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
