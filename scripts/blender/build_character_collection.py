"""Author the original Xingyin character collection in Blender; export Y-up GLB.

blender -b --python scripts/blender/build_character_collection.py -- [--only player_child_adventurer]
The .blend file and this deterministic source are the editable authoring assets.
"""
import bpy
import math
import json
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/3d/xingyin-characters-v1'
SOURCE = ROOT / 'art/characters'
PREVIEW = ROOT / 'output/character-redesign'
for folder in (OUT, SOURCE, PREVIEW):
    folder.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def rgb(hexcode):
    h = hexcode.lstrip('#')
    v = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in v) + (1,)

MAT = bpy.data.materials.new('Xingyin • satin / vertex palette')
MAT.use_nodes = True
bsdf = MAT.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .64
bsdf.inputs['Specular IOR Level'].default_value = .28
vc = MAT.node_tree.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Color'
MAT.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])

def xyz(p):
    return (p[0], -p[2], p[1])

parts = {}
current = 'body'
palette = {}

def paint(obj, color, smooth=True):
    obj.data.materials.clear()
    obj.data.materials.append(MAT)
    attr = obj.data.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
    rgba = rgb(palette.get(color, color))
    for item in attr.data:
        item.color = rgba
    for face in obj.data.polygons:
        face.use_smooth = smooth
    parts.setdefault(current, []).append(obj)
    return obj

def mesh(name, verts, faces, color, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(v) for v in verts], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return paint(obj, color, smooth)

def ellipsoid(name, pos, scale, color, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=xyz(pos))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return paint(obj, color)

def rounded(name, pos, size, color, radius=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(pos))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Tailored rounded edges', 'BEVEL')
    mod.width = radius
    mod.segments = 3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return paint(obj, color)

def ringshape(name, rings, color, n=24):
    # Each ring: height, half width, half depth, depth offset.
    verts = []
    for y, rx, rz, z in rings:
        verts.extend((math.sin(i*2*math.pi/n)*rx, y, math.cos(i*2*math.pi/n)*rz+z) for i in range(n))
    faces = []
    for r in range(len(rings)-1):
        for i in range(n):
            j = (i+1) % n
            faces.append((r*n+i, r*n+j, (r+1)*n+j, (r+1)*n+i))
    faces += [tuple(reversed(range(n))), tuple((len(rings)-1)*n+i for i in range(n))]
    return mesh(name, verts, faces, color)

def tube(name, points, radii, color, sides=8):
    verts = []
    for i, p in enumerate(points):
        p = Vector(p)
        tangent = Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize()
        axis = Vector((0,0,1)) if abs(tangent.z) < .9 else Vector((0,1,0))
        u = tangent.cross(axis).normalized()
        v = tangent.cross(u).normalized()
        radius = radii[i] if isinstance(radii, list) else radii
        verts.extend(tuple(p+radius*(math.cos(a*2*math.pi/sides)*u+math.sin(a*2*math.pi/sides)*v)) for a in range(sides))
    faces=[]
    for i in range(len(points)-1):
        for j in range(sides):
            faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces += [tuple(reversed(range(sides))), tuple((len(points)-1)*sides+j for j in range(sides))]
    return mesh(name,verts,faces,color)

def emblem(pos, color='gold', size=.043):
    x,y,z=pos
    ellipsoid('Enamel academy badge',pos,(size,size,.012),color,16,8)
    tube('Badge inlay',[(x-size*.48,y,z+.013),(x,y+size*.48,z+.013),(x+size*.48,y,z+.013),(x,y-size*.48,z+.013),(x-size*.48,y,z+.013)],.006,'ivory',6)

def hair_lock(name, x, start_y, end_x, end_y, z, width, color='hair'):
    tube(name,[(x,start_y,z-.08),(x*.85,start_y-.08,z),(end_x,end_y+.065,z+.045),(end_x,end_y,z+.025)], [width,width*.9,width*.48,.006],color,10)

BASE = dict(skin='e9b69b', hair='343342', coat='d35757', cloth='faf2df', dark='293449', accent='45b9b5', gold='d9b878', ivory='faf3e7', shoe='34415b', eye='243349', lip='9f5655', white='fff9ef')
SPECS = [
 dict(id='player_child_adventurer',label='星音 · 主角',style='adventurer',hairStyle='swept',coat='df5355',accent='3db8b2',cap=True,pack=True,hero=True),
 dict(id='blocky_character_a',label='野外训练家',style='ranger',coat='477f70',accent='dca455',hair='65463c',hat=True,pack=True),
 dict(id='blocky_character_b',label='学院训练家',style='academy',coat='526d9f',accent='db7585',female=True,hairStyle='bob'),
 dict(id='blocky_character_c',label='研究员',style='scholar',coat='e7ebdf',accent='43a5aa',hair='5b4250',glasses=True,hairStyle='swept'),
 dict(id='blocky_character_d',label='旅行少女',style='traveler',coat='d89a54',accent='488c98',female=True,hairStyle='pony',pack=True),
 dict(id='blocky_character_e',label='海岸向导',style='sailor',coat='447c95',accent='dbe8de',hair='313847',skin='ca9679',cap=True),
 dict(id='blocky_character_f',label='城镇居民',style='artisan',coat='947895',accent='d7b56d',hair='acb3c6',female=True,hairStyle='bun'),
 dict(id='trainer_lieutenant',label='精英训练家',style='officer',coat='355c7d',accent='edbd6c',hair='282d3e',cape=True),
 dict(id='trainer_boss',label='地区首领',style='commander',coat='503958',accent='d5ae62',hair='bec2d3',cape=True,crown=True),
 dict(id='trainer_merchant',label='旅行商人',style='merchant',coat='6c4b3e',accent='dcad6f',hair='40312d',hat=True,pack=True),
 dict(id='trainer_challenge',label='试炼导师',style='martial',coat='ece4d4',accent='cf665c',hair='34313c',hairStyle='bun'),
 dict(id='grave_character_ghost',label='幽谷引路人',style='mystic',coat='b5c5d9',accent='8396c9',skin='d0d9e4',hair='e3e7ef',female=True,hairStyle='bob',cape=True),
 dict(id='grave_character_skeleton',label='遗迹守望者',style='guard',coat='727484',accent='d9d6bd',skin='d8c7b3',hair='d0cabf',armor=True),
 dict(id='grave_character_zombie',label='荒园守卫',style='ranger',coat='738572',accent='c4a46d',skin='b0bea4',hair='575958',hat=True),
]
THEMES = {
 'frost': dict(coat='77adcc',accent='c9edfa',hair='dce8f0',dark='344969',skin='efc6b2'),
 'tide': dict(coat='277e85',accent='b0e3dc',hair='273d52',dark='253c55',skin='cb9d80'),
 'iron': dict(coat='515e72',accent='d7b26b',hair='55505a',dark='2e3544',skin='d0a082'),
 'dragon': dict(coat='784d6c',accent='deb467',hair='392f43',dark='363148',skin='e0b49a'),
}
ROLES = {
 'frost': [('sentinel','霜纹哨兵','guard'),('mystic','镜湖术士','mystic'),('warden','白雾守卫','ranger'),('master','霜镜天王','sovereign')],
 'tide': [('diver','潮汐潜员','diver'),('hunter','深海猎手','sailor'),('priest','漩涡祭司','mystic'),('master','深潮天王','sovereign')],
 'iron': [('smith','铸盾工匠','artisan'),('engineer','磁轨技师','scholar'),('royal_guard','王座禁卫','guard'),('master','铁壁天王','sovereign')],
 'dragon': [('examiner','龙牙试炼官','martial'),('hunter','天穹追猎者','ranger'),('gatekeeper','终焉守门人','guard'),('master','龙穹天王','sovereign')],
}
for theme, roles in ROLES.items():
    for index,(role,label,style) in enumerate(roles):
        spec = dict(THEMES[theme],id=f'elite_{theme}_{role}',label=label,style=style,theme=theme,rank='master' if role=='master' else 'lieutenant',female=index==1, hairStyle=['swept','bob','bun','swept'][index],cape=index in (1,3),armor=style in ('guard','sovereign'),crown=index==3,glasses=role in ('diver','engineer'),hat=role=='hunter')
        if index==1: spec['coat']={'frost':'b2d1de','tide':'559d9a','iron':'79888f','dragon':'a17287'}[theme]
        if index==3: spec['coat']={'frost':'dcecf0','tide':'29485f','iron':'333d4f','dragon':'4e385b'}[theme]
        SPECS.append(spec)

def make_character(spec):
    global current, parts, palette
    parts={}
    palette={**BASE,**{k:v for k,v in spec.items() if k in BASE}}
    current='body'
    style=spec['style']
    female=spec.get('female',False)
    waist=.225 if female else .245
    longcoat=style in ('scholar','mystic','officer','commander','sovereign')
    ringshape('Tailored tunic',[(.92,.26,.155,0),(.97,.28,.17,0),(1.14,waist,.145,0),(1.38,.295,.177,0),(1.56,.31,.156,0),(1.64,.16,.10,0)],'coat')
    if longcoat:
        ringshape('Coat skirt',[(.69,.35,.22,-.025),(.73,.35,.22,-.025),(1.12,.245,.16,0)],'coat')
        for s in (-1,1):
            tube('Coat piping',[(s*.33,.71,.10),(s*.27,.92,.16),(s*.235,1.14,.155)],.012,'accent')
    if female and style in ('academy','traveler'):
        ringshape('Pleated skirt',[(.77,.32,.205,0),(.80,.32,.205,0),(1.03,.255,.16,0)],'dark')
    ringshape('Neck',[(1.59,.10,.09,0),(1.80,.102,.09,0)],'skin',16)
    rounded('Shirt front',(0,1.42,.166),(.22,.33,.028),'cloth',.02)
    for s in (-1,1):
        mesh('Folded collar',[(s*.035,1.58,.196),(s*.15,1.64,.119),(s*.23,1.52,.178),(s*.10,1.40,.205)],[(0,1,2,3)],'ivory',False)
        tube('Jacket seam',[(s*.13,1.38,.183),(s*.13,1.21,.164),(s*.12,1.04,.164)],.006,'accent',6)
    rounded('Leather belt',(0,1.045,.01),(.532,.057,.341),'dark',.023)
    rounded('Belt buckle',(0,1.045,.187),(.068,.055,.018),'gold',.01)
    emblem((-.19,1.47,.175))
    rounded('Pocket flap',(.2,1.24,.158),(.112,.075,.036),'coat',.01)
    tube('Pocket topstitch',[(.15,1.26,.18),(.24,1.26,.18)],.005,'accent',6)
    for y in (1.18,1.3,1.41):
        ellipsoid('Jacket button',(.055,y,.192),(.012,.012,.009),'gold',12,6)
    if style in ('academy','scholar','merchant'):
        tube('Necktie',[(0,1.575,.214),(0,1.52,.23),(.014,1.33,.212)],[.019,.032,.02],'accent')
    else:
        ringshape('Scarf wrap',[(1.59,.14,.105,.017),(1.66,.14,.10,.017)],'accent')
        tube('Scarf tail',[(.07,1.61,.17),(.11,1.49,.211),(.16,1.37,.20)],[.04,.035,.007],'accent')
    if style in ('merchant','artisan'):
        rounded('Utility apron',(0,1.08,.191),(.32,.52,.025),'accent',.018)
        rounded('Apron pocket',(0,1.01,.212),(.23,.14,.025),'coat',.012)
    if spec.get('armor'):
        for s in (-1,1):
            ellipsoid('Layered shoulder guard',(s*.31,1.53,0),(.21,.12,.19),'accent')
            tube('Shoulder trim',[(s*.16,1.57,.13),(s*.32,1.6,.14),(s*.47,1.53,.09)],.018,'gold')
        rounded('Chest plate',(0,1.39,.18),(.31,.24,.048),'dark',.07)
        emblem((0,1.4,.215),'accent',.07)
    if spec.get('cape'):
        mesh('Sculpted mantle',[(x,y,z) for y,w,z in [(1.59,.32,-.145),(1.28,.36,-.23),(.9,.41,-.29),(.54,.46,-.36)] for x in [-w,-w*.5,0,w*.5,w]],[(r*5+i,r*5+i+1,(r+1)*5+i+1,(r+1)*5+i) for r in range(3) for i in range(4)],'dark')
        for s in (-1,1):
            tube('Mantle gold binding',[(s*.32,1.59,-.145),(s*.36,1.28,-.23),(s*.41,.9,-.29),(s*.46,.54,-.36)],.014,'gold')
    if spec.get('pack'):
        rounded('Explorer backpack',(0,1.31,-.247),(.37,.45,.21),'accent',.07)
        rounded('Backpack top flap',(0,1.46,-.357),(.32,.14,.038),'dark',.035)
        rounded('Backpack outer pocket',(0,1.22,-.357),(.24,.16,.05),'coat',.025)
        for s in (-1,1):
            tube('Padded shoulder strap',[(s*.15,1.12,.158),(s*.17,1.4,.19),(s*.19,1.6,.075),(s*.18,1.48,-.24)],.021,'dark')
            rounded('Pack strap buckle',(s*.1,1.36,-.387),(.028,.055,.012),'gold',.005)
    if style=='diver':
        for s in (-1,1):
            ellipsoid('Diving air canister',(s*.13,1.26,-.25),(.1,.34,.10),'accent')
        tube('Breather hose',[(.18,1.61,-.2),(.32,1.66,.05),(.28,1.45,.22),(.09,1.38,.23)],.024,'dark')

    for sign,name in [(-1,'left'),(1,'right')]:
        current=name+'Arm'
        tube('Sleeve',[(sign*.27,1.51,0),(sign*.36,1.37,.005),(sign*.40,1.24,.012)],[.105,.10,.081],'coat',16)
        tube('Cuff',[(sign*.395,1.265,.01),(sign*.412,1.22,.015)],[.085,.082],'accent',16)
        tube('Forearm',[(sign*.408,1.226,.015),(sign*.437,1.09,.034),(sign*.44,1.055,.04)],[.065,.06,.053],'skin',16)
        ellipsoid('Sculpted mitten',(sign*.44,1.005,.04),(.067,.089,.062),'skin',16,10)
        ellipsoid('Thumb',(sign*.385,1.025,.064),(.032,.045,.033),'skin',12,8)
        if style in ('guard','sovereign','officer','diver'):
            rounded('Wrist guard',(sign*.44,1.115,.035),(.14,.10,.14),'dark',.024)
        current=name+'Leg'
        tube('Trouser leg',[(sign*.135,.94,0),(sign*.147,.66,0),(sign*.15,.37,.005),(sign*.15,.23,.01)],[.123,.105,.085,.078],'dark',16)
        tube('Trouser side seam',[(sign*.246,.86,0),(sign*.237,.64,0),(sign*.23,.36,.018)],.006,'accent',6)
        rounded('Sculpted boot',(sign*.15,.16,.065),(.202,.245,.322),'shoe',.064)
        rounded('Boot sole',(sign*.15,.052,.07),(.212,.065,.34),'ivory',.026)
        rounded('Boot toe cap',(sign*.15,.13,.208),(.175,.11,.076),'ivory',.035)
        for y,z in [(.235,.174),(.211,.201)]:
            tube('Boot laces',[(sign*.15-.048,y,z),(sign*.15+.048,y,z)],.007,'ivory',6)

    current='head'
    ringshape('Sculpted cheek and jaw',[(1.70,.06,.085,.018),(1.73,.135,.145,.022),(1.79,.212,.189,.018),(1.88,.269,.223,.01),(2.0,.279,.237,0),(2.13,.267,.224,-.012),(2.24,.211,.179,-.025),(2.30,.105,.095,-.025),(2.315,.016,.016,-.025)],'skin',32)
    for sign in (-1,1):
        ellipsoid('Ear',(sign*.275,1.94,-.006),(.054,.085,.052),'skin',16,10)
        ellipsoid('Ear inner',(sign*.305,1.94,.023),(.021,.045,.021),'lip',12,8)
        x=sign*.12
        ellipsoid('Eye socket',(x,2.003,.213),(.075,.070,.026),'skin',20,12)
        ellipsoid('Eye white',(x,2.008,.229),(.071,.063,.025),'white',20,12)
        ellipsoid('Iris',(x,2.009,.25),(.039,.051,.012),'eye',20,12)
        ellipsoid('Pupil',(x,2.014,.26),(.021,.033,.006),'dark',16,10)
        ellipsoid('Eye highlight',(x-.012,2.035,.267),(.012,.014,.004),'white',12,8)
        ellipsoid('Eye soft glint',(x+.013,1.987,.263),(.006,.007,.003),'accent',10,6)
        tube('Upper eyelash',[(x-.065,2.019,.246),(x-.042,2.06,.241),(x+.018,2.071,.234),(x+.066,2.037,.238)],.008 if female else .006,'hair',6)
        tube('Brow',[(x-.065,2.108,.223),(x,2.124,.23),(x+.054,2.112,.225)],.012,'hair',8)
        ellipsoid('Cheek blush',(sign*.188,1.9,.194),(.045,.018,.011),'e8a49b',16,8)
    ellipsoid('Nose bridge',(0,1.957,.227),(.028,.046,.034),'skin',16,10)
    ellipsoid('Nose tip',(0,1.932,.253),(.039,.025,.031),'skin',16,10)
    tube('Smile',[(-.045,1.853,.224),(-.021,1.845,.229),(0,1.843,.231),(.026,1.849,.226),(.043,1.86,.223)],.0055,'lip',6)
    # Hair dome excludes the face; bangs are sculpted tapered locks.
    verts=[]
    faces=[]
    n=32
    for ring in range(10):
        for i in range(n):
            a=2*math.pi*i/n
            front=(math.cos(a)+1)/2
            limit=1.90-.71*front
            theta=.025+(limit-.025)*ring/9
            verts.append((.29*math.sin(theta)*math.sin(a),2.047+.291*math.cos(theta),-.025+.254*math.sin(theta)*math.cos(a)))
    for r in range(9):
        for i in range(n): faces.append((r*n+i,(r+1)*n+i,(r+1)*n+(i+1)%n,r*n+(i+1)%n))
    mesh('Layered hair cap',verts,faces,'hair')
    for i in range(7):
        x=-.235+i*.073
        end_y=2.06+(.095 if i in (0,6) else .012*(i%3))
        hair_lock('Sculpted fringe',x,2.26,x+.035,end_y,.192,.061)
    hair_style=spec.get('hairStyle','swept')
    for sign in (-1,1):
        hair_lock('Side lock',sign*.248,2.17,sign*.274,1.86 if female else 1.97,.015,.053)
    if hair_style=='bob':
        for i in range(9):
            a=math.pi*.52+i*math.pi*.96/8
            hair_lock('Bob hair',math.sin(a)*.275,2.12,math.sin(a)*.294,1.69,math.cos(a)*.20-.04,.071)
    if hair_style=='pony':
        tube('Ponytail',[(0,2.22,-.21),(.10,2.19,-.37),(.18,1.96,-.39),(.15,1.74,-.35)],[.085,.13,.10,.014],'hair',16)
        ellipsoid('Hair ribbon',(0,2.19,-.24),(.115,.047,.065),'accent')
    if hair_style=='bun':
        ellipsoid('Coiled hair bun',(0,2.30,-.17),(.129,.128,.122),'hair')
        tube('Hair pin',[(-.145,2.33,-.18),(.14,2.30,-.18)],.013,'gold')
    if spec.get('cap'):
        ringshape('Tailored academy cap',[(2.22,.306,.28,-.024),(2.27,.302,.269,-.029),(2.36,.245,.216,-.035),(2.40,.09,.095,-.035)],'coat',32)
        ellipsoid('Curved visor',(0,2.225,.237),(.289,.024,.163),'dark',24,8)
        emblem((0,2.302,.211),'gold',.047)
        tube('Cap seam',[(-.235,2.255,.105),(0,2.285,.227),(.235,2.255,.105)],.009,'ivory')
    if spec.get('hat'):
        ringshape('Travel hat crown',[(2.22,.293,.257,-.025),(2.26,.265,.23,-.025),(2.43,.20,.175,-.025),(2.445,.14,.12,-.025)],'accent',32)
        ellipsoid('Soft wide brim',(0,2.22,-.025),(.387,.03,.324),'accent',32,8)
        ringshape('Hat leather band',[(2.245,.277,.242,-.025),(2.29,.259,.226,-.025)],'dark',32)
        emblem((-.16,2.278,.177),'gold',.035)
    if spec.get('crown'):
        ringshape('Regal circlet',[(2.20,.294,.258,-.025),(2.235,.29,.25,-.025)],'gold',32)
        for i in range(5):
            x=(i-2)*.079
            z=.225-abs(x)*.22
            mesh('Crown petal',[(x-.039,2.235,z),(x,2.40-abs(i-2)*.036,z+.018),(x+.039,2.235,z)],[(0,1,2)],'gold',False)
        emblem((0,2.29,.264),'accent',.036)
    if spec.get('glasses'):
        for s in (-1,1):
            x=s*.12
            points=[(x+math.sin(i*2*math.pi/20)*.088,2.011+math.cos(i*2*math.pi/20)*.081,.277) for i in range(21)]
            tube('Spectacle frame',points,.009,'gold')
        tube('Glasses bridge',[(-.032,2.033,.276),(0,2.043,.282),(.032,2.033,.276)],.008,'gold')
    if style=='mystic':
        for s in (-1,1):
            ellipsoid('Drop earring',(s*.31,1.82,.008),(.026,.065,.022),'gold')

    # Theme-specific silhouettes, rather than palette swaps for the four masters.
    theme=spec.get('theme')
    if theme=='frost':
        if spec.get('rank')=='master' or style=='mystic':
            for s in (-1,1):
                for j in range(3):
                    x=s*(.23+j*.07)
                    mesh('Ice diadem crystal',[(x-.033,2.18,-.03),(x,2.42+j*.05,-.05),(x+.03,2.18,-.03),(x,2.28,.02)],[(0,1,3),(1,2,3),(2,0,3),(0,2,1)],'accent',False)
        current='body'
        if style in ('guard','sovereign'):
            for s in (-1,1):
                for j in range(3):
                    ellipsoid('Frost mantle petal',(s*(.23+j*.068),1.57+j*.018,-.06),(.065,.075,.24-j*.033),'ivory',16,8)
    if theme=='tide' and spec.get('rank')=='master':
        current='head'
        mesh('Admiral bicorne', [(-.41,2.23,0),(-.34,2.43,0),(0,2.32,.04),(.34,2.43,0),(.41,2.23,0),(0,2.25,.23),(0,2.36,-.16)],[(0,1,2,5),(2,3,4,5),(0,6,1),(1,6,3,2),(3,6,4),(0,5,4,6)],'coat')
        tube('Admiral gold piping',[(-.4,2.25,.01),(-.34,2.43,.015),(0,2.32,.055),(.34,2.43,.015),(.4,2.25,.01)],.012,'gold')
        current='body'
        for s in (-1,1):
            for j in range(5): tube('Epaulet fringe',[(s*(.25+j*.045),1.5,.125),(s*(.25+j*.045),1.4,.126)],.012,'gold')
    if theme=='iron':
        current='body'
        if style in ('guard','sovereign'):
            for s in (-1,1):
                for j in range(3): rounded('Articulated shoulder plate',(s*(.28+j*.062),1.59-j*.037,0),(.10,.07,.32),'coat',.022)
            for y in (1.32,1.4,1.48): rounded('Armor lamella',(0,y,.225),(.31,.045,.02),'gold',.008)
        if style=='artisan':
            tube('Smith hammer handle',[(.25,.95,.13),(.29,1.37,.14)],.023,'dark')
            rounded('Smith hammer head',(.29,1.37,.14),(.23,.105,.115),'gold',.016)
        if spec.get('rank')=='master':
            current='head'
            tube('Regal moustache',[(-.115,1.876,.203),(-.05,1.898,.235),(0,1.884,.247),(.05,1.898,.235),(.115,1.876,.203)],[.008,.027,.022,.027,.008],'hair',10)
            tube('Sculpted beard',[(0,1.80,.192),(0,1.72,.186),(0,1.65,.14)],[.092,.065,.008],'hair',14)
    if theme=='dragon':
        current='head'
        if spec.get('rank')=='master' or style=='guard':
            for s in (-1,1):
                tube('Dragon diadem horn',[(s*.235,2.20,-.04),(s*.335,2.32,-.06),(s*.36,2.48,-.055),(s*.30,2.57,-.015)],[.07,.055,.035,.002],'gold',12)
        current='body'
        if style in ('guard','sovereign'):
            for s in (-1,1):
                mesh('Dragon shoulder fin',[(s*.27,1.61,-.07),(s*.54,1.83,-.10),(s*.49,1.5,.12),(s*.25,1.49,.15)],[(0,1,2,3),(3,2,1,0)],'coat',False)
                tube('Dragon shoulder edge',[(s*.27,1.61,-.07),(s*.54,1.83,-.10),(s*.49,1.5,.12)],.014,'gold')

    # Join by motion island: one primitive per NPC; six stable pivots for the player.
    root=bpy.data.objects.new(spec['id'],None)
    bpy.context.collection.objects.link(root)
    root['characterId']=spec['id']
    root['displayName']=spec['label']
    root['assetFamily']='xingyin-characters-v1'
    root['frontAxis']='+Z'
    root['style']='original tailored anime adventure'
    pivots={'body':(0,1.13,0),'head':(0,1.71,0),'leftArm':(-.27,1.51,0),'rightArm':(.27,1.51,0),'leftLeg':(-.135,.94,0),'rightLeg':(.135,.94,0)}
    groups=parts if spec.get('hero') else {'figure':sum(parts.values(),[])}
    meshes=[]
    for part,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        obj=bpy.context.object
        obj.name=part
        bpy.context.scene.cursor.location=xyz(pivots.get(part,(0,0,0)))
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        obj.parent=root
        meshes.append(obj)
    bpy.context.view_layer.update()
    coords=[obj.matrix_world@Vector(corner) for obj in meshes for corner in obj.bound_box]
    height=max(p.z for p in coords)-min(p.z for p in coords)
    floor=min(p.z for p in coords)
    target=1.55 if spec.get('hero') else (2.96 if spec.get('rank')=='master' else 2.63 if spec.get('theme') else 2.5)
    factor=target/height
    for obj in meshes:
        obj.location.z-=floor
        obj.location*=factor
        for v in obj.data.vertices: v.co*=factor
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for obj in meshes: obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(OUT/(spec['id']+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_texcoords=False,export_normals=True,export_materials='EXPORT',export_vertex_color='MATERIAL',export_all_vertex_colors=False)
    tris=sum(sum(len(poly.vertices)-2 for poly in obj.data.polygons) for obj in meshes)
    return root,dict(id=spec['id'],name=spec['label'],file=spec['id']+'.glb',height=target,triangles=tris,meshes=len(meshes),materials=1,theme=spec.get('theme'),rank=spec.get('rank'),style=spec['style'],source='Blender 5.2 / original Xingyin collection')

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
only=args[args.index('--only')+1] if '--only' in args else None
records=[]
roots=[]
for spec in SPECS:
    if only and spec['id']!=only: continue
    root,record=make_character(spec)
    roots.append(root)
    records.append(record)
    print('CHARACTER',json.dumps(record,ensure_ascii=False),flush=True)

# Editable source scene: named characters laid out for inspection.
for i,root in enumerate(roots):
    root.location.x=(i%6)*2.1
    root.location.y=(i//6)*3.8
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/('xingyin-character-collection.blend' if not only else only+'.blend')))
manifest_path=OUT/'manifest.json'
if only and manifest_path.exists():
    previous=json.loads(manifest_path.read_text())
    # Replace the raw record as well as the GLB so partial exports are optimized
    # again; unchanged characters keep their compression metadata.
    replacements={record['id']:record for record in records}
    merged=[replacements.pop(record['id'],record) for record in previous['characters']]
    records=merged+list(replacements.values())
manifest_path.write_text(json.dumps({'version':'xingyin-characters-v1','characters':records},ensure_ascii=False,indent=2)+'\n')

# A close studio render of the authored geometry before delivery compression.
for root in roots:
    root.hide_render=True
    for child in root.children: child.hide_render=True
chosen=['player_child_adventurer','blocky_character_b','blocky_character_c','trainer_merchant','elite_frost_master','elite_tide_master','elite_iron_master','elite_dragon_master']
selected=[r for r in roots if r.name in chosen] if not only else roots
for i,root in enumerate(selected):
    root.hide_render=False
    for child in root.children: child.hide_render=False
    root.location=(i*1.8,0,0)
    root.rotation_euler.z=math.radians(-12)
    if root.name=='player_child_adventurer': root.scale=(1.6,)*3

bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015))
floor=bpy.context.object
floor.name='Studio backdrop'
floor_mat=bpy.data.materials.new('Backdrop warm porcelain')
floor_mat.diffuse_color=(.17,.215,.265,1)
floor.data.materials.append(floor_mat)
world=bpy.context.scene.world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.43,.54,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5

def area(name,loc,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=loc)
    light=bpy.context.object
    light.name=name
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    light.data.color=color
    light.rotation_euler=(Vector((len(selected)*.8,0,1.2))-light.location).to_track_quat('-Z','Y').to_euler()

area('Large warm key',(3,-5,8),1800,8,(1,.87,.74))
area('Cool fill',(-4,-3,4),1000,7,(.66,.82,1))
area('Rim',(8,4,7),2300,6,(.79,.91,1))
bpy.ops.object.camera_add(location=((len(selected)-1)*.9,-12,5.5))
camera=bpy.context.object
target=Vector(((len(selected)-1)*.9,0,1.35))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=max(3.6,len(selected)*1.8)
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=2400 if len(selected)>1 else 900
scene.render.resolution_y=760 if len(selected)>1 else 1050
scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(PREVIEW/('collection.png' if not only else only+'.png'))
bpy.ops.render.render(write_still=True)
