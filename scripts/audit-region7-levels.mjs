import { MONSTERS } from '../src/utils/gameData.js'
import { getSpeciesLevelBounds } from '../src/utils/wildEncounterRules.js'

const byId = new Map(MONSTERS.map((m) => [m.id, m]))
const name = (id) => byId.get(id)?.name ?? `?${id}?`

// 区域7 铁木营地 challengeRarePool (game internal IDs) + map range 41-47, challenge levels up to ~50
const region7 = [
  { id: 23, min: 24, max: 29 }, 36, 47, 60, 61,
  { id: 92, min: 24, max: 29 }, { id: 95, min: 24, max: 29 },
  { id: 97, min: 24, max: 27 }, { id: 99, min: 24, max: 29 },
  { id: 107, min: 24, max: 25 }, { id: 111, min: 24, max: 29 },
  117, { id: 124, min: 24, max: 29 }, 125, 127,
  { id: 130, min: 24, max: 29 }, 141, { id: 133, min: 41, max: 47 },
]
const MAP_MIN = 41
const MAP_MAX = 47

console.log('=== 区域7 铁木营地 试炼池逐项分析 (地图等级 41-47) ===\n')
for (const raw of region7) {
  const id = typeof raw === 'number' ? raw : raw.id
  const declMin = typeof raw === 'number' ? null : raw.min
  const declMax = typeof raw === 'number' ? null : raw.max
  const b = getSpeciesLevelBounds(id)
  // effective spawn window = intersect(declared, speciesEvolutionBounds, mapRange)
  const lo = Math.max(declMin ?? MAP_MIN, b.min, MAP_MIN)
  const hi = Math.min(declMax ?? MAP_MAX, b.max, MAP_MAX)
  const dead = lo > hi
  const decl = declMin != null ? `声明[${declMin}-${declMax}]` : '声明[无]'
  console.log(
    `${String(id).padStart(3)} ${name(id).padEnd(7)} 进化阶段合法[${b.min}-${b.max === 100 ? '∞' : b.max}] ${decl.padEnd(12)} ` +
    `→ 实际可刷出区间[${dead ? '✗空' : `${lo}-${hi}`}] ${dead ? '⚠️永不出现' : ''}`
  )
}
