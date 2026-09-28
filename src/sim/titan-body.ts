// The Titan's body: one fixed skeleton and one pure pose function. The simulation uses the pose's
// capsules for hooks, collision, grabs and cuts; the renderer uses the same part transforms to pose
// the Blender model (tools/blender/titan.py builds one mesh per part, with its origin at the part's
// joint, in this rest pose). This file is the single source of truth for where the body is.
//
// Rest pose: normalized to 1 m tall (the game scales by height), feet at y = 0, facing -z, the
// Titan's left at -x. Arms hang straight down. Proportions are deliberately off: a head about 1.6
// times human size, a long torso, long arms and short legs.

import { type Vec3, v3, add, sub, scale, addScaled, dot, cross, len, normalize, clamp, lerp, lookDir, rightOf } from './vec';

/** A rotation as the world images of the local x, y and z axes (the columns of a 3x3 matrix). */
export interface Basis {
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

export interface PartDef {
  name: string;
  parent: number;
  /** Joint position in the rest pose (normalized height). */
  joint: [number, number, number];
  /** Hit capsule end points relative to the joint, in the part's rest frame, and its radius. */
  a: [number, number, number];
  b: [number, number, number];
  r: number;
}

export const PARTS: PartDef[] = [
  { name: 'ti_pelvis', parent: -1, joint: [0, 0.44, 0], a: [-0.07, 0, 0], b: [0.07, 0, 0], r: 0.075 },
  { name: 'ti_spine', parent: 0, joint: [0, 0.47, 0], a: [0, 0.07, 0], b: [0, 0.14, 0], r: 0.11 },
  { name: 'ti_neck', parent: 1, joint: [0, 0.71, 0], a: [0, 0, 0], b: [0, 0.06, 0], r: 0.045 },
  { name: 'ti_head', parent: 2, joint: [0, 0.77, 0], a: [0, 0.08, -0.01], b: [0, 0.13, -0.01], r: 0.1 },
  { name: 'ti_upperarm_L', parent: 1, joint: [-0.15, 0.69, 0], a: [0, 0, 0], b: [0, -0.22, 0], r: 0.04 },
  { name: 'ti_forearm_L', parent: 4, joint: [-0.15, 0.47, 0], a: [0, 0, 0], b: [0, -0.21, 0], r: 0.035 },
  { name: 'ti_hand_L', parent: 5, joint: [-0.15, 0.26, 0], a: [0, -0.02, 0], b: [0, -0.07, 0], r: 0.05 },
  { name: 'ti_upperarm_R', parent: 1, joint: [0.15, 0.69, 0], a: [0, 0, 0], b: [0, -0.22, 0], r: 0.04 },
  { name: 'ti_forearm_R', parent: 7, joint: [0.15, 0.47, 0], a: [0, 0, 0], b: [0, -0.21, 0], r: 0.035 },
  { name: 'ti_hand_R', parent: 8, joint: [0.15, 0.26, 0], a: [0, -0.02, 0], b: [0, -0.07, 0], r: 0.05 },
  { name: 'ti_thigh_L', parent: 0, joint: [-0.075, 0.42, 0], a: [0, 0, 0], b: [0, -0.2, 0], r: 0.055 },
  { name: 'ti_shin_L', parent: 10, joint: [-0.075, 0.22, 0], a: [0, 0, 0], b: [0, -0.175, 0], r: 0.045 },
  { name: 'ti_thigh_R', parent: 0, joint: [0.075, 0.42, 0], a: [0, 0, 0], b: [0, -0.2, 0], r: 0.055 },
  { name: 'ti_shin_R', parent: 12, joint: [0.075, 0.22, 0], a: [0, 0, 0], b: [0, -0.175, 0], r: 0.045 },
];

export const PART = {
  pelvis: 0,
  spine: 1,
  neck: 2,
  head: 3,
  upperarmL: 4,
  forearmL: 5,
  handL: 6,
  upperarmR: 7,
  forearmR: 8,
  handR: 9,
  thighL: 10,
  shinL: 11,
  thighR: 12,
  shinR: 13,
} as const;

/** The nape: a target sphere at the back of the neck, separate from the neck capsule. */
export const NAPE = { name: 'ti_nape', parent: PART.neck, pos: [0, 0.745, 0.055] as [number, number, number], r: 1 / 24 };

/** Ground footprint radius (legs apart plus leg thickness, with stride room). */
export const FOOTPRINT = 0.14;
/** Where the grabbing hand holds: the middle of the hand capsule, relative to the hand joint. */
const GRIP: [number, number, number] = [0, -0.045, 0];
/** Eye point relative to the head joint (front of the face). */
const EYE: [number, number, number] = [0, 0.09, -0.08];
/** One full gait cycle (two steps) covers this many heights of ground. */
export const STRIDE_PER_CYCLE = 0.7;

const UPPER = 0.22;
const FORE = 0.21 + 0.045; // forearm plus grip offset

export type TitanAction = 'none' | 'windup' | 'strike' | 'hold' | 'recover' | 'flinch' | 'collapse';

/** Everything the pose depends on. Plain and serializable, so tests can re-pose from telemetry. */
export interface TitanPoseInput {
  x: number;
  z: number;
  yaw: number;
  h: number;
  /** Gait phase in radians; one cycle is two steps. */
  gait: number;
  /** Walking amplitude, 0 standing to 1 at a run. */
  stride: number;
  /** Head look relative to the body (radians, positive yaw turns left, positive pitch looks up). */
  lookYaw: number;
  lookPitch: number;
  /** Forward lean of the torso while chasing (radians). */
  lean: number;
  action: TitanAction;
  /** Progress through the action, 0 to 1. */
  actionT: number;
  arm: 'L' | 'R';
  /** World point the grabbing hand reaches for (windup, strike, hold, recover). */
  target: [number, number, number];
}

export interface Capsule {
  a: Vec3;
  b: Vec3;
  r: number;
}

export interface TitanPose {
  pos: Vec3[];
  rot: Basis[];
  capsules: Capsule[];
  nape: { c: Vec3; r: number };
  eye: Vec3;
  gripL: Vec3;
  gripR: Vec3;
  shoulderL: Vec3;
  shoulderR: Vec3;
}

export function defaultPoseInput(x: number, z: number, yaw: number, h: number): TitanPoseInput {
  return { x, z, yaw, h, gait: 0, stride: 0, lookYaw: 0, lookPitch: 0, lean: 0, action: 'none', actionT: 0, arm: 'R', target: [x, h * 0.5, z] };
}

// ---------------------------------------------------------------- basis math

export const IDENTITY: Basis = { x: v3(1, 0, 0), y: v3(0, 1, 0), z: v3(0, 0, 1) };

export function apply(b: Basis, p: Vec3): Vec3 {
  return {
    x: b.x.x * p.x + b.y.x * p.y + b.z.x * p.z,
    y: b.x.y * p.x + b.y.y * p.y + b.z.y * p.z,
    z: b.x.z * p.x + b.y.z * p.y + b.z.z * p.z,
  };
}

/** Inverse rotation (transpose). */
export function applyT(b: Basis, p: Vec3): Vec3 {
  return { x: dot(b.x, p), y: dot(b.y, p), z: dot(b.z, p) };
}

export function mul(a: Basis, b: Basis): Basis {
  return { x: apply(a, b.x), y: apply(a, b.y), z: apply(a, b.z) };
}

export function rotX(t: number): Basis {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: v3(1, 0, 0), y: v3(0, c, s), z: v3(0, -s, c) };
}

export function rotY(t: number): Basis {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: v3(c, 0, -s), y: v3(0, 1, 0), z: v3(s, 0, c) };
}

export function rotZ(t: number): Basis {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: v3(c, s, 0), y: v3(-s, c, 0), z: v3(0, 0, 1) };
}

/** A basis whose local -y (a hanging limb) points along d, with local -z as close to fwd as possible. */
function limbBasis(d: Vec3, fwd: Vec3): Basis {
  const y = scale(normalize(d), -1);
  let z = scale(fwd, -1);
  z = sub(z, scale(y, dot(z, y)));
  if (len(z) < 1e-6) z = Math.abs(y.x) < 0.9 ? v3(1, 0, 0) : v3(0, 0, 1);
  z = normalize(z);
  return { x: cross(y, z), y, z };
}

const vec = (a: [number, number, number]): Vec3 => v3(a[0], a[1], a[2]);
const smooth = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

// ---------------------------------------------------------------- the pose

/** Wind-up timing: the arm rises for the first part, then sweeps to the target by the strike tick. */
export const WINDUP_RAISE = 0.75;

/**
 * The single source of truth for the Titan's body. Pure: the same input always gives the same pose.
 */
export function titanPose(inp: TitanPoseInput): TitanPose {
  const h = inp.h;
  const n = PARTS.length;
  const local: Basis[] = new Array<Basis>(n).fill(IDENTITY);
  const worldOverride: (Basis | null)[] = new Array<Basis | null>(n).fill(null);

  // Walk cycle.
  const s = Math.sin(inp.gait);
  const c = Math.cos(inp.gait);
  const a = clamp(inp.stride, 0, 1);
  local[PART.thighL] = rotX(s * 0.42 * a);
  local[PART.thighR] = rotX(-s * 0.42 * a);
  local[PART.shinL] = rotX(-Math.max(0, -c) * 0.7 * a - 0.04);
  local[PART.shinR] = rotX(-Math.max(0, c) * 0.7 * a - 0.04);
  local[PART.upperarmL] = mul(rotZ(-0.06), rotX(-s * 0.3 * a));
  local[PART.upperarmR] = mul(rotZ(0.06), rotX(s * 0.3 * a));
  local[PART.forearmL] = rotX(0.12 + 0.12 * a);
  local[PART.forearmR] = rotX(0.12 + 0.12 * a);
  const bob = (Math.abs(c) - 0.6) * 0.012 * a;
  let spinePitch = -inp.lean - 0.05;
  let spineRoll = s * 0.03 * a;
  let headPitch = clamp(inp.lookPitch, -0.6, 0.7);
  let headYaw = clamp(inp.lookYaw, -1.2, 1.2);
  let rootFall = 0;

  const t = clamp(inp.actionT, 0, 1);
  if (inp.action === 'flinch') {
    const k = Math.sin(Math.PI * t);
    spinePitch += 0.35 * k;
    headPitch += 0.35 * k;
    local[PART.upperarmL] = mul(local[PART.upperarmL]!, rotX(0.5 * k));
    local[PART.upperarmR] = mul(local[PART.upperarmR]!, rotX(0.5 * k));
  } else if (inp.action === 'collapse') {
    // Stagger, then fall forward onto the face with the knees buckling.
    const stagger = Math.sin(clamp(t / 0.3, 0, 1) * Math.PI);
    const fall = smooth((t - 0.25) / 0.75);
    spinePitch += 0.25 * stagger - 0.2 * fall;
    spineRoll += 0.12 * stagger;
    headPitch = lerp(headPitch, -0.5, smooth(t / 0.3));
    headYaw *= 1 - smooth(t / 0.3);
    rootFall = 1.3 * fall;
    local[PART.thighL] = rotX(0.9 * fall);
    local[PART.thighR] = rotX(0.75 * fall);
    local[PART.shinL] = rotX(-1.2 * fall);
    local[PART.shinR] = rotX(-1.0 * fall);
    local[PART.upperarmL] = mul(rotZ(-0.06 - 0.3 * stagger), rotX(1.6 * fall));
    local[PART.upperarmR] = mul(rotZ(0.06 + 0.3 * stagger), rotX(1.4 * fall));
  }

  local[PART.spine] = mul(rotX(spinePitch), rotZ(spineRoll));
  local[PART.neck] = rotX(headPitch * 0.3);
  local[PART.head] = mul(rotY(headYaw), rotX(headPitch * 0.7));

  // Root: yaw, then the collapse falls forward about the feet.
  const rootRot = mul(rotY(inp.yaw), rotX(-rootFall));
  const feet = v3(inp.x, 0, inp.z);
  const pelvisRest = vec(PARTS[0]!.joint);

  const pos: Vec3[] = new Array<Vec3>(n);
  const rot: Basis[] = new Array<Basis>(n);
  pos[0] = add(feet, apply(rootRot, v3(0, (pelvisRest.y + bob) * h, 0)));
  rot[0] = rootRot;

  const body = (i: number): void => {
    const d = PARTS[i]!;
    const p = d.parent;
    const off = sub(vec(d.joint), vec(PARTS[p]!.joint));
    pos[i] = add(pos[p]!, scale(apply(rot[p]!, off), h));
    rot[i] = worldOverride[i] ?? mul(rot[p]!, local[i]!);
  };

  // Torso and head first; the grabbing arm may lean the spine, so solve it before posing the arms.
  const grabbing = inp.action === 'windup' || inp.action === 'strike' || inp.action === 'hold' || inp.action === 'recover';
  if (grabbing) {
    const target = vec(inp.target);
    const shoulderRest = vec(PARTS[inp.arm === 'L' ? PART.upperarmL : PART.upperarmR]!.joint);
    const roughShoulder = add(feet, apply(rootRot, scale(shoulderRest, h)));
    const reachNeed = len(sub(target, roughShoulder)) / h;
    const w = armWeight(inp.action, t);
    const lean = clamp((reachNeed - 0.42) / 0.2, 0, 1) * 0.55 * w;
    local[PART.spine] = mul(rotX(spinePitch - lean), rotZ(spineRoll));
  }
  body(PART.spine);
  body(PART.neck);
  body(PART.head);
  for (const i of [PART.thighL, PART.shinL, PART.thighR, PART.shinR]) body(i);

  const fwd = lookDir(inp.yaw, 0);
  for (const side of ['L', 'R'] as const) {
    const ua = side === 'L' ? PART.upperarmL : PART.upperarmR;
    const fa = side === 'L' ? PART.forearmL : PART.forearmR;
    const hd = side === 'L' ? PART.handL : PART.handR;
    if (grabbing && inp.arm === side) {
      body(ua);
      const shoulder = pos[ua]!;
      const target = armTarget(inp, t, shoulder, side, rot[PART.spine]!);
      const outward = scale(rightOf(inp.yaw), side === 'L' ? -1 : 1);
      const pole = normalize(add(add(scale(outward, 0.8), v3(0, -0.6, 0)), scale(fwd, -0.3)));
      const { d1, d2 } = twoBoneIk(shoulder, target, UPPER * h, FORE * h, pole);
      const toTarget = normalize(sub(target, shoulder));
      worldOverride[ua] = limbBasis(d1, toTarget);
      worldOverride[fa] = limbBasis(d2, toTarget);
      worldOverride[hd] = limbBasis(d2, toTarget);
      rot[ua] = worldOverride[ua]!;
    } else {
      body(ua);
    }
    body(fa);
    body(hd);
  }

  const capsules: Capsule[] = PARTS.map((d, i) => ({
    a: add(pos[i]!, scale(apply(rot[i]!, vec(d.a)), h)),
    b: add(pos[i]!, scale(apply(rot[i]!, vec(d.b)), h)),
    r: d.r * h,
  }));
  const napeOff = sub(vec(NAPE.pos), vec(PARTS[NAPE.parent]!.joint));
  const nape = { c: add(pos[NAPE.parent]!, scale(apply(rot[NAPE.parent]!, napeOff), h)), r: NAPE.r * h };
  const at = (i: number, p: [number, number, number]): Vec3 => add(pos[i]!, scale(apply(rot[i]!, vec(p)), h));
  return {
    pos,
    rot,
    capsules,
    nape,
    eye: at(PART.head, EYE),
    gripL: at(PART.handL, GRIP),
    gripR: at(PART.handR, GRIP),
    shoulderL: pos[PART.upperarmL]!,
    shoulderR: pos[PART.upperarmR]!,
  };
}

function armWeight(action: TitanAction, t: number): number {
  if (action === 'windup') return smooth(t / WINDUP_RAISE);
  if (action === 'recover') return 1 - smooth(t);
  return 1;
}

/** Where the grabbing hand is going this instant. */
function armTarget(inp: TitanPoseInput, t: number, shoulder: Vec3, side: 'L' | 'R', spine: Basis): Vec3 {
  const h = inp.h;
  const outward = side === 'L' ? -1 : 1;
  const rest = add(shoulder, scale(apply(spine, v3(0, -1, 0)), (UPPER + FORE) * h * 0.999));
  const cocked = add(shoulder, apply(spine, scale(v3(0.14 * outward, 0.3, 0.1), h)));
  const target = vec(inp.target);
  switch (inp.action) {
    case 'windup': {
      if (t < WINDUP_RAISE) return lerpV(rest, cocked, smooth(t / WINDUP_RAISE));
      return lerpV(cocked, target, smooth((t - WINDUP_RAISE) / (1 - WINDUP_RAISE)));
    }
    case 'strike':
    case 'hold':
      return target;
    case 'recover':
      return lerpV(target, rest, smooth(t));
    default:
      return rest;
  }
}

function lerpV(a: Vec3, b: Vec3, t: number): Vec3 {
  return addScaled(a, sub(b, a), t);
}

/** Analytic two-bone IK: upper and lower segment directions reaching from s toward t. */
function twoBoneIk(s: Vec3, t: Vec3, l1: number, l2: number, pole: Vec3): { d1: Vec3; d2: Vec3 } {
  const st = sub(t, s);
  const dist = clamp(len(st), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const dir = normalize(st, v3(0, -1, 0));
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  let bend = sub(pole, scale(dir, dot(pole, dir)));
  if (len(bend) < 1e-6) bend = Math.abs(dir.y) < 0.9 ? v3(0, -1, 0) : v3(1, 0, 0);
  bend = normalize(sub(bend, scale(dir, dot(bend, dir))));
  const d1 = normalize(add(scale(dir, cosA), scale(bend, sinA)));
  const elbow = addScaled(s, d1, l1);
  const reach = addScaled(s, dir, dist);
  const d2 = normalize(sub(reach, elbow), dir);
  return { d1, d2 };
}

/** Maximum distance the grabbing hand can reach from the shoulder, with the lean (heights). */
export const ARM_REACH = UPPER + FORE;

// ---------------------------------------------------------------- geometry queries

/** Closest point on segment ab to p. */
export function closestOnSegment(a: Vec3, b: Vec3, p: Vec3): Vec3 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return a;
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1);
  return addScaled(a, ab, t);
}

/** Sphere against capsule: push-out normal and depth, or null. */
export function sphereCapsule(c: Vec3, r: number, cap: Capsule): { normal: Vec3; depth: number } | null {
  const q = closestOnSegment(cap.a, cap.b, c);
  const d = sub(c, q);
  const dl = len(d);
  const rr = r + cap.r;
  if (dl >= rr) return null;
  const normal = dl > 1e-9 ? scale(d, 1 / dl) : v3(0, 1, 0);
  return { normal, depth: rr - dl };
}

/** Ray against capsule (unit dir). Returns the entry distance or null. Origin inside counts as no hit. */
export function rayCapsule(o: Vec3, d: Vec3, cap: Capsule, maxT: number): number | null {
  // Infinite cylinder, then the two end spheres; keep the nearest valid entry.
  let best: number | null = null;
  const ab = sub(cap.b, cap.a);
  const abl = len(ab);
  if (abl > 1e-9) {
    const axis = scale(ab, 1 / abl);
    const ao = sub(o, cap.a);
    const dPerp = sub(d, scale(axis, dot(d, axis)));
    const oPerp = sub(ao, scale(axis, dot(ao, axis)));
    const A = dot(dPerp, dPerp);
    const B = 2 * dot(dPerp, oPerp);
    const C = dot(oPerp, oPerp) - cap.r * cap.r;
    if (A > 1e-12) {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const tt = (-B - Math.sqrt(disc)) / (2 * A);
        if (tt >= 0 && tt <= maxT) {
          const along = dot(addScaled(ao, d, tt), axis);
          if (along >= 0 && along <= abl) best = tt;
        }
      }
    }
  }
  for (const end of [cap.a, cap.b]) {
    const oc = sub(o, end);
    const B = dot(oc, d);
    const C = dot(oc, oc) - cap.r * cap.r;
    const disc = B * B - C;
    if (disc < 0 || C < 0) continue;
    const tt = -B - Math.sqrt(disc);
    if (tt >= 0 && tt <= maxT && (best === null || tt < best)) best = tt;
  }
  return best;
}

/** A part-local point (normalized rest frame, relative to the joint) to world. */
export function partToWorld(pose: TitanPose, part: number, local: Vec3, h: number): Vec3 {
  return add(pose.pos[part]!, scale(apply(pose.rot[part]!, local), h));
}

/** A world point to part-local (normalized rest frame, relative to the joint). */
export function worldToPart(pose: TitanPose, part: number, world: Vec3, h: number): Vec3 {
  return scale(applyT(pose.rot[part]!, sub(world, pose.pos[part]!)), 1 / h);
}
