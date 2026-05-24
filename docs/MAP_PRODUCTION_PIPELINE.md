# 地图生产管线方案

本文档用于把 `100x100` 新地图从“文档坐标 + 手写 JS”升级为“可视化源数据 + 素材目录 + 自动验收 + 实机预览”的制作流程。

## 核心判断

当前最容易翻车的地方不是地图逻辑，而是缺少一个稳定的生产源。只靠在 `my_first_map.js` 里继续手写道路、装饰和事件，后面会出现三个问题：

- 视觉效果依赖手感，难以整体审查。
- 素材是否存在、尺寸是否合适、碰撞是否挡路，要到游戏里才发现。
- 事件、遇敌区、桥、恢复点、Boss 门槛容易互相覆盖。

因此第一步不是直接扩图，而是先建立生产管线。

## 源数据

新地图先使用仓库内的源数据文件：

- `src/game/data/mapSources/godotMapV2.source.json`

这个文件不是最终运行地图，而是地图设计的源文件，负责表达：

- `dimensions`：最终逻辑尺寸。
- `preserveRegion`：旧 `44x36` 保留区。
- `areas`：A-K 区域边界、主题、素材预算。
- `routes`：主路、环线、隐藏支路的锚点。
- `waterBodies` / `bridges`：水系和桥位。
- `safeClearings`：出生点、前哨、恢复点、桥头等留白区域。
- `encounterZones`：Z01-Z18 生态区。
- `events`：训练师、Boss、道具、恢复点、连战点。
- `assetPlacements`：必须手工导演的地标素材。
- `decorationRules`：可以规则化生成的小装饰。

后续如果迁移到 Tiled，这份 JSON 也能作为 Tiled Object Layer 的输入或对照账本。

## 素材目录

所有地图素材先进入：

- `src/game/data/mapAssetCatalog.js`

地图源数据只能引用素材别名，不能直接猜模型文件名。每个素材至少声明：

- `id`
- `status`
- `assetPath`
- `sourcePackage`
- `themeTags`
- `allowedAreas`
- `heightClass`
- `defaultBlocking`
- `footprint`
- `defaultScale`

这样后续摆放素材时，验证脚本可以自动发现：

- 文件不存在。
- 素材放错区域。
- 阻挡物压到主路或安全区。
- planned 素材还没真正接入运行时。

## 制作原则

大结构必须人工导演：

- 出生营地。
- 新世界入口。
- 湿地桥。
- 生存前哨。
- 三名部下。
- Boss 挑战门。
- 河口恢复点。
- 农田、码头、幽林、废场等区域身份。

小细节可以规则化生成：

- 草簇。
- 花。
- 碎石。
- 木桩。
- 桶瓶。
- 蘑菇。
- 灯笼。
- 破栅栏。

规则化生成必须受约束：

- 固定随机种子。
- 限定区域。
- 限定素材主题。
- 避开主路中心。
- 避开桥头和恢复点。
- 避开交互点。
- 控制同素材连续重复。

## 自动验收

执行：

```bash
npm run map:validate
```

验证内容包括：

- 地图尺寸必须是 `100x100`。
- 旧 `44x36` 保留区不能越界。
- 区域、路线、桥、事件、素材摆放坐标不能越界。
- ID 不能重复。
- `assetPlacements` 引用的素材必须存在于素材目录。
- active 素材的文件必须存在于 `public/assets`。
- planned 素材会提示但不阻断。
- 阻挡型素材不能压到主路、安全区和桥头。
- 遇敌区不能覆盖出生点、前哨、恢复点、桥面和 Boss 点。
- 必须存在 3 名部下、1 个 Boss、恢复点和连战点。

## 运行时生成

执行：

```bash
npm run map:build
```

会生成：

- `src/game/data/godotMaps/godot_map_v2.generated.js`

这个文件是自动产物，不手改。它会把源数据转换成当前 `ThreeLowPolyMap` 能读取的运行时结构，包括 `mapGrid`、`visualPaths`、`waterBodies`、`bridges`、`decorativeObjects`、`encounterZones` 和 `runtimeEvents`。

`assetPlacements` 会作为手工地标进入运行时，`decorationRules` 会按固定种子生成小装饰，并自动避开主路、安全区、桥头和事件点。生成结果会写入 `generationNotes.generatedRuleDecorationCounts`，方便回查每条规则实际产出了多少素材。

当前默认冒险地图仍是 `GodotMap`，`GodotMapV2` 只是可选注册地图，等实机检查通过后再切换默认入口。

## 预览图

执行：

```bash
npm run map:preview
```

会生成：

- `docs/godot-map-v2-layout-preview.svg`

这张图用来快速审查宏观构图：主路是否清楚、区域是否太硬、事件是否堆在一起、Boss 门槛是否有空间、遇敌区是否压到安全路径。规则生成的小装饰会以灰点显示；如果要检查灰点分布，先跑 `npm run map:build`，再跑 `npm run map:preview`。

执行：

```bash
npm run map:audit-runtime
```

会检查运行时地图是否仍然可达、事件是否可交互、规则装饰是否达到 `countRange` 下限，以及每个遇敌区是否有足够高草丛，避免出现“区域存在但几乎无法触发生态”的假区域。

## 推荐落地顺序

1. 完成 `mapAssetCatalog.js` 第一批 active/planned 素材登记。
2. 完成 `godotMapV2.source.json` 宏观布局。
3. 跑 `npm run map:validate`，先让源数据没有结构错误。
4. 跑 `npm run map:build`，生成运行时地图模块和规则装饰。
5. 跑 `npm run map:audit-runtime`，确认可达性、事件、装饰密度和遇敌区草丛占比。
6. 跑 `npm run map:preview`，人工看构图和规则灰点。
7. 调整源数据，直到主路、区域、事件密度清楚。
8. 再接入 Three 实机预览和浏览器验收。

## 明确不推荐

- 不直接把 300 个素材坐标塞进 `my_first_map.js`。
- 不用纯随机程序生成主章节地图。
- 不把下载目录绝对路径写进游戏数据。
- 不让强主题素材跨区域乱摆，例如海盗炮塔进农田、墓碑铺满新手路。
- 不在桥头、恢复点、前哨中心、Boss 站位堆素材。
