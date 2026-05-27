#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')

const originalGame = read('src/components/Game/OriginalGame.jsx')
const trainerCompletionMigration = read('supabase/migrations/202605220003_harden_trainer_completion_reward_save.sql')

const checks = [
  {
    name: 'completion_meta_resolves_all_configured_event_types',
    scope: 'frontend',
    passed: /const getConfiguredBattleCompletionMeta = \(\{[\s\S]*?const eventType = battleEventCompletion\?\.eventType \|\| event\?\.type \|\| eventMeta\?\.eventType \|\| null;/.test(originalGame),
  },
  {
    name: 'configured_event_type_maps_to_distinct_world_progress_keys',
    scope: 'frontend',
    passed: /const getConfiguredBattleCompletionKey = \(eventType\) => \{[\s\S]*?if \(eventType === 'boss'\) return 'defeatedBossIds';[\s\S]*?if \(eventType === 'challenge'\) return 'completedChallengeIds';[\s\S]*?if \(eventType === 'trainer'\) return 'defeatedTrainerIds';/.test(originalGame)
  },
  {
    name: 'backend_completion_key_mapping_matches_frontend',
    scope: 'backend',
    passed: /WHEN v_event_type = 'challenge' THEN 'completedChallengeIds'/.test(trainerCompletionMigration)
      && /WHEN v_event_type = 'trainer' THEN 'defeatedTrainerIds'/.test(trainerCompletionMigration)
      && /WHEN v_event_type = 'boss' THEN 'defeatedBossIds'/.test(trainerCompletionMigration),
  },
  {
    name: 'completion_world_write_uses_boss_shortcut_and_generic_event_key',
    scope: 'frontend',
    passed: /const wasAlreadyCompleted = eventType === 'boss'[\s\S]*?hasMapScopedWorldEventId\(nextWorld, completionKey, mapName, eventId\)[\s\S]*?nextWorld = eventType === 'boss'[\s\S]*?appendCompletedBossEventIds\(nextWorld, mapName, eventId\)[\s\S]*?appendBattleCompletionWorldEventId\(nextWorld, completionKey, mapName, eventId\);/.test(originalGame),
  },
  {
    name: 'reward_phase_rehydrates_battle_context_before_atomic_save',
    scope: 'frontend',
    passed: /const atomicResult = await commitCloudSnapshotWithResources\({[\s\S]*?const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot\(baseSnapshot\);[\s\S]*?const rewardSnapshot = hydratedBattleSnapshot\.snapshot;[\s\S]*?battleEnvironment: hydratedBattleSnapshot\.battleEnvironment/.test(originalGame),
  },
  {
    name: 'reward_phase_force_completes_trainer_and_boss_only',
    scope: 'frontend+backend',
    passed: /const shouldApplyBattleCompletionWithRewards =[\s\S]*?defeatedBattleKind === 'trainer' &&[\s\S]*?\['boss', 'trainer'\]\.includes\(rewardCompletionMeta\.eventType\)/.test(originalGame)
      && /v_is_reward_forced_event := COALESCE\(p_force_complete, FALSE\)\s+AND v_event_type IN \('boss', 'trainer'\);/.test(trainerCompletionMigration),
  },
  {
    name: 'victory_phase_rehydrates_context_before_first_clear_write',
    scope: 'frontend',
    passed: /const commitResult = await commitCloudSnapshot\({[\s\S]*?const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot\(baseSnapshot\);[\s\S]*?const committedSnapshot = hydratedBattleSnapshot\.snapshot;[\s\S]*?const completionMeta = getConfiguredBattleCompletionMeta\({[\s\S]*?snapshot: committedSnapshot,[\s\S]*?battleEnvironment: hydratedBattleSnapshot\.battleEnvironment/.test(originalGame),
  },
  {
    name: 'victory_continue_rehydrates_context_before_map_exit',
    scope: 'frontend',
    passed: /const handleVictoryContinue = useCallback\(async \(\) => \{[\s\S]*?const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot\(baseSnapshot\);[\s\S]*?const completionMeta = getConfiguredBattleCompletionMeta\({[\s\S]*?snapshot: committedSnapshot,[\s\S]*?battleEnvironment: hydratedBattleSnapshot\.battleEnvironment/.test(originalGame),
  },
  {
    name: 'normal_trainers_and_challenges_keep_daily_progress_markers',
    scope: 'frontend+backend',
    passed: /if \(\s*eventType === 'trainer' &&[\s\S]*?isDailyVariantBattleEvent\(eventType, eventRole\)[\s\S]*?appendDailyTrainerBattleEvent\(nextWorld, mapName, eventId\)[\s\S]*?incrementTrainerVictoryCount\(nextWorld, eventId, mapName\)/.test(originalGame)
      && /v_is_daily_variant := v_event_type = 'challenge'\s+OR \(v_event_type = 'trainer' AND COALESCE\(v_event_role, 'normal'\) = 'normal'\);/.test(trainerCompletionMigration),
  },
  {
    name: 'challenge_repeat_rewards_and_unlock_progress_stay_in_victory_phase',
    scope: 'frontend',
    passed: /if \(isRepeatableChallenge\) \{[\s\S]*?const challengeRareUnlockStage = challengeRareUnlockStageBefore \+ 1;[\s\S]*?const challengeRareUnlockBatch = getChallengeRareUnlockBatch\(completedEvent, challengeRareUnlockStageBefore\);[\s\S]*?nextWorld = setTrainerVictoryCount\(nextWorld, completedEventId, challengeRareUnlockStage, completedMapName\);/.test(originalGame),
  },
  {
    name: 'battle_completion_context_ref_tracks_latest_configured_event_metadata',
    scope: 'frontend',
    passed: /const battleCompletionContextRef = useRef\({[\s\S]*?battleEnvironment: null,[\s\S]*?battleEventCompletion: null[\s\S]*?\}\);[\s\S]*?const hydrateCommittedBattleSnapshot = useCallback\(/.test(originalGame),
  }
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
