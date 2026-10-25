import { BoxGeometry, BufferAttribute, BufferGeometry, Vector3 } from "three";
import type { Shape, Vec3 } from "./pyramid-model";

export type PassageFrame = {
  origin: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  length: number;
  /** Cosine of the floor's angle above the horizontal. 1 on a level floor. */
  cosSlope: number;
};

export function passageFrame(from: Vec3, to: Vec3): PassageFrame {
  const origin = new Vector3(from.x, from.y, from.z);
  const forward = new Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
  const length = forward.length();
  if (length < 1e-8) forward.set(0, 0, 1);
  else forward.multiplyScalar(1 / Math.max(length, 1e-8));
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-10) right.set(1, 0, 0);
  right.normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();
  return {
    origin,
    forward,
    right,
    up,
    length: Math.max(length, 1e-4),
    cosSlope: Math.max(1e-4, Math.hypot(forward.x, forward.z)),
  };
}

export function localToWorld(frame: PassageFrame, x: number, y: number, z: number): Vector3 {
  return frame.origin
    .clone()
    .addScaledVector(frame.right, x)
    .addScaledVector(frame.up, y)
    .addScaledVector(frame.forward, z);
}

/**
 * Vertical distance from a point down to the floor line, measured plumb.
 * The floor is the straight line from `from` to `to`.
 */
export function floorPlumbHeight(from: Vec3, to: Vec3, point: Vector3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const horizontal = dx * dx + dz * dz;
  const t =
    horizontal < 1e-10 ? 0 : ((point.x - from.x) * dx + (point.z - from.z) * dz) / horizontal;
  const floorY = from.y + t * (to.y - from.y);
  return point.y - floorY;
}

function geometryFromPositions(positions: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildPyramidGeometry(base: number, height: number): BufferGeometry {
  const hw = base / 2;
  const apex = [0, height, 0];
  const ne = [hw, 0, hw];
  const nw = [-hw, 0, hw];
  const se = [hw, 0, -hw];
  const sw = [-hw, 0, -hw];
  const tri = (...verts: number[][]) => verts.flat();
  return geometryFromPositions([
    ...tri(apex, nw, ne),
    ...tri(apex, ne, se),
    ...tri(apex, se, sw),
    ...tri(apex, sw, nw),
    ...tri(nw, sw, se),
    ...tri(nw, se, ne),
  ]);
}

export function buildSteppedGeometry(
  base: number,
  height: number,
  apexHeight: number,
  steps: number,
): BufferGeometry {
  const positions: number[] = [];
  const pushBox = (cy: number, sx: number, sy: number, sz: number) => {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const x0 = -hx;
    const x1 = hx;
    const y0 = cy - hy;
    const y1 = cy + hy;
    const z0 = -hz;
    const z1 = hz;
    const p = (x: number, y: number, z: number) => [x, y, z];
    const faces = [
      [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y0, z1), p(x1, y1, z1), p(x0, y1, z1)],
      [p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y0, z0), p(x0, y1, z0), p(x1, y1, z0)],
      [p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y0, z1), p(x1, y1, z0), p(x1, y1, z1)],
      [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y0, z0), p(x0, y1, z1), p(x0, y1, z0)],
      [p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z1), p(x1, y1, z0), p(x0, y1, z0)],
      [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z0), p(x1, y0, z1), p(x0, y0, z1)],
    ];
    for (const face of faces) positions.push(...face.flat());
  };
  const count = Math.max(1, Math.round(steps));
  for (let i = 0; i < count; i += 1) {
    const y0 = (i * height) / count;
    const y1 = ((i + 1) * height) / count;
    const half = (base / 2) * (1 - y0 / apexHeight);
    pushBox((y0 + y1) / 2, Math.max(half, 0.05) * 2, y1 - y0, Math.max(half, 0.05) * 2);
  }
  return geometryFromPositions(positions);
}

export function buildGableGeometry(g: {
  centerX: number;
  centerZ: number;
  floorY: number;
  sizeX: number;
  sizeZ: number;
  wall: number;
  ridge: number;
}): BufferGeometry {
  const hx = g.sizeX / 2;
  const hz = g.sizeZ / 2;
  const x0 = g.centerX - hx;
  const x1 = g.centerX + hx;
  const z0 = g.centerZ - hz;
  const z1 = g.centerZ + hz;
  const y0 = g.floorY;
  const yw = g.floorY + Math.min(g.wall, g.ridge);
  const yr = g.floorY + g.ridge;
  const positions: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => positions.push(...a, ...b, ...c);
  const p = (x: number, y: number, z: number) => [x, y, z];
  tri(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1));
  tri(p(x0, y0, z0), p(x1, y0, z1), p(x0, y0, z1));
  tri(p(x1, y0, z0), p(x0, y0, z0), p(x0, yw, z0));
  tri(p(x1, y0, z0), p(x0, yw, z0), p(x1, yw, z0));
  tri(p(x0, y0, z1), p(x1, y0, z1), p(x1, yw, z1));
  tri(p(x0, y0, z1), p(x1, yw, z1), p(x0, yw, z1));
  tri(p(x0, y0, z0), p(x0, y0, z1), p(x0, yw, z1));
  tri(p(x0, y0, z0), p(x0, yw, z1), p(x0, yw, z0));
  tri(p(x1, y0, z1), p(x1, y0, z0), p(x1, yw, z0));
  tri(p(x1, y0, z1), p(x1, yw, z0), p(x1, yw, z1));
  if (yr > yw + 1e-4) {
    tri(p(x0, yw, z0), p(x0, yw, z1), p(x0, yr, g.centerZ));
    tri(p(x1, yw, z1), p(x1, yw, z0), p(x1, yr, g.centerZ));
  }
  tri(p(x0, yw, z0), p(x1, yw, z0), p(x1, yr, g.centerZ));
  tri(p(x0, yw, z0), p(x1, yr, g.centerZ), p(x0, yr, g.centerZ));
  tri(p(x0, yr, g.centerZ), p(x1, yr, g.centerZ), p(x1, yw, z1));
  tri(p(x0, yr, g.centerZ), p(x1, yw, z1), p(x0, yw, z1));
  return geometryFromPositions(positions);
}

/**
 * Grand Gallery air space. `verticalHeight` is Petrie's plumb height.
 * In the frame whose Y axis is the floor normal, that plumb height is a
 * shorter perpendicular distance: H_perp = H_plumb × cos(slope). A plumb
 * line then meets the ceiling one plumb-height above the floor.
 */
export function buildCorbelGeometry(shape: Extract<Shape, { kind: "corbel" }>): BufferGeometry {
  const frame = passageFrame(shape.from, shape.to);
  const hPerp = shape.verticalHeight * frame.cosSlope;
  const rampH = Math.min(shape.rampVertical * frame.cosSlope, hPerp * 0.35);
  const wall = shape.floorWidth;
  const slot = shape.floorWidth / 2;
  const overhang = (wall - shape.topWidth) / 2;
  const laps = Math.max(1, Math.round(shape.laps));
  const lapH = (hPerp - rampH) / laps;
  const right: Array<[number, number]> = [
    [slot / 2, 0],
    [wall / 2, rampH],
  ];
  for (let i = 0; i < laps; i += 1) {
    const x0 = wall / 2 - (i * overhang) / laps;
    const x1 = wall / 2 - ((i + 1) * overhang) / laps;
    const y1 = rampH + (i + 1) * lapH;
    right.push([x0, y1]);
    if (Math.abs(x1 - x0) > 1e-5) right.push([x1, y1]);
  }
  const profile = dedupe([
    ...right,
    ...[...right].reverse().map(([x, y]) => [-x, y] as [number, number]),
  ]);
  const positions: number[] = [];
  const world = (x: number, y: number, z: number) => localToWorld(frame, x, y, z);
  for (let i = 0; i < profile.length; i += 1) {
    const a = profile[i];
    const b = profile[(i + 1) % profile.length];
    const a0 = world(a[0], a[1], 0);
    const b0 = world(b[0], b[1], 0);
    const a1 = world(a[0], a[1], frame.length);
    const b1 = world(b[0], b[1], frame.length);
    positions.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z);
    positions.push(a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
  }
  const cap = (z: number, flip: boolean) => {
    const pts = profile.map(([x, y]) => world(x, y, z));
    const c = world(0, hPerp * 0.42, z);
    for (let i = 0; i < pts.length; i += 1) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      if (flip) positions.push(c.x, c.y, c.z, p1.x, p1.y, p1.z, p0.x, p0.y, p0.z);
      else positions.push(c.x, c.y, c.z, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
  };
  cap(0, true);
  cap(frame.length, false);
  return geometryFromPositions(positions);
}

export function buildRemnantGeometry(length: number, height: number, base: number): BufferGeometry {
  const geometry = new BoxGeometry(length, height, 1.15);
  geometry.translate(0, height / 2, base / 2 - 0.4);
  return geometry;
}

function dedupe(points: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(prev[0] - point[0], prev[1] - point[1]) > 1e-5) out.push(point);
  }
  if (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-5) out.pop();
  }
  return out;
}
