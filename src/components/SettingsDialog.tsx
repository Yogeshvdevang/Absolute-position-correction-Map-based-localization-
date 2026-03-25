import { Settings, Moon, Sun, Monitor, CircleHelp, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const navigate = useNavigate();
  const handleOpenDocs = () => {
    onOpenChange(false);
    window.setTimeout(() => navigate('/docs'), 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-panel border-panel-border">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  System Settings
                </DialogTitle>
                <DialogDescription>
                  Configure CHAOX HQ display and notification preferences
                </DialogDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                    <CircleHelp className="h-4 w-4" />
                    <span className="sr-only">Open help menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={handleOpenDocs}>
                    <BookOpen className="mr-2 h-4 w-4" />
                    Docs
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogHeader>

          <Tabs defaultValue="display" className="mt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="display">Display</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </TabsList>

            <TabsContent value="display" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Theme</Label>
                    <p className="text-xs text-muted-foreground">
                      Choose your preferred color scheme
                    </p>
                  </div>
                  <Select defaultValue="dark">
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="h-3 w-3" />
                          Light
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="h-3 w-3" />
                          Dark
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-3 w-3" />
                          System
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">High Contrast Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      Enhance visibility for critical information
                    </p>
                  </div>
                  <Switch />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Compact Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      Reduce spacing for more content
                    </p>
                  </div>
                  <Switch />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">UI Scale</Label>
                    <span className="text-xs text-muted-foreground">100%</span>
                  </div>
                  <Slider defaultValue={[100]} max={150} min={80} step={10} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Enable Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive system alerts and updates
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Sound Alerts</Label>
                    <p className="text-xs text-muted-foreground">
                      Play audio for critical notifications
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Desktop Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Show browser notifications
                    </p>
                  </div>
                  <Switch />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Notification Priority</Label>
                  <Select defaultValue="high">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Notifications</SelectItem>
                      <SelectItem value="high">High Priority Only</SelectItem>
                      <SelectItem value="critical">Critical Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="map" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">3D Terrain</Label>
                    <p className="text-xs text-muted-foreground">
                      Enable high-resolution terrain rendering
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Entity Labels</Label>
                    <p className="text-xs text-muted-foreground">
                      Show labels for all tracked entities
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Path Trails</Label>
                    <p className="text-xs text-muted-foreground">
                      Display historical movement paths
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Map Style</Label>
                  <Select defaultValue="satellite">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="satellite">Satellite Imagery</SelectItem>
                      <SelectItem value="terrain">Terrain</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="tactical">Tactical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Hardware Acceleration</Label>
                    <p className="text-xs text-muted-foreground">
                      Use GPU for rendering (recommended)
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Frame Rate Limit</Label>
                    <span className="text-xs text-muted-foreground">60 FPS</span>
                  </div>
                  <Slider defaultValue={[60]} max={120} min={30} step={15} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Update Frequency</Label>
                  <Select defaultValue="high">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="realtime">Real-time (1s)</SelectItem>
                      <SelectItem value="high">High (2s)</SelectItem>
                      <SelectItem value="medium">Medium (5s)</SelectItem>
                      <SelectItem value="low">Low (10s)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Auto-Save State</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically save view and panel state
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </TabsContent>
          </Tabs>
      </DialogContent>
    </Dialog>
  );
};
