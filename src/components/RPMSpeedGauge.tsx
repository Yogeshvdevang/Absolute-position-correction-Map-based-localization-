interface RPMSpeedGaugeProps {
  speed: number;
  rpm: number;
  maxSpeed?: number;
  maxRPM?: number;
  size?: number;
}

export const RPMSpeedGauge = ({ 
  speed, 
  rpm,
  maxSpeed = 20, 
  maxRPM = 5000,
  size = 90 
}: RPMSpeedGaugeProps) => {
  const speedPercentage = Math.min((speed / maxSpeed) * 100, 100);
  const startAngle = -225;
  const endAngle = 45;
  const angleRange = endAngle - startAngle;
  const currentAngle = startAngle + (speedPercentage / 100) * angleRange;
  
  const radius = size / 2 - 8;
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Generate tick marks
  const ticks = [];
  const majorTickCount = 5;
  for (let i = 0; i <= majorTickCount; i++) {
    const tickAngle = startAngle + (i / majorTickCount) * angleRange;
    const tickRad = (tickAngle * Math.PI) / 180;
    const innerR = radius - 6;
    const outerR = radius - 1;
    const x1 = centerX + innerR * Math.cos(tickRad);
    const y1 = centerY + innerR * Math.sin(tickRad);
    const x2 = centerX + outerR * Math.cos(tickRad);
    const y2 = centerY + outerR * Math.sin(tickRad);
    const value = (i / majorTickCount) * maxSpeed;
    const labelR = radius - 14;
    const lx = centerX + labelR * Math.cos(tickRad);
    const ly = centerY + labelR * Math.sin(tickRad);
    
    ticks.push({ x1, y1, x2, y2, value, lx, ly });
  }
  
  // Needle endpoint
  const needleRad = (currentAngle * Math.PI) / 180;
  const needleLength = radius - 15;
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
          strokeWidth={6}
          strokeLinecap="round"
        />
        
        {/* Colored segments - blue to yellow to orange */}
        <path
          d={describeArc(centerX, centerY, radius, startAngle, startAngle + angleRange * 0.5)}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={6}
          strokeLinecap="round"
        />
        <path
          d={describeArc(centerX, centerY, radius, startAngle + angleRange * 0.5, startAngle + angleRange * 0.75)}
          fill="none"
          stroke="#eab308"
          strokeWidth={6}
          strokeLinecap="round"
        />
        <path
          d={describeArc(centerX, centerY, radius, startAngle + angleRange * 0.75, endAngle)}
          fill="none"
          stroke="#f97316"
          strokeWidth={6}
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
              className="stroke-slate-300"
              strokeWidth={1.5}
            />
            <text
              x={tick.lx}
              y={tick.ly}
              className="fill-slate-400"
              fontSize={7}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {tick.value.toFixed(0)}
            </text>
          </g>
        ))}
        
        {/* Center hub */}
        <circle cx={centerX} cy={centerY} r={8} className="fill-amber-400" />
        <circle cx={centerX} cy={centerY} r={5} className="fill-slate-800" />
        
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
      </svg>
      
      {/* Speed value */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center">
        <span className="text-xs font-bold text-blue-400">{speed.toFixed(0)}</span>
        <span className="text-[8px] text-muted-foreground ml-0.5">km/h</span>
      </div>
      
      {/* RPM value */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
        <span className="text-[8px] text-muted-foreground">RPM</span>
        <div className="text-sm font-bold text-white">{rpm.toLocaleString()}</div>
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
