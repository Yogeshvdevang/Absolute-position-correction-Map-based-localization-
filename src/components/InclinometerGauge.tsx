interface InclinometerGaugeProps {
  pitch: number;
  roll?: number;
  size?: number;
}

export const InclinometerGauge = ({ 
  pitch, 
  roll = 0,
  size = 90 
}: InclinometerGaugeProps) => {
  const radius = size / 2 - 8;
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Clamp pitch for visualization
  const clampedPitch = Math.max(-45, Math.min(45, pitch));
  const pitchOffset = (clampedPitch / 45) * (radius * 0.6);
  
  // Needle angle for pitch indicator (top arc)
  const pitchAngle = -90 + pitch * 2; // -90 is top, range is roughly -135 to -45
  const needleRad = (pitchAngle * Math.PI) / 180;
  const needleLength = radius - 5;
  const needleX = centerX + needleLength * Math.cos(needleRad);
  const needleY = centerY + needleLength * Math.sin(needleRad);
  
  return (
    <div 
      className="relative"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background */}
        <circle 
          cx={centerX} 
          cy={centerY} 
          r={radius + 4} 
          className="fill-slate-900 stroke-slate-600"
          strokeWidth={2}
        />
        
        {/* Artificial horizon background */}
        <defs>
          <clipPath id="horizonClip">
            <circle cx={centerX} cy={centerY} r={radius - 2} />
          </clipPath>
        </defs>
        
        <g clipPath="url(#horizonClip)">
          {/* Sky */}
          <rect 
            x={0} 
            y={0} 
            width={size} 
            height={size / 2 - pitchOffset}
            className="fill-slate-800"
          />
          
          {/* Ground */}
          <rect 
            x={0} 
            y={size / 2 - pitchOffset} 
            width={size} 
            height={size / 2 + pitchOffset}
            className="fill-green-900/60"
          />
          
          {/* Horizon line */}
          <line
            x1={8}
            y1={centerY - pitchOffset}
            x2={size - 8}
            y2={centerY - pitchOffset}
            className="stroke-amber-400"
            strokeWidth={1}
          />
          
          {/* Pitch ladder marks */}
          {[-20, -10, 10, 20].map(mark => {
            const markY = centerY - pitchOffset - (mark / 45) * (radius * 0.6);
            return (
              <g key={mark}>
                <line
                  x1={centerX - 12}
                  y1={markY}
                  x2={centerX + 12}
                  y2={markY}
                  className="stroke-white/40"
                  strokeWidth={1}
                />
              </g>
            );
          })}
        </g>
        
        {/* Roll indicator marks at top */}
        {[-30, -15, 0, 15, 30].map(angle => {
          const tickAngle = -90 + angle;
          const tickRad = (tickAngle * Math.PI) / 180;
          const innerR = radius - 4;
          const outerR = radius;
          const x1 = centerX + innerR * Math.cos(tickRad);
          const y1 = centerY + innerR * Math.sin(tickRad);
          const x2 = centerX + outerR * Math.cos(tickRad);
          const y2 = centerY + outerR * Math.sin(tickRad);
          
          return (
            <line
              key={angle}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className="stroke-white"
              strokeWidth={angle === 0 ? 2 : 1}
            />
          );
        })}
        
        {/* Fixed aircraft symbol */}
        <g>
          {/* Center dot */}
          <circle cx={centerX} cy={centerY} r={4} className="fill-none stroke-white" strokeWidth={1.5} />
          
          {/* Wings */}
          <line
            x1={centerX - 25}
            y1={centerY}
            x2={centerX - 8}
            y2={centerY}
            className="stroke-white"
            strokeWidth={2}
          />
          <line
            x1={centerX + 8}
            y1={centerY}
            x2={centerX + 25}
            y2={centerY}
            className="stroke-white"
            strokeWidth={2}
          />
        </g>
        
        {/* Pitch needle indicator */}
        <polygon
          points={`${centerX},${8} ${centerX - 4},${14} ${centerX + 4},${14}`}
          className="fill-red-500"
        />
      </svg>
      
      {/* Pitch value */}
      <div className="absolute top-1 left-1 text-[10px] font-bold text-white">
        {pitch > 0 ? '+' : ''}{pitch.toFixed(0)}°
      </div>
      
      {/* bPM label */}
      <div className="absolute top-1/3 left-2 text-[8px] text-muted-foreground">
        bPM
      </div>
      
      {/* Pitch readout at bottom */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-center">
        <span className="text-xs font-medium text-cyan-400">+{Math.abs(pitch).toFixed(0)}°</span>
      </div>
    </div>
  );
};
