"""Build the same Xingyin hero in a fitted riding pose; Y-up, +Z forward, one palette.
Run: blender -b --python scripts/blender/build_player_bicycle.py
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector
source = Path(__file__).with_name('build_character_collection.py')
ns = {'__file__': str(source), '__name__': 'bicycle_authoring'}
exec(compile(source.read_text().split('args=sys.argv')[0], str(source), 'exec'), ns)
spec = {**ns['SPECS'][0], 'id': 'player_bicycle', 'label': '星音 · 骑行主角'}
root, record = ns['make_character'](spec)
xyz, tube, rounded, ellipsoid = (ns[k] for k in ('xyz','tube','rounded','ellipsoid'))
# Reuse the original face, cap, jacket, scarf and backpack, with a seated torso.
for obj in list(root.children):
    if obj.name in ('leftArm','rightArm','leftLeg','rightLeg'):
        bpy.data.objects.remove(obj, do_unlink=True)
body = next(obj for obj in root.children if obj.name == 'body')
head = next(obj for obj in root.children if obj.name == 'head')
body.location = xyz((0,.95,-.12)); body.rotation_euler.x = .17
head.location = xyz((0,1.30,.015)); head.rotation_euler.x = -.035
ns['parts'] = {}
ns['current'] = 'bicycleFrame'
# A compact diamond frame, dual fork and visible handlebar grips.
rear=(0,.32,-.55); front=(0,.32,.55); crank=(0,.35,-.09); seat=(0,.77,-.17); neck=(0,.73,.37)
for a,b in [(rear,seat),(rear,crank),(seat,crank),(seat,neck),(crank,neck),(neck,front)]:
    tube('Teal frame',[a,b],.024,'accent',10)
for side in (-1,1):
    tube('Fork',[(side*.05,.72,.36),(side*.05,.32,.55)],.016,'ivory',8)
    tube('Seat stay',[(side*.04,.75,-.17),(side*.055,.32,-.55)],.013,'accent',8)
    tube('Handlebar',[(0,.75,.37),(0,.98,.43),(side*.25,.98,.46)],.015,'ivory',10)
    tube('Rubber grip',[(side*.17,.98,.46),(side*.27,.98,.46)],.024,'dark',10)
rounded('Saddle',(0,.81,-.17),(.23,.052,.25),'dark',.025)
rounded('Front lamp',(0,.91,.47),(.095,.07,.065),'gold',.012)
rounded('Rear reflector',(0,.55,-.70),(.08,.045,.04),'coat',.01)
tube('Crank spindle',[(-.19,.35,-.09),(.19,.35,-.09)],.023,'dark',10)
for side in (-1,1):
    ns['current'] = 'riderArms'
    shoulder=(side*.18,1.19,-.05); elbow=(side*.25,1.09,.20); hand=(side*.245,.99,.45)
    tube('Tailored sleeve',[shoulder,elbow],[.065,.054],'coat',14)
    tube('Forearm',[elbow,hand],[.043,.036],'skin',12)
    ellipsoid('Hands on grip',hand,(.045,.035,.056),'skin',14,8)
# Wheel origins sit on their axles so runtime rotations do not orbit the bicycle.
for name,z in [('rearWheel',-.55),('frontWheel',.55)]:
    ns['current']=name
    bpy.ops.mesh.primitive_torus_add(major_radius=.283,minor_radius=.032,major_segments=32,minor_segments=8,location=xyz((0,.32,z)),rotation=(0,math.pi/2,0))
    ns['paint'](bpy.context.object,'dark')
    for x in (-.014,.014):
        pts=[(x,.32+math.cos(i*2*math.pi/32)*.261,z+math.sin(i*2*math.pi/32)*.261) for i in range(33)]
        tube('Silver wheel rim',pts,.009,'ivory',6)
    for i in range(10):
        angle=i*2*math.pi/10
        tube('Spoke',[(0,.32,z),(0,.32+math.cos(angle)*.26,z+math.sin(angle)*.26)],.0045,'ivory',5)
    tube('Axle',[(-.04,.32,z),(.04,.32,z)],.029,'gold',10)
# Segmented legs are authored along local -Y. Runtime two-link IK keeps both feet on pedals.
for side,label in [(-1,'left'),(1,'right')]:
    for part,length,color,radius in [('Thigh',.29,'dark',.067),('Shin',.29,'dark',.052)]:
        ns['current']=label+part
        tube(part,[(0,0,0),(0,-length,0)],[radius,radius*.84],color,12)
    ns['current']=label+'Shoe'
    rounded('Riding shoe',(0,.025,.025),(.12,.075,.20),'ivory',.025)
    rounded('Sole',(0,-.005,.025),(.125,.022,.20),'dark',.01)
    rounded('Pedal',(0,-.033,0),(.13,.025,.095),'gold',.008)

# Join motion islands using a single shared vertex palette material.
for name,objects in ns['parts'].items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join(); obj=bpy.context.object; obj.name=name
    pivot=(0,.32, -.55 if name=='rearWheel' else .55) if name.endswith('Wheel') else (0,0,0)
    bpy.context.scene.cursor.location=xyz(pivot)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR'); obj.parent=root
    if name.endswith(('Thigh','Shin')): obj['segmentLength']=.29
# Give the exported source a real resting riding pose as well.
for side,label in [(-1,'left'),(1,'right')]:
    hip=Vector((side*.12,.80,-.17)); foot=Vector((side*.19,.35,-.09+side*.115))
    delta=foot-hip; distance=delta.length; center=hip+delta*.5
    forward=Vector((0,-delta.z,delta.y)); forward.normalize()
    if forward.z<0: forward=-forward
    knee=center+forward*math.sqrt(max(0,.29**2-(distance*.5)**2))
    for part,a,b in [('Thigh',hip,knee),('Shin',knee,foot)]:
        obj=bpy.data.objects[label+part]; obj.location=xyz(a)
        obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=Vector((0,0,-1)).rotation_difference(Vector(xyz(b-a)).normalized())
    bpy.data.objects[label+'Shoe'].location=xyz(foot)
bpy.context.view_layer.update()
root['displayName']='星音 · 旅行自行车'; root['frontAxis']='+Z'
# Keep named islands for wheels and IK, prune only redundant geometry in the shipping pipeline.
for obj in root.children: obj.select_set(True)
root.select_set(True); bpy.context.view_layer.objects.active=root
out=ns['OUT']/'player_bicycle.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_texcoords=False,export_materials='EXPORT',export_vertex_color='MATERIAL')
bpy.ops.wm.save_as_mainfile(filepath=str(ns['SOURCE']/'player-bicycle.blend'))
print('BICYCLE_EXPORTED',out,flush=True)
