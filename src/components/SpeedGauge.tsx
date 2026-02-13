interface SpeedGaugeProps {
  speed: number;
  maxSpeed?: number;
  unit?: string;
  size?: number;
}

export const SpeedGauge = ({ 
  speed, 
  maxSpeed = 20, 
  unit = 'kn',
  size = 90 
}: SpeedGaugeProps) => {
  const percentage = Math.min((speed / maxSpeed) * 100, 100);
  const startAngle = -135;
  const endAngle = 135;
  const angleRange = endAngle - startAngle;
  const currentAngle = startAngle + (percentage / 100) * angleRange;
  
  const radius = size / 2 - 8;
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Generate tick marks
  const ticks = [];
  const majorTickCount = 5;
  for (let i = 0; i <= majorTickCount; i++) {
    const tickAngle = startAngle + (i / majorTickCount) * angleRange;
    const tickRad = (tickAngle * Math.PI) / 180;
    const innerR = radius - 8;
    const outerR = radius - 2;
    const x1 = centerX + innerR * Math.cos(tickRad);
    const y1 = centerY + innerR * Math.sin(tickRad);
    const x2 = centerX + outerR * Math.cos(tickRad);
    const y2 = centerY + outerR * Math.sin(tickRad);
    const value = (i / majorTickCount) * maxSpeed;
    const labelR = radius - 16;
    const lx = centerX + labelR * Math.cos(tickRad);
    const ly = centerY + labelR * Math.sin(tickRad);
    
    ticks.push({ x1, y1, x2, y2, value, lx, ly });
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
          className="fill-slate-900 stroke-border"
          strokeWidth={2}
        />
        
        {/* Arc track */}
        <path
          d={describeArc(centerX, centerY, radius, startAngle, endAngle)}
          fill="none"
          className="stroke-slate-700"
          strokeWidth={4}
          strokeLinecap="round"
        />
        
        {/* Progress arc */}
        <path
          d={describeArc(centerX, centerY, radius, startAngle, currentAngle)}
          fill="none"
          className="stroke-green-500"
          strokeWidth={4}
          strokeLinecap="round"
        />
        
        {/* Tick marks */}
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              className="stroke-slate-400"
              strokeWidth={2}
            />
            <text
              x={tick.lx}
              y={tick.ly}
              className="fill-slate-400"
              fontSize={8}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {tick.value.toFixed(0)}
            </text>
          </g>
        ))}
        
        {/* Center dot */}
        <circle cx={centerX} cy={centerY} r={4} className="fill-slate-600" />
        
        {/* Needle */}
        <line
          x1={centerX}
          y1={centerY}
          x2={needleX}
          y2={needleY}
          className="stroke-white"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={centerX} cy={centerY} r={3} className="fill-white" />
      </svg>
      
      {/* Speed value */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
        <span className="text-sm font-bold text-white">{speed.toFixed(1)}</span>
        <span className="text-[8px] text-muted-foreground ml-0.5">{unit}</span>
      </div>
    </div>
  );
};

// Helper function to describe arc path
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
