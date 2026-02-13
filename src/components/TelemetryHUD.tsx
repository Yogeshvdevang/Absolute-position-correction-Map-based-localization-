import { Card } from './ui/card';
import { Battery, Radio, Cog } from 'lucide-react';
import { Entity } from '@/types/entity';
import { AttitudeIndicator } from './AttitudeIndicator';
import { HeadingCompass } from './HeadingCompass';

interface TelemetryHUDProps {
  entity: Entity | null;
  connected: boolean;
}

const formatCoord = (val?: number) => {
  if (val === undefined || val === null) return '--';
  return val.toFixed(5);
};

const formatNum = (val?: number, digits = 1) => {
  if (val === undefined || val === null) return '--';
  return val.toFixed(digits);
};

const Metric = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold text-foreground">{value}</span>
    {unit ? <span className="text-[10px] text-muted-foreground">{unit}</span> : null}
  </div>
);

export const TelemetryHUD = ({ entity, connected }: TelemetryHUDProps) => {
  const heading = entity?.heading ?? 0;
  const airspeed = entity?.speed ?? 0;
  const groundspeed = entity?.metadata?.groundspeed ?? entity?.speed ?? 0;
  const altitude = entity?.alt ?? 0;
  const battery = entity?.metadata?.battery ?? entity?.speed ?? undefined;

  return (
    <Card className="bg-slate-900/95 backdrop-blur text-xs text-foreground border border-border px-3 py-3 shadow-2xl w-64 rounded-md">
      {/* Gauge */}
      <div className="flex items-center justify-between mb-3">
        <div className="h-24 w-24">
          <AttitudeIndicator roll={0} pitch={0} />
        </div>
        <div className="flex flex-col items-end gap-1 text-[11px]">
          <div className="flex items-center gap-1">
            <Cog className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Telemetry</span>
          </div>
          <div className="flex items-center gap-1">
            <Radio className="h-4 w-4" />
            <span>{connected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Battery className="h-4 w-4" />
            <span>{battery !== undefined ? `${formatNum(battery, 0)}%` : '--'}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center mb-2">
        <div className="h-16 w-16">
          <HeadingCompass heading={heading} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Metric label="Altitude-rel" value={`${formatNum(altitude, 1)}`} unit="m" />
        <Metric label="Pilot Gain" value="50" unit="%" />
        <Metric label="Air Speed" value={`${formatNum(airspeed, 1)}`} unit="m/s" />
        <Metric label="Camera Tilt" value="50" unit="%" />
        <Metric label="Ground Speed" value={`${formatNum(groundspeed, 1)}`} unit="m/s" />
        <Metric label="Lights 2 level" value="50" unit="%" />
        <Metric label="Heading" value={`${formatNum(heading, 0)}`} unit="deg" />
        <Metric label="Lights 1 level" value="50" unit="%" />
        <Metric label="Voltage" value="0.00" unit="V" />
        <Metric label="Current" value="-1.00" unit="A" />
        <Metric label="Position" value={`${formatCoord(entity?.lat)}, ${formatCoord(entity?.lon)}`} />
        <Metric label="ID" value={entity?.entity_id || '--'} />
      </div>
    </Card>
  );
};
