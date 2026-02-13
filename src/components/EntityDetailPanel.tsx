import { Entity } from '@/types/entity';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { X, Battery, Radio, Cog, Camera, Navigation, Gauge, Wifi, Satellite, Signal, Shield, Radar, Eye, MapPin, Anchor, Waves, Compass, Ship, CircleDot, Thermometer, CircleDashed, Footprints, Sun, Zap, Link2, Activity, CircleOff } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card } from './ui/card';
import { AttitudeIndicator } from './AttitudeIndicator';
import { HeadingCompass } from './HeadingCompass';
import { DepthIndicator } from './DepthIndicator';
import { SpeedGauge } from './SpeedGauge';
import { RPMSpeedGauge } from './RPMSpeedGauge';
import { InclinometerGauge } from './InclinometerGauge';
import { OrbitalAltitudeGauge } from './OrbitalAltitudeGauge';
import { DigitalTwinModel } from './DigitalTwinModel';
import { useTelemetry } from '@/hooks/useTelemetry';

interface EntityDetailPanelProps {
  entity: Entity | null;
  onClose: () => void;
  connected?: boolean;
}
const formatCoord = (val?: number) => {
  if (val === undefined || val === null) return '--';
  return val.toFixed(5);
};
const formatNum = (val?: number, digits = 1) => {
  if (val === undefined || val === null) return '--';
  return val.toFixed(digits);
};
const Metric = ({
  label,
  value,
  unit
}: {
  label: string;
  value: string;
  unit?: string;
}) => <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold text-foreground">{value}</span>
    {unit ? <span className="text-[10px] text-muted-foreground">{unit}</span> : null}
  </div>;

export const EntityDetailPanel = ({
  entity,
  onClose,
  connected = false
}: EntityDetailPanelProps) => {
  if (!entity) return null;
  const { telemetry, hasTelemetry } = useTelemetry(entity.entity_id);
  const heading = entity?.heading ?? 0;
  const orientationYaw = hasTelemetry ? telemetry.yaw : entity?.metadata?.orientation?.yaw ?? heading;
  const orientationPitch = hasTelemetry ? telemetry.pitch : entity?.metadata?.orientation?.pitch ?? entity?.metadata?.pitch ?? 0;
  const orientationRoll = hasTelemetry ? telemetry.roll : entity?.metadata?.orientation?.roll ?? entity?.metadata?.roll ?? 0;
  const offsetX = hasTelemetry ? telemetry.x ?? 0 : 0;
  const offsetY = hasTelemetry ? telemetry.y ?? 0 : 0;
  const offsetZ = hasTelemetry ? telemetry.z ?? 0 : 0;
  const airspeed = entity?.speed ?? 0;
  const groundspeed = entity?.metadata?.groundspeed ?? entity?.speed ?? 0;
  const altitude = entity?.alt ?? 0;
  const battery = entity?.metadata?.battery ?? entity?.speed ?? undefined;
  // Determine vehicle type
  const isUUV = entity.type === 'UUV';
  const isUSV = entity.type === 'USV';
  const isUGV = entity.type === 'UGV';
  const isSatellite = entity.type === 'Satellite';
  const isWaterVehicle = isUUV || isUSV;

  // UUV-specific metrics
  const depth = entity?.metadata?.depth ?? entity?.alt ?? 0;
  const maxRatedDepth = entity?.metadata?.maxRatedDepth ?? 300;
  const forwardSpeed = entity?.speed ?? 0;
  const verticalSpeed = entity?.metadata?.verticalSpeed ?? 0;
  const waterTemp = entity?.metadata?.waterTemp ?? 6.2;
  const pressure = entity?.metadata?.pressure ?? 12.3;
  const navigationMode = entity?.metadata?.navigationMode ?? 'DVL + INS';
  const positionError = entity?.metadata?.positionError ?? 1.8;
  const lastSurfaceFix = entity?.metadata?.lastSurfaceFix ?? `${entity?.lat?.toFixed(5)}, ${entity?.lon?.toFixed(5)}`;

  // USV-specific metrics
  const speedKnots = entity?.metadata?.speedKnots ?? (entity?.speed ?? 0) * 1.944;
  const headingRPM = entity?.metadata?.rpm ?? 178;
  const windSpeed = entity?.metadata?.windSpeed ?? 6.1;
  const waveHeight = entity?.metadata?.waveHeight ?? 0.8;
  const roll = entity?.metadata?.roll ?? 2.1;
  const usvPitch = entity?.metadata?.pitch ?? 1.3;
  const courseOverGround = entity?.metadata?.cog ?? 181;
  const distanceToWaypoint = entity?.metadata?.distanceToWaypoint ?? 320;
  const etaToWaypoint = entity?.metadata?.eta ?? '02:15';

  // UGV-specific metrics
  const ugvSpeedKmh = entity?.metadata?.speedKmh ?? (entity?.speed ?? 0) * 3.6;
  const ugvRPM = entity?.metadata?.rpm ?? 2650;
  const incline = entity?.metadata?.incline ?? 15;
  const groundClearance = entity?.metadata?.groundClearance ?? 600;
  const driveMode = entity?.metadata?.driveMode ?? 'Tracked';
  const steeringMode = entity?.metadata?.steeringMode ?? 'Skid';
  const pda = entity?.metadata?.pda ?? 2.0;
  const ugvPitch = entity?.metadata?.pitch ?? 12.0;
  const ugvBatt = entity?.metadata?.batt ?? 12.0;
  const prts = entity?.metadata?.prts ?? 15.0;
  const ugvBattery = entity?.metadata?.battery ?? 81;
  const ugvVoltage = entity?.metadata?.voltage ?? 23.8;
  const ugvCurrent = entity?.metadata?.current ?? -24.1;

  // Satellite-specific metrics
  const orbitalAltitude = entity?.metadata?.orbitalAltitude ?? entity?.alt ?? 550;
  const orbitalInclination = entity?.metadata?.inclination ?? 97.6;
  const orbitType = entity?.metadata?.orbitType ?? 'Low Earth Orbit';
  const orbitalVelocity = entity?.metadata?.velocity ?? 7.6;
  const satRoll = entity?.metadata?.roll ?? 0.1;
  const orbitPeriod = entity?.metadata?.orbitPeriod ?? 95.4;
  const apogee = entity?.metadata?.apogee ?? 560;
  const perigee = entity?.metadata?.perigee ?? 547;
  const nextComsWindow = entity?.metadata?.nextComsWindow ?? '01:25';
  const eclipseIn = entity?.metadata?.eclipseIn ?? '28:58';
  const satBattery = entity?.metadata?.battery ?? 84;
  const satSignal = entity?.metadata?.signal ?? -96;
  const payloadStatus = entity?.metadata?.payloadStatus ?? 'ACTIVE';
  const linkStatus = entity?.metadata?.linkStatus ?? 'SECURE';
  const solarStatus = entity?.metadata?.solarStatus ?? 'OPTIMAL';
  const adcsStatus = entity?.metadata?.adcsStatus ?? 'STABLE';
  const thermalStatus = entity?.metadata?.thermalStatus ?? 'STABLE';
  const attitudePitch = orientationPitch;
  const attitudeRoll = orientationRoll;
  const twinModelUrl = (() => {
    if (entity.type === 'UAV') {
      const modelName = (entity.model_name || '').toLowerCase();
      return modelName.includes('fixed') || modelName.includes('air')
        ? '/assets/uav/aircraft.glb'
        : '/assets/uav/drone.glb';
    }
    if (entity.type === 'UGV') return '/assets/ugv/rover.glb';
    if (entity.type === 'USV') return '/models/generic.gltf';
    if (entity.type === 'UUV') return '/models/generic.gltf';
    if (entity.type === 'Satellite') return '/models/generic.gltf';
    return '/models/generic.gltf';
  })();

  const renderDigitalTwin = () => (
    <div className="mt-2 md:mt-3">
      <div className="relative h-28 w-full rounded-md border border-border/40 bg-slate-950/50 overflow-hidden">
        <DigitalTwinModel
          modelUrl={twinModelUrl}
          heading={orientationYaw}
          pitch={attitudePitch}
          roll={attitudeRoll}
          xOffset={offsetX}
          yOffset={offsetY}
          zOffset={offsetZ}
          className="absolute inset-0"
        />
        <div className="absolute top-2 left-3 right-3 text-[10px] text-muted-foreground flex items-center justify-between pointer-events-none">
          <span className="uppercase tracking-wide">Digital Twin</span>
          <span>{connected ? 'Live Sync' : 'Sim Sync'}</span>
        </div>
        <div className="absolute top-6 left-3 right-3 text-[10px] text-muted-foreground pointer-events-none">
          {entity?.model_name || entity?.entity_id || 'Asset'}
        </div>
        <div className="absolute bottom-2 left-3 right-3 text-[10px] text-muted-foreground pointer-events-none">
          Yaw {formatNum(orientationYaw, 0)} deg | Pitch {formatNum(attitudePitch, 0)} deg | Roll {formatNum(attitudeRoll, 0)} deg
        </div>
      </div>
    </div>
  );

  const renderUUVTelemetryHUD = () => (
    <Card className="bg-slate-900/95 backdrop-blur text-xs text-foreground border border-border px-2 md:px-3 py-2 md:py-3 shadow-2xl rounded-md mx-2 md:mx-4 mt-2 md:mt-4">
      {/* Depth Indicator and Compass */}
      <div className="flex items-center justify-center mb-2 md:mb-3 gap-2 md:gap-4">
        <DepthIndicator depth={depth} maxRatedDepth={maxRatedDepth} size={90} />
        <HeadingCompass heading={heading} size={90} />
      </div>

      {renderDigitalTwin()}

      {/* UUV Metrics grid */}
      <div className="grid grid-cols-2 gap-x-2 md:gap-x-3 gap-y-1.5 md:gap-y-2 text-[10px] md:text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Depth <span className="text-[9px]">rel</span></span>
          <span className="text-sm font-semibold text-foreground">{formatNum(depth, 1)}</span>
          <span className="text-[10px] text-amber-400">Max Rated: {maxRatedDepth} m</span>
        </div>
        <Metric label="Heading" value={`${formatNum(heading, 0)}`} unit="°" />
        <Metric label="Forward Speed" value={`${formatNum(forwardSpeed, 1)}`} unit="m/s" />
        <Metric label="Vertical Speed" value={`${formatNum(verticalSpeed, 1)}`} unit="m/s" />
        <Metric label="Water Temp" value={`${formatNum(waterTemp, 1)}`} unit="°C" />
        <Metric label="Pressure" value={`${formatNum(pressure, 1)}`} unit="bar" />
        <Metric label="Battery" value={`${battery ?? 72}`} unit="%" />
        <Metric label="Voltage" value={`${formatNum(entity?.metadata?.voltage ?? 48.2, 1)}`} unit="V" />
        <div className="col-span-2 flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Current</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(entity?.metadata?.current ?? -8.1, 1)} A</span>
        </div>
      </div>

      {/* Navigation info */}
      <div className="mt-3 pt-2 border-t border-border/50 space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Navigation Mode:</span>
          <span className="text-foreground font-medium">{navigationMode}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Est. Position Error:</span>
          <span className="text-foreground">±{positionError} m</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Last Surface Fix:</span>
          <span className="text-foreground">{lastSurfaceFix}</span>
        </div>
      </div>
    </Card>
  );

  const renderUSVTelemetryHUD = () => (
    <Card className="bg-slate-900/95 backdrop-blur text-xs text-foreground border border-border px-2 md:px-3 py-2 md:py-3 shadow-2xl rounded-md mx-2 md:mx-4 mt-2 md:mt-4">
      {/* Speed Gauge and Heading Compass */}
      <div className="flex items-center justify-center mb-2 md:mb-3 gap-2 md:gap-4">
        <SpeedGauge speed={speedKnots} maxSpeed={20} unit="kn" size={90} />
        <HeadingCompass heading={heading} size={90} />
      </div>

      {renderDigitalTwin()}

      {/* USV Metrics grid */}
      <div className="grid grid-cols-2 gap-x-2 md:gap-x-3 gap-y-1.5 md:gap-y-2 text-[10px] md:text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Speed</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(speedKnots, 1)}</span>
          <span className="text-[10px] text-muted-foreground">knots</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Heading</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(heading, 0)}</span>
          <span className="text-[10px] text-muted-foreground">RPM: {headingRPM}</span>
        </div>
        <Metric label="Wind Speed" value={`${formatNum(windSpeed, 1)}`} unit="kn" />
        <Metric label="Wave Height" value={`${formatNum(waveHeight, 1)}`} unit="m" />
        <Metric label="Roll" value={`${formatNum(roll, 1)}`} unit="°" />
        <Metric label="Pitch" value={`${formatNum(usvPitch, 1)}`} unit="°" />
        <Metric label="Battery" value={`${battery ?? 65}`} unit="%" />
        <Metric label="Voltage" value={`${formatNum(entity?.metadata?.voltage ?? 51.6, 1)}`} unit="V" />
        <Metric label="Latitude" value={formatCoord(entity?.lat)} />
        <Metric label="Longitude" value={formatCoord(entity?.lon)} />
      </div>

      {/* Course info */}
      <div className="mt-3 pt-2 border-t border-border/50 grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">Course Over Ground:</span>
          <span className="text-sm font-semibold text-foreground">{courseOverGround}°</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">Distance / ETA:</span>
          <span className="text-sm font-semibold text-foreground">{distanceToWaypoint} m / {etaToWaypoint}</span>
        </div>
      </div>
    </Card>
  );

  const renderUGVTelemetryHUD = () => (
    <Card className="bg-slate-900/95 backdrop-blur text-xs text-foreground border border-border px-2 md:px-3 py-2 md:py-3 shadow-2xl rounded-md mx-2 md:mx-4 mt-2 md:mt-4">
      {/* Speed/RPM Gauge, Inclinometer, and Compass */}
      <div className="flex items-center justify-center mb-2 md:mb-3 gap-2 md:gap-3">
        <RPMSpeedGauge speed={ugvSpeedKmh} rpm={ugvRPM} maxSpeed={20} size={80} />
        <InclinometerGauge pitch={incline} roll={roll} size={80} />
        <HeadingCompass heading={heading} size={80} />
      </div>

      {renderDigitalTwin()}

      {/* UGV Metrics grid - 3 column layout */}
      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-[10px] md:text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Speed</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(ugvSpeedKmh, 0)}</span>
          <span className="text-[10px] text-muted-foreground">km/h</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Incline</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(incline, 0)}</span>
          <span className="text-[10px] text-muted-foreground">%m</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Ground</span>
          <span className="text-sm font-semibold text-foreground px-1 bg-slate-700 rounded text-center">{groundClearance}</span>
          <span className="text-[10px] text-muted-foreground">cm</span>
        </div>
        
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Drive Mode</span>
          <span className="text-sm font-semibold text-foreground">{driveMode}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Steering Mode</span>
          <span className="text-sm font-semibold text-foreground">{steeringMode}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">P&A</span>
          <span className="text-sm font-semibold text-foreground">+{formatNum(pda, 1)}</span>
        </div>
        
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Pitch</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(ugvPitch, 1)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Batt:</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(ugvBatt, 1)}°</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">P#!a</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(prts, 1)}°</span>
        </div>
        
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Battery</span>
          <span className="text-sm font-semibold text-foreground">{ugvBattery}%</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Voltage</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(ugvVoltage, 1)}</span>
          <span className="text-[10px] text-muted-foreground">V</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">Current</span>
          <span className="text-sm font-semibold text-foreground">{formatNum(ugvCurrent, 1)}</span>
          <span className="text-[10px] text-muted-foreground">A</span>
        </div>
      </div>

      {/* Position info */}
      <div className="mt-3 pt-2 border-t border-border/50 grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{formatCoord(entity?.lat)}, {formatCoord(entity?.lon)}</span>
        </div>
        <div className="flex flex-col gap-0.5 items-end">
          <span className="text-sm font-medium text-foreground">{entity?.entity_id || '--'}</span>
        </div>
      </div>
    </Card>
  );

  const renderSatelliteTelemetryHUD = () => (
    <Card className="bg-slate-900/95 backdrop-blur text-xs text-foreground border border-border px-2 md:px-3 py-2 md:py-3 shadow-2xl rounded-md mx-2 md:mx-4 mt-2 md:mt-4">
      {/* Header with satellite name */}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
        <Satellite className="h-4 w-4 text-cyan-400" />
        <span className="text-xs font-medium text-foreground">{entity?.model_name || entity?.entity_id}</span>
      </div>

      {renderDigitalTwin()}

      {/* Orbital Gauge and metrics */}
      <div className="flex items-start gap-3 mb-3">
        <OrbitalAltitudeGauge 
          altitude={orbitalAltitude} 
          inclination={orbitalInclination}
          orbitType={orbitType}
          size={85} 
        />
        <div className="flex-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
          <div className="flex flex-col">
            <span className="text-muted-foreground">Lat:</span>
            <span className="text-sm font-semibold text-foreground">{formatCoord(entity?.lat)}°</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Lon:</span>
            <span className="text-sm font-semibold text-foreground">{formatCoord(entity?.lon)}°</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Velocity:</span>
            <span className="text-sm font-semibold text-foreground">{orbitalVelocity} <span className="text-[9px] text-muted-foreground">km/s</span></span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Roll:</span>
            <span className="text-sm font-semibold text-foreground">{satRoll}°</span>
          </div>
        </div>
      </div>

      {/* Current Orbit Info */}
      <div className="mb-3">
        <h4 className="text-[10px] text-muted-foreground mb-1">Current Orbit Info</h4>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Orbit Period:</span>
            <span className="text-foreground font-medium">{orbitPeriod} min</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Apogee:</span>
            <span className="text-foreground font-medium">{apogee} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Apogee:</span>
            <span className="text-foreground font-medium">{apogee} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Perigee:</span>
            <span className="text-foreground font-medium">{perigee} km</span>
          </div>
        </div>
      </div>

      {/* Communication Windows */}
      <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
        <div className="flex items-center gap-1">
          <Radio className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Next COMS:</span>
          <span className="text-foreground font-medium">{nextComsWindow}</span>
        </div>
        <div className="flex items-center gap-1">
          <CircleOff className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Eclipse in:</span>
          <span className="text-foreground font-medium">{eclipseIn}</span>
        </div>
      </div>
    </Card>
  );

  const renderTelemetryHUD = () => (
    <Card className="bg-slate-900/95 backdrop-blur text-xs text-foreground border border-border px-2 md:px-3 py-2 md:py-3 shadow-2xl rounded-md mx-2 md:mx-4 mt-2 md:mt-4">
      {/* Attitude Indicator and Compass */}
      <div className="flex items-center justify-center mb-2 md:mb-3 gap-2 md:gap-4">
        <AttitudeIndicator pitch={entity?.metadata?.pitch ?? 5} roll={entity?.metadata?.roll ?? 0} size={90} />
        <HeadingCompass heading={heading} size={90} />
      </div>

      {renderDigitalTwin()}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-2 md:gap-x-3 gap-y-1.5 md:gap-y-2 text-[10px] md:text-xs">
        <Metric label="Altitude-rel" value={`${formatNum(altitude, 1)}`} unit="m" />
        <Metric label="Pilot Gain" value="50" unit="%" />
        <Metric label="Air Speed" value={`${formatNum(airspeed, 1)}`} unit="m/s" />
        <Metric label="Camera Tilt" value="50" unit="%" />
        <Metric label="Ground Speed" value={`${formatNum(groundspeed, 1)}`} unit="m/s" />
        <Metric label="Heading" value={`${formatNum(heading, 0)}`} unit="deg" />
        <Metric label="Voltage" value="0.00" unit="V" />
        <Metric label="Current" value="-1.00" unit="A" />
        <Metric label="Position" value={`${formatCoord(entity?.lat)}, ${formatCoord(entity?.lon)}`} />
        <Metric label="ID" value={entity?.entity_id || '--'} />
      </div>
    </Card>
  );
  const getSensorIcon = (sensor: string) => {
    const iconProps = {
      className: "h-4 w-4"
    };
    switch (sensor) {
      case 'Camera':
        return <Camera {...iconProps} />;
      case 'M-Camera':
        return <Camera {...iconProps} />;
      case 'GPS':
        return <Satellite {...iconProps} />;
      case 'IMU':
        return <Gauge {...iconProps} />;
      case 'Battery Monitor':
        return <Battery {...iconProps} />;
      case 'Signal':
        return <Signal {...iconProps} />;
      case 'Remote ID':
        return <Shield {...iconProps} />;
      case 'Front Sensors':
        return <Eye {...iconProps} />;
      case 'Lidar':
        return <Radar {...iconProps} />;
      case 'Obstacle Detection':
      case 'Obstacle Sensor':
        return <Shield {...iconProps} />;
      case 'GPS Navigation':
        return <MapPin {...iconProps} />;
      // UUV sensors
      case 'Sonar':
        return <Waves {...iconProps} />;
      case 'DVL':
        return <CircleDot {...iconProps} />;
      case 'INS':
        return <Compass {...iconProps} />;
      case 'Depth Sensor':
        return <Anchor {...iconProps} />;
      case 'Acoustic Modem':
        return <Radio {...iconProps} />;
      case 'Mission Computer':
        return <Cog {...iconProps} />;
      // USV sensors
      case 'Compass':
        return <Compass {...iconProps} />;
      case 'AIS':
        return <Ship {...iconProps} />;
      case 'Engine Monitor':
        return <Gauge {...iconProps} />;
      // UGV sensors
      case 'Track Left':
      case 'Track Right':
      case 'Track':
        return <Footprints {...iconProps} />;
      // Satellite sensors
      case 'Payload Ops':
        return <Activity {...iconProps} />;
      case 'ADCS':
        return <Compass {...iconProps} />;
      case 'Thrusters':
        return <Zap {...iconProps} />;
      case 'Onboard Power':
        return <Battery {...iconProps} />;
      case 'Batteries':
        return <Battery {...iconProps} />;
      case 'Communications':
        return <Radio {...iconProps} />;
      case 'Primary Antenna':
        return <Wifi {...iconProps} />;
      case 'Thermal Control':
        return <Thermometer {...iconProps} />;
      case 'Link Status':
        return <Link2 {...iconProps} />;
      case 'Solar Status':
        return <Sun {...iconProps} />;
      default:
        return <Cog {...iconProps} />;
    }
  };

  const getSensorStatus = (sensor: string) => {
    // Simulate different statuses based on sensor type
    const statuses: Record<string, {
      status: string;
      color: string;
      value?: string;
    }> = {
      'Camera': {
        status: 'Active',
        color: 'bg-green-500',
        value: '1080p'
      },
      'GPS': {
        status: 'Lock',
        color: 'bg-green-500',
        value: `${entity?.metadata?.satellites ?? 10} Sat`
      },
      'IMU': {
        status: 'OK',
        color: 'bg-green-500',
        value: 'Calibrated'
      },
      'Battery Monitor': {
        status: 'OK',
        color: 'bg-green-500',
        value: `${battery ?? 0}%`
      },
      'Signal': {
        status: 'Strong',
        color: 'bg-green-500',
        value: '-45dBm'
      },
      'Remote ID': {
        status: 'Active',
        color: 'bg-green-500',
        value: 'Broadcasting'
      },
      'Front Sensors': {
        status: 'Active',
        color: 'bg-green-500',
        value: 'Clear'
      },
      'Lidar': {
        status: 'Scanning',
        color: 'bg-blue-500',
        value: '360°'
      },
      'Obstacle Detection': {
        status: 'Active',
        color: 'bg-green-500',
        value: 'No Obstacles'
      },
      'GPS Navigation': {
        status: 'Lock',
        color: 'bg-green-500',
        value: 'DGPS'
      },
      // UUV sensors
      'Sonar': {
        status: 'Active',
        color: 'bg-green-500',
        value: '1000p'
      },
      'DVL': {
        status: 'Lock',
        color: 'bg-green-500',
        value: 'LOCK'
      },
      'INS': {
        status: 'OK',
        color: 'bg-green-500',
        value: 'OK'
      },
      'Depth Sensor': {
        status: 'OK',
        color: 'bg-green-500',
        value: 'CLEAR'
      },
      'Acoustic Modem': {
        status: 'Link',
        color: 'bg-green-500',
        value: 'LINK'
      },
      'Mission Computer': {
        status: 'Active',
        color: 'bg-green-500',
        value: 'ACTIVE'
      },
      // USV sensors
      'Compass': {
        status: 'Radar',
        color: 'bg-green-500',
        value: 'ACTIVE'
      },
      'AIS': {
        status: 'RX/TX',
        color: 'bg-green-500',
        value: 'RA/TX'
      },
      'Engine Monitor': {
        status: 'OK',
        color: 'bg-green-500',
        value: 'STRONG'
      },
      // UGV sensors
      'M-Camera': {
        status: 'Active',
        color: 'bg-green-500',
        value: 'ACTIVE'
      },
      'Track Left': {
        status: 'OK',
        color: 'bg-green-500',
        value: 'LEFT'
      },
      'Track Right': {
        status: 'OK',
        color: 'bg-green-500',
        value: 'OK'
      },
      'Obstacle Sensor': {
        status: 'OK',
        color: 'bg-green-500',
        value: 'ACTIV'
      },
      // Satellite sensors
      'Payload Ops': {
        status: 'Active',
        color: 'bg-green-500',
        value: payloadStatus
      },
      'Link Status': {
        status: 'Secure',
        color: 'bg-green-500',
        value: linkStatus
      },
      'Solar Status': {
        status: 'Optimal',
        color: 'bg-green-500',
        value: solarStatus
      },
      'ADCS': {
        status: 'Stable',
        color: 'bg-green-500',
        value: adcsStatus
      },
      'Thrusters': {
        status: 'OK',
        color: 'bg-green-500',
        value: 'N:15%, E:0.0%'
      },
      'Onboard Power': {
        status: 'Charging',
        color: 'bg-green-500',
        value: '26.3 V'
      },
      'Batteries': {
        status: 'Optimal',
        color: 'bg-green-500',
        value: `${satBattery}%`
      },
      'Communications': {
        status: 'Secure',
        color: 'bg-green-500',
        value: 'SECURE'
      },
      'Primary Antenna': {
        status: 'Active',
        color: 'bg-green-500',
        value: 'DATA LINK'
      },
      'Thermal Control': {
        status: 'Stable',
        color: 'bg-green-500',
        value: thermalStatus
      }
    };
    return statuses[sensor] || {
      status: 'Unknown',
      color: 'bg-muted',
      value: '--'
    };
  };
  const renderSensorRow = (sensor: string) => {
    const { status, color, value } = getSensorStatus(sensor);
    return (
      <div key={sensor} className="flex items-center justify-between py-1.5 px-2 bg-slate-800/50 rounded">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded ${color}/20`}>
            {getSensorIcon(sensor)}
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-foreground font-medium">{sensor}</span>
            <span className="text-[10px] text-muted-foreground">{value}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${color} animate-pulse`}></div>
          <span className="text-[10px] text-muted-foreground uppercase">{status}</span>
        </div>
      </div>
    );
  };

  const renderSystemsStatus = () => (
    <div className="space-y-4 p-4">
      {entity.type === 'UAV' && (
        <div>
          <h3 className="text-xs font-semibold text-foreground mb-3 uppercase">Sensors & Systems</h3>
          <div className="space-y-2">
            {['Camera', 'GPS', 'IMU', 'Battery Monitor', 'Signal', 'Remote ID'].map(renderSensorRow)}
          </div>
        </div>
      )}

      {entity.type === 'UGV' && (
        <>
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-3 uppercase">Sensors & Systems</h3>
            <div className="grid grid-cols-2 gap-2">
              {['GPS', 'M-Camera', 'IMU', 'Depth Sensor', 'Track Left', 'Track Right', 'Obstacle Sensor'].map(renderSensorRow)}
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-amber-400 mb-3 uppercase">Mobility Indicators</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between py-1.5 px-2 bg-slate-800/50 rounded">
                <span className="text-xs text-foreground">Track Left</span>
                <div className="flex items-center gap-1">
                  <div className="w-8 h-1.5 bg-green-500 rounded"></div>
                  <span className="text-[10px] text-green-400">OK</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5 px-2 bg-slate-800/50 rounded">
                <span className="text-xs text-foreground">Track Right</span>
                <div className="flex items-center gap-1">
                  <div className="w-8 h-1.5 bg-green-500 rounded"></div>
                  <span className="text-[10px] text-green-400">OK</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {entity.type === 'UUV' && (
        <div>
          <h3 className="text-xs font-semibold text-foreground mb-3 uppercase">Sensors & Systems</h3>
          <div className="space-y-2">
            {['Sonar', 'DVL', 'INS', 'Depth Sensor', 'Battery Monitor', 'Acoustic Modem', 'Mission Computer'].map(renderSensorRow)}
          </div>
        </div>
      )}

      {entity.type === 'USV' && (
        <div>
          <h3 className="text-xs font-semibold text-foreground mb-3 uppercase">Sensors & Systems</h3>
          <div className="space-y-2">
            {['GPS', 'Compass', 'AIS', 'Camera', 'Engine Monitor', 'Signal', 'Remote ID'].map(renderSensorRow)}
          </div>
        </div>
      )}

      {entity.type === 'Vehicle' && (
        <>
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-3 uppercase">Ammunition</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-highlight rounded-full"></div>
                  <span className="text-sm text-foreground">APFSD-T</span>
                </div>
                <span className="text-sm text-muted-foreground">39/75</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-highlight rounded-full"></div>
                  <span className="text-sm text-foreground">HEAT-T</span>
                </div>
                <span className="text-sm text-muted-foreground">64/124</span>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-3 uppercase">Sensors</h3>
            <div className="space-y-2">
              {['Radar', 'Turret EO/IR', 'Active Protection System'].map(sensor => (
                <div key={sensor} className="flex items-center justify-between py-1">
                  <span className="text-sm text-foreground">{sensor}</span>
                  <div className="w-12 h-2 bg-orange-highlight rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {entity.type === 'Satellite' && (
        <>
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-3 uppercase">System Status</h3>
            <div className="space-y-2">
              {['Payload Ops', 'GPS', 'ADCS', 'Thrusters', 'Onboard Power', 'Batteries', 'Communications', 'Primary Antenna', 'Thermal Control'].map(renderSensorRow)}
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-foreground mb-3 uppercase">Faults</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1.5 px-2 bg-slate-800/50 rounded">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-foreground font-medium">NO FAULTS DETECTED</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5 px-2 bg-slate-800/50 rounded">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  <span className="text-xs text-foreground font-medium">AUTOSAFE ARM</span>
                </div>
                <span className="text-[10px] text-amber-400 font-medium">ARMED</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
  return <div className="h-full bg-panel border-l border-panel-border flex flex-col overflow-hidden">
      <Tabs defaultValue="health" className="h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-panel-border flex-shrink-0">
          <TabsList className="bg-transparent h-12 w-full justify-start rounded-none border-b-0 px-4">
            <TabsTrigger value="tasks" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="health" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              Telemetry
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 mr-2">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <TabsContent value="tasks" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              <h3 className="text-xs font-semibold text-foreground uppercase">Active Tasks</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 px-3 bg-slate-800/50 rounded">
                  <div className="flex flex-col">
                    <span className="text-xs text-foreground font-medium">Surveillance Pattern</span>
                    <span className="text-[10px] text-muted-foreground">Waypoint 3/8</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-[10px] text-muted-foreground uppercase">Active</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 px-3 bg-slate-800/50 rounded">
                  <div className="flex flex-col">
                    <span className="text-xs text-foreground font-medium">Target Tracking</span>
                    <span className="text-[10px] text-muted-foreground">Lock: TGT-042</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                    <span className="text-[10px] text-muted-foreground uppercase">Pending</span>
                  </div>
                </div>
              </div>
              <h3 className="text-xs font-semibold text-foreground uppercase mt-4">Queued</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 px-3 bg-slate-800/30 rounded">
                  <div className="flex flex-col">
                    <span className="text-xs text-foreground font-medium">Return to Base</span>
                    <span className="text-[10px] text-muted-foreground">RTL on low battery</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase">Queued</span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="health" className="flex-1 m-0 flex flex-col overflow-hidden">
          <div className="flex-shrink-0">
            {isUUV ? renderUUVTelemetryHUD() : isUSV ? renderUSVTelemetryHUD() : isUGV ? renderUGVTelemetryHUD() : isSatellite ? renderSatelliteTelemetryHUD() : renderTelemetryHUD()}
          </div>
          <ScrollArea className="flex-1">
            {renderSystemsStatus()}
          </ScrollArea>
          
          <div className="p-4 border-t border-panel-border flex-shrink-0">
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
              Report
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>;
};
