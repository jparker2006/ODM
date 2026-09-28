// The ODM simulation core. Pure TypeScript: fixed 120 Hz ticks, per-tick intents in, state and
// telemetry out. Runs identically in Node (tests, scenario runner) and in the browser.

import type { Tuning } from './tuning';
import type { WorldBox, SphereContact } from './world';
import { World } from './world';
import {
  type Vec3,
  v3,
  add,
  sub,
  scale,
  addScaled,
  dot,
  len,
  normalize,
  horiz,
  lookDir,
  rightOf,
  rotateAxis,
  perpendicular,
  clamp,
  clone,
} from './vec';

export const TICK_HZ = 120;
export const DT = 1 / TICK_HZ;

export interface Intent {
  yaw: number;
  pitch: number;
  hookL: boolean;
  hookR: boolean;
  reel: boolean;
  boost: boolean;
  fwd: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  slash: boolean;
  reset: boolean;
}

export const idleIntent = (yaw = 0, pitch = 0): Intent => ({
  yaw,
  pitch,
  hookL: false,
  hookR: false,
  reel: false,
  boost: false,
  fwd: false,
  back: false,
  left: false,
  right: false,
  slash: false,
  reset: false,
});

export type HookSide = 'L' | 'R';
export type HookState = 'stowed' | 'flying' | 'attached' | 'retracting';

export interface Hook {
  side: HookSide;
  state: HookState;
  tip: Vec3;
  target: Vec3;
  miss: boolean;
  flyTime: number;
  flyElapsed: number;
  anchor: Vec3 | null;
  anchorBox: WorldBox | null;
  rest: number;
  taut: boolean;
  tautTime: number;
}

export type Mode = 'ground' | 'air' | 'swing' | 'reel' | 'wall' | 'stumble' | 'roll';

export interface Spawn {
  pos: Vec3;
  vel?: Vec3;
  yaw: number;
  pitch?: number;
}

export type SimEvent =
  | { type: 'hookFired'; side: HookSide; target: Vec3; distance: number; flyTime: number; miss: boolean; assisted: boolean }
  | { type: 'hookAttached'; side: HookSide; anchor: Vec3; box: string }
  | { type: 'hookMissed'; side: HookSide }
  | { type: 'hookReleased'; side: HookSide; boosted: boolean }
  | { type: 'hookStowed'; side: HookSide }
  | { type: 'taut'; side: HookSide; speed: number }
  | { type: 'landed'; impact: number; result: 'soft' | 'stumble' | 'roll' }
  | { type: 'wallStick'; impact: number }
  | { type: 'pushOff' }
  | { type: 'jump' }
  | { type: 'boostBurst' }
  | { type: 'gasEmpty' }
  | { type: 'impact'; speed: number }
  | { type: 'reset' };

export interface AimResult {
  valid: boolean;
  assisted: boolean;
  point: Vec3;
  distance: number;
  box: WorldBox | null;
  origin: Vec3;
  dir: Vec3;
}

export interface TelemetryFrame {
  tick: number;
  t: number;
  pos: [number, number, number];
  vel: [number, number, number];
  speed: number;
  mode: Mode;
  gas: number;
  thrusting: boolean;
  grounded: boolean;
  touchedGround: boolean;
  wallContact: boolean;
  hooks: { side: HookSide; state: HookState; anchor: [number, number, number] | null; rest: number; taut: boolean }[];
  events: SimEvent[];
}

export class Sim {
  readonly world: World;
  tuning: Tuning;
  spawn: Spawn;

  tick = 0;
  pos: Vec3;
  vel: Vec3;
  mode: Mode = 'air';
  gas: number;
  yaw: number;
  pitch: number;
  grounded = false;
  /** Grounded state at the start of the current tick (assists that only apply in the air read this). */
  groundedAtStart = false;
  groundNormal: Vec3 = v3(0, 1, 0);
  touchedGround = false;
  wallContact = false;
  wallNormal: Vec3 = v3(0, 0, 1);
  wallTimer = 0;
  wallCooldown = 0;
  recoverTimer = 0;
  recoverKind: 'stumble' | 'roll' = 'stumble';
  chainCount = 0;
  lastReleaseTick = -1e9;
  thrusting = false;
  hooks: [Hook, Hook];
  events: SimEvent[] = [];

  private prev: Intent = idleIntent();

  constructor(world: World, tuning: Tuning, spawn: Spawn) {
    this.world = world;
    this.tuning = tuning;
    this.spawn = spawn;
    this.pos = clone(spawn.pos);
    this.vel = spawn.vel ? clone(spawn.vel) : v3();
    this.yaw = spawn.yaw;
    this.pitch = spawn.pitch ?? 0;
    this.gas = tuning.gasCapacity;
    this.hooks = [newHook('L', this.pos), newHook('R', this.pos)];
    this.prev = idleIntent(this.yaw, this.pitch);
  }

  get time(): number {
    return this.tick * DT;
  }

  reset(): void {
    this.pos = clone(this.spawn.pos);
    this.vel = this.spawn.vel ? clone(this.spawn.vel) : v3();
    this.gas = this.tuning.gasCapacity;
    this.hooks = [newHook('L', this.pos), newHook('R', this.pos)];
    this.mode = 'air';
    this.wallTimer = 0;
    this.recoverTimer = 0;
    this.chainCount = 0;
    this.events.push({ type: 'reset' });
  }

  // ---------------------------------------------------------------- aiming

  launcher(side: HookSide | 'C'): Vec3 {
    const r = rightOf(this.yaw);
    const s = side === 'L' ? -0.25 : side === 'R' ? 0.25 : 0;
    return add(add(this.pos, scale(r, s)), v3(0, -0.15, 0));
  }

  /** The ideal (unsmoothed, uncollided) camera position; the render camera follows this. */
  cameraIdeal(yaw = this.yaw, pitch = this.pitch): Vec3 {
    const t = this.tuning;
    const d = lookDir(yaw, pitch);
    return add(add(add(this.pos, v3(0, t.camHeight, 0)), scale(rightOf(yaw), t.camShoulder)), scale(d, -t.camDistance));
  }

  /** What a hook fired now would catch: the crosshair ray, then the aim-assist cone. */
  aim(yaw = this.yaw, pitch = this.pitch): AimResult {
    const t = this.tuning;
    const dir = lookDir(yaw, pitch);
    let origin = this.cameraIdeal(yaw, pitch);
    // Start the ray level with the player so geometry behind Levi never blocks it.
    const s = dot(sub(this.pos, origin), dir);
    if (s > 0) origin = addScaled(origin, dir, s);
    const from = this.launcher('C');
    const maxT = t.hookRange + t.camDistance + 2;

    const probe = (d: Vec3): { point: Vec3; box: WorldBox; distance: number; valid: boolean } | null => {
      const hit = this.world.raycast(origin, d, maxT);
      if (!hit) return null;
      const distance = len(sub(hit.point, from));
      return { point: hit.point, box: hit.box, distance, valid: hit.box.anchorable && distance <= t.hookRange };
    };

    const center = probe(dir);
    if (center && center.valid) return { valid: true, assisted: false, point: center.point, distance: center.distance, box: center.box, origin, dir };

    let best: { point: Vec3; box: WorldBox; distance: number } | null = null;
    let bestAngle = Infinity;
    const cone = (t.aimAssistCone * Math.PI) / 180;
    if (cone > 0) {
      const a = perpendicular(dir);
      const rings = 4;
      const spokes = 16;
      for (let ring = 1; ring <= rings; ring++) {
        const ang = (cone * ring) / rings;
        const tilted = rotateAxis(dir, a, ang);
        for (let k = 0; k < spokes; k++) {
          const d = normalize(rotateAxis(tilted, dir, (k / spokes) * Math.PI * 2));
          const h = probe(d);
          if (h && h.valid && ang < bestAngle) {
            bestAngle = ang;
            best = h;
          }
        }
        if (best) break;
      }
    }
    if (best) return { valid: true, assisted: true, point: best.point, distance: best.distance, box: best.box, origin, dir };

    // A miss: the hook flies to what it would hit, or to the end of its range.
    const missPoint = center && center.distance <= t.hookRange ? center.point : addScaled(from, dir, t.hookRange);
    return { valid: false, assisted: false, point: missPoint, distance: len(sub(missPoint, from)), box: null, origin, dir };
  }

  // ---------------------------------------------------------------- step

  step(intent: Intent): void {
    const t = this.tuning;
    this.events = [];
    const prev = this.prev;
    const pressed = (k: keyof Intent): boolean => Boolean(intent[k]) && !prev[k];
    this.yaw = intent.yaw;
    this.pitch = clamp(intent.pitch, -1.5, 1.5);

    // Safety: anything that falls out of the world goes back to the spawn.
    if (pressed('reset') || this.pos.y < -100) {
      this.reset();
      this.prev = intent;
      this.tick++;
      return;
    }

    this.groundedAtStart = this.grounded;
    const recovering = this.recoverTimer > 0;
    if (recovering) this.recoverTimer = Math.max(0, this.recoverTimer - DT);
    if (this.wallCooldown > 0) this.wallCooldown = Math.max(0, this.wallCooldown - DT);

    // Hooks: fire on press, let go on release.
    this.hooks.forEach((h) => {
      const held = h.side === 'L' ? intent.hookL : intent.hookR;
      const was = h.side === 'L' ? prev.hookL : prev.hookR;
      if (held && !was && h.state === 'stowed' && !recovering) this.fireHook(h);
      if (!held && was && (h.state === 'flying' || h.state === 'attached')) this.releaseHook(h);
    });
    this.hooks.forEach((h) => this.updateHook(h));

    // Steering in the camera frame.
    const fwdAxis = (intent.fwd ? 1 : 0) - (intent.back ? 1 : 0);
    const sideAxis = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
    const flatF = lookDir(this.yaw, 0);
    const flatR = rightOf(this.yaw);
    const steerFlat = normalize(add(scale(flatF, fwdAxis), scale(flatR, sideAxis)), v3());
    const hasSteer = fwdAxis !== 0 || sideAxis !== 0;
    const attached = this.hooks.filter((h) => h.state === 'attached');
    const tautHooks = attached.filter((h) => h.taut);

    let acc = v3(0, -t.gravity, 0);
    this.thrusting = false;

    if (this.wallTimer > 0) {
      // Stuck to a wall: slide slowly, push off with Space, or fire a hook to leave.
      acc = v3(0, -t.gravity * t.wallSlideGravity, 0);
      this.vel = v3(0, Math.min(this.vel.y, 0), 0);
      this.wallTimer = Math.max(0, this.wallTimer - DT);
      if (pressed('boost')) {
        const away = horiz(this.wallNormal);
        const lookAway = horiz(flatF);
        const along = dot(lookAway, away) < 0 ? sub(lookAway, scale(away, dot(lookAway, away))) : lookAway;
        this.vel = add(add(scale(normalize(away), t.pushOffOut), v3(0, t.pushOffUp, 0)), scale(normalize(along, v3()), 4));
        this.wallTimer = 0;
        this.wallCooldown = t.wallCooldown;
        this.events.push({ type: 'pushOff' });
      } else if (attached.length > 0 || this.wallTimer === 0) {
        this.wallTimer = 0;
        this.wallCooldown = t.wallCooldown;
      }
    } else if (this.grounded && !recovering) {
      // Running on a surface.
      const target = scale(steerFlat, t.runSpeed);
      const cur = horiz(this.vel);
      const diff = sub(target, cur);
      const rate = hasSteer ? t.groundAccel : t.groundFriction;
      const maxDv = rate * DT;
      const dl = len(diff);
      const dv = dl > maxDv ? scale(diff, maxDv / dl) : diff;
      if (attached.length === 0 || !hasSteer || len(cur) <= t.runSpeed) this.vel = add(this.vel, dv);
      if (pressed('boost')) {
        this.vel.y = Math.max(this.vel.y, t.jumpSpeed);
        this.grounded = false;
        this.events.push({ type: 'jump' });
      }
    } else if (this.grounded && recovering) {
      const cur = horiz(this.vel);
      const cl = len(cur);
      const brake = (this.recoverKind === 'roll' ? t.groundFriction * 0.25 : t.groundFriction) * DT;
      if (cl > 0) this.vel = add(v3(0, this.vel.y, 0), scale(cur, Math.max(0, cl - brake) / cl));
    } else if (!recovering) {
      // Airborne: steering, gas boost.
      acc = addScaled(acc, steerFlat, t.airAccel);
      const boostDir = normalize(
        hasSteer ? add(scale(lookDir(this.yaw, this.pitch), fwdAxis), scale(flatR, sideAxis)) : lookDir(this.yaw, this.pitch),
      );
      if (intent.boost) {
        if (pressed('boost') && this.spendGas(t.boostBurstGas, true)) {
          this.vel = addScaled(this.vel, boostDir, t.boostBurst);
          this.events.push({ type: 'boostBurst' });
        }
        const need = t.boostGasRate * DT;
        const frac = this.spendGasFraction(need);
        if (frac > 0) {
          acc = addScaled(acc, boostDir, t.boostAccel * frac);
          this.thrusting = true;
        }
      }
    }

    // Reel: shorten attached cables and pull toward the anchors, spending gas.
    // A cable already wound to its minimum does nothing (no pull, no gas).
    const reelable = attached.filter((h) => h.rest > t.minRope + 1e-6 || len(sub(this.pos, h.anchor!)) > t.minRope + 0.5);
    if (intent.reel && reelable.length > 0 && !recovering) {
      const frac = this.spendGasFraction(t.reelGasRate * DT);
      if (frac > 0) {
        for (const h of reelable) {
          h.rest = Math.max(t.minRope, h.rest - t.reelSpeed * DT * frac);
          const toA = normalize(sub(h.anchor!, this.pos));
          acc = addScaled(acc, toA, (t.reelAccel * frac) / reelable.length);
        }
      }
    }

    // Assist: steer away from walls the swing is about to hit.
    if (tautHooks.length > 0 && t.assistWallAvoid > 0) {
      const hv = horiz(this.vel);
      const hs = len(hv);
      if (hs > 5) {
        const look = hs * t.wallAvoidLook;
        const d = scale(hv, 1 / hs);
        const hit = this.world.raycast(this.pos, d, look, (b) => b.kind !== 'ground');
        if (hit && Math.abs(hit.normal.y) < 0.5) {
          const n = hit.normal;
          const tangent = normalize(sub(d, scale(n, dot(d, n))), perpendicular(n));
          const k = t.assistWallAvoid * t.wallAvoidAccel * (1 - hit.t / look);
          acc = add(acc, add(scale(tangent, k), scale(n, k * 0.5)));
        }
      }
    }

    // Assist: keep the bottom of the arc off the floor by shortening the cable (a raised virtual
    // pivot). Applies to every attached cable, taut or not, so an approach swing cannot sag into the street.
    if (attached.length > 0 && t.assistClearance > 0 && this.vel.y < 0 && !this.groundedAtStart) {
      const floor = this.world.floorBelow(this.pos, 120);
      for (const h of attached) {
        const lowest = h.anchor!.y - h.rest;
        const want = floor + t.clearanceHeight + t.bodyHeight / 2;
        if (lowest < want) {
          const target = Math.max(t.minRope, h.anchor!.y - want);
          h.rest = Math.max(target, h.rest - t.clearanceRate * t.assistClearance * DT);
        }
      }
    }

    // Integrate velocity, drag and speed limits.
    this.vel = addScaled(this.vel, acc, DT);
    const speed = len(this.vel);
    const soft = t.softTopSpeed + Math.min(this.chainCount, t.chainMax) * t.chainBonus;
    let drag = t.airDrag;
    if (speed > soft) drag += t.overSpeedDrag * ((speed - soft) / Math.max(speed, 1e-6));
    this.vel = scale(this.vel, Math.max(0, 1 - drag * DT));
    const s2 = len(this.vel);
    if (s2 > t.hardCap) this.vel = scale(this.vel, t.hardCap / s2);

    // Move in substeps small enough that the body can never skip through a surface.
    const wasGrounded = this.grounded;
    const preVel = clone(this.vel);
    this.grounded = false;
    this.touchedGround = false;
    this.wallContact = false;
    let impactDown = 0;
    let wallImpact = 0;
    let wallN: Vec3 | null = null;
    const moveLen = len(this.vel) * DT;
    const n = Math.max(1, Math.ceil(moveLen / (t.bodyRadius * 0.5)));
    for (let i = 0; i < n; i++) {
      this.pos = addScaled(this.pos, this.vel, DT / n);
      this.solveCables();
      const r = this.collide();
      if (r.groundHit) {
        impactDown = Math.max(impactDown, r.groundImpact);
      }
      if (r.wallHit && r.wallImpact > wallImpact) {
        wallImpact = r.wallImpact;
        wallN = r.wallNormal;
      }
    }
    for (const h of this.hooks) if (h.state === 'attached' && h.taut) h.tautTime += DT;

    if (this.wallTimer > 0 && this.wallContact === false) {
      // Keep contact while stuck by nudging into the wall.
      const probe = this.world.raycast(this.pos, scale(this.wallNormal, -1), t.bodyRadius + 0.2);
      if (!probe) this.wallTimer = 0;
    }

    // Landing.
    if (this.grounded && !wasGrounded) {
      const impact = Math.max(impactDown, -preVel.y);
      if (impact >= t.stumbleSpeed && this.recoverTimer === 0) {
        const hs = len(horiz(preVel));
        if (hs >= t.rollMinSpeed) {
          this.recoverKind = 'roll';
          this.recoverTimer = t.rollTime;
          const hv = horiz(preVel);
          this.vel = add(v3(0, this.vel.y, 0), scale(hv, t.rollKeep));
        } else {
          this.recoverKind = 'stumble';
          this.recoverTimer = t.stumbleTime;
          this.vel = v3(0, this.vel.y, 0);
        }
        this.events.push({ type: 'landed', impact, result: this.recoverKind });
        this.events.push({ type: 'impact', speed: impact });
      } else if (impact > 3) {
        this.events.push({ type: 'landed', impact, result: 'soft' });
      }
    }

    // Wall stick.
    if (wallN && !this.grounded && this.wallTimer === 0 && this.wallCooldown === 0 && attached.length === 0 && wallImpact >= t.wallStickMinSpeed) {
      this.wallTimer = t.wallStickTime;
      this.wallNormal = wallN;
      this.vel = v3();
      this.events.push({ type: 'wallStick', impact: wallImpact });
      this.events.push({ type: 'impact', speed: wallImpact });
    } else if (wallN && wallImpact >= t.wallStickMinSpeed) {
      this.events.push({ type: 'impact', speed: wallImpact });
    }

    this.mode = this.computeMode(intent);
    this.prev = intent;
    this.tick++;
  }

  // ---------------------------------------------------------------- hooks

  private fireHook(h: Hook): void {
    const t = this.tuning;
    const a = this.aim();
    const from = this.launcher(h.side);
    const distance = len(sub(a.point, from));
    h.state = 'flying';
    h.tip = from;
    h.target = a.point;
    h.miss = !a.valid;
    h.flyTime = distance / t.hookSpeed;
    h.flyElapsed = 0;
    h.anchor = null;
    h.anchorBox = a.box;
    h.taut = false;
    h.tautTime = 0;
    this.events.push({ type: 'hookFired', side: h.side, target: clone(a.point), distance, flyTime: h.flyTime, miss: h.miss, assisted: a.assisted });
  }

  private releaseHook(h: Hook): void {
    const t = this.tuning;
    let boosted = false;
    if (h.state === 'attached') {
      const others = this.hooks.filter((o) => o !== h && o.state === 'attached');
      if (others.length === 0 && h.tautTime >= t.releaseMinTaut && t.assistRelease > 0 && this.vel.y > -3 && !this.grounded) {
        const hv = normalize(horiz(this.vel), v3());
        this.vel = add(this.vel, add(scale(hv, t.releaseForward * t.assistRelease), v3(0, t.releaseUp * t.assistRelease, 0)));
        boosted = true;
      }
      if (others.length === 0) this.lastReleaseTick = this.tick;
    }
    h.state = 'retracting';
    h.anchor = null;
    h.taut = false;
    this.events.push({ type: 'hookReleased', side: h.side, boosted });
  }

  private updateHook(h: Hook): void {
    const t = this.tuning;
    const from = this.launcher(h.side);
    if (h.state === 'flying') {
      h.flyElapsed += DT;
      const k = Math.min(1, h.flyElapsed / Math.max(h.flyTime, 1e-6));
      h.tip = add(from, scale(sub(h.target, from), k));
      if (h.flyElapsed >= h.flyTime - 1e-9) {
        if (h.miss) {
          h.state = 'retracting';
          h.tip = clone(h.target);
          this.events.push({ type: 'hookMissed', side: h.side });
        } else {
          h.state = 'attached';
          h.anchor = clone(h.target);
          h.tip = clone(h.target);
          h.rest = len(sub(this.pos, h.anchor));
          h.taut = false;
          h.tautTime = 0;
          const chained = this.tick - this.lastReleaseTick <= t.chainWindow * TICK_HZ;
          this.chainCount = chained ? Math.min(this.chainCount + 1, t.chainMax) : 0;
          this.wallTimer = 0;
          this.events.push({ type: 'hookAttached', side: h.side, anchor: clone(h.anchor), box: h.anchorBox?.name ?? '' });
        }
      }
    } else if (h.state === 'retracting') {
      const d = sub(from, h.tip);
      const dl = len(d);
      const stepLen = t.hookRetractSpeed * DT;
      if (dl <= stepLen) {
        h.state = 'stowed';
        h.tip = from;
        this.events.push({ type: 'hookStowed', side: h.side });
      } else {
        h.tip = add(h.tip, scale(d, stepLen / dl));
      }
    } else if (h.state === 'stowed') {
      h.tip = from;
    }
  }

  /** One-sided cable constraints: a cable can go slack, the winder takes up slack, and it snaps taut. */
  private solveCables(): void {
    const t = this.tuning;
    for (let iter = 0; iter < 2; iter++) {
      for (const h of this.hooks) {
        if (h.state !== 'attached' || !h.anchor) continue;
        const d = sub(this.pos, h.anchor);
        const dl = len(d);
        if (dl < h.rest) {
          h.rest = Math.max(dl, h.rest - (t.windRate * DT) / 2);
          if (dl < h.rest - 0.05) {
            h.taut = false;
            continue;
          }
        }
        if (dl <= h.rest) continue;
        const nrm = scale(d, 1 / dl);
        this.pos = add(h.anchor, scale(nrm, h.rest));
        const vn = dot(this.vel, nrm);
        if (vn > 0) {
          const before = len(this.vel);
          let v = sub(this.vel, scale(nrm, vn));
          if (!h.taut && !this.groundedAtStart) {
            // Snap taut. Assists keep the speed and guarantee the first arc has some.
            let sp = len(v);
            const keep = before * t.assistMomentum + sp * (1 - t.assistMomentum);
            let dir = sp > 1e-6 ? scale(v, 1 / sp) : null;
            if (!dir) {
              const f = lookDir(this.yaw, 0);
              dir = normalize(sub(f, scale(nrm, dot(f, nrm))), perpendicular(nrm));
            }
            sp = Math.max(keep, t.firstArcMinSpeed * t.assistFirstArc * (this.chainCount === 0 ? 1 : 0));
            v = scale(dir, sp);
            h.taut = true;
            h.tautTime = 0;
            this.events.push({ type: 'taut', side: h.side, speed: sp });
          }
          this.vel = v;
        } else if (!h.taut) {
          h.taut = true;
          h.tautTime = 0;
        }
      }
    }
  }

  // ---------------------------------------------------------------- collision

  private collide(): { groundHit: boolean; groundImpact: number; wallHit: boolean; wallImpact: number; wallNormal: Vec3 | null } {
    const t = this.tuning;
    const r = t.bodyRadius;
    const half = t.bodyHeight / 2 - r;
    let groundHit = false;
    let groundImpact = 0;
    let wallHit = false;
    let wallImpact = 0;
    let wallNormal: Vec3 | null = null;
    for (let iter = 0; iter < 3; iter++) {
      const contacts: SphereContact[] = [];
      for (const oy of [-half, 0, half]) {
        const c = v3(this.pos.x, this.pos.y + oy, this.pos.z);
        this.world.sphereContacts(c, r, contacts);
      }
      if (contacts.length === 0) break;
      // Resolve the deepest contact first.
      contacts.sort((a, b) => b.depth - a.depth);
      const k = contacts[0]!;
      this.pos = addScaled(this.pos, k.normal, k.depth + 1e-5);
      const vn = dot(this.vel, k.normal);
      if (k.normal.y > 0.7) {
        groundHit = true;
        this.grounded = true;
        this.groundNormal = k.normal;
        groundImpact = Math.max(groundImpact, -vn);
      } else if (Math.abs(k.normal.y) < 0.3) {
        wallHit = true;
        this.wallContact = true;
        if (-vn > wallImpact) {
          wallImpact = -vn;
          wallNormal = k.normal;
        }
      }
      if (k.box.kind === 'ground') this.touchedGround = true;
      if (vn < 0) this.vel = sub(this.vel, scale(k.normal, vn));
    }
    return { groundHit, groundImpact, wallHit, wallImpact, wallNormal };
  }

  // ---------------------------------------------------------------- state

  private spendGas(amount: number, allOrNothing: boolean): boolean {
    if (this.tuning.infiniteGas >= 0.5) return true;
    if (this.gas <= 0) return false;
    if (allOrNothing && this.gas < amount) return false;
    this.gas = Math.max(0, this.gas - amount);
    if (this.gas === 0) this.events.push({ type: 'gasEmpty' });
    return true;
  }

  /** Spends up to `amount` gas; returns the fraction actually available (0 when empty). */
  private spendGasFraction(amount: number): number {
    if (this.tuning.infiniteGas >= 0.5) return 1;
    if (this.gas <= 0 || amount <= 0) return 0;
    const used = Math.min(this.gas, amount);
    this.gas -= used;
    if (this.gas <= 1e-12) {
      this.gas = 0;
      this.events.push({ type: 'gasEmpty' });
    }
    return used / amount;
  }

  private computeMode(intent: Intent): Mode {
    if (this.recoverTimer > 0) return this.recoverKind;
    if (this.wallTimer > 0) return 'wall';
    if (this.grounded) return 'ground';
    const taut = this.hooks.some((h) => h.state === 'attached' && h.taut);
    if (taut) return intent.reel ? 'reel' : 'swing';
    return 'air';
  }

  telemetry(): TelemetryFrame {
    return {
      tick: this.tick,
      t: this.time,
      pos: [this.pos.x, this.pos.y, this.pos.z],
      vel: [this.vel.x, this.vel.y, this.vel.z],
      speed: len(this.vel),
      mode: this.mode,
      gas: this.gas,
      thrusting: this.thrusting,
      grounded: this.grounded,
      touchedGround: this.touchedGround,
      wallContact: this.wallContact,
      hooks: this.hooks.map((h) => ({
        side: h.side,
        state: h.state,
        anchor: h.anchor ? ([h.anchor.x, h.anchor.y, h.anchor.z] as [number, number, number]) : null,
        rest: h.rest,
        taut: h.taut,
      })),
      events: this.events.slice(),
    };
  }
}

function newHook(side: HookSide, at: Vec3): Hook {
  return {
    side,
    state: 'stowed',
    tip: clone(at),
    target: clone(at),
    miss: false,
    flyTime: 0,
    flyElapsed: 0,
    anchor: null,
    anchorBox: null,
    rest: 0,
    taut: false,
    tautTime: 0,
  };
}

