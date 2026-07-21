#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'
import {
  fetchJson,
  getDefaultPokemonUrlForSpecies,
  mapLimit,
  resolveOfficialSpeciesByPokemonName,
} from './official-pokemon-name-resolver.mjs'

const OUTPUT_PATH = 'src/utils/officialLearnsets.js'
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

const getMoveDetailsForGroup = (pokemonMove, versionGroup) => pokemonMove.version_group_details
  .filter((detail) => detail.version_group.name === versionGroup)

const getLatestLearnsetVersionGroup = (apiPokemon) => VERSION_GROUP_PRIORITY.find((versionGroup) => (
  apiPokemon.moves.some((move) => getMoveDetailsForGroup(move, versionGroup)
    .some((detail) => detail.move_learn_method.name === 'level-up'))
)) || null

const getSupportedOfficialLearnset = (apiPokemon, versionGroup, supportedMoves) => {
  if (!versionGroup) return {}

  const learnset = {}
  for (const move of apiPokemon.moves) {
    const moveKey = API_MOVE_TO_KEY[move.move.name] || move.move.name.replaceAll('-', '_')
    if (!supportedMoves.has(moveKey)) continue

    for (const detail of getMoveDetailsForGroup(move, versionGroup)) {
      if (detail.move_learn_method.name !== 'level-up') continue
      if (!Number.isInteger(detail.level_learned_at)) continue
      const level = Math.max(1, detail.level_learned_at)
      learnset[moveKey] = Math.min(learnset[moveKey] ?? level, level)
    }
  }
  return Object.fromEntries(
    Object.entries(learnset).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
  )
}

const renderObject = (object, indent = 0) => {
  const pad = ' '.repeat(indent)
  const innerPad = ' '.repeat(indent + 2)
  const entries = Object.entries(object)
  if (entries.length === 0) return '{}'
  return `{\n${entries.map(([key, value]) => {
    const renderedKey = /^[a-zA-Z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
    const renderedValue = value && typeof value === 'object' && !Array.isArray(value)
      ? renderObject(value, indent + 2)
      : JSON.stringify(value)
    return `${innerPad}${renderedKey}: ${renderedValue},`
  }).join('\n')}\n${pad}}`
}

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const { MONSTERS, MOVES } = await loadModule('/src/utils/gameData.js')
  const supportedMoves = new Set(Object.keys(MOVES))
  const { matched, unmatched, ambiguous } = await resolveOfficialSpeciesByPokemonName(MONSTERS)
  if (unmatched.length > 0 || ambiguous.length > 0) {
    console.error(JSON.stringify({ unmatched, ambiguous }, null, 2))
    process.exitCode = 1
    return
  }

  const rows = await mapLimit(matched, 6, async ({ monster, species, speciesName }) => {
    const pokemonUrl = getDefaultPokemonUrlForSpecies(species)
    const apiPokemon = await fetchJson(pokemonUrl)
    const versionGroup = getLatestLearnsetVersionGroup(apiPokemon)
    return {
      name: monster.name,
      speciesName,
      pokemonName: apiPokemon.name,
      versionGroup,
      learnset: getSupportedOfficialLearnset(apiPokemon, versionGroup, supportedMoves),
    }
  })

  const learnsets = Object.fromEntries(
    rows
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
      .map(({ name, learnset }) => [name, learnset])
  )
  const versionGroups = Object.fromEntries(
    rows
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
      .map(({ name, versionGroup }) => [name, versionGroup])
  )
  const speciesNames = Object.fromEntries(
    rows
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
      .map(({ name, speciesName }) => [name, speciesName])
  )
  const pokemonNames = Object.fromEntries(
    rows
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
      .map(({ name, pokemonName }) => [name, pokemonName])
  )

  const output = `// Generated by scripts/generate-official-learnsets.mjs\n` +
    `// Source: PokeAPI pokemon-species localized names + pokemon move version-group data (${new Date().toISOString()})\n` +
    `// Shape: local Pokemon name -> moveKey -> first level learned in the selected version group.\n\n` +
    `export const OFFICIAL_SPECIES_NAME_BY_POKEMON_NAME = ${renderObject(speciesNames)}\n\n` +
    `export const OFFICIAL_POKEMON_API_NAME_BY_POKEMON_NAME = ${renderObject(pokemonNames)}\n\n` +
    `export const OFFICIAL_LEVEL_UP_LEARNSETS_BY_POKEMON_NAME = ${renderObject(learnsets)}\n\n` +
    `export const OFFICIAL_LEARNSET_VERSION_GROUP_BY_POKEMON_NAME = ${renderObject(versionGroups)}\n\n` +
    `const normalizeOfficialPokemonName = (name) => String(name || '').normalize('NFKC').replace(/\\s+/g, '').replace(/[・·]/g, '').toLowerCase()\n\n` +
    `const OFFICIAL_POKEMON_NAME_BY_NORMALIZED_NAME = Object.fromEntries(\n` +
    `  Object.keys(OFFICIAL_LEVEL_UP_LEARNSETS_BY_POKEMON_NAME).map((name) => [normalizeOfficialPokemonName(name), name])\n` +
    `)\n\n` +
    `export const getOfficialPokemonNameKey = (monster) => OFFICIAL_POKEMON_NAME_BY_NORMALIZED_NAME[normalizeOfficialPokemonName(monster?.name)] || null\n\n` +
    `export const getOfficialLearnLevelByMove = (monster) => {\n` +
    `  const nameKey = getOfficialPokemonNameKey(monster)\n` +
    `  return nameKey ? (OFFICIAL_LEVEL_UP_LEARNSETS_BY_POKEMON_NAME[nameKey] || {}) : {}\n` +
    `}\n\n` +
    `export const getOfficialLearnsetVersionGroup = (monster) => {\n` +
    `  const nameKey = getOfficialPokemonNameKey(monster)\n` +
    `  return nameKey ? (OFFICIAL_LEARNSET_VERSION_GROUP_BY_POKEMON_NAME[nameKey] || null) : null\n` +
    `}\n`

  const outputPath = path.join(rootDir, OUTPUT_PATH)
  await fs.writeFile(outputPath, output)
  console.log(JSON.stringify({
    outputPath,
    pokemonNameCount: rows.length,
    nonEmptyLearnsetCount: rows.filter((row) => Object.keys(row.learnset).length > 0).length,
    unmatchedCount: unmatched.length,
    ambiguousCount: ambiguous.length,
  }, null, 2))
})
