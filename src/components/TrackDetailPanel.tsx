import { useEffect, useMemo, useState } from 'react';
import { Track, TrackDisposition } from '@/types/track';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Clock, Link2, Pin, X } from 'lucide-react';

interface TrackDetailPanelProps {
  track: Track;
  onClose: () => void;
  onDispositionChange: (trackId: string, disposition: TrackDisposition) => void;
}

const DISPOSITIONS: Array<{
  value: TrackDisposition;
  dotClass: string;
}> = [
  { value: 'Hostile', dotClass: 'bg-destructive' },
  { value: 'Suspect', dotClass: 'bg-amber-400' },
  { value: 'Unknown', dotClass: 'bg-muted-foreground' },
  { value: 'Assumed Friend', dotClass: 'bg-lime-400' },
  { value: 'Friendly', dotClass: 'bg-green-400' },
  { value: 'Neutral', dotClass: 'bg-pink-400' },
];

const formatCountdown = (seconds: number) => {
  if (seconds <= 0) return '0s';
  return `${seconds}s`;
};

const formatElapsed = (timestamp?: string) => {
  if (!timestamp) return '--:--:--';
  const diffMs = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const formatTime = (timestamp?: string) => {
  if (!timestamp) return '--:--:--';
  return new Date(timestamp).toLocaleTimeString();
};

export const TrackDetailPanel = ({
  track,
  onClose,
  onDispositionChange,
}: TrackDetailPanelProps) => {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const pendingMs = useMemo(() => {
    if (!track.pendingUntil || !track.pendingDisposition) return null;
    return Math.max(0, new Date(track.pendingUntil).getTime() - Date.now());
  }, [track.pendingDisposition, track.pendingUntil]);

  useEffect(() => {
    if (!track.pendingUntil || !track.pendingDisposition) {
      setRemainingSeconds(null);
      return;
    }

    const tick = () => {
      const msLeft = new Date(track.pendingUntil as string).getTime() - Date.now();
      setRemainingSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [track.pendingUntil, track.pendingDisposition]);

  useEffect(() => {
    if (!track.pendingUntil || !track.pendingDisposition) return;
    const msLeft = new Date(track.pendingUntil).getTime() - Date.now();
    if (msLeft <= 0) {
      onDispositionChange(track.id, track.pendingDisposition);
      return;
    }
    const timeout = setTimeout(() => {
      onDispositionChange(track.id, track.pendingDisposition as TrackDisposition);
    }, msLeft);
    return () => clearTimeout(timeout);
  }, [track.id, track.pendingDisposition, track.pendingUntil, onDispositionChange]);

  const qualityPercent = track.quality !== undefined ? Math.round(track.quality * 100) : null;
  const trackingAssets = track.trackingAssets ?? ['Asset 4', 'Asset 2'];
  const sensors = track.sensors ?? ['Passive', 'Passive'];

  return (
    <div className="h-full bg-panel border-l border-panel-border flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border px-4 h-12 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Track Detail</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border">
            {track.id}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Clock className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Pin className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Link2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-primary">
                  A
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Point</p>
                  <p className="text-xs text-muted-foreground">
                    {track.subtype}{track.platform ? ` - ${track.platform}` : ''}
                  </p>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{track.distance}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-muted-foreground">Disposition</span>
              <Select
                value={track.disposition}
                onValueChange={(value) => onDispositionChange(track.id, value as TrackDisposition)}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs bg-secondary/60 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-panel border-panel-border">
                  {DISPOSITIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${item.dotClass}`} />
                        <span>{item.value}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground">Source</div>
              <div className="text-foreground font-medium">{track.source ?? 'On-board'}</div>
            </div>
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground">Quality</div>
              <div className="text-foreground font-medium">
                {qualityPercent !== null ? `${qualityPercent}%` : '--'}
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground mb-2">Currently Tracking</div>
              <div className="space-y-1">
                {trackingAssets.map((asset) => (
                  <div key={asset} className="flex items-center gap-2 text-foreground">
                    <span className="h-2 w-2 rounded-full bg-green-400" />
                    <span>{asset}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground mb-2">Sensors</div>
              <div className="space-y-1">
                {sensors.map((sensor, index) => (
                  <div key={`${sensor}-${index}`} className="flex items-center gap-2 text-foreground">
                    <span className="text-muted-foreground">{'>'}</span>
                    <span>{sensor}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground">Last Updated</div>
              <div className="text-foreground font-medium">{formatTime(track.lastUpdated)}</div>
            </div>
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground">Time Since Creation</div>
              <div className="text-foreground font-medium">{formatElapsed(track.createdAt)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground">Environment</div>
              <div className="text-foreground font-medium">{track.environment ?? 'Unknown'}</div>
            </div>
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground">Heading</div>
              <div className="text-foreground font-medium">
                {track.heading !== undefined ? `${track.heading} deg` : '--'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground">Altitude (MSL)</div>
              <div className="text-foreground font-medium">
                {track.altitude !== undefined ? `${track.altitude} ft` : '--'}
              </div>
            </div>
            <div className="rounded-md border border-panel-border bg-secondary/40 p-2">
              <div className="text-muted-foreground">Speed</div>
              <div className="text-foreground font-medium">
                {track.speed !== undefined ? `${track.speed} mph` : '--'}
              </div>
            </div>
          </div>

          {track.pendingDisposition && pendingMs !== null && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              Auto-tagging as <span className="font-semibold">{track.pendingDisposition}</span> in{' '}
              <span className="font-semibold">{formatCountdown(remainingSeconds ?? Math.ceil(pendingMs / 1000))}</span>.
              Select another disposition to override.
            </div>
          )}

          {track.taskedTo && (
            <div className="text-xs text-muted-foreground">
              Tasked to: <span className="text-foreground">{track.taskedTo}</span>
            </div>
          )}
          {track.lastDetection && (
            <div className="text-xs text-muted-foreground">
              Last detection: <span className="text-foreground">{new Date(track.lastDetection).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
