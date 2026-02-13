import { Search, Crosshair, AlertCircle, Target, MoreVertical, Lock, Zap, Eye } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from './ui/dropdown-menu';
import { useState } from 'react';

const initialTargets = [
  { id: 'T-001', type: 'Hostile Vehicle', priority: 'High', range: '2.5km', status: 'Locked' },
  { id: 'T-002', type: 'Enemy Position', priority: 'Medium', range: '5km', status: 'Tracking' },
  { id: 'T-003', type: 'Artillery', priority: 'Critical', range: '8km', status: 'Smacked' },
];

export const TargetingPanel = () => {
  const [targets, setTargets] = useState(initialTargets);

  const handleAction = (targetId: string, action: string) => {
    setTargets(targets.map(target => {
      if (target.id === targetId) {
        if (action === 'lock') {
          return { ...target, status: 'Locked' };
        } else if (action === 'track') {
          return { ...target, status: 'Tracking' };
        } else if (action === 'smack' && target.status === 'Locked') {
          return { ...target, status: 'Smacked' };
        }
      }
      return target;
    }));
  };
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-panel-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">Targeting System</h2>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search targets..." className="pl-8 bg-secondary border-border text-xs h-8" />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {targets.map((target) => (
            <div key={target.id} className="p-3 rounded bg-secondary/50 border border-border/50">
              <div className="flex items-start gap-2">
                <Target className={`h-4 w-4 mt-0.5 ${target.priority === 'Critical' ? 'text-destructive' : 'text-primary'}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-foreground">{target.id}</span>
                    <Badge variant={target.priority === 'Critical' ? 'destructive' : 'default'} className="text-xs">
                      {target.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{target.type}</p>
                  <p className="text-xs text-muted-foreground mb-2">Range: {target.range}</p>
                  <div className="flex items-center justify-between">
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${target.status === 'Smacked' ? 'bg-destructive/20 text-destructive border-destructive' : ''}`}
                    >
                      {target.status}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 bg-background border-border z-50">
                        <DropdownMenuItem onClick={() => handleAction(target.id, 'track')} className="cursor-pointer">
                          <Eye className="h-4 w-4 mr-2" />
                          Track Target
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAction(target.id, 'lock')} className="cursor-pointer">
                          <Lock className="h-4 w-4 mr-2" />
                          Lock Target
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleAction(target.id, 'smack')}
                          disabled={target.status !== 'Locked'}
                          className={target.status === 'Locked' ? 'text-destructive focus:text-destructive cursor-pointer' : 'opacity-50 cursor-not-allowed'}
                        >
                          <Zap className="h-4 w-4 mr-2" />
                          Smack Target
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-panel-border">
        <div className="rounded-lg border border-white/10 bg-black/70 p-3 text-slate-100">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-300">AI-Based Absolute Mission</div>
          <div className="mt-1 text-xs font-semibold">Absolute Position Correction</div>
          <div className="mt-2 space-y-1.5 text-[10px] text-slate-200">
            <div className="flex flex-col gap-1">
              <span className="rounded-md border border-white/10 bg-black/40 px-2 py-1">Camera Frame</span>
              <span className="text-center text-[9px] text-slate-400">↓</span>
              <span className="rounded-md border border-white/10 bg-black/40 px-2 py-1">Preprocessing Layer</span>
              <span className="text-center text-[9px] text-slate-400">↓</span>
              <span className="rounded-md border border-white/10 bg-black/40 px-2 py-1">Learned Abstraction Engine</span>
              <span className="text-center text-[9px] text-slate-400">↓</span>
              <span className="rounded-md border border-white/10 bg-black/40 px-2 py-1">Tile Matching Engine</span>
              <span className="text-center text-[9px] text-slate-400">↓</span>
              <span className="rounded-md border border-white/10 bg-black/40 px-2 py-1">Voting &amp; Confidence Model</span>
              <span className="text-center text-[9px] text-slate-400">↓</span>
              <span className="rounded-md border border-white/10 bg-black/40 px-2 py-1">Coarse-to-Fine Refinement</span>
              <span className="text-center text-[9px] text-slate-400">↓</span>
              <span className="rounded-md border border-white/10 bg-black/40 px-2 py-1">Absolute Position Output</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
