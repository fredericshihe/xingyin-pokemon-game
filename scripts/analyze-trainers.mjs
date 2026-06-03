import fs from 'node:fs'
import { MONSTERS } from '../src/utils/gameData.js'

const byId = new Map(MONSTERS.map(m => [m.id, m]))
const name = id => byId.get(id)?.name ?? `?${id}?`
const typ = id => { const m = byId.get(id); return m ? [m.type, m.type2].filter(Boolean).join('/') : '?' }

const maps = fs.readFileSync('src/game/data/godotMaps/godot_region_maps.js', 'utf-8')

const REGIONS = [
  'GodotMapV2',
  'GodotMapV2_MistLake',
  'GodotMapV2_FarmTown',
  'GodotMapV2_PirateShore',
  'GodotMapV2_Graveyard',
  'GodotMapV2_HexRuins',
  'GodotMapV2_SurvivalRidge',
  'GodotMapV2_BossHighland'
]

console.log('# 当前训练师配置分析\n')

for (const region of REGIONS) {
  const start = maps.indexOf(`REGION_TRAINER_ROSTERS = {`)
  if (start === -1) continue
  
  const slice = maps.slice(start, start + 15000)
  const regionMatch = slice.match(new RegExp(`${region}:\\s*\\{([\\s\\S]*?)\\n  \\},\\n  \\w+:`, 'm'))
  
  if (regionMatch) {
    const body = regionMatch[1]
    
    // 提取trainers
    const trainersMatch = body.match(/trainers:\s*\[([\s\S]*?)\],/)
    if (trainersMatch) {
      const trainers = [...trainersMatch[1].matchAll(/\{\s*name:\s*'([^']+)'[^}]*speciesIds:\s*\[([^\]]+)\]/g)]
      
      console.log(`## ${region}`)
      console.log('### 普通训练师')
      for (const [, trainerName, idsStr] of trainers) {
        const ids = idsStr.split(',').map(s => +s.trim())
        const types = [...new Set(ids.map(id => typ(id).split('/')[0]))]
        console.log(`- ${trainerName}: ${ids.map(id => name(id)).join(', ')} (类型: ${types.join(', ')})`)
      }
    }
    
    // 提取lieutenants
    const lieutenantsMatch = body.match(/lieutenants:\s*\[([\s\S]*?)\],/)
    if (lieutenantsMatch) {
      const lieutenants = [...lieutenantsMatch[1].matchAll(/\{\s*name:\s*'([^']+)'[^}]*speciesIds:\s*\[([^\]]+)\]/g)]
      
      console.log('### 巡守')
      for (const [, ltName, idsStr] of lieutenants) {
        const ids = idsStr.split(',').map(s => +s.trim())
        const types = [...new Set(ids.map(id => typ(id).split('/')[0]))]
        console.log(`- ${ltName}: ${ids.map(id => name(id)).join(', ')} (类型: ${types.join(', ')})`)
      }
    }
    
    console.log()
  }
}
