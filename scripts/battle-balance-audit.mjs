#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const createInstance = (base, level, getBalancedMovesForLevel) => ({
  id: base.id,
  name: base.name,
  type: base.type,
  type2: base.type2,
  level,
  moves: getBalancedMovesForLevel(base, level),
  maxHp: Math.floor(2 * (base.maxHp || 0) * level / 100 + level + 10),
  atk: Math.floor(2 * (base.atk || 0) * level / 100 + 5),
  def: Math.floor(2 * (base.def || 0) * level / 100 + 5),
  spAtk: Math.floor(2 * (base.spAtk || 0) * level / 100 + 5),
  spDef: Math.floor(2 * (base.spDef || 0) * level / 100 + 5),
})

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MONSTERS, MOVES, getBalancedMovesForLevel },
    { calculateBattleDamage },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/battleDamage.js'),
  ])

  const calcDamage = (attacker, defender, move, randomFactor = 1) =>
    calculateBattleDamage(attacker, defender, move, { randomFactor, applySameLevelCap: true })

  const levels = [5, 10, 20, 30, 50]
  const ohko = []
  const zeroNonImmune = []
  const chip = []

  for (const level of levels) {
    const pool = MONSTERS.map((monster) => createInstance(monster, level, getBalancedMovesForLevel))
    for (const attacker of pool) {
      for (const moveKey of attacker.moves) {
        const move = MOVES[moveKey]
        if (!move?.power) continue
        for (const defender of pool) {
          if (attacker.id === defender.id) continue
          const max = calcDamage(attacker, defender, move, 1)
          const min = calcDamage(attacker, defender, move, 0.85)
          if (max.effectiveness > 0 && max.damage === 0) {
            zeroNonImmune.push({ level, atk: attacker.name, def: defender.name, move: move.name, eff: max.effectiveness })
          }
          if (max.damage >= defender.maxHp) {
            ohko.push({ level, atk: attacker.name, def: defender.name, move: move.name, dmg: max.damage, hp: defender.maxHp, eff: max.effectiveness })
          }
          if (min.damage > 0 && min.damage <= 1 && max.effectiveness >= 1) {
            chip.push({ level, atk: attacker.name, def: defender.name, move: move.name, minDmg: min.damage, hp: defender.maxHp, defStat: move.category === 'physical' ? defender.def : defender.spDef })
          }
        }
      }
    }
  }

  const sameLevelOneTurn = []
  for (const level of [10, 20, 30]) {
    const pool = MONSTERS.map((monster) => createInstance(monster, level, getBalancedMovesForLevel))
    for (const attacker of pool) {
      for (const defender of pool) {
        if (attacker.id === defender.id) continue
        for (const moveKey of attacker.moves) {
          const move = MOVES[moveKey]
          if (!move?.power) continue
          const avg = calcDamage(attacker, defender, move, 0.925)
          if (avg.effectiveness <= 0) continue
          if (avg.damage >= defender.maxHp) {
            sameLevelOneTurn.push({ level, atk: attacker.name, def: defender.name, move: move.name, dmg: avg.damage, hp: defender.maxHp, eff: avg.effectiveness })
          }
        }
      }
    }
  }

  const byLevel = {}
  for (const level of levels) {
    const levelOhko = ohko.filter((entry) => entry.level === level)
    const neutral = levelOhko.filter((entry) => entry.eff === 1)
    const double = levelOhko.filter((entry) => entry.eff === 2)
    const levelChip = chip.filter((entry) => entry.level === level)
    byLevel[level] = {
      ohko: levelOhko.length,
      neutralOhko: neutral.length,
      doubleOhko: double.length,
      chip: levelChip.length,
      neutralSample: neutral.slice(0, 8),
      chipSample: levelChip.slice(0, 8),
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    monsterCount: MONSTERS.length,
    moveCount: Object.keys(MOVES).length,
    zeroNonImmuneCount: zeroNonImmune.length,
    byLevel,
    ohkoSample: ohko.sort((a, b) => b.dmg - a.dmg).slice(0, 15),
    sameLevelOneTurnCount: sameLevelOneTurn.length,
    sameLevelOneTurnByLevel: [10, 20, 30].map((level) => ({
      level,
      count: sameLevelOneTurn.filter((entry) => entry.level === level).length,
      neutral: sameLevelOneTurn.filter((entry) => entry.level === level && entry.eff === 1).slice(0, 10),
      double: sameLevelOneTurn.filter((entry) => entry.level === level && entry.eff === 2).slice(0, 10),
    })),
  }, null, 2))
})
