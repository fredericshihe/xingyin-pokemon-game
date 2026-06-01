import { MONSTERS } from '../src/utils/gameData.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'monsters-baseline.json'), 'utf-8'))
const cur = new Map(MONSTERS.map(m => [m.id, m]))
let errors = 0
for (const b of baseline) {
  const m = cur.get(b.id)
  if (!m) { console.log(`❌ 基线宝可梦丢失: id=${b.id} ${b.name}`); errors++; continue }
  const curDex = m.dexNo ?? m.pokedexId
  if (curDex !== b.dexNo) { console.log(`❌ id=${b.id} ${b.name} dexNo变更: ${b.dexNo} → ${curDex}`); errors++ }
  if (m.name !== b.name) { console.log(`❌ id=${b.id} 名称变更: ${b.name} → ${m.name}`); errors++ }
  if (m.type !== b.type) { console.log(`❌ id=${b.id} ${b.name} 类型变更: ${b.type} → ${m.type}`); errors++ }
}
if (errors === 0) console.log(`✅ 数据安全验证通过：${baseline.length}只现有宝可梦的 id/dexNo/name/type 全部未变`)
else { console.log(`\n⚠️ 发现 ${errors} 处变更，违反数据安全铁律！`); process.exit(1) }
