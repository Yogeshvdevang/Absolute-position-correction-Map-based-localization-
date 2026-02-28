import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

interface MapBasedModulePanelProps {
  onOpenAssets?: () => void;
}

const SectionLabel = ({ children }: { children: string }) => (
  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{children}</div>
);

const ControlRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="text-xs text-foreground">{label}</div>
    <div className="min-w-[120px] flex justify-end">{children}</div>
  </div>
);

export const MapBasedModulePanel = ({ onOpenAssets }: MapBasedModulePanelProps) => {
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const [modelFileName, setModelFileName] = useState<string | null>(null);

  const handleModelPick = () => {
    modelInputRef.current?.click();
  };

  const handleModelChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    setModelFileName(file ? file.name : null);
  };
  return (
    <div className="h-full flex flex-col bg-panel border-r border-panel-border">
      <div className="p-3 border-b border-panel-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-[0.14em]">Map-Based Module</div>
            <div className="text-sm font-semibold text-foreground">Absolute Position Correction</div>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenAssets}>
            Assets
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <div className="rounded-lg border border-border/60 bg-background/60 p-3">
            <SectionLabel>System Structure</SectionLabel>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Camera Frame → Preprocessing → Abstraction → Tile Matching → Voting → Refinement → Absolute Output
            </div>
          </div>

          <Accordion type="multiple" defaultValue={['map-db', 'sensor', 'abstraction']}>
            <AccordionItem value="map-db">
              <AccordionTrigger className="text-sm">1. Map Database Manager</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Map Import</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm">Upload Ortho Map</Button>
                    <Button variant="outline" size="sm">Upload Abstract Map</Button>
                    <Button variant="outline" size="sm">Load 4x4 km Patch</Button>
                    <Button variant="outline" size="sm">Batch Import Tiles</Button>
                  </div>

                  <SectionLabel>Map Settings</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Resolution">
                      <Select defaultValue="20cm">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10cm">10cm</SelectItem>
                          <SelectItem value="20cm">20cm</SelectItem>
                          <SelectItem value="50cm">50cm</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Projection">
                      <Select defaultValue="WGS84">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WGS84">WGS84</SelectItem>
                          <SelectItem value="UTM">Local UTM</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Precompute Abstract">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Precompute Pyramid">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Performance</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="GPU Preprocessing">
                      <Switch />
                    </ControlRow>
                    <div>
                      <div className="text-xs text-foreground mb-2">Cache Size (MB)</div>
                      <Slider defaultValue={[256]} min={64} max={2048} step={64} />
                    </div>
                    <Button variant="outline" size="sm">Clear Map Cache</Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="sensor">
              <AccordionTrigger className="text-sm">2. Sensor Constraint Panel</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Orientation</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Use IMU Roll/Pitch">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Use Compass Heading">
                      <Switch />
                    </ControlRow>
                    <div>
                      <div className="text-xs text-foreground mb-2">Heading Offset (°)</div>
                      <Slider defaultValue={[0]} min={-30} max={30} step={1} />
                    </div>
                  </div>

                  <SectionLabel>Altitude</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Use Barometric Scaling">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Manual Altitude">
                      <Input className="h-8 w-[120px] text-xs" placeholder="Meters" />
                    </ControlRow>
                    <div>
                      <div className="text-xs text-foreground mb-2">Scale Multiplier</div>
                      <Slider defaultValue={[1]} min={0.8} max={1.2} step={0.01} />
                    </div>
                  </div>

                  <SectionLabel>Camera</SectionLabel>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm">Upload Intrinsics</Button>
                    <ControlRow label="Auto Undistort">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="FOV Angle">
                      <Input className="h-8 w-[120px] text-xs" placeholder="Degrees" />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="abstraction">
              <AccordionTrigger className="text-sm">3. Abstraction Engine Control</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Model</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <input
                        ref={modelInputRef}
                        type="file"
                        accept=".onnx,.pt,.pth,.engine,.trt,.bin,.zip,.safetensors"
                        className="hidden"
                        onChange={handleModelChange}
                      />
                      <Button variant="outline" size="sm" onClick={handleModelPick}>Load Model</Button>
                      {modelFileName && (
                        <div className="text-[10px] text-muted-foreground truncate">Loaded: {modelFileName}</div>
                      )}
                    </div>
                    <Select defaultValue="v1.3">
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Version" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="v1.3">v1.3</SelectItem>
                        <SelectItem value="v1.2">v1.2</SelectItem>
                        <SelectItem value="v1.1">v1.1</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="col-span-2 space-y-2">
                      <ControlRow label="Fine-Tuned Model">
                        <Switch />
                      </ControlRow>
                      <ControlRow label="Multi-Decoder Mode">
                        <Switch />
                      </ControlRow>
                    </div>
                  </div>

                  <SectionLabel>Inference</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Latent Dimensionality">
                      <div className="text-xs text-muted-foreground">128</div>
                    </ControlRow>
                    <ControlRow label="Inference Resolution">
                      <Select defaultValue="512">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Resolution" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="256">256</SelectItem>
                          <SelectItem value="512">512</SelectItem>
                          <SelectItem value="1024">1024</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Mixed Precision">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="TensorRT Optimization">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Preview</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Show Raw Frame">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Show Abstract Output">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Side-by-Side">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Edge Overlay">
                      <Switch />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tile-matching">
              <AccordionTrigger className="text-sm">4. Tile Matching Engine</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Tile Settings</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Tile Size (m)">
                      <Input className="h-8 w-[120px] text-xs" placeholder="64" />
                    </ControlRow>
                    <div>
                      <div className="text-xs text-foreground mb-2">Overlap %</div>
                      <Slider defaultValue={[30]} min={0} max={80} step={1} />
                    </div>
                    <ControlRow label="Tiles Per Frame">
                      <Input className="h-8 w-[120px] text-xs" placeholder="16" />
                    </ControlRow>
                    <ControlRow label="Adaptive Tile Mode">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Matching</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Similarity Metric">
                      <Select defaultValue="cosine">
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue placeholder="Metric" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cosine">Cosine</SelectItem>
                          <SelectItem value="l2">L2</SelectItem>
                          <SelectItem value="structural">Structural Correlation</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Multi-Scale Search">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Pyramid Levels">
                      <Select defaultValue="3">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Levels" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Search Radius (m)">
                      <Input className="h-8 w-[120px] text-xs" placeholder="250" />
                    </ControlRow>
                    <ControlRow label="Dynamic Radius (VIO)">
                      <Switch />
                    </ControlRow>
                    <Button variant="destructive" size="sm">Global Search Mode</Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="voting">
              <AccordionTrigger className="text-sm">5. Voting & Confidence</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Consensus</SectionLabel>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-foreground mb-2">Minimum Tile Agreement</div>
                      <Slider defaultValue={[60]} min={0} max={100} step={1} />
                    </div>
                    <div>
                      <div className="text-xs text-foreground mb-2">Confidence Threshold</div>
                      <Slider defaultValue={[0.7]} min={0} max={1} step={0.01} />
                    </div>
                    <ControlRow label="Max Spatial Variance (m)">
                      <Input className="h-8 w-[120px] text-xs" placeholder="35" />
                    </ControlRow>
                    <ControlRow label="Reject Outliers">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Temporal Stability</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Consecutive Matches">
                      <Input className="h-8 w-[120px] text-xs" placeholder="3" />
                    </ControlRow>
                    <ControlRow label="Temporal Smoothing">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Motion Consistency">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Drift Detection</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Warning Threshold (m)">
                      <Input className="h-8 w-[120px] text-xs" placeholder="25" />
                    </ControlRow>
                    <ControlRow label="Hard Reset Trigger">
                      <Switch />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="refinement">
              <AccordionTrigger className="text-sm">6. Coarse-to-Fine Refinement</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Coarse Stage</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Enable Coarse Localization">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Downsample Level">
                      <Select defaultValue="2">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <ControlRow label="Confidence Display">
                      <Switch />
                    </ControlRow>
                  </div>

                  <SectionLabel>Fine Stage</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Enable Fine Alignment">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Edge Alignment Weight">
                      <Input className="h-8 w-[120px] text-xs" placeholder="0.6" />
                    </ControlRow>
                    <ControlRow label="Road Intersection Weight">
                      <Input className="h-8 w-[120px] text-xs" placeholder="0.2" />
                    </ControlRow>
                    <ControlRow label="Building Overlap Weight">
                      <Input className="h-8 w-[120px] text-xs" placeholder="0.2" />
                    </ControlRow>
                    <ControlRow label="Subpixel Optimization">
                      <Switch />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="output">
              <AccordionTrigger className="text-sm">7. Output + Diagnostics</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Live Data</SectionLabel>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Latitude</div>
                      <div className="font-mono text-foreground">28.6139</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Longitude</div>
                      <div className="font-mono text-foreground">77.2090</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">UTM X/Y</div>
                      <div className="font-mono text-foreground">432100 / 3167200</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Confidence</div>
                      <div className="font-mono text-foreground">0.92</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Error Radius</div>
                      <div className="font-mono text-foreground">12 m</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Fatal Error</div>
                      <div className="font-mono text-destructive">No</div>
                    </div>
                  </div>

                  <SectionLabel>Visualization</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Drone on Map">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Tile Vote Heatmap">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Search Region">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Drift Graph">
                      <Switch />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="failsafe">
              <AccordionTrigger className="text-sm">8. Failsafe & Safety</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Policy</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Freeze If Confidence < X">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="No Match → VIO Only">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Ambiguous → Operator Confirm">
                      <Switch />
                    </ControlRow>
                    <Button variant="destructive" size="sm">Emergency Global Relocalize</Button>
                    <Button variant="outline" size="sm">Switch to Relative-Only</Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
};
