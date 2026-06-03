export const LEVEL_ONLY_EVOLUTION_TARGET_LEVELS = {
  4: { 28: 30 },
  5: { 138: 37 },
  13: { 62: 30, 63: 30, 64: 30, 132: 30, 133: 30, 134: 30, 137: 30, 144: 30 },
  15: { 115: 30 },
  18: { 34: 40 },
  21: { 6: 36 },
  22: { 139: 36 },
  23: { 125: 30, 140: 30 },
  32: { 126: 36 },
  38: { 143: 40 },
  39: { 146: 30 },
  51: { 104: 50 },
  52: { 117: 30 },
  54: { 86: 40 },
  58: { 122: 40 },
  59: { 94: 40 },
  65: { 108: 30 },
  78: { 42: 30 },
  80: { 55: 30 },
  83: { 7: 30 },
  84: { 29: 30 },
  87: { 30: 30, 136: 30 },
  88: { 46: 30 },
  99: { 17: 30 },
  103: { 35: 36 },
  108: { 109: 40 },
  111: { 11: 30 },
  112: { 56: 20 },
  113: { 10: 20 },
  114: { 15: 20 },
  116: { 52: 20 },
  120: { 135: 20 },
  124: { 127: 30 },
  168: { 201: 30 },
}

export const getLevelOnlyEvolutionTargetLevel = (baseMonsterId, targetId) => {
  const sourceLevels = LEVEL_ONLY_EVOLUTION_TARGET_LEVELS[Math.trunc(Number(baseMonsterId))]
  if (!sourceLevels) return null

  const configuredLevel = sourceLevels[Math.trunc(Number(targetId))]
  return Number.isInteger(Number(configuredLevel)) ? Number(configuredLevel) : null
}

export const withExplicitLevelEvolution = (baseMonsterId, evolution) => {
  if (!evolution || typeof evolution !== 'object') return evolution
  if (Number.isInteger(Number(evolution.level))) {
    return {
      ...evolution,
      level: Number(evolution.level),
    }
  }

  const configuredLevel = getLevelOnlyEvolutionTargetLevel(baseMonsterId, evolution.targetId)
  if (!Number.isInteger(configuredLevel)) return evolution

  return {
    ...evolution,
    level: configuredLevel,
  }
}
