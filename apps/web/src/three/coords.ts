import { Vector3 } from "three";

/**
 * Coordinate convention bridge.
 *
 * Backend/engineering convention: x = east, y = north (plan depth), z = up.
 * Three.js convention: y = up. We map (x, y, z) -> (x, z, y) so that the
 * engineering "up" axis renders vertically. Centralised here so every mesh
 * uses the same mapping.
 */
export function toThree([x, y, z]: [number, number, number]): Vector3 {
  return new Vector3(x, z, y);
}
