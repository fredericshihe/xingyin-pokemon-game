#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const POKEAPI_ROOT = 'https://pokeapi.co/api/v2'
const sample = (items, limit = 20) => items.slice(0, limit)

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

const getOfficialChineseName = (species) => (
  species?.names?.find((entry) => entry.language?.name === 'zh-hans')?.name ||
  species?.names?.find((entry) => entry.language?.name === 'zh-hant')?.name ||
  species?.names?.find((entry) => entry.language?.name === 'ja')?.name ||
  species?.name ||
  null
)

await withViteAuditServer(async ({ loadModule }) => {
  const { MONSTERS } = await loadModule('/src/utils/gameData.js')
  const speciesRows = await mapLimit(MONSTERS, 10, async (monster) => ({
    monster,
    species: await fetchJson(`${POKEAPI_ROOT}/pokemon-species/${monster.dexNo}`),
  }))

  const nameMismatches = []
  const missingOfficialNames = []
  const duplicateDexNos = []
  const seenDexNos = new Map()

  for (const { monster, species } of speciesRows) {
    const dexNo = Number(monster?.dexNo ?? monster?.pokedexId)
    const officialName = getOfficialChineseName(species)

    if (seenDexNos.has(dexNo)) {
      duplicateDexNos.push({
        dexNo,
        first: seenDexNos.get(dexNo),
        duplicate: { id: monster.id, name: monster.name },
      })
    } else {
      seenDexNos.set(dexNo, { id: monster.id, name: monster.name })
    }

    if (!officialName) {
      missingOfficialNames.push({
        id: monster.id,
        dexNo,
        name: monster.name,
      })
      continue
    }

    if (monster.name !== officialName) {
      nameMismatches.push({
        id: monster.id,
        dexNo,
        localName: monster.name,
        officialName,
      })
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      species: `${POKEAPI_ROOT}/pokemon-species/{dexNo}`,
      preferredLanguages: ['zh-hans', 'zh-hant', 'ja'],
    },
    summary: {
      monsterCount: MONSTERS.length,
      duplicateDexNoCount: duplicateDexNos.length,
      missingOfficialNameCount: missingOfficialNames.length,
      nameMismatchCount: nameMismatches.length,
    },
    samples: {
      duplicateDexNos: sample(duplicateDexNos),
      missingOfficialNames: sample(missingOfficialNames),
      nameMismatches: sample(nameMismatches),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (duplicateDexNos.length > 0 || missingOfficialNames.length > 0 || nameMismatches.length > 0) {
    process.exitCode = 1
  }
})
