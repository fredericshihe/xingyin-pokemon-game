# 地图装饰物详细审查报告

## 审查范围
除贝壳海岸外的所有地图的 `decorativeObjects` 和 `scatter` 配置

## 审查标准（参考贝壳海岸）

### 贝壳海岸的优秀特点
```javascript
decorativeObjects: [
  { type: 'pirate_ship_wreck', x: 33, y: 19, scale: 1.02, rotation: -0.2 },  // 大型地标
  { type: 'pirate_boat_row_large', x: 30, y: 13, scale: 0.92, rotation: 0.45 }  // 中型地标
],
scatter: [
  // 主题装饰：海盗货物，scale 0.72-1.02
  { idPrefix: 'shore_cargo', types: ['pirate_barrel', 'pirate_crate', 'pirate_chest', 'pirate_flag', 'pirate_flag_pennant', 'pirate_bottle'], count: 76, allowedTiles: [TILE.sand], salt: 410, scale: [0.72, 1.02] },
  // 边界装饰：棕榈树和岩石，scale 0.72-1.05
  { idPrefix: 'shore_edges', types: ['pirate_palm_detailed_straight', 'pirate_rocks_sand_a', 'pirate_rocks_sand_b', 'pirate_rocks_sand_c', 'pirate_patch_sand_foliage'], count: 54, allowedTiles: [TILE.wall], salt: 419, scale: [0.72, 1.05] }
]
```

**关键特点**：
1. ✅ 有大型标志性地标（沉船 scale 1.02）
2. ✅ 主题明确（海盗/海滩）
3. ✅ 装饰物类型丰富（6种货物 + 5种边界）
4. ✅ 比例合理（0.72-1.05）
5. ✅ 数量适中（76 + 54 = 130个）

---

## 地图 1：星音草径（GodotMapV2）- 新手地图

### 当前配置
```javascript
decorativeObjects: [
  themeLandmark('nature_tree_oak', 10.2, 6.4),                    // 橡树
  themeLandmark('nature_lily_large', 11.3, 8.7),                  // 睡莲
  themeLandmark('town_fountain_round', 20.2, 10.5),               // 喷泉
  { type: 'town_lantern', x: 2.8, y: 15.1, scale: 1.25 },        // 灯笼
  { type: 'town_lantern', x: 36.7, y: 15.1, scale: 1.25 }        // 灯笼
],
scatter: [
  { idPrefix: 'meadow_flowers', types: ['nature_flower_yellow', 'nature_flower_red', 'nature_flower_purple_a', 'platformer_flowers'], count: 54, allowedTiles: [TILE.grass, TILE.tallGrass], salt: 120, scale: [0.72, 1.05], height: 0.16 },
  { idPrefix: 'meadow_edges', types: ['nature_rock_large', 'nature_stone_large', 'nature_bush_large', 'nature_log_stack'], count: 128, allowedTiles: [TILE.wall], salt: 131, scale: [2.05, 2.75], height: 0.22 }
]
```

### 问题分析
❌ **缺少大型标志性地标**：最大的是喷泉，但位置不够显眼  
❌ **主题不够突出**：草径应该有更多自然元素（大树、岩石）  
⚠️ **灯笼比例偏小**：1.25 对于入口地标来说不够大  
⚠️ **花朵散布过多**：54个花朵会显得杂乱  

### 改进建议
1. **增加大型地标**：
   - 在入口处（3, 16附近）放置大型橡树 scale 2.2-2.5
   - 在中央喷泉周围增加更多装饰
   - 在出口处放置标志性岩石或树木

2. **调整灯笼**：scale 1.25 → 1.8-2.0

3. **优化散布**：
   - 花朵 count: 54 → 42
   - 增加蘑菇、草丛等自然元素

4. **增加主题装饰**：
   - 添加木桩、石头路标等新手引导元素

---

## 地图 2：雾湖苇岸（GodotMapV2_MistLake）

### 当前配置
```javascript
decorativeObjects: [
  themeLandmark('nature_canoe', 27.4, 13.1, { rotation: 0.3 }),           // 独木舟
  themeLandmark('nature_lily_large', 24.8, 15.2, { rotation: -0.2 }),    // 睡莲
  themeLandmark('hex_water_rocks', 30.5, 18.4, { rotation: 0.15 })       // 水边岩石
],
scatter: [
  { idPrefix: 'lake_reeds', types: ['wetland_reed_clump', 'nature_lily_large', 'survival_patch_grass_large', 'nature_stone_flat_c'], count: 62, allowedTiles: [TILE.grass, TILE.tallGrass], salt: 210, scale: [0.74, 1.18], height: 0.16 },
  { idPrefix: 'lake_edges', types: ['hex_water_rocks', 'nature_rock_large', 'wetland_reed_clump', 'nature_lily_large'], count: 124, allowedTiles: [TILE.wall], salt: 216, scale: [2.05, 2.75], height: 0.22 }
]
```

### 问题分析
❌ **缺少大型地标**：独木舟、睡莲都是中小型装饰  
❌ **湖泊特色不够明显**：应该有更多水边特色装饰  
⚠️ **芦苇散布过多**：62个芦苇会显得密集  
⚠️ **边界装饰过多**：124个太多  

### 改进建议
1. **增加大型地标**：
   - 在湖边放置大型码头（shore_dock_small scale 2.5-2.8）
   - 增加大型水车（town_watermill scale 2.8-3.0）
   - 在湖中心放置大型岩石堆

2. **优化散布**：
   - 芦苇 count: 62 → 48
   - 边界 count: 124 → 96
   - 增加渔具、船桨等湖泊主题装饰

3. **增强雾气氛围**：
   - 添加更多灯笼（营造雾中灯光效果）
   - 增加神秘感装饰

---

## 地图 3：风车农庄（GodotMapV2_FarmTown）

### 当前配置
```javascript
decorativeObjects: [
  themeLandmark('town_windmill', 8, 8),                           // 风车
  themeLandmark('hex_building_farm', 31, 9),                      // 农场建筑
  themeLandmark('town_watermill', 9.5, 11.2, { rotation: 0.12 }), // 水车
  themeLandmark('farm_cart_high', 25, 14)                         // 农车
],
scatter: [
  { idPrefix: 'farm_rows', types: ['nature_wheat_stage_a', 'nature_wheat_stage_b', 'nature_crop_carrot', 'nature_crop_pumpkin'], count: 76, allowedTiles: [TILE.grass, TILE.tallGrass], salt: 310, scale: [0.8, 1.08], height: 0.16 },
  { idPrefix: 'farm_edges', types: ['town_hedge_large', 'nature_fence_planks', 'nature_rock_large', 'farm_cart_high'], count: 118, allowedTiles: [TILE.wall], salt: 318, scale: [2.0, 2.7], height: 0.22 }
]
```

### 问题分析
✅ **有大型地标**：风车、农场建筑、水车都很好  
✅ **主题明确**：农庄氛围浓厚  
⚠️ **农作物散布略多**：76个可能显得拥挤  
⚠️ **边界装饰略多**：118个可以减少  
⚠️ **缺少动物元素**：农庄应该有动物相关装饰  

### 改进建议
1. **保持现有地标**：风车、水车、农场建筑都很好

2. **优化散布**：
   - 农作物 count: 76 → 64
   - 边界 count: 118 → 92
   - 增加农作物种类多样性

3. **增加农庄特色**：
   - 添加稻草堆、谷仓门等装饰
   - 增加农具（铲子、锄头）
   - 考虑添加动物相关装饰（如果有模型）

4. **调整比例**：
   - 风车和水车可以更大（scale 2.8-3.2）

---

## 地图 4：月影墓园（GodotMapV2_Graveyard）

### 当前配置
```javascript
decorativeObjects: [
  themeLandmark('grave_lantern_glass', 20, 7),                              // 玻璃灯笼
  themeLandmark('grave_stone_wall_damaged', 6, 16, { rotation: 0.5 }),     // 破损石墙
  themeLandmark('grave_stone_wall_damaged', 34, 8, { rotation: -0.2 }),    // 破损石墙
  themeLandmark('grave_character_ghost', 28, 13),                           // 幽灵
  themeLandmark('grave_character_skeleton', 8, 8, { rotation: 0.35 }),     // 骷髅
  themeLandmark('grave_character_zombie', 33, 7, { rotation: -0.15 }),     // 僵尸
  themeLandmark('grave_coffin_old', 13, 19, { rotation: 0.2 }),            // 旧棺材
  themeLandmark('grave_bench_damaged', 32, 18, { rotation: -0.15 })        // 破损长椅
],
scatter: [
  { idPrefix: 'grave_plaza', types: ['grave_gravestone_round', 'grave_gravestone_broken', 'grave_gravestone_cross', 'grave_cross_wood', 'grave_pumpkin', 'grave_pumpkin_carved', 'grave_urn_round', 'grave_candle'], count: 86, allowedTiles: [TILE.paleGrass, TILE.grass], salt: 512, scale: [0.66, 0.94], height: 0.16, minRoadDistance: 2.75, minEventDistance: 2.4, respectSampledScale: true },
  { idPrefix: 'grave_stones', types: ['grave_gravestone_round', 'grave_gravestone_broken', 'grave_gravestone_cross', 'grave_cross_wood', 'grave_pumpkin', 'grave_pumpkin_carved', 'grave_urn_round'], count: 48, allowedTiles: [TILE.wall], salt: 510, scale: [0.78, 1.05], height: 0.16 },
  { idPrefix: 'grave_landmarks', types: ['grave_stone_wall_damaged', 'grave_iron_fence_border', 'grave_lantern_glass'], count: 18, allowedTiles: [TILE.wall], salt: 525, scale: [1.35, 2.05], height: 0.22 },
  { idPrefix: 'grave_edges', types: ['grave_stone_wall_damaged', 'grave_rocks', 'grave_iron_fence_border', 'grave_iron_fence_broken', 'grave_lantern_glass'], count: 132, allowedTiles: [TILE.wall], salt: 518, scale: [2.05, 2.8], height: 0.22 }
]
```

### 问题分析
✅ **主题非常明确**：墓园氛围浓厚  
✅ **装饰物丰富**：8个地标 + 4组散布  
⚠️ **墓碑散布过多**：86 + 48 = 134个墓碑太多  
⚠️ **边界装饰过多**：132个太密集  
⚠️ **缺少大型标志性建筑**：应该有教堂、陵墓等大型建筑  

### 改进建议
1. **增加大型地标**：
   - 添加大型陵墓或教堂废墟（如果有模型）
   - 增大石墙比例（scale 2.5-3.0）
   - 幽灵、骷髅、僵尸可以更大（scale 2.3-2.6）

2. **优化散布**：
   - grave_plaza count: 86 → 64
   - grave_stones count: 48 → 36
   - grave_edges count: 132 → 96
   - 增大墓碑比例：[0.66, 0.94] → [0.78, 1.12]

3. **增强恐怖氛围**：
   - 增加更多灯笼（营造阴森灯光）
   - 添加枯树、乌鸦等元素（如果有）
   - 增加雾气效果装饰

---

## 地图 5：六角遗迹（GodotMapV2_HexRuins）

### 当前配置
```javascript
decorativeObjects: [
  themeLandmark('hex_stone_hill', 20, 24),                        // 石山
  themeLandmark('hex_bridge', 31, 12, { rotation: 0.5 }),        // 桥
  themeLandmark('hex_building_dock', 32, 12, { rotation: 0.15 }), // 码头
  themeLandmark('hex_building_port', 28, 22, { rotation: 0.2 }), // 港口
  themeLandmark('hex_building_cabin', 6, 22, { rotation: -0.1 }), // 小屋
  ...buildHexRuinsPlazaLandmarks()                                // 广场地标
],
scatter: [
  { idPrefix: 'hex_ruins', types: ['hex_stone_rocks', 'hex_grass_forest', 'hex_unit_tree', 'hex_water_rocks'], count: 64, allowedTiles: [TILE.wall], salt: 610, scale: [0.85, 1.15] },
  { idPrefix: 'hex_landmarks', types: ['hex_stone_hill', 'hex_building_cabin', 'hex_water_rocks'], count: 18, allowedTiles: [TILE.wall], salt: 625, scale: [1.45, 2.15], height: 0.22 },
  { idPrefix: 'hex_edges', types: ['hex_stone_hill', 'hex_stone_rocks', 'hex_water_rocks', 'hex_grass_forest'], count: 136, allowedTiles: [TILE.wall], salt: 618, scale: [2.1, 2.85], height: 0.24 }
]
```

### 问题分析
✅ **有大型建筑地标**：港口、码头、小屋  
✅ **主题明确**：遗迹氛围  
⚠️ **遗迹特色不够突出**：应该有更多古老、破损的建筑  
⚠️ **边界装饰过多**：136个太密集  
⚠️ **缺少标志性遗迹**：应该有更大的遗迹核心建筑  

### 改进建议
1. **增加大型遗迹地标**：
   - 增大石山比例（scale 3.0-3.5）
   - 增大建筑比例（scale 2.8-3.2）
   - 添加更多遗迹建筑（矿场、市场、农场）

2. **优化散布**：
   - hex_ruins count: 64 → 52
   - hex_edges count: 136 → 96
   - 增大遗迹比例：[0.85, 1.15] → [0.95, 1.28]

3. **增强遗迹氛围**：
   - 添加破损的柱子、倒塌的墙壁
   - 增加古老的石碑、雕像
   - 添加藤蔓、苔藓等年代感装饰

---

## 地图 6：铁木营地（GodotMapV2_SurvivalRidge）

### 当前配置
```javascript
decorativeObjects: [
  themeLandmark('nature_tent_detailed_open', 14, 7),                      // 帐篷
  themeLandmark('survival_tent', 25, 25),                                 // 求生帐篷
  themeLandmark('survival_structure_canvas', 22, 24, { rotation: 0.1 }), // 帆布建筑
  themeLandmark('survival_workbench', 28, 25),                            // 工作台
  themeLandmark('survival_campfire_fishing', 24, 27),                     // 营火
  themeLandmark('survival_signpost', 13, 8),                              // 路标
  themeLandmark('survival_tree_log', 32, 8, { rotation: 0.4 })           // 树干
],
scatter: [
  { idPrefix: 'ridge_camp', types: ['survival_box', 'survival_barrel', 'survival_chest', 'survival_bedroll', 'survival_bedroll_packed', 'survival_resource_wood', 'survival_resource_planks', 'survival_tool_axe', 'survival_tool_pickaxe'], count: 82, allowedTiles: [TILE.grass, TILE.tallGrass], salt: 710, scale: [0.78, 1.12] },
  { idPrefix: 'ridge_landmarks', types: ['survival_tree_log', 'survival_structure_canvas', 'survival_tent', 'nature_tent_detailed_open'], count: 16, allowedTiles: [TILE.wall], salt: 725, scale: [1.4, 2.1], height: 0.22 },
  { idPrefix: 'ridge_edges', types: ['survival_rock_a', 'survival_rock_b', 'survival_rock_c', 'survival_tree_log', 'survival_fence'], count: 130, allowedTiles: [TILE.wall], salt: 718, scale: [2.05, 2.75], height: 0.22 },
  { idPrefix: 'ridge_rocks', types: ['survival_rock_a', 'survival_rock_b', 'survival_rock_c'], count: 42, allowedTiles: [TILE.wall], salt: 719, scale: [1.6, 2.1] }
]
```

### 问题分析
✅ **营地氛围浓厚**：帐篷、工作台、营火都很好  
✅ **装饰物丰富**：7个地标 + 4组散布  
⚠️ **营地物品散布过多**：82个太多  
⚠️ **边界装饰过多**：130个太密集  
⚠️ **缺少大型标志性建筑**：应该有更大的营地中心建筑  

### 改进建议
1. **增大现有地标**：
   - 帐篷 scale 2.6-3.0
   - 帆布建筑 scale 2.5-2.8
   - 工作台 scale 2.2-2.5

2. **优化散布**：
   - ridge_camp count: 82 → 64
   - ridge_edges count: 130 → 92
   - ridge_rocks count: 42 → 32
   - 增大物品比例：[0.78, 1.12] → [0.88, 1.24]

3. **增强营地特色**：
   - 添加更多求生工具
   - 增加防御工事（栅栏、瞭望塔）
   - 添加狩猎相关装饰

---

## 地图 7：星雾高地（GodotMapV2_BossHighland）

### 当前配置
```javascript
decorativeObjects: [
  themeLandmark('hex_stone_hill', 8, 6),                          // 石山
  themeLandmark('platformer_platform_overhang', 31, 9),           // 悬崖平台
  themeLandmark('platformer_flag', 29, 9),                        // 旗帜
  themeLandmark('platformer_flag', 33, 9),                        // 旗帜
  themeLandmark('pirate_cannon', 33, 10, { rotation: -0.3 }),    // 大炮
  themeLandmark('mine_crate_strong', 20, 26),                     // 矿箱
  themeLandmark('platformer_chest', 22, 26),                      // 宝箱
  themeLandmark('platformer_lever', 18, 13),                      // 拉杆
  themeLandmark('ridge_block_grass_edge', 12, 10)                 // 草地边缘
],
scatter: [
  { idPrefix: 'peak_plaza', types: ['platformer_stones', 'platformer_rocks', 'platformer_flowers', 'platformer_flowers_tall', 'platformer_hedge', 'ridge_block_grass_edge'], count: 92, allowedTiles: [TILE.paleGrass, TILE.grass], salt: 812, scale: [0.68, 0.98], height: 0.16, minRoadDistance: 2.75, minEventDistance: 2.4, respectSampledScale: true },
  { idPrefix: 'peak_stones', types: ['platformer_rocks', 'platformer_stones', 'platformer_hedge', 'platformer_flowers_tall'], count: 48, allowedTiles: [TILE.wall], salt: 810, scale: [0.85, 1.15] },
  { idPrefix: 'peak_landmarks', types: ['ridge_block_grass_edge', 'hex_stone_hill', 'platformer_platform_overhang'], count: 14, allowedTiles: [TILE.wall], salt: 825, scale: [1.5, 2.2], height: 0.24 },
  { idPrefix: 'peak_edges', types: ['ridge_block_grass_edge', 'hex_stone_hill', 'platformer_rocks', 'platformer_stones'], count: 134, allowedTiles: [TILE.wall], salt: 818, scale: [2.1, 2.85], height: 0.24 },
  { idPrefix: 'peak_supplies', types: ['mine_crate_strong', 'platformer_barrel', 'platformer_crate', 'platformer_chest'], count: 36, allowedTiles: [TILE.wall], salt: 819, scale: [1.65, 2.15] }
]
```

### 问题分析
✅ **装饰物丰富**：9个地标 + 5组散布  
⚠️ **作为最终地图不够震撼**：应该有更大、更壮观的地标  
⚠️ **广场散布过多**：92个太多  
⚠️ **边界装饰过多**：134个太密集  
⚠️ **缺少Boss区域标志**：应该有明显的Boss战场地标  

### 改进建议
1. **增加超大型地标**：
   - 增大石山比例（scale 3.5-4.0）
   - 增大悬崖平台（scale 3.0-3.5）
   - 添加巨大的石柱、纪念碑等

2. **优化散布**：
   - peak_plaza count: 92 → 68
   - peak_stones count: 48 → 36
   - peak_edges count: 134 → 96
   - 增大广场装饰比例：[0.68, 0.98] → [0.82, 1.15]

3. **增强终极氛围**：
   - 添加更多旗帜、火把
   - 增加战斗相关装饰（武器、盾牌）
   - 添加神秘的符文、魔法阵等

4. **创建Boss区域**：
   - 在Boss位置周围放置特殊装饰
   - 增加气势磅礴的背景装饰

---

## 总体改进建议

### 1. 比例调整原则
- **小型装饰**（花、草、蘑菇）：0.7-1.1
- **中型装饰**（箱子、桶、工具）：0.8-1.3
- **大型装饰**（树、岩石、建筑）：1.5-2.5
- **超大型地标**（风车、船、遗迹）：2.5-4.0
- **边界装饰**：2.0-3.0

### 2. 数量调整原则
- **小型散布**：40-60个
- **中型散布**：30-50个
- **边界散布**：80-100个
- **地标**：5-10个

### 3. 主题突出原则
每个地图应该有：
- **1-2个超大型标志性地标**（scale 3.0+）
- **3-5个大型主题地标**（scale 2.0-3.0）
- **主题一致的散布装饰**
- **特色边界装饰**

### 4. 摆放策略
- **入口处**：放置引导性地标
- **中心区域**：放置最大的标志性建筑
- **出口处**：放置过渡性地标
- **道路两侧**：适度散布，不要遮挡视线
- **边界**：密集但不杂乱

---

## 下一步行动

1. ✅ 已完成边界系统优化
2. 🔄 正在进行装饰物详细审查
3. ⏭️ 待实施具体的装饰物调整
4. ⏭️ 测试和微调

