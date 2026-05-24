import { MONSTERS, MOVES } from '../src/utils/gameData.js'
import { calculateBattleDamage } from '../src/utils/battleDamage.js'

const inst = (base, level) => ({
  ...base,
  level,
  maxHp: Math.floor(2 * base.maxHp * level / 100 + level + 10),
  atk: Math.floor(2 * base.atk * level / 100 + 5),
  def: Math.floor(2 * base.def * level / 100 + 5),
  spAtk: Math.floor(2 * base.spAtk * level / 100 + 5),
  spDef: Math.floor(2 * base.spDef * level / 100 + 5)
})

const byName = (name) => MONSTERS.find((m) => m.name === name)
const samples = [
  ['小火龙', '妙蛙种子', 'flamethrower', 20],
  ['鲤鱼王', '刺甲贝', 'tackle', 20],
  ['暴鲤龙', '小火龙', 'surf', 20],
  ['超梦', '吉利蛋', 'psychic', 50],
  ['怪力', '吉利蛋', 'low_kick', 50]
]

for (const [atkName, defName, moveKey, level] of samples) {
  const a = inst(byName(atkName), level)
  const d = inst(byName(defName), level)
  const move = MOVES[moveKey]
  const { damage, effectiveness, capped } = calculateBattleDamage(a, d, move, { randomFactor: 0.925 })
  const turns = damage > 0 ? Math.ceil(d.maxHp / damage) : '∞'
  console.log(`${level}级 ${atkName} → ${defName} [${move.name}] 伤害=${damage}/${d.maxHp} 克制×${effectiveness} 约${turns}回合${capped ? ' (已限伤)' : ''}`)
}
