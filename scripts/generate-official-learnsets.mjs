#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

const POKEAPI_ROOT = 'https://pokeapi.co/api/v2'
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchJson = async (url, attempt = 1) => {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
    }
    return response.json()
  } catch (error) {
    if (attempt >= 4) throw error
    await wait(350 * attempt)
    return fetchJson(url, attempt + 1)
  }
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
  const uniqueDexNos = [...new Set(MONSTERS.map((monster) => Number(monster.dexNo)))]
    .filter((dexNo) => Number.isInteger(dexNo) && dexNo > 0)
    .sort((a, b) => a - b)

  const rows = await mapLimit(uniqueDexNos, 6, async (dexNo) => {
    const apiPokemon = await fetchJson(`${POKEAPI_ROOT}/pokemon/${dexNo}`)
    const versionGroup = getLatestLearnsetVersionGroup(apiPokemon)
    return {
      dexNo,
      versionGroup,
      learnset: getSupportedOfficialLearnset(apiPokemon, versionGroup, supportedMoves),
    }
  })

  const learnsets = Object.fromEntries(
    rows.map(({ dexNo, learnset }) => [dexNo, learnset])
  )
  const versionGroups = Object.fromEntries(
    rows.map(({ dexNo, versionGroup }) => [dexNo, versionGroup])
  )

  const output = `// Generated by scripts/generate-official-learnsets.mjs\n` +
    `// Source: PokeAPI pokemon move version-group data (${new Date().toISOString()})\n` +
    `// Shape: dexNo -> moveKey -> first level learned in the selected version group.\n\n` +
    `export const OFFICIAL_LEVEL_UP_LEARNSETS_BY_DEX_NO = ${renderObject(learnsets)}\n\n` +
    `export const OFFICIAL_LEARNSET_VERSION_GROUP_BY_DEX_NO = ${renderObject(versionGroups)}\n\n` +
    `export const getOfficialLearnLevelByMove = (monster) => {\n` +
    `  const dexNo = Number(monster?.dexNo ?? monster?.pokedexId)\n` +
    `  return OFFICIAL_LEVEL_UP_LEARNSETS_BY_DEX_NO[dexNo] || {}\n` +
    `}\n`

  const outputPath = path.join(rootDir, OUTPUT_PATH)
  await fs.writeFile(outputPath, output)
  console.log(JSON.stringify({
    outputPath,
    dexNoCount: rows.length,
    nonEmptyLearnsetCount: rows.filter((row) => Object.keys(row.learnset).length > 0).length,
  }, null, 2))
})
