#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')

const originalGame = read('src/components/Game/OriginalGame.jsx')

const checks = [
  {
    name: 'resolving_recovery_handles_fainted_active_combatants',
    scenario: '刷新后继续战斗 / self destruct 残留 resolving 中间态',
    passed: /const recoverResolvingTurn = async \(\) => \{[\s\S]*?const resolvedPlayerMon = withBattleRuntimeDefaults\(activePlayerMon\);[\s\S]*?const resolvedEnemyMon = withBattleRuntimeDefaults\(activeEnemyMon\);[\s\S]*?if \(\(playerFainted \|\| enemyFainted\) && resolvedPlayerMon && resolvedEnemyMon\) \{[\s\S]*?await resolveTurnAfterFaint\(\{[\s\S]*?playerFainted,[\s\S]*?enemyFainted[\s\S]*?\}\);/.test(originalGame),
  },
  {
    name: 'enemy_turn_preflight_recovers_preexisting_faints_before_action',
    scenario: '逃跑失败后敌方回合开始前已有一方倒下',
    passed: /turn === 'enemy' && !gameOver && !isThrowingPokeball[\s\S]*?const currentEnemyMon = withBattleRuntimeDefaults\(enemyTeam\.find\(m => m\.id === activeEnemyId\)\);[\s\S]*?const currentPlayerMon = withBattleRuntimeDefaults\(playerTeam\.find\(m => m\.id === activePlayerId\)\);[\s\S]*?const playerFainted = isBattleMonFainted\(currentPlayerMon\);[\s\S]*?const enemyFainted = isBattleMonFainted\(currentEnemyMon\);[\s\S]*?if \(playerFainted \|\| enemyFainted\) \{[\s\S]*?await resolveTurnAfterFaint\(\{[\s\S]*?playerFainted,[\s\S]*?enemyFainted[\s\S]*?\}\);/.test(originalGame),
  },
  {
    name: 'enemy_turn_post_action_faints_call_shared_resolution',
    scenario: '敌方自爆 / 反伤 / 逃跑失败后敌方反杀',
    passed: /const result = await runEnemyAction\({[\s\S]*?moveKey: randomMoveKey[\s\S]*?\}\);[\s\S]*?if \(result\.actorFainted \|\| result\.targetFainted\) \{[\s\S]*?await resolveTurnAfterFaint\(\{[\s\S]*?playerMon: result\.defender \|\| currentPlayerMon,[\s\S]*?enemyMon: result\.attacker \|\| currentEnemyMon,[\s\S]*?playerFainted: result\.targetFainted,[\s\S]*?enemyFainted: result\.actorFainted[\s\S]*?\}\);/.test(originalGame),
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
