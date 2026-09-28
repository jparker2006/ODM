// Render meshes for the world: the Blender district GLB (materials swapped for greybox grid
// materials), or fixture boxes built on the fly for scenario test worlds.

import { Group, Mesh, BoxGeometry, type Material, type Object3D } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldBox } from '../sim/world';
import { greyboxMaterial, PALETTE } from './materials';

const cache = new Map<string, Material>();
function mat(name: string): Material {
  let m = cache.get(name);
  if (!m) {
    m = greyboxMaterial(PALETTE[name] ?? PALETTE['mat_fixture']!);
    m.name = name;
    cache.set(name, m);
  }
  return m;
}

export async function parseGlb(bytes: ArrayBuffer): Promise<Object3D> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  return gltf.scene;
}

export async function districtMesh(bytes: ArrayBuffer): Promise<Object3D> {
  const scene = await parseGlb(bytes);
  scene.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const swap = (x: Material) => mat(x.name in PALETTE ? x.name : 'mat_fixture');
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    m.receiveShadow = true;
    m.castShadow = !m.name.includes('ground');
  });
  return scene;
}

export function fixtureMesh(boxes: WorldBox[]): Object3D {
  const group = new Group();
  const byKind = new Map<string, BoxGeometry[]>();
  for (const b of boxes) {
    const sx = b.max.x - b.min.x;
    const sy = b.max.y - b.min.y;
    const sz = b.max.z - b.min.z;
    const g = new BoxGeometry(sx, sy, sz);
    g.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
    const key =
      b.kind === 'ground' ? 'mat_ground' : b.kind === 'wall' ? 'mat_wall' : b.kind === 'tower' ? 'mat_tower' : b.kind === 'supply' ? 'mat_supply' : 'mat_fixture';
    const list = byKind.get(key) ?? [];
    list.push(g);
    byKind.set(key, list);
  }
  for (const [key, list] of byKind) {
    const merged = mergeGeometries(list);
    const mesh = new Mesh(merged, mat(key));
    mesh.receiveShadow = true;
    mesh.castShadow = key !== 'mat_ground';
    group.add(mesh);
  }
  return group;
}
