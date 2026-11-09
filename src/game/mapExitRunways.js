// 地图出入口在远景里的延续：远景层在出口方向留出一条走廊，
// 不会有山正好堵在路的尽头。路面由 mapRoadSurface 收口在地图边界内。
const BORDER_MARGIN = 1

export function getBorderExitDirection(mapInfo, position) {
  const width = mapInfo?.mapGrid?.[0]?.length || 0
  const height = mapInfo?.mapGrid?.length || 0
  if (!width || !height || !position) return null
  const { x, y } = position
  if (x <= BORDER_MARGIN) return { dirX: -1, dirZ: 0 }
  if (x >= width - 1 - BORDER_MARGIN) return { dirX: 1, dirZ: 0 }
  if (y <= BORDER_MARGIN) return { dirX: 0, dirZ: -1 }
  if (y >= height - 1 - BORDER_MARGIN) return { dirX: 0, dirZ: 1 }
  return null
}

// 返回世界坐标下的出口：{ x, z, dirX, dirZ }（dir 指向地图外）
export function collectBorderExits(mapInfo, cell, worldFromTile) {
  const width = mapInfo?.mapGrid?.[0]?.length || 0
  const height = mapInfo?.mapGrid?.length || 0
  const exits = []
  for (const event of mapInfo?.runtimeEvents || []) {
    if (event?.type !== 'warp' || !event.position) continue
    const { x, y } = event.position
    const direction = getBorderExitDirection(mapInfo, event.position)
    if (!direction) continue
    const pos = worldFromTile(x, y, width, height)
    exits.push({ x: pos.x, z: pos.z, ...direction, cell })
  }
  return exits
}

// 点到出口射线（从出口往外）的横向距离；在出口内侧返回 Infinity
export function distanceToExitCorridor(exit, px, pz) {
  const dx = px - exit.x, dz = pz - exit.z
  const along = dx * exit.dirX + dz * exit.dirZ
  if (along < -2) return Infinity
  return Math.abs(dx * -exit.dirZ + dz * exit.dirX)
}
