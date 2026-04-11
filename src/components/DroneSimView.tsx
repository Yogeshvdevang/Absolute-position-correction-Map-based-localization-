import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@/styles/drone-sim.css';

type SimState = {
  flying: boolean;
  paused: boolean;
  following: boolean;
  manualMode: boolean;
  manualYaw: number;
  manualSpeed: number;
  manualVertSpeed: number;
  lastUpdateTime: number;
  manualDistance: number;
  startTime: number;
  bootTime: number;
  pauseTime: number;
  totalPausedTime: number;
  duration: number;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  currentPos: THREE.Vector3;
  prevPos: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  refLat: number;
  refLon: number;
  refAlt: number;
  droneGroup: THREE.Group | null;
  pathLine: THREE.Line | null;
  trailLine: THREE.Line | null;
  trailPoints: THREE.Vector3[];
  velArrow: THREE.ArrowHelper | null;
  accArrow: THREE.ArrowHelper | null;
  axisGroup: THREE.Group | null;
  groundPlane: THREE.Mesh | null;
};

type MissionPreset = {
  id: 'dsu-city' | 'dsu-main';
  label: string;
  lat: number;
  lon: number;
  radiusM: number;
};

type ManualInputMode = 'rc' | 'keyboard' | 'joystick';
type RcProfileId = 'flysky-fsi6' | 'radiomaster-pocket';
type CalibrationPanel = 'none' | 'rc' | 'joystick';
type AxisKey = 'roll' | 'pitch' | 'yaw' | 'throttle';
type AxisCalibration = { min: number; center: number; max: number };
type CameraViewKey = 'bottom' | 'bottomClean' | 'front' | 'left' | 'right';

const INSET = { width: 240, height: 160, margin: 16 };
const CAMERA_STREAM_TARGET_FPS = 120;
const CAMERA_STREAM_INTERVAL_MS = 1000 / CAMERA_STREAM_TARGET_FPS;
const MAP_TILE = { tileSize: 256, grid: 3 };
const MISSION_PRESETS: MissionPreset[] = [
  {
    id: 'dsu-city',
    label: 'DSU City Campus',
    lat: 12.8874283,
    lon: 77.6419887,
    radiusM: 180
  },
  {
    id: 'dsu-main',
    label: 'DSU Main Campus',
    lat: 12.6606692,
    lon: 77.4508399,
    radiusM: 260
  }
];
const DEFAULT_PRESET = MISSION_PRESETS[0];
const MAP_DEFAULT: [number, number] = [DEFAULT_PRESET.lon, DEFAULT_PRESET.lat];
const WS_BASE = import.meta.env.VITE_CHAOX_WS_BASE || 'ws://localhost:9000';
const API_BASE = import.meta.env.VITE_BACKEND_BASE || WS_BASE.replace(/^ws/i, 'http');
type GroundSource = 'satellite' | 'streets';
const CAMERA_VIEW_LABELS: Record<CameraViewKey, string> = {
  bottom: 'Bottom Camera + Trace',
  bottomClean: 'Bottom Camera Clean',
  front: 'Front Camera',
  left: 'Left Camera',
  right: 'Right Camera',
};
const CAMERA_VIEW_TITLES: Record<CameraViewKey, string> = {
  bottom: 'Bottom Facing Drone Cam + Trace',
  bottomClean: 'Bottom Facing Drone Cam Clean',
  front: 'Front Facing Drone Cam',
  left: 'Left Facing Drone Cam',
  right: 'Right Facing Drone Cam',
};
const RC_PROFILES: Array<{
  id: RcProfileId;
  label: string;
  protocol: string;
  notes: string;
  channels: Array<{ channel: string; function: string; range: string }>;
}> = [
  {
    id: 'flysky-fsi6',
    label: 'FlySky FS-i6',
    protocol: 'AFHDS 2A / PWM, iBus, PPM',
    notes: 'Use a dedicated model memory for the simulator and keep expo disabled while calibrating endpoints.',
    channels: [
      { channel: 'CH1', function: 'Roll / Aileron', range: '1000-2000 us' },
      { channel: 'CH2', function: 'Pitch / Elevator', range: '1000-2000 us' },
      { channel: 'CH3', function: 'Throttle', range: '1000-2000 us' },
      { channel: 'CH4', function: 'Yaw / Rudder', range: '1000-2000 us' },
      { channel: 'CH5', function: 'Flight Mode', range: '2-position or 3-position switch' },
      { channel: 'CH6', function: 'Arm / Aux', range: '2-position switch' }
    ]
  },
  {
    id: 'radiomaster-pocket',
    label: 'Radiomaster Pocket',
    protocol: 'EdgeTX / ELRS or multi-module output',
    notes: 'Run EdgeTX stick calibration first on the radio, then validate the model mixer output in the simulator.',
    channels: [
      { channel: 'CH1', function: 'Roll / Aileron', range: '1000-2000 us' },
      { channel: 'CH2', function: 'Pitch / Elevator', range: '1000-2000 us' },
      { channel: 'CH3', function: 'Throttle', range: '1000-2000 us' },
      { channel: 'CH4', function: 'Yaw / Rudder', range: '1000-2000 us' },
      { channel: 'CH5', function: 'Flight Mode', range: '3-position switch' },
      { channel: 'CH6', function: 'Arm / Aux', range: 'Momentary or 2-position switch' }
    ]
  }
];

export const DroneSimView = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [bottomFov, setBottomFov] = useState(120);
  const [cameraViews, setCameraViews] = useState<Record<CameraViewKey, boolean>>({
    bottom: true,
    bottomClean: true,
    front: false,
    left: false,
    right: false,
  });
  const [mapSource, setMapSource] = useState<GroundSource>('satellite');
  const [mapZoomMin, setMapZoomMin] = useState(14);
  const [mapZoomMax, setMapZoomMax] = useState(18);
  const [mapStatus, setMapStatus] = useState('Map tiles: idle');
  const [missionPresetId, setMissionPresetId] = useState<MissionPreset['id']>(DEFAULT_PRESET.id);
  const [manualInputMode, setManualInputMode] = useState<ManualInputMode>('keyboard');
  const [manualControlStatus, setManualControlStatus] = useState('Keyboard control active.');
  const [calibrationPanel, setCalibrationPanel] = useState<CalibrationPanel>('none');
  const [rcProfileId, setRcProfileId] = useState<RcProfileId>('flysky-fsi6');
  const [rcStickMode, setRcStickMode] = useState<1 | 2>(2);
  const [axisReverse, setAxisReverse] = useState<Record<AxisKey, boolean>>({
    roll: false,
    pitch: false,
    yaw: false,
    throttle: false,
  });
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState('No controller detected');
  const [rcPwm, setRcPwm] = useState<Record<AxisKey, number>>({
    roll: 1500,
    pitch: 1500,
    yaw: 1500,
    throttle: 1000,
  });
  const [rcAuxPwm, setRcAuxPwm] = useState<number[]>([1518, 964, 1998, 0, 0, 0, 0, 0, 0, 0]);
  const [joystickMonitorValues, setJoystickMonitorValues] = useState<number[]>([50, 50, 50, 50, 50, 50]);
  const [rcCalibrationRunning, setRcCalibrationRunning] = useState(false);
  const [rcCalibrationMessage, setRcCalibrationMessage] = useState('Ready to capture radio endpoints.');
  const [rcCalibrationData, setRcCalibrationData] = useState<Record<AxisKey, AxisCalibration>>({
    roll: { min: 1000, center: 1500, max: 2000 },
    pitch: { min: 1000, center: 1500, max: 2000 },
    yaw: { min: 1000, center: 1500, max: 2000 },
    throttle: { min: 1000, center: 1000, max: 2000 },
  });
  const [telemetryWsStatus, setTelemetryWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [cameraWsStatus, setCameraWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [cameraStreamFps, setCameraStreamFps] = useState(0);
  const [telemetryWsLast, setTelemetryWsLast] = useState('No messages yet.');
  const mapSourceRef = useRef<GroundSource>('satellite');
  const mapZoomMinRef = useRef(14);
  const mapZoomMaxRef = useRef(18);
  const telemetryWsRef = useRef<WebSocket | null>(null);
  const cameraWsRef = useRef<WebSocket | null>(null);
  const wsLastUpdateRef = useRef(0);
  const groundTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const groundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const groundLoadIdRef = useRef(0);
  const lastMapRef = useRef<{ x: number; y: number; zoom: number; source: GroundSource } | null>(null);
  const modeRef = useRef<HTMLSelectElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLDivElement>(null);

  const startLatRef = useRef<HTMLInputElement>(null);
  const startLonRef = useRef<HTMLInputElement>(null);
  const startAltRef = useRef<HTMLInputElement>(null);
  const endLatRef = useRef<HTMLInputElement>(null);
  const endLonRef = useRef<HTMLInputElement>(null);
  const endAltRef = useRef<HTMLInputElement>(null);
  const speedRef = useRef<HTMLInputElement>(null);

  const pauseBtnRef = useRef<HTMLButtonElement>(null);
  const followBtnRef = useRef<HTMLButtonElement>(null);
  const manualBtnRef = useRef<HTMLButtonElement>(null);
  const labelStartRef = useRef<HTMLDivElement>(null);
  const labelEndRef = useRef<HTMLDivElement>(null);
  const labelStartTextRef = useRef<HTMLDivElement>(null);
  const labelEndTextRef = useRef<HTMLDivElement>(null);
  const presetRef = useRef<HTMLSelectElement>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const streamRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bottomFovHelperRef = useRef<THREE.CameraHelper | null>(null);
  const droneCameraRefs = useRef<Record<CameraViewKey, THREE.PerspectiveCamera | null>>({
    bottom: null,
    bottomClean: null,
    front: null,
    left: null,
    right: null,
  });
  const cameraViewStateRef = useRef<Record<CameraViewKey, boolean>>({
    bottom: true,
    bottomClean: true,
    front: false,
    left: false,
    right: false,
  });
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animRef = useRef<number | null>(null);
  const gamepadAxesRef = useRef<Record<AxisKey, number>>({
    roll: 0,
    pitch: 0,
    yaw: 0,
    throttle: -1,
  });
  const rcPwmRef = useRef<Record<AxisKey, number>>({
    roll: 1500,
    pitch: 1500,
    yaw: 1500,
    throttle: 1000,
  });
  const manualInputModeRef = useRef<ManualInputMode>('keyboard');
  const gamepadConnectedRef = useRef(false);
  const axisReverseRef = useRef<Record<AxisKey, boolean>>({
    roll: false,
    pitch: false,
    yaw: false,
    throttle: false,
  });
  const rcCalibrationDataRef = useRef<Record<AxisKey, AxisCalibration>>({
    roll: { min: 1000, center: 1500, max: 2000 },
    pitch: { min: 1000, center: 1500, max: 2000 },
    yaw: { min: 1000, center: 1500, max: 2000 },
    throttle: { min: 1000, center: 1000, max: 2000 },
  });
  const rcStatusPushRef = useRef(0);
  const cameraStreamLastSentRef = useRef(0);
  const cameraStreamFrameCountRef = useRef(0);
  const cameraStreamWindowStartRef = useRef(0);
  const rcCalibrationCaptureRef = useRef<Record<AxisKey, AxisCalibration>>({
    roll: { min: 1000, center: 1500, max: 2000 },
    pitch: { min: 1000, center: 1500, max: 2000 },
    yaw: { min: 1000, center: 1500, max: 2000 },
    throttle: { min: 1000, center: 1000, max: 2000 },
  });

  const telemetryWsUrl = `${WS_BASE}/ws/telemetry`;
  const cameraWsUrl = `${WS_BASE}/camera`;
  const buildWsHeader = () =>
    `[WEBSOCKET: TELEMETRY]\n${telemetryWsUrl}\n[WEBSOCKET: BOTTOM CAMERA]\n${cameraWsUrl}\n\n`;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  const connectTelemetryWs = () => {
    if (telemetryWsRef.current) telemetryWsRef.current.close();
    setTelemetryWsStatus('connecting');
    const ws = new WebSocket(telemetryWsUrl);
    telemetryWsRef.current = ws;
    ws.onopen = () => setTelemetryWsStatus('connected');
    ws.onerror = () => setTelemetryWsStatus('error');
    ws.onclose = () => setTelemetryWsStatus('disconnected');
    ws.onmessage = (event) => {
      const now = performance.now();
      if (now - wsLastUpdateRef.current < 200) return;
      wsLastUpdateRef.current = now;
      if (typeof event.data === 'string') {
        setTelemetryWsLast(event.data.slice(0, 240));
      } else if (event.data instanceof Blob) {
        setTelemetryWsLast(`Binary message (${event.data.size} bytes)`);
      } else if (event.data instanceof ArrayBuffer) {
        setTelemetryWsLast(`Binary message (${event.data.byteLength} bytes)`);
      } else {
        setTelemetryWsLast('Message received.');
      }
    };
  };

  const disconnectTelemetryWs = () => {
    telemetryWsRef.current?.close();
    telemetryWsRef.current = null;
    setTelemetryWsStatus('disconnected');
  };

  const connectCameraWs = () => {
    if (cameraWsRef.current) cameraWsRef.current.close();
    setCameraWsStatus('connecting');
    setCameraStreamFps(0);
    cameraStreamFrameCountRef.current = 0;
    cameraStreamWindowStartRef.current = performance.now();
    const ws = new WebSocket(cameraWsUrl);
    cameraWsRef.current = ws;
    ws.onopen = () => setCameraWsStatus('connected');
    ws.onerror = () => setCameraWsStatus('error');
    ws.onclose = () => {
      setCameraWsStatus('disconnected');
      setCameraStreamFps(0);
    };
  };

  const disconnectCameraWs = () => {
    cameraWsRef.current?.close();
    cameraWsRef.current = null;
    setCameraWsStatus('disconnected');
    setCameraStreamFps(0);
  };

  const stateRef = useRef<SimState>({
    flying: false,
    paused: false,
    following: false,
    manualMode: false,
    manualYaw: 0,
    manualSpeed: 8,
    manualVertSpeed: 4,
    lastUpdateTime: performance.now() / 1000,
    manualDistance: 0,
    startTime: 0,
    bootTime: performance.now(),
    pauseTime: 0,
    totalPausedTime: 0,
    duration: 0,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    currentPos: new THREE.Vector3(),
    prevPos: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    acceleration: new THREE.Vector3(),
    refLat: MAP_DEFAULT[1],
    refLon: MAP_DEFAULT[0],
    refAlt: 50,
    droneGroup: null,
    pathLine: null,
    trailLine: null,
    trailPoints: [],
    velArrow: null,
    accArrow: null,
    axisGroup: null,
    groundPlane: null
  });

  const inputRef = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false,
    yawLeft: false,
    yawRight: false
  });

  const getNumber = useCallback((ref: RefObject<HTMLInputElement>, fallback = 0) => {
    const raw = ref.current?.value;
    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  }, []);

  const updateModeInfo = useCallback(() => {
    const mode = modeRef.current?.value;
    const desc = descRef.current;
    if (!mode || !desc) return;
    let txt = '';
    if (mode === 'GPS_INPUT') txt = 'MAVLink Software Bridge. Expects Float Lat/Lon, Float Alt, Float Velocity.';
    if (mode === 'ODOM') txt = 'ROS / Visual SLAM. Expects Local Position (Meters) & Quaternions.';
    if (mode === 'UBX') txt = 'Hardware Serial Protocol. Expects Integers (Deg*1e7) and Millimeters.';
    desc.textContent = txt;
  }, []);

  const updateLabelText = (sLat: number, sLon: number, sAlt: number, eLat: number, eLon: number, eAlt: number) => {
    if (labelStartRef.current) labelStartRef.current.style.display = 'block';
    if (labelEndRef.current) labelEndRef.current.style.display = 'block';
    if (labelStartTextRef.current) {
      labelStartTextRef.current.innerHTML = `Lat: ${sLat.toFixed(5)}<br>Lon: ${sLon.toFixed(5)}<br>Alt: ${sAlt}m`;
    }
    if (labelEndTextRef.current) {
      labelEndTextRef.current.innerHTML = `Lat: ${eLat.toFixed(5)}<br>Lon: ${eLon.toFixed(5)}<br>Alt: ${eAlt}m`;
    }
  };

  const viewHome = () => {
    const state = stateRef.current;
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    const center = new THREE.Vector3().addVectors(state.startPos, state.endPos).multiplyScalar(0.5);
    controls.target.copy(center);
    camera.position.set(state.startPos.x - 50, state.startPos.y + 50, state.startPos.z + 50);
    controls.update();
  };

  const randomOffsetPoint = (preset: MissionPreset) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * preset.radiusM;
    const northMeters = Math.cos(angle) * radius;
    const eastMeters = Math.sin(angle) * radius;
    const lat = preset.lat + (northMeters / 111320);
    const lon = preset.lon + (eastMeters / (111320 * Math.cos((preset.lat * Math.PI) / 180)));
    return { lat, lon };
  };

  const autoFill = () => {
    const state = stateRef.current;
    const presetId = presetRef.current?.value as MissionPreset['id'] | undefined;
    const preset = MISSION_PRESETS.find((entry) => entry.id === presetId) ?? DEFAULT_PRESET;
    const start = randomOffsetPoint(preset);
    const target = randomOffsetPoint(preset);
    const startAlt = 20;
    const endAlt = 50;
    const speed = 10;

    if (startLatRef.current) startLatRef.current.value = start.lat.toFixed(6);
    if (startLonRef.current) startLonRef.current.value = start.lon.toFixed(6);
    if (startAltRef.current) startAltRef.current.value = String(startAlt);
    if (endLatRef.current) endLatRef.current.value = target.lat.toFixed(6);
    if (endLonRef.current) endLonRef.current.value = target.lon.toFixed(6);
    if (endAltRef.current) endAltRef.current.value = String(endAlt);
    if (speedRef.current) speedRef.current.value = String(speed);

    if (statusRef.current) {
      statusRef.current.textContent = `${preset.label} mission ready`;
      statusRef.current.style.color = '#4ade80';
    }

    state.refLat = start.lat;
    state.refLon = start.lon;
    state.refAlt = startAlt;
    loadGroundMap(start.lat, start.lon, mapSourceRef.current, computeZoomForAlt(state.refAlt));

    const R = 6371000;
    const dLat = (target.lat - start.lat) * Math.PI / 180;
    const dLon = (target.lon - start.lon) * Math.PI / 180;
    const latRad = start.lat * Math.PI / 180;
    const dN = dLat * R;
    const dE = dLon * Math.cos(latRad) * R;

    state.startPos.set(0, startAlt, 0);
    state.endPos.set(dE, endAlt, -dN);

    updateLabelText(start.lat, start.lon, startAlt, target.lat, target.lon, endAlt);
    viewHome();
  };

  const togglePause = () => {
    const state = stateRef.current;
    if (!state.flying && !state.manualMode) return;
    state.paused = !state.paused;
    if (pauseBtnRef.current) {
      pauseBtnRef.current.textContent = state.paused ? 'Resume' : 'Pause';
      pauseBtnRef.current.style.background = state.paused ? '#22c55e' : '#facc15';
    }
    if (state.paused) {
      state.pauseTime = performance.now() / 1000;
    } else {
      state.totalPausedTime += performance.now() / 1000 - state.pauseTime;
    }
  };

  const toggleFollow = () => {
    const state = stateRef.current;
    state.following = !state.following;
    if (followBtnRef.current) {
      followBtnRef.current.textContent = state.following ? 'Follow Cam: ON' : 'Follow Cam: OFF';
      followBtnRef.current.classList.toggle('active', state.following);
    }
  };

  const toggleManual = () => {
    const state = stateRef.current;
    state.manualMode = !state.manualMode;
    state.paused = false;
    state.flying = false;
    state.totalPausedTime = 0;
    state.startTime = performance.now() / 1000;
    state.lastUpdateTime = state.startTime;
    state.manualDistance = 0;
    if (state.manualMode) {
      state.manualYaw = 0;
    }
    Object.keys(inputRef.current).forEach((key) => {
      inputRef.current[key as keyof typeof inputRef.current] = false;
    });
    state.currentPos.copy(state.droneGroup?.position ?? new THREE.Vector3());
    state.prevPos.copy(state.currentPos);
    state.startPos.copy(state.currentPos);
    state.endPos.copy(state.currentPos);
    state.trailPoints = [state.currentPos.clone()];
    state.trailLine?.geometry.setFromPoints(state.trailPoints);
    state.pathLine?.geometry.setFromPoints([state.currentPos, state.currentPos]);
    if (state.manualMode) {
      state.refLat = getNumber(startLatRef, state.refLat);
      state.refLon = getNumber(startLonRef, state.refLon);
      state.refAlt = getNumber(startAltRef, state.refAlt);
      loadGroundMap(state.refLat, state.refLon, mapSourceRef.current, computeZoomForAlt(state.refAlt));
    }

    if (statusRef.current) {
      statusRef.current.textContent = state.manualMode ? 'MANUAL' : 'Waiting...';
      statusRef.current.style.color = state.manualMode ? '#22d3ee' : '#38bdf8';
    }
    if (manualBtnRef.current) {
      manualBtnRef.current.textContent = state.manualMode ? 'Manual Pilot: ON' : 'Manual Pilot: OFF';
      manualBtnRef.current.classList.toggle('active', state.manualMode);
    }
    if (pauseBtnRef.current) {
      pauseBtnRef.current.textContent = 'Pause';
      pauseBtnRef.current.style.background = '#facc15';
    }
  };

  const handleBottomFovChange = (value: number) => {
    const next = Math.max(20, Math.min(140, value));
    setBottomFov(next);
    Object.values(droneCameraRefs.current).forEach((camera) => {
      if (!camera) return;
      camera.fov = next;
      camera.updateProjectionMatrix();
    });
    bottomFovHelperRef.current?.update();
  };

  const toggleCameraView = (view: CameraViewKey) => {
    setCameraViews((prev) => ({ ...prev, [view]: !prev[view] }));
  };

  const activeCameraViewKeys = (Object.keys(cameraViews) as CameraViewKey[]).filter((key) => cameraViews[key]);

  const handleManualInputModeChange = (mode: ManualInputMode) => {
    setManualInputMode(mode);
    const state = stateRef.current;
    if ((mode === 'rc' || mode === 'joystick') && !state.manualMode) {
      toggleManual();
    }
    if (mode === 'keyboard') {
      setManualControlStatus('Keyboard control active.');
      return;
    }
    if (mode === 'rc') {
      setManualControlStatus(gamepadConnected
        ? 'RC mode active. Live transmitter input is driving manual flight.'
        : 'RC mode selected. Connect the transmitter USB joystick device to drive manual flight.');
      return;
    }
    setManualControlStatus(gamepadConnected
      ? 'Joystick mode active. Live controller input is driving manual flight.'
      : 'Joystick mode selected. Connect a joystick device to drive manual flight.');
  };

  const handleManualCalibration = (mode: Extract<ManualInputMode, 'rc' | 'joystick'>) => {
    if (mode === 'rc') {
      setCalibrationPanel('rc');
      setManualControlStatus('RC calibration panel open.');
      return;
    }
    setCalibrationPanel('joystick');
    setManualControlStatus('Joystick calibration panel open.');
  };

  const toggleAxisReverse = (axis: AxisKey) => {
    setAxisReverse((prev) => ({ ...prev, [axis]: !prev[axis] }));
  };

  const persistRcConfig = useCallback((overrides?: Partial<{
    profile_id: RcProfileId;
    stick_mode: 1 | 2;
    reversed: Record<AxisKey, boolean>;
    calibration: Record<AxisKey, AxisCalibration>;
  }>) => {
    fetch(`${API_BASE}/rc/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: overrides?.profile_id ?? rcProfileId,
        stick_mode: overrides?.stick_mode ?? rcStickMode,
        reversed: overrides?.reversed ?? axisReverse,
        calibration: overrides?.calibration ?? rcCalibrationData,
      }),
    }).catch(() => undefined);
  }, [axisReverse, rcCalibrationData, rcProfileId, rcStickMode]);

  const handleRcCalibrationAction = () => {
    if (!rcCalibrationRunning) {
      const seed: Record<AxisKey, AxisCalibration> = {
        roll: { min: rcPwm.roll, center: rcPwm.roll, max: rcPwm.roll },
        pitch: { min: rcPwm.pitch, center: rcPwm.pitch, max: rcPwm.pitch },
        yaw: { min: rcPwm.yaw, center: rcPwm.yaw, max: rcPwm.yaw },
        throttle: { min: rcPwm.throttle, center: rcPwm.throttle, max: rcPwm.throttle },
      };
      rcCalibrationCaptureRef.current = seed;
      setRcCalibrationRunning(true);
      setRcCalibrationMessage('Calibration started. Move every stick through full travel, then click Finish Calibration.');
      return;
    }

    const captured = rcCalibrationCaptureRef.current;
    setRcCalibrationData(captured);
    setRcCalibrationRunning(false);
    setRcCalibrationMessage('Calibration saved. Min / center / max endpoints updated from live transmitter input.');
    persistRcConfig({ calibration: captured });
  };

  const handleMapSourceChange = (value: GroundSource) => {
    mapSourceRef.current = value;
    setMapSource(value);
    const state = stateRef.current;
    const lat = state.refLat || MAP_DEFAULT[1];
    const lon = state.refLon || MAP_DEFAULT[0];
    const baseAlt = state.refAlt || getNumber(startAltRef, 50);
    const zoom = computeZoomForAlt(baseAlt);
    loadGroundMap(lat, lon, value, zoom);
  };

  const handleMapZoomMinChange = (value: number) => {
    const next = Math.max(1, Math.min(19, Math.round(value)));
    let max = mapZoomMaxRef.current;
    if (next > max) {
      max = next;
      mapZoomMaxRef.current = max;
      setMapZoomMax(max);
    }
    mapZoomMinRef.current = next;
    setMapZoomMin(next);
    const state = stateRef.current;
    const lat = state.refLat || MAP_DEFAULT[1];
    const lon = state.refLon || MAP_DEFAULT[0];
    const zoom = computeZoomForAlt(state.currentPos.y || state.refAlt || 50);
    loadGroundMap(lat, lon, mapSourceRef.current, zoom);
  };

  const handleMapZoomMaxChange = (value: number) => {
    const next = Math.max(1, Math.min(19, Math.round(value)));
    let min = mapZoomMinRef.current;
    if (next < min) {
      min = next;
      mapZoomMinRef.current = min;
      setMapZoomMin(min);
    }
    mapZoomMaxRef.current = next;
    setMapZoomMax(next);
    const state = stateRef.current;
    const lat = state.refLat || MAP_DEFAULT[1];
    const lon = state.refLon || MAP_DEFAULT[0];
    const zoom = computeZoomForAlt(state.currentPos.y || state.refAlt || 50);
    loadGroundMap(lat, lon, mapSourceRef.current, zoom);
  };

  const computeZoomForAlt = (alt: number) => {
    const minZoom = mapZoomMinRef.current;
    const maxZoom = mapZoomMaxRef.current;
    const baseAlt = Math.max(10, stateRef.current.refAlt || getNumber(startAltRef, 50) || 50);
    const ratio = Math.max(1, alt) / baseAlt;
    const raw = maxZoom - Math.log2(ratio);
    return Math.max(minZoom, Math.min(maxZoom, raw));
  };

  const loadGroundMap = useCallback((lat: number, lon: number, sourceOverride?: GroundSource, zoomOverride?: number) => {
    const state = stateRef.current;
    const plane = state.groundPlane;
    if (!plane) return;

    const { tileSize, grid } = MAP_TILE;
    const zoom = Math.max(1, Math.min(19, Math.round(zoomOverride ?? mapZoomMaxRef.current)));
    const source = sourceOverride ?? mapSourceRef.current;
    const latRad = (lat * Math.PI) / 180;
    const n = 2 ** zoom;
    const centerX = Math.floor(((lon + 180) / 360) * n);
    const centerY = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    const last = lastMapRef.current;
    if (last && last.x === centerX && last.y === centerY && last.zoom === zoom && last.source === source) {
      return;
    }
    lastMapRef.current = { x: centerX, y: centerY, zoom, source };
    const half = Math.floor(grid / 2);

    let canvas = groundCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      groundCanvasRef.current = canvas;
    }
    canvas.width = tileSize * grid;
    canvas.height = tileSize * grid;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setMapStatus('Map tiles: loading...');
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    const gridStep = tileSize;
    for (let x = 0; x <= canvas.width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const requestId = ++groundLoadIdRef.current;
    let loadedCount = 0;
    const totalTiles = grid * grid;
    const osmHosts = ['https://a.tile.openstreetmap.org', 'https://b.tile.openstreetmap.org', 'https://c.tile.openstreetmap.org'];
    const loadTile = (tx: number, ty: number) => new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        const dx = (tx - centerX + half) * tileSize;
        const dy = (ty - centerY + half) * tileSize;
        ctx.drawImage(img, dx, dy, tileSize, tileSize);
        loadedCount += 1;
        resolve();
      };
      img.onerror = () => resolve();
      const url = source === 'satellite'
        ? `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`
        : `${osmHosts[Math.abs(tx + ty) % osmHosts.length]}/${zoom}/${tx}/${ty}.png`;
      img.src = url;
    });

    const loads: Promise<void>[] = [];
    for (let dy = -half; dy <= half; dy += 1) {
      for (let dx = -half; dx <= half; dx += 1) {
        loads.push(loadTile(centerX + dx, centerY + dy));
      }
    }

    Promise.all(loads).then(() => {
      if (groundLoadIdRef.current !== requestId) return;

      let texture = groundTextureRef.current;
      if (!texture) {
        texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        groundTextureRef.current = texture;
      } else {
        texture.needsUpdate = true;
      }

      if (loadedCount === 0 && source === 'satellite') {
        mapSourceRef.current = 'streets';
        setMapSource('streets');
        setMapStatus('Map tiles: satellite blocked, retrying streets...');
        loadGroundMap(lat, lon, 'streets');
        return;
      }

      if (loadedCount === 0) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Segoe UI, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MAP DATA UNAVAILABLE', canvas.width / 2, canvas.height / 2);
        texture.needsUpdate = true;
        setMapStatus('Map tiles: failed. Check network or allowlist tile servers.');
      } else {
        setMapStatus(
          `Map tiles: ${loadedCount}/${totalTiles} loaded (z${zoom}) • ${source} @ ${lat.toFixed(5)}, ${lon.toFixed(5)}.`
        );
      }

      const earthRadius = 6378137;
      const metersPerPixel = (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * earthRadius) / (tileSize * 2 ** zoom);
      const planeSize = metersPerPixel * tileSize * grid;

      plane.geometry.dispose();
      plane.geometry = new THREE.PlaneGeometry(planeSize, planeSize);
      if (plane.material instanceof THREE.MeshBasicMaterial) {
        plane.material.map = texture;
        plane.material.needsUpdate = true;
      }
    });
  }, []);

  const applyMissionPreset = useCallback((presetId: MissionPreset['id']) => {
    const preset = MISSION_PRESETS.find((entry) => entry.id === presetId) ?? DEFAULT_PRESET;
    if (startLatRef.current) startLatRef.current.value = preset.lat.toFixed(6);
    if (startLonRef.current) startLonRef.current.value = preset.lon.toFixed(6);
    if (startAltRef.current && !startAltRef.current.value) startAltRef.current.value = '50';
    stateRef.current.refLat = preset.lat;
    stateRef.current.refLon = preset.lon;
    loadGroundMap(preset.lat, preset.lon, mapSourceRef.current, computeZoomForAlt(stateRef.current.refAlt));
  }, [loadGroundMap]);

  const launchMission = () => {
    const state = stateRef.current;
    const startLat = getNumber(startLatRef, NaN);
    const endLat = getNumber(endLatRef, NaN);
    if (!Number.isFinite(startLat) || !Number.isFinite(endLat)) {
      window.alert('Please Auto-Fill first.');
      return;
    }

    state.manualMode = false;
    if (manualBtnRef.current) {
      manualBtnRef.current.textContent = 'Manual Pilot: OFF';
      manualBtnRef.current.classList.remove('active');
    }

    state.refLat = startLat;
    state.refLon = getNumber(startLonRef, 0);
    state.refAlt = getNumber(startAltRef, 0);
    loadGroundMap(state.refLat, state.refLon, mapSourceRef.current, computeZoomForAlt(state.refAlt));

    const tLat = getNumber(endLatRef, 0);
    const tLon = getNumber(endLonRef, 0);
    const tAlt = getNumber(endAltRef, 0);

    const R = 6378137;
    const dLat = (tLat - state.refLat) * Math.PI / 180;
    const dLon = (tLon - state.refLon) * Math.PI / 180;
    const latRad = state.refLat * Math.PI / 180;
    const distN = dLat * R;
    const distE = dLon * Math.cos(latRad) * R;

    state.startPos.set(0, state.refAlt, 0);
    state.endPos.set(distE, tAlt, -distN);

    const dist = state.startPos.distanceTo(state.endPos);
    const speed = Math.max(0.1, getNumber(speedRef, 10));
    state.duration = dist / speed;
    state.startTime = performance.now() / 1000;
    state.totalPausedTime = 0;
    state.paused = false;
    state.flying = true;
    state.currentPos.copy(state.startPos);

    state.trailPoints = [];
    state.trailPoints.push(state.startPos.clone());
    state.trailLine?.geometry.setFromPoints(state.trailPoints);
    state.prevPos.copy(state.startPos);

    if (statusRef.current) {
      statusRef.current.textContent = 'IN FLIGHT';
      statusRef.current.style.color = '#38bdf8';
    }
    if (pauseBtnRef.current) pauseBtnRef.current.textContent = 'Pause';

    state.pathLine?.geometry.setFromPoints([state.startPos, state.endPos]);
    updateLabelText(state.refLat, state.refLon, state.refAlt, tLat, tLon, tAlt);
  };

  const resetSim = () => {
    const state = stateRef.current;
    state.flying = false;
    state.paused = false;
    state.manualMode = false;
    state.manualDistance = 0;
    state.velocity.set(0, 0, 0);
    state.acceleration.set(0, 0, 0);
    state.droneGroup?.position.set(0, 0, 0);
    state.axisGroup?.position.set(0, 0, 0);
    state.trailPoints = [];
    state.trailLine?.geometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]);
    if (streamRef.current) streamRef.current.textContent = `${buildWsHeader()}Simulation Reset.`;
    if (statusRef.current) {
      statusRef.current.textContent = 'Ready';
      statusRef.current.style.color = '#38bdf8';
    }
    if (pauseBtnRef.current) pauseBtnRef.current.textContent = 'Pause';
    if (manualBtnRef.current) {
      manualBtnRef.current.textContent = 'Manual Pilot: OFF';
      manualBtnRef.current.classList.remove('active');
    }
  };

  useEffect(() => {
    applyMissionPreset(DEFAULT_PRESET.id);
  }, [applyMissionPreset]);

  useEffect(() => {
    manualInputModeRef.current = manualInputMode;
  }, [manualInputMode]);

  useEffect(() => {
    gamepadConnectedRef.current = gamepadConnected;
  }, [gamepadConnected]);

  useEffect(() => {
    cameraViewStateRef.current = cameraViews;
  }, [cameraViews]);

  useEffect(() => {
    axisReverseRef.current = axisReverse;
  }, [axisReverse]);

  useEffect(() => {
    rcPwmRef.current = rcPwm;
  }, [rcPwm]);

  useEffect(() => {
    rcCalibrationDataRef.current = rcCalibrationData;
  }, [rcCalibrationData]);

  const activeRcProfile = RC_PROFILES.find((profile) => profile.id === rcProfileId) ?? RC_PROFILES[0];
  const rcMonitorValues = rcAuxPwm.map((value) => Math.max(0, Math.min(100, ((value - 1000) / 1000) * 100)));

  useEffect(() => {
    let mounted = true;
    fetch(`${API_BASE}/rc/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        if (data.profile_id) setRcProfileId(data.profile_id as RcProfileId);
        if (data.stick_mode === 1 || data.stick_mode === 2) setRcStickMode(data.stick_mode);
        if (data.reversed) {
          setAxisReverse({
            roll: Boolean(data.reversed.roll),
            pitch: Boolean(data.reversed.pitch),
            yaw: Boolean(data.reversed.yaw),
            throttle: Boolean(data.reversed.throttle),
          });
        }
        if (data.calibration) {
          const nextCalibration = {
            roll: data.calibration.roll ?? { min: 1000, center: 1500, max: 2000 },
            pitch: data.calibration.pitch ?? { min: 1000, center: 1500, max: 2000 },
            yaw: data.calibration.yaw ?? { min: 1000, center: 1500, max: 2000 },
            throttle: data.calibration.throttle ?? { min: 1000, center: 1000, max: 2000 },
          };
          setRcCalibrationData(nextCalibration);
          rcCalibrationCaptureRef.current = nextCalibration;
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    persistRcConfig();
  }, [axisReverse, persistRcConfig, rcProfileId, rcStickMode]);

  useEffect(() => {
    let rafId = 0;
    const toPwm = (value: number, axis: AxisKey) => {
      const next = axisReverse[axis] ? -value : value;
      if (axis === 'throttle') {
        const normalized = (1 - next) / 2;
        return Math.round(1000 + normalized * 1000);
      }
      return Math.round(1500 + next * 500);
    };

    const update = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find(Boolean) ?? null;
      if (pad) {
        setGamepadConnected(true);
        setGamepadName(pad.id || 'Generic Gamepad');

        const yawAxis = rcProfileId === 'radiomaster-pocket'
          ? (pad.axes[3] ?? 0)
          : (() => {
            const yawFallbackCandidates = [pad.axes[3], pad.axes[4], pad.axes[5]]
              .map((value, index) => ({ value: value ?? 0, axisIndex: index + 3 }))
              .filter(({ value }) => Math.abs(value) < 0.98)
              .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
            return yawFallbackCandidates[0]?.value ?? (pad.axes[3] ?? 0);
          })();

        const axes: Record<AxisKey, number> = {
          roll: pad.axes[0] ?? 0,
          pitch: pad.axes[1] ?? 0,
          throttle: pad.axes[2] ?? -1,
          yaw: Math.abs(yawAxis) > 0.05 ? yawAxis : 0,
        };
        gamepadAxesRef.current = axes;

        const pwm = {
          roll: toPwm(axes.roll, 'roll'),
          pitch: toPwm(axes.pitch, 'pitch'),
          yaw: toPwm(axes.yaw, 'yaw'),
          throttle: toPwm(axes.throttle, 'throttle'),
        };
        setRcPwm(pwm);
        if (rcCalibrationRunning) {
          const nextCapture: Record<AxisKey, AxisCalibration> = {
            roll: {
              min: Math.min(rcCalibrationCaptureRef.current.roll.min, pwm.roll),
              center: rcCalibrationCaptureRef.current.roll.center,
              max: Math.max(rcCalibrationCaptureRef.current.roll.max, pwm.roll),
            },
            pitch: {
              min: Math.min(rcCalibrationCaptureRef.current.pitch.min, pwm.pitch),
              center: rcCalibrationCaptureRef.current.pitch.center,
              max: Math.max(rcCalibrationCaptureRef.current.pitch.max, pwm.pitch),
            },
            yaw: {
              min: Math.min(rcCalibrationCaptureRef.current.yaw.min, pwm.yaw),
              center: rcCalibrationCaptureRef.current.yaw.center,
              max: Math.max(rcCalibrationCaptureRef.current.yaw.max, pwm.yaw),
            },
            throttle: {
              min: Math.min(rcCalibrationCaptureRef.current.throttle.min, pwm.throttle),
              center: rcCalibrationCaptureRef.current.throttle.center,
              max: Math.max(rcCalibrationCaptureRef.current.throttle.max, pwm.throttle),
            },
          };
          rcCalibrationCaptureRef.current = nextCapture;
        }

        const aux = Array.from({ length: 10 }, (_, index) => {
          const button = pad.buttons[index];
          return Math.round(1000 + (button?.value ?? 0) * 1000);
        });
        setRcAuxPwm(aux);
        setJoystickMonitorValues([
          ((axes.roll + 1) / 2) * 100,
          ((axes.pitch + 1) / 2) * 100,
          ((axes.throttle + 1) / 2) * 100,
          ((axes.yaw + 1) / 2) * 100,
          ((pad.axes[4] ?? 0) + 1) * 50,
          ((pad.axes[5] ?? 0) + 1) * 50,
        ]);

        const now = performance.now();
        if (now - rcStatusPushRef.current > 250) {
          rcStatusPushRef.current = now;
          fetch(`${API_BASE}/rc/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connected: true,
              gamepad_id: pad.id,
              axes,
              pwm,
              buttons: Object.fromEntries(aux.map((value, index) => [`ch${index + 5}`, value])),
            }),
          }).catch(() => undefined);
        }
      } else {
        setGamepadConnected(false);
        setGamepadName('No controller detected');
      }
      rafId = window.requestAnimationFrame(update);
    };

    rafId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(rafId);
  }, [axisReverse, rcCalibrationRunning, rcProfileId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const state = stateRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 2000, 10000);

    const width = viewport.clientWidth || 1;
    const height = viewport.clientHeight || 1;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 20000);
    camera.position.set(-50, 50, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    viewport.appendChild(renderer.domElement);

    const streamRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    streamRenderer.setSize(INSET.width, INSET.height);
    streamRenderer.shadowMap.enabled = true;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.zoomToCursor = true;
    controls.target.set(0, 0, 0);
    controls.maxDistance = 8000;
    controls.minDistance = 15;
    controls.zoomSpeed = 0.25;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const planeGeo = new THREE.PlaneGeometry(2000, 2000);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);
    state.groundPlane = plane;

    state.droneGroup = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(1.0, 0.4, 1.0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    state.droneGroup.add(body);

    const positions = [
      { x: 1.2, z: 1.2 }, { x: -1.2, z: -1.2 },
      { x: 1.2, z: -1.2 }, { x: -1.2, z: 1.2 }
    ];

    const forwardArmTextureCanvas = document.createElement('canvas');
    forwardArmTextureCanvas.width = 32;
    forwardArmTextureCanvas.height = 256;
    const forwardArmCtx = forwardArmTextureCanvas.getContext('2d');
    if (forwardArmCtx) {
      forwardArmCtx.fillStyle = '#7f1d1d';
      forwardArmCtx.fillRect(0, 0, forwardArmTextureCanvas.width, forwardArmTextureCanvas.height);
      forwardArmCtx.fillStyle = '#ef4444';
      for (let y = 0; y < forwardArmTextureCanvas.height; y += 28) {
        forwardArmCtx.fillRect(0, y, forwardArmTextureCanvas.width, 12);
      }
    }
    const forwardArmTexture = new THREE.CanvasTexture(forwardArmTextureCanvas);
    forwardArmTexture.wrapS = THREE.RepeatWrapping;
    forwardArmTexture.wrapT = THREE.RepeatWrapping;
    forwardArmTexture.needsUpdate = true;

    const rearArmMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.35 });
    const forwardArmMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: forwardArmTexture,
      metalness: 0.5,
      roughness: 0.35
    });

    const addArm = (x: number, z: number) => {
      const armLength = Math.hypot(x, z);
      const armGeo = new THREE.CylinderGeometry(0.1, 0.1, armLength, 16);
      const isForwardArm = z > 0;
      const arm = new THREE.Mesh(armGeo, isForwardArm ? forwardArmMat : rearArmMat);
      arm.position.set(x / 2, 0, z / 2);
      arm.castShadow = true;
      arm.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(x, 0, z).normalize()
      );
      state.droneGroup.add(arm);
    };

    positions.forEach((pos) => addArm(pos.x, pos.z));

    const motorGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
    const propGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.02, 32);
    const propMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.4 });

    positions.forEach(pos => {
      const motor = new THREE.Mesh(motorGeo, motorMat);
      motor.position.set(pos.x, 0.1, pos.z);
      state.droneGroup?.add(motor);

      const prop = new THREE.Mesh(propGeo, propMat);
      prop.position.set(pos.x, 0.25, pos.z);
      state.droneGroup?.add(prop);
    });

    const arrowGeo = new THREE.ConeGeometry(0.24, 0.85, 32);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.rotation.x = Math.PI / 2;
    arrowMesh.position.z = 0.9;
    state.droneGroup.add(arrowMesh);

    state.velArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 0, 0x4ade80);
    state.accArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 0, 0xf87171);
    state.droneGroup.add(state.velArrow);
    state.droneGroup.add(state.accArrow);

    scene.add(state.droneGroup);

    const axisGroup = new THREE.Group();
    const axisLength = 8;
    const makeAxis = (dir: THREE.Vector3, color: number) => {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        dir.clone().multiplyScalar(axisLength)
      ]);
      const mat = new THREE.LineBasicMaterial({ color });
      return new THREE.Line(geom, mat);
    };
    axisGroup.add(makeAxis(new THREE.Vector3(1, 0, 0), 0x00ff00)); // +X
    axisGroup.add(makeAxis(new THREE.Vector3(-1, 0, 0), 0xffffff)); // -X
    axisGroup.add(makeAxis(new THREE.Vector3(0, 0, -1), 0xff0000)); // +Y (north)
    axisGroup.add(makeAxis(new THREE.Vector3(0, 0, 1), 0x0000ff)); // -Y (south)
    scene.add(axisGroup);
    state.axisGroup = axisGroup;

    const bottomCamera = new THREE.PerspectiveCamera(60, INSET.width / INSET.height, 0.1, 5000);
    bottomCamera.position.set(0, -1.4, 0);
    bottomCamera.rotation.x = -Math.PI / 2;
    state.droneGroup.add(bottomCamera);
    const bottomFovHelper = new THREE.CameraHelper(bottomCamera);
    bottomFovHelper.setColors(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff);
    const helperMaterial = bottomFovHelper.material as THREE.LineBasicMaterial;
    helperMaterial.color.set(0xffffff);
    helperMaterial.vertexColors = false;
    helperMaterial.transparent = true;
    helperMaterial.opacity = 0.9;
    helperMaterial.depthTest = false;
    scene.add(bottomFovHelper);

    const bottomCleanCamera = new THREE.PerspectiveCamera(60, INSET.width / INSET.height, 0.1, 5000);
    bottomCleanCamera.position.copy(bottomCamera.position);
    bottomCleanCamera.rotation.copy(bottomCamera.rotation);
    state.droneGroup.add(bottomCleanCamera);

    const frontCamera = new THREE.PerspectiveCamera(60, INSET.width / INSET.height, 0.1, 5000);
    frontCamera.position.set(0, 0.15, 0.7);
    frontCamera.rotation.x = -0.08;
    state.droneGroup.add(frontCamera);

    const leftCamera = new THREE.PerspectiveCamera(60, INSET.width / INSET.height, 0.1, 5000);
    leftCamera.position.set(-0.7, 0.1, 0);
    leftCamera.rotation.y = -Math.PI / 2;
    state.droneGroup.add(leftCamera);

    const rightCamera = new THREE.PerspectiveCamera(60, INSET.width / INSET.height, 0.1, 5000);
    rightCamera.position.set(0.7, 0.1, 0);
    rightCamera.rotation.y = Math.PI / 2;
    state.droneGroup.add(rightCamera);

    const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 1, opacity: 0.5, transparent: true });
    const lineGeo = new THREE.BufferGeometry();
    state.pathLine = new THREE.Line(lineGeo, lineMat);
    state.pathLine.frustumCulled = false;
    scene.add(state.pathLine);

    const trailMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
    const trailGeo = new THREE.BufferGeometry();
    state.trailLine = new THREE.Line(trailGeo, trailMat);
    state.trailLine.frustumCulled = false;
    scene.add(state.trailLine);

    const updateLabelPositions = () => {
      const viewportEl = viewportRef.current;
      const lblStart = labelStartRef.current;
      const lblEnd = labelEndRef.current;
      if (!viewportEl || !lblStart || !lblEnd) return;

      const updateLabel = (position: THREE.Vector3, element: HTMLDivElement) => {
        const vec = position.clone();
        vec.project(camera);

        const isBehind = vec.z > 1;
        const isOffScreen = Math.abs(vec.x) > 1.1 || Math.abs(vec.y) > 1.1;

        if (isBehind || isOffScreen) {
          element.style.opacity = '0';
        } else {
          element.style.opacity = '1';
          const x = (vec.x * 0.5 + 0.5) * viewportEl.clientWidth;
          const y = (vec.y * -0.5 + 0.5) * viewportEl.clientHeight;
          element.style.left = `${x}px`;
          element.style.top = `${y}px`;
        }
      };

      if (lblStart.style.display !== 'none') updateLabel(state.startPos, lblStart);
      if (lblEnd.style.display !== 'none') updateLabel(state.endPos, lblEnd);
    };

    const generateDataPacket = (lat: number, lon: number, alt: number) => {
      const mode = modeRef.current?.value ?? 'GPS_INPUT';
      let text = buildWsHeader();
      const vx = state.velocity.x;
      const vz = -state.velocity.z;
      const vy = state.velocity.y;
      const ax = state.acceleration.x;
      const az = -state.acceleration.z;
      const ay = state.acceleration.y;
      const speed2d = Math.hypot(vx, vz);
      const yawRad = speed2d > 0.001 ? Math.atan2(vx, vz) : 0;
      const yawCentideg = Math.round(((yawRad * 180 / Math.PI) + 360) % 360 * 100);
      const timeUsec = Math.floor((performance.now() - state.bootTime) * 1000);
      const iTow = Math.floor((performance.now() - state.bootTime) % 604800000);
      const velNmm = Math.round(vz * 1000);
      const velEmm = Math.round(vx * 1000);
      const velDmm = Math.round(-vy * 1000);
      const headMot = Math.round(((yawRad * 180 / Math.PI) + 360) % 360 * 100000);
      const halfYaw = yawRad * 0.5;
      const qx = 0;
      const qy = 0;
      const qz = Math.sin(halfYaw);
      const qw = Math.cos(halfYaw);

      if (mode === 'GPS_INPUT') {
        text += '[MAVLINK MSG: GPS_INPUT]\n------------------------\n';
        text += `time_usec: ${timeUsec}\n`;
        text += `lat: ${Math.floor(lat * 1e7)}, lon: ${Math.floor(lon * 1e7)}\n`;
        text += `alt: ${alt.toFixed(2)} m\n`;
        text += `vn: ${vz.toFixed(2)} ve: ${vx.toFixed(2)} vd: ${(-vy).toFixed(2)}\n`;
        text += `ax: ${az.toFixed(2)} ay: ${ax.toFixed(2)} az: ${ay.toFixed(2)}\n`;
        text += `yaw: ${yawCentideg}\n`;
        text += `hdop: 0.9\n`;
        text += `vdop: 1.1\n`;
      } else if (mode === 'ODOM') {
        text += '[ROS MSG: nav_msgs/Odometry]\n----------------------------\n';
        text += 'frame: odom -> base_link\n';
        text += `pose.pose.position: {x:${vz.toFixed(2)}, y:${vx.toFixed(2)}, z:${vy.toFixed(2)}}\n`;
        text += `pose.pose.orientation: {x:${qx.toFixed(4)}, y:${qy.toFixed(4)}, z:${qz.toFixed(4)}, w:${qw.toFixed(4)}}\n`;
        text += `twist.twist.linear: {x:${vz.toFixed(2)}, y:${vx.toFixed(2)}, z:${vy.toFixed(2)}}\n`;
        text += 'twist.twist.angular: {x:0.00, y:0.00, z:0.00}\n';
        text += `pose.covariance: [${Array(36).fill(0).join(', ')}]\n`;
        text += `twist.covariance: [${Array(36).fill(0).join(', ')}]\n`;
      } else if (mode === 'UBX') {
        text += '[UBX PAYLOAD: NAV-PVT]\n----------------------\n';
        text += `iTOW: ${iTow}\n`;
        text += `lat: ${Math.floor(lat * 1e7)}, lon: ${Math.floor(lon * 1e7)}\n`;
        text += `hMSL: ${Math.floor(alt * 1000)} mm\n`;
        text += `velN: ${velNmm} velE: ${velEmm} velD: ${velDmm}\n`;
        text += `headMot: ${headMot}\n`;
        text += 'fixType: 3\n';
        text += 'hAcc: 800 vAcc: 900\n';
      }

      if (streamRef.current) streamRef.current.textContent = text;
    };

    const updateLoop = () => {
      controls.update();
      updateLabelPositions();

      const now = performance.now() / 1000;

      if (state.manualMode) {
        if (state.paused) {
          state.lastUpdateTime = now;
          return;
        }

        const dt = Math.min(0.05, Math.max(0.001, now - state.lastUpdateTime));
        state.lastUpdateTime = now;
        const input = inputRef.current;

        const yawRate = 1.4;
        if (input.yawLeft) state.manualYaw -= yawRate * dt;
        if (input.yawRight) state.manualYaw += yawRate * dt;

        let forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
        let strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        let vertical = (input.up ? 1 : 0) - (input.down ? 1 : 0);
        if ((manualInputModeRef.current === 'joystick' || manualInputModeRef.current === 'rc') && gamepadConnectedRef.current) {
          const normalizePwm = (axis: AxisKey) => {
            const pwm = rcPwmRef.current[axis];
            const calibration = rcCalibrationDataRef.current[axis];
            const midpoint = axis === 'throttle'
              ? (calibration.min + calibration.max) * 0.5
              : calibration.center;
            if (pwm >= midpoint) {
              return Math.min(1, (pwm - midpoint) / Math.max(1, calibration.max - midpoint));
            }
            return -Math.min(1, (midpoint - pwm) / Math.max(1, midpoint - calibration.min));
          };

          const rollInput = normalizePwm('roll');
          const pitchInput = normalizePwm('pitch');
          const throttleInput = normalizePwm('throttle');
          const yawInput = normalizePwm('yaw');

          strafe = Math.abs(rollInput) > 0.08 ? rollInput : 0;
          forward = Math.abs(pitchInput) > 0.08 ? -pitchInput : 0;
          vertical = Math.abs(throttleInput) > 0.08 ? -throttleInput : 0;
          if (Math.abs(yawInput) > 0.08) state.manualYaw += yawInput * yawRate * dt;
        }

        const prevPos = state.currentPos.clone();
        if (forward !== 0 || strafe !== 0) {
          const yaw = state.manualYaw;
          const forwardVec = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
          const rightVec = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
          const move = new THREE.Vector3()
            .addScaledVector(forwardVec, forward)
            .addScaledVector(rightVec, strafe);
          if (move.lengthSq() > 1) move.normalize();
          state.currentPos.addScaledVector(move, state.manualSpeed * dt);
        }
        if (vertical !== 0) {
          state.currentPos.y += vertical * state.manualVertSpeed * dt;
        }

        const stepDist = state.currentPos.distanceTo(prevPos);
        state.manualDistance += stepDist;
        const newVel = state.currentPos.clone().sub(prevPos).divideScalar(dt);
        const newAcc = newVel.clone().sub(state.velocity).divideScalar(dt);
        state.velocity.copy(newVel);
        state.acceleration.copy(newAcc);
        state.prevPos.copy(state.currentPos);

        state.droneGroup?.position.copy(state.currentPos);
        const lookDir = new THREE.Vector3(Math.sin(state.manualYaw), 0, -Math.cos(state.manualYaw));
        state.droneGroup?.lookAt(state.currentPos.clone().add(lookDir));
        if (state.following) {
          const delta = new THREE.Vector3().subVectors(state.currentPos, prevPos);
          camera.position.add(delta);
          controls.target.copy(state.currentPos);
        }

        state.trailPoints.push(state.currentPos.clone());
        state.trailLine?.geometry.setFromPoints(state.trailPoints);

        if (state.velArrow) {
          state.velArrow.visible = state.velocity.length() > 0.1;
          state.velArrow.setDirection(new THREE.Vector3(0, 0, 1));
          state.velArrow.setLength(state.velocity.length() * 0.5);
        }
        if (state.accArrow) {
          state.accArrow.visible = state.acceleration.length() > 0.1;
          state.accArrow.setDirection(new THREE.Vector3(0, 0, 1));
          state.accArrow.setLength(state.acceleration.length() * 0.5);
        }

        if (distRef.current) {
          distRef.current.textContent = `Dist: ${Math.floor(state.manualDistance)}m`;
        }

        if (state.axisGroup) {
          state.axisGroup.position.copy(state.currentPos);
        }
        const dE = state.currentPos.x;
        const dN = -state.currentPos.z;
        const R = 6378137;
        const dLat = dN / R * (180 / Math.PI);
        const dLon = dE / (R * Math.cos(state.refLat * Math.PI / 180)) * (180 / Math.PI);

      const curLat = state.refLat + dLat;
      const curLon = state.refLon + dLon;
      const curAlt = state.currentPos.y;

      generateDataPacket(curLat, curLon, curAlt);
      loadGroundMap(state.refLat, state.refLon, mapSourceRef.current, computeZoomForAlt(curAlt));
      return;
      }

      if (!state.flying || state.paused) return;

      const elapsed = now - state.startTime - state.totalPausedTime;
      const progress = Math.min(elapsed / state.duration, 1.0);

      state.prevPos.copy(state.currentPos);
      state.currentPos.lerpVectors(state.startPos, state.endPos, progress);

      const speed = Math.max(0.1, getNumber(speedRef, 10));
      const moveVec = new THREE.Vector3().subVectors(state.endPos, state.startPos);

      if (progress < 1.0) {
        state.velocity.copy(moveVec).normalize().multiplyScalar(speed);
      } else {
        state.velocity.set(0, 0, 0);
        state.acceleration.set(0, 0, 0);
        state.flying = false;
        if (statusRef.current) statusRef.current.textContent = 'ARRIVED';
        if (pauseBtnRef.current) pauseBtnRef.current.textContent = 'Done';
      }

      if (progress < 0.1) state.acceleration.copy(state.velocity).multiplyScalar(2);
      else if (progress > 0.9) state.acceleration.copy(state.velocity).multiplyScalar(-2);
      else state.acceleration.set(0, 0, 0);

      state.droneGroup?.position.copy(state.currentPos);

      if (state.following) {
        const delta = new THREE.Vector3().subVectors(state.currentPos, state.prevPos);
        camera.position.add(delta);
        controls.target.copy(state.currentPos);
      }

      if (state.velocity.lengthSq() > 0.01) {
        const target = state.currentPos.clone().add(state.velocity);
        state.droneGroup?.lookAt(target);
      }

      if (state.velocity.length() > 0.1) {
        if (state.velArrow) {
          state.velArrow.visible = true;
          state.velArrow.setDirection(new THREE.Vector3(0, 0, 1));
          state.velArrow.setLength(state.velocity.length() * 0.5);
        }
      } else if (state.velArrow) {
        state.velArrow.visible = false;
      }
      if (state.accArrow) {
        state.accArrow.visible = state.acceleration.length() > 0.1;
        state.accArrow.setDirection(new THREE.Vector3(0, 0, 1));
        state.accArrow.setLength(state.acceleration.length() * 0.5);
      }

      state.trailPoints.push(state.currentPos.clone());
      state.trailLine?.geometry.setFromPoints(state.trailPoints);

      if (distRef.current) {
        distRef.current.textContent = `Dist: ${Math.floor(state.startPos.distanceTo(state.endPos) * (1 - progress))}m`;
      }

      if (state.axisGroup) {
        state.axisGroup.position.copy(state.currentPos);
      }
      const dE = state.currentPos.x;
      const dN = -state.currentPos.z;
      const R = 6378137;
      const dLat = dN / R * (180 / Math.PI);
      const dLon = dE / (R * Math.cos(state.refLat * Math.PI / 180)) * (180 / Math.PI);

      const curLat = state.refLat + dLat;
      const curLon = state.refLon + dLon;
      const curAlt = state.currentPos.y;

      generateDataPacket(curLat, curLon, curAlt);
      loadGroundMap(state.refLat, state.refLon, mapSourceRef.current, computeZoomForAlt(curAlt));
    };

    const animate = () => {
      animRef.current = requestAnimationFrame(animate);
      updateLoop();
      const viewportWidth = viewport.clientWidth || 1;
      const viewportHeight = viewport.clientHeight || 1;
      const fovHelper = bottomFovHelperRef.current;
      const bottomCam = droneCameraRefs.current.bottom;
      if (fovHelper && bottomCam) {
        state.droneGroup?.updateMatrixWorld(true);
        bottomCam.updateMatrixWorld(true);
        fovHelper.update();
        fovHelper.visible = true;
      }

      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, viewportWidth, viewportHeight);
      renderer.setScissor(0, 0, viewportWidth, viewportHeight);
      renderer.render(scene, camera);

      const activeViews = (Object.keys(cameraViewStateRef.current) as CameraViewKey[]).filter((key) => cameraViewStateRef.current[key]);
      const columns = activeViews.length > 1 ? 2 : 1;
      const rows = Math.ceil(activeViews.length / columns);
      const insetWidth = Math.min(INSET.width, Math.floor((viewportWidth - INSET.margin * (columns + 1)) / columns));
      const insetHeight = Math.min(INSET.height, Math.floor((viewportHeight - INSET.margin * (rows + 1)) / Math.max(1, rows)));
      activeViews.forEach((view, index) => {
        const cam = droneCameraRefs.current[view];
        if (!cam || insetWidth <= 0 || insetHeight <= 0) return;
        const col = index % columns;
        const row = Math.floor(index / columns);
        const insetX = Math.max(INSET.margin, viewportWidth - ((columns - col) * insetWidth) - ((columns - col) * INSET.margin));
        const insetY = INSET.margin + ((rows - row - 1) * (insetHeight + INSET.margin));
        cam.aspect = insetWidth / insetHeight;
        cam.updateProjectionMatrix();
        renderer.clearDepth();
        renderer.setViewport(insetX, insetY, insetWidth, insetHeight);
        renderer.setScissor(insetX, insetY, insetWidth, insetHeight);
        const hideTrace = view === 'bottomClean';
        const prevPathVisible = state.pathLine?.visible ?? true;
        const prevTrailVisible = state.trailLine?.visible ?? true;
        if (hideTrace) {
          if (state.pathLine) state.pathLine.visible = false;
          if (state.trailLine) state.trailLine.visible = false;
        }
        const hideFovHelper = view === 'bottom' || view === 'bottomClean';
        const prevFovHelperVisible = fovHelper?.visible ?? false;
        if (fovHelper && hideFovHelper) fovHelper.visible = false;
        renderer.render(scene, cam);
        if (fovHelper && hideFovHelper) fovHelper.visible = prevFovHelperVisible;
        if (hideTrace) {
          if (state.pathLine) state.pathLine.visible = prevPathVisible;
          if (state.trailLine) state.trailLine.visible = prevTrailVisible;
        }
      });

      const cameraSocket = cameraWsRef.current;
      const cleanCamera = droneCameraRefs.current.bottomClean;
      if (
        cameraSocket &&
        cameraSocket.readyState === WebSocket.OPEN &&
        cleanCamera &&
        performance.now() - cameraStreamLastSentRef.current >= CAMERA_STREAM_INTERVAL_MS
      ) {
        const prevPathVisible = state.pathLine?.visible ?? true;
        const prevTrailVisible = state.trailLine?.visible ?? true;
        if (state.pathLine) state.pathLine.visible = false;
        if (state.trailLine) state.trailLine.visible = false;
        const prevFovHelperVisible = fovHelper?.visible ?? false;
        if (fovHelper) fovHelper.visible = false;
        cleanCamera.aspect = INSET.width / INSET.height;
        cleanCamera.updateProjectionMatrix();
        streamRenderer.setViewport(0, 0, INSET.width, INSET.height);
        streamRenderer.setScissorTest(false);
        streamRenderer.render(scene, cleanCamera);
        if (fovHelper) fovHelper.visible = prevFovHelperVisible;
        if (state.pathLine) state.pathLine.visible = prevPathVisible;
        if (state.trailLine) state.trailLine.visible = prevTrailVisible;
        try {
          const jpgBase64 = streamRenderer.domElement.toDataURL('image/jpeg', 0.72).split(',')[1];
          cameraSocket.send(jpgBase64);
          const sentAt = performance.now();
          cameraStreamLastSentRef.current = sentAt;
          if (cameraStreamWindowStartRef.current === 0) {
            cameraStreamWindowStartRef.current = sentAt;
          }
          cameraStreamFrameCountRef.current += 1;
          const fpsWindowMs = sentAt - cameraStreamWindowStartRef.current;
          if (fpsWindowMs >= 500) {
            setCameraStreamFps((cameraStreamFrameCountRef.current * 1000) / fpsWindowMs);
            cameraStreamFrameCountRef.current = 0;
            cameraStreamWindowStartRef.current = sentAt;
          }
        } catch {
          setCameraWsStatus('error');
        }
      }

      renderer.setScissorTest(false);
    };

    const handleResize = () => {
      const nextWidth = viewport.clientWidth || 1;
      const nextHeight = viewport.clientHeight || 1;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };

    const setInputFlag = (key: keyof typeof inputRef.current, value: boolean) => {
      inputRef.current[key] = value;
    };

    const handleKeyEvent = (event: KeyboardEvent, value: boolean) => {
      if (!state.manualMode) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      const key = event.key;
      const code = event.code;
      const isKey = (k: string) => key === k || code === `Numpad${k}`;

      if (isKey('8')) setInputFlag('forward', value);
      if (isKey('2')) setInputFlag('back', value);
      if (isKey('4')) setInputFlag('left', value);
      if (isKey('6')) setInputFlag('right', value);
      if (isKey('7')) setInputFlag('yawLeft', value);
      if (isKey('9')) setInputFlag('yawRight', value);
      if (isKey('5')) setInputFlag('up', value);
      if (isKey('0')) setInputFlag('down', value);

      if (['2', '4', '5', '6', '7', '8', '9', '0'].some(k => isKey(k))) {
        event.preventDefault();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => handleKeyEvent(event, true);
    const handleKeyUp = (event: KeyboardEvent) => handleKeyEvent(event, false);

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const initLat = getNumber(startLatRef, MAP_DEFAULT[1]);
    const initLon = getNumber(startLonRef, MAP_DEFAULT[0]);
    const initAlt = getNumber(startAltRef, 50);
    state.refLat = initLat;
    state.refLon = initLon;
    state.refAlt = initAlt;
    loadGroundMap(initLat, initLon, mapSourceRef.current, computeZoomForAlt(initAlt));
    updateModeInfo();
    animate();

    rendererRef.current = renderer;
    streamRendererRef.current = streamRenderer;
    cameraRef.current = camera;
    droneCameraRefs.current = {
      bottom: bottomCamera,
      bottomClean: bottomCleanCamera,
      front: frontCamera,
      left: leftCamera,
      right: rightCamera,
    };
    bottomFovHelperRef.current = bottomFovHelper;
    sceneRef.current = scene;
    controlsRef.current = controls;

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      telemetryWsRef.current?.close();
      cameraWsRef.current?.close();
      if (bottomFovHelperRef.current) {
        bottomFovHelperRef.current.geometry.dispose();
        (bottomFovHelperRef.current.material as THREE.Material).dispose();
        bottomFovHelperRef.current = null;
      }
      controls.dispose();
      renderer.dispose();
      streamRenderer.dispose();
      scene.clear();
      if (viewport.contains(renderer.domElement)) {
        viewport.removeChild(renderer.domElement);
      }
    };
  }, [getNumber, updateModeInfo, loadGroundMap]);

  return (
    <div className="drone-sim">
      <div className="drone-sim__sidebar">
        <div className="header">
          <h1>PROTOCOL SIMULATOR</h1>
          <div className="subtitle">Bridge / Telemetry / Visual SLAM</div>
        </div>

        <div className="section">
          <div className="sec-title">1. Configuration</div>
          <label>Communication Protocol</label>
          <select ref={modeRef} onChange={updateModeInfo} defaultValue="GPS_INPUT">
            <option value="GPS_INPUT">MAVLink: GPS_INPUT (Software Bridge)</option>
            <option value="ODOM">ROS: ODOMETRY (Visual SLAM)</option>
            <option value="UBX">u-blox: NAV-PVT (Hardware Serial)</option>
          </select>
          <div ref={descRef} style={{ fontSize: 10, color: '#64748b', marginTop: 5, fontStyle: 'italic' }}>
            Format: Float Lat/Lon + Meters.
          </div>
        </div>

        <div className="section">
          <div className="sec-title">
            2. Mission Parameters
            <span ref={statusRef} style={{ color: 'var(--accent)' }}>Waiting...</span>
          </div>

          <div className="input-group">
            <label>Location Preset</label>
            <select
              ref={presetRef}
              value={missionPresetId}
              onChange={(e) => {
                const nextPresetId = e.target.value as MissionPreset['id'];
                setMissionPresetId(nextPresetId);
                applyMissionPreset(nextPresetId);
              }}
            >
              {MISSION_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label>Start Point (Lat / Lon / Alt)</label>
            <div className="input-row">
              <input ref={startLatRef} type="number" placeholder="Lat" defaultValue={MAP_DEFAULT[1]} />
              <input ref={startLonRef} type="number" placeholder="Lon" defaultValue={MAP_DEFAULT[0]} />
              <input ref={startAltRef} type="number" placeholder="Alt (m)" defaultValue={50} />
            </div>
          </div>

          <div className="input-group">
            <label>Target Point (Lat / Lon / Alt)</label>
            <div className="input-row">
              <input ref={endLatRef} type="number" placeholder="Lat" />
              <input ref={endLonRef} type="number" placeholder="Lon" />
              <input ref={endAltRef} type="number" placeholder="Alt (m)" />
            </div>
          </div>

          <div className="input-group">
            <label>Max Velocity (m/s)</label>
            <input ref={speedRef} type="number" defaultValue={10} />
          </div>

          <div className="btn-container">
            <button type="button" className="btn-auto" onClick={autoFill}>Generate Random Mission</button>
            <button type="button" className="btn-launch" onClick={launchMission}>Launch Drone</button>
            <button type="button" className="btn-pause" onClick={togglePause} ref={pauseBtnRef}>Pause</button>
            <button type="button" className="btn-follow" onClick={toggleFollow} ref={followBtnRef}>Follow Cam: OFF</button>
            <button type="button" className="btn-home" onClick={viewHome}>View Home</button>
            <button type="button" className="btn-reset" onClick={resetSim}>Reset / Stop</button>
            <button type="button" className="btn-manual" onClick={toggleManual} ref={manualBtnRef}>Manual Pilot: OFF</button>
          </div>
          <div className="drone-sim__manual-panel">
            <div className="drone-sim__manual-mode-grid">
              <button
                type="button"
                className={`drone-sim__manual-mode-btn${manualInputMode === 'rc' ? ' active' : ''}`}
                onClick={() => handleManualInputModeChange('rc')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5" y="4" width="14" height="16" rx="3" />
                  <circle cx="9" cy="11" r="2.5" />
                  <circle cx="15" cy="11" r="2.5" />
                  <path d="M9 8v6M15 9v4M9 17h6" />
                </svg>
                <span>RC</span>
              </button>
              <button
                type="button"
                className={`drone-sim__manual-mode-btn${manualInputMode === 'keyboard' ? ' active' : ''}`}
                onClick={() => handleManualInputModeChange('keyboard')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <path d="M6 10h1M9 10h1M12 10h1M15 10h1M18 10h0M6 14h6M14 14h4" />
                </svg>
                <span>Keyboard</span>
              </button>
              <button
                type="button"
                className={`drone-sim__manual-mode-btn${manualInputMode === 'joystick' ? ' active' : ''}`}
                onClick={() => handleManualInputModeChange('joystick')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="7" r="2.5" />
                  <path d="M12 9.5V15M8 15h8M7 19h10M9 19v-4M15 19v-4" />
                </svg>
                <span>Joystick</span>
              </button>
            </div>
            <div className="drone-sim__manual-calibration">
              <button type="button" className="drone-sim__manual-calibrate-btn" onClick={() => handleManualCalibration('rc')}>
                RC Calibration
              </button>
              <button type="button" className="drone-sim__manual-calibrate-btn" onClick={() => handleManualCalibration('joystick')}>
                Joystick Calibration
              </button>
            </div>
          </div>
          <div className="drone-sim__manual-hint">
            {manualInputMode === 'keyboard'
              ? 'Manual keys: 8 forward, 2 back, 4 left, 6 right, 7 yaw left, 9 yaw right, 5 up, 0 down.'
              : manualControlStatus}
          </div>
        </div>

        <div className="section">
          <div className="sec-title">3. Camera Settings</div>
          <div className="input-group">
            <label>Bottom Camera FOV</label>
            <div className="drone-sim__range-row">
              <input
                type="range"
                min={30}
                max={120}
                step={1}
                value={bottomFov}
                onChange={(e) => handleBottomFovChange(Number(e.target.value))}
              />
              <div className="drone-sim__range-value">{bottomFov} deg</div>
            </div>
          </div>
          <div className="input-group">
            <label>In-Sim Camera Views</label>
            <div className="drone-sim__camera-toggle-grid">
              {(Object.keys(CAMERA_VIEW_TITLES) as CameraViewKey[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  className={`drone-sim__camera-toggle${cameraViews[view] ? ' active' : ''}`}
                  onClick={() => toggleCameraView(view)}
                >
                  {CAMERA_VIEW_TITLES[view]}
                </button>
              ))}
            </div>
          </div>
          <div className="drone-sim__manual-hint">
            Turn each view on or off independently. Flight traces remain visible in all enabled camera feeds.
          </div>
        </div>

        <div className="section">
          <div className="sec-title">4. Map Settings</div>
          <div className="input-group">
            <label>Ground Map Source</label>
            <select value={mapSource} onChange={(e) => handleMapSourceChange(e.target.value as GroundSource)}>
              <option value="satellite">Satellite (Esri)</option>
              <option value="streets">Streets (OSM)</option>
            </select>
          </div>
          <div className="input-group">
            <label>Min Zoom</label>
            <input
              type="number"
              min={1}
              max={19}
              value={mapZoomMin}
              onChange={(e) => handleMapZoomMinChange(Number(e.target.value))}
            />
          </div>
          <div className="input-group">
            <label>Max Zoom</label>
            <input
              type="number"
              min={1}
              max={19}
              value={mapZoomMax}
              onChange={(e) => handleMapZoomMaxChange(Number(e.target.value))}
            />
          </div>
          <div className="drone-sim__manual-hint">
            Zoom auto-scales with altitude between Min/Max (higher altitude = lower zoom).
          </div>
          <div className="drone-sim__manual-hint">{mapStatus}</div>
        </div>

        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="sec-title">
            <span>5. Data Stream Output <span style={{ fontSize: 9 }}>(Live Packet)</span></span>
            <div className="drone-sim__copy-buttons">
              <button
                type="button"
                className="drone-sim__copy-btn"
                onClick={() => copyToClipboard(telemetryWsUrl)}
              >
                Copy Telemetry WS
              </button>
              <button
                type="button"
                className="drone-sim__copy-btn"
                onClick={() => copyToClipboard(cameraWsUrl)}
              >
                Copy Camera WS
              </button>
            </div>
          </div>
          <div ref={streamRef} className="drone-sim__data-stream">
            {`${buildWsHeader()}Select a mode and Launch...`}
          </div>
          <div className="drone-sim__ws-tester">
            <div className="drone-sim__ws-row">
              <div className={`drone-sim__ws-status drone-sim__ws-status--${telemetryWsStatus}`}>
                Telemetry: {telemetryWsStatus}
              </div>
              <div className="drone-sim__ws-actions">
                <button type="button" className="drone-sim__ws-btn" onClick={connectTelemetryWs}>Connect</button>
                <button type="button" className="drone-sim__ws-btn" onClick={disconnectTelemetryWs}>Disconnect</button>
              </div>
            </div>
            <div className="drone-sim__ws-last">{telemetryWsLast}</div>
            <div className="drone-sim__ws-row">
              <div className={`drone-sim__ws-status drone-sim__ws-status--${cameraWsStatus}`}>
                Camera: {cameraWsStatus}
              </div>
              <div className="drone-sim__ws-actions">
                <button type="button" className="drone-sim__ws-btn" onClick={connectCameraWs}>Connect</button>
                <button type="button" className="drone-sim__ws-btn" onClick={disconnectCameraWs}>Disconnect</button>
              </div>
            </div>
            <div className="drone-sim__ws-note">
              Camera stream FPS: {cameraWsStatus === 'connected' ? cameraStreamFps.toFixed(1) : '0.0'}
            </div>
            <div className="drone-sim__ws-note">
              Camera WS expects the client to stream JPEG frames. This tester only opens the socket.
            </div>
          </div>
        </div>
      </div>

      <div ref={viewportRef} className="drone-sim__viewport">
        <div className="drone-sim__overlay">
          <div className="drone-sim__legend">
            <div className="drone-sim__legend-row"><span className="drone-sim__swatch drone-sim__swatch--vel" />Velocity Vector</div>
            <div className="drone-sim__legend-row"><span className="drone-sim__swatch drone-sim__swatch--acc" />Acceleration Vector</div>
            <div className="drone-sim__legend-row"><span className="drone-sim__swatch drone-sim__swatch--trail" />Flight Trail</div>
            <div className="drone-sim__legend-row"><span className="drone-sim__swatch drone-sim__swatch--xpos" />+X</div>
            <div className="drone-sim__legend-row"><span className="drone-sim__swatch drone-sim__swatch--xneg" />-X</div>
            <div className="drone-sim__legend-row"><span className="drone-sim__swatch drone-sim__swatch--ypos" />+Y</div>
            <div className="drone-sim__legend-row"><span className="drone-sim__swatch drone-sim__swatch--yneg" />-Y</div>
          </div>
          <div style={{ marginTop: 5, color: '#aaa', fontSize: 10 }}>(Left Click: Rotate | Right Click: Pan | Scroll: Zoom)</div>
          <div ref={distRef}>Dist: 0m</div>
        </div>

        {activeCameraViewKeys.map((view, index) => {
          const columns = activeCameraViewKeys.length > 1 ? 2 : 1;
          const rows = Math.ceil(activeCameraViewKeys.length / columns);
          const col = index % columns;
          const row = Math.floor(index / columns);
          const width = INSET.width;
          const height = INSET.height;
          const right = INSET.margin + ((columns - col - 1) * (width + INSET.margin));
          const bottom = INSET.margin + ((rows - row - 1) * (height + INSET.margin));

          return (
            <div
              key={view}
              className="drone-sim__camera-feed"
              style={{ width, height, right, bottom }}
            >
              <div className="drone-sim__camera-label">{CAMERA_VIEW_LABELS[view]}</div>
            </div>
          );
        })}


        <div ref={labelStartRef} className="label-marker">
          <div className="label-title">START POINT</div>
          <div ref={labelStartTextRef} className="label-coord" />
        </div>
        <div ref={labelEndRef} className="label-marker">
          <div className="label-title">TARGET POINT</div>
          <div ref={labelEndTextRef} className="label-coord" />
        </div>
      </div>
      {calibrationPanel !== 'none' && (
        <div className="drone-sim__modal-backdrop">
          <div className="drone-sim__modal drone-sim__modal--qgc">
            {calibrationPanel === 'rc' ? (
              <>
                <div className="drone-sim__qgc-header">
                  <div>
                    <div className="drone-sim__qgc-title">Radio Setup</div>
                    <div className="drone-sim__qgc-subtitle">
                      Radio Setup is used to calibrate your transmitter and assign channels for Roll, Pitch, Yaw and Throttle.
                    </div>
                  </div>
                  <button type="button" className="drone-sim__modal-close" onClick={() => setCalibrationPanel('none')}>
                    ×
                  </button>
                </div>
                <div className="drone-sim__radio-layout">
                  <div className="drone-sim__radio-main">
                    <div className="drone-sim__qgc-toolbar">
                      <div className="drone-sim__qgc-profile">
                        <label>RC Type</label>
                        <select value={rcProfileId} onChange={(e) => setRcProfileId(e.target.value as RcProfileId)}>
                          {RC_PROFILES.map((profile) => (
                            <option key={profile.id} value={profile.id}>{profile.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="drone-sim__qgc-mode-toggle">
                        <button type="button" className={rcStickMode === 1 ? 'active' : ''} onClick={() => setRcStickMode(1)}>Mode 1</button>
                        <button type="button" className={rcStickMode === 2 ? 'active' : ''} onClick={() => setRcStickMode(2)}>Mode 2</button>
                      </div>
                    </div>

                    <div className="drone-sim__radio-axis-grid">
                      <div className="drone-sim__radio-bar drone-sim__radio-bar--horizontal">
                        <div className="drone-sim__radio-bar-fill" style={{ width: `${((rcPwm.roll - 1000) / 1000) * 100}%` }}>
                          <span>Roll</span>
                          <strong>{rcPwm.roll}</strong>
                        </div>
                      </div>
                      <label className="drone-sim__radio-reverse">
                        <input type="checkbox" checked={axisReverse.roll} onChange={() => toggleAxisReverse('roll')} />
                        <span>Reverse</span>
                      </label>

                      <div className="drone-sim__radio-vertical-wrap">
                        <div className="drone-sim__radio-bar drone-sim__radio-bar--vertical">
                          <div className="drone-sim__radio-bar-fill" style={{ height: `${((rcPwm.pitch - 1000) / 1000) * 100}%` }}>
                            <span>Pitch</span>
                            <strong>{rcPwm.pitch}</strong>
                          </div>
                        </div>
                        <label className="drone-sim__radio-reverse">
                          <input type="checkbox" checked={axisReverse.pitch} onChange={() => toggleAxisReverse('pitch')} />
                          <span>Reverse</span>
                        </label>
                      </div>

                      <div className="drone-sim__radio-vertical-wrap">
                        <div className="drone-sim__radio-bar drone-sim__radio-bar--vertical">
                          <div className="drone-sim__radio-bar-fill" style={{ height: `${((rcPwm.throttle - 1000) / 1000) * 100}%` }}>
                            <span>Throttle</span>
                            <strong>{rcPwm.throttle}</strong>
                          </div>
                        </div>
                        <label className="drone-sim__radio-reverse">
                          <input type="checkbox" checked={axisReverse.throttle} onChange={() => toggleAxisReverse('throttle')} />
                          <span>Reverse</span>
                        </label>
                      </div>

                      <div className="drone-sim__radio-bar drone-sim__radio-bar--horizontal drone-sim__radio-bar--yaw">
                        <div className="drone-sim__radio-bar-fill" style={{ width: `${((rcPwm.yaw - 1000) / 1000) * 100}%` }}>
                          <span>Yaw</span>
                          <strong>{rcPwm.yaw}</strong>
                        </div>
                      </div>
                      <label className="drone-sim__radio-reverse drone-sim__radio-reverse--yaw">
                        <input type="checkbox" checked={axisReverse.yaw} onChange={() => toggleAxisReverse('yaw')} />
                        <span>Reverse</span>
                      </label>
                    </div>

                    <div className="drone-sim__radio-info-grid">
                      <div className="drone-sim__radio-info-card">
                        <div className="drone-sim__radio-info-title">Profile Notes</div>
                        <div className="drone-sim__radio-info-body">
                          <div><strong>Profile:</strong> {activeRcProfile.label}</div>
                          <div><strong>Protocol:</strong> {activeRcProfile.protocol}</div>
                          <div><strong>Controller:</strong> {gamepadConnected ? gamepadName : 'Disconnected'}</div>
                          <div><strong>Calibration:</strong> {rcCalibrationRunning ? 'Capturing live endpoints' : 'Saved'}</div>
                          <div>{activeRcProfile.notes}</div>
                        </div>
                      </div>

                      <div className="drone-sim__radio-info-card">
                        <div className="drone-sim__radio-info-title">Calibration Checklist</div>
                        <div className="drone-sim__radio-info-body">
                          <div>1. Reset trims and sub-trims to neutral before measuring channel centers.</div>
                          <div>2. Check each primary axis for 1000 / 1500 / 2000 us output.</div>
                          <div>3. Verify throttle low is stable and does not creep above idle.</div>
                          <div>4. Assign flight mode and arm only after the four main sticks are clean.</div>
                          <div>{rcCalibrationMessage}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="drone-sim__radio-side">
                    <div className="drone-sim__radio-extra-grid">
                      {[5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((channel, index) => {
                        return (
                          <div key={channel} className="drone-sim__radio-bar drone-sim__radio-bar--small">
                            <div className="drone-sim__radio-bar-fill" style={{ width: `${rcMonitorValues[index]}%` }}>
                              <span>{`Radio ${channel}`}</span>
                              <strong>{rcAuxPwm[index]}</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="drone-sim__radio-channel-card">
                      <div className="drone-sim__radio-info-title">Channel Mapping</div>
                      <div className="drone-sim__radio-channel-list">
                        {activeRcProfile.channels.map((entry) => (
                          <div key={entry.channel} className="drone-sim__radio-channel-item">
                            <span>{entry.channel}</span>
                            <span>{entry.function}</span>
                            <span>{entry.range}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="drone-sim__radio-channel-card">
                      <div className="drone-sim__radio-info-title">Saved Endpoints</div>
                      <div className="drone-sim__radio-channel-list">
                        {(['roll', 'pitch', 'yaw', 'throttle'] as AxisKey[]).map((axis) => (
                          <div key={axis} className="drone-sim__radio-channel-item">
                            <span>{axis.toUpperCase()}</span>
                            <span>{`min ${rcCalibrationData[axis].min} / ctr ${rcCalibrationData[axis].center}`}</span>
                            <span>{`max ${rcCalibrationData[axis].max}`}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button type="button" className="drone-sim__radio-calibrate-main" onClick={handleRcCalibrationAction}>
                      {rcCalibrationRunning ? 'Finish Calibration' : 'Calibrate Radio'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="drone-sim__qgc-header">
                  <div className="drone-sim__qgc-title">Joystick Setup</div>
                  <button type="button" className="drone-sim__modal-close" onClick={() => setCalibrationPanel('none')}>
                    ×
                  </button>
                </div>
                <div className="drone-sim__joystick-tabs">
                  <button type="button">General</button>
                  <button type="button">Button Assignment</button>
                  <button type="button" className="active">Calibration</button>
                  <button type="button">Advanced</button>
                </div>
                <div className="drone-sim__joystick-layout">
                  <div className="drone-sim__joystick-stage">
                    <div className="drone-sim__joystick-pad">
                      <div className="drone-sim__stick-circle">
                        <span className="drone-sim__stick-dot is-center is-green" />
                      </div>
                      <div className="drone-sim__stick-circle">
                        <span className="drone-sim__stick-dot is-center is-green" />
                      </div>
                    </div>
                    <div className="drone-sim__qgc-actions">
                      <button type="button" className="drone-sim__qgc-btn drone-sim__qgc-btn--muted">Skip</button>
                      <button type="button" className="drone-sim__qgc-btn drone-sim__qgc-btn--muted" onClick={() => setCalibrationPanel('none')}>Cancel</button>
                      <button type="button" className="drone-sim__qgc-btn drone-sim__qgc-btn--primary">Start</button>
                    </div>
                  </div>
                  <div className="drone-sim__joystick-monitor">
                    {joystickMonitorValues.map((value, index) => (
                      <div key={index} className="drone-sim__channel-row">
                        <span>{index}</span>
                        <div className="drone-sim__channel-track">
                          <div className="drone-sim__channel-center" />
                          <div className="drone-sim__channel-thumb" style={{ left: `${value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

