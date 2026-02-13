import { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Slider } from './ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export const TimelinePlayback = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState('1');

  const totalDuration = 3600; // 1 hour in seconds
  const currentMinutes = Math.floor(currentTime / 60);
  const currentSeconds = currentTime % 60;
  const totalMinutes = Math.floor(totalDuration / 60);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-16 bg-panel border-t border-panel-border flex items-center px-4 gap-4">
      {/* Timeline Label */}
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Timeline</span>
        <Badge className="bg-secondary text-foreground text-[10px] px-2 py-0.5">
          PLAYBACK
        </Badge>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setCurrentTime(Math.max(0, currentTime - 60))}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setCurrentTime(Math.min(totalDuration, currentTime + 60))}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* Time Display */}
      <div className="flex items-center gap-2 text-xs font-mono text-foreground">
        <span>{formatTime(currentTime)}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{formatTime(totalDuration)}</span>
      </div>

      {/* Timeline Slider */}
      <div className="flex-1 max-w-2xl">
        <Slider
          value={[currentTime]}
          max={totalDuration}
          step={1}
          onValueChange={(value) => setCurrentTime(value[0])}
          className="cursor-pointer"
        />
      </div>

      {/* Speed Control */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Speed:</span>
        <Select value={speed} onValueChange={setSpeed}>
          <SelectTrigger className="h-8 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.5">0.5x</SelectItem>
            <SelectItem value="1">1x</SelectItem>
            <SelectItem value="2">2x</SelectItem>
            <SelectItem value="5">5x</SelectItem>
            <SelectItem value="10">10x</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Current Date/Time */}
      <div className="flex items-center gap-2 text-xs text-foreground ml-auto">
        <span className="text-muted-foreground">Replay Time:</span>
        <span className="font-mono">
          {new Date(Date.now() - (totalDuration - currentTime) * 1000).toLocaleString()}
        </span>
      </div>
    </div>
  );
};
