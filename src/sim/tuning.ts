// Every feel constant in the game. Nothing else may hard-code physics, camera or control numbers.
// Starting values come from docs/SPEC.md (Starting values table); values the spec left open are
// marked "chosen" and are listed in the Milestone 1 handoff note.

export interface ParamSpec {
  group: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Read-only in the tuning panel (changing it would break determinism or the spec). */
  fixed?: boolean;
}

const p = (group: string, label: string, unit: string, value: number, min: number, max: number, step: number, fixed = false): ParamSpec => ({
  group,
  label,
  unit,
  value,
  min,
  max,
  step,
  fixed,
});

export const PARAMS = {
  // World
  simRate: p('World', 'Simulation rate', 'Hz', 120, 120, 120, 1, true),
  gravity: p('World', 'Gravity (chosen within spec range 9.81 to 20)', 'm/s²', 16, 9.81, 20, 0.1),
  airDrag: p('World', 'Air drag', '1/s', 0.02, 0, 0.5, 0.005),
  softTopSpeed: p('World', 'Soft top speed', 'm/s', 35, 15, 60, 0.5),
  overSpeedDrag: p('World', 'Drag above soft top speed', '1/s', 0.8, 0, 5, 0.05),
  hardCap: p('World', 'Hard speed cap', 'm/s', 50, 30, 80, 1),

  // Body
  bodyHeight: p('Body', 'Levi height', 'm', 1.6, 1.6, 1.6, 0.01, true),
  bodyRadius: p('Body', 'Collision radius', 'm', 0.35, 0.25, 0.5, 0.01),

  // Hooks
  hookRange: p('Hooks', 'Hook range', 'm', 60, 20, 120, 1),
  hookSpeed: p('Hooks', 'Hook travel speed', 'm/s', 150, 50, 400, 5),
  aimAssistCone: p('Hooks', 'Aim-assist cone', 'deg', 3, 0, 10, 0.25),
  hookRetractSpeed: p('Hooks', 'Hook retract speed', 'm/s', 200, 50, 400, 5),
  windRate: p('Hooks', 'Winder slack take-up', 'm/s', 30, 0, 100, 1),
  minRope: p('Hooks', 'Minimum cable length', 'm', 2, 0.5, 10, 0.1),

  // Reel
  reelSpeed: p('Reel', 'Reel-in speed', 'm/s', 18, 2, 50, 0.5),
  reelAccel: p('Reel', 'Reel pull toward anchor', 'm/s²', 28, 0, 80, 1),
  reelGasRate: p('Reel', 'Reel gas use', 'gas/s', 0.5, 0, 3, 0.05),
  autoPull: p('Reel', 'Auto-pull toward anchor while hooked (no gas, off while reeling)', 'm/s²', 8, 0, 40, 0.5),

  // Gas
  gasCapacity: p('Gas', 'Gas capacity', 's of boost', 40, 5, 120, 1),
  infiniteGas: p('Gas', 'Infinite gas (0 off, 1 on)', 'toggle', 0, 0, 1, 1),
  boostAccel: p('Gas', 'Boost thrust', 'm/s²', 24, 0, 80, 1),
  boostBurst: p('Gas', 'Boost burst on press', 'm/s', 5, 0, 20, 0.5),
  boostBurstGas: p('Gas', 'Boost burst gas cost', 'gas', 0.5, 0, 5, 0.1),
  boostGasRate: p('Gas', 'Boost gas use', 'gas/s', 1, 0.1, 5, 0.05),

  // Ground
  runSpeed: p('Ground', 'Run speed', 'm/s', 9, 3, 20, 0.5),
  groundAccel: p('Ground', 'Run acceleration', 'm/s²', 60, 5, 200, 1),
  groundFriction: p('Ground', 'Ground braking', 'm/s²', 40, 5, 200, 1),
  jumpSpeed: p('Ground', 'Jump speed', 'm/s', 7, 2, 15, 0.25),
  airAccel: p('Air', 'Air control', 'm/s²', 9, 0, 40, 0.5),

  // Landing
  stumbleSpeed: p('Landing', 'Hard-landing impact speed', 'm/s', 15, 5, 40, 0.5),
  rollMinSpeed: p('Landing', 'Horizontal speed that turns a stumble into a roll', 'm/s', 8, 2, 30, 0.5),
  stumbleTime: p('Landing', 'Stumble recovery', 's', 1.1, 0.2, 1.5, 0.05),
  rollTime: p('Landing', 'Roll recovery', 's', 0.7, 0.2, 1.5, 0.05),
  rollKeep: p('Landing', 'Speed kept through a roll', 'fraction', 0.75, 0, 1, 0.05),

  // Wall
  wallStickMinSpeed: p('Wall', 'Impact speed to stick', 'm/s', 8, 2, 30, 0.5),
  wallStickTime: p('Wall', 'Stick time', 's', 0.9, 0.1, 3, 0.05),
  wallSlideGravity: p('Wall', 'Gravity while stuck', 'fraction', 0.15, 0, 1, 0.05),
  pushOffOut: p('Wall', 'Push-off away from wall', 'm/s', 9, 0, 25, 0.5),
  pushOffUp: p('Wall', 'Push-off upward', 'm/s', 7, 0, 25, 0.5),
  wallCooldown: p('Wall', 'Re-stick cooldown', 's', 0.35, 0, 2, 0.05),

  // Assists
  assistMomentum: p('Assists', 'Keep speed when cable goes taut', 'strength 0 to 1', 1, 0, 1, 0.05),
  assistFirstArc: p('Assists', 'First-arc minimum speed', 'strength 0 to 1', 1, 0, 1, 0.05),
  firstArcMinSpeed: p('Assists', 'First-arc speed floor', 'm/s', 12, 0, 30, 0.5),
  assistClearance: p('Assists', 'Ground clearance', 'strength 0 to 1', 1, 0, 1, 0.05),
  clearanceHeight: p('Assists', 'Clearance above floor', 'm', 2.5, 0.5, 8, 0.1),
  clearanceRate: p('Assists', 'Clearance cable shortening rate', 'm/s', 30, 1, 100, 1),
  assistWallAvoid: p('Assists', 'Wall avoidance', 'strength 0 to 1', 1, 0, 1, 0.05),
  wallAvoidAccel: p('Assists', 'Wall avoidance steering', 'm/s²', 30, 0, 100, 1),
  wallAvoidLook: p('Assists', 'Wall avoidance look-ahead', 's', 0.35, 0.05, 1.5, 0.05),
  assistRelease: p('Assists', 'Release boost', 'strength 0 to 1', 1, 0, 1, 0.05),
  releaseForward: p('Assists', 'Release boost forward', 'm/s', 3, 0, 15, 0.25),
  releaseUp: p('Assists', 'Release boost upward', 'm/s', 5, 0, 20, 0.25),
  releaseMinTaut: p('Assists', 'Swing time before release boost', 's', 0.2, 0, 2, 0.05),
  chainWindow: p('Assists', 'Chain window', 's', 1.5, 0.2, 5, 0.1),
  chainBonus: p('Assists', 'Top speed bonus per chained swing', 'm/s', 2, 0, 10, 0.25),
  chainMax: p('Assists', 'Maximum chain count', 'count', 4, 0, 10, 1),

  // Camera and controls (read by the renderer; the aim ray also uses the boom offsets)
  camDistance: p('Camera', 'Boom distance', 'm', 3.6, 1.5, 8, 0.1),
  camHeight: p('Camera', 'Boom height', 'm', 0.8, 0, 3, 0.05),
  camShoulder: p('Camera', 'Shoulder offset', 'm', 0.7, -2, 2, 0.05),
  camFollow: p('Camera', 'Follow stiffness', '1/s', 14, 1, 40, 0.5),
  fovMin: p('Camera', 'FOV at low speed', 'deg', 60, 40, 90, 1),
  fovMax: p('Camera', 'FOV at high speed', 'deg', 75, 40, 110, 1),
  fovSpeedLow: p('Camera', 'Speed for minimum FOV', 'm/s', 10, 0, 40, 0.5),
  fovSpeedHigh: p('Camera', 'Speed for maximum FOV', 'm/s', 40, 5, 80, 0.5),
  camLean: p('Camera', 'Swing lean', 'deg', 7, 0, 25, 0.5),
  shakeImpact: p('Camera', 'Impact shake', 'strength', 0.35, 0, 2, 0.05),
  mouseSensitivity: p('Controls', 'Mouse sensitivity', 'rad/px', 0.0022, 0.0005, 0.01, 0.0001),
  invertY: p('Controls', 'Invert Y (0 off, 1 on)', 'toggle', 0, 0, 1, 1),

  // Render
  renderScaleMin: p('Render', 'Minimum render scale', 'fraction', 0.75, 0.5, 1, 0.05),
  renderScaleMax: p('Render', 'Maximum render scale', 'fraction', 1, 0.5, 1.5, 0.05),
} satisfies Record<string, ParamSpec>;

export type TuningKey = keyof typeof PARAMS;
export type Tuning = Record<TuningKey, number>;

export const TUNING_KEYS = Object.keys(PARAMS) as TuningKey[];

export function defaultTuning(): Tuning {
  const t = {} as Tuning;
  for (const k of TUNING_KEYS) t[k] = PARAMS[k].value;
  return t;
}

export function makeTuning(overrides: Partial<Tuning> = {}): Tuning {
  return { ...defaultTuning(), ...overrides };
}

/** Markdown before and after table of every constant that differs, or all constants when all is true. */
export function tuningTable(before: Tuning, after: Tuning, all = false): string {
  const rows = ['| Group | Constant | Before | After | Unit |', '|---|---|---|---|---|'];
  for (const k of TUNING_KEYS) {
    if (!all && before[k] === after[k]) continue;
    const s = PARAMS[k];
    rows.push(`| ${s.group} | ${s.label} (\`${k}\`) | ${fmt(before[k])} | ${fmt(after[k])} | ${s.unit} |`);
  }
  return rows.join('\n');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(5));
}
