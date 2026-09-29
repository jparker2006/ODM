// Milestone 2 scenarios: a Titan in the test worlds (titan-yard, titan-street) and in the district.
// Each one isolates a Titan rule; closed-loop policies react to the Titan deterministically.

import { ground, aimAtPoint, markersWithPrefix, type Scenario, type FixtureBox, type Policy, type Markers } from '../src/sim/scenario';
import type { Sim, Intent } from '../src/sim/sim';
import { v3, len, sub, add, scale, type Vec3 } from '../src/sim/vec';
import { PART, titanPose } from '../src/sim/titan-body';

const STAND = 0.8;

// ------------------------------------------------------------ worlds

/** Open ground with a few low blocks, a hiding wall, a rooftop block, a supply block and a pole. */
export const YARD: FixtureBox[] = [
  ground(),
  { name: 'block-a', min: [-30, 0, -50], max: [-18, 6, -38] },
  { name: 'block-b', min: [25, 0, -20], max: [37, 8, -8] },
  { name: 'hide-wall', min: [-20, 0, -72], max: [20, 18, -66] },
  { name: 'roof-block', min: [50, 0, 40], max: [70, 15, 60] },
  { name: 'supply-block', min: [-60, 0, 30], max: [-48, 6, 42] },
  { name: 'supply-crate', kind: 'supply', min: [-55, 6, 35], max: [-53.4, 7, 36.6] },
  { name: 'pole', min: [80, 0, -40], max: [81, 30, -39] },
];
const YARD_SUPPLY: [number, number, number] = [-54.2, 7, 35.8];
/** Far corners of the yard: a new Titan appears at one of these after a kill. */
const YARD_SPAWNS: [number, number][] = [
  [200, 200],
  [-200, 200],
  [200, -200],
  [-200, -200],
];

const yard = { world: YARD, titanSpawns: YARD_SPAWNS, supplies: [YARD_SUPPLY] };

/** A 16 m street between two rows of 15 m buildings. */
export const STREET: FixtureBox[] = [
  ground(),
  { name: 'street-west', min: [-28, 0, -300], max: [-8, 15, 300] },
  { name: 'street-east', min: [8, 0, -300], max: [28, 15, 300] },
];

// ------------------------------------------------------------ helpers

const events = (sim: Sim, type: string): boolean => sim.events.some((e) => e.type === type);

/** A point on a Titan body part, in that part's rest frame (normalized), in world space now. */
function partPoint(sim: Sim, part: number, local: [number, number, number]): Vec3 {
  const ti = sim.titan!;
  const p = ti.pose;
  const r = p.rot[part]!;
  const l = v3(local[0] * ti.h, local[1] * ti.h, local[2] * ti.h);
  return add(p.pos[part]!, add(add(scale(r.x, l.x), scale(r.y, l.y)), scale(r.z, l.z)));
}

// ------------------------------------------------------------ live test worlds

export const titanYard: Scenario = {
  name: 'titan-yard',
  description: 'Open yard with a few low blocks, a supply crate and one wandering Titan.',
  ...yard,
  spawn: { pos: [0, STAND, 30], yaw: 0 },
  duration: 20,
  titan: { at: [0, -40], yaw: 0.6 },
  timeline: [{ t: 0, aim: { yaw: 0, pitch: 0.05 } }],
  browser: { shots: [2] },
};

export const titanStreet: Scenario = {
  name: 'titan-street',
  description: 'A 16 m street between 15 m buildings, with a Titan walking toward the player.',
  world: STREET,
  spawn: { pos: [-9.5, 15 + STAND, 40], yaw: 0 },
  duration: 20,
  titan: { at: [0, -25], yaw: Math.PI },
  titanSpawns: [
    [0, -250],
    [0, 250],
  ],
  timeline: [{ t: 0, aim: { yaw: -0.12, pitch: -0.12 } }],
  browser: { shots: [2] },
};

// ------------------------------------------------------------ brain

/** The spawn marker farthest from the player spawn, so the Titan wanders undisturbed. */
function farSpawn(m: Markers): [number, number] {
  const s = m['spawn'] ?? [0, 0, 0];
  const pts = markersWithPrefix(m, 'titan_spawn_');
  let best = pts[0] ?? [0, 0, 0];
  for (const p of pts) if (Math.hypot(p[0] - s[0], p[2] - s[2]) > Math.hypot(best[0] - s[0], best[2] - s[2])) best = p;
  return [best[0], best[2]];
}

export const titanWander: Scenario = {
  name: 'titan-wander',
  description: '120 s of a Titan wandering the district streets.',
  world: 'district',
  spawn: 'district',
  duration: 120,
  titan: (m) => ({ at: farSpawn(m), yaw: 0 }),
  timeline: [],
};

export const titanNoticeSight: Scenario = {
  name: 'titan-notice-sight',
  description: 'The player stands in the open 40 m in front of a Titan.',
  ...yard,
  spawn: { pos: [0, STAND, -40], yaw: Math.PI },
  duration: 2,
  titan: { at: [0, 0], yaw: 0, wander: false },
  timeline: [],
};

export const titanHidden: Scenario = {
  name: 'titan-hidden',
  description: 'The player stands behind a tall wall 30 m in front of a Titan, in range and in its field of view.',
  ...yard,
  spawn: { pos: [0, STAND, -78], yaw: 0 },
  duration: 10,
  titan: { at: [0, -50], yaw: 0, wander: false },
  timeline: [],
};

export const titanNoise: Scenario = {
  ...titanHidden,
  name: 'titan-noise',
  description: 'Same hiding place, but the player jumps and bursts gas at 1.2 s.',
  duration: 4,
  timeline: [
    { t: 1.0, set: { boost: true } },
    { t: 1.005, set: { boost: false } },
    { t: 1.2, set: { boost: true } },
    { t: 1.3, set: { boost: false } },
  ],
};

export const titanChase: Scenario = {
  name: 'titan-chase',
  description: 'A Titan notices the player standing on the ground 50 m away and chases.',
  ...yard,
  spawn: { pos: [0, STAND, -50], yaw: Math.PI },
  duration: 8,
  titan: { at: [0, 0], yaw: 0, wander: false },
  timeline: [],
};

export const titanLoseInterest: Scenario = {
  name: 'titan-lose-interest',
  description: 'Seen at a roof edge, the player walks back to the far side of the roof and stays hidden.',
  ...yard,
  spawn: { pos: [60, 15 + STAND, 42], yaw: Math.PI },
  duration: 24,
  titan: { at: [60, -10], yaw: Math.PI, wander: false },
  timeline: [
    { t: 1.5, aim: { yaw: Math.PI, pitch: 0 }, set: { fwd: true } },
    { t: 3.3, set: { fwd: false } },
  ],
};

export const titanTurn: Scenario = {
  name: 'titan-turn',
  description: 'The player stands 40 m away, 55 degrees off the Titan\'s facing: it notices, turns and looks.',
  ...yard,
  spawn: { pos: [-40 * Math.sin(0.96), STAND, -40 * Math.cos(0.96)], yaw: Math.PI - 0.96 },
  duration: 3,
  titan: { at: [0, 0], yaw: 0, wander: false },
  timeline: [],
};

export const titanApproach: Scenario = {
  name: 'titan-approach',
  description: 'A Titan 68 m away notices the player on a low roof and walks up: footsteps near and far.',
  ...yard,
  spawn: { pos: [31, 8 + STAND, -14], yaw: 0 },
  duration: 16,
  titan: { at: [31, 54], yaw: 0, wander: false },
  timeline: [{ t: 0, aim: { yaw: Math.PI, pitch: 0.05 } }],
};

// ------------------------------------------------------------ grabs

/** Standing at the edge of a low roof as a Titan walks up (live play: hook it, slash, get grabbed, mash). */
export const grabLedge: Scenario = {
  name: 'grab-ledge',
  description: 'Standing at the edge of an 8 m roof, a Titan 33 m away walks up and grabs.',
  ...yard,
  spawn: { pos: [36.4, 8 + STAND, -14], yaw: -Math.PI / 2, pitch: -0.06 },
  duration: 12,
  titan: { at: [70, -14], yaw: Math.PI / 2, wander: false },
  timeline: [],
};

const POLE_HOOK: [number, number, number] = [80.5, 11, -39];

/** Hangs from the pole in front of a Titan that walks up and grabs. */
const grabSetup = {
  ...yard,
  spawn: { pos: [80.5, 9.5, -37] as [number, number, number], yaw: Math.PI },
  titan: { at: [80.5, -10] as [number, number], yaw: 0, wander: false },
};

const hangTimeline = [
  { t: 0, aimAt: POLE_HOOK },
  { t: 0.05, set: { hookL: true } },
  // Turn to face the Titan walking up from behind.
  { t: 0.3, aim: { yaw: Math.PI, pitch: 0.05 } },
];

export const titanGrab: Scenario = {
  name: 'titan-grab',
  description: 'The player hangs still from a pole; a Titan walks up, winds up and grabs.',
  ...grabSetup,
  duration: 8,
  timeline: hangTimeline,
  browser: { shots: [3.0, 4.3, 4.66, 5.5] },
};

/** Waits for the wind-up, then lets go and boosts away sideways. */
function dodgePolicy(): Policy {
  let dodgeAt = -1;
  return (sim: Sim, t: number) => {
    if (dodgeAt < 0 && events(sim, 'titanWindup')) dodgeAt = t;
    if (dodgeAt < 0) return null;
    return { hookL: false, boost: t - dodgeAt < 0.6, yaw: -Math.PI / 2, pitch: 0.1 };
  };
}

export const titanDodge: Scenario = {
  name: 'titan-dodge',
  description: 'Same hang, but the player boosts away as soon as the wind-up starts.',
  ...grabSetup,
  duration: 8,
  timeline: hangTimeline,
  makePolicy: dodgePolicy,
};

/** Once grabbed, mash Space (a press every 0.1 s). */
function mashPolicy(): Policy {
  let grabbedAt = -1;
  let released = false;
  return (sim: Sim, t: number) => {
    if (grabbedAt < 0 && events(sim, 'grabbed')) grabbedAt = t;
    if (events(sim, 'thrown')) released = true;
    if (grabbedAt < 0) return null;
    if (released) return { hookL: false, boost: false };
    const k = Math.floor((t - grabbedAt) / 0.05);
    return { hookL: false, boost: k % 2 === 1 };
  };
}

export const grabEscape: Scenario = {
  name: 'grab-escape',
  description: 'Grabbed from the pole, the player mashes Space and breaks free.',
  ...grabSetup,
  duration: 10,
  timeline: hangTimeline,
  makePolicy: mashPolicy,
  browser: { replayEvery: 4 },
};

export const grabTimeout: Scenario = {
  name: 'grab-timeout',
  description: 'Grabbed from the pole, the player does nothing and is let go at the max hold.',
  ...grabSetup,
  duration: 10,
  timeline: hangTimeline,
  makePolicy: () => {
    let grabbed = false;
    return (sim: Sim) => {
      if (events(sim, 'grabbed')) grabbed = true;
      return grabbed ? { hookL: false } : null;
    };
  },
};

// ------------------------------------------------------------ hooks on a Titan

/** Aims at a point on a Titan part and fires the left hook, then holds it. */
function hookPartPolicy(part: number, local: [number, number, number], fireAt: number): () => Policy {
  return () => (sim: Sim, t: number) => {
    if (!sim.titan) return null;
    const out: Partial<Intent> = {};
    if (t < fireAt + 0.05) Object.assign(out, aimAtPoint(sim, partPoint(sim, part, local)));
    out.hookL = t >= fireAt;
    // Reel up to the Titan's back, then ride the cable as it walks.
    const h = sim.hooks[0];
    out.reel = h.state === 'attached' && h.anchor !== null && len(sub(h.anchor, sim.pos)) > 4;
    return out;
  };
}

export const hookTitan: Scenario = {
  name: 'hook-titan',
  description: 'A hook fired at a walking Titan catches its back and rides with it.',
  ...yard,
  spawn: { pos: [-110, STAND, 125], yaw: 0 },
  duration: 5,
  titan: { at: [-110, 100], yaw: -Math.PI / 2, mode: 'walk' },
  timeline: [],
  makePolicy: hookPartPolicy(PART.spine, [0, 0.14, 0.1], 0.3),
  browser: { replayEvery: 4 },
};

// ------------------------------------------------------------ cuts

/**
 * From behind a standing Titan: hook its upper back, optionally reel in, aim at the nape, let go
 * and slash as the blade comes into reach.
 */
function napePolicy(opts: { reel: boolean; target: 'nape' | 'arm' }): () => Policy {
  return () => {
    let phase: 'aim' | 'pull' | 'cut' | 'done' = 'aim';
    let cutAt = -1;
    return (sim: Sim, t: number) => {
      const ti = sim.titan;
      if (!ti || phase === 'done') return { hookL: false, reel: false, slash: false };
      const goal = opts.target === 'nape' ? ti.pose.nape.c : partPoint(sim, PART.forearmR, [0, -0.1, 0]);
      const hookAt = opts.target === 'nape' ? partPoint(sim, PART.head, [0, 0.19, 0.06]) : goal;
      const out: Partial<Intent> = {};
      if (phase === 'aim') {
        Object.assign(out, aimAtPoint(sim, hookAt));
        out.hookL = t >= 0.1;
        if (sim.hooks[0].state === 'attached') phase = 'pull';
        return out;
      }
      Object.assign(out, aimAtPoint(sim, goal));
      const dist = len(sub(goal, sim.pos));
      if (phase === 'pull') {
        out.hookL = true;
        out.reel = opts.reel;
        if (dist < (opts.target === 'nape' ? 4.5 : 3.2)) {
          phase = 'cut';
          cutAt = t;
        }
        return out;
      }
      // Cut: swing the blades on the way past, then let go once the slash has resolved.
      out.hookL = true;
      out.reel = opts.reel;
      out.slash = t - cutAt < 0.1;
      if (t - cutAt > 0.3) phase = 'done';
      return out;
    };
  };
}

const napeSetup = {
  ...yard,
  titan: { at: [0, 0] as [number, number], yaw: 0, wander: false },
};

export const napeKill: Scenario = {
  name: 'nape-kill',
  description: 'Hook a standing Titan from behind, reel in and cut the nape at speed; a new Titan appears later.',
  ...napeSetup,
  spawn: { pos: [0, 12, 24], yaw: 0, pitch: 0 },
  duration: 17,
  timeline: [],
  makePolicy: napePolicy({ reel: true, target: 'nape' }),
  browser: { replayEvery: 3, shots: [0.5, 0.84, 1.6, 2.6, 4.0] },
};

export const napeSlow: Scenario = {
  name: 'nape-slow',
  description: 'The same approach from close above and behind, without reeling: the cut is too slow to kill.',
  ...napeSetup,
  spawn: { pos: [0, 14, 4], yaw: 0, pitch: 0 },
  duration: 4,
  timeline: [],
  makePolicy: napePolicy({ reel: false, target: 'nape' }),
};

export const bodySlash: Scenario = {
  name: 'body-slash',
  description: 'Hook a standing Titan by the right forearm, reel in fast and cut the arm: it only flinches.',
  ...napeSetup,
  spawn: { pos: [28, 6, -2], yaw: Math.PI / 2 },
  duration: 4,
  timeline: [],
  makePolicy: napePolicy({ reel: true, target: 'arm' }),
};

export const dullBlades: Scenario = {
  ...napeKill,
  name: 'dull-blades',
  description: 'The nape-kill approach with blades worn to zero: no kill.',
  spawn: { pos: [0, 10, 24], yaw: 0, pitch: 0, blades: 0 },
  duration: 4,
  browser: undefined,
};

// ------------------------------------------------------------ supply

export const supply: Scenario = {
  name: 'supply',
  description: 'Land on a supply crate with low gas and blades: both refill to full.',
  ...yard,
  spawn: { pos: [YARD_SUPPLY[0], YARD_SUPPLY[1] + STAND + 0.3, YARD_SUPPLY[2]], yaw: 0, gas: 5, blades: 0.2 },
  duration: 3,
  timeline: [],
};

export const supplyLeave: Scenario = {
  ...supply,
  name: 'supply-leave',
  description: 'Same crate, but walk off after 0.5 s: the refill stops.',
  timeline: [{ t: 0.5, aim: { yaw: Math.PI / 2, pitch: 0 }, set: { fwd: true } }],
};

// ------------------------------------------------------------ district with a Titan

/** The titan spawn marker in sight of the spawn roof (on the avenue), else the nearest one. */
export function nearSpawn(m: Markers): [number, number] {
  const avenue = m['titan_spawn_avenue'];
  if (avenue) return [avenue[0], avenue[2]];
  const s = m['spawn'] ?? [0, 0, 0];
  const pts = markersWithPrefix(m, 'titan_spawn_');
  let best = pts[0] ?? [0, 0, -200];
  for (const p of pts) if (Math.hypot(p[0] - s[0], p[2] - s[2]) < Math.hypot(best[0] - s[0], best[2] - s[2])) best = p;
  return [best[0], best[2]];
}

export const titanScenarios: Scenario[] = [
  titanYard,
  titanStreet,
  titanNoticeSight,
  titanTurn,
  titanApproach,
  grabLedge,
  titanHidden,
  titanNoise,
  titanChase,
  titanLoseInterest,
  titanGrab,
  titanDodge,
  grabEscape,
  grabTimeout,
  hookTitan,
  napeKill,
  napeSlow,
  bodySlash,
  dullBlades,
  supply,
  supplyLeave,
];

/** District scenarios with a Titan (need the Blender district). */
export const titanDistrictScenarios: Scenario[] = [titanWander];

void titanPose;
