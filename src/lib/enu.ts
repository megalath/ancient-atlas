/** Local tangent frame. +X east, +Z north, metres. */
export const METRES_PER_DEG_LAT = 111132.92;

export function metresPerDegLon(latitude: number): number {
  return 111412.84 * Math.cos((latitude * Math.PI) / 180);
}

export function toEnu(
  latitude: number,
  longitude: number,
  originLat: number,
  originLon: number,
): { x: number; z: number } {
  return {
    x: (longitude - originLon) * metresPerDegLon(originLat),
    z: (latitude - originLat) * METRES_PER_DEG_LAT,
  };
}

export function enuDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
