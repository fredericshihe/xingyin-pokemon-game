# 宝可梦养成全链路审计记录

开始日期：2026-05-18

## 当前进度

| 阶段 | 状态 | 备注 |
| --- | --- | --- |
| 阶段 0：审计保护与测试基线 | 持续推进中 | 自动审计脚本已全量复跑；浏览器级刷新恢复、断网恢复、双标签冲突仍待最终手测 |
| 阶段 1：全宝可梦、技能、进化静态数据审计 | 持续守卫中 | 静态数据、官方数据、官方进化对齐脚本均已跑通；现行运行规则已统一改为“到等级直接进化”；多分支进化已补选择弹窗 |
| 阶段 2：升级、经验、学技能、忘技能、进化审计 | 已修复并复验 | 跨多级漏进化、进化后漏学技能已通过脚本复验归零 |
| 阶段 3：战斗流程审计 | 已完成代码首轮审查 | 战斗平衡抽样已完成，战斗阶段恢复仍待最终手测 |
| 阶段 4：金币、能量、经验、血量、技能值变化 | 已修复并复验 | 已补原子资源+云存档提交；逃跑退能量已改成“未进入战斗才退”，后端也已补并推送 `battleEnergyRefundEligible` 校验，当前重点转为手测刷新/断网恢复 |
| 阶段 5：商店、背包、道具 | 已修复并复验 | 商店购买、战斗奖励、开战扣能量已接入原子提交流程；地图道具/回血点/果实/商人奖励也已改为云快照先提交 |
| 阶段 6：云存档与“回退一秒”专项 | 持续进行中 | 成长事件、战斗阶段、回合内行动检查点、地图事件位置、地图版本迁移、捕捉结算、奖励握手、地图网格、传送切图、逃跑退款资格、训练家/区域试炼每日锁与刷新时间已接入云端确认链路；界面级手测留到最后 |
| 阶段 7：动画与品质补充点 | 部分完成 | 战斗换人动画与新手首次进入过场已补；成长/捕捉/地图反馈仍需最终视觉手测与补强 |
| 阶段 8：最终产物 | 进行中 | 审计脚本已创建并复跑；正式问题清单持续补充 |

## 本轮已完成

> 说明：下方 0.xx 分录保留当时排查现场；若旧分录里出现“待本轮复验”“当时构建阻塞”“EPERM 噪音”等历史状态，以最新的 0.66 复验结果和“当前问题清单”为准。

### 0.68 地图上的训练家 / 试炼 / Boss 完成态已接入可视反馈

本轮把前面已经收口的“每日锁 / 地图作用域完成态”继续推到了地图视觉层，避免逻辑已经生效，但地图上完全看不出来。

本轮修复：

- `OriginalGame` 新增 `buildMapEventVisualState`，会按当前地图实时计算每个训练家 / 部下 / Boss / 区域试炼的视觉状态，例如 `available`、`daily_complete`、`cleared`、`locked`、`completed`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7359)
- 当前地图的事件视觉状态会一路透传到地图画布与 3D 运行时，不再由地图层自己重复做业务判定：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:16490) [GameCanvas.jsx](/Users/shihe/Documents/宝可梦养成/src/game/GameCanvas.jsx:149)
- `ThreeLowPolyMap` 现在会按事件状态更新头顶信号和脚底光环：可挑战时保持完整动态效果；当天已挑战、已清除、Boss 未解锁、Boss 已完成时，会自动变成明显更安静的 muted 状态：[ThreeLowPolyMap.jsx](/Users/shihe/Documents/宝可梦养成/src/game/ThreeLowPolyMap.jsx:65) [ThreeLowPolyMap.jsx](/Users/shihe/Documents/宝可梦养成/src/game/ThreeLowPolyMap.jsx:1161)
- 这层更新是“局部状态刷新”，不是每次完成挑战都重建整个 WebGL 世界；3D 地图内部新增了 `eventVisualBindings`，只会把状态应用到对应的 signal / role effect 上：[ThreeLowPolyMap.jsx](/Users/shihe/Documents/宝可梦养成/src/game/ThreeLowPolyMap.jsx:1981) [ThreeLowPolyMap.jsx](/Users/shihe/Documents/宝可梦养成/src/game/ThreeLowPolyMap.jsx:3096)

本轮验证结果：

- `npm run audit:trainer-daily-scope`：通过。
- `npm run audit:cloud`：通过。
- 标准 `npm run build` 本轮卡在清空工作区 `dist/assets` 时的本地目录占用，不是代码编译错误。
- 已改用临时输出目录执行 `vite build --emptyOutDir false --outDir /private/tmp/pokemon-build-check`，编译通过，仅保留 Vite 大 chunk 体积警告。

仍需你最后手测：

- 普通训练家当天打完后，头顶提示和脚底光环应明显变弱，但角色仍在地图上。
- 部下训练家打完后，地图上要看得出已完成状态，并且不会再误触发战斗。
- Boss 未解锁、已解锁、已完成三种状态，地图上的辨识度要明显不同。
- 区域试炼当天完成后，头顶效果应变弱；次日凌晨刷新后恢复为可挑战状态。

### 0.69 区域试炼每日锁残余分支已彻底对齐

这轮复验时又抓到一个残留问题：区域试炼虽然已经被纳入“每日变体战斗”，但源码里还留着旧分支，导致“开战拦截、结算落库、地图表现、审计守卫”四段并没有完全统一。

本轮发现：

- 区域试炼结算仍残留 `isRepeatableChallenge ? false : ...` 旧逻辑，等于默认跳过了“今天是否已经打过”的每日锁判定。
- 地图可视反馈里，区域试炼仍按 `completedChallengeIds` 显示成永久完成态，而不是“当天 muted、次日恢复可挑战”。
- 区域试炼配置文案一度还保留“可继续挑战”的旧说法，会和现在的每日锁规则直接冲突。
- `audit:trainer-daily-scope` 当时也还在守着旧 marker，可能出现“源码逻辑没统一，但审计仍然放行”的假阳性。

本轮修复：

- 区域试炼开战前现在和普通每日训练家共用同一条地图作用域每日锁判断；同一天内再次交互会直接阻止开战：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:14088)
- 区域试炼胜利结算后，现在也会把当天完成状态写入 `dailyTrainerBattleIds`，不再只推进解锁阶段、不写每日锁：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:12348)
- 区域试炼地图视觉状态改成读取当天每日锁；当天打完显示 `daily_complete`，次日凌晨刷新后自然回到 `available`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7408)
- 区域试炼的完成/阻止文案已经统一改成“今天已完成，明天凌晨刷新后会以新的强度再次开放”，避免继续误导成当天可反复刷：[godot_region_maps.js](/Users/shihe/Documents/宝可梦养成/src/game/data/godotMaps/godot_region_maps.js:2406)
- `audit:trainer-daily-scope` 已同步升级为守卫新规则：会检查“每日变体开战拦截、试炼落每日锁、试炼当日视觉态、次日刷新提示文案”，避免后续回归：[audit-trainer-daily-map-scope.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-trainer-daily-map-scope.mjs:14)

本轮验证结果：

- `npm run audit:trainer-daily-scope`：通过；当前统计为 `9` 张地图、`231` 个事件、`59` 个训练家事件、`8` 个区域试炼，且无警告。
- `npm run audit:cloud`：通过；`trainerDailyCloudMarkers = 6`，没有新增本地优先或半事务违规。
- `vite build --emptyOutDir false --outDir /private/tmp/pokemon-build-check`：通过，仅保留大 chunk 体积警告。

仍需你最后手测：

- 同一天内打完某个区域试炼后，再次触发必须只提示“今天已完成”，不能再进战斗。
- 次日凌晨刷新后，区域试炼地图效果应恢复成可挑战态，并且阵容/连战强度继续沿用之前的阶段成长。
- 训练家和区域试炼各自的每日锁仍要保持“按地图独立”，不能跨地图串状态。

### 0.70 已完成战斗事件统一转为地图对话态，并补强“次日阵容变化”审计

本轮继续往下收口两件事：一是地图层不再只让已击败 Boss 变成对话态，而是把训练家 / 部下 / 区域试炼一起统一进“已完成后不再起战斗”的交互模型；二是把训练家专项审计升级为真正检查“次日刷新后阵容或等级确实会变化”。

本轮修复：

- `OriginalGame` 新增 `getConfiguredBattleEventVisualState` 和 `getConfiguredBattleEventInfoMessage`，把训练家 / Boss / 试炼的状态判定和完成提示文案集中起来，不再零散散落在地图层和交互层：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7359)
- 地图上的 `info` 交互现在会优先读取这些战斗事件状态文案；同一天已打过的普通训练家、已清理的部下、已完成的首领、当天已完成的区域试炼，都会直接显示对应提示，而不是还尝试进入战斗链路：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:13774)
- `ThreeLowPolyMap` 新增 `shouldRouteBattleEventToInfo`，把 `daily_complete`、`cleared`、`completed` 这三类战斗事件统一在地图层改成 `info` 交互；也就是说，地图层现在就知道“这个点已经不是战斗按钮，而是完成态 NPC / 试炼碑文”： [ThreeLowPolyMap.jsx](/Users/shihe/Documents/宝可梦养成/src/game/ThreeLowPolyMap.jsx:71) [ThreeLowPolyMap.jsx](/Users/shihe/Documents/宝可梦养成/src/game/ThreeLowPolyMap.jsx:2814)
- `audit:trainer-daily-scope` 已追加守卫，开始同时检查“地图上已完成战斗事件会路由到 info”以及“完成态提示文案集中由主游戏生成”： [audit-trainer-daily-map-scope.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-trainer-daily-map-scope.mjs:14)
- `audit:trainers` 不再使用旧的“试炼可继续挑战、不能出现次日刷新文案”规则；现在它会验证新的试炼文案、每日试炼规则，并额外要求至少存在一个固定胜场下的跨日阵容差异，确认 `dailyRefreshKey` 真的影响了每日训练家 / 试炼阵容：[audit-trainer-battle.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-trainer-battle.mjs:95)

本轮验证结果：

- `npm run audit:trainer-daily-scope`：通过。
- `npm run audit:trainers`：通过；当前检查了 `75` 个战斗事件，其中 `35` 个普通每日训练家、`24` 个一次性部下、`8` 个区域试炼，总计抽样 `1032` 组每日变体队伍。
- `npm run audit:cloud`：通过。
- `vite build --emptyOutDir false --outDir /private/tmp/pokemon-build-check`：通过，仅保留大 chunk 体积警告。

仍需你最后手测：

- 普通训练家当天打完后，再次碰撞应直接走提示，不再出现尝试进战斗后再被阻止的感觉。
- 部下打完后应进入稳定的对话态，不再有“还能再触发挑战”的错觉。
- 首领打完后应保持明确的非战斗状态，头顶或脚底效果也要与未完成时明显不同。
- 区域试炼当天完成后应直接显示“今天已完成”；次日刷新后再次交互应恢复正式挑战入口，并且阵容或等级与前一天同胜场抽样相比有变化。

### 0.71 训练师基础阵容、名字风格、家族去重和高地日变体已重做

这轮把“普通训练师 / 部下训练家阵容本身”的几个结构性问题一起收了：基础模板不再只是整张图的滑动窗口，名字不再整区复读，同进化家族塌缩成重复队伍的问题也被一起堵上。

本轮修复：

- 新增共享工具 `pokemonFamilyVariety`，把“按等级纠正到合法形态”和“尽量避免同进化家族重复”合到同一条工具链里；基础训练家队伍和每日变体队伍现在都用这套规则：[pokemonFamilyVariety.js](/Users/shihe/Documents/宝可梦养成/src/utils/pokemonFamilyVariety.js:1)
- `godot_region_maps` 里的基础训练家 / 部下队伍不再按同一 `speciesPool` 机械平移，而是改成每张图一套显式 `REGION_TRAINER_ROSTERS`，每个普通训练家和每个部下都有自己的名称与主题阵容：[godot_region_maps.js](/Users/shihe/Documents/宝可梦养成/src/game/data/godotMaps/godot_region_maps.js:1986)
- 风车农庄的 `speciesPool` 已去掉重复的 `88: 蛋蛋`，改成更符合东侧岩地生态的 `22: 大岩蛇`，减少了基础模板里蛋蛋过密的问题：[godot_region_maps.js](/Users/shihe/Documents/宝可梦养成/src/game/data/godotMaps/godot_region_maps.js:1778)
- 基础队伍生成 `makeTeam` 现在会在修正等级合法形态时同步维护“已用物种 / 已用进化家族”集合，所以像“鬼斯通 / 鬼斯通”“胡地 / 胡地”这类塌缩重复不会再直接漏过去：[godot_region_maps.js](/Users/shihe/Documents/宝可梦养成/src/game/data/godotMaps/godot_region_maps.js:2208)
- 每日训练家变体也改成按进化家族避重选怪；如果能找到不同家族的合法候选，就不会再把整队挤成同一个家族：[trainerBattleScaling.js](/Users/shihe/Documents/宝可梦养成/src/utils/trainerBattleScaling.js:132)
- 星雾高地这类晚期区域的普通训练师日变体，现在加了“不能明显低于基础模板强度”的地板；仍然允许跨日换种类、轻微等级变化，但不会再出现体感上突然软掉一大截的普通训练师：[trainerBattleScaling.js](/Users/shihe/Documents/宝可梦养成/src/utils/trainerBattleScaling.js:264)
- `audit:trainers` 已升级为守卫这些新规则：会检查基础队伍无同家族重复、训练师名字不复读、每日变体无同家族重复、晚期普通训练师日变体不弱于基础模板：[audit-trainer-battle.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-trainer-battle.mjs:1)

关于“部下是否改成每日复战”：

- 这轮没有把部下改成每日刷新或重复挑战。
- 原因不是漏做，而是当前项目已经明确采用“训练家 / 部下 / Boss 打完后转地图对话态、不再重复进战斗”的产品规则；如果这里单独把部下改回每日复战，会直接和现行地图交互设计打架。
- 本轮先把部下的名字、阵容主题和识别度拉开，同时保留一次性门禁职责；如果后面你要做“Boss 通关后的精英复战模式”，建议作为单独玩法开关设计，而不是混进当前主线门禁链路。

本轮验证结果：

- `npm run audit:trainers`：通过；当前 `75` 个战斗事件、`1032` 组每日变体抽样全部通过新守卫。
- `npm run audit:trainer-daily-scope`：通过。
- `npm run audit:cloud`：通过。
- `npm run audit:data`：通过。
- `vite build --emptyOutDir false --outDir /private/tmp/pokemon-build-check`：通过，仅保留大 chunk 体积警告。

仍需你最后手测：

- 月影墓园、六角遗迹这类之前容易出现家族塌缩重复的区域，确认实战预览和实战队伍都不再出现“同一只 / 同一家族连着堆”的难看阵容。
- 高地普通训练师跨日再战时，确认阵容会有变化，但不会明显比基础模板弱。
- 各张图的普通训练师与 3 名部下，确认从名字、出战主题到战斗观感都比之前更有辨识度。

### 0.67 训练家 / 区域试炼每日锁、地图作用域和云端刷新时间已收口

本轮针对“一个地图打完后，别的地图也被判完成”以及“区域试炼当天可无限重复、不走每日锁”的链路做了专项收口。

本轮发现：

- 普通训练家的每日锁已经有 `dailyTrainerBattleIds` 和 `dailyRefreshKey`，但区域试炼没有接入这套每日锁。
- 训练家 / 区域试炼 / Boss 的完成态、试炼解锁阶段、部下击败计数里，仍有多处直接按裸 `eventId` 读取。
- 当前地图数据里事件 ID 实测全局唯一，但这属于“现在没撞上”，不是“机制上彻底安全”；后续地图重做时一旦复用 ID，就有跨地图串锁风险。
- 每日刷新键会进入 `world`，但缺少明确的刷新时间戳字段，不利于后续追踪“这份云存档是哪天凌晨后生效”的状态。

本轮修复：

- 新增地图作用域辅助：训练家、Boss、区域试炼的完成态与每日锁判定，统一改为优先按 `mapName:eventId` 写入，并兼容读取旧存档里的裸 `eventId`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:1407)
- 区域试炼正式接入每日锁：当天打过后会进入 `dailyTrainerBattleIds`，同一天不再重复开战，等次日凌晨刷新后才开放下一次挑战：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:14010) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:12273)
- 区域试炼的强度成长与隐藏生态解锁阶段，改为按“地图作用域的胜场计数”推进，不再只认全局裸 ID：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:1473) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:12289)
- Boss 所需部下击败数、地图进度摘要、野外生态进度判定，也都统一改成按当前地图作用域计算：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7310) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7701)
- `world` 现在会额外保存 `dailyRefreshAppliedAt`，当日刷新发生时会跟随云存档一起写回，便于确认“凌晨刷新后的云端状态”：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6983)
- 区域试炼的每日锁提示文案已改成“今天已完成，明天凌晨刷新后再次开放”，不再误导成“当天还能继续刷”： [godot_region_maps.js](/Users/shihe/Documents/宝可梦养成/src/game/data/godotMaps/godot_region_maps.js:2413)
- `audit:trainer-daily-scope` 已补强，开始同时守卫“地图作用域完成态、区域试炼每日锁、试炼强度计数按地图写入”，并且会直接扫描所有地图事件配置，校验训练家 / 部下 / Boss / 试炼的依赖关系、文案字段和全局 ID 唯一性： [audit-trainer-daily-map-scope.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-trainer-daily-map-scope.mjs:1)

本轮验证结果：

- 扫描当前全部地图事件 ID，结果为 `duplicateCount = 0`；当前数据没有重复 ID，但代码已不再依赖这个前提。
- `npm run audit:trainer-daily-scope`：通过；当前审计统计为 `9` 张地图、`231` 个事件、`35` 名普通训练家、`24` 名部下、`8` 个 Boss、`8` 个区域试炼，且无配置警告。
- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。

仍需你最后手测：

- 同一天内打完某地图普通训练家后，切到别的地图确认不会被错误判定为“今天已挑战”。
- 同一天内打完某地图区域试炼后，再次交互应提示“今天已完成”；次日凌晨后重新进入应可再次挑战。
- 区域试炼次日再次开启时，确认阵容/连战强度会按前一日胜场继续变化。
- Boss 所需部下计数要按当前地图独立计算，不能因为别的地图部下胜利而提前解锁。

### 0.66 自动审计全量复跑，并修复地图运行时生成文件滞后

本轮复核“审查文档是否全部完成”时确认：文档尚未完全收口，仍有浏览器级手工回归和结构治理待执行；但能用脚本验证的部分已经继续推进。

本轮发现：

- `map:audit-runtime` 首次运行失败，报错为“旧 44x36 保留区存在 219 个非出口格被改变”。
- 根因不是源地图规则本身坏了，而是运行时生成文件 `src/game/data/godotMaps/godot_map_v2.generated.js` 落后于 `src/game/data/mapSources/godotMapV2.source.json`。
- 按地图生产管线执行 `npm run map:build` 后，重新生成运行时地图，`map:audit-runtime` 已恢复通过。

本轮验证结果：

- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:cloud`：通过，云端唯一进度守卫无违规。
- `npm run audit:data`：通过，144 只宝可梦、45 个技能、道具、素材、进化链关键检查无异常；42 条历史非等级进化仍作为兼容数据保留并折叠到等级触发。
- `npm run audit:growth`：通过，14400 个升级模拟场景无经验曲线、属性回退、多段进化、进化后漏学技能异常。
- `npm run audit:battle`：通过，同级秒杀、极低伤害、非免疫 0 伤害异常均为 0。
- `npm run audit:stats`、`npm run audit:damage`、`npm run audit:mp`、`npm run audit:exp-overflow`、`npm run audit:economy`：通过。
- `npm run audit:evolutions`：通过，40 条官方等级进化匹配，42 条官方非等级进化明确简化为游戏内等级触发，未缺官方分支。
- `npm run audit:official`：通过；`flail`、`low_kick` 的威力差异属于脚本标记的简化实现，无 strict mismatch。
- `npm run map:validate`、`npm run map:build`、`npm run map:audit-runtime`、`npm run map:audit-regions`、`npm run map:audit-roads`：通过。
- 浏览器级手测补充：`seed-growth-evolution-browser-test.sql` 后登录 `audit_recovery_browser`，进化弹窗出现；刷新后弹窗仍在；点击确认后远端 `playerTeam[0].name = 妙蛙草`，`pendingGrowthEvents = []`，`save_revision = 3`。
- 浏览器级手测补充：`seed-escape-overlay-refund-eligible.sql` 后登录 `audit_escape_browser`，UI 显示“未进入战斗，已返还能量”。本轮发现该 seed 曾误把 Lv.1 野外战的 `activeBattleEnergyCost` 写成 `2`，所以当时远端能量表现为 `4 -> 6`；当前脚本已按实际规则修正为 `1` 并重新复验，远端能量为 `4 -> 5`。
- 浏览器级手测补充：`seed-escape-overlay-refund-ineligible.sql` 后登录同账号，UI 显示“已进入战斗，能量不会返还”，远端能量保持 `4`，`view = map`，`activeBattleEnergyCost = 0`。
- 本轮结束后已执行 `cleanup-escape-overlay-browser-test.sql` / `cleanup-recovery-browser-test.sql`，并通过对应 cleanup check 确认临时账号数量为 `0`。

影响：

- 地图运行时文件重新与源数据对齐，避免后续以过期地图结果做审查。
- 审查状态从“只跑核心脚本”推进到“数据、成长、战斗、云存档守卫、公式、经济、官方对齐、地图生产管线均已复验”。
- 仍不能把整个审查标为完成，因为学技能弹窗、捕捉动画、战斗行动检查点、双标签冲突、老师奖励领取、新手过场真实视觉等界面级手测还没有全部跑完。
- CDP headless 浏览器在返回地图后观察到地图渲染恢复提示；这更可能与当前 headless/WebGL 环境有关，但仍应放入真实浏览器视觉复验，不直接作为本轮 P0。

### 0.65 新手首次进入过场已简化为单画面，并修正抵达地图时机

本轮根据体验反馈继续收敛新手过场：

- 首次进入不再是多个说明步骤，改为一个更直接的出发过场；文字和顶部信息压缩，只保留“伙伴来到身边、进入地图”的主信息。
- `LaunchDepartureOverlay` 已拆成出发与抵达两个阶段：抵达阶段文案会显示“来到你身边”，并叠加在真实地图画面上，而不是停留在旧启动页背景上。
- 过场浮层现在稳定挂在主游戏顶层，底层在 `arriving` 阶段切换为真实地图，减少从启动页到地图之间的闪烁和断层。
- 重置进度后会清理通知，不再让重置成功提示压在首次进入动画过程中。

验证结果：

- 已通过本轮 `npm run build`。
- 仍需用真实账号首次选择伙伴、重置后重新选择伙伴两条路径做最终视觉手测，重点看动画是否丝滑、通知是否还会压住过场、抵达时是否真正叠到地图。

### 0.64 地图事件提交会携带当前玩家位置与遇怪冷却，避免战斗/采集后回图倒退

本轮继续审查：

- 地图移动为了手感仍是本地即时动画，但关键问题在于：走到草丛触发遭遇、踩到道具/恢复点/果树/商人/训练家时，云端提交可能基于上一笔已保存快照构造。
- 如果上一笔防抖保存还没追上，云端会知道“发生了遭遇/采集/训练家战”，却不知道玩家已经走到这个格子。
- 这会带来一种很伤体验的回退：战斗结束或刷新后，玩家位置可能回到触发事件前的旧格子。

本轮修复：

- 新增 `normalizeWorldPosition` / `buildWorldPositionPatch`，统一把玩家位置写入 `playerPos` 和 `world.playerPos`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4697)
- 主游戏不再把地图移动直接透传给 `setPlayerPos`，改为 `handlePlayerMove`：同步更新位置 ref，并在玩家停步后安排一次强制云保存；遇到云端阻断则不会继续推本地旧进度：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6744)
- `handleEncounter` 现在会把触发遭遇的当前格子和遇怪冷却一起写进开战原子提交，避免开战成功但位置仍停在旧快照：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8776)
- 地图道具、恢复点、果树、商人礼物、训练家挑战的云端提交现在都会携带当前格子与冷却状态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8936)
- 3D 地图和旧 Phaser 地图路径都会把 `playerPos` / `encounterCooldownSteps` 传给主游戏，避免未来切回旧渲染路径时丢掉同样保护：[ThreeLowPolyMap.jsx](/Users/shihe/Documents/宝可梦养成/src/game/ThreeLowPolyMap.jsx:1693) [EncounterSystem.js](/Users/shihe/Documents/宝可梦养成/src/game/world/EncounterSystem.js:93)
- `audit:cloud` 新增 `directMapRuntimeSetterReferences` 守卫；如果以后恢复 `onPlayerMove={setPlayerPos}` 或 `onEncounterCooldownChange={setEncounterCooldownSteps}`，审计会失败：[audit-cloud-only-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-cloud-only-guards.mjs:247)

影响：

- 普通走路仍保持本地丝滑，不会每一小步都等待后端。
- 一旦走路触发关键事件，这次事件的云端提交就是包含“事件结果 + 玩家当前位置 + 遇怪冷却”的完整快照。
- 这进一步降低“遭遇前后、采集前后、训练家战后刷新，地图位置回弹”的概率。

验证结果：

- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:cloud`：通过，`directMapRuntimeSetterReferences = 0`。
- `npm run audit:data`：通过，144 只宝可梦、45 个技能、道具与进化数据无新增异常。
- `npm run audit:growth`：通过，14400 个升级模拟场景无异常。
- `npm run audit:battle`：通过，同级秒杀、极低伤害、非免疫 0 伤害异常均为 0。

仍需最终手测：

- 走进草丛刚触发遭遇后刷新，确认回图位置仍在触发遭遇的草丛附近。
- 拾取道具、使用恢复点、采集果实、触发训练家战后刷新，确认事件结果和玩家位置同时保留。
- 连续移动停下后等待一秒刷新，确认普通位置进度会自动保存到云端。

### 0.63 地图内容版本迁移不再本地直接重置，旧云存档会在读档后补保存新版地图

本轮继续审查：

- 地图内容版本升级时，`normalizeCloudGameData` 会把旧地图版本修正成当前 `WORLD_MAP_CONTENT_VERSION`，并把地图名、位置和地图格子归一到新版默认地图。
- 但 `loadGameFromCloud` 之前可能把这份“归一化后的新版地图快照”直接记成已保存，导致云端仍保留旧地图版本；下次登录又要重复迁移。
- 另外旧的 `activeMapContentVersion` effect 会在发现版本不一致时直接本地重置地图/位置/冷却步数，这和“云端确认后才改变关键进度”的原则不一致，也容易造成地图界面突然刷新。

本轮修复：

- 新增 `getSavedMapContentVersion` / `shouldPersistMapContentMigration`，明确识别云端存档是否来自旧地图内容版本：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5142)
- `loadGameFromCloud` 现在如果检测到地图内容版本迁移，会把原始云端快照作为 `lastSavedSnapshotRef`，并触发关键保存请求，让登录后的新版地图归一化结果真正保存回云端：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6228)
- 删除 `activeMapContentVersion` 本地重置 effect，避免再次出现“读档后前端自己改地图，但云端还没确认”的路径。
- `audit:cloud` 新增 `localMapContentResetReferences` 守卫；如果以后恢复 `activeMapContentVersion` / `setActiveMapContentVersion` 这类本地地图版本重置入口，审计会失败：[audit-cloud-only-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-cloud-only-guards.mjs:233)

影响：

- 老云存档升级地图时，不会只在当前页面临时变成新版地图，而是会在云端补写新版地图内容版本。
- 地图升级逻辑从“本地 effect 发现旧版本就直接重置”收敛为“读档归一化 -> 云端补保存”，更符合云端唯一进度。
- 这也降低了玩家看到“地图突然刷新/回到默认位置但刷新网页又变回来”的概率。

验证结果：

- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:cloud`：通过，`localMapContentResetReferences = 0`。

### 0.62 战斗回合内部不再依赖本地微状态强制保存，改为行动完成后云端检查点

本轮继续审查：

- 0.61 已把开战、捕捉、胜负、逃跑、换人、传送等关键阶段切换改成云端确认。
- 但 `active` 战斗回合内部仍残留大量“本地先扣血/扣蓝/写状态，再 `requestCriticalCloudSave()` 追保存”的微状态链路。
- 这会制造一个很细但真实的窗口：技能动画播放中，云端可能落到“只扣了 HP、还没写完状态/日志/回合归属”的半截快照。

本轮修复：

- 新增 `logsRef`，让战斗日志在异步动画中也能被行动检查点读取到最新文本，避免云端检查点回写时丢掉刚显示的战斗播报：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5645)
- 普通 debounce 自动保存、强制保存、定时保存和 `pagehide` 保存现在会在 `view === 'battle' && turn === 'resolving'` 时暂停，避免回合解析中途把半截动画状态写入云端：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6662)
- 新增 `commitBattleRuntimeCheckpoint`：每个行动完成后，把行动方、受击方、HP/MP、异常状态、能力等级、日志和能量退款资格一起提交云端；提交失败则停止后续行动，不再继续进入下一拍战斗：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8279)
- 玩家行动和敌方行动现在都会在回合开始状态结算、无法行动、蓄力、命中、治疗、吸血、异常状态、能力变化之后提交完整检查点，再决定是否进入阵亡、奖励、失败或下一行动：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8350)
- 删除 `requestCriticalCloudSave` helper，并在 `audit:cloud` 里新增守卫；以后主游戏如果恢复这个“本地先改再请求保存”的 helper，脚本会直接失败：[audit-cloud-only-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-cloud-only-guards.mjs:217)

影响：

- 刷新发生在技能动画中途时，云端更倾向保持在“行动前 / resolving 可恢复态”，而不是随机保存半截扣血或半截状态。
- 行动动画播放结束后，后续阵亡判定、奖励结算、敌方行动或回合返还，都建立在一次已确认的云端战斗检查点之后。
- 这不是把每一帧动画都后端化；动画仍可本地即时播放，但“战斗数值进度”从微状态追保存，收敛为行动级检查点。

验证结果：

- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:cloud`：通过，`criticalCloudSaveHelperReferences = 0`。
- `npm run audit:data`：通过，144 只宝可梦、45 个技能、道具与进化数据无新增异常。
- `npm run audit:growth`：通过，14400 个升级模拟场景无异常。
- `npm run audit:battle`：通过，同级秒杀、极低伤害、非免疫 0 伤害异常均为 0。

仍需最终手测：

- 玩家技能命中后、敌方 HP 条刚下降时立刻刷新，确认读档后不会出现日志/HP/回合严重错位。
- 附加异常状态、畏缩、混乱、能力等级变化刚出现时刷新，确认状态图标和后续行动一致。
- 蓄力技能第一回合蓄力完成后刷新，确认 `chargingMove` 和 MP 已在行动检查点里保留。
- 断网或后端拒绝行动检查点时，确认战斗不会继续进入下一行动，而是停在需要重新同步的阻断态。

### 0.61 成长、战斗阶段、捕捉结算、传送切图继续收紧为云端确认后生效

本轮继续审查：

- 0.57-0.60 已经把奖励、背包、队伍和资源原子提交主链路收紧，但仍有一些阶段切换保留本地 fallback。
- 风险最大的残留点是：成长弹窗确认、野外/训练家开战、胜利/逃跑/战败收尾、捕捉结果、换人、地图传送。
- 这些分支如果在云端不可用时先改本地，会重新出现“画面已经成功，刷新后云端没这笔进度”的体验。

本轮修复：

- 成长事件确认现在必须走云快照提交；云端未就绪时，学技能、遗忘技能、放弃学习、进化、无效成长事件清理都会拒绝本地落进度：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7368)
- 野外遭遇和训练家挑战不再保留“先单独扣能量，再普通保存战斗快照”的半事务降级；开战必须由 `save_cloud_game_state_with_resources` 一次确认：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8532) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8691)
- 捕捉成功/失败、胜利返回地图、逃跑结算、战败结算、入场阶段、换人阶段、传送点切图都改为云端提交失败即阻断，不再本地放行：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9096) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9192) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9223) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9782) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9869) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:10321) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:10571)
- 删除学生端未使用的单独 `adjust_gold` / `adjust_energy` 包装入口，避免资源变动绕过原子资源存档 RPC。
- [audit-cloud-only-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-cloud-only-guards.mjs:204) 新增守卫：主游戏里如果恢复 `updateGoldBalance`、`updateEnergyBalance`、`adjust_gold`、`adjust_energy`，`npm run audit:cloud` 会失败。

验证结果：

- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:cloud`：通过，`directStudentResourceMutationReferences = 0`。
- `npm run audit:data`：通过，144 只宝可梦、45 个技能、道具与进化数据无新增异常。
- `npm run audit:growth`：通过，14400 个升级模拟场景无异常。
- `npm run audit:battle`：通过，同级秒杀、极低伤害、非免疫 0 伤害异常均为 0。

当前结论：

- 学生成长、战斗进入/退出、捕捉、换人和传送点切图这些关键进度点现在已经和资源结算保持同一原则：云端没有确认，就不改变关键进度。
- 0.62 已继续把战斗动画过程中的本地微状态保存请求收掉，改为行动级云端检查点；这条残留风险已从“待处理”转为“待最终手测”。

### 0.60 背包使用道具不再保留本地 fallback

本轮继续审查：

- 精灵球、恢复药、经验药水都已经有云端快照提交路径，但云端未就绪时仍保留本地 fallback。
- 旧分支会先扣本地库存、改变战斗回合、触发捕捉动画或成长事件，再等待后续保存；如果刷新发生在保存前，就会出现“道具用掉/经验涨了/捕捉开始了，但云端没有”的分叉。

本轮修复：

- [handleUseItem](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8991) 使用精灵球时，云端未就绪会直接拒绝，不再本地扣球并启动捕捉动画。
- [handleUsePotion](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9346) 使用恢复药时，云端未就绪会直接拒绝，不再本地回血/回蓝/扣药。
- [handleUseExpPotion](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9443) 使用经验药水时，云端未就绪会直接拒绝，不再本地加经验、升级或写入成长事件。
- 三类道具仍保留原有云端提交成功后的动画/反馈；只是失败时不再制造本地假成功。

验证结果：

- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:cloud`：通过。
- `npm run audit:growth`：通过，14400 个升级模拟场景无异常。
- `npm run audit:battle`：通过，同级秒杀、极低伤害、非免疫 0 伤害异常均为 0。

当前结论：

- 背包消耗品现在与商店购买、战斗奖励、队伍仓库操作保持同一原则：云端未确认，就不改变关键进度。

### 0.59 队伍/仓库变更与捕捉安置不再保留本地 roster fallback

本轮继续审查：

- 队伍/仓库操作已经优先走 `commitCloudSnapshot`，但 `commitRosterMutation` 仍保留了“云端未就绪时直接本地改队伍/仓库”的 fallback。
- 捕捉成功后，如果云端不可用，也仍可能先把宝可梦塞进本地队伍/仓库或待安置弹窗。
- 这些分支会影响放生、存入仓库、取回、整理顺序、捕捉安置，属于学生进度的关键数据。

本轮修复：

- [commitRosterMutation](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8975) 现在要求必须有已加载的云端进度；否则直接提示“队伍操作未保存”，不再本地应用队伍/仓库变更。
- 删除本地 `applyRosterMutation` 辅助，避免绕过云快照提交。
- [handleCaptureSequenceComplete](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9134) 在捕捉成功但云端未就绪时，不再把捕获宝可梦写入本地队伍/仓库；会恢复到可操作战斗状态并提示重新同步。
- 待安置宝可梦的“放回野外”与队伍排序也改成云端未就绪即拒绝，不再先改本地。

验证结果：

- `npm run audit:cloud`：通过，确认旧本地先改辅助仍为 0。
- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。

当前结论：

- 队伍成员、仓库、首发顺序、捕捉结果这些核心进度现在都必须由云端快照确认。
- 这轮继续减少“界面看起来已经改了队伍，但刷新后又回去”的回退体感。

### 0.58 战斗奖励不再保留本地经验/金币 fallback，旧本地先改辅助已删除

本轮继续审查：

- 0.57 关闭了原子资源 RPC 缺失时的半事务降级，但代码里还残留了几个旧辅助：
  - `addInventoryItem`：先改本地背包，再等云端保存。
  - `addRewardMonster`：先改本地队伍/仓库，再等云端保存。
  - `gainExpAndLevelUp`：先改本地经验/等级/成长事件，再等云端保存。
- 战斗胜利奖励在极端“云端未就绪”分支下，仍可能通过 `gainExpAndLevelUp` 先发本地经验，再单独发金币。

本轮修复：

- 删除上述三个本地先改辅助。
- [grantBattleRewards](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7099) 现在只走 `commitCloudSnapshotWithResources`：
  - 经验、升级事件、成长事件、金币奖励一起提交。
  - 云端未加载、未登录或提交失败时，奖励不结算，并明确提示重新同步。
  - 不再保留“先本地加经验，再单独发金币”的旧路径。
- [handlePurchase](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8648) 在云端未就绪时直接拒绝购买，不再允许回到本地 `addInventoryItem`。
- [audit-cloud-only-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-cloud-only-guards.mjs:187) 新增守卫：如果重新出现 `addInventoryItem`、`addRewardMonster`、`gainExpAndLevelUp`，`npm run audit:cloud` 会失败。

验证结果：

- `npm run audit:cloud`：通过，`localFirstProgressHelperReferences = 0`。
- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:battle`：通过，同级秒杀、极低伤害、非免疫 0 伤害异常均为 0。
- `npm run audit:growth`：通过，14400 个升级模拟场景无经验曲线、属性回退、多段进化、进化后漏学技能异常。

当前结论：

- 战斗胜利奖励现在和商店/开战/逃跑/战败一样，必须经过云端关键链路。
- 这轮进一步减少了“玩家看见奖励已经到账，但刷新后云端没有”的回退体感。

### 0.57 原子资源 RPC 缺失时不再降级为半事务 fallback

本轮继续审查：

- `save_cloud_game_state_with_resources` 已经远端验证可用，但前端仍保留“该 RPC 缺失时返回 `atomicUnavailable: true`，调用方再拆成资源变动 + 普通云存档”的兼容路径。
- 这条路径在早期迁移未部署时有意义，但现在会重新打开老问题：金币/能量已经变化，游戏快照却未必成功保存。

本轮修复：

- [commitCloudSnapshotWithResources](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6181) 遇到 `save_cloud_game_state_with_resources` 缺失时，现在返回普通失败并提示“请先同步 Supabase 数据库”，不会再返回 `atomicUnavailable: true`。
- 删除 `missingAtomicResourceSaveRpcRef`，不再记忆“原子 RPC 不可用”并进入降级模式。
- [audit-cloud-only-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-cloud-only-guards.mjs:173) 新增守卫：如果源码里重新出现 `atomicUnavailable: true` 或 `missingAtomicResourceSaveRpcRef`，`npm run audit:cloud` 会失败。

验证结果：

- `npm run audit:cloud`：通过，`atomicResourceFallbackReferences = 0`。
- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:growth`：通过，14400 个升级模拟场景无经验曲线、属性回退、多段进化、进化后漏学技能异常。
- `npm run audit:battle`：通过，同级秒杀、极低伤害、非免疫 0 伤害异常均为 0。

当前结论：

- 商店购买、开战扣能量、战斗奖励、逃跑退能量、战败扣金币这些资源关键链路，不能再静默降级成半事务。
- 如果后端 RPC 异常缺失，前端会暴露真实配置问题并阻断继续操作，而不是继续让玩家带着不一致进度游玩。

### 0.56 新账号初始伙伴选择已改为“云端提交成功后开局”

本轮继续审查：

- 新账号第一次选择初始宝可梦是整个游戏的第一个关键进度写入点。
- 旧实现会先在前端创建队伍、背包、地图位置并退出初始界面，然后再靠 `requestCriticalCloudSave()` 推送保存。
- 如果保存失败或用户在保存前刷新，就可能出现“界面上已经开局，但云端仍是未选择伙伴”的分叉。

本轮修复：

- [LaunchScreen](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:1532) 现在会在点击“出发”后进入同步中状态，按钮和伙伴选择会临时禁用。
- [handleStartGame](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:10950) 已改为异步 `commitCloudSnapshot`：
  - 成功提交后才把 `showLaunchScreen` 置为 `false` 并进入地图。
  - 初始队伍、背包、地图、位置、日志、战斗清理状态都在同一个云快照里落库。
  - 失败时停留在初始选择界面并提示错误，不再先改本地状态。

验证结果：

- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:cloud`：通过，确认没有新增本地进度缓存、旧 RPC 或敏感字段回流。

当前结论：

- 新账号第一次开局已经与“云端唯一进度”规则对齐。
- 这也能减少用户之前遇到的“新手刚登录无法切换/状态不稳定”一类问题的根源：初始状态不会再靠自动保存延迟补齐。

### 0.55 地图采集类事件已从“本地先改 + 请求保存”改成“云端快照先提交”

本轮继续审查：

- 战斗、商店、老师奖励等主链路已经基本改为云端优先，但地图采集类事件还保留旧模式。
- 旧代码在拾取地图道具、使用恢复点、采集果实、领取神秘商人礼物时，会先调用 `addInventoryItem` / `setPlayerTeam` / `setMapGrid` 改本地状态，再用 `requestCriticalCloudSave()` 请求保存。
- 这个模式的风险是：玩家界面已经看到“获得道具/恢复成功/事件格子已清除”，但如果后端同步失败或刷新发生在保存前，云端仍然是旧状态。

本轮修复：

- [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8759) 的 `handleCollect` 中，以下事件现在都会先调用 `commitCloudSnapshot`：
  - `item`：地图随机道具写入 `playerInventory`，同时清理地图事件格。
  - `heal`：恢复全队 HP/MP，同时清理事件格。
  - `berry`：全队回血，同时清理事件格。
  - `merchant`：神秘商人礼物写入 `playerInventory`，同时清理事件格。
- 如果云端进度未加载或提交失败，前端只提示失败，不再先改本地背包、队伍或地图格。
- 成功后由 `applyCommittedCloudState` 统一回填后端返回的快照，避免 UI 状态和云端快照分叉。

验证结果：

- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:cloud`：通过，确认没有新增本地进度缓存或旧老师奖励 RPC。
- `npm run audit:data`：通过，静态数据、素材、技能、道具、地图入口仍为 0 个关键异常。

当前结论：

- 地图道具/回血点/果实/商人礼物不再依赖“下一次自动保存碰运气”。
- 这些操作仍不是后端资源字段原子 RPC，因为它们只改游戏快照，不直接改 `users.gold/energy`；使用普通云快照提交即可满足一致性。

### 0.54 前端老师奖励领取不再回退旧 `claim_teacher_rewards`

本轮继续审查：

- 0.48 已经确认远端 `begin_teacher_reward_claim` / `confirm_teacher_reward_claim` 两段式老师奖励 RPC 可用。
- 但前端仍保留了一个兼容分支：如果 `begin_teacher_reward_claim` 返回 `PGRST202`，会回退调用旧 `claim_teacher_rewards`，再用本地 `legacyTeacherRewardRecovery` 补偿云存档。
- 这个分支在后端未部署新函数时能避免功能完全中断，但现在已经变成风险点：它会把“后端函数缺失”静默变成旧领取流程，重新打开“奖励已标记领取，但云存档补记失败”的旧窗口。

本轮修复：

- [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6704) 中的 `beginTeacherRewardClaim` 已移除前端主动调用旧 `claim_teacher_rewards` 的路径。
- 如果新 RPC 缺失，现在会明确提示“后端老师奖励握手函数尚未部署”，并做 `60` 秒节流，避免之前日志里那种 404 重复刷屏。
- 旧 `legacyTeacherRewardRecovery` 的读取/补记函数暂时保留，只用于处理历史上已经进入本地补偿缓存的残留批次；新的老师奖励领取不会再创建新的 legacy 批次。
- [audit-cloud-only-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-cloud-only-guards.mjs:158) 已新增守卫：`src` 中如果重新出现 `claim_teacher_rewards` 调用，`npm run audit:cloud` 会失败。

验证结果：

- `rg "claim_teacher_rewards" src/components/Game/OriginalGame.jsx`：确认主游戏前端已无旧 RPC 调用。
- `npm run audit:cloud`：通过，且 `legacyTeacherRewardRpcReferences = 0`。
- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。

当前结论：

- 老师奖励领取现在强制走“开始领取批次 -> 写入云存档 -> 确认批次”的新链路。
- 后续如果 Supabase schema cache 或远端迁移异常导致新 RPC 404，前端会暴露真实问题，不会再偷偷绕回旧链路。

### 0.53 云端唯一进度回归守卫脚本已补齐

本轮继续审查：

- 之前已经手工确认过“学生游戏不支持本地进度、每次登录从后端取进度、关键操作同步后端”，但这些约束如果只靠人工 `rg`，后续很容易在 UI 迭代时被无意破坏。
- 当前最高风险的回归点主要集中在：
  - 新增 `localStorage` / `sessionStorage` 保存完整游戏状态。
  - 前端重新出现 `select('*')`，把 `plain_password` 或多余用户字段带入会话。
  - 已删除的 `useAuth` / `useGameSave` 旧 Hook 被恢复或重新引用。
  - 主游戏链路丢失 `load_cloud_game_save`、`save_cloud_game_save`、`save_cloud_game_state_with_resources`、`begin_teacher_reward_claim`、`confirm_teacher_reward_claim` 这些关键云端 RPC。

本轮修复：

- 新增 [audit-cloud-only-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-cloud-only-guards.mjs:1)，自动扫描 `src` 下源码并输出结构化 JSON 报告。
- 新增 `npm run audit:cloud` 入口：[package.json](/Users/shihe/Documents/宝可梦养成/package.json:20)
- 脚本当前允许的本地缓存只有两类：
  - [authService.js](/Users/shihe/Documents/宝可梦养成/src/utils/authService.js:1) 的登录会话白名单字段缓存。
  - [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4857) 的旧老师奖励 fallback 补偿缓存。
- `plain_password` 的前端出现范围被限制在登录 fallback 与教师端查看学生密码；其它前端文件如果新增该字段会直接失败。

验证结果：

- `npm run audit:cloud`：通过。扫描 `45` 个源码文件，确认 `localStorage` 仅有 `7` 处白名单用途，`sessionStorage = 0`，`select('*') = 0`，`plain_password` 仅有 `5` 处允许用途，前端旧 `claim_teacher_rewards` 调用为 `0`。
- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。

当前结论：

- “云端唯一进度”现在不只是口头规则，而是进入了本地自动审计脚本。
- 后续每次改登录、教师发奖、背包、商店、战斗结算或云同步时，都应该至少跑一次 `npm run audit:cloud`，避免旧本地进度路径或敏感字段回流。
- 仍未改变前面结论：浏览器环境策略仍阻止当前 Codex 内置浏览器访问本地前端，因此刷新恢复、动画中断恢复、双标签冲突这些界面级手测仍保留在最终手工回归清单。

### 0.52 成长弹窗与捕捉动画的浏览器手测种子已补齐，远端临时数据已清理

本轮继续执行：

- 再次尝试用 Codex 内置浏览器打开本地前端 `http://127.0.0.1:3002` 执行逃跑退能量 UI 手测，但浏览器安全策略仍明确拒绝访问该地址，并提示不能用其它浏览器手段绕过。因此本轮没有继续做 UI 自动化绕路。
- 已先执行逃跑 eligible 种子脚本；浏览器访问被拒后，立即执行 [cleanup-escape-overlay-browser-test.sql](/Users/shihe/Documents/宝可梦养成/scripts/cleanup-escape-overlay-browser-test.sql:1)，并用 [check-escape-overlay-browser-test-cleanup.sql](/Users/shihe/Documents/宝可梦养成/scripts/check-escape-overlay-browser-test-cleanup.sql:1) 确认远端 `audit_escape_browser_count = 0`。
- 为最终手工回归继续补齐四个稳定复现场景：
  - [seed-growth-learn-move-browser-test.sql](/Users/shihe/Documents/宝可梦养成/scripts/seed-growth-learn-move-browser-test.sql:1)：登录 `audit_recovery_browser / audit123456` 后直接停在“皮卡丘想学十万伏特，技能已满，需要选择忘记技能”的弹窗。
  - [seed-growth-evolution-browser-test.sql](/Users/shihe/Documents/宝可梦养成/scripts/seed-growth-evolution-browser-test.sql:1)：登录后直接停在“妙蛙种子 -> 妙蛙草”的进化确认弹窗。
  - [seed-capture-sequence-success-browser-test.sql](/Users/shihe/Documents/宝可梦养成/scripts/seed-capture-sequence-success-browser-test.sql:1)：登录后直接播放捕捉成功动画，预期结束后回地图并把独角虫加入队伍。
  - [seed-capture-sequence-failure-browser-test.sql](/Users/shihe/Documents/宝可梦养成/scripts/seed-capture-sequence-failure-browser-test.sql:1)：登录后直接播放捕捉失败动画，预期结束后仍在战斗中并交给敌方回合。
- 新增 [cleanup-recovery-browser-test.sql](/Users/shihe/Documents/宝可梦养成/scripts/cleanup-recovery-browser-test.sql:1) 与 [check-recovery-browser-test-cleanup.sql](/Users/shihe/Documents/宝可梦养成/scripts/check-recovery-browser-test-cleanup.sql:1)，用于统一清理/确认 `audit_recovery_browser` 临时账号。

验证结果：

- 四个新增 seed 脚本已分别在远端 Supabase 执行通过。
- `cleanup-recovery-browser-test.sql` 已执行通过。
- `check-recovery-browser-test-cleanup.sql` 返回 `audit_recovery_browser_count = 0`，确认没有留下临时学生数据。

当前结论：

- 当前环境仍不能自动打开本地前端做浏览器 UI 回归，但最终手测入口已经从“随机复现”改成了“一键种云端状态 -> 登录固定测试账号 -> 直接观察目标弹窗/动画”。
- 这会显著降低后续验收成本，尤其是升级弹窗、进化弹窗、捕捉中刷新这几类平时很难卡准时机的场景。

### 0.51 审计脚本的 Vite WebSocket `EPERM` 噪音已清理

本轮继续审查：

- `audit:data`、`audit:growth`、`audit:battle` 之前虽然退出码都是 0，但每次都会打印 `WebSocket server error: listen EPERM 0.0.0.0:24678`。
- 根因是 `scripts/load-vite-module.mjs` 用 Vite middleware mode 只做 `ssrLoadModule`，但 Vite 仍会初始化 WebSocket 通道。审计脚本不需要 HMR，也不需要任何浏览器 WebSocket。

本轮修复：

- 在 [load-vite-module.mjs](/Users/shihe/Documents/宝可梦养成/scripts/load-vite-module.mjs:15) 的 Vite server 配置中增加 `ws: false`，保留 `middlewareMode: true` 和 `hmr: false`。

验证结果：

- `npm run audit:data`：通过，且不再出现 WebSocket `EPERM` 噪音。
- `npm run audit:growth`：通过，且不再出现 WebSocket `EPERM` 噪音。
- `npm run audit:battle`：通过，且不再出现 WebSocket `EPERM` 噪音。

当前结论：

- 这不是玩法修复，但会让之后每轮审计输出更干净；真正的失败信息不会再被一大段无害 WebSocket 堆栈淹没。

### 0.50 旧认证 Hook 与旧独立存档 Hook 已清理，减少误接回旧链路的风险

本轮继续审查：

- `src/hooks/useAuth.js` 原本保留了一套旧 Supabase Auth 邮箱登录/注册流程，会直接 `select('*')` 读取用户 profile；当前应用入口已经完全改用 `authService` 的用户表密码登录，这个 Hook 没有任何引用。
- `src/hooks/useGameSave.js` 原本保留了一套旧独立云存档 Hook，会绕过 `OriginalGame.jsx` 里现在使用的资源原子提交、冲突阻断、关键状态恢复等主链路；当前也没有任何引用。
- 这两个文件虽然不在运行时执行，但长期存在会制造维护歧义：后续改登录或存档时，很容易误以为它们仍是主链路，甚至把旧路径重新接回来。

本轮修复：

- 删除 `src/hooks/useAuth.js`。
- 删除 `src/hooks/useGameSave.js`。
- 删除后重新执行 `rg "useAuth|useGameSave|src/hooks/useAuth|src/hooks/useGameSave" src docs scripts`，源码和脚本内已没有引用残留；审计文档中的历史记录除外。

当前结论：

- 当前登录入口进一步收敛为唯一链路：`App.jsx -> authService -> users/login_with_table_password`。
- 当前学生游戏存档入口进一步收敛为唯一链路：`OriginalGame.jsx -> load_cloud_game_save/save_cloud_game_save/save_cloud_game_state_with_resources`。
- 这轮不改变玩家可见功能，但降低后续维护误接旧代码的风险。

验证结果：

- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。
- `npm run audit:data`：通过。当前仍为 144 只宝可梦、45 个技能、3 种精灵球、3 种恢复药、3 种经验药水；图片、技能运行时契约、地图入口等关键静态检查为 0 异常。
- `npm run audit:growth`：通过。14400 个升级模拟场景中，经验曲线异常、属性回退、多段进化风险、进化后漏学技能风险均为 0。
- `npm run audit:battle`：通过。同级一回合秒杀、极低伤害、非免疫 0 伤害异常均为 0。
- 后续 0.51 已清理三个审计脚本的 Vite WebSocket `EPERM` 噪音。

### 0.49 云端唯一进度与登录会话缓存已继续核实，`plain_password` 不再落本地会话

本轮继续审查：

- 重新扫了前端所有 `localStorage` / `sessionStorage` / `plain_password` / 云存档入口。当前没有发现“完整游戏进度存到本地再离线游玩”的活跃链路。
- 学生游戏入口仍是云端强制读取：`loadGameFromCloud` 会同时调用 `load_cloud_game_save` 和 `users` 资源字段；离线、未登录、后端读取失败都会进入 `CloudGateScreen`，不会进入本地游戏：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5914)
- 手动保存、自动保存、关键操作提交都会经过 `save_cloud_game_save` 或 `save_cloud_game_state_with_resources`；未登录、离线、云端冲突都会拒绝继续盲写：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6019) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6196)
- 当前仍存在两个本地缓存点，但性质不同：
  - `pokemon_game_profile`：只用于登录会话恢复，不是游戏进度。修复前这里可能保存完整 profile，从而把 `login_with_table_password` 返回的 `plain_password` 也落到浏览器本地。
  - `pokemon-game:legacy-teacher-reward-recovery:*`：只用于旧老师奖励 fallback 的灾难恢复，保存的是待补记的奖励片段，不是完整存档；在两段式奖励握手稳定后可以作为后续清理项继续观察：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4857)

本轮修复：

- `authService` 新增会话字段白名单 `SESSION_PROFILE_COLUMNS`，只允许 id、用户名、昵称、角色、老师关系、金币/能量摘要、注册审核状态等必要字段进入浏览器本地会话：[authService.js](/Users/shihe/Documents/宝可梦养成/src/utils/authService.js:5)
- `saveProfileSession` 现在会先走 `sanitizeProfileSession`，不会再把 `plain_password` 或其它用户表敏感/冗余字段写入 `localStorage`：[authService.js](/Users/shihe/Documents/宝可梦养成/src/utils/authService.js:41)
- `getProfileSession` 会在读取旧缓存时自动脱敏并重写；也就是说，已有浏览器里曾经保存过的旧会话，在下次打开时会被清成白名单字段：[authService.js](/Users/shihe/Documents/宝可梦养成/src/utils/authService.js:62)
- `App` 启动恢复登录态时，不再直接相信本地 profile；现在会先调用 `refreshStoredProfile` 到后端重新读取用户表最新 profile，确认账号仍存在且审核状态允许后才进入游戏或教师台：[App.jsx](/Users/shihe/Documents/宝可梦养成/src/App.jsx:31) [authService.js](/Users/shihe/Documents/宝可梦养成/src/utils/authService.js:90)
- 登录成功后重新拉取最新 profile 时，查询字段已从 `select('*')` 改为白名单字段；只有 RPC 缺失时的兼容 fallback 会临时查询 `plain_password` 用于用户表密码验证，但最终仍会脱敏后再保存：[authService.js](/Users/shihe/Documents/宝可梦养成/src/utils/authService.js:203)

当前结论：

- “不支持本地游戏、每次登录从后端读取进度、关键操作同步后端”的主链路仍成立。
- 本轮补掉的是安全与一致性层面的缓存问题：本地允许保留登录态，但页面刷新时会先回后端刷新用户 profile，且不再允许把用户表密码随 profile 留在浏览器里。
- `src/hooks/useAuth.js` 与 `src/hooks/useGameSave.js` 在这一轮后续清理中已删除，避免后续误接旧认证/旧存档路径。

验证结果：

- `rg "localStorage|sessionStorage|plain_password|useGameSave|useAuth"`：已复核。
- `npm run build`：通过，仅保留 Vite 大 chunk 体积警告。

### 0.48 云存档 revision、原子资源提交、老师奖励握手已做远端综合验证

本轮继续执行：

- 新增远端综合验证脚本 [verify-cloud-save-atomic-and-reward-rpcs.sql](/Users/shihe/Documents/宝可梦养成/scripts/verify-cloud-save-atomic-and-reward-rpcs.sql:1)，覆盖三条关键后端链路：
  - `save_cloud_game_save`：同 revision 同 payload 视为幂等成功；同 revision 不同 payload 必须拒绝，且不能覆盖原存档。
  - `save_cloud_game_state_with_resources`：金币不足时必须整笔拒绝，不能改资源也不能写新存档；正常原子提交时资源和存档同事务更新；同 revision 同 payload 重试不能重复扣金币/能量。
  - `begin_teacher_reward_claim` / `confirm_teacher_reward_claim`：开始领取会把同批待领奖励绑定到同一个 `claim_token`；错误 token 不会确认奖励；正确 token 会确认整批奖励；确认后再次 begin 应没有剩余奖励。
- 第一次执行脚本时发现 PostgreSQL 不支持 `min(uuid)`，已改成 `array_agg(claim_token)[1]`，随后远端执行通过。
- 远端执行结果：`cloud save atomic/reward RPC guard ok: gold=7, energy=3, reward_claimed=2`。
- 追加查询远端 `users where username in ('audit_rpc_teacher', 'audit_rpc_student')`，结果 `audit_rpc_user_count = 0`，确认验证脚本没有留下临时老师/学生数据。

当前结论：

- “旧标签页同 revision 覆盖新进度”的后端防线已远端验证。
- “金币/能量资源变动与云存档分叉”的后端原子提交防线已远端验证。
- “老师奖励已标记领取但前端云存档未成功”的两段式奖励防线已远端验证。
- 这一轮把 P0 风险从“数据库函数是否真实生效”进一步收缩到“浏览器 UI 与刷新恢复是否按预期表现”。

验证结果：

- `supabase db query -f scripts/verify-cloud-save-atomic-and-reward-rpcs.sql`：通过。
- 清理确认：`audit_rpc_user_count = 0`。

仍需最终手测：

- 双标签页同时游玩，确认旧标签页不能覆盖新进度，冲突后只能重新读取云端。
- 商店购买、开战扣能量、战斗胜利奖励在浏览器端分别验证一次，确认 UI 反馈、后端资源、云端存档三者一致。
- 老师奖励领取后立刻刷新，确认奖励不会丢，也不会重复领取。

### 0.47 逃跑过场浏览器手测准备脚本已落地，临时远端数据已清理

本轮继续执行：

- 为真实浏览器手测新增了三份远端准备/清理脚本：
  - [seed-escape-overlay-refund-eligible.sql](/Users/shihe/Documents/宝可梦养成/scripts/seed-escape-overlay-refund-eligible.sql:1)：创建临时学生 `audit_escape_browser`，并把云存档直接置于“野外逃跑成功过场 + `battleEnergyRefundEligible=true`”状态。预期前端过场自动结算后，能量从 4 退到 5。
  - [seed-escape-overlay-refund-ineligible.sql](/Users/shihe/Documents/宝可梦养成/scripts/seed-escape-overlay-refund-ineligible.sql:1)：把同一个临时学生置于“野外逃跑成功过场 + `battleEnergyRefundEligible=false`”状态。预期前端过场自动结算后，能量保持 4。
  - [cleanup-escape-overlay-browser-test.sql](/Users/shihe/Documents/宝可梦养成/scripts/cleanup-escape-overlay-browser-test.sql:1)：删除该临时学生、临时云存档、金币/能量日志与奖励残留。
- 已先执行 eligible 种子脚本，远端临时账号与云存档写入成功。
- 随后尝试用浏览器打开 `http://127.0.0.1:3002` 做自动化 UI 手测，但当前浏览器环境策略拒绝访问该本地地址，因此没有继续绕路执行浏览器动作。
- 中断后已立即执行 cleanup 脚本，并追加查询确认远端 `audit_escape_browser_count = 0`，没有留下临时学生数据。
- 已追加执行 ineligible 种子脚本做语法验证，随后再次执行 cleanup，并再次确认 `audit_escape_browser_count = 0`。

当前结论：

- 后端 RPC 反例验证已经完成；浏览器层“逃跑过场自动结算 -> 云端资源刷新 -> 回地图”的 UI 手测尚未完成。
- 这轮留下的三份 SQL 脚本可以让后续手测非常稳定，不需要靠随机遇怪和随机逃跑概率来复现。只要先执行对应 seed 脚本，再用 `audit_escape_browser / audit123456` 登录，就会直接进入对应逃跑过场。

验证结果：

- `seed-escape-overlay-refund-eligible.sql`：远端执行通过。
- `seed-escape-overlay-refund-ineligible.sql`：远端执行通过。
- `cleanup-escape-overlay-browser-test.sql`：远端执行通过。
- 清理确认：`audit_escape_browser_count = 0`。

仍需最终手测：

- 在允许访问本地前端的浏览器里，执行 eligible seed 后登录 `audit_escape_browser`，确认过场文案为“未进入战斗，已返还能量”，回地图后远端能量为 6。
- 执行 ineligible seed 后登录同账号，确认过场文案为“已进入战斗，能量不会返还”，回地图后远端能量仍为 4。
- 每次手测结束后执行 cleanup 脚本，避免临时数据留在正式 Supabase 项目里。

### 0.46 逃跑退能量后端反例已做远端可回滚验证，前端资格失效点完成二次核对

本轮继续审查：

- 新增远端验证脚本 [verify-escape-refund-rpc-guard.sql](/Users/shihe/Documents/宝可梦养成/scripts/verify-escape-refund-rpc-guard.sql:1)，专门验证 `save_cloud_game_state_with_resources` 的逃跑退能量资格防线。脚本会创建临时学生与临时存档，分别测试 `battleEnergyRefundEligible=false` 与 `true` 两种远端旧存档，然后在成功后删除临时行；如果中途失败，整条 `DO` 语句会回滚。
- 已通过 Supabase pooler + HTTPS DNS 对远端执行该脚本。历史验证当时使用的测试存档 `activeBattleEnergyCost=2`，所以 `battleEnergyRefundEligible=true` 时能量从 4 变为 6；当前脚本已按 Lv.1 野外战实际消耗修正为 `activeBattleEnergyCost=1`，后续验证预期应为 4 变为 5。
- 追加查询远端 `users where username like 'audit_%'`，结果 `audit_user_count = 0`，确认验证脚本没有留下临时学生数据。
- 前端二次核对了主要战斗行为的资格失效点：
  - 玩家使用技能前，会先把云端快照提交为 `turn: 'resolving'` 且 `battleEnergyRefundEligible: false`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8385)
  - 扔精灵球会在进入捕捉回合时写入 `battleEnergyRefundEligible: false`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9101)
  - 战斗中使用药剂并把回合交给敌方时，会写入 `battleEnergyRefundEligible: false`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9588)
  - 主动换人会清掉资格；强制换人保留资格，因为强制换人发生在我方阵亡后，实际已经不属于“刚遇到直接逃跑”的正常退款路径，但保留该字段不会绕过后端，因为退款还要求远端处于 `battlePhase='escape'`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:10734)
  - 逃跑失败会写入 `battleEnergyRefundEligible: false`，下一次再逃成功不应退款：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9519)

结论：

- 后端安全边界已经从“已部署”推进到“已远端反例验证”。这条链路现在可以抵挡前端状态异常、旧标签页或手工 RPC 请求造成的越权能量退款。
- 前端主要战斗行为的资格失效点没有发现明显遗漏。剩余风险主要是界面随机逃跑与动画时序的真实手测，需要在浏览器里走完整流程确认提示文案、资源数值和云端刷新后三者一致。

验证结果：

- `supabase db query -f scripts/verify-escape-refund-rpc-guard.sql`：通过。
- 远端清理确认：`audit_user_count = 0`。

仍需最终手测：

- 野外刚遭遇直接逃跑成功，确认 overlay 显示“未进入战斗，已返还能量”，能量数值回补，刷新后仍一致。
- 野外使用技能、扔球、战斗用药、主动换人、逃跑失败后再逃跑成功，分别确认 overlay 显示“不返还能量”，后端资源也不回补。

### 0.45 逃跑退能量后端资格校验与文档口径已继续收口

本轮继续审查发现：

- 前端已经把逃跑退能量规则改成 `battleEnergyRefundEligible` 驱动，但后端 `save_cloud_game_state_with_resources` 仍只检查“远端存档处在野外逃跑阶段、本场能量数额足够、 incoming 快照回到地图”。这能挡住大部分错误请求，但没有独立验证“这场战斗是否从未攻击、用药、扔球、换人或逃跑失败”。如果旧标签页、异常前端或手工 RPC 请求带着正向能量退款进来，数据库本身还缺最后一层语义防线：[202605190003_allow_escape_energy_refund.sql](/Users/shihe/Documents/宝可梦养成/supabase/migrations/202605190003_allow_escape_energy_refund.sql:102)
- 当前冒险地图实际入口是 `GameCanvas` 判断 `renderMode === 'three-lowpoly'` 后渲染 `ThreeLowPolyMap`，而 Phaser 相关文件仍保留为非 three-lowpoly 地图的旧兼容路径：[GameCanvas.jsx](/Users/shihe/Documents/宝可梦养成/src/game/GameCanvas.jsx:39) [GameCanvas.jsx](/Users/shihe/Documents/宝可梦养成/src/game/GameCanvas.jsx:117)
- 当前地图注册表只保留 `GodotMap` 一张冒险地图，且它明确配置为 `three-lowpoly`：[overworldMaps.js](/Users/shihe/Documents/宝可梦养成/src/game/data/overworldMaps.js:8) [overworldMaps.js](/Users/shihe/Documents/宝可梦养成/src/game/data/overworldMaps.js:11)
- 本轮检查时还发现 README 和失败系统文档残留旧口径，例如“逃跑成功时会退回本场已扣能量”。这会直接误导后续验收，把“打过再逃也退能量”误判成正确行为。

本轮修复：

- 新增迁移 `202605200001_require_escape_energy_refund_eligibility.sql`，重新定义 `save_cloud_game_state_with_resources`：只有远端旧存档处于野外逃跑阶段、`battleEnergyRefundEligible=true`、退款数额不超过本场 `activeBattleEnergyCost`，且 incoming 快照回到地图并清掉退款资格时，才允许学生侧正向能量变化：[202605200001_require_escape_energy_refund_eligibility.sql](/Users/shihe/Documents/宝可梦养成/supabase/migrations/202605200001_require_escape_energy_refund_eligibility.sql:102)
- 同步更新总装脚本 `supabase-setup.sql`，保证新项目初始化和迁移后的函数语义一致，不再出现“增量迁移更严、setup 脚本更宽”的分叉：[supabase-setup.sql](/Users/shihe/Documents/宝可梦养成/supabase-setup.sql:681)
- README 已更新项目状态、3002 端口说明、当前冒险地图渲染说明，以及最新逃跑能量规则：[README.md](/Users/shihe/Documents/宝可梦养成/README.md:10) [README.md](/Users/shihe/Documents/宝可梦养成/README.md:32) [README.md](/Users/shihe/Documents/宝可梦养成/README.md:87)
- `DEFEAT_SYSTEM_UPGRADE_PLAN.md` 已同步为“刚遇到就撤退才退能量，攻击/用药/扔球/换人/逃跑失败后不退”，并把实现依据改成 `battleEnergyRefundEligible + activeBattleEnergyCostRef`：[DEFEAT_SYSTEM_UPGRADE_PLAN.md](/Users/shihe/Documents/宝可梦养成/docs/DEFEAT_SYSTEM_UPGRADE_PLAN.md:76) [DEFEAT_SYSTEM_UPGRADE_PLAN.md](/Users/shihe/Documents/宝可梦养成/docs/DEFEAT_SYSTEM_UPGRADE_PLAN.md:98)

影响：

- 逃跑退能量现在不再只靠前端自律。数据库也能拒绝“已经进入战斗行为后还试图正向退能量”的请求，和课堂能量管控目标更一致。
- 文档与运行口径收敛后，后续手测可以直接按“未行动直接逃跑才退款”验收，不会再被旧文案带偏。
- 地图层目前是 Three.js 主路径 + Phaser 旧兼容路径并存。这个本轮未删除，因为 `GameCanvas` 仍保留非 three-lowpoly 分支；后续如果确认不会再回到 Phaser，应单独做一次清理，避免双地图引擎长期增加维护面。

验证结果：

- `npm run build`：通过；仍只有 chunk size warning。
- `supabase db push`：已通过 pooler + HTTPS DNS 成功推送 `202605200001_require_escape_energy_refund_eligibility.sql` 到远端，真实 Supabase 后端已经具备这层 `battleEnergyRefundEligible` 校验。
- `supabase migration list`：远端迁移历史已显示 `202605200001`，本地与远端版本号对齐。

仍需最终手测：

- 野外刚遭遇直接逃跑成功，确认能量可退，云端刷新后仍正确。
- 野外攻击、用药、扔球、主动换人或逃跑失败后再逃跑成功，确认后端不会退能量。
- 故意构造 `battleEnergyRefundEligible=false` 但 `p_energy_delta>0` 的资源提交，确认 RPC 返回“能量只能由老师恢复或增加”。

### 0.44 战败 0 金币卡死与逃跑能量返还规则已按最新产品口径收口

本轮修复：

- 战败结算原本固定按 `getDefeatGoldPenalty(...)` 展示并尝试扣金币；当学生金币为 0 时，后端会返回“金币不足”，前端又停留在失败页，导致“重整旗鼓”按钮实际无法让玩家继续。本轮新增 `getPayableDefeatGoldPenalty(...)`，把实际可扣金币限制为 `min(战败惩罚, 当前金币)`；0 金币时不再尝试扣 10，也不会错误显示“损失 10 金币”：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4951)
- `handleDefeatContinue` 现在在后端明确返回“金币不足”时，会降级为“只保存战败撤退、队伍恢复、回地图”的结果，而不是停在失败页反复弹“金币不足”。普通 RPC 错误、云端冲突、同步繁忙仍然按错误处理，不会伪装成金币不足：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:10285)
- 失败页按钮新增本地忙碌态，点击“重整旗鼓”后会显示“同步中”，避免连续点击触发多次战败结算：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2644)
- 逃跑退能量规则按最新产品口径改为“只有遭遇后没有进入任何战斗行为，直接成功逃跑才返还能量”。野外战斗开始时会写入 `battleEnergyRefundEligible: true`；一旦玩家使用技能、扔精灵球、使用战斗药剂、自主换人、逃跑失败进入敌方回合，这个资格就会写成 `false`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5582) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8640) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9410)
- `battleEnergyRefundEligible` 已进入云存档快照、读档规范化、退出战斗清理和逃跑结算逻辑。这样刷新页面或自动同步后，系统仍能知道这场战斗是否还允许退能量，不再只依赖前端临时状态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5190) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5344) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9646)
- 逃跑成功的过场文案也同步改成两种状态：未进入战斗时显示“未进入战斗，已返还能量”，进入过战斗后显示“已进入战斗，能量不会返还”，避免玩家误以为任何逃跑都会退能量：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2707)
- 战斗开场素材链路顺手完成本地化：PokeAPI/sprites 仓库没有 trainer/player/human 人物素材，当前只从 PokeAPI 下载并本地化了精灵球道具素材，训练师抛球图使用项目内本地高清 SVG。运行时不再依赖外部网络加载开场精灵球/人物图：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:65)

影响：

- 0 金币学生战败后不会再被锁死在“挑战失败”界面。这是一个 P0 级可玩性断点，因为它会让低资源新号无法继续游戏。
- 逃跑能量规则从“逃跑成功就退”变成了更符合课堂管控的规则：只有刚遭遇、不参与战斗、选择撤退才视为误触或保守退出；一旦发生攻击、扔球、用药、换人或逃跑失败，能量就算本场实际消耗。
- 退能量资格进入云存档后，可以继续和“云端优先提交”体系保持一致。不会出现本地标记已失效、刷新后又因为旧快照读回而错误退款的情况。
- PokeAPI 素材链路的结论也更清楚了：该仓库可作为宝可梦和道具素材源，但不能作为训练师人物素材源。后续如果要替换成更接近官方战斗人物的非像素素材，需要另选明确包含 trainer 的资源源或使用本地自制/授权素材。

验证结果：

- `npm run build`：通过；仍只有 chunk size warning。
- `npm run audit:data`：通过。当前统计：144 只宝可梦、45 个技能、3 种精灵球、3 种恢复药、3 种经验药水；图片缺失、占位图、无 0 消耗技能覆盖、技能运行时契约问题均为 0。历史非等级进化声明仍有 42 条，按当前产品规则继续作为兼容数据保留。
- `npm run audit:growth`：通过。14400 个等级模拟场景中，经验曲线异常、属性回退、多段进化风险、进化后漏学技能风险均为 0。
- `npm run audit:battle`：通过。抽样等级下没有同级一回合秒杀、极低伤害或 0 伤害非免疫异常。
- 三个审计脚本仍会打印 Vite WebSocket `listen EPERM 0.0.0.0:24678` 噪音，但 JSON 审计结果正常产出。

仍需最终手测：

- 新号或 0 金币账号战败后点击“重整旗鼓”，确认能稳定回到地图，队伍恢复，且不会反复弹“金币不足”。
- 野外刚遭遇、不攻击、不用道具、不换人，直接成功逃跑，确认能量退回；刷新后能量仍保持退回后的值。
- 野外遭遇后先使用一次技能，再成功逃跑，确认能量不退回；刷新后不会被旧快照错误退款。
- 扔精灵球失败后再逃跑、战斗中使用药剂后再逃跑、自主换人后再逃跑、逃跑失败后第二次逃跑成功，分别确认能量都不退回。
- 逃跑成功 overlay 文案需要按资格正确切换，避免学生误读规则。

### 0.43 资源补偿与能量退款链路继续校正，前端不再把同步失败误判成“余额不足”，后端原子 RPC 已补正向能量退款支持

本轮修复：

- 我先把前端 `updateGoldBalance` / `updateEnergyBalance` 从单纯布尔返回改成了结构化结果，明确区分 `rpc_error`、`insufficient_gold`、`insufficient_energy`、`forbidden_positive_energy`、普通业务错误等不同失败原因。之前调用方只拿到一个 `false`，很容易把“后端挂了 / 冲突了”误当成“金币不足 / 能量不足”，然后走错 fallback：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6959)
- 基于这层返回语义，`handleDefeatContinue` 在原子 RPC 缺失 fallback 下，只有当 `adjust_gold` 明确返回 `金币不足` 时，才会继续走“失败后不扣金但允许回图恢复”的产品规则；如果是数据库错误、RPC 错误、别的业务错误，现在会直接进入 `requiresCloudReload` 阻断，而不会再误显示成“金币不足，未能扣除”然后继续玩：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:10140)
- 商店购买、野外开战、训练家开战、逃跑补偿这些旧 fallback 也都跟着接上了结构化结果。这样当补偿本身失败时，界面不会再直接沿用“金币已退回 / 能量已退回”的旧文案，而是会明确提示“补偿失败，请重新读取云端进度”，减少假补偿成功的错觉：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8655) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8759) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8976) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9521)
- 这轮还挖到一个更底层的后端断点：`save_cloud_game_state_with_resources` 之前把所有 `p_energy_delta > 0` 都拒绝成“能量只能由老师恢复或增加”。这会直接让“逃跑成功退回本场能量”这条原子结算天然失败，即使前端链路写对了也没用。现在我已经在新的迁移里改成“只允许已进入野外逃跑阶段的本场战斗退回已扣能量，最多补到 `max_energy`；其他学生正向能量变化仍然拒绝，负向能量扣减仍保留原校验”：[202605190003_allow_escape_energy_refund.sql](/Users/shihe/Documents/宝可梦养成/supabase/migrations/202605190003_allow_escape_energy_refund.sql:1)
- 为了让仓库里的总装脚本和迁移事实保持一致，我也同步更新了 [supabase-setup.sql](/Users/shihe/Documents/宝可梦养成/supabase-setup.sql:589) 的 `save_cloud_game_state_with_resources` 定义。后续如果你用整包 SQL 检查或备份，不会出现“迁移和 setup 文件说的不一样”的分叉。

影响：

- 这轮最关键的止血点，是去掉了“任何资源同步失败都可能被伪装成余额不足”的错误分支。之前这种误判特别危险，因为它会把真正该阻断重读的错误，偷偷降级成看似合理的玩法结果，玩家一刷新就会强烈感受到进度倒退。
- 逃跑成功退能量这条链路现在终于前后端语义对齐了：前端允许退、后端原子 RPC 只在远端存档已经处于逃跑阶段时允许退，而且会被 `max_energy` 正确截断。之前那种“代码里写着能退，后端实际上永远拒绝”是很典型的隐性一致性问题。
- 商店、开战、逃跑、战败这些涉及资源补偿的路径，现在在失败时更诚实了。不会轻易制造“文案说已退回，但实际上补偿没成功”的错位，用户体感会稳很多。

验证结果：

- `npm run build`：通过；仍只有 chunk size warning
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过
- 审计脚本仍会打印 Vite WebSocket `listen EPERM 0.0.0.0:24678` 噪音，但 JSON 报告正常产出

部署备注：

- 这一轮包含新的 Supabase 迁移：[202605190003_allow_escape_energy_refund.sql](/Users/shihe/Documents/宝可梦养成/supabase/migrations/202605190003_allow_escape_energy_refund.sql)
- 远端迁移列表现已确认 `202605190003` 已应用；后续语义又由 `202605200001` 继续收紧为必须校验 `battleEnergyRefundEligible`。

仍需最终手测：

- 逃跑成功且当前能量未满时，确认能量会随原子结算一起退回；当前能量接近上限时，确认退款会被 `max_energy` 截断，不会超上限。
- 断网或制造普通 RPC 失败后触发战败 fallback，确认只有明确“金币不足”时才显示“不扣金也可回图”，其余失败都进入重读阻断，不会再伪装成余额不足。
- 商店购买后故意制造云快照保存失败，再让金币补偿也失败，确认界面提示的是“金币补偿失败，请重新读取云端进度”，而不是继续显示“金币已退回”。
- 野外/训练家开战扣能量后故意制造开场保存失败，确认若补偿失败会进入重读阻断，不会停在“战斗没开始但能量状态不确定”的半成功状态。

### 0.42 逃跑与战败收尾进一步去掉“假成功”窗口，原子资源提交失败时不再误降级成半事务 fallback

本轮修复：

- 先收掉了一个很隐蔽但风险很高的资源同步口：`handleEscapeContinue` 和 `handleDefeatContinue` 之前在调用 `commitCloudSnapshotWithResources(...)` 失败后，会不分失败类型继续走“先单独退/扣资源，再单独写游戏快照”的 fallback。这样即使失败原因其实是云端版本冲突、普通后端报错、同步繁忙，也可能被错误拆成半事务。本轮先改成只有在 `atomicUnavailable === true` 时才允许降级；后续 0.57 已进一步关闭 `atomicUnavailable: true`，原子资源 RPC 缺失时直接阻断，不再拆单。
- `handleEscapeContinue` 现在在“本场需退回能量为 0”的边界值下，云端模式也会先提交一次正式退出战斗快照，不再直接走本地 `setView('map')` 收尾。之前这种 0 退款场景会让“战斗已退出”只先停留在本地，刷新后更容易像回退到了逃跑前一拍：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9343)
- `handleDefeatContinue` 同样补齐了“扣金币为 0 时也先落云再退出”的语义。虽然当前平衡表下常规战败惩罚都大于 0，但这条边界处理现在完整了，后续哪怕改数值或加活动规则，也不会默默退回到本地先收尾的旧行为：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9941)
- `handleRun` 的成功/失败逃跑日志现在改成了更诚实的时序：云端模式下不再先本地 `addLog('你尝试逃跑...')`、`addLog('成功逃跑了!')` 然后再等 `commitCloudSnapshot`；而是把“尝试逃跑 + 成功/失败结果”直接一起写进目标快照，提交成功后再由 `applyCommittedCloudState` 展示。这样不会再出现“界面已经显示成功逃跑，但刷新一下发现后端其实还没认”的假成功体感：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9433)
- 顺手也统一了逃跑退出快照构造：`handleEscapeContinue` 现在抽成一个固定的 `buildEscapeExitSnapshot`，确保清理战斗实体、清零 `activeBattleEnergyCost`、退出地图、清理捕捉与换人残留时都沿同一套语义走，不再在成功路径、fallback 路径和 0 退款路径里各写一遍略有差异的战斗退出状态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9347)

影响：

- 这轮最核心的价值是把“原子提交失败时误拆成半事务”这个口封上了。之前这类错误最麻烦，因为它不是每次都炸，而是会偶发地把资源与游戏状态拆成两拍落库，刚好就是用户最容易感知成“怎么又退回前一秒了”的那种问题。
- 逃跑这条链路现在也更接近“后端先确认结果，前端再表现结果”。这会直接减少一种非常伤信任感的错位：屏幕已经说你跑掉了，结果刷新回来还在战斗里，或者能量返还显示过但后台没真记住。
- 战败收尾补齐 0 惩罚边界后，退出战斗的云端语义更完整了。哪怕未来平衡表、活动规则或特殊地图临时把惩罚调成 0，也不会重新踩回本地先退出、后端晚一拍的旧坑。

验证结果：

- `npm run build`：通过；仍只有 chunk size warning
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过
- 审计脚本仍会打印 Vite WebSocket `listen EPERM 0.0.0.0:24678` 噪音，但 JSON 报告正常产出

仍需最终手测：

- 逃跑成功后，在 escape overlay 播放期间断网或制造云端冲突，确认不会假装已经成功回到地图；应进入明确阻断或重读，而不是本地偷偷先退出。
- 逃跑成功且本场需退还能量为 0 的特殊场景下刷新，确认战斗退出结果依然能从云端稳定读回，不会掉回战斗画面。
- 逃跑失败时在提示出现后立刻刷新，确认会稳定回到敌方回合，而不是因为本地先写日志又被旧快照覆盖成玩家回合。
- 战败收尾时分别测试普通扣金币、0 金币边界规则、以及人为制造原子 RPC 不可用场景，确认只有“RPC 缺失”时才会降级到旧 fallback，其余失败都会阻断并要求同步，不会再把资源和游戏状态拆开保存。

### 0.41 战斗局部状态变更已更积极触发关键云保存，缩短 HP / MP / 异常状态只停留在本地的时间窗

本轮修复：

- 我没有把每一段战斗动画都改成同步 RPC，而是先对 battle engine 做了一层更稳的收口：凡是会直接改动战斗实体状态的本地路径，现在都会同步打上 `requestCriticalCloudSave()`，让后续强制云保存更快启动，不再主要依赖 650ms 防抖窗口慢慢追上：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7884)
- `executeBattleMove` 里以下几类关键战斗状态突变都已补进这层保护：开始蓄力、释放蓄力后清理 `chargingMove`、`mimic` 或 miss 后写入 `lastMoveKey`、命中后的 HP 扣减、回复/吸血后的 HP 回升、附加异常状态、畏缩/混乱等 volatile 状态、能力等级变化、以及回合末 `lastMoveKey` 的最终写回：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7890) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8046) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8119)
- `runEnemyAction` 与 `runPlayerAction` 里两边回合开始状态修正和 MP 扣除也都补上了关键保存请求；这意味着“回合开始被麻痹/睡眠/混乱影响后属性已变化”“技能刚扣蓝但完整一轮还没结算完”这类阶段，云端追赶会更及时：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8229) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8293)
- 这轮的取舍是故意偏保守的：没有贸然把整个 `executeBattleMove` 改成逐段原子提交，以免每个动画切片都阻塞在网络往返上，先用“局部状态一发生就强制请求尽快落云”的方式，压缩刷新读回旧 HP / MP / 状态的窗口，同时尽量不破坏当前战斗节奏。

影响：

- 这会直接降低一种很常见也很烦的体感问题：玩家眼里伤害已经打出来、蓝已经扣了、状态图标也上了，结果一刷新又像回到前半拍。现在这些局部状态变更会更快进入强制保存通道，不再主要等待普通 autosave 节奏。
- 这轮虽然不是“完整原子化战斗引擎”，但它已经把战斗中最关键的临时状态推进到“更难在刷新时丢”的层级，尤其适合先止血。
- 后续如果还要继续深挖 battle engine，最自然的下一步就是按回合或按动作做真正的事务化快照，而不是继续放任多个局部状态散落在本地。

验证结果：

- `npm run build`：通过；仍只有 chunk size warning
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过
- 审计脚本仍会打印 Vite WebSocket `listen EPERM 0.0.0.0:24678` 噪音，但 JSON 报告正常产出

仍需最终手测：

- 玩家技能命中后、敌方 HP 条刚下降时立刻刷新，确认读回来的 HP 不会明显回弹到受击前。
- 回复类技能、吸血类技能生效的瞬间刷新，确认我方回血结果不会丢，且不会出现日志说回了血但实际读回没回的错位。
- 附加异常状态、畏缩、混乱、能力等级变化出现提示时分别刷新，确认状态图标、能力变化和后续可行动性与刷新前一致。
- 蓄力技能第一回合蓄力完成后刷新、第二回合释放前刷新、释放后刚扣蓝时刷新，确认 `chargingMove` 与 MP 不会丢拍。

### 0.40 我方阵亡后的强制换人入口已接入云端恢复，刷新时不再容易停在 0 HP 首发身上

本轮修复：

- `handlePlayerDefeatCheck` 里原本“我方宝可梦倒下，但队伍里还有替补”这条分支主要只是本地 `setView('team')` 打开换人页；如果这时立刻刷新，云端不一定知道玩家已经进入强制换人态。本轮已改成云端模式下先提交 `view: 'team' + turn: 'player' + pendingBattleSwitch: null`，再进入替补选择流程，不再只靠本地页面状态撑着：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7790)
- 新增专门的阵亡恢复 effect：如果页面读回后发现“仍在战斗 active 阶段、当前首发 HP 已为 0、敌方还在场、后备里还有可上场宝可梦”，系统现在会自动把状态纠偏回强制换人入口，并把提示日志一起落回快照，避免玩家刷新后还停在一只已经倒下的宝可梦身上继续看战斗画面：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:10078)
- 这条恢复 effect 在云端与本地 fallback 两侧都做了幂等保护：加了 `playerDefeatRecoveryInFlightRef`，避免慢网络或重复渲染时对同一场“阵亡后待换人”连续重复恢复，减少提示刷屏和状态来回抖动：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5340)
- 同时顺手把这个恢复链和上一轮 `pendingBattleSwitch` 清理语义对齐了：若当前其实已经进入“我方阵亡待选替补”，就会明确清掉残留的换人中间态，避免“上一轮自主换人未完成”和“这一轮阵亡后强制换人”两种语义互相污染：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:10102)

影响：

- 这轮补的是一个很容易伤体验的战斗断点。玩家主观上会非常在意“我的宝可梦明明已经倒下了，为什么刷新后还站在场上”，因为这会直接让人怀疑后端存档是不是乱了。
- 现在“阵亡但还有后备”不再只是前端临时 UI 事实，而是云端可恢复的战斗状态。这样刷新、断网恢复、双标签页晚到回写时，系统更容易把玩家拉回“请选择替补继续战斗”的正确入口。
- 这也进一步补齐了战斗里几类关键中断点：胜负过场、逃跑、捕捉、主动换人、强制换人，现在都已经有明确的云端语义，而不只是依赖本地动画或本地页面跳转。

验证结果：

- `npm run build`：通过；仍只有 chunk size warning
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过
- 审计脚本仍会打印 Vite WebSocket `listen EPERM 0.0.0.0:24678` 噪音，但 JSON 报告正常产出

仍需最终手测：

- 我方首发被击倒、队伍页刚弹出时立即刷新，确认会稳定回到强制换人页，而不是读回战斗画面里一只 0 HP 的宝可梦。
- 我方首发被击倒后，停在强制换人页不选替补、直接刷新，确认仍会保留“必须选替补才能继续”的阻断，不会允许直接返回战斗。
- 双标签页下，一边让首发阵亡并进入换人页，另一边保留旧战斗页后刷新，确认旧页会被拉回正确的强制换人入口。
- 如果首发阵亡后后备也在别处被改成不可上场，确认恢复逻辑不会无限重试，而是稳定转入正确的失败或重读分支。

### 0.39 `resolving` 回合与换人进行中状态已真正落入云存档，刷新后不再默认退回普通玩家回合

本轮修复：

- 先修了一个底层口子：之前虽然多处战斗流程已经开始在云端模式下先提交 `turn: 'resolving'`，但 `createCloudSnapshot` / `normalizeBattleTurnForSnapshot` 实际会把 `resolving` 压回普通玩家回合，导致“已提交 resolving”在落库后并不完整成立。本轮已把 `resolving` 纳入战斗回合规范化与快照序列化，让这类中间态终于能被真实保存与读回：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4540) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5042)
- 云存档结构新增 `pendingBattleSwitch`，专门记录“上一只是谁 / 目标换上谁 / 是否强制换人 / 何时创建”这组换人上下文；退出战斗、切回地图、或换人正式完成时都会一起清理，不再只靠本地动画状态猜测：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4567) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4731)
- `handleSwitch` 在云端模式下开始换人时，现在会把 `turn: 'resolving' + pendingBattleSwitch + 回收日志` 一起提交；换人完成提交时则同步清掉 `pendingBattleSwitch`，把最终首发、参战列表与回合归属一次性落库。这样自主换人和阵亡后强制换人都不再只是“存一个模糊 resolving，然后等本地动画自己收尾”：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:10261)
- `resolving` 超时恢复也已按新语义分流：如果只是普通结算卡住，仍按原逻辑恢复到玩家可操作态；如果云快照里还带着 `pendingBattleSwitch`，恢复逻辑现在会优先补完这次换人，清掉待切换上下文，并把回合正确交回 `player` 或 `enemy`，而不是一律粗暴退回玩家回合，让自主换人意外“白赚一个回合”：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9997)
- 为了让刷新读回后的画面也更诚实，本轮还新增了换人恢复演出 effect：若页面从云端读回“战斗仍在 active，且存在未完成的 `pendingBattleSwitch`”，会按 recall -> send 的顺序重播一次换人动画，但不会和当前页面主动触发的实时换人演出重复叠加：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9837)

影响：

- 这轮不是只补某个按钮，而是把之前已经做过的多条“云端优先战斗提交”真正落到了存档层语义上。换句话说，`resolving` 以前更像“写了但没真存住”，现在才算真正成为云存档可恢复的一等状态。
- 对玩家体感最直接的改善，是刷新打断自主换人时更不容易出现两种违和感：一种是看起来换到一半却直接掉回老首发，另一种是明明这回合已经用于换人，刷新后却像没消耗行动一样又轮到玩家白打一拍。
- 这也把“战斗阶段”和“战斗回合中间态”终于补齐成一整套。前面已经加固了 intro / sendout / victory / defeat / escape，这轮则把 active 阶段里最难缠的中间过渡也收进来了。

验证结果：

- `npm run build`：通过；当前只剩 chunk size warning，没有新增构建错误
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过
- 审计脚本仍会打印 Vite WebSocket `listen EPERM 0.0.0.0:24678` 噪音，但 JSON 报告正常产出，当前仍视为运行环境噪音

仍需最终手测：

- 自主换人时分别在 `回来吧...` 日志刚出现、recall 动画中、send 动画中、`上吧...` 刚显示时刷新，确认会读回同一只目标宝可梦，不会掉回旧首发，也不会把本应交给敌方的回合错误还给玩家。
- 阵亡后强制换人时同样在 recall / send 过场中刷新，确认会继续完成换人，但换上后仍保持强制换人的规则，不会错误切成敌方回合。
- 如果把目标换上宝可梦在另一标签页或冲突场景中提前变成不可上场，确认恢复逻辑会清掉 `pendingBattleSwitch` 并提示重新选择，而不是卡死在永久 `resolving`。
- 双标签页同时停在战斗中，一边换人、一边保留旧页面，确认旧页面刷新或恢复后只会接受最新 `pendingBattleSwitch`，不会把已经完成的新首发再覆盖回旧状态。

### 0.38 战斗阶段切换的关键过场已继续改成云端优先，刷新时更不容易停在“半场战斗”

本轮修复：

- `finishEnemyDefeat` 在敌方宝可梦倒下后，若对面还有下一只宝可梦，云端模式下现在会先提交“切换 `activeEnemyId` / 重置本轮参战列表 / 回到玩家回合 / 记录对手派出下一只的日志”，再继续战斗；不再只是本地先换敌方出场，再等 autosave 追上：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7446)
- 同一个 `finishEnemyDefeat` 在“最后一只敌方倒下、进入胜利过场”时，也已经改成先提交 `battlePhase: 'victory'` 和 `rewardSummary`。训练家战额外的“胜利后全队恢复”现在同样跟着这笔阶段提交一起落库，不再是本地先恢复、先弹胜利层：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7486)
- `handleRecoverFromDefeat` 现在在云端模式下会先提交 `battlePhase: 'defeat'` 再进入失败过场，减少“战败文本已经显示，但刷新后还停在 active 回合”的错位：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7539)
- `handleRun` 的成功逃跑与失败逃跑都补成了云端优先：成功时会先提交 `battlePhase: 'escape'`，失败时会先提交 `turn: 'enemy'`，不再只是本地先切到逃跑过场或敌方回合：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9038)
- 野外战斗的 `intro -> sendout` 与 `sendout -> active` 两个 overlay 收尾也已经接入新的云端提交 handler：`handleBattleIntroComplete` 和 `handleBattleSendOutComplete`。这意味着遇敌入场整段过场现在都更接近“后端先认阶段，本地再播完演出”： [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9651) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9697)

影响：

- 战斗中最容易让人感知“怎么刷新后像跳回上一拍”的几个阶段边界，已经从结果态、道具态继续扩展到阶段态本身。
- 尤其是“敌方倒下后出下一只”“进入胜利层”“进入失败层”“逃跑成功/失败”“野外战斗入场过场”，这些都属于视觉演出和状态切换交织最紧的地方；这轮收口之后，刷新恢复更不容易卡在半战斗、半过场的尴尬中间态。
- 训练家战胜利后全队恢复现在也跟胜利阶段提交绑在一起，减少了“血蓝已经恢复但胜利阶段没认”或反过来的不一致。

验证结果：

- `npm run build`：当前被仓库内独立缺口阻塞，`[src/App.jsx](/Users/shihe/Documents/宝可梦养成/src/App.jsx)` 引用了缺失的 `[src/components/Auth/Register.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Auth/Register.jsx)`；这不是本轮战斗链路改动引入的问题，但会阻止全量 build
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过
- 审计脚本仍会打印 Vite WebSocket `listen EPERM 0.0.0.0:24678` 噪音，但结果报告正常产出，当前仍不影响结论

仍需最终手测：

- 敌方最后一只倒下、奖励文本刚出现时刷新，确认会稳定读回胜利过场或已结算后的正确阶段，不会回到敌方已死亡但仍在 active 的半战斗状态。
- 训练家战中击倒第一只、第二只等“中途换下一只”场景，在“对手派出了 XXX”日志刚出现时刷新，确认会读回正确的 `activeEnemyId`，不会跳回上一只已倒下的空场。
- 战败提示刚出现时刷新，确认一定会回到 `defeat` 结算链路，而不是留在 active 且队伍已无可战斗宝可梦的异常态。
- 逃跑成功/失败文本出现时分别刷新，确认会稳定回到 `escape` 过场或敌方回合，不会出现动画已经播了但后端还停在玩家回合的错位。
- 野外战斗刚遇敌、intro 结束、sendout 结束这三个时间点分别刷新，确认会依次读回 `intro / sendout / active` 的真实阶段，不会直接跳段或退回地图。

补充备注：

- 本轮继续把 `handleRun` 从链式 `.then(...)` 改成了显式 `async/await`，并把“捕捉动画缺失恢复”“capture 回合恢复”“resolving 超时恢复”这三条自动恢复链路在云端模式下也补成了优先提交快照，再回到玩家可操作态；这样即使不是玩家主动点按钮，系统自恢复本身也更不容易只停留在本地状态。
- 敌方自动回合 effect 里，当前也补了两类云端优先恢复：一是敌方或我方当前战斗对象在 effect 触发时已经失效，会先把 `turn` 安全拉回玩家；二是敌方因为 MP 不足无法行动时，会先提交“日志 + 交还玩家回合”的快照，不再只是本地 `setTurn('player')`。[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9890)
- `handleTurn` 内部的回合交接也继续统一了：进入 `resolving`、敌方无招可用后交还回合、完整一轮结束后交还回合、异常恢复交还回合，这几条在云端模式下现在都会优先提交 `turn` 快照，而不是只在本地改 `turn` 然后等 `requestCriticalCloudSave()` 追上。[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8114)

### 0.37 精灵球起手、普通药水、经验药水、胜利继续已补成云端优先，进一步缩小“操作刚做完却又读回旧一拍”的窗口

本轮修复：

- `handleUseItem` 现在在云端模式下不会再先本地扣掉精灵球、切到 `turn: 'capture'`、点亮捕捉动画，再等后续 autosave 补记；而是会先基于最新云快照提交“扣除精灵球 / 写入 `captureSequenceData` / 进入投球进行中状态 / 记录投球日志”，只有后端接受后才真正开始捕捉动画：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8481)
- 这意味着玩家在精灵球刚扔出、动画刚开始的瞬间刷新，云端已经知道“球已消耗、当前正处于捕捉过程”，不会再出现本地看着已经投了球、刷新后又像没投过的错位感：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8535)
- `handleUsePotion` 现在在云端模式下也改成先提交再显示结果：后端先确认“目标宝可梦恢复 HP/MP、药水扣除、若在战斗中则让回合交给敌方、日志写入”，前端不再先把血条和背包改掉再等防抖保存追上：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8881)
- `handleUseExpPotion` 已接入同样的提交顺序：云端模式下先基于最新快照重新模拟经验增长、等级变化、待处理学招/进化事件和经验药水扣除，成功后才播放经验药水动画与升级庆祝；这样刷新或双标签页冲突时，不会出现“动画已经播完但成长没真正落后端”的半完成态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8986)
- `handleVictoryContinue` 不再是胜利界面点“继续探索”后，本地先退出战斗、回地图、清临时战斗态，再靠关键保存补记；当前在云端模式下会先提交一笔 `buildExitedBattleSnapshot(...)`，确认战斗确实结束并回到地图后才视为成功收尾：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8730)

影响：

- 这轮把“投球起手”“药水使用”“经验药水成长”“胜利结算收尾”四条高频交互链路都拉进了和成长事件、捕捉结算、换人结果同一套云端优先模型里，前后端节奏终于更统一了。
- 对玩家体感最直接的改善是：背包里已经扣了、动画已经播了、界面已经退回地图了，这些动作现在更接近“后端先认，本地再显示”，所以刷新后突然回到前一秒的概率会继续下降。
- 普通药水在战斗内交回敌方回合、经验药水附带成长事件、胜利后退出战斗这几种带连锁状态变化的场景，现在也不再主要依赖 autosave 追赶，链路一致性明显更强。

验证结果：

- `npm run build`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过
- 审计脚本仍会打印 Vite WebSocket `listen EPERM 0.0.0.0:24678` 噪音，但 JSON 报告正常产出，当前仍视为脚本运行环境噪音，不影响本轮结论

仍需最终手测：

- 精灵球刚扔出、捕捉动画刚开始时立刻刷新，确认会稳定读回“球已消耗且捕捉过程已开始”，不会回退成投球前背包数量。
- 战斗中对受伤宝可梦使用普通药水后立刻刷新，确认血量、技能值、药水数量与敌方回合归属一致，不会出现药水扣了但血没回，或血回了却还是玩家回合的错位。
- 战斗外对经验药水造成跨多级升级、学招、进化后，在动画播放中和弹窗出现前分别刷新，确认经验药水不会回滚，成长事件不会丢失也不会重复排队。
- 胜利界面点击“继续探索”后立刻刷新，确认会直接回到地图正确状态，不会短暂读回胜利弹层或残留敌方/战斗临时态。

### 0.36 捕捉完成与战斗换人结果态已改成云端优先，减少“本地已跳帧、后端还没认”的窗口

本轮修复：

- `handleCaptureSequenceComplete` 在云端模式下不再是“动画结束后本地先把宝可梦加进队伍/待安置，再退出战斗并请求关键保存”；现在会先基于最新云快照计算捕捉结果，把“加入队伍 / 进入待安置 / 退出战斗 / 清空敌方 / 回到地图 / nextPlayerMonsterId 增长 / 捕捉日志”一次性提交，只有后端接受后才算完成：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8310)
- 捕捉成功但队伍已满时，云端提交现在会把 `pendingMonsterAcquisition` 一起写进结果快照，而不是只在本地先弹待安置框；这能减少“明明已经抓到了，刷新后又像没抓到”的窗口：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8320)
- 捕捉失败时，云端模式下现在也会先提交“清除捕捉动画状态、回到 `battlePhase: active`、交给敌方回合、写入挣脱日志”的结果快照，不再只是本地先恢复回合再等 autosave 补记：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8385)
- `handleSwitch` 在云端模式下不再提前修改真实 `playerTeam / activePlayerId / participatedMonIds`；当前只先播放换人动画，真正的首发切换、参战列表更新和回合归属都等云端快照提交成功后由回放状态接管，避免“界面看着已经换了，但后端没接受”的假成功：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9091)
- 换人提交失败时，当前会保留在可恢复状态并明确给出失败提示，而不是像以前那样本地首发已经变了、玩家却只在后续刷新时才发现自己被打回前一拍：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:9130)

影响：

- 捕捉成功、捕捉失败、强制换人、自主换人，这几条玩家最敏感的战斗结果边界现在都更接近“后端先认结果，本地再显示完成态”，能直接压低“怎么又回退到上一秒”的体感。
- 尤其是捕捉成功后进入待安置的链路，现在不会只在本地先挂一只新宝可梦，刷新时一致性会更好。
- 换人这条本来是典型的高频交互时序点，这轮把真实队伍状态和动画过场拆开后，失败场景也更容易保持诚实，不会制造假成功。

验证结果：

- `npm run build`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 捕捉成功后在待安置弹窗出现前后立刻刷新，确认会稳定读回“已捕捉并待安置”或“已入队 / 已入仓”的真实结果，不会掉回战斗前。
- 捕捉失败、敌方挣脱后立刻刷新，确认会回到正确的战斗进行态，而不是停在已结束的捕捉动画或回到玩家上一拍。
- 自主换人和阵亡后强制换人都要测一次：在换人动画刚播完时刷新，确认会读回新首发；如果云端提交失败，确认界面不会假装已经换人成功。

### 0.35 老师奖励 legacy fallback 已补去重与恢复备份，不再只靠 autosave 碰运气

本轮修复：

- 云存档结构新增 `appliedTeacherRewardIds` 与 `legacyTeacherRewardRecovery` 两个字段，用来分别记录“这批老师奖励里哪些 `reward_id` 已经真正应用过”和“旧版 fallback 已经在后端标记领取、但前端还需要补记到云存档的待恢复批次”：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4363) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4438)
- `applyCloudGameData` 现在会把这两个字段一并读入前端状态，保证重载后仍然知道哪些奖励已经应用过、哪些 legacy 批次还在等待补记，而不是刷新一次就丢失上下文：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5117)
- `resolveTeacherRewardApplication` 现在会先检查 `appliedTeacherRewardIds`，同一个 `reward_id` 已经进过背包/队伍后就不会再次重复应用；这让旧版 fallback 的恢复重试不再有“补记一次又再发一次”的重复发奖风险：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5816)
- 新增 `commitLegacyTeacherRewardRecovery`，专门处理“旧版 `claim_teacher_rewards` 已经把后端奖励标记为已领取，但前端需要把这批奖励安全补入当前云快照”的恢复提交；提交成功后会清理本地恢复备份，失败则进入退避重试并明确通知：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6007)
- 旧版 fallback 现在不再是“RPC 成功后立刻本地 `applyCloudGameData + requestCriticalCloudSave`”；而是先把待恢复批次写入本地恢复备份，再直接尝试 `commitLegacyTeacherRewardRecovery`。这样即使当下保存失败，刷新后也还能继续补记，而不是只能靠运气等 autosave 成功：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6057)
- 新增 `localStorage` 恢复通道与自动补记 effect：如果 legacy 批次是在“后端已认领、前端补记失败”后中断的，当前会在下次进入游戏并确认云快照稳定后自动继续补写，不需要玩家手工再触发一次老师发奖：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4304) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6266)

影响：

- 老师奖励兼容旧后端的这条链路终于从“半事务、靠后续 autosave 补记”提升成了“有恢复备份、有重复保护、能跨刷新继续补写”的状态。
- 这能明显降低一种很讨厌的事故：后端里奖励已经没有了，但前端背包/队伍里也没看到，玩家只能怀疑奖励是不是吞了。
- 因为加了 `reward_id` 去重，这条恢复链路即使多次自动重试，也不会重复发同一批奖励，数据安全性比之前高一截。

验证结果：

- `npm run build`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 人为让 `claim_teacher_rewards` 成功后、紧接着云快照补记失败，确认刷新后会自动继续补记这批奖励，而不是直接丢失。
- 同一批 legacy 奖励在补记重试过程中反复刷新或双标签页重进，确认不会重复发放同一个 `reward_id`。
- 待恢复批次已经补记成功后，确认本地恢复备份会被清掉，不会在后续登录时再次弹出同一批奖励。

### 0.34 老师奖励自动确认失败恢复已补重试节流，成长弹窗渲染期副作用已清掉

本轮修复：

- 老师奖励自动确认链路新增 `teacherRewardConfirmRetryAtRef`，当 `confirm_teacher_reward_claim` RPC 暂时失败、返回 `success: false`、或后续清理 `pendingTeacherRewardClaim` 的云快照提交失败时，不再立刻在同一渲染节奏内连续重撞后端，而是进入 10 秒退避窗口再自动重试：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4690)
- `confirmTeacherRewardClaim` 失败时现在会明确写日志并提示玩家，不再只是 `console.error` 后静默返回；这样至少能把“奖励正在重试确认”“奖励已发放但批次清理未完成”这类状态直接暴露到界面层，而不是让玩家无感继续游玩：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6027)
- 若老师奖励确认后的 token 清理提交被云端冲突拒绝，当前会沿用现有 `requiresCloudReload` 阻断；若只是暂时性失败，则保留待确认批次并进入退避重试，而不是直接把错误吞掉留成悬挂状态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6071)
- 自动确认 effect 现在会先检查 `teacherRewardConfirmRetryAtRef`，避免旧页面、慢网络或后端短暂抖动时对同一 `claimToken` 高频重复确认：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6092)
- 分支进化弹窗和普通进化弹窗里，之前仍残留“渲染时发现事件失效就直接 `setPendingGrowthEvents(prev => prev.slice(1))`”的副作用；本轮已改成纯 `return null`，统一交给前面的 `dismissPendingGrowthEvent` 恢复 effect 处理，避免 React render 阶段偷偷改状态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8886) [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8929)

影响：

- 老师奖励这条“先入包、再确认、再清 token”的握手链路在失败场景下更可控了，不容易因为短暂后端错误进入静默重试风暴，或让玩家在不知情的情况下背着一个悬挂批次继续玩。
- 成长弹窗对应的 React 状态机更干净，失效事件只会走统一恢复链路，不再一半靠 effect、一半靠 render 期间直接裁队首事件。
- 这轮修的不是玩法数值，但它直接减少了“奖励明明领到了却像没确认干净”“进化弹窗偶尔闪一下就没了”这种很难复现、很伤信任感的边角问题。

验证结果：

- `npm run build`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 老师奖励已入包但自动确认 RPC 被人为打断时，确认界面会提示“正在重试确认”，并且 10 秒内不会疯狂重复请求。
- 老师奖励确认成功但清 token 落云失败时，确认要么进入明确的重读阻断态，要么等待自动重试，不会静默消失。
- 普通进化 / 分支进化事件失效时，确认弹窗只是不显示，由统一恢复 effect 清理事件，不会再触发 React “render 时 setState” 类告警或偶发闪退。

### 0.30 成长事件与队伍管理链路已进一步改成云端优先，文档与代码实现重新对齐

本轮修复：

- `applyLearnMove`、`handleLearnMoveChoice`、`handleEvolution` 现在在云端模式下会优先读取最新云快照，并通过 `resolvePendingGrowthEventHead` 校验当前队首成长事件仍然匹配，之后才提交“学会技能 / 遗忘技能 / 执行进化 + 消费队首事件”的新快照：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6086)
- 自动学招不再只是“本地先把技能塞进去再切掉 `pendingGrowthEvents[0]`”；如果当前云端头事件已经变化、技能已被别处学会、或技能槽状态已变化，当前会直接中止并提示重新确认，避免旧弹窗或旧标签误消费成长队列：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6097)
- 四技能遗忘选择现在也会基于最新云端队伍重新校验目标宝可梦、当前技能栏和忘记槽位，提交成功后才正式把事件出队；放弃学习同样会把“放弃”结果与事件消费一起写回云端：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6162)
- 普通进化与分支进化都统一接入同一套云端头事件校验；分支进化会确认 `targetId` 仍属于当前 `targetOptions`，避免过期选择弹窗把已经变化的分支错误吃掉：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6249)
- `commitRosterMutation` 之前实际上还是“本地先改队伍 / 仓库 / 待安置状态，再请求关键保存”；本轮已改为云端模式下先基于最新快照重新执行 `release / deposit / withdraw / swap / pending placement` 这组操作，只有后端接受后才回写本地：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7380)
- `handleReorderTeam` 也已补接云端优先提交，不再只是本地重排首发顺序后依赖后续防抖保存；这让文档里“队伍/仓库链路已改成先提云端快照再回写本地”的说法终于和实际代码一致：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8081)

影响：

- 升级、学技能、忘技能、进化这组最容易在刷新、双标签页、晚到请求下出问题的链路，现在不再主要依赖“本地先走一步 + 稍后 autosave 补记”。
- 队伍整理、存仓、取出、待安置替换/送仓/放弃这些高频队伍管理操作，也不再在云端模式下留下“本地已经换了，但后端还没接受”的长窗口。
- 这轮修复直接提高了“不会在游玩过程中莫名其妙又回退到前一秒”的把握，尤其是成长弹窗和队伍管理弹窗这两类之前最容易被旧界面误提交的操作。

验证结果：

- `npm run build`：通过
- `npm run audit:data`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 升级后自动学招瞬间刷新，确认不会重复学招、不会漏学招，也不会把队首事件静默吞掉。
- 四技能已满时停在遗忘弹窗，分别测试“选择遗忘”“放弃学习”“双标签页旧弹窗点按钮”，确认都只消费一次正确事件。
- 分支进化弹窗停留时刷新，确认仍能读回当前分支选择，旧标签页不能提交过期分支。
- 放生、存仓、取出、互换、待安置替换与送仓，在双标签页或慢网络下确认旧界面会被拒绝，不会把最新队伍覆盖回旧顺序。

### 0.31 老师奖励确认清理与成长无效事件恢复边角已继续收口

本轮修复：

- `confirmTeacherRewardClaim` 之前是“后端先确认领取成功，再本地把 `pendingTeacherRewardClaim` 清空并请求关键保存”；现在改成确认 RPC 成功后，立刻再提交一笔云快照，把 `pendingTeacherRewardClaim: null` 正式落库，不再把不可逆确认后的 token 清理留给后续 autosave：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5843)
- 新增 `dismissPendingGrowthEvent`，专门处理“当前成长事件已经失效，但又不能继续挂着”的恢复路径；它会在云端模式下先校验并消费队首事件，再把必要提示写回，而不是在界面里直接偷偷 `slice(1)`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6102)
- `applyLearnMove`、`handleEvolution` 的本地 fallback 里，若目标宝可梦已不存在、技能已被学会、或当前进化目标已失效，当前也会走显式事件清理函数，而不是静默在局部逻辑里直接裁掉队首事件：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6178)
- 新增成长事件自恢复 effect：当 `evolutionChoice` 或 `evolution` 事件对应的宝可梦 / 目标形态数据已经无效时，现在会通过统一恢复链路清理，不再在 render 过程中直接 `setPendingGrowthEvents(...)` 产生副作用：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6408)

影响：

- 老师奖励握手链路从“奖励应用先落云，但确认 token 清理靠后续保存补上”继续收紧成“确认成功后立刻补清 token”，降低刷新后重复带着旧批次 token 回来的窗口。
- 成长弹窗层面的状态机更干净了，尤其是异常数据、过期弹窗、目标已消失这些边角，不再在渲染期偷偷改状态。
- 这轮虽然不是大改玩法，但对“刷新恢复时为什么会莫名少一条成长事件/为什么奖励像是确认过又还挂着”这类诡异边角很有帮助。

验证结果：

- `npm run build`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 老师奖励刚入账、自动确认刚发生后立即刷新，确认不会继续带着旧 `pendingTeacherRewardClaim` 读回。
- 造一个成长事件失效场景后刷新，确认事件会被明确清理，不会卡住弹窗，也不会在无提示下吞掉错误事件。
- 分支进化或普通进化弹窗对应目标被改动的极端场景下，确认界面会给出恢复提示，而不是静默闪一下消失。

### 0.32 队伍管理与待安置弹窗已补异步忙碌锁，待安置放弃改成云端优先

本轮修复：

- `TeamScreen` 新增统一 `isBusy` 忙碌态；放生、存仓、取出、互换、重排现在都会等待异步结果返回后再解锁，不再允许在云端提交期间连续点击同一批管理按钮：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2759)
- 队伍详情弹窗、仓库详情弹窗、互换选择层、顶部返回按钮、队伍/仓库切页按钮都已经接上忙碌禁用，避免“请求还没回来，用户又切页或换选中对象”造成的界面错位：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2838)
- `MonsterAcquisitionDecisionModal` 也补了自己的 `isBusy` 忙碌锁；送仓、替换、放弃三条操作现在都按异步结果收口，不会因为连续点而重复提交同一只待安置宝可梦：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3215)
- `handleReleasePendingMonster` 之前还是“本地先把 `pendingMonsterAcquisition` 清空，再请求关键保存”；现在改成云端模式下先提交一笔清空待安置宝可梦的快照，成功后才结束，避免“本地已放弃、云端还挂着旧待安置宝可梦”的窗口：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8134)

影响：

- 队伍管理和待安置流程现在更接近真正的“一次点击只触发一次结果”，对慢网络、双击、双标签页这种最常见的人为并发更稳。
- 待安置宝可梦这条链路原本是很容易让人感知到“我明明已经处理过了，怎么刷新后又弹出来”的，现在这个窗口被明显缩小了。
- 这轮主要提升的是交互一致性和冲突恢复体验，不改变玩法规则，但能实打实减少“看起来像回退了一秒”的感觉。

验证结果：

- `npm run build`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 队伍管理页连续快速点击“存 / 取出 / 互换 / 上下移动”，确认只会生效一次，按钮在返回前保持忙碌。
- 待安置宝可梦弹窗里连续快速点击“放入仓库 / 替换 / 放弃”，确认不会出现重复操作或弹窗残留。
- 放弃待安置宝可梦后立即刷新，确认不会把刚放弃的宝可梦重新读回成待安置状态。

### 0.33 战斗中强制换人界面已改成“成功后才关闭”

本轮修复：

- `TeamScreen` 在战斗中作为“选择替补宝可梦”界面时，之前是点击卡片后先调用 `onSelect(mon.id)` 再立刻 `onBack()`；如果换人因为云端冲突、旧弹窗、目标已失效而失败，界面还是会先关掉，看起来像是已经切过去了。[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2994)
- 现在战斗中选择替补宝可梦已改成异步等待 `onSelect` 结果；只有真正换人成功才关闭队伍界面，失败时会保留在原界面，忙碌态也会正常解除。[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2994)
- 切换过程中整张队伍列表会一起进入 `disabled`，避免在等待换人提交期间继续点第二只宝可梦。[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3011)

影响：

- 阵亡后强制换人这条最敏感的战斗恢复链路，现在不再会因为“界面先关了、实际没换成功”而制造假成功体感。
- 这对双标签页、慢网络和旧弹窗提交失败尤其重要，因为玩家会更明确地留在“还没换成功”的正确界面里。

验证结果：

- `npm run build`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 阵亡后强制换人时，在旧标签页点一只已经无效的替补，确认界面不会先关闭。
- 战斗中主动换人时，如果云端提交失败，确认仍停留在可重新选择的队伍界面里。

### 0.23 战败与逃跑 fallback 继续收口到“资源变更后立刻补快照，失败则补偿并阻断”

本轮新增：

- `handleDefeatContinue` 在原子资源 RPC 缺失时，若先通过 `adjust_gold` 扣除了失败金币，当前不再直接本地恢复队伍并异步保存；而是会立刻补一笔普通云快照，把“退出战斗 + 队伍满血满蓝恢复 + 金币损失日志”一起落库：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8058)
- 如果上述普通云快照失败，当前会立即尝试把本次失败金币退回，并切入 `requiresCloudReload` 阻断态，要求重新读取云端，避免留在失败结算页反复点击造成二次扣款：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8119)
- `handleEscapeContinue` 在原子资源 RPC 缺失时，若先通过 `adjust_energy` 退回了本场能量，当前也不再直接本地离场；而是会立刻补一笔普通云快照，把“退出战斗 + 清理战斗临时态 + 逃跑日志”一起落库：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7608)
- 如果逃跑后的普通云快照失败，当前会立即把刚退回的能量再扣回作为补偿，并切入 `requiresCloudReload` 阻断态，避免出现“能量已退、但战斗态没退”后还能继续重复触发结算的窗口：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7655)
- `activeBattleEnergyCostRef` 不再在逃跑 / 战败结算函数入口处提前清零，而是只在真正完成本地退场时清零，避免结算失败时把本场退款依据提前丢掉：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7616)

影响：

- 原子 RPC 缺失时，战败和逃跑两条 fallback 现在都从“资源先改、本地先走、云端稍后补”进一步收紧为“资源先改后立刻补快照，失败就补偿并阻断”。
- 这显著缩小了“金币已经扣了 / 能量已经退了，但战斗状态还停在旧过场里”的分叉窗口，也减少了重复点击导致重复扣款或重复退款的风险。
- 这两条链路当前更接近“要么完整结算成功，要么进入必须重读的明确错误态”，而不是让玩家带着半成功状态继续玩。

验证结果：

- `npm run build`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 禁用原子资源 RPC 后，战败结算点击“重整旗鼓”时断网 / 刷新，确认金币要么已扣且进度同步退出战斗，要么已退回并进入重读态。
- 禁用原子资源 RPC 后，逃跑过场结束瞬间断网 / 刷新，确认能量不会重复退回，也不会卡在已退能量但仍在旧战斗的状态。
- 资源补偿失败时 `CloudSyncBlocker` 是否能正确遮住结算页，并把按钮切到“重新读取云端进度”。

### 0.24 战斗结算阶段进入时已提前触发关键云存档

本轮新增：

- 击败最后一只敌方宝可梦并进入胜利过场时，`finishEnemyDefeat` 现在会在 `setBattlePhase('victory')` 后立刻触发 `requestCriticalCloudSave()`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6231)
- 玩家全队倒下并进入失败过场时，`handleRecoverFromDefeat` 现在会在 `setBattlePhase('defeat')` 后立刻触发 `requestCriticalCloudSave()`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6257)
- 逃跑成功进入 `escape` 过场时，`handleRun` 现在会在 `setBattlePhase('escape')` 后立刻触发 `requestCriticalCloudSave()`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7680)

影响：

- 战斗奖励已结算、但胜利 / 失败 / 逃跑过场还没走完的那一小段时间，现在更快地被纳入关键云存档节奏。
- 如果玩家刚好在结算过场出现后立刻刷新，读回到正确过场阶段的概率更高，不容易掉回“战斗前一拍”或者“仍停在 active 但其实已经结算完”的状态。

验证结果：

- `npm run build`：通过

仍需最终手测：

- 胜利奖励刚弹出时立即刷新，确认会回到胜利过场或至少不会回到旧战斗回合。
- 失败过场弹出后立即刷新，确认不会丢失失败结算阶段。
- 逃跑成功文案出现后立即刷新，确认不会回到还能继续操作的 active 阶段。

### 0.25 连续敌人切换与胜利过场前的刷新窗口已继续收口

本轮新增：

- `finishEnemyDefeat` 现在在云端模式下不再只做“奖励先落云，后续阶段切换留给本地状态”；而是在奖励结算完成后，继续把“切到下一只敌人”或“进入胜利过场”再补一笔普通云快照：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6140)
- 如果对面还有剩余宝可梦，当前会把 `activeEnemyId / turn / participatedMonIds / battlePhase / battlePhaseData / logs` 一并写回，确保刷新时更接近直接回到“下一只敌人已上场”的状态，而不是停在一个已经 0 HP 的旧敌人身上：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6148)
- 如果本场已经打完，当前会把 `battlePhase = 'victory'` 与 `battlePhaseData.rewardSummary` 一并补进云快照；训练家战的“战后全队回复”也会跟胜利阶段一起写回，而不是只先改本地队伍：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6177)
- 若这一步阶段快照提交失败，当前不会继续让战斗在本地推进，而是切入 `requiresCloudReload` 阻断态，要求重新读取云端，避免出现“奖励拿到了，但战斗阶段还挂在旧敌人/旧回合”的半成功状态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6168)

影响：

- 连续敌人对战里，击倒当前敌人后的刷新窗口明显缩小，不容易再读回到 `activeEnemyId` 仍指向已经倒下的宝可梦。
- 胜利奖励已经到账但胜利过场还没正式入云的窗口也同步收窄，对“刷新后莫名回到前一拍”的主诉更有针对性。
- 这部分虽然还不是单事务资源 + 状态提交，但已经把“奖励落云”和“战斗阶段推进”从两段完全松散的本地异步，收成了更连续的云端优先链路。

验证结果：

- `npm run build`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 训练家战连续多只宝可梦时，在击倒第一只后立刻刷新，确认能回到下一只敌人已上场的状态，而不是停在旧敌人。
- 击倒最后一只敌人、胜利奖励刚结算完但还没点“继续探索”时刷新，确认会回到胜利过场或稳定的可恢复状态。
- 训练家战胜利后，确认“全队恢复”不会只在本地生效而刷新后丢失。

### 0.26 战斗换人链路已改为云端优先，队伍弹窗忙碌态一并修正

本轮新增：

- `handleSwitch` 现在在云端模式下不再只是本地改 `activePlayerId / participatedMonIds / turn` 后再请求关键保存，而是会先提交一笔云快照，把“换上哪只宝可梦、是否进入敌方回合、参战列表、战斗日志”一起写回：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8325)
- 强制换人和主动换人都会使用同一套云端基线校验：目标宝可梦必须仍在当前队伍、不能濒死、不能与当前首发相同；否则会中止提交并给出提示，不再让旧弹窗在过期状态下偷偷改本地：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8334)
- `BattleScene` 里的队伍选择现在按异步 `onSwitch` 结果收口：换人成功才关闭队伍页，失败时会正确解除 `isBusy`，避免出现“目标无效但战斗按钮一直卡忙碌”的小死锁：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2279)

影响：

- 战斗中最常见的人工状态跳转之一现在也进入了云端优先链路，刷新时更不容易回到旧首发或旧回合。
- 这对“阵亡后强制换人”“自主换人让敌方先动”这两种时序都更稳，因为回合归属和首发切换会一起落云，而不是前端先走一步。
- 队伍弹窗的忙碌态恢复也更顺了，减少了换人失败后的界面假死感。

验证结果：

- `npm run build`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 战斗中主动换人后立刻刷新，确认读回的首发和回合归属正确。
- 我方宝可梦阵亡后强制换人，选择替补后立刻刷新，确认不会回到旧阵亡首发。
- 在双标签页或慢网络下用旧弹窗尝试换人，确认会被正确拒绝且不会污染当前战斗状态。

### 0.27 自动回到玩家回合的稳定边界已提前触发关键保存

本轮新增：

- `handleTurn` 在几种“本回合已稳定结束、重新回到玩家可操作状态”的场景里，当前会在 `setTurn('player')` 后立刻调用 `requestCriticalCloudSave()`，包括：
  - 敌方无可用技能、玩家行动完成后回到玩家回合
  - 正常一整轮结算完毕后回到玩家回合
  - 战斗结算异常时恢复到玩家回合：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6760)
- 敌方自动回合 effect 在“敌方无可用技能”或“敌方行动完成后回到玩家回合”时，也会立刻触发关键保存，而不再只改本地 `turn`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8323)

影响：

- 我们没有去硬存半截 `resolving` 过程本身，而是优先把“稳定的玩家回合边界”更快落云，这样能减少刷新时回到前一拍的概率，又不会把半回合动画或半次技能结算直接固化进存档。
- 对真实游玩来说，玩家最敏感的往往是“明明该轮到我了，刷新后却回到了上一段战斗过程”；这轮收口正对这个感受问题。

验证结果：

- `npm run build`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 敌方无 MP 时由我方继续操作的场景里立即刷新，确认仍会回到玩家回合。
- 一整轮正常结算结束、刚切回玩家回合时立即刷新，确认不会回到旧的自动行动阶段。
- 战斗结算异常恢复路径如果能人为制造出来，确认恢复到玩家回合后刷新不会继续卡在 `resolving`。

### 0.28 切到敌方回合的几个明确边界也已提前落云

本轮新增：

- 捕捉失败后，当前在本地切回 `battlePhase = 'active'`、`turn = 'enemy'` 前已经先触发 `requestCriticalCloudSave()`，缩小“宝可梦已挣脱，但刷新后仍像轮到玩家”的窗口：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7654)
- 逃跑失败时，当前也会在切到 `turn = 'enemy'` 前触发关键保存，不再只是本地改回合：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7792)
- 本地主动换人（非云端提交路径）在把回合交给敌方前，现在同样会先触发关键保存，避免刷新后把“已经换人并轮到敌方”的状态读回成旧的玩家回合：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:8412)

影响：

- 目前“交还给玩家”与“交给敌方”这两类稳定回合边界都开始更早进入关键保存节奏，战斗里最常见的回合归属跳转已经基本不再完全依赖后续防抖保存。
- 这对你最关心的“游玩中莫名回退到前一秒”非常关键，因为最容易让玩家感知到回退的往往不是数值本身，而是回合控制权突然回错边。

验证结果：

- `npm run build`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 捕捉失败后立刻刷新，确认不会回到玩家还能继续先手操作的状态。
- 逃跑失败后立刻刷新，确认敌方接管回合不会丢。
- 本地主动换人后如果还没进入敌方动作就刷新，确认不会回到换人前的玩家回合。

### 0.29 战斗背包规则已收口：经验药水禁战斗，回复药成功后会让出回合

本轮修复：

- `经验药水` 现在在战斗背包中被明确禁用，卡片文案改为“仅战斗外使用 / 仅地图”，避免继续绕过正常战斗节奏在对战内直接加经验：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:1490)
- 这次修复与数据注释保持一致：`EXP_POTIONS` 在数据层原本就标注为“战斗之外的可控加速成长来源”：[gameData.js](/Users/shihe/Documents/宝可梦养成/src/utils/gameData.js:235)
- 战斗中 `回复药` 使用成功后，当前会在播放完治疗动画后自动关闭背包，并把回合切给敌方；云端模式下这次用药提交也会把 `turn` 一并写成 `enemy`，不再出现“喝完药还停在玩家回合、甚至能继续连喝”的漏洞：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7808)

影响：

- 这不只是同步问题，而是直接修正了战斗规则本身：经验药水不再能在战斗里当作无代价成长按钮，回复药也不再可能在同一回合反复使用。
- 由于战斗中用药后的回合归属现在更明确，后续关于“刷新后回合有没有回错边”的手测判断也会更稳定，不会再被这个玩法漏洞本身干扰。

验证结果：

- `npm run build`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 野外战中用回复药后立即刷新，确认会进入敌方回合而不是继续停在玩家回合。
- 战斗背包中确认经验药水按钮已禁用，且不会再弹出目标选择。
- 回复药使用成功后的动画、背包关闭和敌方接管顺序是否自然，没有出现“动画还没结束敌方先出手”的体验问题。

### 0.19 地图交互奖励链路调整为后置项，成长事件消费已继续收口

本轮调整：

- 按当前项目节奏，地图道具 / 回血点 / 果实 / 商人奖励不再作为眼前主线继续深挖，先记为“地图重做后再统一复验”的后置项。
- 当前执行主线改为继续收口不依赖地图结构的核心玩法链路，优先保证升级、学技能、忘技能、进化、战斗结算、资源与云存档一致性。
- `applyLearnMove`、`handleLearnMoveChoice`、`handleEvolution` 现已从“先改本地，再强制保存”改为“先校验队首成长事件，再提交云端快照，再回写本地状态”：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5770)
- 新增成长事件头部校验与事件 key 归一化，处理学招 / 忘招 / 进化前会先确认当前云端 `pendingGrowthEvents[0]` 仍然是这条事件，避免过期弹窗把已变化的队列误消费：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3810)

影响：

- 升级后的自动学招、四技能选择遗忘、确认进化，不再属于“本地先成功，云端后补记”的链路。
- 刷新恢复、双标签页冲突、慢网络晚到请求下，成长事件更不容易被旧弹窗或旧标签误吃掉。
- 地图交互奖励当前虽然已有首轮收口，但不再作为当前冲刺验收前提，避免在即将重做地图的旧链路上继续堆修补。

仍需最终手测：

- 升级后自动学招前刷新。
- 四技能已满时停在遗忘弹窗刷新。
- 进化确认弹窗停留时刷新。
- 双标签页同时处理成长弹窗，确认旧标签不会误消费新标签事件。

### 0.20 战斗收尾与逃跑退款依据已继续收口

本轮新增：

- `activeBattleEnergyCost` 已正式进入云存档快照，不再只挂在前端内存 ref 上；野外战和训练家战开场都会把本场实际扣除的能量写入快照：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3931)
- 新增统一的 `buildExitedBattleSnapshot`，把“退出战斗回地图”时需要一起清理的 `enemyTeam / activeEnemyId / battlePhase / captureSequenceData / activeBattleEnergyCost / encounterCooldownSteps` 收敛到同一出口：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3780)
- `handleVictoryContinue` 现在在云端模式下会先提交“清战斗态并回地图”的快照，再结束胜利过场：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7355)
- `handleEscapeContinue` 现在即使退款金额为 0，也会先提交“退出战斗”快照；若退款金额大于 0，则会把“退出战斗 + 退回能量”一起提交：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7396)
- `handleDefeatContinue` 现在即使没有金币损失，也会先提交“退出战斗 + 队伍恢复”的快照；若存在金币惩罚，则会把“退出战斗 + 恢复队伍 + 扣金币”一起提交：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7831)

影响：

- 刷新恰好发生在逃跑过场、胜利过场、失败结算过场时，恢复逻辑不再依赖前端内存里那一个 `activeBattleEnergyCostRef`。
- 战斗尾声不再那么容易出现“资源已经回退/扣除，但 battlePhase 还留在旧状态”或者“已经离场，但退款依据没了”的分叉。
- 这也让最终手测更聚焦在界面恢复体验，而不是底层结算依据是否持久化。

仍需最终手测：

- 逃跑过场中刷新，确认能量按实际扣除值退回且不会重复退。
- 胜利过场中刷新，确认不会回到旧战斗页或残留旧敌方状态。
- 失败结算过场中刷新，确认扣金币与队伍恢复只发生一次。

### 0.21 逃跑失败不再留下“玩家回合空窗”

本轮新增：

- `handleRun` 在逃跑失败时，已从“先记日志，再延迟 1 秒切到敌方回合”改为“记日志后立即切到敌方回合”：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:7499)

影响：

- 之前那 1 秒里，云存档和本地状态都还停在玩家回合；如果刚好刷新，玩家可能读回到一个本不该存在的“重新操作机会”。
- 现在逃跑失败后，真正决定控制权的状态会立刻落到敌方回合，等待只留给敌方自动回合 effect 的表现层计时。

仍需最终手测：

- 逃跑失败后立刻刷新，确认不会回到玩家回合重新点技能或再逃一次。

### 0.22 原子 RPC 缺失时的关键 fallback 已继续补偿化

本轮新增：

- 战斗奖励在 `save_cloud_game_state_with_resources` 不可用时，经验与成长事件不再只落本地；当前会先尝试补一笔普通云快照，再继续金币发放逻辑：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5808)
- 商店购买在原子 RPC 缺失时，扣金币后会立刻补普通云快照；如果这一步失败，会尝试把金币退回，并阻止本地背包继续前进：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6770)
- 野外战斗与训练家战在原子 RPC 缺失时，扣能量后会立刻补普通云快照；如果战斗开场快照保存失败，会尝试把能量退回，并中止进入战斗：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6699)

影响：

- 如果未来测试环境或异常环境缺失原子资源 RPC，资源与进度不再那么容易出现“资源已变，但战斗/背包/成长结果没真正落云”的长期分叉。
- 这些 fallback 仍不如真正的单事务 RPC 稳，但已经从“先扣后赌”推进到了“先扣后立刻补快照，失败尽量补偿”。
- 当前远端迁移列表已确认原子资源 RPC 存在，正常联调应优先验证主事务路径。

仍需最终手测：

- 在禁用原子 RPC 的环境下，商店购买成功后立即断网/刷新，确认金币和背包不会长期分叉。
- 在禁用原子 RPC 的环境下，开战后立刻断网/刷新，确认能量要么进入战斗，要么被退回。
- 在禁用原子 RPC 的环境下，战斗胜利结算时断网/刷新，确认经验成长与金币不会长期错位。

### 0.5 旧版进化道具库存兼容链路已收口

本轮新增：

- `playerInventory` 现在统一经过 `sanitizePlayerInventory` 归一化。
- 云端读档 `normalizeCloudGameData`、本地状态应用 `applyCloudGameData`、云存档快照 `createCloudSnapshot` 都会过滤历史 `evolutionItem`。
- 老师奖励如果后端仍返回 `evolutionItem`，前端会提示“旧版奖励已停用”，但不会把它重新塞进活跃背包。
- 神秘商人赠送、背包扣减、精灵球消耗、药水消耗都统一回到同一套库存净化逻辑，避免旧数据混入后再次分叉。

影响：

- 历史存档中的进化石、黑辉石、龙之鳞片等不会在读档后继续影响现行等级进化规则。
- 云存档再次保存时，也不会把这些旧字段重新写回活跃库存，降低“旧数据反复复活”的同步噪声。
- 后端白名单与历史奖励数据暂时不动，避免联调阶段再引入新的 SQL 变量。

验证结果：

- `npm run build`：通过
- `npm run audit:data`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

### 0.6 技能运行时契约审计已补齐，`mimic` 空技能问题已修复

本轮新增：

- `scripts/audit-game-data.mjs` 新增了“技能运行时契约”检查，开始静态校验：
  - `priority` 是否在合理范围内
  - `charge` 是否是布尔值
  - `statusChance / volatileChance / statChange.chance` 是否存在非法概率
  - `statChange.target / stages` 是否在战斗执行器支持范围内
  - 变化招式是否出现“会耗 MP 但引擎没有任何可执行效果”的空操作
- `mimic` 现在已从纯空技能修复为“复制目标上一招可执行技能”的最小可玩实现。
- `gameData.js` 中关于 `EVOLUTION_ITEMS` 的旧注释已改成历史兼容口径，避免代码注释继续误导当前规则。

影响：

- 技能数据和战斗执行器之间的隐含契约，已经不再只靠人工读代码判断，后续改技能表时更容易第一时间扫出断链。
- `魔尼尼` 学到 `mimic` 后，不会再在战斗里变成“耗 MP 但没有任何效果”的假变化技。
- 这次修复没有改成长、进化、云存档主链，只把战斗执行器里真实影响游玩的空洞补上了。

验证结果：

- `npm run build`：通过
- `npm run audit:data`：通过
- `npm run audit:battle`：通过
- 当前 `moveRuntimeContractIssueCount = 0`

### 0.7 原子资源提交流程已接通，远端迁移已部署

本轮确认：

- `grantBattleRewards`、`handlePurchase`、`handleEncounter`、训练家对战开战都已经优先走 `save_cloud_game_state_with_resources`。
- 远端迁移列表现已确认 `[202605180004_atomic_resource_save.sql](/Users/shihe/Documents/宝可梦养成/supabase/migrations/202605180004_atomic_resource_save.sql:1)` 已应用，上述链路会把资源变化和云存档快照放进同一事务。
- 后续 0.57 已移除 RPC 缺失时的半事务防御性 fallback；当前线上/联调必须按“RPC 已部署”验收，缺失时前端会阻断并暴露配置问题。

本轮当时追加确认的 fallback 风险（后续 0.57 已关闭半事务降级入口）：

- 战斗奖励 fallback 仍然是“先本地发经验与成长事件，再单独发金币”，若后半段失败，会出现部分成功。
- 商店购买 fallback 仍然是“先扣金币，再改背包，再依赖后续云存档”，若保存失败，会出现资源与背包短暂分叉。
- 野外 / 训练家开战 fallback 仍然是“先扣能量，再切战斗状态，再依赖后续云存档”，若保存失败，会出现能量已扣但战斗状态未完整落库。
- 老师奖励在后端异常缺失握手 RPC 时，曾会回退到旧 `claim_teacher_rewards` 一步式领取；后续 0.54 已移除该回退。

当前结论：

- 仓库代码层面，主链路原子化改造已经到位。
- 线上 / 联调环境已完成 `db push`；当前剩余工作从“部署风险”转为“运行时手测确认”。
- 最终手动验证时，主测“RPC 已部署环境”；只有做回归容错时，才需要额外模拟“故意回退旧 RPC 环境”。

### 0.8 训练家战斗误允许使用精灵球的问题已修复

本轮确认：

- `handleUseItem` 之前只检查“当前是否在玩家回合、背包里是否有球、目标是否存在”，没有检查 `battleKind === 'trainer'`。
- 这意味着训练家战斗里原本可以直接消耗精灵球并进入捕捉动画；一旦捕捉成功，还会把对方宝可梦加入玩家队伍并强行结束当前对战流程。

影响：

- 这是会直接破坏正常战斗规则的核心玩法问题，不属于只做备注的级别。
- 它会影响训练家战、队伍增长、奖励结算和后续云存档读回的一致性。

修复：

- 已在 `handleUseItem` 增加训练家战拦截，训练家对战中现在不能使用精灵球：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5663)
- 当前行为改为：给出日志和错误通知，但不消耗精灵球、不进入捕捉动画、不改动战斗状态。

### 0.9 经验药水、普通药水、精灵球、放生链路的当前风险级别已重新确认

本轮确认：

- `handleUsePotion`、`handleUseExpPotion`、`handleUseItem`、`handleReleaseMonster` 当前都采用“先改本地状态 -> `requestCriticalCloudSave()` -> 依赖强制云存档落库”的模式。
- 这些链路本身还没有像购买 / 开战 / 战斗奖励那样接入后端原子 RPC。
- 但一旦普通云存档失败，界面会被 `CloudSyncBlocker` 挡住，玩家不能在错误状态上继续无声游玩：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3594)

当前判断：

- 这几条链路的主要风险已经不是“静默继续玩，越玩越错”，而是“操作已在本地生效，但云端保存失败后必须先恢复同步才能继续”。
- 因此它们仍然需要最后手动验证刷新恢复；当前优先级低于“逃跑退款资格反例、升级/进化弹窗刷新恢复、捕捉动画刷新恢复”这些更直接影响进度一致性的场景。
- 经验药水的重点手测项仍然是：跨多级升级、学技能弹窗、进化弹窗、刷新恢复是否完整闭环。
- 精灵球的重点手测项仍然是：捕捉动画中刷新、成功捕捉后刷新、失败后敌方行动与库存扣减是否一致。

### 0.10 战斗收尾状态与参战列表清理已补强

本轮修复：

- 训练家对战原本仍显示“逃跑”按钮，`handleRun` 也没有二次拦截；现在训练家对战中已明确禁止逃跑。
- `handleSwitch` 原本只把旧首发加入 `participatedMonIds`，不会把新上场的宝可梦及时纳入参战列表；现在已在换人时把旧宝可梦和新宝可梦都去重加入。
- 捕捉成功、胜利返回地图、逃跑成功、失败结算这几条离开战斗的路径，现已统一补清：
  - `participatedMonIds`
  - `battleKind`
  - `isThrowingPokeball`
  - `captureSequenceData`

影响：

- 经验分摊更贴近“真正上场过的宝可梦”，不会因为换人时序遗漏而漏发。
- 训练家战不会再出现“能抓也能跑”的规则穿透。
- 战斗结束后残留的临时字段更少，降低刷新读回时把地图态误读成旧战斗尾巴的概率。

### 0.11 成长事件队列消费链路已复核，当前剩余风险主要是多级升级的“双轨基准”

本轮确认：

- `pendingGrowthEvents` 现在仍然按“队首事件单条消费”的方式工作，`learnMove / evolution / evolutionChoice` 都只会处理 `pendingGrowthEvents[0]`。
- 自动学招只会在“当前事件就是 `learnMove` 且技能槽未满”时触发；满 4 技能时会停在显式选择弹窗，不会被后台自动跳过。
- 事件弹窗本身依赖已持久化的 `pendingGrowthEvents`，因此当前主要剩余问题已收敛到界面级刷新恢复，而不是事件队列完全丢失。

当前保留的结构性风险：

- `gainExpAndLevelUp` / `simulateMonsterExpGain` 在多级升级时，宝可梦实例重算仍然使用最初的 `displayBase`，而技能/进化事件判断则会随着 `growthBase` 往已进化形态推进。
- 这意味着当前实现本质上是“属性重算基准”和“事件判定基准”双轨并行。
- 现阶段脚本审计已经证明它不会继续复现“跨多级漏进化 / 进化后漏学技能”，但这仍然是一个值得保留的 `P1` 结构风险：后续如果成长公式、形态差异、进化后基础参数再变复杂，这里最容易重新长出回归。

当前结论：

- 这块不需要立刻再大改代码，当前更适合保留风险备注并继续依赖最终手工回归兜底。
- 若后续要做更彻底的工程收口，优先方向应是把“升级后的实例重算基准”统一到当前成长形态，而不是继续让 `displayBase` / `growthBase` 双轨并行。

### 0.12 云存档 revision 冲突后的恢复动作已改为“强制重读”，不再继续推送本地旧快照

本轮确认的真实问题：

- 普通云存档 `saveGameToCloud` 在收到 `accepted === false` 时，原先会先吸收服务端返回的较大 `save_revision`，再抛出“旧版本存档被拒绝”错误。
- `CloudSyncBlocker` 的按钮和顶部手动保存按钮原先都走 `handleManualSave -> saveGameToCloud({ manual: true, force: true })`。
- 这意味着旧标签页一旦因为 revision 冲突被后端拒绝，用户点击“立即同步”时，前端仍可能继续拿本地旧快照发起下一次保存，而不是先重新读取云端。
- 同时，防抖自动保存、定时保存、`pagehide` 保存、`visibilitychange` 隐藏页保存原先也不会因为这类冲突自动停下。

本轮修复：

- 新增前端冲突态 `requiresCloudReload`，只要检测到“旧版本存档”类冲突，就进入“必须重读云端”状态。
- `CloudSyncBlocker` 和顶部云按钮在冲突态下会把动作从“保存云端”切换成“重新读取云端进度”。
- 自动保存、防抖保存、定时保存、`pagehide` 保存、页面隐藏时强制保存、关键 `requestCriticalCloudSave` 触发的强制保存，在冲突态下都会暂停。
- 普通云存档在 `accepted === false` 时不再先推进本地 revision，再去抛错；而是直接要求重新读取云端。
- 原子资源提交通路如果收到同类 revision 冲突，也会进入同样的“必须重读”保护态，避免购买、开战、奖励结算这类链路在冲突后继续盲写。

影响：

- 旧标签页即便点了恢复按钮，也不能再把本地旧状态“升 revision 后重新推上去”。
- 发生双标签页 / 慢网络 / 晚到请求冲突时，前端会明确要求重读云端，而不是让用户反复重试保存。
- 这条修复直接对准用户最担心的“游玩过程中莫名其妙回退到前一秒”的高危恢复路径。

验证结果：

- `npm run build`：已在 0.66 统一复验通过
- `npm run audit:data`：已在 0.66 统一复验通过
- `npm run audit:growth`：已在 0.66 统一复验通过
- `npm run audit:battle`：已在 0.66 统一复验通过

### 0.13 训练家战禁止使用精灵球的规则回归已重新封口

本轮复核时发现：

- 当前 `handleUseItem` 一度缺少 `battleKind === 'trainer'` 的逻辑拦截，训练家战中精灵球会直接进入捕捉流程。
- 战斗背包 UI 也没有把训练家战中的精灵球按钮置灰，玩家仍能在界面上尝试点击。

本轮修复：

- 在 `handleUseItem` 开头恢复训练家战拦截，训练家对战中现在不会消耗精灵球，也不会进入捕捉动画。
- `BattleScene` / `BagScreen` / `UnifiedBagScreen` 新增 `canUsePokeballs` / `canUseBattleBalls` 透传，训练家战里会把精灵球显示为禁用状态，并改文案为“仅野外”。
- 道具说明在训练家战中会明确显示“训练家对战中不能捕捉”。

影响：

- 训练家战再次符合基本对战规则，不会出现“对方训练家宝可梦被直接抓走”的玩法穿透。
- 这条修复同时减少了战斗状态、队伍增长、奖励结算和云存档链路被异常捕捉结果污染的风险。

验证结果：

- `npm run build`：已在 0.66 统一复验通过

### 0.14 同步阻断态的后台自动行为与遮罩层级已补强

本轮复核确认：

- 地图移动链路已经把 `cloudBlocked` 传进 `GameCanvas` 和 `ThreeLowPolyMap`，地图态基本能在同步阻断时停住。
- 但阻断态下仍有几条后台自动链路原先不会停：
  - 敌方自动回合 `turn === 'enemy'` 的定时执行
  - 老师奖励自动 `begin / confirm` 握手
  - 捕捉成功/失败动画与逃跑过场的自动完成计时
- 另外，`CloudSyncBlocker` 原先的 `z-index` 低于成长弹窗、战斗过场等高层 overlay，理论上会出现“明明已经阻断同步，但上层弹窗还在前面可点”的遮挡问题。

本轮修复：

- 敌方自动回合 effect 现在会在 `cloudBlocked` 时暂停，定时器触发后也会再读一次最新阻断状态，不再在 blocker 背后自动推进战斗。
- 老师奖励自动领取/自动确认在 `cloudBlocked` 时不再继续推进，避免同步错误期间又生成新的待确认本地状态。
- `CaptureSequenceOverlay` 与 `BattleEscapeOverlay` 新增 `paused` 控制，阻断态下会暂停自动完成，等恢复同步后再继续。
- `CloudSyncBlocker` 的层级提升到全局最高，保证成长弹窗、捕捉动画、战斗过场、地图 UI 都不能盖过同步阻断层。

影响：

- 同步失败后，游戏更接近真正的“冻结在当前可恢复状态”，而不是界面上被挡住、后台却还在偷偷推进。
- 这进一步降低了“本地又多走了几步，恢复后更乱”的时序风险，尤其是战斗中和老师奖励自动入账期间。

验证结果：

- `npm run build`：已在 0.66 统一复验通过

### 0.15 回复药、经验药水、队伍/仓库链路已改为“先提云端快照，再回写本地”

本轮修复：

- `commitCloudSnapshot` / `commitCloudSnapshotWithResources` 新增了“显式中止”能力；当云端基线已经变化、目标不存在、道具数量不足、目标已满血或已满级时，不再伪造一次成功提交。
- `handleUsePotion`、`handleUseExpPotion` 现在会基于最新云端快照重新校验目标宝可梦和库存，再决定是否提交；不再只依赖当前本地界面的旧状态。
- `handleReleaseMonster`、`handleDepositToStorage`、`handleWithdrawFromStorage`、`handleSwapPartyAndStorage`、`handleSendPendingMonsterToStorage`、`handleReplaceWithPendingMonster`、`handleReleasePendingMonster`、`handleReorderTeam` 已接入同一套“基于云端基线构造结果快照”的提交链路。
- 上述操作在云端模式下，只有后端接受新快照后才会由 `applyCommittedCloudState` 回写本地；失败时会直接提示当前冲突或状态变化，不再先改本地再等后续强制保存。

影响：

- 药水和队伍管理操作的风险级别，已经从“本地先改，保存失败后再补救”下降到“先后端接受，后本地回写”。
- 双标签页、慢网络、玩家刚开着一个旧页面时，这些高频操作更不容易把旧状态误写回云端。
- 这也让最终手测的重点更聚焦到“刷新恢复 / 动画过程恢复”，而不是静态操作本身是否会先天分叉。

验证结果：

- `npm run build`：通过
- `npm run audit:data`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 经验药水跨多级升级时，学技能弹窗、进化弹窗、刷新恢复是否完整闭环。
- 放生、存仓、取出、互换、待安置替换时，在同步冲突或刷新后的读回体验是否符合预期。

### 0.16 精灵球使用与捕捉结算已开始改造成“两段式云端提交”

本轮修复：

- 战斗背包里的精灵球按钮现在会等待 `onUseItem` 的异步结果；只有真的开始捕捉后才会关闭背包。
- `handleUseItem` 在云端模式下，已经改为先提交“扣除精灵球 + 进入捕捉中 + 写入 captureSequenceData”的快照，再开始捕捉动画。
- `handleCaptureSequenceComplete` 在云端模式下，已经改为基于最新云端快照提交捕捉成功或失败的最终结果：
  - 成功时会一并提交 `nextPlayerMonsterId`、队伍/仓库变化、待安置弹窗状态、离开战斗状态。
  - 失败时会一并提交“退出捕捉中、回到敌方回合”的状态。
- 如果“丢球开场”已经成功落云，但“动画结束后的最终结算”提交失败，前端现在会直接进入“必须重新读取云端进度”的保护态，不再继续拿本地半完成捕捉状态反复重试。
- `encounterCooldownSteps` 已接入云快照 schema，捕捉成功、逃跑成功、换图后回到地图的安全步数现在可以随云存档一起读回。

影响：

- 捕捉过程不再完全依赖本地临时状态，刷新恢复时更容易读回“正在捕捉”或“已完成结算”的明确阶段。
- 精灵球扣减和捕捉动画开场的时序更紧，降低了“球已经没了，但战斗状态没进捕捉流程”这类错位概率。

当前保留风险：

- 捕捉成功后的最终通知文案与待安置提示，仍需要结合手测再微调一次。

验证结果：

- `npm run build`：通过
- `npm run audit:data`：通过
- `npm run audit:growth`：通过

最终手测重点：

- 捕捉动画中刷新。
- 捕捉成功且队伍已满时刷新，确认 `pendingMonsterAcquisition` 能正确读回。
- 捕捉失败后刷新，确认仍回到同一场战斗且不会重复扣球。
- 捕捉成功或逃跑成功后立刻刷新，确认安全步数不会丢失。

### 0.17 地图网格读档与老师奖励提交链路已继续收口

本轮修复：

- 云端读档 `getInitialMapGrid` 现在会优先恢复已保存的 `mapGrid`，不再每次无条件重建成地图初始状态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:1522)
- 同时保留了 `mapContentVersion` 升级保护；只有地图内容版本变化时，才会强制回到新版本初始地图：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3874)
- `applyCloudGameData` 因此终于能把采集后、清格后、换图后的真实地图状态读回，而不是把云端保存过的 `mapGrid` 再覆盖掉：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4449)
- 老师奖励新增 `resolveTeacherRewardApplication`，会基于最新云快照统一推演：
  - 背包奖励增加
  - 奖励宝可梦入队 / 入仓 / 待安置
  - `nextPlayerMonsterId`
  - `pendingTeacherRewardClaim`
  - 日志追加
  并在一次云快照提交成功后才落本地：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5039)
- `beginTeacherRewardClaim` 现在在握手 RPC 成功后，不再先本地改背包和队伍，而是先提交奖励应用后的快照；只有提交成功，才继续等待后续 `confirm_teacher_reward_claim`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5236)

影响：

- 修复前：
  - 地图上的可采集格、已清除格、已走过的临时地图状态虽然写进了云存档，但刷新后会被前端重新铺回初始地图，造成明显的“回退一秒”体感。
  - 老师奖励虽然已有 `begin / confirm` 握手，但奖励内容本身仍然是先改本地、再等后续 autosave/critical save，同步失败时依然可能留下本地已改、云端未记的窗口。
- 修复后：
  - 地图状态终于和云存档中的 `mapGrid` 一致，刷新后不会因为前端重建地图而把已清除交互格复活。
  - 老师奖励在新 RPC 已部署环境中，已经进一步收口为“预留批次 -> 基于最新快照提交奖励结果 -> 快照稳定后确认领取”。

验证结果：

- `npm run build`：通过
- `npm run audit:data`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 领取老师奖励后立刻刷新，确认背包 / 队伍 / 待安置弹窗和后端领取状态一致。
- 地图上触发一次可清除交互后刷新，确认该格不会重新出现。
- 地图内容版本升级后的老存档，确认仍会安全落到新地图初始布局。

### 0.18 地图交互已改成“上层确认成功后才消费地块”

本轮修复：

- `handleCollect` 现在会明确返回布尔结果，告诉地图层这次交互是否真的成功消费：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6478)
- 地图道具、回血点、果实、商人奖励在云端模式下，已经改成把“奖励效果 + 清除 mapGrid 交互格”一起提交；提交失败时不会清格：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:6519)
- 训练家格子不再由 Phaser 世界层提前 `clearTile`；只有上层确认成功进入训练家战斗后，才算本次交互被消费：[EncounterSystem.js](/Users/shihe/Documents/宝可梦养成/src/game/world/EncounterSystem.js:85)
- Phaser 世界层 `onPlayerStep` 已改成等待异步交互完成，并在等待期间先阻塞输入，避免玩家在云端提交尚未完成时又多走一步：[WorldScene.js](/Users/shihe/Documents/宝可梦养成/src/game/scenes/WorldScene.js:393)

影响：

- 修复前：
  - Phaser 地图里的训练家、道具、回血点、果树、商人奖励都是先触发交互，再由底层无条件清格。
  - 一旦上层因为能量不足、云端冲突、网络失败而没能真正完成交互，地图格子仍然会被吃掉，出现“奖励没拿到但点没了”“训练家没打成却消失了”的错误体验。
- 修复后：
  - 地图是否清格由业务层结果决定，不再由底层世界逻辑抢先消费。
  - 训练家在能量不足、同步失败或开战失败时会留在地图上，等待下次正常挑战。
  - 地图道具/回血点/果实/商人奖励在云端模式下，不会再出现“奖励没保存，但地块先消失”的分叉。

验证结果：

- `npm run build`：通过
- `npm run audit:battle`：通过

仍需最终手测：

- 训练家前能量不足时，确认训练家不会从地图消失。
- 商人 / 果实 / 道具 / 回血点触发后立刻刷新，确认奖励和地图状态一致。
- 同步失败保护态下触发地图交互，确认不会清格。

### 0. 进化规则已统一改为“到等级直接进化”

本轮新增：

- 所有原本依赖 `stone / thunder_stone / item / trade_item / trade / friendship / friendship_day / move_known / move_usage / level_up_item_day` 的分支，现行运行规则已统一改成“到指定等级直接触发进化”。
- 新增 `evolutionChoice` 成长事件类型，`伊布`、`无畏小子` 这类多分支宝可梦在到达进化等级后会弹出分支选择，而不是被默认分支直接吞掉。
- `盆才怪 -> 树才怪` 链路已补齐：新增 `树才怪` 物种数据，并把 `盆才怪` 的错误目标从 `大岩蛇` 修正回可用目标。
- 图鉴进化条件展示已同步改为等级文案；进化道具保留在数据中，但不再作为进化触发条件。

当前实现说明：

- 宝宝或前置形态的特殊进化统一提前到 `Lv.20`。
- 常规特殊进化统一落在 `Lv.30` 左右。
- 像 `海刺龙 / 电击兽 / 鸭嘴火兽 / 多边兽II / 钻角犀兽 / 火爆猴` 这类后段强化进化，等级阈值继续后移到 `Lv.36 / 40 / 50`，避免和上一段进化撞在同一级。
- 进化选择事件、普通进化事件一样进入 `pendingGrowthEvents`，会跟随云存档保存；刷新/断网的最终界面手测仍留到最后。
- 老师后台的新发放入口已不再提供进化道具；玩家背包中的历史进化道具只保留为停用兼容项，不再触发任何成长事件。

### 1. 审计执行链路已打通

新增：

- `scripts/load-vite-module.mjs`
- `scripts/audit-game-data.mjs`
- `scripts/audit-growth-sim.mjs`

调整：

- `scripts/battle-balance-audit.mjs`
- `package.json`
- `scripts/audit-game-data.mjs`

可用命令：

```bash
npm run audit:data
npm run audit:growth
npm run audit:battle
```

说明：

- 这三条命令现在都能跑通并返回结果。
- 当前在本地沙箱环境里，Vite SSR 会额外尝试监听一个 WebSocket 端口并报 `EPERM`，但不影响脚本退出码和审计结果。
- 这个噪声后续可以继续优化，但当前不阻塞审计执行。

### 2. 历史进化道具链路说明（已被现行等级进化规则替代）

以下内容保留为阶段性实现记录，现已不再是当前主玩法规则。

本轮新增：

- `src/utils/gameData.js`
- `src/utils/pokemonGrowth.js`
- `src/components/Game/OriginalGame.jsx`
- `src/components/Teacher/Dashboard.jsx`
- `src/utils/gameBalance.js`
- `supabase/migrations/202605190001_teacher_reward_evolution_items.sql`
- `supabase-setup.sql`

历史阶段曾实现：

- 新增 `EVOLUTION_ITEMS` 道具表，补齐 `14` 个进化道具 key 定义。
- 前端、老师端和 SQL 都曾为 `evolutionItem` 留过可发放/可展示的兼容能力。

当前状态：

- 现行运行规则已经统一改为等级触发进化。
- 旧版进化道具前端入口已关闭，读档/存档/奖励领取也不再把它们纳入活跃背包。
- `EVOLUTION_ITEMS` 与后端 `evolutionItem` 白名单当前只保留兼容和历史记录价值。

验证结果：

- `npm run build` 通过。
- `npm run audit:data` 通过。
- `npm run audit:growth` 通过。
- `npm run audit:battle` 通过。

### 3. `move_known / move_usage` 技能条件进化已接通首版

以下内容同样保留为历史实现记录；现行规则中，这些分支已经统一折叠为等级触发。

本轮新增：

- `mimic`、`rollout` 的最小可用招式定义
- `魔尼尼` 的 `mimic` learnset
- `大舌头` 的 `rollout` learnset
- `move_known` 进化判断入口
- 学会技能后的进化事件排队逻辑

历史阶段曾实现：

- 当 `魔尼尼` 学会 `mimic` 后，可在技能入队处理完成后继续触发 `魔墙人偶` 进化事件。
- 当 `大舌头` 学会 `rollout` 后，可在技能入队处理完成后继续触发 `大舌舔` 进化事件。
- 如果宝可梦本来就已经掌握了进化所需技能，那么后续再次升级时，也会补触发 `move_known` 进化检查。
- `rage_fist` 已补入 `MOVES`，`火爆猴` 的 learnset 也已补齐。
- 战斗中若玩家使用过满足 `move_usage` 条件的技能，会把对应技能 key 写入宝可梦实例并进入云存档快照；脱离战斗后，再复用现有 `pendingGrowthEvents` 队列触发进化事件。
- `audit:data` 中 `missingEvolutionMoveDefinitionCount` 已归零。

当前状态：

- `盆才怪 -> 树才怪` 数据已经补齐，`disabledEvolutionCount` 已归零。
- `move_known / move_usage` 等历史声明仍保留在数据中，但当前主流程不再依赖它们决定是否进化。

### 4. 读档洗技能风险已修复

已确认问题：

- `normalizeMonsterAssetSource` 之前会把“不在平衡推荐 4 技能列表里的已学技能”在读档/归一化时清掉。
- 这个问题会影响玩家手动选过的技能保留，也会直接破坏 `move_known` 进化条件，属于高置信度的前后端读回一致性风险。

本轮修复：

- 现在归一化阶段会优先保留实例上已经存在且合法的技能，再只对缺口做补位，不再强行覆盖玩家实际已学技能。

影响：

- 学技能选择结果不再因为重新读档或云端归一化而悄悄回退。
- `move_known` 进化前提不会在刷新后被静默抹掉。

## 历史过程归档说明

从下面开始保留的是按时间顺序沉淀下来的审计记录，用来追溯“问题当时如何暴露、我们如何修掉它”。其中部分条目已经被后续代码和规则变更覆盖，不应再视为当前基线结论；当前基线请以上面的“当前进度”和“本轮已完成”为准。

## 阶段 1 首轮结果：静态数据审计

执行命令：

```bash
npm run audit:data
```

首轮结果摘要（已被后续结果覆盖，保留作过程记录）：

- 宝可梦总数：131
- 技能总数：40
- 精灵球：3
- 回复药：2
- 经验药水：3
- 进化道具：14
- 重复宝可梦 ID：0
- 缺失字段：0
- 非法属性：0
- 非法种族值/MP：0
- 非法技能引用：0
- Lv.1 无零消耗技能覆盖：0
- 缺失图片资源：0
- 非法 learnset：0
- 非法技能定义：0
- 非法道具定义：0
- 非法进化目标：0
- 非法地图刷怪配置：0
- 非等级进化声明：32 条分支，涉及 27 种宝可梦
- 运行时禁用进化分支：1

当前判断：

- 静态数据完整性整体不错，至少第一轮没有扫出“引用不存在”“图片缺失”“等级非法”“目标不存在”这类硬崩溃问题。
- 第一轮最大的结构性问题不是数据坏，而是“数据声明了 32 个非等级进化分支，但原始成长逻辑不会统一处理它们，需要分别接入背包、学招、战斗事件或长期状态系统”。
- 本轮已顺手修正 `audit-game-data.mjs` 的统计口：此前脚本把 2 条带 `level` 的 `alternateEvolutions` 也误算成非等级进化，所以旧文档里的 `34` 需要以下面的 `32/27` 为准。

首轮重点关注的非等级进化样本：

- `海刺龙`：`trade_item + dragon_scale`
- `鸭嘴火兽`：`trade_item + magmarizer`
- `皮卡丘`：`thunder_stone`
- `电击兽`：`trade_item + electirizer`
- `火爆猴`：`move_usage + rage_fist`
- `钻角犀兽`：`trade_item + protector`
- `飞天螳螂`：`black_augurite`
- `伊布`：多分支石头/亲密度进化

按触发方式汇总：

- `stone`：13
- `trade_item`：6
- `friendship`：3
- `move_known`：3
- `trade`：2
- `thunder_stone` / `move_usage` / `item` / `friendship_day` / `level_up_item_day`：各 1

当前实现缺口（以现行规则视角）：

- 当前核心不再是“把所有非等级进化补成可玩”，而是要持续审计“所有历史分支是否已经被正确折叠成等级阈值”。
- 图鉴、成长模拟、升级弹窗、多分支选择都需要继续保持与等级规则一致，避免展示层又泄漏回旧条件。
- 历史 `evolutionItem` 白名单仍留在后端，后续若要彻底删除，需要等联调和历史数据观察期结束后再做。

已修复数据异常：

- `3D龙` 的 `upgrade` 进化目标已从 `109 (多边兽Z)` 修正为 `108 (多边兽II)`：[gameData.js](/Users/shihe/Documents/宝可梦养成/src/utils/gameData.js:622)
- `盆才怪 -> 树才怪` 已补齐，`audit:data` 当前 `disabledEvolutionCount = 0`。
- 验证结果：`npm run audit:data` 通过，`npm run build` 通过。

### 非等级进化专项拆解

#### A. 已落地的一批：道具直接触发与简化道具进化

分支数：

- `stone` 13
- `thunder_stone` 1
- `item` 1
- `trade_item` 6

代表：

- `皮卡丘 -> 雷丘`
- `伊布 -> 水伊布/雷伊布/火伊布/叶伊布/冰伊布`
- `胖丁 -> 胖可丁`
- `飞天螳螂 -> 劈斧螳螂`
- `海刺龙 -> 刺龙王`
- `鸭嘴火兽 -> 鸭嘴炎兽`
- `电击兽 -> 电击魔兽`
- `钻角犀兽 -> 超甲狂犀`
- `3D龙 -> 多边兽II`
- `多边兽II -> 多边兽Z`

当前缺口：

- 已补进化道具数据表、背包展示、对队伍宝可梦使用道具、消耗道具后写入 `pendingGrowthEvents` 和云存档快照的链路。
- 老师奖励前后端代码已补 `evolutionItem` 白名单，但仍待线上部署迁移。
- 商店仍未售卖进化道具，当前主要通过老师奖励给测试账号发放。
- `trade_item` 当前按“直接使用对应道具立即触发进化”简化，不要求真实交换与携带道具。

建议优先级：

- `P1` 已完成该批最小可用落地；后续若要贴近原作，再决定是否补真实交换/携带道具系统。

#### B. 中等复杂度：学会指定招式即可进化

分支数：

- `move_known` 3

代表：

- `魔尼尼 -> 魔墙人偶`
- `盆才怪 -> 树才怪`
- `大舌头 -> 大舌舔`

当前缺口：

- `魔尼尼 -> 魔墙人偶` 与 `大舌头 -> 大舌舔` 已补最小可用链路：缺失招式定义、learnset 和学会技能后的进化事件入队都已接上。
- 当前已支持“本次升级前就已掌握指定技能”和“本次升级时刚学会指定技能”两种触发路径。
- `盆才怪 -> 树才怪` 已完成数据修复：当前 `盆才怪` 指向 `targetId: 135`，项目内已收录 `树才怪` 物种数据，`audit:data` 中 `disabledEvolutionCount = 0`。

建议优先级：

- `P1` 已完成该批最小可用链路；后续只需继续用 `audit:data` / `audit:growth` 守住回归。

#### C. 需要战斗态事件的：招式使用进化

分支数：

- `move_usage` 1

代表：

- `火爆猴 -> 弃世猴`（`rage_fist`）

当前缺口：

- `rage_fist` 已补入 `MOVES`，`火爆猴` 也已补 learnset。
- 战斗中玩家使用满足条件的招式后，会把技能 key 写入宝可梦实例并随云存档保存；脱离战斗后再统一转成进化事件，避免打断战斗流程。
- 当前仍未复刻原作的累计使用次数与威力成长规则，只实现了“记录该宝可梦已使用过指定技能”的最小可用版本。

建议优先级：

- `P1` 的最小可用链路已完成；后续是否补原作级细则可降到 `P2`。

#### D. 需要新长期属性的：亲密度与白天亲密度

分支数：

- `friendship` 3
- `friendship_day` 1

代表：

- `吉利蛋 -> 幸福蛋`
- `小卡比兽 -> 卡比兽`
- `宝宝丁 -> 胖丁`
- `伊布 -> 太阳伊布`

当前缺口：

- 当前宝可梦实例没有 `friendship` 字段。
- 当前云存档没有亲密度增长与读取链路。
- `friendship_day` 还额外依赖时间系统或可解释的“白天”规则。

建议优先级：

- `P2`，除非产品明确要把宝宝宝可梦/亲密度培养作为核心玩法。

#### E. 牵连最大的一批：交换与携带道具交换

分支数：

- `trade` 2
- `trade_item` 6

代表：

- `隆隆石 -> 隆隆岩`
- `勇基拉 -> 胡地`
- `海刺龙 -> 刺龙王`
- `鸭嘴火兽 -> 鸭嘴炎兽`
- `电击兽 -> 电击魔兽`
- `钻角犀兽 -> 超甲狂犀`
- `3D龙 -> 3D龙II`
- `多边兽II -> 多边兽Z`

当前缺口：

- 当前没有交换系统，也没有“携带道具”字段。
- `trade_item` 已先按“直接使用指定道具立即进化”落地，优先保证可玩与可存档。
- `trade` 两条分支仍完全未实现；如果照原规则实现，会牵涉队伍、背包、交易对象、动画和存档。

建议优先级：

- `trade_item` 已从该批拆出并落地；剩余 `trade` 建议保持 `P2`，除非产品明确要补交换系统。

#### F. 复合条件：白天升级并持有道具

分支数：

- `level_up_item_day` 1

代表：

- `小福蛋 -> 吉利蛋`（`oval_stone`）

当前缺口：

- 同时依赖道具、时间和升级时条件检查。
- 这是复合条件，不适合在基础系统没落地前单独硬补。

建议优先级：

- `P2`，放在道具系统和时间系统之后。

### 推荐落地顺序

1. 已完成 `stone / thunder_stone / item / trade_item` 这 21 条“道具可触发”的最小可玩进化。
2. 已完成 `move_known` 三条分支，以及 `move_usage` 的最小可用链路。
3. 下一步只需决定 `trade` 是否接受简化规则。
4. 最后再决定 `friendship / friendship_day / level_up_item_day` 是补完整系统，还是统一改成简化规则。

### 首批数据修复建议

#### 建议 1：先补数据定义，再碰交互

涉及文件：

- [gameData.js](/Users/shihe/Documents/宝可梦养成/src/utils/gameData.js:15)
- [TeacherDashboard.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Teacher/Dashboard.jsx:15)
- [supabase-setup.sql](/Users/shihe/Documents/宝可梦养成/supabase-setup.sql:1026)

建议内容：

- 在 `gameData.js` 中新增独立的 `EVOLUTION_ITEMS` 数据表，而不是把进化石硬塞进 `POTIONS` 或 `EXP_POTIONS`。
- 老师端奖励来源 `SHOP_REWARD_ITEMS` 需要扩展出 `evolutionItem` 分组。
- `grant_item_reward` 后端白名单要允许新的进化道具类型，否则老师后台和补偿链路都发不出去。
- `public/assets/items` 当前没有任何进化道具图片；如果短期不补素材，建议先统一使用临时占位图，再单独补资产。

建议的首批 `EVOLUTION_ITEMS` 草案：

| key | 中文名 | 用途 |
| --- | --- | --- |
| `water_stone` | 水之石 | 伊布、大舌贝、海星星 |
| `thunder_stone` | 雷之石 | 皮卡丘、伊布 |
| `fire_stone` | 火之石 | 伊布、卡蒂狗、六尾 |
| `leaf_stone` | 叶之石 | 伊布、臭臭花、蛋蛋 |
| `ice_stone` | 冰之石 | 伊布 |
| `moon_stone` | 月之石 | 胖丁、尼多力诺 |
| `black_augurite` | 黑辉石 | 飞天螳螂 |
| `dragon_scale` | 龙之鳞片 | 海刺龙 |
| `magmarizer` | 熔岩增幅器 | 鸭嘴火兽 |
| `electirizer` | 电力增幅器 | 电击兽 |
| `protector` | 保护器 | 钻角犀兽 |
| `upgrade` | 升级数据 | 3D龙 |
| `dubious_disc` | 可疑补丁 | 多边兽II |
| `oval_stone` | 浑圆之石 | 小福蛋 |

#### 建议 2：把背包使用链路从“三分支”改成“按 itemType 分发”

涉及文件：

- [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:1251)
- [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:5017)

已观察事实：

- 当前背包只识别 `ball / potion / expPotion` 三类，`UnifiedBagScreen` 是通过 `POKEBALLS || POTIONS || EXP_POTIONS` 推导类型的。
- 这意味着即使把进化石塞进库存，当前背包也不会知道它是“选择目标宝可梦后触发进化”的新类型。

建议内容：

- 统一让背包基于 `itemType` 查 item catalog。
- 新增 `evolutionItem` 的目标选择和使用回调。
- 使用成功后不要直接立刻改形态，应复用现有 `pendingGrowthEvents` / `handleEvolution` 事件链，避免又做一套独立进化状态机。

#### 建议 3：`move_known / move_usage` 最小可用链路已落地

涉及文件：

- [gameData.js](/Users/shihe/Documents/宝可梦养成/src/utils/gameData.js:15)
- [pokemonGrowth.js](/Users/shihe/Documents/宝可梦养成/src/utils/pokemonGrowth.js:27)

当前进度：

- `mimic`、`rollout` 已补入 `MOVES`，并已给 `魔尼尼`、`大舌头` 接上最小可用 learnset。
- `move_known` 已接入“升级后已有技能”与“本次学招后新增技能”两条检查路径。
- `rage_fist` 已补入 `MOVES`，`move_usage` 也已接入战斗后排队进化的最小可用链路。

当前保留的简化点：

- `rollout`：当前先按普通岩石系物理招式做最小实现，后续再补连续回合强化。
- `rage_fist`：当前先按普通幽灵系物理招式做最小实现，后续再补“受击后威力成长”。
- `mimic`：当前已按“复制目标上一招可执行技能”的最小可玩效果接入，用来打通 `move_known` 审计链路。
- `move_usage`：当前按“记录曾使用过该技能”处理，尚未实现原作累计次数规则。

#### 建议 4：对 `盆才怪` 先停在“修数据前不实现”

涉及文件：

- [gameData.js](/Users/shihe/Documents/宝可梦养成/src/utils/gameData.js:1140)

建议内容：

- 这条链路当前缺的是目标物种，不是只缺一个判断。
- 在 `树才怪` 物种数据补齐前，不建议实现 `盆才怪` 的 `move_known` 进化。
- 如果短期不补物种，建议在文档和图鉴中把这条标为“暂未开放”而不是默默挂错目标。

#### 建议 5：已可直接提交的纯数据修正

本轮已完成：

- `3D龙 -> 多边兽II` 的 `upgrade` 目标修正已落库：[gameData.js](/Users/shihe/Documents/宝可梦养成/src/utils/gameData.js:622)

仍建议下一批优先处理：

- `盆才怪` 目标断链的产品决策：补 `树才怪` 物种，或正式标为未开放。

结论：

- 阶段 1 当前状态可标记为“首轮静态审计完成，存在明确产品与实现边界问题”。
- 下一步不是先修数据，而是先决定这 32 个非等级进化分支的处理策略。

### 阶段 1 二次深化：非等级进化数据前置阻塞

执行命令：

```bash
npm run audit:data
```

新增结果摘要：

- 非等级进化分支：32
- 非等级进化物种：27
- 运行时禁用进化分支：1
- 进化条件引用缺失招式定义：0
- 进化条件引用缺失道具定义：0

新增发现：

- `mimic`、`rollout`、`rage_fist` 已全部补入 `MOVES`，`move_known / move_usage` 的招式定义硬阻塞已清零。
- 进化道具定义、背包使用与老师奖励链路已补齐，`trade_item` 也已按直接使用道具落地；当前仍未开放执行的是 `trade`、亲密度、白天持石升级等复杂条件。
- `3D龙 -> 多边兽II` 的 `upgrade` 目标已修正；当前剩余明确数据断链只剩 `盆才怪 -> 树才怪`。

## 本轮修复：成长主链路与事件持久化

本轮已修改：

- `gainExpAndLevelUp` 现在把“显示形态”和“成长判定形态”分开处理。
- 跨多级升级时，后续等级判定会沿着已触发的进化链继续向后推。
- 学技能事件保持按等级顺序入队，不再因为 `unshift` 把后面的进化插到前面。
- 成长事件现在会记录 `level` 和 `sourceBaseId`，便于后续调试和恢复。
- `pendingGrowthEvents` 已接入默认存档、归一化读取、云端快照和读档恢复流程。

涉及文件：

- [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2461)
- [audit-growth-sim.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-growth-sim.mjs)

验证结果：

- `npm run audit:growth`：通过
- `npm run build`：通过

当前说明：

- 这次修复已经解决“跨多级漏进化”和“进化后漏学技能”的脚本级问题。
- `pendingGrowthEvents` 已持久化，但真实界面层的刷新/断网恢复复测按当前安排留到最后手动执行。

## 阶段 2 首轮结果：成长模拟审计

执行命令：

```bash
npm run audit:growth
```

首轮结果摘要：

- 模拟宝可梦数：131
- 模拟等级点：13100
- 经验曲线异常：0
- 同形态属性倒退：0
- 多段等级进化漏触发风险场景：6
- 多段等级进化受影响宝可梦种类：6
- 进化后 learnset 漏判风险场景：21
- 进化后 learnset 受影响宝可梦种类：19

### 已修复问题 A：一次跨多级时，后续等级进化可能漏触发

受影响样本：

- `妙蛙种子`：`16 -> 71` 后，继续跨到 `32 -> 72` 时可能漏第二段进化
- `小火龙`：`16 -> 73` 后，继续跨到 `36 -> 74` 可能漏
- `杰尼龟`：`16 -> 75` 后，继续跨到 `36 -> 76` 可能漏
- `鬼斯`：`25 -> 21` 后，继续跨到 `36 -> 6` 可能漏
- `腕力`：`28 -> 18` 后，继续跨到 `40 -> 34` 可能漏
- `迷你龙`：`30 -> 129` 后，继续跨到 `55 -> 12` 可能漏

根因判断：

- `gainExpAndLevelUp` 在循环中始终使用升级前 `mon.baseId` 查基础形态。
- 一次大经验跨过多个进化等级时，后续判断仍基于初始形态，而不是进化后的当前形态。

修复状态：

- 已修复
- 已通过 `npm run audit:growth` 复验

### 已修复问题 B：进化后形态 learnset 可能在一次跨多级中漏学

受影响样本：

- `妙蛙种子`：进化到 `妙蛙草/妙蛙花` 后的 `poison_jab`、`hypnosis` 风险
- `小火龙`：进化到 `火恐龙/喷火龙` 后的 `slash`、`fire_blast`、`fly` 风险
- `杰尼龟`：进化到 `卡咪龟/水箭龟` 后的 `bodyslam`、`hydropump`、`icebeam` 风险
- `鲤鱼王`：进化后 `暴鲤龙` 的 `surf`、`dragonclaw` 风险
- `卡咪龟`、`火恐龙`、`墨海马`、`大钳蟹`、`菊石兽`、`小火马`、`小磁怪`、`霹雳电球`、`尼多朗` 等也存在同类问题

根因判断：

- `gainExpAndLevelUp` 在升级循环中用原始 `mon.moves` 和原始基础形态判重与取 learnset。
- 导致“本该在进化后形态的某一级学到的新技能”，在一次大经验升级里不会进入事件队列。

修复状态：

- 已修复
- 已通过 `npm run audit:growth` 复验

### 已修复待运行时复测问题 C：成长事件队列当前不会进入云存档快照

静态确认依据：

- `pendingGrowthEvents` 是独立的前端状态，定义于 `OriginalGame.jsx`。
- 云存档快照 `createCloudSnapshot` 没有写入 `pendingGrowthEvents`。
- 升级后事件通过 `setPendingGrowthEvents` 入队，而不是进入持久化存档对象。

影响：

- 升级后如果还没处理学技能或进化弹窗就刷新、断网或关闭页面，当前事件队列存在丢失风险。

修复状态：

- 代码已修复
- 构建已通过
- 尚未完成真实刷新/断网恢复复测

### 当前尚未通过脚本覆盖的问题

- `pendingGrowthEvents` 刷新丢失问题已完成代码修复，但还没有进入运行时复测。
- 忘技能弹窗、进化弹窗、刷新恢复、断网恢复仍需手工和界面级测试。

## 阶段 3 首轮结果：战斗平衡抽样

执行命令：

```bash
npm run audit:battle
```

首轮结果摘要：

- 非免疫但伤害为 0：0
- 抽样等级 `5/10/20/30/50` 的同级一击必杀：0
- 抽样等级 `5/10/20/30/50` 的极低刮痧异常：0

当前判断：

- 伤害公式至少在第一轮静态抽样下没有直接炸出“打不动”或“同级随便秒”的硬异常。
- 这不代表战斗链路已经安全，只代表数值层面没有立刻出现离谱结果。
- 真正的战斗链路问题仍要进入阶段 3 的手工流程审计：先后手、异常状态、蓄力、奖励、捕捉、失败恢复。

### 已修复问题 I：同回合先手回复/吸血后，后手结算仍可能读取旧攻击方状态

代码证据：

- `executeBattleMove` 会在内部更新攻击方的回复、吸血和能力变化状态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3835)
- 但修复前 `runPlayerAction` / `runEnemyAction` 返回给 `handleTurn` 的仍是扣 MP 之后、未合并技能效果的旧攻击方对象；本轮已改为回传 `result.attacker`：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3927)

根因判断：

- 同一个回合里，先行动的一方如果用了 `自我再生`、吸血技能，或者未来扩展出自我能力提升技能，React 状态虽然已经更新，但 `handleTurn` 继续驱动后手行动时，局部变量里还是旧对象。

影响：

- 先手回复后，后手可能仍按“回复前血量”继续计算伤害与击倒。
- 先手吸血后，后手也可能看不到新的 HP。
- 这类错误只在同回合内暴露，所以很容易在一般手测里漏掉。

修复状态：

- 已修复
- 已通过 `npm run build` 验证
- 最终仍建议手测覆盖“先手回复/吸血后被后手攻击”的场景

## 本轮修复：云存档 revision 冲突防护与背包重复项

本轮已修改：

- 为 `save_cloud_game_save` 增补“同 revision 只允许幂等重试，不允许覆盖新内容”的保护。
- 新增 Supabase 迁移文件 `202605180002_reject_same_revision_overwrite.sql`。
- 更新 `supabase-setup.sql`，保证全量初始化脚本与迁移逻辑一致。
- 修复地图神秘商人赠送道具时直接追加背包槽位的问题，统一改走 `addInventoryItem` 合并库存。
- 把战斗过场和捕捉动画相关状态接入云存档快照与读档恢复。
- 为老师奖励补上两段式领取；旧后端兼容 fallback 已在后续 0.54 收掉，前端不再主动调用旧 `claim_teacher_rewards`。
- 为商店购买数量和背包加道具数量补上正整数校验。

涉及文件：

- [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4183)
- [supabase-setup.sql](/Users/shihe/Documents/宝可梦养成/supabase-setup.sql:371)
- [202605180002_reject_same_revision_overwrite.sql](/Users/shihe/Documents/宝可梦养成/supabase/migrations/202605180002_reject_same_revision_overwrite.sql:1)
- [OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2513)

验证结果：

- `npm run build`：通过

当前说明：

- 前端背包重复项问题已在本地代码修复。
- 云存档 revision 冲突保护已落到仓库，但只有在后端执行这条新迁移后才会真正生效。
- 战斗过场与捕捉动画状态已经进入云存档，但仍需最后手工回归验证刷新后的恢复表现。

## 阶段 4/5 首轮结果：资源、商店、奖励与存档同步

### 已修复待部署问题 D：相同 revision 的旧请求仍可能覆盖新进度

代码证据：

- 前端保存时使用 `cloudSaveRevisionRef.current + 1` 发送新 revision：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3153)
- 后端原逻辑只拒绝 `< existing_revision`，没有拒绝 `= existing_revision` 的不同 payload：[supabase-setup.sql](/Users/shihe/Documents/宝可梦养成/supabase-setup.sql:374)

根因判断：

- 两个标签页如果都从 revision `5` 开始，先保存的标签会把服务端写到 `6`。
- 另一个旧标签稍后也会发送 revision `6`。
- 原 SQL 只拦截“更小”的 revision，请求等于当前 revision 时仍会被接受，因此旧标签能把新进度覆盖回去。

影响：

- 这是“游玩过程中莫名其妙回退到前一秒钟”的直接高危来源。
- 不需要极端条件，只要出现双标签页、慢网络、晚到请求或重试即可触发。

修复状态：

- 仓库已修复
- 已新增迁移文件
- 远端迁移列表现已确认 `202605180002` 已应用

### 已修复问题 E：神秘商人赠送相同道具会制造重复背包槽位

代码证据：

- 修复前商人赠送直接 `setPlayerInventory(prev => [...prev, slot])`，不会合并同类道具：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4183)
- 背包渲染和使用逻辑又依赖 `itemKey` 唯一、并用 `find` 读取数量：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:1110)

影响：

- 同一 `itemKey` 的重复槽位会造成列表 key 冲突、数量显示不一致。
- 使用道具时 `map(...decrement...)` 会同时命中多个同 key 槽位，存在一次操作扣多份库存的风险。

修复状态：

- 已修复
- 已通过构建验证

### 已修复问题 F：老师奖励领取已改为“预留批次 -> 云存档成功 -> 确认领取”

代码证据：

- 前端现在会把 `pendingTeacherRewardClaim` 放进云存档快照，等快照落库后再调用确认 RPC：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2561)
- 新前端领取链路会先调用 `begin_teacher_reward_claim`，保存批次 token 后再确认：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3415)
- 后端新增 `begin_teacher_reward_claim` / `confirm_teacher_reward_claim` 两个函数：[supabase-setup.sql](/Users/shihe/Documents/宝可梦养成/supabase-setup.sql:1018)
- 迁移文件：[202605180003_teacher_reward_claim_handshake.sql](/Users/shihe/Documents/宝可梦养成/supabase/migrations/202605180003_teacher_reward_claim_handshake.sql:1)

影响：

- 修复前：如果奖励已在后端标记领取，但前端还没成功保存云存档就刷新、断网或崩溃，奖励可能永久丢失。
- 修复后：后端已应用新迁移时，会使用两段式领取，避免“后端已标记领取但云存档没落库”的奖励丢失窗口。

当前判断：

- 仓库里已经完成两段式补偿设计。
- 后续 0.54 已进一步移除前端旧 `claim_teacher_rewards` 回退；如果新 RPC 缺失，前端会明确报错并暂停领取，不再静默走旧链路。

修复状态：

- 代码已修复
- 已新增迁移文件
- 已通过 `npm run build` 验证
- 远端迁移列表现已确认 `202605180003` 已应用

### 已修复问题 G：商店购买、战斗奖励、战斗前扣能量已改为“资源与云存档同事务提交”

代码证据：

- 新增 `save_cloud_game_state_with_resources`，在同一事务内校验 revision、扣/发金币能量、写日志并保存 `game_saves`：[supabase-setup.sql](/Users/shihe/Documents/宝可梦养成/supabase-setup.sql:421)
- 新增迁移文件 `[202605180004_atomic_resource_save.sql](/Users/shihe/Documents/宝可梦养成/supabase/migrations/202605180004_atomic_resource_save.sql:1)`，用于把上述 RPC 部署到现有项目。
- 商店购买已改为优先走原子 RPC，只有该 RPC 异常缺失时才回退旧链路：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4733)
- 野外战斗开战扣能量与战斗状态进入同一次提交：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4629)
- 训练家战斗开战扣能量与战斗状态进入同一次提交：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4825)
- 战斗奖励已改为优先把经验分配后的队伍、成长事件和金币奖励一起提交：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4032)
- 原子 RPC 现在对“同 revision 同 payload 的重试”走幂等返回，不会重复扣金币/能量：[supabase-setup.sql](/Users/shihe/Documents/宝可梦养成/supabase-setup.sql:457)
- 前端原子提交现在会在等待前一笔同步结束后，基于最新快照重新构造要提交的数据，避免连续点击导致“金币扣两次、背包只加一次”的旧快照覆盖：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3585)

影响：

- 修复前：
  - 购买时金币可能已扣，但道具还没成功保存。
  - 战斗奖励时金币可能已入账，但经验、成长事件还没成功保存。
  - 战斗开始时能量可能已扣，但战斗状态、敌方队伍、当前回合未成功保存。
- 修复后：
  - 后端已部署新 RPC，上述链路都会改为单事务提交。
  - 前端仍保留旧 RPC 缺失时的防御性分支，但当前远端迁移列表已确认 `202605180004` 存在。

当前判断：

- 仓库层面已完成第一轮原子化收口，覆盖购买、开战扣能量、战斗奖励三条主链路。
- 这次还顺手补掉了两个隐蔽并发口：
  - 同 revision 幂等重试不会重复扣资源。
  - 连续点击购买/连续触发原子提交时，不会再用等待前的旧快照覆盖等待后的新状态。

验证结果：

- `npm run build`：通过
- `npm run audit:growth`：通过
- `npm run audit:battle`：通过

当前状态：

- 代码已修复
- 已新增迁移文件
- 远端迁移列表现已确认 `202605180004` 已应用

### 已修复待运行时复测问题 H：战斗阶段和捕捉动画状态原本没有进入云存档快照

代码证据：

- 当前已新增 `battlePhase`、`battlePhaseData`、`isThrowingPokeball`、`captureSequenceData` 的归一化与快照字段：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2513)
- 读档恢复时会同步回填这些状态：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:3034)

影响：

- 刷新发生在遭遇过场、胜利过场、逃跑过场、捕捉动画中时，读档后不一定能回到原来的阶段。
- 这类问题更偏运行时恢复一致性，必须放进最终手工回归。

修复状态：

- 代码已修复
- 已通过 `npm run build` 验证
- 最终仍需手工验证“中途刷新后动画是否能平稳恢复或重播”

### 0.55 三维地图补给箱改为穿透拾取，并继续压缩拾取瞬间回闪风险

问题背景：

- 用户反馈地图上的补给箱不该阻挡行走，而且拾取瞬间不应出现整屏闪一下、场景像被重刷的感觉。
- 当前主冒险地图已经走 `three-lowpoly` 渲染路径；这类地图如果继续靠修改 `mapGrid` 上的事件 tile 来控制补给显示，容易把“可见性”“碰撞”“拾取后隐藏”绑在一起，观感会发硬。

本轮处理：

- 三维地图上的 `item` / `pickup` 事件不再把补给箱 tile 覆盖进运行时 `mapGrid`；运行时网格保留底层地形 tile，所以补给箱默认可穿过：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx)
- 三维地图补给显隐改为读取 `world.collectedEventIds`，由 `ThreeLowPolyMap` 的动态事件控制器按事件 ID 直接隐藏/显示，不再依赖“当前格子是不是某个 legacy 事件 tile”：[ThreeLowPolyMap.jsx](/Users/shihe/Documents/宝可梦养成/src/game/ThreeLowPolyMap.jsx)
- 交互判定也同步改为优先看 `collectedEventIds`，避免宝箱已领取后因为格子残留或同步节奏问题再次触发拾取：[ThreeLowPolyMap.jsx](/Users/shihe/Documents/宝可梦养成/src/game/ThreeLowPolyMap.jsx)
- `applyCloudGameData` 现在会先比较新旧 `mapGrid` 内容；如果云端回写后的网格结构完全一致，就复用旧引用，不再因为一次成功拾取提交而额外触发无意义的地图网格替换：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx)

当前判断：

- 从代码链路上看，三维地图补给箱已经满足“可穿过”。
- 拾取成功后的主要可见变化应只剩“补给模型隐藏 + 提示出现”，不该再伴随地图 tile 重铺或渲染器重建。
- 由于本地测试账号在当前环境未登录成功，这一项仍保留为最终手工回归项，需要你在真实可登录账号上再确认一次“踩箱拾取时是否完全无闪屏/无黑帧/无镜头跳变”。

已执行验证：

- `npm run build`
- `node scripts/audit-map-gameplay-flow.mjs`
- `node scripts/audit-region-maps.mjs`

### 0.72 已修复：训练师/部下/Boss 队伍优化已与“试炼解锁生态”规则重新对齐

问题背景：

- 这一轮我们已经把普通训练师、部下训练师、每日变体的阵容逻辑做了显著优化，但这里有一个必须单独兜住的风险：不能因为“阵容更好看”而把试炼连战、隐藏生态解锁、Boss 最终三批守护者这三条链路搅混。
- 旧的 `audit-trial-balance.mjs` 仍然按老规则在审查，错误要求“试炼完成后文案必须写成可继续挑战、不能出现明天刷新”。这与当前产品规则冲突，因为现在试炼已经明确改成“当天完成后锁到次日凌晨刷新”，但隐藏生态解锁进度会持续保留。

本轮处理：

- 已把 `scripts/audit-trial-balance.mjs` 更新到当前真实规则：
  - 不再要求试炼“无限即时复战”旧文案。
  - 改为强制检查 `completedText` / `dailyDefeatedText` 都要明确写出“明天凌晨刷新”“首通奖励不会重复”“隐藏生态按批次继续解锁”。
  - 改为强制检查试炼完成结算确实走 `hasDailyTrainerBattleEvent(nextWorld, completedMapName, completedEventId)` 这条 map-scoped 日锁链路，而不是旧的 `isRepeatableChallenge` 绕过。
- 已把 `scripts/audit-trial-balance.mjs` 扩充为更严格的生态审计：
  - 试炼基础队伍不能混入 `challengeRarePool` 家族之外的物种。
  - 试炼每日变体队伍也不能混入池外家族。
  - 当 `challengeRarePool` 本身有足够多的不同进化家族时，试炼基础队伍和每日变体都不允许重复使用同一家族。
  - Boss 队伍除了必须包含 `bossRarePokemon` 外，非专属位必须仍然来自“试炼最终三批”家族。
- 已补修 `src/game/data/godotMaps/godot_region_maps.js` 中 Boss 最终组队逻辑：
  - 之前 `pickBossTeamSpeciesFromChallengeFinalThreeBatches(...)` 只是简单取前 5 只，导致风车农庄会出现 `飞腿郎 / 快拳郎` 同家族重复，六角遗迹会出现 `水伊布 / 火伊布 / 雷伊布` 连续复用同一家族。
  - 现在改成“先按进化家族优先去重，再在真的不够时回落补位”，确保 Boss 队伍保持最终三批生态来源，同时不再制造难看的重复家族。

修复后审计结果：

- `npm run audit:trials`：通过
- `npm run audit:trainers`：通过
- `npm run audit:trainer-daily-scope`：通过
- `npm run audit:cloud`：通过
- `npm run audit:data`：通过
- `./node_modules/.bin/vite build --emptyOutDir false --outDir /private/tmp/pokemon-build-check`：通过

本轮关键确认结论：

- 试炼现在的真实规则已明确为：
  - 当天完成后，该试炼进入同地图、同事件 ID 的日锁状态。
  - 次日凌晨刷新后可再次挑战。
  - 首通奖励不重复，但 `trainerVictoryCounts` 会保留，用来驱动下一次试炼强度与隐藏生态批次继续推进。
- 普通训练师/部下/Boss 阵容优化不会再把试炼生态链路污染到“池外物种”“跨地图共用完成状态”“最终三批 Boss 队伍重复同一家族”这几个关键风险点。
- 目前试炼生态的静态约束、每日锁作用域、云存档字段、构建产物都已重新收口。

保留为最终手工回归：

- 同一天打完试炼后，立刻再次触发，确认地图提示文案与按钮状态都符合“今日完成，明日刷新”。
- 第二天刷新后再次挑战，确认队伍强度按 `trainerVictoryCounts` 递进，而不是回退到首通强度。
- 每张地图分别验证试炼第 1/2/3/4 批隐藏生态解锁后，草丛只出现当前已解锁批次与 Boss 稀有，不出现未解锁的后批物种。
- 击败 Boss 后再测草丛，确认 `bossRarePokemon` 只在 Boss 解锁后进入候选，不会提前混进试炼稀有池。

### 0.73 已修复：等级进化规则已下沉到数据层，静态审计不再残留“伪非等级进化”

问题背景：

- 运行时的成长逻辑早已统一走“等级进化映射表”，但 `src/utils/gameData.js` 里很多历史分支仍保留 `trade_item / stone / friendship / move_known` 等旧写法，只是在 `pokemonGrowth.js` 内部被折叠成等级触发。
- 这会带来一个很烦的结构错位：游戏实际上按等级进化，但数据审计仍然会报出几十条“非等级进化”，图鉴/说明代码也必须额外兜这些旧字段。

本轮处理：

- 新增共享规则文件 [pokemonEvolutionRules.js](/Users/shihe/Documents/宝可梦养成/src/utils/pokemonEvolutionRules.js:1)，把所有“游戏内统一按等级触发”的进化阈值提到单独来源。
- `src/utils/pokemonGrowth.js` 已改为直接读取这份共享规则，不再把等级映射表写死在成长模块内部：[pokemonGrowth.js](/Users/shihe/Documents/宝可梦养成/src/utils/pokemonGrowth.js:3)
- `src/utils/gameData.js` 现在会在模块加载时把旧进化分支自动补成显式 `level` 字段；旧 `method/item/move/condition` 元数据仍保留，只作为历史兼容/描述性信息存在，不再影响现行等级进化规则：[gameData.js](/Users/shihe/Documents/宝可梦养成/src/utils/gameData.js:1381)
- `EVOLUTION_ITEMS` 的注释也已改成当前真实状态：它们只保留给旧背包和后端白名单兼容，不再作为现行可用进化入口：[gameData.js](/Users/shihe/Documents/宝可梦养成/src/utils/gameData.js:329)

修复后验证：

- `npm run audit:data`：通过，`nonLevelEvolutionCount = 0`
- `npm run audit:growth`：通过
- `npm run audit:trials`：通过
- `./node_modules/.bin/vite build --emptyOutDir false --outDir /private/tmp/pokemon-build-check`：通过

当前结论：

- 现在“所有宝可梦都按等级进化”的规则已经不只是运行时约定，而是被显式写回了实际数据形态。
- 后续再看 `MONSTERS`、图鉴进化链、成长模拟、静态审计时，看到的都是同一套等级化结果，不会再出现“代码说等级进化，数据却像道具/亲密度进化”的分裂状态。

保留为最终手工回归：

- 多分支升级进化时，确认弹出的分支选择仍然正常。
- 升级触发进化的图鉴文案、成长弹窗文案，确认现在统一显示等级条件，不再混入旧的石头/亲密度字样。

### 0.74 已补专项回归：保留“可失去 0 MP 技能”的现行设计，但关键保护链路已纳入自动审计

问题背景：

- 当前产品规则已经明确：玩家可以主动放弃 0 MP 技能，这不是 bug，而是允许的策略选择。
- 真正需要防的是伴随这个设定出现的连锁回归，比如：
  - 进化时把当前技能清空；
  - 学新技能时跳过逐个选择；
  - 忘记 0 MP 技能时没有风险确认；
  - 战斗中 MP 打空没有明确提醒；
  - 战斗中伤药虽然能恢复 MP，但回合、背包、云存档不同步；
  - 后续改 UI 或成长逻辑时，把这些保护悄悄删掉。

本轮处理：

- 新增专项审计脚本 [audit-growth-battle-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-growth-battle-guards.mjs:1)
- 新增 npm 入口 [package.json](/Users/shihe/Documents/宝可梦养成/package.json:29)：
  - `npm run audit:growth-battle-guards`

这条专项审计当前会硬性检查：

- `pendingGrowthEvents` 确实进入默认快照、归一化读档和落地应用链路。
- 进化执行时仍然通过 `evolveMonsterInstance(...)` 保留当前技能，而不是回退成新形态默认招式。
- 进化完成后仍会补排“进化后当级可学的新技能”事件。
- 学技能满 4 格时不会偷偷覆盖，而是要求玩家逐个选择遗忘或放弃。
- 忘记 0 MP 技能时仍然有二次确认和风险文案。
- 战斗中 MP 不足时仍然会显示即时提示，并阻止释放付费技能。
- 战斗中伤药恢复会同时回写 `currentMp`，并且在战斗内正确交回合。
- 敌方 MP 打空时仍然走 “无法行动” 的兜底分支，而不是把战斗状态卡死。

当前验证结果：

- `npm run audit:growth-battle-guards`：通过
- `npm run audit:growth`：通过
- `npm run audit:cloud`：通过

当前结论：

- 你要保留的现行设定本身没有问题，关键是保护链路现在已经从“人工经验”升级成了“有脚本兜底”。
- 以后继续优化这块时，先跑 `audit:growth-battle-guards`，就能第一时间发现是不是把风险提示、技能保留、成长事件持久化或 MP 恢复回合制搞坏了。

### 0.75 无 MP 软锁兜底已补齐，运行时“偷偷塞撞击”也已移除

问题背景：

- 前一轮已经允许“玩家可以主动放弃 0 MP 技能”，这本身是设计选择，不是 bug。
- 但旧实现里还残留一个隐藏补丁：`OriginalGame` 会在运行时直接给没有 0 MP 技能的基础物种塞一个 `tackle`，导致“审计看到的是一套数据，实际打起来又是另一套行为”。
- 更关键的是，如果队伍里所有存活宝可梦都没有可用技能、也没有可恢复 MP 的药剂、训练家战又不能逃跑，界面虽然会提示无 MP，但理论上还是可能在“返回 / 打开队伍 / 再返回”里打转。

本轮处理：

- 已移除 `OriginalGame` 里对 `MONSTERS` 的运行时 `tackle` 注入，避免数据规则和实际行为继续分裂：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx)
- 新增 `hasBattleRecoveryPath(...)` / `canRestoreBattleMpWithInventory(...)`，把“当前队伍是否还存在继续战斗的手段”做成显式判定，而不是只看当前上场位：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx)
- 当战斗进入“我方回合 + 当前宝可梦无可用技能 + 全队无替补可出手 + 背包无可恢复 MP 的药剂 + 当前战斗不可逃跑”时，现在会自动写入日志与提示，并直接进入失败结算，不再允许卡成伪死局：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx)
- 战斗界面的无 MP 提示条也增加了“当前这场会直接判定失败”的醒目警告，避免玩家只看到“去背包 / 去换人”却不知道其实已经没有解法：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx) [index.css](/Users/shihe/Documents/宝可梦养成/src/index.css)
- `audit:growth-battle-guards` 已同步升级，开始守卫两件事：一是不能再偷偷恢复运行时 `tackle` 注入，二是无 MP 死局的自动失败保护不能被后续改动删掉：[audit-growth-battle-guards.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-growth-battle-guards.mjs)

当前验证结果：

- `npm run audit:growth-battle-guards`：通过
- `npm run audit:exp-overflow`：通过
- `npm run audit:mp`：通过，当前没有“满 MP 也放不出任何付费技能”的临界物种
- `npm run build`：待本轮代码改动后复跑确认

当前结论：

- 现在保留“可以失去 0 MP 技能”的设计时，链路已经更自洽了：提示是真的、风险是真的、死局也有收尾，不会再靠隐形补丁撑场面。
- `audit:data` 里仍会看到 `missingZeroCostCoverageCount: 45`，这在当前产品口径下属于“已知设计差异”，不再等同于漏洞；真正要守的是提示、恢复、失败收尾三条保护链路。

## 当前问题清单

### P0

- 暂无已知“仓库已修但远端未部署”的 P0。当前 `supabase migration list` 已确认 `202605180002`、`202605180003`、`202605180004`、`202605190003`、`202605200001` 均在远端。
- 运行时尚未验证“战斗行动检查点刷新恢复、学技能弹窗中刷新/断网恢复、捕捉动画刷新恢复、双标签冲突后的界面恢复”是否与新持久化逻辑完全一致，最终需要继续手工回归确认。逃跑退款 UI 与云端数值一致性、进化弹窗刷新恢复已在本轮用临时账号验证通过；revision 冲突、原子资源提交、老师奖励握手已通过远端 SQL 验证。

### P1

- 现行运行规则已统一改成等级进化；`evolutionItem` 目前仅作为存量存档兼容字段和后端白名单保留，前端新发放入口与可用入口都已关闭。
- 多分支等级进化新增了 `evolutionChoice` 事件类型；最终仍需手工确认“升级后选择进化分支、刷新恢复、连续升级”这些界面级流程。
- 保留“可失去 0 MP 技能”的现行设计后，`audit:data` 里的 `missingZeroCostCoverageCount` 仍是预期内观察值，不作为当前缺陷；真正还要你最后手测的是“无 MP 警告、药剂恢复、自动失败收尾”的实际体验是否自然。
- 当前审计脚本统计宝可梦总数为 `144`；后续扩充宝可梦时仍需同步跑 `audit:data`、`audit:growth`、`audit:battle`，避免图片、技能、进化链路再次漂移。
- 经验药水、普通药水、精灵球、放生、队伍/仓库整理已改为云端优先提交；最终仍要手工确认动画中刷新、弹窗中刷新、同步冲突后的界面恢复表现。
- 多级升级时实例重算仍以初始 `displayBase` 为准，而事件判定会切到进化后的 `growthBase`；当前脚本已验证不出 P0，但这是一个仍应保留观察的 `P1` 结构风险。
- 地图运行时生成文件本轮已通过 `npm run map:build` 重新同步；后续只要改 `godotMapV2.source.json`，必须同时跑 `map:build` 与 `map:audit-runtime`。

### P2

- 暂无已确认 P2。原审计脚本 Vite WebSocket `EPERM` 噪音已在 0.51 清理。

## 下一步执行顺序

1. 做学技能弹窗与捕捉动画浏览器手测：用 `seed-growth-learn-move-browser-test.sql`、`seed-capture-sequence-success-browser-test.sql`、`seed-capture-sequence-failure-browser-test.sql` 稳定进入目标状态，确认刷新恢复一致。
2. 做双标签页冲突和老师奖励领取浏览器手测，确认旧标签页不能覆盖新进度，奖励领取后刷新不会丢也不会重复领。
3. 做真实账号的新手首次进入与重置后二次进入视觉手测，确认抵达阶段叠在真实地图上，且通知不会压住过场。
4. 在真实 Chrome/Safari 中复验返回地图后的 3D 地图渲染，确认不会出现 headless 测试中观察到的地图恢复提示。
5. 如果上述手测稳定，再进入结构治理：拆分 `OriginalGame.jsx`、收敛 `index.css`、决定是否删除 Phaser 旧地图路径。

## 最终手工回归清单（待最后执行）

1. 执行 `seed-growth-learn-move-browser-test.sql`，登录 `audit_recovery_browser / audit123456`，停在学技能弹窗时刷新。
2. 执行 `seed-growth-evolution-browser-test.sql`，登录 `audit_recovery_browser / audit123456`，停在进化弹窗时刷新。（本轮已通过：刷新后弹窗仍在，确认后远端进化为妙蛙草并清空事件队列）
3. 四技能已满时选择遗忘/放弃，再刷新确认事件不会丢。
4. 执行 `seed-capture-sequence-success-browser-test.sql` / `seed-capture-sequence-failure-browser-test.sql`，捕捉动画进行中刷新，确认精灵球、敌方状态、队伍结果是否一致。
5. 胜利过场、逃跑过场、遭遇过场中刷新，确认不会回到异常战斗状态。
6. 战斗行动命中/异常状态/蓄力/吸血/治疗刚完成时刷新，确认 HP、MP、状态、日志和回合归属一致。
7. 草丛遭遇、拾取道具、恢复点、果树、商人、训练家挑战触发后刷新，确认事件结果和玩家位置同时保留。
8. 商店购买成功后立刻刷新，确认金币和背包一致。
9. 领取老师奖励后立刻刷新，确认奖励不会丢。
10. 双标签页同时游玩，确认旧标签页不会覆盖新标签页进度。
11. revision 冲突后点击顶部云按钮或 `CloudSyncBlocker` 按钮，确认动作是“重新读取云端”，而不是再次保存本地旧状态。
12. 新手首次进入、重置后重新进入，在出发/抵达全过程确认无闪烁、通知遮挡或启动页残影。
13. 逃跑过场 `battleEnergyRefundEligible=true/false` 两条路径。（本轮 UI 与云端资格逻辑已通过；测试 seed 的能量数值已从旧的 `4 -> 6` 修正并复验为符合 Lv.1 野外战 1 能量消耗的 `4 -> 5`）

## 代码证据

- 成长事件队列状态定义：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2834)
- 云存档快照当前已经包含成长事件队列：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2622)
- 战斗阶段与捕捉动画状态当前已进入快照与恢复链路：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:2513)
- 战斗奖励实际仍发经验和金币：[OriginalGame.jsx](/Users/shihe/Documents/宝可梦养成/src/components/Game/OriginalGame.jsx:4032)
- 同 revision 冲突判断的后端保护已补到 SQL 迁移：[202605180002_reject_same_revision_overwrite.sql](/Users/shihe/Documents/宝可梦养成/supabase/migrations/202605180002_reject_same_revision_overwrite.sql:46)
- README 中的金币/经验规则现已按当前代码行为对齐：[README.md](/Users/shihe/Documents/宝可梦养成/README.md:73)
- `audit:data` 现已能直接报告缺失的进化条件招式定义与进化道具定义：[audit-game-data.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-game-data.mjs:23)
- `盆才怪 -> 树才怪` 当前已补齐，`盆才怪` 进化目标为 `targetId: 135`，对应 `树才怪`：[gameData.js](/Users/shihe/Documents/宝可梦养成/src/utils/gameData.js:1232)
- 地图运行时生成文件已按源数据重建：[godot_map_v2.generated.js](/Users/shihe/Documents/宝可梦养成/src/game/data/godotMaps/godot_map_v2.generated.js:1)

## 文件索引

- 计划文档：[GAME_SYSTEM_AUDIT_PLAN.md](/Users/shihe/Documents/宝可梦养成/docs/GAME_SYSTEM_AUDIT_PLAN.md)
- 审计记录：[GAME_SYSTEM_AUDIT.md](/Users/shihe/Documents/宝可梦养成/docs/GAME_SYSTEM_AUDIT.md)
- 静态数据脚本：[audit-game-data.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-game-data.mjs)
- 成长模拟脚本：[audit-growth-sim.mjs](/Users/shihe/Documents/宝可梦养成/scripts/audit-growth-sim.mjs)
- 战斗抽样脚本：[battle-balance-audit.mjs](/Users/shihe/Documents/宝可梦养成/scripts/battle-balance-audit.mjs)
