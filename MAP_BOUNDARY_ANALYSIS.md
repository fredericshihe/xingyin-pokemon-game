# 地图边界视觉审查报告

## 审查目标
检查所有地图的区域边界划分，确保使用足够大的模型（岩石、山、树等）来明确分隔不同区域。以贝壳海岸（GodotMapV2_PirateShore）为参考标准。

## 贝壳海岸的优势（参考标准）

贝壳海岸使用**旧版边界系统**（`buildLegacyBoundaryVisualBlockers`），具有以下特点：

1. **更大的边界模型**：
   - 主要类型：`pirate_palm_detailed_straight`（棕榈树）、`pirate_rocks_sand_a/b/c`（沙滩岩石）
   - 比例范围：0.84-1.02（主要）、0.8-0.94（紧凑）
   - 实际渲染时还会乘以 0.88 的调整系数

2. **更少的堆叠层**：
   - 每个边界单元格只放置 1-3 个尝试对象
   - 没有 `stackLayers` 参数（新系统使用 4 层）
   - 结果：边界更清晰，不会过于密集

3. **手工调整的散布**：
   - 在 scatter 定义中有专门的 `shore_edges` 配置
   - 54 个边界装饰物，比例 0.72-1.05

## 其他地图的问题

所有其他地图都使用**新版边界系统**（`buildBoundaryVisualBlockers`），存在以下问题：

### 1. **GodotMapV2（草原）**
- **当前配置**：
  - 主要类型：`nature_rock_large`, `nature_stone_large`, `nature_bush_large`, `nature_log_stack`
  - 堆叠层数：4 层
  - 比例：0.94-1.06（主要）、0.9-1.02（紧凑）
- **问题**：4 层堆叠导致边界过于密集，视觉混乱
- **建议**：减少到 2-3 层，增大主要模型比例到 1.0-1.2

### 2. **GodotMapV2_MistLake（雾湖苇岸）**
- **当前配置**：
  - 主要类型：`hex_water_rocks`, `nature_rock_large`, `wetland_reed_clump`, `nature_lily_large`
  - 堆叠层数：4 层
  - 比例：0.94-1.06（主要）、0.9-1.02（紧凑）
- **问题**：芦苇和睡莲作为边界不够明显
- **建议**：增加更大的岩石模型，减少芦苇比例，堆叠层数减到 2-3

### 3. **GodotMapV2_FarmTown（风车农庄）**
- **当前配置**：
  - 主要类型：`town_hedge_large`, `nature_fence_planks`, `nature_rock_large`, `farm_cart_high`
  - 堆叠层数：4 层
  - 比例：0.94-1.06（主要）、0.9-1.02（紧凑）
- **问题**：树篱和栅栏不够高大，4 层堆叠显得杂乱
- **建议**：增大树篱比例到 1.1-1.3，减少堆叠到 2-3 层

### 4. **GodotMapV2_Graveyard（月影墓园）**
- **当前配置**：
  - 主要类型：`grave_stone_wall_damaged`, `grave_rocks`, `grave_iron_fence_border`, `grave_iron_fence_broken`
  - 堆叠层数：4 层
  - 比例：0.94-1.06（主要）、0.9-1.02（紧凑）
  - corridorScatterCount: 228, corridorScatterLayers: 4
- **问题**：墓园的边界应该更阴森、更明显，当前石墙不够大
- **建议**：增大石墙和岩石比例到 1.0-1.25，减少堆叠到 3 层

### 5. **GodotMapV2_HexRuins（六角遗迹）**
- **当前配置**：
  - 主要类型：`hex_stone_hill`, `hex_stone_rocks`, `hex_water_rocks`, `hex_grass_forest`
  - 堆叠层数：4 层
  - 比例：0.94-1.06（主要）、0.9-1.02（紧凑）
  - corridorScatterCount: 252, corridorScatterLayers: 4
- **问题**：遗迹应该有更大的石头山和岩石堆
- **建议**：增大石山比例到 1.1-1.35，减少堆叠到 3 层

### 6. **GodotMapV2_SurvivalRidge（铁木营地）**
- **当前配置**：
  - 主要类型：`survival_rock_a/b/c`, `survival_tree_log`, `survival_fence`
  - 堆叠层数：4 层
  - 比例：0.94-1.06（主要）、0.9-1.02（紧凑）
- **问题**：营地边界应该更粗犷，当前岩石和木头不够大
- **建议**：增大岩石和树干比例到 1.05-1.3，减少堆叠到 2-3 层

### 7. **GodotMapV2_BossHighland（星雾高地）**
- **当前配置**：
  - 主要类型：`ridge_block_grass_edge`, `hex_stone_hill`, `platformer_rocks`, `platformer_stones`
  - 堆叠层数：4 层
  - 比例：0.94-1.06（主要）、0.9-1.02（紧凑）
  - corridorScatterCount: 236, corridorScatterLayers: 4
- **问题**：作为最终地图，边界应该最壮观，当前不够震撼
- **建议**：增大草地边缘和石山比例到 1.15-1.4，保持 3-4 层但增大间距

## 核心问题总结

1. **堆叠层数过多**：所有新系统地图都使用 4 层堆叠，导致边界过于密集
2. **模型比例偏小**：0.94-1.06 的比例不够大，不如贝壳海岸的视觉冲击力
3. **缺少大型地标**：贝壳海岸的棕榈树非常显眼，其他地图缺少类似的大型标志物

## 推荐修改方案

### 方案 A：统一使用旧版系统（推荐）
将所有地图改为使用 `buildLegacyBoundaryVisualBlockers`，移除 `stackLayers` 参数：

```javascript
// 所有地图的 profile 都移除 stackLayers
// 在 buildBoundaryVisualBlockers 函数中添加判断，让所有地图都使用旧版系统
```

### 方案 B：优化新版系统参数
保持新版系统，但调整参数：

1. **减少堆叠层数**：从 4 层减少到 2-3 层
2. **增大模型比例**：
   - 主要比例：1.0-1.25（原 0.94-1.06）
   - 紧凑比例：0.95-1.15（原 0.9-1.02）
3. **增加深度偏移**：让每层之间的距离更大，避免重叠

### 方案 C：混合方案（最佳）
- 保持贝壳海岸使用旧版系统
- 其他地图使用优化后的新版系统（2-3 层，更大比例）
- 为每个地图定制最合适的边界模型组合

## 具体修改建议

### 立即修改（高优先级）

1. **减少所有地图的 stackLayers**：从 4 改为 2 或 3
2. **增大主要模型比例**：primaryScale 从 [0.94, 1.06] 改为 [1.05, 1.25]
3. **增大紧凑模型比例**：compactScale 从 [0.9, 1.02] 改为 [0.95, 1.15]

### 后续优化（中优先级）

1. 为每个地图选择更具标志性的大型边界模型
2. 调整 corridorScatterCount 和 corridorScatterLayers，避免过度密集
3. 增加 BOUNDARY_THEME_SCALES 中的比例值

### 长期改进（低优先级）

1. 考虑为每个地图设计独特的边界风格
2. 添加更多大型地标模型到边界系统
3. 优化边界模型的放置算法，确保视觉清晰度
