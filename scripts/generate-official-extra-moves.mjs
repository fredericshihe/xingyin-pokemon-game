#!/usr/bin/env node
import fs from 'node:fs/promises'
import { withViteAuditServer } from './load-vite-module.mjs'
import {
  POKEAPI_ROOT,
  fetchJson,
  getDefaultPokemonUrlForSpecies,
  mapLimit,
  resolveOfficialSpeciesByPokemonName,
} from './official-pokemon-name-resolver.mjs'

const OUTPUT_PATH = 'src/utils/officialExtraMoves.js'

const MOVE_KEY_TO_API = {
  quickattack: 'quick-attack',
  bodyslam: 'body-slam',
  horn_attack: 'horn-attack',
  fury_attack: 'fury-attack',
  extremespeed: 'extreme-speed',
  fire_blast: 'fire-blast',
  watergun: 'water-gun',
  hydropump: 'hydro-pump',
  vinewhip: 'vine-whip',
  razorleaf: 'razor-leaf',
  thundershock: 'thunder-shock',
  zap_cannon: 'zap-cannon',
  icebeam: 'ice-beam',
  karate_chop: 'karate-chop',
  double_kick: 'double-kick',
  low_kick: 'low-kick',
  poison_sting: 'poison-sting',
  poison_jab: 'poison-jab',
  wing_attack: 'wing-attack',
  drill_peck: 'drill-peck',
  sky_attack: 'sky-attack',
  dream_eater: 'dream-eater',
  fury_cutter: 'fury-cutter',
  rock_throw: 'rock-throw',
  rock_slide: 'rock-slide',
  shadowball: 'shadow-ball',
  rage_fist: 'rage-fist',
  dragonclaw: 'dragon-claw',
}

const MANUAL_MOVE_API_NAMES = new Set([
  'tackle',
  'scratch',
  'bite',
  'flail',
  'slash',
  'recover',
  'mimic',
  'ember',
  'flamethrower',
  'surf',
  'blizzard',
  'earthquake',
  'peck',
  'fly',
  'hurricane',
  'psychic',
  'hypnosis',
  'lick',
  'rollout',
  'moonblast',
  'iron-tail',
  ...Object.values(MOVE_KEY_TO_API),
])

const VERSION_GROUP_PRIORITY = [
  'the-indigo-disk',
  'the-teal-mask',
  'scarlet-violet',
  'legends-arceus',
  'brilliant-diamond-shining-pearl',
  'the-crown-tundra',
  'the-isle-of-armor',
  'sword-shield',
  'lets-go-pikachu-lets-go-eevee',
  'ultra-sun-ultra-moon',
  'sun-moon',
  'omega-ruby-alpha-sapphire',
  'x-y',
  'black-2-white-2',
  'black-white',
  'heartgold-soulsilver',
  'platinum',
  'diamond-pearl',
  'firered-leafgreen',
  'emerald',
  'ruby-sapphire',
  'crystal',
  'gold-silver',
  'yellow',
  'red-blue',
]

const STAT_KEY_BY_API = {
  attack: 'atk',
  defense: 'def',
  'special-attack': 'spAtk',
  'special-defense': 'spDef',
  speed: 'spd',
  accuracy: 'accuracy',
  evasion: 'evasion',
}

const STATUS_BY_AILMENT = {
  burn: 'burn',
  freeze: 'freeze',
  paralysis: 'paralysis',
  poison: 'poison',
  sleep: 'sleep',
}

const VOLATILE_BY_AILMENT = {
  confusion: 'confusion',
}

const SIMPLE_NO_EFFECT_MOVES = new Set(['splash'])
const SELF_DESTRUCT_MOVES = new Set(['self-destruct', 'explosion'])
const USABLE_WHILE_ASLEEP_MOVES = new Set(['snore'])
const SELF_THAWING_MOVES = new Set(['flame-wheel', 'flare-blitz'])
const DYNAMIC_POWER_DEFAULTS = {
  'electro-ball': 60,
  'grass-knot': 60,
  'gyro-ball': 60,
  'heavy-slam': 60,
  reversal: 50,
}
const BALANCE_COST_OVERRIDES_BY_API_NAME = {
  'ancient-power': 15,
  'dragon-tail': 7,
  'fake-out': 12,
  'life-dew': 12,
  synthesis: 15,
}
const SELF_STAT_CHANGE_DAMAGE_MOVES = new Set([
  'close-combat',
  'draco-meteor',
  'hammer-arm',
  'leaf-storm',
  'overheat',
  'psycho-boost',
  'scale-shot',
  'superpower',
  'v-create',
])
const SKIPPED_COMPLEX_MOVES = new Set([
  'baton-pass',
  'conversion',
  'conversion-2',
  'counter',
  'curse',
  'disable',
  'electric-terrain',
  'endure',
  'focus-energy',
  'foresight',
  'grudge',
  'helping-hand',
  'imprison',
  'light-screen',
  'magnet-rise',
  'mean-look',
  'mist',
  'perish-song',
  'protect',
  'psycho-shift',
  'psych-up',
  'rain-dance',
  'recycle',
  'reflect',
  'reflect-type',
  'rest',
  'roost',
  'safeguard',
  'sandstorm',
  'skill-swap',
  'slack-off',
  'spite',
  'sunny-day',
  'switcheroo',
  'trick',
  'wide-guard',
  'wish',
  'work-up',
  'worry-seed',
])

const getMoveDetailsForGroup = (pokemonMove, versionGroup) => pokemonMove.version_group_details
  .filter((detail) => detail.version_group.name === versionGroup)

const getLatestLearnsetVersionGroup = (apiPokemon) => VERSION_GROUP_PRIORITY.find((versionGroup) => (
  apiPokemon.moves.some((move) => getMoveDetailsForGroup(move, versionGroup)
    .some((detail) => detail.move_learn_method.name === 'level-up'))
)) || null

const moveKeyFromApiName = (apiName) => apiName.replaceAll('-', '_')

const getLocalizedName = (apiMove) => (
  apiMove.names?.find((entry) => entry.language?.name === 'zh-hans')?.name ||
  apiMove.names?.find((entry) => entry.language?.name === 'zh-Hans')?.name ||
  apiMove.names?.find((entry) => entry.language?.name === 'zh-hant')?.name ||
  apiMove.names?.find((entry) => entry.language?.name === 'zh-Hant')?.name ||
  apiMove.names?.find((entry) => entry.language?.name === 'en')?.name ||
  apiMove.name
)

const mapMoveTarget = (apiTargetName, statChange) => {
  if (apiTargetName === 'user' || apiTargetName === 'user-and-allies' || apiTargetName === 'users-field') {
    return 'attacker'
  }
  if (
    apiTargetName === 'selected-pokemon' ||
    apiTargetName === 'all-opponents' ||
    apiTargetName === 'random-opponent' ||
    apiTargetName === 'all-other-pokemon'
  ) {
    return 'defender'
  }
  if (apiTargetName === 'all-pokemon' && statChange?.change < 0) {
    return 'defender'
  }
  return null
}

const getStatChanges = (apiMove, target) => {
  if (!Array.isArray(apiMove.stat_changes) || apiMove.stat_changes.length === 0) return []
  return apiMove.stat_changes.map((entry) => {
    const stat = STAT_KEY_BY_API[entry.stat?.name]
    if (!stat) return null
    const changeTarget = apiMove.damage_class?.name !== 'status'
      ? (SELF_STAT_CHANGE_DAMAGE_MOVES.has(apiMove.name) || entry.change > 0 ? 'attacker' : 'defender')
      : (mapMoveTarget(apiMove.target?.name, entry) || target)
    if (!changeTarget) return null
    return {
      target: changeTarget,
      stat,
      stages: entry.change,
    }
  }).filter(Boolean)
}

const computeCost = ({ category, power, pp }) => {
  if (category !== 'status' && Number(power) <= 40 && Number(pp) >= 30) return 0
  if (category === 'status') return Math.max(3, Math.min(14, Math.round(32 / Math.max(5, Number(pp) || 10)) + 4))
  const powerCost = Math.ceil(Math.max(1, Number(power) || 40) / 9)
  const ppCost = Math.ceil(26 / Math.max(5, Number(pp) || 10))
  return Math.max(2, Math.min(22, powerCost + ppCost))
}

const buildMoveDefinition = (apiMove) => {
  const apiName = apiMove.name
  if (MANUAL_MOVE_API_NAMES.has(apiName)) return { skipped: 'manual' }
  if (SKIPPED_COMPLEX_MOVES.has(apiName)) return { skipped: 'complex' }

  const category = apiMove.damage_class?.name
  if (!['physical', 'special', 'status'].includes(category)) return { skipped: 'unsupported_category' }

  const target = mapMoveTarget(apiMove.target?.name, null)
  const meta = apiMove.meta || {}
  const ailmentName = meta.ailment?.name
  const statChanges = getStatChanges(apiMove, target)
  const hasUnsupportedStatChanges = Array.isArray(apiMove.stat_changes) &&
    apiMove.stat_changes.length > 0 &&
    statChanges.length !== apiMove.stat_changes.length
  if (hasUnsupportedStatChanges) return { skipped: 'unsupported_stat_change' }

  const move = {
    name: getLocalizedName(apiMove),
    type: apiMove.type?.name,
    power: Number(apiMove.power) > 0 ? Number(apiMove.power) : (DYNAMIC_POWER_DEFAULTS[apiName] || 0),
    accuracy: Number(apiMove.accuracy) > 0 ? Number(apiMove.accuracy) : 100,
    category,
    cost: 0,
    unlockLevel: 1,
  }

  if (!move.type) return { skipped: 'missing_type' }
  if (Number(apiMove.priority) !== 0) move.priority = Number(apiMove.priority)
  if (DYNAMIC_POWER_DEFAULTS[apiName]) move.dynamicPower = apiName
  if (category !== 'status' && !Number(apiMove.accuracy)) move.alwaysHits = true

  if (statChanges.length === 1) {
    const chance = Number(meta.stat_chance) > 0 ? Number(meta.stat_chance) : 100
    move.statChange = { ...statChanges[0], chance }
  } else if (statChanges.length > 1) {
    const chance = Number(meta.stat_chance) > 0 ? Number(meta.stat_chance) : 100
    move.statChanges = statChanges.map((entry) => ({ ...entry, chance }))
  }

  if (STATUS_BY_AILMENT[ailmentName]) {
    move.status = STATUS_BY_AILMENT[ailmentName]
    move.statusChance = Number(meta.ailment_chance) > 0
      ? Number(meta.ailment_chance)
      : (category === 'status' ? 100 : 10)
  } else if (VOLATILE_BY_AILMENT[ailmentName]) {
    move.volatileStatus = VOLATILE_BY_AILMENT[ailmentName]
    move.volatileChance = Number(meta.ailment_chance) > 0
      ? Number(meta.ailment_chance)
      : (category === 'status' ? 100 : 10)
  } else if (ailmentName && ailmentName !== 'none') {
    return { skipped: `unsupported_ailment:${ailmentName}` }
  }

  if (Number(meta.flinch_chance) > 0) {
    move.volatileStatus = 'flinch'
    move.volatileChance = Number(meta.flinch_chance)
  }

  if (Number(meta.drain) > 0) move.effect = 'drain'
  if (Number(meta.healing) > 0) move.effect = 'heal'
  if (Number(meta.drain) < 0) move.recoilPercent = Math.abs(Number(meta.drain))
  if (Number(meta.min_hits) > 1 || Number(meta.max_hits) > 1) {
    move.multiHit = {
      min: Math.max(2, Number(meta.min_hits) || 2),
      max: Math.max(Number(meta.max_hits) || Number(meta.min_hits) || 2, Number(meta.min_hits) || 2),
    }
  }
  if (SELF_DESTRUCT_MOVES.has(apiName)) move.selfDestruct = true
  if (USABLE_WHILE_ASLEEP_MOVES.has(apiName)) {
    move.requiresUserStatus = 'sleep'
    move.usableWhileAsleep = true
  }
  if (SELF_THAWING_MOVES.has(apiName)) move.thawsUser = true
  if (apiName === 'teleport') move.effect = 'teleport'
  if (SIMPLE_NO_EFFECT_MOVES.has(apiName)) move.effect = 'nothing'

  const hasRuntimeEffect = Boolean(
    move.status ||
    move.volatileStatus ||
    move.statChange ||
    move.statChanges ||
    move.effect ||
    move.recoilPercent ||
    move.multiHit ||
    move.selfDestruct
  )
  if (category === 'status' && !hasRuntimeEffect) return { skipped: 'status_without_supported_effect' }
  if (category !== 'status' && !(Number(move.power) > 0)) return { skipped: 'damaging_without_power' }

  move.cost = BALANCE_COST_OVERRIDES_BY_API_NAME[apiName] ?? computeCost({ category, power: move.power, pp: apiMove.pp })
  return { move }
}

const renderValue = (value, indent = 0) => {
  const pad = ' '.repeat(indent)
  const innerPad = ' '.repeat(indent + 2)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map((entry) => `${innerPad}${renderValue(entry, indent + 2)},`).join('\n')}\n${pad}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
    if (entries.length === 0) return '{}'
    return `{\n${entries.map(([key, entryValue]) => {
      const renderedKey = /^[a-zA-Z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
      return `${innerPad}${renderedKey}: ${renderValue(entryValue, indent + 2)},`
    }).join('\n')}\n${pad}}`
  }
  return JSON.stringify(value)
}

await withViteAuditServer(async ({ loadModule }) => {
  const { MONSTERS } = await loadModule('/src/utils/gameData.js')
  const { matched, unmatched, ambiguous } = await resolveOfficialSpeciesByPokemonName(MONSTERS)
  if (unmatched.length > 0 || ambiguous.length > 0) {
    console.error(JSON.stringify({ unmatched, ambiguous }, null, 2))
    process.exitCode = 1
    return
  }

  const pokemonRows = await mapLimit(matched, 12, async ({ monster, species }) => ({
    monster,
    api: await fetchJson(getDefaultPokemonUrlForSpecies(species)),
  }))

  const officialMoveNames = new Set()
  for (const { api } of pokemonRows) {
    const versionGroup = getLatestLearnsetVersionGroup(api)
    if (!versionGroup) continue
    for (const move of api.moves) {
      const isLevelUp = getMoveDetailsForGroup(move, versionGroup)
        .some((detail) => detail.move_learn_method.name === 'level-up')
      if (isLevelUp) officialMoveNames.add(move.move.name)
    }
  }

  const moveRows = await mapLimit([...officialMoveNames].sort(), 12, async (apiName) => ({
    apiName,
    api: await fetchJson(`${POKEAPI_ROOT}/move/${apiName}`),
  }))

  const generatedMoves = {}
  const skippedByReason = {}
  const skippedMoves = []
  for (const { apiName, api } of moveRows) {
    const result = buildMoveDefinition(api)
    if (result.move) {
      generatedMoves[moveKeyFromApiName(apiName)] = result.move
    } else {
      const reason = result.skipped || 'unknown'
      skippedByReason[reason] = (skippedByReason[reason] || 0) + 1
      if (!['manual'].includes(reason)) skippedMoves.push({ apiName, reason })
    }
  }

  const sourceTime = new Date().toISOString()
  const fileContent = `// Generated by scripts/generate-official-extra-moves.mjs\n` +
    `// Source: PokeAPI level-up move data (${sourceTime})\n\n` +
    `export const OFFICIAL_EXTRA_MOVES = ${renderValue(generatedMoves)}\n`
  await fs.writeFile(OUTPUT_PATH, fileContent)

  console.log(JSON.stringify({
    generatedAt: sourceTime,
    monsterCount: MONSTERS.length,
    officialLevelUpMoveCount: officialMoveNames.size,
    generatedExtraMoveCount: Object.keys(generatedMoves).length,
    skippedByReason,
    skippedMoves: skippedMoves.slice(0, 80),
  }, null, 2))
})
