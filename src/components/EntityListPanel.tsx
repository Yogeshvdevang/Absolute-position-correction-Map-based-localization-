import { useState } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Entity } from '@/types/entity';
import { Filter, Search } from 'lucide-react';

interface EntityListPanelProps {
  entities: Entity[];
  onEntitySelect: (entityId: string) => void;
  selectedEntity?: string;
}

export const EntityListPanel = ({ entities, onEntitySelect, selectedEntity }: EntityListPanelProps) => {
  const [filter, setFilter] = useState<Entity['status'] | 'All'>('All');
  const [search, setSearch] = useState('');

  const filteredEntities = entities.filter(entity => {
    const matchesFilter = filter === 'All' || entity.status === filter;
    const matchesSearch = entity.entity_id.toLowerCase().includes(search.toLowerCase()) ||
                          entity.type.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusColor = (status: Entity['status']) => {
    switch (status) {
      case 'Operational':
        return 'bg-green-highlight text-black';
      case 'Idle':
        return 'bg-gray-highlight text-white';
      case 'Simulated':
        return 'bg-blue-highlight text-black';
      case 'Offline':
        return 'bg-red-highlight text-white';
    }
  };

  return (
    <div className="h-full flex flex-col bg-panel border-r border-panel-border">
      <div className="p-4 border-b border-panel-border">
        <h2 className="text-lg font-bold text-foreground mb-3">Entities</h2>
        
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-background border-border text-foreground"
            />
          </div>
          
          <div className="flex gap-1 flex-wrap">
            {(['All', 'Operational', 'Idle', 'Simulated', 'Offline'] as const).map((status) => (
              <Button
                key={status}
                variant={filter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(status)}
                className="text-xs"
              >
                {status}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredEntities.map((entity) => (
            <button
              key={entity.entity_id}
              onClick={() => onEntitySelect(entity.entity_id)}
              className={`w-full p-3 rounded border transition-colors text-left ${
                selectedEntity === entity.entity_id
                  ? 'bg-secondary border-primary'
                  : 'bg-background border-border hover:bg-secondary/50'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-mono text-foreground font-semibold">
                  {entity.entity_id}
                </span>
                <Badge className={`text-xs ${getStatusColor(entity.status)}`}>
                  {entity.status}
                </Badge>
              </div>
              
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Type:</span>
                  <span className="text-foreground">{entity.type}</span>
                </div>
                <div className="flex justify-between">
                  <span>Alt:</span>
                  <span className="text-foreground">{entity.alt.toFixed(0)}m</span>
                </div>
                {entity.speed !== undefined && (
                  <div className="flex justify-between">
                    <span>Speed:</span>
                    <span className="text-foreground">{entity.speed.toFixed(1)} m/s</span>
                  </div>
                )}
                {entity.simulated && (
                  <Badge className="text-xs bg-blue-highlight text-black mt-1">
                    SIMULATED
                  </Badge>
                )}
              </div>
            </button>
          ))}
          
          {filteredEntities.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No entities found
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-panel-border">
        <div className="text-xs text-muted-foreground">
          Total: {entities.length} | Showing: {filteredEntities.length}
        </div>
      </div>
    </div>
  );
};
