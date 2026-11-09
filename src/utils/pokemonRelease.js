import catalog from './pokemonReleaseCatalog.json'

export const POKEMON_RELEASE_RULE_VERSION = catalog.version
export const POKEMON_RELEASE_WARNING = '放生后无法找回，药水和宝石不退还。图鉴记录会保留。'

const byBaseId = new Map(catalog.species.map((species) => [species.baseId, species]))
const byDexNo = new Map(catalog.species.map((species) => [species.dexNo, species]))
const positiveInteger = (value) => {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

// Instance IDs (p1, p2…) must never be mistaken for species IDs.
export function getPokemonReleaseQuote(monster) {
  if (!monster || typeof monster !== 'object') return null
  const baseId = [monster.baseId, monster.speciesId, monster.templateId, monster.monsterId]
    .map(positiveInteger).find(Boolean)
  const dexNo = [monster.dexNo, monster.pokedexId].map(positiveInteger).find(Boolean)
  const species = baseId ? byBaseId.get(baseId) : dexNo ? byDexNo.get(dexNo) : null
  if (!species || (dexNo && dexNo !== species.dexNo)) return null
  const level = positiveInteger(monster.level)
  if (!level || level > 100) return null
  const rarity = catalog.tiers[species.tier]
  return {
    version: catalog.version,
    baseId: species.baseId,
    dexNo: species.dexNo,
    name: monster.name || species.name,
    level,
    rarity: species.tier,
    rarityLabel: rarity.label,
    gold: Math.round(((50 + level * 5) * rarity.multiplier) / 10) * 10,
    precious: species.tier === 'precious',
  }
}

export function isPokemonReleaseBlockedByBattle(snapshot) {
  return Boolean(snapshot?.activeEnemyId != null && snapshot.activeEnemyId !== '') ||
    snapshot?.view === 'battle' || snapshot?.battleCheckpoint?.status === 'active'
}

// Construct only the intended roster change; no local coins are awarded here.
export function preparePokemonRelease(snapshot, monsterId, from, expectedGold) {
  if (isPokemonReleaseBlockedByBattle(snapshot)) return { success: false, message: '战斗中不能放生。' }
  if (!['party', 'storage', 'pending'].includes(from)) return { success: false, message: '放生来源无效。' }
  const team = Array.isArray(snapshot?.playerTeam) ? snapshot.playerTeam : []
  const storage = Array.isArray(snapshot?.storageBox) ? snapshot.storageBox : []
  const monsters = from === 'party' ? team : from === 'storage' ? storage : [snapshot?.pendingMonsterAcquisition?.monster].filter(Boolean)
  const monster = monsters.find((entry) => String(entry.id) === String(monsterId))
  if (!monster) return { success: false, message: '宝可梦已变化，请重新选择。' }
  if (from === 'party' && team.length <= 1) return { success: false, message: '队伍至少保留一只。' }
  const quote = getPokemonReleaseQuote(monster)
  if (!quote) return { success: false, message: '无法确认放生补偿，请重新读取进度。' }
  if (quote.gold !== expectedGold) return { success: false, message: '补偿金额已变化，请重新确认。' }
  const nextTeam = from === 'party' ? team.filter((entry) => String(entry.id) !== String(monsterId)) : team
  const nextStorage = from === 'storage' ? storage.filter((entry) => String(entry.id) !== String(monsterId)) : storage
  return {
    success: true,
    quote,
    snapshot: {
      ...snapshot,
      playerTeam: nextTeam,
      storageBox: nextStorage,
      activePlayerId: nextTeam.some((entry) => entry.id === snapshot.activePlayerId) ? snapshot.activePlayerId : nextTeam[0]?.id ?? null,
      pendingMonsterAcquisition: from === 'pending' ? null : snapshot.pendingMonsterAcquisition,
    },
  }
}
