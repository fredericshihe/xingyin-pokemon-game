import assert from 'node:assert/strict'
import { createBattleFrameClock, createBattleVisualSession } from '../src/utils/battleVisualPlayback.js'
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
