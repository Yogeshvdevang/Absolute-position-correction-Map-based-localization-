import { useEffect, useState } from 'react';
import { Telemetry } from '@/types/telemetry';

const WS_BASE = import.meta.env.VITE_CHAOX_WS_BASE || 'ws://localhost:9000';

export function useTelemetry(vehicleId: string) {
  const [telemetry, setTelemetry] = useState<Telemetry>({
    yaw: 0,
    pitch: 0,
    roll: 0
  });
  const [hasTelemetry, setHasTelemetry] = useState(false);

  useEffect(() => {
    if (!vehicleId) return;
    const ws = new WebSocket(`${WS_BASE}/ws/telemetry`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data)) {
          const match = data.find((t: any) => (t.vehicle_id || t.entity_id) === vehicleId);
          if (!match) return;
          setTelemetry({
            yaw: match.yaw ?? 0,
            pitch: match.pitch ?? 0,
            roll: match.roll ?? 0,
            x: match.x ?? 0,
            y: match.y ?? 0,
            z: match.z ?? 0
          });
          setHasTelemetry(true);
        } else if (data && data.vehicle_id === vehicleId) {
          setTelemetry({
            yaw: data.yaw ?? 0,
            pitch: data.pitch ?? 0,
            roll: data.roll ?? 0,
            x: data.x ?? 0,
            y: data.y ?? 0,
            z: data.z ?? 0
          });
          setHasTelemetry(true);
        }
      } catch {
        // Ignore malformed telemetry payloads.
      }
    };

    return () => ws.close();
  }, [vehicleId]);

  return { telemetry, hasTelemetry };
}
