import { Shield, Users, ChevronRight } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';

const structure = [
  {
    unit: 'Command Center',
    personnel: 8,
    status: 'Active',
    subunits: [
      { name: 'Alpha Squad', personnel: 4, status: 'Deployed' },
      { name: 'Bravo Squad', personnel: 4, status: 'Standby' },
    ],
  },
  {
    unit: 'Air Support',
    personnel: 4,
    status: 'Active',
    subunits: [
      { name: 'AT01 - Drone', personnel: 1, status: 'Active' },
      { name: 'AT02 - Drone', personnel: 1, status: 'Standby' },
    ],
  },
  {
    unit: 'Ground Forces',
    personnel: 12,
    status: 'Active',
    subunits: [
      { name: 'GV01 - Vehicle', personnel: 3, status: 'Active' },
      { name: 'Infantry Team', personnel: 6, status: 'Deployed' },
    ],
  },
];

export const CommandStructurePanel = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-panel-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">Command Structure</h2>
        <div className="flex gap-2 text-xs">
          <Badge variant="default" className="text-xs">24 Personnel</Badge>
          <Badge variant="outline" className="text-xs">3 Units Active</Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {structure.map((unit, index) => (
            <div key={index} className="space-y-2">
              <div className="p-2.5 rounded bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{unit.unit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>{unit.personnel} Personnel</span>
                  </div>
                  <Badge variant="default" className="text-xs">{unit.status}</Badge>
                </div>
              </div>

              <div className="ml-4 space-y-1.5">
                {unit.subunits.map((sub, subIndex) => (
                  <div key={subIndex} className="flex items-center gap-2 p-2 rounded bg-secondary/50 border border-border/50">
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-foreground">{sub.name}</p>
                      <p className="text-xs text-muted-foreground">{sub.personnel} Personnel</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-4">{sub.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-panel-border">
        <p className="text-xs text-muted-foreground">
          Total Operational: <span className="text-foreground font-medium">24/24</span>
        </p>
      </div>
    </div>
  );
};
