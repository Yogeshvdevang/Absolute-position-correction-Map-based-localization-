import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

const SectionLabel = ({ children }: { children: string }) => (
  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{children}</div>
);

const ControlRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="text-xs text-foreground">{label}</div>
    <div className="min-w-[120px] flex justify-end">{children}</div>
  </div>
);

export const TrainingPipelinePanel = () => {
  return (
    <div className="h-full flex flex-col bg-panel border-r border-panel-border">
      <div className="p-3 border-b border-panel-border">
        <div className="text-xs text-muted-foreground uppercase tracking-[0.14em]">Training Pipeline</div>
        <div className="text-sm font-semibold text-foreground">Absolute Position Correction</div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <div className="rounded-lg border border-border/60 bg-background/60 p-3">
            <SectionLabel>Pipeline Flow</SectionLabel>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Data Ingest → Preprocessing → Training → Evaluation → Export
            </div>
          </div>

          <Accordion type="multiple" defaultValue={['ingest', 'train']}>
            <AccordionItem value="ingest">
              <AccordionTrigger className="text-sm">1. Data Ingest</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Sources</SectionLabel>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm">Upload Ortho Map</Button>
                      <Button variant="outline" size="sm">Upload Abstract Map</Button>
                    </div>
                    <Button variant="outline" size="sm">Connect Drone Live Feed</Button>
                    <Button variant="outline" size="sm">Upload Dataset</Button>
                    <ControlRow label="Dataset Path">
                      <Input className="h-8 w-[160px] text-xs" placeholder="/data/apc" />
                    </ControlRow>
                    <ControlRow label="Use Live Capture">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Auto Label Align">
                      <Switch />
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="preprocess">
              <AccordionTrigger className="text-sm">2. Preprocessing</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Transforms</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Normalize Input">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Undistort Frames">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Auto Crop Tiles">
                      <Switch />
                    </ControlRow>
                    <ControlRow label="Augmentations">
                      <Select defaultValue="medium">
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue placeholder="Augments" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">Off</SelectItem>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="heavy">Heavy</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="train">
              <AccordionTrigger className="text-sm">3. Training</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Hyperparameters</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Batch Size">
                      <Input className="h-8 w-[120px] text-xs" placeholder="16" />
                    </ControlRow>
                    <ControlRow label="Epochs">
                      <Input className="h-8 w-[120px] text-xs" placeholder="30" />
                    </ControlRow>
                    <ControlRow label="Learning Rate">
                      <Input className="h-8 w-[120px] text-xs" placeholder="1e-4" />
                    </ControlRow>
                    <div>
                      <div className="text-xs text-foreground mb-2">Confidence Loss Weight</div>
                      <Slider defaultValue={[0.3]} min={0} max={1} step={0.01} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1">Start Training</Button>
                    <Button variant="outline" size="sm" className="flex-1">Stop</Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="eval">
              <AccordionTrigger className="text-sm">4. Evaluation</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Metrics</SectionLabel>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Median Error</div>
                      <div className="font-mono text-foreground">12.4 m</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Recall @ 25m</div>
                      <div className="font-mono text-foreground">0.86</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Drift Ratio</div>
                      <div className="font-mono text-foreground">0.12</div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Confidence</div>
                      <div className="font-mono text-foreground">0.92</div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Run Evaluation</Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="export">
              <AccordionTrigger className="text-sm">5. Export</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <SectionLabel>Artifacts</SectionLabel>
                  <div className="space-y-2">
                    <ControlRow label="Export Format">
                      <Select defaultValue="onnx">
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue placeholder="Format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="onnx">ONNX</SelectItem>
                          <SelectItem value="torchscript">TorchScript</SelectItem>
                          <SelectItem value="engine">TensorRT</SelectItem>
                        </SelectContent>
                      </Select>
                    </ControlRow>
                    <Button size="sm">Export Model</Button>
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
