/**
 * CPU fallback for build_tree_assets.py when Blender cannot initialize its
 * Metal backend in a headless environment.  It deliberately mirrors the
 * Blender authoring dimensions and material contract: one mesh, one material,
 * vertex colours, explicit normals, Y-up GLB, and a grounded origin.
 */
import fs from 'node:fs/promises'
import { Document, NodeIO, Accessor } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, weld, draco } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

const OUT = 'public/assets/3d/xingyin-environment-v2/forest-trees'
const PLAYER_HEIGHT = 1.55
await fs.mkdir(OUT, { recursive: true })

const shade = (hex) => [0, 2, 4].map((i) => {
  const srgb = parseInt(hex.slice(i, i + 2), 16) / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
})
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l) }
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a, s) => a.map((v) => v * s)

function model() {
  return { positions: [], normals: [], colors: [], triangles: 0 }
}

function tri(m, a, b, c, color) {
  const n = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]))
  const base = m.positions.length / 3
  for (const p of [a, b, c]) {
    m.positions.push(...p)
    m.normals.push(...n)
    m.colors.push(...color, 1)
  }
  m.triangles += 1
  return [base, base + 1, base + 2]
}

function cone(m, a, b, r1, r2, sides, hex) {
  const axis = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
  let side = cross(axis, [0, 0, 1])
  if (Math.hypot(...side) < 1e-4) side = cross(axis, [0, 1, 0])
  side = norm(side)
  const up = norm(cross(axis, side))
  const col = shade(hex)
  const ringA = [], ringB = []
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2
    const radial = add(scale(side, Math.cos(angle)), scale(up, Math.sin(angle)))
    ringA.push(add(a, scale(radial, r1)))
    ringB.push(add(b, scale(radial, r2)))
  }
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides
    tri(m, ringA[i], ringA[j], ringB[j], col)
    tri(m, ringA[i], ringB[j], ringB[i], col)
    tri(m, a, ringA[j], ringA[i], col)
    tri(m, b, ringB[i], ringB[j], col)
  }
}

function sphere(m, center, radii, segments, rings, hex) {
  const col = shade(hex)
  for (let y = 0; y < rings; y += 1) {
    const p0 = -Math.PI / 2 + (y / rings) * Math.PI
    const p1 = -Math.PI / 2 + ((y + 1) / rings) * Math.PI
    for (let x = 0; x < segments; x += 1) {
      const t0 = (x / segments) * Math.PI * 2
      const t1 = ((x + 1) / segments) * Math.PI * 2
      const point = (p, t) => [center[0] + radii[0] * Math.cos(p) * Math.cos(t), center[1] + radii[1] * Math.cos(p) * Math.sin(t), center[2] + radii[2] * Math.sin(p)]
      const a = point(p0, t0), b = point(p0, t1), c = point(p1, t1), d = point(p1, t0)
      tri(m, a, b, c, col); tri(m, a, c, d, col)
    }
  }
}

function leaf(m, root, tip, width, hex) {
  const axis = norm([tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]])
  let side = cross(axis, [0, 0, 1])
  if (Math.hypot(...side) < 1e-4) side = [1, 0, 0]
  side = norm(side)
  const mid = add(root, scale([tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]], 0.48))
  const ridge = add(mid, [0, 0, width * 0.25])
  const left = add(mid, scale(side, width)); const right = add(mid, scale(side, -width))
  const col = shade(hex)
  tri(m, root, left, ridge, col); tri(m, left, tip, ridge, col); tri(m, tip, right, ridge, col); tri(m, right, root, ridge, col)
}

function roots(m, bark) {
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    cone(m, [Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, 0.08], [Math.cos(angle) * 0.56, Math.sin(angle) * 0.56, 0.035], 0.18, 0.035, 5, bark)
  }
}

function oak() {
  const m = model(); const h = 3.25; const bark = '795642'; const leafCol = '5F8C5D'
  cone(m, [0, 0, 0], [0, 0, h * 0.6], 0.25, 0.12, 8, bark); roots(m, bark)
  for (const [a, b, r] of [[[0, 0, h * .42], [-.76, .05, h * .70], .14], [[0, 0, h * .45], [.64, .17, h * .74], .13], [[0, 0, h * .49], [-.08, -.66, h * .81], .115], [[.02, .02, h * .54], [.10, .56, h * .94], .095]]) cone(m, a, b, r, .032, 6, bark)
  for (const [x, y, z, sx, sy, sz] of [[-.82, .05, 2.34, .70, .56, .55], [.70, .14, 2.42, .74, .60, .58], [-.08, -.67, 2.60, .68, .55, .53], [.10, .56, 3.02, .57, .48, .46], [-.04, .05, 2.63, .62, .55, .58]]) sphere(m, [x, y, z], [sx, sy, sz], 8, 4, leafCol)
  return m
}

function deciduous() {
  const m = model(); const h = 3.10; const bark = '805A43'
  cone(m, [0, 0, 0], [0, 0, h * .56], .22, .105, 7, bark); roots(m, bark)
  for (const [a, b, r] of [[[0, 0, h * .39], [-.52, .02, h * .68], .125], [[0, 0, h * .44], [.50, .10, h * .72], .115], [[0, 0, h * .49], [0, -.50, h * .82], .095]]) cone(m, a, b, r, .028, 6, bark)
  for (const [x, y, z, sx, sy, sz, c] of [[-.54, .02, 2.17, .64, .51, .52, '6E9C62'], [.54, .10, 2.28, .68, .54, .56, '79A96A'], [0, -.52, 2.49, .60, .49, .52, '6E9C62'], [0, .04, 2.63, .56, .47, .50, '79A96A']]) sphere(m, [x, y, z], [sx, sy, sz], 8, 4, c)
  return m
}

function pine() {
  const m = model(); const h = 3.85; const bark = '765B48'; const colors = ['3F7164', '4F806B']
  cone(m, [0, 0, 0], [0, 0, h * .54], .20, .085, 7, bark); roots(m, bark)
  const tiers = [[1.52, .94, .70], [2.05, .82, .63], [2.57, .66, .58], [3.08, .49, .52], [3.53, .30, .45]]
  tiers.forEach(([z, radius, depth], index) => {
    cone(m, [0, 0, z - depth / 2], [0, 0, z + depth / 2], radius, .035, 8, colors[index % 2])
    for (let branchAngle = 0; branchAngle < 360; branchAngle += 90) {
      const angle = (branchAngle + index * 17) * Math.PI / 180
      const end = [Math.cos(angle) * radius * .78, Math.sin(angle) * radius * .78, z + depth * .08]
      cone(m, [0, 0, z + depth * .30], end, .045, .014, 5, bark)
      leaf(m, end, [end[0] * 1.08, end[1] * 1.08, end[2] + .16], .08, colors[index % 2])
    }
  })
  cone(m, [0, 0, 3.52], [0, 0, 4.04], .25, 0, 8, colors[1])
  return m
}

function writeTree(name, label, kind, targetHeight, tags, m) {
  const doc = new Document(); const buffer = doc.createBuffer(); const mat = doc.createMaterial('Xingyin forest satin vertex palette').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(.84)
  // The Blender source is Z-up.  GLB files consumed by Three.js in this game
  // are Y-up, so apply the proper rotation (x, y, z) -> (x, z, -y) rather
  // than a reflecting axis swap.  Normalize the lowest root flare to zero.
  let minZ = Infinity; let maxZ = -Infinity
  for (let i = 2; i < m.positions.length; i += 3) { minZ = Math.min(minZ, m.positions[i]); maxZ = Math.max(maxZ, m.positions[i]) }
  const positionsArray = []
  for (let i = 0; i < m.positions.length; i += 3) positionsArray.push(m.positions[i], m.positions[i + 2] - minZ, -m.positions[i + 1])
  const normalsArray = []
  for (let i = 0; i < m.normals.length; i += 3) normalsArray.push(m.normals[i], m.normals[i + 2], -m.normals[i + 1])
  const positions = doc.createAccessor('POSITION').setType(Accessor.Type.VEC3).setArray(new Float32Array(positionsArray)).setBuffer(buffer)
  const normals = doc.createAccessor('NORMAL').setType(Accessor.Type.VEC3).setArray(new Float32Array(normalsArray)).setBuffer(buffer)
  const colors = doc.createAccessor('COLOR_0').setType(Accessor.Type.VEC4).setArray(new Float32Array(m.colors)).setBuffer(buffer)
  const indices = doc.createAccessor('indices').setType(Accessor.Type.SCALAR).setArray(new Uint32Array(Array.from({ length: m.positions.length / 3 }, (_, i) => i))).setBuffer(buffer)
  const primitive = doc.createPrimitive().setAttribute('POSITION', positions).setAttribute('NORMAL', normals).setAttribute('COLOR_0', colors).setIndices(indices).setMaterial(mat)
  const meshNode = doc.createMesh(name).addPrimitive(primitive); const node = doc.createNode(name).setMesh(meshNode); doc.createScene('Scene').addChild(node)
  return { doc, record: { name, label, kind, source: 'CPU fallback matching Blender forest-tree authoring', targetHeightMetres: targetHeight, heightMetres: Number((maxZ - minZ).toFixed(4)), playerHeightMetres: PLAYER_HEIGHT, heightRatio: Number(((maxZ - minZ) / PLAYER_HEIGHT).toFixed(3)), triangles: m.triangles, file: `/assets/3d/xingyin-environment-v2/forest-trees/${name}.glb`, themeTags: tags, grounded: true, material: 'vertex-colour satin palette' } }
}

const specs = [
  ['tree_oak', '成熟阔叶橡树', 'oak', 3.25, ['forest', 'deciduous', 'oak'], oak],
  ['tree_default', '层叠阔叶树', 'deciduous', 3.10, ['forest', 'deciduous', 'default'], deciduous],
  ['tree_pineTallA_detailed', '高山层叠松树', 'pine', 3.85, ['forest', 'alpine', 'pine'], pine],
]
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule()
})
const metadata = []
for (const [name, label, kind, target, tags, build] of specs) {
  const { doc, record } = writeTree(name, label, kind, target, tags, build())
  await doc.transform(dedup(), weld(), draco({ quantizePosition: 14, quantizeNormal: 12, quantizeColor: 8 }))
  await io.write(`${OUT}/${name}.glb`, doc)
  record.bytes = (await fs.stat(`${OUT}/${name}.glb`)).size
  metadata.push(record)
}
await fs.writeFile(`${OUT}/authoring-metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`)
await fs.writeFile(`${OUT}/manifest.json`, `${JSON.stringify(metadata, null, 2)}\n`)
console.log(`TREE_FALLBACK_EXPORT_COMPLETE ${metadata.length} assets; ${metadata.reduce((s, x) => s + x.triangles, 0)} triangles total.`)
