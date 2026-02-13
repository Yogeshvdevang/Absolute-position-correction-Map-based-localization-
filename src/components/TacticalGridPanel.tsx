import { Grid3x3, MapPin, Crosshair } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';

const gridSections = [
  { grid: '45N', status: 'Secured', assets: 2, threats: 0, priority: 'High' },
  { grid: '46N', status: 'Contested', assets: 1, threats: 2, priority: 'Critical' },
  { grid: '47N', status: 'Clear', assets: 3, threats: 0, priority: 'Normal' },
  { grid: '48N', status: 'Unknown', assets: 0, threats: 1, priority: 'Medium' },
];

export const TacticalGridPanel = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-panel-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">Tactical Grid</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-primary/10 border border-primary/20">
            <p className="text-muted-foreground">Secured</p>
            <p className="text-lg font-bold text-primary">1</p>
          </div>
          <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
            <p className="text-muted-foreground">Contested</p>
            <p className="text-lg font-bold text-destructive">1</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {gridSections.map((section) => (
            <div key={section.grid} className="p-3 rounded bg-secondary/50 border border-border/50">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Grid3x3 className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Grid {section.grid}</p>
                    <Badge variant={
                      section.status === 'Secured' ? 'default' :
                      section.status === 'Contested' ? 'destructive' :
                      section.status === 'Clear' ? 'outline' : 'secondary'
                    } className="text-xs mt-1">
                      {section.status}
                    </Badge>
                  </div>
                </div>
                <Badge variant={section.priority === 'Critical' ? 'destructive' : 'outline'} className="text-xs">
                  {section.priority}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{section.assets} Assets</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Crosshair className="h-3 w-3" />
                  <span>{section.threats} Threats</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-panel-border">
        <p className="text-xs text-muted-foreground">
          Grid Coverage: <span className="text-foreground font-medium">4/16 Sectors</span>
        </p>
      </div>
    </div>
  );
};
