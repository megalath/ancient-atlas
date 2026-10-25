import type { BuiltFeature, Shape, Vec3 } from "./pyramid-model";

export type FeatureBounds = {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: [number, number, number];
  volume: number;
};

function empty() {
  return {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
}

function add(box: { min: Vec3; max: Vec3 }, x: number, y: number, z: number) {
  box.min.x = Math.min(box.min.x, x);
  box.min.y = Math.min(box.min.y, y);
  box.min.z = Math.min(box.min.z, z);
  box.max.x = Math.max(box.max.x, x);
  box.max.y = Math.max(box.max.y, y);
  box.max.z = Math.max(box.max.z, z);
}

function addPoint(box: { min: Vec3; max: Vec3 }, point: Vec3) {
  add(box, point.x, point.y, point.z);
}

function expandBox(box: { min: Vec3; max: Vec3 }, point: Vec3, radius: number) {
  add(box, point.x - radius, point.y - radius, point.z - radius);
  add(box, point.x + radius, point.y + radius, point.z + radius);
}

function shapeInto(box: { min: Vec3; max: Vec3 }, shape: Shape) {
  if (shape.kind === "pyramid" || shape.kind === "stepped") {
    const half = shape.base / 2;
    add(box, -half, 0, -half);
    add(box, half, shape.height, half);
    return;
  }
  if (shape.kind === "slab") {
    add(box, -shape.half, shape.y - shape.thickness, -shape.half);
    add(box, shape.half, shape.y, shape.half);
    return;
  }
  if (shape.kind === "remnant") {
    const half = shape.length / 2;
    const z = shape.base / 2;
    add(box, -half, 0, z - 2);
    add(box, half, shape.height, z);
    return;
  }
  if (shape.kind === "aabb") {
    addPoint(box, shape.min);
    addPoint(box, shape.max);
    return;
  }
  if (shape.kind === "cylinder" || shape.kind === "disc") {
    const radius = shape.kind === "disc" ? shape.radius : shape.radius;
    const height = shape.height;
    const x = shape.kind === "cylinder" ? (shape.x ?? 0) : 0;
    const z = shape.kind === "cylinder" ? (shape.z ?? 0) : 0;
    const y = shape.kind === "cylinder" ? shape.y : 0;
    add(box, x - radius, y, z - radius);
    add(box, x + radius, y + height, z + radius);
    return;
  }
  if (shape.kind === "runway") {
    addPoint(box, shape.from);
    addPoint(box, shape.to);
    const pad = shape.width / 2;
    box.min.x -= pad;
    box.max.x += pad;
    box.min.z -= pad;
    box.max.z += pad;
    return;
  }
  if (shape.kind === "polygon") {
    for (const point of shape.points) add(box, point.x, shape.y, point.z);
    add(box, box.min.x, shape.y + (shape.height ?? 1), box.min.z);
    return;
  }
  if (shape.kind === "gable") {
    add(
      box,
      shape.centerX - shape.sizeX / 2,
      shape.floorY,
      shape.centerZ - shape.sizeZ / 2,
    );
    add(
      box,
      shape.centerX + shape.sizeX / 2,
      shape.floorY + Math.max(shape.ridge, shape.wall),
      shape.centerZ + shape.sizeZ / 2,
    );
    return;
  }
  const radius = Math.max(
    shape.kind === "corbel" ? shape.floorWidth / 2 : shape.width / 2,
    shape.kind === "corbel" ? shape.verticalHeight : shape.height,
    0.4,
  );
  expandBox(box, shape.from, radius);
  expandBox(box, shape.to, radius);
}

/** A padded box used for picking and for framing the camera. */
export function featureBounds(feature: BuiltFeature): FeatureBounds {
  const box = empty();
  for (const shape of feature.shapes) shapeInto(box, shape);
  if (!Number.isFinite(box.min.x)) {
    add(box, -0.5, 0, -0.5);
    add(box, 0.5, 1, 0.5);
  }
  const pad = 0.4;
  box.min.x -= pad;
  box.min.y -= pad;
  box.min.z -= pad;
  box.max.x += pad;
  box.max.y += pad;
  box.max.z += pad;
  const size: [number, number, number] = [
    Math.max(box.max.x - box.min.x, 0.8),
    Math.max(box.max.y - box.min.y, 0.8),
    Math.max(box.max.z - box.min.z, 0.8),
  ];
  return {
    min: box.min,
    max: box.max,
    center: {
      x: (box.min.x + box.max.x) / 2,
      y: (box.min.y + box.max.y) / 2,
      z: (box.min.z + box.max.z) / 2,
    },
    size,
    volume: size[0] * size[1] * size[2],
  };
}
