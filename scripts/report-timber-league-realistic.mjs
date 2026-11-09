#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const dir = process.argv[2] || 'reports/timber-league/realistic'
const report = JSON.parse(readFileSync(resolve(dir, 'summary.json')))
const runs = gunzipSync(readFileSync(resolve(dir, 'runs.jsonl.gz'))).toString().trim().split('\n').map(line => JSON.parse(line))
const extraDir = process.argv[3] || 'reports/timber-league/realistic-legal-one-high'
const variantCount = report.opponents.find(group => group.levelProfile === 'all-80').variants.length
const historical = variantCount === 3
const extraCandidate = existsSync(resolve(extraDir, 'summary.json')) ? JSON.parse(readFileSync(resolve(extraDir, 'summary.json'))) : null
const extra = extraCandidate?.opponents[0]?.variants.length === variantCount ? extraCandidate : null
if (extra) {
  report.results.push(...extra.results)
  report.levels.push(...extra.levels)
  report.totalBattles += extra.totalBattles
  runs.push(...gunzipSync(readFileSync(resolve(extraDir, 'runs.jsonl.gz'))).toString().trim().split('\n').map(line => JSON.parse(line)))
}
const labels = Object.fromEntries(report.teams.map(team => [team.key, team.label]))
const levelLabels = { 'all-80': '全80级', mixed: '100/85/80/70/65/60', 'one-high': '100/30×5（压力测试）', 'one-high-60': '100/60×5' }
const policyLabels = { type: '属性策略', damage: '伤害预判' }
const pct = (n, total) => total ? (100 * n / total).toFixed(1) : '—'
const mean = values => values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : '—'
const histogram = values => values.reduce((counts, value) => { counts[value] = (counts[value] || 0) + 1; return counts }, {})
const percentiles = values => {
  const sorted = values.sort((a, b) => a - b)
  return [0.25, 0.5, 0.75, 0.9].map(p => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : '—').join('/')
}
const capped = report.results.filter(r => r.enemySwitchLimit === 2)
const uncappedCount = report.results.length - capped.length
const calibrationKeys = policy => new Set(capped.filter(r => r.levels === 'all-80' && r.policy === policy && r.potionLimit === 2).map(r => r.scenario))
const calibration = ['type', 'damage'].map(policy => {
  const keys = calibrationKeys(policy)
  const subset = runs.filter(r => keys.has(r.scenario)), wins = subset.filter(r => r.outcome === 'win')
  return { policy, subset, wins }
})
const recommendationRows = calibration.flatMap(({ policy, subset, wins }) => report.thresholdsCompared.map(([gold,silver]) => {
  const counts = [wins.filter(r => r.turns <= gold).length, wins.filter(r => r.turns > gold && r.turns <= silver).length, wins.filter(r => r.turns > silver).length]
  return `| ${policyLabels[policy]} | ${gold}/${silver} | ${counts.join('/')} | ${counts.map(n => pct(n,subset.length)).join('/')} | ${counts.map(n => pct(n,wins.length)).join('/')} |`
}))
const lines = [
  '# 铁木计时训练：固定队伍、等级混编与敌换人上限复测', '',
  `生成：${report.generatedAt}。每个关键场景 ${report.samplesPerScenario} 场，共 ${report.totalBattles.toLocaleString('en-US')} 场。${capped.length} 个敌最多换人 2 次场景，另有 ${uncappedCount} 个全 80 级无上限对照场景${extra ? '，并补充 6 个 100/60×5 合法等级场景' : ''}。对手共 ${variantCount} 套阵容。这里只产出模拟证据，没有修改生产奖牌阈值。`, '',
  '本轮不再从 91 只宝可梦中针对每名敌人挑选克制阵容。每场只拥有事先固定的六名成员，看到敌首发后从六名成员里选首发；整套六名成员对所有敌变体保持不变。', '',
  historical
    ? '**历史样本：当时生产为 16/21，之后曾采用 16/19。现行新挑战为金奖≤14、银奖15～17、铜奖≥18。** 本报告使用调整前的对手阵容，旧样本的奖牌分布见 `../medal-distribution-2026-10-01.md`；不能据此推断调整后阵容的获奖比例。'
    : '**现行 15 套阵容：金奖≤14、银奖15～17、铜奖≥18 回合。** 对手前三只经过属性反制链与 80 级可用攻击招式审计。',
  '校准以全 80 级、至多 2 药、敌主动换人至多 2 次的普通固定队伍为主。药量以“至多”计，不要求喝完。', '',
  ...calibration.map(({policy,subset,wins}) => `- ${policyLabels[policy]}：${wins.length}/${subset.length} 胜，胜率 ${pct(wins.length,subset.length)}%；胜局 P25/P50/P75/P90 = ${percentiles(wins.map(r=>r.turns))}，平均 ${mean(wins.map(r=>r.turns))} 回合。`), '',
  '| 全 80 级、2 药上限 | 金/银上限 | 金/银/铜场数 | 每挑战金/银/铜 % | 胜局内金/银/铜 % |',
  '| --- | --- | --- | --- | --- |', ...recommendationRows, '',
  historical
    ? '以下是旧阵容首次复测时的候选分析，并非现行规则：20/26 给普通属性策略保留治疗、换人和偶发异常的余量，同时让高级策略的效率有可见收益。22/28 会把普通策略绝大多数胜局都压入金银奖，铜奖接近消失；16/21 则对已赢下但进行了合理治疗/换人的普通队伍偏紧。18/24 是更偏竞速的中间选项。后来采用的16/19曾按旧样本中铜最多、银其次、金最少且金≤30%的目标选定。'
    : '14/17 是当前生产规则。以下其余回合线仅用于同一批战斗结果的对照，不自动改变游戏规则。',
  '阈值不会提高输掉挑战的胜率，队伍差异和等级匹配需要独立观察。', '',
  '## 样本与真实流程', '',
  '| 固定队伍 | 自带六名成员 |', '| --- | --- |',
  ...report.teams.map(team => `| ${team.label} | ${team.members.map(mon => `${mon.name}（${mon.types.join('/')}）`).join('、')} |`), '',
  `- 三种等级：全 80；100/85/80/70/65/60；100/30/30/30/30/30。混编等级在六种宝可梦间独立轮换，防止恰巧由特定种类永久占据最高等级。每个场景对 ${variantCount} 套阵容等量取样。100/30×5 包含无法自然达到的低等级最终进化成员，因此仅用作结构压力测试，不用于普通玩家阈值建议${extra ? '；另以 100/60×5 重测三队两策略、2 药' : ''}。`,
  '- 对手使用生产 getTimberLeagueNextTeam，等级按玩家六只从高到低一一匹配。调队顺序和等级不改变敌人的六个种类及首发；获胜后轮换阵容，失败保持当前阵容。',
  '- 属性策略：可见属性克制 × 本系加成优先，再按标注威力选择攻击；首发/换人考虑可见等级比的平方、血量和属性，不做伤害与速度预判。对明显不利局面换人，常规换人间隔至少两次行动；HP≤35%、MP≤10 或妨碍行动的异常时治疗。',
  '- 高级策略：用当前状态估计伤害、命中、速度和换入承伤，比较攻击、换人、治疗；不读取未来敌行动或随机数。不规划复杂强化/异常连招。',
  '- 使用默认等级招式，开场满 HP/MP，无永久属性强化。只给存活场上成员使用至多 0 或 2 瓶超级伤药（max_potion，恢复 HP/MP 并解异常），不复活、不治疗后排。药量是测试条件，不是新增游戏限制。',
  '- 技能执行直接抽取生产 executeBattleMove；状态回合、速度/优先度、MP 成本、招式/行动顺序日志、敌 AI 同样复用生产代码。trainerRole=minigame，trainerStyle 从真实计时员事件读得 minigame。',
  '- 攻击尝试、用药、主动换人各计一回合，倒下补位免费；所有样本用生产 trackTimberLeagueTransition 校验回合、药数与玩家换人数。睡眠/麻痹阻止行动仍计该玩家回合，但不非法扣 MP；蓄力释放不重复扣 MP。',
  '- 敌主动换人使用生产共享预算 helper，整场最多两次；强制补位不计预算。保留主动换人、意图、速度、状态、倒下与补位日志，以匹配敌 AI 的最近 8 行换人冷却。',
  '- 生产敌主动换人保留临时状态，玩家换人清理临时状态；本次按这个差异模拟。普通招式回合对仍存活的场上成员结算残余伤害；喝药/换人后的单次敌回复仅在有人倒下时进入残余结算，按当前生产行为保留。', '',
  '## 每个固定队伍场景', '',
  'P25/P50/P75/P90 只看胜局，分母固定为该行所有挑战。失败不算任何奖牌；超时与策略无可用伤害招式另列。', '',
  '| 队伍 | 等级 | 策略 | 药上限 | 胜/败/未完成 | 胜率 | 胜局 P25/50/75/90 | 胜局均回合 | 药均数 | 玩家主动/被动换人均数 | 敌主动/被动均数 |',
  '| --- | --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- | --- |',
  ...capped.map(r => `| ${labels[r.team]} | ${levelLabels[r.levels]} | ${policyLabels[r.policy]} | ${r.potionLimit} | ${r.outcomes.win || 0}/${r.outcomes.loss || 0}/${r.attempts - (r.outcomes.win || 0) - (r.outcomes.loss || 0)} | ${r.winPercent}% | ${[r.turns.wins.p25,r.turns.wins.p50,r.turns.wins.p75,r.turns.wins.p90].join('/')} | ${r.turns.wins.mean} | ${r.actions.potionsUsed.mean} | ${r.actions.playerSwitches.mean}/${r.actions.playerForcedSwitches.mean} | ${r.actions.enemySwitches.mean}/${r.actions.enemyForcedSwitches.mean} |`), '',
  '## 候选奖牌线', '',
  '表中“金/银/铜”互斥；例如 18/24 表示金奖≤18，银奖19–24，铜奖≥25（均需胜利）。这是同一批逐场结果的不同读法，不再重新抽样。', '',
  '| 等级 | 策略 | 药上限 | 金/银上限 | 每挑战金/银/铜 % | 胜局内金/银/铜 % |', '| --- | --- | ---: | --- | --- | --- |',
]
for (const level of report.levels) for (const policy of ['type', 'damage']) for (const potions of [0, 2]) {
  const keys = new Set(capped.filter(r => r.levels === level.key && r.policy === policy && r.potionLimit === potions).map(r => r.scenario))
  const subset = runs.filter(r => keys.has(r.scenario)), wins = subset.filter(r => r.outcome === 'win')
  for (const [gold,silver] of report.thresholdsCompared) {
    if (!subset.length) continue
    const counts = [wins.filter(r => r.turns <= gold).length, wins.filter(r => r.turns > gold && r.turns <= silver).length, wins.filter(r => r.turns > silver).length]
    lines.push(`| ${levelLabels[level.key]} | ${policyLabels[policy]} | ${potions} | ${gold}/${silver} | ${counts.map(n => pct(n, subset.length)).join('/')} | ${counts.map(n => pct(n, wins.length)).join('/')} |`)
  }
}
lines.push('', '这些按等级/策略分组的比例是三组玩家固定队伍等权汇总，不代表真实玩家人群分布。每套队伍、每个敌变体的全部候选线比例保存在 summary.json。', '',
  '## 对手变体分层', '',
  '以下不合并队伍，采用全 80 级、最多 2 药的两个策略。其他等级/药量的全部分层在 JSON 的 results[].byOpponent 内。', '',
  '| 队伍 | 策略 | 变体 | 胜/场次 | 胜率 | 胜局 P25/50/75/90 |', '| --- | --- | ---: | --- | ---: | --- |')
for (const r of capped.filter(r => r.levels === 'all-80' && r.potionLimit === 2)) for (const variant of r.byOpponent) lines.push(
  `| ${labels[r.team]} | ${policyLabels[r.policy]} | ${variant.variant + 1} | ${variant.outcomes.win || 0}/${variant.attempts} | ${variant.winPercent}% | ${[variant.turns.wins.p25,variant.turns.wins.p50,variant.turns.wins.p75,variant.turns.wins.p90].join('/')} |`)
lines.push('', ...report.opponents.find(group => group.levelProfile === 'all-80').variants.map(group => `- 变体 ${group.variant + 1}：${group.members.map((mon,i) => `${i === 0 ? '首发 ' : ''}${mon.name}（${mon.types.join('/')}）`).join('、')}。`), '',
  '## 两次上限与无上限的同种子对照', '',
  '只对全 80 级做对照，双方使用相同固定队伍与初始随机种子。决策发生分歧后随机数消耗顺序也会不同，因此这是共同初始种子的成组对照，不是逐回合强行固定命中。', '',
  '| 队伍 | 策略 | 药上限 | 上限2胜率/无上限胜率 | 上限2/无上限胜局 P50 | 上限2/无上限敌换人均数 | 无上限最高敌换人 |', '| --- | --- | ---: | --- | --- | --- | ---: |')
for (const r of capped.filter(r => r.levels === 'all-80')) {
  const other = report.results.find(v => v.scenario === r.scenario.replace('cap2', 'unlimited'))
  lines.push(`| ${labels[r.team]} | ${policyLabels[r.policy]} | ${r.potionLimit} | ${r.winPercent}%/${other.winPercent}% | ${r.turns.wins.p50}/${other.turns.wins.p50} | ${r.actions.enemySwitches.mean}/${other.actions.enemySwitches.mean} | ${other.actions.enemySwitches.max} |`)
}
const unresolved = runs.filter(r => !['win','loss'].includes(r.outcome))
lines.push('', '## 胜败、耗尽与回合分布', '',
  `全部 ${runs.length} 场结果：${JSON.stringify(histogram(runs.map(r => r.outcome)))}。未完成 ${unresolved.length} 场；timeout 表示达到 ${160} 次行动保护上限，no_affordable_move 表示存活成员无可支付招式，no_usable_damage_policy 表示本策略找不到有效伤害招式（不等于游戏绝对无解）。`, '',
  '以下是全 80 级、两次敌换人上限的队伍等权分组；其他逐场景胜局、败局、全局及未完成局的精确回合直方图与 P25/P50/P75/P90 均已保留在 summary.json。', '',
  '| 策略 | 药上限 | 结局 | 场次 | P25/50/75/90 | 回合:场数 |', '| --- | ---: | --- | ---: | --- | --- |')
for (const policy of ['type','damage']) for (const potions of [0,2]) for (const outcome of ['win','loss']) {
  const keys = new Set(capped.filter(r => r.levels === 'all-80' && r.policy === policy && r.potionLimit === potions).map(r => r.scenario))
  const subset = runs.filter(r => keys.has(r.scenario) && r.outcome === outcome)
  lines.push(`| ${policyLabels[policy]} | ${potions} | ${outcome === 'win' ? '胜' : '败'} | ${subset.length} | ${percentiles(subset.map(r=>r.turns))} | ${Object.entries(histogram(subset.map(r=>r.turns))).map(([turn,n])=>`${turn}:${n}`).join(', ')} |`)
}
lines.push('', '## 局限与解释边界', '',
  '- 这是两套确定的自动决策策略，不能直接声称“真实玩家胜率”。三个固定队伍覆盖不同属性，但不是游戏全体队伍的随机代表；高级策略可以读取当下敌招式/数值，比只看 UI 的新手知道得更多。',
  '- 普通属性策略会选高威力招式，可能过度使用反伤或自爆招式；高级策略的短期预计伤害也不完整估值长期反伤、强化、异常组合。不能把这些策略失败全部归因于 NPC 太强。',
  '- 一高五低分别测试低位 30 级（仅压力测试）与 60 级（可正常进化的等级）；不能外推为任意低等级。混编时等级绑定轮换用于检验阵容差异，实战只会拥有其中一种具体绑定。',
  '- 技能执行与关键纯函数复用生产；外层玩家/敌行动编排是按生产路径实现的无界面驱动，未直接挂载 React UI，也未测试网络、动画、保存、断线恢复和后台同步。',
  '- 同时倒下等罕见边界遵循“无玩家后备则失败、否则处理补位”；生产 UI 的中间显示时序并未模拟。',
  '- 超级伤药投入越多不必然更快获奖：喝药占行动，策略也可能错过最佳换人机会。奖牌阈值变宽只影响已经赢下的场次，不解决属性劣势或输掉的挑战。',
  `- 每行 ${report.samplesPerScenario} 场仍有抽样误差。summary.json 保存各行胜率 Wilson 95% 区间，不宜把约 1 个百分点的小差异当成确定结论。`, '',
  '## 复现与数据', '',
  '```sh',
  `TIMBER_REALISTIC_SAMPLES=${report.samplesPerScenario} TIMBER_REALISTIC_OUTPUT=${dir} node scripts/audit-timber-league-realistic.mjs`,
  ...(extra ? [`TIMBER_REALISTIC_SAMPLES=${extra.samplesPerScenario} TIMBER_REALISTIC_EXTRA=legal-one-high TIMBER_REALISTIC_OUTPUT=${extraDir} node scripts/audit-timber-league-realistic.mjs`] : []),
  `node scripts/report-timber-league-realistic.mjs ${dir}${extra ? ` ${extraDir}` : ''}`,
  '```', '',
  `基础种子 ${report.baseSeed}；每场保留实际 uint32 seed、scenario、sample、敌变体、等级绑定、首发、所有成员最终 HP/MP、回合、用药和双方主被动换人数。`, '',
  '- summary.json：来源 SHA-256、方法、全部场景、队伍/等级/策略汇总、敌变体/首发分层、候选奖牌线、胜败直方图与分位数。',
  '- runs.jsonl.gz：全部逐场记录，gzip 解压后每行一个 JSON。',
  '- examples.json：可重复的逐行动示例，包含行动前 HP/MP、选招/换人/喝药、敌动作与完整当回合日志。',
  '- progress.json：执行进度与各场景完成结果。', ...(extra ? ['- 100/60×5 的原始数据保存在补充样本目录，本报告合并展示两批结果。'] : []), '')
writeFileSync(resolve(dir, 'report.md'), lines.join('\n'))
console.log(resolve(dir, 'report.md'))
