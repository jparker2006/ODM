// Milestone 2 headless suite: every Titan rule from docs/GOAL.md section 2, asserted through
// telemetry and events only.

import { describe, expect, test } from 'vitest';
import { runScenario, type Scenario } from '../../src/sim/scenario';
import { DT, type TelemetryFrame, type SimEvent } from '../../src/sim/sim';
import { defaultTuning } from '../../src/sim/tuning';
import { World } from '../../src/sim/world';
import { titanPose, partToWorld, FOOTPRINT } from '../../src/sim/titan-body';
import { lookDir, v3 } from '../../src/sim/vec';
import * as S from '../../scenarios/titans';
import { loadDistrict } from './district-helper';

const T = defaultTuning();
const run = (s: Scenario) => runScenario(s, null).frames;
type Hit = { tick: number; t: number; e: SimEvent };
const events = (frames: TelemetryFrame[], type: string): Hit[] =>
  frames.flatMap((f) => f.events.filter((e) => e.type === type).map((e) => ({ tick: f.tick, t: f.t, e })));
const first = (frames: TelemetryFrame[], type: string): Hit | undefined => events(frames, type)[0];
const flat = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
const dist3 = (a: { x: number; y: number; z: number }, b: number[]) => Math.hypot(a.x - b[0]!, a.y - b[1]!, a.z - b[2]!);
const titanXZ = (f: TelemetryFrame): number[] => [f.titan!.pose.x, 0, f.titan!.pose.z];
const grip = (f: TelemetryFrame) => {
  const p = titanPose(f.titan!.pose);
  return f.titan!.pose.arm === 'L' ? p.gripL : p.gripR;
};

describe('titan brain', () => {
  test('titan-wander: 120 s in the district, never inside a building, inside the Wall, covers 150 m', () => {
    const d = loadDistrict();
    const frames = runScenario(S.titanWander, d).frames;
    const world = new World(d.boxes);
    let travelled = 0;
    let prev: number[] | null = null;
    for (const f of frames) {
      expect(f.titan, `titan at ${f.t}`).not.toBeNull();
      const [x, , z] = titanXZ(f);
      const r = FOOTPRINT * f.titan!.pose.h;
      expect(Math.abs(x!) + r).toBeLessThan(750);
      expect(Math.abs(z!) + r).toBeLessThan(750);
      world.forEachNear(x! - r, z! - r, x! + r, z! + r, (b) => {
        if (b.kind === 'ground') return;
        const dx = Math.max(b.min.x - x!, 0, x! - b.max.x);
        const dz = Math.max(b.min.z - z!, 0, z! - b.max.z);
        expect(Math.hypot(dx, dz), `${b.name} at t=${f.t.toFixed(2)}`).toBeGreaterThan(r);
      });
      if (prev) travelled += flat(prev, [x!, 0, z!]);
      prev = [x!, 0, z!];
    }
    expect(travelled).toBeGreaterThanOrEqual(150);
    expect(frames.every((f) => f.titan!.brain === 'wander')).toBe(true);
  });

  test('titan-notice-sight: a player in view and in range is noticed within 1 s', () => {
    const f = run(S.titanNoticeSight);
    const n = first(f, 'titanNotice');
    expect(n).toBeDefined();
    expect((n!.e as { cause: string }).cause).toBe('sight');
    expect(n!.t).toBeLessThanOrEqual(1);
  });

  test('titan-hidden: a player behind a building is never noticed over 10 s', () => {
    const f = run(S.titanHidden);
    expect(f.at(-1)!.t).toBeGreaterThanOrEqual(10 - DT);
    expect(events(f, 'titanNotice')).toHaveLength(0);
    expect(f.every((x) => x.titan!.brain === 'wander' && !x.titan!.sees)).toBe(true);
  });

  test('titan-noise: a gas burst within noise range behind the building is noticed', () => {
    const f = run(S.titanNoise);
    const burst = first(f, 'boostBurst')!;
    const n = first(f, 'titanNotice')!;
    expect(burst && n).toBeTruthy();
    expect((n.e as { cause: string }).cause).toBe('noise');
    expect(n.tick).toBeGreaterThan(burst.tick);
    expect(n.t - burst.t).toBeLessThanOrEqual(0.1);
    // The player really was out of sight and within the noise range.
    const at = f.find((x) => x.tick === burst.tick)!;
    const eye = titanPose(at.titan!.pose).eye;
    expect(dist3(eye, at.pos)).toBeLessThanOrEqual(T.noiseRange);
    expect(f.filter((x) => x.tick <= n.tick).every((x) => !x.titan!.sees)).toBe(true);
  });

  test('titan-chase: once noticed, the distance to the player on the ground shrinks', () => {
    const f = run(S.titanChase);
    const n = first(f, 'titanNotice')!;
    const start = f.find((x) => x.tick === n.tick)!;
    const d0 = flat(titanXZ(start), start.pos);
    const d1 = flat(titanXZ(f.at(-1)!), f.at(-1)!.pos);
    expect(f.at(-1)!.grounded).toBe(true);
    expect(d1).toBeLessThan(d0 - 30);
    expect(f.some((x) => x.titan!.brain === 'chase')).toBe(true);
  });

  test('titan-lose-interest: after the lose-interest time out of sight, the Titan returns to wander', () => {
    const f = run(S.titanLoseInterest);
    const lost = first(f, 'titanLostInterest')!;
    expect(lost).toBeDefined();
    const lastSeen = f.filter((x) => x.tick < lost.tick && x.titan!.sees).at(-1)!;
    expect(lastSeen).toBeDefined();
    expect(Math.abs(lost.t - lastSeen.t - T.loseInterest)).toBeLessThanOrEqual(2 * DT);
    expect(f.find((x) => x.tick === lost.tick)!.titan!.brain).toBe('wander');
    expect(f.filter((x) => x.tick > lost.tick).every((x) => x.titan!.brain === 'wander')).toBe(true);
  });
});

describe('grabs', () => {
  test('titan-grab: a player hovering in reach is grabbed after the wind-up, never before', () => {
    const f = run(S.titanGrab);
    const wind = first(f, 'titanWindup')!;
    const grab = first(f, 'grabbed')!;
    expect(wind && grab).toBeTruthy();
    expect(f.filter((x) => x.tick < grab.tick).every((x) => !x.grabbed)).toBe(true);
    expect(Math.abs((grab.tick - wind.tick) * DT - T.grabWindup)).toBeLessThanOrEqual(DT + 1e-9);
    // Hovering: barely moving when the wind-up started.
    expect(f.find((x) => x.tick === wind.tick)!.speed).toBeLessThan(1);
    expect(f.find((x) => x.tick === grab.tick)!.mode).toBe('grabbed');
  });

  test('titan-dodge: boosting away during the wind-up is never grabbed', () => {
    const f = run(S.titanDodge);
    const wind = first(f, 'titanWindup')!;
    expect(wind).toBeDefined();
    expect(events(f, 'boostBurst').some((b) => b.tick > wind.tick && b.t - wind.t < T.grabWindup)).toBe(true);
    expect(events(f, 'grabbed')).toHaveLength(0);
    expect(f.every((x) => !x.grabbed)).toBe(true);
  });

  test('grab-escape: mashing Space frees the player before the max hold, the throw clears 5 m in 1 s, and the grace holds', () => {
    const f = run(S.grabEscape);
    const grab = first(f, 'grabbed')!;
    const esc = first(f, 'grabEscape')!;
    const thrown = first(f, 'thrown')!;
    expect(grab && esc && thrown).toBeTruthy();
    expect(esc.t - grab.t).toBeLessThan(T.maxHold);
    expect(events(f, 'grabRelease')).toHaveLength(0);
    expect(thrown.tick).toBe(esc.tick);
    const within = f.filter((x) => x.tick > thrown.tick && x.t - thrown.t <= 1);
    expect(Math.max(...within.map((x) => dist3(grip(x), x.pos)))).toBeGreaterThanOrEqual(5);
    // Re-grab grace.
    expect(events(f, 'grabbed').filter((g) => g.tick > esc.tick && g.t - esc.t < T.regrabGrace)).toHaveLength(0);
    expect(f.find((x) => x.tick === esc.tick)!.grace).toBeCloseTo(T.regrabGrace, 6);
    expect(f.at(-1)!.grabbed).toBe(false);
  });

  test('grab-timeout: not mashing releases at max hold with exactly the gas penalty, and the run continues', () => {
    const f = run(S.grabTimeout);
    const grab = first(f, 'grabbed')!;
    const rel = first(f, 'grabRelease')!;
    expect(grab && rel).toBeTruthy();
    expect(events(f, 'grabEscape')).toHaveLength(0);
    expect(Math.abs((rel.tick - grab.tick) * DT - T.maxHold)).toBeLessThanOrEqual(DT + 1e-9);
    const penalty = T.escapePenalty * T.gasCapacity;
    expect((rel.e as { gasLost: number }).gasLost).toBeCloseTo(penalty, 9);
    const before = f.find((x) => x.tick === rel.tick - 1)!.gas;
    const after = f.find((x) => x.tick === rel.tick)!.gas;
    expect(before - after).toBeCloseTo(penalty, 9);
    expect(first(f, 'thrown')!.tick).toBe(rel.tick);
    const end = f.at(-1)!;
    expect(end.grabbed).toBe(false);
    expect(end.mode).not.toBe('grabbed');
    expect(end.pos.every(Number.isFinite)).toBe(true);
    expect(events(f, 'grabbed').filter((g) => g.tick > rel.tick && g.t - rel.t < T.regrabGrace)).toHaveLength(0);
  });
});

describe('hooks on a Titan', () => {
  test('hook-titan: a hook in a walking Titan tracks its body part within 0.05 m for 3 s', () => {
    const f = run(S.hookTitan);
    const att = first(f, 'hookAttached')!;
    expect(att).toBeDefined();
    expect((att.e as { box: string }).box).toMatch(/^ti_/);
    const ride = f.filter((x) => x.tick >= att.tick && x.t - att.t <= 3);
    expect(ride.at(-1)!.t - att.t).toBeGreaterThanOrEqual(3 - DT);
    let worst = 0;
    for (const x of ride) {
      const h = x.hooks[0]!;
      expect(h.state).toBe('attached');
      expect(h.part).toBeGreaterThanOrEqual(0);
      const pose = titanPose(x.titan!.pose);
      const want = partToWorld(pose, h.part, v3(...h.local!), x.titan!.pose.h);
      worst = Math.max(worst, dist3(want, h.anchor!));
    }
    expect(worst).toBeLessThanOrEqual(0.05);
    // The Titan really walked while the hook rode on it.
    expect(flat(titanXZ(ride[0]!), titanXZ(ride.at(-1)!))).toBeGreaterThan(5);
  });
});

describe('cuts', () => {
  test('nape-kill: a fast cut through the nape kills; the Titan collapses, and a new one appears far away out of view', () => {
    const f = run(S.napeKill);
    const kill = first(f, 'napeKill')!;
    expect(kill).toBeDefined();
    expect((kill.e as { speed: number }).speed).toBeGreaterThanOrEqual(T.napeKillSpeed);
    expect(first(f, 'titanCollapse')!.tick).toBe(kill.tick);
    expect(f.at(-1)!.kills).toBe(1);
    const collapse = f.filter((x) => x.tick >= kill.tick && x.titan?.id === 1);
    expect(collapse[0]!.titan!.brain).toBe('collapse');
    const dead = collapse.find((x) => x.titan!.brain === 'dead')!;
    expect(dead).toBeDefined();
    expect(dead.t - kill.t).toBeCloseTo(T.collapseTime, 1);
    expect(collapse.every((x) => !x.titan!.alive)).toBe(true);
    // Respawn: after the delay, at a spawn point 150 m or more away and out of view.
    const spawn = first(f, 'titanSpawn')!;
    expect(spawn).toBeDefined();
    expect(Math.abs(spawn.t - kill.t - T.respawnDelay)).toBeLessThanOrEqual(DT + 1e-9);
    const at = f.find((x) => x.tick === spawn.tick)!;
    const p = (spawn.e as { pos: { x: number; z: number } }).pos;
    expect(Math.hypot(p.x - at.pos[0], p.z - at.pos[2])).toBeGreaterThanOrEqual(150);
    const look = lookDir(at.look[0], at.look[1]);
    const to = v3(p.x - at.pos[0], 0, p.z - at.pos[2]);
    const cos = (look.x * to.x + look.z * to.z) / Math.hypot(to.x, to.z);
    expect(cos).toBeLessThan(Math.cos((60 * Math.PI) / 180));
    expect(at.titan!.id).toBe(2);
    expect(at.titan!.alive).toBe(true);
  });

  test('nape-slow: the same approach below the kill speed only makes the Titan flinch', () => {
    const f = run(S.napeSlow);
    const hit = first(f, 'slashHit')!;
    expect(hit).toBeDefined();
    const e = hit.e as { part: string; speed: number; kill: boolean };
    expect(e.part).toBe('nape');
    expect(e.speed).toBeLessThan(T.napeKillSpeed);
    expect(e.kill).toBe(false);
    expect(events(f, 'napeKill')).toHaveLength(0);
    expect(first(f, 'flinch')!.tick).toBe(hit.tick);
    expect(f.every((x) => x.titan!.alive)).toBe(true);
  });

  test('body-slash: a fast cut on an arm or leg only makes the Titan flinch', () => {
    const f = run(S.bodySlash);
    const hit = first(f, 'slashHit')!;
    expect(hit).toBeDefined();
    const e = hit.e as { part: string; speed: number };
    expect(e.part).toMatch(/^ti_(upperarm|forearm|hand|thigh|shin)_/);
    expect(e.speed).toBeGreaterThanOrEqual(T.napeKillSpeed);
    expect(events(f, 'napeKill')).toHaveLength(0);
    expect(first(f, 'flinch')).toBeDefined();
    expect(f.some((x) => x.titan!.brain === 'flinch')).toBe(true);
    expect(f.every((x) => x.titan!.alive)).toBe(true);
    expect(f.at(-1)!.blades).toBeCloseTo(1 - T.bladeWear, 9);
  });

  test('dull-blades: with blades at zero, a fast nape cut does not kill', () => {
    const f = run(S.dullBlades);
    expect(f[0]!.blades).toBe(0);
    const hit = first(f, 'slashHit')!;
    const e = hit.e as { part: string; speed: number; kill: boolean };
    expect(e.part).toBe('nape');
    expect(e.speed).toBeGreaterThanOrEqual(T.napeKillSpeed);
    expect(e.kill).toBe(false);
    expect(events(f, 'napeKill')).toHaveLength(0);
    expect(f.every((x) => x.titan!.alive)).toBe(true);
  });
});

describe('supply', () => {
  test('supply: standing on a crate with low gas and blades refills both to full within the refill time', () => {
    const f = run(S.supply);
    const start = first(f, 'supplyStart')!;
    const done = first(f, 'supplyDone')!;
    expect(start && done).toBeTruthy();
    expect(f[0]!.gas).toBeLessThan(T.gasCapacity / 2);
    expect(f[0]!.blades).toBeLessThan(0.5);
    expect(done.t - start.t).toBeLessThanOrEqual(T.supplyRefill + DT);
    const end = f.find((x) => x.tick === done.tick)!;
    expect(end.gas).toBe(T.gasCapacity);
    expect(end.blades).toBe(1);
  });

  test('supply: leaving early stops the refill', () => {
    const f = run(S.supplyLeave);
    const start = first(f, 'supplyStart')!;
    expect(start).toBeDefined();
    expect(events(f, 'supplyDone')).toHaveLength(0);
    const off = f.findIndex((x) => x.tick > start.tick && !x.supplying);
    expect(off).toBeGreaterThan(0);
    const after = f.slice(off);
    expect(after.every((x) => !x.supplying)).toBe(true);
    expect(after.at(-1)!.gas).toBe(after[0]!.gas);
    expect(after.at(-1)!.blades).toBe(after[0]!.blades);
    expect(after.at(-1)!.gas).toBeLessThan(T.gasCapacity);
    expect(after.at(-1)!.blades).toBeLessThan(1);
  });
});

describe('determinism', () => {
  test.each(S.titanScenarios.map((s) => [s.name, s] as const))('%s: two runs are bit-identical', (_n, s) => {
    expect(JSON.stringify(run(s))).toBe(JSON.stringify(run(s)));
  });

  test('titan-wander: two runs are bit-identical', () => {
    const d = loadDistrict();
    expect(JSON.stringify(runScenario(S.titanWander, d).frames)).toBe(JSON.stringify(runScenario(S.titanWander, d).frames));
  });
});
