#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { withViteAuditServer } from './load-vite-module.mjs'

const root = process.cwd()
const publicDir = path.join(root, 'public')
const sample = (items, limit = 20) => items.slice(0, limit)

const toLocalPublicPath = (assetPath) => {
  if (typeof assetPath !== 'string' || assetPath.length === 0) return null
  if (/^https?:\/\//i.test(assetPath)) return null
  const cleanPath = assetPath.split('?')[0].replace(/^\/+/, '')
  return path.join(publicDir, cleanPath)
}

const extractArtworkDexNo = (assetPath) => {
  if (typeof assetPath !== 'string') return null
  const match = assetPath.match(/\/assets\/pokemon\/official-artwork\/(\d+)\.(?:png|webp)(?:\?.*)?$/i)
  const dexNo = match ? Number(match[1]) : null
  return Number.isSafeInteger(dexNo) && dexNo > 0 ? dexNo : null
}

const fileHash = (filePath) => (
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
)

await withViteAuditServer(async ({ loadModule }) => {
  const { OFFICIAL_DEX_MONSTERS } = await loadModule('/src/utils/gameData.js')

  const spriteDexMismatches = []
  const missingArtworkFiles = []
  const duplicateArtworkGroups = []
  const hashGroups = new Map()

  for (const monster of OFFICIAL_DEX_MONSTERS) {
    const dexNo = Number(monster.dexNo ?? monster.pokedexId)
    if (!Number.isSafeInteger(dexNo) || dexNo <= 0) continue

    for (const [field, assetPath] of [
      ['sprite', monster.sprite],
      ['fallbackSprite', monster.fallbackSprite],
    ]) {
      const assetDexNo = extractArtworkDexNo(assetPath)
      if (assetDexNo !== dexNo) {
        spriteDexMismatches.push({
          id: monster.id,
          dexNo,
          name: monster.name,
          field,
          assetPath,
          assetDexNo,
        })
      }

      const localPath = toLocalPublicPath(assetPath)
      if (!localPath || !fs.existsSync(localPath)) {
        missingArtworkFiles.push({
          id: monster.id,
          dexNo,
          name: monster.name,
          field,
          assetPath,
        })
        continue
      }

      const ext = path.extname(localPath).toLowerCase()
      const hashKey = `${ext}:${fileHash(localPath)}`
      if (!hashGroups.has(hashKey)) hashGroups.set(hashKey, [])
      hashGroups.get(hashKey).push({
        id: monster.id,
        dexNo,
        name: monster.name,
        field,
        file: path.relative(root, localPath),
      })
    }
  }

  for (const entries of hashGroups.values()) {
    const dexNos = [...new Set(entries.map((entry) => entry.dexNo))]
    const fields = [...new Set(entries.map((entry) => entry.field))]
    if (dexNos.length <= 1 || fields.length !== 1) continue
    duplicateArtworkGroups.push({ field: fields[0], dexNos, entries })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      monsterCount: OFFICIAL_DEX_MONSTERS.length,
      spriteDexMismatchCount: spriteDexMismatches.length,
      missingArtworkFileCount: missingArtworkFiles.length,
      duplicateArtworkGroupCount: duplicateArtworkGroups.length,
    },
    samples: {
      spriteDexMismatches: sample(spriteDexMismatches),
      missingArtworkFiles: sample(missingArtworkFiles),
      duplicateArtworkGroups: sample(duplicateArtworkGroups),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (
    spriteDexMismatches.length > 0 ||
    missingArtworkFiles.length > 0 ||
    duplicateArtworkGroups.length > 0
  ) {
    process.exitCode = 1
  }
})
