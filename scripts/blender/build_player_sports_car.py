"""Author a compact open-top tourer with the original Xingyin hero.
Run: blender -b --python scripts/blender/build_player_sports_car.py
Exports Y-up, +Z forward; four named wheels rotate about local X axles.
"""
from pathlib import Path
import math
import json
import bpy
from mathutils import Vector

source = Path(__file__).with_name('build_character_collection.py')
ns = {'__file__': str(source), '__name__': 'sports_car_authoring'}
exec(compile(source.read_text().split('args=sys.argv')[0], str(source), 'exec'), ns)
root, _ = ns['make_character']({**ns['SPECS'][0], 'id': 'player_sports_car', 'label': '星音 · 旅行跑车'})
xyz, tube, rounded, mesh, ellipsoid = (ns[k] for k in ('xyz', 'tube', 'rounded', 'mesh', 'ellipsoid'))
for obj in list(root.children):
    if obj.name in ('leftArm', 'rightArm', 'leftLeg', 'rightLeg'):
        bpy.data.objects.remove(obj, do_unlink=True)
body = next(obj for obj in root.children if obj.name == 'body')
head = next(obj for obj in root.children if obj.name == 'head')
body.location = xyz((-.15, .68, -.20))
body.rotation_euler.x = -.08
head.location = xyz((-.15, .99, -.18))
ns['parts'] = {'carBody': [body, head]}
ns['current'] = 'carBody'
ns['palette'].update(red='de474e', trim='982f42', glass='85d3df', tire='263041', chrome='d6e6eb', cream='fff1d5')

# The low, tapered nose and open cockpit make the vehicle read as a sports car.
rounded('Underbody', (0, .22, 0), (.91, .16, 1.89), 'dark', .055)
rounded('Rear deck', (0, .47, -.71), (.94, .34, .58), 'red', .10)
mesh('Sculpted tapered hood', [
    (-.46,.32,.27),(.46,.32,.27),(-.42,.30,1.02),(.42,.30,1.02),
    (-.44,.60,.27),(.44,.60,.27),(-.40,.43,1.02),(.40,.43,1.02)
], [(0,2,3,1),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5),(4,5,7,6)], 'red', False)
for side in (-1, 1):
    rounded('Door sill', (side*.435, .39, -.07), (.115, .28, .97), 'red', .035)
    rounded('Side skirt', (side*.458, .245, -.08), (.045, .085, 1.04), 'trim', .02)
    rounded('Door handle', (side*.503, .49, -.19), (.025, .024, .095), 'chrome', .009)
    rounded('Side air intake', (side*.50, .36, -.40), (.012, .07, .18), 'dark', .009)
    # Raised fenders sit above the tyres without filling the cockpit.
    for z in (-.65, .66):
        rounded('Wheel arch', (side*.415, .51, z), (.21, .14, .45), 'red', .065)
    rounded('Sport seat cushion', (side*.20, .38, -.25), (.30, .12, .36), 'dark', .04)
    rounded('Sport seat back', (side*.20, .59, -.46), (.30, .43, .11), 'dark', .055)
    rounded('Seat headrest', (side*.20, .82, -.46), (.19, .14, .105), 'trim', .045)
    tube('Mirror stalk', [(side*.42,.62,.24),(side*.53,.66,.25)], .017, 'chrome', 8)
    rounded('Wing mirror', (side*.55,.67,.25), (.09,.062,.115), 'red', .018)
    rounded('Front headlight', (side*.29,.41,1.025), (.16,.07,.02), 'gold', .014)
    rounded('Rear taillight', (side*.31,.46,-1.012), (.15,.063,.018), 'trim', .012)
    tube('Exhaust', [(side*.32,.24,-.91),(side*.32,.24,-1.03)], .035, 'chrome', 10)
    # Two cream racing stripes follow the hood slope.
    mesh('Hood stripe', [(side*.09-.03,.606,.285),(side*.09+.03,.606,.285),
                        (side*.09+.03,.437,1.016),(side*.09-.03,.437,1.016)], [(0,1,2,3)], 'cream', False)
    rounded('Rear racing stripe', (side*.09,.647,-.72), (.06,.008,.44), 'cream', .002)
rounded('Front grille', (0,.33,1.035), (.47,.065,.023), 'dark', .014)
for x in (-.15,-.075,0,.075,.15):
    rounded('Grille rib', (x,.33,1.05), (.014,.048,.007), 'chrome', .002)
rounded('Rear bumper', (0,.29,-1.014), (.68,.05,.02), 'chrome', .012)
rounded('Dashboard', (0,.56,.24), (.77,.135,.10), 'dark', .025)
rounded('Centre console', (.04,.46,-.075), (.075,.12,.38), 'trim', .018)
mesh('Sloped windscreen', [(-.40,.61,.28),(.40,.61,.28),(.35,.83,.21),(-.35,.83,.21),
    (-.40,.61,.30),(.40,.61,.30),(.35,.83,.23),(-.35,.83,.23)],
    [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], 'glass', False)
tube('Windscreen frame', [(-.40,.61,.29),(-.35,.83,.22),(.35,.83,.22),(.40,.61,.29)], .014, 'chrome', 8)
for side in (-1,1):
    rounded('Spoiler support', (side*.30,.64,-.87), (.045,.17,.045), 'dark', .01)
rounded('Rear spoiler', (0,.73,-.87), (.99,.045,.14), 'red', .014)

# Bent arms, lap and shoes replace the walking limbs; same face/cap/clothes.
for sign in (-1, 1):
    shoulder=(-.15+sign*.16,.89,-.18)
    elbow=(-.15+sign*.18,.80,-.01)
    hand=(-.15+sign*.13,.74,.14)
    tube('Driving sleeve', [shoulder,elbow], [.055,.044], 'coat', 12)
    tube('Driving forearm', [elbow,hand], [.038,.031], 'skin', 10)
    ellipsoid('Hand on steering wheel', hand, (.037,.035,.043), 'skin', 12, 8)
    tube('Seated trousers', [(-.15+sign*.10,.58,-.22),(-.15+sign*.10,.50,.03),(-.15+sign*.10,.28,.14)], [.061,.055,.043], 'dark', 10)
    rounded('Driving shoe', (-.15+sign*.10,.26,.20), (.11,.065,.18), 'ivory', .016)
wheel_ring=[(-.15+math.cos(i*math.tau/24)*.15,.74+math.sin(i*math.tau/24)*.15,.135) for i in range(25)]
tube('Steering wheel rim', wheel_ring, .016, 'dark', 8)
for angle in (math.pi/2,7*math.pi/6,11*math.pi/6):
    tube('Steering spoke', [(-.15,.74,.135),(-.15+math.cos(angle)*.13,.74+math.sin(angle)*.13,.135)], .010, 'chrome', 6)

# Independent motion islands retain axle-centred origins after export/compression.
pivots = {}
for label,z in [('front',.66),('rear',-.65)]:
    for side,side_label in [(-1,'Left'),(1,'Right')]:
        name = label+side_label+'Wheel'
        ns['current'] = name
        x, y = side*.485, .225
        pivots[name] = (x,y,z)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.225,depth=.135,
            location=xyz((x,y,z)),rotation=(0,math.pi/2,0))
        ns['paint'](bpy.context.object, 'tire')
        tube('Alloy hub', [(x,y,z),(x+side*.073,y,z)], .145, 'chrome', 24)
        tube('Hub centre', [(x+side*.074,y,z),(x+side*.08,y,z)], .045, 'gold', 12)
        for i in range(5):
            a=i*math.tau/5
            tube('Dark wheel spokes', [(x+side*.076,y+math.cos(a)*.057,z+math.sin(a)*.057),
                (x+side*.076,y+math.cos(a)*.13,z+math.sin(a)*.13)], .013, 'dark', 6)

for name,objects in ns['parts'].items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.scene.cursor.location=xyz(pivots.get(name,(0,0,0)))
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    obj.parent=root
root['displayName']='星音 · 旅行跑车'
root['frontAxis']='+Z'
root['vehicle']='sports_car'
bpy.context.view_layer.update()
for obj in root.children: obj.select_set(True)
root.select_set(True)
bpy.context.view_layer.objects.active=root
out=ns['OUT']/'player_sports_car.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,
    export_apply=True,export_extras=True,export_animations=False,export_texcoords=False,
    export_materials='EXPORT',export_vertex_color='MATERIAL')
bpy.ops.wm.save_as_mainfile(filepath=str(ns['SOURCE']/'player-sports-car.blend'))
manifest_path=ns['OUT']/'manifest.json'
manifest=json.loads(manifest_path.read_text())
vehicle={'id':'player_sports_car','name':'旅行跑车','file':out.name,'source':'Blender / original Xingyin tourer',
    'frontAxis':'+Z','wheelAxis':'X','wheelNodes':list(pivots),'meshes':5,'materials':1}
manifest['vehicles']=[v for v in manifest.get('vehicles',[]) if v['id']!=vehicle['id']]+[vehicle]
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('SPORTS_CAR_EXPORTED',out,flush=True)
