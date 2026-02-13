import { Search, ChevronDown, Circle, Eye, MoreVertical, Star } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Track, TrackDisposition } from '@/types/track';

interface TracksPanelProps {
  hideHeader?: boolean;
  tracks: Track[];
  selectedTrackId?: string | null;
  onTrackSelect?: (trackId: string) => void;
  onTrackTask?: (trackId: string, taskedTo: string) => void;
}

const DISPOSITION_ORDER: TrackDisposition[] = [
  'Hostile',
  'Suspect',
  'Unknown',
  'Assumed Friend',
  'Friendly',
  'Neutral',
];

const getDispositionColor = (disposition: TrackDisposition) => {
  switch (disposition) {
    case 'Hostile':
      return 'text-destructive fill-destructive';
    case 'Suspect':
      return 'text-amber-400 fill-amber-400';
    case 'Unknown':
      return 'text-muted-foreground fill-muted-foreground';
    case 'Assumed Friend':
      return 'text-lime-400 fill-lime-400';
    case 'Friendly':
      return 'text-green-400 fill-green-400';
    case 'Neutral':
      return 'text-pink-400 fill-pink-400';
    default:
      return 'text-muted-foreground fill-muted-foreground';
  }
};

export const TracksPanel = ({
  hideHeader = false,
  tracks,
  selectedTrackId,
  onTrackSelect,
  onTrackTask,
}: TracksPanelProps) => {
  const groupedTracks = DISPOSITION_ORDER
    .map((disposition) => ({
      disposition,
      tracks: tracks.filter((track) => track.disposition === disposition),
    }))
    .filter((group) => group.tracks.length > 0);

  return (
    <div className="h-full flex flex-col">
      {!hideHeader && (
        <div className="p-3 border-b border-panel-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Tracks</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Star className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by x, y, z..."
              className="pl-8 bg-secondary border-border text-xs h-8"
            />
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start mt-2 text-xs h-7">
            Filters
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-2">
          {groupedTracks.map((group) => (
            <div key={group.disposition} className="mb-3">
              <button className="flex items-center gap-2 text-xs font-medium text-foreground mb-2 hover:text-foreground/80">
                <ChevronDown className="h-3 w-3" />
                <span>{group.disposition}</span>
                <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
                  {group.tracks.length}
                </Badge>
              </button>

              {group.tracks.map((track) => (
                <div
                  key={track.id}
                  className={`p-2 mb-2 rounded cursor-pointer border border-border/50 ${
                    selectedTrackId === track.id
                      ? 'bg-secondary border-primary'
                      : 'bg-secondary/50 hover:bg-secondary'
                  }`}
                  onClick={() => onTrackSelect?.(track.id)}
                >
                  <div className="flex items-start gap-2">
                    <Circle className={`h-3 w-3 mt-0.5 flex-shrink-0 ${getDispositionColor(track.disposition)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">
                          {track.id}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1.5 border-border"
                        >
                          {track.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {track.subtype}{track.platform ? ` • ${track.platform}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">{track.distance}</p>

                      {track.thumbnail && (
                        <div className="w-full h-16 bg-muted rounded mb-2 overflow-hidden">
                          <div className="w-full h-full bg-gradient-to-br from-muted to-muted-foreground/20" />
                        </div>
                      )}

                      <div className="flex gap-1 text-xs">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={(event) => event.stopPropagation()}
                        >
                          + AT01
                        </Button>
                        {track.action === 'View' ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-foreground hover:text-primary hover:bg-primary/10"
                              onClick={(event) => {
                                event.stopPropagation();
                                onTrackTask?.(track.id, 'Recce');
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Recce
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-foreground hover:text-primary hover:bg-primary/10"
                              onClick={(event) => {
                                event.stopPropagation();
                                onTrackTask?.(track.id, 'Follow');
                              }}
                            >
                              Follow
                            </Button>
                          </>
                        ) : (
                          <Select onValueChange={(value) => onTrackTask?.(track.id, value)}>
                            <SelectTrigger className="h-6 px-2 text-xs w-auto border-0 bg-transparent hover:bg-secondary">
                              <SelectValue placeholder="Assign to" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover z-50">
                              <SelectItem value="AT01 - Drone">AT01 - Drone</SelectItem>
                              <SelectItem value="AT02 - Drone">AT02 - Drone</SelectItem>
                              <SelectItem value="GV01 - Ground Vehicle">GV01 - Ground Vehicle</SelectItem>
                              <SelectItem value="S01 - Sensor">S01 - Sensor</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-2 border-t border-panel-border">
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">{tracks.length}</span> Tracks
        </p>
      </div>
    </div>
  );
};
