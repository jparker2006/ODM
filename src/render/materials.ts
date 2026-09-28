// Greybox materials: flat colors with world-space grid lines, so speed, distance and surfaces
// read clearly in flight. Fine lines every metre, storey lines on facades, 10 m lines on the ground.

import { MeshStandardNodeMaterial, Color } from 'three/webgpu';
import { positionWorld, normalWorld, abs, fract, fwidth, min, max, float, step, color } from 'three/tsl';
import type { Node } from 'three/webgpu';

/** Anti-aliased grid line coverage for a 2D coordinate at a given spacing (1 on a line, 0 between). */
function lines2(p: Node<'vec2'>, spacing: number): Node<'float'> {
  const c = p.div(spacing);
  const g = abs(fract(c.sub(0.5)).sub(0.5)).div(fwidth(c).max(1e-4));
  return float(1).sub(min(min(g.x, g.y), float(1)));
}

/** Horizontal line coverage on the y axis only (storey bands). */
function lines1(y: Node<'float'>, spacing: number): Node<'float'> {
  const c = y.div(spacing);
  const g = abs(fract(c.sub(0.5)).sub(0.5)).div(fwidth(c).max(1e-4));
  return float(1).sub(min(g, float(1)));
}

export interface GreyboxStyle {
  base: string;
  fine: number;
  coarse: number;
  coarseSpacing: number;
  storey?: number;
  roughness?: number;
}

export function greyboxMaterial(style: GreyboxStyle): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  const n = abs(normalWorld);
  const up = step(max(n.x, n.z), n.y);
  const onX = step(n.z, n.x).mul(float(1).sub(up));
  const onZ = float(1).sub(up).sub(onX);
  const p = positionWorld;
  const fine = lines2(p.xz, 1).mul(up).add(lines2(p.zy, 1).mul(onX)).add(lines2(p.xy, 1).mul(onZ));
  const coarse = lines2(p.xz, style.coarseSpacing).mul(up);
  const storey = style.storey ? lines1(p.y, style.storey).mul(float(1).sub(up)) : float(0);
  const shade = float(1).sub(fine.mul(style.fine)).sub(max(coarse, storey).mul(style.coarse));
  m.colorNode = color(new Color(style.base)).mul(shade);
  m.roughness = style.roughness ?? 0.9;
  m.metalness = 0;
  return m;
}

export const PALETTE: Record<string, GreyboxStyle> = {
  mat_ground: { base: '#9a9286', fine: 0.1, coarse: 0.28, coarseSpacing: 10 },
  mat_building: { base: '#c9c1b3', fine: 0.06, coarse: 0.2, coarseSpacing: 10, storey: 3.5 },
  mat_roof: { base: '#9b6a55', fine: 0.08, coarse: 0.18, coarseSpacing: 5 },
  mat_tower: { base: '#b9b2a6', fine: 0.06, coarse: 0.22, coarseSpacing: 10, storey: 5 },
  mat_wall: { base: '#c7ae88', fine: 0.05, coarse: 0.25, coarseSpacing: 10, storey: 10 },
  mat_fixture: { base: '#b8b8b8', fine: 0.08, coarse: 0.2, coarseSpacing: 10, storey: 4 },
};
