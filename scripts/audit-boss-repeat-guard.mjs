import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const originalGamePath = path.join(repoRoot, 'src/components/Game/OriginalGame.jsx');
const source = fs.readFileSync(originalGamePath, 'utf8');
const trainerCompletionMigrationPath = path.join(repoRoot, 'supabase/migrations/202605220003_harden_trainer_completion_reward_save.sql');
const trainerCompletionMigration = fs.existsSync(trainerCompletionMigrationPath)
  ? fs.readFileSync(trainerCompletionMigrationPath, 'utf8')
  : '';

const requiredSnippets = [
  {
    label: 'trainer/boss shared tile lookup',
    snippet: "return ['trainer', 'boss'];"
  },
  {
    label: 'battle start resolves real map event',
    snippet: 'const battleMapEvent = resolveConfiguredBattleMapEvent({'
  },
  {
    label: 'battle start uses resolved event type',
    snippet: 'const battleEventType = battleMapEvent?.type || effectiveType;'
  },
  {
    label: 'battle start blocks untracked configured battles',
    snippet: "Blocked untracked configured battle event"
  },
  {
    label: 'victory resolves completion event from environment',
    snippet: 'const event = resolveConfiguredBattleMapEvent({'
  },
  {
    label: 'victory prefers resolved event type',
    snippet: 'const eventType = battleEventCompletion?.eventType || event?.type || eventMeta?.eventType || null;'
  },
  {
    label: 'boss completion writes canonical boss id',
    snippet: 'appendCompletedBossEventIds(nextWorld, completedMapName, completedEventId)'
  },
  {
    label: 'reward phase writes all trainer/boss completion progress',
    snippet: 'const shouldApplyBattleCompletionWithRewards ='
  },
  {
    label: 'reward phase writes normal trainer daily lock',
    snippet: 'appendDailyTrainerBattleEvent('
  },
  {
    label: 'local completed battle override helper exists',
    snippet: 'const appendCompletedBattleEventVisualOverride = (overrides, {'
  },
  {
    label: 'map visual state merges local completed override',
    snippet: 'const buildMapEventVisualState = (mapName, world, completedBattleEventVisualOverrides = null) =>'
  },
  {
    label: 'cloud apply preserves recent local battle completion progress',
    snippet: 'mergeLocalBattleProgressIntoWorld(baseNormalizedWorld, worldRef.current, worldFallback)'
  },
  {
    label: 'battle start checks local completed override before reopening battle',
    snippet: 'const localCompletedBattleEventVisualState = getCompletedBattleEventVisualOverride('
  },
  {
    label: 'cloud reload and reset clear local completion cache',
    snippet: 'const resetLocalBattleEventCompletionState = useCallback(() => {'
  },
  {
    label: 'battle completion context ref persists latest configured event metadata',
    snippet: 'const battleCompletionContextRef = useRef({'
  },
  {
    label: 'battle completion context hydration helper exists',
    snippet: 'const hydrateCommittedBattleSnapshot = useCallback((snapshot = null) => {'
  },
  {
    label: 'reward phase rehydrates configured battle context before saving',
    snippet: 'const hydratedBattleSnapshot = hydrateCommittedBattleSnapshot(baseSnapshot);'
  },
  {
    label: 'victory exit rehydrates configured battle context before map return save',
    snippet: 'const completionMeta = getConfiguredBattleCompletionMeta({\n          snapshot: committedSnapshot,'
  },
  {
    label: 'lieutenant completion gets a permanent immediate lock',
    snippet: "const isPermanentTrainerEvent = eventType === 'trainer' && normalizeTrainerRole(resolvedEventRole) !== 'normal';"
  },
  {
    label: 'victory settlement tolerates reward-phase daily precompletion',
    snippet: 'wasDailyPreCompletedByCurrentBattleRewardSave'
  }
];

const requiredMigrationSnippets = [
  {
    label: 'backend generic configured battle completion guard',
    snippet: 'CREATE OR REPLACE FUNCTION apply_configured_battle_completion_to_game_data'
  },
  {
    label: 'backend reward guard covers trainer events',
    snippet: "AND v_event_type IN ('boss', 'trainer')"
  },
  {
    label: 'backend reward-phase all-fainted shortcut excludes repeatable challenges',
    snippet: "OR (v_event_type IN ('boss', 'trainer') AND v_enemy_count > 0 AND v_remaining_enemy_count = 0)"
  },
  {
    label: 'backend same-day trainer lock is monotonic',
    snippet: "v_world := jsonb_set(v_world, '{dailyTrainerBattleIds}', v_merged_daily_ids, TRUE);"
  },
  {
    label: 'backend empty progress merge keeps idempotent payloads unchanged',
    snippet: "IF v_merged_values = '[]'::JSONB"
  },
  {
    label: 'backend trainer victory counts are monotonic',
    snippet: "v_world := jsonb_set(v_world, '{trainerVictoryCounts}', v_merged_trainer_counts, TRUE);"
  }
];

const failures = requiredSnippets.filter(({ snippet }) => !source.includes(snippet));
for (const requirement of requiredMigrationSnippets) {
  if (!trainerCompletionMigration.includes(requirement.snippet)) {
    failures.push(requirement);
  }
}

if (failures.length > 0) {
  console.error('Trainer repeat guard audit failed:');
  for (const failure of failures) {
    console.error(`- Missing ${failure.label}`);
  }
  process.exit(1);
}

console.log('Trainer repeat guard audit passed.');
