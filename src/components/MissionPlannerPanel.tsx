import { MissionWaypoint } from '@/types/mission';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Card } from './ui/card';
import { Textarea } from './ui/textarea';
import { Crosshair, Navigation, Route, Trash2, ArrowUp, ArrowDown, PlaneTakeoff, Waypoints, Timer, Undo2, PauseCircle, Grid3X3, ChevronDown, Circle, CornerDownRight, ScanLine, GripHorizontal, Upload, Play, Pause, FolderOpen, Plus, Link2, ChevronUp, X, Check, Target, Radio, Zap, Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { SurveyPatternPanel } from './SurveyPatternPanel';
import { useDraggable } from '@/hooks/useDraggable';
import type { SurveyConfig } from './SurveyPatternPanel';

type PlannerMission = {
  id: string;
  name: string;
  description: string;
  typeId: string;
  status: string;
  asset: string;
  waypoints: MissionWaypoint[];
  cruiseSpeed: number;
};

type PlannerOperation = {
  id: string;
  name: string;
  missions: PlannerMission[];
};

interface MissionPlannerPanelProps {
  operations: PlannerOperation[];
  selectedOperationId: string | null;
  selectedMissionId: string | null;
  onSelectOperation: (id: string) => void;
  onSelectMission: (id: string) => void;
  onCreateOperation: (name: string) => void;
  onCreateMission: (name: string, typeId: string) => void;
  onUpdateMissionMeta: (missionId: string, updates: Partial<PlannerMission>) => void;
  waypoints: MissionWaypoint[];
  planningEnabled: boolean;
  defaultAirspeed: number;
  onAirspeedChange: (value: number) => void;
  onTogglePlanning: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onUpdate: (id: string, patch: Partial<MissionWaypoint>) => void;
  onFocus: (wp: MissionWaypoint) => void;
  onClose: () => void;
  onApplyPattern: (config: SurveyConfig) => void;
  onPreviewPattern: (config: SurveyConfig) => void;
  surveyConfig: SurveyConfig;
  onSurveyConfigChange: (config: SurveyConfig) => void;
  onSurveyPanelOpenChange?: (open: boolean) => void;
  onUploadMission?: () => void;
  onStartMission?: () => void;
  onPauseMission?: () => void;
}

const haversineKm = (a: MissionWaypoint, b: MissionWaypoint) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Mission types for selection
const missionTypes = [
  { id: 'area-search', name: 'Area Search', icon: Grid3X3, color: 'bg-cyan-500' },
  { id: 'perimeter-patrol', name: 'Perimeter Patrol', icon: Route, color: 'bg-blue-500' },
  { id: 'route-inspection', name: 'Route Inspection', icon: CornerDownRight, color: 'bg-emerald-500' },
  { id: 'loiter-observe', name: 'Loiter/Observe', icon: Eye, color: 'bg-purple-500' },
  { id: 'target-track', name: 'Target Track', icon: Target, color: 'bg-red-500' },
  { id: 'comms-relay', name: 'Comms Relay', icon: Radio, color: 'bg-orange-500' },
  { id: 'rapid-retask', name: 'Rapid Re-task', icon: Zap, color: 'bg-yellow-500' },
];


export const MissionPlannerPanel = ({
  operations,
  selectedOperationId,
  selectedMissionId,
  onSelectOperation,
  onSelectMission,
  onCreateOperation,
  onCreateMission,
  onUpdateMissionMeta,
  waypoints,
  planningEnabled,
  defaultAirspeed,
  onAirspeedChange,
  onTogglePlanning,
  onClear,
  onUndo,
  onRemove,
  onReorder,
  onUpdate,
  onFocus,
  onClose,
  onApplyPattern,
  onPreviewPattern,
  surveyConfig,
  onSurveyConfigChange,
  onSurveyPanelOpenChange,
  onUploadMission,
  onStartMission,
  onPauseMission
}: MissionPlannerPanelProps) => {
  const [showSurveyPanel, setShowSurveyPanel] = useState(false);
  const [missionListOpen, setMissionListOpen] = useState(true);
  const [newOperationDialogOpen, setNewOperationDialogOpen] = useState(false);
  const [newOperationName, setNewOperationName] = useState('');
  const [newMissionDialogOpen, setNewMissionDialogOpen] = useState(false);
  const [newMissionName, setNewMissionName] = useState('');
  const [newMissionType, setNewMissionType] = useState('area-search');
  const { position, isDragging, handleMouseDown } = useDraggable({ x: 0, y: 0 });

  const selectedOperation = operations.find(op => op.id === selectedOperationId) || null;
  const selectedMission = selectedOperation?.missions.find(m => m.id === selectedMissionId) || null;

  const handleCreateOperation = () => {
    if (newOperationName.trim()) {
      onCreateOperation(newOperationName.trim());
      setNewOperationName('');
      setNewOperationDialogOpen(false);
    }
  };

  const handleCreateMission = () => {
    if (newMissionName.trim()) {
      onCreateMission(newMissionName.trim(), newMissionType);
      setNewMissionName('');
      setNewMissionType('area-search');
      setNewMissionDialogOpen(false);
    }
  };
  
  const stats = useMemo(() => {
    if (waypoints.length < 2) return { totalDistance: 0, etaMinutes: 0, legs: [] as number[] };
    const legs = [];
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const d = haversineKm(waypoints[i - 1], waypoints[i]);
      legs.push(d);
      total += d;
    }
    const etaMinutes = defaultAirspeed > 0 ? (total / (defaultAirspeed)) * 60 : 0;
    return { totalDistance: total, etaMinutes, legs };
  }, [defaultAirspeed, waypoints]);

  const handleAltChange = (wp: MissionWaypoint, value: string) => {
    const alt = parseFloat(value);
    if (Number.isFinite(alt)) {
      onUpdate(wp.id, { alt });
    }
  };

  const handleNameChange = (wp: MissionWaypoint, value: string) => {
    onUpdate(wp.id, { name: value });
  };

  const formatDistance = (km: number) => `${km.toFixed(2)} km`;
  const formatEta = (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return '–';
    if (minutes < 60) return `${minutes.toFixed(0)} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hrs}h ${mins}m`;
  };

  return (
    <Card 
      className="bg-panel/95 border-panel-border shadow-2xl backdrop-blur-sm relative max-h-[calc(100vh-80px)] min-h-[400px] flex flex-col w-[480px]"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseDown={handleMouseDown}
    >
      {/* Operation Folder Header with Dropdown */}
      <div 
        data-drag-handle
        className={`p-3 flex items-center gap-2 border-b border-panel-border cursor-grab shrink-0 ${isDragging ? 'bg-muted/50 cursor-grabbing' : ''}`}
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground" />
        <FolderOpen className="h-4 w-4 text-primary" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-sm font-semibold text-foreground hover:bg-secondary/40">
              {selectedOperation?.name || 'Select Operation'}
              <Badge variant="outline" className="text-[10px] border-muted-foreground/40 ml-2">
              {selectedOperation?.missions.length || 0} missions
              </Badge>
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-panel border-panel-border w-64">
            {operations.map((op) => (
              <DropdownMenuItem
                key={op.id}
                className="text-xs gap-2 cursor-pointer"
                onClick={() => onSelectOperation(op.id)}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    {op.id === selectedOperationId && <Check className="h-3 w-3 text-primary" />}
                    <span className={op.id === selectedOperationId ? 'font-medium' : ''}>{op.name}</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] h-5">{op.missions.length} missions</Badge>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs gap-2 cursor-pointer text-primary"
              onClick={() => setNewOperationDialogOpen(true)}
            >
              <Plus className="h-3 w-3" />
              New Operation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1 ml-auto">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setNewOperationDialogOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
            ✕
          </Button>
        </div>
      </div>

      {/* New Operation Dialog */}
      <Dialog open={newOperationDialogOpen} onOpenChange={setNewOperationDialogOpen}>
        <DialogContent className="bg-panel border-panel-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">New Operation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Operation name..."
              value={newOperationName}
              onChange={(e) => setNewOperationName(e.target.value)}
              className="bg-secondary/40 border-panel-border"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateOperation()}
            />
            <Button 
              onClick={handleCreateOperation} 
              className="w-full"
              disabled={!newOperationName.trim()}
            >
              Create Operation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mission List Section */}
      <Collapsible open={missionListOpen} onOpenChange={setMissionListOpen}>
        <CollapsibleTrigger asChild>
          <div className="px-3 py-2 flex items-center gap-2 border-b border-panel-border cursor-pointer hover:bg-secondary/30 shrink-0">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Missions</span>
            {missionListOpen ? <ChevronUp className="h-3 w-3 ml-auto text-muted-foreground" /> : <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-2 space-y-1 border-b border-panel-border shrink-0">
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full justify-start text-xs h-8 mb-2"
              onClick={() => setNewMissionDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-2" />
              Add Mission
            </Button>
            {selectedOperation?.missions.map((mission) => {
              const typeEntry = missionTypes.find(t => t.id === mission.typeId);
              const colorClass = typeEntry?.color || 'bg-cyan-500';
              const typeLabel = typeEntry?.name || mission.typeId;
              return (
                <div 
                  key={mission.id}
                  onClick={() => onSelectMission(mission.id)}
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    selectedMissionId === mission.id 
                      ? 'bg-primary/10 border-primary/40' 
                      : 'border-panel-border hover:bg-secondary/40'
                  }`}
                >
                  <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />
                  <div className={`w-1 h-8 rounded-full ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate">{mission.name}</span>
                      <Badge variant="outline" className="text-[9px] h-5 border-green-600/50 text-green-400 shrink-0">
                        {typeLabel}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className={`flex items-center gap-1 ${mission.status === 'Ready' ? 'text-blue-400' : ''}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${mission.status === 'Ready' ? 'bg-blue-400' : 'bg-muted-foreground'}`} />
                        {mission.status}
                      </span>
                      <span>?^ {mission.asset}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Add New Mission Dialog */}
      <Dialog open={newMissionDialogOpen} onOpenChange={setNewMissionDialogOpen}>
        <DialogContent className="bg-panel border-panel-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add New Mission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Mission Name</Label>
              <Input
                placeholder="Area Search"
                value={newMissionName}
                onChange={(e) => setNewMissionName(e.target.value)}
                className="bg-secondary/40 border-panel-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Mission Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {missionTypes.map((type) => {
                  const IconComponent = type.icon;
                  return (
                    <Button
                      key={type.id}
                      variant={newMissionType === type.id ? "default" : "outline"}
                      size="sm"
                      className={`justify-start h-9 text-xs ${newMissionType === type.id ? 'bg-secondary border-primary' : 'border-panel-border'}`}
                      onClick={() => setNewMissionType(type.id)}
                    >
                      <IconComponent className={`h-3.5 w-3.5 mr-2 ${newMissionType === type.id ? '' : type.color.replace('bg-', 'text-')}`} />
                      {type.name}
                    </Button>
                  );
                })}
              </div>
            </div>
            <Button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleCreateMission();
              }} 
              className="w-full"
              disabled={!newMissionName.trim() || !selectedOperationId}
            >
              Create Mission
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mission Planner - Only shows when a mission is selected */}
      {selectedMission ? (
        <>
          <div className="p-3 flex items-center gap-2 border-b border-panel-border shrink-0 bg-secondary/20">
            <Route className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
              <h3 className="text-sm font-semibold text-foreground">Mission Planner</h3>
              <span className="text-[10px] text-muted-foreground">
                {selectedMission?.name}
              </span>
            </div>
            <Badge className={planningEnabled ? 'bg-green-highlight text-black text-[10px]' : 'bg-gray-highlight text-[10px]'}>{planningEnabled ? 'ARMED' : 'IDLE'}</Badge>
            <div className="flex items-center gap-1 ml-auto">
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={onTogglePlanning}>
                {planningEnabled ? <PauseCircle className="h-4 w-4 mr-1" /> : <Navigation className="h-4 w-4 mr-1" />}
                {planningEnabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </div>

      <div className="p-3 grid grid-cols-3 gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2 bg-secondary/40 rounded-md px-2 py-2 border border-panel-border">
          <Waypoints className="h-4 w-4 text-primary" />
          <div>
            <div className="text-muted-foreground">Waypoints</div>
            <div className="font-semibold text-foreground">{waypoints.length}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-secondary/40 rounded-md px-2 py-2 border border-panel-border">
          <Route className="h-4 w-4 text-primary" />
          <div>
            <div className="text-muted-foreground">Distance</div>
            <div className="font-semibold text-foreground">{formatDistance(stats.totalDistance)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-secondary/40 rounded-md px-2 py-2 border border-panel-border">
          <Timer className="h-4 w-4 text-primary" />
          <div>
            <div className="text-muted-foreground">ETA @ {defaultAirspeed} m/s</div>
            <div className="font-semibold text-foreground">{formatEta(stats.etaMinutes)}</div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-2 grid grid-cols-2 gap-2 text-xs shrink-0">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mission Name</Label>
          <Input
            value={selectedMission?.name || ''}
            className="h-8 text-xs"
            onChange={(e) => selectedMission && onUpdateMissionMeta(selectedMission.id, { name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mission Description</Label>
          <Textarea
            value={selectedMission?.description || ''}
            rows={2}
            className="min-h-[64px] text-xs"
            onChange={(e) => selectedMission && onUpdateMissionMeta(selectedMission.id, { description: e.target.value })}
          />
        </div>
      </div>

      <div className="px-3 pb-2 flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Cruise</Label>
          <Input
            type="number"
            value={defaultAirspeed}
            min={1}
            className="h-8 w-20 text-xs"
            onChange={(e) => onAirspeedChange(parseFloat(e.target.value) || defaultAirspeed)}
          />
          <span className="text-[11px] text-muted-foreground">m/s</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 ml-auto">
          <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onUploadMission} disabled={!waypoints.length || !onUploadMission}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            Sync
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onStartMission} disabled={!waypoints.length || !onStartMission}>
            <Play className="h-3.5 w-3.5 mr-1" />
            Start
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onPauseMission} disabled={!onPauseMission}>
            <Pause className="h-3.5 w-3.5 mr-1" />
            Pause
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs bg-green-600 hover:bg-green-700 text-white border-green-700">
                <Grid3X3 className="h-4 w-4 mr-1" />
                Pattern
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-panel border-panel-border">
              <DropdownMenuItem
                className="text-xs gap-2 cursor-pointer"
                onClick={() => {
                  const next = { ...surveyConfig, patternType: 'grid' as const };
                  onSurveyConfigChange(next);
                  setShowSurveyPanel(true);
                  onSurveyPanelOpenChange?.(true);
                  onPreviewPattern(next);
                }}
              >
                <ScanLine className="h-4 w-4" />
                Survey
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs gap-2 cursor-pointer"
                onClick={() => {
                  onSurveyConfigChange({ ...surveyConfig, patternType: 'corridor' });
                  setShowSurveyPanel(true);
                  onSurveyPanelOpenChange?.(true);
                  onPreviewPattern({ ...surveyConfig, patternType: 'corridor' });
                }}
              >
                <CornerDownRight className="h-4 w-4" />
                Corridor Scan
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs gap-2 cursor-pointer"
                onClick={() => {
                  onSurveyConfigChange({ ...surveyConfig, patternType: 'circle' });
                  setShowSurveyPanel(true);
                  onSurveyPanelOpenChange?.(true);
                  onPreviewPattern({ ...surveyConfig, patternType: 'circle' });
                }}
              >
                <Circle className="h-4 w-4" />
                Circle Survey
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={!waypoints.length} onClick={onUndo}>
            <Undo2 className="h-4 w-4 mr-1" />
            Undo
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={!waypoints.length} onClick={onClear}>
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      <Separator className="shrink-0" />

      <ScrollArea className="flex-1 min-h-[200px] overflow-auto">
        <div className="p-3 space-y-3">
          {waypoints.length === 0 && (
            <div className="text-xs text-muted-foreground bg-secondary/40 border border-dashed border-panel-border rounded-md p-3">
              Planning is {planningEnabled ? 'enabled' : 'disabled'}. Enable planning and click on the map to drop waypoints like QGC. Use the toolbar undo/clear buttons to refine the route.
            </div>
          )}

          {waypoints.map((wp, idx) => {
            const legDistance = idx > 0 ? stats.legs[idx - 1] : 0;
            const legEta = defaultAirspeed > 0 ? (legDistance / defaultAirspeed) * 60 : 0;
            return (
              <Card key={wp.id} className="p-3 bg-secondary/40 border-panel-border">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="text-[10px] px-2 py-0.5 bg-primary/20 text-primary border border-primary/40">
                    #{idx + 1}
                  </Badge>
                  <Input
                    value={wp.name || `WP ${idx + 1}`}
                    onChange={(e) => handleNameChange(wp, e.target.value)}
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center gap-1 ml-auto">
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={idx === 0} onClick={() => onReorder(idx, idx - 1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={idx === waypoints.length - 1} onClick={() => onReorder(idx, idx + 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onFocus(wp)}>
                      <Crosshair className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onRemove(wp.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-panel/60 border border-panel-border rounded px-2 py-2">
                    <div className="text-muted-foreground">Lat / Lon</div>
                    <div className="font-mono text-foreground text-[11px]">{wp.lat.toFixed(5)}, {wp.lon.toFixed(5)}</div>
                  </div>
                  <div className="bg-panel/60 border border-panel-border rounded px-2 py-2 flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Alt</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={wp.alt}
                      onChange={(e) => handleAltChange(wp, e.target.value)}
                    />
                    <span className="text-[11px] text-muted-foreground">m AGL</span>
                  </div>
                </div>

                {idx > 0 && (
                  <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-2">
                    <PlaneTakeoff className="h-4 w-4" />
                    Leg: {formatDistance(legDistance)} • {formatEta(legEta)}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>
        </>
      ) : (
        <div className="p-6 text-center text-muted-foreground">
          <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Select a mission above to open the planner</p>
        </div>
      )}
      {/* Survey Pattern Panel */}
      {showSurveyPanel && (
        <div className="absolute left-full ml-2 top-0">
          <SurveyPatternPanel 
            onClose={() => {
              setShowSurveyPanel(false);
              onSurveyPanelOpenChange?.(false);
            }}
            onApply={(config) => {
              onApplyPattern(config);
              setShowSurveyPanel(false);
              onSurveyPanelOpenChange?.(false);
            }}
            onPreview={onPreviewPattern}
            config={surveyConfig}
            onConfigChange={onSurveyConfigChange}
          />
        </div>
      )}
    </Card>
  );
};
