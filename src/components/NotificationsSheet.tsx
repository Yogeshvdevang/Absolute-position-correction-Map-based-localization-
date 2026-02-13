import { Bell, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface NotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const mockNotifications = [
  {
    id: 1,
    type: 'warning',
    title: 'Low Battery Warning',
    message: 'UAV-003 battery level at 15%',
    time: '2 minutes ago',
    read: false
  },
  {
    id: 2,
    type: 'info',
    title: 'Mission Update',
    message: 'Patrol mission Alpha-7 completed successfully',
    time: '15 minutes ago',
    read: false
  },
  {
    id: 3,
    type: 'critical',
    title: 'Communication Loss',
    message: 'Lost connection with UGV-002',
    time: '1 hour ago',
    read: false
  },
  {
    id: 4,
    type: 'success',
    title: 'Task Completed',
    message: 'Reconnaissance task finished',
    time: '2 hours ago',
    read: true
  }
];

export const NotificationsSheet = ({ open, onOpenChange }: NotificationsSheetProps) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-highlight" />;
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-highlight" />;
      default:
        return <Info className="h-4 w-4 text-blue-highlight" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] bg-panel border-l border-panel-border">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </SheetTitle>
          <SheetDescription>
            Recent system alerts and updates
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-120px)] mt-6">
          <div className="space-y-3">
            {mockNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 rounded-lg border transition-colors ${
                  notification.read
                    ? 'bg-background/50 border-border/50'
                    : 'bg-background border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-foreground">
                        {notification.title}
                      </h4>
                      {!notification.read && (
                        <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                          NEW
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {notification.message}
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {notification.time}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-panel-border bg-panel">
          <Button variant="outline" className="w-full" size="sm">
            Mark All as Read
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
