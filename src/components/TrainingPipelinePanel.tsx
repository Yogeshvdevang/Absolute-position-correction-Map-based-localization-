import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const API_BASE = import.meta.env.VITE_CHAOX_API_BASE || 'http://localhost:9000';
const DEFAULT_MANIFEST_PATH = 'app/backend/benchmark/example_manifest.json';

type BenchmarkMethod = {
  name: string;
  track: 'local' | 'retrieval' | 'hybrid';
  available: boolean;
  reason?: string | null;
};

type BenchmarkSummary = Record<string, {
  track: string;
  samples: number;
  success_rate: number;
  mean_runtime_ms: number | null;
  median_runtime_ms: number | null;
  mean_error_m: number | null;
  median_error_m: number | null;
  p95_error_m: number | null;
  top_1_accuracy: number;
  top_5_accuracy: number;
}>;

type BenchmarkRecord = {
  sample_id: string;
  method: string;
  track: string;
  success: boolean;
  confidence: number;
  runtime_ms: number;
  error_m: number | null;
  selected_tile_id?: string | null;
  error?: string | null;
};

type BenchmarkResponse = {
  summary: BenchmarkSummary;
  results: BenchmarkRecord[];
};

const SectionLabel = ({ children }: { children: string }) => (
  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{children}</div>
);

const ControlRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="text-xs text-foreground">{label}</div>
    <div className="min-w-[120px] flex justify-end">{children}</div>
  </div>
);

const formatMetric = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return value.toFixed(digits);
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return `${(value * 100).toFixed(1)}%`;
};

export const TrainingPipelinePanel = () => {
  const [benchmarkMethods, setBenchmarkMethods] = useState<BenchmarkMethod[]>([]);
  const [selectedMethods, setSelectedMethods] = useState<string[]>(['template', 'orb', 'transgeo', 'transgeo_loftr']);
  const [manifestPath, setManifestPath] = useState(DEFAULT_MANIFEST_PATH);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadMethods = async () => {
      try {
        const response = await fetch(`${API_BASE}/benchmark/methods`);
        if (!response.ok) {
          throw new Error(`Method discovery failed (${response.status})`);
        }
        const data = await response.json();
        if (!cancelled) {
          setBenchmarkMethods(data);
          setSelectedMethods((current) => {
            const availableNames = new Set<string>(data.map((item: BenchmarkMethod) => item.name));
            const filtered = current.filter((name) => availableNames.has(name));
            return filtered.length ? filtered : data.slice(0, 4).map((item: BenchmarkMethod) => item.name);
          });
        }
      } catch (error) {
        if (!cancelled) {
          setBenchmarkError(error instanceof Error ? error.message : 'Failed to load benchmark methods');
        }
      }
    };

    void loadMethods();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedMethodCount = selectedMethods.length;

  const summaryRows = useMemo(
    () => Object.entries(benchmarkResult?.summary || {}),
    [benchmarkResult],
  );

  const resultRows = useMemo(
    () => (benchmarkResult?.results || []).slice(0, 24),
    [benchmarkResult],
  );

  const toggleMethod = (name: string, checked: boolean) => {
    setSelectedMethods((current) => {
      if (checked) {
        return current.includes(name) ? current : [...current, name];
      }
      if (current.length === 1) {
        return current;
      }
      return current.filter((item) => item !== name);
    });
  };

  const handleRunBenchmark = async () => {
    setBenchmarkLoading(true);
    setBenchmarkError(null);

    try {
      const response = await fetch(`${API_BASE}/benchmark/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          manifest_path: manifestPath,
          methods: selectedMethods,
        }),
      });

      if (!response.ok) {
        throw new Error(`Benchmark failed (${response.status})`);
      }

      const data = await response.json();
      setBenchmarkResult(data);
    } catch (error) {
      setBenchmarkError(error instanceof Error ? error.message : 'Benchmark request failed');
    } finally {
      setBenchmarkLoading(false);
    }
  };

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
              Data Ingest → Preprocessing → Training → Evaluation → Benchmark → Export
            </div>
          </div>

          <Accordion type="multiple" defaultValue={['ingest', 'train', 'benchmark']}>
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

            <AccordionItem value="benchmark">
              <AccordionTrigger className="text-sm">5. Benchmark Lab</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="rounded-lg border border-border/60 bg-background/50 p-3 space-y-3">
                    <SectionLabel>Manifest</SectionLabel>
                    <Input
                      className="h-8 text-xs"
                      value={manifestPath}
                      onChange={(event) => setManifestPath(event.target.value)}
                      placeholder={DEFAULT_MANIFEST_PATH}
                    />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Backend API</span>
                      <span className="font-mono">{API_BASE}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/50 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <SectionLabel>Methods</SectionLabel>
                      <Badge variant="outline">{selectedMethodCount} selected</Badge>
                    </div>
                    <div className="space-y-2">
                      {benchmarkMethods.map((method) => {
                        const checked = selectedMethods.includes(method.name);
                        return (
                          <label
                            key={method.name}
                            className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-2"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleMethod(method.name, Boolean(value))}
                              className="mt-0.5"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-foreground">{method.name}</span>
                                <Badge variant={method.available ? 'secondary' : 'destructive'}>
                                  {method.available ? method.track : 'unavailable'}
                                </Badge>
                              </div>
                              {method.reason && (
                                <div className="text-[11px] text-muted-foreground">{method.reason}</div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={benchmarkLoading || selectedMethods.length === 0}
                      onClick={handleRunBenchmark}
                    >
                      {benchmarkLoading ? 'Running Benchmark...' : 'Run Benchmark'}
                    </Button>
                    {benchmarkError && (
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                        {benchmarkError}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/50 p-3 space-y-3">
                    <SectionLabel>Summary</SectionLabel>
                    {summaryRows.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">
                        Run a manifest to populate runtime, error, and retrieval metrics.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {summaryRows.map(([methodName, summary]) => (
                          <div key={methodName} className="rounded-md border border-border/60 bg-background/50 p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-medium text-foreground">{methodName}</div>
                              <Badge variant="outline">{summary.track}</Badge>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                              <div className="rounded-md border border-border/50 p-2">
                                <div className="text-muted-foreground">Success</div>
                                <div className="font-mono text-foreground">{formatPercent(summary.success_rate)}</div>
                              </div>
                              <div className="rounded-md border border-border/50 p-2">
                                <div className="text-muted-foreground">Mean Runtime</div>
                                <div className="font-mono text-foreground">{formatMetric(summary.mean_runtime_ms)} ms</div>
                              </div>
                              <div className="rounded-md border border-border/50 p-2">
                                <div className="text-muted-foreground">Mean Error</div>
                                <div className="font-mono text-foreground">{formatMetric(summary.mean_error_m)} m</div>
                              </div>
                              <div className="rounded-md border border-border/50 p-2">
                                <div className="text-muted-foreground">Top-5</div>
                                <div className="font-mono text-foreground">{formatPercent(summary.top_5_accuracy)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/50 p-3 space-y-3">
                    <SectionLabel>Latest Results</SectionLabel>
                    {resultRows.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">
                        No benchmark records yet.
                      </div>
                    ) : (
                      <Table className="text-[11px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8 px-2">Sample</TableHead>
                            <TableHead className="h-8 px-2">Method</TableHead>
                            <TableHead className="h-8 px-2">Success</TableHead>
                            <TableHead className="h-8 px-2">Error</TableHead>
                            <TableHead className="h-8 px-2">Runtime</TableHead>
                            <TableHead className="h-8 px-2">Tile</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resultRows.map((row, index) => (
                            <TableRow key={`${row.sample_id}-${row.method}-${index}`}>
                              <TableCell className="px-2 py-2 font-mono">{row.sample_id}</TableCell>
                              <TableCell className="px-2 py-2">{row.method}</TableCell>
                              <TableCell className="px-2 py-2">
                                <Badge variant={row.success ? 'secondary' : 'destructive'}>
                                  {row.success ? 'pass' : 'fail'}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-2 py-2 font-mono">
                                {row.error_m === null ? '--' : `${formatMetric(row.error_m)} m`}
                              </TableCell>
                              <TableCell className="px-2 py-2 font-mono">{formatMetric(row.runtime_ms)} ms</TableCell>
                              <TableCell className="px-2 py-2 font-mono">{row.selected_tile_id || row.error || '--'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="export">
              <AccordionTrigger className="text-sm">6. Export</AccordionTrigger>
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
