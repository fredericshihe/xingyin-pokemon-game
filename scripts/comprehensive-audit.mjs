import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const byId = new Map(MONSTERS.map(m => [m.id, m]))
const name = id => byId.get(id)?.name ?? `?${id}?`
const typ = id => { const m = byId.get(id); return m ? [m.type, m.type2].filter(Boolean).join('/') : '?' }

const enc = fs.readFileSync(path.join(root, 'src/game/data/encounterTables.js'), 'utf-8')
const maps = fs.readFileSync(path.join(root, 'src/game/data/godotMaps/godot_region_maps.js'), 'utf-8')

// 8区域定义
const REGIONS = [
  { id: 'GodotMapV2', name: '星音草径', minLv: 5, maxLv: 12, theme: '草/毒/普通/飞行' },
  { id: 'GodotMapV2_MistLake', name: '雾湖苇岸', minLv: 11, maxLv: 18, theme: '水系' },
  { id: 'GodotMapV2_FarmTown', name: '风车农庄', minLv: 17, maxLv: 24, theme: '普通/格斗/地面/虫' },
  { id: 'GodotMapV2_PirateShore', name: '贝壳海岸', minLv: 23, maxLv: 30, theme: '水/岩石/化石' },
  { id: 'GodotMapV2_Graveyard', name: '月影墓园', minLv: 29, maxLv: 36, theme: '幽灵/毒/恶' },
  { id: 'GodotMapV2_HexRuins', name: '六角遗迹', minLv: 35, maxLv: 42, theme: '电/超能/岩石/地面' },
  { id: 'GodotMapV2_SurvivalRidge', name: '铁木营地', minLv: 41, maxLv: 47, theme: '格斗/岩石/钢/地面' },
  { id: 'GodotMapV2_BossHighland', name: '星雾高地', minLv: 52, maxLv: 60, theme: '终极' }
]

console.log('# 全面深度审查：宝可梦分布、可玩性与平衡性分析\n')

for (const region of REGIONS) {
  console.log(`\n## ${region.name} (Lv${region.minLv}-${region.maxLv}, ${region.theme})`)
  
  // 1. 野生遭遇分析
  const wildTables = ['', '_south', '_east', '_west', '_north', '_moon', '_wreck'].map(suffix => {
    const prefix = region.id === 'GodotMapV2' ? 'region_meadow' : 
                   region.id.includes('MistLake') ? 'region_lake' :
                   region.id.includes('FarmTown') ? 'region_farm' :
                   region.id.includes('PirateShore') ? 'region_shore' :
                   region.id.includes('Graveyard') ? 'region_grave' :
                   region.id.includes('HexRuins') ? 'region_ruin' :
                   region.id.includes('SurvivalRidge') ? 'region_ridge' :
                   'region_peak'
    return prefix + suffix
  })
  
  const wildSpecies = new Set()
  const wildByType = {}
  let totalWildSlots = 0
  
  for (const table of wildTables) {
    const match = enc.match(new RegExp(`${table}_\\d+_\\d+:\\s*\\{[\\s\\S]*?pokemon:\\s*\\[([\\s\\S]*?)\\]`, 'm'))
    if (match) {
      const entries = [...match[1].matchAll(/id:\s*(\d+)/g)]
      totalWildSlots += entries.length
      for (const m of entries) {
        const id = +m[1]
        wildSpecies.add(id)
        const t = typ(id)
        wildByType[t] = (wildByType[t] || 0) + 1
      }
    }
  }
  
  console.log(`\n### 野生遭遇`)
  console.log(`- 可捕捉物种数: ${wildSpecies.size}`)
  console.log(`- 总遭遇槽位: ${totalWildSlots}`)
  console.log(`- 类型分布: ${Object.entries(wildByType).sort((a,b)=>b[1]-a[1]).map(([t,c])=>`${t}(${c})`).join(', ')}`)
  
  // 检查稀有度分布
  const wildList = [...wildSpecies].map(id => ({ id, name: name(id), type: typ(id) }))
  console.log(`- 物种清单: ${wildList.map(w => w.name).join(', ')}`)
  
  // 2. 试炼池分析
  const regionMatch = maps.match(new RegExp(`${region.id}:\\s*\\{[\\s\\S]*?challengeRarePool:\\s*\\[([\\s\\S]*?)\\]`, 'm'))
  if (regionMatch) {
    const poolBody = regionMatch[1]
    const trialSpecies = new Set()
    for (const m of poolBody.matchAll(/(?:pokemonId:\s*)?(\d+)/g)) {
      const id = +m[1]
      if (byId.has(id)) trialSpecies.add(id)
    }
    console.log(`\n### 试炼稀有池`)
    console.log(`- 解锁物种数: ${trialSpecies.size}`)
    console.log(`- 物种清单: ${[...trialSpecies].map(id => name(id)).join(', ')}`)
    
    // 检查是否有进化形态作为奖励
    const evolved = [...trialSpecies].filter(id => {
      const parent = MONSTERS.find(m => m.evolvesTo?.targetId === id || m.alternateEvolutions?.some(e => e.targetId === id))
      return parent != null
    })
    if (evolved.length > 0) {
      console.log(`- 进化形态奖励: ${evolved.map(id => name(id)).join(', ')}`)
    }
  }
  
  // 3. 训练师池分析
  const poolMatch = maps.match(new RegExp(`${region.id}:\\s*\\{[\\s\\S]*?speciesPool:\\s*\\[([^\\]]+)\\]`, 'm'))
  if (poolMatch) {
    const poolIds = [...poolMatch[1].matchAll(/(\d+)/g)].map(m => +m[1])
    console.log(`\n### 训练师/巡守池`)
    console.log(`- 物种池大小: ${poolIds.length}`)
    console.log(`- 物种清单: ${poolIds.map(id => name(id)).join(', ')}`)
  }
  
  // 4. Boss分析
  const bossMatch = maps.match(new RegExp(`${region.id}:\\s*\\{[\\s\\S]*?bossRarePokemon:\\s*\\{\\s*pokemonId:\\s*(\\d+)`, 'm'))
  if (bossMatch) {
    const bossId = +bossMatch[1]
    console.log(`\n### Boss稀有`)
    console.log(`- Boss后稀有: ${name(bossId)} (${typ(bossId)})`)
  }
  
  // 5. 等级梯度检查
  const allSpecies = new Set([...wildSpecies, ...(regionMatch ? [...regionMatch[1].matchAll(/(\d+)/g)].map(m => +m[1]).filter(id => byId.has(id)) : [])])
  const levelIssues = []
  for (const id of allSpecies) {
    const bounds = getSpeciesLevelBounds(id)
    if (bounds.max < region.minLv || bounds.min > region.maxLv) {
      levelIssues.push(`${name(id)}(合法${bounds.min}-${bounds.max})`)
    }
  }
  if (levelIssues.length > 0) {
    console.log(`\n⚠️ 等级不匹配: ${levelIssues.join(', ')}`)
  }
}

console.log('\n\n# 跨区域分析\n')

// 类型覆盖分析
console.log('## 各区域类型覆盖')
const typesByRegion = {}
for (const region of REGIONS) {
  const prefix = region.id === 'GodotMapV2' ? 'region_meadow' : 
                 region.id.includes('MistLake') ? 'region_lake' :
                 region.id.includes('FarmTown') ? 'region_farm' :
                 region.id.includes('PirateShore') ? 'region_shore' :
                 region.id.includes('Graveyard') ? 'region_grave' :
                 region.id.includes('HexRuins') ? 'region_ruin' :
                 region.id.includes('SurvivalRidge') ? 'region_ridge' :
                 'region_peak'
  
  const types = new Set()
  const matches = [...enc.matchAll(new RegExp(`${prefix}[^:]*:\\s*\\{[\\s\\S]*?pokemon:\\s*\\[([\\s\\S]*?)\\]`, 'g'))]
  for (const match of matches) {
    for (const m of match[1].matchAll(/id:\s*(\d+)/g)) {
      const id = +m[1]
      const t = typ(id).split('/')
      t.forEach(type => types.add(type))
    }
  }
  typesByRegion[region.name] = [...types]
}

for (const [rname, types] of Object.entries(typesByRegion)) {
  console.log(`- ${rname}: ${types.join(', ')}`)
}

