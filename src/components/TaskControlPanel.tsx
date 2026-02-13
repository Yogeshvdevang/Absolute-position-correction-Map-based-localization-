import { useState } from 'react';
import { Target, Play, Pause, CheckCircle, XCircle, Clock, Plus } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface Task {
  task_id: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  assigned_entities: string[];
  progress: number;
  start_time: string;
  estimated_completion?: string;
}

const mockTasks: Task[] = [
  {
    task_id: 'RDR-001',
    description: 'Calibrate X-Band surveillance radar array',
    status: 'IN_PROGRESS',
    assigned_entities: ['RADAR-A1', 'RADAR-A2'],
    progress: 78,
    start_time: new Date(Date.now() - 3600000).toISOString(),
    estimated_completion: new Date(Date.now() + 1200000).toISOString()
  },
  {
    task_id: 'ACU-002',
    description: 'Deploy acoustic sensor grid - Sector 7',
    status: 'IN_PROGRESS',
    assigned_entities: ['ACOUSTIC-S1', 'ACOUSTIC-S2', 'ACOUSTIC-S3'],
    progress: 45,
    start_time: new Date(Date.now() - 1800000).toISOString(),
    estimated_completion: new Date(Date.now() + 2400000).toISOString()
  },
  {
    task_id: 'RAD-003',
    description: 'Establish encrypted HF radio link',
    status: 'COMPLETED',
    assigned_entities: ['RADIO-HF1'],
    progress: 100,
    start_time: new Date(Date.now() - 7200000).toISOString()
  },
  {
    task_id: 'RDR-004',
    description: 'Track airborne contacts - Zone Bravo',
    status: 'IN_PROGRESS',
    assigned_entities: ['RADAR-B1'],
    progress: 92,
    start_time: new Date(Date.now() - 900000).toISOString(),
    estimated_completion: new Date(Date.now() + 300000).toISOString()
  },
  {
    task_id: 'RAD-005',
    description: 'UHF relay station maintenance',
    status: 'PENDING',
    assigned_entities: ['RADIO-UHF2', 'RADIO-UHF3'],
    progress: 0,
    start_time: new Date(Date.now()).toISOString()
  }
];

export const TaskControlPanel = () => {
  const [tasks] = useState<Task[]>(mockTasks);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [priors, setPriors] = useState<string[]>([]);
  const [targets, setTargets] = useState<Array<{ name: string; type: string }>>([
    { name: 'Target 01', type: 'C2 Jammer' },
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-highlight text-background';
      case 'IN_PROGRESS':
        return 'bg-blue-highlight text-background';
      case 'FAILED':
        return 'bg-red-highlight text-background';
      default:
        return 'bg-gray-highlight text-background';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-3 w-3" />;
      case 'IN_PROGRESS':
        return <Play className="h-3 w-3" />;
      case 'FAILED':
        return <XCircle className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="p-3 border-b border-panel-border">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Sensor Control</h2>
          <Button
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Plus className="h-3 w-3 mr-1" />
            New Task
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Manage radar, acoustic & radio systems
        </p>
      </div>

      {showCreateForm && (
        <div className="p-3 border-b border-panel-border bg-secondary/30">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Task Description</Label>
              <Input placeholder="Enter task description" className="h-8 text-xs mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">GCS Location (optional)</Label>
                <Input placeholder="XX" className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs"> </Label>
                <Input placeholder="YY" className="h-8 text-xs mt-1" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Priors (optional)</Label>
              <div className="mt-2 space-y-2">
                {priors.length === 0 && (
                  <div className="text-[11px] text-muted-foreground">None</div>
                )}
                {priors.map((prior, index) => (
                  <div key={`${prior}-${index}`} className="flex items-center gap-2">
                    <Input
                      value={prior}
                      onChange={(event) => {
                        const next = [...priors];
                        next[index] = event.target.value;
                        setPriors(next);
                      }}
                      className="h-8 text-xs"
                      placeholder={`Prior ${index + 1}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => setPriors(priors.filter((_, idx) => idx !== index))}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPriors([...priors, ''])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Prior
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs">Search Targets</Label>
              <div className="mt-2 space-y-2">
                {targets.map((target, index) => (
                  <div key={`${target.name}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      value={target.name}
                      onChange={(event) => {
                        const next = [...targets];
                        next[index] = { ...next[index], name: event.target.value };
                        setTargets(next);
                      }}
                      className="h-8 text-xs"
                      placeholder={`Target ${index + 1}`}
                    />
                    <Select
                      value={target.type}
                      onValueChange={(value) => {
                        const next = [...targets];
                        next[index] = { ...next[index], type: value };
                        setTargets(next);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-panel border-panel-border">
                        <SelectItem value="C2 Jammer">C2 Jammer</SelectItem>
                        <SelectItem value="Radar Emitter">Radar Emitter</SelectItem>
                        <SelectItem value="Mobile Relay">Mobile Relay</SelectItem>
                        <SelectItem value="Unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => setTargets(targets.filter((_, idx) => idx !== index))}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTargets([...targets, { name: '', type: 'Unknown' }])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Target
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs">In Case of Task Conflict</Label>
              <Select defaultValue="Replace current task">
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-panel border-panel-border">
                  <SelectItem value="Replace current task">Replace current task</SelectItem>
                  <SelectItem value="Queue new task">Queue new task</SelectItem>
                  <SelectItem value="Abort new task">Abort new task</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="h-7 px-3 text-xs flex-1">
                Execute Task
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {tasks.map((task) => (
            <Card key={task.task_id} className="p-3 border-panel-border bg-secondary/50">
              <div className="flex items-start gap-2 mb-2">
                <Badge className={`${getStatusColor(task.status)} text-[10px] px-2 py-0.5 flex items-center gap-1`}>
                  {getStatusIcon(task.status)}
                  {task.status.replace('_', ' ')}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground ml-auto">
                  {task.task_id}
                </span>
              </div>

              <p className="text-sm text-foreground font-medium mb-3">{task.description}</p>

              {task.status === 'IN_PROGRESS' && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="text-foreground font-medium">{task.progress}%</span>
                  </div>
                  <Progress value={task.progress} className="h-1.5" />
                </div>
              )}

              <Separator className="my-2" />

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Assigned:</span>
                  <div className="flex gap-1 flex-wrap">
                    {task.assigned_entities.map((entity) => (
                      <Badge key={entity} variant="outline" className="text-[10px] px-1 py-0">
                        {entity}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Started: {new Date(task.start_time).toLocaleTimeString()}
                  </span>
                  {task.estimated_completion && task.status === 'IN_PROGRESS' && (
                    <span className="text-muted-foreground">
                      ETA: {new Date(task.estimated_completion).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>

              {task.status === 'IN_PROGRESS' && (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1">
                    <Pause className="h-3 w-3 mr-1" />
                    Pause
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1">
                    Details
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
