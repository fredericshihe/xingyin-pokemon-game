import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

const file = new URL('../public/assets/3d/xingyin-characters-v1/player_sports_car.glb', import.meta.url)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const root = (await io.read(fileURLToPath(file))).getRoot()
const nodes = root.listNodes(), wheels = nodes.filter(n => n.getName().endsWith('Wheel'))
assert.deepEqual(wheels.map(n => n.getName()).sort(), ['frontLeftWheel','frontRightWheel','rearLeftWheel','rearRightWheel'])
for (const wheel of wheels) {
  const [x,y,z] = wheel.getTranslation()
  assert(Math.abs(Math.abs(x)-.485) < .001)
  assert(Math.abs(y-.225) < .001)
  assert(Math.abs(z-(wheel.getName().startsWith('front') ? .66 : -.65)) < .001)
  assert(wheel.getMesh(), 'Each axle owns a visible wheel mesh')
  assert.deepEqual(wheel.getRotation(), [0,0,0,1], 'Wheel axes remain local X')
}
const bounds = getBounds(root.listScenes()[0]), size = bounds.max.map((v,i) => v-bounds.min[i])
assert(size[0] < 1.25, 'Car fits the 1.55-unit road cell')
assert(size[1] > 1.2 && size[1] < 1.55, 'Seated driver remains proportionate to the 1.55-unit hero')
assert(size[2] > 1.8 && size[2] < 2.2)
assert(Math.abs(bounds.min[1]) < .015, 'Tyres rest on the ground')
assert.equal(root.listMaterials().length,1)
assert(root.listMeshes().length <= 5)
assert.equal(nodes.filter(n => n.getMesh()).length,5, 'One body and four animated wheels')
assert((await fs.stat(file)).size < 100000, 'Shipping GLB stays below 100 KB')
const manifest = JSON.parse(await fs.readFile(new URL('../public/assets/3d/xingyin-characters-v1/manifest.json', import.meta.url)))
assert.equal(manifest.vehicles.find(v => v.id === 'player_sports_car')?.file, 'player_sports_car.glb')
console.log(JSON.stringify({ok:true,dimensions:size,meshInstances:5,materials:1,bytes:(await fs.stat(file)).size,wheelPivots:'four X axles verified'}))
