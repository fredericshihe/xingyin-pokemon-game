# 地图玩法升级详细设计文档

## 0. 执行前提（必读）

> **本文档（地图玩法升级）的全部开发工作，必须在主世界地图扩大为 `100×100` 格并完成验收之后，方可启动。**
>
> 在 `44×36`（当前 `my_first_map.js`）等小尺寸地图上直接铺训练师、Boss、隐藏点与野生档位，会因空间不足、镜头与性能未按大地图验证，导致返工。

### 0.1 「100×100 已完成」的验收标准

| # | 条件 | 说明 |
|---|------|------|
| 1 | 主章节地图逻辑网格为 **100（宽）× 100（高）** | 以 `mapGrid` / Godot 导出网格为准，可含边界墙 |
| 2 | 玩家可全图行走，镜头跟随正常 | 3D/Phaser 任一路线，无穿墙、无边界外跌落 |
| 3 | 遇敌、存档位置、传送/边界在 100×100 下稳定 | 含 `playerPos` 读写与刷新后位置正确 |
| 4 | 性能可接受 | 移动端与桌面端连续行走无明显卡顿（大地图渲染方案已落地，可参考根目录 `MAP_SYSTEM_REBUILD_PLAN.md`） |
| 5 | 旧存档兼容 | 已有玩家进入游戏时位置钳制在合法范围内，或一次性迁移到安全出生点 |

### 0.2 当前尺寸与目标

| 项目 | 现状 | 目标 |
|------|------|------|
| 主地图文件 | `src/game/data/godotMaps/my_first_map.js` | 同文件或 successor，**100×100** |
| 当前逻辑尺寸 | **44 × 36** | **100 × 100** |
| 玩法点位密度 | 不足以支撑 §4 全套内容 | 扩图后再按 §5 布点 |

### 0.3 整体路线图（产品排期）

```text
0. 地图扩大至 100×100（本文档 §6 阶段零）     ← 必须先完成
1. 地图玩法升级（本文档 §6 阶段一～八）       ← 100×100 验收后执行
2. 战斗失败系统方案 B（DEFEAT_SYSTEM_UPGRADE_PLAN.md）  ← 地图玩法验收后执行
3. 队伍/仓库（POKEMON_ROSTER_STORAGE_UPGRADE_PLAN.md）  ← 可与 1/2 按排期并行
```

### 0.4 与地图系统重做文档的关系

- 扩图与渲染性能方案见根目录 **`MAP_SYSTEM_REBUILD_PLAN.md`**（GBA 式大地图、镜头跟随、避免万级 DOM 瓦片等）。
- **阶段零**可与该文档中的大地图实施合并排期，但 **100×100 验收通过** 是启动本文档阶段一的硬性门槛。

---

## 1. 文档目标

本文档用于规划当前地图的玩法升级，把地图从“行走、遇敌、拾取少量道具”的基础体验，升级为一个更有探索目标、更有战斗节奏、更能消耗游玩时间的森林章节地图。

本次升级的核心目标：

- 增加地图探索时间，让玩家愿意反复走不同路线。
- 增加固定训练师战斗，避免只有随机野怪战斗。
- 加入隐藏 Boss 主线，给地图一个明确的最终挑战目标。
- 加入地图道具、隐藏点、连战挑战、稀有草丛等探索内容。
- **随地图探索进度推进，野生宝可梦的等级区间与可遇到种类逐步升级**，让玩家在推进主线时有明显的“森林变强”反馈。
- 保持当前项目规则：地图探索不直接奖励金币，金币仍主要由老师发放。
- 所有玩法尽量使用配置化数据管理，后续新增地图时可以复用。

## 2. 当前地图基础

当前地图是一个 3D 低多边形森林地图，逻辑网格为 **44×36**（待扩至 **100×100**，见 §0）。地图配置位于：

- `src/game/data/godotMaps/my_first_map.js`
- 地图注册入口：`src/game/data/overworldMaps.js`
- 3D 地图渲染：`src/game/ThreeLowPolyMap.jsx`
- 主游戏逻辑：`src/components/Game/OriginalGame.jsx`

当前已有基础能力：

- 玩家可在地图上移动。
- 高草丛可触发野生宝可梦。
- 地图可显示区域名称提示。
- 地图支持 `item`、`heal`、`info`、`trainer`、`merchant` 等互动类型。
- 背包系统支持精灵球、回复药、经验药水。
- 战斗系统已支持野生战斗和训练师战斗。
- 云端存档已经保存玩家队伍、背包、位置、地图等核心数据。

当前不足：

- 训练师战斗是随机生成队伍，不是固定地图事件。
- 地图事件没有唯一 ID，无法精确保存“已击败/已拾取”状态。
- Boss、部下、普通训练师、隐藏道具、探索进度还没有统一系统。
- 目前地图探索目标不够强，玩家容易不知道接下来该做什么。
- 野生遇敌表（`encounterTables.js`）与区域绑定后基本固定，**不会随击败部下、击败 Boss、探索完成度等进度变化**，后期草丛缺乏新鲜感。

## 3. 地图章节主题

建议把当前地图包装成一个完整章节：

### 章节名称

**迷雾森林试炼**

### 章节简介

玩家来到一片被迷雾包围的森林。森林中有一个隐藏首领“迷雾首领”，但首领不会直接接受挑战。玩家必须先在地图不同位置找到并击败 3 名部下训练师，获得线索后，最终 Boss 才会现身。

### 章节体验目标

玩家游玩路径应该是：

1. 从营地出发，阅读提示牌。
2. 探索草坡、密林、湖边、东南区域。
3. 发现普通训练师、道具和隐藏点。
4. 分别击败 3 名部下训练师（草丛野生宝可梦随进度变强、种类增多）。
5. 收到 Boss 解锁提示。
6. 前往隐藏区域挑战 6 只宝可梦的 Boss。
7. Boss 胜利后解锁后续探索内容、更高档野生遇敌与完成度奖励。

## 4. 核心玩法系统

### 4.1 隐藏 Boss 主线

地图新增 1 名最终 Boss。

Boss 规则：

- Boss 默认不可挑战。
- 玩家必须先击败 3 名部下训练师。
- Boss 队伍固定为 6 只宝可梦。
- Boss 是当前地图最难战斗。
- Boss 等级应略高于地图普通训练师和野生宝可梦。
- Boss 战胜利后给稀有道具奖励，并标记地图主线完成。

建议 Boss 配置：

| 字段 | 建议值 |
|---|---|
| ID | `mist_boss` |
| 名称 | 迷雾首领 |
| 位置 | 地图中央或较深处隐藏空地 |
| 队伍数量 | 6 |
| 难度 | 全地图最高 |
| 解锁条件 | 击败 3 名部下训练师 |
| 胜利奖励 | 高级球、好伤药、经验药水、地图完成标记 |

Boss 未解锁时提示：

> 这里有一股强大的气息，但迷雾挡住了道路。也许需要先击败森林里的 3 名部下训练师。

Boss 解锁时提示：

> 三枚试炼印记开始发光。迷雾深处的强者已经接受了你的挑战。

### 4.2 三名部下训练师

新增 3 名中等难度部下训练师，分布在不同区域。

部下规则：

- 每人 3 只宝可梦。
- 队伍固定，不随机。
- 每名部下都有独立 ID。
- 击败后保存状态。
- 击败后给 Boss 线索。
- 已击败后再次互动不重复进入战斗，只显示对话。

建议配置：

| ID | 名称 | 区域 | 队伍数量 | 玩法作用 |
|---|---|---|---|---|
| `guard_meadow` | 草坡巡逻员 | 阳光草坡 | 3 | 第一个部下，难度最低 |
| `guard_grove` | 密林守卫 | 密林草丛 | 3 | 第二个部下，偏防守 |
| `guard_lake` | 湖畔观察员 | 湖边区域 | 3 | 第三个部下，接近 Boss 难度 |

部下击败进度提示：

- 击败 1 人：`已击败部下训练师 1/3。森林深处传来了细微的动静。`
- 击败 2 人：`已击败部下训练师 2/3。迷雾开始变淡。`
- 击败 3 人：`已击败部下训练师 3/3。隐藏 Boss 已经出现。`

### 4.3 普通训练师扩展

为了增加地图战斗量，除 3 个部下外，再加入 4 到 6 个普通训练师。

普通训练师规则：

- 每人 1 到 2 只宝可梦。
- 难度低于部下训练师。
- 不影响 Boss 解锁。
- 击败后可给小道具或提示。
- 用于让地图探索过程中有更多战斗节奏。

建议普通训练师：

| ID | 名称 | 区域 | 队伍数量 | 特点 |
|---|---|---|---|---|
| `trainer_bug_kid` | 捕虫少年 | 阳光草坡 | 2 | 初级战斗 |
| `trainer_camper` | 露营训练师 | 营地附近 | 1 | 新手引导 |
| `trainer_fisher` | 湖边钓鱼人 | 湖边 | 2 | 水边主题 |
| `trainer_lost` | 迷路训练师 | 密林小路 | 2 | 藏在岔路 |
| `trainer_item_hunter` | 道具猎人 | 隐藏道具附近 | 2 | 提示隐藏道具 |
| `trainer_challenger` | 森林挑战者 | Boss 路线附近 | 2 | Boss 前预热 |

### 4.4 连战挑战点

新增一个“试炼石碑”或“挑战石碑”。

触发规则：

- 玩家靠近石碑后可选择是否开始。
- 开始后连续进行 3 场战斗。
- 中途不能领取奖励。
- 全部胜利后获得稀有道具。
- 失败则不发奖励，可以稍后重试。

推荐三场战斗：

1. 第一场：普通野生宝可梦，难度较低。
2. 第二场：强化野生宝可梦，等级略高。
3. 第三场：试炼训练师，2 只宝可梦。

设计目的：

- 明显增加地图可玩时间。
- 给玩家一个主动选择的战斗挑战。
- 避免所有战斗都由走路随机触发。

### 4.5 地图道具拾取

地图加入一次性道具。

道具分三类：

#### 可见道具

地图上显示道具球或闪光点，玩家走上去获得。

建议数量：8 到 12 个。

推荐道具：

- 普通精灵球
- 超级球
- 伤药
- 好伤药
- 小型经验药水
- 中型经验药水

#### 隐藏道具

玩家靠近特殊地标时触发，例如：

- 石头后面
- 树桩旁边
- 花丛中心
- 湖边角落
- 岔路尽头

隐藏道具需要增加提示：

> 草丛里有东西在闪光。

或：

> 你在石头后面发现了一个道具！

#### Boss 前补给

Boss 附近放置少量补给，帮助玩家准备最终战。

建议：

- 好伤药 x1
- 超级球 x1
- 小型经验药水 x1

### 4.6 探索完成度

新增地图探索完成度统计。

建议统计项：

| 类型 | 数量建议 |
|---|---|
| 击败普通训练师 | 0/6 |
| 击败部下训练师 | 0/3 |
| 击败 Boss | 0/1 |
| 拾取可见道具 | 0/10 |
| 发现隐藏点 | 0/6 |
| 完成连战挑战 | 0/1 |

显示方式：

- 初期可以先用通知提示。
- 后续可在地图界面增加“探索进度”按钮。
- 打开后显示完成度列表。

完成奖励：

- 完成 50%：提示“你已经熟悉这片森林。”
- 完成 80%：赠送一个中型经验药水。
- 完成 100%：解锁 Boss 再战或特殊稀有草丛（可选：稀有野生权重 +5%，不改变档位 ID）。

### 4.7 小谜题与路线探索

为了增加探索时间，可以加入轻量谜题，不做复杂到让玩家卡住的设计。

推荐谜题：

#### 三块线索牌

地图上放 3 块线索牌：

1. 草坡线索牌
2. 密林线索牌
3. 湖边线索牌

读完 3 块后，可以提示 Boss 位置。

#### 地标访问顺序

玩家需要依次找到：

1. 营地木牌
2. 湖边石头
3. 密林蘑菇圈

完成后解锁一个隐藏道具。

#### 岔路尽头奖励

地图上几条非主路尽头放：

- 道具
- 普通训练师
- 隐藏提示
- 稀有草丛

这样玩家会愿意走完整张地图，而不是只沿主路走。

### 4.8 地图进度驱动的野生遇敌升级（核心）

玩家在同一张地图上推进探索（击败训练师、部下、Boss，完成隐藏点与连战等）时，**草丛中的野生宝可梦应随之变强、种类变丰富**。这是本章地图“越探越深、越战越强”的重要反馈，与固定训练师、Boss 主线形成互补。

#### 4.8.1 设计目标

| 目标 | 说明 |
|------|------|
| 进度可感知 | 击败 1/3 部下、解锁 Boss、击败 Boss 后，玩家能感到“这片森林的野生精灵不一样了” |
| 区域仍有差异 | 湖边仍偏水系、密林偏虫/草，**在进度档位之上**叠加区域特色 |
| 等级合理 | 野生等级与**出战队伍平均等级**挂钩，并随进度档位提高偏移，避免初期过难或后期过弱 |
| 配置可维护 | 档位、解锁条件、物种池、等级偏移均写在 `mapGameplay.js` / 遇敌配置中，新地图可复用 |
| 存档可恢复 | 进度档位由 `mapProgress` 推导或缓存，刷新后一致 |

#### 4.8.2 与现有代码的关系

当前实现（需改造接入进度）：

| 模块 | 路径 | 现状 |
|------|------|------|
| 区域遇敌表 | `src/game/data/encounterTables.js` | 静态 `ENCOUNTER_TABLES`，按 `encounterTableId` 抽物种与等级 |
| 草丛分区 | `my_first_map.js` → `encounterZones[]` | 每区 `encounterTableId`、`tallGrassRate` |
| 抽选逻辑 | `pickWildPokemon(tableId)` | 仅传表 ID，**未读地图进度** |
| 遇敌触发 | `ThreeLowPolyMap.jsx` / `EncounterSystem.js` | 草丛步进 → `pickWildPokemon` → `handleEncounter` |
| 队伍平均等级 | `getPlayerAverageLevel(playerTeam)` | 用于捕捉率等；**野生等级目前主要来自遇敌表行内 min/max** |
| 地图等级字段 | `mapLevel` / `maxReachedLevel` | 存档中有，可与进度档位联动或逐步统一 |

改造方向：**在 `pickWildPokemon` 之前（或内部）根据「地图 ID + 当前进度档位 + 区域表 ID」解析出最终遇敌表**，再交给现有 `pickWildEncounter` 做物种合法等级校验。

#### 4.8.3 进度档位（Encounter Tier）

每张地图定义 **0～N 档野生遇敌强度**，建议迷雾森林 **4 档**：

| 档位 ID | 名称 | 建议解锁条件 | 玩家侧提示（可选） |
|---------|------|----------------|-------------------|
| `tier_0` | 初探森林 | 默认进入地图 | — |
| `tier_1` | 试炼升温 | 击败任意 **1** 名部下训练师 | `森林里的野生宝可梦变得更有攻击性了。` |
| `tier_2` | 迷雾渐散 | 击败 **3** 名部下（Boss 解锁前后均可生效） | `更强的野生宝可梦开始在草丛中出没。` |
| `tier_3` | 首领余威 | 击败 **Boss** | `迷雾首领倒下后，稀有野生宝可梦偶尔会出现。` |

**档位计算规则：**

- 取当前地图 `mapProgress` 中已满足条件的 **最高档位** 作为 `currentEncounterTier`。
- 多条件同时满足时只升不降（除非设计“周目重置”，第一版不做降档）。
- 档位仅影响**野生遇敌**；固定训练师、Boss 队伍仍用各自 `levelOffset` 配置（见 8.3 难度平衡）。

可选扩展（后续版本）：

- 探索完成度 ≥ 50% / 80% 时额外 +0 档内等级偏移（不新增物种，只抬高等级上限）。
- 完成连战挑战 `trial_stone` 后，指定区域解锁 1 种稀有物种权重。

#### 4.8.4 每档变化内容（种类 + 等级）

每一档相对上一档，至少发生 **一类** 变化（建议两档都变）：

**1. 种类池（Species Pool）**

- 在区域基础表（如 `route102_grass`）上 **追加** 或 **替换** 条目，而不是整张地图统一换表（保留区域主题）。
- 低档仅基础形态（如妙蛙种子、绿毛虫）；高档加入进化型或稀有种（权重较低）。
- 新物种解锁时遵守 `wildEncounterRules.js` 的进化等级边界（`pickLevelForSpecies`）。

示例（草坡区 `route102_grass`，仅示意）：

| 档位 | 新增/加重物种 | 说明 |
|------|----------------|------|
| tier_0 | 妙蛙种子、绿毛虫、波波、小拉达 | 与现表一致 |
| tier_1 | 铁甲蛹、比比鸟（低权重） | 击败 1 部下后出现 |
| tier_2 | 妙蛙草、大针蜂（低权重） | 3 部下全灭后 |
| tier_3 | 稀有：嘟嘟（极低权重）或 Boss 后专属表 | 击败 Boss 后 |

**2. 等级区间（Level Band）**

在区域行配置的 `minLevel` / `maxLevel` 基础上，叠加 **档位等级偏移**：

```text
最终 minLevel = zoneRow.minLevel + tierLevelOffsetMin + playerAvgBonusMin（可选，见下）
最终 maxLevel = zoneRow.maxLevel + tierLevelOffsetMax + playerAvgBonusMax（可选）
```

建议每档偏移（全图统一，便于平衡）：

| 档位 | `tierLevelOffsetMin` | `tierLevelOffsetMax` |
|------|----------------------|----------------------|
| tier_0 | 0 | 0 |
| tier_1 | +1 | +2 |
| tier_2 | +2 | +4 |
| tier_3 | +3 | +5 |

**与玩家平均等级联动（推荐）：**

野生单只等级 = 在 `[最终min, 最终max]` 内随机，且可与队伍平均等级 `playerAvg` 做软钳制，避免越级过多：

```text
软下限 = max(最终min, playerAvg - 2)
软上限 = min(最终max, playerAvg + tierMaxAbovePlayer)
```

建议 `tierMaxAbovePlayer`：tier_0→+3，tier_1→+4，tier_2→+5，tier_3→+6。

实现时仍须通过 `isLevelValidForSpecies`，进化型不能出现在非法等级。

**3. 遇敌率（可选）**

高档位可略提高 `tallGrassRate`（如 tier_2 +0.02），或仅对「深色草丛」「Boss 后草丛」生效，避免全程步进即战过于疲劳。

#### 4.8.5 区域与特殊草丛的配合

区域基础表不变，**进度档位作为乘数/补丁**叠加上去：

| 区域 | 基础 `encounterTableId` | 进度影响 |
|------|-------------------------|----------|
| 阳光草坡 | `route102_grass` / `forest_meadow` | 随档位增加进化型草系 |
| 密林草丛 | `route102_thicket` / `forest_spirit` | tier_2+ 提高鬼斯/凯西权重 |
| 湖边苇丛 | `route102_lake` / `forest_pond` | tier_1+ 可达鸭、鲤鱼王等级上移 |
| Boss 后稀有草丛 | 独立 `mist_post_boss` 表 | **仅 tier_3** 可抽该表或合并到原区 |

与 **4.9 稀有草丛** 的关系：稀有草丛 = 区域表 + 更高稀有权重 + 往往要求 **tier_2 或 tier_3** 才启用该 zone 的 `encounterTableId` 覆盖。

#### 4.8.6 解锁条件配置结构（建议）

在 `mapGameplay.js` 中为每张地图定义：

```js
export const MAP_ENCOUNTER_TIERS = {
  GodotMap: [
    {
      id: 'tier_0',
      name: '初探森林',
      unlock: { type: 'always' },
      levelOffset: { min: 0, max: 0 },
      maxAbovePlayerAvg: 3
    },
    {
      id: 'tier_1',
      name: '试炼升温',
      unlock: {
        type: 'defeatedTrainers',
        trainerIds: ['guard_meadow', 'guard_grove', 'guard_lake'],
        count: 1  // 击败其中任意 1 名部下
      },
      levelOffset: { min: 1, max: 2 },
      maxAbovePlayerAvg: 4,
      notifyText: '森林里的野生宝可梦变得更有攻击性了。'
    },
    {
      id: 'tier_2',
      name: '迷雾渐散',
      unlock: {
        type: 'defeatedTrainers',
        trainerIds: ['guard_meadow', 'guard_grove', 'guard_lake'],
        count: 3
      },
      levelOffset: { min: 2, max: 4 },
      maxAbovePlayerAvg: 5,
      notifyText: '更强的野生宝可梦开始在草丛中出没。'
    },
    {
      id: 'tier_3',
      name: '首领余威',
      unlock: { type: 'defeatedBoss', bossId: 'mist_boss' },
      levelOffset: { min: 3, max: 5 },
      maxAbovePlayerAvg: 6,
      notifyText: '稀有野生宝可梦偶尔在深处草丛出现。'
    }
  ]
}
```

**区域物种补丁**（与档位并列）：

```js
export const MAP_ENCOUNTER_PATCHES = {
  GodotMap: [
    {
      tierId: 'tier_1',
      tableId: 'route102_grass',
      addPokemon: [
        { id: 11, minLevel: 7, maxLevel: 14, weight: 12 }  // 铁甲蛹，等级随 pickLevelForSpecies
      ]
    },
    {
      tierId: 'tier_3',
      zoneId: 'grove_grass',           // 仅密林区
      replaceTableId: 'mist_post_boss' // 或 addPokemon 稀有条目
    }
  ]
}
```

运行时函数建议：

- `getMapEncounterTier(mapId, mapProgress)` → `'tier_0' | ...`
- `buildEffectiveEncounterTable(mapId, baseTableId, tierId, playerAvgLevel)` → 合并后的表对象
- `pickWildPokemonForMap(mapId, zone, mapProgress, playerTeam)` → 对外统一入口

#### 4.8.7 玩家可见反馈

| 时机 | 反馈 |
|------|------|
| 档位首次提升 | 全屏或顶部通知 + 战斗日志一条（`notifyText`） |
| 地图 HUD（可选） | 小图标或文字：`野生 Lv.档：试炼升温` |
| 遇敌日志 | 保持 `遇到了野生的 XXX (Lv.N)`；N 应随档位升高 |
| 图鉴/教学 | 首次进入 tier_1 可提示：“继续击败部下，草丛里会出现更强的宝可梦。” |

#### 4.8.8 边界与规则

1. **只影响野生战斗**：训练师、Boss、连战石碑队伍不走档位补丁。
2. **出战队伍平均等级**：使用 `playerTeam`（出战队伍），**不含仓库**（与 `docs/POKEMON_ROSTER_STORAGE_UPGRADE_PLAN.md` 一致）。
3. **降档**：第一版不支持；清档或新账号从 tier_0 开始。
4. **跨地图**：每张地图独立 `MAP_ENCOUNTER_TIERS`；换图时重新计算，不继承上一张图的档位。
5. **旧存档**：无 `mapProgress` 时视为 tier_0；有击败记录则 `normalize` 时重算档位并可选写回 `cachedEncounterTier`。
6. **非法物种等级**：补丁里配置的 min/max 若与进化规则冲突，抽选时自动跳过（现有 `pickWildEncounter` 过滤行为）。

#### 4.8.9 验收标准

- 新号进迷雾森林：仅 tier_0 物种与等级。
- 击败 1 名部下后：通知触发，草丛可出现 tier_1 补丁物种，野生等级整体上移。
- 击败 3 名部下后：tier_2 生效，密林/湖边与草坡差异仍明显。
- 击败 Boss 后：tier_3 生效，Boss 后草丛或稀有权重可遇到配置中的稀有种。
- 刷新页面后档位与遇敌结果一致（由 `mapProgress` 推导）。
- 捕捉率仍基于 `getPlayerAverageLevel(playerTeam)`，不随档位单独改公式（除非后续平衡需要）。

---

### 4.9 稀有草丛与特殊遇敌

在普通高草丛基础上加入特殊草丛；**特殊草丛的稀有表与权重应绑定地图进度档位**（见 4.8），避免一开始就刷出 Boss 后专属物种。

类型：

| 类型 | 效果 | 进度要求建议 |
|---|---|---|
| 普通草丛 | 正常遇敌 | tier_0 起 |
| 深色草丛 | 遇敌率更高 | tier_0 起 |
| 闪光草丛 | 有概率遇到稀有宝可梦 | tier_1+ |
| Boss 后草丛 | 击败 Boss 后才启用稀有表或 zone 覆盖 | tier_3 |

建议实现方式：

- 初期：`encounterZones` 配置 `encounterTableId` + `minEncounterTier`（可选字段）。
- 运行时：`pickWildPokemonForMap` 内校验档位，不满足则回退到区域基础表。
- 后续在 3D 地图上显示更明显的草丛特效（闪光/Boss 后草丛视觉区分）。

### 4.10 恢复泉水限制

当前地图可以有恢复点，但需要限制，避免无限刷战斗。

建议规则：

- 每次进入地图只能使用 1 次。
- 或击败 2 个训练师后恢复 1 次使用次数。
- Boss 解锁后额外赠送 1 次完整恢复。

提示文案：

> 清澈的泉水恢复了你的队伍，但泉水的光芒暂时暗淡了。

再次使用：

> 泉水还没有恢复力量，稍后再来吧。

### 4.11 Boss 后内容

Boss 打完后地图仍应有继续探索价值。

可解锁内容：

- Boss 再战。
- 特殊训练师出现。
- Boss 后稀有草丛。
- 新隐藏道具。
- 探索完成度奖励。

Boss 再战规则：

- 可重复挑战，但奖励降低。
- 或每日/每次重新进入地图只能挑战一次。
- 后续可以加入更高等级版本。

## 5. 数据结构设计

建议新增文件：

`src/game/data/mapGameplay.js`

用于保存地图玩法配置。

### 5.1 训练师配置结构

```js
export const MAP_TRAINERS = {
  GodotMap: [
    {
      id: 'guard_meadow',
      type: 'lieutenant',
      name: '草坡巡逻员',
      title: '迷雾部下之一',
      x: 12,
      y: 8,
      requiredForBoss: true,
      team: [
        { pokemonId: 1, levelOffset: 0 },
        { pokemonId: 10, levelOffset: 1 },
        { pokemonId: 25, levelOffset: 2 }
      ],
      beforeBattleText: '想见首领？先证明你能穿过这片草坡。',
      defeatedText: '你确实有资格继续前进。首领喜欢待在迷雾最浓的地方。',
      reward: {
        itemType: 'potion',
        itemKey: 'potion',
        quantity: 1
      }
    }
  ]
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `id` | 唯一 ID，用于保存击败状态 |
| `type` | `normal`、`lieutenant`、`boss` |
| `name` | 显示名称 |
| `x/y` | 地图格子位置 |
| `requiredForBoss` | 是否是 Boss 前置条件 |
| `team` | 固定宝可梦队伍 |
| `levelOffset` | 基于玩家平均等级的等级偏移 |
| `beforeBattleText` | 战斗前台词 |
| `defeatedText` | 已击败后台词 |
| `reward` | 胜利奖励 |

### 5.2 Boss 配置结构

```js
export const MAP_BOSSES = {
  GodotMap: {
    id: 'mist_boss',
    name: '迷雾首领',
    x: 24,
    y: 18,
    requiredTrainerIds: ['guard_meadow', 'guard_grove', 'guard_lake'],
    team: [
      { pokemonId: 4, levelOffset: 3 },
      { pokemonId: 7, levelOffset: 3 },
      { pokemonId: 1, levelOffset: 4 },
      { pokemonId: 25, levelOffset: 4 },
      { pokemonId: 58, levelOffset: 5 },
      { pokemonId: 133, levelOffset: 6 }
    ],
    lockedText: '迷雾挡住了你的去路。先击败 3 名部下训练师吧。',
    beforeBattleText: '你能走到这里，说明我的部下已经认可你了。',
    defeatedText: '森林记住了你的名字。'
  }
}
```

### 5.3 地图道具配置结构

```js
export const MAP_PICKUPS = {
  GodotMap: [
    {
      id: 'pickup_camp_ball',
      x: 7,
      y: 31,
      visible: true,
      itemType: 'pokeball',
      itemKey: 'pokeball_basic',
      quantity: 1,
      text: '你捡到了一个精灵球！'
    },
    {
      id: 'hidden_lake_potion',
      x: 36,
      y: 22,
      visible: false,
      itemType: 'potion',
      itemKey: 'super_potion',
      quantity: 1,
      text: '你在湖边石头后发现了好伤药！'
    }
  ]
}
```

回复药 `itemKey` 对照（与 `src/utils/gameData.js` 中 `POTIONS` 一致）：

| itemKey | 显示名 | 恢复量 |
|---------|--------|--------|
| `potion` | 伤药 | +20 HP |
| `super_potion` | 好伤药 | +50 HP |
| `hyper_potion` | 厉害伤药 | +120 HP |

地图拾取建议：早期可见道具发 `potion`（伤药），中后期或隐藏点发 `super_potion`（好伤药），Boss 前补给可混合 `super_potion` 与 `hyper_potion`。

### 5.4 探索进度结构

建议在云端存档中新增：

```js
mapProgress: {
  GodotMap: {
    defeatedTrainerIds: [],
    defeatedBossIds: [],
    collectedPickupIds: [],
    discoveredSecretIds: [],
    completedChallengeIds: [],
    usedHealPointIds: [],
    cachedEncounterTier: 'tier_0',      // 可选：上次计算的野生档位，normalize 时可校验
    unlockedEncounterTierNotifies: []   // 已播放过升档提示的 tierId，避免重复通知
  }
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `defeatedTrainerIds` | 已击败训练师 |
| `defeatedBossIds` | 已击败 Boss |
| `collectedPickupIds` | 已拾取道具 |
| `discoveredSecretIds` | 已发现隐藏点 |
| `completedChallengeIds` | 已完成连战挑战 |
| `usedHealPointIds` | 已使用恢复点 |
| `cachedEncounterTier` | 当前野生遇敌档位（可由进度重算；缓存便于 HUD 与调试） |
| `unlockedEncounterTierNotifies` | 已提示过的档位 ID 列表 |

### 5.5 野生遇敌档位与补丁结构

与 4.8 对应，建议在 `mapGameplay.js` 中导出：

- `MAP_ENCOUNTER_TIERS`：档位解锁条件、等级偏移、`maxAbovePlayerAvg`、升档文案。
- `MAP_ENCOUNTER_PATCHES`：按 `tierId` + `tableId`（或 `zoneId`）追加/替换物种行。

`encounterZones` 扩展字段（`my_first_map.js`）：

| 字段 | 说明 |
|---|---|
| `encounterTableId` | 区域基础遇敌表 |
| `tallGrassRate` | 草丛遇敌率 |
| `minEncounterTier` | 可选；低于此档位不启用该区特殊表（用于 Boss 后草丛） |

核心运行时（建议 `src/game/mapEncounterProgress.js`）：

| 函数 | 说明 |
|---|---|
| `getMapEncounterTier(mapId, mapProgress)` | 根据击败部下/Boss 等计算当前档位 |
| `buildEffectiveEncounterTable(...)` | 合并基础表 + 档位补丁 + 等级偏移 |
| `pickWildPokemonForMap(...)` | 供 `ThreeLowPolyMap` / `EncounterSystem` 调用 |
| `onMapProgressChanged(...)` | 击败训练师/Boss 后升档并触发 `notifyText` |

**与 `encounterTables.js` 的关系：**

- 静态表保留区域主题与默认物种池。
- 进度补丁只 **增量修改** 运行时表对象，不复制整张表到存档。
- 新地图复制 `MAP_ENCOUNTER_TIERS` 模板即可配置自己的解锁节奏。

## 6. 实现阶段计划

> **禁止跳过阶段零。** 未达 §0.1 验收标准前，不得开始阶段一及之后任何玩法开发。

### 阶段零：地图扩大至 100×100

目标：

- 将主章节地图逻辑尺寸从当前 **44×36** 扩为 **100×100**。
- 完成行走、碰撞、镜头、遇敌、存档位置在大地图下的验证。
- 预留后续玩法布点空间（营地、三路、Boss 隐藏区、多片草丛等，见 §5）。

验收标准：

- §0.1 表格五项全部通过。
- 地图边界与出生点确定，并在配置或文档中记录默认 `playerPos`。
- 扩图后仍兼容现有野外遇敌与能量扣费开战流程（玩法升级前保持可玩）。

说明：

- 本阶段 **只做地图尺寸与探索基础**，不强制完成 Boss/部下/固定训练师（属阶段一～八）。
- 可与 `MAP_SYSTEM_REBUILD_PLAN.md` 中的渲染/性能改造合并实施。

### 阶段一：玩法配置文件

目标：

- 创建 `mapGameplay.js`。
- 写入 Boss、3 名部下、普通训练师、道具、隐藏点的配置。
- 写入 `MAP_ENCOUNTER_TIERS`、`MAP_ENCOUNTER_PATCHES`（野生遇敌进度档位，见 4.8、5.5）。
- 暂时不接 UI 和战斗，只先把数据结构确定。

验收标准：

- 可以通过函数读取当前地图的训练师、Boss、道具配置。
- 可以通过 `getMapEncounterTier` 根据模拟的 `mapProgress` 返回正确档位。
- 每个玩法点都有唯一 ID。
- 配置命名清晰，方便后续维护。

### 阶段二：地图上显示玩法点

目标：

- 在 3D 地图中显示训练师模型或标记。
- 显示可见道具闪光点/道具球。
- Boss 未解锁时显示封印/迷雾提示。
- 已击败或已拾取的点不再显示。

验收标准：

- 玩家能在地图上看见训练师和道具。
- 已完成内容不会重复出现。
- 不影响现有行走和野外遇敌。

### 阶段三：固定训练师战斗

目标：

- 改造当前 `trainer` 战斗逻辑。
- 根据地图点位读取固定训练师配置。
- 支持普通训练师、部下训练师、Boss 三种难度。
- 训练师队伍不再随机生成。
- 击败部下/Boss 后更新 `mapProgress`，并调用 `onMapProgressChanged` 重算野生档位（见 4.8.9）。

验收标准：

- 触发指定训练师时，进入对应固定队伍战斗。
- 普通训练师 1 到 2 只宝可梦。
- 部下训练师 3 只宝可梦。
- Boss 6 只宝可梦。
- 战斗胜利后保存已击败状态。
- 击败第 1 名部下、第 3 名部下、Boss 后，野生档位按配置提升（可先单元测试，草丛实装见阶段三-B）。

### 阶段三-B：野生遇敌进度接入（可与阶段四并行）

目标：

- 实现 `mapEncounterProgress.js` 与 `pickWildPokemonForMap`。
- `ThreeLowPolyMap.jsx`、`EncounterSystem.js` 改为传入 `mapProgress`、`playerTeam`。
- 升档时播放 `notifyText`，写入 `unlockedEncounterTierNotifies`。
- `handleEncounter` 继续使用 payload 中的 `pokemonId` / `level`（由新抽选逻辑生成）。

验收标准：

- 满足 4.8.9 全部野生档位验收项。
- 不同区域在同档位下仍体现物种差异。
- 进化等级非法的组合不会被抽到。

### 阶段四：Boss 解锁

目标：

- 统计 3 个部下是否已击败。
- 未击败 3 个部下时，Boss 不允许挑战。
- 击败全部部下后显示 Boss 解锁提示。
- Boss 击败后野生档位升至 `tier_3`（与 4.8 一致）。

验收标准：

- 击败 0/3、1/3、2/3 时 Boss 仍锁定。
- 击败 3/3 后 Boss 可挑战。
- Boss 是当前地图最高难度战斗。
- Boss 击败后草丛可出现 tier_3 补丁物种（若已接阶段三-B）。

### 阶段五：地图道具与隐藏点

目标：

- 实现可见道具拾取。
- 实现隐藏道具发现。
- 道具加入背包。
- 拾取状态保存到云端。

验收标准：

- 道具只能领取一次。
- 领取后显示具体道具名。
- 刷新页面后已拾取道具不会再次出现。

### 阶段六：连战挑战点

目标：

- 新增试炼石碑。
- 支持 3 场连续战斗。
- 成功后发放奖励。
- 失败后可重试。

验收标准：

- 玩家可以主动选择是否开始连战。
- 连战胜利后记录完成状态。
- 奖励不会重复领取。

### 阶段七：探索完成度

目标：

- 统计训练师、Boss、道具、隐藏点、连战完成度。
- 在地图界面显示探索进度。

验收标准：

- 玩家可以看到当前探索完成情况。
- 完成度会随着行为实时更新。
- 完成度奖励不重复领取。

### 阶段八：Boss 后内容

目标：

- Boss 胜利后解锁后续探索。
- 加入 Boss 后稀有草丛或特殊训练师（草丛绑定 `tier_3` / `minEncounterTier: 'tier_3'`）。
- 支持 Boss 再战或高难版挑战。
- 可选：探索完成度 100% 时再提高稀有物种权重（不改变档位 ID）。

验收标准：

- Boss 胜利后地图仍有新内容。
- 玩家有继续探索动力。
- Boss 后草丛仅在高档位可遇到配置稀有种。

## 7. 推荐第一版落地范围

为了降低风险，第一版建议只做这些：

1. 创建玩法配置文件。
2. 加入 3 个部下训练师。
3. 加入 1 个 Boss。
4. 加入 8 个可见道具。
5. 保存已击败和已拾取状态。
6. Boss 解锁提示。
7. **野生遇敌至少 2 档**（tier_0 默认 + tier_2 击败 3 部下后升档）；tier_1 / tier_3 可第二小版补上。

第一版先不做：

- 连战挑战。
- 探索完成度面板。
- Boss 后再战。
- 复杂谜题。
- 特殊草丛视觉特效。
- 探索完成度驱动的额外等级偏移（仅档位 + 部下/Boss 即可）。

原因：

- 先把核心主线跑通。
- 避免一次改太多导致战斗、存档、地图显示同时出错。
- 后续可以逐步加内容。

## 8. 风险与注意事项

### 8.1 存档兼容

新增 `mapProgress` 时必须兼容旧存档。

如果旧存档没有 `mapProgress`，应默认：

```js
mapProgress: {}
```

不能因为旧账号缺字段导致游戏无法进入。

**野生档位兼容：**

- 缺 `cachedEncounterTier` 时，根据 `defeatedTrainerIds` / `defeatedBossIds` **重算** 档位并写回。
- 已有击败记录的老账号登录后，应直接享受对应档位，避免“打了部下草丛却不变强”的回档感。
- `unlockedEncounterTierNotifies` 缺失时，**不要**对历史已解锁档位重复弹全屏通知；仅对本次会话新升档提示。

### 8.2 金币规则

项目当前规则是：

> 战斗、捕获、地图探索不再直接获得经验或金币。

因此地图奖励应优先给：

- 精灵球
- 回复药
- 经验药水
- 特殊探索标记

不要直接给金币，避免破坏老师端发放金币的设计。

### 8.3 难度平衡

Boss 是最高难度，但不能难到玩家无法通过。

建议：

- 普通训练师：玩家平均等级 -1 到 +1
- 部下训练师：玩家平均等级 +1 到 +3
- Boss 前五只：玩家平均等级 +3 到 +5
- Boss 最后一只：玩家平均等级 +6
- **野生遇敌（随档位）**：在区域基础等级上叠加 4.8.4 的 `tierLevelOffset`，且单只野生等级建议不超过 `playerAvg + maxAbovePlayerAvg`（tier_3 建议 +6）
- **野生 vs 训练师**：同地图下，部下训练师应始终难于同档野生（固定队伍 + levelOffset），避免玩家只刷草丛不推主线

如果玩家平均等级过低，最低等级仍应保持合理，例如不低于 5 级；野生物种仍须满足 `wildEncounterRules` 进化等级下限。

### 8.4 能量消耗

训练师战斗目前需要能量。

需要确认：

- 普通训练师是否消耗能量。
- 部下训练师是否消耗能量。
- Boss 是否消耗更多能量。
- 能量不足时是否只提示，不进入战斗。

建议：

- 普通训练师：普通训练师消耗。
- 部下训练师：消耗同普通训练师或略高。
- Boss：消耗更高，但 Boss 解锁时给予一次泉水恢复机会。

### 8.5 地图阻挡与交互

训练师和 Boss 最好是阻挡型互动点：

- 玩家不能直接穿过去。
- 面向训练师时触发对话或战斗。

道具可以是可走上去拾取，也可以是靠近拾取。

## 9. 最终体验验收

完成后，玩家在当前地图中应能体验到：

- 有明确目标：击败 3 名部下，挑战隐藏 Boss。
- 有足够战斗：野怪、普通训练师、部下、Boss、连战挑战。
- 有探索奖励：可见道具、隐藏道具、线索牌、隐藏区域。
- 有成长节奏：路上获得补给，最终准备挑战 Boss。
- 有完成感：探索进度、Boss 解锁、Boss 胜利反馈。
- **有生态变化**：推进部下与 Boss 主线后，同一片草丛会遇到更强、更多种类的野生宝可梦。

## 10. 后续扩展方向

未来可继续扩展：

- 每张地图都有自己的 Boss 和支线训练师。
- 老师端可配置某些地图挑战奖励。
- 学生完成 Boss 后，老师端可以看到完成记录。
- 加入每日挑战训练师。
- 加入地图成就系统。
- 加入“困难模式 Boss 再战”。
- 加入特殊捕捉任务，例如在指定草丛捕获某只宝可梦。
- 按探索完成度百分比微调野生等级（不改变档位，仅 +0～+2 级软偏移）。
- 多地图连锁：通关 A 图 Boss 后，B 图初始野生档位从 tier_1 开始。

---

## 11. 关联文档

- 出战队伍与仓库、野生平均等级仅统计 `playerTeam`：`docs/POKEMON_ROSTER_STORAGE_UPGRADE_PLAN.md`
- 地图奖励宝可梦获得流程（满员安置）同上，Boss 后稀有种捕捉亦遵守该文档。

## 12. 后置升级（地图完成后执行）

### 12.0 总排期（三层门槛）

```text
100×100 扩图（§6 阶段零） → 地图玩法（§6 阶段一～八） → 失败系统方案 B
```

以下工作 **不得** 跳层并行，以免存档、`mapProgress` 与战斗链路冲突。

| 顺序 | 文档 / 阶段 | 内容摘要 |
|------|-------------|----------|
| 0 | **§6 阶段零** | 地图 **100×100** 扩大与基础探索验收 — **本文档其余阶段的硬性前置** |
| 1 | **本文档 阶段一～八** | 固定训练师、部下、Boss、`mapProgress`、野生档位、连战等 — **须在阶段零完成后执行** |
| 2 | `docs/DEFEAT_SYSTEM_UPGRADE_PLAN.md` | **方案 B**：失败分级扣金、账单、再战、Boss 冷却等 — **须在阶段一～八验收后执行** |

### 12.1 地图文档与失败文档的分工

- **地图文档负责**：谁在地图上、固定队伍、打赢解锁什么、野生档位、`defeatedTrainerIds` / `defeatedBossIds` 何时写入。
- **失败文档负责**：打输/逃跑的结算 UI、扣金分类型、能量与道具是否退还、再次挑战与 Boss 冷却的交互细节。

### 12.2 地图阶段与失败阶段的对应关系

| 地图阶段（§6） | 失败文档阶段（`DEFEAT_SYSTEM_UPGRADE_PLAN.md`） |
|----------------|--------------------------------------------------|
| 阶段一～二 | 不实施失败 V2（仅保持现有基线扣金/逃跑退能） |
| 阶段三～四（固定训练师、Boss 解锁） | 完成后启动 **D1**（文案、账单、预告）+ **D2**（训练师再战、Boss 冷却） |
| 阶段六（连战，若做） | 完成后启动失败文档 **D2** 中 `trial` 类型 |
| 阶段七～八 | 不阻塞失败 D1；D2/D3 可与探索完成度并行 |

### 12.3 地图实施时须为失败系统预留的接口

在地图阶段三、四开发时，请一并保证（失败文档 D2 将直接调用）：

1. 每场训练师/Boss 开战可传入 **`eventId`**、**`battleKind`**（含 `boss`）、可选 **`trainerRole`**（普通/部下）。
2. 战斗胜利回调中 **仅胜利** 写入 `mapProgress.defeatedTrainerIds` / `defeatedBossIds`。
3. 战斗失败回调 **不** 写入上述击败列表，并保留地图点可交互状态。
4. `commitCloudSnapshotWithResources` 或等价路径在失败时仍可扣 `goldDelta`、不退 `energyDelta`（与当前逻辑一致）。

详细规则与 UI 见：**`docs/DEFEAT_SYSTEM_UPGRADE_PLAN.md`**。

