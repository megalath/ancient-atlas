"use client";

import { Edges, Grid, Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, DoubleSide, Matrix4, Plane, Quaternion, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  buildCorbelGeometry,
  buildGableGeometry,
  buildPyramidGeometry,
  buildRemnantGeometry,
  buildSteppedGeometry,
  passageFrame,
} from "@/lib/geometry";
import {
  featureAnchor,
  getPyramidModel,
  sectionPlane,
  trueNorthRadians,
  type BuiltFeature,
  type MaterialId,
  type Shape,
  type Vec3,
} from "@/lib/pyramid-model";

export type LayerState = {
  casing: boolean;
  core: boolean;
  interior: boolean;
  measurements: boolean;
  annotations: boolean;
  section: boolean;
  casingOpacity: number;
};

const COLORS: Record<MaterialId, string> = {
  casing: "#f3ead6",
  core: "#c2a67c",
  passage: "#e4d2ad",
  granite: "#9c5c48",
  bedrock: "#8d7b66",
  shaft: "#6e8c74",
  void: "#e2b15c",
  forced: "#6b5344",
  chevron: "#f7f1e4",
};

const LABELLED = new Set([
  "descending-passage",
  "queens-chamber",
  "kings-chamber",
  "grand-gallery",
  "subterranean-chamber",
  "big-void",
  "north-face-corridor",
  "antechamber",
]);

type Props = {
  layers: LayerState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  mode: "orbit" | "walk";
  standToken: number;
  standAt: Vec3 | null;
  collide: boolean;
};

export function PyramidView(props: Props) {
  const model = getPyramidModel();
  const yaw = trueNorthRadians(model.orientationWestArcsec);
  return (
    <Canvas
      camera={{ position: [280, 168, 250], fov: 40, near: 0.08, far: 2800 }}
      gl={{ antialias: true, localClippingEnabled: true, logarithmicDepthBuffer: true }}
      dpr={[1, 2]}
      onCreated={({ camera }) => {
        camera.lookAt(0, 48, 0);
      }}
      onPointerMissed={() => {
        if (props.mode === "walk") {
          const canvas = document.querySelector(".stage canvas");
          if (canvas instanceof HTMLCanvasElement) canvas.requestPointerLock();
        }
      }}
    >
      <color attach="background" args={["#c5d4df"]} />
      <fog attach="fog" args={["#d9c7a4", 320, 980]} />
      <hemisphereLight args={["#f7f1e6", "#b08960", 0.62]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[90, 160, 30]} intensity={1.45} />
      <directionalLight position={[-70, 30, -90]} intensity={0.32} color="#d5e2ea" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow={false}>
        <circleGeometry args={[920, 72]} />
        <meshStandardMaterial color="#d8c4a2" roughness={1} />
      </mesh>
      <Grid
        args={[800, 800]}
        position={[0, 0.02, 0]}
        cellSize={10}
        cellThickness={0.6}
        cellColor="#b89a72"
        sectionSize={50}
        sectionThickness={1.15}
        sectionColor="#8d704c"
        fadeDistance={520}
        fadeStrength={1.4}
        infiniteGrid={false}
      />
      <group rotation={[0, yaw, 0]}>
        {model.features.map((feature) => (
          <FeatureMesh
            key={feature.id}
            feature={feature}
            layers={props.layers}
            selected={feature.id === props.selectedId}
            onSelect={props.onSelect}
          />
        ))}
        {props.layers.measurements ? <Measurements /> : null}
        {props.layers.section ? <SectionSheet /> : null}
      </group>
      <NorthArrow />
      <Rig mode={props.mode} standToken={props.standToken} standAt={props.standAt} collide={props.collide} selectedId={props.selectedId} />
    </Canvas>
  );
}

function featureVisible(feature: BuiltFeature, layers: LayerState): boolean {
  if (feature.id === "pavement") return layers.casing || layers.core;
  if (feature.id === "casing-remnant-north") return layers.casing || layers.core;
  if (feature.id === "north-face-chevron") return layers.core || layers.interior;
  if (feature.layer === "casing") return layers.casing;
  if (feature.layer === "core") return layers.core;
  return layers.interior;
}

function FeatureMesh({
  feature,
  layers,
  selected,
  onSelect,
}: {
  feature: BuiltFeature;
  layers: LayerState;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  if (!featureVisible(feature, layers)) return null;
  const clip = feature.layer === "interior" || !layers.section ? undefined : sectionPlanes();
  const opacity = feature.layer === "casing" && feature.id !== "pavement" ? layers.casingOpacity : 1;
  const anchor = featureAnchor(feature);
  return (
    <group>
      {feature.shapes.map((shape, index) => (
        <ShapeMesh
          key={`${feature.id}-${index}`}
          shape={shape}
          feature={feature}
          opacity={opacity}
          clip={clip}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
      {layers.annotations && LABELLED.has(feature.id) ? (
        <Html position={[anchor.x, anchor.y + 2.2, anchor.z]} center distanceFactor={42} zIndexRange={[12, 0]}>
          <button type="button" className="marker-label" onClick={() => onSelect(feature.id)}>
            {feature.name}
          </button>
        </Html>
      ) : null}
    </group>
  );
}

let cachedPlane: Plane[] | null = null;
function sectionPlanes(): Plane[] {
  if (cachedPlane) return cachedPlane;
  const model = getPyramidModel();
  const plane = sectionPlane(model.entrance.x, model.orientationWestArcsec);
  cachedPlane = [new Plane(new Vector3(plane.normal.x, plane.normal.y, plane.normal.z), plane.constant)];
  return cachedPlane;
}

function ShapeMesh({
  shape,
  feature,
  opacity,
  clip,
  selected,
  onSelect,
}: {
  shape: Shape;
  feature: BuiltFeature;
  opacity: number;
  clip: Plane[] | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const geometry = useMemo(() => buildShapeGeometry(shape), [shape]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  const handlers = {
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onSelect(feature.id);
    },
    onPointerOver: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      document.body.style.cursor = "";
    },
  };

  if (shape.kind === "axis") {
    return (
      <AxisMesh shape={shape} {...handlers}>
        <Material feature={feature} opacity={opacity} clip={clip} selected={selected} />
        {selected ? <Edges threshold={15} color="#f6edd8" /> : null}
      </AxisMesh>
    );
  }
  if (shape.kind === "aabb") {
    return (
      <mesh
        position={[
          (shape.min.x + shape.max.x) / 2,
          (shape.min.y + shape.max.y) / 2,
          (shape.min.z + shape.max.z) / 2,
        ]}
        {...handlers}
      >
        <boxGeometry args={[shape.max.x - shape.min.x, shape.max.y - shape.min.y, shape.max.z - shape.min.z]} />
        <Material feature={feature} opacity={opacity} clip={clip} selected={selected} />
        {selected || feature.material === "void" ? <Edges threshold={15} color="#f3e2bc" /> : null}
      </mesh>
    );
  }
  if (shape.kind === "slab") {
    return (
      <mesh position={[0, shape.y - shape.thickness / 2, 0]} {...handlers}>
        <boxGeometry args={[shape.half * 2, shape.thickness, shape.half * 2]} />
        <Material feature={feature} opacity={Math.max(opacity, 0.92)} clip={clip} selected={selected} />
      </mesh>
    );
  }
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} {...handlers}>
      <Material feature={feature} opacity={opacity} clip={clip} selected={selected} />
      {selected ? <Edges threshold={20} color="#f6edd8" /> : null}
    </mesh>
  );
}

function AxisMesh({
  shape,
  children,
  ...handlers
}: {
  shape: Extract<Shape, { kind: "axis" }>;
  children: React.ReactNode;
  onClick: (event: { stopPropagation: () => void }) => void;
  onPointerOver: (event: { stopPropagation: () => void }) => void;
  onPointerOut: () => void;
}) {
  const frame = passageFrame(shape.from, shape.to);
  const position = frame.origin.clone().addScaledVector(frame.forward, frame.length / 2);
  if ((shape.align ?? "floor") === "floor") position.addScaledVector(frame.up, shape.height / 2);
  const quaternion = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(frame.right, frame.up, frame.forward),
  );
  return (
    <mesh position={position} quaternion={quaternion} {...handlers}>
      <boxGeometry args={[Math.max(shape.width, 0.04), Math.max(shape.height, 0.04), frame.length]} />
      {children}
    </mesh>
  );
}

function buildShapeGeometry(shape: Shape): BufferGeometry | null {
  if (shape.kind === "pyramid") return buildPyramidGeometry(shape.base, shape.height);
  if (shape.kind === "stepped") return buildSteppedGeometry(shape.base, shape.height, shape.apexHeight, shape.steps);
  if (shape.kind === "gable") return buildGableGeometry(shape);
  if (shape.kind === "corbel") return buildCorbelGeometry(shape);
  if (shape.kind === "remnant") return buildRemnantGeometry(shape.length, shape.height, shape.base);
  return null;
}

function Material({
  feature,
  opacity,
  clip,
  selected,
}: {
  feature: BuiltFeature;
  opacity: number;
  clip: Plane[] | undefined;
  selected: boolean;
}) {
  const color = feature.id === "north-face-corridor" ? "#7ea1b0" : feature.id === "big-void" ? "#e2b15c" : COLORS[feature.material];
  const voidOpacity = feature.material === "void" ? 0.4 : feature.material === "shaft" ? 0.88 : opacity;
  const transparent = voidOpacity < 0.98;
  return (
    <meshStandardMaterial
      color={color}
      roughness={feature.material === "granite" ? 0.62 : 0.9}
      metalness={0.02}
      transparent={transparent}
      opacity={voidOpacity}
      side={DoubleSide}
      depthWrite={voidOpacity > 0.45}
      clippingPlanes={clip}
      clipShadows
      emissive={selected ? "#c6a15b" : "#000000"}
      emissiveIntensity={selected ? 0.22 : 0}
      polygonOffset={feature.id === "granite-plugs"}
      polygonOffsetFactor={feature.id === "granite-plugs" ? -1 : 0}
      polygonOffsetUnits={feature.id === "granite-plugs" ? -1 : 0}
    />
  );
}

function Measurements() {
  const model = getPyramidModel();
  const half = model.baseM / 2;
  const y = 0.4;
  return (
    <group>
      <Line
        points={[
          [-half, y, half],
          [half, y, half],
          [half, y, -half],
          [-half, y, -half],
          [-half, y, half],
        ]}
        color="#6e4a28"
        lineWidth={2}
      />
      <Line points={[[0, 0, 0], [0, model.heightM, 0]]} color="#6e4a28" lineWidth={2} />
      <Html position={[0, 2.2, half + 6]} center>
        <span className="dim">Mean base {model.baseM.toFixed(2)} m</span>
      </Html>
      <Html position={[6, model.heightM * 0.62, 0]} center>
        <span className="dim">Original height {model.heightM.toFixed(2)} m</span>
      </Html>
      <Html position={[8, model.currentHeightM + 3, 4]} center>
        <span className="dim">Standing {model.currentHeightM.toFixed(1)} m</span>
      </Html>
    </group>
  );
}

function SectionSheet() {
  const model = getPyramidModel();
  return (
    <mesh position={[model.entrance.x - 0.2, model.heightM / 2, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
      <planeGeometry args={[model.baseM * 1.02, model.heightM]} />
      <meshBasicMaterial color="#c6a15b" transparent opacity={0.08} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

function NorthArrow() {
  const model = getPyramidModel();
  const x = model.baseM / 2 + 18;
  return (
    <group position={[x, 0.3, -8]}>
      <Line points={[[0, 0, 0], [0, 0, 24]]} color="#1d3b32" lineWidth={2} />
      <mesh position={[0, 0, 24]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.9, 2.6, 10]} />
        <meshStandardMaterial color="#1d3b32" />
      </mesh>
      <Html position={[0, 2.4, 26]} center>
        <span className="dim">True north</span>
      </Html>
    </group>
  );
}

function Rig({
  mode,
  standToken,
  standAt,
  collide,
  selectedId,
}: {
  mode: "orbit" | "walk";
  standToken: number;
  standAt: Vec3 | null;
  collide: boolean;
  selectedId: string | null;
}) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const skipFirstFocus = useRef(true);
  const eye = useRef(new Vector3(0, 1.65, 210));
  const yaw = useRef(0);
  const pitch = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const model = getPyramidModel();

  useEffect(() => {
    const lock = () => gl.domElement.requestPointerLock();
    window.addEventListener("atlas-lock", lock);
    return () => window.removeEventListener("atlas-lock", lock);
  }, [gl]);

  useEffect(() => {
    if (mode !== "orbit" || !controls.current || !selectedId) return;
    if (skipFirstFocus.current) {
      skipFirstFocus.current = false;
      return;
    }
    const feature = model.features.find((item) => item.id === selectedId);
    if (!feature) return;
    const anchor = featureAnchor(feature);
    controls.current.target.set(anchor.x, Math.max(anchor.y, 4), anchor.z);
  }, [mode, selectedId, model.features]);

  useEffect(() => {
    if (!standAt || standToken === 0) return;
    eye.current.set(standAt.x, standAt.y, standAt.z);
    yaw.current = Math.atan2(standAt.x, standAt.z);
    pitch.current = 0;
    camera.position.copy(eye.current);
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch.current, yaw.current, 0);
  }, [standToken, standAt, camera]);

  useEffect(() => {
    if (mode !== "walk") return;
    const down = (event: KeyboardEvent) => {
      keys.current[event.code] = true;
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      keys.current[event.code] = false;
    };
    const look = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= event.movementX * 0.0022;
      pitch.current = Math.max(-1.15, Math.min(1.15, pitch.current - event.movementY * 0.0022));
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("mousemove", look);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("mousemove", look);
    };
  }, [mode, gl]);

  useFrame((_, delta) => {
    if (mode !== "walk") return;
    const step = (keys.current.ShiftLeft || keys.current.ShiftRight ? 16 : 6.5) * Math.min(delta, 0.05);
    let x = eye.current.x;
    let z = eye.current.z;
    if (keys.current.KeyW) {
      x += -Math.sin(yaw.current) * step;
      z += -Math.cos(yaw.current) * step;
    }
    if (keys.current.KeyS) {
      x -= -Math.sin(yaw.current) * step;
      z -= -Math.cos(yaw.current) * step;
    }
    if (keys.current.KeyA) {
      x += -Math.cos(yaw.current) * step;
      z += Math.sin(yaw.current) * step;
    }
    if (keys.current.KeyD) {
      x -= -Math.cos(yaw.current) * step;
      z -= Math.sin(yaw.current) * step;
    }
    if (collide) {
      const pushed = pushOut(x, z, model.baseM / 2, 0.8);
      x = pushed.x;
      z = pushed.z;
    }
    const reach = 460;
    const radius = Math.hypot(x, z);
    if (radius > reach) {
      x *= reach / radius;
      z *= reach / radius;
    }
    eye.current.set(x, collide ? 1.65 : eye.current.y, z);
    camera.position.copy(eye.current);
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch.current, yaw.current, 0);
  });

  return (
    <OrbitControls
      ref={controls}
      enabled={mode === "orbit"}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI * 0.495}
      minPolarAngle={0.08}
      minDistance={0.7}
      maxDistance={900}
      target={[0, 48, 0]}
    />
  );
}

function pushOut(x: number, z: number, half: number, margin: number) {
  const limit = half + margin;
  if (Math.abs(x) > limit || Math.abs(z) > limit) return { x, z };
  const dx = limit - Math.abs(x);
  const dz = limit - Math.abs(z);
  if (dx < dz) return { x: Math.sign(x || 1) * limit, z };
  return { x, z: Math.sign(z || 1) * limit };
}
