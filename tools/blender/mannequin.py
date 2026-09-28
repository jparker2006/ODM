"""Placeholder mannequin for Levi: 1.60 m, built from primitives, posable by node rotation.

Run headless from the repo root:

    blender -b --factory-startup -P tools/blender/mannequin.py -- --out public/assets/mannequin.glb

glTF space: feet at y = 0, head top at y = 1.60, facing -z (three.js forward). The character's
left is -x, so every *_L part sits at -x. Each part is its own node with its origin at its
pivot joint, so the game poses the figure by rotating nodes. Rest pose: arms hang down.

Hierarchy (glTF node names):
    mq_root (empty at the pelvis, y = 0.90)
      mq_pelvis
        mq_spine > mq_head
        mq_spine > mq_upperarm_L > mq_forearm_L > mq_hand_L   (and _R)
        mq_thigh_L > mq_shin_L > mq_foot_L                    (and _R)
        mq_launcher_L, mq_launcher_R, mq_gas_tank
"""

import os
import sys

import bmesh
import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import odm_common as common  # noqa: E402

SEED = 0  # nothing random here; kept for a uniform command line


def box(bm, mn, mx):
    """Axis-aligned box from glTF-space local min and max."""
    cx, cy, cz = [(a + b) / 2.0 for a, b in zip(mn, mx)]
    sx, sy, sz = [b - a for a, b in zip(mn, mx)]
    geom = bmesh.ops.create_cube(bm, size=1.0)
    verts = geom['verts']
    bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=verts)
    bmesh.ops.translate(bm, vec=common.to_blender(cx, cy, cz), verts=verts)


def limb(bm, y_top, y_bottom, r, segments=8):
    """Capsule-ish limb along glTF y: a cylinder with narrowed chamfer rings at both ends."""
    length = y_top - y_bottom
    ch = min(r * 0.5, length * 0.2)
    geom = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                                 radius1=r, radius2=r, depth=length - 2.0 * ch)
    bmesh.ops.translate(bm, vec=(0.0, 0.0, (y_top + y_bottom) / 2.0), verts=geom['verts'])
    for y_cap, y_ring in ((y_top, y_top - ch), (y_bottom, y_bottom + ch)):
        cap = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                                    radius1=r * 0.6 if y_cap < y_ring else r,
                                    radius2=r if y_cap < y_ring else r * 0.6, depth=ch)
        bmesh.ops.translate(bm, vec=(0.0, 0.0, (y_cap + y_ring) / 2.0), verts=cap['verts'])


def head_shape(bm):
    geom = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
    bmesh.ops.scale(bm, vec=(0.09, 0.10, 0.11), verts=geom['verts'])
    bmesh.ops.translate(bm, vec=common.to_blender(0.0, 0.09, 0.0), verts=geom['verts'])
    # Nose so the facing direction (-z) reads at a glance.
    box(bm, (-0.012, 0.06, -0.115), (0.012, 0.10, -0.085))


def canonical_order(bm):
    """Sort verts and faces by geometry. Some bmesh ops (the UV sphere) emit faces in an order
    that varies between runs, which reorders the exported index buffer; sorting makes the
    output byte-identical."""
    def vkey(v):
        centres = sorted(tuple(round(c, 5) for c in f.calc_center_median()) for f in v.link_faces)
        return (round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5), centres)

    bm.verts.index_update()
    order = sorted(bm.verts, key=vkey)
    rank = {v.index: i for i, v in enumerate(order)}
    bm.verts.sort(key=lambda v: rank[v.index])
    bm.verts.index_update()

    def fkey(f):
        idx = [v.index for v in f.verts]
        k = idx.index(min(idx))
        return tuple(idx[k:] + idx[:k])

    bm.faces.index_update()
    order = sorted(bm.faces, key=fkey)
    rank = {f.index: i for i, f in enumerate(order)}
    bm.faces.sort(key=lambda f: rank[f.index])
    bm.faces.index_update()


def part(name, pivot, parent_obj, parent_pivot, build, mat):
    bm = bmesh.new()
    build(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    canonical_order(bm)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    mesh.shade_flat()
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    local = [p - q for p, q in zip(pivot, parent_pivot)]
    obj.parent = parent_obj
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = common.to_blender(*local)
    return obj


def main():
    out, _seed = common.parse_args(SEED)
    common.reset_scene()
    body = common.make_material('mat_body', (0.45, 0.45, 0.46), roughness=0.7)
    gear = common.make_material('mat_gear', (0.10, 0.10, 0.11), roughness=0.35, metallic=0.85)

    p_root = (0.0, 0.90, 0.0)
    root = common.empty_object('mq_root', location=common.to_blender(*p_root))

    pelvis = part('mq_pelvis', p_root, root, p_root,
                  lambda bm: box(bm, (-0.15, -0.10, -0.09), (0.15, 0.08, 0.09)), body)

    p_spine = (0.0, 0.98, 0.0)

    def spine_shape(bm):
        box(bm, (-0.13, -0.01, -0.08), (0.13, 0.15, 0.08))
        box(bm, (-0.18, 0.13, -0.10), (0.18, 0.34, 0.10))
        limb(bm, 0.44, 0.32, 0.05)

    spine = part('mq_spine', p_spine, pelvis, p_root, spine_shape, body)
    p_head = (0.0, 1.40, 0.0)
    part('mq_head', p_head, spine, p_spine, head_shape, body)

    for side, sx in (('L', -1.0), ('R', 1.0)):
        p_sh = (sx * 0.22, 1.30, 0.0)
        p_el = (sx * 0.22, 1.02, 0.0)
        p_wr = (sx * 0.22, 0.77, 0.0)
        ua = part('mq_upperarm_' + side, p_sh, spine, p_spine,
                  lambda bm: limb(bm, 0.02, -0.28, 0.045), body)
        fa = part('mq_forearm_' + side, p_el, ua, p_sh,
                  lambda bm: limb(bm, 0.0, -0.25, 0.04), body)
        part('mq_hand_' + side, p_wr, fa, p_el,
             lambda bm: box(bm, (-0.025, -0.17, -0.045), (0.025, 0.0, 0.045)), body)

        p_hip = (sx * 0.095, 0.86, 0.0)
        p_kn = (sx * 0.095, 0.46, 0.0)
        p_an = (sx * 0.095, 0.08, 0.0)
        th = part('mq_thigh_' + side, p_hip, pelvis, p_root,
                  lambda bm: limb(bm, 0.02, -0.40, 0.07), body)
        sh = part('mq_shin_' + side, p_kn, th, p_hip,
                  lambda bm: limb(bm, 0.0, -0.38, 0.055), body)
        part('mq_foot_' + side, p_an, sh, p_kn,
             lambda bm: box(bm, (-0.045, -0.08, -0.18), (0.045, 0.02, 0.06)), body)

        part('mq_launcher_' + side, (sx * 0.215, 0.88, 0.0), pelvis, p_root,
             lambda bm: box(bm, (-0.035, -0.05, -0.08), (0.035, 0.05, 0.08)), gear)

    part('mq_gas_tank', (0.0, 0.95, 0.14), pelvis, p_root,
         lambda bm: box(bm, (-0.14, -0.08, -0.05), (0.14, 0.08, 0.05)), gear)

    common.export_glb(out)
    tris = 0
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            tris += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print('ODM mannequin: %d parts, %d triangles' % (len(bpy.data.objects), tris))
    print('  wrote %s (%d bytes)' % (out, os.path.getsize(out)))


main()
