import * as THREE from 'three'

// 湖泊 / 池塘的可见水面由玩法网格决定：
// - 水格（11）一定显示为水，可走格（除桥面外）一定显示为陆地；
// - 桥格（15）按周围水陆做调和插值，湖中的桥下是水，陆上的栈道下是地；
// - 在两者之间的“模糊带”里，用 waterBodies 的椭圆轮廓决定岸线，保持原有湖形与位置。
// 所有坐标均为 tile 坐标（tile 中心为整数）。

export const WATER_TILE = 11
export const BRIDGE_TILE = 15
// 与 world/constants.js 的 BLOCKED_LEGACY_TILES 保持一致（此模块需在 node 审计脚本中独立运行）。
const BLOCKED_TILES = new Set([1, 5, 6, 11, 14, 18, 20])
// 可走格中心周围保持干燥的半径、水格中心周围保证有水的半径（tile）。
export const DRY_TILE_RADIUS = 0.42
export const WET_TILE_RADIUS = 0.3

const DEFAULT_SAMPLES_PER_TILE = 5

function smooth01(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  return c * c * (3 - 2 * c)
}

function hash2(x, y, salt) {
  let n = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

// 低频值噪声（-1..1），用于岸线的自然起伏；只在模糊带内生效。
function valueNoise(x, y, salt) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth01(x - ix)
  const fy = smooth01(y - iy)
  const a = hash2(ix, iy, salt)
  const b = hash2(ix + 1, iy, salt)
  const c = hash2(ix, iy + 1, salt)
  const d = hash2(ix + 1, iy + 1, salt)
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq <= 1e-6) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - ax - dx * t, py - ay - dy * t)
}

function lakeBodies(mapInfo) {
  return (mapInfo?.waterBodies || []).filter((body) => body && body.type !== 'stream' && Number.isFinite(Number(body.x)))
}

function streamBodies(mapInfo) {
  return (mapInfo?.waterBodies || []).filter((body) => body?.type === 'stream' && Array.isArray(body.points))
}

function isInsideStream(streams, x, y) {
  return streams.some((body) => {
    const radius = (Number(body.width) || 0.8) + 0.35
    for (let i = 0; i < body.points.length - 1; i += 1) {
      const [ax, ay] = body.points[i]
      const [bx, by] = body.points[i + 1]
      if (distanceToSegment(x, y, ax, ay, bx, by) <= radius) return true
    }
    return false
  })
}

// 每个 tile 的“水值”（0 = 陆地，1 = 水）。
export function computeWaterTileMask(mapInfo, grid = mapInfo?.mapGrid) {
  if (!Array.isArray(grid) || !grid.length) return null
  const height = grid.length
  const width = grid[0].length
  const mask = new Float32Array(width * height)
  const bridgeIndices = []
  const streams = streamBodies(mapInfo)
  let hasWater = false

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = grid[y][x]
      if (tile === WATER_TILE && !(streams.length && isInsideStream(streams, x, y))) {
        mask[y * width + x] = 1
        hasWater = true
      } else if (tile === BRIDGE_TILE) {
        bridgeIndices.push(y * width + x)
        mask[y * width + x] = 0.5
      }
    }
  }
  if (!hasWater) return { width, height, mask, hasWater }

  // 桥格：固定非桥格的取值，做 Jacobi 调和插值。
  const next = new Float32Array(bridgeIndices.length)
  for (let iteration = 0; iteration < 48; iteration += 1) {
    bridgeIndices.forEach((index, k) => {
      const x = index % width
      const y = (index - x) / width
      let sum = 0
      let count = 0
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox
        const ny = y + oy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        sum += mask[ny * width + nx]
        count += 1
      }
      next[k] = count ? sum / count : 0
    })
    bridgeIndices.forEach((index, k) => { mask[index] = next[k] })
  }

  // 可分离 [1,2,1] 模糊：直边的 0.5 等值线仍落在格边中点，拐角和台阶被圆滑掉。
  const blurPass = (source, horizontal) => {
    const out = new Float32Array(source.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const at = (ox, oy) => {
          const cx = Math.min(width - 1, Math.max(0, x + ox))
          const cy = Math.min(height - 1, Math.max(0, y + oy))
          return source[cy * width + cx]
        }
        out[y * width + x] = horizontal
          ? (at(-1, 0) + at(0, 0) * 2 + at(1, 0)) / 4
          : (at(0, -1) + at(0, 0) * 2 + at(0, 1)) / 4
      }
    }
    return out
  }
  const blurOnce = (source) => blurPass(blurPass(source, true), false)
  const blurred = blurOnce(blurOnce(mask))
  // 与原值各半混合：单格宽的水带（道馆水渠）不会被模糊到阈值以下而断开。
  const smoothMask = mask.map((value, index) => value * 0.4 + blurred[index] * 0.6)

  // 硬约束所需的 tile 类别：1 = 水格，-1 = 可走陆格（桥格和其它阻挡格不约束）。
  const tileClass = new Int8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = grid[y][x]
      if (tile === WATER_TILE && mask[y * width + x] > 0.99) tileClass[y * width + x] = 1
      else if (tile !== BRIDGE_TILE && !BLOCKED_TILES.has(tile)) tileClass[y * width + x] = -1
    }
  }

  return { width, height, mask, smoothMask, tileClass, hasWater }
}

function tileValue(maskInfo, x, y) {
  const { width, height, smoothMask } = maskInfo
  const cx = x < 0 ? 0 : x >= width ? width - 1 : x
  const cy = y < 0 ? 0 : y >= height ? height - 1 : y
  return smoothMask[cy * width + cx]
}

function ellipseRadius(body, x, y) {
  const rotation = Number(body.rotation) || 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const dx = x - body.x
  const dy = y - body.y
  const lx = (dx * cos + dy * sin) / Math.max(Number(body.rx) || 2, 0.2)
  const ly = (-dx * sin + dy * cos) / Math.max(Number(body.ry) || 1.4, 0.2)
  return Math.sqrt(lx * lx + ly * ly)
}

// 标量场：> 0 为水面。tile 中心处的符号与玩法网格严格一致（水格恒为正、陆格恒为负）。
export function createWaterFieldSampler(mapInfo, maskInfo) {
  const bodies = lakeBodies(mapInfo)
  const salt = bodies.reduce((acc, body) => acc + (Number(body.salt) || 0), 17)
  return (x, y) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const sx = smooth01(x - ix)
    const sy = smooth01(y - iy)
    const v00 = tileValue(maskInfo, ix, iy)
    const v10 = tileValue(maskInfo, ix + 1, iy)
    const v01 = tileValue(maskInfo, ix, iy + 1)
    const v11 = tileValue(maskInfo, ix + 1, iy + 1)
    const value = (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy

    let inside = 0.5
    if (bodies.length) {
      let radius = Infinity
      bodies.forEach((body) => { radius = Math.min(radius, ellipseRadius(body, x, y)) })
      inside = 1 - smooth01((radius - 0.82) / 0.3)
    }
    const noise = valueNoise(x * 0.7, y * 0.7, salt) * 0.07
    const threshold = Math.min(0.8, Math.max(0.2, 0.5 - (inside - 0.5) * 0.44 + noise))
    let result = value - threshold

    // 硬约束只取决于最近的 tile 中心（两个半径之和 < 1，不会互相冲突）。
    const tx = Math.round(x)
    const ty = Math.round(y)
    if (tx >= 0 && ty >= 0 && tx < maskInfo.width && ty < maskInfo.height) {
      const kind = maskInfo.tileClass[ty * maskInfo.width + tx]
      const d = Math.hypot(x - tx, y - ty)
      if (kind === 1 && d < WET_TILE_RADIUS) result = Math.max(result, (WET_TILE_RADIUS - d) * 0.6)
      if (kind === -1 && d < DRY_TILE_RADIUS) result = Math.min(result, -(DRY_TILE_RADIUS - d) * 0.6)
    }
    return result
  }
}

// 在 tile bbox 上采样，得到节点场和近似有向距离（单位：tile，水内为负）。
export function sampleWaterSurface(mapInfo, { grid = mapInfo?.mapGrid, samplesPerTile = DEFAULT_SAMPLES_PER_TILE } = {}) {
  const maskInfo = computeWaterTileMask(mapInfo, grid)
  if (!maskInfo?.hasWater) return null
  const { width, height, mask } = maskInfo
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] <= 0.2) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  const margin = 1.6
  const x0 = Math.max(-1.5, minX - margin)
  const y0 = Math.max(-1.5, minY - margin)
  const x1 = Math.min(width + 0.5, maxX + margin)
  const y1 = Math.min(height + 0.5, maxY + margin)
  const step = 1 / samplesPerTile
  const nx = Math.ceil((x1 - x0) / step) + 1
  const ny = Math.ceil((y1 - y0) / step) + 1
  const sampler = createWaterFieldSampler(mapInfo, maskInfo)
  const field = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      field[j * nx + i] = sampler(x0 + i * step, y0 + j * step)
    }
  }

  // 近似有向距离：边界种子（沿网格边的插值交点）+ 两遍倒角传播。
  const dist = new Float32Array(nx * ny).fill(1e6)
  const seed = (index, d) => { if (d < dist[index]) dist[index] = d }
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = field[j * nx + i]
      if (i + 1 < nx) {
        const b = field[j * nx + i + 1]
        if ((a > 0) !== (b > 0)) {
          const t = a / (a - b)
          seed(j * nx + i, t * step)
          seed(j * nx + i + 1, (1 - t) * step)
        }
      }
      if (j + 1 < ny) {
        const b = field[(j + 1) * nx + i]
        if ((a > 0) !== (b > 0)) {
          const t = a / (a - b)
          seed(j * nx + i, t * step)
          seed((j + 1) * nx + i, (1 - t) * step)
        }
      }
    }
  }
  const diag = step * Math.SQRT2
  const relax = (index, other, cost) => {
    const candidate = dist[other] + cost
    if (candidate < dist[index]) dist[index] = candidate
  }
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const index = j * nx + i
      if (i > 0) relax(index, index - 1, step)
      if (j > 0) {
        relax(index, index - nx, step)
        if (i > 0) relax(index, index - nx - 1, diag)
        if (i + 1 < nx) relax(index, index - nx + 1, diag)
      }
    }
  }
  for (let j = ny - 1; j >= 0; j -= 1) {
    for (let i = nx - 1; i >= 0; i -= 1) {
      const index = j * nx + i
      if (i + 1 < nx) relax(index, index + 1, step)
      if (j + 1 < ny) {
        relax(index, index + nx, step)
        if (i + 1 < nx) relax(index, index + nx + 1, diag)
        if (i > 0) relax(index, index + nx - 1, diag)
      }
    }
  }
  const sdf = new Float32Array(nx * ny)
  for (let k = 0; k < sdf.length; k += 1) sdf[k] = field[k] > 0 ? -dist[k] : dist[k]

  // 每个连通水域的最大深度，用于深水层阈值（小池塘不画深水，大湖的深水居中）。
  const component = new Int32Array(nx * ny).fill(-1)
  const componentDepth = []
  const queue = new Int32Array(nx * ny)
  for (let start = 0; start < sdf.length; start += 1) {
    if (sdf[start] >= 0 || component[start] >= 0) continue
    const id = componentDepth.length
    let head = 0
    let tail = 0
    let deepest = 0
    queue[tail++] = start
    component[start] = id
    while (head < tail) {
      const index = queue[head++]
      deepest = Math.max(deepest, -sdf[index])
      const i = index % nx
      const j = (index - i) / nx
      for (const [oi, oj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + oi
        const nj = j + oj
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue
        const next = nj * nx + ni
        if (sdf[next] >= 0 || component[next] >= 0) continue
        component[next] = id
        queue[tail++] = next
      }
    }
    componentDepth.push(deepest)
  }

  // 与原椭圆绘制相同的深水椭圆参数（中心沿 rotation+0.8 偏移 12%，半径 0.42 / 0.34）。
  const deepBodies = lakeBodies(mapInfo).map((body) => {
    const rotation = Number(body.rotation) || 0
    const rx = Number(body.rx ?? 2)
    const ry = Number(body.ry ?? 1.4)
    return {
      x: body.x + Math.cos(rotation + 0.8) * rx * 0.12,
      y: body.y + Math.sin(rotation + 0.8) * ry * 0.12,
      rx: rx * 0.42,
      ry: ry * 0.34,
      rotation: rotation + 0.28
    }
  })

  return { x0, y0, step, nx, ny, field, sdf, component, componentDepth, deepBodies, maskInfo, sampler }
}

// 填充型 marching squares：对每个格子把正方形按 value > 0 裁剪后扇形三角化。
export function triangulateRegion(surface, valueAt, toWorld, y) {
  const { x0, y0, step, nx, ny } = surface
  const positions = []
  const corner = [[0, 0], [1, 0], [1, 1], [0, 1]]
  const polygon = []
  for (let j = 0; j < ny - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const values = corner.map(([ci, cj]) => valueAt((j + cj) * nx + i + ci))
      if (values.every((value) => value <= 0)) continue
      polygon.length = 0
      for (let k = 0; k < 4; k += 1) {
        const a = values[k]
        const b = values[(k + 1) % 4]
        const [ai, aj] = corner[k]
        const [bi, bj] = corner[(k + 1) % 4]
        if (a > 0) polygon.push([i + ai, j + aj])
        if ((a > 0) !== (b > 0)) {
          const t = a / (a - b)
          polygon.push([i + ai + (bi - ai) * t, j + aj + (bj - aj) * t])
        }
      }
      if (polygon.length < 3) continue
      const points = polygon.map(([pi, pj]) => toWorld(x0 + pi * step, y0 + pj * step))
      for (let k = 1; k < points.length - 1; k += 1) {
        // 反向扇形，保证法线朝上（x 右、z 下）。
        positions.push(
          points[0].x, y, points[0].z,
          points[k + 1].x, y, points[k + 1].z,
          points[k].x, y, points[k].z
        )
      }
    }
  }
  if (!positions.length) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const normals = new Float32Array(positions.length)
  for (let k = 1; k < normals.length; k += 3) normals[k] = 1
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.computeBoundingSphere()
  return geometry
}

export const WATER_BANK_WIDTH_TILES = 0.36
export const WATER_DEEP_MIN_DEPTH_TILES = 1.05

export function bankValueAt(surface, index) {
  const { x0, y0, step, nx } = surface
  const i = index % nx
  const j = (index - i) / nx
  const wobble = valueNoise((x0 + i * step) * 1.3, (y0 + j * step) * 1.3, 71) * 0.08
  return WATER_BANK_WIDTH_TILES + wobble - surface.sdf[index]
}

// 深水层：沿用原椭圆的“偏心深水椭圆”造型（平滑、居中），再裁剪到离岸至少 WATER_DEEP_MIN_DEPTH_TILES 的水域内，
// 保证深色不会贴岸或探出水面。没有椭圆数据的水域按离岸距离取内核。
export function deepValueAt(surface, index) {
  const id = surface.component[index]
  if (id < 0) return -1
  const deepest = surface.componentDepth[id]
  if (deepest < WATER_DEEP_MIN_DEPTH_TILES + 0.35) return -1
  const inset = -surface.sdf[index] - WATER_DEEP_MIN_DEPTH_TILES
  const { x0, y0, step, nx, deepBodies } = surface
  if (!deepBodies?.length) return -surface.sdf[index] - Math.max(WATER_DEEP_MIN_DEPTH_TILES, deepest * 0.52)
  const i = index % nx
  const x = x0 + i * step
  const y = y0 + ((index - i) / nx) * step
  let shape = -Infinity
  deepBodies.forEach((body) => { shape = Math.max(shape, (1 - ellipseRadius(body, x, y)) * Math.min(body.rx, body.ry)) })
  return Math.min(shape, inset)
}

// 返回 { water, bank, deep } 三层 BufferGeometry（世界坐标，已放置在各自高度）。
export function buildWaterSurfaceGeometries(mapInfo, {
  grid = mapInfo?.mapGrid,
  toWorld,
  heights = { bank: 0.078, water: 0.088, deep: 0.096 },
  samplesPerTile = DEFAULT_SAMPLES_PER_TILE
} = {}) {
  const surface = sampleWaterSurface(mapInfo, { grid, samplesPerTile })
  if (!surface) return null
  return {
    surface,
    bank: triangulateRegion(surface, (index) => bankValueAt(surface, index), toWorld, heights.bank),
    water: triangulateRegion(surface, (index) => surface.field[index], toWorld, heights.water),
    deep: triangulateRegion(surface, (index) => deepValueAt(surface, index), toWorld, heights.deep)
  }
}
