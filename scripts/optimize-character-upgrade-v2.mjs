import fs from 'node:fs/promises'
import path from 'node:path'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, weld, simplify, draco } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import draco3d from 'draco3dgltf'

const folder = 'public/assets/3d/xingyin-characters-v2'
const manifest = JSON.parse(await fs.readFile(`${folder}/manifest.json`, 'utf8'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule()
})
await MeshoptSimplifier.ready
for (const record of [...manifest.characters, ...(manifest.vehicles || [])]) {
  if (record.compression === 'KHR_draco_mesh_compression') continue
  const file = path.join(folder, record.file)
  const document = await io.read(file)
  const originalHeight = record.height
  const hero = record.id === 'player_child_adventurer'
  const important = hero || record.rank === 'boss' || record.rank === 'master'
  const target = important ? .87 : .58
  await document.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: target, error: .0005 }),
    draco({ quantizePosition: 14, quantizeNormal: 12, quantizeColor: 8, quantizeGeneric: 14 }))
  await io.write(file, document)
  const verified = await io.read(file), root = verified.getRoot()
  const bounds = getBounds(root.listScenes()[0])
  record.triangles = root.listMeshes().flatMap(mesh => mesh.listPrimitives())
    .reduce((n, primitive) => n + (primitive.getIndices()?.getCount() || primitive.getAttribute('POSITION').getCount()) / 3, 0)
  record.bytes = (await fs.stat(file)).size
  record.compression = 'KHR_draco_mesh_compression'
  record.bounds = bounds
  if (originalHeight && Math.abs(bounds.max[1] - bounds.min[1] - originalHeight) > .02) throw Error(`Height changed: ${record.id}`)
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    if (!primitive.getAttribute('_CHAR_SURFACE')) throw Error(`Surface regions lost: ${record.id}`)
  }
  console.log(`${record.id}: ${record.triangles} triangles, ${record.bytes} bytes`)
}
await fs.writeFile(`${folder}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ characters: manifest.characters.length, vehicles: manifest.vehicles?.length || 0,
  totalBytes: manifest.characters.reduce((n, record) => n + record.bytes, 0) }, null, 2))
