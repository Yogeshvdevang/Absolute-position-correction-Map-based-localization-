import { useState, useEffect, useCallback } from 'react';
import { Entity, SimulationData } from '@/types/entity';
import { MissionWaypoint } from '@/types/mission';

const API_BASE = import.meta.env.VITE_CHAOX_API_BASE || 'http://localhost:9000';
const WS_BASE = import.meta.env.VITE_CHAOX_WS_BASE || 'ws://localhost:9000';

export const useChaoxStream = () => {
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [connected, setConnected] = useState(false);
  const [simulationMode, setSimulationMode] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [missionPlan, setMissionPlan] = useState<MissionWaypoint[]>([]);

  const connect = useCallback(() => {
    try {
      // CHAOX API bridge websocket for telemetry
      const websocket = new WebSocket(`${WS_BASE}/ws/telemetry`);
      
      websocket.onopen = () => {
        console.log('CHAOX stream connected');
        setConnected(true);
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // CHAOX API WS sends an array of telemetry objects
          if (Array.isArray(data)) {
            setEntities(() => {
              const updated = new Map<string, Entity>();
              data.forEach((t: any, idx: number) => {
                const id = t.vehicle_id || `CHA-${idx + 1}`;
                updated.set(id, {
                  entity_id: id,
                  lat: t.lat ?? 0,
                  lon: t.lon ?? 0,
                  alt: t.alt ?? 0,
                  status: 'Operational',
                  model_name: 'chaox',
                  type: t.type || 'UAV',
                  domain: t.domain,
                  speed: t.groundspeed ?? 0,
                  heading: t.yaw ?? 0,
                  last_update: new Date().toISOString(),
                  metadata: {
                    link: t.link,
                    comm_port: t.comm_port,
                    carrier: t.carrier
                  }
                });
              });
              return updated;
            });
          } else if (data.type === 'mission_state' && Array.isArray(data.items)) {
            const wps: MissionWaypoint[] = data.items.map((it: any, idx: number) => ({
              id: it.id || `WP-${idx + 1}`,
              name: it.name || `WP ${idx + 1}`,
              lat: it.lat,
              lon: it.lon,
              alt: it.alt,
              speed: it.speed,
              hold: it.hold
            }));
            setMissionPlan(wps);
          } else if (data.type === 'entity_update') {
            // Keep compatibility with legacy shape
            setEntities(prev => {
              const updated = new Map(prev);
              updated.set(data.entity.entity_id, {
                ...data.entity,
                last_update: new Date().toISOString()
              });
              return updated;
            });
          } else if (data.type === 'entity_batch') {
            setEntities(prev => {
              const updated = new Map(prev);
              data.entities.forEach((entity: Entity) => {
                updated.set(entity.entity_id, {
                  ...entity,
                  last_update: new Date().toISOString()
                });
              });
              return updated;
            });
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      websocket.onclose = () => {
        console.log('CHAOX stream disconnected');
        setConnected(false);
      };

      setWs(websocket);
    } catch (error) {
      console.error('Failed to connect to CHAOX stream:', error);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (ws) {
      ws.close();
      setWs(null);
      setConnected(false);
    }
  }, [ws]);

  const handleSimulationData = useCallback((simData: SimulationData) => {
    setEntities(prev => {
      const updated = new Map(prev);
      const existing = updated.get(simData.entity_id);
      
      updated.set(simData.entity_id, {
        entity_id: simData.entity_id,
        lat: simData.lat,
        lon: simData.lon,
        alt: simData.alt,
        status: 'Simulated',
        model_name: existing?.model_name || 'default',
        type: existing?.type || 'UAV',
        simulated: true,
        last_update: simData.timestamp,
        metadata: {
          orientation: simData.orientation,
          velocity: simData.velocity
        }
      });
      
      return updated;
    });
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    entities: Array.from(entities.values()),
    connected,
    missionPlan,
    connect,
    disconnect,
    simulationMode,
    setSimulationMode,
    handleSimulationData
  };
};
