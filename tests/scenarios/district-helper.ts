import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { districtFromGlb } from '../../src/sim/district';
import type { DistrictData } from '../../src/sim/scenario';

let cached: DistrictData | null = null;
export function loadDistrict(): DistrictData {
  if (!cached) cached = districtFromGlb(new Uint8Array(readFileSync(resolve(__dirname, '../../public/assets/district.glb'))));
  return cached;
}
