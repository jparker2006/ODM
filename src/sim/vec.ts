// Minimal 3D vector math for the simulation core. Plain objects, no three.js.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const lenSq = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const horiz = (a: Vec3): Vec3 => ({ x: a.x, y: 0, z: a.z });

export function normalize(a: Vec3, fallback: Vec3 = { x: 0, y: 0, z: -1 }): Vec3 {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : clone(fallback);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Unit look direction for a yaw (radians, 0 looks down -Z, positive turns left) and pitch (positive looks up). */
export function lookDir(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** Yaw and pitch that look along a direction. */
export function yawPitchOf(d: Vec3): { yaw: number; pitch: number } {
  const n = normalize(d);
  return { yaw: Math.atan2(-n.x, -n.z), pitch: Math.asin(clamp(n.y, -1, 1)) };
}

/** Right vector for a yaw (horizontal). */
export function rightOf(yaw: number): Vec3 {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}

/** Rotate vector a about unit axis k by angle (Rodrigues). */
export function rotateAxis(a: Vec3, k: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kxa = cross(k, a);
  const kda = dot(k, a);
  return {
    x: a.x * c + kxa.x * s + k.x * kda * (1 - c),
    y: a.y * c + kxa.y * s + k.y * kda * (1 - c),
    z: a.z * c + kxa.z * s + k.z * kda * (1 - c),
  };
}

/** Any unit vector perpendicular to n. */
export function perpendicular(n: Vec3): Vec3 {
  const a = Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  return normalize(cross(n, a));
}
