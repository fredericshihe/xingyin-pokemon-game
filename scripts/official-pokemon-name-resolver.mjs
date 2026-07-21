export const POKEAPI_ROOT = 'https://pokeapi.co/api/v2'

export const normalizePokemonName = (name) => (
  String(name || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[・·]/g, '')
    .toLowerCase()
)

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const fetchJson = async (url, attempt = 1) => {
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

export const mapLimit = async (items, limit, mapper) => {
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

const getSpeciesDisplayNames = (species) => (
  (species?.names || []).map((entry) => ({
    language: entry.language?.name,
    name: entry.name,
  }))
)

const getPreferredLocalizedName = (species) => (
  getSpeciesDisplayNames(species).find((entry) => entry.language === 'zh-hans')?.name ||
  getSpeciesDisplayNames(species).find((entry) => entry.language === 'zh-hant')?.name ||
  getSpeciesDisplayNames(species).find((entry) => entry.language === 'en')?.name ||
  species?.name ||
  null
)

const getIndexableSpeciesNames = (species) => [
  species?.name,
  ...getSpeciesDisplayNames(species).map((entry) => entry.name),
].filter(Boolean)

const addSpeciesNameIndexEntry = (index, rawName, species) => {
  const key = normalizePokemonName(rawName)
  if (!key) return
  if (!index.has(key)) index.set(key, new Map())
  index.get(key).set(species.name, species)
}

export const fetchOfficialSpeciesNameIndex = async ({ concurrency = 24 } = {}) => {
  const list = await fetchJson(`${POKEAPI_ROOT}/pokemon-species?limit=2000`)
  const speciesRows = await mapLimit(list.results || [], concurrency, async (entry) => fetchJson(entry.url))
  const index = new Map()

  for (const species of speciesRows) {
    for (const name of getIndexableSpeciesNames(species)) {
      addSpeciesNameIndexEntry(index, name, species)
    }
  }

  return index
}

export const resolveOfficialSpeciesByPokemonName = async (monsters, {
  concurrency = 24,
} = {}) => {
  const nameIndex = await fetchOfficialSpeciesNameIndex({ concurrency })
  const matched = []
  const unmatched = []
  const ambiguous = []

  for (const monster of monsters) {
    const normalizedName = normalizePokemonName(monster?.name)
    const rows = [...(nameIndex.get(normalizedName)?.values() || [])]
    if (rows.length === 0) {
      unmatched.push({
        id: monster?.id,
        dexNo: monster?.dexNo,
        name: monster?.name,
      })
      continue
    }
    if (rows.length > 1) {
      ambiguous.push({
        id: monster?.id,
        dexNo: monster?.dexNo,
        name: monster?.name,
        candidates: rows.map((species) => ({
          speciesName: species.name,
          officialName: getPreferredLocalizedName(species),
        })),
      })
      continue
    }
    matched.push({
      monster,
      species: rows[0],
      speciesName: rows[0].name,
      officialName: getPreferredLocalizedName(rows[0]),
    })
  }

  return { matched, unmatched, ambiguous }
}

export const getDefaultPokemonUrlForSpecies = (species) => (
  species?.varieties?.find((entry) => entry.is_default)?.pokemon?.url ||
  species?.varieties?.[0]?.pokemon?.url ||
  (species?.name ? `${POKEAPI_ROOT}/pokemon/${species.name}` : null)
)
