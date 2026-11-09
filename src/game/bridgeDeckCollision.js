// 桥面可走范围与桥模型一致。
//
// 道路是 3 格宽，过水时整条 3 格都被写成桥面格（15），但桥模型按
// 宽度 × 0.34 生成，只有约 1 格宽：两侧各多出一条"能走的水面"，人物可以从
// 桥上直接走到桥外的水里。这里把落在任何桥模型桥面之外的桥面格恢复成水。
const BRIDGE_TILE = 15
const WATER_TILE = 11
const ROAD_TILE = 12
// 与 paintBridgeModelFootprints 相同的 0.05 容差
const DECK_TOLERANCE = 0.05
// 这些事件站在桥边，玩家要从桥侧格子和它互动
const APPROACH_EVENT_TYPES = new Set(['trainer', 'boss', 'merchant', 'heal', 'challenge', 'info', 'sign', 'objective', 'item', 'pickup'])

function isOnBridgeDeck(bridge, x, y) {
  const rotation = Number(bridge.rotation) || 0
  const cos = Math.cos(rotation), sin = Math.sin(rotation)
  const dx = x - Number(bridge.x), dy = y - Number(bridge.y)
  const along = dx * cos + dy * sin
  const across = -dx * sin + dy * cos
  return Math.abs(along) <= (Number(bridge.length) || 1) / 2 + DECK_TOLERANCE &&
    Math.abs(across) <= (Number(bridge.width) || 1) / 2 + DECK_TOLERANCE
}

export function narrowBridgeDecksToModels(mapInfo) {
  const bridges = Array.isArray(mapInfo?.bridges) ? mapInfo.bridges : []
  if (!bridges.length || !mapInfo.mapGrid?.length) return mapInfo
  // 事件格本身不动；需要站在旁边互动的事件，其正前方和四邻的桥面格也保留
  const eventTiles = new Set()
  for (const event of mapInfo.runtimeEvents || []) {
    const ex = Number(event.position?.x), ey = Number(event.position?.y)
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue
    eventTiles.add(`${ex},${ey}`)
    if (!APPROACH_EVENT_TYPES.has(event.type)) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) eventTiles.add(`${ex + dx},${ey + dy}`)
  }
  let changed = 0
  const mapGrid = mapInfo.mapGrid.map((row, y) => row.map((tile, x) => {
    if (tile !== BRIDGE_TILE || eventTiles.has(`${x},${y}`)) return tile
    if (bridges.some((bridge) => isOnBridgeDeck(bridge, x, y))) return tile
    // 桥头：和道路相接的桥面格留着，否则道路会断在水边
    const touchesRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => mapInfo.mapGrid[y + dy]?.[x + dx] === ROAD_TILE)
    const inlineWithBridge = bridges.some((bridge) => {
      const vertical = Math.abs(Math.sin(Number(bridge.rotation) || 0)) > 0.5
      return vertical ? Math.round(Number(bridge.x)) === x : Math.round(Number(bridge.y)) === y
    })
    if (touchesRoad && inlineWithBridge) return tile
    changed += 1
    return WATER_TILE
  }))
  if (!changed) return mapInfo
  return {
    ...mapInfo,
    mapGrid,
    generationNotes: { ...mapInfo.generationNotes, bridgeDeckTilesNarrowed: changed }
  }
}
