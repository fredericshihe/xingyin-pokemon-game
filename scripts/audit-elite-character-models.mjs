#!/usr/bin/env node

import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'
import { GODOT_REGION_MAPS } from '../src/game/data/godotMaps/godot_region_maps.js'
import { isCharacterModelKey } from '../src/game/data/characterAssets.js'

const manifest = JSON.parse(await fs.readFile(new URL('../public/assets/3d/xingyin-characters-v1/manifest.json', import.meta.url), 'utf8'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })

const ELITE_MAP_EXPECTATIONS = {
  GodotMapV2_FrostDojo: {
    theme: 'frost',
    characters: {
      霜纹哨兵: 'elite_frost_sentinel',
      镜湖术士: 'elite_frost_mystic',
      白雾守卫: 'elite_frost_warden',
      霜镜天王: 'elite_frost_master'
    }
  },
  GodotMapV2_TideDojo: {
    theme: 'tide',
    characters: {
      潮汐潜员: 'elite_tide_diver',
      深海猎手: 'elite_tide_hunter',
      漩涡祭司: 'elite_tide_priest',
      深潮天王: 'elite_tide_master'
    }
  },
  GodotMapV2_IronDojo: {
    theme: 'iron',
    characters: {
      铸盾工匠: 'elite_iron_smith',
      磁轨技师: 'elite_iron_engineer',
      王座禁卫: 'elite_iron_royal_guard',
      铁壁天王: 'elite_iron_master'
    }
  },
  GodotMapV2_DragonDojo: {
    theme: 'dragon',
    characters: {
      龙牙试炼官: 'elite_dragon_examiner',
      天穹追猎者: 'elite_dragon_hunter',
      终焉守门人: 'elite_dragon_gatekeeper',
      龙穹天王: 'elite_dragon_master'
    }
  }
}

const failures = []
const usedModelTypes = new Set()
const visualSignatures = new Set()
const report = []

for (const [mapId, expectation] of Object.entries(ELITE_MAP_EXPECTATIONS)) {
  const mapInfo = GODOT_REGION_MAPS[mapId]
  if (!mapInfo) {
    failures.push(`${mapId}: 地图不存在。`)
    continue
  }

  const encounters = (mapInfo.runtimeEvents || []).filter((event) => (
    event?.properties?.role === 'lieutenant' || event?.properties?.role === 'boss'
  ))
  const mapModelTypes = new Set()
  const mapRecords = []

  if (encounters.length !== 4) {
    failures.push(`${mapInfo.displayName}: 应有 4 个终局角色，实际为 ${encounters.length}。`)
  }

  for (const event of encounters) {
    const properties = event.properties || {}
    const characterName = properties.name || event.id
    const modelType = properties.characterModel
    const expectedModelType = expectation.characters[characterName]
    const label = `${mapInfo.displayName} · ${characterName}`

    if (!expectedModelType) {
      failures.push(`${label}: 不在角色模型审计清单中。`)
      continue
    }
    if (modelType !== expectedModelType) {
      failures.push(`${label}: 应使用 ${expectedModelType}，实际为 ${modelType || '未配置'}。`)
      continue
    }
    if (mapModelTypes.has(modelType)) {
      failures.push(`${label}: 与同馆其他角色重复使用模型 ${modelType}。`)
    }
    if (usedModelTypes.has(modelType)) {
      failures.push(`${label}: 与其他终局角色重复使用模型 ${modelType}。`)
    }
    mapModelTypes.add(modelType)
    usedModelTypes.add(modelType)

    if (!isCharacterModelKey(modelType)) {
      failures.push(`${label}: ${modelType} 未注册到 Blender 角色清单。`)
      continue
    }

    const asset = MAP_ASSET_CATALOG[modelType]
    if (!asset || asset.procedural || !asset.assetPath?.includes('xingyin-characters-v1')) {
      failures.push(`${label}: ${modelType} 未使用新版 Blender GLB。`)
      continue
    }

    const profile = manifest.characters.find((entry) => entry.id === modelType)
    if (!profile) {
      failures.push(`${label}: 无法创建模型 ${modelType}。`)
      continue
    }
    const file = new URL(`../public${asset.assetPath}`, import.meta.url)
    const document = await io.read(fileURLToPath(file))
    const meshCount = document.getRoot().listMeshes().length
    const { min, max } = getBounds(document.getRoot().listScenes()[0])
    const dimensions = { x: max[0]-min[0], y: max[1]-min[1], z: max[2]-min[2] }
    const decoration = mapInfo.decorativeObjects.find((object) => object.eventId === event.id && object.type === modelType)
    const renderScale = Number(decoration?.scale ?? asset.defaultScale) || 1
    const renderedHeight = dimensions.y * renderScale
    const visualSignature = createHash('sha256').update(await fs.readFile(file)).digest('hex')
    const expectedRank = properties.role === 'boss' ? 'master' : 'lieutenant'

    if (profile.name !== characterName) {
      failures.push(`${label}: 模型内显示名为 ${profile.name || '未配置'}。`)
    }
    if (profile.theme !== expectation.theme || properties.visualTheme !== expectation.theme) {
      failures.push(`${label}: 模型或事件的主题与 ${expectation.theme} 不一致。`)
    }
    if (profile.rank !== expectedRank) {
      failures.push(`${label}: 模型身份应为 ${expectedRank}，实际为 ${profile.rank || '未配置'}。`)
    }
    if (!visualSignature || visualSignatures.has(visualSignature)) {
      failures.push(`${label}: 缺少唯一视觉签名，或签名 ${visualSignature} 已被使用。`)
    } else {
      visualSignatures.add(visualSignature)
    }
    if (meshCount !== 1) {
      failures.push(`${label}: 应合并为一个网格降低移动端绘制开销，实际 ${meshCount}。`)
    }
    if (renderedHeight < 1.9 || renderedHeight > 3.6) {
      failures.push(`${label}: 渲染高度 ${renderedHeight.toFixed(2)} 超出地图角色安全范围。`)
    }
    if (dimensions.x * renderScale > 2.35 || dimensions.z * renderScale > 1.65) {
      failures.push(`${label}: 模型占地过大，可能遮路或与相邻物件重叠。`)
    }

    const record = {
      name: characterName,
      role: expectedRank,
      modelType,
      archetype: profile.style,
      meshCount,
      renderedSize: [dimensions.x, dimensions.y, dimensions.z]
        .map((value) => Number((value * renderScale).toFixed(2)))
    }
    mapRecords.push(record)
    report.push({ map: mapInfo.displayName, ...record })
  }

  const master = mapRecords.find((record) => record.role === 'master')
  const lieutenants = mapRecords.filter((record) => record.role === 'lieutenant')
  const tallestLieutenant = Math.max(0, ...lieutenants.map((record) => record.renderedSize[1]))
  if (!master || master.renderedSize[1] <= tallestLieutenant + 0.15) {
    failures.push(`${mapInfo.displayName}: 天王模型必须比馆内所有部下至少高 0.15 个世界单位。`)
  }
}

if (usedModelTypes.size !== 16) {
  failures.push(`终局角色必须使用 16 个独立模型，实际为 ${usedModelTypes.size} 个。`)
}

if (failures.length > 0) {
  console.error('[audit-elite-character-models] FAILED')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(JSON.stringify({
  summary: {
    maps: Object.keys(ELITE_MAP_EXPECTATIONS).length,
    characters: report.length,
    uniqueModelTypes: usedModelTypes.size,
    uniqueVisualSignatures: visualSignatures.size
  },
  characters: report
}, null, 2))
console.log('[audit-elite-character-models] OK: 16 Elite Four characters use distinct, correctly scaled silhouettes.')
