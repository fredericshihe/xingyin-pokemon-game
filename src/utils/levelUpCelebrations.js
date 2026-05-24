const toLevelNumber = (value) => {
  const level = Number(value)
  return Number.isFinite(level) ? level : null
}

const getLevelUpOwnerKey = (levelUp, fallbackIndex = 0) => {
  if (levelUp?.monId) return `id:${levelUp.monId}`
  if (levelUp?.id) return `id:${levelUp.id}`
  if (levelUp?.name) return `name:${levelUp.name}`
  return `entry:${fallbackIndex}`
}

const getLevelUpRangeKey = (ownerKey, fromLevel, toLevel) => (
  `${ownerKey || 'unknown'}:${toLevelNumber(fromLevel) ?? 'from'}:${toLevelNumber(toLevel) ?? 'to'}`
)

const getLevelUpGain = (fromLevel, toLevel, fallbackCount = 1) => {
  const from = toLevelNumber(fromLevel)
  const to = toLevelNumber(toLevel)
  if (from !== null && to !== null && to > from) return to - from
  return Math.max(1, Math.trunc(Number(fallbackCount) || 1))
}

export const compactLevelUpsForCelebration = (levelUps = []) => {
  const normalizedLevelUps = Array.isArray(levelUps)
    ? levelUps.filter((levelUp) => toLevelNumber(levelUp?.toLevel) > 0)
    : []
  if (normalizedLevelUps.length <= 1) return normalizedLevelUps

  const orderedLevelUps = normalizedLevelUps.every((levelUp) => (
    toLevelNumber(levelUp?.fromLevel) !== null && toLevelNumber(levelUp?.toLevel) !== null
  ))
    ? [...normalizedLevelUps].sort((a, b) => (
      toLevelNumber(a.fromLevel) - toLevelNumber(b.fromLevel) ||
      toLevelNumber(a.toLevel) - toLevelNumber(b.toLevel)
    ))
    : normalizedLevelUps
  const seen = new Set()

  return orderedLevelUps.filter((levelUp, index) => {
    const key = getLevelUpRangeKey(getLevelUpOwnerKey(levelUp, index), levelUp?.fromLevel, levelUp?.toLevel)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const buildLevelUpStatChanges = (levelUps = [], fallbackStats = null) => {
  const firstStats = levelUps.find((levelUp) => levelUp?.beforeStats)?.beforeStats
  const lastStats = [...levelUps].reverse().find((levelUp) => levelUp?.afterStats)?.afterStats || fallbackStats
  if (!firstStats || !lastStats) return []

  const rows = [
    { key: 'maxHp', label: 'HP' },
    { key: 'maxMp', label: '技能值' },
    { key: 'atk', label: '攻击' },
    { key: 'def', label: '防御' },
    { key: 'spAtk', label: '特攻' },
    { key: 'spDef', label: '特防' },
    { key: 'spd', label: '速度' },
  ]

  return rows.map(({ key, label }) => {
    const before = Math.max(0, Math.trunc(Number(firstStats[key]) || 0))
    const after = Math.max(0, Math.trunc(Number(lastStats[key]) || 0))
    return { key, label, before, after, delta: after - before }
  }).filter((row) => row.before > 0 || row.after > 0)
}

export const buildLevelUpCelebrationPayload = (
  levelUps = [],
  {
    monster = null,
    fallbackIndex = 0,
    placeholderSprite = '',
    fallbackStats = null,
  } = {}
) => {
  const normalizedLevelUps = compactLevelUpsForCelebration(levelUps)
  if (normalizedLevelUps.length === 0) return null

  const firstLevelUp = normalizedLevelUps[0]
  const lastLevelUp = normalizedLevelUps[normalizedLevelUps.length - 1]
  const ownerId = monster?.id || firstLevelUp?.monId || firstLevelUp?.id || firstLevelUp?.name || fallbackIndex
  const ownerKey = monster?.id ? `id:${monster.id}` : getLevelUpOwnerKey(firstLevelUp, fallbackIndex)
  const fromLevel = firstLevelUp?.fromLevel
  const toLevel = lastLevelUp?.toLevel
  const rangeKey = getLevelUpRangeKey(ownerKey, fromLevel, toLevel)

  return {
    id: `${rangeKey}-${Date.now()}-${fallbackIndex}`,
    ownerId,
    ownerKey,
    rangeKey,
    name: monster?.name || firstLevelUp?.name || '宝可梦',
    sprite: monster?.sprite || lastLevelUp?.sprite || firstLevelUp?.sprite || placeholderSprite,
    fromLevel,
    toLevel,
    levelGain: getLevelUpGain(fromLevel, toLevel, normalizedLevelUps.length),
    levelUps: normalizedLevelUps,
    statChanges: buildLevelUpStatChanges(normalizedLevelUps, fallbackStats),
  }
}

export const getLevelUpCelebrationRangeKey = (celebration, fallbackIndex = 0) => (
  celebration?.rangeKey ||
  getLevelUpRangeKey(
    celebration?.ownerKey || getLevelUpOwnerKey(celebration?.levelUps?.[0], fallbackIndex),
    celebration?.fromLevel,
    celebration?.toLevel
  )
)

export const canMergeLevelUpCelebrations = (current, incoming) => {
  if (!current || !incoming) return false
  const currentOwnerKey = current.ownerKey || getLevelUpOwnerKey(current.levelUps?.[0])
  const incomingOwnerKey = incoming.ownerKey || getLevelUpOwnerKey(incoming.levelUps?.[0])
  if (!currentOwnerKey || currentOwnerKey !== incomingOwnerKey) return false

  const currentFrom = toLevelNumber(current.fromLevel)
  const currentTo = toLevelNumber(current.toLevel)
  const incomingFrom = toLevelNumber(incoming.fromLevel)
  const incomingTo = toLevelNumber(incoming.toLevel)
  if ([currentFrom, currentTo, incomingFrom, incomingTo].some((level) => level === null)) return false

  return incomingFrom <= currentTo && incomingTo >= currentFrom
}

export const mergeLevelUpCelebrations = (current, incoming) => {
  if (!canMergeLevelUpCelebrations(current, incoming)) return null
  return buildLevelUpCelebrationPayload(
    [...(current.levelUps || []), ...(incoming.levelUps || [])],
    {
      monster: {
        id: incoming.ownerId || current.ownerId,
        name: incoming.name || current.name,
        sprite: incoming.sprite || current.sprite,
      }
    }
  )
}

export const appendLevelUpCelebrationToQueue = (queue = [], celebration = null, activeCelebration = null) => {
  if (!celebration) return queue
  const incomingKey = getLevelUpCelebrationRangeKey(celebration)
  const activeKey = activeCelebration ? getLevelUpCelebrationRangeKey(activeCelebration) : null
  if (incomingKey && activeKey === incomingKey) return queue
  if (incomingKey && queue.some((queuedCelebration, index) => (
    getLevelUpCelebrationRangeKey(queuedCelebration, index) === incomingKey
  ))) {
    return queue
  }

  const lastCelebration = queue[queue.length - 1]
  if (lastCelebration && canMergeLevelUpCelebrations(lastCelebration, celebration)) {
    const mergedCelebration = mergeLevelUpCelebrations(lastCelebration, celebration)
    if (mergedCelebration) return [...queue.slice(0, -1), mergedCelebration]
  }

  return [...queue, celebration]
}

export const appendLevelUpCelebrationsToQueue = (queue = [], celebrations = [], activeCelebration = null) => (
  celebrations.reduce(
    (nextQueue, celebration) => appendLevelUpCelebrationToQueue(nextQueue, celebration, activeCelebration),
    queue
  )
)

export const buildLevelUpCelebrationsForRoster = (
  levelUps = [],
  roster = [],
  {
    placeholderSprite = '',
    buildFallbackStats = null,
  } = {}
) => {
  const normalizedLevelUps = Array.isArray(levelUps) ? levelUps.filter((levelUp) => levelUp?.toLevel > 0) : []
  if (normalizedLevelUps.length === 0) return []

  const rosterList = Array.isArray(roster) ? roster.filter(Boolean) : []
  const rosterById = new Map(rosterList.map((monster) => [monster.id, monster]))
  const grouped = new Map()

  normalizedLevelUps.forEach((levelUp, index) => {
    const key = getLevelUpOwnerKey(levelUp, index)
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        monId: levelUp?.monId || levelUp?.id || null,
        name: levelUp?.name || null,
        levelUps: [],
      })
    }
    grouped.get(key).levelUps.push(levelUp)
  })

  return [...grouped.values()]
    .map((group, index) => {
      const monster = rosterById.get(group.monId) || rosterList.find((candidate) => candidate.name === group.name) || null
      return buildLevelUpCelebrationPayload(group.levelUps, {
        monster,
        fallbackIndex: index,
        placeholderSprite,
        fallbackStats: typeof buildFallbackStats === 'function' ? buildFallbackStats(monster) : null,
      })
    })
    .filter(Boolean)
}
