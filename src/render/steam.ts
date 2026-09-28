// Steam rising from a dead Titan: a column of pale puffs from the body, reusing the gear-effects
// instanced-puff approach. It starts at the collapse and keeps going until the body is removed.

import { InstancedMesh, SphereGeometry, MeshStandardNodeMaterial, Object3D, Vector3, Color, DynamicDrawUsage } from 'three/webgpu';
import type { TitanPose } from '../sim/titan-body';

const COUNT = 220;

export class Steam {
  readonly mesh: InstancedMesh;
  private state: { p: Vector3; v: Vector3; age: number; life: number; size: number }[] = [];
  private next = 0;
  private acc = 0;
  private dummy = new Object3D();
  private seed = 1;
  /** Puffs currently alive (for the features check). */
  alive = 0;

  constructor() {
    const mat = new MeshStandardNodeMaterial({ color: new Color('#f3efe9'), roughness: 1, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false });
    this.mesh = new InstancedMesh(new SphereGeometry(1, 10, 8), mat, COUNT);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < COUNT; i++) {
      this.state.push({ p: new Vector3(), v: new Vector3(), age: 1, life: 1, size: 0 });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Makes a few puffs visible once so the pipeline compiles during prewarm. */
  prewarm(at: Vector3): void {
    for (let i = 0; i < 4; i++) this.emit(at, new Vector3(0, 1, 0), 1);
    this.update(null, 0, 1 / 60);
  }

  private emit(p: Vector3, v: Vector3, size: number): void {
    const s = this.state[this.next]!;
    this.next = (this.next + 1) % COUNT;
    s.p.copy(p);
    s.v.copy(v);
    s.age = 0;
    s.life = 2.2 + this.rand() * 1.2;
    s.size = size;
  }

  /** intensity 0 (off) to 1 (full); emits from random points along the body's capsules. */
  update(pose: TitanPose | null, intensity: number, dt: number): void {
    if (pose && intensity > 0) {
      this.acc += dt * 70 * intensity;
      while (this.acc >= 1) {
        this.acc -= 1;
        const caps = pose.capsules;
        const c = caps[Math.floor(this.rand() * caps.length)]!;
        const k = this.rand();
        const p = new Vector3(c.a.x + (c.b.x - c.a.x) * k, c.a.y + (c.b.y - c.a.y) * k, c.a.z + (c.b.z - c.a.z) * k);
        p.x += (this.rand() - 0.5) * c.r * 1.6;
        p.z += (this.rand() - 0.5) * c.r * 1.6;
        p.y += c.r * 0.6;
        const v = new Vector3((this.rand() - 0.5) * 1.2, 2.2 + this.rand() * 2.5, (this.rand() - 0.5) * 1.2);
        this.emit(p, v, 0.25 + c.r * 0.3 + this.rand() * 0.3);
      }
    } else {
      this.acc = 0;
    }
    this.alive = 0;
    for (let i = 0; i < COUNT; i++) {
      const s = this.state[i]!;
      if (s.age >= s.life) {
        this.dummy.scale.setScalar(0);
        this.dummy.position.set(0, -1000, 0);
      } else {
        this.alive++;
        s.age += dt;
        s.p.addScaledVector(s.v, dt);
        s.v.y += dt * 0.6;
        s.v.x *= Math.exp(-0.8 * dt);
        s.v.z *= Math.exp(-0.8 * dt);
        const k = s.age / s.life;
        this.dummy.position.copy(s.p);
        this.dummy.scale.setScalar(s.size * (0.5 + k * 1.6) * (1 - k * k * k));
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
