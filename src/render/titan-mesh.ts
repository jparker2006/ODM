// The Titan's render model: titan.glb (one mesh per body part, each modelled around its joint in
// the rest pose), posed every frame from the same pose function the simulation uses for its hit
// capsules. What you see is what you can hook and cut.

import { Group, Matrix4, MeshStandardNodeMaterial, Color, type Object3D, type Mesh, type Material } from 'three/webgpu';
import { PARTS, type TitanPose } from '../sim/titan-body';

const SKIN: Record<string, { color: string; roughness: number }> = {
  mat_titan_skin: { color: '#c99a86', roughness: 0.85 },
  mat_titan_hair: { color: '#2a1d14', roughness: 0.95 },
  mat_titan_teeth: { color: '#e4dcc6', roughness: 0.6 },
  mat_titan_dark: { color: '#1a1210', roughness: 1 },
};

export class TitanMesh {
  readonly group = new Group();
  private parts: Object3D[] = [];
  private m = new Matrix4();

  constructor(model: Object3D) {
    const mats = new Map<string, Material>();
    const matFor = (src: Material): Material => {
      const spec = SKIN[src.name] ?? SKIN['mat_titan_skin']!;
      let m = mats.get(src.name);
      if (!m) {
        m = new MeshStandardNodeMaterial({ color: new Color(spec.color), roughness: spec.roughness, metalness: 0 });
        m.name = src.name;
        mats.set(src.name, m);
      }
      return m;
    };
    for (const def of PARTS) {
      const node = model.getObjectByName(def.name);
      if (!node) throw new Error(`titan.glb has no ${def.name}`);
      const part = node.clone(true);
      part.matrixAutoUpdate = false;
      part.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(matFor) : matFor(mesh.material);
        mesh.frustumCulled = false;
      });
      // Children of the part node (sub-meshes) keep their local transforms; only the part is posed.
      part.position.set(0, 0, 0);
      this.parts.push(part);
      this.group.add(part);
    }
    this.group.visible = false;
  }

  /** Poses every part: translate to the joint, rotate by the part's basis, scale by height. */
  update(pose: TitanPose | null, h: number): void {
    if (!pose) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.parts.forEach((part, i) => {
      const p = pose.pos[i]!;
      const r = pose.rot[i]!;
      this.m.set(
        r.x.x * h, r.y.x * h, r.z.x * h, p.x,
        r.x.y * h, r.y.y * h, r.z.y * h, p.y,
        r.x.z * h, r.y.z * h, r.z.z * h, p.z,
        0, 0, 0, 1,
      );
      part.matrix.copy(this.m);
      part.matrixWorldNeedsUpdate = true;
    });
  }
}
