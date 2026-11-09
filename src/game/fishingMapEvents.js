import { FISHING_MERCHANTS, FISHING_SPOTS } from './fishingCatalog.js'

// Final runtime-grid shore positions. Floats stay in water; interaction markers
// stay on land and use the existing adjacent-info interaction contract.
export const FISHING_SPOT_PLACEMENTS = Object.freeze({
  valley_shallows: { x: 28, y: 16, waterX: 29, waterY: 17, facing: 'right' },
  valley_pond: { x: 26, y: 27, waterX: 26, waterY: 28, facing: 'down' },
  lake_reeds: { x: 21, y: 11, waterX: 21, waterY: 12, facing: 'down' },
  lake_deep: { x: 34, y: 20, waterX: 33, waterY: 20, facing: 'left' },
  shore_dock: { x: 29, y: 21, waterX: 30, waterY: 21, facing: 'right' },
  shipwreck_bay: { x: 30, y: 9, waterX: 31, waterY: 9, facing: 'right' },
})

export const FISHING_MERCHANT_PLACEMENTS = Object.freeze({
  valley: { x: 22, y: 27, facing: 'right' },
  lake: { x: 13, y: 13, facing: 'right' },
  shore: { x: 25, y: 19, facing: 'left' },
})

export function addFishingMapEvents(map) {
  const spotEntries = Object.values(FISHING_SPOTS).filter(spot => spot.mapId === map.id)
  const merchants = Object.values(FISHING_MERCHANTS).filter(merchant => merchant.mapId === map.id)
  if (!spotEntries.length && !merchants.length) return map
  const mapGrid = map.mapGrid.map(row => [...row])
  const runtimeEvents = [...(map.runtimeEvents || [])]
  const decorativeObjects = [...(map.decorativeObjects || [])]
  for (const spot of spotEntries) {
    const placement = FISHING_SPOT_PLACEMENTS[spot.id]
    const id = `fishing_${spot.id}`
    if (runtimeEvents.some(event => event.id === id)) continue
    runtimeEvents.push({ id, type: 'info', position: { x: placement.x, y: placement.y }, properties: {
      name: spot.name, label: spot.name, interactionKind: 'fishing', spotId: spot.id,
      facing: placement.facing, waterX: placement.waterX, waterY: placement.waterY,
      text: `${spot.name}：购买鱼竿和鱼饵后即可垂钓。`, reusable: true,
    } })
    mapGrid[placement.y][placement.x] = 6
  }
  for (const merchant of merchants) {
    const placement = FISHING_MERCHANT_PLACEMENTS[merchant.id]
    const id = `fishing_merchant_${merchant.id}`
    if (runtimeEvents.some(event => event.id === id)) continue
    runtimeEvents.push({ id, type: 'merchant', position: { x: placement.x, y: placement.y }, properties: {
      role: 'merchant', name: merchant.name, title: '鱼获收购与鱼饵补给',
      shopMode: 'fish_market', merchantId: merchant.id, facing: placement.facing,
      message: '鱼虾蟹都可以收购。想收藏的鱼先锁定，剩下的可以一起出售。',
      characterModel: 'trainer_merchant', reusable: true,
      npcWanderExclusionRadius: 2,
    } })
    mapGrid[placement.y][placement.x] = 7
    decorativeObjects.push({ type: 'trainer_merchant', x: placement.x, y: placement.y,
      scale: .62, height: .16, npcRole: 'merchant', blocksPath: true,
      rotation: { down: 0, left: -Math.PI / 2, right: Math.PI / 2, up: Math.PI }[placement.facing],
      sourceId: `${id}_npc`, eventId: id, eventType: 'merchant',
    })
  }
  return { ...map, mapGrid, runtimeEvents, decorativeObjects }
}
