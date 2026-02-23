import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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
  bbox?: { west: number; south: number; east: number; north: number } | null;
  onBBoxChange?: (bbox: { west: number; south: number; east: number; north: number } | null) => void;
  mapZoom?: number;
  previewImages?: { min: { url: string; label: string } | null; max: { url: string; label: string } | null };
  onCapturePreview?: (which: 'min' | 'max', zoom: number) => void;
  onBudgetBBoxChange?: (bbox: { west: number; south: number; east: number; north: number } | null) => void;
}

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
  const [region, setRegion] = useState<'asia' | 'custom'>('asia');
  const [bbox, setBbox] = useState({
    west: '25.0',
    south: '-10.0',
    east: '180.0',
    north: '82.0'
  });
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
  const [budgetEstimate, setBudgetEstimate] = useState<number | null>(null);
  const [budgetBBoxLocal, setBudgetBBoxLocal] = useState<{ west: number; south: number; east: number; north: number } | null>(null);
  const [status, setStatus] = useState<any>(null);
  const adjustingRef = useRef(false);
  const apiBase = import.meta.env.VITE_CHAOX_API_BASE || 'http://localhost:9000';

  useEffect(() => {
    if (!externalBBox) return;
    setBbox({
      west: String(externalBBox.west),
      south: String(externalBBox.south),
      east: String(externalBBox.east),
      north: String(externalBBox.north),
    });
    setRegion('custom');
  }, [externalBBox]);

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

  const mapTypeList = useMemo(
    () => Object.entries(mapTypes).filter(([, v]) => v).map(([k]) => k),
    [mapTypes]
  );

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

  const estimateTilesForBBox = async (targetBBox: { west: number; south: number; east: number; north: number }) => {
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
    target: { west: number; south: number; east: number; north: number },
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

  const handleEstimate = async () => {
    const res = await fetch(`${apiBase}/tiles/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      setEstimate(data.tiles);
    }
  };

  const handleDownload = async () => {
    await fetch(`${apiBase}/tiles/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  const handleCancel = async () => {
    await fetch(`${apiBase}/tiles/cancel`, { method: 'POST' });
  };

  const handleClearSelection = () => {
    onBBoxChange?.(null);
    setBudgetBBoxLocal(null);
    onBudgetBBoxChange?.(null);
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
            <Select defaultValue="asia" onValueChange={(v) => setRegion(v as 'asia' | 'custom')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asia">Asia</SelectItem>
                <SelectItem value="custom">Custom BBox</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input className="h-8" value={bbox.west} onChange={(e) => setBbox(prev => ({ ...prev, west: e.target.value }))} placeholder="West (lon)" />
              <Input className="h-8" value={bbox.south} onChange={(e) => setBbox(prev => ({ ...prev, south: e.target.value }))} placeholder="South (lat)" />
              <Input className="h-8" value={bbox.east} onChange={(e) => setBbox(prev => ({ ...prev, east: e.target.value }))} placeholder="East (lon)" />
              <Input className="h-8" value={bbox.north} onChange={(e) => setBbox(prev => ({ ...prev, north: e.target.value }))} placeholder="North (lat)" />
            </div>
            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={() => onDrawActiveChange?.(!drawActive)}>
                {drawActive ? 'Drawing…' : 'Draw BBox'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleClearSelection}>
                Clear Selection
              </Button>
            </div>
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
              <Select defaultValue="osm" onValueChange={setProvider}>
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
              <Button className="flex-1" onClick={handleEstimate}>Estimate Size</Button>
              <Button variant="outline" className="flex-1" onClick={handleDownload}>Download Tiles</Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={handleCancel}>Cancel</Button>
              <Button variant="destructive" className="flex-1">Clear Cache</Button>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground space-y-1">
            <div>Estimate: {estimate ? estimate.toLocaleString() : '—'} tiles</div>
            <div>Queue: {status?.state ?? 'idle'} • Progress: {status?.progress ?? 0}%</div>
            <div>Downloaded: {status?.downloaded ?? 0} / {status?.total ?? 0}</div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
