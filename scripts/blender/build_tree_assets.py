"""Author the three reusable forest trees used by the overworld.

The map places these assets one tile at a time, so each export is a single
grounded mesh with one vertex-colour material.  Dimensions are authored in
metres against the 1.55 m player asset: every tree is at least 1.5x the player
height and the mature oak/default variants are close to 2x.

Run from the repository root with::

    /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python scripts/blender/build_tree_assets.py

The editable scene is saved to ``art/environment/forest-trees.blend`` and the
GLBs are written to ``public/assets/3d/xingyin-environment-v2/forest-trees``.
"""

import bpy
import json
import math
import random
import subprocess
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/assets/3d/xingyin-environment-v2/forest-trees"
ART = ROOT / "art/environment"
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)

PLAYER_HEIGHT = 1.55
PARTS = []
MATERIAL = None


def setup_material():
    global MATERIAL
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    MATERIAL = bpy.data.materials.new("Xingyin forest satin vertex palette")
    MATERIAL.use_nodes = True
    shader = MATERIAL.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = 0.84
    color = MATERIAL.node_tree.nodes.new("ShaderNodeVertexColor")
    color.layer_name = "Color"
    MATERIAL.node_tree.links.new(color.outputs["Color"], shader.inputs["Base Color"])


def _linear_rgb(shade):
    rgb = [int(shade[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb)


def paint(obj, shade):
    """Use one shared material while retaining hand-painted facet variation."""
    obj.data.materials.append(MATERIAL)
    attr = obj.data.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    rgb = _linear_rgb(shade)
    for polygon in obj.data.polygons:
        factor = random.uniform(0.94, 1.035)
        for loop_index in polygon.loop_indices:
            attr.data[loop_index].color = tuple(min(1.0, c * factor) for c in rgb) + (1.0,)
    PARTS.append(obj)
    return obj


def mesh(name, vertices, faces, shade):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return paint(obj, shade)


def cone(name, center, radius_bottom, radius_top, height, shade, sides=7):
    bpy.ops.mesh.primitive_cone_add(
        vertices=sides,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=height,
        location=center,
    )
    obj = bpy.context.object
    obj.name = name
    return paint(obj, shade)


def ico(name, center, scale, shade, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return paint(obj, shade)


def limb(name, start, end, radius_start, radius_end, shade, sides=6):
    start, end = Vector(start), Vector(end)
    axis = end - start
    if axis.length < 1e-4:
        return None
    center = (start + end) * 0.5
    obj = cone(name, center, radius_start, radius_end, axis.length, shade, sides)
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    return obj


def folded_leaf(name, root, tip, width, shade):
    """A small folded blade for pine sprays, with a ridge for readable facets."""
    root, tip = Vector(root), Vector(tip)
    axis = tip - root
    side = axis.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    mid = root + axis * 0.48
    ridge = mid + Vector((0, 0, width * 0.25))
    points = [root, mid + side * width, tip, mid - side * width, ridge]
    return mesh(name, points, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)], shade)


def root_flare(height, bark):
    """Four shallow buttress roots keep the trunk visibly planted."""
    for angle in (0.0, math.pi * 0.5, math.pi, math.pi * 1.5):
        direction = Vector((math.cos(angle), math.sin(angle), 0))
        limb(
            "faceted root flare",
            direction * 0.08 + Vector((0, 0, 0.08)),
            direction * 0.56 + Vector((0, 0, 0.035)),
            0.18,
            0.035,
            bark,
            5,
        )


def oak():
    """Broad mature oak, authored to 3.25 m (2.1x the player)."""
    random.seed(12031)
    h = 3.25
    bark, leaf = "795642", "5F8C5D"
    cone("oak main trunk", (0, 0, h * 0.30), 0.25, 0.12, h * 0.60, bark, 8)
    root_flare(h, bark)
    # Branches overlap the trunk and canopy centres, preventing the detached look
    # of the previous bill-boarded trees.
    branches = [
        ((0.0, 0.0, h * 0.42), (-0.76, 0.05, h * 0.70), 0.14),
        ((0.0, 0.0, h * 0.45), (0.64, 0.17, h * 0.74), 0.13),
        ((0.0, 0.0, h * 0.49), (-0.08, -0.66, h * 0.81), 0.115),
        ((0.02, 0.02, h * 0.54), (0.10, 0.56, h * 0.94), 0.095),
    ]
    for start, end, radius in branches:
        limb("oak structural bough", start, end, radius, 0.032, bark, 6)
    crowns = [
        (-0.82, 0.05, 2.34, 0.70, 0.56, 0.55),
        (0.70, 0.14, 2.42, 0.74, 0.60, 0.58),
        (-0.08, -0.67, 2.60, 0.68, 0.55, 0.53),
        (0.10, 0.56, 3.02, 0.57, 0.48, 0.46),
        (-0.04, 0.05, 2.63, 0.62, 0.55, 0.58),
    ]
    for index, (x, y, z, sx, sy, sz) in enumerate(crowns):
        ico("oak sculpted crown %02d" % index, (x, y, z), (sx, sy, sz), leaf, 2)


def default_tree():
    """Layered deciduous tree, authored to 3.10 m (2x the player)."""
    random.seed(12032)
    h = 3.10
    bark, leaf_a, leaf_b = "805A43", "6E9C62", "79A96A"
    cone("deciduous main trunk", (0, 0, h * 0.28), 0.22, 0.105, h * 0.56, bark, 7)
    root_flare(h, bark)
    limb("deciduous fork left", (0, 0, h * 0.39), (-0.52, 0.02, h * 0.68), 0.125, 0.028, bark, 6)
    limb("deciduous fork right", (0, 0, h * 0.44), (0.50, 0.10, h * 0.72), 0.115, 0.028, bark, 6)
    limb("deciduous fork rear", (0, 0, h * 0.49), (0.0, -0.50, h * 0.82), 0.095, 0.025, bark, 6)
    crowns = [
        (-0.54, 0.02, 2.17, 0.64, 0.51, 0.52, leaf_a),
        (0.54, 0.10, 2.28, 0.68, 0.54, 0.56, leaf_b),
        (0.0, -0.52, 2.49, 0.60, 0.49, 0.52, leaf_a),
        (0.0, 0.04, 2.63, 0.56, 0.47, 0.50, leaf_b),
    ]
    for index, (x, y, z, sx, sy, sz, shade) in enumerate(crowns):
        ico("deciduous sculpted crown %02d" % index, (x, y, z), (sx, sy, sz), shade, 2)


def pine():
    """Tiered alpine pine, authored to 3.85 m (2.5x the player)."""
    random.seed(12033)
    h = 3.85
    bark, needle_a, needle_b = "765B48", "3F7164", "4F806B"
    cone("pine straight trunk", (0, 0, h * 0.27), 0.20, 0.085, h * 0.54, bark, 7)
    root_flare(h, bark)
    # Four visible tiers give the silhouette depth while keeping the asset light.
    tiers = [
        (1.52, 0.94, 0.70, needle_a),
        (2.05, 0.82, 0.63, needle_b),
        (2.57, 0.66, 0.58, needle_a),
        (3.08, 0.49, 0.52, needle_b),
        (3.53, 0.30, 0.45, needle_a),
    ]
    for index, (z, radius, depth, shade) in enumerate(tiers):
        # The cone is centred just above the branch collar, so adjacent tiers
        # overlap rather than leaving the gaps present in the old tree asset.
        cone("pine layered crown %02d" % index, (0, 0, z), radius, 0.035, depth, shade, 8)
        for branch_angle in range(0, 360, 90):
            angle = math.radians(branch_angle + index * 17)
            end = (math.cos(angle) * radius * 0.78, math.sin(angle) * radius * 0.78, z + depth * 0.08)
            limb("pine branch spray", (0, 0, z + depth * 0.30), end, 0.045, 0.014, bark, 5)
            folded_leaf("pine folded needle fan", end, (end[0] * 1.08, end[1] * 1.08, end[2] + 0.16), 0.08, shade)
    cone("pine pointed leader", (0, 0, 3.78), 0.25, 0.0, 0.52, needle_b, 8)


def finish(name, label, kind, target_height, tags):
    bpy.ops.object.select_all(action="DESELECT")
    for part in PARTS:
        part.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bottom = min(vertex.co.z for vertex in obj.data.vertices)
    for vertex in obj.data.vertices:
        vertex.co.z -= bottom
    obj.data.materials.clear()
    obj.data.materials.append(MATERIAL)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    obj.data.calc_loop_triangles()
    triangles = len(obj.data.loop_triangles)
    assert triangles <= 1200, (name, triangles)
    measured_height = max(vertex.co.z for vertex in obj.data.vertices)
    assert measured_height >= PLAYER_HEIGHT * 1.5, (name, measured_height)
    filepath = OUT / (name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_apply=True,
        export_extras=True,
        export_attributes=True,
        export_vertex_color="MATERIAL",
    )
    record = {
        "name": name,
        "label": label,
        "kind": kind,
        "source": "Blender 5.2 / original Xingyin forest trees",
        "targetHeightMetres": target_height,
        "heightMetres": round(measured_height, 4),
        "playerHeightMetres": PLAYER_HEIGHT,
        "heightRatio": round(measured_height / PLAYER_HEIGHT, 3),
        "triangles": triangles,
        "file": "/assets/3d/xingyin-environment-v2/forest-trees/%s.glb" % name,
        "themeTags": tags,
        "grounded": True,
        "material": "vertex-colour satin palette",
    }
    PARTS.clear()
    return obj, record


setup_material()
records = []
objects = []
for builder, name, label, kind, target, tags in [
    (oak, "tree_oak", "成熟阔叶橡树", "oak", 3.25, ["forest", "deciduous", "oak"]),
    (default_tree, "tree_default", "层叠阔叶树", "deciduous", 3.10, ["forest", "deciduous", "default"]),
    (pine, "tree_pineTallA_detailed", "高山层叠松树", "pine", 3.85, ["forest", "alpine", "pine"]),
]:
    builder()
    obj, record = finish(name, label, kind, target, tags)
    records.append(record)
    objects.append(obj)

for index, obj in enumerate(objects):
    obj.location = (index * 4.5, 0, 0)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ART / "forest-trees.blend"))
(OUT / "authoring-metadata.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")

# Validate the files with the same glTF transform stack used by the environment
# pipeline.  This catches axis, material, texture, animation, and grounding
# regressions before the runtime cache is pointed at the new exports.
subprocess.run(
    [
        "node",
        "--input-type=module",
        "-e",
        r'''
import fs from 'node:fs/promises';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
});
const folder = 'public/assets/3d/xingyin-environment-v2/forest-trees';
const source = JSON.parse(await fs.readFile(`${folder}/authoring-metadata.json`, 'utf8'));
const manifest = [];
for (const item of source) {
  const filename = `${folder}/${item.name}.glb`;
  const doc = await io.read(filename);
  await doc.transform(dedup(), weld(), prune(), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }));
  await io.write(filename, doc);
  const verified = await io.read(filename);
  const root = verified.getRoot();
  const scene = root.listScenes()[0];
  const bounds = getBounds(scene);
  const meshes = root.listMeshes();
  const primitives = meshes.flatMap(mesh => mesh.listPrimitives());
  const triangles = primitives.reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0);
  const height = bounds.max[1] - bounds.min[1];
  if (meshes.length !== 1 || primitives.length !== 1 || root.listMaterials().length !== 1 || root.listTextures().length || root.listAnimations().length || Math.abs(bounds.min[1]) > .002 || height < 2.325 || triangles > 1200 || !primitives[0].getAttribute('COLOR_0')) {
    throw new Error(`Invalid tree asset contract: ${item.name} bounds=${JSON.stringify(bounds)} triangles=${triangles}`);
  }
  manifest.push({ ...item, triangles, bytes: (await fs.stat(filename)).size, bounds, meshCount: 1, materialCount: 1, textureCount: 0, animationCount: 0 });
}
await fs.writeFile(`${folder}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Validated ${manifest.length} tree assets; ${manifest.reduce((sum, m) => sum + m.triangles, 0)} triangles total.`);
''',
    ],
    cwd=ROOT,
    check=True,
)
print("TREE_EXPORT_COMPLETE", len(records), "assets")
