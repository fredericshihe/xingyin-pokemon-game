import React, { useEffect, useRef } from 'react'
import { MOVES } from '../../utils/gameData'
import { getMoveEffectConfig } from '../../utils/moveVisuals'
import { getBattleCinematicProfile } from '../../utils/battleCinematics'
import { BATTLE_EFFECT_FALLBACK_ANCHORS } from '../../utils/battleEffectAnchors'
import { getMoveVfxRecipe } from '../../utils/battleVfxRecipes'
import { createBattleVfxRenderer } from '../../utils/battleVfxRenderer'
import { createBattleActorPlayback, createBattleFrameClock } from '../../utils/battleVisualPlayback'
import { getBattleMoveImpactDelay } from '../../utils/battlePacing'
import atlasUrl from '../../assets/battle-vfx-atlas.png'
import './battleMoveCanvas.css'

const safeClassName = (value, fallback) => String(value || fallback).replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
let atlasPromise = null
export function preloadBattleVfxAtlas() {
  if (!atlasPromise) {
    atlasPromise = new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        if (typeof image.decode === 'function') image.decode().then(() => resolve(image), () => resolve(image))
        else resolve(image)
      }
      image.onerror = () => reject(new Error('Battle material atlas failed to load'))
      image.src = atlasUrl
    }).catch(error => { atlasPromise = null; throw error })
  }
  return atlasPromise
}

export function BattleMoveEffect({ effect, onDone }) {
  const canvasRef = useRef(null)
  const liveRef = useRef({ effect, onDone })
  liveRef.current = { effect, onDone }
  // Battle scenes mount before the first turn, warming the single shared atlas.
  useEffect(() => { void preloadBattleVfxAtlas().catch(() => {}) }, [])
  useEffect(() => {
    if (!effect || !canvasRef.current) return undefined
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) { effect.onCancel?.(new Error('战斗画布不可用')); liveRef.current.onDone?.(); return undefined }
    const move = effect.move || MOVES[effect.moveKey] || effect
    const config = getMoveEffectConfig(effect.moveKey, move)
    const profile = effect.profile || getBattleCinematicProfile(effect.moveKey, move, config, { phase: effect.phase, durationMs: effect.durationMs })
    const recipe = getMoveVfxRecipe(effect.moveKey, move, config)
    const qualityHost = canvas.closest('[class*="battle-vfx-quality--"]')
    const quality = qualityHost?.classList.contains('battle-vfx-quality--lite') ? 'lite'
      : qualityHost?.classList.contains('battle-vfx-quality--high') ? 'high' : 'standard'
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, quality === 'lite' ? 1.25 : quality === 'high' ? 1.75 : 1.5)
    let width = 0, height = 0, renderer = null, actorPlayback = null, frame = 0, disposed = false
    let started = false, impacted = false, completed = false
    let renderedFrames = 0, maxDraws = 0, lastProgress = 0
    const resize = () => {
      const box = canvas.getBoundingClientRect()
      const nextWidth = Math.max(1, box.width), nextHeight = Math.max(1, box.height)
      if (width === nextWidth && height === nextHeight) return
      width = nextWidth; height = nextHeight
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (renderer) renderer.render(lastProgress, width, height)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    const duration = effect.durationMs || profile.durationMs
    const clock = createBattleFrameClock(duration)
    const resetVisibleClock = () => clock.sample(performance.now(), true)
    document.addEventListener('visibilitychange', resetVisibleClock)
    const hitAt = getBattleMoveImpactDelay(effect.phase || 'hit', duration)
    const isLab = Boolean(canvas.closest('[data-battle-vfx-lab]'))
    const fixedProgress = isLab ? Number(new URLSearchParams(location.search).get('frame')) : NaN
    const hasFixedProgress = isLab && new URLSearchParams(location.search).has('frame') && Number.isFinite(fixedProgress)
    const renderEffect = { ...effect }
    const animate = now => {
      if (disposed || !renderer) return
      const elapsed = clock.sample(now, document.hidden)
      if (document.hidden) { frame = requestAnimationFrame(animate); return }
      if (!started) { started = true; effect.onStart?.() }
      const progress = hasFixedProgress ? Math.min(.99, Math.max(0, fixedProgress)) : elapsed / duration
      lastProgress = progress
      // Layout measurements can refine anchors after the effect has mounted.
      renderEffect.anchors = liveRef.current.effect?.anchors || renderEffect.anchors
      actorPlayback?.update(hasFixedProgress ? progress * duration : elapsed)
      const renderStarted = performance.now()
      const stats = renderer.render(progress, width, height)
      const drawMs = performance.now() - renderStarted
      if (!impacted && progress * duration >= hitAt) {
        impacted = true
        // This callback runs AFTER drawing the impact, and commits HP, audio,
        // feedback and recoil together. It is never a separate wall timer.
        effect.onImpact?.()
      }
      maxDraws = Math.max(maxDraws, stats.draws)
      renderedFrames++
      canvas.dataset.frame = String(renderedFrames)
      canvas.dataset.renderedMove = recipe.key
      canvas.dataset.draws = String(stats.draws)
      canvas.dataset.maxDraws = String(maxDraws)
      canvas.dataset.progress = progress.toFixed(3)
      canvas.dataset.elapsed = elapsed.toFixed(1)
      canvas.dataset.maxDrawMs = String(Math.max(Number(canvas.dataset.maxDrawMs) || 0, drawMs))
      if (progress < 1 && !hasFixedProgress) frame = requestAnimationFrame(animate)
      else if (!hasFixedProgress) { completed = true; effect.onComplete?.(); liveRef.current.onDone?.() }
    }
    void preloadBattleVfxAtlas().then(image => {
      if (disposed) return
      renderer = createBattleVfxRenderer(ctx, image, recipe, renderEffect, { quality, reducedMotion })
      actorPlayback = createBattleActorPlayback(canvas.closest('.anime-battle-bg'), renderEffect, recipe, reducedMotion)
      canvas.dataset.ready = 'true'
      frame = requestAnimationFrame(animate)
    }).catch(error => {
      if (!disposed) { console.warn('[BattleVfx]', error); effect.onCancel?.(error); liveRef.current.onDone?.() }
    })
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); actorPlayback?.dispose()
      document.removeEventListener('visibilitychange', resetVisibleClock)
      ctx.clearRect(0, 0, width, height)
      if (!completed && !hasFixedProgress) effect.onCancel?.()
    }
  }, [effect?.id])
  if (!effect) return null
  const move = effect.move || MOVES[effect.moveKey] || effect
  const config = getMoveEffectConfig(effect.moveKey, move)
  const recipe = getMoveVfxRecipe(effect.moveKey, move, config)
  return <canvas ref={canvasRef} className="battle-material-effect" aria-hidden="true"
    data-move={effect.moveKey} data-move-signature={recipe.signature} data-technique={recipe.technique}
    data-power-level={recipe.powerLevel} data-phase={effect.phase || 'hit'} />
}

export function BattleImpactFeedback({ feedback, anchors = BATTLE_EFFECT_FALLBACK_ANCHORS }) {
  if (!feedback) return null
  const targetSide = feedback.targetSide === 'player' ? 'player' : 'enemy'
  const target = anchors?.[targetSide] || BATTLE_EFFECT_FALLBACK_ANCHORS[targetSide]
  const amountPrefix = feedback.kind === 'heal' ? '+' : feedback.kind === 'immune' ? '' : '−'
  const hitCounter = feedback.hitCount > 1 ? `${feedback.hitIndex + 1}/${feedback.hitCount}` : ''
  return (
    <div key={feedback.id}
      className={`battle-impact-feedback battle-impact-feedback--${safeClassName(feedback.kind, 'damage')} battle-impact-feedback--${safeClassName(feedback.intensity, 'medium')} ${feedback.crit ? 'battle-impact-feedback--crit' : ''}`}
      style={{ '--feedback-x': target.x, '--feedback-y': target.y }} aria-live="polite">
      {feedback.amount > 0 && <strong>{amountPrefix}{feedback.amount}</strong>}
      <span>{feedback.label || (feedback.kind === 'immune' ? '免疫' : '')}</span>
      {hitCounter && <small>连击 {hitCounter}</small>}
    </div>
  )
}

export function BattleStatusAura() {
  return <div className="battle-persistent-status" aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--status-i': index }} />)}
  </div>
}
export default BattleMoveEffect
