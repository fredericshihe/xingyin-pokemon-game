#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const originalGame = fs.readFileSync(path.join(rootDir, 'src/components/Game/OriginalGame.jsx'), 'utf8')
const gameCss = fs.readFileSync(path.join(rootDir, 'src/game.css'), 'utf8')
const bootScreen = fs.readFileSync(path.join(rootDir, 'src/components/UnifiedBootScreen.jsx'), 'utf8')
const supabaseClient = fs.readFileSync(path.join(rootDir, 'src/supabaseClient.js'), 'utf8')
const hardeningMigration = fs.readFileSync(
  path.join(rootDir, 'supabase/migrations/202607170001_harden_daily_playtime_enforcement.sql'),
  'utf8',
)
const lifecycleMigration = fs.readFileSync(
  path.join(rootDir, 'supabase/migrations/202607180001_fix_playtime_session_lifecycle.sql'),
  'utf8',
)
const leaseMigration = fs.readFileSync(
  path.join(rootDir, 'supabase/migrations/202607180002_enforce_live_playtime_lease.sql'),
  'utf8',
)
const expiryMigration = fs.readFileSync(
  path.join(rootDir, 'supabase/migrations/202607180003_return_expired_playtime_status.sql'),
  'utf8',
)

const overlaySource = originalGame.slice(
  originalGame.indexOf('const PlaytimeExpiredOverlay ='),
  originalGame.indexOf('const ResetProgressConfirmModal ='),
)

const legacyRecordSource = hardeningMigration.slice(
  hardeningMigration.indexOf('CREATE OR REPLACE FUNCTION record_student_playtime('),
  hardeningMigration.indexOf('GRANT EXECUTE ON FUNCTION get_student_playtime_status'),
)
const saveWrapperSource = leaseMigration.slice(
  leaseMigration.indexOf('CREATE OR REPLACE FUNCTION save_cloud_game_save('),
  leaseMigration.indexOf('GRANT EXECUTE ON FUNCTION save_cloud_game_save('),
)

const countMatches = (source, pattern) => source.match(pattern)?.length || 0

const checks = [
  {
    name: 'expired_overlay_exposes_logout_action',
    passed: /const PlaytimeExpiredOverlay = \(\{[\s\S]*?onLogout[\s\S]*?await onLogout\(\)/.test(overlaySource) &&
      /fa-right-from-bracket[\s\S]*?退出登录/.test(overlaySource),
  },
  {
    name: 'expired_overlay_prevents_duplicate_logout',
    passed: /const \[logoutBusy, setLogoutBusy\] = useState\(false\)[\s\S]*?if \(logoutBusy \|\| typeof onLogout !== 'function'\) return;[\s\S]*?disabled=\{logoutBusy\}/.test(overlaySource),
  },
  {
    name: 'game_passes_student_logout_handler_to_expired_overlay',
    passed: /<PlaytimeExpiredOverlay[\s\S]*?remainingSeconds=\{playtimeRemainingSeconds\}[\s\S]*?limitMinutes=\{playtimeLimitMinutes\}[\s\S]*?onLogout=\{onLogout\}/.test(originalGame),
  },
  {
    name: 'expired_overlay_logout_has_visible_control_styles',
    passed: /\.map-energy-lock-card__actions\s*\{/.test(gameCss) &&
      /\.map-energy-lock-card__logout\s*\{/.test(gameCss),
  },
  {
    name: 'playtime_rpc_failure_fails_closed',
    passed: /markPlaytimeSessionUnavailable[\s\S]*?playtimeStatusRef\.current = null;[\s\S]*?playtimeExpiredRef\.current = true;[\s\S]*?setPlaytimeStatus\(null\);[\s\S]*?setPlaytimeError\(PLAYTIME_STATUS_UNAVAILABLE_MESSAGE\)/.test(originalGame) &&
      /failStudentPlaytimeCheck[\s\S]*?markPlaytimeSessionUnavailable\(error, options\)/.test(originalGame),
  },
  {
    name: 'visible_expired_state_stops_repeated_auto_saves',
    passed: /saveGameToCloud[\s\S]*?playtimeExpiredRef\.current && playtimePageVisibleRef\.current[\s\S]*?return false;/.test(originalGame),
  },
  {
    name: 'boot_waits_for_authoritative_playtime_status',
    passed: /const showBootScreen = \([\s\S]*?playtimeLoading[\s\S]*?Boolean\(playtimeError\)[\s\S]*?!playtimeStatus/.test(originalGame),
  },
  {
    name: 'boot_error_allows_retry_and_logout',
    passed: /actionLabel=\{bootError[\s\S]*?重新校验时长[\s\S]*?secondaryActionLabel=\{showLogoutAction[\s\S]*?退出登录/.test(originalGame) &&
      /\{onSecondaryAction && secondaryActionLabel \? \([\s\S]*?onClick=\{onSecondaryAction\}/.test(bootScreen),
  },
  {
    name: 'client_uses_server_session_rpcs',
    passed: /runStudentPlaytimeRpc\('begin_student_playtime_session'/.test(originalGame) &&
      /runStudentPlaytimeRpc\('heartbeat_student_playtime'/.test(originalGame) &&
      /runStudentPlaytimeRpc\('end_student_playtime_session'/.test(originalGame),
  },
  {
    name: 'client_never_reports_seconds',
    passed: !/supabase\.rpc\('record_student_playtime'/.test(originalGame) &&
      !/p_seconds\s*:/.test(originalGame),
  },
  {
    name: 'local_countdown_uses_elapsed_wall_time_only_for_display',
    passed: /elapsedSeconds = Math\.floor\(\(now - playtimeLocalTickAtRef\.current\) \/ 1000\)/.test(originalGame) &&
      /PLAYTIME_SYNC_INTERVAL_SECONDS \* 1000/.test(originalGame),
  },
  {
    name: 'visibility_and_pagehide_end_server_session',
    passed: /document\.visibilityState === 'hidden'[\s\S]*?pauseVisibleSession\(\)/.test(originalGame) &&
      /window\.addEventListener\('pagehide', pauseVisibleSession\)/.test(originalGame) &&
      /window\.addEventListener\('pageshow', resumeVisibleSession\)/.test(originalGame) &&
      countMatches(originalGame, /sendSupabaseRpcKeepalive\('end_student_playtime_session'/g) >= 2 &&
      /keepalive:\s*true/.test(supabaseClient),
  },
  {
    name: 'lifecycle_uses_distinct_ids_queue_and_epoch_guards',
    passed: /const playtimeSessionIdRef = useRef\(null\)/.test(originalGame) &&
      /const playtimeLifecycleEpochRef = useRef\(0\)/.test(originalGame) &&
      /const playtimeLifecycleQueueRef = useRef\(Promise\.resolve\(\)\)/.test(originalGame) &&
      /const sessionId = `playtime:\$\{createCloudSaveSessionId\(\)\}`/.test(originalGame) &&
      /enqueueStudentPlaytimeLifecycleOperation/.test(originalGame),
  },
  {
    name: 'save_payload_carries_the_current_playtime_lease',
    passed: /playtimeLastSessionIdRef = useRef\(null\)/.test(originalGame) &&
      /playtimeSessionIdRef\.current \|\| playtimeLastSessionIdRef\.current/.test(originalGame) &&
      /playtimeSessionId/.test(originalGame),
  },
  {
    name: 'resume_locks_until_short_abortable_begin_finishes',
    passed: /const PLAYTIME_RPC_TIMEOUT_MS = 8000/.test(originalGame) &&
      /request = request\.abortSignal\(controller\.signal\)/.test(originalGame) &&
      /beginStudentPlaytimeSession[\s\S]*?setPlaytimeLoading\(true\)[\s\S]*?runStudentPlaytimeRpc\('begin_student_playtime_session'/.test(originalGame) &&
      /resumeVisibleSession[\s\S]*?beginStudentPlaytimeSession\(\{ silent: false, retry: true \}\)/.test(originalGame),
  },
  {
    name: 'china_midnight_refresh_runs_even_while_expired',
    passed: /getMillisecondsUntilNextChinaDay/.test(originalGame) &&
      /scheduleNextChinaDayRefresh[\s\S]*?setPlaytimeStatus\(null\)[\s\S]*?beginStudentPlaytimeSession\(\{ silent: false, retry: true \}\)/.test(originalGame),
  },
  {
    name: 'save_rejections_distinguish_playtime_from_revision_conflicts',
    passed: countMatches(originalGame, /isPlaytimeLimitError\(message\)/g) >= 4 &&
      countMatches(originalGame, /saveRow\?\.error_message/g) >= 3 &&
      /markPlaytimeExpiredFromServer/.test(originalGame),
  },
  {
    name: 'server_has_single_authoritative_session_lease_per_student',
    passed: /CREATE TABLE IF NOT EXISTS student_playtime_sessions[\s\S]*?student_id UUID PRIMARY KEY/.test(hardeningMigration) &&
      /FOR UPDATE;/.test(hardeningMigration),
  },
  {
    name: 'server_stale_lease_is_bounded_and_invalidated',
    passed: /v_now TIMESTAMP WITH TIME ZONE := clock_timestamp\(\)/.test(leaseMigration) &&
      /EXTRACT\(EPOCH FROM \(v_now - v_last_heartbeat_at\)\)/.test(leaseMigration) &&
      /v_max_heartbeat_gap_seconds CONSTANT INT := 15/.test(leaseMigration) &&
      /v_lease_stale := v_elapsed_seconds > v_max_heartbeat_gap_seconds/.test(leaseMigration) &&
      /IF v_lease_stale THEN[\s\S]*?SET active = FALSE/.test(leaseMigration),
  },
  {
    name: 'only_begin_can_replace_or_activate_a_session',
    passed: /IF v_action = 'begin'[\s\S]*?session_id = v_requested_session_id[\s\S]*?ELSIF v_action = 'heartbeat'[\s\S]*?v_session_active[\s\S]*?v_session_id = v_requested_session_id/.test(leaseMigration) &&
      !/v_action = 'begin'\s+OR v_session_id IS DISTINCT FROM v_requested_session_id/.test(leaseMigration),
  },
  {
    name: 'stale_heartbeat_and_save_require_a_live_matching_lease',
    passed: /heartbeat_student_playtime[\s\S]*?student_playtime_lease_is_valid\(p_student_id, p_session_id, FALSE\)[\s\S]*?RETURN;/.test(leaseMigration) &&
      countMatches(saveWrapperSource, /student_playtime_lease_is_valid\(p_user_id, v_session_id, TRUE\)/g) === 2 &&
      countMatches(saveWrapperSource, /无法确认当前游玩会话，请重新校验时长。/g) >= 2,
  },
  {
    name: 'expiry_heartbeat_returns_zero_before_lease_validation',
    passed: /remaining_seconds, 0\) <= 0[\s\S]*?RETURN QUERY[\s\S]*?v_status\.remaining_seconds[\s\S]*?student_playtime_lease_is_valid/.test(expiryMigration),
  },
  {
    name: 'legacy_seconds_argument_is_ignored',
    passed: /p_seconds INT/.test(legacyRecordSource) &&
      /'legacy:' \|\| p_student_id::TEXT[\s\S]*?'begin'/.test(legacyRecordSource) &&
      !/p_seconds\s*[+*\/-]/.test(legacyRecordSource),
  },
  {
    name: 'unchecked_save_functions_are_private',
    passed: /RENAME TO save_cloud_game_save_unchecked/.test(hardeningMigration) &&
      /RENAME TO save_cloud_game_state_with_resources_unchecked/.test(hardeningMigration) &&
      /REVOKE ALL ON FUNCTION save_cloud_game_save_unchecked[\s\S]*?FROM PUBLIC, anon, authenticated/.test(hardeningMigration) &&
      /REVOKE ALL ON FUNCTION save_cloud_game_state_with_resources_unchecked[\s\S]*?FROM PUBLIC, anon, authenticated/.test(hardeningMigration),
  },
  {
    name: 'legacy_resource_writes_are_private_and_reset_is_guarded',
    passed: /REVOKE ALL ON FUNCTION adjust_gold\(UUID, INT, TEXT\) FROM PUBLIC, anon, authenticated/.test(lifecycleMigration) &&
      /REVOKE ALL ON FUNCTION adjust_energy\(UUID, INT, TEXT\) FROM PUBLIC, anon, authenticated/.test(lifecycleMigration) &&
      /REVOKE ALL ON FUNCTION consume_energy\(UUID, INT, TEXT\) FROM PUBLIC, anon, authenticated/.test(lifecycleMigration) &&
      /RENAME TO clear_cloud_game_save_unchecked/.test(lifecycleMigration) &&
      /clear_cloud_game_save[\s\S]*?settle_student_playtime_session\(p_user_id, NULL, 'check'\)[\s\S]*?student_playtime_lease_is_valid/.test(leaseMigration),
  },
  {
    name: 'reward_reservation_is_blocked_after_expiry',
    passed: /RENAME TO begin_teacher_reward_claim_unchecked/.test(hardeningMigration) &&
      /REVOKE ALL ON FUNCTION begin_teacher_reward_claim_unchecked\(UUID\)/.test(hardeningMigration) &&
      /CREATE OR REPLACE FUNCTION begin_teacher_reward_claim\([\s\S]*?settle_student_playtime_session\(p_student_id, NULL, 'check'\)[\s\S]*?remaining_seconds, 0\) <= 0/.test(hardeningMigration) &&
      /beginTeacherRewardClaim[\s\S]*?playtimeExpiredRef\.current/.test(originalGame),
  },
  {
    name: 'both_save_wrappers_settle_and_reject_expired_sessions',
    passed: countMatches(saveWrapperSource, /settle_student_playtime_session\(p_user_id, NULL, 'check'\)/g) === 2 &&
      countMatches(saveWrapperSource, /'今日游玩时间已用完。'::TEXT/g) >= 2,
  },
  {
    name: 'direct_game_save_writes_have_expired_guard',
    passed: /CREATE OR REPLACE FUNCTION reject_expired_student_game_save_write\(\)/.test(hardeningMigration) &&
      /CREATE TRIGGER enforce_student_playtime_before_game_save[\s\S]*?BEFORE INSERT OR UPDATE ON game_saves/.test(hardeningMigration) &&
      /reject_expired_student_game_save_write[\s\S]*?settle_student_playtime_session\(NEW\.user_id, NULL, 'check'\)[\s\S]*?student_playtime_lease_is_valid/.test(leaseMigration),
  },
]

const failed = checks.filter((check) => !check.passed)

console.log(JSON.stringify({
  summary: {
    checkCount: checks.length,
    failedCount: failed.length,
  },
  checks,
}, null, 2))

if (failed.length > 0) process.exitCode = 1
