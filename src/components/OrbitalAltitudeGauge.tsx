interface OrbitalAltitudeGaugeProps {
  altitude: number;
  inclination: number;
  orbitType?: string;
  maxAltitude?: number;
  size?: number;
}

export const OrbitalAltitudeGauge = ({ 
  altitude, 
  inclination,
  orbitType = 'Low Earth Orbit',
  maxAltitude = 2000, 
  size = 90 
}: OrbitalAltitudeGaugeProps) => {
  const altitudePercentage = Math.min((altitude / maxAltitude) * 100, 100);
  const startAngle = -225;
  const endAngle = 45;
  const angleRange = endAngle - startAngle;
  const currentAngle = startAngle + (altitudePercentage / 100) * angleRange;
  
  const radius = size / 2 - 8;
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Generate tick marks
  const ticks = [];
  const majorTickCount = 4;
  for (let i = 0; i <= majorTickCount; i++) {
    const tickAngle = startAngle + (i / majorTickCount) * angleRange;
    const tickRad = (tickAngle * Math.PI) / 180;
    const innerR = radius - 5;
    const outerR = radius - 1;
    const x1 = centerX + innerR * Math.cos(tickRad);
    const y1 = centerY + innerR * Math.sin(tickRad);
    const x2 = centerX + outerR * Math.cos(tickRad);
    const y2 = centerY + outerR * Math.sin(tickRad);
    
    ticks.push({ x1, y1, x2, y2 });
  }
  
  // Needle endpoint
  const needleRad = (currentAngle * Math.PI) / 180;
  const needleLength = radius - 12;
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
        
        {/* Arc track background */}
        <path
          d={describeArc(centerX, centerY, radius, startAngle, endAngle)}
          fill="none"
          className="stroke-slate-700"
          strokeWidth={5}
          strokeLinecap="round"
        />
        
        {/* Progress arc - gradient from blue to cyan */}
        <path
          d={describeArc(centerX, centerY, radius, startAngle, currentAngle)}
          fill="none"
          stroke="#06b6d4"
          strokeWidth={5}
          strokeLinecap="round"
        />
        
        {/* Tick marks */}
        {ticks.map((tick, i) => (
          <line
            key={i}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            className="stroke-slate-400"
            strokeWidth={1.5}
          />
        ))}
        
        {/* Center hub */}
        <circle cx={centerX} cy={centerY} r={6} className="fill-amber-400" />
        <circle cx={centerX} cy={centerY} r={4} className="fill-slate-800" />
        
        {/* Needle */}
        <line
          x1={centerX}
          y1={centerY}
          x2={needleX}
          y2={needleY}
          className="stroke-amber-400"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      
      {/* Altitude value */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <span className="text-sm font-bold text-cyan-400">{altitude}</span>
        <span className="text-[8px] text-muted-foreground">km</span>
      </div>
      
      {/* Orbit type label */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center w-full px-1">
        <div className="text-[7px] text-muted-foreground leading-tight">{orbitType}</div>
      </div>
      
      {/* Inclination */}
      <div className="absolute bottom-0 left-1 text-[9px] font-medium text-foreground">
        {inclination.toFixed(1)}°
      </div>
    </div>
  );
};

// Helper functions
function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  
  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}
