import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const POKEMON_ART_MAX = 512
const ITEM_ART_MAX = 384
const WEBP_QUALITY = 82

const targets = [
  {
    label: 'pokemon',
    dir: path.join(root, 'public/assets/pokemon/official-artwork'),
    maxDim: POKEMON_ART_MAX
  },
  {
    label: 'items',
    dir: path.join(root, 'public/assets/items/official-artwork'),
    maxDim: ITEM_ART_MAX
  }
]

const convertPngToWebp = async ({ dir, maxDim, label }) => {
  let converted = 0
  let skipped = 0
  let bytesBefore = 0
  let bytesAfter = 0
  const files = (await fs.readdir(dir)).filter((name) => name.endsWith('.png'))

  for (const fileName of files) {
    const pngPath = path.join(dir, fileName)
    const webpPath = path.join(dir, fileName.replace(/\.png$/i, '.webp'))
    const pngStat = await fs.stat(pngPath)
    bytesBefore += pngStat.size

    try {
      const webpStat = await fs.stat(webpPath)
      if (webpStat.mtimeMs >= pngStat.mtimeMs) {
        skipped += 1
        bytesAfter += webpStat.size
        continue
      }
    } catch {
      // regenerate
    }

    const image = sharp(pngPath)
    const meta = await image.metadata()
    const width = meta.width || 1
    const height = meta.height || 1
    const scale = Math.min(1, maxDim / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    await image
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toFile(webpPath)

    const nextStat = await fs.stat(webpPath)
    bytesAfter += nextStat.size
    converted += 1
  }

  return { label, converted, skipped, total: files.length, bytesBefore, bytesAfter }
}

const results = []
for (const target of targets) {
  results.push(await convertPngToWebp(target))
}

console.log(JSON.stringify({
  webpQuality: WEBP_QUALITY,
  results,
  savedBytes: results.reduce((sum, item) => sum + (item.bytesBefore - item.bytesAfter), 0)
}, null, 2))
