#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')

const originalGame = read('src/components/Game/OriginalGame.jsx')
const deferredGamePanels = read('src/components/Game/DeferredGamePanels.jsx')

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
    passed: /const handlePlayerDefeatCheck =[\s\S]*?const queuedEnemySendOutPhaseData = buildQueuedEnemySendOutPhaseData\({[\s\S]*?view: 'team'[\s\S]*?activeEnemyId: queuedEnemySendOutPhaseData\?\.enemyMon\?\.id \|\| committedSnapshot\.activeEnemyId[\s\S]*?battlePhase: queuedEnemySendOutPhaseData \? 'sendout' : 'active'[\s\S]*?battlePhaseData: queuedEnemySendOutPhaseData/.test(originalGame),
  },
  {
    name: 'forced_switch_carries_followup_enemy_sendout_through_pending_state',
    passed: /const handleSwitch =[\s\S]*?battlePhase === 'sendout'[\s\S]*?battlePhaseData\?\.sendOutSide === 'enemy'[\s\S]*?const pendingSwitch = buildPendingBattleSwitch\({[\s\S]*?followUpEnemyMon: queuedEnemySendOutData\?\.enemyMon \|\| null,[\s\S]*?followUpEnemyMessage: queuedEnemySendOutData\?\.message \|\| ''/.test(originalGame),
  },
  {
    name: 'completed_forced_switch_reenters_enemy_sendout_phase',
    passed: /const handleSwitch =[\s\S]*?const queuedBattlePhaseData = isForced[\s\S]*?buildQueuedEnemySendOutPhaseData\({[\s\S]*?activeEnemyId: queuedBattlePhaseData\?\.enemyMon\?\.id \|\| baseSnapshot\.activeEnemyId[\s\S]*?battlePhase: queuedBattlePhaseData \? 'sendout' : 'active'[\s\S]*?battlePhaseData: queuedBattlePhaseData/.test(originalGame),
  },
  {
    name: 'resolving_turn_recovery_rebuilds_delayed_enemy_sendout',
    passed: /(?:const recoverResolvingTurn = async \(\) => \{|async function recoverResolvingTurn\(\) \{)[\s\S]*?const queuedEnemySendOut = buildQueuedEnemySendOutPhaseData\({[\s\S]*?activeEnemyId: queuedEnemySendOut\?\.enemyMon\?\.id \|\| baseSnapshot\.activeEnemyId[\s\S]*?battlePhase: queuedEnemySendOut \? 'sendout' : 'active'[\s\S]*?battlePhaseData: queuedEnemySendOut/.test(originalGame),
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
  {
    name: 'player_switch_animation_runs_for_full_team_view',
    passed: /const handleSwitch = useCallback\(async \(newId\) => \{[\s\S]*?const resolvingCommit = await resolvingCommitPromise;[\s\S]*?if \(!resolvingCommit\.success\)[\s\S]*?setView\('battle'\);[\s\S]*?phase: 'recall'[\s\S]*?await wait\(BATTLE_SWITCH_RECALL_MS\);[\s\S]*?phase: 'send'[\s\S]*?await wait\(BATTLE_SWITCH_SEND_MS\);[\s\S]*?const nextTurn = isForced \? 'player' : 'enemy'/.test(originalGame) &&
      !/switchingFromTeamView/.test(originalGame),
  },
  {
    name: 'voluntary_switch_resolves_followup_enemy_turn_inline',
    passed: /const resolveEnemyTurn = useCallback\(async \(\{[\s\S]*?ownResolution = false[\s\S]*?\}\s*=\s*\{\}\) => \{[\s\S]*?const handleSwitch = useCallback\(async \(newId\) => \{[\s\S]*?if \(!isForced\) \{[\s\S]*?await resolveEnemyTurn\(\{[\s\S]*?activePlayerId: newId,[\s\S]*?activeEnemyId,[\s\S]*?ownResolution: true/.test(originalGame),
  },
  {
    name: 'forced_replacement_skips_fainted_recall_animation',
    passed: /const shouldSkipRecall = isForced \|\| isBattleMonFainted\(activePlayerMon\);[\s\S]*?if \(!shouldSkipRecall\) \{[\s\S]*?phase: 'recall'[\s\S]*?await wait\(BATTLE_SWITCH_RECALL_MS\);[\s\S]*?phase: 'send'/.test(originalGame) &&
      /const shouldSkipRecall = normalizedPendingSwitch\.forced \|\| isBattleMonFainted\(recallMonster\);[\s\S]*?const sendDelayMs = shouldSkipRecall \? 0 : BATTLE_SWITCH_RECALL_MS;[\s\S]*?if \(!shouldSkipRecall\) \{[\s\S]*?phase: 'recall'[\s\S]*?\}, sendDelayMs\);[\s\S]*?\}, sendDelayMs \+ BATTLE_SWITCH_SEND_MS\);/.test(originalGame),
  },
  {
    name: 'battle_team_view_preserves_battle_environment',
    passed: /const battleContextActive = view === 'battle' \|\| Boolean\(activeEnemyId\);[\s\S]*?if \(!battleContextActive && battleEnvironment\) \{[\s\S]*?setBattleEnvironment\(null\)/.test(originalGame),
  },
  {
    name: 'player_switch_send_phase_shows_pokeball_overlay',
    passed: /const switchSendOutMode = switchVisualEvent\?\.phase === 'send'[\s\S]*?<BattleSendOutOverlay[\s\S]*?mode=\{switchSendOutMode\}[\s\S]*?variant="switch"[\s\S]*?playerBallSprite=\{playerSendOutBallSprite\}/.test(originalGame),
  },
  {
    name: 'team_switch_selection_does_not_trigger_extra_back_navigation',
    passed: /if \(isSwitching\) \{[\s\S]*?await onSelect\(mon\.id\)[\s\S]*?\} finally/.test(deferredGamePanels) &&
      !/const switched = await onSelect\(mon\.id\)[\s\S]*?if \(switched\) \{[\s\S]*?onBack\(\)/.test(deferredGamePanels),
  },
  {
    name: 'live_forced_switch_blocks_stale_team_snapshot_flash',
    passed: /const shouldKeepLiveSwitchInBattleView = Boolean\([\s\S]*?liveSwitch\?\.source === 'live'[\s\S]*?view === 'team'[\s\S]*?const appliedView = shouldKeepLiveSwitchInBattleView \? 'battle' : view[\s\S]*?const appliedTurn = shouldKeepLiveSwitchInBattleView \? 'resolving' : battleTurn/.test(originalGame) &&
      /localBattleSwitchInFlightRef\.current = pendingSwitchKey[\s\S]*?pendingSwitch,[\s\S]*?source: 'live'/.test(originalGame),
  },
  {
    name: 'completed_live_switch_allows_committed_enemy_turn_snapshot',
    passed: /const liveSwitchAlreadyCompleted = Boolean\([\s\S]*?String\(livePendingSwitch\.nextActivePlayerId\) === String\(resolvedActivePlayerId\)[\s\S]*?!pendingBattleSwitch[\s\S]*?const shouldKeepLiveSwitchInBattleView = Boolean\([\s\S]*?!liveSwitchAlreadyCompleted/.test(originalGame),
  },
  {
    name: 'forced_switch_click_leaves_team_before_cloud_ack',
    passed: /const resolvingCommitPromise = commitCloudSnapshot\([\s\S]*?\);\s*setView\('battle'\);\s*setBattlePhase\('active'\);\s*setBattlePhaseData\(null\);\s*setTurn\('resolving'\);\s*setPendingBattleSwitch\(pendingSwitch\);[\s\S]*?const resolvingCommit = await resolvingCommitPromise/.test(originalGame),
  },
  {
    name: 'live_switch_guard_blocks_recovery_team_flash',
    passed: /const getLiveBattleSwitchInFlight = useCallback\([\s\S]*?BATTLE_SWITCH_LIVE_GUARD_MS[\s\S]*?return liveSwitch/.test(originalGame) &&
      /const liveSwitch = getLiveBattleSwitchInFlight\(normalizedPendingSwitch\);[\s\S]*?if \(liveSwitch\) \{[\s\S]*?return;[\s\S]*?\}/.test(originalGame) &&
      /const basePendingSwitch = normalizePendingBattleSwitch\(baseSnapshot\.pendingBattleSwitch\);[\s\S]*?if \(basePendingSwitch \|\| getLiveBattleSwitchInFlight\(basePendingSwitch\)\) \{[\s\S]*?return baseSnapshot;[\s\S]*?\}[\s\S]*?view: 'team'/.test(originalGame),
  },
  {
    name: 'live_switch_guard_reschedules_resolving_recovery_after_guard_window',
    passed: /const recoveryTimers = new Set\(\);[\s\S]*?const scheduleRecoverResolvingTurn = \(delayMs\) => \{[\s\S]*?BATTLE_SWITCH_LIVE_GUARD_MS - elapsedMs \+ 250[\s\S]*?scheduleRecoverResolvingTurn\(retryDelayMs\)[\s\S]*?scheduleRecoverResolvingTurn\(BATTLE_TURN_RECOVERY_MS\)[\s\S]*?recoveryTimers\.forEach/.test(originalGame),
  },
  {
    name: 'resolving_switch_recovery_clears_stale_switch_visual',
    passed: /if \(commitResult\.success\) \{\s*localBattleSwitchInFlightRef\.current = null;\s*setSwitchVisualEvent\(null\);\s*return;\s*\}/.test(originalGame),
  },
  {
    name: 'live_switch_helper_reads_ref_not_itself',
    passed: /const getLiveBattleSwitchInFlight = useCallback\(\(candidateSwitch = null\) => \{\s*const liveSwitch = localBattleSwitchInFlightRef\.current/.test(originalGame) &&
      !/const getLiveBattleSwitchInFlight = useCallback\(\(candidateSwitch = null\) => \{\s*const liveSwitch = getLiveBattleSwitchInFlight/.test(originalGame),
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
