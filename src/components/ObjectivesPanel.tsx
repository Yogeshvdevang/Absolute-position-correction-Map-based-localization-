import { Star, MapPin, Flag, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';

const objectives = [
  { id: 'OBJ-01', title: 'Secure Perimeter', location: 'Grid 45N', priority: 'Primary', status: 'In Progress', progress: 65 },
  { id: 'OBJ-02', title: 'Recon Area Alpha', location: 'Grid 47N', priority: 'Primary', status: 'In Progress', progress: 40 },
  { id: 'OBJ-03', title: 'Establish FOB', location: 'Grid 46N', priority: 'Secondary', status: 'Pending', progress: 0 },
  { id: 'OBJ-04', title: 'Extract Intelligence', location: 'Grid 48N', priority: 'Secondary', status: 'Pending', progress: 0 },
];

export const ObjectivesPanel = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-panel-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">Mission Objectives</h2>
        <div className="flex gap-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">2 Active</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-muted" />
            <span className="text-muted-foreground">2 Pending</span>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {objectives.map((obj) => (
            <div key={obj.id} className="p-3 rounded bg-secondary/50 border border-border/50">
              <div className="flex items-start gap-2 mb-2">
                <Star className={`h-4 w-4 mt-0.5 ${obj.priority === 'Primary' ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-foreground">{obj.id}</span>
                    <Badge variant={obj.status === 'In Progress' ? 'default' : 'secondary'} className="text-xs">
                      {obj.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground mb-2">{obj.title}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <MapPin className="h-3 w-3" />
                    <span>{obj.location}</span>
                  </div>
                  
                  {obj.progress > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="text-foreground font-medium">{obj.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${obj.progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-panel-border">
        <Button className="w-full" size="sm" variant="outline">
          <Flag className="h-4 w-4 mr-2" />
          Add New Objective
        </Button>
      </div>
    </div>
  );
};
