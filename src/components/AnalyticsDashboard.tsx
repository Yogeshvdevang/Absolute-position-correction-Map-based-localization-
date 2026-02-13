import { BarChart3, TrendingUp, Activity, Zap, Clock, CheckCircle } from 'lucide-react';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Card } from './ui/card';
import { Progress } from './ui/progress';

interface MetricCard {
  title: string;
  value: string;
  change: number;
  icon: any;
  trend: 'up' | 'down' | 'neutral';
}

const metrics: MetricCard[] = [
  {
    title: 'Active Entities',
    value: '7',
    change: 12.5,
    icon: Activity,
    trend: 'up'
  },
  {
    title: 'Mission Success Rate',
    value: '94%',
    change: 3.2,
    icon: CheckCircle,
    trend: 'up'
  },
  {
    title: 'Avg Response Time',
    value: '2.4s',
    change: -15.8,
    icon: Clock,
    trend: 'up'
  },
  {
    title: 'System Uptime',
    value: '99.7%',
    change: 0.1,
    icon: Zap,
    trend: 'up'
  }
];

const areaMetrics = [
  { region: 'Sector Alpha', coverage: 85, entities: 3 },
  { region: 'Sector Beta', coverage: 72, entities: 2 },
  { region: 'Sector Gamma', coverage: 94, entities: 2 },
  { region: 'Sector Delta', coverage: 58, entities: 1 }
];

export const AnalyticsDashboard = () => {
  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="p-3 border-b border-panel-border">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Analytics Dashboard</h2>
          <Badge className="bg-blue-highlight text-background text-[10px] px-2 py-0.5 ml-auto">
            LIVE
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Mission metrics and performance analysis
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Card key={metric.title} className="p-3 border-panel-border bg-secondary/50">
                  <div className="flex items-start justify-between mb-2">
                    <Icon className="h-4 w-4 text-primary" />
                    {metric.trend === 'up' && (
                      <TrendingUp className="h-3 w-3 text-green-highlight" />
                    )}
                  </div>
                  <div className="text-xl font-bold text-foreground mb-1">
                    {metric.value}
                  </div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {metric.title}
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className={metric.change > 0 ? 'text-green-highlight' : 'text-red-highlight'}>
                      {metric.change > 0 ? '+' : ''}{metric.change}%
                    </span>
                    <span className="text-muted-foreground">vs last hour</span>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Area Coverage */}
          <Card className="p-3 border-panel-border bg-secondary/50">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Regional Coverage
            </h3>
            <div className="space-y-3">
              {areaMetrics.map((area) => (
                <div key={area.region}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground">{area.region}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {area.entities} units
                      </Badge>
                      <span className="text-foreground font-medium">{area.coverage}%</span>
                    </div>
                  </div>
                  <Progress value={area.coverage} className="h-1.5" />
                </div>
              ))}
            </div>
          </Card>

          {/* System Health */}
          <Card className="p-3 border-panel-border bg-secondary/50">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              System Health
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Database Status</span>
                <Badge className="bg-green-highlight text-background text-[10px] px-2 py-0.5">
                  HEALTHY
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">WebSocket Connection</span>
                <Badge className="bg-green-highlight text-background text-[10px] px-2 py-0.5">
                  CONNECTED
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">AI Processing</span>
                <Badge className="bg-blue-highlight text-background text-[10px] px-2 py-0.5">
                  ACTIVE
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Map View</span>
                <Badge className="bg-green-highlight text-background text-[10px] px-2 py-0.5">
                  RENDERING
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};
