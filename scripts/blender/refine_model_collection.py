"""Refine all registered GLBs while retaining dimensions, rigs and original files.

Run prepare-model-refinement.mjs, this script in Blender, then finalize the plan.
Category libraries are saved as editable .blend files in art/environment/refined.
"""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAN = json.loads((ROOT / 'art/environment/refinement-plan.json').read_text())
LIBRARIES = ROOT / 'art/environment/refined'
LIBRARIES.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
groups = {}
records = []
only_arg = next((arg for arg in sys.argv if arg.startswith('--only=')), '')
only = set(filter(None, only_arg.partition('=')[2].split(',')))


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != 'Collection':
            bpy.data.collections.remove(collection)
    bpy.ops.outliner.orphans_purge(do_recursive=True)


def refine(obj, category):
    if obj.type != 'MESH':
        return
    data = obj.data
    # Character vertex indices and separate limb pivots must survive unchanged.
    if category != 'characters' and not obj.vertex_groups and not data.shape_keys:
        bm = bmesh.new()
        bm.from_mesh(data)
        span = max(obj.dimensions)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=max(1e-7, span * 1e-7))
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=max(1e-8, span * 1e-8))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
    if category == 'structures' and not obj.vertex_groups and not data.shape_keys:
        # Tiny inset bevels catch light without widening roads or changing silhouettes.
        dimensions = [float(v) for v in obj.dimensions if v > .001]
        if dimensions:
            bevel = obj.modifiers.new('Crafted light-catching edges', 'BEVEL')
            bevel.width = min(.018, min(dimensions) * .018)
            bevel.segments = 1
            bevel.limit_method = 'ANGLE'
            bevel.angle_limit = math.radians(35)
            bevel.affect = 'EDGES'
            bevel.use_clamp_overlap = True
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=bevel.name)
            normals = obj.modifiers.new('Balanced face normals', 'WEIGHTED_NORMAL')
            normals.keep_sharp = True
            normals.weight = 30
            bpy.ops.object.modifier_apply(modifier=normals.name)
    for material in data.materials:
        if not material or not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type != 'BSDF_PRINCIPLED':
                continue
            metallic = node.inputs['Metallic'].default_value
            node.inputs['Roughness'].default_value = .46 if metallic > .35 else .82
            node.inputs['Specular IOR Level'].default_value = .28
    data.update()


for entry in PLAN['assets']:
    if not only or any(key in only for key in entry['keys']):
        groups.setdefault(entry['category'], []).append(entry)
if not groups:
    raise ValueError(f'No refinement assets match: {sorted(only)}')

for category, entries in sorted(groups.items()):
    clear()
    for index, entry in enumerate(entries):
        if only:
            clear()
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=entry['input'])
        objects = {obj for obj in set(bpy.data.objects) - before if obj.name in bpy.context.view_layer.objects}
        for obj in objects:
            refine(obj, category)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        outfile = ROOT / 'public' / entry['output'].lstrip('/')
        outfile.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=str(outfile), export_format='GLB', use_selection=True,
            export_yup=True, export_animations=True, export_extras=True,
            export_cameras=False, export_lights=False, export_apply=False,
            export_vertex_color='MATERIAL', export_attributes=True,
        )
        record = {'source': entry['source'], 'output': entry['output'], 'category': category,
                  'meshes': sum(obj.type == 'MESH' for obj in objects),
                  'operations': ['mesh cleanup', 'consistent satin materials'] + (['subtle edge bevels', 'weighted normals'] if category == 'structures' else [])}
        records.append(record)
        if only:
            bpy.ops.wm.save_as_mainfile(filepath=str(LIBRARIES / (entry['keys'][0] + '.blend')))
            continue
        collection = bpy.data.collections.new(entry['keys'][0])
        bpy.context.scene.collection.children.link(collection)
        for obj in objects:
            # Free original rig names before importing the next gallery asset.
            obj.name = entry['keys'][0] + '__' + obj.name
            for parent in list(obj.users_collection):
                parent.objects.unlink(obj)
            collection.objects.link(obj)
        # Gallery offsets apply only to top-level objects after export.
        width = max(4., entry['bounds']['max'][0] - entry['bounds']['min'][0] + 2.)
        for obj in objects:
            if obj.parent not in objects:
                obj.location.x += (index % 8) * max(8., width)
                obj.location.y += (index // 8) * 16.
    if not only:
        bpy.ops.wm.save_as_mainfile(filepath=str(LIBRARIES / (category + '.blend')))

report_path = LIBRARIES / 'refinement-report.json'
if only and report_path.exists():
    existing = json.loads(report_path.read_text())
    replacements = {record['source']: record for record in records}
    records = [replacements.pop(record['source'], record) for record in existing] + list(replacements.values())
report_path.write_text(json.dumps(records, indent=2) + '\n')
print('MODEL_COLLECTION_REFINED', len(records))
