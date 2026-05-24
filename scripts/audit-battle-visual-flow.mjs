#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')

const originalGame = read('src/components/Game/OriginalGame.jsx')
const battlePacing = read('src/utils/battlePacing.js')
const css = read('src/index.css')

const checks = [
  {
    name: 'secondary_phase_has_own_duration',
    passed: /BATTLE_MOVE_SECONDARY_MS/.test(battlePacing) && /secondary:\s*BATTLE_MOVE_SECONDARY_MS/.test(battlePacing),
  },
  {
    name: 'secondary_phase_has_short_impact_delay',
    passed: /phase === 'secondary'/.test(battlePacing),
  },
  {
    name: 'secondary_visual_uses_result_only_class',
    passed: /const isSecondaryResult = effect\.phase === 'secondary'/.test(originalGame) &&
      /isSecondaryResult \? 'secondary-result'/.test(originalGame),
  },
  {
    name: 'secondary_visual_does_not_move_actor',
    passed: /const isSecondaryResultPhase = phase === 'secondary'/.test(originalGame) &&
      /const shouldMoveActor = !isSecondaryResultPhase/.test(originalGame),
  },
  {
    name: 'damaging_move_secondary_effects_use_secondary_phase',
    passed: /const secondaryResultPhase = move\.category === 'status' \|\| move\.power <= 0 \? 'status' : 'secondary'/.test(originalGame) &&
      (originalGame.match(/playMovePhaseWithResult\(secondaryResultPhase/g) || []).length >= 4,
  },
  {
    name: 'drain_followup_no_longer_replays_attack',
    passed: /move\.effect === 'drain'[\s\S]*?playMovePhaseWithResult\('secondary'/.test(originalGame),
  },
  {
    name: 'move_visual_event_is_cleared_after_its_phase',
    passed: /const visualId = `\$\{moveKey\}-\$\{attackerSide\}-\$\{phase\}/.test(originalGame) &&
      /setMoveVisualEvent\(\(prev\) => prev\?\.id === visualId \? null : prev\)/.test(originalGame),
  },
  {
    name: 'non_active_battle_phase_clears_parent_move_visual_event',
    passed: /if \(!moveVisualEvent\) return;[\s\S]*?if \(view === 'battle' && battlePhase === 'active'\) return;[\s\S]*?setMoveVisualEvent\(null\);/.test(originalGame),
  },
  {
    name: 'non_active_battle_phase_clears_local_attack_effect',
    passed: /if \(battlePhase === 'active' && !openingIntro && !openingSendOut\) return;[\s\S]*?clearBattleVisualTimers\(\);[\s\S]*?setAttackEffect\(null\);/.test(originalGame),
  },
  {
    name: 'player_turn_has_in_flight_guard',
    passed: /const battleTurnInFlightRef = useRef\(false\)/.test(originalGame) &&
      /if \(battleTurnInFlightRef\.current\) return/.test(originalGame) &&
      /battleTurnInFlightRef\.current = false/.test(originalGame),
  },
  {
    name: 'enemy_turn_has_in_flight_guard',
    passed: /const enemyTurnInFlightRef = useRef\(false\)/.test(originalGame) &&
      /enemyTurnInFlightRef\.current/.test(originalGame) &&
      /enemyTurnInFlightRef\.current = false/.test(originalGame),
  },
  {
    name: 'trainer_intro_uses_party_ball_icons',
    passed: /className="battle-intro-trainer-meta"[\s\S]*?<BattlePartyBalls[\s\S]*?battle-party-balls--intro/.test(originalGame) &&
      /showActive=\{false\}/.test(originalGame) &&
      !/trainerTeamSize\}只宝可梦/.test(originalGame),
  },
  {
    name: 'trainer_intro_party_balls_are_styled',
    passed: /\.battle-party-balls--intro \.battle-party-ball/.test(css) &&
      /@keyframes battleIntroPartyBallIn/.test(css),
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
