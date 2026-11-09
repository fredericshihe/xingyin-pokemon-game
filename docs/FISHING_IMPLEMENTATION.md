# 钓鱼实现与后端验证

实现日期：2026-10-10。用户批准完整钓鱼方案，并取消每日抛竿次数上限。每次正式抛竿仍消费一次所选鱼饵，开始时须至少剩余 15 秒游玩时间，遵守既有服务端每日游玩时长与实时租约；不消耗战斗能量。

## 文件与数据归属

- `src/game/fishingCatalog.js`：永久鱼竿、5 档鱼饵、51 种鱼获、6 个钓点、3 位鱼商、难度及固定售价。
- `src/game/fishingRules.js`：前端目录、解锁提示、概率预览、归一化状态与按时间计算的指针。
- `src/game/fishingMapEvents.js`：最终碰撞网格上的六个岸边钓点、三个鱼商和水中落点。
- `src/game/fishingSceneVisual.js`：在现有 Three 地图内驱动人物手臂、鱼竿、鱼线、浮漂、水花和鱼获跃出动作；由地图现有帧循环调度。
- `src/components/Game/FishingOverlay.jsx`：地图底部透明 HUD，只负责选饵、指针、收杆和简短结果；不创建替代地图的水面窗口。
- `src/components/Game/FishingPanel.jsx`：渔具、鱼篓、收藏、出售预览、鉴定与水域图鉴。
- `supabase/migrations/202610100002_fishing_system.sql`：正式目录副本、隔离的钓鱼库存、固定目标会话、操作幂等与唯一 RPC。
- `scripts/verify-fishing-system.sql`：在独立测试数据库执行、最终 `ROLLBACK` 的行为验证。不要在生产数据库运行造玩家夹具。
- `scripts/audit-fishing.mjs` 与 `scripts/audit-fishing-actions.mjs`：目录、时间窗、导航、实际主游戏 RPC 回调的重试、账号变化和慢网同步验证。
- `scripts/review-fishing-experience.mjs`：对真实 Three 地图做桌面/手机取景、非空像素、动态浮漂、鱼获动画、五档庆祝和对应纹理检查。

钓鱼迁移使用 `202610100002`，避免与同日另一任务的 `202610100001_pokemon_release_compensation.sql` 冲突。没有修改其他既有 SQL 迁移，也没有改变默认每日 30 分钟的游玩时长配置。

用户后续确认整个钓鱼过程必须在真实 3D 地图内演出。人物始终留在原岸边；镜头平滑转到人物背后、面向实际水域，关闭后恢复原视角。鱼获有厚度的鱼、虾、蟹及物件实体，并使用每种鱼获独立的本地 SVG 识别素材。附加水纹、水花和动作幅度遵循减少动画偏好，核心指针判定保持不变。六个钓点和三位鱼商均使用地图原交互链路；码头钓点最终位于 `(29,21)`，避开补给箱遮挡。

持有永久竿时零战斗能量仍可在地图行走前往钓点，野生遭遇关闭；训练家和其他战斗仍经过原能量校验。尚无鱼竿的零能量遮罩提供渔具商店入口。钓鱼 HUD 持续计入原游玩会话和时长。

鱼篓、饵和图鉴存于独立 `fishing_accounts`，不由客户端 `game_saves` 快照写入。价格、所遇鱼获和重量由服务端决定。收藏保护已通过后续迁移移除。一般存档的陈旧快照不能覆盖鱼篓。目录、库存、会话与幂等表启用 RLS，撤销 `PUBLIC`、`anon`、`authenticated` 的直接表权限；仅开放 `fishing_action`。内部快照函数不允许客户端直接调用。

## RPC 合同

```text
fishing_action(
  p_user_id UUID,
  p_playtime_session_id TEXT,
  p_request_id TEXT,
  p_action TEXT,
  p_payload JSONB DEFAULT '{}'
) RETURNS JSONB
```

项目现有登录采用学生表密码和不透明游玩会话能力。此 RPC 遵循现行铁木银行的会话模型，没有新增或重复传输密码；读取校验该学生已经存在的准确会话 ID，写入还校验剩余游玩时长和当前有效租约。它不能提升整个项目现有认证模型的强度。

成功响应：

```js
{
  success: true,
  walletGold: 123,
  state: {
    hasRod: true,
    baitUses: { common: 5 },
    catches: { c01: 2 },
    locked: { c01: 1 },
    records: { c01: { firstCaughtAt: '...', count: 2, maxWeight: 0.08, perfectCount: 1 } },
    treasures: [{ id: "逐件UUID", catchId: "t01" }], // 鉴定前无 price；鉴定后带 price、appraisalGrade
    perfectStreak: 0,
    totals: { casts: 3, caught: 2, perfect: 1, sold: 0, earned: 0 },
    activeSession: null // 或下述公开会话
  },
  session: null, // 写响应与 state.activeSession 一致
  result: {} // 按动作
}
```

| 动作 | payload | 结果与约束 |
| --- | --- | --- |
| `state` | `{}` | 允许已存在身份读取，即使租约不活跃；不要求 request ID。过期鱼竿自动关闭。 |
| `purchase` | `{itemId:'fishing_rod'或鱼饵ID,quantity:1}` | 竿 400 金币，唯一永久拥有，赠普通饵 5 次；鱼饵数量指包，1–99 包；采用服务端固定价格、次数和进度解锁。 |
| `start` | `{spotId,baitId,mapId}` | 校验至少剩余 15 秒、存档当前地图、地点及进度；原子扣 1 次饵、累计抛竿 +1、生成唯一固定目标。 |
| `settle` | `{sessionId,elapsedMs}` | `elapsedMs` 是抛竿开始后的总毫秒数，**含等待 `waitMs`**。服务器减去等待再计算指针位置。 |
| `cancel` | `{sessionId}` | 关闭本次竿，不返还已使用的饵。 |
| `sell` | `{merchantId,mapId,catchId,quantity}` 或 `{merchantId,mapId,all:true}` | 固定价原子扣鱼加金币，`result.totalGold` 是本次收入；一键售出跳过未鉴定和该 NPC 不收购的宝藏。 |
| `appraise` | `{merchantId,mapId,treasureId}` | 每件免费随机鉴定一次，保存品相与售价，重试不能重抽。 |

公开会话：

```js
{
  id, spotId, baitId, tier,
  width, seconds, targetCenter,
  waitMs, deadlineMs, elapsedMs, resume: true
}
```

`width`、`targetCenter` 是 0–1 的归一化位置，`seconds` 为单程秒数，`deadlineMs` 为咬钩后指针阶段截止毫秒数，`elapsedMs` 始终为含等待的总耗时。尚未结算的会话不公开 `catchId` 和重量。客户端刷新后继续同一目标，不能重新抽取。

一次操作成功提交不代表钓获成功。`settle` 的脱钩是 `response.success=true`、`response.result.success=false`。操作失败为 PostgREST SQL 异常，中文 `error.message`；应保留云端状态，显示错误，不先在本地扣钱/扣饵/加鱼。网络重试须保留原 request ID 和完全相同的 payload；相同 request ID 更换动作或 payload 会被拒绝。重复结算同一个 session 即使换 request ID 也不会重复发鱼。

客户端每笔操作固定地图、请求编号和参数，并绑定学生与存档 generation；换账号或重载期间到达的旧响应不更新当前界面。`start/state` 单次网络耗时超过 1800 ms 时只额外读取一次现有会话，不重复抛竿；若同步仍慢，HUD 暂停收杆并允许重新同步。快请求仅补最多 80 ms 的交付估计，保持在服务端 100 ms 未来点击容差内。实际网络重试冻结原点击时刻，不移动成功窗口。

## 判定及事务边界

先锁定 `users` 钱包行，再检查并更新独立钓鱼账户；与商店、银行和资源存档使用同一个用户锁。并行抛竿由用户行锁与仅一个 active session 的部分唯一索引共同阻止。

服务端按与前端一致的往返公式判定点击，只允许第一次有效结算；命中后没有第二轮概率失败。完美区域是目标范围中间三分之一，不增加鱼获售价；连续命中从第2次开始获得连击金币（第2次+1、第3次+2，之后每次递增，基础奖励最高+8），连击期间的完美命中再叠加分档奖励（第2–3次+1、第4–5次+2、第6–7次+3、第8次起+4）。普通命中不会中断连击，失手、取消和超时会清零。所有钓获生物均可出售，不再自动保留。重量记录不改变售价。

服务器核对真实经过时间：不允许提前超过 100 ms 的未来点击，允许最多 1800 ms 的最近点击网络送达容差；容差不会扩大命中区域。三次经过截止后，只允许送达截止前的最近点击；超过截止与网络余量后会话过期，不能发鱼或返饵。该检查限制跳未来、过期重放和重复领取，**不能证明玩家没有使用自动化工具**，不宣称反作弊完全解决。

`start`、`sell`、`appraise` 根据已经同步的 `game_saves.currentMapName`（兼容 `world.currentMapName`）校验地图。前端动作前需完成地图快照同步。当前服务端校验到地图和章节进度，没有根据角色精确站立格认证水边或商人距离；实体交互位置由地图运行时负责。

钓鱼金币只写 `users.gold` 与普通 `gold_logs`，不写教师奖励或教学积分。没有每日钓鱼配额、日刷新、卖鱼收入上限或自动挂机循环。已有“重置游戏进度”RPC 没有新增钓鱼删除逻辑，因此重置目前保留钓鱼独立数据；如产品决定重置也清鱼篓，应作为明确的后续数据库变更。

## 已完成验证

前端验证：`npm run build:check`、`npm run audit:fishing` 和 `npm run audit:cloud` 均通过。生产构建保留现有大 chunk 提示，不是构建失败。3D controller 的实体测试确认阶段重复输入不重播、没有修改人物位置、结束恢复朝向、材质与几何完整释放、晚到纹理仍被释放。

浏览器使用独立 Chrome、本地内存预览，无真实玩家变更。最新实际地图执行 30 组检查：6 钓点 × 桌面/手机，以及 9 个鱼获样本 × 桌面/手机，覆盖鱼/虾/蟹/宝藏/杂物与五档庆祝样式。全部 canvas 非空、浮漂动态、鱼获从水到手运动且对应纹理加载成功，最新核心 HUD 保持低于 200 px，浮漂在 HUD 上方，没有横向溢出。手机 390×844、CPU 4 倍节流模拟的地图探针为 59–60 FPS；独立指针一秒采样约 60 FPS、p95 16.8 ms、无长任务。该结果是模拟设备证据，不代表每台实体手机的保证。

历史版本曾验证免费练习；现按用户要求移除该功能。当前保留连点与断网重试只结算一次，取消失败保留原点击时刻，三次经过超时只扣一次饵，14 秒拒新竿 / 15 秒允许，静音和音效阶段一致，慢网时钟暂停后恢复同一目标，首次发现提示只出现一次。截图与报告保存于 `/private/tmp/fishing-final-qa` 和 `/private/tmp/fishing-ui-review`，可用下列命令重新生成：

```sh
npm run audit:fishing
node scripts/review-fishing-experience.mjs http://127.0.0.1:5182 /private/tmp/fishing-final-qa
```

本地 PostgreSQL 17 中实际执行迁移、重复应用迁移及回滚式 SQL 验证。最初使用最小依赖检查 SQL，随后替换为仓库正式 `202607180002_enforce_live_playtime_lease.sql` 中的 `settle_student_playtime_session` 和 `student_playtime_lease_is_valid` 函数，复核真实 15 秒租约和时长耗尽行为。

验证覆盖：

- 51 条目录与客户端价格、重量、物种钓点、鱼饵概率、难度完全一致。
- 鱼竿仅购一次、附赠饵、鱼饵包次数、金币不足和未解锁商品不改变库存。
- 错身份、跨地图、未开放钓点、活跃竿重复启动及未获准鱼饵被拦截。
- 相同 request 重试只扣一次；换 payload 被拒；同 session 换 request 结算不重复发鱼。
- 指针命中/完美/失误、未来点击、陈旧点击、鱼饵耗尽、cancel 和超时不返饵。
- 第 51 次抛竿仍可用，证明不存在旧提案的每日上限。
- 首次珍稀锁定、解锁、超售、服务端固定售价、出售后图鉴记录保留。
- 一键出售排除锁定/未鉴定物，鱼商鉴定能力校验，高级宝藏在海岸固定价出售。
- 直接表/内部函数权限、真实过期租约、时长耗尽阻止写入；不足 15 秒禁止开竿且不扣饵，刚好 15 秒允许开竿，不足 15 秒仍可在有效租约下购买。
- 两个真实数据库连接同时发起不同抛竿请求：只有一个成功，结果是 `baitUses.common=4`、`totals.casts=1`、active session 数为 1。

本地 SQL 测试与浏览器演出验收分别进行。迁移首次执行时不会批量修改现有玩家；玩家首次读取时才懒创建自己的钓鱼账户。

## 临时 PostgreSQL 复现

需 PostgreSQL 17（macOS Homebrew 可用 `brew --prefix postgresql@17` 找到）。全程使用独立目录与 Unix socket，不连接线上数据库。以下示例从仓库根执行，临时目录不得复用业务数据库路径。

```sh
FISHING_PG_BIN="$(brew --prefix postgresql@17)/bin"
FISHING_TEST_DIR="$(mktemp -d /private/tmp/fishing-audit.XXXXXX)"
"$FISHING_PG_BIN/initdb" -D "$FISHING_TEST_DIR/data" -A trust -U fishing_test --no-locale --encoding=UTF8
"$FISHING_PG_BIN/pg_ctl" -D "$FISHING_TEST_DIR/data" -l "$FISHING_TEST_DIR/server.log" -o "-k $FISHING_TEST_DIR -p 55463 -c listen_addresses=" start
```

在临时文件中创建最小依赖及当前真实时长函数；不替换仓库或生产函数：

```sh
python3 - "$FISHING_TEST_DIR/bootstrap.sql" <<'PY'
import pathlib, sys
source = pathlib.Path('supabase/migrations/202607180002_enforce_live_playtime_lease.sql').read_text()
start = source.index('CREATE OR REPLACE FUNCTION settle_student_playtime_session(')
end = source.index('REVOKE ALL ON FUNCTION student_playtime_lease_is_valid(UUID, TEXT, BOOLEAN)')
base = """
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE users(id UUID PRIMARY KEY,role TEXT NOT NULL,gold INT NOT NULL DEFAULT 500,
  daily_playtime_limit_minutes INT NOT NULL DEFAULT 30,registration_status TEXT DEFAULT 'approved');
CREATE TABLE gold_logs(student_id UUID REFERENCES users(id),amount INT,reason TEXT,balance_after INT);
CREATE TABLE game_saves(user_id UUID PRIMARY KEY REFERENCES users(id),game_data JSONB DEFAULT '{}');
CREATE TABLE student_playtime_sessions(student_id UUID PRIMARY KEY REFERENCES users(id),
  session_id TEXT,play_date DATE,active BOOLEAN,last_heartbeat_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),ended_at TIMESTAMPTZ);
CREATE TABLE student_playtime_daily(student_id UUID REFERENCES users(id),play_date DATE,
  played_seconds INT DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),PRIMARY KEY(student_id,play_date));
"""
pathlib.Path(sys.argv[1]).write_text(base + source[start:end])
PY
"$FISHING_PG_BIN/psql" -h "$FISHING_TEST_DIR" -p 55463 -U fishing_test -d postgres -v ON_ERROR_STOP=1 \
  -f "$FISHING_TEST_DIR/bootstrap.sql" \
  -f supabase/migrations/202610100002_fishing_system.sql \
  -f scripts/verify-fishing-system.sql
"$FISHING_PG_BIN/pg_ctl" -D "$FISHING_TEST_DIR/data" stop -m fast
```

成功输出 `Fishing SQL verification passed...` 和 `ROLLBACK`。在受限环境下，Postgres 的共享内存和 Unix socket 可能需要允许本地测试进程运行；这与远端迁移批准是不同动作。

## 部署交付边界

按现有项目 Supabase 链接部署；先检查 `supabase migration list` 和 `supabase db push --dry-run`，只应用审查过的待处理迁移，再执行 `supabase db push`。CLI 可能一起应用其他任务的待处理迁移，不能仅根据文件名就默认全部获准。数据库应用后检查 `fishing_action(uuid,text,text,text,jsonb)` 是否存在，再进行真实浏览器和测试学生验收。

本次凭据检查只读取键名并检查 CLI API 登录能力，没有输出秘密。主任务已通过现有 Supabase CLI Management API 应用钓鱼专用事务 bundle；只读核验结果为 `migration_applied=true`、`rpc_present=true`、`catch_count=51`。数据库已应用 `202610100002`，未连带部署其他本地迁移。正式站点前端尚未发布；本地开发预览为 `/fishing-preview`，使用内存数据，不写真实账号。

发布后的 RPC 公开入口已用不存在的测试 UUID 确认正确拒绝（`玩家不存在`）；匿名角色有公开操作权限，不能直接读写钓鱼库存，也不能调用内部快照函数。没有在远端创建测试玩家或执行测试 SQL 夹具。

### 当前只读部署检查与专用 bundle

2026-10-10 的只读检查中，`migration list --linked --dns-resolver https` 与 `db push --dry-run` 均因 direct 数据库域名无有效 IP 答案失败；这不能证明 CLI 未登录。`supabase db query --linked` 通过管理 API 可用，实际读取到当前远端最新迁移 `202610100001`，且时长函数、租约函数和会话表均存在，钓鱼 RPC 尚不存在。

迁移历史与当前目录存在其他任务/手工历史差异，因此不能用 `--include-all` 一并部署。为主任务准备了 `/private/tmp/fishing-deploy.sql`，仅含钓鱼 `202610100002` 和同事务迁移历史记录。它先取得 advisory transaction lock，校验该版本尚未记录且 `fishing_action` 尚未存在，然后执行原始钓鱼迁移并记录 `version` / `name` / 完整源 `statements`，最后提交和通知 PostgREST。这份 bundle 已在新建的本地 `fishing_deploy` 数据库真实应用、确认历史记录和重跑行为测试，全部通过。

这份文件只用于当前已确认的链接项目，主任务验收后再使用：

```sh
supabase db query --linked --dns-resolver https -f /private/tmp/fishing-deploy.sql
```

主任务已执行上述钓鱼专用远端写入并确认成功。重复执行会被 guard 明确拒绝，应改为只读检查已部署版本，而非删除历史或绕过 guard。


## 2026-10-10 界面整合

传统商店增加“渔具”分栏，直接使用同款商品卡购买永久鱼竿与五档鱼饵。背包按物品类型切换同款分栏，独立钓鱼库存放在“鱼篓”中，可查看鱼饵库存与水域图鉴。地图主界面不再有单独鱼篓按钮。旧 `fishingShop` / `fishBasket` 存档视图继续显示对应商店或背包分栏。

鱼篓提醒鱼商位于新手山谷、雾湖苇岸和贝壳海岸。出售和鉴定仅在地图鱼商交易入口展示，前后端都校验商人地图。钓点 HUD 已移除练习，标题、卡片和按钮沿用商店风格；地图 3D 演出和指针保持原玩法。首次进入钓点的自动库存读取可能与点击购买重叠，现在鱼竿购买等待在途读取后执行，仍阻止重复购买，并显示加载、购买及成功反馈。失败可直接再次购买。

图鉴卡片直接标明地图名称，“查看钓点”展开地图与对应钓点的关系；完整地点提示适用于未发现鱼获。鱼篓只展示数量、稀有度与售价；重量及累计记录放入图鉴的“钓获纪录”。渔具去除重复次数、赠品与永久拥有说明。


最新背包渔具包含“鱼篓、鱼饵、图鉴”三项；鱼饵根据现有总次数折算完整包数和已拆包余饵，如 25 次普通饵显示 2 包 + 5 次余饵、还能钓 25 次。不新增重复库存字段。鱼商只显示鱼篓，可按次卖一件，或按整篓总价一键出售全部可售鱼获。商店按次买一包。没有数量输入和面板成功提示，保留顶部通知、卡片反馈与错误重试。筛选使用内联按钮，避免下拉遮挡。

`202610100003_remove_fishing_collection.sql` 清理旧 locked 字段、删除 lock 动作与自动保护，保存现有鱼获、图鉴和余额。`202610100004_fishing_double_difficulty.sql` 将五档目标宽度减半、单程时间减半，新竿的点击机会时长约原来四分之一；已有会话保留原目标。两条迁移均经隔离回滚测试后已应用至关联后端，函数旧摘要与迁移记录原子校验，前端已发布。

五档庆祝在真实地图鱼获落手处渲染：普通光点、不常见涟漪、稀有星芒、珍稀旋转光环、传说金色冠环。固定几何和粒子缓冲最多 48 粒子、4 个绘制对象，减少动画模式削减到最多 8 光点；结束与卸载完整清理。每个结果只播放一次，动画不提交奖励或改变判定。

本轮修复了队伍页引用缺失 `handleReorderTeam` 的报错；排序回调重读当前云端队伍、验证 ID 集合并只改顺序，拒绝战斗、重复和陈旧 ID。冒险道具审计覆盖该回调、战斗道具分栏限制与伤药可用性。最新商店/背包/鱼商交互截图和报告位于 `/private/tmp/fishing-ui-tabs-qa`，最新地图30例报告位于 `/private/tmp/fishing-ui-map-regression`。


## 本轮发布：连击、逐件鉴定与教师记录

`202610100005_fishing_combo_treasure_logs.sql` 已经部署到关联后端。现有未出售宝藏转换为独立待鉴定实例，旧物种级鉴定标记移除；钱包、鱼饵、普通鱼获和图鉴记录保留。新宝藏在成功钓获时生成UUID。每件随机鉴定仅执行一次，原子保存价格和品相；服务端拒绝未鉴定出售、串玩家鉴定、换参数重试和重复支付。客户端目录中的宝藏固定价格已删除，钓获时仅显示待鉴定，图鉴不显示售价。单件出售传 treasureId，整篓出售只计算已经鉴定且商人接受的宝藏。

五档鉴定：普通50%（0.5–1倍）、优良30%（1.25–2倍）、珍贵15%（2.5–4倍）、极品4%（6–10倍）、罕世1%（15–30倍），区间内按整数均匀随机。基准价值只保留在私有服务端目录。鉴定动画按品相改变光色、星芒和音效，结果在当前滚动区域顶部短暂展示。

连击：第1次无额外金币；第2次命中+1、第3次+2，之后基础奖励逐次递增并在+8封顶；完美命中按连击档位额外增加+1（第2–3次）、+2（第4–5次）、+3（第6–7次）或+4（第8次起），连续10次全部完美累计68金币。普通命中会保持连击，失手、取消和超时中断；换地图与换饵不清零。钱包、连击、鱼获和日志同事务提交，重复会话结算不增加奖励。3/5/8次逐级增强地图上的金色提示和单次实例化绘制的金币飞入效果。高档难度在上一版减半后再将宽度与单程时间乘0.9：稀有0.09/1.08秒、珍稀0.0675/0.99秒、传说0.0495/0.9秒；在途会话保留已保存目标。

全部正式钓鱼操作由RPC写入学生游玩日志，前端移除重复上报。教师端新增钓鱼筛选，能看购买、抛竿、收杆与连击金币、取消超时、鉴定品相价格、出售数量与收入，沿用原教师与学生归属权限。`scripts/verify-fishing-rewards.sql` 在隔离回滚事务中覆盖概率边界、价格范围、连击幂等、逐件身份、教师完整日志与跨教师拒绝；`scripts/audit-fishing-rewards.mjs` 验证前端隐藏价格、库存分组、整篓总价与教师实际记录组件。

全部51种鱼获及商店背包物品提供englishName，商店、背包、鱼篓及钓获结果以中文为主、英文为辅。图鉴保留名称、等级、种类与地图定位，移除查看钓点和钓获记录展开项。

战斗水系背景移动根因是主题类位于整个场景而循环位移动画错误应用到该类；改为仅动画装饰水纹层。桌面手机针对水系与其他对手，验证待机和攻击结束后场景与背景矩形坐标保持不变。

正式发布使用 `VITE_BASE_PATH=/ npm run build` 和 `npx gh-pages -d dist`，CNAME保持pokemongame.site。脏工作区构建ID带时间后缀，避免多次未提交发布共用缓存版本。最新双端连击鉴定截图位于 `/private/tmp/fishing-v2-browser-qa`，30个实际地图案例位于 `/private/tmp/fishing-v2-map-review`，固定背景验证位于 `/private/tmp/battle-background-stability`。


发布完成：2026-10-10，https://pokemongame.site/。按要求执行根路径正式构建与gh-pages发布，验证11项通过、0警告、0错误。线上与本地 buildId 为 `014a47d-wmv2fzvbv`，入口哈希 `38FP66XH`，CNAME为pokemongame.site。全部物品中英文名称和简化图鉴已包含于本次构建。

## 2026-10-11 连续命中奖励更新

`202610100006_fishing_combo_hit_rewards.sql` 已部署到正式 Supabase，仅更新本次钓鱼规则与对应迁移历史。专用事务 bundle 校验旧 RPC 哈希 `eca15256787083c073ab4bc3256f62ac` 后应用，新 RPC 哈希为 `d85c7d6faa80f9ff8a1304442b26b898`。旧完美连击作为当前命中连击的初值保留；`perfectStreak` 仅作为旧客户端兼容字段镜像 `hitStreak`。新结果区分 `hitBonusGold` 和 `perfectBonusGold`，金币与教师日志由服务端原子提交。

通过 `npm run audit:fishing`、奖励 SQL 和完整系统 SQL 隔离回滚验证。桌面与手机共12项真实地图交互用例覆盖普通命中奖励、普通命中保留连击、完美额外加成、失手清零与金币飞入特效，无页面报错和横向溢出；截图和报告位于 `/private/tmp/fishing-hit-combo-qa`。正式数据库未创建测试账号。

执行 `VITE_BASE_PATH=/ npm run build`、`npx gh-pages -d dist` 和 `npm run verify:deploy -- https://pokemongame.site/`。线上验证11项通过、0警告、0错误；线上和本地 buildId 为 `014a47d-wmv2mcjls`，入口哈希 `BnYBlN0R`，Service Worker 缓存版本一致，CNAME为pokemongame.site。
