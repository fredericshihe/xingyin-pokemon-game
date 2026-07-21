import fs from 'node:fs'
import path from 'node:path'

import {
  getP0ImageAssetUrls,
  getP1ImageAssetUrls,
  getP2ImageAssetUrls
} from '../src/utils/gameAssetBootstrap.js'
import { getGameAudioPreloadEntries } from '../src/utils/gameBgmCatalog.js'
import { toPngFallbackUrl } from '../src/utils/mediaAssetUrl.js'
import { ADVENTURE_MAP_CHAIN } from '../src/game/data/overworldMaps.js'
import { collectAllAdventureMapModelKeys, getModelAssetUrl } from '../src/game/threeLowPolyModelCache.js'

const repoRoot = process.cwd()
const publicRoot = path.join(repoRoot, 'public')

const toUnique = (values = []) => (
  [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))]
)

function stripAssetUrl(url) {
  if (typeof url !== 'string') return ''
  let value = url.trim()
  value = value.replace(/^https?:\/\/[^/]+/i, '')
  value = value.split('?')[0].split('#')[0]
  if (!value.startsWith('/')) value = `/${value}`
  return value
}

function toPublicFile(url) {
  return path.join(publicRoot, stripAssetUrl(url).replace(/^\//, ''))
}

function fileExists(url) {
  const filePath = toPublicFile(url)
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
}

function collectEntryImageUrls() {
  const urls = [
    ...getP0ImageAssetUrls(),
    ...getP2ImageAssetUrls()
  ]

  for (const mapName of ADVENTURE_MAP_CHAIN) {
    urls.push(...getP1ImageAssetUrls({ mapName, playerTeam: [] }))
  }

  return toUnique(urls)
}

function collectAudioEntries() {
  return getGameAudioPreloadEntries({
    mapName: ADVENTURE_MAP_CHAIN[0],
    includeAllMaps: true,
    includeBattleTracks: true
  })
}

function auditImages(errors) {
  const imageUrls = collectEntryImageUrls()
  for (const url of imageUrls) {
    if (fileExists(url)) continue

    const fallbackUrl = toPngFallbackUrl(url)
    if (fallbackUrl && fallbackUrl !== url && fileExists(fallbackUrl)) continue

    errors.push(`入口图片缺失：${url}`)
  }

  return imageUrls.length
}

function auditAudio(errors) {
  const entries = collectAudioEntries()
  for (const entry of entries) {
    const candidates = toUnique([entry.primary, ...(entry.alternateUrls || [])])
    if (candidates.some(fileExists)) continue
    errors.push(`入口音频缺失：${entry.primary}${entry.alternateUrls?.length ? ` (fallback: ${entry.alternateUrls.join(', ')})` : ''}`)
  }

  return entries.length
}

function auditModels(errors) {
  const modelKeys = collectAllAdventureMapModelKeys()
  for (const key of modelKeys) {
    const url = getModelAssetUrl(key)
    if (!url) {
      errors.push(`地图模型 key 无资源路径：${key}`)
      continue
    }
    if (!fileExists(url)) {
      errors.push(`地图模型缺失：${key} -> ${url}`)
    }
  }

  return modelKeys.length
}

function auditDraco(errors) {
  const dracoFiles = [
    '/draco/gltf/draco_decoder.wasm',
    '/draco/gltf/draco_wasm_wrapper.js'
  ]
  for (const url of dracoFiles) {
    if (!fileExists(url)) errors.push(`Draco 解码器缺失：${url}`)
  }
  return dracoFiles.length
}

const errors = []
const counts = {
  images: auditImages(errors),
  audio: auditAudio(errors),
  models: auditModels(errors),
  draco: auditDraco(errors)
}

if (errors.length > 0) {
  console.error('Entry preload asset audit failed:')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exitCode = 1
} else {
  console.log(`Entry preload asset audit passed. images=${counts.images}, audio=${counts.audio}, models=${counts.models}, draco=${counts.draco}`)
}
