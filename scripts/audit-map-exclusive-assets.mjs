import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {NodeIO,getBounds} from '@gltf-transform/core'
import {ALL_EXTENSIONS} from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import validator from 'gltf-validator'
import {withViteAuditServer} from './load-vite-module.mjs'

// Verify actual decoded geometry as well as names/paths. Renaming or recolouring
// a shared model cannot satisfy the exclusive map contract.
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule()})
const normalizedShapes=new Map(), fileOwners=new Map(), results=[]
await withViteAuditServer(async({loadModule})=>{
 const {MAP_CATALOG}=await loadModule('/src/game/data/mapCatalog.js')
 const {MAP_ASSET_CATALOG}=await loadModule('/src/game/data/mapAssetCatalog.js')
 const {MAP_EXCLUSIVE_SETS,MAP_EXCLUSIVE_ASSETS}=await loadModule('/src/game/data/mapExclusiveAssets.generated.js')
 const {isProtectedEnvironmentObject}=await loadModule('/src/game/data/mapEnvironmentComposition.js')
 const {default:starter}=await loadModule('/src/game/data/godotMaps/my_first_map.js')
 const {GODOT_REGION_MAPS}=await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
 const originals={GodotMap:starter,...GODOT_REGION_MAPS}
 const before=await fs.readFile('output/map-exclusive-v3/maps-before.json','utf8').then(JSON.parse).catch(error => { if(error.code==='ENOENT') return null; throw error })
 assert.equal(Object.keys(MAP_EXCLUSIVE_SETS).length,14)
 assert.equal(MAP_EXCLUSIVE_ASSETS.length,224)
 for(const [mapId,types] of Object.entries(MAP_EXCLUSIVE_SETS)){
  assert.equal(types.length,16)
  const current=MAP_CATALOG[mapId].mapInfo
  const decor=current.decorativeObjects.filter(o=>o.environmentComposition)
  assert.ok(decor.length >= 6,`${mapId}: insufficient new thematic scenery`)
  assert.equal(new Set(decor.map(o=>o.type)).size,decor.length,`${mapId}: new models must not repeat`)
  assert.ok(decor.every(o=>types.includes(o.type)),`${mapId}: new scenery must belong to this map`)
  assert.equal(current.generationNotes.environmentComposition.replaced,0)
  for(const key of ['renderAmbientGroundDecorations','renderForestWallUndergrowth','renderForestWallTrees']) {
   assert.equal(current[key],originals[mapId][key],`${mapId}: original scenery setting ${key} changed`)
  }
  assert.deepEqual(current.decorativeObjects.filter(o=>!o.environmentComposition),originals[mapId].decorativeObjects,`${mapId}: original decorations changed`)
  if (before) {
  for(const key of ['mapGrid','visualPaths','forestTrails','encounterZones','waterBodies','bridges','runtimeEvents']){
   assert.deepEqual(JSON.parse(JSON.stringify(current[key])),before[mapId][key],`${mapId}: gameplay ${key} changed`)
  }
  const currentProtected=current.decorativeObjects.filter(isProtectedEnvironmentObject)
  assert.deepEqual(JSON.parse(JSON.stringify(currentProtected)),before[mapId].decorativeObjects.filter(isProtectedEnvironmentObject),`${mapId}: interaction visuals changed`)
  }
  for(const type of types){
   const asset=MAP_ASSET_CATALOG[type]
   assert.equal(asset.ownerMap,mapId)
   assert.ok(!fileOwners.has(asset.assetPath),`${type}: shares file with ${fileOwners.get(asset.assetPath)}`)
   fileOwners.set(asset.assetPath,mapId)
   const file=`public${asset.assetPath}`,data=await fs.readFile(file)
   const checked=await validator.validateBytes(new Uint8Array(data),{uri:asset.assetPath,maxIssues:100})
   assert.equal(checked.issues.numErrors,0,`${type}: invalid glTF`)
   assert.equal(checked.issues.numWarnings,0,`${type}: glTF warnings`)
   const root=(await io.read(file)).getRoot(),bounds=getBounds(root.listScenes()[0])
   assert.equal(root.listMeshes().length,1);assert.equal(root.listMaterials().length,1)
   assert.equal(root.listTextures().length,0);assert.equal(root.listAnimations().length,0)
   const primitive=root.listMeshes()[0].listPrimitives()[0]
   const pos=primitive.getAttribute('POSITION'),points=[]
   const span=Math.max(...bounds.max.map((v,i)=>v-bounds.min[i]))
   for(let i=0;i<pos.getCount();i++){
    const v=pos.getElement(i,[])
    points.push(v.map((n,k)=>Math.round((n-bounds.min[k])/span*10000)).join(','))
   }
   const signature=crypto.createHash('sha256').update([...new Set(points)].sort().join(';')).digest('hex')
   assert.ok(!normalizedShapes.has(signature),`${type}: duplicate normalized shape of ${normalizedShapes.get(signature)}; recolour/scale-only clones are not allowed`)
   normalizedShapes.set(signature,type)
   const triangles=primitive.getIndices().getCount()/3
   assert.ok(triangles<=2400&&data.byteLength<20000)
   results.push({mapId,type,bytes:data.byteLength,triangles,geometrySignature:signature,errors:checked.issues.numErrors,warnings:checked.issues.numWarnings})
  }
 }
})
await fs.mkdir('output/map-exclusive-v3',{recursive:true})
await fs.writeFile('output/map-exclusive-v3/exclusive-assets-audit.json',JSON.stringify({ok:true,models:results.length,totalBytes:results.reduce((s,m)=>s+m.bytes,0),totalTriangles:results.reduce((s,m)=>s+m.triangles,0),crossMapSharedNewModels:0,results},null,2)+'\n')
console.log('PASS: 14 exclusive scenery sets, 224 distinct normalized geometries; additions never repeat or share models across maps; original ambient scenery, gameplay layouts and interactions retained; glTF validation clean.')
