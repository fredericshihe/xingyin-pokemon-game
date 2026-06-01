import { MONSTERS, getBalancedMovesForLevel } from '../src/utils/gameData.js'
const byId = new Map(MONSTERS.map(m=>[m.id,m]))
const newIds = [89,118,123, ...Array.from({length:41},(_,i)=>148+i)]
let issues = 0
for (const id of newIds) {
  const m = byId.get(id)
  // 种族值合理性
  const stats = [m.maxHp,m.atk,m.def,m.spAtk,m.spDef,m.spd]
  if (stats.some(s => !Number.isFinite(s) || s<=0)) { console.log(`❌ ${m.name} 种族值异常`); issues++ }
  // 技能解析(模拟战斗用)
  try {
    const mv = getBalancedMovesForLevel(m, Math.max(5, m.evolvesTo?.level ?? 30))
    if (!mv || mv.length===0) { console.log(`❌ ${m.name} 无可用技能`); issues++ }
  } catch(e){ console.log(`❌ ${m.name} 技能解析报错: ${e.message}`); issues++ }
}
console.log(issues===0 ? `✅ 44只新宝可梦种族值+技能运行时校验通过` : `❌ ${issues}处问题`)
