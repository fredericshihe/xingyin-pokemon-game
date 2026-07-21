import { EVOLUTION_ITEMS, EXP_POTIONS, POKEBALLS, POTIONS, STAT_BOOST_ITEMS } from './gameData.js'
import { getSimpleCatchChancePercent } from './gameBalance.js'

const INVENTORY_ITEM_DEFINITIONS = {
  pokeball: POKEBALLS,
  potion: POTIONS,
  expPotion: EXP_POTIONS,
  statBoost: STAT_BOOST_ITEMS,
  evolutionItem: EVOLUTION_ITEMS,
}

const ACTIVE_INVENTORY_ITEM_TYPES = new Set(['pokeball', 'potion', 'expPotion', 'statBoost'])
const LEGACY_INVENTORY_ITEM_TYPES = new Set(['evolutionItem'])
const SELLABLE_INVENTORY_ITEM_TYPES = new Set(['pokeball', 'potion', 'expPotion'])
const DEFAULT_ITEM_SELL_PRICE_DIVISOR = 6
const INVENTORY_TYPE_SORT_ORDER = ['pokeball', 'potion', 'expPotion', 'statBoost', 'evolutionItem']
const INVENTORY_ITEM_TYPE_ALIASES = {
  ball: 'pokeball',
  balls: 'pokeball',
  boost: 'statBoost',
  stat_boost: 'statBoost',
  statBoostItem: 'statBoost',
  exp: 'expPotion',
  exp_potion: 'expPotion',
}

const normalizeExplicitInventoryItemType = (itemType, itemKey) => {
  if (typeof itemType !== 'string' || itemType.trim().length === 0) return null
  const rawType = itemType.trim()
  if (rawType === 'stone') {
    if (STAT_BOOST_ITEMS[itemKey]) return 'statBoost'
    if (EVOLUTION_ITEMS[itemKey]) return 'evolutionItem'
  }
  return INVENTORY_ITEM_TYPE_ALIASES[rawType] || rawType
}

const inferInventoryItemType = (itemKey) => (
  POKEBALLS[itemKey] ? 'pokeball' :
    POTIONS[itemKey] ? 'potion' :
      EXP_POTIONS[itemKey] ? 'expPotion' :
        STAT_BOOST_ITEMS[itemKey] ? 'statBoost' :
          EVOLUTION_ITEMS[itemKey] ? 'evolutionItem' :
            null
)

export const isActiveInventoryItemType = (itemType) => ACTIVE_INVENTORY_ITEM_TYPES.has(itemType)
export const isLegacyInventoryItemType = (itemType) => LEGACY_INVENTORY_ITEM_TYPES.has(itemType)

export const resolveInventoryItemType = (slot = {}) => {
  const itemKey = typeof slot?.itemKey === 'string' ? slot.itemKey : ''
  const explicitType = normalizeExplicitInventoryItemType(slot?.itemType, itemKey)
  if (explicitType && INVENTORY_ITEM_DEFINITIONS[explicitType]?.[itemKey]) {
    return explicitType
  }
  return inferInventoryItemType(itemKey)
}

export const resolveInventoryItemDetails = (itemType, itemKey) => (
  INVENTORY_ITEM_DEFINITIONS[itemType]?.[itemKey] ||
  POKEBALLS[itemKey] ||
  POTIONS[itemKey] ||
  EXP_POTIONS[itemKey] ||
  STAT_BOOST_ITEMS[itemKey] ||
  EVOLUTION_ITEMS[itemKey] ||
  null
)

export const isSellableInventoryItem = (itemType, itemKey) => {
  const normalizedItemType = resolveInventoryItemType({ itemType, itemKey })
  const details = normalizedItemType ? resolveInventoryItemDetails(normalizedItemType, itemKey) : null
  const price = Math.trunc(Number(details?.price))
  return Boolean(
    normalizedItemType &&
    SELLABLE_INVENTORY_ITEM_TYPES.has(normalizedItemType) &&
    details &&
    !details.notForSale &&
    Number.isSafeInteger(price) &&
    price > 0
  )
}

export const getInventoryItemSellPrice = (itemType, itemKey, {
  divisor = DEFAULT_ITEM_SELL_PRICE_DIVISOR
} = {}) => {
  if (!isSellableInventoryItem(itemType, itemKey)) return 0
  const details = resolveInventoryItemDetails(resolveInventoryItemType({ itemType, itemKey }), itemKey)
  const safeDivisor = Math.max(1, Math.trunc(Number(divisor)) || DEFAULT_ITEM_SELL_PRICE_DIVISOR)
  return Math.max(1, Math.floor((Math.trunc(Number(details.price)) || 0) / safeDivisor))
}

export const getPotionRecoveryProfile = (potion) => {
  const safePotion = potion && typeof potion === 'object' ? potion : {}
  const fullRestore = Boolean(safePotion.fullRestore)
  return {
    hp: fullRestore ? Number.POSITIVE_INFINITY : Math.max(0, Number(safePotion.healAmount) || 0),
    mp: fullRestore ? Number.POSITIVE_INFINITY : Math.max(0, Number(safePotion.mpRestoreAmount) || 0),
    fullRestore,
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
    Object.prototype.hasOwnProperty.call(potion, 'mpRestoreAmount') ||
    Object.prototype.hasOwnProperty.call(potion, 'fullRestore')
  )
  if (!isPotionDefinition) return []
  const recovery = getPotionRecoveryProfile(potion)
  if (recovery.fullRestore) {
    return ['HP/MP 全满', '解除异常']
  }
  return [
    recovery.hp > 0 ? `HP +${recovery.hp}` : null,
    recovery.mp > 0 ? `MP +${recovery.mp}` : null,
    '解除异常',
  ].filter(Boolean)
}

export const getPotionEffectText = (potion) => getPotionEffectParts(potion).join(' / ') || '恢复'

export const getPokeballEffectText = (ball = {}) => {
  const percent = getSimpleCatchChancePercent(ball?.catchRateMultiplier)
  if (percent >= 100) return '成功率100%（必定成功）'
  const attempts = Math.max(2, Math.round(100 / Math.max(1, percent)))
  return `黄血约${percent}%（${attempts}次约1次）`
}

export const STAT_BOOST_STAT_LABELS = {
  hp: 'HP',
  maxHp: 'HP',
  attack: '攻击',
  atk: '攻击',
  defense: '防御',
  def: '防御',
  spAttack: '特攻',
  spAtk: '特攻',
  spDefense: '特防',
  spDef: '特防',
  speed: '速度',
  spd: '速度',
}

export const getStatBoostEffectText = (item = {}) => {
  const amount = Math.max(0, Math.trunc(Number(item?.boostAmount) || 0))
  if (item?.effect === 'stat_boost_all') return `全基础属性 +${amount}`
  const statLabel = STAT_BOOST_STAT_LABELS[item?.stat] || '基础属性'
  return `${statLabel} +${amount}`
}

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
