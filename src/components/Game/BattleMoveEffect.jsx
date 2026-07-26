import React from 'react'
import { MOVES } from '../../utils/gameData'
import { getMoveEffectConfig } from '../../utils/moveVisuals'
import { getBattleCinematicProfile } from '../../utils/battleCinematics'
import { BATTLE_EFFECT_FALLBACK_ANCHORS } from '../../utils/battleEffectAnchors'
import { getBattleMovePhaseDuration } from '../../utils/battlePacing'

const safeClassName = (value, fallback) => String(value || fallback)
  .replace(/[^a-z0-9_-]/gi, '-')
  .toLowerCase()

const parseEffectCoordinate = (value, fallback) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

const getTrajectoryPath = (source, target, signatureStyle, travel) => {
  const sourceX = parseEffectCoordinate(source?.x, 24)
  const sourceY = parseEffectCoordinate(source?.y, 72)
  const targetX = parseEffectCoordinate(target?.x, 76)
  const targetY = parseEffectCoordinate(target?.y, 34)
  const bendScale = travel === 'beam' ? 0.24 : 1
  const controlX = ((sourceX + targetX) / 2) + ((Number(signatureStyle?.pathBias) || 0) * bendScale)
  const controlY = ((sourceY + targetY) / 2) + ((Number(signatureStyle?.pathBend) || 0) * bendScale)
  return `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`
}

export function BattleMoveEffect({ effect, onDone }) {
  if (!effect) return null

  const move = effect.move || (effect.moveKey ? MOVES[effect.moveKey] : null)
  const moveConfig = getMoveEffectConfig(effect.moveKey, move || effect)
  const profile = effect.profile || getBattleCinematicProfile(
    effect.moveKey,
    move || effect,
    moveConfig,
    {
      phase: effect.phase,
      hitCount: effect.feedback?.hitCount,
      hitIndex: effect.feedback?.hitIndex,
      durationMs: effect.durationMs,
    }
  )
  const isSecondaryResult = effect.phase === 'secondary'
  const visual = isSecondaryResult ? 'secondary-result' : (moveConfig.visual || 'impact')
  const moveClass = safeClassName(isSecondaryResult ? 'secondary-result' : effect.moveKey, 'unknown')
  const visualVariant = safeClassName(moveConfig.variant, 'physical')
  const hitReactionClass = safeClassName(moveConfig.hitReaction, 'bump')
  const intensityClass = safeClassName(profile.intensity, 'medium')
  const travelClass = safeClassName(profile.travel, 'projectile')
  const sceneFxClass = safeClassName(profile.sceneFx, 'neutral')
  const semanticTags = Array.isArray(moveConfig.semanticTags)
    ? moveConfig.semanticTags.map((tag) => safeClassName(tag, '')).filter(Boolean)
    : []
  const semanticTagClasses = semanticTags.map((tag) => `battle-move-effect--tag-${tag}`).join(' ')
  const iconClass = String(moveConfig.icon || 'fa-solid fa-star')
  const accent = moveConfig.accent || '#ffffff'
  const core = moveConfig.core || '#64748b'
  const glow = moveConfig.glow || 'rgba(255,255,255,0.7)'
  const actorSide = effect.attackerSide === 'enemy' ? 'enemy' : 'player'
  const targetSide = effect.target === 'player' ? 'player' : 'enemy'
  const anchors = effect.anchors || BATTLE_EFFECT_FALLBACK_ANCHORS
  const source = anchors[actorSide] || BATTLE_EFFECT_FALLBACK_ANCHORS[actorSide]
  const target = anchors[targetSide] || BATTLE_EFFECT_FALLBACK_ANCHORS[targetSide]
  const targetMode = moveConfig.target === 'self' ? 'self' : 'foe'
  const particleBase = Number(moveConfig.particleCount) || (
    ['blizzard', 'hurricane', 'rock-slide', 'fire-blast'].includes(visual) ? 14 : 10
  )
  const shardBase = Number(moveConfig.shardCount) || (
    ['rock-slide', 'blizzard', 'quake'].includes(visual) ? 12 : 8
  )
  const particleCount = Math.max(6, Math.min(24, Math.round(particleBase * (profile.particleMultiplier || 1))))
  const shardCount = Math.max(6, Math.min(20, Math.round(shardBase * (profile.particleMultiplier || 1))))
  const effectDuration = Math.max(520, Number(effect.durationMs) || profile.durationMs || getBattleMovePhaseDuration(effect.phase))
  const effectScale = Math.max(0.72, Math.min(1.42, Number(moveConfig.scale) || 1))
  const signatureStyle = moveConfig.signatureStyle || {}
  const signatureLobes = Array.isArray(signatureStyle.lobes) ? signatureStyle.lobes.slice(0, 3) : []
  const signaturePattern = Number(signatureStyle.pattern) || 0
  const signatureRhythm = Number(signatureStyle.rhythm) || 0
  const signatureImpact = Number(signatureStyle.impactPattern) || 0
  const signatureTrail = Number(signatureStyle.trailPattern) || 0
  const trajectoryPath = getTrajectoryPath(source, target, signatureStyle, profile.travel)
  const particleDelay = (index) => `${index * (Number(signatureStyle.particleDelayMs) || 8)}ms`

  return (
    <div
      key={effect.id}
      className={`battle-move-effect battle-move-effect--${visual} battle-move-effect--move-${moveClass} battle-move-effect--variant-${visualVariant} battle-move-effect--reaction-${hitReactionClass} battle-move-effect--intensity-${intensityClass} battle-move-effect--travel-${travelClass} battle-move-effect--scene-${sceneFxClass} battle-move-effect--signature-pattern-${signaturePattern} battle-move-effect--signature-rhythm-${signatureRhythm} battle-move-effect--signature-impact-${signatureImpact} battle-move-effect--signature-trail-${signatureTrail} ${profile.fullScene ? 'battle-move-effect--full-scene' : ''} ${semanticTagClasses} battle-move-effect--type-${move?.type || effect.type || 'normal'} battle-move-effect--from-${actorSide} battle-move-effect--to-${targetSide} battle-move-effect--target-${targetMode} battle-move-effect--phase-${effect.phase || 'hit'}`}
      data-move-signature={signatureStyle.id || moveClass}
      style={{
        '--move-accent': accent,
        '--move-core': core,
        '--move-glow': glow,
        '--move-effect-duration': `${effectDuration}ms`,
        '--effect-source-x': source.x,
        '--effect-source-y': source.y,
        '--effect-target-x': target.x,
        '--effect-target-y': target.y,
        '--move-effect-scale': effectScale,
        '--move-hit-index': Number(effect.feedback?.hitIndex) || 0,
        '--move-hit-count': Math.max(1, Number(effect.feedback?.hitCount) || 1),
        '--move-signature-phase': `${Number(signatureStyle.phaseDeg) || 0}deg`,
        '--move-signature-angle-offset': `${Number(signatureStyle.angleOffsetDeg) || 0}deg`,
        '--move-signature-angle-step': `${Number(signatureStyle.angleStepDeg) || 37}deg`,
        '--move-signature-distance': `${Number(signatureStyle.particleDistancePx) || 68}px`,
        '--move-signature-ring-tilt': `${Number(signatureStyle.ringTiltDeg) || 0}deg`,
        '--move-signature-ring-scale-x': Number(signatureStyle.ringScaleX) || 1,
        '--move-signature-ring-scale-y': Number(signatureStyle.ringScaleY) || 1,
        '--move-signature-scene-x': `${Number(signatureStyle.sceneXPercent) || 50}%`,
        '--move-signature-scene-y': `${Number(signatureStyle.sceneYPercent) || 50}%`,
        '--move-signature-dash-a': Number(signatureStyle.dashA) || 12,
        '--move-signature-dash-b': Number(signatureStyle.dashB) || 8,
        '--move-signature-opacity': Number(signatureStyle.signatureOpacity) || 0.3,
      }}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) onDone?.()
      }}
    >
      <div className="battle-move-effect__scene">
        <span className="battle-vfx-scene-flash" />
        <span className="battle-vfx-scene-lines" />
        <span className="battle-vfx-scene-weather" />
      </div>
      <svg className="battle-vfx-trajectory" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className="battle-vfx-trajectory__glow" d={trajectoryPath} pathLength="100" />
        <path className="battle-vfx-trajectory__core" d={trajectoryPath} pathLength="100" />
        <path className="battle-vfx-trajectory__spark" d={trajectoryPath} pathLength="100" />
      </svg>
      <div className="battle-move-effect__projectile">
        <div className="battle-vfx-projectile-tail" />
        <div className="battle-vfx-projectile-core" />
        <div className="battle-vfx-projectile-spark" />
      </div>
      <div className="battle-move-effect__target">
        <div className="battle-vfx-signature">
          {signatureLobes.map((lobe, index) => (
            <span
              key={index}
              style={{
                '--signature-lobe-x': `${Number(lobe.xPercent) || 50}%`,
                '--signature-lobe-y': `${Number(lobe.yPercent) || 50}%`,
                '--signature-lobe-width': `${Number(lobe.widthPercent) || 28}%`,
                '--signature-lobe-height': `${Number(lobe.heightPercent) || 20}%`,
                '--signature-lobe-rotation': `${Number(lobe.rotationDeg) || 0}deg`,
                '--signature-lobe-delay': `${Number(lobe.delayMs) || 0}ms`,
              }}
            />
          ))}
        </div>
        <div className="battle-vfx-ring" />
        <div className="battle-vfx-burst" />
        <div className="battle-vfx-symbol" />
        <i className={`battle-vfx-icon ${iconClass}`} />
        <div className="battle-vfx-beam" />
        <div className="battle-vfx-shock" />
        <div className="battle-vfx-ground" />
        <div className="battle-vfx-slashes">
          {Array.from({ length: 4 }, (_, index) => <span key={index} style={{ '--i': index }} />)}
        </div>
        <div className="battle-vfx-shards">
          {Array.from({ length: shardCount }, (_, index) => <span key={index} style={{ '--i': index, '--signature-delay': particleDelay(index) }} />)}
        </div>
        <div className="battle-vfx-waves">
          {Array.from({ length: 4 }, (_, index) => <span key={index} style={{ '--i': index }} />)}
        </div>
        <div className="battle-vfx-particles">
          {Array.from({ length: particleCount }, (_, index) => <span key={index} style={{ '--i': index, '--signature-delay': particleDelay(index) }} />)}
        </div>
      </div>
    </div>
  )
}

export function BattleImpactFeedback({ feedback, anchors = BATTLE_EFFECT_FALLBACK_ANCHORS }) {
  if (!feedback) return null
  const targetSide = feedback.targetSide === 'player' ? 'player' : 'enemy'
  const target = anchors?.[targetSide] || BATTLE_EFFECT_FALLBACK_ANCHORS[targetSide]
  const amountPrefix = feedback.kind === 'heal' ? '+' : feedback.kind === 'immune' ? '' : '−'
  const hitCounter = feedback.hitCount > 1 ? `${feedback.hitIndex + 1}/${feedback.hitCount}` : ''

  return (
    <div
      key={feedback.id}
      className={`battle-impact-feedback battle-impact-feedback--${safeClassName(feedback.kind, 'damage')} battle-impact-feedback--${safeClassName(feedback.intensity, 'medium')} ${feedback.crit ? 'battle-impact-feedback--crit' : ''}`}
      style={{ '--feedback-x': target.x, '--feedback-y': target.y }}
      aria-live="polite"
    >
      {feedback.amount > 0 && <strong>{amountPrefix}{feedback.amount}</strong>}
      <span>{feedback.label || (feedback.kind === 'immune' ? '免疫' : '')}</span>
      {hitCounter && <small>连击 {hitCounter}</small>}
    </div>
  )
}

export function BattleStatusAura() {
  return (
    <div className="battle-persistent-status" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--status-i': index }} />)}
    </div>
  )
}

export default BattleMoveEffect
