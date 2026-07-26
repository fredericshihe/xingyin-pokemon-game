#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const {
    HIGH_RISK_BATTLE_START_MAP_ID,
    getBattleEnergyCost,
    getDefeatGoldPenalty,
    getHighRiskBattleTier,
  } = await loadModule('/src/utils/gameBalance.js')
  const { getMapConfig } = await loadModule('/src/data/maps/mapConfig.js')
  const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')
  const gameSource = read('src/components/Game/OriginalGame.jsx')
  const cssSource = `${read('src/game.css')}\n${read('src/shell.css')}`

  const maps = [
    { mapName: 'GodotMapV2_HexRuins', mapLevel: 39, expectedTier: 0 },
    { mapName: 'GodotMapV2_SurvivalRidge', mapLevel: 45, expectedTier: 1 },
    { mapName: 'GodotMapV2_BossHighland', mapLevel: 56, expectedTier: 2 },
    { mapName: 'GodotMapV2_FrostDojo', mapLevel: 70, expectedTier: 3 },
    { mapName: 'GodotMapV2_IronDojo', mapLevel: 82, expectedTier: 4 },
    { mapName: 'GodotMapV2_ChampionTower', mapLevel: 95, expectedTier: 5 },
  ].map((entry) => ({
    ...entry,
    actualTier: getHighRiskBattleTier(entry),
    wildEnergy: getBattleEnergyCost({ ...entry, battleKind: 'wild' }),
    trainerEnergy: getBattleEnergyCost({ ...entry, battleKind: 'trainer', eventRole: 'normal' }),
    challengeEnergy: getBattleEnergyCost({ ...entry, battleKind: 'trainer', eventType: 'challenge', eventRole: 'challenge' }),
    wildPenalty: getDefeatGoldPenalty({ ...entry, battleKind: 'wild' }),
    trainerPenalty: getDefeatGoldPenalty({ ...entry, battleKind: 'trainer', eventRole: 'normal' }),
    challengePenalty: getDefeatGoldPenalty({ ...entry, battleKind: 'trainer', eventType: 'challenge', eventRole: 'challenge' }),
  }))
  const preRisk = maps[0]
  const ridge = maps[1]
  const isNonDecreasing = (key) => maps.slice(1).every((entry, index, entries) => (
    index === 0 || entry[key] >= entries[index - 1][key]
  ))

  const checks = [
    {
      name: 'high_risk_boundary_is_survival_ridge',
      passed: HIGH_RISK_BATTLE_START_MAP_ID === 'GodotMapV2_SurvivalRidge'
        && getMapConfig(HIGH_RISK_BATTLE_START_MAP_ID).displayName === '铁木营地',
      actual: `${HIGH_RISK_BATTLE_START_MAP_ID}:${getMapConfig(HIGH_RISK_BATTLE_START_MAP_ID).displayName}`,
    },
    {
      name: 'all_late_maps_have_expected_risk_tiers',
      passed: maps.every((entry) => entry.actualTier === entry.expectedTier),
      actual: maps.map(({ mapName, actualTier }) => ({ mapName, actualTier })),
    },
    {
      name: 'all_battles_always_cost_one_energy',
      passed: maps.every((entry) => (
        entry.wildEnergy === 1
        && entry.trainerEnergy === 1
        && entry.challengeEnergy === 1
      )),
      actual: maps.map(({ mapName, wildEnergy, trainerEnergy, challengeEnergy }) => ({
        mapName,
        wildEnergy,
        trainerEnergy,
        challengeEnergy,
      })),
      expected: 1,
    },
    {
      name: 'ridge_defeat_penalties_jump_above_pre_ridge',
      passed: ridge.wildPenalty > preRisk.wildPenalty
        && ridge.trainerPenalty > preRisk.trainerPenalty
        && ridge.challengePenalty > ridge.trainerPenalty,
      actual: {
        preRidge: { wild: preRisk.wildPenalty, trainer: preRisk.trainerPenalty },
        ridge: { wild: ridge.wildPenalty, trainer: ridge.trainerPenalty, challenge: ridge.challengePenalty },
      },
    },
    {
      name: 'late_game_defeat_penalties_never_decrease',
      passed: isNonDecreasing('wildPenalty')
        && isNonDecreasing('trainerPenalty')
        && isNonDecreasing('challengePenalty'),
      actual: maps.slice(1).map(({ mapName, wildPenalty, trainerPenalty, challengePenalty }) => ({
        mapName,
        wildPenalty,
        trainerPenalty,
        challengePenalty,
      })),
    },
    {
      name: 'late_game_penalties_stay_inside_safety_caps',
      passed: maps.every((entry) => entry.wildPenalty <= 70 && entry.trainerPenalty <= 120 && entry.challengePenalty <= 120),
      actual: { maxWild: Math.max(...maps.map((entry) => entry.wildPenalty)), maxTrainer: Math.max(...maps.map((entry) => entry.challengePenalty)) },
    },
    {
      name: 'wild_and_trainer_entry_paths_use_shared_one_energy_rule',
      passed: /getBattleEnergyCost\(\{[\s\S]*?battleKind:\s*'wild',[\s\S]*?mapName:\s*currentMapName,[\s\S]*?mapLevel/.test(gameSource)
        && /getBattleEnergyCost\(\{[\s\S]*?battleKind:\s*'trainer',[\s\S]*?mapName:\s*currentMapName,[\s\S]*?eventType:\s*battleEventType,[\s\S]*?eventRole:\s*battleEventRole/.test(gameSource),
    },
    {
      name: 'defeat_and_surrender_use_same_map_aware_penalty',
      passed: (gameSource.match(/getDefeatGoldPenalty\(\{[\s\S]{0,260}?mapName:\s*battleEnvironment\?\.mapName\s*\|\|\s*currentMapName/g) || []).length >= 3,
    },
    {
      name: 'challenge_confirmations_show_energy_and_defeat_cost_before_start',
      passed: /defeatGoldPenalty=\{pendingBattleEventConfirm\?\.defeatGoldPenalty\}/.test(gameSource)
        && /高风险 · 战败损失 \{defeatGoldPenalty\} 金币/.test(gameSource)
        && /战败损失 \$\{Math\.max/.test(gameSource),
    },
    {
      name: 'high_risk_warning_has_dedicated_visual_treatment',
      passed: /challenge-confirm-card__chip--danger/.test(gameSource)
        && /\.challenge-confirm-card__chip--danger\s*\{[\s\S]*?color:\s*#be123c/.test(cssSource),
    },
    {
      name: 'payable_penalty_is_clamped_to_available_gold',
      passed: /return Math\.min\(penalty, gold\)/.test(gameSource),
    },
  ]

  const failed = checks.filter((check) => !check.passed)
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      boundaryMap: HIGH_RISK_BATTLE_START_MAP_ID,
      boundaryDisplayName: getMapConfig(HIGH_RISK_BATTLE_START_MAP_ID).displayName,
      checkCount: checks.length,
      failedCount: failed.length,
    },
    maps,
    checks,
  }, null, 2))

  if (failed.length > 0) process.exitCode = 1
})
