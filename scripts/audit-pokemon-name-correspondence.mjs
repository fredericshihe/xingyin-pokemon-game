#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'
import {
  POKEAPI_ROOT,
  normalizePokemonName,
  resolveOfficialSpeciesByPokemonName,
} from './official-pokemon-name-resolver.mjs'

const sample = (items, limit = 20) => items.slice(0, limit)

await withViteAuditServer(async ({ loadModule }) => {
  const { MONSTERS } = await loadModule('/src/utils/gameData.js')
  const { matched, unmatched, ambiguous } = await resolveOfficialSpeciesByPokemonName(MONSTERS)
  const duplicateDexNos = []
  const duplicateNames = []
  const seenDexNos = new Map()
  const seenNames = new Map()
  const normalizedNameMatches = []

  for (const monster of MONSTERS) {
    const dexNo = Number(monster?.dexNo ?? monster?.pokedexId)
    if (seenDexNos.has(dexNo)) {
      duplicateDexNos.push({
        dexNo,
        first: seenDexNos.get(dexNo),
        duplicate: { id: monster.id, name: monster.name },
      })
    } else {
      seenDexNos.set(dexNo, { id: monster.id, name: monster.name })
    }

    const normalizedName = normalizePokemonName(monster.name)
    if (seenNames.has(normalizedName)) {
      duplicateNames.push({
        normalizedName,
        first: seenNames.get(normalizedName),
        duplicate: { id: monster.id, name: monster.name },
      })
    } else {
      seenNames.set(normalizedName, { id: monster.id, name: monster.name })
    }
  }

  for (const { monster, speciesName, officialName } of matched) {
    if (officialName && monster.name !== officialName && normalizePokemonName(monster.name) === normalizePokemonName(officialName)) {
      normalizedNameMatches.push({
        id: monster.id,
        dexNo: monster.dexNo,
        localName: monster.name,
        officialName,
        speciesName,
      })
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      speciesList: `${POKEAPI_ROOT}/pokemon-species?limit=2000`,
      speciesDetails: `${POKEAPI_ROOT}/pokemon-species/{species-name}`,
      matchRule: 'local Pokemon name matched against official localized species names',
    },
    summary: {
      monsterCount: MONSTERS.length,
      nameMatchedCount: matched.length,
      unmatchedNameCount: unmatched.length,
      ambiguousNameCount: ambiguous.length,
      duplicateDexNoCount: duplicateDexNos.length,
      duplicateNameCount: duplicateNames.length,
      normalizedNameMatchCount: normalizedNameMatches.length,
    },
    samples: {
      unmatched,
      ambiguous,
      duplicateDexNos: sample(duplicateDexNos),
      duplicateNames: sample(duplicateNames),
      normalizedNameMatches: sample(normalizedNameMatches),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (unmatched.length > 0 || ambiguous.length > 0 || duplicateNames.length > 0) {
    process.exitCode = 1
  }
})
