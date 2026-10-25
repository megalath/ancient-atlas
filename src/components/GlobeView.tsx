"use client";

import { OrbitControls, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { BackSide, SRGBColorSpace, Vector3 } from "three";
import { latLonToVector } from "@/lib/globe";
import { getPyramidModel } from "@/lib/pyramid-model";

const RADIUS = 6371;

export function GlobeView({ flyToken }: { flyToken: number }) {
  const model = getPyramidModel();
  const home = latLonToVector(16, 10, RADIUS * 2.75);
  return (
    <Canvas
      camera={{ position: [home.x, home.y, home.z], fov: 42, near: 2, far: 80000 }}
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#07080c"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[RADIUS * 2, RADIUS, RADIUS * 0.4]} intensity={1.6} />
      <Suspense fallback={null}>
        <Earth />
      </Suspense>
      <Atmosphere />
      <GizaMarker latitude={model.site.latitude} longitude={model.site.longitude} />
      <FlyTo latitude={model.site.latitude} longitude={model.site.longitude} token={flyToken} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={RADIUS * 1.04}
        maxDistance={RADIUS * 6}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

function Earth() {
  const texture = useTexture("/textures/land-ocean-ice-2048.jpg");
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return (
    <mesh>
      <sphereGeometry args={[RADIUS, 96, 64]} />
      <meshStandardMaterial map={texture} roughness={1} metalness={0} />
    </mesh>
  );
}

function Atmosphere() {
  return (
    <mesh scale={1.018}>
      <sphereGeometry args={[RADIUS, 64, 32]} />
      <meshBasicMaterial color="#9ec4e0" transparent opacity={0.2} side={BackSide} depthWrite={false} />
    </mesh>
  );
}

function GizaMarker({ latitude, longitude }: { latitude: number; longitude: number }) {
  const point = latLonToVector(latitude, longitude, RADIUS * 1.01);
  const fly = () => window.dispatchEvent(new Event("atlas-fly"));
  return (
    <mesh
      position={[point.x, point.y, point.z]}
      onClick={(event) => {
        event.stopPropagation();
        fly();
      }}
    >
      <sphereGeometry args={[RADIUS * 0.014, 24, 16]} />
      <meshBasicMaterial color="#e2b15c" />
    </mesh>
  );
}

function FlyTo({ latitude, longitude, token }: { latitude: number; longitude: number; token: number }) {
  const { camera } = useThree();
  const controls = useThree((state) => state.controls) as { target: Vector3 } | null;
  const marker = useMemo(() => {
    const point = latLonToVector(latitude, longitude, RADIUS);
    return new Vector3(point.x, point.y, point.z);
  }, [latitude, longitude]);
  const goal = useMemo(() => marker.clone().normalize().multiplyScalar(RADIUS * 1.09), [marker]);
  const flying = useRef(false);

  useEffect(() => {
    if (token > 0) flying.current = true;
  }, [token]);

  useEffect(() => {
    const start = () => {
      flying.current = true;
    };
    window.addEventListener("atlas-fly", start);
    return () => window.removeEventListener("atlas-fly", start);
  }, []);

  useFrame((_, delta) => {
    if (!flying.current) return;
    const step = 1 - Math.exp(-1.5 * delta);
    camera.position.lerp(goal, step);
    controls?.target.lerp(marker, step);
    if (camera.position.distanceTo(goal) < RADIUS * 0.012) flying.current = false;
  });

  return null;
}
