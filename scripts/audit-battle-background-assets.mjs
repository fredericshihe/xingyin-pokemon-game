import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { BATTLE_BACKGROUNDS } from '../src/game/data/battleBackgroundCatalog.js'
import { BATTLE_BACKGROUND_ASSETS } from '../src/game/data/battleBackgroundAssets.generated.js'

const root = path.resolve('public')
const sizes = { 960: { width: 960, height: 640 }, 1536: { width: 1536, height: 1024 } }
const errors = []
for (const id of Object.keys(BATTLE_BACKGROUNDS)) {
  const variants = BATTLE_BACKGROUND_ASSETS[id]
  if (!variants) {
    errors.push(`${id}: missing generated manifest entry`)
    continue
  }
  for (const [width, expected] of Object.entries(sizes)) {
    const assetPath = variants[width]?.path
    if (!assetPath) {
      errors.push(`${id}/${width}: missing mobile or desktop variant`)
      continue
    }
    const filePath = path.join(root, assetPath.replace(/^\//, ''))
    try {
      const metadata = await sharp(filePath).metadata()
      assert.equal(metadata.width, expected.width, `${id}/${width}: width`)
      assert.equal(metadata.height, expected.height, `${id}/${width}: height`)
      assert.equal(metadata.format, 'webp', `${id}/${width}: format`)
      const bytes = await fs.readFile(filePath)
      assert.equal(bytes.length, variants[width].bytes, `${id}/${width}: stale byte count`)
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
      assert.ok(assetPath.includes(`-${hash}-${width}.webp`), `${id}/${width}: content hash drift`)
    } catch (error) {
      errors.push(`${id}/${width}: ${error.message}`)
    }
  }
}
for (const id of Object.keys(BATTLE_BACKGROUNDS)) {
  const placement = JSON.parse(await fs.readFile(`output/battle-backgrounds/blender/${id}.placement.json`, 'utf8'))
  assert.equal(placement.overlaps, 0, `${id}: overlapping model footprints`)
  for (const [index, a] of placement.footprints.entries()) {
    for (const b of placement.footprints.slice(index + 1)) {
      assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `${id}: intersecting footprints`)
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Battle background assets passed: ${Object.keys(BATTLE_BACKGROUNDS).length} scenes, ${Object.keys(BATTLE_BACKGROUNDS).length * 2} variants, no missing files or dimension drift.`)
