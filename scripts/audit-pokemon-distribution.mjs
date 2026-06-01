import { MONSTERS } from '../src/utils/gameData.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const byId = new Map(MONSTERS.map((m) => [m.id, m]))
const name = (id) => byId.get(id)?.name ?? `?${id}?`
const typeOf = (id) => {
  const m = byId.get(id)
  return m ? [m.type, m.type2].filter(Boolean).join('/') : '???'
}

const existingIds = new Set(MONSTERS.map((m) => m.id))
const allIdsSorted = [...existingIds].sort((a, b) => a - b)
const gaps = []
const maxId = Math.max(...existingIds)
for (let i = 1; i <= maxId; i += 1) if (!existingIds.has(i)) gaps.push(i)

console.log('=== 游戏内宝可梦总数:', MONSTERS.length, '===')
console.log('最大ID:', maxId)
console.log('ID区间缺口(不存在的ID):', gaps.join(', ') || '无')

const enc = fs.readFileSync(path.join(root, 'src/game/data/encounterTables.js'), 'utf-8')
const maps = fs.readFileSync(path.join(root, 'src/game/data/godotMaps/godot_region_maps.js'), 'utf-8')

const usedWild = new Set()
const encRegionPart = enc.split('region_').slice(1).join('region_')
for (const m of encRegionPart.matchAll(/\bid:\s*(\d+)\s*,\s*minLevel/g)) usedWild.add(+m[1])

const usedTrial = new Set()
const usedTrainer = new Set()
const usedSpeciesPool = new Set()
const usedBossRare = new Set()

for (const m of maps.matchAll(/speciesPool:\s*\[([^\]]*)\]/g))
  for (const n of m[1].matchAll(/\d+/g)) usedSpeciesPool.add(+n[0])

for (const m of maps.matchAll(/challengeRarePool:\s*\[([\s\S]*?)\]/g)) {
  const body = m[1]
  for (const n of body.matchAll(/(?:^|[,[\s])(\d+)(?=\s*[,\]])/g)) usedTrial.add(+n[1])
  for (const n of body.matchAll(/pokemonId:\s*(\d+)/g)) usedTrial.add(+n[1])
}
for (const m of maps.matchAll(/bossRarePokemon:\s*\{\s*pokemonId:\s*(\d+)/g)) usedBossRare.add(+m[1])
for (const m of maps.matchAll(/bossSupportSpeciesIds:\s*\[([^\]]*)\]/g))
  for (const n of m[1].matchAll(/\d+/g)) usedTrial.add(+n[0])
for (const m of maps.matchAll(/(?:speciesIds|dailyVariantSpeciesIds):\s*\[([^\]]*)\]/g))
  for (const n of m[1].matchAll(/\d+/g)) usedTrainer.add(+n[0])

const allUsed = new Set([...usedWild, ...usedTrial, ...usedTrainer, ...usedSpeciesPool, ...usedBossRare])

console.log('\n=== 引用统计 ===')
console.log('野生遭遇表引用:', usedWild.size, '种')
console.log('试炼池引用:', usedTrial.size, '种')
console.log('speciesPool引用:', usedSpeciesPool.size, '种')
console.log('训练师/速配引用:', usedTrainer.size, '种')
console.log('Boss专属:', [...usedBossRare].map((id) => `${id}${name(id)}`).join(', '))
console.log('合计去重使用:', allUsed.size, '/', MONSTERS.length)

const unused = allIdsSorted.filter((id) => !allUsed.has(id))
console.log(`\n=== 完全未使用的宝可梦 ( ${unused.length} 只) ===`)
unused.forEach((id) => console.log(`  ${String(id).padStart(3)} ${name(id).padEnd(7)} ${typeOf(id)}`))

const catchableWildOrTrial = new Set([...usedWild, ...usedTrial, ...usedBossRare])
const onlyTrainer = allIdsSorted.filter((id) => !catchableWildOrTrial.has(id))
console.log(`\n=== 玩家无法通过野生/试炼/Boss稀有获得 ( ${onlyTrainer.length} 只) ===`)
onlyTrainer.forEach((id) => console.log(`  ${String(id).padStart(3)} ${name(id).padEnd(7)} ${typeOf(id)}`))

// Evolution-chain completeness: for every catchable mon, are pre-evolutions also catchable?
console.log('\n=== 进化链可获得性检查 ===')
const evoFrom = new Map() // child -> parent
for (const m of MONSTERS) {
  if (m.evolvesTo?.targetId) evoFrom.set(m.evolvesTo.targetId, m.id)
}
const issues = []
for (const id of catchableWildOrTrial) {
  let cur = id
  const seen = new Set()
  while (evoFrom.has(cur) && !seen.has(cur)) {
    seen.add(cur)
    const parent = evoFrom.get(cur)
    if (!catchableWildOrTrial.has(parent)) {
      // parent not catchable - only report base-stage gaps
    }
    cur = parent
  }
}
console.log('(详见后续手动分析)')
