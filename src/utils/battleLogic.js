import { MOVES } from './gameData'
import { calculateCatchRate as calculateBalancedCatchRate } from './gameBalance'
import {
  calculateBattleDamage,
  getTypeEffectiveness,
  rollDamageRandomFactor
} from './battleDamage'
import { chooseBattleEnemyMove } from './battleAi'

export { getTypeEffectiveness } from './battleDamage'

/** @returns {number} 最终伤害（兼容旧 Battle.jsx 接口） */
export function calculateDamage(attacker, defender, move) {
  const { damage } = calculateBattleDamage(attacker, defender, move, {
    randomFactor: rollDamageRandomFactor()
  })
  return damage
}

// 检查命中
export function checkHit(move) {
  return Math.random() * 100 < move.accuracy
}

// 应用技能效果
export function applyMoveEffect(attacker, defender, move, damage) {
  const result = {
    damage: 0,
    heal: 0,
    status: null,
    effectiveness: 1,
    missed: false
  }

  // 检查命中
  if (!checkHit(move)) {
    result.missed = true
    return result
  }

  // 计算属性克制
  result.effectiveness = getTypeEffectiveness(move.type, defender)

  // 伤害技能
  if (move.power > 0) {
    result.damage = damage

    // 吸血效果
    if (move.effect === 'drain') {
      result.heal = Math.floor(damage * 0.5)
    }
  }

  // 治疗技能
  if (move.effect === 'heal') {
    result.heal = Math.floor(attacker.maxHp * 0.5)
  }

  // 状态技能
  if (move.status) {
    result.status = move.status
  }

  return result
}

// 判断速度优先级
export function determineOrder(playerMon, enemyMon, playerMove, enemyMove) {
  const playerPriority = playerMove.priority || 0
  const enemyPriority = enemyMove.priority || 0

  if (playerPriority > enemyPriority) return 'player'
  if (enemyPriority > playerPriority) return 'enemy'

  // 相同优先级比速度
  if (playerMon.spd > enemyMon.spd) return 'player'
  if (enemyMon.spd > playerMon.spd) return 'enemy'

  // 速度相同随机
  return Math.random() < 0.5 ? 'player' : 'enemy'
}

// AI选择技能：兼容旧 Battle.jsx 的 hp/mp 字段，同时复用主战斗入口的智能选招。
export function aiSelectMove(enemyMon, targetMon = null, options = {}) {
  const strategicMove = targetMon
    ? chooseBattleEnemyMove({
      enemyMon,
      targetMon,
      battleKind: options.battleKind || 'wild',
      trainerRole: options.trainerRole || 'normal'
    })
    : null
  if (strategicMove) return strategicMove

  const availableMoves = enemyMon.moves.filter(moveId => {
    const move = MOVES[moveId]
    const currentMp = enemyMon.currentMp ?? enemyMon.mp ?? enemyMon.maxMp ?? 0
    return currentMp >= move.cost
  })

  if (availableMoves.length === 0) {
    // 没有MP了，使用第一个0消耗技能
    return enemyMon.moves.find(moveId => MOVES[moveId].cost === 0) || enemyMon.moves[0]
  }

  // 简单AI：随机选择可用技能
  return availableMoves[Math.floor(Math.random() * availableMoves.length)]
}

// 检查战斗是否结束
export function checkBattleEnd(playerMon, enemyMon) {
  if (playerMon.hp <= 0) return 'lose'
  if (enemyMon.hp <= 0) return 'win'
  return null
}

// 计算捕获率
export function calculateCatchRate(enemyMon, ballMultiplier, playerAverageLevel = 5) {
  return calculateBalancedCatchRate({
    target: {
      ...enemyMon,
      currentHp: enemyMon.currentHp ?? enemyMon.hp,
      currentMp: enemyMon.currentMp ?? enemyMon.mp
    },
    ballMultiplier,
    playerAverageLevel
  }) / 100
}

// 尝试捕获
export function attemptCatch(enemyMon, ballMultiplier, playerAverageLevel = 5) {
  const catchRate = calculateCatchRate(enemyMon, ballMultiplier, playerAverageLevel)
  return Math.random() < catchRate
}
