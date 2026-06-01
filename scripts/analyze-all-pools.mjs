import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
import fs from 'node:fs'

const byId = new Map(MONSTERS.map(m => [m.id, m]))
const name = id => byId.get(id)?.name ?? `?${id}?`
const typ = id => { const m = byId.get(id); return m ? [m.type, m.type2].filter(Boolean).join('/') : '?' }

const maps = fs.readFileSync('src/game/data/godotMaps/godot_region_maps.js', 'utf-8')

const REGIONS = [
  { id: 'GodotMapV2_PirateShore', minLv: 23, maxLv: 30, name: '贝壳海岸', theme: '水/岩石' },
  { id: 'GodotMapV2_Graveyard', minLv: 29, maxLv: 36, name: '月影墓园', theme: '幽灵/毒/恶' },
  { id: 'GodotMapV2_HexRuins', minLv: 35, maxLv: 42, name: '六角遗迹', theme: '电/超能/岩石' },
  { id: 'GodotMapV2_SurvivalRidge', minLv: 41, maxLv: 47, name: '铁木营地', theme: '格斗/岩石/钢' },
  { id: 'GodotMapV2_BossHighland', minLv: 52, maxLv: 60, name: '星雾高地', theme: '终极' }
]

console.log('# 试炼池详细分析\n')

for (const region of REGIONS) {
  const start = maps.indexOf(`${region.id}: {`)
  if (start === -1) continue
  
  const slice = maps.slice(start, start + 3500)
  const match = slice.match(/challengeRarePool:\s*\[([\s\S]*?)\n\s{4}\],/)
  if (!match) continue
  
  const body = match[1]
  const entries = []
  
  // 解析对象条目
  for (const m of body.matchAll(/\{\s*pokemonId:\s*(\d+)[^}]*?\}/g)) {
    entries.push(+m[1])
  }
  
  // 解析纯数字条目
  const objIds = new Set(entries)
  for (const m of body.matchAll(/(?:^|[,\s])(\d+)(?=\s*[,\n])/gm)) {
    const id = +m[1]
    if (byId.has(id) && !objIds.has(id)) entries.push(id)
  }
  
  console.log(`## ${region.name} (Lv${region.minLv}-${region.maxLv}, 主题:${region.theme})`)
  console.log(`试炼池(${entries.length}只):`)
  
  const issues = []
  for (const id of entries) {
    const bounds = getSpeciesLevelBounds(id)
    const valid = !(bounds.max < region.minLv || bounds.min > region.maxLv)
    const t = typ(id)
    const status = valid ? '✓' : '✗等级不匹配'
    console.log(`  ${status} ${String(id).padStart(3)} ${name(id).padEnd(8)} ${t.padEnd(16)} 合法[${bounds.min}-${bounds.max===100?'∞':bounds.max}]`)
    
    if (!valid) issues.push(id)
  }
  
  if (issues.length > 0) {
    console.log(`  ⚠️ 需移除: ${issues.map(id => name(id)).join(', ')}`)
  }
  console.log()
}
