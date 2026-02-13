import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const videoFeeds = [
  { id: '360SA', type: 'You', active: true },
  { id: 'MW8', type: 'You', active: false },
];

export const VideoFeedPanel = () => {
  return (
    <div className="h-64 bg-panel border-t border-panel-border flex flex-col">
      <div className="px-3 py-2 border-b border-panel-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Video</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            2 Feeds
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex gap-2 p-2">
        {videoFeeds.map((feed) => (
          <div
            key={feed.id}
            className="flex-1 bg-canvas rounded border border-panel-border relative overflow-hidden"
          >
            {/* Simulated thermal/IR view */}
            <div className="absolute inset-0 bg-gradient-to-br from-muted-foreground/20 via-muted/40 to-background/60" />
            
            {/* Feed label */}
            <div className="absolute top-2 left-2 flex items-center gap-2">
              <Badge
                variant="secondary"
                className="text-[10px] h-4 px-1.5 bg-background/80 backdrop-blur"
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-1 ${feed.active ? 'bg-primary' : 'bg-muted-foreground'}`} />
                {feed.id} ({feed.type})
              </Badge>
            </div>

            {/* Overlay markers */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="border border-primary/50 w-16 h-16 rounded" />
            </div>

            {/* Target label */}
            <div className="absolute bottom-2 left-2">
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1.5 border-primary/50 text-primary bg-background/80 backdrop-blur"
              >
                W002
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
