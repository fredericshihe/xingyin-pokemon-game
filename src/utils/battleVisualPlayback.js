import { getBattleMoveImpactDelay } from './battlePacing.js'

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

// Let the compositor interpolate transforms. Seeking two paused animations on
// every rAF adds style/paint work and makes motion depend on main-thread ticks.
// Synchronize only at start, after a stall, or when visibility changes.
export function createBattleActorPlayback(stage, effect, recipe, reducedMotion = false) {
  if (!stage || typeof stage.animate !== 'function') return { update() {}, dispose() {} }
  const actorSide = effect.attackerSide === 'enemy' ? 'enemy' : 'player'
  const targetSide = recipe.selfOnly ? actorSide : effect.target || (recipe.target === 'self' ? actorSide : actorSide === 'player' ? 'enemy' : 'player')
  const actor = stage.querySelector(`.battle-sprite-${actorSide}`)
  const target = stage.querySelector(`.battle-sprite-${targetSide}`)
  const duration = effect.durationMs
  const hitAt = getBattleMoveImpactDelay(effect.phase, duration)
  const impact = hitAt / duration
  const contact = recipe.power !== 0 && ['strike', 'slam', 'dash', 'dive', 'dragon-dive', 'rampage', 'slash', 'fang', 'drill', 'whip', 'roll', 'hammer', 'bone-swing', 'toss', 'burrow'].includes(recipe.technique)
  const miss = effect.phase === 'miss'
  const blocked = effect.visualResult?.kind === 'blocked'
  const actorFocused = blocked || ['charge', 'start', 'copy', 'fizzle'].includes(effect.phase)
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
    const animation = element.animate(keyframes, { duration: Math.max(1, ms), delay, fill: 'both', easing: 'linear' })
    animation.pause()
    animation.currentTime = 0
    animations.push(animation)
  }
  if (canMove && actor) {
    const attack = contact && !actorFocused && actor !== target
    let keyframes = [
      { offset: 0, transform: transform(0, 0), easing: 'ease-out' },
      { offset: impact * .22, transform: transform(attack ? -dir * 9 : 0, 4, 1.03, .94), easing: 'ease-in' },
      { offset: impact * .66, transform: transform(x * .25, y * .2 - lift, 1.04, 1.04, attack ? -dir * 5 : 0), easing: 'cubic-bezier(.2,.65,.35,1)' },
      { offset: impact, transform: transform(x, y, attack ? 1.08 : 1.04, airborne ? .91 : 1.02, 0), easing: 'ease-out' },
      { offset: Math.min(.86, impact + .23), transform: transform(x * .24, y * .22 - 6, .99), easing: 'ease-out' },
      { offset: 1, transform: transform(0, 0) },
    ]
    const pose = recipe.gesture
    if (['dance','flex','meditate','curl','plead','cry','drink','vanish'].includes(pose) || recipe.selfOnly) {
      const dance = pose === 'dance', curl = pose === 'curl', vanish = pose === 'vanish', hop = recipe.selfOnly
      keyframes = [
        { offset:0, transform:transform(0,0),opacity:1 },
        { offset:.23, transform:transform(dance?-10:0,hop?-28:pose==='meditate'?-8:3,curl?.8:pose==='flex'?1.1:1,curl?.8:1,dance?-12:pose==='plead'?-8:0),opacity:vanish?.3:1 },
        { offset:.5, transform:transform(dance?12:0,hop?0:pose==='meditate'?-12:0,curl?.75:1.04,curl?.75:1.04,dance?14:pose==='drink'?-12:0),opacity:vanish?.12:1 },
        { offset:.75, transform:transform(dance?-6:0,hop?-12:0,1,1,dance?-8:0),opacity:vanish?.65:1 },
        { offset:1, transform:transform(0,0),opacity:1 },
      ]
    } else if (recipe.gesture === 'tail' && recipe.power === 0) {
      keyframes = [
        {offset:0,transform:transform(0,0)},
        {offset:.25,transform:transform(-dir*7,0,1,1,-dir*10)},
        {offset:.5,transform:transform(dir*8,0,1,1,dir*12)},
        {offset:.75,transform:transform(-dir*5,0,1,1,-dir*8)},
        {offset:1,transform:transform(0,0)},
      ]
    } else if (attack && recipe.gesture === 'kick') {
      keyframes = [
        {offset:0,transform:transform(0,0)},
        {offset:impact*.45,transform:transform(-dir*8,-14,1.02,1.06,-dir*16)},
        {offset:impact,transform:transform(x,y,1.1,.94,dir*22)},
        {offset:Math.min(.88,impact+.25),transform:transform(x*.2,y*.2,1,1,-dir*6)},
        {offset:1,transform:transform(0,0)},
      ]
    } else if (attack && recipe.technique === 'rampage') {
      keyframes = [
        {offset:0,transform:transform(0,0)},
        {offset:impact*.5,transform:transform(-dir*10,-5,1.08,1.08,-dir*10)},
        {offset:impact,transform:transform(x,y,1.08,.96,dir*12)},
        {offset:impact+(1-impact)*.3,transform:transform(x*.85,y-10,1.04,1.04,-dir*14)},
        {offset:impact+(1-impact)*.55,transform:transform(x,y,1.1,.95,dir*10)},
        {offset:1,transform:transform(0,0)},
      ]
    } else if (recipe.technique === 'roll') {
      keyframes = [
        {offset:0,transform:transform(0,0)},
        {offset:impact,transform:transform(x,y,.88,.88,dir*360)},
        {offset:1,transform:transform(0,0,1,1,dir*720)},
      ]
    } else if (recipe.technique === 'burrow') {
      keyframes = [
        {offset:0,transform:transform(0,0),opacity:1},
        {offset:impact*.4,transform:transform(0,25,.8,.6),opacity:0},
        {offset:impact*.8,transform:transform(x,y+28,.8,.6),opacity:0},
        {offset:impact,transform:transform(x,y,1.1),opacity:1},
        {offset:1,transform:transform(0,0),opacity:1},
      ]
    }
    add(actor, keyframes, duration)
  }
  const reacts = !blocked && !['miss', 'fizzle', 'start', 'charge', 'copy'].includes(effect.phase)
  if (reacts && target && target !== actor && !reducedMotion) {
    const magnitude = 6 + recipe.powerLevel * 2
    let reaction = [
      { offset: 0, transform: transform(0, 0), easing: 'ease-out' },
      { offset: .13, transform: transform(dir * magnitude, airborne ? 8 : -4, airborne ? 1.12 : .96, airborne ? .85 : 1.04, recipe.technique==='toss'?dir*28:0), easing: 'ease-out' },
      { offset: .36, transform: transform(-dir * magnitude * .3, recipe.technique==='toss'?14:-3, 1.03, .98, recipe.technique==='toss'?-dir*16:0), easing: 'ease-out' },
      { offset: 1, transform: transform(0, 0) },
    ]
    const result = effect.visualResult
    if (recipe.technique === 'levitate' && recipe.material !== 'rock') reaction = [
      {offset:0,transform:transform(0,0)},
      {offset:.3,transform:transform(-dir*4,-24,1.02,1.08,-dir*5)},
      {offset:.65,transform:transform(dir*4,-20,.96,1.08,dir*5)},
      {offset:1,transform:transform(0,0)},
    ]
    else if (result?.kind === 'stat') reaction = [
      {offset:0,transform:transform(0,0)},
      {offset:.4,transform:transform(0,result.stages<0?8:-7,result.stages<0?.95:1.06)},
      {offset:1,transform:transform(0,0)},
    ]
    else if (result?.status === 'sleep') reaction = [
      {offset:0,transform:transform(0,0)},
      {offset:.5,transform:transform(0,7,1.02,.94,dir*5)},
      {offset:1,transform:transform(0,0)},
    ]
    add(target, reaction, Math.min(recipe.technique === 'levitate' ? 650 : 400, duration - hitAt), hitAt)
  }
  let origin = null, seeks = 0
  return {
    update(elapsedMs, now = document.timeline?.currentTime ?? performance.now(), frozen = false) {
      if (frozen) {
        for (const animation of animations) { animation.pause(); animation.currentTime = elapsedMs; seeks++ }
        origin = null
      } else if (origin === null || Math.abs(now - origin - elapsedMs) > 45) {
        origin = now - elapsedMs
        for (const animation of animations) { animation.play(); animation.startTime = origin; seeks++ }
      }
      return seeks
    },
    pause() { for (const animation of animations) animation.pause(); origin = null },
    dispose() { for (const animation of animations) animation.cancel() },
  }
}

export function getBattleCanvasScale(width, height, deviceDpr = 1, quality = 'standard') {
  const cap = quality === 'high' ? 1.5 : quality === 'lite' ? .85 : 1
  const pixels = quality === 'high' ? 1100000 : quality === 'lite' ? 360000 : 650000
  return Math.min(deviceDpr, cap, Math.sqrt(pixels / Math.max(1, width * height)))
}
