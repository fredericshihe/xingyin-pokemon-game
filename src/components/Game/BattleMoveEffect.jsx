import React, { useEffect, useRef } from 'react'
import { MOVES } from '../../utils/gameData'
import { getMoveEffectConfig } from '../../utils/moveVisuals'
import { getBattleCinematicProfile } from '../../utils/battleCinematics'
import { BATTLE_EFFECT_FALLBACK_ANCHORS } from '../../utils/battleEffectAnchors'
import { getMoveVfxRecipe } from '../../utils/battleVfxRecipes'
import { createBattleVfxRenderer } from '../../utils/battleVfxRenderer'
import { createBattleActorPlayback, createBattleFrameClock, getBattleCanvasScale } from '../../utils/battleVisualPlayback'
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
  const renderScaleRef = useRef(1)
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
    const isLab = Boolean(canvas.closest('[data-battle-vfx-lab]'))
    if (isLab) {
      for (const key of ['ready', 'frame', 'maxDraws', 'maxDrawMs', 'progress', 'elapsed', 'actorSeeks']) delete canvas.dataset[key]
    }
    let dpr = 1
    let width = 0, height = 0, renderer = null, actorPlayback = null, frame = 0, disposed = false
    let started = false, impacted = false, completed = false
    let renderedFrames = 0, maxDraws = 0, lastProgress = 0
    const resize = () => {
      // Layout size excludes CSS camera/parent transforms; backing storage only
      // changes on a real resize or an adaptive quality change between moves.
      const nextWidth = Math.max(1, canvas.clientWidth), nextHeight = Math.max(1, canvas.clientHeight)
      if (width === nextWidth && height === nextHeight) return
      width = nextWidth; height = nextHeight
      dpr = getBattleCanvasScale(width, height, window.devicePixelRatio || 1, quality) * renderScaleRef.current
      const pixelsWide = Math.round(width * dpr), pixelsHigh = Math.round(height * dpr)
      if (canvas.width !== pixelsWide) canvas.width = pixelsWide
      if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (renderer) renderer.render(lastProgress, width, height)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    const duration = effect.durationMs || profile.durationMs
    const clock = createBattleFrameClock(duration)
    const resetVisibleClock = () => { clock.sample(performance.now(), true); actorPlayback?.pause() }
    document.addEventListener('visibilitychange', resetVisibleClock)
    const hitAt = getBattleMoveImpactDelay(effect.phase || 'hit', duration)
    const fixedProgress = isLab ? Number(new URLSearchParams(location.search).get('frame')) : NaN
    const hasFixedProgress = isLab && new URLSearchParams(location.search).has('frame') && Number.isFinite(fixedProgress)
    const renderEffect = { ...effect }
    let lastFrameAt = null, maxDrawMs = 0
    const frameIntervals = []
    const animate = now => {
      if (disposed || !renderer) return
      const elapsed = clock.sample(now, document.hidden)
      if (document.hidden) { frame = requestAnimationFrame(animate); return }
      if (!started) { started = true; effect.onStart?.() }
      const progress = hasFixedProgress ? Math.min(.99, Math.max(0, fixedProgress)) : elapsed / duration
      lastProgress = progress
      // Layout measurements can refine anchors after the effect has mounted.
      renderEffect.anchors = liveRef.current.effect?.anchors || renderEffect.anchors
      const seeks = actorPlayback?.update(hasFixedProgress ? progress * duration : elapsed, now, hasFixedProgress)
      const renderStarted = performance.now()
      const stats = renderer.render(progress, width, height)
      const drawMs = performance.now() - renderStarted
      if (lastFrameAt !== null && frameIntervals.length < 240) frameIntervals.push(now - lastFrameAt)
      lastFrameAt = now
      maxDrawMs = Math.max(maxDrawMs, drawMs)
      if (!impacted && progress * duration >= hitAt) {
        impacted = true
        // This callback runs AFTER drawing the impact, and commits HP, audio,
        // feedback and recoil together. It is never a separate wall timer.
        effect.onImpact?.()
      }
      maxDraws = Math.max(maxDraws, stats.draws)
      renderedFrames++
      // Diagnostics are for the preview only; no per-frame DOM attributes in
      // student sessions (WebKit invalidates style for attribute mutations).
      if (isLab) {
        canvas.dataset.frame = String(renderedFrames)
        canvas.dataset.renderedMove = recipe.key
        canvas.dataset.draws = String(stats.draws)
        canvas.dataset.maxDraws = String(maxDraws)
        canvas.dataset.progress = progress.toFixed(3)
        canvas.dataset.elapsed = elapsed.toFixed(1)
        canvas.dataset.maxDrawMs = String(maxDrawMs)
        canvas.dataset.actorSeeks = String(seeks || 0)
      }
      if (progress < 1 && !hasFixedProgress) frame = requestAnimationFrame(animate)
      else if (!hasFixedProgress) {
        if (frameIntervals.length > 15) {
          const sorted = frameIntervals.slice().sort((a, b) => a - b)
          // Respect a stable 30 Hz display/low-power host; only missed refreshes
          // justify dropping the next move's resolution.
          const refreshMs = sorted[Math.floor(sorted.length * .2)]
          const slow = frameIntervals.filter(ms => ms > Math.max(24, refreshMs * 1.5)).length
          if (slow / frameIntervals.length > .18) renderScaleRef.current = Math.max(.7, renderScaleRef.current * .85)
        }
        completed = true; effect.onComplete?.(); liveRef.current.onDone?.()
      }
    }
    void preloadBattleVfxAtlas().then(image => {
      if (disposed) return
      renderer = createBattleVfxRenderer(ctx, image, recipe, renderEffect, { quality, reducedMotion })
      actorPlayback = createBattleActorPlayback(canvas.closest('.anime-battle-bg'), renderEffect, recipe, reducedMotion)
      // Mount the scene's attack classes before the timed animation as well.
      // The first CSS layer commit can be expensive on a cold WebKit page.
      started = true
      effect.onStart?.()
      // Submit texture uploads and establish the canvas layer before starting
      // the gameplay clock. WebKit can otherwise stall on the first draw.
      renderer.warmup()
      frame = requestAnimationFrame(() => {
        if (disposed) return
        // Prime real-size draw paths too, without reaching any impact or
        // advancing the actor/gameplay clocks.
        renderer.render(.01, width, height)
        frame = requestAnimationFrame(() => {
          if (disposed) return
          ctx.clearRect(0, 0, width, height)
          frame = requestAnimationFrame(now => {
            if (disposed) return
            if (isLab) canvas.dataset.ready = 'true'
            animate(now)
          })
        })
      })
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
  if (!effect) return <canvas ref={canvasRef} className="battle-material-surface" hidden aria-hidden="true" />
  const move = effect.move || MOVES[effect.moveKey] || effect
  const config = getMoveEffectConfig(effect.moveKey, move)
  const recipe = getMoveVfxRecipe(effect.moveKey, move, config)
  return <canvas ref={canvasRef} className="battle-material-effect" aria-hidden="true"
    data-move={effect.moveKey} data-move-signature={recipe.signature} data-technique={recipe.technique}
    data-power-level={recipe.powerLevel} data-phase={effect.phase || 'hit'} />
}

export function BattleImpactFeedback({ feedback, anchors = BATTLE_EFFECT_FALLBACK_ANCHORS }) {
  const nodeRef = useRef(null)
  const lastFeedbackRef = useRef(null)
  if (feedback) lastFeedbackRef.current = feedback
  const shown = feedback || lastFeedbackRef.current || {}
  useEffect(() => {
    if (!feedback || !nodeRef.current) return undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animation = nodeRef.current.animate(reduced ? [
      { opacity: 0, transform: 'translate(-50%,-50%)' },
      { opacity: 1, offset: .15, transform: 'translate(-50%,-50%)' },
      { opacity: 0, transform: 'translate(-50%,-50%)' },
    ] : [
      { opacity: 0, transform: 'translate(-50%,-25%) scale(.7)' },
      { opacity: 1, offset: .17, transform: 'translate(-50%,-60%) scale(1.12)' },
      { opacity: 1, offset: .4, transform: 'translate(-50%,-72%) scale(1)' },
      { opacity: 0, transform: 'translate(-50%,-125%) scale(.94)' },
    ], { duration: reduced ? 620 : 900, fill: 'both', easing: 'ease-out' })
    return () => animation.cancel()
  }, [feedback?.id])
  const targetSide = shown.targetSide === 'player' ? 'player' : 'enemy'
  const target = anchors?.[targetSide] || BATTLE_EFFECT_FALLBACK_ANCHORS[targetSide]
  const amountPrefix = shown.kind === 'heal' ? '+' : shown.kind === 'immune' ? '' : '−'
  const hitCounter = shown.hitCount > 1 ? `${shown.hitIndex + 1}/${shown.hitCount}` : ''
  return (
    <div ref={nodeRef}
      className={`battle-feedback-surface ${feedback ? 'battle-impact-feedback' : ''} battle-impact-feedback--${safeClassName(shown.kind, 'damage')} battle-impact-feedback--${safeClassName(shown.intensity, 'medium')} ${shown.crit ? 'battle-impact-feedback--crit' : ''}`}
      style={{ '--feedback-x': target.x, '--feedback-y': target.y, opacity: 0 }} aria-live="polite" aria-hidden={!feedback}>
      <strong>{shown.amount > 0 ? `${amountPrefix}${shown.amount}` : '0'}</strong>
      <span>{shown.label || (shown.kind === 'immune' ? '免疫' : '')}</span>
      <small>{hitCounter ? `连击 ${hitCounter}` : ''}</small>
    </div>
  )
}

export function BattleStatusAura() {
  return <div className="battle-persistent-status" aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--status-i': index }} />)}
  </div>
}
export default BattleMoveEffect
