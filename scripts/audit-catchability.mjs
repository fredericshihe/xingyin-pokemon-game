import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'
import { getEvolutionLevelForBranch } from '../src/utils/pokemonGrowth.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const byId = new Map(MONSTERS.map((m) => [m.id, m]))
const name = (id) => byId.get(id)?.name ?? `?${id}?`
const typeOf = (id) => { const m = byId.get(id); return m ? [m.type, m.type2].filter(Boolean).join('/') : '???' }

const enc = fs.readFileSync(path.join(root, 'src/game/data/encounterTables.js'), 'utf-8')
const maps = fs.readFileSync(path.join(root, 'src/game/data/godotMaps/godot_region_maps.js'), 'utf-8')

// Wild = encounterTables region_ entries (these are what the player actually catches in grass)
const wild = new Set()
const encRegion = enc.split('region_').slice(1).join('region_')
for (const m of encRegion.matchAll(/\bid:\s*(\d+)\s*,\s*minLevel/g)) wild.add(+m[1])

// Boss rare (catchable post-boss in grass)
const bossRare = new Set()
for (const m of maps.matchAll(/bossRarePokemon:\s*\{\s*pokemonId:\s*(\d+)/g)) bossRare.add(+m[1])

// Trial rares: parse each region's challengeRarePool, intersect declared+evo+? — but map range needed.
// We'll just collect trial species IDs (catchable as wild rare IF level window non-empty).
const REGION_RANGES = {
  GodotMapV2: [5, 12], GodotMapV2_MistLake: [11, 18], GodotMapV2_FarmTown: [17, 24],
  GodotMapV2_PirateShore: [23, 30], GodotMapV2_Graveyard: [29, 36], GodotMapV2_HexRuins: [35, 42],
  GodotMapV2_SurvivalRidge: [41, 47], GodotMapV2_BossHighland: [52, 60],
}

// crude: find each "<MapId>: {" profile block, then its challengeRarePool
const trialCatchable = new Set()
const trialDeadWindow = [] // {id, region, decl}
for (const [mapId, [mn, mx]] of Object.entries(REGION_RANGES)) {
  const re = new RegExp(`${mapId}:\\s*\\{`)
  const start = maps.search(re)
  if (start < 0) continue
  const slice = maps.slice(start, start + 2000)
  const poolM = slice.match(/challengeRarePool:\s*\[([\s\S]*?)\]/)
  if (!poolM) continue
  const body = poolM[1]
  // objects with explicit levels
  const objs = [...body.matchAll(/\{\s*pokemonId:\s*(\d+)[^}]*?\}/g)].map((o) => {
    const id = +o[1]
    const lo = o[0].match(/minLevel:\s*(\d+)/)
    const hi = o[0].match(/maxLevel:\s*(\d+)/)
    return { id, min: lo ? +lo[1] : null, max: hi ? +hi[1] : null }
  })
  const objIds = new Set(objs.map((o) => o.id))
  const plain = [...body.matchAll(/(?:^|[,[\s])(\d+)(?=\s*[,\]])/g)].map((p) => +p[1]).filter((id) => !objIds.has(id))
  const entries = [...objs, ...plain.map((id) => ({ id, min: null, max: null }))]
  for (const e of entries) {
    const b = getSpeciesLevelBounds(e.id)
    const lo = Math.max(e.min ?? mn, b.min, mn)
    const hi = Math.min(e.max ?? mx, b.max, mx)
    if (lo > hi) trialDeadWindow.push({ id: e.id, region: mapId, decl: e.min != null ? `${e.min}-${e.max}` : '无', evo: `${b.min}-${b.max === 100 ? '∞' : b.max}`, map: `${mn}-${mx}` })
    else trialCatchable.add(e.id)
  }
}

const catchable = new Set([...wild, ...bossRare, ...trialCatchable])
const allIds = MONSTERS.map((m) => m.id).sort((a, b) => a - b)
const notCatchable = allIds.filter((id) => !catchable.has(id))

console.log('=== 玩家可获得性（野生草丛 / Boss稀有 / 试炼稀有解锁，刷出窗口非空）===')
console.log('可获得:', catchable.size, '/', MONSTERS.length)
console.log(`\n=== 无法获得的宝可梦 (${notCatchable.length} 只) ===`)
notCatchable.forEach((id) => console.log(`  ${String(id).padStart(3)} ${name(id).padEnd(7)} ${typeOf(id)}`))

console.log(`\n=== 试炼池中"刷出窗口为空"的条目 (${trialDeadWindow.length} 条) — 声明等级与地图/进化阶段冲突，永远刷不出 ===`)
for (const d of trialDeadWindow)
  console.log(`  ${d.region.replace('GodotMapV2_', '').replace('GodotMapV2', 'Meadow').padEnd(14)} ${String(d.id).padStart(3)} ${name(d.id).padEnd(7)} 声明[${d.decl}] 进化合法[${d.evo}] 地图[${d.map}]`)

// Evolution chain catchability gaps: a catchable evolved form whose pre-evo is NOT catchable
const evoParent = new Map()
for (const m of MONSTERS) {
  const evos = [m.evolvesTo, ...(m.alternateEvolutions || [])].filter(Boolean)
  for (const e of evos) if (e.targetId) evoParent.set(e.targetId, m.id)
}
console.log('\n=== 进化链断层：可获得的进化形态，但其前置形态无法获得 ===')
let gapCount = 0
for (const id of catchable) {
  const parent = evoParent.get(id)
  if (parent != null && !catchable.has(parent)) {
    gapCount += 1
    console.log(`  ${String(id).padStart(3)} ${name(id).padEnd(7)} ← 前置 ${String(parent).padStart(3)} ${name(parent)} (不可获得)`)
  }
}
if (gapCount === 0) console.log('  无')
