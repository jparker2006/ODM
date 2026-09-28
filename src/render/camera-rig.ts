// Third-person over-the-shoulder camera. Orientation always matches the aim exactly (so the
// crosshair is honest); position follows the ideal boom point with speed lag, never clips into
// geometry, widens FOV with speed, leans into swings and shakes on hard impacts.

import { PerspectiveCamera, Vector3, Euler, MathUtils } from 'three/webgpu';
import type { Sim, SimEvent } from '../sim/sim';
import { lookDir, rightOf, sub, len, normalize, dot, type Vec3 } from '../sim/vec';

export class CameraRig {
  readonly camera: PerspectiveCamera;
  private pos = new Vector3();
  private initialized = false;
  private roll = 0;
  private trauma = 0;
  private time = 0;
  private fov = 60;
  /** Distance the collision probe pulled the camera in (for tests and the overlay). */
  pulledIn = 0;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(60, aspect, 0.1, 6000);
    this.camera.rotation.order = 'YXZ';
  }

  snap(): void {
    this.initialized = false;
  }

  onEvents(events: SimEvent[], shakeStrength: number): void {
    for (const e of events) {
      if (e.type === 'impact') this.trauma = Math.min(1, this.trauma + (e.speed / 30) * shakeStrength);
      if (e.type === 'taut') this.trauma = Math.min(1, this.trauma + 0.12 * shakeStrength);
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
      const hit = sim.world.raycast(head, p, want + 0.4);
      if (hit) allowed = Math.min(allowed, Math.max(0.3, hit.t * dot(p, dir) - 0.35));
    }
    this.pulledIn = want - allowed;
    const cam = new Vector3(head.x + dir.x * allowed, head.y + dir.y * allowed, head.z + dir.z * allowed);


    // FOV widens with speed.
    const s = MathUtils.clamp((speed - t.fovSpeedLow) / Math.max(1e-3, t.fovSpeedHigh - t.fovSpeedLow), 0, 1);
    const targetFov = MathUtils.lerp(t.fovMin, t.fovMax, s * s * (3 - 2 * s));
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-6 * dt));

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
    const sh = this.trauma * this.trauma;
    const nx = Math.sin(this.time * 47.3) * Math.sin(this.time * 13.1);
    const ny = Math.sin(this.time * 39.7 + 1.3) * Math.sin(this.time * 17.9);
    const nz = Math.sin(this.time * 29.1 + 2.1);

    this.camera.position.copy(cam);
    this.camera.rotation.copy(new Euler(pitch + ny * sh * 0.05, yaw + nx * sh * 0.05, this.roll + nz * sh * 0.04, 'YXZ'));
    if (Math.abs(this.camera.fov - this.fov) > 1e-3) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
