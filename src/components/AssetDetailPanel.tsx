import { ArrowLeft, Battery, MapPin, Activity, Video, Maximize2 } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';

interface Asset {
  id: string;
  type: string;
  status: string;
  battery?: string;
  fuel?: string;
  power?: string;
  location: string;
}

interface AssetDetailPanelProps {
  asset: Asset;
  onBack: () => void;
}

export const AssetDetailPanel = ({ asset, onBack }: AssetDetailPanelProps) => {
  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="p-3 border-b border-panel-border">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{asset.id}</h2>
            <p className="text-xs text-muted-foreground">{asset.type}</p>
          </div>
          <Badge variant={asset.status === 'Active' ? 'default' : 'secondary'}>
            {asset.status}
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Live Camera Feed */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Live Camera Feed</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="relative aspect-video bg-secondary/30 rounded border border-border/50 overflow-hidden">
              {/* Simulated camera feed */}
              <div className="absolute inset-0 bg-gradient-to-br from-secondary/50 to-secondary/80 flex items-center justify-center">
                <Video className="h-12 w-12 text-muted-foreground" />
              </div>
              {/* Status overlay */}
              <div className="absolute top-2 left-2 flex items-center gap-2">
                <div className="flex items-center gap-1 px-2 py-1 rounded bg-background/80 backdrop-blur-sm">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-medium text-foreground">LIVE</span>
                </div>
              </div>
              {/* Info overlay */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs">
                <div className="px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-foreground">
                  {asset.id} - FPV Camera
                </div>
                <div className="px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-foreground">
                  1080p • 30fps
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Overall Condition */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Overall Condition</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded bg-secondary/50 border border-border/50">
                <div className="flex items-center gap-2">
                  <Battery className="h-4 w-4 text-primary" />
                  <span className="text-sm text-foreground">Power Level</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {asset.battery || asset.fuel || asset.power}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded bg-secondary/50 border border-border/50">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm text-foreground">Location</span>
                </div>
                <span className="text-sm font-medium text-foreground">{asset.location}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded bg-secondary/50 border border-border/50">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="text-sm text-foreground">System Health</span>
                </div>
                <Badge variant="outline" className="text-xs">Nominal</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Task Assignment */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Task the Asset</h3>
            <Select>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select task..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recon">Reconnaissance</SelectItem>
                <SelectItem value="patrol">Patrol Route</SelectItem>
                <SelectItem value="surveillance">Surveillance</SelectItem>
                <SelectItem value="transport">Transport</SelectItem>
                <SelectItem value="standby">Return to Standby</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="w-full mt-2">
              Assign Task
            </Button>
          </div>

          <Separator />

          {/* Payload Management */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Payload</h3>
            <Select>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Attach payload..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="camera">HD Camera</SelectItem>
                <SelectItem value="thermal">Thermal Imaging</SelectItem>
                <SelectItem value="lidar">LIDAR Scanner</SelectItem>
                <SelectItem value="sensor">Sensor Package</SelectItem>
                <SelectItem value="none">No Payload</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="mt-3 p-3 rounded bg-secondary/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Current Payload</p>
              <p className="text-sm font-medium text-foreground">HD Camera</p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
