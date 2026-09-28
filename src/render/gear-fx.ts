// ODM gear visuals for Milestone 1: steel cable lines, hook tips, and simple gas puffs.

import {
  Group,
  Mesh,
  CylinderGeometry,
  BoxGeometry,
  SphereGeometry,
  MeshStandardNodeMaterial,
  InstancedMesh,
  Object3D,
  Vector3,
  Quaternion,
  Color,
  DynamicDrawUsage,
} from 'three/webgpu';
import type { Sim } from '../sim/sim';
import { lookDir, type Vec3 } from '../sim/vec';

const PUFFS = 64;
const UP = new Vector3(0, 1, 0);

export class GearFx {
  readonly group = new Group();
  private cables: Mesh[] = [];
  private tips: Mesh[] = [];
  private puffs: InstancedMesh;
  private puffState: { p: Vector3; v: Vector3; age: number; life: number; size: number }[] = [];
  private next = 0;
  private dummy = new Object3D();
  private emitAcc = 0;

  constructor() {
    const steel = new MeshStandardNodeMaterial({ color: new Color('#2b2d31'), metalness: 0.8, roughness: 0.35 });
    const cableGeo = new CylinderGeometry(0.018, 0.018, 1, 5, 1, true);
    cableGeo.translate(0, 0.5, 0);
    const tipGeo = new BoxGeometry(0.14, 0.14, 0.3);
    for (let i = 0; i < 2; i++) {
      const c = new Mesh(cableGeo, steel);
      c.frustumCulled = false;
      c.visible = false;
      const t = new Mesh(tipGeo, steel);
      t.visible = false;
      this.cables.push(c);
      this.tips.push(t);
      this.group.add(c, t);
    }
    const puffMat = new MeshStandardNodeMaterial({ color: new Color('#f2f2f2'), roughness: 1, metalness: 0 });
    this.puffs = new InstancedMesh(new SphereGeometry(1, 8, 6), puffMat, PUFFS);
    this.puffs.instanceMatrix.setUsage(DynamicDrawUsage);
    this.puffs.frustumCulled = false;
    for (let i = 0; i < PUFFS; i++) {
      this.puffState.push({ p: new Vector3(), v: new Vector3(), age: 1, life: 1, size: 0 });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.puffs.setMatrixAt(i, this.dummy.matrix);
    }
    this.group.add(this.puffs);
  }

  /** Makes every effect visible once so its pipeline compiles during prewarm. */
  showAllForPrewarm(at: Vec3): void {
    for (let i = 0; i < 2; i++) {
      this.cables[i]!.visible = true;
      this.cables[i]!.position.set(at.x, at.y, at.z);
      this.tips[i]!.visible = true;
      this.tips[i]!.position.set(at.x, at.y + 1, at.z);
    }
    this.emit(new Vector3(at.x, at.y, at.z), new Vector3(0, 1, 0), 0.5);
  }

  private emit(p: Vector3, v: Vector3, size: number): void {
    const s = this.puffState[this.next]!;
    this.next = (this.next + 1) % PUFFS;
    s.p.copy(p);
    s.v.copy(v);
    s.age = 0;
    s.life = 0.45;
    s.size = size;
  }

  update(sim: Sim, pos: Vec3, dt: number, burst: boolean): void {
    sim.hooks.forEach((h, i) => {
      const cable = this.cables[i]!;
      const tip = this.tips[i]!;
      const from = sim.launcher(h.side);
      // Interpolated body position: shift the launcher by the difference.
      const fx = from.x - sim.pos.x + pos.x;
      const fy = from.y - sim.pos.y + pos.y;
      const fz = from.z - sim.pos.z + pos.z;
      if (h.state === 'stowed') {
        cable.visible = false;
        tip.visible = false;
        return;
      }
      const a = new Vector3(fx, fy, fz);
      const b = new Vector3(h.tip.x, h.tip.y, h.tip.z);
      const d = b.clone().sub(a);
      const l = d.length();
      cable.visible = l > 0.05;
      tip.visible = true;
      cable.position.copy(a);
      cable.quaternion.copy(new Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
      cable.scale.set(1, Math.max(l, 0.01), 1);
      tip.position.copy(b);
      tip.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), d.clone().normalize()));
    });

    // Gas: a burst on press and a stream while thrusting or reeling, from the tank on the lower back.
    const back = lookDir(sim.yaw, 0);
    const tank = new Vector3(pos.x - back.x * 0.25, pos.y - 0.1, pos.z - back.z * 0.25);
    const vel = new Vector3(sim.vel.x, sim.vel.y, sim.vel.z);
    if (burst) for (let i = 0; i < 6; i++) this.emit(tank, vel.clone().multiplyScalar(0.3).add(new Vector3(Math.sin(i * 2.1) * 3, 1.5, Math.cos(i * 2.1) * 3)), 0.35);
    const streaming = sim.thrusting || (sim.mode === 'reel' && sim.gas > 0);
    if (streaming) {
      this.emitAcc += dt * 40;
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        this.emit(tank, vel.clone().multiplyScalar(0.2).add(new Vector3(-back.x * 4, -1, -back.z * 4)), 0.22);
      }
    } else {
      this.emitAcc = 0;
    }
    for (let i = 0; i < PUFFS; i++) {
      const s = this.puffState[i]!;
      if (s.age >= s.life) {
        this.dummy.scale.setScalar(0);
      } else {
        s.age += dt;
        s.p.addScaledVector(s.v, dt);
        s.v.multiplyScalar(Math.exp(-4 * dt));
        const k = s.age / s.life;
        this.dummy.position.copy(s.p);
        this.dummy.scale.setScalar(s.size * (0.4 + k * 1.6) * (1 - k * k));
      }
      this.dummy.updateMatrix();
      this.puffs.setMatrixAt(i, this.dummy.matrix);
    }
    this.puffs.instanceMatrix.needsUpdate = true;
  }
}
