"""Build the Timber Camp bank. Run Blender -b --python scripts/blender/build_timber_bank.py."""
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from environment_modeling import PARTS, box, cone, finish, limb, mesh, ring, setup

OUT = ROOT / 'public/assets/3d/xingyin-environment-v2'
SOURCE = ROOT / 'art/environment'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
random.seed(1407)
setup()

STONE = '859793'
STONE_LIGHT = 'A8B8AB'
TIMBER = '7E6550'
TIMBER_LIGHT = 'AF8660'
WALL = 'C9B89B'
ROOF = '2B6B61'
ROOF_EDGE = '194B48'
GOLD = 'E9B953'
GOLD_DARK = '9E712C'
GLASS = '4E928B'
DOOR = '344D49'

# A compact masonry base and readable camp timber facade.
box((0, 0, .16), (2.82, 2.05, .32), STONE)
box((0, 0, .41), (2.65, 1.88, .25), STONE_LIGHT)
box((0, .13, 1.26), (2.45, 1.58, 1.66), WALL)
for x in (-1.19, 1.19):
    box((x, -.72, 1.22), (.17, .20, 1.98), TIMBER)
    box((x, .83, 1.22), (.17, .19, 1.98), TIMBER)
for z in (.57, 1.96):
    box((0, -.77, z), (2.65, .19, .16), TIMBER_LIGHT)
    box((0, .84, z), (2.65, .16, .15), TIMBER_LIGHT)

# Steep pine-green roof; alternating lower shingles break up the silhouette.
mesh('front bank gable', [(-1.48,-1.08,2.08),(1.48,-1.08,2.08),(0,-1.08,2.98)], [(0,1,2)], ROOF_EDGE)
mesh('back bank gable', [(-1.48,1.03,2.08),(1.48,1.03,2.08),(0,1.03,2.98)], [(2,1,0)], ROOF_EDGE)
mesh('left roof', [(-1.58,-1.15,2.05),(0,-1.15,3.06),(0,1.12,3.06),(-1.58,1.12,2.05)], [(0,1,2,3)], ROOF)
mesh('right roof', [(0,-1.15,3.06),(1.58,-1.15,2.05),(1.58,1.12,2.05),(0,1.12,3.06)], [(0,1,2,3)], ROOF)
for side in (-1, 1):
    limb((0,-1.18,3.07),(side*1.58,-1.18,2.05),.055,.055,TIMBER_LIGHT)
    limb((0,1.15,3.07),(side*1.58,1.15,2.05),.055,.055,TIMBER_LIGHT)
box((0,-1.17,2.06),(3.25,.12,.11),ROOF_EDGE)

# Recessed vault entrance, gold service hatch, and two clear windows.
box((0,-.841,1.10),(.82,.10,1.53),TIMBER)
box((0,-.901,1.10),(.62,.08,1.39),DOOR)
box((0,-.955,1.12),(.35,.055,.42),GLASS)
ring((0,-.996,1.10),.19,.033,GOLD,'Y',12)
for a in range(6):
    x=.14*math.sin(a*math.tau/6)
    z=1.10+.14*math.cos(a*math.tau/6)
    box((x,-1.025,z),(.033,.035,.033),GOLD)
box((.19,-1.015,.71),(.085,.08,.085),GOLD)
for x in (-.87,.87):
    box((x,-.83,1.28),(.51,.09,.67),TIMBER)
    box((x,-.89,1.28),(.38,.055,.53),GLASS)
    box((x,-.93,1.28),(.055,.052,.56),GOLD_DARK)
    box((x,-.93,1.28),(.41,.052,.055),GOLD_DARK)
    box((x,-1.00,.92),(.61,.27,.13),STONE_LIGHT)

# Coin crest and high sign board are visible from the road and at phone size.
box((0,-1.20,2.30),(1.45,.14,.39),TIMBER)
box((0,-1.29,2.31),(1.27,.045,.26),ROOF_EDGE)
ring((0,-1.34,2.53),.29,.075,GOLD,'Y',16)
box((0,-1.385,2.53),(.11,.04,.38),GOLD)
box((0,-1.385,2.53),(.31,.04,.085),GOLD)
for x in (-.51,.51):
    cone((x,-1.30,2.30),.075,.045,.10,GOLD,8)

# Small porch and savings jars tie the bank into Ironwood Camp.
box((0,-1.19,.24),(1.45,.66,.15),STONE_LIGHT)
box((0,-1.50,.10),(1.23,.35,.13),STONE)
for x in (-1.06,1.06):
    box((x,-1.12,.31),(.32,.32,.31),TIMBER)
    cone((x,-1.12,.53),.19,.16,.13,GOLD_DARK,8)
    ring((x,-1.12,.62),.105,.024,GOLD,'Z',12)

import bpy
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'timber-bank.blend'))
obj, triangles = finish('timber_bank', OUT / 'timber_bank.glb')
print(f'timber_bank: {triangles} triangles, {len(PARTS)} unjoined parts remaining')
