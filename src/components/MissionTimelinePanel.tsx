import { Clock, Play, Pause, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';

const timeline = [
  { time: '06:00', event: 'Mission Start', status: 'completed', type: 'milestone' },
  { time: '06:15', event: 'Asset Deployment', status: 'completed', type: 'action' },
  { time: '06:30', event: 'Recon Phase', status: 'active', type: 'phase' },
  { time: '07:00', event: 'Target Acquisition', status: 'pending', type: 'action' },
  { time: '07:30', event: 'Engagement Phase', status: 'pending', type: 'phase' },
  { time: '08:00', event: 'Mission Complete', status: 'pending', type: 'milestone' },
];

export const MissionTimelinePanel = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-panel-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">Mission Timeline</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1">
            <Play className="h-3.5 w-3.5 mr-1" />
            Resume
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <Pause className="h-3.5 w-3.5 mr-1" />
            Pause
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          <div className="relative">
            {timeline.map((item, index) => (
              <div key={index} className="flex gap-3 pb-4">
                <div className="flex flex-col items-center">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
                    item.status === 'completed' ? 'bg-primary border-primary' :
                    item.status === 'active' ? 'bg-primary/20 border-primary' :
                    'bg-secondary border-border'
                  }`}>
                    {item.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
                    {item.status === 'active' && <Clock className="h-4 w-4 text-primary" />}
                  </div>
                  {index < timeline.length - 1 && (
                    <div className={`w-0.5 flex-1 mt-1 ${item.status === 'completed' ? 'bg-primary' : 'bg-border'}`} style={{ minHeight: '20px' }} />
                  )}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-muted-foreground">{item.time}</span>
                    <Badge variant={item.type === 'milestone' ? 'default' : 'outline'} className="text-xs">
                      {item.type}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{item.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-panel-border">
        <p className="text-xs text-muted-foreground">
          Current Time: <span className="text-foreground font-medium">06:35</span>
        </p>
      </div>
    </div>
  );
};
