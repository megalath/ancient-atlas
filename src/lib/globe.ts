import type { Vec3 } from "./pyramid-model";

/**
 * Equirectangular placement matching three.js SphereGeometry.
 * Longitude 0°, latitude 0° sits on +X. Longitude 90° E sits on −Z.
 * The vendored Blue Marble image has its prime meridian at the centre,
 * which is the sphere's u = 0.5, so the texture needs no extra yaw.
 */
export function latLonToVector(latDeg: number, lonDeg: number, radius: number): Vec3 {
  const theta = ((90 - latDeg) * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const sinTheta = Math.sin(theta);
  return {
    x: radius * Math.cos(lon) * sinTheta,
    y: radius * Math.cos(theta),
    z: -radius * Math.sin(lon) * sinTheta,
  };
}
