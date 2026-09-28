// District scenarios run headless against the real Blender district colliders.

import { describe, expect, test } from 'vitest';
import { runScenario } from '../../src/sim/scenario';
import { DT } from '../../src/sim/sim';
import { districtScenarios, lineRun, LINE_RUN_LIMIT_S } from '../../scenarios/district';
import { loadDistrict } from './district-helper';

describe('district', () => {
  test(`line-run: an 8+ hook route down the avenue finishes within ${LINE_RUN_LIMIT_S} s`, () => {
    const { frames } = runScenario(lineRun, loadDistrict());
    const end = frames.findIndex((f) => f.pos[2] < -380);
    expect(end).toBeGreaterThan(0);
    const t = frames[end]!.tick * DT;
    const attaches = frames.slice(0, end + 1).flatMap((f) => f.events.filter((e) => e.type === 'hookAttached'));
    expect(attaches.length).toBeGreaterThanOrEqual(8);
    for (const a of attaches) expect((a as { box: string }).box).toMatch(/^b_/);
    expect(t).toBeLessThanOrEqual(LINE_RUN_LIMIT_S);
  });

  test.each(districtScenarios.map((s) => [s.name, s] as const))('%s: two runs are bit-identical', (_n, s) => {
    const d = loadDistrict();
    expect(JSON.stringify(runScenario(s, d).frames)).toBe(JSON.stringify(runScenario(s, d).frames));
  });
});
