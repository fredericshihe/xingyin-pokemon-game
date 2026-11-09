import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, weld, draco } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
const file = new URL('../public/assets/3d/xingyin-characters-v1/player_bicycle.glb', import.meta.url)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(),
})
const document = await io.read(fileURLToPath(file))
await document.transform(dedup(), weld(), draco({ quantizePosition: 14, quantizeNormal: 12, quantizeColor: 8 }))
await io.write(fileURLToPath(file), document)
const exported = await io.read(fileURLToPath(file)), root = exported.getRoot()
const report = { bytes: (await fs.stat(file)).size, materials: root.listMaterials().length, meshes: root.listMeshes().length,
  triangles: root.listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((s,p)=>s+p.getIndices().getCount()/3,0),0),
  nodes: root.listNodes().map(n=>n.getName()), }
await fs.mkdir(new URL('../reports/adventure-items/',import.meta.url),{recursive:true})
await fs.writeFile(new URL('../reports/adventure-items/bicycle-asset.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(report)
