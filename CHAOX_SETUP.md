# CHAOX Command Interface – Setup Guide

## Quick Start

1) Configure backend endpoints in `.env`:
```
VITE_CHAOX_API_BASE=http://your-backend:8000
VITE_CHAOX_WS_BASE=ws://your-backend:8000
```
2) Install and run:
```
npm install
npm run dev
```

## Features Implemented

- 2D map rendering with entity overlays
- Real-time entity tracking via WebSocket
- Entity list with filtering and search
- Simulation mode (real vs mock data)
- Follow camera on selected entity
- Status visualization and detail tooltips

## UI Components

- EntityListPanel (left sidebar)
- Map View (center)
- SimulationControlPanel (right controls)
- CanvasToolbar (top controls)

## Expected Backend Message Shapes

### WebSocket single update
```json
{
  "type": "entity_update",
  "entity": {
    "entity_id": "UAV-001",
    "lat": 28.6139,
    "lon": 77.2090,
    "alt": 150.5,
    "status": "Operational",
    "model_name": "quadcopter",
    "type": "UAV",
    "speed": 12.5,
    "heading": 45,
    "last_update": "2024-01-01T12:00:00Z"
  }
}
```

### Batch updates
```json
{
  "type": "entity_batch",
  "entities": [...]
}
```

### Simulation data
```json
{
  "entity_id": "SIM-001",
  "lat": 28.6139,
  "lon": 77.2090,
  "alt": 150.5,
  "orientation": { "roll": 0, "pitch": 0, "yaw": 45 },
  "velocity": { "x": 10, "y": 0, "z": 2 },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Architecture (high level)

```
src/
├── components/
│   ├── MissionCanvas.tsx          # Main container
│   ├── EntityListPanel.tsx        # Entity list sidebar
│   ├── SimulationControlPanel.tsx # Controls sidebar
│   └── MapView.tsx                # Map rendering + overlays
├── hooks/
│   └── useCHAOXStream.ts          # WebSocket connection hook
└── types/
    └── entity.ts                  # TypeScript interfaces
```

## Troubleshooting

- No entities? Check WebSocket connection and backend format.
- Performance issues? Reduce visible entities or simplify styles.
- Build errors? Clear `node_modules`, reinstall, and retry.
