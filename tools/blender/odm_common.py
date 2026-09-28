"""Shared helpers for the ODM Blender asset scripts.

Every asset script runs headless with a factory-startup Blender 5.2:

    blender -b --factory-startup -P tools/blender/<script>.py -- --out public/assets/<name>.glb

Coordinates: the scripts reason in glTF / three.js space (y up, -z forward). Blender is z up,
and the glTF exporter maps Blender (x, y, z) to glTF (x, z, -y). So a glTF point (x, y, z) is
built in Blender at (x, -z, y). Use `to_blender` for that conversion.
"""

import os
import sys

import bpy


def parse_args(default_seed):
    """Parse `-- --out <path> [--seed <int>]` from the Blender command line."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = None
    seed = default_seed
    i = 0
    while i < len(argv):
        if argv[i] == '--out' and i + 1 < len(argv):
            out = argv[i + 1]
            i += 2
        elif argv[i] == '--seed' and i + 1 < len(argv):
            seed = int(argv[i + 1])
            i += 2
        else:
            raise SystemExit('unknown argument: ' + argv[i])
    if not out:
        raise SystemExit('usage: blender -b --factory-startup -P <script> -- --out <file.glb> [--seed N]')
    return os.path.abspath(out), seed


def to_blender(x, y, z):
    """glTF (y up) point to Blender (z up) point."""
    return (x, -z, y)


def reset_scene():
    """Delete every object and every orphan datablock so the scene starts empty."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights,
                 bpy.data.images, bpy.data.textures, bpy.data.node_groups, bpy.data.curves):
        for block in list(coll):
            coll.remove(block)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)


def make_material(name, rgb, roughness=0.9, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    if not mat.use_nodes:
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


def mesh_object(name, verts, faces, materials, face_mats, parent=None, location=(0.0, 0.0, 0.0)):
    """Build a flat-shaded mesh object from Blender-space verts and quad/tri faces."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    for mat in materials:
        mesh.materials.append(mat)
    if face_mats:
        mesh.polygons.foreach_set('material_index', face_mats)
    mesh.shade_flat()
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    if parent is not None:
        obj.parent = parent
    return obj


def empty_object(name, parent=None, location=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    if parent is not None:
        obj.parent = parent
    return obj


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(
        filepath=path,
        check_existing=False,
        export_format='GLB',
        export_extras=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_vertex_color='NONE',
        export_attributes=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        use_mesh_edges=False,
        use_mesh_vertices=False,
        will_save_settings=False,
    )
