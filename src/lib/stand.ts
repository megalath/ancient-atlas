import { featureAnchor, type BuiltFeature, type Vec3 } from "./pyramid-model";

/** A place to put the eye. Chambers use the floor; the shell uses the ground to the north. */
export function standPosition(feature: BuiltFeature, baseM: number): Vec3 {
  const shape = feature.shapes[0];
  if (shape.kind === "aabb") {
    return {
      x: (shape.min.x + shape.max.x) / 2,
      y: shape.min.y + 1.62,
      z: (shape.min.z + shape.max.z) / 2,
    };
  }
  if (shape.kind === "gable") {
    return { x: shape.centerX, y: shape.floorY + 1.62, z: shape.centerZ };
  }
  if (shape.kind === "axis" || shape.kind === "corbel") {
    return {
      x: (shape.from.x + shape.to.x) / 2,
      y: (shape.from.y + shape.to.y) / 2 + (shape.kind === "axis" && shape.align === "center" ? 0 : 0.85),
      z: (shape.from.z + shape.to.z) / 2,
    };
  }
  const anchor = featureAnchor(feature);
  if (feature.layer === "interior") return { x: anchor.x, y: anchor.y + 1.4, z: anchor.z };
  return { x: 0, y: 1.65, z: baseM / 2 + 90 };
}

export function groundPosition(baseM: number): Vec3 {
  return { x: 0, y: 1.65, z: baseM / 2 + 90 };
}
