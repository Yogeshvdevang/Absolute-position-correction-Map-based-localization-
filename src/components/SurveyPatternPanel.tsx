import { useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { Grid3X3, X, Camera, Ruler, RotateCcw, BarChart3, GripHorizontal, Info } from 'lucide-react';
import { Badge } from './ui/badge';
import { useDraggable } from '@/hooks/useDraggable';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface SurveyPatternPanelProps {
  onClose: () => void;
  onApply?: (config: SurveyConfig) => void;
  onPreview?: (config: SurveyConfig) => void;
  config: SurveyConfig;
  onConfigChange: (config: SurveyConfig) => void;
}

export interface SurveyConfig {
  patternType: 'grid' | 'corridor' | 'circle';
  cameraType: string;
  altitude: number;
  triggerDistance: number;
  spacing: number;
  angle: number;
  turnaroundDist: number;
  corridorWidth: number;
  circleRadius: number;
  hoverAndCapture: boolean;
  reflyAt90: boolean;
  imagesInTurnarounds: boolean;
  relativeAltitude: boolean;
}

export const SurveyPatternPanel = ({ onClose, onApply, onPreview, config, onConfigChange }: SurveyPatternPanelProps) => {
  const { position, isDragging, handleMouseDown } = useDraggable({ x: 0, y: 0 });

  useEffect(() => {
    onPreview?.(config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simulated statistics based on config
  const stats = {
    surveyArea: (config.spacing * config.triggerDistance * 50).toFixed(2),
    photoCount: Math.ceil((config.spacing * 10) / config.triggerDistance),
    photoInterval: (config.triggerDistance / 15).toFixed(1),
    triggerDistance: config.triggerDistance.toFixed(2),
  };

  const updateConfig = <K extends keyof SurveyConfig>(key: K, value: SurveyConfig[K]) => {
    const next = { ...config, [key]: value };
    onConfigChange(next);
    onPreview?.(next);
  };

  return (
    <Card 
      className="bg-panel/95 border-panel-border shadow-2xl backdrop-blur-sm w-[320px] max-h-[calc(100vh-120px)] flex flex-col"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseDown={handleMouseDown}
    >
      <div 
        data-drag-handle
        className={`p-3 flex items-center gap-2 border-b border-panel-border shrink-0 cursor-grab ${isDragging ? 'bg-muted/50 cursor-grabbing' : ''}`}
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground" />
        <Grid3X3 className="h-4 w-4 text-green-500" />
        <h3 className="text-sm font-semibold text-foreground">Survey (Plan Pattern)</h3>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 ml-auto" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-auto">
        <div className="p-3 space-y-4">
          {/* Camera Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Camera className="h-3.5 w-3.5" />
              Camera
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Pattern</Label>
              <Select value={config.patternType} onValueChange={(v) => updateConfig('patternType', v as SurveyConfig['patternType'])}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select pattern" />
                </SelectTrigger>
                <SelectContent className="bg-panel border-panel-border">
                  <SelectItem value="grid" className="text-xs">Survey Grid</SelectItem>
                  <SelectItem value="corridor" className="text-xs">Corridor Scan</SelectItem>
                  <SelectItem value="circle" className="text-xs">Circle Survey</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Select value={config.cameraType} onValueChange={(v) => updateConfig('cameraType', v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select camera" />
              </SelectTrigger>
              <SelectContent className="bg-panel border-panel-border">
                <SelectItem value="manual" className="text-xs">Manual (no camera specs)</SelectItem>
                <SelectItem value="sony-a7r" className="text-xs">Sony A7R IV</SelectItem>
                <SelectItem value="dji-phantom" className="text-xs">DJI Phantom 4 Pro</SelectItem>
                <SelectItem value="custom" className="text-xs">Custom</SelectItem>
              </SelectContent>
            </Select>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Altitude</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={config.altitude}
                    onChange={(e) => updateConfig('altitude', parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">m</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Trigger Distance</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={config.triggerDistance}
                    onChange={(e) => updateConfig('triggerDistance', parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">m</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Spacing</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={config.spacing}
                  onChange={(e) => updateConfig('spacing', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs flex-1"
                />
                <span className="text-[10px] text-muted-foreground">m</span>
              </div>
            </div>

            {config.patternType === 'corridor' && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Corridor width</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={config.corridorWidth}
                    onChange={(e) => updateConfig('corridorWidth', parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground">m</span>
                </div>
              </div>
            )}

            {config.patternType === 'circle' && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Circle radius</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={config.circleRadius}
                    onChange={(e) => updateConfig('circleRadius', parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground">m</span>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Transects Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Ruler className="h-3.5 w-3.5" />
              Transects
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Label className="text-[11px] text-muted-foreground">Angle</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        <p className="text-xs">The angle of the grid lines, relative to North.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={config.angle}
                    onChange={(e) => updateConfig('angle', parseFloat(e.target.value) || 0)}
                    className="h-7 w-16 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">deg</span>
                </div>
              </div>
              <Slider
                value={[config.angle]}
                onValueChange={([v]) => updateConfig('angle', v)}
                min={0}
                max={360}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-[11px] text-muted-foreground">Turnaround dist</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      <p className="text-xs">Amount of additional distance to add outside the survey area for vehicle turn around.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={config.turnaroundDist}
                  onChange={(e) => updateConfig('turnaroundDist', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs flex-1"
                />
                <span className="text-[10px] text-muted-foreground">m</span>
              </div>
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs">
                    <RotateCcw className="h-3.5 w-3.5 mr-2" />
                    Rotate Entry Point
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px]">
                  <p className="text-xs">Swap the start and end point of the survey.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Separator />

          {/* Options */}
          <div className="space-y-2">
            <TooltipProvider>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hover-capture"
                  checked={config.hoverAndCapture}
                  onCheckedChange={(c) => updateConfig('hoverAndCapture', !!c)}
                />
                <Label htmlFor="hover-capture" className="text-[11px] text-foreground cursor-pointer flex items-center gap-1">
                  Hover and capture image
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      <p className="text-xs">Hover to capture images (multicopter only).</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
              </div>
            </TooltipProvider>
            
            <TooltipProvider>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="refly-90"
                  checked={config.reflyAt90}
                  onCheckedChange={(c) => updateConfig('reflyAt90', !!c)}
                />
                <Label htmlFor="refly-90" className="text-[11px] text-foreground cursor-pointer flex items-center gap-1">
                  Refly at 90 deg offset
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      <p className="text-xs">Refly the whole mission at a 90 degree offset.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
              </div>
            </TooltipProvider>
            
            <TooltipProvider>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="images-turnarounds"
                  checked={config.imagesInTurnarounds}
                  onCheckedChange={(c) => updateConfig('imagesInTurnarounds', !!c)}
                />
                <Label htmlFor="images-turnarounds" className="text-[11px] text-foreground cursor-pointer flex items-center gap-1">
                  Images in turnarounds
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      <p className="text-xs">Take images when turning.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
              </div>
            </TooltipProvider>
            
            <TooltipProvider>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="relative-alt"
                  checked={config.relativeAltitude}
                  onCheckedChange={(c) => updateConfig('relativeAltitude', !!c)}
                />
                <Label htmlFor="relative-alt" className="text-[11px] text-foreground cursor-pointer flex items-center gap-1">
                  Relative altitude
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      <p className="text-xs">Make specified altitudes relative to home (if unchecked they are AMSL).</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
              </div>
            </TooltipProvider>
          </div>

          <Separator />

          {/* Statistics Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              Statistics
            </div>
            
            <div className="bg-secondary/40 border border-panel-border rounded-md p-2 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Survey Area</span>
                <span className="text-foreground font-mono">{stats.surveyArea} m²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Photo Count</span>
                <span className="text-foreground font-mono">{stats.photoCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Photo Interval</span>
                <span className="text-foreground font-mono">{stats.photoInterval} secs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trigger Distance</span>
                <span className="text-foreground font-mono">{stats.triggerDistance} m</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Apply Button */}
          <Button 
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => onApply?.(config)}
          >
            Apply Pattern
          </Button>
        </div>
      </ScrollArea>
    </Card>
  );
};
