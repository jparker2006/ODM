// Static collision world: axis-aligned boxes in a uniform XZ grid.
// Every greybox surface is a box, so raycasts and sphere contacts are exact.

import type { Vec3 } from './vec';

export type BoxKind = 'ground' | 'building' | 'tower' | 'wall' | 'fixture' | 'supply';

export interface WorldBox {
  name: string;
  kind: BoxKind;
  anchorable: boolean;
  min: Vec3;
  max: Vec3;
}

export interface RayHit {
  t: number;
  point: Vec3;
  normal: Vec3;
  box: WorldBox;
}

export interface SphereContact {
  normal: Vec3;
  depth: number;
  box: WorldBox;
}

const CELL = 32;

export class World {
  readonly boxes: WorldBox[];
  private readonly cells = new Map<number, number[]>();
  private readonly big: number[] = [];
  private stamp: Uint32Array;
  private stampId = 0;

  constructor(boxes: WorldBox[]) {
    this.boxes = boxes;
    this.stamp = new Uint32Array(boxes.length);
    boxes.forEach((b, i) => {
      const x0 = Math.floor(b.min.x / CELL);
      const x1 = Math.floor(b.max.x / CELL);
      const z0 = Math.floor(b.min.z / CELL);
      const z1 = Math.floor(b.max.z / CELL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) {
        this.big.push(i);
        return;
      }
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const k = key(cx, cz);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(i);
        }
      }
    });
  }

  /** Boxes whose XZ footprint may overlap the given XZ range. Each box is visited once. */
  forEachNear(minX: number, minZ: number, maxX: number, maxZ: number, fn: (b: WorldBox) => void): void {
    const id = this.nextStamp();
    for (const i of this.big) {
      this.stamp[i] = id;
      fn(this.boxes[i]!);
    }
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(key(cx, cz));
        if (!list) continue;
        for (const i of list) {
          if (this.stamp[i] === id) continue;
          this.stamp[i] = id;
          fn(this.boxes[i]!);
        }
      }
    }
  }

  /** Nearest hit along a ray within maxT. dir must be unit length. */
  raycast(origin: Vec3, dir: Vec3, maxT: number, filter?: (b: WorldBox) => boolean): RayHit | null {
    let best: RayHit | null = null;
    // Walk the grid cells the ray crosses (2D DDA in XZ), testing boxes as we go.
    const id = this.nextStamp();
    const test = (i: number): void => {
      if (this.stamp[i] === id) return;
      this.stamp[i] = id;
      const b = this.boxes[i]!;
      if (filter && !filter(b)) return;
      const hit = rayBox(origin, dir, b, best ? best.t : maxT);
      if (hit) best = hit;
    };
    for (const i of this.big) test(i);

    let cx = Math.floor(origin.x / CELL);
    let cz = Math.floor(origin.z / CELL);
    const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
    const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;
    const tDeltaX = stepX !== 0 ? CELL / Math.abs(dir.x) : Infinity;
    const tDeltaZ = stepZ !== 0 ? CELL / Math.abs(dir.z) : Infinity;
    const nextX = stepX > 0 ? (cx + 1) * CELL : cx * CELL;
    const nextZ = stepZ > 0 ? (cz + 1) * CELL : cz * CELL;
    let tMaxX = stepX !== 0 ? (nextX - origin.x) / dir.x : Infinity;
    let tMaxZ = stepZ !== 0 ? (nextZ - origin.z) / dir.z : Infinity;
    let t: number;
    for (let guard = 0; guard < 4096; guard++) {
      const list = this.cells.get(key(cx, cz));
      if (list) for (const i of list) test(i);
      // Boxes span cells, so a hit found so far is final once it is nearer than this cell's exit.
      const bestT: number = best ? (best as RayHit).t : Infinity;
      if (bestT <= Math.min(tMaxX, tMaxZ)) break;
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
      if (t > maxT || !Number.isFinite(t)) break;
    }
    return best;
  }

  /** All boxes penetrating a sphere, with push-out normals. */
  sphereContacts(c: Vec3, r: number, out: SphereContact[]): void {
    this.forEachNear(c.x - r, c.z - r, c.x + r, c.z + r, (b) => {
      const contact = sphereBox(c, r, b);
      if (contact) out.push(contact);
    });
  }

  /** Highest surface directly below a point (a downward raycast). */
  floorBelow(p: Vec3, maxDown = 200): number {
    const hit = this.raycast(p, { x: 0, y: -1, z: 0 }, maxDown);
    return hit ? hit.point.y : p.y - maxDown;
  }

  private nextStamp(): number {
    this.stampId++;
    if (this.stampId === 0xffffffff) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
    return this.stampId;
  }
}

function key(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** Slab test for one axis; updates the shared entry/exit state. Returns false on a miss. */
const slab = { tmin: 0, tmax: 0, axis: -1, sign: 0 };
function slabAxis(o: number, d: number, lo: number, hi: number, axis: number): boolean {
  if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
  const inv = 1 / d;
  let t1 = (lo - o) * inv;
  let t2 = (hi - o) * inv;
  let s = -1;
  if (t1 > t2) {
    const tmp = t1;
    t1 = t2;
    t2 = tmp;
    s = 1;
  }
  if (t1 > slab.tmin) {
    slab.tmin = t1;
    slab.axis = axis;
    slab.sign = s;
  }
  if (t2 < slab.tmax) slab.tmax = t2;
  return slab.tmin <= slab.tmax;
}

/** Ray against one box. Allocates only when it hits. */
export function rayBox(o: Vec3, d: Vec3, b: WorldBox, maxT: number): RayHit | null {
  slab.tmin = 0;
  slab.tmax = maxT;
  slab.axis = -1;
  slab.sign = 0;
  if (!slabAxis(o.x, d.x, b.min.x, b.max.x, 0)) return null;
  if (!slabAxis(o.y, d.y, b.min.y, b.max.y, 1)) return null;
  if (!slabAxis(o.z, d.z, b.min.z, b.max.z, 2)) return null;
  if (slab.axis < 0) return null; // origin inside the box
  const t = slab.tmin;
  const normal = { x: 0, y: 0, z: 0 };
  if (slab.axis === 0) normal.x = slab.sign;
  else if (slab.axis === 1) normal.y = slab.sign;
  else normal.z = slab.sign;
  return { t, point: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t }, normal, box: b };
}

export function sphereBox(c: Vec3, r: number, b: WorldBox): SphereContact | null {
  if (c.y - r > b.max.y || c.y + r < b.min.y) return null;
  const px = Math.max(b.min.x, Math.min(c.x, b.max.x));
  const py = Math.max(b.min.y, Math.min(c.y, b.max.y));
  const pz = Math.max(b.min.z, Math.min(c.z, b.max.z));
  const dx = c.x - px;
  const dy = c.y - py;
  const dz = c.z - pz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return { normal: { x: dx / d, y: dy / d, z: dz / d }, depth: r - d, box: b };
  }
  // Center inside the box: push out through the nearest face.
  const faces = [
    { n: { x: -1, y: 0, z: 0 }, d: c.x - b.min.x },
    { n: { x: 1, y: 0, z: 0 }, d: b.max.x - c.x },
    { n: { x: 0, y: -1, z: 0 }, d: c.y - b.min.y },
    { n: { x: 0, y: 1, z: 0 }, d: b.max.y - c.y },
    { n: { x: 0, y: 0, z: -1 }, d: c.z - b.min.z },
    { n: { x: 0, y: 0, z: 1 }, d: b.max.z - c.z },
  ];
  let best = faces[0]!;
  for (const f of faces) if (f.d < best.d) best = f;
  return { normal: best.n, depth: best.d + r, box: b };
}
