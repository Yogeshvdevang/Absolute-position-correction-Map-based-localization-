import { useMemo } from 'react';

interface AttitudeIndicatorProps {
  pitch?: number; // degrees, positive = nose up
  roll?: number;  // degrees, positive = right wing down
  size?: number;
}

export const AttitudeIndicator = ({ pitch = 0, roll = 0, size = 120 }: AttitudeIndicatorProps) => {
  // Clamp pitch for display (max ±30 degrees visible)
  const clampedPitch = Math.max(-30, Math.min(30, pitch));
  const pitchOffset = (clampedPitch / 30) * 40; // Convert to percentage offset

  const pitchMarks = useMemo(() => {
    const marks = [];
    for (let deg = -20; deg <= 20; deg += 10) {
      if (deg === 0) continue;
      const y = 50 - (deg / 30) * 40;
      const isLarge = Math.abs(deg) === 10 || Math.abs(deg) === 20;
      marks.push(
        <g key={deg}>
          <line
            x1={isLarge ? 35 : 40}
            y1={y}
            x2={isLarge ? 65 : 60}
            y2={y}
            stroke="white"
            strokeWidth="1.5"
          />
          <text x={isLarge ? 30 : 36} y={y + 1} fill="white" fontSize="6" textAnchor="end">
            {Math.abs(deg)}
          </text>
          <text x={isLarge ? 70 : 64} y={y + 1} fill="white" fontSize="6" textAnchor="start">
            {Math.abs(deg)}
          </text>
        </g>
      );
    }
    return marks;
  }, []);

  const rollMarks = useMemo(() => {
    const angles = [10, 20, 30, 45, 60, -10, -20, -30, -45, -60];
    return angles.map((angle) => {
      const rad = ((angle - 90) * Math.PI) / 180;
      const inner = 42;
      const outer = angle % 30 === 0 ? 47 : 45;
      return (
        <line
          key={angle}
          x1={50 + inner * Math.cos(rad)}
          y1={50 + inner * Math.sin(rad)}
          x2={50 + outer * Math.cos(rad)}
          y2={50 + outer * Math.sin(rad)}
          stroke="white"
          strokeWidth="1.5"
        />
      );
    });
  }, []);

  return (
    <div
      className="relative rounded-full overflow-hidden shadow-2xl"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Outer bezel */}
        <circle cx="50" cy="50" r="49" fill="#2a2a2a" />
        <circle cx="50" cy="50" r="47" fill="#1a1a1a" stroke="#3a3a3a" strokeWidth="1" />
        
        {/* Roll marks on bezel */}
        {rollMarks}
        
        {/* Center triangle at top */}
        <polygon points="50,8 47,14 53,14" fill="#f5a623" />
        
        {/* Main attitude display - clipped circle */}
        <defs>
          <clipPath id="attitude-clip">
            <circle cx="50" cy="50" r="42" />
          </clipPath>
        </defs>
        
        <g clipPath="url(#attitude-clip)">
          {/* Rotating group for roll */}
          <g transform={`rotate(${-roll}, 50, 50)`}>
            {/* Translating group for pitch */}
            <g transform={`translate(0, ${pitchOffset})`}>
              {/* Sky */}
              <rect x="0" y="-50" width="100" height="100" fill="#0088cc" />
              
              {/* Ground */}
              <rect x="0" y="50" width="100" height="100" fill="#6b5b3f" />
              
              {/* Horizon line */}
              <line x1="0" y1="50" x2="100" y2="50" stroke="white" strokeWidth="2" />
              
              {/* Pitch marks */}
              {pitchMarks}
            </g>
          </g>
        </g>
        
        {/* Fixed aircraft symbol */}
        <g>
          {/* Left wing */}
          <path
            d="M 20 50 L 38 50 L 42 54 L 38 54 L 38 52 L 20 52 Z"
            fill="#f5a623"
            stroke="#333"
            strokeWidth="0.5"
          />
          {/* Right wing */}
          <path
            d="M 80 50 L 62 50 L 58 54 L 62 54 L 62 52 L 80 52 Z"
            fill="#f5a623"
            stroke="#333"
            strokeWidth="0.5"
          />
          {/* Center dot */}
          <circle cx="50" cy="52" r="4" fill="#f5a623" stroke="#333" strokeWidth="0.5" />
          <circle cx="50" cy="52" r="2" fill="#1a1a1a" />
        </g>
        
        {/* Roll pointer */}
        <polygon
          points="50,10 47,16 53,16"
          fill="white"
          transform={`rotate(${-roll}, 50, 50)`}
        />
        
        {/* Glass effect */}
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
        <ellipse
          cx="50"
          cy="35"
          rx="25"
          ry="15"
          fill="url(#glass-gradient)"
          opacity="0.15"
        />
        
        <defs>
          <linearGradient id="glass-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.4" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
