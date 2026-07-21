#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

const CARD_LABEL_BY_RANK = {
  immune: '无效',
  verySuper: '强克',
  super: '克制',
  veryResisted: '很不利',
  resisted: '不利',
  neutral: '一般'
}

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const { TYPES, TYPE_NAMES_CN, getEffectiveness } = await loadModule('/src/utils/constants.js')
  const { MONSTERS, MOVES } = await loadModule('/src/utils/gameData.js')
  const {
    getBattlePokemonTypes,
    getBattleTypeWeaknesses,
    getMoveEffectivenessMeta,
    getTypeEffectivenessBreakdown,
    getTypeEffectivenessRank
  } = await loadModule('/src/utils/battleDamage.js')

  const issues = []
  const damagingMoves = Object.entries(MOVES)
    .filter(([, move]) => move && move.category !== 'status' && Number(move.power) > 0)

  for (const [moveKey, move] of damagingMoves) {
    for (const defender of MONSTERS) {
      const defenderTypes = getBattlePokemonTypes(defender)
      if (defenderTypes.length === 0) continue

      const breakdown = getTypeEffectivenessBreakdown(move.type, defender)
      const expectedRank = getTypeEffectivenessRank(breakdown.effectiveness)
      const expectedLabel = CARD_LABEL_BY_RANK[expectedRank]
      const meta = getMoveEffectivenessMeta(move, defender, { type: move.type })

      if (meta.rank !== expectedRank || meta.effectiveness !== breakdown.effectiveness || meta.label !== expectedLabel) {
        issues.push({
          issue: 'move_card_effectiveness_mismatch',
          moveKey,
          moveName: move.name,
          defenderId: defender.id,
          defenderName: defender.name,
          expectedRank,
          expectedLabel,
          actualRank: meta.rank,
          actualLabel: meta.label,
          expectedEffectiveness: breakdown.effectiveness,
          actualEffectiveness: meta.effectiveness
        })
      }
    }
  }

  for (const defender of MONSTERS) {
    const defenderTypes = getBattlePokemonTypes(defender)
    if (defenderTypes.length === 0) continue

    const expectedWeaknesses = Object.values(TYPES)
      .map((type, index) => ({
        type,
        typeName: TYPE_NAMES_CN[type] || type,
        effectiveness: defenderTypes.reduce((total, defenderType) => total * getEffectiveness(type, defenderType), 1),
        index
      }))
      .filter((row) => row.effectiveness > 1)
      .sort((left, right) => right.effectiveness - left.effectiveness || left.index - right.index)

    const actualWeaknesses = getBattleTypeWeaknesses(defender).weaknesses
    const expectedKey = expectedWeaknesses.map((row) => `${row.type}:${row.effectiveness}`).join('|')
    const actualKey = actualWeaknesses.map((row) => `${row.type}:${row.effectiveness}`).join('|')

    if (actualKey !== expectedKey) {
      issues.push({
        issue: 'hud_weakness_hint_mismatch',
        defenderId: defender.id,
        defenderName: defender.name,
        expected: expectedWeaknesses.map((row) => `${row.typeName}x${row.effectiveness}`),
        actual: actualWeaknesses.map((row) => `${row.typeName}x${row.effectiveness}`)
      })
    }
  }

  const originalGameSource = fs.readFileSync(path.join(rootDir, 'src/components/Game/OriginalGame.jsx'), 'utf8')
  const staleHudTexts = [
    ['双方都有', '克制招式'].join(''),
    ['你有', '克制招式'].join(''),
    ['有', '克制招式'].join(''),
    ['注意对手', '克制'].join(''),
    ['弱点', '可突破'].join('')
  ]
  for (const staleText of staleHudTexts) {
    if (originalGameSource.includes(staleText)) {
      issues.push({ issue: 'stale_hud_hint_text', staleText })
    }
  }

  if (issues.length > 0) {
    console.error(`Battle effectiveness hint audit failed: ${issues.length} issue(s)`)
    console.error(JSON.stringify(issues.slice(0, 40), null, 2))
    process.exit(1)
  }

  console.log('Battle effectiveness hint audit passed.')
  console.log(`- checked move card labels: ${damagingMoves.length} moves x ${MONSTERS.length} defenders`)
  console.log(`- checked HUD weakness hints: ${MONSTERS.length} defenders`)
})
