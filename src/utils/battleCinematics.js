const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const BATTLE_CINEMATIC_INTENSITIES = ['subtle', 'light', 'medium', 'heavy', 'ultimate']
export const BATTLE_CINEMATIC_TRAVEL_MODES = ['contact', 'projectile', 'beam', 'arc', 'sky', 'ground', 'wave', 'pulse', 'self']

const ULTIMATE_MOVE_KEYS = new Set([
  'solar_beam',
  'hyper_beam',
  'thunder',
  'earthquake',
  'blizzard',
  'fire_blast',
  'hydropump',
  'surf',
  'brave_bird',
  'sky_attack',
  'future_sight',
  'dream_eater',
  'self_destruct',
  'explosion',
  'giga_impact',
  'meteor_assault',
  'rock_wrecker',
  'overheat',
])

const FULL_SCENE_MOVE_KEYS = new Set([
  ...ULTIMATE_MOVE_KEYS,
  'hurricane',
  'heat_wave',
  'sludge_wave',
  'dazzling_gleam',
])

const MOVE_SCENE_FX = {
  solar_beam: 'sun-prism',
  hyper_beam: 'void-beam',
  thunder: 'storm-strike',
  earthquake: 'fault-line',
  blizzard: 'whiteout',
  fire_blast: 'inferno',
  hydropump: 'pressure-water',
  surf: 'tidal-wave',
  brave_bird: 'sky-dive',
  sky_attack: 'sky-dive',
  future_sight: 'time-rift',
  dream_eater: 'dream-rift',
  self_destruct: 'detonation',
  explosion: 'detonation',
}

const TYPE_SCENE_FX = {
  fire: 'heat',
  water: 'water',
  grass: 'nature',
  electric: 'electric',
  ice: 'frost',
  fighting: 'impact',
  poison: 'toxic',
  ground: 'ground',
  flying: 'wind',
  psychic: 'psychic',
  bug: 'swarm',
  rock: 'rock',
  ghost: 'shadow',
  dragon: 'dragon',
  dark: 'dark',
  steel: 'steel',
  fairy: 'fairy',
  normal: 'neutral',
}

const hasAnyTag = (tags, candidates) => candidates.some((tag) => tags.includes(tag))

const resolveTravelMode = (moveKey, move = {}, config = {}) => {
  const tags = Array.isArray(config.semanticTags) ? config.semanticTags : []
  if (['self_destruct', 'explosion'].includes(moveKey)) return 'self'
  if (['thunder', 'brave_bird', 'sky_attack', 'fly', 'bounce'].includes(moveKey)) return 'sky'
  if (['earthquake', 'earth_power', 'bulldoze', 'stomping_tantrum'].includes(moveKey)) return 'ground'
  if (['surf', 'sludge_wave', 'heat_wave', 'hurricane', 'blizzard'].includes(moveKey)) return 'wave'
  if (['future_sight', 'psychic', 'psystrike', 'dream_eater'].includes(moveKey)) return 'pulse'
  if (config.target === 'self' || move.effect === 'heal') return 'self'
  if (hasAnyTag(tags, ['sky', 'wing', 'meteor'])) return 'sky'
  if (hasAnyTag(tags, ['ground', 'quake'])) return 'ground'
  if (hasAnyTag(tags, ['beam', 'cannon'])) return 'beam'
  if (hasAnyTag(tags, ['wave', 'sound', 'roar'])) return 'wave'
  if (hasAnyTag(tags, ['ball', 'seed', 'rock', 'bone', 'egg', 'coin'])) return 'arc'
  if (hasAnyTag(tags, ['mind', 'eye', 'aura', 'dance', 'shield'])) return 'pulse'
  if (move.category === 'physical' || hasAnyTag(tags, ['punch', 'kick', 'fang', 'claw', 'blade', 'tail', 'horn', 'head'])) return 'contact'
  return 'projectile'
}

const resolveIntensity = (moveKey, move = {}, phase = 'hit') => {
  const power = Math.max(0, Number(move.power) || 0)
  if (['secondary', 'heal', 'drain'].includes(phase)) return 'subtle'
  if (phase === 'charge') return ULTIMATE_MOVE_KEYS.has(moveKey) || power >= 110 ? 'heavy' : 'medium'
  if (move.selfDestruct || ULTIMATE_MOVE_KEYS.has(moveKey) || power >= 130) return 'ultimate'
  if (power >= 95) return 'heavy'
  if (power >= 60) return 'medium'
  if (power > 0) return 'light'
  return move.category === 'status' ? 'subtle' : 'light'
}

const getDurationForProfile = ({ phase, intensity, hitCount }) => {
  if (phase === 'secondary') return 760
  if (phase === 'heal' || phase === 'drain') return 1120
  if (phase === 'miss' || phase === 'fizzle') return 980
  if (phase === 'copy' || phase === 'start') return 920
  if (phase === 'charge') return intensity === 'heavy' || intensity === 'ultimate' ? 1780 : 1480
  if (phase === 'status') return intensity === 'subtle' ? 1120 : 1320
  if (hitCount > 1) return intensity === 'ultimate' ? 820 : 680
  return {
    subtle: 980,
    light: 1120,
    medium: 1420,
    heavy: 1720,
    ultimate: 2140,
  }[intensity] || 1420
}

export const getBattleCinematicProfile = (
  moveKey,
  move = {},
  config = {},
  { phase = 'hit', hitCount = 1, hitIndex = 0, durationMs = null } = {}
) => {
  const normalizedMoveKey = String(moveKey || 'unknown')
  const intensity = resolveIntensity(normalizedMoveKey, move, phase)
  const travel = resolveTravelMode(normalizedMoveKey, move, config)
  const power = Math.max(0, Number(move.power) || 0)
  const resolvedDuration = Number(durationMs) > 0
    ? Number(durationMs)
    : getDurationForProfile({ phase, intensity, hitCount })
  const hitStopMs = phase === 'hit'
    ? ({ subtle: 20, light: 30, medium: 46, heavy: 64, ultimate: 82 }[intensity] || 36)
    : 0
  const cameraStrength = ({ subtle: 0, light: 1, medium: 2, heavy: 3, ultimate: 4 }[intensity] || 1)
  const sceneFx = MOVE_SCENE_FX[normalizedMoveKey] || TYPE_SCENE_FX[move.type] || 'neutral'
  const fullScene = FULL_SCENE_MOVE_KEYS.has(normalizedMoveKey) || intensity === 'ultimate'
  const particleMultiplier = clamp(
    ({ subtle: 0.72, light: 0.9, medium: 1, heavy: 1.16, ultimate: 1.32 }[intensity] || 1),
    0.7,
    1.35
  )
  const signatureStyle = config.signatureStyle || null
  const signatureFingerprint = signatureStyle?.renderFingerprint
    ? `${signatureStyle.renderFingerprint}|${intensity}|${travel}|${sceneFx}`
    : ''

  return {
    intensity,
    travel,
    sceneFx,
    fullScene,
    durationMs: resolvedDuration,
    hitStopMs,
    cameraStrength,
    particleMultiplier,
    signatureStyle,
    signatureFingerprint,
    power,
    hitCount: Math.max(1, Number(hitCount) || 1),
    hitIndex: Math.max(0, Number(hitIndex) || 0),
  }
}

export const buildBattleImpactFeedback = ({
  damage = 0,
  healing = 0,
  effectiveness = 1,
  crit = false,
  hitCount = 1,
  hitIndex = 0,
  targetSide = 'enemy',
  moveType = 'normal',
  intensity = 'medium',
} = {}) => {
  const amount = Math.max(0, Math.trunc(Number(healing) || Number(damage) || 0))
  let label = ''
  if (healing > 0) label = '恢复'
  else if (crit) label = '暴击'
  else if (effectiveness > 1) label = '效果绝佳'
  else if (effectiveness > 0 && effectiveness < 1) label = '效果不佳'
  else if (effectiveness <= 0) label = '免疫'

  return {
    id: `impact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    amount,
    kind: healing > 0 ? 'heal' : effectiveness <= 0 ? 'immune' : 'damage',
    label,
    crit: Boolean(crit),
    effectiveness: Number(effectiveness) || 0,
    hitCount: Math.max(1, Number(hitCount) || 1),
    hitIndex: Math.max(0, Number(hitIndex) || 0),
    targetSide: targetSide === 'player' ? 'player' : 'enemy',
    moveType,
    intensity,
  }
}

export const getBattleStatusVisualClasses = (mon = null) => {
  if (!mon) return ''
  const statuses = []
  if (mon.status) statuses.push(mon.status)
  if (mon.volatileStatuses?.confusion) statuses.push('confusion')
  if (mon.volatileStatuses?.chargingMove) statuses.push('charging')
  return statuses
    .map((status) => String(status).replace(/[^a-z0-9_-]/gi, '-').toLowerCase())
    .map((status) => `battle-status-visual--${status}`)
    .join(' ')
}

export const resolveBattleVfxQuality = ({ storedValue = null, navigatorLike = null, windowLike = null } = {}) => {
  const preference = storedValue
  if (['lite', 'standard', 'high'].includes(preference)) return preference

  const resolvedNavigator = navigatorLike || (typeof navigator !== 'undefined' ? navigator : null)
  const resolvedWindow = windowLike || (typeof window !== 'undefined' ? window : null)
  if (resolvedWindow?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'lite'
  const memory = Number(resolvedNavigator?.deviceMemory) || 8
  const cores = Number(resolvedNavigator?.hardwareConcurrency) || 8
  if (memory <= 4 || cores <= 4) return 'lite'
  if ((Number(resolvedWindow?.innerWidth) || 1024) <= 760 || (Number(resolvedWindow?.devicePixelRatio) || 1) >= 2.5) return 'standard'
  return 'high'
}

export const getBattleCinematicAudit = (moves = {}, getConfig = () => ({})) => {
  const profiles = Object.entries(moves).map(([moveKey, move]) => (
    getBattleCinematicProfile(moveKey, move, getConfig(moveKey, move))
  ))
  return {
    moveCount: profiles.length,
    intensityCount: new Set(profiles.map((profile) => profile.intensity)).size,
    travelModeCount: new Set(profiles.map((profile) => profile.travel)).size,
    sceneFxCount: new Set(profiles.map((profile) => profile.sceneFx)).size,
    fullSceneMoveCount: profiles.filter((profile) => profile.fullScene).length,
    signatureFingerprintCount: new Set(profiles.map((profile) => profile.signatureFingerprint).filter(Boolean)).size,
    invalidProfiles: profiles.filter((profile) => (
      !BATTLE_CINEMATIC_INTENSITIES.includes(profile.intensity)
      || !BATTLE_CINEMATIC_TRAVEL_MODES.includes(profile.travel)
      || !(profile.durationMs >= 600 && profile.durationMs <= 2600)
      || !(profile.hitStopMs >= 0 && profile.hitStopMs <= 100)
      || !profile.signatureStyle?.renderFingerprint
    )),
  }
}
