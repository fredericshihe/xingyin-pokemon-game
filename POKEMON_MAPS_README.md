# 🗺️ 宝可梦真实地图集成

## ✅ 已完成

成功从 **宝可梦水晶版** 开源项目 (pret/pokecrystal) 提取了真实的游戏地图！

## 📦 已提取的地图

1. **Route1** (1号道路) - 10x18
   - 经典的新手道路
   - 包含草地、树木、高草丛

2. **Route2** (2号道路) - 10x27
   - 更长的探索路线
   - 地形更复杂

3. **DarkCave** (黑暗洞穴) - 10x36
   - 洞穴地形
   - 挑战性更高

## 🎮 如何使用

### 启动游戏时选择

1. 打开游戏 (http://localhost:3000)
2. 在启动画面选择初始宝可梦
3. 选择地图类型：
   - **🎲 随机生成** - 每次都是全新的迷宫地图
   - **🗺️ 经典地图** - 来自宝可梦水晶版的真实地图
4. 如果选择经典地图，可以选择具体的地图（Route1/Route2/DarkCave）

## 📁 文件结构

```
src/data/maps/
├── index.js          # 地图索引和导出
├── route1.js         # 1号道路数据
├── route2.js         # 2号道路数据
└── darkcave.js       # 黑暗洞穴数据

extracted_maps/       # 原始 .blk 文件
├── Route1.blk
├── Route2.blk
└── DarkCave.blk

extract-pokemon-maps.js  # 地图提取工具
```

## 🔧 技术细节

### 地图格式转换

原始地图使用 `.blk` 格式（二进制瓦片数据），已转换为 JavaScript 数组：

```javascript
// 瓦片类型映射
0  = 草地（可行走，15%遇敌率）
1  = 树木/墙壁（不可通行）
8  = 高草丛（可行走，37.5%遇敌率）
12 = 沙地（可行走，移动减速）
```

### 瓦片ID映射

从宝可梦水晶版的瓦片ID映射到我们的游戏：

```javascript
// 草地类型
0x01, 0x02, 0x03, 0x07, 0x0a, 0x31 → 0 (普通草地)

// 高草丛
0x08, 0x0b, 0x1a → 8 (高草丛)

// 树木/障碍物
0x42, 0x4d, 0x4e, 0x51, 0x52, 0x74, 0x6e, 0x6d → 1 (树木)

// 沙地
0x2f → 12 (沙地)
```

## 🎨 CSS 样式

所有瓦片类型都有对应的 CSS 样式：

- `bg-pattern-grass` - 浅绿色草地
- `bg-pattern-tree` - 深棕色树木
- `bg-pattern-tall-grass` - 深绿色高草丛
- `bg-pattern-sand` - 浅黄色沙地
- `bg-pattern-water` - 蓝色水域
- `bg-pattern-flower` - 金黄色花丛（出口）

## 🔄 添加更多地图

如果想添加更多地图：

1. 从 [pret/pokecrystal](https://github.com/pret/pokecrystal) 下载 `.blk` 文件
2. 放入 `extracted_maps/` 目录
3. 编辑 `extract-pokemon-maps.js`，在 `maps` 数组中添加新地图
4. 运行 `node extract-pokemon-maps.js`
5. 新地图会自动生成到 `src/data/maps/`

## 📊 地图统计

### Route1 (180个瓦片)
- 换行符: 37次
- 高草丛: 26次
- 路径: 22次
- 树木: 多种类型

### Route2 (270个瓦片)
- 更大的探索空间
- 更多地形变化

### DarkCave (360个瓦片)
- 最大的地图
- 洞穴特殊地形

## ⚖️ 版权说明

这些地图数据来自 **pret/pokecrystal** 开源项目（宝可梦水晶版的反编译）。

- **仅限教育和学习用途**
- 不得用于商业目的
- 原始游戏版权归任天堂/Game Freak所有

## 🚀 下一步

可以考虑：
- 添加更多经典地图（常青森林、月见山等）
- 支持地图切换（通过出口进入下一个地图）
- 添加地图特有的宝可梦分布
- 实现地图间的连接关系

---

**提取时间**: 2026年
**数据来源**: [pret/pokecrystal](https://github.com/pret/pokecrystal)
