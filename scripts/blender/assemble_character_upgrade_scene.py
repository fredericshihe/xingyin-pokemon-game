"""Consolidate the final editable character collection without touching shipped GLBs."""
import bpy
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT=Path(__file__).resolve().parents[2]
folder=ROOT/'art/characters/v2'
main=folder/'xingyin-character-collection.blend'
walk=folder/'npc-walk.blend'
bpy.ops.wm.open_mainfile(filepath=str(main))
for replacement in [walk,folder/'player_child_adventurer.blend']:
    with bpy.data.libraries.load(str(replacement),link=False) as (source,target):
        updated_roots=[name for name in source.objects if name.startswith(('npc_','blocky_character_','trainer_','grave_character_')) or name=='player_child_adventurer']
    updated_ids=set(updated_roots)
    old_roots=[obj for obj in bpy.context.scene.objects if obj.get('characterId') in updated_ids]
    for obj in old_roots:
        for child in list(obj.children_recursive):bpy.data.objects.remove(child,do_unlink=True)
        bpy.data.objects.remove(obj,do_unlink=True)
    with bpy.data.libraries.load(str(replacement),link=False) as (source,target):target.objects=source.objects
    for obj in target.objects:
        if obj and obj.name not in bpy.context.scene.objects:bpy.context.scene.collection.objects.link(obj)
roots=[obj for obj in bpy.context.scene.objects if obj.get('characterId')]
assert len(roots)==109,('Unexpected authoring collection size',len(roots))
hero=next(obj for obj in roots if obj.get('characterId')=='player_child_adventurer')
ordered=[hero]+sorted((obj for obj in roots if obj!=hero),key=lambda obj:obj.get('characterId'))
for index,obj in enumerate(ordered):obj.location=(index%8*2.3,index//8*3.5,0)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active
        space.region_3d.view_location=Vector((0,0,.85))
        space.region_3d.view_distance=3.0
        space.region_3d.view_rotation=Quaternion((1,0,0),1.35)
        space.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
hero.select_set(True);bpy.context.view_layer.objects.active=hero
bpy.context.scene['characterVersion']='xingyin-characters-v2'
bpy.context.scene['characterCount']=109
bpy.context.scene['uniqueMapPeople']=96
bpy.ops.wm.save_as_mainfile(filepath=str(main))
print('FINAL_EDITABLE_COLLECTION',main,'109 characters / 96 unique NPCs',flush=True)
