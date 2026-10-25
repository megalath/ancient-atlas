"use client";

import { Html, OrbitControls, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { BackSide, SRGBColorSpace, TOUCH, Vector3 } from "three";
import { latLonToVector } from "@/lib/globe";

const RADIUS = 6371;

export type GlobeSite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export function GlobeView({
  sites,
  latitude,
  longitude,
  flyToken,
  mobile,
  onEnter,
  onArrived,
}: {
  sites: GlobeSite[];
  latitude: number;
  longitude: number;
  flyToken: number;
  mobile: boolean;
  onEnter: (id: string) => void;
  onArrived?: () => void;
}) {
  const home = latLonToVector(16, 10, RADIUS * 2.75);
  return (
    <Canvas
      camera={{ position: [home.x, home.y, home.z], fov: 42, near: 2, far: 80000 }}
      gl={{ antialias: !mobile, logarithmicDepthBuffer: true, powerPreference: mobile ? "low-power" : "high-performance" }}
      dpr={mobile ? [1, 1.25] : [1, 1.75]}
    >
      <color attach="background" args={["#07080c"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[RADIUS * 2, RADIUS, RADIUS * 0.4]} intensity={1.6} />
      <Suspense fallback={null}>
        <Earth mobile={mobile} />
      </Suspense>
      <Atmosphere mobile={mobile} />
      {sites.map((site) => (
        <SiteMarker key={site.id} site={site} onEnter={onEnter} />
      ))}
      <FlyTo latitude={latitude} longitude={longitude} token={flyToken} onArrived={onArrived} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={RADIUS * 1.04}
        maxDistance={RADIUS * 6}
        target={[0, 0, 0]}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
    </Canvas>
  );
}

function Earth({ mobile }: { mobile: boolean }) {
  const texture = useTexture("/textures/land-ocean-ice-2048.jpg");
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = mobile ? 2 : 8;
  return (
    <mesh>
      <sphereGeometry args={[RADIUS, mobile ? 48 : 96, mobile ? 32 : 64]} />
      <meshStandardMaterial map={texture} roughness={1} metalness={0} />
    </mesh>
  );
}

function Atmosphere({ mobile }: { mobile: boolean }) {
  return (
    <mesh scale={1.018}>
      <sphereGeometry args={[RADIUS, mobile ? 32 : 64, mobile ? 16 : 32]} />
      <meshBasicMaterial color="#9ec4e0" transparent opacity={0.2} side={BackSide} depthWrite={false} />
    </mesh>
  );
}

function SiteMarker({ site, onEnter }: { site: GlobeSite; onEnter: (id: string) => void }) {
  const point = latLonToVector(site.latitude, site.longitude, RADIUS * 1.012);
  return (
    <group position={[point.x, point.y, point.z]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onEnter(site.id);
        }}
      >
        <sphereGeometry args={[RADIUS * 0.014, 20, 14]} />
        <meshBasicMaterial color="#e2b15c" />
      </mesh>
      <Html center zIndexRange={[20, 0]} wrapperClass="marker-wrap">
        <span className="marker-label" onClick={() => onEnter(site.id)}>
          {site.name}
        </span>
      </Html>
    </group>
  );
}

function FlyTo({
  latitude,
  longitude,
  token,
  onArrived,
}: {
  latitude: number;
  longitude: number;
  token: number;
  onArrived?: () => void;
}) {
  const { camera } = useThree();
  const controls = useThree((state) => state.controls) as { target: Vector3 } | null;
  const marker = useMemo(() => {
    const point = latLonToVector(latitude, longitude, RADIUS);
    return new Vector3(point.x, point.y, point.z);
  }, [latitude, longitude]);
  const goal = useMemo(() => marker.clone().normalize().multiplyScalar(RADIUS * 1.09), [marker]);
  const flying = useRef(false);
  const started = useRef(0);

  useEffect(() => {
    if (token <= 0) return;
    flying.current = true;
    started.current = performance.now();
    const orbit = controls as { enabled?: boolean } | null;
    if (orbit) orbit.enabled = false;
  }, [token, controls]);

  useEffect(() => {
    const start = () => {
      flying.current = true;
      started.current = performance.now();
    };
    window.addEventListener("atlas-fly", start);
    return () => window.removeEventListener("atlas-fly", start);
  }, []);

  useFrame((_, delta) => {
    if (!flying.current) return;
    const orbit = controls as { enabled?: boolean } | null;
    if (orbit) orbit.enabled = false;
    const step = 1 - Math.exp(-1.8 * delta);
    camera.position.lerp(goal, step);
    controls?.target.lerp(marker, step);
    const arrived = camera.position.distanceTo(goal) < RADIUS * 0.04 || performance.now() - started.current > 2800;
    if (!arrived) return;
    flying.current = false;
    camera.position.copy(goal);
    controls?.target.copy(marker);
    if (orbit) orbit.enabled = true;
    onArrived?.();
  });

  return null;
}
