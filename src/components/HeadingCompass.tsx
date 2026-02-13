interface HeadingCompassProps {
  heading?: number; // degrees, 0 = north
  size?: number;
}

export const HeadingCompass = ({ heading = 0, size = 96 }: HeadingCompassProps) => {
  return (
    <div
      className="relative rounded-full shadow-2xl"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Outer ring */}
        <circle cx="50" cy="50" r="48" fill="#1a1a1a" stroke="#333" strokeWidth="2" />
        
        {/* Rotating compass rose */}
        <g transform={`rotate(${-heading}, 50, 50)`}>
          {/* Cardinal direction marks */}
          {[0, 90, 180, 270].map((angle) => (
            <line
              key={angle}
              x1="50"
              y1="8"
              x2="50"
              y2="16"
              stroke="white"
              strokeWidth="2"
              transform={`rotate(${angle}, 50, 50)`}
            />
          ))}
          
          {/* Minor tick marks every 30 degrees */}
          {[30, 60, 120, 150, 210, 240, 300, 330].map((angle) => (
            <line
              key={angle}
              x1="50"
              y1="10"
              x2="50"
              y2="16"
              stroke="white"
              strokeWidth="1"
              opacity="0.6"
              transform={`rotate(${angle}, 50, 50)`}
            />
          ))}
          
          {/* Cardinal letters */}
          <text x="50" y="24" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">N</text>
          <text x="50" y="94" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">S</text>
          <text x="8" y="54" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">W</text>
          <text x="92" y="54" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">E</text>
        </g>
        
        {/* Fixed compass needle (always points up = current heading direction) */}
        <g>
          {/* North pointer (red) */}
          <polygon
            points="50,18 44,50 50,44 56,50"
            fill="#e53935"
            stroke="#b71c1c"
            strokeWidth="0.5"
          />
          {/* South pointer (white) */}
          <polygon
            points="50,82 44,50 50,56 56,50"
            fill="white"
            stroke="#ccc"
            strokeWidth="0.5"
          />
          {/* Center circle */}
          <circle cx="50" cy="50" r="6" fill="#333" stroke="#555" strokeWidth="1" />
          <circle cx="50" cy="50" r="3" fill="#555" />
        </g>
        
        {/* Glass effect */}
        <ellipse
          cx="50"
          cy="35"
          rx="25"
          ry="15"
          fill="white"
          opacity="0.05"
        />
      </svg>
    </div>
  );
};
