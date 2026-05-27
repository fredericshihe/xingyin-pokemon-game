#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')

const originalGame = read('src/components/Game/OriginalGame.jsx')

const checks = [
  {
    name: 'pending_switch_preserves_followup_enemy_sendout_payload',
    passed: /const normalizePendingBattleSwitch =[\s\S]*?followUpEnemyMon[\s\S]*?followUpEnemyMessage/.test(originalGame) &&
      /const buildPendingBattleSwitch =[\s\S]*?followUpEnemyMon[\s\S]*?followUpEnemyMessage/.test(originalGame),
  },
  {
    name: 'double_faint_with_two_benches_delays_enemy_sendout_until_player_replacement',
    passed: /if \(pendingPlayerFaint && pendingEnemyFaint && latestPlayer && latestEnemy\)[\s\S]*?const nextEnemy =[\s\S]*?handlePlayerDefeatCheck\(latestPlayer, latestPlayerTeam, \{\s*delayedEnemySendOutMon: nextEnemy\s*\}\)/.test(originalGame),
  },
  {
    name: 'forced_defeat_switch_enters_team_view_with_queued_enemy_sendout',
    passed: /const handlePlayerDefeatCheck =[\s\S]*?const queuedEnemySendOutPhaseData = buildQueuedEnemySendOutPhaseData\({[\s\S]*?view: 'team'[\s\S]*?battlePhase: queuedEnemySendOutPhaseData \? 'sendout' : 'active'[\s\S]*?battlePhaseData: queuedEnemySendOutPhaseData/.test(originalGame),
  },
  {
    name: 'forced_switch_carries_followup_enemy_sendout_through_pending_state',
    passed: /const handleSwitch =[\s\S]*?battlePhase === 'sendout'[\s\S]*?battlePhaseData\?\.sendOutSide === 'enemy'[\s\S]*?const pendingSwitch = buildPendingBattleSwitch\({[\s\S]*?followUpEnemyMon: queuedEnemySendOutData\?\.enemyMon \|\| null,[\s\S]*?followUpEnemyMessage: queuedEnemySendOutData\?\.message \|\| ''/.test(originalGame),
  },
  {
    name: 'completed_forced_switch_reenters_enemy_sendout_phase',
    passed: /const handleSwitch =[\s\S]*?const queuedBattlePhaseData = isForced[\s\S]*?buildQueuedEnemySendOutPhaseData\({[\s\S]*?battlePhase: queuedBattlePhaseData \? 'sendout' : 'active'[\s\S]*?battlePhaseData: queuedBattlePhaseData/.test(originalGame),
  },
  {
    name: 'resolving_turn_recovery_rebuilds_delayed_enemy_sendout',
    passed: /const recoverResolvingTurn = async \(\) => \{[\s\S]*?const queuedEnemySendOut = buildQueuedEnemySendOutPhaseData\({[\s\S]*?battlePhase: queuedEnemySendOut \? 'sendout' : 'active'[\s\S]*?battlePhaseData: queuedEnemySendOut/.test(originalGame),
  },
  {
    name: 'queued_enemy_sendout_phase_uses_shared_builder',
    passed: /const buildQueuedEnemySendOutPhaseData = \(\{[\s\S]*?sendOutSide: 'enemy'/.test(originalGame),
  },
  {
    name: 'team_view_sendout_snapshot_only_clears_when_enemy_context_is_gone',
    passed: /if \(normalized\.view !== 'battle' && !normalized\.activeEnemyId\) \{[\s\S]*?normalized\.battlePhase = 'active'/.test(originalGame),
  },
  {
    name: 'sendout_phase_data_accepts_enemy_only_overlay_mode',
    passed: /const normalizeBattlePhaseData =[\s\S]*?const sendOutSide = \['player', 'enemy', 'both'\]\.includes\(data\.sendOutSide\)/.test(originalGame),
  },
]

const failed = checks.filter((check) => !check.passed)

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: {
    checkCount: checks.length,
    failedCount: failed.length,
  },
  checks,
}, null, 2))

if (failed.length > 0) process.exitCode = 1
