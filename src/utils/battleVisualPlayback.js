import { getBattleMoveImpactDelay } from './battlePacing'

// Game state advances only after a rendered frame reaches impact. Loading an
// atlas, a long task or a background tab must never spend the visible attack.
export function createBattleVisualSession({ onStart, onImpact, readyTimeoutMs = 15000 } = {}) {
  let started = false, impacted = false, settled = false
  let resolve, reject
  const finished = new Promise((yes, no) => { resolve = yes; reject = no })
  const timeout = setTimeout(() => cancel(new Error('战斗画面未能准备完成，请重新读取进度。')), readyTimeoutMs)
  const cancel = (error = new Error('战斗动画已中断')) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    reject(error)
  }
  return {
    finished,
    start() {
      if (settled || started) return
      started = true
      clearTimeout(timeout)
      try { onStart?.() } catch (error) { cancel(error) }
    },
    impact() {
      if (settled || !started || impacted) return
      impacted = true
      try { onImpact?.() } catch (error) { cancel(error) }
    },
    finish() {
      if (settled) return
      if (!started || !impacted) { cancel(); return }
      settled = true
      clearTimeout(timeout)
      resolve()
    },
    cancel,
  }
}

export function createBattleFrameClock(durationMs) {
  let elapsedMs = 0, previous = null
  return {
    sample(now, hidden = false) {
      if (hidden) { previous = null; return elapsedMs }
      if (previous !== null) elapsedMs += Math.max(0, Math.min(40, now - previous))
      previous = now
      elapsedMs = Math.min(durationMs, elapsedMs)
      return elapsedMs
    },
  }
}

// Paused Web Animations follow the canvas clock; no competing CSS duration,
// arbitrary hit-stop or mid-lunge reset. Only compositor transforms change.
export function createBattleActorPlayback(stage, effect, recipe, reducedMotion = false) {
  if (!stage || typeof stage.animate !== 'function') return { update() {}, dispose() {} }
  const actorSide = effect.attackerSide === 'enemy' ? 'enemy' : 'player'
  const targetSide = effect.target || (recipe.target === 'self' ? actorSide : actorSide === 'player' ? 'enemy' : 'player')
  const actor = stage.querySelector(`.battle-sprite-${actorSide}`)
  const target = stage.querySelector(`.battle-sprite-${targetSide}`)
  const duration = effect.durationMs
  const hitAt = getBattleMoveImpactDelay(effect.phase, duration)
  const impact = hitAt / duration
  const contact = ['strike', 'slam', 'dash', 'dive', 'dragon-dive', 'rampage', 'slash', 'fang', 'drill', 'whip'].includes(recipe.technique)
  const miss = effect.phase === 'miss'
  const actorFocused = ['charge', 'start', 'copy', 'fizzle'].includes(effect.phase)
  const canMove = !reducedMotion && !effect.suppressActorMotion && effect.phase !== 'secondary'
  const a = effect.anchors?.[actorSide], b = effect.anchors?.[targetSide]
  const dx = a && b ? (parseFloat(b.x) - parseFloat(a.x)) / 100 * stage.clientWidth : 0
  const dy = a && b ? (parseFloat(b.y) - parseFloat(a.y)) / 100 * stage.clientHeight : 0
  const travel = canMove && contact && !actorFocused && actor !== target ? (recipe.technique === 'whip' ? .2 : .58) : 0
  const x = dx * travel, y = dy * travel + (miss ? -42 : 0)
  const dir = actorSide === 'player' ? 1 : -1
  const airborne = ['slam', 'dive', 'dragon-dive'].includes(recipe.technique)
  const lift = airborne && canMove ? Math.min(90, stage.clientHeight * .18) : 0
  const transform = (tx, ty, sx = 1, sy = sx, angle = 0) => `translate3d(${tx}px,${ty}px,0) rotate(${angle}deg) scale(${sx},${sy})`
  const animations = []
  const add = (element, keyframes, ms, delay = 0) => {
    if (!element) return
    const animation = element.animate(keyframes, { duration: Math.max(1, ms), fill: 'both', easing: 'linear' })
    animation.pause()
    animation.currentTime = 0
    animations.push({ animation, delay, duration: ms })
  }
  if (canMove && actor) {
    const attack = contact && !actorFocused && actor !== target
    add(actor, [
      { offset: 0, transform: transform(0, 0), easing: 'ease-out' },
      { offset: impact * .22, transform: transform(attack ? -dir * 9 : 0, 4, 1.03, .94), easing: 'ease-in' },
      { offset: impact * .66, transform: transform(x * .25, y * .2 - lift, 1.04, 1.04, attack ? -dir * 5 : 0), easing: 'cubic-bezier(.2,.65,.35,1)' },
      { offset: impact, transform: transform(x, y, attack ? 1.08 : 1.04, airborne ? .91 : 1.02, 0), easing: 'ease-out' },
      { offset: Math.min(.86, impact + .23), transform: transform(x * .24, y * .22 - 6, .99), easing: 'ease-out' },
      { offset: 1, transform: transform(0, 0) },
    ], duration)
  }
  const reacts = !['miss', 'fizzle', 'start', 'charge', 'copy'].includes(effect.phase)
  if (reacts && target && target !== actor && !reducedMotion) {
    const magnitude = 6 + recipe.powerLevel * 2
    add(target, [
      { offset: 0, transform: transform(0, 0), easing: 'ease-out' },
      { offset: .13, transform: transform(dir * magnitude, airborne ? 8 : -4, airborne ? 1.12 : .96, airborne ? .85 : 1.04), easing: 'ease-out' },
      { offset: .36, transform: transform(-dir * magnitude * .3, -3, 1.03, .98), easing: 'ease-out' },
      { offset: 1, transform: transform(0, 0) },
    ], Math.min(400, duration - hitAt), hitAt)
  }
  return {
    update(elapsedMs) { for (const { animation, delay, duration: ms } of animations) animation.currentTime = Math.max(0, Math.min(ms, elapsedMs - delay)) },
    dispose() { for (const { animation } of animations) animation.cancel() },
  }
}
