export const MAX_PARTY_SIZE = 6
export const MAX_STORAGE_SIZE = 100
export const MIN_PARTY_SIZE = 1

const asArray = (value) => (Array.isArray(value) ? value : [])

const uniqueById = (items, seen = new Set()) => {
  const result = []
  asArray(items).forEach((item) => {
    if (!item || item.id === undefined || item.id === null) return
    const key = String(item.id)
    if (seen.has(key)) return
    seen.add(key)
    result.push(item)
  })
  return result
}

const resolveActiveId = (party, activeId) => (
  party.some((monster) => monster.id === activeId)
    ? activeId
    : party[0]?.id ?? null
)

export function sanitizeRoster(playerTeam = [], storageBox = [], activePlayerId = null) {
  const partySeen = new Set()
  const rawParty = uniqueById(playerTeam, partySeen)
  const party = rawParty.slice(0, MAX_PARTY_SIZE)
  const storageSeen = new Set(party.map((monster) => String(monster.id)))
  const storage = uniqueById([...rawParty.slice(MAX_PARTY_SIZE), ...asArray(storageBox)], storageSeen)
    .slice(0, MAX_STORAGE_SIZE)

  return {
    playerTeam: party,
    storageBox: storage,
    activePlayerId: resolveActiveId(party, activePlayerId)
  }
}

export function acquireMonster(ctx, monster) {
  const cleanMonster = monster ? { ...monster } : null
  if (!cleanMonster) {
    return { success: false, error: 'invalid_monster' }
  }

  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (roster.playerTeam.length < MAX_PARTY_SIZE) {
    const playerTeam = [...roster.playerTeam, cleanMonster]
    return {
      success: true,
      outcome: 'party',
      playerTeam,
      storageBox: roster.storageBox,
      activePlayerId: roster.activePlayerId || cleanMonster.id
    }
  }

  return {
    success: true,
    needsDecision: true,
    monster: cleanMonster,
    options: roster.storageBox.length < MAX_STORAGE_SIZE
      ? ['replace', 'storage', 'release']
      : ['replace', 'release']
  }
}

export function addToStorage(ctx, monster) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (roster.storageBox.length >= MAX_STORAGE_SIZE) {
    return { success: false, error: 'storage_full', ...roster }
  }
  return {
    success: true,
    outcome: 'storage',
    playerTeam: roster.playerTeam,
    storageBox: [...roster.storageBox, { ...monster }],
    activePlayerId: roster.activePlayerId
  }
}

export function depositToStorage(ctx, partyId) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (roster.playerTeam.length <= MIN_PARTY_SIZE) {
    return { success: false, error: 'min_party', ...roster }
  }
  if (roster.storageBox.length >= MAX_STORAGE_SIZE) {
    return { success: false, error: 'storage_full', ...roster }
  }

  const target = roster.playerTeam.find((monster) => monster.id === partyId)
  if (!target) return { success: false, error: 'not_found', ...roster }

  const playerTeam = roster.playerTeam.filter((monster) => monster.id !== partyId)
  return {
    success: true,
    playerTeam,
    storageBox: [...roster.storageBox, target],
    activePlayerId: resolveActiveId(playerTeam, roster.activePlayerId)
  }
}

export function withdrawToParty(ctx, storageId) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (roster.playerTeam.length >= MAX_PARTY_SIZE) {
    return { success: false, error: 'party_full', ...roster }
  }

  const target = roster.storageBox.find((monster) => monster.id === storageId)
  if (!target) return { success: false, error: 'not_found', ...roster }

  const playerTeam = [...roster.playerTeam, target]
  return {
    success: true,
    playerTeam,
    storageBox: roster.storageBox.filter((monster) => monster.id !== storageId),
    activePlayerId: roster.activePlayerId || target.id
  }
}

export function swapPartyAndStorage(ctx, partyId, storageId) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  const partyIndex = roster.playerTeam.findIndex((monster) => monster.id === partyId)
  const storageIndex = roster.storageBox.findIndex((monster) => monster.id === storageId)
  if (partyIndex < 0 || storageIndex < 0) {
    return { success: false, error: 'not_found', ...roster }
  }

  const playerTeam = [...roster.playerTeam]
  const storageBox = [...roster.storageBox]
  const oldPartyMonster = playerTeam[partyIndex]
  playerTeam[partyIndex] = storageBox[storageIndex]
  storageBox[storageIndex] = oldPartyMonster

  return {
    success: true,
    playerTeam,
    storageBox,
    activePlayerId: roster.activePlayerId === oldPartyMonster.id ? playerTeam[partyIndex].id : roster.activePlayerId
  }
}

export function replacePartyMember(ctx, partyId, incomingMonster) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  const partyIndex = roster.playerTeam.findIndex((monster) => monster.id === partyId)
  if (partyIndex < 0 || !incomingMonster) {
    return { success: false, error: 'not_found', ...roster }
  }
  if (roster.storageBox.length >= MAX_STORAGE_SIZE) {
    return { success: false, error: 'storage_full', ...roster }
  }

  const playerTeam = [...roster.playerTeam]
  const replacedMonster = playerTeam[partyIndex]
  playerTeam[partyIndex] = { ...incomingMonster }

  return {
    success: true,
    playerTeam,
    storageBox: [...roster.storageBox, replacedMonster],
    activePlayerId: roster.activePlayerId === replacedMonster.id ? incomingMonster.id : roster.activePlayerId,
    replacedMonster
  }
}

export function releaseMonster(ctx, id, { from } = {}) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (from === 'party') {
    if (roster.playerTeam.length <= MIN_PARTY_SIZE) {
      return { success: false, error: 'min_party', ...roster }
    }
    const target = roster.playerTeam.find((monster) => monster.id === id)
    if (!target) return { success: false, error: 'not_found', ...roster }
    const playerTeam = roster.playerTeam.filter((monster) => monster.id !== id)
    return {
      success: true,
      playerTeam,
      storageBox: roster.storageBox,
      activePlayerId: resolveActiveId(playerTeam, roster.activePlayerId),
      releasedMonster: target
    }
  }

  const target = roster.storageBox.find((monster) => monster.id === id)
  if (!target) return { success: false, error: 'not_found', ...roster }
  return {
    success: true,
    playerTeam: roster.playerTeam,
    storageBox: roster.storageBox.filter((monster) => monster.id !== id),
    activePlayerId: roster.activePlayerId,
    releasedMonster: target
  }
}
