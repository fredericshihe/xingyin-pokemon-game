import { MONSTERS } from '../src/utils/gameData.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = MONSTERS.map(m => ({ id: m.id, dexNo: m.dexNo ?? m.pokedexId, name: m.name, type: m.type, type2: m.type2 ?? null, evolvesTo: m.evolvesTo?.targetId ?? null }))
  .sort((a,b)=>a.id-b.id)
const file = path.resolve(__dirname, 'monsters-baseline.json')
fs.writeFileSync(file, JSON.stringify(out, null, 2))
console.log('基线快照已写入:', file, '| 条目:', out.length)
