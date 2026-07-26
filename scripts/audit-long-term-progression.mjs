import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ADVENTURE_CHAPTERS,
  CHAMPION_TOWER_FLOORS,
  CHAMPION_TOWER_WEEKLY_REWARD,
  ELITE_UNLOCK_TASKS,
  MAP_COMPLETION_THRESHOLDS,
  getChampionTowerWeeklyFloor,
  getEliteUnlockObjectiveEvents,
  getMapCompletionRewardDefinition
} from '../src/game/data/longTermProgression.js'
import {
  appendCompletionRewardClaim,
  appendTowerWeeklyRewardClaim,
  completeEliteUnlockObjective,
  completeEliteUnlockTask,
  getCompletionRewardClaimId,
  getEliteUnlockTaskProgress,
  getPokemonSpeciesKey,
  getTowerNextFloor,
  getTowerWeeklyRewardClaimId,
  hasClaimedCompletionReward,
  hasClaimedTowerWeeklyReward,
  mergeLongTermWorldProgress,
  migrateLegacyLongTermProgress,
  normalizeLongTermWorldProgress,
  recordChampionTowerFloorVictory,
  registerPokemonSpecies
} from '../src/utils/longTermProgression.js'
import { GODOT_REGION_MAP_IDS, GODOT_REGION_MAPS } from '../src/game/data/godotMaps/godot_region_maps.js'
import { BLOCKED_LEGACY_TILES } from '../src/game/world/constants.js'

const checks = []
const check = (name, callback) => {
  callback()
  checks.push(name)
}

check('production rollout is opt-in and preserves the previous map content version while disabled', () => {
  const catalogSource = readFileSync(new URL('../src/game/data/longTermProgression.js', import.meta.url), 'utf8')
  const gameSource = readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
  assert.match(catalogSource, /if \(configuredValue === 'false'\) return false/)
  assert.match(catalogSource, /import\.meta\.env\?\.DEV === true \|\| configuredValue === 'true'/)
  assert.match(gameSource, /\? 46 : 45/)
  assert.match(gameSource, /LONG_TERM_PROGRESSION_FLAGS\.mapProgressV1 \? \(\) => handleNavigateView\('adventureProgress'\) : null/)
  assert.match(gameSource, /permanentDexEnabled=\{LONG_TERM_PROGRESSION_FLAGS\.permanentDexV1\}/)
})

check('chapter catalog has a stable 14-map sequence', () => {
  assert.equal(ADVENTURE_CHAPTERS.length, 14)
  ADVENTURE_CHAPTERS.forEach((entry, index) => assert.equal(entry.chapter, index + 1))
  assert.equal(ADVENTURE_CHAPTERS[13].mapId, 'GodotMapV2_ChampionTower')
})

check('all completion reward definitions use fixed thresholds and valid quantities', () => {
  ADVENTURE_CHAPTERS.forEach(({ mapId }) => {
    MAP_COMPLETION_THRESHOLDS.forEach((threshold) => {
      const definition = getMapCompletionRewardDefinition(mapId, threshold)
      assert.ok(definition)
      assert.equal(definition.threshold, threshold)
      assert.ok(definition.items.length > 0)
      definition.items.forEach((item) => {
        assert.ok(item.itemType)
        assert.ok(item.itemKey)
        assert.ok(Number.isSafeInteger(item.quantity) && item.quantity > 0)
      })
    })
  })
})

check('elite objective ids and positions are unique per map', () => {
  assert.equal(ELITE_UNLOCK_TASKS.length, 13)
  const taskIds = new Set()
  const stepIds = new Set()
  const eventIds = new Set()
  ELITE_UNLOCK_TASKS.forEach((task) => {
    assert.ok(!taskIds.has(task.id), `duplicate task id ${task.id}`)
    taskIds.add(task.id)
    task.steps.forEach((step) => {
      assert.ok(!stepIds.has(step.id), `duplicate step id ${step.id}`)
      assert.ok(!eventIds.has(step.eventId), `duplicate event id ${step.eventId}`)
      stepIds.add(step.id)
      eventIds.add(step.eventId)
    })
  })
  const byMap = new Map()
  Array.from(new Set(ELITE_UNLOCK_TASKS.map((task) => task.mapId))).forEach((mapId) => {
    const keys = byMap.get(mapId) || new Set()
    getEliteUnlockObjectiveEvents(mapId).forEach((event) => {
      const positionKey = `${event.position.x},${event.position.y}`
      assert.ok(!keys.has(positionKey), `duplicate objective position ${mapId}:${positionKey}`)
      keys.add(positionKey)
    })
    byMap.set(mapId, keys)
  })
})

check('all lieutenant and Elite Four boss gates use distinct, bounded and solvable mini-game rules', () => {
  const lieutenantTasks = ELITE_UNLOCK_TASKS.filter((task) => task.targetEventId.includes('_lieutenant_'))
  const bossTasks = ELITE_UNLOCK_TASKS.filter((task) => task.targetEventId.includes('_boss'))
  assert.equal(lieutenantTasks.length, 9)
  assert.equal(bossTasks.length, 4)
  assert.equal(new Set(lieutenantTasks.map((task) => task.minigame?.kind)).size, 9)
  lieutenantTasks.forEach((task) => {
    assert.ok(task.minigame?.kind, `${task.id} missing mini-game kind`)
    assert.ok(task.minigame?.label, `${task.id} missing mini-game label`)
    assert.ok(task.minigame?.skill, `${task.id} missing skill description`)
    assert.ok(task.minigame?.guide?.goal, `${task.id} missing child-readable goal`)
    assert.ok(task.minigame?.guide?.action, `${task.id} missing child-readable action guide`)
    const childCopy = `${task.description} ${task.minigame.guide.goal} ${task.minigame.guide.action}`
    assert.doesNotMatch(childCopy, /(?:惯性|复现|谐振|演绎|推演|校准)/, `${task.id} contains unexplained jargon`)
  })
  assert.equal(new Set(bossTasks.map((task) => task.minigame?.kind)).size, 4)
  const lieutenantKinds = new Set(lieutenantTasks.map((task) => task.minigame.kind))
  bossTasks.forEach((task) => {
    assert.ok(task.minigame?.kind, `${task.id} missing boss puzzle kind`)
    assert.ok(task.minigame?.label, `${task.id} missing boss puzzle label`)
    assert.ok(task.minigame?.skill, `${task.id} missing boss puzzle skill description`)
    assert.ok(task.minigame?.guide?.goal, `${task.id} missing boss puzzle goal`)
    assert.ok(task.minigame?.guide?.action, `${task.id} missing boss puzzle action guide`)
    assert.equal(lieutenantKinds.has(task.minigame.kind), false, `${task.id} reuses a lieutenant puzzle kind`)
  })

  const pressure = lieutenantTasks.find((task) => task.minigame.kind === 'pressure_balance').minigame
  let states = [{ pressure: pressure.start, hold: 0 }]
  let solved = false
  for (let move = 0; move < pressure.maxMoves && !solved; move += 1) {
    const nextStates = []
    states.forEach((state) => {
      ;[pressure.intake, 0, pressure.release].forEach((delta) => {
        const nextPressure = Math.max(0, Math.min(100, state.pressure + delta + pressure.drift[move % pressure.drift.length]))
        const nextHold = Math.abs(nextPressure - pressure.target) <= pressure.tolerance ? state.hold + 1 : 0
        if (nextHold >= pressure.holdRounds) solved = true
        nextStates.push({ pressure: nextPressure, hold: nextHold })
      })
    })
    states = nextStates
  }
  assert.equal(solved, true, 'pressure mini-game must have a reachable stable sequence')

  for (const kind of ['vortex_rotation', 'circuit_rotation', 'resonance_tuning']) {
    const rules = lieutenantTasks.find((task) => task.minigame.kind === kind).minigame
    const modulus = kind === 'resonance_tuning' ? rules.levels : 4
    const minimumMoves = rules.start.reduce((total, value, index) => total + ((rules.target[index] - value + modulus) % modulus), 0)
    assert.ok(minimumMoves <= rules.maxMoves, `${kind} cannot reach its target within the move limit`)
  }
  const sonar = lieutenantTasks.find((task) => task.minigame.kind === 'sonar_memory').minigame
  assert.equal(sonar.pattern.length, 5)
  assert.ok(sonar.maxMistakes >= 2, 'sonar must allow a primary-school player to retry')

  const forge = lieutenantTasks.find((task) => task.minigame.kind === 'forge_rhythm').minigame
  assert.ok(forge.cycleMs >= 3000, 'forge cursor must move slowly enough for younger players')
  assert.ok(forge.tolerance >= 0.14, 'forge target area must be visibly wide enough')
  assert.ok(forge.maxMisses >= 3, 'forge must provide at least three retry chances')

  const circuit = lieutenantTasks.find((task) => task.minigame.kind === 'circuit_rotation').minigame
  assert.deepEqual([...circuit.pathOrder].sort((left, right) => left - right), circuit.target.map((_, index) => index))

  const armor = lieutenantTasks.find((task) => task.minigame.kind === 'armor_distribution').minigame
  assert.equal(armor.plates.reduce((sum, value) => sum + value, 0), armor.capacities.reduce((sum, value) => sum + value, 0))
  const armorSolution = Array.from({ length: armor.capacities.length ** armor.plates.length }, (_, encoded) => {
    let value = encoded
    return armor.plates.map(() => {
      const wall = value % armor.capacities.length
      value = Math.floor(value / armor.capacities.length)
      return wall
    })
  }).find((assignments) => armor.capacities.every((capacity, wall) => (
    armor.plates.reduce((sum, plate, index) => sum + (assignments[index] === wall ? plate : 0), 0) === capacity
  )))
  assert.ok(armorSolution, 'armor distribution must have at least one exact assignment')

  const star = lieutenantTasks.find((task) => task.minigame.kind === 'constellation_path').minigame
  star.path.slice(1).forEach((node, index) => assert.ok(star.edges.some(([a, b]) => (a === star.path[index] && b === node) || (b === star.path[index] && a === node))))
  assert.ok(star.maxMistakes >= 3, 'star path must provide three visible retry chances')

  const rune = lieutenantTasks.find((task) => task.minigame.kind === 'rune_code').minigame
  assert.equal(rune.target.length, 3, 'rune code must use three slots for primary-school readability')
  assert.equal(new Set(rune.target).size, rune.target.length)
  assert.ok(rune.runes.length > rune.target.length)
  assert.ok(rune.maxAttempts >= 6)

  const lights = bossTasks.find((task) => task.minigame.kind === 'lights_out').minigame
  const lightsTarget = Array(lights.start.length).fill(lights.target)
  const lightQueue = [[lights.start, 0]]
  const lightSeen = new Set([lights.start.map(Number).join('')])
  let lightMinimumMoves = null
  for (let cursor = 0; cursor < lightQueue.length && lightMinimumMoves === null; cursor += 1) {
    const [state, moves] = lightQueue[cursor]
    if (state.every((value, index) => value === lightsTarget[index])) {
      lightMinimumMoves = moves
      break
    }
    if (moves >= lights.maxMoves) continue
    state.forEach((_, index) => {
      const x = index % lights.size
      const y = Math.floor(index / lights.size)
      const affected = new Set([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => [x + dx, y + dy])
        .filter(([nextX, nextY]) => nextX >= 0 && nextX < lights.size && nextY >= 0 && nextY < lights.size)
        .map(([nextX, nextY]) => nextY * lights.size + nextX))
      const next = state.map((value, lightIndex) => affected.has(lightIndex) ? !value : value)
      const key = next.map(Number).join('')
      if (!lightSeen.has(key)) {
        lightSeen.add(key)
        lightQueue.push([next, moves + 1])
      }
    })
  }
  assert.ok(lightMinimumMoves !== null && lightMinimumMoves <= lights.maxMoves, 'lights-out boss puzzle must be solvable within its move limit')

  const water = bossTasks.find((task) => task.minigame.kind === 'water_sort').minigame
  const waterKey = (tubes) => tubes.map((tube) => tube.join(',')).join('|')
  const waterQueue = [[water.tubes.map((tube) => [...tube]), 0]]
  const waterSeen = new Set([waterKey(water.tubes)])
  let waterMinimumMoves = null
  for (let cursor = 0; cursor < waterQueue.length && waterMinimumMoves === null; cursor += 1) {
    const [tubes, moves] = waterQueue[cursor]
    if (tubes.every((tube) => tube.length === 0 || (tube.length === water.capacity && tube.every((value) => value === tube[0])))) {
      waterMinimumMoves = moves
      break
    }
    if (moves >= water.maxMoves) continue
    tubes.forEach((source, sourceIndex) => {
      if (source.length === 0) return
      const color = source.at(-1)
      let sameColorCount = 1
      while (sameColorCount < source.length && source[source.length - 1 - sameColorCount] === color) sameColorCount += 1
      tubes.forEach((target, targetIndex) => {
        if (sourceIndex === targetIndex || target.length >= water.capacity || (target.length > 0 && target.at(-1) !== color)) return
        const next = tubes.map((tube) => [...tube])
        const amount = Math.min(sameColorCount, water.capacity - target.length)
        next[targetIndex].push(...next[sourceIndex].splice(next[sourceIndex].length - amount, amount))
        const key = waterKey(next)
        if (!waterSeen.has(key)) {
          waterSeen.add(key)
          waterQueue.push([next, moves + 1])
        }
      })
    })
  }
  assert.ok(waterMinimumMoves !== null && waterMinimumMoves <= water.maxMoves, 'water-sort boss puzzle must be solvable within its move limit')

  const sliding = bossTasks.find((task) => task.minigame.kind === 'sliding_tiles').minigame
  const slideQueue = [[sliding.start, 0]]
  const slideSeen = new Set([sliding.start.join(',')])
  let slideMinimumMoves = null
  for (let cursor = 0; cursor < slideQueue.length && slideMinimumMoves === null; cursor += 1) {
    const [tiles, moves] = slideQueue[cursor]
    if (tiles.every((value, index) => value === sliding.target[index])) {
      slideMinimumMoves = moves
      break
    }
    if (moves >= sliding.maxMoves) continue
    const empty = tiles.indexOf(0)
    const emptyX = empty % sliding.size
    const emptyY = Math.floor(empty / sliding.size)
    ;[[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const x = emptyX + dx
      const y = emptyY + dy
      if (x < 0 || x >= sliding.size || y < 0 || y >= sliding.size) return
      const index = y * sliding.size + x
      const next = [...tiles]
      ;[next[empty], next[index]] = [next[index], next[empty]]
      const key = next.join(',')
      if (!slideSeen.has(key)) {
        slideSeen.add(key)
        slideQueue.push([next, moves + 1])
      }
    })
  }
  assert.ok(slideMinimumMoves !== null && slideMinimumMoves <= sliding.maxMoves, 'sliding-tile boss puzzle must be solvable within its move limit')

  const hanoi = bossTasks.find((task) => task.minigame.kind === 'tower_hanoi').minigame
  assert.ok((2 ** hanoi.discs) - 1 <= hanoi.maxMoves, 'tower-of-hanoi boss puzzle must allow the optimal solution')
})

check('permanent dex registration is monotonic and distinguishes wild capture', () => {
  const pokemon = { id: 999, baseId: 25, pokedexId: 25, name: '测试宝可梦' }
  assert.equal(getPokemonSpeciesKey(pokemon), 'dex:25')
  const registered = registerPokemonSpecies({}, pokemon)
  assert.deepEqual(registered.dexProgress.registeredSpeciesKeys, ['dex:25'])
  assert.deepEqual(registered.dexProgress.wildCapturedSpeciesKeys, [])
  const captured = registerPokemonSpecies(registered, pokemon, { wildCaptured: true })
  assert.deepEqual(captured.dexProgress.registeredSpeciesKeys, ['dex:25'])
  assert.deepEqual(captured.dexProgress.wildCapturedSpeciesKeys, ['dex:25'])
})

check('legacy roster migration never removes existing dex facts', () => {
  const migrated = migrateLegacyLongTermProgress({
    dexProgress: { registeredSpeciesKeys: ['dex:1'], wildCapturedSpeciesKeys: ['dex:1'] }
  }, {
    playerTeam: [{ id: 101, baseId: 4, pokedexId: 4 }],
    storageBox: [{ id: 102, baseId: 7, pokedexId: 7 }]
  })
  assert.deepEqual(migrated.dexProgress.registeredSpeciesKeys.sort(), ['dex:1', 'dex:4', 'dex:7'])
  assert.deepEqual(migrated.dexProgress.wildCapturedSpeciesKeys, ['dex:1'])
})

check('legacy players are grandfathered through every gate already passed', () => {
  const migrated = migrateLegacyLongTermProgress({
    defeatedTrainerIds: ['elite_tide_lieutenant_2']
  }, { currentMapName: 'GodotMapV2_TideDojo' })
  assert.ok(migrated.completedUnlockTaskIds.includes('tide_dual_pressure'))
  assert.ok(migrated.completedUnlockTaskIds.includes('tide_current_observation'))
  assert.ok(!migrated.completedUnlockTaskIds.includes('tide_vortex_stability'))

  const laterChapter = migrateLegacyLongTermProgress({}, { currentMapName: 'GodotMapV2_DragonDojo' })
  assert.ok(laterChapter.completedUnlockTaskIds.includes('tide_oath'))
  assert.ok(laterChapter.completedUnlockTaskIds.includes('iron_crown_core'))
  assert.ok(!laterChapter.completedUnlockTaskIds.includes('dragon_oath'))
})

check('ordered objectives reject skipping and complete without resetting progress', () => {
  let world = normalizeLongTermWorldProgress({
    completedUnlockTaskIds: ['tide_dual_pressure'],
    completedUnlockTaskStepIds: ['tide_dual_pressure:west', 'tide_dual_pressure:east'],
    defeatedTrainerIds: ['elite_tide_lieutenant_1']
  })
  const skipped = completeEliteUnlockObjective(world, 'GodotMapV2_TideDojo', 'objective_tide_current_observation_middle')
  assert.equal(skipped.status, 'out_of_order')
  assert.equal(skipped.world.completedUnlockTaskStepIds.length, 2)

  for (const suffix of ['outer', 'middle', 'upper']) {
    const result = completeEliteUnlockObjective(world, 'GodotMapV2_TideDojo', `objective_tide_current_observation_${suffix}`)
    assert.equal(result.success, true)
    world = result.world
  }
  const progress = getEliteUnlockTaskProgress(world, 'tide_current_observation')
  assert.equal(progress.completed, true)
  assert.equal(progress.completedStepCount, 3)
})

check('mini-game completion is atomic, idempotent and preserves v1 partial facts', () => {
  const v1World = normalizeLongTermWorldProgress({
    unlockTaskMigrationVersion: 1,
    completedUnlockTaskStepIds: ['tide_dual_pressure:west'],
    defeatedTrainerIds: []
  })
  const migrated = migrateLegacyLongTermProgress(v1World, { currentMapName: 'GodotMapV2_TideDojo' })
  assert.ok(migrated.completedUnlockTaskStepIds.includes('tide_dual_pressure:west'))
  const completed = completeEliteUnlockTask(migrated, 'GodotMapV2_TideDojo', 'tide_dual_pressure')
  assert.equal(completed.success, true)
  assert.equal(completed.status, 'task_complete')
  assert.ok(completed.world.completedUnlockTaskStepIds.includes('tide_dual_pressure:west'))
  assert.ok(completed.world.completedUnlockTaskStepIds.includes('tide_dual_pressure:east'))
  assert.ok(completed.world.completedUnlockTaskIds.includes('tide_dual_pressure'))
  const repeated = completeEliteUnlockTask(completed.world, 'GodotMapV2_TideDojo', 'tide_dual_pressure')
  assert.equal(repeated.status, 'already_complete')
  assert.equal(repeated.world.completedUnlockTaskIds.filter((id) => id === 'tide_dual_pressure').length, 1)
})

check('monotonic merge preserves both devices and maximum tower records', () => {
  const merged = mergeLongTermWorldProgress({
    dexProgress: { registeredSpeciesKeys: ['dex:1'] },
    completedUnlockTaskIds: ['a'],
    completionRewardClaimIds: ['reward:a'],
    championTower: { highestStoryFloor: 4, bestWinStreak: 4 }
  }, {
    dexProgress: { registeredSpeciesKeys: ['dex:4'], wildCapturedSpeciesKeys: ['dex:4'] },
    completedUnlockTaskIds: ['b'],
    completionRewardClaimIds: ['reward:b'],
    championTower: { highestStoryFloor: 7, bestWinStreak: 6 }
  })
  assert.deepEqual(merged.dexProgress.registeredSpeciesKeys.sort(), ['dex:1', 'dex:4'])
  assert.deepEqual(merged.completedUnlockTaskIds.sort(), ['a', 'b'])
  assert.deepEqual(merged.completionRewardClaimIds.sort(), ['reward:a', 'reward:b'])
  assert.equal(merged.championTower.highestStoryFloor, 7)
  assert.equal(merged.championTower.bestWinStreak, 6)
})

check('completion reward claims are idempotent facts', () => {
  const world = appendCompletionRewardClaim({}, 'GodotMap', 25)
  const twice = appendCompletionRewardClaim(world, 'GodotMap', 25)
  assert.equal(twice.completionRewardClaimIds.length, 1)
  assert.equal(twice.completionRewardClaimIds[0], getCompletionRewardClaimId('GodotMap', 25))
  assert.equal(hasClaimedCompletionReward(twice, 'GodotMap', 25), true)
})

check('tower story progression is persistent and unlocks weekly mode after floor ten', () => {
  assert.equal(CHAMPION_TOWER_FLOORS.length, 10)
  let world = normalizeLongTermWorldProgress({})
  for (let floor = 1; floor <= 10; floor += 1) {
    world = recordChampionTowerFloorVictory(world, floor, {
      seasonKey: '2026-W30',
      completedAt: '2026-07-20T00:00:00.000Z'
    })
  }
  assert.equal(world.championTower.highestStoryFloor, 10)
  assert.equal(world.championTower.championTrophyEarned, true)
  assert.equal(getTowerNextFloor(world, '2026-W30'), 1)
  const weeklyFloorOne = recordChampionTowerFloorVictory(world, 1, { seasonKey: '2026-W30' })
  assert.equal(weeklyFloorOne.championTower.weekly.highestFloor, 1)
  assert.equal(getTowerNextFloor(weeklyFloorOne, '2026-W30'), 2)
})

check('champion tower is the final connected map and its arena is reachable', () => {
  assert.equal(GODOT_REGION_MAP_IDS.length, 13)
  assert.equal(GODOT_REGION_MAP_IDS.at(-1), 'GodotMapV2_ChampionTower')
  const dragonMap = GODOT_REGION_MAPS.GodotMapV2_DragonDojo
  const towerMap = GODOT_REGION_MAPS.GodotMapV2_ChampionTower
  assert.ok(dragonMap.runtimeEvents.some((event) => event.id === 'warp_dragon_to_champion_tower' && event.target?.mapName === towerMap.id))
  assert.ok(towerMap.runtimeEvents.some((event) => event.id === 'warp_champion_tower_to_dragon' && event.target?.mapName === dragonMap.id))
  assert.ok(towerMap.runtimeEvents.some((event) => event.type === 'heal'))
  assert.ok(towerMap.runtimeEvents.some((event) => event.type === 'fast_travel'))
  const challenge = towerMap.runtimeEvents.find((event) => event.id === 'champion_tower_trial')
  assert.equal(challenge?.properties?.towerChallenge, true)

  const targetKeys = new Set([
    `${challenge.position.x},${challenge.position.y}`,
    `${challenge.position.x + 1},${challenge.position.y}`,
    `${challenge.position.x - 1},${challenge.position.y}`,
    `${challenge.position.x},${challenge.position.y + 1}`,
    `${challenge.position.x},${challenge.position.y - 1}`
  ])
  const start = towerMap.startPosition
  const visited = new Set([`${start.x},${start.y}`])
  const queue = [{ x: start.x, y: start.y }]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor]
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = point.x + dx
      const y = point.y + dy
      const key = `${x},${y}`
      if (visited.has(key) || y < 0 || y >= towerMap.mapGrid.length || x < 0 || x >= towerMap.mapGrid[0].length) continue
      if (BLOCKED_LEGACY_TILES.has(towerMap.mapGrid[y][x])) continue
      visited.add(key)
      queue.push({ x, y })
    }
  }
  assert.ok(Array.from(targetKeys).some((key) => visited.has(key)), 'tower challenge has no reachable approach tile')
})

check('all ten tower teams are valid fixed-level rosters', () => {
  CHAMPION_TOWER_FLOORS.forEach((floor, index) => {
    assert.equal(floor.floor, index + 1)
    assert.equal(floor.team.length, floor.floor <= 3 ? 3 : floor.floor <= 6 ? 4 : floor.floor <= 9 ? 5 : 6)
    floor.team.forEach((member) => {
      assert.ok(Number.isSafeInteger(member.pokemonId) && member.pokemonId > 0)
      assert.ok(Number.isSafeInteger(member.level) && member.level >= 1 && member.level <= 100)
    })
  })
})

check('weekly tower rosters are deterministic within a week and rotate across weeks', () => {
  CHAMPION_TOWER_FLOORS.forEach((floor) => {
    const firstRead = getChampionTowerWeeklyFloor(floor.floor, '2026-W30')
    const secondRead = getChampionTowerWeeklyFloor(floor.floor, '2026-W30')
    const nextWeek = getChampionTowerWeeklyFloor(floor.floor, '2026-W31')
    assert.deepEqual(firstRead.team, secondRead.team)
    assert.equal(firstRead.team.length, floor.team.length)
    assert.deepEqual(firstRead.team.map((member) => member.level), floor.team.map((member) => member.level))
    assert.notDeepEqual(firstRead.team.map((member) => member.pokemonId), nextWeek.team.map((member) => member.pokemonId))
  })
})

check('weekly tower reward claim is season-scoped and idempotent', () => {
  const seasonKey = '2026-W30'
  let world = normalizeLongTermWorldProgress({
    championTower: {
      highestStoryFloor: 10,
      weekly: { seasonKey, highestFloor: 10, rewardClaimed: false }
    }
  })
  world = appendTowerWeeklyRewardClaim(world, seasonKey)
  world = appendTowerWeeklyRewardClaim(world, seasonKey)
  assert.equal(hasClaimedTowerWeeklyReward(world, seasonKey), true)
  assert.equal(world.completionRewardClaimIds.filter((id) => id === getTowerWeeklyRewardClaimId(seasonKey)).length, 1)
  assert.ok(CHAMPION_TOWER_WEEKLY_REWARD.length > 0)
})

check('dedicated reward RPC owns the catalog, row lock and idempotent claim transaction', () => {
  const migrationSource = readFileSync(new URL('../supabase/migrations/202607210001_claim_long_term_progression_rewards.sql', import.meta.url), 'utf8')
  const gameSource = readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
  const integrationAuditSource = readFileSync(new URL('./audit-long-term-reward-claim.sql', import.meta.url), 'utf8')
  const concurrencyAuditSource = readFileSync(new URL('./audit-long-term-reward-concurrency.mjs', import.meta.url), 'utf8')

  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION claim_long_term_progression_reward/)
  assert.match(migrationSource, /FROM game_saves gs[\s\S]*FOR UPDATE/)
  assert.match(migrationSource, /IF v_claim_ids \? v_claim_id THEN[\s\S]*v_claim_id, v_reward_items, TRUE;/)
  assert.match(migrationSource, /merge_long_term_reward_inventory\(v_game_data -> 'playerInventory', v_reward_items\)/)
  assert.match(migrationSource, /v_next_revision := v_revision \+ 1/)
  assert.match(migrationSource, /student_playtime_lease_is_valid\(p_user_id, p_playtime_session_id, TRUE\)/)
  assert.match(gameSource, /supabase\.rpc\('claim_long_term_progression_reward'/)
  assert.match(gameSource, /p_expected_revision: expectedRevision/)
  assert.match(gameSource, /saveRow\?\.already_claimed === true/)
  assert.doesNotMatch(gameSource, /appendCompletionRewardClaim\(baseWorld/)
  assert.doesNotMatch(gameSource, /appendTowerWeeklyRewardClaim\(baseWorld/)

  ADVENTURE_CHAPTERS.forEach(({ mapId }) => {
    MAP_COMPLETION_THRESHOLDS.forEach((threshold) => {
      const definition = getMapCompletionRewardDefinition(mapId, threshold)
      assert.ok(
        migrationSource.includes(JSON.stringify(definition.items)),
        `server reward catalog drifted for ${mapId}:${threshold}`
      )
    })
  })
  assert.ok(migrationSource.includes(JSON.stringify(CHAMPION_TOWER_WEEKLY_REWARD)))

  assert.match(integrationAuditSource, /A second device still holding revision 1/)
  assert.match(integrationAuditSource, /Idempotent retry duplicated the map reward/)
  assert.match(integrationAuditSource, /A stale device claimed a different reward/)
  assert.match(integrationAuditSource, /Weekly reward retry was not idempotent/)
  assert.match(integrationAuditSource, /ROLLBACK;/)
  assert.match(concurrencyAuditSource, /LONG_TERM_REWARD_AUDIT_ALLOW === 'local-only'/)
  assert.match(concurrencyAuditSource, /Refusing to run against non-local PostgreSQL server/)
  assert.match(concurrencyAuditSource, /await Promise\.all\(\[/)
  assert.match(concurrencyAuditSource, /two simultaneous identical claims grant exactly once/)
})

console.log(JSON.stringify({
  ok: true,
  summary: {
    checkCount: checks.length,
    chapterCount: ADVENTURE_CHAPTERS.length,
    eliteTaskCount: ELITE_UNLOCK_TASKS.length,
    eliteStepCount: ELITE_UNLOCK_TASKS.reduce((sum, task) => sum + task.steps.length, 0),
    towerFloorCount: CHAMPION_TOWER_FLOORS.length
  },
  checks
}, null, 2))
