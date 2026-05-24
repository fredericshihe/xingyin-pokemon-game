# GBA 风格大地图系统彻底重做方案

## 1. 目标说明

本方案的目标是把当前地图系统升级为类似 GBA《宝可梦绿宝石》的大地图探索系统，并保证后续可以作为网页游戏长期流畅运行。

最终效果应达到：

- 玩家可以在大地图中上下左右连续行走。
- 角色移动有方向动画，不是简单图片平移。
- 地图不会一次性缩放到屏幕里，而是镜头跟随玩家移动。
- 地图支持草丛、树木、水面、房屋、道路、洞穴、NPC、道具、传送点。
- 在草丛中行走可以触发野生宝可梦战斗。
- 支持多个地图区域连接，例如小镇、道路、森林、洞穴、商店。
- 移动端和电脑端都可以流畅运行。
- 后续可以直接扩展成正式网页游戏。

## 2. 当前地图系统现状

当前项目已经有地图探索功能，但它更像一个小型网格小游戏，还不是 GBA 宝可梦式大地图。

已观察到的现状：

- 主地图逻辑集中在 `src/components/Game/OriginalGame.jsx`。
- 地图数据主要是二维数组，例如 `mapGrid[y][x]`。
- 瓦片类型使用数字表示，例如：
  - `0`：普通草地
  - `1`：树木或墙壁
  - `2`：出口
  - `3`：道具
  - `5`：治疗点
  - `6`：告示牌
  - `7`：训练家
  - `8`：高草丛
  - `11`：水域
  - `12`：沙地
- 地图渲染方式是 React 把 `mapGrid.flat()` 展开成大量 HTML `div`。
- 玩家位置保存在 `playerPos`，移动时调用 `setPlayerPos`。
- 当前角色移动依赖 CSS `transition-all duration-200`，不是游戏引擎动画。
- 真实地图数据在 `src/data/maps/`，但尺寸偏小，例如 `Route1` 是 `10x18`。
- 现有地图选择界面在 `src/components/Game/MapSelectionScreen.jsx`。
- 地图遇敌、切图、道具拾取等逻辑和 React 组件强耦合。

当前系统可以继续支持小地图，但如果直接扩展到大地图，会遇到性能和维护问题。

## 3. 当前系统的主要问题

### 3.1 React 不适合直接渲染大型瓦片地图

现在每一个瓦片都是一个 HTML 元素。小地图时问题不明显，但如果做成 GBA 风格地图，可能会出现几千甚至上万个瓦片。

例如：

- `30x30` 地图有 900 个瓦片。
- `100x100` 地图有 10000 个瓦片。
- 如果再加 NPC、道具、动画、遮挡层，DOM 数量会继续增加。

React 每次状态更新都可能影响渲染性能。地图探索需要高频响应按键、动画和镜头移动，所以不应该用大量 DOM 元素承载核心地图。

### 3.2 地图数据表达能力太弱

当前数字二维数组只能表达简单地块，很难清楚表示：

- 哪些地方可走，哪些地方不可走。
- 哪些草丛可以遇敌。
- 哪个门通向哪张地图。
- NPC 的站位、朝向、对话。
- 道具是否已经被拾取。
- 哪些图层应该盖在角色上方，例如树冠、屋顶。
- 哪些区域触发剧情。

如果继续把所有信息塞进数字数组，会越来越难维护。

### 3.3 行走系统不够像宝可梦

GBA 宝可梦的移动不是普通网页按钮移动，而是“格子逻辑 + 像素动画”。

当前移动方式的问题：

- 没有真正的角色方向动画。
- 长按方向键连续移动体验不够自然。
- 没有输入缓冲，玩家快速按键时可能不跟手。
- 镜头没有像 GBA 游戏一样跟随地图世界。
- 角色、地块、事件的逻辑全部混在 React 组件里。

### 3.4 后续网页游戏扩展会困难

如果以后要做成完整网页游戏，地图系统需要承担更多能力：

- 更多地图区域。
- 更多 NPC。
- 更多剧情事件。
- 地图上的可交互物体。
- 传送门、房屋、洞穴、城镇道路连接。
- 天气、昼夜、动画水面。
- 手机端虚拟摇杆或方向键。

当前系统继续堆功能，会导致 `OriginalGame.jsx` 越来越大，后续维护困难。

## 4. 最优技术路线

最优方案是采用：

```text
React + Phaser 3 + Tiled + Supabase
```

职责分工如下：

```text
React：
登录、注册、老师后台、背包、队伍、商城、图鉴、战斗界面、弹窗 UI

Phaser 3：
大地图渲染、角色行走、镜头跟随、碰撞、地图事件、草丛遇敌

Tiled：
地图编辑、地图图层、碰撞层、草丛层、传送点、NPC、道具点

Supabase：
账号、金币、云存档、老师奖励、学生进度
```

简单理解：

- React 继续负责“网页应用界面”。
- Phaser 负责“真正会动的游戏地图”。
- Tiled 负责“画地图和配置地图事件”。
- Supabase 继续负责“保存玩家数据”。

这条路线最适合未来网页游戏，因为 Phaser 本身就是成熟的网页 2D 游戏引擎，支持 Canvas 和 WebGL，性能比大量 HTML `div` 好很多。

## 5. 为什么选择 Phaser 3

Phaser 3 的优势：

- 专门为网页 2D 游戏设计。
- 适合瓦片地图、角色动画、镜头跟随、碰撞检测。
- 可以加载 Tiled 导出的 JSON 地图。
- 可以在 React 项目中嵌入使用。
- 手机浏览器和电脑浏览器都能运行。
- 后续可以支持音效、粒子、天气、动画水面、过场效果。

不建议继续纯 React 写地图的原因：

- React 更适合 UI，不适合高频游戏画面。
- 地图越大，DOM 越多，性能越不稳定。
- 动画、碰撞、镜头、地图层级都需要自己重复造轮子。

## 6. 新地图系统架构

建议新增目录：

```text
src/game/
├── GameCanvas.jsx
├── phaserGame.js
├── scenes/
│   ├── BootScene.js
│   ├── WorldScene.js
│   └── BattleBridgeScene.js
├── world/
│   ├── MapLoader.js
│   ├── PlayerController.js
│   ├── CollisionSystem.js
│   ├── EncounterSystem.js
│   ├── EventSystem.js
│   ├── CameraSystem.js
│   └── SaveAdapter.js
└── data/
    ├── mapRegistry.js
    └── encounterTables.js
```

### 6.1 `GameCanvas.jsx`

作用：

- React 组件。
- 创建一个容器 `div`。
- 在这个容器中挂载 Phaser 游戏。
- 接收 React 传入的数据，例如玩家队伍、当前地图、存档位置。
- 接收 Phaser 发回来的事件，例如遇敌、打开背包、触发商店。

它只做桥接，不写复杂地图逻辑。

### 6.2 `phaserGame.js`

作用：

- 初始化 Phaser。
- 配置游戏宽高、背景、渲染模式。
- 注册场景。
- 设置父容器。

建议配置：

```js
const config = {
  type: Phaser.AUTO,
  parent: container,
  width: 480,
  height: 320,
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  },
  scene: [BootScene, WorldScene]
}
```

### 6.3 `BootScene.js`

作用：

- 预加载瓦片图。
- 预加载角色 sprite sheet。
- 预加载地图 JSON。
- 预加载必要音效。

所有地图资源都应在进入地图前预加载，避免边走边卡。

### 6.4 `WorldScene.js`

作用：

- 当前地图主场景。
- 加载 Tiled 地图。
- 创建图层。
- 创建玩家。
- 启动输入控制。
- 启动碰撞检测。
- 启动遇敌系统。
- 处理地图传送和事件。

这是新地图系统的核心。

### 6.5 `PlayerController.js`

作用：

- 管理方向键输入。
- 管理移动状态。
- 管理角色朝向。
- 管理行走动画。
- 管理输入缓冲。
- 保证玩家按格子移动。

推荐状态：

```js
{
  tileX: 10,
  tileY: 12,
  direction: 'down',
  isMoving: false,
  queuedDirection: null
}
```

### 6.6 `CollisionSystem.js`

作用：

- 判断目标格子能不能走。
- 读取 Tiled 的 `Collision` 图层。
- 支持特殊地形，例如水面、山坡、门口。

不要再只用 `tile === 1` 判断墙壁，应改为读取地图碰撞层。

### 6.7 `EncounterSystem.js`

作用：

- 判断玩家是否走在草丛层。
- 根据地图配置决定遇敌概率。
- 根据地图配置决定野生宝可梦种类和等级。
- 触发遇敌后通知 React 打开现有战斗系统。

推荐逻辑：

```text
玩家走完一格
-> 判断当前格子是否属于 Grass 层
-> 判断是否处于安全步数冷却
-> 随机判定遇敌
-> 命中后暂停 WorldScene
-> 通知 React 创建战斗
```

### 6.8 `EventSystem.js`

作用：

- 处理 NPC。
- 处理道具。
- 处理门和传送点。
- 处理治疗点。
- 处理商店入口。
- 处理剧情触发点。

这些事件应该从 Tiled Object Layer 中读取，而不是写死在 React 组件里。

### 6.9 `CameraSystem.js`

作用：

- 摄像机跟随玩家。
- 限制摄像机不超出地图边界。
- 控制缩放比例。
- 保证移动端和桌面端显示稳定。

推荐：

- 地图逻辑尺寸使用 `16x16` 瓦片。
- 画面显示可以放大 2 倍或 3 倍。
- 保持像素风时开启 `pixelArt` 和 `roundPixels`。

### 6.10 `SaveAdapter.js`

作用：

- 把 Phaser 中的地图状态转换为现有云存档格式。
- 保存当前地图 ID。
- 保存玩家所在格子。
- 保存已拾取道具 ID。
- 保存已击败训练家 ID。
- 保存剧情 flag。

不要保存整张地图数组，否则地图越大，云存档越重。

推荐存档结构：

```js
{
  world: {
    currentMapId: 'route_001',
    playerTile: { x: 10, y: 16 },
    direction: 'down',
    collectedItems: ['route_001_item_001'],
    defeatedTrainers: ['route_001_trainer_002'],
    storyFlags: {
      metProfessor: true
    }
  }
}
```

## 7. 地图数据格式设计

### 7.1 使用 Tiled 编辑地图

建议使用 Tiled 地图编辑器制作地图。

Tiled 导出格式：

```text
JSON
```

地图尺寸建议：

- 小房间：`10x8` 到 `20x15`
- 小镇：`40x30`
- 道路：`30x60` 或 `60x30`
- 森林：`60x60`
- 洞穴：`50x50`

不要一开始做超级大地图。先做多个中等地图，通过传送点连接，体验上就是大世界。

### 7.2 推荐图层

每张 Tiled 地图建议包含：

```text
Ground
Decoration
Collision
Grass
Events
Above
```

各层作用：

- `Ground`：地面，例如草地、道路、沙地、木地板。
- `Decoration`：普通装饰，例如花、石头、栅栏。
- `Collision`：不可通行区域，例如树、墙、水、屋顶边缘。
- `Grass`：可遇敌草丛区域。
- `Events`：NPC、道具、传送点、剧情触发点。
- `Above`：显示在角色上方的图层，例如树冠、房顶上沿。

渲染顺序：

```text
Ground
Decoration
Grass
玩家和 NPC
Above
UI
```

### 7.3 事件对象格式

Tiled 的 `Events` 层中，每个对象配置一个 `type`。

推荐类型：

```text
warp
item
npc
heal
shop
sign
story
```

传送点示例：

```json
{
  "name": "to_route_001",
  "type": "warp",
  "properties": {
    "targetMapId": "route_001",
    "targetX": 5,
    "targetY": 28,
    "targetDirection": "down"
  }
}
```

道具示例：

```json
{
  "name": "route_001_item_001",
  "type": "item",
  "properties": {
    "itemType": "potion",
    "itemKey": "smallPotion",
    "quantity": 1
  }
}
```

NPC 示例：

```json
{
  "name": "town_001_npc_001",
  "type": "npc",
  "properties": {
    "sprite": "boy",
    "direction": "left",
    "dialog": "听说草丛里会出现野生宝可梦！"
  }
}
```

## 8. 地图注册表设计

新增 `src/game/data/mapRegistry.js`。

示例：

```js
export const MAP_REGISTRY = {
  town_001: {
    id: 'town_001',
    name: '初始小镇',
    json: '/assets/maps/town_001.json',
    tileset: '/assets/tilesets/overworld.png',
    defaultSpawn: { x: 12, y: 18, direction: 'down' },
    bgm: 'town_theme',
    encounterTableId: null
  },

  route_001: {
    id: 'route_001',
    name: '1号道路',
    json: '/assets/maps/route_001.json',
    tileset: '/assets/tilesets/overworld.png',
    defaultSpawn: { x: 5, y: 28, direction: 'down' },
    bgm: 'route_theme',
    encounterTableId: 'route_001_grass'
  }
}
```

这样以后新增地图，只需要：

1. 在 Tiled 里画地图。
2. 导出 JSON 到 `public/assets/maps/`。
3. 在 `MAP_REGISTRY` 注册。
4. 配置传送点和遇敌表。

## 9. 遇敌表设计

新增 `src/game/data/encounterTables.js`。

示例：

```js
export const ENCOUNTER_TABLES = {
  route_001_grass: {
    baseRate: 0.12,
    safeStepsAfterBattle: 5,
    pokemon: [
      { id: 13, minLevel: 3, maxLevel: 5, weight: 40 },
      { id: 14, minLevel: 3, maxLevel: 6, weight: 30 },
      { id: 15, minLevel: 4, maxLevel: 6, weight: 20 },
      { id: 16, minLevel: 2, maxLevel: 4, weight: 10 }
    ]
  }
}
```

遇敌系统根据 `weight` 抽取宝可梦，根据 `minLevel` 和 `maxLevel` 抽取等级。

## 10. 玩家移动系统详细设计

### 10.1 移动规则

采用“格子逻辑 + 像素动画”。

规则：

- 地图瓦片大小：`16x16`。
- 玩家逻辑坐标：`tileX`、`tileY`。
- 玩家显示坐标：`x = tileX * 16`，`y = tileY * 16`。
- 每次移动只走一格。
- 移动过程中不允许改变实际坐标，但可以记录下一次方向。
- 走完一格后触发事件检测。

### 10.2 移动速度

推荐速度：

- 普通地面：`130ms` 到 `160ms` 一格。
- 沙地或泥地：`190ms` 到 `230ms` 一格。
- 冲浪或自行车可后续再做。

### 10.3 输入缓冲

为什么需要输入缓冲：

玩家长按或快速按方向键时，角色应该连续移动，而不是一卡一卡。

逻辑：

```text
如果正在移动：
  记录 queuedDirection

如果移动结束：
  如果 queuedDirection 存在：
    立刻尝试向 queuedDirection 移动
```

### 10.4 方向动画

角色需要四方向动画：

```text
walk_down
walk_up
walk_left
walk_right
idle_down
idle_up
idle_left
idle_right
```

资源建议：

```text
public/assets/characters/player.png
```

每帧建议：

- 原始帧：`16x24` 或 `16x32`
- 显示时放大 2 倍或 3 倍
- 使用 `pixelArt: true`

## 11. React 和 Phaser 通信设计

React 和 Phaser 不要互相乱改状态，必须通过清晰事件通信。

### 11.1 React 传给 Phaser

React 传入：

- 当前玩家队伍。
- 当前地图 ID。
- 玩家出生点。
- 云存档里的世界状态。
- 是否暂停地图。

示例：

```js
<GameCanvas
  worldSave={worldSave}
  playerTeam={playerTeam}
  onEncounter={handleEncounterFromWorld}
  onCollectItem={handleCollectItemFromWorld}
  onOpenShop={() => setView('shop')}
/>
```

### 11.2 Phaser 通知 React

Phaser 触发：

- `encounter`：遇敌。
- `collectItem`：拾取道具。
- `openShop`：打开商店。
- `heal`：治疗。
- `saveWorld`：保存地图状态。
- `showDialog`：显示对话。

示例：

```js
eventBus.emit('encounter', {
  mapId: 'route_001',
  pokemonId: 13,
  level: 4,
  terrain: 'grass'
})
```

## 12. 和现有战斗系统的衔接

当前战斗系统已经在 `OriginalGame.jsx` 中存在，不建议第一阶段重写战斗。

新地图系统遇敌后：

```text
Phaser 判断遇敌
-> 暂停 WorldScene
-> 通知 React
-> React 用现有逻辑创建敌方宝可梦
-> React 切换到 battle 视图
-> 战斗结束
-> React 切回 map 视图
-> Phaser 恢复 WorldScene
```

这样可以先只重做地图，不影响已有战斗、背包、队伍、商城。

## 13. 云存档优化方案

当前地图存档如果保存 `mapGrid`，未来会变得很重。

新方案不要保存整张地图，只保存玩家造成的变化。

推荐保存：

```js
{
  world: {
    currentMapId: 'route_001',
    playerTile: { x: 10, y: 16 },
    direction: 'down',
    collectedItems: [
      'route_001_item_001',
      'forest_001_item_003'
    ],
    defeatedTrainers: [
      'route_001_trainer_001'
    ],
    storyFlags: {
      starterChosen: true,
      professorIntroDone: true
    }
  }
}
```

好处：

- 存档更小。
- 地图资源可以随版本更新。
- 不会因为地图尺寸变大导致云同步变慢。
- 更适合网页游戏长期运营。

## 14. 性能优化要求

### 14.1 渲染优化

必须做到：

- 地图使用 Phaser Tilemap 渲染。
- 不再用 React 渲染每一个地图瓦片。
- 开启 `pixelArt`。
- 开启 `roundPixels`。
- 地图资源使用合图，减少图片请求。
- 只用 React 渲染 UI，不参与地图高频动画。

### 14.2 资源优化

建议：

- 瓦片图统一放到 `public/assets/tilesets/`。
- 角色图统一放到 `public/assets/characters/`。
- 地图 JSON 放到 `public/assets/maps/`。
- 常用资源在 `BootScene` 预加载。
- 大资源压缩后再上线。

### 14.3 移动端优化

移动端需要：

- 虚拟方向键。
- 大按钮，适合手指点击。
- 禁止页面滚动影响游戏。
- 处理横屏和竖屏。
- 避免超大贴图。
- 避免一张地图过大。

推荐移动端画面：

```text
上方：地图画面
下方：方向键 + 背包/队伍/图鉴/菜单按钮
```

### 14.4 地图尺寸建议

为了流畅运行，推荐拆分地图：

- 不要做一张 `500x500` 的超级大地图。
- 推荐多个 `40x40`、`60x60`、`80x80` 的地图区域。
- 用传送点连接区域。

这种方式和 GBA 宝可梦很接近，也更容易维护。

## 15. 分阶段执行计划

### 阶段 1：搭建 Phaser 地图原型

目标：

做出一个可以流畅行走的测试地图。

要做：

1. 安装 `phaser`。
2. 新建 `src/game/` 目录。
3. 创建 `GameCanvas.jsx`。
4. 创建 `phaserGame.js`。
5. 创建 `BootScene.js` 和 `WorldScene.js`。
6. 准备一张测试 Tiled 地图。
7. 准备一个玩家 sprite sheet。
8. 实现角色四方向移动。
9. 实现摄像机跟随。
10. 实现碰撞层。

完成标准：

- 页面中可以看到 Phaser 地图。
- 玩家可以用键盘方向键移动。
- 玩家不能穿过树、墙、水。
- 镜头跟随玩家。
- 画面不卡顿。

### 阶段 2：替换旧 MapScreen

目标：

让现有游戏进入地图时使用 Phaser，而不是 React 网格地图。

要做：

1. 保留现有 `OriginalGame.jsx` 的战斗、背包、队伍、商城。
2. 把 `view === 'map'` 时显示的 `MapScreen` 替换为 `GameCanvas`。
3. 把玩家队伍、当前地图、位置传给 Phaser。
4. Phaser 遇敌时通知 React。
5. React 继续使用现有 `handleEncounter` 创建战斗。

完成标准：

- 进入游戏后看到新地图。
- 在草丛里可以触发现有战斗。
- 战斗结束后能回到地图。
- 背包、队伍、商城按钮仍可使用。

### 阶段 3：Tiled 事件系统

目标：

地图事件不再写死在 React 组件里，而是由 Tiled 配置。

要做：

1. 支持 `warp` 传送点。
2. 支持 `item` 道具点。
3. 支持 `npc` 对话。
4. 支持 `heal` 治疗点。
5. 支持 `shop` 商店点。
6. 支持 `sign` 告示牌。
7. 支持事件 ID 存档。

完成标准：

- 可以从小镇走到道路。
- 可以进入房屋或洞穴。
- 拾取过的道具不会重复出现。
- NPC 可以显示对话。

### 阶段 4：云存档升级

目标：

让地图世界状态稳定同步到 Supabase。

要做：

1. 增加 `world` 存档字段。
2. 保存当前地图 ID。
3. 保存玩家格子坐标。
4. 保存玩家朝向。
5. 保存已拾取道具列表。
6. 保存已击败训练家列表。
7. 保存剧情 flag。
8. 兼容旧存档，没有 `world` 时使用默认出生点。

完成标准：

- 刷新网页后回到上次位置。
- 换设备登录后地图位置一致。
- 拾取过的道具不会重新出现。

### 阶段 5：正式大地图内容制作

目标：

制作类似 GBA 宝可梦的连续探索体验。

建议首批地图：

1. 初始房间。
2. 初始小镇。
3. 1号道路。
4. 森林。
5. 洞穴。
6. 商店。
7. 宝可梦中心或治疗屋。

完成标准：

- 玩家可以从房间出门到小镇。
- 可以从小镇走到道路。
- 道路草丛可以遇敌。
- 森林和洞穴有不同宝可梦分布。
- 地图切换自然，没有明显卡顿。

### 阶段 6：体验打磨

目标：

让体验更像正式游戏。

要做：

1. 添加行走音效。
2. 添加草丛晃动。
3. 添加水面动画。
4. 添加进入战斗前的闪屏或过场。
5. 添加 NPC 朝向玩家。
6. 添加地图名称提示。
7. 添加移动端虚拟方向键。
8. 添加暂停菜单。

完成标准：

- 角色移动有 GBA 游戏感觉。
- 画面稳定在流畅状态。
- 手机和电脑都好操作。

## 16. 需要保留的旧系统能力

重做地图时，不要推翻整个项目。

建议保留：

- 登录注册。
- 老师后台。
- 金币系统。
- 经验药水系统。
- 背包系统。
- 队伍系统。
- 商城系统。
- 现有战斗系统。
- Supabase 云存档。
- 宝可梦数据和技能数据。

建议替换：

- `MapScreen` 地图渲染。
- `mapGrid` 大地图存储方式。
- React 中的地图移动逻辑。
- React 中写死的地图事件逻辑。

## 17. 文件迁移建议

### 17.1 旧文件处理

`src/components/Game/OriginalGame.jsx` 现在过大，建议逐步拆分。

第一步不要马上重构全部，只处理地图相关部分：

- 把 `MapScreen` 替换为 `GameCanvas`。
- 把地图遇敌通过回调连接到现有 `handleEncounter`。
- 保留战斗和 UI 逻辑。

### 17.2 新文件添加顺序

建议按这个顺序创建：

```text
1. src/game/GameCanvas.jsx
2. src/game/phaserGame.js
3. src/game/scenes/BootScene.js
4. src/game/scenes/WorldScene.js
5. src/game/world/PlayerController.js
6. src/game/world/CollisionSystem.js
7. src/game/world/EncounterSystem.js
8. src/game/world/EventSystem.js
9. src/game/data/mapRegistry.js
10. src/game/data/encounterTables.js
```

## 18. 资源目录建议

建议新增：

```text
public/assets/
├── maps/
│   ├── town_001.json
│   ├── route_001.json
│   └── forest_001.json
├── tilesets/
│   └── overworld.png
├── characters/
│   ├── player.png
│   ├── npc_boy.png
│   └── npc_girl.png
└── audio/
    ├── walk_grass.mp3
    ├── bump.mp3
    └── encounter.mp3
```

注意：

- 如果使用任天堂原版素材，只能用于学习，不建议公开商用。
- 如果要正式上线，最好使用自制或可商用授权素材。

## 19. 高清非像素地图方案

前面的方案默认偏 GBA 像素风。如果想把地图做成高清风格，而不是像素风，也可以继续使用 `React + Phaser 3 + Tiled + Supabase`，但资源规格、渲染设置和美术流程要调整。

### 19.1 高清风格和像素风的区别

像素风：

- 常见瓦片大小是 `16x16` 或 `32x32`。
- 画面故意保留像素边缘。
- Phaser 需要开启 `pixelArt: true`。
- 图片放大时不做平滑处理。

高清风格：

- 常见瓦片大小是 `64x64`、`96x96` 或 `128x128`。
- 地图更细腻，有柔和阴影、草地纹理、水面渐变。
- Phaser 不要开启像素化放大。
- 图片需要正常抗锯齿和平滑缩放。

如果目标是“高清宝可梦式网页游戏”，推荐使用：

```text
瓦片尺寸：64x64
角色尺寸：64x96 或 96x128
地图单区尺寸：40x40 到 80x80
渲染方式：Phaser WebGL
地图编辑：Tiled
素材风格：高清俯视角 2D / 手绘 / 卡通 3D 渲染图
```

### 19.2 Phaser 高清渲染配置

高清地图不要使用像素风配置。

推荐：

```js
const config = {
  type: Phaser.AUTO,
  parent: container,
  width: 960,
  height: 640,
  backgroundColor: '#101827',
  pixelArt: false,
  roundPixels: false,
  antialias: true,
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  }
}
```

高清风格的重点不是把小图硬放大，而是从一开始就使用高清素材。

错误做法：

```text
拿 16x16 像素瓦片直接放大到 64x64
```

正确做法：

```text
使用原生 64x64 或 128x128 的高清瓦片素材
```

### 19.3 高清地图图层设计

高清地图仍然建议使用 Tiled 图层，但图层可以更丰富：

```text
Ground_Base       基础地面
Ground_Detail     草皮纹理、小石子、泥土边缘
Road              道路
Water             水面
Decoration        花、草、木箱、路牌
Buildings         房屋、围墙
Collision         碰撞层
Grass_Encounter   遇敌草丛区域
Shadow            阴影层
Light             光照层
Events            NPC、传送点、道具、剧情
Above             树冠、屋顶、前景遮挡
```

高清风格里 `Shadow` 和 `Light` 很重要，可以明显提升画面质感。

### 19.4 高清角色行走素材

高清角色也需要四方向动画：

```text
idle_down
idle_up
idle_left
idle_right
walk_down
walk_up
walk_left
walk_right
```

推荐规格：

```text
单帧尺寸：64x96 或 96x128
每方向帧数：4 到 8 帧
格式：PNG sprite sheet
背景：透明
```

如果没有角色动画，可以先用临时素材，但正式上线前建议统一角色风格。

### 19.5 高清地图性能注意事项

高清素材更容易卡顿，必须控制资源大小。

建议：

- 单张 tileset 图片尽量控制在 `2048x2048` 以内。
- 一个地图不要加载太多张大图。
- 每张地图只加载自己需要的 tileset。
- 远景背景、装饰物尽量合图。
- PNG 图片上线前使用压缩工具压缩。
- 大地图拆成多个区域，不要做一张超大地图。
- 移动端优先使用 `64x64`，不要一开始就用 `128x128`。

### 19.6 高清方案推荐结论

如果你想做高清风格，仍然推荐 Phaser，而不是回到 React DOM 地图。

最终选择：

```text
像素风：16x16 或 32x32 瓦片 + pixelArt: true
高清风：64x64 或 128x128 瓦片 + pixelArt: false
```

项目如果未来要面向学生和网页使用，最稳妥的是：

```text
第一版使用 64x64 高清卡通俯视角素材。
```

这样既比像素风更清晰，又不会像 128x128 那样太吃性能。

## 20. 地图自动制作方案

地图不能完全依赖手工一格一格画，否则后续内容制作会很慢。推荐采用“自动生成底图 + 人工精修 + Tiled 配置事件”的流程。

### 20.1 推荐总流程

```text
1. 先用脚本自动生成地图草稿
2. 导出为 Tiled JSON
3. 在 Tiled 里用 Terrain Brush 和 Automapping 自动美化边缘
4. 人工调整关键区域，例如城镇入口、道路、剧情点
5. 在 Events 层配置 NPC、道具、传送点、草丛遇敌
6. 导出最终 JSON 给 Phaser 使用
```

这种方式既快，又能保证地图不是完全随机的乱图。

### 20.2 Tiled 半自动制图

Tiled 自带两个非常重要的自动化能力：

- Terrain Brush：自动处理草地、道路、水边、悬崖等边缘过渡。
- Automapping：根据规则自动替换瓦片，例如把普通草地边缘自动变成草丛边缘。

官方文档：

- Tiled 官网：https://www.mapeditor.org/
- Tiled Terrain 文档：https://doc.mapeditor.org/en/stable/manual/terrain/
- Tiled Automapping 文档：https://doc.mapeditor.org/manual/automapping

推荐用法：

```text
画大块草地 -> Terrain Brush 自动补边
画道路主线 -> Terrain Brush 自动生成道路边缘
画水域轮廓 -> Terrain Brush 自动生成水岸
画规则标记层 -> Automapping 自动生成花草、石头、树木装饰
```

### 20.3 自动生成地图脚本

建议新增脚本：

```text
scripts/generate-map.mjs
```

它负责生成基础地图 JSON。

输入：

```js
{
  mapId: 'route_001',
  width: 60,
  height: 40,
  biome: 'grassland',
  seed: 12345,
  start: { x: 5, y: 35 },
  exits: [
    { id: 'to_town_001', x: 5, y: 39, targetMapId: 'town_001' },
    { id: 'to_forest_001', x: 55, y: 2, targetMapId: 'forest_001' }
  ]
}
```

输出：

```text
public/assets/maps/route_001.generated.json
```

生成步骤：

1. 创建基础草地层。
2. 用随机种子生成主道路。
3. 根据道路周围生成草丛。
4. 用噪声算法生成树木区域。
5. 用规则生成水塘、石头、花草。
6. 自动添加碰撞层。
7. 自动添加传送点对象。
8. 自动添加草丛遇敌区域。

### 20.4 自动地图算法选择

推荐从简单到复杂：

第一档：规则生成。

```text
适合道路、小镇、房间。
优点：可控、简单、稳定。
缺点：变化少。
```

第二档：噪声生成。

```text
适合森林、草地、水域、山地。
优点：自然。
缺点：需要额外规则保证道路连通。
```

第三档：房间和道路连接。

```text
适合洞穴、地下城、森林迷宫。
优点：能保证可探索。
缺点：需要处理死路和奖励点。
```

第四档：Wave Function Collapse。

```text
适合自动生成看起来像人工制作的瓦片地图。
优点：效果好。
缺点：实现复杂，不建议第一版使用。
```

第一版最推荐：

```text
规则生成 + 简单噪声 + Tiled 人工精修
```

### 20.5 自动生成道路的具体规则

道路地图可以这样生成：

```text
1. 从入口点到出口点生成一条主路径。
2. 主路径允许轻微左右摆动，不要完全直线。
3. 主路径宽度随机为 2 到 4 格。
4. 主路径旁边生成草丛。
5. 草丛外侧生成树木边界。
6. 随机放置少量道具点和 NPC 点。
7. 确保玩家从入口到出口一定可达。
```

伪代码：

```js
function generateRouteMap(width, height, start, end, seed) {
  const map = createLayer(width, height, 'grass')
  const path = createWanderingPath(start, end, seed)

  paintPath(map, path, 'road', 3)
  paintAround(map, path, 'tall_grass', 4)
  paintBorder(map, 'tree')
  placeObjects(map, ['npc', 'item', 'sign'])
  ensureReachable(map, start, end)

  return map
}
```

### 20.6 自动生成森林的具体规则

森林地图可以这样生成：

```text
1. 全地图先填充草地。
2. 边界填充树木。
3. 用噪声生成树木团块。
4. 生成一条主路和几条支路。
5. 支路尽头放道具。
6. 主路附近放 NPC 或训练家。
7. 草丛遇敌区域集中在道路两侧。
8. 最后运行可达性检查，避免出口被树堵住。
```

### 20.7 自动生成城镇的具体规则

城镇地图不要太随机，应该更规则：

```text
1. 生成草地底图。
2. 生成十字道路或环形道路。
3. 在道路两侧放房屋。
4. 中心放公告牌或广场。
5. 角落放树、花、栅栏。
6. 每栋房屋门口生成 warp 事件。
7. 商店和治疗屋使用固定位置。
```

城镇适合“模板生成”，不要完全随机。

### 20.8 自动生成后的人工精修

自动生成只能做 70%，剩下 30% 必须人工调。

人工精修重点：

- 起点和出口是否自然。
- 道路是否好看。
- 草丛分布是否合理。
- NPC 是否挡路。
- 道具是否放在有探索价值的位置。
- 传送点是否对齐门口。
- 碰撞层是否正确。
- 地图是否有记忆点，例如湖、桥、小屋、树林缺口。

## 21. 现成地图和素材下载来源

这一节分成两类：地图素材和现成地图。

地图素材是瓦片、角色、物品、音效，可以自己拼地图。现成地图是别人已经画好的完整地图，可以参考或改造。

### 21.1 最推荐的可商用免费素材

优先选择明确写着 `CC0` 的资源。CC0 通常表示可以免费用于个人和商业项目，通常不强制署名。

推荐来源：

- Kenney 资源总页：https://kenney.nl/assets
- Kenney RPG Urban Kit：https://kenney-assets.itch.io/rpg-urban-kit
- Kenney RPG Base：https://kenney.nl/assets/rpg-base
- OpenGameArt：https://opengameart.org/
- itch.io 免费 Top-down 素材搜索：https://itch.io/game-assets/free/tag-top-down

Kenney 的优点：

- 授权清晰。
- 很多资源是 CC0。
- 风格统一。
- 适合快速做原型和正式网页小游戏。

### 21.2 RPG 俯视角地图素材

可以下载这些作为第一版地图素材：

- Open RPG Fantasy Tilesets：https://finalbossblues.itch.io/openrtp-tiles
- 16x16 Puny World Tileset：https://opengameart.org/content/16x16-puny-world-tileset
- Free CC0 Top Down Tileset Template：https://opengameart.org/content/free-cc0-top-down-tileset-template-pixel-art
- RGS Dev CC0 Top Down Tileset：https://rgsdev.itch.io/free-cc0-top-down-tileset-template-pixel-art

这些更偏像素风，但可以用于原型。

如果要高清风格，可以搜索：

```text
itch.io top down RPG tileset 64x64
itch.io hand painted top down tileset
OpenGameArt top down 64x64 tileset
Kenney top down RPG
```

### 21.3 高清素材来源

高清素材一般比像素素材更少，免费资源质量差异较大。

可查找：

- itch.io 高清 Top-down 素材：https://itch.io/game-assets/tag-top-down
- OpenGameArt 2D 素材：https://opengameart.org/art-search-advanced
- CraftPix 免费游戏素材：https://craftpix.net/freebies/
- GameDev Market 免费资源：https://www.gamedevmarket.net/category/2d/?type=free
- Unity Asset Store 免费 2D 素材：https://assetstore.unity.com/2d?category=2d&free=true

注意：

- CraftPix、GameDev Market、Unity Asset Store 的资源不一定都是 CC0。
- 下载前必须看 License。
- 如果授权只允许 Unity 使用，就不要直接用于网页游戏。
- 如果授权要求署名，要在项目文档和游戏设置页保留署名。

### 21.4 角色素材来源

角色需要四方向行走动画。

可查找：

- Kenney characters：https://kenney.nl/assets
- itch.io character sprites：https://itch.io/game-assets/free/tag-character/tag-top-down
- OpenGameArt character sprites：https://opengameart.org/

搜索关键词：

```text
top down character sprite sheet free
RPG character four direction walking sprite
2D top down character 64x64
hand painted top down character
```

第一版可以用 Kenney 角色或任意 CC0 四方向角色，等地图系统稳定后再统一美术。

### 21.5 音效和音乐来源

地图系统至少需要：

- 行走音效。
- 撞墙音效。
- 草丛音效。
- 遇敌音效。
- 地图背景音乐。
- 传送音效。
- 对话确认音效。

可查找：

- Kenney audio：https://kenney.nl/assets?q=audio
- OpenGameArt audio：https://opengameart.org/
- Freesound：https://freesound.org/
- itch.io free music：https://itch.io/game-assets/free/tag-music

注意：

- Freesound 授权类型很多，必须筛选可商用授权。
- 背景音乐最好使用 `ogg` 和 `mp3` 两种格式，兼容浏览器。

### 21.6 现成地图在哪里找

可以找“已经画好的地图”，但要注意版权。

推荐搜索位置：

- itch.io：https://itch.io/game-assets
- OpenGameArt：https://opengameart.org/
- Tiled 官方论坛或示例项目：https://discourse.mapeditor.org/
- GitHub 搜索：`tiled rpg map json`

搜索关键词：

```text
Tiled RPG map json free
top down RPG town map free
fantasy village Tiled map
RPG forest map Tiled
2D top down town map CC0
```

使用现成地图时必须检查：

- 是否允许商用。
- 是否允许修改。
- 是否要求署名。
- 是否包含第三方素材。
- 地图 JSON 是否能和 Phaser/Tiled 兼容。

### 21.7 不建议使用的素材

不建议用于正式上线：

- 宝可梦原版地图。
- 宝可梦原版角色。
- 任天堂/Game Freak 原版 tileset。
- 网络上没有明确授权的地图截图。
- 从 ROM 或反编译项目中提取的商业游戏素材。

这些可以学习参考，但不要作为正式网页游戏资源。

### 21.8 第一版推荐素材组合

如果目标是快速做出可运行版本：

```text
地图编辑器：Tiled
引擎：Phaser 3
地图素材：Kenney RPG Urban Kit 或 Kenney RPG Base
角色素材：Kenney 角色或 itch.io CC0 top-down character
音效：Kenney Audio
地图制作：脚本自动生成底图 + Tiled Terrain Brush 精修
```

如果目标是高清风格：

```text
地图编辑器：Tiled
引擎：Phaser 3
瓦片尺寸：64x64
地图素材：itch.io / CraftPix / GameDev Market 中明确可商用的高清 top-down tileset
角色素材：64x96 或 96x128 四方向高清角色
音效：Kenney Audio + OpenGameArt
制作方式：先买或下载一套统一风格素材，不要混用太多来源
```

### 21.9 素材下载后的放置规则

下载后统一整理到：

```text
public/assets/
├── maps/
├── tilesets/
├── characters/
├── objects/
├── ui/
└── audio/
```

每个素材包保留一个授权说明：

```text
public/assets/licenses/
├── kenney-rpg-urban-kit.txt
├── openrtp-tiles.txt
└── character-pack-license.txt
```

正式上线前必须检查 `licenses` 目录，确认所有素材都能用于网页游戏。

## 22. 验收清单

地图系统重做完成后，应检查：

- 玩家可以连续行走。
- 长按方向键不会卡顿。
- 快速切换方向响应自然。
- 不能穿墙、穿树、穿水。
- 镜头跟随自然。
- 草丛能触发遇敌。
- 遇敌后能进入现有战斗。
- 战斗结束后能回到原地图位置。
- 传送点能切换地图。
- 道具拾取能保存。
- NPC 能对话。
- 刷新网页后位置不丢。
- 手机端方向键可用。
- 构建后能正常部署。

如果选择高清地图，还要额外检查：

- 高清素材没有被错误拉伸。
- 移动端帧率稳定。
- 单张贴图尺寸不过大。
- 地图切换时没有明显黑屏或卡顿。
- 所有素材授权可用于网页游戏。

如果使用自动地图生成，还要额外检查：

- 起点到出口一定可达。
- NPC 不会堵住主路。
- 道具不会生成在不可达区域。
- 传送点目标正确。
- 草丛遇敌区域不会覆盖房屋或水面。

## 23. 风险和注意事项

### 23.1 不要一次性重写所有系统

最安全的方法是只先替换地图系统。战斗、背包、队伍、商城先保留，降低风险。

### 23.2 不要继续扩大 `OriginalGame.jsx`

现在主游戏文件已经很大，后续地图逻辑必须拆出去，否则维护会越来越困难。

### 23.3 不要保存整张大地图

大地图必须保存“变化记录”，不要保存完整地图数组。

### 23.4 不要依赖非授权原版素材上线

学习阶段可以参考 GBA 风格，但正式网页游戏应该使用原创或授权素材。

### 23.5 先做原型再迁移正式逻辑

建议先做一个独立 Phaser 原型，确认移动、碰撞、镜头都顺滑，再接入现有游戏。

### 23.6 高清素材不要混用太多风格

高清素材很容易出现风格不统一的问题。比如房子是手绘风，树木是 3D 渲染风，角色又是像素风，放在一起会显得很乱。

建议第一版只使用同一个素材包，或者同一个作者的素材。

### 23.7 自动生成地图不能完全替代人工设计

自动生成适合做底图和批量内容，但重要地图仍然需要人工设计。

例如：

- 初始小镇。
- 教学路线。
- 第一个森林。
- 关键剧情房间。

这些地图要让玩家容易记住，不能完全随机。

## 24. 最终推荐结论

最优方案是：

```text
用 Phaser 3 彻底重做地图探索系统，
用 Tiled 管理大地图和事件，
React 保留现有 UI、战斗、背包、商城和老师后台，
Supabase 继续负责云存档和账号数据。
```

这样做的好处：

- 地图性能更好。
- 行走动画更像 GBA 宝可梦。
- 后续扩展 NPC、剧情、地图连接更容易。
- 可以自然发展成网页游戏。
- 不需要推翻现有账号、战斗和商城系统。

如果想做高清地图，推荐选择 `64x64` 高清卡通俯视角素材，并关闭 Phaser 的像素风渲染。地图制作采用“自动生成底图 + Tiled 半自动铺图 + 人工精修”的方式，素材优先使用 Kenney、OpenGameArt、itch.io 上授权清晰的资源。

推荐下一步先实现“阶段 1：Phaser 地图原型”，不要直接动全部游戏逻辑。原型跑顺后，再逐步替换旧 `MapScreen`。
