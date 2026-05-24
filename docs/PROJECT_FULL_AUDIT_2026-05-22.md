# 宝可梦养成项目总审核

审计日期：2026-05-22

## 1. 执行摘要

这次总审核的结论很明确：项目已经有一批相当有价值的自动审计、防回档版本号、成长模拟和地图覆盖校验，说明你前面做的很多“全链路收口”不是白做的；但整个项目当前最大的风险已经不在数值细节，而在账号与后端授权模型本身。

当前确认的最高优先级问题有 2 个：

1. `Supabase anon key + 浏览器本地伪会话 + SECURITY DEFINER RPC 信任前端传入 UUID` 这一整套组合，意味着学生资源、云存档、奖励、教师发放动作在授权模型上并不安全。
2. 教师与学生密码以明文形式存储、查询、回传、展示，风险是系统级的，不是单点 UI 问题。

中优先级问题主要集中在 5 个方向：

1. 战斗 AI 与战斗节奏仍有可量化缺陷。
2. 一部分宝可梦仍存在 0 消耗兜底技能缺口、招式稀疏或低交互局面。
3. 地图运行时生成链路仍存在源数据与产物漂移。
4. 主游戏与样式已经进入“超大单文件”区间，维护风险和回归风险都在升高。
5. 自动化治理不完整，当前有大量审计脚本，但缺少统一门禁，导致“脚本失败”和“产物继续被使用”可以同时发生。

整体判断：

- 玩法主干不是失控状态，很多关键链路已经有护栏。
- 安全模型必须先止血。
- 结构治理和自动化门禁需要尽快补上，否则后续继续加内容时，回归成本会继续陡增。

## 2. 审核范围与说明

本次审核覆盖的是一方业务代码、配置、SQL、审计脚本与项目文档，不把第三方依赖和二进制素材伪装成“已逐行审核”。

已覆盖范围：

- `src/`：63 个文件
- `src/components/`：7 个文件
- `src/game/`：27 个文件
- `scripts/`：55 个脚本，结合执行结果与重点源码抽查审计
- `supabase-setup.sql`
- 根目录关键配置与文档：`package.json`、`README.md`、`PROJECT_STATUS.md`、`vite.config.js`、`tailwind.config.js`、`postcss.config.js`

特别说明：

- `src/game/data/godotMaps/godot_map_v2.generated.js` 是 22907 行生成产物。本次没有把它当作手写业务逻辑逐条解释，而是通过其来源文件、引用链和 `map:audit-runtime` / `map:build` 这类运行时校验来审。
- `node_modules/`、`dist/`、图片素材、压缩包、浏览器缓存、外部服务源码不在本次逐行业务审计范围内。
- 当前工作区不是 Git 仓库，缺少提交历史与 blame 上下文，这会降低“问题来源追溯”的精度。

## 3. 项目架构概览

项目是一套单体前端游戏应用，技术栈是 `React 18 + Vite + React Router + Three.js + Supabase JS`，并保留少量 Phaser/旧地图兼容痕迹。

主结构如下：

- 入口层：`src/App.jsx`
- 认证层：`src/utils/authService.js`
- 学生主游戏：`src/components/Game/OriginalGame.jsx`
- 地图渲染：`src/game/GameCanvas.jsx` + `src/game/ThreeLowPolyMap.jsx`
- 老师后台：`src/components/Teacher/Dashboard.jsx`
- 游戏数据与公式：`src/utils/gameData.js`、`pokemonGrowth.js`、`battleDamage.js`、`gameBalance.js`、`trainerBattleScaling.js`
- 地图数据：`src/game/data/godotMaps/godot_region_maps.js`、`src/game/data/godotMaps/godot_map_v2.generated.js`
- 后端接口：`supabase-setup.sql` 中的表、RLS 与 RPC
- 自动审计与生成管线：`scripts/*.mjs`

架构形态上，当前更接近“单体 + 巨型主组件 + 大量脚本守卫”的混合结构：

- 业务边界在数据层和脚本层已经开始出现。
- 运行时状态边界在 `OriginalGame.jsx` 内部仍然高度耦合。
- 后端安全边界设计明显弱于前端功能完整度。

## 4. 本轮已确认较稳的部分

这些不是“没有任何问题”，而是目前没有发现同级别更大的硬伤：

- `npm run build` 可以通过，但产物体积偏大。
- `npm run audit:growth` 通过：14400 个升级模拟场景无经验曲线异常、无属性回退、无多段升级漏进化/漏学招风险。
- `npm run audit:cloud` 通过：当前前端没有再回退到旧的本地优先存档逻辑。
- `npm run audit:trainer-daily-scope` 通过：训练师/试炼每日锁作用域目前没有发现跨地图串号。
- `npm run map:audit-pokemon` 通过：144 只宝可梦都能通过当前地图野生/解锁/进化路径覆盖。
- `npm run map:audit-roads`、`npm run map:audit-warps` 通过：道路可走性和传送连接当前没有明显断裂。
- 云存档 `save_revision` / 同 revision 幂等判定本身设计思路是合理的。当前真正的核心问题不是版本号算法，而是“谁被允许调用这些函数”。

## 5. 自动审计与构建结果

| 命令 | 结果 | 关键结论 |
| --- | --- | --- |
| `npm run build` | 通过 | `dist/assets/index-CMTFtaj2.js` 3.26 MB，`index-B-n0Q3tN.css` 445 KB，已有明显分包压力 |
| `npm run audit:data` | 通过但有告警 | `missingZeroCostCoverageCount = 45` |
| `npm run audit:learnsets` | 通过但有告警 | `sparseByOfficialLevelCount = 402`，`sparseSpeciesCount = 8` |
| `npm run audit:growth` | 通过 | 升级、进化、进化后学招模拟未发现回退 |
| `npm run audit:evolutions` | 通过 | `official-level-match = 40`，`level-override-for-non-level-official = 42` |
| `npm run audit:cloud` | 通过 | 当前云存档前端守卫没有回到旧本地优先模式 |
| `npm run audit:mp` | 通过但有建议 | `criticalIssueCount = 0`，`advisoryIssueCount = 23` |
| `npm run audit:economy` | 通过但有建议 | `fastLevelingScenarioCount = 39`，`moveCostWarningCount = 2`，`moveAffordabilityWarningCount = 3` |
| `npm run audit:difficulty` | 失败 | `aiIgnoredTypeEdgeCount = 256`，`noDamagingMoveCount = 4`，雾湖苇岸野生战 `p90 = 10` |
| `npm run audit:trainers` | 通过 | 训练师/部下/挑战的日变体与层级结构可运行 |
| `npm run audit:trials` | 通过 | 8 张区域试炼的队伍规模和奖励值可读、可产出 |
| `npm run map:audit-runtime` | 失败 | 旧 `44x36` 保留区有 `273` 个非出口格被改变，且区域 `C/E/G/I` 装饰密度失衡 |
| `npm run map:audit-pokemon` | 通过 | 144/144 物种覆盖完整 |
| `npm run map:audit-roads` | 通过 | 可见道路与可走格一致 |
| `npm run map:audit-warps` | 通过 | 9 张地图、22 条传送连接正常 |

## 6. 按优先级列出的全部发现

### P0-1 鉴权与授权模型本身不安全

状态：已确认  
置信度：高

问题是什么：

当前项目不是“真正的服务端身份会话 + 后端按调用者身份鉴权”，而是“前端 localStorage 记住 profile + 浏览器直接拿 anon key 调 RPC + RPC 再信任前端传入的 `p_user_id` / `p_teacher_id`”。

关键证据：

- `supabase-setup.sql:158-160` 的 `users` 表策略 `Public read access for auth` 使用 `USING (true)`。
- `supabase-setup.sql:284-376` 的 `register_table_user` 是 `SECURITY DEFINER`，并对 `anon, authenticated` 开放执行。
- `supabase-setup.sql:428-484` 的 `login_with_table_password` 直接按 `plain_password` 登录，并对 `anon, authenticated` 开放执行。
- `supabase-setup.sql:487-804` 的 `load_cloud_game_save`、`save_cloud_game_save`、`save_cloud_game_state_with_resources`、`clear_cloud_game_save` 都是 `SECURITY DEFINER`，依赖前端传入 `p_user_id`。
- `supabase-setup.sql:807-1543` 中金币、能量、奖励、日志读取等关键 RPC 同样接受显式 UUID，且授予 `anon, authenticated`。
- `src/utils/authService.js:3-4` 写死会话 key 与教师注册码，`52-64` / `90-121` 直接用 `localStorage` 里的 profile 续会话，`189-216` 在 RPC 不可用时还能直接查 `users.plain_password`。

为什么重要：

这不是单个接口漏判，而是系统边界被放在了浏览器里。只要有人拿到公开 anon key，再拿到或猜到用户 UUID，就可能直接读写学生存档、金币、能量、奖励，甚至伪装教师执行部分操作。

影响范围：

- 学生存档
- 金币 / 能量
- 教师奖励
- 学生注册审核
- 操作日志读取

直接风险：

- 任意学生进度被覆盖
- 资源被恶意扣减或发放
- 日志与奖励被伪造
- “回退一秒”这类问题即使前端已经修好，也会被越权写入重新制造

建议动作：

1. 停止把“用户是谁”交给前端传 UUID。
2. 敏感 RPC 改为依赖真实身份上下文，至少使用 `auth.uid()` 或可信后端中转。
3. 将 `SECURITY DEFINER` 的职责收窄，只保留最小必要操作。
4. 如果继续走自定义用户名密码体系，也必须加服务端签发会话，不允许浏览器直接拥有越权能力。

### P0-2 明文密码被数据库、前端和教师后台同时暴露

状态：已确认  
置信度：高

问题是什么：

教师和学生密码当前以 `plain_password` 明文字段存储，且会被查询、返回、展示。

关键证据：

- `supabase-setup.sql:18`、`30` 定义并补齐 `plain_password` 字段。
- `supabase-setup.sql:114` 甚至为 `plain_password` 建了索引。
- `supabase-setup.sql:340` 注册时直接保存 `p_password`。
- `supabase-setup.sql:442-468` 登录 RPC 的返回列里包含 `plain_password`。
- `src/components/Teacher/Dashboard.jsx:250` 查询学生时直接 select `plain_password`。
- `src/components/Teacher/Dashboard.jsx:656`、`692` 在 UI 中展示学生密码。
- `src/utils/authService.js:205-215` 还存在登录回退逻辑，直接拿 `plain_password` 比较。

为什么重要：

这是账号系统最基本的一条红线。一旦数据库、日志、浏览器、录屏、教师端截图、错误上报里任一环节泄露，所有相关账号都会被直接接管。

影响范围：

- 全量老师账号
- 全量学生账号
- 后端数据库
- 教师后台 UI

建议动作：

1. 尽快废弃 `plain_password` 字段与相关查询。
2. 迁移到真实认证系统，或至少使用盐化哈希。
3. 教师后台只保留账号状态与重置能力，不展示任何原密码。

### P1-1 战斗 AI、长战节奏和低交互对局仍有明确问题

状态：已确认  
置信度：高

问题是什么：

`npm run audit:difficulty` 当前直接失败，不是“还有一点优化空间”，而是有确定缺口。

关键结果：

- `aiIgnoredTypeEdgeCount = 256`
- `noDamagingMoveCount = 4`
- `GodotMapV2_MistLake` 野生战 `p90 = 10`

结合当前数据与样本，可以确认的问题包括：

- AI 在相当多的样本里没有优先选择明显更优的克制招式或更强收割线。
- 仍存在无伤害招式战斗配置，当前最典型的是鲤鱼王只会 `splash`、凯西只会 `teleport` 的样本层级。
- 雾湖苇岸的部分野生战明显偏拖。

为什么重要：

这类问题不会立刻炸档，但会非常直接地伤害游玩体感：敌人不聪明、部分对局像空转、部分地图长战拖沓。

建议动作：

1. 继续收敛 AI 评分函数，让类型克制、击杀线、控制技权重更稳定。
2. 对鲤鱼王 / 凯西这类“官方上允许低交互”的个例做显式设计，不要只让玩家白打。
3. 针对雾湖苇岸重新看 encounter 表、物种池和基础招式组合。

### P1-2 一批宝可梦仍缺少稳定 0 消耗兜底，学招稀疏问题仍在

状态：已确认  
置信度：高

问题是什么：

虽然你已经决定保留“玩家可以主动忘掉 0 MP 技能”的设计，并增加确认提醒，但系统层面的兜底空洞还没有完全收干净。

关键结果：

- `npm run audit:data`：`missingZeroCostCoverageCount = 45`
- `npm run audit:learnsets`：`sparseByOfficialLevelCount = 402`，`sparseSpeciesCount = 8`
- 稀疏物种样本包括：鲤鱼王、九尾、3D龙、梦幻、凯西、无畏小子、大舌头、大舌舔
- `npm run audit:mp`：无 critical，但有 `23` 条 advisory，部分恢复/高影响技能可使用次数偏多

为什么重要：

你已经通过 UI 提醒降低了“自己把兜底技能忘掉”的误操作风险，但如果一只宝可梦本身就长期没有好用的 0 消耗兜底，或者 learnset 在若干关键等级层级过稀，玩家还是会碰到：

- MP 空了只能干站着
- 学招阶段选择感太弱
- 某些物种前期或中期战斗非常空

建议动作：

1. 继续处理 `missingZeroCostCoverageCount = 45` 这一批物种，至少给出“有意保留”或“计划补完”的明确名单。
2. 对 8 个稀疏物种逐只判定是否属于故意还原官方低交互，还是当前项目内的可玩性缺口。
3. `audit:mp` 的 advisory 需要转成设计结论，不要停留在“脚本提醒过”。

### P1-3 地图运行时产物和源数据还没有完全锁死一致

状态：已确认  
置信度：高

问题是什么：

地图运行时审计现在仍然失败，说明地图链路还存在“源数据和最终产物没有被门禁锁死”的问题。

关键结果：

- `npm run map:audit-runtime` 失败
- 旧 `44x36` 保留区存在 `273` 个非出口格被改变
- 区域 `C/E/G/I` 装饰密度失衡

为什么重要：

这类问题很容易进一步变成：

- 画面与碰撞不一致
- 某区域道路/出口手感异常
- 线上实际地图与设计源数据不一致

建议动作：

1. 把 `map:build` 与 `map:audit-runtime` 绑成必过门禁。
2. 禁止手改生成产物，只改源数据文件。
3. 对 `44x36` 保留区差异做一次明确判定：是故意改图，还是生成链路漂移。

### P1-4 主游戏与样式文件已经达到高风险体量

状态：已确认  
置信度：高

问题是什么：

`OriginalGame.jsx`、`index.css` 和地图生成产物都已经非常大，当前维护方式对任何后续玩法迭代都不友好。

关键事实：

- `src/components/Game/OriginalGame.jsx`：17552 行
- `src/index.css`：20747 行
- `src/game/data/godotMaps/godot_map_v2.generated.js`：22907 行
- `src/game/data/godotMaps/godot_region_maps.js`：3888 行
- `OriginalGame.jsx` 中约有 `108` 个 `useState`、`75` 个 `useEffect`、`102` 个 `useCallback`
- `src/game/GameCanvas.jsx:39` 使用 `JSON.stringify(mapGrid)` 作为 memo key
- `src/game/GameCanvas.jsx:93`、`src/components/Game/OriginalGame.jsx:11557` 存在 `react-hooks/exhaustive-deps` 忽略
- `npm run build` 产物里 JS 包体积 3.26 MB，CSS 445 KB

为什么重要：

当地图事件、战斗状态机、成长弹窗、云同步、奖励队列都继续叠进一个组件时，任何“小改动”都更容易引出：

- React 状态竞态
- 保存时序回归
- 渲染性能抖动
- 难以稳定复现的交互 bug

建议动作：

1. 先按职责拆，不要按视觉拆。
2. 优先拆出：云存档服务、战斗状态机、成长/学招/进化队列、地图事件控制器、背包与奖励流水。
3. CSS 需要逐步模块化，否则 UI 修一个地方很容易波及别处。

### P1-5 自动化治理不完整，失败的审计没有被真正拦住

状态：已确认  
置信度：中高

问题是什么：

这个项目已经有很多很好的审计脚本，但它们现在更像“手动体检单”，还不是“持续门禁”。

关键事实：

- `package.json` 中已经有大量 `audit:*` 和 `map:*` 脚本。
- 当前没有 `.github/workflows/`。
- 当前没有 ESLint 配置文件。
- 工作区当前不是 Git 仓库，缺少标准提交/回滚上下文。
- 审计脚本里已经存在失败项，但项目仍然可以继续构建、继续运行。
- 既有记录显示，个别审计脚本已经出现“代码已重构，但脚本仍按旧实现查字符串”的老化迹象。

为什么重要：

现在的问题不是“没有脚本”，而是“脚本失败不会形成团队约束”。这会让审计价值快速下降。

建议动作：

1. 至少建立一个最小 CI：`build + audit:data + audit:growth + audit:difficulty + map:audit-runtime + audit:cloud`。
2. 给失败脚本定义责任归属：是产品允许、脚本误报、还是必须修。
3. 清理过时脚本，避免脚本本身制造假安全感。

### P2-1 文档与实际代码状态已经出现漂移

状态：已确认  
置信度：高

问题是什么：

项目说明文档里已经出现结构与规则漂移，后续会直接误导开发和部署。

关键证据：

- `README.md:109-110` 仍写有 `src/hooks/useAuth.js`、`src/hooks/useGameSave.js`，但 `src/hooks/` 当前为空。
- `README.md` 的项目结构说明、启动说明、产品规则与当前代码并不完全同步。
- `PROJECT_STATUS.md:20` 写“战斗、捕获、地图金币点、商人赠送不再直接产出经验或金币”，而 `README.md` 另一处又强调战斗胜利会获得经验与金币，文案边界已经不够清晰。

为什么重要：

现在这个项目已经不是 demo 体量了，文档错误会直接把下一轮开发、部署和回归测试带偏。

建议动作：

1. 把 README 改成“当前真实状态”，不要保留历史阶段说明。
2. 文档按“给玩家 / 给开发 / 给部署”分层，不要混在一个文件里。
3. 游戏规则说明以当前代码和审计脚本为准，避免双重口径。

### P2-2 仓库里存在明显的遗留代码与垃圾产物

状态：已确认  
置信度：高

问题是什么：

当前项目里已经有一些明显不再参与主流程、但仍然留在仓库里的文件，会增加误读和误改风险。

关键事实：

- `src/components/Game/Battle.jsx` 当前没有被主应用导入，`rg` 只在兼容注释中看到对旧接口的提及。
- `src/utils/mapSystem.js` 当前未被 `src/` 其他文件引用，且内容仍是旧的随机迷宫生成逻辑。
- 根目录存在 6 个明显异常的零字节文件：
  - `b2,{x:49,y:64},{x:88,y:62}],[farm-`
  - `b2,{x:72,y:78},{x:88,y:62}],[farm-`
  - `b2,{x:72,y:78},{x:88,y:62}],[j-`
  - `boss,{x:49,y:64},{x:88,y:72}],[h-`
  - `boss,{x:72,y:78},{x:88,y:72}]]; for(const [name,a,b] of pts) console.log(name,runs(a,b));`
  - `j,{x:49,y:64},{x:72,y:78}],[j-`

为什么重要：

遗留代码本身不一定马上出 bug，但它会让后续排查和重构时不断多出“这是不是还在用”的认知成本。

建议动作：

1. 对 `Battle.jsx`、`mapSystem.js` 做一次正式归档或删除确认。
2. 清理根目录异常文件。
3. 给“旧方案 / 兼容方案 / 当前正式方案”做明确标签。

## 7. 当前最值得立即推进的整改顺序

### 第一阶段：先止血

1. 重做账号和 RPC 授权模型。
2. 废弃明文密码。
3. 把最敏感的 RPC 从“信任前端传 UUID”改成“服务端验证调用者身份”。

### 第二阶段：补玩法确定性

1. 收敛 `audit:difficulty` 的 256 个 AI 劣选样本。
2. 处理 4 个无伤害配置与 45 个 0 消耗兜底缺口。
3. 对 8 个稀疏物种给出明确设计判定。

### 第三阶段：补工程门禁

1. 把关键 `audit:*` 和 `map:*` 脚本接入统一门禁。
2. 把地图源数据与生成产物链路锁死。
3. 修正文档漂移。

### 第四阶段：做结构收敛

1. 拆 `OriginalGame.jsx`
2. 拆 `index.css`
3. 清理未使用文件和异常根目录产物

## 8. 最终判断

如果只看“能不能跑”，这个项目已经远远不止能跑。  
如果看“能不能继续安全地长大”，现在最危险的不是地图细节、不是技能参数，而是安全边界和工程边界。

一句话收口：

- 玩法主干：可继续迭代
- 数据成长：总体稳定
- 云存档版本控制：思路正确
- 后端授权：必须立刻重做
- 代码结构：已经到了需要系统治理的时候

这份文档可以作为后续修复与重构的总索引，先按 P0，再按 P1 收口，不建议跳过安全问题直接继续堆内容。
