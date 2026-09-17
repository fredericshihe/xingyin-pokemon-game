"""Thirteen biome-owned silhouette collections for replacing generic white boundary stones."""
import sys, math, random, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent))
from environment_modeling import *
OUT=ROOT/'public/assets/3d/map-boundaries-v5';ART=ROOT/'art/environment/boundaries-v5'
OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
setup()
SETS=[('village','GodotMap'),('meadow','GodotMapV2'),('lake','GodotMapV2_MistLake'),('farm','GodotMapV2_FarmTown'),('grave','GodotMapV2_Graveyard'),('ruins','GodotMapV2_HexRuins'),('ridge','GodotMapV2_SurvivalRidge'),('highland','GodotMapV2_BossHighland'),('frost','GodotMapV2_FrostDojo'),('tide','GodotMapV2_TideDojo'),('iron','GodotMapV2_IronDojo'),('dragon','GodotMapV2_DragonDojo'),('champion','GodotMapV2_ChampionTower')]
LABELS={'village':'花木根石','meadow':'风叶菌岩','lake':'柳根苔岸','farm':'果树田埂','grave':'夜柏墓岩','ruins':'六棱残垣','ridge':'杉林页岩','highland':'风蚀星岩','frost':'层冰霜脊','tide':'珊瑚礁丛','iron':'赤铁矿脉','dragon':'黑曜龙岩','champion':'月桂园岩'}
def angular(p,w,d,h,c,n=7):
    x,y,z=p; angles=[k*math.tau/n+random.uniform(-.15,.15) for k in range(n)]
    lower=[(x+math.cos(a)*w*random.uniform(.75,1),y+math.sin(a)*d*random.uniform(.75,1),z) for a in angles]
    top=[(x+w*.17+math.cos(a)*w*random.uniform(.3,.75),y+d*.11+math.sin(a)*d*random.uniform(.3,.75),z+h*random.uniform(.65,1.15)) for a in angles]
    return mesh('weathered asymmetric rock',lower+top,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)],c)
def rooted_tree(i,crown,bark,kind='round'):
    h=2.8+(i%3)*.48;lean=.17+random.random()*.2
    path([(0,0,0),(lean,.04,h*.42),(-lean*.2,.07,h*.76)],.15,bark)
    for a in [0,2,4]:limb((0,0,.2),(.43*math.cos(a),.36*math.sin(a),.02),.11,.025,bark)
    for k in range(3+(i%3)):
        a=k*2.31+i*.4;z=h*(.58+k*.07);x,y=.44*math.cos(a),.38*math.sin(a)
        limb((lean*.5,0,z-.4),(x,y,z),.075,.025,bark)
        if kind=='pine':cone((x*.4,y*.4,z),.66-k*.055,0,.86,crown,7)
        elif kind=='willow':
            for j in range(4):leaf((x,y,z+.38),(x+.42*math.cos(j*1.57),y+.3*math.sin(j*1.57),z-.53),.16,crown)
        elif kind=='column':orb((x*.35,y*.35,z),(.35,.29,.68),crown,2)
        else:orb((x,y,z),(.6,.48,.44),crown,2)
def recipe(slug,i):
    kind=i%4;v=i//4
    if slug=='village':
        if kind in [0,1]:
            rooted_tree(i,'6D9B67','855A45')
            for k in range(4):blossom((.55*math.cos(k*1.7),.4*math.sin(k*1.7),2.2+v*.35),.2,'EBAABF')
        elif kind==2:
            angular((0,0,0),.85,.43,.6+v*.18,'897B64');orb((.2,0,.64),(.58,.3,.18),'668754')
        else:
            for k in range(2+v):
                x=-(1+v)*.24+k*.48;h=.45+k*.16+v*.08;cone((x,0,h/2),.24,.31,h,'BA825F',7);blossom((x,0,h+.06),.26,'DAB887')
    elif slug=='meadow':
        if kind==0:
            rooted_tree(i,'99B75A','7F784A');leaf((-.2,0,2),(.9,.1,2.5),.45,'B8CA7B')
        elif kind==1:
            for k in range(3):
                x=-.5+k*.47;h=.8+v*.25+k*.16;limb((x,0,0),(x+.2,0,h),.09,.05,'A7AA69');cone((x+.2,0,h),.48,.12,.3,'B88C76',8)
        else:
            angular((0,0,0),.72,.42,.75+v*.22,'89916A')
            for k in range(4):leaf((-.55+k*.3,-.1,.1),(-.7+k*.35,-.1,1.05+k*.09),.13,'7EAB59')
    elif slug=='lake':
        if kind in [0,1]:rooted_tree(i,'639D85','627262','willow')
        else:
            angular((0,0,0),.8,.45,.48+v*.18,'587B78')
            for k in range(3):
                x=-.5+k*.48;h=.9+k*.13+v*.17;limb((x,.06,.1),(x,.06,h),.025,.016,'689C78');cone((x,.06,h),.06,.05,.3,'8B704E',6)
    elif slug=='farm':
        if kind in [0,1]:
            rooted_tree(i,'84A15E','8D684C')
            for k in range(4):orb((.55*math.cos(k*1.8),.43*math.sin(k*1.8),2.1+v*.4),(.11,.1,.16),'DFC56D')
        elif kind==2:
            for k in range(3):angular((-.48+k*.44,0,0),.4,.33,.32+k*.12+v*.05,'AA865C',6)
            for x in [-.55,.6]:orb((x,-.1,.64),(.29,.29,.21),'B88C41')
        else:
            for k in range(4):
                x=-.65+k*.42;cone((x,0,.34),.28,.25,.68,'B4A24F',7);leaf((x,0,.5),(x+.16,.1,1+v*.13),.12,'80954D')
    elif slug=='grave':
        if kind==0:rooted_tree(i,'465D67','625968','column')
        elif kind==1:
            path([(0,0,0),(.17,0,1.5),(-.22,0,2.8+v*.3)],.13,'5C5969')
            for k in range(4):limb((0,0,1+k*.3),(((-1)**k)*(.6+k*.12),.12,1.6+k*.35),.085,.025,'5C5969')
        else:
            angular((0,0,0),.58,.4,1+v*.37,'646F87')
            for k in range(3):blossom((-.48+k*.4,-.25,.24+k*.1),.23,'8394B2')
    elif slug=='ruins':
        for k in range(2+kind%2):
            x=-.4+k*.53;h=.6+((i+k*3)%5)*.36
            cone((x,0,h/2),.34,.29,h,'758B75',6)
            if kind<2:ring((x,0,h*.72),.31,.035,'B4AA73',segments=6)
        if kind==3:box((0,.08,1.08+v*.12),(1.5,.5,.25),'8F9D80',.12)
    elif slug=='ridge':
        if kind<2:rooted_tree(i,'3E7769','685A43','pine')
        else:
            for k in range(3):angular((k*.13-.12,0,k*.23),.8-k*.11,.42-k*.045,.44,'627A7D')
            if kind==3:limb((-.8,0,.13),(.65,.15,.35),.15,.09,'8B7558')
    elif slug=='highland':
        for k in range(2+kind%2):
            x=-.44+k*.48;angular((x,0,0),.33,.34,1+v*.43+k*.28,'737AA0',5+kind)
        if kind<2:
            for k in range(3):leaf((-.6+k*.5,-.2,.12),(-.4+k*.5,-.15,.65),.17,'A7AAC1')
        else:angular((.1,0,.65),.8,.31,.27,'9096AF')
    elif slug=='frost':
        if kind<2:
            for k in range(3+kind):cone((-.5+k*.35,math.sin(k+i)*.12,.65+k*.13+v*.12),.29,.035,1.3+k*.26+v*.24,'6DB5C7',5+v)
        else:
            for k in range(3):angular((k*.12,0,k*.22),.7-k*.11,.4,.38,'87C4D4',6)
            angular((-.15,0,.82),.42,.28,.16,'C6DFE7',7)
    elif slug=='tide':
        if kind<2:
            for k in range(3+kind):
                x=-.5+k*.37;h=1.2+v*.2+k*.13;path([(x,0,0),(x+.12,0,h*.65),(x-.13,0,h)],.07,'BD818B')
                for side in [-1,1]:limb((x,.0,h*.48),(x+side*.35,.08,h*.88),.07,.025,'CC9896')
        elif kind==2:
            for k in range(3+v):cone((-.55+k*.27,math.sin(k)*.1,.44+k*.08+v*.09),.14,.19,.88+k*.16+v*.18,'94A66F',9);cone((-.55+k*.27,math.sin(k)*.1,.9+k*.16+v*.18),.11,.11,.035,'516F63',9)
        else:
            angular((0,0,0),.77,.45,.5+v*.2,'528B90')
            for k in range(5):leaf((-.5+k*.23,0,.3),(-.35+k*.27,.1,1.1+v*.2),.13,'57A59C')
    elif slug=='iron':
        if kind<2:
            angular((0,0,0),.68,.44,1.1+v*.35,'545C66',6)
            for k in range(3):box((-.38+k*.31,-.28,.4+k*.29),(.12,.09,.45),'BA8450',-.25)
        else:
            for k in range(2+v):box((-.48+k*.42,math.sin(k+i)*.12,.35+k*.17+v*.1),(.36,.55,.7+k*.34+v*.2),'737777',.12*k)
            if kind==3:limb((-.7,-.13,.5),(.7,.1,.8),.12,.12,'9C794F',7)
    elif slug=='dragon':
        if kind<2:
            for k in range(3):angular((-.45+k*.45,0,0),.32,.3,1.3+k*.32+v*.24,'59486F',5)
            cone((.13,-.21,.67),.15,.02,1.05,'9980B7',5)
        else:
            angular((0,0,0),.75,.43,.7,'514562',7)
            for k in range(3):limb((-.5+k*.46,0,.55),(-.75+k*.55,.13,1.4+v*.2),.16,.025,'B9ADAA',7)
    elif slug=='champion':
        if kind<2:
            rooted_tree(i,'638E6A','87754E','column');ring((0,0,1.0+v*.15),.26,.035,'C6A85C',segments=9)
        else:
            angular((0,0,0),.7,.42,.55+v*.18,'999B86')
            for k in range(3):leaf((-.5+k*.4,0,.3),(-.3+k*.4,.1,.94),.22,'7EA074')
            blossom((.1,-.2,.5),.22,'D9BD70')
manifest=[]
for si,(slug,map_id) in enumerate(SETS):
    objects=[]
    for i in range(12):
        random.seed(92026+si*107+i*37);recipe(slug,i)
        name=f'{slug}_{i+1:02d}';obj,triangles=finish(name,OUT/f'{name}.glb');objects.append(obj)
        manifest.append(dict(name=name,label=f'{LABELS[slug]}·{i+1}',mapId=map_id,setId=slug,slot=i,triangles=triangles))
    for j,o in enumerate(objects):o.location=((j%4)*4,(j//4)*4,0)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ART/f'{slug}.blend'))
    for o in objects:bpy.data.objects.remove(o,do_unlink=True)
    print('BOUNDARY_SET_COMPLETE',slug,flush=True)
(OUT/'authoring-metadata.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
