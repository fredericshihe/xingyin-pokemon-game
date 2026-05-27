#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

const MIN_VISUAL_COUNT = 30
const MIN_HIT_REACTION_COUNT = 12
const MIN_VARIANT_COUNT = 12
const MIN_SEMANTIC_TAG_COUNT = 60
const MIN_SIGNATURE_COUNT = 70

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const { MOVES, MONSTERS } = await loadModule('/src/utils/gameData.js')
  const { getMoveEffectConfig, getMoveVisualAudit } = await loadModule('/src/utils/moveVisuals.js')
  const {
    calculateBattleDamage,
    getMoveEffectivenessMeta,
    getTypeEffectivenessBreakdown,
    getTypeEffectivenessRank,
  } = await loadModule('/src/utils/battleDamage.js')
  const audit = getMoveVisualAudit(MOVES)
  const issues = []
  const warnings = []
  let effectivenessPairCount = 0

  if (audit.missingVisuals.length > 0) {
    issues.push({
      issue: 'move_visual_config_incomplete',
      count: audit.missingVisuals.length,
      samples: audit.missingVisuals.slice(0, 12),
    })
  }

  if (audit.unsupportedVisuals.length > 0) {
    issues.push({
      issue: 'move_visual_config_unsupported_value',
      count: audit.unsupportedVisuals.length,
      samples: audit.unsupportedVisuals.slice(0, 12),
    })
  }

  if (audit.orphanVisuals.length > 0) {
    warnings.push({
      issue: 'orphan_explicit_visual_config',
      count: audit.orphanVisuals.length,
      samples: audit.orphanVisuals.slice(0, 12),
    })
  }

  if (audit.visualCount < MIN_VISUAL_COUNT) {
    issues.push({ issue: 'move_visual_diversity_too_low', actual: audit.visualCount, expectedAtLeast: MIN_VISUAL_COUNT })
  }

  if (audit.hitReactionCount < MIN_HIT_REACTION_COUNT) {
    issues.push({ issue: 'hit_reaction_diversity_too_low', actual: audit.hitReactionCount, expectedAtLeast: MIN_HIT_REACTION_COUNT })
  }

  if (audit.variantCount < MIN_VARIANT_COUNT) {
    issues.push({ issue: 'move_variant_diversity_too_low', actual: audit.variantCount, expectedAtLeast: MIN_VARIANT_COUNT })
  }

  if (audit.semanticTagCount < MIN_SEMANTIC_TAG_COUNT) {
    issues.push({ issue: 'move_semantic_tag_diversity_too_low', actual: audit.semanticTagCount, expectedAtLeast: MIN_SEMANTIC_TAG_COUNT })
  }

  if (audit.signatureCount < MIN_SIGNATURE_COUNT) {
    issues.push({ issue: 'move_signature_diversity_too_low', actual: audit.signatureCount, expectedAtLeast: MIN_SIGNATURE_COUNT })
  }

  for (const [moveKey, move] of Object.entries(MOVES)) {
    const config = getMoveEffectConfig(moveKey, move)
    if (!['self', 'foe'].includes(config.target)) {
      issues.push({ issue: 'invalid_move_visual_target', moveKey, name: move.name, target: config.target })
    }
    if (!(Number(config.particleCount) >= 6 && Number(config.particleCount) <= 18)) {
      issues.push({ issue: 'invalid_move_particle_count', moveKey, name: move.name, particleCount: config.particleCount })
    }
    if (!(Number(config.shardCount) >= 6 && Number(config.shardCount) <= 16)) {
      issues.push({ issue: 'invalid_move_shard_count', moveKey, name: move.name, shardCount: config.shardCount })
    }
    if (!Array.isArray(config.semanticTags) || config.semanticTags.length === 0) {
      issues.push({ issue: 'missing_move_semantic_tags', moveKey, name: move.name, semanticTags: config.semanticTags })
    }

    const sampleMeta = getMoveEffectivenessMeta(move, MONSTERS[0])
    if (move.category === 'status' || !(Number(move.power) > 0)) {
      if (sampleMeta.rank !== 'status') {
        issues.push({ issue: 'status_move_effectiveness_rank_mismatch', moveKey, name: move.name, actual: sampleMeta.rank })
      }
      continue
    }

    for (const monster of MONSTERS) {
      const breakdown = getTypeEffectivenessBreakdown(move.type, monster)
      if (breakdown.defenderTypes.length === 0) continue
      const expectedRank = getTypeEffectivenessRank(breakdown.effectiveness)
      const attackerStub = {
        id: 999999,
        name: 'audit-attacker',
        level: 50,
        atk: 100,
        def: 100,
        spAtk: 100,
        spDef: 100,
        spd: 100,
        type: move.type,
        type2: null,
        maxHp: 200,
      }
      const actualMeta = getMoveEffectivenessMeta(move, monster, attackerStub)
      const liveBattleOutcome = calculateBattleDamage(attackerStub, {
        ...monster,
        currentHp: monster.currentHp ?? monster.maxHp ?? 200,
        maxHp: monster.maxHp ?? 200
      }, move, {
        randomFactor: 1,
        applySameLevelCap: false,
        burnHalvesPhysicalAtk: false
      })
      effectivenessPairCount += 1
      if (actualMeta.rank !== expectedRank || actualMeta.effectiveness !== breakdown.effectiveness) {
        issues.push({
          issue: 'move_effectiveness_meta_mismatch',
          moveKey,
          moveName: move.name,
          monsterId: monster.id,
          monsterName: monster.name,
          expectedRank,
          actualRank: actualMeta.rank,
          expectedEffectiveness: breakdown.effectiveness,
          actualEffectiveness: actualMeta.effectiveness,
        })
      }
      if (actualMeta.effectiveness !== liveBattleOutcome.effectiveness) {
        issues.push({
          issue: 'move_effectiveness_meta_not_matching_live_battle',
          moveKey,
          moveName: move.name,
          monsterId: monster.id,
          monsterName: monster.name,
          metaEffectiveness: actualMeta.effectiveness,
          battleEffectiveness: liveBattleOutcome.effectiveness,
        })
      }
    }
  }

  const expectedSemanticTags = {
    quickattack: { absent: ['electric'] },
    razorleaf: { present: ['leaf', 'blade'], absent: ['sky'] },
    hyper_voice: { present: ['sound', 'roar'], absent: ['ice'] },
    echoed_voice: { present: ['sound', 'roar'], absent: ['ice'] },
    disarming_voice: { present: ['sound', 'fairy'], absent: ['ice'] },
    solar_beam: { present: ['beam', 'light'] },
    will_o_wisp: { present: ['burn', 'flame'] },
    thunder_wave: { present: ['paralysis', 'wave', 'electric'] },
    bone_rush: { present: ['multi', 'bone'] },
    shell_smash: { present: ['shield', 'shell'] },
    pay_day: { present: ['coin'] },
    swift: { present: ['star'] },
  }

  for (const [moveKey, expectations] of Object.entries(expectedSemanticTags)) {
    const move = MOVES[moveKey]
    const tags = getMoveEffectConfig(moveKey, move).semanticTags || []
    for (const tag of expectations.present || []) {
      if (!tags.includes(tag)) {
        issues.push({ issue: 'move_semantic_tag_expected_missing', moveKey, name: move?.name, tag, actual: tags })
      }
    }
    for (const tag of expectations.absent || []) {
      if (tags.includes(tag)) {
        issues.push({ issue: 'move_semantic_tag_false_positive', moveKey, name: move?.name, tag, actual: tags })
      }
    }
  }

  const unknownMeta = getMoveEffectivenessMeta(
    { name: 'Audit Thunder', type: 'electric', power: 40, category: 'special' },
    {}
  )
  if (unknownMeta.rank !== 'unknown') {
    issues.push({
      issue: 'unknown_defender_type_should_not_display_neutral',
      expected: 'unknown',
      actual: unknownMeta.rank,
    })
  }

  const originalGameSource = fs.readFileSync(path.join(rootDir, 'src/components/Game/OriginalGame.jsx'), 'utf8')
  const battleDamageSource = fs.readFileSync(path.join(rootDir, 'src/utils/battleDamage.js'), 'utf8')
  const cssSource = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf8')

  if (originalGameSource.includes("!['neutral', 'status'].includes(effectivenessMeta.rank)")) {
    issues.push({
      issue: 'effectiveness_badge_hides_neutral_or_status',
      file: 'src/components/Game/OriginalGame.jsx',
    })
  }

  if (!/getMoveEffectivenessMeta\(move,\s*battleEnemyMon,\s*battlePlayerMon\)/.test(originalGameSource)) {
    issues.push({
      issue: 'battle_move_button_not_using_live_battle_participants_for_effectiveness',
      file: 'src/components/Game/OriginalGame.jsx',
    })
  }

  if (!/getBattleMoveEffectivenessResult\(move,\s*defender,\s*attacker\)/.test(battleDamageSource)) {
    issues.push({
      issue: 'battle_damage_not_using_shared_effectiveness_result',
      file: 'src/utils/battleDamage.js',
    })
  }

  if (!/battle-move-effect--variant-\$\{visualVariant\}/.test(originalGameSource)) {
    issues.push({
      issue: 'move_visual_variant_class_not_rendered',
      file: 'src/components/Game/OriginalGame.jsx',
    })
  }

  if (!/battle-move-effect--tag-\$\{tag\}/.test(originalGameSource) || !/battle-vfx-icon/.test(originalGameSource)) {
    issues.push({
      issue: 'move_semantic_tag_or_icon_not_rendered',
      file: 'src/components/Game/OriginalGame.jsx',
    })
  }

  if (!/battle-move-effect__projectile/.test(originalGameSource) || !/--effect-source-x/.test(originalGameSource)) {
    issues.push({
      issue: 'move_projectile_layer_not_rendered',
      file: 'src/components/Game/OriginalGame.jsx',
    })
  }

  if (!/battle-move-effect--tag-fang/.test(cssSource) || !/battle-move-effect--tag-sound/.test(cssSource) || !/battle-move-effect--tag-shield/.test(cssSource) || !/battle-move-effect--tag-coin/.test(cssSource) || !/battle-move-effect--tag-shell/.test(cssSource)) {
    issues.push({
      issue: 'move_semantic_tag_css_missing',
      file: 'src/index.css',
    })
  }

  if (!/battle-move-effect--move-solar_beam/.test(cssSource) || !/battle-move-effect--move-will_o_wisp/.test(cssSource) || !/battleVfxElectroWave/.test(cssSource)) {
    issues.push({
      issue: 'move_specific_signature_css_missing',
      file: 'src/index.css',
    })
  }

  if (!/rank:\s*'unknown'/.test(battleDamageSource) || !/battle-move-effectiveness--unknown/.test(cssSource)) {
    issues.push({
      issue: 'unknown_type_effectiveness_ui_missing',
      files: ['src/utils/battleDamage.js', 'src/index.css'],
    })
  }

  const summary = {
    auditedMoveCount: audit.moveCount,
    explicitVisualCount: audit.explicitVisualCount,
    generatedVisualCount: audit.generatedVisualCount,
    visualCount: audit.visualCount,
    hitReactionCount: audit.hitReactionCount,
    variantCount: audit.variantCount,
    semanticTagCount: audit.semanticTagCount,
    signatureCount: audit.signatureCount,
    effectivenessPairCount,
    issueCount: issues.length,
    warningCount: warnings.length,
    warnings,
    issues,
  }

  console.log(JSON.stringify(summary, null, 2))
  if (issues.length > 0) {
    process.exitCode = 1
  }
})
