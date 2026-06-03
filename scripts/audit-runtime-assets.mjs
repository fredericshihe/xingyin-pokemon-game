import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { MONSTERS, POKEBALLS, POTIONS, EXP_POTIONS, EVOLUTION_ITEMS } from '../src/utils/gameData.js'
import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const publicRoot = path.join(repoRoot, 'public')

const SOURCE_DIRS = ['src', 'scripts']
const SOURCE_FILE_RE = /\.(js|jsx|mjs|json|sql|md)$/
const ASSET_REF_RE = /['"`](\/assets\/[^'"`\s)]+)['"`]/g
const RASTER_IMAGE_RE = /\.(png|jpe?g|webp)$/i
const SVG_IMAGE_RE = /\.svg$/i
const CONCRETE_ASSET_FILE_RE = /\.[a-z0-9]+(?:[?#].*)?$/i

const runtimeItemCatalogs = [
  ['POKEBALLS', POKEBALLS],
  ['POTIONS', POTIONS],
  ['EXP_POTIONS', EXP_POTIONS],
  ['EVOLUTION_ITEMS', EVOLUTION_ITEMS]
]

function walkFiles(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, output)
      continue
    }
    if (SOURCE_FILE_RE.test(entry.name)) output.push(fullPath)
  }
  return output
}

function findLiteralAssetRefs() {
  const refs = new Map()

  SOURCE_DIRS
    .map((dir) => path.join(repoRoot, dir))
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => walkFiles(dir))
    .forEach((filePath) => {
      const text = fs.readFileSync(filePath, 'utf8')
      let match = null
      while ((match = ASSET_REF_RE.exec(text))) {
        const assetPath = match[1]
        if (!CONCRETE_ASSET_FILE_RE.test(assetPath)) continue
        const list = refs.get(assetPath) || []
        list.push(path.relative(repoRoot, filePath))
        refs.set(assetPath, list)
      }
      ASSET_REF_RE.lastIndex = 0
    })

  return refs
}

function getPublicAssetFilePath(publicAssetPath) {
  return path.join(publicRoot, publicAssetPath.split('?')[0].replace(/^\//, ''))
}

function fileExists(publicAssetPath) {
  return fs.existsSync(getPublicAssetFilePath(publicAssetPath))
}

function addAssetRef(refs, assetPath, usage) {
  if (!assetPath || typeof assetPath !== 'string') return
  if (!CONCRETE_ASSET_FILE_RE.test(assetPath)) return
  const list = refs.get(assetPath) || []
  list.push(usage)
  refs.set(assetPath, list)
}

function addCatalogAssetRefs(refs) {
  for (const monster of MONSTERS) {
    addAssetRef(refs, monster?.sprite, `MONSTERS.${monster?.name}.sprite`)
    addAssetRef(refs, monster?.backSprite, `MONSTERS.${monster?.name}.backSprite`)
    addAssetRef(refs, monster?.fallbackSprite, `MONSTERS.${monster?.name}.fallbackSprite`)
  }

  for (const [catalogName, catalog] of runtimeItemCatalogs) {
    for (const [itemKey, item] of Object.entries(catalog)) {
      addAssetRef(refs, item?.sprite, `${catalogName}.${itemKey}.sprite`)
    }
  }

  for (const [assetId, asset] of Object.entries(MAP_ASSET_CATALOG)) {
    if (asset?.status !== 'active') continue
    addAssetRef(refs, asset.assetPath, `MAP_ASSET_CATALOG.${assetId}.assetPath`)
  }
}

function getRuntimeAssetRefs() {
  const refs = findLiteralAssetRefs()
  addCatalogAssetRefs(refs)
  return refs
}

async function auditRuntimeAssetFiles(errors) {
  const refs = getRuntimeAssetRefs()
  for (const [assetPath, usages] of refs.entries()) {
    if (assetPath.includes('${')) continue
    const usageLabel = `${usages[0]}${usages.length > 1 ? ` 等 ${usages.length} 处` : ''}`
    if (!fileExists(assetPath)) {
      errors.push(`缺少静态资源 ${assetPath} <- ${usageLabel}`)
      continue
    }

    const filePath = getPublicAssetFilePath(assetPath)
    const stats = fs.statSync(filePath)
    if (stats.size <= 0) {
      errors.push(`静态资源为空文件 ${assetPath} <- ${usageLabel}`)
      continue
    }

    try {
      if (RASTER_IMAGE_RE.test(assetPath)) {
        const metadata = await sharp(filePath).metadata()
        if (!metadata.width || !metadata.height) {
          errors.push(`图片尺寸无效 ${assetPath} <- ${usageLabel}`)
        }
      } else if (SVG_IMAGE_RE.test(assetPath)) {
        const text = fs.readFileSync(filePath, 'utf8')
        if (!text.includes('<svg')) {
          errors.push(`SVG 内容无效 ${assetPath} <- ${usageLabel}`)
        }
      }
    } catch (error) {
      errors.push(`静态资源无法读取 ${assetPath}: ${error.message} <- ${usageLabel}`)
    }
  }
}

async function main() {
  const errors = []

  await auditRuntimeAssetFiles(errors)

  if (errors.length > 0) {
    console.error('Runtime asset audit failed:')
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }

  console.log('Runtime asset audit passed.')
}

main().catch((error) => {
  console.error('Runtime asset audit crashed:', error)
  process.exitCode = 1
})
