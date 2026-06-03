#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const originalGameSource = read('src/components/Game/OriginalGame.jsx')
const progressSource = read('src/utils/pokemonProgress.js')
const battleAiSource = read('src/utils/battleAi.js')

const failures = []
const warnings = []

const requiredMarkers = [
  ['cloud default includes growth queue', 'pendingGrowthEvents: [],', originalGameSource],
  ['cloud normalize keeps growth queue', 'pendingGrowthEvents: progressRoster.pendingGrowthEvents,', originalGameSource],
  ['cloud apply restores growth queue', 'setPendingGrowthEvents(pendingGrowthEvents);', originalGameSource],
  ['evolution keeps current moves', "moves: preservedMoves.length > 0 ? preservedMoves : getBalancedMovesForLevel(targetBase, monster.level),", originalGameSource],
  ['evolution follow-up learn-move helper exists', 'const buildEvolutionFollowUpLearnMoveEvents = ({', originalGameSource],
  ['evolution appends follow-up learn events', 'const evolutionLearnEvents = buildEvolutionFollowUpLearnMoveEvents({', originalGameSource],
  ['learn-move full-slot protection exists', "return abortCloudSnapshotCommit(`${baseMon.name} 的技能已满，请先选择要遗忘的技能。`, 'info');", originalGameSource],
  ['zero-cost forget confirmation modal exists', '确认忘记 {pendingForgetMove.name}？', originalGameSource],
  ['zero-cost forget risk copy exists', '替换后队伍技能里可能没有 0 MP 技能，MP 不够时会无法攻击，需要用伤药恢复 MP。', originalGameSource],
  ['battle no-mp hint helper exists', 'const getNoMpBattleHint = (mon) => (', originalGameSource],
  ['battle move-specific mp shortage hint exists', 'const getMoveMpShortageHint = (mon, move) => (', originalGameSource],
  ['battle no-mp deadlock hint exists', 'const getNoMpBattleDeadlockHint = () => (', originalGameSource],
  ['battle no-mp recovery-path helper exists', 'const hasBattleRecoveryPath = ({', originalGameSource],
  ['battle turn blocks unaffordable move before resolution', 'const shortageMessage = getAffordableBattleMoveKeys(currentPlayer).length === 0', originalGameSource],
  ['battle turn shows no-mp notification', "addNotification(shortageMessage, 'warning');", originalGameSource],
  ['battle scene shows persistent no-mp overlay', 'className="battle-no-mp-overlay"', originalGameSource],
  ['battle scene shows no-mp hard-lock warning', 'battle-no-mp-overlay__meter--warn', originalGameSource],
  ['battle move buttons disable when mp insufficient', 'disabled={activePlayerActionDisabled || !hasEnoughMp || isMoveDisabledByCharge}', originalGameSource],
  ['battle no-mp hard-lock failover ref exists', 'const battleNoMpResolutionKeyRef = useRef(null);', originalGameSource],
  ['battle no-mp hard-lock failover effect exists', '队伍也没有可恢复战斗的手段。', originalGameSource],
  ['battle potion restores mp in snapshot', 'currentMp: Math.min(baseMaxMp, baseCurrentMp + recoveryProfile.mp)', originalGameSource],
  ['battle potion yields turn to enemy', "turn: shouldYieldTurnToEnemy ? 'enemy' : baseSnapshot.turn,", originalGameSource],
  ['exp potion blocked in battle bag flow', "if (isBattle && (item.type === 'expPotion' || item.type === 'statBoost')) {", originalGameSource],
  ['enemy ai no-mp fallback handled', 'if (affordableMoves.length === 0) return null', battleAiSource],
  ['progress queue dedupe includes learn move', "if (evt.type === 'learnMove') return `learnMove:${evt.monId}:${evt.moveKey}`", progressSource],
  ['progress queue supports evolution choice events', "if (evt.type === 'evolutionChoice') {", progressSource],
]

for (const [label, marker, source] of requiredMarkers) {
  if (!source.includes(marker)) {
    failures.push(`Missing ${label}: ${marker}`)
  }
}

if (
  originalGameSource.includes("moves: getBalancedMovesForLevel(targetBase, monster.level)") &&
  !originalGameSource.includes("moves: preservedMoves.length > 0 ? preservedMoves : getBalancedMovesForLevel(targetBase, monster.level),")
) {
  failures.push('Forbidden evolution move wipe fallback detected.')
}

if (originalGameSource.includes("mon.moves.unshift('tackle');")) {
  failures.push('Forbidden runtime zero-cost move injection detected.')
}

const noMpHintExists = originalGameSource.includes('battle-no-mp-overlay') &&
  originalGameSource.includes('getNoMpOverlayBody()') &&
  originalGameSource.includes('getNoMpBattleHint(battlePlayerMon)')
if (!noMpHintExists) {
  failures.push('Battle UI no longer exposes a persistent no-MP overlay near the move grid.')
}

const warningCopyVariants = [
  'MP 不足，暂时无法使用任何技能',
  '可以打开背包使用伤药恢复 MP，或更换宝可梦继续对战',
]
for (const text of warningCopyVariants) {
  if (!originalGameSource.includes(text)) {
    warnings.push(`Expected player-facing MP guidance copy is missing fragment: ${text}`)
  }
}

if (failures.length > 0) {
  console.error('Growth / battle guard audit failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  if (warnings.length > 0) {
    console.error('Warnings:')
    warnings.forEach((warning) => console.error(`- ${warning}`))
  }
  process.exit(1)
}

console.log('Growth / battle guard audit passed.')
console.log(JSON.stringify({
  ok: true,
  checkedAreas: [
    'growth queue persistence',
    'evolution move preservation',
    'post-evolution learn-move queueing',
    'zero-cost forget confirmation',
    'battle no-mp guidance',
    'battle move disabling by mp',
    'battle potion mp recovery and turn yield',
    'enemy no-mp fallback'
  ],
  warnings,
}, null, 2))
