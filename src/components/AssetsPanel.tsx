import { Search, ChevronDown, ChevronRight, Circle, Eye, MoreVertical, Star, Waves, Mountain, Cloud, Satellite, Hash } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { useState } from 'react';
interface Product {
  id: string;
  name: string;
  role: string;
  specs: {
    label: string;
    value: string;
  }[];
  status?: 'Active' | 'Standby' | 'Deployed' | 'Concept';
}
interface FleetSeries {
  id: string;
  name: string;
  type: string;
  products: Product[];
}
interface FleetDomain {
  id: string;
  name: string;
  tagline: string;
  icon: React.ReactNode;
  iconClassName: string;
  series: FleetSeries[];
}
const fleetDomains: FleetDomain[] = [{
  id: 'water',
  name: 'AQUA ASSETS',
  tagline: 'Maritime & Sub-Surface Systems',
  icon: <Waves className="h-4 w-4" />,
  iconClassName: 'text-sky-400',
  series: [{
    id: 'aqs',
    name: 'Aqua-Sentinel Series',
    type: 'USV - Surface ISR',
    products: [{
      id: 'AQS-100',
      name: 'Coastwatch',
      role: 'Harbor & coastal surveillance',
      specs: [{
        label: 'Endurance',
        value: '12-18 hrs'
      }, {
        label: 'Sensors',
        value: 'EO/IR camera, AIS receiver'
      }, {
        label: 'Navigation',
        value: 'GNSS + inertial'
      }, {
        label: 'Autonomy',
        value: 'Waypoint patrol, geo-fencing'
      }],
      status: 'Active'
    }, {
      id: 'AQS-200',
      name: 'Seaguard',
      role: 'Offshore patrol & escort',
      specs: [{
        label: 'Endurance',
        value: '24-36 hrs'
      }, {
        label: 'Sensors',
        value: 'EO/IR, surface radar'
      }, {
        label: 'Comms',
        value: 'RF + SAT relay (optional)'
      }],
      status: 'Active'
    }, {
      id: 'AQS-300',
      name: 'WaveShield',
      role: 'Swarm-based maritime awareness',
      specs: [{
        label: 'Endurance',
        value: '48 hrs'
      }, {
        label: 'Feature',
        value: 'Multi-USV cooperative patrol'
      }, {
        label: 'Doctrine',
        value: 'Distributed surface sensing'
      }],
      status: 'Deployed'
    }]
  }, {
    id: 'aqd',
    name: 'Aqua-Drill Series',
    type: 'AUV - Survey & Mapping',
    products: [{
      id: 'AQD-110',
      name: 'Bathyscan',
      role: 'Seabed mapping',
      specs: [{
        label: 'Depth Rating',
        value: '~300 m'
      }, {
        label: 'Sensors',
        value: 'Side-scan sonar'
      }, {
        label: 'Use',
        value: 'Bathymetry, terrain models'
      }],
      status: 'Active'
    }, {
      id: 'AQD-210',
      name: 'CableTrace',
      role: 'Underwater infrastructure inspection',
      specs: [{
        label: 'Sensors',
        value: 'High-res sonar + optical camera'
      }, {
        label: 'Use',
        value: 'Pipelines, subsea cables'
      }],
      status: 'Active'
    }, {
      id: 'AQD-310',
      name: 'GeoProbe',
      role: 'Subsurface anomaly detection',
      specs: [{
        label: 'Sensors',
        value: 'Advanced sonar fusion'
      }, {
        label: 'Use',
        value: 'Geological & strategic surveys'
      }],
      status: 'Standby'
    }]
  }, {
    id: 'aqs-x',
    name: 'Aqua-Shade Series',
    type: 'UUV - Covert ISR',
    products: [{
      id: 'AQS-X',
      name: 'SilentRay',
      role: 'Low-observable ISR',
      specs: [{
        label: 'Signature',
        value: 'Acoustic-reduced propulsion'
      }, {
        label: 'Endurance',
        value: 'Long-range cruise'
      }],
      status: 'Deployed'
    }, {
      id: 'AQS-XS',
      name: 'DeepGhost',
      role: 'Deep-water covert patrol',
      specs: [{
        label: 'Depth',
        value: 'Extended rating'
      }, {
        label: 'Feature',
        value: 'Passive sensing only'
      }],
      status: 'Active'
    }, {
      id: 'AQS-XT',
      name: 'DriftEye',
      role: 'Persistent underwater loiter',
      specs: [{
        label: 'Mode',
        value: 'Drift + periodic scan'
      }, {
        label: 'Doctrine',
        value: 'Awareness without exposure'
      }],
      status: 'Standby'
    }]
  }, {
    id: 'aqx',
    name: 'Aqua-Strike Series',
    type: 'Maritime Attack / Denial Systems',
    products: [{
      id: 'AQX-110',
      name: 'SeaLance',
      role: 'Precision surface strike (concept)',
      specs: [{
        label: 'Domain',
        value: 'Surface (USV-based)'
      }, {
        label: 'Doctrine',
        value: 'Stand-off maritime denial'
      }, {
        label: 'Mode',
        value: 'Network-assisted targeting, supervised autonomy'
      }],
      status: 'Concept'
    }, {
      id: 'AQX-210',
      name: 'DepthSpear',
      role: 'Sub-surface strike (concept)',
      specs: [{
        label: 'Domain',
        value: 'Sub-surface (AUV/UUV)'
      }, {
        label: 'Doctrine',
        value: 'Silent approach, decisive engagement'
      }, {
        label: 'Mode',
        value: 'Pre-planned mission execution'
      }],
      status: 'Concept'
    }, {
      id: 'AQX-310',
      name: 'HarborFang',
      role: 'Defensive maritime denial',
      specs: [{
        label: 'Domain',
        value: 'Littoral / Harbor'
      }, {
        label: 'Doctrine',
        value: 'Critical asset protection'
      }, {
        label: 'Mode',
        value: 'Area-restricted engagement logic'
      }],
      status: 'Concept'
    }]
  }]
}, {
  id: 'land',
  name: 'TERRA ASSETS',
  tagline: 'Land & Ground Systems',
  icon: <Mountain className="h-4 w-4" />,
  iconClassName: 'text-amber-600',
  series: [{
    id: 'trs',
    name: 'Terra-Sentinel Series',
    type: 'UGV - Security',
    products: [{
      id: 'TRS-100',
      name: 'Gatekeeper',
      role: 'Perimeter security',
      specs: [{
        label: 'Sensors',
        value: 'EO + thermal'
      }, {
        label: 'Mobility',
        value: 'Wheeled'
      }, {
        label: 'Autonomy',
        value: 'Patrol routes'
      }],
      status: 'Active'
    }, {
      id: 'TRS-200',
      name: 'Watchtower',
      role: 'Static / semi-mobile ISR',
      specs: [{
        label: 'Sensors',
        value: 'Pan-tilt EO/IR'
      }, {
        label: 'Feature',
        value: 'AI-based intrusion alerts'
      }],
      status: 'Active'
    }, {
      id: 'TRS-300',
      name: 'BorderHawk',
      role: 'Extended border patrol',
      specs: [{
        label: 'Sensors',
        value: 'EO/IR + radar cue'
      }, {
        label: 'Doctrine',
        value: 'Continuous land awareness'
      }],
      status: 'Deployed'
    }]
  }, {
    id: 'trd',
    name: 'Terra-Drill Series',
    type: 'Engineering & Recon',
    products: [{
      id: 'TRD-110',
      name: 'SoilScan',
      role: 'Terrain classification',
      specs: [{
        label: 'Sensors',
        value: 'Ground interaction sensors'
      }, {
        label: 'Use',
        value: 'Mobility planning'
      }],
      status: 'Active'
    }, {
      id: 'TRD-210',
      name: 'SubTerra',
      role: 'Subsurface analysis',
      specs: [{
        label: 'Sensors',
        value: 'GPR (concept grade)'
      }, {
        label: 'Use',
        value: 'Underground mapping'
      }],
      status: 'Concept'
    }, {
      id: 'TRD-310',
      name: 'RouteSense',
      role: 'Path & obstacle assessment',
      specs: [{
        label: 'Feature',
        value: 'AI terrain scoring'
      }, {
        label: 'Output',
        value: 'Route feasibility maps'
      }],
      status: 'Active'
    }]
  }, {
    id: 'trm',
    name: 'Terra-Mule Series',
    type: 'Logistics UGV',
    products: [{
      id: 'TRM-100',
      name: 'LoadBear',
      role: 'Light logistics support',
      specs: [{
        label: 'Payload',
        value: '~50-80 kg'
      }, {
        label: 'Mode',
        value: 'Follow-me / waypoint'
      }],
      status: 'Active'
    }, {
      id: 'TRM-200',
      name: 'TrailMate',
      role: 'Medium logistics support',
      specs: [{
        label: 'Payload',
        value: '~150 kg'
      }, {
        label: 'Feature',
        value: 'Convoy operations'
      }],
      status: 'Active'
    }, {
      id: 'TRM-300',
      name: 'IronAnt',
      role: 'Heavy autonomous resupply',
      specs: [{
        label: 'Payload',
        value: 'Modular'
      }, {
        label: 'Doctrine',
        value: 'Autonomous resupply mesh'
      }],
      status: 'Standby'
    }]
  }, {
    id: 'trx',
    name: 'Terra-Strike Series',
    type: 'Ground Attack / Combat Support',
    products: [{
      id: 'TRX-110',
      name: 'FireAnt',
      role: 'Mobile strike platform (concept)',
      specs: [{
        label: 'Domain',
        value: 'Ground (Wheeled UGV)'
      }, {
        label: 'Doctrine',
        value: 'Infantry force multiplier'
      }, {
        label: 'Mode',
        value: 'Remote + supervised autonomy'
      }],
      status: 'Concept'
    }, {
      id: 'TRX-210',
      name: 'IronClaw',
      role: 'Area denial & suppression',
      specs: [{
        label: 'Domain',
        value: 'Ground (Tracked UGV)'
      }, {
        label: 'Doctrine',
        value: 'Persistent ground dominance'
      }, {
        label: 'Feature',
        value: 'Stabilized engagement platform'
      }],
      status: 'Concept'
    }, {
      id: 'TRX-310',
      name: 'BreachFox',
      role: 'Assault support system',
      specs: [{
        label: 'Domain',
        value: 'Urban ground combat'
      }, {
        label: 'Doctrine',
        value: 'Close-terrain operations'
      }, {
        label: 'Feature',
        value: 'Compact, high-maneuverability chassis'
      }],
      status: 'Concept'
    }]
  }]
}, {
  id: 'air',
  name: 'SKY ASSETS',
  tagline: 'Aerial Systems',
  icon: <Cloud className="h-4 w-4" />,
  iconClassName: 'text-slate-300',
  series: [{
    id: 'ske',
    name: 'Sky-Eye Series',
    type: 'ISR UAVs',
    products: [{
      id: 'SKE-100',
      name: 'FalconEye',
      role: 'Short-range tactical ISR',
      specs: [{
        label: 'Type',
        value: 'Multirotor'
      }, {
        label: 'Endurance',
        value: '~45 min'
      }, {
        label: 'Sensors',
        value: 'EO/IR gimbal'
      }],
      status: 'Active'
    }, {
      id: 'SKE-200',
      name: 'EagleEye',
      role: 'Area surveillance',
      specs: [{
        label: 'Type',
        value: 'VTOL'
      }, {
        label: 'Endurance',
        value: '2-4 hrs'
      }, {
        label: 'Use',
        value: 'Area ISR'
      }],
      status: 'Active'
    }, {
      id: 'SKE-300',
      name: 'CondorEye',
      role: 'Persistent overwatch',
      specs: [{
        label: 'Type',
        value: 'Fixed-wing'
      }, {
        label: 'Endurance',
        value: '8+ hrs'
      }, {
        label: 'Doctrine',
        value: 'Persistent overwatch'
      }],
      status: 'Deployed'
    }]
  }, {
    id: 'skd',
    name: 'Sky-Drill Series',
    type: 'Mapping & Recon',
    products: [{
      id: 'SKD-110',
      name: 'TopoFly',
      role: '3D terrain modeling',
      specs: [{
        label: 'Payload',
        value: 'Photogrammetry camera'
      }, {
        label: 'Output',
        value: '3D terrain models'
      }],
      status: 'Active'
    }, {
      id: 'SKD-210',
      name: 'ThermaMap',
      role: 'Thermal analysis',
      specs: [{
        label: 'Payload',
        value: 'Thermal sensor'
      }, {
        label: 'Use',
        value: 'Heat signature analysis'
      }],
      status: 'Active'
    }, {
      id: 'SKD-310',
      name: 'LidarWing',
      role: 'Precision mapping',
      specs: [{
        label: 'Payload',
        value: 'LiDAR'
      }, {
        label: 'Use',
        value: 'Urban & forest mapping'
      }],
      status: 'Active'
    }]
  }, {
    id: 'sks',
    name: 'Sky-Shade Series',
    type: 'Low-Observable',
    products: [{
      id: 'SKS-X',
      name: 'NightHeron',
      role: 'Covert night ISR',
      specs: [{
        label: 'Signature',
        value: 'Low acoustic'
      }, {
        label: 'Use',
        value: 'Covert ISR'
      }],
      status: 'Deployed'
    }, {
      id: 'SKS-XS',
      name: 'GhostWing',
      role: 'Reduced visibility ops',
      specs: [{
        label: 'Signature',
        value: 'Reduced visual profile'
      }, {
        label: 'Mode',
        value: 'Autonomous loiter'
      }],
      status: 'Active'
    }, {
      id: 'SKS-XT',
      name: 'MistEye',
      role: 'First-look advantage',
      specs: [{
        label: 'Doctrine',
        value: 'First-look advantage'
      }, {
        label: 'Feature',
        value: 'Passive sensing bias'
      }],
      status: 'Standby'
    }]
  }, {
    id: 'skn',
    name: 'Sky-Swarm Nodes',
    type: 'Distributed Sensing',
    products: [{
      id: 'SKN-50',
      name: 'Swarmlet',
      role: 'Sensor node',
      specs: [{
        label: 'Role',
        value: 'Sensor node'
      }, {
        label: 'Network',
        value: 'Mesh'
      }],
      status: 'Active'
    }, {
      id: 'SKN-100',
      name: 'HiveNode',
      role: 'Relay + sensing',
      specs: [{
        label: 'Role',
        value: 'Relay + sensing'
      }, {
        label: 'Feature',
        value: 'Swarm coordination'
      }],
      status: 'Active'
    }, {
      id: 'SKN-200',
      name: 'QueenNode',
      role: 'Swarm manager',
      specs: [{
        label: 'Role',
        value: 'Swarm manager'
      }, {
        label: 'Use',
        value: 'Distributed ISR control'
      }],
      status: 'Deployed'
    }]
  }, {
    id: 'skx',
    name: 'Sky-Strike Series',
    type: 'Aerial Attack Systems',
    products: [{
      id: 'SKX-110',
      name: 'Raptor-A',
      role: 'Tactical strike UAV',
      specs: [{
        label: 'Domain',
        value: 'Air (UAV)'
      }, {
        label: 'Launch',
        value: 'Runway / VTOL variants'
      }, {
        label: 'Doctrine',
        value: 'Precision aerial strike'
      }],
      status: 'Concept'
    }, {
      id: 'SKX-210',
      name: 'Vajra-LM',
      role: 'Loitering munition (concept)',
      specs: [{
        label: 'Domain',
        value: 'Air'
      }, {
        label: 'Doctrine',
        value: 'Time-sensitive targeting'
      }, {
        label: 'Feature',
        value: 'Persistent loiter + terminal action'
      }],
      status: 'Concept'
    }, {
      id: 'SKX-310',
      name: 'StormWing',
      role: 'Coordinated strike UAV',
      specs: [{
        label: 'Domain',
        value: 'Air (Swarm-enabled)'
      }, {
        label: 'Doctrine',
        value: 'Saturation & overwhelm'
      }, {
        label: 'Feature',
        value: 'Multi-unit cooperative engagement'
      }],
      status: 'Concept'
    }]
  }]
}, {
  id: 'space',
  name: 'ORBITAL ASSETS',
  tagline: 'Space Systems',
  icon: <Satellite className="h-4 w-4" />,
  iconClassName: 'text-violet-400',
  series: [{
    id: 'ore',
    name: 'Orbital-Eye Series',
    type: 'EO/IR ISR',
    products: [{
      id: 'ORE-1',
      name: 'Vigil-LEO',
      role: 'Strategic imaging',
      specs: [{
        label: 'Orbit',
        value: 'Low Earth Orbit'
      }, {
        label: 'Payload',
        value: 'EO camera'
      }, {
        label: 'Use',
        value: 'Strategic imaging'
      }],
      status: 'Active'
    }, {
      id: 'ORE-2',
      name: 'Vigil-IR',
      role: 'Thermal change detection',
      specs: [{
        label: 'Payload',
        value: 'IR sensor'
      }, {
        label: 'Use',
        value: 'Thermal change detection'
      }],
      status: 'Active'
    }, {
      id: 'ORE-3',
      name: 'Vigil-HD',
      role: 'Precision imagery',
      specs: [{
        label: 'Payload',
        value: 'High-resolution EO'
      }, {
        label: 'Output',
        value: 'Precision imagery'
      }],
      status: 'Deployed'
    }]
  }, {
    id: 'orl',
    name: 'Orbital-Link Series',
    type: 'Communications',
    products: [{
      id: 'ORL-1',
      name: 'RelaySat',
      role: 'BLOS relay',
      specs: [{
        label: 'Role',
        value: 'BLOS relay'
      }, {
        label: 'Use',
        value: 'C2 backbone'
      }],
      status: 'Active'
    }, {
      id: 'ORL-2',
      name: 'MeshSat',
      role: 'Satellite mesh networking',
      specs: [{
        label: 'Role',
        value: 'Satellite mesh networking'
      }, {
        label: 'Feature',
        value: 'Redundant links'
      }],
      status: 'Active'
    }, {
      id: 'ORL-3',
      name: 'SecureLink',
      role: 'Encrypted comms',
      specs: [{
        label: 'Feature',
        value: 'Encrypted comms'
      }, {
        label: 'Doctrine',
        value: 'Resilient connectivity'
      }],
      status: 'Active'
    }]
  }, {
    id: 'ord',
    name: 'Orbital-Drill Series',
    type: 'Experimental / Tech-Demo',
    products: [{
      id: 'ORD-X',
      name: 'SensorLab',
      role: 'Payload testbed',
      specs: [{
        label: 'Role',
        value: 'Payload testbed'
      }, {
        label: 'Use',
        value: 'New sensors'
      }],
      status: 'Concept'
    }, {
      id: 'ORD-AI',
      name: 'OrbitMind',
      role: 'On-orbit AI inference',
      specs: [{
        label: 'Feature',
        value: 'On-orbit AI inference'
      }, {
        label: 'Use',
        value: 'Edge analytics'
      }],
      status: 'Concept'
    }, {
      id: 'ORD-T',
      name: 'Trailblazer',
      role: 'Tech validation',
      specs: [{
        label: 'Role',
        value: 'Tech validation'
      }, {
        label: 'Doctrine',
        value: 'Future-capability incubation'
      }],
      status: 'Concept'
    }]
  }, {
    id: 'orx',
    name: 'Orbital-Strike Series',
    type: 'Counter-Space / Strategic Deterrence',
    products: [{
      id: 'ORX-110',
      name: 'Sentinel-X',
      role: 'Counter-space capability (concept)',
      specs: [{
        label: 'Domain',
        value: 'Space'
      }, {
        label: 'Doctrine',
        value: 'Strategic deterrence'
      }, {
        label: 'Focus',
        value: 'Space control awareness'
      }],
      status: 'Concept'
    }, {
      id: 'ORX-210',
      name: 'Aegis-Orb',
      role: 'Orbital asset defense',
      specs: [{
        label: 'Domain',
        value: 'Space'
      }, {
        label: 'Doctrine',
        value: 'Space infrastructure protection'
      }, {
        label: 'Focus',
        value: 'Defensive posture'
      }],
      status: 'Concept'
    }, {
      id: 'ORX-310',
      name: 'Kinetic-Null',
      role: 'Non-kinetic orbital neutralization',
      specs: [{
        label: 'Domain',
        value: 'Space'
      }, {
        label: 'Doctrine',
        value: 'Escalation-controlled response'
      }, {
        label: 'Focus',
        value: 'Reversible effects'
      }],
      status: 'Concept'
    }]
  }]
}];
interface AssetsPanelProps {
  hideHeader?: boolean;
  onAssetClick?: (asset: any) => void;
}
const getStatusColor = (status: string) => {
  switch (status) {
    case 'Active':
      return 'fill-emerald-500 text-emerald-500';
    case 'Deployed':
      return 'fill-blue-500 text-blue-500';
    case 'Standby':
      return 'fill-amber-500 text-amber-500';
    case 'Concept':
      return 'fill-purple-500 text-purple-500';
    default:
      return 'fill-muted-foreground text-muted-foreground';
  }
};
const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'Active':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'Deployed':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'Standby':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'Concept':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    default:
      return '';
  }
};
export const AssetsPanel = ({
  hideHeader = false,
  onAssetClick
}: AssetsPanelProps) => {
  const [expandedDomains, setExpandedDomains] = useState<string[]>([]);
  const [expandedSeries, setExpandedSeries] = useState<string[]>([]);
  const toggleDomain = (domainId: string) => {
    setExpandedDomains(prev => prev.includes(domainId) ? prev.filter(id => id !== domainId) : [...prev, domainId]);
  };
  const toggleSeries = (seriesId: string) => {
    setExpandedSeries(prev => prev.includes(seriesId) ? prev.filter(id => id !== seriesId) : [...prev, seriesId]);
  };
  const totalProducts = fleetDomains.reduce((acc, d) => acc + d.series.reduce((sAcc, s) => sAcc + s.products.length, 0), 0);
  const orderedDomains = (['air', 'land', 'water', 'space'] as const)
    .map(id => fleetDomains.find(domain => domain.id === id))
    .filter((domain): domain is FleetDomain => Boolean(domain));
  return <div className="h-full flex flex-col">
      {!hideHeader && <div className="p-3 border-b border-panel-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Assets</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Star className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search assets..." className="pl-8 bg-secondary border-border text-xs h-8" />
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start mt-2 text-xs h-7">
          Filters
        </Button>
      </div>}

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {/* Asset Domains */}
          {orderedDomains.map(domain => <div key={domain.id} className="border border-border/50 rounded-lg overflow-hidden">
              {/* Domain Header */}
              <button onClick={() => toggleDomain(domain.id)} className="w-full flex items-center gap-2 p-2 bg-secondary/30 hover:bg-secondary/50 transition-colors">
                {expandedDomains.includes(domain.id) ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <span className={domain.iconClassName}>{domain.icon}</span>
                <div className="flex-1 text-left">
                  <span className="text-xs font-semibold text-foreground">{domain.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">- {domain.tagline}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {domain.series.reduce((acc, s) => acc + s.products.length, 0)}
                </Badge>
              </button>

              {/* Domain Content - Series */}
              {expandedDomains.includes(domain.id) && <div className="p-2 space-y-2">
                  {domain.series.map((series, seriesIndex) => <div key={series.id} className="border border-border/30 rounded-md overflow-hidden bg-background/30">
                      {/* Series Header */}
                      <button onClick={() => toggleSeries(series.id)} className="w-full flex items-center gap-2 p-2 hover:bg-secondary/30 transition-colors">
                        {expandedSeries.includes(series.id) ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" /> : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />}
                        <span className="flex items-center gap-1 text-[10px] text-primary font-medium">
                          <Hash className="h-3 w-3" />
                          <span>{seriesIndex + 1}</span>
                        </span>
                        <div className="flex-1 text-left">
                          <span className="text-[11px] font-semibold text-foreground">{series.name}</span>
                          <span className="text-[9px] text-muted-foreground ml-1">({series.type})</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-border/50">
                          {series.products.length}
                        </Badge>
                      </button>

                      {/* Products */}
                      {expandedSeries.includes(series.id) && <div className="px-2 pb-2 space-y-1.5">
                          {series.products.map(product => <div key={product.id} className="p-2 rounded bg-secondary/20 hover:bg-secondary/40 cursor-pointer border border-border/20 transition-colors" onClick={() => onAssetClick?.(product)}>
                              <div className="flex items-start gap-2">
                                <Circle className={`h-2 w-2 mt-1.5 flex-shrink-0 ${getStatusColor(product.status || 'Active')}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                    <span className="text-[10px] font-bold text-foreground">{product.id}</span>
                                    <span className="text-[10px] font-semibold text-primary">"{product.name}"</span>
                                    {product.status && <Badge className={`text-[8px] h-3 px-1 border ${getStatusBadgeVariant(product.status)}`}>
                                        {product.status}
                                      </Badge>}
                                  </div>
                                  <p className="text-[9px] text-muted-foreground mb-1.5">{product.role}</p>
                                  <div className="space-y-0.5">
                                    {product.specs.map((spec, i) => <div key={i} className="flex items-start gap-1 text-[8px]">
                                        <span className="text-foreground/50 shrink-0">{'>'}</span>
                                        <span className="text-foreground/70 shrink-0">{spec.label}:</span>
                                        <span className="text-muted-foreground">{spec.value}</span>
                                      </div>)}
                                  </div>
                                </div>
                              </div>
                            </div>)}
                        </div>}
                    </div>)}
                </div>}
            </div>)}

        </div>
      </ScrollArea>

      <div className="p-2 border-t border-panel-border">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">{totalProducts}</span> Total Assets
          </p>
          <p className="text-[10px] text-primary/60">Water {'<->'} Land {'<->'} Air {'<->'} Space</p>
        </div>
      </div>
    </div>;
};



