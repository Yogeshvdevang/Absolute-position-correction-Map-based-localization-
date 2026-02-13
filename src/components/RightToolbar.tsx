import { Map, Compass, Maximize2, Radio, Video, Camera, Radar, Eye, Waves, Satellite } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface RightToolbarProps {
  onVideoToggle: () => void;
  isVideoOpen: boolean;
  heading?: number; // degrees, 0 = north
}

export const RightToolbar = ({
  onVideoToggle,
  isVideoOpen,
  heading = 0
}: RightToolbarProps) => {
  const handleScreenshot = () => {
    toast.success('Screenshot captured', {
      description: 'Map screenshot saved to gallery'
    });
  };

  const handleISRFeed = (feedType: string) => {
    toast.info(`${feedType} Feed`, {
      description: `Switching to ${feedType} payload feed`
    });
  };

  return <div className="w-16 h-full bg-panel border-l border-panel-border flex flex-col items-center py-3 gap-2">
      {/* 2D/3D Toggle */}
      

      {/* Compass - rotates based on heading */}
      

      {/* Camera/Screenshot Button */}
      <Button variant="ghost" size="sm" className="h-10 w-10 p-0 hover:bg-secondary hover:text-primary" onClick={handleScreenshot}>
        <Camera className="h-5 w-5" />
      </Button>

      {/* Video Toggle Button */}
      <Button variant="ghost" size="sm" className={`h-10 w-10 p-0 hover:bg-secondary hover:text-primary my-2 ${isVideoOpen ? 'bg-secondary text-primary' : ''}`} onClick={onVideoToggle}>
        <Video className="h-5 w-5" />
      </Button>

      {/* FPS Counter */}
      <div className="mt-2">
        <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 h-4 border-border bg-background">
          FPS 55
        </Badge>
      </div>

      {/* Payload ISR Feeds Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0 hover:bg-secondary hover:text-primary mt-2">
            <Radio className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="start" className="w-40 bg-panel border-border">
          <DropdownMenuItem onClick={() => handleISRFeed('Radio')}>
            <Radio className="h-4 w-4 mr-2" />
            Radio
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleISRFeed('Radar')}>
            <Radar className="h-4 w-4 mr-2" />
            Radar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleISRFeed('EO/IR')}>
            <Eye className="h-4 w-4 mr-2" />
            EO/IR
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleISRFeed('Acoustic')}>
            <Waves className="h-4 w-4 mr-2" />
            Acoustic
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleISRFeed('SIGINT')}>
            <Satellite className="h-4 w-4 mr-2" />
            SIGINT
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {/* Fullscreen */}
      

      {/* Cursor Position */}
      
    </div>;
};