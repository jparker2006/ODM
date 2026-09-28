// Fixture-world scenarios: small hand-placed worlds that isolate one ODM behavior each.
// Coordinates are metres, y up; yaw 0 looks toward -z. Spawn positions are the body center
// (Levi is 1.6 m tall, so standing on the ground is y = 0.8).

import { ground, type Scenario, type FixtureBox, type Policy } from '../src/sim/scenario';
import type { Sim } from '../src/sim/sim';

const STAND = 0.8;

export const hookAttach: Scenario = {
  name: 'hook-attach',
  description: 'A hook aimed at a wall 40 m away attaches after distance / hook speed.',
  world: [ground(), { name: 'wall', min: [-20, 0, -42], max: [20, 30, -40] }],
  spawn: { pos: [0, STAND, 0], yaw: 0 },
  duration: 1.5,
  timeline: [
    { t: 0, aimAt: [0, 12, -40] },
    { t: 0.2, set: { hookL: true } },
  ],
  browser: { shots: [0.6] },
};

export const hookMiss: Scenario = {
  name: 'hook-miss',
  description: 'A hook fired at open sky, then one fired at a wall 90 m away (beyond range), both retract.',
  world: [ground(), { name: 'far-wall', min: [-40, 0, -92], max: [40, 40, -90] }],
  spawn: { pos: [0, STAND, 0], yaw: 0 },
  duration: 3,
  timeline: [
    { t: 0, aim: { yaw: Math.PI, pitch: 0.7 } },
    { t: 0.2, set: { hookL: true } },
    { t: 1.0, set: { hookL: false } },
    { t: 1.1, aimAt: [0, 15, -90] },
    { t: 1.3, set: { hookR: true } },
    { t: 2.5, set: { hookR: false } },
  ],
};

const assistBlock: FixtureBox = { name: 'block', min: [-30, 0, -50], max: [0, 20, -30] };

export const aimAssistInside: Scenario = {
  name: 'aim-assist-inside',
  description: 'Crosshair just past a building edge, inside the assist cone: the hook snaps to the building.',
  world: [ground(), assistBlock],
  spawn: { pos: [-8, STAND, 0], yaw: 0 },
  duration: 1.2,
  timeline: [
    { t: 0, aimAt: [0.8, 10, -30] },
    { t: 0.2, set: { hookL: true } },
  ],
};

export const aimAssistOutside: Scenario = {
  name: 'aim-assist-outside',
  description: 'Crosshair well past the building edge, outside the assist cone: the hook misses.',
  world: [ground(), assistBlock],
  spawn: { pos: [-8, STAND, 0], yaw: 0 },
  duration: 1.2,
  timeline: [
    { t: 0, aimAt: [4, 10, -30] },
    { t: 0.2, set: { hookL: true } },
  ],
};

const beam: FixtureBox = { name: 'beam', min: [-60, 40, -33], max: [60, 42, -29] };

export const swingMomentum: Scenario = {
  name: 'swing-momentum',
  description: 'Flying at 20 m/s, hook a beam overhead and swing under it.',
  world: [ground(), beam],
  spawn: { pos: [0, 25, 0], vel: [0, 0, -20], yaw: 0 },
  duration: 3,
  timeline: [
    { t: 0, aimAt: [0, 40, -31] },
    { t: 0, set: { hookL: true } },
  ],
  browser: { replayEvery: 6 },
};

/** Lets go once the swing has passed the bottom and climbed back to the given height while still rising. */
function releaseWhenRising(height: number): () => Policy {
  return () => {
    let passedBottom = false;
    let released = false;
    return (sim: Sim) => {
      const h = sim.hooks[0];
      if (h.state === 'attached' && h.taut && sim.pos.z < -31) passedBottom = true;
      if (!released && passedBottom && sim.vel.y > 0 && sim.pos.y >= height) released = true;
      return released ? { hookL: false } : null;
    };
  };
}

export const releaseHold: Scenario = {
  name: 'release-hold',
  description: 'Swing under the beam and keep holding the hook.',
  world: [ground(), beam],
  spawn: { pos: [0, 25, 0], vel: [0, 0, -20], yaw: 0 },
  duration: 4,
  timeline: [
    { t: 0, aimAt: [0, 40, -31] },
    { t: 0, set: { hookL: true } },
  ],
};

export const releaseRising: Scenario = {
  ...releaseHold,
  name: 'release-rising',
  description: 'Same swing, but let go on the rising part of the arc.',
  makePolicy: releaseWhenRising(25),
};

const leftBuilding: FixtureBox = { name: 'left', min: [-25, 0, -60], max: [-15, 20, -40] };
const rightBuilding: FixtureBox = { name: 'right', min: [15, 0, -60], max: [25, 20, -40] };

export const doubleHook: Scenario = {
  name: 'double-hook',
  description: 'Hook two buildings at once, reel in, let go and thread the gap between them.',
  world: [ground(), leftBuilding, rightBuilding],
  spawn: { pos: [0, STAND, 0], yaw: 0 },
  duration: 5,
  timeline: [
    { t: 0, aimAt: [-15, 15, -50] },
    { t: 0.1, set: { hookL: true } },
    { t: 0.5, aimAt: [15, 15, -50] },
    { t: 0.6, set: { hookR: true } },
    { t: 1.0, aim: { yaw: 0, pitch: 0.1 }, set: { reel: true } },
  ],
  makePolicy: () => {
    let let_go = false;
    return (sim: Sim) => {
      if (!let_go && sim.pos.z < -44) let_go = true;
      return let_go ? { hookL: false, hookR: false, reel: false } : null;
    };
  },
  browser: { replayEvery: 6 },
};

const tower: FixtureBox = { name: 'tower', min: [-5, 0, -35], max: [5, 40, -30] };

export const reel: Scenario = {
  name: 'reel',
  description: 'Hook a tower from the ground and reel in.',
  world: [ground(), tower],
  spawn: { pos: [0, STAND, 0], yaw: 0 },
  duration: 4,
  timeline: [
    { t: 0, aimAt: [0, 30, -30] },
    { t: 0.1, set: { hookL: true } },
    { t: 1.0, set: { reel: true } },
  ],
};

const pillar: FixtureBox = { name: 'pillar', min: [-3, 0, -23], max: [3, 700, -20] };

export const gasEmpty: Scenario = {
  name: 'gas-empty',
  description: 'Boost until the gas runs out, then try to reel: nothing happens without gas.',
  world: [ground(), pillar],
  spawn: { pos: [0, 400, 0], yaw: 0 },
  duration: 6,
  tuning: { gasCapacity: 3 },
  timeline: [
    { t: 0, aimAt: [0, 402, -20] },
    { t: 0.05, set: { hookL: true } },
    { t: 0.4, aim: { yaw: Math.PI, pitch: 0.2 }, set: { boost: true } },
    { t: 4.0, set: { boost: false } },
    { t: 4.2, set: { reel: true } },
    { t: 5.5, set: { reel: false } },
  ],
};

export const gasInfinite: Scenario = {
  ...gasEmpty,
  name: 'gas-infinite',
  description: 'The same inputs with the infinite-gas toggle on: thrust never stops.',
  tuning: { gasCapacity: 3, infiniteGas: 1 },
};

const thinWall: FixtureBox = { name: 'thin-wall', min: [-80, 0, -30.15], max: [80, 80, -29.85] };

/** 20 dives into a 0.3 m wall at the hard speed cap, from different angles. */
export const noTunnel: Scenario[] = Array.from({ length: 20 }, (_, i) => {
  const yaw = -1.0 + (2.0 * i) / 19; // -57 to +57 degrees off the wall normal
  const pitch = ((i % 5) - 2) * 0.25; // down, level and up
  const speed = 50;
  const dir: [number, number, number] = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  return {
    name: `no-tunnel-${String(i).padStart(2, '0')}`,
    description: `Hit a 0.3 m wall at ${speed} m/s, yaw ${yaw.toFixed(2)}, pitch ${pitch.toFixed(2)}.`,
    world: [ground(), thinWall],
    spawn: { pos: [0, 30, 0], vel: [dir[0] * speed, dir[1] * speed, dir[2] * speed], yaw },
    duration: 1.5,
    tuning: { infiniteGas: 1 },
    timeline: [{ t: 0, aim: { yaw, pitch }, set: { boost: true, fwd: true } }],
  };
});

const streetL: FixtureBox = { name: 'street-left', min: [-20, 0, -300], max: [-6, 12, 0] };
const streetR: FixtureBox = { name: 'street-right', min: [6, 0, -300], max: [20, 12, 0] };

export const groundClearance: Scenario = {
  name: 'ground-clearance',
  description: 'A street-level swing between two 12 m buildings, 12 m apart, never touches the ground.',
  world: [ground(), streetL, streetR],
  spawn: { pos: [0, 9, 5], vel: [0, 0, -20], yaw: 0 },
  duration: 3,
  timeline: [
    { t: 0, aimAt: [-6, 11, -30] },
    { t: 0, set: { hookL: true } },
  ],
  browser: { replayEvery: 6 },
};

export const groundClearanceOff: Scenario = {
  ...groundClearance,
  name: 'ground-clearance-off',
  description: 'The same swing with the clearance assist off (shows the assist is what keeps it clear).',
  tuning: { assistClearance: 0 },
};

const stickWall: FixtureBox = { name: 'stick-wall', min: [-30, 0, -21], max: [30, 40, -20] };

export const wallStick: Scenario = {
  name: 'wall-stick',
  description: 'Hit a wall at 15 m/s, stick, then push off with Space.',
  world: [ground(), stickWall],
  spawn: { pos: [0, 15, 0], vel: [0, 0, -15], yaw: 0 },
  duration: 3,
  timeline: [
    { t: 0, aim: { yaw: 0, pitch: 0 } },
    { t: 1.8, set: { boost: true } },
    { t: 1.9, set: { boost: false } },
  ],
};

const roof: FixtureBox = { name: 'roof', min: [-20, 0, -20], max: [20, 10, 20] };

export const landing: Scenario = {
  name: 'landing',
  description: 'Drop 20 m onto a roof: stumble, then control returns.',
  world: [ground(), roof],
  spawn: { pos: [0, 10 + 20 + STAND, 0], yaw: 0 },
  duration: 4,
  timeline: [{ t: 2.4, set: { fwd: true } }],
};

export const landingRoll: Scenario = {
  name: 'landing-roll',
  description: 'Drop 20 m onto a roof while moving fast: roll, then control returns.',
  world: [ground(), roof],
  spawn: { pos: [-12, 10 + 20 + STAND, 0], vel: [10, 0, 0], yaw: -Math.PI / 2 },
  duration: 4,
  timeline: [],
};

export const fixtureScenarios: Scenario[] = [
  hookAttach,
  hookMiss,
  aimAssistInside,
  aimAssistOutside,
  swingMomentum,
  releaseHold,
  releaseRising,
  doubleHook,
  reel,
  gasEmpty,
  gasInfinite,
  ...noTunnel,
  groundClearance,
  groundClearanceOff,
  wallStick,
  landing,
  landingRoll,
];
