import { MONSTERS } from '../src/utils/gameData.js'
import fs from 'node:fs'

const byId = new Map(MONSTERS.map(m => [m.id, m]))
const name = id => byId.get(id)?.name ?? `?${id}?`

const maps = fs.readFileSync('src/game/data/godotMaps/godot_region_maps.js', 'utf-8')

console.log('# Boss支援队伍分析与优化\n')

const REGIONS = [
  { id: 'GodotMapV2', name: '星音草径', theme: '草/毒' },
  { id: 'GodotMapV2_MistLake', name: '雾湖苇岸', theme: '水系' },
  { id: 'GodotMapV2_FarmTown', name: '风车农庄', theme: '普通/格斗' },
  { id: 'GodotMapV2_PirateShore', name: '贝壳海岸', theme: '水/岩石' },
  { id: 'GodotMapV2_Graveyard', name: '月影墓园', theme: '幽灵/毒' },
  { id: 'GodotMapV2_HexRuins', name: '六角遗迹', theme: '电/超能' },
  { id: 'GodotMapV2_SurvivalRidge', name: '铁木营地', theme: '格斗/岩石/钢' },
  { id: 'GodotMapV2_BossHighland', name: '星雾高地', theme: '终极' }
]

for (const region of REGIONS) {
  const start = maps.indexOf(`${region.id}: {`)
  if (start === -1) continue
  
  const slice = maps.slice(start, start + 3000)
  
  // Boss稀有
  const bossMatch = slice.match(/bossRarePokemon:\s*\{\s*pokemonId:\s*(\d+)/)
  const boss = bossMatch ? name(+bossMatch[1]) : '无'
  
  // Boss支援
  const supportMatch = slice.match(/bossSupportSpeciesIds:\s*\[([^\]]+)\]/)
  const support = supportMatch ? supportMatch[1].split(',').map(s => name(+s.trim())).join(', ') : '无'
  
  console.log(`## ${region.name} (${region.theme})`)
  console.log(`- Boss稀有: ${boss}`)
  console.log(`- Boss支援: ${support}`)
  console.log()
}

console.log('\n# 优化建议\n')
console.log('Boss支援队伍应该:')
console.log('1. 与区域主题一致')
console.log('2. 包含该区域的代表性强力宝可梦')
console.log('3. 形成类型互补，增加挑战性')
console.log('4. 利用新增的进化形态')
