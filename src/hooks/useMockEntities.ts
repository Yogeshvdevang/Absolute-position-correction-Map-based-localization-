import { useState, useEffect } from 'react';
import { Entity } from '@/types/entity';

// Generate mock entities for demo purposes
const generateMockEntities = (): Entity[] => {
  const entities: Entity[] = [];
  
  // Add some UAVs (Air domain)
  entities.push({
    entity_id: 'UAV-001',
    lat: 28.6139,
    lon: 77.2090,
    alt: 500,
    status: 'Operational',
    model_name: 'quadcopter',
    type: 'UAV',
    domain: 'air',
    speed: 12.5,
    heading: 45,
    last_update: new Date().toISOString(),
  });

  entities.push({
    entity_id: 'UAV-002',
    lat: 12.9716,
    lon: 77.5946,
    alt: 800,
    status: 'Operational',
    model_name: 'fixed-wing',
    type: 'UAV',
    domain: 'air',
    speed: 25.0,
    heading: 180,
    last_update: new Date().toISOString(),
  });

  entities.push({
    entity_id: 'UAV-SIM-001',
    lat: 13.0827,
    lon: 80.2707,
    alt: 600,
    status: 'Simulated',
    model_name: 'quadcopter',
    type: 'UAV',
    domain: 'air',
    speed: 10.0,
    heading: 90,
    last_update: new Date().toISOString(),
    simulated: true,
  });

  // Add some UGVs (Land domain)
  entities.push({
    entity_id: 'UGV-001',
    lat: 22.5726,
    lon: 88.3639,
    alt: 10,
    status: 'Idle',
    model_name: 'tracked',
    type: 'UGV',
    domain: 'land',
    speed: 0,
    heading: 0,
    last_update: new Date().toISOString(),
  });

  entities.push({
    entity_id: 'UGV-002',
    lat: 26.9124,
    lon: 75.7873,
    alt: 15,
    status: 'Operational',
    model_name: 'wheeled',
    type: 'UGV',
    domain: 'land',
    speed: 5.5,
    heading: 270,
    last_update: new Date().toISOString(),
  });

  // Add a vehicle (Land domain)
  entities.push({
    entity_id: 'VEH-001',
    lat: 17.3850,
    lon: 78.4867,
    alt: 5,
    status: 'Operational',
    model_name: 'truck',
    type: 'Vehicle',
    domain: 'land',
    speed: 15.0,
    heading: 120,
    last_update: new Date().toISOString(),
  });

  // Add USV (Water domain - surface)
  entities.push({
    entity_id: 'USV-001',
    lat: 18.9220,
    lon: 72.8347,
    alt: 0,
    status: 'Operational',
    model_name: 'patrol-boat',
    type: 'USV',
    domain: 'water',
    speed: 8.0,
    heading: 90,
    last_update: new Date().toISOString(),
  });

  // Add UUV (Water domain - subsurface)
  entities.push({
    entity_id: 'UUV-001',
    lat: 15.4909,
    lon: 73.8278,
    alt: -50,
    status: 'Operational',
    model_name: 'survey-auv',
    type: 'UUV',
    domain: 'water',
    speed: 3.0,
    heading: 45,
    last_update: new Date().toISOString(),
  });

  // Add Satellite (Space domain)
  entities.push({
    entity_id: 'SAT-001',
    lat: 20.5937,
    lon: 78.9629,
    alt: 400000,
    status: 'Operational',
    model_name: 'leo-isr',
    type: 'Satellite',
    domain: 'space',
    speed: 7800,
    heading: 0,
    last_update: new Date().toISOString(),
  });

  // Add an offline entity
  entities.push({
    entity_id: 'UAV-003',
    lat: 19.0760,
    lon: 72.8777,
    alt: 200,
    status: 'Offline',
    model_name: 'quadcopter',
    type: 'UAV',
    domain: 'air',
    speed: 0,
    heading: 0,
    last_update: new Date(Date.now() - 3600000).toISOString(),
  });

  return entities;
};

export const useMockEntities = () => {
  const [entities, setEntities] = useState<Entity[]>(generateMockEntities());

  // Simulate entity updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setEntities(prev => 
        prev.map(entity => {
          if (entity.status === 'Operational' && entity.speed && entity.speed > 0) {
            // Simulate movement by slightly changing coordinates
            const latChange = (Math.random() - 0.5) * 0.001;
            const lonChange = (Math.random() - 0.5) * 0.001;
            
            return {
              ...entity,
              lat: entity.lat + latChange,
              lon: entity.lon + lonChange,
              last_update: new Date().toISOString(),
            };
          }
          return {
            ...entity,
            last_update: new Date().toISOString(),
          };
        })
      );
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return entities;
};
