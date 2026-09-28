// Contract tests for the Blender-built GLB assets in public/assets.
// Rebuild with `npm run assets` (tools/blender/build-all.sh). When an asset changes on purpose,
// update tests/unit/asset-hashes.json with the printed sha256.
// Determinism (two builds are byte-identical) is checked by tools/blender/check-determinism.sh,
// not here, because Blender is slow.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collidersFromGlb, markersFromGlb, parseGlbJson, type ColliderRecord, type GlbJson } from '../../src/sim/glb';

const ASSETS = fileURLToPath(new URL('../../public/assets/', import.meta.url));
const HASHES = JSON.parse(readFileSync(new URL('./asset-hashes.json', import.meta.url), 'utf8')) as Record<string, string>;

const DISTRICT_TRIANGLE_BUDGET = 200_000;
const DISTRICT_BYTES_BUDGET = 8 * 1024 * 1024;
const MANNEQUIN_TRIANGLE_BUDGET = 5_000;

function load(name: string): { bytes: Uint8Array; json: GlbJson } {
  const bytes = new Uint8Array(readFileSync(ASSETS + name));
  return { bytes, json: parseGlbJson(bytes) };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function triangleCount(json: GlbJson): number {
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if (prim.indices === undefined) throw new Error(`mesh ${mesh.name} has a non-indexed primitive`);
      tris += json.accessors![prim.indices].count / 3;
    }
  }
  return tris;
}

const height = (c: ColliderRecord): number => c.max[1] - c.min[1];

describe('district.glb', () => {
  const path = ASSETS + 'district.glb';

  it('exists', () => {
    expect(existsSync(path)).toBe(true);
  });

  const { bytes, json } = load('district.glb');
  const colliders = collidersFromGlb(json);
  const markers = markersFromGlb(json);
  const byName = new Map(colliders.map((c) => [c.name, c]));

  it('has the recorded hash', () => {
    expect(sha256(bytes)).toBe(HASHES['district.glb']);
  });

  it('is under the triangle and size budgets', () => {
    expect(triangleCount(json)).toBeGreaterThan(0);
    expect(triangleCount(json)).toBeLessThan(DISTRICT_TRIANGLE_BUDGET);
    expect(bytes.byteLength).toBeLessThan(DISTRICT_BYTES_BUDGET);
  });

  it('has colliders with unique names and valid boxes', () => {
    expect(colliders.length).toBeGreaterThan(1000);
    expect(new Set(colliders.map((c) => c.name)).size).toBe(colliders.length);
    for (const c of colliders) {
      for (let i = 0; i < 3; i++) expect(c.max[i]).toBeGreaterThan(c.min[i]);
    }
  });

  it('marks buildings, towers and the Wall anchorable and the ground not', () => {
    const kinds = new Set(colliders.map((c) => c.kind));
    expect([...kinds].sort()).toEqual(['building', 'ground', 'tower', 'wall']);
    for (const c of colliders) {
      if (c.kind === 'ground') expect(c.anchorable).toBe(false);
      else expect(c.anchorable, c.name).toBe(true);
    }
    const ground = colliders.filter((c) => c.kind === 'ground');
    expect(ground).toHaveLength(1);
    expect(ground[0].max[1]).toBe(0);
  });

  it('has at least three towers of 30 to 45 m', () => {
    const towers = colliders.filter((c) => c.kind === 'tower' && height(c) >= 30 && height(c) <= 45);
    expect(towers.length).toBeGreaterThanOrEqual(3);
    expect(byName.get('tower_bell')).toBeDefined();
  });

  it('has the 50 m Wall on all four sides around a 1.5 km interior', () => {
    for (const side of ['wall_n', 'wall_s', 'wall_e', 'wall_w']) {
      const w = byName.get(side);
      expect(w, side).toBeDefined();
      expect(w!.kind).toBe('wall');
      expect(w!.min[1]).toBe(0);
      expect(height(w!)).toBe(50);
    }
    const spanX = byName.get('wall_e')!.min[0] - byName.get('wall_w')!.max[0];
    const spanZ = byName.get('wall_s')!.min[2] - byName.get('wall_n')!.max[2];
    expect(spanX).toBeGreaterThan(1400);
    expect(spanX).toBeLessThan(1600);
    expect(spanZ).toBeGreaterThan(1400);
    expect(spanZ).toBeLessThan(1600);
  });

  it('keeps every building between 8 and 20 m tall and inside the Wall', () => {
    const buildings = colliders.filter((c) => c.kind === 'building');
    expect(buildings.length).toBeGreaterThan(1000);
    for (const b of buildings) {
      expect(b.min[1]).toBe(0);
      expect(height(b)).toBeGreaterThanOrEqual(8);
      expect(height(b)).toBeLessThanOrEqual(20);
      expect(Math.abs(b.min[0])).toBeLessThanOrEqual(750);
      expect(Math.abs(b.max[0])).toBeLessThanOrEqual(750);
      expect(Math.abs(b.min[2])).toBeLessThanOrEqual(750);
      expect(Math.abs(b.max[2])).toBeLessThanOrEqual(750);
    }
  });

  it('has the required markers, with spawn standing on a roof', () => {
    for (const m of ['spawn', 'perf_start', 'perf_end', 'line_start']) {
      expect(markers[m], m).toHaveLength(3);
    }
    const [sx, sy, sz] = markers['spawn'];
    const roof = colliders.find(
      (c) => c.kind === 'building' && sx > c.min[0] && sx < c.max[0] && sz > c.min[2] && sz < c.max[2],
    );
    expect(roof).toBeDefined();
    expect(sy - roof!.max[1]).toBeCloseTo(0.9, 3);
    const yaw = json.nodes?.find((n) => n.name === 'MARKERS')?.extras?.['odm_spawn_yaw'];
    expect(Number.isFinite(Number(yaw))).toBe(true);
  });

  it('lines the test street (x in [-10, 10], z from -40 to -400) with continuous 12 to 20 m houses', () => {
    for (const edge of [-10, 10]) {
      const row = colliders
        .filter((c) => c.kind === 'building' && (edge < 0 ? c.max[0] === edge : c.min[0] === edge))
        .filter((c) => c.max[2] > -400 && c.min[2] < -40)
        .sort((a, b) => a.min[2] - b.min[2]);
      expect(row.length).toBeGreaterThan(10);
      let cursor = -400;
      for (const b of row) {
        expect(b.min[2] - cursor, `gap before ${b.name}`).toBeLessThanOrEqual(10.001);
        expect(height(b)).toBeGreaterThanOrEqual(12);
        expect(height(b)).toBeLessThanOrEqual(20);
        cursor = Math.max(cursor, b.max[2]);
      }
      expect(-40 - cursor).toBeLessThanOrEqual(10.001);
    }
  });
});

describe('mannequin.glb', () => {
  const path = ASSETS + 'mannequin.glb';
  const required = [
    'mq_root', 'mq_pelvis', 'mq_spine', 'mq_head',
    'mq_upperarm_L', 'mq_forearm_L', 'mq_hand_L', 'mq_upperarm_R', 'mq_forearm_R', 'mq_hand_R',
    'mq_thigh_L', 'mq_shin_L', 'mq_foot_L', 'mq_thigh_R', 'mq_shin_R', 'mq_foot_R',
    'mq_launcher_L', 'mq_launcher_R', 'mq_gas_tank',
  ];

  it('exists', () => {
    expect(existsSync(path)).toBe(true);
  });

  const { bytes, json } = load('mannequin.glb');
  const nodes = json.nodes ?? [];

  it('has the recorded hash', () => {
    expect(sha256(bytes)).toBe(HASHES['mannequin.glb']);
  });

  it('has every required node', () => {
    const names = new Set(nodes.map((n) => n.name));
    for (const n of required) expect(names.has(n), n).toBe(true);
  });

  it('is under the triangle budget', () => {
    expect(triangleCount(json)).toBeGreaterThan(0);
    expect(triangleCount(json)).toBeLessThan(MANNEQUIN_TRIANGLE_BUDGET);
  });

  it('stands 1.60 m tall with feet at y = 0, left parts at -x, root at the pelvis', () => {
    // Nodes carry translations only, so world position is the sum down the parent chain.
    const parent = new Map<number, number>();
    nodes.forEach((n, i) => n.children?.forEach((c) => parent.set(c, i)));
    const world = (i: number): number[] => {
      const t = nodes[i].translation ?? [0, 0, 0];
      const p = parent.get(i);
      if (p === undefined) return [...t];
      const pw = world(p);
      return [pw[0] + t[0], pw[1] + t[1], pw[2] + t[2]];
    };
    type Acc = { min?: number[]; max?: number[] };
    let minY = Infinity;
    let maxY = -Infinity;
    nodes.forEach((n, i) => {
      expect((n as { rotation?: number[] }).rotation, n.name).toBeUndefined();
      expect((n as { scale?: number[] }).scale, n.name).toBeUndefined();
      if (n.mesh === undefined) return;
      const w = world(i);
      for (const prim of json.meshes![n.mesh].primitives) {
        const acc = json.accessors![prim.attributes['POSITION']] as Acc;
        minY = Math.min(minY, w[1] + acc.min![1]);
        maxY = Math.max(maxY, w[1] + acc.max![1]);
      }
    });
    expect(minY).toBeCloseTo(0, 2);
    expect(maxY).toBeCloseTo(1.6, 2);
    const idx = (name: string): number => nodes.findIndex((n) => n.name === name);
    expect(world(idx('mq_root'))[1]).toBeCloseTo(0.9, 2);
    for (const part of ['upperarm', 'hand', 'thigh', 'foot', 'launcher']) {
      expect(world(idx(`mq_${part}_L`))[0], part).toBeLessThan(0);
      expect(world(idx(`mq_${part}_R`))[0], part).toBeGreaterThan(0);
    }
  });
});
