export interface MissionWaypoint {
  id: string;
  name?: string;
  lat: number;
  lon: number;
  alt: number;
  speed?: number;
  hold?: number;
}

export interface LatLonPoint {
  lat: number;
  lon: number;
}

export interface SurveyOverlayLine {
  start: LatLonPoint;
  end: LatLonPoint;
}

export interface SurveyOverlay {
  boundary: LatLonPoint[];
  gridLines: SurveyOverlayLine[];
}
