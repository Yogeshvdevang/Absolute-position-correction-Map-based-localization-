import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

interface DigitalTwinModelProps {
  modelUrl: string;
  fallbackUrl?: string;
  heading: number;
  pitch: number;
  roll: number;
  xOffset?: number;
  yOffset?: number;
  zOffset?: number;
  className?: string;
}

const TwinScene = ({
  modelUrl,
  heading,
  pitch,
  roll,
  xOffset = 0,
  yOffset = 0,
  zOffset = 0
}: DigitalTwinModelProps) => {
  const { scene } = useGLTF(modelUrl);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const [fitScale, setFitScale] = useState(1);
  const [fitOffset, setFitOffset] = useState(new THREE.Vector3());
  const euler = useMemo(() => {
    return new THREE.Euler(
      THREE.MathUtils.degToRad(pitch),
      THREE.MathUtils.degToRad(heading),
      THREE.MathUtils.degToRad(roll),
      'YXZ'
    );
  }, [heading, pitch, roll]);
  const quaternion = useMemo(() => {
    return new THREE.Quaternion().setFromEuler(euler);
  }, [euler]);

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 0.95 / maxDim : 1;
    setFitScale(scale);
    setFitOffset(center.clone().multiplyScalar(-1));
  }, [cloned]);

  const modelPosition = useMemo(() => {
    return fitOffset.clone();
  }, [fitOffset]);

  const pivotPosition = useMemo(() => {
    return new THREE.Vector3(xOffset, yOffset, zOffset);
  }, [xOffset, yOffset, zOffset]);

  return (
    <group position={pivotPosition} quaternion={quaternion}>
      <primitive object={cloned} position={modelPosition} scale={fitScale} />
    </group>
  );
};

const resolveModelUrl = async (url: string, fallback: string) => {
  if (!url) return fallback;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok ? url : fallback;
  } catch {
    return fallback;
  }
};

export const DigitalTwinModel = ({
  modelUrl,
  fallbackUrl = '/models/generic.gltf',
  heading,
  pitch,
  roll,
  xOffset,
  yOffset,
  zOffset,
  className
}: DigitalTwinModelProps) => {
  const [resolvedUrl, setResolvedUrl] = useState(modelUrl || fallbackUrl);

  useEffect(() => {
    let active = true;
    resolveModelUrl(modelUrl, fallbackUrl).then((url) => {
      if (active) setResolvedUrl(url);
    });
    return () => {
      active = false;
    };
  }, [modelUrl, fallbackUrl]);

  return (
    <div className={className || 'h-20 w-32 rounded-sm border border-border/40 bg-slate-950/40'}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [1.4, 1.0, 1.8], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 2]} intensity={1.1} />
        <Suspense fallback={null}>
          <TwinScene
            modelUrl={resolvedUrl}
            heading={heading}
            pitch={pitch}
            roll={roll}
            xOffset={xOffset}
            yOffset={yOffset}
            zOffset={zOffset}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

useGLTF.preload('/models/generic.gltf');
useGLTF.preload('/assets/uav/drone.glb');
useGLTF.preload('/assets/uav/aircraft.glb');
useGLTF.preload('/assets/ugv/rover.glb');
