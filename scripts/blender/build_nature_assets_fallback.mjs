/**
 * CPU authoring fallback for the high-frequency nature props.  The Blender
 * authoring scripts use the same geometry contract: one grounded mesh, one
 * vertex-colour material, and no texture dependencies.
 */
import fs from 'node:fs/promises'
import { Document, NodeIO, Accessor } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, weld, draco } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

const OUT = 'public/assets/3d/xingyin-environment-v2/nature'
await fs.mkdir(OUT, { recursive: true })

const shade = (hex) => [0, 2, 4].map((i) => {
  const value = parseInt(hex.slice(i, i + 2), 16) / 255
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
})
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l) }
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, s) => a.map((v) => v * s)

function model() { return { positions: [], normals: [], colors: [], triangles: 0 } }

function tri(m, a, b, c, hex) {
  const n = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]))
  for (const p of [a, b, c]) { m.positions.push(...p); m.normals.push(...n); m.colors.push(...shade(hex), 1) }
  m.triangles += 1
}

function cone(m, a, b, r1, r2, sides, hex) {
  const axis = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
  let side = cross(axis, [0, 0, 1]); if (Math.hypot(...side) < 1e-4) side = cross(axis, [0, 1, 0]); side = norm(side)
  const up = norm(cross(axis, side)); const ringA = []; const ringB = []
  for (let i = 0; i < sides; i += 1) { const angle = i * Math.PI * 2 / sides; const radial = add(mul(side, Math.cos(angle)), mul(up, Math.sin(angle))); ringA.push(add(a, mul(radial, r1))); ringB.push(add(b, mul(radial, r2))) }
  for (let i = 0; i < sides; i += 1) { const j = (i + 1) % sides; tri(m, ringA[i], ringA[j], ringB[j], hex); tri(m, ringA[i], ringB[j], ringB[i], hex); tri(m, a, ringA[j], ringA[i], hex); tri(m, b, ringB[i], ringB[j], hex) }
}

function sphere(m, center, radii, segments, rings, hex) {
  for (let y = 0; y < rings; y += 1) {
    const p0 = -Math.PI / 2 + y * Math.PI / rings; const p1 = -Math.PI / 2 + (y + 1) * Math.PI / rings
    for (let x = 0; x < segments; x += 1) {
      const t0 = x * Math.PI * 2 / segments; const t1 = (x + 1) * Math.PI * 2 / segments
      const point = (p, t) => [center[0] + radii[0] * Math.cos(p) * Math.cos(t), center[1] + radii[1] * Math.cos(p) * Math.sin(t), center[2] + radii[2] * Math.sin(p)]
      const a = point(p0, t0); const b = point(p0, t1); const c = point(p1, t1); const d = point(p1, t0)
      if (y > 0) tri(m, a, b, c, hex)
      if (y < rings - 1) tri(m, a, c, d, hex)
    }
  }
}

function leaf(m, root, tip, width, hex) {
  const axis = norm([tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]])
  let side = cross(axis, [0, 0, 1]); if (Math.hypot(...side) < 1e-4) side = [1, 0, 0]; side = norm(side)
  const delta = [tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]]; const mid = add(root, mul(delta, .48)); const ridge = add(mid, [0, 0, width * .28])
  const left = add(mid, mul(side, width)); const right = add(mid, mul(side, -width))
  tri(m, root, left, ridge, hex); tri(m, left, tip, ridge, hex); tri(m, tip, right, ridge, hex); tri(m, right, root, ridge, hex)
  tri(m, root, right, tip, hex); tri(m, root, tip, left, hex)
}

function bush() {
  const m = model(); const bark = '70513E'; const greens = ['527C54', '638F59', '729D62']
  cone(m, [0, 0, 0], [0, 0, .60], .16, .085, 7, bark)
  for (const [a, b] of [[[0, 0, .38], [-.38, .02, .80]], [[0, 0, .40], [.34, .04, .86]], [[0, 0, .36], [0, -.34, .75]]]) cone(m, a, b, .08, .025, 5, bark)
  for (const [x, y, z, sx, sy, sz, c] of [[-.38, .02, .88, .46, .39, .42, greens[0]], [.35, .04, .95, .51, .42, .47, greens[1]], [0, -.35, .83, .43, .36, .38, greens[2]], [-.02, .05, 1.10, .43, .38, .39, greens[1]]]) sphere(m, [x, y, z], [sx, sy, sz], 8, 4, c)
  // Four low roots keep the silhouette grounded when placed at map edges.
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) cone(m, [Math.cos(angle) * .07, Math.sin(angle) * .07, .08], [Math.cos(angle) * .39, Math.sin(angle) * .39, .02], .10, .025, 5, bark)
  m.positions = m.positions.map((value) => value * .65)
  return m
}

function rock() {
  const m = model(); const sides = 8; const base = []; const shoulder = []; const cap = []
  for (let i = 0; i < sides; i += 1) { const a = i * Math.PI * 2 / sides; const jitter = [1.00, .88, 1.08, .94, 1.04, .90, 1.06, .97][i]; base.push([Math.cos(a) * .82 * jitter, Math.sin(a) * .61 * jitter, .04]); shoulder.push([Math.cos(a) * .70 * jitter, Math.sin(a) * .52 * jitter, .43 + (i % 2) * .05]); cap.push([Math.cos(a) * .30 * jitter, Math.sin(a) * .24 * jitter, .72 + (i % 3) * .045]) }
  const hex = '8A8175'
  for (let i = 0; i < sides; i += 1) { const j = (i + 1) % sides; tri(m, base[i], base[j], shoulder[j], hex); tri(m, base[i], shoulder[j], shoulder[i], hex); tri(m, shoulder[i], shoulder[j], cap[j], '968E80'); tri(m, shoulder[i], cap[j], cap[i], '9E9688') }
  const center = [0, 0, .76]; for (let i = 0; i < sides; i += 1) tri(m, cap[i], cap[(i + 1) % sides], center, 'AAA18F')
  return m
}

function flowerCluster(hex) {
  const m = model(); const stem = '4B784B'; const centers = [[-.40, .02, .48], [0, .05, .70], [.39, .02, .52], [-.16, -.24, .42], [.20, -.18, .46]]
  for (const [x, y, z] of centers) {
    cone(m, [x * .85, y * .85, 0], [x, y, z], .024, .014, 5, stem)
    leaf(m, [x * .76, y * .76, z * .42], [x + .16, y + .04, z * .50], .055, '6E9D5D')
    for (let i = 0; i < 5; i += 1) { const a = i * Math.PI * 2 / 5; leaf(m, [x, y, z], [x + Math.cos(a) * .15, y + Math.sin(a) * .15, z + .04], .055, hex) }
    sphere(m, [x, y, z + .055], [.045, .045, .045], 6, 3, 'EBCB73')
  }
  return m
}

function writeModel(name, label, tags, m) {
  let minZ = Infinity; let maxZ = -Infinity
  for (let i = 2; i < m.positions.length; i += 3) { minZ = Math.min(minZ, m.positions[i]); maxZ = Math.max(maxZ, m.positions[i]) }
  const doc = new Document(); const buffer = doc.createBuffer(); const mat = doc.createMaterial('Xingyin nature satin vertex palette').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(.86)
  const positionsArray = []; const normalsArray = []
  for (let i = 0; i < m.positions.length; i += 3) positionsArray.push(m.positions[i], m.positions[i + 2] - minZ, -m.positions[i + 1])
  for (let i = 0; i < m.normals.length; i += 3) normalsArray.push(m.normals[i], m.normals[i + 2], -m.normals[i + 1])
  const positions = doc.createAccessor('POSITION').setType(Accessor.Type.VEC3).setArray(new Float32Array(positionsArray)).setBuffer(buffer)
  const normals = doc.createAccessor('NORMAL').setType(Accessor.Type.VEC3).setArray(new Float32Array(normalsArray)).setBuffer(buffer)
  const colors = doc.createAccessor('COLOR_0').setType(Accessor.Type.VEC4).setArray(new Float32Array(m.colors)).setBuffer(buffer)
  const indices = doc.createAccessor('indices').setType(Accessor.Type.SCALAR).setArray(new Uint32Array(Array.from({ length: m.positions.length / 3 }, (_, i) => i))).setBuffer(buffer)
  const primitive = doc.createPrimitive().setAttribute('POSITION', positions).setAttribute('NORMAL', normals).setAttribute('COLOR_0', colors).setIndices(indices).setMaterial(mat)
  const mesh = doc.createMesh(name).addPrimitive(primitive); const node = doc.createNode(name).setMesh(mesh); doc.createScene('Scene').addChild(node)
  return { doc, record: { name, label, triangles: m.triangles, heightMetres: Number((maxZ - minZ).toFixed(3)), file: `/assets/3d/xingyin-environment-v2/nature/${name}.glb`, themeTags: tags, grounded: true, material: 'vertex-colour satin palette' } }
}

const specs = [
  ['bush_large', '统一阔叶灌木', ['nature', 'bush', 'edge'], bush],
  ['rock_large', '统一低多边形巨石', ['nature', 'rock', 'boundary'], rock],
  ['flower_yellow_cluster', '统一黄花簇', ['nature', 'flower', 'yellow'], () => flowerCluster('E2B65F')],
  ['flower_red_cluster', '统一红花簇', ['nature', 'flower', 'red'], () => flowerCluster('C96867')],
]
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
})
const records = []
for (const [name, label, tags, build] of specs) {
  const { doc, record } = writeModel(name, label, tags, build())
  await doc.transform(dedup(), weld(), draco({ quantizePosition: 14, quantizeNormal: 12, quantizeColor: 8 }))
  await io.write(`${OUT}/${name}.glb`, doc)
  record.bytes = (await fs.stat(`${OUT}/${name}.glb`)).size
  records.push(record)
}
await fs.writeFile(`${OUT}/manifest.json`, `${JSON.stringify(records, null, 2)}\n`)
await fs.writeFile(`${OUT}/authoring-metadata.json`, `${JSON.stringify(records, null, 2)}\n`)
console.log(`NATURE_FALLBACK_EXPORT_COMPLETE ${records.length} assets; ${records.reduce((sum, x) => sum + x.triangles, 0)} triangles total.`)
