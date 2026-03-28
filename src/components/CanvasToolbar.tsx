import { MapPin, Ruler, Search, Map, Layers, Globe, Satellite, Waypoints, Square, Circle, Pen, Triangle, Crosshair, Activity, Route, Undo2, Trash2, House, Copy } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Entity } from '@/types/entity';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from './ui/dropdown-menu';
type BasemapStyle = 'streets' | 'dark' | 'satellite' | 'terrain';
type VehicleDomain = 'air' | 'land' | 'water' | 'space';

// Domain-specific command interpretations
const DOMAIN_TOOLTIPS: Record<VehicleDomain, {
  arm: string;
  takeoff: string;
  land: string;
  rtl: string;
}> = {
  air: {
    arm: 'Spin motors, enable flight controller',
    takeoff: 'Vertical / runway launch',
    land: 'Descend & land',
    rtl: 'Return to home GPS'
  },
  land: {
    arm: 'Enable drive + actuators',
    takeoff: 'Start motion',
    land: 'Stop + safe halt',
    rtl: 'Return to base / rally point'
  },
  water: {
    arm: 'Enable propulsion + control fins',
    takeoff: 'Leave dock / submerge',
    land: 'Dock / surface',
    rtl: 'Return to dock / loiter buoy'
  },
  space: {
    arm: 'Enable mission sequence / subsystems',
    takeoff: 'Start orbital maneuver',
    land: 'Safe orbit / standby',
    rtl: 'Return to nominal orbit slot'
  }
};
const DOMAIN_MODES: Record<VehicleDomain, string[]> = {
  air: ['Manual', 'Stabilized', 'Loiter', 'Auto Mission'],
  land: ['Teleop', 'Follow', 'Patrol', 'Autonomous'],
  water: ['Station Keep', 'Waypoint Sail', 'Drift', 'Submerge'],
  space: ['Safe', 'Orbit Hold', 'Maneuver', 'Payload Ops']
};

// Domain-specific button labels (same icons, different names)
const DOMAIN_LABELS: Record<VehicleDomain, {
  arm: string;
  takeoff: string;
  land: string;
  rtl: string;
  mode: string;
}> = {
  air: {
    arm: 'Arm',
    takeoff: 'Takeoff',
    land: 'Land',
    rtl: 'RTL',
    mode: 'Mode'
  },
  land: {
    arm: 'Enable',
    takeoff: 'Deploy',
    land: 'Halt',
    rtl: 'Return',
    mode: 'Drive'
  },
  water: {
    arm: 'Activate',
    takeoff: 'Launch',
    land: 'Dock',
    rtl: 'Return',
    mode: 'Nav'
  },
  space: {
    arm: 'Enable',
    takeoff: 'Initiate',
    land: 'Standby',
    rtl: 'Orbit',
    mode: 'Ops'
  }
};
interface CanvasToolbarProps {
  connected: boolean;
  entityCount: number;
  entities?: Entity[];
  mapStyle: BasemapStyle;
  onMapStyleChange: (style: BasemapStyle) => void;
  onLocationSearch: (query: string) => void;
  planningEnabled: boolean;
  missionCount: number;
  onTogglePlanning: () => void;
  onClearMission: () => void;
  onUndoWaypoint: () => void;
  onAddMarker?: () => void;
  onSetHomeLocation?: () => void;
  onCopyLatLong?: () => void;
  onCommand?: (cmd: 'arm' | 'takeoff' | 'land' | 'rtl' | 'mode', params?: Record<string, any>) => void;
  vehicleDomain?: VehicleDomain;
  selectedVehicle?: string | null;
  connectionInfo?: string | null;
  showInternationalBorders?: boolean;
  showLineOfControl?: boolean;
  showIndianClaimedBorder?: boolean;
  onShowInternationalBordersChange?: (show: boolean) => void;
  onShowLineOfControlChange?: (show: boolean) => void;
  onShowIndianClaimedBorderChange?: (show: boolean) => void;
}
export const CanvasToolbar = ({
  connected,
  entityCount,
  entities = [],
  mapStyle,
  onMapStyleChange,
  onLocationSearch,
  planningEnabled,
  missionCount,
  onTogglePlanning,
  onClearMission,
  onUndoWaypoint,
  onAddMarker,
  onSetHomeLocation,
  onCopyLatLong,
  onCommand,
  vehicleDomain = 'air',
  selectedVehicle = null,
  connectionInfo = null,
  showInternationalBorders = true,
  showLineOfControl = true,
  showIndianClaimedBorder = true,
  onShowInternationalBordersChange,
  onShowLineOfControlChange,
  onShowIndianClaimedBorderChange
}: CanvasToolbarProps) => {
  const isVehicleSelected = !!selectedVehicle;
  const [showRealEntities, setShowRealEntities] = useState(true);
  const [showSimulatedEntities, setShowSimulatedEntities] = useState(true);
  const [fps, setFps] = useState(60);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchTerm.trim()) return;
    setSearching(true);
    onLocationSearch(searchTerm);
    setTimeout(() => setSearching(false), 1000);
  };

  // Calculate FPS
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId: number;
    const updateFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      if (currentTime >= lastTime + 1000) {
        setFps(Math.round(frameCount * 1000 / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      animationFrameId = requestAnimationFrame(updateFPS);
    };
    animationFrameId = requestAnimationFrame(updateFPS);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);
  return <div className={`h-12 bg-transparent border-b-0 flex items-center px-3 gap-3 relative ${mapStyle !== 'dark' ? '[&_svg]:text-white [&_svg]:stroke-white [&_button]:bg-black/70 [&_button]:border-white/15 [&_button:hover]:bg-black/80' : ''}`}>
      {/* Back Button */}
      {/* Mission Planning */}
      <div className="flex items-center gap-1 ml-2">
        <Button variant={planningEnabled ? 'default' : 'outline'} size="sm" className={`h-8 px-3 text-xs ${planningEnabled ? 'bg-primary text-primary-foreground' : ''}`} onClick={onTogglePlanning}>
          <Route className="h-4 w-4 mr-1" />
          {planningEnabled ? 'Planning' : 'Plan'}
          {missionCount > 0 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-border text-white">
              {missionCount}
            </span>}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-secondary" onClick={onUndoWaypoint} disabled={missionCount === 0}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-secondary" onClick={onClearMission} disabled={missionCount === 0}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Map Tools */}
      <div className="flex items-center gap-1 ml-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-secondary hover:text-primary">
              <MapPin className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 bg-panel border-border">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Map Annotations</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem className="hover:bg-secondary cursor-pointer" onClick={onAddMarker}>
              <MapPin className="mr-2 h-4 w-4" />
              <span>Add Marker</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-secondary cursor-pointer" onClick={onSetHomeLocation}>
              <House className="mr-2 h-4 w-4" />
              <span>Set Home Location</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-secondary cursor-pointer" onClick={onCopyLatLong}>
              <Copy className="mr-2 h-4 w-4" />
              <span>Copy Lat/Long</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem className="hover:bg-secondary cursor-pointer">
              <Waypoints className="mr-2 h-4 w-4" />
              <span>Add Waypoint</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-secondary cursor-pointer">
              <Crosshair className="mr-2 h-4 w-4" />
              <span>Target Point</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-secondary hover:text-primary">
              <Ruler className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 bg-panel border-border">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Measurement Tools</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem className="hover:bg-secondary cursor-pointer">
              <Ruler className="mr-2 h-4 w-4" />
              <span>Distance</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-secondary cursor-pointer">
              <Square className="mr-2 h-4 w-4" />
              <span>Area</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-secondary cursor-pointer">
              <Circle className="mr-2 h-4 w-4" />
              <span>Radius</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Location Search */}
      <form onSubmit={handleSearch} className="relative ml-2 flex items-center gap-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search location" className="pl-8 w-48 bg-secondary border-border text-xs h-8" />
        </div>
        <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={searching}>
          {searching ? 'Locating...' : 'Go'}
        </Button>
      </form>


      <div className="absolute right-3 top-2 flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
      {/* Visibility Layers */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-secondary hover:text-primary">
            <Layers className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-panel border-border">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Visibility Layers</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuCheckboxItem checked={showRealEntities} onCheckedChange={setShowRealEntities} className="hover:bg-secondary cursor-pointer">
            Real Entities
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={showSimulatedEntities} onCheckedChange={setShowSimulatedEntities} className="hover:bg-secondary cursor-pointer">
            Simulated Entities
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Borders</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={showInternationalBorders} onCheckedChange={(checked) => onShowInternationalBordersChange?.(checked)} className="hover:bg-secondary cursor-pointer">
            International Borders
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={showLineOfControl} onCheckedChange={(checked) => onShowLineOfControlChange?.(checked)} className="hover:bg-secondary cursor-pointer">
            Line of Control
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={showIndianClaimedBorder} onCheckedChange={(checked) => onShowIndianClaimedBorderChange?.(checked)} className="hover:bg-secondary cursor-pointer">
            Indian Actual Claimed Border
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* System Stats Dashboard */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-secondary hover:text-primary">
            <Activity className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 bg-panel border-border">
          <DropdownMenuLabel className="text-xs text-muted-foreground">System Stats Dashboard</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          
          <div className="px-2 py-3 space-y-3">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-muted-foreground">Render FPS:</span>
              <span className="text-sm font-mono font-semibold text-foreground">{fps}</span>
            </div>
            
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-muted-foreground">Entities Loaded:</span>
              <span className="text-sm font-mono font-semibold text-green-highlight">{entityCount}</span>
            </div>
            
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-muted-foreground">Update Rate:</span>
              <span className="text-sm font-mono font-semibold text-foreground">
                {connected ? '10 Hz' : 'DEMO'}
              </span>
            </div>

            <DropdownMenuSeparator className="bg-border" />
            
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-muted-foreground">Connection:</span>
              <Badge className={connected ? 'bg-green-highlight text-black text-[10px]' : 'bg-gray-highlight text-white text-[10px]'}>
                {connected ? 'LIVE' : 'OFFLINE'}
              </Badge>
            </div>

            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-muted-foreground">Link:</span>
              <span className="text-[10px] font-mono text-white truncate max-w-[160px]" title={connectionInfo || undefined}>
                {connectionInfo || 'Unknown'}
              </span>
            </div>

            {entities.length > 0 && <>
                <DropdownMenuSeparator className="bg-border" />
                <div className="px-2">
                  <div className="text-[11px] text-muted-foreground mb-2">Connections</div>
                  <div className="max-h-48 overflow-auto pr-1 space-y-3">
                    {(['comm', 'carrier', 'link'] as const).map(group => {
                  const rows = entities.filter(ent => {
                    const meta = ent.metadata as Record<string, any> | undefined;
                    if (group === 'comm') return !!meta?.comm_port;
                    if (group === 'carrier') return !!meta?.carrier && !meta?.comm_port;
                    return !!meta?.link && !meta?.comm_port && !meta?.carrier;
                  });
                  const title = group === 'comm' ? 'COM Port' : group === 'carrier' ? 'Carrier' : 'Link URL';
                  return <div key={group}>
                          <div className="text-[10px] text-muted-foreground mb-1">{title}</div>
                          <table className="w-full text-[10px]">
                            <thead className="text-muted-foreground">
                              <tr>
                                <th className="text-left font-normal pb-1">Entity</th>
                                <th className="text-left font-normal pb-1">Type</th>
                                <th className="text-left font-normal pb-1">Conn</th>
                                <th className="text-left font-normal pb-1">Link</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.length > 0 ? rows.map(ent => {
                          const meta = ent.metadata as Record<string, any> | undefined;
                          const linkRaw = meta?.link || '';
                          const connType = meta?.comm_port ? 'Serial' : typeof linkRaw === 'string' && linkRaw.startsWith('ws') ? 'WebSocket' : typeof linkRaw === 'string' && linkRaw.startsWith('http') ? 'HTTP' : typeof linkRaw === 'string' && linkRaw.startsWith('udp') ? 'UDP' : typeof linkRaw === 'string' && linkRaw.startsWith('tcp') ? 'TCP' : meta?.carrier ? 'Carrier' : 'Unknown';
                          const link = meta?.comm_port ? `COM ${meta.comm_port}` : meta?.carrier || meta?.link || 'Unknown';
                          return <tr key={ent.entity_id} className="border-t border-border/50">
                                    <td className="py-1 pr-2 text-foreground truncate max-w-[72px]">{ent.entity_id}</td>
                                    <td className="py-1 pr-2 text-muted-foreground">{ent.type}</td>
                                    <td className="py-1 pr-2 text-muted-foreground">{connType}</td>
                                    <td className="py-1 text-foreground truncate max-w-[120px]" title={String(link)}>
                                      {link}
                                    </td>
                                  </tr>;
                        }) : <tr className="border-t border-border/50">
                                  <td className="py-1 pr-2 text-muted-foreground">—</td>
                                  <td className="py-1 pr-2 text-muted-foreground">—</td>
                                  <td className="py-1 pr-2 text-muted-foreground">Unknown</td>
                                  <td className="py-1 text-foreground">Unknown</td>
                                </tr>}
                            </tbody>
                          </table>
                        </div>;
                })}
                  </div>
                </div>
              </>}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Map Style Button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-secondary hover:text-primary">
            <Map className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-panel border-border">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Map Layers</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem className={`hover:bg-secondary cursor-pointer ${mapStyle === 'streets' ? 'bg-secondary' : ''}`} onClick={() => onMapStyleChange('streets')}>
            <Globe className="mr-2 h-4 w-4" />
            <span>Street Map</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={`hover:bg-secondary cursor-pointer ${mapStyle === 'dark' ? 'bg-secondary' : ''}`} onClick={() => onMapStyleChange('dark')}>
            <Globe className="mr-2 h-4 w-4" />
            <span>Dark Map</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={`hover:bg-secondary cursor-pointer ${mapStyle === 'satellite' ? 'bg-secondary' : ''}`} onClick={() => onMapStyleChange('satellite')}>
            <Satellite className="mr-2 h-4 w-4" />
            <span>Satellite</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={`hover:bg-secondary cursor-pointer ${mapStyle === 'terrain' ? 'bg-secondary' : ''}`} onClick={() => onMapStyleChange('terrain')}>
            <Map className="mr-2 h-4 w-4" />
            <span>Terrain</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>

      </div>
      {/* Command buttons */}
      {onCommand && <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col items-end gap-2 z-20">
          <Button size="sm" variant="outline" className={`h-8 px-2 text-xs gap-1 ${!isVehicleSelected ? 'opacity-50' : ''}`} onClick={() => onCommand('arm')} title={isVehicleSelected ? DOMAIN_TOOLTIPS[vehicleDomain].arm : 'Select a vehicle first'} disabled={!isVehicleSelected}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M12 11V6a4 4 0 0 0-4-4H8" />
              <circle cx="12" cy="16" r="1" />
            </svg>
            {DOMAIN_LABELS[vehicleDomain].arm}
          </Button>
          <Button size="sm" variant="outline" className={`h-8 px-2 text-xs gap-1 ${!isVehicleSelected ? 'opacity-50' : ''}`} onClick={() => onCommand('takeoff')} title={isVehicleSelected ? DOMAIN_TOOLTIPS[vehicleDomain].takeoff : 'Select a vehicle first'} disabled={!isVehicleSelected}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
              <line x1="5" y1="19" x2="19" y2="19" />
            </svg>
            {DOMAIN_LABELS[vehicleDomain].takeoff}
          </Button>
          <Button size="sm" variant="outline" className={`h-8 px-2 text-xs gap-1 ${!isVehicleSelected ? 'opacity-50' : ''}`} onClick={() => onCommand('land')} title={isVehicleSelected ? DOMAIN_TOOLTIPS[vehicleDomain].land : 'Select a vehicle first'} disabled={!isVehicleSelected}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
              <line x1="5" y1="5" x2="19" y2="5" />
            </svg>
            {DOMAIN_LABELS[vehicleDomain].land}
          </Button>
          <Button size="sm" variant="outline" className={`h-8 px-2 text-xs gap-1 ${!isVehicleSelected ? 'opacity-50' : ''}`} onClick={() => onCommand('rtl')} title={isVehicleSelected ? DOMAIN_TOOLTIPS[vehicleDomain].rtl : 'Select a vehicle first'} disabled={!isVehicleSelected}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9" />
              <polyline points="3 7 3 12 8 12" />
            </svg>
            {DOMAIN_LABELS[vehicleDomain].rtl}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className={`h-8 px-2 text-xs gap-1 ${!isVehicleSelected ? 'opacity-50' : ''}`} disabled={!isVehicleSelected}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" y1="3" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="21" />
                  <line x1="3" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="21" y2="12" />
                </svg>
                {DOMAIN_LABELS[vehicleDomain].mode}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40 bg-panel border-border">
              <DropdownMenuLabel className="text-xs text-muted-foreground capitalize">{vehicleDomain} Modes</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              {DOMAIN_MODES[vehicleDomain].map(mode => <DropdownMenuItem key={mode} onClick={() => onCommand('mode', {
            mode: mode.toLowerCase().replace(' ', '_')
          })} className="hover:bg-secondary cursor-pointer">
                  {mode}
                </DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}

    </div>;
};
