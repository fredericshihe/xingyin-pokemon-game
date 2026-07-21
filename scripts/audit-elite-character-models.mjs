#!/usr/bin/env node

import * as THREE from 'three'
import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'
import { GODOT_REGION_MAPS } from '../src/game/data/godotMaps/godot_region_maps.js'
import {
  createEliteFourCharacterTemplate,
  isEliteFourCharacterType
} from '../src/game/eliteFourCharacterVisual.js'

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

    if (!isEliteFourCharacterType(modelType)) {
      failures.push(`${label}: ${modelType} 未注册到 procedural 角色工厂。`)
      continue
    }

    const asset = MAP_ASSET_CATALOG[modelType]
    if (!asset || asset.procedural !== true || asset.assetPath != null) {
      failures.push(`${label}: ${modelType} 必须以无外部 assetPath 的 procedural 模型登记。`)
    }

    const template = createEliteFourCharacterTemplate(modelType)
    if (!template) {
      failures.push(`${label}: 无法创建模型 ${modelType}。`)
      continue
    }
    template.updateMatrixWorld(true)

    let meshCount = 0
    template.traverse((child) => {
      if (child.isMesh && child.geometry) meshCount += 1
    })
    const bounds = new THREE.Box3().setFromObject(template)
    const dimensions = bounds.getSize(new THREE.Vector3())
    const renderScale = Number(asset?.defaultScale) || 1
    const renderedHeight = dimensions.y * renderScale
    const visualSignature = template.userData.eliteVisualSignature
    const expectedRank = properties.role === 'boss' ? 'master' : 'lieutenant'

    if (template.userData.eliteDisplayName !== characterName) {
      failures.push(`${label}: 模型内显示名为 ${template.userData.eliteDisplayName || '未配置'}。`)
    }
    if (template.userData.eliteTheme !== expectation.theme || properties.visualTheme !== expectation.theme) {
      failures.push(`${label}: 模型或事件的主题与 ${expectation.theme} 不一致。`)
    }
    if (template.userData.eliteRole !== expectedRank) {
      failures.push(`${label}: 模型身份应为 ${expectedRank}，实际为 ${template.userData.eliteRole || '未配置'}。`)
    }
    if (!visualSignature || visualSignatures.has(visualSignature)) {
      failures.push(`${label}: 缺少唯一视觉签名，或签名 ${visualSignature} 已被使用。`)
    } else {
      visualSignatures.add(visualSignature)
    }
    if (meshCount < 20) {
      failures.push(`${label}: 仅有 ${meshCount} 个可见部件，角色特征不足。`)
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
      archetype: template.userData.eliteArchetype,
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
