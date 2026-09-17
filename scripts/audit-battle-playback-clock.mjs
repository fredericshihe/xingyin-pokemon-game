import assert from 'node:assert/strict'
import { createBattleActorPlayback, createBattleFrameClock, createBattleVisualSession, getBattleCanvasScale } from '../src/utils/battleVisualPlayback.js'
import { resolveBattleVfxQuality } from '../src/utils/battleCinematics.js'

const clock = createBattleFrameClock(820)
assert.equal(clock.sample(5000), 0, 'Asset load time cannot consume an attack')
assert.equal(clock.sample(5016), 16)
assert.equal(clock.sample(5516), 56, 'A stalled frame cannot jump past the entire attack')
assert.equal(clock.sample(9000, true), 56)
assert.equal(clock.sample(19000), 56, 'Returning to the tab must resume at the same moment')
assert.equal(clock.sample(19016), 72)
let hits = 0
const playback = createBattleVisualSession({ onImpact: () => { hits++ } })
playback.impact()
assert.equal(hits, 0, 'No damage before a ready, rendered scene')
playback.start()
playback.impact()
playback.impact()
assert.equal(hits, 1, 'Slow frames cannot double-apply damage')
playback.finish()
await playback.finished
playback.cancel()
assert.equal(hits, 1)
const cancelled = createBattleVisualSession({ onImpact: () => { hits++ } })
cancelled.start()
cancelled.cancel()
await assert.rejects(cancelled.finished)
cancelled.impact()
assert.equal(hits, 1, 'Unmount must not apply hidden damage')
assert.equal(resolveBattleVfxQuality({ navigatorLike: { userAgent: 'Macintosh', maxTouchPoints: 5, hardwareConcurrency: 8 }, windowLike: { innerWidth: 1024, devicePixelRatio: 2 } }), 'standard')
console.log('Battle playback: ready gate, stall, visibility, one impact, cancellation, iPadOS quality passed.')

const animations = []
const element = { animate() {
  const animation = { play() {}, pause() {}, cancel() {}, currentTime: 0, startTime: null }
  animations.push(animation)
  return animation
} }
const stage = { animate() {}, clientWidth: 1024, clientHeight: 900,
  querySelector(selector) { return selector.endsWith('player') ? element : { ...element } } }
const actor = createBattleActorPlayback(stage, { durationMs: 1040, attackerSide: 'player', target: 'enemy', phase: 'hit' }, { technique: 'strike', powerLevel: 2 })
for (let frame = 0; frame < 60; frame++) assert.equal(actor.update(frame * 16, 1000 + frame * 16), 2, 'Healthy frames must not seek compositor animations')
assert.equal(actor.update(960, 1400 + 960), 4, 'Stall must synchronize both animations once')
actor.pause()
assert.equal(actor.update(960, 9000), 6, 'Visibility resume must rebase the shared origin')
actor.dispose()
for (const [w,h] of [[390,620],[1024,1050],[2732,2048]]) {
  const scale = getBattleCanvasScale(w,h,3,'standard')
  assert.ok(w*h*scale*scale <= 650001)
  assert.ok(scale <= 1)
}
console.log('Compositor playback: no per-frame seeking; stall/resume synchronization and canvas pixel budget passed.')
