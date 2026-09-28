"""Greybox Titan: a jointed block giant, normalized to 1 m tall, posed by the game per part.

Run headless from the repo root:

    blender -b --factory-startup -P tools/blender/titan.py -- --out public/assets/titan.glb

glTF space: feet at y = 0, top of the head at y = 1.0, facing -z. The Titan's left is -x.
The skeleton (part names, joints and hit capsules) is read from src/sim/titan-body.ts, which is
the single source of truth; the contract test checks the exported joints against it.

Hierarchy (flat, translations only):
    ti_root (empty at the origin)
      ti_pelvis, ti_spine, ti_neck, ti_head, ti_upperarm_L/R, ti_forearm_L/R, ti_hand_L/R,
      ti_thigh_L/R, ti_shin_L/R   (one mesh each, origin at its joint, modelled in the rest pose)
      ti_nape                     (empty at the nape target, no mesh)

The game sets each part's world matrix to translate(joint) * rotation * scale(height), so every
mesh is built around its joint in the part's rest frame and fills the part's hit capsule: what
you see is what you can hook and cut. Proportions are deliberately off: a big head with a flat
grin, a barrel chest, long arms and short legs.
"""

import os
import re
import sys

import bmesh
import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import odm_common as common  # noqa: E402

SEED = 0  # nothing random here; kept for a uniform command line
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
BODY_TS = os.path.join(ROOT, 'src', 'sim', 'titan-body.ts')

SKIN = 0
HAIR = 1
TEETH = 2
DARK = 3


# ---------------------------------------------------------------------------
# Skeleton, read from the TypeScript source of truth
# ---------------------------------------------------------------------------

def _vec(text):
    return tuple(float(v) for v in text.split(','))


def read_skeleton():
    """Parse PARTS and NAPE out of src/sim/titan-body.ts."""
    with open(BODY_TS, 'r', encoding='utf-8') as f:
        src = f.read()
    part_re = re.compile(
        r"\{\s*name:\s*'(\w+)',\s*parent:\s*(-?\d+),\s*joint:\s*\[([^\]]+)\],\s*"
        r"a:\s*\[([^\]]+)\],\s*b:\s*\[([^\]]+)\],\s*r:\s*([0-9.]+)\s*\}")
    parts = []
    for m in part_re.finditer(src):
        parts.append({
            'name': m.group(1),
            'joint': _vec(m.group(3)),
            'a': _vec(m.group(4)),
            'b': _vec(m.group(5)),
            'r': float(m.group(6)),
        })
    nape = re.search(r"NAPE\s*=\s*\{[^}]*pos:\s*\[([^\]]+)\]", src)
    if len(parts) != 14 or nape is None:
        raise SystemExit('could not read PARTS / NAPE from ' + BODY_TS)
    return parts, _vec(nape.group(1))


# ---------------------------------------------------------------------------
# Primitives (glTF-space, relative to the part joint)
# ---------------------------------------------------------------------------

def octagon(x0, x1, z0, z1, ch):
    """A chamfered rectangle in the xz plane, counter-clockwise seen from above (glTF)."""
    return [(x0 + ch, z0), (x0, z0 + ch), (x0, z1 - ch), (x0 + ch, z1),
            (x1 - ch, z1), (x1, z1 - ch), (x1, z0 + ch), (x1 - ch, z0)]


def loft(bm, rings, mat):
    """Stack chamfered rings bottom to top and close both ends.

    Each ring is (y, x0, x1, z0, z1, chamfer) in glTF space. Normals are fixed afterwards by
    recalc_face_normals, so winding here only has to be consistent.
    """
    loops = []
    for y, x0, x1, z0, z1, ch in rings:
        loops.append([bm.verts.new(common.to_blender(x, y, z)) for x, z in octagon(x0, x1, z0, z1, ch)])
    n = len(loops[0])
    for lo, hi in zip(loops, loops[1:]):
        for k in range(n):
            f = bm.faces.new((lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k]))
            f.material_index = mat
    bm.faces.new(list(reversed(loops[0]))).material_index = mat
    bm.faces.new(loops[-1]).material_index = mat


def block(bm, mn, mx, mat, ch=0.0):
    """A box (optionally chamfered on its vertical edges) from glTF-space min and max."""
    loft(bm, [(mn[1], mn[0], mx[0], mn[2], mx[2], ch), (mx[1], mn[0], mx[0], mn[2], mx[2], ch)], mat)


def ring(y, hx, z0, z1, ch):
    return (y, -hx, hx, z0, z1, ch)


def limb_rings(top, bottom, r_top, r_bottom, flare=0.8):
    """Rings for a faceted limb hanging along -y from `top` to `bottom`, tapered at both ends."""
    length = top - bottom
    e = min(0.35 * max(r_top, r_bottom), 0.2 * length)
    rings = [
        ring(bottom, r_bottom * flare, -r_bottom * flare, r_bottom * flare, r_bottom * flare * 0.4),
        ring(bottom + e, r_bottom, -r_bottom, r_bottom, r_bottom * 0.4),
        ring(top - e, r_top, -r_top, r_top, r_top * 0.4),
        ring(top, r_top * flare, -r_top * flare, r_top * flare, r_top * flare * 0.4),
    ]
    return rings


# ---------------------------------------------------------------------------
# Body parts (all coordinates relative to the part's joint)
# ---------------------------------------------------------------------------

def pelvis_shape(bm, p):
    hx = -p['a'][0] + p['r'] * 0.9
    r = p['r']
    loft(bm, [
        ring(-0.085, hx * 0.72, -r * 0.8, r * 0.8, 0.03),
        ring(-0.05, hx, -r, r, 0.035),
        ring(0.05, hx * 0.96, -r, r, 0.035),
    ], SKIN)


def spine_shape(bm, p):
    # A barrel chest: narrow waist, a sagging belly in front, broad high shoulders.
    r = p['r']
    loft(bm, [
        ring(-0.01, 0.105, -0.085, 0.08, 0.03),
        ring(0.06, 0.12, -r, 0.095, 0.035),
        ring(0.14, 0.135, -r * 1.02, r * 0.95, 0.04),
        ring(0.2, 0.14, -0.1, 0.1, 0.04),
        ring(0.235, 0.12, -0.075, 0.08, 0.035),
        ring(0.26, 0.06, -0.045, 0.05, 0.02),
    ], SKIN)
    # Shoulder caps, so the arms hang from something.
    for sx in (-1.0, 1.0):
        cx = sx * 0.145
        block(bm, (cx - 0.045, 0.17, -0.055), (cx + 0.045, 0.245, 0.055), SKIN, ch=0.018)


def neck_shape(bm, p):
    r = p['r']
    top = p['b'][1]
    loft(bm, [
        ring(-0.03, r * 1.15, -r * 1.1, r * 1.2, r * 0.45),
        ring(0.0, r, -r, r * 1.05, r * 0.4),
        ring(top + 0.02, r * 0.95, -r * 0.95, r, r * 0.4),
    ], SKIN)


def head_shape(bm, p):
    # Head skin: a faceted block around the capsule (joint-relative y 0.08 to 0.13, z -0.01, r 0.1).
    loft(bm, [
        ring(-0.03, 0.065, -0.09, 0.05, 0.02),
        ring(0.0, 0.085, -0.105, 0.075, 0.025),
        ring(0.06, 0.1, -0.11, 0.09, 0.03),
        ring(0.16, 0.1, -0.11, 0.09, 0.03),
        ring(0.205, 0.085, -0.095, 0.075, 0.03),
        ring(0.222, 0.05, -0.06, 0.04, 0.02),
    ], SKIN)
    # Hair cap over the crown and down the back, a touch proud of the skin.
    loft(bm, [
        ring(0.135, 0.106, -0.08, 0.097, 0.034),
        ring(0.17, 0.104, -0.1, 0.097, 0.034),
        ring(0.212, 0.088, -0.086, 0.08, 0.032),
        ring(0.23, 0.054, -0.05, 0.046, 0.022),
    ], HAIR)
    block(bm, (-0.1, 0.03, 0.05), (0.1, 0.15, 0.097), HAIR, ch=0.02)
    # The grin: a flat plane of teeth, far too wide for the face, its corners turned up into the
    # cheeks. A dark bite line and tooth gaps make it read as teeth from a distance.
    def face_z(x):
        """Front of the head skin at |x| (flat front, then the 45 degree chamfer)."""
        return -0.11 + max(0.0, abs(x) - 0.07)

    # Stepped segments (x0, x1, y0, y1) from the centre out; each rises and follows the face round.
    grin = [(-0.05, 0.05, 0.014, 0.05), (0.048, 0.068, 0.019, 0.056),
            (0.066, 0.082, 0.026, 0.063), (0.08, 0.094, 0.034, 0.07)]
    for n, (gx0, gx1, gy0, gy1) in enumerate(grin):
        for sx in ((1.0,) if n == 0 else (-1.0, 1.0)):
            x0, x1 = sorted((sx * gx0, sx * gx1))
            front = face_z(max(abs(x0), abs(x1))) - 0.008
            block(bm, (x0, gy0, front), (x1, gy1, face_z(min(abs(x0), abs(x1))) + 0.012), TEETH)
            ym = (gy0 + gy1) / 2.0
            block(bm, (x0, ym - 0.002, front - 0.003), (x1, ym + 0.002, front + 0.001), DARK)
            if n < 2:
                k0 = int(round(x0 / 0.0155))
                for k in range(k0, int(round(x1 / 0.0155)) + 1):
                    x = k * 0.0155
                    if x0 + 0.002 < x < x1 - 0.002:
                        block(bm, (x - 0.0015, gy0 + 0.002, front - 0.002), (x + 0.0015, gy1 - 0.002, front + 0.001), DARK)
    # Wide, lidless eyes: dark sockets, pale eyeballs and pinprick pupils.
    for sx in (-1.0, 1.0):
        ex = sx * 0.045
        block(bm, (ex - 0.026, 0.088, -0.114), (ex + 0.026, 0.122, -0.104), DARK)
        block(bm, (ex - 0.018, 0.094, -0.117), (ex + 0.018, 0.116, -0.112), TEETH)
        block(bm, (ex - 0.004, 0.101, -0.12), (ex + 0.004, 0.109, -0.116), DARK)
    # A flat nose and stub ears.
    block(bm, (-0.013, 0.058, -0.128), (0.013, 0.086, -0.105), SKIN)
    for sx in (-1.0, 1.0):
        x0, x1 = sorted((sx * 0.092, sx * 0.114))
        block(bm, (x0, 0.07, -0.02), (x1, 0.125, 0.025), SKIN, ch=0.006)


def upperarm_shape(bm, p):
    r = p['r']
    loft(bm, limb_rings(0.03, p['b'][1] - r * 0.3, r * 1.15, r)[0:4], SKIN)


def forearm_shape(bm, p):
    r = p['r']
    loft(bm, limb_rings(0.015, p['b'][1] - r * 0.3, r * 1.08, r * 0.92), SKIN)


def hand_shape(bm, p, sx):
    r = p['r']
    top = p['a'][1] + r * 0.4
    bottom = p['b'][1] - r * 0.8
    # Palm: thin across (palms face the body), deep front to back, hanging down.
    block(bm, (-0.034, bottom + 0.02, -r), (0.034, top, r * 0.9), SKIN, ch=0.012)
    # Fingers as one blunt slab, and a thumb out in front.
    block(bm, (-0.028, bottom, -r * 0.85), (0.028, bottom + 0.03, r * 0.75), SKIN, ch=0.01)
    block(bm, (-sx * 0.03 - 0.014, top - 0.07, -r - 0.028), (-sx * 0.03 + 0.014, top - 0.02, -r + 0.01), SKIN)


def thigh_shape(bm, p):
    r = p['r']
    loft(bm, limb_rings(0.025, p['b'][1] - r * 0.25, r * 1.08, r * 0.9), SKIN)


def shin_shape(bm, p, sole):
    r = p['r']
    ankle = sole + 0.06
    loft(bm, limb_rings(0.01, ankle - 0.01, r * 1.02, r * 0.82), SKIN)
    # Foot block, toes forward (-z), sole exactly on the ground.
    block(bm, (-r * 1.05, sole, -0.11), (r * 1.05, ankle, 0.045), SKIN, ch=0.012)


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def canonical_order(bm):
    """Sort verts and faces by geometry so the exported index buffer is byte-identical per run
    (same approach as mannequin.py)."""
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


def part_object(name, joint, root, build, materials):
    bm = bmesh.new()
    build(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    canonical_order(bm)
    used = sorted({f.material_index for f in bm.faces})
    remap = {m: i for i, m in enumerate(used)}
    for f in bm.faces:
        f.material_index = remap[f.material_index]
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for m in used:
        mesh.materials.append(materials[m])
    mesh.shade_flat()
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = common.to_blender(*joint)
    return obj


def main():
    out, _seed = common.parse_args(SEED)
    common.reset_scene()
    parts, nape = read_skeleton()
    materials = [
        common.make_material('mat_titan_skin', (0.80, 0.62, 0.54), roughness=0.85),
        common.make_material('mat_titan_hair', (0.16, 0.11, 0.08), roughness=0.95),
        common.make_material('mat_titan_teeth', (0.86, 0.82, 0.72), roughness=0.6),
        common.make_material('mat_titan_dark', (0.05, 0.03, 0.03), roughness=0.95),
    ]
    root = common.empty_object('ti_root')

    for p in parts:
        name = p['name']
        side = 1.0 if name.endswith('_R') else -1.0
        kind = name[3:].split('_')[0]
        if kind == 'pelvis':
            build = (lambda q: lambda bm: pelvis_shape(bm, q))(p)
        elif kind == 'spine':
            build = (lambda q: lambda bm: spine_shape(bm, q))(p)
        elif kind == 'neck':
            build = (lambda q: lambda bm: neck_shape(bm, q))(p)
        elif kind == 'head':
            build = (lambda q: lambda bm: head_shape(bm, q))(p)
        elif kind == 'upperarm':
            build = (lambda q: lambda bm: upperarm_shape(bm, q))(p)
        elif kind == 'forearm':
            build = (lambda q: lambda bm: forearm_shape(bm, q))(p)
        elif kind == 'hand':
            build = (lambda q, s: lambda bm: hand_shape(bm, q, s))(p, side)
        elif kind == 'thigh':
            build = (lambda q: lambda bm: thigh_shape(bm, q))(p)
        elif kind == 'shin':
            build = (lambda q: lambda bm: shin_shape(bm, q, -q['joint'][1]))(p)
        else:
            raise SystemExit('no shape for part ' + name)
        part_object(name, p['joint'], root, build, materials)

    marker = common.empty_object('ti_nape', parent=root, location=common.to_blender(*nape))
    marker.matrix_parent_inverse = Matrix.Identity(4)
    marker.location = common.to_blender(*nape)

    common.export_glb(out)
    tris = 0
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            tris += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print('ODM titan: %d parts, %d triangles' % (len(parts), tris))
    print('  wrote %s (%d bytes)' % (out, os.path.getsize(out)))


main()
