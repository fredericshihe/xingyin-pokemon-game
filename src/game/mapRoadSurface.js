import { triangulateRegion } from './mapWaterSurface.js'

// 平滑道路：把 visualPaths 的所有线段合成为一个标量场后一次性三角化。
// - 共线/重叠的线段先合并，避免同一段路叠两层半透明路肩导致发暗或鼓包；
// - 相交的非平行线段之间用 smooth-min 做内角圆角（L 弯、T 字、十字路口）；
// - 断头路的圆形端头收进道路 tile 内（离地图边缘的出入口、桥头除外）；
// - 与可见水面相交的部分（桥下以外）被裁掉，道路不会“流进”湖里。
// 全部是纯视觉几何，不改动玩法网格。坐标为 tile 坐标。

const SAMPLES_PER_TILE = 5
const FILLET_K = 0.55
export const ROAD_END_REACH_TILES = 0.52
// 全部地图统一路宽（此前新手山谷有 0.64~0.78 六种半径，路看起来粗细不一）
export const UNIFORM_ROAD_RADIUS = 0.78
export const UNIFORM_ROAD_EDGE = 0.16

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq <= 1e-9) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - ax - dx * t, py - ay - dy * t)
}

function segmentSegmentDistance(a, b) {
  return Math.min(
    distanceToSegment(a.ax, a.ay, b.ax, b.ay, b.bx, b.by),
    distanceToSegment(a.bx, a.by, b.ax, b.ay, b.bx, b.by),
    distanceToSegment(b.ax, b.ay, a.ax, a.ay, a.bx, a.by),
    distanceToSegment(b.bx, b.by, a.ax, a.ay, a.bx, a.by)
  )
}

function smoothMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

// 同一直线、同一宽度的轴向线段合并成区间并集。
export function collectRoadSegments(mapInfo) {
  const raw = []
  ;(mapInfo?.visualPaths || []).forEach((path) => {
    const points = Array.isArray(path?.points) ? path.points : []
    const radius = UNIFORM_ROAD_RADIUS
    const edge = UNIFORM_ROAD_EDGE
    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, ay] = points[i]
      const [bx, by] = points[i + 1]
      raw.push({ ax, ay, bx, by, radius, edge })
    }
  })

  const groups = new Map()
  const others = []
  raw.forEach((segment) => {
    const horizontal = segment.ay === segment.by
    const vertical = segment.ax === segment.bx
    if (!horizontal && !vertical) {
      others.push(segment)
      return
    }
    const axis = horizontal ? 'h' : 'v'
    const line = horizontal ? segment.ay : segment.ax
    const from = horizontal ? Math.min(segment.ax, segment.bx) : Math.min(segment.ay, segment.by)
    const to = horizontal ? Math.max(segment.ax, segment.bx) : Math.max(segment.ay, segment.by)
    // 同一直线上的重叠/相接线段合并；宽度取较宽者，避免两层宽度差造成的台阶。
    const key = `${axis}|${line}`
    if (!groups.has(key)) groups.set(key, { axis, line, spans: [] })
    groups.get(key).spans.push([from, to, segment.radius, segment.edge])
  })

  const merged = [...others]
  groups.forEach((group) => {
    group.spans.sort((left, right) => left[0] - right[0])
    let current = null
    const flush = () => {
      if (!current) return
      const [from, to, radius, edge] = current
      merged.push(group.axis === 'h'
        ? { ax: from, ay: group.line, bx: to, by: group.line, radius, edge }
        : { ax: group.line, ay: from, bx: group.line, by: to, radius, edge })
    }
    group.spans.forEach((span) => {
      if (current && span[0] <= current[1] + 1e-6) {
        current[1] = Math.max(current[1], span[1])
        current[2] = Math.max(current[2], span[2])
        current[3] = Math.max(current[3], span[3])
      } else {
        flush()
        current = [...span]
      }
    })
    flush()
  })
  return merged
}

function isNearBridge(mapInfo, x, y, padding) {
  return (mapInfo?.bridges || []).some((bridge) => {
    const rotation = Number(bridge.rotation) || 0
    const dx = x - bridge.x
    const dy = y - bridge.y
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    return Math.abs(dx * cos + dy * sin) <= (Number(bridge.length) || 3) / 2 + padding &&
      Math.abs(-dx * sin + dy * cos) <= (Number(bridge.width) || 1.12) / 2 + padding
  })
}

// 断头路端点：一格之内没有其它线段（相邻格的路段靠端头重叠相连）、不在地图边缘出入口、不接桥头。端头收进 tile 内。
function retractFreeEnds(segments, mapInfo, width, height) {
  const touches = (x, y, self) => segments.some((other) => (
    other !== self && distanceToSegment(x, y, other.ax, other.ay, other.bx, other.by) <= 1.05
  ))
  const isBorderExit = (x, y) => x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2
  const freeEnds = []
  segments.forEach((segment) => {
    const length = Math.hypot(segment.bx - segment.ax, segment.by - segment.ay)
    if (length < 1e-6) return
    const ux = (segment.bx - segment.ax) / length
    const uy = (segment.by - segment.ay) / length
    const retract = Math.max(0, segment.radius - ROAD_END_REACH_TILES)
    const ends = [
      { x: segment.ax, y: segment.ay, sign: 1 },
      { x: segment.bx, y: segment.by, sign: -1 }
    ]
    ends.forEach((end) => {
      if (touches(end.x, end.y, segment)) return
      if (isBorderExit(end.x, end.y)) return
      if (isNearBridge(mapInfo, end.x, end.y, 0.9)) return
      freeEnds.push({ segment, x: end.x, y: end.y, sign: end.sign, ux, uy, retract, length })
    })
  })
  freeEnds.forEach((end) => {
    const amount = Math.min(end.retract, end.length * 0.45)
    if (end.sign > 0) {
      end.segment.ax += end.ux * amount
      end.segment.ay += end.uy * amount
    } else {
      end.segment.bx -= end.ux * amount
      end.segment.by -= end.uy * amount
    }
  })
  return freeEnds.map(({ x, y }) => ({ x, y }))
}

// 出入口只接到玩法地图的边界。外围林带之外是远景海面，不能当作陆地铺路。
function extendBorderExits(segments, mapInfo, width, height) {
  const warps = (mapInfo.runtimeEvents || []).filter((event) => event.type === 'warp' && event.position)
  segments.forEach((segment) => {
    const length = Math.hypot(segment.bx - segment.ax, segment.by - segment.ay)
    if (length < 1e-6) return
    const ux = (segment.bx - segment.ax) / length
    const uy = (segment.by - segment.ay) / length
    ;[['a', -1], ['b', 1]].forEach(([end, sign]) => {
      const x = segment[`${end}x`], y = segment[`${end}y`]
      const dx = ux * sign, dy = uy * sign
      // 端点贴边且线段朝着地图外
      const outward = (x <= 1 && dx < -0.5) || (x >= width - 2 && dx > 0.5) ||
        (y <= 1 && dy < -0.5) || (y >= height - 2 && dy > 0.5)
      if (!outward) return
      if (!warps.some((warp) => Math.abs(warp.position.x - x) + Math.abs(warp.position.y - y) <= 2)) return
      const toX = dx > 1e-6 ? (width - 0.5 - x) / dx : dx < -1e-6 ? (-0.5 - x) / dx : Infinity
      const toY = dy > 1e-6 ? (height - 0.5 - y) / dy : dy < -1e-6 ? (-0.5 - y) / dy : Infinity
      const reach = Math.max(0, Math.min(toX, toY))
      segment[`${end}x`] = x + dx * reach
      segment[`${end}y`] = y + dy * reach
    })
  })
}

function collectPlazas(mapInfo, segments) {
  const plazas = []
  ;(mapInfo?.roadJunctions || []).forEach((junction) => {
    const rx = Number(junction.rx) || 1
    const ry = Number(junction.ry) || 1
    const roadRx = Math.max(rx * 0.74, 0.82)
    const roadRy = Math.max(ry * 0.74, 0.82)
    const nearby = segments.filter((segment) => distanceToSegment(junction.x, junction.y, segment.ax, segment.ay, segment.bx, segment.by) <= 1.2)
    const widest = nearby.reduce((max, segment) => Math.max(max, segment.radius), 0)
    // 普通路口由圆角自然形成；只有明显比路宽的“小广场”才单独画椭圆。
    if (nearby.length && Math.max(roadRx, roadRy) <= widest + 0.14) return
    plazas.push({
      x: junction.x,
      y: junction.y,
      roadRx,
      roadRy,
      edgeRx: Math.max(rx * 0.88, 0.96),
      edgeRy: Math.max(ry * 0.88, 0.96)
    })
  })
  return plazas
}

function ellipseDistance(x, y, cx, cy, rx, ry) {
  const r = Math.hypot((x - cx) / rx, (y - cy) / ry)
  return (r - 1) * Math.min(rx, ry)
}

function sampleSdf(surface, x, y) {
  if (!surface) return 1
  const fi = (x - surface.x0) / surface.step
  const fj = (y - surface.y0) / surface.step
  const i = Math.floor(fi)
  const j = Math.floor(fj)
  if (i < 0 || j < 0 || i >= surface.nx - 1 || j >= surface.ny - 1) return 1
  const tx = fi - i
  const ty = fj - j
  const at = (ii, jj) => surface.sdf[jj * surface.nx + ii]
  return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty
}

export function sampleRoadSurface(mapInfo, { waterSurface = null, samplesPerTile = SAMPLES_PER_TILE } = {}) {
  const grid = mapInfo?.mapGrid
  if (!Array.isArray(grid) || !grid.length) return null
  const height = grid.length
  const width = grid[0].length
  const segments = collectRoadSegments(mapInfo)
  if (!segments.length) return null
  extendBorderExits(segments, mapInfo, width, height)
  const freeEnds = retractFreeEnds(segments, mapInfo, width, height)
  const plazas = collectPlazas(mapInfo, segments)

  // 需要做圆角的线段对：不平行且彼此接触。
  // 需要做圆角的线段对：不平行且彼此接触。按交点 J 在两条线段上的位置区分：
  // - 端点接端点（L 弯）：只在两段共同的内侧做圆角，外角保持原本的圆弧；
  // - 端点接中段（T 字）：只在支路一侧做圆角，并把支路端头截在主路对侧边缘，避免对侧鼓包；
  // - 中段交中段（十字）：四个内角都做圆角。
  segments.forEach((segment) => { segment.cuts = [] })
  const jointInfo = (segment, jx, jy) => {
    const dx = segment.bx - segment.ax
    const dy = segment.by - segment.ay
    const length = Math.hypot(dx, dy)
    const t = ((jx - segment.ax) * dx + (jy - segment.ay) * dy) / (length * length)
    const along = t * length
    if (along <= 0.35) return { end: true, ux: dx / length, uy: dy / length }
    if (along >= length - 0.35) return { end: true, ux: -dx / length, uy: -dy / length }
    return { end: false }
  }
  const pairs = []
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i]
      const b = segments[j]
      const adx = a.bx - a.ax
      const ady = a.by - a.ay
      const bdx = b.bx - b.ax
      const bdy = b.by - b.ay
      const cross = adx * bdy - ady * bdx
      if (Math.abs(cross) < 1e-6) continue
      if (segmentSegmentDistance(a, b) > a.radius + b.radius) continue
      const t = ((b.ax - a.ax) * bdy - (b.ay - a.ay) * bdx) / cross
      const jx = a.ax + adx * t
      const jy = a.ay + ady * t
      const ja = jointInfo(a, jx, jy)
      const jb = jointInfo(b, jx, jy)
      const gates = [ja, jb].filter((info) => info.end).map(({ ux, uy }) => ({ jx, jy, ux, uy }))
      if (ja.end && !jb.end) a.cuts.push({ jx, jy, ux: ja.ux, uy: ja.uy, road: b.radius, edge: b.radius + b.edge })
      if (jb.end && !ja.end) b.cuts.push({ jx, jy, ux: jb.ux, uy: jb.uy, road: a.radius, edge: a.radius + a.edge })
      pairs.push({ a: i, b: j, gates })
    }
  }

  const x0 = -1.5
  const y0 = -1.5
  const step = 1 / samplesPerTile
  const nx = Math.ceil((width + 2) / step) + 1
  const ny = Math.ceil((height + 2) / step) + 1
  const road = new Float32Array(nx * ny)
  const edge = new Float32Array(nx * ny)
  const roadDistances = new Float64Array(segments.length)
  const edgeDistances = new Float64Array(segments.length)
  const reach = segments.reduce((max, segment) => Math.max(max, segment.radius + segment.edge), 0) + FILLET_K + 0.3

  for (let j = 0; j < ny; j += 1) {
    const y = y0 + j * step
    for (let i = 0; i < nx; i += 1) {
      const x = x0 + i * step
      let roadValue = Infinity
      let edgeValue = Infinity
      for (let s = 0; s < segments.length; s += 1) {
        const segment = segments[s]
        const d = distanceToSegment(x, y, segment.ax, segment.ay, segment.bx, segment.by)
        let roadD = d - segment.radius
        let edgeD = roadD - segment.edge
        if (d <= reach) {
          segment.cuts.forEach((cut) => {
            const beyond = -((x - cut.jx) * cut.ux + (y - cut.jy) * cut.uy)
            roadD = Math.max(roadD, beyond - cut.road)
            edgeD = Math.max(edgeD, beyond - cut.edge)
          })
        }
        roadDistances[s] = roadD
        edgeDistances[s] = edgeD
        if (d > reach) continue
        roadValue = Math.min(roadValue, roadD)
        edgeValue = Math.min(edgeValue, edgeD)
      }
      if (edgeValue < FILLET_K) {
        for (const pair of pairs) {
          const ra = roadDistances[pair.a]
          const rb = roadDistances[pair.b]
          if (ra > FILLET_K + 0.4 || rb > FILLET_K + 0.4) continue
          let gate = 1
          for (const g of pair.gates) {
            const side = (x - g.jx) * g.ux + (y - g.jy) * g.uy
            const t = Math.max(0, Math.min(1, (side + 0.25) / 0.5))
            gate *= t * t * (3 - 2 * t)
          }
          if (gate <= 0) continue
          const hardRoad = Math.min(ra, rb)
          const hardEdge = Math.min(edgeDistances[pair.a], edgeDistances[pair.b])
          roadValue = Math.min(roadValue, hardRoad - gate * (hardRoad - smoothMin(ra, rb, FILLET_K)))
          edgeValue = Math.min(edgeValue, hardEdge - gate * (hardEdge - smoothMin(edgeDistances[pair.a], edgeDistances[pair.b], FILLET_K)))
        }
      }
      plazas.forEach((plaza) => {
        const roadPlaza = ellipseDistance(x, y, plaza.x, plaza.y, plaza.roadRx, plaza.roadRy)
        const edgePlaza = ellipseDistance(x, y, plaza.x, plaza.y, plaza.edgeRx, plaza.edgeRy)
        roadValue = smoothMin(roadValue, roadPlaza, FILLET_K)
        edgeValue = smoothMin(edgeValue, edgePlaza, FILLET_K)
      })

      // 桥下以外，道路不画进可见水面（留一点岸边余量）。
      if (waterSurface && edgeValue < 0.5) {
        const water = sampleSdf(waterSurface, x, y)
        if (water < 0.25 && !isNearBridge(mapInfo, x, y, 0.2)) {
          roadValue = Math.max(roadValue, -water + 0.05)
          edgeValue = Math.max(edgeValue, -water - 0.08)
        }
      }
      // 同时裁切路面、圆形端头和路肩；即使素材路径越界也不会悬在外围水面上。
      const outsideMap = Math.max(-0.5 - x, x - (width - 0.5), -0.5 - y, y - (height - 0.5))
      road[j * nx + i] = -Math.max(roadValue, outsideMap)
      edge[j * nx + i] = -Math.max(edgeValue, outsideMap)
    }
  }

  return { x0, y0, step, nx, ny, road, edge, segments, freeEnds, plazas }
}

export function buildRoadSurfaceGeometries(mapInfo, {
  toWorld,
  waterSurface = null,
  heights = { edge: 0.105, road: 0.118 }
} = {}) {
  const surface = sampleRoadSurface(mapInfo, { waterSurface })
  if (!surface) return null
  return {
    surface,
    edge: triangulateRegion(surface, (index) => surface.edge[index], toWorld, heights.edge),
    road: triangulateRegion(surface, (index) => surface.road[index], toWorld, heights.road)
  }
}
