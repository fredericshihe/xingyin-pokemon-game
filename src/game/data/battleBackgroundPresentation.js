const TYPE_THEME_ORDER = [
  ['fire', 'ember'], ['water', 'water'], ['ice', 'frost'], ['electric', 'storm'],
  ['grass', 'verdant'], ['bug', 'verdant'], ['poison', 'mystic'], ['ghost', 'mystic'],
  ['dark', 'mystic'], ['psychic', 'arcane'], ['fairy', 'arcane'], ['dragon', 'dragon'],
  ['rock', 'earth'], ['ground', 'earth'], ['steel', 'iron']
]

const normalizeToken = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')

export function normalizeBattleOpponentSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {}
  const types = Array.isArray(source.types)
    ? [...new Set(source.types.map(normalizeToken).filter(Boolean))].slice(0, 18)
    : []
  const speciesId = Number(source.speciesId || source.dexNo || source.baseId)
  const teamSize = Math.max(1, Math.min(6, Math.trunc(Number(source.teamSize) || 1)))
  return {
    speciesId: Number.isSafeInteger(speciesId) && speciesId > 0 ? speciesId : null,
    types,
    teamSize
  }
}

export function resolveBattleElementTheme(snapshot) {
  const { types } = normalizeBattleOpponentSnapshot(snapshot)
  for (const type of types) {
    const match = TYPE_THEME_ORDER.find(([key]) => key === type)
    if (match) return match[1]
  }
  return 'neutral'
}

export function resolveBattlePresentationClasses(environment, { battleKind = 'wild', battlePhase = 'active' } = {}) {
  const source = environment && typeof environment === 'object' ? environment : {}
  const role = String(source.eventRole || source.eventType || (battleKind === 'trainer' ? 'normal' : 'wild')).toLowerCase()
  const rarity = String(source.encounterRarity?.tier || '').toLowerCase()
  const classes = [`battle-theme-${resolveBattleElementTheme(source.opponentSnapshot)}`]
  classes.push(battleKind === 'trainer' ? 'battle-presentation-trainer' : 'battle-presentation-wild')
  if (source.timberLeague?.routeKey) classes.push('battle-presentation-league')
  if (source.mapName === 'GodotMapV2_ChampionTower') classes.push('battle-presentation-tower')
  if (role === 'boss') classes.push('battle-presentation-boss')
  else if (role === 'challenge') classes.push('battle-presentation-challenge')
  else if (role === 'lieutenant') classes.push('battle-presentation-lieutenant')
  if (['rare', 'ultra', 'mythic', 'boosted'].includes(rarity)) classes.push(`battle-presentation-rarity-${rarity}`)
  const phase = String(battlePhase || 'active').toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (phase) classes.push(`battle-presentation-phase-${phase}`)
  return classes.join(' ')
}
