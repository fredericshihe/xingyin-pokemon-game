import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
import fs from 'node:fs'

const byId = new Map(MONSTERS.map(m => [m.id, m]))
const name = id => byId.get(id)?.name ?? `?${id}?`

// 区域4-8需要清理的低等级baby形态
const REGIONS_TO_FIX = [
  { id: 'GodotMapV2_PirateShore', minLv: 23, maxLv: 30, name: '贝壳海岸' },
  { id: 'GodotMapV2_Graveyard', minLv: 29, maxLv: 36, name: '月影墓园' },
  { id: 'GodotMapV2_HexRuins', minLv: 35, maxLv: 42, name: '六角遗迹' },
  { id: 'GodotMapV2_SurvivalRidge', minLv: 41, maxLv: 47, name: '铁木营地' },
  { id: 'GodotMapV2_BossHighland', minLv: 52, maxLv: 60, name: '星雾高地' }
]

// 需要移除的低等级baby形态（等级上限≤29）
const TO_REMOVE = [3, 112, 113, 116, 120, 121, 83, 92, 93, 95] // 杰尼龟, 魔尼尼, 小卡比兽, 小福蛋, 盆才怪, 无畏小子, 卡蒂狗, 电击怪, 迷唇娃, 鸭嘴宝宝

// 替换建议（等级匹配的稀有/进化形态）
const REPLACEMENTS = {
  'GodotMapV2_PirateShore': [8, 54, 86, 187], // 暴鲤龙, 海刺龙, 刺龙王, 金鱼王
  'GodotMapV2_Graveyard': [6, 21, 100, 101], // 耿鬼, 鬼斯通, 臭泥, 瓦斯弹(保留原有)
  'GodotMapV2_HexRuins': [38, 45, 108, 143], // 三合一磁怪, 顽皮雷弹, 多边兽II, 自爆磁怪
  'GodotMapV2_SurvivalRidge': [34, 35, 139, 104], // 怪力, 隆隆岩, 大钢蛇, 超甲狂犀
  'GodotMapV2_BossHighland': [12, 72, 74, 76, 142, 129] // 妙蛙花, 喷火龙, 水箭龟, 班基拉斯, 快龙(保留传说)
}

console.log('=== 清理试炼池等级不匹配条目 ===\n')

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

for (const region of REGIONS_TO_FIX) {
  console.log(`\n## ${region.name} (Lv${region.minLv}-${region.maxLv})`)
  
  // 定位该区域的challengeRarePool
  const regionStart = txt.indexOf(`${region.id}: {`)
  if (regionStart === -1) { console.log('  ✗ 未找到区域配置'); continue }
  
  const slice = txt.slice(regionStart, regionStart + 3000)
  const poolMatch = slice.match(/challengeRarePool:\s*\[([\s\S]*?)\],/)
  if (!poolMatch) { console.log('  ✗ 未找到试炼池'); continue }
  
  const oldPool = poolMatch[1]
  
  // 提取当前池中的所有id
  const currentIds = [...oldPool.matchAll(/(?:pokemonId:\s*)?(\d+)/g)]
    .map(m => +m[1])
    .filter(id => byId.has(id))
  
  console.log(`  当前池: ${currentIds.map(id => name(id)).join(', ')}`)
  
  // 过滤掉需要移除的
  const filtered = currentIds.filter(id => !TO_REMOVE.includes(id))
  
  // 检查哪些被移除了
  const removed = currentIds.filter(id => TO_REMOVE.includes(id))
  if (removed.length > 0) {
    console.log(`  移除: ${removed.map(id => `${name(id)}(id${id})`).join(', ')}`)
  }
  
  // 添加替换物种（去重）
  const replacements = REPLACEMENTS[region.id] || []
  const newPool = [...new Set([...filtered, ...replacements])]
  
  // 验证新池中所有物种的等级合法性
  const invalid = []
  for (const id of newPool) {
    const bounds = getSpeciesLevelBounds(id)
    if (bounds.max < region.minLv || bounds.min > region.maxLv) {
      invalid.push(`${name(id)}(${bounds.min}-${bounds.max})`)
    }
  }
  
  if (invalid.length > 0) {
    console.log(`  ⚠️ 仍有不匹配: ${invalid.join(', ')}`)
  }
  
  // 构建新的池配置
  const newPoolStr = newPool.map(id => `      ${id}`).join(',\n')
  const newConfig = `challengeRarePool: [\n${newPoolStr}\n    ],`
  
  // 替换
  const oldConfig = `challengeRarePool: [${oldPool}],`
  txt = txt.replace(oldConfig, newConfig)
  
  console.log(`  新池(${newPool.length}只): ${newPool.map(id => name(id)).join(', ')}`)
}

fs.writeFileSync(file, txt)
console.log('\n✓ 试炼池优化完成')
