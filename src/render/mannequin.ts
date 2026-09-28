// Placeholder Levi: a jointed mannequin from tools/blender/mannequin.py, posed per movement state.
// Pose targets are joint rotations (radians) blended over time; the whole body faces the travel
// direction and leans along the cable while swinging.

import { Object3D, Quaternion, Matrix4, Vector3, MathUtils } from 'three/webgpu';
import type { Sim, Mode } from '../sim/sim';
import { lookDir, normalize, sub, len, type Vec3 } from '../sim/vec';

type Joint =
  | 'mq_spine'
  | 'mq_head'
  | 'mq_upperarm_L'
  | 'mq_forearm_L'
  | 'mq_upperarm_R'
  | 'mq_forearm_R'
  | 'mq_thigh_L'
  | 'mq_shin_L'
  | 'mq_thigh_R'
  | 'mq_shin_R';

type Pose = Partial<Record<Joint, [number, number, number]>>;

const JOINTS: Joint[] = [
  'mq_spine',
  'mq_head',
  'mq_upperarm_L',
  'mq_forearm_L',
  'mq_upperarm_R',
  'mq_forearm_R',
  'mq_thigh_L',
  'mq_shin_L',
  'mq_thigh_R',
  'mq_shin_R',
];

// Rotations are (x, y, z) Euler in each joint's local frame. The model faces -z, so a negative x
// rotation swings a limb forward and up. Arms hang down in the rest pose; z rotations lift them sideways.
const POSES: Record<'idle' | 'air' | 'swing' | 'reel' | 'wall' | 'stumble' | 'roll' | 'boost', Pose> = {
  idle: { mq_upperarm_L: [0.05, 0, -0.12], mq_upperarm_R: [0.05, 0, 0.12], mq_forearm_L: [-0.2, 0, 0], mq_forearm_R: [-0.2, 0, 0] },
  air: {
    mq_spine: [0.15, 0, 0],
    mq_upperarm_L: [-0.4, 0, -0.9],
    mq_upperarm_R: [-0.4, 0, 0.9],
    mq_forearm_L: [-0.5, 0, 0],
    mq_forearm_R: [-0.5, 0, 0],
    mq_thigh_L: [-0.5, 0, -0.08],
    mq_thigh_R: [-0.25, 0, 0.08],
    mq_shin_L: [0.9, 0, 0],
    mq_shin_R: [0.6, 0, 0],
  },
  swing: {
    mq_spine: [0.1, 0, 0],
    mq_upperarm_L: [-2.7, 0, -0.25],
    mq_upperarm_R: [-2.5, 0, 0.3],
    mq_forearm_L: [-0.25, 0, 0],
    mq_forearm_R: [-0.35, 0, 0],
    mq_thigh_L: [-0.35, 0, -0.05],
    mq_thigh_R: [-0.2, 0, 0.05],
    mq_shin_L: [0.5, 0, 0],
    mq_shin_R: [0.35, 0, 0],
  },
  reel: {
    mq_spine: [0.35, 0, 0],
    mq_head: [-0.3, 0, 0],
    mq_upperarm_L: [-1.4, 0, -0.2],
    mq_upperarm_R: [-1.4, 0, 0.2],
    mq_forearm_L: [-1.3, 0, 0],
    mq_forearm_R: [-1.3, 0, 0],
    mq_thigh_L: [-1.5, 0, -0.1],
    mq_thigh_R: [-1.4, 0, 0.1],
    mq_shin_L: [2.1, 0, 0],
    mq_shin_R: [2.0, 0, 0],
  },
  boost: {
    mq_spine: [0.5, 0, 0],
    mq_head: [-0.4, 0, 0],
    mq_upperarm_L: [0.6, 0, -0.35],
    mq_upperarm_R: [0.6, 0, 0.35],
    mq_forearm_L: [-0.2, 0, 0],
    mq_forearm_R: [-0.2, 0, 0],
    mq_thigh_L: [0.2, 0, 0],
    mq_thigh_R: [0.1, 0, 0],
    mq_shin_L: [0.4, 0, 0],
    mq_shin_R: [0.3, 0, 0],
  },
  wall: {
    mq_spine: [0.2, 0, 0],
    mq_upperarm_L: [-1.9, 0, -0.5],
    mq_upperarm_R: [-1.9, 0, 0.5],
    mq_forearm_L: [-0.6, 0, 0],
    mq_forearm_R: [-0.6, 0, 0],
    mq_thigh_L: [-1.2, 0, -0.2],
    mq_thigh_R: [-0.9, 0, 0.2],
    mq_shin_L: [1.6, 0, 0],
    mq_shin_R: [1.3, 0, 0],
  },
  stumble: {
    mq_spine: [0.8, 0, 0],
    mq_head: [-0.4, 0, 0],
    mq_upperarm_L: [-0.9, 0, -0.4],
    mq_upperarm_R: [-0.9, 0, 0.4],
    mq_forearm_L: [-0.8, 0, 0],
    mq_forearm_R: [-0.8, 0, 0],
    mq_thigh_L: [-1.3, 0, 0],
    mq_thigh_R: [-0.6, 0, 0],
    mq_shin_L: [2.0, 0, 0],
    mq_shin_R: [1.5, 0, 0],
  },
  roll: {
    mq_spine: [1.0, 0, 0],
    mq_head: [0.3, 0, 0],
    mq_upperarm_L: [-1.2, 0, -0.1],
    mq_upperarm_R: [-1.2, 0, 0.1],
    mq_forearm_L: [-1.6, 0, 0],
    mq_forearm_R: [-1.6, 0, 0],
    mq_thigh_L: [-2.0, 0, 0],
    mq_thigh_R: [-2.0, 0, 0],
    mq_shin_L: [2.3, 0, 0],
    mq_shin_R: [2.3, 0, 0],
  },
};

export type PoseName = keyof typeof POSES | 'run';

export class Mannequin {
  readonly root: Object3D;
  private joints = new Map<Joint, Object3D>();
  private rest = new Map<Joint, [number, number, number]>();
  private current = new Map<Joint, [number, number, number]>();
  private facing = new Quaternion();
  private runPhase = 0;
  private rollAngle = 0;
  pose: PoseName = 'idle';

  constructor(model: Object3D) {
    this.root = new Object3D();
    this.root.add(model);
    for (const j of JOINTS) {
      const o = model.getObjectByName(j);
      if (!o) continue;
      this.joints.set(j, o);
      this.rest.set(j, [o.rotation.x, o.rotation.y, o.rotation.z]);
      this.current.set(j, [0, 0, 0]);
    }
    model.traverse((o) => {
      o.castShadow = true;
    });
  }

  static poseFor(mode: Mode, speed: number, thrusting: boolean): PoseName {
    if (mode === 'ground') return speed > 1.2 ? 'run' : 'idle';
    if (mode === 'air') return thrusting ? 'boost' : 'air';
    return mode;
  }

  update(sim: Sim, pos: Vec3, vel: Vec3, dt: number): void {
    const speed = len(vel);
    this.pose = Mannequin.poseFor(sim.mode, len({ x: vel.x, y: 0, z: vel.z }), sim.thrusting);
    this.root.position.set(pos.x, pos.y - sim.tuning.bodyHeight / 2, pos.z);

    // Facing: travel direction when moving, otherwise the camera.
    const hv = { x: vel.x, y: 0, z: vel.z };
    const hs = len(hv);
    const cam = lookDir(sim.yaw, 0);
    let fwd = hs > 2 ? normalize(hv) : cam;
    let up: Vec3 = { x: 0, y: 1, z: 0 };
    const taut = sim.hooks.filter((h) => h.state === 'attached' && h.taut && h.anchor);
    if (sim.mode === 'wall') {
      fwd = normalize({ x: -sim.wallNormal.x, y: 0, z: -sim.wallNormal.z });
    } else if (taut.length > 0) {
      // Hang from the cable: body up axis points at the anchors.
      let a = { x: 0, y: 0, z: 0 };
      for (const h of taut) a = { x: a.x + h.anchor!.x, y: a.y + h.anchor!.y, z: a.z + h.anchor!.z };
      a = { x: a.x / taut.length, y: a.y / taut.length, z: a.z / taut.length };
      up = normalize(sub(a, pos));
    } else if (sim.mode === 'air' && speed > 8) {
      // Lean slightly into the direction of travel.
      const v = normalize(vel);
      up = normalize({ x: v.x * 0.35, y: 1, z: v.z * 0.35 });
    }
    const upV = new Vector3(up.x, up.y, up.z);
    const back = new Vector3(-fwd.x, -fwd.y, -fwd.z);
    back.sub(upV.clone().multiplyScalar(back.dot(upV)));
    if (back.lengthSq() < 1e-6) back.set(-cam.x, 0, -cam.z);
    back.normalize();
    const right = new Vector3().crossVectors(upV, back).normalize();
    const target = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, upV, back));
    this.facing.slerp(target, 1 - Math.exp(-10 * dt));
    this.root.quaternion.copy(this.facing);

    // Roll: tumble forward about the body's right axis.
    if (this.pose === 'roll') this.rollAngle += dt * 9;
    else this.rollAngle = 0;
    if (this.rollAngle > 0) {
      const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -this.rollAngle);
      this.root.quaternion.multiply(q);
    }

    // Joint targets.
    let target2: Pose;
    if (this.pose === 'run') {
      this.runPhase += dt * Math.max(6, hs * 1.3);
      const s = Math.sin(this.runPhase);
      const c = Math.cos(this.runPhase);
      target2 = {
        mq_spine: [0.12, 0, 0],
        mq_thigh_L: [-0.8 * s, 0, 0],
        mq_thigh_R: [0.8 * s, 0, 0],
        mq_shin_L: [0.6 + 0.6 * Math.max(0, c), 0, 0],
        mq_shin_R: [0.6 + 0.6 * Math.max(0, -c), 0, 0],
        mq_upperarm_L: [0.7 * s, 0, -0.15],
        mq_upperarm_R: [-0.7 * s, 0, 0.15],
        mq_forearm_L: [-1.1, 0, 0],
        mq_forearm_R: [-1.1, 0, 0],
      };
    } else {
      target2 = POSES[this.pose];
    }
    const k = 1 - Math.exp(-(this.pose === 'run' ? 30 : 12) * dt);
    for (const j of JOINTS) {
      const o = this.joints.get(j);
      if (!o) continue;
      const rest = this.rest.get(j)!;
      const cur = this.current.get(j)!;
      const tg = target2[j] ?? [0, 0, 0];
      for (let i = 0; i < 3; i++) cur[i] = MathUtils.lerp(cur[i]!, tg[i]!, k);
      o.rotation.set(rest[0] + cur[0]!, rest[1] + cur[1]!, rest[2] + cur[2]!);
    }
  }
}
