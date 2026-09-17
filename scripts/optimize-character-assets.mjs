import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, weld, simplify, draco } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import draco3d from 'draco3dgltf'

const dir = new URL('../public/assets/3d/xingyin-characters-v1/', import.meta.url)
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', dir), 'utf8'))
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
})
for (const record of manifest.characters) {
  // Blender regenerates raw records without this field. Repeated optimization
  // must never progressively simplify an already shipped character.
  if (record.compression === 'KHR_draco_mesh_compression') continue
  const file = new URL(record.file, dir)
  const doc = await io.read(fileURLToPath(file))
  await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: .65, error: .0006 }), draco({ quantizePosition: 14, quantizeNormal: 12, quantizeColor: 8, method: 'edgebreaker' }))
  await io.write(fileURLToPath(file), doc)
  // Read the exported bytes, so the report validates actual shipped resources.
  const exported = await io.read(fileURLToPath(file))
  record.triangles = exported.getRoot().listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((n, primitive) => n + primitive.getIndices().getCount()/3, 0), 0)
  record.bytes = (await fs.stat(file)).size
  record.compression = 'KHR_draco_mesh_compression'
}
await fs.writeFile(new URL('manifest.json', dir), JSON.stringify(manifest, null, 2)+'\n')
console.log(JSON.stringify({ characters: manifest.characters.length, totalBytes: manifest.characters.reduce((n,r)=>n+r.bytes,0), largestBytes: Math.max(...manifest.characters.map(r=>r.bytes)), maxTriangles: Math.max(...manifest.characters.map(r=>r.triangles)) }, null, 2))
