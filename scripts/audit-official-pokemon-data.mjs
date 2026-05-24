#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const POKEAPI_ROOT = 'https://pokeapi.co/api/v2'
const STAT_KEYS = {
  hp: 'maxHp',
  attack: 'atk',
  defense: 'def',
  'special-attack': 'spAtk',
  'special-defense': 'spDef',
  speed: 'spd',
}
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
  peck: 'peck',
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
const API_MOVE_TO_KEY = Object.fromEntries(
  Object.entries(MOVE_KEY_TO_API).map(([key, apiName]) => [apiName, key])
)
const SIMPLIFIED_MOVE_KEYS = new Set([
  'double_kick',
  'electro_ball',
  'flail',
  'fury_attack',
  'gyro_ball',
  'heavy_slam',
  'low_kick',
  'rage_fist',
  'reversal',
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

const sample = (items, limit = 20) => items.slice(0, limit)
const apiMoveName = (moveKey) => MOVE_KEY_TO_API[moveKey] || moveKey.replaceAll('_', '-')

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

const mapLimit = async (items, limit, mapper) => {
  const results = new Array(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

const getPokemonStats = (apiPokemon) => Object.fromEntries(
  apiPokemon.stats
    .map((row) => [STAT_KEYS[row.stat.name], row.base_stat])
    .filter(([key]) => key)
)

const getPokemonTypes = (apiPokemon) => apiPokemon.types
  .slice()
  .sort((a, b) => a.slot - b.slot)
  .map((row) => row.type.name)

const getMoveDetailsForGroup = (pokemonMove, versionGroup) => pokemonMove.version_group_details
  .filter((detail) => detail.version_group.name === versionGroup)

const getLatestLearnsetVersionGroup = (apiPokemon) => VERSION_GROUP_PRIORITY.find((versionGroup) => (
  apiPokemon.moves.some((move) => getMoveDetailsForGroup(move, versionGroup)
    .some((detail) => detail.move_learn_method.name === 'level-up'))
)) || null

const getSupportedOfficialLearnset = (apiPokemon, versionGroup) => {
  if (!versionGroup) return {}

  const learnset = {}
  for (const move of apiPokemon.moves) {
    const moveKey = API_MOVE_TO_KEY[move.move.name] || move.move.name.replaceAll('-', '_')
    for (const detail of getMoveDetailsForGroup(move, versionGroup)) {
      if (detail.move_learn_method.name !== 'level-up') continue
      if (!Number.isInteger(detail.level_learned_at)) continue
      const level = Math.max(1, detail.level_learned_at)
      learnset[moveKey] = Math.min(learnset[moveKey] ?? level, level)
    }
  }
  return learnset
}

const getSupportedOfficialMovesForGroup = (apiPokemon, versionGroup) => {
  if (!versionGroup) return new Set()
  const moves = new Set()
  for (const move of apiPokemon.moves) {
    if (!getMoveDetailsForGroup(move, versionGroup).length) continue
    const moveKey = API_MOVE_TO_KEY[move.move.name] || move.move.name.replaceAll('-', '_')
    moves.add(moveKey)
  }
  return moves
}

await withViteAuditServer(async ({ loadModule }) => {
  const [{ MONSTERS, MOVES, getLearnLevelByMove, getMoveAvailabilityLevel, getMoveKeysAvailableForMonsterLevel }, { TYPES }] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/constants.js'),
  ])

  const validProjectTypes = new Set(Object.values(TYPES))
  const moveKeys = Object.keys(MOVES)
  const [pokemonRows, moveRows] = await Promise.all([
    mapLimit(MONSTERS, 12, async (monster) => ({
      monster,
      api: await fetchJson(`${POKEAPI_ROOT}/pokemon/${monster.dexNo}`),
    })),
    mapLimit(moveKeys, 12, async (moveKey) => ({
      moveKey,
      api: await fetchJson(`${POKEAPI_ROOT}/move/${apiMoveName(moveKey)}`),
    })),
  ])

  const statMismatches = []
  const typeMismatches = []
  const unsupportedOfficialTypes = []
  const moveDefinitionMismatches = []
  const levelLearnsetMismatches = []
  const projectOnlyMoves = []
  const unofficialProjectMoves = []
  const officialSupportedMovesByPokemon = []

  for (const { monster, api } of pokemonRows) {
    const officialStats = getPokemonStats(api)
    for (const [statKey, officialValue] of Object.entries(officialStats)) {
      if (Number(monster[statKey]) !== officialValue) {
        statMismatches.push({
          id: monster.id,
          dexNo: monster.dexNo,
          name: monster.name,
          stat: statKey,
          local: monster[statKey],
          official: officialValue,
        })
      }
    }

    const localTypes = [monster.type, monster.type2].filter(Boolean)
    const officialTypes = getPokemonTypes(api)
    if (localTypes.join('/') !== officialTypes.join('/')) {
      typeMismatches.push({
        id: monster.id,
        dexNo: monster.dexNo,
        name: monster.name,
        local: localTypes,
        official: officialTypes,
      })
    }
    for (const officialType of officialTypes) {
      if (!validProjectTypes.has(officialType)) {
        unsupportedOfficialTypes.push({
          id: monster.id,
          dexNo: monster.dexNo,
          name: monster.name,
          officialType,
        })
      }
    }

    const versionGroup = getLatestLearnsetVersionGroup(api)
    const officialLearnset = getSupportedOfficialLearnset(api, versionGroup)
    const officialMovesForGroup = getSupportedOfficialMovesForGroup(api, versionGroup)
    const supportedOfficialMoveKeys = Object.keys(officialLearnset).filter((moveKey) => MOVES[moveKey])
    const learnLevelByMove = getLearnLevelByMove(monster)

    const localMoveKeys = getMoveKeysAvailableForMonsterLevel(monster, 100, { includeEmergencyFallback: false })
      .filter((moveKey) => MOVES[moveKey])
    const missingOfficialSupported = supportedOfficialMoveKeys
      .filter((moveKey) => !localMoveKeys.includes(moveKey))
    const wrongLevelSupported = supportedOfficialMoveKeys
      .filter((moveKey) => localMoveKeys.includes(moveKey) && getMoveAvailabilityLevel(monster, moveKey) !== officialLearnset[moveKey])
      .map((moveKey) => ({
        moveKey,
        local: getMoveAvailabilityLevel(monster, moveKey),
        official: officialLearnset[moveKey],
      }))
    const localButNotLevelUp = localMoveKeys
      .filter((moveKey) => officialLearnset[moveKey] === undefined)

    if (missingOfficialSupported.length || wrongLevelSupported.length) {
      levelLearnsetMismatches.push({
        id: monster.id,
        dexNo: monster.dexNo,
        name: monster.name,
        versionGroup,
        missingOfficialSupported,
        wrongLevelSupported,
      })
    }
    if (localButNotLevelUp.length) {
      projectOnlyMoves.push({
        id: monster.id,
        dexNo: monster.dexNo,
        name: monster.name,
        versionGroup,
        moves: localButNotLevelUp,
      })
    }
    const unofficialMoves = localMoveKeys.filter((moveKey) => !officialMovesForGroup.has(moveKey))
    if (unofficialMoves.length) {
      unofficialProjectMoves.push({
        id: monster.id,
        dexNo: monster.dexNo,
        name: monster.name,
        versionGroup,
        moves: unofficialMoves,
      })
    }
    officialSupportedMovesByPokemon.push({
      id: monster.id,
      dexNo: monster.dexNo,
      name: monster.name,
      versionGroup,
      supportedOfficialMoveKeys,
    })
  }

  for (const { moveKey, api } of moveRows) {
    const local = MOVES[moveKey]
    const official = {
      type: api.type?.name,
      power: api.power,
      accuracy: api.accuracy,
      category: api.damage_class?.name,
      priority: api.priority,
    }
    const localComparable = {
      type: local.type,
      power: local.power,
      accuracy: local.accuracy,
      category: local.category,
      priority: local.priority || 0,
    }
    const diffs = {}
    for (const key of Object.keys(localComparable)) {
      const officialValue = official[key] ?? (key === 'accuracy' ? 100 : official[key])
      if (key === 'power' && official.power === null && localComparable.power === 0) continue
      if (localComparable[key] !== officialValue) {
        diffs[key] = { local: localComparable[key], official: official[key] }
      }
    }
    if (Object.keys(diffs).length > 0) {
      moveDefinitionMismatches.push({
        moveKey,
        name: local.name,
        simplified: SIMPLIFIED_MOVE_KEYS.has(moveKey),
        diffs,
      })
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      pokemon: 'https://pokeapi.co/api/v2/pokemon/{dexNo}',
      moves: 'https://pokeapi.co/api/v2/move/{move-name}',
      learnsetVersionGroupPriority: VERSION_GROUP_PRIORITY,
    },
    summary: {
      monsterCount: MONSTERS.length,
      moveCount: moveKeys.length,
      statMismatchCount: statMismatches.length,
      typeMismatchCount: typeMismatches.length,
      unsupportedOfficialTypeCount: unsupportedOfficialTypes.length,
      moveDefinitionMismatchCount: moveDefinitionMismatches.length,
      moveDefinitionStrictMismatchCount: moveDefinitionMismatches
        .filter((entry) => !entry.simplified).length,
      levelLearnsetMismatchCount: levelLearnsetMismatches.length,
      projectOnlyMoveSpeciesCount: projectOnlyMoves.length,
      unofficialProjectMoveSpeciesCount: unofficialProjectMoves.length,
    },
    samples: {
      statMismatches: sample(statMismatches),
      typeMismatches: sample(typeMismatches),
      unsupportedOfficialTypes: sample(unsupportedOfficialTypes),
      moveDefinitionMismatches: sample(moveDefinitionMismatches),
      levelLearnsetMismatches: sample(levelLearnsetMismatches),
      projectOnlyMoves: sample(projectOnlyMoves),
      unofficialProjectMoves: sample(unofficialProjectMoves),
      officialSupportedMovesByPokemon: sample(officialSupportedMovesByPokemon, 10),
    },
  }

  console.log(JSON.stringify(report, null, 2))
})
