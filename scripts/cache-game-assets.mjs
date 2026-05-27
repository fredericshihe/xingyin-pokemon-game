import fs from 'node:fs/promises'
import path from 'node:path'
import https from 'node:https'
import sharp from 'sharp'
import {
  ITEM_ARTWORK_SLUGS,
  ITEM_ARTWORK_TARGET_MAX,
} from '../src/utils/itemSprites.js'

const root = process.cwd()
const gameDataPath = path.join(root, 'src/utils/gameData.js')
const gameData = await fs.readFile(gameDataPath, 'utf8')

const dexNos = [...new Set(
  [...gameData.matchAll(/dexNo:\s*(\d+)/g)]
    .map((match) => Number(match[1]))
    .filter(Boolean)
)]

if (!dexNos.includes(132)) dexNos.push(132)
dexNos.sort((a, b) => a - b)

const POKEAPI_ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'
const POKEAPI_ITEM_ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world'
const pokemonDir = path.join(root, 'public/assets/pokemon/official-artwork')
const itemArtDir = path.join(root, 'public/assets/items/official-artwork')
const legacyItemDir = path.join(root, 'public/assets/items')

await fs.mkdir(pokemonDir, { recursive: true })
await fs.mkdir(itemArtDir, { recursive: true })

const downloadBuffer = (url) => new Promise((resolve) => {
  const req = https.get(url, { timeout: 25000 }, (res) => {
    if (res.statusCode !== 200) {
      res.resume()
      resolve({ ok: false, url, status: res.statusCode })
      return
    }

    const chunks = []
    res.on('data', (chunk) => chunks.push(chunk))
    res.on('end', () => resolve({ ok: true, url, buffer: Buffer.concat(chunks) }))
  })

  req.on('timeout', () => req.destroy(new Error('timeout')))
  req.on('error', (error) => resolve({ ok: false, url, error: error.message }))
})

const ensurePokemonArt = async (dexNo) => {
  const url = `${POKEAPI_ART}/${dexNo}.png`
  const pngDest = path.join(pokemonDir, `${dexNo}.png`)
  const webpDest = path.join(pokemonDir, `${dexNo}.webp`)
  try {
    await fs.access(pngDest)
  } catch {
    const result = await downloadBuffer(url)
    if (!result.ok) return { ok: false, dest: pngDest, ...result }
    await fs.writeFile(pngDest, result.buffer)
  }

  try {
    const pngStat = await fs.stat(pngDest)
    try {
      const webpStat = await fs.stat(webpDest)
      if (webpStat.mtimeMs >= pngStat.mtimeMs) {
        return { ok: true, cached: true, dest: webpDest }
      }
    } catch {
      // regenerate webp
    }

    const meta = await sharp(pngDest).metadata()
    const width = meta.width || 1
    const height = meta.height || 1
    const maxDim = 512
    const scale = Math.min(1, maxDim / Math.max(width, height))
    await sharp(pngDest)
      .resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), {
        fit: 'inside',
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 82, effort: 4 })
      .toFile(webpDest)
  } catch (error) {
    return { ok: false, dest: webpDest, error: error.message }
  }

  return { ok: true, dest: webpDest }
}

const ensureItemArtwork = async (fileName, slug) => {
  const url = `${POKEAPI_ITEM_ART}/${slug}.png`
  const dest = path.join(itemArtDir, fileName)

  try {
    const existing = await sharp(dest).metadata()
    if (Math.max(existing.width || 0, existing.height || 0) >= ITEM_ARTWORK_TARGET_MAX - 8) {
      return { ok: true, cached: true, dest, width: existing.width, height: existing.height }
    }
  } catch {
    // regenerate
  }

  const result = await downloadBuffer(url)
  if (!result.ok) return { ok: false, dest, fileName, slug, ...result }

  const meta = await sharp(result.buffer).metadata()
  const width = meta.width || 1
  const height = meta.height || 1
  const maxDim = Math.max(width, height)
  const scale = ITEM_ARTWORK_TARGET_MAX / maxDim
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  await sharp(result.buffer)
    .resize(targetWidth, targetHeight, {
      kernel: sharp.kernel.lanczos3,
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest)

  const webpDest = dest.replace(/\.png$/i, '.webp')
  await sharp(dest)
    .webp({ quality: 82, effort: 4 })
    .toFile(webpDest)

  return { ok: true, dest, webpDest, fileName, slug, width: targetWidth, height: targetHeight }
}

let ok = 0
const failed = []

for (const dexNo of dexNos) {
  const result = await ensurePokemonArt(dexNo)
  if (result.ok) ok += 1
  else failed.push(result)
}

for (const [fileName, slug] of Object.entries(ITEM_ARTWORK_SLUGS)) {
  const result = await ensureItemArtwork(fileName, slug)
  if (result.ok) ok += 1
  else failed.push(result)
}

// 清理旧版像素放大目录中的同名文件，避免混淆
try {
  const legacyFiles = await fs.readdir(legacyItemDir)
  for (const fileName of legacyFiles) {
    if (fileName === 'official-artwork' || !fileName.endsWith('.png')) continue
    if (ITEM_ARTWORK_SLUGS[fileName]) {
      await fs.unlink(path.join(legacyItemDir, fileName))
    }
  }
} catch {
  // ignore
}

console.log(JSON.stringify({
  requestedPokemon: dexNos.length,
  requestedItems: Object.keys(ITEM_ARTWORK_SLUGS).length,
  itemArtworkTargetMax: ITEM_ARTWORK_TARGET_MAX,
  itemArtworkSource: 'pokeapi-dream-world',
  outputDir: 'public/assets/items/official-artwork',
  ok,
  failed: failed.length,
  failedSamples: failed.slice(0, 8),
}, null, 2))

if (failed.length > 0) {
  process.exitCode = 1
}
