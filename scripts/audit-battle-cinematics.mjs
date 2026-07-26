#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const { MOVES } = await loadModule('/src/utils/gameData.js')
  const { getMoveEffectConfig } = await loadModule('/src/utils/moveVisuals.js')
  const { getBattleCinematicAudit } = await loadModule('/src/utils/battleCinematics.js')
  const audit = getBattleCinematicAudit(MOVES, getMoveEffectConfig)
  const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')
  const originalGame = read('src/components/Game/OriginalGame.jsx')
  const moveEffect = read('src/components/Game/BattleMoveEffect.jsx')
  const lab = read('src/game/BattleVfxLab.jsx')
  const cinematics = read('src/utils/battleCinematics.js')
  const app = read('src/App.jsx')
  const css = read('src/game.css')
  const cinematicCssStart = css.indexOf('/* 镜头、命中停顿与全场色彩。 */')
  const cinematicCssEnd = css.indexOf('/* 伤害数字、暴击、克制与连击节拍。 */', cinematicCssStart)
  const moveEffectCssStart = css.indexOf('.battle-move-effect {')
  const moveEffectCssEnd = css.indexOf('.battle-command-panel {', moveEffectCssStart)
  const cinematicCss = css.slice(cinematicCssStart, cinematicCssEnd)
  const moveEffectCss = css.slice(moveEffectCssStart, moveEffectCssEnd)
  const auditedEffectCss = `${cinematicCss}\n${moveEffectCss}`
  const battleBaseStart = css.indexOf('.anime-battle-bg {')
  const battleBaseEnd = css.indexOf('.battle-scene-meadow {', battleBaseStart)
  const battleBaseCss = css.slice(battleBaseStart, battleBaseEnd)
  const battleEnvironmentStart = css.indexOf('.battle-env-prop--horizon {')
  const battleEnvironmentEnd = css.indexOf('.battle-scene-valley-camp {', battleEnvironmentStart)
  const battleEnvironmentCss = css.slice(battleEnvironmentStart, battleEnvironmentEnd)
  const actorKeyframeCount = new Set([...css.matchAll(/@keyframes\s+(battleActor[A-Za-z0-9_-]+)/g)].map((match) => match[1])).size
  const reactionKeyframeCount = new Set([...css.matchAll(/@keyframes\s+(battleHit[A-Za-z0-9_-]+)/g)].map((match) => match[1])).size

  const checks = [
    { name: 'all_moves_have_valid_cinematic_profile', passed: audit.moveCount === Object.keys(MOVES).length && audit.invalidProfiles.length === 0, actual: audit.invalidProfiles.length },
    { name: 'all_moves_have_unique_cinematic_signature', passed: audit.signatureFingerprintCount === audit.moveCount, actual: audit.signatureFingerprintCount, expected: audit.moveCount },
    { name: 'cinematic_intensity_is_tiered', passed: audit.intensityCount >= 4, actual: audit.intensityCount, expectedAtLeast: 4 },
    { name: 'travel_modes_are_diverse', passed: audit.travelModeCount >= 7, actual: audit.travelModeCount, expectedAtLeast: 7 },
    { name: 'scene_fx_are_diverse', passed: audit.sceneFxCount >= 12, actual: audit.sceneFxCount, expectedAtLeast: 12 },
    { name: 'signature_moves_use_full_scene_treatment', passed: audit.fullSceneMoveCount >= 15, actual: audit.fullSceneMoveCount, expectedAtLeast: 15 },
    { name: 'charge_phase_is_actually_played', passed: /playMovePhaseWithResult\('charge'/.test(originalGame) && /shouldShowTargetEffect[\s\S]*?'charge'/.test(originalGame) },
    { name: 'multi_hit_moves_animate_each_resolved_hit', passed: /const hitSteps = \[\]/.test(originalGame) && /for \(let hitIndex = 0; hitIndex < hitSteps\.length/.test(originalGame) && /damageAmount: hitStep\.damage/.test(originalGame) },
    { name: 'impact_feedback_is_event_driven', passed: /buildBattleImpactFeedback/.test(originalGame) && /BattleImpactFeedback/.test(originalGame) && /battle-impact-feedback/.test(moveEffect) },
    { name: 'move_signature_is_wired_to_actor_hit_camera_and_effect', passed: /battle-move-signature-rhythm-\$\{signatureRhythm\}/.test(originalGame) && /battle-move-signature-impact-\$\{signatureImpact\}/.test(originalGame) && /battle-cinematic--signature-camera-/.test(originalGame) && /data-move-signature=\{signatureStyle\.id/.test(moveEffect) && /battle-vfx-signature/.test(moveEffect) },
    { name: 'hp_damage_chip_is_delayed_and_visible', passed: /battle-meter-damage-chip/.test(originalGame) && /setChipPercent/.test(originalGame) && /setTimeout\(\(\) => setChipPercent\(percent\), 110\)/.test(originalGame) && /\.battle-meter-damage-chip/.test(css) },
    { name: 'camera_and_hit_stop_are_wired', passed: /hitStop: !reducedMotion/.test(originalGame) && /battle-cinematic--camera-/.test(originalGame) && /\.battle-cinematic\.is-hit-stop/.test(css) },
    { name: 'persistent_status_auras_are_rendered', passed: (originalGame.match(/<BattleStatusAura\s*\/>/g) || []).length === 2 && /battle-status-visual--burn/.test(css) && /battle-status-visual--freeze/.test(css) },
    { name: 'actor_motion_keyframes_are_genuinely_diverse', passed: actorKeyframeCount >= 24, actual: actorKeyframeCount, expectedAtLeast: 24 },
    { name: 'hit_reaction_keyframes_are_genuinely_diverse', passed: reactionKeyframeCount >= 20, actual: reactionKeyframeCount, expectedAtLeast: 20 },
    { name: 'signature_scene_css_is_present', passed: ['sun-prism', 'void-beam', 'storm-strike', 'fault-line', 'whiteout', 'tidal-wave', 'detonation', 'time-rift', 'dream-rift', 'sky-dive'].every((scene) => css.includes(`battle-move-effect--scene-${scene}`)) },
    { name: 'effect_renderer_uses_no_bitmap_texture_assets', passed: !/<img\b/i.test(moveEffect) && !/url\s*\(/i.test(moveEffect) && !/background(?:-image)?\s*:\s*url\s*\(/i.test(auditedEffectCss) },
    { name: 'full_scene_layers_use_soft_edge_masks', passed: /battle-vfx-scene-flash[\s\S]*?-webkit-mask-image:\s*radial-gradient[\s\S]*?mask-image:\s*radial-gradient/.test(cinematicCss) && /battle-vfx-scene-lines[\s\S]*?filter:\s*blur/.test(cinematicCss) },
    { name: 'full_scene_and_beam_layers_avoid_repeating_angular_textures', passed: !/repeating-(?:linear|conic)-gradient/i.test(auditedEffectCss) },
    { name: 'beam_surfaces_have_feathered_caps', passed: /\.battle-vfx-beam\s*\{[\s\S]*?border-radius:\s*999px[\s\S]*?-webkit-mask-image:\s*linear-gradient[\s\S]*?filter:\s*blur/.test(moveEffectCss) },
    { name: 'non_beam_travel_modes_do_not_show_generic_impact_bands', passed: ['ground', 'sky', 'pulse', 'self'].every((travel) => new RegExp(`battle-move-effect--travel-${travel} \\.battle-vfx-beam`).test(cinematicCss)) },
    { name: 'sky_impact_uses_soft_bloom_instead_of_polygon_sticker', passed: /travel-sky \.battle-vfx-symbol[\s\S]*?display:\s*none/.test(cinematicCss) && /travel-sky \.battle-vfx-burst\s*\{[\s\S]*?border-radius:\s*50%[\s\S]*?clip-path:\s*none[\s\S]*?filter:\s*blur/.test(cinematicCss) },
    { name: 'time_rift_scales_without_rotating_full_stage_surface', passed: /@keyframes battleTimeRift\s*\{[\s\S]*?transform:\s*scale/.test(cinematicCss) && !/@keyframes battleTimeRift\s*\{[^}]*rotate/i.test(cinematicCss) },
    { name: 'semantic_sharp_shapes_are_glow_softened', passed: /\.battle-vfx-burst\s*\{[\s\S]*?filter:\s*blur/.test(moveEffectCss) && /\.battle-vfx-shards span\s*\{[\s\S]*?filter:\s*blur/.test(moveEffectCss) && /scene-storm-strike \.battle-vfx-projectile-core[\s\S]*?box-shadow/.test(cinematicCss) },
    { name: 'large_quake_and_detonation_surfaces_are_organic_not_polygonal', passed: /battle-move-effect--quake \.battle-vfx-symbol\s*\{[\s\S]*?border-radius:\s*50%[\s\S]*?clip-path:\s*none[\s\S]*?filter:\s*blur/.test(moveEffectCss) && /variant-self-destruct \.battle-vfx-symbol\s*\{[\s\S]*?border-radius:\s*50%[\s\S]*?clip-path:\s*none[\s\S]*?filter:\s*blur/.test(moveEffectCss) && /variant-self-destruct \.battle-vfx-burst\s*\{[\s\S]*?clip-path:\s*none/.test(moveEffectCss) && /variant-self-destruct \.battle-vfx-beam[\s\S]*?display:\s*none/.test(moveEffectCss) && /variant-self-destruct \.battle-vfx-shards span\s*\{[\s\S]*?border-radius:\s*50%[\s\S]*?clip-path:\s*none/.test(moveEffectCss) },
    { name: 'base_battle_stage_avoids_hard_angular_backdrop_bands', passed: /\.anime-battle-bg::before[\s\S]*?radial-gradient/.test(battleBaseCss) && !/linear-gradient\((?:45|135|150)deg/i.test(battleBaseCss) && /filter:\s*saturate\([^)]*\)\s*blur/.test(battleBaseCss) },
    { name: 'base_battle_environment_uses_soft_organic_layers', passed: /battle-env-prop--horizon[\s\S]*?radial-gradient/.test(battleEnvironmentCss) && /battle-env-prop--foreground[\s\S]*?radial-gradient/.test(battleEnvironmentCss) && !/repeating-(?:linear|conic)-gradient/i.test(battleEnvironmentCss) && /filter:\s*blur/.test(battleEnvironmentCss) },
    { name: 'reduced_motion_covers_battle_cinematics', passed: /prefers-reduced-motion:\s*reduce[\s\S]*?battle-cinematic/.test(css) && /reducedMotion[\s\S]*?profile\.hitStopMs/.test(originalGame) },
    { name: 'vfx_quality_has_automatic_budget_tiers', passed: /resolveBattleVfxQuality/.test(originalGame) && /battle-vfx-quality--\$\{battleVfxQuality\}/.test(originalGame) && /battle-vfx-quality--lite/.test(css) && /battle-vfx-quality--standard/.test(css) && /\['lite', 'standard', 'high'\]/.test(cinematics) },
    { name: 'battle_vfx_lab_is_available_without_auth_in_dev', passed: /data-battle-vfx-lab="ready"/.test(lab) && /battleVfxLabEnabled/.test(app) && /<BattleVfxLab\s*\/>/.test(app) },
  ]

  const failed = checks.filter((check) => !check.passed)
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      moveCount: audit.moveCount,
      intensityCount: audit.intensityCount,
      travelModeCount: audit.travelModeCount,
      sceneFxCount: audit.sceneFxCount,
      fullSceneMoveCount: audit.fullSceneMoveCount,
      signatureFingerprintCount: audit.signatureFingerprintCount,
      actorKeyframeCount,
      reactionKeyframeCount,
      checkCount: checks.length,
      failedCount: failed.length,
    },
    checks,
  }, null, 2))

  if (failed.length > 0) process.exitCode = 1
})
