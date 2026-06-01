import { MONSTERS } from '../src/utils/gameData.js'
const byDex = new Map(MONSTERS.map(m => [m.pokedexId, m]))
// 需要链接的已有进化形态：臭臭花dex44, 霸王花45, 蚊香泳士62, 白海狮87, 嘎啦嘎啦105
// 以及伊布家族等。打印这些已有形态的内部id和现有evolvesTo
const interesting = [44,45,62,87,105, 84,85, 40, 8, 130, 117, 121, 103, 112, 99, 55, 78, 38, 24, 28, 20, 22, 18, 15, 12, 31, 34, 36, 42, 47, 49, 51, 71, 73, 76, 91, 94, 101, 110, 119]
console.log('dex | 内部id | 名称 | type | evolvesTo(内部id) | 进化方式')
for (const dex of interesting) {
  const m = byDex.get(dex)
  if (!m) { console.log(`${String(dex).padStart(3)} | (游戏中不存在) `); continue }
  const evo = m.evolvesTo ? JSON.stringify(m.evolvesTo) : '—'
  console.log(`${String(dex).padStart(3)} | id:${String(m.id).padStart(3)} | ${m.name.padEnd(6)} | ${[m.type,m.type2].filter(Boolean).join('/').padEnd(14)} | ${evo}`)
}
