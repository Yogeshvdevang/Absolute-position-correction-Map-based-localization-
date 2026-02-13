import { Cloud, Wind, Thermometer, Droplets, Eye, Gauge, Waves, Anchor, Rocket, Mountain, Sun, Moon, Zap, Navigation, Radio, Plane, Ship, Car, Satellite } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useState } from 'react';

type FleetDomain = 'air' | 'land' | 'water' | 'space' | 'mixed';

// Domain-specific icons
const DOMAIN_ICONS: Record<FleetDomain, React.ElementType> = {
  air: Plane,
  land: Car,
  water: Ship,
  space: Satellite,
  mixed: Radio,
};

// Domain-specific colors
const DOMAIN_COLORS: Record<FleetDomain, string> = {
  air: 'text-sky-400',
  land: 'text-amber-500',
  water: 'text-blue-500',
  space: 'text-purple-400',
  mixed: 'text-primary',
};

const DOMAIN_BG: Record<FleetDomain, string> = {
  air: 'bg-sky-400/10',
  land: 'bg-amber-500/10',
  water: 'bg-blue-500/10',
  space: 'bg-purple-400/10',
  mixed: 'bg-primary/10',
};

// Domain-specific environment data
const domainEnvironmentData: Record<FleetDomain, Array<{
  icon: React.ElementType;
  label: string;
  value: string;
  direction?: string;
  status: string;
  critical?: boolean;
}>> = {
  air: [
    { icon: Thermometer, label: 'Temperature', value: '18°C', status: 'Normal' },
    { icon: Wind, label: 'Wind Speed', value: '12 km/h', direction: 'NE', status: 'Low' },
    { icon: Cloud, label: 'Cloud Cover', value: '40%', status: 'Partly Cloudy' },
    { icon: Eye, label: 'Visibility', value: '10 km', status: 'Good' },
    { icon: Gauge, label: 'Pressure', value: '1013 hPa', status: 'Normal' },
    { icon: Zap, label: 'Turbulence', value: 'Light', status: 'Safe to fly' },
  ],
  land: [
    { icon: Thermometer, label: 'Temperature', value: '22°C', status: 'Normal' },
    { icon: Mountain, label: 'Terrain Grade', value: '8%', status: 'Moderate' },
    { icon: Eye, label: 'Visibility', value: '8 km', status: 'Good' },
    { icon: Droplets, label: 'Ground Moisture', value: '35%', status: 'Dry' },
    { icon: Navigation, label: 'GPS Quality', value: '12 sats', status: 'Excellent' },
    { icon: Wind, label: 'Dust Index', value: 'Low', status: 'Clear' },
  ],
  water: [
    { icon: Waves, label: 'Wave Height', value: '1.2 m', status: 'Moderate' },
    { icon: Wind, label: 'Wind Speed', value: '18 km/h', direction: 'SW', status: 'Moderate' },
    { icon: Thermometer, label: 'Sea Temp', value: '16°C', status: 'Normal' },
    { icon: Anchor, label: 'Current', value: '2.1 kn', direction: 'N', status: 'Light' },
    { icon: Eye, label: 'Visibility', value: '15 m', status: 'Good (underwater)' },
    { icon: Gauge, label: 'Salinity', value: '35 ppt', status: 'Normal' },
  ],
  space: [
    { icon: Sun, label: 'Solar Activity', value: 'Low', status: 'Stable' },
    { icon: Zap, label: 'Radiation', value: '0.8 mSv/h', status: 'Normal' },
    { icon: Thermometer, label: 'Surface Temp', value: '-120°C', status: 'Shadow' },
    { icon: Moon, label: 'Orbital Phase', value: 'LEO', status: 'Stable orbit' },
    { icon: Radio, label: 'Comms Window', value: '42 min', status: 'Active' },
    { icon: Rocket, label: 'Delta-V Reserve', value: '120 m/s', status: 'Nominal' },
  ],
  mixed: [
    { icon: Thermometer, label: 'Avg Temperature', value: '18°C', status: 'Normal' },
    { icon: Wind, label: 'Wind Speed', value: '14 km/h', direction: 'NE', status: 'Moderate' },
    { icon: Eye, label: 'Visibility', value: '10 km', status: 'Good' },
    { icon: Waves, label: 'Sea State', value: '1.5 m', status: 'Moderate' },
    { icon: Navigation, label: 'GPS Quality', value: '10 sats', status: 'Good' },
    { icon: Radio, label: 'Comms Status', value: 'Active', status: 'All domains' },
  ],
};

// Domain-specific forecasts
const domainForecasts: Record<FleetDomain, Array<{ time: string; condition: string }>> = {
  air: [
    { time: 'Next Hour', condition: 'Clear, 18°C, Light winds' },
    { time: 'Next 3 Hours', condition: 'Partly Cloudy, 17°C' },
    { time: 'Next 6 Hours', condition: 'Overcast, 15°C' },
  ],
  land: [
    { time: 'Next Hour', condition: 'Dry, 22°C, Good traction' },
    { time: 'Next 3 Hours', condition: 'Dust possible, 24°C' },
    { time: 'Next 6 Hours', condition: 'Clear, 20°C' },
  ],
  water: [
    { time: 'Next Hour', condition: 'Waves 1.2m, SW winds' },
    { time: 'Next 3 Hours', condition: 'Waves 1.8m, Storm brewing' },
    { time: 'Next 6 Hours', condition: 'Calming, 0.8m waves' },
  ],
  space: [
    { time: 'Next Orbit', condition: 'Shadow entry in 18 min' },
    { time: '+2 Orbits', condition: 'Solar flare risk: Low' },
    { time: '+4 Orbits', condition: 'Debris field approach' },
  ],
  mixed: [
    { time: 'Next Hour', condition: 'Stable all domains' },
    { time: 'Next 3 Hours', condition: 'Weather front approaching' },
    { time: 'Next 6 Hours', condition: 'Maritime ops cautioned' },
  ],
};

interface EnvironmentPanelProps {
  hideHeader?: boolean;
  activeDomains?: FleetDomain[];
}

export const EnvironmentPanel = ({ hideHeader = false, activeDomains = ['air'] }: EnvironmentPanelProps) => {
  const [selectedDomain, setSelectedDomain] = useState<FleetDomain>(
    activeDomains.length > 1 ? 'mixed' : activeDomains[0]
  );

  const allDomains: FleetDomain[] = ['air', 'land', 'water', 'space'];
  const environmentData = domainEnvironmentData[selectedDomain];
  const forecasts = domainForecasts[selectedDomain];
  const DomainIcon = DOMAIN_ICONS[selectedDomain];

  return (
    <div className="h-full flex flex-col">
      {!hideHeader && (
        <div className="p-3 border-b border-panel-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded ${DOMAIN_BG[selectedDomain]}`}>
                <DomainIcon className={`h-4 w-4 ${DOMAIN_COLORS[selectedDomain]}`} />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Environment</h2>
            </div>
            <Badge variant="outline" className="text-[10px] capitalize">
              {selectedDomain}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Domain-specific conditions</p>
          
          {/* Domain Selector */}
          <div className="flex gap-1">
            {allDomains.map((domain) => {
              const Icon = DOMAIN_ICONS[domain];
              const isActive = selectedDomain === domain;
              return (
                <Button
                  key={domain}
                  variant={isActive ? 'default' : 'ghost'}
                  size="sm"
                  className={`h-7 px-2 text-[10px] gap-1 ${isActive ? '' : 'opacity-60 hover:opacity-100'}`}
                  onClick={() => setSelectedDomain(domain)}
                >
                  <Icon className="h-3 w-3" />
                  <span className="capitalize hidden sm:inline">{domain}</span>
                </Button>
              );
            })}
            <Button
              variant={selectedDomain === 'mixed' ? 'default' : 'ghost'}
              size="sm"
              className={`h-7 px-2 text-[10px] gap-1 ${selectedDomain === 'mixed' ? '' : 'opacity-60 hover:opacity-100'}`}
              onClick={() => setSelectedDomain('mixed')}
            >
              <Radio className="h-3 w-3" />
              <span className="hidden sm:inline">All</span>
            </Button>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {environmentData.map((item) => (
            <Card
              key={item.label}
              className={`p-3 border-border/50 hover:bg-secondary transition-colors ${
                item.critical ? 'bg-destructive/10 border-destructive/30' : 'bg-secondary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded ${DOMAIN_BG[selectedDomain]}`}>
                  <item.icon className={`h-4 w-4 ${DOMAIN_COLORS[selectedDomain]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground mb-1">
                    {item.label}
                  </p>
                  <p className="text-lg font-semibold text-foreground mb-1">
                    {item.value}
                    {item.direction && (
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        {item.direction}
                      </span>
                    )}
                  </p>
                  <p className={`text-xs ${item.critical ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {item.status}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="p-3 mt-2">
          <Card className="p-3 bg-secondary/30 border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-foreground">
                {selectedDomain === 'space' ? 'Orbital Forecast' : 'Forecast'}
              </h3>
              <Badge variant="outline" className={`text-[9px] ${DOMAIN_COLORS[selectedDomain]}`}>
                {selectedDomain.toUpperCase()}
              </Badge>
            </div>
            <div className="space-y-2">
              {forecasts.map((forecast, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{forecast.time}</span>
                  <span className="text-foreground text-right max-w-[60%]">{forecast.condition}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Domain-specific alerts */}
        {selectedDomain === 'water' && (
          <div className="p-3">
            <Card className="p-3 bg-amber-500/10 border-amber-500/30">
              <div className="flex items-center gap-2 text-amber-500">
                <Waves className="h-4 w-4" />
                <span className="text-xs font-medium">Maritime Advisory</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Storm system 120nm SW. Monitor conditions.
              </p>
            </Card>
          </div>
        )}

        {selectedDomain === 'space' && (
          <div className="p-3">
            <Card className="p-3 bg-purple-400/10 border-purple-400/30">
              <div className="flex items-center gap-2 text-purple-400">
                <Satellite className="h-4 w-4" />
                <span className="text-xs font-medium">Orbital Status</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Next debris conjunction: T+4h 22m. Maneuver ready.
              </p>
            </Card>
          </div>
        )}

        {selectedDomain === 'air' && (
          <div className="p-3">
            <Card className="p-3 bg-sky-400/10 border-sky-400/30">
              <div className="flex items-center gap-2 text-sky-400">
                <Plane className="h-4 w-4" />
                <span className="text-xs font-medium">Airspace Status</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Clear to FL350. No TFRs in area.
              </p>
            </Card>
          </div>
        )}

        {selectedDomain === 'land' && (
          <div className="p-3">
            <Card className="p-3 bg-amber-500/10 border-amber-500/30">
              <div className="flex items-center gap-2 text-amber-500">
                <Mountain className="h-4 w-4" />
                <span className="text-xs font-medium">Terrain Status</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Route clear. Bridge load limit: 20T.
              </p>
            </Card>
          </div>
        )}
      </ScrollArea>

      <div className="p-2 border-t border-panel-border flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Last updated: <span className="text-foreground font-medium">2 min ago</span>
        </p>
        <div className="flex items-center gap-1">
          {activeDomains.map((domain) => {
            const Icon = DOMAIN_ICONS[domain];
            return (
              <div key={domain} className={`p-1 rounded ${DOMAIN_BG[domain]}`}>
                <Icon className={`h-3 w-3 ${DOMAIN_COLORS[domain]}`} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
