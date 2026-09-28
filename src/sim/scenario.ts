// Scenarios: a world, a spawn, a seed and an input timeline. The same scenario runs headless
// (tests, telemetry) and in the real game (screenshots, frame timings, replays).

import { Sim, DT, idleIntent, type Intent, type Spawn, type TelemetryFrame } from './sim';
import { World, type WorldBox, type BoxKind } from './world';
import { makeTuning, type Tuning } from './tuning';
import { type Vec3, v3, sub, yawPitchOf } from './vec';

export type Buttons = Omit<Intent, 'yaw' | 'pitch'>;

export interface Keyframe {
  /** Seconds from scenario start. */
  t: number;
  /** Absolute look direction. */
  aim?: { yaw: number; pitch: number };
  /** Track this world point with the crosshair until the next aim or aimAt keyframe. */
  aimAt?: [number, number, number];
  /** Buttons changed at this time; the rest keep their previous state. */
  set?: Partial<Buttons>;
}

export interface FixtureBox {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
  kind?: BoxKind;
  anchorable?: boolean;
}

export interface SpawnSpec {
  pos: [number, number, number];
  vel?: [number, number, number];
  yaw: number;
  pitch?: number;
}

/** Closed-loop control for scenarios that need to react to where the player is (deterministic). */
export type Policy = (sim: Sim, t: number) => Partial<Intent> | null;

export interface Scenario {
  name: string;
  description: string;
  /** 'district' loads the Blender district; otherwise a fixture world of boxes. */
  world: 'district' | FixtureBox[];
  /** 'district' uses the district's spawn marker. */
  spawn: SpawnSpec | 'district' | ((markers: Markers) => SpawnSpec);
  duration: number;
  seed?: number;
  tuning?: Partial<Tuning>;
  timeline: Keyframe[];
  /** Creates fresh closed-loop control for each run, so runs never share state. */
  makePolicy?: () => Policy;
  /** Browser runner options. */
  browser?: {
    /** Capture a screenshot at these times (seconds). */
    shots?: number[];
    /** Capture a replay frame every N rendered frames. */
    replayEvery?: number;
  };
}

export type Markers = Record<string, [number, number, number]>;

export interface DistrictData {
  boxes: WorldBox[];
  markers: Record<string, [number, number, number]>;
  spawnYaw: number;
}

export const ground = (size = 500): FixtureBox => ({
  name: 'ground',
  kind: 'ground',
  anchorable: false,
  min: [-size, -2, -size],
  max: [size, 0, size],
});

export function fixtureBoxes(list: FixtureBox[]): WorldBox[] {
  return list.map((f) => ({
    name: f.name,
    kind: f.kind ?? 'fixture',
    anchorable: f.anchorable ?? (f.kind ?? 'fixture') !== 'ground',
    min: v3(...f.min),
    max: v3(...f.max),
  }));
}

export function resolveSpawn(s: Scenario, district: DistrictData | null): Spawn {
  let spec: SpawnSpec;
  if (s.spawn === 'district') {
    if (!district) throw new Error(`${s.name}: district spawn needs the district`);
    const m = district.markers['spawn'];
    if (!m) throw new Error('district has no spawn marker');
    spec = { pos: m, yaw: district.spawnYaw };
  } else if (typeof s.spawn === 'function') {
    if (!district) throw new Error(`${s.name}: marker spawn needs the district`);
    spec = s.spawn(district.markers as Markers);
  } else {
    spec = s.spawn;
  }
  return {
    pos: v3(...spec.pos),
    vel: spec.vel ? v3(...spec.vel) : undefined,
    yaw: spec.yaw,
    pitch: spec.pitch ?? 0,
  };
}

export function buildWorld(s: Scenario, district: DistrictData | null): World {
  if (s.world === 'district') {
    if (!district) throw new Error(`${s.name}: needs the district`);
    return new World(district.boxes);
  }
  return new World(fixtureBoxes(s.world));
}

/** Look angles that put the crosshair on a world point (the boom camera moves with the angles, so iterate). */
export function aimAtPoint(sim: Sim, target: Vec3): { yaw: number; pitch: number } {
  let yaw = sim.yaw;
  let pitch = sim.pitch;
  for (let i = 0; i < 4; i++) {
    const origin = sim.cameraIdeal(yaw, pitch);
    const yp = yawPitchOf(sub(target, origin));
    yaw = yp.yaw;
    pitch = yp.pitch;
  }
  return { yaw, pitch };
}

/** Turns a timeline into per-tick intents. Stateful: call next() once per tick, in order. */
export class TimelinePlayer {
  private idx = 0;
  private buttons: Buttons;
  private aim: { yaw: number; pitch: number };
  private aimAt: Vec3 | null = null;
  private readonly frames: Keyframe[];
  private readonly policy: Policy | null;

  constructor(
    scenario: Scenario,
    spawn: Spawn,
  ) {
    const { yaw: _y, pitch: _p, ...rest } = idleIntent();
    this.buttons = rest;
    this.aim = { yaw: spawn.yaw, pitch: spawn.pitch ?? 0 };
    this.frames = [...scenario.timeline].sort((a, b) => a.t - b.t);
    this.policy = scenario.makePolicy ? scenario.makePolicy() : null;
  }

  next(sim: Sim, tick: number): Intent {
    const t = tick * DT;
    while (this.idx < this.frames.length && this.frames[this.idx]!.t <= t + 1e-9) {
      const k = this.frames[this.idx++]!;
      if (k.set) this.buttons = { ...this.buttons, ...k.set };
      if (k.aim) {
        this.aim = { ...k.aim };
        this.aimAt = null;
      }
      if (k.aimAt) this.aimAt = v3(...k.aimAt);
    }
    if (this.aimAt) this.aim = aimAtPoint(sim, this.aimAt);
    let intent: Intent = { ...this.buttons, yaw: this.aim.yaw, pitch: this.aim.pitch };
    if (this.policy) {
      const over = this.policy(sim, t);
      if (over) intent = { ...intent, ...over };
    }
    return intent;
  }
}

export interface ScenarioRun {
  sim: Sim;
  frames: TelemetryFrame[];
}

/** Runs a scenario headless to completion and returns per-tick telemetry. */
export function runScenario(s: Scenario, district: DistrictData | null, extraTuning: Partial<Tuning> = {}): ScenarioRun {
  const world = buildWorld(s, district);
  const tuning = makeTuning({ ...s.tuning, ...extraTuning });
  const spawn = resolveSpawn(s, district);
  const sim = new Sim(world, tuning, spawn);
  const player = new TimelinePlayer(s, spawn);
  const frames: TelemetryFrame[] = [];
  const ticks = Math.round(s.duration / DT);
  for (let i = 0; i < ticks; i++) {
    sim.step(player.next(sim, sim.tick));
    frames.push(sim.telemetry());
  }
  return { sim, frames };
}
