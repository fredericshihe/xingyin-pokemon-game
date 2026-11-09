"""Render battle plates using the same local assets as the adventure maps.

blender -b --python scripts/blender/render_battle_backgrounds.py -- --only valley-meadow
The fixed seed, camera and catalogue IDs make the production images reproducible.
"""
import argparse
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/battle-backgrounds/blender"
ASSETS = ROOT / "public/assets/3d"
sys.path.insert(0, str(Path(__file__).parent))
import environment_modeling as model

PALETTES = {
    "valley": ("81B66A", "DFCCA0", "B5D3B9", "69B6E3", "DDF0F5"),
    "meadow": ("6FA56B", "CEBD96", "AACDB9", "73B9DA", "E4F1E8"),
    "mist": ("79AD91", "BBCABD", "B5D1CC", "92BFCD", "E5F3EF"),
    "farm": ("8CAD68", "DBC28B", "BAC697", "87BED8", "FFF1C9"),
    "shore": ("E1D1AE", "E9DAB8", "B2CEC6", "73BBD9", "E2F8F4"),
    "grave": ("566777", "8793A0", "8A9BAF", "354B76", "BCBCDF"),
    "ruins": ("789E91", "A8B8B0", "8AAEAB", "78B8C8", "DBECE4"),
    "ridge": ("799572", "B8B5A1", "A3B7AF", "8DAEBF", "F1EACF"),
    "peak": ("6F9C99", "ABBABD", "A3B8CC", "758FAB", "E0D6ED"),
    "frost": ("BDDDDE", "DEE8E6", "C1DDE8", "8BBDD6", "F7F9EE"),
    "tide": ("85ADA9", "CCDCD7", "94BCC8", "77AECC", "E2F7F2"),
    "iron": ("647D7D", "8C9FA3", "A0B2BC", "87A6B9", "E1E8DC"),
    "dragon": ("778E9C", "B1BDC4", "9AABBE", "819BC1", "E0D9F1"),
    "champion": ("A5C7C2", "E0E4DA", "B9CDD8", "82ACD1", "F8EFDA"),
}


def linear(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)


def material(name, color, noise=False, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear(color), 1)
    shader.inputs["Roughness"].default_value = .85
    if emission:
        shader.inputs["Emission Color"].default_value = (*linear(color), 1)
        shader.inputs["Emission Strength"].default_value = emission
    if noise:
        texture = nodes.new("ShaderNodeTexNoise")
        coordinate = nodes.new("ShaderNodeTexCoord")
        links.new(coordinate.outputs["Object"], texture.inputs["Vector"])
        texture.inputs["Scale"].default_value = 2.2
        texture.inputs["Detail"].default_value = 2
        ramp = nodes.new("ShaderNodeValToRGB")
        base = linear(color)
        ramp.color_ramp.elements[0].color = (*[v * .92 for v in base], 1)
        ramp.color_ramp.elements[1].color = (*[min(1, v * 1.07) for v in base], 1)
        links.new(texture.outputs["Fac"], ramp.inputs[0])
        links.new(ramp.outputs[0], shader.inputs["Base Color"])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .13
        bump.inputs["Distance"].default_value = .07
        links.new(texture.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return mat


def plane(name, location, size, mat):
    bpy.ops.mesh.primitive_plane_add(size=2, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, 1)
    obj.data.materials.append(mat)
    return obj


def cube(name, location, size, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name, obj.dimensions = name, size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Rounded masonry edges", "BEVEL")
        modifier.width, modifier.segments = bevel, 2
        obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    return obj


def sphere(name, location, size, mat, smooth=True):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=location)
    obj = bpy.context.object
    obj.name, obj.scale = name, size
    obj.data.materials.append(mat)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


_templates = {}
_template_bounds = {}
_placed_prop_bounds = []
_skipped_props = []

# Keep large props in the perimeter bands so the two combatants have a clean
# silhouette. Conservative 2D bounds also prevent model-to-model clipping.
CENTRE_SAFE_RECT = (-5.2, 5.2, -10.0, 18.0)


def _bounds_overlap(a, b, padding=0.32):
    return not (a[2] + padding <= b[0] or b[2] + padding <= a[0] or
                a[3] + padding <= b[1] or b[3] + padding <= a[1])


def _rotated_footprint(width, depth, rotation):
    c, s = abs(math.cos(rotation)), abs(math.sin(rotation))
    return width * c + depth * s, width * s + depth * c


def _intersects_centre(bounds):
    left, bottom, right, top = bounds
    return not (right <= CENTRE_SAFE_RECT[0] or left >= CENTRE_SAFE_RECT[1] or
                top <= CENTRE_SAFE_RECT[2] or bottom >= CENTRE_SAFE_RECT[3])


def reserve_footprint(x, y, width, depth):
    footprint = (x - width / 2, y - depth / 2, x + width / 2, y + depth / 2)
    if any(_bounds_overlap(footprint, placed) for placed in _placed_prop_bounds):
        return False
    _placed_prop_bounds.append(footprint)
    return True


def windmill(x, y, height):
    if not reserve_footprint(x, y, height * .7, height * .55):
        return
    model.cone((x, y, height * .38), height * .24, height * .17, height * .76, "D5CBB3", 12)
    model.cone((x, y, height * .83), height * .27, 0, height * .26, "718C96", 12)
    model.box((x, y - height * .225, height * .15), (height * .12, .12, height * .3), "6A6658")
    hub = Vector((x, y - height * .245, height * .6))
    model.limb(hub, hub + Vector((0, -.24, 0)), height * .055, height * .055, "D3B678", 12)
    for i in range(4):
        angle = i * math.pi / 2 + math.pi / 4
        axis = Vector((math.sin(angle), 0, math.cos(angle)))
        sideways = Vector((math.cos(angle), 0, -math.sin(angle)))
        end = hub + axis * height * .4
        model.limb(hub, end, .065, .045, "806C50")
        start = hub + axis * height * .15
        vertices = [start, end, end + sideways * height * .09, start + sideways * height * .09]
        model.mesh("Canvas windmill sail", [tuple(v) for v in vertices], [(0, 1, 2, 3)], "F3E8C9")


def prop(path, x, y, height, rotation=0, z=0, allow_centre=False):
    if path not in _templates:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(ASSETS / path))
        imported = list(set(bpy.data.objects) - before)
        meshes = [obj for obj in imported if obj.type == "MESH"]
        helpers = [obj for obj in imported if obj.type != "MESH"]
        for obj in meshes:
            matrix = obj.matrix_world.copy()
            obj.parent = None
            obj.matrix_world = matrix
        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        if len(meshes) > 1:
            bpy.ops.object.join()
        base = bpy.context.object
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bounds = [base.matrix_world @ Vector(v) for v in base.bound_box]
        low = Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
        high = Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
        center = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
        model_height = max(.01, high.z - low.z)
        _template_bounds[path] = ((high.x - low.x) / model_height, (high.y - low.y) / model_height)
        for v in base.data.vertices:
            v.co = (v.co - center) / max(.01, high.z - low.z)
        base.location = (0, 0, 0)
        base.hide_render = True
        for obj in helpers:
            if obj.name in bpy.data.objects:
                bpy.data.objects.remove(obj, do_unlink=True)
        _templates[path] = base
    width, depth = _template_bounds[path]
    footprint_width, footprint_depth = _rotated_footprint(width * height, depth * height, rotation)
    footprint = (x - footprint_width / 2, y - footprint_depth / 2,
                 x + footprint_width / 2, y + footprint_depth / 2)
    if not allow_centre and height > 1.0 and _intersects_centre(footprint):
        _skipped_props.append({'path': path, 'x': x, 'y': y, 'reason': 'centre-safe-area'})
        return None
    if any(_bounds_overlap(footprint, placed) for placed in _placed_prop_bounds):
        _skipped_props.append({'path': path, 'x': x, 'y': y, 'reason': 'footprint-overlap'})
        return None
    _placed_prop_bounds.append(footprint)
    obj = _templates[path].copy()
    obj.data = _templates[path].data
    bpy.context.collection.objects.link(obj)
    obj.hide_render = False
    obj.location = (x, y, z)
    obj.scale = (height,) * 3
    obj.rotation_euler.z = rotation
    return obj


def tree(x, y, height=6, pine=False):
    return prop("xingyin-environment-v2/forest-trees/tree_pineTallA_detailed.glb" if pine else "xingyin-environment-v2/forest-trees/tree_oak.glb",
                x, y, height, random.uniform(-math.pi, math.pi))


def rock(x, y, size=1, theme="ridge"):
    if theme == "shore":
        asset, scale = "kenney-pirate/rocks-sand-a.glb", min(size, 1.05)
    else:
        # rock_largeA is a broad orange slab and reads as a floating platform
        # in battle plates. Use small neutral stones for all non-coastal scenes.
        asset, scale = "kenney-nature/rock_smallH.glb", min(size * .3, .6)
    obj = prop(asset, x, y, scale, random.uniform(-math.pi, math.pi))
    if obj and theme != "shore":
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        obj.data.materials.append(material("Neutral weathered granite", "819394", noise=True))
    return obj


def ribbon(points, width, mat):
    # Smooth the authored centreline without making the terrain shader noisy.
    for _ in range(3):
        refined = [points[0]]
        for a, b in zip(points, points[1:]):
            refined += [(a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25),
                        (a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75)]
        refined.append(points[-1])
        points = refined
    vertices, faces = [], []
    for i, (x, y) in enumerate(points):
        previous, following = points[max(0, i - 1)], points[min(len(points) - 1, i + 1)]
        direction = Vector((following[0] - previous[0], following[1] - previous[1])).normalized()
        local_width = width * (1 if y <= 18 else max(.45, 1 - (y - 18) / 65))
        vertices += [(x - direction.y * local_width, y + direction.x * local_width, .003),
                     (x + direction.y * local_width, y - direction.x * local_width, .003)]
        if i:
            faces.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
    mesh = bpy.data.meshes.new("Worn path surface")
    mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new("Continuous natural fighting ground", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)


def water(y, color="559CB6"):
    mat = material("Calm lake water", color, noise=True)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .23
    shader.inputs["Metallic"].default_value = .22
    plane("Distant water", (0, y + 50, -.04), (190, 100), mat)
    foam = material("Water reflections", "E3F5F4")
    for _ in range(24):
        x, py = random.uniform(-25, 25), random.uniform(y + 1, y + 25)
        plane("Small distant ripple", (x, py, -.02), (random.uniform(.3, 2), .025), foam)


def sky(scene, theme, palette):
    world = bpy.data.worlds.new("Painted atmospheric sky")
    scene.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    tex = nodes.new("ShaderNodeTexCoord")
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tex.outputs["Normal"], split.inputs[0])
    direction = nodes.new("ShaderNodeMath")
    direction.operation = "MULTIPLY"
    direction.inputs[1].default_value = -1
    links.new(split.outputs["Z"], direction.inputs[0])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = .02
    ramp.color_ramp.elements[0].color = (*linear(palette[4]), 1)
    ramp.color_ramp.elements[1].position = .5
    ramp.color_ramp.elements[1].color = (*linear(palette[3]), 1)
    links.new(direction.outputs[0], ramp.inputs[0])
    bg = nodes.get("Background")
    bg.inputs["Strength"].default_value = .65 if theme != "grave" else .4
    links.new(ramp.outputs[0], bg.inputs["Color"])
    visible = nodes.new("ShaderNodeBackground")
    visible.inputs["Strength"].default_value = 1.25 if theme != "grave" else .65
    links.new(ramp.outputs[0], visible.inputs["Color"])
    rays = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(rays.outputs["Is Camera Ray"], mix.inputs[0])
    links.new(bg.outputs[0], mix.inputs[1])
    links.new(visible.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get("World Output").inputs[0])
    clouds = material("Soft distant cloud banks", "F4F7F5" if theme != "grave" else palette[4], emission=.12)
    for x, y, z, scale in [(-32, 76, 14, 1), (26, 88, 16, 1.3), (3, 114, 19, 1.1)]:
        for i in range(4):
            sphere("Cloud", (x + i * 4 * scale, y, z + (i % 2) * 1.6),
                   (6 * scale, 3 * scale, 2 * scale), clouds)
    if theme in ("peak", "dragon", "champion"):
        for x in range(-70, 71, 12):
            sphere("Cloud sea below terrace", (x, 46 + random.uniform(0, 8), -1.8),
                   (12, 7, 2), clouds)
    if theme == "grave":
        moon = material("Moon", "FAF3CC", emission=1.5)
        sphere("Moon above the memorial", (10, 66, 18), (2.2,) * 3, moon)


def masonry(theme, identity, stone, trim):
    is_vault = identity == "ruins-vault"
    is_hall = identity in ("ruins-galleries", "champion-hall")
    for x in (-12, -8, 8, 12):
        reserve_footprint(x, 18, 1.8, 1.8)
        h = 5.2 if abs(x) == 8 else 6.8
        cube("Column plinth", (x, 18, .25), (1.5, 1.5, .5), stone, .09)
        cube("Sculpted column", (x, 18, h / 2), (.9, .9, h), stone, .1)
        cube("Column capital", (x, 18, h), (1.6, 1.5, .38), trim, .06)
    if theme in ("dragon", "champion", "ruins") and not identity.endswith("-throne"):
        reserve_footprint(0, 29, 8.8, 1.8)
        model.arch((0, 29, .2), 7.6, 8.5, .48, "AFC3C5")
        if theme != "ruins":
            model.arch((0, 29, .2), 7.4, 8.3, .12, "DCC47E")
    if theme == "iron":
        for x in (-11, 11):
            reserve_footprint(x, 27, 7.5, 5.7)
            cube("Fortress bastion", (x, 27, 3), (7, 5, 6), stone, .16)
            for offset in (-2.4, 0, 2.4):
                cube("Battlement", (x + offset, 27, 6.5), (1.4, 5.4, 1.2), stone, .08)
            prop("xingyin-environment-v2/iron_forge_cluster.glb", x, 18, 3)
    if theme == "frost":
        for x in (-15, 15):
            prop("xingyin-environment-v2/frost_crystal_garden.glb", x, 24, 4)
    if theme == "tide":
        for x in (-10, 10):
            prop("xingyin-environment-v2/tide_coral_garden.glb", x, 23, 4)
    if theme == "dragon":
        for x in (-11, 11):
            prop("xingyin-environment-v2/dragon_bone_spires.glb", x, 15, 5)
    if identity.endswith("-throne"):
        reserve_footprint(0, 27, 11.5, 3)
        gate_color = {"frost": "C5E7ED", "tide": "74C3C9", "iron": "91A9A8", "dragon": "A7B1CF"}[theme]
        model.arch((0, 27, .1), 10, 11, .68, gate_color)
        for x in (-7.5, 7.5):
            reserve_footprint(x, 25, 2.1, 2)
            cube("Upper arena pylons", (x, 25, 3.8), (1.2, 1.4, 7.6), stone, .13)
            cube("Upper arena crown", (x, 25, 7.9), (2, 1.8, .5), trim, .06)
        for step in range(3):
            cube("Ceremonial distant steps", (0, 26 + step * 1.2, .1 + step * .12),
                 (11 - step * .8, 3.2, .2 + step * .24), stone, .06)
    if is_vault or is_hall:
        cube("Rear gallery wall", (0, 32, 6), (34, 1, 12), stone, .12)
        if is_vault:
            cube("Recessed sealed doorway", (0, 31.42, 3.5), (5, .2, 7), material("Door", "415A64"), .12)
            luminous = material("Recessed crystal", "69D9D1", emission=1)
            for x in (-6, 6):
                cube("Crystal light inset", (x, 31.3, 4), (.22, .12, 5), luminous, .04)
        else:
            for x in (-7, 0, 7):
                cube("Open sky framed window", (x, 31.4, 7.2), (4, .1, 6), material("Window sky", "B1D6DF", emission=.7), .06)
        for x in (-15, 15):
            cube("Side gallery wall", (x, 17, 6), (1, 30, 12), stone, .15)


def build(identity):
    global _templates, _template_bounds, _placed_prop_bounds, _skipped_props
    _templates = {}
    _template_bounds = {}
    _placed_prop_bounds = []
    _skipped_props = []
    theme = identity.split("-")[0]
    palette = PALETTES[theme]
    random.seed(int(hashlib.sha256(identity.encode()).hexdigest()[:8], 16))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    model.PARTS.clear()
    model.setup()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1536, 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = -.35
    ground = material("Organic ground", palette[0], noise=True)
    path = material("Fighting ground", palette[1], noise=True)
    stone = material("Aged stone", palette[1], noise=True)
    trim = material("Carved stone trim", "DACDA6" if theme in ("champion", "dragon", "iron") else "C1D4CE")
    architecture = theme in ("ruins", "frost", "tide", "iron", "dragon", "champion")
    lake = theme in ("mist", "shore", "tide") or identity == "valley-lakeshore"
    sky(scene, theme, palette)
    plane("Continuous foreground terrain", (0, 0, 0), (160, 150 if not lake else 45), ground)
    if architecture:
        plane("Wide level stone battle court", (0, 5, -.015), (34, 50), stone)
        seam = material("Subtle stone grout", "708787")
        for x in range(-18, 19, 4):
            plane("Stone joint", (x, 7, -.007), (.028, 45), seam)
        for y in range(-16, 30, 4):
            plane("Stone joint", (0, y, -.006), (34, .028), seam)
        masonry(theme, identity, stone, trim)
    else:
        points = [(-5, -32), (-3, -12), (0, 0), (1, 8), (0, 15), (-1, 24)]
        if not lake:
            points += [(-3, 38), (-2, 54), (0, 72)]
        ribbon(points, 4.6 if theme not in ("valley", "meadow") else 3.8, path)

    mountain = material("Atmospheric distant hills", palette[2])
    for x in (-42, -25, -8, 13, 33, 53):
        sphere("Distant landscape", (x, 62 + random.uniform(-4, 8), -2),
               (random.uniform(13, 20), 11, random.uniform(6, 13)), mountain, theme in ("valley", "meadow", "farm", "mist"))
    if lake:
        water(22, "528FA8" if theme == "mist" else "4B9FB7")
        if theme == "mist" or identity == "valley-lakeshore":
            plane("Far dry lakeshore beneath woodland", (0, 86, .001), (160, 104), ground)

    if identity in ("valley-camp", "ridge-camp", "meadow-trail"):
        prop("kenney-nature/tent_detailedOpen.glb", -7.5, 20, 3.4, -.18)
        prop("kenney-nature/log_stack.glb", -10, 17, 1.2)
        prop("kenney-survival/workbench.glb", 8, 24, 1.6)
        prop("kenney-survival/barrel.glb", 10, 21, 1.5)
        if theme == "ridge":
            prop("kenney-survival/structure-canvas.glb", 7, 28, 4)
    if identity in ("valley-flowers", "meadow-flowers", "meadow-sanctuary"):
        for _ in range(90):
            x, y = random.uniform(-16, 16), random.uniform(6, 30)
            if abs(x) > 5:
                prop("kenney-nature/flower_redC.glb" if random.random() > .5 else "kenney-nature/flower_yellowC.glb", x, y, random.uniform(.35, .65))
    if theme == "farm":
        if identity != "farm-windmill":
            windmill(1, 35, 8)
        for x in (-10, -8, 8, 10):
            for y in (14, 17, 20, 23, 26, 29):
                prop("kenney-nature/crops_wheatStageB.glb", x, y, 1.1)
        for x in (-9, 9):
            prop("kenney-nature/fence_planks.glb", x, 11, 1.4, .1)
        if identity == "farm-yard":
            prop("kenney-hexagon/building-farm.glb", -8, 28, 5)
            prop("kenney-fantasy-town/cart.glb", 7, 20, 2)
            prop("kenney-survival/box.glb", 10, 18, 1.2)
        if identity == "farm-windmill":
            plane("Upper windmill deck", (0, 4, .04), (32, 45), material("Warm deck boards", "BC9A6F", noise=True))
            for x in (-10, 10):
                for y in range(4, 28, 5):
                    prop("kenney-nature/fence_planks.glb", x, y, 1.5, math.pi / 2)
            windmill(-14, 22, 12)
    if theme == "mist" or identity == "valley-lakeshore":
        for x in (-9, -12, 11, 14):
            prop("kenney-nature/grass_leafsLarge.glb", x, 18, 1.4)
        prop("kenney-nature/canoe.glb", -8, 24, .75, .7)
        if identity == "mist-islet":
            plane("Dry lakeside stone terrace", (0, 5, .04), (25, 36), stone)
        if identity == "mist-sanctuary":
            prop("xingyin-environment-v2/wetland_willow_island.glb", -9, 22, 7)
    if theme == "shore":
        if identity != "shore-cabin":
            prop("kenney-pirate/palm-detailed-straight.glb", -10, 20, 7, -.3)
            prop("kenney-pirate/palm-detailed-straight.glb", 12, 30, 6, .6)
        if identity == "shore-wreck":
            prop("kenney-pirate/ship-wreck.glb", 2, 29, 7, .2)
        if identity == "shore-dock":
            plane("Harbour deck", (0, 4, .06), (30, 45), material("Weathered deck", "B6A28D", noise=True))
            prop("kenney-pirate/mast.glb", -9, 20, 7)
            prop("kenney-pirate/boat-row-large.glb", 11, 25, 1.4, -.2)
            for x in (-8, 9):
                prop("kenney-pirate/barrel.glb", x, 14, 1.4)
                prop("kenney-pirate/crate.glb", x + 1.5, 17, 1.2)
        if identity == "shore-cabin":
            boards = material("Ship hold timber", "A38C78", noise=True)
            plane("Open ship hold floor", (0, 8, .07), (30, 52), boards)
            for x in (-11, 11):
                cube("Ship hold side wall", (x, 20, 3.8), (.4, 28, 7.6), boards, .08)
                for y in range(8, 35, 5):
                    cube("Curved hull rib", (x, y, 4), (.55, .55, 8), boards, .16)
            for x in (-8, 8):
                prop("kenney-pirate/barrel.glb", x, 17, 1.8)
                prop("kenney-pirate/crate.glb", x + 1.5, 21, 1.5)
            for x in range(-15, 16):
                plane("Ship floor plank seam", (x, 8, .075), (.025, 52), material("Deck seam", "665547"))
            cube("Hull end wall", (0, 34, 4.5), (25, .6, 9), boards, .1)
            cube("Broken hull skylight", (0, 33.6, 5.5), (8, .1, 4.5), material("Sea light", "ACD7DF", emission=.8), .15)
        if identity != "shore-cabin":
            for x, y in [(-9, 8), (11, 14), (-13, 21)]:
                rock(x, y, 1.2, theme)
    if theme == "grave":
        model.arch((0, 32, .1), 6, 6.8, .5, "93A4AF")
        for x in (-8, 8, -12, 12):
            prop("kenney-graveyard/gravestone-round.glb", x, 18 + abs(x), 1.5)
            prop("kenney-graveyard/lantern-glass.glb", x, 14, 1.5)
        if identity == "grave-mooncourt":
            plane("Quiet moonlit court", (0, 3, .04), (28, 46), stone)
    if theme == "ridge" or identity in ("valley-rocks", "peak-meadow"):
        for x, y, h in [(-15, 18, 1.1), (17, 24, 1.4)]:
            rock(x, y, h)
    if theme == "peak":
        if identity == "peak-throne":
            plane("Summit fighting court", (0, 2, .05), (32, 46), stone)
            model.arch((0, 30, .1), 8, 7, .5, "A5BAC4")
        if identity == "peak-observatory":
            model.pedestal((0, 26, .02), 3.2, 2.5, .55, "A3BCC6")
            model.limb((0, 26, .6), (0, 26, 2.8), .13, .11, "657983")
            for angle in (0, math.tau / 3, math.tau * 2 / 3):
                model.limb((0, 26, 1.8), (math.cos(angle), 26 + math.sin(angle), .6), .08, .06, "657983")
            model.limb((-1.2, 26, 2.5), (1.2, 26, 3.2), .27, .34, "D8BB73", 12)
            model.limb((1.2, 26, 3.2), (1.28, 26, 3.23), .36, .36, "476B7D", 12)
        for x in (-9, 9):
            prop("xingyin-environment-v2/highland_star_garden.glb", x, 23, 1.5)
    if identity in ("meadow-arena", "ridge-training"):
        for x in (-9, 9):
            for y in range(10, 30, 5):
                prop("kenney-nature/fence_simple.glb", x, y, 1.5, math.pi / 2)
            prop("kenney-pirate/flag-pennant.glb", x, 26, 3)
    if theme in ("valley", "meadow", "mist", "farm", "ridge", "grave") and identity != "farm-windmill":
        grove = identity in ("valley-grove", "meadow-sanctuary", "mist-sanctuary", "ridge-training", "grave-deepwood")
        near_shore = theme == "mist" or identity == "valley-lakeshore"
        tree_positions = [(-15, 16, 6.5), (16, 18, 7), (-19, 36, 7), (21, 38, 7)]
        if grove:
            tree_positions += [(-13, 7, 9), (14, 10, 9), (-20, 4, 10), (20, 7, 10)]
        for x, y, h in tree_positions:
            if near_shore and 22 < y < 34:
                y = 36
            tree(x, y, h, pine=theme in ("ridge", "grave"))
        for x in range(-30, 31, 6):
            if abs(x) > 4:
                tree(x + random.uniform(-1, 1), 40 + random.uniform(-2, 7), random.uniform(4, 6), pine=theme == "ridge")
    # Framing accents stay outside the central character/HUD safe area.
    if not architecture and theme not in ("grave", "peak", "shore"):
        for x in (-11, 11):
            prop("xingyin-environment-v2/nature/bush_large.glb", x, 1, 1.6)
            for _ in range(40):
                prop("kenney-nature/grass.glb", x + random.uniform(-4, 4), random.uniform(-10, 20), random.uniform(.25, .6))
                if theme not in ("shore", "ridge") and random.random() < .2:
                    prop("kenney-nature/flower_yellowC.glb", x + random.uniform(-3, 3), random.uniform(-5, 15), .35)

    bpy.ops.object.light_add(type="SUN", location=(-15, -10, 28))
    sun = bpy.context.object
    sun.rotation_euler = (math.radians(25), math.radians(-24), math.radians(-32))
    sun.data.energy = 1.8 if theme != "grave" else 1.2
    sun.data.angle = math.radians(9)
    sun.data.color = (.85, .9, 1) if theme == "grave" else (1, .95, .86)
    bpy.ops.object.light_add(type="AREA", location=(0, -8, 18))
    fill = bpy.context.object
    fill.data.energy, fill.data.size = 1700, 20
    fill.rotation_euler = (Vector((0, 8, 0)) - fill.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add(location=(0, -24, 9))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 13, .6)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 33
    scene.camera = camera
    scene.render.filepath = str(OUT / f"{identity}.png")
    if identity == "valley-meadow":
        studio = ROOT / "art/battle-backgrounds/battle-background-studio.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(studio))
    bpy.ops.render.render(write_still=True)
    (OUT / f"{identity}.placement.json").write_text(json.dumps({
        "scene": identity,
        "placed": len(_placed_prop_bounds),
        "skipped": len(_skipped_props),
        "skippedByReason": {
            reason: sum(item["reason"] == reason for item in _skipped_props)
            for reason in ("centre-safe-area", "footprint-overlap")
        },
        "overlaps": sum(_bounds_overlap(a, b, padding=0) for i, a in enumerate(_placed_prop_bounds)
                        for b in _placed_prop_bounds[i + 1:]),
        "footprints": _placed_prop_bounds
    }, ensure_ascii=False, indent=2))
    print("BATTLE_BACKGROUND_RENDERED", identity, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--only")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    OUT.mkdir(parents=True, exist_ok=True)
    prompts = [json.loads(line) for line in (ROOT / "art/battle-backgrounds/prompts.jsonl").read_text().splitlines() if line.strip()]
    for prompt in prompts:
        identity = Path(prompt["out"]).stem
        if not args.only or identity in args.only.split(","):
            build(identity)
