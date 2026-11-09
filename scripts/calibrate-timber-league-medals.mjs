#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { withViteAuditServer } from './load-vite-module.mjs'

// Rescore the recorded old-lineup battles without changing their historical limits.
const sourcePath = 'reports/timber-league/realistic/runs.jsonl.gz'
const bytes = readFileSync(sourcePath)
const attempts = gunzipSync(bytes).toString().trim().split('\n').map(JSON.parse)
  .filter(run => run.scenario.endsWith('/all-80/type/p2/cap2'))
const wins = attempts.filter(run => run.outcome === 'win')
assert.equal(attempts.length, 3024)
assert.equal(wins.length, 1825)

await withViteAuditServer(async ({ loadModule }) => {
  const { evaluateTimberLeagueTier } = await loadModule('/src/game/timberLeague.js')
  const thresholds = { gold: 16, silver: 19 }
  const countsFor = limits => {
    const counts = { bronze: 0, silver: 0, gold: 0 }
    for (const run of wins) counts[evaluateTimberLeagueTier({ routeKey: 'training', turns: run.turns, medalThresholds: limits }).tier]++
    return counts
  }
  const matchesTarget = counts => counts.bronze > counts.silver && counts.silver > counts.gold && counts.gold / wins.length <= 0.3
  let mostGenerous = null
  for (let gold = 1; gold < 31; gold++) for (let silver = gold + 1; silver <= 31; silver++) {
    if (matchesTarget(countsFor({ gold, silver }))) mostGenerous = { gold, silver }
  }
  assert.deepEqual({ gold: thresholds.gold, silver: thresholds.silver }, mostGenerous,
    'The historical 16/19 limits matched the selected calibration group')
  const counts = countsFor(thresholds)
  assert(matchesTarget(counts))
  const percentage = denominator => Object.fromEntries(Object.entries(counts).map(([tier, n]) => [tier, +(n * 100 / denominator).toFixed(2)]))
  const result = {
    generatedAt: new Date().toISOString(), sourcePath, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    cohort: 'Three fixed six-member Lv.80 parties, type policy, up to two max potions, enemy switch cap two',
    denominator: 'won battles', attempts: attempts.length, wins: wins.length,
    losses: attempts.filter(run => run.outcome === 'loss').length,
    unresolved: attempts.filter(run => !['win', 'loss'].includes(run.outcome)).length,
    thresholds, counts, percentPerWin: percentage(wins.length), percentPerAttempt: percentage(attempts.length),
    historicalTarget: { descendingMedals: ['bronze', 'silver', 'gold'], maxGoldPercentPerWin: 30 },
    historicalSnapshot: true, historicallyAppliedToNewBattles: true, existingBattleThresholdsPreserved: true,
  }
  const output = 'reports/timber-league/medal-distribution-2026-10-01'
  writeFileSync(`${output}.json`, `${JSON.stringify(result, null, 2)}\n`)
  const ranges = { bronze: `${thresholds.silver + 1} 回合起`, silver: `${thresholds.gold + 1}～${thresholds.silver} 回合`, gold: `${thresholds.gold} 回合内` }
  const labels = { bronze: '铜奖', silver: '银奖', gold: '金奖' }
  writeFileSync(`${output}.md`, [
    '# 训练联赛历史奖牌分布：旧阵容与 16/19 回合线', '',
    '本报告记录调整前的对手阵容与 16/19 回合线。三套固定六只80级队伍按属性应对，最多两瓶超级伤药，对手最多主动换人两次。以获胜场次为分母，当时要求铜奖最多、银奖其次、金奖最少且不超过30%。', '',
    `共 ${result.attempts} 场，胜 ${result.wins} 场、败 ${result.losses} 场、策略未完成 ${result.unresolved} 场。`, '',
    '| 奖牌 | 回合数（需获胜） | 胜场数 | 占胜局 | 占全部挑战 |',
    '|---|---|---:|---:|---:|',
    ...Object.keys(labels).map(tier => `| ${labels[tier]} | ${ranges[tier]} | ${counts[tier]} | ${result.percentPerWin[tier]}% | ${result.percentPerAttempt[tier]}% |`), '',
    '旧阵容样本中，金奖放到17回合会超过30%；金奖保持16回合时，银奖放到20回合会比铜奖更多。因此16/19是当时满足目标的最宽整数回合线。', '',
    '现行新挑战采用金奖≤14、银奖15～17、铜奖≥18；正在进行的挑战继续使用存档中的开战回合线。', '',
    '这些比例只属于旧阵容模拟组，不能用于推断调整后阵容与14/17回合线的奖牌分布，也不代表真实玩家获奖概率。', '',
    '本报告只重算历史逐场结果，没有重新抽样。复现：`node scripts/calibrate-timber-league-medals.mjs`。原始模拟与逐回合分布见 `realistic-calibration-2026-10-01.md`。', '',
  ].join('\n'))
  console.log(JSON.stringify(result, null, 2))
})
