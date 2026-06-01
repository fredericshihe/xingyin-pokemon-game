import { MOVES, MONSTERS, normalizeMovesForPokemonLevel } from './gameData'
import { getOfficialExpToNextLevel } from './officialExperience'
import { getEvolutionDueByLevel, getEvolutionTargetsAtLevel, getMovesLearnedAtLevel } from './pokemonGrowth'
import { calculateStatsForLevel } from './pokemonStats'

const asPositiveInteger = (value) => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

const eventKey = (evt) => {
  if (!evt?.monId || !evt?.type) return null
  if (evt.type === 'evolution') return `evolution:${evt.monId}:${Number(evt.targetId)}`
  if (evt.type === 'evolutionChoice') {
    const targets = Array.isArray(evt.targetOptions)
      ? evt.targetOptions.map(Number).filter(Number.isInteger).sort((a, b) => a - b)
      : []
    return targets.length ? `evolutionChoice:${evt.monId}:${targets.join(',')}` : null
  }
  if (evt.type === 'learnMove') return `learnMove:${evt.monId}:${evt.moveKey}`
  return null
}

const hasQueuedEvent = (events, candidate) => {
  const key = eventKey(candidate)
  return Boolean(key && (events || []).some((evt) => eventKey(evt) === key))
}

const dedupeGrowthEvents = (events = []) => {
  const seen = new Set()
  return (Array.isArray(events) ? events : []).filter((evt) => {
    const key = eventKey(evt)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const buildGrowthEvent = (evt, events) => {
  if (!evt?.monId || hasQueuedEvent(events, evt)) return null
  if (evt.type === 'evolution' && !asPositiveInteger(evt.targetId)) return null
  if (evt.type === 'evolutionChoice') {
    const targetOptions = [...new Set((evt.targetOptions || []).map(asPositiveInteger).filter(Boolean))]
    if (targetOptions.length < 2) return null
    return { ...evt, targetOptions }
  }
  if (evt.type === 'learnMove' && (!evt.moveKey || !MOVES[evt.moveKey])) return null
  return evt
}

const buildEvolutionEvents = ({ mon, baseMonster, level, targetIds, existingEvents }) => {
  if (!mon || !baseMonster || !Array.isArray(targetIds) || targetIds.length === 0) return []
  if (targetIds.length === 1) {
    const evt = buildGrowthEvent({
      type: 'evolution',
      monId: mon.id,
      targetId: targetIds[0],
      level,
      sourceBaseId: baseMonster.id,
    }, existingEvents)
    return evt ? [evt] : []
  }

  const evt = buildGrowthEvent({
    type: 'evolutionChoice',
    monId: mon.id,
    targetOptions: targetIds,
    level,
    sourceBaseId: baseMonster.id,
  }, existingEvents)
  return evt ? [evt] : []
}

export const resolvePokemonBaseDefinition = (mon, getBaseMonsterDefinition = null) => {
  if (!mon) return null

  const dexNo = asPositiveInteger(mon.dexNo ?? mon.pokedexId)
  if (dexNo) {
    const byDexNo = MONSTERS.find((candidate) => Number(candidate.dexNo ?? candidate.pokedexId) === dexNo)
    if (byDexNo) return byDexNo
  }

  const candidateIds = [
    mon.baseId,
    mon.speciesId,
    mon.templateId,
    mon.monsterId,
    mon.id,
  ].map(asPositiveInteger).filter(Boolean)

  for (const id of candidateIds) {
    const resolved = getBaseMonsterDefinition?.(id)
    if (resolved) return resolved
    const local = MONSTERS.find((candidate) => Number(candidate.id) === id)
    if (local) return local
  }

  return null
}

const getCurrentExp = (mon) => {
  const value = Math.trunc(Number(mon?.currentExp))
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

const getLevel = (mon) => Math.max(1, Math.min(100, Math.trunc(Number(mon?.level) || 1)))

const getExpToNextLevel = (level, baseMonster) => (
  level >= 100 ? Infinity : getOfficialExpToNextLevel(level, baseMonster)
)

const getStatSnapshot = (mon) => ({
  maxHp: Math.max(0, Math.trunc(Number(mon?.maxHp ?? mon?.stats?.hp ?? 0) || 0)),
  maxMp: Math.max(0, Math.trunc(Number(mon?.maxMp ?? 0) || 0)),
  atk: Math.max(0, Math.trunc(Number(mon?.atk ?? mon?.stats?.attack ?? 0) || 0)),
  def: Math.max(0, Math.trunc(Number(mon?.def ?? mon?.stats?.defense ?? 0) || 0)),
  spAtk: Math.max(0, Math.trunc(Number(mon?.spAtk ?? mon?.stats?.sp_attack ?? 0) || 0)),
  spDef: Math.max(0, Math.trunc(Number(mon?.spDef ?? mon?.stats?.sp_defense ?? 0) || 0)),
  spd: Math.max(0, Math.trunc(Number(mon?.spd ?? mon?.stats?.speed ?? 0) || 0)),
})

const normalizeRuntimeKnownMoveKeys = (moves = []) => {
  const seen = new Set()
  return (Array.isArray(moves) ? moves : [])
    .filter((moveKey) => {
      if (!MOVES[moveKey] || seen.has(moveKey)) return false
      seen.add(moveKey)
      return true
    })
    .slice(0, 4)
}

const getRuntimeMovesPreservingKnown = (baseMonster, moves = [], level = 1, options = {}) => {
  const knownMoves = normalizeRuntimeKnownMoveKeys(moves)
  if (knownMoves.length > 0) return knownMoves
  return normalizeMovesForPokemonLevel(baseMonster, moves, level, options)
}

const getBaseStatsForLevel = (baseMonster) => (
  baseMonster.stats
    ? {
        maxHp: baseMonster.stats.hp,
        maxMp: Math.floor((baseMonster.stats.sp_attack || 50) * 0.8) + 20,
        atk: baseMonster.stats.attack,
        def: baseMonster.stats.defense,
        spAtk: baseMonster.stats.sp_attack,
        spDef: baseMonster.stats.sp_defense,
        spd: baseMonster.stats.speed,
      }
    : {
        maxHp: baseMonster.maxHp,
        maxMp: baseMonster.maxMp,
        atk: baseMonster.atk,
        def: baseMonster.def,
        spAtk: baseMonster.spAtk,
        spDef: baseMonster.spDef,
        spd: baseMonster.spd,
      }
)

const preserveCurrentMeter = (currentValue, previousMaxValue, nextMaxValue) => {
  const nextMax = Math.max(0, Math.trunc(Number(nextMaxValue) || 0))
  if (currentValue === undefined || currentValue === null || currentValue === '') return nextMax
  const current = Number(currentValue)
  const previousMax = Number(previousMaxValue)

  if (!Number.isFinite(current)) return nextMax
  if (!Number.isFinite(previousMax) || previousMax <= 0) {
    return Math.max(0, Math.min(nextMax, Math.trunc(current)))
  }
  if (current >= previousMax) return nextMax

  const ratio = Math.max(0, Math.min(1, current / previousMax))
  return Math.max(0, Math.min(nextMax, Math.round(nextMax * ratio)))
}

const refreshMonsterStatsForLevel = (baseMonster, mon, level) => {
  const stats = calculateStatsForLevel(getBaseStatsForLevel(baseMonster), level)
  return {
    ...mon,
    ...stats,
    level,
    moves: getRuntimeMovesPreservingKnown(baseMonster, mon?.moves, level, {
      preferBalancedWhenInvalid: true,
    }),
    currentHp: preserveCurrentMeter(mon?.currentHp, mon?.maxHp, stats.maxHp),
    currentMp: preserveCurrentMeter(mon?.currentMp, mon?.maxMp, stats.maxMp),
  }
}

const buildLeveledMonster = (baseMonster, previousMon, level, currentExp) => {
  const stats = calculateStatsForLevel(getBaseStatsForLevel(baseMonster), level)

  return {
    ...baseMonster,
    ...stats,
    id: previousMon?.id,
    baseId: baseMonster.id,
    level,
    moves: getRuntimeMovesPreservingKnown(baseMonster, previousMon?.moves, level, { backfill: false }),
    currentHp: stats.maxHp,
    currentMp: stats.maxMp,
    currentExp: level >= 100 ? 0 : currentExp,
    expToNextLevel: getExpToNextLevel(level, baseMonster),
  }
}

export const simulateMonsterExpGain = (
  mon,
  xpAmount,
  getBaseMonsterDefinition = null,
  existingPendingEvents = []
) => {
  if (!mon) return { updatedMon: mon, events: [], levelUps: [] }

  const level = getLevel(mon)
  const safeXpAmount = Math.max(0, Math.trunc(Number(xpAmount) || 0))
  const baseMonster = resolvePokemonBaseDefinition(mon, getBaseMonsterDefinition)
  if (!baseMonster) {
    return { updatedMon: mon, events: [], levelUps: [] }
  }

  const normalizedExpToNext = getExpToNextLevel(level, baseMonster)
  const currentExp = getCurrentExp(mon)
  const refreshedMon = refreshMonsterStatsForLevel(baseMonster, mon, level)
  const hasExistingOverflow = level < 100 && Number.isFinite(normalizedExpToNext) && currentExp >= normalizedExpToNext
  const dueEvolution = level < 100 ? getEvolutionDueByLevel(baseMonster, level) : null
  const dueEvolutionEvents = dueEvolution
    ? buildEvolutionEvents({
        mon,
        baseMonster,
        level: dueEvolution.level,
        targetIds: dueEvolution.targetIds,
        existingEvents: existingPendingEvents,
      })
    : []
  if (safeXpAmount <= 0 && !hasExistingOverflow) {
    return {
      updatedMon: {
        ...refreshedMon,
        level,
        currentExp,
        expToNextLevel: normalizedExpToNext,
      },
      events: dueEvolutionEvents,
      levelUps: [],
    }
  }
  if (level >= 100) {
    return {
      updatedMon: {
        ...refreshedMon,
        level: 100,
        currentExp: 0,
        expToNextLevel: Infinity,
      },
      events: [],
      levelUps: [],
    }
  }

  let growthBase = baseMonster
  let updatedMon = {
    ...refreshedMon,
    level,
    currentExp: currentExp + safeXpAmount,
    expToNextLevel: normalizedExpToNext,
  }
  const existingMoves = new Set(Array.isArray(refreshedMon.moves) ? refreshedMon.moves : [])
  const queuedLearnMoves = new Set()
  const events = [...dueEvolutionEvents]
  const levelUps = []
  if (dueEvolution?.targetIds.length === 1) {
    const evolvedBase = resolvePokemonBaseDefinition({ baseId: dueEvolution.targetIds[0] }, getBaseMonsterDefinition)
    if (evolvedBase) growthBase = evolvedBase
  }

  // 安全计数器：防止无限循环导致浏览器卡死
  let safetyCounter = 0
  const MAX_LEVEL_UPS_PER_GAIN = 50

  while (
    updatedMon.level < 100 &&
    Number.isFinite(updatedMon.expToNextLevel) &&
    updatedMon.currentExp >= updatedMon.expToNextLevel &&
    safetyCounter < MAX_LEVEL_UPS_PER_GAIN
  ) {
    safetyCounter++

    const prevLevel = updatedMon.level
    const beforeStats = getStatSnapshot(updatedMon)
    const newLevel = prevLevel + 1
    const nextExp = updatedMon.currentExp - updatedMon.expToNextLevel

    // 额外保护：检查 nextExp 是否异常
    if (!Number.isFinite(nextExp) || nextExp < 0) {
      console.error('[CRITICAL] Invalid nextExp detected', {
        level: prevLevel,
        currentExp: updatedMon.currentExp,
        expToNextLevel: updatedMon.expToNextLevel,
        nextExp
      })
      break
    }

    updatedMon = buildLeveledMonster(baseMonster, updatedMon, newLevel, nextExp)

    // 验证升级后的数据
    if (!Number.isFinite(updatedMon.expToNextLevel) || updatedMon.expToNextLevel <= 0) {
      console.error('[CRITICAL] Invalid expToNextLevel after level up', {
        level: newLevel,
        expToNextLevel: updatedMon.expToNextLevel
      })
      updatedMon.expToNextLevel = 1
      break
    }

    levelUps.push({
      monId: mon.id,
      name: updatedMon.name,
      sprite: updatedMon.sprite,
      fromLevel: prevLevel,
      toLevel: newLevel,
      beforeStats,
      afterStats: getStatSnapshot(updatedMon),
    })

    const queueContext = [...existingPendingEvents, ...events]
    const evoTargetIds = getEvolutionTargetsAtLevel(growthBase, newLevel)
    events.push(...buildEvolutionEvents({
      mon,
      baseMonster: growthBase,
      level: newLevel,
      targetIds: evoTargetIds,
      existingEvents: queueContext,
    }))

    for (const moveKey of getMovesLearnedAtLevel(growthBase, newLevel)) {
      if (existingMoves.has(moveKey) || queuedLearnMoves.has(moveKey)) continue
      const evt = buildGrowthEvent({
        type: 'learnMove',
        monId: mon.id,
        moveKey,
        level: newLevel,
        sourceBaseId: growthBase.id,
      }, [...existingPendingEvents, ...events])
      if (evt) {
        events.push(evt)
        queuedLearnMoves.add(moveKey)
      }
    }

    const evoId = evoTargetIds[0] ?? null
    if (evoTargetIds.length === 1 && evoId) {
      const evolvedBase = resolvePokemonBaseDefinition({ baseId: evoId }, getBaseMonsterDefinition)
      if (evolvedBase) growthBase = evolvedBase
    }
  }

  // 如果触发安全限制，记录错误
  if (safetyCounter >= MAX_LEVEL_UPS_PER_GAIN) {
    console.error('[CRITICAL] Level up loop safety limit reached', {
      monId: mon.id,
      monName: mon.name,
      finalLevel: updatedMon.level,
      xpAmount,
      safetyCounter
    })
  }

  return { updatedMon, events, levelUps }
}

export const normalizeRosterExpProgress = ({
  playerTeam = [],
  storageBox = [],
  activePlayerId = null,
  pendingGrowthEvents = [],
  getBaseMonsterDefinition = null,
} = {}) => {
  const baseEvents = dedupeGrowthEvents(pendingGrowthEvents)
  const newEvents = []
  const levelUps = []
  const playerTeamResult = (Array.isArray(playerTeam) ? playerTeam : []).map((mon) => {
    const result = simulateMonsterExpGain(mon, 0, getBaseMonsterDefinition, [...baseEvents, ...newEvents])
    newEvents.push(...result.events)
    levelUps.push(...result.levelUps)
    return result.updatedMon
  })

  const storageBoxResult = (Array.isArray(storageBox) ? storageBox : []).map((mon) => (
    simulateMonsterExpGain(mon, 0, getBaseMonsterDefinition, baseEvents).updatedMon
  ))

  return {
    playerTeam: playerTeamResult,
    storageBox: storageBoxResult,
    activePlayerId: playerTeamResult.some((mon) => mon.id === activePlayerId)
      ? activePlayerId
      : playerTeamResult[0]?.id ?? null,
    pendingGrowthEvents: dedupeGrowthEvents([...baseEvents, ...newEvents]),
    levelUps,
  }
}

export const findExpOverflowMonsters = (monsters = []) => (
  (Array.isArray(monsters) ? monsters : []).filter((mon) => {
    const level = getLevel(mon)
    const baseMonster = resolvePokemonBaseDefinition(mon)
    const expToNextLevel = getExpToNextLevel(level, baseMonster || mon)
    return level < 100 && Number.isFinite(expToNextLevel) && getCurrentExp(mon) >= expToNextLevel
  })
)
