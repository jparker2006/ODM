"""Milestone 1 greybox district: a to-scale, walled, Trost-style medieval quarter.

Run headless from the repo root:

    blender -b --factory-startup -P tools/blender/district.py -- --out public/assets/district.glb

Everything is an axis-aligned box. All layout math is done in glTF / three.js space
(y up, ground at y = 0, -z is "north"); boxes are converted to Blender space only when the
render meshes are built. Output is deterministic: one seeded random.Random, ordered lists only.

Layout
  * Interior spans x and z from -750 to 750. The Wall (50 m tall, 10 m thick) sits just
    outside it (wall_n at z in [-760, -750], wall_s at z in [750, 760], wall_e / wall_w at
    x in [750, 760] / [-760, -750]). A 12 m ring street runs along the inside of the Wall.
  * Two 20 m main avenues cross at the origin (z in [-10, 10] along x, x in [-10, 10] along z).
  * Secondary streets every 55 to 90 m, 8 to 12 m wide, both ways. Some segments jog sideways
    by 3 to 7 m and some are dropped (two blocks merge), so the grid is not perfect.
  * Central square [-40, 40] x [-40, 40] with the bell tower (9 x 9 m, 45 m) centred at (25, 25).
    Four more squares of 40 to 60 m: two with church towers, one with a watch tower, one market.
  * Blocks are filled with contiguous houses around the block edge (party walls), leaving a
    courtyard when the block is at least 28 m deep: frontage 8 to 16 m, depth 10 to 16 m,
    height 2.5 + 3.5 * storeys with 2 to 5 storeys.
  * Test street: the avenue x in [-10, 10] from z = -40 to z = -400 is lined on both sides by
    continuous 3 to 5 storey houses (13 to 20 m). Cross streets there are at most 10 m wide.

Outputs on two empties (exported as node extras):
  * COLLIDERS.odm_colliders: JSON list of {name, kind, min, max, anchorable} in glTF space.
  * MARKERS.odm_markers: JSON {name: [x, y, z]} and MARKERS.odm_spawn_yaw: radians as a string
    (0 looks toward -z).
"""

import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import odm_common as common  # noqa: E402

SEED = 1847

INTERIOR = 750.0
WALL_T = 10.0
WALL_H = 50.0
GROUND_EXT = 780.0
RING_W = 12.0
RING_C = INTERIOR - RING_W / 2.0  # 744
AVENUE_W = 20.0
SQUARE_HALF = 40.0
CHUNK = 250.0

COURTYARD_MIN = 28.0
TEST_Z0 = -400.0
TEST_Z1 = -40.0


def r3(v):
    return round(v + 0.0, 3)


# ---------------------------------------------------------------------------
# Street network
# ---------------------------------------------------------------------------

class Line:
    """A straight street at a fixed coordinate along one axis, with per-segment jogs."""

    def __init__(self, c, w, kind):
        self.c = c
        self.w = w
        self.kind = kind  # 'ring' | 'avenue' | 'street'
        self.jog = {}

    def centre(self, seg):
        return self.c + self.jog.get(seg, 0.0)


def gen_side(rng):
    """Street centres on one side of an avenue, from the avenue out to the ring street."""
    out = []
    c = rng.uniform(70.0, 90.0)
    while True:
        out.append(c)
        rem = RING_C - c
        if rem <= 95.0:
            break
        step = rng.uniform(55.0, 90.0)
        if rem - step < 55.0:
            step = rem / 2.0
        c += step
    return out


def gen_lines(rng, narrow_test_range):
    neg = gen_side(rng)
    pos = gen_side(rng)
    lines = [Line(-RING_C, RING_W, 'ring')]
    for c in reversed(neg):
        lines.append(Line(-c, 0.0, 'street'))
    lines.append(Line(0.0, AVENUE_W, 'avenue'))
    for c in pos:
        lines.append(Line(c, 0.0, 'street'))
    lines.append(Line(RING_C, RING_W, 'ring'))
    for ln in lines:
        if ln.kind != 'street':
            continue
        if narrow_test_range and TEST_Z0 - 15.0 <= ln.c <= TEST_Z1 + 15.0:
            ln.w = r3(rng.uniform(8.0, 10.0))
        else:
            ln.w = r3(rng.uniform(8.0, 12.0))
    return lines


def add_jogs(rng, lines, nseg):
    for ln in lines:
        if ln.kind != 'street':
            continue
        for s in range(nseg):
            if rng.random() < 0.18:
                sign = -1.0 if rng.random() < 0.5 else 1.0
                ln.jog[s] = r3(sign * rng.uniform(3.0, 7.0))


# ---------------------------------------------------------------------------
# Block filling
# ---------------------------------------------------------------------------

def split_len(rng, length, lo=8.0, hi=16.0):
    """Split a frontage run into house widths in [lo, hi] (a run shorter than lo stays whole)."""
    if length <= hi:
        return [length]
    nmin = int(math.ceil(length / hi))
    nmax = max(nmin, int(math.floor(length / lo)))
    n = int(round(length / rng.uniform(10.0, 14.0)))
    n = min(max(n, nmin), nmax)
    for _ in range(20):
        ws = [rng.uniform(0.7, 1.3) for _ in range(n)]
        s = sum(ws)
        ws = [w * length / s for w in ws]
        if all(lo <= w <= hi for w in ws):
            return ws
    return [length / n] * n


def cuts(rng, a, b):
    """Cut positions from a to b (inclusive), rounded once so neighbours share exact walls."""
    ws = split_len(rng, b - a)
    pts = [a]
    acc = a
    for w in ws[:-1]:
        acc += w
        pts.append(r3(acc))
    pts.append(b)
    return pts


def run_x(rng, x0, x1, z0, z1):
    """A row of houses along x (frontages split along x), each spanning z0..z1."""
    p = cuts(rng, x0, x1)
    return [(p[i], p[i + 1], z0, z1) for i in range(len(p) - 1)]


def run_z(rng, x0, x1, z0, z1):
    p = cuts(rng, z0, z1)
    return [(x0, x1, p[i], p[i + 1]) for i in range(len(p) - 1)]


def depth_pair(rng, span):
    top = min(16.0, (span - 6.0) / 2.0)
    return r3(rng.uniform(10.0, top)), r3(rng.uniform(10.0, top))


def fill_rect(rng, rect):
    """Footprints (x0, x1, z0, z1) of houses filling one rectangular block."""
    x0, x1, z0, z1 = rect
    w = x1 - x0
    d = z1 - z0
    if w <= 0.5 or d <= 0.5:
        return []
    if w >= COURTYARD_MIN and d >= COURTYARD_MIN:
        # Perimeter ring with a courtyard. The two z-edge rows own the corners.
        ds, dn = depth_pair(rng, d)
        dw, de = depth_pair(rng, w)
        za = r3(z0 + ds)
        zb = r3(z1 - dn)
        out = []
        out += run_x(rng, x0, x1, z0, za)
        out += run_x(rng, x0, x1, zb, z1)
        out += run_z(rng, x0, r3(x0 + dw), za, zb)
        out += run_z(rng, r3(x1 - de), x1, za, zb)
        return out
    if w < COURTYARD_MIN and d >= w:
        if w >= 20.0:
            xm = r3(x0 + w / 2.0 + rng.uniform(-1.5, 1.5))
            return run_z(rng, x0, xm, z0, z1) + run_z(rng, xm, x1, z0, z1)
        return run_z(rng, x0, x1, z0, z1)
    if d >= 20.0:
        zm = r3(z0 + d / 2.0 + rng.uniform(-1.5, 1.5))
        return run_x(rng, x0, x1, z0, zm) + run_x(rng, x0, x1, zm, z1)
    return run_x(rng, x0, x1, z0, z1)


STOREY_WEIGHTS = {
    'core': [0.10, 0.30, 0.35, 0.25],
    'mid': [0.20, 0.35, 0.30, 0.15],
    'outer': [0.35, 0.40, 0.20, 0.05],
    'test': [0.0, 0.35, 0.35, 0.30],
}


def pick_storeys(rng, zone):
    wts = STOREY_WEIGHTS[zone]
    r = rng.random() * sum(wts)
    acc = 0.0
    for i, wt in enumerate(wts):
        acc += wt
        if r < acc and wt > 0.0:
            return i + 2
    return 5


def zone_for(fp):
    x0, x1, z0, z1 = fp
    on_avenue = abs(x1 + 10.0) < 1e-6 or abs(x0 - 10.0) < 1e-6
    if on_avenue and z1 > TEST_Z0 - 20.0 and z0 < TEST_Z1 + 1.0:
        return 'test'
    cx = (x0 + x1) / 2.0
    cz = (z0 + z1) / 2.0
    r = max(abs(cx), abs(cz))
    if r < 300.0:
        return 'core'
    if r < 560.0:
        return 'mid'
    return 'outer'


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

def carve_corner(rng, rect, corner, size_range=(40.0, 60.0)):
    """Carve a square out of one corner of a block. Returns (square, remainder_rects)."""
    x0, x1, z0, z1 = rect
    w = x1 - x0
    d = z1 - z0

    def span(extent):
        if extent <= size_range[1] + 2.0:
            return extent
        return r3(rng.uniform(size_range[0], min(size_range[1], extent - 12.0)))

    sx = span(w)
    sz = span(d)
    cxs, czs = corner
    qx0, qx1 = (x0, r3(x0 + sx)) if cxs == 0 else (r3(x1 - sx), x1)
    qz0, qz1 = (z0, r3(z0 + sz)) if czs == 0 else (r3(z1 - sz), z1)
    rest = []
    # Strip across the full x width on the far z side, then the side strip beside the square.
    if sz < d:
        rest.append((x0, x1, qz1, z1) if czs == 0 else (x0, x1, z0, qz0))
    if sx < w:
        rest.append((qx1, x1, qz0, qz1) if cxs == 0 else (x0, qx0, qz0, qz1))
    return (qx0, qx1, qz0, qz1), rest


def build_layout(seed):
    rng = random.Random(seed)
    xl = gen_lines(rng, narrow_test_range=False)
    zl = gen_lines(rng, narrow_test_range=True)
    nx = len(xl) - 1
    nz = len(zl) - 1
    add_jogs(rng, xl, nz)
    add_jogs(rng, zl, nx)
    ax = next(i for i, ln in enumerate(xl) if ln.kind == 'avenue')
    az = next(i for i, ln in enumerate(zl) if ln.kind == 'avenue')

    def cell_rect(i, j):
        x0 = xl[i].centre(j) + xl[i].w / 2.0
        x1 = xl[i + 1].centre(j) - xl[i + 1].w / 2.0
        z0 = zl[j].centre(i) + zl[j].w / 2.0
        z1 = zl[j + 1].centre(i) - zl[j + 1].w / 2.0
        return (r3(x0), r3(x1), r3(z0), r3(z1))

    def protected(i, j):
        return i in (ax - 1, ax) or j in (az - 1, az)

    cells = [(i, j) for j in range(nz) for i in range(nx)]
    rects = {c: [cell_rect(*c)] for c in cells}
    used = set()
    squares = []
    towers = []

    # Central square and bell tower. The four cells around the origin lose their inner corner.
    for (i, j) in [(ax - 1, az - 1), (ax, az - 1), (ax - 1, az), (ax, az)]:
        rx0, rx1, rz0, rz1 = rects[(i, j)][0]
        cxs = 1 if i == ax - 1 else 0
        czs = 1 if j == az - 1 else 0
        sx = rx1 - rx0 - (SQUARE_HALF - AVENUE_W / 2.0)
        sz = rz1 - rz0 - (SQUARE_HALF - AVENUE_W / 2.0)
        # Keep the full-width strip on the far z side (it lines the avenue for the test street).
        far = (rx0, rx1, rz0, r3(rz0 + sz)) if czs == 1 else (rx0, rx1, r3(rz1 - sz), rz1)
        if cxs == 1:
            side = (rx0, r3(rx0 + sx), -SQUARE_HALF, -AVENUE_W / 2.0) if czs == 1 else \
                (rx0, r3(rx0 + sx), AVENUE_W / 2.0, SQUARE_HALF)
        else:
            side = (r3(rx1 - sx), rx1, -SQUARE_HALF, -AVENUE_W / 2.0) if czs == 1 else \
                (r3(rx1 - sx), rx1, AVENUE_W / 2.0, SQUARE_HALF)
        rects[(i, j)] = [far, side]
        used.add((i, j))
    squares.append(('square_central', (-SQUARE_HALF, SQUARE_HALF, -SQUARE_HALF, SQUARE_HALF)))
    towers.append(('tower_bell', (20.5, 29.5, 20.5, 29.5), 45.0))

    # Outer squares, placed at fixed targets so they stay off the test street and perf route.
    targets = [
        ('square_church_1', (-380.0, 330.0), 'tower_church_1'),
        ('square_church_2', (380.0, -330.0), 'tower_church_2'),
        ('square_watch', (-400.0, -420.0), 'tower_watch_1'),
        ('square_market', (520.0, 250.0), None),
    ]
    for sq_name, (tx, tz), tower_name in targets:
        best = None
        for c in cells:
            if c in used or protected(*c):
                continue
            if any(abs(c[0] - u[0]) <= 1 and abs(c[1] - u[1]) <= 1 for u in used if u not in (
                    (ax - 1, az - 1), (ax, az - 1), (ax - 1, az), (ax, az))):
                continue
            x0, x1, z0, z1 = rects[c][0]
            if not (43.0 <= x1 - x0 <= 80.0 and 43.0 <= z1 - z0 <= 80.0):
                continue
            dist = math.hypot((x0 + x1) / 2.0 - tx, (z0 + z1) / 2.0 - tz)
            if best is None or dist < best[0]:
                best = (dist, c)
        c = best[1]
        corner = (rng.randrange(2), rng.randrange(2))
        sq, rest = carve_corner(rng, rects[c][0], corner)
        rects[c] = rest
        used.add(c)
        squares.append((sq_name, sq))
        if tower_name:
            qx0, qx1, qz0, qz1 = sq
            if tower_name.startswith('tower_church'):
                f = r3(rng.uniform(8.0, 10.0))
                h = round(rng.uniform(32.0, 40.0) * 2.0) / 2.0
            else:
                f = 8.0
                h = 42.0
            # Tower sits in the square's inner corner, flush against the houses.
            tx1 = qx1 if corner[0] == 0 else r3(qx0 + f)
            tx0 = r3(tx1 - f) if corner[0] == 0 else qx0
            tz1 = qz1 if corner[1] == 0 else r3(qz0 + f)
            tz0 = r3(tz1 - f) if corner[1] == 0 else qz0
            towers.append((tower_name, (tx0, tx1, tz0, tz1), h))

    # Dropped street segments: merge two neighbouring blocks into one deep block.
    for k in range(1, len(xl) - 1):
        if xl[k].kind != 'street':
            continue
        for j in range(nz):
            a, b = (k - 1, j), (k, j)
            if a in used or b in used or protected(*a) or protected(*b):
                continue
            if rng.random() < 0.10:
                ra, rb = rects[a][0], rects[b][0]
                rects[a] = [(ra[0], rb[1], max(ra[2], rb[2]), min(ra[3], rb[3]))]
                rects[b] = []
                used.add(a)
                used.add(b)
    for k in range(1, len(zl) - 1):
        if zl[k].kind != 'street':
            continue
        for i in range(nx):
            a, b = (i, k - 1), (i, k)
            if a in used or b in used or protected(*a) or protected(*b):
                continue
            if rng.random() < 0.10:
                ra, rb = rects[a][0], rects[b][0]
                rects[a] = [(max(ra[0], rb[0]), min(ra[1], rb[1]), ra[2], rb[3])]
                rects[b] = []
                used.add(a)
                used.add(b)

    # Houses. Tower footprints are cut out of any house they overlap.
    houses = []
    for c in cells:
        for rect in rects[c]:
            for fp in fill_rect(rng, rect):
                if any(overlaps(fp, t[1]) for t in towers):
                    continue
                zone = zone_for(fp)
                storeys = pick_storeys(rng, zone)
                houses.append((fp, 2.5 + 3.5 * storeys))
    return xl, zl, squares, towers, houses


def overlaps(a, b):
    return a[0] < b[1] - 1e-6 and b[0] < a[1] - 1e-6 and a[2] < b[3] - 1e-6 and b[2] < a[3] - 1e-6


# ---------------------------------------------------------------------------
# Colliders, markers, meshes
# ---------------------------------------------------------------------------

def collider(name, kind, mn, mx, anchorable):
    return {
        'name': name,
        'kind': kind,
        'min': [r3(mn[0]), r3(mn[1]), r3(mn[2])],
        'max': [r3(mx[0]), r3(mx[1]), r3(mx[2])],
        'anchorable': anchorable,
    }


def build_colliders(towers, houses):
    cols = [collider('ground', 'ground', (-GROUND_EXT, -2.0, -GROUND_EXT), (GROUND_EXT, 0.0, GROUND_EXT), False)]
    e = INTERIOR + WALL_T
    cols.append(collider('wall_n', 'wall', (-e, 0.0, -e), (e, WALL_H, -INTERIOR), True))
    cols.append(collider('wall_s', 'wall', (-e, 0.0, INTERIOR), (e, WALL_H, e), True))
    cols.append(collider('wall_e', 'wall', (INTERIOR, 0.0, -INTERIOR), (e, WALL_H, INTERIOR), True))
    cols.append(collider('wall_w', 'wall', (-e, 0.0, -INTERIOR), (-INTERIOR, WALL_H, INTERIOR), True))
    for name, (x0, x1, z0, z1), h in towers:
        cols.append(collider(name, 'tower', (x0, 0.0, z0), (x1, h, z1), True))
    for n, ((x0, x1, z0, z1), h) in enumerate(houses):
        cols.append(collider('b_%05d' % n, 'building', (x0, 0.0, z0), (x1, h, z1), True))
    return cols


def seg_box_clearance_xz(p0, p1, box):
    """Smallest xz distance from a segment to a box footprint (sampled, 1 m steps)."""
    steps = int(math.hypot(p1[0] - p0[0], p1[2] - p0[2])) + 1
    best = 1e9
    for s in range(steps + 1):
        t = s / steps
        x = p0[0] + (p1[0] - p0[0]) * t
        z = p0[2] + (p1[2] - p0[2]) * t
        dx = max(box['min'][0] - x, 0.0, x - box['max'][0])
        dz = max(box['min'][2] - z, 0.0, z - box['max'][2])
        best = min(best, math.hypot(dx, dz))
    return best


def build_markers(cols):
    houses = [c for c in cols if c['kind'] == 'building']
    # Spawn: the tallest house on the west side of the test street near z = -65, standing at its
    # north-east roof corner (avenue edge), so no taller neighbour blocks the view down the avenue.
    facing = [c for c in houses if abs(c['max'][0] + 10.0) < 1e-6]
    near = [c for c in facing if -85.0 <= (c['min'][2] + c['max'][2]) / 2.0 <= -45.0]
    spawn_house = min(near, key=lambda c: (-c['max'][1], abs((c['min'][2] + c['max'][2]) / 2.0 + 65.0), c['name']))
    sx = spawn_house['max'][0] - 2.0
    sz = spawn_house['min'][2] + 1.5
    spawn = [r3(sx), r3(spawn_house['max'][1] + 0.9), r3(sz)]
    markers = {
        'spawn': spawn,
        # Start of the test street: over the avenue centre line at the square's north edge.
        'line_start': [0.0, 16.0, -40.0],
        # Perf fly-through: diagonal across the dense south-east core, 28 m up (roofs top out at 20 m).
        'perf_start': [60.0, 28.0, 60.0],
        'perf_end': [560.0, 28.0, 560.0],
        # Test street end (for reference by scenarios).
        'line_end': [0.0, 16.0, -400.0],
    }
    tall = [c for c in cols if c['max'][1] > 26.0 and c['kind'] != 'ground']
    for c in tall:
        if seg_box_clearance_xz(markers['perf_start'], markers['perf_end'], c) < 6.0:
            raise SystemExit('perf route passes too close to ' + c['name'])
    return markers, spawn_house['name']


def box_geometry(mn, mx, side_mat, top_mat, verts, faces, mats, sides=True):
    """Append a box without its bottom face (glTF coords in, Blender coords out)."""
    x0, y0, z0 = mn
    x1, y1, z1 = mx
    b = len(verts)
    ring = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    for x, z in ring:
        verts.append(common.to_blender(x, y0, z))
    for x, z in ring:
        verts.append(common.to_blender(x, y1, z))
    # Ring order is clockwise seen from above in Blender space, so the top is 4, 7, 6, 5
    # and each side (a, b) is (b, a, a + 4, b + 4) for outward normals.
    faces.append((b + 4, b + 7, b + 6, b + 5))
    mats.append(top_mat)
    if sides:
        for a, c in ((0, 1), (1, 2), (2, 3), (3, 0)):
            faces.append((b + c, b + a, b + a + 4, b + c + 4))
            mats.append(side_mat)


def chunk_of(c):
    cx = (c['min'][0] + c['max'][0]) / 2.0
    cz = (c['min'][2] + c['max'][2]) / 2.0
    ix = min(max(int(math.floor((cx + INTERIOR) / CHUNK)), 0), int(2 * INTERIOR / CHUNK) - 1)
    iz = min(max(int(math.floor((cz + INTERIOR) / CHUNK)), 0), int(2 * INTERIOR / CHUNK) - 1)
    return ix, iz


def build_meshes(cols):
    mats = {
        'mat_ground': common.make_material('mat_ground', (0.23, 0.21, 0.19)),
        'mat_building': common.make_material('mat_building', (0.72, 0.69, 0.64)),
        'mat_roof': common.make_material('mat_roof', (0.45, 0.30, 0.25)),
        'mat_tower': common.make_material('mat_tower', (0.60, 0.60, 0.62)),
        'mat_wall': common.make_material('mat_wall', (0.70, 0.60, 0.44)),
    }
    root = common.empty_object('DISTRICT')

    ground = cols[0]
    v, f, m = [], [], []
    box_geometry(ground['min'], ground['max'], 0, 0, v, f, m, sides=False)
    common.mesh_object('district_ground', v, f, [mats['mat_ground']], m, parent=root)

    v, f, m = [], [], []
    for c in cols:
        if c['kind'] == 'wall':
            box_geometry(c['min'], c['max'], 0, 0, v, f, m)
    common.mesh_object('district_wall', v, f, [mats['mat_wall']], m, parent=root)

    v, f, m = [], [], []
    for c in cols:
        if c['kind'] == 'tower':
            box_geometry(c['min'], c['max'], 0, 0, v, f, m)
    common.mesh_object('district_tower', v, f, [mats['mat_tower']], m, parent=root)

    chunks = {}
    order = []
    for c in cols:
        if c['kind'] != 'building':
            continue
        key = chunk_of(c)
        if key not in chunks:
            chunks[key] = []
            order.append(key)
        chunks[key].append(c)
    for key in sorted(order):
        v, f, m = [], [], []
        for c in chunks[key]:
            box_geometry(c['min'], c['max'], 0, 1, v, f, m)
        common.mesh_object('district_building_c%02d_%02d' % key, v, f,
                           [mats['mat_building'], mats['mat_roof']], m, parent=root)
    return len(chunks)


def main():
    out, seed = common.parse_args(SEED)
    common.reset_scene()
    xl, zl, squares, towers, houses = build_layout(seed)
    cols = build_colliders(towers, houses)
    markers, spawn_house = build_markers(cols)

    nchunks = build_meshes(cols)

    col_node = common.empty_object('COLLIDERS')
    col_node['odm_colliders'] = json.dumps(cols, separators=(',', ':'))
    mk = common.empty_object('MARKERS')
    mk['odm_markers'] = json.dumps(markers, separators=(',', ':'), sort_keys=True)
    # Looking down the avenue (-z), turned slightly right toward its centre line.
    mk['odm_spawn_yaw'] = '-0.2'
    layout = common.empty_object('LAYOUT')
    layout['odm_squares'] = json.dumps(
        [{'name': n, 'min': [q[0], 0.0, q[2]], 'max': [q[1], 0.0, q[3]]} for n, q in squares],
        separators=(',', ':'))

    common.export_glb(out)

    kinds = {}
    for c in cols:
        kinds[c['kind']] = kinds.get(c['kind'], 0) + 1
    tris = 2 + sum(10 for c in cols if c['kind'] != 'ground')
    heights = [c['max'][1] for c in cols if c['kind'] == 'building']
    print('ODM district: seed %d' % seed)
    print('  x streets %d, z streets %d, building chunks %d' % (len(xl), len(zl), nchunks))
    print('  colliders by kind: ' + ', '.join('%s=%d' % (k, kinds[k]) for k in sorted(kinds)))
    print('  building heights %.1f to %.1f m' % (min(heights), max(heights)))
    print('  towers: ' + ', '.join('%s %.1f m at %s' % (t[0], t[2], t[1]) for t in towers))
    print('  squares: ' + ', '.join('%s %s' % (n, q) for n, q in squares))
    print('  spawn house %s, markers %s' % (spawn_house, json.dumps(markers, sort_keys=True)))
    print('  triangles (expected) %d' % tris)
    print('  wrote %s (%d bytes)' % (out, os.path.getsize(out)))


main()
