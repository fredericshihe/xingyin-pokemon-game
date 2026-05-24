import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { MONSTERS, POKEBALLS, POTIONS, EXP_POTIONS, EVOLUTION_ITEMS } from '../src/utils/gameData.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const publicRoot = path.join(repoRoot, 'public')

const SOURCE_DIRS = ['src', 'scripts']
const SOURCE_FILE_RE = /\.(js|jsx|mjs|json|sql|md)$/
const ASSET_REF_RE = /['"`](\/assets\/[^'"`\s)]+)['"`]/g

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
        const list = refs.get(assetPath) || []
        list.push(path.relative(repoRoot, filePath))
        refs.set(assetPath, list)
      }
      ASSET_REF_RE.lastIndex = 0
    })

  return refs
}

function fileExists(publicAssetPath) {
  return fs.existsSync(path.join(publicRoot, publicAssetPath.replace(/^\//, '')))
}

function auditLiteralAssetRefs(errors) {
  const refs = findLiteralAssetRefs()
  for (const [assetPath, usages] of refs.entries()) {
    if (assetPath.includes('${')) continue
    if (fileExists(assetPath)) continue
    errors.push(`缺少静态资源 ${assetPath} <- ${usages[0]}${usages.length > 1 ? ` 等 ${usages.length} 处` : ''}`)
  }
}

function auditMonsterSprites(errors) {
  for (const monster of MONSTERS) {
    const front = monster?.sprite
    const back = monster?.backSprite
    const fallback = monster?.fallbackSprite
    if (front && !fileExists(front)) {
      errors.push(`宝可梦立绘缺失: ${monster.name}(${monster.id}/${monster.dexNo}) -> ${front}`)
    }
    if (back && !fileExists(back)) {
      errors.push(`宝可梦背面立绘缺失: ${monster.name}(${monster.id}/${monster.dexNo}) -> ${back}`)
    }
    if (fallback && !fileExists(fallback)) {
      errors.push(`宝可梦占位图缺失: ${monster.name}(${monster.id}/${monster.dexNo}) -> ${fallback}`)
    }
  }
}

function auditItemSprites(errors) {
  for (const [catalogName, catalog] of runtimeItemCatalogs) {
    for (const [itemKey, item] of Object.entries(catalog)) {
      if (!item?.sprite) continue
      if (!fileExists(item.sprite)) {
        errors.push(`道具立绘缺失: ${catalogName}.${itemKey} -> ${item.sprite}`)
      }
    }
  }
}

function main() {
  const errors = []

  auditLiteralAssetRefs(errors)
  auditMonsterSprites(errors)
  auditItemSprites(errors)

  if (errors.length > 0) {
    console.error('Runtime asset audit failed:')
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }

  console.log('Runtime asset audit passed.')
}

main()
