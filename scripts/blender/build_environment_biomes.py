"""Author original biome gardens in metres; export grounded, Y-up GLBs.

Run with Blender --background --python scripts/blender/build_environment_biomes.py.
Each garden is one mesh, one vertex-color material, no textures or animations.
The saved source retains an organized gallery; exported objects remain at origin.
"""
import bpy
import math
import random
import json
import subprocess
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/3d/xingyin-environment-v2'
ART = ROOT / 'art/environment'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(2718)
MATERIAL = bpy.data.materials.new('Biome gardens · satin vertex palette')
MATERIAL.use_nodes = True
shader = MATERIAL.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .83
color = MATERIAL.node_tree.nodes.new('ShaderNodeVertexColor')
color.layer_name = 'Color'
MATERIAL.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
PARTS, ASSETS, OBJECTS = [], [], []


def paint(obj, shade):
    rgb = [int(shade[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)
    obj.data.materials.append(MATERIAL)
    attr = obj.data.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
    for polygon in obj.data.polygons:
        factor = random.uniform(.94, 1.035)
        for index in polygon.loop_indices:
            attr.data[index].color = tuple(min(1., v * factor) for v in linear) + (1.,)
    PARTS.append(obj)
    return obj


def mesh(name, vertices, faces, shade):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return paint(obj, shade)


def box(name, p, size, shade, angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.rotation_euler.z = angle
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return paint(obj, shade)


def cone(name, p, r1, r2, height, shade, sides=8):
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=r1, radius2=r2, depth=height, location=p)
    obj = bpy.context.object
    obj.name = name
    return paint(obj, shade)


def ellipsoid(name, p, size, shade, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=p)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    return paint(obj, shade)


def limb(name, a, b, r1, r2, shade, sides=6):
    a, b = Vector(a), Vector(b)
    obj = cone(name, (a + b) * .5, r1, r2, (b - a).length, shade, sides)
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return obj


def rock(p, size=(.65, .48, .5), shade='8F9B99'):
    return ellipsoid('weathered faceted boulder', (p[0], p[1], p[2] + size[2] * .76), size, shade)


def bush(x, y, z=.15, r=.7, shade='5D9468'):
    return ellipsoid('rounded undergrowth', (x, y, z + r * .5), (r, r * .77, r * .75), shade, 1)


def flower(x, y, height, shade, scale=1):
    cone('flower stem', (x, y, height * .5), .028, .019, height, '68895A', 5)
    for i in range(5):
        a = i * math.tau / 5
        obj = ellipsoid('soft flower petal', (x + .12 * scale * math.cos(a), y + .12 * scale * math.sin(a), height),
                        (.16 * scale, .105 * scale, .075 * scale), shade)
        obj.rotation_euler.z = a
    cone('flower heart', (x, y, height + .035 * scale), .085 * scale, .06 * scale, .095 * scale, 'F0C861', 6)


def tree(x, y, height=3.5, leaf='73A26F', fruit=False):
    limb('warm timber trunk', (x, y, .02), (x + .09, y, height * .72), .16, .10, '815E49', 7)
    for dx, dy, dz, radius, shade in [(-.51, .05, .70, .89, leaf), (.48, .14, .76, .98, leaf), (0, -.13, .92, .90, leaf)]:
        limb('forked branch', (x, y, height * .48), (x + dx, y + dy, height * dz), .075, .035, '815E49', 5)
        ellipsoid('broad sculpted canopy', (x + dx, y + dy, height * dz), (radius, radius * .85, radius * .84), shade, 2)
    if fruit:
        for dx, dy, z in [(-.73, -.45, height * .73), (.59, -.52, height * .77), (.17, -.69, height * .95), (.91, .14, height * .73)]:
            ellipsoid('ripe orchard fruit', (x + dx, y + dy, z), (.115, .115, .125), 'E9A348')


def pine(x, y, height=3.8, shade='59796E', snowy=False):
    cone('pine trunk', (x, y, height * .29), .18, .10, height * .58, '826C5B', 7)
    for i, (z, radius, depth) in enumerate([(.43, .96, .36), (.64, .78, .35), (.83, .52, .34)]):
        cone('tiered alpine crown', (x, y, height * z), radius * height / 3.8, .03, height * depth, shade, 7)
        if snowy:
            cone('snow crown', (x, y, height * (z + .07)), radius * height / 3.8 * .73, .018, height * depth * .73, 'D6EBE7', 7)


def crystal(x, y, z, height, radius, shade='92CEC9', lean=0):
    obj = cone('hexagonal crystal body', (x, y, z + height * .34), radius, radius * .84, height * .68, shade, 6)
    obj.rotation_euler.y = lean
    obj = cone('cut crystal crown', (x, y, z + height * .84), radius * .84, 0, height * .32, shade, 6)
    obj.rotation_euler.y = lean


def fern(x, y, z, size=1, shade='6B9172'):
    for i in range(7):
        a = math.tau * i / 7
        dx, dy = math.cos(a), math.sin(a)
        px, py = -dy, dx
        points = [(x, y, z), (x + dx * size * .42 + px * size * .20, y + dy * size * .42 + py * size * .20, z + size * .31),
                  (x + dx * size, y + dy * size, z + size * .16),
                  (x + dx * size * .42 - px * size * .20, y + dy * size * .42 - py * size * .20, z + size * .31),
                  (x + dx * size * .45, y + dy * size * .45, z + size * .4)]
        mesh('folded broad leaf', points, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)], shade)


def finish(name, label, tags):
    bpy.ops.object.select_all(action='DESELECT')
    for part in PARTS:
        part.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    # Eliminate duplicate slots introduced by joins; every polygon uses one palette.
    obj.data.materials.clear()
    obj.data.materials.append(MATERIAL)
    for poly in obj.data.polygons:
        poly.material_index = 0
    # Exact ground contact, including hand-shaped rocks and leaning branches.
    bottom = min(v.co.z for v in obj.data.vertices)
    for v in obj.data.vertices:
        v.co.z -= bottom
    obj.data.calc_loop_triangles()
    count = len(obj.data.loop_triangles)
    assert count <= 1200, (name, count)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB', use_selection=True,
                              export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
    ASSETS.append({'name': name, 'label': label, 'themeTags': tags, 'triangles': count})
    OBJECTS.append(obj)
    PARTS.clear()


# Sunny meadow: a large flowering dogwood, warm stones and a low petal border.
tree(-.5, .4, 2.9, 'A3BE76')
rock((.86, .12, 0), (.82, .60, .47), 'B9B79C')
bush(-1.35, -.45, r=.55, shade='7EA666')
bush(.65, .66, r=.55, shade='8CAB70')
for x, y, h, shade in [(-.85, -.91, .4, 'F0D99A'), (-.18, -.80, .55, 'F5E5C0'), (.47, -.79, .37, 'E4A8A9'), (1.17, -.58, .50, 'F0D99A')]:
    flower(x, y, h, shade, 1.05)
finish('meadow_flower_island', '晴野花树', ['meadow', 'tree', 'flowers', 'biome'])

# Forest: deliberately layered, offset crowns and fern silhouettes.
tree(-.64, .39, 3.6, '4C8063')
tree(.94, .75, 2.75, '76A174')
rock((-.85, -.65, 0), (.73, .56, .48), '819285')
fern(.72, -.58, .04, .91, '88AF74')
fern(-1.4, -.24, .02, .56, '6F9B68')
finish('forest_canopy_group', '密林蕨木', ['forest', 'tree', 'fern', 'biome'])

# Wetland: elongated willow boughs, reeds and quiet blue-grey stones.
limb('willow trunk', (-.25, .4, 0), (-.42, .35, 2.7), .23, .12, '716C58', 7)
for dx, dy, z, r in [(-.8, .12, 2.50, .76), (.36, .35, 2.82, .89), (.79, -.03, 2.49, .73), (-.08, -.48, 2.57, .79)]:
    limb('willow branch', (-.40, .35, 1.65), (dx, dy, z), .085, .035, '716C58')
    ellipsoid('hanging willow crown', (dx, dy, z), (r, r * .78, .69), '8DAE83', 2)
    for ox, oy in [(-.36, 0), (.29, -.12)]:
        cone('drooping willow foliage', (dx + ox, dy + oy, z - .67), .07, .24, 1.36, '79A48A', 5)
rock((.96, .64, 0), (.78, .56, .35), '8DABAB')
for x, y, h in [(1.2, -.35, 1.2), (1.48, -.24, .9), (1.06, -.65, 1.0), (-1.22, -.44, .95), (-1.42, -.29, .7)]:
    limb('slender marsh reed', (x, y, 0), (x + .08, y, h), .022, .012, '779563', 5)
    cone('reed seedhead', (x + .08, y, h), .058, .055, .29, 'BDA87A', 5)
fern(.16, -.65, 0, .65, '67977E')
finish('wetland_willow_island', '沼泽垂柳', ['wetland', 'willow', 'reed', 'biome'])

# Orchard: one mature fruit tree, one young companion, a small harvest basket.
tree(-.53, .38, 3.0, '8BA360', True)
pine(1.1, .47, 1.9, '8DA76F')
bush(.45, -.76, r=.48, shade='9BAE67')
bush(-1.4, -.49, r=.43, shade='87A25B')
box('harvest crate', (.95, -.52, .28), (.63, .50, .49), 'BD905C')
for z in [.12, .34]:
    box('crate bands', (.95, -.779, z), (.65, .035, .07), '8E674A')
for x, y in [(.80, -.44), (1.08, -.46), (.94, -.62)]:
    ellipsoid('harvest fruit', (x, y, .57), (.15, .14, .13), 'E6AD51')
rock((-.34, -.63, 0), (.28, .24, .20), 'BFB491')
finish('farm_orchard_group', '田园果树', ['farm', 'orchard', 'tree', 'biome'])

# Shore: sweeping folded palm leaves, sunlit stones and a tropical understory.
for x, y, h, bend in [(-.53, .37, 3.5, -.24), (.91, .67, 2.6, .22)]:
    for k in range(4):
        a, b = k / 4, (k + 1) / 4
        limb('ringed palm trunk', (x + bend * a * a, y, h * a), (x + bend * b * b, y, h * b), .16 - .07 * a, .16 - .07 * b, 'BCA67E', 7)
    for i in range(7):
        a = i * math.tau / 7 + .2
        dx, dy, px, py = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
        cx = x + bend
        s = h / 3.5
        points = [(cx, y, h), (cx + dx * .83 * s + px * .29 * s, y + dy * .83 * s + py * .29 * s, h + .18),
                  (cx + dx * 1.54 * s, y + dy * 1.54 * s, h - .42),
                  (cx + dx * .83 * s - px * .29 * s, y + dy * .83 * s - py * .29 * s, h + .18),
                  (cx + dx * .79 * s, y + dy * .79 * s, h + .30)]
        mesh('folded palm fan', points, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)], '739D7C' if i % 2 else '90B383')
    for dx, dy in [(-.13, -.08), (.12, -.05)]:
        ellipsoid('coconut', (x + bend + dx, y + dy, h - .13), (.16, .15, .18), 'A98659')
rock((.30, -.48, 0), (.90, .59, .47), 'E0CDA8')
fern(-1.24, -.48, 0, .76, '88AA83')
fern(1.15, -.38, 0, .63, 'A3B58E')
finish('shore_palm_island', '海岸棕榈', ['coast', 'palm', 'beach', 'biome'])

# Grave garden: an unmistakable memorial, soft cypress shapes, pale votives.
cone('memorial stone foot', (-.15, .3, .15), .65, .58, .30, '8C91A6', 8)
box('memorial upright', (-.15, .3, 1.30), (.64, .37, 2.12), 'BDC1CC')
box('memorial cap', (-.15, .3, 2.4), (.87, .54, .18), 'CFD0D3')
cone('memorial crown', (-.15, .3, 2.70), .27, 0, .46, 'AEB7C4', 4)
box('inlaid remembrance', (-.15, .105, 1.47), (.32, .015, .65), '737E9B')
for x, y, h in [(-1.19, .61, 2.9), (1.0, .83, 2.28)]:
    cone('cypress trunk', (x, y, h * .19), .1, .075, h * .38, '706879', 6)
    ellipsoid('slender cypress', (x, y, h * .59), (.46, .39, h * .54), '718295', 2)
rock((.95, -.25, 0), (.47, .37, .27), '9496AA')
bush(-.96, -.46, r=.52, shade='8A96A0')
for x, y in [(.23, -.41), (.62, -.57), (-.23, -.60)]:
    cone('ivory remembrance candle', (x, y, .17), .075, .068, .32, 'EAE0C3', 7)
    ellipsoid('warm amber candle tip', (x, y, .36), (.045, .045, .09), 'EAC77A')
flower(-.67, -.77, .34, 'BAB4D5', .75)
finish('grave_memorial_group', '静墓纪念园', ['grave', 'memorial', 'cypress', 'biome'])

# Ruin: two columns, displaced fragments and mature climbing foliage.
for x, y, h in [(-.67, .38, 2.85), (.95, .69, 1.93)]:
    box('column foundation', (x, y, .13), (.88, .90, .26), 'AFAF95')
    cone('column lower collar', (x, y, .37), .44, .37, .25, 'C7C3A4', 8)
    cone('octagonal column', (x, y, h * .5 + .3), .29, .26, h - .6, 'D5CFB1', 8)
    box('column capital', (x, y, h - .07), (.84, .76, .20), 'C5C1A5')
box('broken upper crossbeam', (-.26, .4, 2.95), (1.56, .78, .24), 'B7B699', -.13)
rock((.38, -.50, 0), (.78, .52, .39), 'B9BBA1')
rock((-1.17, -.48, 0), (.48, .39, .31), 'A3AB94')
bush(-.93, .24, .15, .63, '789C75')
bush(.91, .52, .64, .59, '82A17B')
fern(.95, -.47, 0, .69, '95B183')
for z in [.55, .95, 1.35]:
    ellipsoid('trailing ivy', (-.79, .03, z), (.23, .15, .20), '88A57D')
finish('ruin_column_garden', '古迹藤柱', ['ruin', 'column', 'ivy', 'biome'])

# Mountain ridge: readable tall conifers with a substantial rocky base.
rock((-.14, .13, 0), (1.05, .81, .74), '8B9693')
rock((1.00, -.35, 0), (.67, .53, .52), 'A5AAA0')
pine(-.65, .55, 4.10, '54796A')
pine(1.09, .82, 2.92, '719282')
bush(-1.15, -.56, r=.5, shade='7A9272')
fern(.14, -.90, 0, .48, '9BAC83')
finish('ridge_pine_outcrop', '山脊松岩', ['ridge', 'pine', 'stone', 'biome'])

# High plateau: three upright star-stones and a quiet lavender alpine garden.
for x, y, h, r in [(-.65, .41, 2.66, .32), (.66, .58, 1.84, .26), (1.08, -.26, 1.05, .19)]:
    crystal(x, y, 0, h, r, '9994B9')
    cone('gilded star-stone ring', (x, y, h * .47), r + .04, r + .035, .08, 'DEBE76', 6)
rock((-.30, -.35, 0), (.82, .68, .34), 'B8B1CA')
bush(-1.08, -.39, r=.59, shade='969FB0')
bush(.74, .89, r=.43, shade='A7A2BB')
for x, y, h in [(-.71, -.81, .4), (.03, -.85, .35), (.80, -.72, .34)]:
    flower(x, y, h, 'DDD3F2', .83)
finish('highland_star_garden', '星原石花园', ['highland', 'star', 'crystal', 'biome'])

# Frost court: crystalline fans grounded by snowy blue boulders.
rock((-.15, .23, 0), (1.06, .83, .56), 'B2CDD1')
rock((.93, -.34, 0), (.65, .50, .38), 'D6E4E0')
for x, y, z, h, r, shade in [(-.65, .41, .13, 3.1, .37, '94C5D5'), (.04, .61, .32, 2.23, .35, 'BDDDE4'),
                              (.64, .57, .09, 1.69, .32, '81B7C9'), (-1.12, -.17, 0, 1.25, .27, 'D7E9EA')]:
    crystal(x, y, z, h, r, shade)
pine(1.09, .87, 2.43, '8EADB2', True)
for x, y, r in [(-.48, -.54, .31), (.38, -.65, .23), (1.35, -.58, .20)]:
    rock((x, y, 0), (r, r * .76, r * .47), 'E3EEEE')
finish('frost_crystal_garden', '霜晶雪松', ['frost', 'ice', 'crystal', 'biome'])

# Tide court: coral antlers with large folded sea leaves and bleached limestone.
rock((-.28, .32, 0), (1.02, .76, .56), 'ABC9C8')
rock((.98, -.33, 0), (.69, .56, .36), 'D4D4BB')
for x, y, h, shade in [(-.76, .30, 2.25, 'D9A39B'), (.34, .57, 2.8, 'A0C0CA'), (1.09, .51, 1.68, 'AFAFC7')]:
    limb('coral trunk', (x, y, .17), (x + .06, y, h * .77), .15, .065, shade)
    for sign, fac in [(-1, .58), (1, .76)]:
        limb('coral branch', (x, y, h * fac * .7), (x + sign * .44, y, h * fac), .08, .059, shade)
        limb('coral branch tip', (x + sign * .44, y, h * fac), (x + sign * .51, y + .02, h * (fac + .19)), .059, .016, shade)
    limb('coral tip', (x + .06, y, h * .77), (x + .15, y, h), .065, .012, shade)
fern(-.96, -.53, .02, .82, '73AAA6')
fern(.48, -.69, .02, .69, '8FBDB7')
for x, y in [(-.30, -.58), (.18, -.51)]:
    ellipsoid('tide pearl', (x, y, .16), (.19, .17, .15), 'ECDFBE')
finish('tide_coral_garden', '潮汐珊瑚庭', ['tide', 'coral', 'sea', 'biome'])

# Iron court: a stout furnace, copper fittings and iron ore, no animated fire.
box('furnace foundation', (-.30, .36, .17), (1.36, 1.24, .34), '676F73')
box('forged furnace', (-.30, .36, 1.27), (1.08, 1.00, 1.91), '879496')
box('furnace upper collar', (-.30, .36, 2.24), (1.27, 1.15, .24), 'A3AAA4')
cone('copper chimney', (-.30, .36, 2.76), .31, .28, .84, 'AF8160', 8)
cone('chimney rim', (-.30, .36, 3.22), .39, .39, .12, 'D1A77C', 8)
box('black iron hatch', (-.30, -.159, .94), (.75, .065, .79), '414D57')
box('banked ember glass', (-.30, -.197, .94), (.54, .015, .48), 'D69865')
for x in [-.48, -.30, -.12]:
    box('hatch grate', (x, -.215, .94), (.04, .03, .56), '55606A')
for z in [.52, 1.80]:
    box('furnace iron band', (-.30, .36, z), (1.16, 1.08, .12), '637079')
limb('elbow pipe upright', (.45, .52, .22), (.45, .52, 1.63), .12, .12, 'C49871', 8)
limb('elbow pipe spout', (.45, .52, 1.63), (.84, .52, 1.63), .12, .12, 'C49871', 8)
rock((1.04, -.24, 0), (.67, .51, .50), '768C97')
rock((.94, .78, 0), (.44, .37, .67), '66808B')
rock((-1.24, -.40, 0), (.43, .34, .40), '9BACA8')
for x, y, z in [(.92, -.42, .71), (1.18, -.16, .75)]:
    crystal(x, y, z, .42, .09, 'C9C6A3')
finish('iron_forge_cluster', '铁壁铸炉', ['iron', 'forge', 'industrial', 'biome'])

# Dragon court: a prehistoric rib fan emerging from dark crystalline shale.
rock((-.27, .30, 0), (1.17, .76, .64), '777890')
rock((.96, -.30, 0), (.64, .49, .41), '9394A5')
for y, h, width in [(.03, 3.17, 1.20), (.65, 2.59, .95)]:
    for sign in [-1, 1]:
        points = [(sign * width, y, .25), (sign * (width + .12), y, h * .41),
                  (sign * width * .73, y, h * .78), (sign * width * .29, y, h)]
        for k in range(3):
            limb('sweeping fossil rib', points[k], points[k + 1], .16 - k * .035, .125 - k * .04, 'C8C4B3', 7)
        crystal(sign * width * .29, y, h, .23, .045, 'DDD4B9')
for x, y, h in [(-.57, -.52, 1.18), (.28, .27, 1.71), (.74, -.48, .79)]:
    crystal(x, y, 0, h, .19, 'A6A1C2')
fern(-1.24, -.50, 0, .53, '8E91A5')
finish('dragon_bone_spires', '龙骸晶脊', ['dragon', 'fossil', 'crystal', 'biome'])

# Champion court: a generous laurel crown and elegant stepped limestone basin.
cone('garden pedestal lower step', (0, .24, .12), .77, .77, .24, 'C8CCB9', 8)
cone('garden pedestal', (0, .24, .47), .61, .48, .50, 'DFDFC7', 8)
cone('gold basin collar', (0, .24, .78), .63, .65, .12, 'DDBD76', 8)
cone('laurel basin', (0, .24, .96), .62, .79, .25, 'E7E0C3', 8)
cone('basin earth', (0, .24, 1.085), .68, .68, .025, '918F68', 8)
tree(-.1, .3, 3.6, '9FB77C')
bush(-1.15, -.28, r=.57, shade='91A570')
bush(1.02, .04, r=.63, shade='A9B67B')
for x, y, h in [(-.69, -.72, .36), (.19, -.74, .37), (.90, -.66, .41)]:
    flower(x, y, h, 'F4E7BB', .81)
finish('champion_laurel_garden', '冠军月桂庭', ['champion', 'laurel', 'garden', 'biome'])

# Secondary iron scenery uses horizontal silhouettes to interrupt furnace rows.
for x in [-.76, .68]:
    box('low steel rack upright', (x, .25, .55), (.15, .19, 1.10), '77868D')
    box('rack broad foot', (x, .25, .06), (.39, .71, .12), '596C78')
for z in [.29, .83]:
    box('steel shelf', (-.04, .25, z), (1.77, .68, .12), '87989C')
    for x in [-.76, .68]:
        rivet = cone('copper rack rivet', (x, -.112, z), .045, .043, .03, 'D0AD76', 6)
        rivet.rotation_euler.x = math.pi / 2
for x, y, z, size in [(-.45, .23, .90, (.27, .22, .24)), (.20, .32, .90, (.32, .24, .28)),
                       (.75, -.40, 0, (.41, .32, .29)), (1.04, -.16, 0, (.26, .25, .22))]:
    rock((x, y, z), size, '91A5AC')
for y, z in [(.15, .43), (.39, .46)]:
    box('stored steel beam', (-.09, y, z), (1.25, .10, .11), 'A8B5AF')
box('copper ore ingot', (-.29, -.43, .13), (.61, .28, .25), 'BC9B72', .12)
rock((-.96, -.43, 0), (.26, .21, .19), '6C8694')
finish('iron_ore_rack', '铁矿储架', ['iron', 'ore', 'rack', 'biome'])

# Companion vent assembly: twin steel drums, copper conduits, static louvres.
box('vent foundation', (-.18, .18, .10), (1.45, 1.11, .20), '78858A')
for x, y, h, radius in [(-.54, .35, 1.97, .29), (.26, .38, 1.51, .25)]:
    cone('vent steel stack', (x, y, h * .5 + .12), radius, radius * .95, h, '95A8A9', 8)
    for z in [.39, h - .14]:
        cone('stack copper band', (x, y, z), radius + .035, radius + .035, .10, 'B99871', 8)
    cone('vent rain cap', (x, y, h + .18), radius + .12, radius * .5, .19, '687F8D', 8)
    for k in range(3):
        box('dark vent louvre', (x, y - radius - .008, h - .47 + k * .13), (radius * 1.37, .025, .055), '516B7A')
limb('crossing outlet pipe', (-.52, .37, .68), (.76, .37, .68), .13, .13, 'B99371', 8)
limb('pipe downward elbow', (.76, .37, .68), (.93, .37, .43), .13, .13, 'B99371', 8)
rock((.93, -.28, 0), (.36, .33, .24), '8099A1')
rock((-1.04, -.28, 0), (.29, .24, .24), 'ACB4A7')
finish('iron_vent_stack', '铁壁排风管', ['iron', 'vent', 'pipe', 'biome'])

# Basalt fills the low visual layer beneath the dragon court's tall rib spires.
for x, y, h, radius, shade in [(-.70, .22, .88, .39, '8B88A4'), (-.20, .52, 1.35, .40, '777C96'),
                                (.40, .49, .97, .37, '9390A7'), (.86, .21, .62, .33, 'A19AAF'),
                                (-.21, -.28, .65, .36, '9D96B0'), (.37, -.29, .48, .29, '85849E')]:
    cone('hexagonal basalt column', (x, y, h * .5), radius, radius * .92, h, shade, 6)
    cone('basalt weathered cap', (x, y, h + .03), radius * .93, radius * .79, .08, 'ADA5BB', 6)
rock((-.94, -.40, 0), (.32, .29, .23), 'A7A0B3')
rock((.85, -.39, 0), (.35, .27, .20), '777B94')
crystal(-.49, -.55, .05, .65, .13, 'BAB1D2')
crystal(.60, .03, .60, .56, .12, 'C5BADA')
finish('dragon_basalt_cluster', '龙庭玄武晶岩', ['dragon', 'basalt', 'crystal', 'biome'])

# Pearl shells and soft limestone give the tidal court a lower secondary motif.
rock((-.48, .31, 0), (.79, .59, .40), 'ABC9C7')
rock((.61, .27, 0), (.67, .54, .50), 'C5D5C7')
rock((.95, -.39, 0), (.30, .26, .20), 'DBD6BC')
for x, y, z, radius, shade in [(-.51, -.32, .21, .48, 'EAD5BF'), (.69, .12, .71, .40, 'E2C7B7')]:
    vertices = [(x, y, z), (x, y + radius * .29, z + radius * .25)]
    for i in range(10):
        angle = math.pi * i / 9
        vertices.append((x + math.cos(angle) * radius, y + math.sin(angle) * radius * .85, z + math.sin(angle) * radius * .40))
    faces = []
    for i in range(9):
        faces.extend([(1, i + 2, i + 3), (0, i + 3, i + 2)])
    faces.extend([(0, 2, 1), (0, 1, 11)])
    mesh('scalloped pearl shell', vertices, faces, shade)
    for i in [1, 3, 5, 7]:
        angle = math.pi * i / 9
        limb('shell raised rib', (x, y + radius * .29, z + radius * .27),
             (x + math.cos(angle) * radius * .98, y + math.sin(angle) * radius * .85, z + math.sin(angle) * radius * .40 + .015),
             .018, .011, 'F1E4CD', 4)
fern(-1.02, -.25, 0, .42, '88B5A8')
fern(.30, -.63, 0, .45, '7FA8A6')
ellipsoid('pearl nestled in shell', (-.48, -.15, .36), (.13, .13, .13), 'F0E7CE')
finish('tide_shell_rocks', '潮庭贝壳岩', ['tide', 'shell', 'stone', 'biome'])

# Arrange source models into an uncluttered inspection gallery.
for index, obj in enumerate(OBJECTS):
    obj.location = ((index % 4) * 6.3, (index // 4) * 6.3, 0)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ART / 'environment-biomes.blend'))
(OUT / 'authoring-metadata.json').write_text(json.dumps(ASSETS, ensure_ascii=False, indent=2) + '\n')
# The Blender command is reproducible end to end: optimize, decode, validate,
# measure and regenerate the catalog module before reporting completion.
subprocess.run(['node', '--input-type=module', '-e', r'''
import fs from 'node:fs/promises';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
});
const folder = 'public/assets/3d/xingyin-environment-v2';
const source = JSON.parse(await fs.readFile(`${folder}/authoring-metadata.json`, 'utf8'));
const manifest = [];
for (const item of source) {
  const filename = `${folder}/${item.name}.glb`;
  const doc = await io.read(filename);
  await doc.transform(dedup(), weld(), prune(), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }));
  await io.write(filename, doc);
  const verified = await io.read(filename);
  const root = verified.getRoot(), bounds = getBounds(root.listScenes()[0]);
  const primitives = root.listMeshes().flatMap(mesh => mesh.listPrimitives());
  const triangles = primitives.reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0);
  if (root.listMeshes().length !== 1 || primitives.length !== 1 || root.listMaterials().length !== 1
      || root.listTextures().length || root.listAnimations().length || Math.abs(bounds.min[1]) > .001
      || triangles > 1200 || !primitives[0].getAttribute('COLOR_0')) {
    throw new Error(`Invalid biome asset contract: ${item.name}`);
  }
  manifest.push({ ...item, key: `environment_${item.name}`,
    file: `/assets/3d/xingyin-environment-v2/${item.name}.glb`,
    bytes: (await fs.stat(filename)).size, triangles, bounds, meshCount: 1, materialCount: 1, textureCount: 0,
    footprint: {
      width: Math.ceil(Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])) * 2 / 1.55 * 100) / 100,
      height: Math.ceil(Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2])) * 2 / 1.55 * 100) / 100
    }
  });
}
await fs.writeFile(`${folder}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
const specs = manifest.map(m => ({
  id: m.key, name: m.label, sourcePackage: 'xingyin-original-blender', assetPath: m.file,
  sourceAssetName: `${m.name}.glb`, themeTags: m.themeTags, footprint: m.footprint,
  defaultScale: 1, defaultBlocking: true, heightClass: m.bounds.max[1] >= 2 ? 'high' : 'medium',
  notes: 'Original biome garden; one mesh and vertex-color material; Draco compressed; grounded origin.'
}));
await fs.writeFile('src/game/data/environmentBiomeAssets.js',
  '// Authored with scripts/blender/build_environment_biomes.py. Footprints measured in 1.55 m tiles.\n'
  + 'export const ENVIRONMENT_BIOME_ASSETS = ' + JSON.stringify(specs, null, 2) + '\n');
console.log(`Validated ${manifest.length} biome assets; ${manifest.reduce((sum, m) => sum + m.bytes, 0)} bytes total.`);
'''], cwd=ROOT, check=True)
print('BIOME_EXPORT_COMPLETE', len(ASSETS), 'assets;', sum(asset['triangles'] for asset in ASSETS), 'triangles')

# An optional contact sheet is rendered with temporary studio lights and camera.
# These never enter the source GLBs or the saved authoring scene.
if '--render-preview' in __import__('sys').argv:
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 1440, 1800
    scene.render.resolution_percentage = 100
    scene.world.color = (.55, .55, .55)
    bpy.ops.object.light_add(type='AREA', location=(3, -5, 24))
    bpy.context.object.data.energy = 4300
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 20
    bpy.ops.object.camera_add(location=(25, -29, 47))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((9.45, 12.0, .6)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 41
    scene.camera = camera
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.68, .73, .71, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .7
    scene.render.filepath = str(ART / 'environment-biomes-contact-sheet.png')
    bpy.ops.render.render(write_still=True)
