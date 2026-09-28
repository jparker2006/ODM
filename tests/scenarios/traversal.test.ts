// Headless scenario suite: every ODM behavior from docs/GOAL.md section 2, checked through telemetry only.

import { describe, expect, test } from 'vitest';
import { runScenario, type Scenario } from '../../src/sim/scenario';
import { DT, type TelemetryFrame } from '../../src/sim/sim';
import { defaultTuning } from '../../src/sim/tuning';
import * as S from '../../scenarios/fixtures';

const T = defaultTuning();
const run = (s: Scenario) => runScenario(s, null).frames;
const events = (frames: TelemetryFrame[], type: string) =>
  frames.flatMap((f) => f.events.filter((e) => e.type === type).map((e) => ({ tick: f.tick, e })));
const dist3 = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('hooks', () => {
  test('hook-attach: attaches after distance / hook speed, within one tick', () => {
    const f = run(S.hookAttach);
    const fired = events(f, 'hookFired')[0]!;
    const attached = events(f, 'hookAttached')[0]!;
    expect(fired && attached).toBeTruthy();
    const e = fired.e as { distance: number; miss: boolean };
    expect(e.miss).toBe(false);
    const expected = e.distance / T.hookSpeed;
    const actual = (attached.tick - fired.tick) * DT;
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(DT + 1e-9);
    const anchor = (attached.e as { anchor: { z: number } }).anchor;
    expect(anchor.z).toBeCloseTo(-40, 3);
  });

  test('hook-miss: sky and out-of-range hooks retract and never attach', () => {
    const f = run(S.hookMiss);
    expect(events(f, 'hookAttached')).toHaveLength(0);
    expect(events(f, 'hookMissed').map((x) => (x.e as { side: string }).side)).toEqual(['L', 'R']);
    expect(events(f, 'hookStowed')).toHaveLength(2);
    expect(f.at(-1)!.hooks.every((h) => h.state === 'stowed')).toBe(true);
  });

  test('aim-assist: just past an edge (inside the cone) snaps to the building', () => {
    const f = run(S.aimAssistInside);
    const fired = events(f, 'hookFired')[0]!.e as { assisted: boolean };
    expect(fired.assisted).toBe(true);
    const attached = events(f, 'hookAttached');
    expect(attached).toHaveLength(1);
    expect((attached[0]!.e as { box: string }).box).toBe('block');
  });

  test('aim-assist: outside the cone does not snap', () => {
    const f = run(S.aimAssistOutside);
    expect(events(f, 'hookAttached')).toHaveLength(0);
    expect(events(f, 'hookMissed')).toHaveLength(1);
  });
});

describe('swinging', () => {
  test('swing-momentum: 20 m/s in, 20 m/s or more out of the bottom, never stops dead', () => {
    const f = run(S.swingMomentum);
    const taut = events(f, 'taut')[0]!;
    expect(taut).toBeTruthy();
    const i = f.findIndex((x) => x.tick === taut.tick);
    const before = f[i - 1]!.speed;
    const after = f[i]!.speed;
    expect(after).toBeGreaterThanOrEqual(before * 0.98);
    const swinging = f.slice(i).filter((x) => x.hooks[0]!.taut);
    const bottom = swinging.reduce((lo, x) => (x.pos[1] < lo.pos[1] ? x : lo));
    expect(bottom.speed).toBeGreaterThanOrEqual(20);
    expect(Math.min(...swinging.map((x) => x.speed))).toBeGreaterThan(3);
  });

  test('release-gain: letting go on the rising arc reaches a higher apex than holding on', () => {
    const apexAfterBottom = (f: TelemetryFrame[]) => {
      const lowest = f.reduce((lo, x, k) => (x.pos[1] < f[lo]!.pos[1] ? k : lo), 0);
      return Math.max(...f.slice(lowest).map((x) => x.pos[1]));
    };
    const hold = apexAfterBottom(run(S.releaseHold));
    const rising = run(S.releaseRising);
    expect(events(rising, 'hookReleased')).toHaveLength(1);
    expect(apexAfterBottom(rising)).toBeGreaterThan(hold);
  });

  test('double-hook: two anchors pull toward a point between them, and the player threads the gap', () => {
    const f = run(S.doubleHook);
    const both = f.filter((x) => x.hooks.every((h) => h.state === 'attached'));
    expect(both.length).toBeGreaterThan(0);
    const mid = [0, 15, -50];
    const d0 = dist3(both[0]!.pos, mid);
    const dMin = Math.min(...both.map((x) => dist3(x.pos, mid)));
    expect(dMin).toBeLessThan(d0 * 0.35);
    // Crossing the line between the buildings (z = -50) happens inside the gap, off the ground.
    const k = f.findIndex((x) => x.pos[2] < -50);
    expect(k).toBeGreaterThan(0);
    expect(Math.abs(f[k]!.pos[0])).toBeLessThan(15);
    expect(f[k]!.pos[1]).toBeGreaterThan(2);
    // And out the other side, never touching either building.
    expect(Math.min(...f.map((x) => x.pos[2]))).toBeLessThan(-60);
    expect(f.slice(0, k + 60).some((x) => x.wallContact)).toBe(false);
  });

  test('reel: holding reel shortens the cable, lifts toward the anchor and spends gas', () => {
    const f = run(S.reel);
    const reeling = f.filter((x) => x.t >= 1.05 && x.t <= 1.6);
    for (let i = 1; i < reeling.length; i++) expect(reeling[i]!.hooks[0]!.rest).toBeLessThan(reeling[i - 1]!.hooks[0]!.rest);
    expect(reeling.at(-1)!.pos[1]).toBeGreaterThan(reeling[0]!.pos[1] + 3);
    expect(reeling.at(-1)!.gas).toBeLessThan(reeling[0]!.gas);
    expect(dist3(f.at(-1)!.pos, [0, 30, -30])).toBeLessThan(5);
  });
});

describe('gas', () => {
  test('gas-empty: thrust stops at exactly zero gas, and reel does nothing without gas', () => {
    const f = run(S.gasEmpty);
    expect(Math.min(...f.map((x) => x.gas))).toBe(0);
    expect(f.every((x) => x.gas >= 0)).toBe(true);
    const empty = events(f, 'gasEmpty')[0]!;
    expect(empty).toBeTruthy();
    const after = f.filter((x) => x.tick > empty.tick);
    expect(after.every((x) => !x.thrusting && x.gas === 0)).toBe(true);
    // Thrust was on right up to the tick the gas ran out.
    expect(f.find((x) => x.tick === empty.tick - 2)!.thrusting).toBe(true);
    // Reeling with no gas changes nothing: identical motion to the same run without the reel input.
    const noReel = run({ ...S.gasEmpty, timeline: S.gasEmpty.timeline.filter((k) => k.set?.reel === undefined) });
    const motion = (x: TelemetryFrame) => JSON.stringify([x.pos, x.vel, x.hooks[0]!.rest, x.gas]);
    expect(f.map(motion)).toEqual(noReel.map(motion));
    expect(f.some((x) => x.t > 4.25 && x.hooks[0]!.state === 'attached')).toBe(true);
  });

  test('gas-infinite: with the toggle on, gas never drops and thrust never stops', () => {
    const f = run(S.gasInfinite);
    expect(f.every((x) => x.gas === 3)).toBe(true);
    const boosting = f.filter((x) => x.t > 0.42 && x.t < 3.99);
    expect(boosting.every((x) => x.thrusting)).toBe(true);
    expect(events(f, 'gasEmpty')).toHaveLength(0);
  });
});

describe('collision', () => {
  test.each(S.noTunnel.map((s) => [s.name, s] as const))('%s: never passes through a 0.3 m wall at the speed cap', (_n, s) => {
    const f = run(s);
    expect(Math.max(...f.map((x) => x.speed))).toBeLessThanOrEqual(T.hardCap + 1e-6);
    expect(Math.min(...f.map((x) => x.pos[2]))).toBeGreaterThan(-29.85);
  });

  test('ground-clearance: a street swing between 12 m buildings never touches the ground', () => {
    const f = run(S.groundClearance);
    expect(events(f, 'hookAttached')).toHaveLength(1);
    expect(f.some((x) => x.touchedGround)).toBe(false);
    // Control: without the assist, the same swing hits the street.
    expect(run(S.groundClearanceOff).some((x) => x.touchedGround)).toBe(true);
  });

  test('wall-stick: sticks on impact, then push-off leaves the wall', () => {
    const f = run(S.wallStick);
    const stick = events(f, 'wallStick')[0]!;
    expect(stick).toBeTruthy();
    expect(f.find((x) => x.tick === stick.tick)!.mode).toBe('wall');
    const push = events(f, 'pushOff')[0]!;
    expect(push).toBeTruthy();
    const i = f.findIndex((x) => x.tick === push.tick);
    expect(f[i + 36]!.pos[2]).toBeGreaterThan(f[i]!.pos[2] + 2);
    expect(f[i + 36]!.mode).not.toBe('wall');
  });

  test('landing: a 20 m drop onto a roof stumbles, then control returns within 1.5 s', () => {
    const f = run(S.landing);
    const land = events(f, 'landed')[0]!;
    expect((land.e as { result: string }).result).toBe('stumble');
    const back = f.findIndex((x) => x.tick > land.tick && x.mode === 'ground');
    expect((f[back]!.tick - land.tick) * DT).toBeLessThanOrEqual(1.5);
    // Input works again: running forward from 2.4 s moves Levi.
    expect(f.at(-1)!.speed).toBeGreaterThan(5);
    expect(f.every((x) => Number.isFinite(x.pos[1]))).toBe(true);
  });

  test('landing: a fast 20 m drop rolls, then control returns within 1.5 s', () => {
    const f = run(S.landingRoll);
    const land = events(f, 'landed')[0]!;
    expect((land.e as { result: string }).result).toBe('roll');
    const back = f.findIndex((x) => x.tick > land.tick && x.mode === 'ground');
    expect((f[back]!.tick - land.tick) * DT).toBeLessThanOrEqual(1.5);
  });
});

describe('determinism', () => {
  test.each(S.fixtureScenarios.map((s) => [s.name, s] as const))('%s: two runs are bit-identical', (_n, s) => {
    expect(JSON.stringify(run(s))).toBe(JSON.stringify(run(s)));
  });
});
