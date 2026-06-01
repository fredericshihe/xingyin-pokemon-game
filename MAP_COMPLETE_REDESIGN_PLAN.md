# 地图彻底重新设计方案

## 设计原则（学习贝壳海岸）

1. **一个地图 = 一个主题** - 所有装饰都围绕核心主题
2. **少即是多** - 1-3个标志性地标，不要10个
3. **高密度散布** - 80-150个主题装饰，营造氛围
4. **统一视觉** - 装饰类型不超过10种
5. **清晰分区** - 每个区域有明确功能

---

## 地图 1：星音草径 → 🌸 花海草原

### 核心主题
**新手的花海草原 - 开阔、明亮、充满生机**

### 标志性地标（2个）
```javascript
decorativeObjects: [
  // 中央巨大橡树 - 唯一焦点
  themeLandmark('nature_tree_oak', 20, 10, { scale: 3.2 }),
  // 入口欢迎喷泉
  themeLandmark('town_fountain_round', 3, 16, { scale: 2.8 })
]
```

### 主题散布（120个）
```javascript
scatter: [
  // 密集的野花海洋
  { idPrefix: 'meadow_flowers', 
    types: ['nature_flower_yellow', 'nature_flower_red', 'nature_flower_purple_a', 'nature_flower_purple_b', 'platformer_flowers'], 
    count: 120, 
    allowedTiles: [TILE.grass, TILE.tallGrass], 
    scale: [1.0, 1.3] 
  },
  // 统一的灌木边界
  { idPrefix: 'meadow_edges', 
    types: ['nature_bush_large', 'nature_log_stack'], 
    count: 60, 
    allowedTiles: [TILE.wall], 
    scale: [2.2, 2.8] 
  }
]
```

### 特色
- 🌸 花海遍地，色彩缤纷
- 🌳 巨大橡树作为地标
- 🌿 简洁的灌木边界

---

## 地图 2：雾湖苇岸 → 🚣 渔村码头

### 核心主题
**雾气缭绕的渔村 - 湖泊、渔船、宁静**

### 标志性地标（3个）
```javascript
decorativeObjects: [
  // 大型码头 - 主焦点
  themeLandmark('shore_dock_small', 27, 16, { scale: 3.0, rotation: 0 }),
  // 渔船群
  themeLandmark('pirate_boat_row_large', 25, 14, { scale: 2.5, rotation: 0.3 }),
  themeLandmark('pirate_boat_row_large', 29, 18, { scale: 2.3, rotation: -0.4 })
]
```

### 主题散布（100个）
```javascript
scatter: [
  // 密集的芦苇丛
  { idPrefix: 'lake_reeds', 
    types: ['wetland_reed_clump', 'nature_lily_large'], 
    count: 100, 
    allowedTiles: [TILE.grass, TILE.tallGrass], 
    scale: [1.1, 1.4] 
  },
  // 水边岩石边界
  { idPrefix: 'lake_edges', 
    types: ['hex_water_rocks', 'nature_rock_large'], 
    count: 60, 
    allowedTiles: [TILE.wall], 
    scale: [2.3, 2.9] 
  }
]
```

### 特色
- 🚣 大型码头 + 渔船群
- 🌾 芦苇海洋
- 🪨 水边岩石边界

---

## 地图 3：风车农庄 → 🌾 麦田海洋

### 核心主题
**金色麦田的农庄 - 丰收、田园、宁静**

### 标志性地标（1个）
```javascript
decorativeObjects: [
  // 巨大风车 - 唯一焦点
  themeLandmark('town_windmill', 20, 10, { scale: 3.5 })
]
```

### 主题散布（150个）
```javascript
scatter: [
  // 密集的麦田海洋
  { idPrefix: 'farm_wheat', 
    types: ['nature_wheat_stage_a', 'nature_wheat_stage_b'], 
    count: 150, 
    allowedTiles: [TILE.grass, TILE.tallGrass], 
    scale: [1.0, 1.3] 
  },
  // 树篱边界
  { idPrefix: 'farm_edges', 
    types: ['town_hedge_large', 'nature_fence_planks'], 
    count: 60, 
    allowedTiles: [TILE.wall], 
    scale: [2.3, 2.9] 
  }
]
```

### 特色
- 🌾 麦田海洋，金色波浪
- 🏭 巨大风车作为唯一焦点
- 🌳 整齐的树篱边界

---

## 地图 4：月影墓园 → ⚰️ 墓碑森林

### 核心主题
**墓碑遍布的阴森墓园 - 恐怖、神秘、死亡**

### 标志性地标（2个）
```javascript
decorativeObjects: [
  // 巨大陵墓 - 中央焦点
  themeLandmark('grave_stone_wall_damaged', 20, 16, { scale: 3.5, rotation: 0 }),
  // 幽灵守卫
  themeLandmark('grave_character_ghost', 20, 14, { scale: 2.8 })
]
```

### 主题散布（180个）
```javascript
scatter: [
  // 密集的墓碑森林
  { idPrefix: 'grave_stones', 
    types: ['grave_gravestone_round', 'grave_gravestone_broken', 'grave_gravestone_cross', 'grave_cross_wood'], 
    count: 180, 
    allowedTiles: [TILE.paleGrass, TILE.grass], 
    scale: [1.0, 1.4] 
  },
  // 破墙边界
  { idPrefix: 'grave_edges', 
    types: ['grave_stone_wall_damaged', 'grave_iron_fence_border'], 
    count: 60, 
    allowedTiles: [TILE.wall], 
    scale: [2.4, 3.0] 
  }
]
```

### 特色
- ⚰️ 墓碑森林，密密麻麻
- 👻 巨大陵墓 + 幽灵
- 🧱 破损石墙边界

---

## 地图 5：六角遗迹 → 🏛️ 古代神殿

### 核心主题
**破损的古代神殿 - 史诗、古老、神秘**

### 标志性地标（3个）
```javascript
decorativeObjects: [
  // 中央神殿废墟
  themeLandmark('hex_building_mine', 20, 16, { scale: 3.5 }),
  // 两侧石柱
  themeLandmark('hex_stone_hill', 12, 16, { scale: 3.0 }),
  themeLandmark('hex_stone_hill', 28, 16, { scale: 3.0 })
]
```

### 主题散布（120个）
```javascript
scatter: [
  // 密集的遗迹碎石
  { idPrefix: 'hex_ruins', 
    types: ['hex_stone_rocks', 'hex_grass_forest', 'platformer_rocks'], 
    count: 120, 
    allowedTiles: [TILE.paleGrass, TILE.grass], 
    scale: [1.1, 1.5] 
  },
  // 巨石边界
  { idPrefix: 'hex_edges', 
    types: ['hex_stone_hill', 'hex_stone_rocks'], 
    count: 60, 
    allowedTiles: [TILE.wall], 
    scale: [2.5, 3.0] 
  }
]
```

### 特色
- 🏛️ 中央神殿废墟
- 🗿 石柱、碎石遍地
- ⛰️ 巨石边界

---

## 地图 6：铁木营地 → 🔥 营火部落

### 核心主题
**帐篷围绕的营地 - 求生、粗犷、团结**

### 标志性地标（1个）
```javascript
decorativeObjects: [
  // 巨大中央营火
  themeLandmark('survival_campfire_fishing', 20, 16, { scale: 3.5 })
]
```

### 主题散布（100个）
```javascript
scatter: [
  // 密集的帐篷和物资
  { idPrefix: 'ridge_camp', 
    types: ['survival_tent', 'survival_box', 'survival_barrel', 'survival_chest'], 
    count: 100, 
    allowedTiles: [TILE.grass, TILE.tallGrass], 
    scale: [1.2, 1.6] 
  },
  // 岩石边界
  { idPrefix: 'ridge_edges', 
    types: ['survival_rock_a', 'survival_rock_b', 'survival_rock_c'], 
    count: 60, 
    allowedTiles: [TILE.wall], 
    scale: [2.4, 3.0] 
  }
]
```

### 特色
- 🔥 巨大中央营火
- ⛺ 帐篷和物资遍地
- 🪨 粗犷的岩石边界

---

## 地图 7：星雾高地 → 🗿 巨石神殿

### 核心主题
**巨石阵的终极高地 - 史诗、壮观、神圣**

### 标志性地标（1个）
```javascript
decorativeObjects: [
  // 巨大石阵中心
  themeLandmark('hex_stone_hill', 20, 16, { scale: 4.0 })
]
```

### 主题散布（100个）
```javascript
scatter: [
  // 密集的巨石
  { idPrefix: 'peak_stones', 
    types: ['platformer_rocks', 'platformer_stones', 'ridge_block_grass_edge'], 
    count: 100, 
    allowedTiles: [TILE.paleGrass, TILE.grass], 
    scale: [1.3, 1.8] 
  },
  // 悬崖边界
  { idPrefix: 'peak_edges', 
    types: ['ridge_block_grass_edge', 'hex_stone_hill'], 
    count: 60, 
    allowedTiles: [TILE.wall], 
    scale: [2.6, 3.2] 
  }
]
```

### 特色
- 🗿 巨大石阵中心
- ⛰️ 巨石遍地
- 🏔️ 悬崖边界

---

## 📊 重新设计对比

| 地图 | 原地标数 | 新地标数 | 原散布数 | 新散布数 | 原类型数 | 新类型数 |
|------|---------|---------|---------|---------|---------|---------|
| 星音草径 | 9 | 2 | 152 | 180 | 9 | 7 |
| 雾湖苇岸 | 8 | 3 | 158 | 160 | 8 | 4 |
| 风车农庄 | 6 | 1 | 170 | 210 | 6 | 4 |
| 月影墓园 | 11 | 2 | 222 | 240 | 11 | 6 |
| 六角遗迹 | 9 | 3 | 178 | 180 | 9 | 5 |
| 铁木营地 | 9 | 1 | 208 | 160 | 9 | 7 |
| 星雾高地 | 13 | 1 | 262 | 160 | 13 | 4 |

### 改进要点
- ✅ 地标数量大幅减少（平均 -70%）
- ✅ 散布密度保持或增加
- ✅ 装饰类型大幅减少（平均 -50%）
- ✅ 主题一致性 100%
- ✅ 视觉冲击力增强

---

## 🎯 实施计划

### 第一步：移除多余地标
- 每个地图只保留 1-3 个最标志性的地标
- 移除所有不相关的装饰

### 第二步：重新设计散布
- 增加主题散布密度到 100-180 个
- 统一装饰类型到 3-5 种
- 确保只在合适的地块上

### 第三步：统一边界
- 每个地图 60 个边界装饰
- 类型统一到 2-3 种
- 比例统一到 2.3-3.0

### 第四步：验证主题
- 检查每个装饰是否服务于主题
- 移除所有不相关元素
- 确保视觉一致性

---

## ✅ 成功标准

每个地图必须达到：
1. ✅ 主题一致性 100%
2. ✅ 地标数量 1-3 个
3. ✅ 散布密度 100-180 个
4. ✅ 装饰类型 ≤ 10 种
5. ✅ 边界统一 60 个
6. ✅ 视觉冲击力强
7. ✅ 标志性印象深刻

目标：让每个地图都像贝壳海岸一样令人难忘！
