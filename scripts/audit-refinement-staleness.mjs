import fs from 'node:fs/promises'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const manifest = JSON.parse(await fs.readFile('public/assets/3d/xingyin-refined-v1/manifest.json', 'utf8'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule()
})
const stale = []
for (const entry of manifest.assets) {
  const source = getBounds((await io.read(`public${entry.source}`)).getRoot().listScenes()[0])
  const output = getBounds((await io.read(`public${entry.output}`)).getRoot().listScenes()[0])
  const mismatch = [0, 1, 2].some(axis => {
    const span = source.max[axis] - source.min[axis]
    const tolerance = Math.max(.01, span * .025)
    return Math.abs(source.min[axis] - output.min[axis]) > tolerance ||
      Math.abs(source.max[axis] - output.max[axis]) > tolerance ||
      Math.abs(entry.bounds.min[axis] - output.min[axis]) > .001 ||
      Math.abs(entry.bounds.max[axis] - output.max[axis]) > .001
  })
  if (mismatch) stale.push({ source: entry.source, keys: entry.keys, sourceBounds: source, outputBounds: output, recordedBounds: entry.bounds })
}
console.log(JSON.stringify(stale, null, 2))
console.log(`${stale.length} stale refined assets of ${manifest.assets.length}`)
if (stale.length) process.exitCode = 1
