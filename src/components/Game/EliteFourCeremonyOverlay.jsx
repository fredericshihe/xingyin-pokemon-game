import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const REDUCED_MOTION_DURATION_MS = 900

export default function EliteFourCeremonyOverlay({ ceremony, onComplete }) {
  const [stage, setStage] = useState('opening')
  const completedRef = useRef(false)

  const complete = useCallback(() => {
    if (!ceremony?.id || completedRef.current) return
    completedRef.current = true
    onComplete?.(ceremony.id)
  }, [ceremony?.id, onComplete])

  useEffect(() => {
    if (!ceremony?.id) return undefined
    completedRef.current = false
    setStage('opening')

    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const duration = reducedMotion
      ? REDUCED_MOTION_DURATION_MS
      : Math.max(2400, Math.trunc(Number(ceremony.durationMs)) || 3200)
    const timers = [
      window.setTimeout(() => setStage('crest'), reducedMotion ? 80 : 260),
      window.setTimeout(() => setStage('reveal'), reducedMotion ? 180 : Math.min(1080, Math.round(duration * 0.28))),
      window.setTimeout(() => setStage('resolve'), reducedMotion ? 520 : Math.max(1600, duration - 760)),
      window.setTimeout(complete, duration)
    ]

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [ceremony?.durationMs, ceremony?.id, complete])

  const effectIndexes = useMemo(
    () => Array.from({ length: Math.max(6, Math.min(24, Math.trunc(Number(ceremony?.effectCount)) || 8)) }, (_, index) => index),
    [ceremony?.effectCount]
  )

  if (!ceremony) return null

  const isVictory = ceremony.phase === 'victory'
  const isFloorClear = ceremony.phase === 'floor'
  const rankCount = Math.max(4, Math.min(10, Math.trunc(Number(ceremony.rankCount)) || 4))
  const order = Math.max(1, Math.min(rankCount, Math.trunc(Number(ceremony.order)) || 1))
  const litTrialCount = Math.max(0, Math.min((ceremony.trials || []).length, Math.trunc(Number(ceremony.litTrialCount)) || (isVictory ? (ceremony.trials || []).length : 0)))

  return (
    <div
      className={`elite-four-ceremony elite-four-ceremony--${ceremony.theme} elite-four-ceremony--order-${order} elite-four-ceremony--${ceremony.phase} elite-four-ceremony--${stage}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="elite-four-ceremony-title"
      style={{ '--elite-effect-count': effectIndexes.length }}
    >
      <div className="elite-four-ceremony__curtain elite-four-ceremony__curtain--left" aria-hidden="true" />
      <div className="elite-four-ceremony__curtain elite-four-ceremony__curtain--right" aria-hidden="true" />
      <div className="elite-four-ceremony__field" aria-hidden="true">
        <span className="elite-four-ceremony__axis elite-four-ceremony__axis--horizontal" />
        <span className="elite-four-ceremony__axis elite-four-ceremony__axis--vertical" />
        <span className="elite-four-ceremony__ring elite-four-ceremony__ring--outer" />
        <span className="elite-four-ceremony__ring elite-four-ceremony__ring--inner" />
        {effectIndexes.map((index) => (
          <span
            key={index}
            className="elite-four-ceremony__effect"
            style={{ '--effect-index': index, '--effect-angle': `${(360 / effectIndexes.length) * index}deg` }}
          />
        ))}
      </div>

      <button
        type="button"
        className="elite-four-ceremony__skip game-icon-button"
        onClick={complete}
        title="跳过动画"
        aria-label="跳过动画"
      >
        <i className="fa-solid fa-forward-step" aria-hidden="true" />
      </button>

      <div className="elite-four-ceremony__stage">
        <div className="elite-four-ceremony__rank" aria-hidden="true">
          {Array.from({ length: rankCount }, (_, index) => (
            <span key={index} className={index < order ? 'is-lit' : ''} />
          ))}
        </div>

        <div className="elite-four-ceremony__crest" aria-hidden="true">
          <span className="elite-four-ceremony__crest-frame" />
          <i className={`fa-solid ${ceremony.icon || 'fa-crown'}`} />
          <b>{ceremony.motif}</b>
        </div>

        <div className="elite-four-ceremony__copy">
          <p className="elite-four-ceremony__eyebrow">{ceremony.eyebrow}</p>
          <h2 id="elite-four-ceremony-title">{ceremony.title}</h2>
          <p className="elite-four-ceremony__subtitle">{ceremony.subtitle}</p>
          <div className="elite-four-ceremony__divider" aria-hidden="true"><span /></div>
          <p className="elite-four-ceremony__statement">{ceremony.statement}</p>
        </div>

        <div className={`elite-four-ceremony__seals${isVictory ? ' elite-four-ceremony__seals--cleared' : ''}`} aria-label="挑战序列">
          {(ceremony.trials || []).map((trial, index) => (
            <span key={trial} className={isVictory || index < litTrialCount ? 'is-lit' : ''}>
              <i className={`fa-solid ${index === (ceremony.trials || []).length - 1 ? 'fa-crown' : 'fa-diamond'}`} aria-hidden="true" />
              <small>{trial}</small>
            </span>
          ))}
        </div>

        {(isVictory || isFloorClear) && ceremony.nextLabel ? (
          <div className="elite-four-ceremony__next">
            <i className="fa-solid fa-arrow-up" aria-hidden="true" />
            <strong>{ceremony.nextLabel}</strong>
          </div>
        ) : null}
      </div>
    </div>
  )
}
