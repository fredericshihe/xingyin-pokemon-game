#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
  const league = await loadModule('/src/game/timberLeague.js')
  const { MONSTERS, MOVES, getBalancedMovesForLevel } = await loadModule('/src/utils/gameData.js')
  const { getTypeEffectiveness } = await loadModule('/src/utils/battleDamage.js')
  const { chooseTrainerBattleAction } = await loadModule('/src/utils/battleAi.js')
  const { calculateBattleRewards, getTrainerRoleBalance } = await loadModule('/src/utils/gameBalance.js')
  const { swapPartyAndStorage } = await loadModule('/src/utils/pokemonRoster.js')
  const {
    TIMBER_LEAGUE_ROUTES,
    TIMBER_LEAGUE_GOLD_MULTIPLIERS,
    TIMBER_LEAGUE_ENEMY_SWITCH_LIMIT,
    getTimberLeagueEnemySwitchCount,
    canTimberLeagueEnemySwitch,
    recordTimberLeagueEnemySwitch,
    restoreTimberLeagueEnemySwitches,
    calculateTimberLeagueStageGold,
    claimTimberLeagueReward,
    continueTimberLeagueStage,
    getTimberLeagueRoute,
    getTimberLeagueRouteTeam,
    getTimberLeagueNextTeam,
    getTimberLeaguePlayerLevels,
    getTimberLeagueLevelOffset,
    getTimberLeagueLegacyThresholds,
    evaluateTimberLeagueTier,
    getTimberVoucherBalance,
    mergeTimberLeagueState,
    normalizeTimberLeagueState,
    normalizeTimberLeagueBattle,
    settleTimberLeagueStage,
    spendTimberVouchers,
    trackTimberLeagueTransition,
  } = league

  const runId = 'audit-gauntlet-run'
  const expected = { routeKey: 'gauntlet', runId, stage: 1, weekKey: '2026-09-28' }
  const makeMon = (id, hp = 100, mp = 30) => ({ id, name: id, currentHp: hp, currentMp: mp, maxHp: 100, maxMp: 30 })
  const baseRun = { ...expected, stages: 3, turns: 4, potions: 0, switches: 0, completed: false }
  const baseSnapshot = {
    view: 'battle',
    battlePhase: 'active',
    turn: 'player',
    battleEnvironment: { timberLeague: baseRun },
    enemyTeam: [makeMon('enemy-1', 0)],
    playerTeam: [makeMon('hero', 72, 11)],
    activePlayerId: 'hero',
    playerInventory: [{ itemType: 'potion', itemKey: 'potion', quantity: 2 }],
    world: { timberLeague: {} },
  }

  // Every player action is counted once, while enemy actions and forced switches are free.
  const moved = trackTimberLeagueTransition(baseSnapshot, {
    ...baseSnapshot,
    turn: 'resolving',
  })
  assert.equal(moved.battleEnvironment.timberLeague.turns, 5)
  const enemyAction = trackTimberLeagueTransition(moved, { ...moved, turn: 'player' })
  assert.equal(enemyAction.battleEnvironment.timberLeague.turns, 5)
  const potion = trackTimberLeagueTransition(baseSnapshot, {
    ...baseSnapshot,
    turn: 'enemy',
    playerInventory: [{ itemType: 'potion', itemKey: 'potion', quantity: 1 }],
  })
  assert.equal(potion.battleEnvironment.timberLeague.turns, 5)
  assert.equal(potion.battleEnvironment.timberLeague.potions, 1)
  const voluntarySwitch = trackTimberLeagueTransition(moved, {
    ...moved,
    turn: 'enemy',
    activePlayerId: 'bench',
    pendingBattleSwitch: null,
  })
  // A switch is recognized only when its persisted resolving snapshot carries the prior intent.
  const switched = trackTimberLeagueTransition({
    ...moved,
    pendingBattleSwitch: { forced: false },
  }, voluntarySwitch)
  assert.equal(switched.battleEnvironment.timberLeague.turns, 6)
  assert.equal(switched.battleEnvironment.timberLeague.switches, 1)
  const forced = trackTimberLeagueTransition({
    ...moved,
    pendingBattleSwitch: { forced: true },
  }, voluntarySwitch)
  assert.equal(forced.battleEnvironment.timberLeague.turns, 5)
  assert.equal(forced.battleEnvironment.timberLeague.switches, 0)

  // The budget survives saves and stale callbacks. Send-out (knockout)
  // messages and player switches never consume an enemy voluntary switch.
  assert.equal(TIMBER_LEAGUE_ENEMY_SWITCH_LIMIT, 2)
  const switchRun = { routeKey: 'training', runId: 'switch-budget', stage: 1, turns: 7 }
  const initialEnvironment = { timberLeague: switchRun }
  const firstSwitch = recordTimberLeagueEnemySwitch(initialEnvironment, ['对手派出了 首发！'])
  assert.equal(firstSwitch.timberLeague.enemySwitches, 1)
  assert.equal(firstSwitch.timberLeague.turns, 7)
  assert.equal(initialEnvironment.timberLeague.enemySwitches, undefined)
  const restoredEnvironment = { timberLeague: normalizeTimberLeagueBattle(JSON.parse(JSON.stringify(firstSwitch.timberLeague))) }
  assert.equal(canTimberLeagueEnemySwitch(restoredEnvironment, []), true)
  const secondSwitch = recordTimberLeagueEnemySwitch(restoredEnvironment, ['对手收回了 首发！', '对手派出了 后备！'])
  assert.equal(secondSwitch.timberLeague.enemySwitches, 2)
  assert.equal(canTimberLeagueEnemySwitch(secondSwitch, []), false)
  assert.throws(() => recordTimberLeagueEnemySwitch(secondSwitch, []), /已主动换人两次/)
  const oldRecallLogs = ['对手收回了 首发！', '对手派出了 后备！', '对手收回了 后备！', '对手派出了 首发！']
  assert.equal(canTimberLeagueEnemySwitch(initialEnvironment, oldRecallLogs), false)
  assert.equal(getTimberLeagueEnemySwitchCount({}, ['上吧，队友！', '对手派出了 补位！']), 0)
  assert.equal(getTimberLeagueEnemySwitchCount({ enemySwitches: 1 }, oldRecallLogs), 1)
  assert.equal(getTimberLeagueEnemySwitchCount(normalizeTimberLeagueBattle(switchRun), oldRecallLogs), 2)
  const restoredLegacy = restoreTimberLeagueEnemySwitches(initialEnvironment, oldRecallLogs)
  assert.equal(canTimberLeagueEnemySwitch(restoredLegacy, []), false)
  assert.equal(restoreTimberLeagueEnemySwitches(firstSwitch, oldRecallLogs), firstSwitch)
  assert.equal(restoreTimberLeagueEnemySwitches(null, oldRecallLogs), null)
  const ordinaryEnvironment = { eventRole: 'boss' }
  assert.equal(canTimberLeagueEnemySwitch(ordinaryEnvironment, oldRecallLogs), true)
  assert.equal(recordTimberLeagueEnemySwitch(ordinaryEnvironment, oldRecallLogs), ordinaryEnvironment)
  const switchSnapshot = { ...baseSnapshot, battleEnvironment: secondSwitch }
  const staleSwitch = trackTimberLeagueTransition(switchSnapshot, {
    ...switchSnapshot, battleEnvironment: initialEnvironment,
  })
  assert.equal(staleSwitch.battleEnvironment.timberLeague.enemySwitches, 2)
  const knockoutReplacement = trackTimberLeagueTransition(switchSnapshot, {
    ...switchSnapshot, activeEnemyId: 'replacement', battlePhase: 'sendout',
  })
  assert.equal(knockoutReplacement.battleEnvironment.timberLeague.enemySwitches, 2)
  assert.equal(knockoutReplacement.battleEnvironment.timberLeague.turns, 7)
  assert.equal(trackTimberLeagueTransition(switchSnapshot, {
    ...switchSnapshot, battleEnvironment: { timberLeague: { ...switchRun, runId: 'next-match', enemySwitches: 0 } },
  }).battleEnvironment.timberLeague.enemySwitches, 0)
  const oldSwitchSnapshot = { ...baseSnapshot, logs: oldRecallLogs, battleEnvironment: initialEnvironment }
  const migratedSwitches = trackTimberLeagueTransition(oldSwitchSnapshot, {
    ...oldSwitchSnapshot, logs: Array(80).fill('使用了招式！'),
  })
  assert.equal(migratedSwitches.battleEnvironment.timberLeague.enemySwitches, 2)
  assert.equal(canTimberLeagueEnemySwitch(JSON.parse(JSON.stringify(migratedSwitches.battleEnvironment)), []), false)
  const legacyStageSnapshot = { ...baseSnapshot, battleEnvironment: { timberLeague: { ...baseRun, enemySwitches: 2 } } }
  const nextStageBudget = trackTimberLeagueTransition(legacyStageSnapshot, {
    ...legacyStageSnapshot,
    battleEnvironment: { timberLeague: { ...baseRun, stage: 2, enemySwitches: 0 } },
    logs: oldRecallLogs,
  })
  assert.equal(canTimberLeagueEnemySwitch(nextStageBudget.battleEnvironment, oldRecallLogs), true)

  // A stage cannot settle early, and a completed stage can be settled only once.
  assert.throws(() => settleTimberLeagueStage({ ...baseSnapshot, enemyTeam: [makeMon('enemy-1', 1)] }, expected, (mon) => mon.currentHp > 0), /还有未击败/)
  const victory = settleTimberLeagueStage(baseSnapshot, expected, (mon) => mon.currentHp > 0, new Date('2026-10-01T00:00:00Z'))
  assert.equal(victory.battlePhase, 'victory')
  assert.equal(victory.battleEnvironment.timberLeague.stageCleared, undefined)
  assert.equal(victory.battlePhaseData.rewardSummary.timberLeague.stageCleared, true)
  assert.equal(victory.battlePhaseData.rewardSummary.timberLeague.voucherCount, 0)
  assert.equal(victory.battlePhaseData.rewardSummary.gold, calculateTimberLeagueStageGold(baseSnapshot.enemyTeam))
  assert.deepEqual(victory.world.timberLeague.clearedStageIds, [`gauntlet:1:${runId}`])
  assert.notDeepEqual(
    getTimberLeagueNextTeam('gauntlet', 1, victory.world.timberLeague, [{ level: 80 }]).map((mon) => mon.pokemonId),
    getTimberLeagueNextTeam('gauntlet', 1, baseSnapshot.world.timberLeague, [{ level: 80 }]).map((mon) => mon.pokemonId),
  )
  assert.throws(() => settleTimberLeagueStage(victory, expected, (mon) => mon.currentHp > 0), /阶段已变化/)

  const route = getTimberLeagueRoute('gauntlet')
  const nextEnemies = getTimberLeagueRouteTeam('gauntlet', 2).map((entry, index) => makeMon(`stage-2-${index}`))
  const continued = continueTimberLeagueStage(victory, expected, nextEnemies, (mon) => mon.currentHp > 0, (mon) => ({ ...mon, volatileStatuses: {} }))
  assert.equal(continued.battleEnvironment.timberLeague.enemySwitches, 0)
  assert.equal(continued.battlePhase, 'intro')
  assert.equal(continued.battleEnvironment.timberLeague.stage, 2)
  assert.equal(continued.playerTeam[0].currentHp, 72)
  assert.equal(continued.playerTeam[0].currentMp, 11)
  assert.equal(continued.playerInventory[0].quantity, 2)
  assert.deepEqual(Object.values(TIMBER_LEAGUE_ROUTES).map(({ stages, energyCost }) => [stages, energyCost]), [
    [1, 2],
  ])
  assert.equal(continued.activeBattleEnergyCost, 1)
  assert.equal(getTimberLeagueRouteTeam('sprint', 2).length, 4)
  assert.notDeepEqual(getTimberLeagueRouteTeam('sprint', 1), getTimberLeagueRouteTeam('sprint', 2))
  const level80Party = Array.from({ length: 6 }, () => ({ level: 80 }))
  assert.deepEqual(['steady', 'sprint', 'gauntlet'].map((key) => getTimberLeagueLevelOffset(level80Party, key)), [31, 27, 23])
  assert.equal(getTimberLeagueLevelOffset([{ level: 80 }, ...Array.from({ length: 5 }, () => ({ level: 5 }))], 'steady'), 0)
  assert.equal(getTimberLeagueLevelOffset([], 'steady'), 0)
  const mixedParty = [80, 75, 70, 65, 60, 55].map((level) => ({ level }))
  assert.deepEqual(getTimberLeaguePlayerLevels(mixedParty), [80, 75, 70, 65, 60, 55])
  const mixedTeam = getTimberLeagueNextTeam('steady', 1, {}, mixedParty)
  assert.deepEqual(mixedTeam.map((mon) => mon.level), [74, 69, 65, 60, 56, 51])
  assert.deepEqual(getTimberLeagueNextTeam('steady', 1, {}, mixedParty), mixedTeam)
  for (const routeKey of ['sprint', 'gauntlet']) {
    const roster = [100, 20, 20, 20, 20, 20].map((level) => ({ level }))
    const changedRoster = [100, 75, 70, 65, 60, 55].map((level) => ({ level }))
    for (let stage = 1; stage <= getTimberLeagueRoute(routeKey).stages; stage += 1) {
      const original = getTimberLeagueNextTeam(routeKey, stage, {}, roster)
      const adjusted = getTimberLeagueNextTeam(routeKey, stage, {}, changedRoster)
      assert.deepEqual(adjusted.map((mon) => mon.pokemonId), original.map((mon) => mon.pokemonId))
      assert(original.some((mon) => mon.level >= 92), `${routeKey} stage ${stage} must match a level 100 lead`)
      assert(adjusted.some((mon) => mon.level >= 92), `${routeKey} stage ${stage} must retain the high-level match`)
      assert(original.every((mon) => mon.level <= 100))
      assert(adjusted.some((mon, index) => mon.level !== original[index].level))
    }
  }
  const afterOneWin = { clearedStageIds: ['steady:1:run-1'] }
  assert.notDeepEqual(getTimberLeagueNextTeam('steady', 1, afterOneWin, mixedParty).map((mon) => mon.pokemonId), mixedTeam.map((mon) => mon.pokemonId))
  assert.deepEqual(getTimberLeagueNextTeam('steady', 1, { clearedStageIds: [] }, mixedParty), mixedTeam)
  const steadyBase = getTimberLeagueRouteTeam('steady', 1, 'stable-run')
  const steadyScaled = getTimberLeagueRouteTeam('steady', 1, 'stable-run', 31)
  assert.deepEqual(steadyScaled.map((mon) => mon.level), steadyBase.map((mon) => mon.level + 31))
  assert.deepEqual(getTimberLeagueRouteTeam('steady', 1, 'stable-run', 55).map((mon) => mon.level), [98, 98, 99, 99, 100, 100])
  assert.equal(normalizeTimberLeagueBattle({ ...baseRun, levelOffset: 31, medalThresholds: { gold: 11, silver: 16 } }).levelOffset, 31)
  assert.equal(normalizeTimberLeagueBattle(baseRun).medalThresholds, null)
  const savedNewRun = JSON.parse(JSON.stringify(normalizeTimberLeagueBattle({
    ...expected,
    levelOffset: getTimberLeagueLevelOffset(level80Party, 'gauntlet'),
    medalThresholds: { ...getTimberLeagueRoute('gauntlet').thresholds },
  })))
  const savedStageOne = settleTimberLeagueStage({
    ...baseSnapshot,
    battleEnvironment: { timberLeague: savedNewRun },
  }, expected, (mon) => mon.currentHp > 0)
  const scaledStageTwoTeam = getTimberLeagueRouteTeam('gauntlet', 2, runId, savedNewRun.levelOffset)
    .map((entry, index) => ({ ...makeMon(`scaled-stage-2-${index}`), level: entry.level }))
  const savedStageTwo = continueTimberLeagueStage(
    savedStageOne, expected, scaledStageTwoTeam, (mon) => mon.currentHp > 0, (mon) => mon,
  )
  assert.equal(savedStageTwo.battleEnvironment.timberLeague.levelOffset, 23)
  assert.deepEqual(savedStageTwo.battleEnvironment.timberLeague.medalThresholds, { gold: 16, silver: 21 })
  assert.deepEqual(savedStageTwo.enemyTeam.map((mon) => mon.level),
    getTimberLeagueRouteTeam('gauntlet', 2, runId).map((mon) => mon.level + 23))
  const dynamicRun = { ...expected, playerLevels: [80, 70], medalThresholds: { ...getTimberLeagueRoute('gauntlet').thresholds } }
  const dynamicFirstWin = settleTimberLeagueStage({
    ...baseSnapshot,
    battleEnvironment: { timberLeague: dynamicRun },
    playerTeam: [{ ...makeMon('hero', 40, 9), level: 80 }, { ...makeMon('bench', 0, 3), level: 70 }],
    storageBox: [{ ...makeMon('fresh', 61, 17), level: 100 }],
    world: { timberLeague: {} },
  }, expected, (mon) => mon.currentHp > 0)
  const originalPreview = getTimberLeagueNextTeam('gauntlet', 2, dynamicFirstWin.world.timberLeague, dynamicFirstWin.playerTeam)
  const swapped = swapPartyAndStorage(dynamicFirstWin, 'hero', 'fresh')
  assert.equal(swapped.success, true)
  assert.deepEqual(swapped.storageBox.map((mon) => [mon.id, mon.currentHp, mon.currentMp]), [['hero', 40, 9]])
  const changedParty = [swapped.playerTeam[1], swapped.playerTeam[0]]
  const dynamicPreview = getTimberLeagueNextTeam('gauntlet', 2, dynamicFirstWin.world.timberLeague, dynamicRun.playerLevels)
  assert.deepEqual(dynamicPreview.map((mon) => mon.pokemonId), originalPreview.map((mon) => mon.pokemonId))
  assert.deepEqual(dynamicPreview.map((mon) => mon.level), originalPreview.map((mon) => mon.level))
  const changedStage = continueTimberLeagueStage({
    ...dynamicFirstWin, playerTeam: changedParty, activePlayerId: 'bench',
  }, expected, dynamicPreview.map((mon, index) => ({ ...makeMon(`dynamic-${index}`), level: mon.level })),
  (mon) => mon.currentHp > 0, (mon) => mon)
  assert.equal(changedStage.activePlayerId, 'fresh')
  assert.deepEqual(changedStage.playerTeam.map((mon) => [mon.id, mon.currentHp, mon.currentMp]),
    [['bench', 0, 3], ['fresh', 61, 17]])
  assert.deepEqual(changedStage.battleEnvironment.timberLeague.playerLevels, [80, 70])
  assert.deepEqual(changedStage.enemyTeam.map((mon) => mon.level), dynamicPreview.map((mon) => mon.level))
  const speciesIds = new Set(MONSTERS.map((monster) => monster.id))
  const speciesById = new Map(MONSTERS.map((monster) => [monster.id, monster]))
  const trainingCounterChains = [
    ['water', 'electric', 'ground', 'water'],
    ['electric', 'ground', 'grass', 'flying'],
    ['psychic', 'dark', 'fairy', 'steel'],
    ['water', 'electric', 'ground', 'grass'],
    ['grass', 'fire', 'water', 'electric'],
    ['water', 'electric', 'ground', 'water'],
    ['dark', 'fighting', 'flying', 'electric'],
    ['dark', 'fairy', 'steel', 'ground'],
    ['fighting', 'flying', 'electric', 'ground'],
    ['fighting', 'psychic', 'dark', 'fairy'],
    ['fire', 'water', 'fairy', 'steel'],
    ['fire', 'water', 'grass', 'fire'],
    ['steel', 'fire', 'water', 'grass'],
    ['ground', 'grass', 'flying', 'rock'],
    ['rock', 'fighting', 'flying', 'electric'],
  ]
  for (const route of Object.values(TIMBER_LEAGUE_ROUTES)) {
    assert.equal(route.teamVariants.length, route.stages)
    route.teamVariants.forEach((variants, stageIndex) => {
      assert.equal(variants.length, trainingCounterChains.length, `${route.key} stage ${stageIndex + 1} needs varied lineups`)
      assert.equal(new Set(variants.map((team) => team.map((member) => member.pokemonId).join(','))).size, variants.length)
      variants.flat().forEach((member) => assert(speciesIds.has(member.pokemonId), `Unknown species ${member.pokemonId}`))
      variants.forEach((team) => {
        assert.equal(new Set(team.map((member) => member.pokemonId)).size, team.length, 'one lineup must not repeat a species')
        const primaryTypes = new Set(team.map((member) => speciesById.get(member.pokemonId).type))
        const minimumTypes = team.length === 3 ? 3 : team.length === 4 ? 3 : 4
        assert(primaryTypes.size >= minimumTypes, `${route.key} stage ${stageIndex + 1} needs mixed primary types`)
        if (route.key === 'training') {
          const leads = team.slice(0, 3).map((member) => speciesById.get(member.pokemonId))
          const variantIndex = variants.indexOf(team)
          const [firstCounter, secondCounter, secondWeakness, thirdCounter] = trainingCounterChains[variantIndex] || []
          const expected = firstCounter && { firstCounter, secondCounter, secondWeakness, thirdCounter }
          assert(expected, `missing training counter chain for variant ${variantIndex + 1}`)
          assert(getTypeEffectiveness(expected.firstCounter, leads[0]) > 1,
            `${expected.firstCounter} must counter ${leads[0].name}`)
          assert([leads[1].type, leads[1].type2].includes(expected.secondCounter),
            `${leads[1].name} must have ${expected.secondCounter} typing`)
          assert(getTypeEffectiveness(expected.secondCounter, { type: expected.firstCounter }) > 1,
            `${leads[1].name} must counter ${expected.firstCounter}`)
          assert(getBalancedMovesForLevel(leads[1], 80).some((key) =>
            MOVES[key]?.type === expected.secondCounter && Number(MOVES[key]?.power) > 0),
          `${leads[1].name} needs a damaging ${expected.secondCounter} move at Lv.80`)
          assert(getTypeEffectiveness(expected.secondWeakness, leads[1]) > 1,
            `${expected.secondWeakness} must counter ${leads[1].name}`)
          assert([leads[2].type, leads[2].type2].includes(expected.thirdCounter),
            `${leads[2].name} must have ${expected.thirdCounter} typing`)
          assert(getTypeEffectiveness(expected.thirdCounter, { type: expected.secondWeakness }) > 1,
            `${leads[2].name} must counter ${expected.secondWeakness}`)
          assert(getBalancedMovesForLevel(leads[2], 80).some((key) =>
            MOVES[key]?.type === expected.thirdCounter && Number(MOVES[key]?.power) > 0),
          `${leads[2].name} needs a damaging ${expected.thirdCounter} move at Lv.80`)
          const stabSweeper = MONSTERS.find((candidate) => leads.every((defender) => (
            [candidate.type, candidate.type2].filter(Boolean)
              .some((type) => getTypeEffectiveness(type, defender) > 1)
          )))
          assert(!stabSweeper, `${stabSweeper?.name} can counter every training lead with its own types`)
        }
      })
      const sampled = Array.from({ length: 90 }, (_, index) => getTimberLeagueRouteTeam(route.key, stageIndex + 1, `run-${index}`))
      assert.equal(new Set(sampled.map((team) => team.map((member) => member.pokemonId).join(','))).size, variants.length)
      assert.deepEqual(getTimberLeagueRouteTeam(route.key, stageIndex + 1, 'stable-run'), getTimberLeagueRouteTeam(route.key, stageIndex + 1, 'stable-run'))
    })
    for (let stage = 2; stage <= route.stages; stage += 1) {
      assert.notDeepEqual(getTimberLeagueRouteTeam(route.key, stage, 'stable-run'), getTimberLeagueRouteTeam(route.key, stage - 1, 'stable-run'))
    }
  }
  const trainingVariants = TIMBER_LEAGUE_ROUTES.training.teamVariants[0]
  for (let slot = 0; slot < 3; slot += 1) {
    assert(new Set(trainingVariants.map((team) => team[slot].pokemonId)).size >= 10,
      `training lead position ${slot + 1} needs enough distinct Pokemon`)
  }
  const wins = Array.from({ length: trainingVariants.length }, (_, index) => `training:1:win-${index}`)
  const observed = Array.from({ length: trainingVariants.length }, (_, index) => getTimberLeagueNextTeam(
    'training', 1, { clearedStageIds: wins.slice(0, index) }, level80Party,
  ).map((mon) => mon.pokemonId).join(','))
  assert.equal(new Set(observed).size, trainingVariants.length, 'every lineup must appear before rotation repeats')
  assert.notDeepEqual(getTimberLeagueNextTeam('training', 1, { clearedStageIds: wins }, level80Party),
    getTimberLeagueNextTeam('training', 1, { clearedStageIds: wins.slice(0, -1) }, level80Party))
  const mergedWins = mergeTimberLeagueState({ clearedStageIds: wins.slice(0, 4) }, { clearedStageIds: wins.slice(4, 9) })
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, mergedWins, level80Party), getTimberLeagueNextTeam(
    'training', 1, { clearedStageIds: wins.slice(0, 9).reverse() }, level80Party,
  ))
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, { clearedStageIds: wins.slice(0, 9) }, mixedParty)
    .map((mon) => mon.pokemonId), getTimberLeagueNextTeam('training', 1, mergedWins, level80Party)
    .map((mon) => mon.pokemonId))
  let seededState = normalizeTimberLeagueState(null)
  const seededPicks = []
  for (let index = 0; index < trainingVariants.length * 6 + 1; index += 1) {
    seededPicks.push(getTimberLeagueNextTeam('training', 1, seededState, level80Party)
      .map((mon) => mon.pokemonId).join(','))
    const id = index === 0 ? 'z-first-win' : `a-later-win-${index}`
    const reward = claimTimberLeagueReward({ timberLeague: seededState }, {
      routeKey: 'training', runId: id, stage: 1, completed: true, turns: 18,
      medalThresholds: { gold: 14, silver: 17 },
    })
    seededState = { ...reward.state, clearedStageIds: [...reward.state.clearedStageIds, `training:1:${id}`] }
    assert.equal(seededState.lineupSeed, 'z-first-win')
  }
  assert.equal(new Set(seededPicks.slice(0, trainingVariants.length * 6)).size,
    trainingVariants.length * 6, 'full training lineups must not repeat for six rotations')
  for (let cycle = 0; cycle < 6; cycle += 1) {
    const firstThree = seededPicks.slice(cycle * trainingVariants.length, (cycle + 1) * trainingVariants.length)
      .map((team) => team.split(',').slice(0, 3).join(','))
    assert.equal(new Set(firstThree).size, trainingVariants.length, 'all lead trios appear once per rotation')
  }
  assert(seededPicks.every((team, index) => index === 0 || team !== seededPicks[index - 1]),
    'adjacent wins must not face the same full lineup')
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, seededState, level80Party),
    getTimberLeagueNextTeam('training', 1, JSON.parse(JSON.stringify(seededState)), level80Party),
    'saved progress must preserve the next lineup')
  const lowHpEnemy = { ...makeMon('enemy-low-hp', 12), level: 45, moves: ['tackle'] }
  const noPotionAction = chooseTrainerBattleAction({
    enemyTeam: [lowHpEnemy], activeEnemyMon: lowHpEnemy, targetMon: { ...makeMon('hero'), level: 45 },
    battleKind: 'trainer', potionsRemaining: 0, allowSwitch: false,
  })
  assert.notEqual(noPotionAction.type, 'item')
  assert.deepEqual(Object.values(TIMBER_LEAGUE_ROUTES).map(({ thresholds }) => [thresholds.gold, thresholds.silver]), [
    [14, 17],
  ])
  assert.equal(evaluateTimberLeagueTier({ routeKey: 'steady', turns: 11, medalThresholds: getTimberLeagueLegacyThresholds('steady') }).tier, 'bronze')
  for (const route of Object.values(TIMBER_LEAGUE_ROUTES)) {
    assert.equal(evaluateTimberLeagueTier({ routeKey: route.key, turns: route.thresholds.gold }).tier, 'gold')
    assert.equal(evaluateTimberLeagueTier({ routeKey: route.key, turns: route.thresholds.gold + 1 }).tier, 'silver')
    assert.equal(evaluateTimberLeagueTier({ routeKey: route.key, turns: route.thresholds.silver + 1 }).tier, 'bronze')
  }

  const sprintRun = { routeKey: 'sprint', runId: 'audit-sprint-run', stage: 1, turns: 4, weekKey: '2026-09-28' }
  const sprintSnapshot = {
    ...baseSnapshot,
    battleEnvironment: { timberLeague: sprintRun },
    world: { timberLeague: {} },
  }
  const sprintFirstWin = settleTimberLeagueStage(sprintSnapshot, sprintRun, (mon) => mon.currentHp > 0, new Date('2026-10-01T00:00:00Z'))
  assert.equal(sprintFirstWin.battleEnvironment.timberLeague.completed, false)
  assert.equal(sprintFirstWin.battlePhaseData.rewardSummary.timberLeague.voucherCount, 0)
  const sprintSecondStage = continueTimberLeagueStage(
    sprintFirstWin, sprintRun, getTimberLeagueRouteTeam('sprint', 2).map((_, index) => makeMon(`sprint-2-${index}`)),
    (mon) => mon.currentHp > 0, (mon) => mon,
  )
  assert.equal(sprintSecondStage.activeBattleEnergyCost, 1)
  const sprintFinalWin = settleTimberLeagueStage({
    ...sprintSecondStage,
    battlePhase: 'active',
    battleEnvironment: { timberLeague: { ...sprintSecondStage.battleEnvironment.timberLeague, turns: 8 } },
    enemyTeam: [makeMon('sprint-final-enemy', 0)],
  }, { ...sprintRun, stage: 2 }, (mon) => mon.currentHp > 0, new Date('2026-10-01T00:00:00Z'))
  assert.equal(sprintFinalWin.battleEnvironment.timberLeague.completed, true)
  assert.equal(sprintFinalWin.battlePhaseData.rewardSummary.timberLeague.voucherCount, 5)

  const steadyRun = { routeKey: 'steady', runId: 'audit-steady-run', stage: 1, turns: 6, weekKey: '2026-09-28' }
  const steadyWin = settleTimberLeagueStage({
    ...baseSnapshot,
    battleEnvironment: { timberLeague: steadyRun },
  }, steadyRun, (mon) => mon.currentHp > 0, new Date('2026-10-01T00:00:00Z'))
  assert.equal(steadyWin.battleEnvironment.timberLeague.completed, true)
  assert.equal(steadyWin.battlePhaseData.rewardSummary.timberLeague.voucherCount, 3)
  assert.equal(calculateTimberLeagueStageGold([{ level: 80 }]), 2 * calculateBattleRewards({
    defeatedMon: { level: 80 }, battleKind: 'trainer', trainerRole: 'minigame'
  }).gold)
  const cappedSteadyWin = settleTimberLeagueStage({
    ...baseSnapshot,
    battleEnvironment: { timberLeague: { ...steadyRun, runId: 'audit-steady-capped' } },
    enemyTeam: [{ ...makeMon('capped-enemy', 0), level: 80 }],
    world: { timberLeague: steadyWin.world.timberLeague },
  }, { ...steadyRun, runId: 'audit-steady-capped' }, (mon) => mon.currentHp > 0, new Date('2026-10-01T00:00:00Z'))
  assert.equal(cappedSteadyWin.battlePhaseData.rewardSummary.timberLeague.voucherCount, 0)
  assert.equal(cappedSteadyWin.battlePhaseData.rewardSummary.gold, calculateTimberLeagueStageGold([{ level: 80 }]))
  assert.notDeepEqual(getTimberLeagueNextTeam('steady', 1, cappedSteadyWin.world.timberLeague, level80Party),
    getTimberLeagueNextTeam('steady', 1, steadyWin.world.timberLeague, level80Party))
  const newSteadyRun = { ...steadyRun, turns: 9, levelOffset: 31, medalThresholds: { ...getTimberLeagueRoute('steady').thresholds } }
  const newSteadyWin = settleTimberLeagueStage({
    ...baseSnapshot,
    battleEnvironment: { timberLeague: newSteadyRun },
  }, newSteadyRun, (mon) => mon.currentHp > 0)
  assert.equal(newSteadyWin.battlePhaseData.rewardSummary.timberLeague.tier, 'gold')
  assert.equal(newSteadyWin.battlePhaseData.rewardSummary.timberLeague.voucherCount, 3)
  const oldSteadyWin = settleTimberLeagueStage({
    ...baseSnapshot,
    battleEnvironment: { timberLeague: { ...steadyRun, turns: 9 } },
  }, steadyRun, (mon) => mon.currentHp > 0)
  assert.equal(oldSteadyWin.battlePhaseData.rewardSummary.timberLeague.tier, 'bronze')
  assert.equal(oldSteadyWin.battlePhaseData.rewardSummary.timberLeague.voucherCount, 1)

  const secondStageWin = settleTimberLeagueStage({
    ...continued,
    battlePhase: 'active',
    battleEnvironment: { timberLeague: { ...continued.battleEnvironment.timberLeague, turns: 8 } },
    enemyTeam: [makeMon('stage-2-final-enemy', 0)],
  }, { ...expected, stage: 2 }, (mon) => mon.currentHp > 0, new Date('2026-10-01T00:00:00Z'))
  assert.equal(secondStageWin.battleEnvironment.timberLeague.completed, false)
  assert.equal(secondStageWin.battlePhaseData.rewardSummary.timberLeague.voucherCount, 0)
  const thirdStage = continueTimberLeagueStage(
    secondStageWin, { ...expected, stage: 2 },
    getTimberLeagueRouteTeam('gauntlet', 3).map((_, index) => makeMon(`stage-3-${index}`)),
    (mon) => mon.currentHp > 0, (mon) => mon,
  )
  assert.equal(thirdStage.battleEnvironment.timberLeague.stage, 3)
  assert.equal(thirdStage.activeBattleEnergyCost, 1)

  // Reward claims are idempotent and high tiers backfill lower tiers once.
  const completedRun = { ...baseRun, stage: 3, completed: false, turns: 11 }
  const finalSnapshot = {
    ...thirdStage,
    battlePhase: 'active',
    battleEnvironment: { timberLeague: completedRun },
    enemyTeam: [makeMon('final-enemy', 0)],
    battlePhaseData: null,
  }
  const finalVictory = settleTimberLeagueStage(finalSnapshot, { ...expected, stage: 3 }, (mon) => mon.currentHp > 0, new Date('2026-10-01T00:00:00Z'))
  const reward = finalVictory.battlePhaseData.rewardSummary.timberLeague
  assert.equal(reward.completed, true)
  assert.equal(reward.voucherCount, 7) // gold is the weekly total, including bronze/silver
  assert.equal(getTimberVoucherBalance(finalVictory.world.timberLeague), 7)
  assert.throws(() => settleTimberLeagueStage(finalVictory, { ...expected, stage: 3 }, (mon) => mon.currentHp > 0), /阶段已变化/)

  // Each route pays up to its highest medal once per week, with no daily cap.
  const claimDate = new Date('2026-10-01T15:59:00Z')
  const completed = (routeKey, id, turns = 1, weekKey = '2026-09-28') => ({
    routeKey, runId: id, weekKey,
    stage: getTimberLeagueRoute(routeKey).stages, completed: true, turns,
    medalThresholds: getTimberLeagueRoute(routeKey).thresholds,
  })
  const steadyClaim = claimTimberLeagueReward({ timberLeague: {} }, completed('steady', 'weekly-steady'), claimDate)
  const sprintClaim = claimTimberLeagueReward({ timberLeague: steadyClaim.state }, completed('sprint', 'weekly-sprint'), claimDate)
  const gauntletClaim = claimTimberLeagueReward({ timberLeague: sprintClaim.state }, completed('gauntlet', 'weekly-gauntlet'), claimDate)
  assert.equal(steadyClaim.voucherCount, 3)
  assert.equal(sprintClaim.voucherCount, 5)
  assert.equal(gauntletClaim.voucherCount, 7)
  assert.equal(getTimberVoucherBalance(gauntletClaim.state), 15)
  assert.equal(claimTimberLeagueReward({ timberLeague: gauntletClaim.state }, completed('steady', 'weekly-repeat'), claimDate).voucherCount, 0)
  const bronze = claimTimberLeagueReward({ timberLeague: {} }, completed('steady', 'bronze', 25), claimDate)
  const silver = claimTimberLeagueReward({ timberLeague: bronze.state }, completed('steady', 'silver', 15), claimDate)
  const gold = claimTimberLeagueReward({ timberLeague: silver.state }, completed('steady', 'gold', 8), claimDate)
  assert.deepEqual([bronze.voucherCount, silver.voucherCount, gold.voucherCount], [1, 1, 1])
  assert.equal(getTimberVoucherBalance(gold.state), 3)
  assert.equal(claimTimberLeagueReward({ timberLeague: gold.state }, completed('steady', 'bronze-repeat', 25), claimDate).voucherCount, 0)
  const nextWeek = claimTimberLeagueReward({ timberLeague: gauntletClaim.state }, completed('steady', 'next-week', 1, '2026-10-05'), new Date('2026-10-05T00:00:00Z'))
  assert.equal(nextWeek.voucherCount, 3)
  assert.equal(getTimberVoucherBalance(nextWeek.state), 18)
  assert.equal(getTimberVoucherBalance(mergeTimberLeagueState(gauntletClaim.state, nextWeek.state)), 18)
  const legacyClaim = claimTimberLeagueReward({ timberLeague: { completedRewardIds: [
    '2026-09-28:steady:bronze', '2026-09-28:steady:silver', '2026-09-28:steady:gold'
  ], voucherBalance: 3 } }, completed('steady', 'old-save'), claimDate)
  assert.equal(legacyClaim.voucherCount, 0)
  assert.equal(getTimberVoucherBalance(legacyClaim.state), 3)
  const highestMedalOnly = claimTimberLeagueReward({ timberLeague: {
    completedRewardIds: ['2026-09-28:steady:gold'], voucherBalance: 3,
  } }, completed('steady', 'highest-only'), claimDate)
  assert.equal(highestMedalOnly.voucherCount, 0)
  const oldDeferred = {
    version: 2,
    earnedVoucherIds: ['2026-09-28:steady:bronze:1'],
    voucherEntitlementIds: ['2026-09-28:steady:bronze:1', '2026-09-28:sprint:bronze:1'],
    completedRewardIds: ['2026-09-28:steady:bronze', '2026-09-28:sprint:bronze'],
  }
  const migrated = normalizeTimberLeagueState(oldDeferred)
  assert.equal(getTimberVoucherBalance(migrated), 2)
  assert.equal(getTimberVoucherBalance(mergeTimberLeagueState(oldDeferred, migrated)), 2)
  assert.equal(claimTimberLeagueReward({ timberLeague: migrated }, completed('steady', 'old-deferred', 25), claimDate).voucherCount, 0)

  // New matches pay per run, independent of the date, week or past medals.
  assert.deepEqual(Object.keys(TIMBER_LEAGUE_ROUTES), ['training'])
  const training = getTimberLeagueRoute()
  assert.equal(training.key, 'training')
  assert.equal(training.energyCost, 2)
  assert.equal(training.stages, 1)
  assert.equal(getTrainerRoleBalance('minigame').maxTeamSize, 6)
  const trainingTeam = getTimberLeagueNextTeam('training', 1, {}, level80Party)
  assert.equal(trainingTeam.length, 6)
  assert.deepEqual(trainingTeam.map((mon) => mon.level), [80, 80, 80, 80, 80, 80])
  const fillerTeam = getTimberLeagueNextTeam('training', 1, {}, [100, 20, 20, 20, 20, 20])
  assert.deepEqual(fillerTeam.map((mon) => mon.level), [100, 20, 20, 20, 20, 20])
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, mixedParty).map((mon) => mon.level), [80, 75, 70, 65, 60, 55])
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, mixedParty.slice().reverse()), getTimberLeagueNextTeam('training', 1, {}, mixedParty))
  for (const [levels, expectedLevels] of [
    [[80], [80, 80, 80, 80, 80, 80]],
    [[80, 40], [80, 80, 80, 40, 40, 40]],
    [[80, 60, 40], [80, 80, 60, 60, 40, 40]],
    [[80, 60, 40, 20], [80, 80, 60, 40, 40, 20]],
    [[90, 80, 70, 60, 50], [90, 90, 80, 70, 60, 50]],
  ]) {
    const matched = getTimberLeagueNextTeam('training', 1, {}, levels)
    assert.equal(matched.length, 6)
    assert.deepEqual(matched.map((mon) => mon.level), expectedLevels)
    assert.deepEqual(matched.map((mon) => mon.pokemonId), trainingTeam.map((mon) => mon.pokemonId))
    assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, levels.slice().reverse()), matched)
  }
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, []), [])
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, [null, {}, 0]), [])
  assert.equal(getTimberLeagueLevelOffset(level80Party, 'training'), 0)
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, level80Party.slice().reverse()), trainingTeam)
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, Array(6).fill({ level: 80, pokemonId: 10 })), trainingTeam)
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, mixedParty).map((mon) => mon.pokemonId), trainingTeam.map((mon) => mon.pokemonId))
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, Array(6).fill(100)).map((mon) => mon.level), Array(6).fill(100))
  assert.deepEqual(getTimberLeagueNextTeam('training', 1, {}, Array(6).fill(1)).map((mon) => mon.level), Array(6).fill(1))
  for (const [turns, tier, vouchers] of [[14, 'gold', 3], [15, 'silver', 2], [17, 'silver', 2], [18, 'bronze', 1], [99, 'bronze', 1]]) {
    const result = claimTimberLeagueReward({ timberLeague: {} }, completed('training', `boundary-${turns}`, turns), claimDate)
    assert.equal(result.tier, tier)
    assert.equal(result.voucherCount, vouchers)
    const replay = claimTimberLeagueReward({ timberLeague: result.state }, completed('training', `boundary-${turns}`, 1), claimDate)
    assert.equal(replay.voucherCount, 0)
    assert.equal(replay.alreadyClaimed, true)
    assert.equal(getTimberVoucherBalance(mergeTimberLeagueState(result.state, replay.state)), vouchers)
  }
  let repeatedState = migrated
  for (let index = 0; index < 10; index++) {
    const result = claimTimberLeagueReward({ timberLeague: repeatedState }, completed('training', `same-day-${index}`, training.thresholds.gold), claimDate)
    assert.equal(result.voucherCount, 3)
    repeatedState = result.state
  }
  assert.equal(getTimberVoucherBalance(repeatedState), 32)
  assert.equal(getTimberVoucherBalance(mergeTimberLeagueState(repeatedState, migrated)), 32)
  assert.equal(claimTimberLeagueReward({ timberLeague: repeatedState }, { ...completed('training', 'unfinished'), completed: false }, claimDate).voucherCount, 0)
  assert.equal(claimTimberLeagueReward({ timberLeague: repeatedState }, { ...completed('training', 'missing'), runId: null }, claimDate).voucherCount, 0)
  const trainingRun = {
    ...completed('training', 'settlement', training.thresholds.gold),
    completed: false,
    playerLevels: Array(6).fill(80),
    medalThresholds: { ...training.thresholds },
  }
  const trainingSnapshot = {
    ...baseSnapshot,
    battleEnvironment: { timberLeague: trainingRun },
    activeBattleEnergyCost: 2,
    enemyTeam: trainingTeam.map((entry, index) => ({ ...entry, ...makeMon(`six-${index}`, 0) })),
    world: { timberLeague: repeatedState },
  }
  assert.throws(() => settleTimberLeagueStage({ ...trainingSnapshot, enemyTeam: trainingSnapshot.enemyTeam.slice(0, 5) }, trainingRun, (mon) => mon.currentHp > 0), /六只对手/)
  const trainingVictory = settleTimberLeagueStage(trainingSnapshot, trainingRun, (mon) => mon.currentHp > 0, claimDate)
  assert.equal(trainingVictory.battleEnvironment.timberLeague.completed, true)
  assert.equal(trainingVictory.battlePhaseData.rewardSummary.timberLeague.voucherCount, 3)
  assert.equal(getTimberVoucherBalance(trainingVictory.world.timberLeague), 35)
  const bronzeGold = calculateTimberLeagueStageGold(trainingSnapshot.enemyTeam, 'bronze', 'training')
  const silverGold = calculateTimberLeagueStageGold(trainingSnapshot.enemyTeam, 'silver', 'training')
  const goldGold = calculateTimberLeagueStageGold(trainingSnapshot.enemyTeam, 'gold', 'training')
  assert.deepEqual(TIMBER_LEAGUE_GOLD_MULTIPLIERS, { bronze: 1, silver: 1.25, gold: 1.5 })
  assert(bronzeGold < silverGold && silverGold < goldGold, 'training medal gold rewards must increase by tier')
  assert.equal(trainingVictory.battlePhaseData.rewardSummary.gold, goldGold)
  assert.equal(trainingVictory.activeBattleEnergyCost, 2)
  for (const [turns, tier, vouchers, gold] of [
    [14, 'gold', 3, goldGold], [15, 'silver', 2, silverGold],
    [17, 'silver', 2, silverGold], [18, 'bronze', 1, bronzeGold],
  ]) {
    const result = settleTimberLeagueStage({
      ...trainingSnapshot,
      battleEnvironment: { timberLeague: { ...trainingRun, turns } },
    }, trainingRun, (mon) => mon.currentHp > 0, claimDate)
    assert.equal(result.battlePhaseData.rewardSummary.timberLeague.tier, tier)
    assert.equal(result.battlePhaseData.rewardSummary.timberLeague.voucherCount, vouchers)
    assert.equal(result.battlePhaseData.rewardSummary.gold, gold)
  }
  const savedPreviousRules = JSON.parse(JSON.stringify({ ...trainingRun, turns: 20, medalThresholds: { gold: 16, silver: 21 } }))
  const previousRulesVictory = settleTimberLeagueStage({
    ...trainingSnapshot, battleEnvironment: { timberLeague: savedPreviousRules },
  }, trainingRun, (mon) => mon.currentHp > 0, claimDate)
  assert.equal(previousRulesVictory.battlePhaseData.rewardSummary.timberLeague.tier, 'silver')
  assert.equal(previousRulesVictory.battlePhaseData.rewardSummary.gold, silverGold)
  const savedLastRules = JSON.parse(JSON.stringify({ ...trainingRun, turns: 18, medalThresholds: { gold: 16, silver: 19 } }))
  const lastRulesVictory = settleTimberLeagueStage({
    ...trainingSnapshot, battleEnvironment: { timberLeague: savedLastRules },
  }, trainingRun, (mon) => mon.currentHp > 0, claimDate)
  assert.equal(lastRulesVictory.battlePhaseData.rewardSummary.timberLeague.tier, 'silver')
  assert.equal(lastRulesVictory.battlePhaseData.rewardSummary.timberLeague.voucherCount, 2)
  assert.equal(lastRulesVictory.battlePhaseData.rewardSummary.gold, silverGold)
  assert.throws(() => continueTimberLeagueStage(trainingVictory, trainingRun, [], (mon) => mon.currentHp > 0, (mon) => mon), /阶段已变化/)
  assert.throws(() => settleTimberLeagueStage({ ...trainingSnapshot, world: trainingVictory.world }, trainingRun, (mon) => mon.currentHp > 0), /已结算/)
  assert.notDeepEqual(getTimberLeagueNextTeam('training', 1, trainingVictory.world.timberLeague, level80Party).map((mon) => mon.pokemonId), trainingTeam.map((mon) => mon.pokemonId))
  assert.equal(claimTimberLeagueReward({ timberLeague: trainingVictory.world.timberLeague }, completed('training', 'next-week-training', training.thresholds.silver + 1, '2026-10-05')).voucherCount, 1)
  for (const medalThresholds of [undefined, { gold: 14, silver: 18 }]) {
    const saved = { ...completed('training', 'legacy-training', 15), medalThresholds }
    assert.equal(claimTimberLeagueReward({ timberLeague: {} }, saved, claimDate).tier, 'silver')
    assert.equal(claimTimberLeagueReward({ timberLeague: {} }, { ...saved, turns: 19 }, claimDate).tier, 'bronze')
  }

  // The production start spends the selected cost in the same atomic snapshot.
  const gameSource = readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
  const configuredStart = gameSource.slice(gameSource.indexOf('const timberRoute = battleEventId'), gameSource.indexOf('const timberLeagueContinueInFlightRef'))
  assert.match(configuredStart, /battleEventId === TIMBER_LEAGUE_EVENT_ID\s*\? getTimberLeagueRoute\(\)/)
  assert.match(configuredStart, /const energyCost = timberRoute\?\.energyCost \?\? getBattleEnergyCost/)
  assert.match(configuredStart, /activeBattleEnergyCost: energyCost/)
  assert.match(configuredStart, /energyDelta: -energyCost/)
  assert.match(configuredStart, /enemyTeam: newTeam/)

  const spend = spendTimberVouchers(finalVictory.world.timberLeague, 1, 'audit-tx')
  assert.equal(spend.success, true)
  assert.equal(getTimberVoucherBalance(spend.state), 6)
  assert.equal(spendTimberVouchers(spend.state, 1, 'audit-tx').alreadySpent, true)
  assert.equal(spendTimberVouchers(spend.state, 7, 'audit-other').success, false)

  // Legacy balances and cloud merges are monotonic: no progress disappears on migration.
  const merged = mergeTimberLeagueState(
    { voucherBalance: 2, completedRewardIds: ['old:steady:bronze'] },
    { earnedVoucherIds: ['new-1'], spentVoucherIds: ['audit-tx:1'], bestScores: { '2026-09-28': { steady: { score: 9, tier: 'gold' } } } },
  )
  assert.equal(getTimberVoucherBalance(merged), 2)
  assert(merged.completedRewardIds.includes('old:steady:bronze'))
  assert(merged.earnedVoucherIds.includes('new-1'))
  assert.deepEqual(mergeTimberLeagueState({ clearedStageIds: ['steady:1:old'] }, { clearedStageIds: ['steady:1:new'] }).clearedStageIds,
    ['steady:1:old', 'steady:1:new'])
  assert.equal(normalizeTimberLeagueState(merged).version, 5)

  console.log(JSON.stringify({
    ok: true,
    checked: [
      'action, potion, voluntary and forced-switch accounting',
      'two enemy voluntary switches, persisted budget, legacy recall recovery, stale snapshots and free knockout replacements',
      'early and duplicate stage settlement guards',
      'gauntlet stage transition with HP/MP/inventory retention',
      'valid, distinct and stable rotating lineups; no enemy item action at zero potion budget',
      'party-scaled opponent levels and saved medal limits with legacy-run defaults',
      'single match, six mixed-type opponents, exact level matching and evenly repeated small-party levels',
      'atomic 2-energy start and saved opponent levels',
      '14/17-turn medal boundaries and payouts, saved 16/19, 16/21 and 14/18 limits, per-run rewards with no daily or weekly ceiling',
      'repeated claims and stale settlement guards; lineup rotation only on wins; player species and order do not change opponents',
      'legacy running battles, weekly rewards, and deferred voucher migration',
      'atomic voucher spending and duplicate transaction handling',
      'legacy save migration and monotonic cloud merge',
    ],
    trainingOpponents: getTimberLeagueNextTeam('training', 1, {}, level80Party).length,
  }, null, 2))
})
