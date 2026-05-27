import { EVOLUTION_ITEMS, EXP_POTIONS, POKEBALLS, POTIONS } from './gameData.js'

const INVENTORY_ITEM_DEFINITIONS = {
  pokeball: POKEBALLS,
  potion: POTIONS,
  expPotion: EXP_POTIONS,
  evolutionItem: EVOLUTION_ITEMS,
}

const ACTIVE_INVENTORY_ITEM_TYPES = new Set(['pokeball', 'potion', 'expPotion'])
const LEGACY_INVENTORY_ITEM_TYPES = new Set(['evolutionItem'])
const INVENTORY_TYPE_SORT_ORDER = ['pokeball', 'potion', 'expPotion', 'evolutionItem']

export const isActiveInventoryItemType = (itemType) => ACTIVE_INVENTORY_ITEM_TYPES.has(itemType)
export const isLegacyInventoryItemType = (itemType) => LEGACY_INVENTORY_ITEM_TYPES.has(itemType)

export const resolveInventoryItemType = (slot = {}) => (
  slot.itemType ||
  (POKEBALLS[slot.itemKey] ? 'pokeball' :
    POTIONS[slot.itemKey] ? 'potion' :
      EXP_POTIONS[slot.itemKey] ? 'expPotion' :
        EVOLUTION_ITEMS[slot.itemKey] ? 'evolutionItem' :
          null)
)

export const resolveInventoryItemDetails = (itemType, itemKey) => (
  INVENTORY_ITEM_DEFINITIONS[itemType]?.[itemKey] ||
  POKEBALLS[itemKey] ||
  POTIONS[itemKey] ||
  EXP_POTIONS[itemKey] ||
  EVOLUTION_ITEMS[itemKey] ||
  null
)

export const getPotionRecoveryProfile = (potion) => {
  const safePotion = potion && typeof potion === 'object' ? potion : {}
  return {
    hp: Math.max(0, Number(safePotion.healAmount) || 0),
    mp: Math.max(0, Number(safePotion.mpRestoreAmount) || 0),
  }
}

export const hasPotionCurableStatus = (mon = {}) => {
  const primaryStatus = typeof mon?.status === 'string' ? mon.status.trim() : ''
  const volatileStatuses = mon?.volatileStatuses && typeof mon.volatileStatuses === 'object'
    ? mon.volatileStatuses
    : null
  return Boolean(primaryStatus || volatileStatuses?.confusion || volatileStatuses?.flinch)
}

export const clearPotionCurableStatus = (mon = {}) => {
  if (!hasPotionCurableStatus(mon)) return mon

  const primaryStatus = typeof mon?.status === 'string' ? mon.status.trim() : ''
  const currentVolatileStatuses = mon?.volatileStatuses && typeof mon.volatileStatuses === 'object'
    ? mon.volatileStatuses
    : null
  const nextVolatileStatuses = currentVolatileStatuses ? { ...currentVolatileStatuses } : null

  if (nextVolatileStatuses) {
    delete nextVolatileStatuses.confusion
    delete nextVolatileStatuses.flinch
  }

  return {
    ...mon,
    status: primaryStatus ? null : mon.status,
    statusTurns: mon?.statusTurns !== undefined || primaryStatus ? 0 : mon.statusTurns,
    ...(nextVolatileStatuses ? { volatileStatuses: nextVolatileStatuses } : {}),
  }
}

export const getPotionEffectParts = (potion = {}) => {
  const isPotionDefinition = potion && typeof potion === 'object' && (
    Object.prototype.hasOwnProperty.call(potion, 'healAmount') ||
    Object.prototype.hasOwnProperty.call(potion, 'mpRestoreAmount')
  )
  if (!isPotionDefinition) return []
  const recovery = getPotionRecoveryProfile(potion)
  return [
    recovery.hp > 0 ? `HP +${recovery.hp}` : null,
    recovery.mp > 0 ? `MP +${recovery.mp}` : null,
    '解除异常',
  ].filter(Boolean)
}

export const getPotionEffectText = (potion) => getPotionEffectParts(potion).join(' / ') || '恢复'

const collapseInventorySlots = (inventory) => {
  const source = Array.isArray(inventory) ? inventory : []
  return source.reduce((acc, slot) => {
    const itemKey = typeof slot?.itemKey === 'string' ? slot.itemKey : null
    const itemType = resolveInventoryItemType(slot)
    const quantity = Math.trunc(Number(slot?.quantity))
    if (!itemKey || !itemType || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return acc
    }
    if (!isActiveInventoryItemType(itemType)) {
      return acc
    }
    if (!resolveInventoryItemDetails(itemType, itemKey)) {
      return acc
    }

    const existingIndex = acc.findIndex((entry) => entry.itemType === itemType && entry.itemKey === itemKey)
    if (existingIndex >= 0) {
      acc[existingIndex] = {
        ...acc[existingIndex],
        quantity: acc[existingIndex].quantity + quantity,
      }
    } else {
      acc.push({ itemType, itemKey, quantity })
    }
    return acc
  }, [])
}

const getInventoryItemSortIndex = (inventoryType, itemKey) => {
  const typeRank = INVENTORY_TYPE_SORT_ORDER.indexOf(inventoryType)
  const catalog = INVENTORY_ITEM_DEFINITIONS[inventoryType] || {}
  const keyRank = Object.keys(catalog).indexOf(itemKey)
  return [
    typeRank >= 0 ? typeRank : INVENTORY_TYPE_SORT_ORDER.length,
    keyRank >= 0 ? keyRank : Number.MAX_SAFE_INTEGER,
    itemKey,
  ]
}

export const sortInventorySlots = (inventory) => (
  collapseInventorySlots(inventory).sort((slotA, slotB) => {
    const typeA = resolveInventoryItemType(slotA)
    const typeB = resolveInventoryItemType(slotB)
    const rankA = getInventoryItemSortIndex(typeA, slotA.itemKey)
    const rankB = getInventoryItemSortIndex(typeB, slotB.itemKey)
    if (rankA[0] !== rankB[0]) return rankA[0] - rankB[0]
    if (rankA[1] !== rankB[1]) return rankA[1] - rankB[1]
    return String(rankA[2]).localeCompare(String(rankB[2]), 'zh-CN')
  })
)

export const mergeInventoryEntries = (inventory, itemType, itemKey, quantity = 1) => {
  const safeQuantity = Math.trunc(Number(quantity))
  const normalizedItemType = resolveInventoryItemType({ itemType, itemKey })
  if (!normalizedItemType || !itemKey || !Number.isSafeInteger(safeQuantity) || safeQuantity <= 0) {
    return collapseInventorySlots(inventory)
  }

  return collapseInventorySlots([
    ...(Array.isArray(inventory) ? inventory : []),
    { itemType: normalizedItemType, itemKey, quantity: safeQuantity },
  ])
}

export const sanitizePlayerInventory = (inventory) => collapseInventorySlots(inventory)

export const consumeInventoryItem = (inventory, itemType, itemKey, amount = 1) => {
  const safeAmount = Math.trunc(Number(amount))
  const normalizedItemType = resolveInventoryItemType({ itemType, itemKey })
  if (!normalizedItemType || !itemKey || !Number.isSafeInteger(safeAmount) || safeAmount <= 0) {
    return collapseInventorySlots(inventory)
  }

  const collapsed = collapseInventorySlots(inventory)
  return collapsed
    .map((slot) => (
      slot.itemType === normalizedItemType && slot.itemKey === itemKey
        ? { ...slot, quantity: slot.quantity - safeAmount }
        : slot
    ))
    .filter((slot) => slot.quantity > 0)
}

export const getInventoryItemQuantity = (inventory, itemType, itemKey) => {
  const normalizedItemType = resolveInventoryItemType({ itemType, itemKey })
  if (!normalizedItemType || !itemKey) return 0
  const slot = collapseInventorySlots(inventory).find(
    (entry) => entry.itemType === normalizedItemType && entry.itemKey === itemKey
  )
  return slot?.quantity || 0
}
