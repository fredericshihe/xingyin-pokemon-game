import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {NodeIO,getBounds} from '@gltf-transform/core'
import {ALL_EXTENSIONS} from '@gltf-transform/extensions'
import {dedup,weld,prune,draco} from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule(),'draco3d.encoder':await draco3d.createEncoderModule()})
const folder='public/assets/3d/map-exclusive-v3'
const source=JSON.parse(await fs.readFile(`${folder}/authoring-metadata.json`,'utf8'))
const manifest=[],catalog=[],measurements={},sets={}
for(const item of source){
 const file=`${folder}/${item.name}.glb`;let doc=await io.read(file)
 if(!doc.getRoot().listExtensionsUsed().some(e=>e.extensionName==='KHR_draco_mesh_compression')){
 await doc.transform(dedup(),weld(),prune(),draco({quantizePosition:14,quantizeNormal:10,quantizeColor:8}));await io.write(file,doc)
 }
 doc=await io.read(file);const root=doc.getRoot(),bounds=getBounds(root.listScenes()[0]);const primitives=root.listMeshes().flatMap(m=>m.listPrimitives())
 const triangles=primitives.reduce((n,p)=>n+p.getIndices().getCount()/3,0)
 if(primitives.length!==1||root.listMaterials().length!==1||root.listTextures().length||Math.abs(bounds.min[1])>.005||triangles>2400)throw new Error(`Invalid ${item.name}`)
 const footprint={width:Math.ceil(Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0]))*2/1.55*100)/100,height:Math.ceil(Math.max(Math.abs(bounds.min[2]),Math.abs(bounds.max[2]))*2/1.55*100)/100}
 const id=`exclusive_${item.name}`;const bytes=(await fs.stat(file)).size
 const position=primitives[0].getAttribute('POSITION').getArray()
 const geometryHash=crypto.createHash('sha256').update(Buffer.from(position.buffer,position.byteOffset,position.byteLength)).digest('hex')
 catalog.push({id,name:item.label,ownerMap:item.mapId,sourcePackage:'xingyin-map-exclusive-blender',assetPath:`/assets/3d/map-exclusive-v3/${item.name}.glb`,sourceAssetName:`${item.name}.glb`,themeTags:[item.setId,'exclusive-scenery'],footprint,defaultScale:1,defaultBlocking:false,heightClass:bounds.max[1]>2?'high':'medium'})
 measurements[id]={footprint,height:bounds.max[1]-bounds.min[1]}
 ;(sets[item.mapId]??=[]).push(id)
 manifest.push({...item,id,bytes,triangles,bounds,footprint,geometryHash})
}
if(new Set(manifest.map(m=>m.geometryHash)).size!==manifest.length)throw new Error('Duplicate geometry across authored models')
await fs.writeFile(`${folder}/manifest.json`,JSON.stringify(manifest,null,2)+'\n')
await fs.writeFile('src/game/data/mapExclusiveAssets.generated.js',`// Blender-authored map-specific scenery. Rebuild: scripts/blender/build_map_exclusive_sets.py\nexport const MAP_EXCLUSIVE_ASSETS = ${JSON.stringify(catalog,null,2)}\nexport const MAP_EXCLUSIVE_SETS = ${JSON.stringify(sets,null,2)}\nexport const MAP_EXCLUSIVE_MEASUREMENTS = ${JSON.stringify(measurements,null,2)}\n`)
console.log(`Prepared ${manifest.length} unique models in ${Object.keys(sets).length} exclusive sets, ${manifest.reduce((n,m)=>n+m.bytes,0)} bytes, ${manifest.reduce((n,m)=>n+m.triangles,0)} triangles.`)
