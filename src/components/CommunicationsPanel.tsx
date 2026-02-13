import { Radio, Send, AlertTriangle, Check } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';

const messages = [
  { id: 1, from: 'Command', message: 'Begin operation at grid 45N', time: '06:15', priority: 'High', status: 'acknowledged' },
  { id: 2, from: 'AT01', message: 'Target acquired at bearing 270', time: '06:22', priority: 'Normal', status: 'received' },
  { id: 3, from: 'GV01', message: 'En route to checkpoint Alpha', time: '06:28', priority: 'Normal', status: 'acknowledged' },
  { id: 4, from: 'Command', message: 'Hostiles detected in sector 2', time: '06:31', priority: 'Urgent', status: 'received' },
];

export const CommunicationsPanel = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-panel-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">Communications</h2>
        <div className="flex gap-1">
          <Badge variant="default" className="text-xs">
            <Radio className="h-3 w-3 mr-1" />
            Online
          </Badge>
          <Badge variant="outline" className="text-xs">4 Active Channels</Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="p-2.5 rounded bg-secondary/50 border border-border/50">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{msg.from}</span>
                  {msg.priority === 'Urgent' && <AlertTriangle className="h-3 w-3 text-destructive" />}
                </div>
                <span className="text-xs text-muted-foreground">{msg.time}</span>
              </div>
              <p className="text-xs text-foreground mb-1.5">{msg.message}</p>
              <div className="flex items-center justify-between">
                <Badge variant={msg.priority === 'Urgent' ? 'destructive' : msg.priority === 'High' ? 'default' : 'outline'} className="text-[10px] h-4">
                  {msg.priority}
                </Badge>
                {msg.status === 'acknowledged' && (
                  <div className="flex items-center gap-1 text-xs text-primary">
                    <Check className="h-3 w-3" />
                    <span>Acknowledged</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-panel-border space-y-2">
        <div className="flex gap-2">
          <Input placeholder="Type message..." className="bg-secondary border-border text-xs h-8" />
          <Button size="sm" className="h-8">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="w-full">
          <AlertTriangle className="h-3.5 w-3.5 mr-2" />
          Send Priority Alert
        </Button>
      </div>
    </div>
  );
};
