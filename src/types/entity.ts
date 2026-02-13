export type VehicleDomain = 'air' | 'land' | 'water' | 'space';

export interface Entity {
  entity_id: string;
  lat: number;
  lon: number;
  alt: number;
  status: 'Operational' | 'Idle' | 'Simulated' | 'Offline';
  model_name: string;
  type: 'UAV' | 'UGV' | 'USV' | 'UUV' | 'Satellite' | 'Vehicle' | 'Personnel' | 'Zone';
  domain?: VehicleDomain;
  speed?: number;
  heading?: number;
  last_update: string;
  simulated?: boolean;
  metadata?: Record<string, any>;
}

export interface Task {
  task_id: string;
  entity_id: string;
  name: string;
  status: 'Pending' | 'Active' | 'Completed' | 'Failed';
  spec: {
    path: Array<{ lat: number; lon: number; alt: number }>;
    waypoints?: Array<{ lat: number; lon: number; alt: number; name: string }>;
  };
  created_at: string;
  updated_at: string;
}

export interface SimulationData {
  entity_id: string;
  lat: number;
  lon: number;
  alt: number;
  orientation?: { roll: number; pitch: number; yaw: number };
  velocity?: { x: number; y: number; z: number };
  timestamp: string;
}
