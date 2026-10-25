"use client";

import { Edges, Grid, Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { BufferGeometry, DoubleSide, Matrix4, Plane, Quaternion, Raycaster, TOUCH, Vector2, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { featureBounds } from "@/lib/bounds";
import {
  buildCorbelGeometry,
  buildGableGeometry,
  buildPyramidGeometry,
  buildRemnantGeometry,
  buildSteppedGeometry,
  passageFrame,
} from "@/lib/geometry";
import {
  applyTrueNorth,
  featureAnchor,
  sectionPlane,
  trueNorthRadians,
  type BuiltFeature,
  type MaterialId,
  type SceneModel,
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

type Stick = { x: number; y: number };

type Props = {
  model: SceneModel;
  layers: LayerState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  mode: "orbit" | "walk";
  standToken: number;
  standAt: Vec3 | null;
  collide: boolean;
  focusToken: number;
  mobile: boolean;
  stick: MutableRefObject<Stick>;
  pickInterior: boolean;
};

export function PyramidView(props: Props) {
  const model = props.model;
  const yaw = trueNorthRadians(model.orientationWestArcsec);
  const clip = useMemo(() => {
    const plane = sectionPlane(model.entrance.x, model.orientationWestArcsec);
    return [new Plane(new Vector3(plane.normal.x, plane.normal.y, plane.normal.z), plane.constant)];
  }, [model]);
  return (
    <Canvas
      camera={{ position: [280, 168, 250], fov: 40, near: 0.08, far: 2800 }}
      gl={{
        antialias: !props.mobile,
        localClippingEnabled: true,
        logarithmicDepthBuffer: true,
        powerPreference: props.mobile ? "low-power" : "high-performance",
      }}
      dpr={props.mobile ? [1, 1.25] : [1, 1.75]}
      onCreated={({ camera }) => {
        camera.lookAt(0, 48, 0);
      }}
      onPointerMissed={() => {
        const coarse = window.matchMedia("(pointer: coarse)").matches;
        if (props.mode === "walk" && !coarse) {
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow={false} raycast={() => null}>
        <circleGeometry args={[920, props.mobile ? 40 : 72]} />
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
            clipPlanes={clip}
            onSelect={props.onSelect}
          />
        ))}
        <FeatureProxies
          features={model.features}
          layers={props.layers}
          pickInterior={props.pickInterior}
          onSelect={props.onSelect}
          onHover={props.onHover}
        />
        {props.layers.measurements ? <Measurements model={model} /> : null}
        {props.layers.section ? <SectionSheet model={model} /> : null}
      </group>
      <NorthArrow model={model} />
      <Rig
        model={model}
        mode={props.mode}
        standToken={props.standToken}
        standAt={props.standAt}
        collide={props.collide}
        selectedId={props.selectedId}
        focusToken={props.focusToken}
        mobile={props.mobile}
        stick={props.stick}
      />
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
  clipPlanes,
  onSelect,
}: {
  feature: BuiltFeature;
  layers: LayerState;
  selected: boolean;
  clipPlanes: Plane[];
  onSelect: (id: string) => void;
}) {
  if (!featureVisible(feature, layers)) return null;
  const clip = feature.layer === "interior" || !layers.section ? undefined : clipPlanes;
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
        />
      ))}
      {layers.annotations && (selected || LABELLED.has(feature.id)) ? (
        <Html position={[anchor.x, anchor.y + 2.4, anchor.z]} center zIndexRange={[20, 0]} wrapperClass="marker-wrap">
          <span
            className="marker-label"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(feature.id);
            }}
          >
            {feature.name}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

type PickData = { id: string; layer: BuiltFeature["layer"] };

function FeatureProxies({
  features,
  layers,
  pickInterior,
  onSelect,
  onHover,
}: {
  features: BuiltFeature[];
  layers: LayerState;
  pickInterior: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const visible = features.filter((feature) => featureVisible(feature, layers) || feature.layer === "interior");
  const boxes = useMemo(() => visible.map((feature) => ({ feature, bounds: featureBounds(feature) })), [visible]);
  function pick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    const hits = event.intersections
      .map((hit) => (hit.object.userData as { pick?: PickData }).pick)
      .filter((pick): pick is PickData => Boolean(pick));
    const interior = hits.find((hit) => hit.layer === "interior");
    const chosen = pickInterior && interior ? interior.id : hits[0]?.id;
    if (chosen) onSelect(chosen);
  }
  return (
    <group>
      {boxes.map(({ feature, bounds }) => (
        <mesh
          key={`pick-${feature.id}`}
          position={[bounds.center.x, bounds.center.y, bounds.center.z]}
          userData={{ pick: { id: feature.id, layer: feature.layer } }}
          onClick={pick}
          onPointerOver={(event) => {
            event.stopPropagation();
            onHover(feature.id);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = "";
          }}
        >
          <boxGeometry args={bounds.size} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function ShapeMesh({
  shape,
  feature,
  opacity,
  clip,
  selected,
}: {
  shape: Shape;
  feature: BuiltFeature;
  opacity: number;
  clip: Plane[] | undefined;
  selected: boolean;
}) {
  const geometry = useMemo(() => buildShapeGeometry(shape), [shape]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (shape.kind === "axis") {
    return (
      <AxisMesh shape={shape}>
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
        raycast={() => null}
      >
        <boxGeometry args={[shape.max.x - shape.min.x, shape.max.y - shape.min.y, shape.max.z - shape.min.z]} />
        <Material feature={feature} opacity={opacity} clip={clip} selected={selected} />
        {selected || feature.material === "void" ? <Edges threshold={15} color="#f3e2bc" /> : null}
      </mesh>
    );
  }
  if (shape.kind === "slab") {
    return (
      <mesh position={[0, shape.y - shape.thickness / 2, 0]} raycast={() => null}>
        <boxGeometry args={[shape.half * 2, shape.thickness, shape.half * 2]} />
        <Material feature={feature} opacity={Math.max(opacity, 0.92)} clip={clip} selected={selected} />
      </mesh>
    );
  }
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <Material feature={feature} opacity={opacity} clip={clip} selected={selected} />
      {selected ? <Edges threshold={20} color="#f6edd8" /> : null}
    </mesh>
  );
}

function AxisMesh({ shape, children }: { shape: Extract<Shape, { kind: "axis" }>; children: ReactNode }) {
  const frame = passageFrame(shape.from, shape.to);
  const position = frame.origin.clone().addScaledVector(frame.forward, frame.length / 2);
  if ((shape.align ?? "floor") === "floor") position.addScaledVector(frame.up, shape.height / 2);
  const quaternion = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(frame.right, frame.up, frame.forward),
  );
  return (
    <mesh position={position} quaternion={quaternion} raycast={() => null}>
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

function Measurements({ model }: { model: SceneModel }) {
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

function SectionSheet({ model }: { model: SceneModel }) {
  return (
    <mesh position={[model.entrance.x - 0.2, model.heightM / 2, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
      <planeGeometry args={[model.baseM * 1.02, model.heightM]} />
      <meshBasicMaterial color="#c6a15b" transparent opacity={0.08} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

function NorthArrow({ model }: { model: SceneModel }) {
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
  model,
  mode,
  standToken,
  standAt,
  collide,
  selectedId,
  focusToken,
  mobile,
  stick,
}: {
  model: SceneModel;
  mode: "orbit" | "walk";
  standToken: number;
  standAt: Vec3 | null;
  collide: boolean;
  selectedId: string | null;
  focusToken: number;
  mobile: boolean;
  stick: MutableRefObject<Stick>;
}) {
  const { camera, gl, scene } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const eye = useRef(new Vector3(0, 1.65, 210));
  const yaw = useRef(0);
  const pitch = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const walkGoal = useRef<Vector3 | null>(null);
  const frame = useRef<{ from: Vector3; to: Vector3; fromTarget: Vector3; toTarget: Vector3; t: number } | null>(null);
  const raycaster = useRef(new Raycaster());
  const pointer = useRef(new Vector2());
  const ground = useRef(new Plane(new Vector3(0, 1, 0), 0));
  const hitPoint = useRef(new Vector3());

  useEffect(() => {
    const lock = () => {
      if (window.matchMedia("(pointer: coarse)").matches) return;
      gl.domElement.requestPointerLock();
    };
    window.addEventListener("atlas-lock", lock);
    return () => window.removeEventListener("atlas-lock", lock);
  }, [gl]);

  useEffect(() => {
    const current = controls.current;
    if (!current) return;
    current.touches.ONE = TOUCH.ROTATE;
    current.touches.TWO = TOUCH.DOLLY_PAN;
  }, [mode]);

  useEffect(() => {
    if (focusToken === 0 || mode !== "orbit") return;
    const current = controls.current;
    const feature = model.features.find((item) => item.id === selectedId);
    if (!feature || !current) return;
    const bounds = featureBounds(feature);
    const center = applyTrueNorth(bounds.center, model.orientationWestArcsec);
    const span = Math.max(bounds.size[0], bounds.size[1], bounds.size[2], 2);
    const distance = Math.min(280, Math.max(span * 2.6, 9));
    frame.current = {
      from: camera.position.clone(),
      to: new Vector3(center.x + distance * 0.62, center.y + distance * 0.38, center.z + distance * 0.78),
      fromTarget: current.target.clone(),
      toTarget: new Vector3(center.x, Math.max(center.y, 1.2), center.z),
      t: 0,
    };
  }, [focusToken, mode, selectedId, model, camera]);

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

  useEffect(() => {
    if (mode !== "walk") return;
    const element = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;
    let downAt = 0;
    const coarse = () => window.matchMedia("(pointer: coarse)").matches || mobile;
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      if (event.pointerType === "mouse" && !coarse()) return;
      dragging = true;
      lastX = downX = event.clientX;
      lastY = downY = event.clientY;
      downAt = performance.now();
    };
    const move = (event: PointerEvent) => {
      if (!dragging || !event.isPrimary) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      yaw.current -= dx * 0.0045;
      pitch.current = Math.max(-1.15, Math.min(1.15, pitch.current - dy * 0.0045));
    };
    const up = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
      if (moved > 14 || performance.now() - downAt > 400) return;
      const rect = element.getBoundingClientRect();
      pointer.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.current.setFromCamera(pointer.current, camera);
      const hits = raycaster.current.intersectObjects(scene.children, true);
      if (hits.some((hit) => (hit.object.userData as { pick?: unknown }).pick)) return;
      if (raycaster.current.ray.intersectPlane(ground.current, hitPoint.current)) {
        walkGoal.current = hitPoint.current.clone();
      }
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [mode, gl, camera, scene, mobile]);

  useFrame((_, delta) => {
    const current = controls.current;
    if (mode !== "walk") {
      const anim = frame.current;
      if (anim && current) {
        current.enabled = false;
        anim.t = Math.min(1, anim.t + delta / 0.9);
        const eased = 1 - (1 - anim.t) ** 3;
        camera.position.lerpVectors(anim.from, anim.to, eased);
        current.target.lerpVectors(anim.fromTarget, anim.toTarget, eased);
        if (anim.t >= 1) {
          frame.current = null;
          current.enabled = true;
        }
      }
      return;
    }
    const step = (keys.current.ShiftLeft || keys.current.ShiftRight ? 16 : 6.5) * Math.min(delta, 0.05);
    let x = eye.current.x;
    let z = eye.current.z;
    const joyX = stick.current.x;
    const joyY = stick.current.y;
    if (Math.hypot(joyX, joyY) > 0.12) walkGoal.current = null;
    if (keys.current.KeyW || joyY > 0.12) {
      const amount = keys.current.KeyW ? 1 : joyY;
      x += -Math.sin(yaw.current) * step * amount;
      z += -Math.cos(yaw.current) * step * amount;
    }
    if (keys.current.KeyS || joyY < -0.12) {
      const amount = keys.current.KeyS ? 1 : -joyY;
      x -= -Math.sin(yaw.current) * step * amount;
      z -= -Math.cos(yaw.current) * step * amount;
    }
    if (keys.current.KeyA || joyX < -0.12) {
      const amount = keys.current.KeyA ? 1 : -joyX;
      x += -Math.cos(yaw.current) * step * amount;
      z += Math.sin(yaw.current) * step * amount;
    }
    if (keys.current.KeyD || joyX > 0.12) {
      const amount = keys.current.KeyD ? 1 : joyX;
      x -= -Math.cos(yaw.current) * step * amount;
      z -= Math.sin(yaw.current) * step * amount;
    }
    const goal = walkGoal.current;
    if (goal) {
      const dx = goal.x - x;
      const dz = goal.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7) walkGoal.current = null;
      else {
        const pace = Math.min(step, dist);
        x += (dx / dist) * pace;
        z += (dz / dist) * pace;
        yaw.current = Math.atan2(-dx, -dz);
      }
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
      touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
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
