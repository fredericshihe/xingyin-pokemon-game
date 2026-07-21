#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')

const originalGame = read('src/components/Game/OriginalGame.jsx')
const enemyTrainerSwitchSource = originalGame.slice(
  originalGame.indexOf('const runEnemyTrainerSwitch = useCallback'),
  originalGame.indexOf('const runEnemyItem = useCallback')
)

const checks = [
  {
    name: 'resolving_recovery_handles_fainted_active_combatants',
    scenario: '刷新后继续战斗 / self destruct 残留 resolving 中间态',
    passed: /(?:const recoverResolvingTurn = async \(\) => \{|async function recoverResolvingTurn\(\) \{)[\s\S]*?const resolvedPlayerMon = withBattleRuntimeDefaults\(activePlayerMon\);[\s\S]*?const resolvedEnemyMon = withBattleRuntimeDefaults\(activeEnemyMon\);[\s\S]*?if \(\(playerFainted \|\| enemyFainted\) && resolvedPlayerMon && resolvedEnemyMon\) \{[\s\S]*?await resolveTurnAfterFaint\(\{[\s\S]*?playerFainted,[\s\S]*?enemyFainted[\s\S]*?\}\);/.test(originalGame),
  },
  {
    name: 'enemy_turn_preflight_recovers_preexisting_faints_before_action',
    scenario: '逃跑失败后敌方回合开始前已有一方倒下',
    passed: /const resolveEnemyTurn = useCallback\(async \(\{[\s\S]*?const currentEnemyMon = withBattleRuntimeDefaults\([\s\S]*?const currentPlayerMon = withBattleRuntimeDefaults\([\s\S]*?const playerFainted = isBattleMonFainted\(currentPlayerMon\);[\s\S]*?const enemyFainted = isBattleMonFainted\(currentEnemyMon\);[\s\S]*?if \(playerFainted \|\| enemyFainted\) \{[\s\S]*?await resolveTurnAfterFaint\(\{[\s\S]*?playerFainted,[\s\S]*?enemyFainted[\s\S]*?\}\);/.test(originalGame),
  },
  {
    name: 'enemy_turn_post_action_faints_call_shared_resolution',
    scenario: '敌方自爆 / 反伤 / 逃跑失败后敌方反杀',
    passed: /const result = await runEnemyAction\({[\s\S]*?moveKey: randomMoveKey[\s\S]*?\}\);[\s\S]*?const enemyFaints = resolveBattleActionFaintFlags\(result, currentEnemyMon, currentPlayerMon\);[\s\S]*?if \(enemyFaints\.actorFainted \|\| enemyFaints\.targetFainted\) \{[\s\S]*?await resolveTurnAfterFaint\(\{[\s\S]*?playerMon: enemyFaints\.targetMon,[\s\S]*?enemyMon: enemyFaints\.actorMon,[\s\S]*?playerFainted: enemyFaints\.targetFainted,[\s\S]*?enemyFainted: enemyFaints\.actorFainted[\s\S]*?\}\);/.test(originalGame),
  },
  {
    name: 'enemy_turn_uses_shared_owned_resolution',
    scenario: '主动换人和读档残留 enemy 状态走同一套敌方回合结算',
    passed: /const resolveEnemyTurn = useCallback\(async \(\{[\s\S]*?ownResolution = false[\s\S]*?enemyTurnInFlightRef\.current && !ownResolution[\s\S]*?const commitPlayerTurn = async[\s\S]*?const enemyAction = chooseEnemyAction\(currentEnemyMon, currentPlayerMon\)/.test(originalGame),
  },
  {
    name: 'enemy_proactive_switch_owns_its_visual_transition',
    scenario: '对手预判换人后必须完整结束专用换人动画，再继续玩家招式',
    passed: /battlePhase:\s*'active'[\s\S]*?battlePhaseData:\s*null/.test(enemyTrainerSwitchSource) &&
      /setSwitchVisualEvent\(\{[\s\S]*?side:\s*'enemy'[\s\S]*?phase:\s*'send'[\s\S]*?durationMs:\s*BATTLE_SWITCH_SEND_MS[\s\S]*?await wait\(BATTLE_SWITCH_SEND_MS\)/.test(enemyTrainerSwitchSource) &&
      !/battlePhase:\s*'sendout'/.test(enemyTrainerSwitchSource),
  },
  {
    name: 'resolving_recovery_waits_for_live_turn_owner',
    scenario: '长动画或慢云端请求仍属于正常回合时，恢复器不得抢写回合状态',
    passed: /async function recoverResolvingTurn\(\) \{[\s\S]*?if \(battleTurnInFlightRef\.current \|\| enemyTurnInFlightRef\.current\) \{[\s\S]*?scheduleRecoverResolvingTurn\(BATTLE_TURN_RECOVERY_MS\);[\s\S]*?return;/.test(originalGame),
  },
  {
    name: 'voluntary_switch_awaits_enemy_turn_resolution',
    scenario: '玩家主动换人消费本回合后，由换人指令继续完成对手行动',
    passed: /if \(!isForced\) \{[\s\S]*?await resolveEnemyTurn\(\{[\s\S]*?playerMon: followUpPlayerMon,[\s\S]*?enemyMon: followUpEnemyMon,[\s\S]*?activePlayerId: newId,[\s\S]*?ownResolution: true/.test(originalGame),
  },
  {
    name: 'enemy_turn_effect_delegates_to_shared_resolution',
    scenario: '刷新/读档后若存档停在 enemy，由 effect 启动同一个敌方回合 resolver',
    passed: /if \(turn !== 'enemy' \|\| isThrowingPokeball \|\| battleModalScreenOpen \|\| cloudBlocked \|\| playtimeExpired\) return undefined;[\s\S]*?const enemyActionDelayMs = getEnemyTurnDelayMs\(logsRef\.current\);[\s\S]*?const timer = window\.setTimeout\(\(\) => \{[\s\S]*?resolveEnemyTurnRef\.current\?\.\(\);/.test(originalGame),
  },
  {
    name: 'enemy_turn_timer_survives_unrelated_rerenders',
    scenario: '每秒游玩倒计时重渲染不能反复取消 1.5 秒的敌方行动定时器',
    passed: /const resolveEnemyTurnRef = useRef\(null\);[\s\S]*?useLayoutEffect\(\(\) => \{[\s\S]*?resolveEnemyTurnRef\.current = resolveEnemyTurn;[\s\S]*?\}, \[resolveEnemyTurn\]\);/.test(originalGame) &&
      /useEffect\(\(\) => \{[\s\S]*?const enemyActionDelayMs = getEnemyTurnDelayMs\(logsRef\.current\);[\s\S]*?resolveEnemyTurnRef\.current\?\.\(\);[\s\S]*?\}, \[[\s\S]*?activeEnemyId,[\s\S]*?battleModalScreenOpen,[\s\S]*?battlePhase,[\s\S]*?turn,[\s\S]*?view[\s\S]*?\]\);/.test(originalGame) &&
      !/const enemyActionDelayMs = getEnemyTurnDelayMs\(logsRef\.current\);[\s\S]*?\}, \[[\s\S]*?resolveEnemyTurn,[\s\S]*?turn,/.test(originalGame),
  },
  {
    name: 'potion_animation_owns_enemy_turn_handoff',
    scenario: '伤药提交为 enemy 后，背包和治疗动画关闭前不得启动敌方行动',
    passed: /onModalScreenChange\?\.\(showBag \|\| showTeam\)/.test(originalGame) &&
      /if \(turn !== 'enemy' \|\| isThrowingPokeball \|\| battleModalScreenOpen \|\| cloudBlocked \|\| playtimeExpired\) return undefined;/.test(originalGame) &&
      /onBattleItemConsumed=\{\(\{ itemType \}\) => \{[\s\S]*?setShowBag\(false\);[\s\S]*?setIsBusy\(true\);/.test(originalGame),
  },
  {
    name: 'post_action_faint_flags_use_actual_hp_fallback',
    scenario: '自爆 / 反伤返回布尔丢失时仍按 currentHp=0 进入结算',
    passed: /const resolveBattleActionFaintFlags = \(result = \{\}, fallbackActor = null, fallbackTarget = null\) => \{[\s\S]*?actorFainted: Boolean\(result\?\.actorFainted \|\| \(actorMon && isBattleMonFainted\(actorMon\)\)\),[\s\S]*?targetFainted: Boolean\(result\?\.targetFainted \|\| \(targetMon && isBattleMonFainted\(targetMon\)\)\)/.test(originalGame),
  },
  {
    name: 'victory_commit_success_sets_local_victory_phase',
    scenario: '奖励已提交但本地战斗 UI 没立即进入胜利结算',
    passed: /if \(commitResult\.success\) \{[\s\S]*?setView\('battle'\);[\s\S]*?setBattlePhase\('victory'\);[\s\S]*?setBattlePhaseData\(\(prev\) => \([\s\S]*?victoryPhaseData[\s\S]*?\)\);[\s\S]*?setTurn\('player'\);/.test(originalGame),
  },
  {
    name: 'turn_end_status_resolution_feeds_into_shared_faint_finalizer',
    scenario: '毒 / 灼伤回合末击倒',
    passed: /const resolveTurnAfterFaint = useCallback\(async \(\{[\s\S]*?const finalizeResolvedFaints = async \(\) => \{[\s\S]*?if \(pendingEnemyFaint && latestEnemy\) \{[\s\S]*?await finishEnemyDefeat\(latestEnemy\);[\s\S]*?if \(pendingPlayerFaint && latestPlayer\) \{[\s\S]*?await handlePlayerDefeatCheck\(latestPlayer, latestPlayerTeam\);[\s\S]*?if \(!pendingPlayerFaint && !pendingEnemyFaint && latestPlayer && latestEnemy\) \{[\s\S]*?runEndOfTurnStatusResolution\({[\s\S]*?side: 'player'[\s\S]*?\}[\s\S]*?runEndOfTurnStatusResolution\({[\s\S]*?side: 'enemy'[\s\S]*?\}[\s\S]*?return finalizeResolvedFaints\(\);[\s\S]*?if \(!pendingPlayerFaint && latestPlayer\) \{[\s\S]*?runEndOfTurnStatusResolution\({[\s\S]*?side: 'player'[\s\S]*?\}[\s\S]*?if \(!pendingEnemyFaint && latestEnemy\) \{[\s\S]*?runEndOfTurnStatusResolution\({[\s\S]*?side: 'enemy'/.test(originalGame),
  },
  {
    name: 'battle_load_repairs_missing_active_enemy_reference',
    scenario: '刷新后继续战斗 / activeEnemyId 残缺坏档',
    passed: /const resolveActiveEnemyId = \(enemyTeam = \[\], fallbackId = null\) => \{[\s\S]*?if \(team\.some\(\(mon\) => mon\?\.id === fallbackId\)\) return fallbackId;[\s\S]*?return team\.find\(hasBattleHp\)\?\.id \?\? team\[0\]\?\.id \?\? null;[\s\S]*?const isBattleContext = view === 'battle' \|\| Boolean\(gameData\.activeEnemyId\);[\s\S]*?const activeEnemyId = isBattleContext \? resolveActiveEnemyId\(enemyTeam, gameData\.activeEnemyId\) : null;/.test(originalGame),
  },
  {
    name: 'battle_checkpoint_can_preserve_escape_refund_for_player_teleport',
    scenario: '玩家首回合使用瞬间移动脱离战斗，沿用普通逃跑的能量返还规则',
    passed: /const commitBattleRuntimeCheckpoint = useCallback\(async \(\{[\s\S]*?battleEnergyRefundEligibleOverride = null[\s\S]*?battleEnergyRefundEligible: typeof battleEnergyRefundEligibleOverride === 'boolean'[\s\S]*?\? battleEnergyRefundEligibleOverride[\s\S]*?: false/.test(originalGame),
  },
  {
    name: 'player_teleport_keeps_refund_eligibility_until_escape_overlay_closes',
    scenario: '玩家瞬间移动成功后，逃跑结算还能看到 battleEnergyRefundEligible=true 并执行返还',
    passed: /const runPlayerAction = useCallback\(async \(\{[\s\S]*?battleEnergyRefundEligibleOverride: result\.escaped[\s\S]*?\? Boolean\(battleEnergyRefundEligible\)[\s\S]*?: false[\s\S]*?if \(result\.escaped\) \{[\s\S]*?setBattleEnergyRefundEligible\(Boolean\(battleEnergyRefundEligible\)\)/.test(originalGame),
  },
  {
    name: 'enemy_teleport_never_refunds_player_energy',
    scenario: '敌方瞬间移动逃走时不会把玩家本场消耗退回',
    passed: /const runEnemyAction = useCallback\(async \(\{[\s\S]*?battleEnergyRefundEligibleOverride: false[\s\S]*?if \(result\.escaped\) \{[\s\S]*?setBattleEnergyRefundEligible\(false\)/.test(originalGame),
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
