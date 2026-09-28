// A Titan in the simulation core: position, gait, navigation and the brain state machine
// (wander, notice, chase, wind-up, grab, hold, recover, flinch, collapse, dead). Its body comes
// from the shared pose function in titan-body.ts. Pure TypeScript, stepped at the fixed tick.

import type { Tuning } from './tuning';
import type { World } from './world';
import type { NavGrid, NavPoint } from './nav';
import type { Rng } from './rng';
import { DT } from './tick';
import { type Vec3, v3, add, sub, scale, dot, len, normalize, clamp, clone, lookDir, horiz } from './vec';
import { titanPose, defaultPoseInput, type TitanPose, type TitanPoseInput, type TitanAction, type Capsule, PART, STRIDE_PER_CYCLE, WINDUP_RAISE } from './titan-body';

export type TitanBrain = 'wander' | 'notice' | 'chase' | 'windup' | 'grab' | 'hold' | 'recover' | 'flinch' | 'collapse' | 'dead';

/** 'brain' runs the full state machine; 'walk' walks straight ahead with the brain off (test worlds). */
export type TitanMode = 'brain' | 'walk';

export interface TitanSpec {
  /** Ground position [x, z]. */
  at: [number, number];
  yaw: number;
  height?: number;
  mode?: TitanMode;
  /** false: stands its ground until it notices the player (the brain still runs). */
  wander?: boolean;
}

/** What the Titan knows about the player this tick. */
export interface PlayerView {
  pos: Vec3;
  vel: Vec3;
  /** Held by a Titan, or inside the re-grab grace. */
  untouchable: boolean;
  /** A gas burst or boost happened last tick. */
  noise: boolean;
}

/** Everything the Titan needs from the simulation each tick. */
export interface TitanContext {
  tuning: Tuning;
  world: World;
  nav: NavGrid;
  rng: Rng;
  time: number;
  player: PlayerView;
  emit: (e: TitanEvent) => void;
  /** At the strike tick: returns true when the player's body overlaps the closing hand. */
  tryCatch: (titan: Titan, hand: Capsule) => boolean;
}

export type TitanEvent =
  | { type: 'titanStep'; pos: Vec3; strength: number }
  | { type: 'titanNotice'; cause: 'sight' | 'noise' }
  | { type: 'titanWindup'; arm: 'L' | 'R'; aim: Vec3 }
  | { type: 'titanLostInterest' };

const wrap = (a: number): number => {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
};

const yawTo = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

export class Titan {
  readonly id: number;
  x: number;
  z: number;
  yaw: number;
  readonly h: number;
  readonly mode: TitanMode;
  readonly wanderOn: boolean;

  brain: TitanBrain = 'wander';
  brainT = 0;
  speed = 0;
  gait = 0;
  stride = 0;
  lean = 0;
  lookYaw = 0;
  lookPitch = 0;
  path: NavPoint[] = [];
  pathIdx = 0;
  repathT = 0;
  pauseT = 0;
  lastSeen = -1e9;
  lastKnown: Vec3 | null = null;
  sees = false;
  cooldown = 0;
  arm: 'L' | 'R' = 'R';
  aim: Vec3 = v3();
  holdFrom: Vec3 = v3();
  holdPoint: Vec3 = v3();
  killTime = -1;
  pose: TitanPose;
  prevPose: TitanPose;
  private strikeNow = false;
  /** The last step was refused because it would have left the walkable grid. */
  private blocked = false;

  constructor(id: number, spec: TitanSpec, defaultHeight: number) {
    this.id = id;
    this.x = spec.at[0];
    this.z = spec.at[1];
    this.yaw = spec.yaw;
    this.h = spec.height ?? defaultHeight;
    this.mode = spec.mode ?? 'brain';
    this.wanderOn = spec.wander ?? true;
    this.pose = titanPose(this.poseInput());
    this.prevPose = this.pose;
  }

  get alive(): boolean {
    return this.brain !== 'collapse' && this.brain !== 'dead';
  }

  /** The grab-capable states in which the grabbing arm is out (the player does not collide with it). */
  get armOut(): boolean {
    return this.brain === 'windup' || this.brain === 'grab' || this.brain === 'hold' || this.brain === 'recover';
  }

  poseInput(): TitanPoseInput {
    const inp = defaultPoseInput(this.x, this.z, this.yaw, this.h);
    inp.gait = this.gait;
    inp.stride = this.stride;
    inp.lookYaw = this.lookYaw;
    inp.lookPitch = this.lookPitch;
    inp.lean = this.lean;
    inp.arm = this.arm;
    const [action, t] = this.action();
    inp.action = action;
    inp.actionT = t;
    const target = this.brain === 'hold' || this.brain === 'recover' ? this.holdTarget() : this.aim;
    inp.target = [target.x, target.y, target.z];
    return inp;
  }

  private action(): [TitanAction, number] {
    const tn = this.tuningCache;
    switch (this.brain) {
      case 'windup':
        return ['windup', clamp(this.brainT / tn.grabWindup, 0, 1)];
      case 'grab':
        return ['strike', clamp(this.brainT / tn.grabClose, 0, 1)];
      case 'hold':
        return ['hold', 1];
      case 'recover':
        return ['recover', clamp(this.brainT / tn.grabRecover, 0, 1)];
      case 'flinch':
        return ['flinch', clamp(this.brainT / tn.flinchTime, 0, 1)];
      case 'collapse':
        return ['collapse', clamp(this.brainT / tn.collapseTime, 0, 1)];
      case 'dead':
        return ['collapse', 1];
      default:
        return ['none', 0];
    }
  }

  // Timing constants the pose needs between ticks (set from the tuning every update).
  private tuningCache = { grabWindup: 0.7, grabClose: 0.25, grabRecover: 0.6, flinchTime: 0.8, collapseTime: 2.5 };

  /** The hand's hold point: carried from the strike point up in front of the face. */
  private holdTarget(): Vec3 {
    if (this.brain === 'recover') return this.holdFrom;
    const k = clamp(this.brainT / 0.4, 0, 1);
    const s = k * k * (3 - 2 * k);
    return add(this.holdFrom, scale(sub(this.holdPoint, this.holdFrom), s));
  }

  /** Where the held player is: the grabbing hand's grip point. */
  grip(): Vec3 {
    return this.arm === 'L' ? this.pose.gripL : this.pose.gripR;
  }

  gripVel(): Vec3 {
    const now = this.grip();
    const was = this.arm === 'L' ? this.prevPose.gripL : this.prevPose.gripR;
    return scale(sub(now, was), 1 / DT);
  }

  // ---------------------------------------------------------------- events from the sim

  /** The player was caught at the strike tick. */
  startHold(): void {
    this.brain = 'hold';
    this.brainT = 0;
    this.holdFrom = clone(this.aim);
    const fwd = lookDir(this.yaw, 0);
    const eye = this.pose.eye;
    this.holdPoint = add(add(eye, scale(fwd, 0.28 * this.h)), v3(0, -0.12 * this.h, 0));
  }

  /** The player escaped or was let go. */
  endHold(): void {
    this.holdFrom = this.holdTarget();
    this.brain = 'recover';
    this.brainT = 0;
  }

  flinch(time: number, playerPos: Vec3): void {
    if (!this.alive || this.brain === 'hold') return;
    this.brain = 'flinch';
    this.brainT = 0;
    this.speed = 0;
    this.lastSeen = time;
    this.lastKnown = clone(playerPos);
  }

  kill(time: number): void {
    if (!this.alive) return;
    this.brain = 'collapse';
    this.brainT = 0;
    this.speed = 0;
    this.killTime = time;
  }

  // ---------------------------------------------------------------- update

  update(ctx: TitanContext): void {
    const t = ctx.tuning;
    this.tuningCache = { grabWindup: t.grabWindup, grabClose: t.grabClose, grabRecover: t.grabRecover, flinchTime: t.flinchTime, collapseTime: t.collapseTime };
    this.prevPose = this.pose;
    this.brainT += DT;
    this.cooldown = Math.max(0, this.cooldown - DT);
    this.strikeNow = false;
    let targetSpeed = 0;

    if (this.mode === 'walk') {
      if (this.alive && this.brain === 'wander') {
        targetSpeed = t.wanderSpeed;
        const fwd = lookDir(this.yaw, 0);
        this.moveTo(ctx, this.x + fwd.x * 10, this.z + fwd.z * 10, targetSpeed, false);
      } else this.brainTick(ctx, true);
    } else {
      targetSpeed = this.brainTick(ctx, false);
    }

    // Look and lean.
    let wantYaw = 0;
    let wantPitch = 0;
    const tracking = this.brain === 'notice' || this.brain === 'chase' || this.brain === 'windup' || this.brain === 'hold' || this.brain === 'flinch' || this.brain === 'recover';
    if (tracking && this.lastKnown) {
      const focus = this.sees ? ctx.player.pos : this.lastKnown;
      const eye = this.pose.eye;
      const d = sub(focus, eye);
      wantYaw = clamp(wrap(yawTo(d.x, d.z) - this.yaw), -1.2, 1.2);
      wantPitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.7);
    }
    const lookRate = 4 * DT;
    this.lookYaw += clamp(wantYaw - this.lookYaw, -lookRate, lookRate);
    this.lookPitch += clamp(wantPitch - this.lookPitch, -lookRate, lookRate);
    const wantLean = this.brain === 'chase' ? 0.14 * clamp(this.speed / Math.max(t.chaseSpeed, 1e-6), 0, 1) : 0;
    this.lean += clamp(wantLean - this.lean, -0.5 * DT, 0.5 * DT);
    const wantStride = clamp(this.speed / Math.max(t.chaseSpeed * 0.6, 1e-6), 0, 1);
    this.stride += clamp(wantStride - this.stride, -2.5 * DT, 2.5 * DT);
    void targetSpeed;

    this.pose = titanPose(this.poseInput());

    if (this.strikeNow) {
      const hand = this.pose.capsules[this.arm === 'L' ? PART.handL : PART.handR]!;
      this.cooldown = t.grabCooldown;
      if (ctx.tryCatch(this, hand)) {
        this.startHold();
      } else {
        this.brain = 'grab';
        this.brainT = 0;
      }
    }
  }

  /** Runs the brain for one tick; returns the walking speed it asked for. */
  private brainTick(ctx: TitanContext, sensesOff: boolean): number {
    const t = ctx.tuning;
    const p = ctx.player;
    this.sees = false;
    if (!this.alive) {
      if (this.brain === 'collapse' && this.brainT >= t.collapseTime) {
        this.brain = 'dead';
        this.brainT = 0;
      }
      this.speed = 0;
      return 0;
    }

    // Senses.
    let heard = false;
    if (!sensesOff && !p.untouchable) {
      this.sees = this.canSee(ctx);
      heard = p.noise && len(sub(p.pos, this.pose.eye)) <= t.noiseRange;
      if (this.sees || heard) {
        this.lastSeen = ctx.time;
        this.lastKnown = clone(p.pos);
      }
    }

    switch (this.brain) {
      case 'wander': {
        if (this.sees || heard) {
          this.enter('notice');
          ctx.emit({ type: 'titanNotice', cause: this.sees ? 'sight' : 'noise' });
          this.speed = 0;
          return 0;
        }
        if (!this.wanderOn) {
          this.speed = 0;
          return 0;
        }
        if (this.pauseT > 0) {
          this.pauseT -= DT;
          this.speed = 0;
          return 0;
        }
        if (this.pathIdx >= this.path.length) {
          const comp = ctx.nav.compAt(this.x, this.z);
          const goal = ctx.nav.randomFreeNear(this.x, this.z, t.wanderRadius, () => ctx.rng.next(), comp);
          const path = goal ? ctx.nav.findPath(this.x, this.z, goal.x, goal.z) : null;
          this.path = path ?? [];
          this.pathIdx = 0;
          if (!path) {
            this.pauseT = 1;
            this.speed = 0;
            return 0;
          }
        }
        if (this.followPath(ctx, t.wanderSpeed)) this.pauseT = ctx.rng.range(0, t.wanderPause);
        return t.wanderSpeed;
      }
      case 'notice': {
        if (this.lastKnown) this.turnToward(yawTo(this.lastKnown.x - this.x, this.lastKnown.z - this.z), t);
        this.speed = 0;
        if (this.brainT >= t.noticeTime) this.enter('chase');
        return 0;
      }
      case 'chase': {
        if (ctx.time - this.lastSeen >= t.loseInterest || !this.lastKnown) {
          this.enter('wander');
          this.path = [];
          this.pathIdx = 0;
          this.pauseT = 0;
          ctx.emit({ type: 'titanLostInterest' });
          this.speed = 0;
          return 0;
        }
        if (this.sees && this.canGrab(ctx)) {
          this.startWindup(ctx);
          return 0;
        }
        const lk = this.lastKnown;
        const flat = Math.hypot(lk.x - this.x, lk.z - this.z);
        if (flat < 0.25 * this.h) {
          this.turnToward(yawTo(lk.x - this.x, lk.z - this.z), t);
          this.speed = 0;
          this.path = [];
          this.pathIdx = 0;
          return 0;
        }
        this.repathT -= DT;
        if (this.repathT <= 0 || this.pathIdx >= this.path.length) {
          this.repathT = t.chaseRepath;
          this.path = ctx.nav.findPath(this.x, this.z, lk.x, lk.z) ?? [];
          this.pathIdx = 0;
        }
        if (this.pathIdx < this.path.length) {
          this.followPath(ctx, t.chaseSpeed);
          return t.chaseSpeed;
        }
        this.turnToward(yawTo(lk.x - this.x, lk.z - this.z), t);
        this.speed = 0;
        return 0;
      }
      case 'windup': {
        this.turnToward(yawTo(this.aim.x - this.x, this.aim.z - this.z), t);
        this.speed = 0;
        if (this.brainT >= t.grabWindup - 1e-9) {
          this.brainT = t.grabWindup;
          this.strikeNow = true;
        }
        return 0;
      }
      case 'grab': {
        this.speed = 0;
        if (this.brainT >= t.grabClose) {
          this.holdFrom = clone(this.aim);
          this.enter('recover');
        }
        return 0;
      }
      case 'hold':
        this.speed = 0;
        return 0;
      case 'recover':
      case 'flinch': {
        this.speed = 0;
        const done = this.brain === 'recover' ? t.grabRecover : t.flinchTime;
        if (this.brainT >= done) {
          const interested = ctx.time - this.lastSeen < t.loseInterest && this.lastKnown !== null;
          this.enter(interested ? 'chase' : 'wander');
          this.path = [];
          this.pathIdx = 0;
          this.repathT = 0;
        }
        return 0;
      }
      default:
        return 0;
    }
  }

  private enter(b: TitanBrain): void {
    this.brain = b;
    this.brainT = 0;
  }

  canSee(ctx: TitanContext): boolean {
    const t = ctx.tuning;
    const eye = this.pose.eye;
    const d = sub(ctx.player.pos, eye);
    const dist = len(d);
    if (dist > t.noticeRange || dist < 1e-6) return false;
    const facing = lookDir(this.yaw + this.lookYaw, this.lookPitch);
    const cosHalf = Math.cos(((t.noticeFov / 2) * Math.PI) / 180);
    if (dot(scale(d, 1 / dist), facing) < cosHalf) return false;
    const hit = ctx.world.raycast(eye, scale(d, 1 / dist), Math.max(0, dist - 0.5));
    return hit === null;
  }

  /** Nearer shoulder to the player, and whether a grab could start now. */
  private canGrab(ctx: TitanContext): boolean {
    const t = ctx.tuning;
    const p = ctx.player;
    if (this.cooldown > 0 || p.untouchable) return false;
    const dl = len(sub(p.pos, this.pose.shoulderL));
    const dr = len(sub(p.pos, this.pose.shoulderR));
    if (Math.min(dl, dr) > t.grabReach * this.h) return false;
    const toP = horiz(sub(p.pos, v3(this.x, 0, this.z)));
    if (len(toP) > 1e-6) {
      const cosF = Math.cos((t.grabFacing * Math.PI) / 180);
      if (dot(normalize(toP), lookDir(this.yaw, 0)) < cosF) return false;
    }
    return true;
  }

  private startWindup(ctx: TitanContext): void {
    const t = ctx.tuning;
    const p = ctx.player;
    const dl = len(sub(p.pos, this.pose.shoulderL));
    const dr = len(sub(p.pos, this.pose.shoulderR));
    this.arm = dl < dr ? 'L' : 'R';
    const shoulder = this.arm === 'L' ? this.pose.shoulderL : this.pose.shoulderR;
    // Aim where the player will be at the strike moment, limited to what the arm can reach.
    let aim = add(p.pos, scale(p.vel, t.grabWindup));
    const off = sub(aim, shoulder);
    const reach = t.grabReach * this.h;
    if (len(off) > reach) aim = add(shoulder, scale(normalize(off), reach));
    aim.y = Math.max(aim.y, 0.5);
    this.aim = aim;
    this.enter('windup');
    this.speed = 0;
    ctx.emit({ type: 'titanWindup', arm: this.arm, aim: clone(aim) });
    void WINDUP_RAISE;
  }

  // ---------------------------------------------------------------- walking

  private turnToward(want: number, t: Tuning): number {
    const err = wrap(want - this.yaw);
    const maxTurn = ((t.titanTurnRate * Math.PI) / 180) * DT;
    this.yaw = wrap(this.yaw + clamp(err, -maxTurn, maxTurn));
    return wrap(want - this.yaw);
  }

  /** Walks along the current path. Returns true on arriving at its end. */
  private followPath(ctx: TitanContext, speed: number): boolean {
    while (this.pathIdx < this.path.length) {
      const wp = this.path[this.pathIdx]!;
      const last = this.pathIdx === this.path.length - 1;
      if (Math.hypot(wp.x - this.x, wp.z - this.z) < (last ? 1.0 : 2.0)) this.pathIdx++;
      else break;
    }
    if (this.pathIdx >= this.path.length) {
      this.speed = 0;
      return true;
    }
    const wp = this.path[this.pathIdx]!;
    this.moveTo(ctx, wp.x, wp.z, speed, true);
    // Turning drifted off the straight leg into a blocked cell: drop the path and plan again from here.
    if (this.blocked) {
      this.path = [];
      this.pathIdx = 0;
      this.repathT = 0;
    }
    return false;
  }

  /** Turns toward a point and walks at a speed scaled down while the heading is off. */
  private moveTo(ctx: TitanContext, px: number, pz: number, speed: number, checkNav: boolean): void {
    const t = ctx.tuning;
    const err = this.turnToward(yawTo(px - this.x, pz - this.z), t);
    const c = Math.cos(err);
    const s = c > 0.5 ? speed * c * c : 0;
    const fwd = lookDir(this.yaw, 0);
    const nx = this.x + fwd.x * s * DT;
    const nz = this.z + fwd.z * s * DT;
    this.blocked = false;
    if (!checkNav || ctx.nav.free(nx, nz)) {
      this.x = nx;
      this.z = nz;
      this.speed = s;
    } else {
      this.blocked = true;
      this.speed = 0;
      this.repathT = 0;
    }
    // Gait: two steps per cycle; a footstep event each half cycle.
    const before = Math.floor(this.gait / Math.PI);
    this.gait += (Math.PI * 2 * this.speed * DT) / (STRIDE_PER_CYCLE * this.h);
    if (Math.floor(this.gait / Math.PI) !== before) {
      const side = Math.floor(this.gait / Math.PI) % 2 === 0 ? PART.shinL : PART.shinR;
      const foot = this.pose.capsules[side]!.b;
      ctx.emit({ type: 'titanStep', pos: v3(foot.x, 0, foot.z), strength: this.h / 12 });
    }
  }
}
