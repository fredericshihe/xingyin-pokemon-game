"""Original, texture-free environment landmarks, authored in Blender metres (Z up)."""
import bpy, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/3d/xingyin-environment-v1'
ART = ROOT / 'art/environment'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
mat = bpy.data.materials.new('Environment satin vertex palette')
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .78
color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
color.layer_name = 'Color'
mat.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
parts = []

def paint(obj, hexcolor):
    rgb = [int(hexcolor[i:i+2], 16)/255 for i in (0,2,4)]
    rgba = tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
    obj.data.materials.append(mat)
    attr = obj.data.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
    for v in attr.data: v.color = rgba
    parts.append(obj)
    return obj

def box(name, p, size, col, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o=bpy.context.object; o.name=name; o.scale=size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        m=o.modifiers.new('Soft worn edges','BEVEL');m.width=bevel;m.segments=2
        bpy.ops.object.modifier_apply(modifier=m.name)
    return paint(o,col)

def cone(name,p,r1,r2,depth,col,vertices=16):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=p)
    o=bpy.context.object;o.name=name
    return paint(o,col)

def finish(name,offset):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:p.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    o=bpy.context.object;o.name=name
    bpy.context.scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True)
    o.location.x=offset
    parts.clear()

# A full mill: masonry plinth, plaster tower, timber trims, roof, entry and sails.
cone('stone foundation',(0,0,.12),1.02,1.02,.24,'9C9484')
cone('plaster tower',(0,0,1.36),.9,.69,2.48,'F2DDB3')
for z,r in [(0.33,.89),(1.04,.84),(2.5,.70)]:
    cone('timber ring',(0,0,z),r+.035,r+.035,.09,'775444')
for a in range(0,360,90):
    rad=math.radians(a)
    box('vertical timber',(math.cos(rad)*.78,math.sin(rad)*.78,1.33),(.095,.095,2.2),'775444')
cone('roof eaves',(0,0,2.61),.98,.98,.13,'536D75')
cone('slate roof',(0,0,3.02),1.0,.11,.77,'627F87')
cone('roof finial',(0,0,3.48),.11,.02,.23,'D6AC59')
box('door frame',(0,-.878,.62),(.64,.09,1.04),'78523D')
box('door',(0,-.937,.60),(.48,.055,.88),'B68053')
for x in [-.14,0,.14]:box('door planks',(x,-.971,.60),(.018,.02,.80),'8E5C3D',.005)
box('door step',(0,-1.03,.12),(.76,.46,.22),'BBB0A0')
for a in [0,math.pi/2,math.pi]:
    x,y=math.sin(a)*.805,math.cos(a)*.805
    w=box('window frame',(x,y,1.82),(.48,.10,.61),'775444');w.rotation_euler.z=-a
    w=box('window glass',(x+math.sin(a)*.06,y+math.cos(a)*.06,1.82),(.34,.04,.45),'76ADB5');w.rotation_euler.z=-a
    w=box('window mullion',(x+math.sin(a)*.09,y+math.cos(a)*.09,1.82),(.038,.035,.48),'F2DDB3');w.rotation_euler.z=-a
# Sails stand forward of the door; all four belong to this complete building.
hub=(0,-.99,2.27)
for a in [math.pi/4+i*math.pi/2 for i in range(4)]:
    for radius,length,width,col,y in [(.78,1.5,.085,'705241',-1.01),(1.04,.82,.30,'F3E5C6',-1.03)]:
        o=box('sail',(math.sin(a)*radius,y,hub[2]+math.cos(a)*radius),(width,.055,length),col,.01)
        o.rotation_euler.y=a
    for r in [.72,.91,1.10,1.29]:
        o=box('sail rib',(math.sin(a)*r,-1.075,hub[2]+math.cos(a)*r),(.34,.025,.027),'AF9068',.004)
        o.rotation_euler.y=a
bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=.14,location=hub)
paint(bpy.context.object,'CCA153')
finish('farm_windmill',0)

# Broken masonry, deliberately no board-game hexagonal base.
for x in [-.85,.85]:
    box('footing',(x,0,.13),(.65,.75,.26),'8E9689')
    for i in range(5):
        box('stone course',(x,0,.46+i*.39),(.48 if i%2 else .55,.54,.36),'ADB4A0' if i%2 else '9DA895',.055)
box('lintel',(-.22,0,2.33),(1.88,.65,.37),'B8B9A2',.065)
box('broken crown',(-.65,0,2.6),(.68,.55,.22),'929B88',.04)
for x,z in [(-.85,.48),(.85,1.65),(-.62,2.55)]:
    box('moss seam',(x,-.285,z),(.36,.05,.06),'6B8759',.01)
finish('ruin_arch',5)

# A small starwatch marker gives the highland a geographical landmark.
cone('stone plinth',(0,0,.10),.83,.83,.2,'878498',12)
cone('stone step',(0,0,.26),.66,.62,.16,'AEA8BA',12)
cone('obsidian shaft',(0,0,1.05),.32,.21,1.45,'55566D',8)
cone('brass cap',(0,0,1.79),.38,.38,.11,'D0AF68',16)
bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=(0,0,2.16),major_radius=.42,minor_radius=.028)
paint(bpy.context.object,'DBBD76').rotation_euler.x=.8
bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=(0,0,2.16),major_radius=.32,minor_radius=.023)
paint(bpy.context.object,'DBBD76').rotation_euler.y=1.1
bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.14,location=(0,0,2.16))
paint(bpy.context.object,'A1D0D4')
finish('starwatch_marker',9)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'environment-landmarks.blend'))
