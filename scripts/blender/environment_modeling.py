"""Small modelling primitives shared by authoring scripts, never shipped as assets."""
import bpy, math, random
from mathutils import Vector
PARTS=[]
MATERIAL=None

def setup():
    global MATERIAL
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    MATERIAL=bpy.data.materials.new('Hand-painted satin vertex colours'); MATERIAL.use_nodes=True
    shader=MATERIAL.node_tree.nodes.get('Principled BSDF'); shader.inputs['Roughness'].default_value=.86
    color=MATERIAL.node_tree.nodes.new('ShaderNodeVertexColor'); color.layer_name='Color'
    MATERIAL.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])

def paint(obj, shade):
    rgb=[int(shade[i:i+2],16)/255 for i in (0,2,4)]
    linear=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
    obj.data.materials.append(MATERIAL)
    attr=obj.data.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
    for poly in obj.data.polygons:
        f=random.uniform(.96,1.025)
        for j in poly.loop_indices: attr.data[j].color=tuple(min(1,v*f) for v in linear)+(1,)
    PARTS.append(obj); return obj

def mesh(name, vertices, faces, shade):
    data=bpy.data.meshes.new(name); data.from_pydata(vertices,[],faces); data.update()
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); return paint(obj,shade)

def box(p,size,c,angle=0):
    x,y,z=p; a,b,d=[v*.5 for v in size]; cs,sn=math.cos(angle),math.sin(angle)
    vs=[(x+u*cs-v*sn,y+u*sn+v*cs,z+w) for u,v,w in [(-a,-b,-d),(a,-b,-d),(a,b,-d),(-a,b,-d),(-a,-b,d),(a,-b,d),(a,b,d),(-a,b,d)]]
    return mesh('cut timber or masonry',vs,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],c)

def cone(p,r1,r2,h,c,n=8):
    x,y,z=p; vs=[]
    for r,dz in [(r1,-h/2),(r2,h/2)]:
        vs.extend((x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),z+dz) for i in range(n))
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh('faceted turned profile',vs,faces,c)

def limb(a,b,r1,r2,c,n=6):
    a,b=Vector(a),Vector(b); direction=b-a
    axis=direction.normalized(); side=axis.cross(Vector((0,0,1)))
    if side.length<.01: side=axis.cross(Vector((0,1,0)))
    side.normalize(); up=axis.cross(side).normalized()
    vs=[tuple(p+r*(math.cos(i*math.tau/n)*side+math.sin(i*math.tau/n)*up)) for p,r in [(a,r1),(b,r2)] for i in range(n)]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh('tapered structural branch',vs,faces,c)

def orb(p,s,c,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=p)
    obj=bpy.context.object; obj.scale=s; return paint(obj,c)

def ring(p,r,t,c,axis='Z',segments=14):
    x,y,z=p; vs=[]
    for i in range(segments):
        a=i*math.tau/segments
        for j in range(4):
            b=j*math.tau/4; u=(r+t*math.cos(b))*math.cos(a); v=(r+t*math.cos(b))*math.sin(a); w=t*math.sin(b)
            vs.append((x+u,y+v,z+w) if axis=='Z' else (x+u,y+w,z+v) if axis=='Y' else (x+w,y+u,z+v))
    return mesh('polygonal ring',vs,[(i*4+j,((i+1)%segments)*4+j,((i+1)%segments)*4+(j+1)%4,i*4+(j+1)%4) for i in range(segments) for j in range(4)],c)

def path(points,r,c):
    for a,b in zip(points,points[1:]): limb(a,b,r,r*.94,c)

def leaf(a,b,w,c):
    a,b=Vector(a),Vector(b); axis=b-a; side=axis.cross(Vector((0,0,1)))
    if side.length<.01: side=Vector((1,0,0))
    side.normalize(); mid=a+axis*.45; ridge=mid+Vector((0,0,w*.28))
    return mesh('folded botanical blade',[a,mid+side*w,b,mid-side*w,ridge],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)],c)

def roof(p,w,d,h,c):
    x,y,z=p
    return mesh('pitched roof',[(x-w/2,y-d/2,z),(x+w/2,y-d/2,z),(x,y-d/2,z+h),(x-w/2,y+d/2,z),(x+w/2,y+d/2,z),(x,y+d/2,z+h)],[(0,1,2),(5,4,3),(0,2,5,3),(2,1,4,5),(1,0,3,4)],c)

def arch(p,w,h,t,c,segments=9):
    x,y,z=p; radius=w/2
    limb((x-radius,y,z),(x-radius,y,z+h-radius),t,t,c)
    limb((x+radius,y,z),(x+radius,y,z+h-radius),t,t,c)
    pts=[(x+radius*math.cos(i*math.pi/segments),y,z+h-radius+radius*math.sin(i*math.pi/segments)) for i in range(segments+1)]
    path(pts,t,c)

def blossom(p,r,c,petals=5):
    x,y,z=p
    for i in range(petals):
        a=i*math.tau/petals
        leaf((x,y,z),(x+math.cos(a)*r,y+math.sin(a)*r,z+.07),r*.32,c)
    orb((x,y,z+.055),(r*.16,)*3,'F2D177')

def pedestal(p,w,d,h,c):
    x,y,z=p
    box((x,y,z+h*.15),(w,d,h*.3),c)
    box((x,y,z+h*.57),(w*.76,d*.76,h*.54),c)
    box((x,y,z+h*.91),(w*.94,d*.94,h*.16),c)

def finish(name, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in PARTS: obj.select_set(True)
    bpy.context.view_layer.objects.active=PARTS[0]; bpy.ops.object.join(); obj=bpy.context.object; obj.name=name
    bpy.context.scene.cursor.location=(0,0,0); bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    bottom=min(v.co.z for v in obj.data.vertices)
    for v in obj.data.vertices: v.co.z-=bottom
    obj.data.materials.clear(); obj.data.materials.append(MATERIAL)
    for poly in obj.data.polygons: poly.material_index=0
    obj.data.calc_loop_triangles(); count=len(obj.data.loop_triangles)
    assert 0<count<=2400,(name,count)
    bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    PARTS.clear(); return obj,count
