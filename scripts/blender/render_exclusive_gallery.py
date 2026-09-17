import bpy, sys, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]; ART=ROOT/'art/environment/exclusive-v3'
for file in sorted(ART.glob('*.blend')):
    if '--only' in sys.argv and file.stem != sys.argv[sys.argv.index('--only')+1]: continue
    bpy.ops.wm.open_mainfile(filepath=str(file))
    scene=bpy.context.scene; scene.render.engine='CYCLES';scene.cycles.samples=8
    scene.render.resolution_x=1200;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.66,.7,.72,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
    bpy.ops.object.light_add(type='AREA',location=(5,-4,18));light=bpy.context.object;light.data.energy=2300;light.data.size=14
    bpy.ops.object.camera_add(location=(17,-23,27));cam=bpy.context.object
    cam.rotation_euler=(Vector((7.5,7.3,.55))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=27;scene.camera=cam
    scene.render.filepath=str(ART/(file.stem+'.png'));bpy.ops.render.render(write_still=True)
    print('RENDERED_SET',file.stem,flush=True)
