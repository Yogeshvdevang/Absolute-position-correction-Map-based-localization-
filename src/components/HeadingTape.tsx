import { useLayoutEffect, useMemo, useRef } from 'react';

interface HeadingTapeProps {
  bearing: number;
}

const CARDINAL_LABELS: Record<number, string> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
  360: 'N',
};

export const HeadingTape = ({ bearing }: HeadingTapeProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const height = containerRef.current?.offsetHeight ?? 0;
    const offset = height ? `${height + 8}px` : '12px';
    root.style.setProperty('--heading-offset', offset);
    return () => {
      root.style.setProperty('--heading-offset', '12px');
    };
  }, []);


  // Normalize bearing to 0-360
  const normalizedBearing = ((bearing % 360) + 360) % 360;
  
  // Generate tick marks for the visible range (±90° from center, with buffer)
  const ticks = useMemo(() => {
    const result: { deg: number; displayDeg: number; isCardinal: boolean; isMajor: boolean; label?: string }[] = [];
    
    // Generate ticks from -180 to 540 to handle wrap-around smoothly
    for (let deg = -180; deg <= 540; deg += 5) {
      const displayDeg = ((deg % 360) + 360) % 360;
      const isCardinal = displayDeg % 45 === 0;
      const isMajor = displayDeg % 10 === 0;
      
      result.push({
        deg,
        displayDeg,
        isCardinal,
        isMajor,
        label: CARDINAL_LABELS[displayDeg] || (isMajor ? String(displayDeg).padStart(3, '0') : undefined),
      });
    }
    
    return result;
  }, []);

  return (
    <div ref={containerRef} className="absolute top-0 left-0 right-0 z-20 flex flex-col items-center px-4 pt-2">
      {/* Tape container - full width */}
      <div className="relative w-full h-10 overflow-hidden bg-black/70 border border-white/20 rounded-md">
        {/* Gradient masks for edges */}
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-black/90 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-black/90 to-transparent z-10 pointer-events-none" />
        
        {/* Scrolling tape */}
        <div
          className="absolute inset-0 flex items-end justify-center"
          style={{
            transform: `translateX(${-normalizedBearing * 4}px)`,
          }}
        >
          {ticks.map((tick, i) => {
            const offsetX = tick.deg * 4; // 4px per degree for more spacing
            
            return (
              <div
                key={i}
                className="absolute flex flex-col items-center"
                style={{
                  left: `calc(50% + ${offsetX}px)`,
                  transform: 'translateX(-50%)',
                }}
              >
                {/* Label */}
                {tick.label && (
                  <span
                    className={`text-[10px] tabular-nums mb-0.5 ${
                      tick.isCardinal ? 'text-cyan-400 font-bold' : 'text-white/70'
                    }`}
                  >
                    {tick.label}
                  </span>
                )}
                
                {/* Tick mark */}
                <div
                  className={`w-px ${
                    tick.isCardinal
                      ? 'h-4 bg-cyan-400'
                      : tick.isMajor
                      ? 'h-3 bg-white/60'
                      : 'h-2 bg-white/30'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Center marker triangle - pointing up to the tape */}
      <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-cyan-400 mt-0.5" />
      
      {/* Current heading display - now below */}
      <div className="bg-black/80 border border-white/20 rounded-md px-3 py-1 mt-1">
        <span className="text-sm font-bold tabular-nums text-white">
          {Math.round(normalizedBearing).toString().padStart(3, '0')}°
        </span>
      </div>
    </div>
  );
};
