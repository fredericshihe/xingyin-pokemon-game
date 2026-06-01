import { MONSTERS } from '../src/utils/gameData.js'
const byId = new Map(MONSTERS.map(m => [m.id, m]))
const name = id => byId.get(id)?.name ?? `?${id}?`
// 检查所有新增(id>=89缺口 + 148+)的进化目标有效性
const newIds = [89,118,123, ...Array.from({length:41},(_,i)=>148+i)]
let bad = 0
console.log('=== 新增宝可梦进化链解析 ===')
for (const id of newIds) {
  const m = byId.get(id)
  if (!m) { console.log(`  ⚠️ id ${id} 未找到`); bad++; continue }
  if (m.evolvesTo?.targetId != null) {
    const t = byId.get(m.evolvesTo.targetId)
    if (!t) { console.log(`  ❌ ${m.name}(id${id}) 进化目标 ${m.evolvesTo.targetId} 不存在`); bad++ }
    else console.log(`  ✓ ${m.name}(id${id}) → ${t.name}(id${t.id}) Lv${m.evolvesTo.level}`)
  } else {
    console.log(`  · ${m.name}(id${id}) 最终形态`)
  }
}
console.log(bad===0 ? '\n✅ 所有新增进化目标有效' : `\n❌ ${bad}处问题`)
