import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { withViteAuditServer } from './load-vite-module.mjs'
import { createNpcWalkGeometry, setNpcWalkGait } from '../src/game/npcWalkVisual.js'

const folder = 'public/assets/3d/xingyin-characters-v2'
const manifest = JSON.parse(await fs.readFile(`${folder}/manifest.json`, 'utf8'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const rotate = (p, a) => [p[0], Math.cos(a) * p[1] - Math.sin(a) * p[2], Math.sin(a) * p[1] + Math.cos(a) * p[2]]
const around = (p, pivot, a) => rotate(p.map((v, i) => v - pivot[i]), a).map((v, i) => v + pivot[i])
const report = []
let heroDocument

for (const record of manifest.characters) {
  const doc = await io.read(`${folder}/${record.file}`)
  if (record.id === 'player_child_adventurer') { heroDocument = doc; continue }
  const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0]
  if (!primitive.getAttribute('_NPC_SWING')) continue
  const geometry = new THREE.BufferGeometry()
  for (const [source, target] of [['POSITION','position'],['_NPC_PIVOT','_npc_pivot'],['_NPC_SWING','_npc_swing'],['_NPC_JOINT','_npc_joint'],['_NPC_BEND','_npc_bend'],['_NPC_ANKLE','_npc_ankle'],['_NPC_FOOT','_npc_foot']]) {
    const attribute = primitive.getAttribute(source)
    assert.ok(attribute, `${record.id}: missing ${source}`)
    geometry.setAttribute(target, new THREE.BufferAttribute(attribute.getArray(), attribute.getElementSize()))
  }
  const batch = createNpcWalkGeometry(geometry, 1), mesh = new THREE.InstancedMesh(batch, new THREE.MeshStandardMaterial(), 1)
  const scale = 1.55 / record.height
  const position = geometry.getAttribute('position'), weights = geometry.getAttribute('_npc_foot'), swing = geometry.getAttribute('_npc_swing')
  const pivot = geometry.getAttribute('_npc_pivot'), joint = geometry.getAttribute('_npc_joint'), ankle = geometry.getAttribute('_npc_ankle')
  const feet = [[], []], ranges = [[], []], drift = [[], []]
  for (let i = 0; i < weights.count; i++) if (weights.getX(i) > .99) {
    const side = swing.getX(i) > 0 ? 0 : 1
    feet[side].push(i)
  }
  const sole = feet.map(points => {
    const low = Math.min(...points.map(i => position.getY(i)))
    return points.filter(i => position.getY(i) < low + .001)
  })
  let maxSupportKnee = 0
  for (let frame = 0; frame < 240; frame++) {
    const phase = frame / 240 * Math.PI * 2
    setNpcWalkGait(mesh, 0, { phase, blend: 1, scale })
    for (let side = 0; side < 2; side++) {
      const cycle = ((frame / 240 + side / 2) % 1)
      if (cycle >= .5) continue
      const angles = batch.getAttribute('npcLegAngles'), a = angles.getComponent(0, side * 2), b = angles.getComponent(0, side * 2 + 1)
      maxSupportKnee = Math.max(maxSupportKnee, Math.abs(b))
      let low = Infinity
      for (const i of sole[side]) {
        let p = [position.getX(i), position.getY(i), position.getZ(i)]
        p = around(p, [ankle.getX(i), ankle.getY(i), ankle.getZ(i)], -(a + b))
        p = around(p, [joint.getX(i), joint.getY(i), joint.getZ(i)], b)
        p = around(p, [pivot.getX(i), pivot.getY(i), pivot.getZ(i)], a)
        p[1] += batch.getAttribute('npcWalkStride').getY(0)
        low = Math.min(low, p[1] * scale)
        if (i === sole[side][0]) drift[side].push(p[2] * scale + frame / 240 * .64)
      }
      ranges[side].push(low)
    }
  }
  // Each support interval must stay on the same world point while the root moves.
  for (let side = 0; side < 2; side++) {
    assert.ok(Math.max(...ranges[side]) - Math.min(...ranges[side]) < .006, `${record.id}: supporting foot lifts from the ground`)
    const values = side === 0 ? drift[side] : drift[side].slice(0, 60)
    assert.ok(Math.max(...values) - Math.min(...values) < .012, `${record.id}: planted foot slides`)
  }
  assert.ok(maxSupportKnee < .3, `${record.id}: support knee remains crouched`)
  setNpcWalkGait(mesh, 0, { phase: 2, blend: 0, scale })
  assert.deepEqual([...batch.getAttribute('npcLegAngles').array], [0, 0, 0, 0], `${record.id}: idle does not restore bind pose`)
  assert.equal(batch.getAttribute('npcWalkStride').getY(0), 0)
  report.push({ key: record.id, maxSupportKneeDegrees: maxSupportKnee * 180 / Math.PI,
    supportHeightSpread: Math.max(...ranges.flat()) - Math.min(...ranges.flat()) })
  mesh.dispose(); mesh.material.dispose(); geometry.dispose(); batch.dispose()
}
assert.equal(report.length, 83)

await withViteAuditServer(async ({ loadModule }) => {
  const { animateLowPolyPlayer } = await loadModule('/src/game/playerFigureVisual.js')
  const parts = {}, base = {}, figure = new THREE.Group()
  const build = node => {
    const object = new THREE.Group()
    object.name = node.getName(); object.position.fromArray(node.getTranslation()); object.quaternion.fromArray(node.getRotation()); object.scale.fromArray(node.getScale())
    if (node.getMesh()) {
      const p = node.getMesh().listPrimitives()[0].getAttribute('POSITION')
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(p.getArray(), 3))
      object.geometry = geometry
      parts[object.name] = object
      base[object.name] = { position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() }
    }
    for (const child of node.listChildren()) object.add(build(child))
    return object
  }
  for (const node of heroDocument.getRoot().listScenes()[0].listChildren()) figure.add(build(node))
  figure.userData.rig = { parts, base, walkBlend: 1, authored: true }
  const heights = [], head = []
  let maxSupportKnee = 0
  for (let frame = 0; frame < 240; frame++) {
    figure.position.z = frame * 5.4 / 60
    animateLowPolyPlayer(figure, true, frame * 1000 / 60, 1 / 60)
    figure.updateMatrixWorld(true)
    if (frame < 60) continue
    head.push(parts.head.getWorldPosition(new THREE.Vector3()).y)
    const rig = figure.userData.rig
    for (const [side, offset] of [['left', 0], ['right', Math.PI]]) {
      const cycle = ((rig.gaitPhase + offset) / (Math.PI * 2)) % 1
      if (cycle >= rig.gaitDuty) continue
      const foot = parts[`${side}Foot`], positions = foot.geometry.getAttribute('position')
      let low = Infinity
      for (let i = 0; i < positions.count; i++) low = Math.min(low, foot.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i)).y)
      heights.push(low)
      maxSupportKnee = Math.max(maxSupportKnee, Math.abs(parts[`${side}Shin`].rotation.x))
    }
  }
  assert.ok(Math.max(...head) - Math.min(...head) < .001, 'hero head bobs during continuous travel')
  assert.ok(Math.max(...heights) - Math.min(...heights) < .006, `hero support foot floats: ${Math.min(...heights)} to ${Math.max(...heights)}`)
  assert.ok(maxSupportKnee < .3, 'hero support knee remains bent')
  const { MAP_IDS, getMapInfo } = await loadModule('/src/game/data/mapCatalog.js')
  const { resolveBattleCharacterModel } = await loadModule('/src/game/characterPortrait.js')
  const { getDecorativeModel } = await loadModule('/src/game/decorativeModelSpec.js')
  const { isCharacterModelKey } = await loadModule('/src/game/data/characterAssets.js')
  let mapped = 0
  for (const mapName of MAP_IDS) for (const object of getMapInfo(mapName).decorativeObjects) {
    const key = getDecorativeModel(object.type, object)?.key
    if (!isCharacterModelKey(key)) continue
    assert.equal(resolveBattleCharacterModel({ mapName, eventId: object.eventId }), key, `${mapName}/${object.eventId}: wrong intro appearance`)
    mapped++
  }
  assert.equal(mapped, 96)
  report.push({ hero: true, headHeightSpread: Math.max(...head) - Math.min(...head), supportHeightSpread: Math.max(...heights) - Math.min(...heights), maxSupportKneeDegrees: maxSupportKnee * 180 / Math.PI, exactNpcPortraitBindings: mapped })
})
await fs.writeFile('output/character-upgrade-v2/grounded-gait-audit.json', JSON.stringify({ passed: true, report }, null, 2))
console.log('PASS: 83 grounded NPC gaits, planted feet without sliding, upright support knees, stable hero upper body, and 96 exact intro appearances.')
