# 宝可梦队伍与仓库系统升级详细设计文档

## 1. 文档目标

本文档用于规划「出战队伍上限 + 仓库 + 获得宝可梦时的安置流程 + 宝可梦管理界面」的完整升级方案，作为后续开发迭代的唯一设计依据。

本次升级的核心目标：

- 出战队伍最多 **6** 只宝可梦，与经典宝可梦规则一致。
- 超出部分存入 **仓库**（上限 **100** 只），不再无限堆在 `playerTeam` 里。
- 地图入口将原「队伍」改为 **「宝可梦」**，内部分 **队伍 | 仓库** 双 Tab 管理。
- 捕捉、老师奖励等所有「获得宝可梦」入口走统一逻辑。
- **道具使用（回复药、经验药水）只能作用于出战队伍**，仓库内宝可梦不可直接使用道具（需先取出到队伍）。
- 队伍满员时捕捉成功，提供明确的安置选项，含 **允许放弃野生宝可梦**（带二次确认）。

本文档与 `docs/MAP_GAMEPLAY_UPGRADE_PLAN.md` 互补：地图玩法文档中的 Boss 奖励、训练师奖励等，在落地时必须调用本文档定义的 `acquireMonster` 流程。

---

## 2. 产品决策摘要（已确认）

| 项目 | 决策 |
|------|------|
| 地图入口文案 | 「宝可梦」（原「队伍」） |
| 管理界面结构 | 单页双 Tab：**队伍 \| 仓库** |
| 出战队伍上限 | `MAX_PARTY_SIZE = 6` |
| 仓库上限 | `MAX_STORAGE_SIZE = 100` |
| 队伍最少保留 | `MIN_PARTY_SIZE = 1`（放生、存入仓库时校验） |
| 道具使用范围 | **仅出战队伍**；仓库宝可梦不可作为道具目标 |
| 满员捕捉 — 放弃野生 | **允许**，需二次确认；优先引导入仓/替换，放弃为最后手段 |
| 战斗中换人 | 仍只显示 **出战队伍**（最多 6），不能从仓库直接上场 |
| 遇敌等级 / 平均等级 | 仍只按 **出战队伍** 计算，不含仓库 |

---

## 3. 当前代码现状

### 3.1 相关文件

| 模块 | 路径 | 现状 |
|------|------|------|
| 主游戏逻辑 | `src/components/Game/OriginalGame.jsx` | `playerTeam` 数组，无上限、无 `storageBox` |
| 云存档 | `createDefaultCloudGameData` / `createCloudSnapshot` / `normalizeCloudGameData` | `schemaVersion: 3`，仅 `playerTeam` |
| 捕捉成功 | `handleCaptureSequenceComplete` | 直接 `setPlayerTeam([...prev, caughtMonster])` |
| 捕捉文案 | `CaptureSequenceOverlay` | 固定「已加入你的队伍」 |
| 老师奖励 | `addRewardMonster` | 同样追加到 `playerTeam` |
| 队伍 UI | `TeamScreen`（`view === 'team'`） | 网格 + 调序 + 放生 |
| 背包 UI | `UnifiedBagScreen` | 药水选目标时 `team`  prop 来自 `playerTeam` |
| 地图按钮 | `GameCanvas.jsx`、`ThreeLowPolyMap.jsx` | 文案为「队伍」 |
| 战斗换人 | `BattleScene` 内 `TeamScreen` | `onSelect` 模式，仅 `playerTeam` |
| 平均等级 | `getPlayerAverageLevel`（`src/utils/gameBalance.js`） | 仅接收 `playerTeam` |

### 3.2 当前问题

1. 玩家可无限捕捉，队伍越来越长，UI 与战斗逻辑难以维护。
2. 无「仓库」概念，无法整理收藏。
3. 老师发宝可梦、未来地图 Boss 奖励会与捕捉产生相同的数据堆积问题。
4. 背包选目标虽名义上是队伍，但若未来误传 `party + storage` 合并列表，会破坏平衡（仓库满级怪吃药等）。

---

## 4. 核心概念定义

### 4.1 出战队伍（Party）

- 字段名保持 **`playerTeam`**（减少全项目重命名成本）。
- 语义：**当前可出战、可用药、可换人的宝可梦列表**。
- 数量：`1 ≤ playerTeam.length ≤ 6`（开局选宠后为 1，之后最多 6）。
- `activePlayerId`：当前首发，**必须**存在于 `playerTeam` 中。
- 队伍顺序：第 1 格为默认首发（与现有 `handleReorderTeam` 行为一致：调序后 `newTeam[0]` 成为 `activePlayerId`）。

### 4.2 仓库（Storage Box）

- 新字段：**`storageBox: MonsterInstance[]`**。
- 语义：已拥有但未出战的宝可梦。
- 数量：`0 ≤ storageBox.length ≤ 100`。
- 不参与战斗、不参与遇敌等级计算、不能作为道具目标。
- 可取回到队伍（队伍未满），或与队伍某只 **互换**。

### 4.3 宝可梦实例 ID

- 队伍与仓库中的实例共用全局唯一 `id`（继续 `p${timestamp}_xxx` 规则）。
- 任意时刻，同一只实例 **只能** 存在于队伍或仓库之一，不能重复。

---

## 5. 界面方案：「宝可梦」双 Tab

### 5.1 地图底部入口

将地图操作栏（`GameCanvas.jsx`、`ThreeLowPolyMap.jsx`）中的：

- 原文案：**队伍**（`fa-users`）
- 新文案：**宝可梦**（建议图标 `fa-paw` 或 `fa-dna`）
- `view` 建议保持 `'team'` 或改为 `'pokemon'`（实现时二选一，全文以 `'team'` 代指该 view，减少 diff）

点击后进入 **`PokemonManagementScreen`**（新建，或重构 `TeamScreen`）。

### 5.2 页面结构

```
┌─────────────────────────────────────┐
│  ← 返回        宝可梦管理              │
├─────────────────────────────────────┤
│  [ 队伍 (3/6) ]  [ 仓库 (12/100) ]   │  ← Tab 切换
├─────────────────────────────────────┤
│  （当前 Tab 的 CollectionGrid）      │
│  卡片：立绘、名字、等级、HP/经验条     │
│  队伍 Tab：出战标记、顺序上/下         │
│  仓库 Tab：无出战标记、无调序         │
└─────────────────────────────────────┘
```

### 5.3 队伍 Tab 能力（保留并扩展）

| 能力 | 说明 |
|------|------|
| 查看详情 | 属性、技能、HP/MP/经验 |
| 调整顺序 | 上移/下移，第 1 格 = 首发 |
| 放生 | 队伍 > 1 时可放生；战斗中禁止 |
| 存入仓库 | 队伍 > 1 且仓库 < 100 |
| 使用经验药水 | 仅队伍 Tab 内（与详情/背包一致） |
| 出战标记 | 显示当前 `activePlayerId` |

### 5.4 仓库 Tab 能力

| 能力 | 说明 |
|------|------|
| 查看详情 | 只读展示（等级、属性、技能） |
| 取出到队伍 | 队伍 < 6 时 |
| 与队伍互换 | 弹出选择队伍中一只进行 1:1 交换 |
| 放生 | 允许；仓库可为空 |
| 使用道具 | **不提供**（见第 8 节） |

### 5.5 战斗中的「队伍」按钮

- 战斗 UI（`BattleScene`）按钮文案可仍为 **「队伍」** 或改为 **「换人」**，避免与地图「宝可梦」入口混淆。
- 行为不变：仅列出 **出战队伍中未濒死** 的宝可梦进行换人。
- **不** 打开双 Tab 管理页，不显示仓库。

---

## 6. 数据结构与存档

### 6.1 schemaVersion 升级：3 → 4

```js
{
  schemaVersion: 4,
  playerTeam: [],           // 出战队伍，最多 6
  storageBox: [],           // 仓库，最多 100
  activePlayerId: null,
  nextPlayerMonsterId: 100,
  pendingMonsterAcquisition: null,  // 可选，见 6.4
  // ... 其余字段不变
}
```

### 6.2 修改位置

| 函数 | 文件 | 改动 |
|------|------|------|
| `createDefaultCloudGameData` | `OriginalGame.jsx` | 增加 `storageBox: []`，`schemaVersion: 4` |
| `createCloudSnapshot` | 同上 | 序列化 `storageBox` |
| `normalizeCloudGameData` | 同上 | 见 6.3 |
| `applyCloudGameData` | 同上 | `setStorageBox` 状态 |

建议新增 React state：`const [storageBox, setStorageBox] = useState([])`。

### 6.3 旧存档迁移（normalize）

1. 无 `storageBox` → `[]`。
2. 若 `playerTeam.length > 6`：前 6 只保留在 `playerTeam`，其余按原顺序移入 `storageBox`（若超出 100，按策略截断并打日志，见 8.6）。
3. `activePlayerId` 不在 `playerTeam` → 设为 `playerTeam[0]?.id ?? null`。
4. `showLaunchScreen`：仍为 `playerTeam.length === 0`（**不看仓库**）。
5. 校验每只实例 `id` 唯一；重复则保留队伍侧、删除仓库重复项。

### 6.4 待安置状态（断线保护）

当捕捉/奖励成功但玩家尚未选择「替换 / 入仓 / 放弃」时：

```js
pendingMonsterAcquisition: {
  monster: MonsterInstance,
  source: 'capture' | 'teacher_reward' | 'map_reward',
  createdAt: string  // ISO
}
```

- 写入云存档，刷新后可恢复弹窗。
- 安置完成后置 `null`。
- 若同时存在 `captureSequenceData` 与 `pendingMonsterAcquisition`，以 **pending 优先** 展示安置 UI。

### 6.5 Supabase

- 短期：**不必改表**，仍存于 `game_data` JSONB。
- 可选后期：在 `save_cloud_game_save` RPC 中校验 `playerTeam.length <= 6`、`storageBox.length <= 100`。

---

## 7. 统一业务层：`src/utils/pokemonRoster.js`

所有增减、移动宝可梦 **必须** 经此模块，禁止在 UI 里直接 `setPlayerTeam([...])` 追加捕捉结果。

### 7.1 常量（也可放在 `gameBalance.js`）

```js
export const MAX_PARTY_SIZE = 6
export const MAX_STORAGE_SIZE = 100
export const MIN_PARTY_SIZE = 1
```

### 7.2 核心 API

| 函数 | 说明 |
|------|------|
| `countParty(team)` | 队伍数量 |
| `countStorage(box)` | 仓库数量 |
| `findMonsterById(party, box, id)` | 在两侧查找 |
| `acquireMonster(ctx, monster, options)` | **获得宝可梦总入口** |
| `depositToStorage(ctx, partyId)` | 队伍 → 仓库 |
| `withdrawToParty(ctx, storageId)` | 仓库 → 队伍 |
| `swapPartyAndStorage(ctx, partyId, storageId)` | 1:1 互换 |
| `replacePartyMember(ctx, partyId, incomingMonster)` | 替换：旧只入仓，新只入队 |
| `releaseMonster(ctx, id, { from: 'party' \| 'storage' })` | 放生 |
| `reorderParty(ctx, newOrder)` | 仅队伍排序 |
| `sanitizeRoster(party, box)` | 迁移/校验用 |

`ctx` 建议包含：`playerTeam`, `storageBox`, `setPlayerTeam`, `setStorageBox`, `activePlayerId`, `setActivePlayerId`, `nextPlayerMonsterId`, `setNextPlayerMonsterId`。

### 7.3 `acquireMonster` 决策树

```
获得新宝可梦 monster
│
├─ 队伍 < 6
│   └─ 加入 playerTeam
│       └─ 若 activePlayerId 为空 → 设为新宝可梦
│       └─ 返回 { outcome: 'party', slot: n }
│
└─ 队伍已满（6/6）
    │
    ├─ 仓库 < 100
    │   └─ 返回 { needsDecision: true, options: ['replace', 'storage', 'release'] }
    │
    └─ 仓库已满（100/100）
        └─ 返回 { needsDecision: true, options: ['replace', 'release'] }
            （无「直接入仓」）
```

**注意：** `needsDecision: true` 时不应立即写入 `playerTeam`/`storageBox`，应先弹窗；玩家确认后再调用 `replacePartyMember` / `addToStorage` / `releasePendingWild`。

---

## 8. 道具使用边界（重点）

### 8.1 原则

> **所有消耗品对宝可梦的效果，目标集合 = `playerTeam` 且仅 `playerTeam`。**

仓库中的宝可梦：

- 不能使用回复药、经验药水。
- 不能在战斗中被切换上场。
- 不能参与 `gainExpAndLevelUp` 的目标查找（除非先取出到队伍）。

### 8.2 涉及入口清单

| 入口 | 文件/组件 | 当前数据源 | 升级后要求 |
|------|-----------|------------|------------|
| 地图背包 | `UnifiedBagScreen` 的 `team` prop | `playerTeam` | **保持** `team={playerTeam}`，禁止传入 `[...playerTeam, ...storageBox]` |
| 战斗背包 | `BagScreen` → `UnifiedBagScreen` | `playerTeam` | 同上 |
| 回复药 | `handleUsePotion` | `setPlayerTeam` 内 find | 仅 find `playerTeam`；找不到则提示「只能对出战队伍使用」 |
| 经验药水 | `handleUseExpPotion` | `playerTeam.find` | 同上 |
| 队伍页用药 | `TeamScreen` + `playerInventory` | 仅 `team` prop | `team` 必须仅为 `playerTeam` |
| 地图治疗点 | `handleMapHeal` 等 | 恢复 `playerTeam` | 第一版：**仅恢复出战队伍**；文档记录「是否同时恢复仓库」为可选 P2 |
| 战斗失败恢复 | `handleDefeatContinue` | 恢复队伍 | 仅 `playerTeam` |

### 8.3 UI 防呆

1. **背包选目标弹窗**标题保持「选择目标」，副标题可增加小字：**「仅出战队伍」**。
2. 若 `playerTeam.length === 0`（不应出现在正常游戏），显示空状态，不展示仓库。
3. 仓库 Tab **不出现**「使用药水」按钮。
4. 若未来做「PC 治疗机」恢复仓库，应单独实现 `healAllStorage()`，与道具系统分离，避免绕过「经验只能药水 + 仅队伍」的经济设计。

### 8.4 代码守卫（建议）

在 `handleUsePotion` / `handleUseExpPotion` 开头增加：

```js
const inParty = playerTeam.some(m => m.id === monsterId)
if (!inParty) {
  addNotification('只能对出战队伍中的宝可梦使用道具。', 'error')
  return
}
```

防止其它调用方传入仓库实例 id。

### 8.5 成长事件（升级、学技能）

当前多处使用 `playerTeam.find(m => m.id === evt.monId)`。

升级后：

- 参战、升级、学技能：仍只处理 **队伍内** 实例。
- 若实例在仓库（例如老师奖励先进仓再取出），`pendingGrowthEvents` 应在 **入队时** 仍绑定同一 `id`，取出后 `find` 应能在 `playerTeam` 找到。
- **禁止**对仅在仓库的实例触发战斗相关成长；老师奖励若满员先入 `pendingMonsterAcquisition`，安置入队后再处理成长。

---

## 9. 获得宝可梦流程

### 9.1 捕捉成功（`handleCaptureSequenceComplete`）

**现逻辑：** 成功 → 直接 push 到 `playerTeam`。

**新逻辑：**

1. 结束战斗表现（`CaptureSequenceOverlay`）。
2. 调用 `acquireMonster(caughtMonster, { source: 'capture' })`。
3. 根据返回结果：
   - `outcome: 'party'` → 通知「已加入队伍」→ 回地图。
   - `needsDecision: true` → 显示 **`CaptureRosterDecisionModal`**（或并入宝可梦管理页强制流程），**暂停**自动入队。

### 9.2 满员安置弹窗 `CaptureRosterDecisionModal`

**标题示例：**「捕捉成功！队伍已满（6/6）」

**副文案：**「请选择如何安置 {名字} Lv.{level}」

| 按钮 | 条件 | 行为 |
|------|------|------|
| **替换队伍中的一只** | 始终可用 | 展示 6 张队伍卡，点选被换下的一只 → 该只进仓库（若仓满则先要求整理或走互换）→ 新宝可梦入队 |
| **放入仓库** | 仓库 < 100 | 新宝可梦入 `storageBox`，队伍不变 |
| **放弃这只宝可梦** | 始终可用（最后手段） | 二次确认 → 不写入队伍/仓库，仅记录图鉴「见过」可选 |
| **取消** | 不显示 | 避免「捕捉了但悬空」；必须完成安置或放弃 |

#### 9.2.1 放弃野生宝可梦（已确认：允许）

**产品理由：**

- 队伍 6 + 仓库 100 都满时，玩家必须有出路，否则会卡死流程。
- 初中生可能误捕大量低等级怪，需要释放空间而不强迫替换珍贵队伍成员。

**规则：**

1. 仅在 **捕捉已成功**（球已收服、实例已生成）之后的安置阶段出现。
2. 文案二次确认：
   > 「确定放弃 {名字} 吗？它将返回野外，无法找回。」
3. 放弃后：
   - 不写入 `playerTeam` / `storageBox`。
   - 可选：图鉴记为「已见过」或「未捕获」（建议：**已见过未捕获**），与真正入队/入仓区分。
4. 当仓库未满时，UI **高亮推荐**「放入仓库」，放弃按钮样式弱化（次要按钮）。
5. 放弃 **不消耗** 精灵球（球已在捕捉成功时消耗，与现逻辑一致）。

### 9.3 老师奖励（`addRewardMonster` / `applyTeacherRewardRows`）

- 全部改为 `acquireMonster(..., { source: 'teacher_reward' })`。
- 满员时与捕捉相同弹窗（可复用组件，`source` 文案改为「老师奖励的宝可梦」）。
- 老师端 Supabase `grant_pokemon_reward` **无需修改**。

### 9.4 未来地图奖励（`MAP_GAMEPLAY_UPGRADE_PLAN.md`）

- Boss、部下、地图事件奖励宝可梦 → 必须 `acquireMonster`。
- 在地图文档阶段五/八验收项中增加：**奖励宝可梦遵守队伍/仓库上限**。

---

## 10. 队伍 ↔ 仓库操作规则

### 10.1 存入仓库

- 条件：`playerTeam.length > 1` 且 `storageBox.length < 100`。
- 被存入者从队伍移除；若其为 `activePlayerId`，首发改为 `playerTeam[0]`。

### 10.2 取出到队伍

- 条件：`playerTeam.length < 6`。
- 从仓库移除，追加到队伍末尾（或指定槽位，默认末尾）。

### 10.3 互换

- 条件：队伍已满 6 且仓库有目标，或队伍未满时也可用互换代替「取出」。
- 效果：两只实例交换所在列表，**id 不变**，HP/等级/技能保留。

### 10.4 放生

| 来源 | 条件 |
|------|------|
| 队伍 | `playerTeam.length > 1`；战斗中禁止 |
| 仓库 | 无最少数量限制 |

### 10.5 顺序

- 仅 **队伍 Tab** 可调序。
- 仓库内顺序按获得时间或 `id` 排序即可，不提供玩家排序（降低复杂度）。

---

## 11. 关联系统改动清单

### 11.1 必须改

| 模块 | 改动 |
|------|------|
| `OriginalGame.jsx` | state、`applyCloudGameData`、捕捉、奖励、放生、存档 |
| `pokemonRoster.js` | 新建 |
| `gameBalance.js` | 常量导出 |
| `TeamScreen` → `PokemonManagementScreen` | 双 Tab + 仓库操作 |
| `CaptureRosterDecisionModal` | 新建 |
| `CaptureSequenceOverlay` | 成功文案按 outcome 分支 |
| `GameCanvas.jsx` / `ThreeLowPolyMap.jsx` | 按钮「宝可梦」 |
| `handleUsePotion` / `handleUseExpPotion` | 队伍 id 守卫 |
| `handleReleaseMonster` | 支持 `from: 'storage'` |
| `README.md` | 增加本文档链接 |

### 11.2 不必改或仅验证

| 模块 | 说明 |
|------|------|
| `Battle.jsx` | `getPlayerAverageLevel(playerTeam)` 已正确 |
| 教师端 Dashboard | 不发宝可梦到存档，只写奖励表 |
| `supabase-setup.sql` | 表结构不变 |

### 11.3 可选增强（后续迭代）

| 模块 | 说明 |
|------|------|
| `DexScreen` | 已拥有 = 队伍 ∪ 仓库 出现过的 `pokedexId` |
| 地图「宝可梦中心」 | 打开同一 `PokemonManagementScreen` |
| 云存档 RPC 校验 | 防篡改队伍/仓库数量 |
| 仓库内「全部恢复 HP」 | 仅地图特殊建筑，不用消耗背包药水 |

---

## 12. 界面文案规范

| 场景 | 文案 |
|------|------|
| 地图按钮 | 宝可梦 |
| 管理页标题 | 宝可梦管理 |
| Tab | 队伍 (n/6) \| 仓库 (n/100) |
| 捕捉入队 | {名字} 已加入队伍！ |
| 捕捉入仓 | {名字} 已送入仓库！ |
| 替换 | {新名字} 替换了队伍中的 {旧名字}，{旧名字} 已送入仓库 |
| 仓库满 | 仓库已满（100/100），请先整理或选择替换 |
| 道具错误 | 只能对出战队伍中的宝可梦使用道具 |
| 放弃确认 | 确定放弃 {名字} 吗？它将返回野外，无法找回 |
| 战斗换人按钮 | 队伍 / 换人（二选一，与地图「宝可梦」区分） |

---

## 13. 边界情况与测试用例

| # | 场景 | 预期 |
|---|------|------|
| 1 | 队伍 5 只，捕捉成功 | 直接入队，6/6 |
| 2 | 队伍 6，仓库 50，捕捉成功 | 弹窗：替换 / 入仓 / 放弃 |
| 3 | 队伍 6，仓库 100，捕捉成功 | 弹窗：替换 / 放弃（无入仓） |
| 4 | 选择替换首发 | 新宝可梦占该槽位，旧首发入仓；`activePlayerId` 更新规则见 10.1 |
| 5 | 放弃野生 | 不入队不入仓；二次确认后关闭弹窗 |
| 6 | 背包对队伍用药 | 正常 |
| 7 | 试图对仓库 id 用药 | 拦截 + 提示 |
| 8 | 队伍 1 只，存入仓库 | 禁止 |
| 9 | 仓库放生最后一只 | 允许，队伍仍 ≥1 |
| 10 | 老师奖励满员 | 同捕捉弹窗 |
| 11 | 刷新时 pending 未决 | 恢复安置弹窗 |
| 12 | 旧存档 8 只全在 playerTeam | 迁移：6 队伍 + 2 仓库 |
| 13 | 战斗中打开地图宝可梦 | 禁止或仅查看（建议：地图 view 非 battle 时可开） |
| 14 | 战斗换人 | 仅列表队伍，不含仓库 |
| 15 | `getPlayerAverageLevel` | 不含仓库等级 |

---

## 14. 分阶段实施计划

### 阶段 P0：数据层与迁移

**目标：** 存档读写 `storageBox`，旧档兼容。

**任务：**

1. `schemaVersion: 4`，`storageBox` 默认值。
2. `normalizeCloudGameData` 迁移逻辑。
3. React state `storageBox` + `applyCloudGameData` / `createCloudSnapshot`。
4. `gameBalance.js` 常量。

**验收：** 旧账号能登录；新账号仓库为空；超 6 只旧队伍自动拆分。

---

### 阶段 P1：统一获得逻辑 + 捕捉安置

**目标：** 不再无限增长 `playerTeam`；满员捕捉有弹窗。

**任务：**

1. 新建 `pokemonRoster.js` + `acquireMonster`。
2. 改 `handleCaptureSequenceComplete`、`CaptureSequenceOverlay`。
3. 新建 `CaptureRosterDecisionModal`（含放弃二次确认）。
4. `pendingMonsterAcquisition` 存档字段。

**验收：** 第 7 只起不入队；满员可入仓/替换/放弃；刷新可恢复弹窗。

---

### 阶段 P2：宝可梦管理页（双 Tab）

**目标：** 地图「宝可梦」入口；队伍/仓库互操作。

**任务：**

1. 重构 `TeamScreen` → `PokemonManagementScreen`（队伍 \| 仓库 Tab）。
2. 存入、取出、互换、仓库放生。
3. 地图按钮文案与图标更新。
4. 样式复用 `CollectionGrid` / `CollectionCard`。

**验收：** 可在双 Tab 间管理；队伍调序与首发逻辑正常。

---

### 阶段 P3：道具守卫与老师奖励

**目标：** 堵住道具误用；奖励走路径一致。

**任务：**

1. `handleUsePotion` / `handleUseExpPotion` id 校验。
2. `UnifiedBagScreen` 副标题「仅出战队伍」。
3. `addRewardMonster` / `applyTeacherRewardRows` 改用 `acquireMonster`。

**验收：** 无法对仓库用药；老师发满员宝可梦弹安置窗。

---

### 阶段 P4：体验打磨（可选）

**任务：**

1. 图鉴「已拥有」= 队伍 ∪ 仓库。
2. 仓库满、队伍满的明确引导文案。
3. 云存档 RPC 校验（可选）。

---

## 15. 风险与注意事项

### 15.1 存档兼容

- 缺 `storageBox` 不能导致无法进游戏。
- `schemaVersion` 3 与 4 并存期间，`normalize` 必须幂等。

### 15.2 经济与成长规则

- 经验仍主要来自 **经验药水**（老师发金币 → 商城购买），仓库宝可梦不能绕过队伍直接吃药升级。
- 地图探索不直接给金币（与地图玩法文档一致）。

### 15.3 `OriginalGame.jsx` 体积

- 业务逻辑抽到 `pokemonRoster.js`，UI 弹窗可拆 `CaptureRosterDecisionModal.jsx`。
- 避免在 5500+ 行文件中继续堆叠无结构代码。

### 15.4 放弃与图鉴

- 若实现图鉴「已见过」，需在放弃时写入 `seenPokedexIds`（新字段，可 P4 做）。
- 第一版可仅 log + 通知，不强制图鉴联动。

### 15.5 仓库溢出迁移

- 若旧档 `playerTeam.length - 6 + storageBox.length > 100`，建议：优先填满仓库 100，其余 **按获得顺序丢弃并写 console.warn**（极端脏数据）；或弹一次系统通知请玩家联系老师。应在 `sanitizeRoster` 中实现并记录。

---

## 16. 与地图玩法文档的衔接

在 `MAP_GAMEPLAY_UPGRADE_PLAN.md` 落地时，需遵守：

1. Boss / 部下 / 训练师 **奖励宝可梦** → `acquireMonster`。
2. 地图治疗泉水 → 第一版只恢复 `playerTeam`；若需恢复仓库，单独开任务。
3. 探索完成度「已捕获」统计 → 建议用 `party ∪ storage` 的 `pokedexId` 去重。

---

## 17. 推荐第一版落地范围

**第一版必做（P0 + P1 + P2 + P3）：**

1. 存档 `storageBox` + 迁移。
2. 队伍上限 6、仓库上限 100。
3. 捕捉/奖励统一安置 + 满员弹窗（含放弃）。
4. 地图「宝可梦」双 Tab 管理页。
5. 道具仅队伍 + 代码守卫。

**第一版可不做：**

- 图鉴已拥有标记。
- 地图宝可梦中心地标。
- 后端 RPC 数量校验。
- 仓库全体治疗。

---

## 18. 最终体验验收

完成后，学生应能：

- 在地图点击 **宝可梦**，切换 **队伍 | 仓库** 管理所有宝可梦。
- 清楚知道出战只有 6 只，多出来的在仓库（最多 100）。
- 捕捉满员时，能 **替换 / 入仓 / 放弃**，不会卡死。
- 在背包用药时，**只能选队伍里的宝可梦**，不会误给仓库里的怪吃药。
- 战斗换人仍只看到自己带在身上的 6 只。
- 老师奖励的宝可梦与捕捉遵守同一套规则。

---

## 19. 文件改动索引（开发时勾选）

- [ ] `src/utils/pokemonRoster.js`（新建）
- [ ] `src/utils/gameBalance.js`（常量）
- [ ] `src/components/Game/OriginalGame.jsx`（状态、存档、捕捉、奖励、道具守卫）
- [ ] `src/components/Game/PokemonManagementScreen.jsx`（新建或重构 TeamScreen）
- [ ] `src/components/Game/CaptureRosterDecisionModal.jsx`（新建）
- [ ] `src/game/GameCanvas.jsx`（入口文案）
- [ ] `src/game/ThreeLowPolyMap.jsx`（入口文案）
- [ ] `src/index.css`（Tab 样式，可选）
- [ ] `README.md`（文档链接）
- [ ] `docs/MAP_GAMEPLAY_UPGRADE_PLAN.md`（可选交叉引用一句）

---

*文档版本：1.0 | 对应存档 schemaVersion：4 | 最后更新：2026-05-18*
