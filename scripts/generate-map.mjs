#!/usr/bin/env node
/**
 * 自动生成道路类地图草稿（JSON），可导入 Tiled 或供后续转换脚本使用。
 *
 * 用法:
 *   node scripts/generate-map.mjs --id route_001 --width 60 --height 40 --seed 42
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function parseArgs(argv) {
  const args = { id: 'demo_route', width: 40, height: 28, seed: Date.now() }
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    const val = argv[i + 1]
    if (key === '--id') args.id = val
    if (key === '--width') args.width = Number(val)
    if (key === '--height') args.height = Number(val)
    if (key === '--seed') args.seed = Number(val)
  }
  return args
}

function createWanderingPath(width, height, start, end, rand) {
  let x = start.x
  let y = start.y
  const path = [{ x, y }]

  while (x !== end.x || y !== end.y) {
    const options = []
    if (x < end.x) options.push({ x: x + 1, y })
    if (x > end.x) options.push({ x: x - 1, y })
    if (y < end.y) options.push({ x, y: y + 1 })
    if (y > end.y) options.push({ x, y: y - 1 })

    if (rand() < 0.25 && x > 1 && x < width - 2) {
      options.push({ x: x + (rand() < 0.5 ? -1 : 1), y })
    }

    const next = options[Math.floor(rand() * options.length)]
    x = next.x
    y = next.y
    path.push({ x, y })
  }

  return path
}

function paintPath(grid, path, value, radius = 2) {
  for (const point of path) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = point.x + dx
        const py = point.y + dy
        if (py >= 0 && py < grid.length && px >= 0 && px < grid[0].length) {
          grid[py][px] = value
        }
      }
    }
  }
}

function generateRouteMap({ width, height, seed }) {
  const rand = mulberry32(seed)
  const grid = Array.from({ length: height }, () => Array(width).fill(0))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        grid[y][x] = 1
      }
    }
  }

  const start = { x: 2, y: height - 3 }
  const end = { x: width - 3, y: 2 }
  const path = createWanderingPath(width, height, start, end, rand)

  paintPath(grid, path, 12, 1)
  paintPath(grid, path, 0, 0)

  for (const point of path) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const px = point.x + dx
        const py = point.y + dy
        if (py > 0 && py < height - 1 && px > 0 && px < width - 1 && grid[py][px] === 0 && rand() < 0.35) {
          grid[py][px] = 8
        }
      }
    }
  }

  grid[start.y][start.x] = 0
  grid[end.y][end.x] = 2

  return {
    id: 'generated',
    width,
    height,
    seed,
    spawn: start,
    exit: end,
    grid
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const map = generateRouteMap(args)
  const outDir = join(root, 'src', 'data', 'maps', 'generated')
  await mkdir(outDir, { recursive: true })

  const outPath = join(outDir, `${args.id}.json`)
  await writeFile(outPath, JSON.stringify(map, null, 2), 'utf8')

  console.log(`Generated map: ${outPath}`)
  console.log(`Size: ${map.width}x${map.height}, seed: ${map.seed}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
