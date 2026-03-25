import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  AlertCircle,
  Target,
  MoreVertical,
  Lock,
  Zap,
  Eye,
  RefreshCcw,
  Loader2,
  Radar,
  Video,
  Plane,
  Car,
  User,
  Ship,
  Boxes,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Crosshair,
} from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from './ui/dropdown-menu';

const API_BASE = import.meta.env.VITE_CHAOX_API_BASE || 'http://localhost:9000';
const TRACKER_MJPEG_URL = import.meta.env.VITE_ICON_TRACKER_STREAM || `${API_BASE}/integrations/icon-tracker/stream.mjpg`;

interface TrackerDetection {
  track_id: number;
  class_name: string;
  confidence: number;
}

interface TrackerModelButton {
  name: string;
  path: string;
  icon: string;
  classes: string[];
}

interface TrackerStatusPayload {
  status: string;
  result: string;
  tracking_enabled: boolean;
  selected_track_id: number | null;
  selected_model: string | null;
  selected_model_path?: string | null;
  selected_model_classes?: string[];
  enabled_classes: string[];
  camera_speed_scale?: number;
  yaw?: number;
  pitch?: number;
  detections: TrackerDetection[];
  models?: TrackerModelButton[];
}

const confidenceToPriority = (confidence: number) => {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.55) return 'Medium';
  return 'Low';
};

const priorityBadgeClass = (priority: string) => {
  if (priority === 'High') return 'bg-slate-100 text-slate-900';
  if (priority === 'Medium') return 'bg-slate-200/85 text-slate-900';
  return 'bg-slate-700 text-slate-200';
};

const normalizeTrackerPayload = (payload: any): TrackerStatusPayload | null => {
  if (!payload) return null;
  if (payload.status && payload.status.detections) return payload.status as TrackerStatusPayload;
  if (payload.detections) return payload as TrackerStatusPayload;
  return null;
};

const modelIconFor = (iconKey?: string) => {
  switch ((iconKey || '').toLowerCase()) {
    case 'aircraft':
      return Plane;
    case 'vehicle':
      return Car;
    case 'person':
      return User;
    case 'vessel':
      return Ship;
    case 'drone':
      return Radar;
    default:
      return Boxes;
  }
};

export const TargetingPanel = () => {
  const [search, setSearch] = useState('');
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatusPayload | null>(null);
  const [trackerBusy, setTrackerBusy] = useState(false);
  const [trackerError, setTrackerError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [speedScale, setSpeedScale] = useState(1);
  const [streamNonce, setStreamNonce] = useState(Date.now());
  const [streamLive, setStreamLive] = useState(false);
  const statusInFlightRef = useRef(false);
  const statusAbortRef = useRef<AbortController | null>(null);

  const refreshTrackerStatus = async (force = false) => {
    if (statusInFlightRef.current && !force) {
      return;
    }

    if (force && statusAbortRef.current) {
      statusAbortRef.current.abort();
    }

    const controller = new AbortController();
    statusAbortRef.current = controller;
    statusInFlightRef.current = true;
    try {
      const response = await fetch(`${API_BASE}/integrations/icon-tracker/status`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || `Status failed (${response.status})`);
      }
      const normalized = normalizeTrackerPayload(payload);
      if (!normalized) {
        throw new Error('Invalid status response from icon tracker.');
      }
      setTrackerStatus(normalized);
      if (typeof normalized.camera_speed_scale === 'number') {
        setSpeedScale(normalized.camera_speed_scale);
      }
      setTrackerError(null);
      setLastUpdated(new Date().toISOString());
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to reach icon tracker service.';
      setTrackerError(message);
      console.error('[Icon Tracker] status refresh failed:', message);
    } finally {
      if (statusAbortRef.current === controller) {
        statusAbortRef.current = null;
      }
      statusInFlightRef.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      if (cancelled) {
        return;
      }
      await refreshTrackerStatus(false);
      if (cancelled) {
        return;
      }
      const nextMs = document.hidden ? 2500 : 1000;
      timer = window.setTimeout(() => {
        void poll();
      }, nextMs);
    };

    void poll();
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void refreshTrackerStatus(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer != null) {
        window.clearTimeout(timer);
      }
      if (statusAbortRef.current) {
        statusAbortRef.current.abort();
        statusAbortRef.current = null;
      }
    };
  }, []);

  const postTrackerAction = async (
    path: string,
    body: Record<string, unknown> = {},
    options: { useBusy?: boolean } = {}
  ) => {
    const useBusy = options.useBusy ?? false;
    if (useBusy) {
      setTrackerBusy(true);
    }
    if (statusAbortRef.current) {
      statusAbortRef.current.abort();
      statusAbortRef.current = null;
      statusInFlightRef.current = false;
    }
    try {
      const response = await fetch(`${API_BASE}/integrations/icon-tracker/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Action failed (${response.status})`);
      }
      const normalized = normalizeTrackerPayload(payload);
      if (normalized) {
        setTrackerStatus(normalized);
        if (typeof normalized.camera_speed_scale === 'number') {
          setSpeedScale(normalized.camera_speed_scale);
        }
      }
      setTrackerError(null);
      setLastUpdated(new Date().toISOString());
      console.info(`[Icon Tracker] action ok: ${path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tracker action failed';
      setTrackerError(message);
      console.error('[Icon Tracker] action failed:', path, message);
    } finally {
      if (useBusy) {
        setTrackerBusy(false);
      }
    }
  };

  const moveHoldHandlers = (yaw: number, pitch: number) => ({
    onPointerDown: () => void postTrackerAction('move', { yaw, pitch }, { useBusy: false }),
    onPointerUp: () => void postTrackerAction('stop-motion', {}, { useBusy: false }),
    onPointerLeave: () => void postTrackerAction('stop-motion', {}, { useBusy: false }),
    onPointerCancel: () => void postTrackerAction('stop-motion', {}, { useBusy: false }),
  });

  const handleToggleTracking = async () => {
    if (trackerStatus?.tracking_enabled) {
      await postTrackerAction('toggle-tracking');
      return;
    }

    if (trackerStatus?.selected_track_id == null && (trackerStatus?.detections || []).length > 0) {
      const best = [...(trackerStatus?.detections || [])].sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];
      if (best?.track_id != null) {
        await postTrackerAction('select-target', { track_id: best.track_id });
      }
    }

    await postTrackerAction('toggle-tracking');
  };

  const targets = useMemo(
    () =>
      (trackerStatus?.detections || [])
        .map((detection) => {
          const priority = confidenceToPriority(Number(detection.confidence || 0));
          const confidence = Math.round(Number(detection.confidence || 0) * 100);
          const targetId = `T-${String(detection.track_id).padStart(3, '0')}`;
          const isSelected = trackerStatus?.selected_track_id === detection.track_id;
          const status = isSelected ? (trackerStatus?.tracking_enabled ? 'Tracking' : 'Locked') : 'Detected';
          return {
            rawId: detection.track_id,
            id: targetId,
            type: detection.class_name || 'Unknown',
            priority,
            confidence,
            status,
          };
        })
        .filter((target) => {
          const query = search.trim().toLowerCase();
          if (!query) return true;
          return (
            target.id.toLowerCase().includes(query) ||
            target.type.toLowerCase().includes(query) ||
            target.priority.toLowerCase().includes(query)
          );
        }),
    [trackerStatus, search]
  );

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-panel-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">Targeting System</h2>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search targets..."
            className="pl-8 bg-secondary border-border text-xs h-8"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Radar className="h-3.5 w-3.5" />
            {trackerError ? <span className="text-destructive">Tracker offline</span> : <span>Tracker online</span>}
          </div>
          <div>{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Waiting...'}</div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {trackerError ? (
            <div className="p-3 rounded bg-destructive/10 border border-destructive/40 text-xs text-destructive">
              <div className="font-semibold">Tracker Connection Error</div>
              <div className="mt-1">{trackerError}</div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refreshTrackerStatus(true)} disabled={trackerBusy}>
              {trackerBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5 mr-1" />}
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleToggleTracking()} disabled={trackerBusy}>
              <Zap className="h-3.5 w-3.5 mr-1" />
              {trackerStatus?.tracking_enabled ? 'Stop Auto Track' : 'Start Auto Track'}
            </Button>
          </div>

          {targets.length === 0 ? (
            <div className="p-3 rounded bg-secondary/40 border border-border/50 text-xs text-muted-foreground">
              No detections yet. Start the icon tracker service and enable model/classes to populate targets.
            </div>
          ) : (
            targets.map((target) => (
              <div key={target.id} className="p-3 rounded bg-secondary/50 border border-border/50">
                <div className="flex items-start gap-2">
                  <Target className="h-4 w-4 mt-0.5 text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-foreground">{target.id}</span>
                      <Badge className={`text-xs border-0 ${priorityBadgeClass(target.priority)}`}>{target.priority}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1 capitalize">{target.type}</p>
                    <p className="text-xs text-muted-foreground mb-2">Confidence: {target.confidence}%</p>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {target.status}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 bg-background border-border z-50">
                          <DropdownMenuItem onClick={() => void postTrackerAction('select-target', { track_id: target.rawId })} className="cursor-pointer">
                            <Eye className="h-4 w-4 mr-2" />
                            Select Target
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void postTrackerAction('select-target', { track_id: target.rawId })} className="cursor-pointer">
                            <Lock className="h-4 w-4 mr-2" />
                            Lock Target
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => void handleToggleTracking()} className="cursor-pointer">
                            <Zap className="h-4 w-4 mr-2" />
                            Toggle Tracking
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void postTrackerAction('stop-tracking')} className="cursor-pointer">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            Stop Tracking
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}

          <div className="rounded-lg border border-white/10 bg-black/70 p-3 text-slate-100">
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Live Camera Feed</div>
            <div className="mt-2 overflow-hidden rounded border border-white/10 bg-black/80">
              <div className="relative aspect-video">
                <img
                  src={`${TRACKER_MJPEG_URL}?v=${streamNonce}`}
                  alt="Tracker camera feed"
                  className="h-full w-full object-cover"
                  onLoad={() => setStreamLive(true)}
                  onError={() => setStreamLive(false)}
                />
                {!streamLive ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs text-slate-300">
                    <Video className="mr-2 h-4 w-4" />
                    No camera stream
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setStreamLive(false);
                  setStreamNonce(Date.now());
                }}
              >
                <RefreshCcw className="h-3.5 w-3.5 mr-1" />
                Reload Feed
              </Button>
              <div className={`text-[10px] ${streamLive ? 'text-emerald-300' : 'text-slate-400'}`}>
                {streamLive ? 'Live' : 'Offline'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/70 p-3 text-slate-100">
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Model Icons</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(trackerStatus?.models || []).map((model) => {
                const Icon = modelIconFor(model.icon);
                const active = (trackerStatus?.selected_model_path || trackerStatus?.selected_model) === model.path || trackerStatus?.selected_model === model.name;
                return (
                  <button
                    key={model.path}
                    className={`rounded border px-2 py-2 text-left transition ${active ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}
                    onClick={() => void postTrackerAction('select-model', { model_path: model.path })}
                    disabled={trackerBusy}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-cyan-300" />
                      <div className="truncate text-xs font-medium">{model.name}</div>
                    </div>
                  </button>
                );
              })}
              {(trackerStatus?.models || []).length === 0 ? (
                <div className="col-span-2 rounded border border-white/10 bg-white/5 px-2 py-2 text-xs text-slate-400">
                  No models exposed by tracker.
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Detection Classes</div>
              <div className="flex gap-1">
                <button
                  className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 transition text-[9px] font-medium text-cyan-300 disabled:opacity-50"
                  onClick={() => void postTrackerAction('set-classes', { classes: trackerStatus?.selected_model_classes || [] })}
                  disabled={trackerBusy || !(trackerStatus?.selected_model_classes || []).length}
                >
                  Select All
                </button>
                <button
                  className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 transition text-[9px] font-medium text-slate-400 hover:text-slate-300 disabled:opacity-50"
                  onClick={() => void postTrackerAction('set-classes', { classes: [] })}
                  disabled={trackerBusy || !(trackerStatus?.selected_model_classes || []).length}
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(trackerStatus?.selected_model_classes || []).map((className) => {
                const active = (trackerStatus?.enabled_classes || []).includes(className);
                return (
                  <button
                    key={className}
                    className={`rounded-full border px-2 py-1 text-[10px] ${active ? 'border-cyan-300 bg-cyan-500/10 text-cyan-100' : 'border-white/15 text-slate-300'
                      }`}
                    onClick={() => void postTrackerAction('toggle-class', { class_name: className })}
                    disabled={trackerBusy}
                  >
                    {className}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/70 p-3 text-slate-100">
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Gimbal & Tracking Controls</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button size="sm" className="h-8 text-xs" onClick={() => void handleToggleTracking()} disabled={trackerBusy}>
                <Zap className="h-3.5 w-3.5 mr-1" />
                {trackerStatus?.tracking_enabled ? 'Stop' : 'Start'}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void postTrackerAction('stop-tracking')} disabled={trackerBusy}>
                <AlertCircle className="h-3.5 w-3.5 mr-1" />
                Stop Track
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void postTrackerAction('center')} disabled={trackerBusy}>
                <Crosshair className="h-3.5 w-3.5 mr-1" />
                Center
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void postTrackerAction('stop-motion', {}, { useBusy: false })}>
                <Lock className="h-3.5 w-3.5 mr-1" />
                Stop Motion
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void postTrackerAction('zoom', { direction: 'in' }, { useBusy: false })}>
                Zoom In
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void postTrackerAction('zoom', { direction: 'out' }, { useBusy: false })}>
                Zoom Out
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div />
              <Button size="sm" variant="outline" className="h-8 p-0" {...moveHoldHandlers(0, -18)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <div />
              <Button size="sm" variant="outline" className="h-8 p-0" {...moveHoldHandlers(-18, 0)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 p-0" onClick={() => void postTrackerAction('stop-motion', {}, { useBusy: false })}>
                <Crosshair className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 p-0" {...moveHoldHandlers(18, 0)}>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <div />
              <Button size="sm" variant="outline" className="h-8 p-0" {...moveHoldHandlers(0, 18)}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <div />
            </div>

            <div className="mt-3">
              <div className="text-[10px] text-slate-400 mb-1">Camera Speed</div>
              <div className="flex gap-2">
                {[0.2, 0.5, 1, 2, 3].map((speed) => (
                  <button
                    key={speed}
                    className={`rounded border px-2 py-1 text-[10px] ${Math.abs(speedScale - speed) < 0.01 ? 'border-cyan-300 bg-cyan-500/10 text-cyan-100' : 'border-white/15 text-slate-300'
                      }`}
                    onClick={() => void postTrackerAction('set-camera-speed', { speed_scale: speed })}
                    disabled={trackerBusy}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-slate-400">
                Yaw/Pitch: {Number(trackerStatus?.yaw || 0).toFixed(1)} / {Number(trackerStatus?.pitch || 0).toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
