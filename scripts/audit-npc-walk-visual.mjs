#!/usr/bin/env node
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import * as THREE from 'three'
import {
  attachNpcWalkShadows,
  configureNpcWalkMaterial,
  createNpcWalkGeometry,
  getNpcWalkStride,
  hasNpcWalkRig,
  setNpcWalkStride
} from '../src/game/npcWalkVisual.js'

const npcKeys = [
  ...'abcdef'.split('').map((letter) => `blocky_character_${letter}`),
  'trainer_lieutenant', 'trainer_merchant', 'trainer_challenge',
  'grave_character_ghost', 'grave_character_skeleton', 'grave_character_zombie'
]
const limbSpecs = [
  { name: 'leftArm', swing: -0.46, side: -1, pivotRatio: 1.51 / 0.27, minY: 1.35, maxY: 1.75 },
  { name: 'rightArm', swing: 0.46, side: 1, pivotRatio: 1.51 / 0.27, minY: 1.35, maxY: 1.75 },
  { name: 'leftLeg', swing: 0.4, side: -1, pivotRatio: 0.94 / 0.135, minY: 0.8, maxY: 1.1 },
  { name: 'rightLeg', swing: -0.4, side: 1, pivotRatio: 0.94 / 0.135, minY: 0.8, maxY: 1.1 }
]
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule()
})
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`)
const length = (v) => Math.hypot(...v)
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]))
const rotateX = (v, angle) => [v[0], Math.cos(angle) * v[1] - Math.sin(angle) * v[2], Math.sin(angle) * v[1] + Math.cos(angle) * v[2]]
// CPU reference validates shipped authoring data. Shader hooks are checked below;
// browser rendering remains the check for the final visible gait.
function posedPosition(position, pivot, swing, stride) {
  const angle = Math.abs(swing) < 0.001 ? 0 : swing * stride
  const relative = position.map((value, index) => value - pivot[index])
  return rotateX(relative, angle).map((value, index) => value + pivot[index])
}
function readAttribute(attribute, index) {
  return attribute.getElement(index, [])
}

let checkedVertices = 0
let sourceGeometry = null
for (const key of npcKeys) {
  const file = new URL(`../public/assets/3d/xingyin-characters-v1/${key}.glb`, import.meta.url)
  const document = await io.read(fileURLToPath(file))
  const root = document.getRoot()
  assert.ok(root.listExtensionsUsed().some((extension) => extension.extensionName === 'KHR_draco_mesh_compression'), `${key}: resource is not Draco compressed`)
  assert.equal(root.listMeshes().length, 1, `${key}: single mesh draw budget changed`)
  const primitives = root.listMeshes()[0].listPrimitives()
  assert.equal(primitives.length, 1, `${key}: single primitive draw budget changed`)
  const primitive = primitives[0]
  const position = primitive.getAttribute('POSITION')
  const normal = primitive.getAttribute('NORMAL')
  const pivot = primitive.getAttribute('_NPC_PIVOT')
  const swing = primitive.getAttribute('_NPC_SWING')
  assert.ok(position && normal && pivot && swing && primitive.getAttribute('COLOR_0'), `${key}: missing pose, normal, or color attributes`)
  assert.equal(pivot.getType(), 'VEC3', `${key}: pivot must be a vector`)
  assert.equal(swing.getType(), 'SCALAR', `${key}: swing must be scalar`)
  for (const attribute of [normal, pivot, swing]) assert.equal(attribute.getCount(), position.getCount(), `${key}: attribute count mismatch`)
  const bounds = getBounds(root.listScenes()[0])
  near(bounds.min[1], 0, 0.005, `${key}: standing feet`)
  near(bounds.max[1], 2.5, 0.01, `${key}: standing height`)

  const groups = new Map(limbSpecs.map((spec) => [spec.name, { spec, count: 0, sample: null }]))
  const membership = new Uint8Array(position.getCount())
  let staticVertices = 0
  for (let index = 0; index < position.getCount(); index += 1) {
    const p = readAttribute(position, index)
    const n = readAttribute(normal, index)
    const origin = readAttribute(pivot, index)
    const amplitude = swing.getScalar(index)
    assert.ok([...p, ...n, ...origin, amplitude].every(Number.isFinite), `${key}: invalid vertex ${index}`)
    assert.ok(distance(posedPosition(p, origin, amplitude, 0), p) < 1e-6, `${key}: idle pose changes vertex ${index}`)
    for (const stride of [-1, 1]) {
      const angle = Math.abs(amplitude) < 0.001 ? 0 : amplitude * stride
      near(length(rotateX(n, angle)), length(n), 1e-6, `${key}: normal length ${index}`)
    }
    if (Math.abs(amplitude) < 0.001) {
      staticVertices += 1
      for (const stride of [-1, 1]) assert.ok(distance(posedPosition(p, origin, amplitude, stride), p) < 1e-6, `${key}: torso/head moves with limbs`)
      continue
    }
    const limbIndex = limbSpecs.findIndex((spec) => Math.abs(spec.swing - amplitude) < 0.001)
    assert.ok(limbIndex >= 0, `${key}: unexpected limb weight ${amplitude}`)
    membership[index] = limbIndex + 1
    const group = groups.get(limbSpecs[limbIndex].name)
    const spec = group.spec
    assert.equal(Math.sign(origin[0]), spec.side, `${key}/${spec.name}: pivot on wrong side`)
    assert.ok(origin[1] >= spec.minY && origin[1] <= spec.maxY, `${key}/${spec.name}: pivot outside joint height`)
    near(origin[1] / Math.abs(origin[0]), spec.pivotRatio, 0.025, `${key}/${spec.name}: pivot not in geometry's Y-up space`)
    near(origin[2], 0, 0.001, `${key}/${spec.name}: pivot depth`)
    group.count += 1
    if (!group.sample || p[1] < group.sample.position[1]) group.sample = { position: p, pivot: origin, swing: amplitude }
  }
  assert.ok(staticVertices > 100, `${key}: missing stationary torso/head`)
  const forwardDepth = new Map()
  for (const [name, group] of groups) {
    assert.ok(group.count > 50, `${key}/${name}: missing limb vertices`)
    const { position: p, pivot: origin, swing: amplitude } = group.sample
    const forward = posedPosition(p, origin, amplitude, 1)
    const backward = posedPosition(p, origin, amplitude, -1)
    assert.ok(distance(forward, backward) > 0.15, `${key}/${name}: limb does not make a visible stride`)
    assert.ok((forward[2] - p[2]) * (backward[2] - p[2]) < 0, `${key}/${name}: forward/backward poses do not alternate`)
    forwardDepth.set(name, forward[2] - p[2])
  }
  assert.ok(forwardDepth.get('leftArm') * forwardDepth.get('rightArm') < 0, `${key}: arms do not alternate`)
  assert.ok(forwardDepth.get('leftLeg') * forwardDepth.get('rightLeg') < 0, `${key}: legs do not alternate`)
  assert.ok(forwardDepth.get('leftArm') * forwardDepth.get('leftLeg') < 0, `${key}: arm and same-side leg are not opposed`)

  // Simplification must not join torso and limb triangles across different pivots.
  const indices = primitive.getIndices().getArray()
  for (let index = 0; index < indices.length; index += 3) {
    assert.equal(membership[indices[index]], membership[indices[index + 1]], `${key}: triangle spans motion islands`)
    assert.equal(membership[indices[index]], membership[indices[index + 2]], `${key}: triangle spans motion islands`)
  }
  checkedVertices += position.getCount()
  if (!sourceGeometry) {
    sourceGeometry = new THREE.BufferGeometry()
    for (const [semantic, name] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['COLOR_0', 'color'], ['_NPC_PIVOT', '_npc_pivot'], ['_NPC_SWING', '_npc_swing']]) {
      const attribute = primitive.getAttribute(semantic)
      sourceGeometry.setAttribute(name, new THREE.BufferAttribute(attribute.getArray().slice(), attribute.getElementSize(), attribute.getNormalized()))
    }
    sourceGeometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1))
  }
  console.log(`PASS ${key}: ${position.getCount()} vertices, four independent limbs, unchanged standing pose`)
}

assert.ok(hasNpcWalkRig(sourceGeometry), 'runtime cannot identify decoded lowercase GLTF attributes')
const originalPositions = sourceGeometry.getAttribute('position').array.slice()
const originalNormals = sourceGeometry.getAttribute('normal').array.slice()
const originalColors = sourceGeometry.getAttribute('color').array.slice()
const batchA = createNpcWalkGeometry(sourceGeometry, 4)
const batchB = createNpcWalkGeometry(sourceGeometry, 4)
assert.notEqual(batchA, sourceGeometry)
assert.notEqual(batchA, batchB)
assert.notEqual(batchA.getAttribute('npcWalkStride'), batchB.getAttribute('npcWalkStride'), 'different chunks share stride attributes')
assert.equal(sourceGeometry.getAttribute('npcWalkStride'), undefined, 'template was mutated with per-instance data')
const material = new THREE.MeshStandardMaterial()
const meshA = new THREE.InstancedMesh(batchA, material, 4)
const meshB = new THREE.InstancedMesh(batchB, material, 4)
setNpcWalkStride(meshA, 1, 0.75)
setNpcWalkStride(meshB, 1, -0.5)
near(batchA.getAttribute('npcWalkStride').getX(1), 0.75, 1e-7, 'batch A stride')
near(batchB.getAttribute('npcWalkStride').getX(1), -0.5, 1e-7, 'batch B stride')
assert.equal(batchA.getAttribute('npcWalkStride').getX(0), 0, 'stride leaked to another instance')
assert.deepEqual(sourceGeometry.getAttribute('position').array, originalPositions, 'stride mutates template geometry')
assert.deepEqual(batchA.getAttribute('position').array, originalPositions, 'walk setup changes standing geometry')
assert.deepEqual(batchA.getAttribute('normal').array, originalNormals, 'walk setup changes standing normals')
assert.deepEqual(batchA.getAttribute('color').array, originalColors, 'walk setup changes clothing palette')
const version = batchA.getAttribute('npcWalkStride').version
setNpcWalkStride(meshA, 1, 0.75)
assert.equal(batchA.getAttribute('npcWalkStride').version, version, 'unchanged stride causes repeated GPU uploads')
assert.equal(getNpcWalkStride({ moving: false, stepProgress: 0.25 }), 0)
assert.equal(getNpcWalkStride({ moving: true, stepProgress: 0.25 }, { standing: true }), 0)
assert.ok(getNpcWalkStride({ moving: true, stepProgress: 0.25 }) > 0.9)
assert.ok(getNpcWalkStride({ moving: true, stepProgress: 0.75 }) < -0.9)
console.log('PASS independent chunk/instance buffers, preserved geometry/palette, and stop/walk stride')

configureNpcWalkMaterial(material)
const compiledHook = material.onBeforeCompile
configureNpcWalkMaterial(material)
assert.equal(material.onBeforeCompile, compiledHook, 'material configuration is not idempotent')
attachNpcWalkShadows(meshA)
for (const [label, animatedMaterial, shader] of [
  ['surface', material, THREE.ShaderLib.standard],
  ['directional shadow', meshA.customDepthMaterial, THREE.ShaderLib.depth],
  ['point-light shadow', meshA.customDistanceMaterial, THREE.ShaderLib.distance]
]) {
  assert.ok(animatedMaterial, `${label}: missing animated material`)
  const program = { vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader, uniforms: {} }
  animatedMaterial.onBeforeCompile(program, null)
  assert.match(program.vertexShader, /attribute vec3 _npc_pivot;/, `${label}: missing pivot binding`)
  assert.match(program.vertexShader, /attribute float npcWalkStride;/, `${label}: missing per-instance stride`)
  assert.match(program.vertexShader, /transformed\s*=\s*_npc_pivot\s*\+\s*npcWalkRotate\(transformed\s*-\s*_npc_pivot\)/, `${label}: missing limb deformation`)
  assert.match(program.vertexShader, /abs\(_npc_swing\)\s*<\s*0\.001/, `${label}: Draco near-zero weights can deform the torso`)
  if (label === 'surface') assert.match(program.vertexShader, /objectNormal\s*=\s*npcWalkRotate\(objectNormal\)/, 'surface normals do not follow limbs')
  assert.ok(program.vertexShader.indexOf('transformed = _npc_pivot') < program.vertexShader.indexOf('#include <project_vertex>'), `${label}: deformation occurs after projection`)
  assert.match(animatedMaterial.customProgramCacheKey(), /npc-walk/, `${label}: shader cache identity misses gait`)
}
console.log('PASS surface and both shadow passes deform in local space before projection')

meshA.dispose()
meshB.dispose()
meshA.customDepthMaterial.dispose()
meshA.customDistanceMaterial.dispose()
material.dispose()
batchA.dispose()
batchB.dispose()
sourceGeometry.dispose()
console.log(`NPC walk visual audit passed: ${npcKeys.length} Draco NPCs, ${checkedVertices} vertices, chunk isolation and animated shader/shadow hooks.`)
