import { getExpToNextLevelOfficial } from './gameBalance'
import { getWildMovesForPokemonLevel } from './gameData'
import { calculateStatsForLevel } from './pokemonStats'

// 地图相关常量
export const TILE_CLASSES = {
  0: 'bg-green-600', // 普通草地
  1: 'bg-green-900', // 树木墙壁
  2: 'bg-yellow-400', // 出口花丛
  3: 'bg-green-600', // 道具地块
  4: 'bg-green-600', // 旧金币地块，当前不再生成
  5: 'bg-green-600', // 治疗点
  6: 'bg-green-600', // 告示牌
  7: 'bg-green-600', // 训练家
  8: 'bg-green-700', // 高草丛 (遇敌率高)
  9: 'bg-green-600', // 果树背景
  10: 'bg-green-600', // 挑战点背景
  11: 'bg-blue-500', // 水域 (不可通行)
  12: 'bg-yellow-600' // 沙地 (移动减速)
}

export const ENCOUNTER_RATE = 0

const LEVEL_MAPS = {} // 地图缓存

// 生成地图
export const generateMaze = (width, height, levelId = 1) => {
  // 如果已有缓存，直接返回
  if (LEVEL_MAPS[levelId]) {
    return LEVEL_MAPS[levelId]
  }

  // 初始化全为普通草地(0)
  const grid = Array.from({ length: height }, () => Array(width).fill(0))

  // 1. 生成边界墙壁
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        grid[y][x] = 1
      }
    }
  }

  // 2. 团块地形生成
  const addTerrainCluster = (type, count, radius, density = 0.7) => {
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(Math.random() * (width - 4)) + 2
      const cy = Math.floor(Math.random() * (height - 4)) + 2
      for (let y = Math.max(1, cy - radius); y <= Math.min(height - 2, cy + radius); y++) {
        for (let x = Math.max(1, cx - radius); x <= Math.min(width - 2, cx + radius); x++) {
          const dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2))
          if (dist <= radius && Math.random() < density) {
            if (grid[y][x] === 0 || (type === 8 && grid[y][x] === 0)) {
              grid[y][x] = type
            }
          }
        }
      }
    }
  }

  // 生成大面积地形
  addTerrainCluster(1, 2, 2, 0.6)   // 树林
  addTerrainCluster(8, 3, 3, 0.8)   // 高草丛
  addTerrainCluster(12, 1, 4, 0.7)  // 沙地
  addTerrainCluster(11, 1, 2, 0.9)  // 水域

  // 3. 确保起点和终点
  grid[1][1] = 0
  grid[1][2] = 0
  grid[2][1] = 0
  grid[height - 2][width - 2] = 2 // 出口

  // 4. 放置交互点
  const placeOnEmpty = (type, count) => {
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < 100) {
      const ry = Math.floor(Math.random() * (height - 2)) + 1
      const rx = Math.floor(Math.random() * (width - 2)) + 1
      if (grid[ry][rx] === 0) {
        grid[ry][rx] = type
        placed++
      }
      attempts++
    }
  }

  placeOnEmpty(3, 3)  // 道具
  placeOnEmpty(5, 1)  // 治疗点
  placeOnEmpty(6, 2)  // 告示牌
  placeOnEmpty(7, 2)  // 训练家
  placeOnEmpty(9, 2)  // 果树

  LEVEL_MAPS[levelId] = grid
  return grid
}

// 经验值计算
export const getExpToNextLevel = (level, baseMonster = null) => {
  return level >= 100 ? Infinity : getExpToNextLevelOfficial(level, baseMonster)
}

// 创建宝可梦实例
export const createMonsterInstance = (baseMonster, level, id, initialCurrentHp, initialCurrentMp, initialCurrentExp) => {
  if (!baseMonster) {
    console.error('createMonsterInstance received undefined baseMonster')
    return null
  }

  const baseStats = {
    maxHp: baseMonster.maxHp,
    maxMp: baseMonster.maxMp,
    atk: baseMonster.atk,
    def: baseMonster.def,
    spAtk: baseMonster.spAtk,
    spDef: baseMonster.spDef,
    spd: baseMonster.spd
  }

  const calculatedStats = calculateStatsForLevel(baseStats, level)

  return {
    ...baseMonster,
    ...calculatedStats,
    moveLoadoutMode: 'wild',
    moves: getWildMovesForPokemonLevel(baseMonster, level),
    level,
    id,
    baseId: baseMonster.id,
    currentHp: initialCurrentHp ?? calculatedStats.maxHp,
    currentMp: initialCurrentMp ?? calculatedStats.maxMp,
    currentExp: initialCurrentExp ?? 0,
    expToNextLevel: getExpToNextLevel(level, baseMonster)
  }
}
