import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, Clock, Wifi, Settings, User } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { NotificationsSheet } from './NotificationsSheet';
import { SystemStatusDialog } from './SystemStatusDialog';
import { SettingsDialog } from './SettingsDialog';
import logo from '@/assets/logo.png';
export const TopBar = () => {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [systemStatusOpen, setSystemStatusOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const formatZulu = (date: Date) => {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const day = days[date.getUTCDay()];
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mon = months[date.getUTCMonth()];
    const yy = String(date.getUTCFullYear()).slice(-2);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${day} ${dd} ${mon} ${yy}, ${hh}:${mm}:${ss}Z`;
  };
  return <div className="h-14 bg-panel border-b border-panel-border flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center">
          <img src={logo} alt="PSYC Logo" className="w-full h-full object-contain" />
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative w-3 h-3 border border-white animate-[spin_1.5s_linear_infinite]">
            <div className="absolute top-0 left-0 w-1.5 h-[2px] bg-white animate-[pulse_1s_ease-in-out_infinite]" />
          </div>
          <span className="text-sm font-semibold text-white tracking-wide">LIVE</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 relative" onClick={() => setNotificationsOpen(true)}>
            <Bell className="h-4 w-4" />
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-[10px]">
              3
            </Badge>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setNotificationsOpen(true)}>
            <AlertTriangle className="h-4 w-4 text-orange-highlight" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSystemStatusOpen(true)}>
            <Wifi className="h-4 w-4 text-green-highlight" />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-foreground">
          <Clock className="h-4 w-4" />
          <span>{now.toLocaleTimeString()} GMT</span>
          <span className="ml-2 rounded border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-mono tracking-wide text-slate-100">
            {formatZulu(now)}
          </span>
        </div>

        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-3">
                <User className="h-4 w-4 mr-2" />
                <span className="text-xs">Operator</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-1">
                  <span className="text-sm">Demo User</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    operator@chaox.mil
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Badge className="bg-blue-highlight text-background text-[10px] px-2 py-0.5">
                  OPERATOR
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile Settings</DropdownMenuItem>
              <DropdownMenuItem>Security</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <NotificationsSheet open={notificationsOpen} onOpenChange={setNotificationsOpen} />
      <SystemStatusDialog open={systemStatusOpen} onOpenChange={setSystemStatusOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>;
};
