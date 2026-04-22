import { type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line as DreiLine, OrbitControls as FiberOrbitControls, useGLTF } from '@react-three/drei';
import droneQuadSvg from '@/assets/drone-quadcopter.svg';
import {
  Activity,
  Camera,
  Crosshair,
  Database,
  Diamond,
  Edit3,
  Eraser,
  MousePointer2,
  Maximize2,
  MoreVertical,
  MoreHorizontal,
  Move,
  Orbit,
  PanelsTopLeft,
  Play,
  Printer,
  Radar,
  RefreshCcw,
  Satellite,
  ScanLine,
  Signal,
  Settings2,
  Video,
  Waves,
  Wifi,
} from 'lucide-react';
import * as THREE from 'three';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';

const API_BASE = import.meta.env.VITE_CHAOX_API_BASE || 'http://localhost:9000';
const DEFAULT_WS_BASE = import.meta.env.VITE_CHAOX_WS_BASE || 'ws://localhost:9000';
const DEFAULT_LIVE_FEED_URL = `${DEFAULT_WS_BASE}/camera`;
const DEFAULT_TELEMETRY_URL = `${DEFAULT_WS_BASE}/ws/telemetry`;

type VisualProbe = {
  valid?: boolean;
  source_root?: string;
};

type ApcResult = {
  frame_id?: string | null;
  timestamp?: string | null;
  lat?: number | null;
  lon?: number | null;
  alt?: number | null;
  yaw?: number | null;
  confidence?: number | null;
  error_radius_m?: number | null;
  source?: string | null;
  meta?: {
    matched_image?: string | null;
    num_inliers?: number | null;
    visual_localization_error?: string | null;
    debug?: ApcDebugArtifacts | null;
  } | null;
};

type ApcDebugArtifacts = {
  mode?: string | null;
  matched_image?: string | null;
  num_inliers?: number | null;
  query_image_b64?: string | null;
  reference_image_b64?: string | null;
  match_image_b64?: string | null;
};

type ImuSample = {
  t: string;
  gyro: number;
  accel: number;
};

type ErrorSample = {
  t: string;
  horizontal: number;
  vertical: number;
  mean: number;
};

type TrackSample = {
  x: number;
  coarse: number;
  fused: number;
  truth: number;
  scatter: number;
};

const panelShell =
  'rounded-xl border border-slate-700/70 bg-slate-950/80 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur';

const paneIconButton =
  'inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700/80 bg-slate-900/80 text-slate-300 transition hover:border-slate-500 hover:text-white';

const miniToolbarButton =
  'inline-flex h-5 w-5 items-center justify-center rounded border border-slate-700/70 bg-slate-950/90 text-slate-400 transition hover:border-slate-500 hover:text-white';

const statusClasses: Record<'ready' | 'warn' | 'error' | 'idle', string> = {
  ready: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-100',
  warn: 'border-amber-500/30 bg-amber-500/12 text-amber-100',
  error: 'border-rose-500/30 bg-rose-500/12 text-rose-100',
  idle: 'border-slate-700/80 bg-slate-900/80 text-slate-300',
};

const classifyStatus = (value: string | null | undefined): 'ready' | 'warn' | 'error' | 'idle' => {
  if (!value) return 'idle';
  const normalized = value.toLowerCase();
  if (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('invalid') ||
    normalized.includes('missing') ||
    normalized.includes('disconnected') ||
    normalized.includes('no coordinates')
  ) {
    return 'error';
  }
  if (
    normalized.includes('waiting') ||
    normalized.includes('pending') ||
    normalized.includes('standby') ||
    normalized.includes('loading')
  ) {
    return 'warn';
  }
  return 'ready';
};

const formatNumber = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';

const toDataImageSrc = (imageB64: string | null | undefined) =>
  imageB64 ? `data:image/jpeg;base64,${imageB64}` : null;

const buildImuSeries = () =>
  Array.from({ length: 40 }, (_, index) => ({
    t: `${index}`,
    gyro: 1.8 + Math.sin(index / 4) * 0.35 + Math.cos(index / 7) * 0.15,
    accel: -9 + Math.cos(index / 5) * 2.4 + Math.sin(index / 8) * 0.5,
  }));

const buildErrorSeries = () =>
  Array.from({ length: 40 }, (_, index) => ({
    t: `${index}`,
    horizontal: 18 + Math.sin(index / 3) * 6 + (index % 13 === 0 ? 12 : 0),
    vertical: 1.2 + Math.cos(index / 4) * 0.8,
    mean: 24 + Math.sin(index / 5) * 4 + (index % 11 === 0 ? 8 : 0),
  }));

const buildTrackSeries = (offset = 0) =>
  Array.from({ length: 28 }, (_, index) => {
    const x = index;
    const truth = 84 - index * 2.1;
    const fused = truth + Math.sin((index + offset) / 5) * 1.8;
    const coarse = truth + 2.8 + Math.cos((index + offset) / 4) * 2.4;
    const scatter = truth + Math.sin((index + offset) / 2.6) * 9 + (index % 7 === 0 ? -7 : 0);
    return { x, coarse, fused, truth, scatter };
  });

const feedTexture = (variant: 1 | 2 | 3 | 4) => {
  const palettes = {
    1: 'from-slate-100/90 via-slate-500/55 to-slate-950/95',
    2: 'from-stone-100/85 via-slate-400/45 to-slate-950/95',
    3: 'from-zinc-200/85 via-slate-500/40 to-slate-950/95',
    4: 'from-slate-200/85 via-zinc-500/40 to-slate-950/95',
  };
  return palettes[variant];
};

type ScenePoint = [number, number, number];
type ApcGroundMapState = {
  texture: THREE.CanvasTexture | null;
  planeSize: number;
  status: string;
  source: 'offline' | 'online' | 'none';
};

const APC_GROUND_TILE = { tileSize: 256, grid: 3 };
const APC_DEFAULT_COORDS = { lat: 12.8874283, lon: 77.6419887 };
const APC_TILE_TEMPLATES: Record<'satellite' | 'streets' | 'terrain' | 'dark', string> = {
  satellite: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  streets: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  terrain: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
  dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png',
};

const loadImageFromBlob = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Tile image decode failed'));
    };
    image.src = objectUrl;
  });

const buildRemoteTileUrl = (mapType: keyof typeof APC_TILE_TEMPLATES, z: number, x: number, y: number) =>
  APC_TILE_TEMPLATES[mapType]
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

const tileFromCoords = (lat: number, lon: number, zoom: number) => {
  const boundedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (boundedLat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y, z: zoom };
};

const MapTilePreview = ({
  lat,
  lon,
  zoom,
  className = '',
  grayscale = false,
}: {
  lat: number;
  lon: number;
  zoom: number;
  className?: string;
  grayscale?: boolean;
}) => {
  const [useRemote, setUseRemote] = useState(false);
  const tile = useMemo(() => tileFromCoords(lat, lon, zoom), [lat, lon, zoom]);
  const backendUrl = `${API_BASE}/tiles/satellite/${tile.z}/${tile.x}/${tile.y}.png`;
  const remoteUrl = buildRemoteTileUrl('satellite', tile.z, tile.x, tile.y);

  useEffect(() => {
    setUseRemote(false);
  }, [backendUrl, remoteUrl]);

  return (
    <img
      src={useRemote ? remoteUrl : backendUrl}
      alt="Map preview"
      className={`${className} ${grayscale ? 'grayscale contrast-125 brightness-90' : ''}`}
      onError={() => {
        if (!useRemote) {
          setUseRemote(true);
        }
      }}
    />
  );
};

const useApcGroundMap = ({
  lat,
  lon,
  zoom,
  mapType,
}: {
  lat: number;
  lon: number;
  zoom: number;
  mapType: keyof typeof APC_TILE_TEMPLATES;
}) => {
  const [state, setState] = useState<ApcGroundMapState>({
    texture: null,
    planeSize: 2600,
    status: 'Map: idle',
    source: 'none',
  });

  useEffect(() => {
    let cancelled = false;

    const loadGroundMap = async () => {
      const { tileSize, grid } = APC_GROUND_TILE;
      const boundedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
      const latRad = (boundedLat * Math.PI) / 180;
      const n = 2 ** zoom;
      const centerX = Math.floor(((lon + 180) / 360) * n);
      const centerY = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
      );
      const half = Math.floor(grid / 2);

      const canvas = document.createElement('canvas');
      canvas.width = tileSize * grid;
      canvas.height = tileSize * grid;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#07101c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(23, 59, 115, 0.45)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvas.width; x += tileSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += tileSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      let loadedCount = 0;
      let offlineCount = 0;
      const totalTiles = grid * grid;

      const loadTile = async (tx: number, ty: number) => {
        const drawX = (tx - centerX + half) * tileSize;
        const drawY = (ty - centerY + half) * tileSize;
        const offlineUrl = `${API_BASE}/tiles/${mapType}/${zoom}/${tx}/${ty}.png`;
        const remoteUrl = buildRemoteTileUrl(mapType, zoom, tx, ty);

        try {
          let response = await fetch(offlineUrl);
          let source: 'offline' | 'online' = 'offline';

          if (!response.ok) {
            response = await fetch(remoteUrl, { mode: 'cors' });
            source = 'online';
          }
          if (!response.ok) return;

          const blob = await response.blob();
          const image = await loadImageFromBlob(blob);
          ctx.drawImage(image, drawX, drawY, tileSize, tileSize);
          loadedCount += 1;
          if (source === 'offline') offlineCount += 1;
        } catch {
          // Leave placeholder grid cell when this tile is unavailable.
        }
      };

      const loads: Promise<void>[] = [];
      for (let dy = -half; dy <= half; dy += 1) {
        for (let dx = -half; dx <= half; dx += 1) {
          loads.push(loadTile(centerX + dx, centerY + dy));
        }
      }

      await Promise.all(loads);
      if (cancelled) return;

      if (loadedCount === 0) {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MAP DATA UNAVAILABLE', canvas.width / 2, canvas.height / 2);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = 4;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      const earthRadius = 6378137;
      const metersPerPixel = (Math.cos((boundedLat * Math.PI) / 180) * 2 * Math.PI * earthRadius) / (tileSize * 2 ** zoom);
      const planeSize = metersPerPixel * tileSize * grid;
      const activeSource: 'offline' | 'online' | 'none' =
        loadedCount === 0 ? 'none' : offlineCount === loadedCount ? 'offline' : offlineCount > 0 ? 'offline' : 'online';
      const sourceLabel =
        loadedCount === 0 ? 'unavailable' : activeSource === 'offline' ? 'offline cache' : 'online tiles';

      setState((previous) => {
        previous.texture?.dispose();
        return {
          texture,
          planeSize,
          source: activeSource,
          status: `Map: ${loadedCount}/${totalTiles} tiles • ${sourceLabel} • z${zoom}`,
        };
      });
    };

    void loadGroundMap();

    return () => {
      cancelled = true;
    };
  }, [lat, lon, mapType, zoom]);

  return state;
};

const projectTrackPoint = (x: number, value: number, yBias = 0): ScenePoint => {
  const centeredX = (x - 13.5) * 1.55;
  const depth = (value - 52) * 0.44;
  const elevation = -3 + (value - 48) * 0.05 + yBias;
  return [centeredX, elevation, depth];
};

const buildTrackPath = (series: TrackSample[], key: keyof Pick<TrackSample, 'coarse' | 'truth' | 'fused'>, yBias = 0) =>
  series.map((sample) => projectTrackPoint(sample.x, sample[key], yBias));

const buildScatterCloud = (series: TrackSample[]) =>
  series.map((sample) => projectTrackPoint(sample.x, sample.scatter, 0.65 + Math.sin(sample.x / 3) * 0.35));

const ApcDroneMarker = ({
  position,
  heading,
}: {
  position: ScenePoint;
  heading: number;
}) => {
  const groupRef = useRef<THREE.Group | null>(null);
  const { scene } = useGLTF('/assets/uav/drone.glb');
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const { scale, offset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    return {
      scale: maxDim > 0 ? 2.6 / maxDim : 1,
      offset: center.clone().multiplyScalar(-1),
    };
  }, [cloned]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.set(position[0], position[1] + Math.sin(clock.elapsedTime * 1.5) * 0.08, position[2]);
    groupRef.current.rotation.y = heading;
  });

  return (
    <group ref={groupRef} position={position}>
      <primitive object={cloned} position={[offset.x, offset.y, offset.z]} scale={scale} rotation={[0, Math.PI, 0]} />
      <mesh position={[0, -0.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.15, 48]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const ApcTrajectoryScene = ({
  trackSeries,
  groundTexture,
  groundPlaneSize,
}: {
  trackSeries: TrackSample[];
  groundTexture: THREE.Texture | null;
  groundPlaneSize: number;
}) => {
  const coarsePath = useMemo(() => buildTrackPath(trackSeries, 'coarse', 0.1), [trackSeries]);
  const truthPath = useMemo(() => buildTrackPath(trackSeries, 'truth', -0.05), [trackSeries]);
  const fusedPath = useMemo(() => buildTrackPath(trackSeries, 'fused', 0.25), [trackSeries]);
  const scatterCloud = useMemo(() => buildScatterCloud(trackSeries), [trackSeries]);
  const dronePoint = fusedPath[fusedPath.length - 1] ?? [0, -2.2, 0];
  const previousDronePoint = fusedPath[fusedPath.length - 2] ?? dronePoint;
  const heading = Math.atan2(dronePoint[2] - previousDronePoint[2], dronePoint[0] - previousDronePoint[0]);

  return (
    <Canvas className="h-full w-full" dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={['#07101c']} />
      <fog attach="fog" args={['#07101c', 20, 68]} />
      <ambientLight intensity={1.05} />
      <directionalLight position={[18, 18, 6]} intensity={1.4} color="#dbeafe" />
      <directionalLight position={[-12, 9, -16]} intensity={0.8} color="#67e8f9" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.7, 0]} receiveShadow>
        <planeGeometry args={[groundPlaneSize, groundPlaneSize, 1, 1]} />
        <meshStandardMaterial
          color="#081423"
          roughness={0.96}
          metalness={0.05}
          map={groundTexture}
        />
      </mesh>

      <gridHelper args={[groundPlaneSize, 42, '#173b73', '#10243f']} position={[0, -3.68, 0]} />

      <DreiLine points={[[-22, -3.66, 0], [22, -3.66, 0]]} color="#143454" lineWidth={0.8} />
      <DreiLine points={[[0, -3.66, -18], [0, -3.66, 18]]} color="#143454" lineWidth={0.8} />
      <DreiLine points={coarsePath} color="#ef4444" lineWidth={2.2} />
      <DreiLine points={truthPath} color="#f59e0b" lineWidth={1.8} />
      <DreiLine points={fusedPath} color="#4ade80" lineWidth={2.8} />

      {scatterCloud.map((point, index) => (
        <mesh key={`${point.join('-')}-${index}`} position={point}>
          <sphereGeometry args={[0.23, 16, 16]} />
          <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.3} />
        </mesh>
      ))}

      <mesh position={truthPath[0]} castShadow>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={coarsePath[0]} castShadow>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshStandardMaterial color="#fb7185" emissive="#ef4444" emissiveIntensity={0.4} />
      </mesh>

      <Suspense fallback={null}>
        <ApcDroneMarker position={dronePoint} heading={heading} />
      </Suspense>

      <FiberOrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        target={[0, -2.6, 0]}
        minDistance={12}
        maxDistance={44}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
};

const PaneActionBar = ({
  compact = false,
}: {
  compact?: boolean;
}) => (
  <div className={`flex items-center gap-1 ${compact ? '' : 'ml-2'}`}>
    <button type="button" className={paneIconButton} title="Panel list">
      <PanelsTopLeft className="h-3.5 w-3.5" />
    </button>
    <button type="button" className={paneIconButton} title="Start stream">
      <Play className="h-3.5 w-3.5" />
    </button>
    <button type="button" className={paneIconButton} title="Screenshot">
      <Camera className="h-3.5 w-3.5" />
    </button>
    <button type="button" className={paneIconButton} title="Print">
      <Printer className="h-3.5 w-3.5" />
    </button>
    <button type="button" className={paneIconButton} title="Settings">
      <Settings2 className="h-3.5 w-3.5" />
    </button>
    <button type="button" className={paneIconButton} title="Expand">
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
    <button type="button" className={paneIconButton} title="More">
      <MoreHorizontal className="h-3.5 w-3.5" />
    </button>
  </div>
);

const PaneFooterBar = ({
  labels,
}: {
  labels: string[];
}) => (
  <div className="flex items-center border-t border-slate-800/80 px-2 py-1.5">
    <div className="flex items-center gap-1.5">
      {labels.map((label) => (
        <div
          key={label}
          className="rounded border border-slate-800/80 bg-slate-900/80 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400"
        >
          {label}
        </div>
      ))}
    </div>
  </div>
);

const InlineToolStrip = () => (
  <div className="flex items-center gap-1">
    <button type="button" className={miniToolbarButton} title="Panel list">
      <PanelsTopLeft className="h-3 w-3" />
    </button>
    <button type="button" className={miniToolbarButton} title="Play">
      <Play className="h-3 w-3" />
    </button>
    <button type="button" className={miniToolbarButton} title="Screenshot">
      <Camera className="h-3 w-3" />
    </button>
    <button type="button" className={miniToolbarButton} title="Settings">
      <Settings2 className="h-3 w-3" />
    </button>
    <button type="button" className={miniToolbarButton} title="More">
      <MoreHorizontal className="h-3 w-3" />
    </button>
  </div>
);

const FloatingVerticalToolbar = () => (
  <>
    <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
      <button type="button" className={miniToolbarButton} title="Expand">
        <Maximize2 className="h-3 w-3" />
      </button>
      <button type="button" className={miniToolbarButton} title="Settings">
        <Settings2 className="h-3 w-3" />
      </button>
      <button type="button" className={miniToolbarButton} title="More">
        <MoreVertical className="h-3 w-3" />
      </button>
    </div>
    <div className="absolute right-3 top-16 z-20 flex flex-col gap-3">
      <button type="button" className={miniToolbarButton} title="Pointer">
        <MousePointer2 className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={miniToolbarButton} title="Orbit">
        <Orbit className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={miniToolbarButton} title="Erase">
        <Eraser className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={miniToolbarButton} title="Target">
        <Crosshair className="h-3.5 w-3.5" />
      </button>
    </div>
  </>
);

const PreviewSurface = ({
  src,
  alt,
  className = '',
  fallback,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <>{fallback}</>;
  }

  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
};

const FeedPane = ({
  title,
  subtitle,
  variant,
  imageSrc,
  footerLabels,
}: {
  title: string;
  subtitle: string;
  variant: 1 | 2 | 3 | 4;
  imageSrc?: string | null;
  footerLabels: string[];
}) => (
  <div className={`${panelShell} relative overflow-hidden`}>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_42%),linear-gradient(25deg,rgba(255,255,255,0.05),transparent_35%)]" />
    <div className={`absolute inset-0 bg-gradient-to-br ${feedTexture(variant)}`} />
    <div className="absolute inset-0 opacity-55 mix-blend-screen [background-image:repeating-linear-gradient(15deg,rgba(255,255,255,0.22)_0,rgba(255,255,255,0.22)_2px,transparent_2px,transparent_28px),repeating-linear-gradient(120deg,rgba(0,0,0,0.18)_0,rgba(0,0,0,0.18)_9px,transparent_9px,transparent_54px)]" />
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-700/80 px-3 py-2 text-[11px] text-slate-200">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate">{title}</span>
          <span className="text-slate-400">{subtitle}</span>
        </div>
        <PaneActionBar />
      </div>
      <div className="relative flex-1 overflow-hidden">
        <PreviewSurface
          src={imageSrc}
          alt={title}
          className="h-full w-full object-cover opacity-90"
          fallback={<div className="h-full w-full opacity-80 [background-image:radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.22),transparent_18%),radial-gradient(circle_at_30%_70%,rgba(255,255,255,0.12),transparent_14%)]" />}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(2,6,23,0.18))]" />
      </div>
      <PaneFooterBar labels={footerLabels} />
    </div>
  </div>
);

const LocalizationMatchDashboard = ({
  lat,
  lon,
  zoom,
  backendLabel,
  debug,
  liveFrameUrl,
  matchStatus,
}: {
  lat: number;
  lon: number;
  zoom: number;
  backendLabel: string;
  debug?: ApcDebugArtifacts | null;
  liveFrameUrl?: string | null;
  matchStatus?: string | null;
}) => (
  <div className={`${panelShell} relative min-h-0 overflow-hidden`}>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(56,189,248,0.14),transparent_22%),radial-gradient(circle_at_88%_14%,rgba(148,163,184,0.16),transparent_18%),linear-gradient(180deg,rgba(2,6,23,0.94),rgba(4,10,22,0.98))]" />
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-700/70 px-3 py-2 text-[11px] text-slate-200">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate">Localization Flow</span>
          <span className="text-slate-400">query → reference → geo-db</span>
        </div>
        <PaneActionBar />
      </div>
      <div className="relative flex-1 overflow-hidden p-4">
        <div className="absolute left-[18%] top-5 z-10 flex flex-col items-center gap-2">
          <div className="rounded-full border border-slate-700/80 bg-white/95 p-3 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
            <img src={droneQuadSvg} alt="Drone" className="h-10 w-10 opacity-85" />
          </div>
          <div className="rounded-full border border-cyan-500/20 bg-slate-950/80 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-200">
            Query Drone
          </div>
        </div>

        <div className="absolute right-[18%] top-5 z-10 flex flex-col items-center gap-2">
          <div className="rounded-full border border-slate-700/80 bg-slate-950/85 p-3 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
            <Satellite className="h-8 w-8 text-slate-100" />
          </div>
          <div className="rounded-full border border-emerald-500/20 bg-slate-950/80 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-200">
            Geo DB
          </div>
        </div>

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="match-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#eab308" />
              <stop offset="48%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
          </defs>
          <line x1="18" y1="20" x2="26" y2="52" stroke="rgba(255,255,255,0.45)" strokeDasharray="1.5 1.5" />
          <line x1="18" y1="20" x2="44" y2="52" stroke="rgba(255,255,255,0.45)" strokeDasharray="1.5 1.5" />
          <line x1="82" y1="20" x2="74" y2="52" stroke="rgba(255,255,255,0.45)" strokeDasharray="1.5 1.5" />
          <line x1="82" y1="20" x2="56" y2="52" stroke="rgba(255,255,255,0.35)" strokeDasharray="1.5 1.5" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
            const y1 = 54 + index * 2.8;
            const y2 = 58 + ((index * 1.9) % 18);
            const hue = index % 3 === 0 ? '#facc15' : index % 3 === 1 ? '#ef4444' : '#4ade80';
            return (
              <line
                key={index}
                x1="12"
                y1={String(y1)}
                x2="58"
                y2={String(y2)}
                stroke={hue}
                strokeWidth="0.42"
                strokeOpacity="0.95"
              />
            );
          })}
        </svg>

        <div className="absolute bottom-6 left-4 z-10 w-[31%] overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/85 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          <div className="relative aspect-[1.08/0.68]">
            <PreviewSurface
              src={toDataImageSrc(debug?.query_image_b64) ?? liveFrameUrl}
              alt="Query frame"
              className="h-full w-full object-cover"
              fallback={<div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(148,163,184,0.18),transparent_22%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.98))]" />}
            />
            <div className="absolute inset-0 bg-[linear-gradient(25deg,rgba(0,0,0,0.28),transparent_38%)]" />
            <div className="absolute left-3 top-3 rounded bg-slate-950/80 px-2 py-1 text-[10px] text-white">
              {backendLabel}
            </div>
          </div>
          <div className="border-t border-slate-700/80 bg-slate-950/92 px-3 py-2 text-[11px] leading-tight text-white">
            Real-time drone image
            <div className="text-slate-300">(approx. 120 m alt.)</div>
          </div>
        </div>

        <div className="absolute bottom-6 right-4 z-10 w-[31%] overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/85 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          <div className="relative aspect-[1.08/0.68]">
            <PreviewSurface
              src={toDataImageSrc(debug?.reference_image_b64)}
              alt="Reference satellite image"
              className="h-full w-full object-cover"
              fallback={<MapTilePreview lat={lat} lon={lon} zoom={zoom} className="h-full w-full object-cover" grayscale />}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.22))]" />
          </div>
          <div className="border-t border-slate-700/80 bg-slate-950/92 px-3 py-2 text-[11px] leading-tight text-white">
            Reference satellite image
            <div className="text-slate-300">(approx. 500 m alt.)</div>
          </div>
        </div>

        <div className="absolute left-1/2 top-[34%] z-20 w-[26%] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/90 shadow-[0_18px_40px_rgba(0,0,0,0.4)]">
          <div className="border-b border-slate-700/80 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-slate-300">
            Live Match Overlay
          </div>
          <div className="relative aspect-[1.3/0.72] overflow-hidden bg-slate-950">
            <PreviewSurface
              src={toDataImageSrc(debug?.match_image_b64)}
              alt="Match visualization"
              className="h-full w-full object-contain"
              fallback={<div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">{matchStatus || 'Waiting for live localization output.'}</div>}
            />
          </div>
          <div className="flex items-center justify-between border-t border-slate-700/80 px-3 py-2 text-[10px] text-slate-300">
            <span>{debug?.matched_image || 'No matched tile yet'}</span>
            <span>{debug?.num_inliers ? `${debug.num_inliers} inliers` : 'No inliers yet'}</span>
          </div>
        </div>
      </div>
      <PaneFooterBar labels={['query', 'match', 'geo-db']} />
    </div>
  </div>
);

const MatchPane = ({
  title,
  density,
}: {
  title: string;
  density: number;
}) => (
  <div className={`${panelShell} relative overflow-hidden`}>
    <div className="absolute inset-0 bg-gradient-to-br from-slate-700/70 via-slate-300/20 to-slate-950/95" />
    <div
      className="absolute inset-0 opacity-80"
      style={{
        backgroundImage: `repeating-linear-gradient(${density}deg, rgba(255,255,255,0.72) 0, rgba(255,255,255,0.72) 2px, transparent 2px, transparent 16px)`,
      }}
    />
    <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-slate-700/70 px-3 py-2 text-[11px] text-slate-200">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate">{title}</span>
        <span className="text-slate-400">feature_matching/image</span>
      </div>
      <PaneActionBar />
    </div>
  </div>
);

const StatStrip = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'ready' | 'warn' | 'error' | 'idle';
}) => (
  <div className={`flex h-full flex-col justify-center rounded-xl border px-3 ${statusClasses[tone]}`}>
    <div className="text-[10px] uppercase tracking-[0.14em]">{label}</div>
    <div className="mt-1 text-xl font-semibold">{value}</div>
  </div>
);

export const ApcDashboardPanel = () => {
  const sourceFeedSocketRef = useRef<WebSocket | null>(null);
  const backendFeedSocketRef = useRef<WebSocket | null>(null);
  const apcSocketRef = useRef<WebSocket | null>(null);
  const apcLoopRef = useRef<number | null>(null);
  const apcSendBusyRef = useRef(false);
  const apcManualStopRef = useRef(false);
  const [tileMatcherBackend, setTileMatcherBackend] = useState('native');
  const [visualMapDbPath, setVisualMapDbPath] = useState('');
  const [visualProbe, setVisualProbe] = useState<VisualProbe | null>(null);
  const [visualStatus, setVisualStatus] = useState<string | null>(null);
  const [visualBusy, setVisualBusy] = useState(false);
  const [liveFeedUrlInput, setLiveFeedUrlInput] = useState(DEFAULT_LIVE_FEED_URL);
  const [liveFeedUrlSaved, setLiveFeedUrlSaved] = useState<string | null>(DEFAULT_LIVE_FEED_URL);
  const [isEditingLiveFeed, setIsEditingLiveFeed] = useState(false);
  const [telemetryUrlInput, setTelemetryUrlInput] = useState(DEFAULT_TELEMETRY_URL);
  const [telemetryUrlSaved, setTelemetryUrlSaved] = useState<string | null>(DEFAULT_TELEMETRY_URL);
  const [isEditingTelemetry, setIsEditingTelemetry] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualCompass, setManualCompass] = useState('');
  const [useManualInit, setUseManualInit] = useState(false);
  const [lastInit, setLastInit] = useState<{ lat: number; lon: number; compass: number } | null>(null);
  const [liveFeedStatus, setLiveFeedStatus] = useState<string | null>(null);
  const [mapMatchStatus, setMapMatchStatus] = useState<string | null>(null);
  const [apcResult, setApcResult] = useState<ApcResult | null>(null);
  const [mapMatchBusy, setMapMatchBusy] = useState(false);
  const [liveLocalizationActive, setLiveLocalizationActive] = useState(false);
  const [cameraFrameTick, setCameraFrameTick] = useState(0);
  const [imuSeries, setImuSeries] = useState<ImuSample[]>(() => buildImuSeries());
  const [errorSeries, setErrorSeries] = useState<ErrorSample[]>(() => buildErrorSeries());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const savedFeed = localStorage.getItem('chaox.liveFeedUrl');
    const savedTelemetry = localStorage.getItem('chaox.telemetryUrl');
    if (savedFeed) {
      setLiveFeedUrlSaved(savedFeed);
      setLiveFeedUrlInput(savedFeed);
    }
    if (savedTelemetry) {
      setTelemetryUrlSaved(savedTelemetry);
      setTelemetryUrlInput(savedTelemetry);
    }
  }, []);

  useEffect(() => {
    return () => {
      sourceFeedSocketRef.current?.close();
      backendFeedSocketRef.current?.close();
      apcManualStopRef.current = true;
      apcSocketRef.current?.close();
      if (apcLoopRef.current !== null) {
        window.clearInterval(apcLoopRef.current);
        apcLoopRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadVisualLocalization = async () => {
      try {
        const response = await fetch(`${API_BASE}/integrations/visual-localization`);
        if (!response.ok) {
          throw new Error(`Vendored module load failed (${response.status})`);
        }
        const payload = await response.json();
        if (cancelled) return;
        const config = payload.config || {};
        setVisualMapDbPath(config.map_db_path || localStorage.getItem('chaox.visualMapDbPath') || '');
        setTileMatcherBackend(config.enabled ? 'visual_localization' : 'native');
        setVisualProbe(payload.probe || null);
      } catch (error) {
        if (!cancelled) {
          setVisualStatus(error instanceof Error ? error.message : 'Failed to load internal visual localization module');
        }
      }
    };

    void loadVisualLocalization();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((current) => current + 1);
      setCameraFrameTick((current) => current + 1);
      setImuSeries((current) => {
        const nextIndex = current.length + 1;
        return [
          ...current.slice(-39),
          {
            t: `${nextIndex}`,
            gyro: 1.8 + Math.sin(nextIndex / 4) * 0.35 + Math.cos(nextIndex / 7) * 0.15,
            accel: -9 + Math.cos(nextIndex / 5) * 2.4 + Math.sin(nextIndex / 8) * 0.5,
          },
        ];
      });
      setErrorSeries((current) => {
        const nextIndex = current.length + 1;
        return [
          ...current.slice(-39),
          {
            t: `${nextIndex}`,
            horizontal: 18 + Math.sin(nextIndex / 3) * 6 + (nextIndex % 13 === 0 ? 12 : 0),
            vertical: 1.2 + Math.cos(nextIndex / 4) * 0.8,
            mean: 24 + Math.sin(nextIndex / 5) * 4 + (nextIndex % 11 === 0 ? 8 : 0),
          },
        ];
      });
    }, 1300);
    return () => window.clearInterval(interval);
  }, []);

  const handleSaveLiveFeed = () => {
    const trimmed = liveFeedUrlInput.trim();
    if (!trimmed) return;
    localStorage.setItem('chaox.liveFeedUrl', trimmed);
    setLiveFeedUrlSaved(trimmed);
    setIsEditingLiveFeed(false);
  };

  const handleSaveTelemetry = () => {
    const trimmed = telemetryUrlInput.trim();
    if (!trimmed) return;
    localStorage.setItem('chaox.telemetryUrl', trimmed);
    setTelemetryUrlSaved(trimmed);
    setIsEditingTelemetry(false);
  };

  const handleConnectLiveFeed = () => {
    if (!liveFeedUrlSaved) {
      setLiveFeedStatus('Set a live feed URL first.');
      return;
    }
    const backendCameraWs = `${DEFAULT_WS_BASE}/camera`;

    if (liveFeedUrlSaved === backendCameraWs) {
      setLiveFeedStatus(`Backend camera ingest is configured at ${backendCameraWs}. Waiting for a producer to push frames.`);
      return;
    }

    sourceFeedSocketRef.current?.close();
    backendFeedSocketRef.current?.close();

    const sourceSocket = new WebSocket(liveFeedUrlSaved);
    const backendSocket = new WebSocket(backendCameraWs);

    sourceFeedSocketRef.current = sourceSocket;
    backendFeedSocketRef.current = backendSocket;

    backendSocket.onopen = () => {
      setLiveFeedStatus(`Backend ingest ready at ${backendCameraWs}`);
    };

    sourceSocket.onopen = () => {
      setLiveFeedStatus(`Bridging live feed from ${liveFeedUrlSaved}`);
    };

    sourceSocket.onmessage = (event) => {
      if (typeof event.data === 'string' && backendSocket.readyState === WebSocket.OPEN) {
        backendSocket.send(event.data);
      }
    };

    sourceSocket.onerror = () => {
      setLiveFeedStatus('Source live feed connection failed.');
    };

    backendSocket.onerror = () => {
      setLiveFeedStatus('Backend camera ingest connection failed.');
    };

    sourceSocket.onclose = () => {
      setLiveFeedStatus('Source live feed disconnected.');
    };
  };

  const handleProbeVisualLocalization = async () => {
    setVisualBusy(true);
    setVisualStatus('Checking internal visual localization module...');
    try {
      const response = await fetch(`${API_BASE}/integrations/visual-localization/probe`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Probe failed (${response.status})`);
      }
      const payload = await response.json();
      setVisualProbe(payload);
      setVisualStatus(payload.valid ? 'Internal visual localization module is ready.' : payload.reason || 'Module check failed.');
    } catch (error) {
      setVisualStatus(error instanceof Error ? error.message : 'Probe failed');
    } finally {
      setVisualBusy(false);
    }
  };

  const handleUseVisualLocalization = async () => {
    setVisualBusy(true);
    setVisualStatus('Saving vendored visual localization config...');
    try {
      const response = await fetch(`${API_BASE}/integrations/visual-localization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_db_path: visualMapDbPath || null,
          device: 'cpu',
          resize_size: 800,
          matcher_backend: 'superpoint_superglue',
          enabled: tileMatcherBackend === 'visual_localization',
        }),
      });
      if (!response.ok) {
        throw new Error(`Save failed (${response.status})`);
      }
      const payload = await response.json();
      setVisualProbe(payload.probe || null);
      if (visualMapDbPath) {
        localStorage.setItem('chaox.visualMapDbPath', visualMapDbPath);
      }
      setVisualStatus(payload.probe?.valid ? 'Vendored visual localization config saved.' : 'Config saved, but the internal module is not ready yet.');
    } catch (error) {
      setVisualStatus(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setVisualBusy(false);
    }
  };

  const handleUseCachedVisualDb = async () => {
    setVisualBusy(true);
    setVisualStatus('Loading active cache-backed visual localization DB...');
    try {
      const response = await fetch(`${API_BASE}/tiles/visual-localization-db`);
      if (!response.ok) {
        throw new Error(`Cache DB lookup failed (${response.status})`);
      }
      const payload = await response.json();
      const activePath = payload.active_map_db_path;
      if (!activePath) {
        throw new Error('No cache-backed visual localization DB is active yet.');
      }
      setVisualMapDbPath(activePath);
      localStorage.setItem('chaox.visualMapDbPath', activePath);
      setVisualStatus(`Loaded cache-backed DB: ${activePath}`);
    } catch (error) {
      setVisualStatus(error instanceof Error ? error.message : 'Cache DB lookup failed');
    } finally {
      setVisualBusy(false);
    }
  };

  const resolveInitialPose = async () => {
    let initLat: number | null = null;
    let initLon: number | null = null;
    let initYaw: number | null = null;

    if (useManualInit) {
      initLat = Number(manualLat);
      initLon = Number(manualLon);
      initYaw = Number(manualCompass);
      if (![initLat, initLon, initYaw].every((value) => Number.isFinite(value))) {
        throw new Error('Enter valid manual lat/lon/compass.');
      }
    } else if (telemetryUrlSaved && !(telemetryUrlSaved.startsWith('ws://') || telemetryUrlSaved.startsWith('wss://'))) {
      const res = await fetch(telemetryUrlSaved);
      if (!res.ok) {
        throw new Error(`Telemetry failed (${res.status}).`);
      }
      const data = await res.json();
      initLat = Number(data.lat);
      initLon = Number(data.lon);
      initYaw = Number(data.compass ?? data.yaw ?? 0);
      if (![initLat, initLon, initYaw].every((value) => Number.isFinite(value))) {
        throw new Error('Telemetry missing valid lat/lon/yaw fields.');
      }
    } else if (lastInit) {
      initLat = lastInit.lat;
      initLon = lastInit.lon;
      initYaw = lastInit.compass;
    } else {
      throw new Error('Set manual init or an HTTP telemetry source before locating.');
    }

    const resolved = { lat: initLat!, lon: initLon!, compass: initYaw! };
    setLastInit(resolved);
    return resolved;
  };

  const stopLiveLocalization = (message?: string) => {
    apcManualStopRef.current = true;
    if (apcLoopRef.current !== null) {
      window.clearInterval(apcLoopRef.current);
      apcLoopRef.current = null;
    }
    apcSocketRef.current?.close();
    apcSocketRef.current = null;
    apcSendBusyRef.current = false;
    setLiveLocalizationActive(false);
    setMapMatchBusy(false);
    if (message) {
      setMapMatchStatus(message);
    }
  };

  const pushApcFrame = async (socket: WebSocket) => {
    if (socket.readyState !== WebSocket.OPEN || apcSendBusyRef.current) {
      return;
    }

    apcSendBusyRef.current = true;
    try {
      const seed = await resolveInitialPose();
      const latSeed =
        typeof apcResult?.lat === 'number' && Number.isFinite(apcResult.lat)
          ? apcResult.lat
          : seed.lat;
      const lonSeed =
        typeof apcResult?.lon === 'number' && Number.isFinite(apcResult.lon)
          ? apcResult.lon
          : seed.lon;

      socket.send(JSON.stringify({
        frame_id: `ui-live-${Date.now()}`,
        timestamp: new Date().toISOString(),
        lat: latSeed,
        lon: lonSeed,
        yaw: seed.compass,
        meta: {
          requested_from: 'apc_dashboard_panel',
          backend: tileMatcherBackend,
          stream_mode: 'live',
        },
      }));
    } catch (error) {
      stopLiveLocalization(error instanceof Error ? error.message : 'Failed to resolve initial pose.');
    } finally {
      apcSendBusyRef.current = false;
    }
  };

  const handleMapMatch = async () => {
    if (liveLocalizationActive) {
      stopLiveLocalization('Live localization stopped.');
      return;
    }

    try {
      setMapMatchBusy(true);
      setMapMatchStatus('Resolving initial pose...');
      await resolveInitialPose();

      if (tileMatcherBackend === 'visual_localization') {
        const saveResponse = await fetch(`${API_BASE}/integrations/visual-localization`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            map_db_path: visualMapDbPath || null,
            device: 'cpu',
            resize_size: 800,
            matcher_backend: 'superpoint_superglue',
            enabled: true,
          }),
        });
        if (!saveResponse.ok) {
          setMapMatchStatus(`Visual localization provider save failed (${saveResponse.status}).`);
          setMapMatchBusy(false);
          return;
        }
      }

      const socket = new WebSocket(`${DEFAULT_WS_BASE}/ws/apc`);
      apcManualStopRef.current = false;
      apcSocketRef.current = socket;

      socket.onopen = () => {
        setLiveLocalizationActive(true);
        setMapMatchStatus('Live localization connected. Tracking latest buffered frames...');
        void pushApcFrame(socket);
        apcLoopRef.current = window.setInterval(() => {
          void pushApcFrame(socket);
        }, 1400);
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as ApcResult;
        setApcResult(payload);

        if (payload.source === 'apc-dev') {
          setMapMatchStatus('No live camera frame is buffered yet. APC is using fallback dev output.');
          return;
        }

        if (payload.lat !== null && payload.lon !== null) {
          setMapMatchStatus(
            `Tracking by ${payload.source}: ${Number(payload.lat).toFixed(6)}, ${Number(payload.lon).toFixed(6)}`
          );
        } else {
          setMapMatchStatus(`Localization returned no coordinates. Source: ${payload.source}`);
        }
      };

      socket.onerror = () => {
        setMapMatchStatus('Live localization socket error.');
      };

      socket.onclose = () => {
        if (apcLoopRef.current !== null) {
          window.clearInterval(apcLoopRef.current);
          apcLoopRef.current = null;
        }
        apcSocketRef.current = null;
        apcSendBusyRef.current = false;
        setLiveLocalizationActive(false);
        setMapMatchBusy(false);
        if (!apcManualStopRef.current) {
          setMapMatchStatus('Live localization disconnected.');
        }
        apcManualStopRef.current = false;
      };
    } catch (error) {
      setMapMatchStatus(error instanceof Error ? error.message : 'Localization request failed.');
      setMapMatchBusy(false);
    }
  };

  const backendLabel =
    tileMatcherBackend === 'visual_localization'
      ? 'Visual Localization'
      : tileMatcherBackend === 'orb'
        ? 'ORB + RANSAC'
        : 'Native APC';
  const trackingState = liveLocalizationActive ? 'Tracking' : mapMatchBusy ? 'Locating' : apcResult ? 'Standby' : 'Standby';
  const fusionState = useManualInit ? 'Ignoring' : lastInit ? 'Fusing GPS' : 'Awaiting Init';
  const liveCameraFrameUrl = `${API_BASE}/camera/latest.jpg?ts=${cameraFrameTick}`;
  const debugArtifacts = apcResult?.meta?.debug || null;
  const latestLatitude =
    typeof apcResult?.lat === 'number' && Number.isFinite(apcResult.lat)
      ? apcResult.lat
      : lastInit?.lat ?? null;
  const latestLongitude =
    typeof apcResult?.lon === 'number' && Number.isFinite(apcResult.lon)
      ? apcResult.lon
      : lastInit?.lon ?? null;
  const latestConfidence =
    typeof apcResult?.confidence === 'number' && Number.isFinite(apcResult.confidence)
      ? apcResult.confidence
      : null;
  const latestErrorRadius =
    typeof apcResult?.error_radius_m === 'number' && Number.isFinite(apcResult.error_radius_m)
      ? apcResult.error_radius_m
      : null;

  const liveTone = classifyStatus(liveFeedStatus);
  const matchTone = classifyStatus(mapMatchStatus);
  const visualTone = visualProbe?.valid ? 'ready' : classifyStatus(visualStatus);
  const trackSeries = useMemo(() => buildTrackSeries(tick), [tick]);
  const highlightedTrackPoint = trackSeries[Math.min(19, trackSeries.length - 1)];
  const groundMapLatitude = latestLatitude ?? lastInit?.lat ?? APC_DEFAULT_COORDS.lat;
  const groundMapLongitude = latestLongitude ?? lastInit?.lon ?? APC_DEFAULT_COORDS.lon;
  const groundMapZoom = latestErrorRadius !== null
    ? Math.max(14, Math.min(18, Math.round(18 - Math.log2(Math.max(1, latestErrorRadius / 5)))))
    : 16;
  const groundMap = useApcGroundMap({
    lat: groundMapLatitude,
    lon: groundMapLongitude,
    zoom: groundMapZoom,
    mapType: 'satellite',
  });

  return (
    <div className="relative h-full w-full overflow-y-auto overflow-x-hidden border-l border-panel-border bg-[#05070d] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.05),transparent_22%)]" />
      <div className="relative flex min-h-full flex-col">
        <div className="border-b border-slate-800/90 bg-slate-950/75 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Absolute Position Correction</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">Night VPS Localization Dashboard</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {['Night VPS', 'LiveNav', 'Log', 'Night Sensors', 'Cameras', 'IMU Vel'].map((tab) => (
                <Badge key={tab} variant="outline" className="border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                  {tab}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div
          className="grid min-h-[1080px] flex-none gap-3 p-3"
          style={{
            gridTemplateColumns: 'minmax(220px, 0.82fr) minmax(0, 1.45fr) minmax(280px, 0.98fr)',
            gridTemplateRows: 'minmax(0, 1fr) 280px 96px',
          }}
        >
          <div className="grid min-h-0 gap-3 pt-12" style={{ gridRow: '1 / span 2', gridColumn: '1' }}>
            <FeedPane
              title="/camera/boson0/image_raw/compressed/throttled"
              subtitle="live"
              variant={1}
              imageSrc={liveCameraFrameUrl}
              footerLabels={['cam', 'live', 'buffer']}
            />
            <FeedPane
              title="/camera/boson1/image_raw/compressed/throttled"
              subtitle="match"
              variant={2}
              imageSrc={toDataImageSrc(debugArtifacts?.match_image_b64) ?? liveCameraFrameUrl}
              footerLabels={['cam', 'match', 'viz']}
            />
          </div>

          <div className={`${panelShell} flex min-h-0 flex-col`} style={{ gridColumn: '2', gridRow: '1' }}>
            <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-100">
                <Radar className="h-4 w-4 shrink-0 text-cyan-300" />
                <span className="truncate">LiveNav Trajectory</span>
              </div>
              <Badge variant="outline" className="border-slate-700 bg-slate-900/80 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                {backendLabel}
              </Badge>
            </div>
            <div className="grid flex-1 grid-cols-[minmax(0,1fr),minmax(160px,30%)] gap-3 p-3">
              <div className="relative min-h-0 overflow-hidden rounded-lg border border-slate-800/80 bg-[#08111d] p-2">
                <div className="absolute left-2 top-2 z-10">
                  <InlineToolStrip />
                </div>
                <FloatingVerticalToolbar />
                <div className="absolute bottom-4 left-4 z-10 rounded border border-slate-700/90 bg-slate-950/92 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
                  <div className="text-lg text-slate-300">{highlightedTrackPoint.x}</div>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="text-red-400">coarse : {highlightedTrackPoint.coarse}</div>
                    <div className="text-amber-400">truth : {highlightedTrackPoint.truth}</div>
                    <div className="text-emerald-400">fused : {highlightedTrackPoint.fused}</div>
                    <div className="text-sky-400">scatter : {highlightedTrackPoint.scatter}</div>
                  </div>
                </div>
                <div className="absolute bottom-3 right-4 z-10 rounded-full border border-cyan-500/20 bg-slate-950/75 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                  {groundMap.source === 'offline' ? 'Offline Map' : groundMap.source === 'online' ? 'Online Map' : '3D APC Volume'}
                </div>
                <div className="absolute left-24 top-2 z-10 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                  {groundMap.status}
                </div>
                <ApcTrajectoryScene
                  trackSeries={trackSeries}
                  groundTexture={groundMap.texture}
                  groundPlaneSize={groundMap.planeSize}
                />
              </div>
              <div className="grid min-w-0 gap-3">
                <div className="min-w-0 rounded-lg border border-slate-800/80 bg-slate-900/80 p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Pose Status</div>
                  <div className="mt-2 text-lg font-semibold text-slate-100">{trackingState}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {mapMatchStatus || 'Ready to acquire absolute fix.'}
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border border-slate-800/80 bg-slate-900/80 p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Coordinates</div>
                  <div className="mt-2 space-y-1 text-xs text-slate-300">
                    <div>Lat: {latestLatitude !== null ? formatNumber(latestLatitude, 6) : '--'}</div>
                    <div>Lon: {latestLongitude !== null ? formatNumber(latestLongitude, 6) : '--'}</div>
                    <div>Confidence: {latestConfidence !== null ? formatNumber(latestConfidence, 2) : '--'}</div>
                    <div>Error: {latestErrorRadius !== null ? `${formatNumber(latestErrorRadius, 1)} m` : '--'}</div>
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border border-slate-800/80 bg-slate-900/80 p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Vendor DB</div>
                  <div className="mt-2 break-all text-xs text-slate-300">
                    {visualMapDbPath || 'No DB selected'}
                  </div>
                </div>
              </div>
            </div>
            <PaneFooterBar labels={['traj', 'nav', 'estimator']} />
          </div>

          <div className="grid min-h-0 gap-3" style={{ gridColumn: '3', gridRow: '1', gridTemplateRows: 'minmax(0,1fr) minmax(0,1fr)' }}>
            <div className={`${panelShell} flex min-h-0 flex-col p-3`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-100">Control Stack</div>
                <Badge variant="outline" className={`border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${statusClasses[visualTone]}`}>
                  {visualProbe?.valid ? 'Vendor Ready' : 'Vendor Pending'}
                </Badge>
              </div>

              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={handleMapMatch}>
                    <Crosshair className="mr-2 h-4 w-4" />
                    {liveLocalizationActive ? 'Stop' : mapMatchBusy ? 'Locating' : 'Locate'}
                  </Button>
                  <Button size="sm" variant="outline" className="border-slate-700 bg-slate-900/80 text-slate-100" onClick={handleConnectLiveFeed}>
                    <Video className="mr-2 h-4 w-4" />
                    Feed
                  </Button>
                  <Button size="sm" variant="outline" className="border-slate-700 bg-slate-900/80 text-slate-100" onClick={handleProbeVisualLocalization} disabled={visualBusy}>
                    <ScanLine className="mr-2 h-4 w-4" />
                    Probe
                  </Button>
                  <Button size="sm" variant="outline" className="border-slate-700 bg-slate-900/80 text-slate-100" onClick={handleUseCachedVisualDb} disabled={visualBusy}>
                    <Database className="mr-2 h-4 w-4" />
                    Cached DB
                  </Button>
                </div>

                {isEditingLiveFeed ? (
                  <div className="flex gap-2">
                    <Input className="h-8 border-slate-700 bg-slate-900/90 text-xs text-slate-100" value={liveFeedUrlInput} onChange={(e) => setLiveFeedUrlInput(e.target.value)} />
                    <Button size="sm" onClick={handleSaveLiveFeed}>Save</Button>
                  </div>
                ) : (
                  <button type="button" className="w-full rounded-lg border border-slate-800/80 bg-slate-900/80 px-3 py-2 text-left text-xs text-slate-300" onClick={() => setIsEditingLiveFeed(true)}>
                    Live Feed: {liveFeedUrlSaved || '--'}
                  </button>
                )}

                <div className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/80 px-3 py-2">
                  <div className="text-xs text-slate-300">Manual Init</div>
                  <Switch checked={useManualInit} onCheckedChange={(value) => setUseManualInit(Boolean(value))} />
                </div>

                {useManualInit ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Input className="h-8 border-slate-700 bg-slate-900/90 text-xs text-slate-100" placeholder="Lat" value={manualLat} onChange={(e) => setManualLat(e.target.value)} />
                    <Input className="h-8 border-slate-700 bg-slate-900/90 text-xs text-slate-100" placeholder="Lon" value={manualLon} onChange={(e) => setManualLon(e.target.value)} />
                    <Input className="h-8 border-slate-700 bg-slate-900/90 text-xs text-slate-100" placeholder="Yaw" value={manualCompass} onChange={(e) => setManualCompass(e.target.value)} />
                  </div>
                ) : isEditingTelemetry ? (
                  <div className="flex gap-2">
                    <Input className="h-8 border-slate-700 bg-slate-900/90 text-xs text-slate-100" value={telemetryUrlInput} onChange={(e) => setTelemetryUrlInput(e.target.value)} />
                    <Button size="sm" onClick={handleSaveTelemetry}>Save</Button>
                  </div>
                ) : (
                  <button type="button" className="w-full rounded-lg border border-slate-800/80 bg-slate-900/80 px-3 py-2 text-left text-xs text-slate-300" onClick={() => setIsEditingTelemetry(true)}>
                    Telemetry: {telemetryUrlSaved || '--'}
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${tileMatcherBackend === 'native' ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-slate-800/80 bg-slate-900/80 text-slate-300'}`}
                    onClick={() => setTileMatcherBackend('native')}
                  >
                    Native APC
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${tileMatcherBackend === 'visual_localization' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' : 'border-slate-800/80 bg-slate-900/80 text-slate-300'}`}
                    onClick={() => setTileMatcherBackend('visual_localization')}
                  >
                    Visual Localization
                  </button>
                </div>

                <Input
                  className="h-8 border-slate-700 bg-slate-900/90 text-xs text-slate-100"
                  placeholder="Map DB path"
                  value={visualMapDbPath}
                  onChange={(e) => setVisualMapDbPath(e.target.value)}
                />

                <Button size="sm" variant="outline" className="w-full border-slate-700 bg-slate-900/80 text-slate-100" onClick={handleUseVisualLocalization} disabled={visualBusy}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Save Vendor Config
                </Button>
              </div>
            </div>

            <LocalizationMatchDashboard
              lat={groundMapLatitude}
              lon={groundMapLongitude}
              zoom={groundMapZoom}
              backendLabel={backendLabel}
              debug={debugArtifacts}
              liveFrameUrl={liveCameraFrameUrl}
              matchStatus={mapMatchStatus}
            />
          </div>

          <div className={`${panelShell} flex min-h-0 flex-col p-3`} style={{ gridColumn: '2', gridRow: '2' }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                <Waves className="h-4 w-4 text-sky-300" />
                IMU
              </div>
              <PaneActionBar />
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={imuSeries} margin={{ top: 10, right: 8, left: -12, bottom: 8 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="t" hide />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={{ background: 'rgba(2,6,23,0.96)', border: '1px solid rgba(51,65,85,0.9)' }} />
                  <Area type="monotone" dataKey="gyro" stroke="#f59e0b" fill="rgba(245,158,11,0.22)" strokeWidth={2} />
                  <Area type="monotone" dataKey="accel" stroke="#3b82f6" fill="rgba(59,130,246,0.18)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2">
              <PaneFooterBar labels={['imu', 'gyro', 'accel']} />
            </div>
          </div>

          <div className={`${panelShell} flex min-h-0 flex-col p-3`} style={{ gridColumn: '3', gridRow: '2' }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                <Activity className="h-4 w-4 text-rose-300" />
                Error
              </div>
              <PaneActionBar />
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={errorSeries} margin={{ top: 10, right: 8, left: -12, bottom: 8 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="t" hide />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={{ background: 'rgba(2,6,23,0.96)', border: '1px solid rgba(51,65,85,0.9)' }} />
                  <Line type="monotone" dataKey="horizontal" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="vertical" stroke="#fca5a5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="mean" stroke="#f8fafc" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2">
              <PaneFooterBar labels={['err', 'horizontal', 'vertical']} />
            </div>
          </div>

          <div className="grid gap-3" style={{ gridColumn: '2 / span 2', gridRow: '3', gridTemplateColumns: '1.1fr 1.1fr repeat(4, minmax(0, 1fr))' }}>
            <StatStrip label="Fusion GPS" value={fusionState} tone={fusionState === 'Ignoring' ? 'warn' : 'ready'} />
            <StatStrip label="Estimator Tracking" value={trackingState} tone={matchTone} />
            <StatStrip label="Longitude" value={latestLongitude !== null ? formatNumber(latestLongitude, 5) : '--'} tone="idle" />
            <StatStrip label="Altitude" value={`${latestErrorRadius !== null ? Math.max(18, latestErrorRadius * 3).toFixed(1) : '--'} m`} tone="idle" />
            <StatStrip label="Feed" value={liveFeedStatus ? 'Linked' : 'Offline'} tone={liveTone} />
            <StatStrip label="Vendor" value={visualProbe?.valid ? 'Ready' : 'Pending'} tone={visualTone} />
          </div>
        </div>

        <div className="pointer-events-none absolute left-4 top-20 flex gap-2">
          <div className={`pointer-events-auto rounded-lg border px-3 py-2 text-xs ${statusClasses[liveTone]}`}>
            <div className="flex items-center gap-2">
              <Wifi className="h-3.5 w-3.5" />
              {liveFeedStatus || 'Feed idle'}
            </div>
          </div>
          <div className={`pointer-events-auto rounded-lg border px-3 py-2 text-xs ${statusClasses[matchTone]}`}>
            <div className="flex items-center gap-2">
              <Signal className="h-3.5 w-3.5" />
              {mapMatchStatus || 'Awaiting localization run'}
            </div>
          </div>
          <div className={`pointer-events-auto rounded-lg border px-3 py-2 text-xs ${statusClasses[visualTone]}`}>
            <div className="flex items-center gap-2">
              <Satellite className="h-3.5 w-3.5" />
              {visualProbe?.valid ? 'Visual localization ready' : visualStatus || 'Vendor pipeline not ready'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

useGLTF.preload('/assets/uav/drone.glb');
