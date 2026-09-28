// District scenarios: the real Blender district. Used by the headless suite (line-run), and by the
// browser runner (smoke, perf, replays).

import type { Scenario, Policy } from '../src/sim/scenario';
import { aimAtPoint } from '../src/sim/scenario';
import type { Sim, Intent } from '../src/sim/sim';
import { v3, len, sub, type Vec3 } from '../src/sim/vec';

export const smoke: Scenario = {
  name: 'smoke',
  description: 'Boot at the spawn rooftop, look down the avenue, idle.',
  world: 'district',
  spawn: 'district',
  duration: 2,
  timeline: [{ t: 0, aim: { yaw: 0, pitch: -0.12 } }],
  browser: { shots: [1.5] },
};

/**
 * Swings down the avenue test street (x in [-10, 10], z from -40 to -400), alternating sides.
 * Each hook aims 22 m ahead at the facade; if that spot is a cross-street gap, it looks further on.
 */
function avenueSwinger(opts: { endZ: number; heightBias: number }): () => Policy {
  return () => {
    let side: 'L' | 'R' = 'L';
    let phase: 'fire' | 'flying' | 'swing' | 'coast' = 'fire';
    let anchorZ = 0;
    let coastUntil = 0;
    let hooks = 0;
    let done = false;
    let target: Vec3 | null = null;
    const hold = { hookL: false, hookR: false };
    return (sim: Sim, t: number): Partial<Intent> | null => {
      if (done || sim.pos.z < opts.endZ) {
        done = true;
        return { hookL: false, hookR: false, boost: false, fwd: false, ...aimAtPoint(sim, v3(0, sim.pos.y, sim.pos.z - 30)) };
      }
      const hook = sim.hooks[side === 'L' ? 0 : 1];
      const out: Partial<Intent> = { fwd: true };
      if (phase === 'fire') {
        // Find a valid facade point ahead on this side.
        const x = side === 'L' ? -10 : 10;
        const y = Math.min(12.5, Math.max(9, sim.pos.y + opts.heightBias));
        target = null;
        for (let dz = 30; dz <= 48; dz += 3) {
          const p = v3(x, y, sim.pos.z - dz);
          const a = aimAtPoint(sim, p);
          const r = sim.aim(a.yaw, a.pitch);
          if (r.valid && r.box && r.box.kind === 'building' && Math.abs(Math.abs(r.point.x) - 10) < 0.5) {
            target = p;
            break;
          }
        }
        if (target) {
          Object.assign(out, aimAtPoint(sim, target));
          hold.hookL = side === 'L';
          hold.hookR = side === 'R';
          phase = 'flying';
          hooks++;
        } else {
          Object.assign(out, aimAtPoint(sim, v3(0, sim.pos.y, sim.pos.z - 30)));
        }
      } else if (phase === 'flying') {
        if (target) Object.assign(out, aimAtPoint(sim, target));
        if (hook.state === 'attached') {
          phase = 'swing';
          anchorZ = hook.anchor!.z;
        } else if (hook.state !== 'flying') {
          hold.hookL = false;
          hold.hookR = false;
          phase = 'fire';
        }
      } else if (phase === 'swing') {
        Object.assign(out, aimAtPoint(sim, v3(0, sim.pos.y + 2, sim.pos.z - 30)));
        // Zip: reel toward the anchor, let go before arriving or as soon as the arc curls toward the facade.
        out.reel = true;
        const nearAnchor = sim.pos.z < anchorZ + 9;
        const curling = Math.abs(sim.pos.x) > 5.5;
        if (nearAnchor || curling) {
          out.reel = false;
          hold.hookL = false;
          hold.hookR = false;
          phase = 'coast';
          coastUntil = t + 0.12;
          side = side === 'L' ? 'R' : 'L';
        }
      } else if (phase === 'coast') {
        Object.assign(out, aimAtPoint(sim, v3(0, sim.pos.y, sim.pos.z - 30)));
        if (t >= coastUntil) phase = 'fire';
      }
      // A little gas when slow or dropping fast; when low and free, look up and climb with gas.
      out.boost = phase !== 'fire' && (len(sim.vel) < 14 || sim.vel.y < -7);
      if ((phase === 'coast' || phase === 'swing') && sim.pos.y < 7) {
        Object.assign(out, aimAtPoint(sim, v3(0, sim.pos.y + 14, sim.pos.z - 25)));
        out.boost = true;
      }
      out.hookL = hold.hookL;
      out.hookR = hold.hookR;
      void hooks;
      return out;
    };
  };
}

export const lineRun: Scenario = {
  name: 'line-run',
  description: 'An 8+ hook route down the avenue from the central square toward the north gate.',
  world: 'district',
  spawn: (m) => ({ pos: m['line_start'] ?? [0, 16, -40], yaw: 0 }),
  duration: 15,
  timeline: [],
  makePolicy: avenueSwinger({ endZ: -380, heightBias: 3 }),
  browser: { replayEvery: 6 },
};

// ------------------------------------------------------------ perf flight

/** Flies a waypoint loop over the dense south-east core with gas, firing short hooks as it goes. */
function perfFlight(): Policy {
  const waypoints: Vec3[] = [v3(60, 30, 60), v3(560, 30, 560), v3(560, 30, 100), v3(100, 30, 560), v3(60, 30, 60)];
  let wp = 1;
  let hookTimer = 0;
  let hookSide: 'L' | 'R' = 'L';
  let holding = 0;
  return (sim: Sim, t: number) => {
    const target = waypoints[wp]!;
    if (len(sub(v3(target.x, 0, target.z), v3(sim.pos.x, 0, sim.pos.z))) < 25) wp = (wp + 1) % waypoints.length;
    const aimPoint = v3(target.x, target.y + (30 - sim.pos.y) * 1.5, target.z);
    const look = aimAtPoint(sim, aimPoint);
    const out: Partial<Intent> = { ...look, boost: true, fwd: true, hookL: false, hookR: false };
    // Every 2.5 s, fire a hook at a roof ahead and below for 0.6 s (exercises cables and effects).
    if (t >= hookTimer) {
      hookTimer = t + 2.5;
      holding = t + 0.6;
      hookSide = hookSide === 'L' ? 'R' : 'L';
    }
    if (t < holding) {
      const down = aimAtPoint(sim, v3(sim.pos.x + sim.vel.x * 1.2, 15, sim.pos.z + sim.vel.z * 1.2));
      if (t < holding - 0.55) Object.assign(out, down);
      if (hookSide === 'L') out.hookL = true;
      else out.hookR = true;
    }
    return out;
  };
}

export const perf: Scenario = {
  name: 'perf',
  description: '60 s scripted flight at rooftop height over the densest part of the district, with hooks.',
  world: 'district',
  spawn: (m) => ({ pos: m['perf_start'] ?? [60, 28, 60], vel: [12, 0, 12], yaw: Math.atan2(-1, -1) }),
  duration: 60,
  // The flight holds rooftop height looking at the horizon (the heaviest view): no gravity, endless gas.
  // Rendering is the real game; only the pilot's physics is simplified.
  tuning: { infiniteGas: 1, gravity: 0 },
  timeline: [],
  makePolicy: perfFlight,
};

// ------------------------------------------------------------ replays

/** A chain of swings down the avenue. */
export const replaySwingChain: Scenario = {
  ...lineRun,
  name: 'replay-swing-chain',
  description: 'Replay: a chain of swings down the avenue.',
  duration: 8,
  browser: { replayEvery: 8 },
};

/** Double hook between two facades across the avenue, reel, let go through the gap. */
export const replayDoubleThread: Scenario = {
  name: 'replay-double-thread',
  description: 'Replay: hook both sides of the avenue at once, reel, and thread between them.',
  world: 'district',
  spawn: (m) => ({ pos: [0, 10, (m['line_start']?.[2] ?? -40) - 20], yaw: 0 }),
  duration: 4,
  timeline: [
    { t: 0, aimAt: [-10, 12, -110] },
    { t: 0.05, set: { hookL: true } },
    { t: 0.35, aimAt: [10, 12, -110] },
    { t: 0.4, set: { hookR: true } },
    { t: 0.75, aim: { yaw: 0, pitch: 0.05 }, set: { reel: true } },
    { t: 1.9, set: { hookL: false, hookR: false, reel: false, fwd: true } },
  ],
  browser: { replayEvery: 6 },
};

/** Reel straight up the face of the Wall. */
export const replayWallReel: Scenario = {
  name: 'replay-wall-reel',
  description: 'Replay: hook the top of the north Wall from the ring street and reel up it.',
  world: 'district',
  spawn: () => ({ pos: [0, 0.8, -730], yaw: 0 }),
  duration: 5,
  timeline: [
    { t: 0, aimAt: [0, 47, -750] },
    { t: 0.1, set: { hookL: true } },
    { t: 0.6, aim: { yaw: 0, pitch: 0.55 }, set: { reel: true } },
    { t: 2.9, aim: { yaw: 0, pitch: 0.1 }, set: { reel: false, hookL: false } },
  ],
  browser: { replayEvery: 6 },
};

/** Line-run time limit, set from the first working build (8.8 s) plus 25% headroom. */
export const LINE_RUN_LIMIT_S = 11;

export const districtScenarios: Scenario[] = [smoke, lineRun, perf, replaySwingChain, replayDoubleThread, replayWallReel];
