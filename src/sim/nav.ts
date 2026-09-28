// Titan navigation: a 2D occupancy grid built from the static colliders, and A* over it.
// A cell is free only when no building comes within the Titan's footprint radius of any point in
// it, so a Titan whose position stays in free cells never overlaps a building.

import type { World, WorldBox } from './world';

export const NAV_CELL = 4;

export interface NavPoint {
  x: number;
  z: number;
}

const cache = new WeakMap<World, Map<number, NavGrid>>();

/** One grid per world and footprint radius, built on first use. */
export function navFor(world: World, radius: number): NavGrid {
  let byR = cache.get(world);
  if (!byR) cache.set(world, (byR = new Map()));
  let g = byR.get(radius);
  if (!g) byR.set(radius, (g = new NavGrid(world.boxes, radius)));
  return g;
}

export class NavGrid {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly blocked: Uint8Array;
  /** Connected-component label per free cell (0 for blocked), so targets are always reachable. */
  readonly comp: Int32Array;
  private readonly g: Float64Array;
  private readonly from: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private gen = 0;
  // Binary heap of open cells.
  private heapIdx: Int32Array;
  private heapF: Float64Array;
  private heapH: Float64Array;
  private heapN = 0;

  constructor(boxes: WorldBox[], radius: number) {
    const solid = boxes.filter((b) => b.kind !== 'ground' && b.max.y > 0.3);
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const b of solid) {
      minX = Math.min(minX, b.min.x);
      minZ = Math.min(minZ, b.min.z);
      maxX = Math.max(maxX, b.max.x);
      maxZ = Math.max(maxZ, b.max.z);
    }
    if (!Number.isFinite(minX)) {
      minX = minZ = 0;
      maxX = maxZ = 0;
    }
    // Fixture worlds get open margin around their blocks; a walled world is closed by its Wall.
    const walled = solid.some((b) => b.kind === 'wall');
    const margin = walled ? 0 : 150;
    const ground = boxes.find((b) => b.kind === 'ground');
    minX -= margin;
    minZ -= margin;
    maxX += margin;
    maxZ += margin;
    if (ground) {
      minX = Math.max(minX, ground.min.x);
      minZ = Math.max(minZ, ground.min.z);
      maxX = Math.min(maxX, ground.max.x);
      maxZ = Math.min(maxZ, ground.max.z);
    }
    this.x0 = Math.floor(minX / NAV_CELL) * NAV_CELL;
    this.z0 = Math.floor(minZ / NAV_CELL) * NAV_CELL;
    this.nx = Math.max(1, Math.ceil((maxX - this.x0) / NAV_CELL));
    this.nz = Math.max(1, Math.ceil((maxZ - this.z0) / NAV_CELL));
    const n = this.nx * this.nz;
    this.blocked = new Uint8Array(n);
    for (const b of solid) {
      const ix0 = Math.max(0, Math.floor((b.min.x - radius - this.x0) / NAV_CELL));
      const ix1 = Math.min(this.nx - 1, Math.ceil((b.max.x + radius - this.x0) / NAV_CELL) - 1);
      const iz0 = Math.max(0, Math.floor((b.min.z - radius - this.z0) / NAV_CELL));
      const iz1 = Math.min(this.nz - 1, Math.ceil((b.max.z + radius - this.z0) / NAV_CELL) - 1);
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) this.blocked[iz * this.nx + ix] = 1;
    }
    // The outermost ring is never walkable, so nothing can leave the grid.
    for (let ix = 0; ix < this.nx; ix++) {
      this.blocked[ix] = 1;
      this.blocked[(this.nz - 1) * this.nx + ix] = 1;
    }
    for (let iz = 0; iz < this.nz; iz++) {
      this.blocked[iz * this.nx] = 1;
      this.blocked[iz * this.nx + this.nx - 1] = 1;
    }
    this.comp = new Int32Array(n);
    let label = 0;
    const stack: number[] = [];
    for (let i = 0; i < n; i++) {
      if (this.blocked[i] || this.comp[i]) continue;
      label++;
      this.comp[i] = label;
      stack.push(i);
      while (stack.length > 0) {
        const c = stack.pop()!;
        const cx = c % this.nx;
        const cz = (c - cx) / this.nx;
        const nb = [cx > 0 ? c - 1 : -1, cx < this.nx - 1 ? c + 1 : -1, cz > 0 ? c - this.nx : -1, cz < this.nz - 1 ? c + this.nx : -1];
        for (const k of nb) {
          if (k < 0 || this.blocked[k] || this.comp[k]) continue;
          this.comp[k] = label;
          stack.push(k);
        }
      }
    }
    this.g = new Float64Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heapIdx = new Int32Array(1024);
    this.heapF = new Float64Array(1024);
    this.heapH = new Float64Array(1024);
  }

  cellX(x: number): number {
    return Math.floor((x - this.x0) / NAV_CELL);
  }

  cellZ(z: number): number {
    return Math.floor((z - this.z0) / NAV_CELL);
  }

  freeCell(ix: number, iz: number): boolean {
    return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz && this.blocked[iz * this.nx + ix] === 0;
  }

  /** True when the point lies in a walkable cell. */
  free(x: number, z: number): boolean {
    return this.freeCell(this.cellX(x), this.cellZ(z));
  }

  /** Component label of the cell under a point (0 when blocked). */
  compAt(x: number, z: number): number {
    const ix = this.cellX(x);
    const iz = this.cellZ(z);
    return this.freeCell(ix, iz) ? this.comp[iz * this.nx + ix]! : 0;
  }

  center(idx: number): NavPoint {
    const ix = idx % this.nx;
    const iz = (idx - ix) / this.nx;
    return { x: this.x0 + (ix + 0.5) * NAV_CELL, z: this.z0 + (iz + 0.5) * NAV_CELL };
  }

  /** The nearest walkable cell to a point, searching outward ring by ring (deterministic order). */
  nearestFree(x: number, z: number, maxRings = 40, comp = 0): number {
    const cx = this.cellX(x);
    const cz = this.cellZ(z);
    const ok = (ix: number, iz: number): boolean => this.freeCell(ix, iz) && (comp === 0 || this.comp[iz * this.nx + ix] === comp);
    if (ok(cx, cz)) return cz * this.nx + cx;
    for (let r = 1; r <= maxRings; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const ix = cx + dx;
          const iz = cz + dz;
          if (!ok(ix, iz)) continue;
          const c = this.center(iz * this.nx + ix);
          const d = (c.x - x) ** 2 + (c.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = iz * this.nx + ix;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** True when every point of the segment lies in walkable cells (sampled finely). */
  lineFree(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / 0.25));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.free(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /**
   * A* from a point to a point over free cells (8-connected, no corner cutting), simplified to
   * straight walkable legs. Returns the waypoints after the start, or null when unreachable.
   */
  findPath(sx: number, sz: number, tx: number, tz: number, maxExpand = 40000): NavPoint[] | null {
    const start = this.nearestFree(sx, sz, 3);
    if (start < 0) return null;
    const goal = this.nearestFree(tx, tz, 40, this.comp[start]!);
    if (start < 0 || goal < 0) return null;
    const nx = this.nx;
    const gc = this.center(goal);
    this.gen++;
    if (this.gen === 0xffffffff) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.gen = 1;
    }
    const gen = this.gen;
    const heur = (i: number): number => {
      const c = this.center(i);
      return Math.hypot(c.x - gc.x, c.z - gc.z);
    };
    this.heapN = 0;
    this.g[start] = 0;
    this.from[start] = -1;
    this.seen[start] = gen;
    const h0 = heur(start);
    this.push(start, h0, h0);
    let found = false;
    let expanded = 0;
    while (this.heapN > 0) {
      const cur = this.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expanded > maxExpand) break;
      const cx = cur % nx;
      const cz = (cur - cx) / nx;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const ix = cx + dx;
          const iz = cz + dz;
          if (!this.freeCell(ix, iz)) continue;
          if (dx !== 0 && dz !== 0 && (!this.freeCell(cx + dx, cz) || !this.freeCell(cx, cz + dz))) continue;
          const ni = iz * nx + ix;
          if (this.closed[ni] === gen) continue;
          const ng = this.g[cur]! + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) * NAV_CELL;
          if (this.seen[ni] === gen && ng >= this.g[ni]!) continue;
          this.seen[ni] = gen;
          this.g[ni] = ng;
          this.from[ni] = cur;
          const hh = heur(ni);
          this.push(ni, ng + hh, hh);
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = this.from[c]!) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.center(c));
    // String-pull: from each point, jump to the farthest later point in a straight walkable line.
    const out: NavPoint[] = [];
    let from: NavPoint = { x: sx, z: sz };
    if (!this.free(sx, sz)) from = pts[0]!;
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineFree(from.x, from.z, pts[j]!.x, pts[j]!.z)) j--;
      out.push(pts[j]!);
      from = pts[j]!;
      i = j;
    }
    if (out.length === 0) out.push(pts[pts.length - 1]!);
    return out;
  }

  private push(idx: number, f: number, h: number): void {
    if (this.heapN >= this.heapIdx.length) {
      const grow = (a: Int32Array | Float64Array): Int32Array | Float64Array => {
        const b = new (a.constructor as Int32ArrayConstructor | Float64ArrayConstructor)(a.length * 2);
        b.set(a);
        return b;
      };
      this.heapIdx = grow(this.heapIdx) as Int32Array;
      this.heapF = grow(this.heapF) as Float64Array;
      this.heapH = grow(this.heapH) as Float64Array;
    }
    let k = this.heapN++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!this.less(f, h, idx, this.heapF[p]!, this.heapH[p]!, this.heapIdx[p]!)) break;
      this.heapIdx[k] = this.heapIdx[p]!;
      this.heapF[k] = this.heapF[p]!;
      this.heapH[k] = this.heapH[p]!;
      k = p;
    }
    this.heapIdx[k] = idx;
    this.heapF[k] = f;
    this.heapH[k] = h;
  }

  private pop(): number {
    const top = this.heapIdx[0]!;
    const n = --this.heapN;
    const idx = this.heapIdx[n]!;
    const f = this.heapF[n]!;
    const h = this.heapH[n]!;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      if (l >= n) break;
      const r = l + 1;
      const c = r < n && this.less(this.heapF[r]!, this.heapH[r]!, this.heapIdx[r]!, this.heapF[l]!, this.heapH[l]!, this.heapIdx[l]!) ? r : l;
      if (!this.less(this.heapF[c]!, this.heapH[c]!, this.heapIdx[c]!, f, h, idx)) break;
      this.heapIdx[k] = this.heapIdx[c]!;
      this.heapF[k] = this.heapF[c]!;
      this.heapH[k] = this.heapH[c]!;
      k = c;
    }
    this.heapIdx[k] = idx;
    this.heapF[k] = f;
    this.heapH[k] = h;
    return top;
  }

  /** Deterministic ordering: lower f, then lower h, then lower cell index. */
  private less(f1: number, h1: number, i1: number, f2: number, h2: number, i2: number): boolean {
    if (f1 !== f2) return f1 < f2;
    if (h1 !== h2) return h1 < h2;
    return i1 < i2;
  }

  /** A seeded reachable wander target within radius of a point (returns a cell centre), or null. */
  randomFreeNear(x: number, z: number, radius: number, rnd: () => number, comp = 0, tries = 24): NavPoint | null {
    for (let k = 0; k < tries; k++) {
      const a = rnd() * Math.PI * 2;
      const r = radius * (0.35 + 0.65 * rnd());
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (!this.free(px, pz)) continue;
      const idx = this.cellZ(pz) * this.nx + this.cellX(px);
      if (comp !== 0 && this.comp[idx] !== comp) continue;
      return this.center(idx);
    }
    return null;
  }
}
