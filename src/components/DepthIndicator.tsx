interface DepthIndicatorProps {
  depth: number;
  maxRatedDepth?: number;
  size?: number;
}

export const DepthIndicator = ({ 
  depth, 
  maxRatedDepth = 300, 
  size = 90 
}: DepthIndicatorProps) => {
  const depthPercentage = Math.min((depth / maxRatedDepth) * 100, 100);
  const waterLevel = 35; // percentage from top where water line is
  
  return (
    <div 
      className="relative rounded-lg overflow-hidden border border-border/50"
      style={{ width: size, height: size }}
    >
      {/* Sky gradient */}
      <div 
        className="absolute inset-x-0 top-0 bg-gradient-to-b from-sky-400 to-sky-300"
        style={{ height: `${waterLevel}%` }}
      />
      
      {/* Water gradient */}
      <div 
        className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-cyan-600 via-blue-700 to-slate-900"
        style={{ height: `${100 - waterLevel}%` }}
      />
      
      {/* Water surface waves */}
      <div 
        className="absolute inset-x-0 h-1"
        style={{ top: `${waterLevel}%` }}
      >
        <svg viewBox="0 0 100 10" className="w-full h-2" preserveAspectRatio="none">
          <path 
            d="M0,5 Q10,0 20,5 T40,5 T60,5 T80,5 T100,5 L100,10 L0,10 Z" 
            fill="rgba(14, 116, 144, 0.8)"
          />
        </svg>
      </div>
      
      {/* Submarine icon - position based on depth */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 transition-all duration-500"
        style={{ 
          top: `${waterLevel + (depthPercentage * (100 - waterLevel - 15) / 100)}%`
        }}
      >
        <svg width="32" height="16" viewBox="0 0 32 16" className="fill-amber-400">
          {/* Hull */}
          <ellipse cx="16" cy="10" rx="14" ry="5" />
          {/* Conning tower */}
          <rect x="12" y="4" width="8" height="6" rx="2" />
          {/* Periscope */}
          <rect x="18" y="1" width="2" height="4" />
          {/* Propeller */}
          <circle cx="30" cy="10" r="2" className="fill-amber-500" />
        </svg>
      </div>
      
      {/* Depth reading overlay */}
      <div className="absolute top-1 left-1 text-[10px] font-bold text-white bg-black/40 px-1 rounded">
        {depth.toFixed(1)}m
      </div>
      
      {/* Max depth scale */}
      <div className="absolute bottom-1 left-1 right-1 text-[8px] text-white/60 text-center">
        {maxRatedDepth} m
      </div>
    </div>
  );
};
