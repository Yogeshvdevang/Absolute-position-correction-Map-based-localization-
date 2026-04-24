import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Badge } from './ui/badge';

const API_BASE = import.meta.env.VITE_CHAOX_API_BASE || 'http://localhost:9000';
const DEFAULT_WS_BASE = import.meta.env.VITE_CHAOX_WS_BASE || 'ws://localhost:9000';
const DEFAULT_LIVE_FEED_URL = `${DEFAULT_WS_BASE}/camera`;
const DEFAULT_TELEMETRY_URL = `${DEFAULT_WS_BASE}/ws/telemetry`;
const DEFAULT_SIM_VEHICLE_ID = 'vehicle-1';

const SectionLabel = ({ children }: { children: string }) => (
  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{children}</div>
);

const ControlRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="text-xs text-foreground">{label}</div>
    <div className="min-w-[120px] flex justify-end">{children}</div>
  </div>
);

const MetricTile = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-lg border border-border/60 bg-background/70 p-2">
    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    <div className="mt-1 font-mono text-sm font-semibold text-foreground">{value}</div>
    {hint ? <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div> : null}
  </div>
);

const statusToneClasses: Record<'ready' | 'warn' | 'error' | 'idle', string> = {
  ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
  idle: 'border-border/60 bg-background/60 text-muted-foreground',
};

const classifyStatusTone = (value: string | null | undefined): 'ready' | 'warn' | 'error' | 'idle' => {
  if (!value) return 'idle';
  const normalized = value.toLowerCase();
  if (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('invalid') ||
    normalized.includes('missing') ||
    normalized.includes('disconnected') ||
    normalized.includes('no coordinates')
  ) {
    return 'error';
  }
  if (
    normalized.includes('warning') ||
    normalized.includes('waiting') ||
    normalized.includes('pending') ||
    normalized.includes('standby')
  ) {
    return 'warn';
  }
  return 'ready';
};

const formatNumber = (value: unknown, digits = 2) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

export const MapBasedModulePanel = () => {
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const sourceFeedSocketRef = useRef<WebSocket | null>(null);
  const backendFeedSocketRef = useRef<WebSocket | null>(null);
  const [modelFileName, setModelFileName] = useState<string | null>(null);
  const [tileMatcherBackend, setTileMatcherBackend] = useState('native');
  const [visualMapDbPath, setVisualMapDbPath] = useState('');
  const [visualProbe, setVisualProbe] = useState<any | null>(null);
  const [visualSelfTest, setVisualSelfTest] = useState<any | null>(null);
  const [visualStatus, setVisualStatus] = useState<string | null>(null);
  const [visualBusy, setVisualBusy] = useState(false);

  const [liveFeedUrlInput, setLiveFeedUrlInput] = useState(DEFAULT_LIVE_FEED_URL);
  const [liveFeedUrlSaved, setLiveFeedUrlSaved] = useState<string | null>(DEFAULT_LIVE_FEED_URL);
  const [isEditingLiveFeed, setIsEditingLiveFeed] = useState(false);
  const [telemetryUrlInput, setTelemetryUrlInput] = useState(DEFAULT_TELEMETRY_URL);
  const [telemetryUrlSaved, setTelemetryUrlSaved] = useState<string | null>(DEFAULT_TELEMETRY_URL);
  const [isEditingTelemetry, setIsEditingTelemetry] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualCompass, setManualCompass] = useState('');
  const [useManualInit, setUseManualInit] = useState(false);
  const [mapMatchStatus, setMapMatchStatus] = useState<string | null>(null);
  const [lastInit, setLastInit] = useState<{ lat: number; lon: number; compass: number } | null>(null);
  const [liveFeedStatus, setLiveFeedStatus] = useState<string | null>(null);
  const [apcResult, setApcResult] = useState<any | null>(null);
  const [mapMatchBusy, setMapMatchBusy] = useState(false);

  const logPanelStatus = (scope: string, status: string | null) => {
    if (!status) return;
    const normalized = status.trim();
    if (!normalized) return;
    const lower = normalized.toLowerCase();

    if (
      lower.includes('fail') ||
      lower.includes('error') ||
      lower.includes('missing') ||
      lower.includes('invalid') ||
      lower.includes('disconnected') ||
      lower.includes('no coordinates')
    ) {
      console.error(`[${scope}] ${normalized}`);
      return;
    }

    if (lower.includes('warning') || lower.includes('waiting')) {
      console.warn(`[${scope}] ${normalized}`);
      return;
    }

    console.info(`[${scope}] ${normalized}`);
  };

  useEffect(() => {
    logPanelStatus('APC', mapMatchStatus);
  }, [mapMatchStatus]);

  useEffect(() => {
    logPanelStatus('Visual Localization', visualStatus);
  }, [visualStatus]);

  useEffect(() => {
    logPanelStatus('Live Feed', liveFeedStatus);
  }, [liveFeedStatus]);

  useEffect(() => {
    const savedFeed = localStorage.getItem('chaox.liveFeedUrl');
    const savedTelemetry = localStorage.getItem('chaox.telemetryUrl');
    if (savedFeed) {
      setLiveFeedUrlSaved(savedFeed);
      setLiveFeedUrlInput(savedFeed);
      setIsEditingLiveFeed(false);
    } else {
      localStorage.setItem('chaox.liveFeedUrl', DEFAULT_LIVE_FEED_URL);
    }
    if (savedTelemetry) {
      setTelemetryUrlSaved(savedTelemetry);
      setTelemetryUrlInput(savedTelemetry);
      setIsEditingTelemetry(false);
    } else {
      localStorage.setItem('chaox.telemetryUrl', DEFAULT_TELEMETRY_URL);
    }
  }, []);

  useEffect(() => {
    return () => {
      sourceFeedSocketRef.current?.close();
      backendFeedSocketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadVisualLocalization = async () => {
      try {
        const response = await fetch(`${API_BASE}/integrations/visual-localization`);
        if (!response.ok) {
          throw new Error(`Vendored module load failed (${response.status})`);
        }
        const payload = await response.json();
        if (cancelled) return;
        const config = payload.config || {};
        setVisualMapDbPath(config.map_db_path || localStorage.getItem('chaox.visualMapDbPath') || '');
        setTileMatcherBackend(config.enabled ? 'visual_localization' : 'native');
        setVisualProbe(payload.probe || null);
      } catch (error) {
        if (!cancelled) {
          setVisualStatus(error instanceof Error ? error.message : 'Failed to load internal visual localization module');
        }
      }
    };

    void loadVisualLocalization();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveLiveFeed = () => {
    const trimmed = liveFeedUrlInput.trim();
    if (!trimmed) return;
    localStorage.setItem('chaox.liveFeedUrl', trimmed);
    setLiveFeedUrlSaved(trimmed);
    setIsEditingLiveFeed(false);
  };

  const handleSaveTelemetry = () => {
    const trimmed = telemetryUrlInput.trim();
    if (!trimmed) return;
    localStorage.setItem('chaox.telemetryUrl', trimmed);
    setTelemetryUrlSaved(trimmed);
    setIsEditingTelemetry(false);
  };

  const handleConnectLiveFeed = () => {
    if (!liveFeedUrlSaved) {
      setLiveFeedStatus('Set a live feed URL first.');
      return;
    }
    const backendCameraWs = `${DEFAULT_WS_BASE}/camera`;

    if (liveFeedUrlSaved === backendCameraWs) {
      setLiveFeedStatus(`Backend camera ingest is configured at ${backendCameraWs}. Waiting for a producer to push frames.`);
      return;
    }

    sourceFeedSocketRef.current?.close();
    backendFeedSocketRef.current?.close();

    const sourceSocket = new WebSocket(liveFeedUrlSaved);
    const backendSocket = new WebSocket(backendCameraWs);

    sourceFeedSocketRef.current = sourceSocket;
    backendFeedSocketRef.current = backendSocket;

    backendSocket.onopen = () => {
      setLiveFeedStatus(`Backend ingest ready at ${backendCameraWs}`);
    };

    sourceSocket.onopen = () => {
      setLiveFeedStatus(`Bridging live feed from ${liveFeedUrlSaved}`);
    };

    sourceSocket.onmessage = (event) => {
      if (typeof event.data === 'string' && backendSocket.readyState === WebSocket.OPEN) {
        backendSocket.send(event.data);
      }
    };

    sourceSocket.onerror = () => {
      setLiveFeedStatus('Source live feed connection failed.');
    };

    backendSocket.onerror = () => {
      setLiveFeedStatus('Backend camera ingest connection failed.');
    };

    sourceSocket.onclose = () => {
      setLiveFeedStatus('Source live feed disconnected.');
    };
  };

  const handleMapMatch = async () => {
    try {
      setMapMatchBusy(true);
      setMapMatchStatus('Resolving initial pose...');

      let initLat: number | null = null;
      let initLon: number | null = null;
      let initYaw: number | null = null;

      if (useManualInit) {
        initLat = Number(manualLat);
        initLon = Number(manualLon);
        initYaw = Number(manualCompass);
        if (![initLat, initLon, initYaw].every((value) => Number.isFinite(value))) {
          setMapMatchStatus('Enter valid manual lat/lon/compass.');
          return;
        }
      } else if (telemetryUrlSaved && !(telemetryUrlSaved.startsWith('ws://') || telemetryUrlSaved.startsWith('wss://'))) {
        const res = await fetch(telemetryUrlSaved);
        if (!res.ok) {
          setMapMatchStatus(`Telemetry failed (${res.status}).`);
          return;
        }
        const data = await res.json();
        initLat = Number(data.lat);
        initLon = Number(data.lon);
        initYaw = Number(data.compass ?? data.yaw ?? 0);
        if (![initLat, initLon, initYaw].every((value) => Number.isFinite(value))) {
          setMapMatchStatus('Telemetry missing valid lat/lon/yaw fields.');
          return;
        }
      } else if (telemetryUrlSaved && (telemetryUrlSaved.startsWith('ws://') || telemetryUrlSaved.startsWith('wss://'))) {
        const res = await fetch(`${API_BASE}/telemetry/${DEFAULT_SIM_VEHICLE_ID}`);
        if (!res.ok) {
          setMapMatchStatus(`Telemetry snapshot failed (${res.status}).`);
          return;
        }
        const data = await res.json();
        initLat = Number(data.lat);
        initLon = Number(data.lon);
        initYaw = Number(data.compass ?? data.yaw ?? 0);
        const hasPose = [initLat, initLon, initYaw].every((value) => Number.isFinite(value)) && !(initLat === 0 && initLon === 0);
        if (!hasPose) {
          setMapMatchStatus('Start the simulator flight first so telemetry can seed localization.');
          return;
        }
      } else if (lastInit) {
        initLat = lastInit.lat;
        initLon = lastInit.lon;
        initYaw = lastInit.compass;
      } else {
        setMapMatchStatus('Set manual init or an HTTP telemetry source before locating.');
        return;
      }

      setLastInit({ lat: initLat!, lon: initLon!, compass: initYaw! });

      if (tileMatcherBackend === 'visual_localization') {
        const saveResponse = await fetch(`${API_BASE}/integrations/visual-localization`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            map_db_path: visualMapDbPath || null,
            device: 'cpu',
            resize_size: 800,
            matcher_backend: 'superpoint_superglue',
            enabled: true,
          }),
        });
        if (!saveResponse.ok) {
          setMapMatchStatus(`Visual localization provider save failed (${saveResponse.status}).`);
          return;
        }
      }

      setMapMatchStatus('Running localization on latest frame...');
      const response = await fetch(`${API_BASE}/apc/frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frame_id: `ui-${Date.now()}`,
          timestamp: new Date().toISOString(),
          lat: initLat,
          lon: initLon,
          yaw: initYaw,
          meta: {
            requested_from: 'map_based_module_panel',
            backend: tileMatcherBackend,
          },
        }),
      });

      if (!response.ok) {
        setMapMatchStatus(`Localization request failed (${response.status}).`);
        return;
      }

      const payload = await response.json();
      setApcResult(payload);
      if (payload.lat !== null && payload.lon !== null) {
        setMapMatchStatus(
          `Located by ${payload.source}: ${Number(payload.lat).toFixed(6)}, ${Number(payload.lon).toFixed(6)}`
        );
      } else {
        setMapMatchStatus(`Localization returned no coordinates. Source: ${payload.source}`);
      }
    } catch {
      setMapMatchStatus('Localization request failed.');
    } finally {
      setMapMatchBusy(false);
    }
  };

  const handleModelPick = () => {
    modelInputRef.current?.click();
  };

  const handleModelChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    setModelFileName(file ? file.name : null);
  };

  const handleProbeVisualLocalization = async () => {
    setVisualBusy(true);
    setVisualStatus('Checking internal visual localization module...');
    try {
      const response = await fetch(`${API_BASE}/integrations/visual-localization/probe`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Probe failed (${response.status})`);
      }
      const payload = await response.json();
      setVisualProbe(payload);
      setVisualStatus(payload.valid ? 'Internal visual localization module is ready.' : payload.reason || 'Module check failed.');
    } catch (error) {
      setVisualStatus(error instanceof Error ? error.message : 'Probe failed');
    } finally {
      setVisualBusy(false);
    }
  };

  const handleUseVisualLocalization = async () => {
    setVisualBusy(true);
    setVisualStatus('Saving vendored visual localization config...');
    try {
      const response = await fetch(`${API_BASE}/integrations/visual-localization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          map_db_path: visualMapDbPath || null,
          device: 'cpu',
          resize_size: 800,
          matcher_backend: 'superpoint_superglue',
          enabled: tileMatcherBackend === 'visual_localization',
        }),
      });
      if (!response.ok) {
        throw new Error(`Save failed (${response.status})`);
      }
      const payload = await response.json();
      setVisualProbe(payload.probe || null);
      if (visualMapDbPath) {
        localStorage.setItem('chaox.visualMapDbPath', visualMapDbPath);
      }
      setVisualStatus(payload.probe?.valid ? 'Vendored visual localization config saved.' : 'Config saved, but the internal module is not ready yet.');
    } catch (error) {
      setVisualStatus(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setVisualBusy(false);
    }
  };

  const handleVisualLocalizationSelfTest = async () => {
    setVisualBusy(true);
    setVisualStatus('Running internal visual localization self-test...');
    try {
      const response = await fetch(`${API_BASE}/integrations/visual-localization/self-test`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Self-test failed (${response.status})`);
      }
      const payload = await response.json();
      setVisualSelfTest(payload);
      setVisualStatus(payload.ok ? 'Internal visual localization self-test passed.' : payload.reason || 'Self-test failed.');
    } catch (error) {
      setVisualStatus(error instanceof Error ? error.message : 'Self-test failed');
    } finally {
      setVisualBusy(false);
    }
  };

  const handleUseCachedVisualDb = async () => {
    setVisualBusy(true);
    setVisualStatus('Loading active cache-backed visual localization DB...');
    try {
      const response = await fetch(`${API_BASE}/tiles/visual-localization-db`);
      if (!response.ok) {
        throw new Error(`Cache DB lookup failed (${response.status})`);
      }
      const payload = await response.json();
      const activePath = payload.active_map_db_path;
      if (!activePath) {
        throw new Error('No cache-backed visual localization DB is active yet.');
      }
      setVisualMapDbPath(activePath);
      localStorage.setItem('chaox.visualMapDbPath', activePath);
      setVisualStatus(`Loaded cache-backed DB: ${activePath}`);
    } catch (error) {
      setVisualStatus(error instanceof Error ? error.message : 'Cache DB lookup failed');
    } finally {
      setVisualBusy(false);
    }
  };

  const backendLabel =
    tileMatcherBackend === 'visual_localization'
      ? 'Visual Localization'
      : tileMatcherBackend === 'orb'
        ? 'ORB + RANSAC'
        : 'Native APC';
  const trackingState = mapMatchBusy ? 'Locating' : apcResult ? 'Tracking' : 'Standby';
  const fusionState = useManualInit ? 'Manual Init' : lastInit ? 'Telemetry Locked' : 'Ignoring';
  const latestLatitude =
    typeof apcResult?.lat === 'number' && Number.isFinite(apcResult.lat)
      ? apcResult.lat
      : lastInit?.lat ?? null;
  const latestLongitude =
    typeof apcResult?.lon === 'number' && Number.isFinite(apcResult.lon)
      ? apcResult.lon
      : lastInit?.lon ?? null;
  const latestConfidence =
    typeof apcResult?.confidence === 'number' && Number.isFinite(apcResult.confidence)
      ? apcResult.confidence
      : null;
  const latestErrorRadius =
    typeof apcResult?.error_radius_m === 'number' && Number.isFinite(apcResult.error_radius_m)
      ? apcResult.error_radius_m
      : null;
  const mapMatchTone = classifyStatusTone(mapMatchStatus);
  const liveFeedTone = classifyStatusTone(liveFeedStatus);
  const visualTone = visualProbe?.valid ? 'ready' : classifyStatusTone(visualStatus);
  const fusionTone = trackingState === 'Tracking' ? 'ready' : trackingState === 'Locating' ? 'warn' : 'idle';

  return (
    <div className="h-full flex flex-col bg-panel border-r border-panel-border">
      <div className="p-3 border-b border-panel-border">
        <div className="space-y-2">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-[0.14em]">Map-Based Module</div>
            <div className="text-sm font-semibold text-foreground">Absolute Position Correction</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-border/60 bg-background/60 text-[10px] uppercase tracking-[0.12em]">
              Night VPS
            </Badge>
            <Badge variant="outline" className="border-border/60 bg-background/60 text-[10px] uppercase tracking-[0.12em]">
              LiveNav
            </Badge>
            <Badge variant="outline" className="border-border/60 bg-background/60 text-[10px] uppercase tracking-[0.12em]">
              IMU + Visual
            </Badge>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <div className="rounded-xl border border-border/60 bg-gradient-to-b from-background/90 to-background/60 p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SectionLabel>Operations Overview</SectionLabel>
                <div className="mt-1 text-sm font-semibold text-foreground">Absolute Position Correction Console</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Sensor-constrained visual localization with tile voting and fine alignment.
                </div>
              </div>
              <div className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${statusToneClasses[fusionTone]}`}>
                {trackingState}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MetricTile label="Latitude" value={latestLatitude !== null ? formatNumber(latestLatitude, 6) : '--'} />
              <MetricTile label="Longitude" value={latestLongitude !== null ? formatNumber(latestLongitude, 6) : '--'} />
              <MetricTile
                label="Confidence"
                value={latestConfidence !== null ? formatNumber(latestConfidence, 2) : '--'}
                hint="Latest localization confidence"
              />
              <MetricTile
                label="Error Radius"
                value={latestErrorRadius !== null ? `${formatNumber(latestErrorRadius, 1)} m` : '--'}
                hint="Estimated absolute fix uncertainty"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-lg border p-2 ${statusToneClasses[liveFeedTone]}`}>
                <div className="text-[10px] uppercase tracking-[0.12em]">Feed Link</div>
                <div className="mt-1 text-xs font-semibold text-foreground">
                  {liveFeedStatus || 'Waiting for frames'}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Backend</div>
                <div className="mt-1 text-xs font-semibold text-foreground">{backendLabel}</div>
              </div>
              <div className={`rounded-lg border p-2 ${statusToneClasses[visualTone]}`}>
                <div className="text-[10px] uppercase tracking-[0.12em]">Visual DB</div>
                <div className="mt-1 text-xs font-semibold text-foreground">
                  {visualProbe?.valid ? 'Vendor ready' : visualStatus || 'Not configured'}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Fusion State</div>
                <div className="mt-1 text-xs font-semibold text-foreground">{fusionState}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-3">
            <SectionLabel>System Structure</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Camera Frame', 'Preprocessing', 'Abstraction', 'Tile Matching', 'Voting', 'Refinement', 'Absolute Output'].map((stage) => (
                <div
                  key={stage}
                  className="rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-foreground"
                >
                  {stage}
                </div>
              ))}
            </div>
            <div className="hidden text-[11px] text-muted-foreground">
              Camera Frame → Preprocessing → Abstraction → Tile Matching → Voting → Refinement → Absolute Output
            </div>
          </div>

          <Accordion type="multiple" defaultValue={['map-db', 'sensor', 'abstraction']} className="space-y-3">
            <AccordionItem value="map-db" className="rounded-xl border border-border/60 bg-background/60 px-3">
              <AccordionTrigger className="text-sm">1. Map Database Manager</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Map Import</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm">Load 4x4 km Patch</Button>
                    <Button variant="outline" size="sm">Batch Import Tiles</Button>
                  </div>

                  <SectionLabel>Map Settings</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Resolution">
                      <Select defaultValue="20cm">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10cm">10cm</SelectItem>
                          <SelectItem value="20cm">20cm</SelectItem>
                          <SelectItem value="50cm">50cm</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Projection">
                      <Select defaultValue="WGS84">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WGS84">WGS84</SelectItem>
                          <SelectItem value="UTM">Local UTM</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Precompute Abstract">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Precompute Pyramid">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Performance</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="GPU Preprocessing">
                      <Switch />
                    </ControlRow>
                    <div>
                      <div className="text-xs text-foreground mb-2">Cache Size (MB)</div>
                      <Slider defaultValue={[256]} min={64} max={2048} step={64} />
                    </div>
                    <Button variant="outline" size="sm">Clear Map Cache</Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="sensor" className="rounded-xl border border-border/60 bg-background/60 px-3">
              <AccordionTrigger className="text-sm">2. Sensor Constraint Panel</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Orientation</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Use IMU Roll/Pitch">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Use Compass Heading">
                      <Switch />
                    </ControlRow>
                    <div>
                      <div className="text-xs text-foreground mb-2">Heading Offset (°)</div>
                      <Slider defaultValue={[0]} min={-30} max={30} step={1} />
                    </div>
                  </div>

                  <SectionLabel>Altitude</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Use Barometric Scaling">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Manual Altitude">
                      <Input className="h-8 w-[120px] text-xs" placeholder="Meters" />
                    </ControlRow>
                    <div>
                      <div className="text-xs text-foreground mb-2">Scale Multiplier</div>
                      <Slider defaultValue={[1]} min={0.8} max={1.2} step={0.01} />
                    </div>
                  </div>

                  <SectionLabel>Camera</SectionLabel>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm">Upload Intrinsics</Button>
                    <ControlRow label="Auto Undistort">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="FOV Angle">
                      <Input className="h-8 w-[120px] text-xs" placeholder="Degrees" />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="abstraction" className="rounded-xl border border-border/60 bg-background/60 px-3">
              <AccordionTrigger className="text-sm">3. Abstraction Engine Control</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Model</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <input
                        ref={modelInputRef}
                        type="file"
                        accept=".onnx,.pt,.pth,.engine,.trt,.bin,.zip,.safetensors"
                        className="hidden"
                        onChange={handleModelChange}
                      />
                      <Button variant="outline" size="sm" onClick={handleModelPick}>Load Model</Button>
                      {modelFileName && (
                        <div className="text-[10px] text-muted-foreground truncate">Loaded: {modelFileName}</div>
                      )}
                    </div>
                    <Select defaultValue="v1.3">
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Version" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="v1.3">v1.3</SelectItem>
                        <SelectItem value="v1.2">v1.2</SelectItem>
                        <SelectItem value="v1.1">v1.1</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="col-span-2 space-y-2">
                      <div className="rounded-md border border-border/60 bg-background/60 p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Vendored Visual Localization</div>
                          <Badge variant={visualProbe?.valid ? 'secondary' : 'outline'}>
                            {visualProbe?.valid ? 'internal module ready' : 'not ready'}
                          </Badge>
                        </div>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Map DB path"
                          value={visualMapDbPath}
                          onChange={(event) => setVisualMapDbPath(event.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" size="sm" onClick={handleProbeVisualLocalization} disabled={visualBusy}>
                            Check Vendor
                          </Button>
                          <Button size="sm" onClick={handleUseVisualLocalization} disabled={visualBusy}>
                            Save Config
                          </Button>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleUseCachedVisualDb} disabled={visualBusy}>
                          Use Cached Tile DB
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleVisualLocalizationSelfTest} disabled={visualBusy}>
                          Run Self-Test
                        </Button>
                        {visualProbe?.source_root && (
                          <div className="text-[10px] text-muted-foreground break-all">
                            Vendored source: {visualProbe.source_root}
                          </div>
                        )}
                        {visualSelfTest && (
                          <div className="rounded-md border border-border/60 bg-background/60 p-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Self-Test</div>
                              <Badge variant={visualSelfTest.ok ? 'secondary' : 'destructive'}>
                                {visualSelfTest.ok ? 'pass' : 'fail'}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Stage: {visualSelfTest.stage || '--'}
                            </div>
                            {visualSelfTest.map_mode && (
                              <div className="text-[11px] text-muted-foreground">
                                Map mode: {visualSelfTest.map_mode}
                              </div>
                            )}
                            {visualSelfTest.num_map_images !== undefined && (
                              <div className="text-[11px] text-muted-foreground">
                                Indexed images: {visualSelfTest.num_map_images}
                              </div>
                            )}
                            {visualSelfTest.reason && (
                              <div className="text-[11px] text-muted-foreground">
                                {visualSelfTest.reason}
                              </div>
                            )}
                          </div>
                        )}
                        {visualStatus && (
                          <div className="text-[11px] text-muted-foreground">{visualStatus}</div>
                        )}
                      </div>
                      <ControlRow label="Fine-Tuned Model">
                        <Switch />
                      </ControlRow>
                      <ControlRow label="Multi-Decoder Mode">
                        <Switch />
                      </ControlRow>
                    </div>
                  </div>

                  <SectionLabel>Inference</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Latent Dimensionality">
                      <div className="text-xs text-muted-foreground">128</div>
                    </ControlRow>
                    <ControlRow label="Inference Resolution">
                      <Select defaultValue="512">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Resolution" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="256">256</SelectItem>
                          <SelectItem value="512">512</SelectItem>
                          <SelectItem value="1024">1024</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Mixed Precision">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="TensorRT Optimization">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Preview</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Show Raw Frame">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Show Abstract Output">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Side-by-Side">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Edge Overlay">
                      <Switch />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tile-matching" className="rounded-xl border border-border/60 bg-background/60 px-3">
              <AccordionTrigger className="text-sm">4. Tile Matching Engine</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Tile Settings</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={handleMapMatch} disabled={mapMatchBusy}>
                      {mapMatchBusy ? 'Locating...' : 'Locate Drone'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleConnectLiveFeed}>Drone Live Feed</Button>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/60 p-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Drone Live Feed</div>
                    {isEditingLiveFeed ? (
                      <div className="flex gap-2">
                        <Input className="h-8 text-xs" placeholder={DEFAULT_LIVE_FEED_URL} value={liveFeedUrlInput} onChange={(e) => setLiveFeedUrlInput(e.target.value)} />
                        <Button size="sm" onClick={handleSaveLiveFeed}>Save</Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-muted-foreground truncate">{liveFeedUrlSaved}</div>
                        <Button variant="outline" size="sm" onClick={() => setIsEditingLiveFeed(true)}>Edit</Button>
                      </div>
                    )}
                    {liveFeedStatus && <div className="text-[11px] text-muted-foreground">{liveFeedStatus}</div>}
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/60 p-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Map Matching Init</div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-foreground">Use Manual Entry</div>
                      <Switch checked={useManualInit} onCheckedChange={(v) => setUseManualInit(Boolean(v))} />
                    </div>
                    {useManualInit ? (
                      <div className="grid grid-cols-3 gap-2">
                        <Input className="h-8 text-xs" placeholder="Lat" value={manualLat} onChange={(e) => setManualLat(e.target.value)} />
                        <Input className="h-8 text-xs" placeholder="Lon" value={manualLon} onChange={(e) => setManualLon(e.target.value)} />
                        <Input className="h-8 text-xs" placeholder="Compass" value={manualCompass} onChange={(e) => setManualCompass(e.target.value)} />
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {isEditingTelemetry ? (
                          <>
                            <Input className="h-8 text-xs" placeholder={DEFAULT_TELEMETRY_URL} value={telemetryUrlInput} onChange={(e) => setTelemetryUrlInput(e.target.value)} />
                            <Button size="sm" onClick={handleSaveTelemetry}>Save</Button>
                          </>
                        ) : (
                          <>
                            <div className="text-[11px] text-muted-foreground truncate">{telemetryUrlSaved}</div>
                            <Button variant="outline" size="sm" onClick={() => setIsEditingTelemetry(true)}>Edit</Button>
                          </>
                        )}
                      </div>
                    )}
                    {lastInit && (
                      <div className="text-[11px] text-muted-foreground">Init: {lastInit.lat.toFixed(5)}, {lastInit.lon.toFixed(5)} ? {lastInit.compass.toFixed(1)}?</div>
                    )}
                    {mapMatchStatus && <div className="text-[11px] text-muted-foreground">{mapMatchStatus}</div>}
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/60 p-2">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">AI/ML Feed</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {liveFeedStatus || 'Waiting for frames...'}
                    </div>
                  </div>
                  {apcResult && (
                    <div className="rounded-md border border-border/60 bg-background/60 p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Latest Fix</div>
                        <Badge variant="secondary">{apcResult.source || 'apc'}</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Lat/Lon: {apcResult.lat?.toFixed?.(6) ?? '--'}, {apcResult.lon?.toFixed?.(6) ?? '--'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Confidence: {apcResult.confidence ?? '--'} | Error Radius: {apcResult.error_radius_m ?? '--'} m
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <ControlRow label="Tile Size (m)">
                      <Input className="h-8 w-[120px] text-xs" placeholder="64" />
                    </ControlRow>
                    <div>
                      <div className="text-xs text-foreground mb-2">Overlap %</div>
                      <Slider defaultValue={[30]} min={0} max={80} step={1} />
                    </div>
                    <ControlRow label="Tiles Per Frame">
                      <Input className="h-8 w-[120px] text-xs" placeholder="16" />
                    </ControlRow>
                    <ControlRow label="Adaptive Tile Mode">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Matching</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Tile Matching Backend">
                      <Select
                        value={tileMatcherBackend}
                        onValueChange={(value) => {
                          setTileMatcherBackend(value);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[180px] text-xs">
                          <SelectValue placeholder="Backend" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="native">Native APC</SelectItem>
                          <SelectItem value="orb">ORB + RANSAC</SelectItem>
                          <SelectItem value="visual_localization">Visual Localization</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    {tileMatcherBackend === 'visual_localization' && (
                      <div className="rounded-md border border-border/60 bg-background/60 p-2 text-[11px] text-muted-foreground">
                        {visualProbe?.valid
                          ? 'Using internal visual localization pipeline.'
                          : 'Visual localization is selected, but the internal module is not ready yet.'}
                      </div>
                    )}
                    <ControlRow label="Similarity Metric">
                      <Select defaultValue="cosine">
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue placeholder="Metric" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cosine">Cosine</SelectItem>
                          <SelectItem value="l2">L2</SelectItem>
                          <SelectItem value="structural">Structural Correlation</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Multi-Scale Search">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Pyramid Levels">
                      <Select defaultValue="3">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Levels" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Search Radius (m)">
                      <Input className="h-8 w-[120px] text-xs" placeholder="250" />
                    </ControlRow>
                    <ControlRow label="Dynamic Radius (VIO)">
                      <Switch />
                    </ControlRow>
                    <Button variant="destructive" size="sm">Global Search Mode</Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="voting" className="rounded-xl border border-border/60 bg-background/60 px-3">
              <AccordionTrigger className="text-sm">5. Voting & Confidence</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Consensus</SectionLabel>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-foreground mb-2">Minimum Tile Agreement</div>
                      <Slider defaultValue={[60]} min={0} max={100} step={1} />
                    </div>
                    <div>
                      <div className="text-xs text-foreground mb-2">Confidence Threshold</div>
                      <Slider defaultValue={[0.7]} min={0} max={1} step={0.01} />
                    </div>
                    <ControlRow label="Max Spatial Variance (m)">
                      <Input className="h-8 w-[120px] text-xs" placeholder="35" />
                    </ControlRow>
                    <ControlRow label="Reject Outliers">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Temporal Stability</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Consecutive Matches">
                      <Input className="h-8 w-[120px] text-xs" placeholder="3" />
                    </ControlRow>
                    <ControlRow label="Temporal Smoothing">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Motion Consistency">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Drift Detection</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Warning Threshold (m)">
                      <Input className="h-8 w-[120px] text-xs" placeholder="25" />
                    </ControlRow>
                    <ControlRow label="Hard Reset Trigger">
                      <Switch />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="refinement" className="rounded-xl border border-border/60 bg-background/60 px-3">
              <AccordionTrigger className="text-sm">6. Coarse-to-Fine Refinement</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Coarse Stage</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Enable Coarse Localization">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Downsample Level">
                      <Select defaultValue="2">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Confidence Display">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Fine Stage</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Enable Fine Alignment">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Edge Alignment Weight">
                      <Input className="h-8 w-[120px] text-xs" placeholder="0.6" />
                    </ControlRow>
                    <ControlRow label="Road Intersection Weight">
                      <Input className="h-8 w-[120px] text-xs" placeholder="0.2" />
                    </ControlRow>
                    <ControlRow label="Building Overlap Weight">
                      <Input className="h-8 w-[120px] text-xs" placeholder="0.2" />
                    </ControlRow>
                    <ControlRow label="Subpixel Optimization">
                      <Switch />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="output" className="rounded-xl border border-border/60 bg-background/60 px-3">
              <AccordionTrigger className="text-sm">7. Output + Diagnostics</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Live Data</SectionLabel>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Latitude</div>
                      <div className="font-mono text-foreground">{latestLatitude !== null ? formatNumber(latestLatitude, 6) : '--'}</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Longitude</div>
                      <div className="font-mono text-foreground">{latestLongitude !== null ? formatNumber(latestLongitude, 6) : '--'}</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Backend</div>
                      <div className="font-mono text-foreground">{backendLabel}</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Confidence</div>
                      <div className="font-mono text-foreground">{latestConfidence !== null ? formatNumber(latestConfidence, 2) : '--'}</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Error Radius</div>
                      <div className="font-mono text-foreground">{latestErrorRadius !== null ? `${formatNumber(latestErrorRadius, 1)} m` : '--'}</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Tracking State</div>
                      <div className={mapMatchTone === 'error' ? 'font-mono text-destructive' : 'font-mono text-foreground'}>{trackingState}</div>
                    </div>
                  </div>

                  <SectionLabel>Visualization</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Drone on Map">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Tile Vote Heatmap">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Search Region">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Drift Graph">
                      <Switch />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="failsafe" className="rounded-xl border border-border/60 bg-background/60 px-3">
              <AccordionTrigger className="text-sm">8. Failsafe & Safety</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Policy</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Freeze If Confidence < X">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="No Match → VIO Only">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Ambiguous → Operator Confirm">
                      <Switch />
                    </ControlRow>
                    <Button variant="destructive" size="sm">Emergency Global Relocalize</Button>
                    <Button variant="outline" size="sm">Switch to Relative-Only</Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
};
