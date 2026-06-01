import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
const byId = new Map(MONSTERS.map(m=>[m.id,m]))
const name = id => byId.get(id)?.name ?? `?${id}?`
const typ = id => { const m=byId.get(id); return m?[m.type,m.type2].filter(Boolean).join('/'):'?' }

// 8区域等级
const REGIONS = [
  ['星音草径',5,12],['雾湖苇岸',11,18],['风车农庄',17,24],['贝壳海岸',23,30],
  ['月影墓园',29,36],['六角遗迹',35,42],['铁木营地',41,47],['星雾高地',52,60]
]

// 列出所有新增+所有"无法捕捉"宝可梦, 标注其进化阶段合法等级, 推荐落点区域
const newIds = [89,118,123, ...Array.from({length:41},(_,i)=>148+i)]
console.log('=== 新增44只: 进化阶段合法等级 → 推荐落点区域 ===')
for (const id of newIds) {
  const m = byId.get(id); const b = getSpeciesLevelBounds(id)
  // 找到合法等级覆盖的区域
  const fitRegions = REGIONS.filter(([,mn,mx]) => !(b.max < mn || b.min > mx)).map(r=>r[0])
  const base = !MONSTERS.some(x => (x.evolvesTo?.targetId===id)) // 是否基础形态
  console.log(`id${String(id).padStart(3)} ${name(id).padEnd(6)} ${typ(id).padEnd(14)} 合法Lv[${b.min}-${b.max===100?'∞':b.max}] ${base?'[基础]':'[进化]'} 可落: ${fitRegions.join('/')}`)
}
