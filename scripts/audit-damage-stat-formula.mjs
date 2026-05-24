#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const assertCheck = (checks, name, passed, details = {}) => {
  checks.push({ name, passed, ...details })
}

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MOVES },
    { calculateBattleDamage },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/battleDamage.js'),
  ])

  const attacker = {
    id: 'attacker',
    name: '攻击方',
    level: 50,
    type: 'normal',
    maxHp: 180,
    currentHp: 180,
    atk: 100,
    def: 100,
    spAtk: 100,
    spDef: 100,
    spd: 100,
  }
  const defender = {
    id: 'defender',
    name: '防守方',
    level: 50,
    type: 'normal',
    maxHp: 180,
    currentHp: 180,
    atk: 100,
    def: 100,
    spAtk: 100,
    spDef: 100,
    spd: 100,
  }
  const options = { randomFactor: 1, applySameLevelCap: false }
  const damage = (a, d, move) => calculateBattleDamage(a, d, move, options).damage
  const physicalMove = { ...MOVES.tackle, power: 80, category: 'physical' }
  const specialMove = { ...MOVES.ember, power: 80, category: 'special', type: 'fire' }
  const checks = []

  const physicalBase = damage(attacker, defender, physicalMove)
  assertCheck(
    checks,
    'physical_uses_attack',
    damage({ ...attacker, atk: 200 }, defender, physicalMove) > physicalBase,
    { base: physicalBase, boosted: damage({ ...attacker, atk: 200 }, defender, physicalMove) }
  )
  assertCheck(
    checks,
    'physical_ignores_special_attack',
    damage({ ...attacker, spAtk: 200 }, defender, physicalMove) === physicalBase,
    { base: physicalBase, boostedSpecialAttack: damage({ ...attacker, spAtk: 200 }, defender, physicalMove) }
  )
  assertCheck(
    checks,
    'physical_uses_defense',
    damage(attacker, { ...defender, def: 200 }, physicalMove) < physicalBase,
    { base: physicalBase, boostedDefense: damage(attacker, { ...defender, def: 200 }, physicalMove) }
  )
  assertCheck(
    checks,
    'physical_ignores_special_defense',
    damage(attacker, { ...defender, spDef: 200 }, physicalMove) === physicalBase,
    { base: physicalBase, boostedSpecialDefense: damage(attacker, { ...defender, spDef: 200 }, physicalMove) }
  )

  const specialBase = damage(attacker, defender, specialMove)
  assertCheck(
    checks,
    'special_uses_special_attack',
    damage({ ...attacker, spAtk: 200 }, defender, specialMove) > specialBase,
    { base: specialBase, boostedSpecialAttack: damage({ ...attacker, spAtk: 200 }, defender, specialMove) }
  )
  assertCheck(
    checks,
    'special_ignores_attack',
    damage({ ...attacker, atk: 200 }, defender, specialMove) === specialBase,
    { base: specialBase, boostedAttack: damage({ ...attacker, atk: 200 }, defender, specialMove) }
  )
  assertCheck(
    checks,
    'special_uses_special_defense',
    damage(attacker, { ...defender, spDef: 200 }, specialMove) < specialBase,
    { base: specialBase, boostedSpecialDefense: damage(attacker, { ...defender, spDef: 200 }, specialMove) }
  )
  assertCheck(
    checks,
    'special_ignores_defense',
    damage(attacker, { ...defender, def: 200 }, specialMove) === specialBase,
    { base: specialBase, boostedDefense: damage(attacker, { ...defender, def: 200 }, specialMove) }
  )
  assertCheck(
    checks,
    'burn_halves_physical_attack_only',
    damage({ ...attacker, status: 'burn' }, defender, physicalMove) < physicalBase &&
      damage({ ...attacker, status: 'burn' }, defender, specialMove) === specialBase,
    {
      physicalBase,
      physicalBurn: damage({ ...attacker, status: 'burn' }, defender, physicalMove),
      specialBase,
      specialBurn: damage({ ...attacker, status: 'burn' }, defender, specialMove),
    }
  )
  assertCheck(
    checks,
    'stat_stages_affect_selected_stats',
    damage({ ...attacker, statStages: { atk: 2 } }, defender, physicalMove) > physicalBase &&
      damage(attacker, { ...defender, statStages: { def: 2 } }, physicalMove) < physicalBase &&
      damage({ ...attacker, statStages: { spAtk: 2 } }, defender, specialMove) > specialBase &&
      damage(attacker, { ...defender, statStages: { spDef: 2 } }, specialMove) < specialBase,
    {
      physicalBase,
      physicalAtkPlus2: damage({ ...attacker, statStages: { atk: 2 } }, defender, physicalMove),
      physicalDefPlus2: damage(attacker, { ...defender, statStages: { def: 2 } }, physicalMove),
      specialBase,
      specialAttackPlus2: damage({ ...attacker, statStages: { spAtk: 2 } }, defender, specialMove),
      specialDefensePlus2: damage(attacker, { ...defender, statStages: { spDef: 2 } }, specialMove),
    }
  )
  assertCheck(
    checks,
    'status_move_has_no_direct_damage',
    calculateBattleDamage(attacker, defender, MOVES.recover, options).damage === 0,
    { recoverDamage: calculateBattleDamage(attacker, defender, MOVES.recover, options).damage }
  )

  const failed = checks.filter((check) => !check.passed)
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      checkCount: checks.length,
      failedCount: failed.length,
      physicalMove: physicalMove.name,
      specialMove: specialMove.name,
    },
    checks,
  }

  console.log(JSON.stringify(report, null, 2))
  if (failed.length > 0) process.exitCode = 1
})
