// Loads the Blender district's physics data (colliders, markers, spawn yaw) from GLB bytes.

import { parseGlbJson, worldBoxesFromGlb, markersFromGlb, spawnYawFromGlb } from './glb';
import type { DistrictData } from './scenario';

export function districtFromGlb(bytes: Uint8Array): DistrictData {
  const json = parseGlbJson(bytes);
  return { boxes: worldBoxesFromGlb(bytes), markers: markersFromGlb(json), spawnYaw: spawnYawFromGlb(json) };
}
