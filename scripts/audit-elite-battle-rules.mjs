#!/usr/bin/env node

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TYPES, TYPE_NAMES_CN, getEffectiveness } from '../src/utils/constants.js'
import { MONSTERS, MOVES, getBalancedMovesForLevel } from '../src/utils/gameData.js'
import { GODOT_REGION_MAPS } from '../src/game/data/godotMaps/godot_region_maps.js'

const ELITE_MAP_IDS = [
  'GodotMapV2_FrostDojo',
  'GodotMapV2_TideDojo',
  'GodotMapV2_IronDojo',
  'GodotMapV2_DragonDojo'
]

const FEATURE_HOOKS = {
  openingEnemyStatStages: [
    'rule.openingEnemyStatStages',
    'applySpecialBattleOpeningToSnapshot({'
  ],
  openingPlayerStatStages: [
    'rule.openingPlayerStatStages',
    'applySpecialBattleOpeningToSnapshot({'
  ],
  enemyPhysicalDamageTakenMultiplierTurns: [
    'rule.enemyPhysicalDamageTakenMultiplierTurns',
    'getSpecialBattleDamageMultiplier({'
  ],
  enemyDamageTakenMultiplier: [
    'rule.enemyDamageTakenMultiplier',
    'getSpecialBattleDamageMultiplier({'
  ],
  enemyTurnIntervalHeal: [
    'rule.enemyTurnIntervalHeal',
    'resolveSpecialBattleEnemyTurnAfterAction({'
  ],
  playerSwitchEnemyDamageMultiplier: [
    'rule.playerSwitchEnemyDamageMultiplier',
    'applySpecialBattlePlayerSwitchPressure({'
  ],
  enemyDamageBoostOnCriticalTaken: [
    'rule.enemyDamageBoostOnCriticalTaken',
    'consumeSpecialBattleEnemyDamageBoosts('
  ],
  enemyMoveTypeHitPlayerStatStage: [
    'rule.enemyMoveTypeHitPlayerStatStage',
    'const typeHitStageRule = specialBattleRule?.enemyMoveTypeHitPlayerStatStage'
  ],
  enemyHealOnPlayerFaint: [
    'rule.enemyHealOnPlayerFaint',
    'applySpecialBattlePlayerFaintBenefitToSnapshot('
  ],
  enemySpeedBoostOnPlayerFaint: [
    'rule.enemySpeedBoostOnPlayerFaint',
    'applySpecialBattlePlayerFaintBenefitToSnapshot('
  ],
  enemyDamageMultiplierAfterTurn: [
    'rule.enemyDamageMultiplierAfterTurn',
    'getSpecialBattleDamageMultiplier({'
  ],
  enemyDamageMultiplierAgainstLowHp: [
    'rule.enemyDamageMultiplierAgainstLowHp',
    'getSpecialBattleDamageMultiplier({'
  ]
}

const REQUIRED_RUNTIME_HOOKS = [
  'specialBattleRule: battleEventProps.specialBattleRule || null',
  "const specialBattleRule = battleKind === 'trainer'",
  'specialBattleRuleState',
  'applySpecialBattleOpeningToSnapshot({',
  'getSpecialBattleDamageMultiplier({',
  'resolveSpecialBattleEnemyTurnAfterAction({',
  'applySpecialBattlePlayerFaintBenefitToSnapshot(',
  'applySpecialBattlePlayerSwitchPressure({'
]

const originalGamePath = fileURLToPath(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url))
const originalGameSource = fs.readFileSync(originalGamePath, 'utf8')
const monstersById = new Map(
  Object.values(MONSTERS).map((monster) => [Number(monster.id), monster])
)
const attackTypes = Object.values(TYPES)
const failures = []
const configuredFeatures = new Set()
const ruleIds = new Set()
const report = []
let encounterCount = 0

const getMonsterEffectiveness = (attackType, monster) => (
  [monster?.type, monster?.type2]
    .filter(Boolean)
    .reduce((total, defenderType) => total * getEffectiveness(attackType, defenderType), 1)
)

for (const snippet of REQUIRED_RUNTIME_HOOKS) {
  if (!originalGameSource.includes(snippet)) {
    failures.push(`战斗运行时缺少专属规则链路: ${snippet}`)
  }
}

for (const mapId of ELITE_MAP_IDS) {
  const mapInfo = GODOT_REGION_MAPS[mapId]
  if (!mapInfo) {
    failures.push(`${mapId}: 地图不存在。`)
    continue
  }

  const encounters = (mapInfo.runtimeEvents || []).filter((event) => (
    event?.type === 'boss' || event?.properties?.role === 'lieutenant'
  ))
  const lieutenantCount = encounters.filter((event) => event?.properties?.role === 'lieutenant').length
  const bossCount = encounters.filter((event) => event?.properties?.role === 'boss').length
  if (lieutenantCount !== 3 || bossCount !== 1) {
    failures.push(`${mapInfo.displayName}: 应有 3 名部下和 1 名天王，实际为 ${lieutenantCount} / ${bossCount}。`)
  }

  for (const event of encounters) {
    encounterCount += 1
    const properties = event.properties || {}
    const rule = properties.specialBattleRule
    const team = Array.isArray(properties.team) ? properties.team : []
    const label = `${mapInfo.displayName} · ${properties.name || event.id}`

    if (!rule?.id || !rule?.name || !rule?.description) {
      failures.push(`${label}: 缺少完整 specialBattleRule。`)
    } else if (ruleIds.has(rule.id)) {
      failures.push(`${label}: 专属规则 ID 重复: ${rule.id}。`)
    } else {
      ruleIds.add(rule.id)
    }

    for (const key of Object.keys(rule || {})) {
      if (!['id', 'name', 'description'].includes(key)) configuredFeatures.add(key)
    }

    const expectedMinSize = properties.role === 'boss' ? 5 : 3
    if (team.length < expectedMinSize) {
      failures.push(`${label}: 队伍数量 ${team.length}，低于要求 ${expectedMinSize}。`)
    }

    const duplicateIds = team
      .map((member) => Number(member?.pokemonId))
      .filter((pokemonId, index, ids) => ids.indexOf(pokemonId) !== index)
    if (duplicateIds.length > 0) {
      failures.push(`${label}: 队内存在重复宝可梦 ID ${[...new Set(duplicateIds)].join(', ')}。`)
    }

    const resolvedTeam = team.map((member) => {
      const pokemonId = Number(member?.pokemonId)
      const monster = monstersById.get(pokemonId)
      if (!monster) failures.push(`${label}: 找不到宝可梦 ID ${member?.pokemonId}。`)
      if (!Number.isFinite(Number(member?.level)) || Number(member.level) < 1 || Number(member.level) > 100) {
        failures.push(`${label}: 宝可梦 ID ${member?.pokemonId} 等级无效: ${member?.level}。`)
      }
      return monster
    }).filter(Boolean)

    if (resolvedTeam.length === 0) continue

    const damagingMoveTypes = new Set()
    resolvedTeam.forEach((monster, index) => {
      const level = Number(team[index]?.level) || 1
      const moveKeys = getBalancedMovesForLevel(monster, level)
      const damagingMoves = moveKeys
        .map((moveKey) => MOVES[moveKey])
        .filter((move) => move && move.category !== 'status' && Number(move.power) > 0)
      if (damagingMoves.length === 0) {
        failures.push(`${label}: ${monster.name} 在 Lv.${level} 没有可用伤害招式。`)
      }
      damagingMoves.forEach((move) => damagingMoveTypes.add(move.type))
    })

    for (const typedTrigger of [
      rule?.enemyMoveTypeHitPlayerStatStage,
      rule?.enemyDamageMultiplierAgainstLowHp
    ]) {
      const requiredMoveTypes = Array.isArray(typedTrigger?.moveTypes) ? typedTrigger.moveTypes : []
      if (requiredMoveTypes.length > 0 && !requiredMoveTypes.some((moveType) => damagingMoveTypes.has(moveType))) {
        failures.push(
          `${label}: 规则要求 ${requiredMoveTypes.map((moveType) => TYPE_NAMES_CN[moveType] || moveType).join('、')} 招式，实际配招无法触发。`
        )
      }
    }

    const weaknessCoverage = attackTypes.map((attackType) => {
      const effectiveness = resolvedTeam.map((monster) => getMonsterEffectiveness(attackType, monster))
      return {
        attackType,
        effectiveness,
        weakCount: effectiveness.filter((value) => value > 1).length
      }
    })
    const fullTeamWeaknesses = weaknessCoverage.filter((entry) => entry.weakCount === resolvedTeam.length)
    if (fullTeamWeaknesses.length > 0) {
      failures.push(
        `${label}: 单一属性可克制整队: ${fullTeamWeaknesses.map((entry) => TYPE_NAMES_CN[entry.attackType]).join('、')}。`
      )
    }

    const maximumCoverage = weaknessCoverage.reduce((best, entry) => (
      !best || entry.weakCount > best.weakCount ? entry : best
    ), null)
    if (properties.role === 'boss' && maximumCoverage?.weakCount > resolvedTeam.length - 2) {
      failures.push(
        `${label}: 天王队针对 ${TYPE_NAMES_CN[maximumCoverage.attackType]} 仅有 1 个非弱点位，需要至少 2 个。`
      )
    }

    report.push({
      map: mapInfo.displayName,
      encounter: properties.name || event.id,
      role: properties.role,
      rule: rule?.name || '缺失',
      team: resolvedTeam.map((monster) => monster.name),
      maximumSingleTypeCoverage: maximumCoverage
        ? `${TYPE_NAMES_CN[maximumCoverage.attackType]} ${maximumCoverage.weakCount}/${resolvedTeam.length}`
        : '无'
    })
  }
}

for (const [feature, snippets] of Object.entries(FEATURE_HOOKS)) {
  if (!configuredFeatures.has(feature)) {
    failures.push(`四天王配置未覆盖专属机制字段: ${feature}。`)
    continue
  }
  for (const snippet of snippets) {
    if (!originalGameSource.includes(snippet)) {
      failures.push(`专属机制 ${feature} 缺少运行时消费点: ${snippet}`)
    }
  }
}

if (encounterCount !== 16) {
  failures.push(`终局战斗总数应为 16，实际为 ${encounterCount}。`)
}

if (failures.length > 0) {
  console.error('[audit-elite-battle-rules] FAILED')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(JSON.stringify({
  summary: {
    maps: ELITE_MAP_IDS.length,
    encounters: encounterCount,
    configuredRuleFeatures: configuredFeatures.size,
    fullTeamSingleTypeWeaknesses: 0
  },
  encounters: report
}, null, 2))
console.log('[audit-elite-battle-rules] OK: all Elite Four rules are wired and no roster is fully weak to one attack type.')
