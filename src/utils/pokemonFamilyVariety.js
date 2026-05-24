import { MONSTERS } from './gameData.js'
import { isLevelValidForSpecies } from './wildEncounterRules.js'

const uniqueIntegerList = (values = []) => (
  Array.from(new Set((Array.isArray(values) ? values : []).map((value) => Math.trunc(Number(value))).filter(Number.isInteger)))
)

export function getEvolutionTargetIds(monster) {
  return [
    monster?.evolvesTo,
    ...(Array.isArray(monster?.alternateEvolutions) ? monster.alternateEvolutions : [])
  ]
    .map((evolution) => Math.trunc(Number(evolution?.targetId)))
    .filter(Number.isInteger)
}

export function getEvolutionFamilyIds(monsterId, monsters = MONSTERS) {
  const normalizedMonsterId = Math.trunc(Number(monsterId))
  if (!Number.isInteger(normalizedMonsterId)) return new Set()

  const family = new Set([normalizedMonsterId])
  let changed = true

  while (changed) {
    changed = false
    monsters.forEach((candidate) => {
      const candidateId = Math.trunc(Number(candidate?.id))
      if (!Number.isInteger(candidateId)) return
      const targets = getEvolutionTargetIds(candidate)
      const touchesFamily = family.has(candidateId) || targets.some((targetId) => family.has(targetId))
      if (!touchesFamily) return
      if (!family.has(candidateId)) {
        family.add(candidateId)
        changed = true
      }
      targets.forEach((targetId) => {
        if (!family.has(targetId)) {
          family.add(targetId)
          changed = true
        }
      })
    })
  }

  return family
}

export function getEvolutionFamilyKey(monsterId, monsters = MONSTERS) {
  const familyIds = [...getEvolutionFamilyIds(monsterId, monsters)].sort((left, right) => left - right)
  return familyIds.length > 0 ? familyIds.join(':') : ''
}

const sortCandidatesByLocalPool = (candidateIds = [], localPoolIds = []) => {
  const localPriority = new Map(uniqueIntegerList(localPoolIds).map((pokemonId, index) => [pokemonId, index]))
  return uniqueIntegerList(candidateIds).sort((left, right) => {
    const leftPriority = localPriority.has(left) ? localPriority.get(left) : Number.POSITIVE_INFINITY
    const rightPriority = localPriority.has(right) ? localPriority.get(right) : Number.POSITIVE_INFINITY
    return leftPriority - rightPriority || left - right
  })
}

const buildPreferredCandidateBuckets = (preferredIds = [], localPoolIds = [], monsters = MONSTERS) => {
  const normalizedPreferredIds = uniqueIntegerList(preferredIds)
  const sameFamilyCandidates = normalizedPreferredIds.flatMap((pokemonId) => {
    const familyIds = getEvolutionFamilyIds(pokemonId, monsters)
    return sortCandidatesByLocalPool([...familyIds], localPoolIds)
  })

  return [
    normalizedPreferredIds,
    sameFamilyCandidates,
    uniqueIntegerList(localPoolIds)
  ]
}

const isCandidateAllowed = ({
  candidateId,
  level,
  usedSpeciesIds,
  usedFamilyKeys,
  allowSpeciesReuse,
  allowFamilyReuse
}) => {
  if (!Number.isInteger(candidateId) || !isLevelValidForSpecies(candidateId, level)) return false
  if (!allowSpeciesReuse && usedSpeciesIds.has(candidateId)) return false
  if (allowFamilyReuse) return true
  const familyKey = getEvolutionFamilyKey(candidateId)
  return familyKey.length === 0 || !usedFamilyKeys.has(familyKey)
}

export function resolveSpeciesForLevelWithVariety({
  preferredIds = [],
  level,
  localPoolIds = [],
  usedSpeciesIds = new Set(),
  usedFamilyKeys = new Set(),
  monsters = MONSTERS
} = {}) {
  const safeLevel = Math.max(1, Math.min(100, Math.trunc(Number(level)) || 1))
  const candidateBuckets = buildPreferredCandidateBuckets(preferredIds, localPoolIds, monsters)
  const attempts = [
    { allowSpeciesReuse: false, allowFamilyReuse: false },
    { allowSpeciesReuse: false, allowFamilyReuse: true },
    { allowSpeciesReuse: true, allowFamilyReuse: true }
  ]

  for (const attempt of attempts) {
    for (const bucket of candidateBuckets) {
      for (const candidateId of bucket) {
        if (!isCandidateAllowed({
          candidateId,
          level: safeLevel,
          usedSpeciesIds,
          usedFamilyKeys,
          allowSpeciesReuse: attempt.allowSpeciesReuse,
          allowFamilyReuse: attempt.allowFamilyReuse
        })) {
          continue
        }
        return candidateId
      }
    }
  }

  return null
}
