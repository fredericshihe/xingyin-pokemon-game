import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { BATTLE_BACKGROUNDS } from '../src/game/data/battleBackgroundCatalog.js'

const source = path.resolve(process.argv[2] || 'output/imagegen/battle-backgrounds')
const destination = 'public/assets/battle-backgrounds/v1'
// Validate the entire batch before publishing any manifest or referencing files.
const originals = await Promise.all(Object.keys(BATTLE_BACKGROUNDS).map(async id => {
  const file = path.join(source, `${id}.png`)
  const metadata = await sharp(file).metadata()
  if (metadata.width < 1024 || metadata.height < 680) throw new Error(`${id}: source image is too small`)
  return { id, file }
}))
await fs.mkdir(destination, { recursive: true })
const manifest = {}
for (const { id, file } of originals) {
  const variants = {}
  for (const width of [960, 1536]) {
    const data = await sharp(file).resize({ width, withoutEnlargement: true }).webp({ quality: width === 960 ? 79 : 82, effort: 6 }).toBuffer()
    if (data.length > (width === 960 ? 200000 : 400000)) throw new Error(`${id}/${width}: exceeds image transfer budget`)
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 12)
    const name = `${id}-${hash}-${width}.webp`
    await fs.writeFile(path.join(destination, name), data)
    variants[width] = { path: `/assets/battle-backgrounds/v1/${name}`, bytes: data.length }
  }
  manifest[id] = variants
}
await fs.writeFile('src/game/data/battleBackgroundAssets.generated.js', `// Generated only from real, reviewed image outputs.\nexport const BATTLE_BACKGROUND_ASSETS = ${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Optimized ${originals.length} generated backgrounds into ${originals.length * 2} WebP assets. Hook up the reviewed manifest before production release.`)
