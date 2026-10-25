"use client";

import { Html, Line, OrbitControls, useTexture } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Plane,
  Quaternion,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TOUCH,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { LayerState } from "@/components/PyramidView";
import type { AtlasSite } from "@/lib/atlas";
import { featureBounds } from "@/lib/bounds";
import { METRES_PER_DEG_LAT, metresPerDegLon } from "@/lib/enu";
import type { BuiltFeature, Shape as AtlasShape, Vec3 } from "@/lib/pyramid-model";

const COLORS: Record<string, string> = {
  sand: "#c2a882",
  asphalt: "#2c2c2a",
  water: "#e4dcc8",
  metal: "#9aabb4",
  reactor: "#e0b15a",
  bedrock: "#8d7b66",
};

type Props = {
  site: AtlasSite;
  layers: LayerState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  focusToken: number;
  mobile: boolean;
};

export function LandscapeView(props: Props) {
  const craft = props.site.features.some(
    (feature) => feature.id === props.selectedId && feature.scene === "sport-model",
  );
  return (
    <Canvas
      key={craft ? "craft" : "terrain"}
      camera={{
        position: craft ? [8, 7.4, 20] : [1800, 5200, 2600],
        fov: craft ? 42 : 46,
        near: craft ? 0.04 : 2,
        far: craft ? 200 : 80000,
      }}
      gl={{
        antialias: !props.mobile,
        localClippingEnabled: true,
        logarithmicDepthBuffer: true,
        preserveDrawingBuffer: true,
        powerPreference: props.mobile ? "low-power" : "high-performance",
      }}
      dpr={props.mobile ? [1, 1.25] : [1, 1.75]}
      onPointerMissed={() => props.onHover(null)}
    >
      <color attach="background" args={[craft ? "#12161c" : "#c4b59a"]} />
      <ambientLight intensity={craft ? 0.7 : 0.85} />
      <directionalLight position={[4000, 6000, 2000]} intensity={1.35} />
      <Suspense fallback={null}>
        {craft ? <CraftScene {...props} /> : <TerrainScene {...props} />}
      </Suspense>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={craft ? Math.PI : Math.PI / 2.05}
        minDistance={craft ? 3 : 40}
        maxDistance={craft ? 40 : 40000}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
    </Canvas>
  );
}

function useHeights(url: string | undefined) {
  const [heights, setHeights] = useState<Int16Array | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancel = false;
    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        if (!cancel) setHeights(new Int16Array(buffer));
      })
      .catch(() => {
        if (!cancel) setHeights(null);
      });
    return () => {
      cancel = true;
    };
  }, [url]);
  return heights;
}

function TerrainScene(props: Props) {
  const terrain = props.site.terrain;
  const heights = useHeights(terrain?.heights);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const camera = useThree((state) => state.camera);
  const origin = { lat: props.site.latitude, lon: props.site.longitude };
  const shown = props.site.features.filter(
    (feature) => feature.scene === "terrain" && feature.group !== "Claims" && layerOn(feature, props.layers),
  );

  useEffect(() => {
    const feature = props.site.features.find((item) => item.id === props.selectedId && item.scene === "terrain");
    if (!feature || !props.focusToken) return;
    const bounds = featureBounds(feature);
    const span = Math.max(bounds.size[0], bounds.size[2], 120);
    const next = new Vector3(
      bounds.center.x + span * 0.22,
      bounds.center.y + span * 0.85,
      bounds.center.z + span * 0.38,
    );
    camera.position.copy(next);
    controls?.target.set(bounds.center.x, Math.max(bounds.center.y, 20), bounds.center.z);
    controls?.update();
  }, [props.focusToken, props.selectedId, props.site.features, camera, controls]);

  return (
    <>
      {terrain && heights ? <TerrainMesh site={props.site} heights={heights} /> : null}
      {shown.map((feature) => (
        <FeatureMeshes
          key={feature.id}
          feature={feature}
          selected={feature.id === props.selectedId}
          mobile={props.mobile}
          annotate={props.layers.annotations}
          ground={(x, z) => (terrain && heights ? sampleGround(terrain, heights, origin, x, z) : 40)}
          onSelect={props.onSelect}
          onHover={props.onHover}
        />
      ))}
    </>
  );
}

function CraftScene(props: Props) {
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const camera = useThree((state) => state.camera);
  const shown = props.site.features.filter((feature) => feature.scene === "sport-model" && craftLayerOn(feature, props.layers));
  const sectioned = props.layers.section;
  const hullOpen = sectioned || props.layers.casingOpacity < 0.45 || !props.layers.casing;
  const clipPlanes = useMemo(() => [new Plane(new Vector3(0, 0, -1), 0.35)], []);

  useEffect(() => {
    const feature = props.site.features.find((item) => item.id === props.selectedId && item.scene === "sport-model");
    if (!feature || !props.focusToken) return;
    const bounds = featureBounds(feature);
    const hull = props.site.features.find((item) => item.id === "sport-model");
    const hullSpan = hull ? Math.max(...featureBounds(hull).size) : 12;
    const distance = Math.max(hullSpan * 1.55, Math.max(...bounds.size, 1) * 2.2);
    const target = bounds.center;
    camera.position.set(target.x + distance * 0.42, target.y + distance * 0.36, target.z + distance);
    controls?.target.set(target.x, target.y, target.z);
    controls?.update();
  }, [props.focusToken, props.selectedId, props.site.features, camera, controls]);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[8, 48]} />
        <meshStandardMaterial color="#2a3038" roughness={1} />
      </mesh>
      {shown.map((feature) => (
        <FeatureMeshes
          key={feature.id}
          feature={feature}
          selected={feature.id === props.selectedId}
          mobile={props.mobile}
          annotate={props.layers.annotations}
          ground={() => 0}
          opacity={
            feature.layer === "hull" ? (sectioned ? Math.max(props.layers.casingOpacity, 0.9) : hullOpen ? props.layers.casingOpacity : 1) : 1
          }
          clippingPlanes={feature.layer === "hull" && sectioned ? clipPlanes : undefined}
          blockRaycast={feature.layer === "hull" && hullOpen && !sectioned}
          onSelect={props.onSelect}
          onHover={props.onHover}
        />
      ))}
    </>
  );
}

function layerOn(feature: BuiltFeature, layers: LayerState): boolean {
  if (feature.layer === "airfield" || feature.layer === "buildings") return layers.core;
  if (feature.layer === "boundary") return layers.measurements;
  if (feature.layer === "s4") return layers.interior;
  return layers.casing;
}

function craftLayerOn(feature: BuiltFeature, layers: LayerState): boolean {
  if (feature.layer === "hull") return layers.casing || layers.section;
  if (feature.layer === "craft-interior") return layers.interior;
  return true;
}

function sampleGround(
  terrain: NonNullable<AtlasSite["terrain"]>,
  heights: Int16Array,
  origin: { lat: number; lon: number },
  x: number,
  z: number,
): number {
  const lat = origin.lat + z / METRES_PER_DEG_LAT;
  const lon = origin.lon + x / metresPerDegLon(origin.lat);
  const col = ((lon - terrain.west) / (terrain.east - terrain.west)) * (terrain.cols - 1);
  const row = ((terrain.north - lat) / (terrain.north - terrain.south)) * (terrain.rows - 1);
  const c = Math.min(terrain.cols - 1, Math.max(0, Math.round(col)));
  const r = Math.min(terrain.rows - 1, Math.max(0, Math.round(row)));
  return heights[r * terrain.cols + c] - terrain.datumM;
}

function TerrainMesh({ site, heights }: { site: AtlasSite; heights: Int16Array }) {
  const terrain = site.terrain!;
  const texture = useTexture(terrain.image);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const geometry = useMemo(() => {
    const { cols, rows, west, south, east, north, datumM } = terrain;
    const positions = new Float32Array(cols * rows * 3);
    const uvs = new Float32Array(cols * rows * 2);
    const index: number[] = [];
    for (let r = 0; r < rows; r += 1) {
      const lat = north - (r / (rows - 1)) * (north - south);
      const z = (lat - site.latitude) * METRES_PER_DEG_LAT;
      for (let c = 0; c < cols; c += 1) {
        const lon = west + (c / (cols - 1)) * (east - west);
        const x = (lon - site.longitude) * metresPerDegLon(site.latitude);
        const i = r * cols + c;
        positions[i * 3] = x;
        positions[i * 3 + 1] = heights[i] - datumM;
        positions[i * 3 + 2] = z;
        uvs[i * 2] = (lon - terrain.imageWest) / (terrain.imageEast - terrain.imageWest);
        uvs[i * 2 + 1] = (lat - terrain.imageSouth) / (terrain.imageNorth - terrain.imageSouth);
      }
    }
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const a = r * cols + c;
        const b = a + 1;
        const d = a + cols;
        // CCW when viewed from above, so the satellite drape faces the camera.
        index.push(a, b, d, b, a + cols + 1, d);
      }
    }
    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(positions, 3));
    geom.setAttribute("uv", new BufferAttribute(uvs, 2));
    geom.setIndex(index);
    geom.computeVertexNormals();
    return geom;
  }, [heights, site.latitude, site.longitude, terrain]);

  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshStandardMaterial map={texture} roughness={1} metalness={0} side={DoubleSide} />
    </mesh>
  );
}

function FeatureMeshes({
  feature,
  selected,
  mobile,
  annotate,
  ground,
  opacity = 1,
  clippingPlanes,
  blockRaycast = false,
  onSelect,
  onHover,
}: {
  feature: BuiltFeature;
  selected: boolean;
  mobile: boolean;
  annotate: boolean;
  ground: (x: number, z: number) => number;
  opacity?: number;
  clippingPlanes?: Plane[];
  blockRaycast?: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const bounds = featureBounds(feature);
  const color = COLORS[feature.material] ?? "#c4b496";
  const yLift = feature.scene === "sport-model" ? 0 : ground(bounds.center.x, bounds.center.z);
  return (
    <group>
      {feature.shapes.map((shape, index) => (
        <ShapeMesh
          key={`${feature.id}-${index}`}
          shape={shape}
          color={selected ? "#f0d48a" : color}
          opacity={opacity}
          yLift={feature.scene === "sport-model" ? 0 : yLiftOf(shape, ground)}
          selected={selected}
          clippingPlanes={clippingPlanes}
          blockRaycast={blockRaycast}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(feature.id);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            onHover(feature.id);
          }}
          onPointerOut={() => onHover(null)}
        />
      ))}
      {annotate && selected ? (
        <Html position={[bounds.center.x, bounds.center.y + (feature.scene === "sport-model" ? 0.4 : 30), bounds.center.z]} center zIndexRange={[12, 0]} distanceFactor={feature.scene === "sport-model" ? 8 : mobile ? 900 : 1400}>
          <span className="marker-label">{feature.name}</span>
        </Html>
      ) : null}
    </group>
  );
}

function yLiftOf(shape: AtlasShape, ground: (x: number, z: number) => number): number {
  if (shape.kind === "runway") return ground((shape.from.x + shape.to.x) / 2, (shape.from.z + shape.to.z) / 2);
  if (shape.kind === "aabb") return ground((shape.min.x + shape.max.x) / 2, (shape.min.z + shape.max.z) / 2) - shape.min.y;
  if (shape.kind === "polygon") {
    const x = shape.points.reduce((sum, point) => sum + point.x, 0) / shape.points.length;
    const z = shape.points.reduce((sum, point) => sum + point.z, 0) / shape.points.length;
    return ground(x, z);
  }
  if (shape.kind === "cylinder") return ground(shape.x ?? 0, shape.z ?? 0);
  return 0;
}

function ShapeMesh({
  shape,
  color,
  opacity,
  yLift,
  selected,
  clippingPlanes,
  blockRaycast,
  onClick,
  onPointerOver,
  onPointerOut,
}: {
  shape: AtlasShape;
  color: string;
  opacity: number;
  yLift: number;
  selected: boolean;
  clippingPlanes?: Plane[];
  blockRaycast: boolean;
  onClick: (event: { stopPropagation: () => void }) => void;
  onPointerOver: (event: { stopPropagation: () => void }) => void;
  onPointerOut: () => void;
}) {
  const handlers = { onClick, onPointerOver, onPointerOut };
  const material = (
    <meshStandardMaterial
      color={color}
      roughness={0.86}
      metalness={shape.kind === "cylinder" ? 0.2 : 0}
      transparent={opacity < 0.98}
      opacity={opacity}
      depthWrite={opacity > 0.4}
      side={DoubleSide}
      clippingPlanes={clippingPlanes}
      emissive={selected ? "#6a5420" : "#000"}
      emissiveIntensity={selected ? 0.45 : 0}
    />
  );
  const raycast = blockRaycast ? () => null : undefined;

  if (shape.kind === "runway") {
    const from = shape.from;
    const to = shape.to;
    const direction = new Vector3(to.x - from.x, 0, to.z - from.z);
    const length = Math.max(direction.length(), 1);
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), direction.clone().normalize());
    return (
      <mesh
        position={[(from.x + to.x) / 2, yLift + 0.6, (from.z + to.z) / 2]}
        quaternion={quaternion}
        raycast={raycast}
        {...handlers}
      >
        <boxGeometry args={[shape.width, 1.2, length]} />
        {material}
      </mesh>
    );
  }
  if (shape.kind === "aabb") {
    const size: Vec3 = {
      x: shape.max.x - shape.min.x,
      y: shape.max.y - shape.min.y,
      z: shape.max.z - shape.min.z,
    };
    return (
      <mesh
        position={[(shape.min.x + shape.max.x) / 2, yLift + (shape.min.y + shape.max.y) / 2, (shape.min.z + shape.max.z) / 2]}
        raycast={raycast}
        {...handlers}
      >
        <boxGeometry args={[size.x, size.y, size.z]} />
        {material}
      </mesh>
    );
  }
  if (shape.kind === "cylinder") {
    return (
      <mesh position={[shape.x ?? 0, (shape.y ?? 0) + shape.height / 2, shape.z ?? 0]} raycast={raycast} {...handlers}>
        <cylinderGeometry args={[shape.radius, shape.radius, shape.height, 28]} />
        {material}
      </mesh>
    );
  }
  if (shape.kind === "disc") {
    const scaleY = shape.height / (shape.radius * 2);
    return (
      <mesh position={[0, shape.height / 2, 0]} scale={[1, scaleY, 1]} raycast={raycast} {...handlers}>
        <sphereGeometry args={[shape.radius, 48, 32]} />
        {material}
      </mesh>
    );
  }
  if (shape.kind === "polygon") {
    const flat = new Shape();
    shape.points.forEach((point, index) => {
      if (index === 0) flat.moveTo(point.x, point.z);
      else flat.lineTo(point.x, point.z);
    });
    flat.closePath();
    const fill = new ShapeGeometry(flat);
    const loop = shape.points.map((point) => [point.x, yLift + 40, point.z] as [number, number, number]);
    loop.push(loop[0]);
    return (
      <group>
        <mesh geometry={fill} position={[0, yLift + 3, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={raycast} {...handlers}>
          <meshStandardMaterial color={color} transparent opacity={0.12} depthWrite={false} side={DoubleSide} />
        </mesh>
        <Line points={loop} color={selected ? "#f0d48a" : "#f4efe4"} />
      </group>
    );
  }
  return null;
}
