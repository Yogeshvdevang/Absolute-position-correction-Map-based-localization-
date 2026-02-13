export type TrackDisposition =
  | 'Hostile'
  | 'Suspect'
  | 'Unknown'
  | 'Assumed Friend'
  | 'Friendly'
  | 'Neutral';

export type TrackAction = 'View' | 'Assign to';

export interface Track {
  id: string;
  disposition: TrackDisposition;
  subtype: string;
  platform?: string;
  status: 'Live' | 'Stale';
  distance: string;
  action: TrackAction;
  thumbnail?: boolean;
  taskedTo?: string;
  pendingDisposition?: TrackDisposition;
  pendingUntil?: string;
  lastDetection?: string;
  source?: string;
  quality?: number;
  trackingAssets?: string[];
  sensors?: string[];
  createdAt?: string;
  lastUpdated?: string;
  environment?: string;
  heading?: number;
  altitude?: number;
  speed?: number;
}
