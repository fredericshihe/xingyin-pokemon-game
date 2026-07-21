export const MASTER_BALL_ITEM_KEY = 'pokeball_master'

const MASTER_BALL_REGION_PURCHASE_FLAG_PREFIX = 'shop:master-ball:purchased:'
const DEFAULT_SHOP_REGION_ID = 'GodotMap'

const normalizeShopRegionId = (mapName) => (
  typeof mapName === 'string' && mapName.trim().length > 0
    ? mapName.trim()
    : DEFAULT_SHOP_REGION_ID
)

export const isMasterBallShopItem = (itemType, itemKey) => (
  itemType === 'pokeball' && itemKey === MASTER_BALL_ITEM_KEY
)

export const getMasterBallRegionPurchaseFlag = (mapName) => (
  `${MASTER_BALL_REGION_PURCHASE_FLAG_PREFIX}${normalizeShopRegionId(mapName)}`
)

export const hasPurchasedMasterBallInRegion = (world, mapName) => (
  Boolean(world?.flags?.[getMasterBallRegionPurchaseFlag(mapName)])
)

export const recordMasterBallPurchaseInRegion = (world, mapName) => {
  const source = world && typeof world === 'object' ? world : {}
  const sourceFlags = source.flags && typeof source.flags === 'object' && !Array.isArray(source.flags)
    ? source.flags
    : {}
  return {
    ...source,
    flags: {
      ...sourceFlags,
      [getMasterBallRegionPurchaseFlag(mapName)]: true
    }
  }
}
