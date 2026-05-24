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

const dexNoFromSpeciesUrl = (url) => {
  const match = String(url || '').match(/\/pokemon-species\/(\d+)\/?$/)
  return match ? Number(match[1]) : null
}

const getEvolutionBranches = (monster) => [
  monster?.evolvesTo,
  ...(Array.isArray(monster?.alternateEvolutions) ? monster.alternateEvolutions : []),
].filter((branch) => branch && branch.disabled !== true)

const compactDetails = (details = []) => details.map((detail) => ({
  trigger: detail.trigger?.name || null,
  minLevel: Number.isInteger(detail.min_level) ? detail.min_level : null,
  item: detail.item?.name || null,
  heldItem: detail.held_item?.name || null,
  knownMove: detail.known_move?.name || null,
  minHappiness: Number.isInteger(detail.min_happiness) ? detail.min_happiness : null,
  timeOfDay: detail.time_of_day || null,
  relativePhysicalStats: Number.isInteger(detail.relative_physical_stats) ? detail.relative_physical_stats : null,
  needsOverworldRain: Boolean(detail.needs_overworld_rain),
})).sort((a, b) => (
  String(a.trigger).localeCompare(String(b.trigger)) ||
  (a.minLevel ?? 999) - (b.minLevel ?? 999) ||
  String(a.item).localeCompare(String(b.item))
))

const walkEvolutionChain = (node, rows = []) => {
  const fromDexNo = dexNoFromSpeciesUrl(node?.species?.url)
  for (const child of node?.evolves_to || []) {
    const toDexNo = dexNoFromSpeciesUrl(child?.species?.url)
    if (fromDexNo && toDexNo) {
      rows.push({
        fromDexNo,
        toDexNo,
        details: compactDetails(child.evolution_details),
      })
    }
    walkEvolutionChain(child, rows)
  }
  return rows
}

const classifyBranch = ({ localLevel, localHasExplicitLevel, officialDetails }) => {
  const officialLevels = officialDetails
    .map((detail) => detail.minLevel)
    .filter(Number.isInteger)
  const hasMatchingOfficialLevel = Number.isInteger(localLevel) && officialLevels.includes(localLevel)
  const hasOfficialFixedLevel = officialLevels.length > 0

  if (hasMatchingOfficialLevel) return 'official-level-match'
  if (localHasExplicitLevel && hasOfficialFixedLevel) return 'level-mismatch'
  if (localHasExplicitLevel && !hasOfficialFixedLevel) return 'level-override-for-non-level-official'
  if (!localHasExplicitLevel && Number.isInteger(localLevel) && !hasOfficialFixedLevel) return 'simplified-non-level-to-game-level'
  if (!localHasExplicitLevel && Number.isInteger(localLevel) && hasOfficialFixedLevel) return 'method-simplified-but-official-has-level'
  return 'method-only-or-no-game-level'
}

await withViteAuditServer(async ({ loadModule }) => {
  const [{ MONSTERS }, { getEvolutionLevelForBranch }] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonGrowth.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const monsterByDexNo = new Map(MONSTERS.map((monster) => [Number(monster.dexNo), monster]))
  const monstersWithBranches = MONSTERS.filter((monster) => getEvolutionBranches(monster).length > 0)
  const localDexNos = new Set(MONSTERS.map((monster) => Number(monster.dexNo)))
  const speciesCache = new Map()
  const chainCache = new Map()

  const getSpecies = async (dexNo) => {
    if (!speciesCache.has(dexNo)) {
      speciesCache.set(dexNo, await fetchJson(`${POKEAPI_ROOT}/pokemon-species/${dexNo}`))
    }
    return speciesCache.get(dexNo)
  }

  const officialRelationByKey = new Map()
  for (const monster of MONSTERS) {
    const species = await getSpecies(monster.dexNo)
    const chainUrl = species.evolution_chain?.url
    if (!chainUrl) continue
    if (!chainCache.has(chainUrl)) {
      chainCache.set(chainUrl, await fetchJson(chainUrl))
    }
    for (const row of walkEvolutionChain(chainCache.get(chainUrl).chain)) {
      officialRelationByKey.set(`${row.fromDexNo}->${row.toDexNo}`, row)
    }
  }

  const branchAudits = []
  for (const monster of monstersWithBranches) {
    for (const branch of getEvolutionBranches(monster)) {
      const target = monsterById.get(Number(branch.targetId))
      const localLevel = getEvolutionLevelForBranch(monster, branch)
      const localHasExplicitLevel = Number.isInteger(Number(branch.level))
      const key = `${monster.dexNo}->${target?.dexNo}`
      const officialRelation = officialRelationByKey.get(key)
      const status = officialRelation
        ? classifyBranch({ localLevel, localHasExplicitLevel, officialDetails: officialRelation.details })
        : 'official-relation-missing'

      branchAudits.push({
        status,
        fromId: monster.id,
        fromDexNo: monster.dexNo,
        fromName: monster.name,
        toId: branch.targetId,
        toDexNo: target?.dexNo ?? null,
        toName: target?.name ?? null,
        localLevel,
        localMethod: branch.method || (localHasExplicitLevel ? 'level' : null),
        localItem: branch.item || null,
        localCondition: branch.condition || null,
        officialDetails: officialRelation?.details || [],
      })
    }
  }

  const localRelationKeys = new Set(branchAudits.map((row) => `${row.fromDexNo}->${row.toDexNo}`))
  const missingOfficialBranches = [...officialRelationByKey.values()]
    .filter((row) => localDexNos.has(row.fromDexNo))
    .filter((row) => !localRelationKeys.has(`${row.fromDexNo}->${row.toDexNo}`))
    .map((row) => {
      const source = monsterByDexNo.get(row.fromDexNo)
      const target = monsterByDexNo.get(row.toDexNo)
      return {
        fromDexNo: row.fromDexNo,
        fromName: source?.name ?? null,
        toDexNo: row.toDexNo,
        toName: target?.name ?? null,
        targetInProject: Boolean(target),
        officialDetails: row.details,
      }
    })
    .sort((a, b) => a.fromDexNo - b.fromDexNo || a.toDexNo - b.toDexNo)

  const statusCounts = branchAudits.reduce((counts, row) => ({
    ...counts,
    [row.status]: (counts[row.status] || 0) + 1,
  }), {})

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      species: `${POKEAPI_ROOT}/pokemon-species/{dexNo}`,
      evolutionChain: 'pokemon-species.evolution_chain.url',
    },
    summary: {
      monsterCount: MONSTERS.length,
      monstersWithEvolutionBranches: monstersWithBranches.length,
      branchCount: branchAudits.length,
      missingOfficialBranchCount: missingOfficialBranches.length,
      missingOfficialBranchTargetInProjectCount: missingOfficialBranches.filter((row) => row.targetInProject).length,
      statusCounts,
    },
    samples: {
      levelMismatch: sample(branchAudits.filter((row) => row.status === 'level-mismatch')),
      levelOverrideForNonLevelOfficial: sample(branchAudits.filter((row) => row.status === 'level-override-for-non-level-official')),
      simplifiedNonLevelToGameLevel: sample(branchAudits.filter((row) => row.status === 'simplified-non-level-to-game-level')),
      officialRelationMissing: sample(branchAudits.filter((row) => row.status === 'official-relation-missing')),
      missingOfficialBranches: sample(missingOfficialBranches),
    },
    branches: branchAudits,
    missingOfficialBranches,
  }

  console.log(JSON.stringify(report, null, 2))
})
