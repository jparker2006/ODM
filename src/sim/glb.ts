// Reads the collider table out of a GLB produced by the Blender pipeline, without three.js.
// The district script stores colliders as a JSON string custom property ("odm_colliders")
// on an empty object named COLLIDERS; the glTF exporter writes it to that node's extras.

import type { WorldBox, BoxKind } from './world';

export interface GlbJson {
  asset?: { generator?: string; version?: string };
  scenes?: { name?: string; nodes?: number[]; extras?: Record<string, unknown> }[];
  nodes?: { name?: string; children?: number[]; mesh?: number; extras?: Record<string, unknown>; translation?: number[] }[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  accessors?: { count: number; type: string; componentType: number }[];
  materials?: { name?: string }[];
  animations?: { name?: string }[];
  skins?: { joints: number[] }[];
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

export function parseGlbJson(bytes: Uint8Array): GlbJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB file');
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== CHUNK_JSON) throw new Error('GLB first chunk is not JSON');
  const text = new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength));
  return JSON.parse(text) as GlbJson;
}

/** Collider record as written by tools/blender/district.py. */
export interface ColliderRecord {
  name: string;
  kind: BoxKind;
  min: [number, number, number];
  max: [number, number, number];
  anchorable: boolean;
}

export function collidersFromGlb(json: GlbJson): ColliderRecord[] {
  const node = json.nodes?.find((n) => n.name === 'COLLIDERS');
  const raw = node?.extras?.['odm_colliders'];
  if (typeof raw !== 'string') throw new Error('GLB has no COLLIDERS node with odm_colliders extras');
  return JSON.parse(raw) as ColliderRecord[];
}

export function worldBoxesFromGlb(bytes: Uint8Array): WorldBox[] {
  return collidersFromGlb(parseGlbJson(bytes)).map((c) => ({
    name: c.name,
    kind: c.kind,
    anchorable: c.anchorable,
    min: { x: c.min[0], y: c.min[1], z: c.min[2] },
    max: { x: c.max[0], y: c.max[1], z: c.max[2] },
  }));
}

/** Named markers (spawn points, route hints) stored the same way on a MARKERS node. */
export function markersFromGlb(json: GlbJson): Record<string, [number, number, number]> {
  const node = json.nodes?.find((n) => n.name === 'MARKERS');
  const raw = node?.extras?.['odm_markers'];
  if (typeof raw !== 'string') return {};
  return JSON.parse(raw) as Record<string, [number, number, number]>;
}
