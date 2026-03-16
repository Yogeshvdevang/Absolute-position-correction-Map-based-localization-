import { Crosshair, Eye, Globe, Layers, PlaneTakeoff, SlidersHorizontal } from 'lucide-react';
import { Button } from './ui/button';

interface VerticalAppBarProps {
  onBack: () => void;
  onPanelSelect: (panel: string) => void;
  activePanel: string | null;
  onOpenProtocolSim?: () => void;
}

export const VerticalAppBar = ({ onBack, onPanelSelect, activePanel, onOpenProtocolSim }: VerticalAppBarProps) => {
  const getButtonClass = (panel: string) => 
    `h-10 w-10 p-0 hover:bg-white/10 hover:text-white ${activePanel === panel ? 'text-white ring-1 ring-white/40' : ''}`;

  return <div className="w-14 h-full bg-panel border-r border-panel-border flex flex-col items-center py-3 gap-1">

      <Button 
        variant="ghost" 
        size="sm" 
        className={getButtonClass('select')}
        onClick={() => onPanelSelect('select')}
      >
        <Eye className="h-5 w-5" />
      </Button>

      <Button 
        variant="ghost" 
        size="sm" 
        className={getButtonClass('assets')}
        onClick={() => onPanelSelect('assets')}
      >
        <Layers className="h-5 w-5" />
      </Button>

      <Button 
        variant="ghost" 
        size="sm" 
        className={getButtonClass('training')}
        onClick={() => onPanelSelect('training')}
      >
        <SlidersHorizontal className="h-5 w-5" />
      </Button>

      <Button 
        variant="ghost" 
        size="sm" 
        className={getButtonClass('sim-generator')}
        onClick={() => {
          if (onOpenProtocolSim) {
            onOpenProtocolSim();
            return;
          }
          onPanelSelect('sim-generator');
        }}
      >
        <PlaneTakeoff className="h-5 w-5" />
      </Button>

      <Button 
        variant="ghost" 
        size="sm" 
        className={getButtonClass('offline-maps')}
        onClick={() => onPanelSelect('offline-maps')}
      >
        <Globe className="h-5 w-5" />
      </Button>

      <Button 
        variant="ghost" 
        size="sm" 
        className={getButtonClass('targeting')}
        onClick={() => onPanelSelect('targeting')}
      >
        <Crosshair className="h-5 w-5" />
      </Button>

      <div className="flex-1" />
    </div>;
};
