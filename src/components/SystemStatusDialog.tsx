import { Wifi, Server, Database, Activity } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Badge } from './ui/badge';

interface SystemStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SystemStatusDialog = ({ open, onOpenChange }: SystemStatusDialogProps) => {
  const systemStatus = [
    {
      name: 'Network Connection',
      status: 'operational',
      icon: Wifi,
      details: 'SecureNet Link Active',
      latency: '12ms'
    },
    {
      name: 'C2 Gateway',
      status: 'operational',
      icon: Server,
      details: '3 Nodes Connected',
      uptime: '99.9%'
    },
    {
      name: 'Database',
      status: 'operational',
      icon: Database,
      details: 'TimescaleDB Online',
      load: '23%'
    },
    {
      name: 'Telemetry Stream',
      status: 'operational',
      icon: Activity,
      details: '847 entities tracked',
      rate: '2.3k msg/s'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
        return 'bg-green-highlight text-background';
      case 'degraded':
        return 'bg-orange-highlight text-background';
      case 'offline':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-panel border-panel-border">
        <DialogHeader>
          <DialogTitle>System Status</DialogTitle>
          <DialogDescription>
            Real-time status of CHAOX HQ core services
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {systemStatus.map((service) => (
            <div
              key={service.name}
              className="p-3 rounded-lg border border-border bg-background/50"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <service.icon className="h-5 w-5 text-green-highlight" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-foreground">
                      {service.name}
                    </h4>
                    <Badge className={`${getStatusColor(service.status)} text-[10px] px-2`}>
                      {service.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {service.details}
                  </p>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    {service.latency && <span>Latency: {service.latency}</span>}
                    {service.uptime && <span>Uptime: {service.uptime}</span>}
                    {service.load && <span>Load: {service.load}</span>}
                    {service.rate && <span>Rate: {service.rate}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
