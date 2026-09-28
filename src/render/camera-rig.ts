// Third-person over-the-shoulder camera. Orientation always matches the aim exactly (so the
// crosshair is honest); position follows the ideal boom point with speed lag, never clips into
// geometry, widens FOV with speed, leans into swings and shakes on hard impacts.

import { PerspectiveCamera, Vector3, Euler, MathUtils } from 'three/webgpu';
import type { Sim, SimEvent } from '../sim/sim';
import type { Tuning } from '../sim/tuning';
import { lookDir, rightOf, sub, len, normalize, dot, type Vec3 } from '../sim/vec';

export class CameraRig {
  readonly camera: PerspectiveCamera;
  private pos = new Vector3();
  private initialized = false;
  roll = 0;
  trauma = 0;
  private time = 0;
  fov = 60;
  /** Distance the collision probe pulled the camera in (for tests and the overlay). */
  pulledIn = 0;
  /** Extra FOV from the nape-kill kick, decaying to zero. */
  kick = 0;
  /** The most recent Titan footstep: its distance and the shake it added (for the features check). */
  lastStep = { distance: 0, shake: 0 };

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(60, aspect, 0.1, 6000);
    this.camera.rotation.order = 'YXZ';
  }

  snap(): void {
    this.initialized = false;
  }

  onEvents(events: SimEvent[], t: Tuning, playerPos: Vec3): void {
    for (const e of events) {
      if (e.type === 'impact') this.trauma = Math.min(1, this.trauma + (e.speed / 20) * t.shakeImpact);
      if (e.type === 'taut') this.trauma = Math.min(1, this.trauma + 0.12 * t.shakeImpact);
      if (e.type === 'titanStep') {
        // Felt through the camera, strongest close by: the tuned strength at 20 m, falling off with distance.
        const d = Math.max(1, len(sub(e.pos, playerPos)));
        const shake = d > t.stepShakeRange ? 0 : t.stepShake * e.strength * Math.min(1.6, 20 / d) * (1 - d / t.stepShakeRange);
        this.lastStep = { distance: d, shake };
        this.trauma = Math.min(1, this.trauma + shake);
      }
      if (e.type === 'grabbed') this.trauma = Math.min(1, this.trauma + t.grabShake);
      if (e.type === 'napeKill') {
        this.trauma = Math.min(1, this.trauma + t.killKick * 0.6);
        this.kick = t.killKick * 12;
      }
    }
  }

  /** alpha interpolates between the previous and current simulation state. */
  update(sim: Sim, playerPos: Vec3, yaw: number, pitch: number, speed: number, dt: number): void {
    const t = sim.tuning;
    this.time += dt;
    const d = lookDir(yaw, pitch);
    const r = rightOf(yaw);
    const ideal = {
      x: playerPos.x + r.x * t.camShoulder - d.x * t.camDistance,
      y: playerPos.y + t.camHeight - d.y * t.camDistance,
      z: playerPos.z + r.z * t.camShoulder - d.z * t.camDistance,
    };
    // Looking up from the ground puts the boom under the floor: lift the ideal point above it
    // (before the collision probe), rather than letting the probe drag the camera into Levi's back.
    const headY = playerPos.y + t.camHeight * 0.6;
    if (ideal.y < headY) {
      const floorHit = sim.world.raycast({ x: ideal.x, y: headY, z: ideal.z }, { x: 0, y: -1, z: 0 }, headY - ideal.y + 1);
      if (floorHit && ideal.y < floorHit.point.y + 0.35) ideal.y = floorHit.point.y + 0.35;
    }
    if (!this.initialized) {
      this.pos.set(ideal.x, ideal.y, ideal.z);
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-t.camFollow * dt);
      this.pos.x += (ideal.x - this.pos.x) * k;
      this.pos.y += (ideal.y - this.pos.y) * k;
      this.pos.z += (ideal.z - this.pos.z) * k;
    }

    // Collision: probe from the head toward the camera, and from the head along several offsets.
    const head = { x: playerPos.x, y: playerPos.y + t.camHeight * 0.6, z: playerPos.z };
    const toCam = sub({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, head);
    const want = len(toCam);
    const dir = normalize(toCam);
    let allowed = want;
    const probes: Vec3[] = [dir];
    const up = { x: 0, y: 1, z: 0 };
    for (const [a, b] of [
      [0.25, 0],
      [-0.25, 0],
      [0, 0.2],
      [0, -0.2],
    ] as const) {
      probes.push(normalize({ x: dir.x + r.x * a + up.x * b, y: dir.y + r.y * a + up.y * b, z: dir.z + r.z * a + up.z * b }));
    }
    for (const p of probes) {
      const hit = sim.raycastAll(head, p, want + 0.4);
      if (hit) allowed = Math.min(allowed, Math.max(0.3, hit.t * dot(p, dir) - 0.35));
    }
    this.pulledIn = want - allowed;
    const cam = new Vector3(head.x + dir.x * allowed, head.y + dir.y * allowed, head.z + dir.z * allowed);


    // FOV widens with speed.
    const s = MathUtils.clamp((speed - t.fovSpeedLow) / Math.max(1e-3, t.fovSpeedHigh - t.fovSpeedLow), 0, 1);
    const grabbed = sim.mode === 'grabbed';
    const targetFov = MathUtils.lerp(t.fovMin, t.fovMax, s * s * (3 - 2 * s)) - (grabbed ? t.grabZoom : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-6 * dt));
    this.kick *= Math.exp(-5 * dt);
    // Held in a fist: the shake never settles.
    if (grabbed) this.trauma = Math.max(this.trauma, t.grabShake * 0.7);

    // Lean into the swing: roll toward the side the cable pulls from.
    let targetRoll = 0;
    const taut = sim.hooks.filter((h) => h.state === 'attached' && h.taut && h.anchor);
    if (taut.length > 0) {
      let side = 0;
      for (const h of taut) side += dot(normalize(sub(h.anchor!, playerPos)), r);
      targetRoll = -MathUtils.clamp(side / taut.length, -1, 1) * MathUtils.degToRad(t.camLean);
    }
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-5 * dt));

    // Shake.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * Math.sqrt(this.trauma);
    const nx = Math.sin(this.time * 47.3) * Math.sin(this.time * 13.1);
    const ny = Math.sin(this.time * 39.7 + 1.3) * Math.sin(this.time * 17.9);
    const nz = Math.sin(this.time * 29.1 + 2.1);

    this.camera.position.copy(cam);
    this.camera.rotation.copy(new Euler(pitch + ny * sh * 0.08, yaw + nx * sh * 0.08, this.roll + nz * sh * 0.05, 'YXZ'));
    const fov = this.fov + this.kick;
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
