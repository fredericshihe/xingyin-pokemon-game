#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

const SIGNATURE_LIMITS = {
  pattern: 12,
  rhythm: 8,
  impactPattern: 8,
  trailPattern: 6,
}

const groupBy = (entries, getKey) => entries.reduce((groups, entry) => {
  const key = getKey(entry)
  if (!groups[key]) groups[key] = []
  groups[key].push(entry)
  return groups
}, {})

const getVisibleSignatureDimensions = (style = {}) => ({
  pattern: style.pattern,
  rhythm: style.rhythm,
  impact: style.impactPattern,
  trail: style.trailPattern,
  particle: [style.angleOffsetDeg, style.angleStepDeg, style.particleDistancePx, style.particleDelayMs].join(':'),
  ring: [style.ringTiltDeg, style.ringScaleX, style.ringScaleY].join(':'),
  path: [style.pathBend, style.pathBias].join(':'),
  scene: [style.sceneXPercent, style.sceneYPercent].join(':'),
  lobes: (style.lobes || []).map((lobe) => (
    [lobe.xPercent, lobe.yPercent, lobe.widthPercent, lobe.heightPercent, lobe.rotationDeg, lobe.delayMs].join(':')
  )).join('|'),
})

const getDifferenceCount = (left, right) => {
  const leftDimensions = getVisibleSignatureDimensions(left)
  const rightDimensions = getVisibleSignatureDimensions(right)
  return Object.keys(leftDimensions).filter((key) => leftDimensions[key] !== rightDimensions[key]).length
}

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const { MOVES } = await loadModule('/src/utils/gameData.js')
  const { getMoveEffectConfig, getMoveVisualAudit } = await loadModule('/src/utils/moveVisuals.js')
  const { getBattleCinematicAudit, getBattleCinematicProfile } = await loadModule('/src/utils/battleCinematics.js')
  const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')
  const moveEffectSource = read('src/components/Game/BattleMoveEffect.jsx')
  const originalGameSource = read('src/components/Game/OriginalGame.jsx')
  const labSource = read('src/game/BattleVfxLab.jsx')
  const visualSource = read('src/utils/moveVisuals.js')
  const cssSource = read('src/game.css')
  const issues = []

  const entries = Object.entries(MOVES).map(([moveKey, move]) => {
    const config = getMoveEffectConfig(moveKey, move)
    const profile = getBattleCinematicProfile(moveKey, move, config)
    return {
      moveKey,
      name: move.name,
      type: move.type,
      category: move.category,
      power: Number(move.power) || 0,
      semanticFingerprint: config.signature,
      renderFingerprint: config.signatureStyle?.renderFingerprint || '',
      cinematicFingerprint: profile.signatureFingerprint || '',
      style: config.signatureStyle || {},
    }
  })
  const visualAudit = getMoveVisualAudit(MOVES)
  const cinematicAudit = getBattleCinematicAudit(MOVES, getMoveEffectConfig)
  const semanticGroups = groupBy(entries, (entry) => entry.semanticFingerprint)
  const duplicateSemanticGroups = Object.values(semanticGroups)
    .filter((group) => group.length > 1)
    .sort((left, right) => right.length - left.length || left[0].moveKey.localeCompare(right[0].moveKey))
  const renderGroups = groupBy(entries, (entry) => entry.renderFingerprint || 'missing')
  const duplicateRenderGroups = Object.values(renderGroups).filter((group) => group.length > 1)
  const weakDifferencePairs = []

  for (const group of duplicateSemanticGroups) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex]
        const right = group[rightIndex]
        const differenceCount = getDifferenceCount(left.style, right.style)
        if (differenceCount < 4) {
          weakDifferencePairs.push({
            left: { moveKey: left.moveKey, name: left.name },
            right: { moveKey: right.moveKey, name: right.name },
            differenceCount,
          })
        }
      }
    }
  }

  const invalidStyles = entries.filter(({ moveKey, style, renderFingerprint, cinematicFingerprint }) => (
    !style.id
    || !style.id.startsWith(`${moveKey}-`)
    || !Number.isInteger(style.seed)
    || !renderFingerprint
    || !cinematicFingerprint
    || Object.entries(SIGNATURE_LIMITS).some(([key, limit]) => !Number.isInteger(style[key]) || style[key] < 0 || style[key] >= limit)
    || !Array.isArray(style.lobes)
    || style.lobes.length !== 3
    || new Set((style.lobes || []).map((lobe) => (
      [lobe.xPercent, lobe.yPercent, lobe.widthPercent, lobe.heightPercent, lobe.rotationDeg].join(':')
    ))).size !== 3
    || style.lobes.some((lobe) => (
      !Number.isFinite(lobe.xPercent)
      || !Number.isFinite(lobe.yPercent)
      || !Number.isFinite(lobe.widthPercent)
      || !Number.isFinite(lobe.heightPercent)
      || !Number.isFinite(lobe.rotationDeg)
      || !Number.isFinite(lobe.delayMs)
    ))
  )).map(({ moveKey, name }) => ({ moveKey, name }))

  const distributions = Object.fromEntries(Object.entries(SIGNATURE_LIMITS).map(([key]) => [
    key,
    new Set(entries.map((entry) => entry.style[key])).size,
  ]))
  const expectedDistributions = {
    pattern: 12,
    rhythm: 8,
    impactPattern: 8,
    trailPattern: 6,
  }

  const checks = [
    {
      name: 'all_game_moves_are_audited',
      passed: entries.length === Object.keys(MOVES).length && entries.length >= 300,
      actual: entries.length,
      expectedAtLeast: 300,
    },
    {
      name: 'every_move_has_a_unique_render_fingerprint',
      passed: visualAudit.renderSignatureCount === entries.length && duplicateRenderGroups.length === 0,
      actual: visualAudit.renderSignatureCount,
      expected: entries.length,
    },
    {
      name: 'every_move_has_a_unique_cinematic_fingerprint',
      passed: cinematicAudit.signatureFingerprintCount === entries.length,
      actual: cinematicAudit.signatureFingerprintCount,
      expected: entries.length,
    },
    {
      name: 'all_signature_dimensions_are_valid',
      passed: invalidStyles.length === 0,
      actual: invalidStyles.length,
      samples: invalidStyles.slice(0, 12),
    },
    {
      name: 'formerly_similar_moves_differ_in_at_least_four_visible_dimensions',
      passed: weakDifferencePairs.length === 0,
      actual: weakDifferencePairs.length,
      samples: weakDifferencePairs.slice(0, 12),
    },
    ...Object.entries(expectedDistributions).map(([key, expected]) => ({
      name: `signature_${key}_uses_full_design_range`,
      passed: distributions[key] === expected,
      actual: distributions[key],
      expected,
    })),
    {
      name: 'signature_generation_is_stable_and_has_no_runtime_randomness',
      passed: !/getMoveSignatureStyle[\s\S]*?Math\.random/.test(visualSource) && !/getMoveSignatureStyle[\s\S]*?Date\.now/.test(visualSource),
    },
    {
      name: 'renderer_exposes_move_signature_and_visible_pattern_classes',
      passed: /data-move-signature=\{signatureStyle\.id/.test(moveEffectSource)
        && /battle-move-effect--signature-pattern-\$\{signaturePattern\}/.test(moveEffectSource)
        && /battle-move-effect--signature-trail-\$\{signatureTrail\}/.test(moveEffectSource),
    },
    {
      name: 'trajectory_uses_signature_specific_curved_svg_paths',
      passed: /getTrajectoryPath\(source, target, signatureStyle/.test(moveEffectSource)
        && /signatureStyle\?\.pathBend/.test(moveEffectSource)
        && (moveEffectSource.match(/<path className="battle-vfx-trajectory__/g) || []).length === 3,
    },
    {
      name: 'particles_and_soft_lobes_use_signature_specific_geometry_and_timing',
      passed: /className="battle-vfx-signature"/.test(moveEffectSource)
        && /signatureStyle\.lobes/.test(moveEffectSource)
        && /--signature-delay/.test(moveEffectSource)
        && /battleVfxSignatureLobe/.test(cssSource)
        && /radial-gradient\(ellipse/.test(cssSource),
    },
    {
      name: 'all_trail_patterns_change_visible_beam_and_projectile_geometry',
      passed: Array.from({ length: 6 }, (_, index) => index).every((index) => (
        cssSource.includes(`battle-move-effect--signature-trail-${index} .battle-vfx-trajectory__spark`)
        && cssSource.includes(`battle-move-effect--signature-trail-${index} .battle-vfx-projectile-tail`)
      )),
    },
    {
      name: 'actor_hit_and_camera_receive_move_signature_variation',
      passed: /battle-move-signature-rhythm-\$\{signatureRhythm\}/.test(originalGameSource)
        && /battle-move-signature-impact-\$\{signatureImpact\}/.test(originalGameSource)
        && /battle-cinematic--signature-camera-\$\{Number\(battleCinematic\.signatureStyle\?\.impactPattern\)/.test(originalGameSource),
    },
    {
      name: 'vfx_lab_displays_and_exposes_each_signature',
      passed: /data-move-signature=\{config\.signatureStyle\?\.id/.test(labSource)
        && /独立签名/.test(labSource),
    },
    {
      name: 'signature_layer_has_soft_organic_edges',
      passed: /\.battle-vfx-signature\s*\{[\s\S]*?border-radius:\s*50%[\s\S]*?filter:\s*blur/.test(cssSource)
        && /\.battle-vfx-signature span\s*\{[\s\S]*?border-radius:\s*50%[\s\S]*?radial-gradient/.test(cssSource),
    },
  ]

  const failed = checks.filter((check) => !check.passed)
  if (duplicateRenderGroups.length > 0) {
    issues.push({ issue: 'duplicate_render_fingerprints', groups: duplicateRenderGroups.slice(0, 12) })
  }
  if (weakDifferencePairs.length > 0) {
    issues.push({ issue: 'weak_visible_difference_inside_semantic_duplicate_group', pairs: weakDifferencePairs.slice(0, 12) })
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      moveCount: entries.length,
      semanticFingerprintCount: visualAudit.signatureCount,
      duplicateSemanticGroupCount: duplicateSemanticGroups.length,
      duplicateSemanticMoveCount: duplicateSemanticGroups.reduce((count, group) => count + group.length, 0),
      renderFingerprintCount: visualAudit.renderSignatureCount,
      cinematicFingerprintCount: cinematicAudit.signatureFingerprintCount,
      weakDifferencePairCount: weakDifferencePairs.length,
      distributions,
      checkCount: checks.length,
      failedCount: failed.length,
      issueCount: issues.length,
    },
    formerlySimilarGroups: duplicateSemanticGroups.map((group) => group.map(({ moveKey, name }) => ({ moveKey, name }))),
    checks,
    issues,
  }, null, 2))

  if (failed.length > 0 || issues.length > 0) process.exitCode = 1
})
